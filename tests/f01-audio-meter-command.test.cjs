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
    sourceEpoch: h.node.epoch, meterEpoch: h.node.meterEpoch, packet: h.node.packet,
    wire: h.node.messages, commandPackets: h.node.commands,
    analysers: h.nodes.filter(node => node.type === 'analyser').length,
    meterSplitters: h.nodes.filter(node => node.type === 'splitter' && node.channels === 2).length, ...h.counts(),
    normalizerEnabled: h.api.config.normalizerEnabled, config: h.api.config,
    graph: { rawConnected: h.source.outputs.has(h.dryDelay), processorConnected: h.source.outputs.has(h.node),
      sourceOutputs: h.source.outputs.size, nodeOutputs: h.node.outputs.size, controlOutputs: h.controlSplitter.outputs.size,
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
  assert.equal(h.context().state, 'running');
  assert.equal(h.context().currentTime, currentTime);
  assert.equal(h.dom.window.Date.now, h.domDateNow, 'DOM Date is untouched');
  assert.equal(Date.now, h.nodeDateNow, 'Node Date is untouched');
  assert.equal(h.failures.manualWorkletAck, true);
  assert.equal(h.video.paused, true);
  assert.equal(h.nodes.find(node => node.type === 'source'), h.source);
  assert.equal(h.nodes.find(node => node.type === 'transition'), h.node);
  assert.equal(h.nodes.find(node => node.type === 'splitter' && node.channels === 5), h.controlSplitter);
  assert.equal(h.nodes.find(node => node.type === 'splitter' && node.channels === 2), h.meterSplitter);
  assert.equal([...h.source.outputs].find(node => node.type === 'delay'), h.dryDelay);
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
function state(current, h, expected, appliedGain, gain = 1, commandCount = 1) {
  assert.equal(current.intent.ok, true);
  assert.equal(current.intent.wanted, true);
  assert.equal(current.intent.state, expected);
  assert.equal(current.state, expected);
  assert.equal(current.readback.state, expected);
  assert.equal(current.readback.wanted, true);
  assert.equal(current.readback.gain, gain);
  assert.equal(current.readback.appliedGain, appliedGain);
  assert.equal(current.readback.sources, 1);
  assert.equal(current.sources, 1);
  assert.equal(current.sourceNodes, 1);
  assert.equal(current.transitionNodes, 1);
  assert.equal(current.nodes, 20);
  assert.equal(current.commands, commandCount);
  assert.equal(current.analysers, 2);
  assert.equal(current.meterSplitters, 1);
  assert.equal(current.config.audioGain, 1);
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
    sourceOutputs: 2, nodeOutputs: 3, controlOutputs: 5, meterOutputs: 2 });
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

host('matching meter receipt cannot clear the simultaneous equal-sequence configure deadline', async t => {
  const h = await healthyOn(t);
  assert.notEqual(h.failures.manualWorkletAck, true);
  assert.equal(h.before.snapshot.commands, 1);
  assert.equal(h.before.snapshot.messages, 2);
  assert.equal(h.before.snapshot.meters, 1);
  assert.equal(h.before.snapshot.sourceEpoch, 1);
  assert.equal(h.before.snapshot.meterEpoch, 1);
  assert.equal(h.initialMeter.meterSeq, 1);
  powerPacket(h.initialMeter, h, 0);
  const initialConfigure = copy(h.node.commands[0]);
  assert.equal(initialConfigure.kind, 'configure');
  assert.equal(initialConfigure.sourceEpoch, 1);
  assert.equal(initialConfigure.seq, 1);
  assert.equal(initialConfigure.wanted, true);
  assert.equal(initialConfigure.gain, 1);
  assert.equal(initialConfigure.normalizer, true);
  assert.deepEqual(copy(h.node.packet), initialConfigure);
  assert.deepEqual(copy(h.node.messages), [initialConfigure, h.initialMeter]);
  const savedHandler = h.node.port.onmessage;
  assert.equal(typeof savedHandler, 'function');
  h.failures.manualWorkletAck = true;
  h.tick();
  await flush();
  const meter = copy(meterPackets(h.node).at(-1));
  powerPacket(meter, h, 0);
  assert.equal(meter.meterSeq, 2);
  assert.equal(meter.sourceEpoch, 1);
  assert.equal(meter.meterEpoch, 1);
  const meterExpected = copy(h.before.snapshot);
  meterExpected.messages++;
  meterExpected.meters++;
  meterExpected.wire.push(meter);
  const meterFlight = { snapshot: meterExpected, cursor: h.before.cursor };
  stable(t, h, meterFlight, 'actual meter M2 sent at 0 with own deadline1000', 0, 0);
  await h.time.advance(100);
  await flush();
  stable(t, h, meterFlight, 'M2 remains the only new wire before configure at 100', 100, 0);
  assert.equal(h.audio.setGain(h.video, .5), .5);
  const configure = copy(h.node.commands.at(-1));
  assert.equal(configure.kind, 'configure');
  assert.equal(configure.sourceEpoch, meter.sourceEpoch);
  assert.equal(configure.seq, 2);
  assert.equal(configure.seq, meter.meterSeq);
  assert.equal(configure.wanted, true);
  assert.equal(configure.gain, .5);
  assert.equal(configure.normalizer, true);
  assert.deepEqual(configure.eq, initialConfigure.eq);
  assert.equal(configure.dynamics, initialConfigure.dynamics);
  assert.equal(configure.targetDbfs, initialConfigure.targetDbfs);
  assert.deepEqual(copy(h.node.packet), configure);
  const pendingExpected = copy(meterExpected);
  pendingExpected.readback.gain = .5;
  pendingExpected.readback.appliedGain = null;
  pendingExpected.commands++;
  pendingExpected.messages++;
  pendingExpected.packet = configure;
  pendingExpected.commandPackets.push(configure);
  pendingExpected.wire.push(configure);
  const pending = { snapshot: pendingExpected, cursor: h.before.cursor };
  stable(t, h, pending, 'actual configure F2 sent at 100 with independent deadline1100', 100, 0);
  state(snapshot(h), h, 'on', null, .5, 2);
  await flush();
  stable(t, h, pending, 'M2 and unaccepted F2 remain pending after flush at 100', 100, 0);
  await h.time.advance(100);
  await flush();
  stable(t, h, pending, 'both original flights before meter-only receipt at 200', 200, 0);
  assert.equal(h.node.port.onmessage, savedHandler);
  assert.equal(h.node.epoch, meter.sourceEpoch);
  assert.equal(h.node.meterEpoch, meter.meterEpoch);
  assert.deepEqual(copy(h.node.commands), [initialConfigure, configure]);
  assert.deepEqual(copy(meterPackets(h.node)), [h.initialMeter, meter]);
  const receipt = { kind: 'meter-accepted', sourceEpoch: meter.sourceEpoch, seq: meter.meterSeq,
    frame: 0, meterEpoch: meter.meterEpoch, gain: null, code: 'hold' };
  const receiptCopy = copy(receipt);
  assert.deepEqual(Object.keys(receiptCopy).sort(), ['code', 'frame', 'gain', 'kind', 'meterEpoch', 'seq', 'sourceEpoch']);
  assert.deepEqual(receiptCopy, receipt);
  // shortcut: one HOLD dual-flight consumer prefix is observed; Native timer identity and event ordering remain unproved.
  h.node.reply('meter-accepted', receiptCopy);
  stable(t, h, pending, 'meter receipt with numeric seq2 cannot accept configure seq2 immediately at 200', 200, 0);
  await flush();
  stable(t, h, pending, 'meter receipt leaves configure appliedGain null after flush at 200', 200, 0);
  t.diagnostic(JSON.stringify({ meter, configure, receipt, meterSentAt: 0, meterDeadline: 1000,
    configureSentAt: 100, configureDeadline: 1100, receiptAt: 200,
    actualEqualSequence: meter.meterSeq === configure.seq, actualHandlerRetained: h.node.port.onmessage === savedHandler }));
  for (const [delta, clock] of [[799, 999], [1, 1000], [99, 1099]]) {
    await h.time.advance(delta);
    await flush();
    stable(t, h, pending, 'meter deadline cleared but unaccepted configure remains healthy at ' + clock, clock, 0);
  }
  const failureCursor = h.statusChanges.length;
  await h.time.advance(1);
  await flush();
  contextState(h, 0);
  assert.equal(h.dom.window.performance.now(), 1100);
  const failed = diagnose(t, h, 'only original configure acceptance deadline fails at 1100');
  state(failed, h, 'unavailable', null, .5, 2);
  const expectedFailure = copy(pendingExpected);
  expectedFailure.intent.state = expectedFailure.state = expectedFailure.readback.state = 'unavailable';
  expectedFailure.ui = { state: 'unavailable', pressed: 'false', title: 'Enable compressor', label: 'Enable compressor' };
  expectedFailure.features.audioProcessing = { state: 'limited', reason: 'audio-command-timeout' };
  expectedFailure.features.compressor = { state: 'limited', reason: '' };
  expectedFailure.features.normalizer.state = 'limited';
  expectedFailure.graph = { rawConnected: true, processorConnected: false, sourceOutputs: 1,
    nodeOutputs: 0, controlOutputs: 0, meterOutputs: 0 };
  assert.deepEqual(failed, expectedFailure);
  const failureRows = h.statusChanges.slice(failureCursor).filter(([feature]) => features.includes(feature))
    .map(([feature, state, reason]) => [feature, state, typeof reason === 'string' ? reason.slice(0, 80) : '']);
  assert.deepEqual(failureRows, [
    ['audioProcessing', 'limited', ''], ['compressor', 'limited', ''],
    ['equalizer', 'disabled', ''], ['normalizer', 'limited', 'normalizer-warming-up'],
    ['audioProcessing', 'limited', 'audio-command-timeout'],
  ]);
  assert.equal(h.node.port.onmessage, savedHandler);
  t.diagnostic(JSON.stringify({ phase: 'expected configure-only timeout at 1100', meter, configure, receipt,
    meterSentAt: 0, meterDeadline: 1000, configureSentAt: 100, configureDeadline: 1100,
    failureRows, appliedGain: failed.readback.appliedGain, actualConfigurationGain: h.api.config.audioGain, stopped }));
});
