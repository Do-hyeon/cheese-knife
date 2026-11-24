const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');

const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const configure=seq=>({kind:'configure',sourceEpoch:1,seq,wanted:false,gain:1,eq:[0,0,0,0,0,0,0,0],normalizer:false,targetDbfs:-18});
const reply=(kind,seq,frame,extra={})=>({kind,sourceEpoch:1,seq,frame,meterEpoch:0,gain:kind==='completed'?1:null,code:null,...extra});
const literalBytes=(hex,frames)=>Buffer.concat(Array.from({length:frames},()=>Buffer.from(hex,'hex')));

const retainedOptions={sampleRate:44100,productObservation:true,oracleEvidence:true,normalizerWitness:true,normalizerControl:true,normalizerSignal:true,retainSignal:true};
test('retained wait and freeze returns live facts until both ACK and PCM tail exist',async()=>{
  const f=await fixture(retainedOptions,0,undefined,{state:'running',currentTime:0,captureIntervals:true}),endFrame=771750,commonEnd=771840;
  f.product.receive(reply('prepared',0,0));await f.probe.action({kind:'reset-events'});
  const action={kind:'freeze-normalizer',endFrame,waitForReady:true};
  await assert.rejects(()=>f.probe.action({...action,endFrame:endFrame-1}),/freeze-bound/);
  const analyser=f.context.createAnalyser(),buffer=new Float32Array(16384);
  f.interval(()=>analyser.getFloatTimeDomainData(buffer),100);
  f.native.intervalCallbacks[0]();
  f.feed(0);
  const rawPending=await f.probe.action(action),pending=plain(rawPending);
  assert.equal(pending.normalizerControl.frozenAt,null);assert.equal(pending.oracleEvidence.ledger.events,undefined);
  const live=plain(await f.probe.action({kind:'facts'}));
  for(const key of ['meterTickReads','bins','powerReads']){
    assert.ok(live[key].length>0,key);
    assert.equal(Object.hasOwn(rawPending,key),false,key);
    delete live[key];
  }
  live.normalizerControl.observedAt.wall=pending.normalizerControl.observedAt.wall;
  assert.deepEqual(pending,live,'all other live fields survive');
  for(let frame=128;frame<commonEnd;frame+=128)f.feed(frame);
  f.context.currentTime=commonEnd/44100;
  f.product.port.postMessage({kind:'read-error',sourceEpoch:1,meterEpoch:0,meterSeq:1,observedTime:f.context.currentTime});
  assert.equal((await f.probe.action(action)).normalizerControl.frozenAt,null);
  f.product.receive({...reply('meter-accepted',1,commonEnd),code:'error',application:null});
  assert.equal((await f.probe.action(action)).normalizerControl.frozenAt,null);
  f.feed(commonEnd);f.context.currentTime=20;
  const frozen=await f.probe.action(action);
  assert.equal(frozen.normalizerControl.signalEndFrame,endFrame);
  assert.equal(frozen.normalizerControl.frozenAt.frame,882000);
  assert.equal(frozen.productObservation.commonEnd,commonEnd+128);
  assert.ok(Array.isArray(frozen.oracleEvidence.ledger.events));
  assert.equal(frozen.meterTickReads.length,1);
  assert.equal(frozen.powerReads.length,1);
  assert.ok(frozen.bins.length>0);
  assert.deepEqual(plain(await f.probe.action({kind:'facts',fullOracle:true})),plain(frozen));
});
test('retained pending response leaves full facts and partial evidence available after a stream failure',async()=>{
  const f=await fixture(retainedOptions,0,undefined,{state:'running',currentTime:0,captureIntervals:true});
  f.product.receive(reply('prepared',0,0));await f.probe.action({kind:'reset-events'});
  const analyser=f.context.createAnalyser(),buffer=new Float32Array(16384);
  f.interval(()=>analyser.getFloatTimeDomainData(buffer),100);
  f.native.intervalCallbacks[0]();
  f.feed(0);
  const action={kind:'freeze-normalizer',endFrame:771750,waitForReady:true};
  assert.equal(Object.hasOwn(await f.probe.action(action),'powerReads'),false);
  f.feed(256);
  await assert.rejects(()=>f.probe.action(action),/freeze-invalid/);
  const facts=plain(await f.probe.action({kind:'facts',fullOracle:true}));
  const partial=plain(await f.probe.action({kind:'l1-partial'}));
  assert.equal(facts.normalizerControl.frozenAt,null);
  assert.equal(facts.meterTickReads.length,1);assert.equal(facts.powerReads.length,1);assert.ok(facts.bins.length>0);
  assert.deepEqual(partial.normalizerControl.attempts,facts.normalizerControl.attempts);
  assert.deepEqual(partial.oracleEvidence.ledger.events,facts.oracleEvidence.ledger.events);
  assert.ok(partial.firstStreamFailure);
  assert.deepEqual(partial.firstStreamFailure,facts.productObservation.firstStreamFailure);
  assert.equal(partial.retention.exported,false);
});
test('retained tone signal preserves prefix and freezes export metadata',async()=>{
  const f=await fixture(retainedOptions);f.product.receive(reply('prepared',0,0));await f.probe.action({kind:'reset-events'});
  for(let frame=0;frame<771750;frame+=128)f.feed(frame);
  const live=await f.probe.action({kind:'facts'});assert.ok(live.productObservation.commonStart>0);assert.deepEqual(plain(live.productObservation.bufferedChunks),[2000,2000,2000]);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),/retained-not-frozen/);
  f.context.currentTime=771840/44100;const frozen=plain(await f.probe.action({kind:'freeze-normalizer',endFrame:771750}));assert.equal(frozen.productObservation.commonStart,0);assert.equal(frozen.productObservation.commonEnd,771840);
  f.context.currentTime=40;f.context.state='closed';f.readback.wanted=true;f.video.currentTime=50;f.feed(771840);
  const raw=plain(await f.probe.action({kind:'product-capture',startFrame:0,endFrame:44100}));
  assert.deepEqual(raw.observedStarts,{program:0,source:0,control:0});assert.equal(raw.audioTime,frozen.audioTime);assert.equal(raw.mediaTime,frozen.video.currentTime);assert.equal(raw.contextState,'running');assert.deepEqual(raw.readback,frozen.readback);assert.deepEqual(raw.recordingCutoff,frozen.normalizerControl.frozenAt);
  assert.deepEqual(Buffer.from(raw.streams[0].base64,'base64'),literalBytes('0000803e0000803e',44100));assert.equal(frozen.productObservation.retention.bytes,27786240);assert.equal(frozen.productObservation.retention.cap,33554432);
  const tail=await f.probe.action({kind:'product-capture',startFrame:749700,endFrame:771840});assert.equal(tail.end-tail.start,22140);
});
test('retained capture rejects other rates or profiles and preserves first history overflow',async()=>{
  for(const changes of [{sampleRate:48000},{normalizerSignal:false},{retainSignal:'true'}])await assert.rejects(()=>fixture({...retainedOptions,...changes}),/retain/);
  const f=await fixture(retainedOptions);f.product.receive(reply('prepared',0,0));await f.probe.action({kind:'reset-events'});for(let frame=0;frame<882304;frame+=128)f.feed(frame);
  const first=plain(await f.probe.action({kind:'facts'}));assert.match(first.productObservation.streamError,/retained-history-bound/);const bytes=first.productObservation.retention.bytes;
  f.feed(999999);const later=plain(await f.probe.action({kind:'facts'}));assert.equal(later.productObservation.streamError,first.productObservation.streamError);assert.equal(later.productObservation.retention.bytes,bytes);
  const partial=await f.probe.action({kind:'l1-partial'});assert.equal(partial.retention.exported,false);assert.equal(partial.retention.bytes,bytes);
});
for(const fault of ['gap','nonfinite'])test('retained first '+fault+' cannot become a valid suffix',async()=>{
  const f=await fixture(retainedOptions);f.product.receive(reply('prepared',0,0));await f.probe.action({kind:'reset-events'});f.feed(0);if(fault==='gap')f.feed(256);else f.send(0,128,[NaN,.25]);
  const before=plain(await f.probe.action({kind:'facts'}));f.feed(384);const after=plain(await f.probe.action({kind:'facts'}));assert.ok(before.productObservation.streamError||before.productObservation.invalidFrames);assert.equal(after.productObservation.retention.bytes,before.productObservation.retention.bytes);
  f.context.currentTime=17.6;await assert.rejects(()=>f.probe.action({kind:'freeze-normalizer',endFrame:771750}),/invalid/);
});

test('signal recording freezes atomically while native reads, timers and product ports continue',async()=>{
  const f=await fixture({sampleRate:48000,productObservation:true,oracleEvidence:true,normalizerWitness:true,normalizerControl:true,normalizerSignal:true},0,undefined,{state:'running',currentTime:0,captureIntervals:true});
  f.product.receive(reply('prepared',0,0));f.product.port.postMessage(configure(1));
  const marker=await f.probe.action({kind:'reset-events'}),left=f.context.createAnalyser(),buffer=new Float32Array(16384);
  let callbacks=0,delivered=0;f.product.port.onmessage=()=>delivered++;f.interval(()=>{callbacks++;left.getFloatTimeDomainData(buffer);},100);
  await assert.rejects(()=>f.probe.action({kind:'analysis-error',enabled:true}),/signal/);await assert.rejects(()=>f.probe.action({kind:'stall',milliseconds:240}),/signal/);
  assert.equal(await f.probe.action({kind:'freeze-normalizer',endFrame:128}),null,'missing PCM cannot freeze');
  f.feed(0);f.context.currentTime=128/48000;
  const frozen=plain(await f.probe.action({kind:'freeze-normalizer',endFrame:128}));
  assert.ok(frozen?.normalizerControl.frozenAt,'explicit signal recording cutoff must form');assert.equal(marker.frame,0);assert.equal(frozen.normalizerControl.signalEndFrame,128);
  assert.deepEqual(frozen.normalizerControl.observedAt,frozen.normalizerControl.frozenAt);
  for(let i=0;i<450;i++){buffer.fill(9);f.native.intervalCallbacks[0]();assert.equal(buffer[0],Math.fround(.01));}
  f.context.currentTime=30;f.feed(128);f.product.port.postMessage({kind:'read-error',sourceEpoch:1,meterSeq:99,meterEpoch:0,observedTime:30});f.product.receive(reply('completed',1,128));
  assert.equal(callbacks,450);assert.equal(delivered,1);assert.equal(f.native.posts.length,2,'actual post remains active after cutoff');
  assert.deepEqual(plain(await f.probe.action({kind:'facts',fullOracle:true})),frozen,'no new receipts or clock reinterpretation after cutoff');
  frozen.powerReads.push({bad:true});assert.equal((await f.probe.action({kind:'facts',fullOracle:true})).powerReads.length,0);
  const partial=plain(await f.probe.action({kind:'l1-partial'}));assert.deepEqual(partial.normalizerControl.frozenAt,frozen.normalizerControl.frozenAt);assert.equal(partial.streamError,'');
  await assert.rejects(()=>f.probe.action({kind:'freeze-normalizer',endFrame:128}),/frozen/);
});
test('signal freeze rejects expired history and an incomplete observer profile',async()=>{
  await assert.rejects(()=>fixture({sampleRate:48000,productObservation:true,normalizerSignal:true}),/normalizer-signal/);
  const f=await fixture({sampleRate:48000,productObservation:true,oracleEvidence:true,normalizerWitness:true,normalizerControl:true,normalizerSignal:true});
  f.product.receive(reply('prepared',0,0));await f.probe.action({kind:'reset-events'});f.feed(0);f.context.currentTime=20+128/48000;
  await assert.rejects(()=>f.probe.action({kind:'freeze-normalizer',endFrame:128}),/bound/);
});
test('signal cutoff waits for both the last actual meter ACK and its retained PCM frame',async()=>{
  const f=await fixture({sampleRate:48000,productObservation:true,oracleEvidence:true,normalizerWitness:true,normalizerControl:true,normalizerSignal:true});
  f.product.receive(reply('prepared',0,0));await f.probe.action({kind:'reset-events'});f.feed(0);f.context.currentTime=128/48000;
  f.product.port.postMessage({kind:'read-error',sourceEpoch:1,meterEpoch:0,meterSeq:1,observedTime:0});
  assert.equal(await f.probe.action({kind:'freeze-normalizer',endFrame:128}),null);
  f.product.receive({...reply('meter-accepted',1,128),code:'error',application:null});
  assert.equal(await f.probe.action({kind:'freeze-normalizer',endFrame:128}),null);
  f.feed(128);f.context.currentTime=256/48000;assert.ok((await f.probe.action({kind:'freeze-normalizer',endFrame:128})).normalizerControl.frozenAt);
});

test('explicit N control receipts preserve injected failed read separately from successful powers',async()=>{
  const options={sampleRate:48000,productObservation:true,oracleEvidence:true,normalizerWitness:true,normalizerControl:true},f=await fixture(options,0,undefined,{state:'running',currentTime:0,captureIntervals:true});
  const left=f.context.createAnalyser(),right=f.context.createAnalyser(),buffer=new Float32Array(16384);
  left.getFloatTimeDomainData(buffer);right.getFloatTimeDomainData(buffer);
  await f.probe.action({kind:'reset-events'});
  await f.probe.action({kind:'stall',milliseconds:240});await f.probe.action({kind:'analysis-error',enabled:true});
  assert.throws(()=>left.getFloatTimeDomainData(buffer),/synthetic-native-analysis-fault/);
  const first=plain(await f.probe.action({kind:'facts'}));assert.ok(first.normalizerControl,'control receipts must be available on the explicit profile');
  assert.equal(first.reads,3);assert.equal(first.powerReads.length,2);assert.equal(first.normalizerControl.attempts.length,3);assert.equal(first.normalizerControl.attempts[2].index,0);assert.equal(first.normalizerControl.attempts[2].fault,true);assert.equal(first.normalizerControl.attempts[2].error,'synthetic-native-analysis-fault');assert.equal(first.normalizerControl.events.length,2);
  first.powerReads[0].power=123;first.normalizerControl.attempts[0].time=123;
  const again=plain(await f.probe.action({kind:'facts'}));assert.notEqual(again.powerReads[0].power,123);assert.notEqual(again.normalizerControl.attempts[0].time,123);
  const partial=plain(await f.probe.action({kind:'l1-partial'}));assert.ok(partial.normalizerControl,'partial rings must retain the same fault receipts before restoration');assert.deepEqual(partial.normalizerControl.attempts,again.normalizerControl.attempts);
  await f.probe.action({kind:'analysis-error',enabled:false});const closed=plain(await f.probe.action({kind:'facts'}));assert.equal(closed.normalizerControl.events.length,3);assert.equal(closed.normalizerControl.events[2].enabled,false);
  await assert.rejects(()=>f.probe.action({kind:'analysis-error',enabled:true}),/control/);await assert.rejects(()=>f.probe.action({kind:'reset-events'}),/control/);
});
test('N control option cannot be enabled on a legacy or incomplete observer',async()=>{
  for(const options of [{sampleRate:48000,normalizerControl:true},{sampleRate:48000,productObservation:true,normalizerControl:true},{sampleRate:48000,productObservation:true,oracleEvidence:true,normalizerControl:true}])await assert.rejects(()=>fixture(options),/normalizer-control/);
});

test('product rapid attempt stays sealed after a stalled clock and rejects marker resets',async()=>{
  const f=await fixture({sampleRate:44100,productObservation:true,oracleEvidence:true,normalizerWitness:true});
  await assert.rejects(()=>f.probe.action({kind:'rapid-master',startPhaseMs:2,milliseconds:10}),/clock-stalled/);
  const attempt=plain((await f.probe.action({kind:'facts'})).productObservation.rapidMasterRequest);
  assert.deepEqual(attempt.input,{startPhaseMs:2,milliseconds:10});assert.equal(attempt.boundary,null);assert.match(attempt.error,/clock-stalled/);
  await assert.rejects(()=>f.probe.action({kind:'reset-events'}),/reentry-tail/);
  await assert.rejects(()=>f.probe.action({kind:'reset-events',tail:true}),/reentry-tail/);
  await f.probe.action({kind:'configure',config:{},gain:1,enabled:false});
  await assert.rejects(()=>f.probe.action({kind:'rapid-master',startPhaseMs:2,milliseconds:10}),/rapid-already-attempted/);
  assert.deepEqual(plain((await f.probe.action({kind:'facts'})).productObservation.rapidMasterRequest),attempt);
});

for(const milliseconds of [36,41,46])test('rapid probe accepts original additional delay '+milliseconds+' without claiming a formed phase',async()=>{
  const f=await fixture();await assert.rejects(()=>f.probe.action({kind:'rapid-master',startPhaseMs:2,milliseconds}),/clock-stalled/);
});

for(const startPhaseMs of [0,2])test(`44100/reentry/${startPhaseMs}/0 rapid probe requests ON without an additional wait after OFF returns`,async()=>{
  let reads=0,time=7,releaseOff,wall=100,returnedAt=null,readsAfterReturn=0;
  const offReturned=new Promise(resolve=>{releaseOff=resolve;}),calls=[];
  const f=await fixture(undefined,0,undefined,{state:'running',currentTime:0,performance:{now:()=>{
    wall=returnedAt===null ? 100+Math.max(0,++reads-20) : returnedAt+Math.max(0,++readsAfterReturn-8);
    return wall;
  }}});
  Object.defineProperty(f.context,'currentTime',{get:()=>time+=128/44100,configurable:true});
  f.runtime.audio.setEnabled=async(_,enabled)=>{calls.push(enabled);if(!enabled)await offReturned;return enabled?'on':'off';};
  const pending=f.probe.action({kind:'rapid-master',startPhaseMs,milliseconds:0});
  assert.deepEqual(calls,[false]);
  const offReturnMs=startPhaseMs===2 ? .75 : 0;
  returnedAt=wall+offReturnMs;
  releaseOff();
  const {edge,off,offDone,on}=await pending;
  assert.deepEqual(calls,[false,true]);
  if(startPhaseMs===0)assert.equal(off.wall,edge.wall);
  else assert.ok(off.wall-edge.wall>=startPhaseMs);
  assert.equal(offDone.wall-off.wall,offReturnMs);
  assert.equal(on.wall,offDone.wall);
});

for(const [rate,fault] of [[44100,null],[44100,'missing-on'],[44100,'stale-on'],[44100,'duplicate-on'],[44100,'wrong-epoch'],[44100,'fft-end'],[44100,'prepared-end'],[96000,null],[96000,'fft-end'],[96000,'late-on'],[96000,'missing-completed'],[96000,'wrong-completed'],[96000,'missing-meter'],[96000,'stale-meter'],[96000,'read-error-meter'],[96000,'at-end-meter']])test(`R3 tail marker ${rate} ${fault??'requires both clocks and commits once'}`,async()=>{
  const lower=rate===96000?17280:7938,fft=rate===96000?32768:16384;
  let frame=fault==='prepared-end'?870000:rate===96000?633728:310144,wall=100,advance=true;
  const f=await fixture({sampleRate:rate,productObservation:true,oracleEvidence:true,normalizerWitness:true},0,undefined,
    {state:'running',currentTime:0,captureIntervals:rate===96000,performance:{now:()=>advance?wall++:wall}});
  Object.defineProperty(f.context,'currentTime',{get:()=>(advance?frame+=128:frame)/rate,configurable:true});
  const reset={kind:'reset-events'},tail={...reset,tail:true};
  f.product.receive(reply('prepared',0,0));
  f.product.port.postMessage({...configure(1),wanted:true});
  f.product.port.postMessage({...configure(2),wanted:true,normalizer:true});
  if(fault==='stale-on')f.product.receive(reply('accepted',4,frame,{meterEpoch:4}));
  const warmup=plain(await f.probe.action(reset));
  let accepted=0;
  f.runtime.audio.setEnabled=async(_,enabled)=>{
    f.product.port.postMessage({...configure(enabled?4:3),wanted:enabled});
    if(enabled&&fault!=='missing-on'&&fault!=='stale-on'){
      const receipt=reply('accepted',4,frame,{meterEpoch:4,sourceEpoch:fault==='wrong-epoch'?2:1});
      accepted=frame;
      f.product.receive(receipt);
      if(fault==='duplicate-on')f.product.receive(receipt);
      if(fault==='late-on')frame+=16000;
    }
    return enabled?'on':'off';
  };
  const boundary=plain(await f.probe.action({kind:'rapid-master',...(rate===96000?{startPhaseMs:2,milliseconds:10}:{startPhaseMs:0,milliseconds:15})}));
  advance=false;
  const onDone=Math.round(boundary.onDone.audio*rate);
  const facts=async()=>plain(await f.probe.action({kind:'facts'}));
  if(rate===96000&&fault!=='late-on'){
    if(fault!=='missing-completed')f.product.receive(reply('completed',4,accepted+3456,{meterEpoch:fault==='wrong-completed'?3:4}));
    if(fault!=='missing-meter'){
      const analysers=Array.from({length:4},()=>f.context.createAnalyser()),buffer=new Float32Array(fft);
      frame=accepted+256;
      for(const a of analysers.slice(2)){a.fftSize=fft;a.getFloatTimeDomainData(buffer);}
      const power=Array.from(buffer,v=>v*v).reduce((a,b)=>a+b)/fft;
      const applyFrame=fault==='at-end-meter'?onDone+lower:frame+128,time=applyFrame/rate,mode=fault==='stale-meter'?'hold':fault==='read-error-meter'?'error':'warmup';
      const packet={kind:'power',sourceEpoch:1,meterEpoch:4,meterSeq:1,observedTime:fault==='stale-meter'?time-.21:frame/rate,active:true,leftPower:power,rightPower:power,targetDbfs:-20};
      f.product.port.postMessage(fault==='read-error-meter'?{kind:'read-error',sourceEpoch:1,meterEpoch:4,meterSeq:1,observedTime:frame/rate}:packet);
      f.product.receive(reply('meter-accepted',1,applyFrame,{meterEpoch:4,code:mode,application:{sourceEpoch:1,meterEpoch:4,meterSeq:1,commandSeq:4,frame:applyFrame,mode,fromDb:6,toDb:mode==='error'?0:6,start:time,end:mode==='error'?time+.01:time}}));
    }
  }
  wall=boundary.onDone.wall+186;
  frame=fault==='fft-end'?accepted+fft:fault==='prepared-end'?882001:onDone+lower-2;
  if(fault){
    if(rate===96000&&!['fft-end','late-on'].includes(fault))frame=onDone+lower;
    await assert.rejects(()=>f.probe.action(tail),/audio-(?:probe-reentry-tail|product-reply)/);
    assert.equal((await facts()).productObservation.rapidMasterRequest.measurement,null);
    return;
  }
  await assert.rejects(()=>f.probe.action(reset),/reentry-tail/);
  assert.equal(await f.probe.action(tail),null);
  frame=onDone+lower;wall=boundary.onDone.wall+179;
  assert.equal(await f.probe.action(tail),null);
  const pending=await facts();assert.deepEqual(pending.normalizerMeasurement,warmup);assert.equal(pending.productObservation.rapidMasterRequest.measurement,null);
  wall=boundary.onDone.wall+180;
  const measurement=plain(await f.probe.action(tail));assert.equal(measurement.frame,onDone+lower);
  const formed=await facts(),first=formed.productObservation.rapidMasterRequest;
  if(rate===96000){assert.equal(first.warmupMeter.power.meterSeq,1);assert.equal(first.warmupMeter.application.mode,'warmup');assert.deepEqual(first.warmupMeter.reads.map(r=>r.index),[2,3]);}
  assert.deepEqual(formed.normalizerMeasurement,measurement);
  assert.deepEqual(first.measurement,{...measurement,wall});assert.deepEqual(first.warmupMeasurement,warmup);assert.deepEqual(first.boundary,boundary);
  await assert.rejects(()=>f.probe.action(tail),/reentry-tail/);
  await assert.rejects(()=>f.probe.action(reset),/reentry-tail/);
  assert.deepEqual((await facts()).productObservation.rapidMasterRequest,first);
  await assert.rejects(()=>f.probe.action({kind:'rapid-master',startPhaseMs:0,milliseconds:15}),/rapid-already-attempted/);
});

test('R3 probe leaves the warmup marker unset until the real context frame reaches its floor',async()=>{
  const f=await fixture({sampleRate:44100,productObservation:true,oracleEvidence:true,normalizerWitness:true});
  const minimumFrame=306988;
  f.product.port.postMessage(configure(2));
  f.context.currentTime=(minimumFrame-428)/44100;
  assert.equal(await f.probe.action({kind:'reset-events',minimumFrame}),null);
  assert.equal((await f.probe.action({kind:'facts'})).normalizerMeasurement,null);
  f.context.currentTime=minimumFrame/44100;
  const marker=await f.probe.action({kind:'reset-events',minimumFrame});
  assert.equal(marker.frame,minimumFrame);
  assert.equal(marker.commandSeq,2);
  assert.deepEqual(plain((await f.probe.action({kind:'facts'})).normalizerMeasurement),plain(marker));
});

for(const sampleRate of [48000,96000])test(`product probe rejects nominal ${sampleRate} when the actual context differs`,async()=>{
  await assert.rejects(()=>fixture({sampleRate,productObservation:true},0,{}, {state:'running',currentTime:0,actualSampleRate:sampleRate===48000?96000:48000}),/audio-probe-native-rate/);
});

async function fixture(options={sampleRate:44100,productObservation:true},sourceFrame=0,l1Options={processorOptions:{sourceEpoch:1,initial:'raw'}},native={state:'running',currentTime:0}){
  const {installProcessingProbe}=await import(pathToFileURL(path.resolve('scripts/audio-processing-probe.mjs')));
  const nodes=[],messages=[],listeners=new Map(),blobs=[],queued=[],bindingEvents=[];let producerCode='';
  let activeContext;
  class BaseNode{
    constructor(){this.connections=[];}
    connect(...args){if(!(this instanceof BaseNode))throw TypeError('native-illegal-receiver');if(native.throwConnect){native.throwConnect=false;throw native.connectError;}this.connections.push(args);return args[0] instanceof BaseNode?args[0]:undefined;}
    disconnect(...args){if(!(this instanceof BaseNode))throw TypeError('native-illegal-receiver');if(native.throwDisconnect){native.throwDisconnect=false;throw native.disconnectError;}this.connections=this.connections.filter(e=>args.length&&!(typeof args[0]==='number'?(e[1]??0)===args[0]:e[0]===args[0]&&(args.length<2||(e[1]??0)===args[1])&&(args.length<3||(e[2]??0)===args[2])));}
  }
  const nativeNode=(extra={})=>Object.assign(new BaseNode(),{context:activeContext},extra);
  class Native{
    constructor(options){this.sampleRate=native.actualSampleRate??options.sampleRate;activeContext=this;this.destination.context=this;}
    state=native.state;currentTime=native.currentTime;destination=nativeNode();audioWorklet={addModule:async()=>{}};
    createMediaElementSource(){
      bindingEvents.push('native-source');
      if(native.queuePreBindEmpty){const observer=nodes.find(node=>node.options?.processorOptions?.producerId===1);if(observer){const producer=captureProducer({producerCode,captures:[null,observer]},1),packet=producer.process(sourceFrame,[]);queued.push(()=>observer.receive(packet));}}
      if(native.throwSource)throw Error('native-source-failed');
      if(native.advanceSourceFrame!==undefined)this.currentTime=native.advanceSourceFrame/this.sampleRate;
      return nativeNode({connect(...args){bindingEvents.push({stage:'source-input',receiverReady:typeof args[0]?.port?.onmessage==='function'});if(native.throwInputConnect)throw Error('source-connect-failed');const result=Reflect.apply(BaseNode.prototype.connect,this,args);args[0].sourceInputConnected=true;return result;}});
    }
    createGain(){if(native.captureIntervals)return nativeNode({gain:{value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}});}createBiquadFilter(){}createAnalyser(){if(native.captureIntervals)return nativeNode({fftSize:16384,getFloatTimeDomainData:buffer=>{if(native.throwFFT){native.throwFFT=false;throw Error('native-first-fft-read');}buffer.fill(.01);native.onFFT?.();}});}createDynamicsCompressor(){return native.compressor??(native.captureIntervals?nativeNode({threshold:{value:0},knee:{value:0},ratio:{value:1}}):undefined);}createDelay(){return native.captureIntervals?nativeNode():undefined;}createWaveShaper(){return native.captureIntervals?nativeNode():undefined;}createChannelSplitter(){return native.captureIntervals?nativeNode():undefined;}createConstantSource(){return nativeNode();}createOscillator(){return nativeNode();}
  }
  class Node extends BaseNode{
    constructor(ctx,name,options){
      super();this.context=ctx;this.name=name;this.options=options;this.connections=[];const handlers=[];
      if(options?.processorOptions?.producerId===1)bindingEvents.push('source-observer');
      this.parameters=new Map();
      if(options?.processorOptions?.oracleEvidence&&!native.missingTimeline){const events=[];this.parameters.set('frameTimeline',{events,setValueAtTime:(value,time)=>{events.push(['set',value,time]);if(native.throwSchedule)throw Error('schedule-failed');},linearRampToValueAtTime:(value,time)=>{events.push(['linear',value,time]);if(nodes.filter(node=>node.name==='f01-processing-capture').length===3&&native.afterSchedule){ctx.state=native.afterSchedule.state;ctx.currentTime=native.afterSchedule.currentTime;}}});}
      this.port={onmessage:null,postMessage(message){(native.posts??=[]).push(message);},addEventListener(type,handler){if(type==='message')handlers.push(handler);},start(){}};
      this.receive=data=>{this.port.onmessage?.({data});for(const handler of handlers)handler({data});};nodes.push(this);
    }
    connect(...args){if(this.options?.processorOptions?.producerId===1){bindingEvents.push({stage:'source-output',receiverReady:typeof this.port.onmessage==='function',inputReady:this.sourceInputConnected===true});if(native.throwObserverConnect)throw Error('observer-connect-failed');}return super.connect(...args);}
  }
  const mediaEvents=new Map(),mutations=[];
  const video={currentTime:2,src:'',currentSrc:'',loop:true,ended:false,playbackRate:1,paused:false,muted:false,volume:1,
    pause(){this.paused=true;},play:async()=>{video.paused=false;},
    addEventListener(type,handler){if(type==='loadeddata')queueMicrotask(handler);else mediaEvents.set(type,handler);}};
  let enabled=false;
  const readback={sources:1,state:'off',wanted:false,appliedGain:1};
  const runtime={config:{old:true},mediaRequestId:'real-request',media:{context:{mediaId:'actual'}},audio:{
    configure(){},getReadback:()=>readback,getState:()=>enabled?'on':'off',setGain:(_,gain)=>gain,
    setEnabled:async(_,value)=>{enabled=value;return value?'on':'off';}
  }};
  const target={AudioContext:Native,AudioWorkletNode:Node,AudioNode:BaseNode,Symbol,setInterval:fn=>{if(native.captureIntervals){(native.intervalCallbacks??=[]).push(fn);return native.intervalCallbacks.length;}return 1;},clearInterval(){},
    location:{origin:'https://chzzk.naver.com'},normalizeConfig:()=>({}),KnifeMediaProfiles:{projectGlobalAudio:()=>({})},
    postMessage:data=>messages.push(data),addEventListener(type,handler){listeners.set(type,handler);}};
  Object.defineProperty(target,Symbol.for('cheese-knife.runtime.v1'),{value:runtime});
  await vm.runInNewContext(`(${installProcessingProbe.toString()})(${JSON.stringify(options)})`,{
    window:target,AudioContext:Native,AudioWorkletNode:Node,Float32Array,Blob,performance:native.performance??performance,TextEncoder,
    MutationObserver:class{constructor(handler){mutations.push(handler);}observe(){}},
    URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:product-observer';},revokeObjectURL(){}},
    document:{hidden:false,querySelector:()=>video},location:target.location,
    ...(native.Uint8Array?{Uint8Array:native.Uint8Array}:{}),
    btoa:native.btoa??(text=>Buffer.from(text,'binary').toString('base64'))
  });
  const probe=Object.getOwnPropertyDescriptor(target,Symbol.for('cheese-knife.f01-processing-probe')).value;
  producerCode=await blobs[0].text();
  const context=new target.AudioContext();context.currentTime=sourceFrame/context.sampleRate;
  const source=native.deferSource?null:context.createMediaElementSource(video);
  await context.audioWorklet.addModule('chrome-extension://actual/web/audio-transition-worklet.js');
  const product=new target.AudioWorkletNode(context,'knife-audio-transition-l1',l1Options);
  const captures=()=>nodes.filter(node=>node.name==='f01-processing-capture').sort((a,b)=>(a.options?.processorOptions?.producerId??0)-(b.options?.processorOptions?.producerId??0));
  const send=(index,frame,values=index===0?[.25,.25]:index===1?[.5,.5]:[-.5,.5,1,1,0])=>{
    captures()[index]?.receive({frame,samples:values.map(value=>new Float32Array(128).fill(value))});
  };
  const feed=(frame,values)=>{for(let index=0;index<captures().length;index++)send(index,frame,values?.[index]);};
  return {probe,context,source,product,video,blobs,mediaEvents,mutations,get captures(){return captures();},send,feed,runtime,readback,messages,native,queued,bindingEvents,interval:(fn,ms)=>target.setInterval(fn,ms),createSource:()=>context.createMediaElementSource(video),flushQueued:()=>{for(const deliver of queued.splice(0))deliver();},createL1:options=>new target.AudioWorkletNode(context,'knife-audio-transition-l1',options),producerCode,
    requestConfig:()=>listeners.get('message')?.({source:target,origin:target.location.origin,data:{namespace:'cheese-knife',protocol:3,type:'config-request',requestId:'real-request'}})};
}

test('R1 emits a nonloop WAV covering the scenario budget with the original phase and stereo bytes',async()=>{
  const f=await fixture(),signal=await f.probe.action({kind:'signal',frequency:750,inputDbfs:-24,pattern:'stereo',phase:.37,durationSeconds:90});
  assert.equal(f.video.loop,false);assert.equal(signal.frames,44100*90);assert.equal(signal.durationSeconds,90);
  const bytes=Buffer.from(await f.blobs.at(-1).arrayBuffer());assert.equal(bytes.length,44+44100*90*8);assert.equal(bytes.readUInt32LE(24),44100);
  for(const n of [0,1,128,44100*20,44100*90-1])for(let c=0;c<2;c++)assert.equal(bytes.readFloatLE(44+n*8+c*4),Math.fround(Math.SQRT2*10**(-24/20)*Math.sin(2*Math.PI*750*n/44100+.37)));
  assert.equal((await f.probe.action({kind:'facts'})).signal.phase,.37);
});
for(const event of ['ended','seeking','ratechange','emptied','pause'])test(`R1 input ${event} is sticky and cannot be hidden by later configure/play`,async()=>{
  const f=await fixture();await f.probe.action({kind:'signal',frequency:750,inputDbfs:-24,pattern:'stereo',durationSeconds:1});
  f.mediaEvents.get(event)?.();assert.ok((await f.probe.action({kind:'facts'})).signal?.error,'input failure must remain observable');
  await assert.rejects(()=>f.probe.action({kind:'configure',config:{},gain:1,enabled:false}),/input/);
});
test('R1 input rejects replacement, loop mutations and invalid duration without opening a retry path',async()=>{
  const f=await fixture();
  for(const durationSeconds of [0,91,NaN,1.5])await assert.rejects(()=>f.probe.action({kind:'signal',frequency:750,inputDbfs:-24,pattern:'stereo',durationSeconds}),/signal/);
  await f.probe.action({kind:'signal',frequency:750,inputDbfs:-24,pattern:'stereo',durationSeconds:1});
  f.mutations.at(-1)?.([{attributeName:'loop'}]);assert.ok((await f.probe.action({kind:'facts'})).signal?.error);
  await assert.rejects(()=>f.probe.action({kind:'signal',frequency:750,inputDbfs:-24,pattern:'stereo',durationSeconds:1}),/input/);
});
for(const options of [44100,{sampleRate:48000,installed:true}])test(`legacy ${typeof options==='number'?'processing':'installed'} signal keeps its original 20s duration and loop policy`,async()=>{
  const f=await fixture(options),signal=await f.probe.action({kind:'signal',frequency:750,inputDbfs:-24,pattern:'stereo'});
  assert.equal(signal.durationSeconds,20);assert.equal(f.video.loop,typeof options==='number');
  const bytes=Buffer.from(await f.blobs.at(-1).arrayBuffer());assert.equal(bytes.length,44+(typeof options==='number'?options:options.sampleRate)*20*8);
  await assert.rejects(()=>f.probe.action({kind:'signal',frequency:750,inputDbfs:-24,pattern:'stereo',durationSeconds:90}),/signal-duration/);
});

test('product observation exports independently checked program, source and control bytes from the intercepted runtime',async()=>{
  const f=await fixture();f.feed(0);
  const capture=await f.probe.action({kind:'product-capture',startFrame:0,endFrame:128});
  assert.equal(capture?.schema,'f01-product-window-v1');assert.equal(capture.sampleRate,44100);
  assert.equal(capture.start,0);assert.equal(capture.end,128);
  assert.deepEqual(Array.from(capture.streams,stream=>[stream.start,stream.end,stream.channels,stream.encoding]),[
    [0,128,2,'interleaved-float32le'],[0,128,2,'interleaved-float32le'],[0,128,5,'interleaved-float32le']
  ]);
  const expected=['0000803e0000803e','0000003f0000003f','000000bf0000003f0000803f0000803f00000000'];
  for(const [index,stream]of capture.streams.entries())assert.deepEqual(Buffer.from(stream.base64,'base64'),literalBytes(expected[index],128));
  assert.equal(capture.sources,1);assert.equal(capture.l1Nodes,1);assert.equal(capture.invalidFrames,0);assert.equal(capture.streamError,'');
  assert.deepEqual(plain(capture.readback),f.readback);assert.deepEqual(plain(capture.commands),[]);assert.deepEqual(plain(capture.replies),[]);
  assert.ok(capture.moduleLoads.includes('chrome-extension://actual/web/audio-transition-worklet.js'));
  assert.equal(typeof capture.coverage,'string');assert.ok(capture.coverage.length>0);
  assert.equal(f.source.connections[0][0],f.captures[1]);
  assert.equal(f.product.connections[0][0],f.captures[2]);assert.equal(f.product.connections[0][1],1);
});
test('EQ component observation has its own output0 role and explicit four-stream profile',async()=>{
  const f=await fixture({sampleRate:44100,productObservation:true,equalizerComponent:true});
  assert.equal(f.captures.length,4);assert.equal(f.captures[3].options.processorOptions.producerId,3);assert.equal(f.captures[3].options.processorOptions.producerRole,'component');
  assert.ok(f.product.connections.some(([node,output])=>node===f.captures[3]&&output===0));
  f.feed(0,[[.25,.25],[.5,.5],[-1,1,1,1,0],[.125,.125]]);
  const r=await f.probe.action({kind:'product-capture',startFrame:0,endFrame:128});assert.equal(r.schema,'f01-product-window-v2');
  assert.deepEqual(Array.from(r.streams,s=>s.channels),[2,2,5,2]);assert.equal(Buffer.from(r.streams[3].base64,'base64').readFloatLE(0),.125);
  assert.deepEqual(Array.from(r.streams,s=>s.role),['program','source','control','component']);
  assert.equal((await f.probe.action({kind:'facts'})).equalizerComponent,true);
  for(const options of [{sampleRate:44100,productObservation:true,equalizerComponent:'yes'},{sampleRate:44100,productObservation:true,equalizerComponent:true,oracleEvidence:true}])await assert.rejects(()=>fixture(options),/audio-probe-equalizer-component/);
});
test('EQ component faults retain independent producer3 raw evidence and reject all captures',async()=>{
  for(const fault of ['gap','shape','nonfinite']){
    const f=await fixture({sampleRate:44100,productObservation:true,equalizerComponent:true}),node=f.captures[3];
    const packet=(frame,sequence)=>({frame,producerId:3,producerSequence:sequence,samples:[new Float32Array(128).fill(.1),new Float32Array(128).fill(.2)]});
    node.receive(packet(0,1));const bad=packet(fault==='gap'?0:128,2);if(fault==='shape')bad.samples.pop();if(fault==='nonfinite')bad.samples[1][7]=NaN;node.receive(bad);
    const r=await f.probe.action({kind:'l1-partial'}),failure=r.firstStreamFailure;
    assert.equal(failure.role,'component');assert.equal(failure.producerId,3);assert.equal(failure.previousProducerId,3);assert.equal(failure.receivedSequence,2);assert.equal(failure.previousReceivedSequence,1);
    assert.ok(r.firstStreamFailureEvidence.bytes>0);assert.equal(r.streams.length,4);
    await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
  }
});

test('product source observer is created at native binding, removing the queued pre-bind empty opportunity without accepting equality',async()=>{
  const f=await fixture(undefined,3200,undefined,{state:'running',currentTime:0,queuePreBindEmpty:true});
  assert.equal(f.queued.length,0,'eager creation or moving only the source marker still leaves a queued empty packet');f.flushQueued();
  assert.deepEqual(f.bindingEvents,['native-source','source-observer',{stage:'source-input',receiverReady:true},{stage:'source-output',receiverReady:true,inputReady:true}]);
  assert.equal((await f.probe.action({kind:'facts'})).productObservation.firstStreamFailure,null);
  f.feed(3200);assert.equal((await f.probe.action({kind:'product-capture',startFrame:3200,endFrame:3328})).streamError,'');
  const producer=captureProducer(f,1);f.captures[1].receive(producer.process(3200,[]));
  const partial=await f.probe.action({kind:'l1-partial'});assert.equal(partial.firstStreamFailure.role,'source');assert.equal(partial.firstStreamFailure.sourceFrame,3200);assert.equal(partial.firstStreamFailure.frame,3200);assert.equal(partial.firstStreamFailure.actualChannels,0);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:3200,endFrame:3328}),/stream-shape/);
});

test('successful product source binding publishes the original pre-call frame without retiming to a later native snapshot',async()=>{
  const f=await fixture(undefined,3200,undefined,{state:'running',currentTime:0,advanceSourceFrame:3328});
  assert.equal(f.context.currentTime,3328/44100);const partial=await f.probe.action({kind:'l1-partial'});assert.equal(partial.sourceFrame,3200);assert.equal(partial.sources,1);
  f.captures[1].receive({frame:3200,samples:[]});const failure=(await f.probe.action({kind:'facts'})).productObservation.firstStreamFailure;
  assert.equal(failure.sourceFrame,3200);assert.equal(failure.frame,3200);assert.equal(failure.reason,'shape');
});

for(const flag of ['throwSource','throwInputConnect','throwObserverConnect'])test(`failed ${flag} does not publish a successful product source`,async()=>{
  const f=await fixture(undefined,3200,undefined,{state:'running',currentTime:0,deferSource:true,[flag]:true});
  assert.throws(()=>f.createSource(),/source-failed|connect-failed/);const partial=await f.probe.action({kind:'l1-partial'});
  assert.equal(partial.sources,0);assert.equal(partial.sourceFrame,null);await assert.rejects(()=>f.probe.action({kind:'product-capture'}));
});

test('a second successful native source is counted and still invalidates single-source product capture',async()=>{
  const f=await fixture();f.feed(0);f.createSource();const partial=await f.probe.action({kind:'l1-partial'});
  assert.equal(partial.sources,2);assert.equal(f.captures.length,3);await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),/capture-invalid/);
});

for(const frame of [0,256])test(`lazy source binding still rejects a valid-channel ${frame===0?'duplicate':'gap'}`,async()=>{
  const f=await fixture();f.feed(0);f.send(1,frame);const partial=await f.probe.action({kind:'l1-partial'});
  assert.equal(partial.firstStreamFailure.role,'source');assert.equal(partial.firstStreamFailure.reason,'gap');assert.equal(partial.firstStreamFailure.frame,frame);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),/stream-gap/);
});

function captureProducer(f,index){
  const packets=[],sandbox={Float32Array,currentFrame:0,currentTime:0,sampleRate:f.context?.sampleRate??44100};let Capture;
  sandbox.AudioWorkletProcessor=class{constructor(){this.port={postMessage:(packet,transfer)=>packets.push(structuredClone(packet,{transfer}))};}};
  sandbox.registerProcessor=(name,Processor)=>{assert.equal(name,'f01-processing-capture');Capture=Processor;};
  vm.runInNewContext(f.producerCode,sandbox);const processor=new Capture(f.captures[index].options);
  return {packets,sandbox,descriptors:Capture.parameterDescriptors,process(frame,samples,parameters={}){Object.defineProperty(sandbox,'currentFrame',{configurable:true,get:typeof frame==='function'?frame:()=>frame});assert.equal(processor.process([samples],[[new Float32Array(128)]],parameters),true);return packets.at(-1);}};
}

const oracleOptions=sampleRate=>({sampleRate,productObservation:true,oracleEvidence:true});

async function sourceStartFixture(){
  const f=await fixture({...oracleOptions(44100),normalizerWitness:true,sourceStartWitness:true},128,
    {processorOptions:{sourceEpoch:1,initial:'raw'}},{state:'running',currentTime:0,deferSource:true});
  await f.probe.action({kind:'signal',frequency:1000,inputDbfs:-36,pattern:'stereo',phase:.37,durationSeconds:90});
  f.createSource();
  const producer=captureProducer(f,1),stereo=value=>[new Float32Array(128).fill(value),new Float32Array(128).fill(value)];
  const params={frameTimeline:new Float32Array(128)};
  const packets=[producer.process(0,[],params),producer.process(128,stereo(-0),params),producer.process(256,stereo(.25),params)];
  return {f,producer,packets,params,stereo};
}

test('source-start preserves empty and two valid packets including signed zero, once at the original export start',async()=>{
  const {f,producer,packets,params,stereo}=await sourceStartFixture();
  for(const packet of packets)f.captures[1].receive(packet);
  for(const frame of [128,256,384]){f.send(0,frame);f.send(2,frame);}
  const later=producer.process(384,stereo(.5),params);
  assert.equal('sourceStart'in later,false);
  f.captures[1].receive(later);
  const capture=await f.probe.action({kind:'product-capture',startFrame:128,endFrame:384});
  assert.equal(capture.start,128);
  const w=plain(capture.sourceStart);
  assert.equal(w.status,'FORMED');assert.equal(w.binding.epoch,1);assert.equal(w.binding.generation,1);
  assert.equal(w.binding.beforeCreate.frame,128);assert.equal(w.binding.afterConnect.frame,128);
  assert.deepEqual(w.binding.signal,{frequency:1000,inputDbfs:-36,phase:.37,frames:3969000});
  assert.deepEqual(w.empty,{frame:0,producerSequence:1,receivedSequence:1});
  assert.deepEqual(w.packets.map(p=>[p.frame,p.producerSequence,p.receivedSequence,p.allZero]),[[128,2,2,true],[256,3,3,false]]);
  assert.equal(Buffer.from(w.packets[0].pcm,'base64').readUInt32LE(),0x80000000);
  assert.deepEqual(w.archive,{start:128,end:384,comparedFrames:256});
  assert.equal('sourceStart'in await f.probe.action({kind:'facts'}),false);
  assert.equal('sourceStart'in await f.probe.action({kind:'product-capture',startFrame:384,endFrame:512}),false);
});

for(const fault of ['missing','reordered','epoch','received-bytes','archive-bytes','archive-partial','outside'])test('source-start '+fault+' preserves the capture contract with separate UNFORMED evidence',async()=>{
  const {f,packets,producer,stereo,params}=await sourceStartFixture();
  if(fault==='epoch'&&packets[1].sourceStart)packets[1].sourceStart.epoch=2;
  if(fault==='received-bytes')packets[1].samples[0][0]=0;
  const delivery=fault==='missing'?packets.slice(1):fault==='reordered'?[packets[1],packets[0],packets[2]]:packets;
  for(const packet of delivery)f.captures[1].receive(packet);
  if(fault==='archive-bytes')packets[1].samples[0][0]=0;
  for(const frame of [128,256,384]){f.send(0,frame);f.send(2,frame);}
  f.captures[1].receive(producer.process(384,stereo(.5),params));
  const startFrame=fault==='outside'?384:fault==='archive-partial'?192:128;
  const capture=await f.probe.action({kind:'product-capture',startFrame,endFrame:fault==='archive-partial'?320:512});
  assert.equal(capture.start,startFrame);assert.equal(capture.streamError,'');
  assert.equal(capture.sourceStart.status,'UNFORMED');assert.equal(capture.sourceStart.reason,fault==='missing'||fault==='reordered'?'sequence':fault);
  const partial=await f.probe.action({kind:'l1-partial'});assert.deepEqual(plain(partial.sourceStart),plain(capture.sourceStart));
});

test('source-start records only a bounded prefix and keeps the first failure sticky',async()=>{
  const {f,params,stereo}=await sourceStartFixture(),producer=captureProducer(f,1);
  for(let i=0;i<9;i++)f.captures[1].receive(producer.process(i*128,[],params));
  const late=producer.process(1152,stereo(.5),params);
  assert.equal('sourceStart'in late,false);
  const partial=await f.probe.action({kind:'l1-partial'});
  assert.equal(partial.firstStreamFailure.frame,128);
  assert.equal(partial.sourceStart.status,'UNFORMED');assert.equal(partial.sourceStart.empty.frame,0);
  assert.deepEqual(plain(partial.sourceStart.packets),[]);
});

test('normalizer witness selects an explicit v2 ledger and retains actual application snapshots',async()=>{
  const f=await fixture({...oracleOptions(48000),normalizerWitness:true});
  assert.equal(f.product.options.processorOptions.normalizerWitness,true);assert.equal(f.product.options.processorOptions.initial,'raw');
  f.product.receive(reply('prepared',0,0));
  f.product.port.postMessage({kind:'power',sourceEpoch:1,meterEpoch:0,meterSeq:1,observedTime:0,active:true,leftPower:.01,rightPower:.01,targetDbfs:-20});
  const application={sourceEpoch:1,meterEpoch:0,meterSeq:1,commandSeq:1,frame:128,mode:'warmup',fromDb:0,toDb:0,start:128/48000,end:128/48000};
  f.product.receive(reply('meter-accepted',1,128,{code:'warmup',application}));application.toDb=4;
  const evidence=(await f.probe.action({kind:'l1-partial'})).oracleEvidence;
  assert.equal(evidence.schema,'f01-oracle-evidence-v2');assert.equal(evidence.ledger.schema,'f01-control-ledger-v2');assert.equal(evidence.initial.normalizerWitness,true);
  assert.equal(evidence.ledger.available,true);assert.equal(evidence.ledger.events.at(-1).packet.application.toDb,0);
  evidence.ledger.events.at(-1).packet.application.toDb=5;
  assert.equal((await f.probe.action({kind:'l1-partial'})).oracleEvidence.ledger.events.at(-1).packet.application.toDb,0);
  for(const options of [{sampleRate:48000,productObservation:true,normalizerWitness:true},{...oracleOptions(48000),normalizerWitness:'yes'}])await assert.rejects(()=>fixture(options),/audio-probe-normalizer-witness/);
});
test('normalizer measurement marker preserves initial power prefix and observes every actual timer callback',async()=>{
  const f=await fixture({...oracleOptions(48000),normalizerWitness:true},0,undefined,{state:'running',currentTime:0,captureIntervals:true});
  const left=f.context.createAnalyser(),right=f.context.createAnalyser(),l=new Float32Array(16384),r=new Float32Array(16384);
  const tick=()=>{left.getFloatTimeDomainData(l);right.getFloatTimeDomainData(r);};tick();
  f.interval(tick,100);f.context.currentTime=.1;f.native.intervalCallbacks[0]();
  const gain=f.context.createGain().gain;gain.setValueAtTime(.5,.1);gain.linearRampToValueAtTime(.75,.2);
  f.product.port.postMessage(configure(2));
  const marker=await f.probe.action({kind:'reset-events'});assert.deepEqual(plain(marker),{frame:4800,powerReadCursor:4,meterTickCursor:1,sourceEpoch:1,commandSeq:2});
  const facts=await f.probe.action({kind:'facts',fullOracle:true});assert.equal(facts.powerReads.length,4);assert.equal(facts.reads,4);assert.equal(facts.buffers,2);assert.equal(facts.meterTickReads.length,1);
  assert.deepEqual(plain(facts.meterTickReads[0]),{ordinal:1,startRead:2,endRead:4,startTime:.1,endTime:.1});assert.ok(Array.isArray(facts.oracleEvidence.ledger.events));
  assert.deepEqual(plain(facts.normalizerMeasurement),plain(marker));assert.equal(facts.linearEvents.length,1,'N marker preserves Native parameter prefix');
  const legacy=await fixture();assert.equal(await legacy.probe.action({kind:'reset-events'}),null);await assert.rejects(()=>legacy.probe.action({kind:'facts',fullOracle:true}),/audio-probe-full-oracle/);
});

test('normalizer witness rejects mixed receipt profiles and malformed application identities',async()=>{
  const application={sourceEpoch:1,meterEpoch:0,meterSeq:1,commandSeq:1,frame:128,mode:'warmup',fromDb:0,toDb:0,start:128/48000,end:128/48000};
  for(const patch of [undefined,{...application,meterSeq:2},{...application,frame:256},{...application,start:0},{...application,extra:1}]){
    const f=await fixture({...oracleOptions(48000),normalizerWitness:true});f.product.receive(reply('prepared',0,0));
    f.product.receive(reply('meter-accepted',1,128,{code:'warmup',...(patch===undefined?{}:{application:patch})}));
    const result=await f.probe.action({kind:'l1-partial'});assert.equal(result.oracleEvidence.ledger.available,false);assert.equal(result.streamError,'audio-product-reply-invalid');
  }
  const legacy=await fixture(oracleOptions(48000));legacy.product.receive(reply('meter-accepted',1,128,{code:'warmup',application:null}));
  assert.equal((await legacy.probe.action({kind:'l1-partial'})).oracleEvidence.ledger.available,false);
});
const motionOptions=sampleRate=>({...oracleOptions(sampleRate),motionEvidence:true});
const framePathOptions=sampleRate=>({...motionOptions(sampleRate),framePathEvidence:true});
const timeline=start=>Float32Array.from({length:128},(_,index)=>start+index);
const power=(seq,extra={})=>({kind:'power',sourceEpoch:1,meterEpoch:0,meterSeq:seq,observedTime:seq/10,leftPower:.01,rightPower:.02,active:true,targetDbfs:-18,...extra});

test('frame path requires product/oracle/motion opt-in and false preserves every previous producer literal',async()=>{
  for(const options of [{sampleRate:44100,framePathEvidence:true},{sampleRate:48000,installed:true,framePathEvidence:true},
    {sampleRate:44100,productObservation:true,framePathEvidence:true},{...oracleOptions(44100),framePathEvidence:true},
    {...framePathOptions(44100),oracleEvidence:false,motionEvidence:false},{...framePathOptions(44100),motionEvidence:false},
    {...motionOptions(44100),framePathEvidence:1}])await assert.rejects(()=>fixture(options),/audio-probe-frame-path/);
  for(const options of [{sampleRate:44100,productObservation:true},oracleOptions(44100),motionOptions(44100)]){
    const prior=await fixture(options),disabled=await fixture({...options,framePathEvidence:false});assert.equal(disabled.producerCode,prior.producerCode);
    assert.equal('framePath'in((await disabled.probe.action({kind:'facts'})).oracleEvidence??{}),false);
  }
});

test('frame path snapshots entry before PCM copying, the same original packet frame at post, and receiver context time',async()=>{
  const f=await fixture(framePathOptions(44100)),producer=captureProducer(f,0);let frame=128,time=.25;
  Object.defineProperty(producer.sandbox,'currentTime',{get:()=>time});
  const samples=[new Float32Array(128).fill(.25),new Float32Array(128).fill(.5)];
  samples.map=function(copy){frame=256;time=.5;return Array.prototype.map.call(this,copy);};
  const packet=producer.process(()=>frame,samples,{frameTimeline:timeline(100)});
  assert.equal(packet.frame,256);assert.deepEqual(plain(packet.framePath),{schema:'f01-frame-path-v1',entryFrame:128,entryTime:.25,postFrame:256,postTime:.5,workletSampleRate:44100});
  assert.equal(samples[0].byteLength,512);assert.notEqual(packet.samples[0].buffer,samples[0].buffer);assert.equal(packet.samples[0][0],.25);
  f.context.currentTime=20;f.captures[0].receive(packet);packet.framePath.entryFrame=99;packet.framePath.postTime=99;packet.frame=99;
  const evidence=(await f.probe.action({kind:'l1-partial'})).oracleEvidence.framePath;
  assert.equal(evidence.schema,'f01-frame-path-v1');assert.equal(evidence.firstFailure,null);
  assert.deepEqual(plain(evidence.latestByRole.program),{available:true,reason:null,entryFrame:128,entryTime:.25,postFrame:256,postTime:.5,workletSampleRate:44100,receivedFrame:256,receiverContextTime:20,producerId:0,producerRole:'program',producerSequence:1,receivedSequence:1});
  evidence.latestByRole.program.entryTime=99;assert.equal((await f.probe.action({kind:'facts'})).oracleEvidence.framePath.latestByRole.program.entryTime,.25);
});

for(const role of [0,1,2])for(const twice of [false,true])test(`frame path retains original role ${role} first pair for ${twice?'duplicate delivery':'two callbacks'}`,async()=>{
  const f=await fixture(framePathOptions(44100)),producer=captureProducer(f,role),samples=Array.from({length:role===2?5:2},()=>new Float32Array(128).fill(.25));f.feed(0);
  const a=producer.process(128,samples,{frameTimeline:timeline(100)});f.context.currentTime=1;f.captures[role].receive(a);
  const b=twice?a:producer.process(128,samples,{frameTimeline:timeline(228)});f.context.currentTime=2;f.captures[role].receive(b);
  const partial=await f.probe.action({kind:'l1-partial'}),path=partial.oracleEvidence.framePath,pair=plain(path.firstFailure);
  assert.equal(pair.role,['program','source','control'][role]);assert.equal(pair.previous.producerId,role);assert.equal(pair.current.producerId,role);
  assert.equal(pair.previous.producerSequence,1);assert.equal(pair.current.producerSequence,twice?1:2);assert.equal(pair.previous.receivedSequence,2);assert.equal(pair.current.receivedSequence,3);
  assert.equal(pair.previous.entryFrame,128);assert.equal(pair.current.entryFrame,128);assert.equal(pair.previous.postFrame,128);assert.equal(pair.current.postFrame,128);
  assert.equal(pair.previous.receivedFrame,128);assert.equal(pair.current.receivedFrame,128);assert.equal(pair.previous.receiverContextTime,1);assert.equal(pair.current.receiverContextTime,2);
  assert.equal(partial.firstStreamFailure.frame,128);assert.equal(partial.firstStreamFailure.previousRetainedFrame,128);assert.ok(partial.streamError.includes('stream-gap'));
  a.framePath.entryFrame=99;b.framePath.postFrame=99;f.feed(256);f.feed(384);
  const later=await f.probe.action({kind:'l1-partial'});assert.deepEqual(plain(later.oracleEvidence.framePath.firstFailure),pair);assert.equal(Object.keys(later.oracleEvidence.framePath.latestByRole).length,3);
  assert.equal(JSON.stringify(later.streams).includes('framePath'),false);await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:256,endFrame:384}),/stream-gap/);
});

test('frame path exposes a received-frame change without replacing the original received packet or failure',async()=>{
  const f=await fixture(framePathOptions(44100)),producer=captureProducer(f,2),samples=Array.from({length:5},()=>new Float32Array(128));f.feed(0);
  f.captures[2].receive(producer.process(128,samples,{frameTimeline:timeline(100)}));
  const changed=producer.process(256,samples,{frameTimeline:timeline(228)});changed.frame=128;f.captures[2].receive(changed);
  const partial=await f.probe.action({kind:'l1-partial'}),current=partial.oracleEvidence.framePath.firstFailure.current;
  assert.equal(current.available,true);assert.equal(current.entryFrame,256);assert.equal(current.postFrame,256);assert.equal(current.receivedFrame,128);
  assert.equal(partial.firstStreamFailure.frame,128);assert.ok(partial.streamError.includes('stream-gap'));
});

for(const [label,change]of [
  ['missing',packet=>{delete packet.framePath;}],['wrong schema',packet=>{packet.framePath.schema='wrong';}],
  ['nonfinite',packet=>{packet.framePath.entryTime=Infinity;}],['unsafe frame',packet=>{packet.framePath.postFrame=Number.MAX_SAFE_INTEGER+1;}],
  ['wrong rate',packet=>{packet.framePath.workletSampleRate=48000;}],['negative time',packet=>{packet.framePath.postTime=-1;}],
  ['unbounded payload',packet=>{packet.framePath.extra='not-retained'.repeat(10000);}],['wrong role',packet=>{packet.producerRole='control';}]
])test(`frame path ${label} is unavailable without adding a product gate or retaining raw payload`,async()=>{
  const f=await fixture(framePathOptions(44100)),producer=captureProducer(f,0),packet=producer.process(0,[new Float32Array(128),new Float32Array(128)],{frameTimeline:timeline(100)});change(packet);
  f.captures[0].receive(packet);f.send(1,0);f.send(2,0);const capture=await f.probe.action({kind:'product-capture',startFrame:0,endFrame:128});
  assert.equal(capture.streamError,'');assert.equal(capture.oracleEvidence.framePath.latestByRole.program.available,false);assert.equal(capture.oracleEvidence.framePath.firstFailure,null);
  if(label==='wrong rate'){
    const path=capture.oracleEvidence.framePath.latestByRole.program;assert.equal(path.reason,'rate-mismatch');assert.equal(path.workletSampleRate,48000);
    assert.equal(path.entryFrame,0);assert.equal(path.entryTime,0);assert.equal(path.postFrame,0);assert.equal(path.postTime,0);
  }
  const partial=await f.probe.action({kind:'l1-partial'});assert.doesNotMatch(JSON.stringify(partial.oracleEvidence.framePath),/not-retained|Infinity/);assert.equal(JSON.stringify(partial.streams).includes('framePath'),false);
});

test('frame path first pair stays attached to an earlier original shape failure',async()=>{
  const f=await fixture(framePathOptions(44100)),producer=captureProducer(f,0),samples=[new Float32Array(128),new Float32Array(128)];
  f.captures[0].receive(producer.process(128,samples,{frameTimeline:timeline(100)}));const bad=producer.process(256,samples,{frameTimeline:timeline(228)});bad.samples.pop();f.captures[0].receive(bad);
  const before=plain((await f.probe.action({kind:'l1-partial'})).oracleEvidence.framePath.firstFailure);
  f.captures[0].receive(producer.process(128,samples,{frameTimeline:timeline(356)}));const partial=await f.probe.action({kind:'l1-partial'});
  assert.equal(partial.firstStreamFailure.reason,'shape');assert.equal(before.current.postFrame,256);assert.deepEqual(plain(partial.oracleEvidence.framePath.firstFailure),before);
});

test('raw motion requires explicit product oracle opt-in and leaves the default producer unchanged',async()=>{
  for(const options of [{sampleRate:44100,motionEvidence:true},{sampleRate:48000,installed:true,motionEvidence:true},
    {sampleRate:44100,productObservation:true,motionEvidence:true},{...oracleOptions(44100),motionEvidence:1},
    {...motionOptions(44100),oracleEvidence:false}])await assert.rejects(()=>fixture(options),/audio-probe-motion/);
  const f=await fixture({sampleRate:44100,productObservation:true,motionEvidence:false});f.feed(0);
  assert.equal(require('node:crypto').createHash('sha256').update(f.producerCode).digest('hex'),'cdc8df6e65743d35889ee20dd9fade02562267d3cab271ec7e1dab68271c04b3');
  assert.equal('oracleEvidence'in await f.probe.action({kind:'facts'}),false);
  const old=await fixture(oracleOptions(44100));assert.equal('rawMotion'in(await old.probe.action({kind:'facts'})).oracleEvidence,false);
});

test('raw motion schedules once from each current native snapshot without certifying the clock origin',async()=>{
  const f=await fixture(motionOptions(48000),480000,undefined,{state:'running',currentTime:10,afterSchedule:{state:'running',currentTime:11}});
  const evidence=(await f.probe.action({kind:'facts'})).oracleEvidence;
  assert.equal(evidence.schedule.available,false);assert.equal(evidence.schedule.reason,'raw-motion-only');assert.equal(evidence.schedule.nodesScheduled,0);
  assert.deepEqual(plain(evidence.schedule.originGuard),{before:{state:'running',currentTime:10},after:{state:'running',currentTime:11}});
  const motion=evidence.rawMotion;assert.equal(motion.schema,'f01-raw-motion-v1');assert.equal(motion.clockOrigin,'UNPROVEN');assert.equal(motion.firstFailure,null);
  assert.deepEqual(plain(motion.schedule.requests),[[0,'program'],[2,'control'],[1,'source']].map(([producerId,role])=>({role,producerId,before:{state:'running',currentTime:10},after:{state:'running',currentTime:producerId===1?11:10},startTime:10,endTime:10+16777215/48000,requested:true,reason:null})));
  for(const node of f.captures)assert.deepEqual(plain(node.parameters.get('frameTimeline').events),[['set',0,10],['linear',16777215,10+16777215/48000]]);
  motion.schedule.requests[0].before.currentTime=99;
  assert.equal((await f.probe.action({kind:'facts'})).oracleEvidence.rawMotion.schedule.requests[0].before.currentTime,10);
});

for(const native of [{missingTimeline:true},{throwSchedule:true}])test(`raw motion records schedule failure without retry or origin promotion ${JSON.stringify(native)}`,async()=>{
  const f=await fixture(motionOptions(44100),441000,undefined,{state:'running',currentTime:10,...native}),evidence=(await f.probe.action({kind:'facts'})).oracleEvidence;
  assert.equal(evidence.schedule.available,false);assert.equal(evidence.schedule.nodesScheduled,0);
  assert.equal(evidence.rawMotion.schedule.requests.length,3);
  for(const [index,request]of evidence.rawMotion.schedule.requests.entries()){
    assert.equal(request.producerId,[0,2,1][index]);assert.equal(request.requested,false);assert.equal(request.reason,'parameter-schedule');
    if(native.throwSchedule)assert.deepEqual(plain(f.captures[request.producerId].parameters.get('frameTimeline').events),[['set',0,10]]);
  }
});

for(const [label,values,available]of [
  ['nonunit',Float32Array.from({length:128},(_,i)=>100+i*2),true],['missing',undefined,false],['one',new Float32Array([100]),false],
  ['flat',new Float32Array(128).fill(100),false],['default',new Float32Array(128).fill(-1),false],['boundary',timeline(0),false],
  ['clipped',new Float32Array(128).fill(16777215),false],['nonfinite',Float32Array.from({length:128},(_,i)=>i===64?NaN:100+i),false],
  ['decreasing',Float32Array.from({length:128},(_,i)=>300-i),false],['wrong type',Array.from({length:128},(_,i)=>100+i),false]
])test(`raw motion ${label} comes from the actual vector and never substitutes strong clock validity`,async()=>{
  const f=await fixture(motionOptions(44100)),producer=captureProducer(f,0),packet=producer.process(0,[new Float32Array(128),new Float32Array(128)],values===undefined?{}:{frameTimeline:values});
  assert.equal(packet.rawMotion.available,available);assert.equal(packet.frameTimeline.valid,false);assert.equal(packet.frame,0);
  f.captures[0].receive(packet);f.send(1,0);f.send(2,0);
  const raw=await f.probe.action({kind:'product-capture',startFrame:0,endFrame:128});assert.equal(raw.streamError,'');
  assert.equal(raw.oracleEvidence.rawMotion.latestByRole.program.available,available);assert.equal(raw.oracleEvidence.schedule.available,false);
  assert.doesNotMatch(JSON.stringify(packet.rawMotion),/NaN|Infinity/);
  assert.equal(JSON.stringify((await f.probe.action({kind:'l1-partial'})).streams).includes('rawMotion'),false);
});

async function motionPair(previous,current,mutate=()=>{},role=0){
  const f=await fixture(motionOptions(44100)),producer=captureProducer(f,role),samples=Array.from({length:role===2?5:2},()=>new Float32Array(128).fill(.25));
  const a=producer.process(128,samples,{frameTimeline:previous});f.captures[role].receive(a);
  const b=producer.process(128,samples,{frameTimeline:current});mutate(b);f.captures[role].receive(b);
  return {f,a,b,partial:await f.probe.action({kind:'l1-partial'})};
}

for(const role of [0,1,2])test(`raw motion links only the original repeated-frame pair for role ${role}`,async()=>{
  const {f,a,b,partial}=await motionPair(timeline(100),timeline(228),undefined,role),motion=partial.oracleEvidence.rawMotion;
  assert.equal(motion.firstFailure.status,'observed-motion-with-repeated-frame');assert.equal(motion.firstFailure.clockOrigin,'UNPROVEN');
  assert.equal(motion.firstFailure.role,['program','source','control'][role]);assert.equal(partial.firstStreamFailure.frame,128);assert.equal(partial.firstStreamFailure.previousRetainedFrame,128);
  assert.equal(motion.firstFailure.previous.first,100);assert.equal(motion.firstFailure.current.first,228);
  assert.ok(partial.streamError.includes('stream-gap'));assert.ok(partial.firstStreamFailureEvidence.bytes<=5120);
  a.rawMotion.first=99;b.rawMotion.last=99;const frozen=plain(motion.firstFailure);
  for(let frame=256;frame<256512;frame+=128)f.feed(frame);
  const aged=await f.probe.action({kind:'l1-partial'});assert.deepEqual(plain(aged.oracleEvidence.rawMotion.firstFailure),frozen);
  assert.ok(Object.keys(aged.oracleEvidence.rawMotion.latestByRole).length<=3);assert.equal(JSON.stringify(aged.streams).includes('rawMotion'),false);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:256128,endFrame:256256}),/stream-gap/);
});

for(const [label,previous,current,mutate]of [
  ['same array',timeline(100),timeline(100)],['backwards',timeline(228),timeline(100)],
  ['mixed endpoints',Float32Array.from({length:128},(_,i)=>100+i*2),timeline(101)],
  ['equal first',timeline(100),Float32Array.from({length:128},(_,i)=>100+i*2)],
  ['role mismatch',timeline(100),timeline(228),packet=>{packet.producerRole='source';}],
  ['id mismatch',timeline(100),timeline(228),packet=>{packet.producerId=1;}],
  ['sequence gap',timeline(100),timeline(228),packet=>{packet.producerSequence=3;}],
  ['duplicate delivery',timeline(100),timeline(228),packet=>{packet.producerSequence=1;}],
  ['malformed summary',timeline(100),timeline(228),packet=>{packet.rawMotion.extra='discard';}]
])test(`raw motion keeps ${label} inconclusive while preserving the original STOP`,async()=>{
  const {partial}=await motionPair(previous,current,mutate);assert.equal(partial.oracleEvidence.rawMotion.firstFailure.status,'INCONCLUSIVE');
  assert.equal(partial.oracleEvidence.rawMotion.firstFailure.clockOrigin,'UNPROVEN');assert.equal(partial.firstStreamFailure.reason,'gap');
  assert.ok(partial.streamError.includes('stream-gap'));assert.doesNotMatch(JSON.stringify(partial.oracleEvidence.rawMotion),/discard/);
});

test('raw motion never replaces an earlier shape failure with a later repeated-frame pair',async()=>{
  const f=await fixture(motionOptions(44100)),producer=captureProducer(f,0),samples=[new Float32Array(128),new Float32Array(128)];
  f.captures[0].receive(producer.process(128,samples,{frameTimeline:timeline(100)}));
  const bad=producer.process(256,samples,{frameTimeline:timeline(228)});bad.samples.pop();f.captures[0].receive(bad);
  const first=plain((await f.probe.action({kind:'l1-partial'})).oracleEvidence.rawMotion.firstFailure);
  f.captures[0].receive(producer.process(128,samples,{frameTimeline:timeline(356)}));
  const partial=await f.probe.action({kind:'l1-partial'});assert.equal(partial.firstStreamFailure.reason,'shape');assert.equal(first.status,'INCONCLUSIVE');
  assert.deepEqual(plain(partial.oracleEvidence.rawMotion.firstFailure),first);
});

test('oracle evidence is product-only, explicitly boolean, and absent by default',async()=>{
  for(const options of [{sampleRate:44100,oracleEvidence:true},{sampleRate:48000,installed:true,oracleEvidence:true},{sampleRate:44100,productObservation:true,oracleEvidence:1}])await assert.rejects(()=>fixture(options),/audio-probe-oracle/);
  for(const options of [undefined,{sampleRate:44100,productObservation:true,oracleEvidence:false}]){
    const f=await fixture(options);f.feed(0);
    assert.equal(require('node:crypto').createHash('sha256').update(f.producerCode).digest('hex'),'cdc8df6e65743d35889ee20dd9fade02562267d3cab271ec7e1dab68271c04b3');
    for(const input of [{kind:'facts'},{kind:'l1-partial'},{kind:'product-capture',startFrame:0,endFrame:128}])assert.equal('oracleEvidence'in await f.probe.action(input),false);
  }
});

for(const sampleRate of [44100,48000,96000])test(`oracle capture schedules a separate a-rate timeline for every role at ${sampleRate}`,async()=>{
  const f=await fixture(oracleOptions(sampleRate),0,undefined,{state:'suspended',currentTime:0});
  for(const [index,node]of f.captures.entries()){
    assert.equal(node.options.processorOptions.oracleEvidence,true);
    assert.deepEqual(plain(node.parameters.get('frameTimeline').events),[['set',0,0],['linear',16777215,16777215/sampleRate]]);
    const producer=captureProducer(f,index);
    assert.deepEqual(plain(producer.descriptors),[{name:'frameTimeline',defaultValue:-1,minValue:-1,maxValue:16777215,automationRate:'a-rate'}]);
    const samples=Array.from({length:index===2?5:2},()=>new Float32Array(128).fill(.25));
    const packet=producer.process(128,samples,{frameTimeline:timeline(1024)});
    assert.deepEqual(plain(packet.frameTimeline),{length:128,first:1024,last:1151,finite:true,unitStep:true,valid:true,reason:null});
    assert.equal(packet.frame,128);assert.equal(packet.producerId,index);assert.equal(samples[0].byteLength,512);
    f.captures[index].receive(packet);
  }
  const facts=await f.probe.action({kind:'facts'}),oracle=facts.oracleEvidence;
  assert.equal(oracle.schema,'f01-oracle-evidence-v1');assert.equal(oracle.schedule.available,true);
  assert.equal(oracle.schedule.endTime,16777215/sampleRate);assert.equal(oracle.schedule.nodesScheduled,3);
  assert.deepEqual(plain(oracle.schedule.originGuard),{before:{state:'suspended',currentTime:0},after:{state:'suspended',currentTime:0}});
  assert.deepEqual(Object.keys(oracle.frameTimeline.latestByRole).sort(),['control','program','source']);
  assert.equal(oracle.frameTimeline.firstFailure,null);
});

for(const native of [{state:'running',currentTime:0},{state:'suspended',currentTime:10},{state:'running',currentTime:10},
  {state:'suspended',currentTime:0,afterSchedule:{state:'running',currentTime:128/44100}},
  {state:'suspended',currentTime:0,afterSchedule:{state:'suspended',currentTime:10}}])test(`oracle schedule origin guard fails closed for ${JSON.stringify(native)}`,async()=>{
  const sourceFrame=native.currentTime===10?441000:0,startFrame=sourceFrame===441000?441088:0,f=await fixture(oracleOptions(44100),sourceFrame,undefined,native);f.feed(startFrame);
  const result=await f.probe.action({kind:'product-capture',startFrame,endFrame:startFrame+128}),schedule=result.oracleEvidence.schedule;
  const initialValid=native.state==='suspended'&&native.currentTime===0;
  assert.equal(schedule.available,false);assert.equal(schedule.reason,'schedule-origin');assert.equal(schedule.nodesScheduled,initialValid?3:0);
  assert.deepEqual(plain(schedule.originGuard),{before:{state:native.state,currentTime:native.currentTime},after:native.afterSchedule??{state:native.state,currentTime:native.currentTime}});
  assert.equal(result.streamError,'');assert.equal(result.invalidFrames,0);
  for(const node of f.captures)assert.deepEqual(plain(node.parameters.get('frameTimeline').events),initialValid?[['set',0,0],['linear',16777215,16777215/44100]]:[]);
  schedule.originGuard.before.state='suspended';schedule.originGuard.before.currentTime=0;
  assert.deepEqual(plain((await f.probe.action({kind:'facts'})).oracleEvidence.schedule.originGuard),{before:{state:native.state,currentTime:native.currentTime},after:native.afterSchedule??{state:native.state,currentTime:native.currentTime}});
});

test('advancing actual parameter vectors never admit repeated exposed frames or replace raw first-failure evidence',async()=>{
  const f=await fixture(oracleOptions(96000)),producer=captureProducer(f,2),samples=Array.from({length:5},()=>new Float32Array(128).fill(.25));
  f.feed(0);
  const previous=producer.process(128,samples,{frameTimeline:timeline(1024)});f.captures[2].receive(previous);
  const bad=producer.process(128,samples,{frameTimeline:timeline(1152)});f.captures[2].receive(bad);
  assert.equal(producer.packets.length,2);assert.equal(previous.samples[0][0],.25);
  const partial=await f.probe.action({kind:'l1-partial'}),failure=partial.oracleEvidence.frameTimeline.firstFailure;
  assert.equal(partial.streamError,'audio-l1-stream-gap');assert.equal(partial.firstStreamFailureEvidence.bytes,5120);
  assert.equal(failure.role,'control');assert.equal(failure.previous.first,1024);assert.equal(failure.current.first,1152);
  previous.frameTimeline.first=99;bad.frameTimeline.last=99;
  for(let frame=256;frame<256512;frame+=128)f.feed(frame);
  const aged=await f.probe.action({kind:'l1-partial'});
  assert.deepEqual(plain(aged.oracleEvidence.frameTimeline.firstFailure),plain(failure));
  assert.equal(JSON.stringify(aged.streams).includes('frameTimeline'),false);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:256128,endFrame:256256}),/stream-gap/);
});

for(const [label,values]of [
  ['missing',undefined],['wrong length',timeline(100).subarray(0,127)],['constant',new Float32Array(128).fill(100)],
  ['default',new Float32Array(128).fill(-1)],['initial boundary',timeline(0)],['clipped',new Float32Array(128).fill(16777215)],
  ['nonunit',Float32Array.from({length:128},(_,index)=>100+index*2)],['nonfinite',Float32Array.from({length:128},(_,index)=>index===64?NaN:100+index)],
  ['wrong type',Array.from({length:128},(_,index)=>100+index)]
])test(`oracle ${label} vector remains inconclusive without changing PCM acceptance`,async()=>{
  const f=await fixture(oracleOptions(44100)),producer=captureProducer(f,0),packet=producer.process(0,[new Float32Array(128),new Float32Array(128)],values===undefined?{}:{frameTimeline:values});
  assert.equal(packet.frameTimeline.valid,false);assert.equal(typeof packet.frameTimeline.reason,'string');
  f.captures[0].receive(packet);f.send(1,0);f.send(2,0);
  const capture=await f.probe.action({kind:'product-capture',startFrame:0,endFrame:128});
  assert.equal(capture.streamError,'');assert.equal(capture.oracleEvidence.frameTimeline.latestByRole.program.valid,false);
  assert.equal(capture.oracleEvidence.frameTimeline.firstFailure,null);
  assert.doesNotMatch(JSON.stringify(packet.frameTimeline),/NaN|Infinity/);
});

test('passive oracle ledger snapshots chronological finite commands and replies including old meter epochs',async()=>{
  const f=await fixture(oracleOptions(44100));f.feed(0);
  const command=configure(1),meter=power(7,{meterEpoch:0});
  f.product.port.postMessage(command);f.product.receive(reply('accepted',1,128,{meterEpoch:2}));
  f.product.port.postMessage(meter);f.product.receive(reply('meter-accepted',7,256,{meterEpoch:2,code:'hold'}));
  f.product.port.postMessage({kind:'read-error',sourceEpoch:1,meterEpoch:0,meterSeq:9,observedTime:1});
  f.product.receive(reply('meter-accepted',9,384,{meterEpoch:2,code:'error'}));
  command.eq[0]=6;meter.leftPower=99;
  const partial=await f.probe.action({kind:'l1-partial'}),ledger=partial.oracleEvidence.ledger;
  assert.equal(ledger.available,true);assert.equal(ledger.reason,null);assert.equal(ledger.eventCount,6);
  assert.deepEqual(Array.from(ledger.events,event=>[event.order,event.direction]),[[1,'send'],[2,'receive'],[3,'send'],[4,'receive'],[5,'send'],[6,'receive']]);
  assert.equal(ledger.events[0].packet.eq[0],0);assert.equal(ledger.events[2].packet.leftPower,.01);
  assert.equal(ledger.events[2].packet.meterEpoch,0);assert.equal(ledger.events[3].packet.meterEpoch,2);
  assert.equal(ledger.events[4].packet.meterSeq,9);
  assert.equal(ledger.maxEvents,4128);assert.equal(ledger.maxBytes,1048576);
  assert.ok(Buffer.byteLength(JSON.stringify(ledger))<=ledger.bytes&&ledger.bytes<=ledger.maxBytes);
  for(const kind of ['facts','product-capture']){const result=await f.probe.action({kind,startFrame:0,endFrame:128});assert.equal('events'in result.oracleEvidence.ledger,false);assert.equal(result.oracleEvidence.ledger.eventCount,6);}
  const pending=power(10);f.product.port.postMessage(pending);
  const before=plain((await f.probe.action({kind:'l1-partial'})).oracleEvidence.ledger);
  await f.probe.action({kind:'facts'});await f.probe.action({kind:'product-capture',startFrame:0,endFrame:128});
  assert.deepEqual(plain((await f.probe.action({kind:'l1-partial'})).oracleEvidence.ledger),before);assert.equal(before.available,true);
});

test('oracle initial state snapshots only actual constructor epoch and mode without fabricating defaults',async()=>{
  const options={processorOptions:{sourceEpoch:7,initial:'silent-hold'}},f=await fixture(oracleOptions(44100),0,options);
  options.processorOptions.sourceEpoch=99;options.processorOptions.initial='raw';
  assert.deepEqual(plain((await f.probe.action({kind:'facts'})).oracleEvidence.initial),{available:true,reason:null,sourceEpoch:7,initial:'silent-hold'});
  for(const invalid of [undefined,{},{processorOptions:{sourceEpoch:1}},{processorOptions:{sourceEpoch:0,initial:'raw'}}]){
    const bad=await fixture(oracleOptions(44100),0,invalid===undefined?null:invalid),initial=(await bad.probe.action({kind:'l1-partial'})).oracleEvidence.initial;
    assert.equal(initial.available,false);assert.equal(initial.reason,'initial-options');assert.equal(initial.sourceEpoch,null);assert.equal(initial.initial,null);
  }
  f.createL1({processorOptions:{sourceEpoch:8,initial:'raw'}});
  const multiple=(await f.probe.action({kind:'facts'})).oracleEvidence.initial;
  assert.equal(multiple.available,false);assert.equal(multiple.reason,'multiple-l1-nodes');assert.equal(multiple.sourceEpoch,7);assert.equal(multiple.initial,'silent-hold');
});

test('old source epochs are preserved as finite ledger facts while original stream validation still rejects them',async()=>{
  const f=await fixture(oracleOptions(44100));f.feed(0);f.product.port.postMessage(configure(1));
  f.product.receive(reply('accepted',1,128,{sourceEpoch:2}));
  const partial=await f.probe.action({kind:'l1-partial'});
  assert.equal(partial.oracleEvidence.ledger.available,true);assert.equal(partial.oracleEvidence.ledger.events[1].packet.sourceEpoch,2);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),/reply-invalid/);
});

test('malformed meter packets make ledger unavailable without retaining arbitrary payload or replacing original STOP',async()=>{
  const f=await fixture(oracleOptions(44100));f.feed(0);f.product.port.postMessage(configure(1));
  f.product.port.postMessage(power(1,{leftPower:NaN,arbitrary:'not-retained'}));f.product.port.postMessage(power(2));
  const ledger=(await f.probe.action({kind:'l1-partial'})).oracleEvidence.ledger;
  assert.equal(ledger.available,false);assert.equal(ledger.reason,'noncanonical-send-packet');assert.equal(ledger.eventCount,1);
  assert.doesNotMatch(JSON.stringify(ledger),/arbitrary|not-retained/);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),/meter-command/);
});

test('nonfinite protocol replies are omitted rather than JSON-coerced into canonical evidence',async()=>{
  const f=await fixture(oracleOptions(44100));f.product.receive(reply('meter-accepted',1,NaN,{code:'hold'}));
  const ledger=(await f.probe.action({kind:'l1-partial'})).oracleEvidence.ledger;
  assert.equal(ledger.available,false);assert.equal(ledger.eventCount,0);assert.equal(ledger.reason,'noncanonical-receive-packet');
});

test('oracle ledger stops at 4128 events while preserving original 2000 meter gates',async()=>{
  const f=await fixture(oracleOptions(44100));
  for(let seq=1;seq<=2065;seq++){f.product.port.postMessage({kind:'read-error',sourceEpoch:1,meterEpoch:0,meterSeq:seq,observedTime:seq});f.product.receive(reply('meter-accepted',seq,seq*128,{code:'error'}));}
  const partial=await f.probe.action({kind:'l1-partial'}),ledger=partial.oracleEvidence.ledger;
  assert.equal(ledger.available,false);assert.equal(ledger.reason,'event-bound');assert.equal(ledger.eventCount,4128);assert.equal(ledger.events.length,4128);
  assert.ok(Buffer.byteLength(JSON.stringify(ledger))<=ledger.bytes&&ledger.bytes<=1048576);assert.equal(partial.meterDiagnostics.sent,2065);assert.equal(partial.meterDiagnostics.received,2065);assert.ok(partial.streamError);
});

test('canonical UTF8 wrapper and events stay within one MiB and overflow remains sticky',async()=>{
  const f=await fixture(oracleOptions(44100));
  for(let seq=1;seq<=4128;seq++)f.product.receive(reply('failed',seq,seq*128,{code:'界'.repeat(80)}));
  const ledger=(await f.probe.action({kind:'l1-partial'})).oracleEvidence.ledger;
  assert.equal(ledger.available,false);assert.equal(ledger.reason,'byte-bound');assert.ok(ledger.eventCount<4128);
  assert.ok(Buffer.byteLength(JSON.stringify(ledger))<=ledger.bytes&&ledger.bytes<=1048576);
  f.product.receive(null);assert.deepEqual(plain((await f.probe.action({kind:'l1-partial'})).oracleEvidence.ledger),plain(ledger));
});

test('actual product capture producer distinguishes repeated process frames with stable per-node identity and fresh bytes',async()=>{
  const f=await fixture(),control=captureProducer(f,2),source=captureProducer(f,1),program=captureProducer(f,0);
  const samples=Array.from({length:5},(_,c)=>new Float32Array(128).fill(c+.25));
  const first=control.process(128,samples);samples[0][0]=.75;const second=control.process(128,samples);
  assert.equal(first.producerRole,'control');assert.equal(first.producerId,2);assert.equal(first.producerSequence,1);
  assert.equal(second.producerId,2);assert.equal(second.producerSequence,2);assert.equal(first.frame,second.frame);
  assert.equal(first.samples[0][0],.25);assert.equal(second.samples[0][0],.75);assert.equal(samples[0].byteLength,512);
  assert.notEqual(first.samples[0].buffer,second.samples[0].buffer);
  for(const [producer,id,role]of [[program,0,'program'],[source,1,'source']]){
    const packet=producer.process(128,samples.slice(0,2));assert.equal(packet.producerId,id);assert.equal(packet.producerRole,role);assert.equal(packet.producerSequence,1);
  }
});

for(const repeatedInvocation of [true,false])test(`first duplicate control evidence distinguishes ${repeatedInvocation?'two producer invocations':'one packet delivered twice'} without admitting duplicate frames`,async()=>{
  const f=await fixture(),producer=captureProducer(f,2);f.feed(0);
  const samples=Array.from({length:5},(_,c)=>new Float32Array(128).fill(c+.125)),first=producer.process(128,samples);
  f.captures[2].receive(first);const bad=repeatedInvocation?producer.process(128,samples):first;f.captures[2].receive(bad);
  const facts=await f.probe.action({kind:'facts'}),diagnostic=facts.productObservation.firstStreamFailure;
  assert.equal(diagnostic.frame,128);assert.equal(diagnostic.previousRetainedFrame,128);assert.equal(diagnostic.producerId,2);assert.equal(diagnostic.previousProducerId,2);
  assert.equal(diagnostic.previousProducerSequence,1);assert.equal(diagnostic.producerSequence,repeatedInvocation?2:1);
  assert.equal(diagnostic.receivedSequence,3);assert.equal(diagnostic.previousReceivedSequence,2);
  assert.equal(facts.productObservation.streamError,'audio-l1-stream-gap');
  assert.doesNotMatch(JSON.stringify(facts),/firstStreamFailureEvidence|base64/);
  const partial=await f.probe.action({kind:'l1-partial'}),evidence=partial.firstStreamFailureEvidence;
  assert.ok(evidence,'first previous/current raw packet pair must survive separately from rings');assert.equal(evidence.bytes,5120);
  assert.deepEqual(Array.from(evidence.packets,packet=>packet.position),['previous','current']);
  assert.deepEqual(Array.from(evidence.packets,packet=>packet.producerSequence),[1,repeatedInvocation?2:1]);
  assert.deepEqual(Array.from(evidence.packets,packet=>packet.receivedSequence),[2,3]);
  for(const packet of evidence.packets)for(const [c,channel]of packet.channels.entries()){
    assert.equal(channel.encoding,'float32le');assert.deepEqual(Buffer.from(channel.base64,'base64'),Buffer.from(new Uint8Array(samples[c].buffer)));
  }
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),/audio-l1-stream-gap/);
});

for(const [role,id,channels]of [['source',1,2],['control',2,5]])
for(const [label,secondFrame]of [['repeated',128],['missing',384]])test(`${role} ${label} frame preserves the first distinct producer and receiver packets`,async()=>{
  const f=await fixture({...oracleOptions(44100),normalizerWitness:true}),producer=captureProducer(f,id);
  f.feed(0);
  const pair=[128,secondFrame].map((frame,index)=>producer.process(frame,
    Array.from({length:channels},(_,channel)=>new Float32Array(128).fill((channel%2?-1:1)*(.125+channel/8+index/8))),{frameTimeline:new Float32Array(128)}));
  const expected=pair.map(packet=>packet.samples.map(channel=>Buffer.from(new Uint8Array(channel.buffer))));
  for(const packet of pair)f.captures[id].receive(packet);
  const first=plain(await f.probe.action({kind:'l1-partial'}));
  assert.equal(first.streamError,'audio-l1-stream-gap');
  assert.equal(first.firstStreamFailure.role,role);assert.equal(first.firstStreamFailure.reason,'gap');
  const evidence=first.firstStreamFailureEvidence;
  assert.equal(evidence.bytes,2*channels*512);
  assert.deepEqual(evidence.packets.map(({position,frame,producerId,producerSequence,receivedSequence})=>[position,frame,producerId,producerSequence,receivedSequence]),
    [['previous',128,id,1,2],['current',secondFrame,id,2,3]]);
  for(const [i,packet]of evidence.packets.entries())for(const [channel,value]of packet.channels.entries()){
    assert.equal(value.encoding,'float32le');assert.deepEqual(Buffer.from(value.base64,'base64'),expected[i][channel]);
  }
  f.captures[id].receive(producer.process(secondFrame+256,pair[1].samples,{frameTimeline:new Float32Array(128)}));
  const later=await f.probe.action({kind:'l1-partial'});
  assert.deepEqual(plain(later.firstStreamFailure),first.firstStreamFailure);
  assert.deepEqual(plain(later.firstStreamFailureEvidence),evidence);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),/audio-l1-stream-gap/);
});

test('first raw diagnostic preserves Float32 bit patterns and immutable bytes after packet mutation',async()=>{
  const f=await fixture();f.feed(0);
  const previous={frame:128,producerId:2,producerSequence:1,samples:Array.from({length:5},()=>new Float32Array(128))};
  new Uint32Array(previous.samples[0].buffer).set([0x80000000,0x00000001,0x3f800000]);f.captures[2].receive(previous);
  const current={frame:256,producerId:2,producerSequence:2,samples:Array.from({length:5},()=>new Float32Array(128))};
  new Uint32Array(current.samples[4].buffer)[7]=0x7fc12345;
  const expected=[previous,current].map(packet=>packet.samples.map(channel=>Buffer.from(new Uint8Array(channel.buffer))));
  f.captures[2].receive(current);previous.samples[0].fill(1);current.samples[4].fill(2);
  const partial=await f.probe.action({kind:'l1-partial'}),evidence=partial.firstStreamFailureEvidence;
  assert.ok(evidence);assert.equal(evidence.bytes,5120);
  for(const [i,packet]of evidence.packets.entries())for(const [c,channel]of packet.channels.entries())assert.deepEqual(Buffer.from(channel.base64,'base64'),expected[i][c]);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),/audio-l1-stream-shape/);
});

test('first packet pair is bounded at 5120 bytes, retained through ring aging and never replaced',async()=>{
  const f=await fixture();f.feed(0);
  f.captures[2].receive({frame:128,producerId:2,producerSequence:2,samples:Array.from({length:1000},()=>new Float32Array(129).fill(.25))});
  const partial=await f.probe.action({kind:'l1-partial'}),evidence=plain(partial.firstStreamFailureEvidence);
  assert.ok(evidence);assert.equal(evidence.bytes,5120);assert.equal(evidence.packets.length,2);
  assert.ok(evidence.packets.every(packet=>packet.channels.length===5&&packet.channels.every(channel=>Buffer.from(channel.base64,'base64').length===512)));
  for(let frame=128;frame<256384;frame+=128)f.feed(frame);
  const aged=await f.probe.action({kind:'l1-partial'});assert.ok(aged.streams[2].chunks[0].frame>128);
  assert.deepEqual(plain(aged.firstStreamFailureEvidence),evidence);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:256128,endFrame:256256}));
});

test('missing producer metadata and malformed packets retain bounded diagnostic nulls without changing acceptance',async()=>{
  const f=await fixture();f.feed(0);f.captures[2].receive(null);
  const partial=await f.probe.action({kind:'l1-partial'}),first=partial.firstStreamFailure,evidence=partial.firstStreamFailureEvidence;
  assert.equal(first.producerId,null);assert.equal(first.producerSequence,null);assert.equal(first.previousProducerId,null);assert.equal(first.previousProducerSequence,null);
  assert.equal(first.receivedSequence,2);assert.equal(first.previousReceivedSequence,1);
  assert.ok(evidence);assert.equal(evidence.bytes,2560);assert.equal(evidence.packets[1].frame,null);assert.equal(evidence.packets[1].channels.length,0);
  assert.equal(partial.streamError,'audio-product-stream-shape');
});

for(const options of [44100,{sampleRate:48000,installed:true}])test(`legacy ${typeof options==='number'?'numeric':'installed'} capture producer keeps exact original code and packet shape`,async()=>{
  const f=await fixture(options),producer=captureProducer(f,0),samples=[new Float32Array(128),new Float32Array(128)];
  assert.equal(require('node:crypto').createHash('sha256').update(f.producerCode).digest('hex'),'6e9d156f333a819d9921313f882ad0014de9aac102a6cce4bd3d7ad5751c3147');
  assert.deepEqual(Object.keys(producer.process(0,samples)).sort(),['frame','samples']);assert.equal(f.captures[0].options.processorOptions,undefined);
  if(typeof options!=='number'){f.feed(0);const partial=await f.probe.action({kind:'l1-partial'});assert.equal('firstStreamFailureEvidence'in partial,false);}
});

test('product configure cannot trigger fake bootstrap delivery in response to the real config request',async()=>{
  const f=await fixture();
  await assert.rejects(()=>f.probe.action({kind:'bootstrap'}),/bootstrap-forbidden/);
  const configured=await f.probe.action({kind:'configure',config:{normalizerEnabled:true},gain:1,enabled:true});
  assert.equal(configured.status,'on');assert.equal(f.runtime.config.normalizerEnabled,true);
  assert.doesNotThrow(()=>f.requestConfig());assert.deepEqual(f.messages,[]);
});

test('product observation cannot qualify itself through the installed J1 capture action',async()=>{
  const f=await fixture();f.feed(0);
  await assert.rejects(()=>f.probe.action({kind:'l1-capture'}));
});

test('default product window uses the common available frames after source formation and stops at one second',async()=>{
  const f=await fixture(undefined,129);
  for(let frame=128;frame<44928;frame+=128){f.send(0,frame);if(frame>=256)f.send(1,frame);if(frame>=384)f.send(2,frame);}
  const capture=await f.probe.action({kind:'product-capture'});
  assert.equal(capture?.start,384);assert.equal(capture.end,44484);
  assert.deepEqual(Array.from(capture.streams,stream=>[stream.start,stream.end]),[[384,44484],[384,44484],[384,44484]]);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:128,endFrame:256}));
});

test('product cropping preserves sample boundaries across adjacent observer chunks',async()=>{
  const f=await fixture();f.feed(0);f.feed(128,[[.75,.75],[1,1],[-1,1,2,1,0]]);
  const capture=await f.probe.action({kind:'product-capture',startFrame:64,endFrame:192});
  assert.equal(capture?.start,64);assert.equal(capture.end,192);
  const first=['0000803e0000803e','0000003f0000003f','000000bf0000003f0000803f0000803f00000000'];
  const second=['0000403f0000403f','0000803f0000803f','000080bf0000803f000000400000803f00000000'];
  for(const [index,stream]of capture.streams.entries())assert.deepEqual(Buffer.from(stream.base64,'base64'),Buffer.concat([literalBytes(first[index],64),literalBytes(second[index],64)]));
});

test('empty, stale, future, reversed and fractional product windows cannot return success',async()=>{
  const f=await fixture();await assert.rejects(()=>f.probe.action({kind:'product-capture'}));
  for(let frame=0;frame<512;frame+=128)f.feed(frame);
  for(const [startFrame,endFrame]of [[-1,128],[.5,128],[0,128.5],[0,0],[128,0],[0,513],[NaN,128],[0,Infinity]])
    await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame,endFrame}));
});

test('product capture accepts a full 1.5 seconds and rejects one additional frame',async()=>{
  const f=await fixture();for(let frame=0;frame<66560;frame+=128)f.feed(frame);
  const capture=await f.probe.action({kind:'product-capture',startFrame:0,endFrame:66150});
  assert.equal(capture?.end,66150);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:66151}));
});

for(const [name,index,packet]of [
  ['program gap',0,{frame:256,samples:[new Float32Array(128),new Float32Array(128)]}],
  ['source overlap',1,{frame:0,samples:[new Float32Array(128),new Float32Array(128)]}],
  ['control gap',2,{frame:256,samples:Array.from({length:5},()=>new Float32Array(128))}],
  ['program fractional frame',0,{frame:128.5,samples:[new Float32Array(128),new Float32Array(128)]}],
  ['source short channel',1,{frame:128,samples:[new Float32Array(127),new Float32Array(128)]}],
  ['control missing channels',2,{frame:128,samples:[new Float32Array(128)]}],
  ['program nonfinite sample',0,{frame:128,samples:[new Float32Array(128).fill(NaN),new Float32Array(128)]}],
  ['source nonfinite sample',1,{frame:128,samples:[new Float32Array(128).fill(Infinity),new Float32Array(128)]}],
  ['control nonfinite sample',2,{frame:128,samples:Array.from({length:5},()=>new Float32Array(128).fill(-Infinity))}]
])test(`${name} remains a global formation error even when the requested product subwindow is good`,async()=>{
  const f=await fixture();f.feed(0);
  assert.doesNotThrow(()=>f.captures[index]?.receive(packet));
  f.feed(128);f.feed(256);f.feed(384);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:384,endFrame:512}));
});

test('product rings retain the newest 2000 chunks without turning aged out audio into a successful window',async()=>{
  const f=await fixture();for(let frame=0;frame<256256;frame+=128)f.feed(frame);
  const facts=await f.probe.action({kind:'facts'});
  assert.deepEqual(plain(facts.productObservation?.bufferedChunks),[2000,2000,2000]);
  assert.equal(facts.productObservation.commonStart,256);assert.equal(facts.productObservation.commonEnd,256256);
  const capture=await f.probe.action({kind:'product-capture',startFrame:256128,endFrame:256256});
  assert.equal(capture.start,256128);assert.equal(capture.end,256256);assert.equal(capture.streamError,'');
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

test('a product stream gap preserves its actual three raw streams under a distinct partial schema',async()=>{
  const f=await fixture();f.feed(0);f.feed(256);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:256,endFrame:384}));
  const partial=await f.probe.action({kind:'l1-partial'});
  assert.equal(partial.schema,'f01-product-partial-v1');assert.equal(partial.productObservation,true);
  assert.ok(partial.streamError);assert.deepEqual(Array.from(partial.streams,stream=>stream.channels),[2,2,5]);
  assert.deepEqual(Array.from(partial.streams,stream=>Array.from(stream.chunks,row=>row.frame)),[[0,256],[0,256],[0,256]]);
  const expected=['0000803e0000803e','0000003f0000003f','000000bf0000003f0000803f0000803f00000000'];
  for(const [index,stream]of partial.streams.entries())for(const row of stream.chunks){
    assert.equal(row.encoding,'interleaved-float32le');assert.deepEqual(Buffer.from(row.base64,'base64'),literalBytes(expected[index],128));
  }
  const facts=await f.probe.action({kind:'facts'});
  assert.deepEqual(plain(partial.meterDiagnostics),plain(facts.productObservation.meterDiagnostics));
});

test('normal meter traffic is bounded summary data and cannot consume the configure lifecycle log',async()=>{
  const f=await fixture();f.feed(0);
  f.product.port.postMessage(configure(1));f.product.receive(reply('accepted',1,0));f.product.receive(reply('completed',1,1728));
  for(let seq=1;seq<=125;seq++){
    f.context.currentTime=seq*128/44100;
    const common={sourceEpoch:1,meterEpoch:0,meterSeq:seq,observedTime:seq*128/44100};
    f.product.port.postMessage(seq%2?{kind:'power',...common,leftPower:.01,rightPower:.02,active:true,targetDbfs:-18}:{kind:'read-error',...common});
    f.product.receive(reply('meter-accepted',seq,seq*128,{code:'hold'}));
  }
  f.product.port.postMessage({kind:'retire',sourceEpoch:1,seq:2});f.product.receive(reply('retired',2,16128));
  const capture=await f.probe.action({kind:'product-capture',startFrame:0,endFrame:128});
  assert.deepEqual(Array.from(capture?.commands??[],row=>row.message.kind),['configure','retire']);
  assert.deepEqual(Array.from(capture.replies,row=>row.kind),['accepted','completed','retired']);
  assert.deepEqual(plain(capture.meterDiagnostics),{sent:125,received:125,statuses:{hold:125},firstFrame:128,lastFrame:16000,firstSeq:1,lastSeq:125,fullPacketsRetained:false});
  const facts=await f.probe.action({kind:'facts'});
  assert.deepEqual(plain(facts.productObservation.meterDiagnostics),plain(capture.meterDiagnostics));
  assert.doesNotMatch(JSON.stringify(facts.productObservation),/leftPower|rightPower|observedTime/);
});

for(const packet of [reply('failed',1,128,{code:'l1-packet-invalid'}),reply('rejected',1,128,{code:'l1-config-invalid'}),reply('unknown',1,128),{kind:'accepted'},null])
test(`product lifecycle retains ${packet?.kind??'null'} replies and refuses to hide their failure`,async()=>{
  const f=await fixture();f.feed(0);assert.doesNotThrow(()=>f.product.receive(packet));
  const facts=await f.probe.action({kind:'facts'});
  assert.deepEqual(plain(facts.productObservation?.replies?.at(-1)),packet);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

for(const direction of ['commands','replies'])test(`the 65th product lifecycle ${direction} cannot disappear behind meter summarization`,async()=>{
  const f=await fixture();f.feed(0);
  for(let seq=1;seq<=64;seq++){
    if(direction==='commands')f.product.port.postMessage(configure(seq));else f.product.receive(reply('accepted',seq,seq*128));
  }
  const capture=await f.probe.action({kind:'product-capture',startFrame:0,endFrame:128});
  assert.equal(capture?.[direction].length,64);
  if(direction==='commands')f.product.port.postMessage(configure(65));else f.product.receive(reply('accepted',65,8320));
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

for(const [name,bad]of [
  ['duplicate meter sequence',reply('meter-accepted',1,256,{meterEpoch:1,code:'hold'})],
  ['backwards meter frame',reply('meter-accepted',2,0,{meterEpoch:1,code:'hold'})],
  ['backwards meter epoch',reply('meter-accepted',2,256,{meterEpoch:0,code:'hold'})]
])test(`${name} cannot be summarized as healthy product observation`,async()=>{
  const f=await fixture();f.feed(0);f.product.receive(reply('meter-accepted',1,128,{meterEpoch:1,code:'hold'}));f.product.receive(bad);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

test('unbounded meter summary traffic eventually fails its guard',async()=>{
  const f=await fixture();f.feed(0);
  for(let seq=1;seq<=2001;seq++)f.product.receive(reply('meter-accepted',seq,seq*128,{code:'hold'}));
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

for(const [name,packet]of [
  ['nonfinite power target',{kind:'power',sourceEpoch:1,meterEpoch:0,meterSeq:1,observedTime:0,leftPower:.01,rightPower:.02,active:true,targetDbfs:NaN}],
  ['unexpected read-error fields',{kind:'read-error',sourceEpoch:1,meterEpoch:0,meterSeq:1,observedTime:0,leftPower:.01}]
])test(`${name} cannot leave a successful product window while awaiting a runtime reply`,async()=>{
  const f=await fixture();f.feed(0);assert.doesNotThrow(()=>f.product.port.postMessage(packet));
  const facts=await f.probe.action({kind:'facts'});
  assert.deepEqual(plain(facts.productObservation.commands.at(-1)?.message),plain(packet));
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

for(const [name,packet]of [
  ['configure with missing fields',{kind:'configure',sourceEpoch:1,seq:1}],
  ['retire with invalid sequence',{kind:'retire',sourceEpoch:1,seq:0}]
])test(`${name} is retained and invalidates product observation before a reply arrives`,async()=>{
  const f=await fixture();f.feed(0);assert.doesNotThrow(()=>f.product.port.postMessage(packet));
  const facts=await f.probe.action({kind:'facts'});
  assert.deepEqual(plain(facts.productObservation.commands.at(-1).message),packet);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

for(const [name,packet]of [
  ['accepted reply with extra fields',reply('accepted',1,128,{unexpected:true})],
  ['meter reply with extra fields',reply('meter-accepted',1,128,{code:'hold',unexpected:true})],
  ['completed reply without applied gain',reply('completed',1,128,{gain:null})]
])test(`${name} is retained instead of treated as healthy observation`,async()=>{
  const f=await fixture();f.feed(0);assert.doesNotThrow(()=>f.product.receive(packet));
  const facts=await f.probe.action({kind:'facts'});
  assert.deepEqual(plain(facts.productObservation.replies.at(-1)),packet);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

test('a lifecycle reply cannot silently switch the configured source epoch',async()=>{
  const f=await fixture();f.feed(0);f.product.port.postMessage(configure(1));f.product.receive(reply('accepted',1,128));
  f.product.receive(reply('completed',1,256,{sourceEpoch:2}));
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

test('the first meter reply cannot silently switch the outgoing source epoch',async()=>{
  const f=await fixture();f.feed(0);
  f.product.port.postMessage({kind:'read-error',sourceEpoch:1,meterEpoch:0,meterSeq:1,observedTime:0});
  f.product.receive(reply('meter-accepted',1,128,{sourceEpoch:2,code:'hold'}));
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

for(const [name,index]of [['source',1],['control',2]])test(`a null ${name} packet records a global product error without escaping its message handler`,async()=>{
  const f=await fixture();f.feed(0);assert.doesNotThrow(()=>f.captures[index].receive(null));f.feed(128);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:128,endFrame:256}));
});

test('legacy numeric bootstrap and installed J1 injection restrictions stay distinct from product observation',async()=>{
  const legacy=await fixture(44100);await legacy.probe.action({kind:'bootstrap'});assert.equal(legacy.messages.length,1);
  const installed=await fixture({sampleRate:48000,installed:true});installed.feed(0);
  await assert.rejects(()=>installed.probe.action({kind:'bootstrap'}),/fake-bootstrap-forbidden/);
  await assert.rejects(()=>installed.probe.action({kind:'configure'}),/direct-config-forbidden/);
  const capture=await installed.probe.action({kind:'l1-capture'});assert.equal(capture.sampleRate,48000);
  assert.deepEqual(Array.from(capture.streams,stream=>stream.channels),[2,2,5]);
  await assert.rejects(()=>installed.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

test('product observation accepts boolean dynamics configure packets and retains a malformed flag as failure',async()=>{
  for(const dynamics of [true,false]){
    const f=await fixture();f.feed(0);f.product.port.postMessage({...configure(1),dynamics});
    const capture=await f.probe.action({kind:'product-capture',startFrame:0,endFrame:128});assert.equal(capture.commands[0].message.dynamics,dynamics);
  }
  const f=await fixture(),packet={...configure(1),dynamics:'yes'};f.feed(0);f.product.port.postMessage(packet);
  const facts=await f.probe.action({kind:'facts'});assert.deepEqual(plain(facts.productObservation.commands.at(-1).message),packet);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

for(const [role,index,reason,packet,error]of [
  ['source',1,'shape',{frame:128,samples:[new Float32Array(127),new Float32Array(128)]},'audio-l1-stream-shape'],
  ['control',2,'gap',{frame:256,samples:Array.from({length:5},()=>new Float32Array(128))},'audio-l1-stream-gap'],
  ['program',0,'gap',{frame:256,samples:[new Float32Array(128),new Float32Array(128)]},'audio-product-stream-gap'],
  ['program',0,'shape',{frame:128,samples:[new Float32Array(128)]},'audio-l1-capture-invalid']
])test(`first stream diagnostic records ${role} ${reason} without changing rejection`,async()=>{
  const f=await fixture({sampleRate:48000,productObservation:true});f.feed(0);f.context.currentTime=384/48000;
  f.captures[index].receive(packet);
  const facts=await f.probe.action({kind:'facts'}),first=plain(facts.productObservation.firstStreamFailure);
  assert.ok(first,'the first rejected stream packet must retain diagnostic metadata');
  assert.equal(first.role,role);assert.equal(first.reason,reason);assert.equal(first.frame,packet.frame);assert.equal(first.observedFrame,384);
  assert.equal(first.sourceFrame,0);assert.equal(first.captureStartFrame,0);assert.equal(first.previousRetainedFrame,0);
  assert.equal(first.expectedChannels,index===2?5:2);assert.equal(first.actualChannels,packet.samples.length);
  assert.deepEqual(first.types,packet.samples.map(()=> 'Float32Array'));assert.deepEqual(first.lengths,packet.samples.map(row=>row.length));
  assert.equal(first.firstNonfinite,null);
  const partial=await f.probe.action({kind:'l1-partial'});assert.deepEqual(plain(partial.firstStreamFailure),first);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),new RegExp(error));
});

for(const [role,index]of [['source',1],['program',0]])test(`first stream diagnostic retains ${role} nonfinite coordinates as finite metadata`,async()=>{
  const f=await fixture();f.feed(0);const samples=[new Float32Array(128),new Float32Array(128)];samples[1][7]=Infinity;
  f.captures[index].receive({frame:128,samples});
  const facts=await f.probe.action({kind:'facts'}),first=plain(facts.productObservation.firstStreamFailure);
  assert.ok(first,'the first nonfinite packet must retain diagnostic metadata');
  assert.equal(first.role,role);assert.equal(first.previousRetainedFrame,0);assert.deepEqual(first.firstNonfinite,{channel:1,index:7,kind:'Infinity'});
  assert.doesNotThrow(()=>JSON.stringify(first));assert.ok(JSON.stringify(first).length<2048);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

test('first stream diagnostic bounds malformed metadata and survives subsequent invalidChunks rollover',async()=>{
  const f=await fixture();f.feed(0);
  f.captures[1].receive({frame:128,samples:Array.from({length:1000},()=>new Float32Array(129).fill(NaN))});
  const first=plain((await f.probe.action({kind:'facts'})).productObservation.firstStreamFailure);
  assert.ok(first,'the first malformed packet must retain diagnostic metadata');
  assert.equal(first.role,'source');assert.equal(first.actualChannels,1000);assert.equal(first.types.length,5);assert.equal(first.lengths.length,5);
  assert.deepEqual(first.firstNonfinite,{channel:0,index:0,kind:'NaN'});assert.ok(JSON.stringify(first).length<2048);
  for(let n=0;n<70;n++){f.context.currentTime=n;f.captures[0].receive({frame:128+n*128,samples:[new Float32Array(127)]});}
  const facts=await f.probe.action({kind:'facts'});assert.equal(facts.invalidChunks.length,64);assert.equal(facts.invalidFrames,70);
  assert.deepEqual(plain(facts.productObservation.firstStreamFailure),first);
  assert.deepEqual(plain((await f.probe.action({kind:'l1-partial'})).firstStreamFailure),first);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}));
});

test('first stream diagnostic keeps strict pre-source startup exclusion and rejects equality',async()=>{
  const f=await fixture({sampleRate:48000,productObservation:true},3840);
  f.captures[1].receive({frame:3712,samples:[]});f.captures[2].receive({frame:3712,samples:[]});f.feed(3840);
  assert.equal((await f.probe.action({kind:'facts'})).productObservation.firstStreamFailure,null);
  assert.equal((await f.probe.action({kind:'product-capture',startFrame:3840,endFrame:3968})).streamError,'');
  f.captures[1].receive({frame:3840,samples:[]});
  const first=plain((await f.probe.action({kind:'facts'})).productObservation.firstStreamFailure);
  assert.equal(first.role,'source');assert.equal(first.frame,3840);assert.equal(first.sourceFrame,3840);assert.equal(first.actualChannels,0);
  assert.deepEqual(first.types,[]);assert.deepEqual(first.lengths,[]);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:3840,endFrame:3968}),/audio-l1-stream-shape/);
});

test('first stream diagnostic handles a malformed outer packet without storing its arbitrary payload',async()=>{
  const f=await fixture();f.feed(0);f.captures[2].receive(null);
  const first=plain((await f.probe.action({kind:'facts'})).productObservation.firstStreamFailure);
  assert.ok(first,'a malformed outer packet must retain diagnostic metadata');
  assert.equal(first.role,'control');assert.equal(first.reason,'shape');assert.equal(first.frame,null);assert.equal(first.actualChannels,null);
  assert.deepEqual(first.types,[]);assert.deepEqual(first.lengths,[]);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),/audio-product-stream-shape/);
});

test('N60 original WAV patterns preserve mono geometry silent channels and antiphase bytes at every rate and level',async()=>{
  const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs');
  for(const s of normalizerMeasurementCases()){const f=await fixture({sampleRate:s.sampleRate,productObservation:true,oracleEvidence:true,normalizerWitness:true}),result=await f.probe.action({kind:'signal',frequency:1000,inputDbfs:s.inputDbfs,pattern:s.pattern,phase:.37,durationSeconds:1}),bytes=Buffer.from(await f.blobs.at(-1).arrayBuffer()),channels=s.pattern==='mono'?1:2;
    assert.equal(bytes.readUInt16LE(22),channels,s.id);assert.equal(bytes.readUInt32LE(24),s.sampleRate);assert.equal(bytes.length,44+s.sampleRate*channels*4);assert.equal((await f.probe.action({kind:'facts'})).signal.pattern,s.pattern);assert.equal(result.channels,channels);
    for(const n of [0,1,128,s.sampleRate-1])for(let c=0;c<channels;c++){const quiet=s.pattern==='left'&&c===1||s.pattern==='right'&&c===0,sign=s.pattern==='antiphase'&&c===1?-1:1,expected=quiet?0:sign*Math.SQRT2*10**(s.inputDbfs/20)*Math.sin(2*Math.PI*1000*n/s.sampleRate+.37);assert.equal(bytes.readFloatLE(44+(n*channels+c)*4),Math.fround(expected),s.id);}
  }
});


test('headroom probe is opt-in v3 and preserves the normalizer application null meaning',async()=>{
  await assert.rejects(()=>fixture({sampleRate:48000,productObservation:true,headroomWitness:true}),/headroom/);
  const f=await fixture({sampleRate:48000,productObservation:true,oracleEvidence:true,normalizerWitness:true,headroomWitness:true});
  const h={sourceEpoch:1,commandSeq:1,startFrame:128,endFrame:256,eq:Array(8).fill(6),headroom:10**(-48/20)};
  f.product.receive(reply('prepared',0,0));f.product.port.postMessage({...configure(1),wanted:true});f.product.receive(reply('accepted',1,0));f.product.receive(reply('completed',1,128));
  f.product.port.postMessage({kind:'power',sourceEpoch:1,meterEpoch:0,meterSeq:1,observedTime:128/48000,leftPower:.01,rightPower:.01,active:true,targetDbfs:-20});
  f.product.receive({...reply('meter-accepted',1,128),code:'hold',application:null,renderHeadroom:h});
  const e=(await f.probe.action({kind:'facts',fullOracle:true})).oracleEvidence;assert.equal(e.schema,'f01-oracle-evidence-v3');assert.equal(e.ledger.schema,'f01-control-ledger-v3');assert.equal(e.ledger.available,true);
  const p=e.ledger.events.at(-1).packet;assert.equal(p.application,null);assert.equal(p.renderHeadroom.headroom,h.headroom);p.renderHeadroom.eq[0]=0;
  assert.equal((await f.probe.action({kind:'facts',fullOracle:true})).oracleEvidence.ledger.events.at(-1).packet.renderHeadroom.eq[0],6);
});


test('headroom facts observe actual compressor parameters without extending legacy facts',async()=>{
  const actual={threshold:{value:0},knee:{value:0},ratio:{value:1}},native={state:'running',currentTime:0,compressor:actual},f=await fixture({sampleRate:48000,productObservation:true,oracleEvidence:true,normalizerWitness:true,headroomWitness:true},0,undefined,native);
  f.context.createDynamicsCompressor();const facts=plain(await f.probe.action({kind:'facts'}));assert.deepEqual(facts.compressorParameters,[{threshold:0,knee:0,ratio:1}]);assert.equal(facts.compressors,1);actual.ratio.value=2;assert.equal(facts.compressorParameters[0].ratio,1);assert.equal((await f.probe.action({kind:'facts'})).compressorParameters[0].ratio,2);
  const legacy=await fixture();assert.equal('compressorParameters' in await legacy.probe.action({kind:'facts'}),false);
});


test('FFT buffer witness owns the first eligible read pair and metadata-only failure views',async()=>{
  const f=await fixture({...oracleOptions(48000),normalizerWitness:true,headroomWitness:true,fftBufferWitness:true},0,undefined,{state:'running',currentTime:0,captureIntervals:true});
  f.product.receive(reply('prepared',0,0));const p={kind:'configure',sourceEpoch:1,seq:3,wanted:true,gain:2,eq:Array(8).fill(6),normalizer:true,dynamics:true,targetDbfs:-12};f.product.port.postMessage(p);f.product.receive(reply('accepted',3,0));f.product.receive(reply('completed',3,128,{gain:2}));
  const left=f.context.createAnalyser(),right=f.context.createAnalyser(),buffer=new Float32Array(16384);f.context.currentTime=.3;left.getFloatTimeDomainData(buffer);right.getFloatTimeDomainData(buffer);assert.equal((await f.probe.action({kind:'facts'})).fftBufferWitness.status,'NOT_SELECTED');
  f.context.currentTime=.4;left.getFloatTimeDomainData(buffer);right.getFloatTimeDomainData(buffer);buffer.fill(9);const raw=await f.probe.action({kind:'fft-buffer'}),data=Buffer.from(raw.base64,'base64');assert.equal(raw.status,'CAPTURED');assert.equal(raw.selection.firstReadOrdinal,3);assert.equal(data.length,2*16384*4);assert.equal(data.readFloatLE(0),Math.fround(.01));
  f.context.currentTime=.5;left.getFloatTimeDomainData(buffer);right.getFloatTimeDomainData(buffer);assert.equal((await f.probe.action({kind:'fft-buffer'})).base64,raw.base64);assert.equal('base64' in (await f.probe.action({kind:'l1-partial'})).fftBufferWitness,false);assert.equal('base64' in (await f.probe.action({kind:'facts'})).fftBufferWitness,false);
  const legacy=await fixture();assert.equal('fftBufferWitness' in await legacy.probe.action({kind:'facts'}),false);
});


test('FFT missing right or invalid first buffer cannot be replaced by a later good pair',async()=>{
  for(const invalid of [false,true]){
    const f=await fixture({...oracleOptions(48000),normalizerWitness:true,headroomWitness:true,fftBufferWitness:true},0,undefined,{state:'running',currentTime:0,captureIntervals:true});f.product.receive(reply('prepared',0,0));f.product.port.postMessage({kind:'configure',sourceEpoch:1,seq:3,wanted:true,gain:2,eq:Array(8).fill(6),normalizer:true,dynamics:true,targetDbfs:-12});f.product.receive(reply('completed',3,128,{gain:2}));const left=f.context.createAnalyser(),right=f.context.createAnalyser(),buffer=new Float32Array(16384);f.context.currentTime=.4;
    left.getFloatTimeDomainData(invalid?new Float32Array(1024):buffer);f.context.currentTime=.5;left.getFloatTimeDomainData(buffer);right.getFloatTimeDomainData(buffer);const raw=await f.probe.action({kind:'fft-buffer'});assert.equal(raw.status,'UNAVAILABLE');assert.equal(raw.selection.firstReadOrdinal,1);assert.equal(raw.bytes,invalid?0:16384*4);
  }
});

test('FFT option validation and legacy read timestamps retain their original scope',async()=>{
  for(const patch of [{fftBufferWitness:'yes'},{fftBufferWitness:true},{normalizerWitness:true,headroomWitness:true,fftBufferWitness:true,normalizerControl:true}])await assert.rejects(()=>fixture({...oracleOptions(48000),...patch}),/fft-buffer/);
  const f=await fixture({...oracleOptions(48000),normalizerWitness:true},0,undefined,{state:'running',currentTime:0,captureIntervals:true}),analyser=f.context.createAnalyser(),buffer=new Float32Array(16384);buffer[Symbol.iterator]=function*(){f.context.currentTime=.1;yield* Float32Array.prototype.values.call(this);};analyser.getFloatTimeDomainData(buffer);const row=(await f.probe.action({kind:'facts'})).powerReads[0];assert.equal(row.time,.1);assert.equal('beforeTime'in row,false);await assert.rejects(()=>f.probe.action({kind:'fft-buffer'}),/disabled/);
});


test('FFT first eligible native read failure is sealed before any later good buffer',async()=>{
  const native={state:'running',currentTime:0,captureIntervals:true},f=await fixture({...oracleOptions(48000),normalizerWitness:true,headroomWitness:true,fftBufferWitness:true},0,undefined,native);f.product.receive(reply('prepared',0,0));f.product.port.postMessage({kind:'configure',sourceEpoch:1,seq:3,wanted:true,gain:2,eq:Array(8).fill(6),normalizer:true,dynamics:true,targetDbfs:-12});f.product.receive(reply('completed',3,128,{gain:2}));const left=f.context.createAnalyser(),right=f.context.createAnalyser(),buffer=new Float32Array(16384);f.context.currentTime=.4;native.throwFFT=true;assert.throws(()=>left.getFloatTimeDomainData(buffer),/native-first-fft-read/);f.context.currentTime=.5;left.getFloatTimeDomainData(buffer);right.getFloatTimeDomainData(buffer);const raw=await f.probe.action({kind:'fft-buffer'});assert.equal(raw.status,'UNAVAILABLE');assert.equal(raw.selection.firstReadOrdinal,1);assert.equal(raw.bytes,0);assert.equal(raw.reason,'first-pair-read-error');
});


function wireFftDiamond(f){
  const compressor=f.context.createDynamicsCompressor(),delay=f.context.createDelay(),wet=f.context.createGain(),dry=f.context.createGain(),mix=f.context.createGain(),splitter=f.context.createChannelSplitter(2),left=f.context.createAnalyser(),right=f.context.createAnalyser();
  f.product.connect(compressor,0);f.product.connect(delay,0);compressor.connect(wet);delay.connect(dry);wet.connect(mix);dry.connect(mix);mix.connect(splitter);splitter.connect(left,0);splitter.connect(right,1);
  return {compressor,delay,wet,dry,mix,splitter,left,right};
}
async function selectedFftProbe(){
  const f=await fixture({...oracleOptions(48000),normalizerWitness:true,headroomWitness:true,fftBufferWitness:true},0,undefined,{state:'running',currentTime:0,captureIntervals:true});
  f.product.receive(reply('prepared',0,0));f.product.port.postMessage({kind:'configure',sourceEpoch:1,seq:3,wanted:true,gain:2,eq:Array(8).fill(6),normalizer:true,dynamics:true,targetDbfs:-12});f.product.receive(reply('completed',3,128,{gain:2}));
  return {...f,route:wireFftDiamond(f),buffer:new Float32Array(16384)};
}
test('FFT pair seals actual node identities and native successful connection overloads',async()=>{
  const f=await selectedFftProbe(),g=f.route;
  assert.equal(g.mix.connect(g.splitter),g.splitter,'native return preserved');g.splitter.disconnect(g.right,1,0);g.splitter.connect(g.right,1);g.splitter.disconnect(1);g.splitter.connect(g.right,1);g.splitter.disconnect(g.left);g.splitter.connect(g.left,0);
  f.context.currentTime=.4;g.left.getFloatTimeDomainData(f.buffer);g.right.getFloatTimeDomainData(f.buffer);const first=plain(await f.probe.action({kind:'fft-buffer'})),r=first.routing;
  assert.equal(r.reason,null);assert.equal(r.version,r.endVersion);assert.equal(r.analyserIds.length,2);assert.equal(r.nodes.find(n=>n.id===r.analyserIds[0]).kind,'analyser');
  const incoming=r.edges.filter(e=>e.to===r.analyserIds[1]);assert.equal(incoming.length,1);assert.equal(incoming[0].output,1);assert.equal(incoming[0].input,0);assert.equal(r.edges.filter(e=>e.to===incoming[0].from).length,1);
  g.mix.disconnect();g.dry.connect(g.splitter);f.context.currentTime=.5;g.left.getFloatTimeDomainData(f.buffer);g.right.getFloatTimeDomainData(f.buffer);assert.deepEqual(plain(await f.probe.action({kind:'fft-buffer'})),first,'later routing correction cannot replace first pair');
  const facts=await f.probe.action({kind:'facts'});facts.fftBufferWitness.routing.nodes.length=0;assert.equal((await f.probe.action({kind:'l1-partial'})).fftBufferWitness.routing.nodes.length,r.nodes.length);
});
test('FFT route failures preserve native returns and throws and never select a repaired later pair',async()=>{
  for(const fault of ['connect','disconnect','calls','nodes','mid-pair']){
    const f=await selectedFftProbe(),g=f.route,original=Error('native-'+fault);
    if(fault==='connect'){f.native.throwConnect=true;f.native.connectError=original;assert.throws(()=>g.mix.connect(g.splitter),e=>e===original);assert.equal(g.mix.connect(g.splitter),g.splitter);}
    if(fault==='disconnect'){f.native.throwDisconnect=true;f.native.disconnectError=original;assert.throws(()=>g.mix.disconnect(g.splitter),e=>e===original);}
    if(fault==='calls')for(let i=0;i<260;i++)assert.equal(g.mix.connect(g.splitter),g.splitter);
    if(fault==='nodes')for(let i=0;i<70;i++)assert.ok(f.context.createGain());
    f.context.currentTime=.4;g.left.getFloatTimeDomainData(f.buffer);if(fault==='mid-pair'){g.mix.disconnect(g.splitter);g.mix.connect(g.splitter);}g.right.getFloatTimeDomainData(f.buffer);
    const raw=plain(await f.probe.action({kind:'fft-buffer'}));assert.equal(raw.status,'CAPTURED');assert.ok(raw.routing.reason,fault);assert.equal(raw.bytes,131072);
    f.context.currentTime=.5;g.left.getFloatTimeDomainData(f.buffer);g.right.getFloatTimeDomainData(f.buffer);assert.deepEqual(plain(await f.probe.action({kind:'fft-buffer'})),raw,fault);
  }
});


test('FFT forwarding preserves native receivers borrowed methods bare errors and other contexts',async()=>{
  const f=await selectedFftProbe(),g=f.route,connect=g.mix.connect,disconnect=g.mix.disconnect;
  assert.equal(connect.call(g.dry,g.splitter),g.splitter);assert.ok(g.dry.connections.some(e=>e[0]===g.splitter));assert.equal(disconnect.call(g.dry,g.splitter),undefined);
  assert.throws(()=>connect(g.splitter),/native-illegal-receiver/);assert.throws(()=>disconnect(),/native-illegal-receiver/);
  const foreign=f.context.createGain();foreign.context={};connect.call(foreign,g.splitter);disconnect.call(foreign,g.splitter);
  f.context.currentTime=.4;g.left.getFloatTimeDomainData(f.buffer);g.right.getFloatTimeDomainData(f.buffer);const r=(await f.probe.action({kind:'fft-buffer'})).routing;
  assert.equal(r.reason,null);assert.equal(r.edges.some(e=>e.from===r.nodes.find(n=>n.id===r.analyserIds[0]).id),false);
  const split=r.edges.find(e=>e.to===r.analyserIds[0]).from;assert.equal(r.edges.filter(e=>e.to===split).length,1,'borrowed disconnect removes the real sender edge');
});
test('FFT trace fails closed for an unregistered native sender without suppressing its work',async()=>{
  const f=await selectedFftProbe(),g=f.route,unknown=f.context.createOscillator();assert.equal(unknown.connect(g.mix),g.mix);assert.ok(unknown.connections.some(e=>e[0]===g.mix));
  unknown.disconnect(g.mix);f.context.currentTime=.4;g.left.getFloatTimeDomainData(f.buffer);g.right.getFloatTimeDomainData(f.buffer);const raw=await f.probe.action({kind:'fft-buffer'});assert.equal(raw.routing.reason,'untracked-source');assert.equal(raw.status,'CAPTURED');
});


test('FFT edge cap and unexpected trace errors retain native forwarding and bounded evidence',async()=>{
  for(const fault of ['edges','trace']){
    const f=await selectedFftProbe(),g=f.route;
    if(fault==='edges'){const senders=Array.from({length:12},()=>f.context.createGain()),receivers=Array.from({length:12},()=>f.context.createGain());for(const a of senders)for(const b of receivers)assert.equal(a.connect(b),b);}
    else{const parameter=g.dry.gain;Object.defineProperty(parameter,'connect',{get(){throw Error('trace-getter-failed');}});assert.equal(g.mix.connect(parameter),undefined);}
    f.context.currentTime=.4;g.left.getFloatTimeDomainData(f.buffer);g.right.getFloatTimeDomainData(f.buffer);const raw=await f.probe.action({kind:'fft-buffer'});
    assert.equal(raw.routing.reason,fault==='edges'?'edge-cap':'trace-failure');assert.ok(raw.routing.edges.length<=128);assert.ok(raw.routing.nodes.length<=64);assert.ok(Buffer.byteLength(JSON.stringify(raw.routing))<=16384);assert.equal(raw.bytes,131072);
  }
});


test('collection timing measures only a requested signal capture and keeps PCM metadata identical',async t=>{
  const f=await fixture({sampleRate:44100,productObservation:true,oracleEvidence:true,normalizerWitness:true,normalizerControl:true,normalizerSignal:true});for(let n=0;n<4410;n+=128)f.feed(n);
  let calls=0;const times=[0,1,3,8,9,13,19,20,28,39,40];t.mock.method(performance,'now',()=>900000+times[calls++]);
  for(const endFrame of [128,4410]){
    calls=0;const input={kind:'product-capture',startFrame:0,endFrame},plainCapture=plain(await f.probe.action(input));assert.equal(calls,0);
    const measured=plain(await f.probe.action({...input,timing:true}));
    assert.deepEqual(measured.collectionTiming,{start:0,end:endFrame,sampleRate:44100,elapsedMs:40,pcmMs:14,encodeMs:22});assert.equal(calls,11,'two total reads plus nine fixed stream boundary reads');
    assert.ok(Buffer.byteLength(JSON.stringify(measured.collectionTiming))<=256);delete measured.collectionTiming;assert.deepEqual(measured,plainCapture);
  }
  calls=0;await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:4481,timing:true}),/capture-bound/);assert.equal(calls,1,'original guard fails before substage reads');
});
test('collection timing cannot turn a legacy capture into a diagnostic profile',async()=>{
  const f=await fixture();f.feed(0);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128,timing:true}),/timing-profile/);
});

for(const profile of ['product','component','signal','legacy'])test(`capture byte encoding preserves ${profile} PCM, padding and metadata on both paths`,async t=>{
  class Bytes extends Uint8Array {}
  const options=profile==='legacy'?{sampleRate:48000,installed:true}:{sampleRate:44100,productObservation:true,...(profile==='component'?{equalizerComponent:true}:{}),...(profile==='signal'?{oracleEvidence:true,normalizerWitness:true,normalizerControl:true,normalizerSignal:true}:{})};
  let fallbackCalls=0,nativeCalls=0;
  const f=await fixture(options,0,undefined,{state:'running',currentTime:0,Uint8Array:Bytes,btoa:text=>{fallbackCalls++;return Buffer.from(text,'binary').toString('base64');}});
  const values=[[-0,.25],[.5,-.5],[-1,1,1,1,0],[.125,-.125]],hex=['000000800000803e','0000003f000000bf','000080bf0000803f0000803f0000803f00000000','0000003e000000be'];
  for(let n=0;n<4410;n+=128)f.feed(n,values);
  if(profile==='signal')t.mock.method(performance,'now',()=>1000);
  const encode=function(){assert.ok(this instanceof Bytes);assert.equal(arguments.length,0);assert.equal(this.byteOffset,0);assert.equal(this.byteLength,this.buffer.byteLength);nativeCalls++;return Buffer.from(this).toString('base64');};
  for(const endFrame of profile==='legacy'?[4480]:[1,2,3,128,4410]){
    const input=profile==='legacy'?{kind:'l1-capture'}:{kind:'product-capture',startFrame:0,endFrame,...(profile==='signal'?{timing:true}:{})};
    Bytes.prototype.toBase64=undefined;const fallback=plain(await f.probe.action(input)),before=fallbackCalls;nativeCalls=0;
    Bytes.prototype.toBase64=encode;const direct=plain(await f.probe.action(input));
    assert.equal(nativeCalls,profile==='component'?4:3,'supported byte API must replace the string encoder for each stream');assert.equal(fallbackCalls,before,'supported path must not construct a btoa input');assert.deepEqual(direct,fallback);
    for(const [i,stream]of direct.streams.entries())assert.equal(stream.base64,literalBytes(hex[i],endFrame).toString('base64'));
    for(const unavailable of [null,17]){Bytes.prototype.toBase64=unavailable;assert.deepEqual(plain(await f.probe.action(input)),fallback);}
  }
  if(profile!=='legacy'){
    const {createProductArchive}=await import(pathToFileURL(path.resolve('scripts/extension-e2e/audio-product.mjs'))),saved=new Map();
    Bytes.prototype.toBase64=encode;const raw=await f.probe.action({kind:'product-capture',startFrame:0,endFrame:128});
    const archive=createProductArchive({writeFile:async(file,data)=>saved.set(file,Buffer.from(data))},'capture',44100,profile==='component'?'equalizer-component':profile==='signal'?'normalizer-control':'legacy');await archive.append(raw);
    for(const [i]of raw.streams.entries())assert.deepEqual(saved.get(`capture/segment-0000-stream-${i}.f32le`),literalBytes(hex[i],128));
  }
});

test('capture byte encoding preserves API and fallback errors without retry and leaves partial encoding unchanged',async()=>{
  class Bytes extends Uint8Array {}
  const failure=new Error('byte-encoder-failed'),fallbackFailure=new Error('string-encoder-failed');let fallbackCalls=0,nativeCalls=0,failFallback=false;
  const f=await fixture(undefined,0,undefined,{state:'running',currentTime:0,Uint8Array:Bytes,btoa:text=>{fallbackCalls++;if(failFallback)throw fallbackFailure;return Buffer.from(text,'binary').toString('base64');}});f.feed(0);
  Bytes.prototype.toBase64=function(){nativeCalls++;throw failure;};
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),error=>error===failure);assert.equal(nativeCalls,1);assert.equal(fallbackCalls,0);
  await f.probe.action({kind:'l1-partial'});assert.equal(nativeCalls,1);assert.equal(fallbackCalls,3);
  Bytes.prototype.toBase64=undefined;failFallback=true;
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),error=>error===fallbackFailure);assert.equal(fallbackCalls,4);
});

test('capture byte encoding cannot bypass the original bounds and formation guards',async()=>{
  class Bytes extends Uint8Array {toBase64(){throw Error('encoder-must-not-run');}}
  const f=await fixture(undefined,0,undefined,{state:'running',currentTime:0,Uint8Array:Bytes});f.feed(0);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:129}),/audio-l1-capture-bound/);
  f.send(0,128,[NaN,0]);
  await assert.rejects(()=>f.probe.action({kind:'product-capture',startFrame:0,endFrame:128}),/audio-l1-capture-invalid/);
});

test('retained capture rejects donor signal and a late freeze without changing the deadline',async()=>{
  const f=await fixture(retainedOptions);for(const change of [{pattern:'noise'},{frequency:2000},{phase:2.1},{inputDbfs:-24},{durationSeconds:20}])await assert.rejects(()=>f.probe.action({kind:'signal',frequency:1000,inputDbfs:-36,pattern:'tone-silence',phase:.37,durationSeconds:90,...change}),/retained-signal/);
  f.product.receive(reply('prepared',0,0));await f.probe.action({kind:'reset-events'});f.context.currentTime=20+1/44100;
  await assert.rejects(()=>f.probe.action({kind:'freeze-normalizer',endFrame:771750}),/freeze-bound/);
  await assert.rejects(()=>f.probe.action({kind:'freeze-normalizer',endFrame:771750,waitForReady:true}),/freeze-bound/);
});

test('retained first packets keep native starts and frozen export never reads live runtime',async()=>{
  const f=await fixture(retainedOptions,129);f.product.receive(reply('prepared',0,256));await f.probe.action({kind:'reset-events'});
  f.send(0,256);f.send(1,384);f.send(2,512);for(let frame=384;frame<1024;frame+=128){f.send(0,frame);if(frame>=512)f.send(1,frame);if(frame>=640)f.send(2,frame);}
  f.context.currentTime=1024/44100;const frozen=plain(await f.probe.action({kind:'freeze-normalizer',endFrame:1000}));assert.equal(frozen.productObservation.commonStart,512);
  f.runtime.audio.getReadback=()=>{throw Error('live-runtime-after-freeze');};
  const raw=plain(await f.probe.action({kind:'product-capture',startFrame:512,endFrame:1024}));assert.deepEqual(raw.observedStarts,{program:256,source:384,control:512});assert.deepEqual(raw.readback,frozen.readback);
});

for(const fault of ['command','epoch','source'])test('retained '+fault+' violation cannot freeze a successful suffix',async()=>{
  const f=await fixture(retainedOptions);f.product.receive(reply('prepared',0,0));await f.probe.action({kind:'reset-events'});f.feed(0);
  if(fault==='command')f.product.port.postMessage({kind:'configure',sourceEpoch:1,seq:1});else if(fault==='epoch')f.product.receive({...reply('accepted',1,128),sourceEpoch:2});else f.createSource();
  f.feed(128);f.context.currentTime=256/44100;await assert.rejects(()=>f.probe.action({kind:'freeze-normalizer',endFrame:256}),/freeze-invalid/);
  const p=plain(await f.probe.action({kind:'l1-partial'}));assert.ok(p.streamError||p.sources!==1);assert.equal(p.retention.exported,false);assert.ok(p.retention.bytes>=4608);
});
