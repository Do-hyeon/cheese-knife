const assert = require('node:assert/strict');
const { page, load, runtime, deliverScoped: deliver, playerHTML, flush, clock } = require('./helpers.cjs');

function setup(t, suspended = false, manualClock = false, suppliedConfig = { compressorAttack: 0 }, failures = {}) {
  const dom = page(playerHTML);
  const time=failures.clock?clock(dom):undefined;
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
    resume() {
      if (failures.resumeReject) return Promise.reject(new Error('resume unavailable'));
      return new Promise(resolve => { resolveResume = () => { this.state = 'running'; resolve(); }; });
    }
    createMediaElementSource(element) { if(failures.sourceVideos)assert.ok(failures.sourceVideos.has(element));else assert.equal(element, video);sources++;failures.onSource?.(dom);return node('source'); }
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
    createBiquadFilter() {
      const filter = Object.assign(node('biquad'), { frequency: parameter(350), Q: parameter(1), gain: parameter(0) });
      Object.defineProperty(filter, 'type', { get: () => 'biquad', set: value => { filter.filterType = value; } }); return filter;
    }
  };
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js'); deliver(dom, suppliedConfig);
  // Exercise the controller's own numeric clamps, independently of the v2 projection decoder.
  if (!runtime(dom).configReady) deliver(dom, {});
  runtime(dom).config = { ...suppliedConfig, audioDefault: suppliedConfig.audioDefault ?? suppliedConfig.compressorDefault ?? false };
  const statusChanges = [];
  const setStatus = runtime(dom).setStatus;
  runtime(dom).setStatus = (...args) => { statusChanges.push(args); return setStatus(...args); };
  if (failures.storage) Object.defineProperty(dom.window, 'localStorage', { configurable: true, get() { throw new Error('storage unavailable'); } });
  let tick;
  if (manualClock) dom.window.setInterval = callback => { tick = callback; return 9001; };
  load(dom, 'web/audio.js');
  return { dom, video, audio: runtime(dom).audio, nodes, statusChanges, time, tick: () => tick(), sources: () => sources, resume: () => resolveResume(), context: () => context };
}
module.exports = { setup };
