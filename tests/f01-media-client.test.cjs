const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsHarness } = require('./settings-fixture.cjs');
const { page, load } = require('./helpers.cjs');
function client(t, h) {
  const dom = page(); for (const file of ['media-profiles.js','config.js','style-schema.js','settings-contract.js','settings-client.js']) load(dom, file);
  const instance = dom.window.createMediaSettingsClient(h.apiFor('popup')); let view;
  instance.subscribe(next => { view = next; }); t.after(() => { instance.dispose(); dom.window.close(); });
  return { ...instance, view: () => view };
}
test('F01 TAB reads protocol3 and global fields use its serialized field writer', async t => {
  const h = settingsHarness(t, { config: { unknown: 17 } }), c = client(t, h); await h.settle();
  assert.equal(c.view().snapshot.values.audio.eqEnabled, false);
  assert.equal(h.messages.filter(entry => entry.message.action === 'get-media-snapshot').every(entry => entry.message.protocol === 3), true);
  c.editFields('audio', { eqEnabled: true, eq63: 3, audioGain: 0.375 }); await h.settle();
  assert.equal(h.saved.config.eq63, 3); assert.equal(h.saved.config.audioGain, 0.375); assert.equal(h.saved.config.gainInherited, false);
  assert.equal(h.saved.config.unknown, 17); assert.equal(Object.hasOwn(h.saved, 'mediaProfiles'), false);
});
test('schema1 TAB is read-only until explicit upgrade and projection never writes', async t => {
  const h = settingsHarness(t, { mediaProfiles: { schema: 1, revision: 0, channels: [], presets: [] } }), c = client(t, h); await h.settle();
  assert.equal(c.view().snapshot.canWrite, false); assert.equal(c.view().snapshot.code, 'media-upgrade-required');
  c.editFields('audio', { eq63: 3 }); await h.settle(); assert.equal(h.saved.mediaProfiles.schema, 1);
  assert.equal(h.calls.filter(call => call.kind === 'commit').length, 0);
  const reply = await c.perform({ action: 'upgrade-media-store', expectedMediaRevision: 0 }); await h.settle();
  assert.equal(reply.ok, true); assert.equal(h.saved.mediaProfiles.schema, 2); assert.equal(h.saved.mediaProfiles.revision, 1);
});
test('inherited Gain display is resolved in one snapshot while the stored channel pair stays unchanged', async t => {
  const channelId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', selection = { kind: 'saved', channelId };
  const h = settingsHarness(t, { config: { audioGain: 1.75, gainInherited: false } }), c = client(t, h); await h.settle(); await c.selectScope(selection);
  await c.perform({ action: 'enable-channel-domain', selection, domain: 'audio', expectedGlobalRevision: 0, expectedMediaRevision: 0, expectedRecord: null }); await h.settle();
  c.editFields('audio', { audioGain: 0.2 }); await h.settle();
  assert.equal(h.saved.mediaProfiles.channels[0].audio.values.gainInherited, false);
  c.editFields('audio', { gainInherited: true }); await h.settle();
  assert.equal(c.view().snapshot.values.audio.audioGain, 0.2); assert.equal(c.view().snapshot.values.audio.gainInherited, true);
  assert.equal(c.view().snapshot.effectiveGain, 1.75); assert.equal(c.view().snapshot.gainOrigin, 'global-owned');
});
test('external storage invalidation makes confirmed source stale until a fresh read without disabling drafts',async t=>{
  const h=settingsHarness(t),c=client(t,h);await h.settle();assert.equal(c.view().fresh,true);
  const gate=h.holdNext('callback:get-media-snapshot');h.changes.emit({config:{newValue:{}}},'local');await gate.reached;
  assert.equal(c.view().fresh,false);assert.equal(c.view().phase,'ready');gate.release();await h.settle();assert.equal(c.view().fresh,true);
});
