const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t, html = playerHTML, url) {
  const dom = page(html, url);
  t.after(async () => {
    dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
    await flush();
    dom.window.close();
  });
  load(dom, 'web/runtime.js');
  return dom;
}

test('runtime installs an own singleton instead of trusting an inherited symbol value', t => {
  const dom = page(playerHTML);
  const key = dom.window.Symbol.for('cheese-knife.runtime.v1');
  const prototype = Object.getPrototypeOf(dom.window);
  Object.defineProperty(prototype, key, { configurable: true, value: { foreign: true } });
  t.after(async () => {
    delete prototype[key];
    dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
    await flush(); dom.window.close();
  });
  load(dom, 'web/runtime.js');
  const descriptor = Object.getOwnPropertyDescriptor(dom.window, key);
  assert.ok(descriptor, 'the page runtime must be an own property');
  assert.notEqual(descriptor.value, prototype[key]);
  assert.equal(descriptor.value.requestId.startsWith('knife-'), true);
});

test('runtime status keys reject prototype names and preserve a bounded ordinary snapshot', t => {
  const dom = setup(t), knife = runtime(dom);
  const beforePrototype = Object.getPrototypeOf(knife.statuses);
  for (const key of ['__proto__', 'prototype', 'constructor', '', 'a'.repeat(41), 'bad key']) {
    knife.setStatus(key, 'ready', 'must-not-appear');
  }
  knife.setStatus('validFeature', 'limited', 'x'.repeat(100));
  assert.equal(Object.getPrototypeOf(knife.statuses), beforePrototype);
  assert.deepEqual(Object.keys(knife.statuses), ['validFeature']);
  assert.equal(knife.statuses.validFeature.state, 'limited');
  assert.equal(knife.statuses.validFeature.reason, 'x'.repeat(80));
});

test('VOD route remains VOD when the same player class is present', t => {
  const dom = setup(t, playerHTML.replace('live_player_layout', 'player_layout'), 'https://chzzk.naver.com/video/123456');
  assert.equal(runtime(dom).route().kind, 'vod');
  assert.equal(runtime(dom).selectPlayer().video.tagName, 'VIDEO');
});

test('nonchannel paths and excluded routes cannot become channel/player routes', t => {
  const dom = setup(t, playerHTML, 'https://chzzk.naver.com/following');
  assert.equal(runtime(dom).route().kind, 'explore');
  assert.equal(runtime(dom).selectPlayer(), null);
  dom.reconfigure({ url: 'https://chzzk.naver.com/settings/anything' });
  assert.equal(runtime(dom).route().kind, 'excluded');
});

test('preview video is not selected as the main player', t => {
  const dom = setup(t, '<div class="knife-preview"><div class="pzp-pc"><video></video></div></div>' + playerHTML);
  assert.equal(runtime(dom).selectPlayer().video.closest('#live_player_layout').id, 'live_player_layout');
});

test('delayed root and video replacement are reconciled without duplicate runtime', async t => {
  const dom = setup(t, '');
  const original = runtime(dom);
  load(dom, 'web/runtime.js');
  assert.equal(runtime(dom), original);
  dom.window.document.body.innerHTML = playerHTML;
  await flush();
  const first = runtime(dom).state.player.video;
  first.replaceWith(dom.window.document.createElement('video'));
  await flush();
  assert.notEqual(runtime(dom).state.player.video, first);
});

test('config accepts current same-window response and rejects null, foreign, stale messages', t => {
  const dom = setup(t);
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: null }));
  deliver(dom, { arrowSeek: false }, 2);
  deliver(dom, { arrowSeek: true }, 1);
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { source: null,
    origin: 'https://other.invalid', data: { namespace: 'cheese-knife', protocol: 1, type: 'config', revision: 3, config: { arrowSeek: true } } }));
  assert.equal(runtime(dom).config.arrowSeek, false);
  assert.equal(runtime(dom).configReady, true);
});

test('resource scope disposal removes listeners and timers exactly once', async t => {
  const dom = setup(t);
  const scope = runtime(dom).createScope();
  let calls = 0;
  scope.on(dom.window, 'sample', () => calls++);
  scope.timeout(() => calls++, 5);
  scope.dispose(); scope.dispose();
  dom.window.dispatchEvent(new dom.window.Event('sample'));
  await flush();
  assert.equal(calls, 0);
});
test('same-route runtimes keep window-local configuration and scopes', async t => {
  const a = setup(t), b = setup(t);
  deliver(a, { preview: false }, 1); deliver(b, { preview: true }, 1);
  assert.notEqual(runtime(a), runtime(b)); assert.equal(runtime(a).config.preview, false); assert.equal(runtime(b).config.preview, true);
  const scopeA = runtime(a).createScope(), scopeB = runtime(b).createScope(); let calls = 0;
  scopeB.on(b.window, 'local-sample', () => calls++); scopeA.dispose();
  b.window.dispatchEvent(new b.window.Event('local-sample')); assert.equal(calls, 1); scopeB.dispose();
});
