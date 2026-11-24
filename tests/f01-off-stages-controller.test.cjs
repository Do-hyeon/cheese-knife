const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module'),{webcrypto}=require('node:crypto');

const source=names=>names.map(name=>{
  const file=path.join(__dirname,'../src/main/features/audio',name+'.ts');
  return stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{sourceUrl:file})
    .replace(/^import\b[^;]*;\s*/gm,'').replace(/^export /gm,'');
}).join('\n');
const controllerCode=source(['curve','eq','normalizer','controller'])+'\ninstallAudio;';
const workletCode=source(['eq','curve','normalizer','transition','transition-worklet']);
const spec={id:'44100/source-owner/off-stages',sampleRate:44100,frequency:1000,inputDbfs:-24,
  pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:true,equalizer:false};
const copy=value=>JSON.parse(JSON.stringify(value));
const microtasks=async()=>{for(let n=0;n<24;n++)await Promise.resolve();};
class Events{
  handlers=new Map();
  addEventListener(type,listener,options){const rows=this.handlers.get(type)??[];rows.push({listener,once:options?.once});this.handlers.set(type,rows);}
  removeEventListener(type,listener){this.handlers.set(type,(this.handlers.get(type)??[]).filter(row=>row.listener!==listener));}
  fire(type,event={type}){for(const row of [...(this.handlers.get(type)??[])]){if(row.once)this.removeEventListener(type,row.listener);row.listener(event);}}
}

// Only native graph/API/task boundaries are doubles; command and reply generation use current sources.
async function fixture(t,options={}){
  const nodes=[],scopes=[],timers=new Map(),blobs=new Map(),channels=[],mainTasks=[],workerTasks=[],originalReplies=[];
  let nextTimer=0,nextUrl=0,frame=0,context,sourceNode,plan,Capture,captureBox,throwSnapshot=false;
  const postError=Error('registration-original-post'),snapshotError=Error('original-snapshot-error');
  const parameter=value=>({value,setValueAtTime(value){this.value=value;},cancelScheduledValues(){},linearRampToValueAtTime(value){this.value=value;}});
  const node=type=>{const value={type,outputs:new Set(),connect(destination){this.outputs.add(destination);return destination;},disconnect(destination){if(destination)this.outputs.delete(destination);else this.outputs.clear();}};nodes.push(value);return value;};
  const video=Object.assign(new Events(),{currentSrc:'',paused:false,ended:false,muted:false,volume:1,loop:false,
    playbackRate:1,currentTime:1,isConnected:true,mediaKeys:null,pause(){this.paused=true;}});
  Object.defineProperty(video,'src',{get(){return this.sourceUrl??'';},set(value){this.sourceUrl=value;this.currentSrc=value;queueMicrotask(()=>video.fire('loadeddata'));},configurable:true});
  const document={hidden:false,querySelector:selector=>selector==='video'?video:null};video.ownerDocument=document;
  const player={video,pzp:{},layout:{},vue:false,reactOnLayout:false,filterTarget:null};
  const runtime={ownerProtocol:3,config:{},mediaRequestId:'host-request',
    media:{context:{documentGeneration:1,routePath:'/live/'+'a'.repeat(32),playerGeneration:1,channelId:'a'.repeat(32)},audioBindingGeneration:1,gainOrigin:'global-owned'},
    state:{player},selectPlayer:()=>player,mediaCurrent:()=>true,setStatus(){},createScope(){
      const cleanups=[],scope={disposed:false,on(target,type,handler){target.addEventListener(type,handler);cleanups.push(()=>target.removeEventListener(type,handler));},
        interval(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms,interval:true});cleanups.push(()=>timers.delete(id));return id;},dispose(){this.disposed=true;cleanups.splice(0).forEach(fn=>fn());}};
      scopes.push(scope);return scope;
    }};
  class Port extends Events{
    closed=false;closeCalls=0;onmessage=null;
    start(){}
    postMessage(packet){
      let value=copy(packet);if(value.stage===options.omitStage||value.stage==='registered'&&options.noAck)return;
      if(value.stage==='registered'&&options.wrongAck)value.registration='f'.repeat(32);
      queueMicrotask(()=>{if(!this.peer.closed){this.peer.fire('message',{data:value});this.peer.onmessage?.({data:value});}});
    }
    close(){this.closeCalls++;this.closed=true;if(options.closeThrow)throw Error('endpoint-close-'+this.endpoint);}
  }
  class Channel{
    constructor(){this.port1=new Port();this.port2=new Port();this.port1.endpoint=1;this.port2.endpoint=2;
      this.port1.peer=this.port2;this.port2.peer=this.port1;channels.push(this);}
  }
  class Context extends Events{
    constructor(settings={}){super();this.sampleRate=settings.sampleRate??44100;this.currentTime=0;this.state='running';this.destination=node('destination');context=this;}
    audioWorklet={addModule:async url=>{
      if(blobs.has(String(url))){captureBox={currentFrame:0,Float32Array,AudioWorkletProcessor:class{},registerProcessor(name,ctor){assert.equal(name,'source-owner-capture');Capture=ctor;}};
        vm.runInNewContext(await blobs.get(String(url)).text(),captureBox);}
    }};
    resume(){this.state='running';return Promise.resolve();}
    createMediaElementSource(element){assert.equal(element,video);sourceNode=node('source');return sourceNode;}
    createGain(){return Object.assign(node('gain'),{gain:parameter(1)});}
    createDelay(){return Object.assign(node('delay'),{delayTime:parameter(0)});}
    createWaveShaper(){return Object.assign(node('limiter'),{curve:null,oversample:'none'});}
    createDynamicsCompressor(){return Object.assign(node('compressor'),Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,parameter(0)])));}
    createConstantSource(){return Object.assign(node('constant'),{offset:parameter(0),start(){},stop(){}});}
    createChannelSplitter(){return node('splitter');}
    createAnalyser(){return Object.assign(node('analyser'),{fftSize:2048,getFloatTimeDomainData(buffer){buffer.fill(0);}});}
  }
  class Worklet{
    constructor(ctx,name,settings){
      Object.assign(this,node(name));nodes[nodes.length-1]=this;this.options=settings;this.parameters=new Map([['K',parameter(0)]]);this.messages=[];
      const observers=[];this.port={onmessage:null,closed:false,closeCalls:0,start(){},
        addEventListener(type,fn){assert.equal(type,'message');observers.push(fn);},
        close:()=>{this.port.closeCalls++;this.port.closed=true;},postMessage:(packet,transfer=[])=>{
          this.messages.push(copy(packet));
          if(packet.kind==='off-stage-register'&&options.registrationThrow)throw postError;
          workerTasks.push(()=>this.processor.port.onmessage({data:copy(packet),ports:transfer}));
        }};
      this.receive=packet=>{if(!this.port.closed){for(const fn of observers)fn({data:packet});this.port.onmessage?.({data:packet});}};
      if(name==='source-owner-capture'){
        assert.ok(Capture);this.processor=new Capture(settings);this.processor.port={postMessage:packet=>mainTasks.push(()=>this.receive(packet))};
      }else{
        let Processor;const owner=this;
        this.box={currentFrame:frame,sampleRate:44100,Float32Array,Float64Array,
          AudioWorkletProcessor:class{constructor(){this.port={onmessage:null,postMessage(packet){originalReplies.push({owner,packet});mainTasks.push(()=>owner.receive(packet));}};}},
          registerProcessor(registered,ctor){assert.equal(registered,'knife-audio-transition-l1');Processor=ctor;}};
        vm.runInNewContext(workletCode,this.box);this.processor=new Processor(settings);
      }
    }
  }
  const window=Object.assign(new Events(),{document,Symbol,crypto:webcrypto,MessageChannel:Channel,AudioContext:Context,AudioWorkletNode:Worklet,
    location:{origin:'https://chzzk.naver.com',pathname:runtime.media.context.routePath},localStorage:{getItem:()=>null},
    setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  window[Symbol.for('cheese-knife.runtime.v1')]=runtime;
  const url=class extends URL{};url.createObjectURL=blob=>{const value='blob:https://chzzk.naver.com/off-stages-'+(++nextUrl);blobs.set(value,blob);return value;};url.revokeObjectURL=value=>blobs.delete(value);
  const box=vm.createContext({window,document,AudioContext:Context,AudioWorkletNode:Worklet,MessageChannel:Channel,URL:url,Blob,crypto:webcrypto,
    Float32Array,Float64Array,Uint8Array,DataView,ArrayBuffer,Map,Set,Symbol,TextEncoder,queueMicrotask,
    setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,Date:class extends Date{static now(){return 1000;}},
    performance:{now:()=>context.currentTime*1000},btoa:value=>Buffer.from(value,'binary').toString('base64')});
  const audio=vm.runInContext(controllerCode,box).call(null,window),originalConfigure=audio.configure;
  const readback=audio.getReadback;audio.getReadback=function(...args){if(throwSnapshot){throwSnapshot=false;throw snapshotError;}return Reflect.apply(readback,this,args);};
  video.play=async()=>{video.paused=false;if(plan&&video.currentSrc===plan.urls[1])audio.configure();};
  const pump=async()=>{for(let n=0;n<6;n++){while(workerTasks.length)workerTasks.shift()();while(mainTasks.length)mainTasks.shift()();await microtasks();}};
  const settle=async promise=>{
    let done=false,result,failure;Promise.resolve(promise).then(value=>{done=true;result=value;},error=>{done=true;failure=error;});
    for(let n=0;n<24&&!done;n++)await pump();
    if(!done){for(const [id,row] of [...timers])if(!row.interval){timers.delete(id);row.fn();}await pump();}
    assert.ok(done,'bounded HOST task queue must settle');if(failure)throw failure;return result;
  };
  const step=async()=>{
    await pump();context.currentTime=frame/44100;
    const input=Float32Array.from({length:128},(_,n)=>Math.SQRT2*10**(-24/20)*Math.sin(2*Math.PI*1000*(frame+n)/44100+.37)),blocks=new Map();
    for(const owner of nodes.filter(node=>node.type==='knife-audio-transition-l1')){
      owner.box.currentFrame=frame;const audio=Array.from({length:2},()=>new Float32Array(128)),control=Array.from({length:5},()=>new Float32Array(128));
      assert.equal(owner.processor.process([[input,input]],[audio,control],{K:new Float32Array([0])}),true);blocks.set(owner,{audio,control});
    }
    const owners=nodes.filter(node=>node.type==='knife-audio-transition-l1'),program=blocks.get(owners.at(-1))?.audio??[input,input];
    for(const capture of nodes.filter(node=>node.type==='source-owner-capture')){
      const id=capture.options.processorOptions.producerId,owner=owners[id-2];
      const samples=id===0?program:id===1?[input,input]:owner&&!owner.port.closed?blocks.get(owner).control:[];
      captureBox.currentFrame=frame;capture.processor.process([samples],[Array.from({length:id<2?2:5},()=>new Float32Array(128))]);
    }
    frame+=128;context.currentTime=frame/44100;await pump();
  };
  t.after(()=>{scopes.forEach(scope=>scope.dispose());timers.clear();blobs.clear();});
  const {installSourceOwnerProbe}=await import('../scripts/audio-source-owner-probe.mjs');
  await vm.runInContext('('+installSourceOwnerProbe.toString()+')('+JSON.stringify({sampleRate:44100,profile:'off-stages'})+')',box);
  const probe=window[Symbol.for('cheese-knife.source-owner-probe.v1')];
  plan=await probe.action({kind:'prepare',spec});
  await audio.prepareTransitionModule('chrome-extension://'+'a'.repeat(32)+'/web/audio-transition-worklet.js');
  const enabling=audio.setEnabled(video,true);await pump();
  const a=nodes.find(node=>node.type==='knife-audio-transition-l1');assert.ok(a);assert.equal(a.options.processorOptions.offStageWitness,true);
  for(let n=0;n<69;n++)await step();assert.equal(await enabling,'on');
  assert.equal(frame,8832);assert.equal(audio.getReadback(video).appliedGain,1);
  const facts=()=>probe.action({kind:'facts'}),switchSource=()=>settle(probe.action({kind:'switch',aEnd:8820}));
  return {audio,video,runtime,a,nodes,source:sourceNode,channels,originalReplies,probe,plan,step,pump,settle,facts,switchSource,postError,snapshotError,
    originalConfigure,throwSnapshot:()=>{throwSnapshot=true;},frame:()=>frame};
}

async function completeAndSave(h){
  const aFacts=await h.facts();await h.switchSource();await h.pump();
  const b=h.nodes.find(node=>node.type==='knife-audio-transition-l1'&&node!==h.a);assert.ok(b);
  assert.equal(b.options.processorOptions.offStageWitness,undefined,'B must not opt in');
  for(let n=0;n<69;n++)await h.step();const bFacts=await h.facts();
  assert.equal(bFacts.readback.state,'on');assert.equal(bFacts.readback.appliedGain,1);
  const {createSourceOwnerArchive,readSourceOwnerProof}=await import('../scripts/extension-e2e/audio-source-owner.mjs');
  const saved=new Map(),directory='output/playwright/installed-extension-OffStagesControllerUnit';
  const files={root:process.cwd(),writeFile:async(file,value,options)=>{assert.equal(options.flag,'wx');assert.equal(saved.has(file),false);saved.set(file,Buffer.from(value));},
    readFile:async(file,encoding)=>{assert.ok(saved.has(file),'missing saved artifact '+file);return encoding?saved.get(file).toString(encoding):saved.get(file);},
    lstat:async file=>saved.has(file)?{isFile:()=>true,size:saved.get(file).length}:null};
  const archive=createSourceOwnerArchive(files,directory,spec),cursors=[0,0,0,0];let drained=false;
  for(let round=0;round<10;round++){
    const batch=await h.probe.action({kind:'drain',cursors:cursors.slice()});if(!batch.length){drained=true;break;}
    for(const row of batch){await archive.append(row);cursors[row.producerId]=row.lastReceived;}
  }
  assert.ok(drained);const savedDiagnosticHandler=h.channels[0].port1.onmessage;
  assert.equal(typeof savedDiagnosticHandler,'function');
  const snapshot=await h.probe.action({kind:'stop'});
  const stable={a:{...aFacts,nodeId:1,window:{start:4410,end:8820}},b:{...bFacts,nodeId:2,window:{start:13230,end:17640}}};
  const proof=archive.proof({...snapshot,spec,stable});
  await files.writeFile(directory+'/input-plan.json',JSON.stringify(h.plan),{flag:'wx'});
  await files.writeFile(directory+'/source-owner-proof.json',JSON.stringify(proof),{flag:'wx'});
  return {snapshot,savedDiagnosticHandler,replay:await readSourceOwnerProof(files,directory,spec)};
}

test('actual controller, Worklet, probe capture, archive, and saved reader preserve independent positive OFF stages',async t=>{
  const h=await fixture(t),{snapshot,replay,savedDiagnosticHandler}=await completeAndSave(h);
  assert.equal(snapshot.error,null);assert.equal(snapshot.profile,'off-stages');
  assert.deepEqual(copy(snapshot.offStages),{registration:snapshot.offStages.registration,endpointId:1,frozen:true});
  const events=snapshot.ledger,registered=events.find(row=>row.type==='off-stage-register-send'),ack=events.find(row=>row.type==='off-stage-receive'&&row.packet.stage==='registered');
  assert.equal(registered.aEnd,8820);assert.ok(registered.order<ack.order&&ack.order<events.find(row=>row.type==='switch').order);
  assert.deepEqual(copy(events.filter(row=>row.type==='off-stage-receive').map(row=>row.packet.stage)),['registered','callback','stored','accepted','accepted-post-returned','completed']);
  assert.ok(h.originalReplies.some(row=>row.owner===h.a&&row.packet.seq===2&&row.packet.kind==='completed'),'actual render returned OFF completion');
  assert.equal(events.some(row=>row.type==='receive'&&row.nodeId===1&&row.packet.seq===2),false);
  assert.equal(h.a.port.closed,true);assert.equal(h.a.port.closeCalls,1);assert.equal(h.a.port.onmessage,null);
  assert.equal(h.source.outputs.has(h.a),false);assert.equal(h.audio.configure,h.originalConfigure);
  assert.deepEqual(replay.proof.facts.ledger,copy(snapshot.ledger));assert.deepEqual(replay.proof.facts.nodes,copy(snapshot.nodes));
  assert.equal(replay.proof.schema,'f01-source-off-stages-proof-v1');
  assert.deepEqual(replay.assessment.offStages,{callback:'OBSERVED',stored:'OBSERVED',accepted:'OBSERVED',acceptedPostReturned:'OBSERVED',completed:'OBSERVED'});
  assert.equal(replay.assessment.pendingFlight,'MAIN_RECONSTRUCTED');assert.equal(replay.assessment.lateReplyObservation,'NOT_OBSERVED');
  assert.equal(replay.assessment.frameOrigin,'UNPROVEN');assert.equal(replay.assessment.overallQualification,false);
  for(const port of [h.channels[0].port1,h.channels[0].port2]){assert.equal(port.closeCalls,1);assert.equal((port.handlers.get('message')??[]).length,0);assert.equal(port.onmessage,null);}
  const before=copy(snapshot.ledger),late=copy(events.find(row=>row.type==='off-stage-receive').packet);
  savedDiagnosticHandler({data:late});
  assert.deepEqual(copy((await h.facts()).ledger),before,'the frozen cutoff does not append a late diagnostic');
});

test('missing callback receipt remains UNKNOWN while later actual stages survive saved replay',async t=>{
  const h=await fixture(t,{omitStage:'callback'}),{replay}=await completeAndSave(h);
  assert.deepEqual(replay.assessment.offStages,{callback:'UNKNOWN',stored:'OBSERVED',accepted:'OBSERVED',acceptedPostReturned:'OBSERVED',completed:'OBSERVED'});
});

for(const fault of ['registrationThrow','noAck','wrongAck'])test('registration '+fault+' prevents OFF and B and cleans both endpoints',async t=>{
  const h=await fixture(t,{[fault]:true});await assert.rejects(h.switchSource());const first=await h.facts();assert.ok(first.error);
  assert.equal(h.a.messages.some(packet=>packet.kind==='configure'&&!packet.wanted),false);
  assert.equal(h.nodes.filter(node=>node.type==='knife-audio-transition-l1').length,1);assert.equal(h.video.currentSrc,h.plan.urls[0]);
  assert.equal(h.channels.length,1);for(const port of [h.channels[0].port1,h.channels[0].port2])assert.equal(port.closeCalls,1);
  const stopped=await h.probe.action({kind:'stop'});assert.equal(stopped.error,first.error);assert.deepEqual(copy(stopped.firstFailure),copy(first.firstFailure));
});

test('stop includes both cleanup failures in its returned frozen snapshot and keeps the first error',async t=>{
  const h=await fixture(t,{closeThrow:true});await h.switchSource();const stopped=await h.probe.action({kind:'stop'});
  assert.ok(stopped.error);assert.equal(stopped.firstFailure.error,stopped.error);assert.equal(stopped.offStageCleanupErrors.length,2);
  const after=await h.facts();assert.equal(after.error,stopped.error);assert.deepEqual(copy(after.offStageCleanupErrors),copy(stopped.offStageCleanupErrors));
  for(const port of [h.channels[0].port1,h.channels[0].port2])assert.equal(port.closeCalls,1);
});

test('both cleanup failures remain secondary to a registration post failure',async t=>{
  const h=await fixture(t,{registrationThrow:true,closeThrow:true});await assert.rejects(h.switchSource());
  const first=await h.facts();assert.ok(first.error);assert.equal(first.firstFailure.error,first.error);
  assert.equal(first.offStageCleanupErrors.length,2);
  const stopped=await h.probe.action({kind:'stop'});assert.equal(stopped.error,first.error);
  assert.deepEqual(copy(stopped.firstFailure),copy(first.firstFailure));assert.deepEqual(copy(stopped.offStageCleanupErrors),copy(first.offStageCleanupErrors));
});

test('snapshot throw still closes both diagnostic endpoints and preserves the original snapshot exception',async t=>{
  const h=await fixture(t,{closeThrow:true});await h.switchSource();h.throwSnapshot();
  await assert.rejects(h.probe.action({kind:'stop'}),error=>error===h.snapshotError);
  const after=await h.facts();assert.equal(after.error,'audio-source-owner-off-stage-snapshot');
  assert.equal(after.firstFailure.cause,String(h.snapshotError));assert.equal(after.offStageCleanupErrors.length,2);
  for(const port of [h.channels[0].port1,h.channels[0].port2])assert.equal(port.closeCalls,1);
});

for(const boundary of ['documentGeneration','routePath'])test('changed '+boundary+' refuses registration before endpoint allocation or OFF/B',async t=>{
  const h=await fixture(t),before=copy(h.audio.getReadback(h.video));
  if(boundary==='documentGeneration')h.runtime.media.context.documentGeneration++;
  else h.runtime.media.context.routePath='/live/'+'b'.repeat(32);
  assert.deepEqual(copy(h.audio.getReadback(h.video)),before);
  await assert.rejects(h.switchSource());assert.ok((await h.facts()).error);
  assert.equal(h.channels.length,0);assert.equal(h.a.messages.some(packet=>packet.kind==='off-stage-register'),false);
  assert.equal(h.a.messages.some(packet=>packet.kind==='configure'&&!packet.wanted),false);
  assert.equal(h.nodes.filter(node=>node.type==='knife-audio-transition-l1').length,1);assert.equal(h.video.currentSrc,h.plan.urls[0]);
});

test('invalid source state refuses registration before endpoint allocation or OFF/B',async t=>{
  const h=await fixture(t);h.video.volume=.5;
  await assert.rejects(h.switchSource());assert.ok((await h.facts()).error);
  assert.equal(h.channels.length,0);assert.equal(h.a.messages.some(packet=>packet.kind==='off-stage-register'),false);
  assert.equal(h.a.messages.some(packet=>packet.kind==='configure'&&!packet.wanted),false);
  assert.equal(h.nodes.filter(node=>node.type==='knife-audio-transition-l1').length,1);assert.equal(h.video.currentSrc,h.plan.urls[0]);
});
