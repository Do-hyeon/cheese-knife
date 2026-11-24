const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {buildSync}=require('esbuild');
const {runtime,flush,deliverScoped}=require('./helpers.cjs');
const {setup}=require('./audio-fixture.cjs');
let library;
function kernel(){if(!library){const module={exports:{}};vm.runInNewContext(buildSync({entryPoints:['src/main/features/audio/transition.ts'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text,{module,exports:module.exports});library=module.exports;}return library;}
const eq=[0,0,0,0,0,0,0,0];
const config=(seq,wanted,normalizer=true)=>({kind:'configure',seq,sourceEpoch:1,wanted,normalizer,gain:1,eq,targetDbfs:-20});
function boosted(){const k=kernel(),s=k.createTransition(48000,1,'raw');k.acceptCommand(s,config(1,true),0,0);
  Object.assign(s.norm,{fromDb:3,toDb:3,start:0,end:0});return {k,s};}
function read(k,s,frame){const audio=[new Float32Array(1),new Float32Array(1)],control=Array.from({length:5},()=>new Float32Array(1));
  k.renderTransition(s,[],frame,1,new Float32Array([0]),audio,control);return control[3][0];}
const fdb=db=>Math.fround(10**(db/20));

test('master OFF holds normalization until actual q0 then retires for ten milliseconds',()=>{
  const {k,s}=boosted();k.acceptCommand(s,config(2,false),52800,0);
  assert.equal(read(k,s,52800),fdb(3));assert.equal(read(k,s,54527),fdb(3));
  assert.equal(read(k,s,54528),fdb(3));assert.equal(read(k,s,54768),fdb(1.5));assert.equal(read(k,s,55008),1);
});
for(const [frame,db]of [[53040,3],[54768,1.5],[55200,0]])test('quick reentry cancels retirement at actual current frame '+frame,()=>{
  const {k,s}=boosted();k.acceptCommand(s,config(2,false),52800,0);read(k,s,54528>frame?52800:54528);read(k,s,frame);
  k.acceptCommand(s,config(3,true),frame,0);assert.equal(read(k,s,frame),fdb(db));assert.equal(read(k,s,frame+4800),fdb(db));
});
test('normalizer-only OFF remains a ten millisecond reset without master retirement delay',()=>{
  const {k,s}=boosted();k.acceptCommand(s,config(2,true,false),52800,0);
  assert.equal(read(k,s,52800),fdb(3));assert.equal(read(k,s,53040),fdb(1.5));assert.equal(read(k,s,53280),1);
});
test('read-error after reentry resets only normalizer from current dB in ten milliseconds',()=>{
  const {k,s}=boosted();k.acceptCommand(s,config(2,false),52800,0);read(k,s,54528);read(k,s,54768);
  k.acceptCommand(s,config(3,true),54768,0);k.acceptMeter(s,{kind:'read-error',sourceEpoch:1,meterEpoch:s.meterEpoch,meterSeq:1,observedTime:54768/48000});
  assert.equal(read(k,s,54768),fdb(1.5));assert.equal(s.normStatus,'error');assert.equal(read(k,s,55248),1);assert.equal(s.failed,false);
});
test('render timing does not shorten normalizer ramp if the main clock advances between operations',()=>{
  const {k,s}=boosted();k.acceptCommand(s,config(2,true,false),57600,0);
  assert.ok(read(k,s,58079)>1);assert.equal(read(k,s,58080),1);
});
test('old source/meter epochs and inactive packets cannot overwrite a retirement',()=>{
  const {k,s}=boosted(),old=s.meterEpoch;k.acceptCommand(s,config(2,false),52800,0);
  for(const [sourceEpoch,meterEpoch]of [[2,s.meterEpoch],[1,old],[1,s.meterEpoch]]){
    k.acceptMeter(s,{kind:'power',sourceEpoch,meterEpoch,meterSeq:++s.meterSeq+1,observedTime:54768/48000,leftPower:0,rightPower:0,active:false,targetDbfs:-20});
  }
  read(k,s,54528);assert.equal(read(k,s,54768),fdb(1.5));assert.equal(read(k,s,55008),1);
});
test('source replacement starts a fresh unity normalizer and cannot inherit retired gain',()=>{
  const {k,s}=boosted();k.acceptCommand(s,config(2,false),52800,0);read(k,s,54528);
  const next=k.createTransition(48000,2,'raw');assert.equal(read(k,next,54768),1);
});
test('repeated OFF/ON preserves current dB and bounded scalar state without stale resets',()=>{
  const {k,s}=boosted();let frame=52800,seq=2;
  for(let i=0;i<4;i++){k.acceptCommand(s,config(seq++,false),frame,0);read(k,s,frame+240);k.acceptCommand(s,config(seq++,true),frame+240,0);assert.equal(read(k,s,frame+240),fdb(3));frame+=480;}
  assert.equal(s.states.length,32);assert.ok(s.gainPlans.length<=Math.ceil(.01*48000)+2);
});
test('controller uses two stereo meters and sends bounded scalar packets, not native automation or PCM',async t=>{
  const {audio,video,nodes,dom}=setup(t,false,true,{normalizerEnabled:true});Object.defineProperty(video,'paused',{value:false});
  await audio.setEnabled(video,true);await flush();const meters=nodes.filter(n=>n.type==='analyser');assert.equal(meters.length,2);
  assert.deepEqual(meters.map(n=>n.fftSize),[16384,16384]);
  const processor=nodes.find(n=>n.type==='transition');assert.ok(processor.commands[0].normalizer);
  assert.equal(nodes.filter(n=>n.type==='gain').flatMap(n=>n.gain.events).some(e=>e[0]==='exp'),false);
  assert.doesNotMatch(JSON.stringify(runtime(dom).statuses),/Float32Array|leftPower|rightPower/);
  await audio.setEnabled(video,false);assert.ok(meters.every(n=>n.outputs.size===0));
});
test('unsupported normalizer rate never allocates meters or disables compressor',async t=>{
  const {audio,video,nodes,dom}=setup(t,false,false,{normalizerEnabled:true},{sampleRate:192000});await audio.setEnabled(video,true);
  assert.equal(nodes.filter(n=>n.type==='analyser').length,0);assert.equal(runtime(dom).statuses.normalizer.reason,'normalizer-sample-rate-unsupported');assert.equal(runtime(dom).statuses.compressor.state,'ready');
});
test('source replacement before reconciliation retires the old meter and late callbacks',async t=>{
  const {audio,video,nodes,context,tick}=setup(t,false,true,{normalizerEnabled:true});Object.defineProperty(video,'paused',{value:false});await audio.setEnabled(video,true);
  const meters=nodes.filter(n=>n.type==='analyser'),counts=meters.map(n=>n.reads);
  Object.defineProperty(video,'currentSrc',{value:'blob:https://chzzk.naver.com/new',configurable:true});context().currentTime=.1;tick();
  assert.deepEqual(meters.map(n=>n.reads),counts);context().currentTime=.2;tick();assert.deepEqual(meters.map(n=>n.reads),counts);
});
test('nonfinite samples are sent as read-error and only normalizer is limited',async t=>{
  const {audio,video,dom,nodes,context,tick}=setup(t,false,true,{normalizerEnabled:true},{sample:NaN});Object.defineProperty(video,'paused',{value:false});await audio.setEnabled(video,true);
  context().currentTime=.1;tick();await flush();assert.equal(audio.getState(video),'on');
  const processor=nodes.find(n=>n.type==='transition');assert.ok(processor.messages.some(p=>p.kind==='read-error'));
  assert.equal(runtime(dom).statuses.normalizer.reason,'normalizer-samples-invalid');
});
test('analyser allocation failure requests unity without failing EQ or compressor',async t=>{
  const {audio,video,dom,nodes,context}=setup(t,false,true,{normalizerEnabled:true});context();
  await audio.setEnabled(video,true);await audio.setEnabled(video,false);context().createAnalyser=()=>{throw Error('allocation');};
  await audio.setEnabled(video,true);await flush();const processor=nodes.find(n=>n.type==='transition');
  assert.ok(processor.messages.some(p=>p.kind==='read-error'));assert.equal(audio.getState(video),'on');assert.equal(runtime(dom).statuses.normalizer.reason,'normalizer-unavailable');
});
test('new selected video retires previous stereo meters before its own window remains active',async t=>{
  const sourceVideos=new Set(),{audio,video,dom,nodes}=setup(t,false,true,{normalizerEnabled:true},{sourceVideos});sourceVideos.add(video);
  await audio.setEnabled(video,true);const prior=nodes.find(n=>n.type==='splitter'&&n.channels===2);
  const next=video.cloneNode();Object.defineProperty(next,'currentSrc',{value:'blob:https://chzzk.naver.com/second'});sourceVideos.add(next);video.replaceWith(next);
  runtime(dom).reconcile();deliverScoped(dom,{normalizerEnabled:true});await audio.setEnabled(next,true);
  assert.equal(prior.outputs.size,0);assert.equal(nodes.filter(n=>n.type==='splitter'&&n.channels===2&&n.outputs.size).length,1);
});
for(const gate of ['paused','ended','muted','volume','gain','context','hidden'])test('normalizer observes inactive '+gate+' without reading media and resumes a valid window',async t=>{
  const {audio,video,dom,nodes,context,tick}=setup(t,false,true,{normalizerEnabled:true});Object.defineProperty(video,'paused',{value:false,configurable:true});await audio.setEnabled(video,true);await flush();
  const setGate=value=>{if(['paused','ended','muted'].includes(gate))Object.defineProperty(video,gate,{value,configurable:true});else if(gate==='volume')video.volume=value?0:1;else if(gate==='gain')audio.setGain(video,value?0:1);else if(gate==='context')context().state=value?'suspended':'running';else Object.defineProperty(dom.window.document,'hidden',{value,configurable:true});};
  const meters=nodes.filter(n=>n.type==='analyser'),before=meters.map(n=>n.reads);setGate(true);await flush();context().currentTime=.1;tick();await flush();assert.deepEqual(meters.map(n=>n.reads),before);
  const processor=nodes.find(n=>n.type==='transition');if(gate!=='context')assert.equal(processor.messages.filter(p=>p.kind==='power').at(-1).active,false);
  setGate(false);await flush();context().currentTime=.2;tick();await flush();assert.equal(processor.messages.filter(p=>p.kind==='power').at(-1).active,true);
});
