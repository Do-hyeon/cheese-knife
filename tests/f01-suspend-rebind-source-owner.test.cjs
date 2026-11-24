const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),path=require('node:path'),{createHash,webcrypto}=require('node:crypto');
const load=()=>import('../scripts/extension-e2e/audio-source-owner.mjs');
const clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(x).digest('hex');
const routePath='/live/'+'a'.repeat(32),tuple={documentGeneration:1,routePath};

function naturalFixture(rate=44100,pending=true){
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

const method='controlled-public-suspend';
function fixture(){
 const f=naturalFixture(),l=f.facts.ledger;f.spec.id='44100/source-owner/suspend-rebind';f.facts.spec=clone(f.spec);f.facts.profile='suspend-rebind';f.facts.stimulus={method,status:'APPLIED'};f.facts.inputPlan.spec=clone(f.spec);f.facts.inputPlan.formationMethod=method;
 let id=10000;const common={nodeId:1,portId:1,sourceEpoch:7,contextId:1,elementId:1,sourceHandle:1,method,...tuple},mark=(type,data={})=>({order:++id,type,...common,...data});
 const snapshot={...common,currentSrc:f.facts.inputPlan.urls[1],src:f.facts.inputPlan.urls[1],sources:1,connected:true,outputs:true,closed:false,videoConnected:true,selected:true,mediaCurrent:true,eligible:true,hidden:false,contextState:'running',readback:{state:'on',sources:1,wanted:true,gain:1,appliedGain:1}};
 const send=l.find(e=>e.type==='send'&&e.packet.seq===2),receipt=l.find(e=>e.sendOrder===send.order);receipt.currentSrc=f.facts.inputPlan.urls[1];
 l.splice(l.indexOf(send),0,mark('stimulus-arm',{aEnd:f.a.end}),mark('stimulus-enter',snapshot),mark('stimulus-restored'),mark('suspend-call'));
 l.splice(l.indexOf(receipt)+1,0,mark('suspend-return'),mark('configure-call'));
 for(const type of ['node-disconnect','port-close']){const e=l.find(e=>e.type===type);const attempt=mark(type+'-attempt');l.splice(l.indexOf(e),0,attempt);l.splice(l.indexOf(e)+1,0,mark(type+'-return',{attemptOrder:attempt.order}));}
 l.splice(l.findIndex(e=>e.type==='constructor'&&e.nodeId===2),0,mark('configure-return'));renumber(f);return f;
}
const off=f=>f.facts.ledger.find(e=>e.type==='send'&&e.nodeId===1&&e.packet.seq===2);
const receipt=f=>f.facts.ledger.find(e=>e.type==='send-return'&&e.sendOrder===off(f)?.order);
async function retained(f=fixture()){
 const m=await load(),archive=m.createSourceOwnerArchive(f.files,f.directory,f.spec);for(const r of f.records)await archive.append(r);const proof=archive.proof(f.facts);await f.files.writeFile(f.directory+'/source-owner-proof.json',JSON.stringify(proof),{flag:'wx'});await f.files.writeFile(f.directory+'/input-plan.json',JSON.stringify(f.facts.inputPlan),{flag:'wx'});return {...f,archive,proof};
}
const saveProof=f=>f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(f.proof)));
test('suspend-rebind selects exactly one frozen 44100 caller and refuses option or Fs expansion',async()=>{
 const m=await load(),p=await import('../scripts/extension-e2e/audio-product.mjs');assert.equal(m.SOURCE_SUSPEND_REBIND_CASES?.length,1);const spec=p.selectProductCase(fixture().spec.id);assert.deepEqual(spec,fixture().spec);assert.ok(Object.isFrozen(spec));assert.ok(Object.isFrozen(m.SOURCE_SUSPEND_REBIND_CASES));assert.equal(p.parseProductAudioArgs(['--run-id=SuspendUnit','--case='+spec.id]).caseId,spec.id);
 for(const id of ['48000/source-owner/suspend-rebind','96000/source-owner/suspend-rebind',spec.id+'/extra'])assert.throws(()=>p.selectProductCase(id));assert.throws(()=>p.parseProductAudioArgs(['--run-id=SuspendUnit','--case='+spec.id,'--component-witness']));
});
test('suspend-rebind original receipts and stimulus replay reconstruct only main flight',async()=>{
 const f=await retained(),m=await load(),r=await m.readSourceOwnerProof(f.files,f.directory,f.spec);assert.equal(f.proof.schema,'f01-source-suspend-rebind-proof-v1');assert.equal(r.assessment.formationMethod,method);assert.equal(r.assessment.pendingFlight,'MAIN_RECONSTRUCTED');assert.equal(r.assessment.overallQualification,false);assert.equal(r.assessment.lateReplyWitness,'UNASSESSED');assert.equal(r.assessment.waveQuality,'UNASSESSED');assert.deepEqual(r.assessment.windows,{a:f.a,b:f.b});
});
const changes={
 'missing-arm':f=>{f.facts.ledger=f.facts.ledger.filter(e=>e.type!=='stimulus-arm');},
 'missing-restoration':f=>{f.facts.ledger=f.facts.ledger.filter(e=>e.type!=='stimulus-restored');},
 'duplicate-stimulus':f=>{f.facts.ledger.push({...clone(f.facts.ledger.find(e=>e.type==='suspend-call')),order:20000});},
 'delegate-before-suspend':f=>{const l=f.facts.ledger,e=l.find(e=>e.type==='configure-call');l.splice(l.indexOf(e),1);l.splice(l.findIndex(e=>e.type==='suspend-call'),0,e);},
 'release-before-delegate':f=>{const l=f.facts.ledger,e=l.find(e=>e.type==='configure-call');l.splice(l.indexOf(e),1);l.splice(l.findIndex(e=>e.type==='port-close'),0,e);},
 'entry-port':f=>{f.facts.ledger.find(e=>e.type==='stimulus-enter').portId=2;},
 'entry-epoch':f=>{f.facts.ledger.find(e=>e.type==='stimulus-enter').sourceEpoch=8;},
 'entry-document':f=>{f.facts.ledger.find(e=>e.type==='stimulus-enter').documentGeneration++;},
 'entry-closed':f=>{f.facts.ledger.find(e=>e.type==='stimulus-enter').closed=true;},
 'entry-stale-readback':f=>{f.facts.ledger.find(e=>e.type==='stimulus-enter').readback.wanted=false;},
 'natural-blank-source':f=>{receipt(f).currentSrc='';},
 'main-ACK-before-clear':f=>{const l=f.facts.ledger;l.splice(l.findIndex(e=>e.type==='configure-call'),0,{order:20000,type:'receive',...f.reply(1,'accepted',f.a.end+128,2)});},
 'retagged-natural':f=>{f.facts.ledger=f.facts.ledger.filter(e=>!e.type.startsWith('stimulus-')&&!e.type.startsWith('suspend-')&&!e.type.startsWith('configure-'));},
 'wrong-method':f=>{f.facts.stimulus.method='natural';},
 'plan-method':f=>{f.facts.inputPlan.formationMethod='natural';},
 'oversized-marker':f=>{f.facts.ledger.find(e=>e.type==='stimulus-arm').padding='x'.repeat(480*1024);},
 'unpaired-B-release':f=>{f.facts.ledger.push({order:20000,type:'port-close',nodeId:2});},
};
for(const [name,mutate]of Object.entries(changes))test('suspend-rebind saved replay refuses '+name,async()=>{const f=fixture();mutate(f);renumber(f);const m=await load();await assert.rejects(async()=>{const r=await retained(f);return m.readSourceOwnerProof(r.files,r.directory,r.spec);},/source-owner/);});
test('suspend-rebind saved replay rejects cross-run path traversal even with matching suffix and hash',async()=>{const f=await retained(),r=f.proof.rows.find(e=>e.kind==='pcm'),original=r.file;r.file=f.directory+'/segment-x/../../installed-extension-Donor/'+original.split('/').at(-1);f.saved.set(r.file,f.saved.get(original));saveProof(f);await assert.rejects(()=>(load()).then(m=>m.readSourceOwnerProof(f.files,f.directory,f.spec)),/source-owner/);});
test('suspend-rebind retains distinct natural schemas and rejects caller transplant',async()=>{const m=await load(),f=await retained();await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,{...f.spec,id:'44100/source-owner/pending-off'}),/source-owner/);f.proof.schema='f01-source-pending-off-proof-v1';saveProof(f);await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,f.spec),/source-owner/);});
test('suspend-rebind saved replay preserves NOT_OBSERVED after private rebind and completed B preempt the public call',async()=>{
 const f=fixture(),l=f.facts.ledger,s=off(f),r=receipt(f),types=['stimulus-enter','stimulus-restored','configure-call','configure-return'],late=types.map(type=>l.find(e=>e.type===type));
 f.facts.ledger=l.filter(e=>e!==s&&e!==r&&!types.includes(e.type)&&!['suspend-call','suspend-return'].includes(e.type));
 Object.assign(late[0],{connected:false,outputs:false,closed:true});f.facts.stimulus.status='NOT_OBSERVED';
 f.facts.ledger.push(late[0],late[1],{...clone(late[1]),order:30000,type:'stimulus-missed'},late[2],late[3]);renumber(f);
 const saved=await retained(f),m=await load(),a=(await m.readSourceOwnerProof(saved.files,saved.directory,saved.spec)).assessment;assert.equal(a.pendingFlight,'NOT_OBSERVED');assert.equal(a.formationMethod,method);assert.equal(a.overallQualification,false);
});
test('suspend-rebind saved replay preserves a natural OFF before entry as NOT_OBSERVED',async()=>{
 const f=fixture(),l=f.facts.ledger,s=off(f),r=receipt(f),entry=l.find(e=>e.type==='stimulus-enter');
 l.splice(l.indexOf(s),1);l.splice(l.indexOf(r),1);l.splice(l.indexOf(entry),0,s,r);r.currentSrc='';entry.readback.state='pending';entry.readback.appliedGain=null;
 f.facts.ledger=l.filter(e=>!['suspend-call','suspend-return'].includes(e.type));f.facts.stimulus.status='NOT_OBSERVED';const restored=f.facts.ledger.find(e=>e.type==='stimulus-restored');f.facts.ledger.splice(f.facts.ledger.indexOf(restored)+1,0,{...clone(restored),type:'stimulus-missed',order:30000});renumber(f);
 const saved=await retained(f),m=await load(),a=(await m.readSourceOwnerProof(saved.files,saved.directory,saved.spec)).assessment;assert.equal(a.pendingFlight,'NOT_OBSERVED');assert.equal(a.formationMethod,method);assert.equal(a.overallQualification,false);
});
function scenarioFixture(rate=44100,mutate){
  const f=fixture(rate);if(mutate){mutate(f);renumber(f);}const module=Buffer.from('synthetic packaged transition module'),calls=[];let stage=0,stopped=false,switches=0;
  const current=()=>{const x=clone(f.facts),id=stage===2?2:1;x.nodes=x.nodes.slice(0,id);x.producers=x.producers.slice(0,id+2);if(stage!==2)x.ledger=x.ledger.slice(0,x.ledger.findIndex(e=>e.type==='switch'));x.connected=[id];x.currentSrc=x.inputPlan.urls[id-1];x.contextState='running';x.paused=false;x.hidden=false;x.moduleLoads=['chrome-extension://actual/web/audio-transition-worklet.js'];x.readback=clone(x.stable[id===1?'a':'b'].readback);delete x.stable;return x;};
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},waitForTimeout:async()=>{},locator:()=>({click:async()=>{stage=1;}}),evaluate:async(fn,arg)=>{
    if(fn.name==='installSourceOwnerProbe'){assert.deepEqual(arg,{sampleRate:rate,profile:'suspend-rebind'});return;}calls.push(clone(arg));
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

test('suspend-rebind actual dispatcher scenario saves and rereads its distinct controlled scope',async()=>{
 const f=scenarioFixture(),m=await load(),r=(await dispatcher(f)).audioProduct;assert.equal(r.schema,'f01-source-suspend-rebind-observation-v1');assert.equal(r.ownership.pendingFlight,'MAIN_RECONSTRUCTED');assert.equal(r.ownership.formationMethod,method);assert.equal(f.switches(),1);await m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec);
 const original=clone(r);r.ownership.formationMethod='natural';await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/source-owner/);Object.assign(r,original);r.schema='f01-source-pending-off-observation-v1';await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/source-owner/);
});
