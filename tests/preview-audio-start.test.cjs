const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, clock } = require('./helpers.cjs');

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture(t, options = {}) {
  const dom = page(playerHTML + '<aside id="sidebar"><a id="one" href="/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb">One</a><a id="two" href="/live/cccccccccccccccccccccccccccccccc">Two</a></aside>');
  const time = clock(dom), document = dom.window.document, calls = [], instances = [], states = new WeakMap();
  dom.window.Date.now = () => dom.window.performance.now();
  const state = video => { if (!states.has(video)) states.set(video, { paused: true }); return states.get(video); };
  Object.defineProperty(dom.window.HTMLMediaElement.prototype, 'paused', { get() { return state(this).paused; } });
  Object.defineProperty(dom.window.HTMLMediaElement.prototype, 'currentTime', { get() { return state(this).paused ? 0 : dom.window.performance.now() / 1000; } });
  dom.window.HTMLMediaElement.prototype.pause = function () { state(this).paused = true; };
  dom.window.HTMLMediaElement.prototype.load = () => {};
  dom.window.HTMLMediaElement.prototype.canPlayType = () => 'maybe';
  dom.window.HTMLMediaElement.prototype.play = function () {
    calls.push({ video: this, muted: this.muted, hidden: document.querySelector('.knife-preview').hidden });
    if (options.playingBeforeResolve) state(this).paused = false;
    const result = options.play?.(this, calls.length) || Promise.resolve();
    return result.then(() => { state(this).paused = false; });
  };
  class Stream {
    static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest' };
    static isSupported() { return !options.native; }
    constructor() { this.handlers = new Map(); this.levels = [{ height: 480 }]; this.destroyed = 0; instances.push(this); }
    on(type, fn) { this.handlers.set(type, fn); } emit(type, value) { this.handlers.get(type)?.(type, value); }
    loadSource() {} attachMedia(v) { this.video = v; } startLoad() {} recoverMediaError() {}
    destroy() { this.destroyed++; }
  }
  const info = { ok: true, json: async () => ({ code: 200, content: { status: 'OPEN', adult: false,
    livePlaybackJson: JSON.stringify({ media: [{ mediaId: 'HLS', path: 'https://media.invalid/master.m3u8' }] }) } }) };
  dom.window.fetch = () => options.fetch || Promise.resolve(info);
  for (const a of document.querySelectorAll('#sidebar a')) a.getBoundingClientRect = () => ({ left: 20, top: 30, bottom: 50, width: 180 });
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  const config = { preview: true, livePreview: true, previewWidth: 400, previewDelay: 1, previewVolume: 5,
    rightClickToUnmute: true, previewStartUnmuted: true, ...options.config };
  deliver(dom, config); runtime(dom).Hls = Stream; load(dom, 'web/preview.js');
  t.after(() => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); dom.window.close(); });
  return { dom, document, calls, instances, config, info, one: document.querySelector('#one'), two: document.querySelector('#two'),
    advance: ms => time.advance(ms), video: () => document.querySelector('.knife-preview-video'),
    notice: () => document.querySelector('.knife-preview-audio-note'),
    async show(anchor = document.querySelector('#one')) { await runtime(dom).preview.show(anchor.href, anchor, true); return this.video(); },
    ready(video = document.querySelector('.knife-preview-video')) { video.dispatchEvent(new dom.window.Event('loadeddata')); },
    toggle(anchor = document.querySelector('#one')) { anchor.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); },
  };
}

// Break caught: unmuted playback must wait for the extension's visible panel,
// not merely for media readiness. Decoding/play-policy is the external boundary.
for (const native of [false, true]) for (const volume of [0, 5, 100]) test(`visible preview starts unmuted at volume=${volume}, native=${native}`, async t => {
  const f = fixture(t, { native, config: { previewVolume: volume } }); const v = await f.show();
  f.ready(); await f.advance(999); assert.equal(f.calls.length, 0); assert.equal(v.muted, true);
  await f.advance(1); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].muted, false);
  assert.equal(f.calls[0].hidden, false); assert.equal(v.volume, volume / 100);
  assert.equal(runtime(f.dom).statuses.livePreview.state, 'ready');
});

test('data readiness after panel display starts once without another hover delay', async t => {
  const f = fixture(t); await f.show(); await f.advance(1000); assert.equal(f.calls.length, 0);
  f.ready(); await f.advance(0); assert.equal(f.calls.length, 1); assert.equal(f.video().muted, false);
});

test('default OFF retains muted preload before panel display', async t => {
  const f = fixture(t, { config: { previewStartUnmuted: false } }); await f.show(); f.ready(); await f.advance(0);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].muted, true); assert.equal(f.calls[0].hidden, true);
});

test('startup preference is captured before pending metadata, not at video creation', async t => {
  const request = deferred(), f = fixture(t, { fetch: request.promise }); const showing = f.show();
  deliver(f.dom, { ...f.config, previewStartUnmuted: false }, 2);
  request.resolve(f.info); await showing; f.ready(); await f.advance(1000);
  assert.equal(f.calls[0].muted, false);
  runtime(f.dom).preview.hide(); await f.show(f.two); f.ready(); await f.advance(0);
  assert.equal(f.calls[1].muted, true, 'only the subsequent hover adopts OFF');
});

for (const rightClick of [true, false]) test('policy denial preserves video through one muted fallback, rightClick=' + rightClick, async t => {
  const f = fixture(t, { config: { rightClickToUnmute: rightClick }, play: (_v, n) => n === 1 ? Promise.reject(Object.assign(new Error(), { name: 'NotAllowedError' })) : Promise.resolve() });
  await f.show(); f.ready(); await f.advance(1000);
  assert.deepEqual(f.calls.map(c => c.muted), [false, true]); assert.equal(f.video().muted, true);
  assert.equal(runtime(f.dom).statuses.livePreview.state, 'ready');
  assert.ok(f.notice() && !f.notice().hidden && f.notice().textContent.length, 'visible fallback explanation');
  if (!rightClick) assert.doesNotMatch(f.notice().textContent, /right.click|우클릭/i);
  f.video().dispatchEvent(new f.dom.window.Event('playing')); await f.advance(0);
  assert.equal(f.notice().hidden, false, 'generic readiness cannot erase sound failure');
  if (rightClick) { f.toggle(); await f.advance(0); assert.equal(f.video().muted, false); assert.equal(f.notice().hidden, true); }
});

test('native DOMException policy denial preserves video through one muted fallback', async t => {
  const f = fixture(t, { play: (video, n) => n === 1
    ? Promise.reject(new video.ownerDocument.defaultView.DOMException('Autoplay denied', 'NotAllowedError'))
    : Promise.resolve() });
  await f.show(); f.ready(); await f.advance(1000);
  assert.deepEqual(f.calls.map(call => call.muted), [false, true]);
  assert.equal(f.instances[0].destroyed, 0);
  assert.equal(runtime(f.dom).statuses.livePreview.state, 'ready');
});

test('fallback budget is spent before awaiting and survives repeated readiness/recovery', async t => {
  const fallback = deferred(), f = fixture(t, { play: (_v, n) => n === 1 ? Promise.reject(Object.assign(new Error(), { name: 'NotAllowedError' })) : fallback.promise });
  await f.show(); f.ready(); await f.advance(1000); f.ready(); f.ready(); await f.advance(0);
  assert.equal(f.calls.length, 2); assert.equal(f.video().muted, true);
  f.instances[0].emit('error', { fatal: true, type: 'mediaError' }); f.ready(); await f.advance(0);
  assert.ok(f.calls.every((c, i) => i === 0 || c.muted), 'recovery cannot restore an automatic sound attempt');
  fallback.reject(Object.assign(new Error(), { name: 'NotAllowedError' })); await f.advance(0);
  assert.equal(runtime(f.dom).statuses.livePreview.state, 'limited');
});

test('successful muted recovery retains policy notice when original fallback completion is stale', async t => {
  const fallback = deferred(), f = fixture(t, { play: (_v, n) => n === 1
    ? Promise.reject(Object.assign(new Error(), { name: 'NotAllowedError' })) : n === 2 ? fallback.promise : Promise.resolve() });
  await f.show(); f.ready(); await f.advance(1000);
  f.instances[0].emit('error', { fatal: true, type: 'mediaError' }); f.ready(); await f.advance(0);
  assert.deepEqual(f.calls.map(c => c.muted), [false, true, true]);
  assert.equal(f.video().paused, false); assert.equal(runtime(f.dom).statuses.livePreview.state, 'ready');
  assert.ok(f.notice() && !f.notice().hidden && f.notice().textContent.length, 'successful recovered muted playback must expose the retained policy cause');
  fallback.reject(Object.assign(new Error(), { name: 'AbortError' })); await f.advance(0);
  assert.equal(f.notice().hidden, false, 'obsolete recovery promise must not remove the notice');
  assert.equal(runtime(f.dom).statuses.livePreview.state, 'ready');
});

test('a non-policy startup error does not gain a muted retry', async t => {
  const f = fixture(t, { play: () => Promise.reject(Object.assign(new Error(), { name: 'NotSupportedError' })) });
  await f.show(); f.ready(); await f.advance(1000);
  assert.equal(f.calls.length, 1); assert.equal(runtime(f.dom).statuses.livePreview.state, 'limited');
});

test('manual mute during pending startup preserves valid successful playback completion', async t => {
  const pending = deferred(), f = fixture(t, { playingBeforeResolve: true, play: () => pending.promise }); await f.show(); f.ready(); await f.advance(1000);
  f.toggle(); assert.equal(f.video().muted, true); assert.equal(f.calls.length, 1, 'manual mute of playing media must not create a second successful request that masks original readiness');
  pending.resolve(); await f.advance(14000);
  assert.equal(runtime(f.dom).statuses.livePreview.state, 'ready', 'stale audio intent must not lose loaded/progress');
  assert.equal(f.video().muted, true);
});

test('hidden manual toggle cannot start audio or override the visible-start gate', async t => {
  const f = fixture(t); await f.show(); f.ready(); f.toggle(); await f.advance(500);
  assert.equal(f.calls.length, 0); assert.equal(f.video().muted, true);
  await f.advance(500); assert.equal(f.calls[0].muted, true, 'manual mute intent wins over ON preference');
});

test('old startup rejection cannot undo a newer successful explicit resume', async t => {
  const pending = deferred(), f = fixture(t, { play: (_v, n) => n === 1 ? pending.promise : Promise.resolve() });
  await f.show(); f.ready(); await f.advance(1000); f.toggle(); f.toggle(); await f.advance(0);
  pending.reject(Object.assign(new Error(), { name: 'NotAllowedError' })); await f.advance(0);
  assert.equal(f.video().muted, false); assert.equal(f.video().paused, false);
  assert.equal(runtime(f.dom).statuses.livePreview.state, 'ready');
  assert.ok(!f.notice() || f.notice().hidden);
});

test('fallback shares original fifteen-second startup deadline', async t => {
  const first = deferred(), fallback = deferred(), f = fixture(t, { play: (_v, n) => n === 1 ? first.promise : fallback.promise });
  await f.show(); f.ready(); await f.advance(14000);
  first.reject(Object.assign(new Error(), { name: 'NotAllowedError' })); await f.advance(0);
  assert.equal(f.calls.length, 2); await f.advance(1000);
  assert.equal(runtime(f.dom).statuses.livePreview.state, 'limited');
  fallback.resolve(); await f.advance(0); assert.equal(runtime(f.dom).statuses.livePreview.state, 'limited');
});

test('late policy rejection after hover replacement cannot mute or fail the new video', async t => {
  const first = deferred(), f = fixture(t, { play: (_v, n) => n === 1 ? first.promise : Promise.resolve() });
  await f.show(); f.ready(); await f.advance(1000); const old = f.video();
  await f.show(f.two); f.ready(); await f.advance(1000); const next = f.video();
  first.reject(Object.assign(new Error(), { name: 'NotAllowedError' })); await f.advance(0);
  assert.equal(old.isConnected, false); assert.equal(next.muted, false); assert.equal(next.paused, false);
  assert.equal(runtime(f.dom).statuses.livePreview.state, 'ready');
});

test('volume zero to positive changes volume but does not grant a new startup or fallback', async t => {
  const f = fixture(t, { config: { previewVolume: 0 } }); await f.show(); f.ready(); await f.advance(1000);
  deliver(f.dom, { ...f.config, previewVolume: 25 }, 2); await f.advance(0);
  assert.equal(f.video().volume, 0.25); assert.equal(f.video().muted, false); assert.equal(f.calls.length, 1);
});

test('blocked-sound notice does not trigger an unbounded DOM observation loop', async t => {
  const f = fixture(t, { play: (_v, n) => n === 1 ? Promise.reject(Object.assign(new Error(), { name: 'NotAllowedError' })) : Promise.resolve() });
  await f.show(); let changes = 0;
  const observer = new f.dom.window.MutationObserver(records => {
    changes += records.filter(r => r.target === f.notice()).length;
    if (changes > 8) { observer.disconnect(); runtime(f.dom).preview.hide(); }
  });
  observer.observe(f.document, { childList: true, subtree: true }); t.after(() => observer.disconnect());
  f.ready(); await f.advance(1000); await f.advance(0);
  assert.ok(changes <= 3, 'the same explanation must not continually rewrite its own observed subtree: ' + changes);
});

test('start-unmuted option does not change primary or native-card audio', async t => {
  const f = fixture(t); const primary = f.document.querySelector('.pzp-pc video'); primary.muted = true; primary.volume = 0.3;
  const card = f.document.createElement('a'); card.href = f.two.href;
  const native = f.document.createElement('video'); native.muted = true; native.volume = 0.7; card.append(native); f.document.querySelector('#layout-body').append(card);
  await runtime(f.dom).preview.show(card.href, card, false); assert.equal(f.calls.length, 0);
  await f.show(); f.ready(); await f.advance(1000);
  assert.equal(primary.muted, true); assert.equal(primary.volume, 0.3); assert.equal(native.muted, true); assert.equal(native.volume, 0.7);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].video, f.video());
});

test('live-preview OFF stops media started after an OFF-to-ON metadata race', async t => {
  const response = deferred(), f = fixture(t, { fetch: response.promise, config: { livePreview: false } });
  const showing = f.show(); deliver(f.dom, { ...f.config, livePreview: true }, 2);
  response.resolve(f.info); await showing; f.ready(); await f.advance(1000);
  const v = f.video(); assert.equal(v.paused, false); assert.equal(v.muted, false);
  deliver(f.dom, { ...f.config, livePreview: false }, 3); await f.advance(0);
  assert.equal(v.isConnected, false, 'disablement must retire actual media, not rely on the pre-metadata setting snapshot');
  assert.equal(f.video(), null); assert.equal(f.instances[0].destroyed, 1);
});
