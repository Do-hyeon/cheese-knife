const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const id='44100/source-owner/off-stages';

test('off-stages caller selection stays one frozen 44100 case without component or Fs expansion',async()=>{
  const {selectProductCase,parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  const spec=selectProductCase(id);assert.equal(Object.isFrozen(spec),true);
  assert.deepEqual(spec,{id,sampleRate:44100,frequency:1000,inputDbfs:-24,pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:true,equalizer:false});
  assert.deepEqual(parseProductAudioArgs(['--run-id=OffStagesHost','--case='+id]),{runId:'OffStagesHost',caseId:id});
  for(const extra of ['--component-witness','--headroom-witness','--sample-rate=48000'])assert.throws(()=>parseProductAudioArgs(['--run-id=OffStagesHost','--case='+id,extra]));
  for(const other of ['48000/source-owner/off-stages','96000/source-owner/off-stages',id+'/extra'])assert.throws(()=>selectProductCase(other));
});

test('off-stages real dispatcher reaches only the explicit source-owner probe and retains its first failure',async()=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),saved=new Map(),module=Buffer.from('HOST module'),source={sourceSha256:'off-stage-dispatch-host'};
  const runId='OffStagesDispatchHost',directory='output/playwright/installed-extension-'+runId;
  const files={root:process.cwd(),ensureDirectory:async()=>{},lstat:async f=>saved.has(f)?{isFile:()=>true,size:saved.get(f).length}:null,
    readdir:async f=>[{name:f==='dist'?'web':'audio-transition-worklet.js',isDirectory:()=>f==='dist',isFile:()=>f==='dist/web',isSymbolicLink:()=>false}],
    readFile:async(f,encoding)=>{const b=f.endsWith('audio-transition-worklet.js')?module:f.startsWith('tests/')?Buffer.from('<html></html>'):saved.get(f);if(!b)throw Error('missing '+f);return encoding?b.toString():b;},
    writeFile:async(f,b,o)=>{assert.equal(o.flag,'wx');assert.ok(!saved.has(f));saved.set(f,Buffer.from(b));}};
  let selected=null;const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},
    evaluate:async(fn,input)=>{if(fn.name==='installSourceOwnerProbe'){selected=input;throw Error('off-stage-install-sentinel');}throw Error('after-first-failure');}};
  await assert.rejects(()=>runProductAudio({runId,caseId:id},{platform:'win32',files,attest:async()=>source,
    verifyCandidate:async()=>({root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']}),
    execute:async o=>{await o.dependencies.verifyCandidate(runId,process.cwd(),{retainEvidence:true});return o.dependencies.mediaScenario({context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async()=>{}},extensionId:'a'.repeat(32),artifactPath:path.join(process.cwd(),directory)});}}),/observation-failed/);
  assert.deepEqual(selected,{sampleRate:44100,profile:'off-stages'});
  assert.match(String(saved.get(directory+'/partial.json')),/off-stage-install-sentinel/);
});
