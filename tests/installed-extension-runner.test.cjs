const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { runInNewContext } = require('node:vm');

const runnerModule = () => import(pathToFileURL(path.resolve('scripts/check-installed-extension.mjs')));

for(const kind of ['frozen','NaN'])for(const summaryFails of [false,true])test('HOST response receipt reaches actual failure consumer '+kind+' before summary failures='+summaryFails,async t=>{
  const {runInstalledExtensionE2E}=await runnerModule(),{runProductAudio}=await import('../scripts/check-product-audio.mjs');
  const f=await firstHostRunnerFixture(await audioRunnerFixture(t)),files=f.files,write=files.writeFile,order=[];
  const first=kind==='frozen'?Object.freeze(Error('host-storage-FIRST')):NaN;
  files.readChunks=async function*(name){yield f.saved.get(name);};
  files.writeFile=async(name,...args)=>{if(name.endsWith('/summary.json')){order.push('summary');if(summaryFails)throw Error('summary-unavailable');}return write(name,...args);};
  f.dependencies.mediaScenario=async({firstHostShutdown:owner})=>{
    owner.hostStorage.beginScenario();owner.recordFirst(first);owner.hostStorage.captureFirst(first,{source:'original',value:null},true);
    await owner.rendererDone();throw first;
  };
  let thrown;
  try{await runProductAudio({runId:'Run1',caseId:'96000/reentry/2/10'},{platform:'win32',files,attest:f.dependencies.sourceAttestation,
    execute:options=>runInstalledExtensionE2E({...options,dependencies:{...options.dependencies,...f.dependencies,
      recordHostResponseStorage:receipt=>{order.push('receipt');options.dependencies.recordHostResponseStorage(receipt);},
      recordHostResponseThrow:options.dependencies.recordHostResponseThrow}})});}catch(error){thrown=error;}
  assert.deepEqual(JSON.parse(f.saved.get('output/audio-product-Run1/before.json')).source,f.source);
  assert.ok(thrown);assert.equal(thrown.message,'audio-product-observation-failed');
  assert.equal(thrown.hostResponseStorage.receipt.status,'CONFIRMED');assert.equal(thrown.hostResponseStorage.receipt.nativeSeal,'UNFORMED');
  assert.equal(thrown.hostResponseStorage.delivery,'CONSUMED');assert.ok(order.indexOf('receipt')<order.indexOf('summary'));
  assert.deepEqual(JSON.parse(f.saved.get('output/playwright/installed-extension-Run1/first-host-response.json')),{source:'original',value:null});
  assert.equal(f.closes(),1);assert.equal(Object.isFrozen(first),true);
  if(kind==='NaN'&&!summaryFails){assert.equal(thrown.error.message,'native-failed');assert.equal(thrown.error.secondaryErrors,undefined);}
});
for(const fault of ['late-consume','outgoing-alias'])test('HOST failure consumer rejects '+fault,async t=>{
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),{createHash}=require('node:crypto');
  const f=await firstHostRunnerFixture(await audioRunnerFixture(t)),files=f.files,first=Object.freeze(Error('source-FIRST'));
  let thrown;
  try{await runProductAudio({runId:'Run1',caseId:'96000/reentry/2/10'},{platform:'win32',files,attest:f.dependencies.sourceAttestation,execute:async options=>{
    const now=performance.now(),receipt={schema:'f01-host-response-storage-v1',nativeSeal:'UNFORMED',status:'CONFIRMED',reason:null,runId:'Run1',caseId:'96000/reentry/2/10',
      file:'output/playwright/installed-extension-Run1/first-host-response.json',firstAt:now,deadline:now+90000,bytes:5,sha256:createHash('sha256').update('null\n').digest('hex'),verifiedAt:now,chargedBytesAtDecision:5,limit:96*1024*1024};
    if(fault==='late-consume')t.mock.method(performance,'now',()=>receipt.deadline);
    try{options.dependencies.recordHostResponseStorage(receipt);}catch(error){assert.equal(fault,'late-consume');assert.match(error.message,/host-storage-receipt/);}
    options.dependencies.recordHostResponseThrow(first);
    if(fault==='outgoing-alias')throw Object.assign(Error('unrelated'),{cause:first});throw first;
  }});}catch(error){thrown=error;}
  assert.deepEqual(JSON.parse(f.saved.get('output/audio-product-Run1/before.json')).source,f.source);
  assert.ok(thrown);assert.equal(thrown.hostResponseStorage.delivery,fault==='late-consume'?'REJECTED-receipt':'REJECTED-outgoing');
});
async function audioRunnerFixture(t){
  const {audioGitFixture}=require('./f01-public-audio-contract.test.cjs');
  const {attestAudioSource,audioInputs}=await import('../scripts/audio-verification-contract.mjs');
  const repo=await audioGitFixture();
  t.after(repo.remove);
  const fixture=runnerFixture({root:repo.root}),files=await fixture.dependencies.openRepository();
  files.resolve=async name=>path.join(repo.root,name);
  files.readFile=async name=>{
    assert.ok(repo.data.has(name),name);
    return repo.files.readFile(name);
  };
  const source=await attestAudioSource(files,audioInputs,'clean');
  fixture.dependencies.sourceAttestation=async current=>{
    assert.equal(current,files);
    return source;
  };
  return {...fixture,files,source};
}

async function firstHostRunnerFixture(f=runnerFixture()){
  const files=await f.dependencies.openRepository(),saved=new Map();
  const sameChildExit=Promise.resolve(Object.freeze({kind:'exit',code:0,signal:null,at:performance.now()}));
  let closes=0;
  files.lstat=async name=>name.includes('installed-profile-')||name.startsWith('candidate/')?{isDirectory:()=>true}:null;
  files.writeFile=async(name,value)=>{saved.set(name,Buffer.from(value));};
  Object.assign(f.dependencies,{platform:'win32',sourceAttestation:f.dependencies.sourceAttestation??(async()=>({sourceSha256:'stable'})),
    verifyCandidate:async()=>({root:path.join(files.root,'candidate/Run1'),dist:path.join(files.root,'candidate/Run1/dist'),files:['dist/module.js']}),
    expectedMediaFiles:async()=>['dist/module.js'],refreshTransitionWorker:async launched=>launched,
    openMediaBrowserSession:async()=>({send(){},on(){},off(){}}),
    launchInstalledExtension:async()=>({context:f.context,worker:{},extensionId:'a'.repeat(32),sameChildExit}),
    closeInstalledMediaBrowser:async input=>{
      closes++;assert.equal(input.sameChildExit,sameChildExit);assert.ok(input.shutdownBy>performance.now());
      return {browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true,actualChildExit:await sameChildExit};
    }});
  return {...f,saved,closes:()=>closes};
}

test('selected first HOST source stays primary and renderer/finally share one close',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await firstHostRunnerFixture();
  const first=Error('first-host-source'),later=Error('later-catch');
  f.dependencies.mediaScenario=async({firstHostShutdown})=>{
    const record=firstHostShutdown.recordFirst(first);
    assert.equal(firstHostShutdown.recordFirst(later),record);
    const one=firstHostShutdown.rendererDone(),two=firstHostShutdown.rendererDone();assert.equal(one,two);
    await one;throw later;
  };
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'media-tab',retainEvidence:true,firstHostShutdownCase:'96000/reentry/2/10',dependencies:f.dependencies}),error=>error===first||error.cause===first);
  assert.equal(f.closes(),1);
  const report=JSON.parse(f.saved.get('output/playwright/installed-extension-Run1/summary.json'));
  assert.equal(report.error.native.message,'first-host-source');assert.equal(report.firstHostShutdown.authority,'source');
  assert.ok(report.firstHostShutdown.acceptedAt<report.firstHostShutdown.shutdownBy);
});

test('selected catch-only fallback cannot count as first HOST shared shutdown acceptance',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await firstHostRunnerFixture();
  f.dependencies.mediaScenario=async()=>{throw Error('unlocated-first');};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'media-tab',retainEvidence:true,firstHostShutdownCase:'96000/reentry/2/10',dependencies:f.dependencies}));
  assert.equal(f.closes(),1);
  const report=JSON.parse(f.saved.get('output/playwright/installed-extension-Run1/summary.json'));
  assert.equal(report.firstHostShutdown.authority,'catch-only');assert.equal(report.ok,false);
});

test('first HOST shutdown selection rejects other cases before opening a repository',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule();let opened=0;
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'media-tab',retainEvidence:true,firstHostShutdownCase:'44100/reentry/2/10',dependencies:{mediaScenario:async()=>{},openRepository:async()=>{opened++;throw Error('opened');}}}));
  assert.equal(opened,0);
});

for(const kind of ['primitive','frozen'])test('selected first HOST preserves recovery failure outside '+kind+' FIRST',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await firstHostRunnerFixture();
  const first=kind==='primitive'?undefined:Object.freeze(Error('frozen-first'));
  f.dependencies.mediaScenario=async({firstHostShutdown})=>{
    firstHostShutdown.recordFirst(first);
    firstHostShutdown.recordFailureState({responseAvailable:true,pending:[{name:'append',state:'RUNNING'}],snapshotError:null,observerError:null});
    firstHostShutdown.recordSecondary(Error('partial-save-unavailable'));
    await firstHostShutdown.rendererDone();throw first;
  };
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'media-tab',retainEvidence:true,firstHostShutdownCase:'96000/reentry/2/10',dependencies:f.dependencies}),error=>{
    assert.equal(error.code,'installed-e2e-incomplete');assert.equal(Object.hasOwn(error,'cause'),true);assert.equal(error.cause,first);return true;
  });
  const report=JSON.parse(f.saved.get('output/playwright/installed-extension-Run1/summary.json'));
  assert.ok(report.secondaryErrors.some(row=>row.message==='partial-save-unavailable'));
  assert.equal(report.firstHostShutdown.failureState.responseStored,'not-confirmed');
  assert.deepEqual(report.firstHostShutdown.failureState.pending,[{name:'append',state:'RUNNING'}]);
});

async function j1RunnerFixture(t,fault){
  const f=await audioRunnerFixture(t),{files}=f,root=files.root,runId='F01J1Native20261018R48',artifact=`output/playwright/installed-extension-${runId}`,saved=new Map();
  const candidateRoot=path.join(root,'output/tool-audit/p02-candidate-F01J1Native20261018/chrome-candidate');
  const readSourceFile=files.readFile,attest=f.dependencies.sourceAttestation;
  let launches=0,closes=0;
  Object.assign(files,{
    async lstat(name){return name.includes('installed-profile-')||name.includes('p02-candidate-')?{isDirectory:()=>true}:saved.has(name)?{isDirectory:()=>false,isFile:()=>true}:null;},
    ensureDirectory:async n=>path.join(root,n),resolve:async n=>path.join(root,n),
    makeTempDirectory:async()=>path.join(root,'output/playwright/installed-profile-j1-fake'),
    async writeFile(name,data,options){assert.equal(options.flag,'wx');assert.ok(!saved.has(name),name);if(fault==='before'&&name.endsWith('/before.json')||fault==='summary'&&name.endsWith('/summary.json')||fault==='status'&&name.endsWith('/evidence-status.json'))throw Error(fault+'-write-sentinel');saved.set(name,Buffer.from(data));},
    readFile:async n=>saved.has(n)?saved.get(n):readSourceFile(n),
    readdir:async n=>[...saved.keys()].filter(k=>k.startsWith(n+'/')).map(k=>({name:k.slice(n.length+1),isDirectory:()=>false,isFile:()=>true})),
  });
  f.context.tracing.start=async()=>{if(fault==='trace-start')throw Error('trace-start-sentinel');};
  f.context.tracing.stop=async options=>{if(fault==='trace-stop')throw Error('trace-stop-sentinel');assert.equal(options.path,path.join(root,artifact,'trace.zip'));await files.writeFile(artifact+'/trace.zip',Buffer.from('trace'),{flag:'wx'});if(fault==='trace-partial')throw Error('trace-partial-sentinel');};
  f.context.pages=()=>[];
  Object.assign(f.dependencies,{platform:'win32',
    sourceAttestation:async(current,required)=>{assert.ok(required.includes('tests/f01-j1-native-contract.test.cjs'));return attest(current);},
    verifyCandidate:async()=>({root:candidateRoot,dist:path.join(candidateRoot,'dist'),files:['dist/web/audio-transition-worklet.js']}),expectedMediaFiles:async()=>['dist/web/audio-transition-worklet.js'],
    refreshTransitionWorker:async launched=>launched,openMediaBrowserSession:async()=>({send(){},on(){},off(){}}),loadFixtureResponses:async()=>[],
    launchInstalledExtension:async()=>{launches++;assert.ok(saved.has(artifact+'/before.json'));if(fault==='launch')throw Error('launch-sentinel');return {context:f.context,worker:{},extensionId:'a'.repeat(32)};},
    mediaScenario:async()=>{
      if(fault==='scenario')throw Error('scenario-sentinel');
      for(const name of ['cold.json','playback.json','clock-0.json','clock-1.json','request-timing.json','capture.json','stream-0.f32le','stream-1.f32le','stream-2.f32le','assessment.json','module.json','module-resource.fetched.js'])await files.writeFile(artifact+'/'+name,Buffer.from('{}'),{flag:'wx'});
      return {audioJ1:{schema:'f01-j1-native-v1',scope:'48k-original250-D0-only',trajectory:'j1-unity-v1',passed:true}};
    },
    closeInstalledMediaBrowser:async()=>{closes++;if(fault==='close')throw Error('close-sentinel');return {browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true};},
  });
  return {dependencies:f.dependencies,source:f.source,runId,artifact,saved,launches:()=>launches,closes:()=>closes};
}
test('J1 qualification reserves its exact child and dependencies before opening any repository',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule();let opened=0;
  for(const options of [{runId:'F01J1Native20261018R48'},{runId:'F01J1Native20261018',qualification:'media-tab'},
    {runId:'Other',qualification:'audio-j1',retainEvidence:true},{runId:'F01J1Native20261018R48',qualification:'audio-j1',retainEvidence:true}])
    await assert.rejects(()=>runInstalledExtensionE2E({...options,dependencies:{openRepository:async()=>{opened++;throw Error('opened');}}}),error=>error.message!=='opened');
  assert.equal(opened,0);
});
test('J1 runner saves exact prelaunch ownership and successful trace before final evidence and never restarts',async t=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await j1RunnerFixture(t);
  const report=await runInstalledExtensionE2E({runId:f.runId,qualification:'audio-j1',retainEvidence:true,dependencies:f.dependencies});
  assert.equal(report.ok,true);assert.equal(f.launches(),1);assert.equal(f.closes(),1);
  const before=JSON.parse(f.saved.get(f.artifact+'/before.json')),status=JSON.parse(f.saved.get(f.artifact+'/evidence-status.json'));
  assert.ok(before.profilePath.endsWith('installed-profile-j1-fake'));assert.deepEqual(before.source,f.source);assert.equal(status.artifacts['trace.zip'].status,'written');assert.equal(status.artifacts['capture.json'].status,'written');
});
for(const fault of ['before','launch','trace-start','scenario','trace-stop','trace-partial','close','summary','status'])test('J1 '+fault+' failure keeps formed evidence and cannot become successful cleanup',async t=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await j1RunnerFixture(t,fault);
  await assert.rejects(()=>runInstalledExtensionE2E({runId:f.runId,qualification:'audio-j1',retainEvidence:true,dependencies:f.dependencies}));
  assert.equal(f.launches(),fault==='before'?0:1);assert.equal(f.closes(),['before','launch'].includes(fault)?0:1);
  const raw=f.saved.get(f.artifact+'/evidence-status.json');if(fault!=='status'){
    assert.ok(raw);const status=JSON.parse(raw);if(['before','launch','trace-start','scenario'].includes(fault))assert.equal(status.artifacts['capture.json'].status,'unavailable');
    if(fault==='trace-stop'||fault==='trace-partial')assert.equal(status.artifacts['trace.zip'].status,'write-failed');
    if(fault==='before')assert.equal(status.artifacts['before.json'].status,'write-failed');
  }
});

for(const scenarioFails of [false,true])test('J1 preserves bounded close and failed exact-child retirement details with prior scenario failure '+scenarioFails,async t=>{
  const {runInstalledExtensionE2E}=await runnerModule(),{l1OwnedCloser}=await import('../scripts/extension-e2e/audio-l1.mjs');
  const f=await j1RunnerFixture(t,scenarioFails?'scenario':undefined);let aborts=0,thrown;
  f.dependencies.closeInstalledMediaBrowser=l1OwnedCloser(async()=>{throw Object.assign(Error('close-sentinel'),{
    closeDiagnostic:{stage:'owned-root',browserDisconnected:false,secret:'omit'},secret:'omit'});},async()=>{aborts++;throw Error('owned-abort-sentinel'+'.'.repeat(5000));});
  try{await runInstalledExtensionE2E({runId:f.runId,qualification:'audio-j1',retainEvidence:true,dependencies:f.dependencies});assert.fail('must fail');}catch(error){thrown=error;}
  const summary=JSON.parse(f.saved.get(f.artifact+'/summary.json')),detail=scenarioFails?summary.secondaryErrors.find(row=>row.message==='close-sentinel').native:summary.error.native;
  assert.equal(summary.ok,false);assert.equal(aborts,1);assert.equal(detail.forcedRetirement,false);
  assert.ok(detail.retireError.startsWith('Error: owned-abort-sentinel'));assert.equal(detail.retireError.length,4096);
  assert.equal(detail.closeDiagnostic.browserDisconnected,false);assert.equal(detail.closeDiagnostic.secret,undefined);assert.equal(detail.secret,undefined);
  if(scenarioFails){assert.equal(thrown.cause.message,'scenario-sentinel');assert.deepEqual(thrown.secondaryErrors.find(row=>row.message==='close-sentinel').native,detail);}
});

for(const stage of ['start','stop'])test('L1 hung trace '+stage+' reaches failed owned close and exact abort without a second launch',async t=>{
  const {runInstalledExtensionE2E}=await runnerModule(),{l1OwnedCloser}=await import('../scripts/extension-e2e/audio-l1.mjs');
  const f=await audioRunnerFixture(t),{files}=f;
  const runId='F01L1Clock20261018R48',timeout='audio-operation-timeout:l1-installed-trace-'+stage;
  let launches=0,closers=0,aborts=0,summary;
  const write=files.writeFile;
  files.writeFile=async(name,data,...args)=>{
    const result=await write(name,data,...args);
    if(name===`output/playwright/installed-extension-${runId}/summary.json`)summary=JSON.parse(data);
    return result;
  };
  const candidateRoot=path.join(files.root,'output/tool-audit/p02-candidate-F01L1Clock20261018/chrome-candidate');
  f.dependencies.verifyCandidate=async()=>({root:candidateRoot,dist:path.join(candidateRoot,'dist'),files:['dist/module.js']});
  f.dependencies.expectedMediaFiles=async()=>['dist/module.js'];f.dependencies.platform='win32';
  f.dependencies.refreshTransitionWorker=async launched=>launched;
  f.dependencies.openMediaBrowserSession=async()=>({send(){},on(){},off(){}});
  f.dependencies.launchInstalledExtension=async()=>{launches++;return {context:f.context,worker:{},extensionId:'a'.repeat(32)};};
  f.dependencies.mediaScenario=async()=>({audioL1:{passed:true}});
  f.dependencies.closeInstalledMediaBrowser=l1OwnedCloser(async()=>{closers++;throw Error('close-proof-failed');},async()=>{aborts++;});
  f.context.tracing[stage]=()=>new Promise(()=>{});
  files.lstat=async name=>name.includes('installed-profile-')||name.includes('p02-candidate-')?{isDirectory:()=>true}:null;
  const timer=global.setTimeout;global.setTimeout=(fn,delay,...args)=>timer(fn,delay===30000?5:delay,...args);
  let guard;
  try{await assert.rejects(()=>Promise.race([runInstalledExtensionE2E({runId,qualification:'audio-l1',retainEvidence:true,dependencies:f.dependencies}),
    new Promise((_,reject)=>{guard=timer(()=>reject(Error('test-runner-hung')),100);})]),
    error=>error.code==='installed-e2e-incomplete'&&error.cause?.message===timeout);}
  finally{global.setTimeout=timer;clearTimeout(guard);}
  assert.equal(summary.error.native.message,timeout);
  assert.deepEqual(summary.source,f.source);
  assert.deepEqual(summary.after,f.source);
  assert.equal(launches,1);assert.equal(closers,1);assert.equal(aborts,1);
});

test('installed runner summary preserves original native preparation details through a wrapped launch failure',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=runnerFixture(),files=await f.dependencies.openRepository();let summary;
  const original=Object.assign(Error('browser-unavailable'),{code:'browser-unavailable',cause:Object.assign(Error('sdk failed'),{
    code:5,signal:null,killed:false,stderr:'denied',secret:'omit',preparationDiagnostic:{stage:'manifest-tool',elapsedMs:17}})});
  f.dependencies.launchInstalledExtension=async()=>{throw original;};
  const write=files.writeFile;files.writeFile=async(relative,data)=>{if(relative.endsWith('/summary.json'))summary=JSON.parse(data);return write(relative,data);};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',headed:false,dependencies:f.dependencies}),error=>error===original);
  assert.ok(summary.error.native,'summary must include the native failure chain');
  assert.equal(summary.error.native.cause.code,5);assert.equal(summary.error.native.cause.stderr,'denied');
  assert.equal(summary.error.native.cause.preparationDiagnostic.stage,'manifest-tool');assert.equal(summary.error.native.cause.secret,undefined);
});

function runnerFixture({ failAt, artifactExists = false, root = path.resolve('.') } = {}) {
  const events = [];
  const profilePath = path.join(root, 'output', 'playwright', 'installed-profile-fixture');
  const artifactPath = path.join(root, 'output', 'playwright', 'installed-extension-Run1');
  const context = {
    tracing: {
      async start() { events.push('trace-start'); if (failAt === 'tracing') throw Object.assign(new Error('trace-start-failed'), { code: 'trace-start-failed' }); },
      async stop() { events.push('trace-stop'); if (failAt === 'trace-stop') throw Object.assign(new Error('trace-stop-failed'), { code: 'trace-stop-failed' }); },
    },
    pages() { return [{ screenshot: async () => { events.push('screenshot'); } }]; },
    async close() { events.push('context-close'); },
  };
  const files = {
    root,
    async lstat() { return artifactExists ? { isDirectory: () => true } : null; },
    async ensureDirectory(relative) { events.push(`ensure:${relative}`); return path.join(root, ...relative.split('/')); },
    async makeTempDirectory() { events.push('profile-create'); return profilePath; },
    async resolve(relative) { return relative.includes('installed-extension-') ? artifactPath : path.join(root, ...relative.split('/')); },
    async removeTree(relative) { events.push(relative.includes('installed-profile-') ? 'profile-remove' : `remove:${relative}`); return true; },
    async writeFile(relative) {
      events.push('json-write');
      if (failAt === 'json') throw Object.assign(new Error('json-write-failed'), { code: 'json-write-failed' });
      return path.join(root, ...relative.split('/'));
    },
  };
  const dependencies = {
    openRepository: async () => files,
    verifyCandidate: async id => { events.push('candidate-build'); return { dist: path.join(root, 'candidate', id, 'dist') }; },
    checkPackage: async () => { events.push('candidate-check'); },
    loadFixtureResponses: async () => { events.push('fixture-load'); return []; },
    launchInstalledExtension: async () => { events.push('browser-launch'); return { context, worker: {}, extensionId: 'a'.repeat(32) }; },
    chromiumApi: {},
    scenario: async () => {
      events.push('scenarios');
      if (failAt === 'scenario') throw Object.assign(new Error('scenario-failed'), { code: 'scenario-failed' });
      return { worker: { passed: true } };
    },
    removeCandidate: async () => { events.push('candidate-remove'); return true; },
  };
  return { events, dependencies, context };
}

test('tone silence runner hands off only a saved report whose first failure was close after completed trace and abort',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule();
  for(const fault of ['close','abort','trace-stop','scenario','summary','late-page-error']){
    const f=runnerFixture({failAt:fault}),files=await f.dependencies.openRepository(),saved=new Map();
    const close=Object.assign(Error('close-original'),{forcedRetirement:fault!=='abort'});
    const audioProduct={schema:'f01-product-normalizer-control-observation-v1',scope:'44100/normalizer-control/tone-silence',passed:true};
    let handedOff=0;
    files.lstat=async name=>name.includes('installed-profile-')||name.startsWith('candidate/')?{isDirectory:()=>true}:null;
    files.writeFile=async(name,value)=>{if(fault==='summary'&&name.endsWith('/summary.json'))throw Error('summary-original');saved.set(name,Buffer.from(value));};
    Object.assign(f.dependencies,{platform:'win32',sourceAttestation:async()=>({sourceSha256:'stable'}),
      verifyCandidate:async()=>({root:path.join(files.root,'candidate/Run1'),dist:path.join(files.root,'candidate/Run1/dist'),files:['dist/module.js']}),
      expectedMediaFiles:async()=>['dist/module.js'],refreshTransitionWorker:async l=>l,openMediaBrowserSession:async()=>({send(){},on(){},off(){}}),
      mediaScenario:async()=>{if(fault==='scenario')throw Error('scenario-original');return {audioProduct,pageErrors:[]};},
      closeInstalledMediaBrowser:async()=>{throw close;},
      recordToneSilenceCloseFailure:(error,report)=>{
        handedOff++;assert.equal(error,close);assert.equal(report.ok,false);assert.equal(report.shutdown,null);
        assert.equal(report.audioProduct,audioProduct);
        assert.deepEqual(JSON.parse(saved.get('output/playwright/installed-extension-Run1/summary.json')),report);
      }});
    if(fault==='late-page-error'){
      const scenario=f.dependencies.mediaScenario;
      f.dependencies.mediaScenario=async()=>{const report=await scenario();f.context.tracing.stop=async()=>{report.pageErrors.push('late page error');};return report;};
    }
    await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'media-tab',retainEvidence:true,dependencies:f.dependencies}),
      error=>{if(fault==='close')assert.equal(error,close);return true;});
    assert.equal(handedOff,fault==='close'?1:0,fault);
  }
});

for(const failAt of [undefined,'scenario','tracing','trace-stop','json'])test(`base retention preserves created evidence after ${failAt||'success'} and still closes`,async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=runnerFixture({failAt}),files=await f.dependencies.openRepository();
  const candidateRoot=path.resolve('output/tool-audit/p02-candidate-Run1/chrome-candidate');
  f.dependencies.verifyCandidate=async(_id,_directory,options)=>{assert.equal(options.retainEvidence,true);return {root:candidateRoot,dist:path.join(candidateRoot,'dist')};};
  files.lstat=async name=>name.includes('installed-profile-')||name.includes('p02-candidate-')?{isDirectory:()=>true}:null;
  let report;const write=files.writeFile;files.writeFile=async(name,data,...args)=>{if(name.endsWith('summary.json'))report=JSON.parse(data);return write(name,data,...args);};
  const pending=runInstalledExtensionE2E({runId:'Run1',retainEvidence:true,dependencies:f.dependencies});
  if(failAt)await assert.rejects(pending);else await pending;
  assert.ok(f.events.includes('context-close'));assert.equal(f.events.includes('profile-remove'),false);assert.equal(f.events.includes('candidate-remove'),false);
  assert.equal(report.evidence.retained,true);assert.equal(report.evidence.candidatePath,candidateRoot);
});

test('invalid base retention fails before repository or candidate access',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule();
  await assert.rejects(runInstalledExtensionE2E({runId:'Run1',retainEvidence:'yes',dependencies:{openRepository:async()=>{throw Error('must-not-open');}}}),{code:'installed-e2e-retention-invalid'});
});

test('a first retention failure never writes an ok report',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=runnerFixture(),files=await f.dependencies.openRepository();let summary;
  files.lstat=async name=>name.startsWith('candidate/')?{isDirectory:()=>true}:null;
  const write=files.writeFile;files.writeFile=async(name,bytes,...args)=>{summary=JSON.parse(bytes);return write(name,bytes,...args);};
  await assert.rejects(runInstalledExtensionE2E({runId:'Run1',retainEvidence:true,dependencies:f.dependencies}),{code:'installed-e2e-evidence-missing'});
  assert.equal(summary.ok,false);assert.equal(summary.error.code,'installed-e2e-evidence-missing');
});

for(const retainEvidence of [false,true])for(const fault of ['close','json','evidence'])test(`negative admission rejects MAIN missing plus ${fault} with retention=${retainEvidence}`,async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),{runInstalledExtensionNegative}=await import('../scripts/check-installed-extension-negative.mjs'),f=runnerFixture(),files=await f.dependencies.openRepository();
  const primary=Object.assign(Error('main-runtime-missing'),{code:'main-runtime-missing'}),secondary=Error(fault+'-sentinel');
  f.dependencies.scenario=async()=>{throw primary;};
  if(fault==='close')f.context.close=async()=>{throw secondary;};
  if(fault==='json')files.writeFile=async()=>{throw secondary;};
  files.lstat=async name=>{
    if(fault==='evidence'&&retainEvidence&&name.includes('installed-profile-'))throw secondary;
    return name.includes('installed-profile-')||name.includes('p02-candidate-')?{isDirectory:()=>true}:null;
  };
  if(fault==='evidence'&&!retainEvidence)files.removeTree=async()=>{throw secondary;};
  const candidateRoot=path.resolve('output/tool-audit/p02-candidate-Run1/chrome-candidate');
  await assert.rejects(runInstalledExtensionNegative({runId:'Run1',retainEvidence,dependencies:{
    prepareCandidate:async(_id,options)=>{assert.equal(options.retainEvidence,retainEvidence);return {candidate:{root:candidateRoot,dist:path.join(candidateRoot,'dist')},cleanup:async()=>{}};},
    runInstalled:options=>runInstalledExtensionE2E({...options,dependencies:{...f.dependencies,...options.dependencies,scenario:f.dependencies.scenario}}),
    writeReport:async()=>{throw Error('must-not-report-success');},
  }}),error=>{assert.equal(error.code,'negative-control-unexpected-failure');assert.equal(error.cause.code,'installed-e2e-incomplete');assert.equal(error.cause.cause,primary);assert.ok(error.cause.secondaryErrors.length>0);return true;});
});

test('installed E2E runner orders isolated candidate, browser and cleanup lifecycle', async () => {
  const { runInstalledExtensionE2E } = await runnerModule();
  const fixture = runnerFixture();
  const report = await runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies });
  assert.equal(report.ok, true);
  const milestones = ['candidate-build', 'profile-create', 'browser-launch', 'scenarios', 'context-close', 'profile-remove', 'candidate-remove'];
  assert.deepEqual(fixture.events.filter(event => milestones.includes(event)), milestones);
  assert.ok(fixture.events.indexOf('candidate-check') > fixture.events.indexOf('candidate-build'));
  assert.ok(fixture.events.indexOf('fixture-load') < fixture.events.indexOf('browser-launch'));
  assert.ok(fixture.events.indexOf('json-write') > fixture.events.indexOf('candidate-remove'));
});

test('installed E2E runner cleans profile and candidate after scenario, tracing and JSON failures', async () => {
  const { runInstalledExtensionE2E } = await runnerModule();
  for (const failAt of ['scenario', 'tracing', 'trace-stop', 'json']) {
    const fixture = runnerFixture({ failAt });
    await assert.rejects(runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies }), error => {
      if (failAt === 'trace-stop') {
        assert.equal(error.code,'installed-e2e-incomplete');assert.equal(error.cause.code,'trace-stop-failed');assert.equal(error.secondaryErrors[0].code,'trace-stop-failed');
      } else assert.equal(error.code, failAt === 'scenario' ? 'scenario-failed' : failAt === 'tracing' ? 'trace-start-failed' : 'json-write-failed');
      return true;
    });
    assert.equal(fixture.events.filter(event => event === 'context-close').length, 1, failAt);
    assert.equal(fixture.events.filter(event => event === 'profile-remove').length, 1, failAt);
    assert.equal(fixture.events.filter(event => event === 'candidate-remove').length, 1, failAt);
  }
});

test('installed E2E runner never overwrites an existing artifact directory', async () => {
  const { runInstalledExtensionE2E } = await runnerModule();
  const fixture = runnerFixture({ artifactExists: true });
  await assert.rejects(runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies }), {
    code: 'installed-artifact-exists',
  });
  assert.equal(fixture.events.includes('json-write'), false);
  assert.equal(fixture.events.includes('candidate-remove'), true);
  assert.equal(fixture.events.includes('profile-create'), false);
});
for(const qualification of ['media-tab','player-gain','audio-settings']) for(const mode of ['ok','scenario','close-proof','missing-proof','missing-session','unsupported','dirty-source','changed-source','extra-asset','missing-asset'])test(qualification+' runner owns shutdown and preserves failed candidates: '+mode,async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=qualification==='audio-settings'?await audioObservationRunnerFixture():runnerFixture();
  f.dependencies.platform=mode==='unsupported'?'linux':'win32';
  const buildCandidate=f.dependencies.verifyCandidate;f.dependencies.verifyCandidate=async id=>({...await buildCandidate(id),
    files:mode==='extra-asset'?['dist/media-profiles.js','dist/extra.js']:mode==='missing-asset'?[]:['dist/media-profiles.js']});
  f.dependencies.expectedMediaFiles=async()=>['dist/media-profiles.js'];
  if(qualification==='audio-settings'){f.candidateFiles.clear();f.candidateFiles.set('media-profiles.js',Buffer.from('packaged profiles'));}
  let attestations=0;f.dependencies.sourceAttestation=async(_files,required)=>{f.events.push('source-attest');attestations++;
    if(qualification==='audio-settings')assert.ok(required.includes('scripts/check-installed-audio-settings.mjs'));else assert.deepEqual(required,[]);
    if(mode==='dirty-source')throw Object.assign(Error('dirty'),{code:'transition-source-dirty'});
    return {sourceCommit:'a'.repeat(40),sourceSha256:mode==='changed-source'&&attestations>1?'c'.repeat(64):'b'.repeat(64)};};
  f.dependencies.refreshTransitionWorker=async value=>{f.events.push('worker-refresh');return value;};
  f.dependencies.openMediaBrowserSession=async()=>{f.events.push('session-open');return mode==='missing-session'?null:{send:async()=>({}),on(){},off(){}};};
  f.dependencies.mediaScenario=async args=>{
    f.events.push('media-scenario');if(mode==='scenario')throw Object.assign(Error('scenario'),{code:'media-scenario-failed'});
    if(qualification==='audio-settings'){const counts={pointer:1,key:1,input:1,synthetic:0,total:3,overflow:false};args.observation.input(f.pages[0],'settings',counts);args.observation.input(f.pages[1],'other',counts);f.pages[1].close();}
    if(qualification==='audio-settings'&&mode==='ok'){
      assert.equal(typeof args.writeZoomCapture,'function');const before=f.events.filter(event=>event==='json-write').length;
      for(const [name,bytes]of [['../outside.png',new Uint8Array(24)],['audio-zoom200.png',new Uint8Array(24)],
        ['audio-zoom200.png',new Uint8Array(8388609)]])await assert.rejects(args.writeZoomCapture(name,bytes),{code:'media-zoom-capture-invalid'});
      assert.equal(f.events.filter(event=>event==='json-write').length,before);
      const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);
      await args.writeZoomCapture('audio-zoom200-controls.png',png);assert.equal(f.events.filter(event=>event==='json-write').length,before+1);
    }
    return {mediaTab:{passed:true}};
  };
  f.dependencies.closeInstalledMediaBrowser=async()=>{f.events.push('close-proof');if(mode==='close-proof')throw Object.assign(Error('close'),{code:'media-close-failed'});
    return {browserCloseAcknowledged:true,browserDisconnected:mode!=='missing-proof',ownedRootClosed:true};};
  const pending=runInstalledExtensionE2E({runId:'Run1',qualification,dependencies:f.dependencies});
  if(mode==='ok'){
    const report=await pending;assert.equal(report.ok,true);assert.equal(report.mediaTab.passed,true);
    assert.ok(f.events.indexOf('close-proof')<f.events.indexOf('context-close'));assert.equal(report.profileRetained,true);assert.equal(f.events.includes('profile-remove'),false);
  }else{const expected={scenario:'media-scenario-failed','close-proof':'media-close-failed','missing-proof':'media-close-unconfirmed','missing-session':'media-browser-session-unavailable',unsupported:'media-qualification-platform-unsupported','dirty-source':'transition-source-dirty','changed-source':'media-source-changed','extra-asset':'media-candidate-assets-invalid','missing-asset':'media-candidate-assets-invalid'}[mode];await assert.rejects(pending,e=>e.code===expected||e.code==='installed-e2e-incomplete'&&e.cause?.code===expected);assert.equal(f.events.includes('profile-remove'),false);assert.equal(f.events.includes('candidate-remove'),false);}
  assert.equal(f.events.includes('media-scenario'),['ok','scenario','close-proof','missing-proof','changed-source'].includes(mode));
  assert.equal(f.events.includes('scenarios'),false);
  if(mode==='dirty-source')assert.equal(f.events.includes('browser-launch'),false);
});

function multiWindowFixture(url, fault) {
  const events = [];
  const popupReached = Error('popup reached after fixture ownership');
  const firstTab = { id: 11, windowId: 21, url };
  const secondTab = { id: 12, windowId: 22 };
  const extraTab = { id: 13, windowId: secondTab.windowId, url };
  let popupClosed = false, created = false, navigated = false, pageReads = 0, tabReads = 0;
  const fixtureWait = async (target, predicate, argument, options) => {
    assert.equal(navigated, true);
    assert.equal(options.timeout, 15000);
    const window = { [Symbol.for('cheese-knife.runtime.v1')]: { configReady: true }, __knifeFixture: { loads: 1 } };
    assert.equal(runInNewContext('(' + predicate.toString() + ')()', { window }), true);
    events.push(target + (predicate.toString().includes('configReady') ? ':ready' : ':loads'));
  };
  const firstPage = { url: () => url, isClosed: () => false, waitForFunction: (...args) => fixtureWait('first', ...args) };
  const secondPage = {
    url: () => navigated ? url : 'about:blank',
    isClosed: () => false,
    waitForFunction: (...args) => fixtureWait('second', ...args),
    async goto(target, options) {
      assert.equal(target, url);
      assert.deepEqual(options, { waitUntil: 'domcontentloaded' });
      events.push('goto-second');
      navigated = true;
      secondTab.url = url;
    },
  };
  const otherPage = { ...firstPage };
  const popup = { async close() { popupClosed = true; events.push('close-popup'); } };
  const context = {
    pages() {
      if (!popupClosed) return [firstPage, popup];
      if (!created) return [fault === 'wrong-first-page' ? otherPage : firstPage];
      if (fault === 'multiple-pages') return [firstPage, secondPage, otherPage];
      if (++pageReads === 1) { events.push('second-page-pending'); return [firstPage]; }
      if (fault === 'replaced-page' && pageReads > 2) return [firstPage, otherPage];
      return [firstPage, secondPage];
    },
    async newPage() { events.push('next-popup'); throw popupReached; },
  };
  const chrome = {
    tabs: {
      async query({ windowId }) {
        if (windowId !== undefined) {
          assert.equal(windowId, secondTab.windowId);
          events.push('tabs-in-new-window');
          return [secondTab];
        }
        if (!created) { events.push('original-tab'); return [firstTab]; }
        tabReads++;
        if (navigated) events.push('tabs-after-goto');
        else events.push('tabs-before-goto');
        if (fault === 'extra-tab' || fault === 'late-extra-tab' && tabReads === 2) return [firstTab, secondTab, extraTab];
        if (fault === 'wrong-window') return [firstTab, { ...secondTab, windowId: firstTab.windowId }];
        if (fault === 'replaced-tab' && navigated) return [firstTab, extraTab];
        return [firstTab, secondTab];
      },
      async get(id) {
        events.push('get-tab:' + id);
        const tab = [firstTab, secondTab].find(candidate => candidate.id === id);
        return fault === 'changed-tab-url' && id === secondTab.id ? { ...tab, url: 'about:blank' } : tab;
      },
    },
    windows: {
      async create(options) {
        assert.equal(options.url, 'about:blank');
        assert.equal(options.focused, false);
        created = true;
        events.push('create-neutral-window');
        if (fault === 'omitted-created-tabs') return { id: secondTab.windowId };
        const tabs = fault === 'empty-created-tabs' ? [] : [secondTab];
        if (fault === 'multiple-created-tabs') tabs.push(extraTab);
        return { id: secondTab.windowId, tabs };
      },
    },
  };
  const worker = { evaluate: (fn, arg) => runInNewContext('(' + fn.toString() + ')(arg)', { chrome, arg }) };
  return { args: { context, worker, page: firstPage, popup }, events, popupReached };
}

for (const fault of [undefined, 'empty-created-tabs', 'omitted-created-tabs']) {
  test('multi-window checks both owned tabs before opening popups' + (fault ? ' with ' + fault : ''), async () => {
    const { runMultiWindowScenario } = await runnerModule();
    const { FIXTURE_LIVE_URL } = await import('../scripts/extension-e2e/fixture-router.mjs');
    const { args, events, popupReached } = multiWindowFixture(FIXTURE_LIVE_URL, fault);
    await assert.rejects(runMultiWindowScenario(args), error => error === popupReached);
    assert.deepEqual(events, ['close-popup', 'original-tab', 'create-neutral-window',
      ...(fault ? ['tabs-in-new-window'] : []), 'tabs-before-goto', 'second-page-pending', 'tabs-before-goto', 'goto-second',
      'second:ready', 'first:ready', 'first:loads', 'second:loads', 'tabs-after-goto', 'get-tab:11', 'get-tab:12', 'next-popup']);
  });
}

for (const [fault, code, navigated] of [
  ['wrong-first-page', 'first-page-missing', false],
  ['multiple-created-tabs', 'second-target-missing', false],
  ['multiple-pages', 'multi-window-page-ownership', false],
  ['replaced-page', 'multi-window-page-ownership', false],
  ['extra-tab', 'multi-window-tab-ownership', false],
  ['late-extra-tab', 'multi-window-tab-ownership', false],
  ['wrong-window', 'multi-window-tab-ownership', false],
  ['replaced-tab', 'multi-window-tab-ownership', true],
  ['changed-tab-url', 'multi-window-tab-ownership', true],
]) {
  test('multi-window rejects ' + fault + ' before opening popups', async () => {
    const { runMultiWindowScenario } = await runnerModule();
    const { FIXTURE_LIVE_URL } = await import('../scripts/extension-e2e/fixture-router.mjs');
    const { args, events } = multiWindowFixture(FIXTURE_LIVE_URL, fault);
    await assert.rejects(runMultiWindowScenario(args), { code });
    assert.equal(events.includes('goto-second'), navigated);
    assert.equal(events.includes('next-popup'), false);
  });
}

test('multi-window scenario starts only after the base handshake state is captured', async () => {
  const { runInstalledScenarioSequence } = await runnerModule();
  const order = [];
  const result = await runInstalledScenarioSequence({ marker: 'input' }, {
    async base(args) {
      order.push('base');
      assert.equal(args.marker, 'input');
      args.captureState({ context: {}, worker: {}, handshake: 'ready' });
      return { popup: { passed: true } };
    },
    async multiWindow(args) {
      order.push('multi-window');
      assert.equal(args.handshake, 'ready');
      args.captureState({ lifecycleReady: true });
      return { multiWindow: { passed: true } };
    },
    async lifecycle(args) {
      order.push('lifecycle');
      assert.equal(args.lifecycleReady, true);
      return { workerWake: { passed: true } };
    },
  });
  assert.deepEqual(order, ['base', 'multi-window', 'lifecycle']);
  assert.deepEqual(result, { popup: { passed: true }, multiWindow: { passed: true }, workerWake: { passed: true } });
});

test('multi-window scenario failure keeps runner cleanup guarantees', async () => {
  const { runInstalledExtensionE2E, runInstalledScenarioSequence } = await runnerModule();
  const fixture = runnerFixture();
  fixture.dependencies.scenario = args => runInstalledScenarioSequence(args, {
    async base(baseArgs) { baseArgs.captureState({ context: {}, worker: {}, handshake: 'ready' }); return { popup: { passed: true } }; },
    async multiWindow() { throw Object.assign(new Error('multi-window-failed'), { code: 'multi-window-failed' }); },
    async lifecycle() { throw new Error('must-not-run'); },
  });
  await assert.rejects(runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies }), {
    code: 'multi-window-failed',
  });
  assert.equal(fixture.events.includes('context-close'), true);
  assert.equal(fixture.events.includes('profile-remove'), true);
  assert.equal(fixture.events.includes('candidate-remove'), true);
});

for(const closeFails of [false,true])test('audio settings loss-control failures reach the actual outer summary with close failure '+closeFails,async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),{lossControls}=await import('../scripts/check-installed-audio-settings.mjs'),f=await audioObservationRunnerFixture(),files=await f.dependencies.openRepository();let summary,closes=0,mutations=0,restores=0;
  const primary=Object.freeze(Object.assign(Error('storage-loss-primary'),{code:'LOSS_PRIMARY',secret:'primary-secret'})),restoration=Object.freeze(Object.assign(Error('storage-restore-failed'),{code:'RESTORE_FAILED',secret:'restore-secret'}));
  const worker={evaluate:async(_fn,arg)=>{if(typeof arg==='string'){mutations++;throw primary;}if(arg!==undefined){restores++;throw restoration;}return {config:{audioGain:0,gainInherited:false,eq125:1.25}};}};
  f.dependencies.platform='win32';f.dependencies.sourceAttestation=async()=>({sourceSha256:'unchanged'});f.dependencies.expectedMediaFiles=async()=>['dist/module.js'];
  f.dependencies.verifyCandidate=async()=>({root:path.resolve('candidate/Run1'),dist:path.resolve('candidate/Run1/dist'),files:['dist/module.js']});
  f.dependencies.refreshTransitionWorker=async launched=>launched;f.dependencies.openMediaBrowserSession=async()=>({send(){},on(){},off(){}});
  f.dependencies.closeInstalledMediaBrowser=async()=>{closes++;if(closeFails)throw Error('additional-close-failed');for(const p of f.pages)p.close();return {browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true};};
  f.dependencies.mediaScenario=async()=>lossControls({worker});
  const write=files.writeFile;files.writeFile=async(name,data,...args)=>{if(name.endsWith('/summary.json'))summary=JSON.parse(data);return write(name,data,...args);};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),e=>{const failure=closeFails?e.cause:e;return failure.code==='audio-settings-loss-control-failed'&&failure.cause===primary&&failure.restorationError===restoration&&(!closeFails||e.secondaryErrors.some(r=>r.message==='additional-close-failed'));});
  assert.equal(summary.ok,false);assert.equal(summary.error.code,'audio-settings-loss-control-failed');assert.equal(summary.error.native.cause.code,'LOSS_PRIMARY');assert.equal(summary.error.native.restorationError.code,'RESTORE_FAILED');assert.equal(JSON.stringify(summary).includes('secret'),false);if(closeFails){assert.equal(summary.shutdown,null);assert.ok(summary.secondaryErrors.some(r=>r.message==='additional-close-failed'));}else assert.equal(summary.shutdown.ownedRootClosed,true);assert.equal(closes,1);assert.equal(mutations,1);assert.equal(restores,1);
});

async function audioObservationRunnerFixture(){
  const {EventEmitter}=require('node:events'),{createAudioSettingsObservation}=await import('../scripts/check-installed-audio-settings.mjs'),f=runnerFixture(),files=await f.dependencies.openRepository(),context=new EventEmitter(),pages=[new EventEmitter(),new EventEmitter()];let summary;
  for(const page of pages){page.closed=false;page.isClosed=()=>page.closed;page.screenshot=async()=>{};page.close=()=>{if(!page.closed){page.closed=true;page.emit('close');}};}
  context.pages=()=>pages.filter(p=>!p.closed);context.tracing=f.context.tracing;context.close=async()=>{f.events.push('context-close');for(const p of pages)p.close();};
  f.context=context;f.pages=pages;f.summary=()=>summary;f.dependencies.platform='win32';f.dependencies.sourceAttestation=async()=>({sourceSha256:'unchanged'});f.dependencies.expectedMediaFiles=async()=>['dist/module.js'];
  f.dependencies.verifyCandidate=async()=>({root:path.resolve('candidate/Run1'),dist:path.resolve('candidate/Run1/dist'),files:['dist/module.js']});f.dependencies.refreshTransitionWorker=async launched=>launched;f.dependencies.openMediaBrowserSession=async()=>({send(){},on(){},off(){}});
  f.dependencies.launchInstalledExtension=async()=>{f.events.push('browser-launch');return {context,worker:{},extensionId:'a'.repeat(32)};};f.dependencies.createAudioSettingsObservation=createAudioSettingsObservation;
  f.dependencies.closeInstalledMediaBrowser=async()=>{for(const p of pages)p.close();return {browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true};};
  f.candidateFiles=new Map([['module.js',Buffer.from('packaged module')]]);f.candidateLinks=new Set();
  const prefix='candidate/Run1/dist/';
  files.readFile=async name=>{f.events.push('candidate-read:'+name);const key=name.slice(prefix.length);if(!name.startsWith(prefix)||!f.candidateFiles.has(key))throw Error('candidate-read-missing');return Buffer.from(f.candidateFiles.get(key));};
  files.readdir=async name=>{
    assert.ok(name==='candidate/Run1/dist'||name.startsWith(prefix),name);const base=name==='candidate/Run1/dist'?'':name.slice(prefix.length)+'/';
    const names=new Map();for(const key of f.candidateFiles.keys())if(key.startsWith(base)){const rest=key.slice(base.length),child=rest.split('/')[0];names.set(child,rest.includes('/'));}
    return [...names].map(([name,dir])=>({name,isDirectory:()=>dir,isFile:()=>!dir&&!f.candidateLinks.has(base+name),isSymbolicLink:()=>f.candidateLinks.has(base+name)}));
  };
  const write=files.writeFile;files.writeFile=async(name,data,...args)=>{if(name.endsWith('/summary.json'))summary=JSON.parse(data);return write(name,data,...args);};return f;
}

test('R5 runner persists observation across closed pages through normal shutdown in its actual summary',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),counts={pointer:1,key:1,input:1,synthetic:0,total:3,overflow:false};
  f.context.tracing.stop=async options=>{assert.equal(options.path,path.resolve('output/playwright/installed-extension-Run1/trace.zip'));};
  f.dependencies.mediaScenario=async({observation})=>{assert.ok(observation);observation.input(f.pages[0],'settings',counts);observation.input(f.pages[1],'other',counts);f.pages[1].emit('console',{type:()=> 'warning',text:()=> 'secret fixture text'});f.pages[1].close();return {audioSettings:{passed:true},pageErrors:[]};};
  const r=await runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies});assert.equal(r.ok,true);assert.equal(r.audioSettingsObservation.complete,true);assert.equal(f.summary().audioSettingsObservation.events.some(e=>e.kind==='console'),true);assert.equal(JSON.stringify(f.summary()).includes('secret fixture'),false);assert.equal(f.context.listenerCount('page'),0);
});

for(const primary of [0,undefined])test('R5 runner preserves falsy primary '+String(primary)+' with explicit missing proof and detached logs',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture();f.dependencies.mediaScenario=async()=>{f.pages[0].emit('console',{type:()=> 'log',text:()=> 'unknown secret'});throw primary;};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),e=>e===primary);const r=f.summary();assert.equal(r.ok,false);assert.equal(r.audioSettingsObservation.inputs.settings,null);assert.equal(r.audioSettingsObservation.complete,false);assert.equal(f.context.listenerCount('page'),0);assert.equal(JSON.stringify(r).includes('unknown secret'),false);
});

for(const fault of ['pageerror','overflow','shutdown','detach'])test('R5 runner '+fault+' observation cannot become a passing summary',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),counts={pointer:1,key:1,input:1,synthetic:0,total:3,overflow:false};
  f.dependencies.mediaScenario=async({observation})=>{observation.input(f.pages[0],'settings',counts);observation.input(f.pages[1],'other',counts);if(fault==='pageerror')f.pages[1].emit('pageerror',Error('secret error'));if(fault==='overflow')for(let i=0;i<300;i++)f.pages[0].emit('console',{type:()=> 'info',text:()=> 'secret'});return {audioSettings:{passed:true},pageErrors:[]};};
  if(fault==='shutdown')f.dependencies.closeInstalledMediaBrowser=async()=>{f.pages[1].emit('console',{type:()=> 'warning',text:()=> 'during shutdown'});throw Error('close-unconfirmed');};
  if(fault==='detach'){const off=f.pages[0].off.bind(f.pages[0]);f.pages[0].off=(kind,fn)=>{off(kind,fn);throw Error('detach-failed');};}
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}));const r=f.summary();assert.equal(r.ok,false);assert.equal(f.context.listenerCount('page'),0);assert.equal(JSON.stringify(r).includes('secret error'),false);
  if(fault==='pageerror'){assert.equal(r.audioSettingsObservation.pageErrorCount,1);assert.deepEqual(r.pageErrors,['audio-settings-page-error']);}else assert.equal(r.audioSettingsObservation.complete,false);
  if(fault==='shutdown')assert.equal(r.audioSettingsObservation.shutdownConfirmed,false);if(fault==='detach')assert.equal(r.audioSettingsObservation.detached,false);
});

test('R5 timeout seals proof checkpoints but preserves browser logs through shutdown without retry',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),{boundedAudioScenario}=await import('../scripts/check-installed-audio-settings.mjs'),f=await audioObservationRunnerFixture(),counts={pointer:1,key:1,input:1,synthetic:0,total:3,overflow:false};let owner,closes=0;
  f.dependencies.mediaScenario=async({observation})=>{owner=observation;observation.input(f.pages[0],'settings',counts);return boundedAudioScenario(()=>new Promise(()=>{}),5);};
  f.dependencies.closeInstalledMediaBrowser=async()=>{closes++;owner.input(f.pages[1],'other',counts);f.pages[1].emit('console',{type:()=> 'log',text:()=> 'late-shutdown-diagnostic'});for(const p of f.pages)p.close();return {browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true};};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),{code:'audio-settings-timeout'});const r=f.summary();assert.equal(closes,1);assert.equal(r.audioSettingsObservation.inputs.other,null);assert.equal(r.audioSettingsObservation.events.some(e=>e.phase==='shutdown'&&e.kind==='console'),true);assert.equal(r.audioSettingsObservation.detached,true);assert.equal(r.audioSettingsObservation.complete,false);
});

test('R5 missing observation factory is rejected before any repository or launch effect',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule();let opened=0;await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:{mediaScenario:async()=>({}),openRepository:async()=>{opened++;}}}),{code:'audio-settings-observation-required'});assert.equal(opened,0);
});

test('R5 failed trace save is not retried or overwritten and never yields successful observation acceptance',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),counts={pointer:1,key:1,input:1,synthetic:0,total:3,overflow:false},original=Error('trace-save-failed');let attempts=0;
  f.context.tracing.stop=async options=>{attempts++;assert.equal(options.path,path.resolve('output/playwright/installed-extension-Run1/trace.zip'));throw original;};
  f.dependencies.mediaScenario=async({observation})=>{observation.input(f.pages[0],'settings',counts);observation.input(f.pages[1],'other',counts);return {audioSettings:{passed:true},pageErrors:[]};};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),e=>e===original);assert.equal(attempts,1);assert.equal(f.summary().audioSettingsTrace.stopAcknowledged,false);assert.equal(f.summary().ok,false);assert.equal(f.context.listenerCount('page'),0);
});

for(const fault of ['trace','owned-close','context-close','screenshot'])test('R5 hung '+fault+' remains bounded and always detaches observation without late success',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),counts={pointer:1,key:1,input:1,synthetic:0,total:3,overflow:false},timer=global.setTimeout,primary=Error('original-scenario-failed');let guard;
  f.dependencies.mediaScenario=async({observation})=>{observation.input(f.pages[0],'settings',counts);observation.input(f.pages[1],'other',counts);if(fault==='screenshot')throw primary;return {audioSettings:{passed:true},pageErrors:[]};};
  if(fault==='trace')f.context.tracing.stop=()=>new Promise(()=>{});if(fault==='owned-close')f.dependencies.closeInstalledMediaBrowser=()=>new Promise(()=>{});if(fault==='context-close')f.context.close=()=>new Promise(()=>{});if(fault==='screenshot')for(const p of f.pages)p.screenshot=()=>new Promise(()=>{});
  global.setTimeout=(fn,ms,...args)=>timer(fn,ms===30000?5:ms,...args);
  try{await assert.rejects(()=>Promise.race([runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),new Promise((_,reject)=>{guard=timer(()=>reject(Error('test-boundary-hung')),200);})]),e=>fault==='screenshot'?e.cause===primary&&e.secondaryErrors.some(r=>r.message.includes('failure-screenshot')):String(e.message).includes('audio-operation-timeout'));}
  finally{global.setTimeout=timer;clearTimeout(guard);}
  assert.equal(f.context.listenerCount('page'),0);assert.equal(f.pages[0].listenerCount('console'),0);assert.equal(f.summary().ok,false);if(fault==='owned-close'||fault==='context-close')assert.equal(f.summary().audioSettingsObservation.complete,false);
});


function completeR5Scenario(f,mutate=()=>{}){
  return async({observation})=>{const counts={pointer:1,key:1,input:1,synthetic:0,total:3,overflow:false};observation.input(f.pages[0],'settings',counts);observation.input(f.pages[1],'other',counts);f.pages[1].close();await mutate();return {pageErrors:[]};};
}
test('R5 candidate disk endpoints are read before launch and after close and stored in the actual summary',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),{createHash}=require('node:crypto'),f=await audioObservationRunnerFixture();f.dependencies.mediaScenario=completeR5Scenario(f);
  const r=await runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies});
  const expected=[{file:'dist/module.js',bytes:15,sha256:createHash('sha256').update('packaged module').digest('hex')}];
  assert.deepEqual(r.audioSettingsCandidate,{before:expected,after:expected});assert.deepEqual(f.summary().audioSettingsCandidate,r.audioSettingsCandidate);
  assert.ok(f.events.indexOf('candidate-read:candidate/Run1/dist/module.js')<f.events.indexOf('browser-launch'));assert.ok(f.events.lastIndexOf('candidate-read:candidate/Run1/dist/module.js')>f.events.indexOf('context-close'));
});
for(const fault of ['changed','removed','added','linked','read'])test('R5 candidate '+fault+' endpoint cannot pass on unchanged repository source',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),files=await f.dependencies.openRepository();
  f.dependencies.mediaScenario=completeR5Scenario(f,()=>{
    if(fault==='changed')f.candidateFiles.set('module.js',Buffer.from('modified module'));
    if(fault==='removed')f.candidateFiles.delete('module.js');if(fault==='added')f.candidateFiles.set('extra.js',Buffer.from('extra'));
    if(fault==='linked')f.candidateLinks.add('module.js');if(fault==='read')files.readFile=async()=>{throw Error('candidate-after-read-failed');};
  });
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}));
  const r=f.summary();assert.equal(r.ok,false);assert.ok(r.audioSettingsCandidate.before);assert.equal(r.audioSettingsObservation.detached,true);
  if(fault==='changed')assert.notDeepEqual(r.audioSettingsCandidate.after,r.audioSettingsCandidate.before);else assert.equal(r.audioSettingsCandidate.after,null);
});
test('R5 candidate read failure before launch records unformed endpoints without opening the browser',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),files=await f.dependencies.openRepository();files.readFile=async()=>{throw Error('candidate-before-read-failed');};f.dependencies.mediaScenario=completeR5Scenario(f);
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),/candidate-before-read-failed/);
  assert.equal(f.events.includes('browser-launch'),false);assert.equal(f.events.includes('profile-create'),false);assert.deepEqual(f.summary().audioSettingsCandidate,{before:null,after:null});
});
test('R5 candidate after read failure preserves the original scenario failure and closed observation',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),files=await f.dependencies.openRepository(),primary=Error('scenario-original');
  f.dependencies.mediaScenario=async()=>{files.readFile=async()=>{throw Error('candidate-after-secondary');};throw primary;};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),e=>e.cause===primary&&e.secondaryErrors.some(r=>r.message==='candidate-after-secondary'));
  assert.equal(f.summary().error.native.message,'scenario-original');assert.equal(f.summary().audioSettingsCandidate.after,null);assert.equal(f.summary().audioSettingsObservation.detached,true);
});


for(const phase of ['before','after'])test('R5 candidate '+phase+' timeout keeps null after late read and preserves shutdown',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),files=await f.dependencies.openRepository(),read=files.readFile,timer=global.setTimeout;let calls=0,release,guard;
  files.readFile=async name=>{calls++;if(phase==='before'||calls===2)return new Promise(resolve=>{release=resolve;});return read(name);};f.dependencies.mediaScenario=completeR5Scenario(f);
  global.setTimeout=(fn,ms,...args)=>timer(fn,ms===30000?5:ms,...args);
  try{await assert.rejects(()=>Promise.race([runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),new Promise((_,reject)=>{guard=timer(()=>reject(Error('candidate-test-hung')),200);})]),/audio-operation-timeout/);}
  finally{global.setTimeout=timer;clearTimeout(guard);}
  const r=f.summary();assert.equal(r.ok,false);assert.equal(r.audioSettingsCandidate[phase],null);assert.equal(f.events.includes('browser-launch'),phase==='after');
  if(phase==='after')assert.equal(r.audioSettingsObservation.detached,true);
  release(Buffer.from('packaged module'));await new Promise(resolve=>setImmediate(resolve));assert.equal(f.summary().audioSettingsCandidate[phase],null);
});
test('R5 candidate keeps the expected set fixed while recursively rejecting newly added directories',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),names=['dist/module.js'];
  f.dependencies.expectedMediaFiles=async()=>names;f.dependencies.verifyCandidate=async()=>({root:path.resolve('candidate/Run1'),dist:path.resolve('candidate/Run1/dist'),files:names});
  f.dependencies.mediaScenario=completeR5Scenario(f,()=>{names.push('dist/web/extra.js');f.candidateFiles.set('web/extra.js',Buffer.from('new asset'));});
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),{code:'audio-settings-candidate-files'});assert.equal(f.summary().audioSettingsCandidate.after,null);
});
test('R5 candidate recursively reads every expected asset with canonical ordering',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),names=['dist/module.js','dist/web/nested/module.js'];f.candidateFiles.set('web/nested/module.js',Buffer.from('nested'));
  f.dependencies.expectedMediaFiles=async()=>names;f.dependencies.verifyCandidate=async()=>({root:path.resolve('candidate/Run1'),dist:path.resolve('candidate/Run1/dist'),files:names});f.dependencies.mediaScenario=completeR5Scenario(f);
  const r=await runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies});assert.deepEqual(r.audioSettingsCandidate.before.map(x=>x.file),names);assert.deepEqual(r.audioSettingsCandidate.before,r.audioSettingsCandidate.after);
});


function normalRunnerReference(){const {createHash}=require('node:crypto');return {runId:'Normal1',sha256:'1'.repeat(64),source:{sourceSha256:'unchanged'},candidate:[{file:'dist/module.js',bytes:15,sha256:createHash('sha256').update('packaged module').digest('hex')}]};}
test('R5 normal predecessor is consumed before candidate build and after owned shutdown in the actual summary',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture();let reads=0;f.dependencies.readAudioSettingsNormal=async()=>{f.events.push('normal-read');reads++;return normalRunnerReference();};const build=f.dependencies.verifyCandidate;f.dependencies.verifyCandidate=async(...args)=>{f.events.push('candidate-build');return build(...args);};f.dependencies.mediaScenario=completeR5Scenario(f);
  const r=await runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies});assert.equal(reads,2);assert.deepEqual(r.audioSettingsNormal,{before:{runId:'Normal1',sha256:'1'.repeat(64)},after:{runId:'Normal1',sha256:'1'.repeat(64)}});assert.deepEqual(f.summary().audioSettingsNormal,r.audioSettingsNormal);assert.ok(f.events.indexOf('normal-read')<f.events.indexOf('candidate-build'));assert.ok(f.events.lastIndexOf('normal-read')>f.events.indexOf('context-close'));
});
for(const fault of ['read','source','candidate'])test('R5 normal '+fault+' mismatch blocks admission before a profile or browser exists',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture();let reads=0,builds=0;const build=f.dependencies.verifyCandidate;f.dependencies.verifyCandidate=async(...args)=>{builds++;return build(...args);};f.dependencies.mediaScenario=completeR5Scenario(f);f.dependencies.readAudioSettingsNormal=async()=>{reads++;if(fault==='read')throw Error('normal-before-read');const r=normalRunnerReference();if(fault==='source')r.source.sourceSha256='wrong';if(fault==='candidate')r.candidate[0].sha256='2'.repeat(64);return r;};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}));assert.equal(reads,1);assert.equal(builds,fault==='candidate'?1:0);assert.equal(f.events.includes('profile-create'),false);assert.equal(f.events.includes('browser-launch'),false);assert.equal(f.summary().ok,false);assert.equal(f.summary().audioSettingsNormal.after,null);
});
test('R5 normal baseline is a fixed copy and cannot be edited through a reused reader object',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),reference=normalRunnerReference();let reads=0;f.dependencies.readAudioSettingsNormal=async()=>{reads++;return reference;};f.dependencies.mediaScenario=completeR5Scenario(f,()=>{reference.source.sourceSha256='mutated';});
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),{code:'audio-settings-normal-changed'});assert.equal(reads,2);assert.equal(f.summary().ok,false);assert.equal(f.summary().audioSettingsObservation.detached,true);
});
test('R5 normal after read failure retains both the original scenario failure and the unavailable reference endpoint',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),primary=Error('scenario-normal-primary');let reads=0;f.dependencies.readAudioSettingsNormal=async()=>{if(++reads===2)throw Error('normal-after-secondary');return normalRunnerReference();};f.dependencies.mediaScenario=async()=>{throw primary;};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),e=>e.cause===primary&&e.secondaryErrors.some(r=>r.message==='normal-after-secondary'));assert.equal(f.summary().audioSettingsNormal.after,null);assert.equal(f.summary().error.native.message,'scenario-normal-primary');
});
for(const phase of ['before','after'])test('R5 normal '+phase+' timeout preserves null and ignores late reference completion',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture(),timer=global.setTimeout;let reads=0,release,guard;f.dependencies.mediaScenario=completeR5Scenario(f);f.dependencies.readAudioSettingsNormal=async()=>{if(++reads===(phase==='before'?1:2))return new Promise(resolve=>{release=resolve;});return normalRunnerReference();};global.setTimeout=(fn,ms,...args)=>timer(fn,ms===30000?5:ms,...args);
  try{await assert.rejects(()=>Promise.race([runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),new Promise((_,reject)=>{guard=timer(()=>reject(Error('normal-test-hung')),200);})]),/audio-operation-timeout/);}finally{global.setTimeout=timer;clearTimeout(guard);}
  assert.equal(f.summary().ok,false);assert.equal(f.summary().audioSettingsNormal[phase],null);assert.equal(f.events.includes('browser-launch'),phase==='after');release(normalRunnerReference());await new Promise(resolve=>setImmediate(resolve));assert.equal(f.summary().audioSettingsNormal[phase],null);
});


test('R5 normal raw byte digest change cannot pass with unchanged source and candidate',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=await audioObservationRunnerFixture();let reads=0;f.dependencies.readAudioSettingsNormal=async()=>{const r=normalRunnerReference();if(++reads===2)r.sha256='2'.repeat(64);return r;};f.dependencies.mediaScenario=completeR5Scenario(f);
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),{code:'audio-settings-normal-changed'});assert.equal(reads,2);const r=f.summary();assert.equal(r.audioSettingsNormal.before.sha256,'1'.repeat(64));assert.equal(r.audioSettingsNormal.after.sha256,'2'.repeat(64));assert.equal(r.ok,false);
});
test('normal reference callback is limited to R5 and must be a function before repository effects',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule();let opened=0;
  for(const options of [{qualification:'media-tab',read:async()=>({})},{qualification:undefined,read:async()=>({})},{qualification:'audio-settings',read:17}])await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:options.qualification,dependencies:{mediaScenario:async()=>({}),createAudioSettingsObservation:()=>({}),readAudioSettingsNormal:options.read,openRepository:async()=>{opened++;throw Error('must-not-open');}}}),{code:'audio-settings-normal-reader-invalid'});
  assert.equal(opened,0);
});


for(const fault of ['none','missing-worklet','extra','duplicate'])test('R5 actual default current asset contract: '+fault,async()=>{
  const {runInstalledExtensionE2E,expectedF01MediaFiles}=await runnerModule(),{openOwnedRoot}=await import('../scripts/owned-files.mjs'),f=await audioObservationRunnerFixture(),owned=await openOwnedRoot(process.cwd()),files=await f.dependencies.openRepository(),legacy=await expectedF01MediaFiles(owned),current=[...legacy,'dist/web/audio-transition-worklet.js'].sort();
  delete f.dependencies.expectedMediaFiles;f.candidateFiles.clear();for(const name of current)f.candidateFiles.set(name.slice(5),Buffer.from('fixture '+name));
  const names=fault==='missing-worklet'?legacy:fault==='extra'?[...current,'dist/unapproved.js'].sort():fault==='duplicate'?[...current,current[0]].sort():current;
  if(fault==='missing-worklet')f.candidateFiles.delete('web/audio-transition-worklet.js');if(fault==='extra')f.candidateFiles.set('unapproved.js',Buffer.from('unapproved'));
  const read=files.readFile;files.readFile=name=>name==='tests/fixtures/installed-extension/published-payload.json'?owned.readFile(name):read(name);
  f.dependencies.verifyCandidate=async()=>({root:path.resolve('candidate/Run1'),dist:path.resolve('candidate/Run1/dist'),files:names});f.dependencies.mediaScenario=completeR5Scenario(f);
  if(fault==='none'){const r=await runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies});assert.equal(r.ok,true);assert.deepEqual(r.audioSettingsCandidate.before.map(x=>x.file),current);assert.deepEqual(r.audioSettingsCandidate.before,r.audioSettingsCandidate.after);}
  else{await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',qualification:'audio-settings',dependencies:f.dependencies}),{code:'media-candidate-assets-invalid'});assert.equal(f.events.includes('profile-create'),false);assert.equal(f.events.includes('browser-launch'),false);}
});

for(const failureMode of ['query-error','late-query'])for(const primary of [false,true])for(const abortFails of [false,true])test('media-tab product retains query and retirement diagnostics primary='+primary+' abortFails='+abortFails+' mode='+failureMode,async t=>{
  const {runInstalledExtensionE2E}=await runnerModule(),{runProductAudio}=await import('../scripts/check-product-audio.mjs'),{closeInstalledMediaBrowser}=await import('../scripts/extension-e2e/harness.mjs'),{l1OwnedCloser}=await import('../scripts/extension-e2e/audio-l1.mjs'),{EventEmitter}=require('node:events');
  const f=runnerFixture(),files=await f.dependencies.openRepository(),saved=new Map(),browser=new EventEmitter();let connected=true,queries=0,aborts=0;
  let monotonic=1000;if(failureMode==='late-query')t.mock.method(performance,'now',()=>monotonic);
  const runId='CloseDiagnostics',artifact='output/playwright/installed-extension-'+runId;
  files.writeFile=async(name,data)=>{assert.ok(!saved.has(name));saved.set(name,Buffer.from(data));};
  files.resolve=async name=>path.join(files.root,name);browser.isConnected=()=>connected;f.context.browser=()=>browser;
  const session={send:async method=>{assert.equal(method,'Browser.close');connected=false;browser.emit('disconnected');},on(){},off(){}};
  const close=l1OwnedCloser(input=>closeInstalledMediaBrowser({...input,queryProcesses:async()=>{queries++;if(failureMode==='late-query'){monotonic=16000;return [];}
    throw Object.assign(Error('native-unavailable'),{code:'native-unavailable',queryDiagnostic:{reason:'timeout',timedOut:true,secret:'private-sentinel'}});}}),async()=>{aborts++;if(abortFails)throw Error('owned-abort-failed');});
  await assert.rejects(()=>runProductAudio({runId},{platform:'win32',files,attest:async()=>({sourceSha256:'stable'}),execute:options=>runInstalledExtensionE2E({...options,dependencies:{...f.dependencies,platform:'win32',sourceAttestation:async()=>({sourceSha256:'stable'}),
    verifyCandidate:async()=>({dist:path.join(files.root,'candidate/dist'),files:['dist/media-profiles.js']}),expectedMediaFiles:async()=>['dist/media-profiles.js'],refreshTransitionWorker:async l=>l,openMediaBrowserSession:async()=>session,
    mediaScenario:async()=>{if(primary)throw Error('capture-primary');return {audioProduct:{passed:true}};},closeInstalledMediaBrowser:close}})}),/audio-product-observation-failed/);
  const inner=JSON.parse(saved.get(artifact+'/summary.json')),outer=JSON.parse(saved.get('output/audio-product-'+runId+'/summary.json'));
  assert.equal(inner.ok,false);assert.equal(inner.shutdown,null);assert.equal(outer.ok,false);assert.equal(queries,1);assert.equal(aborts,1);
  const inside=primary?inner.secondaryErrors[0].native:inner.error.native;
  const outside=primary?outer.error.secondaryErrors[0].native:outer.error.cause;
  for(const detail of [inside,outside]){
    if(failureMode==='query-error')assert.equal(detail.queryDiagnostic.reason,'timeout');
    else {assert.equal(detail.message,'media-close-unconfirmed');assert.equal(detail.closeDiagnostic.lastRootCount,null);}
    assert.equal(detail.closeDiagnostic.stage,'owned-roots');assert.equal(detail.closeDiagnostic.browserCloseAcknowledged,true);assert.equal(detail.closeDiagnostic.browserDisconnected,true);assert.equal(detail.forcedRetirement,!abortFails);
    if(abortFails)assert.match(detail.retireError,/owned-abort-failed/);else assert.equal(detail.retireError,undefined);
  }
  if(primary)assert.equal(outer.error.cause.message,'capture-primary');
  assert.equal(JSON.stringify([inner,outer]).includes('private-sentinel'),false);
  assert.equal(f.events.includes('profile-remove'),false);assert.equal(f.events.includes('candidate-remove'),false);
});
