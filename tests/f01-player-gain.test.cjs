const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, playerHTML, deliverScoped, flush } = require('./helpers.cjs');
function setup(t) {
  const dom = page(playerHTML); t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  return { dom, api: runtime(dom), video: dom.window.document.querySelector('video') };
}
test('F01 installs owner3 and old owner2 cannot acquire any new feature controller', t => {
  const { dom, api } = setup(t); assert.equal(api.ownerProtocol, 3);
  const old = page(playerHTML); t.after(() => old.window.close());
  const value = { ownerProtocol: 2, features: {}, statuses: {}, setStatus() { throw new Error('old owner changed'); } };
  Object.defineProperty(old.window, old.window.Symbol.for('cheese-knife.runtime.v1'), { value });
  for (const file of ['web/runtime.js', 'web/site-adapter.js', 'web/audio.js', 'web/player.js', 'web/preview.js', 'web/inject.js']) load(old, file);
  assert.deepEqual(value.features, {}); assert.equal(value.audio, undefined); assert.equal(value.player, undefined);
  assert.strictEqual(runtime(old), value);
});
test('MAIN Gain is preview only and preserves site knifeGain including zero', t => {
  const { dom, api, video } = setup(t);
  dom.window.localStorage.setItem('knifeGain', '0.75');
  load(dom, 'web/audio.js'); assert.ok(api.audio);
  assert.equal(api.audio.setGain(video, 0), 0);
  assert.equal(dom.window.localStorage.getItem('knifeGain'), '0.75');
});
test('MAIN mount has no Gain writer; common master action rejects stale context without changing intent', async t => {
  const { dom, api, video } = setup(t); deliverScoped(dom);
  load(dom, 'web/audio.js'); load(dom, 'web/player.js'); api.reconcile();
  assert.equal(dom.window.document.querySelector('.knife-comp input'), null);
  assert.equal(typeof api.player.setAudioWanted, 'function'); assert.equal(typeof api.player.getAudioWanted, 'function');
  const before = api.player.getAudioWanted({ ...api.media.context });
  const stale = await api.player.setAudioWanted(true, { ...api.media.context, playerGeneration: api.media.context.playerGeneration + 1 });
  assert.equal(stale.ok, false); assert.deepEqual(api.player.getAudioWanted({ ...api.media.context }), before);
  assert.equal(api.audio.getState(video), 'off');
});
