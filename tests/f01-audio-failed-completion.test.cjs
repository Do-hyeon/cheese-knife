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
    nodes: h.nodes.length, commands: h.node.commands.length, messages: h.node.messages.length,
    meters: meterPackets(h.node).length, analysers: h.nodes.filter(node => node.type === 'analyser').length,
    meterSplitters: h.nodes.filter(node => node.type === 'splitter' && node.channels === 2).length,
    sourceEpoch: h.node.epoch, meterEpoch: h.node.meterEpoch, packet: h.node.packet, ...h.counts(),
    normalizerEnabled: h.api.config.normalizerEnabled, config: h.api.config,
    graph: { rawConnected: h.source.outputs.has(h.dryDelay), processorConnected: h.source.outputs.has(h.node),
      sourceOutputs: h.source.outputs.size, nodeOutputs: h.node.outputs.size, controlOutputs: h.controlSplitter.outputs.size },
    media: { src: h.video.currentSrc, muted: h.video.muted, volume: h.video.volume },
  });
}
function diagnose(t, h, phase) {
  const current = snapshot(h);
  t.diagnostic(JSON.stringify({ phase, clock: h.dom.window.performance.now(), contextState: h.context().state,
    currentTime: h.context().currentTime, current }));
  return current;
}
function fixed(h, clock, manualAck = false) {
  assert.equal(h.context(), h.savedContext);
  assert.equal(h.context().state, 'running');
  assert.equal(h.context().currentTime, 0);
  assert.equal(h.nodes.find(part => part.type === 'source'), h.source);
  assert.equal(h.nodes.find(part => part.type === 'transition'), h.node);
  assert.equal(h.nodes.find(part => part.type === 'splitter' && part.channels === 5), h.controlSplitter);
  assert.equal([...h.source.outputs].find(part => part.type === 'delay'), h.dryDelay);
  assert.equal(h.dom.window.Date.now, h.domDateNow);
  assert.equal(Date.now, h.nodeDateNow);
  assert.equal(h.dom.window.performance.now(), clock);
  assert.equal(h.failures.manualWorkletAck === true, manualAck);
}
function rows(h, cursor) {
  return h.statusChanges.slice(cursor).filter(([feature]) => features.includes(feature))
    .map(([feature, status, reason]) => [feature, status, typeof reason === 'string' ? reason.slice(0, 80) : '']);
}
function stable(t, h, before, phase, clock) {
  fixed(h, clock);
  const current = diagnose(t, h, phase), added = rows(h, before.cursor);
  t.diagnostic(JSON.stringify({ phase, added }));
  assert.deepEqual(current, before.snapshot);
  for (const [feature, state, reason] of added) assert.deepEqual({ state, reason },
    before.snapshot.features[feature], 'no transient status may hide behind a later healthy publication');
  return current;
}
function state(current, h, expected, gain, appliedGain) {
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
  assert.equal(current.nodes, 17);
  assert.equal(current.contexts, 1);
  assert.equal(current.resumes, 0);
  assert.equal(current.meters, 0);
  assert.equal(current.analysers, 0);
  assert.equal(current.meterSplitters, 0);
  assert.equal(current.normalizerEnabled, false);
  assert.equal(current.config.audioGain, 1);
  assert.equal(current.ui.state, expected);
  assert.equal(current.ui.pressed, expected === 'on' ? 'true' : 'false');
  assert.equal(current.features.audioProcessing.state, expected === 'on' ? 'ready' : 'limited');
  assert.equal(current.features.compressor.state, current.features.audioProcessing.state);
  assert.deepEqual(current.features.equalizer, { state: 'disabled', reason: '' });
  assert.deepEqual(current.features.normalizer, { state: 'disabled', reason: '' });
  assert.deepEqual(current.media, h.native);
}
async function healthyOn(t) {
  const failures = { clock: true };
  const fixture = setup({ after: cleanup => t.after(async () => {
    try { await cleanup(); } catch (error) { stopped = true; throw error; }
  }) }, false, true, { audioDefault: false, compressorEnabled: true, normalizerEnabled: false,
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
  assert.ok(fixture.dom.window.document.querySelector('.knife-comp button'));
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
  assert.ok(node && source && controlSplitter);
  const dryDelay = [...source.outputs].find(part => part.type === 'delay');
  assert.ok(dryDelay);
  const h = { ...fixture, api, node, source, controlSplitter, dryDelay, native, failures,
    savedContext: fixture.context(), domDateNow, nodeDateNow, counts: () => ({ contexts, resumes }) };
  fixed(h, 0, false);
  const initial = diagnose(t, h, 'healthy actual player ON with normalizer disabled');
  state(initial, h, 'on', 1, 1);
  assert.equal(initial.commands, 1);
  assert.equal(initial.messages, 1);
  assert.deepEqual(initial.graph, { rawConnected: true, processorConnected: true, sourceOutputs: 2, nodeOutputs: 3, controlOutputs: 5 });
  assert.deepEqual(initial.features.audioProcessing, { state: 'ready', reason: '' });
  assert.deepEqual(initial.features.compressor, { state: 'ready', reason: '' });
  const initialCommand = copy(node.commands[0]);
  assert.equal(initialCommand.kind, 'configure');
  assert.equal(initialCommand.wanted, true);
  assert.equal(initialCommand.gain, 1);
  assert.equal(initialCommand.normalizer, false);
  assert.equal(initialCommand.sourceEpoch, node.epoch);
  assert.ok(Number.isSafeInteger(initialCommand.seq) && initialCommand.seq > 0);
  assert.ok(Number.isSafeInteger(node.meterEpoch));
  h.before = { snapshot: initial, cursor: fixture.statusChanges.length };
  h.initialCommand = initialCommand;
  t.diagnostic(JSON.stringify({ initialCommand, initialOutcome: outcome.value }));
  return h;
}

host('matching duplicate completed cannot re-confirm applied Gain after current processor failure', async t => {
  const h = await healthyOn(t);
  const savedHandler = h.node.port.onmessage, savedError = h.node.onprocessorerror;
  assert.equal(typeof savedHandler, 'function');
  assert.equal(typeof savedError, 'function');
  const configure = copy(h.initialCommand), sourceEpoch = h.node.epoch, meterEpoch = h.node.meterEpoch;
  assert.deepEqual(copy(h.node.packet), configure);
  assert.deepEqual(copy(h.node.messages), [configure]);
  assert.equal(configure.sourceEpoch, sourceEpoch);
  const completion = { kind: 'completed', sourceEpoch: configure.sourceEpoch, seq: configure.seq,
    frame: 0, meterEpoch, gain: 1, code: null };
  const sameHandlerAndPacket = packet => {
    assert.equal(h.node.port.onmessage, savedHandler);
    assert.equal(h.node.onprocessorerror, savedError);
    assert.equal(h.node.epoch, sourceEpoch);
    assert.equal(h.node.meterEpoch, meterEpoch);
    assert.deepEqual(copy(h.node.packet), configure);
    assert.deepEqual(copy(h.node.commands), [configure]);
    assert.deepEqual(copy(h.node.messages), [configure]);
    assert.deepEqual(Object.keys(packet).sort(), ['code', 'frame', 'gain', 'kind', 'meterEpoch', 'seq', 'sourceEpoch']);
    assert.deepEqual(packet, completion);
    assert.equal(packet.kind, 'completed');
    assert.equal(packet.sourceEpoch, sourceEpoch);
    assert.equal(packet.seq, configure.seq);
    assert.ok(Number.isSafeInteger(packet.seq) && packet.seq > 0);
    assert.ok(Number.isSafeInteger(packet.meterEpoch));
    assert.equal(packet.frame, 0);
    assert.equal(packet.gain, configure.gain);
    assert.equal(packet.gain, 1);
    assert.equal(packet.code, null);
  };
  sameHandlerAndPacket(completion);
  await h.time.advance(100);
  await flush();
  stable(t, h, h.before, 'healthy normally completed configure before current fault at 100', 100);
  const faultCursor = h.statusChanges.length;
  savedError();
  const expected = copy(h.before.snapshot);
  expected.intent.state = expected.state = expected.readback.state = 'unavailable';
  expected.readback.appliedGain = null;
  expected.ui = { state: 'unavailable', pressed: 'false', title: 'Enable compressor', label: 'Enable compressor' };
  expected.features.audioProcessing = { state: 'limited', reason: 'audio-processor-failed' };
  expected.features.compressor = { state: 'limited', reason: '' };
  expected.graph = { rawConnected: true, processorConnected: false, sourceOutputs: 1, nodeOutputs: 0, controlOutputs: 0 };
  const expectedRows = [
    ['audioProcessing', 'limited', ''], ['compressor', 'limited', ''],
    ['equalizer', 'disabled', ''], ['normalizer', 'disabled', ''],
    ['audioProcessing', 'limited', 'audio-processor-failed'],
  ];
  fixed(h, 100);
  const immediate = diagnose(t, h, 'current processor fault invalidates appliedGain immediately at 100');
  state(immediate, h, 'unavailable', 1, null);
  assert.deepEqual(immediate, expected);
  assert.deepEqual(rows(h, faultCursor), expectedRows);
  await flush();
  fixed(h, 100);
  const failed = diagnose(t, h, 'current processor fault keeps original terminal consumers after flush at 100');
  state(failed, h, 'unavailable', 1, null);
  assert.deepEqual(failed, expected);
  assert.deepEqual(rows(h, faultCursor), expectedRows);
  sameHandlerAndPacket(completion);
  const terminal = { snapshot: failed, cursor: h.statusChanges.length };
  t.diagnostic(JSON.stringify({ phase: 'original fault and retained same-node completion coordinates',
    configure, completion, faultRows: rows(h, faultCursor), sourceEpoch, meterEpoch,
    retainedOriginalHandler: h.node.port.onmessage === savedHandler }));
  await h.time.advance(100);
  await flush();
  stable(t, h, terminal, 'terminal appliedGain null before matching duplicate completed at 200', 200);
  const packetCopy = copy(completion);
  sameHandlerAndPacket(packetCopy);
  // shortcut: direct retained-handler delivery checks post-fault consumer state, not Native ACK delay or event ordering.
  savedHandler({ data: packetCopy });
  stable(t, h, terminal, 'same-epoch latest-seq completed cannot re-confirm appliedGain immediately at 200', 200);
  await flush();
  stable(t, h, terminal, 'same-epoch latest-seq completed remains inert after flush at 200', 200);
  sameHandlerAndPacket(completion);
  t.diagnostic(JSON.stringify({ configure, deliveredPacket: packetCopy, faultAt: 100, lateCompletionAt: 200,
    appliedGainSequence: [h.before.snapshot.readback.appliedGain, failed.readback.appliedGain, snapshot(h).readback.appliedGain],
    lateRows: rows(h, terminal.cursor), originalSourceRetained: h.nodes.find(node => node.type === 'source') === h.source,
    originalHandlerRetained: h.node.port.onmessage === savedHandler, stopped }));
});
