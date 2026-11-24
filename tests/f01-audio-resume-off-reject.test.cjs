const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./audio-fixture.cjs');
const { load, runtime, flush } = require('./helpers.cjs');

const features = ['audioProcessing', 'compressor', 'equalizer', 'normalizer'];
const copy = value => JSON.parse(JSON.stringify(value));
const rows = (h, cursor) => h.statusChanges.slice(cursor).filter(([feature]) => features.includes(feature))
  .map(([feature, state, reason]) => ({ feature, state, reason: typeof reason === 'string' ? reason.slice(0, 80) : '' }));

function snapshot(h) {
  const processors = h.nodes.filter(node => node.type === 'transition');
  return copy({
    intent: h.api.player.getAudioWanted({ ...h.api.media.context }),
    state: h.audio.getState(h.video), readback: h.audio.getReadback(h.video),
    ui: { state: h.box.dataset.state, pressed: h.button.getAttribute('aria-pressed'),
      title: h.button.title, label: h.button.getAttribute('aria-label') },
    features: Object.fromEntries(features.map(feature => [feature, h.api.statuses[feature]])),
    sources: h.sources(), sourceNodes: h.nodes.filter(node => node.type === 'source').length,
    transitionNodes: processors.length, nodes: h.nodes.length, nodeTypes: h.nodes.map(node => node.type),
    outputCounts: h.nodes.map(node => node.outputs.size),
    commands: processors.reduce((sum, node) => sum + node.commands.length, 0),
    messages: processors.reduce((sum, node) => sum + node.messages.length, 0),
    wire: processors.flatMap(node => node.messages), ...h.counts(),
    mediaContext: h.api.media.context, mediaRequestId: h.api.mediaRequestId,
    binding: h.api.media.audioBindingGeneration, config: h.api.config,
    media: { src: h.video.currentSrc, muted: h.video.muted, volume: h.video.volume },
  });
}
function fixed(h, clock) {
  assert.equal(h.dom.window.performance.now(), clock);
  assert.equal(h.DomDate.now(), h.base + clock);
  assert.equal(h.DomDate.now, h.alignedNow);
  assert.equal(Date.now, h.nodeNow);
  assert.equal(h.context(), h.savedContext);
  assert.equal(h.context().state, 'suspended');
  assert.equal(h.context().currentTime, 0);
  assert.equal(h.context().destination, h.savedDestination);
  assert.equal(h.nodes[0], h.savedDestination);
  assert.equal(h.context().audioWorklet.addModule, h.moduleWrapper());
  assert.equal(h.context().resume, h.savedResume);
  assert.equal(h.Base.prototype.resume, h.baseResume);
  assert.equal(h.api, runtime(h.dom));
  assert.equal(h.api.audio, h.audio);
  assert.equal(h.api.player, h.savedPlayer);
  assert.equal(h.api.state.player.video, h.video);
  assert.equal(h.api.state.player.pzp, h.savedPzp);
  assert.equal(h.api.media.context, h.savedMediaContext);
  assert.equal(h.api.mediaRequestId, h.savedRequestId);
  assert.equal(h.api.media.audioBindingGeneration, h.savedBinding);
  assert.equal(h.api.config, h.savedConfig);
  assert.equal(h.dom.window.document.querySelector('.knife-comp'), h.box);
  assert.equal(h.box.querySelector('button'), h.button);
  assert.ok(h.video.isConnected && h.savedPzp.isConnected && h.button.isConnected, 'the original player stays live');
}
function diagnose(t, h, phase) {
  const current = snapshot(h);
  t.diagnostic(JSON.stringify({ phase, clock: h.dom.window.performance.now(), elapsedDate: h.DomDate.now() - h.base,
    contextState: h.context().state, currentTime: h.context().currentTime,
    onOutcome: h.onOutcome().kind, gateRejectCount: h.rejectCount(), current }));
  return current;
}
function state(current, h, expected, wanted) {
  assert.equal(current.intent.ok, true);
  assert.equal(current.intent.wanted, wanted);
  assert.equal(current.intent.state, expected);
  assert.equal(current.state, expected);
  assert.equal(current.readback.state, expected);
  assert.equal(current.readback.wanted, wanted);
  assert.equal(current.readback.gain, 1);
  assert.equal(current.readback.appliedGain, null);
  assert.equal(current.readback.sources, 0);
  assert.equal(current.ui.state, expected);
  assert.equal(current.ui.pressed, 'false');
  assert.equal(current.sources, 0);
  assert.equal(current.sourceNodes, 0);
  assert.equal(current.transitionNodes, 0);
  assert.equal(current.nodes, 1);
  assert.deepEqual(current.nodeTypes, ['destination']);
  assert.deepEqual(current.outputCounts, [0]);
  assert.equal(current.commands, 0);
  assert.equal(current.messages, 0);
  assert.deepEqual(current.wire, []);
  assert.equal(current.contexts, 1);
  assert.equal(current.resumes, 1);
  assert.equal(current.moduleCalls, 0);
  assert.deepEqual(current.features.audioProcessing, expected === 'pending'
    ? { state: 'pending', reason: 'audio-context' } : { state: 'disabled', reason: '' });
  assert.deepEqual(current.features.compressor, { state: expected === 'pending' ? 'pending' : 'disabled', reason: '' });
  assert.deepEqual(current.features.equalizer, { state: 'disabled', reason: '' });
  assert.deepEqual(current.features.normalizer, { state: 'disabled', reason: '' });
  assert.deepEqual(current.media, h.native);
}
function stable(t, h, before, phase, clock) {
  fixed(h, clock);
  const current = diagnose(t, h, phase), added = rows(h, before.cursor);
  assert.deepEqual(current, before.snapshot);
  for (const row of added) assert.deepEqual({ state: row.state, reason: row.reason }, before.snapshot.features[row.feature],
    'a transient stale status cannot disappear behind the final snapshot');
  t.diagnostic(JSON.stringify({ phase, added }));
}
function fulfilled(outcome, label) {
  if (outcome.kind === 'rejected') throw outcome.error;
  assert.equal(outcome.kind, 'fulfilled', label + ' must fulfill before its value is inspected');
  return outcome.value;
}

test('explicit OFF during pending resume survives late rejection in the same live player', async t => {
  let firstError, restoreDate = () => {};
  try {
    const fixture = setup({ after: cleanup => t.after(async () => {
      let cleanupError;
      try { await cleanup(); } catch (error) { cleanupError = error; }
      finally {
        try { restoreDate(); } catch (error) {
          if (cleanupError) t.diagnostic('secondary Date restoration error: ' + String(error));
          else cleanupError = error;
        }
      }
      if (cleanupError) {
        if (firstError) { t.diagnostic('secondary cleanup error after first body failure: ' + String(cleanupError)); return; }
        firstError = cleanupError; throw cleanupError;
      }
    }) }, true, true, { audioDefault: false, compressorEnabled: true, normalizerEnabled: false,
      compressorAttack: 0, audioGain: 1, gainInherited: false }, { clock: true });
    let contexts = 0, resumes = 0, moduleCalls = 0, rejectResume, moduleWrapper, gateRejectCount = 0;
    const gate = new Promise((resolve, reject) => { rejectResume = reject; });
    const Base = fixture.dom.window.AudioContext, baseResume = Base.prototype.resume;
    fixture.dom.window.AudioContext = class extends Base {
      constructor(...args) {
        super(...args); contexts++;
        const original = this.audioWorklet.addModule, owner = this.audioWorklet;
        moduleWrapper = function (...values) { moduleCalls++; return original.apply(owner, values); };
        owner.addModule = moduleWrapper;
      }
      resume() { resumes++; return gate; }
    };
    const savedResume = fixture.dom.window.AudioContext.prototype.resume;
    load(fixture.dom, 'web/player.js');
    const api = runtime(fixture.dom);
    api.reconcile();
    await flush();
    const box = fixture.dom.window.document.querySelector('.knife-comp'), button = box?.querySelector('button');
    assert.ok(button, 'the actual player UI is mounted');
    assert.deepEqual({ contexts, resumes, moduleCalls, sources: fixture.sources(), nodes: fixture.nodes.length },
      { contexts: 0, resumes: 0, moduleCalls: 0, sources: 0, nodes: 0 });
    const DomDate = fixture.dom.window.Date, originalNow = DomDate.now, nodeNow = Date.now;
    assert.notEqual(DomDate, Date);
    const base = originalNow.call(DomDate), alignedNow = () => base + fixture.dom.window.performance.now();
    restoreDate = () => {
      DomDate.now = originalNow;
      assert.equal(DomDate.now, originalNow);
      assert.equal(Date.now, nodeNow);
      t.diagnostic(JSON.stringify({ phase: 'DOM Date restored after fixture cleanup', restored: true, nodeDateUnchanged: true }));
    };
    DomDate.now = alignedNow;
    const native = { src: fixture.video.currentSrc, muted: fixture.video.muted, volume: fixture.video.volume };
    let onOutcome = { kind: 'pending' };
    const enabling = api.player.setAudioWanted(true, { ...api.media.context });
    void enabling.then(value => { onOutcome = { kind: 'fulfilled', value }; },
      error => { onOutcome = { kind: 'rejected', error }; });
    await flush();
    const h = { ...fixture, api, box, button, native, Base, baseResume, savedResume, DomDate, originalNow, nodeNow, base, alignedNow,
      savedContext: fixture.context(), savedDestination: fixture.context()?.destination,
      savedPlayer: api.player, savedPzp: api.state.player.pzp, savedMediaContext: api.media.context,
      savedRequestId: api.mediaRequestId, savedBinding: api.media.audioBindingGeneration, savedConfig: api.config,
      moduleWrapper: () => moduleWrapper, counts: () => ({ contexts, resumes, moduleCalls }),
      onOutcome: () => onOutcome, rejectCount: () => gateRejectCount };
    const pending = diagnose(t, h, 'actual first resume pending at 0');
    assert.equal(onOutcome.kind, 'pending');
    assert.equal(typeof rejectResume, 'function');
    fixed(h, 0);
    state(pending, h, 'pending', true);
    const pendingBefore = { snapshot: pending, cursor: h.statusChanges.length };
    await h.time.advance(100);
    await flush();
    assert.equal(onOutcome.kind, 'pending');
    stable(t, h, pendingBefore, 'resume remains pending before explicit OFF at 100', 100);

    let offOutcome = { kind: 'pending' };
    const disabling = api.player.setAudioWanted(false, { ...api.media.context });
    void disabling.then(value => { offOutcome = { kind: 'fulfilled', value }; },
      error => { offOutcome = { kind: 'rejected', error }; });
    await flush();
    const offReply = fulfilled(offOutcome, 'explicit OFF');
    assert.equal(offReply.ok, true);
    assert.equal(offReply.wanted, false);
    assert.equal(offReply.state, 'off');
    assert.deepEqual(copy(offReply.context), copy(api.media.context));
    assert.equal(onOutcome.kind, 'pending', 'old ON remains at the original resume gate until the selected rejection');
    fixed(h, 100);
    const off = diagnose(t, h, 'explicit OFF fulfilled at 100 with old ON still pending');
    state(off, h, 'off', false);
    const expectedOff = copy(pending);
    expectedOff.intent.wanted = expectedOff.readback.wanted = false;
    expectedOff.intent.state = expectedOff.state = expectedOff.readback.state = 'off';
    expectedOff.ui = { state: 'off', pressed: 'false', title: 'Enable compressor', label: 'Enable compressor' };
    for (const feature of features) expectedOff.features[feature] = { state: 'disabled', reason: '' };
    assert.deepEqual(off, expectedOff);
    const offRows = rows(h, pendingBefore.cursor);
    for (const row of offRows) assert.deepEqual({ state: row.state, reason: row.reason }, off.features[row.feature]);
    const offBefore = { snapshot: off, cursor: h.statusChanges.length }, savedOffReply = copy(offReply);
    t.diagnostic(JSON.stringify({ phase: 'explicit OFF publication', offReply: savedOffReply, offRows }));

    await h.time.advance(100);
    await flush();
    assert.equal(onOutcome.kind, 'pending');
    stable(t, h, offBefore, 'live OFF before selected resume rejection at 200', 200);
    const injectedError = new Error('injected resume rejection after OFF');
    assert.equal(gateRejectCount, 0);
    const rejectedValue = injectedError;
    gateRejectCount++;
    rejectResume(rejectedValue);
    assert.equal(rejectedValue, injectedError);
    stable(t, h, offBefore, 'late resume rejection immediate at 200', 200);
    await flush();
    const onReply = fulfilled(onOutcome, 'old ON after resume rejection');
    assert.equal(onReply.ok, true);
    assert.equal(onReply.wanted, false);
    assert.equal(onReply.state, 'off');
    assert.deepEqual(copy(onReply.context), copy(api.media.context));
    assert.deepEqual(copy(fulfilled(offOutcome, 'retained OFF')), savedOffReply);
    stable(t, h, offBefore, 'late resume rejection after flush at 200', 200);
    assert.equal(gateRejectCount, 1);
    t.diagnostic(JSON.stringify({ phase: 'selected rejection and both settlements',
      error: { name: injectedError.name, message: injectedError.message }, sameErrorIdentity: rejectedValue === injectedError,
      gateRejectCount, onReply: copy(onReply), offReply: savedOffReply }));

    // shortcut: one live OFF/rejection prefix is observed; extend only for a separately approved race or Native contract.
    await h.time.advance(800);
    await flush();
    stable(t, h, offBefore, 'live OFF survives original prepare deadline at 1000', 1000);
    state(snapshot(h), h, 'off', false);
    assert.equal(gateRejectCount, 1);
    assert.deepEqual(copy(fulfilled(onOutcome, 'retained old ON')), copy(onReply));
    assert.deepEqual(copy(fulfilled(offOutcome, 'retained OFF')), savedOffReply);
    t.diagnostic(JSON.stringify({ phase: 'live OFF cancellation complete at 1000', gateRejectCount,
      onReply: copy(onReply), offReply: savedOffReply, finalClock: h.dom.window.performance.now(),
      normalizedRows: rows(h, offBefore.cursor) }));
  } catch (error) { firstError = error; throw error; }
});
