const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, playerHTML, flush } = require('./helpers.cjs');
const { event } = require('./settings-fixture.cjs');
async function bridgePair(t) {
  let saved = { config: { preview: true, livePreview: true, previewDelay: 0.1, previewVolume: 50 }, styleParameters: { 'chat-font-size': 8 } };
  const changes = event(), holds = new Map(), reads = [], pages = [];
  function open(name) {
    const dom = page(playerHTML + '<aside id="sidebar"><a id="one" href="/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb">One</a></aside>'); pages.push(dom);
    dom.window.postMessage = data => queueMicrotask(() => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { source: dom.window, origin: dom.window.location.origin, data })));
    dom.window.chrome = { storage: { local: { onChanged: changes, get: async () => {
      const captured = structuredClone(saved); reads.push({ name, subscribers: changes.listeners.size });
      const gate = holds.get(name); if (gate) { holds.delete(name); gate.entered(); return gate.promise; } return captured;
    } } }, i18n: { getMessage: key => key }, runtime: { id: 'fixture-extension-id', onMessage: event() } };
    load(dom, 'config.js'); load(dom, 'web/main.js'); load(dom, 'web/runtime.js');
    return dom;
  }
  const A = open('A'), B = open('B');
  t.after(async () => { for (const dom of pages) dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); for (const dom of pages) dom.window.close(); });
  await flush();
  return { A, B, reads, changes,
    holdReadA() { let resolve, entered; const promise = new Promise(r => { resolve = r; }), reached = new Promise(r => { entered = r; }); const gate = { promise, resolve, reached, entered }; holds.set('A', gate); return gate; },
    setStored(next) { saved = structuredClone(next); }, signal(delta = { settingsRevision: { newValue: 1 } }) { changes.emit(delta); },
    freezeA() { A.window.dispatchEvent(new A.window.PageTransitionEvent('pagehide', { persisted: true })); },
    restoreA() { A.window.dispatchEvent(new A.window.PageTransitionEvent('pageshow', { persisted: true })); },
    settle: flush,
  };
}
test('BFCache restoration rejects a read from before newer settings without waiting for it', async t => {
  const h = await bridgePair(t), old = h.holdReadA(); h.signal({ config: { newValue: { preview: true } } }); await flush();
  await old.reached;
  h.freezeA(); h.setStored({ config: { preview: false }, styleParameters: { 'chat-font-size': 0 } }); h.restoreA(); await h.settle();
  assert.equal(runtime(h.A).config.preview, false);
  assert.equal(h.A.window.document.documentElement.style.getPropertyValue('--knife-chat-size-1'), '0px');
  old.resolve({ config: { preview: true }, styleParameters: { 'chat-font-size': 8 } }); await h.settle();
  assert.equal(runtime(h.A).config.preview, false);
});
test('delayed old storage payload is only a signal and cannot restore stale values', async t => {
  const h = await bridgePair(t); assert.ok(h.reads[0].subscribers >= 1, 'subscribe before first get');
  h.setStored({ config: { preview: false, arrowSeek: false }, styleParameters: {} });
  h.signal({ config: { newValue: { preview: true, arrowSeek: true } }, styleParameters: { newValue: { 'chat-font-size': 8 } } }); await h.settle();
  for (const dom of [h.A, h.B]) {
    assert.equal(runtime(dom).config.preview, false); assert.equal(runtime(dom).config.arrowSeek, false);
    assert.equal(dom.window.document.documentElement.style.getPropertyValue('--knife-chat-size-1'), '');
  }
});
for (const value of [undefined, null, '4', NaN, Infinity, 17, -7]) test('invalid or missing font parameter clears all owned offsets: ' + value, async t => {
  const h = await bridgePair(t); assert.equal(h.A.window.document.documentElement.style.getPropertyValue('--knife-chat-size-1'), '8px');
  const styleParameters = value === undefined ? {} : { 'chat-font-size': value };
  h.setStored({ config: {}, styleParameters }); h.signal({ styleParameters: { newValue: styleParameters } }); await h.settle();
  for (const n of [1, 2, 10, 20]) assert.equal(h.A.window.document.documentElement.style.getPropertyValue('--knife-chat-size-' + n), '');
});
test('final pagehide removes only its subscription and late read cannot publish', async t => {
  const h = await bridgePair(t), old = h.holdReadA(); h.signal(); await flush();
  const closedRuntime = runtime(h.A), before = h.changes.listeners.size;
  h.A.window.dispatchEvent(new h.A.window.PageTransitionEvent('pagehide'));
  assert.equal(h.changes.listeners.size, before - 1); old.resolve({ config: { preview: false }, styleParameters: {} }); await flush();
  assert.equal(closedRuntime.config.preview, true);
  assert.equal(runtime(h.A), undefined);
  h.setStored({ config: { preview: false }, styleParameters: {} }); h.signal(); await flush(); assert.equal(runtime(h.B).config.preview, false);
});
function media(dom) {
  const pending = [], instances = []; dom.window.fetch = (_url, options) => new Promise(resolve => pending.push({ resolve, options }));
  const videoProto = dom.window.HTMLMediaElement.prototype; videoProto.pause = function () { this.wasPaused = true; }; videoProto.load = () => {}; videoProto.play = async () => {};
  runtime(dom).Hls = class { static isSupported() { return true; } static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest' };
    constructor() { this.destroyed = false; instances.push(this); } on() {} loadSource() {} attachMedia(video) { this.video = video; } destroy() { this.destroyed = true; } };
  const anchor = dom.window.document.getElementById('one'); anchor.getBoundingClientRect = () => ({ left: 20, right: 120, top: 30, bottom: 50, width: 100, height: 20 });
  load(dom, 'web/preview.js');
  const response = () => ({ ok: true, json: async () => ({ code: 200, content: { status: 'OPEN', livePlaybackJson: JSON.stringify({ media: [{ mediaId: 'HLS', path: 'https://media.invalid/master.m3u8' }] }) } }) });
  return { pending, instances, show: () => runtime(dom).preview.show(anchor.href, anchor, true), response };
}
for (const off of ['preview', 'livePreview']) test('global ' + off + ' OFF cancels each page pending media independently', async t => {
  const h = await bridgePair(t), a = media(h.A), b = media(h.B); const showingA = a.show(), showingB = b.show();
  h.setStored({ config: { preview: true, livePreview: true, [off]: false }, styleParameters: {} }); h.signal(); await flush();
  assert.equal(a.pending[0].options.signal.aborted, true); assert.equal(b.pending[0].options.signal.aborted, true);
  a.pending[0].resolve(a.response()); b.pending[0].resolve(b.response()); await Promise.all([showingA, showingB]);
  assert.equal(a.instances.length, 0); assert.equal(b.instances.length, 0);
});
test('one page closing and its media volume cannot dispose or mute another page player', async t => {
  const h = await bridgePair(t), a = media(h.A), b = media(h.B); const showingA = a.show(), showingB = b.show();
  a.pending[0].resolve(a.response()); b.pending[0].resolve(b.response()); await Promise.all([showingA, showingB]);
  const av = a.instances[0].video, bv = b.instances[0].video; av.volume = 0.25; av.muted = false;
  assert.equal(bv.volume, 0.5); assert.equal(bv.muted, true);
  h.A.window.dispatchEvent(new h.A.window.PageTransitionEvent('pagehide')); await flush();
  assert.equal(a.instances[0].destroyed, true); assert.equal(b.instances[0].destroyed, false); assert.equal(bv.wasPaused, undefined);
  // jsdom does not decode media: advance its external media boundary, not a claim of real playback.
  bv.currentTime = 12; await flush(); assert.equal(bv.currentTime, 12); assert.equal(b.instances[0].destroyed, false);
});
test('audio graphs and mute remain page-local across settings updates and closing another page', async t => {
  const h = await bridgePair(t);
  function audio(dom) {
    const video = dom.window.document.querySelector('video'), nodes = [];
    Object.defineProperty(video, 'currentSrc', { value: 'blob:https://chzzk.naver.com/local-test' });
    const parameter = value => ({ value, setValueAtTime(next) { this.value = next; }, cancelScheduledValues() {}, linearRampToValueAtTime(next) { this.value = next; } });
    const node = type => { const n = { type, outputs: new Set(), connect(other) { this.outputs.add(other); }, disconnect() { this.outputs.clear(); } }; nodes.push(n); return n; };
    let sourceCount = 0;
    dom.window.AudioContext = class {
      constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 48000; this.destination = node('destination'); }
      createGain() { return Object.assign(node('gain'), { gain: parameter(1) }); }
      createDelay() { return Object.assign(node('delay'), { delayTime: parameter(0) }); }
      createDynamicsCompressor() { return Object.assign(node('compressor'), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(id => [id, parameter(0)]))); }
      createWaveShaper() { return Object.assign(node('waveshaper'), { curve: null, oversample: 'none' }); }
      createMediaElementSource(element) { assert.equal(element, video); sourceCount++; return node('source'); }
    };
    load(dom, 'web/audio.js'); return { video, nodes, api: runtime(dom).audio, sourceCount: () => sourceCount };
  }
  const a = audio(h.A), b = audio(h.B); await a.api.setEnabled(a.video, true); await b.api.setEnabled(b.video, true);
  a.video.muted = true; a.api.setGain(a.video, 1.5);
  assert.equal(b.video.muted, false); assert.equal(b.sourceCount(), 1);
  h.setStored({ config: { preview: false, compressorAttack: 0.1 }, styleParameters: {} }); h.signal(); await flush();
  assert.equal(b.api.getState(b.video), 'on'); assert.equal(b.sourceCount(), 1);
  h.A.window.dispatchEvent(new h.A.window.PageTransitionEvent('pagehide')); await flush();
  assert.equal(a.api.getState(a.video), 'off'); assert.equal(b.api.getState(b.video), 'on');
  assert.equal(b.nodes.find(n => n.type === 'source').outputs.size, 2);
});
