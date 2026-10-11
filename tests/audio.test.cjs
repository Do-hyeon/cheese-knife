const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t, suspended = false, manualClock = false, suppliedConfig = { compressorAttack: 0 }, failures = {}) {
  const dom = page(playerHTML);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'currentSrc', { value: 'blob:https://chzzk.naver.com/test-media', configurable: true });
  const parameter = value => ({ value, events: [], setValueAtTime(next, at) { this.events.push(['set', next, at]); this.value = next; }, cancelScheduledValues(at) { this.events.push(['cancel', at]); }, linearRampToValueAtTime(next, at) { this.events.push(['ramp', next, at]); this.value = next; } });
  const nodes = [];
  const node = type => { const value = { type, outputs: new Set(), connect(dest) { this.outputs.add(dest); }, disconnect() { this.outputs.clear(); } }; nodes.push(value); return value; };
  let resolveResume;
  let context;
  let sources = 0;
  let gains = 0;
  dom.window.AudioContext = class {
    constructor() { this.state = suspended ? 'suspended' : 'running'; this.destination = node('destination'); this.currentTime = 0; this.sampleRate = failures.sampleRate || 48000; context = this; }
    resume() { return new Promise(resolve => { resolveResume = () => { this.state = 'running'; resolve(); }; }); }
    createMediaElementSource(element) { assert.equal(element, video); sources++; return node('source'); }
    createGain() {
      gains++;
      if (failures.gainAt === gains) throw new Error('gain unavailable');
      return Object.assign(node('gain'), { gain: parameter(1) });
    }
    createDelay(maxDelayTime) {
      if (failures.delay) throw new Error('delay unavailable');
      return Object.assign(node('delay'), { maxDelayTime, delayTime: parameter(0) });
    }
    createWaveShaper() {
      if (failures.limiter) throw new Error('limiter unavailable');
      return Object.assign(node('limiter'), { curve: null, oversample: 'none' });
    }
    createDynamicsCompressor() {
      if (failures.compressor) throw new Error('compressor unavailable');
      const compressor = Object.assign(node('compressor'), Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key => [key, parameter(0)])));
      Object.defineProperty(compressor, 'foreignParameter', { enumerable: true, value: parameter(77) });
      return compressor;
    }
  };
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js'); deliver(dom, suppliedConfig);
  if (failures.storage) Object.defineProperty(dom.window, 'localStorage', { configurable: true, get() { throw new Error('storage unavailable'); } });
  let tick;
  if (manualClock) dom.window.setInterval = callback => { tick = callback; return 9001; };
  load(dom, 'web/audio.js');
  return { dom, video, audio: runtime(dom).audio, nodes, tick: () => tick(), sources: () => sources, resume: () => resolveResume(), context: () => context };
}

test('compressor applies only five explicit parameters with zero, bounds, and fallbacks', async t => {
  const cases = [
    {
      name: 'zero and boundary values',
      config: { compressorThreshold: 0, compressorKnee: 0, compressorRatio: 1, compressorAttack: 0, compressorRelease: 1 },
      expected: { threshold: 0, knee: 0, ratio: 1, attack: 0, release: 1 },
    },
    {
      name: 'out-of-range, nonfinite, and missing values',
      config: { compressorThreshold: -101, compressorKnee: 41, compressorRatio: NaN, compressorRelease: 2 },
      expected: { threshold: -50, knee: 40, ratio: 12, attack: 0, release: 0.25 },
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async child => {
      const { audio, video, nodes } = setup(child, false, false, fixture.config);
      await audio.setEnabled(video, true);
      const compressor = nodes.find(value => value.type === 'compressor');
      assert.deepEqual(Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, compressor[key].value])), fixture.expected);
      assert.equal(compressor.foreignParameter.value, 77);
    });
  }
});

test('suspended context creates no media source before running and off cancels late resume', async t => {
  const { audio, video, sources, resume } = setup(t, true);
  const enabling = audio.setEnabled(video, true);
  assert.equal(audio.getState(video), 'pending');
  assert.equal(sources(), 0);
  await audio.setEnabled(video, false);
  resume(); await enabling;
  assert.equal(audio.getState(video), 'off');
  assert.equal(sources(), 0);
});

test('repeated toggles and UI reuse share one media source and have one bypass route', async t => {
  const { audio, video, sources, nodes } = setup(t);
  for (let index = 0; index < 20; index++) await audio.setEnabled(video, index % 2 === 0);
  assert.equal(sources(), 1);
  assert.equal(audio.getState(video), 'off');
  const source = nodes.find(value => value.type === 'source');
  const [delay] = [...source.outputs];
  const [dry] = [...delay.outputs];
  assert.equal(dry.gain.value, 1);
  const compressor = nodes.find(value => value.type === 'compressor');
  assert.equal(compressor.attack.value, 0);
  assert.equal(compressor.threshold.value, -50);
});

test('dry bypass matches the Chromium compressor pre-delay at 48kHz', async t => {
  const { audio, video, nodes } = setup(t);
  await audio.setEnabled(video, true);
  const source = nodes.find(value => value.type === 'source');
  const delay = nodes.find(value => value.type === 'delay');
  assert.ok(delay, 'the dry branch must own a delay node');
  assert.equal(delay.maxDelayTime, 0.02);
  assert.equal(delay.delayTime.value, 0.006);
  assert.deepEqual([...source.outputs].map(value => value.type).sort(), ['compressor', 'delay']);
  const [dry] = [...delay.outputs];
  assert.equal(dry.type, 'gain');
  assert.equal([...dry.outputs][0].type, 'destination');
});

test('dry delay follows Chromium compressor integer frames at fractional and capped rates', async t => {
  for (const [sampleRate, expectedFrames] of [[44100, 264], [48000, 288], [192000, 1023]]) {
    await t.test(String(sampleRate), async child => {
      const { audio, video, nodes } = setup(child, false, false, { compressorAttack: 0 }, { sampleRate });
      await audio.setEnabled(video, true);
      const delay = nodes.find(value => value.type === 'delay');
      assert.equal(delay.delayTime.value, expectedFrames / sampleRate);
    });
  }
});

test('delay construction failure leaves native media unintercepted', async t => {
  const { audio, video, sources } = setup(t, false, false, { compressorAttack: 0 }, { delay: true });
  assert.equal(await audio.setEnabled(video, true), 'unavailable');
  assert.equal(sources(), 0);
});

test('wet limiter is identity below point nine and bounded by point nine eight', async t => {
  const { audio, video, nodes } = setup(t);
  await audio.setEnabled(video, true);
  const compressor = nodes.find(value => value.type === 'compressor');
  const [userGain] = [...compressor.outputs];
  const [limiter] = [...userGain.outputs];
  assert.equal(limiter.type, 'limiter');
  assert.equal(limiter.oversample, 'none');
  assert.equal(limiter.curve.length, 4097);
  assert.equal([...limiter.outputs][0].type, 'gain');
  const curve = limiter.curve;
  assert.ok(Math.abs(curve[0] + 0.98) < 1e-6);
  assert.ok(Math.abs(curve.at(-1) - 0.98) < 1e-6);
  for (let index = 0; index < curve.length; index++) {
    const x = 2 * index / (curve.length - 1) - 1;
    assert.equal(Number.isFinite(curve[index]), true);
    if (index) assert.ok(curve[index] >= curve[index - 1]);
    assert.ok(Math.abs(curve[index] + curve.at(-1 - index)) < 1e-6);
    if (Math.abs(x) <= 0.9) assert.ok(Math.abs(curve[index] - x) < 1e-6);
    assert.ok(Math.abs(curve[index]) <= 0.980001);
  }
});

test('limiter construction failure leaves native media unintercepted', async t => {
  const { audio, video, sources } = setup(t, false, false, { compressorAttack: 0 }, { limiter: true });
  assert.equal(await audio.setEnabled(video, true), 'unavailable');
  assert.equal(sources(), 0);
});

test('audio preparation failure before source creation preserves the native path', async t => {
  for (const failures of [{ gainAt: 1 }, { gainAt: 2 }, { delay: true }, { compressor: true }, { gainAt: 3 }, { limiter: true }]) {
    await t.test(JSON.stringify(failures), async child => {
      const { audio, video, sources } = setup(child, false, false, { compressorAttack: 0 }, failures);
      assert.equal(await audio.setEnabled(video, true), 'unavailable');
      assert.equal(sources(), 0);
    });
  }
});

test('invalid or inaccessible gain storage falls back without blocking audio', async t => {
  for (const storage of ['invalid', 'inaccessible']) {
    await t.test(storage, async child => {
      const { audio, video, dom, nodes } = setup(child, false, false, { compressorAttack: 0 }, { storage: storage === 'inaccessible' });
      if (storage === 'invalid') dom.window.localStorage.setItem('knifeGain', 'not-a-number');
      assert.equal(await audio.setEnabled(video, true), 'on');
      assert.equal([...nodes.find(value => value.type === 'compressor').outputs][0].gain.value, 1);
    });
  }
});

test('audio entry does not publish a partial controller after startup failure', t => {
  const dom = page(playerHTML);
  t.after(() => dom.window.close());
  load(dom, 'web/runtime.js');
  const owner = runtime(dom);
  owner.createScope = () => ({ interval() { throw new Error('interval unavailable'); }, on() {}, dispose() {} });
  assert.throws(() => load(dom, 'web/audio.js'), /interval unavailable/);
  assert.equal(Object.hasOwn(owner, 'audio'), false);
});

test('audio entry preserves an existing foreign controller', t => {
  const dom = page(playerHTML);
  t.after(() => dom.window.close());
  load(dom, 'web/runtime.js');
  const owner = runtime(dom);
  const foreign = Object.freeze({ owner: 'foreign' });
  owner.audio = foreign;
  load(dom, 'web/audio.js');
  assert.equal(owner.audio, foreign);
});

test('invalid stored gain is normalized before being applied to an audio graph', async t => {
  const { audio, video, dom, nodes } = setup(t);
  dom.window.localStorage.setItem('knifeGain', 'NaN');
  await audio.setEnabled(video, true);
  assert.equal(audio.setGain(video, Infinity), 1);
  const gains = nodes.filter(value => value.type === 'gain');
  assert.equal(gains.every(value => Number.isFinite(value.gain.value)), true);
});

test('unsupported cross-origin media remains native without source interception', async t => {
  const { audio, video, sources } = setup(t);
  Object.defineProperty(video, 'currentSrc', { value: 'https://foreign.invalid/video.mp4' });
  await audio.setEnabled(video, true);
  assert.equal(audio.getState(video), 'unavailable');
  assert.equal(sources(), 0);
});

test('retired paused media retains audible bypass when reused with compression off', async t => {
  const { dom, audio, video, nodes, tick, sources } = setup(t, false, true);
  await audio.setEnabled(video, true); await audio.setEnabled(video, false);
  const container = video.parentElement; video.remove();
  let now = 10000; dom.window.Date.now = () => now;
  tick(); now += 6000; tick(); container.append(video); runtime(dom).reconcile();
  const source = nodes.find(node => node.type === 'source');
  const delay = [...source.outputs].find(node => node.type === 'delay');
  const dry = delay && [...delay.outputs].find(node => node.type === 'gain' && node.gain.value === 1);
  assert.ok(dry, 'intercepted video must retain an audible dry path without enabling compression');
  assert.equal(dry.outputs.has(nodes.find(node => node.type === 'destination')), true);
  assert.equal(audio.getState(video), 'off'); assert.equal(sources(), 1);
});

test('bfcache freeze preserves requested compression and its output path', async t => {
  const { dom, audio, video } = setup(t);
  await audio.setEnabled(video, true);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(audio.getState(video), 'on');
});

test('sidebar identity changes and player UI reparenting preserve compression', async t => {
  const { dom, audio, video, sources } = setup(t);
  load(dom, 'web/player.js'); await audio.setEnabled(video, true);
  dom.window.document.body.insertAdjacentHTML('beforeend', '<aside id="sidebar"></aside>');
  runtime(dom).reconcile();
  assert.equal(audio.getState(video), 'on');
  const layout = dom.window.document.getElementById('live_player_layout');
  const pzp = layout.querySelector('.pzp-pc');
  const replacement = layout.cloneNode(false); layout.replaceWith(replacement); replacement.append(pzp);
  runtime(dom).reconcile();
  assert.equal(audio.getState(video), 'on'); assert.equal(sources(), 1);
  assert.equal(dom.window.document.querySelectorAll('.knife-comp').length, 1);
});

test('Gain changes schedule a short transition while UI and stored target update immediately', async t => {
  const { audio, video, nodes, context, dom } = setup(t);
  await audio.setEnabled(video, true);
  const compressor = nodes.find(node => node.type === 'compressor');
  const parameter = [...compressor.outputs][0].gain;
  context().currentTime = 1;
  assert.equal(audio.setGain(video, 1.5), 1.5);
  assert.equal(dom.window.localStorage.getItem('knifeGain'), '1.5');
  assert.deepEqual(parameter.events.slice(-3), [['cancel',1],['set',1,1],['ramp',1.5,1.01]]);
});

test('rapid Gain retargeting continues from the in-flight value instead of jumping to the previous target', async t => {
  const { audio, video, nodes, context } = setup(t);
  await audio.setEnabled(video, true);
  const parameter = [...nodes.find(node => node.type === 'compressor').outputs][0].gain;
  context().currentTime = 2; audio.setGain(video, 2);
  context().currentTime = 2.005; audio.setGain(video, 0);
  const [cancel,anchor,end] = parameter.events.slice(-3);
  assert.deepEqual(cancel,['cancel',2.005]);
  assert.equal(anchor[0],'set'); assert.ok(Math.abs(anchor[1]-1.5)<1e-10);
  assert.equal(anchor[2],2.005); assert.equal(end[0],'ramp'); assert.equal(end[1],0);
  assert.ok(Math.abs(end[2]-2.015)<1e-10);
});

test('unchanged Gain during configuration or repeated enable does not restart its transition', async t => {
  const { audio, video, nodes, context } = setup(t);
  await audio.setEnabled(video, true);
  const parameter = [...nodes.find(node => node.type === 'compressor').outputs][0].gain;
  context().currentTime = 3; audio.setGain(video, 1.5);
  const count = parameter.events.length;
  context().currentTime = 3.002; audio.configure(); await audio.setEnabled(video, true);
  assert.equal(parameter.events.length, count);
  context().currentTime = 3.1; audio.setGain(video, 0);
  assert.deepEqual(parameter.events.slice(-3),[['cancel',3.1],['set',1.5,3.1],['ramp',0,3.11]]);
});

test('source-creation retry initializes the replacement Gain node at the stored target', async t => {
  const { audio, video, nodes, context } = setup(t);
  audio.setGain(video, 1.5);
  // First attempt creates the context but fails before intercepting the video.
  const original = video.currentSrc;
  await audio.setEnabled(video, true);
  // Reproduce a failure on a fresh media entry with the already-created context.
  const second = video.cloneNode(); video.replaceWith(second);
  Object.defineProperty(second,'currentSrc',{value:original});
  runtime({window:second.ownerDocument.defaultView}).reconcile();
  const createSource = context().createMediaElementSource;
  context().createMediaElementSource = () => { throw new Error('temporary source failure'); };
  await audio.setEnabled(second,true);
  assert.equal(audio.getState(second),'unavailable');
  context().createMediaElementSource = () => ({ outputs:new Set(),connect(node){this.outputs.add(node);},disconnect(){this.outputs.clear();} });
  await audio.setEnabled(second,true);
  assert.equal(audio.getState(second),'on');
  const lastCompressor = nodes.filter(node=>node.type==='compressor').at(-1);
  assert.equal([...lastCompressor.outputs][0].gain.value,1.5);
  context().createMediaElementSource = createSource;
});
