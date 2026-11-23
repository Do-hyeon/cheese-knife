const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
