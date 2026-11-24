const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./audio-fixture.cjs');
const { load, runtime, flush } = require('./helpers.cjs');

const features = ['audioProcessing', 'compressor', 'equalizer', 'normalizer'];
const copy = value => JSON.parse(JSON.stringify(value));
const rows = (h, cursor) => h.statusChanges.slice(cursor).filter(([feature]) => features.includes(feature))
  .map(([feature, state, reason]) => [feature, state, typeof reason === 'string' ? reason.slice(0, 80) : '']);

function snapshot(h) {
  const box = h.dom.window.document.querySelector('.knife-comp'), button = box.querySelector('button');
  return copy({
    intent: h.api.player.getAudioWanted({ ...h.api.media.context }),
    state: h.audio.getState(h.video), readback: h.audio.getReadback(h.video),
    ui: { state: box.dataset.state, pressed: button.getAttribute('aria-pressed'),
      title: button.title, label: button.getAttribute('aria-label') },
    features: Object.fromEntries(features.map(feature => [feature, h.api.statuses[feature]])),
    sources: h.sources(), sourceNodes: h.nodes.filter(part => part.type === 'source').length,
    transitionNodes: h.nodes.filter(part => part.type === 'transition').length, nodes: h.nodes.length,
    analysers: h.nodes.filter(part => part.type === 'analyser').length,
    meterSplitters: h.nodes.filter(part => part.type === 'splitter' && part.channels === 2).length,
    commands: h.node.commands.length, messages: h.node.messages.length,
    readErrors: h.node.messages.filter(packet => packet.kind === 'read-error').length,
    powers: h.node.messages.filter(packet => packet.kind === 'power').length,
    sourceEpoch: h.node.epoch, meterEpoch: h.node.meterEpoch, packet: h.node.packet,
    wire: h.node.messages, commandPackets: h.node.commands,
    fixtureControl: { vector: h.node.control, wanted: h.node.wanted, normalizer: h.node.normalizer }, ...h.counts(),
    manualAck: h.failures.manualWorkletAck, normalizerEnabled: h.api.config.normalizerEnabled, config: h.api.config,
    graph: { rawConnected: h.source.outputs.has(h.dryDelay), processorConnected: h.source.outputs.has(h.node),
      sourceOutputs: h.source.outputs.size, nodeOutputs: h.node.outputs.size,
      controlOutputs: h.controlSplitter.outputs.size, allocatedSplitterOutputs: h.meterSplitter.outputs.size },
    media: { src: h.video.currentSrc, muted: h.video.muted, volume: h.video.volume },
  });
}
function diagnose(t, h, phase) {
  const current = snapshot(h);
  t.diagnostic(JSON.stringify({ phase, clock: h.dom.window.performance.now(), contextState: h.context().state,
    currentTime: h.context().currentTime, current }));
  return current;
}
function identities(h, clock) {
  assert.equal(h.context(), h.savedContext);
  assert.equal(h.context().state, 'running');
  assert.equal(h.context().currentTime, 0);
  assert.equal(h.dom.window.performance.now(), clock);
  assert.equal(h.dom.window.Date.now, h.domDateNow);
  assert.equal(Date.now, h.nodeDateNow);
  assert.equal(h.Base.prototype.createAnalyser, h.baseAnalyser);
  assert.equal(h.node.port.onmessage, h.savedHandler);
  assert.equal(h.node.reply, h.savedReply);
  assert.equal(h.node.packet, h.savedPacket);
  assert.equal(h.nodes.find(part => part.type === 'source'), h.source);
  assert.equal(h.nodes.find(part => part.type === 'transition'), h.node);
  assert.equal(h.nodes.find(part => part.type === 'splitter' && part.channels === 5), h.controlSplitter);
  assert.equal(h.nodes.find(part => part.type === 'splitter' && part.channels === 2), h.meterSplitter);
  assert.equal([...h.source.outputs].find(part => part.type === 'delay'), h.dryDelay);
  assert.equal(h.failures.manualWorkletAck, true);
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
  assert.equal(current.ui.state, expected);
  assert.equal(current.ui.pressed, expected === 'on' ? 'true' : 'false');
  assert.equal(current.sources, 1);
  assert.equal(current.sourceNodes, 1);
  assert.equal(current.transitionNodes, 1);
  assert.equal(current.nodes, 18);
  assert.equal(current.contexts, 1);
  assert.equal(current.resumes, 0);
  assert.equal(current.analyserAttempts, 1);
  assert.equal(current.allocationAt, 0);
  assert.equal(current.analysers, 0);
  assert.equal(current.meterSplitters, 1);
  assert.equal(current.commands, 1);
  assert.equal(current.messages, 2);
  assert.equal(current.readErrors, 1);
  assert.equal(current.powers, 0);
  assert.equal(current.sourceEpoch, 1);
  assert.equal(current.meterEpoch, 1);
  assert.equal(current.manualAck, true);
  assert.equal(current.normalizerEnabled, true);
  assert.equal(current.features.audioProcessing.state, expected === 'on' ? 'ready' : 'limited');
  assert.deepEqual(current.features.compressor, { state: expected === 'on' ? 'ready' : 'limited', reason: '' });
  assert.deepEqual(current.features.equalizer, { state: 'disabled', reason: '' });
  assert.deepEqual(current.features.normalizer, { state: 'limited', reason: 'normalizer-unavailable' });
  assert.deepEqual(current.media, h.native);
}

function stable(t, h, baseline, cursor, phase, clock) {
  identities(h, clock);
  const current = diagnose(t, h, phase);
  state(current, h, 'on', 1);
  assert.deepEqual(current, baseline, 'receipt preserves the full baseline, including the fixture control vector');
  const added = rows(h, cursor);
  for (const [feature, status, reason] of added) assert.deepEqual({ state: status, reason }, baseline.features[feature],
    'transient feature state or reason changes cannot be hidden');
  t.diagnostic(JSON.stringify({ phase, added }));
}

test('allocation read-error receipt clears only its watchdog while normalizer stays limited', async t => {
  let firstError;
  try {
    const failures = { clock: true };
    const fixture = setup({ after: cleanup => t.after(async () => {
      try { await cleanup(); } catch (error) {
        if (firstError) { t.diagnostic('cleanup error after preserved first failure: ' + String(error)); return; }
        firstError = error; throw error;
      }
    }) }, false, true, { audioDefault: false, compressorEnabled: true, normalizerEnabled: true,
      compressorAttack: 0, audioGain: 1, gainInherited: false }, failures);
    let contexts = 0, resumes = 0, analyserAttempts = 0, allocationAt;
    const flagChanges = [], Base = fixture.dom.window.AudioContext, baseAnalyser = Base.prototype.createAnalyser;
    fixture.dom.window.AudioContext = class extends Base {
      constructor(...args) { super(...args); contexts++; }
      resume() { resumes++; return super.resume(); }
      createAnalyser() {
        analyserAttempts++;
        allocationAt = fixture.dom.window.performance.now();
        flagChanges.push({ attempt: analyserAttempts, at: allocationAt, before: failures.manualWorkletAck === true, after: true });
        failures.manualWorkletAck = true;
        throw new Error('injected analyser allocation unavailable');
      }
    };
    const domDateNow = fixture.dom.window.Date.now, nodeDateNow = Date.now;
    load(fixture.dom, 'web/player.js');
    const api = runtime(fixture.dom);
    api.reconcile();
    await flush();
    assert.ok(fixture.dom.window.document.querySelector('.knife-comp button'), 'actual player UI is mounted');
    assert.deepEqual({ sources: fixture.sources(), nodes: fixture.nodes.length, contexts, resumes, analyserAttempts },
      { sources: 0, nodes: 0, contexts: 0, resumes: 0, analyserAttempts: 0 });
    assert.notEqual(failures.manualWorkletAck, true);
    const native = { src: fixture.video.currentSrc, muted: fixture.video.muted, volume: fixture.video.volume };
    let outcome = { kind: 'pending' };
    const request = api.player.setAudioWanted(true, { ...api.media.context });
    void request.then(value => { outcome = { kind: 'fulfilled', value }; },
      error => { outcome = { kind: 'rejected', error }; });
    await flush();
    t.diagnostic(JSON.stringify({ phase: 'first ON settlement before premise assertions',
      outcome: outcome.kind === 'rejected' ? { kind: outcome.kind, error: String(outcome.error) } : outcome,
      contexts, resumes, analyserAttempts, allocationAt, flagChanges, nodes: fixture.nodes.length,
      wire: fixture.nodes.find(part => part.type === 'transition')?.messages }));
    if (outcome.kind === 'rejected') throw outcome.error;
    assert.equal(outcome.kind, 'fulfilled', 'first ON must settle without repair');
    assert.equal(outcome.value.ok, true);
    assert.equal(outcome.value.wanted, true);
    assert.equal(outcome.value.state, 'on');
    const node = fixture.nodes.find(part => part.type === 'transition');
    const source = fixture.nodes.find(part => part.type === 'source');
    const controlSplitter = fixture.nodes.find(part => part.type === 'splitter' && part.channels === 5);
    const meterSplitter = fixture.nodes.find(part => part.type === 'splitter' && part.channels === 2);
    assert.ok(node && source && controlSplitter && meterSplitter);
    const dryDelay = [...source.outputs].find(part => part.type === 'delay');
    assert.ok(dryDelay);
    const h = { ...fixture, api, node, source, controlSplitter, meterSplitter, dryDelay, native, failures,
      Base, baseAnalyser, domDateNow, nodeDateNow, savedContext: fixture.context(), savedHandler: node.port.onmessage,
      savedReply: node.reply, savedPacket: node.packet,
      counts: () => ({ contexts, resumes, analyserAttempts, allocationAt }) };
    identities(h, 0);
    assert.equal(typeof h.savedHandler, 'function');
    assert.equal(typeof h.savedReply, 'function');
    const initial = diagnose(t, h, 'first ON with original configure completion and no active meter graph');
    state(initial, h, 'on', 1);
    assert.equal(initial.features.audioProcessing.reason, '');
    assert.deepEqual(flagChanges, [{ attempt: 1, at: 0, before: false, after: true }]);
    assert.deepEqual(initial.graph, { rawConnected: true, processorConnected: true,
      sourceOutputs: 2, nodeOutputs: 3, controlOutputs: 5, allocatedSplitterOutputs: 0 });
    const configure = copy(node.commands[0]), readError = copy(node.messages[1]);
    assert.equal(configure.kind, 'configure');
    assert.equal(configure.sourceEpoch, 1);
    assert.equal(configure.seq, 1);
    assert.equal(configure.gain, 1);
    assert.equal(configure.wanted, true);
    assert.equal(configure.normalizer, true);
    assert.deepEqual(copy(node.packet), configure);
    assert.deepEqual(readError, { kind: 'read-error', sourceEpoch: 1, meterEpoch: 1, meterSeq: 1, observedTime: 0 });
    assert.deepEqual(Object.keys(readError).sort(), ['kind', 'meterEpoch', 'meterSeq', 'observedTime', 'sourceEpoch']);
    assert.deepEqual(copy(node.messages), [configure, readError], 'use the actual allocation-catch wire, not injected packets');
    for (const [feature, status, reason] of rows(h, 0)) {
      if (feature === 'audioProcessing' || feature === 'compressor') {
        assert.notEqual(status, 'limited', 'initial main failure cannot satisfy the selected meter oracle');
        assert.notEqual(status, 'failed');
      }
    }
    const initialCursor = h.statusChanges.length;
    t.diagnostic(JSON.stringify({ phase: 'actual allocation read-error flight', configure, readError, flagChanges,
      allocationAt, sentAt: 0, originalMeterDeadline: 1000, initialRows: rows(h, 0) }));

    // shortcut: one matching allocation-error receipt proves bounded consumer cancellation, not Native timing or full cleanup.
    await h.time.advance(900);
    await flush();
    stable(t, h, initial, initialCursor, 'allocation read-error before matching receipt at 900', 900);
    assert.equal(readError.sourceEpoch, h.node.epoch);
    assert.equal(readError.meterEpoch, h.node.meterEpoch);
    const receipt = { kind: 'meter-accepted', sourceEpoch: readError.sourceEpoch, seq: readError.meterSeq,
      frame: Math.round(h.context().currentTime * h.context().sampleRate), meterEpoch: readError.meterEpoch,
      gain: null, code: 'error' };
    const receiptCopy = copy(receipt);
    assert.deepEqual(Object.keys(receiptCopy).sort(), ['code', 'frame', 'gain', 'kind', 'meterEpoch', 'seq', 'sourceEpoch']);
    assert.deepEqual(receiptCopy, { kind: 'meter-accepted', sourceEpoch: 1, seq: 1, frame: 0,
      meterEpoch: 1, gain: null, code: 'error' });
    assert.deepEqual(receiptCopy, receipt);
    const receiptCursor = h.statusChanges.length;
    let receiptDeliveries = 0;
    assert.equal(receiptDeliveries, 0);
    receiptDeliveries++;
    h.savedReply('meter-accepted', receiptCopy);
    stable(t, h, initial, receiptCursor, 'matching error receipt immediate at 900', 900);
    await flush();
    stable(t, h, initial, receiptCursor, 'matching error receipt after flush at 900', 900);
    assert.equal(receiptDeliveries, 1);
    assert.deepEqual(receiptCopy, receipt);
    t.diagnostic(JSON.stringify({ phase: 'one matching allocation read-error receipt', receipt, receiptDeliveries,
      sentAt: 0, receiptAt: 900, originalMeterDeadline: 1000, wronglyRearmedDeadline: 1900,
      fixtureControl: initial.fixtureControl }));

    for (const [delta, clock] of [[100, 1000], [900, 1900]]) {
      await h.time.advance(delta);
      await flush();
      stable(t, h, initial, initialCursor, 'receipt retains main ON and normalizer unavailable through ' + clock, clock);
      assert.equal(receiptDeliveries, 1);
      assert.deepEqual(flagChanges, [{ attempt: 1, at: 0, before: false, after: true }]);
    }
    t.diagnostic(JSON.stringify({ phase: 'bounded cancellation complete at 1900', receipt, receiptDeliveries,
      originalMeterDeadline: 1000, wronglyRearmedDeadline: 1900, finalClock: h.dom.window.performance.now(),
      retainedNormalizer: snapshot(h).features.normalizer, actualWire: copy(h.node.messages) }));
  } catch (error) { firstError = error; throw error; }
});
