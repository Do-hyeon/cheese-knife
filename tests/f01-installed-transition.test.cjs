const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const subject=async()=>{
  assert.ok(fs.existsSync('scripts/extension-e2e/f01-transition.mjs'),'the approved F01 transition helper must exist');
  return import('../scripts/extension-e2e/f01-transition.mjs');
};

test('F01 transition CLI is explicit and cannot select another profile transport schema or mixed legacy scenario',async()=>{
  const {parseF01TransitionArgs}=await subject();
  assert.equal(typeof parseF01TransitionArgs,'function');
  assert.deepEqual(parseF01TransitionArgs(['--run-id=F01preservation','--media-schema=f01']),{runId:'F01preservation',headed:false,mediaSchema:'f01'});
  assert.deepEqual(parseF01TransitionArgs(['--run-id=F01loss','--media-schema=f01','--control=storage-loss','--headed']),
    {runId:'F01loss',headed:true,mediaSchema:'f01',control:'storage-loss'});
  for(const args of [[],['--run-id=A'],['--media-schema=f01'],['--run-id=A','--media-schema=other'],['--run-id=../outside','--media-schema=f01'],
    ['--run-id=A','--run-id=B','--media-schema=f01'],['--run-id=A','--media-schema=f01','--media-schema=f01'],['--run-id=A','--media-schema=f01','--control=media-profile-loss'],
    ['--run-id=A','--media-schema=f01','--profile=user'],['--run-id=A','--media-schema=f01','--remote-port=9222'],['--run-id=A','--media-schema=f01','--scenario=media-preservation']]){
    assert.throws(()=>parseF01TransitionArgs(args),/f01-transition-args/);
  }
});

test('frozen F00 input is the exact committed 59-resource snapshot, never the current F01 or published payload',async()=>{
  const {readFrozenF00Payload}=await subject();
  const metadata=JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f00-payload.json','utf8'));
  const payload=readFrozenF00Payload(process.cwd(),metadata);
  assert.equal(payload.sourceCommit,'ae9f8e50a22dae9d549f1e476d302549ecc03b4a');
  assert.equal(payload.entries.length,59);assert.equal(payload.inventorySha256,metadata.inventorySha256);
  assert.ok(payload.entries.some(entry=>entry.name==='media-profiles.js'));
  assert.equal(payload.entries.some(entry=>entry.name==='gain-authority.js'),false);
  const manifest=JSON.parse(payload.entries.find(entry=>entry.name==='manifest.json').bytes.toString('utf8'));
  assert.equal(manifest.version,'2.13.3');assert.equal(manifest.manifest_version,3);
  for(const mutate of [m=>{m.sourceCommit='a'.repeat(40);},m=>{m.entries.pop();},m=>{m.entries[0].sha256='0'.repeat(64);},
    m=>{m.entries[0].name='../outside';},m=>{m.entries[1]=m.entries[0];},m=>{m.entries[0].bytes=0;}]){
    const changed=structuredClone(metadata);mutate(changed);
    assert.throws(()=>readFrozenF00Payload(path.resolve('.'),changed),/f01-f00-payload/);
  }
  assert.throws(()=>readFrozenF00Payload('.',metadata),/f01-f00-root/);
});

test('independent F01 cold expectations preserve legacy identities and distinguish both alias directions without product helpers',async()=>{
  const {f01TransitionSeed,expectedF01TransitionRaw}=await subject();assert.equal(typeof expectedF01TransitionRaw,'function');
  const seed=JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f01-transition-seed.json','utf8')),
    expected=JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f01-transition-expected-media.json','utf8'));
  const nonce='0123456789abcdef0123456789abcdef',presetId='22222222-2222-4222-8222-222222222222';
  const input={seed,expected,runNonce:nonce};
  const initial=f01TransitionSeed('valid-v1',nonce,seed);assert.equal(initial.mediaProfiles.schema,1);assert.equal(initial.futureTop.runNonce,nonce);
  assert.equal(seed.futureTop.runNonce,'__RUN_NONCE__');
  const upgraded=expectedF01TransitionRaw({...input,caseId:'valid-v1',occurrence:2,step:'upgraded'});
  assert.equal(upgraded.mediaProfiles.revision,8);assert.equal(upgraded.mediaProfiles.channels[0].revision,3);assert.equal(upgraded.mediaProfiles.channels[1].revision,2);
  assert.equal(upgraded.mediaProfiles.presets[0].revision,2);assert.equal(upgraded.mediaProfiles.presets[0].id,'11111111-1111-4111-8111-111111111111');
  const edited=expectedF01TransitionRaw({...input,caseId:'valid-v1',occurrence:2,step:'final',presetId});
  assert.equal(edited.settingsRevision,9);assert.equal(edited.config.compressorDefault,true);assert.equal(edited.config.audioGain,0);assert.equal(Object.hasOwn(edited.config,'audioDefault'),false);
  assert.equal(edited.mediaProfiles.revision,12);assert.equal(edited.mediaProfiles.channels[0].audio.values.audioGain,0);assert.equal(edited.mediaProfiles.channels[0].audio.values.gainInherited,false);
  assert.equal(edited.mediaProfiles.channels[0].revision,6);assert.equal(edited.mediaProfiles.channels[1].revision,2);assert.equal(edited.mediaProfiles.presets[0].revision,2);
  assert.equal(edited.mediaProfiles.presets[1].id,presetId);assert.equal(edited.mediaProfiles.presets[1].createdRevision,11);assert.equal(edited.mediaProfiles.channels[1].video.values.brightness,1.75);
  const off=expectedF01TransitionRaw({...input,caseId:'valid-v1',occurrence:3,step:'final',presetId});
  const resumed=expectedF01TransitionRaw({...input,caseId:'valid-v1',occurrence:4,step:'final',presetId});assert.deepEqual(off,resumed);assert.equal(off.settingsRevision,10);assert.equal(off.config.compressorDefault,false);
  const final=expectedF01TransitionRaw({...input,caseId:'valid-v1',occurrence:6,step:'final',presetId});assert.equal(final.settingsRevision,11);assert.equal(final.config.compressorDefault,true);
  assert.deepEqual(final.mediaProfiles,edited.mediaProfiles);assert.deepEqual(final.futureTop,{runNonce:nonce,untouched:true});assert.deepEqual(final.styles,['future-style']);
  const absent=expectedF01TransitionRaw({...input,caseId:'absent',occurrence:1,step:'final'});assert.equal(Object.hasOwn(absent,'mediaProfiles'),false);assert.equal(absent.config.audioGain,0);assert.equal(absent.settingsRevision,5);
  for(const caseId of ['global-max','media-max','corrupt','future'])assert.deepEqual(expectedF01TransitionRaw({...input,caseId,occurrence:1,step:'final'}),f01TransitionSeed(caseId,nonce,seed));
  assert.throws(()=>expectedF01TransitionRaw({...input,caseId:'valid-v1',occurrence:9,step:'final',presetId}),/f01-transition-expectation/);
  assert.throws(()=>expectedF01TransitionRaw({...input,caseId:'valid-v1',occurrence:2,step:'final',presetId:'guessed'}),/f01-transition-expectation/);
});

test('cold schedule retains all original cases, assigns exact payload roles and never repeats a loss past its witness',async()=>{
  const {f01TransitionAssignments,f01TransitionStages}=await subject();assert.equal(typeof f01TransitionAssignments,'function');
  const positive=f01TransitionAssignments(),negative=f01TransitionAssignments('storage-loss');
  assert.deepEqual(positive.map(value=>value.caseId),['valid-ui','legacy-valid','legacy-null','legacy-invalid','damaged-revision','valid-v1','absent','global-max','media-max','corrupt','future']);
  assert.equal(positive.reduce((n,value)=>n+f01TransitionStages(value).length,0),37);
  assert.deepEqual(f01TransitionStages(positive[0]).map(value=>value.payload),['published','published','f00','published']);
  assert.deepEqual(f01TransitionStages(positive[5]).map(value=>value.payload),['published','f00','f01','f00','f01','published','f01']);
  assert.deepEqual(f01TransitionStages(positive[6]).map(value=>value.phase),['seed','new']);
  assert.deepEqual(negative.map(value=>value.caseId),['valid-ui','loss-owned-gain','loss-inherit-bit','loss-eq-band','loss-preset-id']);
  assert.equal(negative.reduce((n,value)=>n+f01TransitionStages(value,'storage-loss').length,0),19);
  assert.throws(()=>f01TransitionAssignments('other'),/f01-transition-control/);
  assert.throws(()=>f01TransitionStages({caseId:'unknown',kind:'f01'}),/f01-transition-assignment/);
});

test('cold storage loss matcher requires only the exact owned field, occurrence, payload provenance and native preset',async()=>{
  const {expectedF01TransitionRaw,matchF01TransitionLoss}=await subject();assert.equal(typeof matchF01TransitionLoss,'function');
  const seed=JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f01-transition-seed.json','utf8')),
    expected=JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f01-transition-expected-media.json','utf8'));
  const input={seed,expected,caseId:'valid-v1',runNonce:'a'.repeat(32),presetId:'22222222-2222-4222-8222-222222222222',occurrence:3,step:'startup'};
  const raw=expectedF01TransitionRaw(input),extensionId='a'.repeat(32);
  for(const [loss,pathName]of [['owned-gain','audioGain'],['inherit-bit','gainInherited'],['eq-band','eq125'],['preset-id','id']]){
    const damaged=structuredClone(raw);delete (loss==='preset-id'?damaged.mediaProfiles.presets[1]:damaged.mediaProfiles.channels[0].audio.values)[pathName];
    const failure={code:'f01-transition-preservation',caseId:'loss-'+loss,phase:'rollback',payload:'f00',launchOccurrence:3,step:'startup',stage:'rollback-init',
      observation:{raw:damaged,execution:{extensionId,version:'2.13.5',brokerMatches:true}},cleanupErrors:[]};
    assert.equal(matchF01TransitionLoss(failure,raw,loss,extensionId),true);
    for(const mutate of [f=>{f.observation.raw.futureTop.untouched=false;},f=>{f.phase='new';},f=>{f.payload='f01';},f=>{f.launchOccurrence=4;},
      f=>{f.code='timeout';},f=>{f.cleanupErrors.push({code:'unclosed'});},f=>{f.observation.execution.brokerMatches=false;},f=>{f.observation.execution.extensionId='b'.repeat(32);}]){
      const changed=structuredClone(failure);mutate(changed);assert.equal(matchF01TransitionLoss(changed,raw,loss,extensionId),false);
    }
    assert.equal(matchF01TransitionLoss({...failure,observation:{...failure.observation,raw}},raw,loss,extensionId),false);
  }
});

test('F01 cold phase validation requires complete ordered observations and original native execution',async()=>{
  const {assertF01TransitionPhase,runF01TransitionPhase}=await subject();assert.equal(typeof runF01TransitionPhase,'function');assert.equal(typeof assertF01TransitionPhase,'function');
  const input={seed:JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f01-transition-seed.json','utf8')),
    expected:JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f01-transition-expected-media.json','utf8')),caseId:'absent',runNonce:'a'.repeat(32),occurrence:1,
    phase:'new',payload:'f01',extensionId:'a'.repeat(32)};
  const startup={...input.seed,futureTop:{runNonce:input.runNonce,untouched:true}};delete startup.mediaProfiles;
  const final={...structuredClone(startup),settingsRevision:5};Object.assign(final.config,{audioGain:0,gainInherited:false});
  const execution={extensionId:input.extensionId,version:'2.13.4',brokerMatches:true};
  const value={caseId:'absent',phase:'new',payload:'f01',launchOccurrence:1,records:[{step:'startup',observation:{raw:startup,execution}},{step:'final',observation:{raw:final,execution}}],
    final:{raw:final,execution},pageErrors:[]};
  assert.doesNotThrow(()=>assertF01TransitionPhase(value,input));
  for(const mutate of [v=>{v.records.shift();},v=>{v.records.reverse();},v=>{v.final.raw.settingsRevision=6;},v=>{v.records[0].observation.execution.brokerMatches=false;},
    v=>{v.payload='f00';},v=>{v.pageErrors.push('error');}]){const changed=structuredClone(value);mutate(changed);assert.throws(()=>assertF01TransitionPhase(changed,input),/f01-transition-proof/);}
  await assert.rejects(runF01TransitionPhase({...input,phase:'rollback'}),/f01-transition-phase/);
});

test('F01 final report cannot pass on empty observations or source-only success',async()=>{
  const {validateF01TransitionResult}=await import('../scripts/check-installed-transition.mjs');assert.equal(typeof validateF01TransitionResult,'function');
  for(const result of [null,{}, {mediaSchema:'f01',source:{sourceCommit:'a'.repeat(40)},after:{sourceCommit:'a'.repeat(40)},candidateInventory:'a'.repeat(64),seeds:[],phases:[]}]){
    assert.throws(()=>validateF01TransitionResult(result,'a'.repeat(32),undefined,[],{},{}),/f01-transition-result/);
  }
});

test('F01 negative report revalidates all nineteen closes and rejects a hidden failure even with all expected witnesses',async()=>{
  const {validateF01TransitionResult}=await import('../scripts/check-installed-transition.mjs');
  const {f01TransitionAssignments,f01TransitionStages,f01TransitionSeed,expectedF01TransitionRaw}=await subject();
  const {expectedTransitionState,expectedTransitionRaw,transitionSeed}=await import('../scripts/extension-e2e/transition-scenario.mjs');
  const seedFixture=JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f01-transition-seed.json','utf8')),
    expectedFixture=JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f01-transition-expected-media.json','utf8'));
  const nonce='a'.repeat(32),presetId='22222222-2222-4222-8222-222222222222',hash='1'.repeat(64),control='storage-loss',launches=[];
  const source={sourceCommit:'a'.repeat(40),sourceSha256:hash,lockSha256:hash,manifestSha256:hash,toolchainSha256:hash};
  const result={mediaSchema:'f01',source,after:structuredClone(source),candidateInventory:hash,cleanupErrors:[],secondaryErrors:[],seeds:[],phases:[],detected:[],
    payloads:{published:{count:58,inventorySha256:'a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2'},
      f00:{count:59,inventorySha256:'9715087af1aa2b36fc54b330e5a879ce384f4c9a4f56faf1c6fd8847436580df'},f01:{count:62,inventorySha256:hash}}};
  for(const [index,assignment]of f01TransitionAssignments(control).entries()){
    const id=String.fromCharCode(97+index).repeat(32),prepare=version=>({developerMode:true,workerClosed:true,extensionId:id,version,state:'ENABLED'}),stages=f01TransitionStages(assignment,control);
    result.seeds.push({caseId:assignment.caseId,writes:1,extensionId:id,preparation:prepare('2.13.3'),raw:assignment.kind==='legacy'?transitionSeed(assignment.caseId,nonce):f01TransitionSeed('valid-v1',nonce,seedFixture)});
    for(const [occurrence,stage]of stages.entries()){
      launches.push({caseId:assignment.caseId,...stage,launchOccurrence:occurrence,launchId:`${assignment.caseId}:${occurrence}:${stage.phase}`,closed:true,
        shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}});
      if(occurrence===0)continue;
      const version=stage.phase==='old'?'2.13.3':stage.phase==='new'?'2.13.4':'2.13.5',execution={extensionId:id,version,brokerMatches:true};
      if(occurrence===stages.length-1){
        let raw;
        if(assignment.kind==='legacy'){raw=expectedTransitionRaw('valid-ui','old','font8',nonce);delete raw.config;}
        else{raw=expectedF01TransitionRaw({caseId:'valid-v1',runNonce:nonce,seed:seedFixture,expected:expectedFixture,occurrence,step:'startup',presetId});
          if(assignment.loss==='preset-id')delete raw.mediaProfiles.presets[1].id;else delete raw.mediaProfiles.channels[0].audio.values[assignment.loss==='owned-gain'?'audioGain':assignment.loss==='inherit-bit'?'gainInherited':'eq125'];}
        result.detected.push({code:assignment.kind==='legacy'?'transition-storage-preservation':'f01-transition-preservation',caseId:assignment.caseId,...stage,launchOccurrence:occurrence,
          step:'startup',stage:assignment.kind==='legacy'?'candidate-init':'rollback-init',observation:{raw,execution},cleanupErrors:[]});continue;
      }
      const steps=assignment.kind==='legacy'?['startup','arrow-off','volume25','hide-ranking-on','font8','font8']:occurrence===2?['startup','upgraded','final']:['startup','final'];
      const records=steps.map((step,position)=>({step,...(assignment.kind==='legacy'&&position===5?{reloaded:true}:{}),observation:assignment.kind==='legacy'?
        expectedTransitionState('valid-ui','old',step,nonce,id,{reloaded:position===5,reloads:position===5?[1,0]:[0,0]}):
        {raw:expectedF01TransitionRaw({caseId:'valid-v1',runNonce:nonce,seed:seedFixture,expected:expectedFixture,occurrence,step,presetId}),execution}}));
      result.phases.push({caseId:assignment.caseId,...stage,launchOccurrence:occurrence,extensionId:id,preparation:prepare(version),inventorySha256:hash,manifestSha256:hash,
        records,final:records.at(-1).observation,...(assignment.kind==='f01'?{presetId,pageErrors:[]}:{})});
    }
  }
  assert.doesNotThrow(()=>validateF01TransitionResult(result,nonce,control,launches,seedFixture,expectedFixture));
  assert.throws(()=>validateF01TransitionResult({...result,failure:{code:'hidden'}},nonce,control,launches,seedFixture,expectedFixture),/f01-transition-result/);
  for(const mutate of [v=>{v.seeds[0].writes=2;},v=>{v.phases.pop();},v=>{v.detected[4].observation.raw.futureTop.untouched=false;},v=>{v.payloads.f00.count=62;},
    v=>{v.after.sourceCommit='b'.repeat(40);},v=>{v.phases[2].records[2].observation.raw.mediaProfiles.presets[1].id='33333333-3333-4333-8333-333333333333';}]){
    const changed=structuredClone(result);mutate(changed);assert.throws(()=>validateF01TransitionResult(changed,nonce,control,launches,seedFixture,expectedFixture));
  }
  const missing=structuredClone(launches);missing[18].shutdown.ownedRootClosed=false;
  assert.throws(()=>validateF01TransitionResult(result,nonce,control,missing,seedFixture,expectedFixture),/f01-transition-result/);
});
