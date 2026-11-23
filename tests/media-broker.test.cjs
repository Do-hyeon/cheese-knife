const test = require('node:test');
const assert = require('node:assert/strict');
const {settingsHarness,config,getURL,extensionId} = require('./settings-fixture.cjs');
const A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', B='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const P='11111111-1111-4111-8111-111111111111';
const audio={compressorDefault:false,compressorThreshold:-50,compressorKnee:40,compressorRatio:12,compressorAttack:0,compressorRelease:0.25};
const current={kind:'current',tabId:7,windowId:9,channelId:A},saved={kind:'saved',channelId:A};
const channelToken={channelId:A,recordCreatedRevision:1,domainCreatedRevision:1};
let sequence=0;
const send=(h,body,sender)=>h.send('popup',{namespace:'cheese-knife-settings',protocol:2,requestId:`media-test-${++sequence}`,...body},
  sender?{id:extensionId,url:getURL('popup.html'),frameId:0,...sender}:undefined);
const enable=(selection=current,media=0,global=0)=>({action:'enable-channel-domain',selection,domain:'audio',expectedGlobalRevision:global,expectedMediaRevision:media,expectedRecord:null});
const patch=values=>({action:'patch-channel-fields',selection:saved,domain:'audio',channelToken,patch:values});
const count=(h,kind)=>h.calls.filter(call=>call.kind===kind).length;
async function fresh(t,raw={}) {const h=settingsHarness(t,raw);await h.initialize();await h.settle();return h;}
async function enabled(t,raw={}) {const h=await fresh(t,raw),reply=await send(h,enable(current,0,raw.settingsRevision||0));assert.equal(reply.ok,true,reply.code);return h;}

test('v2 reads are own-page only and do not create media data or change unknown globals',async t=>{
  const raw={config:{futureFlag:'keep',brightness:1.225},untouched:{value:1}},h=await fresh(t,raw);
  const reply=await send(h,{action:'get-media-snapshot',selection:{kind:'global'}});
  assert.equal(reply.ok,true,reply.code);assert.equal(reply.protocol,2);
  assert.deepEqual(structuredClone(reply.snapshot.version),{globalRevision:0,mediaRevision:0});
  assert.equal(reply.snapshot.values.video.brightness,1.225);
  assert.deepEqual(structuredClone(reply.snapshot.values.audio),audio);
  assert.equal(count(h,'commit'),0);assert.deepEqual(h.saved,raw);
});

test('first explicit save writes exactly one media item independent of global revision and CSS',async t=>{
  const raw={config:{futureFlag:'keep'},untouched:{value:1}},h=await enabled(t,raw);
  assert.equal(h.saved.mediaProfiles.revision,1);assert.deepEqual(h.saved.mediaProfiles.channels[0].audio.values,audio);
  const writes=h.calls.filter(call=>call.kind==='commit');assert.equal(writes.length,1);
  assert.deepEqual(Object.keys(writes[0].args.value),['mediaProfiles']);
  assert.deepEqual(h.saved.config,raw.config);assert.deepEqual(h.saved.untouched,raw.untouched);
  assert.equal(Object.hasOwn(h.saved,'settingsRevision'),false);assert.equal(count(h,'css-register'),0);
});

test('different windows merge different fields and same-field commit order wins',async t=>{
  const h=await enabled(t);
  const replies=await Promise.all([send(h,patch({compressorThreshold:-35})),send(h,patch({compressorRatio:8.125}))]);
  assert.ok(replies.every(reply=>reply.ok));assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorThreshold,-35);
  assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorRatio,8.125);
  await Promise.all([send(h,patch({compressorThreshold:-25})),send(h,patch({compressorThreshold:-20}))]);
  assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorThreshold,-20);assert.equal(h.maxConcurrentWrites,1);
});

test('global and media edits use the same serial writer and preserve unrelated keys',async t=>{
  const h=await enabled(t,{untouched:'keep'}),gate=h.holdNext('commit');
  const media=send(h,patch({compressorThreshold:-30}));await gate.reached;
  const global=h.patch('popup',[config('previewVolume',25)]);gate.release();
  assert.equal((await media).ok,true);assert.equal((await global).stored,true);await h.settle();
  assert.equal(h.saved.config.previewVolume,25);assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorThreshold,-30);
  assert.equal(h.saved.settingsRevision,1);assert.equal(h.saved.mediaProfiles.revision,2);assert.equal(h.saved.untouched,'keep');
  assert.equal(h.maxConcurrentWrites,1);
});

test('current target navigation refuses old channel but explicit saved management never retargets',async t=>{
  const h=await enabled(t),before=structuredClone(h.saved),gate=h.holdNext('tab-get');
  const pending=send(h,{...patch({compressorThreshold:-25}),selection:current});await gate.reached;
  h.tabs.get(7).url=`https://chzzk.naver.com/live/${B}`;gate.release();
  assert.equal((await pending).code,'target-channel-changed');assert.deepEqual(h.saved,before);
  assert.equal((await send(h,patch({compressorThreshold:-25}))).ok,true);
  assert.equal(h.saved.mediaProfiles.channels.length,1);assert.equal(h.saved.mediaProfiles.channels[0].channelId,A);
});

test('unknown document iframe and caller supplied context flags cannot authorize media writes',async t=>{
  const h=await fresh(t);
  for(const [sender,code] of [[{id:'foreign'},'invalid-sender'],[{url:`https://chzzk.naver.com/live/${A}`},'invalid-sender'],
    [{frameId:2},'invalid-sender'],[{documentId:'unknown-document'},'sender-context-unavailable']]) {
    assert.equal((await send(h,enable(),sender)).code,code);
  }
  assert.equal((await send(h,{...enable(),incognito:false})).code,'invalid-request');
  assert.equal(count(h,'commit'),0);assert.equal(Object.hasOwn(h.saved,'mediaProfiles'),false);
});

test('real context incognito metadata and target incognito each fail closed',async t=>{
  const h=await fresh(t);assert.ok(h.contexts,'fixture must expose real-context boundary controls');
  assert.equal((await send(h,{action:'get-media-snapshot',selection:{kind:'global'}})).ok,true,'v2 reader must exist before context fault injection');
  const gate=h.holdNext('context-get'),pending=send(h,enable());const filter=await gate.reached;
  h.contexts.get(filter.documentIds[0]).incognito=true;gate.release();
  assert.equal((await pending).code,'incognito-media-disabled');
  h.tabs.get(7).incognito=true;
  assert.equal((await send(h,enable())).code,'incognito-media-disabled');assert.equal(count(h,'commit'),0);
});

test('malformed media is preserved and does not put valid global edits into repair',async t=>{
  const raw={mediaProfiles:{schema:99,revision:0,channels:[],presets:[]},config:{futureFlag:'keep'}},h=await fresh(t,raw);
  const snapshot=await send(h,{action:'get-media-snapshot',selection:{kind:'global'}});
  assert.equal(snapshot.ok,true);assert.equal(snapshot.snapshot.profileState,'repair-required');
  assert.equal(snapshot.snapshot.version.mediaRevision,null);
  assert.equal((await send(h,enable())).code,'unsupported-media-schema');
  assert.equal((await h.patch('popup',[config('brightness',1.225)])).stored,true);
  assert.equal(h.saved.config.brightness,1.225);assert.equal(h.saved.config.futureFlag,'keep');assert.deepEqual(h.saved.mediaProfiles,raw.mediaProfiles);
});

test('read and write failures preserve raw media while committed unknown ACK is not replayed',async t=>{
  const h=await fresh(t);
  assert.equal((await send(h,{action:'get-media-snapshot',selection:{kind:'global'}})).ok,true,'v2 reader must exist before fault injection');
  const read=h.holdNext('read'),reading=send(h,{action:'get-media-snapshot',selection:{kind:'global'}});
  await read.reached;read.fail();assert.equal((await reading).code,'storage-read-failed');
  const write=h.holdNext('commit'),writing=send(h,enable());await write.reached;write.fail();
  assert.equal((await writing).code,'storage-write-failed');assert.equal(Object.hasOwn(h.saved,'mediaProfiles'),false);
  const ack=h.holdNext('write-result'),unknown=send(h,enable());await ack.reached;ack.fail();
  assert.equal((await unknown).stored,false);assert.equal(h.saved.mediaProfiles.revision,1);
  const before=count(h,'commit'),confirmed=await send(h,enable());assert.equal(confirmed.ok,true);
  assert.equal(count(h,'commit'),before);assert.equal(h.saved.mediaProfiles.revision,1);
});

test('preset deleted and recreated with same UUID/revision rejects old source on both apply paths',async t=>{
  const h=await enabled(t),create={action:'create-preset',id:P,expectedMediaRevision:1,domain:'audio',name:'Quiet',values:{...audio,compressorThreshold:-35}};
  assert.equal((await send(h,create)).ok,true);
  const token={id:P,createdRevision:2,revision:1};assert.equal((await send(h,{action:'delete-preset',presetToken:token})).ok,true);
  assert.equal((await send(h,{...create,expectedMediaRevision:3})).ok,true);
  const before=structuredClone(h.saved),writes=count(h,'commit');
  assert.equal((await send(h,{action:'replace-channel-domain',selection:saved,channelToken,domain:'audio',expectedRecordRevision:1,presetToken:token})).code,'conflict');
  assert.equal((await send(h,{action:'apply-preset-global',presetToken:token,expectedGlobalRevision:0})).code,'conflict');
  assert.deepEqual(h.saved,before);assert.equal(count(h,'commit'),writes);
});

test('global preset apply writes only existing global fields and leaves media bytes intact',async t=>{
  const h=await enabled(t,{config:{futureFlag:'keep'},futureTop:7});
  assert.equal((await send(h,{action:'create-preset',id:P,expectedMediaRevision:1,domain:'audio',name:'Quiet',values:{...audio,compressorThreshold:-35}})).ok,true);
  const media=structuredClone(h.saved.mediaProfiles),reply=await send(h,{action:'apply-preset-global',presetToken:{id:P,createdRevision:2,revision:1},expectedGlobalRevision:0});
  assert.equal(reply.ok,true);assert.equal(h.saved.config.compressorThreshold,-35);assert.equal(h.saved.config.futureFlag,'keep');
  assert.equal(h.saved.futureTop,7);assert.deepEqual(h.saved.mediaProfiles,media);assert.equal(h.saved.settingsRevision,1);
  assert.deepEqual(Object.keys(h.calls.filter(call=>call.kind==='commit').at(-1).args.value).sort(),['config','settingsRevision']);
});

test('queue saturation preserves the existing64 bound with mixed generation requests',async t=>{
  const h=await fresh(t),gate=h.holdNext('commit');
  const first=h.patch('popup',[config('arrowSeek',false)]);await gate.reached;
  const queued=Array.from({length:64},()=>send(h,{action:'get-media-snapshot',selection:{kind:'global'}}));
  const excess=await send(h,{action:'get-media-snapshot',selection:{kind:'global'}});gate.release();
  await first;await Promise.all(queued);assert.equal(excess.code,'settings-busy');assert.equal(h.maxConcurrentWrites,1);
});

test('sender and current target are checked again after the storage read and before commit',async t=>{
  for(const kind of ['sender','target']) {
    const h=await enabled(t);await h.settle();const before=structuredClone(h.saved),gate=h.holdNext('read');
    const pending=send(h,{...patch({compressorThreshold:-25}),selection:current});await gate.reached;
    if(kind==='sender') h.contexts.clear(); else h.tabs.get(7).url=`https://chzzk.naver.com/live/${B}`;
    gate.release();assert.equal((await pending).code,kind==='sender'?'sender-context-unavailable':'target-channel-changed');
    assert.deepEqual(h.saved,before);
  }
});

test('unknown context API and mismatched browser facts fail closed without changing global availability',async t=>{
  for(const change of [context=>{context.documentOrigin='https://chzzk.naver.com';},context=>{context.frameId=2;},
    context=>{delete context.incognito;},context=>{context.contextType='BACKGROUND';}]) {
    const h=await fresh(t),gate=h.holdNext('context-get'),pending=send(h,enable());const filter=await gate.reached;
    change(h.contexts.get(filter.documentIds[0]));gate.release();assert.equal((await pending).code,'sender-context-unavailable');
    assert.equal(count(h,'commit'),0);assert.equal((await h.snapshot()).ok,true);
  }
});

test('channel domain reset and recreate cannot accept old creation tokens and preserve the other domain',async t=>{
  const h=await enabled(t);
  assert.equal((await send(h,{...enable(saved,1),domain:'video',expectedRecord:{createdRevision:1,revision:1}})).ok,true);
  assert.equal((await send(h,{action:'patch-channel-fields',selection:saved,domain:'video',channelToken:{...channelToken,domainCreatedRevision:2},patch:{brightness:1.225}})).ok,true);
  assert.equal((await send(h,{action:'reset-channel-domain',selection:saved,domain:'audio',recordCreatedRevision:1,domainCreatedRevision:1,expectedRecordRevision:3})).ok,true);
  assert.equal(h.saved.mediaProfiles.channels[0].video.values.brightness,1.225);
  assert.equal((await send(h,{...enable(saved,4),expectedRecord:{createdRevision:1,revision:4}})).ok,true);
  const before=structuredClone(h.saved),writes=count(h,'commit');
  assert.equal((await send(h,patch({compressorRatio:5}))).code,'conflict');assert.deepEqual(h.saved,before);
  assert.equal(count(h,'commit'),writes);
});

test('invalid v2 shapes values labels and tokens do not write or poison the existing writer',async t=>{
  const h=await enabled(t),before=structuredClone(h.saved),writes=count(h,'commit');
  for(const request of [{...patch({compressorRatio:21})},{...patch({brightness:1})},
    {...patch({compressorRatio:5}),channelToken:{...channelToken,extra:true}},
    {...enable(),selection:{...saved,incognito:false}},
    {action:'create-preset',id:P,expectedMediaRevision:1,domain:'audio',name:'\u202eHidden',values:audio},
    {action:'create-preset',id:P,expectedMediaRevision:1,domain:'audio',name:'Quiet',values:{...audio,extra:1}}]) {
    assert.equal((await send(h,request)).code,'invalid-request');
  }
  assert.deepEqual(h.saved,before);assert.equal(count(h,'commit'),writes);
  assert.equal((await h.patch('popup',[config('previewVolume',25)])).ok,true);
});
