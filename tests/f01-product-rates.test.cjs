const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=()=>import('../scripts/extension-e2e/audio-product.mjs'),cap=96*1024*1024;
function raw(rate,start,end){
  return {schema:'f01-product-window-v1',sampleRate:rate,start,end,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',
    streams:[2,2,5].map(channels=>{
      const bytes=Buffer.alloc((end-start)*channels*4);
      for(let n=0;n<end-start;n++)for(let c=0;c<channels;c++)bytes.writeFloatLE(channels===5?[-1,1,1,1,0][c]:.2,((n*channels)+c)*4);
      return {start,end,channels,encoding:'interleaved-float32le',base64:bytes.toString('base64')};
    })};
}
function files(){const saved=new Map();return {root:process.cwd(),saved,lstat:async()=>null,ensureDirectory:async()=>{},readFile:async()=>'<html></html>',
  writeFile:async(name,bytes,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(name));saved.set(name,Buffer.from(bytes));}};}

test('fixed rate CLI preserves no-flag 44100 and accepts only the original three exact rates',async()=>{
  const {parseProductAudioArgs}=await load();assert.deepEqual(parseProductAudioArgs(['--run-id=RateA']),{runId:'RateA'});
  for(const sampleRate of [44100,48000,96000])assert.deepEqual(parseProductAudioArgs(['--run-id=RateA',`--sample-rate=${sampleRate}`]),{runId:'RateA',sampleRate});
  for(const args of [[],['--sample-rate=48000'],['--run-id=A','--sample-rate=22050'],['--run-id=A','--sample-rate=048000'],['--run-id=A','--sample-rate=48000.0'],
    ['--run-id=A','--sample-rate=NaN'],['--run-id=A','--sample-rate=48000','--sample-rate=96000'],['--run-id=A','--rate=48000']])assert.throws(()=>parseProductAudioArgs(args),/audio-product-args/);
});

for(const rate of [48000,96000])test(`original 750Hz provenance and request windows use selected ${rate} frames`,async()=>{
  const {createProductArchive,assessProductTransitions,productInputFailures,productOutputFailures}=await load(),f=files(),archive=createProductArchive(f,'rate-'+rate,rate);
  const length=rate/2,request=rate/5,record=raw(rate,0,length),source=Buffer.from(record.streams[1].base64,'base64');
  for(let n=0;n<length;n++)for(let c=0;c<2;c++)source.writeFloatLE(Math.SQRT2*10**(-24/20)*Math.sin(2*Math.PI*750*n/rate+.37),n*8+c*4);
  record.streams[1].base64=source.toString('base64');await archive.append(record);
  const row=assessProductTransitions(archive,[{name:'master-off',frame:request}])[0];
  assert.deepEqual([row.before.start,row.before.end,row.change.start,row.change.end,row.after.start,row.after.end],
    [request-.08*rate,request-.04*rate,request-.02*rate,request+.04*rate,request+.1*rate,request+.14*rate]);
  assert.equal(row.before.sampleRate,rate);assert.equal(row.change.channels[0].envelope8ms.windowSamples,Math.round(.008*rate));
  assert.deepEqual(row.failures,[]);assert.deepEqual(productInputFailures(archive,[{name:'master-off',frame:request}]),[]);assert.deepEqual(productOutputFailures(archive),[]);
  assert.equal(archive.summary().sampleRate,rate);assert.equal(archive.summary().cap,cap);
  const mismatch=files(),wrong=createProductArchive(mismatch,'wrong-'+rate,rate);await assert.rejects(()=>wrong.append(raw(44100,0,128)),/archive-coverage/);assert.equal(mismatch.saved.size,0);
  const bad=raw(rate,0,length);bad.streams[1].base64=Buffer.alloc(source.length).toString('base64');const missing=createProductArchive(files(),'missing-'+rate,rate);await missing.append(bad);
  assert.ok(productInputFailures(missing,[{name:'master-off',frame:request}]).includes('master-off/input-channel-0'));
});

test('archive default remains 44100 and invalid selected rates fail before persistence',async()=>{
  const {createProductArchive}=await load(),f=files();assert.equal(createProductArchive(f,'default').summary().sampleRate,44100);
  for(const rate of [0,22050,192000,NaN,'48000'])assert.throws(()=>createProductArchive(f,'invalid',rate),/sample-rate/);assert.equal(f.saved.size,0);
});

for(const rate of [48000,96000])test(`selected ${rate} still shares one 96MiB cap across all segments`,async()=>{
  const {createProductArchive}=await load(),archive=createProductArchive({writeFile:async()=>{}},'cap-'+rate,rate),segments=Math.floor(cap/(rate*36));
  for(let n=0;n<segments;n++)await archive.append(raw(rate,n*rate,(n+1)*rate));
  const before=archive.summary();await assert.rejects(()=>archive.append(raw(rate,segments*rate,(segments+1)*rate)),/archive-cap/);
  assert.equal(archive.summary().bytes,before.bytes);assert.equal(archive.summary().cap,cap);assert.equal(archive.summary().segments,segments);
});

test('wrapper rejects malformed rate options before any attestation or output writes',async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs');
  for(const sampleRate of [0,22050,192000,NaN,'48000']){
    const f=files();let attested=false;await assert.rejects(()=>runProductAudio({runId:'BadRate',sampleRate},{platform:'win32',files:f,attest:async()=>{attested=true;return {};},execute:async()=>{throw Error('must-not-execute');}}),/sample-rate|args/);
    assert.equal(attested,false);assert.equal(f.saved.size,0);
  }
});

for(const fault of ['archive','scope'])test(`wrapper rejects a ${fault} rate mismatch before reading claimed PCM evidence`,async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),f=files(),source={sourceSha256:'same'},runId='WrongRate'+fault;
  let evidenceReads=0;f.readFile=async()=>{evidenceReads++;throw Error('must-not-read-mismatched-evidence');};
  await assert.rejects(()=>runProductAudio({runId,sampleRate:48000},{platform:'win32',files:f,attest:async()=>source,execute:async()=>({
    ok:true,profileRetained:true,candidateRetained:true,source,after:source,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},
    audioProduct:{schema:'f01-product-observation-v2',passed:true,scope:`current-packaged-${fault==='scope'?96000:48000}-750-eight-step-sequence`,
      archive:{sampleRate:fault==='archive'?96000:48000,bytes:36,segments:1,artifacts:Array(4).fill({})}}
  })}),/observation-failed/);
  assert.equal(evidenceReads,0);const summary=JSON.parse(f.saved.get(`output/audio-product-${runId}/summary.json`));
  assert.equal(summary.ok,false);assert.equal(summary.error.message,'audio-product-evidence-incomplete');
});

for(const selected of [undefined,48000,96000])test(`wrapper forwards ${selected??'default 44100'} to the actual scenario probe and records rate`,async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),f=files(),sampleRate=selected??44100,runId='RateProbe'+sampleRate,source={sourceSha256:'same'};
  let probeRate=null;
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},evaluate:async(_fn,input)=>{
    if(input&&typeof input==='object'&&'sampleRate'in input){probeRate=input.sampleRate;throw Error('probe-boundary-sentinel');}throw Error('no-browser');
  }};
  await assert.rejects(()=>runProductAudio({runId,...(selected===undefined?{}:{sampleRate:selected})},{platform:'win32',files:f,attest:async()=>source,execute:async options=>{
    assert.equal(options.runId,runId);return options.dependencies.mediaScenario({context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async()=>{}},extensionId:'a'.repeat(32),artifactPath:path.join(process.cwd(),'output/playwright/installed-extension-'+runId)});
  }}),/observation-failed/);
  assert.equal(probeRate,sampleRate);
  const before=JSON.parse(f.saved.get(`output/audio-product-${runId}/before.json`)),after=JSON.parse(f.saved.get(`output/audio-product-${runId}/summary.json`));
  assert.equal(before.sampleRate,sampleRate);assert.equal(after.sampleRate,sampleRate);assert.equal(after.schema,'f01-product-observation-run-v1');
  if(sampleRate!==44100)assert.ok(!after.limits.includes('44.1kHz'));
});
