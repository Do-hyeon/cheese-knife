const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../scripts/extension-e2e/audio-product.mjs');
const rate=44100;
function raw(start,end,value=.2){return {schema:'f01-product-window-v1',sampleRate:rate,start,end,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',
  streams:[2,2,5].map(channels=>{const bytes=Buffer.alloc((end-start)*channels*4);for(let n=0;n<end-start;n++)for(let c=0;c<channels;c++)bytes.writeFloatLE(channels===5?[-1,1,1,1,0][c]:value,(n*channels+c)*4);
    return {start,end,channels,encoding:'interleaved-float32le',base64:bytes.toString('base64')};})};}
function files(){const saved=new Map();return {saved,writeFile:async(name,bytes,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(name));saved.set(name,Buffer.from(bytes));}};}

test('product runner has one explicit fresh run ID and rejects J1 IDs and unsupported options',async()=>{
  const m=await load();assert.deepEqual(m.parseProductAudioArgs(['--run-id=Product750A']),{runId:'Product750A'});
  for(const args of [[],['--run-id=../old'],['--run-id=F01J1Native20261018'],['--run-id=F01J1Native20261018R48'],['--run-id=A','--sample-rate=192000'],['--run-id=A','--run-id=B']])assert.throws(()=>m.parseProductAudioArgs(args));
});
test('archive writes all three PCM streams and rejects gap overlap corruption and invalid windows',async()=>{
  const {createProductArchive}=await load(),f=files(),a=createProductArchive(f,'new-run');
  await a.append(raw(0,1024));await a.append(raw(1024,2048));assert.equal(f.saved.size,8);assert.equal(a.summary().bytes,2048*9*4);
  for(const r of [raw(2049,3073),raw(2047,3071),{...raw(2048,3072),streams:[]},raw(2048,2048),raw(2048,2048+rate*2)])await assert.rejects(()=>a.append(r));
  const r=raw(2048,3072);r.streams[1].base64=Buffer.from([0]).toString('base64');await assert.rejects(()=>a.append(r));assert.equal(a.summary().end,2048);
  const nonfinite=raw(2048,3072),bad=Buffer.from(nonfinite.streams[0].base64,'base64');bad.writeFloatLE(NaN,0);nonfinite.streams[0].base64=bad.toString('base64');await assert.rejects(()=>a.append(nonfinite),/nonfinite/);
  assert.equal(a.window(1000,1050,2).channels[3].length,50);
});
test('archive rejects large invalid base64 before writes without validator stack overflow',async()=>{
  const {createProductArchive}=await load(),f=files(),r=raw(0,144000);r.sampleRate=96000;r.schema='f01-product-window-v2';
  r.streams.push(structuredClone(r.streams[0]));r.streams.forEach((s,i)=>s.role=['program','source','control','component'][i]);
  const a=createProductArchive(f,'large-invalid',96000,'equalizer-component');
  r.streams[0].base64='A'.repeat(8*1024*1024);
  await assert.rejects(()=>a.append(r),/audio-product-archive-size/);
  r.streams[0].base64=r.streams[0].base64.slice(0,-1)+'!';
  await assert.rejects(()=>a.append(r),/audio-product-archive-stream/);
  assert.equal(f.saved.size,0);assert.equal(a.summary().bytes,0);
});
test('archive preserves base64 padding grammar and noncanonical pad bits',async()=>{
  const {createProductArchive}=await load();
  for(const input of ['AAAAA===','AAAA=AAA','AAAAA','AAAA AAA','AAAAAAAAAAA=\n','AAAAAAAAAAA=\r\n']){
    const f=files(),r=raw(0,1,0);r.streams[0].base64=input;
    await assert.rejects(()=>createProductArchive(f,'invalid-padding').append(r),/audio-product-archive-stream/);assert.equal(f.saved.size,0);
  }
  for(const length of [1,2,3]){
    const f=files(),r=raw(0,length,0);
    if(length===1)r.streams[0].base64='AAAAAAAAAAB=';
    await createProductArchive(f,'valid-padding').append(r);assert.equal(f.saved.size,4);
  }
});
test('explicit component archive keeps four streams and rejects legacy downgrade or missing tap',async()=>{
  const {createProductArchive}=await load(),f=files(),a=createProductArchive(f,'component',44100,'equalizer-component');
  const make=(start,end)=>{const r=raw(start,end);r.schema='f01-product-window-v2';r.streams.push(structuredClone(r.streams[0]));r.streams.forEach((s,i)=>s.role=['program','source','control','component'][i]);return r;};
  await a.append(make(0,128));assert.equal(a.summary().bytes,128*44);assert.equal(f.saved.size,5);assert.equal(a.window(0,128,3).channels.length,2);
  const metadata=JSON.parse(f.saved.get('component/segment-0000.json'));assert.equal(metadata.streams.length,4);assert.equal(metadata.streams[3].file,'component/segment-0000-stream-3.f32le');
  for(const r of [raw(128,256),{...make(128,256),streams:make(128,256).streams.slice(0,3)}])await assert.rejects(()=>a.append(r),/archive-coverage/);
  await assert.rejects(()=>createProductArchive(files(),'legacy').append(make(0,128)),/archive-coverage/);
  assert.throws(()=>createProductArchive(files(),'unsupported',44100,'arbitrary'),/archive-profile/);
});
test('component archive keeps the original byte cap and rejects one additional frame',async()=>{
  const {createProductArchive}=await load(),a=createProductArchive({writeFile:async()=>{}},'component-cap',44100,'equalizer-component'),limit=Math.floor(96*1024*1024/44);
  const make=(start,end)=>{const r=raw(start,end);r.schema='f01-product-window-v2';r.streams.push(structuredClone(r.streams[0]));r.streams.forEach((s,i)=>s.role=['program','source','control','component'][i]);return r;};
  for(let n=0;n<limit;n+=44100)await a.append(make(n,Math.min(n+44100,limit)));
  assert.equal(a.summary().bytes,limit*44);await assert.rejects(()=>a.append(make(limit,limit+1)),/archive-cap/);assert.equal(a.summary().end,limit);
});
test('archive global unique PCM cap is not renewed for each segment',async()=>{
  const {createProductArchive}=await load(),a=createProductArchive({writeFile:async()=>{}},'new-run');const frames=rate;
  for(let n=0;n<63;n++)await a.append(raw(n*frames,(n+1)*frames));
  await assert.rejects(()=>a.append(raw(63*frames,64*frames)),/cap/);assert.ok(a.summary().bytes<=96*1024*1024);
});
test('request-frame windows reuse original master gate and component output gate',async()=>{
  const {createProductArchive,assessProductTransitions}=await load(),a=createProductArchive(files(),'new-run');await a.append(raw(0,20000));
  const rows=assessProductTransitions(a,[{name:'master-off',frame:6000}]);assert.equal(rows[0].before.start,6000-Math.round(.08*rate));
  assert.equal(rows[0].change.start,6000-Math.round(.02*rate));assert.equal(rows[0].after.end,6000+Math.round(.14*rate));assert.deepEqual(rows[0].failures,[]);
  const b=createProductArchive(files(),'other-run'),r=raw(0,20000);const bytes=Buffer.from(r.streams[0].base64,'base64');bytes.writeFloatLE(.3,(6000+100)*8);r.streams[0].base64=bytes.toString('base64');await b.append(r);
  assert.ok(assessProductTransitions(b,[{name:'master-off',frame:6000}])[0].failures.some(f=>f.includes('step')));
  assert.deepEqual(assessProductTransitions(b,[{name:'eq-on',frame:6000}])[0].failures,[]);
});
test('continuous master tail cannot hide a late step outside change and after windows',async()=>{
  const {createProductArchive,assessProductTransitions}=await load(),a=createProductArchive(files(),'new-run'),r=raw(0,20000),bytes=Buffer.from(r.streams[0].base64,'base64');
  bytes.writeFloatLE(.3,15000*8);r.streams[0].base64=bytes.toString('base64');await a.append(r);
  assert.ok(assessProductTransitions(a,[{name:'master-on',frame:6000}])[0].failures.includes('continuous-channel-0/step'));
});
test('lifecycle evidence requires every accepted and completed configure and preserves failures',async()=>{
  const {productLifecycleFailures}=await load(),commands=[{requestedFrame:100,message:{kind:'configure',sourceEpoch:1,seq:1}}],replies=[{kind:'accepted',sourceEpoch:1,seq:1,frame:128,code:null},{kind:'completed',sourceEpoch:1,seq:1,frame:1600,code:null}];
  assert.deepEqual(productLifecycleFailures({commands,replies},3000),[]);
  assert.ok(productLifecycleFailures({commands,replies:replies.slice(0,1)},3000).length);
  assert.ok(productLifecycleFailures({commands,replies:[...replies,{kind:'failed',sourceEpoch:1,seq:1,frame:1700,code:'fault'}]},3000).length);
  assert.ok(productLifecycleFailures({commands,replies},1500).length);
  assert.ok(productLifecycleFailures({commands:[],replies:[]},3000).length);
  assert.ok(productLifecycleFailures({commands,replies:[...replies,{kind:'completed',sourceEpoch:1,seq:2,frame:1700,code:null}]},3000).length);
});
test('failed segment persistence keeps every already-written file in the partial manifest',async()=>{
  const {createProductArchive}=await load();let written=0;const a=createProductArchive({writeFile:async()=>{if(++written===2)throw Error('disk-full');}},'new-run');
  await assert.rejects(()=>a.append(raw(0,1024)),/disk-full/);assert.equal(a.summary().artifacts.length,1);assert.equal(a.summary().segments,0);
});
test('source provenance rejects a missing or rescaled 750 Hz channel',async()=>{
  const {createProductArchive,productInputFailures}=await load(),a=createProductArchive(files(),'new-run'),r=raw(0,20000),source=Buffer.from(r.streams[1].base64,'base64');
  for(let n=0;n<20000;n++)for(let c=0;c<2;c++)source.writeFloatLE(Math.SQRT2*10**(-24/20)*Math.sin(2*Math.PI*750*n/rate+.37),n*8+c*4);
  r.streams[1].base64=source.toString('base64');await a.append(r);assert.deepEqual(productInputFailures(a,[{name:'master-off',frame:6000}]),[]);
  const b=createProductArchive(files(),'bad-run');for(let n=0;n<20000;n++)source.writeFloatLE(0,n*8+4);r.streams[1].base64=source.toString('base64');await b.append(r);
  assert.ok(productInputFailures(b,[{name:'master-off',frame:6000}]).some(f=>f.includes('channel-1')));
});
test('source provenance covers prefix, segment seams and the final partial window outside action windows',async()=>{
  const {createProductArchive,productInputFailures}=await load();
  for(const fault of [null,0,25000,49600]){
    const a=createProductArchive(files(),'whole-'+fault);
    for(const [start,end] of [[0,25000],[25000,50000]]){
      const r=raw(start,end),source=Buffer.from(r.streams[1].base64,'base64');
      for(let n=start;n<end;n++)for(let c=0;c<2;c++)source.writeFloatLE(c===1&&fault!==null&&n>=fault&&n<fault+350?0:Math.SQRT2*10**(-24/20)*Math.cos(2*Math.PI*750*n/rate+.37-Math.PI/2),(n-start)*8+c*4);
      r.streams[1].base64=source.toString('base64');await a.append(r);
    }
    const failures=productInputFailures(a,[{name:'eq-on',frame:6000}]);
    if(fault===null)assert.deepEqual(failures,[]);else assert.ok(failures.some(f=>f.startsWith('whole-source/')&&f.endsWith('channel-1')),JSON.stringify({fault,failures}));
  }
});
test('whole-source validation keeps the original amplitude tolerance and rejects wrong-frequency intervals',async()=>{
  const {createProductArchive,productInputFailures}=await load();
  for(const [scaleDb,wrongTone,okay] of [[.04,false,true],[-.04,false,true],[.06,false,false],[0,true,false]]){
    const a=createProductArchive(files(),'tone-'+scaleDb+wrongTone),r=raw(0,25000),source=Buffer.from(r.streams[1].base64,'base64');
    for(let n=0;n<25000;n++)for(let c=0;c<2;c++)source.writeFloatLE(Math.SQRT2*10**((-24+scaleDb)/20)*Math.sin(2*Math.PI*(wrongTone&&n>18000?1000:750)*n/rate+1.2),n*8+c*4);
    r.streams[1].base64=source.toString('base64');await a.append(r);
    assert.equal(productInputFailures(a,[{name:'eq-on',frame:6000}]).length===0,okay);
  }
  const short=createProductArchive(files(),'short');await short.append(raw(0,100));assert.ok(productInputFailures(short,[]).length);
  assert.ok(productInputFailures(createProductArchive(files(),'empty'),[]).length);
});
test('product signal state requires the fixed input and rejects ended, looped, muted or interrupted media',async()=>{
  const {productSignalFailures}=await load(),valid={signal:{frequency:750,inputDbfs:-24,phase:.37,channels:2,durationSeconds:90,frames:rate*90,loop:false,error:''},video:{muted:false,volume:1,loop:false,ended:false,paused:false,playbackRate:1,currentTime:22.7}};
  assert.deepEqual(productSignalFailures(valid,rate),[]);
  for(const [key,value] of [['ended',true],['loop',true],['paused',true],['playbackRate',2],['currentTime',90],['muted',true],['volume',.5]])assert.ok(productSignalFailures({...valid,video:{...valid.video,[key]:value}},rate).length,key);
  for(const [key,value] of [['phase',0],['durationSeconds',20],['frames',rate*20],['error','seeking'],['channels',1]])assert.ok(productSignalFailures({...valid,signal:{...valid.signal,[key]:value}},rate).length,key);
  assert.ok(productSignalFailures({},rate).length);
});

async function productScenario(fault,afterModule,onAssessment,spec,selectedRate=44100){
  const rate=spec?.sampleRate??selectedRate,frequency=spec?.frequency??750,dry=spec?.id.includes('/dry-')===true,dc=spec?10**(spec.inputDbfs/20):.99;let gain=1,commands=[],replies=[],config={normalizerEnabled:false,eqEnabled:false,compressorEnabled:false};
  const target=()=>({kind:"configure",sourceEpoch:1,wanted:enabled,gain,eq:[63,125,250,500,1000,2000,4000,8000].map(f=>config.eqEnabled?config["eq"+f]??0:0),normalizer:config.normalizerEnabled,dynamics:config.compressorEnabled||config.normalizerEnabled,targetDbfs:-20});
  const post=()=>{if(!enabled&&!commands.length)return;const packet=target();if(JSON.stringify({...commands.at(-1)?.message,seq:undefined})===JSON.stringify(packet))return;packet.seq=commands.length+1;if(!commands.length)replies.push({kind:'prepared',sourceEpoch:1,seq:0,frame:0,meterEpoch:0,gain:null,code:null});commands.push({requestedFrame:position,message:packet});replies.push({kind:"accepted",sourceEpoch:1,seq:packet.seq,frame:position+128,meterEpoch:1,gain:null,code:null},{kind:"completed",sourceEpoch:1,seq:packet.seq,frame:position+Math.round(.03*rate),meterEpoch:1,gain,code:null});};
  const {runProductAudioScenario}=await load(),path=require('node:path'),saved=new Map(),calls=[];let position=128,monotonicMs=0,enabled=false,captured=false,primed=false;
  const directory='output/playwright/installed-extension-ScenarioA';
  const module=Buffer.from('fixed packaged worklet bytes'),url='chrome-extension://actual/web/audio-transition-worklet.js';
  const signal={frequency,inputDbfs:spec?.inputDbfs??-24,phase:.37,channels:2,durationSeconds:90,frames:rate*90,loop:false,error:''};
  const facts=()=>({sampleRate:rate,audioTime:position/rate,signal:{...signal,error:fault==='ended'&&position>rate?'ended':''},hidden:false,contextState:'running',video:{muted:false,volume:1,loop:false,ended:fault==='ended'&&position>rate,paused:false,playbackRate:1,currentTime:position/rate},readback:{state:fault==='readback-failed'&&position>rate*22.6?'unavailable':enabled?'on':'off',sources:spec&&!commands.length?0:1,wanted:enabled,gain,appliedGain:spec?.pattern==='dc'&&!commands.length?null:gain},
    productObservation:{sources:spec&&!commands.length?0:1,l1Nodes:spec&&!commands.length?0:1,commonStart:0,commonEnd:Math.floor(position/128)*128,invalidFrames:0,streamError:'',moduleLoads:[url],
      ...(spec?{commands:structuredClone(commands),replies:structuredClone(replies)}:{commands:[{requestedFrame:0,message:{kind:'configure',sourceEpoch:1,seq:1}}],replies:[{kind:'accepted',sourceEpoch:1,seq:1,frame:128,code:null},{kind:'completed',sourceEpoch:1,seq:1,frame:1600,code:null}]})}});
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{if(dry&&enabled&&commands.length===1){const end=Math.max(position,replies.at(-1).frame+128);monotonicMs+=Math.ceil((end-position)*1000/rate);position=end;if(fault==='dry-readback')throw Error('dry-readback-stop');}},waitForTimeout:async ms=>{position+=Math.round(ms*rate/1000);monotonicMs+=ms;if(dry&&enabled&&commands.length===1&&ms===1250){primed=true;if(fault==='dry-priming')throw Error('dry-priming-stop');}},locator:()=>({click:async()=>{enabled=true;if(spec)post();if(fault==='dry-first-on')throw Error('dry-first-on-stop');}}),
    evaluate:async(fn,arg)=>{
      if(fn.name==='installProcessingProbe'){assert.deepEqual(arg,{sampleRate:rate,productObservation:true});return;}
      calls.push(arg);
      if(arg.kind==='signal'){assert.equal(arg.frequency,frequency);assert.equal(arg.durationSeconds,90);assert.equal(arg.phase,.37);return;}
      if(arg.kind==='facts'){if(dry&&primed&&commands.length===1&&fault==='dry-before-target')throw Error('dry-before-target-stop');if(captured&&fault==='wet-after-facts')throw Error('wet-after-facts');return facts();}
      if(arg.kind==='configure'){if(facts().signal.error)throw Error('audio-product-input-invalid');enabled=arg.enabled;gain=arg.gain;if(spec){config={...config,...arg.config};post();}return {status:enabled?'on':'off',frame:position};}
      if(arg.kind==='capture'){
        captured=true;
        if(fault==='wet-capture-stop')throw Error('wet-capture-stop');
        assert.equal(arg.seconds,1);const end=Math.floor(position/128)*128,start=end-rate;return {rate,start,end,channels:Array.from({length:2},()=>Array(rate).fill(Math.fround(dry?fault==='dry-silent'?0:fault==='dry-negative'?-dc:dc+(fault==='dry-near'?9e-6:fault==='dry-far'?11e-6:0):fault==='wet-ceiling'?.99:fault==='wet-silent'?0:.98)))};
      }
      if(arg.kind==='video')return;
      if(arg.kind==='l1-partial')return {streams:[]};
      if(arg.kind==='product-capture'){
        const record=raw(arg.startFrame,arg.endFrame);record.sampleRate=rate;Object.assign(record,{commands:facts().productObservation.commands,replies:facts().productObservation.replies});const source=Buffer.from(record.streams[1].base64,'base64');
        for(let n=record.start;n<record.end;n++)for(let c=0;c<2;c++)source.writeFloatLE(fault==='source-gap'&&c===1&&n<350?0:spec?.pattern==='dc'?dc:Math.SQRT2*10**(-24/20)*Math.sin(2*Math.PI*frequency*n/rate+.37),(n-record.start)*8+c*4);
        if(fault==='output-step'&&record.start<=rate*22&&record.end>rate*22){const program=Buffer.from(record.streams[0].base64,'base64');program.writeFloatLE(.3,(rate*22-record.start)*8);record.streams[0].base64=program.toString('base64');}
        if(spec?.pattern==='dc'){
          const program=Buffer.from(record.streams[0].base64,'base64'),control=Buffer.from(record.streams[2].base64,'base64');
          for(let n=0;n<record.end-record.start;n++){const on=dry?(commands.findLast(row=>row.requestedFrame<=record.start+n)?.message.wanted??false):true;for(let c=0;c<2;c++)program.writeFloatLE(dry?(on?.98:fault==='dry-silent'?0:fault==='dry-negative'?-dc:dc+(fault==='dry-near'?9e-6:fault==='dry-far'?11e-6:0)):fault==='wet-ceiling'?.99:fault==='wet-silent'?0:.98,n*8+c*4);control.writeFloatLE(gain,n*20+8);if(dry){control.writeFloatLE(on?-1:0,n*20);control.writeFloatLE(on?1:0,n*20+4);}}
          record.streams[0].base64=program.toString('base64');record.streams[2].base64=control.toString('base64');
        }
        record.streams[1].base64=source.toString('base64');return record;
      }
      throw Error('unexpected probe action');
    }};
  const f={root:process.cwd(),lstat:async()=>null,ensureDirectory:async()=>{},readFile:async(name,encoding)=>saved.has(name)?encoding?saved.get(name).toString(encoding):saved.get(name):name.startsWith('tests/')?'<html></html>':module,writeFile:async(name,bytes,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(name));saved.set(name,Buffer.from(bytes));if(name.endsWith('/assessment.json'))onAssessment?.();}};
  const run=()=>runProductAudioScenario({context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async(_fn,arg)=>{if(typeof arg==='string'){afterModule?.();return Array.from(module);}}},extensionId:'actual',artifactPath:path.join(f.root,directory)},f,{dist:path.join(f.root,'dist')},rate,spec);
  const execute=async()=>{if(spec?.pattern!=='dc')return run();const descriptor=Object.getOwnPropertyDescriptor(performance,'now');Object.defineProperty(performance,'now',{configurable:true,value:()=>monotonicMs});try{return await run();}finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}};
  return {execute,saved,calls,directory,files:f};
}
test('actual scenario function preserves all eight original steps and reports whole-source nonloop evidence',async()=>{
  const f=await productScenario(),{audioProduct:result}=await f.execute();assert.equal(result.passed,true);assert.equal(result.schema,'f01-product-observation-v2');
  assert.deepEqual(result.actions.map(row=>row.name),['eq-on','eq-off','compressor-on','compressor-off','normalizer-on','normalizer-off','master-off','master-on']);
  assert.equal(Math.max(...result.archive.artifacts.map(a=>a.end-a.start)),rate,'R1 retains its one-second exports');
  assert.equal(result.inputValidation.start,result.archive.start);assert.equal(result.inputValidation.end,result.archive.end);assert.equal(result.inputValidation.windowFrames,1764);assert.equal(result.inputValidation.strideFrames,882);
  assert.ok(result.inputValidation.windows>1000);assert.equal(result.inputValidation.absolutePhaseProven,false);assert.equal(result.facts.signal.durationSeconds,90);
  assert.equal(JSON.parse(f.saved.get(f.directory+'/assessment.json')).schema,'f01-product-observation-v2');
});
test('actual scenario stops on interrupted input and preserves its partial evidence without restarting',async()=>{
  const f=await productScenario('ended');await assert.rejects(f.execute,/input/);assert.equal(f.calls.filter(call=>call.kind==='signal').length,1);
  const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(partial.error,/input/);assert.equal(partial.facts.signal.error,'ended');assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
for(const fault of ['source-gap','output-step','readback-failed'])test(`scenario distinguishes ${fault} from a product quality conclusion`,async()=>{
  const f=await productScenario(fault);await assert.rejects(f.execute,/quality-or-observation-failed/);
  const result=JSON.parse(f.saved.get(f.directory+'/assessment.json'));
  assert.equal(result.outcome,fault==='source-gap'?'INCONCLUSIVE':'FAIL');assert.equal(result.qualityAssessed,fault==='output-step');
  if(fault==='source-gap'){assert.deepEqual(result.transitions,[]);assert.ok(result.failures.some(row=>row.startsWith('whole-source/')));}
  else if(fault==='output-step')assert.ok(result.transitions.some(row=>row.failures.includes('continuous-channel-0/step')));
  else {assert.ok(result.failures.includes('final-readback'));assert.deepEqual(result.transitions,[]);}
});
for(const at of ['fetch','calculation','save'])test(`scenario cannot return success when the 90s budget expires during ${at}`,async()=>{
  const originalNow=Date.now,originalSin=Math.sin;let now=originalNow(),armed=false;
  Date.now=()=>now;Math.sin=value=>{if(armed){now+=90001;armed=false;}return originalSin(value);};
  try{
    const f=await productScenario(null,()=>{if(at==='fetch')now+=90001;else if(at==='calculation')armed=true;},()=>{if(at==='save')now+=90001;});
    await assert.rejects(f.execute,/scenario-timeout/);assert.equal(f.saved.has(f.directory+'/assessment.json'),at==='save');
    assert.match(JSON.parse(f.saved.get(f.directory+'/partial.json')).error,/scenario-timeout/);
  }finally{Date.now=originalNow;Math.sin=originalSin;}
});
test('wrapper accepts the actual scenario report and rejects altered whole-source coverage metadata',async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),scenario=await productScenario(),original=await scenario.execute();
  for(const fault of [null,'windowFrames','windows','start','qualityAssessed','outcome']){
    const f=files(),source={sourceSha256:'same'},result=structuredClone(original);
    for(const [name,bytes]of scenario.saved)f.saved.set(name,bytes);
    f.saved.set('dist/web/audio-transition-worklet.js',Buffer.from('fixed packaged worklet bytes'));f.saved.set('extension/web/audio-transition-worklet.js',Buffer.from('fixed packaged worklet bytes'));
    Object.assign(f,{readdir:async p=>[{name:p==='dist'?'web':'audio-transition-worklet.js',isDirectory:()=>p==='dist',isFile:()=>p==='dist/web',isSymbolicLink:()=>false}],root:process.cwd(),lstat:async name=>f.saved.has(name)?{isFile:()=>true,size:f.saved.get(name).length}:null,ensureDirectory:async()=>{},readFile:async(name,encoding)=>encoding?f.saved.get(name).toString(encoding):f.saved.get(name)});
    const execute=async options=>{
      await options.dependencies.verifyCandidate('ScenarioA',process.cwd(),{retainEvidence:true});
      await f.writeFile(scenario.directory+'/trace.zip',Buffer.from('unit trace'),{flag:'wx'});
      if(fault==='qualityAssessed')result.audioProduct.qualityAssessed=false;
      else if(fault==='outcome')result.audioProduct.outcome='INCONCLUSIVE';
      else if(fault)result.audioProduct.inputValidation[fault]++;
      return {...result,ok:true,source,after:source,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}};
    };
    const run=()=>runProductAudio({runId:'ScenarioA'},{platform:'win32',files:f,attest:async()=>source,verifyCandidate:async()=>({root:process.cwd(),dist:require('node:path').join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']}),execute});
    if(fault){await assert.rejects(run,/observation-failed/);assert.equal(JSON.parse(f.saved.get('output/audio-product-ScenarioA/summary.json')).error.message,'audio-product-input-evidence-incomplete');}
    else assert.equal((await run()).audioProduct.passed,true);
  }
});
async function stored750Fixture(rate=44100){
  const scenario=await productScenario(null,null,null,null,rate),result=await scenario.execute(),f=candidateProducerFixture(),source={sourceSha256:'same'};
  for(const [name,bytes]of scenario.saved)f.saved.set(name,Buffer.from(bytes));
  f.saved.set(scenario.directory+'/trace.zip',Buffer.from('unit trace'));f.saved.set('extension/web/audio-transition-worklet.js',Buffer.from('fixed packaged worklet bytes'));
  const report=result.audioProduct,saveAssessment=()=>f.saved.set(scenario.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));
  const run=async()=>{const {runProductAudio}=await import('../scripts/check-product-audio.mjs');return runProductAudio({runId:'ScenarioA',sampleRate:rate},{platform:'win32',files:f.files,attest:async()=>source,verifyCandidate:async()=>f.candidate,execute:async options=>{await options.dependencies.verifyCandidate('ScenarioA',process.cwd(),{});return {...result,ok:true,source,after:source,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}};}});};
  return {f,report,run,saveAssessment,directory:scenario.directory};
}
for(const rate of [44100,48000,96000])test('750Hz stored replay accepts original '+rate,async context=>{
  const {f,report,run}=await stored750Fixture(rate);assert.equal(report.schema,'f01-product-observation-v2');assert.equal(report.spec,undefined);assert.equal(report.archive.sampleRate,rate);
  assert.equal((await run()).audioProduct.passed,true);assert.equal(producerSummary(f).ok,true);
  context.diagnostic(JSON.stringify({rate,pcmBytes:report.archive.bytes,segments:report.archive.segments,metadataBytes:report.archive.artifacts.filter(a=>a.kind==='metadata').reduce((sum,a)=>sum+a.bytes,0),largestMetadata:Math.max(...report.archive.artifacts.filter(a=>a.kind==='metadata').map(a=>a.bytes))}));
});
for(const fault of ['source','program','tail'])test('750Hz stored replay rejects rehashed PCM '+fault,async()=>{
  const {f,report:r,run,saveAssessment}=await stored750Fixture(),hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
  const rows=r.archive.artifacts.filter(a=>a.file.endsWith('-stream-'+(fault==='source'?1:0)+'.f32le')),row=fault==='tail'?rows.at(-1):rows[0],bytes=Buffer.from(f.saved.get(row.file));
  if(fault==='source')bytes.fill(0);else bytes.writeFloatLE(fault==='tail'?.3:.99,fault==='tail'?bytes.length-8:0);
  f.saved.set(row.file,bytes);row.sha256=hash(bytes);
  const meta=r.archive.artifacts.find(a=>a.file===row.file.replace(/-stream-\d\.f32le$/,'.json')),raw=JSON.parse(f.saved.get(meta.file));
  raw.streams[row.file.includes('-stream-1')?1:0]={...row};const json=Buffer.from(JSON.stringify(raw));f.saved.set(meta.file,json);meta.bytes=json.length;meta.sha256=hash(json);saveAssessment();
  for(const artifact of r.archive.artifacts)assert.equal(hash(f.saved.get(artifact.file)),artifact.sha256,'all disk hashes are internally consistent');
  assert.deepEqual(JSON.parse(f.saved.get(meta.file)).streams.find(a=>a.file===row.file),row);assert.deepEqual(JSON.parse(f.saved.get('output/playwright/installed-extension-ScenarioA/assessment.json')),r);
  await assert.rejects(run,/audio-product-observation-failed/);assert.equal(producerSummary(f).error.message,'audio-product-750-assessment');assert.equal(producerSummary(f).ok,false);
});
for(const fault of ['missing-action','action-frame','lifecycle','module','readback','transitions'])test('750Hz stored replay rejects original evidence '+fault,async()=>{
  const {f,report:r,run,saveAssessment,directory}=await stored750Fixture();
  if(fault==='missing-action'){r.actions.pop();r.transitions.pop();}
  if(fault==='action-frame')r.actions[0].frame++;
  if(fault==='lifecycle'){
    r.facts.productObservation.replies.pop();
    const row=r.archive.artifacts.filter(a=>a.kind==='metadata').at(-1),raw=JSON.parse(f.saved.get(row.file));raw.replies=r.facts.productObservation.replies;
    const bytes=Buffer.from(JSON.stringify(raw));f.saved.set(row.file,bytes);row.bytes=bytes.length;row.sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  }
  if(fault==='module')f.saved.set(directory+'/module-resource.fetched.js',Buffer.from('changed module'));
  if(fault==='readback')r.facts.readback.state='unavailable';if(fault==='transitions')r.transitions[0].before.channels[0].rms=123;saveAssessment();
  await assert.rejects(run,/audio-product-observation-failed/);assert.match(producerSummary(f).error.message,/audio-product-750-/);
});
test('750Hz stored replay stops after a late segment read without a second read',async()=>{
  const {f,run}=await stored750Fixture(),read=f.files.readFile,now=Date.now,descriptor=Object.getOwnPropertyDescriptor(performance,'now');let clock=now(),monotonic=0,reads=0;
  Date.now=()=>clock;Object.defineProperty(performance,'now',{configurable:true,value:()=>monotonic});
  f.files.readFile=async(...args)=>{const bytes=await read(...args);if(args[0].includes('/segment-')){reads++;clock-=60000;monotonic+=30001;}return bytes;};
  try{await assert.rejects(run,/audio-product-observation-failed/);assert.equal(reads,1);assert.equal(producerSummary(f).error.message,'audio-product-750-evidence-timeout');}
  finally{Date.now=now;if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
});
test('750Hz stored replay preserves the first read error when summary saving also fails',async()=>{
  const {f,run}=await stored750Fixture(),read=f.files.readFile,write=f.files.writeFile;
  f.files.readFile=async(...args)=>{if(args[0].includes('/segment-'))throw Error('first-750-read');return read(...args);};
  f.files.writeFile=async(...args)=>{if(args[0].endsWith('/summary.json'))throw Error('secondary-750-summary');return write(...args);};
  await assert.rejects(run,error=>{assert.equal(error.message,'audio-product-observation-failed');assert.equal(error.error.message,'first-750-read');assert.ok(error.secondaryErrors.some(e=>e.message==='secondary-750-summary'));return true;});
});

test('750Hz stored replay rejects a larger disk artifact before reading PCM',async()=>{
  const {f,report,run}=await stored750Fixture(),row=report.archive.artifacts[0],read=f.files.readFile;let reads=0;
  f.saved.set(row.file,Buffer.concat([f.saved.get(row.file),Buffer.from([0])]));
  f.files.readFile=async(...args)=>{if(args[0].includes('/segment-'))reads++;return read(...args);};
  await assert.rejects(run,/audio-product-observation-failed/);assert.equal(reads,0);assert.equal(producerSummary(f).error.message,'audio-product-artifact-changed');
});
test('750Hz stored replay preserves the semantic failure when summary saving also fails',async()=>{
  const {f,report:r,run,saveAssessment}=await stored750Fixture(),row=r.archive.artifacts[0],bytes=Buffer.from(f.saved.get(row.file)),hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
  bytes.writeFloatLE(.99,0);f.saved.set(row.file,bytes);row.sha256=hash(bytes);
  const meta=r.archive.artifacts[3],raw=JSON.parse(f.saved.get(meta.file));raw.streams[0]={...row};const json=Buffer.from(JSON.stringify(raw));f.saved.set(meta.file,json);meta.bytes=json.length;meta.sha256=hash(json);saveAssessment();
  const write=f.files.writeFile;f.files.writeFile=async(...args)=>{if(args[0].endsWith('/summary.json'))throw Error('secondary-750-summary');return write(...args);};
  await assert.rejects(run,error=>{assert.equal(error.message,'audio-product-observation-failed');assert.equal(error.error.message,'audio-product-750-assessment');assert.deepEqual(error.secondaryErrors.map(e=>e.message),['secondary-750-summary']);return true;});
});
test('750Hz stored replay preserves a candidate-after failure when summary saving also fails',async()=>{
  const {f,run}=await stored750Fixture(),read=f.files.readFile,write=f.files.writeFile;let reads=0;
  f.files.readFile=async(...args)=>{if(args[0].startsWith('dist/')&&++reads===2)throw Error('first-750-candidate-after');return read(...args);};
  f.files.writeFile=async(...args)=>{if(args[0].endsWith('/summary.json'))throw Error('secondary-750-summary');return write(...args);};
  await assert.rejects(run,error=>{assert.equal(error.message,'audio-product-observation-failed');assert.equal(error.error,null);assert.deepEqual(error.secondaryErrors.map(e=>e.message),['first-750-candidate-after','secondary-750-summary']);return true;});
});

test('wrapper refuses legacy and incomplete source-method evidence before reading claimed PCM',async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs');
  for(const schema of ['f01-product-observation-v1','f01-product-observation-v2']){
    const f=files(),source={sourceSha256:'same'},runId=schema.endsWith('v1')?'OldMethod':'MissingSource';let reads=0;
    Object.assign(f,{root:process.cwd(),lstat:async()=>null,ensureDirectory:async()=>{},readFile:async()=>{reads++;throw Error('unexpected evidence read');}});
    await assert.rejects(()=>runProductAudio({runId},{platform:'win32',files:f,attest:async()=>source,execute:async()=>({ok:true,source,after:source,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},audioProduct:{schema,passed:true,scope:'current-packaged-44100-750-eight-step-sequence',archive:{sampleRate:rate,start:0,end:rate,bytes:rate*36,segments:1,artifacts:Array(4).fill({})}}})}));
    const summary=JSON.parse(f.saved.get(`output/audio-product-${runId}/summary.json`));assert.equal(summary.error.message,schema.endsWith('v1')?'audio-product-result-incomplete':'audio-product-input-evidence-incomplete');assert.equal(reads,0);
  }
});
test('bounded launch retires only a late owned browser after timeout',async()=>{
  const {boundedProductLaunch}=await import('../scripts/check-product-audio.mjs');let deliver,retired=0,lateRecord;
  const pending=new Promise(resolve=>{deliver=resolve;});await assert.rejects(()=>boundedProductLaunch(()=>pending,async result=>{lateRecord=result;},5),/launch-timeout/);
  deliver({abort:async()=>{retired++;}});await new Promise(resolve=>setImmediate(resolve));assert.equal(retired,1);assert.equal(lateRecord.retired,true);
});
test('wrapper attests every audio source and rejects a bare passing report without PCM or trace',async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),saved=new Map(),source={sourceSha256:'same'},inputs=[];
  const f={root:process.cwd(),lstat:async name=>saved.has(name)?{isFile:()=>true}:null,ensureDirectory:async()=>{},writeFile:async(name,bytes,options)=>{assert.equal(options.flag,'wx');saved.set(name,Buffer.from(bytes));}};
  await assert.rejects(()=>runProductAudio({runId:'ProductUnitA'},{platform:'win32',files:f,attest:async(_f,required)=>{inputs.push(...required);return source;},execute:async options=>{
    assert.equal(options.qualification,'media-tab');assert.equal(options.retainEvidence,true);assert.equal(options.runId,'ProductUnitA');
    return {ok:true,audioProduct:{passed:true},shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},source,after:source};
  }}));
  for(const name of ['contracts','controller','curve','entry','eq','normalizer','transition','transition-worklet'])assert.ok(inputs.includes('src/main/features/audio/'+name+'.ts'));
  assert.ok(inputs.includes('tests/fixtures/f01-current-runtime-executable.json'));
  assert.equal(inputs.includes('tests/fixtures/f01-product-latch-runtime-executable.json'),false);
  assert.ok(saved.has('output/audio-product-ProductUnitA/summary.json'));
  assert.equal(JSON.parse(saved.get('output/audio-product-ProductUnitA/summary.json')).ok,false);
});


test('actual product wrapper consumes the same current asset set without appending Worklet twice',async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),{expectedF01MediaFiles}=await import('../scripts/check-installed-extension.mjs'),{openOwnedRoot}=await import('../scripts/owned-files.mjs'),owned=await openOwnedRoot(process.cwd()),expected=[...await expectedF01MediaFiles(owned),'dist/web/audio-transition-worklet.js'].sort(),saved=new Map(),source={sourceSha256:'same'};let seen,calls=0;
  const files={root:process.cwd(),lstat:async name=>saved.has(name)?{isFile:()=>true}:null,ensureDirectory:async()=>{},writeFile:async(name,bytes,opts)=>{assert.equal(opts.flag,'wx');saved.set(name,Buffer.from(bytes));}};
  await assert.rejects(()=>runProductAudio({runId:'ProductAssetUnitA'},{platform:'win32',files,attest:async()=>source,execute:async options=>{calls++;seen=await options.dependencies.expectedMediaFiles(owned);throw Error('unit-stop-before-launch');}}));
  assert.equal(calls,1);assert.deepEqual(seen,expected);assert.equal(new Set(seen).size,63);assert.equal(seen.filter(name=>name==='dist/web/audio-transition-worklet.js').length,1);assert.equal(JSON.parse(saved.get('output/audio-product-ProductAssetUnitA/summary.json')).ok,false);
});


function candidateProducerFixture(){
  const path=require('node:path'),saved=new Map(),assets=new Map([['web/audio-transition-worklet.js',Buffer.from('fixed packaged worklet bytes')]]),links=new Set();let reads=0;
  const files={root:process.cwd(),lstat:async name=>saved.has(name)?{isFile:()=>true,size:saved.get(name).length}:null,ensureDirectory:async()=>{},
    writeFile:async(name,bytes,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(name),name);saved.set(name,Buffer.from(bytes));},
    readFile:async(name,encoding)=>{reads++;const bytes=name.startsWith('dist/')?assets.get(name.slice(5)):saved.get(name);if(!bytes)throw Error('unit-candidate-read-missing');return encoding?bytes.toString(encoding):bytes;},
    readdir:async directory=>{assert.ok(directory==='dist'||directory.startsWith('dist/'));const prefix=directory==='dist'?'':directory.slice(5)+'/';const names=new Map();for(const name of assets.keys())if(name.startsWith(prefix)){const rest=name.slice(prefix.length),part=rest.split('/')[0];names.set(part,rest.includes('/'));}return [...names].map(([name,dir])=>({name,isDirectory:()=>dir,isFile:()=>!dir&&!links.has(prefix+name),isSymbolicLink:()=>links.has(prefix+name)}));},
  };
  const candidate={root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  return {files,saved,assets,links,candidate,get reads(){return reads;}};
}
let candidateProducerBaseline;
async function producerBaseline(){return candidateProducerBaseline??=productScenario().then(async f=>({report:await f.execute(),saved:f.saved,directory:f.directory}));}
async function producerRun(f,execute){const {runProductAudio}=await import('../scripts/check-product-audio.mjs');return runProductAudio({runId:'ScenarioA'},{platform:'win32',files:f.files,attest:async()=>({sourceSha256:'same'}),verifyCandidate:async()=>f.candidate,execute});}
function producerSummary(f){return JSON.parse(f.saved.get('output/audio-product-ScenarioA/summary.json'));}
async function producerPassingExecutor(f,mutate,skipVerify=false){
  const base=await producerBaseline();for(const [name,bytes]of base.saved)f.saved.set(name,bytes);f.saved.set(base.directory+'/trace.zip',Buffer.from('unit trace'));f.saved.set('extension/web/audio-transition-worklet.js',Buffer.from('fixed packaged worklet bytes'));
  return async options=>{if(!skipVerify)await options.dependencies.verifyCandidate('ScenarioA',process.cwd(),{retainEvidence:true});await mutate?.();const source={sourceSha256:'same'};return {...structuredClone(base.report),ok:true,source,after:source,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}};};
}
test('product candidate endpoints preserve the existing before field and persist a matching after field',async()=>{
  const f=candidateProducerFixture(),execute=await producerPassingExecutor(f);const result=await producerRun(f,execute);assert.equal(result.audioProduct.passed,true);const r=producerSummary(f);assert.equal(r.ok,true);assert.ok(r.candidate.length);assert.deepEqual(r.candidateAfter,r.candidate);assert.equal(r.schema,'f01-product-observation-run-v1');
});
test('product candidate added file invalidates an otherwise accepted actual scenario report',async()=>{
  const f=candidateProducerFixture(),execute=await producerPassingExecutor(f,()=>{f.assets.set('extra.js',Buffer.from('unexpected'));});await assert.rejects(()=>producerRun(f,execute),/audio-product-observation-failed/);const r=producerSummary(f);assert.equal(r.error,null);assert.equal(r.ok,false);assert.equal(r.candidateAfter,null);assert.ok(r.secondaryErrors.some(e=>e.code==='audio-product-candidate-files'));
});
test('product candidate cannot claim success without the verify hook and a formed before inventory',async()=>{
  const f=candidateProducerFixture(),execute=await producerPassingExecutor(f,null,true);await assert.rejects(()=>producerRun(f,execute),/audio-product-observation-failed/);const r=producerSummary(f);assert.equal(r.error.message,'audio-product-candidate-unformed');assert.equal(r.candidate,null);assert.equal(r.candidateAfter,null);
});
test('product candidate copies path and file metadata rather than following caller mutation',async()=>{
  const f=candidateProducerFixture(),execute=await producerPassingExecutor(f,()=>{f.candidate.root=require('node:path').join(process.cwd(),'other');f.candidate.dist=require('node:path').join(process.cwd(),'other/dist');f.candidate.files.push('dist/missing.js');});await producerRun(f,execute);const r=producerSummary(f);assert.equal(r.ok,true);assert.deepEqual(r.candidateAfter,r.candidate);assert.equal(r.candidate.length,1);
});
for(const fault of ['changed','removed','nested-extra','linked','read'])test('product candidate '+fault+' after failure preserves the primary scenario error and its partial endpoints',async()=>{
  const f=candidateProducerFixture();await assert.rejects(()=>producerRun(f,async options=>{await options.dependencies.verifyCandidate('ScenarioA',process.cwd(),{retainEvidence:true});
    if(fault==='changed')f.assets.set('web/audio-transition-worklet.js',Buffer.from('changed'));
    if(fault==='removed')f.assets.delete('web/audio-transition-worklet.js');if(fault==='nested-extra')f.assets.set('web/extra.js',Buffer.from('unexpected'));if(fault==='linked')f.links.add('web/audio-transition-worklet.js');if(fault==='read')f.files.readFile=async()=>{throw Error('product-after-read');};throw Error('original-product-primary');
  }),/audio-product-observation-failed/);const r=producerSummary(f);assert.equal(r.error.message,'original-product-primary');assert.equal(r.ok,false);assert.equal(r.candidate.length,1);assert.equal(r.secondaryErrors.length,1);
  if(fault==='changed'){assert.ok(Array.isArray(r.candidateAfter));assert.notDeepEqual(r.candidateAfter,r.candidate);assert.equal(r.secondaryErrors[0].message,'audio-product-candidate-changed');}else assert.equal(r.candidateAfter,null);
});
test('product candidate before read failure is not retried and cannot enter the scenario',async()=>{
  const f=candidateProducerFixture();let reads=0,reached=false;f.files.readFile=async()=>{reads++;throw Error('product-before-read');};await assert.rejects(()=>producerRun(f,async options=>{await options.dependencies.verifyCandidate('ScenarioA',process.cwd(),{retainEvidence:true});reached=true;}),/audio-product-observation-failed/);const r=producerSummary(f);assert.equal(reached,false);assert.equal(reads,1);assert.equal(r.candidate,null);assert.equal(r.candidateAfter,null);assert.deepEqual(r.secondaryErrors,[]);assert.equal(r.error.message,'product-before-read');
});
for(const phase of ['before','after'])test('product candidate '+phase+' timeout keeps the endpoint null after late completion',async()=>{
  const f=candidateProducerFixture(),read=f.files.readFile,timer=global.setTimeout;let calls=0,release,guard,reached=false;f.files.readFile=async(...args)=>{if(++calls===(phase==='before'?1:2))return new Promise(resolve=>{release=resolve;});return read(...args);};global.setTimeout=(fn,ms,...args)=>timer(fn,ms===30000?5:ms,...args);
  try{await assert.rejects(()=>Promise.race([producerRun(f,async options=>{await options.dependencies.verifyCandidate('ScenarioA',process.cwd(),{retainEvidence:true});reached=true;throw Error('primary-after-candidate');}),new Promise((_,reject)=>{guard=timer(()=>reject(Error('product-test-hung')),250);})]),e=>e.message==='audio-product-observation-failed'&&(phase==='before'?e.error.message.includes('audio-operation-timeout'):e.secondaryErrors.some(x=>x.message.includes('audio-operation-timeout'))));}finally{global.setTimeout=timer;clearTimeout(guard);}
  const r=producerSummary(f);assert.equal(reached,phase==='after');assert.equal(phase==='before'?r.candidate:r.candidateAfter,null);release(Buffer.from('fixed packaged worklet bytes'));await new Promise(resolve=>setImmediate(resolve));assert.equal(phase==='before'?producerSummary(f).candidate:producerSummary(f).candidateAfter,null);
});


test('original transition selector is finite, canonical and rate-bound before side effects',async()=>{
  const m=await load();assert.equal(m.PRODUCT_TRANSITION_CASES.length,6);
  for(const rate of [44100,48000,96000])for(const frequency of [250,1000]){
    const spec=m.selectProductCase(`${rate}/transition/${frequency}`);assert.equal(spec.frequency,frequency);assert.equal(spec.sampleRate,rate);assert.ok(Object.isFrozen(spec));
    assert.equal(m.parseProductAudioArgs(['--run-id=TransitionUnit','--case='+spec.id]).caseId,spec.id);
    assert.throws(()=>m.parseProductAudioArgs(['--run-id=TransitionUnit','--case='+spec.id,'--component-witness']));
    assert.throws(()=>m.parseProductAudioArgs(['--run-id=TransitionUnit','--case='+spec.id,'--sample-rate='+(rate===44100?48000:44100)]));
    await assert.rejects(()=>m.runProductAudioScenario({},null,null,rate,{...spec,frequency:750}),/transition-original-spec/);
    const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),source={sourceSha256:'same'},f=files(),options={runId:'DispatchTransition',caseId:spec.id};let actual;
    Object.assign(f,{root:process.cwd(),lstat:async()=>null,ensureDirectory:async()=>{},readFile:async()=>'<html></html>'});
    const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},evaluate:async(fn,arg)=>{if(fn.name==='installProcessingProbe'){assert.equal(arg.sampleRate,rate);return;}if(arg.kind==='signal'){actual=arg.frequency;throw Error('unit-dispatch-boundary');}throw Error('unit-failure-evidence-boundary');}};
    await assert.rejects(()=>runProductAudio(options,{platform:'win32',files:f,attest:async()=>{options.caseId='44100/transition/1000';return source;},execute:async settings=>settings.dependencies.mediaScenario({context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async()=>{}},extensionId:'actual',artifactPath:require('node:path').join(process.cwd(),'output/playwright/installed-extension-DispatchTransition')})}),/observation-failed/);
    assert.equal(actual,frequency,'wrapper dispatch freezes caller spec before attestation');
  }
  for(const id of ['44100/transition/750','44100/transition/251','192000/transition/250'])assert.throws(()=>m.selectProductCase(id));
});
for(const id of ['44100/transition/250','96000/transition/1000'])test('original transition scenario and saved replay '+id,async()=>{
  const m=await load(),spec=m.selectProductCase(id),scenario=await productScenario(null,null,null,spec),original=await scenario.execute(),report=original.audioProduct;
  assert.equal(report.schema,'f01-product-transition-observation-v1');assert.deepEqual(report.spec,spec);assert.equal(report.passed,true);assert.equal(report.nativeComplementaryWitness,'UNASSESSED');assert.equal(report.overallQualification,false);
  assert.equal(report.checkpoints[0].cursor,0);assert.equal(report.checkpoints[0].request.control,'button-click');assert.equal(report.actions.length,8);assert.equal(report.checkpoints.length,10);assert.equal(report.facts.signal.frequency,spec.frequency);assert.equal(report.archive.sampleRate,spec.sampleRate);assert.ok(report.archive.bytes<=96*1024*1024);
  assert.deepEqual(m.productTransitionTargetFailures(report,spec),[]);
  const reversed=structuredClone(report),reverse=o=>{o.commands.forEach(c=>c.message.seq=100-c.message.seq);o.replies.forEach(r=>{if(r.kind!=='prepared')r.seq=100-r.seq;});};reverse(reversed.facts.productObservation);reversed.checkpoints.forEach(c=>reverse(c.facts.productObservation));assert.ok(m.productTransitionTargetFailures(reversed,spec).length,'decreasing seq is impossible for the real controller');
  const short=structuredClone(report);short.checkpoints[2].facts.productObservation.replies=[];assert.ok(m.productTransitionTargetFailures(short,spec).length,'checkpoint reply prefix cannot shrink');
  const unordered=structuredClone(report),swap=o=>{const a=o.replies.findIndex(r=>r.kind==='accepted'&&r.seq===2),b=o.replies.findIndex(r=>r.kind==='completed'&&r.seq===2);if(a>=0&&b>=0)[o.replies[a],o.replies[b]]=[o.replies[b],o.replies[a]];};swap(unordered.facts.productObservation);unordered.checkpoints.forEach(c=>swap(c.facts.productObservation));assert.ok(m.productTransitionTargetFailures(unordered,spec).length,'completed cannot arrive before accepted');
  for(const fault of ['zero-seq','zero-epoch','command-key','reply-key','reply-gain','reply-meter']){
    const changed=structuredClone(report),alter=o=>{
      if(fault==='zero-seq'){o.commands.forEach(c=>c.message.seq--);o.replies.forEach(r=>{if(r.kind!=='prepared')r.seq--;});}
      if(fault==='zero-epoch'){o.commands.forEach(c=>c.message.sourceEpoch=0);o.replies.forEach(r=>r.sourceEpoch=0);}
      if(fault==='command-key')o.commands[0].message.unknown=true;
      const reply=o.replies.find(r=>r.kind==='completed');if(reply){if(fault==='reply-key')reply.unknown=true;if(fault==='reply-gain')reply.gain=2;if(fault==='reply-meter')reply.meterEpoch=-1;}
    };alter(changed.facts.productObservation);changed.checkpoints.forEach(c=>alter(c.facts.productObservation));assert.ok(m.productTransitionTargetFailures(changed,spec).length,fault);
  }
  for(const [name,field,value]of [['eq-on','gain',2],['normalizer-on','normalizer',false],['normalizer-on','dynamics',false],['mixed-before-master','targetDbfs',-19],['master-off','wanted',true]]){
    const changed=structuredClone(report),row=changed.checkpoints.find(c=>c.name===name);changed.facts.productObservation.commands[row.cursor].message[field]=value;assert.ok(m.productTransitionTargetFailures(changed,spec).length,name+'/'+field);
  }
  for(const fault of [null,'wrong-eq','wrong-mixed','action-frame','order','ACK','epoch','frequency','rate','complement','overall','PCM','transplant','segment-ledger','cold-extra','cold-request','readback','missing-failures','missing-errors']){
    const f=candidateProducerFixture(),result=structuredClone(original);for(const [name,bytes]of scenario.saved)f.saved.set(name,Buffer.from(bytes));
    const r=result.audioProduct;f.saved.set(scenario.directory+'/trace.zip',Buffer.from('unit trace'));f.saved.set('extension/web/audio-transition-worklet.js',Buffer.from('fixed packaged worklet bytes'));
    if(fault==='wrong-eq'||fault==='wrong-mixed'||fault==='ACK'||fault==='epoch'){
      const cursor=r.checkpoints.find(c=>c.name===(fault==='wrong-mixed'?'mixed-before-master':'eq-on')).cursor;
      const mutate=o=>{if(o?.commands?.[cursor]){if(fault==='ACK')o.replies=o.replies.filter(x=>x.kind!=='completed'||x.seq!==o.commands[cursor].message.seq);else if(fault==='epoch')o.commands[cursor].message.sourceEpoch++;else o.commands[cursor].message.eq[4]=0;}};
      mutate(r.facts.productObservation);r.checkpoints.forEach(c=>mutate(c.facts.productObservation));
      for(const row of r.archive.artifacts.filter(a=>a.kind==='metadata')){const raw=JSON.parse(f.saved.get(row.file));mutate(raw);const bytes=Buffer.from(JSON.stringify(raw));f.saved.set(row.file,bytes);row.bytes=bytes.length;row.sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');}
    }
    if(fault==='cold-extra'){
      const initial=structuredClone(r.facts.productObservation.commands[0]);initial.message.seq=999;
      for(const o of [r.facts.productObservation,...r.checkpoints.map(c=>c.facts.productObservation)]){o.commands.unshift(structuredClone(initial));o.replies.unshift({kind:'accepted',sourceEpoch:1,seq:999,frame:128,code:null},{kind:'completed',sourceEpoch:1,seq:999,frame:1600,code:null});}
      r.checkpoints.slice(1).forEach(c=>c.cursor++);
    }
    if(fault==='cold-request')r.checkpoints[0].request.frame++;
    if(fault==='readback')r.facts.readback.state='unavailable';
    if(fault==='missing-failures')delete r.failures;if(fault==='missing-errors')delete r.pageErrors;
    if(fault==='action-frame')r.actions[0].frame++;
    if(fault==='order')r.actions.reverse();if(fault==='complement')r.nativeComplementaryWitness='PASS';if(fault==='overall')r.overallQualification=true;
    if(fault==='frequency')r.facts.signal.frequency=spec.frequency===250?1000:250;
    if(fault==='rate')r.archive.sampleRate=spec.sampleRate===44100?48000:44100;
    if(fault==='PCM'){
      const row=r.archive.artifacts.find(x=>x.channels===2&&x.file.endsWith('stream-1.f32le')),bytes=Buffer.from(f.saved.get(row.file));bytes.fill(0);f.saved.set(row.file,bytes);row.sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
      const meta=r.archive.artifacts.find(x=>x.kind==='metadata'&&x.start===row.start),raw=JSON.parse(f.saved.get(meta.file));raw.streams[1]=structuredClone(row);const data=Buffer.from(JSON.stringify(raw));f.saved.set(meta.file,data);meta.bytes=data.length;meta.sha256=require('node:crypto').createHash('sha256').update(data).digest('hex');
    }
    let callerSpec=spec;
    if(fault==='transplant'){
      callerSpec=m.selectProductCase(`${spec.sampleRate}/transition/${spec.frequency===250?1000:250}`);r.spec=callerSpec;r.scope=callerSpec.id;r.facts.signal.frequency=callerSpec.frequency;r.checkpoints.forEach(c=>{c.facts.signal.frequency=callerSpec.frequency;});
    }
    if(fault==='segment-ledger'){
      const row=r.archive.artifacts.find(a=>a.kind==='metadata'),raw=JSON.parse(f.saved.get(row.file));raw.commands[0].message.wanted=false;const data=Buffer.from(JSON.stringify(raw));f.saved.set(row.file,data);row.bytes=data.length;row.sha256=require('node:crypto').createHash('sha256').update(data).digest('hex');
    }
    f.saved.set(scenario.directory+'/assessment.json',Buffer.from(JSON.stringify(r)));
    const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),source={sourceSha256:'same'};
    const run=()=>runProductAudio({runId:'ScenarioA',caseId:callerSpec.id},{platform:'win32',files:f.files,attest:async()=>source,verifyCandidate:async()=>f.candidate,execute:async options=>{await options.dependencies.verifyCandidate('ScenarioA',process.cwd(),{});return {...result,ok:true,source,after:source,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}};}});
    if(fault){await assert.rejects(run,/audio-product-observation-failed/,fault);assert.equal(producerSummary(f).ok,false);}else assert.equal((await run()).audioProduct.passed,true);
  }
});


test('transition caller mutation after dispatch cannot replace the canonical input',async()=>{
  const {selectProductCase}=await load(),original=selectProductCase('48000/transition/250'),caller={...original};
  const f=await productScenario(null,()=>{caller.frequency=1000;caller.sampleRate=96000;},null,caller),{audioProduct:r}=await f.execute();
  assert.deepEqual(r.spec,original);assert.equal(r.facts.signal.frequency,250);assert.equal(r.archive.sampleRate,48000);
});


test('original wet peak selector keeps exactly three rates and rejects forged caller specs',async()=>{
  const m=await load();assert.equal(m.PRODUCT_WET_PEAK_CASES.length,3);
  for(const rate of [44100,48000,96000]){
    const spec=m.selectProductCase(`${rate}/output-control/wet-peak`);assert.ok(Object.isFrozen(spec));assert.equal(spec.inputDbfs,20*Math.log10(.99));assert.equal(spec.pattern,'dc');assert.equal(spec.gain,2);
    assert.equal(m.parseProductAudioArgs(['--run-id=WetUnit','--case='+spec.id]).caseId,spec.id);
    assert.throws(()=>m.parseProductAudioArgs(['--run-id=WetUnit','--case='+spec.id,'--component-witness']));
    await assert.rejects(()=>m.runProductAudioScenario({},null,null,rate,{...spec,gain:1}),/original-spec/);
    assert.throws(()=>m.parseProductAudioArgs(['--run-id=WetUnit','--case='+spec.id,'--sample-rate='+(rate===44100?48000:44100)]));
    const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),source={sourceSha256:'same'},f=files(),options={runId:'DispatchWet',caseId:spec.id};let actual;
    Object.assign(f,{root:process.cwd(),lstat:async()=>null,ensureDirectory:async()=>{},readFile:async()=>'<html></html>'});
    const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},evaluate:async(fn,arg)=>{if(fn.name==='installProcessingProbe'){assert.equal(arg.sampleRate,rate);return;}if(arg.kind==='signal'){actual=arg;throw Error('unit-wet-dispatch');}throw Error('unit-wet-failure-evidence');}};
    await assert.rejects(()=>runProductAudio(options,{platform:'win32',files:f,attest:async()=>{options.caseId='44100/output-control/wet-peak';return source;},execute:async settings=>settings.dependencies.mediaScenario({context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async()=>{}},extensionId:'actual',artifactPath:require('node:path').join(process.cwd(),'output/playwright/installed-extension-DispatchWet')})}),/observation-failed/);
    assert.equal(actual.inputDbfs,spec.inputDbfs);assert.equal(actual.pattern,'dc');assert.equal(actual.frequency,1000);
  }
});
for(const rate of [44100,48000,96000])test('original wet peak actual capture and stored PCM '+rate,async()=>{
  const m=await load(),spec=m.selectProductCase(`${rate}/output-control/wet-peak`),f=await productScenario(null,null,null,spec),original=await f.execute(),r=original.audioProduct;
  assert.equal(r.schema,'f01-product-wet-peak-observation-v1');assert.equal(r.passed,true);assert.equal(r.wetPeak.passed,true);assert.equal(r.overallQualification,false);assert.equal(r.native7Witness,'UNASSESSED');assert.equal(r.native8Witness,'UNASSESSED');
  assert.equal(f.calls.filter(c=>c.kind==='capture').length,1);assert.equal(f.calls[f.calls.findIndex(c=>c.kind==='configure'&&c.gain===2)+1].kind,'capture','no main facts IO between pause and capture');assert.equal(r.measurement.end-r.measurement.start,rate);assert.equal(r.measurement.end%128,0);assert.equal(r.facts.readback.appliedGain,2);
  const proof=JSON.parse(f.saved.get(f.directory+'/wet-peak-target.json'));assert.equal(proof.beforeTarget.readback.state,'off');assert.equal(proof.beforeTarget.readback.gain,1);assert.deepEqual(proof.beforeTarget.productObservation.commands,[]);assert.equal(proof.settling.milliseconds,1250);
  for(const fault of [null,'spec','PCM','gain','ACK','window','summary','source','prefix','readback','error-array','outside-window','source-pcm','capture-file','budget','case-rate','settling-time','clock-order']){
    const fixture=candidateProducerFixture(),result=structuredClone(original);for(const [name,bytes]of f.saved)fixture.saved.set(name,Buffer.from(bytes));fixture.saved.set(f.directory+'/trace.zip',Buffer.from('unit trace'));fixture.saved.set('extension/web/audio-transition-worklet.js',Buffer.from('fixed packaged worklet bytes'));
    const report=result.audioProduct,p=structuredClone(proof);
    if(fault==='settling-time')p.settling.end=p.settling.start+1249;if(fault==='clock-order')p.capture.returnedAt=p.capture.calledAt-1;
    if(fault==='spec')report.spec.gain=1;if(fault==='window')p.measurement.start++;if(fault==='summary')p.measurement.summary.channels[0].peak=0;
    if(fault==='gain')p.captureAfter.productObservation.commands[0].message.gain=1;
    if(fault==='ACK')report.facts.productObservation.replies=report.facts.productObservation.replies.filter(x=>x.kind!=='completed');
    if(fault==='source')report.facts.signal.inputDbfs=-24;if(fault==='prefix')p.captureAfter.productObservation.replies=[];
    if(fault==='readback')report.facts.readback.state='off';if(fault==='error-array')delete report.pageErrors;
    if(fault==='budget')report.archive.bytes=96*1024*1024-1;
    if(fault==='capture-file')fixture.saved.get(p.capture.file)[0]^=1;
    if(['PCM','outside-window','source-pcm'].includes(fault)){
      const stream=fault==='source-pcm'?1:0;
      const row=report.archive.artifacts.find(x=>x.file.endsWith(`stream-${stream}.f32le`)&&(fault==='PCM'?x.start<=report.measurement.start&&x.end>report.measurement.start:true)),bytes=Buffer.from(fixture.saved.get(row.file));bytes.writeFloatLE(fault==='source-pcm'?0:.99,fault==='PCM'?(report.measurement.start-row.start)*8:0);fixture.saved.set(row.file,bytes);row.sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
      const metadata=report.archive.artifacts.find(x=>x.kind==='metadata'&&x.start===row.start),raw=JSON.parse(fixture.saved.get(metadata.file));raw.streams[stream]=structuredClone(row);const data=Buffer.from(JSON.stringify(raw));fixture.saved.set(metadata.file,data);metadata.bytes=data.length;metadata.sha256=require('node:crypto').createHash('sha256').update(data).digest('hex');
    }
    fixture.saved.set(f.directory+'/wet-peak-target.json',Buffer.from(JSON.stringify(p)));fixture.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));
    const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),source={sourceSha256:'same'};
    const run=()=>runProductAudio({runId:'ScenarioA',caseId:fault==='case-rate'?`${rate===44100?48000:44100}/output-control/wet-peak`:spec.id},{platform:'win32',files:fixture.files,attest:async()=>source,verifyCandidate:async()=>fixture.candidate,execute:async options=>{await options.dependencies.verifyCandidate('ScenarioA',process.cwd(),{});return {...result,ok:true,source,after:source,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}};}});
    if(fault&&fault!=='outside-window')await assert.rejects(run,/observation-failed/,fault);else assert.equal((await run()).audioProduct.passed,true);
  }
});
for(const fault of ['wet-ceiling','wet-silent','source-gap'])test('wet peak preserves original '+fault+' classification and never retries capture',async()=>{
  const m=await load(),spec=m.selectProductCase('44100/output-control/wet-peak'),f=await productScenario(fault,null,null,spec);
  if(fault==='wet-silent')assert.equal((await f.execute()).audioProduct.passed,true,'original upper-bound gate has no RMS floor');
  else {await assert.rejects(f.execute,/quality-or-observation-failed/);const r=JSON.parse(f.saved.get(f.directory+'/assessment.json'));assert.equal(r.outcome,fault==='source-gap'?'INCONCLUSIVE':'FAIL');assert.equal(r.qualityAssessed,fault!=='source-gap');}
  assert.equal(f.calls.filter(c=>c.kind==='capture').length,1);
});


test('wet peak preserves capture failure and never selects another window',async()=>{
  const {selectProductCase}=await load(),f=await productScenario('wet-capture-stop',null,null,selectProductCase('44100/output-control/wet-peak'));
  await assert.rejects(f.execute,/wet-capture-stop/);assert.equal(f.calls.filter(c=>c.kind==='capture').length,1);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
  const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(partial.error,/wet-capture-stop/);assert.equal(partial.wetPeak.spec.id,'44100/output-control/wet-peak');
});
test('wet peak capture write failure keeps primary error and charged original bytes',async()=>{
  const {selectProductCase}=await load(),f=await productScenario(null,null,null,selectProductCase('96000/output-control/wet-peak')),write=f.files.writeFile;
  f.files.writeFile=async(name,...args)=>{if(name.endsWith('/wet-peak-capture.f32le'))throw Error('wet-capture-disk-full');return write(name,...args);};
  await assert.rejects(f.execute,/wet-capture-disk-full/);assert.equal(f.calls.filter(c=>c.kind==='capture').length,1);
  const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(partial.extraEvidenceBytes,96000*8);assert.match(partial.error,/wet-capture-disk-full/);assert.equal(partial.wetPeak.capture.bytes,96000*8);assert.equal(Buffer.from(partial.pendingCapture.base64,'base64').length,96000*8);
});
test('wet peak caller spec is canonical before async module work',async()=>{
  const {selectProductCase}=await load(),spec=selectProductCase('48000/output-control/wet-peak'),caller={...spec},f=await productScenario(null,()=>{caller.gain=1;caller.inputDbfs=-24;caller.sampleRate=96000;},null,caller);
  const r=(await f.execute()).audioProduct;assert.deepEqual(r.spec,spec);assert.equal(r.facts.readback.appliedGain,2);assert.equal(r.facts.signal.inputDbfs,spec.inputDbfs);
});


test('wet peak after-capture read failure preserves the original PCM before later IO',async()=>{
  const {selectProductCase}=await load(),f=await productScenario('wet-after-facts',null,null,selectProductCase('44100/output-control/wet-peak'));
  await assert.rejects(f.execute,/wet-after-facts/);const bytes=f.saved.get(f.directory+'/wet-peak-capture.f32le');assert.ok(bytes);assert.equal(bytes.length,44100*8);
  const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.wetPeak.capture.bytes,bytes.length);assert.equal(f.calls.filter(c=>c.kind==='capture').length,1);
});
test('wet peak archive reserves the single capture before any append',async()=>{
  const {createProductArchive}=await load(),rate=96000,reserve=rate*8,archive=createProductArchive({writeFile:async()=>{}},'wet-reserve',rate,'wet-peak'),cap=96*1024*1024;
  assert.equal(archive.summary().reservedBytes,reserve);
  let end=0;for(;;){const size=Math.min(rate,Math.floor((cap-reserve-archive.summary().bytes)/36));if(size===0)break;const r=raw(end,end+size);r.sampleRate=rate;await archive.append(r);end+=size;}
  const r=raw(end,end+1);r.sampleRate=rate;await assert.rejects(()=>archive.append(r),/archive-cap/);assert.ok(archive.summary().bytes+reserve<=cap);
});


test('wet peak invalid module bytes preserve raw evidence without claiming quality qualification',async()=>{
  const {selectProductCase}=await load(),f=await productScenario(null,null,null,selectProductCase('44100/output-control/wet-peak')),read=f.files.readFile;
  f.files.readFile=async(name,...args)=>name.startsWith('dist/')?Buffer.from('different expected module bytes'):read(name,...args);
  await assert.rejects(f.execute,/quality-or-observation-failed/);const r=JSON.parse(f.saved.get(f.directory+'/assessment.json'));assert.equal(r.qualityAssessed,false);assert.equal(r.passed,false);assert.ok(r.failures.includes('actual-module-bytes'));assert.ok(f.saved.has(f.directory+'/wet-peak-capture.f32le'));
});


test('dry original selectors support exactly two DC levels at three rates and freeze caller dispatch',async()=>{
  const m=await load();assert.equal(m.PRODUCT_DRY_CASES.length,6);
  for(const rate of [44100,48000,96000])for(const name of ['dry-unity','dry-99']){
    const spec=m.selectProductCase(`${rate}/output-control/${name}`);assert.ok(Object.isFrozen(spec));assert.equal(spec.gain,1);assert.equal(spec.pattern,'dc');assert.equal(spec.inputDbfs,name==='dry-unity'?0:20*Math.log10(.99));
    assert.equal(m.parseProductAudioArgs(['--run-id=DryUnit','--case='+spec.id]).caseId,spec.id);assert.throws(()=>m.parseProductAudioArgs(['--run-id=DryUnit','--case='+spec.id,'--component-witness']));
    assert.throws(()=>m.parseProductAudioArgs(['--run-id=DryUnit','--case='+spec.id,'--sample-rate='+(rate===44100?48000:44100)]));
    await assert.rejects(()=>m.runProductAudioScenario({},null,null,rate,{...spec,inputDbfs:-24}),/original-spec/);
    const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),source={sourceSha256:'same'},f=files(),options={runId:'DispatchDry',caseId:spec.id};let actual;
    Object.assign(f,{root:process.cwd(),lstat:async()=>null,ensureDirectory:async()=>{},readFile:async()=>'<html></html>'});
    const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},evaluate:async(fn,arg)=>{if(fn.name==='installProcessingProbe'){assert.equal(arg.sampleRate,rate);return;}if(arg.kind==='signal'){actual=arg;throw Error('unit-dry-dispatch');}throw Error('unit-dry-failure-evidence');}};
    await assert.rejects(()=>runProductAudio(options,{platform:'win32',files:f,attest:async()=>{options.caseId='44100/output-control/wet-peak';options.sampleRate=96000;return source;},execute:async settings=>settings.dependencies.mediaScenario({context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async()=>{}},extensionId:'actual',artifactPath:require('node:path').join(process.cwd(),'output/playwright/installed-extension-DispatchDry')})}),/observation-failed/);
    assert.equal(actual.inputDbfs,spec.inputDbfs);assert.equal(actual.pattern,'dc');assert.equal(actual.frequency,1000);
  }
});
for(const rate of [44100,48000,96000])for(const name of ['dry-unity','dry-99'])test('dry original warm OFF capture and stored replay '+rate+'/'+name,async()=>{
  const m=await load(),spec=m.selectProductCase(`${rate}/output-control/${name}`),f=await productScenario(null,null,null,spec),original=await f.execute().catch(e=>{e.message+=' '+JSON.parse(f.saved.get(f.directory+'/assessment.json')).failures.join(',');throw e;}),r=original.audioProduct,proof=JSON.parse(f.saved.get(f.directory+'/dry-target.json'));
  assert.equal(r.schema,'f01-product-dry-observation-v1');assert.equal(r.passed,true);assert.equal(r.dry.passed,true);assert.equal(r.overallQualification,false);assert.equal(r.native7Witness,'UNASSESSED');assert.equal(r.native8Witness,'UNASSESSED');
  assert.equal(f.calls.filter(c=>c.kind==='capture').length,1);assert.equal(r.measurement.end-r.measurement.start,rate);assert.equal(r.facts.readback.state,'off');assert.equal(r.facts.readback.appliedGain,1);
  assert.equal(proof.beforeTarget.readback.state,'on');assert.equal(proof.beforeTarget.productObservation.sources,1);assert.equal(proof.priming.milliseconds,1250);assert.equal(proof.settling.milliseconds,1250);
  assert.equal(proof.request.status,'off');assert.equal(r.facts.productObservation.commands.length,2);assert.equal(r.archive.profile,'dry');assert.equal(r.archive.reservedBytes,rate*8);
  for(const fault of [null,'spec','target','prime','prime-clock','ACK','capture-prefix','request','window','control','source','capture-file','clock','readback','budget','level-transplant','before-prefix']){
    const fixture=candidateProducerFixture(),result=structuredClone(original),p=structuredClone(proof);for(const [path,bytes]of f.saved)fixture.saved.set(path,Buffer.from(bytes));fixture.saved.set(f.directory+'/trace.zip',Buffer.from('unit trace'));fixture.saved.set('extension/web/audio-transition-worklet.js',Buffer.from('fixed packaged worklet bytes'));const report=result.audioProduct;
    if(fault==='spec')report.spec.gain=2;if(fault==='target')report.facts.productObservation.commands[1].message.wanted=true;
    if(fault==='prime')p.priming.before.productObservation.commands.push({message:{}});if(fault==='prime-clock')p.priming.end=p.priming.start+1249;
    if(fault==='before-prefix')p.beforeTarget.productObservation.commands[0].message.eq[4]=6;
    if(fault==='ACK')report.facts.productObservation.replies=report.facts.productObservation.replies.filter(x=>x.kind!=='completed'||x.seq!==2);
    if(fault==='capture-prefix')p.captureAfter.productObservation.replies=[];if(fault==='request')p.request.status='on';if(fault==='window')p.measurement.start++;
    if(fault==='clock')p.settling.end=p.settling.start+1249;if(fault==='readback')report.facts.readback.state='on';if(fault==='budget')report.archive.bytes=96*1024*1024-1;
    if(fault==='capture-file')fixture.saved.get(p.capture.file)[0]^=1;
    if(fault==='source'||fault==='control'){
      const stream=fault==='source'?1:2,row=report.archive.artifacts.find(x=>x.file.endsWith(`stream-${stream}.f32le`)&&x.start<=report.measurement.start&&x.end>report.measurement.start),bytes=Buffer.from(fixture.saved.get(row.file)),n=report.measurement.start-row.start;
      bytes.writeFloatLE(fault==='source'?0:1,n*(stream===2?20:8)+(stream===2?4:0));fixture.saved.set(row.file,bytes);row.sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
      const metadata=report.archive.artifacts.find(x=>x.kind==='metadata'&&x.start===row.start),raw=JSON.parse(fixture.saved.get(metadata.file));raw.streams[stream]=structuredClone(row);const data=Buffer.from(JSON.stringify(raw));fixture.saved.set(metadata.file,data);metadata.bytes=data.length;metadata.sha256=require('node:crypto').createHash('sha256').update(data).digest('hex');
    }
    let caller=spec;
    if(fault==='level-transplant'){
      caller=m.selectProductCase(`${rate}/output-control/${name==='dry-unity'?'dry-99':'dry-unity'}`);report.spec=caller;report.scope=caller.id;p.spec=caller;
      for(const facts of [report.facts,p.beforeTarget,p.captureAfter,p.priming.before])facts.signal.inputDbfs=caller.inputDbfs;
    }
    fixture.saved.set(f.directory+'/dry-target.json',Buffer.from(JSON.stringify(p)));fixture.saved.set(f.directory+'/assessment.json',Buffer.from(JSON.stringify(report)));
    const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),source={sourceSha256:'same'},run=()=>runProductAudio({runId:'ScenarioA',caseId:caller.id},{platform:'win32',files:fixture.files,attest:async()=>source,verifyCandidate:async()=>fixture.candidate,execute:async opts=>{await opts.dependencies.verifyCandidate('ScenarioA',process.cwd(),{});return {...result,ok:true,source,after:source,profileRetained:true,candidateRetained:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}};}});
    if(fault)await assert.rejects(run,/observation-failed/,fault);else assert.equal((await run()).audioProduct.passed,true);
  }
});
for(const fault of ['dry-silent','dry-negative','dry-near','dry-far','source-gap'])test('dry preserves original RMS scope '+fault,async()=>{
  const {selectProductCase}=await load(),f=await productScenario(fault,null,null,selectProductCase('44100/output-control/dry-unity'));
  if(['dry-negative','dry-near'].includes(fault))assert.equal((await f.execute()).audioProduct.passed,true);
  else {await assert.rejects(f.execute,/quality-or-observation-failed/);const r=JSON.parse(f.saved.get(f.directory+'/assessment.json'));assert.equal(r.outcome,fault==='source-gap'?'INCONCLUSIVE':'FAIL');assert.equal(r.qualityAssessed,fault!=='source-gap');}
  assert.equal(f.calls.filter(c=>c.kind==='capture').length,1);
});


for(const fault of ['dry-first-on','dry-readback','dry-priming','dry-before-target'])test('dry initial failure preserves formed proof '+fault,async()=>{
  const {selectProductCase}=await load(),spec=selectProductCase('44100/output-control/dry-unity'),f=await productScenario(fault,null,null,spec);
  await assert.rejects(f.execute,new RegExp(fault+'-stop'));const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));
  assert.deepEqual(p.dry.spec,spec);assert.equal(p.dry.priming.before.productObservation.sources,0);assert.deepEqual(p.dry.priming.before.productObservation.commands,[]);assert.ok(p.dry.stage);assert.equal(f.calls.filter(c=>c.kind==='capture').length,0);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
  if(fault==='dry-priming'){assert.ok(Number.isFinite(p.dry.priming.start));assert.equal(p.dry.priming.end,null);}
  if(fault==='dry-before-target')assert.ok(Number.isFinite(p.dry.priming.end));
});


test('dry post-OFF failures retain the capture and pending evidence without another window',async()=>{
  const {selectProductCase}=await load(),spec=selectProductCase('96000/output-control/dry-99');
  for(const fault of ['wet-capture-stop','write','wet-after-facts']){
    const f=await productScenario(fault==='write'?null:fault,null,null,spec),write=f.files.writeFile;
    if(fault==='write')f.files.writeFile=async(path,...args)=>{if(path.endsWith('/dry-capture.f32le'))throw Error('dry-write-stop');return write(path,...args);};
    await assert.rejects(f.execute,new RegExp(fault==='write'?'dry-write-stop':fault));const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));
    assert.deepEqual(p.dry.spec,spec);assert.equal(p.archive.profile,'dry');assert.equal(p.archive.reservedBytes,96000*8);assert.equal(f.calls.filter(c=>c.kind==='capture').length,1);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
    if(fault==='write')assert.equal(Buffer.from(p.pendingCapture.base64,'base64').length,96000*8);
    if(fault==='wet-after-facts')assert.equal(f.saved.get(f.directory+'/dry-capture.f32le').length,96000*8);
  }
});
test('dry caller mutation after dispatch cannot change the canonical level and rate',async()=>{
  const {selectProductCase}=await load(),spec=selectProductCase('48000/output-control/dry-99'),caller={...spec},f=await productScenario(null,()=>{caller.inputDbfs=0;caller.gain=2;caller.sampleRate=96000;},null,caller);
  const r=(await f.execute()).audioProduct;assert.deepEqual(r.spec,spec);assert.equal(r.facts.signal.inputDbfs,spec.inputDbfs);assert.equal(r.facts.readback.state,'off');assert.equal(r.facts.readback.gain,1);
});

test('product CLI accepts an explicit pinned browser only for the selected original tone/silence case',async()=>{
  const {parseProductAudioArgs}=await load(),root=require('node:path').resolve('candidate-fixture'),hash='a'.repeat(64),base=['--run-id=CandidateA','--case=44100/normalizer-control/tone-silence'];
  const parsed=parseProductAudioArgs([...base,'--browser-root='+root,'--browser-manifest-sha256='+hash]);
  assert.deepEqual(parsed.browserCandidate,{root,manifestSha256:hash});assert.ok(Object.isFrozen(parsed.browserCandidate));
  for(const args of [[...base,'--browser-root='+root],[...base,'--browser-manifest-sha256='+hash],[...base,'--browser-root=relative','--browser-manifest-sha256='+hash],['--run-id=A','--browser-root='+root,'--browser-manifest-sha256='+hash],[...base,'--browser-root='+root,'--browser-manifest-sha256='+hash,'--browser-root='+root]])assert.throws(()=>parseProductAudioArgs(args));
});
