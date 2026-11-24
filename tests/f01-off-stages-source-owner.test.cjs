const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{createHash}=require('node:crypto');
const load=()=>import('../scripts/extension-e2e/audio-source-owner.mjs');
const clone=value=>JSON.parse(JSON.stringify(value)),hash=value=>createHash('sha256').update(value).digest('hex');
const method='controlled-public-suspend-off-stages',registration='b'.repeat(32),routePath='/live/'+'a'.repeat(32),tuple={documentGeneration:1,routePath};

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

function controlledFixture(){
 const f=naturalFixture(),l=f.facts.ledger;f.spec.id='44100/source-owner/suspend-rebind';f.facts.spec=clone(f.spec);f.facts.profile='suspend-rebind';f.facts.stimulus={method,status:'APPLIED'};f.facts.inputPlan.spec=clone(f.spec);f.facts.inputPlan.formationMethod=method;
 let id=10000;const common={nodeId:1,portId:1,sourceEpoch:7,contextId:1,elementId:1,sourceHandle:1,method,...tuple},mark=(type,data={})=>({order:++id,type,...common,...data});
 const snapshot={...common,currentSrc:f.facts.inputPlan.urls[1],src:f.facts.inputPlan.urls[1],sources:1,connected:true,outputs:true,closed:false,videoConnected:true,selected:true,mediaCurrent:true,eligible:true,hidden:false,contextState:'running',readback:{state:'on',sources:1,wanted:true,gain:1,appliedGain:1}};
 const send=l.find(e=>e.type==='send'&&e.packet.seq===2),receipt=l.find(e=>e.sendOrder===send.order);receipt.currentSrc=f.facts.inputPlan.urls[1];
 l.splice(l.indexOf(send),0,mark('stimulus-arm',{aEnd:f.a.end}),mark('stimulus-enter',snapshot),mark('stimulus-restored'),mark('suspend-call'));
 l.splice(l.indexOf(receipt)+1,0,mark('suspend-return'),mark('configure-call'));
 for(const type of ['node-disconnect','port-close']){const e=l.find(e=>e.type===type);const attempt=mark(type+'-attempt');l.splice(l.indexOf(e),0,attempt);l.splice(l.indexOf(e)+1,0,mark(type+'-return',{attemptOrder:attempt.order}));}
 l.splice(l.findIndex(e=>e.type==='constructor'&&e.nodeId===2),0,mark('configure-return'));renumber(f);return f;
}
function scenarioFixture(rate=44100,mutate){
  const f=controlledFixture(rate);if(mutate){mutate(f);renumber(f);}const module=Buffer.from('synthetic packaged transition module'),calls=[];let stage=0,stopped=false,switches=0;
  const current=()=>{const x=clone(f.facts),id=stage===2?2:1;x.nodes=x.nodes.slice(0,id);x.producers=x.producers.slice(0,id+2);if(stage!==2)x.ledger=x.ledger.slice(0,x.ledger.findIndex(e=>e.type==='switch'));x.connected=[id];x.currentSrc=x.inputPlan.urls[id-1];x.contextState='running';x.paused=false;x.hidden=false;x.moduleLoads=['chrome-extension://actual/web/audio-transition-worklet.js'];x.readback=clone(x.stable[id===1?'a':'b'].readback);delete x.stable;return x;};
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},waitForTimeout:async()=>{},locator:()=>({click:async()=>{stage=1;}}),evaluate:async(fn,arg)=>{
    if(fn.name==='installSourceOwnerProbe'){assert.deepEqual(arg,{sampleRate:rate,profile:'off-stages'});return;}calls.push(clone(arg));
    if(arg.kind==='prepare'){assert.deepEqual(arg.spec,f.spec);return clone(f.facts.inputPlan);}if(arg.kind==='facts')return current();if(arg.kind==='stop'){stopped=true;return current();}if(arg.kind==='switch'){assert.equal(arg.aEnd,f.a.end);assert.equal(++switches,1);stage=2;return current();}
    if(arg.kind==='drain'){if(!stage||stopped&&!arg.failure)return [];const pos=stage===2?f.end:Math.ceil(f.a.end/128)*128,out=[];for(const p of f.facts.producers.filter(p=>p.id<stage+2)){const base=p.id===3?f.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===2&&e.packet.kind==='prepared').packet.frame:0,start=base+arg.cursors[p.id]*128;let end=Math.min(pos,start+Math.floor(rate/10/128)*128);if(arg.endFrame!==undefined)end=Math.min(end,Math.ceil(arg.endFrame/128)*128);if(end<=start)continue;const empty=p.id===2&&start>=f.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===2&&e.packet.kind==='prepared').packet.frame+256,count=(end-start)/128,data=Buffer.alloc((end-start)*p.channels*4);for(let n=0;n<end-start;n++)for(let c=0;c<p.channels;c++)data.writeFloatLE(p.channels===5?[-1,1,1,1,0][c]:.01,(n*p.channels+c)*4);out.push({producerId:p.id,portId:p.id,nodeId:p.nodeId,sourceEpoch:p.sourceEpoch,kind:empty?'empty':'pcm',packetFrame:start,start,end,firstSequence:arg.cursors[p.id]+1,lastSequence:arg.cursors[p.id]+count,firstReceived:arg.cursors[p.id]+1,lastReceived:arg.cursors[p.id]+count,firstOffset:0,lastOffset:128,channels:empty?0:p.channels,...(!empty?{base64:data.toString('base64')}:{})});}return out;}
    throw Error('unexpected pending owner action '+arg.kind);
  }};
  const read=f.files.readFile;f.files.readFile=async(file,encoding)=>{const bytes=file.endsWith('audio-transition-worklet.js')?module:file.startsWith('tests/')?Buffer.from('<html></html>'):null;return bytes?(encoding?bytes.toString(encoding):bytes):read(file,encoding);};f.files.ensureDirectory=async()=>{};
  const input={context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async()=>Array.from(module)},extensionId:'actual',artifactPath:path.join(f.files.root,f.directory)};
  return {...f,input,calls,module,execute:async()=>{const m=await load();return m.runProductSourceOwnerScenario(input,f.files,{dist:path.join(f.files.root,'dist')},f.spec);},switches:()=>switches};
}
function instrument(f){
 f.spec.id='44100/source-owner/off-stages';f.facts.spec=clone(f.spec);f.facts.inputPlan.spec=clone(f.spec);f.facts.inputPlan.formationMethod=method;f.facts.profile='off-stages';f.facts.stimulus.method=method;
 f.facts.nodes[0].options.offStageWitness=true;
 for(const row of f.facts.ledger)if(row.method)row.method=method;
 f.facts.offStages={registration,endpointId:1,frozen:true};
 const ledger=f.facts.ledger,target=clone(ledger.find(row=>row.type==='send'&&row.nodeId===1&&row.packet.seq===2).packet),sourceEpoch=target.sourceEpoch;
 const binding={nodeId:1,portId:1,sourceEpoch,endpointId:1,contextId:1,elementId:1,sourceHandle:1,documentGeneration:1,routePath:'/live/'+'a'.repeat(32)};
 const send={order:50001,type:'off-stage-register-send',...binding,aEnd:f.a.end,packet:{kind:'off-stage-register',sourceEpoch,registration,target},transferEndpointIds:[1]};
 const returned={order:50002,type:'off-stage-register-return',...binding,aEnd:f.a.end,sendOrder:send.order};
 const receipt=(stage,reply)=>({order:50003,type:'off-stage-receive',...binding,packet:{schema:'f01-off-stage-receipt-v1',registration,sourceEpoch,seq:2,stage,target:clone(target),...(reply?{reply}:{} )}});
 ledger.splice(ledger.findIndex(row=>row.type==='switch'),0,send,returned,receipt('registered'));
 for(const stage of ['callback','stored','accepted','accepted-post-returned','completed'])ledger.push(receipt(stage,['accepted','accepted-post-returned','completed'].includes(stage)?{kind:stage==='completed'?'completed':'accepted',sourceEpoch,seq:2,frame:f.a.end+128,meterEpoch:0,gain:stage==='completed'?1:null,code:null}:undefined));
 renumber(f);return f;
}
const fixture=()=>instrument(controlledFixture());

async function retained(f=fixture()){
 const m=await load(),archive=m.createSourceOwnerArchive(f.files,f.directory,f.spec);for(const row of f.records)await archive.append(row);const proof=archive.proof(f.facts);
 await f.files.writeFile(f.directory+'/source-owner-proof.json',JSON.stringify(proof),{flag:'wx'});await f.files.writeFile(f.directory+'/input-plan.json',JSON.stringify(f.facts.inputPlan),{flag:'wx'});return {...f,archive,proof};
}
const save=f=>f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(f.proof)));
const receipt=(f,stage)=>f.facts.ledger.find(row=>row.type==='off-stage-receive'&&row.packet.stage===stage);

test('off-stages has one exact frozen 44100 spec and its own saved proof scope',async()=>{
 const m=await load();assert.equal(m.SOURCE_OFF_STAGE_CASES?.length,1);assert.deepEqual(m.SOURCE_OFF_STAGE_CASES[0],fixture().spec);assert.ok(Object.isFrozen(m.SOURCE_OFF_STAGE_CASES));assert.ok(Object.isFrozen(m.SOURCE_OFF_STAGE_CASES[0]));
 const f=await retained(),replay=await m.readSourceOwnerProof(f.files,f.directory,f.spec);assert.equal(f.proof.schema,'f01-source-off-stages-proof-v1');assert.equal(replay.assessment.formationMethod,method);assert.equal(replay.assessment.pendingFlight,'MAIN_RECONSTRUCTED');
 assert.deepEqual(replay.assessment.offStages,{callback:'OBSERVED',stored:'OBSERVED',accepted:'OBSERVED',acceptedPostReturned:'OBSERVED',completed:'OBSERVED'});assert.equal(replay.assessment.lateReplyObservation,'NOT_OBSERVED');assert.equal(replay.assessment.overallQualification,false);assert.equal(replay.assessment.waveQuality,'UNASSESSED');assert.equal(replay.assessment.native7Witness,'UNASSESSED');assert.equal(replay.assessment.native8Witness,'UNASSESSED');assert.equal(replay.assessment.frameOrigin,'UNPROVEN');
 for(const spec of [{...f.spec,sampleRate:48000},{...f.spec,id:f.spec.id+'/extra'},{...f.spec,gain:2}])assert.throws(()=>m.createSourceOwnerArchive(f.files,f.directory,spec),/source-owner/);
});
test('off-stages missing target receipts stay UNKNOWN and late diagnostic arrival is not original late',async()=>{
 const f=fixture();f.facts.ledger=f.facts.ledger.filter(row=>row.type!=='off-stage-receive'||row.packet.stage==='registered'||row.packet.stage==='completed');renumber(f);
 const saved=await retained(f),m=await load(),assessment=(await m.readSourceOwnerProof(saved.files,saved.directory,saved.spec)).assessment;
 assert.deepEqual(assessment.offStages,{callback:'UNKNOWN',stored:'UNKNOWN',accepted:'UNKNOWN',acceptedPostReturned:'UNKNOWN',completed:'OBSERVED'});assert.equal(assessment.lateReplyObservation,'NOT_OBSERVED');assert.equal(assessment.lateReplyWitness,'UNASSESSED');
});
const malformed={
 'A witness opt-in missing':f=>{delete f.facts.nodes[0].options.offStageWitness;},
 'A witness opt-in false':f=>{f.facts.nodes[0].options.offStageWitness=false;},
 'B witness opt-in':f=>{f.facts.nodes[1].options.offStageWitness=true;},
 'registration missing':f=>{delete f.facts.offStages;},
 'registration malformed':f=>{f.facts.offStages.registration='nonce';},
 'snapshot not frozen':f=>{f.facts.offStages.frozen=false;},
 'extra registration metadata':f=>{f.facts.offStages.delivered=true;},
 'registration transfer':f=>{f.facts.ledger.find(row=>row.type==='off-stage-register-send').transferEndpointIds=[];},
 'registration target':f=>{f.facts.ledger.find(row=>row.type==='off-stage-register-send').packet.target.gain=2;},
 'registration after switch':f=>{const l=f.facts.ledger,e=l.find(row=>row.type==='off-stage-register-send');l.splice(l.indexOf(e),1);l.push(e);},
 'registration before A completed':f=>{const l=f.facts.ledger,e=l.find(row=>row.type==='off-stage-register-send');l.splice(l.indexOf(e),1);l.splice(l.findIndex(row=>row.type==='receive'&&row.packet.kind==='completed'),0,e);},
 'registration before A window':f=>{f.facts.ledger.find(row=>row.type==='off-stage-register-send').aEnd--;},
 'nonadjacent registration return':f=>{const l=f.facts.ledger,e=l.find(row=>row.type==='off-stage-register-return');l.splice(l.indexOf(e),1);l.push(e);},
 'missing ACK':f=>{f.facts.ledger.splice(f.facts.ledger.indexOf(receipt(f,'registered')),1);},
 'ACK after arm':f=>{const l=f.facts.ledger,e=receipt(f,'registered');l.splice(l.indexOf(e),1);l.push(e);},
 'target before ACK':f=>{const l=f.facts.ledger,e=receipt(f,'callback');l.splice(l.indexOf(e),1);l.splice(l.indexOf(receipt(f,'registered')),0,e);},
 'duplicate stage':f=>{f.facts.ledger.push(clone(receipt(f,'stored')));},
 'reversed observed stages':f=>{const l=f.facts.ledger,a=l.indexOf(receipt(f,'callback')),b=l.indexOf(receipt(f,'stored'));[l[a],l[b]]=[l[b],l[a]];},
 'completion frame before accepted':f=>{receipt(f,'completed').packet.reply.frame--;},
 'completion meter differs from accepted':f=>{receipt(f,'completed').packet.reply.meterEpoch++;},
 'completion meter differs from post-returned alone':f=>{f.facts.ledger=f.facts.ledger.filter(row=>row!==receipt(f,'accepted'));receipt(f,'completed').packet.reply.meterEpoch++;},
 'original and diagnostic reply differ':f=>{f.facts.ledger.push({order:60000,type:'receive',nodeId:1,portId:1,packet:{...clone(receipt(f,'accepted').packet.reply),frame:f.a.end+256}});},
 'oversized receipt':f=>{receipt(f,'stored').packet.padding='x'.repeat(1024);},
 'wrong receipt nonce':f=>{receipt(f,'completed').packet.registration='c'.repeat(32);},
 'wrong receipt epoch':f=>{receipt(f,'completed').packet.sourceEpoch=8;},
 'receipt rebound to B':f=>{Object.assign(receipt(f,'completed'),{nodeId:2,portId:2,sourceEpoch:8});},
 'wrong endpoint':f=>{receipt(f,'completed').endpointId=2;},
 'wrong document':f=>{receipt(f,'completed').documentGeneration=2;},
 'wrong route':f=>{receipt(f,'completed').routePath='/live/'+'c'.repeat(32);},
 'wrong target packet':f=>{receipt(f,'completed').packet.target.wanted=true;},
 'unknown stage':f=>{receipt(f,'completed').packet.stage='enqueued';},
 'stage extra reply':f=>{receipt(f,'callback').packet.reply={};},
 'rejected is not accepted':f=>{receipt(f,'accepted').packet.reply.kind='rejected';},
 'wrong accepted reply tuple':f=>{receipt(f,'accepted').packet.reply.seq=1;},
 'wrong completion reply':f=>{receipt(f,'completed').packet.reply.kind='accepted';},
 'missing original release event':f=>{f.facts.ledger=f.facts.ledger.filter(row=>row.type!=='port-close-return');},
 'natural method relabel':f=>{f.facts.inputPlan.formationMethod='controlled-public-suspend';},
};
for(const [name,mutate]of Object.entries(malformed))test('off-stages saved replay rejects '+name,async()=>{const f=fixture();mutate(f);renumber(f);const m=await load();await assert.rejects(async()=>{const saved=await retained(f);return m.readSourceOwnerProof(saved.files,saved.directory,saved.spec);},/source-owner/);});
test('off-stages retained replay detects changed bytes, exact artifact path and schema transplantation',async()=>{
 const m=await load();for(const mutate of [f=>{f.proof.schema='f01-source-suspend-rebind-proof-v1';},f=>{f.proof.facts.profile='suspend-rebind';},f=>{const r=f.proof.rows.find(row=>row.kind==='pcm'),original=r.file;r.file=f.directory+'/segment-x/../../installed-extension-Donor/'+original.split('/').at(-1);f.saved.set(r.file,f.saved.get(original));},f=>{const r=f.proof.rows.find(row=>row.kind==='pcm');f.saved.get(r.file)[0]^=1;}]){const f=await retained();mutate(f);save(f);await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,f.spec),/source-owner/);}
 const f=await retained();for(const id of ['44100/source-owner/stable','44100/source-owner/pending-off','44100/source-owner/suspend-rebind'])await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,{...f.spec,id}),/source-owner/);
});
test('off-stages keeps a genuine original-port late reply separate from its diagnostic receipts',async()=>{
 const f=fixture();for(const stage of ['accepted','completed'])f.facts.ledger.push({order:60000,type:'receive',nodeId:1,portId:1,packet:clone(receipt(f,stage).packet.reply)});renumber(f);
 const m=await load(),saved=await retained(f),assessment=(await m.readSourceOwnerProof(saved.files,saved.directory,saved.spec)).assessment;assert.equal(assessment.lateReplyObservation,'OBSERVED');assert.equal(assessment.lateReplyWitness,'UNASSESSED');assert.equal(assessment.offStages.completed,'OBSERVED');
});
test('off-stages scenario installs its distinct profile and saves only positive stage observations',async()=>{
 const f=instrument(scenarioFixture());
 const m=await load(),result=await m.runProductSourceOwnerScenario(f.input,f.files,{dist:path.join(f.files.root,'dist')},f.spec),report=result.audioProduct;
 assert.equal(report.schema,'f01-source-off-stages-observation-v1');assert.equal(report.qualityAssessed,false);assert.equal(report.ownership.formationMethod,method);assert.equal(report.ownership.offStages.completed,'OBSERVED');await m.verifySourceOwnerEvidence(f.files,f.directory,report,f.spec);
 for(const mutate of [r=>{r.ownership.offStages.callback='UNKNOWN';},r=>{r.schema='f01-source-suspend-rebind-observation-v1';},r=>{r.ownership.overallQualification=true;}]){const changed=clone(report);mutate(changed);await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,changed,f.spec),/source-owner/);}
});
test('off-stages actual product dispatcher admits the scenario and verifies its retained evidence',async()=>{
 const f=instrument(scenarioFixture()),m=await load(),{runProductAudio}=await import('../scripts/check-product-audio.mjs');
 const source={sourceSha256:'pending-unit'},candidate={root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
 const result=await runProductAudio({runId:'PendingUnit',caseId:f.spec.id},{platform:'win32',files:f.files,attest:async()=>source,verifyCandidate:async()=>candidate,execute:async options=>{
  await options.dependencies.verifyCandidate('PendingUnit',process.cwd(),{retainEvidence:true});const observed=await options.dependencies.mediaScenario(f.input);
  await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('synthetic trace'),{flag:'wx'});
  return {...observed,ok:true,profileRetained:true,candidateRetained:true,source,after:source,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}};
 }});
 assert.equal(result.ok,true);assert.equal(result.audioProduct.schema,'f01-source-off-stages-observation-v1');assert.equal(result.audioProduct.ownership.formationMethod,method);assert.equal(result.audioProduct.ownership.offStages.completed,'OBSERVED');
 const proof=JSON.parse(String(await f.files.readFile(f.directory+'/source-owner-proof.json','utf8')));assert.equal(proof.schema,'f01-source-off-stages-proof-v1');assert.equal(proof.facts.inputPlan.formationMethod,method);assert.equal(f.switches(),1);
 const replay=await m.readSourceOwnerProof(f.files,f.directory,f.spec);assert.deepEqual(replay.assessment,result.audioProduct.ownership);await m.verifySourceOwnerEvidence(f.files,f.directory,result.audioProduct,f.spec);
});
