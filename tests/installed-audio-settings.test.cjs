const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=async()=>{assert.ok(fs.existsSync('scripts/check-installed-audio-settings.mjs'),'approved F01 installed settings runner must exist');return import('../scripts/check-installed-audio-settings.mjs');};
const source={sourceCommit:'a'.repeat(40),sourceSha256:'b'.repeat(64),lockSha256:'c'.repeat(64),manifestSha256:'d'.repeat(64),toolchainSha256:'e'.repeat(64)};
const nativeInputs=()=>({pointer:1,key:1,input:1,synthetic:0,total:3,overflow:false});
const report=()=>({ok:true,runId:'Settings1',qualification:'audio-settings',source:{...source},after:{...source},
  shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},profileRetained:true,candidateRetained:true,
  audioSettings:{passed:true,checks:['native-ui','two-windows','storage-authority','layout','original-target','preset-draft','input-focus','lifecycle'],lossControls:[],
    nativeInputs:[nativeInputs(),nativeInputs()],nativeWindows:[1,2],nativeTabWindows:[3,4],
    sameScope:{nativeFullRequests:2,heldDispatches:1,committedRevisionDelta:1,lateCode:'conflict',lateStored:false},
    lifecycle:{oneWindowClosed:true,remainingNativeSource:1,beforeHeap:100,afterHeap:90},quota:{actualQuotaFailure:true,bytesAtLimit:10485760},
    workerRestart:{actualWorkerReplacement:true,nativeStopped:true,nativeRunning:true,markerAbsent:true,beforeTimeOrigin:1000,afterTimeOrigin:2000,wrapperReused:true,targetReused:true},
    layout:{viewports:[1280,800,360].map(width=>({width,output:80,shell:580,bands:Array(8).fill(100),scrollable:width===360,overflow:false})),
      zoom:{actual:2,output:80,beforeDpr:1,afterDpr:2,beforeWidth:1280,afterWidth:640}}},pageErrors:[]});
test('settings runner rejects unsafe IDs unknown/duplicate flags controls and remote profiles before effects',async()=>{
  const {parseAudioSettingsArgs}=await load();assert.deepEqual(parseAudioSettingsArgs(['--run-id=Settings1']),{runId:'Settings1',headed:false,control:null});
  assert.deepEqual(parseAudioSettingsArgs(['--run-id=Loss1','--headed','--control=storage-loss']),{runId:'Loss1',headed:true,control:'storage-loss'});
  for(const args of [[],['--run-id=../bad'],['--run-id=A','--run-id=B'],['--run-id=A','--control=other'],['--run-id=A','--remote-port=9222'],['--run-id=A','--profile=user'],['--run-id=A','--headed','--headed']])assert.throws(()=>parseAudioSettingsArgs(args),/audio-settings-args/);
});
test('settings runner accepts only full exact observation source and three shutdown proofs',async()=>{
  const {assertAudioSettingsReport}=await load();assert.equal(assertAudioSettingsReport(report(),{runId:'Settings1',headed:false,control:null}).ok,true);
  for(const corrupt of [r=>{r.ok=false;},r=>{r.after.sourceSha256='f'.repeat(64);},r=>{r.shutdown.ownedRootClosed=false;},r=>{r.source.sourceCommit='dirty';},
    r=>{r.audioSettings.checks.pop();},r=>{r.audioSettings.checks.push('guessed');},r=>{r.pageErrors.push('error');},r=>{r.candidateRetained=false;}]){
    const r=report();corrupt(r);assert.throws(()=>assertAudioSettingsReport(r,{runId:'Settings1',headed:false,control:null}),/audio-settings-proof/);
  }
});
test('native evidence cannot be replaced by zero counts guessed zoom or missing worker and window observations',async()=>{
  const {assertAudioSettingsReport}=await load();
  for(const corrupt of [r=>{r.audioSettings.nativeInputs[0].input=0;},r=>{r.audioSettings.nativeInputs[1].overflow=true;},r=>{r.audioSettings.lifecycle.beforeHeap=0;},
    r=>{r.audioSettings.workerRestart.actualWorkerReplacement=false;},r=>{r.audioSettings.workerRestart.nativeStopped=false;},r=>{r.audioSettings.nativeWindows=[1,1];},r=>{r.audioSettings.layout.zoom.actual=1;},
    r=>{r.audioSettings.quota.actualQuotaFailure=false;}]){
    const r=report();corrupt(r);assert.throws(()=>assertAudioSettingsReport(r,{runId:'Settings1',headed:false,control:null}),/audio-settings-proof/);
  }
});
test('worker restart proves a fresh native execution realm even when the browser reuses its wrapper and target',async()=>{
  const {assertAudioSettingsReport}=await load(),options={runId:'Settings1',headed:false,control:null};
  assert.equal(assertAudioSettingsReport(report(),options).ok,true);
  for(const mutate of [r=>{r.audioSettings.workerRestart.markerAbsent=false;},r=>{r.audioSettings.workerRestart.afterTimeOrigin=1000;},
    r=>{r.audioSettings.workerRestart.afterTimeOrigin=NaN;},r=>{r.audioSettings.workerRestart.nativeRunning=false;},r=>{delete r.audioSettings.workerRestart.wrapperReused;}]){
    const r=report();mutate(r);assert.throws(()=>assertAudioSettingsReport(r,options),/audio-settings-proof/);
  }
});

test('same-scope full request race requires two real senders one delayed dispatch and an exact late conflict',async()=>{
  const {assertAudioSettingsReport}=await load();
  for(const mutate of [r=>{r.audioSettings.sameScope.nativeFullRequests=1;},r=>{r.audioSettings.sameScope.heldDispatches=2;},
    r=>{r.audioSettings.sameScope.lateCode='timeout';},r=>{r.audioSettings.sameScope.committedRevisionDelta=2;},r=>{r.audioSettings.sameScope.lateStored=true;}]){
    const r=report();mutate(r);assert.throws(()=>assertAudioSettingsReport(r,{runId:'Settings1',headed:false,control:null}),/audio-settings-proof/);
  }
});

test('reported zoom without actual browser pixel-ratio and layout scaling is not a 200 percent proof',async()=>{
  const {assertAudioSettingsReport}=await load();
  for(const mutate of [r=>{r.audioSettings.layout.zoom.afterDpr=1;},r=>{r.audioSettings.layout.zoom.afterWidth=1280;},
    r=>{delete r.audioSettings.layout.zoom.beforeDpr;}]){
    const r=report();mutate(r);assert.throws(()=>assertAudioSettingsReport(r,{runId:'Settings1',headed:false,control:null}),/audio-settings-proof/);
  }
});

test('negative mode requires four exact field witnesses rather than a timeout or invented expected value',async()=>{
  const {assertAudioSettingsReport}=await load(),make=()=>{
    const r=report();r.audioSettings.passed=false;
    r.audioSettings.lossControls=[['owned-gain','config.audioGain',0],['inherit-bit','config.gainInherited',false],['eq-band','config.eq125',1.25],
      ['preset-id','mediaProfiles.presets[0].id','11111111-1111-4111-8111-111111111111']].map(([caseId,path,expected])=>({caseId,code:'f01-storage-loss-'+caseId,
        phase:'storage-readback',matched:true,rawDiff:[{path,expected,actual:'missing'}]}));return r;
  };
  const options={runId:'Settings1',headed:false,control:'storage-loss'};assert.equal(assertAudioSettingsReport(make(),options).ok,true);
  for(const mutate of [r=>{r.audioSettings.lossControls[0].code='timeout';},r=>{r.audioSettings.lossControls[0].rawDiff[0].path='other';},r=>{r.audioSettings.lossControls[0].rawDiff[0].expected=99;}]){
    const r=make();mutate(r);assert.throws(()=>assertAudioSettingsReport(r,options),/audio-settings-proof/);
  }
});
test('settings scenario timeout is a failure and clears its own timer on early completion',async()=>{
  const {boundedAudioScenario}=await load();assert.equal(await boundedAudioScenario(async()=>17,20),17);
  await assert.rejects(boundedAudioScenario(()=>new Promise(()=>{}),5),/audio-settings-timeout/);
});
test('settings wrapper validates the shared Native executor result and never starts on invalid options',async()=>{
  const {runInstalledAudioSettings}=await load();let calls=0;
  const execute=async options=>{calls++;assert.equal(options.qualification,'audio-settings');assert.equal(typeof options.dependencies.mediaScenario,'function');return report();};
  const result=await runInstalledAudioSettings({runId:'Settings1',headed:false,control:null},execute);assert.equal(result.ok,true);assert.equal(calls,1);
  await assert.rejects(runInstalledAudioSettings({runId:'../bad',headed:false,control:null},execute),/audio-settings-args/);assert.equal(calls,1);
});
test('shared Native asset pin requires exactly the published table plus four F00/F01 resources',async()=>{
  const module=await import('../scripts/check-installed-extension.mjs');assert.equal(typeof module.expectedF01MediaFiles,'function');
  const {openOwnedRoot}=await import('../scripts/owned-files.mjs');const files=await module.expectedF01MediaFiles(await openOwnedRoot(process.cwd()));
  assert.equal(files.length,62);assert.equal(new Set(files).size,62);
  for(const file of ['dist/media-profiles.js','dist/gain-authority.js','dist/web/player-gain.js','dist/audio-settings-ui.js'])assert.ok(files.includes(file));
  await assert.rejects(module.expectedF01MediaFiles({readFile:async()=>JSON.stringify([{name:'not-attested'}])}),/published-payload-metadata/);
});
test('Native source attestation rejects a required untracked runner even when ordinary status is clean',async t=>{
  const files=require('node:fs/promises'),path=require('node:path'),{spawnSync}=require('node:child_process');
  const root=await files.mkdtemp(path.resolve('output/f01-source-proof-'));t.after(()=>files.rm(root,{recursive:true,force:true}));
  function git(args){const result=spawnSync('git',['-C',root,...args],{encoding:'utf8',timeout:15000});assert.ifError(result.error);assert.equal(result.status,0,result.stderr);}
  git(['init','--quiet']);await files.mkdir(path.join(root,'scripts'));
  for(const name of ['package-lock.json','manifest.json','scripts/check-toolchain.mjs'])await files.writeFile(path.join(root,name),'{}\n');
  git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','fixture']);
  await files.writeFile(path.join(root,'native-input.mjs'),'void 0;\n');
  const {openOwnedRoot}=await import('../scripts/owned-files.mjs'),{sourceAttestation}=await import('../scripts/check-installed-transition.mjs');
  const owned=await openOwnedRoot(root);await assert.rejects(sourceAttestation(owned,['native-input.mjs']),{code:'transition-input-untracked'});
  git(['add','native-input.mjs']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','tracked native input']);
  const proof=await sourceAttestation(owned,['native-input.mjs']);assert.match(proof.sourceCommit,/^[a-f0-9]{40}$/);assert.match(proof.sourceSha256,/^[a-f0-9]{64}$/);
});
test('storage loss control matches only one pinned field loss and no unrelated error or difference',async()=>{
  const {matchAudioStorageLoss}=await load();assert.equal(typeof matchAudioStorageLoss,'function');
  const before={config:{audioGain:0,gainInherited:false,eq125:1.25},mediaProfiles:{presets:[{id:'11111111-1111-4111-8111-111111111111',name:'Kept'}]},sentinel:'keep'};
  for(const [caseId,remove,path]of [
    ['owned-gain',raw=>delete raw.config.audioGain,'config.audioGain'],['inherit-bit',raw=>delete raw.config.gainInherited,'config.gainInherited'],
    ['eq-band',raw=>delete raw.config.eq125,'config.eq125'],['preset-id',raw=>delete raw.mediaProfiles.presets[0].id,'mediaProfiles.presets[0].id']]){
    const after=structuredClone(before);remove(after);const result=matchAudioStorageLoss(before,after,caseId);
    assert.equal(result.code,'f01-storage-loss-'+caseId);assert.equal(result.phase,'storage-readback');assert.equal(result.rawDiff[0].path,path);
    assert.equal(matchAudioStorageLoss(before,before,caseId),null);after.sentinel='different';assert.equal(matchAudioStorageLoss(before,after,caseId),null);
  }
  assert.equal(matchAudioStorageLoss(before,{},'unrelated'),null);
});
