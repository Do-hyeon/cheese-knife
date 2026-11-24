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
    nodes: fixture.nodes.length, commands: fixture.node.commands.length,
    media: { src: fixture.video.currentSrc, muted: fixture.video.muted, volume: fixture.video.volume },
  });
}

function diagnose(t, fixture, phase) {
  const current = snapshot(fixture);
  t.diagnostic(JSON.stringify({ phase, clock: fixture.dom.window.performance.now(),
    elapsedDate: fixture.dom.window.Date.now() - fixture.base, outcome: fixture.outcome().kind, current }));
  return current;
}

function assertStable(t, fixture, before, phase) {
  const after = diagnose(t, fixture, phase);
  const added = fixture.statusChanges.slice(before.cursor)
    .filter(([feature]) => features.includes(feature))
    .map(([feature, state, reason]) => ({ feature, state,
      reason: typeof reason === 'string' ? reason.slice(0, 80) : '' }));
  t.diagnostic(JSON.stringify({ phase, added }));
  assert.deepEqual(after, before.snapshot, 'readiness must not alter the copied stable state');
  for (const row of added) assert.deepEqual({ state: row.state, reason: row.reason },
    before.snapshot.features[row.feature], 'a transient status must not be hidden by a later publication');
}

function settled(fixture) {
  const outcome = fixture.outcome();
  if (outcome.kind === 'rejected') throw outcome.error;
  assert.equal(outcome.kind, 'fulfilled', 'ON must settle before its stored result is inspected');
  return outcome.value;
}

function assertState(current, fixture, state, sources, appliedGain) {
  assert.equal(current.intent.ok, true);
  assert.equal(current.intent.wanted, true);
  assert.equal(current.intent.state, state);
  assert.equal(current.state, state);
  assert.equal(current.readback.wanted, true);
  assert.equal(current.readback.appliedGain, appliedGain);
  assert.equal(current.sources, sources);
  assert.equal(current.readback.sources, sources);
  assert.equal(current.sourceNodes, sources);
  assert.equal(current.transitionNodes, 1);
  assert.equal(current.ui.state, state);
  assert.equal(current.ui.pressed, state === 'on' ? 'true' : 'false');
  assert.equal(current.features.audioProcessing.state, state === 'on' ? 'ready' : state === 'pending' ? 'pending' : 'limited');
  assert.equal(current.features.compressor.state, current.features.audioProcessing.state);
  assert.equal(current.features.equalizer.state, 'disabled');
  assert.equal(current.features.normalizer.state, 'disabled');
  assert.deepEqual(current.media, fixture.native);
}

async function pendingPreparation(t) {
  const failures = { clock: true, manualWorkletAck: true };
  let restoreDate = () => {};
  const fixture = setup({ after: cleanup => t.after(async () => {
    try {
      try { await cleanup(); } finally { restoreDate(); }
    } catch (error) { stopped = true; throw error; }
  }) }, false, true, { audioDefault: false, compressorEnabled: true, normalizerEnabled: false,
    compressorAttack: 0, audioGain: 1, gainInherited: false }, failures);
  load(fixture.dom, 'web/player.js');
  const api = runtime(fixture.dom);
  api.reconcile();
  await flush();
  assert.ok(fixture.dom.window.document.querySelector('.knife-comp button'), 'real player UI is mounted');
  const DomDate = fixture.dom.window.Date;
  const originalNow = DomDate.now;
  const nodeNow = Date.now;
  assert.notEqual(DomDate, Date, 'clock alignment is confined to this DOM realm');
  const base = originalNow.call(DomDate);
  restoreDate = () => {
    DomDate.now = originalNow;
    assert.equal(DomDate.now, originalNow);
    assert.equal(Date.now, nodeNow, 'Node Date is unchanged');
    t.diagnostic('per-DOM Date.now restored after fixture cleanup');
  };
  DomDate.now = () => base + fixture.dom.window.performance.now();
  const native = { src: fixture.video.currentSrc, muted: fixture.video.muted, volume: fixture.video.volume };
  let outcome = { kind: 'pending' };
  const request = api.player.setAudioWanted(true, { ...api.media.context });
  void request.then(value => { outcome = { kind: 'fulfilled', value }; },
    error => { outcome = { kind: 'rejected', error }; });
  await flush();
  const node = fixture.nodes.find(part => part.type === 'transition');
  assert.ok(node, 'module load completed and the actual transition node was constructed');
  assert.equal(typeof node.port.onmessage, 'function');
  assert.ok(Number.isSafeInteger(node.epoch));
  const result = { ...fixture, api, node, native, failures, base, outcome: () => outcome };
  const initial = diagnose(t, result, 'prepared pending at 0');
  assert.equal(fixture.dom.window.performance.now(), 0);
  assert.equal(DomDate.now() - base, 0);
  assert.equal(outcome.kind, 'pending');
  assertState(initial, result, 'pending', 0, null);
  assert.equal(initial.commands, 0);
  result.before = { snapshot: initial, cursor: fixture.statusChanges.length };
  return result;
}

function prepared(fixture) {
  fixture.node.reply('prepared', { seq: 0, sourceEpoch: fixture.node.epoch,
    meterEpoch: 0, gain: null, code: null });
}

host('prepared timeout stays source0 and ignores late readiness', async t => {
  const fixture = await pendingPreparation(t);
  await fixture.time.advance(999);
  assert.equal(fixture.outcome().kind, 'pending');
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 999);
  assertStable(t, fixture, fixture.before, 'pending at 999');
  await fixture.time.advance(1);
  await flush();
  const failed = diagnose(t, fixture, 'timeout at 1000');
  const value = settled(fixture);
  assert.equal(value.ok, true);
  assert.equal(value.wanted, true);
  assert.equal(value.state, 'unavailable');
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 1000);
  assertState(failed, fixture, 'unavailable', 0, null);
  assert.equal(failed.features.audioProcessing.reason, 'audio-unavailable');
  assert.equal(failed.commands, 0);
  assert.equal(failed.nodes, fixture.before.snapshot.nodes);
  const before = { snapshot: failed, cursor: fixture.statusChanges.length };
  prepared(fixture);
  assertStable(t, fixture, before, 'late prepared immediately');
  await fixture.time.advance(1001);
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 2001);
  assertStable(t, fixture, before, 'late prepared through 2001');
});

host('prepared before deadline enables exactly one source', async t => {
  const fixture = await pendingPreparation(t);
  await fixture.time.advance(900);
  assert.equal(fixture.outcome().kind, 'pending');
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 900);
  assertStable(t, fixture, fixture.before, 'pending at 900');
  fixture.failures.manualWorkletAck = false;
  prepared(fixture);
  await flush();
  const current = diagnose(t, fixture, 'prepared at 900');
  const value = settled(fixture);
  assert.equal(value.ok, true);
  assert.equal(value.wanted, true);
  assert.equal(value.state, 'on');
  assertState(current, fixture, 'on', 1, 1);
  const before = { snapshot: current, cursor: fixture.statusChanges.length };
  await fixture.time.advance(101);
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 1001);
  assertStable(t, fixture, before, 'healthy through 1001');
});
