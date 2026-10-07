const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t, suspended = false, manualClock = false) {
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
  load(dom, 'web/runtime.js'); deliver(dom, { compressorAttack: 0 });
  let tick;
  if (manualClock) dom.window.setInterval = callback => { tick = callback; return 9001; };
  load(dom, 'web/audio.js');
  return { dom, video, audio: runtime(dom).audio, nodes, tick: () => tick(), sources: () => sources, resume: () => resolveResume(), context: () => context };
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

test('retired paused media retains audible bypass when reused with compression off', async t => {
  const { dom, audio, video, nodes, tick, sources } = setup(t, false, true);
  await audio.setEnabled(video, true); await audio.setEnabled(video, false);
  const container = video.parentElement; video.remove();
  let now = 10000; dom.window.Date.now = () => now;
  tick(); now += 6000; tick(); container.append(video); runtime(dom).reconcile();
  const source = nodes.find(node => node.type === 'source');
  const dry = [...source.outputs].find(node => node.type === 'gain' && node.gain.value === 1);
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
