const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime, flush, deliverScoped } = require('./helpers.cjs');
const { setup } = require('./audio-fixture.cjs');

async function boosted(t, failures = {}) {
  const fixture = setup(t, false, true, { normalizerEnabled: true }, failures);
  Object.defineProperty(fixture.video, 'paused', { value: false, configurable: true });
  await fixture.audio.setEnabled(fixture.video, true);
  for (let i = 1; i <= 10; i++) { fixture.context().currentTime = i / 10; fixture.tick(); }
  fixture.context().currentTime = 1.1;
  return { ...fixture, gain: fixture.nodes.filter(node => node.type === 'gain')[7].gain };
}

test('master OFF holds normalization through the wet fade while retiring analysis immediately', async t => {
  const { audio, video, nodes, context, tick, gain } = await boosted(t);
  const meters = nodes.filter(node => node.type === 'analyser'), reads = meters.map(node => node.reads);
  gain.events.length = 0; await audio.setEnabled(video, false);
  assert.deepEqual(gain.events.map(event => event[0]), ['cancel','set','set','exp']);
  assert.ok(Math.abs(gain.events[1][1] - 10 ** (.7 / 20)) < 1e-10);
  assert.equal(gain.events[2][1], gain.events[1][1]);
  assert.ok(Math.abs(gain.events[2][2] - 1.11) < 1e-10);
  assert.deepEqual(gain.events.at(-1).slice(0,2), ['exp',1]);
  assert.ok(Math.abs(gain.events.at(-1)[2] - 1.12) < 1e-10);
  assert.equal(meters.every(node => node.outputs.size === 0), true);
  const count = gain.events.length; context().currentTime = 1.105; tick();
  assert.deepEqual(meters.map(node => node.reads), reads); assert.equal(gain.events.length, count);
});

for (const [time,db] of [[1.105,.7],[1.115,.35],[1.125,0]]) test('quick master reentry rebases and cancels retired unity at '+time, async t => {
  const { audio, video, context, gain, tick, nodes } = await boosted(t);
  await audio.setEnabled(video, false); context().currentTime = time; gain.events.length = 0;
  await audio.setEnabled(video, true);
  assert.deepEqual(gain.events[0], ['cancel',time]);
  assert.ok(Math.abs(gain.events[1][1] - 10 ** (db / 20)) < 1e-10);
  assert.equal(gain.events.some(event => event[0] === 'exp'), false, 'retired reset must not survive new warmup');
  const start = gain.events.length;
  context().currentTime = time + .1; tick();
  assert.ok(Math.abs(gain.events[start+1][1] - 10 ** (db / 20)) < 1e-10);
  assert.equal(nodes.filter(node => node.type === 'splitter' && node.outputs.size > 0).length, 1);
  assert.equal(nodes.filter(node => node.type === 'source').length, 1);
});

test('standalone normalizer OFF keeps the immediate ten millisecond unity reset', async t => {
  const { audio, dom, gain } = await boosted(t);
  gain.events.length = 0; runtime(dom).config.normalizerEnabled = false; audio.configure();
  assert.deepEqual(gain.events.map(event => event[0]), ['cancel','set','exp']);
  assert.ok(Math.abs(gain.events.at(-1)[2] - 1.11) < 1e-10);
});

test('analysis failure after rapid reentry still resets boosted gain to unity in ten milliseconds', async t => {
  const failures = {}, { audio, video, gain, context, tick, dom } = await boosted(t, failures);
  await audio.setEnabled(video, false); context().currentTime = 1.105; await audio.setEnabled(video, true);
  failures.sample = NaN; gain.events.length = 0; context().currentTime = 1.205; tick();
  assert.deepEqual(gain.events.map(event => event[0]), ['cancel','set','exp']);
  assert.ok(Math.abs(gain.events[1][1] - 10 ** (.7 / 20)) < 1e-10);
  assert.deepEqual(gain.events.at(-1).slice(0,2), ['exp',1]);
  assert.ok(Math.abs(gain.events.at(-1)[2] - 1.215) < 1e-10);
  assert.equal(runtime(dom).statuses.normalizer.reason, 'normalizer-samples-invalid');
});

test('a native clock quantum between planning and scheduling never shortens normalizer ramps', async t => {
  const { gain, context, tick } = await boosted(t);
  let time = 1.2;
  Object.defineProperty(context(), 'currentTime', { configurable: true, get() { const now = time; time += .003; return now; } });
  gain.events.length = 0; tick();
  const start = gain.events.find(event => event[0] === 'set')[2], end = gain.events.find(event => event[0] === 'exp')[2];
  assert.ok(Math.abs(end - start - .1) < 1e-10);
});

test('reentry cancels a retired reset before allocating the next analysis window', async t => {
  const { audio, video, gain, context } = await boosted(t);
  await audio.setEnabled(video, false); context().currentTime = 1.115; gain.events.length = 0;
  const create = context().createAnalyser.bind(context());
  context().createAnalyser = () => { context().currentTime += .004; return create(); };
  await audio.setEnabled(video, true);
  assert.deepEqual(gain.events[0], ['cancel',1.115]);
  assert.ok(Math.abs(gain.events[1][1] - 10 ** (.35 / 20)) < 1e-10);
  assert.equal(gain.events.filter(event => event[0] === 'set').every(event => Math.abs(event[1]-10 ** (.35/20))<1e-10), true);
});

test('failed reentry allocation resets the held normalization to unity in ten milliseconds', async t => {
  const { audio, video, gain, context, dom } = await boosted(t);
  await audio.setEnabled(video, false); context().currentTime = 1.115; gain.events.length = 0;
  context().createAnalyser = () => { throw new Error('native allocation failed'); };
  await audio.setEnabled(video, true);
  const reset = gain.events.find(event => event[0] === 'exp');assert.ok(reset);
  assert.equal(reset[1],1);assert.ok(Math.abs(reset[2]-1.125)<1e-10);
  assert.equal(runtime(dom).statuses.normalizer.reason,'normalizer-unavailable');
});

test('source replacement never inherits a retired meter gain or unity reservation', async t => {
  const { audio, video, gain, context } = await boosted(t);
  Object.defineProperty(video, 'currentSrc', { value: 'blob:https://chzzk.naver.com/replaced', configurable: true });
  audio.configure(); gain.events.length = 0; context().currentTime = 1.105;
  audio.configure();
  const sets = gain.events.filter(event => event[0] === 'set');
  assert.ok(sets.every(event => event[1] === 1), 'a replacement source starts a fresh unity window');
  assert.equal(gain.value, 1);
});

test('repeated master OFF/ON cancels each old reset without accumulating sources or meters', async t => {
  const { audio, video, gain, context, nodes } = await boosted(t);
  for (let i = 0; i < 4; i++) {
    await audio.setEnabled(video, false); context().currentTime += .005;
    gain.events.length = 0; await audio.setEnabled(video, true);
    assert.ok(Math.abs(gain.events[1][1] - 10 ** (.7 / 20)) < 1e-10);
    assert.equal(gain.events.some(event => event[0] === 'exp'), false);
    context().currentTime += .005;
  }
  assert.equal(nodes.filter(node => node.type === 'source').length, 1);
  assert.equal(nodes.filter(node => node.type === 'splitter' && node.outputs.size > 0).length, 1);
});
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
