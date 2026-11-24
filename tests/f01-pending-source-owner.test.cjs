const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),path=require('node:path'),{createHash,webcrypto}=require('node:crypto');
const load=()=>import('../scripts/extension-e2e/audio-source-owner.mjs');
const clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(x).digest('hex');
const routePath='/live/'+'a'.repeat(32),tuple={documentGeneration:1,routePath};

function fixture(rate=44100,pending=true){
  const spec={id:rate+'/source-owner/'+(pending?'pending-off':'stable'),sampleRate:rate,frequency:1000,inputDbfs:-24,pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:true,equalizer:false};
  const window=c=>({start:Math.ceil(c/(rate/10))*rate/10,end:(Math.ceil(c/(rate/10))+1)*rate/10}),a=window(1024),bPrepared=Math.ceil((a.end+512)/128)*128,b=window(bPrepared+1024),end=Math.ceil(b.end/128)*128;
  const urls=['blob:https://chzzk.naver.com/pending-A','blob:https://chzzk.naver.com/pending-B'];
  const nodes=[7,8].map((sourceEpoch,i)=>({id:i+1,portId:i+1,sourceEpoch,contextId:1,initial:'raw',options:{sourceEpoch,initial:'raw'},producerId:i+2,...(pending?{sourceKey:{currentSrc:urls[i],...tuple}}:{})}));
  const producers=[0,1,2,3].map(id=>({id,portId:id,role:id===0?'program':id===1?'source':'control',channels:id<2?2:5,contextId:1,nodeId:id<2?null:id-1,sourceEpoch:id<2?null:nodes[id-2].sourceEpoch}));
  const inputPlan={spec:clone(spec),urls,sourceSha256:hash('synthetic immutable WAV'),sameBlob:true},ledger=[];
  const event=(type,data={})=>{const e={order:ledger.length+1,type,...data};ledger.push(e);return e;};
  const reply=(nodeId,kind,frame,seq=kind==='prepared'?0:1)=>({nodeId,portId:nodeId,packet:{kind,sourceEpoch:nodes[nodeId-1].sourceEpoch,seq,frame,meterEpoch:0,gain:kind==='completed'?1:null,code:null}});
  const command=(nodeId,seq=1,wanted=true)=>({kind:'configure',sourceEpoch:nodes[nodeId-1].sourceEpoch,seq,wanted,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:true,targetDbfs:-20});
  const send=(nodeId,seq=1,wanted=true)=>{const e=event('send',{nodeId,portId:nodeId,packet:command(nodeId,seq,wanted)});if(pending)event('send-return',{nodeId,portId:nodeId,sourceEpoch:nodes[nodeId-1].sourceEpoch,sendOrder:e.order,contextId:1,elementId:1,sourceHandle:1,sources:1,currentSrc:wanted?urls[nodeId-1]:'',src:urls[wanted?nodeId-1:1],wanted:true,...tuple});return e;};
  event('constructor',{nodeId:1});event('receive',reply(1,'prepared',0));event('source-create',{sourceHandle:1});event('node-connect',{nodeId:1});event('source-connect',{nodeId:1,sourceHandle:1});send(1);event('receive',reply(1,'accepted',128));event('receive',reply(1,'completed',1024));
  const switchOrder=event('switch',{fromNodeId:1,sourceHandle:1,fromUrl:urls[0],toUrl:urls[1],aEnd:a.end}).order;
  if(pending){send(1,2,false);const attempt=event('source-disconnect-attempt',{nodeId:1,portId:1,sourceEpoch:7,sourceHandle:1,contextId:1,elementId:1,connected:true,outputs:true,closed:false,currentSrc:urls[1],src:urls[1],wanted:true,...tuple});event('source-disconnect',{nodeId:1,sourceHandle:1});event('source-disconnect-return',{nodeId:1,attemptOrder:attempt.order});}
  else event('source-disconnect',{nodeId:1,sourceHandle:1});
  event('node-disconnect',{nodeId:1,all:true});event('port-close',{nodeId:1});event('constructor',{nodeId:2});event('receive',reply(2,'prepared',bPrepared));event('node-connect',{nodeId:2});event('source-connect',{nodeId:2,sourceHandle:1});send(2);event('receive',reply(2,'accepted',bPrepared+128));event('receive',reply(2,'completed',bPrepared+1024));
  const stable=(id,w)=>({nodeId:id,window:w,connected:[id],currentSrc:urls[id-1],sources:1,contextState:'running',paused:false,hidden:false,readback:{state:'on',sources:1,wanted:true,gain:1,appliedGain:1}});
  const facts={...(pending?{profile:'pending-off'}:{}),spec:clone(spec),inputPlan,nodes,producers,ledger,sources:1,contextId:1,elementId:1,error:null,switchOrder,stable:{a:stable(1,a),b:stable(2,b)}};
  const records=[];for(const p of producers){const start=p.id===3?bPrepared:0,stop=p.id===2?bPrepared+256:end,chunk=Math.floor(rate/10/128)*128;let seq=1;for(let frame=start;frame<stop;frame+=chunk){const last=Math.min(stop,frame+chunk),count=(last-frame)/128,data=Buffer.alloc((last-frame)*p.channels*4);for(let n=0;n<last-frame;n++)for(let c=0;c<p.channels;c++)data.writeFloatLE(p.channels===5?[-1,1,1,1,0][c]:.01,(n*p.channels+c)*4);records.push({producerId:p.id,portId:p.id,nodeId:p.nodeId,sourceEpoch:p.sourceEpoch,kind:'pcm',packetFrame:frame,start:frame,end:last,firstSequence:seq,lastSequence:seq+count-1,firstReceived:seq,lastReceived:seq+count-1,firstOffset:0,lastOffset:128,channels:p.channels,base64:data.toString('base64')});seq+=count;}}
  const saved=new Map(),directory='output/playwright/installed-extension-PendingUnit',files={root:process.cwd(),readdir:async p=>[{name:p==='dist'?'web':'audio-transition-worklet.js',isDirectory:()=>p==='dist',isFile:()=>p==='dist/web',isSymbolicLink:()=>false}],writeFile:async(file,data,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(file),'overwrite '+file);saved.set(file,Buffer.from(data));},readFile:async(file,encoding)=>{if(!saved.has(file))throw Error('missing '+file);return encoding?saved.get(file).toString(encoding):saved.get(file);},lstat:async file=>saved.has(file)?{isFile:()=>true,size:saved.get(file).length}:null};
  return {spec,facts,records,saved,files,directory,a,b,end,reply,command};
}
function renumber(f){const l=f.facts.ledger,orders=new Map(l.map((e,i)=>[e.order,i+1]));for(const e of l){if(e.sendOrder!==undefined)e.sendOrder=orders.get(e.sendOrder);if(e.attemptOrder!==undefined)e.attemptOrder=orders.get(e.attemptOrder);}l.forEach((e,i)=>e.order=i+1);f.facts.switchOrder=l.find(e=>e.type==='switch').order;}
const off=f=>f.facts.ledger.find(e=>e.type==='send'&&e.nodeId===1&&e.packet.seq===2);
const receipt=f=>f.facts.ledger.find(e=>e.type==='send-return'&&e.sendOrder===off(f)?.order);
const attempt=f=>f.facts.ledger.find(e=>e.type==='source-disconnect-attempt');
async function retained(f=fixture()){
  const m=await load(),archive=m.createSourceOwnerArchive(f.files,f.directory,f.spec);for(const r of f.records)await archive.append(r);
  const proof=archive.proof(f.facts);await f.files.writeFile(f.directory+'/source-owner-proof.json',JSON.stringify(proof),{flag:'wx'});await f.files.writeFile(f.directory+'/input-plan.json',JSON.stringify(f.facts.inputPlan),{flag:'wx'});return {...f,archive,proof};
}
const saveProof=f=>f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(f.proof)));

test('pending OFF selects only three frozen callers through the existing argument parser',async()=>{
  const m=await load(),{selectProductCase,parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  assert.equal(m.SOURCE_PENDING_OFF_CASES.length,3);assert.equal(Object.isFrozen(m.SOURCE_PENDING_OFF_CASES),true);
  for(const rate of [44100,48000,96000]){const spec=selectProductCase(rate+'/source-owner/pending-off');assert.deepEqual(spec,fixture(rate).spec);assert.equal(spec,m.SOURCE_PENDING_OFF_CASES.find(s=>s.sampleRate===rate));assert.equal(Object.isFrozen(spec),true);assert.deepEqual(parseProductAudioArgs(['--run-id=PendingUnit','--case='+spec.id]),{runId:'PendingUnit',caseId:spec.id});assert.throws(()=>parseProductAudioArgs(['--run-id=PendingUnit','--case='+spec.id,'--component-witness']));}
  for(const id of ['44100/source-owner/pending','48000/source-owner/pending-off/extra','192000/source-owner/pending-off'])assert.throws(()=>selectProductCase(id));
});

for(const rate of [44100,48000,96000])test('pending OFF '+rate+' reconstructs only main flight from original port returns',async()=>{
  const f=await retained(fixture(rate)),m=await load(),r=await m.readSourceOwnerProof(f.files,f.directory,f.spec),a=r.assessment;
  assert.equal(f.proof.schema,'f01-source-pending-off-proof-v1');assert.equal(a.pendingFlight,'MAIN_RECONSTRUCTED');assert.equal(a.ownership,'CONSISTENT');assert.equal(a.formation,'FORMED');assert.deepEqual(a.windows,{a:f.a,b:f.b});
  for(const key of ['waveQuality','exclusiveNativeOwnership','native7Witness','native8Witness','lateReplyWitness'])assert.equal(a[key],'UNASSESSED',key);
  assert.equal(a.overallQualification,false);assert.equal(a.lateReplyObservation,'NOT_OBSERVED');assert.equal(a.frameOrigin,'UNPROVEN');assert.equal(Object.hasOwn(a,'unsentPending'),false);
  assert.deepEqual(m.assessSourceOwnerProof(f.proof,f.spec),a);assert.ok(f.proof.pcmBytes<=96*1024*1024);
});

for(const rate of [44100,48000,96000])for(const kind of ['no-off','ACK-first'])test('pending OFF '+rate+' '+kind+' remains unobserved without relabeling stable ownership',async()=>{
  const f=fixture(rate),l=f.facts.ledger;
  if(kind==='no-off'){const e=off(f),r=receipt(f);f.facts.ledger=l.filter(x=>x!==e&&x!==r);}
  else {const at=l.indexOf(attempt(f));l.splice(at,0,{order:1000,type:'receive',...f.reply(1,'accepted',f.a.end+128,2)});}
  renumber(f);const r=await retained(f),m=await load(),a=(await m.readSourceOwnerProof(r.files,r.directory,r.spec)).assessment;
  assert.equal(a.pendingFlight,'NOT_OBSERVED');assert.equal(a.ownership,'CONSISTENT');assert.equal(a.overallQualification,false);
});

const corruptions={
  'initial-normal-return-missing':f=>{const order=f.facts.ledger.find(e=>e.type==='send'&&e.nodeId===1).order;f.facts.ledger=f.facts.ledger.filter(e=>!(e.type==='send-return'&&e.sendOrder===order));},
  'B-normal-return-missing':f=>{f.facts.ledger=f.facts.ledger.filter(e=>!(e.type==='send-return'&&e.nodeId===2));},
  'initial-return-wrong-source':f=>{f.facts.ledger.find(e=>e.type==='send-return'&&e.nodeId===1).currentSrc=f.facts.inputPlan.urls[1];},
  'B-return-wrong-source':f=>{f.facts.ledger.find(e=>e.type==='send-return'&&e.nodeId===2).currentSrc=f.facts.inputPlan.urls[0];},
  'missing-normal-return':f=>{f.facts.ledger=f.facts.ledger.filter(e=>e!==receipt(f));},
  'duplicate-normal-return':f=>{f.facts.ledger.splice(f.facts.ledger.indexOf(receipt(f))+1,0,{...clone(receipt(f)),order:1000});},
  'return-wrong-port':f=>{receipt(f).portId=2;},'return-wrong-epoch':f=>{receipt(f).sourceEpoch=8;},
  'return-wrong-node':f=>{receipt(f).nodeId=2;},'return-wrong-send':f=>{receipt(f).sendOrder=f.facts.ledger.find(e=>e.type==='send').order;},
  'B-return-borrowed-for-OFF':f=>{receipt(f).sendOrder=f.facts.ledger.find(e=>e.type==='send'&&e.nodeId===2).order;},
  'return-before-send':f=>{const r=receipt(f),l=f.facts.ledger;l.splice(l.indexOf(r),1);l.splice(l.indexOf(off(f)),0,r);},
  'raw-intent-false':f=>{receipt(f).wanted=false;},'raw-currentSrc-not-empty':f=>{receipt(f).currentSrc=f.facts.inputPlan.urls[0];},
  'raw-src-not-B':f=>{receipt(f).src=f.facts.inputPlan.urls[0];},'raw-document-change':f=>{receipt(f).documentGeneration=2;},
  'raw-route-change':f=>{receipt(f).routePath='/live/'+'b'.repeat(32);},'raw-source-count':f=>{receipt(f).sources=2;},
  'raw-context-change':f=>{receipt(f).contextId=2;},'raw-element-change':f=>{receipt(f).elementId=2;},'raw-source-handle':f=>{receipt(f).sourceHandle=2;},
  'OFF-wrong-port':f=>{off(f).portId=2;},'OFF-wrong-epoch':f=>{off(f).packet.sourceEpoch=8;},'OFF-changed-gain':f=>{off(f).packet.gain=.5;},
  'OFF-changed-EQ':f=>{off(f).packet.eq[0]=1;},'OFF-changed-normalizer':f=>{off(f).packet.normalizer=true;},'OFF-changed-dynamics':f=>{off(f).packet.dynamics=false;},
  'OFF-changed-target':f=>{off(f).packet.targetDbfs=-12;},'OFF-wrong-sequence':f=>{off(f).packet.seq=3;},
  'binding-key-retagged':f=>{f.facts.nodes[0].sourceKey.currentSrc=f.facts.inputPlan.urls[1];},
  'binding-document-change':f=>{f.facts.nodes[0].sourceKey.documentGeneration=2;},
  'attempt-not-B':f=>{attempt(f).currentSrc=f.facts.inputPlan.urls[0];},'attempt-wrong-port':f=>{attempt(f).portId=2;},
  'attempt-wrong-epoch':f=>{attempt(f).sourceEpoch=8;},'attempt-disconnected':f=>{attempt(f).connected=false;},
  'attempt-no-outputs':f=>{attempt(f).outputs=false;},'attempt-closed':f=>{attempt(f).closed=true;},
  'attempt-document-change':f=>{attempt(f).documentGeneration=2;},'attempt-intent-change':f=>{attempt(f).wanted=false;},
  'missing-disconnect-return':f=>{f.facts.ledger=f.facts.ledger.filter(e=>e.type!=='source-disconnect-return');},
  'disconnect-return-transplant':f=>{f.facts.ledger.find(e=>e.type==='source-disconnect-return').attemptOrder=off(f).order;},
  'post-throws-after-send':f=>{const r=receipt(f);r.type='send-throw';},
  'disconnect-throw':f=>{f.facts.ledger.find(e=>e.type==='source-disconnect-return').type='source-disconnect-throw';},
  'prior-disconnect-attempt':f=>{const l=f.facts.ledger;l.splice(l.indexOf(off(f)),0,{...clone(attempt(f)),order:1000});},
  'failed-before-handoff':f=>{const l=f.facts.ledger;l.splice(l.indexOf(attempt(f)),0,{order:1000,type:'receive',...f.reply(1,'failed',f.a.end+128,2)});},
  'rejected-before-handoff':f=>{const l=f.facts.ledger;l.splice(l.indexOf(attempt(f)),0,{order:1000,type:'receive',...f.reply(1,'rejected',f.a.end+128,2)});},
  'malformed-before-handoff':f=>{const l=f.facts.ledger;l.splice(l.indexOf(attempt(f)),0,{order:1000,type:'receive',...f.reply(1,'unknown',f.a.end+128,2)});},
  'retire-before-handoff':f=>{const l=f.facts.ledger;l.splice(l.indexOf(attempt(f)),0,{order:1000,type:'send',nodeId:1,portId:1,packet:{kind:'retire',sourceEpoch:7,seq:3}});},
  'old-port-transplant':f=>{const e=f.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===2&&e.packet.kind==='accepted');e.portId=1;},
};
for(const type of ['source-disconnect','node-disconnect','port-close'])corruptions['unpaired-B-'+type]=f=>{f.facts.ledger.push({order:1000,type,nodeId:2,sourceHandle:1,all:true});};
corruptions['late-A-frame-over-horizon']=f=>{f.facts.ledger.push({order:1000,type:'receive',...f.reply(1,'accepted',20*f.spec.sampleRate+128,2)});};
for(const [name,mutate]of Object.entries(corruptions))test('pending OFF refuses '+name+' rather than borrowing a different history',async()=>{
  const f=fixture();mutate(f);renumber(f);const r=await retained(f),m=await load();await assert.rejects(()=>m.readSourceOwnerProof(r.files,r.directory,r.spec),/source-owner/);
});

test('pending OFF preserves the strict existing stable reader and refuses schema or caller transplants',async()=>{
  const m=await load(),s=await retained(fixture(44100,false)),old=await m.readSourceOwnerProof(s.files,s.directory,s.spec);assert.equal(old.assessment.pendingFlight,'UNASSESSED');
  const f=await retained(),original=clone(f.proof);for(const fault of ['schema','caller','input-plan']){f.proof=clone(original);if(fault==='schema')f.proof.schema='f01-source-owner-proof-v1';if(fault==='caller')f.proof.spec.gain=2;if(fault==='input-plan')f.proof.facts.inputPlan.sourceSha256=hash('transplanted input');saveProof(f);await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,f.spec),/source-owner/,fault);}
  const p=fixture(),a=m.createSourceOwnerArchive(p.files,p.directory,p.spec);for(const r of p.records)await a.append(r);const donor=a.proof(p.facts);donor.spec=clone(s.spec);donor.facts.spec=clone(s.spec);donor.facts.inputPlan.spec=clone(s.spec);donor.schema='f01-source-owner-proof-v1';await assert.rejects(async()=>m.assessSourceOwnerProof(donor,s.spec),/source-owner/);
});

test('pending OFF stored replay checks bytes and producer metadata after a self-consistent rehash',async()=>{
  const f=await retained(),m=await load(),original=clone(f.proof),row=f.proof.rows.find(r=>r.producerId===2),bytes=Buffer.from(f.saved.get(row.file));bytes[0]^=1;f.saved.set(row.file,bytes);await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,f.spec),/artifact-hash/);
  row.sha256=hash(bytes);row.sourceEpoch=8;saveProof(f);await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,f.spec),/source-owner/);
  f.proof=original;const a=f.proof.rows.find(r=>r.producerId===2),b=f.proof.rows.find(r=>r.producerId===3);a.file=b.file;a.sha256=b.sha256;a.bytes=b.bytes;saveProof(f);await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,f.spec),/source-owner/);
});

async function probeFixture(rate=44100){
  const m=await load(),nodes=[],contexts=[],blobs=new Map(),postReturn={},disconnectReturn={},postError=Error('native post failure'),disconnectError=Error('native disconnect failure');let posted=null,postThrows=false,disconnectThrows=false,sourceCalls=0,nativeSource=null;
  class Context{constructor(o){this.sampleRate=o.sampleRate;this.state='running';this.currentTime=0;this.destination={};contexts.push(this);}audioWorklet={addModule:async()=>{}};createMediaElementSource(){sourceCalls++;nativeSource={connect(){},disconnect(...args){if(disconnectThrows)throw disconnectError;return disconnectReturn;}};return nativeSource;}}
  class Node{constructor(context,name,options){Object.assign(this,{context,name,options});const handlers=[];this.port={onmessage:null,postMessage(...args){posted=args;if(postThrows)throw postError;return postReturn;},addEventListener(_t,h){handlers.push(h);},start(){},close(){}};this.receive=data=>{handlers.forEach(h=>h({data}));this.port.onmessage?.({data});};nodes.push(this);}connect(){}disconnect(){}}
  let holdLoad=false;const waiting=[],video={src:'',currentSrc:'',muted:false,volume:1,paused:false,ended:false,loop:false,playbackRate:1,currentTime:1,addEventListener(t,h){if(t==='loadeddata'){if(holdLoad)waiting.push(h);else queueMicrotask(()=>{video.currentSrc=video.src;h();});}},removeEventListener(){},play:async()=>{},pause(){}};
  const runtime={config:{},media:{context:clone(tuple)},mediaCurrent:()=>true,audio:{configure(){},setGain(){},setEnabled:async()=> 'off',getReadback:()=>({state:'on',sources:sourceCalls,wanted:true,gain:1,appliedGain:1})}};
  const window={AudioContext:Context,AudioWorkletNode:Node,crypto:webcrypto,location:{pathname:routePath}},document={hidden:false,querySelector:s=>s==='video'?video:null};window[Symbol.for('cheese-knife.runtime.v1')]=runtime;let id=0;
  await vm.runInNewContext('('+m.installSourceOwnerProbe.toString()+')('+JSON.stringify({sampleRate:rate,profile:'pending-off'})+')',{window,document,AudioContext:Context,AudioWorkletNode:Node,Float32Array,Uint8Array,DataView,ArrayBuffer,Map,Set,Blob,URL:{createObjectURL:blob=>{const url='blob:https://chzzk.naver.com/p'+(++id);blobs.set(url,blob);return url;},revokeObjectURL(){}},Symbol,TextEncoder,crypto:webcrypto,performance:{now:()=>0},btoa:s=>Buffer.from(s,'binary').toString('base64')});
  const probe=window[Symbol.for('cheese-knife.source-owner-probe.v1')],context=contexts[0];void context.destination;
  return {probe,nodes,window,document,video,context,runtime,postReturn,disconnectReturn,postError,disconnectError,posted:()=>posted,throwPost:v=>{postThrows=v;},throwDisconnect:v=>{disconnectThrows=v;},holdLoad:()=>{holdLoad=true;},releaseLoad:()=>{video.currentSrc=video.src;waiting.splice(0).forEach(h=>h());}};
}

test('pending OFF actual probe preserves post result packet transfer list and original exception identity',async()=>{
  const f=await probeFixture(),spec=fixture().spec;await f.probe.action({kind:'prepare',spec});const a=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}}),source=f.context.createMediaElementSource(f.video);a.connect({},0);source.connect(a);
  const packet=fixture().command(1),transfers=[];assert.equal(a.port.postMessage(packet,transfers),f.postReturn);assert.equal(f.posted()[0],packet);assert.equal(f.posted()[1],transfers);
  let facts=await f.probe.action({kind:'facts'}),sent=facts.ledger.find(e=>e.type==='send'),returned=facts.ledger.find(e=>e.type==='send-return');assert.equal(returned.sendOrder,sent.order);assert.ok(returned.order>sent.order);assert.equal(Object.hasOwn(returned,'packet'),false);assert.equal(returned.portId,1);assert.equal(returned.sourceEpoch,7);assert.equal(returned.currentSrc,f.video.currentSrc);assert.equal(returned.wanted,true);assert.deepEqual(clone(facts.nodes[0].sourceKey),{currentSrc:f.video.currentSrc,...tuple});
  f.throwPost(true);assert.throws(()=>a.port.postMessage({...packet,seq:2}),e=>e===f.postError);facts=await f.probe.action({kind:'facts'});assert.equal(facts.ledger.filter(e=>e.type==='send-return').length,1);const failed=facts.ledger.find(e=>e.type==='send-throw');assert.equal(failed.sendOrder,facts.ledger.filter(e=>e.type==='send').at(-1).order);assert.equal(failed.portId,1);
});

test('pending OFF actual probe records every bound disconnect attempt including disconnected and thrown calls',async()=>{
  const f=await probeFixture();await f.probe.action({kind:'prepare',spec:fixture().spec});const a=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}}),source=f.context.createMediaElementSource(f.video);a.connect({},0);source.connect(a);const old=f.video.currentSrc;
  f.holdLoad();const switching=f.probe.action({kind:'switch',aEnd:8820});f.releaseLoad();await switching;assert.notEqual(f.video.currentSrc,old);
  assert.equal(source.disconnect(a),f.disconnectReturn);assert.equal(source.disconnect(a),f.disconnectReturn);f.throwDisconnect(true);assert.throws(()=>source.disconnect(a),e=>e===f.disconnectError);
  const facts=await f.probe.action({kind:'facts'}),attempts=facts.ledger.filter(e=>e.type==='source-disconnect-attempt'),returns=facts.ledger.filter(e=>e.type==='source-disconnect-return'),throws=facts.ledger.filter(e=>e.type==='source-disconnect-throw');assert.equal(attempts.length,3);assert.equal(returns.length,2);assert.equal(throws.length,1);assert.equal(attempts[0].connected,true);assert.equal(attempts[1].connected,false);assert.equal(attempts[2].connected,false);assert.equal(attempts[0].outputs,true);assert.equal(attempts[0].closed,false);assert.equal(attempts[0].currentSrc,f.video.currentSrc);assert.equal(attempts[0].documentGeneration,1);assert.equal(attempts[0].routePath,routePath);assert.equal(returns[0].attemptOrder,attempts[0].order);assert.equal(throws[0].attemptOrder,attempts[2].order);assert.equal(facts.ledger.filter(e=>e.type==='source-disconnect').length,1);
});

test('pending OFF actual probe records every original binding on no-argument disconnect',async()=>{
  const f=await probeFixture();await f.probe.action({kind:'prepare',spec:fixture().spec});const a=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}}),source=f.context.createMediaElementSource(f.video);source.connect(a);source.disconnect(a);a.disconnect();a.port.close();const b=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:8,initial:'raw'}});b.connect({},0);source.connect(b);assert.equal(source.disconnect(),f.disconnectReturn);
  const facts=await f.probe.action({kind:'facts'}),attempts=facts.ledger.filter(e=>e.type==='source-disconnect-attempt');assert.equal(attempts.length,3);assert.equal(attempts[1].nodeId,1);assert.equal(attempts[1].connected,false);assert.equal(attempts[1].closed,true);assert.equal(attempts[2].nodeId,2);assert.equal(attempts[2].connected,true);assert.equal(facts.ledger.filter(e=>e.type==='source-disconnect-return').length,3);
});

function scenarioFixture(rate=44100,mutate){
  const f=fixture(rate);if(mutate){mutate(f);renumber(f);}const module=Buffer.from('synthetic packaged transition module'),calls=[];let stage=0,stopped=false,switches=0;
  const current=()=>{const x=clone(f.facts),id=stage===2?2:1;x.nodes=x.nodes.slice(0,id);x.producers=x.producers.slice(0,id+2);if(stage!==2)x.ledger=x.ledger.slice(0,x.ledger.findIndex(e=>e.type==='switch'));x.connected=[id];x.currentSrc=x.inputPlan.urls[id-1];x.contextState='running';x.paused=false;x.hidden=false;x.moduleLoads=['chrome-extension://actual/web/audio-transition-worklet.js'];x.readback=clone(x.stable[id===1?'a':'b'].readback);delete x.stable;return x;};
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},waitForTimeout:async()=>{},locator:()=>({click:async()=>{stage=1;}}),evaluate:async(fn,arg)=>{
    if(fn.name==='installSourceOwnerProbe'){assert.deepEqual(arg,{sampleRate:rate,profile:'pending-off'});return;}calls.push(clone(arg));
    if(arg.kind==='prepare'){assert.deepEqual(arg.spec,f.spec);return clone(f.facts.inputPlan);}if(arg.kind==='facts')return current();if(arg.kind==='stop'){stopped=true;return current();}if(arg.kind==='switch'){assert.equal(arg.aEnd,f.a.end);assert.equal(++switches,1);stage=2;return current();}
    if(arg.kind==='drain'){if(!stage||stopped&&!arg.failure)return [];const pos=stage===2?f.end:Math.ceil(f.a.end/128)*128,out=[];for(const p of f.facts.producers.filter(p=>p.id<stage+2)){const base=p.id===3?f.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===2&&e.packet.kind==='prepared').packet.frame:0,start=base+arg.cursors[p.id]*128;let end=Math.min(pos,start+Math.floor(rate/10/128)*128);if(arg.endFrame!==undefined)end=Math.min(end,Math.ceil(arg.endFrame/128)*128);if(end<=start)continue;const empty=p.id===2&&start>=f.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===2&&e.packet.kind==='prepared').packet.frame+256,count=(end-start)/128,data=Buffer.alloc((end-start)*p.channels*4);for(let n=0;n<end-start;n++)for(let c=0;c<p.channels;c++)data.writeFloatLE(p.channels===5?[-1,1,1,1,0][c]:.01,(n*p.channels+c)*4);out.push({producerId:p.id,portId:p.id,nodeId:p.nodeId,sourceEpoch:p.sourceEpoch,kind:empty?'empty':'pcm',packetFrame:start,start,end,firstSequence:arg.cursors[p.id]+1,lastSequence:arg.cursors[p.id]+count,firstReceived:arg.cursors[p.id]+1,lastReceived:arg.cursors[p.id]+count,firstOffset:0,lastOffset:128,channels:empty?0:p.channels,...(!empty?{base64:data.toString('base64')}:{})});}return out;}
    throw Error('unexpected pending owner action '+arg.kind);
  }};
  const read=f.files.readFile;f.files.readFile=async(file,encoding)=>{const bytes=file.endsWith('audio-transition-worklet.js')?module:file.startsWith('tests/')?Buffer.from('<html></html>'):null;return bytes?(encoding?bytes.toString(encoding):bytes):read(file,encoding);};f.files.ensureDirectory=async()=>{};
  const input={context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async()=>Array.from(module)},extensionId:'actual',artifactPath:path.join(f.files.root,f.directory)};
  return {...f,input,calls,module,execute:async()=>{const m=await load();return m.runProductSourceOwnerScenario(input,f.files,{dist:path.join(f.files.root,'dist')},f.spec);},switches:()=>switches};
}
async function dispatcher(f){
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),source={sourceSha256:'pending-unit'},candidate={root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  return runProductAudio({runId:'PendingUnit',caseId:f.spec.id},{platform:'win32',files:f.files,attest:async()=>source,verifyCandidate:async()=>candidate,execute:async options=>{await options.dependencies.verifyCandidate('PendingUnit',process.cwd(),{retainEvidence:true});const result=await options.dependencies.mediaScenario(f.input);await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('synthetic trace'),{flag:'wx'});return {...result,ok:true,profileRetained:true,candidateRetained:true,source,after:source,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}};}});
}

for(const rate of [44100,48000,96000])test('pending OFF '+rate+' dispatcher consumes actual scenario and rereads its Map-backed proof',async()=>{
  const f=scenarioFixture(rate),m=await load(),r=(await dispatcher(f)).audioProduct;
  assert.equal(r.schema,'f01-source-pending-off-observation-v1');assert.equal(r.scope,f.spec.id);assert.equal(r.passed,true);assert.equal(r.qualityAssessed,false);assert.equal(r.ownership.pendingFlight,'MAIN_RECONSTRUCTED');assert.equal(r.ownership.overallQualification,false);assert.equal(f.switches(),1);await m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec);
  assert.deepEqual(JSON.parse(f.saved.get(f.directory+'/input-plan.json')).spec,f.spec);assert.equal(JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json')).schema,'f01-source-pending-off-proof-v1');
});

test('pending OFF scenario retains NOT_OBSERVED when the natural OFF is absent',async()=>{
  const f=scenarioFixture(44100,x=>{const s=off(x),r=receipt(x);x.facts.ledger=x.facts.ledger.filter(e=>e!==s&&e!==r);}),r=(await f.execute()).audioProduct,m=await load();assert.equal(r.ownership.pendingFlight,'NOT_OBSERVED');assert.equal(r.qualityAssessed,false);await m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec);
});

test('pending OFF saved dispatcher evidence refuses a metadata-only or producer transplant',async()=>{
  const f=scenarioFixture(),m=await load(),report=(await f.execute()).audioProduct,original=Buffer.from(f.saved.get(f.directory+'/source-owner-proof.json'));
  for(const fault of ['claim','schema','epoch','return','row','module']){const r=clone(report),p=JSON.parse(original);if(fault==='claim')r.ownership.pendingFlight='NOT_OBSERVED';if(fault==='schema')r.schema='f01-source-owner-observation-v1';if(fault==='epoch')p.facts.nodes[0].sourceEpoch=8;if(fault==='return')p.facts.ledger.find(e=>e.type==='send-return'&&e.sourceEpoch===7).portId=2;if(fault==='row')p.rows.find(e=>e.producerId===2).portId=3;if(fault==='module')r.module.fetchedSha256=hash('other module');f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/source-owner/,fault);}
});

test('pending OFF actual VM probe feeds dispatcher scenario writer and saved reread without facts adapters',async()=>{
  const m=await load(),f=fixture(),p=await probeFixture(),module=Buffer.from('synthetic packaged transition module'),sequences=new Map();let stage=0,a,source,switches=0;
  const capture=(id,start,end)=>{const node=p.nodes.find(n=>n.name==='source-owner-capture'&&n.options.processorOptions.producerId===id),channels=id<2?2:5;assert.ok(node);for(let frame=start;frame<end;frame+=128){const producerSequence=(sequences.get(id)??0)+1;sequences.set(id,producerSequence);node.receive({producerId:id,producerSequence,frame,samples:Array.from({length:channels},(_,c)=>new Float32Array(128).fill(channels===5?[-1,1,1,1,0][c]:.01))});}};
  const make=(id,prepared)=>{const node=new p.window.AudioWorkletNode(p.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:id===1?7:8,initial:'raw'}});node.receive(f.reply(id,'prepared',prepared).packet);return node;};
  const on=node=>{const id=node===a?1:2,prepared=id===1?0:f.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===2&&e.packet.kind==='prepared').packet.frame;node.connect(p.context.destination,0);source.connect(node);node.port.postMessage(f.command(id));node.receive(f.reply(id,'accepted',prepared+128).packet);node.receive(f.reply(id,'completed',prepared+1024).packet);};
  const firstEnd=Math.ceil(f.a.end/128)*128,bPrepared=f.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===2&&e.packet.kind==='prepared').packet.frame,add=p.video.addEventListener.bind(p.video);
  p.video.addEventListener=(type,handler,...rest)=>add(type,type!=='loadeddata'?handler:()=>{
    if(stage===1){assert.equal(++switches,1);p.video.currentSrc='';a.port.postMessage(f.command(1,2,false));p.video.currentSrc=p.video.src;source.disconnect(a);a.disconnect();a.port.close();const b=make(2,bPrepared);on(b);for(const id of [0,1])capture(id,firstEnd,f.end);capture(3,bPrepared,f.end);stage=2;}
    handler();
  },...rest);
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},waitForTimeout:async()=>{},locator:()=>({click:async()=>{assert.equal(stage,0);await p.context.audioWorklet.addModule('chrome-extension://actual/web/audio-transition-worklet.js');a=make(1,0);source=p.context.createMediaElementSource(p.video);on(a);for(const id of [0,1,2])capture(id,0,firstEnd);stage=1;}}),evaluate:async(fn,arg)=>{if(fn.name==='installSourceOwnerProbe'){assert.deepEqual(arg,{sampleRate:44100,profile:'pending-off'});return;}return clone(await p.probe.action(arg));}};
  const read=f.files.readFile;f.files.readFile=async(file,encoding)=>{const bytes=file.endsWith('audio-transition-worklet.js')?module:file.startsWith('tests/')?Buffer.from('<html></html>'):null;return bytes?(encoding?bytes.toString(encoding):bytes):read(file,encoding);};f.files.ensureDirectory=async()=>{};
  const input={context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async()=>Array.from(module)},extensionId:'actual',artifactPath:path.join(f.files.root,f.directory)},report=(await dispatcher({...f,input})).audioProduct;
  assert.equal(switches,1);assert.equal(report.ownership.pendingFlight,'MAIN_RECONSTRUCTED');assert.equal(report.qualityAssessed,false);await m.verifySourceOwnerEvidence(f.files,f.directory,report,f.spec);
  const retainedProof=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json')),events=retainedProof.facts.ledger;assert.equal(events.filter(e=>e.type==='source-disconnect-attempt').length,1);assert.equal(events.filter(e=>e.type==='send-return').length,3);assert.deepEqual(retainedProof.facts.nodes[0].sourceKey,{currentSrc:retainedProof.facts.inputPlan.urls[0],...tuple});assert.equal((await m.readSourceOwnerProof(f.files,f.directory,f.spec)).assessment.pendingFlight,'MAIN_RECONSTRUCTED');
});

test('pending OFF keeps late original-port replies separate from unproven Native witnesses',async()=>{
  const f=fixture();f.facts.ledger.push({order:1000,type:'receive',...f.reply(1,'accepted',f.end+128,2)},{order:1001,type:'receive',...f.reply(1,'completed',f.end+256,2)});renumber(f);
  const r=await retained(f),m=await load(),a=(await m.readSourceOwnerProof(r.files,r.directory,r.spec)).assessment;
  assert.equal(a.pendingFlight,'MAIN_RECONSTRUCTED');assert.equal(a.lateReplyObservation,'OBSERVED');assert.equal(a.lateReplyWitness,'UNASSESSED');assert.equal(a.overallQualification,false);
  assert.equal(r.proof.facts.ledger.at(-1).portId,1);assert.equal(r.proof.facts.ledger.at(-1).packet.sourceEpoch,7);
});
