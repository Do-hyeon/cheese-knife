const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sourceModule=async()=>{assert.ok(fs.existsSync('scripts/audio-normalizer-signal-source.mjs'),'dynamic patterns require an independent source/FFT witness');return import('../scripts/audio-normalizer-signal-source.mjs');};
const cases=async()=>{const m=await import('../scripts/audio-l1-normalizer-oracle.mjs');assert.ok(Array.isArray(m.PACKAGED_NORMALIZER_SIGNAL_CASES),'the original six signal cases must have a closed canonical registry');return m.PACKAGED_NORMALIZER_SIGNAL_CASES;};
// Independent literal copy of the original WAV stimulus, not the production source witness.
function sample(s,n){
  if(s.pattern==='silence')return 0;
  const amplitude=Math.SQRT2*10**(s.inputDbfs/20);
  if(s.pattern==='noise')return Math.fround(amplitude*Math.sin(n*123.4567)*Math.sin(n*765.4321));
  if(s.pattern==='tone-silence'&&n>=8*s.sampleRate)return 0;
  const value=amplitude*Math.sin(2*Math.PI*1000*n/s.sampleRate+s.phase);
  return Math.fround(s.pattern==='bursts'?value*((n+Math.round(s.sampleRate*.1*s.phase/(2*Math.PI)))%(s.sampleRate/10)<s.sampleRate/50?1:0):value);
}
function sourceArchive(s,{offset=256,donor=s,mutate}={}){
  const start=1280,end=start+Math.round(s.seconds*s.sampleRate)+128,windows=[];
  return {windows,summary:()=>({sampleRate:s.sampleRate,start,end,bytes:(end-start)*36,cap:96*1024*1024}),window(a,b,stream){assert.equal(stream,1);assert.ok(b-a<=s.sampleRate,'the general15sec capture gate is never bypassed');windows.push([a,b]);const data=Float32Array.from({length:b-a},(_,i)=>sample(donor,offset+a-start+i));if(mutate)mutate(data,a,b);return {rate:s.sampleRate,start:a,end:b,channels:[data,data.slice()]};}};
}
test('all six original dynamic cases are fixed at each original rate with no generic spec parser',async()=>{
  const list=await cases(),{NORMALIZER_CONTROL_CASES}=await import('../scripts/extension-e2e/audio-normalizer-control.mjs'),{selectProductCase,parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  assert.equal(list.length,18);assert.equal(NORMALIZER_CONTROL_CASES.length,21);
  for(const rate of [44100,48000,96000]){const rows=list.filter(s=>s.sampleRate===rate);assert.equal(rows.length,6);assert.deepEqual(rows.map(s=>[s.pattern,s.inputDbfs,s.phase,s.seconds]),[['silence',-24,.37,3.5],['noise',-70,.37,3.5],['bursts',-24,.1,8],['bursts',-24,2.1,8],['bursts',-24,4.1,8],['tone-silence',-36,.37,17.5]]);}
  for(const s of list){assert.ok(Object.isFrozen(s));assert.deepEqual(selectProductCase(s.id),s);assert.equal(parseProductAudioArgs(['--run-id=Signals','--case='+s.id]).caseId,s.id);assert.throws(()=>parseProductAudioArgs(['--run-id=Signals','--case='+s.id,'--component-witness']));assert.throws(()=>selectProductCase(s.id+'/forged'));}
});
for(const pattern of ['silence','noise','bursts','tone-silence'])test('one global canonical Float32 source offset covers '+pattern+' and its final partial window',async()=>{
  const {createNormalizerSignalSource}=await sourceModule(),s=(await cases()).find(s=>s.sampleRate===44100&&s.pattern===pattern),a=sourceArchive(s),w=createNormalizerSignalSource(a,s,1280);
  assert.equal(w.report.status,'EXACT_FLOAT32_COMPATIBILITY');assert.equal(w.report.frameOrigin,'UNPROVEN');assert.equal(w.report.end,a.summary().end);assert.equal(a.windows.at(-1)[1],a.summary().end);
  if(pattern==='silence')assert.equal(w.report.wavOffset,null);else assert.ok(Number.isSafeInteger(w.report.wavOffset));
});
test('noise identity never certifies a phase or original PCM rate which its formula does not encode',async()=>{
  const {createNormalizerSignalSource}=await sourceModule(),s=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='noise'),a=sourceArchive(s,{donor:{...s,sampleRate:48000,phase:2.1}}),w=createNormalizerSignalSource(a,s,1280);
  assert.equal(w.report.pcmRateProven,false);assert.equal(w.report.absolutePhaseProven,false);assert.equal(w.report.status,'EXACT_FLOAT32_COMPATIBILITY');
});
test('a fully relabelled burst phase donor cannot borrow a fresh offset for each window',async()=>{
  const {createNormalizerSignalSource}=await sourceModule(),list=await cases(),s=list.find(s=>s.sampleRate===44100&&s.pattern==='bursts'&&s.phase===2.1),donor=list.find(s=>s.sampleRate===44100&&s.pattern==='bursts'&&s.phase===.1);
  assert.throws(()=>createNormalizerSignalSource(sourceArchive(s,{donor}),s,1280),/source-identity/);
});
test('tone-return source identity includes a corruption in the last half second',async()=>{
  const {createNormalizerSignalSource}=await sourceModule(),s=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence'),a=sourceArchive(s,{mutate:(data,a)=>{if(a>=1280+17*s.sampleRate)data[data.length-1]=.001;}});
  assert.throws(()=>createNormalizerSignalSource(a,s,1280),/source-identity/);
});
function expectedPower(s,offset,sourceStart,end,fft,delay){let sum=0;for(let n=end-delay-fft;n<end-delay;n++){const v=sample(s,offset+n-sourceStart);sum+=v*v;}return sum/fft;}
test('FFT matches an actual finite endpoint with compDelay and never zero-pads required history',async()=>{
  const {createNormalizerSignalSource}=await sourceModule(),s=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='bursts'),a=sourceArchive(s),w=createNormalizerSignalSource(a,s,1280),fft=16384,end=Math.ceil((1280+fft+264)/128)*128+1024;
  const attempt={index:0,time:end/s.sampleRate,size:fft},read={index:0,time:end/s.sampleRate,size:fft,power:expectedPower(s,256,1280,end,fft,264)};
  const r=w.fft(attempt,read,true);assert.equal(r.status,'COMPATIBLE');assert.equal(r.delayFrames,264);assert.equal(r.candidateCount,2);assert.equal(r.endpointProven,false);
  const early={...attempt,time:1280/s.sampleRate},earlyRead={...read,time:1280/s.sampleRate};assert.throws(()=>w.fft(early,earlyRead,true),/fft-history/);assert.equal(w.fft(early,earlyRead,false).status,'UNUSED_HISTORY');
});
test('FFT min/max alone cannot accept a power that matches no actual endpoint',async()=>{
  const {createNormalizerSignalSource}=await sourceModule(),s=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='bursts'),a=sourceArchive(s),w=createNormalizerSignalSource(a,s,1280),fft=16384;
  let end,lo,hi;
  for(let e=Math.ceil((1280+fft+264)/128)*128;e<1280+2*s.sampleRate;e+=128){const p=expectedPower(s,256,1280,e,fft,264),q=expectedPower(s,256,1280,e+128,fft,264);if(p>0&&q>0&&Math.abs(10*Math.log10(p/q))>.12){end=e;lo=Math.min(p,q);hi=Math.max(p,q);break;}}
  assert.ok(end,'the counterexample must have separated candidate powers');const power=Math.sqrt(lo*hi),r=w.fft({index:0,size:fft,time:end/s.sampleRate},{index:0,size:fft,time:end/s.sampleRate,power},true);assert.ok(power>=r.minPower&&power<=r.maxPower);assert.equal(r.status,'MISMATCH');assert.equal(r.matchedCount,0);
});

let normalizer;
function productNormalizer(){
  return normalizer??=import('../src/main/features/audio/normalizer.ts');
}
const clone=structuredClone,cmd=(seq,n)=>({kind:'configure',sourceEpoch:1,seq,wanted:true,gain:1,eq:Array(8).fill(0),normalizer:n,dynamics:n,targetDbfs:-20});
const reply=(kind,seq,frame,epoch)=>({kind,sourceEpoch:1,seq,frame,meterEpoch:epoch,gain:kind==='completed'?1:null,code:null});
async function signalFixture(s,k,warmup=false){
  k??=await productNormalizer();
  const rate=s.sampleRate,fft=2**Math.ceil(Math.log2(rate*.25)),D=rate===44100?264:rate===48000?288:576,first=Math.ceil((warmup?.45:.1)*rate/128)*128,markerFrame=first+128,end=markerFrame+Math.round(s.seconds*rate),cutoff=Math.ceil(end/128)*128+128;
  const source=Float32Array.from({length:cutoff},(_,n)=>sample(s,n)),prefix=new Float64Array(cutoff+1);for(let i=0;i<source.length;i++)prefix[i+1]=prefix[i]+source[i]**2;
  const analyserFirst=first-128;
  const power=e=>{
    if(!warmup)return (prefix[Math.max(0,e-D)]-prefix[Math.max(0,e-D-fft)])/fft;
    let sum=0;
    for(let n=Math.max(analyserFirst,e-fft)-D;n<e-D;n++)sum+=source[n]**2;
    return sum/fft;
  };
  const prepared=reply('prepared',0,0,0),baseline={requestedFrame:0,message:cmd(1,false)},targetCommand={requestedFrame:Math.round(.05*rate),message:cmd(2,true)},initialReplies=[prepared,reply('accepted',1,0,1),reply('completed',1,Math.ceil(.03*rate+D),1)],targetReplies=[reply('accepted',2,Math.round(.05*rate),2),reply('completed',2,Math.round(.07*rate),2)];
  const initial={available:true,reason:null,sourceEpoch:1,initial:'raw',normalizerWitness:true},events=[],reads=[],ticks=[],attempts=[],applications=[];const add=(direction,packet)=>events.push({order:events.length+1,direction,packet});
  add('receive',prepared);add('send',baseline.message);initialReplies.slice(1).forEach(p=>add('receive',p));add('send',targetCommand.message);targetReplies.forEach(p=>add('receive',p));
  const n=k.createNormalizer(rate);
  for(let ordinal=0;;ordinal++){
    const frame=Math.floor((first+ordinal*rate/10)/128)*128;if(frame>cutoff)break;const time=frame/rate,p=power(frame),startRead=reads.length,startAttempt=attempts.length,seq=ordinal+1;
    for(let index=0;index<2;index++){attempts.push({ordinal:attempts.length+1,index,time,wall:time*1000,size:fft,powerReadCursor:reads.length,fault:false,error:null});reads.push({index,time,power:p,size:fft});}
    if(ordinal)ticks.push({ordinal,startRead,endRead:reads.length,startTime:time,endTime:time,startAttempt,endAttempt:attempts.length,startWall:time*1000,endWall:time*1000});
    const packet={kind:'power',sourceEpoch:1,meterEpoch:2,meterSeq:seq,observedTime:time,active:true,leftPower:p,rightPower:p,targetDbfs:-20};add('send',packet);
    const plan=clone(k.stepNormalizer(n,{time,leftPower:p,rightPower:p,targetDbfs:-20,active:true})),application={sourceEpoch:1,meterEpoch:2,meterSeq:seq,commandSeq:2,frame,...plan};applications.push(application);add('receive',{...reply('meter-accepted',seq,frame,2),code:plan.mode,application});
  }
  function dbAt(frame){let lo=0,hi=applications.length-1,found=null;while(lo<=hi){const mid=(lo+hi)>>1;if(applications[mid].frame<=frame){found=applications[mid];lo=mid+1;}else hi=mid-1;}return found?k.normalizerDbAt(found,frame/rate):0;}
  const base={sampleRate:rate,sources:1,hidden:false,contextState:'running',filters:0,gains:[1,0,0,1,1,0,1,0],events:[],steps:[],linearEvents:[],signal:{frequency:1000,inputDbfs:s.inputDbfs,pattern:s.pattern,phase:s.phase,channels:2,durationSeconds:90,frames:90*rate,loop:false,error:''},video:{muted:false,volume:1,loop:false,ended:false,paused:false,playbackRate:1,currentTime:cutoff/rate},readback:{state:'on',sources:1,wanted:true,gain:1,appliedGain:1}};
  const before={...clone(base),audioTime:.04,analysers:0,buffers:0,reads:0,active100msTimers:0,normalizerMeasurement:null,oracleEvidence:{schema:'f01-oracle-evidence-v2',initial},productObservation:{sources:1,l1Nodes:1,invalidFrames:0,streamError:'',commands:[baseline],replies:initialReplies,meterDiagnostics:{sent:0,received:0}}};
  const measurement={frame:markerFrame,powerReadCursor:2,meterTickCursor:0,sourceEpoch:1,commandSeq:2},stamp=frame=>({frame,time:frame/rate,wall:frame/rate*1000,powerReadCursor:frame===markerFrame?2:reads.length,meterTickCursor:frame===markerFrame?0:ticks.length,attemptCursor:frame===markerFrame?2:attempts.length,sourceEpoch:1,commandSeq:2});
  const ledger={schema:'f01-control-ledger-v2',available:true,reason:null,maxEvents:4128,maxBytes:1048576,eventCount:events.length,bytes:0,events};ledger.bytes=Buffer.byteLength(JSON.stringify(ledger))+2048;
  const facts={...clone(base),audioTime:cutoff/rate,analysers:2,fftSizes:[fft,fft],buffers:2,reads:attempts.length,active100msTimers:1,powerReads:reads,meterTickReads:ticks,normalizerMeasurement:measurement,normalizerSettings:{normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false},oracleEvidence:{schema:'f01-oracle-evidence-v2',initial,ledger},normalizerControl:{signalObservation:true,events:[],attempts,measurement:stamp(markerFrame),observedAt:stamp(cutoff),frozenAt:stamp(cutoff),signalEndFrame:end},productObservation:{sources:1,l1Nodes:1,invalidFrames:0,streamError:'',commands:[baseline,targetCommand],replies:[...initialReplies,...targetReplies],meterDiagnostics:{sent:applications.length,received:applications.length}}};
  const request={status:'on',frame:Math.round(.05*rate)},target=(await import('../scripts/audio-l1-normalizer-oracle.mjs')).selectNormalizerTarget(facts,before,request,s),proof={spec:clone(s),beforeTarget:before,request,target,measurement:clone(measurement),events:[],signalWindow:{start:markerFrame,end}};
  const archive={summary:()=>({sampleRate:rate,start:0,end:cutoff,bytes:cutoff*36,cap:96*1024*1024}),window(a,b,stream=0){const data=stream===2?[-1,1,1,null,0].map((v,c)=>Float32Array.from({length:b-a},(_,i)=>c===3?10**(dbAt(a+i)/20):v)):Array.from({length:2},()=>Float32Array.from({length:b-a},(_,i)=>stream===1?source[a+i]:(source[a+i-D]??0)*10**(dbAt(a+i)/20)));return {rate,start:a,end:b,channels:data};}};
  return {s,before,facts,proof,archive,source,applications,markerFrame,end,cutoff,analyserFirst};
}
for(const rate of [44100,48000,96000])for(const [pattern,phase]of [['silence',.37],['noise',.37],['bursts',.1],['bursts',2.1],['bursts',4.1],['tone-silence',.37]])test('original '+rate+'/'+pattern+'/'+phase+' consumes product N and full fixed source/FFT history',async()=>{
  const s=(await cases()).find(s=>s.sampleRate===rate&&s.pattern===pattern&&s.phase===phase),f=await signalFixture(s),m=await import('../scripts/extension-e2e/audio-normalizer-control.mjs');let r;
  assert.doesNotThrow(()=>{r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,s);},'the explicit signal profile needs its original assessor');assert.equal(r.passed,true,JSON.stringify(r));assert.equal(r.qualityAssessed,false);assert.equal(r.coverage.end,f.end);assert.equal(r.sourceIdentity.status,'EXACT_FLOAT32_COMPATIBILITY');assert.equal(r.native7Witness,'UNASSESSED');assert.equal(r.overallQualification,false);
  if(pattern==='tone-silence'){assert.equal(r.silenceReturnUnity,true);assert.ok(r.silentPlans>10);assert.equal(r.coverage.frames,17.5*rate);}else if(pattern==='bursts')assert.equal(r.burstFinite,true);else assert.equal(r.noBoost,true);
});
test('quiet actual N cannot use the looser .001dB diagnostic to evade linear no-boost1.00001',async()=>{
  const s=(await cases()).find(s=>s.sampleRate===48000&&s.pattern==='noise'),f=await signalFixture(s),m=await import('../scripts/extension-e2e/audio-normalizer-control.mjs'),window=f.archive.window;
  f.archive.window=(a,b,stream)=>{const w=window(a,b,stream);if(stream===2)for(let i=Math.max(0,f.markerFrame-a);i<b-a;i++)w.channels[3][i]=Math.fround(1.00002);return w;};
  const r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,s);assert.equal(r.passed,false);assert.ok(r.failures.includes('normalizer-control-no-boost'));assert.ok(!r.failures.some(v=>v.startsWith('normalizer-control-N')));
});
test('tone-return compares the last half second of N instead of truncating at15seconds',async()=>{
  const s=(await cases()).find(s=>s.sampleRate===48000&&s.pattern==='tone-silence'),f=await signalFixture(s),m=await import('../scripts/extension-e2e/audio-normalizer-control.mjs'),window=f.archive.window;
  f.archive.window=(a,b,stream)=>{const w=window(a,b,stream);if(stream===2&&b>f.end-48000/2)w.channels[3][Math.max(0,f.end-48000/2-a)]=1.1;return w;};
  const r=m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,s);assert.equal(r.passed,false);assert.ok(r.failures.some(v=>v.startsWith('normalizer-control-N')));
});

async function scenarioFixture(s,hooks={},normalizer){
  const f=await signalFixture(s,normalizer,hooks.warmup),rate=s.sampleRate,path=require('node:path'),saved=new Map(),module=Buffer.from('signal synthetic module'),directory='output/playwright/installed-extension-SignalUnit';let position=0,on=false,posted=false,frozen=null;const captures=[],calls=[],requests=[];
  const files={root:process.cwd(),readdir:async p=>[{name:p==='dist'?'web':'audio-transition-worklet.js',isDirectory:()=>p==='dist',isFile:()=>p==='dist/web',isSymbolicLink:()=>false}],ensureDirectory:async()=>{},lstat:async p=>saved.has(p)?{isFile:()=>true,size:saved.get(p).length}:null,readFile:async(p,encoding)=>{const data=saved.get(p)??(p.endsWith('audio-transition-worklet.js')?module:p.startsWith('tests/')?Buffer.from('<html></html>'):null);if(!data)throw Error('missing '+p);return encoding?data.toString(encoding):data;},writeFile:async(p,data,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(p));saved.set(p,Buffer.from(data));if(hooks.write)await hooks.write(p);}};
  const current=full=>{
    if(frozen)return clone(frozen);
    const x=clone(posted?f.facts:f.before),time=position/rate;x.audioTime=time;x.video.currentTime=time;Object.assign(x.productObservation,{sources:on?1:0,l1Nodes:on?1:0,sourceFrame:on?0:null,commonStart:on?0:Infinity,commonEnd:position,moduleLoads:['chrome-extension://actual/web/audio-transition-worklet.js']});x.sources=on?1:0;
    if(!posted)return x;
    x.powerReads=x.powerReads.filter(p=>p.time<=time);x.meterTickReads=x.meterTickReads.filter(t=>t.endTime<=time);x.normalizerControl.attempts=x.normalizerControl.attempts.filter(a=>a.time<=time);x.reads=x.normalizerControl.attempts.length;
    x.normalizerControl.observedAt={frame:position,time,wall:time*1000,powerReadCursor:x.powerReads.length,meterTickCursor:x.meterTickReads.length,attemptCursor:x.reads,sourceEpoch:1,commandSeq:2};x.normalizerControl.frozenAt=null;x.normalizerControl.signalEndFrame=null;
    x.oracleEvidence.ledger.events=x.oracleEvidence.ledger.events.filter(e=>e.direction==='send'&&e.packet.kind!=='configure'?e.packet.observedTime<=time:typeof e.packet.frame==='number'?e.packet.frame<=position:true);
    const l=x.oracleEvidence.ledger;l.events.forEach((e,i)=>e.order=i+1);l.eventCount=l.events.length;l.bytes=0;l.bytes=Buffer.byteLength(JSON.stringify(l))+2048;
    const count=l.events.filter(e=>e.direction==='send'&&e.packet.kind!=='configure').length;x.productObservation.meterDiagnostics={sent:count,received:count};if(!full)delete l.events;return x;
  };
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},locator:()=>({click:async()=>{on=true;position=Math.floor(.04*rate/128)*128;}}),waitForTimeout:async ms=>{position=Math.min(f.cutoff,Math.ceil((position+Math.round(ms*rate/1000))/128)*128);if(hooks.pause)await hooks.pause(ms);},evaluate:async(fn,arg)=>{
    if(fn.name==='installProcessingProbe'){assert.equal(arg.normalizerSignal,true);assert.equal(arg.normalizerControl,true);assert.equal(arg.retainSignal,s.id==='44100/normalizer-control/tone-silence'?true:undefined);return;}
    calls.push(arg.kind);requests.push(arg);
    if(arg.kind==='signal'){assert.equal(arg.phase,s.phase);assert.equal(arg.pattern,s.pattern);return;}
    if(arg.kind==='video')return;
    if(arg.kind==='configure'){on=arg.enabled;if(arg.config.normalizerEnabled){posted=true;position=f.markerFrame;return clone(f.proof.request);}return {status:on?'on':'off',frame:position};}
    if(arg.kind==='reset-events')return clone(f.proof.measurement);
    if(arg.kind==='freeze-normalizer'){
      assert.equal(arg.endFrame,f.end);
      if(hooks.freeze)return hooks.freeze(arg,current);
      if(arg.waitForReady&&position<f.end){
        const live=current(false);
        if(hooks.facts)await hooks.facts(live);
        delete live.meterTickReads;delete live.bins;delete live.powerReads;
        return live;
      }
      frozen=current(true);frozen.normalizerControl.frozenAt=clone(frozen.normalizerControl.observedAt);frozen.normalizerControl.signalEndFrame=arg.endFrame;
      if(hooks.frozen)hooks.frozen(frozen,f);
      return clone(frozen);
    }
    if(arg.kind==='retained-analyser-chunk'&&hooks.analyserChunk)return hooks.analyserChunk(arg.start);
    if(arg.kind==='analysis-error'){assert.equal(arg.enabled,false);return null;}
    if(arg.kind==='facts'){const value=current(arg.fullOracle===true);if(hooks.facts)await hooks.facts(value);return value;}
    if(arg.kind==='l1-partial')return {streams:[],normalizerControl:current(true).normalizerControl};
    if(arg.kind==='product-capture'){
      const a=arg.startFrame,b=arg.endFrame,x=current(false);captures.push([a,b]);const raw={schema:'f01-product-window-v1',sampleRate:rate,start:a,end:b,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',commands:clone(x.productObservation.commands),replies:clone(x.productObservation.replies),normalizerControlEvents:[],streams:[2,2,5].map((channels,stream)=>{const w=f.archive.window(a,b,stream),data=Buffer.alloc((b-a)*channels*4);for(let n=0;n<b-a;n++)for(let c=0;c<channels;c++)data.writeFloatLE(w.channels[c][n],(n*channels+c)*4);return {start:a,end:b,channels,encoding:'interleaved-float32le',base64:data.toString('base64')};})};if(frozen&&s.id==='44100/normalizer-control/tone-silence')Object.assign(raw,{recordingCutoff:clone(frozen.normalizerControl.frozenAt),audioTime:frozen.audioTime,mediaTime:frozen.video.currentTime,readback:clone(frozen.readback)});if(arg.timing)raw.collectionTiming={start:a,end:b,sampleRate:rate,elapsedMs:4,pcmMs:1,encodeMs:2};if(hooks.capture)await hooks.capture(raw,captures);return raw;
    }
    throw Error('unexpected '+arg.kind);
  }};
  const input={context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async(_fn,arg)=>typeof arg==='string'?Array.from(module):undefined},extensionId:'actual',artifactPath:path.join(files.root,directory)};
  const execute=async()=>{const m=await import('../scripts/extension-e2e/audio-product.mjs');return m.runProductNormalizerControlScenario(input,files,{dist:path.join(files.root,'dist')},s);};
  return {s,f,files,input,execute,saved,directory,captures,calls,requests};
}

test('warmup failure replays original saved PCM and needs a sealed, on-time getter export',async()=>{
  const {replayWarmupFailure}=await import('../scripts/check-product-audio.mjs');
  assert.equal(typeof replayWarmupFailure,'function');
  const {writeWarmupExport}=await import('../scripts/extension-e2e/audio-warmup-diagnostic.mjs');
  const sha=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  const spec=(await cases()).find(row=>row.id==='44100/normalizer-control/tone-silence');
  let raw;
  const f=await scenarioFixture(spec,{warmup:true,
    frozen(facts,fixture){
      const events=facts.oracleEvidence.ledger.events,reads=facts.powerReads,first=fixture.analyserFirst,ticks=[];
      raw=Buffer.alloc(reads.length*65536);
      for(let i=0;i<reads.length;i+=2){
        const meterSeq=i/2+1,time=reads[i].time,end=Math.round(time*44100),written=end-first,used=Math.min(written,16384);
        for(let side=0;side<2;side++)for(let n=0;n<used;n++)raw.writeFloatLE(fixture.source[end-264-used+n],(i+side)*65536+(16384-used+n)*4);
        ticks.push({meterSeq,observedTime:time,postOrder:events.find(e=>e.packet.kind==='power'&&e.packet.meterSeq===meterSeq).order,
          ackOrder:events.find(e=>e.packet.kind==='meter-accepted'&&e.packet.seq===meterSeq).order,
          reads:[0,1].map(side=>({attempt:i+side+1,powerReadCursor:i+side,cursor:[meterSeq,written%65536,written,first,end,end,end]}))});
      }
      facts.retainedAnalyserProof={firstError:null,target:[1,2,2],cutoffFrame:facts.normalizerControl.frozenAt.frame,
        nativeCounts:[ticks.length,ticks.length],rawRows:reads.length,ticks};
    },
    analyserChunk(start){const end=Math.min(start+16,raw.length/65536);return {start,end,base64:raw.subarray(start*65536,end*65536).toString('base64')};},
  });
  const {files,saved,directory:artifact}=f;
  saved.set('extension/web/audio-transition-worklet.js',await files.readFile('extension/web/audio-transition-worklet.js'));
  files.readChunks=async function*(file){yield await files.readFile(file);};
  await assert.rejects(f.execute,/control-or-observation-failed/);
  const assessmentPath=artifact+'/assessment.json',assessment=saved.get(assessmentPath),report=JSON.parse(assessment);
  assert.equal(report.outcome,'FAIL');
  assert.ok(report.control.failures.includes('normalizer-control-fft-source'));
  const proof=report.facts.retainedAnalyserProof,{ticks,cutoffFrame:cutoff}=proof,events=report.facts.oracleEvidence.ledger.events,first=f.f.analyserFirst;
  const partial=JSON.parse(saved.get(artifact+'/partial.json')),completion=partial.warmupExport;
  assert.match(partial.error,/control-or-observation-failed/);
  assert.ok(completion,JSON.stringify(partial.secondary));
  assert.ok(f.calls.indexOf('retained-analyser-chunk')>f.calls.indexOf('l1-partial'));
  const binding={runId:'SignalUnit',assessmentSha256:sha(assessment),targetSha256:sha(saved.get(artifact+'/normalizer-control-target.json'))};
  const graph={...binding,caseId:spec.id,target:[1,2,2],cutoffFrame:cutoff,firstWrites:[first,first],
    clock:'native-frame',delayFrames:264,sourceStream:1,continuous:true,ports:['source','left','right'],candidateSha256:'a'.repeat(64)};
  const run=(completion,physical=graph,expectedSha)=>{const seal=Buffer.from(JSON.stringify({graph:physical,completion}));return replayWarmupFailure(files,{runId:binding.runId,candidateSha256:graph.candidateSha256,seal,sealSha256:expectedSha??sha(seal)});};
  assert.equal((await replayWarmupFailure(files)).state,'UNFORMED');
  assert.equal((await run(null)).state,'UNFORMED');
  const chunk=(start,end)=>raw.subarray(start*65536,end*65536);
  const exportOptions={...binding,artifact,proof,archiveBytes:report.archive.bytes,scenarioDeadline:100,readRows:chunk};
  const result=await run(completion);
  assert.equal(result.state,'COMPATIBLE',JSON.stringify(result));
  assert.equal(result.originalOutcome,'FAIL');
  assert.equal(result.rows.length,report.control.fftCompatibility.records.filter(row=>row.status==='MISMATCH'&&events[ticks[row.meterSeq-1].ackOrder-1].packet.application.mode==='warmup').length);
  assert.ok(result.rows.length>0);
  assert.deepEqual(saved.get(assessmentPath),assessment);
  for(const [receipt,lineage,pin] of [[{...completion,completedAt:completion.deadline},graph],[{...completion,runId:'Donor'},graph],
    [completion,{...graph,target:[1,3,2]}],[completion,{...graph,firstWrites:[first+128,first]}],
    [completion,{...graph,continuous:false}],[completion,{...graph,candidateSha256:'b'.repeat(64)}],[completion,graph,'f'.repeat(64)]]){
    assert.equal((await run(receipt,lineage,pin)).state,'UNFORMED');
  }
  const partialFile=artifact+'/partial.json',partialBytes=saved.get(partialFile);
  saved.set(partialFile,Buffer.from(JSON.stringify({...partial,warmupExport:undefined})));
  assert.equal((await run(completion)).reason,'audio-product-warmup-export-receipt');
  const lateReceipt={...completion,completedAt:completion.deadline};
  saved.set(partialFile,Buffer.from(JSON.stringify({...partial,warmupExport:lateReceipt})));
  assert.equal((await run(lateReceipt)).reason,'audio-product-warmup-export-completion');
  saved.set(partialFile,partialBytes);
  const index=saved.get(artifact+'/analyser-pcm.json');saved.delete(artifact+'/analyser-pcm.json');
  assert.equal((await run(completion)).state,'UNFORMED');
  saved.set(artifact+'/analyser-pcm.json',index);
  const chunkFile=artifact+'/analyser-pcm-0.f32le',previous=saved.get(chunkFile);
  saved.set(chunkFile,Buffer.alloc(previous.length));
  assert.equal((await run(completion)).state,'UNFORMED');
  saved.set(chunkFile,previous);
  for(const [mutate,reason] of [
    [p=>{const c=p.ticks[0].reads[1].cursor;c[2]+=65536;c[4]+=65536;},'getter-cursor'],
    [p=>{p.ticks[1].ackOrder=p.ticks[0].ackOrder;},'getter-ack'],
    [p=>{p.ticks[0].reads[1].powerReadCursor=0;},'getter-binding'],
  ]){
    const donor=clone(report),idx=JSON.parse(index);
    mutate(donor.facts.retainedAnalyserProof);idx.proof=donor.facts.retainedAnalyserProof;
    const assessment=Buffer.from(JSON.stringify(donor)),exported=Buffer.from(JSON.stringify(idx));
    const receipt={...completion,assessmentSha256:sha(assessment),indexSha256:sha(exported)};
    saved.set(assessmentPath,assessment);saved.set(artifact+'/analyser-pcm.json',exported);
    saved.set(partialFile,Buffer.from(JSON.stringify({...partial,warmupExport:receipt})));
    assert.deepEqual(await run(receipt,{...graph,assessmentSha256:receipt.assessmentSha256}),
      {state:'UNFORMED',reason:'audio-product-warmup-'+reason});
  }
  saved.set(assessmentPath,assessment);saved.set(artifact+'/analyser-pcm.json',index);saved.set(partialFile,partialBytes);
  const late=new Map();let clock=90.25;
  await assert.rejects(writeWarmupExport({
    writeFile:async(file,bytes)=>late.set(file,bytes),
    async *readChunks(file){yield late.get(file);if(file.endsWith('/analyser-pcm.json'))clock=100;},
  },exportOptions,()=>clock),/warmup-export-deadline/);
  assert.ok(late.has(artifact+'/analyser-pcm.json'));
});
async function wrapper(f,mutate){
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),path=require('node:path'),source={sourceSha256:'signal-unit-source'},candidate={root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  return runProductAudio({runId:'SignalUnit',caseId:f.s.id},{platform:'win32',files:f.files,attest:async()=>source,verifyCandidate:async()=>candidate,execute:async options=>{
    await options.dependencies.verifyCandidate('SignalUnit',process.cwd(),{retainEvidence:true});const r=await options.dependencies.mediaScenario(f.input);await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('synthetic trace'),{flag:'wx'});if(mutate)await mutate(r,f.saved);
    return {...r,ok:true,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},source,after:source};
  }});
}

test('tone silence product replays only bound complete files after the first close failure and stays failed',async t=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs');
  const normalizer=await import('../src/main/features/audio/normalizer.ts');
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
  const sha=b=>createHash('sha256').update(b).digest('hex');
  const browserRoot=await fs.mkdtemp(path.join(os.tmpdir(),'knife-close-replay-'));
  t.after(async()=>{await fs.unlink(path.join(browserRoot,'chrome.exe'));await fs.unlink(path.join(browserRoot,'browser-candidate.json'));await fs.rmdir(browserRoot);});
  const payload=Buffer.from('inert browser test data');await fs.writeFile(path.join(browserRoot,'chrome.exe'),payload);
  const manifest=Buffer.from(JSON.stringify({schema:'f01-browser-candidate-v1',root:browserRoot,version:'159.0.8132.0',revision:'c409acbc7ae0155eb173d8d5b9fd815e244dbf97',platform:'win32',arch:'x64',executable:'chrome.exe',buildArgs:{is_debug:true,is_component_build:true,symbol_level:0,blink_symbol_level:0,v8_symbol_level:0,target_cpu:'x64',use_remoteexec:false,use_siso:true},files:[{path:'chrome.exe',bytes:payload.length,sha256:sha(payload)}]}));
  await fs.writeFile(path.join(browserRoot,'browser-candidate.json'),manifest);
  const selection={root:browserRoot,manifestSha256:sha(manifest)},{verifyBrowserCandidate}=await import('../scripts/extension-e2e/harness.mjs');
  const browserEvidence=await verifyBrowserCandidate(selection),source={sourceSha256:'signal-unit-source'},candidate={root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  const s=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence');
  const realTimer=globalThis.setTimeout,now=performance.now.bind(performance);let fastReplay=false,offset=0;
  t.mock.method(globalThis,'setTimeout',(callback,ms,...args)=>realTimer(callback,fastReplay&&ms===30000?15:ms,...args));
  t.mock.method(performance,'now',()=>now()+offset);
  for(const fault of [null,'tail','donor','saved-donor','prior-failure','changed-source','hung-stat','root-unknown','late-root']){
    fastReplay=false;offset=0;
    const f=await scenarioFixture(s,{},normalizer),profilePath=path.join(f.files.root,'output/playwright/installed-profile-signal-unit');
    let launches=0,attestations=0,replayReads=0,aborts=0;
    const stat=f.files.lstat;
    f.files.lstat=async file=>{
      if(file===f.directory+'/trace.zip'&&fault==='hung-stat')return new Promise(()=>{});
      return file==='extension/web/audio-transition-worklet.js'?{isFile:()=>true,size:(await f.files.readFile(file)).length}:stat(file);
    };
    f.files.readChunks=async function*(file){if(file.endsWith('.f32le'))replayReads++;yield await this.readFile(file);};
    const close=Object.assign(Error('native-unavailable'),{code:'native-unavailable'});
    await assert.rejects(()=>runProductAudio({runId:'SignalUnit',caseId:s.id,browserCandidate:selection},{platform:'win32',files:f.files,
      attest:async()=>++attestations>1&&fault==='changed-source'?{sourceSha256:'changed'}:source,verifyCandidate:async()=>candidate,
      launchVisibilityBrowser:async settings=>{launches++;await settings.recordBrowserCandidate(browserEvidence);
        return {context:{tracing:{start:async()=>{},stop:async()=>{}}},browserCandidateVersion:'159.0.8132.0',
          browserRootExited:()=>fault!=='root-unknown',abort:async()=>{aborts++;if(fault==='late-root')offset+=15000;}};},
      execute:async options=>{
        await options.dependencies.verifyCandidate('SignalUnit',process.cwd(),{retainEvidence:true});
        await options.dependencies.launchInstalledExtension({profilePath,extensionPath:candidate.dist});
        if(fault==='prior-failure')throw Error('capture-original');
        const r=await options.dependencies.mediaScenario(f.input);
        await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('synthetic trace'),{flag:'wx'});
        const report={...r,runId:fault==='donor'?'Donor':'SignalUnit',qualification:'media-tab',ok:false,shutdown:null,
          profileRetained:true,candidateRetained:true,evidence:{retained:true,profilePath,candidatePath:candidate.root},source,after:source};
        const browser=new (require('node:events').EventEmitter)();browser.isConnected=()=>false;
        await assert.rejects(()=>options.dependencies.closeInstalledMediaBrowser({context:{browser:()=>browser},profilePath,
          browserSession:{send:async()=>{throw close;}}}),error=>error===close&&error.forcedRetirement===true);
        await f.files.writeFile(f.directory+'/summary.json',JSON.stringify(fault==='saved-donor'?{...report,runId:'Donor'}:report),{flag:'wx'});
        if(fault==='tail')f.saved.delete(r.audioProduct.archive.artifacts.filter(row=>row.kind!=='metadata').at(-1).file);
        options.dependencies.recordToneSilenceCloseFailure?.(close,report);fastReplay=fault==='hung-stat';throw close;
      }}),/audio-product-observation-failed/);
    const summary=JSON.parse(f.saved.get('output/audio-product-SignalUnit/summary.json'));
    assert.equal(summary.ok,false);assert.equal(launches,1);assert.equal(summary.error.message,fault==='prior-failure'?'capture-original':'native-unavailable');
    assert.equal(aborts,fault==='prior-failure'?0:1);
    assert.equal(summary.closeFailureReplay?.status,fault===null?'PASS':['tail','saved-donor','hung-stat'].includes(fault)?'REJECTED':'UNASSESSED',JSON.stringify({fault,replay:summary.closeFailureReplay}));
    if(fault==='hung-stat')assert.match(summary.closeFailureReplay.error.message,/tone-silence-close-replay/);
    assert.equal(replayReads>0,fault===null||fault==='tail',fault);
  }
});

test('product run-job replay binds retained launch evidence to immutable caller selection and rejects donors',async t=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),{verifyBrowserCandidate}=await import('../scripts/extension-e2e/harness.mjs');
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto'),sha=b=>createHash('sha256').update(b).digest('hex');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'knife-job-replay-')),browserRoot=path.join(temp,'browser');await fs.mkdir(browserRoot);
  t.after(async()=>{assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});});
  const payload=Buffer.from('inert candidate bytes');await fs.writeFile(path.join(browserRoot,'chrome.exe'),payload);
  const manifest={schema:'f01-browser-candidate-v1',root:browserRoot,version:'159.0.8132.0',revision:'c409acbc7ae0155eb173d8d5b9fd815e244dbf97',platform:'win32',arch:'x64',executable:'chrome.exe',buildArgs:{is_debug:true,is_component_build:true,symbol_level:0,blink_symbol_level:0,v8_symbol_level:0,target_cpu:'x64',use_remoteexec:false,use_siso:true},files:[{path:'chrome.exe',bytes:payload.length,sha256:sha(payload)}]},manifestBytes=Buffer.from(JSON.stringify(manifest));
  await fs.writeFile(path.join(browserRoot,'browser-candidate.json'),manifestBytes);
  const selection={root:browserRoot,manifestSha256:sha(manifestBytes)},helper={path:path.join(temp,'helper.exe'),sha256:sha('inert helper bytes')};await fs.writeFile(helper.path,'inert helper bytes');
  const s=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence');
  for(const fault of [null,'nonce','helper','helper-pid','helper-created','version','prelaunch','saved-binding','old-proof','source-donor','profile-donor','run-donor','selection-donor']){
    const f=await scenarioFixture(s),source={sourceSha256:'signal-unit-source'},candidate={root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
    const binding={nonce:'c'.repeat(64),pid:42,created:'0123456789abcdef',helperPid:43,helperCreated:'0123456789abcdee',helperSha256:helper.sha256,executable:path.join(browserRoot,'chrome.exe')};
    const shutdown={contract:'run-job-v1',browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:null,runJobClosed:true,profileRootAssessment:'UNASSESSED',job:{binding,active:0,rootExited:true,total:1,helperExited:true,aborted:false,timing:{budgetMs:15000,remainingBeforeMs:11000,remainingAfterMs:10000}}};
    const caller={runId:'SignalUnit',caseId:s.id,browserCandidate:{...selection},runJob:{contract:'run-job-v1',helper:{...helper}}};let launches=0;
    const run=()=>runProductAudio(caller,{platform:'win32',files:f.files,attest:async()=>{caller.runJob.helper.sha256='0'.repeat(64);return source;},verifyCandidate:async()=>candidate,
      launchVisibilityBrowser:async settings=>{launches++;assert.deepEqual(settings.runJob,{contract:'run-job-v1',helper});assert.equal(settings.productCaseId,s.id);
        await settings.recordBrowserCandidate(await verifyBrowserCandidate(selection));await settings.recordRunJob(binding);
        return {context:{tracing:{start:async()=>{},stop:async()=>{}}},runJobOwner:{binding},browserCandidateVersion:fault==='version'?'151.0.0.0':'159.0.8132.0',abort:async()=>{}};
      },execute:async options=>{
        assert.equal(options.shutdownContract?.contract,'run-job-v1');await options.dependencies.verifyCandidate('SignalUnit',process.cwd(),{retainEvidence:true});
        await options.dependencies.launchInstalledExtension({profilePath:path.join(temp,'profile'),artifactPath:path.join(temp,'artifacts'),extensionPath:candidate.dist,headed:false});
        const r=await options.dependencies.mediaScenario(f.input);await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('synthetic trace'),{flag:'wx'});
        const changed=clone(shutdown);if(fault==='nonce')changed.job.binding.nonce='d'.repeat(64);if(fault==='helper')changed.job.binding.helperSha256='d'.repeat(64);if(fault==='helper-pid')changed.job.binding.helperPid++;if(fault==='helper-created')changed.job.binding.helperCreated='1123456789abcdee';
        if(fault==='prelaunch'){const p=f.directory+'/before.json',record=JSON.parse(f.saved.get(p));record.runId='DonorRun';f.saved.set(p,Buffer.from(JSON.stringify(record)));}
        if(fault==='saved-binding'){const p=f.directory+'/run-job-launch.json',record=JSON.parse(f.saved.get(p));record.binding.nonce='d'.repeat(64);f.saved.set(p,Buffer.from(JSON.stringify(record)));}
        return {...r,runId:fault==='run-donor'?'OtherRun':'SignalUnit',ok:true,profileRetained:true,candidateRetained:true,evidence:{profilePath:path.join(temp,fault==='profile-donor'?'other-profile':'profile'),candidatePath:candidate.root},
          shutdownSelection:{...options.shutdownContract,caseId:fault==='selection-donor'?'48000/normalizer-control/tone-silence':s.id,binding},shutdown:fault==='old-proof'?{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}:changed,source:fault==='source-donor'?{sourceSha256:'donor'}:source,after:fault==='source-donor'?{sourceSha256:'donor'}:source};
      }});
    if(fault)await assert.rejects(run,/audio-product-observation-failed/);else{assert.equal((await run()).ok,true);const summary=JSON.parse(f.saved.get('output/audio-product-SignalUnit/summary.json'));assert.equal(summary.runJob.selection.helper.sha256,helper.sha256);assert.deepEqual(summary.runJob.launch.binding,binding);assert.equal(summary.result.shutdown.ownedRootClosed,null);}
    assert.equal(launches,1,fault);
  }
});
test('the existing dispatcher and binary saved reader consume the17.5second signal without injections',async()=>{
  const s=(await cases()).find(s=>s.sampleRate===48000&&s.pattern==='tone-silence'),f=await scenarioFixture(s),r=(await wrapper(f)).audioProduct;
  assert.equal(r.collectionTiming,undefined);assert.equal(r.passed,true);assert.equal(r.control.silenceReturnUnity,true);assert.equal(r.qualityAssessed,false);assert.equal(f.calls.filter(k=>k==='freeze-normalizer').length,1);assert.ok(!f.calls.includes('stall'));assert.ok(!f.calls.includes('analysis-error'));assert.ok(f.captures.every(([a,b])=>b-a<=4800));assert.ok(r.archive.end>=f.f.end);
});

for(const [name,mutate]of [
  ['caller phase',f=>{f.proof.spec.phase=2.1;}],
  ['caller rate',f=>{f.proof.spec.sampleRate=96000;}],
  ['fixed end',f=>{f.proof.signalWindow.end--;}],
  ['frozen clock',f=>{f.facts.audioTime+=128/48000;}],
  ['freeze cursor',f=>{f.facts.normalizerControl.frozenAt.attemptCursor--;}],
  ['future ACK',f=>{f.facts.oracleEvidence.ledger.events.at(-1).packet.frame=f.cutoff+128;}],
  ['injected fault',f=>{f.facts.normalizerControl.events.push({kind:'stall'});}],
  ['missing raw end',f=>{const summary=f.archive.summary;f.archive.summary=()=>({...summary(),end:f.end-1});}],
  ['late history',f=>{const c=f.facts.normalizerControl;c.frozenAt.frame=20*48000+128;c.frozenAt.time=c.frozenAt.frame/48000;c.observedAt=clone(c.frozenAt);f.facts.audioTime=c.frozenAt.time;}],
])test('dynamic signal rejects '+name+' instead of borrowing a saved PASS',async()=>{
  const s=(await cases()).find(s=>s.sampleRate===48000&&s.pattern==='bursts'),f=await signalFixture(s),m=await import('../scripts/extension-e2e/audio-normalizer-control.mjs');mutate(f);assert.throws(()=>m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,s),/normalizer/);
});
test('a relabelled rate donor fails exact burst source identity',async()=>{
  const {createNormalizerSignalSource}=await sourceModule(),s=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='bursts');assert.throws(()=>createNormalizerSignalSource(sourceArchive(s,{donor:{...s,sampleRate:48000}}),s,1280),/source-identity/);
});
for(const mutation of ['proof phase','frozen cursor','PCM last half second'])test('binary saved signal reader rejects '+mutation+' even with refreshed artifact hashes',async()=>{
  const s=(await cases()).find(s=>s.sampleRate===48000&&s.pattern==='tone-silence'),f=await scenarioFixture(s),crypto=require('node:crypto');
  let mutated=false;await assert.rejects(()=>wrapper(f,async(r,saved)=>{
    const a=r.audioProduct;
    if(mutation==='proof phase'){const p=f.directory+'/normalizer-control-target.json',v=JSON.parse(saved.get(p));v.spec.phase=2.1;saved.set(p,Buffer.from(JSON.stringify(v)));}
    else if(mutation==='frozen cursor'){a.facts.normalizerControl.frozenAt.attemptCursor--;saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));}
    else{
      const metadata=a.archive.artifacts.find(e=>e.kind==='metadata'&&e.end>f.f.end-48000/2),v=JSON.parse(saved.get(metadata.file)),entry=a.archive.artifacts.find(e=>e.file===v.streams[1].file),b=Buffer.from(saved.get(entry.file));b.writeFloatLE(.001,0);saved.set(entry.file,b);entry.sha256=crypto.createHash('sha256').update(b).digest('hex');v.streams[1].sha256=entry.sha256;
      const bytes=Buffer.from(JSON.stringify(v));saved.set(metadata.file,bytes);metadata.bytes=bytes.length;metadata.sha256=crypto.createHash('sha256').update(bytes).digest('hex');
      saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));
    }
    mutated=true;
  }),/observation-failed/);assert.equal(mutated,true,'the mutation must finish before the saved reader rejects it');
});

for(const corrupt of ['power','plan'])test('retained ACK at the fixed end cannot bypass independent '+corrupt+' checks',async()=>{
  const s=(await cases()).find(s=>s.sampleRate===48000&&s.pattern==='noise'),f=await signalFixture(s),m=await import('../scripts/extension-e2e/audio-normalizer-control.mjs'),events=f.facts.oracleEvidence.ledger.events,ack=events.at(-1).packet;ack.frame=f.end;ack.application.frame=f.end;
  if(corrupt==='power'){const p=events.at(-2).packet;p.leftPower=p.rightPower=.5;f.facts.powerReads.slice(-2).forEach(r=>r.power=.5);}else ack.application.toDb=.01;
  let rejected=false;try{rejected=!m.assessPackagedNormalizerControl(f.archive,f.facts,f.proof,s).passed;}catch{rejected=true;}assert.equal(rejected,true,'retained evidence cannot be silently excluded by the original measurement end');
});

test('signal freeze failure preserves the original cause and formed archive without retry or injection',async()=>{
  const s=(await cases()).find(s=>s.sampleRate===48000&&s.pattern==='noise'),f=await scenarioFixture(s,{freeze:()=>{throw Error('signal-freeze-original-failure');}});
  await assert.rejects(f.execute,/signal-freeze-original-failure/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(p.error,/signal-freeze-original-failure/);assert.ok(p.archive.bytes>0);assert.equal(f.calls.filter(k=>k==='freeze-normalizer').length,1);assert.ok(!f.calls.includes('stall'));assert.equal(f.saved.has(f.directory+'/assessment.json'),false);assert.deepEqual(p.facts.normalizerControl.events,[]);
});


test('collection timing binds completed batches and keeps saved PCM metadata free of diagnostics',async t=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence');let clock=100000;
  t.mock.method(performance,'now',()=>clock);
  const f=await scenarioFixture(spec,{capture:async()=>{clock+=12;},write:async p=>{if(p.includes('/segment-'))clock+=2;},facts:async()=>{clock+=1;}});
  const r=(await wrapper(f)).audioProduct,d=r.collectionTiming;
  assert.equal(d.schema,'f01-collection-timing-v1');assert.equal(d.caseId,spec.id);assert.equal(d.sealed,true);assert.equal(d.attribution,'UNASSESSED');
  assert.equal(d.batches.completed,r.archive.segments);assert.ok(d.batches.completed>0);
  assert.equal(d.batches.browser.totalMs,4*d.batches.completed);assert.equal(d.batches.evaluate.totalMs,12*d.batches.completed);assert.equal(d.batches.append.totalMs,8*d.batches.completed);
  assert.deepEqual(d.batches.browser.maxBatch,{start:0,end:44100});assert.equal(d.phases.capture.failed,0);
  for(const [key,ms]of [['browserPcm',1],['browserEncode',2],['browserRemainder',1]]){assert.equal(d.batches[key].count,d.batches.completed);assert.equal(d.batches[key].totalMs,ms*d.batches.completed);assert.equal(d.batches[key].maxMs,ms);assert.deepEqual(d.batches[key].maxBatch,{start:0,end:44100});}
  assert.ok(d.phases.collectorFacts.completed>0);assert.ok(d.phases.waitFacts.completed>0);assert.ok(d.phases.yield.completed>0);assert.ok(d.phases.idle.completed>0);
  assert.equal(d.pendingBatch,null);assert.ok(Buffer.byteLength(JSON.stringify(d))<=8192);
  assert.deepEqual(JSON.parse(f.saved.get(f.directory+'/assessment.json')).collectionTiming,d);
  for(const file of r.archive.artifacts.filter(a=>a.kind==='metadata'))assert.equal('collectionTiming'in JSON.parse(f.saved.get(file.file)),false);
  assert.equal(f.calls.filter(k=>k==='product-capture').length,d.batches.completed);
});
for(const fault of ['donor','rate','missing','nonfinite','negative','over-limit','extra','original','pcm-missing','encode-missing','pcm-negative','encode-negative','pcm-nonfinite','encode-nonfinite','pcm-string','encode-string','substage-sum','substage-bound'])test('collection timing preserves first failure and rejects '+fault,async()=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence'),f=await scenarioFixture(spec,{capture:async raw=>{
    if(fault==='original')throw Error('capture-original-private');
    if(fault==='donor')raw.collectionTiming.start++;
    if(fault==='rate')raw.collectionTiming.sampleRate=48000;
    if(fault==='negative')raw.collectionTiming.elapsedMs=-1;
    if(fault==='over-limit')raw.collectionTiming.elapsedMs=90001;
    if(fault==='extra')raw.collectionTiming.secret='private-sentinel';
    if(fault==='pcm-missing')delete raw.collectionTiming.pcmMs;
    if(fault==='encode-missing')delete raw.collectionTiming.encodeMs;
    if(fault==='pcm-negative')raw.collectionTiming.pcmMs=-1;
    if(fault==='encode-negative')raw.collectionTiming.encodeMs=-1;
    if(fault==='pcm-nonfinite')raw.collectionTiming.pcmMs=Infinity;
    if(fault==='encode-nonfinite')raw.collectionTiming.encodeMs=NaN;
    if(fault==='pcm-string')raw.collectionTiming.pcmMs='1';
    if(fault==='encode-string')raw.collectionTiming.encodeMs='2';
    if(fault==='substage-sum')raw.collectionTiming.pcmMs=3;
    if(fault==='substage-bound')raw.collectionTiming.encodeMs=90001;
    if(fault==='missing')delete raw.collectionTiming;
    if(fault==='nonfinite')raw.collectionTiming.elapsedMs=Infinity;
  }});
  await assert.rejects(f.execute,fault==='original'?/capture-original-private/:/collection-timing/);
  const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.collectionTiming.sealed,true);assert.equal(p.collectionTiming.batches.completed,0);assert.equal(f.captures.length,1);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
  assert.equal(JSON.stringify(p.collectionTiming).includes('private'),false);
});

for(const stage of ['capture','append'])test('collection timing seals unresolved '+stage+' on timeout and ignores its late completion',async t=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence'),timer=global.setTimeout;let release,started;
  const held=new Promise(r=>release=r),began=new Promise(r=>started=r);
  const f=await scenarioFixture(spec,{capture:async()=>{if(stage==='capture'){started();await held;}},write:async p=>{if(stage==='append'&&p.endsWith('segment-0000-stream-0.f32le')){started();await held;}}});
  t.mock.method(global,'setTimeout',(fn,ms,...args)=>timer(fn,ms===5000?20:ms,...args));
  try{
    const rejected=assert.rejects(f.execute(),/audio-operation-timeout:product-(probe-product-capture|normalizer-control-append)/);await began;await rejected;
    const bytes=Buffer.from(f.saved.get(f.directory+'/partial.json')),p=JSON.parse(bytes),d=p.collectionTiming;
    assert.equal(d.sealed,true);assert.equal(d.batches.completed,0);assert.equal(d.phases[stage].failed,1);assert.equal(d.phases[stage].pending.status,'completion-unknown');
    assert.equal(d.pendingBatch.appendMs,null);assert.equal(d.pendingBatch.browserMs,stage==='capture'?null:4);
    assert.equal(d.pendingBatch.pcmMs,stage==='capture'?null:1);assert.equal(d.pendingBatch.encodeMs,stage==='capture'?null:2);
    for(const key of ['browserPcm','browserEncode','browserRemainder'])assert.equal(d.batches[key].count,0);
    assert.equal('collectionTiming'in(p.lastRaw??{}),false);const count=f.captures.length;
    release();await new Promise(r=>timer(r,30));assert.deepEqual(f.saved.get(f.directory+'/partial.json'),bytes);assert.equal(f.captures.length,count);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
  }finally{release();}
});
test('collection timing charges repeated summary copies and preserves assessment write failure',async()=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence'),f=await scenarioFixture(spec,{write:async p=>{if(p.endsWith('/assessment.json'))throw Error('original-assessment-write');}});
  await assert.rejects(f.execute,/original-assessment-write/);
  const a=JSON.parse(f.saved.get(f.directory+'/assessment.json')),p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.deepEqual(a.collectionTiming,p.collectionTiming);
  const bytes=Buffer.byteLength(JSON.stringify({collectionTiming:a.collectionTiming},null,2));assert.ok(bytes*4<=a.collectionTiming.reservedSummaryBytes);assert.ok(a.archive.bytes+a.collectionTiming.responseBytes+a.collectionTiming.reservedSummaryBytes<=a.archive.cap);
  assert.match(p.error,/original-assessment-write/);assert.equal('collectionTiming'in p.lastRaw,false);
});
test('collection timing never replaces a first collector failure when the signal waiter resumes',async()=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence');let failed=false;
  const f=await scenarioFixture(spec,{capture:async()=>{failed=true;throw Error('first-collector-failure');},facts:async()=>{if(!failed)await new Promise(r=>setTimeout(r,1));}});
  await assert.rejects(f.execute,/first-collector-failure/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(p.error,/first-collector-failure/);assert.equal(f.captures.length,1);
});

test('collection timing keeps clock-local durations without imposing cross-clock ordering',async t=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence');let clock=700000;
  t.mock.method(performance,'now',()=>clock);
  const f=await scenarioFixture(spec,{capture:async(raw,rows)=>{if(rows.length===2)throw Error('second-capture-stop');clock+=12;raw.collectionTiming.elapsedMs=40;}});
  await assert.rejects(f.execute,/second-capture-stop/);const d=JSON.parse(f.saved.get(f.directory+'/partial.json')).collectionTiming;
  assert.equal(d.batches.completed,1);assert.equal(d.batches.browser.totalMs,40);assert.equal(d.batches.evaluate.totalMs,12);assert.equal(d.attribution,'UNASSESSED');
});
test('retained recording failure stops before exporting PCM and preserves the first error',async()=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence'),firstError=Error('waiter-first-error');
  const f=await scenarioFixture(spec,{pause:async()=>{throw firstError;}});
  await assert.rejects(f.execute,error=>error===firstError);const p=JSON.parse(f.saved.get(f.directory+'/partial.json')),d=p.collectionTiming;
  assert.equal(d.batches.completed,0);assert.equal(d.phases.capture.completed,0);assert.equal(d.phases.waitPause.failed,1);assert.equal(p.archive.bytes,0);assert.equal(f.captures.length,0);assert.equal(d.pendingBatch,null);
  assert.ok(f.requests.some(r=>r.waitForReady));
  assert.match(p.error,/waiter-first-error/);
  assert.ok(p.facts.powerReads.length>0);
  assert.ok(Array.isArray(p.facts.meterTickReads)&&p.facts.oracleEvidence.ledger.events.length>0);
});

test('collection timing rejects a valid longer PCM payload carrying the requested shorter timing',async()=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence'),f=await scenarioFixture(spec,{capture:async raw=>{
    raw.end=raw.start+(raw.end-raw.start)*2;
    for(const stream of raw.streams){stream.end=raw.end;const bytes=Buffer.from(stream.base64,'base64');stream.base64=Buffer.concat([bytes,bytes]).toString('base64');}
  }});
  await assert.rejects(f.execute,/collection-timing/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.archive.bytes,0);assert.equal(p.collectionTiming.batches.completed,0);assert.equal(f.captures.length,1);
});

test('collection timing keeps a zero remainder and binds substage maxima to their own completed batch',async()=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence');
  const f=await scenarioFixture(spec,{capture:async(raw,rows)=>{if(rows.length===3)throw Error('bounded-two-batch-stop');Object.assign(raw.collectionTiming,rows.length===1?{elapsedMs:4,pcmMs:1,encodeMs:3}:{elapsedMs:9,pcmMs:7,encodeMs:1});}});
  await assert.rejects(f.execute,/bounded-two-batch-stop/);const d=JSON.parse(f.saved.get(f.directory+'/partial.json')).collectionTiming;
  assert.equal(d.batches.completed,2);assert.equal(d.batches.browserPcm.totalMs,8);assert.equal(d.batches.browserEncode.totalMs,4);assert.equal(d.batches.browserRemainder.totalMs,1);
  assert.deepEqual(d.batches.browserPcm.maxBatch,{start:44100,end:88200});assert.deepEqual(d.batches.browserEncode.maxBatch,{start:0,end:44100});assert.deepEqual(d.batches.browserRemainder.maxBatch,{start:44100,end:88200});
  assert.equal(d.pendingBatch.pcmMs,null);assert.equal(d.pendingBatch.encodeMs,null);
});

test('retained 44100 freezes before any PCM export and replays the complete original window',async()=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence');let f;
  f=await scenarioFixture(spec,{capture:async()=>assert.ok(f.calls.indexOf('freeze-normalizer')>=0&&f.calls.indexOf('freeze-normalizer')<f.calls.indexOf('product-capture'),'export must follow cutoff')});
  const r=(await wrapper(f)).audioProduct;assert.equal(r.passed,true);assert.equal(r.control.silenceReturnUnity,true);assert.equal(f.captures[0][0],0);assert.ok(f.captures.some(([a,b])=>b-a===44100));assert.ok(f.captures.every(([a,b])=>b-a<=44100));assert.equal(f.captures.at(-1)[1],f.f.cutoff);assert.equal(r.archive.bytes,f.f.cutoff*36);
  assert.equal(f.f.end-f.f.markerFrame,771750);
  const firstPoll=f.requests.findIndex(r=>r.waitForReady),firstCapture=f.calls.indexOf('product-capture');
  assert.ok(firstPoll>=0&&firstPoll<firstCapture,'waiting must use the guarded freeze call');
  const marker=f.calls.indexOf('reset-events');
  assert.ok(!f.requests.slice(marker+1,firstCapture).some(r=>r.kind==='facts'&&r.fullOracle),'no separate full facts before cutoff');
  assert.ok(f.requests.slice(firstPoll,firstCapture).filter(r=>r.kind==='freeze-normalizer').every(r=>r.waitForReady&&r.endFrame===f.f.end));
});

for(const saveFails of [false,true])test('retained 44100 handoff keeps the first collector error'+(saveFails?' when the proof save also fails':''),async()=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence'),firstError=Error('collector-before-handoff');
  let release,held=false;
  const pending=new Promise(resolve=>{release=resolve;});
  const f=await scenarioFixture(spec,{facts:async()=>{if(!held){held=true;await pending;throw firstError;}},
    write:async file=>{
      if(!file.endsWith('/normalizer-control-target.json'))return;
      release();
      if(saveFails){await new Promise(resolve=>setImmediate(resolve));throw Error('later-target-save-error');}
    }});
  await assert.rejects(f.execute,error=>error===firstError);
  assert.equal(f.calls.includes('freeze-normalizer'),false);assert.equal(f.captures.length,0);
  const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));
  assert.match(partial.error,/collector-before-handoff/);
  if(saveFails)assert.ok(partial.secondary.some(error=>error.includes('later-target-save-error')));
});

for(const pending of [false,true])test('retained 44100 rejects a late frozen result '+(pending?'after PCM reaches the target':'on the first poll'),async t=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence');
  let clock=Date.now(),polls=0;
  t.mock.method(Date,'now',()=>clock);
  const f=await scenarioFixture(spec,{freeze:(arg,current)=>{
    const live=current(true);
    live.productObservation.commonEnd=arg.endFrame;
    if(++polls===1&&pending)return live;
    clock+=2000;
    live.normalizerControl.frozenAt=live.normalizerControl.observedAt;
    return live;
  }});
  await assert.rejects(f.execute,/normalizer-signal-freeze-timeout/);
  assert.equal(polls,pending?2:1);
  assert.equal(f.captures.length,0);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});

for(const fault of ['window','cutoff'])test('retained 44100 rejects a mismatched '+fault+' before exporting PCM',async()=>{
  const spec=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence');
  const f=await scenarioFixture(spec,{freeze:()=>{
    const response=clone(f.f.facts);
    if(fault==='window')response.normalizerControl.signalEndFrame--;
    else response.normalizerControl.frozenAt.frame=882001;
    return response;
  }});
  await assert.rejects(f.execute,/normalizer-signal-freeze-receipt/);
  assert.equal(f.captures.length,0);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});

for(const mutation of ['cutoff','clock','readback','missing'])test('retained saved metadata rejects '+mutation+' despite refreshed hashes',async()=>{
  const s=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence'),f=await scenarioFixture(s),crypto=require('node:crypto');let mutated=false;
  await assert.rejects(()=>wrapper(f,async(r,saved)=>{
    const a=r.audioProduct,entry=a.archive.artifacts.find(x=>x.kind==='metadata'),v=JSON.parse(saved.get(entry.file));
    if(mutation==='cutoff')v.recordingCutoff.frame++;else if(mutation==='clock')v.audioTime++;else if(mutation==='readback')v.readback.wanted=false;else delete v.recordingCutoff;
    const bytes=Buffer.from(JSON.stringify(v));saved.set(entry.file,bytes);entry.bytes=bytes.length;entry.sha256=crypto.createHash('sha256').update(bytes).digest('hex');saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(a)));mutated=true;
  }),/observation-failed/);assert.equal(mutated,true);
});

for(const fault of ['hidden','context','stream'])test('retained recording keeps live '+fault+' guards before export',async()=>{
  const s=(await cases()).find(s=>s.sampleRate===44100&&s.pattern==='tone-silence');let injected=false;
  const f=await scenarioFixture(s,{facts:async x=>{if(x.productObservation.sources===1&&x.audioTime>1){injected=true;if(fault==='hidden')x.hidden=true;else if(fault==='context')x.contextState='suspended';else x.productObservation.streamError='original-stream-failure';}}});
  await assert.rejects(f.execute,/audio-normalizer-control-live-state|audio-product-collection-state/);assert.equal(injected,true);assert.equal(f.captures.length,0);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
