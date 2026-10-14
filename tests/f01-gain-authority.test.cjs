const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { settingsHarness, extensionId } = require('./settings-fixture.cjs');
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const audio = { audioDefault: false, compressorEnabled: true, compressorThreshold: -50, compressorKnee: 40,
  compressorRatio: 12, compressorAttack: 0, compressorRelease: 0.25, audioGain: 1, gainInherited: true,
  eqEnabled: false, eq63: 0, eq125: 0, eq250: 0, eq500: 0, eq1000: 0, eq2000: 0, eq4000: 0, eq8000: 0,
  normalizerEnabled: false, normalizerTargetDbfs: -20 };
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  let now = 1000, id = 0;
  const realm = vm.createContext({ TextEncoder, Date, URL, structuredClone, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}` } });
  for (const file of ['media-profiles.js', 'gain-authority.js']) if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), realm);
  assert.equal(typeof realm.createPlayerGainAuthority, 'function');
  const authority = realm.createPlayerGainAuthority(() => now);
  const raw = { settingsRevision: 0, config: { audioGain: 1, gainInherited: false } };
  const native = n => ({ tabId: n, windowId: 9, documentId: `doc-${n}`, route: `https://chzzk.naver.com/live/${A}`, bindingId: `binding-${n}`, legacyValue: 1 });
  return { authority, raw, native, advance: ms => { now += ms; } };
}
test('actor TTL and 64 actor/scope bounds fail closed without dropping busy actors', () => {
  const { authority: a, raw, native, advance } = fixture();
  const view = a.view(native(0), raw);
  assert.equal(a.check(view.ticket, native(0), raw).ok, true);
  advance(60001); assert.equal(a.check(view.ticket, native(0), raw).ok, false);
  for (let i = 0; i < 64; i++) assert.equal(a.view(native(i), raw).ok, true);
  assert.equal(a.view(native(64), raw).code, 'gain-busy');
});
test('owned A-B-A and before-write failure invalidate old tickets irreversibly', () => {
  const { authority: a, raw, native } = fixture(), view = a.view(native(1), raw);
  const b = { ...raw, settingsRevision: 1, config: { audioGain: 1.5, gainInherited: false } };
  a.beforeWrite(raw, { config: b.config, settingsRevision: 1 });
  assert.equal(a.check(view.ticket, native(1), raw).code, 'gain-conflict', 'failed storage does not resurrect old authority');
  a.beforeWrite(b, { config: raw.config, settingsRevision: 2 });
  assert.equal(a.check(view.ticket, native(1), { ...raw, settingsRevision: 2 }).code, 'gain-conflict');
});
test('unrelated edits merge while global inherited dependency and channel owned scope remain distinct', () => {
  const { authority: a, raw, native } = fixture();
  raw.mediaProfiles = { schema: 2, revision: 1, channels: [{ channelId: A, createdRevision: 1, revision: 1,
    audio: { createdRevision: 1, values: { ...audio, gainInherited: false, audioGain: 0.75 } } }], presets: [] };
  const owned = a.view(native(1), raw), globalNative = { ...native(2), route: 'https://chzzk.naver.com/video/123' };
  const global = a.view(globalNative, raw);
  const changes = { config: { ...raw.config, previewVolume: 25 }, settingsRevision: 1 };
  a.beforeWrite(raw, changes);
  assert.equal(a.check(global.ticket, globalNative, { ...raw, ...changes }).ok, true);
  const changed = { config: { ...raw.config, audioGain: 1.5 }, settingsRevision: 2 };
  a.beforeWrite({ ...raw, ...changes }, changed);
  assert.equal(a.check(global.ticket, globalNative, { ...raw, ...changed }).ok, false);
  assert.equal(a.check(owned.ticket, native(1), { ...raw, ...changed }).ok, true);
});
test('same scalar source transition domain ABA and native route epoch invalidate authority', () => {
  const { authority: a, raw, native } = fixture(), before = a.view(native(1), raw);
  a.beforeWrite(raw, { config: { ...raw.config, gainInherited: true }, settingsRevision: 1 });
  assert.equal(a.check(before.ticket, native(1), raw).ok, false);
  const next = a.view(native(1), raw); a.retireTab(1);
  assert.equal(a.check(next.ticket, native(1), raw).ok, false);
  const newer = a.view(native(1), raw);
  assert.notEqual(newer.ticket, next.ticket);
});
test('late duplicated own change notifications preserve ACK epoch; receipt64 stays busy until observed', () => {
  const { authority: a, raw, native } = fixture();
  let before = raw;
  for (let i = 0; i < 64; i++) {
    const next = { ...before, config: { audioGain: i % 2 ? 1 : 1.25, gainInherited: false }, settingsRevision: i + 1 };
    a.beforeWrite(before, { config: next.config, settingsRevision: next.settingsRevision }); before = next;
  }
  assert.throws(() => a.beforeWrite(before, { config: { audioGain: 1.5, gainInherited: false }, settingsRevision: 65 }), /gain-busy/);
  const own = a.view(native(1), before);
  const delta = { config: { oldValue: { audioGain: 1.25, gainInherited: false }, newValue: before.config },
    settingsRevision: { oldValue: 63, newValue: 64 } };
  a.observe(delta); a.observe(delta);
  assert.equal(a.check(own.ticket, native(1), before).ok, true);
  assert.doesNotThrow(() => a.beforeWrite(before, { config: { audioGain: 1.5, gainInherited: false }, settingsRevision: 65 }));
});
test('unknown external or nonmonotonic events invalidate all old authority', () => {
  const { authority: a, raw, native } = fixture(), view = a.view(native(1), raw);
  a.observe({ settingsRevision: { oldValue: 0, newValue: 0 } });
  assert.equal(a.check(view.ticket, native(1), raw).ok, false);
});

test('channel-home player Gain stays global like the F00 MAIN context; only confirmed live route owns a channel', () => {
  const { authority: a, raw, native } = fixture();
  raw.mediaProfiles = { schema: 2, revision: 1, channels: [{ channelId: A, createdRevision: 1, revision: 1,
    audio: { createdRevision: 1, values: { ...audio, audioGain: 0.75, gainInherited: false } } }], presets: [] };
  const home = a.view({ ...native(1), route: `https://chzzk.naver.com/${A}` }, raw);
  assert.equal(home.scope, 'global'); assert.equal(home.value, 1);
  assert.equal(a.view(native(2), raw).scope, 'channel');
});
test('begin intent is immutable single-flight rate limited and never replayed', () => {
  const { authority: a, raw, native, advance } = fixture(), view = a.view(native(1), raw);
  assert.equal(a.begin(view.ticket, native(1), raw, 'intent-one', 0).ok, true);
  assert.equal(a.begin(view.ticket, native(1), raw, 'intent-two', 1).code, 'gain-busy');
  a.finish(view.ticket, false);
  assert.equal(a.begin(view.ticket, native(1), raw, 'intent-one', 0).ok, false);
  advance(250);
  assert.equal(a.begin(view.ticket, native(1), raw, 'intent-two', 1).ok, false, 'failed actor requires a new view and gesture');
  assert.equal(a.view(native(1), raw).ok, true);
});

async function brokerFixture(t, raw = {}) {
  const h = settingsHarness(t, raw); await h.initialize(); await h.settle();
  const sender = { id: extensionId, frameId: 0, documentId: 'site-doc-1', origin: 'https://chzzk.naver.com',
    url: `https://chzzk.naver.com/live/${A}`, tab: { id: 7, windowId: 9, incognito: false } };
  const probe = { url: sender.url, owned: true, bindingId: 'binding-one', legacyValue: 1, intent: null };
  h.worker.window.chrome.scripting.executeScript = async options => {
    assert.deepEqual(structuredClone(options.target), { tabId: 7, frameIds: [0] });
    assert.equal(options.world, 'ISOLATED'); assert.equal(options.args, undefined);
    return [{ frameId: 0, documentId: sender.documentId, result: structuredClone(probe) }];
  };
  let n = 0;
  const send = (body, override = {}) => h.send('popup', { namespace: 'cheese-knife-player-gain', protocol: 3,
    requestId: `player-${++n}`, ...body }, { ...sender, ...override });
  return { h, sender, probe, send };
}
test('native gain namespace cannot expose catalogue and commits only the staged finite pair in the same queue', async t => {
  const { h, probe, send } = await brokerFixture(t, { config: { future: 'keep' }, other: { preserve: 1 } });
  const view = await send({ action: 'get-gain-view' });
  assert.equal(view.ok, true, view?.code); assert.equal(view.view.scope, 'global');
  assert.equal(Object.hasOwn(view, 'snapshot'), false); assert.equal(Object.hasOwn(view.view, 'store'), false);
  probe.intent = { id: 'intent-one', value: 0 };
  const reply = await send({ action: 'set-gain', ticket: view.view.ticket, intentId: 'intent-one', value: 0 });
  assert.equal(reply.ok, true, reply.code); assert.equal(reply.stored, true); assert.equal(reply.intentId, 'intent-one');
  assert.equal(h.saved.config.audioGain, 0); assert.equal(h.saved.config.gainInherited, false);
  assert.equal(h.saved.config.future, 'keep'); assert.deepEqual(h.saved.other, { preserve: 1 });
  assert.equal(Object.hasOwn(h.saved, 'mediaProfiles'), false); assert.equal(h.maxConcurrentWrites, 1);
  assert.notEqual(reply.view.ticket, view.view.ticket);
  assert.equal((await send({ action: 'set-gain', ticket: view.view.ticket, intentId: 'intent-one', value: 0 })).ok, false);
});
test('wrong sender frame document native probe synthetic intent extra keys and native replacement never write', async t => {
  const { h, probe, send, sender } = await brokerFixture(t);
  for (const override of [{ id: 'foreign' }, { frameId: 1 }, { origin: 'null' }, { tab: { ...sender.tab, incognito: true } }, { documentId: '' }]) {
    assert.equal((await send({ action: 'get-gain-view' }, override))?.ok, false);
  }
  const view = await send({ action: 'get-gain-view' }); assert.equal(view.ok, true, view?.code);
  const set = { action: 'set-gain', ticket: view.view.ticket, intentId: 'synthetic-one', value: 1.5 };
  assert.equal((await send(set)).ok, false, 'no private staged intent');
  assert.equal((await send({ ...set, channelId: A })).ok, false);
  probe.intent = { id: 'synthetic-one', value: 1.5 }; probe.owned = false;
  assert.equal((await send(set)).ok, false);
  assert.equal(h.calls.filter(row => row.kind === 'commit').length, 0);
});

test('Gain merges the final fresh unrelated raw values after native revalidation', async t => {
  const { h, probe, send, sender } = await brokerFixture(t, { config: { gainInherited: false, audioGain: 1, future: 'old' } });
  const view = await send({ action: 'get-gain-view' }); assert.equal(view.ok, true, view?.code);
  probe.intent = { id: 'fresh-one', value: 0.75 };
  let calls = 0;
  h.worker.window.chrome.scripting.executeScript = async () => {
    if (++calls === 2) { h.saved.config.previewVolume = 25; h.saved.config.future = 'new'; h.saved.settingsRevision = 1; }
    return [{ frameId: 0, documentId: sender.documentId, result: structuredClone(probe) }];
  };
  const reply = await send({ action: 'set-gain', ticket: view.view.ticket, intentId: 'fresh-one', value: 0.75 });
  assert.equal(reply.ok, true, reply.code); assert.equal(h.saved.config.previewVolume, 25);
  assert.equal(h.saved.config.future, 'new'); assert.equal(h.saved.settingsRevision, 2); assert.equal(h.saved.config.audioGain, 0.75);
});

test('all catalogue writer paths and old global source changes invalidate captured Gain tickets', async t => {
  const { h, probe, send } = await brokerFixture(t, { config: { audioGain: 1, gainInherited: false } });
  let n = 0;
  const tab = body => h.send('popup', { namespace: 'cheese-knife-settings', protocol: 3, requestId: `tab-${++n}`, ...body });
  let view = await send({ action: 'get-gain-view' }); assert.equal(view.ok, true);
  assert.equal((await tab({ action: 'enable-channel-domain', storeSchema: 2, selection: { kind: 'saved', channelId: A }, domain: 'audio',
    expectedGlobalRevision: 0, expectedMediaRevision: 0, expectedRecord: null })).ok, true);
  probe.intent = { id: 'writer-proof', value: 0.5 };
  const stale = () => send({ action: 'set-gain', ticket: view.view.ticket, intentId: 'writer-proof', value: 0.5 });
  assert.equal((await stale()).code, 'gain-conflict');
  view = await send({ action: 'get-gain-view' }); assert.equal(view.ok, true); assert.equal(view.view.scope, 'channel');
  const token = { channelId: A, recordCreatedRevision: 1, domainCreatedRevision: 1 };
  assert.equal((await tab({ action: 'patch-channel-fields', storeSchema: 2, selection: { kind: 'saved', channelId: A }, domain: 'audio', channelToken: token,
    patch: { gainInherited: true } })).ok, true);
  assert.equal((await stale()).code, 'gain-conflict');
  view = await send({ action: 'get-gain-view' }); assert.equal(view.ok, true);
  await h.patch('popup', [{ type: 'config', id: 'compressorDefault', value: true }]);
  assert.equal(view.view.origin, 'global-owned');
  const updated = await send({ action: 'get-gain-view' });
  assert.equal(updated.view.gainEpoch, view.view.gainEpoch, 'unrelated old compressor initial ON does not invalidate Gain');
  view = updated;
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal((await tab({ action: 'create-preset', storeSchema: 2, id, expectedMediaRevision: 2,
    domain: 'audio', name: 'Owned', values: { ...audio, audioGain: 0.25, gainInherited: false } })).ok, true);
  assert.equal((await tab({ action: 'apply-preset-global', storeSchema: 2, presetToken: { id, createdRevision: 3, revision: 1 }, expectedGlobalRevision: 1 })).ok, true);
  assert.equal((await stale()).code, 'gain-conflict');
  view = await send({ action: 'get-gain-view' }); assert.equal(view.view.value, 0.25);
  assert.equal((await tab({ action: 'reset-channel-domain', storeSchema: 2, selection: { kind: 'saved', channelId: A }, domain: 'audio',
    recordCreatedRevision: 1, domainCreatedRevision: 1, expectedRecordRevision: 2 })).ok, true);
  const afterReset = await send({ action: 'get-gain-view' }); assert.equal(afterReset.view.scope, 'global');
  assert.notEqual(afterReset.view.ticket, view.view.ticket);
  assert.equal((await tab({ action: 'enable-channel-domain', storeSchema: 2, selection: { kind: 'saved', channelId: A }, domain: 'audio',
    expectedGlobalRevision: 2, expectedMediaRevision: 4, expectedRecord: null })).ok, true);
  view = await send({ action: 'get-gain-view' }); assert.equal(view.view.scope, 'channel');
  assert.equal((await tab({ action: 'delete-channel', storeSchema: 2, selection: { kind: 'saved', channelId: A },
    recordCreatedRevision: 5, expectedRecordRevision: 1 })).ok, true);
  assert.equal((await stale()).code, 'gain-conflict');
});

test('two player native validations share the four-second request budget and never write after exhaustion', async t => {
  const { h, probe, send, sender } = await brokerFixture(t);
  const view = await send({ action: 'get-gain-view' }); assert.equal(view.ok, true);
  probe.intent = { id: 'budget-one', value: 1.25 };
  let time = 0;
  h.worker.window.Date.now = () => time;
  h.worker.window.chrome.scripting.executeScript = async () => {
    time += 2001;
    return [{ frameId: 0, documentId: sender.documentId, result: structuredClone(probe) }];
  };
  const reply = await send({ action: 'set-gain', ticket: view.view.ticket, intentId: 'budget-one', value: 1.25 });
  assert.equal(reply.code, 'native-read-timeout'); assert.equal(h.calls.filter(row => row.kind === 'commit').length, 0);
});
