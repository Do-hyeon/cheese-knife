const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime, flush } = require('./helpers.cjs');
const { setup } = require('./audio-fixture.cjs');
test('full audio graph keeps one source, fixed EQ and independent compressor bypass before master limiter', async t => {
  const { audio, video, nodes, dom, sources } = setup(t);
  assert.equal(await audio.setEnabled(video, true), 'on');
  const filters = nodes.filter(node => node.type === 'biquad');
  assert.equal(filters.length, 8, 'all supported fixed EQ nodes exist');
  assert.deepEqual(filters.map(node => node.frequency.value), [63,125,250,500,1000,2000,4000,8000]);
  assert.equal(filters.every(node => node.Q.value === 1 && node.gain.value === 0 && node.filterType === 'peaking'), true);
  const source = nodes.find(node => node.type === 'source'), compressor = nodes.find(node => node.type === 'compressor');
  const headroom = [...source.outputs].find(node => node.type === 'gain');
  assert.equal(headroom.channelCount, 2); assert.equal(headroom.channelCountMode, 'explicit'); assert.equal(headroom.channelInterpretation, 'speakers');
  assert.equal(nodes.filter(node => node.type === 'delay').length, 2);
  const compWet = [...compressor.outputs][0]; assert.equal(compWet.gain.value, 1);
  const api = runtime(dom); api.config.compressorEnabled = false; audio.configure();
  assert.equal(compWet.gain.value, 0); assert.equal(audio.getState(video), 'on');
  assert.equal(api.statuses.audioProcessing.state, 'ready'); assert.equal(api.statuses.compressor.state, 'disabled');
  api.config.compressorEnabled = true; api.config.eqEnabled = true; api.config.eq63 = 6; audio.configure();
  assert.equal(compWet.gain.value, 1); assert.equal(filters[0].gain.value, 6);
  assert.ok(Math.abs(headroom.gain.value - 0.5011872336272722) < 1e-12);
  audio.setGain(video, 0); assert.equal(audio.getReadback(video).appliedGain, 0);
  await audio.setEnabled(video, false); await audio.setEnabled(video, true); assert.equal(sources(), 1);
  assert.equal(video.muted, false); assert.equal(video.volume, 1);
});
test('EQ below its supported rate stays identity and limited while compressor remains available', async t => {
  const { audio, video, dom, nodes } = setup(t, false, false, { eqEnabled: true, eq63: 6 }, { sampleRate: 16000 });
  assert.equal(await audio.setEnabled(video, true), 'on');
  assert.equal(runtime(dom).statuses.equalizer.state, 'limited'); assert.equal(runtime(dom).statuses.equalizer.reason, 'eq-sample-rate-unsupported');
  assert.equal(nodes.filter(node => node.type === 'biquad').length, 0);
});
test('EQ and dry/wet retargets continue from their in-flight values', async t => {
  const { audio, video, dom, nodes, context } = setup(t); await audio.setEnabled(video, true);
  const api = runtime(dom), dry = nodes.filter(node => node.type === 'gain')[0];
  context().currentTime = 0.005; await audio.setEnabled(video, false);
  assert.ok(Math.abs(dry.gain.events.at(-2)[1] - 0.5) < 1e-10);
  context().currentTime = 1; api.config.eqEnabled = true; api.config.eq63 = 6; audio.configure();
  const parameter = nodes.find(node => node.type === 'biquad').gain;
  context().currentTime = 1.01; api.config.eq63 = -6; audio.configure();
  assert.ok(Math.abs(parameter.events.at(-2)[1] - 3) < 1e-9);
  assert.ok(Math.abs(parameter.events.at(-1)[2] - 1.03) < 1e-12);
});
test('a retired graph cannot overwrite the current audio processing status', async t => {
  const { audio, video, dom, statusChanges } = setup(t); await audio.setEnabled(video, true);
  const other = video.cloneNode(); video.replaceWith(other); runtime(dom).reconcile(); await flush();
  const before = statusChanges.length; audio.bypass(video); audio.configure();
  assert.equal(statusChanges.length, before);
});
test('failed graph preparation never exposes partially created EQ nodes to a Gain preview', async t => {
  const { audio, video, sources } = setup(t, false, false, {}, { gainAt: 4 });
  assert.equal(await audio.setEnabled(video, true), 'unavailable'); assert.equal(sources(), 0);
  assert.doesNotThrow(() => audio.setGain(video, 0.5)); assert.equal(sources(), 0);
});
