const test=require('node:test');
const assert=require('node:assert/strict');
const clone=x=>JSON.parse(JSON.stringify(x));
const rate=44100,spec={id:'44100/reentry/2/10',sampleRate:rate,frequency:1000,inputDbfs:-36,pattern:'stereo',warmupMilliseconds:6500,startPhaseMs:2,milliseconds:10,afterMilliseconds:180,tailSeconds:.05};
const spec96={...spec,id:'96000/reentry/2/10',sampleRate:96000};
const retireSpec={...spec,id:'44100/reentry/0/41',startPhaseMs:0,milliseconds:41},unitySpec={...spec,id:'44100/reentry/0/46',startPhaseMs:0,milliseconds:46};
const spec36={...spec,id:'44100/reentry/0/36',startPhaseMs:0,milliseconds:36};
const spec00={...spec,id:'44100/reentry/0/0',startPhaseMs:0,milliseconds:0};
const spec010={...spec,id:'44100/reentry/0/10',startPhaseMs:0};
const spec015={...spec010,id:'44100/reentry/0/15',milliseconds:15};
const spec025={...spec010,id:'44100/reentry/0/25',milliseconds:25};
const spec20={...spec,id:'44100/reentry/2/0',milliseconds:0};
const spec15={...spec,id:'44100/reentry/2/15',milliseconds:15};
const spec25={...spec,id:'44100/reentry/2/25',milliseconds:25};
const spec50={...spec,id:'44100/reentry/5/0',startPhaseMs:5,milliseconds:0};
const spec510={...spec,id:'44100/reentry/5/10',startPhaseMs:5};
const spec515={...spec510,id:'44100/reentry/5/15',milliseconds:15};
const spec525={...spec510,id:'44100/reentry/5/25',milliseconds:25};
const load=()=>import('../scripts/extension-e2e/audio-reentry.mjs');
const {fixture,proof,command,reply}=require('./f01-public-audio-contract.test.cjs');

test('one original R3 case uses the shared fresh activation and independent full-prefix N without OFF completion',async()=>{
  const {PACKAGED_REENTRY_CASE,assessPackagedReentry}=await load(),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),f=fixture();assert.deepEqual(PACKAGED_REENTRY_CASE,spec);
  const p=proof(f,selectNormalizerTarget),r=assessPackagedReentry(f.archive,f.facts,p,spec);assert.equal(r.passed,true,JSON.stringify(r));assert.equal(r.phase.phase,'HOLD');assert.equal(r.phase.coverageChecked,false);assert.deepEqual(r.window,{rate,start:f.end-2205,end:f.end});assert.equal(r.native7Witness,'UNASSESSED');assert.equal(r.overallQualification,false);
});
test('R3 fixes both probe markers, first attempted stimulus and caller original spec',async()=>{
  const {assessPackagedReentry}=await load(),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs');
  for(const mutate of [p=>p.spec.milliseconds=15,p=>p.warmupMeasurement.frame+=128,p=>p.measurement.frame+=128,p=>p.boundary.on.wall+=1]){const f=fixture(),p=proof(f,selectNormalizerTarget);mutate(p);assert.throws(()=>assessPackagedReentry(f.archive,f.facts,p,spec),/reentry/);}
  const f=fixture(),p=proof(f,selectNormalizerTarget);f.facts.productObservation.rapidMasterRequest.error='first failure';assert.throws(()=>assessPackagedReentry(f.archive,f.facts,p,spec),/reentry/);
});
test('R3 retains original tail output tolerance and rejects source frequency transplant',async()=>{
  const {assessPackagedReentry}=await load(),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs');
  for(const [options,pass]of [[{programDb:.049},true],[{programDb:.051},false],[{frequency:1250},false]]){const f=fixture(options),r=assessPackagedReentry(f.archive,f.facts,proof(f,selectNormalizerTarget),spec);assert.equal(r.passed,pass,JSON.stringify(r));}
});
test('R3 refuses an ON read error even when a copied unity control could match error retirement',async()=>{
  const {assessPackagedReentry}=await load(),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),f=fixture(),p=proof(f,selectNormalizerTarget);f.facts.oracleEvidence.ledger.events.find(e=>e.direction==='send'&&e.packet.kind==='power').packet.active=false;
  assert.throws(()=>assessPackagedReentry(f.archive,f.facts,p,spec),/reentry/);
});
test('wall180ms without audio180ms cannot form the original tail window',async()=>{
  const {assessPackagedReentry}=await load(),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),f=fixture({caseSpec:spec015,acceptedDelta:768}),p=proof(f,selectNormalizerTarget);
  const m={...p.measurement,frame:f.end-2};p.measurement=m;f.facts.normalizerMeasurement=clone(m);f.facts.productObservation.rapidMasterRequest.measurement={...m,wall:p.boundary.onDone.wall+186.1};
  assert.throws(()=>assessPackagedReentry(f.archive,f.facts,p,spec015),/reentry-window-bound/);
});
test('ON cannot return before its actual accepted ACK even when the tail marker is late enough',async()=>{
  const {assessPackagedReentry}=await load(),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),f=fixture(),p=proof(f,selectNormalizerTarget);
  p.boundary.onDone.audio=(f.B-1)/rate;f.facts.productObservation.rapidMasterRequest.boundary=clone(p.boundary);
  assert.throws(()=>assessPackagedReentry(f.archive,f.facts,p,spec),/reentry-request-clocks/);
});
for(const zero of [true,false])test((zero?'zero FFT':'stale plans with valid FFT')+' cannot form a self-consistent unity R3 stimulus',async()=>{
  const {assessPackagedReentry}=await load(),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),f=fixture(),p=proof(f,selectNormalizerTarget),original=f.archive.window.bind(f.archive);
  if(zero)for(const r of f.facts.powerReads)r.power=0;
  for(const e of f.facts.oracleEvidence.ledger.events){const x=e.packet;if(x.kind==='power'){if(zero)x.leftPower=x.rightPower=0;x.observedTime=Math.max(0,x.observedTime-.25);}if(x.kind==='meter-accepted'){const a=x.application;a.fromDb=a.toDb=0;a.mode=x.frame<=8820?'warmup':'hold';a.end=a.start;x.code=a.mode;}}
  const l=f.facts.oracleEvidence.ledger;l.bytes=Buffer.byteLength(JSON.stringify(l))+256;
  f.archive.window=(a,z,stream=0)=>{const w=original(a,z,stream);if(stream===2)w.channels[3].fill(1);if(stream===0)for(const c of w.channels)for(let i=0;i<c.length;i++)c[i]/=10**(Math.min(6,Math.max(0,(a+i)/rate-.5))/20);return w;};
  assert.throws(()=>assessPackagedReentry(f.archive,f.facts,p,spec),/reentry-(?:fft-source|nonunity-precondition)/);
});
test('R3 diagnoses wrong N and q independently while preserving the original final output gates',async()=>{
  const {assessPackagedReentry}=await load(),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs');
  for(const [kind,expected]of [['N','normalizer-control'],['q','q-control'],['ceiling','program-ceiling']]){
    const f=fixture(),original=f.archive.window.bind(f.archive),at=kind==='N'?f.B:kind==='q'?f.warmupMeasurement.frame+10:f.end+64;
    f.archive.window=(a,z,stream=0)=>{const w=original(a,z,stream);if(a<=at&&at<z){if(stream===2&&kind==='N')w.channels[3][at-a]=1;if(stream===2&&kind==='q'){w.channels[0][at-a]=-.5;w.channels[1][at-a]=.5;}if(stream===0&&kind==='ceiling')w.channels[0][at-a]=1.01;}return w;};
    const r=assessPackagedReentry(f.archive,f.facts,proof(f,selectNormalizerTarget),spec);assert.equal(r.passed,false);assert.ok(r.failures.includes(expected),JSON.stringify(r.failures));
  }
});
test('product CLI retains the default R3 case and refuses component and wrong rate',async()=>{
  const {parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');assert.deepEqual(parseProductAudioArgs(['--run-id=R3Unit','--case='+spec.id]),{runId:'R3Unit',caseId:spec.id});
  for(const args of [['--case='+spec.id,'--component-witness'],['--case='+spec.id,'--sample-rate=48000'],['--case=44100/reentry/0/24'],['--case=44100/reentry/5/36']])assert.throws(()=>parseProductAudioArgs(['--run-id=R3Unit',...args]));
});

for(const [caseSpec,phase5Spec]of [[spec15,spec515],[spec25,spec525]])test(caseSpec.id+' selects its fixed rate and timing',async()=>{
  const {selectProductCase,parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  assert.deepEqual(selectProductCase(caseSpec.id),caseSpec);
  assert.deepEqual(parseProductAudioArgs(['--run-id=R3Unit','--case='+caseSpec.id]),{runId:'R3Unit',caseId:caseSpec.id});
  for(const extra of ['--component-witness','--sample-rate=48000'])assert.throws(()=>parseProductAudioArgs(['--run-id=R3Unit','--case='+caseSpec.id,extra]));
  assert.deepEqual(selectProductCase(phase5Spec.id),phase5Spec);
});

for(const [caseSpec,acceptedDelta,expected,db]of [[retireSpec,1920,'RETIRE',-34.53061224489796],[unitySpec,2048,'UNITY',-36]])test(caseSpec.id+' selects the original case and checks its full N trajectory',async()=>{
  const {selectProductCase,parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs'),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),{assessPackagedReentry}=await load();
  assert.deepEqual(selectProductCase(caseSpec.id),caseSpec);assert.deepEqual(parseProductAudioArgs(['--run-id=R3Unit','--case='+caseSpec.id]),{runId:'R3Unit',caseId:caseSpec.id});
  for(const extra of ['--component-witness','--sample-rate=48000'])assert.throws(()=>parseProductAudioArgs(['--run-id=R3Unit','--case='+caseSpec.id,extra]));
  const f=fixture({caseSpec,acceptedDelta}),r=assessPackagedReentry(f.archive,f.facts,proof(f,selectNormalizerTarget),caseSpec);
  assert.equal(r.passed,true,JSON.stringify(r));assert.deepEqual(r.formation,{expected,actual:expected,status:'FORMED'});assert.deepEqual(r.behavior,{passed:true,failures:[]});assert.equal(r.outcome,'PASS');assert.ok(Math.abs(r.expectedDbfs-db)<1e-10);assert.equal(r.native7Witness,'UNASSESSED');assert.equal(r.native8Witness,'UNASSESSED');assert.equal(r.overallQualification,false);assert.equal(r.phase.coverageChecked,false);
});
test('0/36 selects its original stimulus without permitting modified original specs',async()=>{
  const {selectProductCase}=await import('../scripts/extension-e2e/audio-product.mjs'),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs');
  assert.deepEqual(selectProductCase(spec36.id),spec36);
  for(const id of ['44100/reentry/2/36','44100/reentry/2/41','48000/reentry/0/36','48000/reentry/0/41'])assert.throws(()=>selectProductCase(id));
  for(const caseSpec of [retireSpec,spec36]){const f=fixture({caseSpec,acceptedDelta:1920});for(const patch of [{milliseconds:46},{startPhaseMs:2},{inputDbfs:-24},{sampleRate:48000}])assert.throws(()=>selectNormalizerTarget(f.warmed,f.before,f.request,{...caseSpec,...patch}),/original-spec/);}
});
test('target phase mismatch retains valid actual-phase numbers and does not mask a numeric FAIL',async()=>{
  const {selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),{assessPackagedReentry}=await load();
  for(const [caseSpec,acceptedDelta,actual]of [[retireSpec,512,'HOLD'],[retireSpec,2048,'UNITY'],[unitySpec,1920,'RETIRE']])for(const programDb of [0,.051]){
    const f=fixture({caseSpec,acceptedDelta,programDb}),r=assessPackagedReentry(f.archive,f.facts,proof(f,selectNormalizerTarget),caseSpec);
    assert.equal(r.passed,false);assert.deepEqual(r.formation,{expected:caseSpec===retireSpec?'RETIRE':'UNITY',actual,status:'INCONCLUSIVE'});assert.equal(r.behavior.passed,programDb===0);assert.equal(r.outcome,programDb===0?'INCONCLUSIVE':'FAIL');assert.equal(r.failures.includes('tail-output'),programDb!==0);assert.equal(r.controlCoverage.frames,f.end);
  }
});
for(const [caseSpec,acceptedDelta]of [[retireSpec,1920],[unitySpec,2048],[spec36,2048],[spec015,1920],[spec025,1920],[spec525,1920]])test(caseSpec.id+' requires an authentic OFF completion and rejects its missing or altered packet',async()=>{
  const {selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),{assessPackagedReentry}=await load();
  for(const patch of [null,{frame:292660},{seq:4},{sourceEpoch:2},{meterEpoch:4},{gain:0},{code:'late'}]){
    const f=fixture({caseSpec,acceptedDelta}),p=proof(f,selectNormalizerTarget),o=f.facts.productObservation,l=f.facts.oracleEvidence.ledger,packet=o.replies.find(r=>r.kind==='completed'&&r.seq===3);
    if(patch)Object.assign(packet,patch);else{o.replies=o.replies.filter(r=>r!==packet);l.events=l.events.filter(e=>e.packet!==packet);l.events.forEach((e,i)=>e.order=i+1);l.eventCount=l.events.length;}
    l.bytes=Buffer.byteLength(JSON.stringify(l))+256;
    assert.throws(()=>assessPackagedReentry(f.archive,f.facts,p,caseSpec),patch?/reentry|l1-phase/:/audio-reentry-off-completion/);
  }
});
test('UNITY cannot pass using a correct tail with a wrong intermediate retirement N',async()=>{
  const {selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),{assessPackagedReentry}=await load(),f=fixture({caseSpec:unitySpec,acceptedDelta:2048}),window=f.archive.window.bind(f.archive),at=f.A+1792;
  f.archive.window=(a,z,s=0)=>{const w=window(a,z,s);if(s===2&&a<=at&&at<z)w.channels[3][at-a]=1;return w;};
  const r=assessPackagedReentry(f.archive,f.facts,proof(f,selectNormalizerTarget),unitySpec);assert.equal(r.formation.status,'FORMED');assert.equal(r.behavior.passed,false);assert.ok(r.failures.includes('normalizer-control'));assert.equal(r.failures.includes('tail-output'),false);
});

function scenarioFixture(fault,options){
  const f=fixture(options),rate=f.spec.sampleRate,saved=new Map(),path=require('node:path'),module=Buffer.from('unit packaged R3 module'),directory='output/playwright/installed-extension-R3Unit';let on=false,posted=false,rapid=false,measured=false,position=0,attempts=0,shortMarkerReads=0,tailReads=0;
  const files={root:process.cwd(),readdir:async p=>[{name:p==='dist'?'web':'audio-transition-worklet.js',isDirectory:()=>p==='dist',isFile:()=>p==='dist/web',isSymbolicLink:()=>false}],ensureDirectory:async()=>{},lstat:async file=>saved.has(file)?{isFile:()=>true,size:saved.get(file).length}:null,
    readFile:async(file,encoding)=>{const data=saved.get(file)??(file.endsWith('audio-transition-worklet.js')?module:file.startsWith('tests/')?Buffer.from('<html></html>'):null);if(!data)throw Error('missing '+file);return encoding?data.toString(encoding):data;},
    writeFile:async(file,data,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(file));saved.set(file,Buffer.from(data));}};
  const current=full=>{
    const x=clone(rapid?f.facts:posted?f.warmed:f.before);x.audioTime=position/rate;x.video.currentTime=position/rate;
    Object.assign(x.productObservation,{commands:clone(f.facts.productObservation.commands.slice(0,rapid?4:posted?2:1)),replies:clone(f.facts.productObservation.replies.filter(r=>r.frame<=position&&r.seq<=(rapid?4:posted?2:1))),sources:on?1:0,l1Nodes:on?1:0,commonStart:0,commonEnd:Math.floor(position/128)*128,moduleLoads:['chrome-extension://actual/web/audio-transition-worklet.js']});x.sources=on?1:0;
    if(!on)Object.assign(x.readback,{state:'off',wanted:false,sources:0,appliedGain:null});
    x.powerReads=f.facts.powerReads.filter(r=>r.time<=position/rate);x.reads=x.powerReads.length;x.meterTickReads=f.facts.meterTickReads.filter(r=>r.endTime<=position/rate);x.normalizerMeasurement=measured?f.measurement:rapid?f.warmupMeasurement:posted&&position>=f.warmupMeasurement.frame?f.warmupMeasurement:null;
    if(rapid){x.productObservation.rapidMasterRequest=clone(f.facts.productObservation.rapidMasterRequest);if(!measured)x.productObservation.rapidMasterRequest.measurement=null;}
    else delete x.productObservation.rapidMasterRequest;
    const events=f.facts.oracleEvidence.ledger.events.filter(e=>e.direction==='send'?(e.packet.kind==='configure'?e.packet.seq<=(rapid?4:posted?2:1):e.packet.observedTime<=position/rate):e.packet.frame<=position);
    const l=x.oracleEvidence.ledger;l.events=clone(events);l.events.forEach((e,i)=>e.order=i+1);l.eventCount=l.events.length;l.bytes=Buffer.byteLength(JSON.stringify(l))+1024;
    const sent=events.filter(e=>e.direction==='send'&&e.packet.kind==='power').length,received=events.filter(e=>e.direction==='receive'&&e.packet.kind==='meter-accepted').length;x.productObservation.meterDiagnostics={sent,received};
    if(!full)delete l.events;
    if(fault==='live-failed'&&rapid)x.readback.state='unavailable';return x;
  };
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},waitForTimeout:async ms=>{
    if(fault==='warmup-short'&&ms===6500)position=f.warmupMeasurement.frame-428;
    else if(fault==='tail-short'&&ms===180)position=f.end-2;
    else position+=Math.round(ms*rate/1000);
  },locator:()=>({click:async()=>{on=true;position=rate*.04;}}),evaluate:async(fn,arg)=>{
    if(fn.name==='installProcessingProbe'){assert.deepEqual(arg,{sampleRate:rate,productObservation:true,oracleEvidence:true,normalizerWitness:true,...(f.spec.id===spec25.id?{sourceStartWitness:true}:{})});return;}
    if(arg.kind==='signal'){assert.deepEqual(arg,{kind:'signal',frequency:1000,inputDbfs:-36,pattern:'stereo',phase:.37,durationSeconds:90});return;}
    if(arg.kind==='configure'){on=arg.enabled;if(arg.config.normalizerEnabled===true){posted=true;position=f.request.frame;return clone(f.request);}return {status:on?'on':'off',frame:position};}
    if(arg.kind==='video')return;
    if(arg.kind==='reset-events'){
      if(rapid){
        tailReads++;
        if(arg.tail===true&&(fault==='tail-pending'||fault==='tail-short'&&position<f.end))return null;
        if(fault==='tail-probe-error')throw Error('audio-probe-reentry-tail-window');
        measured=true;return {...f.measurement,...(fault==='marker-drift'?{frame:f.end+128}:{})};
      }
      if(fault==='warmup-short'&&position<f.warmupMeasurement.frame){
        shortMarkerReads++;
        return arg.minimumFrame===f.warmupMeasurement.frame?null:{...f.warmupMeasurement,frame:position};
      }
      if(fault==='warmup-invalid-marker')return {...f.warmupMeasurement,frame:f.warmupMeasurement.frame-1};
      return clone(f.warmupMeasurement);
    }
    if(arg.kind==='rapid-master'){assert.deepEqual(arg,{kind:'rapid-master',startPhaseMs:f.spec.startPhaseMs,milliseconds:f.spec.milliseconds});assert.equal(++attempts,1);rapid=true;position=f.B+128;if(fault==='clock-stalled')throw Error('audio-probe-clock-stalled');return clone(f.boundary);}
    if(arg.kind==='facts')return current(arg.fullOracle===true);
    if(arg.kind==='l1-partial')return {streams:[],oracleEvidence:current(true).oracleEvidence};
    if(arg.kind==='product-capture'){
      const {startFrame:start,endFrame:end}=arg,x=current(false),o=x.productObservation;
      const streams=[2,2,5].map((channels,stream)=>{const w=f.archive.window(start,end,stream),bytes=Buffer.alloc((end-start)*channels*4);for(let n=0;n<end-start;n++)for(let c=0;c<channels;c++)bytes.writeFloatLE(w.channels[c][n],(n*channels+c)*4);return {start,end,channels,encoding:'interleaved-float32le',base64:bytes.toString('base64')};});
      const stamp={frame:0,mediaTime:.04,readyState:4,paused:false};
      const sourceStart=fault==='source-start-oversize'?{schema:'f01-source-start-v1',status:'FORMED',pcm:'x'.repeat(8193)}:
        fault?.startsWith('source-start-')?{schema:'f01-source-start-v1',status:'FORMED',reason:null,archive:{start,end,comparedFrames:256},empty:null,
          ...(fault==='source-start-no-binding'?{}:{binding:{epoch:1,generation:1,signal:{frequency:1000,inputDbfs:-36,phase:.37,frames:3969000},
            beforeCreate:stamp,afterCreate:stamp,beforeConnect:stamp,afterConnect:stamp}}),
          packets:[0,1].map(i=>({frame:start+i*128,producerSequence:i+1,receivedSequence:i+1,allZero:fault==='source-start-transit',
            pcm:(fault==='source-start-transit'?Buffer.alloc(1024):Buffer.from(streams[1].base64,'base64').subarray(i*1024,(i+1)*1024)).toString('base64')}))}:null;
      return {schema:'f01-product-window-v1',sampleRate:rate,start,end,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',commands:o.commands,replies:o.replies,...(o.rapidMasterRequest?{rapidMasterRequest:o.rapidMasterRequest}:{}),
        ...(sourceStart?{sourceStart,sourceFrame:0,oracleEvidence:{initial:x.oracleEvidence.initial}}:{}),streams};
    }
    throw Error('unexpected '+arg.kind);
  }};
  const input={context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async(_fn,arg)=>typeof arg==='string'?Array.from(module):undefined},extensionId:'actual',artifactPath:path.join(files.root,directory)};
  const execute=async()=>withSyntheticSource({files,input,directory},async source=>{
    const {runProductReentryScenario}=await import('../scripts/extension-e2e/audio-product.mjs');
    return runProductReentryScenario({...input,audioEvidenceSource:source},files,{dist:path.join(files.root,'dist')},f.spec);
  });
  return {spec:f.spec,input,files,saved,directory,execute,get attempts(){return attempts;},get shortMarkerReads(){return shortMarkerReads;},get tailReads(){return tailReads;}};
}
test('packaged R3 selects one fixed tail marker and preserves legal OFF supersession',async()=>{
  const f=scenarioFixture(),r=(await f.execute()).audioProduct;assert.equal(f.attempts,1);assert.equal(r.outcome,'PASS');assert.equal(r.reentry.window.end,r.measurement.frame);assert.equal(r.reentry.window.end-r.reentry.window.start,2205);assert.ok(f.saved.has(f.directory+'/reentry-target.json'));
  assert.equal(Math.max(...r.archive.artifacts.map(a=>a.end-a.start)),rate,'R3 retains its one-second exports');
});
test('R3 0/15 keeps waiting for the tail marker when wall time passes but audio is two frames short',async()=>{
  const f=scenarioFixture('tail-short',{caseSpec:spec015,acceptedDelta:768});
  const {audioProduct}=await f.execute();
  assert.equal(f.attempts,1);assert.equal(f.tailReads,2);assert.equal(audioProduct.reentry.passed,true);
  assert.equal(audioProduct.reentry.window.end-audioProduct.reentry.window.start,2205);
});
for(const fault of ['tail-pending','tail-short','tail-probe-error'])test(`R3 0/15 preserves the first failure for ${fault} at the shared tail deadline`,async t=>{
  const f=scenarioFixture(fault,{caseSpec:spec015,acceptedDelta:768}),now=performance.now.bind(performance);
  t.mock.method(performance,'now',()=>now()+(f.tailReads>=(fault==='tail-short'?2:1)?5100:0));
  await assert.rejects(f.execute,fault==='tail-probe-error'?/audio-probe-reentry-tail-window/:/reentry-tail-deadline/);
  assert.equal(f.attempts,1);assert.equal(f.tailReads,fault==='tail-short'?2:1);
  assert.equal(f.saved.has(f.directory+'/reentry-target.json'),false);
  assert.equal(JSON.parse(f.saved.get(f.directory+'/partial.json')).reentry.measurement,null);
});
test('R3 waits past a 428-frame warmup shortfall before its single transition',async()=>{
  const f=scenarioFixture('warmup-short',{caseSpec:spec36,acceptedDelta:1920});
  const {audioProduct}=await f.execute();
  assert.equal(f.shortMarkerReads,1);
  assert.equal(f.attempts,1);
  assert.equal(audioProduct.reentry.passed,true);
});
test('R3 rejects an underqualified marker before attempting the transition',async()=>{
  const f=scenarioFixture('warmup-invalid-marker',{caseSpec:spec36,acceptedDelta:1920});
  await assert.rejects(f.execute,/reentry-warmup-marker/);
  assert.equal(f.attempts,0);
  assert.ok(f.saved.has(f.directory+'/partial.json'));
});
test('R3 stops a stalled warmup within the original wait budget without a transition',async t=>{
  const f=scenarioFixture('warmup-short',{caseSpec:spec36,acceptedDelta:1920}),now=performance.now.bind(performance);
  t.mock.method(performance,'now',()=>now()+(f.shortMarkerReads?12000:0));
  await assert.rejects(f.execute,/reentry-warmup-deadline/);
  assert.equal(f.shortMarkerReads,1);
  assert.equal(f.attempts,0);
  assert.ok(f.saved.has(f.directory+'/partial.json'));
});
for(const caseSpec of [spec,spec36])for(const fault of ['clock-stalled','live-failed','marker-drift'])test(caseSpec.id+' '+fault+' preserves partial evidence without another stimulus',async()=>{
  const f=scenarioFixture(fault,{caseSpec,acceptedDelta:caseSpec===spec36?1920:512});await assert.rejects(f.execute);assert.equal(f.attempts,1);assert.ok(f.saved.has(f.directory+'/partial.json'));assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
for(const [caseSpec,acceptedDelta]of [[spec,512],[spec00,128],[spec010,512],[spec015,768],[spec025,1280],[spec36,1920],[retireSpec,1920],[unitySpec,2048],[spec20,128],[spec25,1280],[spec50,128],[spec510,512],[spec515,768],[spec525,1280]])test(caseSpec.id+' assessment written after the scenario deadline is retained as failure',async t=>{
  const f=scenarioFixture(undefined,{caseSpec,acceptedDelta}),now=Date.now,write=f.files.writeFile;let elapsed=0;Date.now=()=>now()+elapsed;t.after(()=>{Date.now=now;});
  f.files.writeFile=async(file,...args)=>{await write(file,...args);if(file.endsWith('/assessment.json'))elapsed+=90001;};
  await assert.rejects(f.execute,/scenario-timeout/);assert.equal(f.attempts,1);assert.ok(f.saved.has(f.directory+'/assessment.json'));assert.ok(f.saved.has(f.directory+'/partial.json'));
});
async function withSyntheticSource({files,input,directory},use) {
  const {audioGitFixture}=require('./f01-public-audio-contract.test.cjs');
  const {sourceAttestation}=await import('../scripts/check-installed-transition.mjs');
  const {audioInputs}=await import('../scripts/audio-verification-contract.mjs');
  const repo=await audioGitFixture(), previous={root:files.root,readFile:files.readFile,artifactPath:input.artifactPath};
  try {
    files.root=repo.root;
    files.readFile=(name,encoding)=>repo.data.has(name)?repo.files.readFile(name):previous.readFile(name,encoding);
    input.artifactPath=require('node:path').join(repo.root,directory);
    return await use(await sourceAttestation(files,audioInputs));
  } finally {
    Object.assign(files,{root:previous.root,readFile:previous.readFile});
    input.artifactPath=previous.artifactPath;
    await repo.remove();
  }
}
async function wrapper(f,change){return withSyntheticSource(f,async source=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),path=require('node:path'),candidate={root:f.files.root,dist:path.join(f.files.root,'dist'),files:['dist/web/audio-transition-worklet.js']};
  return runProductAudio({runId:'R3Unit',caseId:f.spec.id},{platform:'win32',files:f.files,attest:async()=>source,verifyCandidate:async()=>candidate,execute:async options=>{
    await options.dependencies.verifyCandidate('R3Unit',f.files.root,{retainEvidence:true});const r=await options.dependencies.mediaScenario({...f.input,audioEvidenceSource:source});await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('unit trace'),{flag:'wx'});const result={...r,ok:true,runId:'R3Unit',profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},source,after:source};
    if(f.spec.id===spec96.id){
      assert.equal(options.firstHostShutdownCase,spec96.id);
      result.shutdown.actualChildExit={kind:'exit',code:0,signal:null,at:100};
      result.firstHostShutdown={caseId:spec96.id,scope:'scenario-first-host',firstAt:null,shutdownBy:200,acceptedAt:101};
    }
    if(change)change(result,f);return result;
  }});
});}
test('R3 96kHz only selects the original 2/10 case at that rate',async()=>{
  const {parseProductAudioArgs,selectProductCase}=await import('../scripts/extension-e2e/audio-product.mjs');
  assert.deepEqual(selectProductCase(spec96.id),spec96);
  assert.deepEqual(parseProductAudioArgs(['--run-id=R3Unit','--case='+spec96.id,'--sample-rate=96000']),{runId:'R3Unit',caseId:spec96.id,sampleRate:96000});
  for(const id of ['96000/reentry/0/10','96000/reentry/2/15','48000/reentry/2/10'])assert.throws(()=>selectProductCase(id));
  assert.throws(()=>parseProductAudioArgs(['--run-id=R3Unit','--case='+spec96.id,'--sample-rate=44100']),/args/);
});
test('R3 96kHz preserves fixed tail and fresh applications through stored replay',async()=>{
  const f=scenarioFixture(undefined,{caseSpec:spec96,acceptedDelta:1024}),{audioProduct:r}=await wrapper(f);
  assert.equal(f.attempts,1);assert.equal(r.scope,spec96.id);assert.equal(r.reentry.passed,true);
  assert.equal(r.archive.sampleRate,96000);assert.equal(r.reentry.window.end-r.reentry.window.start,4800);
  assert.ok(r.reentry.window.end-r.reentry.phase.acceptedOnFrame>16384);
  assert.ok(r.reentry.window.end-r.reentry.phase.acceptedOnFrame<32768);
  assert.equal(r.reentry.overallQualification,false);
});
for(const fault of ['old-fft','stale-warmup','pre-on-power','witness-relabel','witness-rewrite'])test('R3 96kHz rejects stored '+fault,async()=>{
  const f=scenarioFixture(undefined,{caseSpec:spec96,acceptedDelta:1024});
  await assert.rejects(()=>wrapper(f,r=>{
    const report=r.audioProduct,facts=report.facts,attempt=facts.productObservation.rapidMasterRequest;
    const {events}=facts.oracleEvidence.ledger;
    const send=events.find(e=>e.direction==='send'&&e.packet.kind==='power'&&e.packet.meterSeq===67).packet;
    if(fault==='old-fft')facts.powerReads.find(p=>p.index===2).size=16384;
    if(fault==='pre-on-power')send.observedTime=report.reentry.phase.acceptedOnFrame/96000-.05;
    if(fault==='stale-warmup'){
      const ack=events.find(e=>e.direction==='receive'&&e.packet.kind==='meter-accepted'&&e.packet.seq===67).packet;
      send.observedTime=ack.frame/96000-.21;ack.code='hold';ack.application.mode='hold';
    }
    if(fault==='witness-relabel')attempt.warmupMeter.power.meterSeq=68;
    if(fault==='witness-rewrite')send.observedTime-=.001;
    f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));
  }),e=>String(e.error?.message).includes(fault==='old-fft'?'reentry-power-read':fault==='witness-relabel'?'reentry-coverage':'reentry-tail-meter'));
});
test('product wrapper replays R3 source, N, actual request and fixed tail from stored streams',async()=>{const f=scenarioFixture(),r=(await wrapper(f)).audioProduct;assert.equal(r.scope,spec.id);assert.equal(r.reentry.passed,true);});
for(const [fault,reason]of [['source-start-oversize','size'],['source-start-transit','archive-bytes'],['source-start-no-binding','binding']])test(fault+' is rejected without replacing the original assessment',async()=>{
  const f=scenarioFixture(fault,{caseSpec:spec25,acceptedDelta:1280});
  const {audioProduct}=await wrapper(f);
  assert.equal(audioProduct.passed,true);
  const first=JSON.parse(f.saved.get(f.directory+'/segment-0000.json'));
  const next=JSON.parse(f.saved.get(f.directory+'/segment-0001.json'));
  assert.equal(first.sourceStart.schema,'f01-source-start-v1');
  assert.equal(first.sourceStart.status,'UNFORMED');assert.equal(first.sourceStart.reason,reason);
  assert.ok(!first.sourceStart.pcm,'oversized bytes must not be retained');
  assert.equal('sourceStart'in next,false);
});
test('source-start matching receipt is bound to the first persisted source bytes only',async()=>{
  const f=scenarioFixture('source-start-match',{caseSpec:spec25,acceptedDelta:1280});
  assert.equal((await wrapper(f)).audioProduct.passed,true);
  const first=JSON.parse(f.saved.get(f.directory+'/segment-0000.json'));
  assert.equal(first.sourceStart.status,'FORMED');
  const stream=f.saved.get(f.directory+'/segment-0000-stream-1.f32le');
  assert.deepEqual(Buffer.concat(first.sourceStart.packets.map(p=>Buffer.from(p.pcm,'base64'))),stream.subarray(0,2048));
  assert.equal('sourceStart'in JSON.parse(f.saved.get(f.directory+'/segment-0001.json')),false);
});
test('source-start append failure retains the original error and marks the receipt uncommitted',async()=>{
  const f=scenarioFixture('source-start-match',{caseSpec:spec25,acceptedDelta:1280}),write=f.files.writeFile;
  f.files.writeFile=async(file,...args)=>{if(file.endsWith('/segment-0000-stream-2.f32le'))throw Error('first-archive-write');return write(file,...args);};
  await assert.rejects(f.execute,/first-archive-write/);
  const partial=JSON.parse(f.saved.get(f.directory+'/product-partial.json')).partial;
  assert.equal(partial.sourceStart.status,'UNFORMED');
  assert.equal(partial.sourceStart.reason,'archive-not-stored');
});
for(const caseSpec of [spec00,spec010,spec015,spec025,spec36,retireSpec,unitySpec,spec20,spec,spec15,spec25,spec50,spec510,spec515,spec525,spec96])test('product binds the prelaunch collision scope for '+caseSpec.id,async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),path=require('node:path'),f=scenarioFixture();
  await withSyntheticSource(f,async source=>{
  const profilePath=path.join(f.files.root,'output/fresh-profile'),extensionPath=path.join(f.files.root,'output/fresh-candidate');
  await assert.rejects(runProductAudio({runId:'R3Unit',caseId:caseSpec.id},{
    platform:'win32',files:f.files,attest:async()=>source,
    execute:options=>options.dependencies.launchInstalledExtension({profilePath,extensionPath}),
    launchVisibilityBrowser:async settings=>{
      assert.equal(settings.productCaseId,caseSpec.id);
      assert.equal(settings.profilePath,profilePath);assert.equal(settings.extensionPath,extensionPath);
      assert.ok(Number.isSafeInteger(settings.deadline));
      throw Error('prelaunch-conflict-sentinel');
    }
  }),error=>error.error?.message==='prelaunch-conflict-sentinel');
  assert.equal(f.attempts,0);
  });
});
test('saved R3 request cannot move with report and proof while segment evidence keeps the real marker',async()=>{
  const f=scenarioFixture();await assert.rejects(()=>wrapper(f,(r,f)=>{const report=r.audioProduct,p=JSON.parse(f.saved.get(f.directory+'/reentry-target.json'));p.measurement.frame+=128;report.measurement.frame=p.measurement.frame;report.facts.normalizerMeasurement.frame=p.measurement.frame;report.facts.productObservation.rapidMasterRequest.measurement.frame=p.measurement.frame;f.saved.set(f.directory+'/reentry-target.json',Buffer.from(JSON.stringify(p)));f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));}),e=>e.error?.message==='audio-product-reentry-coverage');
});
for(const caseSpec of [spec00,spec20,spec50])test(caseSpec.id+' replays the fixed zero-wait request with two distinct accepted frames',async()=>{
  const {parseProductAudioArgs,selectProductCase}=await import('../scripts/extension-e2e/audio-product.mjs');
  assert.deepEqual(selectProductCase(caseSpec.id),caseSpec);
  assert.deepEqual(parseProductAudioArgs(['--run-id=R3Unit','--case='+caseSpec.id]),{runId:'R3Unit',caseId:caseSpec.id});
  for(const id of ['44100/reentry/0/24','44100/reentry/2/1','44100/reentry/5/36',`48000/reentry/${caseSpec.startPhaseMs}/0`])assert.throws(()=>selectProductCase(id));
  const offReturnMs=caseSpec===spec20 ? .75 : 0;
  const f=scenarioFixture(undefined,{caseSpec,acceptedDelta:128,offReturnMs,offToOnWallMs:offReturnMs}),r=(await wrapper(f)).audioProduct;
  assert.equal(f.attempts,1);assert.equal(r.passed,true);
  const {commands,replies,rapidMasterRequest}=r.facts.productObservation;
  assert.deepEqual(rapidMasterRequest.input,{startPhaseMs:caseSpec.startPhaseMs,milliseconds:0});
  assert.equal(rapidMasterRequest.boundary.off.wall-rapidMasterRequest.boundary.edge.wall,caseSpec.startPhaseMs);
  assert.equal(rapidMasterRequest.boundary.on.wall-rapidMasterRequest.boundary.off.wall,offReturnMs);
  assert.equal(rapidMasterRequest.boundary.on.wall-rapidMasterRequest.boundary.offDone.wall,0);
  assert.deepEqual(commands.slice(2).map(c=>c.requestedFrame),[291072,291072]);
  assert.deepEqual(replies.filter(p=>p.kind==='accepted'&&p.seq>=3).map(p=>[p.seq,p.frame]),[[3,291072],[4,291200]]);
  assert.deepEqual(r.reentry.formation,{expected:null,actual:'HOLD',status:'NOT_REQUIRED'});
  assert.equal(r.reentry.window.end-r.reentry.window.start,2205);
});

test(spec20.id+' rejects starting OFF before 2ms with identical ACKs',async()=>{
  const options={caseSpec:spec20,acceptedDelta:128};
  const f=scenarioFixture(undefined,{...options,edgeToOffWallMs:1.999});
  await assert.rejects(f.execute,/audio-reentry-request-clocks/);
  const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));
  assert.deepEqual(partial.facts.productObservation.replies,fixture(options).facts.productObservation.replies);
  assert.match(partial.error,/audio-reentry-request-clocks/);
  assert.equal(f.attempts,1);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});

for(const [caseSpec,acceptedDelta,offReturnMs=0]of [[spec010,512],[spec015,768,1],[spec025,1280,1],[spec510,512],[spec515,768],[spec525,1280]])test(caseSpec.id+' replays the original row and rejects a shorter wall delay with identical ACKs',async()=>{
  const {parseProductAudioArgs,selectProductCase}=await import('../scripts/extension-e2e/audio-product.mjs');
  assert.deepEqual(selectProductCase(caseSpec.id),caseSpec);
  assert.deepEqual(parseProductAudioArgs(['--run-id=R3Unit','--case='+caseSpec.id]),{runId:'R3Unit',caseId:caseSpec.id});
  for(const id of [`44100/reentry/${caseSpec.startPhaseMs}/${caseSpec.milliseconds-1}`,'44100/reentry/5/36',`48000/reentry/${caseSpec.startPhaseMs}/${caseSpec.milliseconds}`])assert.throws(()=>selectProductCase(id));
  const f=scenarioFixture(undefined,{caseSpec,acceptedDelta,offReturnMs}),r=(await wrapper(f)).audioProduct;
  const {commands,replies,rapidMasterRequest}=r.facts.productObservation;
  assert.equal(f.attempts,1);assert.equal(r.passed,true);
  assert.deepEqual(rapidMasterRequest.input,{startPhaseMs:caseSpec.startPhaseMs,milliseconds:caseSpec.milliseconds});
  assert.equal(rapidMasterRequest.boundary.on.wall-rapidMasterRequest.boundary.off.wall,caseSpec.milliseconds);
  assert.equal(rapidMasterRequest.boundary.on.wall-rapidMasterRequest.boundary.offDone.wall,caseSpec.milliseconds-offReturnMs);
  assert.deepEqual(replies.filter(p=>p.kind==='accepted'&&p.seq>=3).map(p=>[p.seq,p.frame]),[[3,291072],[4,291072+acceptedDelta]]);
  assert.deepEqual(r.reentry.formation,{expected:null,actual:'HOLD',status:'NOT_REQUIRED'});
  assert.equal(replies.some(p=>p.kind==='completed'&&p.seq===3),false);
  assert.equal(r.reentry.window.end-r.reentry.window.start,2205);

  const short=scenarioFixture(undefined,{caseSpec,acceptedDelta,offReturnMs,offToOnWallMs:caseSpec.milliseconds-.001});
  await assert.rejects(short.execute,/audio-reentry-request-clocks/);
  const partial=JSON.parse(short.saved.get(short.directory+'/partial.json'));
  assert.deepEqual(partial.facts.productObservation.commands,commands);
  assert.deepEqual(partial.facts.productObservation.replies,replies);
  assert.match(partial.error,/audio-reentry-request-clocks/);
  assert.equal(short.attempts,1);assert.equal(short.saved.has(short.directory+'/assessment.json'),false);
});

for(const [caseSpec,role,producerId,channels,acceptedDelta]of [[spec010,'source',1,2,512],[spec025,'control',2,5,1280]])
for(const [label,frameDelta]of [['repeated',0],['missing',256]])test(caseSpec.id+' stops on a '+label+' '+role+' frame and saves the original packet pair',async()=>{
  const f=scenarioFixture(undefined,{caseSpec,acceptedDelta}),page=await f.input.context.newPage(),evaluate=page.evaluate;
  const firstFrame=291072+(role==='control'?acceptedDelta+256:0),nextFrame=firstFrame+frameDelta;
  const packets=[firstFrame,nextFrame].map((frame,index)=>({position:index?'current':'previous',frame,producerId,producerSequence:2299+index,receivedSequence:2299+index,
    channels:Array.from({length:channels},(_,channel)=>({channel,encoding:'float32le',base64:Buffer.alloc(512).fill(Buffer.from([0,0,0,index&&(role==='source'||label==='missing')?0x40:0x3f])).toString('base64')}))}));
  const firstStreamFailure={role,reason:'gap',frame:nextFrame,previousRetainedFrame:firstFrame,producerId,previousProducerId:producerId,producerSequence:2300,previousProducerSequence:2299,receivedSequence:2300,previousReceivedSequence:2299};
  const firstStreamFailureEvidence={bytes:2*channels*512,packets};
  const streamError='audio-l1-stream-gap';
  let partialRead=false;
  page.evaluate=async(fn,arg)=>{
    if(role==='control'&&partialRead&&arg?.kind==='facts')throw Error('secondary-facts-failed');
    const result=await evaluate(fn,arg);
    if(f.attempts&&arg?.kind==='facts')Object.assign(result.productObservation,{streamError,firstStreamFailure});
    if(f.attempts&&arg?.kind==='l1-partial'){
      partialRead=true;
      Object.assign(result,{streamError,firstStreamFailure,firstStreamFailureEvidence});
    }
    return result;
  };
  await assert.rejects(()=>wrapper(f),error=>error.error?.message==='audio-product-reentry-live-state');
  const summary=JSON.parse(f.saved.get('output/audio-product-R3Unit/summary.json'));
  const stop=JSON.parse(f.saved.get(f.directory+'/partial.json'));
  const saved=JSON.parse(f.saved.get(f.directory+'/product-partial.json'));
  assert.equal(summary.ok,false);assert.match(stop.error,/audio-product-reentry-live-state/);
  if(role==='control')assert.ok(stop.secondary.some(error=>error.includes('secondary-facts-failed')));
  else assert.deepEqual(stop.facts.productObservation.firstStreamFailure,firstStreamFailure);
  assert.equal(saved.failureEvidenceBytes,firstStreamFailureEvidence.bytes);
  assert.deepEqual(saved.partial.firstStreamFailure,firstStreamFailure);
  assert.deepEqual(saved.partial.firstStreamFailureEvidence,firstStreamFailureEvidence);
  assert.equal(f.attempts,1);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});

for(const caseSpec of [spec00,spec20,spec50])for(const [fault,acceptedDelta,missingAccepted,error]of [
  ['missing OFF',128,3,/l1-phase-accepted/],['missing ON',128,4,/l1-phase-accepted/],['same frame',0,null,/l1-phase-ambiguous-acceptance/],
])test(caseSpec.id+' stops on '+fault+' accepted ACK',async()=>{
  const f=scenarioFixture(undefined,{caseSpec,acceptedDelta,missingAccepted});
  await assert.rejects(f.execute,error);
  assert.equal(f.attempts,1);
  const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));
  assert.match(partial.error,error);
  assert.deepEqual(partial.reentry.spec,caseSpec);
  assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
for(const [caseSpec,acceptedDelta]of [[retireSpec,1920],[unitySpec,2048],[spec36,1536],[spec36,1920],[spec36,2048],[spec015,1920],[spec15,640],[spec25,1280],[spec510,1920],[spec515,1920],[spec525,1920]])test(caseSpec.id+' accepted delta '+acceptedDelta+' runs the common path once and replays retained streams with its caller spec',async()=>{
  const f=scenarioFixture(undefined,{caseSpec,acceptedDelta}),r=(await wrapper(f)).audioProduct;
  assert.equal(f.attempts,1);assert.equal(r.scope,caseSpec.id);assert.equal(r.reentry.passed,true);
  assert.equal(r.reentry.formation.status,caseSpec===retireSpec||caseSpec===unitySpec?'FORMED':'NOT_REQUIRED');
  if(caseSpec===retireSpec)assert.deepEqual(r.reentry.formation,{expected:'RETIRE',actual:'RETIRE',status:'FORMED'});
  if(caseSpec===unitySpec)assert.deepEqual(r.reentry.formation,{expected:'UNITY',actual:'UNITY',status:'FORMED'});
  if(caseSpec===spec15||caseSpec===spec25)assert.deepEqual(r.reentry.formation,{expected:null,actual:'HOLD',status:'NOT_REQUIRED'});
  if(caseSpec===spec015||caseSpec===spec510||caseSpec===spec515||caseSpec===spec525)assert.deepEqual(r.reentry.formation,{expected:null,actual:'RETIRE',status:'NOT_REQUIRED'});
  assert.equal(r.reentry.window.end-r.reentry.window.start,2205);
  assert.equal(JSON.parse(f.saved.get(f.directory+'/reentry-target.json')).spec.id,caseSpec.id);
});
for(const caseSpec of [retireSpec,spec36])test(caseSpec.id+' snapshots a valid caller spec before the first async boundary',async()=>{
  const {runProductReentryScenario}=await import('../scripts/extension-e2e/audio-product.mjs'),path=require('node:path'),f=scenarioFixture(undefined,{caseSpec,acceptedDelta:1920}),caller=clone(caseSpec);
  f.input.context.route=async()=>{Object.assign(caller,unitySpec);};
  const r=(await withSyntheticSource(f,source=>runProductReentryScenario({...f.input,audioEvidenceSource:source},f.files,{dist:path.join(f.files.root,'dist')},caller))).audioProduct;
  assert.equal(r.scope,caseSpec.id);assert.deepEqual(r.spec,caseSpec);assert.equal(r.reentry.formation.expected,caseSpec===spec36?null:'RETIRE');assert.equal(f.attempts,1);
});
for(const programDb of [0,.051])test('packaged phase mismatch saves '+(programDb?'numeric FAIL':'INCONCLUSIVE')+' before stopping without retry',async()=>{
  const f=scenarioFixture(undefined,{caseSpec:unitySpec,acceptedDelta:1920,programDb});await assert.rejects(f.execute,/quality-or-observation-failed/);
  const r=JSON.parse(f.saved.get(f.directory+'/assessment.json'));assert.equal(r.passed,false);assert.equal(r.outcome,programDb?'FAIL':'INCONCLUSIVE');assert.equal(r.reentry.formation.status,'INCONCLUSIVE');assert.equal(r.reentry.behavior.passed,!programDb);assert.equal(f.attempts,1);assert.ok(f.saved.has(f.directory+'/partial.json'));
});
test('retained evidence cannot borrow another case label or a forged successful formation',async()=>{
  for(const kind of ['case','formation']){
    const f=scenarioFixture(undefined,{caseSpec:retireSpec,acceptedDelta:1920});
    await assert.rejects(()=>wrapper(f,(r,f)=>{
      const report=r.audioProduct,p=JSON.parse(f.saved.get(f.directory+'/reentry-target.json'));
      if(kind==='case'){report.spec=clone(unitySpec);p.spec=clone(unitySpec);}else report.reentry.formation.actual='UNITY';
      f.saved.set(f.directory+'/reentry-target.json',Buffer.from(JSON.stringify(p)));f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));
    }),e=>e.error?.message===(kind==='formation'?'audio-reentry-saved-assessment':'audio-product-reentry-assessment'));
  }
});

for(const [acceptedDelta,actual]of [[1536,'HOLD'],[1920,'RETIRE'],[2048,'UNITY']])test('0/36 reports actual '+actual+' without imposing a phase target or hiding numeric failure',async()=>{
  const {parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs'),{selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),{assessPackagedReentry}=await load();
  assert.deepEqual(parseProductAudioArgs(['--run-id=R3Unit','--case='+spec36.id]),{runId:'R3Unit',caseId:spec36.id});
  for(const extra of ['--component-witness','--sample-rate=48000'])assert.throws(()=>parseProductAudioArgs(['--run-id=R3Unit','--case='+spec36.id,extra]));
  for(const programDb of [0,.051]){
    const f=fixture({caseSpec:spec36,acceptedDelta,programDb}),r=assessPackagedReentry(f.archive,f.facts,proof(f,selectNormalizerTarget),spec36);
    assert.deepEqual(r.formation,{expected:null,actual,status:'NOT_REQUIRED'});assert.equal(r.passed,programDb===0);assert.equal(r.behavior.passed,programDb===0);assert.equal(r.outcome,programDb?'FAIL':'PASS');assert.equal(r.failures.includes('tail-output'),programDb!==0);
    assert.equal(r.controlCoverage.frames,f.end);assert.equal(r.phase.coverageChecked,false);assert.equal(r.native7Witness,'UNASSESSED');assert.equal(r.native8Witness,'UNASSESSED');assert.equal(r.frameOrigin,'UNPROVEN');assert.equal(r.overallQualification,false);
  }
});

test('0/36 numeric failure is saved before stopping without retry',async()=>{
  const f=scenarioFixture(undefined,{caseSpec:spec36,acceptedDelta:1920,programDb:.051});await assert.rejects(f.execute,/quality-or-observation-failed/);
  const r=JSON.parse(f.saved.get(f.directory+'/assessment.json'));assert.equal(r.outcome,'FAIL');assert.equal(r.reentry.formation.status,'NOT_REQUIRED');assert.equal(r.reentry.behavior.passed,false);assert.ok(r.reentry.failures.includes('tail-output'));assert.equal(f.attempts,1);assert.ok(f.saved.has(f.directory+'/partial.json'));
});

for(const caseSpec of [spec025,spec25,spec525])test(caseSpec.id+' rejects snapping a partial q to 1 on the actual ON frame',async()=>{
  const {selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),{assessPackagedReentry}=await load();
  const f=fixture({caseSpec,acceptedDelta:1280}),window=f.archive.window.bind(f.archive);
  f.archive.window=(start,end,stream=0)=>{
    const w=window(start,end,stream);
    if(stream===2&&start<=f.B&&f.B<end){
      assert.ok(Math.abs(w.channels[1][f.B-start]-307/441)<1e-6);
      w.channels[0][f.B-start]=-1;w.channels[1][f.B-start]=1;
    }
    return w;
  };
  const r=assessPackagedReentry(f.archive,f.facts,proof(f,selectNormalizerTarget),caseSpec);
  assert.deepEqual(r.formation,{expected:null,actual:'HOLD',status:'NOT_REQUIRED'});
  assert.equal(r.outcome,'FAIL');assert.ok(r.failures.includes('q-control'));
});

for(const [caseSpec,acceptedDelta]of [[spec36,1920],[spec015,768],[spec025,1280],[spec15,640],[spec25,1280]])test(caseSpec.id+' retained proof cannot transplant case, timing, rate or actual phase',async()=>{
  for(const kind of ['case','timing','rate','phase']){
    const f=scenarioFixture(undefined,{caseSpec,acceptedDelta});
    await assert.rejects(()=>wrapper(f,(r,f)=>{
      const report=r.audioProduct,p=JSON.parse(f.saved.get(f.directory+'/reentry-target.json'));
      if(kind==='phase')report.reentry.formation.actual='UNITY';
      else{const donor=caseSpec===spec015||caseSpec===spec25?spec15:retireSpec,patch=kind==='case'?donor:kind==='timing'?{milliseconds:41}:{sampleRate:48000};Object.assign(report.spec,patch);Object.assign(p.spec,patch);}
      f.saved.set(f.directory+'/reentry-target.json',Buffer.from(JSON.stringify(p)));f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));
    }),e=>e.error?.message===(kind==='phase'?'audio-reentry-saved-assessment':'audio-product-reentry-assessment'));
  }
});

for(const [caseSpec,acceptedDelta]of [[spec36,1920],[spec25,1280],[retireSpec,1920],[unitySpec,2048]])test(caseSpec.id+' secondary snapshot error cannot replace the first stimulus failure',async()=>{
  const f=scenarioFixture('clock-stalled',{caseSpec,acceptedDelta}),page=await f.input.context.newPage(),evaluate=page.evaluate;
  page.evaluate=async(fn,arg)=>{if(arg?.kind==='l1-partial')throw Error('secondary-snapshot-failed');return evaluate(fn,arg);};
  await assert.rejects(f.execute,/audio-probe-clock-stalled/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));
  assert.match(p.error,/audio-probe-clock-stalled/);assert.ok(p.secondary.some(x=>x.includes('secondary-snapshot-failed')));assert.equal(f.attempts,1);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});

for(const [caseSpec,acceptedDelta]of [[spec00,128],[spec010,512],[spec015,768],[spec025,1280],[spec36,1920],[spec20,128],[spec15,640],[spec25,1280],[spec50,128],[spec510,512],[spec515,768],[spec525,1280]])test(caseSpec.id+' keeps unsuccessful closure and additional evidence errors despite passing numbers',async()=>{
  const f=scenarioFixture(undefined,{caseSpec,acceptedDelta});
  await assert.rejects(()=>wrapper(f,r=>{
    r.shutdown.ownedRootClosed=false;const read=f.files.readFile;
    f.files.readFile=async(file,...args)=>{if(file==='dist/web/audio-transition-worklet.js')throw Error('secondary-candidate-read-failed');return read(file,...args);};
  }),e=>e.error?.message==='audio-product-result-incomplete'&&e.secondaryErrors.some(x=>x.message==='secondary-candidate-read-failed'));
  const report=JSON.parse(f.saved.get('output/audio-product-R3Unit/summary.json'));assert.equal(report.ok,false);assert.equal(report.result.audioProduct.passed,true);assert.equal(report.result.shutdown.ownedRootClosed,false);assert.equal(report.error.message,'audio-product-result-incomplete');assert.equal(report.secondaryErrors[0].message,'secondary-candidate-read-failed');assert.equal(f.attempts,1);assert.ok(f.saved.has(f.directory+'/assessment.json'));
});
async function attachHostStorage(f,first,shutdown){
  const {createHostResponseStorage}=await import('../scripts/extension-e2e/host-response-storage.mjs');
  const files={...f.files,async *readChunks(name){yield f.saved.get(name);}};
  const storage=createHostResponseStorage({files,directory:f.directory,runId:'R3Unit',caseId:spec96.id,first:()=>first()??null,onReceipt(){},onSecondary:shutdown.recordSecondary});
  const done=shutdown.rendererDone;
  shutdown.hostStorage=storage;shutdown.rendererDone=()=>{const result=done();void storage.start();return result;};
}
test('selected pending HTML read publishes the original scenario deadline FIRST and releases renderer',{timeout:1000},async t=>{
  const f=scenarioFixture(undefined,{caseSpec:spec96});
  const originalRead=f.files.readFile.bind(f.files),originalTimer=globalThis.setTimeout;
  let clock=performance.now(),first=null,done=0;const secondary=[],states=[];
  t.mock.method(performance,'now',()=>clock);
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{
    if(ms>80000&&ms<=90000){queueMicrotask(()=>{clock+=ms;fn(...args);});return undefined;}
    return originalTimer(fn,ms,...args);
  });
  f.files.readFile=(name,...args)=>name.endsWith('audio-live.html')?new Promise(()=>{}):originalRead(name,...args);
  f.input.firstHostShutdown={recordFirst(error){first??={error,firstAt:clock,shutdownBy:clock+15000,authority:'source'};return first;},
    rendererDone(){done++;return Promise.resolve({});},recordSecondary:error=>secondary.push(error),recordFailureState:state=>states.push(state)};
  await attachHostStorage(f,()=>first,f.input.firstHostShutdown);
  await assert.rejects(f.execute,error=>error===first.error&&error.message==='audio-product-scenario-timeout');
  assert.equal(done,1);assert.equal(f.attempts,0);assert.equal(states.length,1);
  assert.ok(states[0].pending.some(row=>row.name.includes('audio-live.html')&&row.state==='RUNNING'));
  assert.ok(secondary.length>0,'failed post-deadline recovery storage remains owner-visible');
});
test('selected archive validation binds the rejected capture response to FIRST',{timeout:3000},async()=>{
  const f=scenarioFixture(undefined,{caseSpec:spec96}),page=await f.input.context.newPage(),evaluate=page.evaluate,states=[];
  let rejected,first,done=0;
  page.evaluate=async(fn,arg)=>{
    const raw=await evaluate(fn,arg);
    if(arg?.kind==='product-capture'&&!rejected){
      const bytes=Buffer.from(raw.streams[0].base64,'base64');bytes.writeFloatLE(NaN,0);raw.streams[0].base64=bytes.toString('base64');rejected=clone(raw);
    }
    return raw;
  };
  f.input.firstHostShutdown={recordFirst(error){const firstAt=performance.now();first??={error,firstAt,shutdownBy:firstAt+15000,authority:'source'};return first;},
    rendererDone(){done++;return Promise.resolve({});},recordSecondary(){},recordFailureState:state=>states.push(state)};
  await attachHostStorage(f,()=>first,f.input.firstHostShutdown);
  await assert.rejects(f.execute,error=>error===first.error&&error.message==='audio-product-archive-nonfinite');
  assert.ok(rejected);assert.equal(done,1);assert.equal(states.length,1);assert.equal(states[0].responseAvailable,true);
  const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));
  assert.deepEqual(partial.firstHostFailure.originalResponse,rejected);
});
test('selected 96kHz normal scenario charges every evidence payload and keeps its original tail',async()=>{
  const f=scenarioFixture(undefined,{caseSpec:spec96,acceptedDelta:1024}),secondary=[],states=[];let first=null;
  const owner={recordFirst(error){const firstAt=performance.now();first??={error,firstAt,shutdownBy:firstAt+15000,authority:'source'};return first;},
    rendererDone:async()=>({}),recordSecondary:error=>secondary.push(error),recordFailureState:state=>states.push(state)};
  await attachHostStorage(f,()=>first,owner);f.input.firstHostShutdown=owner;
  const {audioProduct:report}=await f.execute(),receipt=await owner.hostStorage.finish(),budget=owner.hostStorage.budget();
  const payloadBytes=[...f.saved].filter(([name])=>name.startsWith(f.directory+'/')).reduce((sum,[,bytes])=>sum+bytes.length,0);
  assert.equal(report.passed,true);assert.equal(first,null);assert.deepEqual(secondary,[]);assert.deepEqual(states,[]);assert.equal(receipt,null);
  assert.equal(budget.claimsClosed,true);assert.equal(budget.pendingFiles,0);assert.equal(budget.chargedBytes,payloadBytes);assert.ok(payloadBytes>report.archive.bytes);
  assert.equal(report.reentry.window.end-report.reentry.window.start,4800);
  const elapsed=report.reentry.window.end-report.reentry.phase.acceptedOnFrame;assert.ok(elapsed>16384&&elapsed<32768);
});
