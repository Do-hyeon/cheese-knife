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
    normalizerEnabled: h.api.config.normalizerEnabled, config: h.api.config,
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
function contextState(h, currentTime) {
  assert.equal(h.context(), h.savedContext, 'the original context is retained');
  assert.equal(h.nodes.find(part => part.type === 'source'), h.source);
  assert.equal(h.nodes.find(part => part.type === 'transition'), h.node);
  assert.equal(h.nodes.find(part => part.type === 'splitter' && part.channels === 5), h.controlSplitter);
  assert.equal(h.nodes.find(part => part.type === 'splitter' && part.channels === 2), h.meterSplitter);
  assert.equal([...h.source.outputs].find(part => part.type === 'delay'), h.dryDelay);
  assert.equal(h.context().state, 'running');
  assert.equal(h.context().currentTime, currentTime);
  assert.equal(h.dom.window.Date.now, h.domDateNow, 'DOM Date is untouched');
  assert.equal(Date.now, h.nodeDateNow, 'Node Date is untouched');
  assert.equal(h.failures.manualWorkletAck, true);
}
function stable(t, h, before, phase, clock, currentTime) {
  contextState(h, currentTime);
  assert.equal(h.dom.window.performance.now(), clock);
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
  assert.ok(initial.meters >= 1, 'initial automatic meter and receipt settle before the selected flight');
  assert.equal(initialMeter.kind, 'power');
  assert.equal(initialMeter.active, false);
  assert.equal(initialMeter.observedTime, 0);
  assert.equal(initialMeter.sourceEpoch, node.epoch);
  assert.equal(initialMeter.meterEpoch, node.meterEpoch);
  assert.ok(Number.isSafeInteger(initialMeter.meterSeq));
  assert.equal(fixture.video.paused, true);
  h.initialMeter = initialMeter;
  h.before = { snapshot: initial, cursor: fixture.statusChanges.length };
  t.diagnostic(JSON.stringify({ initialMeter, initialOutcome: outcome.value }));
  return h;
}

function powerPacket(packet, h, observedTime) {
  assert.equal(packet.kind, 'power');
  assert.equal(packet.active, false);
  assert.equal(packet.sourceEpoch, h.initialMeter.sourceEpoch);
  assert.equal(packet.meterEpoch, h.initialMeter.meterEpoch);
  assert.ok(Number.isSafeInteger(packet.meterSeq));
  assert.equal(packet.observedTime, observedTime);
  assert.equal(packet.leftPower, 0);
  assert.equal(packet.rightPower, 0);
  assert.equal(packet.targetDbfs, -20);
}

host('current failed reply preserves its reason after late meter receipt and watchdog boundary', async t => {
  const h = await healthyOn(t);
  h.failures.manualWorkletAck = true;
  h.tick();
  await flush();
  const sent = copy(meterPackets(h.node).at(-1));
  powerPacket(sent, h, 0);
  assert.ok(sent.meterSeq > h.initialMeter.meterSeq);
  const healthyExpected = copy(h.before.snapshot);
  healthyExpected.messages++;
  healthyExpected.meters++;
  const healthy = { snapshot: healthyExpected, cursor: h.before.cursor };
  stable(t, h, healthy, 'actual current meter sent at 0', 0, 0);
  assert.deepEqual(meterPackets(h.node).slice(h.before.snapshot.meters).map(copy), [sent]);

  await h.time.advance(100);
  await flush();
  stable(t, h, healthy, 'live meter healthy before current fault at 100', 100, 0);
  const configure = copy(h.node.commands.at(-1));
  assert.equal(configure.kind, 'configure');
  assert.equal(configure.wanted, true);
  assert.equal(configure.normalizer, true);
  assert.ok(Number.isSafeInteger(configure.seq) && configure.seq > 0);
  assert.equal(configure.sourceEpoch, sent.sourceEpoch);
  assert.equal(configure.sourceEpoch, h.node.epoch);
  assert.equal(sent.meterEpoch, h.node.meterEpoch);
  assert.deepEqual(copy(h.node.packet), configure);
  const fault = { kind: 'failed', sourceEpoch: configure.sourceEpoch, seq: configure.seq,
    frame: 0, meterEpoch: sent.meterEpoch, gain: null, code: 'l1-packet-invalid' };
  const faultCopy = copy(fault);
  assert.deepEqual(Object.keys(faultCopy).sort(), ['code', 'frame', 'gain', 'kind', 'meterEpoch', 'seq', 'sourceEpoch']);
  assert.deepEqual(faultCopy, fault);
  assert.equal(typeof h.node.port.onmessage, 'function');
  const faultCursor = h.statusChanges.length;
  h.node.reply('failed', faultCopy);

  const failedExpected = copy(healthyExpected);
  failedExpected.intent.state = failedExpected.state = failedExpected.readback.state = 'unavailable';
  failedExpected.readback.appliedGain = null;
  failedExpected.ui = { state: 'unavailable', pressed: 'false',
    title: 'Enable compressor', label: 'Enable compressor' };
  failedExpected.features.audioProcessing = { state: 'limited', reason: 'l1-packet-invalid' };
  failedExpected.features.compressor = { state: 'limited', reason: '' };
  failedExpected.features.normalizer.state = 'limited';
  failedExpected.graph = { rawConnected: true, processorConnected: false,
    sourceOutputs: 1, controlOutputs: 0, meterOutputs: 0 };
  const immediate = diagnose(t, h, 'current failed has immediate terminal consumer state at 100');
  contextState(h, 0);
  assert.equal(h.dom.window.performance.now(), 100);
  state(immediate, h, 'unavailable', null);
  assert.deepEqual(immediate, failedExpected);
  await flush();
  const failed = diagnose(t, h, 'current failed terminal state after flush at 100');
  contextState(h, 0);
  assert.equal(h.dom.window.performance.now(), 100);
  state(failed, h, 'unavailable', null);
  assert.deepEqual(failed, failedExpected);
  const faultRows = h.statusChanges.slice(faultCursor).filter(([feature]) => features.includes(feature))
    .map(([feature, status, reason]) => [feature, status, typeof reason === 'string' ? reason.slice(0, 80) : '']);
  assert.deepEqual(faultRows, [
    ['audioProcessing', 'limited', ''], ['compressor', 'limited', ''],
    ['equalizer', 'disabled', ''], ['normalizer', 'limited', 'normalizer-warming-up'],
    ['audioProcessing', 'limited', 'l1-packet-invalid'],
  ], 'current fault keeps its original fail/announce sequence and reason');
  const terminal = { snapshot: failed, cursor: h.statusChanges.length };
  t.diagnostic(JSON.stringify({ phase: 'fault before original meter deadline', sent, configure, fault,
    actualWireAdded: h.node.messages.length - h.before.snapshot.messages, faultRows,
    sentAt: 0, faultAt: 100, originalMeterDeadline: 1000 }));

  await h.time.advance(100);
  await flush();
  stable(t, h, terminal, 'first fault reason retained before late matching hold at 200', 200, 0);
  const lateReceipt = { kind: 'meter-accepted', sourceEpoch: sent.sourceEpoch, seq: sent.meterSeq,
    frame: 0, meterEpoch: sent.meterEpoch, gain: null, code: 'hold' };
  const receiptCopy = copy(lateReceipt);
  assert.deepEqual(Object.keys(receiptCopy).sort(), ['code', 'frame', 'gain', 'kind', 'meterEpoch', 'seq', 'sourceEpoch']);
  assert.deepEqual(receiptCopy, lateReceipt);
  assert.equal(typeof h.node.port.onmessage, 'function', 'late receipt reaches the retained handler seam');
  h.node.reply('meter-accepted', receiptCopy);
  stable(t, h, terminal, 'late matching receipt cannot alter terminal state immediately at 200', 200, 0);
  await flush();
  stable(t, h, terminal, 'late matching receipt cannot alter terminal state after flush at 200', 200, 0);
  t.diagnostic(JSON.stringify({ phase: 'late same-meter receipt', sent, fault, lateReceipt,
    sentAt: 0, faultAt: 100, receiptAt: 200, originalMeterDeadline: 1000 }));

  // shortcut: this observes one fault/late-receipt prefix, not physical timer removal; widen only for an approved contract.
  for (const [delta, clock] of [[800, 1000], [100, 1100]]) {
    await h.time.advance(delta);
    await flush();
    stable(t, h, terminal, 'first fault reason survives original meter watchdog boundary at ' + clock, clock, 0);
  }
});
