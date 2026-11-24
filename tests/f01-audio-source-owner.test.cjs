const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./audio-fixture.cjs');
const { load, runtime, flush } = require('./helpers.cjs');

const features = ['audioProcessing', 'compressor', 'equalizer', 'normalizer'];
const copy = value => JSON.parse(JSON.stringify(value));
const meters = node => node.messages.filter(packet => packet.kind === 'power' || packet.kind === 'read-error').length;
let stopped = false;
function snapshot(h) {
  const box = h.dom.window.document.querySelector('.knife-comp'), button = box.querySelector('button');
  const processors = h.nodes.filter(node => node.type === 'transition');
  return copy({
    intent: h.api.player.getAudioWanted({ ...h.api.media.context }),
    state: h.audio.getState(h.video), readback: h.audio.getReadback(h.video),
    ui: { state: box.dataset.state, pressed: button.getAttribute('aria-pressed'),
      title: button.title, label: button.getAttribute('aria-label') },
    features: Object.fromEntries(features.map(feature => [feature, h.api.statuses[feature]])),
    sources: h.sources(), sourceNodes: h.nodes.filter(node => node.type === 'source').length,
    transitionNodes: processors.length, nodes: h.nodes.length, ...h.counts(),
    oldCommands: h.oldNode.commands.length, currentCommands: h.node.commands.length,
    oldMessages: h.oldNode.messages.length, currentMessages: h.node.messages.length,
    aggregateCommands: processors.reduce((sum, node) => sum + node.commands.length, 0),
    aggregateMessages: processors.reduce((sum, node) => sum + node.messages.length, 0),
    meters: processors.reduce((sum, node) => sum + meters(node), 0),
    analysers: h.nodes.filter(node => node.type === 'analyser').length,
    meterSplitters: h.nodes.filter(node => node.type === 'splitter' && node.channels === 2).length,
    oldEpoch: h.oldNode.epoch, sourceEpoch: h.node.epoch,
    oldMeterEpoch: h.oldNode.meterEpoch, meterEpoch: h.node.meterEpoch,
    oldCommand: h.oldNode.commands.at(-1), currentCommand: h.node.commands.at(-1),
    normalizerEnabled: h.api.config.normalizerEnabled, config: h.api.config,
    graph: { rawConnected: h.source.outputs.has(h.dryDelay),
      oldProcessorConnected: h.source.outputs.has(h.oldNode), processorConnected: h.source.outputs.has(h.node),
      sourceOutputs: h.source.outputs.size, oldNodeOutputs: h.oldNode.outputs.size,
      nodeOutputs: h.node.outputs.size, oldControlOutputs: h.oldControls.outputs.size,
      controlOutputs: h.controls.outputs.size },
    media: { src: h.video.currentSrc, muted: h.video.muted, volume: h.video.volume },
  });
}
function rows(h, cursor) {
  return h.statusChanges.slice(cursor).filter(([feature]) => features.includes(feature))
    .map(([feature, state, reason]) => [feature, state, typeof reason === 'string' ? reason.slice(0, 80) : '']);
}
function diagnose(t, h, phase) {
  const current = snapshot(h);
  t.diagnostic(JSON.stringify({ phase, clock: h.dom.window.performance.now(), contextState: h.context().state,
    currentTime: h.context().currentTime, current }));
  return current;
}
function fixed(h, clock) {
  assert.equal(h.context(), h.savedContext);
  assert.equal(h.context().state, 'running');
  assert.equal(h.context().currentTime, 0);
  assert.equal(h.nodes.find(node => node.type === 'source'), h.source);
  assert.equal(h.nodes.filter(node => node.type === 'transition').at(-1), h.node);
  assert.equal(h.nodes.filter(node => node.type === 'splitter' && node.channels === 5).at(-1), h.controls);
  assert.equal([...h.source.outputs].find(node => node.type === 'delay'), h.dryDelay);
  assert.equal(h.dom.window.Date.now, h.domDateNow);
  assert.equal(Date.now, h.nodeDateNow);
  assert.equal(h.dom.window.performance.now(), clock);
  assert.notEqual(h.failures.manualWorkletAck, true);
}
function healthy(current, h, transitions, nodeCount) {
  assert.equal(current.intent.ok, true);
  assert.equal(current.intent.wanted, true);
  assert.equal(current.intent.state, 'on');
  assert.equal(current.state, 'on');
  assert.equal(current.readback.state, 'on');
  assert.equal(current.readback.wanted, true);
  assert.equal(current.readback.gain, 1);
  assert.equal(current.readback.appliedGain, 1);
  assert.equal(current.readback.sources, 1);
  assert.equal(current.sources, 1);
  assert.equal(current.sourceNodes, 1);
  assert.equal(current.transitionNodes, transitions);
  assert.equal(current.nodes, nodeCount);
  assert.equal(current.contexts, 1);
  assert.equal(current.resumes, 0);
  assert.equal(current.meters, 0);
  assert.equal(current.analysers, 0);
  assert.equal(current.meterSplitters, 0);
  assert.equal(current.normalizerEnabled, false);
  assert.equal(current.config.audioGain, 1);
  assert.equal(current.ui.state, 'on');
  assert.equal(current.ui.pressed, 'true');
  assert.deepEqual(current.features.audioProcessing, { state: 'ready', reason: '' });
  assert.deepEqual(current.features.compressor, { state: 'ready', reason: '' });
  assert.deepEqual(current.features.equalizer, { state: 'disabled', reason: '' });
  assert.deepEqual(current.features.normalizer, { state: 'disabled', reason: '' });
  assert.deepEqual(current.media, h.native);
}
function stable(t, h, before, phase, clock) {
  fixed(h, clock);
  const current = diagnose(t, h, phase), added = rows(h, before.cursor);
  assert.deepEqual(current, before.snapshot);
  for (const [feature, state, reason] of added) assert.deepEqual({ state, reason }, before.snapshot.features[feature],
    'no transient status may hide behind the current healthy publication');
  t.diagnostic(JSON.stringify({ phase, added }));
}

test('healthy source replacement ignores its old processor error while the current processor still fails', async t => {
  try {
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
    assert.equal(outcome.kind, 'fulfilled', 'initial ON must settle before inspecting its value');
    assert.equal(outcome.value.ok, true);
    assert.equal(outcome.value.wanted, true);
    assert.equal(outcome.value.state, 'on');
    const oldNode = fixture.nodes.find(node => node.type === 'transition');
    const oldControls = fixture.nodes.find(node => node.type === 'splitter' && node.channels === 5);
    const source = fixture.nodes.find(node => node.type === 'source');
    assert.ok(oldNode && oldControls && source);
    const dryDelay = [...source.outputs].find(node => node.type === 'delay');
    assert.ok(dryDelay);
    const h = { ...fixture, api, node: oldNode, oldNode, controls: oldControls, oldControls, source, dryDelay,
      native, failures, savedContext: fixture.context(), domDateNow, nodeDateNow, counts: () => ({ contexts, resumes }) };
    fixed(h, 0);
    const initial = diagnose(t, h, 'healthy initial source1 ON before replacement');
    healthy(initial, h, 1, 17);
    assert.equal(initial.aggregateCommands, 1);
    assert.equal(initial.aggregateMessages, 1);
    assert.equal(initial.graph.rawConnected, true);
    assert.equal(initial.graph.processorConnected, true);
    assert.equal(initial.graph.sourceOutputs, 2);
    assert.equal(initial.graph.controlOutputs, 5);
    assert.equal(typeof oldNode.port.onmessage, 'function');
    const oldError = oldNode.onprocessorerror, oldEpoch = oldNode.epoch;
    assert.equal(typeof oldError, 'function');
    assert.ok(Number.isSafeInteger(oldEpoch));
    const initialCommand = copy(oldNode.commands[0]);
    assert.equal(initialCommand.kind, 'configure');
    assert.equal(initialCommand.wanted, true);
    assert.equal(initialCommand.gain, 1);
    assert.equal(initialCommand.normalizer, false);
    assert.equal(initialCommand.sourceEpoch, oldEpoch);
    assert.ok(Number.isSafeInteger(initialCommand.seq) && initialCommand.seq > 0);
    assert.ok(Number.isSafeInteger(oldNode.meterEpoch));
    const rebindCursor = h.statusChanges.length;
    const replacement = 'blob:https://chzzk.naver.com/source-owner-replacement';
    Object.defineProperty(h.video, 'currentSrc', { configurable: true, value: replacement });
    h.audio.configure();
    await flush();
    h.node = h.nodes.filter(node => node.type === 'transition').at(-1);
    h.controls = h.nodes.filter(node => node.type === 'splitter' && node.channels === 5).at(-1);
    assert.notEqual(h.node, oldNode);
    assert.notEqual(h.controls, oldControls);
    assert.ok(Number.isSafeInteger(h.node.epoch) && h.node.epoch > oldEpoch);
    assert.equal(oldNode.port.onmessage, null);
    const currentError = h.node.onprocessorerror;
    assert.equal(typeof currentError, 'function');
    assert.notEqual(currentError, oldError);
    h.native = { ...native, src: replacement };
    fixed(h, 0);
    const rebound = diagnose(t, h, 'healthy same-video source1 new epoch after one finite flush');
    healthy(rebound, h, 2, 19);
    assert.deepEqual(rebound.config, initial.config);
    assert.deepEqual(rebound.ui, initial.ui);
    assert.deepEqual(rebound.readback, initial.readback);
    assert.deepEqual(rebound.intent, initial.intent);
    assert.deepEqual([rebound.oldCommands, rebound.currentCommands, rebound.oldMessages, rebound.currentMessages,
      rebound.aggregateCommands, rebound.aggregateMessages], [1, 1, 1, 1, 2, 2]);
    assert.deepEqual(rebound.oldCommand, initialCommand);
    const currentCommand = copy(h.node.commands[0]);
    assert.equal(currentCommand.kind, 'configure');
    assert.equal(currentCommand.sourceEpoch, h.node.epoch);
    assert.ok(Number.isSafeInteger(currentCommand.seq) && currentCommand.seq > 0);
    assert.equal(currentCommand.wanted, true);
    assert.equal(currentCommand.gain, 1);
    assert.equal(currentCommand.normalizer, false);
    assert.deepEqual(currentCommand.eq, initialCommand.eq);
    assert.equal(currentCommand.dynamics, initialCommand.dynamics);
    assert.equal(currentCommand.targetDbfs, initialCommand.targetDbfs);
    assert.deepEqual(copy(oldNode.messages), [initialCommand]);
    assert.deepEqual(copy(h.node.messages), [currentCommand]);
    assert.ok(Number.isSafeInteger(h.node.meterEpoch));
    assert.deepEqual(rebound.graph, { rawConnected: true, oldProcessorConnected: false, processorConnected: true,
      sourceOutputs: 2, oldNodeOutputs: 0, nodeOutputs: 3, oldControlOutputs: 0, controlOutputs: 5 });
    const rebindRows = rows(h, rebindCursor);
    for (const [, state] of rebindRows) assert.ok(state !== 'limited' && state !== 'failed' && state !== 'unavailable');
    t.diagnostic(JSON.stringify({ rebindRows, initialCommand, currentCommand, originalSrc: native.src,
      replacement, sourceRetained: h.nodes.find(node => node.type === 'source') === source,
      oldAndCurrentNodesDiffer: oldNode !== h.node, oldAndCurrentHandlersDiffer: oldError !== currentError }));
    const before = { snapshot: rebound, cursor: h.statusChanges.length };
    await h.time.advance(100);
    await flush();
    stable(t, h, before, 'current remains healthy before saved old error at 100', 100);
    // shortcut: direct saved callbacks exercise consumer ownership only; Native event delivery remains unproved.
    oldError();
    stable(t, h, before, 'saved old processor error is inert immediately at 100', 100);
    await flush();
    stable(t, h, before, 'saved old processor error remains inert after flush at 100', 100);
    assert.equal(h.node.onprocessorerror, currentError);
    await h.time.advance(100);
    await flush();
    stable(t, h, before, 'current remains healthy before current error at 200', 200);
    const faultCursor = h.statusChanges.length;
    currentError();
    const expected = copy(rebound);
    expected.intent.state = expected.state = expected.readback.state = 'unavailable';
    expected.readback.appliedGain = null;
    expected.ui = { state: 'unavailable', pressed: 'false', title: 'Enable compressor', label: 'Enable compressor' };
    expected.features.audioProcessing = { state: 'limited', reason: 'audio-processor-failed' };
    expected.features.compressor = { state: 'limited', reason: '' };
    expected.graph.processorConnected = false;
    expected.graph.sourceOutputs = 1;
    expected.graph.nodeOutputs = 0;
    expected.graph.controlOutputs = 0;
    const expectedRows = [
      ['audioProcessing', 'limited', ''], ['compressor', 'limited', ''],
      ['equalizer', 'disabled', ''], ['normalizer', 'disabled', ''],
      ['audioProcessing', 'limited', 'audio-processor-failed'],
    ];
    fixed(h, 200);
    assert.deepEqual(diagnose(t, h, 'current processor error retains original failure immediately at 200'), expected);
    assert.deepEqual(rows(h, faultCursor), expectedRows);
    await flush();
    fixed(h, 200);
    assert.deepEqual(diagnose(t, h, 'current processor error retains original failure after flush at 200'), expected);
    assert.deepEqual(rows(h, faultCursor), expectedRows);
    t.diagnostic(JSON.stringify({ faultRows: rows(h, faultCursor), oldErrorAt: 100, currentErrorAt: 200,
      retries: 0, stopped, sourceRetained: true, originalRawRetained: true }));
  } catch (error) { stopped = true; throw error; }
});
