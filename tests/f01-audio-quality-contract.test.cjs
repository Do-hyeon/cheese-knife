const test=require('node:test');
const assert=require('node:assert/strict');
const metrics=()=>import('../scripts/audio-processing-metrics.mjs');

test('queued empty startup packets do not poison later output, but empty packets after valid rendering and malformed packets fail',async()=>{
  const {installProcessingProbe}=await import('../scripts/audio-processing-probe.mjs'),vm=require('node:vm');
  /** @type {Native[]} */const contexts=[];
  class Native{
    constructor(){contexts.push(this);}
    state='running';sampleRate=44100;currentTime=0;destination={};audioWorklet={addModule:async()=>{}};
    createMediaElementSource(){return {};}
    createGain(){return {};}
    createBiquadFilter(){return {};}
    createAnalyser(){return {};}
    createDynamicsCompressor(){return {};}
    createDelay(){return {};}
    createWaveShaper(){return {};}
    createChannelSplitter(){return {};}
  }
  /** @type {{port:{onmessage:null|((event:{data:{frame:number,samples:Float32Array[]}})=>void)},connect:()=>void}} */
  const sink={port:{onmessage:null},connect(){}};
  const target={AudioContext:Native,Symbol,setInterval:()=>1,clearInterval(){},addEventListener(){}};
  Object.defineProperty(target,Symbol.for('cheese-knife.runtime.v1'),{value:{audio:{getReadback:()=>({sources:1})}}});
  await vm.runInNewContext(`(${installProcessingProbe.toString()})(44100)`,{window:target,AudioContext:Native,
    AudioWorkletNode:class{constructor(){return sink;}},Float32Array,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
    document:{hidden:false,querySelector:()=>({muted:false,volume:1,paused:false,currentTime:0})}});
  const context=contexts[0],receive=sink.port.onmessage;assert.ok(context);assert.ok(receive);
  context.currentTime=12800/44100;context.createMediaElementSource();
  for(const frame of [12416,12544,12672,12800])receive({data:{frame,samples:[]}});
  const probe=/** @type {import('../scripts/audio-processing-probe.mjs', {with:{'resolution-mode':'import'}}).ProcessingProbe} */(Object.getOwnPropertyDescriptor(target,Symbol.for('cheese-knife.f01-processing-probe'))?.value);
  const before=/** @type {Record<string,unknown>} */(await probe.action({kind:'facts'}));
  assert.equal(before.invalidFrames,0);assert.equal(/** @type {unknown[]} */(before.invalidChunks).length,4);
  await assert.rejects(()=>probe.action({kind:'capture',seconds:128/44100,endFrame:12928}),/audio-probe-capture-invalid/);
  for(const frame of [12928,13056])receive({data:{frame,samples:[new Float32Array(128).fill(.25),new Float32Array(128).fill(-.25)]}});
  const captured=/** @type {{channels:number[][]}} */(await probe.action({kind:'capture',seconds:256/44100,endFrame:13184}));
  assert.equal(captured.channels[0]?.length,256);assert.equal(captured.channels[0]?.every(value=>value===.25),true);
  await assert.rejects(()=>probe.action({kind:'capture',seconds:384/44100,endFrame:13184}),/audio-probe-capture-incomplete/);
  receive({data:{frame:13184,samples:[]}});receive({data:{frame:NaN,samples:[]}});
  const after=/** @type {Record<string,unknown>} */(await probe.action({kind:'facts'}));assert.equal(after.invalidFrames,2);
  await assert.rejects(()=>probe.action({kind:'capture',seconds:256/44100,endFrame:13184}),/audio-probe-capture-invalid/);
});

test('independent peaking response is neutral and reaches literal +/-6dB at each centre',async()=>{
  const {equalizerResponseDb}=await metrics();
  for(const rate of [44100,48000,96000]){
    for(const frequency of [80,125,250,500,1000,2000,4000,8000,10000])assert.ok(Math.abs(equalizerResponseDb([0,0,0,0,0,0,0,0],rate,frequency))<1e-10);
    for(const [index,frequency] of [63,125,250,500,1000,2000,4000,8000].entries())for(const gain of [-6,6]){
      const levels=[0,0,0,0,0,0,0,0];levels[index]=gain;
      assert.ok(Math.abs(equalizerResponseDb(levels,rate,frequency)-gain)<1e-8);
    }
  }
});

test('EQ metrics reject invalid band count range frequency and unsupported sample rate',async()=>{
  const {equalizerResponseDb}=await metrics();
  /** @type {[number[],number,number][]} */const cases=[[[0],48000,1000],[[0,0,0,0,0,0,0,7],48000,1000],[[0,0,0,0,0,0,0,NaN],48000,1000],[[0,0,0,0,0,0,0,0],8000,1000],[[0,0,0,0,0,0,0,0],48000,24000]];
  for(const [levels,rate,frequency] of cases)assert.throws(()=>equalizerResponseDb(levels,rate,frequency),/eq-measurement-invalid/);
});

test('capture validation rejects missing channel holes nonfinite and incomplete coverage instead of zero filling',async()=>{
  const {validateProcessingCapture}=await metrics();
  const valid={rate:48000,start:0,end:512,channels:[Array(512).fill(.25),Array(512).fill(-.25)]};
  assert.deepEqual(validateProcessingCapture(valid),valid);
  for(const bad of [null,{}, {...valid,channels:[valid.channels[0]]},{...valid,channels:[Array(512),valid.channels[1]]},{...valid,end:513},{...valid,channels:[Array(512).fill(NaN),valid.channels[1]]},{...valid,start:-1},{...valid,rate:0}])assert.throws(()=>validateProcessingCapture(bad),/audio-capture-invalid/);
});

test('EQ gate compares both channels against independent response and headroom without accepting missing native response',async()=>{
  const {evaluateEqualizerCapture}=await metrics();
  const spec={sampleRate:48000,frequency:1000,levels:[0,0,0,0,0,0,0,0],masterGain:1};
  const capture={rate:48000,start:0,end:512,channels:[Array(512).fill(.25),Array(512).fill(.25)]};
  assert.deepEqual(evaluateEqualizerCapture(capture,spec,.25,0).failures,[]);
  assert.ok(evaluateEqualizerCapture({...capture,channels:[capture.channels[0],Array(512).fill(.2)]},spec,.25,0).failures.includes('eq-output-channel-1'));
  assert.ok(evaluateEqualizerCapture(capture,spec,.25,NaN).failures.includes('eq-native-response'));
  assert.ok(evaluateEqualizerCapture(capture,{...spec,sampleRate:44100},.25,0).failures.includes('eq-capture-rate'));
  const boosted={...spec,levels:[0,0,0,0,6,0,0,0]};
  assert.deepEqual(evaluateEqualizerCapture(capture,boosted,.25,6).failures,[],'+6dB boost and -6dB headroom cancel at centre');
  assert.ok(evaluateEqualizerCapture(capture,{...spec,masterGain:2},.25,0).failures.includes('eq-output-channel-0'));
});

test('F01 measurement matrix pins all native rates band directions and headroom master combinations',async()=>{
  const {equalizerMeasurementCases}=await metrics(),cases=equalizerMeasurementCases();
  assert.equal(cases.length,108);assert.equal(new Set(cases.map(item=>item.id)).size,108);
  for(const rate of [44100,48000,96000]){
    const rows=cases.filter(item=>item.sampleRate===rate);assert.equal(rows.length,36);
    assert.equal(rows.filter(item=>item.id.includes('/neutral/')).length,9);
    assert.equal(rows.filter(item=>item.id.includes('/band/')).length,16);
    assert.equal(rows.filter(item=>item.id.includes('/mixed/')).length,9);
    assert.deepEqual(rows.filter(item=>item.id.includes('/gain/')).map(item=>item.masterGain),[.5,2]);
  }
});

test('normalizer trace gate checks real output target stereo polarity and automation rates',async()=>{
  const {evaluateNormalizerTrace}=await metrics();
  const bins=Array.from({length:150},(_,index)=>({start:index*4800,end:(index+1)*4800,count:[4800,4800],squares:[48,48],peaks:[.15,.15],over:[0,0]}));
  const events=Array.from({length:145},(_,index)=>({node:7,from:10**(Math.min(index*.1,4)/20),to:10**(Math.min((index+1)*.1,4)/20),start:.5+index*.1,end:.6+index*.1,observed:.5+index*.1}));
  const powerReads=Array.from({length:150},(_,index)=>[0,1].map(channel=>({index:channel,time:index/10,power:10**(-24/10),size:16384}))).flat();
  const trace={sampleRate:48000,events,bins,powerReads,invalidFrames:0};
  const spec={sampleRate:48000,inputDbfs:-24,pattern:'antiphase',seconds:15};
  assert.deepEqual(evaluateNormalizerTrace(trace,spec).failures,[]);
  assert.ok(evaluateNormalizerTrace({...trace,events:[{...events[0],to:2},...events.slice(1)]},spec).failures.includes('normalizer-rate'));
  const missing=structuredClone(trace);missing.bins.splice(20,1);
  assert.ok(evaluateNormalizerTrace(missing,spec).failures.includes('normalizer-output-gap'));
  const oneChannel=structuredClone(trace);for(const bin of oneChannel.bins)bin.squares[1]=0;
  assert.ok(evaluateNormalizerTrace(oneChannel,spec).failures.includes('normalizer-target-channel-1'));
  assert.throws(()=>evaluateNormalizerTrace({...trace,events:[{...trace.events[0],to:NaN}]},spec),/normalizer-trace-invalid/);
  assert.throws(()=>evaluateNormalizerTrace({...trace,bins:[]},spec),/normalizer-trace-invalid/);
  assert.throws(()=>evaluateNormalizerTrace({...trace,powerReads:[]},spec),/normalizer-trace-invalid/);
  assert.ok(evaluateNormalizerTrace({...trace,events:[{...events[0],start:.1,end:.2},...events.slice(1)]},spec).failures.includes('normalizer-window-warmup'));
});

test('report gate cannot label missing partial failed native exception or wrong-source evidence as PASS',async()=>{
  const {processingReportFailures}=await metrics();
  const source={sourceCommit:'1'.repeat(40),sourceSha256:'2'.repeat(64),lockSha256:'3'.repeat(64),manifestSha256:'4'.repeat(64),toolchainSha256:'5'.repeat(64)};
  for(const value of [undefined,null,{}, {schema:'f01-audio-processing-v1',source,after:source,rates:[]},
    {schema:'f01-audio-processing-v1',source,after:{...source,sourceSha256:'6'.repeat(64)},rates:[],pageErrors:[]},
    {schema:'f01-audio-processing-v1',source,after:source,rates:[],pageErrors:['native exception']}])assert.notDeepEqual(processingReportFailures(value,source),[]);
  assert.notDeepEqual(processingReportFailures({schema:'f01-audio-processing-v1',source:null,after:null,rates:[],pageErrors:[]},null),[]);
});

test('Native audio runner requires one bounded run ID before opening any browser',async()=>{
  const {parseAudioProcessingArgs}=await import('../scripts/check-audio-processing.mjs');
  assert.deepEqual(parseAudioProcessingArgs(['--run-id=F01audio']),{runId:'F01audio'});
  for(const args of [[],['--run-id=../profile'],['--run-id='],['--run-id=a','--run-id=b'],['--chrome'],['--run-id='+'a'.repeat(65)]])assert.throws(()=>parseAudioProcessingArgs(args),/audio-processing-args/);
});

test('measurement window binds the actual new native target, not a pre-existing blank tab',async()=>{
  const {openAudioMeasurementWindow}=await import('../scripts/audio-native-browser.mjs');
  for(const targetId of ['new-target','old-blank']){
    const page={name:targetId};
    const context=/** @type {import('playwright').BrowserContext} */(/** @type {unknown} */({
      waitForEvent:async()=>page,newCDPSession:async()=>({send:async()=>({targetInfo:{targetId}}),detach:async()=>{}}),
    }));
    const session=/** @type {import('playwright').CDPSession} */(/** @type {unknown} */({send:/** @param {string} method */async(method)=>method==='Target.createTarget'?{targetId:'new-target'}:{windowId:77}}));
    if(targetId==='old-blank')await assert.rejects(openAudioMeasurementWindow(context,session),/audio-browser-window-target/);
    else{const result=await openAudioMeasurementWindow(context,session);assert.equal(result.page,page);assert.equal(result.targetId,'new-target');assert.equal(result.windowId,77);}
  }
});

test('processing transitions retain the original dip and continuity limits on both channels',async()=>{
  const {evaluateProcessingTransition}=await metrics();
  const channel={rms:.2,peak:.3,overFullScaleSamples:0,maxAdjacentStep:.03,envelope8ms:{min:.2}},summary={channels:[channel,channel]};
  assert.deepEqual(evaluateProcessingTransition(summary,summary,summary),[]);
  assert.ok(evaluateProcessingTransition(summary,{channels:[channel,{...channel,envelope8ms:{min:.18}}]},summary).includes('transition-channel-1/dip'));
  assert.ok(evaluateProcessingTransition(summary,{channels:[{...channel,maxAdjacentStep:.031},channel]},summary).includes('transition-channel-0/step'));
  assert.throws(()=>evaluateProcessingTransition(summary,{channels:[channel]},summary),/audio-transition-invalid/);
  assert.throws(()=>evaluateProcessingTransition(summary,{channels:[{...channel,peak:NaN},channel]},summary),/audio-transition-invalid/);
});

test('native dry/wet automation must be complementary for the whole crossfade, not just endpoints',async()=>{
  const {complementaryAudioRamps}=await metrics();
  const ramps=[{node:0,from:0,to:1,start:1,end:1.01},{node:1,from:1,to:0,start:1,end:1.01}];
  assert.equal(complementaryAudioRamps(ramps),true);
  assert.equal(complementaryAudioRamps([ramps[0],{...ramps[1],start:1.002,end:1.012}]),false);
  assert.equal(complementaryAudioRamps([ramps[0]]),false);
  assert.equal(complementaryAudioRamps([{...ramps[0],to:NaN},ramps[1]]),false);
});

test('component transitions enforce wet ceiling while preserving master-only continuity diagnostics',async()=>{
  const {evaluateProcessingTransition}=await metrics();
  const channel={rms:.2,peak:.3,overFullScaleSamples:0,maxAdjacentStep:.03,envelope8ms:{min:.2}},summary={channels:[channel,channel]};
  const change={channels:[{...channel,maxAdjacentStep:.04,envelope8ms:{min:.18}},channel]};
  assert.deepEqual(evaluateProcessingTransition(summary,change,summary,'component'),[]);
  assert.ok(evaluateProcessingTransition(summary,change,summary).includes('transition-channel-0/dip'));
  assert.ok(evaluateProcessingTransition(summary,{channels:[{...channel,peak:.981},channel]},summary,'component').includes('transition-channel-0/wet-ceiling'));
  assert.throws(()=>evaluateProcessingTransition(summary,{channels:[{...channel,peak:NaN},channel]},summary,'component'),/audio-transition-invalid/);
});

test('a failed Native normalizer measurement retains the actual offending trace before rejection',async()=>{
  const {normalizerProof}=await import('../scripts/check-audio-processing.mjs');
  const trace={sampleRate:44100,events:[],bins:[],powerReads:[],invalidFrames:3};
  const page=/** @type {import('playwright').Page} */(/** @type {unknown} */({
    evaluate:/** @param {unknown} fn @param {import('../scripts/audio-processing-probe.mjs', {with:{'resolution-mode':'import'}}).ProcessingAction} input */async(fn,input)=>input.kind==='configure'?{status:input.enabled?'on':'off'}:input.kind==='facts'?trace:null,
    waitForTimeout:async()=>{},
  }));
  /** @type {Record<string,unknown>[]} */const rows=[];
  await assert.rejects(()=>normalizerProof(page,44100,rows),/normalizer-trace-invalid/);
  assert.equal(rows.length,1);assert.equal(rows[0]?.id,'44100/normalizer/-36/mono');assert.equal(rows[0]?.trace,trace);
  assert.equal(rows[0]?.measured,undefined,'invalid output must not receive synthetic passing metrics');
});
