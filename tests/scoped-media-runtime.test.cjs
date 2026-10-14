const test=require('node:test'),assert=require('node:assert/strict');
const {page,load,runtime,playerHTML,flush}=require('./helpers.cjs');
const fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild');
const A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',B='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const values={brightness:2,contrast:1,saturation:1,gamma:1,sharpness:0};
const media={schema:1,revision:1,channels:[{channelId:A,createdRevision:1,revision:1,video:{createdRevision:1,values}}],presets:[]};
const context={documentGeneration:1,routePath:`/live/${A}`,channelId:A,playerGeneration:1};
function reader(t,raw,incognito=false){const dom=page();t.after(()=>dom.window.close());const reads=[];
  dom.window.chrome={extension:{inIncognitoContext:incognito},storage:{local:{get:async keys=>{reads.push(keys);return structuredClone(raw);},set:()=>{throw Error('read must never save');}}}};
  load(dom,'media-profiles.js');load(dom,'config.js');assert.equal(typeof dom.window.readScopedConfig,'function','scoped reader must exist');
  return {read:scope=>dom.window.readScopedConfig(scope),reads,dom};}
test('scoped reader bulk-projects only the current channel and keeps global base separately',async t=>{
  const raw={config:{brightness:1.25,previewVolume:25},mediaProfiles:media,settingsRevision:7,styleParameters:{'chat-font-size':8}},r=reader(t,raw);
  const snapshot=await r.read(context);assert.equal(snapshot.baseConfig.brightness,1.25);assert.equal(snapshot.effectiveConfig.brightness,2);
  assert.equal(snapshot.effectiveConfig.previewVolume,25);assert.deepEqual(structuredClone(snapshot.version),{globalRevision:7,mediaRevision:1});
  assert.equal(snapshot.profileState,'scoped');assert.equal(snapshot.revisionStatus,'ready');assert.equal(snapshot.videoKind,'channel');
  assert.deepEqual([...r.reads[0]].sort(),['config','styles','styleParameters','settingsRevision','mediaProfiles'].sort());
  assert.equal(Object.hasOwn(snapshot,'store'),false);assert.equal(Object.hasOwn(snapshot,'channels'),false);assert.equal(r.reads.length,1);
});
test('absent and damaged media remain readonly and valid base does not become unavailable',async t=>{
  for(const item of [undefined,{...media,schema:99},{invalid:true}]){
    const r=reader(t,{config:{brightness:1.225},mediaProfiles:item}),snapshot=await r.read(context);
    assert.equal(snapshot.baseConfig.brightness,1.225);assert.equal(snapshot.effectiveConfig.brightness,1.225);
    assert.equal(snapshot.version.globalRevision,0);assert.equal(snapshot.profileState,item===undefined?'global':'repair-required');
  }
});
test('bad global revision is nullable metadata not a reason to discard validated base values',async t=>{
  for(const revision of [-1,'bad',Number.MAX_SAFE_INTEGER]){
    const r=reader(t,{config:{brightness:1.225},settingsRevision:revision,mediaProfiles:media}),snapshot=await r.read(context);
    assert.equal(snapshot.baseConfig.brightness,1.225);assert.equal(snapshot.version.globalRevision,null);assert.equal(snapshot.revisionStatus,'repair-required');
  }
});
test('other channel numeric VOD and incognito use only the original global values',async t=>{
  for(const [scope,incognito] of [[{...context,channelId:B},false],[{...context,channelId:null,routePath:'/video/123'},false],[context,true]]){
    const r=reader(t,{config:{brightness:1.225},mediaProfiles:media},incognito),snapshot=await r.read(scope);
    assert.equal(snapshot.effectiveConfig.brightness,1.225);assert.equal(snapshot.videoKind,'global');
  }
});
test('legacy reader still returns global-only values and does not acquire the media catalogue',async t=>{
  const r=reader(t,{config:{brightness:1.25},mediaProfiles:media}),snapshot=await r.dom.window.getConfig(true);
  assert.equal(snapshot.config.brightness,1.25);assert.equal(Object.hasOwn(r.reads[0],'mediaProfiles'),false);
});
test('new MAIN modules do not attach controllers to the actual published runtime owner',async t=>{
  const {readPublishedPayload}=await import('../scripts/extension-e2e/published-payload.mjs');
  const published=await readPublishedPayload(),source=published.entries.find(entry=>entry.name==='web/runtime.js');assert.ok(source);
  const dom=page();t.after(()=>{dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));dom.window.close();});
  dom.window.eval(source.bytes.toString('utf8'));const key=dom.window.Symbol.for('cheese-knife.runtime.v1'),original=dom.window[key];
  assert.ok(original);assert.notEqual(original.ownerProtocol,2);load(dom,'media-profiles.js');
  for(const file of ['web/site-adapter.js','web/audio.js','web/player.js','web/preview.js','web/inject.js'])load(dom,file);
  assert.equal(dom.window[key],original);assert.equal(original.adapter,undefined);assert.equal(original.audio,undefined);
  assert.equal(original.player,undefined);assert.equal(original.preview,undefined);assert.equal(original.coordinatorStarted,undefined);
});
function parser(t){const dom=page();t.after(()=>dom.window.close());load(dom,'media-profiles.js');const module={exports:{}};
  vm.runInNewContext(transformSync(fs.readFileSync('src/main/runtime/bridge.ts','utf8'),{loader:'ts',format:'cjs'}).code,
    {module,exports:module.exports,KnifeMediaProfiles:dom.window.KnifeMediaProfiles});
  assert.equal(typeof module.exports.readScopedConfigEnvelope,'function','scoped envelope decoder must exist');return module.exports.readScopedConfigEnvelope;}
function envelope(overrides={}){const audio={compressorDefault:false,compressorThreshold:-50,compressorKnee:40,compressorRatio:12,compressorAttack:0,compressorRelease:0.25};
  const config={...audio,...values,brightness:1,previewVolume:25};return {namespace:'cheese-knife',protocol:2,type:'config',requestId:'fixture-v2',
    context,deliverySequence:1,baseConfig:config,effectiveConfig:{...config,brightness:2},i18n:{},version:{globalRevision:0,mediaRevision:1},
    profileState:'scoped',revisionStatus:'ready',mediaPhase:'ready',audioBindingGeneration:1,audioKind:'global',videoKind:'channel',...overrides};}
test('v2 decoder accepts complete scoped projection without a catalogue and separates nullable metadata',t=>{
  const read=parser(t),positive=read({data:envelope()},context);assert.ok(positive);assert.equal(positive.effectiveConfig.brightness,2);
  const limited=envelope({version:{globalRevision:null,mediaRevision:null},revisionStatus:'repair-required',profileState:'repair-required',
    mediaPhase:'limited',videoKind:'global',effectiveConfig:envelope().baseConfig});assert.ok(read({data:limited},context));
});
test('v2 decoder rejects different context generations and invalid scalar or metadata contracts',t=>{
  const read=parser(t);assert.ok(read({data:envelope()},context),'valid control must pass before negatives');
  for(const update of [{context:{...context,playerGeneration:0}},{context:{...context,routePath:`/live/${B}`,channelId:B}},
    {context:{...context,documentGeneration:2}},{deliverySequence:-1},{audioBindingGeneration:-1},
    {effectiveConfig:{...envelope().effectiveConfig,compressorRatio:99}},{effectiveConfig:{...envelope().effectiveConfig,previewVolume:0}},
    {version:{globalRevision:null,mediaRevision:1}},{profileState:'scoped',videoKind:'global'},
    {mediaPhase:'pending'},{catalogue:media}])assert.equal(read({data:envelope(update)},context),null);
});
test('v2 decoder never executes accessor or inherited payload fields',t=>{
  const read=parser(t);let getters=0;const data=envelope();Object.defineProperty(data,'baseConfig',{enumerable:true,get(){getters++;throw Error('getter');}});
  assert.equal(read({data},context),null);assert.equal(getters,0);assert.equal(read({data:Object.create(envelope())},context),null);
});
test('record classification does not read an accessor on a prototype constructor name',t=>{
  const read=parser(t);assert.ok(read({data:envelope()},context));let calls=0;
  const constructor=function(){};Object.defineProperty(constructor,'name',{get(){calls++;return 'Object';}});
  const prototype=Object.create(null);Object.defineProperty(prototype,'constructor',{value:constructor});
  const data=Object.assign(Object.create(prototype),envelope());
  assert.equal(read({data},context),null);assert.equal(calls,0);
});
function running(t){const dom=page(playerHTML);t.after(()=>{dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));dom.window.close();});
  for(const file of ['media-profiles.js','web/runtime.js','web/site-adapter.js'])load(dom,file);const api=runtime(dom);
  assert.ok(api.media?.context,'runtime must own separate scoped context');return {dom,api};}
function sendEnvelope(dom,data){dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window,origin:dom.window.location.origin,data}));}
function currentEnvelope(api,overrides={}){return envelope({context:structuredClone(api.media.context),requestId:api.mediaRequestId,...overrides});}
test('base-ready during scoped pending does not promote audio/video or accept legacy config as scoped success',t=>{
  const {dom,api}=running(t),baseConfig=envelope().baseConfig;
  sendEnvelope(dom,currentEnvelope(api,{mediaPhase:'pending',profileState:'global',videoKind:'global',effectiveConfig:baseConfig,
    version:{globalRevision:null,mediaRevision:null},revisionStatus:'repair-required'}));
  assert.equal(api.configReady,true);assert.equal(api.config.previewVolume,25);assert.equal(api.media.phase,'pending');assert.equal(api.mediaCurrent(),false);
  sendEnvelope(dom,{namespace:'cheese-knife',protocol:1,type:'config',requestId:api.requestId,revision:99,config:{brightness:3}});
  assert.equal(api.config.brightness,1);assert.equal(api.media.phase,'pending');
  sendEnvelope(dom,currentEnvelope(api,{deliverySequence:2}));assert.equal(api.media.phase,'ready');assert.equal(api.config.brightness,2);assert.equal(api.baseConfig.brightness,1);
});
test('observed A to B to A transition retires overlay before notify and rejects old A even with a newer sequence',t=>{
  const {dom,api}=running(t),old=currentEnvelope(api);sendEnvelope(dom,old);assert.equal(api.config.brightness,2);
  const seen=[];api.subscribe(()=>seen.push({path:api.media.context.routePath,brightness:api.config.brightness,phase:api.media.phase}));
  dom.reconfigure({url:`https://chzzk.naver.com/live/${B}`});assert.equal(api.mediaCurrent(),false);api.reconcile();
  assert.equal(api.config.brightness,1);assert.equal(api.media.phase,'pending');
  assert.ok(seen.some(value=>value.path===`/live/${B}`&&value.brightness===1&&value.phase==='pending'));
  dom.reconfigure({url:`https://chzzk.naver.com/live/${A}`});api.reconcile();
  assert.ok(api.media.context.playerGeneration>old.context.playerGeneration);
  sendEnvelope(dom,{...old,deliverySequence:999});assert.equal(api.config.brightness,1);
  sendEnvelope(dom,currentEnvelope(api,{deliverySequence:3}));assert.equal(api.config.brightness,2);assert.equal(api.mediaCurrent(),true);
});
test('sidebar refresh is not a player re-entry and same-context revalidation renews only the request authority',t=>{
  const {dom,api}=running(t);sendEnvelope(dom,currentEnvelope(api));const before=structuredClone(api.media.context),request=api.mediaRequestId;
  const sidebar=dom.window.document.createElement('aside');sidebar.id='sidebar';dom.window.document.body.append(sidebar);api.reconcile();
  assert.deepEqual(structuredClone(api.media.context),before);assert.equal(api.mediaRequestId,request);
  api.revalidateMedia();assert.deepEqual(structuredClone(api.media.context),before);assert.notEqual(api.mediaRequestId,request);
  assert.equal(api.media.phase,'pending');sendEnvelope(dom,envelope({context:before,requestId:request,deliverySequence:99}));assert.equal(api.media.phase,'pending');
});
function connected(t,raw,held=false){const dom=page(playerHTML),pending=[],messages=[];let change;
  dom.window.postMessage=data=>{messages.push(data);queueMicrotask(()=>sendEnvelope(dom,data));};
  dom.window.chrome={extension:{inIncognitoContext:false},storage:{local:{get:async keys=>{
    const snapshot=structuredClone(raw);if(held&&Array.isArray(keys)&&keys.includes('mediaProfiles'))return new Promise(resolve=>pending.push(()=>resolve(snapshot)));return snapshot;
  },onChanged:{addListener:fn=>{change=fn;},removeListener(){}}}},runtime:{id:'fixture',onMessage:{addListener(){},removeListener(){}}},i18n:{getMessage:key=>key}};
  for(const file of ['media-profiles.js','config.js','web/main.js','web/runtime.js','web/site-adapter.js','web/player.js'])load(dom,file);
  t.after(()=>{dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));for(const resolve of pending)resolve();dom.window.close();});
  return {dom,api:runtime(dom),messages,release(){held=false;for(const resolve of pending.splice(0))resolve();},change:keys=>change(keys)};
}
test('real ISOLATED and MAIN handshake projects channel values without serializing catalogue or labels',async t=>{
  const raw={config:{brightness:1.25,previewVolume:25},mediaProfiles:{...media,presets:[{id:'11111111-1111-4111-8111-111111111111',createdRevision:1,revision:1,
    domain:'video',name:'PRIVATE PRESET LABEL',values}]}};
  const h=connected(t,raw);await flush();assert.equal(h.api.configReady,true);assert.equal(h.api.config.brightness,2);assert.equal(h.api.baseConfig.brightness,1.25);
  const configs=h.messages.filter(data=>data.type==='config'&&data.protocol===2);assert.ok(configs.length);
  assert.equal(JSON.stringify(configs).includes('PRIVATE PRESET LABEL'),false);assert.equal(JSON.stringify(configs).includes('presets'),false);
  assert.equal(h.dom.window.document.getElementById('knifeFilter').querySelector('feFuncR').getAttribute('slope'),'1.25');
  assert.equal(h.dom.window.document.getElementById('knifeChannelFilter').querySelector('feFuncR').getAttribute('slope'),'2');
});
test('known base is ready while the separate scoped read waits and accepted values replace it afterward',async t=>{
  const h=connected(t,{config:{brightness:1.25,previewVolume:25},mediaProfiles:media},true);await flush();
  assert.equal(h.api.configReady,true);assert.equal(h.api.media.phase,'pending');assert.equal(h.api.config.brightness,1.25);
  h.release();await flush();assert.equal(h.api.media.phase,'ready');assert.equal(h.api.config.brightness,2);
});
test('storage profile reset retires channel rendering but never changes the original global base',async t=>{
  const raw={config:{brightness:1.25},mediaProfiles:structuredClone(media)},h=connected(t,raw);await flush();assert.equal(h.api.config.brightness,2);
  delete raw.mediaProfiles;h.change({mediaProfiles:{newValue:undefined}});await flush();
  assert.equal(h.api.config.brightness,1.25);assert.equal(h.api.baseConfig.brightness,1.25);
  assert.equal(h.dom.window.document.querySelector('video').hasAttribute('data-knife-channel-filter'),false);
});
test('a hung scoped read does not block a new channel and cannot restore retired A values',async t=>{
  const raw={config:{brightness:1.25},mediaProfiles:structuredClone(media)},h=connected(t,raw,true);await flush();
  h.dom.reconfigure({url:`https://chzzk.naver.com/live/${B}`});h.api.reconcile();await flush();
  h.release();await flush();assert.equal(h.api.media.phase,'ready');assert.equal(h.api.media.context.channelId,B);
  assert.equal(h.api.config.brightness,1.25);assert.equal(h.api.media.videoKind,'global');
  assert.equal(h.dom.window.document.getElementById('knifeChannelFilter'),null);
});
test('live chat subroute stays base-ready global-only rather than losing the entire scoped handshake',async t=>{
  const h=connected(t,{config:{brightness:1.25,previewVolume:25},mediaProfiles:media});await flush();
  h.dom.reconfigure({url:`https://chzzk.naver.com/live/${A}/chat`});h.api.reconcile();await flush();
  assert.equal(h.api.media.context.channelId,null);assert.equal(h.api.configReady,true);assert.equal(h.api.media.phase,'ready');
  assert.equal(h.api.config.brightness,1.25);assert.equal(h.api.config.previewVolume,25);
});
test('persisted hide retires reads and restored same-context delivery requires a fresh nonce',async t=>{
  const h=connected(t,{config:{brightness:1.25},mediaProfiles:media});await flush();const before=h.api.mediaRequestId;
  const old=h.messages.filter(data=>data.protocol===2&&data.type==='config').at(-1);assert.ok(old);
  h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pagehide',{persisted:true}));
  sendEnvelope(h.dom,{...old,deliverySequence:999});
  h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pageshow',{persisted:true}));await flush();
  assert.notEqual(h.api.mediaRequestId,before);assert.equal(h.api.media.phase,'ready');assert.equal(h.api.config.brightness,2);
  const restored=h.api.mediaRequestId;sendEnvelope(h.dom,{...old,deliverySequence:999});
  assert.equal(h.api.media.phase,'ready');assert.equal(h.api.mediaRequestId,restored);
});
test('global default ON is not requested while scoped data waits or after confirmed channel default OFF',async t=>{
  const audio={compressorDefault:false,compressorThreshold:-50,compressorKnee:40,compressorRatio:12,compressorAttack:0,compressorRelease:0.25};
  const raw={config:{compressorDefault:true},mediaProfiles:{schema:1,revision:1,channels:[{channelId:A,createdRevision:1,revision:1,audio:{createdRevision:1,values:audio}}],presets:[]}};
  const h=connected(t,raw,true),video=h.dom.window.document.querySelector('video');Object.defineProperty(video,'currentSrc',{value:'blob:https://chzzk.naver.com/test-media'});
  load(h.dom,'web/audio.js');let requests=0;const enable=h.api.audio.setEnabled;
  h.api.audio.setEnabled=(element,enabled)=>{if(enabled)requests++;return enable(element,enabled);};
  await flush();assert.equal(h.api.media.phase,'pending');assert.equal(requests,0);
  h.release();await flush();assert.equal(h.api.media.phase,'ready');assert.equal(h.api.config.compressorDefault,false);assert.equal(requests,0);
});
