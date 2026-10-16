const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsHarness, extensionId, getURL } = require('./settings-fixture.cjs');
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const P = '11111111-1111-4111-8111-111111111111';
const legacy = { compressorDefault: false, compressorThreshold: -50, compressorKnee: 40,
  compressorRatio: 12, compressorAttack: 0, compressorRelease: 0.25 };
const audio = { audioDefault: false, compressorEnabled: true, compressorThreshold: -50, compressorKnee: 40,
  compressorRatio: 12, compressorAttack: 0, compressorRelease: 0.25, audioGain: 1, gainInherited: true,
  eqEnabled: false, eq63: 0, eq125: 0, eq250: 0, eq500: 0, eq1000: 0, eq2000: 0, eq4000: 0, eq8000: 0,
  normalizerEnabled: false, normalizerTargetDbfs: -20 };
const selection = { kind: 'global' };
const v1 = () => ({ schema: 1, revision: 1, channels: [{ channelId: A, createdRevision: 1, revision: 1,
  audio: { createdRevision: 1, values: { ...legacy } } }], presets: [] });
let sequence = 0;
const send = (h, body, sender) => h.send('popup', { namespace: 'cheese-knife-settings', protocol: 3,
  requestId: `f01-${++sequence}`, ...body }, sender);
const writes = h => h.calls.filter(item => item.kind === 'commit');
async function fresh(t, raw = {}) { const h = settingsHarness(t, raw); await h.initialize(); await h.settle(); return h; }

test('upgrade is explicit and unknown is not success', async t => {
  const raw = { mediaProfiles: v1(), config: { future: 'keep' }, other: { preserved: true } }, h = await fresh(t, raw);
  const read = await send(h, { action: 'get-media-snapshot', selection });
  assert.equal(read.ok, true, read.code); assert.equal(read.protocol, 3);
  assert.equal(read.snapshot.store.schema, 1); assert.equal(read.snapshot.values.audio.eqEnabled, false);
  assert.equal((await send(h, { action: 'create-preset', storeSchema: 1, id: P, expectedMediaRevision: 1,
    domain: 'audio', name: 'Test', values: audio })).code, 'media-upgrade-required');
  assert.equal((await send(h, { action: 'upgrade-media-store', storeSchema: 1, expectedMediaRevision: 0 })).code, 'conflict');
  assert.equal(writes(h).length, 0); assert.deepEqual(h.saved, raw);
  const gate = h.holdNext('write-result');
  const pending = send(h, { action: 'upgrade-media-store', storeSchema: 1, expectedMediaRevision: 1 });
  await gate.reached; gate.fail();
  const lost = await pending;
  assert.equal(lost.ok, false); assert.equal(lost.stored, false); assert.equal(lost.code, 'storage-write-failed');
  assert.equal(h.saved.mediaProfiles.schema, 2); assert.equal(h.saved.mediaProfiles.revision, 2);
  assert.equal(writes(h).length, 1); assert.deepEqual(Object.keys(writes(h)[0].args.value), ['mediaProfiles']);
  assert.equal((await send(h, { action: 'upgrade-media-store', storeSchema: 1, expectedMediaRevision: 1 })).code, 'conflict');
  const again = await send(h, { action: 'get-media-snapshot', selection });
  assert.equal(again.stored, false, 'read does not certify the lost mutation');
  assert.deepEqual(h.saved.config, raw.config); assert.deepEqual(h.saved.other, raw.other);
});

test('absent upgrade does not write; global Gain saves only config and revision; first catalogue uses schema2', async t => {
  const h = await fresh(t, { config: { audioDefault: 'unknown', future: 42 } });
  assert.equal((await send(h, { action: 'upgrade-media-store', storeSchema: 1, expectedMediaRevision: 0 })).ok, false);
  assert.equal(writes(h).length, 0);
  assert.equal((await send(h, { action: 'patch-global-fields', storeSchema: 2, domain: 'audio',
    expectedGlobalRevision: 0, patch: { audioGain: 0 } })).ok, true);
  assert.equal(h.saved.config.audioGain, 0); assert.equal(h.saved.config.gainInherited, false);
  assert.equal(h.saved.config.audioDefault, 'unknown'); assert.equal(h.saved.config.future, 42);
  assert.equal(Object.hasOwn(h.saved, 'mediaProfiles'), false);
  assert.deepEqual(Object.keys(writes(h)[0].args.value).sort(), ['config', 'settingsRevision']);
  assert.equal((await send(h, { action: 'create-preset', storeSchema: 2, id: P, expectedMediaRevision: 0,
    domain: 'audio', name: 'Test', values: { ...audio, audioGain: 0, gainInherited: false } })).ok, true);
  assert.equal(h.saved.mediaProfiles.schema, 2); assert.equal(h.saved.mediaProfiles.presets.length, 1);
});

test('own protocol3 requires TAB; unknown keys iframe incognito and obsolete schema fail with no write', async t => {
  const h = await fresh(t), request = { action: 'patch-global-fields', storeSchema: 2, domain: 'audio', expectedGlobalRevision: 0, patch: { audioGain: 1.25 } };
  assert.equal((await send(h, request, { id: extensionId, url: getURL('popup.html') })).ok, false);
  assert.equal((await send(h, { ...request, selector: 'video' })).ok, false);
  const sender = { id: extensionId, url: getURL('popup.html'), frameId: 2, documentId: 'invalid' };
  assert.equal((await send(h, request, sender)).ok, false);
  const context = [...h.contexts.values()][0]; context.incognito = true;
  assert.equal((await send(h, request, { ...sender, frameId: 0, documentId: context.documentId })).ok, false);
  assert.equal(writes(h).length, 0);
});

test('schema2 independent field edits preserve other effects video unknown globals and share one queue', async t => {
  const h = await fresh(t, { other: 'keep' });
  const enabled = await send(h, { action: 'enable-channel-domain', storeSchema: 2, selection: { kind: 'saved', channelId: A },
    domain: 'audio', expectedGlobalRevision: 0, expectedMediaRevision: 0, expectedRecord: null });
  assert.equal(enabled.ok, true, enabled.code);
  const token = { channelId: A, recordCreatedRevision: 1, domainCreatedRevision: 1 };
  const patch = values => send(h, { action: 'patch-channel-fields', storeSchema: 2, selection: { kind: 'saved', channelId: A },
    domain: 'audio', channelToken: token, patch: values });
  assert.ok((await Promise.all([patch({ eq500: 1.2345 }), patch({ audioGain: 0 })])).every(reply => reply.ok));
  const values = h.saved.mediaProfiles.channels[0].audio.values;
  assert.equal(values.eq500, 1.2345); assert.equal(values.audioGain, 0); assert.equal(values.gainInherited, false);
  assert.equal(values.compressorRatio, 12); assert.equal(h.saved.other, 'keep'); assert.equal(h.maxConcurrentWrites, 1);
});

test('legacy Gain read and import validate native document and fresh value without touching site storage', async t => {
  const h = await fresh(t, { config: { future: 'keep' } });
  const api = h.worker.window.chrome;
  let documentId = 'site-doc-1', value = 0.625, calls = 0;
  api.scripting.executeScript = async options => {
    assert.deepEqual(structuredClone(options.target), { tabId: 7, frameIds: [0] });
    assert.equal(options.world, 'ISOLATED'); assert.equal(options.args, undefined);
    calls++; return [{ frameId: 0, documentId, result: { url: `https://chzzk.naver.com/live/${A}`, value, state: 'valid' } }];
  };
  const target = { kind: 'current', tabId: 7, windowId: 9, channelId: A };
  const read = await send(h, { action: 'read-legacy-gain', selection: target });
  assert.equal(read.ok, true, read.code); assert.equal(read.legacyGain.value, value); assert.equal(writes(h).length, 0); assert.equal(calls, 2);
  const imported = { action: 'import-legacy-gain', storeSchema: 2, selection: target,
    expectedGlobalRevision: 0, documentId: read.legacyGain.documentId, value };
  documentId = 'site-doc-2'; assert.equal((await send(h, imported)).code, 'legacy-document-changed');
  documentId = 'site-doc-1'; value = 0.5; assert.equal((await send(h, imported)).code, 'conflict');
  value = 0.625; assert.equal((await send(h, imported)).ok, true);
  assert.equal(h.saved.config.audioGain, value); assert.equal(h.saved.config.gainInherited, false);
  assert.equal(h.saved.config.future, 'keep'); assert.equal(writes(h).length, 1);
});

test('fixed legacy read rejects same-url replacement and unexpected frame or malformed scalar', async t => {
  const h = await fresh(t), api = h.worker.window.chrome, target = { kind: 'current', tabId: 7, windowId: 9, channelId: A };
  let sequence = 0;
  api.scripting.executeScript = async () => [{ frameId: 0, documentId: `changed-${sequence++}`,
    result: { url: `https://chzzk.naver.com/live/${A}`, value: 1, state: 'valid' } }];
  assert.equal((await send(h, { action: 'read-legacy-gain', selection: target })).code, 'legacy-document-changed');
  for (const [frameId, value] of [[1, 1], [0, NaN], [0, Infinity], [0, -1], [0, 3]]) {
    api.scripting.executeScript = async () => [{ frameId, documentId: 'same-doc', result: { url: `https://chzzk.naver.com/live/${A}`, value, state: 'valid' } }];
    assert.equal((await send(h, { action: 'read-legacy-gain', selection: target })).ok, false);
  }
  assert.equal(writes(h).length, 0); assert.equal(h.calls.filter(item => item.kind === 'tab-query').length, 0);
});

test('protocol3 transport ACK loss is unknown and rereading matching upgraded storage does not replay', async t => {
  const h = await fresh(t, { mediaProfiles: v1() }), api = h.apiFor('popup');
  h.worker.window.eval(require('node:fs').readFileSync('settings-client.js', 'utf8'));
  const transport = h.worker.window.createSettingsRequestTransport(api); t.after(() => transport.dispose());
  const gate = h.holdNext('callback:upgrade-media-store');
  const pending = transport.send(3, { action: 'upgrade-media-store', storeSchema: 1, expectedMediaRevision: 1 }).promise;
  const observed = assert.rejects(pending, { code: 'response-unknown' });
  await gate.reached; gate.fail(); await observed;
  assert.equal(h.saved.mediaProfiles.schema, 2); assert.equal(writes(h).length, 1);
  const read = await transport.send(3, { action: 'get-media-snapshot', selection }).promise;
  assert.equal(read.reply.stored, false); assert.equal(read.reply.snapshot.store.schema, 2);
  assert.equal(h.messages.filter(item => item.message.action === 'upgrade-media-store').length, 1);
});

test('legacy import rechecks global revision after the native read and cannot overwrite a late edit', async t => {
  const h = await fresh(t), api = h.worker.window.chrome;
  api.scripting.executeScript = async () => {
    h.saved.settingsRevision = 1; h.saved.config = { previewVolume: 25, future: 'new' };
    return [{ frameId: 0, documentId: 'same-doc', result: { url: `https://chzzk.naver.com/live/${A}`, value: 0.5, state: 'valid' } }];
  };
  const reply = await send(h, { action: 'import-legacy-gain', storeSchema: 2, selection: { kind: 'current', tabId: 7, windowId: 9, channelId: A },
    expectedGlobalRevision: 0, documentId: 'same-doc', value: 0.5 });
  assert.equal(reply.code, 'conflict'); assert.equal(writes(h).length, 0);
  assert.deepEqual(h.saved.config, { previewVolume: 25, future: 'new' });
});

test('new audio presets require an explicitly owned confirmed Gain rather than inherited legacy fallback', async t => {
  const h = await fresh(t);
  const request = { action: 'create-preset', storeSchema: 2, id: P, expectedMediaRevision: 0, domain: 'audio', name: 'New', values: audio };
  assert.equal((await send(h, request)).code, 'preset-gain-unconfirmed'); assert.equal(writes(h).length, 0);
  assert.equal((await send(h, { ...request, values: { ...audio, audioGain: 0, gainInherited: false } })).ok, true);
  assert.equal(h.saved.mediaProfiles.presets[0].values.gainInherited, false);
});

test('the actual fixed legacy function bounds raw length and never writes or deletes knifeGain', async t => {
  const h = await fresh(t), vm = require('node:vm'), api = h.worker.window.chrome;
  let raw = null, reads = 0;
  api.scripting.executeScript = async options => {
    const result = vm.runInNewContext(`(${options.func.toString()})()`, {
      location: { href: `https://chzzk.naver.com/live/${A}` },
      localStorage: { getItem: key => { assert.equal(key, 'knifeGain'); reads++; return raw; },
        setItem: () => { throw new Error('unexpected site write'); }, removeItem: () => { throw new Error('unexpected site delete'); } },
    });
    return [{ frameId: 0, documentId: 'raw-doc', result }];
  };
  const request = { action: 'read-legacy-gain', selection: { kind: 'current', tabId: 7, windowId: 9, channelId: A } };
  for (const [source, expected] of [[null, 1], ['', 1], ['0', 0], ['0.1234567', 0.1234567], ['2', 2]]) {
    raw = source; const reply = await send(h, request); assert.equal(reply.ok, true, reply.code); assert.equal(reply.legacyGain.value, expected);
  }
  for (const source of ['1'.repeat(65), 'NaN', 'Infinity', '-1', '2.1']) { raw = source; assert.equal((await send(h, request)).ok, false); }
  assert.ok(reads >= 15); assert.equal(writes(h).length, 0);
});
