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
    elapsedDate: fixture.dom.window.Date.now() - fixture.base, contextState: fixture.context().state,
    outcome: fixture.outcome().kind, current }));
  return current;
}
function assertStable(t, fixture, before, phase) {
  const current = diagnose(t, fixture, phase), added = rows(fixture, before.cursor);
  t.diagnostic(JSON.stringify({ phase, added }));
  assert.deepEqual(current, before.snapshot, 'context running must not change protected product state');
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
async function pendingResume(t) {
  let restoreDate = () => {};
  const fixture = setup({ after: cleanup => t.after(async () => {
    try {
      try { await cleanup(); } finally { restoreDate(); }
    } catch (error) { stopped = true; throw error; }
  }) }, true, true, { audioDefault: false, compressorEnabled: true, normalizerEnabled: false,
    compressorAttack: 0, audioGain: 1, gainInherited: false }, { clock: true });
  let contexts = 0, resumes = 0, moduleCalls = 0;
  const Base = fixture.dom.window.AudioContext;
  fixture.dom.window.AudioContext = class extends Base {
    constructor(...args) {
      super(...args);
      contexts++;
      const original = this.audioWorklet.addModule;
      this.audioWorklet.addModule = url => {
        moduleCalls++;
        return original.call(this.audioWorklet, url);
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
  const result = { ...fixture, api, native, base, outcome: () => outcome,
    counts: () => ({ contexts, resumes, moduleCalls }) };
  const current = diagnose(t, result, 'initial resume pending at 0');
  assert.equal(outcome.kind, 'pending');
  assert.equal(fixture.dom.window.performance.now(), 0);
  assert.equal(DomDate.now() - base, 0);
  assert.equal(fixture.context().state, 'suspended');
  assert.equal(fixture.context().currentTime, 0);
  assertState(current, result, 'pending', 0, null);
  assert.equal(current.moduleCalls, 0);
  assert.equal(current.transitionNodes, 0);
  assert.equal(current.commands, 0);
  assert.equal(current.nodes, 1);
  assert.equal(fixture.nodes[0].type, 'destination');
  result.before = { snapshot: current, cursor: fixture.statusChanges.length };
  return result;
}
function completeResume(fixture) {
  fixture.resume();
  fixture.context().dispatchEvent(new fixture.dom.window.Event('statechange'));
}

host('initial resume timeout stays source0 after late running', async t => {
  const fixture = await pendingResume(t);
  await fixture.time.advance(999);
  await flush();
  assert.equal(fixture.outcome().kind, 'pending');
  assert.equal(fixture.context().state, 'suspended');
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 999);
  assertStable(t, fixture, fixture.before, 'resume pending at 999');
  await fixture.time.advance(1);
  await flush();
  const failed = diagnose(t, fixture, 'resume timeout at 1000');
  const value = settled(fixture);
  assert.equal(value.ok, true);
  assert.equal(value.wanted, true);
  assert.equal(value.state, 'unavailable');
  assertState(failed, fixture, 'unavailable', 0, null);
  assert.equal(failed.features.audioProcessing.reason, 'audio-unavailable');
  assert.equal(failed.moduleCalls, 0);
  assert.equal(failed.transitionNodes, 0);
  assert.equal(failed.commands, 0);
  assert.equal(failed.nodes, 1);
  assert.equal(fixture.context().state, 'suspended');
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 1000);
  const before = { snapshot: failed, cursor: fixture.statusChanges.length };
  completeResume(fixture);
  await flush();
  assert.equal(fixture.context().state, 'running');
  assertStable(t, fixture, before, 'late resume and statechange at 1000');
  await fixture.time.advance(1);
  await flush();
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 1001);
  assertStable(t, fixture, before, 'late running through 1001');
});

host('initial resume before deadline captures exactly once', async t => {
  const fixture = await pendingResume(t);
  await fixture.time.advance(900);
  await flush();
  assert.equal(fixture.outcome().kind, 'pending');
  assert.equal(fixture.context().state, 'suspended');
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 900);
  assertStable(t, fixture, fixture.before, 'resume pending at 900');
  completeResume(fixture);
  await flush();
  const current = diagnose(t, fixture, 'resume completed at 900');
  const value = settled(fixture);
  assert.equal(value.ok, true);
  assert.equal(value.wanted, true);
  assert.equal(value.state, 'on');
  assertState(current, fixture, 'on', 1, 1);
  assert.equal(current.moduleCalls, 1);
  assert.equal(current.transitionNodes, 1);
  assert.equal(current.commands, 1);
  assert.equal(fixture.context().state, 'running');
  const before = { snapshot: current, cursor: fixture.statusChanges.length };
  await fixture.time.advance(101);
  await flush();
  assert.equal(fixture.dom.window.Date.now() - fixture.base, 1001);
  assertStable(t, fixture, before, 'healthy resume through 1001');
});
