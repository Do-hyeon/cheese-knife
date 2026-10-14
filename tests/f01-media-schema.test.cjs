const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const P = '11111111-1111-4111-8111-111111111111';
const legacy = { compressorDefault: true, compressorThreshold: -50, compressorKnee: 40,
  compressorRatio: 12, compressorAttack: 0, compressorRelease: 0.25 };
const video = { brightness: 1, contrast: 1, saturation: 1, gamma: 1, sharpness: 0 };
const audio = { audioDefault: true, compressorEnabled: true, compressorThreshold: -50, compressorKnee: 40,
  compressorRatio: 12, compressorAttack: 0, compressorRelease: 0.25, audioGain: 1, gainInherited: true,
  eqEnabled: false, eq63: 0, eq125: 0, eq250: 0, eq500: 0, eq1000: 0, eq2000: 0, eq4000: 0, eq8000: 0,
  normalizerEnabled: false, normalizerTargetDbfs: -20 };
const plain = value => JSON.parse(JSON.stringify(value));
function moduleUnderTest() {
  const realm = vm.createContext({ TextEncoder });
  vm.runInContext(fs.readFileSync('media-profiles.js', 'utf8'), realm);
  return realm.KnifeMediaProfiles;
}
const v1 = () => ({ schema: 1, revision: 5,
  channels: [{ channelId: A, createdRevision: 1, revision: 2,
    audio: { createdRevision: 3, values: { ...legacy } }, video: { createdRevision: 1, values: { ...video } } }],
  presets: [{ id: P, createdRevision: 2, revision: 1, domain: 'audio', name: '음성', values: { ...legacy } }] });
const v2 = () => ({ schema: 2, revision: 5,
  channels: [{ channelId: A, createdRevision: 1, revision: 2,
    audio: { createdRevision: 3, values: { ...audio } }, video: { createdRevision: 1, values: { ...video } } }],
  presets: [{ id: P, createdRevision: 2, revision: 1, domain: 'audio', name: '음성', values: { ...audio } }] });

test('v1 projection inherits Gain and leaves new effects disabled without mutating raw', () => {
  const mod = moduleUnderTest(), raw = v1(), before = JSON.stringify(raw);
  assert.equal(typeof mod.projectAudioV2, 'function', 'schema2 projection must exist');
  assert.deepEqual(plain(mod.projectAudioV2(legacy)), audio);
  const resolved = mod.resolveMediaSettings({ ...legacy, audioDefault: false }, mod.readStore(raw),
    { channelId: A, topFrame: true, incognito: false });
  assert.equal(resolved.effectiveConfig.audioDefault, true);
  assert.equal(resolved.effectiveConfig.gainInherited, true);
  assert.equal(resolved.effectiveConfig.eqEnabled, false);
  assert.equal(resolved.effectiveConfig.normalizerEnabled, false);
  assert.equal(resolved.gainOrigin, 'site-legacy');
  assert.equal(JSON.stringify(raw), before);
});

test('absent is logical schema2 and repeated reads never create or mutate a store', () => {
  const mod = moduleUnderTest();
  for (let i = 0; i < 3; i++) assert.deepEqual(plain(mod.readStore(undefined)),
    { state: 'absent', store: { schema: 2, revision: 0, channels: [], presets: [] } });
  const raw = v1(), before = JSON.stringify(raw);
  for (let i = 0; i < 3; i++) assert.equal(mod.readStore(raw).state, 'valid');
  assert.equal(JSON.stringify(raw), before);
});

test('schema2 exact scalar validation accepts zero and preserves finite fractional values', () => {
  const mod = moduleUnderTest(), raw = v2();
  raw.channels[0].audio.values.audioGain = 0;
  raw.channels[0].audio.values.gainInherited = false;
  raw.channels[0].audio.values.eq2000 = 2.125;
  const read = mod.readStore(raw);
  assert.equal(read.state, 'valid');
  assert.equal(read.store.channels[0].audio.values.audioGain, 0);
  assert.equal(read.store.channels[0].audio.values.eq2000, 2.125);
  raw.channels[0].audio.values.eq2000 = 4;
  assert.equal(read.store.channels[0].audio.values.eq2000, 2.125, 'reader must detach scalar records');
});

test('schema2 rejects nonfinite bounds unknown scalar keys and getters without invoking them', () => {
  const mod = moduleUnderTest();
  for (const [key, value] of [['audioGain', NaN], ['audioGain', Infinity], ['audioGain', -0.01],
    ['audioGain', 2.01], ['eq63', -6.01], ['eq8000', 6.01], ['normalizerTargetDbfs', -31],
    ['normalizerTargetDbfs', -11], ['compressorEnabled', 1], ['gainInherited', null], ['compressorDefault', false]]) {
    const raw = v2(); raw.channels[0].audio.values[key] = value;
    assert.equal(mod.readStore(raw).state, 'invalid', key);
  }
  let calls = 0;
  const raw = v2(); Object.defineProperty(raw.channels[0].audio.values, 'audioGain', {
    enumerable: true, get() { calls++; throw Error('must not run'); } });
  assert.equal(mod.readStore(raw).state, 'invalid'); assert.equal(calls, 0);
  assert.equal(mod.readStore({ ...v2(), schema: 3 }).state, 'unsupported');
});

test('explicit v1 upgrade preserves identity video and creation tokens and increments revisions once', () => {
  const mod = moduleUnderTest(), raw = v1(), before = JSON.stringify(raw);
  assert.equal(typeof mod.upgradeMediaStore, 'function');
  const upgraded = mod.upgradeMediaStore(raw, 5);
  assert.equal(upgraded.ok, true, upgraded.code);
  const store = plain(upgraded.nextStore);
  assert.equal(store.schema, 2); assert.equal(store.revision, 6);
  assert.deepEqual(store.channels[0], { channelId: A, createdRevision: 1, revision: 3,
    audio: { createdRevision: 3, values: audio }, video: { createdRevision: 1, values: video } });
  assert.deepEqual(store.presets[0], { id: P, createdRevision: 2, revision: 2,
    domain: 'audio', name: '음성', values: audio });
  assert.equal(JSON.stringify(raw), before);
});

test('upgrade rejects absent unsupported malformed conflict overflow and never edits its input', () => {
  const mod = moduleUnderTest();
  assert.equal(typeof mod.upgradeMediaStore, 'function');
  for (const [raw, expected] of [[undefined, 0], [v2(), 5], [{ ...v1(), schema: 3 }, 5],
    [{ ...v1(), revision: '5' }, 5], [v1(), 4]]) assert.equal(mod.upgradeMediaStore(raw, expected).ok, false);
  const raw = v1(); raw.revision = Number.MAX_SAFE_INTEGER;
  const before = JSON.stringify(raw);
  assert.equal(mod.upgradeMediaStore(raw, Number.MAX_SAFE_INTEGER).ok, false);
  assert.equal(JSON.stringify(raw), before);
  const record = v1(); record.revision = Number.MAX_SAFE_INTEGER;
  record.channels[0].revision = Number.MAX_SAFE_INTEGER;
  assert.equal(mod.upgradeMediaStore(record, Number.MAX_SAFE_INTEGER).ok, false);
});

test('global canonical default ignores an unknown audioDefault and channel Gain inheritance follows source', () => {
  const mod = moduleUnderTest(), raw = v2();
  const global = { ...legacy, compressorDefault: false, audioDefault: true, audioGain: 0.75, gainInherited: false };
  const resolved = mod.resolveMediaSettings(global, mod.readStore(raw), { channelId: A, topFrame: true, incognito: false });
  assert.equal(resolved.effectiveConfig.audioDefault, true, 'channel owns its initial ON');
  assert.equal(resolved.effectiveConfig.audioGain, 0.75);
  assert.equal(resolved.gainOrigin, 'global-owned');
  const base = mod.resolveMediaSettings(global, mod.readStore(undefined), { channelId: null, topFrame: true, incognito: false });
  assert.equal(base.effectiveConfig.audioDefault, false, 'compressorDefault is canonical globally');
  raw.channels[0].audio.values.audioGain = 0; raw.channels[0].audio.values.gainInherited = false;
  const owned = mod.resolveMediaSettings(global, mod.readStore(raw), { channelId: A, topFrame: true, incognito: false });
  assert.equal(owned.effectiveConfig.audioGain, 0); assert.equal(owned.gainOrigin, 'channel-owned');
});

test('inherited audio preset preserves destination Gain pair while owned preset copies it', () => {
  const mod = moduleUnderTest();
  assert.equal(typeof mod.copyAudioPreset, 'function');
  const destination = { ...audio, audioGain: 0, gainInherited: false };
  assert.deepEqual(plain(mod.copyAudioPreset(audio, destination)), destination);
  assert.equal(mod.copyAudioPreset({ ...audio, audioGain: 1.2345, gainInherited: false }, destination).audioGain, 1.2345);
});

test('global initial ON alias commits only compressorDefault and preserves unknown raw keys', () => {
  const realm = vm.createContext({ TextEncoder, URL });
  for (const file of ['media-profiles.js', 'config.js', 'style-schema.js', 'settings-contract.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), realm);
  }
  const raw = { config: { compressorDefault: false, audioDefault: 'unknown raw', future: { x: 1 } }, settingsRevision: 7 };
  assert.equal(realm.KnifeSettingsContract.validateOperations([{ type: 'config', id: 'audioDefault', value: true }]).ok, true);
  const next = realm.KnifeSettingsContract.mergeOperations(raw, [{ type: 'config', id: 'audioDefault', value: true }]);
  assert.deepEqual(plain(next.changes), { config: { compressorDefault: true, audioDefault: 'unknown raw', future: { x: 1 } }, settingsRevision: 8 });
  assert.equal(raw.config.compressorDefault, false);
  assert.equal(realm.KnifeSettingsContract.validateOperations([
    { type: 'config', id: 'audioDefault', value: true }, { type: 'config', id: 'compressorDefault', value: false }]).ok, false);
  const duplicate = realm.KnifeSettingsContract.mergeOperations(raw, [
    { type: 'config', id: 'compressorDefault', value: true }, { type: 'config', id: 'compressorDefault', value: false }]);
  assert.deepEqual(plain(duplicate.changes), {}, 'one canonical name retains existing ordered patch semantics');
});
