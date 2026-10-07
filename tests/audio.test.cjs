const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t, suspended = false) {
  const dom = page(playerHTML);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'currentSrc', { value: 'blob:https://chzzk.naver.com/test-media', configurable: true });
  const parameter = value => ({ value, setValueAtTime(next) { this.value = next; }, cancelScheduledValues() {}, linearRampToValueAtTime(next) { this.value = next; } });
  const nodes = [];
  const node = type => { const value = { type, outputs: new Set(), connect(dest) { this.outputs.add(dest); }, disconnect() { this.outputs.clear(); } }; nodes.push(value); return value; };
  let resolveResume;
  let context;
  let sources = 0;
  dom.window.AudioContext = class {
    constructor() { this.state = suspended ? 'suspended' : 'running'; this.destination = node('destination'); this.currentTime = 0; context = this; }
    resume() { return new Promise(resolve => { resolveResume = () => { this.state = 'running'; resolve(); }; }); }
    createMediaElementSource(element) { assert.equal(element, video); sources++; return node('source'); }
    createGain() { return Object.assign(node('gain'), { gain: parameter(1) }); }
    createDynamicsCompressor() { return Object.assign(node('compressor'), Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key => [key, parameter(0)]))); }
  };
  load(dom, 'web/runtime.js'); deliver(dom, { compressorAttack: 0 }); load(dom, 'web/audio.js');
  return { dom, video, audio: runtime(dom).audio, nodes, sources: () => sources, resume: () => resolveResume(), context: () => context };
}

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
  const [dry] = [...source.outputs];
  assert.equal(dry.gain.value, 1);
  const compressor = nodes.find(value => value.type === 'compressor');
  assert.equal(compressor.attack.value, 0);
  assert.equal(compressor.threshold.value, -50);
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
