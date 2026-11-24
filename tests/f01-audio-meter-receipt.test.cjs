const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./audio-fixture.cjs');
const { load, runtime, flush } = require('./helpers.cjs');

const features = ['audioProcessing', 'compressor', 'equalizer', 'normalizer'];
const copy = value => JSON.parse(JSON.stringify(value));
let stopped = false;

function host(name, body) {
  test(name, async t => {
    if (stopped) return t.skip('stopped after the first actual failure');
    try { await body(t); } catch (error) { stopped = true; throw error; }
  });
}

const meterPackets = node => node.messages.filter(packet => packet.kind === 'power' || packet.kind === 'read-error');

function snapshot(fixture) {
  const box = fixture.dom.window.document.querySelector('.knife-comp');
  const button = box.querySelector('button');
  return copy({
    intent: fixture.api.player.getAudioWanted({ ...fixture.api.media.context }),
    state: fixture.audio.getState(fixture.video), readback: fixture.audio.getReadback(fixture.video),
    ui: { state: box.dataset.state, pressed: button.getAttribute('aria-pressed'),
      title: button.title, label: button.getAttribute('aria-label') },
    features: Object.fromEntries(features.map(feature => [feature, fixture.api.statuses[feature]])),
    sources: fixture.sources(), sourceNodes: fixture.nodes.filter(node => node.type === 'source').length,
    transitionNodes: fixture.nodes.filter(node => node.type === 'transition').length,
    nodes: fixture.nodes.length, commands: fixture.node.commands.length, meters: meterPackets(fixture.node).length,
    media: { src: fixture.video.currentSrc, muted: fixture.video.muted, volume: fixture.video.volume },
  });
}

function assertStable(t, fixture, before, phase) {
  const after = snapshot(fixture);
  const added = fixture.statusChanges.slice(before.cursor)
    .filter(([feature]) => features.includes(feature))
    .map(([feature, state, reason]) => ({ feature, state,
      reason: typeof reason === 'string' ? reason.slice(0, 80) : '' }));
  t.diagnostic(JSON.stringify({ phase, clock: fixture.dom.window.performance.now(), before: before.snapshot, after, added }));
  assert.deepEqual(after, before.snapshot, 'receipt must not revive normalizer or confirm configure Gain');
  for (const row of added) assert.deepEqual({ state: row.state, reason: row.reason },
    before.snapshot.features[row.feature], 'transient stale status must not be hidden by a later publication');
}

async function sentMeterAfterNormalizerOff(t) {
  const failures = { clock: true };
  const fixture = setup({ after: cleanup => t.after(async () => {
    try { await cleanup(); } catch (error) { stopped = true; throw error; }
  }) }, false, true, { audioDefault: false, compressorEnabled: true, normalizerEnabled: true,
    compressorAttack: 0, audioGain: 1, gainInherited: false }, failures);
  load(fixture.dom, 'web/player.js');
  const api = runtime(fixture.dom);
  api.reconcile();
  await flush();
  assert.ok(fixture.dom.window.document.querySelector('.knife-comp button'), 'real player UI is mounted');
  const native = { src: fixture.video.currentSrc, muted: fixture.video.muted, volume: fixture.video.volume };
  const enabled = await api.player.setAudioWanted(true, { ...api.media.context });
  await flush();
  assert.equal(enabled.ok, true);
  assert.equal(enabled.wanted, true);
  assert.equal(enabled.state, 'on');
  const node = fixture.nodes.find(node => node.type === 'transition');
  assert.ok(node);
  const result = { ...fixture, api, node, native };
  const initial = snapshot(result);
  assert.equal(initial.state, 'on');
  assert.equal(initial.sources, 1);
  assert.equal(initial.readback.sources, 1);
  assert.equal(initial.readback.appliedGain, 1, 'initial completed ACK has drained');
  assert.equal(initial.ui.state, 'on');
  assert.equal(initial.ui.pressed, 'true');
  assert.equal(initial.features.audioProcessing.state, 'ready');
  assert.equal(initial.features.compressor.state, 'ready');
  const meterSplitter = fixture.nodes.find(part => part.type === 'splitter' && part.channels === 2);
  assert.ok(meterSplitter);
  assert.equal(meterSplitter.outputs.size, 2);
  const count = meterPackets(node).length;
  assert.ok(count >= 1, 'initial automatic meter receipt must precede the selected ticket');
  failures.manualWorkletAck = true;
  fixture.tick();
  assert.equal(meterPackets(node).length, count + 1, 'one tick must transmit one new meter, not queue behind an old flight');
  const savedMeter = copy(meterPackets(node).at(-1));
  assert.equal(savedMeter.kind, 'power');
  assert.equal(savedMeter.sourceEpoch, node.epoch);
  assert.equal(savedMeter.meterEpoch, node.meterEpoch);
  assert.ok(Number.isSafeInteger(savedMeter.meterSeq));
  const commands = node.commands.length;
  api.config.normalizerEnabled = false;
  fixture.audio.configure();
  assert.equal(node.commands.length, commands + 1);
  const configure = copy(node.commands.at(-1));
  assert.equal(configure.wanted, true, 'this is normalizer-only OFF, not master OFF');
  assert.equal(configure.normalizer, false);
  assert.equal(configure.gain, 1);
  node.reply('accepted', { seq: configure.seq, sourceEpoch: configure.sourceEpoch });
  assert.notEqual(node.meterEpoch, savedMeter.meterEpoch);
  assert.equal(meterSplitter.outputs.size, 0, 'normalizer observation scope has retired');
  assert.equal(meterPackets(node).length, count + 1, 'no extra pending meter is introduced');
  const current = snapshot(result);
  assert.equal(current.state, 'on');
  assert.equal(current.intent.ok, true);
  assert.equal(current.intent.wanted, true);
  assert.equal(current.readback.wanted, true);
  assert.equal(current.readback.appliedGain, null, 'accepted must not substitute for completed');
  assert.equal(current.sources, 1);
  assert.equal(current.readback.sources, 1);
  assert.equal(current.sourceNodes, 1);
  assert.equal(current.transitionNodes, 1);
  assert.equal(current.ui.state, 'on');
  assert.equal(current.ui.pressed, 'true');
  assert.equal(current.features.audioProcessing.state, 'ready');
  assert.equal(current.features.compressor.state, 'ready');
  assert.equal(current.features.equalizer.state, 'disabled');
  assert.equal(current.features.normalizer.state, 'disabled');
  assert.deepEqual(current.media, native);
  result.savedMeter = savedMeter;
  result.configure = configure;
  result.before = { snapshot: current, cursor: fixture.statusChanges.length };
  t.diagnostic(JSON.stringify({ sentMeter: savedMeter, acceptedConfigure: configure,
    currentFixtureMeterEpoch: node.meterEpoch, current }));
  return result;
}

host('matching retired-meter receipt clears only its watchdog', async t => {
  const fixture = await sentMeterAfterNormalizerOff(t);
  const reply = { seq: fixture.savedMeter.meterSeq, sourceEpoch: fixture.savedMeter.sourceEpoch,
    meterEpoch: fixture.savedMeter.meterEpoch, code: 'ramp', gain: null };
  // The request uses meterSeq; the reply must put that number in seq.
  fixture.node.reply('meter-accepted', reply);
  t.diagnostic(JSON.stringify({ injectedReceipt: reply, syntheticOldEpoch: true }));
  assertStable(t, fixture, fixture.before, 'matching receipt');
  await fixture.time.advance(1001);
  assertStable(t, fixture, fixture.before, 'after 1001ms');
  fixture.node.reply('completed', { seq: fixture.configure.seq, sourceEpoch: fixture.configure.sourceEpoch });
  const completed = snapshot(fixture);
  const expected = copy(fixture.before.snapshot);
  expected.readback.appliedGain = 1;
  assert.deepEqual(completed, expected, 'only the matching current configure completed confirms Gain1');
  t.diagnostic(JSON.stringify({ currentCompleted: completed }));
});

host('wrong meter sequence cannot cancel the sent watchdog', async t => {
  const fixture = await sentMeterAfterNormalizerOff(t);
  const reply = { seq: fixture.savedMeter.meterSeq + 1, sourceEpoch: fixture.savedMeter.sourceEpoch,
    meterEpoch: fixture.savedMeter.meterEpoch, code: 'ramp', gain: null };
  fixture.node.reply('meter-accepted', reply);
  t.diagnostic(JSON.stringify({ injectedReceipt: reply, syntheticOldEpoch: true }));
  assertStable(t, fixture, fixture.before, 'wrong receipt');
  await fixture.time.advance(999);
  assertStable(t, fixture, fixture.before, 'before 1000ms');
  await fixture.time.advance(1);
  const failed = snapshot(fixture);
  assert.equal(failed.state, 'unavailable');
  assert.equal(failed.intent.wanted, true);
  assert.equal(failed.readback.appliedGain, null);
  assert.equal(failed.readback.sources, 1);
  assert.equal(failed.sources, 1);
  assert.equal(failed.sourceNodes, 1);
  assert.equal(failed.transitionNodes, 1);
  assert.equal(failed.nodes, fixture.before.snapshot.nodes);
  assert.equal(failed.commands, fixture.before.snapshot.commands);
  assert.equal(failed.meters, fixture.before.snapshot.meters);
  assert.equal(failed.ui.state, 'unavailable');
  assert.equal(failed.ui.pressed, 'false');
  assert.equal(failed.features.audioProcessing.state, 'limited');
  assert.equal(failed.features.audioProcessing.reason, 'audio-meter-timeout');
  assert.equal(failed.features.compressor.state, 'limited');
  assert.equal(failed.features.equalizer.state, 'disabled');
  assert.equal(failed.features.normalizer.state, 'disabled');
  const source = fixture.nodes.find(part => part.type === 'source');
  assert.ok([...source.outputs].some(part => part.type === 'delay'), 'independent raw path remains connected');
  assert.equal(source.outputs.has(fixture.node), false, 'failed processor is disconnected from source');
  assert.deepEqual(failed.media, fixture.native);
  assert.ok(fixture.statusChanges.slice(fixture.before.cursor).some(([feature, state, reason]) =>
    feature === 'audioProcessing' && state === 'limited' && reason === 'audio-meter-timeout'));
  t.diagnostic(JSON.stringify({ clock: fixture.dom.window.performance.now(), expectedMeterTimeout: failed }));
});
