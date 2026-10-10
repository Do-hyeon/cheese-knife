const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function previewFixture(t, config = {}) {
  const dom = page(playerHTML + '<aside id="sidebar"><a id="side" href="/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb">Live</a></aside>');
  const side = dom.window.document.getElementById('side');
  side.getBoundingClientRect = () => ({ left: 20, top: 40, bottom: 70, width: 180, height: 30 });
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.HTMLMediaElement.prototype.load = () => {};
  dom.window.HTMLMediaElement.prototype.play = async () => {};
  const instances = [];
  class Stream {
    static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    static isSupported() { return true; }
    constructor(options) {
      this.config = options; this.handlers = new Map(); this.destroyed = 0; this.recoveries = 0;
      this.starts = []; this.manual = -1; this.startLevel = -1;
      this.levels = [{ height: 720 }, { height: 240 }, { height: 480 }, { height: 360 }];
      instances.push(this);
    }
    on(event, fn) { this.handlers.set(event, fn); }
    emit(event, data) { this.handlers.get(event)?.(event, data); }
    loadSource() {} attachMedia(video) { this.video = video; }
    startLoad() { this.starts.push(this.startLevel); }
    recoverMediaError() { this.recoveries++; }
    destroy() { this.destroyed++; }
    set currentLevel(value) { this.manual = value; }
    get autoLevelEnabled() { return this.manual === -1; }
  }
  const requests = [];
  dom.window.fetch = async url => {
    requests.push(url);
    return { ok: true, json: async () => ({ code: 200, content: {
      status: 'OPEN', adult: false, liveImageUrl: 'https://images.invalid/live.jpg',
      livePlaybackJson: JSON.stringify({ media: [{ mediaId: 'HLS', path: 'https://media.invalid/master.m3u8' }] }),
    } }) };
  };
  load(dom, 'web/runtime.js');
  const values = { preview: true, livePreview: true, previewDelay: 0.1, previewWidth: 400, previewVolume: 5, rightClickToUnmute: true, ...config };
  deliver(dom, values); runtime(dom).Hls = Stream; load(dom, 'web/preview.js');
  t.after(() => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); dom.window.close(); });
  return { dom, side, values, requests, instances, preview: runtime(dom).preview,
    async show() { await runtime(dom).preview.show(side.href, side, true); return dom.window.document.querySelector('.knife-preview-video'); } };
}

for (const volume of [0, 5, 100]) test('sidebar preview initializes muted at configured volume ' + volume, async t => {
  const fixture = previewFixture(t, { previewVolume: volume }); const video = await fixture.show();
  assert.equal(video.volume, volume / 100); assert.equal(video.muted, true);
});

for (const muted of [true, false]) test('active sidebar volume updates without changing muted=' + muted, async t => {
  const fixture = previewFixture(t); const video = await fixture.show();
  if (!muted) fixture.side.dispatchEvent(new fixture.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  deliver(fixture.dom, { ...fixture.values, previewVolume: 25 }, 2);
  assert.equal(video.volume, 0.25); assert.equal(video.muted, muted);
});

test('retired custom-preview settings cannot request a main-card stream or change its native audio', async t => {
  const fixture = previewFixture(t, { customPreview: true }); const { dom } = fixture;
  dom.window.document.getElementById('layout-body').insertAdjacentHTML('beforeend', '<a id="card" href="/live/cccccccccccccccccccccccccccccccc"><video></video></a>');
  const card = dom.window.document.getElementById('card'); const native = card.querySelector('video');
  native.muted = true; native.volume = 0.7;
  card.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
  await fixture.preview.show(card.href, card, false);
  const click = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }); native.dispatchEvent(click);
  assert.equal(fixture.requests.length, 0); assert.equal(native.muted, true); assert.equal(native.volume, 0.7);
  assert.equal(click.defaultPrevented, false); assert.equal(dom.window.document.querySelector('.knife-preview'), null);
});

test('moving an active sidebar anchor to the main content disposes its stream', async t => {
  const fixture = previewFixture(t); await fixture.show();
  fixture.dom.window.document.getElementById('layout-body').append(fixture.side); await flush();
  assert.equal(fixture.dom.window.document.querySelector('.knife-preview-video'), null);
  assert.equal(fixture.instances[0].destroyed, 1);
  await fixture.preview.show(fixture.side.href, fixture.side, true);
  assert.equal(fixture.requests.length, 1);
});

test('unmuting toggles once on the owning sidebar anchor and leaves unrelated anchors alone', async t => {
  const fixture = previewFixture(t); const video = await fixture.show();
  const click = new fixture.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  fixture.side.dispatchEvent(click);
  assert.equal(video.muted, false); assert.equal(video.volume, 0.05); assert.equal(click.defaultPrevented, true);
  fixture.side.dispatchEvent(new fixture.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  assert.equal(video.muted, true);
});

test('startup chooses a size-appropriate level before loading without disabling automatic adaptation', async t => {
  const fixture = previewFixture(t); await fixture.show(); const stream = fixture.instances[0];
  stream.emit('manifest');
  assert.equal(stream.autoLevelEnabled, true, 'no permanent manual rendition lock');
  assert.equal(stream.config.autoStartLoad, false, 'first fragment waits for startup selection');
  assert.deepEqual(stream.starts, [2], '480p index in deliberately unsorted levels');
});

test('a native HLS maybe response does not bypass an available bundled streaming backend', async t => {
  const fixture = previewFixture(t);
  fixture.dom.window.HTMLMediaElement.prototype.canPlayType = () => 'maybe';
  const video = await fixture.show();
  assert.equal(fixture.instances.length, 1);
  assert.equal(video.getAttribute('src'), null, 'do not assign an unproven native playlist directly');
});

test('native HLS remains a fallback when MediaSource streaming is unavailable', async t => {
  const fixture = previewFixture(t);
  runtime(fixture.dom).Hls.isSupported = () => false;
  fixture.dom.window.HTMLMediaElement.prototype.canPlayType = () => 'probably';
  const video = await fixture.show();
  assert.equal(fixture.instances.length, 0); assert.equal(video.src, 'https://media.invalid/master.m3u8');
});

test('a disposed manifest callback cannot start loading again', async t => {
  const fixture = previewFixture(t); await fixture.show(); const stream = fixture.instances[0];
  fixture.preview.hide(); stream.emit('manifest');
  assert.deepEqual(stream.starts, []); assert.equal(stream.destroyed, 1);
});

test('fatal media errors have a hover-wide bounded recovery budget', async t => {
  const fixture = previewFixture(t); const video = await fixture.show(); const stream = fixture.instances[0];
  stream.emit('manifest');
  const error = { type: 'mediaError', details: 'bufferAppendError', fatal: true };
  stream.emit('error', error); stream.emit('error', error);
  assert.equal(stream.recoveries, 2); assert.equal(stream.destroyed, 0);
  assert.equal(fixture.dom.window.document.querySelector('.knife-preview-video'), video);
  stream.emit('error', error); stream.emit('error', error);
  assert.equal(stream.recoveries, 2); assert.equal(stream.destroyed, 1);
  assert.equal(runtime(fixture.dom).statuses.livePreview.state, 'limited');
});

test('the DOM media error does not destroy HLS before its bounded media recovery can run', async t => {
  const fixture = previewFixture(t); const video = await fixture.show(); const stream = fixture.instances[0];
  video.dispatchEvent(new fixture.dom.window.Event('error'));
  assert.equal(stream.destroyed, 0);
  stream.emit('error', { type: 'mediaError', details: 'bufferAppendError', fatal: true });
  assert.equal(stream.recoveries, 1); assert.equal(stream.destroyed, 0);
});

test('permission denial is not retried as a transient media failure', async t => {
  const fixture = previewFixture(t); await fixture.show(); const stream = fixture.instances[0]; stream.emit('manifest');
  stream.emit('error', { type: 'networkError', details: 'fragLoadError', fatal: true, response: { code: 403 } });
  assert.equal(stream.destroyed, 1); assert.equal(stream.recoveries, 0); assert.deepEqual(stream.starts, [2]);
});

test('late old playback rejection cannot fail a newer preview', async t => {
  const fixture = previewFixture(t); const video = await fixture.show(); let rejectPlay;
  fixture.dom.window.HTMLMediaElement.prototype.play = () => new Promise((resolve, reject) => { rejectPlay = reject; });
  video.dispatchEvent(new fixture.dom.window.Event('loadeddata'));
  fixture.preview.hide();
  fixture.dom.window.HTMLMediaElement.prototype.play = async () => {};
  await fixture.show(); rejectPlay(new Error('old playback denied')); await flush();
  assert.equal(fixture.instances[1].destroyed, 0); assert.ok(fixture.dom.window.document.querySelector('.knife-preview-video'));
});

test('waiting diagnostics contain playback metrics, never stream URLs or response payloads', async t => {
  const fixture = previewFixture(t); const video = await fixture.show();
  video.dispatchEvent(new fixture.dom.window.Event('waiting'));
  const events = fixture.preview.diagnostics.events;
  assert.ok(events.some(event => event.type === 'waiting' && typeof event.readyState === 'number'));
  fixture.instances[0].emit('error', { type: 'networkError', details: 'fragLoadError', fatal: false,
    url: 'https://media.invalid/private?token=SECRET', response: { code: 503, data: 'SECRET' } });
  assert.equal(JSON.stringify(fixture.preview.diagnostics).includes('SECRET'), false);
});

test('a slow initial media load is not destroyed after only five seconds', async t => {
  const fixture = previewFixture(t); let now = 0, sequence = 0; const timers = new Map();
  fixture.dom.window.setTimeout = (fn, delay = 0) => { const id = ++sequence; timers.set(id, { at: now + delay, fn }); return id; };
  fixture.dom.window.clearTimeout = id => timers.delete(id);
  const tick = value => { now = value; for (let i = 0; i < 100; i++) {
    const next = [...timers].filter(([, item]) => item.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) return; timers.delete(next[0]); next[1].fn();
  } throw new Error('unbounded timer loop'); };
  await fixture.show(); tick(5000);
  assert.equal(fixture.instances[0].destroyed, 0);
  tick(15000);
  assert.equal(fixture.instances[0].destroyed, 1); assert.equal(runtime(fixture.dom).statuses.livePreview.state, 'limited');
});

for (const progressing of [false, true]) test('post-start watchdog distinguishes advancing playback from a frozen ready frame: ' + progressing, async t => {
  const fixture = previewFixture(t); let now = 0, sequence = 0, time = 0; const timers = new Map();
  Object.defineProperty(fixture.dom.window.performance, 'now', { value: () => now });
  fixture.dom.window.setTimeout = (fn, delay = 0) => { const id = ++sequence; timers.set(id, { at: now + delay, fn }); return id; };
  fixture.dom.window.clearTimeout = id => timers.delete(id);
  const video = await fixture.show();
  Object.defineProperty(video, 'paused', { get: () => false });
  Object.defineProperty(video, 'readyState', { get: () => 2 });
  Object.defineProperty(video, 'currentTime', { get: () => time });
  video.dispatchEvent(new fixture.dom.window.Event('loadeddata')); await flush();
  for (let second = 1; second <= 12; second++) {
    now = second * 1000; if (progressing) time = second;
    for (const [id, item] of [...timers]) if (item.at <= now) { timers.delete(id); item.fn(); }
  }
  assert.equal(fixture.instances[0].destroyed, progressing ? 0 : 1);
  assert.equal(runtime(fixture.dom).statuses.livePreview.state, progressing ? 'ready' : 'limited');
});

function followingFixture(t, { compact = false, noEffect = false } = {}) {
  const html = playerHTML.replace('<div class="pzp-pc__volume-control"></div>', '<div class="pzp-pc__volume-control"></div><button class="pzp-pc__viewmode-button" aria-label="넓은 화면"></button>') +
    '<aside id="sidebar"><nav aria-label="팔로우">' + (compact ? '' : '<strong class="_title_test">팔로잉 채널</strong>') +
    '<button class="_more_button_test" aria-expanded="false" id="more">더보기</button></nav></aside>';
  const dom = page(html); const more = dom.window.document.getElementById('more'); let clicks = 0;
  more.addEventListener('click', () => { clicks++; if (!noEffect) more.setAttribute('aria-expanded', more.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'); });
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  deliver(dom, { expandFollowings: true, updateSidebar: false }); load(dom, 'web/inject.js');
  t.after(() => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); dom.window.close(); });
  return { dom, more, clicks: () => clicks, mode: dom.window.document.querySelector('.pzp-pc__viewmode-button'),
    async wideThenNarrow() {
      this.mode.setAttribute('aria-label', '좁은 화면'); await flush();
      more.setAttribute('aria-expanded', 'false'); await flush();
      this.mode.setAttribute('aria-label', '넓은 화면'); await flush();
    } };
}

test('wide-player ON to OFF reopens a native collapsed following list using the same control', async t => {
  const fixture = followingFixture(t); assert.equal(fixture.clicks(), 1);
  await fixture.wideThenNarrow();
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'true'); assert.equal(fixture.clicks(), 2);
});

test('manual following collapse survives wide-mode changes and owner-generation replacement', async t => {
  const fixture = followingFixture(t); fixture.more.click(); assert.equal(fixture.clicks(), 2);
  const body = fixture.dom.window.document.getElementById('layout-body'); body.replaceWith(body.cloneNode(true));
  runtime(fixture.dom).reconcile(); await flush();
  fixture.mode = fixture.dom.window.document.querySelector('.pzp-pc__viewmode-button');
  await fixture.wideThenNarrow();
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'false'); assert.equal(fixture.clicks(), 2);
});

test('compact following identity uses its public aria-label without requiring a title', t => {
  const fixture = followingFixture(t, { compact: true });
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'true'); assert.equal(fixture.clicks(), 1);
});

test('a rejected expansion click is not reported ready or retried on unrelated mutations', async t => {
  const fixture = followingFixture(t, { noEffect: true });
  fixture.dom.window.document.getElementById('sidebar').setAttribute('class', 'unrelated-change'); await flush();
  runtime(fixture.dom).reconcile();
  assert.equal(fixture.clicks(), 1); assert.equal(fixture.more.getAttribute('aria-expanded'), 'false');
  assert.notEqual(runtime(fixture.dom).statuses.expandFollowings.state, 'ready');
});
