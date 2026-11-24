const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./audio-fixture.cjs');
const { load, runtime, flush } = require('./helpers.cjs');

const features = ['audioProcessing', 'compressor', 'equalizer', 'normalizer'];
const copy = value => JSON.parse(JSON.stringify(value));
const meterPackets = node => node.messages.filter(packet => packet.kind === 'power' || packet.kind === 'read-error');
let stopped = false, firstError;
function host(name, body) {
  test(name, async t => {
    if (stopped) return t.skip('stopped after the first actual failure');
    try { await body(t); } catch (error) { firstError = error; stopped = true; throw error; }
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
    sourceEpoch: h.node.epoch, meterEpoch: h.node.meterEpoch, packet: h.node.packet,
    wire: h.node.messages, commandPackets: h.node.commands,
    fixtureControl: { vector: h.node.control, wanted: h.node.wanted, normalizer: h.node.normalizer }, ...h.counts(),
    normalizerEnabled: h.api.config.normalizerEnabled, config: h.api.config,
    storage: { knifeGain: h.dom.window.localStorage.getItem('knifeGain') },
    latch: { value: h.latch.offset.value, outputs: h.latch.outputs.size },
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
function fixed(h, clock, manualAck = false, contextState = 'running') {
  assert.equal(h.context(), h.savedContext);
  assert.equal(h.context().state, contextState);
  assert.equal(h.context().currentTime, 0);
  assert.equal(h.nodes.find(part => part.type === 'source'), h.source);
  assert.equal(h.nodes.find(part => part.type === 'transition'), h.node);
  assert.equal(h.nodes.find(part => part.type === 'splitter' && part.channels === 5), h.controlSplitter);
  assert.equal([...h.source.outputs].find(part => part.type === 'delay'), h.dryDelay);
  assert.equal(h.dom.window.Date.now, h.domDateNow);
  assert.equal(Date.now, h.nodeDateNow);
  assert.equal(h.dom.window.performance.now(), clock);
  assert.equal(h.failures.manualWorkletAck === true, manualAck);
  assert.equal(h.node.port.onmessage, h.savedHandler);
  assert.equal(h.node.reply, h.savedReply);
  assert.equal(h.nodes.find(part => part.type === 'constant'), h.latch);
}
function rows(h, cursor) {
  return h.statusChanges.slice(cursor).filter(([feature]) => features.includes(feature))
    .map(([feature, status, reason]) => [feature, status, typeof reason === 'string' ? reason.slice(0, 80) : '']);
}
function stable(t, h, before, phase, clock, contextState = 'running') {
  fixed(h, clock, true, contextState);
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
  assert.deepEqual(current.storage, { knifeGain: null });
  assert.equal(current.latch.value, 0);
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
    try { await cleanup(); } catch (error) {
      if (firstError) { t.diagnostic('secondary cleanup error after preserved first failure: ' + String(error)); return; }
      firstError = error; stopped = true; throw error;
    }
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
  const latch = fixture.nodes.find(part => part.type === 'constant');
  assert.ok(node && source && controlSplitter && latch);
  const dryDelay = [...source.outputs].find(part => part.type === 'delay');
  assert.ok(dryDelay);
  const h = { ...fixture, api, node, source, controlSplitter, dryDelay, latch, native, failures,
    savedContext: fixture.context(), savedHandler: node.port.onmessage, savedReply: node.reply,
    domDateNow, nodeDateNow, counts: () => ({ contexts, resumes }) };
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

host('matching configure acceptance while suspended defers latest until running and its own deadline', async t => {
  const h = await healthyOn(t), initial = copy(h.initialCommand);
  assert.equal(initial.sourceEpoch, 1);
  assert.equal(initial.seq, 1);
  assert.equal(h.node.meterEpoch, 1);
  assert.deepEqual(copy(h.node.messages), [initial]);
  assert.deepEqual(h.before.snapshot.fixtureControl, { vector: [-1, 1, 1, 1, 0], wanted: true, normalizer: false });
  h.failures.manualWorkletAck = true;
  assert.equal(h.audio.setGain(h.video, .5), .5);
  const first = copy(h.node.commands.at(-1));
  assert.deepEqual(first, { ...initial, seq: 2, gain: .5 });
  const firstExpected = copy(h.before.snapshot);
  firstExpected.readback.gain = .5;
  firstExpected.readback.appliedGain = null;
  firstExpected.commands++;
  firstExpected.messages++;
  firstExpected.packet = first;
  firstExpected.wire.push(first);
  firstExpected.commandPackets.push(first);
  const firstFlight = { snapshot: firstExpected, cursor: h.before.cursor };
  stable(t, h, firstFlight, 'actual F seq2 sent at 0', 0);
  state(snapshot(h), h, 'on', .5, null);
  await flush();
  stable(t, h, firstFlight, 'F remains unaccepted after flush0', 0);
  await h.time.advance(100);
  await flush();
  stable(t, h, firstFlight, 'before latest Gain at100', 100);
  assert.equal(h.audio.setGain(h.video, .75), .75);
  const pendingExpected = copy(firstExpected);
  pendingExpected.readback.gain = .75;
  const pending = { snapshot: pendingExpected, cursor: h.before.cursor };
  stable(t, h, pending, 'latest Gain.75 pending at100', 100);
  state(snapshot(h), h, 'on', .75, null);
  await flush();
  stable(t, h, pending, 'latest remains pending after flush100', 100);
  await h.time.advance(100);
  await flush();
  stable(t, h, pending, 'before suspended event200', 200);
  const statechanges = [];
  h.savedContext.state = 'suspended';
  h.savedContext.dispatchEvent(new h.dom.window.Event('statechange'));
  statechanges.push({ at: h.dom.window.performance.now(), state: h.savedContext.state });
  stable(t, h, pending, 'suspended event200 keeps F wire', 200, 'suspended');
  await flush();
  stable(t, h, pending, 'suspended pending after flush200', 200, 'suspended');
  await h.time.advance(700);
  await flush();
  stable(t, h, pending, 'suspended before matching F receipt900', 900, 'suspended');
  const accepted = { kind: 'accepted', sourceEpoch: first.sourceEpoch, seq: first.seq,
    frame: 0, meterEpoch: 1, gain: null, code: null };
  assert.deepEqual(Object.keys(accepted).sort(), ['code', 'frame', 'gain', 'kind', 'meterEpoch', 'seq', 'sourceEpoch']);
  assert.deepEqual(copy(h.node.packet), first);
  const deliveries = [copy(accepted)];
  h.node.reply('accepted', copy(accepted));
  const acceptedExpected = copy(pendingExpected);
  acceptedExpected.fixtureControl = { vector: [-1, 1, .5, 1, 0], wanted: true, normalizer: false };
  const waiting = { snapshot: acceptedExpected, cursor: h.before.cursor };
  stable(t, h, waiting, 'matching F accepted900 does not dispatch G while suspended', 900, 'suspended');
  state(snapshot(h), h, 'on', .75, null);
  await flush();
  stable(t, h, waiting, 'accepted F and unsent G after flush900', 900, 'suspended');
  t.diagnostic(JSON.stringify({ phase: 'matching acceptance while suspended', initial, first, accepted, deliveries,
    firstSend: 0, latestCreated: 100, suspendedAt: 200, acceptedAt: 900,
    actualWire: copy(h.node.messages), fixtureControl: snapshot(h).fixtureControl }));
  // shortcut: public state/history prove no timeout fault, not callback nonexecution or Native suspended rendering.
  for (const [delta, clock] of [[99, 999], [1, 1000], [100, 1100], [399, 1499], [1, 1500]]) {
    await h.time.advance(delta);
    await flush();
    stable(t, h, waiting, 'no observable timeout fault or G wire while suspended at' + clock, clock, 'suspended');
  }
  h.savedContext.state = 'running';
  h.savedContext.dispatchEvent(new h.dom.window.Event('statechange'));
  statechanges.push({ at: h.dom.window.performance.now(), state: h.savedContext.state });
  const latest = copy(h.node.commands.at(-1));
  assert.deepEqual(latest, { ...initial, seq: 3, gain: .75 });
  assert.deepEqual(copy(h.node.messages), [initial, first, latest]);
  assert.deepEqual(copy(h.node.commands), [initial, first, latest]);
  assert.deepEqual(copy(h.node.packet), latest);
  const sentExpected = copy(acceptedExpected);
  sentExpected.commands++;
  sentExpected.messages++;
  sentExpected.packet = latest;
  sentExpected.wire.push(latest);
  sentExpected.commandPackets.push(latest);
  const sent = { snapshot: sentExpected, cursor: h.before.cursor };
  stable(t, h, sent, 'original runningevent1500 dispatches only actual G seq3', 1500);
  state(snapshot(h), h, 'on', .75, null);
  await flush();
  stable(t, h, sent, 'latest G awaits acceptance after flush1500', 1500);
  assert.deepEqual(statechanges, [{ at: 200, state: 'suspended' }, { at: 1500, state: 'running' }]);
  assert.deepEqual(deliveries, [accepted]);
  t.diagnostic(JSON.stringify({ phase: 'actual latest dispatch after suspended acceptance', first, accepted, latest,
    deliveries, statechanges, actualSendAt: 1500, originalDeadline: 2500, fixtureControl: snapshot(h).fixtureControl }));
  await h.time.advance(999);
  await flush();
  stable(t, h, sent, 'sent G healthy2499', 2499);
  const faultCursor = h.statusChanges.length;
  await h.time.advance(1);
  await flush();
  fixed(h, 2500, true);
  const failed = diagnose(t, h, 'original G command deadline at send1500 plus1000');
  state(failed, h, 'unavailable', .75, null);
  const expectedFailure = copy(sentExpected);
  expectedFailure.intent.state = expectedFailure.state = expectedFailure.readback.state = 'unavailable';
  expectedFailure.ui = { state: 'unavailable', pressed: 'false', title: 'Enable compressor', label: 'Enable compressor' };
  expectedFailure.features.audioProcessing = { state: 'limited', reason: 'audio-command-timeout' };
  expectedFailure.features.compressor = { state: 'limited', reason: '' };
  expectedFailure.graph = { rawConnected: true, processorConnected: false, sourceOutputs: 1, nodeOutputs: 0, controlOutputs: 0 };
  assert.deepEqual(failed, expectedFailure);
  const faultRows = rows(h, faultCursor);
  assert.deepEqual(faultRows, [
    ['audioProcessing', 'limited', ''], ['compressor', 'limited', ''],
    ['equalizer', 'disabled', ''], ['normalizer', 'disabled', ''],
    ['audioProcessing', 'limited', 'audio-command-timeout'],
  ]);
  assert.deepEqual(statechanges, [{ at: 200, state: 'suspended' }, { at: 1500, state: 'running' }]);
  assert.deepEqual(deliveries, [accepted]);
  t.diagnostic(JSON.stringify({ phase: 'expected original G timeout2500', first, accepted, latest, deliveries, statechanges,
    firstSend: 0, latestCreated: 100, acceptedWhileSuspended: 900, actualSendAt: 1500, originalDeadline: 2500,
    faultRows, publicGain: failed.readback.gain, appliedGain: failed.readback.appliedGain, fixtureControl: failed.fixtureControl }));
});
