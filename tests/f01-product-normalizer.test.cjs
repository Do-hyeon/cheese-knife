const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../scripts/audio-l1-normalizer-oracle.mjs'),rate=48000;
const spec={id:'48000/normalizer/-24/stereo',sampleRate:rate,inputDbfs:-24,pattern:'stereo',seconds:15};
const clone=structuredClone;
const command=(seq,normalizer)=>({kind:'configure',sourceEpoch:1,seq,wanted:true,gain:1,eq:Array(8).fill(0),normalizer,dynamics:normalizer,targetDbfs:-20});
const reply=(kind,seq,frame,epoch)=>({kind,sourceEpoch:1,seq,frame,meterEpoch:epoch,gain:kind==='completed'?1:null,code:null});
function fixture({outputScale=1,controlScale=1,sourceDrift=false,selectedSpec=spec,headroomWitness=false}={}){
  const rate=selectedSpec.sampleRate,level=selectedSpec.inputDbfs,pattern=selectedSpec.pattern,seconds=selectedSpec.seconds,fft=2**Math.ceil(Math.log2(rate*.25)),count=seconds*10,power=10**(level/10),delta=Math.max(-12,Math.min(6,-20-level));
  const curve=time=>{const ticks=Math.max(0,time-.5)*10,n=Math.floor(ticks+1e-10),step=delta<0?1.2:.1,from=Math.min(Math.abs(delta),n*step),to=Math.min(Math.abs(delta),(n+1)*step);return Math.sign(delta)*(from+(to-from)*Math.max(0,ticks-n));};
  const quiet=c=>pattern==='left'&&c===1||pattern==='right'&&c===0;
  const prepared=reply('prepared',0,0,0),baseline={requestedFrame:0,message:command(1,false)},targetCommand={requestedFrame:rate/20,message:command(2,true)};
  const initialReplies=[prepared,reply('accepted',1,0,1),reply('completed',1,Math.ceil(.03*rate+(rate===44100?264:rate*.006)),1)],targetReplies=[reply('accepted',2,rate/20,2),reply('completed',2,rate/20+rate/50,2)];
  const signal={frequency:1000,inputDbfs:level,pattern,phase:.37,channels:pattern==='mono'?1:2,durationSeconds:90,frames:90*rate,loop:false,error:''};
  const video={muted:false,volume:1,loop:false,ended:false,paused:false,playbackRate:1,currentTime:seconds+.2},readback={state:'on',sources:1,wanted:true,gain:1,appliedGain:1};
  const base={sampleRate:rate,contextState:'running',hidden:false,filters:0,sources:1,gains:[1,0,0,1,1,0,1,0],signal,video,readback};
  const initial={available:true,reason:null,sourceEpoch:1,initial:'raw',normalizerWitness:true};
  const before={...clone(base),audioTime:.04,analysers:0,buffers:0,reads:0,active100msTimers:0,powerReads:[],meterTickReads:[],normalizerMeasurement:null,normalizerSettings:{normalizerEnabled:false,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false},
    oracleEvidence:{schema:'f01-oracle-evidence-v2',initial,ledger:{schema:'f01-control-ledger-v2'}},productObservation:{sources:1,l1Nodes:1,invalidFrames:0,streamError:'',commands:[baseline],replies:initialReplies,meterDiagnostics:{sent:0,received:0}}};
  const observation={...clone(before.productObservation),commands:[baseline,targetCommand],replies:[...initialReplies,...targetReplies],meterDiagnostics:{sent:count+1,received:count+1}};
  const events=[],add=(direction,packet)=>events.push({direction,packet,order:events.length+1});
  add('receive',prepared);add('send',baseline.message);for(const p of initialReplies.slice(1))add('receive',p);add('send',targetCommand.message);for(const p of targetReplies)add('receive',p);
  const powerReads=[],meterTickReads=[];
  for(let n=0;n<=count;n++){
    const frame=rate/10+n*(rate/10),time=frame/rate,seq=n+1,mode=n<4?'warmup':'ramp';
    powerReads.push({index:0,time,power:quiet(0)?0:power,size:fft},{index:1,time,power:quiet(1)?0:power,size:fft});
    if(n)meterTickReads.push({ordinal:n,startRead:n*2,endRead:n*2+2,startTime:time,endTime:time});
    add('send',{kind:'power',sourceEpoch:1,meterEpoch:2,meterSeq:seq,observedTime:time,active:true,leftPower:quiet(0)?0:power,rightPower:quiet(1)?0:power,targetDbfs:-20});
    add('receive',{...reply('meter-accepted',seq,frame,2),code:mode,application:{sourceEpoch:1,meterEpoch:2,meterSeq:seq,commandSeq:2,frame,mode,fromDb:curve(time),toDb:n<4?0:curve(time+.1),start:time,end:n<4?time:time+.1}});
  }
  const ledger={schema:'f01-control-ledger-v2',available:true,reason:null,maxEvents:4128,maxBytes:1048576,eventCount:events.length,bytes:0,events};ledger.bytes=Buffer.byteLength(JSON.stringify(ledger))+2048;
  const facts={...clone(base),audioTime:seconds+.2,analysers:2,fftSizes:[fft,fft],buffers:2,reads:(count+1)*2,active100msTimers:1,powerReads,meterTickReads,events:[],linearEvents:[],steps:[],productObservation:observation,normalizerSettings:{normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false},oracleEvidence:{schema:'f01-oracle-evidence-v2',initial,ledger}};
  const measurement={frame:rate/10,powerReadCursor:2,meterTickCursor:0,sourceEpoch:1,commandSeq:2},request={status:'on',frame:rate/20};facts.normalizerMeasurement=clone(measurement);
  const archive={summary:()=>({sampleRate:rate,start:0,end:measurement.frame+seconds*rate,bytes:(measurement.frame+seconds*rate)*36,cap:96*1024*1024}),window(start,end,stream=0){
    const channels=stream===2?Array.from({length:5},(_,c)=>Float32Array.from({length:end-start},(_,n)=>c===3?10**(curve((start+n)/rate)/20)*controlScale:[-1,1,1,0,0][c])):
      Array.from({length:2},(_,c)=>Float32Array.from({length:end-start},(_,n)=>(quiet(c)||stream===1&&pattern==='mono'&&c===1?0:pattern==='antiphase'&&c===1?-1:1)*Math.SQRT2*10**(level/20)*Math.sin(2*Math.PI*1000*(start+n)/rate+.37)*(stream===1?sourceDrift?((start+n)%rate<rate/10?1.1:Math.sqrt((1-.1*1.1**2)/.9)):1:10**(curve((start+n)/rate)/20)*outputScale)));
    return {rate,start,end,channels};
  }};
  if(headroomWitness){
    for(const raw of [before,facts]){raw.oracleEvidence.schema='f01-oracle-evidence-v3';raw.oracleEvidence.initial.headroomWitness=true;raw.oracleEvidence.ledger.schema='f01-control-ledger-v3';}
    for(const e of events)if(e.packet.kind==='meter-accepted')e.packet.renderHeadroom={sourceEpoch:1,commandSeq:2,startFrame:e.packet.frame,endFrame:e.packet.frame+128,eq:Array(8).fill(0),headroom:1};
    ledger.bytes=Buffer.byteLength(JSON.stringify(ledger))+2048;
  }
  return {spec:clone(selectedSpec),before,request,facts,measurement,archive};
}

test('packaged normalizer fixes the original first stereo case and its actual N-on lifecycle',async()=>{
  const {PACKAGED_NORMALIZER_CASE,selectNormalizerTarget}=await load(),f=fixture();assert.deepEqual(PACKAGED_NORMALIZER_CASE,spec);
  const target=selectNormalizerTarget(f.facts,f.before,f.request);assert.equal(target.command.message.normalizer,true);assert.equal(target.command.message.dynamics,true);assert.equal(target.completed.frame,3360);
  for(const mutate of [x=>x.facts.productObservation.commands[1].message.dynamics=false,x=>x.before.analysers=2,x=>x.before.productObservation.meterDiagnostics.sent=1,x=>x.facts.productObservation.commands.push(clone(x.facts.productObservation.commands[1]))]){
    const x=fixture();mutate(x);assert.throws(()=>selectNormalizerTarget(x.facts,x.before,x.request),/normalizer/);
  }
});
test('normalizer measurement is bound to the actual probe marker',async()=>{
  const {selectNormalizerTarget,assessPackagedNormalizer}=await load();
  for(const mutate of [f=>f.measurement.frame+=4800,f=>f.measurement.commandSeq=3]){
    const f=fixture(),target=selectNormalizerTarget(f.facts,f.before,f.request);mutate(f);
    assert.throws(()=>assessPackagedNormalizer(f.archive,f.facts,{spec:f.spec,beforeTarget:f.before,request:f.request,target,measurement:f.measurement}),/normalizer-marker/);
  }
});
test('normalizer retains a compressor toggle even when final settings and N curve match',async()=>{
  const {selectNormalizerTarget,assessPackagedNormalizer}=await load(),f=fixture(),target=selectNormalizerTarget(f.facts,f.before,f.request);f.facts.linearEvents.push({node:5,from:0,to:1,start:2,end:2.01});
  const r=assessPackagedNormalizer(f.archive,f.facts,{spec:f.spec,beforeTarget:f.before,request:f.request,target,measurement:f.measurement});assert.equal(r.passed,false);assert.ok(r.failures.includes('normalizer-compressor-change'));
});
function reseal(f){const l=f.facts.oracleEvidence.ledger;l.events.forEach((e,i)=>e.order=i+1);l.eventCount=l.events.length;l.bytes=0;l.bytes=Buffer.byteLength(JSON.stringify(l))+2048;}
test('normalizer cadence includes the silent tail after N has already converged',async()=>{
  const {selectNormalizerTarget,assessPackagedNormalizer}=await load(),f=fixture(),target=selectNormalizerTarget(f.facts,f.before,f.request);
  f.facts.powerReads=f.facts.powerReads.slice(0,200);f.facts.reads=200;f.facts.meterTickReads=f.facts.meterTickReads.slice(0,99);f.facts.productObservation.meterDiagnostics={sent:100,received:100};
  f.facts.oracleEvidence.ledger.events=f.facts.oracleEvidence.ledger.events.filter(e=>e.packet.kind==='power'?e.packet.meterSeq<=100:e.packet.kind==='meter-accepted'?e.packet.seq<=100:true);reseal(f);
  const r=assessPackagedNormalizer(f.archive,f.facts,{spec:f.spec,beforeTarget:f.before,request:f.request,target,measurement:f.measurement});assert.equal(r.passed,false);assert.ok(r.failures.includes('normalizer-tick-gap'));
});
test('normalizer binds the selected target to the independent ledger and rejects a hidden same-curve command',async()=>{
  const {selectNormalizerTarget,assessPackagedNormalizer}=await load(),f=fixture(),target=selectNormalizerTarget(f.facts,f.before,f.request),events=f.facts.oracleEvidence.ledger.events;
  const at=events.findIndex(e=>e.direction==='send'&&e.packet.meterSeq===6);events.splice(at,0,{direction:'send',packet:command(3,true)},{direction:'receive',packet:reply('accepted',3,28800,2)});
  const done=events.findIndex(e=>e.direction==='receive'&&e.packet.kind==='meter-accepted'&&e.packet.seq===6);events.splice(done+1,0,{direction:'receive',packet:reply('completed',3,29760,2)});
  for(const e of events)if(e.packet.application&&e.packet.frame>=28800)e.packet.application.commandSeq=3;reseal(f);
  assert.throws(()=>assessPackagedNormalizer(f.archive,f.facts,{spec:f.spec,beforeTarget:f.before,request:f.request,target,measurement:f.measurement}),/normalizer-history-target/);
});
test('normalizer checks source at 100ms even when its one-second RMS and coherent amplitude are valid',async()=>{
  const {selectNormalizerTarget,assessPackagedNormalizer}=await load(),f=fixture({sourceDrift:true}),target=selectNormalizerTarget(f.facts,f.before,f.request);
  const r=assessPackagedNormalizer(f.archive,f.facts,{spec:f.spec,beforeTarget:f.before,request:f.request,target,measurement:f.measurement});assert.equal(r.passed,false);assert.ok(r.failures.some(s=>s.startsWith('source-channel-')));
});
test('packaged normalizer connects 15-second original output bins FFT pairs and every N control sample',async()=>{
  const {selectNormalizerTarget,assessPackagedNormalizer}=await load(),f=fixture(),target=selectNormalizerTarget(f.facts,f.before,f.request);
  const r=assessPackagedNormalizer(f.archive,f.facts,{spec:f.spec,beforeTarget:f.before,request:f.request,target,measurement:f.measurement});
  assert.deepEqual(r.failures,[]);assert.equal(r.passed,true);assert.equal(r.output.completeBins,150);assert.equal(r.output.expectedDbfs,-20);assert.equal(r.controlCoverage.frames,15*rate);assert.equal(r.controlCoverage.windows,15);
  assert.equal(r.native7Witness,'UNASSESSED');assert.equal(r.frameOrigin,'UNPROVEN');assert.equal(r.overallQualification,false);
  assert.equal(r.controlCoverage.toleranceDb,.001);
});
test('packaged normalizer rejects shifted FFT pairing hidden inactive ticks and changed original input',async()=>{
  const {selectNormalizerTarget,assessPackagedNormalizer}=await load();
  for(const mutate of [x=>x.facts.powerReads[0].power*=2,x=>x.facts.meterTickReads[5].endRead-=2,x=>x.facts.powerReads[2].index=1,x=>x.facts.powerReads[2].size=8192,x=>x.spec.seconds=14,x=>x.measurement.frame=6*rate]){
    const f=fixture(),target=selectNormalizerTarget(f.facts,f.before,f.request);mutate(f);assert.throws(()=>assessPackagedNormalizer(f.archive,f.facts,{spec:f.spec,beforeTarget:f.before,request:f.request,target,measurement:f.measurement}),/normalizer/);
  }
});
test('product CLI preserves the original normalizer case and keeps component mode separate',async()=>{
  const {parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  assert.deepEqual(parseProductAudioArgs(['--run-id=NormalizerUnit','--case='+spec.id]),{runId:'NormalizerUnit',caseId:spec.id});
  for(const args of [['--run-id=N','--case='+spec.id,'--component-witness'],['--run-id=N','--case='+spec.id,'--sample-rate=96000'],['--run-id=N','--case=48000/normalizer/-24/Mono']])assert.throws(()=>parseProductAudioArgs(args));
});

function scenarioFixture(fault,selectedSpec=spec,hooks={}){
  const f=fixture({selectedSpec,headroomWitness:hooks.headroomWitness===true}),rate=f.spec.sampleRate,saved=new Map(),path=require('node:path'),module=Buffer.from('normalizer unit packaged module'),directory='output/playwright/installed-extension-NormalizerUnit';let on=false,posted=false,position=0;const captures=[];
  const files={root:process.cwd(),readdir:async p=>[{name:p==='dist'?'web':'audio-transition-worklet.js',isDirectory:()=>p==='dist',isFile:()=>p==='dist/web',isSymbolicLink:()=>false}],saved,ensureDirectory:async()=>{},lstat:async file=>saved.has(file)?{isFile:()=>true,size:saved.get(file).length}:null,
    readFile:async(file,encoding)=>{const data=saved.get(file)??(file.endsWith('audio-transition-worklet.js')?module:file.startsWith('tests/')?Buffer.from('<html></html>'):null);if(!data)throw Error('missing '+file);return encoding?data.toString(encoding):data;},
    writeFile:async(file,data,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(file));saved.set(file,Buffer.from(data));if(hooks.write)await hooks.write(file,data);}};
  const current=full=>{
    const x=clone(posted?f.facts:f.before);x.audioTime=position/rate;x.video.currentTime=position/rate;x.productObservation.moduleLoads=['chrome-extension://actual/web/audio-transition-worklet.js'];
    Object.assign(x.productObservation,{sources:on?1:0,l1Nodes:on?1:0,sourceFrame:on?0:null,commonStart:on?0:Infinity,commonEnd:on?Math.floor(position/128)*128:0});x.sources=on?1:0;
    if(!on)Object.assign(x.readback,{state:'off',sources:0,wanted:false,appliedGain:null});
    if(posted){const pairs=Math.max(0,Math.min(f.spec.seconds*10+1,Math.floor((position-rate/10)/(rate/10))+1));x.powerReads=x.powerReads.slice(0,pairs*2);x.reads=pairs*2;x.meterTickReads=x.meterTickReads.slice(0,Math.max(0,pairs-1));
      x.productObservation.meterDiagnostics={sent:pairs,received:pairs,...(hooks.headroomWitness?{lastFrame:rate/10+Math.max(0,pairs-1)*rate/10}:{})};
      const l=x.oracleEvidence.ledger;l.events=l.events.filter(e=>e.packet.kind==='power'?e.packet.meterSeq<=pairs:typeof e.packet.frame==='number'?e.packet.frame<=position:true);l.events.forEach((e,i)=>e.order=i+1);l.eventCount=l.events.length;l.bytes=Buffer.byteLength(JSON.stringify(l))+2048;if(!full)delete l.events;
    }
    if(fault==='live-failed'&&posted&&position>=rate/2)x.readback.state='unavailable';
    if(fault==='missing-ack'&&posted)x.productObservation.replies=x.productObservation.replies.filter(p=>!(p.kind==='completed'&&p.seq===2));if(hooks.facts)hooks.facts(x,captures,full);return x;
  };
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},waitForTimeout:async ms=>{position+=Math.round(ms*rate/1000);},locator:()=>({click:async()=>{on=true;position=rate*.04;}}),evaluate:async(fn,arg)=>{
    if(fn.name==='installProcessingProbe'){assert.deepEqual(arg,{sampleRate:rate,productObservation:true,oracleEvidence:true,normalizerWitness:true,...(hooks.headroomWitness?{headroomWitness:true}:{})});return;}
    if(arg.kind==='signal'){assert.deepEqual(arg,{kind:'signal',frequency:1000,inputDbfs:f.spec.inputDbfs,pattern:f.spec.pattern,phase:.37,durationSeconds:90});return;}
    if(arg.kind==='configure'){on=arg.enabled;if(arg.config.normalizerEnabled===true){assert.equal(arg.gain,1);assert.equal(arg.config.compressorEnabled,false);assert.equal(arg.config.eqEnabled,false);posted=true;position=rate/10;return clone(f.request);}return {status:on?'on':'off',frame:position};}
    if(arg.kind==='video')return;
    if(arg.kind==='reset-events')return {...f.measurement,...(fault==='history-cap'?{frame:6*rate}:{})};
    if(arg.kind==='facts')return current(arg.fullOracle===true);
    if(arg.kind==='l1-partial')return {streams:[],oracleEvidence:current(true).oracleEvidence};
    if(arg.kind==='product-capture'){
      const {startFrame:start,endFrame:end}=arg,x=current(false);captures.push({start,end,watermark:x.productObservation.commonEnd});
      const raw={schema:'f01-product-window-v1',sampleRate:rate,start,end,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',commands:clone(x.productObservation.commands),replies:clone(x.productObservation.replies),...(hooks.headroomWitness?{oracleEvidence:x.oracleEvidence}:{}),streams:[2,2,5].map((channels,stream)=>{
        const window=f.archive.window(start,end,stream),bytes=Buffer.alloc((end-start)*channels*4);for(let n=0;n<end-start;n++)for(let c=0;c<channels;c++)bytes.writeFloatLE(window.channels[c][n],(n*channels+c)*4);
        return {start,end,channels,encoding:'interleaved-float32le',base64:bytes.toString('base64')};
      })};if(hooks.capture)await hooks.capture(raw,captures);return raw;
    }
    throw Error('unexpected '+arg.kind);
  }};
  const input={context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async(_fn,arg)=>typeof arg==='string'?Array.from(module):undefined},extensionId:'actual',artifactPath:path.join(files.root,directory)};
  const execute=async()=>{const {runProductNormalizerScenario}=await import('../scripts/extension-e2e/audio-product.mjs');return runProductNormalizerScenario(input,files,{dist:path.join(files.root,'dist')},selectedSpec,hooks.headroomWitness===true);};
  return {input,files,saved,directory,execute,spec:f.spec,fixture:f,captures,headroomWitness:hooks.headroomWitness===true};
}
test('existing packaged scenario connects N marker 15 seconds and source control without another runner',async()=>{
  const f=scenarioFixture(),r=(await f.execute()).audioProduct;assert.equal(r.schema,'f01-product-normalizer-observation-v1');assert.equal(r.passed,true);assert.equal(r.outcome,'PASS');assert.equal(r.normalizer.controlCoverage.frames,720000);
  assert.equal(r.normalizer.output.expectedDbfs,-20);assert.equal(r.normalizer.power.uniqueAppliedBeforeEnd,150);assert.ok(f.saved.has(f.directory+'/normalizer-target.json'));
});
for(const fault of ['history-cap','missing-ack'])test('normalizer '+fault+' is retained without widening a deadline or replaying the stimulus',async()=>{
  const f=scenarioFixture(fault);await assert.rejects(f.execute);assert.ok(f.saved.has(f.directory+'/partial.json'));assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
async function wrapper(f,execute){
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),path=require('node:path'),source={sourceSha256:'normalizer-unit-source'},candidate={root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  return runProductAudio({runId:'NormalizerUnit',caseId:f.spec.id,...(f.headroomWitness?{headroomWitness:true}:{})},{platform:'win32',files:f.files,attest:async()=>source,verifyCandidate:async()=>candidate,execute:async options=>{
    await options.dependencies.verifyCandidate('NormalizerUnit',process.cwd(),{retainEvidence:true});
    const r=execute?await execute(options):await options.dependencies.mediaScenario(f.input);await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('unit trace'),{flag:'wx'});
    return {...r,ok:true,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},source,after:source};
  }});
}
test('normalizer caller spec and saved source plan/control/output are rechecked by the original product wrapper',async()=>{
  const f=scenarioFixture(),r=(await wrapper(f)).audioProduct;assert.equal(r.passed,true);assert.equal(r.scope,spec.id);assert.equal(r.normalizer.native7Witness,'UNASSESSED');
});
test('normalizer saved replay refuses a marker moved together in report and proof but not in probe evidence',async()=>{
  const f=scenarioFixture();await assert.rejects(()=>wrapper(f,async()=>{
    const r=await f.execute(),report=r.audioProduct,proof=JSON.parse(f.saved.get(f.directory+'/normalizer-target.json'));proof.measurement.frame+=4800;report.measurement.frame=proof.measurement.frame;
    f.saved.set(f.directory+'/normalizer-target.json',Buffer.from(JSON.stringify(proof)));f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));return r;
  }),e=>e.error?.message==='audio-normalizer-marker');
});

test('normalizer stops at the first explicit live failure before filling the 15-second span',async()=>{
  const f=scenarioFixture('live-failed');await assert.rejects(f.execute,/normalizer-live-state/);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(partial.facts.readback.state,'unavailable');assert.ok(partial.facts.audioTime<1);
});

test('N60 canonical registry and CLI bind all original cases without a generic spec parser',async()=>{
  const {PACKAGED_NORMALIZER_CASES,selectNormalizerCase}=await load(),{normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),{parseProductAudioArgs,selectProductCase}=await import('../scripts/extension-e2e/audio-product.mjs'),all=normalizerMeasurementCases();
  assert.equal(all.length,60);assert.equal(PACKAGED_NORMALIZER_CASES.length,60);assert.equal(new Set(PACKAGED_NORMALIZER_CASES.map(s=>s.id)).size,60);assert.ok(Object.isFrozen(PACKAGED_NORMALIZER_CASES));
  for(const original of all){const s=selectNormalizerCase(original.id);assert.deepEqual(s,original);assert.ok(Object.isFrozen(s));assert.deepEqual(selectProductCase(s.id),s);assert.equal(parseProductAudioArgs(['--run-id=N60','--case='+s.id]).caseId,s.id);assert.throws(()=>parseProductAudioArgs(['--run-id=N60','--case='+s.id,'--component-witness']));assert.throws(()=>parseProductAudioArgs(['--run-id=N60','--case='+s.id,'--sample-rate='+(s.sampleRate===96000?48000:96000)]));}
  for(const id of ['44100/normalizer/-24/Mono','48000/normalizer/-25/stereo','96000/normalizer/-6/right/extra','192000/normalizer/-24/stereo','toString'])assert.throws(()=>selectNormalizerCase(id));
});
test('N60 every short source pattern keeps original active and silent channel gates',async()=>{
  const {normalizerSourceFailures}=await load(),{normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs');
  for(const s of normalizerMeasurementCases()){const f=fixture({selectedSpec:s}),w=f.archive.window(s.sampleRate/10,s.sampleRate/5,1);assert.deepEqual(normalizerSourceFailures(w,s),[],s.id);const level=s.inputDbfs===-36?-24:-36,other={...s,id:s.sampleRate+'/normalizer/'+level+'/'+s.pattern,inputDbfs:level,seconds:level===-24?15:10};assert.ok(normalizerSourceFailures(w,other).length,s.id+' re-labelled level');
    const bad={...w,channels:w.channels.map(c=>c.slice())},active=s.pattern==='right'?1:0;bad.channels[active].fill(0);assert.ok(normalizerSourceFailures(bad,s).length,s.id+' active missing');
    if(['mono','left','right'].includes(s.pattern)){const q=s.pattern==='right'?0:1;bad.channels=w.channels.map(c=>c.slice());bad.channels[q].fill(1e-3);assert.ok(normalizerSourceFailures(bad,s).length,s.id+' silent contamination');}
  }
});
test('N60 source polarity refuses re-labelled stereo and antiphase without claiming exact phase',async()=>{
  const {normalizerSourceFailures}=await load(),{normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=normalizerMeasurementCases().find(s=>s.id==='48000/normalizer/-12/antiphase'),f=fixture({selectedSpec:s}),w=f.archive.window(4800,9600,1);
  assert.ok(normalizerSourceFailures(w,{...s,id:'48000/normalizer/-12/stereo',pattern:'stereo'}).includes('source-polarity'));
  const zero={...w,channels:w.channels.map(c=>new Float32Array(c.length))};assert.ok(normalizerSourceFailures(zero,s).length);
  const skew={...w,channels:[w.channels[0],Float32Array.from({length:4800},(_,n)=>Math.SQRT2*10**(-12/20)*Math.sin(2*Math.PI*1000*(4800+n)/48000+.37+2*Math.PI/3))]};assert.deepEqual(normalizerSourceFailures(skew,s),[]);
});
test('N60 forged caller specs are refused before asynchronous work',async()=>{
  const {runProductNormalizerScenario}=await import('../scripts/extension-e2e/audio-product.mjs'),{normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=normalizerMeasurementCases()[0];
  for(const patch of [{seconds:15},{pattern:'stereo'},{inputDbfs:-24},{sampleRate:96000}])await assert.rejects(()=>runProductNormalizerScenario({},null,null,{...s,...patch}),/original-spec/);
});
const n60Representatives=['44100/normalizer/-36/mono','48000/normalizer/-12/antiphase','96000/normalizer/-6/left','96000/normalizer/-24/right','44100/normalizer/-12/stereo','48000/normalizer/-36/right','96000/normalizer/-36/stereo','44100/normalizer/-6/antiphase'];
for(const id of n60Representatives)test('N60 '+id+' binds input FFT marker N output and saved replay',async()=>{
  const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=normalizerMeasurementCases().find(s=>s.id===id),f=scenarioFixture(null,s),r=(await wrapper(f)).audioProduct,proof=JSON.parse(f.saved.get(f.directory+'/normalizer-target.json'));
  assert.equal(r.passed,true);assert.deepEqual(r.spec,s);assert.deepEqual(proof.spec,s);assert.equal(r.facts.signal.inputDbfs,s.inputDbfs);assert.equal(r.facts.signal.pattern,s.pattern);assert.equal(r.facts.signal.channels,s.pattern==='mono'?1:2);assert.deepEqual(r.facts.fftSizes,Array(2).fill(s.sampleRate===96000?32768:16384));assert.equal(r.normalizer.controlCoverage.frames,s.seconds*s.sampleRate);assert.equal(r.normalizer.output.expectedDbfs,{'-36':-30,'-24':-20,'-12':-20,'-6':-18}[s.inputDbfs]);assert.equal(r.normalizer.native7Witness,'UNASSESSED');assert.equal(r.normalizer.frameOrigin,'UNPROVEN');assert.equal(r.normalizer.overallQualification,false);
});
test('N60 caller mutation cannot replace the canonical spec after the first await',async()=>{
  const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=clone(normalizerMeasurementCases().find(s=>s.id==='44100/normalizer/-12/left')),original=clone(s),f=scenarioFixture(null,s);f.input.context.route=async()=>{s.id='96000/normalizer/-6/right';s.sampleRate=96000;s.pattern='right';s.inputDbfs=-6;};
  const r=(await f.execute()).audioProduct;assert.deepEqual(r.spec,original);assert.equal(r.passed,true);
});
test('N60 96k rejects wrong FFT power and source shape without relaxing silent gates',async()=>{
  const {selectNormalizerTarget,assessPackagedNormalizer}=await load(),{normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=normalizerMeasurementCases().find(s=>s.id==='96000/normalizer/-6/left');
  for(const mutate of [f=>f.facts.fftSizes=[16384,16384],f=>f.facts.powerReads[2].size=16384,f=>f.facts.signal.pattern='right',f=>f.measurement.frame=18*s.sampleRate]){const f=fixture({selectedSpec:s}),target=selectNormalizerTarget(f.facts,f.before,f.request,s);mutate(f);assert.throws(()=>assessPackagedNormalizer(f.archive,f.facts,{spec:f.spec,beforeTarget:f.before,request:f.request,target,measurement:f.measurement},s),/normalizer/);}
});
test('N60 saved replay rejects stereo evidence re-labelled as antiphase with matching metadata',async()=>{
  const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),all=normalizerMeasurementCases(),st=all.find(s=>s.id==='48000/normalizer/-12/stereo'),anti=all.find(s=>s.id==='48000/normalizer/-12/antiphase'),f=scenarioFixture(null,st);f.spec=clone(anti);
  await assert.rejects(()=>wrapper(f,async()=>{const r=await f.execute(),x=r.audioProduct,proof=JSON.parse(f.saved.get(f.directory+'/normalizer-target.json'));x.scope=anti.id;x.spec=clone(anti);x.target.caseId=anti.id;x.normalizer.caseId=anti.id;x.facts.signal.pattern='antiphase';proof.spec=clone(anti);proof.target.caseId=anti.id;proof.beforeTarget.signal.pattern='antiphase';f.saved.set(f.directory+'/normalizer-target.json',Buffer.from(JSON.stringify(proof)));f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(x)));return r;}),e=>e.error?.message==='audio-product-normalizer-assessment');
});

test('N60 FFT-only changes are rejected even when N clamp source PCM and output still match',async()=>{
  const {selectNormalizerTarget,assessPackagedNormalizer}=await load(),{normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),all=normalizerMeasurementCases();
  for(const [id,index,power]of [['96000/normalizer/-6/left',1,1e-8],['44100/normalizer/-36/stereo',0,10**((-36+.1)/10)]]){const s=all.find(s=>s.id===id),f=fixture({selectedSpec:s}),target=selectNormalizerTarget(f.facts,f.before,f.request,s);
    for(const r of f.facts.powerReads)if(r.index===index)r.power=power;
    for(const e of f.facts.oracleEvidence.ledger.events)if(e.direction==='send'&&e.packet.kind==='power')e.packet[index===0?'leftPower':'rightPower']=power;
    reseal(f);const r=assessPackagedNormalizer(f.archive,f.facts,{spec:f.spec,beforeTarget:f.before,request:f.request,target,measurement:f.measurement},s);assert.equal(r.passed,false);assert.deepEqual(r.failures,['normalizer-fft-source-power']);
  }
});

test('BATCH100 separate N exports let a pending host task run between calls',async()=>{
  const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=normalizerMeasurementCases().find(s=>s.id==='44100/normalizer/-12/stereo');let progressed=false,checked=false;
  const f=scenarioFixture(null,s,{capture:async(raw,captures)=>{if(captures.length===1)setTimeout(()=>{progressed=true;},0);if(captures.length===2){assert.equal(progressed,true,'a Promise-only chain must not monopolize the drain');checked=true;}assert.ok(raw.end-raw.start<=s.sampleRate/10,'each N export is at most100ms');}});
  const r=(await f.execute()).audioProduct;assert.equal(r.passed,true);assert.equal(checked,true);
});
for(const sampleRate of [44100,48000,96000])test('BATCH100 '+sampleRate+' concatenated PCM and assessment match legacy1s saved replay',async()=>{
  const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),{createProductArchive}=await import('../scripts/extension-e2e/audio-product.mjs'),s=normalizerMeasurementCases().find(s=>s.id===sampleRate+'/normalizer/-12/stereo'),f=scenarioFixture(null,s);let checked=false;
  const r=(await wrapper(f,async()=>{
    const result=await f.execute(),report=result.audioProduct,small=report.archive,legacy=new Map(),first=JSON.parse(f.saved.get(f.directory+'/segment-0000.json')),archive=createProductArchive({writeFile:async(file,bytes)=>legacy.set(file,Buffer.from(bytes))},f.directory,sampleRate);
    for(let start=small.start;start<small.end;start+=sampleRate){const end=Math.min(start+sampleRate,small.end),raw={...first,start,end,commonStart:start,streams:[2,2,5].map((channels,stream)=>{const w=f.fixture.archive.window(start,end,stream),bytes=Buffer.alloc((end-start)*channels*4);for(let n=0;n<end-start;n++)for(let c=0;c<channels;c++)bytes.writeFloatLE(w.channels[c][n],(n*channels+c)*4);return {start,end,channels,encoding:'interleaved-float32le',base64:bytes.toString('base64')};})};await archive.append(raw);}
    assert.equal(small.start,archive.summary().start);assert.equal(small.end,archive.summary().end);assert.equal(small.bytes,archive.summary().bytes);
    for(const channels of [2,5]){const streams=channels===2?[0,1]:[2];for(const i of streams){const name='-stream-'+i+'.f32le',a=Buffer.concat(small.artifacts.filter(x=>x.file.endsWith(name)).map(x=>f.saved.get(x.file))),b=Buffer.concat(archive.summary().artifacts.filter(x=>x.file.endsWith(name)).map(x=>legacy.get(x.file)));assert.deepEqual(a,b,'stream'+i+' all frames, including boundaries');}}
    assert.ok(f.captures.every(x=>x.end-x.start<=sampleRate/10));if(sampleRate===44100)assert.ok(f.captures.some(x=>x.end-x.start<sampleRate/10),'final non-quantum remainder is retained');
    const {assessPackagedNormalizer}=await load(),proof=JSON.parse(f.saved.get(f.directory+'/normalizer-target.json'));assert.deepEqual(JSON.parse(JSON.stringify(assessPackagedNormalizer(archive,report.facts,proof,s))),report.normalizer);
    report.archive=archive.summary();for(const [name,bytes]of legacy)f.saved.set(name,bytes);f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));checked=true;return result;
  })).audioProduct;assert.equal(r.passed,true);assert.equal(checked,true);
});
test('BATCH100 fixes each drain watermark even when the producer advances during export',async()=>{
  const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=normalizerMeasurementCases().find(s=>s.id==='96000/normalizer/-12/stereo');let startCount=null,watermark=null;
  const f=scenarioFixture(null,s,{facts:(x,captures)=>{if(x.audioTime>=4.1&&startCount===null){startCount=captures.length;watermark=x.productObservation.commonEnd;}if(startCount!==null)x.productObservation.commonEnd=watermark+(captures.length-startCount)*s.sampleRate/10;},capture:async(_raw,captures)=>{assert.ok(captures.length<128,'a moving tail must not be drained forever');}});
  const r=(await f.execute()).audioProduct;assert.equal(r.passed,true);assert.ok(f.captures.length<128);assert.ok(f.captures.every(x=>x.end-x.start<=s.sampleRate/10));
});
for(const fault of ['ring','source','epoch','command','hidden','context'])test('BATCH100 '+fault+' change between N batches retains the first failure and valid prefix',async()=>{
  const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=normalizerMeasurementCases().find(s=>s.id==='96000/normalizer/-12/stereo');
  const f=scenarioFixture(null,s,{facts:(x,captures)=>{if(!captures.length)return;if(fault==='ring')x.productObservation.commonStart=x.productObservation.commonEnd-2000*128;if(fault==='source'){x.sources=2;x.productObservation.sources=2;}if(fault==='epoch')x.productObservation.commands[1].message.sourceEpoch=2;if(fault==='command')x.productObservation.commands[1].message.gain=2;if(fault==='hidden')x.hidden=true;if(fault==='context')x.contextState='suspended';}});
  await assert.rejects(f.execute,/normalizer|collection-gap/);assert.equal(f.captures.length,1,'fresh checks stop before exporting another batch');const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(partial.archive.end,s.sampleRate/10);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);assert.ok(partial.error);
});
for(const offset of [-1,1])test('BATCH100 refuses '+offset+' frame overlap or hole at a non-quantum boundary',async()=>{
  const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=normalizerMeasurementCases().find(s=>s.id==='44100/normalizer/-12/stereo'),f=scenarioFixture(null,s,{capture:async(raw,captures)=>{if(captures.length>=2)raw.start+=offset;}});
  await assert.rejects(f.execute,/archive-coverage/);const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(partial.archive.end,4410);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
for(const fault of ['export','append'])test('BATCH100 '+fault+' error is not replaced by a successful suffix',async()=>{
  const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=normalizerMeasurementCases().find(s=>s.id==='48000/normalizer/-12/stereo'),f=scenarioFixture(null,s,{capture:async(_raw,captures)=>{if(fault==='export'&&captures.length>=2)throw Error('batch-export-failed');},write:async file=>{if(fault==='append'&&file.includes('segment-0001-'))throw Error('batch-append-failed');}});
  await assert.rejects(f.execute,new RegExp('batch-'+fault+'-failed'));const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(partial.error,new RegExp('batch-'+fault+'-failed'));assert.equal(partial.archive.end,s.sampleRate/10);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);assert.ok(partial.secondary.length>0);if(fault==='append')assert.ok(f.saved.has(f.directory+'/segment-0001-stream-0.f32le'),'partially written evidence is retained');
});
test('BATCH100 expiry during a yielded task preserves timeout instead of continuing collection',async()=>{
  const originalNow=Date.now;let now=originalNow();Date.now=()=>now;
  try{const {normalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=normalizerMeasurementCases().find(s=>s.id==='48000/normalizer/-12/stereo'),f=scenarioFixture(null,s,{capture:async(_raw,captures)=>{if(captures.length===1)setTimeout(()=>{now+=90001;},0);}});await assert.rejects(f.execute,/scenario-timeout/);assert.equal(f.captures.length,1);const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(partial.error,/scenario-timeout/);assert.equal(partial.archive.end,s.sampleRate/10);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);}finally{Date.now=originalNow;}
});


test('v3 applied headroom reader binds the first post-window receipt and never salvages a later value',async()=>{
  const m=await load(),f=fixture({headroomWitness:true}),target=m.selectNormalizerTarget(f.facts,f.before,f.request,f.spec,true),end=f.measurement.frame+f.spec.seconds*rate;
  const r=m.assessRenderHeadroom(f.facts.oracleEvidence,target,Array(8).fill(0),rate,end);assert.equal(r.passed,true);assert.equal(r.expectedDb,0);assert.equal(r.native3Witness,'UNASSESSED');assert.equal(r.overallQualification,false);
  for(const fault of ['missing','null','scalar','eq','seq','epoch','span']){
    const e=clone(f.facts.oracleEvidence),row=e.ledger.events.find(e=>e.packet.kind==='meter-accepted'&&e.packet.frame>=end);
    if(fault==='missing')e.ledger.events.splice(e.ledger.events.indexOf(row),1);else if(fault==='null')row.packet.renderHeadroom=null;else if(fault==='scalar')row.packet.renderHeadroom.headroom=10**(-.011/20);else if(fault==='eq')row.packet.renderHeadroom.eq[0]=6;else if(fault==='seq')row.packet.renderHeadroom.commandSeq=1;else if(fault==='epoch')row.packet.renderHeadroom.sourceEpoch=2;else row.packet.renderHeadroom.endFrame++;
    e.ledger.events.forEach((e,i)=>e.order=i+1);e.ledger.eventCount=e.ledger.events.length;e.ledger.bytes=Buffer.byteLength(JSON.stringify(e.ledger))+2048;
    assert.equal(m.assessRenderHeadroom(e,target,Array(8).fill(0),rate,end).passed,false,fault);
  }
});

test('v3 N diagnostics retain old application semantics while v2 rejects the new sibling',async()=>{
  const m=await load(),f=fixture({headroomWitness:true}),target=m.selectNormalizerTarget(f.facts,f.before,f.request,f.spec,true),proof={spec:f.spec,beforeTarget:f.before,request:f.request,target,measurement:f.measurement,headroomWitness:true};
  assert.equal(m.assessPackagedNormalizer(f.archive,f.facts,proof,f.spec,true).passed,true);
  const old=clone(f.facts.oracleEvidence);old.schema='f01-oracle-evidence-v2';old.ledger.schema='f01-control-ledger-v2';delete old.initial.headroomWitness;
  const source=f.archive.window(rate,2*rate,1),control=f.archive.window(rate,2*rate,2),program=f.archive.window(rate,2*rate),observation={...f.facts.productObservation,hidden:false,contextState:'running'};
  assert.equal(m.compareL1Normalizer({schema:'f01-l1-normalizer-input-v2',sampleRate:rate,evidence:old,source,control,program,observation}).status,'UNAVAILABLE');
});


test('headroom CLI is explicit N-only and connected through stored PCM replay',async()=>{
  const {parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  assert.equal(parseProductAudioArgs(['--run-id=Unit','--case='+spec.id,'--headroom-witness']).headroomWitness,true);
  for(const args of [[],['--case=44100/output-control/wet-peak'],['--case=44100/transition/250'],['--case=44100/band/63/-6'],['--case='+spec.id,'--component-witness']])assert.throws(()=>parseProductAudioArgs(['--run-id=Unit',...args,'--headroom-witness']),/audio-product-args/);
  const f=scenarioFixture(null,spec,{headroomWitness:true}),r=(await wrapper(f)).audioProduct;
  assert.equal(r.schema,'f01-product-normalizer-headroom-observation-v1');assert.equal(r.normalizer.headroom.passed,true);assert.equal(r.normalizer.headroom.expectedDb,0);assert.equal(r.normalizer.headroom.native3Witness,'UNASSESSED');assert.equal(r.normalizer.overallQualification,false);
  const proof=JSON.parse(f.saved.get(f.directory+'/normalizer-target.json'));assert.equal(proof.headroomWitness,true);assert.equal(proof.measurement.frame,f.fixture.measurement.frame);assert.equal(r.normalizer.controlCoverage.frames,rate*15);assert.equal(r.archive.bytes,(r.archive.end-r.archive.start)*36);
});

test('headroom stored replay refuses v2 segment substitution even with updated artifact hashes',async()=>{
  const {createHash}=require('node:crypto'),f=scenarioFixture(null,spec,{headroomWitness:true});
  await assert.rejects(()=>wrapper(f,async()=>{const r=await f.execute(),report=r.audioProduct,row=report.archive.artifacts.find(x=>x.kind==='metadata'),raw=JSON.parse(f.saved.get(row.file));raw.oracleEvidence.schema='f01-oracle-evidence-v2';const b=Buffer.from(JSON.stringify(raw));f.saved.set(row.file,b);row.bytes=b.length;row.sha256=createHash('sha256').update(b).digest('hex');f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));return r;}),e=>e.error?.message==='audio-product-normalizer-headroom-ledger-prefix');
});


test('headroom first null receipt is fatal even when the next receipt is valid',async()=>{
  const m=await load(),f=fixture({headroomWitness:true}),target=m.selectNormalizerTarget(f.facts,f.before,f.request,f.spec,true),end=f.measurement.frame+f.spec.seconds*rate,e=f.facts.oracleEvidence,first=e.ledger.events.find(x=>x.packet.kind==='meter-accepted'&&x.packet.frame>=end),later=clone(first.packet),lastSend=clone(e.ledger.events.at(-2).packet);
  later.seq++;later.frame+=rate/10;later.application.meterSeq=later.seq;later.application.frame=later.frame;later.application.start+=.1;later.application.end+=.1;later.renderHeadroom.startFrame=later.frame;later.renderHeadroom.endFrame=later.frame+128;lastSend.meterSeq=later.seq;lastSend.observedTime=later.frame/rate;
  first.packet.renderHeadroom=null;e.ledger.events.push({direction:'send',packet:lastSend},{direction:'receive',packet:later});reseal(f);
  const r=m.assessRenderHeadroom(e,target,Array(8).fill(0),rate,end);assert.equal(r.status,'UNAVAILABLE');assert.equal(r.reason,'headroom-first-receipt');
});

test('headroom option is fixed before asynchronous preparation and malformed flags never launch',async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs');let calls=0;
  await assert.rejects(()=>runProductAudio({runId:'Unit',caseId:spec.id,headroomWitness:'yes'},{execute:async()=>{calls++;}}),/headroom-profile/);assert.equal(calls,0);
  const f=scenarioFixture(null,spec,{headroomWitness:true}),options={runId:'NormalizerUnit',caseId:spec.id,headroomWitness:true},source={sourceSha256:'unit'},path=require('node:path');
  const r=await runProductAudio(options,{platform:'win32',files:f.files,attest:async()=>{options.headroomWitness=false;return source;},verifyCandidate:async()=>({root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']}),execute:async o=>{await o.dependencies.verifyCandidate('NormalizerUnit',process.cwd(),{retainEvidence:true});const r=await o.dependencies.mediaScenario(f.input);await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('unit trace'),{flag:'wx'});return {...r,ok:true,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},source,after:source};}});
  assert.equal(r.audioProduct.schema,'f01-product-normalizer-headroom-observation-v1');assert.equal(r.audioProduct.normalizer.headroom.passed,true);
});


test('headroom failure preserves the actual first null receipt when later probe reads fail',async()=>{
  let read=false;const end=rate*15.1,f=scenarioFixture(null,spec,{headroomWitness:true,facts:(x,_captures,full)=>{
    if(read)throw Error('later-probe-read-failed');if(full&&x.productObservation.commonEnd>=end){const first=x.oracleEvidence.ledger.events.find(e=>e.packet.kind==='meter-accepted'&&e.packet.frame>=end);first.packet.renderHeadroom=null;read=true;}
  }});
  await assert.rejects(f.execute,/headroom-first-receipt/);const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));
  assert.equal(partial.facts.oracleEvidence.ledger.events.find(e=>e.packet.kind==='meter-accepted'&&e.packet.frame>=end).packet.renderHeadroom,null);assert.ok(partial.secondary.some(x=>x.includes('later-probe-read-failed')));assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});


test('extreme has only the original three fixed cases and rejects calibration or borrowed selectors',async()=>{
  const m=await import('../scripts/extension-e2e/audio-product.mjs');assert.equal(m.PRODUCT_EXTREME_CASES.length,3);
  for(const rate of [44100,48000,96000]){const spec=m.selectProductCase(rate+'/output-control/extreme');assert.deepEqual(spec,{id:rate+'/output-control/extreme',sampleRate:rate,frequency:1000,inputDbfs:-6,pattern:'stereo',gain:2});assert.ok(Object.isFrozen(spec));assert.equal(m.parseProductAudioArgs(['--run-id=ExtremeUnit','--case='+spec.id]).caseId,spec.id);
    for(const flag of ['--headroom-witness','--component-witness','--sample-rate='+(rate===44100?48000:44100)])assert.throws(()=>m.parseProductAudioArgs(['--run-id=ExtremeUnit','--case='+spec.id,flag]));
    await assert.rejects(()=>m.runProductAudioScenario({},null,null,rate,{...spec,gain:1}),/original-spec/);
  }
});


function literalFftRouting(){
  return {schema:'f01-fft-routing-v1',reason:null,version:19,endVersion:19,calls:10,
    nodes:['l1','compressor','delay','gain','gain','gain','splitter','analyser','analyser'].map((kind,i)=>({id:i+1,kind,channels:kind==='splitter'?2:null,sourceEpoch:kind==='l1'?1:null})),
    edges:[[1,2,0],[1,3,0],[2,4,0],[3,5,0],[4,6,0],[5,6,0],[6,7,0],[7,8,0],[7,9,1]].map(([from,to,output])=>({from,to,output,input:0})),analyserIds:[8,9]};
}
async function extremeFixture(rate=48000){
  const m=await import('../scripts/extension-e2e/audio-product.mjs'),{equalizerResponseDb}=await import('../scripts/audio-processing-metrics.mjs'),path=require('node:path'),{buildSync}=require('esbuild');
  const module={exports:{}};new Function('module','exports',buildSync({entryPoints:['src/main/features/audio/transition.ts'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text)(module,module.exports);const k=module.exports,state=k.createTransition(rate,1,'raw',true,true),spec=m.selectProductCase(rate+'/output-control/extreme');
  const delay=rate===44100?264:rate*.006,baselineFrame=Math.ceil((Math.ceil(.03*rate+delay)+128)/128)*128,requestedTarget=baselineFrame+Math.round(rate*1.25),targetFrame=Math.ceil(requestedTarget/128)*128,max=Math.ceil(rate*13/128)*128,fft=2**Math.ceil(Math.log2(rate*.25));
  const packets=[{...command(1,false),dynamics:false},{...command(2,false),gain:2,dynamics:false},{...command(3,true),gain:2,eq:Array(8).fill(6),targetDbfs:-12}],at=[0,baselineFrame,targetFrame],commands=packets.map((message,i)=>({message,requestedFrame:i===2?requestedTarget:at[i]})),events=[],replies=[],reads=[],ticks=[],streams=[Array.from({length:2},()=>new Float32Array(max)),Array.from({length:2},()=>new Float32Array(max)),Array.from({length:5},()=>new Float32Array(max))];
  const add=(direction,packet,time)=>events.push({direction,packet:clone(packet),at:time}),accept=p=>{replies.push(clone(p));add('receive',p,p.frame);};accept(reply('prepared',0,0,0));
  const audio=[new Float32Array(128),new Float32Array(128)],control=Array.from({length:5},()=>new Float32Array(128)),expectedPower=10**((-6+equalizerResponseDb(Array(8).fill(6),rate,1000)-48)/10),fftValues=Float32Array.from({length:fft},(_,n)=>Math.sqrt(2*expectedPower)*Math.sin(2*Math.PI*1000*n/rate+.37)),power=fftValues.reduce((sum,v)=>sum+v*v,0)/fft;let meterStart=null,meterSeq=0;
  for(let frame=0;frame<max;frame+=128){
    const index=at.indexOf(frame);if(index>=0){add('send',packets[index],frame);accept(k.acceptCommand(state,packets[index],frame,0));}
    const metering=meterStart!==null&&frame>=Math.ceil((meterStart+meterSeq*rate/10)/128)*128;
    if(metering){const seq=++meterSeq,time=frame/rate,p={kind:'power',sourceEpoch:1,meterEpoch:state.meterEpoch,meterSeq:seq,observedTime:time,active:true,leftPower:power,rightPower:power,targetDbfs:-12};reads.push({index:0,time,power,size:fft,beforeTime:time},{index:1,time,power,size:fft,beforeTime:time});if(seq>1)ticks.push({ordinal:seq-1,startRead:2*(seq-1),endRead:2*seq,startTime:time,endTime:time});add('send',p,frame);k.acceptMeter(state,p);}
    const input=Float32Array.from({length:128},(_,n)=>Math.SQRT2*10**(-6/20)*Math.sin(2*Math.PI*1000*(frame+n)/rate+.37)),done=k.renderTransition(state,[input,input],frame,128,new Float32Array([0]),audio,control,metering);
    for(let n=0;n<128;n++){for(let c=0;c<2;c++){streams[1][c][frame+n]=input[n];streams[0][c][frame+n]=Math.max(-.98,Math.min(.98,audio[c][n]*control[2][n]*control[3][n]));}for(let c=0;c<5;c++)streams[2][c][frame+n]=control[c][n];}
    if(metering)add('receive',{...reply('meter-accepted',meterSeq,frame,state.meterEpoch),code:state.normStatus,application:state.normalizerApplication,renderHeadroom:state.renderHeadroom},frame);
    if(done){accept(done);if(done.seq===3)meterStart=frame+128;}
  }
  const completedFrame=replies.find(p=>p.kind==='completed'&&p.seq===3).frame,eligibleFrame=completedFrame+fft+delay+128,leftIndex=reads.findIndex((r,i)=>i%2===0&&Math.round(r.beforeTime*rate)>=eligibleFrame),fftBytes=Buffer.alloc(fft*8);for(let i=0;i<fft;i++){fftBytes.writeFloatLE(fftValues[i],i*4);fftBytes.writeFloatLE(fftValues[i],(fft+i)*4);}const fftWitness={schema:'f01-fft-buffer-witness-v2',routing:literalFftRouting(),status:'CAPTURED',reason:null,selection:{sourceEpoch:1,commandSeq:3,meterEpoch:2,completedFrame,eligibleFrame,firstReadOrdinal:leftIndex+1,pairSeq:leftIndex/2+1},reads:reads.slice(leftIndex,leftIndex+2).map((r,i)=>({ordinal:leftIndex+i+1,index:i,beforeTime:r.beforeTime,time:r.time,size:fft})),bytes:fftBytes.length,encoding:'float32le'};
  let position=0,wall=0,on=false,posted=0,captured=false;const saved=new Map(),calls=[],io=[],directory='output/playwright/installed-extension-NormalizerUnit',bytes=Buffer.from('extreme unit module');
  const initial={available:true,reason:null,sourceEpoch:1,initial:'raw',normalizerWitness:true,headroomWitness:true};
  const facts=full=>{
    const live=events.filter(e=>e.at<=position),retained=live.filter(e=>e.packet.kind==='prepared'||e.packet.kind==='configure'?e.packet.kind!=='configure'||e.packet.seq<=posted:e.packet.kind==='accepted'||e.packet.kind==='completed'?e.packet.seq<=posted:posted===3).map(({at,...e},i)=>({...clone(e),order:i+1})),lifecycle=replies.filter(p=>p.kind==='prepared'?posted>0:p.seq<=posted&&p.frame<=position),currentCommands=commands.slice(0,posted),powerReads=posted===3?reads.filter(p=>p.time<=position/rate):[],meterTickReads=ticks.slice(0,Math.max(0,powerReads.length/2-1)),ledger={schema:'f01-control-ledger-v3',available:true,reason:null,eventCount:retained.length,maxEvents:4128,bytes:0,maxBytes:1048576,...(full?{events:retained}:{})};ledger.bytes=Buffer.byteLength(JSON.stringify({...ledger,events:retained}))+2048;
    return {fftBufferWitness:posted===3&&position>=fftWitness.reads[1].time*rate?clone(fftWitness):{schema:'f01-fft-buffer-witness-v2',routing:null,status:'NOT_SELECTED',reason:null,selection:null,reads:[],bytes:0,encoding:'float32le'},sampleRate:rate,audioTime:position/rate,hidden:false,contextState:'running',sources:on?1:0,filters:0,compressors:on?1:0,compressorParameters:on?[{threshold:0,knee:0,ratio:1}]:[],gains:[1,0,0,1,posted===3?0:1,posted===3?1:0,1,0],analysers:posted===3?2:0,buffers:posted===3?2:0,fftSizes:posted===3?[fft,fft]:[],active100msTimers:posted===3?1:0,powerReads,reads:powerReads.length,meterTickReads,events:[],linearEvents:[],steps:[],normalizerSettings:{normalizerEnabled:posted===3,normalizerTargetDbfs:posted===3?-12:-20,eqEnabled:posted===3,compressorEnabled:posted===3},normalizerMeasurement:null,
      oracleEvidence:{schema:'f01-oracle-evidence-v3',initial:clone(initial),ledger},signal:{frequency:1000,inputDbfs:-6,pattern:'stereo',phase:.37,channels:2,durationSeconds:90,frames:90*rate,loop:false,error:''},video:{muted:false,volume:1,loop:false,ended:false,paused:false,playbackRate:1,currentTime:position/rate},readback:{state:on?'on':'off',sources:on?1:0,wanted:on,gain:posted>=2?2:1,appliedGain:on?posted>=2?2:1:null},productObservation:{sources:on?1:0,l1Nodes:on?1:0,commonStart:on?0:Infinity,commonEnd:on?Math.floor(position/128)*128:0,invalidFrames:0,streamError:'',commands:clone(currentCommands),replies:clone(lifecycle),moduleLoads:['chrome-extension://actual/web/audio-transition-worklet.js'],meterDiagnostics:{sent:powerReads.length/2,received:powerReads.length/2,lastFrame:powerReads.at(-1)?.time*rate??null}}};
  };
  const window=(start,end,stream=0)=>({rate,start,end,channels:streams[stream].map(c=>c.slice(start,end))});
  const files={root:process.cwd(),saved,readdir:async p=>[{name:p==='dist'?'web':'audio-transition-worklet.js',isDirectory:()=>p==='dist',isFile:()=>p==='dist/web',isSymbolicLink:()=>false}],ensureDirectory:async()=>{},lstat:async f=>saved.has(f)?{isFile:()=>true,size:saved.get(f).length}:null,readFile:async(f,encoding)=>{const b=saved.get(f)??(f.endsWith('audio-transition-worklet.js')?bytes:f.startsWith('tests/')?Buffer.from('<html></html>'):null);if(!b)throw Error('missing '+f);return encoding?b.toString(encoding):b;},writeFile:async(f,b,options)=>{io.push('write:'+f);assert.equal(options.flag,'wx');assert.equal(saved.has(f),false);saved.set(f,Buffer.from(b));}};
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{position=baselineFrame;},waitForTimeout:async ms=>{wall+=ms;position+=Math.round(ms*rate/1000);assert.ok(position<max);},locator:()=>({click:async()=>{on=true;posted=1;}}),evaluate:async(fn,arg)=>{
    if(fn.name==='installProcessingProbe'){assert.deepEqual(arg,{sampleRate:rate,productObservation:true,oracleEvidence:true,normalizerWitness:true,headroomWitness:true,fftBufferWitness:true});return;}
    calls.push(clone(arg));io.push(arg.kind);
    if(arg.kind==='signal'){assert.equal(arg.inputDbfs,-6);assert.equal(arg.pattern,'stereo');return;}
    if(arg.kind==='configure'){if(!on)return {status:'off',frame:0};const n=posted++;assert.equal(arg.gain,2);assert.equal(arg.config.compressorThreshold,0);assert.equal(arg.config.compressorKnee,0);assert.equal(arg.config.compressorRatio,1);assert.equal(arg.config.normalizerEnabled,n===2);assert.equal(arg.config.compressorEnabled,n===2);if(n===2)assert.equal(arg.config.normalizerTargetDbfs,-12);return {status:'on',frame:position};}
    if(arg.kind==='video')return;if(arg.kind==='fft-buffer')return {...clone(fftWitness),base64:fftBytes.toString('base64')};if(arg.kind==='facts')return facts(arg.fullOracle===true);
    if(arg.kind==='capture'){assert.equal(captured,false);captured=true;const end=Math.floor(position/128)*128;return {...window(end-rate,end),channels:window(end-rate,end).channels.map(c=>Array.from(c))};}
    if(arg.kind==='product-capture'){const {startFrame:start,endFrame:end}=arg,x=facts(false);return {schema:'f01-product-window-v1',sampleRate:rate,start,end,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',commands:x.productObservation.commands,replies:x.productObservation.replies,oracleEvidence:x.oracleEvidence,streams:[2,2,5].map((count,i)=>{const b=Buffer.alloc((end-start)*count*4),w=window(start,end,i);for(let n=0;n<end-start;n++)for(let c=0;c<count;c++)b.writeFloatLE(w.channels[c][n],(n*count+c)*4);return {start,end,channels:count,encoding:'interleaved-float32le',base64:b.toString('base64')};})};}
    if(arg.kind==='l1-partial')return {streams:[],oracleEvidence:facts(true).oracleEvidence};throw Error('unexpected '+arg.kind);
  }};
  const input={context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async(_fn,arg)=>typeof arg==='string'?Array.from(bytes):undefined},extensionId:'actual',artifactPath:path.join(files.root,directory)};
  const execute=async()=>{const descriptor=Object.getOwnPropertyDescriptor(performance,'now');Object.defineProperty(performance,'now',{configurable:true,value:()=>wall});try{return await m.runProductAudioScenario(input,files,{dist:path.join(files.root,'dist')},rate,spec);}finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}};
  return {spec,files,saved,directory,input,execute,calls,io,streams,window,facts,fftBytes,fftWitness,setPosition:n=>position=n};
}

for(const sampleRate of [44100,48000,96000])test('original extreme composite capture facts plan and stored replay '+sampleRate,async()=>{
  const f=await extremeFixture(sampleRate),r=(await wrapper(f,()=>f.execute())).audioProduct,proof=JSON.parse(f.saved.get(f.directory+'/extreme-target.json'));
  assert.equal(r.schema,'f01-product-extreme-observation-v3');assert.equal(r.extreme.passed,true);assert.equal(r.extreme.headroom.expectedDb,-48);assert.ok(Math.abs(r.extreme.normalizer.scalarDb-6)<.1);assert.equal(proof.beforeTarget.normalizerSettings.compressorEnabled,false);assert.equal(proof.beforeTarget.productObservation.commands[1].message.dynamics,false);assert.equal(proof.settling.milliseconds,9500);assert.equal(proof.measurement.end-proof.measurement.start,sampleRate);assert.equal(r.overallQualification,false);assert.equal(r.native7Witness,'UNASSESSED');
  const at=f.io.indexOf('capture');assert.equal(f.io[at+1],'facts');assert.ok(f.io.slice(at+2).some(x=>x.endsWith('extreme-capture.f32le')));assert.equal(f.calls.filter(x=>x.kind==='capture').length,1);assert.equal(r.archive.profile,'extreme');assert.equal(r.archive.reservedBytes,sampleRate*8+2*f.fftBytes.length);
});


test('extreme fixed input scalar time FFT plan and original numeric gates reject donors',async()=>{
  const m=await import('../scripts/extension-e2e/audio-product.mjs'),f=await extremeFixture(),report=(await f.execute()).audioProduct,proof=JSON.parse(f.saved.get(f.directory+'/extreme-target.json')),archive={summary:()=>report.archive,window:f.window};
  for(const fault of ['settling','query-time','query-frame','query-ledger','gain','EQ','target','compressor','epoch','v2','headroom-null','headroom-value','source','N-scalar','ceiling','outside-peak']){
    const p=clone(proof),facts=clone(report.facts);let undo=()=>{};
    if(fault==='settling')p.settling.end=p.settling.start+9499;if(fault==='query-time')p.captureAfter.audioTime=(p.measurement.end-1)/48000;if(fault==='query-frame')p.scalarQuery.frame++;if(fault==='query-ledger')p.captureAfter.oracleEvidence.ledger.events[1].packet.gain=0;
    if(fault==='gain')facts.productObservation.commands[2].message.gain=1;if(fault==='EQ')facts.productObservation.commands[2].message.eq[0]=0;if(fault==='target')facts.normalizerSettings.normalizerTargetDbfs=-20;if(fault==='compressor')facts.compressorParameters[0].ratio=2;if(fault==='epoch')facts.productObservation.commands[2].message.sourceEpoch=2;if(fault==='v2')facts.oracleEvidence.schema='f01-oracle-evidence-v2';
    const first=facts.oracleEvidence.ledger.events.find(e=>e.packet.kind==='meter-accepted'&&e.packet.frame>=p.scalarQuery.frame);
    if(fault==='headroom-null')first.packet.renderHeadroom=null;if(fault==='headroom-value')first.packet.renderHeadroom.headroom*=10**(.011/20);
    if(['source','N-scalar','ceiling','outside-peak'].includes(fault)){const stream=fault==='source'?1:fault==='N-scalar'?2:0,channel=fault==='N-scalar'?3:0,start=fault==='N-scalar'?p.scalarQuery.frame:fault==='outside-peak'?0:p.measurement.start,end=fault==='source'?start+4800:start+1,copy=f.streams[stream][channel].slice(start,end);f.streams[stream][channel].fill(fault==='source'?0:fault==='N-scalar'?10**(5.89/20):.99,start,end);undo=()=>f.streams[stream][channel].set(copy,start);}
    if(fault==='ceiling'){const {summarizeCapture}=await import('../scripts/audio-signal.mjs'),w=f.window(p.measurement.start,p.measurement.end),bytes=Buffer.alloc(48000*8);for(let n=0;n<48000;n++)for(let c=0;c<2;c++)bytes.writeFloatLE(w.channels[c][n],n*8+c*4);p.capture.sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');p.measurement.summary=JSON.parse(JSON.stringify(summarizeCapture(w)));}
    try{let result;try{result=m.assessProductExtreme(archive,facts,p,f.spec,f.fftBytes);}catch(e){assert.notEqual(fault,'outside-peak');assert.match(e.message,/extreme/);continue;}assert.equal(result.passed,fault==='outside-peak',fault);}finally{undo();}
  }
});

test('extreme FFT uses compMix and cannot borrow the raw source power',async()=>{
  const m=await import('../scripts/extension-e2e/audio-product.mjs'),f=await extremeFixture(),report=(await f.execute()).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/extreme-target.json')),facts=clone(report.facts),bad=10**(-6/10);
  for(const r of facts.powerReads)r.power=bad;for(const e of facts.oracleEvidence.ledger.events)if(e.packet.kind==='power')e.packet.leftPower=e.packet.rightPower=bad;
  const {assessExtremeNormalizer}=await load(),command=facts.productObservation.commands[2],target={command,accepted:facts.productObservation.replies.find(x=>x.kind==='accepted'&&x.seq===command.message.seq),completed:facts.productObservation.replies.find(x=>x.kind==='completed'&&x.seq===command.message.seq)};
  assert.throws(()=>assessExtremeNormalizer({summary:()=>report.archive,window:f.window},facts,target,p.scalarQuery.frame,48000),/extreme-plan/);
});

for(const stage of ['query','write','capture','deadline'])test('extreme preserves '+stage+' failure and never recaptures',async()=>{
  const f=await extremeFixture(),page=await f.input.context.newPage(),evaluate=page.evaluate,write=f.files.writeFile,originalNow=Date.now;let captured=false,clock=originalNow(),captures=0;
  page.evaluate=async(fn,arg)=>{if(arg?.kind==='capture'){captures++;captured=true;if(stage==='capture')throw Error('extreme-capture-stop');}if(captured&&arg?.kind==='facts'&&stage==='query')throw Error('extreme-query-stop');const r=await evaluate(fn,arg);if(captured&&arg?.kind==='facts'&&stage==='deadline')clock+=90001;return r;};
  f.files.writeFile=async(file,...args)=>{if(file.endsWith('/extreme-capture.f32le')&&stage==='write')throw Error('extreme-write-stop');return write(file,...args);};
  if(stage==='deadline')Date.now=()=>clock;
  try{await assert.rejects(f.execute,/extreme-|scenario-timeout/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.ok(p.extreme);if(stage!=='capture'){assert.equal(Buffer.from(p.pendingCapture.base64,'base64').length,48000*8);assert.equal(p.extreme.measurement.end-p.extreme.measurement.start,48000);}if(stage==='write')assert.ok(p.extreme.captureAfter.oracleEvidence.ledger.events);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);assert.equal(captures,1);}finally{Date.now=originalNow;}
});

test('extreme capture facts query precedes any capture disk wait and seals its scalar frame',async()=>{
  const f=await extremeFixture(),write=f.files.writeFile;let queried=false;const page=await f.input.context.newPage(),evaluate=page.evaluate;page.evaluate=async(fn,arg)=>{if(arg?.kind==='facts'&&f.io.includes('capture'))queried=true;return evaluate(fn,arg);};
  f.files.writeFile=async(file,...args)=>{if(file.endsWith('/extreme-capture.f32le')){assert.equal(queried,true);f.setPosition(48000*12);}return write(file,...args);};
  const r=(await f.execute()).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/extreme-target.json'));assert.equal(p.scalarQuery.frame,Math.round(p.captureAfter.audioTime*48000));assert.ok(p.scalarQuery.frame<r.facts.audioTime*48000);assert.equal(r.extreme.normalizer.scalarFrame,p.scalarQuery.frame);
});


test('extreme stored replay rejects rehashed source, N, clock and v2 donors while preserving the original peak scope',async()=>{
  const f=await extremeFixture(),original=await f.execute(),base=[...f.saved].map(([k,v])=>[k,Buffer.from(v)]),crypto=require('node:crypto');
  for(const fault of ['source-tone','scalar-control','v2','clock','outside-peak']){
    f.saved.clear();for(const [k,v]of base)f.saved.set(k,Buffer.from(v));const result=clone(original),r=result.audioProduct,p=JSON.parse(f.saved.get(f.directory+'/extreme-target.json'));
    if(fault==='clock'){p.settling.end=p.settling.start+9499;f.saved.set(f.directory+'/extreme-target.json',Buffer.from(JSON.stringify(p)));}
    if(fault!=='clock'){
      const stream=fault==='source-tone'?1:fault==='scalar-control'?2:0,row=r.archive.artifacts.find(x=>x.file.endsWith(`stream-${stream}.f32le`)&&(fault==='scalar-control'?x.start<=p.scalarQuery.frame&&x.end>p.scalarQuery.frame:true)),b=Buffer.from(f.saved.get(row.file)),metadata=r.archive.artifacts.find(x=>x.kind==='metadata'&&x.start===row.start),raw=JSON.parse(f.saved.get(metadata.file));
      if(fault==='source-tone')for(let n=0;n<row.end-row.start;n++)for(let c=0;c<2;c++)b.writeFloatLE(Math.SQRT2*10**(-6/20)*Math.sin(2*Math.PI*1250*(row.start+n)/48000+.37),n*8+c*4);
      if(fault==='scalar-control')b.writeFloatLE(10**(5.89/20),(p.scalarQuery.frame-row.start)*20+12);if(fault==='outside-peak')b.writeFloatLE(.99,0);
      if(fault==='v2')raw.oracleEvidence.schema='f01-oracle-evidence-v2';
      f.saved.set(row.file,b);row.sha256=crypto.createHash('sha256').update(b).digest('hex');raw.streams[stream]=clone(row);const mb=Buffer.from(JSON.stringify(raw));f.saved.set(metadata.file,mb);metadata.bytes=mb.length;metadata.sha256=crypto.createHash('sha256').update(mb).digest('hex');
    }
    f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(r)));
    if(fault==='outside-peak')assert.equal((await wrapper(f,async()=>result)).audioProduct.passed,true);else await assert.rejects(()=>wrapper(f,async()=>result),/observation-failed/,fault);
  }
});


test('extreme pending append has a bounded STOP and late completion cannot manufacture archive success',async()=>{
  const f=await extremeFixture(),write=f.files.writeFile,timer=global.setTimeout;let release,started,settled=false,error;const held=new Promise(resolve=>release=resolve),began=new Promise(resolve=>started=resolve);
  f.files.writeFile=async(file,...args)=>{if(file.endsWith('/segment-0000-stream-0.f32le')){started();await held;}return write(file,...args);};
  global.setTimeout=(fn,ms,...args)=>timer(fn,ms===5000?10:ms,...args);
  try{const pending=f.execute().then(()=>settled=true,e=>{error=e;settled=true;});await began;await new Promise(resolve=>timer(resolve,50));const stopped=settled;release();await pending;assert.equal(stopped,true,'a pending disk write must not hold owned shutdown indefinitely');assert.match(error?.message??'',/append|timeout/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.archive.pendingWrites.length,1);assert.match(p.archive.pendingWrites[0].status,/unknown/);assert.equal(p.archive.sealed,true);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);}finally{release();global.setTimeout=timer;}
});


test('extreme compMix diagnostic does not introduce a raw-source precision gate',async()=>{
  const f=await extremeFixture(),r=(await f.execute()).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/extreme-target.json')),facts=clone(r.facts),factor=10**(.2/10),{assessExtremeNormalizer}=await load();
  for(const read of facts.powerReads)read.power*=factor;for(const e of facts.oracleEvidence.ledger.events)if(e.packet.kind==='power'){e.packet.leftPower*=factor;e.packet.rightPower*=factor;}
  const c=facts.productObservation.commands[2],target={command:c,accepted:facts.productObservation.replies.find(x=>x.kind==='accepted'&&x.seq===c.message.seq),completed:facts.productObservation.replies.find(x=>x.kind==='completed'&&x.seq===c.message.seq)};
  const result=assessExtremeNormalizer({summary:()=>r.archive,window:f.window},facts,target,p.scalarQuery.frame,48000);assert.equal(result.passed,true,'+.2dB versus RBJ cannot alone add a new extreme acceptance gate');assert.ok(Math.abs(result.power.maxErrorDb-Math.abs(10*Math.log10(facts.powerReads[0].power)-result.power.expectedPowerDbfs))<1e-9);assert.equal(result.power.physicalPowerEquality,'UNPROVEN');
  for(const read of facts.powerReads)read.power=0;for(const e of facts.oracleEvidence.ledger.events)if(e.packet.kind==='power')e.packet.leftPower=e.packet.rightPower=0;
  assert.throws(()=>assessExtremeNormalizer({summary:()=>r.archive,window:f.window},facts,target,p.scalarQuery.frame,48000),/extreme-power-positive/);
});


test('extreme permits a suspended context only in the source-free pre-ON snapshot',async()=>{
  const f=await extremeFixture(),page=await f.input.context.newPage(),evaluate=page.evaluate;
  page.evaluate=async(fn,arg)=>{const result=await evaluate(fn,arg);if(arg?.kind==='facts'&&result.sources===0)result.contextState='suspended';return result;};
  const r=(await f.execute()).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/extreme-target.json'));assert.equal(p.priming.before.contextState,'suspended');assert.equal(r.passed,true);
});


test('extreme saved FFT bytes are mandatory arithmetic evidence without closing physical power equality',async()=>{
  const f=await extremeFixture(),r=(await wrapper(f,()=>f.execute())).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/extreme-target.json'));
  assert.equal(r.extreme.fftBuffer.bufferPowerConsistency,'MATCHED');assert.equal(r.extreme.normalizer.power.physicalPowerEquality,'UNPROVEN');assert.equal(r.extreme.fftBuffer.postingStatus,'POSTED');assert.equal(p.fftBuffer.bytes,f.fftBytes.length);assert.deepEqual(f.saved.get(p.fftBuffer.file),f.fftBytes);assert.equal(r.extraEvidenceBytes,48000*8+f.fftBytes.length);
});


test('FFT raw arithmetic detects a forged power that the unchanged +6 plan clamp cannot detect',async()=>{
  const f=await extremeFixture(),r=(await f.execute()).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/extreme-target.json')),facts=clone(r.facts),{assessFftBufferWitness,assessExtremeNormalizer}=await load(),c=facts.productObservation.commands[2],target={command:c,accepted:facts.productObservation.replies.find(x=>x.kind==='accepted'&&x.seq===c.message.seq),completed:facts.productObservation.replies.find(x=>x.kind==='completed'&&x.seq===c.message.seq)},selection=f.fftWitness.selection;
  for(const read of facts.powerReads.slice(selection.firstReadOrdinal-1,selection.firstReadOrdinal+1))read.power*=1.001;for(const e of facts.oracleEvidence.ledger.events)if(e.packet.kind==='power'&&e.packet.meterSeq===selection.pairSeq){e.packet.leftPower*=1.001;e.packet.rightPower*=1.001;}
  assert.equal(assessExtremeNormalizer({summary:()=>r.archive,window:f.window},facts,target,p.scalarQuery.frame,48000).passed,true);
  const result=assessFftBufferWitness(f.fftBytes,f.fftWitness,facts,target,48000);assert.equal(result.bufferPowerConsistency,'MISMATCH');assert.equal(result.physicalPowerEquality,'UNPROVEN');
});

test('FFT first-pair identity and raw bytes reject timestamp epoch size and later-selection donors',async()=>{
  const f=await extremeFixture(),r=(await f.execute()).audioProduct,{assessFftBufferWitness}=await load(),c=r.facts.productObservation.commands[2],target={command:c,accepted:r.facts.productObservation.replies.find(x=>x.kind==='accepted'&&x.seq===c.message.seq),completed:r.facts.productObservation.replies.find(x=>x.kind==='completed'&&x.seq===c.message.seq)};
  for(const fault of ['raw','NaN','size','metadata-time','ordinal','epoch','command','erased-clock','unposted']){
    const bytes=Buffer.from(f.fftBytes),m=clone(f.fftWitness),facts=clone(r.facts);let actual=bytes;
    if(fault==='raw')bytes.writeFloatLE(.1,0);if(fault==='NaN')bytes.writeFloatLE(NaN,0);if(fault==='size')actual=bytes.subarray(4);if(fault==='metadata-time')m.reads[0].beforeTime+=.1;if(fault==='ordinal')m.selection.firstReadOrdinal+=2;if(fault==='epoch')m.selection.meterEpoch++;if(fault==='command')m.selection.commandSeq--;if(fault==='erased-clock')delete facts.powerReads[0].beforeTime;
    if(fault==='unposted'){const l=facts.oracleEvidence.ledger,seq=m.selection.pairSeq;l.events=l.events.filter(e=>!(e.packet.kind==='power'&&e.packet.meterSeq===seq||e.packet.kind==='meter-accepted'&&e.packet.seq===seq));l.events.forEach((e,i)=>e.order=i+1);l.eventCount=l.events.length;l.bytes=Buffer.byteLength(JSON.stringify(l))+2048;}
    facts.fftBufferWitness=clone(m);const result=assessFftBufferWitness(actual,m,facts,target,48000);assert.equal(result.passed,fault==='unposted',fault);if(fault==='unposted'){assert.equal(result.postingStatus,'UNPOSTED');assert.equal(result.firstReadOrdinal,m.selection.firstReadOrdinal);}assert.equal(result.physicalPowerEquality,'UNPROVEN');
  }
});

for(const at of ['fft-write','after-fft-write','fft-fetch'])test('FFT raw failure evidence is bounded and never duplicated into ring partial '+at,async()=>{
  const f=await extremeFixture(),write=f.files.writeFile,page=await f.input.context.newPage(),evaluate=page.evaluate;let fetched=0;
  page.evaluate=async(fn,arg)=>{if(arg?.kind==='fft-buffer'){fetched++;if(at==='fft-fetch')throw Error('fft-fetch-stop');}return evaluate(fn,arg);};
  f.files.writeFile=async(file,...args)=>{if(at==='fft-write'&&file.endsWith('extreme-fft-buffer.f32le')||at==='after-fft-write'&&file.endsWith('extreme-capture.f32le'))throw Error(at+'-stop');return write(file,...args);};
  await assert.rejects(f.execute,/fft/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));if(at!=='fft-fetch'){assert.equal(p.fftFailureEvidence.bytes,f.fftBytes.length);assert.equal(p.extraEvidenceBytes,48000*8+f.fftBytes.length);assert.equal(Buffer.from(p.fftFailureEvidence.base64,'base64').length,f.fftBytes.length);assert.equal(p.archive.reservedBytes,48000*8+2*f.fftBytes.length);}else assert.equal(p.fftFailureEvidence,undefined);
  const rings=JSON.parse(f.saved.get(f.directory+'/product-partial.json'));assert.equal(JSON.stringify(rings).includes('fftFailureEvidence'),false);assert.equal(fetched,at==='fft-fetch'?2:1);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});


test('FFT lost fetch response recovers the same first snapshot once and preserves the primary failure',async()=>{
  const f=await extremeFixture(),page=await f.input.context.newPage(),evaluate=page.evaluate;let calls=0;
  page.evaluate=async(fn,arg)=>{const result=await evaluate(fn,arg);if(arg?.kind==='fft-buffer'&&++calls===1)throw Error('fft-first-response-lost');return result;};
  await assert.rejects(f.execute,/fft-first-response-lost/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.deepEqual(Buffer.from(p.fftFailureEvidence.base64,'base64'),f.fftBytes);assert.equal(calls,2);assert.equal(p.extreme.captureAfter.fftBufferWitness.selection.firstReadOrdinal,f.fftWitness.selection.firstReadOrdinal);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});


test('FFT fallback keeps the raw pair metadata when later rings and facts are unavailable',async()=>{
  const f=await extremeFixture(),page=await f.input.context.newPage(),evaluate=page.evaluate;let captured=false;
  page.evaluate=async(fn,arg)=>{if(arg?.kind==='capture')captured=true;if(captured&&['facts','l1-partial'].includes(arg?.kind))throw Error('post-capture-reader-unavailable');return evaluate(fn,arg);};
  await assert.rejects(f.execute,/post-capture-reader-unavailable/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.facts,null);assert.deepEqual(p.fftFailureEvidence.metadata,f.fftWitness);assert.deepEqual(Buffer.from(p.fftFailureEvidence.base64,'base64'),f.fftBytes);
});


test('saved FFT sidecar cannot be rehashed into a PASS or downgraded to the old method',async()=>{
  const f=await extremeFixture(),original=await f.execute(),base=[...f.saved].map(([k,v])=>[k,Buffer.from(v)]),sha=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
  for(const fault of ['rehashed-raw','missing','size','v1','old-reserve','later-pair']){
    f.saved.clear();for(const [k,v]of base)f.saved.set(k,Buffer.from(v));const result=clone(original),r=result.audioProduct,p=JSON.parse(f.saved.get(f.directory+'/extreme-target.json'));
    if(fault==='rehashed-raw'){const b=Buffer.from(f.saved.get(p.fftBuffer.file));b.writeFloatLE(.1,0);f.saved.set(p.fftBuffer.file,b);p.fftBuffer.sha256=sha(b);}if(fault==='missing')f.saved.delete(p.fftBuffer.file);if(fault==='size'){const b=f.saved.get(p.fftBuffer.file).subarray(4);f.saved.set(p.fftBuffer.file,b);p.fftBuffer.sha256=sha(b);p.fftBuffer.bytes=b.length;}if(fault==='v1')r.schema='f01-product-extreme-observation-v1';if(fault==='old-reserve')r.archive.reservedBytes=48000*8;
    if(fault==='later-pair'){p.fftBuffer.metadata.selection.firstReadOrdinal+=2;p.fftBuffer.metadata.selection.pairSeq++;r.facts.fftBufferWitness=clone(p.fftBuffer.metadata);p.captureAfter.fftBufferWitness=clone(p.fftBuffer.metadata);}
    f.saved.set(f.directory+'/extreme-target.json',Buffer.from(JSON.stringify(p)));f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(r)));await assert.rejects(()=>wrapper(f,async()=>result),/observation-failed/,fault);
  }
});

test('FFT budget reserves a sidecar and one failure raw copy before the first PCM append',async()=>{
  const {createProductArchive}=await import('../scripts/extension-e2e/audio-product.mjs'),rate=44100,fft=16384,reserve=rate*8+2*2*fft*4,a=createProductArchive({writeFile:async()=>{}},'fft-budget',rate,'extreme');assert.equal(a.summary().reservedBytes,reserve);
  const raw=(start,end)=>({schema:'f01-product-window-v1',sampleRate:rate,start,end,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',streams:[2,2,5].map(channels=>({start,end,channels,encoding:'interleaved-float32le',base64:Buffer.alloc((end-start)*channels*4).toString('base64')}))});
  let end=0;for(;;){const size=Math.min(rate,Math.floor((96*1024*1024-reserve-a.summary().bytes)/36));if(size===0)break;await a.append(raw(end,end+size));end+=size;}await assert.rejects(()=>a.append(raw(end,end+1)),/archive-cap/);assert.ok(a.summary().bytes+reserve<=96*1024*1024);
});

test('FFT pending sidecar write stays unknown after STOP and late completion cannot promote success',async()=>{
  const f=await extremeFixture(),write=f.files.writeFile,timer=global.setTimeout;let release,started;const held=new Promise(r=>release=r),began=new Promise(r=>started=r);
  f.files.writeFile=async(file,...args)=>{if(file.endsWith('extreme-fft-buffer.f32le')){started();await held;}return write(file,...args);};global.setTimeout=(fn,ms,...args)=>timer(fn,ms===5000?10:ms,...args);
  try{const pending=f.execute();const rejected=assert.rejects(pending,/fft-buffer-save|timeout/);await began;await rejected;const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(p.extreme.fftBuffer.writeStatus,/unknown/);assert.deepEqual(Buffer.from(p.fftFailureEvidence.base64,'base64'),f.fftBytes);assert.equal(p.archive.reservedBytes,48000*8+2*f.fftBytes.length);release();await new Promise(r=>timer(r,5));assert.equal(f.saved.has(f.directory+'/assessment.json'),false);assert.match(JSON.parse(f.saved.get(f.directory+'/partial.json')).extreme.fftBuffer.writeStatus,/unknown/);}finally{release();global.setTimeout=timer;}
});


test('FFT arithmetic alone cannot certify a buffer without observed compMix routing',async()=>{
  const f=await extremeFixture(),r=(await f.execute()).audioProduct,{assessFftBufferWitness}=await load(),c=r.facts.productObservation.commands[2],target={command:c,accepted:r.facts.productObservation.replies.find(x=>x.kind==='accepted'&&x.seq===c.message.seq),completed:r.facts.productObservation.replies.find(x=>x.kind==='completed'&&x.seq===c.message.seq)},metadata=clone(f.fftWitness),facts=clone(r.facts);
  delete metadata.routing;facts.fftBufferWitness=clone(metadata);
  const result=assessFftBufferWitness(f.fftBytes,metadata,facts,target,48000);
  assert.equal(result.passed,false,'matching raw power without observed routing must fail closed');
});


test('FFT route proof rejects wrong taps ports added feeds graph mutations and old method donors',async()=>{
  const f=await extremeFixture(),r=(await f.execute()).audioProduct,{assessFftBufferWitness}=await load(),c=r.facts.productObservation.commands[2],target={command:c,accepted:r.facts.productObservation.replies.find(x=>x.kind==='accepted'&&x.seq===c.message.seq),completed:r.facts.productObservation.replies.find(x=>x.kind==='completed'&&x.seq===c.message.seq)};
  assert.equal(r.extreme.fftBuffer.routingConsistency,'MATCHED');assert.deepEqual(r.extreme.fftBuffer.routing,{l1Id:1,compMixId:6,splitterId:7,analyserIds:[8,9]});
  for(const fault of ['quiet-tap','swap','port','extra-feed','epoch','kind','same-gain','duplicate','disconnect','mutation','native-error','cap','old-method',...Array.from({length:8},(_,i)=>'extra-'+(i+2))]){
    const m=clone(f.fftWitness),g=m.routing,facts=clone(r.facts);
    if(fault==='quiet-tap')g.edges.find(e=>e.to===7).from=4;if(fault==='swap')g.analyserIds.reverse();if(fault==='port')g.edges.find(e=>e.to===9).output=0;
    if(fault==='extra-feed')g.edges.push({from:3,to:6,output:0,input:0});if(fault.startsWith('extra-')&&/^extra-[0-9]+$/.test(fault))g.edges.push({from:3,to:Number(fault.slice(6)),output:0,input:0});if(fault==='epoch')g.nodes[0].sourceEpoch=2;if(fault==='kind')g.nodes[1].kind='gain';
    if(fault==='same-gain')g.edges.find(e=>e.from===5&&e.to===6).from=4;if(fault==='duplicate')g.edges.push(clone(g.edges[0]));if(fault==='disconnect')g.edges=g.edges.filter(e=>e.to!==8);
    if(fault==='mutation')g.endVersion++;if(fault==='native-error')g.reason='native-connect';if(fault==='cap')g.calls=257;if(fault==='old-method'){m.schema='f01-fft-buffer-witness-v1';delete m.routing;}
    facts.fftBufferWitness=clone(m);const result=assessFftBufferWitness(f.fftBytes,m,facts,target,48000);assert.equal(result.passed,false,fault);assert.equal(result.routingConsistency,'UNAVAILABLE',fault);assert.equal(result.physicalPowerEquality,'UNPROVEN',fault);
  }
});

test('saved FFT route cannot be rehashed or downgraded into the current method',async()=>{
  const f=await extremeFixture(),original=await f.execute(),base=[...f.saved].map(([k,v])=>[k,Buffer.from(v)]);
  for(const fault of ['extra-feed','wrong-tap','raw-only-v2']){
    f.saved.clear();for(const [k,v]of base)f.saved.set(k,Buffer.from(v));const result=clone(original),r=result.audioProduct,p=JSON.parse(f.saved.get(f.directory+'/extreme-target.json'));
    if(fault==='raw-only-v2')r.schema='f01-product-extreme-observation-v2';else{
      const g=p.fftBuffer.metadata.routing;if(fault==='wrong-tap')g.edges.find(e=>e.to===7).from=4;else g.edges.push({from:3,to:6,output:0,input:0});
      r.facts.fftBufferWitness=clone(p.fftBuffer.metadata);p.captureAfter.fftBufferWitness=clone(p.fftBuffer.metadata);
    }
    f.saved.set(f.directory+'/extreme-target.json',Buffer.from(JSON.stringify(p)));f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(r)));await assert.rejects(()=>wrapper(f,async()=>result),/observation-failed/,fault);
  }
});


test('first routing failure stops collection and retains the fixed raw pair and its metadata',async()=>{
  const f=await extremeFixture();f.fftWitness.routing.reason='native-connect';
  await assert.rejects(()=>f.execute(),/fft-routing-unavailable/);
  const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.deepEqual(Buffer.from(p.fftFailureEvidence.base64,'base64'),f.fftBytes);assert.deepEqual(p.fftFailureEvidence.metadata.routing,f.fftWitness.routing);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
