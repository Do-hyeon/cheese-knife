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
  const processors = fixture.nodes.filter(node => node.type === 'transition');
  return copy({
    intent: fixture.api.player.getAudioWanted({ ...fixture.api.media.context }),
    state: fixture.audio.getState(fixture.video), readback: fixture.audio.getReadback(fixture.video),
    ui: { state: box.dataset.state, pressed: button.getAttribute('aria-pressed'),
      title: button.title, label: button.getAttribute('aria-label') },
    features: Object.fromEntries(features.map(feature => [feature, fixture.api.statuses[feature]])),
    sources: fixture.sources(), sourceNodes: fixture.nodes.filter(node => node.type === 'source').length,
    transitionNodes: processors.length, nodes: fixture.nodes.length,
    commands: processors.reduce((sum, node) => sum + node.commands.length, 0), ...fixture.counts(),
    media: { src: fixture.video.currentSrc, muted: fixture.video.muted, volume: fixture.video.volume },
  });
}
function rows(fixture, cursor) {
  return fixture.statusChanges.slice(cursor).filter(([feature]) => features.includes(feature))
    .map(([feature, state, reason]) => ({ feature, state,
      reason: typeof reason === 'string' ? reason.slice(0, 80) : '' }));
}
function diagnose(t, fixture, phase) {
  const current = snapshot(fixture);
  t.diagnostic(JSON.stringify({ phase, clock: fixture.dom.window.performance.now(),
    elapsedDate: fixture.dom.window.Date.now() - fixture.base, contextState: fixture.context().state, gateReleased: fixture.gateReleased(),
    outcome: fixture.outcome().kind, current }));
  return current;
}
function assertStable(t, fixture, before, phase) {
  const current = diagnose(t, fixture, phase), added = rows(fixture, before.cursor);
  t.diagnostic(JSON.stringify({ phase, added }));
  assert.deepEqual(current, before.snapshot, 'preparation must preserve the copied stable product state');
  for (const row of added) assert.deepEqual({ state: row.state, reason: row.reason },
    before.snapshot.features[row.feature], 'transient status changes must not be hidden by the final snapshot');
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
  assert.equal(current.ui.state, state);
  assert.equal(current.ui.pressed, state === 'on' ? 'true' : 'false');
  assert.equal(current.features.audioProcessing.state, state === 'on' ? 'ready' : state === 'pending' ? 'pending' : 'limited');
  assert.equal(current.features.compressor.state, current.features.audioProcessing.state);
  assert.equal(current.features.equalizer.state, 'disabled');
  assert.equal(current.features.normalizer.state, 'disabled');
  assert.equal(current.contexts, 1);
  assert.equal(current.resumes, 1);
  assert.deepEqual(current.media, fixture.native);
}
async function pendingPreparedAfterPriorStages(t) {
  const failures = { clock: true, manualWorkletAck: true };
  let restoreDate = () => {};
  const fixture = setup({ after: cleanup => t.after(async () => {
    try {
      try { await cleanup(); } finally { restoreDate(); }
    } catch (error) { stopped = true; throw error; }
  }) }, true, true, { audioDefault: false, compressorEnabled: true, normalizerEnabled: false,
    compressorAttack: 0, audioGain: 1, gainInherited: false }, failures);
  let contexts = 0, resumes = 0, moduleCalls = 0, released = false, releaseModule;
  const gate = new Promise(resolve => {
    releaseModule = () => {
      assert.equal(released, false, 'module completion is released only once');
      released = true;
      resolve();
    };
  });
  const Base = fixture.dom.window.AudioContext;
  fixture.dom.window.AudioContext = class extends Base {
    constructor(...args) {
      super(...args);
      contexts++;
      const original = this.audioWorklet.addModule;
      this.audioWorklet.addModule = url => {
        moduleCalls++;
        return original.call(this.audioWorklet, url).then(() => gate);
      };
    }
    resume() { resumes++; return super.resume(); }
  };
  load(fixture.dom, 'web/player.js');
  const api = runtime(fixture.dom);
  api.reconcile();
  await flush();
  assert.ok(fixture.dom.window.document.querySelector('.knife-comp button'), 'real player UI is mounted');
  assert.deepEqual({ contexts, resumes, moduleCalls, nodes: fixture.nodes.length, sources: fixture.sources() },
    { contexts: 0, resumes: 0, moduleCalls: 0, nodes: 0, sources: 0 });
  const DomDate = fixture.dom.window.Date, originalNow = DomDate.now, nodeNow = Date.now;
  assert.notEqual(DomDate, Date, 'only this DOM clock is aligned');
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
  const result = { ...fixture, api, native, failures, base, outcome: () => outcome,
    counts: () => ({ contexts, resumes, moduleCalls }), gateReleased: () => released, releaseModule,
    preparedSent: false };
  const initial = diagnose(t, result, 'initial resume pending at 0');
  assert.equal(outcome.kind, 'pending');
  assert.equal(fixture.dom.window.performance.now(), 0);
  assert.equal(DomDate.now() - base, 0);
  assert.equal(fixture.context().state, 'suspended');
  assert.equal(fixture.context().currentTime, 0);
  assert.equal(released, false);
  assertState(initial, result, 'pending', 0, null);
  assert.equal(initial.moduleCalls, 0);
  assert.equal(initial.transitionNodes, 0);
  assert.equal(initial.commands, 0);
  assert.equal(initial.nodes, 1);
  assert.equal(fixture.nodes[0].type, 'destination');
  const initialBefore = { snapshot: initial, cursor: fixture.statusChanges.length };
  await fixture.time.advance(300);
  assert.equal(outcome.kind, 'pending');
  assert.equal(DomDate.now() - base, 300);
  assert.equal(fixture.context().state, 'suspended');
  assertStable(t, result, initialBefore, 'resume still pending at total 300');
  fixture.resume();
  await flush();
  const waiting = diagnose(t, result, 'resume completed and module pending at total 300');
  assert.equal(outcome.kind, 'pending');
  assert.equal(DomDate.now() - base, 300);
  assert.equal(fixture.dom.window.performance.now(), 300);
  assert.equal(fixture.context().state, 'running');
  assert.equal(released, false);
  assertState(waiting, result, 'pending', 0, null);
  assert.equal(waiting.moduleCalls, 1);
  assert.equal(waiting.transitionNodes, 0);
  assert.equal(waiting.commands, 0);
  assert.equal(waiting.nodes, 1);
  const moduleBefore = { snapshot: waiting, cursor: fixture.statusChanges.length };
  await fixture.time.advance(399);
  await flush();
  assert.equal(outcome.kind, 'pending');
  assert.equal(DomDate.now() - base, 699);
  assert.equal(released, false);
  assertStable(t, result, moduleBefore, 'module pending at total 699');
  await fixture.time.advance(1);
  assert.equal(DomDate.now() - base, 700);
  releaseModule();
  await flush();
  const node = fixture.nodes.find(part => part.type === 'transition');
  assert.ok(node, 'module returned before the actual transition node was constructed');
  assert.equal(typeof node.port.onmessage, 'function');
  assert.ok(Number.isSafeInteger(node.epoch));
  result.node = node;
  const readyWaiting = diagnose(t, result, 'prepared pending after prior stages at total 700');
  assert.equal(outcome.kind, 'pending');
  assert.equal(DomDate.now() - base, 700);
  assert.equal(fixture.dom.window.performance.now(), 700);
  assert.equal(fixture.context().state, 'running');
  assert.equal(fixture.context().currentTime, 0);
  assert.equal(released, true);
  assert.equal(failures.manualWorkletAck, true);
  assertState(readyWaiting, result, 'pending', 0, null);
  assert.equal(readyWaiting.moduleCalls, 1);
  assert.equal(readyWaiting.transitionNodes, 1);
  assert.equal(readyWaiting.commands, 0);
  assert.equal(readyWaiting.nodes, 16);
  result.before = { snapshot: readyWaiting, cursor: fixture.statusChanges.length };
  return result;
}
function prepared(t, fixture) {
  assert.equal(fixture.preparedSent, false, 'prepared is delivered only once');
  fixture.preparedSent = true;
  const extra = { seq: 0, sourceEpoch: fixture.node.epoch, meterEpoch: 0, gain: null, code: null };
  t.diagnostic(JSON.stringify({ phase: 'one prepared delivery', clock: fixture.dom.window.performance.now(), packet: extra }));
  fixture.node.reply('prepared', extra);
}

host('prior preparation time is deducted from the prepared ACK budget', async t => {
  const fixture = await pendingPreparedAfterPriorStages(t);
  await fixture.time.advance(299);
  await flush();
  assert.equal(fixture.outcome().kind, 'pending');
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 999);
  assert.equal(fixture.failures.manualWorkletAck, true);
  assertStable(t, fixture, fixture.before, 'prepared pending at total 999');
  await fixture.time.advance(1);
  await flush();
  const failed = diagnose(t, fixture, 'shared preparation timeout at total 1000');
  const value = settled(fixture);
  assert.equal(value.ok, true);
  assert.equal(value.wanted, true);
  assert.equal(value.state, 'unavailable');
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 1000);
  assertState(failed, fixture, 'unavailable', 0, null);
  assert.equal(failed.features.audioProcessing.reason, 'audio-unavailable');
  assert.equal(failed.moduleCalls, 1);
  assert.equal(failed.transitionNodes, 1);
  assert.equal(failed.commands, 0);
  assert.equal(failed.nodes, 16);
  const before = { snapshot: failed, cursor: fixture.statusChanges.length };
  prepared(t, fixture);
  await flush();
  assert.equal(fixture.failures.manualWorkletAck, true);
  assertStable(t, fixture, before, 'late prepared at total 1000');
  await fixture.time.advance(1);
  await flush();
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 1001);
  assertStable(t, fixture, before, 'late prepared through total 1001');
});

host('all preparation stages finish within the shared deadline', async t => {
  const fixture = await pendingPreparedAfterPriorStages(t);
  await fixture.time.advance(200);
  await flush();
  assert.equal(fixture.outcome().kind, 'pending');
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 900);
  assert.equal(fixture.failures.manualWorkletAck, true);
  assertStable(t, fixture, fixture.before, 'prepared pending at total 900');
  fixture.failures.manualWorkletAck = false;
  prepared(t, fixture);
  await flush();
  const current = diagnose(t, fixture, 'all preparation completed at total 900');
  const value = settled(fixture);
  assert.equal(value.ok, true);
  assert.equal(value.wanted, true);
  assert.equal(value.state, 'on');
  assertState(current, fixture, 'on', 1, 1);
  assert.equal(current.moduleCalls, 1);
  assert.equal(current.transitionNodes, 1);
  assert.equal(current.commands, 1);
  assert.equal(current.nodes, 17);
  const before = { snapshot: current, cursor: fixture.statusChanges.length };
  await fixture.time.advance(101);
  await flush();
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 1001);
  assertStable(t, fixture, before, 'all preparation healthy through total 1001');
});
