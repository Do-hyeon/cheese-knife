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
    sourceEpoch: h.node.epoch, meterEpoch: h.node.meterEpoch, ...h.counts(),
    normalizerEnabled: h.api.config.normalizerEnabled, config: h.api.config,
    graph: { rawConnected: h.source.outputs.has(h.dryDelay), processorConnected: h.source.outputs.has(h.node),
      sourceOutputs: h.source.outputs.size, controlOutputs: h.controlSplitter.outputs.size },
    media: { src: h.video.currentSrc, muted: h.video.muted, volume: h.video.volume },
  });
}
function diagnose(t, h, phase) {
  const current = snapshot(h);
  t.diagnostic(JSON.stringify({ phase, clock: h.dom.window.performance.now(), contextState: h.context().state,
    currentTime: h.context().currentTime, current }));
  return current;
}
function fixed(h, clock, manualAck = true) {
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
  assert.deepEqual(initial.graph, { rawConnected: true, processorConnected: true, sourceOutputs: 2, controlOutputs: 5 });
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

host('in-flight configure rejection discards newer Gain preview without another wire command', async t => {
  const h = await healthyOn(t);
  h.failures.manualWorkletAck = true;
  const firstReturn = h.audio.setGain(h.video, .5);
  assert.equal(firstReturn, .5);
  const flightExpected = copy(h.before.snapshot);
  flightExpected.readback.gain = .5;
  flightExpected.readback.appliedGain = null;
  flightExpected.commands++;
  flightExpected.messages++;
  const flight = { snapshot: flightExpected, cursor: h.before.cursor };
  const firstImmediate = stable(t, h, flight, 'actual Gain.5 configure F sent at 0', 0);
  state(firstImmediate, h, 'on', .5, null);
  await flush();
  stable(t, h, flight, 'actual Gain.5 configure F after flush at 0', 0);
  const sent = copy(h.node.commands.at(-1));
  assert.equal(sent.kind, 'configure');
  assert.equal(sent.wanted, true);
  assert.equal(sent.gain, .5);
  assert.equal(sent.normalizer, false);
  assert.equal(sent.sourceEpoch, h.initialCommand.sourceEpoch);
  assert.ok(Number.isSafeInteger(sent.seq) && sent.seq > h.initialCommand.seq);
  assert.deepEqual(sent.eq, h.initialCommand.eq);
  assert.equal(sent.dynamics, h.initialCommand.dynamics);
  assert.equal(sent.targetDbfs, h.initialCommand.targetDbfs);
  assert.deepEqual(copy(h.node.packet), sent);
  assert.deepEqual(h.node.messages.slice(h.before.snapshot.messages).map(copy), [sent]);

  const latestReturn = h.audio.setGain(h.video, .75);
  assert.equal(latestReturn, .75);
  const pendingExpected = copy(flightExpected);
  pendingExpected.readback.gain = .75;
  const pending = { snapshot: pendingExpected, cursor: h.before.cursor };
  const latestImmediate = stable(t, h, pending, 'latest public Gain.75 remains unsent immediately at 0', 0);
  state(latestImmediate, h, 'on', .75, null);
  await flush();
  stable(t, h, pending, 'latest public Gain.75 remains unsent after flush at 0', 0);
  assert.deepEqual(copy(h.node.packet), sent);
  assert.deepEqual(copy(h.node.commands.at(-1)), sent);
  assert.deepEqual(h.node.messages.slice(h.before.snapshot.messages).map(copy), [sent]);

  await h.time.advance(100);
  await flush();
  stable(t, h, pending, 'newer Gain preview does not replace actual F before rejection at 100', 100);
  assert.deepEqual(copy(h.node.packet), sent);
  const rejection = { kind: 'rejected', sourceEpoch: sent.sourceEpoch, seq: sent.seq,
    frame: 128, meterEpoch: h.node.meterEpoch, gain: null, code: 'l1-command-invalid' };
  const rejectionCopy = copy(rejection);
  assert.deepEqual(Object.keys(rejectionCopy).sort(), ['code', 'frame', 'gain', 'kind', 'meterEpoch', 'seq', 'sourceEpoch']);
  assert.deepEqual(rejectionCopy, rejection);
  assert.equal(typeof h.node.port.onmessage, 'function');
  const failureCursor = h.statusChanges.length;
  h.node.reply('rejected', rejectionCopy);
  const failedExpected = copy(pendingExpected);
  failedExpected.intent.state = failedExpected.state = failedExpected.readback.state = 'unavailable';
  failedExpected.readback.appliedGain = null;
  failedExpected.ui = { state: 'unavailable', pressed: 'false', title: 'Enable compressor', label: 'Enable compressor' };
  failedExpected.features.audioProcessing = { state: 'limited', reason: 'audio-command-rejected' };
  failedExpected.features.compressor = { state: 'limited', reason: '' };
  failedExpected.graph = { rawConnected: true, processorConnected: false, sourceOutputs: 1, controlOutputs: 0 };
  fixed(h, 100);
  const failedImmediate = diagnose(t, h, 'actual F rejection immediately discards later dispatch at 100');
  state(failedImmediate, h, 'unavailable', .75, null);
  assert.deepEqual(failedImmediate, failedExpected);
  await flush();
  fixed(h, 100);
  const failed = diagnose(t, h, 'actual F rejection terminal state after flush at 100');
  state(failed, h, 'unavailable', .75, null);
  assert.deepEqual(failed, failedExpected);
  const failureRows = rows(h, failureCursor);
  assert.deepEqual(failureRows, [
    ['audioProcessing', 'limited', ''], ['compressor', 'limited', ''],
    ['equalizer', 'disabled', ''], ['normalizer', 'disabled', ''],
    ['audioProcessing', 'limited', 'audio-command-rejected'],
  ]);
  const terminal = { snapshot: failed, cursor: h.statusChanges.length };
  t.diagnostic(JSON.stringify({ sent, rejection, firstReturn, latestReturn,
    firstReadback: firstImmediate.readback, latestReadback: latestImmediate.readback,
    failedReadback: failed.readback, wireAdded: h.node.messages.length - h.before.snapshot.messages,
    sentAt: 0, newerPreviewAt: 0, rejectedAt: 100, originalDeadline: 1000, failureRows }));

  // shortcut: public preview/no wire bounds this prefix, not internal pending objects, Promise settlement or all queue faults.
  for (const [delta, clock] of [[900, 1000], [100, 1100]]) {
    await h.time.advance(delta);
    await flush();
    stable(t, h, terminal, 'fixed rejection reason and no extra wire through ' + clock, clock);
    assert.deepEqual(copy(h.node.packet), sent);
    assert.deepEqual(h.node.messages.slice(h.before.snapshot.messages).map(copy), [sent]);
  }
});
