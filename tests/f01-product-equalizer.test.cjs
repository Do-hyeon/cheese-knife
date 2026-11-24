const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=()=>{assert.ok(fs.existsSync('scripts/extension-e2e/audio-equalizer.mjs'),'fixed packaged EQ adapter must exist');return import('../scripts/extension-e2e/audio-equalizer.mjs');};
const clone=value=>structuredClone(value),rate=44100;
const packet=(seq=2,epoch=1)=>({kind:'configure',sourceEpoch:epoch,seq,wanted:true,gain:1,eq:[-6,0,0,0,0,0,0,0],normalizer:false,dynamics:false,targetDbfs:-20});
const reply=(kind,frame,seq=2,epoch=1)=>({kind,sourceEpoch:epoch,seq,frame,meterEpoch:0,gain:kind==='completed'?1:null,code:null});
function observation(){return {sources:1,l1Nodes:1,invalidFrames:0,streamError:'',commands:[{requestedFrame:100,message:{...packet(1),eq:Array(8).fill(0)}},{requestedFrame:200,message:packet()}],replies:[reply('accepted',100,1),reply('completed',180,1),reply('accepted',256),reply('completed',1844)]};}
function facts(){return {sampleRate:rate,filters:0,productObservation:observation(),signal:{frequency:63,inputDbfs:-40,phase:.37,channels:2,durationSeconds:90,frames:rate*90,loop:false,error:''},video:{muted:false,volume:1,loop:false,ended:false,paused:false,playbackRate:1,currentTime:3},readback:{state:'on',sources:1,wanted:true,gain:1,appliedGain:1}};}
function archive(target,{sourceDb=-40,outputDb=-46,tone=63,controlGain=1,rate:sampleRate=rate}={}){
  return {window(start,end,stream=0){assert.equal(start,target.start);assert.equal(end,target.end);const channels=stream===2?Array.from([-1,1,controlGain,1,0],value=>new Float32Array(end-start).fill(value)):Array.from({length:2},()=>Float32Array.from({length:end-start},(_,n)=>Math.SQRT2*10**((stream===1?sourceDb:outputDb)/20)*Math.sin(2*Math.PI*tone*n/sampleRate+.37)));return {rate:sampleRate,start,end,channels};}};
}
function memoryFiles(saved=new Map(),module=Buffer.from('fixed packaged EQ module')){
  return {root:process.cwd(),saved,readdir:async p=>[{name:p==='dist'?'web':'audio-transition-worklet.js',isDirectory:()=>p==='dist',isFile:()=>p==='dist/web',isSymbolicLink:()=>false}],ensureDirectory:async()=>{},lstat:async name=>saved.has(name)?{isFile:()=>true,size:saved.get(name).length}:null,
    readFile:async(name,encoding)=>{
      if(saved.has(name))return encoding?saved.get(name).toString(encoding):saved.get(name);
      if(name.startsWith('tests/'))return '<html></html>';
      if(name.endsWith('/audio-transition-worklet.js'))return module;
      throw Error('missing unit evidence: '+name);
    },writeFile:async(name,bytes,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(name));saved.set(name,Buffer.from(bytes));}};
}

test('a new unique canonical posted command binds its actual ACK and fixed post-completion window',async()=>{
  const {selectEqualizerTarget}=await load(),o=observation(),target=selectEqualizerTarget(o,1,200);
  assert.equal(target.completedFrame,1844);assert.equal(target.start,1844+66150);assert.equal(target.end,1844+110250);assert.deepEqual(target.command,o.commands[1]);
  o.commands[1].message.eq[0]=0;assert.equal(target.command.message.eq[0],-6,'binding must own its command snapshot');
});
test('target selection cannot reuse a same-frame old command before the dispatch cursor',async()=>{
  const {selectEqualizerTarget}=await load(),o=observation();o.commands[0].message=packet(1);o.commands[0].requestedFrame=200;
  assert.equal(selectEqualizerTarget({...o,commands:o.commands.slice(0,1),replies:o.replies.slice(0,2)},1,200),null);
  assert.equal(selectEqualizerTarget({...o,replies:o.replies.slice(0,3)},1,200),null);
  for(const mutate of [x=>x.commands.push(clone(x.commands[1])),x=>x.commands[1].message.eq[0]=0,x=>x.replies.push(clone(x.replies[3])),x=>x.replies[3].frame=128,x=>x.replies[3].sourceEpoch=2,x=>x.replies[3].code='failed',x=>x.replies[3].kind='rejected',x=>x.replies[3].frame=Number.MAX_SAFE_INTEGER]){
    const bad=clone(o);mutate(bad);assert.throws(()=>selectEqualizerTarget(bad,1,200),/equalizer/);
  }
});
test('same-EQ reconfigure, retire, epoch change and a rewritten ACK cannot reset the bound settling period',async()=>{
  const {selectEqualizerTarget,assertEqualizerTarget}=await load(),o=observation(),target=selectEqualizerTarget(o,1,200);
  assert.doesNotThrow(()=>assertEqualizerTarget(o,target));
  for(const mutate of [x=>x.commands.push({requestedFrame:1844+61740,message:packet(3)}),x=>x.commands.push({requestedFrame:70000,message:{kind:'retire',sourceEpoch:1,seq:3}}),x=>x.replies.push(reply('prepared',80000,0,2)),x=>x.commands[1].message.sourceEpoch=2,x=>x.replies[3].frame++,x=>x.replies[2].meterEpoch++,x=>x.replies[3].meterEpoch++,x=>x.commands.shift()]){
    const bad=clone(o);mutate(bad);assert.throws(()=>assertEqualizerTarget(bad,target),/equalizer/);
  }
});
test('the existing EQ assessor consumes exact archive windows and keeps Native8 unassessed',async()=>{
  const {selectEqualizerTarget,assessPackagedEqualizer}=await load(),f=facts(),target=selectEqualizerTarget(f.productObservation,1,200);
  const result=assessPackagedEqualizer(archive(target),f,target);
  assert.equal(result.originalOutputGatesPassed,true);assert.equal(result.native8ComponentWitness,'UNASSESSED');assert.equal(result.overallQualification,false);assert.equal(result.caseId,'44100/band/63/-6');assert.deepEqual(result.window,{rate,start:target.start,end:target.end});
  for(const opts of [{outputDb:-45.499},{sourceDb:-34,outputDb:-40},{tone:1000}])assert.equal(assessPackagedEqualizer(archive(target,opts),f,target).originalOutputGatesPassed,false);
  const shifted={window:(start,end,stream)=>({...archive(target).window(start,end,stream),start:start-1})};assert.throws(()=>assessPackagedEqualizer(shifted,f,target));
});
test('component witness is caller-selected through CLI fixed window scenario and retained replay',async()=>{
  const {parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  assert.deepEqual(parseProductAudioArgs(['--run-id=Tap','--case=48000/gain/2','--component-witness']),{runId:'Tap',caseId:'48000/gain/2',componentWitness:true});
  for(const args of [['--run-id=Tap','--component-witness'],['--run-id=Tap','--case=48000/gain/2','--component-witness','--component-witness']])assert.throws(()=>parseProductAudioArgs(args));
  const {equalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=equalizerMeasurementCases().find(r=>r.id==='48000/gain/2');
  const f=await scenarioFixture(undefined,undefined,s,true),r=(await memoryWrapper(f,s.id)).audioProduct;
  assert.equal(r.schema,'f01-product-eq-observation-v2');assert.equal(r.componentWitness,true);assert.equal(r.equalizer.componentWitnessPassed,true);assert.equal(r.archive.bytes,(r.archive.end-r.archive.start)*44);
  assert.equal(r.equalizer.component.expectedDb,0);assert.ok(Math.abs(r.equalizer.expectedCompositeDb-20*Math.log10(2))<1e-12);
});
test('component numeric FAIL stays quality-assessed and cannot be downgraded to legacy evidence',async()=>{
  const failed=await scenarioFixture('component-output',undefined,undefined,true);await assert.rejects(failed.execute);
  const report=JSON.parse(failed.saved.get(failed.directory+'/assessment.json'));assert.equal(report.outcome,'FAIL');assert.equal(report.qualityAssessed,true);assert.equal(report.equalizer.originalOutputGatesPassed,true);assert.equal(report.equalizer.componentWitnessPassed,false);
  const legacy=await scenarioFixture();await assert.rejects(()=>memoryWrapper(legacy,'44100/band/63/-6',()=>legacy.execute(),true));
  const {assessPackagedEqualizer,selectEqualizerTarget}=await load(),f=facts(),target=selectEqualizerTarget(f.productObservation,1,200);
  assert.throws(()=>assessPackagedEqualizer(archive(target),f,target,undefined,true),/component-profile/);
});
test('component cold profile preserves first ON baseline and exact four empty rings through replay',async()=>{
  const {selectEqualizerCase}=await load(),s=selectEqualizerCase('44100/neutral/80'),f=await scenarioFixture(undefined,undefined,s,true);
  const r=(await memoryWrapper(f,s.id)).audioProduct;assert.equal(r.equalizer.componentWitnessPassed,true);
  const proof=JSON.parse(f.saved.get(f.directory+'/equalizer-target.json'));assert.deepEqual(proof.beforeTarget.productObservation.bufferedChunks,[0,0,0,0]);
});
test('component replay rejects rehashed program and tap file role exchange even with identical Gain1 PCM',async()=>{
  const f=await scenarioFixture(undefined,undefined,undefined,true),sha=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  await assert.rejects(()=>memoryWrapper(f,'44100/band/63/-6',async()=>{
    const r=await f.execute(),report=r.audioProduct,entry=report.archive.artifacts.filter(a=>a.kind==='metadata').at(-1),meta=JSON.parse(f.saved.get(entry.file));
    [meta.streams[0],meta.streams[3]]=[meta.streams[3],meta.streams[0]];
    const bytes=Buffer.from(JSON.stringify(meta));f.saved.set(entry.file,bytes);entry.bytes=bytes.length;entry.sha256=sha(bytes);
    f.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));return r;
  }),e=>e.error?.message==='audio-product-equalizer-stream-role');
});
test('R2 input state checks the canonical 63Hz signal rather than the R1 750Hz guard',async()=>{
  const {equalizerSignalFailures}=await load(),f=facts();assert.deepEqual(equalizerSignalFailures(f),[]);
  for(const [field,value]of [['frequency',750],['inputDbfs',-24],['phase',0],['durationSeconds',20],['error','seeking']])assert.ok(equalizerSignalFailures({...f,signal:{...f.signal,[field]:value}}).length);
  for(const [field,value]of [['loop',true],['ended',true],['paused',true],['playbackRate',2],['muted',true],['volume',0]])assert.ok(equalizerSignalFailures({...f,video:{...f.video,[field]:value}}).length);
});
test('the legacy EQ flag keeps its case and incompatible rates or flags fail closed',async()=>{
  const {parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  assert.deepEqual(parseProductAudioArgs(['--run-id=EqCase','--case=eq63-minus6']),{runId:'EqCase',caseId:'44100/band/63/-6'});
  for(const args of [['--run-id=A','--case=other'],['--run-id=A','--case=eq63-minus6','--sample-rate=48000'],['--run-id=A','--sample-rate=96000','--case=eq63-minus6'],['--run-id=A','--case=eq63-minus6','--case=eq63-minus6']])assert.throws(()=>parseProductAudioArgs(args));
});

async function scenarioFixture(fault,onAck,supplied,componentWitness=false){
  const {equalizerMeasurementCases,equalizerResponseDb}=await import('../scripts/audio-processing-metrics.mjs');
  supplied??=equalizerMeasurementCases().find(row=>row.id==='44100/band/63/-6');
  const spec=clone(supplied),rate=spec.sampleRate,cold=spec.id.includes('/neutral/'),seq=cold&&fault!=='cold-seq-two'?1:2,outputDb=-40+equalizerResponseDb(spec.levels,rate,spec.frequency)-spec.levels.reduce((n,v)=>n+Math.max(0,v),0)+20*Math.log10(spec.masterGain);
  const path=require('node:path'),saved=new Map(),calls=[],module=Buffer.from('fixed packaged EQ module'),url='chrome-extension://actual/web/audio-transition-worklet.js';
  const directory='output/playwright/installed-extension-EqUnit';let position=128,enabled=false,posted=false,extra=false;
  const o=observation();o.commands=[];o.replies=[];const completion=3636;
  const current=()=>{
    if(posted&&position>=completion&&!o.replies.some(r=>r.seq===seq&&r.kind==='completed')&&fault!=='missing-ack')o.replies.push({...reply('completed',completion,seq),gain:fault==='wrong-gain-ack'?1:spec.masterGain});
    if(posted&&position>completion+61740&&!extra){extra=true;
      if(fault==='new-command')o.commands.push({requestedFrame:position,message:packet(3)});
      if(fault==='new-epoch')o.replies.push(reply('prepared',position,0,2));
      if(fault==='changed-ack')o.replies.find(r=>r.seq===seq&&r.kind==='completed').frame++;
    }
    const gain=posted?spec.masterGain:1;
    const beforeCold=cold&&!enabled;
    const value={...facts(),sampleRate:rate,captureStartFrame:beforeCold?null:128,signal:{...facts().signal,frequency:spec.frequency,frames:rate*90},audioTime:position/rate,hidden:false,contextState:beforeCold?'suspended':'running',readback:{state:enabled?'on':'off',sources:enabled?1:0,wanted:enabled,gain:fault==='baseline-readback'&&!posted ? .75 : fault==='wrong-readback-gain'&&posted?1:gain,appliedGain:beforeCold?null:fault==='wrong-readback'&&posted?1:gain},video:{...facts().video,currentTime:position/rate},productObservation:{...clone(o),sources:enabled?1:0,l1Nodes:beforeCold?0:1,sourceFrame:beforeCold?null:128,bufferedChunks:beforeCold?[0,0,0]:[1,1,1],commonStart:beforeCold?Infinity:128,commonEnd:beforeCold?0:Math.floor(position/128)*128,moduleLoads:[url]}};
    if(componentWitness){value.equalizerComponent=true;value.productObservation.bufferedChunks=Array(4).fill(beforeCold?0:1);}
    if(beforeCold&&fault==='cold-hidden-node')value.productObservation.l1Nodes=1;
    if(beforeCold&&fault==='cold-old-history')value.productObservation.commands=[{requestedFrame:0,message:packet(1)}];
    if(beforeCold&&fault==='cold-hot')Object.assign(value.readback,{state:'on',wanted:true,sources:1,appliedGain:1});
    if(cold&&posted&&fault==='cold-final-readback')value.readback.appliedGain=.5;
    return value;
  };
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},waitForTimeout:async ms=>{position+=Math.round(ms*rate/1000);if(fault==='concurrent-collection')await new Promise(resolve=>setTimeout(resolve,15));},locator:()=>({click:async()=>{assert.equal(cold,false,'neutral must use its first configure instead of a prior UI ON');enabled=true;position=2048;o.commands.push({requestedFrame:128,message:{...packet(1),eq:Array(8).fill(0),targetDbfs:fault==='baseline-target'?-19:-20}});o.replies.push(reply('accepted',128,1));if(fault!=='baseline-missing-ack')o.replies.push(reply('completed',1600,1));}}),
    evaluate:async(fn,arg)=>{
      if(fn.name==='installProcessingProbe'){assert.deepEqual(arg,{sampleRate:rate,productObservation:true,...(componentWitness?{equalizerComponent:true}:{})});return;}
      calls.push(arg);
      if(arg.kind==='signal'){assert.deepEqual(arg,{kind:'signal',frequency:spec.frequency,inputDbfs:-40,pattern:'stereo',phase:.37,durationSeconds:90});if(fault==='mutate-spec'){supplied.frequency=125;supplied.levels.fill(0);supplied.masterGain=1;}if(fault==='mutate-rate')supplied.sampleRate=rate===48000?96000:48000;return;}
      if(arg.kind==='configure'){
        enabled=arg.enabled;
        assert.equal(arg.gain,arg.config.eqEnabled===true?spec.masterGain:1);
        if(arg.config.eqEnabled===true){for(const [i,hz]of [63,125,250,500,1000,2000,4000,8000].entries())assert.equal(arg.config['eq'+hz],spec.levels[i]);posted=true;o.commands.push({requestedFrame:position,message:{...packet(seq),gain:fault==='wrong-gain-command'?1:spec.masterGain,eq:[...spec.levels]}});o.replies.push(reply('accepted',position,seq));if(cold&&onAck)onAck('configure');}
        if(posted&&fault==='cold-configure-hang')return new Promise(()=>{});
        return {status:enabled?'on':'off',frame:posted&&fault==='cold-request-past'?0:position};
      }
      if(arg.kind==='facts'){if(posted&&fault==='slow-ack'&&!extra){extra=true;onAck();}if(posted&&fault==='cold-ack-delay'&&!extra){extra=true;onAck('ack');}return current();}
      if(arg.kind==='video')return;
      if(arg.kind==='l1-partial')return {streams:[]};
      if(arg.kind==='product-capture'){
        const {startFrame:start,endFrame:end}=arg;
        return {schema:componentWitness?'f01-product-window-v2':'f01-product-window-v1',sampleRate:rate,start,end,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',commands:clone(o.commands),replies:clone(o.replies),moduleLoads:[url],streams:(componentWitness?[2,2,5,2]:[2,2,5]).map((channels,stream)=>{
          const bytes=Buffer.alloc((end-start)*channels*4);
          for(let n=start;n<end;n++)for(let c=0;c<channels;c++)bytes.writeFloatLE(stream===2?[-1,1,n>=completion&&posted&&fault!=='wrong-control'?spec.masterGain:1,1,0][c]:Math.SQRT2*10**((stream===1?fault==='source-fail'?-34:-40:stream===3?fault==='component-output'?-20:outputDb-20*Math.log10(spec.masterGain):fault==='output-fail'?-45:fault==='source-fail'?-40:outputDb)/20)*Math.sin(2*Math.PI*spec.frequency*n/rate+.37),((n-start)*channels+c)*4);
          return {start,end,channels,encoding:'interleaved-float32le',base64:bytes.toString('base64'),...(componentWitness?{role:['program','source','control','component'][stream]}:{})};
        })};
      }
      throw Error('unexpected EQ probe action');
    }};
  const files=memoryFiles(saved,module);
  if(fault==='concurrent-collection'){
    const write=files.writeFile;let delayed=false;
    files.writeFile=async(...args)=>{await write(...args);if(!delayed&&args[0].includes('/segment-')){delayed=true;position+=rate*2;await new Promise(resolve=>setTimeout(resolve,150));}};
  }
  const input={context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async(_fn,arg)=>typeof arg==='string'?Array.from(module):undefined},extensionId:'actual',artifactPath:path.join(files.root,directory)};
  const execute=async()=>{const {runProductEqualizerScenario}=await import('../scripts/extension-e2e/audio-product.mjs');return runProductEqualizerScenario(input,files,{dist:path.join(files.root,'dist')},supplied,componentWitness);};
  return {execute,saved,calls,directory,files,input,componentWitness};
}

test('actual packaged EQ scenario waits for completed C and collects the exact post-settling one-second window',async()=>{
  const f=await scenarioFixture(),{audioProduct:r}=await f.execute();assert.equal(r.schema,'f01-product-eq-observation-v1');assert.equal(r.passed,true);
  assert.deepEqual(r.equalizer.window,{rate,start:3636+66150,end:3636+110250});assert.equal(r.equalizer.native8ComponentWitness,'UNASSESSED');assert.equal(r.equalizer.overallQualification,false);
  assert.ok(r.archive.start<=r.target.start&&r.archive.end>=r.target.end);assert.equal(f.calls.filter(x=>x.kind==='signal').length,1);
  assert.equal(Math.max(...r.archive.artifacts.map(a=>a.end-a.start)),rate,'EQ retains its one-second exports');
});
for(const fault of ['new-command','new-epoch','changed-ack','missing-ack'])test(`packaged EQ stops on ${fault} without restarting or selecting a new target`,async()=>{
  const f=await scenarioFixture(fault);await assert.rejects(f.execute,/equalizer/);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);assert.equal(f.calls.filter(x=>x.kind==='signal').length,1);
  const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(partial.error,/equalizer/);
  assert.ok(partial.equalizer?.request,'the dispatch cursor/request must survive ACK failure');assert.equal(partial.equalizer.request.cursor,1);assert.equal(partial.equalizer.request.request.frame,2048);
  assert.equal(partial.equalizer.target?.completedFrame??null,fault==='missing-ack'?null:3636);
});
test('valid EQ source with an output failure remains a failed subgate and retains its labels',async()=>{
  const f=await scenarioFixture('output-fail');await assert.rejects(f.execute,/quality-or-observation-failed/);
  const r=JSON.parse(f.saved.get(f.directory+'/assessment.json'));assert.equal(r.passed,false);assert.ok(r.equalizer.failures.some(x=>x.startsWith('output-channel-')));assert.equal(r.equalizer.overallQualification,false);
});
test('a compensated but invalid EQ source stays inconclusive instead of becoming a product quality conclusion',async()=>{
  const f=await scenarioFixture('source-fail');await assert.rejects(f.execute,/quality-or-observation-failed/);
  const r=JSON.parse(f.saved.get(f.directory+'/assessment.json'));assert.equal(r.outcome,'INCONCLUSIVE');assert.equal(r.qualityAssessed,false);assert.ok(r.failures.some(x=>x.startsWith('source-channel-')));assert.equal(r.equalizer.overallQualification,false);
});
test('the 2s ACK deadline includes page evaluation latency and does not bind a late completion',async()=>{
  const original=Date.now;let now=original();Date.now=()=>now;
  try{const f=await scenarioFixture('slow-ack',()=>{now+=2001;});await assert.rejects(f.execute,/equalizer-ack-timeout/);assert.equal(f.saved.has(f.directory+'/equalizer-target.json'),false);assert.equal(f.calls.filter(x=>x.kind==='signal').length,1);}
  finally{Date.now=original;}
});
test('background capture and a delayed segment write keep one archive writer',async()=>{
  const f=await scenarioFixture('concurrent-collection'),r=await f.execute();assert.equal(r.audioProduct.passed,true);
  const files=r.audioProduct.archive.artifacts.map(row=>row.file);assert.equal(new Set(files).size,files.length);assert.ok(r.audioProduct.archive.end>=r.audioProduct.target.end);
});
test('shared wrapper dispatches the fixed EQ scenario and verifies retained archive instead of trusting a passing fingerprint',async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),f=await scenarioFixture(),source={sourceSha256:'same'};
  const candidate={root:process.cwd(),dist:require('node:path').join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  const result=await runProductAudio({runId:'EqUnit',caseId:'44100/band/63/-6'},{platform:'win32',files:f.files,verifyCandidate:async()=>candidate,attest:async()=>source,execute:async options=>{
    await options.dependencies.verifyCandidate('EqUnit',process.cwd(),{retainEvidence:true});
    const result=await options.dependencies.mediaScenario(f.input);await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('unit trace'),{flag:'wx'});
    return {...result,ok:true,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},source,after:source};
  }}).catch(error=>{error.message+=': '+JSON.stringify({error:error.error,secondary:error.secondaryErrors});throw error;});
  assert.equal(result.audioProduct.equalizer.native8ComponentWitness,'UNASSESSED');
});
test('retained EQ replay rejects metadata claims, correctly rehashed PCM/control tampering, and missing closure',async()=>{
  const {createHash}=require('node:crypto'),{runProductAudio}=await import('../scripts/check-product-audio.mjs'),f=await scenarioFixture(),baseline=await f.execute(),source={sourceSha256:'same'};
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const candidate={root:process.cwd(),dist:require('node:path').join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  for(const fault of ['overall','native8','outcome','quality','target','pcm','control','closure']){
    const saved=new Map(f.saved),files=memoryFiles(saved),r=clone(baseline.audioProduct);saved.set(f.directory+'/trace.zip',Buffer.from('unit trace'));
    if(fault==='overall')r.equalizer.overallQualification=true;
    if(fault==='native8')r.equalizer.native8ComponentWitness='PASS';
    if(fault==='outcome')r.outcome='INCONCLUSIVE';
    if(fault==='quality')r.qualityAssessed=false;
    if(fault==='target'){r.target.start--;const p=JSON.parse(saved.get(f.directory+'/equalizer-target.json'));p.target.start--;saved.set(f.directory+'/equalizer-target.json',Buffer.from(JSON.stringify(p)));}
    if(fault==='pcm'||fault==='control'){
      const stream=fault==='pcm'?0:2,row=r.archive.artifacts.find(row=>row.file.endsWith(`-stream-${stream}.f32le`)&&row.start<=r.target.start&&row.end>r.target.start),bytes=Buffer.from(saved.get(row.file));
      bytes.writeFloatLE(.5,((r.target.start-row.start)*row.channels+(stream===2?3:0))*4);row.sha256=hash(bytes);saved.set(row.file,bytes);
      const meta=r.archive.artifacts.find(item=>item.kind==='metadata'&&item.start===row.start),record=JSON.parse(saved.get(meta.file));Object.assign(record.streams.find(item=>item.file===row.file),row);
      const updated=Buffer.from(JSON.stringify(record,null,2)+'\n');meta.bytes=updated.length;meta.sha256=hash(updated);saved.set(meta.file,updated);
    }
    saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(r)));
    await assert.rejects(()=>runProductAudio({runId:'EqUnit',caseId:'44100/band/63/-6'},{platform:'win32',files,verifyCandidate:async()=>candidate,attest:async()=>source,execute:async options=>{
      await options.dependencies.verifyCandidate('EqUnit',process.cwd(),{retainEvidence:true});
      return {audioProduct:r,pageErrors:[],ok:true,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:fault!=='closure'},source,after:source};
    }}),/observation-failed/);
    const error=JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message;
    assert.equal(error,fault==='target'?'audio-product-equalizer-target':fault==='closure'?'audio-product-result-incomplete':'audio-product-equalizer-assessment',fault);
  }
});
test('retained replay rejects expiration after its bounded read/calculation even if the timer did not fire',async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),f=await scenarioFixture(),r=await f.execute(),files=memoryFiles(new Map(f.saved)),source={sourceSha256:'same'};
  files.saved.set(f.directory+'/trace.zip',Buffer.from('unit trace'));
  const candidate={root:process.cwd(),dist:require('node:path').join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  const original=Date.now;let now=original();Date.now=()=>now;const read=files.readFile;
  files.readFile=async(...args)=>{if(args[0].endsWith('/equalizer-target.json'))now+=30001;return read(...args);};
  try{
    await assert.rejects(()=>runProductAudio({runId:'EqUnit',caseId:'44100/band/63/-6'},{platform:'win32',files,verifyCandidate:async()=>candidate,attest:async()=>source,execute:async options=>{
      await options.dependencies.verifyCandidate('EqUnit',process.cwd(),{retainEvidence:true});return {...r,ok:true,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},source,after:source};
    }}),/observation-failed/);
    assert.equal(JSON.parse(files.saved.get('output/audio-product-EqUnit/summary.json')).error.message,'audio-product-equalizer-evidence-timeout');
  }finally{Date.now=original;}
});

const mixedFrequencies=[80,125,500,2000,8000,10000];
const rateMixedFrequencies=[80,125,250,500,1000,2000,4000,8000,10000];
const mixedCase=async(hz,selectedRate=rate)=>clone((await import('../scripts/audio-processing-metrics.mjs')).equalizerMeasurementCases().find(row=>row.id===`${selectedRate}/mixed/${hz}`));
test('canonical selection preserves legacy63 and the six original mixed rows, with deeply frozen levels',async()=>{
  const {selectEqualizerCase}=await load(),{parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  for(const hz of mixedFrequencies){const original=await mixedCase(hz),spec=selectEqualizerCase(original.id);assert.deepEqual(spec,original);assert.ok(Object.isFrozen(spec)&&Object.isFrozen(spec.levels));assert.deepEqual(parseProductAudioArgs(['--run-id=Mixed','--case='+original.id]),{runId:'Mixed',caseId:original.id});}
  for(const id of ['44100/mixed/63','44100/mixed/4001','48000/neutral/63','96000/neutral/080','44100/band/1000/-7','toString','']){
    assert.throws(()=>selectEqualizerCase(id),/equalizer/);assert.throws(()=>parseProductAudioArgs(['--run-id=Mixed','--case='+id]));
  }
  assert.throws(()=>parseProductAudioArgs(['--run-id=Mixed','--case=44100/mixed/80','--sample-rate=48000']));
});
async function memoryWrapper(f,callerId,execute,componentWitness=f.componentWitness??false){
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),source={sourceSha256:'same'},candidate={root:process.cwd(),dist:require('node:path').join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  return runProductAudio({runId:'EqUnit',caseId:callerId,...(componentWitness?{componentWitness:true}:{})},{platform:'win32',files:f.files,verifyCandidate:async()=>candidate,attest:async()=>source,execute:async options=>{
    await options.dependencies.verifyCandidate('EqUnit',process.cwd(),{retainEvidence:true});
    const result=execute?await execute(options):await options.dependencies.mediaScenario(f.input);
    if(!f.saved.has(f.directory+'/trace.zip'))await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('unit trace'),{flag:'wx'});
    return {...result,ok:true,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},source,after:source};
  }});
}
async function reassessSavedEqualizer(saved,report,spec,componentWitness=false){
  const {createProductArchive}=await import('../scripts/extension-e2e/audio-product.mjs'),{assessPackagedEqualizer}=await load(),replay=createProductArchive({writeFile:async()=>{}},'memory-transplant',spec.sampleRate,componentWitness?'equalizer-component':'legacy');
  for(const row of report.archive.artifacts.filter(x=>x.kind==='metadata')){
    const meta=JSON.parse(saved.get(row.file));await replay.append({...meta,streams:meta.streams.map(stream=>({start:stream.start,end:stream.end,channels:stream.channels,encoding:'interleaved-float32le',base64:saved.get(stream.file).toString('base64'),...(componentWitness?{role:stream.role}:{})}))});
  }
  return JSON.parse(JSON.stringify(assessPackagedEqualizer(replay,report.facts,report.target,spec,componentWitness)));
}
for(const hz of mixedFrequencies)test(`mixed ${hz}Hz caller spec drives actual shared scenario and retained wrapper replay`,async()=>{
  const spec=await mixedCase(hz),f=await scenarioFixture(null,null,spec),result=await memoryWrapper(f,spec.id);
  assert.equal(result.audioProduct.scope,spec.id);assert.deepEqual(result.audioProduct.spec,spec);assert.equal(result.audioProduct.equalizer.caseId,spec.id);
  assert.equal(result.audioProduct.facts.signal.frequency,hz);assert.deepEqual(result.audioProduct.target.command.message.eq,spec.levels);
  assert.equal(result.audioProduct.target.caseId,spec.id);assert.equal(result.audioProduct.equalizer.headroomDb,-15);assert.equal(result.audioProduct.equalizer.native8ComponentWitness,'UNASSESSED');assert.equal(result.audioProduct.equalizer.overallQualification,false);
});
test('a caller spec is snapshotted before asynchronous scenario work and forged original rows are rejected',async()=>{
  const spec=await mixedCase(80),f=await scenarioFixture('mutate-spec',null,spec),r=await f.execute();assert.equal(spec.frequency,125);assert.equal(r.audioProduct.spec.frequency,80);assert.equal(r.audioProduct.passed,true);
  const {runProductEqualizerScenario}=await import('../scripts/extension-e2e/audio-product.mjs');
  await assert.rejects(()=>runProductEqualizerScenario(f.input,f.files,{},spec),/equalizer/);
});
test('mixed frequency evidence cannot replace the caller case even with matching EQ packets and relabelled facts',async()=>{
  const spec80=await mixedCase(80),spec125=await mixedCase(125),baseline=await scenarioFixture(null,null,spec80),result=await baseline.execute();
  for(const relabel of [false,true]){
    const saved=new Map(baseline.saved),f={...baseline,saved,files:memoryFiles(saved)},r=clone(result);
    if(relabel){
      r.audioProduct.scope=spec125.id;r.audioProduct.spec=spec125;r.audioProduct.target.caseId=spec125.id;r.audioProduct.equalizer.caseId=spec125.id;r.audioProduct.facts.signal.frequency=125;
      const proof=JSON.parse(saved.get(f.directory+'/equalizer-target.json'));proof.spec=spec125;proof.target.caseId=spec125.id;proof.beforeTarget.signal.frequency=125;saved.set(f.directory+'/equalizer-target.json',Buffer.from(JSON.stringify(proof)));
      saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(r.audioProduct)));
    }
    await assert.rejects(()=>memoryWrapper(f,spec125.id,async()=>r),/observation-failed/);
    assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,relabel?'audio-product-equalizer-assessment':'audio-product-evidence-incomplete');
  }
});

const cutFrequencies=[125,250,500,2000,4000,8000];
const cutCase=async hz=>clone((await import('../scripts/audio-processing-metrics.mjs')).equalizerMeasurementCases().find(row=>row.id===`44100/band/${hz}/-6`));
test('legacy six original cut rows remain frozen and noncanonical IDs stay closed',async()=>{
  const {selectEqualizerCase}=await load(),{parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  for(const hz of cutFrequencies){const original=await cutCase(hz),selected=selectEqualizerCase(original.id);assert.deepEqual(selected,original);assert.ok(Object.isFrozen(selected)&&Object.isFrozen(selected.levels));assert.deepEqual(selected.levels,[63,125,250,500,1000,2000,4000,8000].map(band=>band===hz?-6:0));assert.equal(parseProductAudioArgs(['--run-id=Cut','--case='+original.id]).caseId,original.id);}
  for(const id of ['44100/band/1000/-7','44100/band/125/+6','48000/band/124/-6','96000/band/125/-5','44100/neutral/1001','44100/gain/1'])assert.throws(()=>selectEqualizerCase(id),/equalizer/);
  assert.throws(()=>parseProductAudioArgs(['--run-id=Cut','--case=44100/band/125/-6','--sample-rate=48000']));
});
for(const hz of cutFrequencies)test(`cut ${hz}Hz spec binds its exact negative band through shared scenario and retained replay`,async()=>{
  const spec=await cutCase(hz),f=await scenarioFixture(null,null,spec),r=(await memoryWrapper(f,spec.id)).audioProduct;
  assert.equal(r.passed,true);assert.equal(r.scope,spec.id);assert.deepEqual(r.spec,spec);assert.equal(r.facts.signal.frequency,hz);assert.deepEqual(r.target.command.message.eq,spec.levels);assert.equal(r.target.caseId,spec.id);
  assert.equal(r.equalizer.headroomDb,0);assert.ok(Math.abs(r.equalizer.expectedCompositeDb+6)<1e-10);assert.equal(r.equalizer.toleranceDb,.5);assert.equal(r.equalizer.native8ComponentWitness,'UNASSESSED');assert.equal(r.equalizer.overallQualification,false);
});
test('cut caller mutation cannot change asynchronous input and a forged same-frequency band is rejected',async()=>{
  const spec=await cutCase(250),f=await scenarioFixture('mutate-spec',null,spec),r=(await f.execute()).audioProduct;
  assert.equal(spec.frequency,125);assert.equal(r.spec.frequency,250);assert.deepEqual(r.target.command.message.eq,[0,0,-6,0,0,0,0,0]);
  const {runProductEqualizerScenario}=await import('../scripts/extension-e2e/audio-product.mjs'),forged=await cutCase(125);forged.levels=(await cutCase(250)).levels;
  await assert.rejects(()=>runProductEqualizerScenario(f.input,f.files,{},forged),/equalizer-original-spec/);
});
test('cut band and frequency evidence cannot be transplanted even after complete metadata rehash and relabelling',async()=>{
  const spec125=await cutCase(125),spec250=await cutCase(250),baseline=await scenarioFixture(null,null,spec125),result=await baseline.execute(),hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  for(const mode of ['scope','packet','all-metadata']){
    const saved=new Map(baseline.saved),f={...baseline,saved,files:memoryFiles(saved)},r=clone(result),a=r.audioProduct;
    if(mode!=='scope'){
      a.scope=spec250.id;a.spec=spec250;a.target.caseId=spec250.id;a.equalizer.caseId=spec250.id;a.facts.signal.frequency=250;
      const proof=JSON.parse(saved.get(f.directory+'/equalizer-target.json'));proof.spec=spec250;proof.target.caseId=spec250.id;proof.beforeTarget.signal.frequency=250;
      if(mode==='all-metadata'){
        a.target.command.message.eq=[...spec250.levels];proof.target.command.message.eq=[...spec250.levels];
        for(const command of a.facts.productObservation.commands)if(command.message.seq===a.target.command.message.seq)command.message.eq=[...spec250.levels];
        for(const row of a.archive.artifacts.filter(x=>x.kind==='metadata')){
          const meta=JSON.parse(saved.get(row.file));for(const command of meta.commands)if(command.message.seq===a.target.command.message.seq)command.message.eq=[...spec250.levels];
          const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=hash(bytes);saved.set(row.file,bytes);
        }
        const measured=await reassessSavedEqualizer(saved,a,spec250);
        assert.deepEqual(measured.failures,['source-channel-0/coherent-tone','source-channel-1/coherent-tone']);
        // Match every derived value, including lifecycle, and falsify only the two quality claims.
        a.equalizer={...measured,originalOutputGatesPassed:true,failures:[]};
      }
      saved.set(f.directory+'/equalizer-target.json',Buffer.from(JSON.stringify(proof)));saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
    }
    await assert.rejects(()=>memoryWrapper(f,spec250.id,async()=>r),/observation-failed/);
    assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,mode==='scope'?'audio-product-evidence-incomplete':mode==='packet'?'audio-equalizer-target-spec':'audio-product-equalizer-assessment');
  }
});

const positiveCase=async()=>clone((await import('../scripts/audio-processing-metrics.mjs')).equalizerMeasurementCases().find(row=>row.id==='44100/band/4000/6'));
test('legacy positive4000 stays canonical and malformed band neutral and gain IDs are rejected',async()=>{
  const {selectEqualizerCase}=await load(),{parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs'),spec=selectEqualizerCase('44100/band/4000/6');
  assert.deepEqual(spec,await positiveCase());assert.deepEqual(spec.levels,[0,0,0,0,0,0,6,0]);assert.ok(Object.isFrozen(spec)&&Object.isFrozen(spec.levels));assert.equal(parseProductAudioArgs(['--run-id=Positive','--case='+spec.id]).caseId,spec.id);
  for(const id of ['44100/band/125/7','44100/band/4000/+6','48000/band/4001/6','44100/neutral/1001','48000/gain/1'])assert.throws(()=>selectEqualizerCase(id),/equalizer/);
});
test('positive4000 uses full +6 command, -6 headroom and net0 with the original nonneutral tolerance through retained replay',async()=>{
  const spec=await positiveCase(),f=await scenarioFixture(null,null,spec),r=(await memoryWrapper(f,spec.id)).audioProduct;
  assert.equal(r.passed,true);assert.deepEqual(r.spec,spec);assert.equal(r.scope,spec.id);assert.deepEqual(r.target.command.message.eq,spec.levels);assert.equal(r.facts.signal.frequency,4000);
  assert.ok(Math.abs(r.equalizer.responseDb-6)<1e-10);assert.equal(r.equalizer.headroomDb,-6);assert.ok(Math.abs(r.equalizer.expectedCompositeDb)<1e-10);assert.equal(r.equalizer.toleranceDb,.5);assert.equal(r.equalizer.native8ComponentWitness,'UNASSESSED');assert.equal(r.equalizer.overallQualification,false);
});
test('positive4000 net0 remains nonneutral: original +/-0.5 output and +/-0.05 source bounds remain effective',async()=>{
  const spec=await positiveCase(),{selectEqualizerTarget,assessPackagedEqualizer}=await load(),f=facts();f.signal.frequency=4000;f.productObservation.commands[1].message.eq=[...spec.levels];const target=selectEqualizerTarget(f.productObservation,1,200,spec);
  for(const delta of [0,.1,-.1,.499,-.499]){const r=assessPackagedEqualizer(archive(target,{tone:4000,outputDb:-40+delta}),f,target,spec);assert.equal(r.originalOutputGatesPassed,true,String(delta));assert.equal(r.toleranceDb,.5);}
  for(const delta of [.501,-.501,6,-6])assert.equal(assessPackagedEqualizer(archive(target,{tone:4000,outputDb:-40+delta}),f,target,spec).originalOutputGatesPassed,false,String(delta));
  for(const sourceDb of [-39.949,-40.051]){const r=assessPackagedEqualizer(archive(target,{tone:4000,sourceDb,outputDb:sourceDb}),f,target,spec);assert.ok(r.failures.some(x=>x.startsWith('source-channel-')));}
});
test('positive caller mutation and forged negative band cannot change the frozen original spec',async()=>{
  const spec=await positiveCase(),f=await scenarioFixture('mutate-spec',null,spec),r=(await f.execute()).audioProduct;assert.equal(spec.frequency,125);assert.equal(r.spec.frequency,4000);assert.deepEqual(r.spec.levels,[0,0,0,0,0,0,6,0]);
  const {runProductEqualizerScenario}=await import('../scripts/extension-e2e/audio-product.mjs'),forged=await positiveCase();forged.levels=(await cutCase(4000)).levels;await assert.rejects(()=>runProductEqualizerScenario(f.input,f.files,{},forged),/equalizer-original-spec/);
});
test('a rehashed same-net0 other-frequency PCM cannot satisfy positive4000 even when every derived field is matched',async()=>{
  const spec=await positiveCase(),base=await scenarioFixture(null,null,spec),result=await base.execute(),saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},a=clone(result.audioProduct),hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  for(const row of a.archive.artifacts.filter(x=>x.kind!=='metadata'&&x.channels===2)){
    const bytes=Buffer.alloc(row.bytes);for(let n=row.start;n<row.end;n++)for(let c=0;c<2;c++)bytes.writeFloatLE(Math.SQRT2*.01*Math.sin(2*Math.PI*125*n/rate+.37),((n-row.start)*2+c)*4);row.sha256=hash(bytes);saved.set(row.file,bytes);
  }
  for(const row of a.archive.artifacts.filter(x=>x.kind==='metadata')){const meta=JSON.parse(saved.get(row.file));meta.streams=meta.streams.map(stream=>a.archive.artifacts.find(x=>x.file===stream.file));const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=hash(bytes);saved.set(row.file,bytes);}
  const measured=await reassessSavedEqualizer(saved,a,spec);assert.deepEqual(measured.failures,['source-channel-0/coherent-tone','source-channel-1/coherent-tone']);a.equalizer={...measured,originalOutputGatesPassed:true,failures:[]};saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
  await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>({audioProduct:a,pageErrors:[]})),/observation-failed/);assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,'audio-product-equalizer-assessment');
});
test('same-frequency cut PCM cannot masquerade as positive4000 after all band metadata and derived fields are relabelled',async()=>{
  const spec=await positiveCase(),base=await scenarioFixture(null,null,await cutCase(4000)),result=await base.execute(),saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},a=clone(result.audioProduct),hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  a.scope=spec.id;a.spec=spec;a.target.caseId=spec.id;a.target.command.message.eq=[...spec.levels];for(const command of a.facts.productObservation.commands)if(command.message.seq===a.target.command.message.seq)command.message.eq=[...spec.levels];
  const proof=JSON.parse(saved.get(f.directory+'/equalizer-target.json'));proof.spec=spec;proof.target=clone(a.target);saved.set(f.directory+'/equalizer-target.json',Buffer.from(JSON.stringify(proof)));
  for(const row of a.archive.artifacts.filter(x=>x.kind==='metadata')){const meta=JSON.parse(saved.get(row.file));for(const command of meta.commands)if(command.message.seq===a.target.command.message.seq)command.message.eq=[...spec.levels];const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=hash(bytes);saved.set(row.file,bytes);}
  const measured=await reassessSavedEqualizer(saved,a,spec);assert.deepEqual(measured.failures,['output-channel-0/fixed-input','output-channel-0/composite','output-channel-1/fixed-input','output-channel-1/composite']);a.equalizer={...measured,originalOutputGatesPassed:true,failures:[]};saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
  await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>({audioProduct:a,pageErrors:[]})),/observation-failed/);assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,'audio-product-equalizer-assessment');
});

const gainCase=async(gain,selectedRate=rate)=>clone((await import('../scripts/audio-processing-metrics.mjs')).equalizerMeasurementCases().find(row=>row.id===selectedRate+'/gain/'+gain));
test('legacy two original44 gain cases stay deeply frozen and malformed gain IDs are rejected',async()=>{
  const {selectEqualizerCase}=await load(),{parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  for(const gain of [.5,2]){const spec=selectEqualizerCase('44100/gain/'+gain);assert.deepEqual(spec,await gainCase(gain));assert.ok(Object.isFrozen(spec)&&Object.isFrozen(spec.levels));assert.equal(parseProductAudioArgs(['--run-id=Gain','--case='+spec.id]).caseId,spec.id);}
  for(const id of ['44100/gain/1','44100/gain/0.50','48000/gain/0.50','96000/gain/1','44100/neutral/1001'])assert.throws(()=>selectEqualizerCase(id),/equalizer/);
});
for(const gain of [.5,2])test('original Gain '+gain+' couples target-only gain, ACK, control/readback and saved replay',async()=>{
  const spec=await gainCase(gain),f=await scenarioFixture(null,null,spec),r=(await memoryWrapper(f,spec.id)).audioProduct;
  assert.equal(r.passed,true);assert.deepEqual(r.spec,spec);assert.equal(r.target.command.message.gain,gain);assert.equal(r.target.completed.gain,gain);assert.equal(r.facts.readback.gain,gain);assert.equal(r.facts.readback.appliedGain,gain);
  assert.deepEqual(f.calls.filter(x=>x.kind==='configure').map(x=>x.gain),[1,gain]);assert.deepEqual(r.facts.productObservation.commands.map(c=>c.message.gain),[1,gain]);assert.equal(r.equalizer.toleranceDb,.05);assert.equal(r.equalizer.responseDb,0);assert.equal(r.equalizer.headroomDb,0);assert.equal(r.equalizer.expectedCompositeDb,20*Math.log10(gain));assert.equal(r.equalizer.native8ComponentWitness,'UNASSESSED');assert.equal(r.equalizer.overallQualification,false);
  const proof=JSON.parse(f.saved.get(f.directory+'/equalizer-target.json'));assert.equal(proof.beforeTarget.readback.appliedGain,1);assert.equal(proof.beforeTarget.readback.gain,1);assert.deepEqual(r.equalizer.window,{rate,start:3636+66150,end:3636+110250});
});
test('gain baseline requires complete first-ON signature, ACK and readback without a replacement packet',async()=>{
  const {assertEqualizerBaseline}=await load(),spec=await gainCase(.5),f=facts();f.audioTime=2048/rate;f.productObservation.commands.pop();f.productObservation.replies.splice(2);
  assert.doesNotThrow(()=>assertEqualizerBaseline(f,spec));
  for(const mutate of [x=>x.productObservation.commands[0].message.targetDbfs=-19,x=>x.productObservation.commands[0].message.eq[3]=1,x=>x.productObservation.commands[0].message.gain=.5,x=>x.productObservation.commands[0].message.normalizer=true,x=>x.productObservation.commands[0].message.dynamics=true,x=>x.productObservation.replies.pop(),x=>x.productObservation.replies[1].gain=.5,x=>x.productObservation.replies[1].sourceEpoch++,x=>x.productObservation.replies[1].meterEpoch++,x=>x.productObservation.replies[0].frame=181,x=>x.productObservation.replies.push(clone(x.productObservation.replies[1])),x=>x.productObservation.commands.push(clone(x.productObservation.commands[0])),x=>x.readback.gain=.5,x=>x.readback.appliedGain=null,x=>x.readback.sources=2,x=>x.audioTime=0]){
    const bad=clone(f);mutate(bad);assert.throws(()=>assertEqualizerBaseline(bad,spec),/equalizer-baseline/);
  }
});
for(const fault of ['baseline-target','baseline-readback','baseline-missing-ack'])test('gain '+fault+' is preserved before target dispatch',async()=>{
  const spec=await gainCase(.5),f=await scenarioFixture(fault,null,spec);await assert.rejects(f.execute,/equalizer-baseline/);assert.equal(f.calls.filter(x=>x.kind==='configure'&&x.config.eqEnabled===true).length,0);assert.equal(f.saved.has(f.directory+'/equalizer-target.json'),false);const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.ok(partial.equalizer.request.beforeTarget);assert.equal(partial.equalizer.request.request,null);
});
for(const fault of ['wrong-gain-command','wrong-gain-ack','wrong-control','wrong-readback','wrong-readback-gain'])test('gain '+fault+' cannot become a successful packaged observation',async()=>{
  const f=await scenarioFixture(fault,null,await gainCase(.5));await assert.rejects(f.execute,/equalizer|quality-or-observation-failed/);const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.ok(partial.error);if(fault==='wrong-control'){const r=JSON.parse(f.saved.get(f.directory+'/assessment.json'));assert.deepEqual(r.equalizer.failures,['control-channel-2']);}
});
test('zero-EQ gain output keeps both original .05 gates and correct gain controls',async()=>{
  const {selectEqualizerTarget,assessPackagedEqualizer}=await load();
  for(const gain of [.5,2]){
    const spec=await gainCase(gain),f=facts();f.productObservation.commands[1].message={...packet(),gain,eq:[...spec.levels]};f.productObservation.replies[3].gain=gain;const target=selectEqualizerTarget(f.productObservation,1,200,spec),expected=-40+20*Math.log10(gain);
    for(const delta of [0,.049,-.049]){const r=assessPackagedEqualizer(archive(target,{tone:1000,outputDb:expected+delta,controlGain:gain}),f,target,spec);assert.equal(r.originalOutputGatesPassed,true);assert.equal(r.toleranceDb,.05);}
    for(const delta of [.051,-.051]){const r=assessPackagedEqualizer(archive(target,{tone:1000,outputDb:expected+delta,controlGain:gain}),f,target,spec);assert.deepEqual(r.failures,['output-channel-0/fixed-input','output-channel-0/composite','output-channel-1/fixed-input','output-channel-1/composite']);}
    for(const sourceDb of [-39.949,-40.051]){const r=assessPackagedEqualizer(archive(target,{tone:1000,sourceDb,outputDb:sourceDb+20*Math.log10(gain),controlGain:gain}),f,target,spec);assert.ok(r.failures.includes('source-channel-0/rms'));assert.ok(r.failures.includes('source-channel-1/coherent-tone'));}
  }
});
test('gain caller is snapshotted and changed original gain is rejected before asynchronous work',async()=>{
  const spec=await gainCase(.5),f=await scenarioFixture('mutate-spec',null,spec),r=(await f.execute()).audioProduct;assert.equal(spec.masterGain,1);assert.equal(r.spec.masterGain,.5);assert.equal(r.facts.signal.frequency,1000);
  const {runProductEqualizerScenario}=await import('../scripts/extension-e2e/audio-product.mjs'),forged=await gainCase(.5);forged.masterGain=2;await assert.rejects(()=>runProductEqualizerScenario(f.input,f.files,{},forged),/equalizer-original-spec/);
});
test('retained gain evidence rechecks baseline and final readback instead of trusting PASS',async()=>{
  const spec=await gainCase(.5),base=await scenarioFixture(null,null,spec),result=await base.execute();
  for(const fault of ['baseline-target','baseline-ack','baseline-readback','baseline-prefix','final-gain','final-applied']){
    const saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},r=clone(result),proof=JSON.parse(saved.get(f.directory+'/equalizer-target.json'));
    if(fault==='baseline-target'){proof.beforeTarget.productObservation.commands[0].message.targetDbfs=-19;r.audioProduct.facts.productObservation.commands[0].message.targetDbfs=-19;for(const row of r.audioProduct.archive.artifacts.filter(x=>x.kind==='metadata')){const meta=JSON.parse(saved.get(row.file));meta.commands[0].message.targetDbfs=-19;const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');saved.set(row.file,bytes);}}
    if(fault==='baseline-ack')proof.beforeTarget.productObservation.replies[1].gain=.5;
    if(fault==='baseline-prefix'){
      r.audioProduct.facts.productObservation.replies[1].gain=.5;
      for(const row of r.audioProduct.archive.artifacts.filter(x=>x.kind==='metadata')){const meta=JSON.parse(saved.get(row.file));meta.replies[1].gain=.5;const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');saved.set(row.file,bytes);}
    }
    if(fault==='baseline-readback')proof.beforeTarget.readback.gain=.5;
    if(fault==='final-gain')r.audioProduct.facts.readback.gain=1;
    if(fault==='final-applied')r.audioProduct.facts.readback.appliedGain=1;
    saved.set(f.directory+'/equalizer-target.json',Buffer.from(JSON.stringify(proof)));saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(r.audioProduct)));
    await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>r),/observation-failed/);assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,fault==='baseline-prefix'?'audio-product-equalizer-target':fault.startsWith('baseline')?'audio-equalizer-baseline':'audio-equalizer-readback');
  }
});
test('same-frequency gain transplant and near-equivalent old-cut PCM are rejected by the causal original gate',async()=>{
  const hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  for(const [from,to,oldCut]of [[.5,2,false],[2,.5,false],[.5,.5,true]]){
    const spec=await gainCase(to),base=await scenarioFixture(null,null,await gainCase(from)),result=await base.execute(),saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},a=clone(result.audioProduct);
    a.scope=spec.id;a.spec=spec;a.target.caseId=spec.id;a.target.command.message.gain=to;a.target.completed.gain=to;a.facts.readback.gain=to;a.facts.readback.appliedGain=to;
    for(const c of a.facts.productObservation.commands)if(c.message.seq===2)c.message.gain=to;
    for(const r of a.facts.productObservation.replies)if(r.seq===2&&r.kind==='completed')r.gain=to;
    const proof=JSON.parse(saved.get(f.directory+'/equalizer-target.json'));proof.spec=spec;proof.target=clone(a.target);saved.set(f.directory+'/equalizer-target.json',Buffer.from(JSON.stringify(proof)));
    for(const row of a.archive.artifacts.filter(x=>x.kind!=='metadata')){
      const bytes=Buffer.from(saved.get(row.file));
      if(row.channels===5){for(let n=row.start;n<row.end;n++)if(n>=3636)bytes.writeFloatLE(oldCut?1:to,((n-row.start)*5+2)*4);}
      else if(oldCut&&row.file.endsWith('-stream-0.f32le')){for(let n=row.start;n<row.end;n++)for(let c=0;c<2;c++)bytes.writeFloatLE(Math.SQRT2*10**(-46/20)*Math.sin(2*Math.PI*1000*n/rate+.37),((n-row.start)*2+c)*4);}
      row.sha256=hash(bytes);saved.set(row.file,bytes);
    }
    for(const row of a.archive.artifacts.filter(x=>x.kind==='metadata')){
      const meta=JSON.parse(saved.get(row.file));for(const c of meta.commands)if(c.message.seq===2)c.message.gain=to;for(const r of meta.replies)if(r.seq===2&&r.kind==='completed')r.gain=to;meta.streams=meta.streams.map(s=>a.archive.artifacts.find(x=>x.file===s.file));const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=hash(bytes);saved.set(row.file,bytes);
    }
    const measured=await reassessSavedEqualizer(saved,a,spec);assert.deepEqual(measured.failures,oldCut?['control-channel-2']:['output-channel-0/fixed-input','output-channel-0/composite','output-channel-1/fixed-input','output-channel-1/composite']);
    a.equalizer={...measured,originalOutputGatesPassed:true,failures:[]};saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
    await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>({audioProduct:a,pageErrors:[]})),/observation-failed/);assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,'audio-product-equalizer-assessment');
  }
});

const neutralFrequencies=[80,125,250,500,2000,4000,8000,10000];
const neutralCase=async hz=>clone((await import('../scripts/audio-processing-metrics.mjs')).equalizerMeasurementCases().find(row=>row.id==='44100/neutral/'+hz));
function coldFacts(){
  const f=facts();f.signal.frequency=80;f.audioTime=128/rate;f.captureStartFrame=null;f.contextState='suspended';f.readback={state:'off',sources:0,wanted:false,gain:1,appliedGain:null};
  Object.assign(f.productObservation,{sources:0,l1Nodes:0,sourceFrame:null,bufferedChunks:[0,0,0],commands:[],replies:[],commonStart:Infinity,commonEnd:0});return f;
}
test('legacy neutral8 stay frozen and noncanonical neutral aliases remain closed',async()=>{
  const {selectEqualizerCase}=await load(),{parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  for(const hz of neutralFrequencies){const spec=selectEqualizerCase('44100/neutral/'+hz);assert.deepEqual(spec,await neutralCase(hz));assert.ok(Object.isFrozen(spec)&&Object.isFrozen(spec.levels));assert.equal(parseProductAudioArgs(['--run-id=Neutral','--case='+spec.id]).caseId,spec.id);}
  for(const id of ['44100/neutral/1001','44100/neutral/63','48000/neutral/63','96000/neutral/080','44100/neutral/080'])assert.throws(()=>selectEqualizerCase(id),/equalizer/);
});
for(const hz of neutralFrequencies)test('cold neutral '+hz+' uses its first configure packet and exact completed window through saved replay',async()=>{
  const spec=await neutralCase(hz),f=await scenarioFixture(null,null,spec),r=(await memoryWrapper(f,spec.id)).audioProduct,proof=JSON.parse(f.saved.get(f.directory+'/equalizer-target.json'));
  assert.equal(r.passed,true);assert.deepEqual(r.spec,spec);assert.equal(r.facts.signal.frequency,hz);assert.equal(r.target.cursor,0);assert.equal(r.target.command.message.seq,1);assert.deepEqual(r.target.command.message.eq,Array(8).fill(0));assert.equal(r.target.completed.gain,1);assert.equal(r.facts.readback.gain,1);assert.equal(r.facts.readback.appliedGain,1);
  assert.equal(r.equalizer.toleranceDb,.05);assert.equal(r.equalizer.expectedCompositeDb,0);assert.equal(r.equalizer.native8ComponentWitness,'UNASSESSED');assert.equal(r.equalizer.overallQualification,false);
  assert.deepEqual(r.equalizer.window,{rate,start:3636+66150,end:3636+110250});assert.equal(r.facts.productObservation.commands.length,1);
  assert.deepEqual(proof.beforeTarget.productObservation.commands,[]);assert.deepEqual(proof.beforeTarget.productObservation.replies,[]);assert.equal(proof.beforeTarget.readback.state,'off');assert.equal(proof.beforeTarget.productObservation.commonStart,null);assert.equal(proof.request.status,'on');assert.equal(proof.request.frame,128);
  assert.deepEqual(f.calls.filter(x=>x.kind==='configure').map(x=>({enabled:x.enabled,eqEnabled:x.config.eqEnabled,gain:x.gain})),[{enabled:false,eqEnabled:false,gain:1},{enabled:true,eqEnabled:true,gain:1}]);
});
test('cold baseline checks actual identity but permits live/saved empty-stream sentinels',async()=>{
  const {assertEqualizerBaseline,assertEqualizerRequest}=await load(),spec=await neutralCase(80),f=coldFacts();
  assert.doesNotThrow(()=>assertEqualizerBaseline(f,spec));assert.doesNotThrow(()=>assertEqualizerBaseline(JSON.parse(JSON.stringify(f)),spec));assert.doesNotThrow(()=>assertEqualizerRequest(f,{status:'on',frame:128},spec));
  for(const mutate of [x=>x.productObservation.sources=1,x=>x.productObservation.l1Nodes=1,x=>x.productObservation.sourceFrame=0,x=>x.captureStartFrame=0,x=>x.productObservation.bufferedChunks[1]=1,x=>x.productObservation.commands.push({requestedFrame:0,message:packet(1)}),x=>x.productObservation.replies.push(reply('prepared',0,0)),x=>x.readback.state='on',x=>x.readback.wanted=true,x=>x.readback.gain=.5,x=>x.readback.appliedGain=1,x=>x.readback.sources=1,x=>x.audioTime=-1,x=>x.productObservation.invalidFrames=1,x=>x.productObservation.streamError='gap']){
    const bad=clone(f);mutate(bad);assert.throws(()=>assertEqualizerBaseline(bad,spec),/cold-baseline/);
  }
  for(const request of [{status:'off',frame:128},{status:'on',frame:127},{status:'on',frame:Infinity},{status:'on',frame:128,ignored:true}])assert.throws(()=>assertEqualizerRequest(f,request,spec),/equalizer-request/);
});
test('neutral binds first seq1 with actual positive epoch, not a hot cursor or a guessed epoch1',async()=>{
  const {selectEqualizerTarget}=await load(),spec=await neutralCase(80),o=observation();o.commands=[{requestedFrame:200,message:{...packet(1,3),eq:Array(8).fill(0)}}];o.replies=[reply('prepared',0,0,3),reply('accepted',256,1,3),reply('completed',1844,1,3)];
  assert.equal(selectEqualizerTarget(o,0,128,spec).completedFrame,1844);
  assert.throws(()=>selectEqualizerTarget(o,1,128,spec),/cold/);
  for(const mutate of [x=>{x.commands[0].message.seq=2;for(const r of x.replies)if(r.seq===1)r.seq=2;},x=>x.commands[0].message.eq[3]=1,x=>x.commands[0].message.targetDbfs=-19,x=>x.replies[2].gain=.5,x=>x.commands.push(clone(x.commands[0]))]){
    const bad=clone(o);mutate(bad);assert.throws(()=>selectEqualizerTarget(bad,0,128,spec),/equalizer/);
  }
});
for(const fault of ['cold-hot','cold-old-history','cold-hidden-node'])test('neutral '+fault+' stops before any first-ON dispatch and retains the cold failure',async()=>{
  const f=await scenarioFixture(fault,null,await neutralCase(80));await assert.rejects(f.execute,/cold-baseline/);assert.equal(f.calls.filter(x=>x.kind==='configure'&&x.enabled===true).length,0);const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.ok(partial.equalizer.request.beforeTarget);assert.equal(partial.equalizer.request.request,null);
});
for(const fault of ['cold-seq-two','cold-request-past','cold-final-readback','missing-ack','new-command','new-epoch','changed-ack'])test('neutral '+fault+' cannot form a replacement successful target',async()=>{
  const f=await scenarioFixture(fault,null,await neutralCase(80));await assert.rejects(f.execute,/equalizer/);const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.ok(partial.equalizer.request.request);assert.match(partial.error,/equalizer/);assert.equal(f.calls.filter(x=>x.kind==='configure'&&x.enabled).length,1);
});
for(const fault of ['cold-configure-delay','cold-ack-delay'])test('the cold absolute2s budget includes '+fault+' without restarting after configure',async()=>{
  const original=Date.now;let now=original();Date.now=()=>now;
  try{
    const f=await scenarioFixture(fault,phase=>{now+=fault==='cold-configure-delay'?2001:phase==='configure'?1900:101;},await neutralCase(80));
    await assert.rejects(f.execute,/equalizer-ack-timeout|configure-timeout/);assert.equal(f.saved.has(f.directory+'/equalizer-target.json'),false);assert.equal(f.calls.filter(x=>x.kind==='configure'&&x.enabled).length,1);assert.ok(f.saved.has(f.directory+'/partial.json'));
  }finally{Date.now=original;}
});
test('neutral two output gates keep original .05 bounds and source tone remains independently checked',async()=>{
  const {selectEqualizerTarget,assessPackagedEqualizer}=await load(),spec=await neutralCase(80),f=facts();f.productObservation.commands=[{requestedFrame:200,message:{...packet(1),eq:Array(8).fill(0)}}];f.productObservation.replies=[reply('accepted',256,1),reply('completed',1844,1)];const target=selectEqualizerTarget(f.productObservation,0,128,spec);
  for(const delta of [0,.049,-.049])assert.equal(assessPackagedEqualizer(archive(target,{tone:80,outputDb:-40+delta}),f,target,spec).originalOutputGatesPassed,true);
  for(const delta of [.051,-.051])assert.deepEqual(assessPackagedEqualizer(archive(target,{tone:80,outputDb:-40+delta}),f,target,spec).failures,['output-channel-0/fixed-input','output-channel-0/composite','output-channel-1/fixed-input','output-channel-1/composite']);
  for(const sourceDb of [-39.949,-40.051])assert.ok(assessPackagedEqualizer(archive(target,{tone:80,sourceDb,outputDb:sourceDb}),f,target,spec).failures.includes('source-channel-0/rms'));
});
test('neutral caller is snapshotted before asynchronous work and forged original frequency is rejected',async()=>{
  const spec=await neutralCase(80),f=await scenarioFixture('mutate-spec',null,spec),r=(await f.execute()).audioProduct;assert.equal(spec.frequency,125);assert.equal(r.spec.frequency,80);
  const {runProductEqualizerScenario}=await import('../scripts/extension-e2e/audio-product.mjs'),forged=await neutralCase(80);forged.frequency=125;await assert.rejects(()=>runProductEqualizerScenario(f.input,f.files,{},forged),/equalizer-original-spec/);
});
test('saved neutral replay rejects hot cold-proof, false request/status and final readback instead of trusting PASS',async()=>{
  const spec=await neutralCase(80),base=await scenarioFixture(null,null,spec),result=await base.execute();
  for(const fault of ['hot','hidden-node','old-ack','request-past','request-off','readback']){
    const saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},r=clone(result),proof=JSON.parse(saved.get(f.directory+'/equalizer-target.json'));
    if(fault==='hot')proof.beforeTarget.readback={...r.audioProduct.facts.readback};
    if(fault==='hidden-node')proof.beforeTarget.productObservation.l1Nodes=1;
    if(fault==='old-ack')proof.beforeTarget.productObservation.replies=[reply('completed',0,1)];
    if(fault==='request-past')proof.request.frame=0;
    if(fault==='request-off')proof.request.status='off';
    if(fault==='readback')r.audioProduct.facts.readback.gain=.5;
    saved.set(f.directory+'/equalizer-target.json',Buffer.from(JSON.stringify(proof)));saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(r.audioProduct)));
    await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>r),/observation-failed/);const error=JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message;
    assert.equal(error,fault==='readback'?'audio-equalizer-readback':fault.startsWith('request')?'audio-equalizer-request':'audio-equalizer-cold-baseline');
  }
});
test('same-net0 neutral frequency transplant fails only original coherent-tone gates after full relabelling and rehash',async()=>{
  const spec=await neutralCase(125),base=await scenarioFixture(null,null,spec),result=await base.execute(),saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},a=clone(result.audioProduct),hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  for(const row of a.archive.artifacts.filter(x=>x.kind!=='metadata'&&x.channels===2)){
    const bytes=Buffer.alloc(row.bytes);for(let n=row.start;n<row.end;n++)for(let c=0;c<2;c++)bytes.writeFloatLE(Math.SQRT2*.01*Math.sin(2*Math.PI*80*n/rate+.37),((n-row.start)*2+c)*4);row.sha256=hash(bytes);saved.set(row.file,bytes);
  }
  for(const row of a.archive.artifacts.filter(x=>x.kind==='metadata')){const meta=JSON.parse(saved.get(row.file));meta.streams=meta.streams.map(stream=>a.archive.artifacts.find(x=>x.file===stream.file));const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=hash(bytes);saved.set(row.file,bytes);}
  const measured=await reassessSavedEqualizer(saved,a,spec);assert.deepEqual(measured.failures,['source-channel-0/coherent-tone','source-channel-1/coherent-tone']);a.equalizer={...measured,originalOutputGatesPassed:true,failures:[]};saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
  await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>({audioProduct:a,pageErrors:[]})),/observation-failed/);assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,'audio-product-equalizer-assessment');
});

test('legacy original mixed18 stay frozen in the three-rate selector and CLI',async()=>{
  const {selectEqualizerCase}=await load(),{parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  for(const selectedRate of [48000,96000])for(const hz of rateMixedFrequencies){
    const spec=await mixedCase(hz,selectedRate),selected=selectEqualizerCase(spec.id);assert.deepEqual(selected,spec);assert.ok(Object.isFrozen(selected)&&Object.isFrozen(selected.levels));
    assert.deepEqual(parseProductAudioArgs(['--run-id=RateMixed','--case='+spec.id]),{runId:'RateMixed',caseId:spec.id});
    for(const args of [['--case='+spec.id,'--sample-rate='+selectedRate],['--sample-rate='+selectedRate,'--case='+spec.id]])assert.deepEqual(parseProductAudioArgs(['--run-id=RateMixed',...args]),{runId:'RateMixed',sampleRate:selectedRate,caseId:spec.id});
    for(const other of [44100,selectedRate===48000?96000:48000])assert.throws(()=>parseProductAudioArgs(['--run-id=RateMixed','--sample-rate='+other,'--case='+spec.id]));
  }
  for(const id of ['48000/mixed/63','96000/mixed/16000','48000/neutral/124','96000/gain/0.50','48000/band/4000/+6','44100/mixed/4001'])assert.throws(()=>selectEqualizerCase(id));
});
for(const selectedRate of [48000,96000])for(const hz of rateMixedFrequencies)test(`mixed ${selectedRate}/${hz} couples caller through signal, exact ACK window and retained replay`,async()=>{
  const spec=await mixedCase(hz,selectedRate),f=await scenarioFixture(null,null,spec),result=await memoryWrapper(f,spec.id),r=result.audioProduct;
  assert.equal(JSON.parse(f.saved.get('output/audio-product-EqUnit/before.json')).sampleRate,selectedRate);assert.equal(JSON.parse(f.saved.get('output/audio-product-EqUnit/summary.json')).sampleRate,selectedRate);assert.equal(r.archive.sampleRate,selectedRate);assert.equal(r.scope,spec.id);assert.deepEqual(r.spec,spec);
  assert.equal(r.facts.sampleRate,selectedRate);assert.equal(r.facts.signal.frames,90*selectedRate);assert.equal(r.facts.signal.frequency,hz);assert.deepEqual(r.target.command.message.eq,spec.levels);
  assert.deepEqual(r.equalizer.window,{rate:selectedRate,start:3636+1.5*selectedRate,end:3636+2.5*selectedRate});assert.equal(r.equalizer.headroomDb,-15);assert.equal(r.equalizer.toleranceDb,.5);
  assert.equal(r.equalizer.native8ComponentWitness,'UNASSESSED');assert.equal(r.equalizer.overallQualification,false);assert.equal(r.equalizer.originalOutputGatesPassed,true);
});
for(const selectedRate of [48000,96000])test(`mixed ${selectedRate} freezes original rate and rejects CLI conflicts before any writes`,async()=>{
  const spec=await mixedCase(125,selectedRate),f=await scenarioFixture('mutate-rate',null,spec),r=(await f.execute()).audioProduct;assert.notEqual(spec.sampleRate,selectedRate);assert.equal(r.spec.sampleRate,selectedRate);
  const {runProductEqualizerScenario}=await import('../scripts/extension-e2e/audio-product.mjs');await assert.rejects(()=>runProductEqualizerScenario(f.input,f.files,{},spec),/original-spec/);
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs');let touched=false;
  await assert.rejects(()=>runProductAudio({runId:'Mismatch',caseId:r.spec.id,sampleRate:selectedRate===48000?96000:48000},{platform:'win32',files:{lstat:async()=>{touched=true;}},attest:async()=>{touched=true;},execute:async()=>{touched=true;}}),/args/);assert.equal(touched,false);
});
for(const selectedRate of [48000,96000])test(`mixed ${selectedRate} rejects wrong source Fs, duration frames, C offsets and preserves original numeric bounds`,async()=>{
  const {selectEqualizerTarget,equalizerSignalFailures,assessPackagedEqualizer}=await load(),spec=await mixedCase(125,selectedRate),o=observation();o.commands[1].message.eq=[...spec.levels];
  const target=selectEqualizerTarget(o,1,200,spec),f={...facts(),sampleRate:selectedRate,productObservation:o,signal:{...facts().signal,frequency:125,frames:90*selectedRate}};
  assert.deepEqual(equalizerSignalFailures(f,spec),[]);assert.deepEqual([target.start,target.end],[1844+1.5*selectedRate,1844+2.5*selectedRate]);
  for(const bad of [{...f,sampleRate:44100},{...f,signal:{...f.signal,frames:44100*90}},{...f,signal:{...f.signal,frequency:250}}])assert.deepEqual(equalizerSignalFailures(bad,spec),['input-signal-state']);
  const {equalizerResponseDb}=await import('../scripts/audio-processing-metrics.mjs'),expected=equalizerResponseDb(spec.levels,selectedRate,125)-15;
  for(const delta of [.499,-.499,.501,-.501]){const a=archive(target,{rate:selectedRate,tone:125,outputDb:-40+expected+delta});assert.equal(assessPackagedEqualizer(a,f,target,spec).originalOutputGatesPassed,Math.abs(delta)<.5);}
  for(const sourceDb of [-39.949,-40.051])assert.ok(assessPackagedEqualizer(archive(target,{rate:selectedRate,tone:125,sourceDb,outputDb:sourceDb+expected}),f,target,spec).failures.some(x=>x.startsWith('source-channel-')));
  assert.throws(()=>assessPackagedEqualizer(archive(target,{tone:125}),f,target,spec),/fixed-window/);
  const oldWindow={...target,start:target.completedFrame+66150,end:target.completedFrame+110250};assert.throws(()=>assessPackagedEqualizer(archive(oldWindow),f,oldWindow,spec),/target-changed/);
  for(const mutate of [x=>x.commands.push({requestedFrame:target.start,message:packet(3)}),x=>x.replies.push(reply('prepared',target.start,0,2)),x=>x.replies[3].frame++]){const bad=clone(f);mutate(bad.productObservation);assert.throws(()=>assessPackagedEqualizer(archive(target),bad,target,spec),/equalizer/);}
});
for(const selectedRate of [48000,96000])test(`mixed ${selectedRate} rejects donor PCM after complete rate or frequency relabelling and rehash`,async()=>{
  const spec=await mixedCase(125,selectedRate),base=await scenarioFixture(null,null,spec),baseline=await base.execute(),hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex'),{equalizerResponseDb}=await import('../scripts/audio-processing-metrics.mjs');
  for(const mode of ['rate','frequency']){
    const saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},a=clone(baseline.audioProduct),donorRate=mode==='rate'?(selectedRate===48000?96000:48000):selectedRate,donorHz=mode==='rate'?125:250,donorDb=equalizerResponseDb(spec.levels,donorRate,donorHz)-15;
    for(const row of a.archive.artifacts.filter(x=>x.kind!=='metadata'&&x.channels===2)){
      const bytes=Buffer.alloc(row.bytes),db=row.file.endsWith('-stream-0.f32le')?-40+donorDb:-40;
      for(let n=row.start;n<row.end;n++)for(let c=0;c<2;c++)bytes.writeFloatLE(Math.SQRT2*10**(db/20)*Math.sin(2*Math.PI*donorHz*n/donorRate+.37),((n-row.start)*2+c)*4);
      row.sha256=hash(bytes);saved.set(row.file,bytes);
    }
    for(const row of a.archive.artifacts.filter(x=>x.kind==='metadata')){const meta=JSON.parse(saved.get(row.file));meta.streams=meta.streams.map(stream=>a.archive.artifacts.find(x=>x.file===stream.file));const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=hash(bytes);saved.set(row.file,bytes);}
    const measured=await reassessSavedEqualizer(saved,a,spec);assert.ok(measured.failures.includes('source-channel-0/coherent-tone'));assert.ok(measured.failures.includes('source-channel-1/coherent-tone'));
    if(mode==='rate')assert.deepEqual(measured.failures,['source-channel-0/coherent-tone','source-channel-1/coherent-tone'],'rate transplant must reach the original source gate, not stale fields or output differences');
    a.equalizer={...measured,originalOutputGatesPassed:true,failures:[]};saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
    await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>({audioProduct:a,pageErrors:[]})),/observation-failed/);assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,'audio-product-equalizer-assessment');
  }
});
for(const selectedRate of [48000,96000])test(`mixed ${selectedRate} rejects borrowed caller, proof, metadata or archive Fs before a PASS replay`,async()=>{
  const spec=await mixedCase(125,selectedRate),other=await mixedCase(125,selectedRate===48000?96000:48000),base=await scenarioFixture(null,null,spec),baseline=await base.execute(),hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  for(const fault of ['caller','spec','proof','archive-rate','chunk-rate']){
    const saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},a=clone(baseline.audioProduct);
    if(fault==='spec')a.spec=other;
    if(fault==='proof'){const p=JSON.parse(saved.get(f.directory+'/equalizer-target.json'));p.spec=other;saved.set(f.directory+'/equalizer-target.json',Buffer.from(JSON.stringify(p)));}
    if(fault==='archive-rate')a.archive.sampleRate=other.sampleRate;
    if(fault==='chunk-rate'){const row=a.archive.artifacts.find(x=>x.kind==='metadata'),meta=JSON.parse(saved.get(row.file));meta.sampleRate=other.sampleRate;const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=hash(bytes);saved.set(row.file,bytes);}
    saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
    await assert.rejects(()=>memoryWrapper(f,fault==='caller'?other.id:spec.id,async()=>({audioProduct:a,pageErrors:[]})),/observation-failed/);
    assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,fault==='caller'||fault==='archive-rate'?'audio-product-evidence-incomplete':fault==='chunk-rate'?'audio-product-archive-coverage':'audio-product-equalizer-spec',fault);
  }
});
for(const selectedRate of [48000,96000])test(`mixed ${selectedRate} retains the 1.5s chunk boundary and pre-read five-channel byte bound`,async()=>{
  const {createProductArchive}=await import('../scripts/extension-e2e/audio-product.mjs'),spec=await mixedCase(125,selectedRate),base=await scenarioFixture(null,null,spec),r=(await base.execute()).audioProduct;
  const meta=JSON.parse(base.saved.get(r.archive.artifacts.find(x=>x.kind==='metadata').file)),raw={...meta,start:0,end:1.5*selectedRate,streams:[2,2,5].map(channels=>({start:0,end:1.5*selectedRate,channels,encoding:'interleaved-float32le',base64:Buffer.alloc(1.5*selectedRate*channels*4).toString('base64')}))};
  const a=createProductArchive({writeFile:async()=>{}},'boundary',selectedRate);await a.append(raw);assert.equal(a.summary().bytes,1.5*selectedRate*36);
  await assert.rejects(()=>createProductArchive({writeFile:async()=>{throw Error('no write');}},'overflow',selectedRate).append({...raw,end:raw.end+1}),/archive-coverage/);
  await assert.rejects(()=>createProductArchive({writeFile:async()=>{}},'wrong-rate',selectedRate).append({...raw,sampleRate:44100}),/archive-coverage/);
  const saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},report=clone(r),row=report.archive.artifacts.find(x=>x.channels===5);row.bytes=1.5*selectedRate*5*4+1;let read=false;const original=f.files.readFile;
  f.files.readFile=async(name,...args)=>{if(name===row.file)read=true;return original(name,...args);};saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));
  await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>({audioProduct:report,pageErrors:[]})),/observation-failed/);assert.equal(read,false);assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,'audio-product-artifact-path');
});

function gainBaseline(selectedRate=rate,completedFrame=selectedRate){
  const f=facts();f.sampleRate=selectedRate;f.signal.frames=90*selectedRate;f.audioTime=1;f.productObservation.commands.pop();f.productObservation.commands[0].requestedFrame=0;f.productObservation.replies.splice(2);f.productObservation.replies[0].frame=0;f.productObservation.replies[1].frame=completedFrame;return f;
}
test('original four rate Gain cases stay deeply frozen and reject noncanonical IDs',async()=>{
  const {selectEqualizerCase}=await load(),{parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  for(const selectedRate of [48000,96000])for(const gain of [.5,2]){const spec=await gainCase(gain,selectedRate),selected=selectEqualizerCase(spec.id);assert.deepEqual(selected,spec);assert.ok(Object.isFrozen(selected)&&Object.isFrozen(selected.levels));assert.deepEqual(selected.levels,Array(8).fill(0));assert.equal(selected.frequency,1000);assert.equal(parseProductAudioArgs(['--run-id=GainRate','--sample-rate='+selectedRate,'--case='+spec.id]).caseId,spec.id);}
  for(const id of ['48000/gain/1','48000/gain/0.50','96000/gain/0.25','96000/gain/3','48000/neutral/1001','96000/band/1000/-7'])assert.throws(()=>selectEqualizerCase(id));
});
for(const selectedRate of [48000,96000])test(`rate Gain ${selectedRate} baseline uses its original Fs at the exact observation boundary`,async()=>{
  const {assertEqualizerBaseline}=await load(),spec=await gainCase(.5,selectedRate),f=gainBaseline(selectedRate);assert.doesNotThrow(()=>assertEqualizerBaseline(f,spec));
  f.productObservation.replies[1].frame++;assert.throws(()=>assertEqualizerBaseline(f,spec),/baseline/);
});
test('rate Gain baseline clock rejects finite overflow, unsafe frames and negative values rounding to minus zero',async()=>{
  const {assertEqualizerBaseline}=await load(),spec=await gainCase(.5),f=gainBaseline(rate,0);
  for(const time of [0,-0,1])assert.doesNotThrow(()=>assertEqualizerBaseline({...f,audioTime:time},spec));
  for(const time of [Number.MAX_VALUE,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER/rate+1,-Number.MIN_VALUE,-1,NaN,Infinity,-Infinity,'1',null])assert.throws(()=>assertEqualizerBaseline({...f,audioTime:time},spec),/baseline/,String(time));
});
for(const selectedRate of [48000,96000])for(const gain of [.5,2])test(`rate Gain ${selectedRate}/${gain} couples original caller through baseline, target and saved replay`,async()=>{
  const spec=await gainCase(gain,selectedRate),f=await scenarioFixture(null,null,spec),r=(await memoryWrapper(f,spec.id)).audioProduct,proof=JSON.parse(f.saved.get(f.directory+'/equalizer-target.json'));
  assert.deepEqual(r.spec,spec);assert.equal(r.archive.sampleRate,selectedRate);assert.equal(r.facts.sampleRate,selectedRate);assert.equal(r.facts.signal.frequency,1000);assert.equal(r.facts.signal.frames,90*selectedRate);
  assert.deepEqual(r.facts.productObservation.commands.map(c=>c.message.gain),[1,gain]);assert.equal(proof.beforeTarget.readback.appliedGain,1);assert.equal(r.target.completed.gain,gain);assert.equal(r.facts.readback.gain,gain);assert.equal(r.facts.readback.appliedGain,gain);
  assert.equal(r.equalizer.toleranceDb,.05);assert.equal(r.equalizer.expectedCompositeDb,20*Math.log10(gain));assert.equal(r.equalizer.headroomDb,0);assert.equal(r.equalizer.responseDb,0);assert.equal(r.equalizer.originalOutputGatesPassed,true);assert.equal(r.equalizer.native8ComponentWitness,'UNASSESSED');assert.equal(r.equalizer.overallQualification,false);
  assert.deepEqual(r.equalizer.window,{rate:selectedRate,start:r.target.completedFrame+1.5*selectedRate,end:r.target.completedFrame+2.5*selectedRate});
});
for(const selectedRate of [48000,96000])test(`rate Gain ${selectedRate} retains both original .05 output bounds and independent source validation`,async()=>{
  const {selectEqualizerTarget,assessPackagedEqualizer}=await load();
  for(const gain of [.5,2]){const spec=await gainCase(gain,selectedRate),f=facts();f.productObservation.commands[1].message={...packet(),gain,eq:[...spec.levels]};f.productObservation.replies[3].gain=gain;const target=selectEqualizerTarget(f.productObservation,1,200,spec),expected=-40+20*Math.log10(gain);
    for(const delta of [.049,-.049,.051,-.051]){const r=assessPackagedEqualizer(archive(target,{rate:selectedRate,tone:1000,outputDb:expected+delta,controlGain:gain}),f,target,spec);assert.equal(r.originalOutputGatesPassed,Math.abs(delta)<.05);if(Math.abs(delta)>.05)assert.deepEqual(r.failures,['output-channel-0/fixed-input','output-channel-0/composite','output-channel-1/fixed-input','output-channel-1/composite']);}
    for(const sourceDb of [-39.949,-40.051])assert.ok(assessPackagedEqualizer(archive(target,{rate:selectedRate,tone:1000,sourceDb,outputDb:sourceDb+20*Math.log10(gain),controlGain:gain}),f,target,spec).failures.some(x=>x.startsWith('source-channel-')));
  }
});
for(const selectedRate of [48000,96000])test(`rate Gain ${selectedRate} snapshots caller rate and rejects conflicts before writes`,async()=>{
  const spec=await gainCase(.5,selectedRate),f=await scenarioFixture('mutate-rate',null,spec),r=(await f.execute()).audioProduct;assert.notEqual(spec.sampleRate,selectedRate);assert.equal(r.spec.sampleRate,selectedRate);assert.equal(r.spec.masterGain,.5);
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs');let touched=false;await assert.rejects(()=>runProductAudio({runId:'GainMismatch',caseId:r.spec.id,sampleRate:spec.sampleRate},{platform:'win32',files:{lstat:async()=>{touched=true;}},attest:async()=>{touched=true;}}),/args/);assert.equal(touched,false);
  const {runProductEqualizerScenario}=await import('../scripts/extension-e2e/audio-product.mjs');await assert.rejects(()=>runProductEqualizerScenario(f.input,f.files,{},spec),/original-spec/);
});
for(const selectedRate of [48000,96000])test(`rate Gain ${selectedRate} preserves wrong baseline, target, ACK, control and readback failures`,async()=>{
  for(const fault of ['baseline-target','wrong-gain-command','wrong-gain-ack','wrong-control','wrong-readback']){const f=await scenarioFixture(fault,null,await gainCase(.5,selectedRate));await assert.rejects(f.execute,/equalizer|quality-or-observation-failed/);const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.ok(partial.error);if(fault==='baseline-target')assert.equal(partial.equalizer.request.request,null);if(fault==='wrong-control')assert.deepEqual(JSON.parse(f.saved.get(f.directory+'/assessment.json')).equalizer.failures,['control-channel-2']);}
});
for(const selectedRate of [48000,96000])test(`rate Gain ${selectedRate} saved replay rechecks baseline clock and reply prefix`,async()=>{
  const spec=await gainCase(.5,selectedRate),base=await scenarioFixture(null,null,spec),baseline=await base.execute(),hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  for(const fault of ['overflow','baseline-ack','prefix','readback']){const saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},a=clone(baseline.audioProduct),proof=JSON.parse(saved.get(f.directory+'/equalizer-target.json'));
    if(fault==='overflow')proof.beforeTarget.audioTime=Number.MAX_VALUE;
    if(fault==='baseline-ack')proof.beforeTarget.productObservation.replies[1].gain=.5;
    if(fault==='prefix'){a.facts.productObservation.replies[1].gain=.5;for(const row of a.archive.artifacts.filter(x=>x.kind==='metadata')){const meta=JSON.parse(saved.get(row.file));meta.replies[1].gain=.5;const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=hash(bytes);saved.set(row.file,bytes);}}
    if(fault==='readback')a.facts.readback.appliedGain=1;
    saved.set(f.directory+'/equalizer-target.json',Buffer.from(JSON.stringify(proof)));saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
    await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>({audioProduct:a,pageErrors:[]})),/observation-failed/);assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,fault==='prefix'?'audio-product-equalizer-target':fault==='readback'?'audio-equalizer-readback':'audio-equalizer-baseline');
  }
});
for(const selectedRate of [48000,96000])for(const gain of [.5,2])test(`rate Gain ${selectedRate}/${gain} fully relabelled donor PCM fails only its causal original gates`,async()=>{
  const spec=await gainCase(gain,selectedRate),base=await scenarioFixture(null,null,spec),baseline=await base.execute(),hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  for(const mode of gain===.5?['opposite-gain','cut']:['opposite-gain']){const saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},a=clone(baseline.audioProduct);
    for(const row of a.archive.artifacts.filter(x=>x.kind!=='metadata')){const bytes=Buffer.from(saved.get(row.file));if(row.file.endsWith('-stream-0.f32le')){const db=mode==='cut'?-46:-40+20*Math.log10(gain===.5?2:.5);for(let n=row.start;n<row.end;n++)for(let c=0;c<2;c++)bytes.writeFloatLE(Math.SQRT2*10**(db/20)*Math.sin(2*Math.PI*1000*n/selectedRate+.37),((n-row.start)*2+c)*4);}if(mode==='cut'&&row.channels===5)for(let n=row.start;n<row.end;n++)bytes.writeFloatLE(1,((n-row.start)*5+2)*4);row.sha256=hash(bytes);saved.set(row.file,bytes);}
    for(const row of a.archive.artifacts.filter(x=>x.kind==='metadata')){const meta=JSON.parse(saved.get(row.file));meta.streams=meta.streams.map(s=>a.archive.artifacts.find(x=>x.file===s.file));const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=hash(bytes);saved.set(row.file,bytes);}
    const measured=await reassessSavedEqualizer(saved,a,spec);assert.deepEqual(measured.failures,mode==='cut'?['control-channel-2']:['output-channel-0/fixed-input','output-channel-0/composite','output-channel-1/fixed-input','output-channel-1/composite']);a.equalizer={...measured,originalOutputGatesPassed:true,failures:[]};saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
    await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>({audioProduct:a,pageErrors:[]})),/observation-failed/);assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,'audio-product-equalizer-assessment');
  }
});
for(const selectedRate of [48000,96000])test(`rate Gain ${selectedRate} rehashed rate or frequency PCM transplant reaches source tone rejection`,async()=>{
  const spec=await gainCase(.5,selectedRate),base=await scenarioFixture(null,null,spec),baseline=await base.execute(),hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  for(const mode of ['rate','frequency']){const saved=new Map(base.saved),f={...base,saved,files:memoryFiles(saved)},a=clone(baseline.audioProduct),donorRate=mode==='rate'?(selectedRate===48000?96000:48000):selectedRate,donorHz=mode==='rate'?1000:500;
    for(const row of a.archive.artifacts.filter(x=>x.kind!=='metadata'&&x.channels===2)){const bytes=Buffer.alloc(row.bytes),rms=.01*(row.file.endsWith('-stream-0.f32le')?.5:1);for(let n=row.start;n<row.end;n++)for(let c=0;c<2;c++)bytes.writeFloatLE(Math.SQRT2*rms*Math.sin(2*Math.PI*donorHz*n/donorRate+.37),((n-row.start)*2+c)*4);row.sha256=hash(bytes);saved.set(row.file,bytes);}
    for(const row of a.archive.artifacts.filter(x=>x.kind==='metadata')){const meta=JSON.parse(saved.get(row.file));meta.streams=meta.streams.map(s=>a.archive.artifacts.find(x=>x.file===s.file));const bytes=Buffer.from(JSON.stringify(meta));row.bytes=bytes.length;row.sha256=hash(bytes);saved.set(row.file,bytes);}
    const measured=await reassessSavedEqualizer(saved,a,spec);assert.deepEqual(measured.failures,['source-channel-0/coherent-tone','source-channel-1/coherent-tone']);a.equalizer={...measured,originalOutputGatesPassed:true,failures:[]};saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
    await assert.rejects(()=>memoryWrapper(f,spec.id,async()=>({audioProduct:a,pageErrors:[]})),/observation-failed/);assert.equal(JSON.parse(saved.get('output/audio-product-EqUnit/summary.json')).error.message,'audio-product-equalizer-assessment');
  }
});

test('a non-returning cold configure is bounded by the original2s watchdog and cannot enter ACK polling',async()=>{
  const original=setTimeout,originalClear=clearTimeout,originalNow=Date.now,timers=new Map(),now=originalNow();Date.now=()=>now;
  global.setTimeout=(fn,ms,...args)=>{let id;id=original(()=>{timers.delete(id);fn(...args);},ms);timers.set(id,{fn,ms});return id;};
  global.clearTimeout=id=>{timers.delete(id);originalClear(id);};
  try{
    const f=await scenarioFixture('cold-configure-hang',()=>{const active=[...timers.values()].filter(t=>t.ms>100);assert.equal(active.length,1);assert.equal(active[0].ms,2000,'cold configure must not inherit the legacy5s operation timeout');original(active[0].fn,0);},await neutralCase(80));
    await assert.rejects(f.execute,/audio-operation-timeout:product-probe-configure/);assert.equal(f.saved.has(f.directory+'/equalizer-target.json'),false);
    const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(partial.equalizer.request.request,null);assert.equal(f.calls.filter(x=>x.kind==='configure'&&x.enabled).length,1);assert.equal(partial.equalizer.target,null);
  }finally{global.setTimeout=original;global.clearTimeout=originalClear;Date.now=originalNow;}
});


const addedEqIds=[
  ...[63,125,250,500,1000,2000,8000].map(hz=>'44100/band/'+hz+'/6'),
  '44100/band/1000/-6','44100/neutral/1000',
  ...[250,1000,4000].map(hz=>'44100/mixed/'+hz),
  ...[48000,96000].flatMap(rate=>[
    ...[63,125,250,500,1000,2000,4000,8000].flatMap(hz=>[-6,6].map(db=>rate+'/band/'+hz+'/'+db)),
    ...[80,125,250,500,1000,2000,4000,8000,10000].map(hz=>rate+'/neutral/'+hz)
  ])
];
test('EQ108 admits every original spec once and no arbitrary ID or forged spec',async()=>{
  const {selectEqualizerCase}=await load(),{equalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),{runProductEqualizerScenario,parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs'),originals=equalizerMeasurementCases();
  assert.equal(originals.length,108);assert.equal(new Set(originals.map(s=>s.id)).size,108);assert.equal(addedEqIds.length,62);assert.equal(new Set(addedEqIds).size,62);
  for(const original of originals){const s=selectEqualizerCase(original.id);assert.deepEqual(s,original);assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.levels));assert.equal(parseProductAudioArgs(['--run-id=Eq108','--case='+s.id,'--component-witness']).caseId,s.id);}
  for(const id of ['44100/band/125/+6','44100/neutral/080','48000/gain/1','96000/mixed/16000','192000/neutral/80','44100/band/125/-6/extra','constructor'])assert.throws(()=>selectEqualizerCase(id));
  const s=selectEqualizerCase('96000/band/125/6');for(const patch of [{frequency:250},{levels:Array(8).fill(0)},{masterGain:.5},{sampleRate:48000}])await assert.rejects(()=>runProductEqualizerScenario({},null,null,{...s,...patch},true),/original-spec/);
});
for(const id of addedEqIds)test('EQ108 '+id+' binds original input to component capture and saved replay',async()=>{
  const {equalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),original=clone(equalizerMeasurementCases().find(s=>s.id===id)),f=await scenarioFixture(null,null,original,true),r=(await memoryWrapper(f,id)).audioProduct,proof=JSON.parse(f.saved.get(f.directory+'/equalizer-target.json')),fs=original.sampleRate;
  assert.deepEqual(r.spec,original);assert.deepEqual(proof.spec,original);assert.equal(r.facts.sampleRate,fs);assert.equal(r.facts.signal.frequency,original.frequency);assert.equal(r.componentWitness,true);assert.equal(r.archive.profile,'equalizer-component');assert.equal(r.equalizer.componentWitnessPassed,true);assert.equal(r.equalizer.originalOutputGatesPassed,true);assert.equal(r.equalizer.native8ComponentWitness,'UNASSESSED');assert.equal(r.equalizer.overallQualification,false);
  assert.deepEqual(r.equalizer.window,{rate:fs,start:3636+fs*1.5,end:3636+fs*2.5});
  const neutral=id.includes('/neutral/');assert.equal(r.equalizer.toleranceDb,neutral?.05:.5);assert.equal(r.target.command.message.gain,1);
  if(neutral){assert.equal(r.target.cursor,0);assert.equal(r.target.command.message.seq,1);assert.equal(r.facts.productObservation.commands.length,1);assert.deepEqual(proof.beforeTarget.productObservation.bufferedChunks,[0,0,0,0]);assert.deepEqual(proof.beforeTarget.productObservation.commands,[]);assert.equal(proof.beforeTarget.readback.state,'off');assert.equal(r.equalizer.component.expectedDb,0);}
  if(id.includes('/band/')){const boost=id.endsWith('/6');assert.ok(Math.abs(r.equalizer.component.expectedDb-(boost?0:-6))<1e-7);assert.equal(r.equalizer.headroomDb,boost?-6:0);}
});
for(const fs of [48000,96000]){
  test('EQ108 cold '+fs+' rejects past requests and invalid original clocks',async()=>{
    const {selectEqualizerCase,assertEqualizerBaseline,assertEqualizerRequest}=await load(),s=selectEqualizerCase(fs+'/neutral/80'),f=coldFacts();f.sampleRate=fs;f.signal.frames=fs*90;f.audioTime=1;
    assert.doesNotThrow(()=>assertEqualizerBaseline(f,s));assert.throws(()=>assertEqualizerRequest(f,{status:'on',frame:fs-1},s),/request/);assert.doesNotThrow(()=>assertEqualizerRequest(f,{status:'on',frame:fs},s));
    for(const value of [-Number.MIN_VALUE,NaN,Infinity,(Number.MAX_SAFE_INTEGER+100)/fs,Number.MAX_VALUE]){const bad=clone(f);bad.audioTime=value;assert.throws(()=>assertEqualizerBaseline(bad,s),/baseline/);assert.throws(()=>assertEqualizerRequest(bad,{status:'on',frame:fs},s),/request/);}
  });
  test('EQ108 cold '+fs+' preserves the legacy three-stream path',async()=>{
    const {equalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=equalizerMeasurementCases().find(c=>c.id===fs+'/neutral/80'),f=await scenarioFixture(null,null,s),r=(await memoryWrapper(f,s.id)).audioProduct;
    assert.equal(r.passed,true);assert.equal(r.componentWitness,undefined);assert.equal(r.archive.profile,undefined);assert.equal(r.target.cursor,0);assert.deepEqual(JSON.parse(f.saved.get(f.directory+'/equalizer-target.json')).beforeTarget.productObservation.bufferedChunks,[0,0,0]);
  });
  test('EQ108 cold '+fs+' refuses hot history hidden nodes and a past request',async()=>{
    const {equalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=equalizerMeasurementCases().find(c=>c.id===fs+'/neutral/80');
    for(const fault of ['cold-hot','cold-old-history','cold-hidden-node','cold-request-past','cold-seq-two','cold-final-readback']){const f=await scenarioFixture(fault,null,s,true);await assert.rejects(f.execute,/equalizer/);assert.ok(f.saved.has(f.directory+'/partial.json'));assert.equal(f.saved.has(f.directory+'/assessment.json'),false);}
  });
  for(const fault of ['cold-configure-delay','cold-ack-delay'])test('EQ108 cold '+fs+' retains the absolute2s budget for '+fault,async()=>{
    const originalNow=Date.now;let now=originalNow();Date.now=()=>now;
    try{const {equalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs'),s=equalizerMeasurementCases().find(c=>c.id===fs+'/neutral/80'),f=await scenarioFixture(fault,phase=>{now+=fault==='cold-configure-delay'?2001:phase==='configure'?1900:101;},s,true);await assert.rejects(f.execute,/equalizer-ack-timeout|configure-timeout/);assert.equal(f.saved.has(f.directory+'/equalizer-target.json'),false);assert.ok(f.saved.has(f.directory+'/partial.json'));}finally{Date.now=originalNow;}
  });
}

test('Gain4 private replay with retained EQ evidence',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path');
  const {createHash}=require('node:crypto'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs');
  const {verifyBrowserCandidate}=await import('../scripts/extension-e2e/harness.mjs');
  const {selectEqualizerCase}=await load();
  const selectedParent=process.env.KNIFE_GAIN4_REPLAY_FIXTURE_PARENT;
  const parent=selectedParent??await fs.mkdtemp(path.join(await fs.realpath(require('node:os').tmpdir()),'gain4-replay-'));
  // 기본 시험은 자신이 만든 폴더만 회수하고, 호스트가 지정한 위치의 증거는 보존한다.
  if(selectedParent===undefined)t.after(()=>fs.rm(parent,{recursive:true,force:true}));
  assert.ok(path.isAbsolute(parent),'Gain4 fixture 부모는 절대 경로여야 한다');
  assert.equal(await fs.realpath(parent),parent);
  const root=path.join(parent,'gain4-replay-inert'),browserRoot=path.join(root,'browser');
  await fs.mkdir(root);
  await fs.mkdir(browserRoot);
  const executable=path.join(browserRoot,'chrome.exe'),payload=Buffer.from('inert Gain4 browser bytes');
  const manifest=Buffer.from(JSON.stringify({
    schema:'f01-browser-candidate-v1',root:browserRoot,version:'159.0.8132.0',
    revision:'c409acbc7ae0155eb173d8d5b9fd815e244dbf97',platform:'win32',arch:'x64',executable:'chrome.exe',
    buildArgs:{is_debug:true,is_component_build:true,symbol_level:0,blink_symbol_level:0,v8_symbol_level:0,target_cpu:'x64',use_remoteexec:false,use_siso:true},
    files:[{path:'chrome.exe',bytes:payload.length,sha256:sha(payload)}],
  }));
  const helperBytes=Buffer.from('inert Gain4 helper bytes');
  const browserCandidate={root:browserRoot,manifestSha256:sha(manifest)};
  const helper={path:path.join(root,'owner.exe'),sha256:sha(helperBytes)};
  await fs.writeFile(executable,payload,{flag:'wx'});
  await fs.writeFile(path.join(browserRoot,'browser-candidate.json'),manifest,{flag:'wx'});
  await fs.writeFile(helper.path,helperBytes,{flag:'wx'});

  const runId='EqUnit',caseId='48000/gain/0.5',runJob={contract:'run-job-v1',helper};
  const spec=selectEqualizerCase(caseId),source={sourceSha256:'gain4-eq-fixture'};
  const binding={nonce:'c'.repeat(64),pid:42,created:'0123456789abcdef',helperPid:43,
    helperCreated:'0123456789abcdee',helperSha256:helper.sha256,executable};
  const shutdown={contract:'run-job-v1',browserCloseAcknowledged:true,browserDisconnected:true,
    ownedRootClosed:null,runJobClosed:true,profileRootAssessment:'UNASSESSED',
    job:{binding,active:0,rootExited:true,total:1,helperExited:true,aborted:false,
      timing:{budgetMs:15000,remainingBeforeMs:11000,remainingAfterMs:10000}}};
  const profilePath=path.join(root,'virtual-profile');
  const caller={runId,caseId,componentWitness:true,browserCandidate,runJob};
  const timeout='audio-product-gain4-replay-timeout',fileError='audio-product-gain4-replay-file';
  const firstError='gain4-primary-read',summaryError='gain4-secondary-summary';
  const expectedModule='extension/web/audio-transition-worklet.js';
  const summaryPath='output/audio-product-EqUnit/summary.json';
  const physicalNow=performance.now.bind(performance);
  let fakeNow=null;
  t.mock.method(performance,'now',()=>fakeNow??physicalNow());

  for(const [mode,reason] of [
    ['normal',null],
    ['rehashed PCM','audio-product-equalizer-assessment'],
    ['first read deadline',timeout],
    ['aggregate stat cap',fileError],
    ['stream growth',fileError],
    ['first read and summary failure',firstError],
  ]){
    const f=await scenarioFixture(null,null,spec,true),artifact=f.directory;
    const proofReads=['before.json','run-job-launch.json','browser-candidate-before.json'].map(name=>artifact+'/'+name);
    const trace=artifact+'/trace.zip',assessment=artifact+'/assessment.json',target=artifact+'/equalizer-target.json';
    const fetchedModule=artifact+'/module-resource.fetched.js',cap=96*1024*1024;
    const candidate={root:f.files.root,dist:path.join(f.files.root,'dist'),files:['dist/web/audio-transition-worklet.js']};
    const read=f.files.readFile,stat=f.files.lstat,write=f.files.writeFile;
    const moduleBytes=await read(expectedModule);
    const opened=[],closed=[],yielded=[],signals=new Set();
    let summaryWrites=0,summaryAttempt,report,launches=0,virginTraceStats=0;
    f.files.lstat=async file=>{
      if(file===expectedModule)return {isFile:()=>true,size:moduleBytes.length};
      if(file===trace){virginTraceStats++;if(mode==='aggregate stat cap')return {isFile:()=>true,size:cap};}
      return stat(file);
    };
    f.files.readChunks=async function*(file,{signal}){
      opened.push(file);signals.add(signal);
      assert.equal(signal.aborted,false,mode);
      try{
        if(mode==='first read and summary failure'&&file===proofReads[0])throw Error(firstError);
        if(mode==='aggregate stat cap')assert.notEqual(file,trace,'aggregate admission must precede trace body');
        const data=file===expectedModule?moduleBytes:f.saved.get(file);
        assert.ok(data?.length,file);
        if(mode==='stream growth'&&file===trace){
          assert.equal(data.length,1);
          for(let i=0;i<2;i++){yielded.push(1);yield data;}
          assert.fail('private replay continued after stream exceeded stat size');
        }
        for(let offset=0;offset<data.length;offset+=1048576)yield data.subarray(offset,offset+1048576);
        if(mode==='first read deadline'&&file===proofReads[0])fakeNow+=30000;
      }finally{closed.push(file);}
    };
    f.files.writeFile=async(file,bytes,options)=>{
      if(file===summaryPath){
        summaryWrites++;summaryAttempt=JSON.parse(bytes);
        if(mode==='first read and summary failure')throw Error(summaryError);
      }
      return write(file,bytes,options);
    };

    const run=()=>runProductAudio(caller,{platform:'win32',files:f.files,
      attest:async()=>source,verifyCandidate:async()=>candidate,
      launchVisibilityBrowser:async settings=>{
        launches++;
        assert.equal(settings.productCaseId,caseId);
        assert.equal(settings.productComponentWitness,true);
        await settings.recordBrowserCandidate(await verifyBrowserCandidate(browserCandidate));
        await settings.recordRunJob(binding);
        return {context:{tracing:{start:async()=>assert.fail('unexpected trace launch'),stop:async()=>assert.fail('unexpected trace stop')}},
          runJobOwner:{binding},browserCandidateVersion:'159.0.8132.0',abort:async()=>assert.fail('unexpected launch abort')};
      },
      execute:async options=>{
        await options.dependencies.verifyCandidate(runId,f.files.root,{retainEvidence:true});
        await options.dependencies.launchInstalledExtension({profilePath,extensionPath:candidate.dist});
        const result=await options.dependencies.mediaScenario(f.input);
        report=result.audioProduct;
        assert.equal(report.equalizer.componentWitnessPassed,true,mode);
        await write(trace,Buffer.from('x'),{flag:'wx'});
        if(mode==='rehashed PCM'){
          const {start,end}=report.target;
          let frames=0;
          for(const metadata of report.archive.artifacts.filter(row=>row.kind==='metadata'&&row.start<end&&row.end>start)){
            const meta=JSON.parse(f.saved.get(metadata.file));
            const tap=report.archive.artifacts.find(row=>row.file===meta.streams[3].file);
            assert.equal(tap.role,'component');
            assert.equal(tap.channels,2);
            const pcm=Buffer.from(f.saved.get(tap.file));
            for(let n=Math.max(start,tap.start);n<Math.min(end,tap.end);n++){
              for(let channel=0;channel<2;channel++){
                const offset=((n-tap.start)*2+channel)*4;
                pcm.writeFloatLE(pcm.readFloatLE(offset)*1.1,offset);
              }
              frames++;
            }
            tap.sha256=sha(pcm);f.saved.set(tap.file,pcm);
            meta.streams[3]={...tap};
            const bytes=Buffer.from(JSON.stringify(meta,null,2)+'\n');
            metadata.bytes=bytes.length;metadata.sha256=sha(bytes);f.saved.set(metadata.file,bytes);
          }
          assert.equal(frames,end-start,'mutate the entire component evaluation window');
          // Keep the measured payload self-consistent so the numeric gate owns the rejection.
          report.equalizer=await reassessSavedEqualizer(f.saved,report,spec,true);
          assert.equal(report.equalizer.originalOutputGatesPassed,true);
          assert.equal(report.equalizer.componentWitnessPassed,false);
          assert.deepEqual(report.equalizer.component.failures,[0,1].flatMap(channel=>
            ['fixed-input','transfer','coherent-tone'].map(gate=>`component-channel-${channel}/${gate}`)));
          f.saved.set(assessment,Buffer.from(JSON.stringify(report,null,2)+'\n'));
        }
        if(mode==='first read deadline')fakeNow=1000;
        return {...result,ok:true,runId,profileRetained:true,candidateRetained:true,source,after:source,
          evidence:{profilePath,candidatePath:candidate.root},
          shutdownSelection:{...options.shutdownContract,binding},shutdown};
      },
    });
    try{
      if(reason===null)assert.equal((await run()).ok,true);
      else await assert.rejects(run,error=>{
        assert.equal(error.message,'audio-product-observation-failed',mode);
        assert.equal(error.error?.message,reason,mode);
        assert.deepEqual(error.secondaryErrors.map(row=>row.message),
          mode==='first read and summary failure'?[summaryError]:[],mode);
        return true;
      });
    }finally{fakeNow=null;}

    assert.equal(launches,1,mode);
    assert.equal(summaryWrites,1,mode);
    assert.equal(summaryAttempt.ok,reason===null,mode);
    assert.equal(summaryAttempt.error?.message,reason??undefined,mode);
    assert.equal(f.saved.has(summaryPath),mode!=='first read and summary failure',mode);
    const completeReads=[...proofReads,trace,assessment,...report.archive.artifacts.map(row=>row.file),target];
    const expectedReads=reason===null?[...completeReads,fetchedModule,expectedModule]
      :mode==='rehashed PCM'?completeReads:mode==='aggregate stat cap'?proofReads
        :mode==='stream growth'?[...proofReads,trace]:proofReads.slice(0,1);
    assert.deepEqual(opened,expectedReads,mode);
    assert.deepEqual(closed,expectedReads,mode);
    assert.equal(signals.size,1,mode);
    assert.equal([...signals][0].aborted,true,mode);
    assert.equal(virginTraceStats,expectedReads.includes(trace)||mode==='aggregate stat cap'?1:0,mode);
    assert.deepEqual(yielded,mode==='stream growth'?[1,1]:[],mode);
    t.diagnostic('Gain4 replay PASS: '+mode);
  }
});
