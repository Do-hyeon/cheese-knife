const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),vm=require('node:vm');
const subject=()=>import('../scripts/extension-e2e/transition-scenario.mjs');
const N='0123456789abcdef0123456789abcdef',P='11111111-1111-4111-8111-111111111111';
test('media preservation oracle fixes four observations and all explicit field tokens',async()=>{
  const api=await subject();assert.deepEqual(api.MEDIA_TRANSITION_PHASES,['old','new','rollback','new']);
  assert.equal(typeof api.expectedInstalledMediaStore,'function');const store=api.expectedInstalledMediaStore(N,P);
  assert.equal(store.revision,5);assert.equal(store.channels.length,2);assert.equal(store.presets.length,1);
  assert.deepEqual(store.channels[0],{channelId:'a'.repeat(32),createdRevision:1,revision:2,audio:{createdRevision:1,values:{
    compressorDefault:false,compressorThreshold:-35,compressorKnee:40,compressorRatio:12,compressorAttack:0,compressorRelease:0.25}}});
  assert.deepEqual(store.channels[1].video,{createdRevision:3,values:{brightness:1.75,contrast:1,saturation:1,gamma:1,sharpness:0}});
  assert.deepEqual(store.presets[0],{id:P,createdRevision:5,revision:1,name:'F00 '+N,domain:'audio',values:store.channels[0].audio.values});
});
test('media loss oracle removes only disposable A domain without altering revision globals B or preset copy',async()=>{
  const api=await subject();assert.equal(typeof api.expectedInstalledMediaLoss,'function');
  const store=api.expectedInstalledMediaStore(N,P),lost=api.expectedInstalledMediaLoss(store);assert.equal(lost.channels.length,1);
  assert.equal(lost.channels[0].channelId,'b'.repeat(32));assert.deepEqual(lost.presets,store.presets);assert.equal(lost.revision,5);assert.equal(store.channels.length,2);
});
test('media loss admission requires final occurrence and exact independently specified remaining raw data',async()=>{
  const api=await subject();assert.equal(typeof api.matchesInstalledMediaLoss,'function');const store=api.expectedInstalledMediaStore(N,P);
  const raw={...api.transitionSeed('valid-ui',N),mediaProfiles:api.expectedInstalledMediaLoss(store)};
  const failure={code:'media-preservation',caseId:'valid-ui',phase:'new',launchOccurrence:4,step:'startup',stage:'candidate-init',cleanupErrors:[],
    observation:{raw,execution:{extensionId:'a'.repeat(32),version:'2.13.4',brokerMatches:true}}};
  assert.equal(api.matchesInstalledMediaLoss(failure,N,'a'.repeat(32),P),true);
  for(const edit of [value=>{value.launchOccurrence=2;},value=>{value.observation.raw.config.brightness=2;},
    value=>{value.observation.raw.mediaProfiles.presets=[];},value=>{value.observation.execution.brokerMatches=false;},
    value=>{value.code='media-ui-timeout';},value=>{value.cleanupErrors.push({code:'close'});}]){
    const changed=structuredClone(failure);edit(changed);assert.equal(api.matchesInstalledMediaLoss(changed,N,'a'.repeat(32),P),false);
  }
});
test('media result validates complete raw observations and all occurrence close facts',async()=>{
  const api=await subject(),{validateInstalledMediaTransitionResult}=await import('../scripts/check-installed-transition.mjs');
  assert.equal(typeof validateInstalledMediaTransitionResult,'function');const extensionId='a'.repeat(32),source={sourceCommit:'a'.repeat(40)};
  const store=api.expectedInstalledMediaStore(N,P),seed=api.transitionSeed('valid-ui',N);
  const prepare=version=>({developerMode:true,workerClosed:true,extensionId,version,state:'ENABLED'});
  const result={scenario:'media-preservation',source,after:{...source},candidateInventory:'b'.repeat(64),
    seeds:[{caseId:'valid-ui',raw:seed,writes:1,extensionId,preparation:prepare('2.13.3')}],phases:[]};
  for(const [index,phase] of api.MEDIA_TRANSITION_PHASES.entries()){
    const launchOccurrence=index+1,version=phase==='old'?'2.13.3':phase==='rollback'?'2.13.5':'2.13.4';
    const initial={raw:{...structuredClone(seed),...(launchOccurrence>=3?{mediaProfiles:structuredClone(store)}:{})},execution:{extensionId,version,brokerMatches:true}};
    const final={raw:{...structuredClone(seed),...(launchOccurrence>=2?{mediaProfiles:structuredClone(store)}:{})},execution:{extensionId,version,brokerMatches:true}};
    const records=[{step:'startup',observation:initial},...(launchOccurrence===2?[{step:'create-media',observation:final}]:[]),{step:'observe-ui',observation:final}];
    result.phases.push({caseId:'valid-ui',phase,launchOccurrence,extensionId,preparation:prepare(version),inventorySha256:'c'.repeat(64),manifestSha256:'d'.repeat(64),
      records,final,presetId:launchOccurrence>=2?P:undefined});
  }
  const launches=['seed',...api.MEDIA_TRANSITION_PHASES].map((phase,launchOccurrence)=>({caseId:'valid-ui',phase,launchOccurrence,
    launchId:`valid-ui:${launchOccurrence}:${phase}`,closed:true,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}}));
  assert.doesNotThrow(()=>validateInstalledMediaTransitionResult(result,N,undefined,launches));
  for(const mutate of [value=>{value.phases.pop();},value=>{value.phases[2].final.raw.mediaProfiles.channels[0].audio.values.compressorRatio=9;},
    value=>{value.phases[3].records.splice(1,0,{step:'create-media',observation:value.phases[3].final});},
    value=>{for(const record of value.phases[2].records){const raw=record.observation.raw;
      raw.mediaProfiles={revision:raw.mediaProfiles.revision,schema:1,channels:raw.mediaProfiles.channels,presets:raw.mediaProfiles.presets};}
      value.phases[2].final=value.phases[2].records.at(-1).observation;}]){
    const changed=structuredClone(result);mutate(changed);assert.throws(()=>validateInstalledMediaTransitionResult(changed,N,undefined,launches));
  }
  const closed=structuredClone(launches);closed[4].shutdown.ownedRootClosed=false;assert.throws(()=>validateInstalledMediaTransitionResult(result,N,undefined,closed));
});
test('media-profile-loss derivative removes A only at guarded startup and preserves source inputs',async()=>{
  const api=await subject(),{phasePayload}=await import('../scripts/check-installed-transition.mjs');
  const source=await fs.readFile('settings-broker.js','utf8'),manifest=await fs.readFile('manifest.json');
  const payload={entries:[{name:'settings-broker.js',bytes:Buffer.from(source)},{name:'manifest.json',bytes:manifest}]};
  const entries=phasePayload(payload,'new','media-profile-loss');assert.equal(payload.entries[0].bytes.toString(),source);
  assert.equal(JSON.parse(entries[1].bytes).version,'2.13.4');const changed=entries[0].bytes.toString();assert.notEqual(changed,source);
  const start=changed.indexOf('const mediaLossRaw'),end=changed.indexOf('const raw = await read(true), revision',start);
  assert.ok(start>0&&end>start);const store=api.expectedInstalledMediaStore(N,P),raw={config:{futureFlag:'keep'},mediaProfiles:structuredClone(store)};
  let writes=0;const run=()=>vm.runInNewContext(`(async()=>{${changed.slice(start,end)}})()`,{chromeApi:{storage:{local:{get:async()=>raw,set:async update=>{writes++;Object.assign(raw,update);}}}}});
  await run();await run();assert.equal(writes,1,'worker refresh must not re-delete or reject the already applied control');
  assert.deepEqual(raw.config,{futureFlag:'keep'});assert.deepEqual(raw.mediaProfiles,api.expectedInstalledMediaLoss(store));
});
