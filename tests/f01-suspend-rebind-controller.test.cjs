const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module'),{webcrypto}=require('node:crypto');

// Execute current controller sources without a build, child process, or generated extension bundle.
const controllerCode=['curve','eq','normalizer','controller'].map(name=>{
  const file=path.join(__dirname,'../src/main/features/audio',name+'.ts');
  return stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{sourceUrl:file})
    .replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
}).join('\n')+'\ninstallAudio;';
const spec={id:'44100/source-owner/suspend-rebind',sampleRate:44100,frequency:1000,inputDbfs:-24,
  pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:true,equalizer:false};
const clone=value=>JSON.parse(JSON.stringify(value));
const microtasks=async()=>{for(let n=0;n<24;n++)await Promise.resolve();};

class Events{
  handlers=new Map();
  addEventListener(type,listener,options){const rows=this.handlers.get(type)??[];rows.push({listener,once:options?.once});this.handlers.set(type,rows);}
  removeEventListener(type,listener){this.handlers.set(type,(this.handlers.get(type)??[]).filter(row=>row.listener!==listener));}
  fire(type){for(const row of [...(this.handlers.get(type)??[])]){if(row.once)this.removeEventListener(type,row.listener);row.listener({type});}}
}

async function fixture(t,options={}){
  const nodes=[],timers=new Map(),scopes=[],mainTasks=[],configureCalls=[];
  const configureReturn=Object.freeze({result:'original-configure'}),configureError=Object.freeze(Error('original-configure-error'));
  const postError=Object.freeze(Error('original-post-error')),snapshotError=Object.freeze(Error('snapshot-error'));
  let nextTimer=0,nextUrl=0,context,source,holdB=false,releaseB,throwReadback=false,throwSnapshot=false;
  let plan,configuredResult,configuredError,beforeB=()=>{};
  const parameter=value=>({value,setValueAtTime(value){this.value=value;},cancelScheduledValues(){},linearRampToValueAtTime(value){this.value=value;}});
  const node=type=>{const value={type,outputs:new Set(),connect(destination){this.outputs.add(destination);return destination;},disconnect(destination){if(destination)this.outputs.delete(destination);else this.outputs.clear();}};nodes.push(value);return value;};
  const video=Object.assign(new Events(),{currentSrc:'',paused:false,ended:false,muted:false,volume:1,loop:false,
    playbackRate:1,currentTime:1,isConnected:true,mediaKeys:null,pause(){this.paused=true;}});
  Object.defineProperty(video,'src',{get(){return this.sourceUrl??'';},set(value){
    this.sourceUrl=value;this.currentSrc=value;
    const loaded=()=>video.fire('loadeddata');
    if(holdB&&plan&&value===plan.urls[1])releaseB=loaded;else queueMicrotask(loaded);
  },configurable:true});
  const document={hidden:false,querySelector:selector=>selector==='video'?video:null};video.ownerDocument=document;
  const player={video,pzp:{},layout:{},vue:false,reactOnLayout:false,filterTarget:null};
  const runtime={ownerProtocol:3,config:{},mediaRequestId:'host-request',
    media:{context:{documentGeneration:1,routePath:'/live/'+'a'.repeat(32),playerGeneration:1,channelId:'a'.repeat(32)},
      audioBindingGeneration:1,gainOrigin:'global-owned'},state:{player},selectPlayer:()=>player,mediaCurrent:()=>true,setStatus(){},
    createScope(){const cleanups=[],scope={disposed:false,on(target,type,handler){target.addEventListener(type,handler);cleanups.push(()=>target.removeEventListener(type,handler));},
      interval(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});cleanups.push(()=>timers.delete(id));return id;},
      dispose(){this.disposed=true;cleanups.splice(0).forEach(fn=>fn());}};scopes.push(scope);return scope;}};
  class Context extends Events{
    constructor(settings={}){super();this.sampleRate=settings.sampleRate??44100;this.currentTime=0;this.state='running';this.destination=node('destination');context=this;}
    audioWorklet={addModule:async()=>{}};
    resume(){this.state='running';return Promise.resolve();}
    createMediaElementSource(element){assert.equal(element,video);source=node('source');return source;}
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
      const observers=[];this.port={onmessage:null,closed:false,start(){},addEventListener(type,fn){assert.equal(type,'message');observers.push(fn);},
        close:()=>{this.port.closed=true;},postMessage:(...args)=>{
          const packet=args[0];this.messages.push(clone(packet));
          if(packet.kind==='configure'&&!packet.wanted){
            if(options.postThrow)throw postError;
            if(options.missingReceipt)throwReadback=true;
            const handler=this.port.onmessage,reply={kind:'accepted',sourceEpoch:packet.sourceEpoch,seq:packet.seq,frame:8960,meterEpoch:0,gain:null,code:null};
            mainTasks.push(()=>this.receive(reply,handler));
            if(options.inlineAck)this.receive(reply);
          }
        }};
      this.receive=(packet,handler=this.port.onmessage)=>{for(const fn of observers)fn({data:packet});handler?.({data:packet});};
    }
  }
  const window=Object.assign(new Events(),{document,Symbol,AudioContext:Context,AudioWorkletNode:Worklet,
    location:{origin:'https://chzzk.naver.com',pathname:runtime.media.context.routePath},localStorage:{getItem:()=>null},
    setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  window[Symbol.for('cheese-knife.runtime.v1')]=runtime;
  const url=class extends URL{};url.createObjectURL=()=>'blob:https://chzzk.naver.com/suspend-'+(++nextUrl);url.revokeObjectURL=()=>{};
  const ProbeTextEncoder=options.capSuspendCall?class extends TextEncoder{
    encode(value){let candidate;try{candidate=JSON.parse(value);}catch{}
      if(Array.isArray(candidate)&&candidate.at(-1)?.type==='suspend-call')return new Uint8Array(480*1024+1);
      return super.encode(value);}
  }:TextEncoder;
  const box=vm.createContext({window,document,AudioContext:Context,AudioWorkletNode:Worklet,URL:url,Blob,crypto:webcrypto,
    Float32Array,Float64Array,Uint8Array,DataView,ArrayBuffer,Map,Set,Symbol,TextEncoder:ProbeTextEncoder,queueMicrotask,
    Date:class extends Date{static now(){return 1000;}},performance:{now:()=>context.currentTime*1000},btoa:value=>Buffer.from(value,'binary').toString('base64')});
  const audio=vm.runInContext(controllerCode,box).call(null,window);assert.ok(audio);
  const productConfigure=audio.configure,productReadback=audio.getReadback;
  const originalConfigure=function(...args){
    configureCalls.push({receiver:this,args});Reflect.apply(productConfigure,this,args);
    if(options.configureThrow&&plan&&video.currentSrc===plan.urls[1])throw configureError;
    return configureReturn;
  };
  Object.defineProperty(audio,'configure',{value:originalConfigure,writable:true,configurable:true,enumerable:false});
  const originalDescriptor=Object.getOwnPropertyDescriptor(audio,'configure');
  audio.getReadback=function(...args){if(throwReadback){throwReadback=false;throw snapshotError;}if(throwSnapshot){throwSnapshot=false;throw snapshotError;}return Reflect.apply(productReadback,this,args);};
  const receiver={caller:'loaded-media'},args=[Object.freeze({source:'loadeddata'}),17];
  video.play=async()=>{video.paused=false;if(plan&&video.currentSrc===plan.urls[1]){
    beforeB();try{configuredResult=Reflect.apply(audio.configure,receiver,args);}catch(error){configuredError=error;if(!options.swallowConfigure)throw error;}
  }};
  const {installSourceOwnerProbe}=await import('../scripts/audio-source-owner-probe.mjs');
  await vm.runInContext('('+installSourceOwnerProbe.toString()+')('+JSON.stringify({sampleRate:44100,profile:'suspend-rebind'})+')',box);
  const probe=window[Symbol.for('cheese-knife.source-owner-probe.v1')];
  t.after(()=>{scopes.forEach(scope=>scope.dispose());timers.clear();});
  plan=await probe.action({kind:'prepare',spec});
  await audio.prepareTransitionModule('chrome-extension://'+'a'.repeat(32)+'/web/audio-transition-worklet.js');
  const enabling=audio.setEnabled(video,true);await microtasks();
  const a=nodes.find(node=>node.type==='knife-audio-transition-l1');assert.ok(a,'actual controller must construct A');
  const reply=(kind,frame,seq=kind==='prepared'?0:1)=>({kind,sourceEpoch:a.options.processorOptions.sourceEpoch,seq,frame,meterEpoch:0,gain:kind==='completed'?1:null,code:null});
  a.receive(reply('prepared',0));await microtasks();
  assert.deepEqual(a.messages.map(packet=>[packet.seq,packet.wanted]),[[1,true]]);
  a.receive(reply('accepted',128));assert.equal(await enabling,'on');a.receive(reply('completed',1024));
  for(const capture of nodes.filter(node=>node.type==='source-owner-capture')){
    const producerId=capture.options.processorOptions.producerId,channels=producerId<2?2:5;
    for(let frame=0,sequence=1;frame<8832;frame+=128,sequence++)capture.receive({producerId,producerSequence:sequence,frame,
      samples:Array.from({length:channels},(_,channel)=>new Float32Array(128).fill(channels===5?[-1,1,1,1,0][channel]:.01))});
  }
  context.currentTime=8832/44100;
  assert.equal(audio.getReadback(video).appliedGain,1);
  const facts=()=>probe.action({kind:'facts'}),switchSource=()=>probe.action({kind:'switch',aEnd:8820});
  return {audio,video,context,a,source,nodes,plan,probe,facts,switchSource,configureCalls,configureReturn,configureError,postError,snapshotError,
    receiver,args,originalConfigure,originalDescriptor,mainTasks,configuredResult:()=>configuredResult,configuredError:()=>configuredError,
    beforeB:fn=>{beforeB=fn;},holdB:()=>{holdB=true;},releaseB:()=>releaseB(),throwSnapshot:()=>{throwSnapshot=true;}};
}

test('suspend-rebind actual controller sends OFF2 and clears A before the queued matching main task',async t=>{
  const h=await fixture(t);await h.switchSource();
  const facts=await h.facts(),events=facts.ledger,find=type=>events.find(event=>event.type===type);
  assert.equal(facts.profile,'suspend-rebind');assert.equal(facts.stimulus.method,'controlled-public-suspend');assert.equal(facts.stimulus.status,'APPLIED');assert.equal(facts.error,null);
  const off=events.find(event=>event.type==='send'&&event.nodeId===1&&event.packet.seq===2),returned=events.find(event=>event.type==='send-return'&&event.sendOrder===off?.order);
  assert.equal(off.packet.wanted,false);assert.equal(returned.currentSrc,h.plan.urls[1]);assert.equal(returned.src,h.plan.urls[1]);assert.equal(returned.wanted,true);
  const orders=[find('stimulus-restored'),find('suspend-call'),off,returned,find('suspend-return'),find('configure-call'),find('source-disconnect-attempt'),find('port-close'),find('configure-return')].map(event=>event.order);
  assert.ok(orders.every((order,index)=>index===0||order>orders[index-1]),'the real send return must precede delegation and source release');
  assert.equal(h.source.outputs.has(h.a),false);assert.equal(h.a.port.closed,true);assert.equal(h.a.port.onmessage,null);
  assert.equal(events.some(event=>event.type==='receive'&&event.nodeId===1&&event.packet.seq===2),false);
  assert.equal(h.mainTasks.length,1);const before=clone(h.audio.getReadback(h.video));h.mainTasks.shift()();assert.deepEqual(clone(h.audio.getReadback(h.video)),before);
  assert.deepEqual(h.a.messages.map(packet=>[packet.seq,packet.wanted]),[[1,true],[2,false]]);
  assert.equal(h.configuredResult(),h.configureReturn);const delegated=h.configureCalls.filter(call=>call.args===h.args||call.args[0]===h.args[0]);assert.equal(delegated.length,1);assert.equal(delegated[0].receiver,h.receiver);assert.equal(delegated[0].args[0],h.args[0]);assert.equal(delegated[0].args[1],17);
  assert.deepEqual(Object.getOwnPropertyDescriptor(h.audio,'configure'),h.originalDescriptor);
});

test('suspend-rebind rejects private setGain rebind preemption without an injected OFF',async t=>{
  const h=await fixture(t);h.beforeB(()=>h.audio.setGain(h.video,1));await h.switchSource();const facts=await h.facts();
  assert.equal(facts.stimulus.status,'NOT_OBSERVED');assert.equal(facts.ledger.some(event=>event.type==='suspend-call'),false);
  assert.equal(h.a.messages.some(packet=>packet.wanted===false),false);assert.equal(h.a.port.closed,true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(h.audio,'configure'),h.originalDescriptor);
});

test('suspend-rebind rejects a matching reply delivered inside OFF post instead of claiming a pending flight',async t=>{
  const h=await fixture(t,{inlineAck:true});await assert.rejects(h.switchSource(),/audio-source-owner/);const facts=await h.facts();
  assert.ok(facts.error);assert.notEqual(facts.stimulus.status,'APPLIED');assert.equal(h.configureCalls.filter(call=>call.args[0]===h.args[0]).length,1);
});

test('suspend-rebind rejects a matching reply received by a subscriber after normal OFF post return',async t=>{
  const h=await fixture(t);let replied=false;h.audio.subscribe(h.video,state=>{
    if(state==='pending'&&h.video.currentSrc===h.plan.urls[1]&&!replied){replied=true;
      h.a.receive({kind:'accepted',sourceEpoch:h.a.options.processorOptions.sourceEpoch,seq:2,frame:8960,meterEpoch:0,gain:null,code:null});}
  });
  await assert.rejects(h.switchSource(),/audio-source-owner/);const facts=await h.facts();
  const returned=facts.ledger.find(event=>event.type==='send-return'&&event.nodeId===1&&event.currentSrc===h.plan.urls[1]);
  const received=facts.ledger.find(event=>event.type==='receive'&&event.nodeId===1&&event.packet.seq===2);
  assert.ok(returned.order<received.order);assert.ok(facts.error);assert.notEqual(facts.stimulus.status,'APPLIED');
  assert.equal(h.configureCalls.filter(call=>call.args[0]===h.args[0]).length,1);
});

test('suspend-rebind disarms before a subscriber reenters configure and preserves the incoming delegation',async t=>{
  const h=await fixture(t);let reentered=0;h.audio.subscribe(h.video,state=>{if(state==='pending'&&h.video.currentSrc===h.plan.urls[1]&&!reentered++){h.audio.configure({reentrant:true});}});
  await assert.rejects(h.switchSource(),/audio-source-owner/);const facts=await h.facts();
  assert.ok(facts.error);assert.notEqual(facts.stimulus.status,'APPLIED');assert.equal(facts.ledger.filter(event=>event.type==='suspend-call').length,1);
  assert.equal(h.configureCalls.filter(call=>call.args[0]===h.args[0]).length,1);assert.equal(h.configuredResult(),h.configureReturn);
  const attempt=facts.ledger.find(event=>event.type==='source-disconnect-attempt'),delegate=facts.ledger.find(event=>event.type==='configure-call');assert.ok(attempt.order<delegate.order);
  assert.deepEqual(Object.getOwnPropertyDescriptor(h.audio,'configure'),h.originalDescriptor);
});

for(const fault of ['postThrow','missingReceipt'])test('suspend-rebind preserves first failure and delegates when '+fault,async t=>{
  const h=await fixture(t,{[fault]:true});await assert.rejects(h.switchSource(),/audio-source-owner/);const first=await h.facts();
  assert.ok(first.error);assert.notEqual(first.stimulus.status,'APPLIED');assert.equal(h.configureCalls.filter(call=>call.args[0]===h.args[0]).length,1);assert.equal(h.configuredResult(),h.configureReturn);
  const off=first.ledger.find(event=>event.type==='send'&&event.nodeId===1&&event.packet.seq===2);assert.ok(off);
  assert.equal(first.ledger.some(event=>event.type==='send-return'&&event.sendOrder===off.order),false);
  if(fault==='postThrow')assert.ok(first.ledger.some(event=>event.type==='send-throw'&&event.sendOrder===off.order));
  await h.probe.action({kind:'stop'});assert.equal((await h.facts()).error,first.error);
  assert.deepEqual(Object.getOwnPropertyDescriptor(h.audio,'configure'),h.originalDescriptor);
});

test('suspend-rebind ledger cap before suspend-call stops the stimulus and still delegates the original configure',async t=>{
  const h=await fixture(t,{capSuspendCall:true});await assert.rejects(h.switchSource(),/audio-source-owner-ledger-cap/);
  const first=await h.facts();assert.equal(first.error,'audio-source-owner-ledger-cap');assert.equal(first.firstFailure.error,first.error);
  assert.deepEqual(h.a.messages.map(packet=>[packet.seq,packet.wanted]),[[1,true]],'a failed call marker must prevent the actual OFF');
  assert.equal(h.configureCalls.filter(call=>call.args[0]===h.args[0]).length,1);assert.equal(h.configuredResult(),h.configureReturn);
  assert.deepEqual(Object.getOwnPropertyDescriptor(h.audio,'configure'),h.originalDescriptor);
  const stopped=await h.probe.action({kind:'stop'});assert.equal(stopped.error,first.error);assert.deepEqual(clone(stopped.firstFailure),clone(first.firstFailure));
});

for(const swallowConfigure of [false,true])test('suspend-rebind fixes original configure throw before caller '+(swallowConfigure?'swallows':'receives')+' it',async t=>{
  const h=await fixture(t,{configureThrow:true,swallowConfigure});
  await assert.rejects(h.switchSource(),error=>swallowConfigure?/audio-source-owner/.test(error.message):error===h.configureError);
  assert.equal(h.configuredError(),h.configureError);const facts=await h.facts();assert.ok(facts.error);assert.ok(facts.firstFailure);
  assert.ok(facts.ledger.some(event=>event.type==='configure-throw'));assert.equal(h.configureCalls.filter(call=>call.args[0]===h.args[0]).length,1);
  assert.deepEqual(Object.getOwnPropertyDescriptor(h.audio,'configure'),h.originalDescriptor);
});

test('suspend-rebind stop finally restores the owned descriptor even when its snapshot throws',async t=>{
  const h=await fixture(t);h.holdB();const switching=h.switchSource().then(()=>null,error=>error);
  assert.notEqual(h.audio.configure,h.originalConfigure);h.throwSnapshot();await assert.rejects(h.probe.action({kind:'stop'}),error=>error===h.snapshotError);
  assert.deepEqual(Object.getOwnPropertyDescriptor(h.audio,'configure'),h.originalDescriptor);assert.ok(await switching);
});

test('suspend-rebind stop preserves configure descriptor drift instead of overwriting its new owner',async t=>{
  const h=await fixture(t);h.holdB();const switching=h.switchSource().then(()=>null,error=>error),replacement=()=>({owner:'new'});
  Object.defineProperty(h.audio,'configure',{value:replacement,writable:true,enumerable:true,configurable:true});const drift=Object.getOwnPropertyDescriptor(h.audio,'configure');
  await h.probe.action({kind:'stop'});assert.deepEqual(Object.getOwnPropertyDescriptor(h.audio,'configure'),drift);assert.ok(await switching);
});

test('suspend-rebind actual controller receipts and probe capture survive archive and saved reader unchanged',async t=>{
  const h=await fixture(t),aFacts=await h.facts();await h.switchSource();await microtasks();
  const b=h.nodes.find(node=>node.type==='knife-audio-transition-l1'&&node!==h.a);assert.ok(b,'actual controller must construct B');
  const reply=(kind,frame)=>({kind,sourceEpoch:b.options.processorOptions.sourceEpoch,seq:kind==='prepared'?0:1,
    frame,meterEpoch:0,gain:kind==='completed'?1:null,code:null});
  b.receive(reply('prepared',8832));await microtasks();
  assert.deepEqual(b.messages.map(packet=>[packet.seq,packet.wanted]),[[1,true]]);
  b.receive(reply('accepted',8960));await microtasks();b.receive(reply('completed',9856));await microtasks();
  for(const capture of h.nodes.filter(node=>node.type==='source-owner-capture'&&node.options.processorOptions.producerId!==2)){
    const producerId=capture.options.processorOptions.producerId,channels=producerId<2?2:5;
    for(let frame=8832,sequence=producerId<2?70:1;frame<17664;frame+=128,sequence++)capture.receive({producerId,producerSequence:sequence,frame,
      samples:Array.from({length:channels},(_,channel)=>new Float32Array(128).fill(channels===5?[-1,1,1,1,0][channel]:.01))});
  }
  h.context.currentTime=17664/44100;const bFacts=await h.facts();
  assert.equal(bFacts.readback.state,'on');assert.equal(bFacts.readback.appliedGain,1);
  const {createSourceOwnerArchive,readSourceOwnerProof}=await import('../scripts/extension-e2e/audio-source-owner.mjs');
  const saved=new Map(),directory='output/playwright/installed-extension-SuspendControllerUnit';
  const files={root:process.cwd(),writeFile:async(file,value,options)=>{assert.equal(options.flag,'wx');assert.equal(saved.has(file),false);saved.set(file,Buffer.from(value));},
    readFile:async(file,encoding)=>{assert.ok(saved.has(file),'missing saved artifact '+file);return encoding?saved.get(file).toString(encoding):saved.get(file);},
    lstat:async file=>saved.has(file)?{isFile:()=>true,size:saved.get(file).length}:null};
  const archive=createSourceOwnerArchive(files,directory,spec),cursors=[0,0,0,0];let drained=false;
  for(let round=0;round<10;round++){
    const batch=await h.probe.action({kind:'drain',cursors:cursors.slice()});if(!batch.length){drained=true;break;}
    for(const row of batch){await archive.append(row);cursors[row.producerId]=row.lastReceived;}
  }
  assert.ok(drained,'all original probe packets must be drained within the fixed batch limit');
  const snapshot=await h.probe.action({kind:'stop'}),stable={
    a:{...aFacts,nodeId:1,window:{start:4410,end:8820}},b:{...bFacts,nodeId:2,window:{start:13230,end:17640}}};
  const proof=archive.proof({...snapshot,spec,stable});
  await files.writeFile(directory+'/input-plan.json',JSON.stringify(h.plan),{flag:'wx'});
  await files.writeFile(directory+'/source-owner-proof.json',JSON.stringify(proof),{flag:'wx'});
  const replay=await readSourceOwnerProof(files,directory,spec);
  assert.deepEqual(replay.proof.facts.ledger,clone(snapshot.ledger));assert.deepEqual(replay.proof.facts.nodes,clone(snapshot.nodes));
  assert.equal(replay.proof.schema,'f01-source-suspend-rebind-proof-v1');
  assert.equal(replay.assessment.pendingFlight,'MAIN_RECONSTRUCTED');assert.equal(replay.assessment.formationMethod,'controlled-public-suspend');
  assert.deepEqual(replay.assessment.windows,{a:{start:4410,end:8820},b:{start:13230,end:17640}});
  assert.equal(replay.assessment.lateReplyObservation,'NOT_OBSERVED');assert.equal(replay.assessment.lateReplyWitness,'UNASSESSED');
  assert.equal(replay.assessment.waveQuality,'UNASSESSED');assert.equal(replay.assessment.overallQualification,false);
});
