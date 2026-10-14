const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime, flush, deliverScoped } = require('./helpers.cjs');
const { setup } = require('./audio-fixture.cjs');
test('normalizer has separate stereo meters and a bounded exponential schedule before master Gain', async t => {
  const { audio, video, dom, nodes, context, tick } = setup(t, false, true, { normalizerEnabled: true });
  Object.defineProperty(video, 'paused', { value: false, configurable: true });
  assert.equal(await audio.setEnabled(video, true), 'on');
  const meters = nodes.filter(node => node.type === 'analyser'); assert.equal(meters.length, 2);
  assert.deepEqual(meters.map(node => node.fftSize), [16384,16384]);
  for (let i = 1; i <= 6; i++) { context().currentTime = i / 10; tick(); await flush(); }
  const automation = nodes.filter(node => node.type === 'gain').flatMap(node => node.gain.events.filter(event => event[0] === 'exp'));
  assert.ok(automation.length > 0); assert.equal(automation.every(event => event[1] > 0), true);
  assert.equal(runtime(dom).statuses.normalizer.state, 'ready');
  const serialized = JSON.stringify(runtime(dom).statuses); assert.doesNotMatch(serialized, /leftPower|rightPower|Float32Array|samples/);
  const before = meters.map(node => node.reads); video.muted = true;
  context().currentTime = 0.7; tick(); assert.deepEqual(meters.map(node => node.reads), before);
  runtime(dom).config.normalizerEnabled = false; audio.configure();
  assert.equal(meters.every(node => node.outputs.size === 0), true);
  assert.equal(runtime(dom).statuses.normalizer.state, 'disabled'); assert.equal(audio.getState(video), 'on');
  const events = nodes.filter(node => node.type === 'gain').reduce((sum, node) => sum + node.gain.events.length, 0);
  tick(); assert.equal(nodes.filter(node => node.type === 'gain').reduce((sum, node) => sum + node.gain.events.length, 0), events);
});
test('unsupported normalizer rate never allocates meters or disables other effects', async t => {
  const { audio, video, nodes, dom } = setup(t, false, false, { normalizerEnabled: true }, { sampleRate: 192000 });
  assert.equal(await audio.setEnabled(video, true), 'on');
  assert.equal(nodes.filter(node => node.type === 'analyser').length, 0);
  assert.equal(runtime(dom).statuses.normalizer.reason, 'normalizer-sample-rate-unsupported');
  assert.equal(runtime(dom).statuses.compressor.state, 'ready');
});
test('a source replacement before reconciliation stops old meter reads and late callbacks', async t => {
  const { audio, video, nodes, context, tick } = setup(t, false, true, { normalizerEnabled: true });
  Object.defineProperty(video, 'paused', { value: false, configurable: true });
  await audio.setEnabled(video, true);
  const meters = nodes.filter(node => node.type === 'analyser'), reads = meters.map(node => node.reads);
  Object.defineProperty(video, 'currentSrc', { value: 'blob:https://chzzk.naver.com/new-source', configurable: true });
  context().currentTime = 0.1; tick();
  assert.deepEqual(meters.map(node => node.reads), reads, 'the old observation window must not include a replacement source');
  const count = nodes.filter(node => node.type === 'gain').reduce((sum, node) => sum + node.gain.events.length, 0);
  context().currentTime = 0.2; tick();
  assert.equal(nodes.filter(node => node.type === 'gain').reduce((sum, node) => sum + node.gain.events.length, 0), count);
});
test('nonfinite samples reset only normalizer and expose a bounded status rather than samples', async t => {
  const { audio, video, dom, context, tick, nodes } = setup(t, false, true, { normalizerEnabled: true }, { sample: NaN });
  Object.defineProperty(video, 'paused', { value: false, configurable: true });
  await audio.setEnabled(video, true); context().currentTime = 0.1; tick();
  const status = runtime(dom).statuses.normalizer;
  assert.equal(status.state, 'limited'); assert.equal(status.reason, 'normalizer-samples-invalid');
  assert.deepEqual(Object.keys(status).sort(), ['reason','state']); assert.equal(audio.getState(video), 'on');
  assert.equal(nodes.filter(node => node.type === 'gain').flatMap(node => node.gain.events).filter(event => event[0] === 'exp').every(event => event[1] === 1), true);
});
test('new selected video retires the previous stereo meter before allocating its own window', async t => {
  const sourceVideos = new Set();
  const { audio, video, dom, nodes } = setup(t, false, true, { normalizerEnabled: true }, { sourceVideos });
  sourceVideos.add(video); Object.defineProperty(video, 'paused', { value: false }); await audio.setEnabled(video, true);
  const previous = nodes.find(node => node.type === 'splitter');
  const next = video.cloneNode(); Object.defineProperty(next, 'currentSrc', { value: 'blob:https://chzzk.naver.com/second' });
  Object.defineProperty(next, 'paused', { value: false }); sourceVideos.add(next); video.replaceWith(next);
  runtime(dom).reconcile(); deliverScoped(dom, { normalizerEnabled: true }); await audio.setEnabled(next, true);
  assert.equal(previous.outputs.size, 0, 'old meter is disconnected before a second stereo window remains active');
  assert.equal(nodes.filter(node => node.type === 'splitter' && node.outputs.size > 0).length, 1);
});
for (const gate of ['paused','ended','muted','volume','gain','context','hidden']) test('normalizer holds during '+gate+' and requires a new valid window on resume', async t => {
  const { audio, video, dom, nodes, context, tick } = setup(t, false, true, { normalizerEnabled: true });
  Object.defineProperty(video, 'paused', { value: false, configurable: true }); await audio.setEnabled(video, true);
  const meters = nodes.filter(node => node.type === 'analyser');
  const setGate = active => {
    if (['paused','ended','muted'].includes(gate)) Object.defineProperty(video, gate, { value: active, configurable: true });
    else if (gate === 'volume') video.volume = active ? 0 : 1;
    else if (gate === 'gain') audio.setGain(video, active ? 0 : 1);
    else if (gate === 'context') context().state = active ? 'suspended' : 'running';
    else Object.defineProperty(dom.window.document, 'hidden', { value: active, configurable: true });
  };
  const before = meters.map(node => node.reads); setGate(true); context().currentTime = 0.1; tick();
  assert.deepEqual(meters.map(node => node.reads), before);
  setGate(false);
  for (const time of [0.2,0.3,0.4,0.5]) { context().currentTime = time; tick(); assert.equal(runtime(dom).statuses.normalizer.state, 'pending'); }
  context().currentTime = 0.6; tick(); assert.equal(runtime(dom).statuses.normalizer.state, 'ready');
});
