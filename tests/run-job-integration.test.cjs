const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{EventEmitter}=require('node:events');
const caseId='44100/normalizer-control/tone-silence';
function jobInputs(root,paths){
  const helper={path:paths.join(root,'synthetic-helper.exe'),sha256:'a'.repeat(64)};
  const selection={root:paths.join(root,'synthetic-candidate'),manifestSha256:'b'.repeat(64)};
  const binding=Object.freeze({nonce:'c'.repeat(64),pid:42,created:'0123456789abcdef',helperPid:43,helperCreated:'0123456789abcdee',helperSha256:helper.sha256,executable:paths.join(selection.root,'chrome.exe')});
  return {helper,selection,binding};
}
const {helper,selection,binding}=jobInputs(process.cwd(),path);
const job=(ownerBinding=binding)=>({binding:ownerBinding,active:0,rootExited:true,total:1,helperExited:true,aborted:false,timing:{budgetMs:15000,remainingBeforeMs:11000,remainingAfterMs:10000}});
const proof=()=>({contract:'run-job-v1',browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:null,runJobClosed:true,profileRootAssessment:'UNASSESSED',job:job()});
test('run-job opt-in fixes the helper and refuses partial, implicit or foreign-case selection',async()=>{
  const {parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  const base=['--run-id=JobUnit','--case='+caseId,'--browser-root='+selection.root,'--browser-manifest-sha256='+selection.manifestSha256];
  const opts=['--shutdown-contract=run-job-v1','--job-helper='+helper.path,'--job-helper-sha256='+helper.sha256];
  const parsed=parseProductAudioArgs([...base,...opts]);
  assert.deepEqual(parsed.runJob,{contract:'run-job-v1',helper});assert.ok(Object.isFrozen(parsed.runJob)&&Object.isFrozen(parsed.runJob.helper));
  assert.equal(parseProductAudioArgs(base).runJob,undefined);
  for(const args of [[...base,...opts.slice(1)],[...base,...opts.slice(0,2)],[...base,...opts,'--shutdown-contract=run-job-v1'],
    [base[0],base[1],...opts],[...base.slice(0,1),'--case=48000/normalizer-control/tone-silence',...base.slice(2),...opts],
    [...base,'--shutdown-contract=other',...opts.slice(1)],[...base,opts[0],'--job-helper=relative.exe',opts[2]],
    [...base,opts[0],'--job-helper=//server/share/helper.exe',opts[2]],[...base,...opts.slice(0,2),'--job-helper-sha256=not-a-hash']])assert.throws(()=>parseProductAudioArgs(args));
});
function closer(){let connected=true;const browser=new EventEmitter();browser.isConnected=()=>connected;return {context:{browser:()=>browser},profilePath:path.resolve('synthetic-profile'),browserSession:{send:async()=>{connected=false;browser.emit('disconnected');}}};}
test('explicit Job close shares the ACK deadline and keeps global profile absence unassessed',async t=>{
  const {closeInstalledMediaBrowser}=await import('../scripts/extension-e2e/harness.mjs');let now=1000,queries=0,seen;
  t.mock.method(performance,'now',()=>now);const f=closer(),send=f.browserSession.send;f.browserSession.send=async()=>{now+=4000;await send();};
  const result=await closeInstalledMediaBrowser({...f,queryProcesses:async()=>{queries++;return [];},runJobOwner:{binding,close:async deadline=>{seen=deadline;now=deadline-1;return job();}}});
  assert.equal(seen,16000);assert.equal(queries,0);assert.deepEqual(result,proof());
});
for(const fault of ['late','wrong-binding','active','no-root','no-helper','aborted'])test('Job close rejects '+fault+' without a global query fallback',async t=>{
  const {closeInstalledMediaBrowser}=await import('../scripts/extension-e2e/harness.mjs');let now=1000,queries=0;t.mock.method(performance,'now',()=>now);
  await assert.rejects(closeInstalledMediaBrowser({...closer(),queryProcesses:async()=>{queries++;return [];},runJobOwner:{binding,close:async deadline=>{
    const value=job();if(fault==='late')now=deadline;else if(fault==='wrong-binding')value.binding={...binding,nonce:'d'.repeat(64)};else if(fault==='active')value.active=1;else if(fault==='no-root')value.rootExited=false;else if(fault==='aborted')value.aborted=true;else value.helperExited=false;return value;
  }}}),/media-close/);assert.equal(queries,0);
});
test('legacy global query failure cannot select Job proof after launch',async()=>{
  const {closeInstalledMediaBrowser}=await import('../scripts/extension-e2e/harness.mjs');let queries=0;
  await assert.rejects(closeInstalledMediaBrowser({...closer(),queryProcesses:async()=>{queries++;throw Error('query-denied');}}),/query-denied/);assert.equal(queries,1);
});

function runnerFixture(value,ownerBinding=binding){
  const saved=new Map(),events=[],root=process.cwd(),profilePath=path.join(root,'output/playwright/installed-profile-job-unit');
  const context={tracing:{start:async()=>{},stop:async()=>{}},pages:()=>[],close:async()=>events.push('context-close')};
  const owner={binding:ownerBinding,close:async()=>job(),abort:async()=>events.push('abort')};
  const dependencies={platform:'win32',openRepository:async()=>({root,lstat:async n=>n.includes('installed-profile-')||n==='candidate'?{isDirectory:()=>true}:null,ensureDirectory:async()=>{},makeTempDirectory:async()=>profilePath,resolve:async n=>path.join(root,n),writeFile:async(n,data)=>saved.set(n,JSON.parse(data))}),
    verifyCandidate:async()=>({root:path.join(root,'candidate'),dist:path.join(root,'candidate/dist'),files:['dist/module.js']}),checkPackage:async()=>{},expectedMediaFiles:async()=>['dist/module.js'],loadFixtureResponses:async()=>[],sourceAttestation:async()=>({sourceSha256:'same'}),
    launchInstalledExtension:async()=>({context,worker:{},extensionId:'a'.repeat(32),runJobOwner:owner,browserCandidateVersion:'159.0.8132.0'}),refreshTransitionWorker:async launched=>launched,openMediaBrowserSession:async()=>({send(){},on(){},off(){}}),
    mediaScenario:async()=>({audioProduct:{scope:caseId,spec:{id:caseId},passed:true}}),closeInstalledMediaBrowser:async input=>{events.push(input.runJobOwner===owner?'job-close':'legacy-close');return value;}};
  return {dependencies,saved,events,owner};
}
test('runner accepts bound Job proof only for preselected product media-tab contract',async()=>{
  const {runInstalledExtensionE2E}=await import('../scripts/check-installed-extension.mjs'),f=runnerFixture(proof());
  const result=await runInstalledExtensionE2E({runId:'JobUnit',qualification:'media-tab',retainEvidence:true,shutdownContract:{contract:'run-job-v1',caseId,helper,browserCandidate:selection},dependencies:f.dependencies});
  assert.equal(result.ok,true);assert.deepEqual(result.shutdown,proof());assert.deepEqual(f.events,['job-close','context-close']);
});
for(const mode of ['default','foreign-case','foreign-qualification','wrong-contract','wrong-binding','missing-binding','old-proof'])test('runner rejects Job contract transplant '+mode,async()=>{
  const {runInstalledExtensionE2E}=await import('../scripts/check-installed-extension.mjs'),f=runnerFixture(mode==='old-proof'?{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}:proof(),mode==='wrong-binding'?{...binding,nonce:'d'.repeat(64)}:mode==='missing-binding'?null:binding);
  const selected={contract:mode==='wrong-contract'?'wrong':'run-job-v1',caseId:mode==='foreign-case'?'48000/normalizer-control/tone-silence':caseId,helper,browserCandidate:selection};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'JobUnit',qualification:mode==='foreign-qualification'?'player-gain':'media-tab',retainEvidence:true,...mode==='default'?{}:{shutdownContract:selected},dependencies:f.dependencies}));
  assert.equal(f.events.includes('context-close'),false);
});

async function launcherFixture(fault,observeRunJobOwner,recordRunJob,canonicalRoot=dir=>dir){
  const fs=require('node:fs'),vm=require('node:vm'),{PassThrough}=require('node:stream'),{transformSync}=require('esbuild');
  const root='C:\\synthetic-job';
  const {helper,selection,binding}=jobInputs(root,path.win32);
  const profilePath=path.win32.join(root,'synthetic-profile'),artifactPath=path.win32.join(root,'synthetic-artifacts');
  const source=fs.readFileSync('scripts/extension-e2e/visibility-browser.mjs','utf8').replace('await import(harnessSpecifier)','await unitHarness()').replace("await import('./run-job.mjs')",'await unitJob()');
  const code=transformSync(source,{format:'cjs',target:'es2022'}).code,module={exports:{}},events=[],calls={};
  const child=new EventEmitter();child.stdio=[null,null,null,new PassThrough(),new PassThrough()];
  const owner={child,binding,close:async()=>job(binding),abort:async()=>{events.push('abort');if(fault==='abort')throw Error('abort-first');}};
  const browser={version:()=>fault==='version'?'151.0.0.0':'159.0.8132.0',contexts:()=>[{browser:()=>browser}],isConnected:()=>true};
  vm.runInNewContext(code,{module,exports:module.exports,Error,Buffer,Date,performance,Object,structuredClone,setTimeout,clearTimeout,setImmediate,clearImmediate,process:{platform:'win32'},
    require(name){
      if(name==='node:path')return path.win32;
      if(name==='node:child_process')return {spawn(){throw Error('direct-spawn-forbidden');}};
      if(name==='node:fs/promises')return {lstat:async()=>({isDirectory:()=>true,isSymbolicLink:()=>false}),realpath:async dir=>canonicalRoot(dir)};
      return require(name);
    },
    unitHarness:async()=>({prepareWindowsBundledChromium(){throw Error('bundled-forbidden');},waitForExtensionWorker(){},extensionLaunchOptions(){},verifyBrowserCandidate:async(_,controls)=>{calls.exclude=Array.from(controls.exclude);return {executable:binding.executable};},openMediaBrowserSession:async()=>({send(){}})}),
    unitJob:async()=>({launchRunJob:async input=>{calls.job=input;events.push('job-launch');assert.deepEqual(structuredClone(input.helper),helper);assert.equal(input.executable,binding.executable);assert.ok(input.args.includes('--remote-debugging-pipe'));return owner;}})});
  const launch=(overrides={})=>module.exports.launchVisibilityBrowser({profilePath,artifactPath,headed:false,browserCandidate:selection,runJob:{contract:'run-job-v1',helper},productCaseId:caseId,
    observeRunJobOwner,recordRunJob:async value=>{events.push('record');assert.deepEqual(value,binding);await recordRunJob?.();if(fault==='record')throw Error('record-first');},chromiumApi:{connectOverCDP:async(_,options)=>{calls.cdp=structuredClone(options);events.push('connect');if(fault==='connect'||fault==='abort')throw Error('connect-first');return browser;}},...overrides});
  return {launch,owner,events,calls,profilePath,helper,destroy:()=>child.stdio.slice(3).forEach(s=>s.destroy())};
}
test('launcher creates Job before CDP and returns only its scoped abort',async t=>{
  const f=await launcherFixture();t.after(f.destroy);const launched=await f.launch();
  assert.equal(Object.hasOwn(f.calls.job,'chromiumTempDir'),false);
  assert.deepEqual(f.calls.cdp,{noDefaults:true,timeout:15000});
  assert.equal(launched.runJobOwner,f.owner);assert.deepEqual(f.events,['job-launch','record','connect']);await launched.abort();assert.equal(f.events.at(-1),'abort');
});

test('diagnostic paths fix Chromium temp and Playwright artifacts independently before any await',async t=>{
  const f=await launcherFixture(null,({abort})=>abort);t.after(f.destroy);
  const diagnosticPaths={chromiumTempDir:'C:\\trial\\chrome-temp',playwrightArtifactsDir:'C:\\trial\\pw-artifacts'};
  const fixed={...diagnosticPaths};
  const launched=f.launch({diagnosticPaths});
  diagnosticPaths.chromiumTempDir='C:\\changed';
  diagnosticPaths.playwrightArtifactsDir='C:\\changed';
  await launched;
  assert.equal(f.calls.job.chromiumTempDir,fixed.chromiumTempDir);
  assert.deepEqual(f.calls.cdp,{noDefaults:true,timeout:15000,artifactsDir:fixed.playwrightArtifactsDir});
  assert.deepEqual(f.calls.exclude.slice(-2),Object.values(fixed));
});

test('diagnostic paths reject missing, overlapping, aliased, and nonlocal directories before launch',async t=>{
  const temp='C:\\trial\\chrome-temp',artifacts='C:\\trial\\pw-artifacts';
  const f=await launcherFixture(null,({abort})=>abort,null,dir=>dir==='C:\\alias'?temp:dir);t.after(f.destroy);
  for(const diagnosticPaths of [
    {chromiumTempDir:temp},{chromiumTempDir:temp,playwrightArtifactsDir:temp.toUpperCase()},
    {chromiumTempDir:temp,playwrightArtifactsDir:temp+'\\child'},
    {chromiumTempDir:path.win32.join(f.profilePath,'child'),playwrightArtifactsDir:artifacts},
    {chromiumTempDir:temp,playwrightArtifactsDir:path.win32.dirname(f.helper.path)},
    {chromiumTempDir:temp,playwrightArtifactsDir:'C:\\alias'},
    {chromiumTempDir:'\\\\host\\share',playwrightArtifactsDir:artifacts},
    {chromiumTempDir:'C:\\trial\\COM1.txt',playwrightArtifactsDir:artifacts},
  ])await assert.rejects(f.launch({diagnosticPaths}),/visibility-job-directories/);
  assert.deepEqual(f.events,[]);
});

test('diagnostic CDP rechecks paths after the READY recording callback',async t=>{
  const diagnosticPaths={chromiumTempDir:'C:\\trial\\chrome-temp',playwrightArtifactsDir:'C:\\trial\\pw-artifacts'};
  let moved=false;
  const f=await launcherFixture(null,({abort})=>abort,()=>{moved=true;},dir=>
    moved&&dir===diagnosticPaths.playwrightArtifactsDir?diagnosticPaths.chromiumTempDir:dir);
  t.after(f.destroy);
  await assert.rejects(f.launch({diagnosticPaths}),/visibility-job-directories/);
  assert.deepEqual(f.events,['job-launch','record','abort']);
});

test('diagnostic monitor STOP starts same owner retirement without replacing stalled actual launch',async()=>{
  const {boundedProductLaunch}=await import('../scripts/check-product-audio.mjs');
  const {getEventListeners}=require('node:events');
  const monitor=new AbortController(),first=Error('raw-bytes-stop'),late=Error('actual-visibility-late');
  let ready,release,aborts=0,retired,receipt;
  const handed=new Promise(resolve=>{ready=resolve;});
  const pendingWrite=new Promise(resolve=>{release=resolve;});
  const abortStarted=new Promise(resolve=>{retired=resolve;});
  const end=performance.now()+16000;
  const run=boundedProductLaunch(async ({observeRunJobOwner,signal})=>{
    const abort=observeRunJobOwner({binding,abort:async()=>{aborts++;retired();return {...job(),aborted:true};}});
    ready();
    await pendingWrite;
    assert.equal(signal.aborted,true);
    await abort();
    throw late;
  },async value=>{receipt=value;},100,{launchBy:end-15500,abortBy:end-15000,retireBy:end,saveBy:end+1000,stopSignal:monitor.signal});
  const failure=assert.rejects(run,error=>error===first);
  await handed;
  monitor.abort(first);
  try{await abortStarted;assert.equal(receipt,undefined);}finally{release();}
  await failure;
  assert.equal(aborts,1);
  assert.equal(receipt.firstError.message,first.message);
  assert.equal(receipt.launchError.message,late.message);
  assert.equal(receipt.status,'CONFIRMED');
  assert.equal(getEventListeners(monitor.signal,'abort').length,0);
});

test('diagnostic monitor pre-stopped or same-turn STOP consumes no launch attempt',async()=>{
  const {boundedProductLaunch}=await import('../scripts/check-product-audio.mjs');
  const {getEventListeners}=require('node:events');
  for(const preStopped of [true,false]){
    const monitor=new AbortController(),reason=Error('raw-visibility-stop'),end=performance.now()+16000;
    if(preStopped)monitor.abort(reason);
    let attempts=0,receipt;
    const run=boundedProductLaunch(async()=>{attempts++;throw Error('unexpected launch');},async value=>{receipt=value;},100,
      {launchBy:end-15500,abortBy:end-15000,retireBy:end,saveBy:end+1000,stopSignal:monitor.signal});
    if(!preStopped)monitor.abort(reason);
    await assert.rejects(run,error=>error===reason);
    assert.equal(attempts,0);assert.equal(receipt.launchState,'NOT_STARTED');
    assert.equal(getEventListeners(monitor.signal,'abort').length,0);
  }
});

test('diagnostic monitor preserves cutoff and already-observed launch failure priority',async t=>{
  const {boundedProductLaunch}=await import('../scripts/check-product-audio.mjs');
  const {getEventListeners}=require('node:events');
  let now=0;
  t.mock.method(performance,'now',()=>now);
  for(const mode of ['before','at-cutoff','after-launch-error']){
    now=0;
    const monitor=new AbortController(),stop=Error('raw-stop'),launchError=Error('launch-first');
    let entered,rejectLaunch,receipt;
    const started=new Promise(resolve=>{entered=resolve;});
    const pending=new Promise((_,reject)=>{rejectLaunch=reject;});
    const result=boundedProductLaunch(async()=>{entered();return pending;},async value=>{receipt=value;},100,
      {launchBy:100,abortBy:1000,retireBy:16000,saveBy:17000,stopSignal:monitor.signal});
    const failed=assert.rejects(result,error=>mode==='at-cutoff'?error.message==='audio-product-launch-timeout':
      error===(mode==='before'?stop:launchError));
    await started;
    if(mode==='after-launch-error'){
      rejectLaunch(launchError);
      await failed;
      monitor.abort(stop);
    }else{
      now=mode==='before'?99:100;monitor.abort(stop);now=101;rejectLaunch(launchError);
      await failed;
      assert.equal(receipt.launchError.message,launchError.message);
    }
    assert.equal(getEventListeners(monitor.signal,'abort').length,0);
  }
});

test('diagnostic monitor cannot publish a launch stopped in the same turn',async()=>{
  const {boundedProductLaunch}=await import('../scripts/check-product-audio.mjs');
  for(const outcome of ['returned','handoff-gap','rejected']){
    const monitor=new AbortController(),stop=Error('raw-stop'),first=Error('launch-first');
    let entered,resolveLaunch,rejectLaunch,launched,receipt;
    const started=new Promise(resolve=>{entered=resolve;});
    const pending=new Promise((resolve,reject)=>{resolveLaunch=resolve;rejectLaunch=reject;});
    const end=performance.now()+16000;
    const run=boundedProductLaunch(({observeRunJobOwner})=>{
      const abort=observeRunJobOwner({binding,abort:async()=>({...job(),aborted:true})});
      launched={abort,runJobOwner:{binding}};entered();
      return pending;
    },async value=>{receipt=value;},100,{launchBy:end-15500,abortBy:end-15000,retireBy:end,saveBy:end+1000,stopSignal:monitor.signal});
    const failed=assert.rejects(run,error=>error===(outcome==='rejected'?first:stop));
    await started;
    if(outcome==='rejected')rejectLaunch(first);else resolveLaunch(launched);
    const fire=()=>monitor.abort(stop);
    queueMicrotask(outcome==='handoff-gap'?()=>queueMicrotask(fire):fire);
    await failed;
    assert.equal(receipt.launchState,outcome==='rejected'?'REJECTED':'RETURNED');
    assert.equal(receipt.status,'CONFIRMED');
  }
});

test('diagnostic handoff precedes launch evidence I/O and shares the existing cleanup',async t=>{
  let entered,release,ownedAbort;
  const writing=new Promise(resolve=>{entered=resolve;});
  const blocked=new Promise(resolve=>{release=resolve;});
  const f=await launcherFixture('record',({binding:actual,abort})=>{
    assert.deepEqual(actual,f.owner.binding);
    f.events.push('handoff');
    let pending;
    ownedAbort=()=>pending??=abort();
    return ownedAbort;
  },()=>{entered();return blocked;});t.after(f.destroy);
  const launched=f.launch();
  const failed=assert.rejects(launched,/record-first/);
  try{
    await writing;
    assert.deepEqual(f.events,['job-launch','handoff','record']);
    await ownedAbort();
  }finally{release();await failed;}
  assert.deepEqual(f.events,['job-launch','handoff','record','abort']);
});

test('diagnostic launch timeout joins one owned abort and preserves exact evidence before throwing the first error',async()=>{
  const {boundedProductLaunch}=await import('../scripts/check-product-audio.mjs');
  let abort,aborts=0,releaseWrite;
  const write=new Promise(resolve=>{releaseWrite=resolve;});
  const end=performance.now()+16000;
  const jobProof={...job(),aborted:true};
  const launched=boundedProductLaunch(async ({observeRunJobOwner})=>{
    abort=observeRunJobOwner({binding,abort:async()=>{aborts++;releaseWrite();return jobProof;}});
    await write;
    await abort();
    throw Error('visibility-late');
  },async receipt=>{
    assert.deepEqual(receipt,{status:'CONFIRMED',launchState:'REJECTED',binding,job:jobProof,
      firstError:{message:'audio-product-launch-timeout'},launchError:{message:'visibility-late'}});
    assert.equal(aborts,1);
  },10,{launchBy:end-15900,abortBy:end-15000,retireBy:end,saveBy:end+1000});
  try{await assert.rejects(launched,error=>error.message==='audio-product-launch-timeout'&&!error.evidenceError);}
  finally{releaseWrite();}
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(aborts,1);
});

test('diagnostic retirement refuses pre-READY, helper-only, and foreign proof and reports evidence failure separately',async()=>{
  const {boundedProductLaunch}=await import('../scripts/check-product-audio.mjs');
  for(const mode of ['unformed','helper-only','foreign','sink']){
    const end=performance.now()+16000,primary=Error('launch-first');
    const expected=mode==='sink'?'CONFIRMED':'UNKNOWN';
    await assert.rejects(boundedProductLaunch(async ({observeRunJobOwner})=>{
      if(mode!=='unformed')observeRunJobOwner({binding,abort:async()=>mode==='helper-only'?undefined:{
        ...job(),aborted:true,binding:mode==='foreign'?{...binding,pid:44}:binding,
      }});
      throw primary;
    },async receipt=>{
      assert.equal(receipt.status,expected);
      assert.equal(receipt.firstError.message,'launch-first');
      assert.equal(receipt.job===null,expected==='UNKNOWN');
      if(mode==='sink')throw Error('reserved-write-failed');
    },50,{launchBy:end-15900,abortBy:end-15000,retireBy:end,saveBy:end+1000}),error=>error===primary&&
      (mode==='sink'?error.evidenceError?.message==='reserved-write-failed':error.evidenceError===undefined));
  }
});
for(const fault of ['record','connect','version','abort'])test('launcher preserves Job '+fault+' failure and retires only Job owner',async t=>{
  const f=await launcherFixture(fault);t.after(f.destroy);await assert.rejects(f.launch,error=>fault==='abort'?error.cause?.message==='connect-first'&&error.retirementError?.message==='abort-first':new RegExp(fault==='version'?'candidate-version':fault+'-first').test(error.message));
  assert.equal(f.events.filter(e=>e==='abort').length,1);
});

test('diagnostic monotonic cutoff rejects late launch, retirement and evidence independently',async t=>{
  const {boundedProductLaunch}=await import('../scripts/check-product-audio.mjs');
  let now=0;
  t.mock.method(performance,'now',()=>now);
  const bounds={launchBy:50,abortBy:1000,retireBy:16000,saveBy:17000};
  for(const mode of ['late-launch-error','late-retirement','late-evidence']){
    now=0;
    await assert.rejects(boundedProductLaunch(async ({observeRunJobOwner})=>{
      observeRunJobOwner({binding,abort:async()=>{
        if(mode==='late-retirement')now=bounds.retireBy;
        return {...job(),aborted:true};
      }});
      if(mode==='late-launch-error')now=51;
      throw Error('launch-first');
    },async receipt=>{
      if(mode==='late-launch-error'){
        assert.equal(receipt.firstError.message,'audio-product-launch-timeout');
        assert.equal(receipt.launchError.message,'launch-first');
      }
      if(mode==='late-retirement'){
        assert.equal(receipt.status,'UNKNOWN');
        assert.equal(receipt.retirementError.message,'audio-product-job-retirement-timeout');
        assert.deepEqual(receipt.unacceptedJob,{...job(),aborted:true});
      }
      if(mode==='late-evidence')now=bounds.saveBy;
    },50,bounds),error=>mode==='late-launch-error'?
      error.message==='audio-product-launch-timeout'&&error.evidenceError===undefined:
      error.message==='launch-first'&&(mode==='late-evidence'?
        error.evidenceError?.message==='audio-product-job-evidence-timeout':error.evidenceError===undefined));
  }
});

test('diagnostic records pending launch at cutoff without losing timely retirement',async t=>{
  const {boundedProductLaunch}=await import('../scripts/check-product-audio.mjs');
  let now=0,handed,aborted,rejectLaunch,receipt;
  t.mock.method(performance,'now',()=>now);
  t.mock.timers.enable({apis:['setTimeout']});
  const handoff=new Promise(resolve=>{handed=resolve;});
  const abortStarted=new Promise(resolve=>{aborted=resolve;});
  const launch=new Promise((_,reject)=>{rejectLaunch=reject;});
  const failed=assert.rejects(boundedProductLaunch(async ({observeRunJobOwner})=>{
    observeRunJobOwner({binding,abort:async()=>{aborted();return {...job(),aborted:true};}});
    handed();
    return launch;
  },async value=>{receipt=value;},50,{launchBy:50,abortBy:1000,retireBy:16000,saveBy:17000}),/launch-timeout/);
  await handoff;
  now=50;t.mock.timers.tick(50);
  await abortStarted;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(receipt,undefined);
  now=16000;t.mock.timers.tick(15950);
  await failed;
  assert.equal(receipt.launchState,'PENDING_AT_CUTOFF');
  assert.equal(receipt.status,'CONFIRMED');
  assert.equal(receipt.job.aborted,true);
  rejectLaunch(Error('after-observation'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(receipt.launchError,undefined);
});

async function syntheticTrialFixture(){
  const fs=require('node:fs'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
  const {PassThrough}=require('node:stream'),{transformSync}=require('esbuild');
  const support=await import('./fixtures/installed-extension/run-job-process-support.mjs');
  const entry=path.resolve('tests/run-job-process.integration.mjs'),source=fs.readFileSync(entry,'utf8');
  const main=source.lastIndexOf('\nif(process.argv[1]');
  assert.ok(main>0);
  const code=transformSync(source.slice(0,main)+'\nexport {startJob,controller};',
    {format:'cjs',target:'es2022',define:{'import.meta.url':JSON.stringify(pathToFileURL(entry).href)}}).code;
  const module={exports:{}},started=[],replies=[],processMock=new EventEmitter();
  const trialNonce='a'.repeat(64),write=new PassThrough(),read=new PassThrough();
  const trialBinding={...binding,executable:'C:\\trial\\fixture.exe'};
  write.on('data',bytes=>{if(String(bytes)==='PING\t'+trialNonce+'\n')read.write('ROOT\t42\t'+trialBinding.created+'\t'+trialNonce+'\n');});
  processMock.connected=true;processMock.platform='win32';processMock.arch='x64';processMock.send=value=>replies.push(value);
  let fileReads=0;
  vm.runInNewContext(code,{module,exports:module.exports,Buffer,Date:{now:()=>100000},performance:{now:()=>100},setTimeout,clearTimeout,
    process:processMock,require:name=>{
      if(name==='node:child_process')return {spawn(){assert.fail('real process launch');}};
      if(name==='node:fs/promises')return {lstat(){fileReads++;throw Error('mock-output-boundary');}};
      if(name.endsWith('/run-job-process-support.mjs'))return support;
      if(name.endsWith('/run-job.mjs'))return {launchRunJob:async(options,deps)=>{
        started.push({options,deps});return {binding:trialBinding,child:{stdio:[null,null,null,write,read]}};
      }};
      assert.ok(['node:path','node:url','node:crypto'].includes(name),name);
      return require(name);
    }});
  const args=(name,remaining=240000)=>['--case='+name,'--helper=C:\\trial\\owner.exe','--helper-sha256='+helper.sha256,
    '--fixture='+trialBinding.executable,'--fixture-sha256='+ 'b'.repeat(64),'--source-sha256='+ 'c'.repeat(64),
    '--node-sha256='+ 'd'.repeat(64),'--output=C:\\trial','--batch-deadline='+ (100000+remaining)];
  return {...module.exports,processMock,started,replies,trialNonce,args,parseSelection:support.parseSelection,
    fileReads:()=>fileReads,destroy:()=>{write.destroy();read.destroy();}};
}

test('the fixed console mode reaches direct rows and the real controller start handler independently of accounting',async t=>{
  const f=await syntheticTrialFixture();t.after(f.destroy);
  const selected=name=>f.parseSelection([...f.args(name),'--synthetic-root-console=detached-v1']);
  const accounting={};
  for(const name of ['pipe-exit','detached-abort','helper-death']){
    await f.startJob(selected(name),f.trialNonce,1000,name==='pipe-exit'?accounting:undefined);
  }
  const controller=f.controller(selected('controller-death'),f.trialNonce);
  controller.catch(error=>assert.fail(error.message));
  const receive=f.processMock.listeners('message')[0];
  assert.equal(typeof receive,'function');
  await receive({nonce:f.trialNonce,seq:1,op:'challenge',challenge:'b'.repeat(64)});
  await receive({nonce:f.trialNonce,seq:2,op:'start',remaining:900});
  assert.equal(f.replies.at(-1).op,'start');
  assert.equal(f.started.length,4);
  for(const [index,{deps}] of f.started.entries()){
    assert.equal(deps?.syntheticRootConsole,'detached-v1');
    assert.notEqual(deps.diagnoseJobMembers,true);
    assert.equal(deps.accounting,index===0?accounting:undefined);
  }
});

test('detached synthetic admission enforces the original 240s batch cap and full 60s row before files',async t=>{
  const f=await syntheticTrialFixture();t.after(f.destroy);
  const mode='--synthetic-root-console=detached-v1';
  for(const remaining of [59999,240001]){
    await assert.rejects(f.runTrial([...f.args('pipe-exit',remaining),mode]),/trial-batch-budget/);
  }
  assert.equal(f.fileReads(),0);
  for(const remaining of [60000,240000]){
    assert.equal((await f.runTrial([...f.args('pipe-exit',remaining),mode])).error,'mock-output-boundary');
  }
  assert.equal(f.fileReads(),2);
});

test('Gain4 pinned Job requires the exact component selection',async()=>{
  const {parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  const browser=['--browser-root='+selection.root,'--browser-manifest-sha256='+selection.manifestSha256];
  const runJob=['--shutdown-contract=run-job-v1','--job-helper='+helper.path,'--job-helper-sha256='+helper.sha256];
  for(const id of ['48000/gain/0.5','48000/gain/2','96000/gain/0.5','96000/gain/2']){
    const base=['--run-id=GainJobUnit','--case='+id,'--component-witness'];
    assert.deepEqual(parseProductAudioArgs([...base,...browser,...runJob]),{
      runId:'GainJobUnit',caseId:id,componentWitness:true,browserCandidate:selection,runJob:{contract:'run-job-v1',helper}});
    assert.deepEqual(parseProductAudioArgs(base),{runId:'GainJobUnit',caseId:id,componentWitness:true});
    for(const args of [[...base,...browser],[...base,...runJob],[...base.slice(0,2),...browser,...runJob],
      [...base,...browser,...runJob,'--sample-rate=44100'],[...base,...browser,...runJob,'--headroom-witness'],
      [...base,...browser,...runJob,'--master-witness'],[...base,...browser,...runJob,'--component-witness']])
      assert.throws(()=>parseProductAudioArgs(args),/audio-product-(args|browser-selection|shutdown-selection)/);
  }
  assert.throws(()=>parseProductAudioArgs(['--run-id=GainJobUnit','--case=44100/gain/2','--component-witness',...browser,...runJob]),
    /audio-product-browser-selection/);
});

test('Gain4 launcher refuses partial selection before provider access',async()=>{
  const {launchVisibilityBrowser}=await import('../scripts/extension-e2e/visibility-browser.mjs');
  const base={productCaseId:'48000/gain/0.5',productComponentWitness:true,browserCandidate:selection,
    runJob:{contract:'run-job-v1',helper},extensionPath:path.resolve('unit-extension'),recordRunJob:async()=>assert.fail('record launched')};
  for(const options of [{productComponentWitness:undefined},{runJob:undefined},{browserCandidate:undefined},
    {extensionPath:undefined},{productCaseId:'44100/gain/2'},{observeRunJobOwner:()=>assert.fail('observed owner')}])
    await assert.rejects(launchVisibilityBrowser({...base,...options}),{code:'visibility-job-selection'});
  await assert.rejects(launchVisibilityBrowser(base),{code:'visibility-launch-invalid'});
});

test('Gain4 installed runner retains selected Job and rejects a foreign component report',async()=>{
  const {runInstalledExtensionE2E}=await import('../scripts/check-installed-extension.mjs');
  const id='48000/gain/0.5',contract={contract:'run-job-v1',caseId:id,componentWitness:true,helper,browserCandidate:selection};
  const makeOptions=dependencies=>({runId:'GainJobUnit',qualification:'media-tab',retainEvidence:true,shutdownContract:contract,dependencies});
  let opened=0;
  await assert.rejects(runInstalledExtensionE2E({...makeOptions({openRepository:async()=>{opened++;}}),
    shutdownContract:{...contract,componentWitness:undefined},dependencies:{mediaScenario:async()=>{},openRepository:async()=>{opened++;}}}),
  /media-shutdown-selection-invalid/);
  assert.equal(opened,0);
  for(const fault of [null,'schema','profile','coverage','rate']){
    const f=runnerFixture(proof());
    f.dependencies.mediaScenario=async()=>({audioProduct:{
      scope:id,spec:{id,sampleRate:fault==='rate'?44100:48000},passed:true,
      schema:fault==='schema'?'f01-product-eq-observation-v1':'f01-product-eq-observation-v2',componentWitness:true,
      archive:{profile:fault==='profile'?'legacy':'equalizer-component',sampleRate:48000,
        coverage:fault==='coverage'?'contiguous-program2-source2-control5':'contiguous-program2-source2-control5-component2'}}});
    if(fault===null){
      const report=await runInstalledExtensionE2E(makeOptions(f.dependencies));
      assert.equal(report.ok,true);assert.deepEqual(report.shutdownSelection,{...contract,binding});
    }else await assert.rejects(runInstalledExtensionE2E(makeOptions(f.dependencies)),/media-job-component-invalid/);
    assert.deepEqual(f.events,['job-close','context-close']);
  }
});
