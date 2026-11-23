const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliverScoped: deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t, vod = false, beforePlayer = () => {}) {
  const dom = page(vod ? playerHTML.replace('live_player_layout', 'player_layout') : playerHTML,
    vod ? 'https://chzzk.naver.com/video/123456' : undefined);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js');
  load(dom, 'web/site-adapter.js');
  deliver(dom, { arrowSeek: true, pressToFastForward: true });
  beforePlayer(dom);
  load(dom, 'web/player.js');
  return dom;
}
const ranges = values => ({ length: values.length, start: index => values[index][0], end: index => values[index][1] });

test('Vue-free live controls mount once and do not seek an empty buffer', t => {
  const dom = setup(t);
  runtime(dom).reconcile(); runtime(dom).reconcile();
  assert.equal(dom.window.document.querySelectorAll('.knife-ff').length, 1);
  dom.window.document.querySelector('.knife-ff').click();
  assert.equal(dom.window.document.querySelector('video').currentTime, 0);
});

test('live-edge and compressor button SVG artwork and accessibility remain unchanged', t => {
  const dom = setup(t, false, dom => load(dom, 'web/audio.js'));
  for (const [selector, expectedPath] of [
    ['.knife-ff', 'M4 6v12l8-6zm9 0v12l8-6z'],
    ['.knife-comp button', 'M3 7v10m4-13v16m5-18v20m5-18v16m4-13v10'],
  ]) {
    const button = dom.window.document.querySelector(selector);
    assert.ok(button.getAttribute('aria-label'));
    const svg = button.querySelector('svg');
    assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(svg.getAttribute('width'), '22');
    assert.equal(svg.getAttribute('height'), '22');
    assert.equal(svg.querySelector('path').getAttribute('d'), expectedPath);
  }
});

test('statistics renders codec from a primitive adapter snapshot', async t => {
  const dom = setup(t, false, dom => {
    const pzp = dom.window.document.querySelector('.pzp-pc');
    pzp.insertAdjacentHTML('beforeend', '<div id="license"><button>License</button></div>');
    const layout = dom.window.document.getElementById('live_player_layout');
    layout.__reactFiber$fixture = { memoizedState: { memoizedState: {
      _corePlayer: { _currentCodecs: { video: 'avc1.640028', audio: 'mp4a.40.2' } },
    }, next: null }, return: null };
  });
  dom.window.document.querySelector('#knife-stats button').click();
  await flush();
  assert.match(dom.window.document.querySelector('.knife-stats-overlay pre').textContent, /avc1\.640028, mp4a\.40\.2/);
  assert.equal(Object.hasOwn(runtime(dom).adapter, 'getCorePlayer'), false);
});

test('player labels use own supported translations and ignore inherited values', t => {
  const dom = setup(t, false, dom => {
    const inherited = Object.create({ fastForward: 'Inherited live edge' });
    Object.defineProperty(inherited, 'enableCompressor', { enumerable: true, value: 'Own compressor label' });
    runtime(dom).i18n = inherited;
    load(dom, 'web/audio.js');
  });
  assert.equal(dom.window.document.querySelector('.knife-ff').getAttribute('aria-label'), 'Live edge');
  assert.equal(dom.window.document.querySelector('.knife-comp button').getAttribute('aria-label'), 'Own compressor label');
});

test('player installation is single-owner and preserves a foreign controller', async t => {
  const duplicate = setup(t);
  const installed = runtime(duplicate).player;
  load(duplicate, 'web/player.js');
  assert.equal(runtime(duplicate).player, installed);
  assert.equal(duplicate.window.document.querySelectorAll('.knife-ff').length, 1);

  const foreign = page(playerHTML);
  t.after(async () => { foreign.window.dispatchEvent(new foreign.window.PageTransitionEvent('pagehide')); await flush(); foreign.window.close(); });
  load(foreign, 'media-profiles.js'); load(foreign, 'web/runtime.js'); load(foreign, 'web/site-adapter.js'); deliver(foreign);
  const owner = { foreign: true };
  runtime(foreign).player = owner;
  load(foreign, 'web/player.js');
  assert.equal(runtime(foreign).player, owner);
  assert.equal(foreign.window.document.querySelector('.knife-ff'), null);
});

test('player startup failure does not publish a partial controller', async t => {
  const dom = page(playerHTML);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js'); deliver(dom);
  runtime(dom).subscribe = () => { throw new Error('subscribe unavailable'); };
  assert.doesNotThrow(() => load(dom, 'web/player.js'));
  assert.equal(runtime(dom).player, undefined);
  assert.equal(dom.window.document.querySelector('.knife-ff'), null);
});

test('throwing player label accessors fall back without invocation', t => {
  let reads = 0;
  const dom = setup(t, false, current => {
    Object.defineProperty(runtime(current).i18n, 'fastForward', { enumerable: true, get() { reads++; throw new Error('label getter'); } });
  });
  assert.equal(reads, 0);
  assert.equal(dom.window.document.querySelector('.knife-ff').getAttribute('aria-label'), 'Live edge');
});

test('live seeking clamps gaps and supports finite live duration', t => {
  const dom = setup(t);
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'seekable', { value: ranges([[10,20],[30,40]]) });
  Object.defineProperty(video, 'duration', { value: 40 });
  video.currentTime = 19;
  runtime(dom).player.seek(false);
  assert.equal(video.currentTime, 30);
  dom.window.document.querySelector('.knife-ff').click();
  assert.equal(video.currentTime, 39.95);
});

test('player range arithmetic preserves gaps, edges, fallbacks, and end reserve', async t => {
  const cases = [
    { name: 'empty seekable and buffered', seekable: [], buffered: [], current: 5, backward: false, result: false, expected: 5 },
    { name: 'empty seekable falls back to buffered', seekable: [], buffered: [[1, 9]], current: 2, backward: false, result: true, expected: 7 },
    { name: 'invalid and reversed seekable ranges are rejected', seekable: [[NaN, 5], [8, 8], [10, 9]], buffered: [[0, 100]], current: 2, backward: false, result: false, expected: 2 },
    { name: 'forward gap clamps to next range start', seekable: [[10, 20], [30, 40]], buffered: [], current: 24.5, backward: false, result: true, expected: 30 },
    { name: 'backward gap clamps to previous range reserve', seekable: [[10, 20], [30, 40]], buffered: [], current: 25.5, backward: true, result: true, expected: 19.95 },
    { name: 'before first range clamps to first start', seekable: [[10, 20]], buffered: [], current: 10, backward: true, result: true, expected: 10 },
    { name: 'after last range keeps point zero five reserve', seekable: [[10, 20]], buffered: [], current: 19, backward: false, result: true, expected: 19.95 },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, child => {
      const dom = setup(child);
      const video = dom.window.document.querySelector('video');
      Object.defineProperty(video, 'seekable', { value: ranges(scenario.seekable) });
      Object.defineProperty(video, 'buffered', { value: ranges(scenario.buffered) });
      video.currentTime = scenario.current;
      assert.equal(runtime(dom).player.seek(scenario.backward), scenario.result);
      assert.equal(video.currentTime, scenario.expected);
    });
  }

  await t.test('finite live duration reaches the reserved live edge', child => {
    const dom = setup(child);
    const video = dom.window.document.querySelector('video');
    Object.defineProperty(video, 'seekable', { value: ranges([[0, 40]]) });
    Object.defineProperty(video, 'duration', { value: 40 });
    runtime(dom).player.liveEdge();
    assert.equal(video.currentTime, 39.95);
  });
});

test('editable descendants and sliders retain arrow keys', t => {
  const dom = setup(t);
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'seekable', { value: ranges([[0,100]]) });
  video.currentTime = 50;
  dom.window.document.body.insertAdjacentHTML('beforeend', '<div contenteditable="true"><span id="typing">text</span></div><input id="slider" type="range">');
  for (const id of ['typing','slider']) {
    dom.window.document.getElementById(id).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  }
  assert.equal(video.currentTime, 50);
});

test('Gain keys retain native range defaults without reaching player shortcuts', t => {
  const dom = setup(t, false, dom => load(dom, 'web/audio.js'));
  const { document, KeyboardEvent } = dom.window;
  const pzp = document.querySelector('.pzp-pc');
  let nativeShortcuts = 0;
  pzp.addEventListener('keydown', event => { nativeShortcuts++; event.preventDefault(); });
  const slider = document.querySelector('.knife-gain-slider');
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    slider.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, `${key} must retain range default`);
  }
  assert.equal(nativeShortcuts, 0);
  pzp.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  assert.equal(nativeShortcuts, 1, 'non-slider shortcuts remain native');
});

test('quick VOD release preserves original user speed', async t => {
  const dom = setup(t, true);
  const video = dom.window.document.querySelector('video');
  video.playbackRate = 1.5;
  const target = dom.window.document.querySelector('.pzp-pc__video');
  target.dispatchEvent(new dom.window.MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: 10, clientY: 10 }));
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { button: 0, bubbles: true }));
  await flush();
  assert.equal(video.playbackRate, 1.5);
});

test('native replacement of control children automatically restores owned controls', async t => {
  const dom = setup(t);
  dom.window.document.querySelector('.pzp-pc__bottom-buttons-left').innerHTML = '<button class="pzp-pc__playback-switch"></button><div class="pzp-pc__volume-control"></div>';
  await flush(); await flush();
  assert.equal(dom.window.document.querySelectorAll('.knife-ff').length, 1);
});

test('player identity changes bypass only a replaced video', async t => {
  const dom = setup(t);
  const rt = runtime(dom);
  const bypassed = [];
  rt.audio = { bypass: video => bypassed.push(video), configure() {}, eligible: () => false,
    suspend() {},resumeWanted:async()=> 'off',getState: () => 'off', setEnabled: async () => 'off', setGain() {}, subscribe: () => () => {} };
  const layout = dom.window.document.getElementById('live_player_layout');
  const original = layout.querySelector('video');
  const replacement = dom.window.document.createElement('div');
  replacement.className = 'pzp-pc';
  replacement.innerHTML = '<div class="pzp-pc__video"></div><div class="pzp-pc__bottom-buttons-left"><button class="pzp-pc__playback-switch"></button><div class="pzp-pc__volume-control"></div></div>';
  replacement.querySelector('.pzp-pc__video').append(original);
  layout.querySelector('.pzp-pc').replaceWith(replacement);
  rt.reconcile();
  assert.deepEqual(bypassed, [], 'same-video UI replacement keeps the audio graph');
  const next = dom.window.document.createElement('video');
  original.replaceWith(next);
  rt.reconcile();
  assert.deepEqual(bypassed, [original], 'selected-video replacement retires the old audio graph');
  assert.equal(dom.window.document.querySelectorAll('.knife-ff').length, 1);
});

test('persisted pagehide keeps controls but final pagehide removes global shortcuts once', t => {
  const dom = setup(t);
  const rt = runtime(dom);
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'seekable', { value: ranges([[0, 100]]) });
  let seeks = 0;
  rt.player.seek = () => { seeks++; return true; };
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert.equal(seeks, 1);
  assert.equal(dom.window.document.querySelectorAll('.knife-ff').length, 1);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
  dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert.equal(seeks, 1, 'final disposal must not leave a stale key listener');
  assert.equal(dom.window.document.querySelector('.knife-ff'), null);
});

test('a player callback failure is owned and unrelated subscribers still run', t => {
  const dom = setup(t);
  const rt = runtime(dom);
  const changes = [];
  const setStatus = rt.setStatus;
  rt.setStatus = (...args) => { changes.push(args); setStatus(...args); };
  let unrelated = 0;
  rt.subscribe(() => { unrelated++; });
  unrelated = 0;
  const pzp = dom.window.document.querySelector('.pzp-pc');
  const querySelector = pzp.querySelector.bind(pzp);
  let fail = true;
  pzp.querySelector = selector => {
    if (fail) { fail = false; throw new Error('owned player failure'); }
    return querySelector(selector);
  };
  rt.notify();
  assert.equal(unrelated, 1);
  assert.ok(changes.some(([feature, state]) => feature === 'player' && state === 'failed'));
  assert.equal(changes.some(([feature]) => feature === 'runtime'), false);
});

test('late metrics resolution cannot write after its overlay is disposed', async t => {
  let resolveMetrics;
  const dom = setup(t, false, current => {
    current.window.document.querySelector('.pzp-pc').insertAdjacentHTML('beforeend', '<div id="license"><button>License</button></div>');
    runtime(current).adapter.player.readMetrics = () => new Promise(resolve => { resolveMetrics = resolve; });
  });
  dom.window.document.querySelector('#knife-stats button').click();
  dom.window.document.querySelector('.knife-stats-overlay button').click();
  resolveMetrics({ codec: 'late-codec' });
  await flush();
  assert.equal(dom.window.document.querySelector('.knife-stats-overlay'), null);
});

function nativeVOD(t, initiallyPaused) {
  const dom = setup(t, true, dom => {
    const video = dom.window.document.querySelector('video');
    let paused = initiallyPaused;
    Object.defineProperty(video, 'paused', { get: () => paused });
    video.play = async () => { paused = false; };
    video.pause = () => { paused = true; };
    // External player boundary: the native video click toggles playback. Keep
    // actual DOM propagation and the production hold controller intact.
    dom.window.document.querySelector('.pzp-pc').addEventListener('click', event => {
      if (event.target.closest('.pzp-pc__video')) paused ? video.play() : video.pause();
    });
  });
  const video = dom.window.document.querySelector('video');
  const target = dom.window.document.querySelector('.pzp-pc__video');
  const send = (type, destination = target, detail = type === 'click' ? 1 : 0, pointerId = 7) => {
    const event = new dom.window.MouseEvent(type, { button: 0, bubbles: true, cancelable: true, detail, clientX: 10, clientY: 10 });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    destination.dispatchEvent(event); return event;
  };
  return { dom, video, target, send };
}

// Break caught: OFF is checked only at pointerdown, so a delayed or already
// active hold can outlive permission and change playback after being disabled.
for (const paused of [false, true]) test('VOD option OFF cancels a pending hold, paused=' + paused, async t => {
  const { dom, video, send } = nativeVOD(t, paused); video.playbackRate = 1.5;
  send('pointerdown'); deliver(dom, { pressToFastForward: false }, 2);
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(video.playbackRate, 1.5); assert.equal(video.paused, paused);
  assert.equal(dom.window.document.querySelector('.knife-ff-indicator'), null);
  send('pointerup'); assert.equal(send('click').defaultPrevented, false, 'a never-activated gesture remains a native click');
  assert.equal(video.paused, !paused);
  deliver(dom, { pressToFastForward: true }, 3);
  send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(video.playbackRate, 2, 'reenabling permits a new hold');
  send('pointerup'); assert.equal(send('click').defaultPrevented, true);
  assert.equal(video.playbackRate, 1.5); assert.equal(video.paused, !paused);
});

for (const paused of [false, true]) test('VOD option OFF restores an active hold and consumes only its completing click, paused=' + paused, async t => {
  const { dom, video, send } = nativeVOD(t, paused); video.playbackRate = 1.5;
  send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(video.playbackRate, 2); assert.equal(video.paused, false);
  deliver(dom, { pressToFastForward: false }, 2);
  assert.equal(video.playbackRate, 1.5); assert.equal(video.paused, paused);
  assert.equal(dom.window.document.querySelector('.knife-ff-indicator'), null);
  // OFF may occur long before physical release. Start the bounded click token
  // on matching pointerup, not on OFF where it could expire while still held.
  await new Promise(resolve => setTimeout(resolve, 1050));
  send('pointerup', undefined, 0, 8);
  send('pointerup'); assert.equal(send('click').defaultPrevented, true);
  assert.equal(video.paused, paused, 'native click must not undo OFF restoration of a completed hold');
  send('pointerdown'); send('pointerup'); assert.equal(send('click').defaultPrevented, false);
  assert.equal(video.paused, !paused, 'future short clicks retain native behavior');
});

test('VOD hold timer rechecks permission immediately before activation', async t => {
  const { dom, video, send } = nativeVOD(t, true); video.playbackRate = 1.5;
  send('pointerdown'); runtime(dom).config.pressToFastForward = false;
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(video.playbackRate, 1.5); assert.equal(video.paused, true);
  assert.equal(dom.window.document.querySelector('.knife-ff-indicator'), null);
});

test('OFF restoration of a VOD hold preserves a newer user-selected speed', async t => {
  const { dom, video, send } = nativeVOD(t, false);
  send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550));
  video.playbackRate = 1.25; deliver(dom, { pressToFastForward: false }, 2);
  assert.equal(video.playbackRate, 1.25);
  assert.equal(dom.window.document.querySelector('.knife-ff-indicator'), null);
  send('pointerup'); send('click'); assert.equal(video.paused, false);
});

for (const paused of [false, true]) {
  test('completed VOD hold restores speed/play state and consumes its native click, paused=' + paused, async t => {
    const { dom, video, send } = nativeVOD(t, paused);
    video.playbackRate = 1.5;
    send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal(video.playbackRate, 2); assert.equal(video.paused, false);
    send('pointerup'); const click = send('click');
    assert.equal(video.playbackRate, 1.5); assert.equal(video.paused, paused);
    assert.equal(click.defaultPrevented, true);
    assert.equal(dom.window.document.querySelector('.knife-ff-indicator'), null);
    send('pointerdown'); send('pointerup'); const shortClick = send('click');
    assert.equal(shortClick.defaultPrevented, false);
    assert.equal(video.paused, !paused, 'a subsequent short click must still toggle playback');
  });
}

test('short VOD click remains native and keyboard clicks are not consumed by a completed hold', async t => {
  const { dom, video, send } = nativeVOD(t, true);
  send('pointerdown'); send('pointerup');
  assert.equal(send('click').defaultPrevented, false); assert.equal(video.paused, false);
  send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550)); send('pointerup');
  assert.equal(send('click', undefined, 0).defaultPrevented, false); assert.equal(video.paused, true);
  const button = dom.window.document.querySelector('.pzp-pc__playback-switch');
  assert.equal(send('click', button).defaultPrevented, false);
});

test('cancelled VOD hold restores speed without consuming a later click', async t => {
  const { video, send } = nativeVOD(t, false);
  video.playbackRate = 1.5;
  send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550)); send('pointercancel');
  assert.equal(video.playbackRate, 1.5); assert.equal(video.paused, false);
  assert.equal(send('click').defaultPrevented, false); assert.equal(video.paused, true);
});

test('another pointer cannot end the active hold or consume its click token', async t => {
  const { video, send } = nativeVOD(t, false);
  send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550));
  send('pointerup', undefined, 0, 8); assert.equal(video.playbackRate, 2);
  send('pointerup');
  assert.equal(send('click', undefined, 1, 8).defaultPrevented, false);
  assert.equal(send('click').defaultPrevented, true);
});

test('a simultaneous pointer replaces the active hold without leaving speed or capture behind', async t => {
  const { dom, video, send } = nativeVOD(t, false);
  video.playbackRate = 1.5;
  send('pointerdown', undefined, 0, 7); await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(video.playbackRate, 2);
  send('pointerdown', undefined, 0, 8);
  assert.equal(video.playbackRate, 1.5);
  assert.equal(dom.window.document.querySelector('.knife-ff-indicator'), null);
  send('pointerup', undefined, 0, 7);
  send('pointerup', undefined, 0, 8);
  assert.equal(video.playbackRate, 1.5);
});

test('unused completed-hold click token expires without intercepting a later activation', async t => {
  const { video, send } = nativeVOD(t, false);
  send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550)); send('pointerup');
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(send('click').defaultPrevented, false); assert.equal(video.paused, true);
});

test('route disposal restores an active hold and removes its click interception', async t => {
  const { dom, video, send } = nativeVOD(t, false);
  video.playbackRate = 1.5;
  send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550));
  dom.reconfigure({ url: 'https://chzzk.naver.com/following' }); runtime(dom).reconcile();
  assert.equal(video.playbackRate, 1.5);
  assert.equal(dom.window.document.querySelector('.knife-ff-indicator'), null);
  assert.equal(send('click').defaultPrevented, false); assert.equal(video.paused, true);
});
