const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime, flush } = require('./helpers.cjs');
const { setup } = require('./audio-fixture.cjs');
test('full audio graph keeps one source, fixed EQ and independent compressor bypass before master limiter', async t => {
  const { audio, video, nodes, dom, sources } = setup(t);
  assert.equal(await audio.setEnabled(video, true), 'on');
  const processor = nodes.find(node => node.type === 'transition');
  assert.ok(processor);assert.equal(nodes.filter(node=>node.type==='biquad').length,0);
  assert.deepEqual(Array.from(processor.commands.at(-1).eq),[0,0,0,0,0,0,0,0]);
  const source = nodes.find(node => node.type === 'source'), compressor = nodes.find(node => node.type === 'compressor');
  assert.ok(source.outputs.has(processor));
  assert.equal(processor.options.channelCount, 2); assert.equal(processor.options.channelCountMode, 'explicit'); assert.equal(processor.options.channelInterpretation, 'speakers');
  assert.equal(nodes.filter(node => node.type === 'delay').length, 2);
  const compWet = [...compressor.outputs][0]; assert.equal(compWet.gain.value, 1);
  const api = runtime(dom); api.config.compressorEnabled = false; audio.configure();
  assert.equal(compWet.gain.value, 0); assert.equal(audio.getState(video), 'on');
  assert.equal(api.statuses.audioProcessing.state, 'ready'); assert.equal(api.statuses.compressor.state, 'disabled');
  api.config.compressorEnabled = true; api.config.eqEnabled = true; api.config.eq63 = 6; audio.configure();await flush();
  assert.equal(compWet.gain.value, 1); assert.equal(processor.commands.at(-1).eq[0], 6);
  audio.setGain(video, 0);assert.equal(audio.getReadback(video).appliedGain,null);await flush();assert.equal(audio.getReadback(video).appliedGain, 0);
  await audio.setEnabled(video, false); await audio.setEnabled(video, true); assert.equal(sources(), 1);
  assert.equal(video.muted, false); assert.equal(video.volume, 1);
});
test('EQ below its supported rate stays identity and limited while compressor remains available', async t => {
  const { audio, video, dom, nodes } = setup(t, false, false, { eqEnabled: true, eq63: 6 }, { sampleRate: 16000 });
  assert.equal(await audio.setEnabled(video, true), 'on');
  assert.equal(runtime(dom).statuses.equalizer.state, 'limited'); assert.equal(runtime(dom).statuses.equalizer.reason, 'eq-sample-rate-unsupported');
  assert.equal(nodes.filter(node => node.type === 'biquad').length, 0);
});
test('EQ and master retargets send current intents to the render owner without native EQ/master automation', async t => {
  const { audio, video, dom, nodes, context } = setup(t); await audio.setEnabled(video, true);
  const api = runtime(dom), dry = nodes.filter(node => node.type === 'gain')[0];
  context().currentTime = 0.005; await audio.setEnabled(video, false);
  await flush();const processor=nodes.find(node=>node.type==='transition');assert.equal(processor.commands.at(-1).wanted,false);assert.deepEqual(dry.gain.events,[]);
  context().currentTime = 1; api.config.eqEnabled = true; api.config.eq63 = 6; audio.configure();
  context().currentTime = 1.01; api.config.eq63 = -6; audio.configure();
  await flush();assert.equal(processor.commands.at(-1).eq[0],-6);assert.equal(nodes.filter(node=>node.type==='biquad').length,0);
  assert.ok(processor.commands.every((packet,index)=>index===0||packet.seq>processor.commands[index-1].seq));
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
