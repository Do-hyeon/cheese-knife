const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=async()=>{assert.ok(fs.existsSync('scripts/check-installed-audio-settings.mjs'),'approved F01 installed settings runner must exist');return import('../scripts/check-installed-audio-settings.mjs');};
const source={sourceCommit:'a'.repeat(40),sourceSha256:'b'.repeat(64),lockSha256:'c'.repeat(64),manifestSha256:'d'.repeat(64),toolchainSha256:'e'.repeat(64)};
const nativeInputs=()=>({pointer:1,key:1,input:1,synthetic:0,total:3,overflow:false});
const completeObservation=()=>({schema:'f01-audio-settings-observation-v1',limits:{pages:32,events:256,prefixCharacters:240,bytes:1048576,gainEvents:128},complete:true,detached:true,shutdownConfirmed:true,pages:[{id:0,closed:true},{id:1,closed:true}],events:[1,0].map((pageId,i)=>({order:i+1,pageId,phase:pageId===1?'scenario':'shutdown',kind:'close',level:null,code:null,prefixSha256:null,characters:0,truncated:false})),inputs:{settings:{pageId:0,counts:nativeInputs()},other:{pageId:1,counts:nativeInputs()}},gainDraft:null,pageErrorCount:0,dropped:0,faults:[]});
const candidateRows=()=>[{file:'dist/module.js',bytes:15,sha256:'f'.repeat(64)}];
const report=()=>({audioSettingsNormal:null,audioSettingsCandidate:{before:candidateRows(),after:candidateRows()},audioSettingsTrace:{file:'output/playwright/installed-extension-Settings1/trace.zip',attempted:true,stopAcknowledged:true},audioSettingsObservation:completeObservation(),ok:true,runId:'Settings1',qualification:'audio-settings',source:{...source},after:{...source},
  shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true},profileRetained:true,candidateRetained:true,
  audioSettings:{passed:true,checks:['native-ui','two-windows','storage-authority','layout','original-target','preset-draft','input-focus','lifecycle'],lossControls:[],
    presetEntry:{emptyFirstOpen:true,saveAsNameFocused:true,pairLegacyLimited:true,rawPreserved:true},
    nativeInputs:[nativeInputs(),nativeInputs()],nativeWindows:[1,2],nativeTabWindows:[3,4],
    sameScope:{nativeFullRequests:2,heldDispatches:1,committedRevisionDelta:1,lateCode:'conflict',lateStored:false},
    aba:{nativeFullRequests:1,nativePatchRequests:2,heldDispatches:1,committedRevisionDelta:2,valuesRestored:true,lateCode:'conflict',lateStored:false},
    unrelatedMerge:{nativeRequests:2,nativeDocumentsDistinct:true,globalRevisionDelta:2,mediaUnchanged:true,unknownRawPreserved:true,styleEnabled:true,eqValue:.5},
    lifecycle:{oneWindowClosed:true,remainingNativeSource:1,beforeHeap:100,afterHeap:90,hiddenObserved:true,visibleRestored:true,closedNativeMissing:true,
      closedReplyStage:'read',closedReplyCode:'settings-operation-failed',closedUiDisabled:true},quota:{actualQuotaFailure:true,bytesAtLimit:10485760},
    workerRestart:{actualWorkerReplacement:true,nativeStopped:true,nativeRunning:true,markerAbsent:true,beforeTimeOrigin:1000,afterTimeOrigin:2000,wrapperReused:true,targetReused:true},
    layout:{viewports:[1280,800,360].map(width=>({width,output:80,shell:580,bands:Array(8).fill(100),scrollable:width===360,overflow:false})),
      zoom:{actual:2,output:80,beforeDpr:1,afterDpr:2,beforeWidth:1280,afterWidth:640,overflow:false,bands:Array(8).fill(100),shell:580}}},pageErrors:[]});
test('settings runner rejects unsafe IDs unknown/duplicate flags controls and remote profiles before effects',async()=>{
  const {parseAudioSettingsArgs}=await load();assert.deepEqual(parseAudioSettingsArgs(['--run-id=Settings1']),{runId:'Settings1',headed:false,control:null});
  assert.deepEqual(parseAudioSettingsArgs(['--run-id=Loss1','--headed','--control=storage-loss','--normal-run-id=Normal1']),{runId:'Loss1',headed:true,control:'storage-loss',normalRunId:'Normal1'});
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
test('minor UI evidence requires actual empty creation focus and limited target observations',async()=>{
  const {assertAudioSettingsReport}=await load();
  for(const key of ['emptyFirstOpen','saveAsNameFocused','pairLegacyLimited','rawPreserved']){
    const r=report();r.audioSettings.presetEntry[key]=false;
    assert.throws(()=>assertAudioSettingsReport(r,{runId:'Settings1',headed:false,control:null}),/audio-settings-proof/);
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
test('explicit ABA and unrelated style merge require their own native witnesses, not a single CAS pass',async()=>{
  const {assertAudioSettingsReport}=await load(),options={runId:'Settings1',headed:false,control:null};
  for(const mutate of [r=>{delete r.audioSettings.aba;},r=>{r.audioSettings.aba.nativePatchRequests=0;},r=>{r.audioSettings.aba.committedRevisionDelta=1;},
    r=>{r.audioSettings.aba.valuesRestored=false;},r=>{r.audioSettings.aba.lateCode='timeout';},r=>{r.audioSettings.aba.lateStored=true;},
    r=>{delete r.audioSettings.unrelatedMerge;},r=>{r.audioSettings.unrelatedMerge.nativeDocumentsDistinct=false;},r=>{r.audioSettings.unrelatedMerge.globalRevisionDelta=1;},
    r=>{r.audioSettings.unrelatedMerge.mediaUnchanged=false;},r=>{r.audioSettings.unrelatedMerge.unknownRawPreserved=false;}]){
    const r=report();mutate(r);assert.throws(()=>assertAudioSettingsReport(r,options),/audio-settings-proof/);
  }
});
test('a closed original target requires native disappearance and rejection while its own settings UI is still alive',async()=>{
  const {assertAudioSettingsReport}=await load(),options={runId:'Settings1',headed:false,control:null};
  for(const mutate of [r=>{r.audioSettings.lifecycle.closedNativeMissing=false;},r=>{r.audioSettings.lifecycle.closedReplyCode='timeout';},
    r=>{r.audioSettings.lifecycle.closedReplyStage='unknown';},r=>{r.audioSettings.lifecycle.closedUiDisabled=false;},r=>{r.audioSettings.lifecycle.hiddenObserved=false;},
    r=>{r.audioSettings.lifecycle.visibleRestored=false;}]){
    const r=report();mutate(r);assert.throws(()=>assertAudioSettingsReport(r,options),/audio-settings-proof/);
  }
});

test('reported zoom without actual browser pixel-ratio and layout scaling is not a 200 percent proof',async()=>{
  const {assertAudioSettingsReport}=await load();
  for(const mutate of [r=>{r.audioSettings.layout.zoom.afterDpr=1;},r=>{r.audioSettings.layout.zoom.afterWidth=1280;},
    r=>{delete r.audioSettings.layout.zoom.beforeDpr;},r=>{r.audioSettings.layout.zoom.overflow=true;},r=>{r.audioSettings.layout.zoom.bands[7]=1010;}]){
    const r=report();mutate(r);assert.throws(()=>assertAudioSettingsReport(r,{runId:'Settings1',headed:false,control:null}),/audio-settings-proof/);
  }
});

test('negative mode requires four exact field witnesses rather than a timeout or invented expected value',async()=>{
  const {assertAudioSettingsReport}=await load(),make=lossReport;
  const options={runId:'Settings1',headed:false,control:'storage-loss',normalRunId:'Normal1'};assert.equal(assertAudioSettingsReport(make(),options).ok,true);
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
  git(['init','--quiet']);await files.mkdir(path.join(root,'scripts'));await files.mkdir(path.join(root,'extension'));
  for(const name of ['package-lock.json','extension/manifest.json','scripts/check-toolchain.mjs'])await files.writeFile(path.join(root,name),'{}\n');
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

function lossControlFixture(hook=()=>{}){
  const vm=require('node:vm'),before={config:{audioGain:0,gainInherited:false,eq125:1.25},mediaProfiles:{presets:[{id:'11111111-1111-4111-8111-111111111111',name:'Kept'}]},sentinel:'keep'},raw=structuredClone(before),calls=[];let caseId=null,restoring=false;
  const chrome={storage:{local:{get:async()=>structuredClone(raw),set:async patch=>{Object.assign(raw,structuredClone(patch));}}}};
  const worker={evaluate:async(fn,arg)=>{
    const phase=typeof arg==='string'?'inject':arg===undefined?(restoring?'restored-read':'read'):'restore';
    if(phase==='inject'){caseId=arg;restoring=false;}if(phase==='restore')restoring=true;
    calls.push({phase,caseId});hook(phase,caseId,raw);
    return structuredClone(await vm.runInNewContext('('+fn.toString()+')(argument)',{chrome,argument:structuredClone(arg),Error}));
  }};
  return {worker,raw,before,calls};
}

test('storage loss controls run the existing four actual mutations and exact restoration readbacks once',async()=>{
  const {lossControls}=await load();assert.equal(typeof lossControls,'function');const f=lossControlFixture(),rows=await lossControls(f);
  const expected=['owned-gain','inherit-bit','eq-band','preset-id'];assert.deepEqual(rows.map(r=>r.caseId),expected);assert.deepEqual(f.calls.filter(r=>r.phase==='inject').map(r=>r.caseId),expected);assert.equal(f.calls.filter(r=>r.phase==='restore').length,4);assert.equal(f.calls.filter(r=>r.phase==='restored-read').length,4);assert.deepEqual(f.raw,f.before);
});

test('storage loss primary failures including frozen and falsy causes are restored, verified and never swallowed',async()=>{
  const {lossControls}=await load();assert.equal(typeof lossControls,'function');
  for(const primary of [Object.freeze(Error('original-frozen')), 'primitive', undefined, null, 0]){
    const f=lossControlFixture(phase=>{if(phase==='inject')throw primary;});
    await assert.rejects(()=>lossControls(f),e=>e===primary);assert.equal(f.calls.filter(r=>r.phase==='inject').length,1);assert.equal(f.calls.filter(r=>r.phase==='restore').length,1);assert.equal(f.calls.filter(r=>r.phase==='restored-read').length,1);assert.deepEqual(f.raw,f.before);
  }
});

for(const at of ['owned-gain','inherit-bit','eq-band','preset-id'])test('storage loss '+at+' keeps primary and failed restoration and never starts its suffix',async()=>{
  const {lossControls}=await load();assert.equal(typeof lossControls,'function');const primary=Object.freeze(Object.assign(Error('original-'+at),{code:'PRIMARY',secret:'omit'})),restoration=Object.freeze(Object.assign(Error('restore-'+at),{code:'RESTORE',secret:'omit'}));
  const f=lossControlFixture((phase,id)=>{if(id===at&&phase==='inject')throw primary;if(id===at&&phase==='restore')throw restoration;});
  await assert.rejects(()=>lossControls(f),e=>e.code==='audio-settings-loss-control-failed'&&e.cause===primary&&e.restorationError===restoration);
  const injections=f.calls.filter(r=>r.phase==='inject');assert.equal(injections.at(-1).caseId,at);assert.equal(injections.length,['owned-gain','inherit-bit','eq-band','preset-id'].indexOf(at)+1);assert.equal(Object.hasOwn(primary,'restorationError'),false);
});

test('storage loss checks restoration despite primary failure and preserves a mismatched readback as additional failure',async()=>{
  const {lossControls}=await load();assert.equal(typeof lossControls,'function');const primary=Error('original-read'),f=lossControlFixture((phase,_id,raw)=>{if(phase==='read'&&Object.hasOwn(raw.config,'audioGain')===false)throw primary;if(phase==='restored-read')raw.config.gainInherited=true;});
  await assert.rejects(()=>lossControls(f),e=>e.cause===primary&&e.restorationError?.code==='audio-settings-loss-restore');assert.equal(f.calls.filter(r=>r.phase==='inject').length,1);assert.equal(f.calls.filter(r=>r.phase==='restored-read').length,1);
});

test('storage loss restoration-only set or read errors remain the original failure and stop once',async()=>{
  const {lossControls}=await load();assert.equal(typeof lossControls,'function');
  for(const phase of ['restore','restored-read']){const original=Error(phase+'-failed'),f=lossControlFixture(p=>{if(p===phase)throw original;});await assert.rejects(()=>lossControls(f),e=>e===original);assert.equal(f.calls.filter(r=>r.phase==='inject').length,1);assert.equal(f.calls.filter(r=>r.phase==='restore').length,1);}
});

test('storage loss dual failure with undefined primary still fails and exposes the restoration error',async()=>{
  const {lossControls}=await load();assert.equal(typeof lossControls,'function');const restore=Error('restore-only-visible'),f=lossControlFixture(phase=>{if(phase==='inject')throw undefined;if(phase==='restore')throw restore;});
  await assert.rejects(()=>lossControls(f),e=>e.code==='audio-settings-loss-control-failed'&&Object.hasOwn(e,'cause')&&e.cause===undefined&&e.restorationError===restore);
});

test('storage loss keeps the actual unmatched-field diagnostic when restoring the original storage also fails',async()=>{
  const {lossControls}=await load(),restoration=Error('restore-rejected'),f=lossControlFixture((phase,id,raw)=>{if(phase==='read'&&id)raw.config.unexpected='wrong';if(phase==='restore')throw restoration;});
  await assert.rejects(()=>lossControls(f),e=>e.code==='audio-settings-loss-control-failed'&&e.cause?.code==='audio-settings-loss-unmatched'&&e.restorationError===restoration);assert.equal(f.calls.filter(r=>r.phase==='inject').length,1);
});

function windowClosureFixture({closeAfter=2,alreadyClosed=false,removeError,focusError}={}){
  const vm=require('node:vm');let removes=0,polls=0,focuses=0,closed=alreadyClosed;
  const second={isClosed:()=>true},other={isClosed(){if(!removes)return closed;polls++;if(polls>=closeAfter)closed=true;return closed;}},first={bringToFront:async()=>{focuses++;assert.equal(closed,true,'survivor cannot be resumed on an already closed broadcast tab witness');if(focusError)throw focusError;}};
  const worker={evaluate:async(fn,id)=>vm.runInNewContext('('+fn.toString()+')(id)',{id,chrome:{windows:{remove:async actual=>{assert.equal(actual,22);removes++;if(removeError)throw removeError;}}}})};
  return {worker,first,state:{second,other,secondTab:{id:2,windowId:22}},counts:()=>({removes,polls,focuses})};
}

test('window closure waits for the live settings page despite its broadcast tab already being closed',async()=>{
  const {closeSecondAudioWindow}=await load();assert.equal(typeof closeSecondAudioWindow,'function');const f=windowClosureFixture();
  await closeSecondAudioWindow(f.worker,f.first,f.state);assert.deepEqual(f.counts(),{removes:1,polls:2,focuses:1});
});

test('window closure never borrows a settings page that was already closed before removal',async()=>{
  const {closeSecondAudioWindow}=await load();assert.equal(typeof closeSecondAudioWindow,'function');const f=windowClosureFixture({alreadyClosed:true});
  await assert.rejects(()=>closeSecondAudioWindow(f.worker,f.first,f.state),{code:'audio-settings-second-window-unobserved'});assert.deepEqual(f.counts(),{removes:0,polls:0,focuses:0});
});

test('window closure keeps the original 15 second polling deadline and never resumes the survivor on a permanently open page',async()=>{
  const {closeSecondAudioWindow}=await load();assert.equal(typeof closeSecondAudioWindow,'function');const f=windowClosureFixture({closeAfter:Infinity}),now=Date.now,timer=global.setTimeout;let clock=1000;
  Date.now=()=>clock;global.setTimeout=(fn,ms,...args)=>ms===25?timer(()=>{clock+=ms;fn(...args);},0):timer(fn,ms,...args);
  try{await assert.rejects(()=>closeSecondAudioWindow(f.worker,f.first,f.state),{code:'audio-settings-second-window-open'});}
  finally{Date.now=now;global.setTimeout=timer;}
  assert.deepEqual(f.counts(),{removes:1,polls:600,focuses:0});assert.equal(clock,16000);
});

for(const kind of ['remove','focus'])test('window closure preserves '+kind+' failure without retry or a passing lifecycle',async()=>{
  const {closeSecondAudioWindow}=await load();assert.equal(typeof closeSecondAudioWindow,'function');const error=Object.freeze(Error(kind+'-failed')),f=windowClosureFixture({closeAfter:1,...(kind==='remove'?{removeError:error}:{focusError:error})});
  await assert.rejects(()=>closeSecondAudioWindow(f.worker,f.first,f.state),e=>e===error);assert.deepEqual(f.counts(),{removes:1,polls:kind==='remove'?0:1,focuses:kind==='remove'?0:1});
});

function observationContext(){
  const {EventEmitter}=require('node:events'),context=new EventEmitter(),pages=[];context.pages=()=>pages;
  context.add=(existing=false)=>{const page=new EventEmitter();page.isClosed=()=>false;pages.push(page);if(!existing)context.emit('page',page);return page;};return context;
}

test('R5 observation owns existing and new pages and retains redacted logs and proof after closure',async()=>{
  const {createAudioSettingsObservation}=await load();assert.equal(typeof createAudioSettingsObservation,'function');const c=observationContext(),first=c.add(true),o=createAudioSettingsObservation(c),other=c.add();
  first.emit('console',{type:()=> 'log',text:()=> 'account secret token=https://private.invalid'});other.emit('pageerror',Error('secret page error'));
  const counts=nativeInputs();o.input(first,'settings',counts);o.input(other,'other',counts);counts.pointer=99;other.emit('close');o.endScenario();first.emit('close');const r=o.finish(true);
  assert.equal(r.complete,true);assert.equal(r.pageErrorCount,1);assert.equal(r.inputs.other.counts.pointer,1);assert.equal(r.pages[1].closed,true);assert.equal(r.events[0].code,null);assert.equal(JSON.stringify(r).includes('secret'),false);assert.equal(JSON.stringify(r).includes('private.invalid'),false);assert.equal(c.listenerCount('page'),0);assert.equal(other.listenerCount('console'),0);
  first.emit('pageerror',Error('late'));o.input(first,'settings',nativeInputs());assert.deepEqual(o.finish(false),r);
});

test('R5 observation bounds event/page floods and rejects late or reused proof while keeping formed prefix',async()=>{
  const {createAudioSettingsObservation}=await load();assert.equal(typeof createAudioSettingsObservation,'function');const c=observationContext(),a=c.add(true),o=createAudioSettingsObservation(c);
  for(let i=0;i<300;i++)a.emit('console',{type:()=> 'log',text:()=> 'x'.repeat(1000)});for(let i=0;i<40;i++)c.add();o.endScenario();o.input(a,'settings',nativeInputs());const r=o.finish(false);
  assert.ok(r.events.length<=256);assert.ok(r.pages.length<=32);assert.equal(r.complete,false);assert.equal(r.inputs.settings,null);assert.ok(r.faults.includes('event-bound'));assert.ok(r.faults.includes('page-bound'));assert.ok(Buffer.byteLength(JSON.stringify(r))<=1048576);assert.equal(c.listenerCount('page'),0);
});

test('R5 observation detaches every page despite partial attach and detach failures',async()=>{
  const {createAudioSettingsObservation}=await load();assert.equal(typeof createAudioSettingsObservation,'function');const c=observationContext(),a=c.add(true),b=c.add(true),original=a.on.bind(a),off=a.off.bind(a);
  a.on=(kind,fn)=>{if(kind==='console')throw Error('attach');return original(kind,fn);};const o=createAudioSettingsObservation(c);a.off=(kind,fn)=>{off(kind,fn);if(kind==='console')throw Error('detach');return a;};const r=o.finish(false);
  assert.equal(r.complete,false);assert.ok(r.faults.includes('attach'));assert.ok(r.faults.includes('detach'));assert.equal(b.listenerCount('pageerror'),0);assert.equal(c.listenerCount('page'),0);
});

test('R5 report rejects missing, incomplete, transplanted or inconsistent observation proof',async()=>{
  const {assertAudioSettingsReport}=await load();for(const change of [r=>delete r.audioSettingsObservation,r=>r.audioSettingsObservation.complete=false,r=>r.audioSettingsObservation.shutdownConfirmed=false,r=>r.audioSettingsObservation.inputs.other.pageId=0,r=>r.audioSettingsObservation.inputs.other.counts.pointer=2,r=>r.audioSettingsObservation.pages[0].closed=false,r=>r.audioSettingsObservation.events[0].pageId=3,r=>r.audioSettingsObservation.rawStorage={secret:'omit'},r=>r.audioSettingsObservation.pageErrorCount=1]){const r=report();change(r);assert.throws(()=>assertAudioSettingsReport(r,{runId:'Settings1',headed:false,control:null}),/audio-settings-proof/);}
});

test('R5 pending gain diagnostics never postpone the primary failure and cannot mutate a finalized snapshot',async()=>{
  const {createAudioSettingsObservation,retainGainDraftFailure}=await load(),c=observationContext(),page=c.add(true),o=createAudioSettingsObservation(c);let release,reads=0;
  page.evaluate=()=>{reads++;return new Promise(resolve=>{release=resolve;});};const worker={evaluate:async()=>({})},primary=Object.freeze(Error('original-gain-failed'));
  await assert.rejects(async()=>{assert.equal(retainGainDraftFailure({observation:o,worker},page,.5),undefined);throw primary;},e=>e===primary);assert.equal(reads,1);o.endScenario();page.emit('close');const r=o.finish(true);assert.equal(r.gainDraft.status,'pending');assert.equal(r.complete,false);assert.ok(r.faults.includes('gain-draft-pending'));
  release([]);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(o.finish(true),r);
});

test('R5 already requested gain diagnostics recover bounded safe fields during shutdown without raw settings',async()=>{
  const {createAudioSettingsObservation,retainGainDraftFailure}=await load(),c=observationContext(),page=c.add(true),o=createAudioSettingsObservation(c);let release;
  page.evaluate=()=>new Promise(resolve=>{release=resolve;});const worker={evaluate:async()=>({mediaProfiles:{channels:[{channelId:'d'.repeat(32),audio:{values:{audioGain:.5,gainInherited:false,secret:'settings-secret'}}}]}})};
  retainGainDraftFailure({observation:o,worker},page,.5);o.endScenario();release([{time:2,type:'input-after',value:'0.5',phase:'ready',output:'50%',focused:true,secret:'event-secret'}]);await new Promise(resolve=>setImmediate(resolve));page.emit('close');const r=o.finish(true);
  assert.equal(r.gainDraft.status,'recovered');assert.equal(r.gainDraft.gain,.5);assert.equal(r.gainDraft.events[0].output,50);assert.equal(JSON.stringify(r).includes('secret'),false);
});

test('R5 diagnostic read failures and late starts remain unavailable without new reads after the scenario',async()=>{
  const {createAudioSettingsObservation,retainGainDraftFailure}=await load(),c=observationContext(),page=c.add(true),o=createAudioSettingsObservation(c);let reads=0;
  page.evaluate=async()=>{reads++;throw Error('private diagnostic error');};const worker={evaluate:async()=>({})};retainGainDraftFailure({observation:o,worker},page,1);await new Promise(resolve=>setImmediate(resolve));o.endScenario();retainGainDraftFailure({observation:o,worker},page,1);page.emit('close');const r=o.finish(false);
  assert.equal(reads,1);assert.equal(r.gainDraft.status,'unavailable');assert.ok(r.faults.includes('gain-draft-read'));assert.equal(JSON.stringify(r).includes('private diagnostic'),false);
});

test('R5 observation rejects reused roles and unreadable events without consulting URL or console args',async()=>{
  const {createAudioSettingsObservation}=await load(),c=observationContext(),page=c.add(true),o=createAudioSettingsObservation(c);page.url=()=>{throw Error('must not read URL');};
  o.input(page,'settings',nativeInputs());o.input(page,'other',nativeInputs());page.emit('console',{type:()=> 'error',text:()=> 'unknown secret',args:()=>{throw Error('must not read args');}});page.emit('console',{type(){throw Error('read-failed');}});page.emit('close');const r=o.finish(true);
  assert.equal(r.complete,false);assert.ok(r.faults.includes('input'));assert.ok(r.faults.includes('read-event'));assert.equal(r.events[0].prefixSha256,require('node:crypto').createHash('sha256').update('unknown secret').digest('hex'));assert.equal(JSON.stringify(r).includes('unknown secret'),false);
});

test('R5 observation binds the claimed scenario window closure and never accepts proof first supplied after close',async()=>{
  const {assertAudioSettingsReport,createAudioSettingsObservation}=await load(),r=report();r.audioSettingsObservation.events.find(e=>e.kind==='close'&&e.pageId===1).phase='shutdown';assert.throws(()=>assertAudioSettingsReport(r,{runId:'Settings1',headed:false,control:null}),/audio-settings-proof/);
  const c=observationContext(),page=c.add(true),o=createAudioSettingsObservation(c);page.emit('close');o.input(page,'other',nativeInputs());const saved=o.finish(true);assert.equal(saved.inputs.other,null);assert.ok(saved.faults.includes('input'));
});


test('R5 gain diagnostic retains only the original bounded decimal language',async()=>{
  const {createAudioSettingsObservation}=await load();
  for(const [value,expected]of [['0',0],['-0',-0],['001',1],['-2.50',-2.5],['50%',50],['-0.5%',-.5],['1'.repeat(32),Number('1'.repeat(32))],['',null],['.5',null],['1.',null],['+1',null],['1e2',null],[' 1',null],['1 ',null],['1..2',null],['1%%',null],['%1',null],['NaN',null],['Infinity',null],['1'.repeat(33),null]]){
    const c=observationContext(),page=c.add(true),o=createAudioSettingsObservation(c);assert.equal(o.beginGainDraft(page,1),true);
    o.gainDraft(page,[{time:1,type:'render',value,output:value,phase:'ready',focused:false}],{audioGain:1,gainInherited:false});page.emit('close');const r=o.finish(false);
    assert.equal(r.gainDraft.status,expected===null?'unavailable':'recovered',value);
    if(expected!==null){assert.equal(r.gainDraft.events[0].value,expected);assert.equal(r.gainDraft.events[0].output,expected);}
  }
});


test('R5 stored success requires matching canonical candidate disk endpoints',async()=>{
  const {assertAudioSettingsReport}=await load();
  for(const mutate of [r=>{delete r.audioSettingsCandidate;},r=>{r.audioSettingsCandidate.after=null;},r=>{r.audioSettingsCandidate.after[0].sha256='a'.repeat(64);},r=>{r.audioSettingsCandidate.before=[];r.audioSettingsCandidate.after=[];},r=>{r.audioSettingsCandidate.before[0].bytes=-1;},r=>{for(const rows of Object.values(r.audioSettingsCandidate))rows.push({...rows[0]});},r=>{for(const rows of Object.values(r.audioSettingsCandidate))rows[0].file='dist/../module.js';},r=>{r.audioSettingsCandidate.extra=true;}]){
    const r=report();mutate(r);assert.throws(()=>assertAudioSettingsReport(r,{runId:'Settings1',headed:false,control:null}),/audio-settings-proof/);
  }
});


function lossReport(){
    const r=report();r.audioSettings.passed=false;
    r.audioSettings.lossControls=[['owned-gain','config.audioGain',0],['inherit-bit','config.gainInherited',false],['eq-band','config.eq125',1.25],
      ['preset-id','mediaProfiles.presets[0].id','11111111-1111-4111-8111-111111111111']].map(([caseId,path,expected])=>({caseId,code:'f01-storage-loss-'+caseId,
        phase:'storage-readback',matched:true,rawDiff:[{path,expected,actual:'missing'}]}));
  r.audioSettingsNormal={before:{runId:'Normal1',sha256:'1'.repeat(64)},after:{runId:'Normal1',sha256:'1'.repeat(64)}};return r;
}
function normalReport(){const r=report();r.runId='Normal1';r.audioSettingsTrace.file='output/playwright/installed-extension-Normal1/trace.zip';return r;}
function referenceFiles(bytes){return {lstat:async()=>({isFile:()=>true,size:bytes.length}),readFile:async()=>bytes};}
test('R5 normal predecessor flags and exported runtime guards reject invalid linkage before execute',async()=>{
  const {parseAudioSettingsArgs,runInstalledAudioSettings}=await load();let calls=0;
  for(const args of [['--run-id=N','--control=storage-loss'],['--run-id=N','--normal-run-id=A'],['--run-id=N','--control=storage-loss','--normal-run-id=N'],['--run-id=N','--control=storage-loss','--normal-run-id=../A'],['--run-id=N','--control=storage-loss','--normal-run-id=A','--normal-run-id=B']])assert.throws(()=>parseAudioSettingsArgs(args),/audio-settings-args/);
  for(const options of [{runId:'N',headed:false,control:'storage-loss'},{runId:'N',headed:false,control:null,normalRunId:'A'},{runId:'N',headed:false,control:'storage-loss',normalRunId:'N'},{runId:'N',headed:false,control:'storage-loss',normalRunId:'../A'}])await assert.rejects(()=>runInstalledAudioSettings(options,async()=>{calls++;}),/audio-settings-args/);
  assert.equal(calls,0);
});
test('R5 normal reader selects only its canonical explicit summary and returns a full validated reference',async()=>{
  const {readAudioSettingsNormal}=await load(),{createHash}=require('node:crypto');assert.equal(typeof readAudioSettingsNormal,'function');const bytes=Buffer.from(JSON.stringify(normalReport())),paths=[],files=referenceFiles(bytes);
  const read=files.readFile;files.readFile=async p=>{paths.push(p);return read(p);};const r=await readAudioSettingsNormal(files,'Normal1');
  assert.deepEqual(paths,['output/playwright/installed-extension-Normal1/summary.json']);assert.deepEqual(r,{runId:'Normal1',sha256:createHash('sha256').update(bytes).digest('hex'),source:source,candidate:candidateRows()});
});
for(const fault of ['missing','oversize-stat','oversize-read','invalid-json','wrong-run','negative','incomplete','reference-chain'])test('R5 normal reader rejects '+fault+' without manufacturing a predecessor',async()=>{
  const {readAudioSettingsNormal}=await load();assert.equal(typeof readAudioSettingsNormal,'function');const raw=normalReport();if(fault==='wrong-run')raw.runId='Other';if(fault==='negative')raw.audioSettings.passed=false;if(fault==='incomplete')raw.shutdown.ownedRootClosed=false;if(fault==='reference-chain')raw.audioSettingsNormal={before:{runId:'Other',sha256:'1'.repeat(64)},after:{runId:'Other',sha256:'1'.repeat(64)}};
  const bytes=fault==='invalid-json'?Buffer.from('{'):fault==='oversize-read'?Buffer.alloc(1048577):Buffer.from(JSON.stringify(raw)),files=referenceFiles(bytes);let reads=0;const read=files.readFile;files.readFile=async p=>{reads++;return read(p);};
  if(fault==='missing')files.lstat=async()=>null;if(fault==='oversize-stat')files.lstat=async()=>({isFile:()=>true,size:1048577});if(fault==='oversize-read')files.lstat=async()=>({isFile:()=>true,size:100});
  await assert.rejects(()=>readAudioSettingsNormal(files,'Normal1'));if(['missing','oversize-stat'].includes(fault))assert.equal(reads,0);
});
test('R5 storage-loss wrapper passes the selected normal reader into the existing executor and consumes its link',async()=>{
  const {runInstalledAudioSettings}=await load(),{createHash}=require('node:crypto'),bytes=Buffer.from(JSON.stringify(normalReport())),sha256=createHash('sha256').update(bytes).digest('hex');let calls=0;
  const execute=async opts=>{calls++;assert.equal(typeof opts.dependencies.readAudioSettingsNormal,'function');const reference=await opts.dependencies.readAudioSettingsNormal(referenceFiles(bytes));assert.equal(reference.runId,'Normal1');const r=lossReport();r.audioSettingsNormal={before:{runId:'Normal1',sha256},after:{runId:'Normal1',sha256}};return r;};
  const r=await runInstalledAudioSettings({runId:'Settings1',headed:false,control:'storage-loss',normalRunId:'Normal1'},execute);assert.equal(r.ok,true);assert.equal(calls,1);
});
test('R5 stored normal and negative representations require the appropriate predecessor endpoints',async()=>{
  const {assertAudioSettingsReport}=await load(),opts={runId:'Settings1',headed:false,control:'storage-loss',normalRunId:'Normal1'};
  for(const mutate of [r=>{delete r.audioSettingsNormal;},r=>{r.audioSettingsNormal=null;},r=>{r.audioSettingsNormal.after=null;},r=>{r.audioSettingsNormal.after.sha256='2'.repeat(64);},r=>{r.audioSettingsNormal.before.runId='Other';},r=>{r.audioSettingsNormal.before.extra=true;}]){const r=lossReport();mutate(r);assert.throws(()=>assertAudioSettingsReport(r,opts),/audio-settings-proof/);}
  const r=report();r.audioSettingsNormal=lossReport().audioSettingsNormal;assert.throws(()=>assertAudioSettingsReport(r,{runId:'Settings1',headed:false,control:null}),/audio-settings-proof/);
});


test('R5 normal reader rejects unsafe IDs and stat/read length drift without accepting partial JSON',async()=>{
  const {readAudioSettingsNormal}=await load(),bytes=Buffer.from(JSON.stringify(normalReport())),files=referenceFiles(bytes);let stats=0;files.lstat=async()=>{stats++;return {isFile:()=>true,size:bytes.length};};
  await assert.rejects(()=>readAudioSettingsNormal(files,'../Normal1'),/audio-settings-args/);assert.equal(stats,0);
  files.lstat=async()=>({isFile:()=>true,size:bytes.length+1});await assert.rejects(()=>readAudioSettingsNormal(files,'Normal1'),/audio-settings-normal-summary/);
});


for(const initialControl of [null,'storage-loss'])test('R5 wrapper fixes caller options before awaited execution: '+initialControl,async()=>{
  const {runInstalledAudioSettings}=await load(),options={runId:'Settings1',headed:false,control:initialControl,...initialControl?{normalRunId:'Normal1'}:{}};
  const execute=async actual=>{assert.equal(actual.runId,'Settings1');assert.equal(actual.headed,false);assert.equal(typeof actual.dependencies.readAudioSettingsNormal,initialControl?'function':'undefined');await Promise.resolve();options.runId='Changed';options.headed=true;options.control=initialControl?null:'storage-loss';options.normalRunId='Other';return initialControl?lossReport():report();};
  const result=await runInstalledAudioSettings(options,execute);assert.equal(result.ok,true);assert.equal(result.runId,'Settings1');
});
test('R5 invalid normal JSON error never copies the input excerpt into failure details',async()=>{
  const {readAudioSettingsNormal}=await load(),{nativeFailureDetails}=await import('../scripts/audio-native-browser.mjs'),bytes=Buffer.from('private-normal-secret-not-json');let failure;
  try{await readAudioSettingsNormal(referenceFiles(bytes),'Normal1');assert.fail('must reject');}catch(error){failure=error;}
  assert.equal(failure.code,'audio-settings-normal-json');assert.equal(JSON.stringify(nativeFailureDetails(failure)).includes('private-normal-secret'),false);
});


test('current audio expected assets preserve the legacy 62 contract and add only the compiled manifest Worklet',async()=>{
  const {expectedF01MediaFiles,expectedCurrentAudioFiles}=await import('../scripts/check-installed-extension.mjs'),{openOwnedRoot}=await import('../scripts/owned-files.mjs'),{AUDIO_WORKLET_ENTRY}=await import('../scripts/main-runtime.mjs');assert.equal(typeof expectedCurrentAudioFiles,'function');
  const files=await openOwnedRoot(process.cwd()),legacy=await expectedF01MediaFiles(files),before=[...legacy],current=await expectedCurrentAudioFiles(files),manifest=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
  assert.equal(legacy.length,62);assert.equal(current.length,63);assert.equal(new Set(current).size,63);assert.deepEqual(current.filter(x=>!legacy.includes(x)),['dist/'+AUDIO_WORKLET_ENTRY.output]);assert.deepEqual(legacy,before);assert.equal(legacy.includes('dist/web/audio-transition-worklet.js'),false);
  assert.ok(manifest.web_accessible_resources.some(row=>row.resources.includes(AUDIO_WORKLET_ENTRY.output)));assert.ok(fs.existsSync('extension/'+AUDIO_WORKLET_ENTRY.output));
  const actual=fs.readdirSync('extension',{recursive:true,withFileTypes:true}).filter(x=>x.isFile()).map(x=>'dist/'+pathRelative(x));actual.push('dist/LICENSE','dist/THIRD_PARTY_NOTICES.md');
  assert.deepEqual(current,actual.sort());assert.deepEqual(await expectedF01MediaFiles(files),before);
  function pathRelative(entry){const path=require('node:path');return path.relative(path.resolve('extension'),path.join(entry.parentPath,entry.name)).split(path.sep).join('/');}
});
test('current audio asset contract still rejects modified published metadata rather than deriving an arbitrary allowlist',async()=>{
  const {expectedCurrentAudioFiles}=await import('../scripts/check-installed-extension.mjs');assert.equal(typeof expectedCurrentAudioFiles,'function');await assert.rejects(()=>expectedCurrentAudioFiles({readFile:async()=>JSON.stringify([{name:'web/audio-transition-worklet.js'}])}),/published-payload-metadata/);
});
