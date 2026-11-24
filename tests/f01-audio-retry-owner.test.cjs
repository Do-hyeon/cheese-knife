const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./audio-fixture.cjs');
const { load, runtime, flush } = require('./helpers.cjs');

const features = ['audioProcessing', 'compressor', 'equalizer', 'normalizer'];
const publications = fixture => fixture.statusChanges.filter(([feature]) => features.includes(feature));

function snapshot(fixture) {
  const box = fixture.dom.window.document.querySelector('.knife-comp');
  const button = box.querySelector('button');
  return JSON.parse(JSON.stringify({
    state: fixture.audio.getState(fixture.video),
    readback: fixture.audio.getReadback(fixture.video),
    ui: { state: box.dataset.state, pressed: button.getAttribute('aria-pressed'),
      title: button.title, label: button.getAttribute('aria-label') },
    features: Object.fromEntries(features.map(feature => [feature, fixture.api.statuses[feature]])),
    sources: fixture.sources(), nodes: fixture.nodes.length,
  }));
}

async function retrySource(t, gain = 1) {
  const fixture = setup(t, false, false, { audioDefault: false, compressorEnabled: true,
    compressorAttack: 0, audioGain: gain, gainInherited: false });
  const prototype = fixture.dom.window.AudioContext.prototype;
  const original = prototype.createMediaElementSource;
  let oldNode, oldError;
  prototype.createMediaElementSource = function (video) {
    assert.equal(video, fixture.video);
    oldNode = fixture.nodes.filter(node => node.type === 'transition').at(-1);
    oldError = oldNode?.onprocessorerror;
    // Throw before the fixture's successful-source counter or source creation.
    throw new Error('injected first source failure');
  };
  t.after(() => { prototype.createMediaElementSource = original; });
  load(fixture.dom, 'web/player.js');
  const api = runtime(fixture.dom);
  api.reconcile();
  await flush();
  assert.ok(fixture.dom.window.document.querySelector('.knife-comp button'), 'real player UI is mounted');
  assert.equal(fixture.sources(), 0);
  const first = await api.player.setAudioWanted(true, { ...api.media.context });
  assert.equal(first.ok, true);
  assert.equal(first.state, 'unavailable');
  assert.equal(fixture.sources(), 0, 'failed source creation must not create a source');
  assert.equal(typeof oldError, 'function');
  prototype.createMediaElementSource = original;
  const second = await api.player.setAudioWanted(true, { ...api.media.context });
  await flush();
  assert.equal(second.ok, true);
  assert.equal(second.state, 'on');
  const node = fixture.nodes.filter(node => node.type === 'transition').at(-1);
  const latch = fixture.nodes.filter(node => node.type === 'constant').at(-1);
  assert.notEqual(node, oldNode, 'retry must own a new processor');
  assert.equal(fixture.nodes.filter(node => node.type === 'transition').length, 2);
  const result = { ...fixture, api, node, latch, oldError };
  const ready = snapshot(result);
  assert.equal(ready.state, 'on');
  assert.equal(ready.readback.appliedGain, gain);
  assert.equal(ready.readback.sources, 1);
  assert.equal(ready.sources, 1);
  assert.equal(ready.ui.state, 'on');
  assert.equal(ready.ui.pressed, 'true');
  assert.equal(ready.features.audioProcessing.state, 'ready');
  assert.equal(ready.features.compressor.state, 'ready');
  assert.equal(ready.features.equalizer.state, 'disabled');
  assert.equal(ready.features.normalizer.state, 'disabled');
  return result;
}

function assertOldErrorIgnored(t, fixture) {
  const before = snapshot(fixture);
  const count = publications(fixture).length;
  fixture.oldError();
  // Snapshot before a later reconcile can republish the current entry's status.
  const after = snapshot(fixture);
  const added = JSON.parse(JSON.stringify(publications(fixture).slice(count)));
  t.diagnostic(JSON.stringify({ before, after, added }));
  assert.deepEqual({ after, added }, { after: before, added: [] },
    'superseded error must preserve current state, live UI, feature status and source ownership');
}

function assertCurrentErrorFails(fixture) {
  const before = snapshot(fixture);
  const count = publications(fixture).length;
  fixture.node.onprocessorerror();
  const after = snapshot(fixture);
  assert.equal(after.state, 'unavailable');
  assert.equal(after.readback.appliedGain, null);
  assert.equal(after.readback.sources, 1);
  assert.equal(after.sources, 1);
  assert.equal(after.nodes, before.nodes);
  assert.equal(after.ui.state, 'unavailable');
  assert.equal(after.ui.pressed, 'false');
  assert.equal(after.features.audioProcessing.state, 'limited');
  assert.equal(after.features.audioProcessing.reason, 'audio-processor-failed');
  assert.equal(after.features.compressor.state, 'limited');
  assert.ok(publications(fixture).slice(count).some(([feature, state, reason]) =>
    feature === 'audioProcessing' && state === 'limited' && reason === 'audio-processor-failed'));
  const source = fixture.nodes.find(node => node.type === 'source');
  assert.ok([...source.outputs].some(node => node.type === 'delay'), 'independent raw path remains connected');
  assert.equal(source.outputs.has(fixture.node), false, 'failed processor is disconnected from source');
}

test('superseded source-failure processorerror cannot overwrite live UI', async t => {
  const fixture = await retrySource(t);
  assertOldErrorIgnored(t, fixture);
});

test('current processorerror still fails the retried source', async t => {
  const fixture = await retrySource(t);
  assertCurrentErrorFails(fixture);
});

test('Gain0 retry preserves current ownership', async t => {
  const fixture = await retrySource(t, 0);
  assert.equal(fixture.latch.offset.value, -1, 'use the retried source latch');
  assertOldErrorIgnored(t, fixture);
  assert.equal(fixture.latch.offset.value, -1);
  assertCurrentErrorFails(fixture);
  assert.equal(fixture.latch.offset.value, -1, 'current failure retains confirmed Gain0 latch');
});
