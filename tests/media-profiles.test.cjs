const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const P = '11111111-1111-4111-8111-111111111111';
const audio = { compressorDefault: false, compressorThreshold: -50, compressorKnee: 40,
  compressorRatio: 12, compressorAttack: 0, compressorRelease: 0.25 };
const video = { brightness: 1, contrast: 1, saturation: 1, gamma: 1, sharpness: 0 };
const empty = () => ({ schema: 1, revision: 0, channels: [], presets: [] });
const base = { ...audio, ...video, previewVolume: 5, arrowSeek: true };
const globals = { config: base, revision: 4 };
const selection = channelId => ({ kind: 'saved', channelId });
const token = channelId => ({ channelId, recordCreatedRevision: 1, domainCreatedRevision: 1 });
const plain = value => JSON.parse(JSON.stringify(value));
function moduleUnderTest() {
  assert.ok(fs.existsSync('media-profiles.js'), 'generated pure media contract must exist');
  const realm = vm.createContext({ TextEncoder });
  vm.runInContext(fs.readFileSync('media-profiles.js', 'utf8'), realm);
  assert.equal(typeof realm.KnifeMediaProfiles?.readStore, 'function');
  return realm.KnifeMediaProfiles;
}
function committed(mod, store, request) {
  const result = mod.mergeMediaOperation(store, request, globals);
  assert.equal(result.ok, true, result.code);
  return result.nextStore || store;
}
function savedAudio() {
  return { schema: 1, revision: 1, channels: [{ channelId: A, createdRevision: 1, revision: 1,
    audio: { createdRevision: 1, values: { ...audio } } }], presets: [] };
}

test('absent media reads without IO or CONFIGS and defaults remain literal', () => {
  const mod = moduleUnderTest(), raw = undefined;
  assert.deepEqual(plain(mod.readStore(raw)), { state: 'absent', store: empty() });
  assert.deepEqual(Object.fromEntries(mod.audioFields.map(f => [f.id, f.defaultValue])), audio);
  assert.deepEqual(Object.fromEntries(mod.videoFields.map(f => [f.id, f.defaultValue])), video);
  assert.equal(raw, undefined);
});

test('complete domain values preserve normal decimals but reject coercion and foreign fields', () => {
  const mod = moduleUnderTest();
  assert.equal(mod.validateValues('audio', { ...audio, compressorRatio: 12.125 }).ok, true);
  assert.equal(mod.validateValues('video', { ...video, brightness: 0.125 }).ok, true);
  for (const bad of [{ ...video, brightness: '2' }, { ...video, brightness: NaN },
    { ...video, gamma: Infinity }, { brightness: 1 }, { ...video, previewVolume: 5 },
    { ...video, brightness: -1 }, { ...video, brightness: 3.001 }]) {
    assert.equal(mod.validateValues('video', bad).ok, false);
  }
  for (const [field, value] of [['compressorThreshold', -101], ['compressorKnee', 41],
    ['compressorRatio', 0], ['compressorAttack', 1.01], ['compressorRelease', -0.01],
    ['compressorDefault', 1]]) assert.equal(mod.validateValues('audio', { ...audio, [field]: value }).ok, false);
});

test('channel domains are independent and all non-media values remain global', () => {
  const mod = moduleUnderTest(), raw = savedAudio();
  raw.revision = 2;
  raw.channels.push({ channelId: B, createdRevision: 2, revision: 1,
    video: { createdRevision: 2, values: { ...video, brightness: 2 } } });
  const before = plain(raw);
  const resolved = mod.resolveMediaSettings({ ...base, compressorDefault: true }, mod.readStore(raw),
    { channelId: B, topFrame: true, incognito: false });
  assert.equal(resolved.effectiveConfig.brightness, 2);
  assert.equal(resolved.effectiveConfig.previewVolume, 5);
  assert.equal(resolved.effectiveConfig.compressorDefault, true);
  const a = mod.resolveMediaSettings({ ...base, compressorDefault: true }, mod.readStore(raw),
    { channelId: A, topFrame: true, incognito: false });
  assert.equal(a.effectiveConfig.compressorDefault, false);
  assert.equal(a.effectiveConfig.brightness, 1);
  assert.deepEqual(raw, before);
});

test('frame incognito unknown owner and malformed media use global projection without repair writes', () => {
  const mod = moduleUnderTest(), raw = savedAudio(), before = plain(raw);
  for (const context of [{ channelId: A, topFrame: false, incognito: false },
    { channelId: A, topFrame: true, incognito: true }, { channelId: null, topFrame: true, incognito: false }]) {
    assert.deepEqual(plain(mod.resolveMediaSettings(base, mod.readStore(raw), context).effectiveConfig), base);
  }
  for (const invalid of [null, { ...raw, schema: 2 }, { ...raw, revision: '1' }]) {
    const resolved = mod.resolveMediaSettings(base, mod.readStore(invalid), { channelId: A, topFrame: true, incognito: false });
    assert.deepEqual(plain(resolved.effectiveConfig), base);
    assert.equal(resolved.profileState, 'repair-required');
  }
  assert.deepEqual(raw, before);
});

test('media validator rejects empty records duplicate identities unsafe counters and accessors', () => {
  const mod = moduleUnderTest(), good = savedAudio();
  for (const bad of [{ ...good, channels: [...good.channels, ...good.channels] },
    { ...good, channels: [{ channelId: A, createdRevision: 1, revision: 1 }] },
    { ...good, revision: Number.MAX_SAFE_INTEGER + 1 }, { ...good, revision: -1 },
    { ...good, channels: [{ ...good.channels[0], createdRevision: 2 }] },
    { ...good, extra: 'x'.repeat(262144) }]) assert.equal(mod.readStore(bad).state, 'invalid');
  let invoked = 0;
  const accessor = { ...good };
  Object.defineProperty(accessor, 'revision', { enumerable: true, get() { invoked++; return 1; } });
  assert.equal(mod.readStore(accessor).state, 'invalid');
  assert.equal(invoked, 0);
  const values = { ...video };
  Object.defineProperty(values, 'brightness', { enumerable: true, get() { invoked++; return 1; } });
  assert.equal(mod.validateValues('video', values).ok, false);
  assert.equal(invoked, 0);
});

test('channel limit accepts128 rejects129 without eviction', () => {
  const mod = moduleUnderTest();
  const rows = Array.from({ length: 129 }, (_, i) => ({ channelId: i.toString(16).padStart(32, '0'),
    createdRevision: 1, revision: 1, audio: { createdRevision: 1, values: { ...audio } } }));
  assert.equal(mod.readStore({ schema: 1, revision: 1, channels: rows.slice(0, 128), presets: [] }).state, 'valid');
  assert.equal(mod.readStore({ schema: 1, revision: 1, channels: rows, presets: [] }).state, 'invalid');
});

test('preset limits enforce64 total Unicode codepoint UTF8 and control character names', () => {
  const mod = moduleUnderTest();
  const rows = Array.from({ length: 65 }, (_, i) => ({ id: `${i.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
    createdRevision: 1, revision: 1, domain: 'video', name: '😀'.repeat(48), values: { ...video } }));
  const store = { schema: 1, revision: 1, channels: [], presets: rows.slice(0, 64) };
  assert.equal(mod.readStore(store).state, 'valid');
  assert.equal(mod.readStore({ ...store, presets: rows }).state, 'invalid');
  for (const name of ['😀'.repeat(49), 'a'.repeat(49), '', '   ', '\u202eLabel', 'A\nB', '\u0000']) {
    assert.equal(mod.readStore({ ...store, presets: [{ ...rows[0], name }] }).state, 'invalid');
  }
  assert.equal(mod.readStore({ ...store, presets: [rows[0], rows[0]] }).state, 'invalid');
});

test('enable copies complete current global domain only on explicit matching revisions', () => {
  const mod = moduleUnderTest(), raw = empty(), before = plain(raw);
  const request = { action: 'enable-channel-domain', selection: selection(A), domain: 'audio',
    expectedGlobalRevision: 4, expectedMediaRevision: 0, expectedRecord: null };
  const next = committed(mod, raw, request);
  assert.deepEqual(plain(next), savedAudio());
  assert.deepEqual(raw, before);
  assert.equal(mod.mergeMediaOperation(raw, { ...request, expectedGlobalRevision: 3 }, globals).code, 'conflict');
  assert.equal(mod.mergeMediaOperation(raw, { ...request, expectedMediaRevision: 1 }, globals).code, 'conflict');
  assert.equal(mod.mergeMediaOperation(next, request, globals).changed, false, 'lost initial ACK confirms exact original token only');
});

test('different field patches merge with no-op revisions and obsolete tokens fail', () => {
  const mod = moduleUnderTest();
  const request = { action: 'patch-channel-fields', selection: selection(A), channelToken: token(A),
    domain: 'audio', patch: { compressorThreshold: -40 } };
  let store = committed(mod, savedAudio(), request);
  store = committed(mod, store, { ...request, patch: { compressorRatio: 10.5 } });
  assert.equal(store.channels[0].audio.values.compressorThreshold, -40);
  assert.equal(store.channels[0].audio.values.compressorRatio, 10.5);
  assert.equal(store.revision, 3);
  assert.equal(store.channels[0].revision, 3);
  const unchanged = mod.mergeMediaOperation(store, { ...request, patch: { compressorThreshold: -40 } }, globals);
  assert.equal(unchanged.changed, false);
  assert.deepEqual(plain(unchanged.nextStore), plain(store));
  assert.equal(mod.mergeMediaOperation(store, { ...request, channelToken: { ...token(A), domainCreatedRevision: 2 } }, globals).code, 'conflict');
  assert.equal(mod.mergeMediaOperation(store, { ...request, patch: { previewVolume: 25 } }, globals).ok, false);
});

test('reset removes only the selected domain and stale edits cannot recreate it', () => {
  const mod = moduleUnderTest();
  let store = committed(mod, savedAudio(), { action: 'enable-channel-domain', selection: selection(A), domain: 'video',
    expectedGlobalRevision: 4, expectedMediaRevision: 1, expectedRecord: { createdRevision: 1, revision: 1 } });
  store = committed(mod, store, { action: 'reset-channel-domain', selection: selection(A), domain: 'audio',
    recordCreatedRevision: 1, domainCreatedRevision: 1, expectedRecordRevision: 2 });
  assert.equal(store.channels[0].audio, undefined);
  assert.deepEqual(plain(store.channels[0].video.values), video);
  assert.equal(mod.mergeMediaOperation(store, { action: 'patch-channel-fields', selection: selection(A), domain: 'audio',
    channelToken: token(A), patch: { compressorThreshold: -40 } }, globals).code, 'conflict');
  store = committed(mod, store, { action: 'reset-channel-domain', selection: selection(A), domain: 'video',
    recordCreatedRevision: 1, domainCreatedRevision: 2, expectedRecordRevision: 3 });
  assert.deepEqual(plain(store.channels), []);
});

test('preset apply copies values and rejects deleted-recreated source with same UUID and revision', () => {
  const mod = moduleUnderTest();
  let store = committed(mod, savedAudio(), { action: 'create-preset', id: P, expectedMediaRevision: 1,
    domain: 'audio', name: 'Quiet', values: { ...audio, compressorThreshold: -35 } });
  const presetToken = { id: P, createdRevision: 2, revision: 1 };
  const apply = { action: 'replace-channel-domain', selection: selection(A), domain: 'audio', channelToken: token(A),
    expectedRecordRevision: 1, presetToken };
  store = committed(mod, store, apply);
  assert.equal(store.channels[0].audio.values.compressorThreshold, -35);
  store = committed(mod, store, { action: 'edit-preset', id: P, createdRevision: 2, domain: 'audio',
    patch: { compressorThreshold: -20 }, name: 'Changed' });
  assert.equal(store.channels[0].audio.values.compressorThreshold, -35);
  store = committed(mod, store, { action: 'delete-preset', presetToken: { ...presetToken, revision: 2 } });
  store = committed(mod, store, { action: 'create-preset', id: P, expectedMediaRevision: 5,
    domain: 'audio', name: 'Quiet', values: { ...audio, compressorThreshold: -35 } });
  assert.equal(store.presets[0].revision, 1);
  assert.equal(store.presets[0].createdRevision, 6);
  assert.equal(mod.mergeMediaOperation(store, { ...apply, expectedRecordRevision: 2 }, globals).code, 'conflict');
  assert.equal(mod.mergeMediaOperation(store, { action: 'apply-preset-global', presetToken, expectedGlobalRevision: 4 }, globals).code, 'conflict');
});

test('preset create unknown ACK cannot confirm changed or recreated records from equal values', () => {
  const mod = moduleUnderTest(), create = { action: 'create-preset', id: P, expectedMediaRevision: 0,
    domain: 'video', name: 'Neutral', values: { ...video } };
  let store = committed(mod, empty(), create);
  assert.equal(mod.mergeMediaOperation(store, create, globals).changed, false);
  store = committed(mod, store, { action: 'edit-preset', id: P, createdRevision: 1, name: 'Renamed' });
  assert.equal(mod.mergeMediaOperation(store, create, globals).code, 'conflict');
  store = committed(mod, store, { action: 'delete-preset', presetToken: { id: P, createdRevision: 1, revision: 2 } });
  store = committed(mod, store, { ...create, expectedMediaRevision: 3 });
  assert.equal(mod.mergeMediaOperation(store, create, globals).code, 'conflict');
});

test('global preset apply emits existing field operations without a media write', () => {
  const mod = moduleUnderTest();
  const store = { schema: 1, revision: 1, channels: [], presets: [{ id: P, createdRevision: 1,
    revision: 1, domain: 'video', name: 'Bright', values: { ...video, brightness: 2 } }] };
  const result = mod.mergeMediaOperation(store, { action: 'apply-preset-global', expectedGlobalRevision: 4,
    presetToken: { id: P, createdRevision: 1, revision: 1 } }, globals);
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.globalOperations.length, 5);
  assert.deepEqual(plain(result.globalOperations.find(op => op.id === 'brightness')), { type: 'config', id: 'brightness', value: 2 });
  assert.equal(result.globalOperations.some(op => op.id === 'previewVolume'), false);
  assert.deepEqual(plain(result.nextStore), store);
});

test('safe integer exhaustion blocks actual changes while equal values remain a no-op', () => {
  const mod = moduleUnderTest(), store = savedAudio(); store.revision = Number.MAX_SAFE_INTEGER;
  const request = { action: 'patch-channel-fields', selection: selection(A), domain: 'audio', channelToken: token(A), patch: {} };
  assert.equal(mod.mergeMediaOperation(store, request, globals).changed, false);
  assert.equal(mod.mergeMediaOperation(store, { ...request, patch: { compressorThreshold: -40 } }, globals).code, 'revision-exhausted');
  assert.equal(store.channels[0].audio.values.compressorThreshold, -50);
});

test('unknown ACK for enabling the other domain confirms only its original creation', () => {
  const mod = moduleUnderTest(), request = { action: 'enable-channel-domain', selection: selection(A), domain: 'video',
    expectedGlobalRevision: 4, expectedMediaRevision: 1, expectedRecord: { createdRevision: 1, revision: 1 } };
  let store = committed(mod, savedAudio(), request);
  const acknowledgement = mod.mergeMediaOperation(store, request, globals);
  assert.equal(acknowledgement.ok, true);
  assert.equal(acknowledgement.changed, false);
  assert.deepEqual(plain(acknowledgement.channelToken), { channelId: A, recordCreatedRevision: 1, domainCreatedRevision: 2 });
  store = committed(mod, store, { action: 'reset-channel-domain', selection: selection(A), domain: 'video',
    recordCreatedRevision: 1, domainCreatedRevision: 2, expectedRecordRevision: 2 });
  store = committed(mod, store, { ...request, expectedMediaRevision: 3, expectedRecord: { createdRevision: 1, revision: 3 } });
  assert.equal(mod.mergeMediaOperation(store, request, globals).code, 'conflict');
});

test('delete-recreate channel and reset-recreate domain reject late edits independently', () => {
  const mod = moduleUnderTest();
  let store = committed(mod, savedAudio(), { action: 'delete-channel', selection: selection(A), recordCreatedRevision: 1, expectedRecordRevision: 1 });
  store = committed(mod, store, { action: 'enable-channel-domain', selection: selection(A), domain: 'audio',
    expectedGlobalRevision: 4, expectedMediaRevision: 2, expectedRecord: null });
  assert.equal(store.channels[0].createdRevision, 3);
  assert.equal(mod.mergeMediaOperation(store, { action: 'patch-channel-fields', selection: selection(A), domain: 'audio',
    channelToken: token(A), patch: { compressorThreshold: -35 } }, globals).code, 'conflict');
  assert.equal(mod.mergeMediaOperation(store, { action: 'delete-channel', selection: selection(A), recordCreatedRevision: 1, expectedRecordRevision: 1 }, globals).code, 'conflict');
  assert.equal(store.channels.length, 1);
});

test('full domain replacement requires fresh record revision and exact complete values', () => {
  const mod = moduleUnderTest(), store = savedAudio();
  const request = { action: 'replace-channel-domain', selection: selection(A), domain: 'audio', channelToken: token(A),
    expectedRecordRevision: 1, values: { ...audio, compressorRatio: 8.125 } };
  assert.equal(mod.mergeMediaOperation(store, { ...request, expectedRecordRevision: 0 }, globals).code, 'conflict');
  assert.equal(mod.mergeMediaOperation(store, { ...request, values: { compressorRatio: 8 } }, globals).ok, false);
  const next = committed(mod, store, request);
  assert.equal(next.channels[0].audio.values.compressorRatio, 8.125);
  assert.equal(next.channels[0].audio.values.compressorRelease, 0.25);
  assert.equal(store.channels[0].revision, 1);
});

test('combined legal caps stay below item byte budget and adding a129th channel never evicts', () => {
  const mod = moduleUnderTest();
  const store = { schema: 1, revision: 1,
    channels: Array.from({ length: 128 }, (_, i) => ({ channelId: i.toString(16).padStart(32, '0'), createdRevision: 1, revision: 1,
      audio: { createdRevision: 1, values: { ...audio } }, video: { createdRevision: 1, values: { ...video } } })),
    presets: Array.from({ length: 64 }, (_, i) => ({ id: `${i.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
      createdRevision: 1, revision: 1, domain: 'audio', name: '😀'.repeat(48), values: { ...audio } })) };
  const before = plain(store);
  assert.ok(Buffer.byteLength('mediaProfiles') + Buffer.byteLength(JSON.stringify(store)) < 262144);
  assert.equal(mod.readStore(store).state, 'valid');
  assert.equal(mod.mergeMediaOperation(store, { action: 'enable-channel-domain', selection: selection(A), domain: 'audio',
    expectedGlobalRevision: 4, expectedMediaRevision: 1, expectedRecord: null }, globals).code, 'media-limit');
  assert.deepEqual(store, before);
});
