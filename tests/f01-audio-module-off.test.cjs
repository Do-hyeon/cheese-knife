const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./audio-fixture.cjs');
const { load, runtime, flush } = require('./helpers.cjs');

const moduleUrl = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/web/audio-transition-worklet.js';
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
    contexts: fixture.contexts(), moduleCalls: fixture.moduleCalls(),
    media: { src: fixture.video.currentSrc, muted: fixture.video.muted, volume: fixture.video.volume },
  });
}

async function pendingModule(t) {
  // Keep the first-failure stop effective for fixture teardown as well.
  const fixture = setup({ after: cleanup => t.after(async () => {
    try { await cleanup(); } catch (error) { stopped = true; throw error; }
  }) }, false, false, { audioDefault: false, compressorEnabled: true,
    compressorAttack: 0, audioGain: 1, gainInherited: false });
  let resolve, reject, contexts = 0, moduleCalls = 0;
  const gate = new Promise((yes, no) => { resolve = yes; reject = no; });
  const Base = fixture.dom.window.AudioContext;
  fixture.dom.window.AudioContext = class extends Base {
    constructor(...args) {
      super(...args);
      contexts++;
      const original = this.audioWorklet.addModule;
      this.audioWorklet.addModule = url => {
        assert.equal(url, moduleUrl);
        moduleCalls++;
        return gate.then(() => original.call(this.audioWorklet, url));
      };
    }
  };
  load(fixture.dom, 'web/player.js');
  const api = runtime(fixture.dom);
  api.reconcile();
  await flush();
  assert.ok(fixture.dom.window.document.querySelector('.knife-comp button'), 'real player UI is mounted');
  assert.equal(contexts, 0, 'audioDefault false must not start preparation');
  const result = { ...fixture, api, resolve, reject,
    contexts: () => contexts, moduleCalls: () => moduleCalls };
  result.native = { src: fixture.video.currentSrc, muted: fixture.video.muted, volume: fixture.video.volume };
  result.enabling = api.player.setAudioWanted(true, { ...api.media.context });
  await flush();
  const pending = snapshot(result);
  assert.equal(pending.state, 'pending');
  assert.equal(pending.intent.ok, true);
  assert.equal(pending.intent.wanted, true);
  assert.equal(pending.moduleCalls, 1, 'must enter the actual instance module gate');
  assert.equal(pending.contexts, 1);
  assert.equal(pending.transitionNodes, 0);
  assert.equal(pending.sourceNodes, 0);
  assert.equal(pending.sources, 0);
  assert.equal(pending.readback.sources, 0);
  assert.deepEqual(pending.media, result.native);
  return result;
}

async function explicitOff(fixture) {
  const reply = await fixture.api.player.setAudioWanted(false, { ...fixture.api.media.context });
  assert.equal(reply.ok, true);
  assert.equal(reply.wanted, false);
  assert.equal(reply.state, 'off');
  const off = snapshot(fixture);
  assert.equal(off.state, 'off');
  assert.equal(off.readback.wanted, false);
  assert.equal(off.ui.state, 'off');
  assert.equal(off.ui.pressed, 'false');
  for (const feature of features) assert.equal(off.features[feature].state, 'disabled');
  assert.equal(off.sources, 0);
  assert.equal(off.sourceNodes, 0);
  assert.equal(off.transitionNodes, 0);
  assert.deepEqual(off.media, fixture.native);
  return { off, cursor: fixture.statusChanges.length };
}

async function assertSettledOff(t, fixture, before) {
  const reply = await fixture.enabling;
  assert.equal(reply.ok, true);
  assert.equal(reply.wanted, false);
  assert.equal(reply.state, 'off');
  const after = snapshot(fixture);
  const added = fixture.statusChanges.slice(before.cursor)
    .filter(([feature]) => features.includes(feature))
    .map(([feature, state, reason]) => ({ feature, state,
      reason: typeof reason === 'string' ? reason.slice(0, 80) : '' }));
  t.diagnostic(JSON.stringify({ before: before.off, after, added }));
  assert.deepEqual(after, before.off, 'late module settlement must preserve live OFF and source0');
  for (const row of added) assert.deepEqual({ state: row.state, reason: row.reason },
    before.off.features[row.feature], 'even transient stale publication must be rejected');
}

host('OFF during module resolve keeps native source0', async t => {
  const fixture = await pendingModule(t);
  const before = await explicitOff(fixture);
  fixture.resolve();
  await assertSettledOff(t, fixture, before);
  const on = await fixture.api.player.setAudioWanted(true, { ...fixture.api.media.context });
  await flush();
  const current = snapshot(fixture);
  assert.equal(on.ok, true);
  assert.equal(on.wanted, true);
  assert.equal(on.state, 'on');
  assert.equal(current.state, 'on');
  assert.equal(current.readback.appliedGain, 1);
  assert.equal(current.readback.sources, 1);
  assert.equal(current.sources, 1);
  assert.equal(current.sourceNodes, 1);
  assert.equal(current.transitionNodes, 1);
  assert.equal(current.contexts, 1);
  assert.equal(current.moduleCalls, 1, 'explicit ON reuses the resolved module Promise');
  assert.equal(current.ui.state, 'on');
  assert.equal(current.ui.pressed, 'true');
  assert.equal(current.features.audioProcessing.state, 'ready');
  assert.equal(current.features.compressor.state, 'ready');
  assert.equal(current.features.equalizer.state, 'disabled');
  assert.equal(current.features.normalizer.state, 'disabled');
  assert.deepEqual(current.media, fixture.native);
  t.diagnostic(JSON.stringify({ explicitOn: current }));
});

host('OFF during module rejection stays OFF without stale failure publication', async t => {
  const fixture = await pendingModule(t);
  const before = await explicitOff(fixture);
  fixture.reject(new Error('injected module rejection after OFF'));
  await assertSettledOff(t, fixture, before);
});

host('current module rejection remains unavailable before capture', async t => {
  const fixture = await pendingModule(t);
  const cursor = fixture.statusChanges.length;
  fixture.reject(new Error('injected current module rejection'));
  const reply = await fixture.enabling;
  const failed = snapshot(fixture);
  assert.equal(reply.ok, true);
  assert.equal(reply.wanted, true);
  assert.equal(reply.state, 'unavailable');
  assert.equal(failed.state, 'unavailable');
  assert.equal(failed.readback.wanted, true);
  assert.equal(failed.readback.appliedGain, null);
  assert.equal(failed.readback.sources, 0);
  assert.equal(failed.sources, 0);
  assert.equal(failed.sourceNodes, 0);
  assert.equal(failed.transitionNodes, 0);
  assert.equal(failed.contexts, 1);
  assert.equal(failed.moduleCalls, 1);
  assert.equal(failed.ui.state, 'unavailable');
  assert.equal(failed.ui.pressed, 'false');
  assert.equal(failed.features.audioProcessing.state, 'limited');
  assert.equal(failed.features.audioProcessing.reason, 'audio-unavailable');
  assert.equal(failed.features.compressor.state, 'limited');
  assert.equal(failed.features.equalizer.state, 'disabled');
  assert.equal(failed.features.normalizer.state, 'disabled');
  assert.ok(fixture.statusChanges.slice(cursor).some(([feature, state, reason]) =>
    feature === 'audioProcessing' && state === 'limited' && reason === 'audio-unavailable'));
  assert.deepEqual(failed.media, fixture.native);
  t.diagnostic(JSON.stringify({ currentRejection: failed }));
});
