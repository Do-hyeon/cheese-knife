const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush, clock } = require('./helpers.cjs');

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

for (const status of [401, 403]) test('permission denial ' + status + ' is not retried as a transient media failure', async t => {
  const fixture = previewFixture(t); await fixture.show(); const stream = fixture.instances[0]; stream.emit('manifest');
  stream.emit('error', { type: 'networkError', details: 'fragLoadError', fatal: true, response: { code: status } });
  assert.equal(stream.destroyed, 1); assert.equal(stream.recoveries, 0); assert.deepEqual(stream.starts, [2]);
});

test('pending play rejection from before same-hover recovery cannot overwrite successful playback', async t => {
  const fixture = previewFixture(t); const video = await fixture.show(); let rejectOld;
  fixture.dom.window.HTMLMediaElement.prototype.play = () => new Promise((resolve, reject) => { rejectOld = reject; });
  video.dispatchEvent(new fixture.dom.window.Event('loadeddata'));
  fixture.instances[0].emit('error', { type: 'mediaError', details: 'bufferAppendError', fatal: true });
  fixture.dom.window.HTMLMediaElement.prototype.play = async () => {};
  video.dispatchEvent(new fixture.dom.window.Event('loadeddata')); await flush();
  rejectOld(new Error('stale failure')); await flush();
  assert.equal(fixture.instances[0].destroyed, 0); assert.equal(runtime(fixture.dom).statuses.livePreview.state, 'ready');
});

test('leaving during delayed network recovery cancels all restart callbacks', async t => {
  const fixture = previewFixture(t); let sequence = 0; const timers = new Map();
  fixture.dom.window.setTimeout = (fn, delay = 0) => { const id = ++sequence; timers.set(id, { delay, fn }); return id; };
  fixture.dom.window.clearTimeout = id => timers.delete(id);
  await fixture.show(); const stream = fixture.instances[0]; stream.emit('manifest');
  stream.emit('error', { type: 'networkError', details: 'fragLoadError', fatal: true, response: { code: 503 } });
  const delayed = [...timers.values()].filter(item => item.delay === 500); assert.equal(delayed.length, 1);
  fixture.preview.hide(); for (const item of delayed) item.fn();
  assert.deepEqual(stream.starts, [2]); assert.equal(stream.destroyed, 1);
});

test('unknown-height renditions still start and keep automatic adaptation', async t => {
  const fixture = previewFixture(t); await fixture.show(); const stream = fixture.instances[0];
  stream.levels = [{ height: 0, audioCodec: 'mp4a.40.2' }, { videoCodec: 'avc1.640028' }]; stream.emit('manifest');
  assert.equal(stream.starts.length, 1); assert.equal(stream.autoLevelEnabled, true);
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

test('startup deadline also cancels an unresolved play promise after a decoded frame', async t => {
  const fixture = previewFixture(t); let now = 0, sequence = 0; const timers = new Map();
  fixture.dom.window.setTimeout = (fn, delay = 0) => { const id = ++sequence; timers.set(id, { at: now + delay, fn }); return id; };
  fixture.dom.window.clearTimeout = id => timers.delete(id);
  fixture.dom.window.HTMLMediaElement.prototype.play = () => new Promise(() => {});
  const video = await fixture.show(); Object.defineProperty(video, 'readyState', { get: () => 2 });
  video.dispatchEvent(new fixture.dom.window.Event('loadeddata'));
  now = 15000; for (const [id, item] of [...timers]) if (item.at <= now) { timers.delete(id); item.fn(); }
  assert.equal(fixture.instances[0].destroyed, 1); assert.equal(runtime(fixture.dom).statuses.livePreview.state, 'limited');
});

for (const time of [0, 10]) test('media recovery resumes loading using the actual bundled HLS recovery method at time ' + time, async t => {
  const vendorDom = page(); load(vendorDom, 'web/runtime.js'); load(vendorDom, 'vendor/hls.light.private.js');
  const method = runtime(vendorDom).Hls.prototype.recoverMediaError;
  t.after(() => { vendorDom.window.dispatchEvent(new vendorDom.window.PageTransitionEvent('pagehide')); vendorDom.window.close(); });
  const fixture = previewFixture(t); const video = await fixture.show(); const stream = fixture.instances[0];
  video.currentTime = time; stream._media = video; stream.logger = { log() {} };
  stream.detachMedia = () => { stream._media = null; video.currentTime = 0; };
  stream.attachMedia = value => { stream._media = value; };
  stream.recoverMediaError = method; stream.emit('manifest');
  stream.emit('error', { type: 'mediaError', details: 'bufferAppendError', fatal: true });
  assert.equal(stream.starts.length, 2, 'one initial load plus exactly one recovery load');
  assert.equal(stream.destroyed, 0);
});

test('unexpected paused playback cannot stay ready indefinitely without progress', async t => {
  const fixture = previewFixture(t); let now = 0, sequence = 0; const timers = new Map();
  Object.defineProperty(fixture.dom.window.performance, 'now', { value: () => now });
  fixture.dom.window.setTimeout = (fn, delay = 0) => { const id = ++sequence; timers.set(id, { at: now + delay, fn }); return id; };
  fixture.dom.window.clearTimeout = id => timers.delete(id);
  const video = await fixture.show(); Object.defineProperty(video, 'paused', { get: () => true });
  video.dispatchEvent(new fixture.dom.window.Event('loadeddata')); await flush();
  for (let second = 1; second <= 12; second++) { now = second * 1000;
    for (const [id, item] of [...timers]) if (item.at <= now) { timers.delete(id); item.fn(); }
  }
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

async function followingFixture(t, { compact = false, noEffect = false, wrapped = false } = {}) {
  const html = playerHTML.replace('<div class="pzp-pc__volume-control"></div>', '<div class="pzp-pc__volume-control"></div><button class="pzp-pc__viewmode-button" aria-label="넓은 화면"></button>') +
    '<aside id="sidebar"><nav aria-label="팔로우">' + (compact ? '' : '<strong class="_title_test">팔로잉 채널</strong>') +
    (wrapped ? '<div class="_box_qz74s_149">' : '') +
    '<button class="_more_button_test" aria-expanded="false" id="more">더보기</button>' + (wrapped ? '</div>' : '') + '</nav></aside>';
  const dom = page(html), time = clock(dom); const more = dom.window.document.getElementById('more'); let clicks = 0;
  more.addEventListener('click', () => { clicks++; if (!noEffect) more.setAttribute('aria-expanded', more.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'); });
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  deliver(dom, { expandFollowings: true, updateSidebar: false }); load(dom, 'web/inject.js');
  t.after(() => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); dom.window.close(); });
  await time.advance(500);
  return { dom, more, advance: ms => time.advance(ms), clicks: () => clicks, mode: dom.window.document.querySelector('.pzp-pc__viewmode-button'),
    async wideThenNarrow() {
      this.mode.setAttribute('aria-label', '좁은 화면'); await time.advance(0);
      this.more.setAttribute('aria-expanded', 'false'); await time.advance(0);
      this.mode.setAttribute('aria-label', '넓은 화면'); await time.advance(500);
    } };
}

test('wide-player ON to OFF reopens a native collapsed following list using the same control', async t => {
  const fixture = await followingFixture(t); assert.equal(fixture.clicks(), 1);
  await fixture.wideThenNarrow();
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'true'); assert.equal(fixture.clicks(), 2);
});

test('the installed native More wrapper supports initial expansion and wide-mode restoration', async t => {
  const fixture = await followingFixture(t, { wrapped: true });
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'true');
  assert.equal(fixture.clicks(), 1);
  await fixture.wideThenNarrow();
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'true');
  assert.equal(fixture.clicks(), 2);
});

test('confirmed expansion observes a later native reset without retrying in the same restoration', async t => {
  const fixture = await followingFixture(t, { wrapped: true });
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'true'); assert.equal(fixture.clicks(), 1);
  fixture.more.setAttribute('aria-expanded', 'false'); await fixture.advance(1000);
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'false', 'native reset is not fought by another click');
  assert.equal(fixture.clicks(), 1);
  runtime(fixture.dom).reconcile(); await fixture.advance(1000);
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'false');
  assert.equal(fixture.clicks(), 1, 'one activation covers the entire restoration');
});

test('manual collapse of wrapped native More remains respected on wide-mode restoration', async t => {
  const fixture = await followingFixture(t, { wrapped: true });
  fixture.more.click(); await flush(); await fixture.wideThenNarrow();
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'false');
  assert.equal(fixture.clicks(), 2);
  assert.equal(runtime(fixture.dom).statuses.expandFollowings.reason, 'user-collapsed');
});

test('an unrelated nested More control cannot be used as following expansion', async t => {
  const fixture = await followingFixture(t); const unrelated = fixture.dom.window.document.createElement('div');
  unrelated.className = '_unrelated_menu';
  unrelated.innerHTML = '<button class="_more_button_test" aria-expanded="false">Other menu</button>';
  fixture.more.replaceWith(unrelated); let clicks = 0;
  unrelated.firstChild.addEventListener('click', () => { clicks++; unrelated.firstChild.setAttribute('aria-expanded', 'true'); });
  deliver(fixture.dom, { expandFollowings: false }, 2); deliver(fixture.dom, { expandFollowings: true }, 3); await flush();
  assert.equal(clicks, 0); assert.equal(unrelated.firstChild.getAttribute('aria-expanded'), 'false');
  assert.equal(runtime(fixture.dom).statuses.expandFollowings.reason, 'following-control-unavailable');
});

test('manual following collapse survives wide-mode changes and owner-generation replacement', async t => {
  const fixture = await followingFixture(t); fixture.more.click(); assert.equal(fixture.clicks(), 2);
  const body = fixture.dom.window.document.getElementById('layout-body'); body.replaceWith(body.cloneNode(true));
  runtime(fixture.dom).reconcile(); await flush();
  fixture.mode = fixture.dom.window.document.querySelector('.pzp-pc__viewmode-button');
  await fixture.wideThenNarrow();
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'false'); assert.equal(fixture.clicks(), 2);
});

test('compact following identity uses its public aria-label without requiring a title', async t => {
  const fixture = await followingFixture(t, { compact: true });
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'true'); assert.equal(fixture.clicks(), 1);
});

test('a rejected expansion click is not reported ready or retried on unrelated mutations', async t => {
  const fixture = await followingFixture(t, { noEffect: true });
  fixture.dom.window.document.getElementById('sidebar').setAttribute('class', 'unrelated-change'); await flush();
  runtime(fixture.dom).reconcile();
  assert.equal(fixture.clicks(), 1); assert.equal(fixture.more.getAttribute('aria-expanded'), 'false');
  assert.notEqual(runtime(fixture.dom).statuses.expandFollowings.state, 'ready');
});

test('a different expandable menu cannot disable following restoration', async t => {
  const fixture = await followingFixture(t); const menu = fixture.dom.window.document.createElement('button');
  menu.setAttribute('aria-expanded', 'true'); menu.setAttribute('aria-label', '다른 메뉴');
  fixture.more.parentElement.append(menu); menu.click(); await flush();
  await fixture.wideThenNarrow();
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'true'); assert.equal(fixture.clicks(), 2);
});

test('rejected More clicks cannot gain unlimited retries by replacing the control', async t => {
  const fixture = await followingFixture(t, { noEffect: true }); let attempts = 0;
  const hook = button => button.addEventListener('click', () => {
    attempts++; if (attempts >= 8) return; // Keep the broken implementation finite.
    const replacement = button.cloneNode(true); hook(replacement); button.replaceWith(replacement);
  });
  hook(fixture.more);
  deliver(fixture.dom, { expandFollowings: false }, 2); deliver(fixture.dom, { expandFollowings: true }, 3); await fixture.advance(1000);
  assert.equal(attempts, 1, 'one restoration activation covers DOM replacements');
  assert.equal(fixture.dom.window.document.querySelector('#more').getAttribute('aria-expanded'), 'false');
});

test('a no-op collapse request does not become user intent without native state change', async t => {
  const fixture = await followingFixture(t);
  const more = fixture.more.cloneNode(true); fixture.more.replaceWith(more); fixture.more = more;
  await flush(); more.click(); await flush(); // No native click handler; still expanded.
  await fixture.wideThenNarrow();
  assert.notEqual(runtime(fixture.dom).statuses.expandFollowings.reason, 'user-collapsed');
});

test('manual no-op cancellation survives owner replacement after its confirmation window expires', async t => {
  const fixture = await followingFixture(t, { noEffect: true });
  fixture.more.click(); // Unconfirmed user activation while still collapsed.
  const body = fixture.dom.window.document.getElementById('layout-body'); body.replaceWith(body.cloneNode(true));
  const more = fixture.more.cloneNode(true); fixture.more.replaceWith(more);
  let replacementClicks = 0;
  more.addEventListener('click', () => { replacementClicks++; more.setAttribute('aria-expanded', 'true'); });
  runtime(fixture.dom).reconcile(); await flush();
  assert.equal(replacementClicks, 0, 'active confirmation gates replacement expansion');
  await fixture.advance(1000);
  assert.equal(replacementClicks, 0, 'manual activation cancels this restoration regardless of confirmation');
  assert.equal(more.getAttribute('aria-expanded'), 'false');
});

test('a delayed native collapse on the clicked control survives wide-mode changes', async t => {
  const fixture = await followingFixture(t);
  const more = fixture.more.cloneNode(true); fixture.more.replaceWith(more); fixture.more = more;
  let clicks = 0;
  more.addEventListener('click', () => {
    clicks++;
    if (more.getAttribute('aria-expanded') === 'true') fixture.dom.window.setTimeout(() => more.setAttribute('aria-expanded', 'false'), 250);
    else more.setAttribute('aria-expanded', 'true');
  });
  await flush(); more.click();
  await fixture.advance(350);
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  await fixture.wideThenNarrow();
  assert.equal(more.getAttribute('aria-expanded'), 'false', 'late native confirmation still represents manual collapse');
  assert.equal(clicks, 1);
  assert.equal(runtime(fixture.dom).statuses.expandFollowings.reason, 'user-collapsed');
});

test('native whole-section folding is respected without classifying other header menus as folding', async t => {
  const fixture = await followingFixture(t); const header = fixture.dom.window.document.createElement('div'); header.className = '_header_test';
  header.innerHTML = '<button id="fold" aria-expanded="true" aria-label="펼쳐짐, 접기"></button><button aria-expanded="true" aria-label="다른 메뉴"></button>';
  fixture.more.parentElement.prepend(header); const fold = header.querySelector('#fold');
  fold.addEventListener('click', () => { fold.setAttribute('aria-expanded', 'false'); fixture.more.setAttribute('aria-expanded', 'false'); });
  fold.click(); await fixture.wideThenNarrow();
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'false'); assert.equal(fixture.clicks(), 1);
});

test('installed whole-section collapse label changes still confirm user intent', async t => {
  const fixture = await followingFixture(t, { wrapped: true });
  const header = fixture.dom.window.document.createElement('div'); header.className = '_header_qz74s_46';
  header.innerHTML = '<button aria-expanded="true" aria-label="펼쳐짐, 접기"></button>';
  fixture.more.parentElement.parentElement.prepend(header); const fold = header.firstChild;
  fold.addEventListener('click', () => {
    fold.setAttribute('aria-expanded', 'false'); fold.setAttribute('aria-label', '접힘, 펼치기');
    fixture.more.setAttribute('aria-expanded', 'false');
  });
  fold.click(); await fixture.wideThenNarrow();
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'false');
  assert.equal(fixture.clicks(), 1, 'native label transition must not lose the confirmed collapse');
  assert.equal(runtime(fixture.dom).statuses.expandFollowings.reason, 'user-collapsed');
});

test('keyboard-generated activation of the native More button preserves manual collapse', async t => {
  const fixture = await followingFixture(t);
  fixture.more.dispatchEvent(new fixture.dom.window.MouseEvent('click', { bubbles: true, detail: 0 }));
  await fixture.wideThenNarrow();
  assert.equal(fixture.more.getAttribute('aria-expanded'), 'false'); assert.equal(fixture.clicks(), 2);
});
