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
function rows(fixture, cursor) {
  return fixture.statusChanges.slice(cursor).filter(([feature]) => features.includes(feature))
    .map(([feature, state, reason]) => ({ feature, state,
      reason: typeof reason === 'string' ? reason.slice(0, 80) : '' }));
}
function diagnose(t, fixture, phase, packet) {
  const current = snapshot(fixture);
  t.diagnostic(JSON.stringify({ phase, packet, clock: fixture.dom.window.performance.now(),
    elapsedDate: fixture.dom.window.Date.now() - fixture.base, outcome: fixture.outcome().kind,
    current, rows: rows(fixture, fixture.cursor) }));
  return current;
}
function settled(fixture) {
  const outcome = fixture.outcome();
  if (outcome.kind === 'rejected') throw outcome.error;
  assert.equal(outcome.kind, 'fulfilled', 'ON must settle before its stored result is inspected');
  return outcome.value;
}
function assertState(current, fixture, state, sources, gain) {
  assert.equal(current.intent.ok, true);
  assert.equal(current.intent.wanted, true);
  assert.equal(current.intent.state, state);
  assert.equal(current.state, state);
  assert.equal(current.readback.wanted, true);
  assert.equal(current.readback.appliedGain, gain);
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
  const DomDate = fixture.dom.window.Date, originalNow = DomDate.now, nodeNow = Date.now;
  assert.notEqual(DomDate, Date, 'only the fixture DOM clock is aligned');
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
  assert.ok(node, 'module load completed before the first prepared packet');
  assert.equal(typeof node.port.onmessage, 'function');
  assert.ok(Number.isSafeInteger(node.epoch));
  const result = { ...fixture, api, node, native, failures, base, outcome: () => outcome,
    cursor: fixture.statusChanges.length };
  const initial = diagnose(t, result, 'prepared pending at 0');
  assert.equal(fixture.dom.window.performance.now(), 0);
  assert.equal(DomDate.now() - base, 0);
  assert.equal(fixture.context().currentTime, 0);
  assert.equal(outcome.kind, 'pending');
  assertState(initial, result, 'pending', 0, null);
  assert.equal(initial.commands, 0);
  result.initial = initial;
  return result;
}
function prepared(fixture, seq) {
  fixture.failures.manualWorkletAck = false;
  const extra = { seq, sourceEpoch: fixture.node.epoch, meterEpoch: 0, gain: null, code: null };
  fixture.node.reply('prepared', extra);
  return { kind: 'prepared', frame: 0, ...extra };
}

host('nonzero prepared sequence cannot open source capture', async t => {
  const fixture = await pendingPreparation(t);
  const packet = prepared(fixture, 1);
  await flush();
  const invalid = diagnose(t, fixture, 'first prepared seq1', packet);
  assert.equal(fixture.sources(), 0, 'prepared seq1 must not capture media');
  assertState(invalid, fixture, 'unavailable', 0, null);
  assert.equal(invalid.features.audioProcessing.reason, 'audio-reply-invalid');
  assert.equal(invalid.commands, 0);
  assert.equal(invalid.nodes, fixture.initial.nodes);
  assert.equal(fixture.outcome().kind, 'pending', 'existing fail does not reject the prepared Promise');
  await fixture.time.advance(1000);
  await flush();
  const terminal = diagnose(t, fixture, 'original preparation budget settled', packet);
  const value = settled(fixture);
  assert.equal(value.ok, true);
  assert.equal(value.wanted, true);
  assert.equal(value.state, 'unavailable');
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 1000);
  assertState(terminal, fixture, 'unavailable', 0, null);
  assert.equal(terminal.features.audioProcessing.reason, 'audio-unavailable');
  assert.equal(terminal.commands, 0);
  assert.equal(terminal.nodes, fixture.initial.nodes);
  const published = rows(fixture, fixture.cursor);
  assert.ok(published.every(row => row.state !== 'ready'), 'invalid first packet must never transiently publish ready');
  const firstInvalid = published.findIndex(row => row.feature === 'audioProcessing' && row.reason === 'audio-reply-invalid');
  const generic = published.findLastIndex(row => row.feature === 'audioProcessing' && row.reason === 'audio-unavailable');
  assert.ok(firstInvalid >= 0 && generic > firstInvalid, 'existing invalid then generic reason sequence is preserved');
});

host('valid prepared sequence zero preserves normal ON', async t => {
  const fixture = await pendingPreparation(t);
  const packet = prepared(fixture, 0);
  await flush();
  const current = diagnose(t, fixture, 'first prepared seq0', packet);
  const value = settled(fixture);
  assert.equal(value.ok, true);
  assert.equal(value.wanted, true);
  assert.equal(value.state, 'on');
  assertState(current, fixture, 'on', 1, 1);
  assert.equal(current.commands, 1);
  assert.equal(current.nodes, fixture.initial.nodes + 1);
});
