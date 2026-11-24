const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=async()=>{assert.ok(fs.existsSync('scripts/extension-e2e/audio-normalizer-control.mjs'),'original stall/error needs a caller-bound control assessor');return import('../scripts/extension-e2e/audio-normalizer-control.mjs');};
const clone=structuredClone;
const command=(seq,n)=>({kind:'configure',sourceEpoch:1,seq,wanted:true,gain:1,eq:Array(8).fill(0),normalizer:n,dynamics:n,targetDbfs:-20});
const reply=(kind,seq,frame,epoch)=>({kind,sourceEpoch:1,seq,frame,meterEpoch:epoch,gain:kind==='completed'?1:null,code:null});
function reseal(f){const l=f.facts.oracleEvidence.ledger;l.events.forEach((e,i)=>e.order=i+1);l.eventCount=l.events.length;l.bytes=0;l.bytes=Buffer.byteLength(JSON.stringify(l))+2048;}
async function fixture(rate=48000){
  const m=await load(),spec=m.NORMALIZER_CONTROL_CASES.find(s=>s.sampleRate===rate),fft=2**Math.ceil(Math.log2(rate*.25));
  const baseline={requestedFrame:0,message:command(1,false)},targetCommand={requestedFrame:rate/20,message:command(2,true)};
  const prepared=reply('prepared',0,0,0),initialReplies=[prepared,reply('accepted',1,0,1),reply('completed',1,Math.ceil(.03*rate+(rate===44100?264:rate*.006)),1)];
  const targetReplies=[reply('accepted',2,rate/20,2),reply('completed',2,Math.round(.07*rate),2)];
  const initial={available:true,reason:null,sourceEpoch:1,initial:'raw',normalizerWitness:true};
  const common={sampleRate:rate,sources:1,hidden:false,contextState:'running',filters:0,gains:[1,0,0,1,1,0,1,0],events:[],steps:[],linearEvents:[],signal:{frequency:1000,inputDbfs:-24,pattern:'stereo',phase:.37,channels:2,durationSeconds:90,frames:90*rate,loop:false,error:''},video:{muted:false,volume:1,loop:false,ended:false,paused:false,playbackRate:1,currentTime:7.8},readback:{state:'on',sources:1,wanted:true,gain:1,appliedGain:1}};
  const before={...clone(common),audioTime:.04,analysers:0,buffers:0,reads:0,active100msTimers:0,normalizerMeasurement:null,oracleEvidence:{schema:'f01-oracle-evidence-v2',initial},productObservation:{sources:1,l1Nodes:1,invalidFrames:0,streamError:'',commands:[baseline],replies:initialReplies,meterDiagnostics:{sent:0,received:0}}};
  const events=[],powerReads=[],meterTickReads=[],attempts=[];
  const add=(direction,packet)=>events.push({order:events.length+1,direction,packet});
  add('receive',prepared);add('send',baseline.message);initialReplies.slice(1).forEach(p=>add('receive',p));add('send',targetCommand.message);targetReplies.forEach(p=>add('receive',p));
  const curve=t=>t<7.6?Math.min(4,Math.max(0,t-.5)):t<7.61?4*(7.61-t)/.01:0;
  let ordinal=0;
  for(let k=1;k<=77;k++){
    if(k>=66&&k<=68)continue;
    const time=k/10,frame=Math.round(time*rate),error=k>=76,startRead=powerReads.length,startAttempt=attempts.length;
    for(let index=0;index<(error?1:2);index++){
      attempts.push({ordinal:attempts.length+1,index,time,wall:time*1000,size:fft,powerReadCursor:powerReads.length,fault:error,error:error?'synthetic-native-analysis-fault':null});
      if(!error)powerReads.push({index,time,power:10**(-24/10),size:fft});
    }
    if(ordinal)meterTickReads.push({ordinal,startRead,endRead:powerReads.length,startTime:time,endTime:time,startAttempt,endAttempt:attempts.length,startWall:time*1000,endWall:time*1000});
    const seq=ordinal+1,mode=error?'error':k===69?'hold':k<5||k>=70&&k<=72?'warmup':'ramp';
    add('send',error?{kind:'read-error',sourceEpoch:1,meterEpoch:2,meterSeq:seq,observedTime:time}:{kind:'power',sourceEpoch:1,meterEpoch:2,meterSeq:seq,observedTime:time,active:true,leftPower:10**(-24/10),rightPower:10**(-24/10),targetDbfs:-20});
    const from=curve(time),duration=mode==='error'?.01:mode==='ramp'?.1:0,to=mode==='error'?0:mode==='ramp'?Math.min(4,from+.1):from;
    add('receive',{...reply('meter-accepted',seq,frame,2),code:mode,application:{sourceEpoch:1,meterEpoch:2,meterSeq:seq,commandSeq:2,frame,mode,fromDb:from,toDb:to,start:time,end:time+duration}});
    ordinal++;
  }
  const stamp=time=>({frame:Math.round(time*rate),time,wall:time*1000,powerReadCursor:powerReads.filter(p=>p.time<time).length,meterTickCursor:meterTickReads.filter(t=>t.startTime<time).length,attemptCursor:attempts.filter(p=>p.time<time).length,sourceEpoch:1,commandSeq:2});
  const controlEvents=[{kind:'stall',milliseconds:240,start:stamp(6.6),end:stamp(6.84)},{kind:'analysis-error',enabled:true,at:stamp(7.54)},{kind:'analysis-error',enabled:false,at:stamp(7.76)}];
  const measurement={frame:rate/10,powerReadCursor:2,meterTickCursor:0,sourceEpoch:1,commandSeq:2};
  const facts={...clone(common),audioTime:7.8,analysers:2,fftSizes:[fft,fft],buffers:2,reads:attempts.length,active100msTimers:1,powerReads,meterTickReads,normalizerMeasurement:measurement,normalizerSettings:{normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false},normalizerControl:{events:controlEvents,attempts,observedAt:stamp(7.8)},oracleEvidence:{schema:'f01-oracle-evidence-v2',initial,ledger:{schema:'f01-control-ledger-v2',available:true,reason:null,maxEvents:4128,maxBytes:1048576,eventCount:events.length,bytes:0,events}},productObservation:{sources:1,l1Nodes:1,invalidFrames:0,streamError:'',commands:[baseline,targetCommand],replies:[...initialReplies,...targetReplies],meterDiagnostics:{sent:ordinal,received:ordinal}}};
  facts.normalizerControl.measurement={...stamp(.1),powerReadCursor:2,meterTickCursor:0,attemptCursor:2};
  const archive={summary:()=>({sampleRate:rate,start:0,end:Math.round(7.8*rate),bytes:Math.round(7.8*rate)*36,cap:96*1024*1024}),window(start,end,stream=0){return {rate,start,end,channels:Array.from({length:stream===2?5:2},(_,c)=>Float32Array.from({length:end-start},(_,i)=>stream===2?(c===3?10**(curve((start+i)/rate)/20):[-1,1,1,0,0][c]):Math.SQRT2*10**(-24/20)*Math.sin(2*Math.PI*1000*(start+i)/rate+.37)*(stream===0?10**(curve((start+i)/rate)/20):1)))};}};
  const sourceSpec=m.normalizerControlSourceSpec(spec),request={status:'on',frame:rate/20},target=(await import('../scripts/audio-l1-normalizer-oracle.mjs')).selectNormalizerTarget(facts,before,request,sourceSpec);
  const proof={spec:clone(spec),beforeTarget:before,request,target,measurement:clone(measurement),events:clone(controlEvents),errorObservation:{...clone(facts),audioTime:7.76}};
  proof.errorObservation.normalizerControl.events=clone(controlEvents.slice(0,2));proof.errorObservation.normalizerControl.observedAt=stamp(7.76);
  const f={spec,sourceSpec,before,request,target,measurement,facts,proof,archive};reseal(f);proof.errorObservation.oracleEvidence=clone(facts.oracleEvidence);return f;
}
test('control registry is exactly the original contiguous fault pair at each original rate',async()=>{
  const m=await load(),{selectProductCase,parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  const faults=m.NORMALIZER_CONTROL_CASES.filter(s=>!('seconds'in s));assert.equal(faults.length,3);
  for(const s of faults){assert.ok(Object.isFrozen(s));assert.deepEqual([s.warmupMilliseconds,s.stallMilliseconds,s.resumeMilliseconds,s.errorMilliseconds],[6500,240,700,220]);assert.deepEqual(selectProductCase(s.id),s);assert.equal(parseProductAudioArgs(['--run-id=ControlHost','--case='+s.id]).caseId,s.id);assert.throws(()=>parseProductAudioArgs(['--run-id=ControlHost','--case='+s.id,'--component-witness']));assert.throws(()=>m.normalizerControlSourceSpec({...s,stallMilliseconds:239}));}
});
for(const rate of [44100,48000,96000])test('original fault pair binds real N and keeps its last fractional window at '+rate,async()=>{
  const m=await load(),f=await fixture(rate),r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec);
  assert.equal(r.passed,true,JSON.stringify(r));assert.equal(r.controlAssessed,true);assert.equal(r.qualityAssessed,false);assert.equal(r.overallQualification,false);assert.equal(r.native7Witness,'UNASSESSED');assert.equal(r.native8Witness,'UNASSESSED');assert.equal(r.frameOrigin,'UNPROVEN');assert.equal(r.coverage.end,Math.round(7.76*rate));assert.equal(r.errorUnity,true);assert.equal(r.stallHold,true);assert.equal(r.cadence.stallExceptions,1);
});
for(const [name,mutate]of [
  ['caller',f=>f.proof.spec.errorMilliseconds=221],['rate',f=>f.facts.sampleRate=96000],['marker',f=>f.proof.measurement.frame++],['settings',f=>f.facts.normalizerSettings.compressorEnabled=true],['extra command',f=>f.facts.productObservation.commands.push(clone(f.facts.productObservation.commands[1]))],['wrong attempt',f=>f.facts.normalizerControl.attempts.find(a=>a.error).index=1],['invented fault',f=>f.facts.normalizerControl.attempts.find(a=>a.error).fault=false],['boundary transplant',f=>f.proof.events[0].start.frame++],['missing error observation',f=>f.proof.errorObservation=null],['early clear',f=>f.facts.normalizerControl.events[2].at.frame--],
])test('control rejects '+name+' evidence rather than masking the original criterion',async()=>{const m=await load(),f=await fixture();mutate(f);assert.throws(()=>m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec),/normalizer-control|normalizer/);});
test('wrong actual N remains a numerical FAIL after well formed expected faults',async()=>{
  const m=await load(),f=await fixture(),window=f.archive.window;f.archive.window=(a,b,s)=>{const w=window(a,b,s);if(s===2&&a<=7.605*48000&&b>7.605*48000)w.channels[3][Math.round(7.605*48000)-a]=1;return w;};
  const r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec);assert.equal(r.passed,false);assert.ok(r.failures.some(s=>s.startsWith('normalizer-control-N')));
});
test('retained first ON q transitions are not reclassified as a later control failure',async()=>{
  const m=await load(),f=await fixture(),window=f.archive.window;f.archive.window=(a,b,s)=>{const w=window(a,b,s);if(s===2)for(let i=0;i<Math.max(0,Math.min(b,f.measurement.frame)-a);i++){w.channels[0][i]=0;w.channels[1][i]=.5;w.channels[2][i]=.5;}return w;};
  const r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec);assert.equal(r.passed,true,JSON.stringify(r));
});
test('the fixed control channels remain strict after the completed target marker',async()=>{
  const m=await load(),f=await fixture(),window=f.archive.window;f.archive.window=(a,b,s)=>{const w=window(a,b,s);if(s===2&&a<=f.measurement.frame&&b>f.measurement.frame)w.channels[0][f.measurement.frame-a]=0;return w;};
  const r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec);assert.equal(r.passed,false);assert.ok(r.failures.includes('normalizer-control-channel-0'));
});
test('full source validation refuses a late only source drift',async()=>{
  const m=await load(),f=await fixture(),window=f.archive.window;f.archive.window=(a,b,s)=>{const w=window(a,b,s);if(s===1&&a>=7.5*48000)for(const c of w.channels)for(let i=0;i<c.length;i++)c[i]*=1.02;return w;};
  const r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec);assert.equal(r.passed,false);assert.ok(r.failures.some(s=>s.startsWith('source-')));
});
test('a successful analyser read time cannot be transplanted beyond its callback and ACK',async()=>{
  const m=await load(),f=await fixture();f.facts.powerReads[2].time=100;f.proof.errorObservation.powerReads[2].time=100;
  assert.throws(()=>m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec),/normalizer-control/);
});
test('copied marker cursors cannot exceed the actual retained attempt/read prefixes',async()=>{
  const m=await load(),f=await fixture();for(const v of [f.facts.normalizerMeasurement,f.proof.measurement,f.proof.errorObservation.normalizerMeasurement,f.facts.normalizerControl.measurement,f.proof.errorObservation.normalizerControl.measurement])v.powerReadCursor=10000;
  assert.throws(()=>m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec),/normalizer-control/);
});
function updateErrorSnapshot(f){f.proof.errorObservation.oracleEvidence=clone(f.facts.oracleEvidence);}
for(const field of ['attempts','powerReads','meterTickReads'])for(const empty of [false,true])test('error snapshot rejects truncated '+field+' prefix '+empty,async()=>{
  const m=await load(),f=await fixture(),snapshot=f.proof.errorObservation;
  assert.equal(m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec).passed,true);
  const owner=field==='attempts'?snapshot.normalizerControl:snapshot;
  owner[field]=owner[field].slice(0,empty?0:-1);
  assert.throws(()=>m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec),/audio-normalizer-control-snapshot-cursor/);
});
test('one coalesced plateau callback stays unposted and never receives an invented ACK',async()=>{
  const m=await load(),f=await fixture();f.facts.oracleEvidence.ledger.events=f.facts.oracleEvidence.ledger.events.filter(e=>!(e.packet.kind==='power'&&e.packet.meterSeq===50)&&!(e.packet.kind==='meter-accepted'&&e.packet.seq===50));reseal(f);updateErrorSnapshot(f);
  const r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec);assert.equal(r.passed,true,JSON.stringify(r));assert.equal(r.power.unpostedCallbacks,1);
});
for(const key of ['attemptCursor','powerReadCursor','meterTickCursor'])test('final snapshot binds its '+key+' to the full retained array',async()=>{
  const m=await load(),f=await fixture();f.facts.normalizerControl.observedAt[key]--;
  assert.throws(()=>m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec),/audio-normalizer-control-snapshot-cursor/);
});
test('coalescing cannot hide a non-stall cadence gap after N converges',async()=>{
  const m=await load(),f=await fixture(),l=f.facts.oracleEvidence.ledger;l.events=l.events.filter(e=>!(['power','meter-accepted'].includes(e.packet.kind)&&[50,51].includes(e.packet.meterSeq??e.packet.seq)));
  for(const e of l.events)if(e.packet.kind==='meter-accepted'&&e.packet.seq>=52&&e.packet.seq<=55){const p=e.packet;p.code=p.application.mode=p.seq===52?'hold':'warmup';p.application.end=p.application.start;}
  reseal(f);updateErrorSnapshot(f);const r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec);assert.equal(r.passed,false);assert.ok(r.failures.includes('normalizer-control-tick-gap'));
});
test('a pre-fault power accepted during injection keeps its successful callback identity',async()=>{
  const m=await load(),f=await fixture(),p=f.facts.oracleEvidence.ledger.events.find(e=>e.packet.kind==='meter-accepted'&&e.packet.frame===7.5*48000).packet;
  p.frame=p.application.frame=Math.round(7.56*48000);p.application.start=7.56;p.application.end=7.66;reseal(f);updateErrorSnapshot(f);
  const r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,f.spec);assert.equal(r.passed,true,JSON.stringify(r));
});

async function scenarioFixture(hooks={}){
  const f=await fixture(),rate=f.spec.sampleRate,path=require('node:path'),saved=new Map(),module=Buffer.from('control synthetic module'),directory='output/playwright/installed-extension-ControlUnit';let position=0,on=false,posted=false,activeFault=false;const controlEvents=[],captures=[],calls=[];
  const files={root:process.cwd(),readdir:async p=>[{name:p==='dist'?'web':'audio-transition-worklet.js',isDirectory:()=>p==='dist',isFile:()=>p==='dist/web',isSymbolicLink:()=>false}],ensureDirectory:async()=>{},lstat:async p=>saved.has(p)?{isFile:()=>true,size:saved.get(p).length}:null,readFile:async(p,encoding)=>{const data=saved.get(p)??(p.endsWith('audio-transition-worklet.js')?module:p.startsWith('tests/')?Buffer.from('<html></html>'):null);if(!data)throw Error('missing '+p);return encoding?data.toString(encoding):data;},writeFile:async(p,data,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(p));saved.set(p,Buffer.from(data));if(hooks.write)await hooks.write(p);}};
  const current=full=>{
    const x=clone(posted?f.facts:f.before),time=position/rate;x.audioTime=time;x.video.currentTime=time;Object.assign(x.productObservation,{sources:on?1:0,l1Nodes:on?1:0,sourceFrame:on?0:null,commonStart:on?0:Infinity,commonEnd:Math.floor(position/128)*128,moduleLoads:['chrome-extension://actual/web/audio-transition-worklet.js']});x.sources=on?1:0;
    if(!posted)return x;
    x.powerReads=x.powerReads.filter(p=>p.time<=time);x.meterTickReads=x.meterTickReads.filter(t=>t.endTime<=time);x.normalizerControl.attempts=x.normalizerControl.attempts.filter(a=>a.time<=time);x.reads=x.normalizerControl.attempts.length;x.normalizerControl.events=clone(controlEvents);x.normalizerControl.observedAt={frame:position,time,wall:time*1000,powerReadCursor:x.powerReads.length,meterTickCursor:x.meterTickReads.length,attemptCursor:x.reads,sourceEpoch:1,commandSeq:2};
    x.oracleEvidence.ledger.events=x.oracleEvidence.ledger.events.filter(e=>e.direction==='send'&&e.packet.kind!=='configure'?e.packet.observedTime<=time:typeof e.packet.frame==='number'?e.packet.frame<=position:true);
    const l=x.oracleEvidence.ledger;l.events.forEach((e,i)=>e.order=i+1);l.eventCount=l.events.length;l.bytes=0;l.bytes=Buffer.byteLength(JSON.stringify(l))+2048;
    const count=l.events.filter(e=>e.direction==='send'&&e.packet.kind!=='configure').length;x.productObservation.meterDiagnostics={sent:count,received:count};if(!full)delete l.events;return x;
  };
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},locator:()=>({click:async()=>{on=true;position=rate*.04;}}),waitForTimeout:async ms=>{position+=Math.round(ms*rate/1000);if(hooks.pause)await hooks.pause(ms,activeFault);},evaluate:async(fn,arg)=>{
    if(fn.name==='installProcessingProbe'){assert.equal(arg.normalizerControl,true);return;}
    calls.push(arg.kind);
    if(arg.kind==='signal'||arg.kind==='video')return;
    if(arg.kind==='configure'){on=arg.enabled;if(arg.config.normalizerEnabled){posted=true;position=rate/10;return clone(f.request);}return {status:on?'on':'off',frame:position};}
    if(arg.kind==='reset-events')return clone(f.measurement);
    if(arg.kind==='stall'){assert.equal(arg.milliseconds,240);assert.equal(position,6.6*rate);position+=.24*rate;controlEvents.push(clone(f.facts.normalizerControl.events[0]));return clone(controlEvents[0]);}
    if(arg.kind==='analysis-error'){
      if(arg.enabled){assert.equal(position,7.54*rate);activeFault=true;controlEvents.push(clone(f.facts.normalizerControl.events[1]));}
      else if(activeFault){activeFault=false;const e=clone(f.facts.normalizerControl.events[2]);controlEvents.push(e);if(hooks.restore)throw Error('control-restore-failed');}
      return clone(controlEvents.at(-1));
    }
    if(arg.kind==='facts'){const x=current(arg.fullOracle===true);if(hooks.facts)hooks.facts(x);return x;}
    if(arg.kind==='l1-partial')return {streams:[],normalizerControl:current(true).normalizerControl};
    if(arg.kind==='product-capture'){
      const a=arg.startFrame,b=arg.endFrame,x=current(false);captures.push([a,b]);const raw={schema:'f01-product-window-v1',sampleRate:rate,start:a,end:b,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',commands:clone(x.productObservation.commands),replies:clone(x.productObservation.replies),normalizerControlEvents:clone(controlEvents),streams:[2,2,5].map((channels,stream)=>{const w=f.archive.window(a,b,stream),data=Buffer.alloc((b-a)*channels*4);for(let n=0;n<b-a;n++)for(let c=0;c<channels;c++)data.writeFloatLE(w.channels[c][n],(n*channels+c)*4);return {start:a,end:b,channels,encoding:'interleaved-float32le',base64:data.toString('base64')};})};if(hooks.capture)await hooks.capture(raw,captures);return raw;
    }
    throw Error('unexpected '+arg.kind);
  }};
  const input={context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async(_fn,arg)=>typeof arg==='string'?Array.from(module):undefined},extensionId:'actual',artifactPath:path.join(files.root,directory)};
  const execute=async()=>{const m=await import('../scripts/extension-e2e/audio-product.mjs');assert.equal(typeof m.runProductNormalizerControlScenario,'function','the original CLI needs the concrete control scenario');return m.runProductNormalizerControlScenario(input,files,{dist:path.join(files.root,'dist')},f.spec);};
  return {f,files,input,execute,saved,directory,captures,calls,get activeFault(){return activeFault;}};
}
async function wrapper(f,mutate){
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),path=require('node:path'),source={sourceSha256:'control-unit-source'},candidate={root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  return runProductAudio({runId:'ControlUnit',caseId:f.f.spec.id},{platform:'win32',files:f.files,attest:async()=>source,verifyCandidate:async()=>candidate,execute:async options=>{
    await options.dependencies.verifyCandidate('ControlUnit',process.cwd(),{retainEvidence:true});const r=await options.dependencies.mediaScenario(f.input);await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('synthetic trace'),{flag:'wx'});if(mutate)await mutate(r,f.saved);
    return {...r,ok:true,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},source,after:source};
  }});
}
test('the existing dispatcher executes and replays the fixed original fault pair',async()=>{
  const f=await scenarioFixture(),r=(await wrapper(f)).audioProduct;assert.equal(r.schema,'f01-product-normalizer-control-observation-v1');assert.equal(r.passed,true);assert.equal(r.control.errorUnity,true);assert.equal(r.qualityAssessed,false);assert.equal(f.calls.filter(k=>k==='stall').length,1);assert.equal(f.activeFault,false);assert.ok(f.saved.has(f.directory+'/normalizer-control-target.json'));assert.ok(f.captures.every(([a,b])=>b-a<=4800));
});
test('saved control proof refuses a timing donor after valid observation',async()=>{
  const f=await scenarioFixture();await assert.rejects(()=>wrapper(f,async(_r,saved)=>{const p=f.directory+'/normalizer-control-target.json',value=JSON.parse(saved.get(p));value.events[1].at.frame++;saved.set(p,Buffer.from(JSON.stringify(value)));}),/observation-failed/);
});
test('saved control proof refuses truncated error snapshot arrays after a valid observation',async()=>{
  const f=await scenarioFixture();let mutated=false;
  await assert.rejects(()=>wrapper(f,async(_r,saved)=>{
    const p=f.directory+'/normalizer-control-target.json',value=JSON.parse(saved.get(p)),snapshot=value.errorObservation;
    snapshot.normalizerControl.attempts=[];snapshot.powerReads=[];snapshot.meterTickReads=[];
    saved.set(p,Buffer.from(JSON.stringify(value)));mutated=true;
  }),/observation-failed/);
  assert.equal(mutated,true);
});
for(const forged of [false,true])test('saved earlier PCM metadata accepts only a genuine event prefix '+forged,async()=>{
  const f=await scenarioFixture(),crypto=require('node:crypto');
  const action=()=>wrapper(f,async(r,saved)=>{for(const entry of r.audioProduct.archive.artifacts.filter(a=>a.kind==='metadata')){const raw=JSON.parse(saved.get(entry.file));raw.normalizerControlEvents=raw.normalizerControlEvents.slice(0,2);if(forged)raw.normalizerControlEvents[1].at.frame++;const bytes=Buffer.from(JSON.stringify(raw));saved.set(entry.file,bytes);entry.bytes=bytes.length;entry.sha256=crypto.createHash('sha256').update(bytes).digest('hex');}saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(r.audioProduct)));});
  if(forged)await assert.rejects(action,/observation-failed/);else assert.equal((await action()).audioProduct.passed,true);
});
for(const restore of [false,true])test('control failure preserves primary and bounded restore secondary '+restore,async()=>{
  const f=await scenarioFixture({pause:async(ms,active)=>{if(ms===220&&active)throw Error('original-control-pause-failed');},restore});await assert.rejects(f.execute,/original-control-pause-failed/);assert.equal(f.activeFault,false);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(p.error,/original-control-pause-failed/);assert.ok(p.facts.normalizerControl.events.at(-1).enabled);assert.equal(p.secondary.some(s=>s.includes('control-restore-failed')),restore);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
test('deadline expiring immediately before normal clear still restores the injected flag once',async()=>{
  const original=Date.now;let armed=false,calls=0;
  const f=await scenarioFixture({facts:x=>{if(x.normalizerControl?.events.length===2&&x.audioTime>=7.76)armed=true;}});
  Date.now=()=>original()+(armed&&++calls>=2?90001:0);
  try{await assert.rejects(f.execute,/scenario-timeout/);assert.equal(f.activeFault,false);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(p.error,/scenario-timeout/);assert.equal(f.calls.filter(c=>c==='analysis-error').length,2);}finally{Date.now=original;}
});
test('a timed out partial control write is charged and cannot commit coverage after STOP',async()=>{
  const original=Date.now,initial=original();let clock=null,release,watchdog;
  const f=await scenarioFixture({capture:async()=>{clock=initial+89950;},write:async p=>{if(p.endsWith('segment-0000-stream-0.f32le'))await new Promise(resolve=>{release=resolve;watchdog=setTimeout(resolve,1000);});}});
  Date.now=()=>clock??original();
  try{
    await assert.rejects(f.execute,/timeout/);assert.equal(typeof release,'function');const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.ok(p.archive.bytes>0);assert.equal(p.archive.end,null);assert.equal(p.archive.pendingWrites.length,1);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
    release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal([...f.saved.keys()].filter(p=>p.includes('segment-0000-')).length,1);
  }finally{clearTimeout(watchdog);release?.();Date.now=original;}
});
