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
    sourceEpoch: h.node.epoch, meterEpoch: h.node.meterEpoch, packet: h.node.packet,
    wire: h.node.messages, commandPackets: h.node.commands,
    fixtureControl: { vector: h.node.control, wanted: h.node.wanted, normalizer: h.node.normalizer }, ...h.counts(),
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
  assert.equal(h.node.port.onmessage, h.savedHandler);
  assert.equal(h.node.reply, h.savedReply);
}
function rows(h, cursor) {
  return h.statusChanges.slice(cursor).filter(([feature]) => features.includes(feature))
    .map(([feature, status, reason]) => [feature, status, typeof reason === 'string' ? reason.slice(0, 80) : '']);
}
function stable(t, h, before, phase, clock) {
  fixed(h, clock, true);
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

host('exact old configure acceptance cannot clear or restart the actual latest dispatch watchdog', async t => {
  const h = await healthyOn(t);
  assert.equal(h.initialCommand.sourceEpoch, 1);
  assert.equal(h.initialCommand.seq, 1);
  assert.equal(h.node.meterEpoch, 1);
  assert.deepEqual(copy(h.node.packet), h.initialCommand);
  assert.deepEqual(copy(h.node.messages), [h.initialCommand]);
  assert.equal(typeof h.savedHandler, 'function');
  assert.equal(typeof h.savedReply, 'function');
  assert.deepEqual(h.before.snapshot.fixtureControl, { vector: [-1, 1, 1, 1, 0], wanted: true, normalizer: false });
  h.failures.manualWorkletAck = true;
  assert.equal(h.audio.setGain(h.video, .5), .5);
  const first = copy(h.node.commands.at(-1));
  assert.equal(first.kind, 'configure');
  assert.equal(first.sourceEpoch, 1);
  assert.equal(first.seq, 2);
  assert.equal(first.wanted, true);
  assert.equal(first.gain, .5);
  assert.equal(first.normalizer, false);
  assert.deepEqual(first.eq, h.initialCommand.eq);
  assert.equal(first.dynamics, h.initialCommand.dynamics);
  assert.equal(first.targetDbfs, h.initialCommand.targetDbfs);
  const firstExpected = copy(h.before.snapshot);
  firstExpected.readback.gain = .5;
  firstExpected.readback.appliedGain = null;
  firstExpected.commands++;
  firstExpected.messages++;
  firstExpected.packet = first;
  firstExpected.wire.push(first);
  firstExpected.commandPackets.push(first);
  const firstFlight = { snapshot: firstExpected, cursor: h.before.cursor };
  stable(t, h, firstFlight, 'actual F Gain.5 seq2 sent at 0', 0);
  state(snapshot(h), h, 'on', .5, null);
  await flush();
  stable(t, h, firstFlight, 'actual F remains unaccepted after flush at 0', 0);
  await h.time.advance(100);
  await flush();
  stable(t, h, firstFlight, 'F still owns the wire before latest preview at 100', 100);
  assert.equal(h.audio.setGain(h.video, .75), .75);
  const pendingExpected = copy(firstExpected);
  pendingExpected.readback.gain = .75;
  const pending = { snapshot: pendingExpected, cursor: h.before.cursor };
  stable(t, h, pending, 'latest Gain.75 at 100 is public but still has no new wire', 100);
  state(snapshot(h), h, 'on', .75, null);
  await flush();
  stable(t, h, pending, 'latest pending preview remains unsent after flush at 100', 100);
  await h.time.advance(800);
  await flush();
  stable(t, h, pending, 'F remains current before its matching acceptance at 900', 900);
  const accepted = { kind: 'accepted', sourceEpoch: first.sourceEpoch, seq: first.seq,
    frame: 0, meterEpoch: h.node.meterEpoch, gain: null, code: null };
  const acceptedCopy = copy(accepted);
  assert.deepEqual(Object.keys(acceptedCopy).sort(), ['code', 'frame', 'gain', 'kind', 'meterEpoch', 'seq', 'sourceEpoch']);
  assert.deepEqual(acceptedCopy, accepted);
  assert.equal(accepted.meterEpoch, 1);
  assert.deepEqual(copy(h.node.packet), first);
  assert.equal(h.node.port.onmessage, h.savedHandler);
  assert.equal(h.node.reply, h.savedReply);
  const deliveries = [copy(acceptedCopy)];
  h.node.reply('accepted', acceptedCopy);
  const latest = copy(h.node.commands.at(-1));
  assert.equal(latest.kind, 'configure');
  assert.equal(latest.sourceEpoch, first.sourceEpoch);
  assert.equal(latest.seq, 3);
  assert.notEqual(latest.seq, first.seq);
  assert.equal(latest.wanted, true);
  assert.equal(latest.gain, .75);
  assert.equal(latest.normalizer, false);
  assert.deepEqual(latest.eq, h.initialCommand.eq);
  assert.equal(latest.dynamics, h.initialCommand.dynamics);
  assert.equal(latest.targetDbfs, h.initialCommand.targetDbfs);
  const latestExpected = copy(pendingExpected);
  latestExpected.commands++;
  latestExpected.messages++;
  latestExpected.packet = latest;
  latestExpected.wire.push(latest);
  latestExpected.commandPackets.push(latest);
  latestExpected.fixtureControl = { vector: [-1, 1, .5, 1, 0], wanted: true, normalizer: false };
  const latestFlight = { snapshot: latestExpected, cursor: h.before.cursor };
  stable(t, h, latestFlight, 'matching F accepted dispatches actual G seq3 immediately at 900', 900);
  state(snapshot(h), h, 'on', .75, null);
  await flush();
  stable(t, h, latestFlight, 'actual G retains its send900 deadline after flush at 900', 900);
  assert.deepEqual(copy(h.node.commands), [h.initialCommand, first, latest]);
  assert.deepEqual(copy(h.node.messages), [h.initialCommand, first, latest]);
  const afterDispatch = { snapshot: snapshot(h), cursor: h.statusChanges.length };
  t.diagnostic(JSON.stringify({ first, latest, accepted, firstSend: 0, pendingCreated: 100,
    firstAcceptedAndLatestSend: 900, firstOldDeadline: 1000, expectedLatestDeadline: 1900,
    appliedGain: afterDispatch.snapshot.readback.appliedGain, fixtureControl: afterDispatch.snapshot.fixtureControl }));
  for (const [delta, clock] of [[99, 999], [1, 1000]]) {
    await h.time.advance(delta);
    await flush();
    stable(t, h, afterDispatch, 'G remains healthy through accepted F old deadline at ' + clock, clock);
  }
  assert.equal(h.node.port.onmessage, h.savedHandler);
  assert.equal(h.node.reply, h.savedReply);
  assert.deepEqual(copy(h.node.packet), latest);
  assert.equal(h.node.epoch, accepted.sourceEpoch);
  assert.equal(h.node.meterEpoch, accepted.meterEpoch);
  assert.notEqual(accepted.seq, latest.seq);
  const duplicate = copy(accepted);
  assert.deepEqual(Object.keys(duplicate).sort(), ['code', 'frame', 'gain', 'kind', 'meterEpoch', 'seq', 'sourceEpoch']);
  assert.deepEqual(duplicate, acceptedCopy);
  deliveries.push(copy(duplicate));
  // shortcut: direct old-ACK replay avoids fixture.reply accepting current G; this proves no Native gain or timer identity.
  h.savedHandler({ data: duplicate });
  stable(t, h, afterDispatch, 'exact old F accepted cannot affect G immediately at 1000', 1000);
  await flush();
  stable(t, h, afterDispatch, 'exact old F accepted leaves G and fixture controls unchanged after flush at 1000', 1000);
  assert.deepEqual(deliveries, [accepted, accepted]);
  t.diagnostic(JSON.stringify({ deliveries, replayAt: 1000, actualLatestPacket: copy(h.node.packet),
    fixtureControl: snapshot(h).fixtureControl, appliedGain: h.audio.getReadback(h.video).appliedGain }));
  await h.time.advance(899);
  await flush();
  stable(t, h, afterDispatch, 'latest dispatch watchdog has not failed early at 1899', 1899);
  const failureCursor = h.statusChanges.length;
  await h.time.advance(1);
  await flush();
  fixed(h, 1900, true);
  const failed = diagnose(t, h, 'original latest configure deadline fails at send900 plus1000');
  state(failed, h, 'unavailable', .75, null);
  const expectedFailure = copy(latestExpected);
  expectedFailure.intent.state = expectedFailure.state = expectedFailure.readback.state = 'unavailable';
  expectedFailure.ui = { state: 'unavailable', pressed: 'false', title: 'Enable compressor', label: 'Enable compressor' };
  expectedFailure.features.audioProcessing = { state: 'limited', reason: 'audio-command-timeout' };
  expectedFailure.features.compressor = { state: 'limited', reason: '' };
  expectedFailure.graph = { rawConnected: true, processorConnected: false, sourceOutputs: 1, nodeOutputs: 0, controlOutputs: 0 };
  assert.deepEqual(failed, expectedFailure);
  const failureRows = rows(h, failureCursor);
  assert.deepEqual(failureRows, [
    ['audioProcessing', 'limited', ''], ['compressor', 'limited', ''],
    ['equalizer', 'disabled', ''], ['normalizer', 'disabled', ''],
    ['audioProcessing', 'limited', 'audio-command-timeout'],
  ]);
  t.diagnostic(JSON.stringify({ phase: 'expected latest configure timeout at 1900', first, latest, deliveries,
    firstSend: 0, pendingCreated: 100, firstAcceptedAndLatestSend: 900, exactOldReplay: 1000,
    expectedLatestDeadline: 1900, failureRows, fixtureControl: failed.fixtureControl, stopped }));
});
