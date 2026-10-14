const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {page}=require('./helpers.cjs');

const routerModule = () => import(pathToFileURL(path.resolve('scripts/extension-e2e/fixture-router.mjs')));
const ownedModule = () => import(pathToFileURL(path.resolve('scripts/owned-files.mjs')));

test('fixture router fulfills only exact allowlisted HTTPS URLs', async () => {
  const { FIXTURE_LIVE_URL, FIXTURE_CHANNEL_URL, loadFixtureResponses, fixtureDecision } = await routerModule();
  const { openOwnedRoot } = await ownedModule();
  const responses = await loadFixtureResponses(await openOwnedRoot(path.resolve('.')));

  assert.equal(FIXTURE_LIVE_URL, 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(FIXTURE_CHANNEL_URL, 'https://chzzk.naver.com/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(fixtureDecision(FIXTURE_LIVE_URL, responses).action, 'fulfill');
  assert.equal(fixtureDecision(FIXTURE_CHANNEL_URL, responses).action, 'fulfill');

  for (const url of [
    'https://api.chzzk.naver.com/service/v1/foo',
    'https://chzzk.naver.com/favicon.ico',
    'https://example.com/',
    `${FIXTURE_LIVE_URL}?variant=1`,
    FIXTURE_LIVE_URL.replace('https:', 'http:'),
  ]) assert.deepEqual(fixtureDecision(url, responses), { action: 'abort', reason: 'not-allowlisted' }, url);
});

test('fixture router rejects duplicate response URLs', async () => {
  const { loadFixtureResponses, fixtureDecision } = await routerModule();
  const { openOwnedRoot } = await ownedModule();
  const responses = await loadFixtureResponses(await openOwnedRoot(path.resolve('.')));
  assert.throws(() => fixtureDecision(responses[0].url, [...responses, { ...responses[0] }]), {
    code: 'fixture-response-duplicate',
  });
});

test('installed extension fixtures expose only deterministic integration anchors and bounded metadata', async () => {
  const { FIXTURE_LIVE_URL, FIXTURE_CHANNEL_URL, loadFixtureResponses, fixtureDecision } = await routerModule();
  const { openOwnedRoot } = await ownedModule();
  const responses = await loadFixtureResponses(await openOwnedRoot(path.resolve('.')));
  const live = fixtureDecision(FIXTURE_LIVE_URL, responses);
  const channel = fixtureDecision(FIXTURE_CHANNEL_URL, responses);
  const script = responses.find(response => response.contentType === 'text/javascript; charset=utf-8');

  assert.equal(live.status, 200);
  assert.equal(live.contentType, 'text/html; charset=utf-8');
  for (const anchor of ['id="layout-body"', 'id="live_player_layout"', 'class="pzp-pc"', '<video', 'id="sidebar"', 'live_chatting_ranking_container__fixture']) {
    assert.match(live.body, new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(live.body, new RegExp(FIXTURE_LIVE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(live.body, new RegExp(FIXTURE_CHANNEL_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(channel.body, /<video\b/i);
  assert.ok(script);
  assert.match(script.body, /Object\.defineProperty\(window, '__knifeFixture'/);
  assert.match(script.body, /pageshowPersisted/);
  assert.match(script.body, /pagehidePersisted/);
  assert.match(script.body, /requestId/);
  assert.match(script.body, /revision/);
  assert.doesNotMatch(script.body, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b/);
  assert.doesNotMatch(script.body, /\.config\s*=/);
});
test('fixture independently witnesses published v1 and current v2 metadata without retaining values or catalogue',async t=>{
  const {loadFixtureResponses}=await routerModule(),{openOwnedRoot}=await ownedModule();
  const script=(await loadFixtureResponses(await openOwnedRoot(path.resolve('.')))).find(response=>response.contentType==='text/javascript; charset=utf-8');
  const dom=page();t.after(()=>dom.window.close());dom.window.eval(script.body);
  const send=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window,origin:dom.window.location.origin,data}));
  send({namespace:'cheese-knife',protocol:1,type:'config',requestId:'published',revision:2,config:{private:'not retained'}});
  const state=dom.window.__knifeFixture;assert.equal(state.lastConfigEnvelopeV1.requestId,'published');assert.equal(state.lastConfigEnvelopeV2,null);
  const current={namespace:'cheese-knife',protocol:2,type:'config',requestId:'current',deliverySequence:4,
    context:{documentGeneration:1,routePath:'/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',channelId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',playerGeneration:2},
    version:{globalRevision:3,mediaRevision:1},audioBindingGeneration:2,mediaPhase:'ready',audioKind:'global',videoKind:'channel',
    profileState:'scoped',revisionStatus:'ready',baseConfig:{private:'do not retain'},effectiveConfig:{private:'do not retain'},presets:['SECRET LABEL']};
  send(current);assert.equal(state.lastConfigEnvelopeV2.deliverySequence,4);assert.equal(state.lastConfigEnvelopeV1.requestId,'published');
  assert.equal(JSON.stringify(state.lastConfigEnvelopeV2).includes('private'),false);assert.equal(JSON.stringify(state).includes('SECRET LABEL'),false);
  const before=JSON.stringify(state.lastConfigEnvelopeV2);
  for(const change of [{deliverySequence:-1},{requestId:'x'.repeat(129)},{context:{...current.context,channelId:'invalid'}},
    {context:{...current.context,routePath:'x'.repeat(2049)}},{version:{globalRevision:'bad',mediaRevision:0}},{mediaPhase:'wrong'}])send({...current,...change});
  assert.equal(JSON.stringify(state.lastConfigEnvelopeV2),before);
});
