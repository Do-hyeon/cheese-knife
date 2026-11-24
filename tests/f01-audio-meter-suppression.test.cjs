const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./audio-fixture.cjs');
const { load, runtime, flush } = require('./helpers.cjs');

const features = ['audioProcessing', 'compressor', 'equalizer', 'normalizer'];
const copy = value => JSON.parse(JSON.stringify(value));
const meterPackets = node => node.messages.filter(packet => packet.kind === 'power' || packet.kind === 'read-error');
let stopped = false;
function host(name, body) {
  test(name, async t => {
    if (stopped) return t.skip('stopped after the first actual failure');
    try { await body(t); } catch (error) { stopped = true; throw error; }
  });
}
function snapshot(h) {
  const box = h.dom.window.document.querySelector('.knife-comp'), button = box.querySelector('button');
  return copy({
    intent: h.api.player.getAudioWanted({ ...h.api.media.context }),
    state: h.audio.getState(h.video), readback: h.audio.getReadback(h.video),
    ui: { state: box.dataset.state, pressed: button.getAttribute('aria-pressed'),
      title: button.title, label: button.getAttribute('aria-label') },
    features: Object.fromEntries(features.map(feature => [feature, h.api.statuses[feature]])),
    sources: h.sources(), sourceNodes: h.nodes.filter(node => node.type === 'source').length,
    transitionNodes: h.nodes.filter(node => node.type === 'transition').length,
    nodes: h.nodes.length, commands: h.node.commands.length, messages: h.node.messages.length, meters: meterPackets(h.node).length,
    sourceEpoch: h.node.epoch, meterEpoch: h.node.meterEpoch, ...h.counts(),
    normalizerEnabled: h.api.config.normalizerEnabled,
    graph: { rawConnected: h.source.outputs.has(h.dryDelay), processorConnected: h.source.outputs.has(h.node),
      sourceOutputs: h.source.outputs.size, controlOutputs: h.controlSplitter.outputs.size,
      meterOutputs: h.meterSplitter.outputs.size },
    media: { src: h.video.currentSrc, muted: h.video.muted, volume: h.video.volume },
  });
}
function diagnose(t, h, phase) {
  const current = snapshot(h);
  t.diagnostic(JSON.stringify({ phase, clock: h.dom.window.performance.now(), contextState: h.context().state,
    currentTime: h.context().currentTime, current }));
  return current;
}
function contextState(h, expected, manualAck) {
  assert.equal(h.context(), h.savedContext, 'the original context is retained');
  assert.equal(h.context().state, expected);
  assert.equal(h.context().currentTime, 0);
  assert.equal(h.dom.window.Date.now, h.domDateNow, 'DOM Date is untouched');
  assert.equal(Date.now, h.nodeDateNow, 'Node Date is untouched');
  assert.equal(h.failures.manualWorkletAck, manualAck);
}
function stable(t, h, before, phase, expectedState, manualAck) {
  contextState(h, expectedState, manualAck);
  const current = diagnose(t, h, phase), added = h.statusChanges.slice(before.cursor)
    .filter(([feature]) => features.includes(feature))
    .map(([feature, state, reason]) => ({ feature, state,
      reason: typeof reason === 'string' ? reason.slice(0, 80) : '' }));
  t.diagnostic(JSON.stringify({ phase, added }));
  assert.deepEqual(current, before.snapshot, 'the copied product state and graph must remain stable');
  for (const row of added) assert.deepEqual({ state: row.state, reason: row.reason },
    before.snapshot.features[row.feature], 'transient status changes must not be hidden by a later publication');
}
function state(current, h, expected, appliedGain) {
  assert.equal(current.intent.ok, true);
  assert.equal(current.intent.wanted, true);
  assert.equal(current.intent.state, expected);
  assert.equal(current.state, expected);
  assert.equal(current.readback.state, expected);
  assert.equal(current.readback.wanted, true);
  assert.equal(current.readback.gain, 1);
  assert.equal(current.readback.appliedGain, appliedGain);
  assert.equal(current.readback.sources, 1);
  assert.equal(current.sources, 1);
  assert.equal(current.sourceNodes, 1);
  assert.equal(current.transitionNodes, 1);
  assert.equal(current.nodes, 20);
  assert.equal(current.commands, 1);
  assert.equal(current.contexts, 1);
  assert.equal(current.resumes, 0);
  assert.equal(current.normalizerEnabled, true);
  assert.equal(current.ui.state, expected);
  assert.equal(current.ui.pressed, expected === 'on' ? 'true' : 'false');
  assert.equal(current.features.audioProcessing.state, expected === 'on' ? 'ready' : 'limited');
  assert.equal(current.features.compressor.state, current.features.audioProcessing.state);
  assert.equal(current.features.equalizer.state, 'disabled');
  assert.equal(current.features.normalizer.state, expected === 'on' ? 'pending' : 'limited');
  assert.equal(current.features.normalizer.reason, 'normalizer-warming-up');
  assert.deepEqual(current.media, h.native);
}
async function healthyOn(t) {
  const failures = { clock: true };
  const fixture = setup({ after: cleanup => t.after(async () => {
    try { await cleanup(); } catch (error) { stopped = true; throw error; }
  }) }, false, true, { audioDefault: false, compressorEnabled: true, normalizerEnabled: true,
    compressorAttack: 0, audioGain: 1, gainInherited: false }, failures);
  let contexts = 0, resumes = 0;
  const Base = fixture.dom.window.AudioContext;
  fixture.dom.window.AudioContext = class extends Base {
    constructor(...args) { super(...args); contexts++; }
    resume() { resumes++; return super.resume(); }
  };
  const domDateNow = fixture.dom.window.Date.now, nodeDateNow = Date.now;
  load(fixture.dom, 'web/player.js');
  const api = runtime(fixture.dom);
  api.reconcile();
  await flush();
  assert.ok(fixture.dom.window.document.querySelector('.knife-comp button'), 'real player UI is mounted');
  assert.deepEqual({ sources: fixture.sources(), nodes: fixture.nodes.length, contexts, resumes },
    { sources: 0, nodes: 0, contexts: 0, resumes: 0 });
  const native = { src: fixture.video.currentSrc, muted: fixture.video.muted, volume: fixture.video.volume };
  let outcome = { kind: 'pending' };
  const request = api.player.setAudioWanted(true, { ...api.media.context });
  void request.then(value => { outcome = { kind: 'fulfilled', value }; },
    error => { outcome = { kind: 'rejected', error }; });
  await flush();
  if (outcome.kind === 'rejected') throw outcome.error;
  assert.equal(outcome.kind, 'fulfilled', 'initial ON must settle before its stored value is inspected');
  assert.equal(outcome.value.ok, true);
  assert.equal(outcome.value.wanted, true);
  assert.equal(outcome.value.state, 'on');
  const node = fixture.nodes.find(part => part.type === 'transition');
  const source = fixture.nodes.find(part => part.type === 'source');
  const controlSplitter = fixture.nodes.find(part => part.type === 'splitter' && part.channels === 5);
  const meterSplitter = fixture.nodes.find(part => part.type === 'splitter' && part.channels === 2);
  assert.ok(node && source && controlSplitter && meterSplitter);
  const dryDelay = [...source.outputs].find(part => part.type === 'delay');
  assert.ok(dryDelay, 'save the actual raw delay linked from the source');
  assert.equal(fixture.nodes.filter(part => part.type === 'analyser').length, 2);
  const h = { ...fixture, api, node, source, controlSplitter, meterSplitter, dryDelay, native, failures,
    savedContext: fixture.context(), domDateNow, nodeDateNow, counts: () => ({ contexts, resumes }) };
  const initial = diagnose(t, h, 'healthy initial ON and automatic receipts drained');
  state(initial, h, 'on', 1);
  assert.equal(fixture.context().state, 'running');
  assert.equal(fixture.context().currentTime, 0);
  assert.equal(fixture.dom.window.performance.now(), 0);
  assert.deepEqual(initial.graph, { rawConnected: true, processorConnected: true,
    sourceOutputs: 2, controlOutputs: 5, meterOutputs: 2 });
  const initialMeter = copy(meterPackets(node).at(-1));
  assert.ok(initial.meters >= 1, 'initial automatic meter and receipt settle before suspension');
  assert.equal(initialMeter.kind, 'power');
  assert.equal(initialMeter.active, false);
  assert.equal(initialMeter.sourceEpoch, node.epoch);
  assert.equal(initialMeter.meterEpoch, node.meterEpoch);
  assert.ok(Number.isSafeInteger(initialMeter.meterSeq));
  assert.equal(fixture.video.paused, true);
  h.initialMeter = initialMeter;
  h.before = { snapshot: initial, cursor: fixture.statusChanges.length };
  t.diagnostic(JSON.stringify({ initialMeter, initialOutcome: outcome.value }));
  return h;
}

host('suspended meter tick has no wire or phantom watchdog', async t => {
  const h = await healthyOn(t);
  h.failures.manualWorkletAck = true;
  h.savedContext.state = 'suspended';
  h.savedContext.dispatchEvent(new h.dom.window.Event('statechange'));
  await flush();
  assert.equal(h.dom.window.performance.now(), 0);
  stable(t, h, h.before, 'context suspended before new tick at 0', 'suspended', true);

  h.tick();
  await flush();
  stable(t, h, h.before, 'suspended tick sends no message at 0', 'suspended', true);
  await h.time.advance(1001);
  await flush();
  assert.equal(h.dom.window.performance.now(), 1001);
  // shortcut: this checks observable watchdog failure, not private timer enumeration; widen only for a new timer contract.
  stable(t, h, h.before, 'no wire or observable watchdog failure through 1001', 'suspended', true);

  h.savedContext.state = 'running';
  h.savedContext.dispatchEvent(new h.dom.window.Event('statechange'));
  await flush();
  stable(t, h, h.before, 'running event alone does not replay a packet', 'running', true);
  h.failures.manualWorkletAck = false;
  h.tick();
  await flush();
  contextState(h, 'running', false);
  const fresh = copy(meterPackets(h.node).at(-1));
  assert.equal(fresh.kind, 'power');
  assert.equal(fresh.active, false);
  assert.equal(fresh.sourceEpoch, h.initialMeter.sourceEpoch);
  assert.equal(fresh.meterEpoch, h.initialMeter.meterEpoch);
  assert.ok(Number.isSafeInteger(fresh.meterSeq) && fresh.meterSeq > h.initialMeter.meterSeq);
  assert.equal(fresh.observedTime, h.context().currentTime);
  const expected = copy(h.before.snapshot);
  expected.messages++;
  expected.meters++;
  const after = { snapshot: expected, cursor: h.before.cursor };
  stable(t, h, after, 'one fresh running tick with original automatic hold receipt', 'running', false);
  state(snapshot(h), h, 'on', 1);
  t.diagnostic(JSON.stringify({ initialMeter: h.initialMeter, freshMeter: fresh,
    initialMessages: h.before.snapshot.messages, freshMessages: h.node.messages.length,
    receipt: 'original fixture automatic hold; no injected receipt' }));
  await h.time.advance(1001);
  await flush();
  assert.equal(h.dom.window.performance.now(), 2002);
  stable(t, h, after, 'fresh tick remains healthy through total 2002', 'running', false);
});
