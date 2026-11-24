'use strict';
// Explicit, sequential synthetic HOST checks. Run only through the pinned supervisor.
const assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const fsNative=require('node:fs'),fsp=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),{syncBuiltinESMExports}=require('node:module');
const root=path.resolve(__dirname,'..'),clone=structuredClone;
const wallNow=process.hrtime.bigint.bind(process.hrtime),startedAt=wallNow();
const elapsed=()=>Number(wallNow()-startedAt)/1e6;
function captureHostMath(){
  const binding=Object.getOwnPropertyDescriptor(globalThis,'Math');
  assert.ok(binding&&Object.hasOwn(binding,'value')&&binding.value!==null&&typeof binding.value==='object','HOST_VM_MATH_BINDING');
  const object=binding.value;
  return {binding,object,keys:Reflect.ownKeys(object),descriptors:Object.getOwnPropertyDescriptors(object),prototype:Object.getPrototypeOf(object),extensible:Object.isExtensible(object)};
}
const hostMathBaseline=captureHostMath();
function assertHostMath(){
  const binding=Object.getOwnPropertyDescriptor(globalThis,'Math');
  assert.ok(binding&&Object.hasOwn(binding,'value'),'HOST_VM_MATH_BINDING');
  assert.equal(binding.value,hostMathBaseline.object,'HOST_VM_MATH_OBJECT');
  assert.deepEqual(binding,hostMathBaseline.binding,'HOST_VM_MATH_BINDING');
  const object=binding.value;
  assert.deepEqual(Reflect.ownKeys(object),hostMathBaseline.keys,'HOST_VM_MATH_KEYS');
  assert.equal(Object.getPrototypeOf(object),hostMathBaseline.prototype,'HOST_VM_MATH_PROTOTYPE');
  assert.equal(Object.isExtensible(object),hostMathBaseline.extensible,'HOST_VM_MATH_EXTENSIBLE');
  for(const key of hostMathBaseline.keys)assert.deepEqual(Object.getOwnPropertyDescriptor(object,key),hostMathBaseline.descriptors[key],'HOST_VM_MATH_DESCRIPTOR:'+String(key));
}
const observedEffects=[];
let observationSeq=0,observationElapsedUs=0,observationFailed=false,observationError;
function failObservation(error){
  if(!observationFailed){observationFailed=true;observationError=error;}
  process.exitCode=1;
}
// stdout failures stay secondary to the exact error from an already-started API call.
process.stdout.on('error',failObservation);
function assertObservation(){if(observationFailed)throw observationError;}
function observe(caseOrdinal,phase,event,outcome=null){
  if(observationFailed)return;
  try{
    const hostElapsedUs=Number((wallNow()-startedAt)/1000n),seq=observationSeq+1;
    assert.ok(Number.isSafeInteger(hostElapsedUs)&&hostElapsedUs>=observationElapsedUs&&hostElapsedUs>=0,'HOST_OBSERVATION_CLOCK');
    assert.ok(seq<=196&&Number.isInteger(caseOrdinal)&&caseOrdinal>=1&&caseOrdinal<=65,'HOST_OBSERVATION_RANGE');
    assert.ok(['case','fixture','wrapper','scenario'].includes(phase)&&(phase==='case'||caseOrdinal>=55),'HOST_OBSERVATION_PHASE');
    assert.ok(event==='ENTER'?outcome===null:event==='SETTLED'&&(outcome==='fulfilled'||outcome==='rejected'),'HOST_OBSERVATION_EVENT');
    const line=JSON.stringify({schema:'f01-master-host-observation-v1',seq,caseOrdinal,phase,event,outcome,hostElapsedUs})+'\n';
    assert.ok(Buffer.byteLength(line,'utf8')<=256,'HOST_OBSERVATION_BYTES');
    observationSeq=seq;observationElapsedUs=hostElapsedUs;
    process.stdout.write(line,error=>{if(error)failObservation(error);});
  }catch(error){failObservation(error);}
}
function denied(effect){return function(){observedEffects.push(effect);throw Error('HOST_FORBIDDEN_EFFECT:'+effect);};}
function forbidMethods(object,names,prefix){for(const name of names)if(typeof object[name]==='function')object[name]=denied(prefix+'.'+name);}
function guardProcessesAndNetwork(){
  forbidMethods(require('node:child_process'),['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'],'child_process');
  for(const name of ['http','https'])forbidMethods(require('node:'+name),['request','get','createServer'],name);
  forbidMethods(require('node:net'),['connect','createConnection','createServer'],'net');
  forbidMethods(require('node:tls'),['connect','createServer'],'tls');
  forbidMethods(require('node:dgram'),['createSocket'],'dgram');
  require('node:worker_threads').Worker=denied('worker_threads.Worker');
  global.fetch=denied('fetch');if(typeof global.WebSocket==='function')global.WebSocket=denied('WebSocket');
  syncBuiltinESMExports();
}
function guardInitializationWrites(){
  // Pinned library initialization may read files; it cannot create diagnostics or caches.
  forbidMethods(fsp,['appendFile','chmod','chown','copyFile','cp','link','mkdir','mkdtemp','rename','rm','rmdir','symlink','truncate','unlink','utimes','writeFile'],'fs.promises.init');
  forbidMethods(fsNative,['appendFile','appendFileSync','chmod','chmodSync','chown','chownSync','copyFile','copyFileSync','cp','cpSync','createWriteStream','link','linkSync','mkdir','mkdirSync','mkdtemp','mkdtempSync','rename','renameSync','rm','rmSync','rmdir','rmdirSync','symlink','symlinkSync','truncate','truncateSync','unlink','unlinkSync','utimes','utimesSync','writeFile','writeFileSync'],'fs.init');
  syncBuiltinESMExports();
}
function guardOperationalFiles(){
  // Module initialization's pinned synthetic JSON read happens before this guard.
  forbidMethods(fsp,['access','appendFile','chmod','chown','copyFile','cp','link','lstat','mkdir','mkdtemp','open','opendir','readFile','readdir','readlink','realpath','rename','rm','rmdir','stat','symlink','truncate','unlink','utimes','watch','writeFile'],'fs.promises');
  forbidMethods(fsNative,['access','accessSync','appendFile','appendFileSync','chmod','chmodSync','chown','chownSync','copyFile','copyFileSync','cp','cpSync','createReadStream','createWriteStream','existsSync','link','linkSync','lstat','lstatSync','mkdir','mkdirSync','mkdtemp','mkdtempSync','open','openSync','opendir','opendirSync','readFile','readFileSync','readdir','readdirSync','readlink','readlinkSync','realpath','realpathSync','rename','renameSync','rm','rmSync','rmdir','rmdirSync','stat','statSync','symlink','symlinkSync','truncate','truncateSync','unlink','unlinkSync','utimes','utimesSync','watch','watchFile','writeFile','writeFileSync'],'fs');
  syncBuiltinESMExports();
}
// Fixed HOST-only coarse lane. Slots bound diagnostics, never the original work.
let coarseSeq=0;
const coarseCases=new Map();
function createCoarse(caseOrdinal,artifact){
  const slots=Array(32).fill(null);let started=0,settled=0,active=0,capUs=0,feedUs=0,moduleUs=-1,assessmentUs=-1,flags=0,closed=false,late=false,moduleEntries=0,assessmentEntries=0;
  const stamp=()=>{const n=Number((wallNow()-startedAt)/1000n);if(!Number.isSafeInteger(n)||n<0||n>60000000)throw Error('coarse clock');return n;};
  const fault=bit=>{flags|=bit;};
  const emit=(event,op=0,at=null)=>{
    try{
      const us=at??stamp(),seq=coarseSeq+1;
      if(seq>408)throw Error('coarse rows');
      const line=JSON.stringify({schema:'f01-master-coarse-v1',seq,caseOrdinal,event,op,us,started,settled,capUs,feedUs,moduleUs,assessmentUs,flags})+'\n';
      if(Buffer.byteLength(line,'utf8')>256)throw Error('coarse bytes');
      coarseSeq=seq;process.stdout.write(line,error=>{if(error){fault(32);process.exitCode=1;}});
    }catch{fault(32);}
  };
  const afterClose=()=>{if(!closed)return false;fault(128);if(!late){late=true;emit('L');}return true;};
  const sum=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n)||n<0||n>60000000){fault(64);return 60000000;}return n;};
  const observer={
    begin(){
      try{
        if(afterClose())return 0;
        if(started===65535){fault(64);return 0;}started++;
        if(started>32){fault(1);return 0;}
        const op=started;slots[op-1]={start:stamp(),feed:0,pending:true};active++;if(active>1)fault(4);emit('B',op,slots[op-1].start);return op;
      }catch{fault(2);return 0;}
    },
    feed(op){try{if(afterClose()||!op)return;const token=slots[op-1];if(!token?.pending)throw Error('coarse token');token.feed=stamp()-token.start;if(token.feed<0)throw Error('coarse clock');}catch{fault(2);}},
    end(op,threw){
      try{
        if(afterClose()||!op)return;const token=slots[op-1];if(!token?.pending)throw Error('coarse token');
        const ended=stamp(),n=ended-token.start;if(n<0||token.feed>n)throw Error('coarse clock');
        token.pending=false;active--;settled++;capUs=sum(capUs,n);feedUs=sum(feedUs,token.feed);if(threw)fault(16);emit('E',op,ended);
      }catch{fault(2);}
    },
    write(event,file){
      try{
        if(file!==artifact+'/module.json'&&file!==artifact+'/assessment.json')return;
        if(afterClose())return;
        if(file===artifact+'/module.json'){
          if(event==='enter'){moduleEntries++;if(moduleEntries!==1)fault(8);}
          else if(event==='settled'){
            if(moduleEntries!==1||moduleUs!==-1||active)fault(8);
            if(moduleUs===-1){moduleUs=stamp();emit('M',0,moduleUs);}
          }
        }else if(event==='enter'){
          assessmentEntries++;if(assessmentEntries!==1||moduleUs<0||active)fault(8);
          if(assessmentUs===-1){assessmentUs=stamp();if(assessmentUs<moduleUs)fault(2);emit('A',0,assessmentUs);}
        }
      }catch{fault(2);}
    },
    finish(){
      try{if(afterClose())return;if(active||started!==settled||moduleUs<0||assessmentUs<moduleUs||moduleEntries!==1||assessmentEntries!==1)fault(8);closed=true;emit('F');}catch{fault(2);}
    },
  };
  coarseCases.set(caseOrdinal,observer);return observer;
}
function notifyCoarse(observer,event,file){try{observer?.(event,file);}catch{/* Preserve the original file operation. */}}
const passed=[],seenCases=new Set();
async function runCase(name,body){
  assert.equal(typeof name,'string');assert.ok(!seenCases.has(name),'duplicate HOST case');seenCases.add(name);
  assert.ok(elapsed()<45000,'HOST_DEADLINE');const before=observedEffects.length;
  const caseOrdinal=seenCases.size;observe(caseOrdinal,'case','ENTER');assertObservation();
  try{await body();}catch(error){observe(caseOrdinal,'case','SETTLED','rejected');throw error;}
  observe(caseOrdinal,'case','SETTLED','fulfilled');
  assert.equal(observedEffects.length,before,'forbidden effect was caught/hidden');assert.ok(elapsed()<45000,'HOST_DEADLINE');
  assertObservation();
  passed.push(name);process.stdout.write(JSON.stringify({schema:'f01-master-host-case-v1',name,status:'PASS'})+'\n');
  coarseCases.get(caseOrdinal)?.finish();
}

// Unapplied HOST fragment. Candidate functions are supplied by the single entry point.
async function createMasterProbeFixture(installProcessingProbe, options={}) {
  const sampleRate=options.sampleRate??44100,sourceEpoch=options.sourceEpoch??1;
  const nodes=[],blobs=[],messages=[],mediaEvents=new Map(),native=options.native??{};
  native.posts??=[];
  let activeContext,enabled=false;
  class MockAudioParam {
    constructor(value=1){this._value=value;this._automationRate='a-rate';}
    get value(){return this._value;}
    set value(value){this._value=value;}
    get automationRate(){return this._automationRate;}
    set automationRate(value){this._automationRate=value;}
    setValueAtTime(){return this;}
    linearRampToValueAtTime(){return this;}
    exponentialRampToValueAtTime(){return this;}
    setTargetAtTime(){return this;}
    setValueCurveAtTime(){return this;}
    cancelScheduledValues(){return this;}
    cancelAndHoldAtTime(){return this;}
  }
  class MockAudioNode {
    constructor(context=activeContext){this.context=context;this.connections=[];}
    connect(...args){
      if(!(this instanceof MockAudioNode))throw TypeError('native-illegal-receiver');
      this.connections.push(args);
      return args[0] instanceof MockAudioNode?args[0]:undefined;
    }
    disconnect(...args){
      if(!(this instanceof MockAudioNode))throw TypeError('native-illegal-receiver');
      this.connections=this.connections.filter(edge=>args.length&&!(typeof args[0]==='number'
        ?(edge[1]??0)===args[0]
        :edge[0]===args[0]&&(args.length<2||(edge[1]??0)===args[1])&&(args.length<3||(edge[2]??0)===args[2])));
    }
  }
  const node=extra=>Object.assign(new MockAudioNode(),extra);
  class MockAudioContext {
    constructor(config){
      this.sampleRate=config.sampleRate;this.state='running';this.currentTime=0;
      activeContext=this;this.destination=new MockAudioNode(this);
      this.audioWorklet={addModule:async()=>{}};
    }
    createMediaElementSource(element){native.sourceElement=element;return node({});}
    createGain(){return node({gain:new MockAudioParam()});}
    createDelay(){return node({delayTime:new MockAudioParam(0)});}
    createDynamicsCompressor(){return node({threshold:new MockAudioParam(0),knee:new MockAudioParam(0),ratio:new MockAudioParam(1)});}
    createWaveShaper(){return node({curve:null});}
    createChannelSplitter(channels){return node({numberOfOutputs:channels});}
    createBiquadFilter(){return node({gain:new MockAudioParam(0),frequency:new MockAudioParam(1000),Q:new MockAudioParam(1)});}
    createAnalyser(){return node({fftSize:16384,getFloatTimeDomainData(buffer){buffer.fill(0);}});}
    createConstantSource(){return node({offset:new MockAudioParam(1),start(){},stop(){}});}
    createOscillator(){return node({frequency:new MockAudioParam(1000),start(){},stop(){}});}
  }
  class MockAudioWorkletNode extends MockAudioNode {
    constructor(context,name,config){
      super(context);this.name=name;this.options=config;this.parameters=new Map();
      const handlers=[];
      this.port={onmessage:null,
        postMessage(...args){
          native.posts.push({receiver:this,args});
          native.onPost?.(...args);
          if(Object.hasOwn(native,'postError'))throw native.postError;
          return native.postReturn;
        },
        addEventListener(type,handler){if(type==='message')handlers.push(handler);},start(){}};
      this.receive=data=>{this.port.onmessage?.({data});for(const handler of handlers)handler({data});};
      nodes.push(this);
    }
  }
  const video={currentTime:0,src:'',currentSrc:'',loop:true,ended:false,playbackRate:1,paused:false,muted:false,volume:1,
    pause(){this.paused=true;},async play(){this.paused=false;},
    addEventListener(type,handler){if(type==='loadeddata')queueMicrotask(handler);else mediaEvents.set(type,handler);}};
  const readback={sources:1,state:'off',wanted:false,appliedGain:1};
  const runtime={config:{},mediaRequestId:'host-request',media:{context:{mediaId:'host-synthetic'}},audio:{
    configure(){},getReadback:()=>readback,getState:()=>enabled?'on':'off',setGain:(_,gain)=>gain,
    async setEnabled(_,value){enabled=value;return value?'on':'off';}}};
  const target={AudioContext:MockAudioContext,AudioWorkletNode:MockAudioWorkletNode,AudioNode:MockAudioNode,AudioParam:MockAudioParam,
    Symbol,setInterval:()=>1,clearInterval(){},location:{origin:'https://chzzk.naver.com'},
    normalizeConfig:()=>({}),KnifeMediaProfiles:{projectGlobalAudio:()=>({})},
    postMessage:message=>messages.push(message),addEventListener(){}};
  Object.defineProperty(target,Symbol.for('cheese-knife.runtime.v1'),{value:runtime});
  assertHostMath();
  await vm.runInNewContext(`(${installProcessingProbe.toString()})(${JSON.stringify({sampleRate,productObservation:true,masterWitness:true})})`,{
    window:target,AudioContext:MockAudioContext,AudioWorkletNode:MockAudioWorkletNode,Float32Array,Blob,Math,TextEncoder,structuredClone:clone,
    performance:{now:()=>options.wall??0},location:target.location,
    MutationObserver:class{observe(){}},document:{hidden:false,querySelector:()=>video},
    URL:{createObjectURL:blob=>{blobs.push(blob);return `blob:host-synthetic-${blobs.length}`;},revokeObjectURL(){}},
    btoa:text=>Buffer.from(text,'binary').toString('base64')
  });
  const probe=Object.getOwnPropertyDescriptor(target,Symbol.for('cheese-knife.f01-processing-probe')).value;
  const context=new target.AudioContext();
  // Signal precedes the source factory so the recorded Native argument is the same video.
  assertHostMath();
  await probe.action(options.signal??{kind:'signal',frequency:750,inputDbfs:-24,pattern:'stereo',phase:.37,durationSeconds:1});
  assertHostMath();
  const source=context.createMediaElementSource(video);
  await context.audioWorklet.addModule('chrome-extension://host-synthetic/web/audio-transition-worklet.js');
  const product=new target.AudioWorkletNode(context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch,initial:options.initial??'raw'}});
  source.connect(product);
  const gains=Array.from({length:8},()=>context.createGain()),delays=[context.createDelay(1),context.createDelay(1)];
  const compressor=context.createDynamicsCompressor(),shaper=context.createWaveShaper(),splitter=context.createChannelSplitter(5);
  gains[0].gain.value=1;gains[1].gain.value=0;
  gains[0].gain.automationRate='a-rate';gains[1].gain.automationRate='a-rate';
  const graph={S0:source,L1:product,PROGRAM:context.destination,C0:compressor,H0:shaper,T5:splitter,
    ...Object.fromEntries(gains.map((value,index)=>[`G${index}`,value])),D0:delays[0],D1:delays[1],P0:gains[0].gain,P1:gains[1].gain};
  // L1 -> CONTROL is connected by the real probe constructor, exactly once.
  for(const [from,to,output,input] of [
    ['S0','D0',0,0],['D0','G0',0,0],['G0','G3',0,0],['G3','PROGRAM',0,0],
    ['L1','C0',0,0],['L1','D1',0,0],['C0','G5',0,0],['D1','G4',0,0],
    ['G5','G6',0,0],['G4','G6',0,0],['G6','G7',0,0],['G7','G2',0,0],
    ['G2','H0',0,0],['H0','G1',0,0],['G1','PROGRAM',0,0],['L1','T5',1,0],['T5','P0',0,0],['T5','P1',1,0]
  ]){
    if(to==='P0'||to==='P1')graph[from].connect(graph[to],output);
    else graph[from].connect(graph[to],output,input);
  }
  const captures=()=>nodes.filter(value=>value.name==='f01-processing-capture').sort((a,b)=>a.options.processorOptions.producerId-b.options.processorOptions.producerId);
  function feed(frame,values=[[.25,.25],[.5,.5],[0,0,1,1,0]]){
    for(const [index,observer] of captures().entries())observer.receive({frame,samples:values[index].map(value=>value instanceof Float32Array?value:new Float32Array(128).fill(value))});
  }
  const facts=()=>probe.action({kind:'facts'}),partial=()=>probe.action({kind:'l1-partial'});
  assertHostMath();
  return {probe,context,product,source,video,nodes,blobs,messages,mediaEvents,native,runtime,readback,graph,
    get captures(){return captures();},feed,facts,partial,
    capture:(startFrame=0,endFrame=128)=>probe.action({kind:'product-capture',startFrame,endFrame}),
    seal:endFrame=>probe.action({kind:'master-seal',endFrame}),
    command(message,requestedFrame){if(requestedFrame!==undefined)context.currentTime=requestedFrame/sampleRate;return product.port.postMessage(message);},
    reply:packet=>product.receive(packet)};
}

async function runProbeCases(api, runCase) {
  const install=api.probe.installProcessingProbe;
  const meter=kind=>kind==='power'
    ?{kind,sourceEpoch:1,meterEpoch:0,meterSeq:1,observedTime:128/44100,active:true,leftPower:.01,rightPower:.01,targetDbfs:-18}
    :{kind,sourceEpoch:1,meterEpoch:0,meterSeq:1,observedTime:128/44100};
  const configure={kind:'configure',sourceEpoch:1,seq:1,wanted:false,gain:1,eq:[0,0,0,0,0,0,0,0],normalizer:false,targetDbfs:-18};
  const reply=kind=>({kind,sourceEpoch:1,seq:1,frame:128,meterEpoch:0,gain:kind==='completed'?1:null,code:null});
  const incomplete=error=>error?.message==='audio-probe-master-seal-incomplete';
  const snapshot=async f=>clone(await f.facts());
  for(const kind of ['power','read-error'])await runCase(`P capture then ${kind} preserves cursor and seals`,async()=>{
    const f=await createMasterProbeFixture(install);f.feed(0);f.context.currentTime=128/44100;
    const capture=clone(await f.capture()),before=await snapshot(f);
    assert.equal(capture.masterWitness.available,true);assert.equal(capture.masterWitness.initial,'raw');
    assert.equal(before.masterWitness.initial.sourceEpoch,1);assert.equal(before.masterWitness.initial.initial,'raw');
    assert.equal(before.masterWitness.nodes.length,17);assert.equal(before.masterWitness.edges.length,19);
    assert.deepEqual(before.masterWitness.candidates.slice(0,2).map(candidate=>[candidate.base.value,candidate.rate.value]),[[1,'a-rate'],[0,'a-rate']]);
    assert.ok(before.masterWitness.edges.every(edge=>edge.status==='succeeded'));
    assert.equal(before.masterWitness.pending,0);assert.equal(f.native.sourceElement,f.video);
    const message=meter(kind),nativeCount=f.native.posts.length;
    f.product.port.postMessage(message);
    const after=await snapshot(f);
    assert.equal(f.native.posts.length,nativeCount+1);assert.equal(f.native.posts.at(-1).receiver,f.product.port);
    assert.equal(f.native.posts.at(-1).args[0],message);
    assert.equal(after.masterWitness.cursor,before.masterWitness.cursor);assert.equal(after.masterWitness.pending,0);
    assert.equal(after.productObservation.meterDiagnostics.sent,before.productObservation.meterDiagnostics.sent+1);
    assert.equal(after.productObservation.commands.length,before.productObservation.commands.length);
    assert.equal(after.productObservation.replies.length,before.productObservation.replies.length);
    const sealed=clone(await f.seal(128));assert.equal(sealed.sealed,true);assert.equal(sealed.endFrame,128);
    assert.equal(sealed.cursor,before.masterWitness.cursor);assert.equal(sealed.pending,0);
  });
  for(const tail of ['configure','accepted','completed'])await runCase(`P capture then ${tail} rejects exact seal boundary`,async()=>{
    const f=await createMasterProbeFixture(install);f.feed(0);await f.capture();
    const before=await snapshot(f);
    if(tail==='configure')f.product.port.postMessage(configure);else f.product.receive(reply(tail));
    const after=await snapshot(f);
    assert.equal(after.masterWitness.cursor,before.masterWitness.cursor);assert.equal(after.masterWitness.pending,0);
    assert.equal(after.productObservation.streamError,'');assert.equal(after.masterWitness.available,true);
    assert.equal(after.productObservation.commands.length,before.productObservation.commands.length+(tail==='configure'?1:0));
    assert.equal(after.productObservation.replies.length,before.productObservation.replies.length+(tail==='configure'?0:1));
    await assert.rejects(()=>f.seal(128),incomplete);
    assert.equal((await f.facts()).masterWitness.sealed,false);
  });
  await runCase('P callback seal sees pending while outside seal succeeds',async()=>{
    const f=await createMasterProbeFixture(install);f.feed(0);await f.capture();
    const before=await snapshot(f);let inside,reentry;
    f.native.onPost=()=>{inside=f.facts();reentry=f.seal(128);};
    const nativeCount=f.native.posts.length;f.product.port.postMessage(meter('power'));
    assert.equal((await inside).masterWitness.pending,1);
    await assert.rejects(reentry,incomplete);
    assert.equal(f.native.posts.length,nativeCount+1);
    const after=await snapshot(f);assert.equal(after.masterWitness.cursor,before.masterWitness.cursor);
    assert.equal(after.masterWitness.pending,0);assert.equal(after.masterWitness.available,true);
    assert.equal((await f.seal(128)).sealed,true);
  });
  await runCase('P Native post preserves return object receiver and argv',async()=>{
    const returned=Object.freeze({nativeReturn:true}),f=await createMasterProbeFixture(install,{native:{postReturn:returned}});
    f.feed(0);await f.capture();const before=await snapshot(f),message=meter('read-error'),transfer=[];
    assert.equal(f.product.port.postMessage(message,transfer),returned);
    assert.equal(f.native.posts.length,1);assert.equal(f.native.posts[0].receiver,f.product.port);
    assert.equal(f.native.posts[0].args.length,2);assert.equal(f.native.posts[0].args[0],message);assert.equal(f.native.posts[0].args[1],transfer);
    const after=await snapshot(f);assert.equal(after.masterWitness.pending,0);assert.equal(after.masterWitness.cursor,before.masterWitness.cursor);
    assert.equal((await f.seal(128)).sealed,true);
  });
  await runCase('P Native post preserves first thrown object and releases pending',async()=>{
    const original=Object.freeze({nativeThrow:true}),f=await createMasterProbeFixture(install,{native:{postError:original}});
    f.feed(0);await f.capture();const before=await snapshot(f),message=meter('power');
    assert.throws(()=>f.product.port.postMessage(message),error=>error===original);
    assert.equal(f.native.posts.length,1);assert.equal(f.native.posts[0].receiver,f.product.port);assert.equal(f.native.posts[0].args[0],message);
    const after=await snapshot(f);assert.equal(after.masterWitness.pending,0);assert.equal(after.masterWitness.cursor,before.masterWitness.cursor);
    assert.equal(after.masterWitness.available,false);assert.equal(after.masterWitness.reason,'native-post');
    assert.equal(after.productObservation.meterDiagnostics.sent,before.productObservation.meterDiagnostics.sent);
    await assert.rejects(()=>f.seal(128),incomplete);
  });
}
// The oracle is a fixed piecewise input, separate from production transition/model helpers.
function masterModelFixture({end=20992,controlFault=null}={}){
  const rate=44100,names=['cold','eq-on','eq-off','compressor-on','compressor-off','normalizer-on','normalizer-off','mixed','master-off','master-on'];
  const edgeSpec=[['S0','D0',0,0],['D0','G0',0,0],['G0','G3',0,0],['G3','PROGRAM',0,0],['L1','C0',0,0],['L1','D1',0,0],['C0','G5',0,0],['D1','G4',0,0],['G5','G6',0,0],['G4','G6',0,0],['G6','G7',0,0],['G7','G2',0,0],['G2','H0',0,0],['H0','G1',0,0],['G1','PROGRAM',0,0],['L1','T5',1,0],['T5','P0',0,0],['T5','P1',1,0],['L1','CONTROL',1,0]];
  const kinds={D0:'delay',D1:'delay',C0:'compressor',H0:'shaper',S0:'source',L1:'worklet',T5:'splitter',PROGRAM:'observer',CONTROL:'observer'};
  const nodes=Array.from({length:8},(_,i)=>({id:'G'+i,kind:'gain',contextId:'CONTEXT',paramId:'P'+i})).concat(Object.entries(kinds).map(([id,kind])=>({id,kind,contextId:'CONTEXT'})));
  const candidates=Array.from({length:8},(_,i)=>({nodeId:'G'+i,paramId:'P'+i,invalid:false,reason:null,
    base:{status:i<2?'succeeded':'not-attempted',value:i<2?1-i:null,order:i<2?i*2+1:null},rate:{status:i<2?'succeeded':'not-attempted',value:i<2?'a-rate':null,order:i<2?i*2+2:null}}));
  const witness={schema:'f01-master-binding-v1',available:true,reason:null,initial:{sourceEpoch:1,initial:'raw',contextId:'CONTEXT',portId:'PORT',nodeId:'L1'},cursor:100,pending:0,sealed:true,endFrame:end,nodes,candidates,
    edges:edgeSpec.map(([from,to,output,input],i)=>({from,to,output,input,status:'succeeded',order:30+i})),selected:{dry:{nodeId:'G0',paramId:'P0'},wet:{nodeId:'G1',paramId:'P1'}}};
  const packet=(kind,seq,frame)=>({kind,sourceEpoch:1,seq,frame,meterEpoch:kind==='prepared'?0:1,gain:kind==='completed'?1:null,code:null});
  const commands=[],replies=[packet('prepared',0,0)],stages=[],checkpoints=[];
  const digest=rows=>crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const reference={schema:witness.schema,available:true,reason:null,sourceEpoch:1,initial:'raw',contextId:'CONTEXT',portId:'PORT',nodeId:'L1',cursor:100,pending:0,sealed:false,endFrame:null};
  for(let i=0;i<10;i++){
    const accepted=512+i*2048,request={frame:accepted-128,status:i===8?'off':'on'},before={commandCount:commands.length,replyCount:replies.length,commandDigest:digest(commands),replyDigest:digest(replies)};
    const mixed=i>=7;
    commands.push({requestedFrame:request.frame,message:{kind:'configure',sourceEpoch:1,seq:i+1,wanted:i!==8,gain:1,eq:mixed?[3,-3,6,-6,2,-2,4,-4]:[0,0,0,0,i===1?6:0,0,0,0],normalizer:mixed||i===5,dynamics:mixed||i===3||i===5,targetDbfs:-20}});
    replies.push(packet('accepted',i+1,accepted),packet('completed',i+1,Math.min(accepted+1700,end-1)));
    stages.push({name:names[i],cursor:i,request,before,commandCount:commands.length,replyCount:replies.length,commandDigest:digest(commands),replyDigest:digest(replies),reference:clone(reference)});
    if(i!==7)checkpoints.push({name:i===0?'cold750-zero-on':names[i],request,facts:{productObservation:{commands:clone(commands),replies:clone(replies)},masterWitness:{...clone(witness),sealed:false,endFrame:null}}});
  }
  const report={masterWitnessRequested:true,masterStages:stages,checkpoints,actions:stages.filter(s=>!['cold','mixed'].includes(s.name)).map(s=>({name:s.name,frame:s.request.frame})),facts:{masterWitness:witness,productObservation:{commands,replies}}};
  const values=f=>{
    let u=0,v=0;
    if(f>=512&&f<953){const x=(f-512)/441;u=-x;v=x;}
    else if(f>=953&&f<18042){u=-1;v=1;}
    else if(f>=18042&&f<18483){const x=(f-18042)/441;u=-1+x;v=1-x;}
    else if(f>=18944&&f<19385){const x=(f-18944)/441;u=-x;v=x;}
    else if(f>=19385){u=-1;v=1;}
    if(controlFault==='sample'&&f===0)u=.25;
    if(controlFault==='sum-only'&&f===1000){u=-.5;v=.5;}
    return [Math.fround(u),Math.fround(v)];
  };
  const archive={summary:()=>({sampleRate:rate,start:0,end}),window:(start,stop,stream)=>{
    assert.equal(stream,2);const channels=Array.from({length:5},()=>new Float32Array(stop-start));
    for(let f=start;f<stop;f++){const [u,v]=values(f);channels[0][f-start]=u;channels[1][f-start]=v;channels[2][f-start]=channels[3][f-start]=1;}
    return {start,end:stop,channels};
  }};
  return {archive,report};
}
async function runModelCases(api,runCase){
  await runCase('M/normal-independent-oracle',async()=>{
    const f=masterModelFixture(),r=api.product.assessMasterComplementary(f.archive,f.report);
    assert.equal(r.status,'CALL_MODEL_MATCH');assert.deepEqual(r.failures,[]);assert.equal(r.samples,20992);assert.equal(r.physicalOrigin,'UNPROVEN');
    assert.deepEqual(r.rows.map(x=>[x.name,x.start,x.end]),[['master-off',18042,18483],['master-on',18944,19385]]);
  });
  const faults=[
    ['initial','binding-or-initial',f=>{f.report.facts.masterWitness.initial.initial='silent-hold';}],
    ['param-owner','native-owner',f=>{f.report.facts.masterWitness.nodes[0].paramId='P7';}],
    ['prefix-digest','stage-prefix-reference',f=>{f.report.masterStages[0].commandDigest='0'.repeat(64);}],
    ['command-tail','whole-prefix',f=>{f.report.facts.productObservation.commands.push(clone(f.report.facts.productObservation.commands.at(-1)));}],
    ['reply-frame','lifecycle-frame-regression',f=>{f.report.facts.productObservation.replies.at(-1).frame=1;}],
  ];
  for(const [name,reason,mutate]of faults)await runCase('M/'+name,async()=>{const f=masterModelFixture();mutate(f);const r=api.product.assessMasterComplementary(f.archive,f.report);assert.equal(r.status,'HOLD');assert.ok(r.failures.includes(reason),JSON.stringify(r.failures));});
  for(const controlFault of ['sample','sum-only'])await runCase('M/'+controlFault,async()=>{const f=masterModelFixture({controlFault}),r=api.product.assessMasterComplementary(f.archive,f.report);assert.equal(r.status,'HOLD');assert.ok(r.failures.includes('representation-correspondence'));});
  await runCase('M/half-open-endpoint',async()=>{const f=masterModelFixture({end:19385}),r=api.product.assessMasterComplementary(f.archive,f.report);assert.equal(r.status,'HOLD');assert.ok(r.failures.includes('endpoint-unformed'),JSON.stringify(r.failures));});
}

// Source-only fragment; concatenate into the single reviewed HOST entry point.
function memoryFiles(onWrite) {
  const entries = new Map(), directories = new Set(), hooks = {};
  const missing = file => Object.assign(new Error('ENOENT: ' + file), {code:'ENOENT'});
  const bytes = file => { if (!entries.has(file)) throw missing(file); return entries.get(file); };
  const files = {
    root, entries, directories, hooks,
    async ensureDirectory(directory) { directories.add(directory); },
    async lstat(file, options) {
      await hooks.beforeStat?.(file);
      let stat;
      if (entries.has(file)) stat = {size:bytes(file).byteLength,isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false};
      else if (directories.has(file) || [...entries.keys()].some(key=>key.startsWith(file+'/'))) stat = {size:0,isFile:()=>false,isDirectory:()=>true,isSymbolicLink:()=>false};
      else if (options?.optional) stat = null;
      else throw missing(file);
      return hooks.stat ? hooks.stat(file,stat) : stat;
    },
    async writeFile(file, data, options) {
      if(onWrite)notifyCoarse(onWrite,'enter',file);
      await hooks.beforeWrite?.(file,data,options);
      if (options?.flag==='wx' && entries.has(file)) throw Object.assign(new Error('EEXIST: '+file),{code:'EEXIST'});
      entries.set(file,Buffer.from(data));
      await hooks.afterWrite?.(file,data,options);
      if(onWrite)notifyCoarse(onWrite,'settled',file);
    },
    async readFile(file, options) {
      await hooks.beforeRead?.(file);
      const value = Buffer.from(bytes(file)), encoding = typeof options==='string' ? options : options?.encoding;
      return encoding ? value.toString(encoding) : value;
    },
    async *readChunks(file) {
      const value = bytes(file);
      if (hooks.chunks) { for await (const chunk of hooks.chunks(file,value)) yield chunk; }
      else for (let offset=0,index=0;offset<value.byteLength;offset+=1048576,index++) {
        await hooks.beforeChunk?.(file,index);
        yield value.subarray(offset,Math.min(offset+1048576,value.byteLength));
      }
      await hooks.afterChunks?.(file);
    },
    async *directoryEntries(directory) {
      const names = new Set();
      for (const file of [...directories,...entries.keys()]) if (file.startsWith(directory+'/')) names.add(file.slice(directory.length+1).split('/')[0]);
      for (const name of names) yield {name};
    },
    async readdir(directory, options) {
      const result=[];
      for await (const entry of files.directoryEntries(directory)) {
        const file=directory+'/'+entry.name, directoryChild=directories.has(file)||[...entries.keys()].some(key=>key.startsWith(file+'/'));
        result.push(options?.withFileTypes?{name:entry.name,isFile:()=>entries.has(file),isDirectory:()=>directoryChild,isSymbolicLink:()=>false}:entry.name);
      }
      return result;
    },
  };
  return files;
}

async function runCostCases(api, runCase) {
  const metadataLimit=1048576, costCap=96*1048576, artifact='a', output='o';
  const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
  const exact=message=>error=>error instanceof Error && error.message===message;
  const storage=reason=>exact('audio-product-master-storage-'+reason);
  const cost=reason=>exact('audio-product-master-cost-'+reason);
  const report={masterWitnessRequested:true,masterComplementary:{status:'CALL_MODEL_MATCH'}};
  const fresh=()=>{
    const original=memoryFiles(), ledger=api.product.createMasterEvidenceFiles(original,{artifact,output});
    return {original,...ledger};
  };
  const summary=manifest=>({schema:'f01-product-observation-run-v1',ok:true,error:null,secondaryErrors:[],masterWitnessRequested:true,artifact,result:{audioProduct:clone(report)},masterCost:manifest});
  const finish=async (fixture,padTo=null)=>{
    const manifest=fixture.budget.beforeFinal(), value=summary(manifest);
    if (padTo!==null) { value.padding=''; const room=padTo-Buffer.byteLength(JSON.stringify(value)+'\n'); assert.ok(room>=0); value.padding=' '.repeat(room); }
    const data=JSON.stringify(value)+'\n';
    if (padTo!==null) assert.equal(Buffer.byteLength(data),padTo);
    await fixture.files.writeFile(output+'/summary.json',data,{flag:'wx'});
    fixture.budget.close(); fixture.budget.assertFinal();
    const expected=fixture.budget.readbackExpectation();
    return {manifest,expected,data};
  };
  const verify=(fixture,expected)=>api.product.verifyMasterStoredCost(fixture.original,{artifact,output,report,expected,check:()=>{}});

  await runCase('C-utf8-binary-private-self-and-unused-reserve',async()=>{
    const f=fresh(), text='한글\n', binary=Buffer.from([0,255,128,1]);
    await f.files.writeFile('a/text.json',text,'utf8');
    await f.files.writeFile('a/pcm.bin',binary,{flag:'wx'});
    f.budget.beginRead(()=>{});
    assert.equal(await f.files.readFile('a/text.json','utf8'),text);
    assert.deepEqual(await f.files.readFile('a/pcm.bin'),binary);
    f.original.entries.set('a/trace.zip',Buffer.from('synthetic Native-owned exclusion'));
    f.original.entries.set('a/failure.png',Buffer.from('synthetic Native-owned exclusion'));
    const done=await finish(f), result=await verify(f,done.expected);
    assert.equal(result.status,'VERIFIED'); assert.equal(result.files,3);
    assert.equal(done.expected.self.bytes,Buffer.byteLength(done.data));
    assert.equal(done.expected.self.sha256,hash(Buffer.from(done.data)));
    assert.equal(done.manifest.rows[0].bytes,Buffer.byteLength(text));
    assert.equal(done.manifest.rows[0].sha256,hash(Buffer.from(text)));
    assert.equal(done.manifest.rows[1].sha256,hash(binary));
    assert.equal(result.bytes,Buffer.byteLength(text)+binary.length+Buffer.byteLength(done.data));
    assert.equal(result.reservedUnused,4*metadataLimit);
    done.manifest.rows[0].sha256='0'.repeat(64);
    done.expected.manifest.rows[0].bytes++;
    f.budget.assertFinal();
    assert.notEqual(f.budget.readbackExpectation().manifest.rows[0].sha256,'0'.repeat(64));
    assert.equal(f.budget.readbackExpectation().manifest.rows[0].bytes,Buffer.byteLength(text));
  });
  await runCase('C-json-exactly-one-MiB',async()=>{
    const f=fresh(), data='{"pad":"'+'x'.repeat(metadataLimit-10)+'"}';
    assert.equal(Buffer.byteLength(data),metadataLimit);
    await f.files.writeFile('a/metadata.json',data);
    const done=await finish(f); assert.equal((await verify(f,done.expected)).status,'VERIFIED');
  });
  await runCase('C-unchanged-pcm-metadata-padding-over-one-MiB',async()=>{
    const f=fresh(), pcm=Buffer.from([1,2,3,4]); await f.files.writeFile('a/pcm.bin',pcm);
    await assert.rejects(f.files.writeFile('a/metadata.json','x'.repeat(metadataLimit+1)),storage('metadata'));
    assert.deepEqual(f.original.entries.get('a/pcm.bin'),pcm); assert.equal(f.budget.snapshot().writes,1);
  });
  await runCase('C-aggregate-exact-96MiB-including-self-and-unused-reserve',async()=>{
    const f=fresh(); await f.files.writeFile('a/pcm.bin',Buffer.alloc(costCap-5*metadataLimit));
    const done=await finish(f,metadataLimit), result=await verify(f,done.expected);
    assert.equal(result.status,'VERIFIED'); assert.equal(result.bytes+result.reservedUnused,costCap);
    assert.equal(result.selfBytes,metadataLimit); assert.equal(result.reservedUnused,4*metadataLimit);
  });
  await runCase('C-aggregate-reservation-plus-one-byte',async()=>{
    const f=fresh(); await assert.rejects(f.files.writeFile('a/pcm.bin',Buffer.alloc(costCap-5*metadataLimit+1)),storage('cap'));
    assert.equal(f.original.entries.size,0); assert.equal(f.budget.snapshot().writes,0);
  });
  await runCase('C-4096-files-including-self-manifest-under-one-MiB',async()=>{
    const f=fresh(); for(let i=0;i<4095;i++) await f.files.writeFile('a/f'+i,Buffer.alloc(0));
    const done=await finish(f); assert.ok(Buffer.byteLength(done.data)<=metadataLimit);
    assert.equal(done.manifest.rows.length,4095); const result=await verify(f,done.expected);
    assert.equal(result.status,'VERIFIED'); assert.equal(result.files,4096);
  });
  await runCase('C-4096-prior-files-leave-no-self-slot',async()=>{
    const f=fresh(); for(let i=0;i<4096;i++) await f.files.writeFile('a/f'+i,Buffer.alloc(0));
    assert.throws(()=>f.budget.beforeFinal(),storage('snapshot-state'));
    await assert.rejects(f.files.writeFile('a/one-more',Buffer.alloc(0)),storage('cap'));
  });
  await runCase('C-pending-write-cannot-snapshot',async()=>{
    const f=fresh(); let release; const gate=new Promise(resolve=>{release=resolve;});
    f.original.hooks.beforeWrite=()=>gate;
    const pending=f.files.writeFile('a/pending.bin',Buffer.from([1]));
    assert.equal(f.budget.snapshot().writes,1);
    try { assert.throws(()=>f.budget.beforeFinal(),storage('snapshot-state')); } finally { release(); }
    await pending; assert.equal(f.budget.snapshot().firstReason,'snapshot-state');
  });
  await runCase('C-rejected-write-retains-original-error-and-poisons-final',async()=>{
    const f=fresh(), original=new Error('synthetic-original-write-error');
    f.original.hooks.beforeWrite=()=>{throw original;};
    await assert.rejects(f.files.writeFile('a/fail.bin',Buffer.from([1])),error=>error===original);
    assert.equal(f.budget.snapshot().firstReason,'write-failed');
    f.original.hooks.beforeWrite=undefined;
    const manifest=f.budget.beforeFinal(); assert.equal(manifest.rows[0].status,'REJECTED');
    await f.files.writeFile('o/summary.json',JSON.stringify(summary(manifest)));
    f.budget.close();
    assert.throws(()=>f.budget.assertFinal(),exact('audio-product-master-live-cost-unclosed'));
  });
  for (const [name,file,message] of [
    ['duplicate','a/x','audio-product-master-storage-duplicate-path'],
    ['child-case-alias','a/X','audio-product-master-storage-duplicate-path'],
    ['root-case-alias','A/x','audio-product-master-cost-alias'],
    ['dot-segment','a/./x','audio-product-master-cost-path'],
    ['parent-segment','a/../x','audio-product-master-cost-path'],
    ['backslash','a\\x','audio-product-master-cost-path'],
    ['absolute','/a/x','audio-product-master-cost-path'],
    ['trailing-dot','a/x.','audio-product-master-cost-child'],
    ['native-owned','a/trace.zip','audio-product-master-storage-native-owned-path'],
  ]) await runCase('C-path-'+name,async()=>{
    const f=fresh(); await f.files.writeFile('a/x',Buffer.from([1]));
    await assert.rejects(f.files.writeFile(file,Buffer.from([2])),exact(message));
    assert.deepEqual(f.original.entries.get('a/x'),Buffer.from([1]));
    assert.equal(f.budget.snapshot().writes,1);
  });
  await runCase('C-FINAL_ONLY-rejects-nonself',async()=>{
    const f=fresh(); f.budget.beforeFinal();
    await assert.rejects(f.files.writeFile('a/late',Buffer.from([1])),storage('sealed'));
    assert.equal(f.original.entries.size,0);
  });
  await runCase('C-SEALED-closes-admission-before-self-write-await',async()=>{
    const f=fresh(), manifest=f.budget.beforeFinal(); let release;
    const gate=new Promise(resolve=>{release=resolve;}); f.original.hooks.beforeWrite=()=>gate;
    const pending=f.files.writeFile('o/summary.json',JSON.stringify(summary(manifest)));
    assert.equal(f.budget.snapshot().phase,'SEALED');
    try { await assert.rejects(f.files.writeFile('a/late',Buffer.from([1])),storage('sealed')); } finally { release(); }
    await pending; f.budget.close();
    assert.throws(()=>f.budget.assertFinal(),exact('audio-product-master-live-cost-unclosed'));
  });
  for (const [name,mutate,reason] of [
    ['unlisted-file',f=>f.original.entries.set('a/unlisted',Buffer.from([1])),'unlisted-file'],
    ['nonfile-child',f=>f.original.directories.add('a/nonfile'),'child-type'],
    ['missing-listed',f=>f.original.entries.delete('a/x'),'closure'],
  ]) await runCase('C-readback-'+name,async()=>{
    const f=fresh(); await f.files.writeFile('a/x',Buffer.from([1])); const done=await finish(f);
    mutate(f); await assert.rejects(verify(f,done.expected),cost(reason));
  });
  for (const [name,chunk,reason] of [
    ['string','x','chunk'],['empty',Buffer.alloc(0),'chunk'],
    ['oversize',Buffer.alloc(metadataLimit+1),'chunk'],
    ['longer-than-stat',Buffer.from([1,2]),'read-cap'],
    ['shorter-than-stat',null,'file-hash'],
  ]) await runCase('C-readback-chunk-'+name,async()=>{
    const f=fresh(); await f.files.writeFile('a/x',Buffer.from([1])); const done=await finish(f);
    f.original.hooks.chunks=async function*(file,bytes) { if(file==='a/x') { if(chunk!==null) yield chunk; } else for(let i=0;i<bytes.length;i+=metadataLimit) yield bytes.subarray(i,i+metadataLimit); };
    await assert.rejects(verify(f,done.expected),cost(reason));
  });
  for (const [name,chunk,reason] of [
    ['string','x','chunk'],['empty',Buffer.alloc(0),'chunk'],
    ['oversize',Buffer.alloc(metadataLimit+1),'chunk'],
    ['longer-than-stat',Buffer.from([1,2]),'size'],['shorter-than-stat',null,'size'],
  ]) await runCase('C-bounded-reader-chunk-'+name,async()=>{
    const f=fresh(); await f.files.writeFile('a/x',Buffer.from([1]));
    f.original.hooks.chunks=async function*(){if(chunk!==null)yield chunk;};
    f.budget.beginRead(()=>{});
    await assert.rejects(f.files.readFile('a/x'),exact('audio-product-master-read-'+reason));
  });
  await runCase('R-coherent-metadata-and-summary-rewrite-cannot-replace-private-self',async()=>{
    const f=fresh(); await f.files.writeFile('a/metadata.json','{"x":1}\n'); const done=await finish(f);
    const originalExpected=clone(done.expected), replacement=Buffer.from('{"x":2}\n');
    f.original.entries.set('a/metadata.json',replacement);
    const saved=JSON.parse(f.original.entries.get('o/summary.json').toString('utf8'));
    saved.masterCost.rows[0].sha256=hash(replacement);
    const rewritten=Buffer.from(JSON.stringify(saved)+'\n'); assert.equal(rewritten.length,done.expected.self.bytes);
    f.original.entries.set('o/summary.json',rewritten);
    assert.deepEqual(done.expected,originalExpected);
    await assert.rejects(verify(f,done.expected),cost('file-hash'));
  });
  await runCase('R-late-rejected-writer-during-final-self-stat-fails-live-final',async()=>{
    const f=fresh(); await f.files.writeFile('a/x',Buffer.from([1])); const done=await finish(f); let selfStats=0,late=0;
    f.original.hooks.beforeStat=async file=>{if(file==='o/summary.json'&&++selfStats===2){late++;await assert.rejects(f.files.writeFile('a/late',Buffer.from([2])),storage('sealed'));}};
    const result=await verify(f,done.expected); assert.equal(result.status,'VERIFIED'); assert.equal(selfStats,2); assert.equal(late,1);
    assert.throws(()=>f.budget.assertFinal(),exact('audio-product-master-live-cost-unclosed'));
    assert.equal(f.original.entries.has('a/late'),false);
  });
  await runCase('F-failureOnly-once-with-wx',async()=>{
    const f=fresh(), calls=[]; f.original.hooks.beforeWrite=(file,data,options)=>{calls.push({file,options});};
    await f.budget.failureOnly({error:'synthetic first failure'});
    assert.deepEqual(calls,[{file:'a/partial.json',options:{flag:'wx'}}]);
    assert.deepEqual(JSON.parse(f.original.entries.get('a/partial.json').toString('utf8')),{error:'synthetic first failure'});
    await assert.rejects(f.budget.failureOnly({error:'later'}),storage('failure-repeated'));
    assert.equal(calls.length,1); assert.equal(f.budget.snapshot().firstReason,'readback-failed');
  });
  await runCase('F-existing-partial-keeps-bytes-and-helper-original-error-with-no-retry',async()=>{
    const f=fresh(), original=new Error('synthetic-primary'), partial=Buffer.from('existing partial bytes'), calls=[];
    f.original.entries.set('a/partial.json',Buffer.from(partial));
    f.original.hooks.beforeWrite=(file,data,options)=>{calls.push({file,options});if(file==='a/fail')throw original;};
    let primary; try { await f.files.writeFile('a/fail',Buffer.from([1])); } catch(error) { primary=error; }
    assert.equal(primary,original); assert.equal(f.budget.snapshot().firstReason,'write-failed');
    let secondary; try { await f.budget.failureOnly({error:primary.message}); } catch(error) { secondary=error; }
    assert.equal(secondary?.code,'EEXIST'); assert.equal(primary,original);
    assert.deepEqual(f.original.entries.get('a/partial.json'),partial);
    assert.equal(f.budget.snapshot().firstReason,'write-failed');
    await assert.rejects(f.budget.failureOnly({error:'retry forbidden'}),storage('failure-repeated'));
    assert.deepEqual(calls,[{file:'a/fail',options:undefined},{file:'a/partial.json',options:{flag:'wx'}}]);
    // This checks helper identity/firstReason; wrapper primary/secondary authority needs its own caller case.
  });
}

// Unapplied source only. I uses the actual probe, scenario, wrapper, private readers and writer.
// G separately checks legacy stored semantics with synthetic raw; neither scope is Native audio.
async function integrationFixture(api,options){
  const caseOrdinal=seenCases.size;observe(caseOrdinal,'fixture','ENTER');assertObservation();
  let fixture;
  try{fixture=await createIntegrationFixture(api,options);}
  catch(error){observe(caseOrdinal,'fixture','SETTLED','rejected');throw error;}
  observe(caseOrdinal,'fixture','SETTLED','fulfilled');return fixture;
}
async function createIntegrationFixture(api,{caseId=null,sampleRate=44100,masterWitness=true,tamper=false,costTamper=false,storageFailure=false}={}) {
  const caseOrdinal=seenCases.size;
  const selected=caseId?api.product.selectProductCase(caseId):null;
  const rate=selected?.sampleRate??sampleRate,frequency=selected?.frequency??750;
  const runId='MasterHost'+rate+(selected?'T'+frequency:'D')+(masterWitness?'M':'G')+(costTamper?'Cost':storageFailure?'First':tamper?'Bad':'Good');
  const artifact='output/playwright/installed-extension-'+runId,output='output/audio-product-'+runId;
  const coarse=caseOrdinal>=55&&caseOrdinal<=60?createCoarse(caseOrdinal,artifact):null;
  const files=memoryFiles(coarse?.write),moduleBytes=Buffer.from('HOST fixed packaged transition module; no evaluation');
  const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const source=Object.freeze({sourceSha256:hash(Buffer.from('HOST synthetic attestation'))});
  files.entries.set('tests/fixtures/installed-extension/audio-live.html',Buffer.from('<html><body><video></video></body></html>'));
  files.entries.set('dist/web/audio-transition-worklet.js',moduleBytes);
  files.entries.set('extension/web/audio-transition-worklet.js',moduleBytes);
  const candidate={root,dist:path.join(root,'dist'),files:['dist/web/audio-transition-worklet.js']};
  const signal={kind:'signal',frequency,inputDbfs:-24,pattern:'stereo',phase:.37,durationSeconds:90};
  const native=masterWitness?await createMasterProbeFixture(api.probe.installProcessingProbe,{sampleRate:rate,signal}):null;
  let position=128,fed=0,enabled=false,gain=1,config={normalizerEnabled:false,eqEnabled:false,compressorEnabled:false};
  let commands=[],replies=[],installed=0,executions=0,scenarioCalls=0,sealCalls=0,captures=0,attestCalls=0,candidateCalls=0,launched=0;
  const pauses=[],actions=[],acceptedFrames=[];
  const partialOriginal=Buffer.from('HOST preexisting partial bytes; preserve exactly');
  const summaryFailure=Error('HOST summary dispatch failed');
  let summaryAttempts=0,partialAttempts=0,costRewrites=0,summaryAttempt=null;
  if(storageFailure)files.hooks.beforeWrite=(file,data,options)=>{
    if(file===output+'/summary.json'){summaryAttempts++;summaryAttempt=Buffer.from(data);assert.equal(options.flag,'wx');throw summaryFailure;}
    if(file===artifact+'/partial.json')partialAttempts++;
  };
  if(costTamper)files.hooks.afterWrite=(file)=>{
    if(file!==output+'/summary.json')return;
    costRewrites++;
    const originalSelf=files.entries.get(file),summary=JSON.parse(originalSelf.toString('utf8'));
    const row=summary.masterCost.rows.find(row=>row.file===output+'/before.json');assert.ok(row);
    const originalMetadata=files.entries.get(row.file),metadata=JSON.parse(originalMetadata.toString('utf8'));
    const digest=metadata.source.sourceSha256;metadata.source.sourceSha256=(digest[0]==='0'?'1':'0')+digest.slice(1);
    const changedMetadata=Buffer.from(JSON.stringify(metadata,null,2)+'\n');assert.equal(changedMetadata.length,originalMetadata.length);
    files.entries.set(row.file,changedMetadata);row.sha256=hash(changedMetadata);
    const changedSelf=Buffer.from(JSON.stringify(summary,null,2)+'\n');assert.equal(changedSelf.length,originalSelf.length);
    assert.notEqual(hash(changedSelf),hash(originalSelf));files.entries.set(file,changedSelf);
  };
  const packet=()=>({kind:'configure',sourceEpoch:1,seq:commands.length+1,wanted:enabled,gain,
    eq:[63,125,250,500,1000,2000,4000,8000].map(f=>config.eqEnabled?config['eq'+f]??0:0),
    normalizer:config.normalizerEnabled,dynamics:config.compressorEnabled||config.normalizerEnabled,targetDbfs:-20});
  function post() {
    if(!enabled&&!commands.length)return;
    const next=packet(),previous=commands.at(-1)?.message;
    if(previous&&JSON.stringify({...previous,seq:0})===JSON.stringify({...next,seq:0}))return;
    if(!commands.length){const prepared={kind:'prepared',sourceEpoch:1,seq:0,frame:0,meterEpoch:0,gain:null,code:null};replies.push(prepared);native?.reply(prepared);}
    const row={requestedFrame:position,message:next,mediaTime:native?native.video.currentTime:position/rate};commands.push(row);acceptedFrames.push(position+128);native?.command(next,position);
    for(const reply of [
      {kind:'accepted',sourceEpoch:1,seq:next.seq,frame:position+128,meterEpoch:1,gain:null,code:null},
      {kind:'completed',sourceEpoch:1,seq:next.seq,frame:position+128+1700,meterEpoch:1,gain,code:null}
    ]){replies.push(reply);native?.reply(reply);}
  }
  async function facts() {
    if(native)native.context.currentTime=position/rate;
    const actual=native?clone(await native.facts()):null;
    if(actual){assert.deepEqual(actual.productObservation.commands,commands);assert.deepEqual(actual.productObservation.replies,replies);}
    // Only the binder and intercepted prefix are real probe facts here; page/clock/readback are synthetic.
    return {sampleRate:rate,audioTime:position/rate,hidden:false,contextState:'running',
      signal:{frequency,inputDbfs:-24,phase:.37,channels:2,durationSeconds:90,frames:rate*90,loop:false,error:''},
      video:{muted:false,volume:1,loop:false,ended:false,paused:false,playbackRate:1,currentTime:position/rate},
      readback:{state:enabled?'on':'off',sources:commands.length?1:0,wanted:enabled,gain,appliedGain:commands.length?gain:null},
      productObservation:{sources:commands.length?1:0,l1Nodes:commands.length?1:0,commonStart:0,commonEnd:Math.floor(position/128)*128,
        invalidFrames:0,streamError:'',commands:clone(commands),replies:clone(replies),moduleLoads:['chrome-extension://host-synthetic/web/audio-transition-worklet.js']},
      ...(actual?{masterWitness:actual.masterWitness}:{})};
  }
  // Independent fixed-action oracle: only cold ON, final OFF and final ON change signed U/V.
  // Fractions stay double until each complete signed expression is converted once to Float32.
  function signed(frame,u,v,index) {
    const cold=acceptedFrames[0],off=acceptedFrames[8],on=acceptedFrames[9],length=rate/100;
    const offStart=off===undefined?Infinity:off+rate/50+(rate===44100?264:rate===48000?288:576);
    let a,b;
    if(cold===undefined||frame<cold){a=0;b=0;}
    else if(frame<cold+length){const x=(frame-cold)/length;a=Math.fround(-x);b=Math.fround(x);}
    else if(frame<offStart){a=-1;b=1;}
    else if(frame<offStart+length){const x=(frame-offStart)/length;a=Math.fround(-1+x);b=Math.fround(1-x);}
    else if(on===undefined||frame<on){a=0;b=0;}
    else if(frame<on+length){const x=(frame-on)/length;a=Math.fround(-x);b=Math.fround(x);}
    else{a=-1;b=1;}
    u[index]=a;v[index]=b;
  }
  function channels(start,count) {
    const sourceChannel=new Float32Array(count),u=new Float32Array(count),v=new Float32Array(count);
    for(let i=0;i<count;i++){
      sourceChannel[i]=Math.SQRT2*10**(-24/20)*Math.sin(2*Math.PI*frequency*(start+i)/rate+.37);
      signed(start+i,u,v,i);
    }
    return [sourceChannel,u,v];
  }
  async function capture(start,end) {
    const coarseToken=coarse?.begin();let coarseThrew=false;
    try{
    captures++;
    if(native){
      for(;fed<end;fed+=128){const [tone,u,v]=channels(fed,128);native.feed(fed,[[.2,.2],[tone,tone],[u,v,1,1,0]]);}
      coarse?.feed(coarseToken);
      native.context.currentTime=position/rate;
      const record=clone(await native.capture(start,end));
      assert.equal(record.start,start);assert.equal(record.end,end);assert.equal(record.masterWitness.available,true);
      assert.deepEqual(record.commands,commands);assert.deepEqual(record.replies,replies);
      return record;
    }
    const [tone,u,v]=channels(start,end-start);
    const rows=[[new Float32Array(end-start).fill(.2),new Float32Array(end-start).fill(.2)],[tone,tone],[u,v,new Float32Array(end-start).fill(1),new Float32Array(end-start).fill(1),new Float32Array(end-start)]];
    return {schema:'f01-product-window-v1',sampleRate:rate,start,end,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',commands:clone(commands),replies:clone(replies),
      streams:rows.map(ch=>{const bytes=Buffer.alloc((end-start)*ch.length*4);for(let n=0;n<end-start;n++)for(let c=0;c<ch.length;c++)bytes.writeFloatLE(ch[c][n],(n*ch.length+c)*4);return {start,end,channels:ch.length,encoding:'interleaved-float32le',base64:bytes.toString('base64')};})};
    }catch(error){coarseThrew=true;throw error;}finally{coarse?.end(coarseToken,coarseThrew);}
  }
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},
    waitForTimeout:async milliseconds=>{pauses.push(milliseconds);position+=Math.round(milliseconds*rate/1000);},
    locator:()=>({click:async()=>{enabled=true;post();}}),
    evaluate:async(fn,arg)=>{
      if(fn.name==='installProcessingProbe'){installed++;assert.deepEqual(arg,{sampleRate:rate,productObservation:true,...masterWitness?{masterWitness:true}:{}});return;}
      actions.push(arg.kind);
      if(arg.kind==='signal'){assert.deepEqual(arg,signal);return;}
      if(arg.kind==='facts')return facts();
      if(arg.kind==='configure'){enabled=arg.enabled;gain=arg.gain;config={...config,...arg.config};post();return {status:enabled?'on':'off',frame:position};}
      if(arg.kind==='video'){assert.deepEqual(arg,{kind:'video',muted:false,volume:1});return;}
      if(arg.kind==='product-capture')return capture(arg.startFrame,arg.endFrame);
      if(arg.kind==='master-seal'){assert.ok(native);sealCalls++;return native.seal(arg.endFrame);}
      if(arg.kind==='l1-partial')return native?native.partial():{streams:[]};
      throw Error('HOST unexpected scenario action '+arg.kind);
    }};
  const worker={evaluate:async(_fn,arg)=>{if(typeof arg==='string'){assert.equal(arg,'chrome-extension://host-synthetic/web/audio-transition-worklet.js');return Array.from(moduleBytes);}assert.equal(arg,undefined);}};
  const context={route:async()=>{},newPage:async()=>page};
  function corruptControl(report) {
    const row=report.archive.artifacts.find(r=>r.channels===5);
    assert.ok(row,'control artifact must exist');
    const bytes=Buffer.from(files.entries.get(row.file));assert.equal(bytes.readFloatLE(0),0);assert.equal(bytes.readFloatLE(4),0);
    bytes.writeFloatLE(-.125,0);bytes.writeFloatLE(.125,4);files.entries.set(row.file,bytes);row.sha256=hash(bytes);
    const metaRow=report.archive.artifacts.find(r=>r.kind==='metadata'&&r.start===row.start&&r.end===row.end);
    assert.ok(metaRow);const meta=JSON.parse(files.entries.get(metaRow.file).toString('utf8'));
    const control=meta.streams.find(r=>r.file===row.file);assert.ok(control);control.sha256=row.sha256;
    const encoded=Buffer.from(JSON.stringify(meta,null,2)+'\n');files.entries.set(metaRow.file,encoded);metaRow.bytes=encoded.length;metaRow.sha256=hash(encoded);
    files.entries.set(artifact+'/assessment.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));
  }
  const deps={platform:'win32',files,
    attest:async(current,required)=>{attestCalls++;assert.ok(Array.isArray(required)&&required.includes('scripts/check-product-audio.mjs'));assert.equal(current.root,root);return source;},
    verifyCandidate:async(id,directory)=>{candidateCalls++;assert.equal(id,runId);assert.equal(directory,root);return candidate;},
    launchVisibilityBrowser:async()=>{launched++;throw Error('HOST forbidden browser launch');},
    execute:async options=>{
      executions++;assert.equal(options.runId,runId);assert.equal(options.qualification,'media-tab');assert.equal(options.retainEvidence,true);
      const shared=await options.dependencies.openRepository();assert.equal(shared.root,files.root);
      // This writer is the actual wrapper-created ledger, not an independent scenario writer.
      if(masterWitness)assert.notEqual(shared.writeFile,files.writeFile);else assert.equal(shared,files);
      const produced=await options.dependencies.verifyCandidate(runId,root,{});assert.equal(produced.dist,candidate.dist);
      observe(caseOrdinal,'scenario','ENTER');assertObservation();scenarioCalls++;let result;
      try{result=await options.dependencies.mediaScenario({context,worker,extensionId:'host-synthetic',artifactPath:path.join(root,artifact)});}
      catch(error){observe(caseOrdinal,'scenario','SETTLED','rejected');throw error;}
      observe(caseOrdinal,'scenario','SETTLED','fulfilled');
      assert.equal(result.audioProduct.passed,true);assert.equal(result.audioProduct.qualityAssessed,true);
      assert.deepEqual(result.audioProduct.failures,[]);assert.equal(result.audioProduct.facts.productObservation.commands.length,10);
      // Trace is Native-owned and excluded from the selected writer, represented only by a regular Map file.
      files.entries.set(artifact+'/trace.zip',Buffer.from('HOST trace placeholder, never a ZIP reader input'));
      if(tamper)corruptControl(result.audioProduct);
      if(storageFailure)files.entries.set(artifact+'/partial.json',Buffer.from(partialOriginal));
      return {...result,ok:true,source,after:source,profileRetained:true,candidateRetained:true,
        shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}};
    }};
  async function run() {
    observe(caseOrdinal,'wrapper','ENTER');assertObservation();let result;
    try{result=await api.wrapper.runProductAudio({runId,...caseId?{caseId}:{sampleRate:rate},...masterWitness?{masterWitness:true}:{}},deps);}
    catch(error){observe(caseOrdinal,'wrapper','SETTLED','rejected');throw error;}
    observe(caseOrdinal,'wrapper','SETTLED','fulfilled');
    assert.equal(installed,1);assert.equal(executions,1);assert.equal(scenarioCalls,1);assert.equal(candidateCalls,1);assert.equal(attestCalls,2);assert.equal(launched,0);
    assert.deepEqual(pauses,[1300,...Array(6).fill([300,1500]).flat(),7000,300,1500,300,1500]);
    assert.ok(captures>=23);assert.equal(commands.length,10);assert.equal(replies.length,21);assert.equal(commands[0].requestedFrame,128);
    assert.equal(commands[7].requestedFrame,128+Math.round((1300+6*1800)*rate/1000));
    assert.equal(commands[8].requestedFrame,commands[7].requestedFrame+7*rate);
    assert.equal(commands[9].requestedFrame,commands[8].requestedFrame+Math.round(1.8*rate));
    assert.equal(result.audioProduct.archive.end,Math.floor(position/128)*128);
    const summary=JSON.parse(files.entries.get(output+'/summary.json').toString('utf8'));
    assert.deepEqual(summary.candidate,summary.candidateAfter);
    assert.deepEqual(summary.candidate,[{file:'dist/web/audio-transition-worklet.js',bytes:moduleBytes.length,sha256:hash(moduleBytes)}]);
    assert.deepEqual(summary.before,source);assert.deepEqual(summary.after,source);
    if(masterWitness){
      assert.equal(sealCalls,1);assert.equal(result.audioProduct.masterComplementary.status,'CALL_MODEL_MATCH');
      assert.equal(result.masterStoredCost.status,'VERIFIED');assert.equal(summary.masterCost.state,'PENDING_INDEPENDENT_READBACK');
      const selectedFiles=[...files.entries].filter(([name])=>(name.startsWith(artifact+'/')||name.startsWith(output+'/'))&&!name.endsWith('/trace.zip'));
      assert.equal(result.masterStoredCost.files,selectedFiles.length);
      assert.equal(result.masterStoredCost.bytes,selectedFiles.reduce((sum,[,bytes])=>sum+bytes.length,0));
      assert.ok(!summary.masterCost.rows.some(row=>row.file.endsWith('/trace.zip')));
    }else{
      assert.equal(sealCalls,0);for(const key of ['masterWitnessRequested','masterComplementary','masterStages'])assert.equal(Object.hasOwn(result.audioProduct,key),false);
      assert.equal(Object.hasOwn(result,'masterStoredCost'),false);assert.equal(Object.hasOwn(summary,'masterCost'),false);
      for(const row of result.audioProduct.archive.artifacts.filter(row=>row.kind==='metadata'))assert.equal(Object.hasOwn(JSON.parse(files.entries.get(row.file).toString('utf8')),'masterWitness'),false);
    }
    return result;
  }
  return {run,files,artifact,output,partialOriginal,summaryFailure,
    get summaryAttempts(){return summaryAttempts;},get partialAttempts(){return partialAttempts;},get costRewrites(){return costRewrites;},get summaryAttempt(){return summaryAttempt;},
    get scenarioCalls(){return scenarioCalls;},get sealCalls(){return sealCalls;},get launched(){return launched;}};
}

async function runIntegrationCases(api,runCase) {
  for(const caseId of [null,'44100/transition/250']){
    const label=caseId??'no-spec 44100/750';
    await runCase('I '+label+' actual scenario/private-reader/writer receipt positive',async()=>{
      const fixture=await integrationFixture(api,{caseId});await fixture.run();
    });
    await runCase('I '+label+' rehashed control rejected by actual private semantic reader',async()=>{
      const fixture=await integrationFixture(api,{caseId,tamper:true});
      await assert.rejects(fixture.run,error=>{
        assert.equal(error.message,'audio-product-observation-failed');
        assert.equal(error.error?.message,caseId?'audio-product-transition-master-assessment':'audio-product-750-master-assessment');
        return true;
      });
      assert.equal(fixture.scenarioCalls,1);assert.equal(fixture.sealCalls,1);assert.equal(fixture.launched,0);
      const summary=JSON.parse(fixture.files.entries.get(fixture.output+'/summary.json').toString('utf8'));
      assert.equal(summary.ok,false);assert.equal(summary.error.message,caseId?'audio-product-transition-master-assessment':'audio-product-750-master-assessment');
    });
  }
  await runCase('I coherent metadata manifest and same-length self rewrite rejects private dispatch receipt',async()=>{
    const fixture=await integrationFixture(api,{costTamper:true});
    await assert.rejects(fixture.run,error=>{
      assert.equal(error.message,'audio-product-observation-failed');assert.equal(error.error?.message,'audio-product-master-cost-file-hash');
      assert.deepEqual(error.secondaryErrors,[]);return true;
    });
    assert.equal(fixture.costRewrites,1);assert.equal(fixture.scenarioCalls,1);assert.equal(fixture.sealCalls,1);assert.equal(fixture.launched,0);
    const failure=JSON.parse(fixture.files.entries.get(fixture.artifact+'/partial.json').toString('utf8'));
    assert.equal(failure.schema,'f01-master-cost-failure-v1');assert.equal(failure.primary.message,'audio-product-master-cost-file-hash');
    assert.equal(failure.costFailure.message,'audio-product-master-cost-file-hash');
  });
  await runCase('F actual semantic primary survives summary write failure and partial wx collision without retry',async()=>{
    const fixture=await integrationFixture(api,{tamper:true,storageFailure:true});
    await assert.rejects(fixture.run,error=>{
      assert.equal(error.message,'audio-product-observation-failed');assert.equal(error.error?.message,'audio-product-750-master-assessment');
      assert.equal(error.secondaryErrors.length,2);assert.equal(error.secondaryErrors[0].message,fixture.summaryFailure.message);
      assert.equal(error.secondaryErrors[1].code,'EEXIST');assert.equal(error.secondaryErrors[1].message,'EEXIST: '+fixture.artifact+'/partial.json');return true;
    });
    assert.equal(fixture.summaryAttempts,1);assert.equal(fixture.partialAttempts,1);assert.equal(fixture.scenarioCalls,1);assert.equal(fixture.launched,0);
    assert.deepEqual(fixture.files.entries.get(fixture.artifact+'/partial.json'),fixture.partialOriginal);
    assert.equal(fixture.files.entries.has(fixture.output+'/summary.json'),false);
    assert.equal(JSON.parse(fixture.summaryAttempt.toString('utf8')).error.message,'audio-product-750-master-assessment');
  });
  for(const settings of [{sampleRate:44100},{sampleRate:48000},{sampleRate:96000},{caseId:'44100/transition/250'},{caseId:'44100/transition/1000'}]){
    await runCase('G no-opt-in synthetic stored replay '+(settings.caseId??settings.sampleRate+'/750'),async()=>{
      const fixture=await integrationFixture(api,{...settings,masterWitness:false});await fixture.run();
    });
  }
}

async function main(){
  assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,['--max-old-space-size=256']);
  for(const key of Object.keys(process.env))assert.ok(!/^(NODE_|PW|PLAYWRIGHT_|ESBUILD_|DEBUG)/i.test(key),'preload/init environment: '+key);
  guardProcessesAndNetwork();guardInitializationWrites();
  const api={probe:await import(pathToFileURL(path.join(root,'scripts/audio-processing-probe.mjs'))),product:await import(pathToFileURL(path.join(root,'scripts/extension-e2e/audio-product.mjs'))),wrapper:await import(pathToFileURL(path.join(root,'scripts/check-product-audio.mjs')))};
  assert.deepEqual(observedEffects,[],'module initialization attempted an operational effect');assertHostMath();guardOperationalFiles();
  const groups=[['P',8,runProbeCases],['M',9,runModelCases],['C/R/F',37,runCostCases],['I/G',11,runIntegrationCases]],counts={};
  for(const [name,count,run]of groups){const before=passed.length;await run(api,runCase);assert.equal(passed.length-before,count,'incomplete group '+name);counts[name]=count;}
  assert.equal(passed.length,65);assert.deepEqual(observedEffects,[]);
  assertObservation();assertHostMath();assert.equal(observationSeq,196,'incomplete HOST observations');
  process.stdout.write(JSON.stringify({schema:'f01-master-host-complete-v1',status:'PASS',count:65,groups:counts,scope:'synthetic call-model and same-run stored admission only; Native and actual master/3Fs/R5/F01 remain HOLD'})+'\n');
}
main().catch(error=>{process.stderr.write(JSON.stringify({schema:'f01-master-host-stop-v1',status:'STOP',passed:passed.length,error:String(error),stack:String(error?.stack??''),effects:observedEffects,...observationFailed?{observationFailure:'HOST_OBSERVATION_FAILED'}:{}})+'\n');process.exitCode=1;});

