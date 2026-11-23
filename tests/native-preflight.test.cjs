const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { JSDOM } = require('jsdom');
const subject = () => import('../scripts/extension-e2e/native-preflight.mjs');
const nonce = '0123456789abcdef0123456789abcdef';
const id = 'cgfddiiffponlciljlfbiecmlagflbpe';
const manifest = { manifest_version: 3, version: '2.13.3', version_name: '2.13.3 sidebar follow-up preview', background: { service_worker: 'background.js' } };
async function payload() { return (await import('../scripts/extension-e2e/published-payload.mjs')).readPublishedPayload(); }

test('baseline is derived from the fixed ZIP, including the actual broker function hash', async () => {
  const { nativePreflightBaseline } = await subject();
  const b = nativePreflightBaseline(await payload());
  assert.equal(b.brokerHash, 'b9a2192d8fcea6e8aa6afb7e0f2d19c203dc3a62c8ff99a11182440ef37cc1f8');
  assert.equal(b.files.length, 58);
  assert.ok(b.configFields.some(f => f.id === 'previewVolume' && f.min === 0 && f.max === 100));
  assert.throws(() => nativePreflightBaseline({ entries: [] }));
});

async function workerProbe(stage, raw = {}, change = () => {}) {
  const mod = await subject(), p = await payload(), b = mod.nativePreflightBaseline(p);
  const forbidden = () => { throw Error('forbidden write or private lookup'); };
  const scope = { crypto: webcrypto, TextEncoder, setTimeout, clearTimeout, URL, location: { href: `chrome-extension://${id}/background.js` },
    chrome: { runtime: { id, getManifest: () => manifest, reload: forbidden, sendMessage: forbidden },
      permissions: { getAll: async () => ({ permissions: ['storage', 'scripting'], origins: ['https://chzzk.naver.com/*'] }) },
      storage: { local: { get: async keys => { assert.deepEqual(Array.from(keys), ['config','styles','styleParameters','settingsRevision']); return structuredClone(raw); }, set: forbidden, remove: forbidden, clear: forbidden } },
      scripting: { getRegisteredContentScripts: async options => { assert.deepEqual(JSON.parse(JSON.stringify(options)), { ids: ['styles'] }); return stage === 'baseline' ? [] : [{ id: 'styles', css: ['styles/chat-font-size.css','styles/hide-ranking.css'], matches: ['https://chzzk.naver.com/*'], runAt: 'document_start' }]; }, registerContentScripts: forbidden, updateContentScripts: forbidden, unregisterContentScripts: forbidden },
      tabs: { query: forbidden }, cookies: { getAll: forbidden } }, fetch: forbidden };
  vm.createContext(scope);
  vm.runInContext(p.entries.find(e => e.name === 'settings-broker.js').bytes.toString(), scope);
  change(scope);
  const result = await vm.runInContext(mod.createNativePreflightProbe({ runNonce: nonce, stage, context: 'worker-before', baseline: b }), scope);
  return JSON.parse(JSON.stringify(result));
}

test('real worker probe preserves absent keys without issuing writes', async () => {
  const r = await workerProbe('baseline');
  assert.equal(r.outcome, 'observed');
  assert.deepEqual(r.observation.raw, { config: { present: false }, styles: { present: false }, styleParameters: { present: false }, settingsRevision: { present: false } });
  assert.deepEqual(r.observation.registrations, []);
});
test('real worker probe retains seeded types and raw order', async () => {
  const raw = { config: { arrowSeek: false, previewVolume: 25 }, styles: ['hide-ranking','chat-font-size'], styleParameters: { 'chat-font-size': 8 }, settingsRevision: 7 };
  const r = await workerProbe('seeded', raw);
  assert.equal(r.outcome, 'observed'); assert.deepEqual(r.observation.raw.config, { present: true, value: raw.config });
  assert.deepEqual(r.observation.raw.styles.value, ['hide-ranking','chat-font-size']);
});
test('unknown private values and raw API errors never leave a probe', async () => {
  const secret = 'private-sentinel';
  for (const raw of [{ config: { unknown: secret } }, { styles: [secret] }, { styleParameters: { unknown: secret } }, { config: { arrowSeek: secret } }]) {
    const r = await workerProbe('baseline', raw);
    assert.equal(r.outcome, 'failed'); assert.equal(r.code, 'native-data-invalid'); assert.ok(!JSON.stringify(r).includes(secret));
  }
  const r = await workerProbe('baseline', {}, s => { s.chrome.storage.local.get = async () => { throw Error(secret); }; });
  assert.equal(r.code, 'native-read-failed'); assert.ok(!JSON.stringify(r).includes(secret));
});
test('wrong worker context and a bounded hung API produce fixed failure envelopes', async () => {
  assert.equal((await workerProbe('baseline', {}, s => { s.location.href = 'https://example.com/'; })).code, 'native-context-invalid');
  const r = await workerProbe('baseline', {}, s => { s.chrome.storage.local.get = () => new Promise(() => {}); s.setTimeout = fn => setTimeout(fn, 1); });
  assert.equal(r.code, 'native-timeout'); assert.equal(r.observation, null);
});
test('real UI probe rejects CSS failed-ready and missing controls without storage access', async t => {
  const mod = await subject(), b = mod.nativePreflightBaseline(await payload());
  const dom = new JSDOM('<div id="settings-status" data-phase="ready"></div><button id="settings-retry" hidden></button><button id="settings-discard" hidden></button><input id="hide-ranking" type="checkbox"><input id="chat-font-size" value="0">', { url: `chrome-extension://${id}/styles.html`, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  dom.window.chrome = { runtime: { id, getManifest: () => manifest } };
  const probe = mod.createNativePreflightProbe({ runNonce: nonce, stage: 'baseline', context: 'styles', baseline: b });
  assert.equal((await dom.window.eval(probe)).outcome, 'observed');
  dom.window.document.querySelector('#settings-retry').hidden = false;
  assert.equal((await dom.window.eval(probe)).code, 'native-ui-failed');
  dom.window.document.querySelector('#settings-retry').remove();
  assert.equal((await dom.window.eval(probe)).code, 'native-ui-failed');
});

test('frozen styles UI really reports ready after a CSS initialization failure, which the probe rejects', async t => {
  const { settingsHarness } = require('./settings-fixture.cjs'), { page, flush } = require('./helpers.cjs');
  const mod = await subject(), p = await payload(), b = mod.nativePreflightBaseline(p);
  const text = name => p.entries.find(e => e.name === name).bytes.toString();
  const h = settingsHarness(t, {}, {generation:'published',sources:Object.fromEntries(['config.js','style-schema.js','settings-contract.js','settings-broker.js'].map(name => [name,text(name)]))});
  h.failNext('css-get'); await h.initialize();
  const dom = page(text('styles.html'), `chrome-extension://${id}/styles.html`);
  t.after(() => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); dom.window.close(); });
  const api = h.apiFor('styles'); api.runtime.id = id; api.runtime.getManifest = () => manifest;
  dom.window.chrome = api;
  for (const script of dom.window.document.querySelectorAll('script[src]')) dom.window.eval(text(script.getAttribute('src')));
  await flush();
  assert.equal(dom.window.document.querySelector('#settings-status').dataset.phase, 'ready');
  assert.equal(dom.window.document.querySelector('#settings-retry').hidden, false);
  assert.deepEqual([...h.registrations.values()], []);
  const result = await dom.window.eval(mod.createNativePreflightProbe({ runNonce: nonce, stage: 'baseline', context: 'styles', baseline: b }));
  assert.equal(result.code, 'native-ui-failed'); assert.equal(result.observation, null);
});

for (const seeded of [false, true]) test(`frozen popup probe observes ${seeded ? 'seeded' : 'baseline'} without inventing a retry control`, async t => {
  const { settingsHarness } = require('./settings-fixture.cjs'), { page, flush } = require('./helpers.cjs');
  const mod = await subject(), p = await payload(), b = mod.nativePreflightBaseline(p);
  const text = name => p.entries.find(e => e.name === name).bytes.toString();
  const raw = seeded ? { config: { arrowSeek: false, previewVolume: 25 }, settingsRevision: 7 } : {};
  const h = settingsHarness(t, raw, {generation:'published',sources:Object.fromEntries(['config.js','style-schema.js','settings-contract.js','settings-broker.js'].map(name => [name,text(name)]))});
  await h.initialize();
  const dom = page(text('popup.html'), `chrome-extension://${id}/popup.html`);
  t.after(() => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); dom.window.close(); });
  const api = h.apiFor('popup'); api.runtime.id = id; api.runtime.getManifest = () => manifest;
  dom.window.chrome = api;
  for (const script of dom.window.document.querySelectorAll('script[src]')) dom.window.eval(text(script.getAttribute('src')));
  await flush();
  assert.equal(dom.window.document.querySelector('#settings-status').dataset.phase, 'ready');
  assert.equal(dom.window.document.querySelector('#settings-retry'), null);
  const probe = mod.createNativePreflightProbe({ runNonce: nonce, stage: seeded ? 'seeded' : 'baseline', context: 'popup', baseline: b });
  const result = JSON.parse(JSON.stringify(await dom.window.eval(probe)));
  assert.equal(result.outcome, 'observed');
  assert.deepEqual(result.observation, { phase: 'ready', retryHidden: null, discardHidden: true,
    checked: !seeded, value: seeded ? 25 : 5, firstDisabled: false, secondDisabled: false });
  dom.window.document.querySelector('#settings-discard').hidden = false;
  assert.equal((await dom.window.eval(probe)).code, 'native-ui-failed');
});

test('staged literal evidence yields partial acceptance, never premature native PASS', async () => {
  const mod = await subject(), b = mod.nativePreflightBaseline(await payload()), fixture = require('./native-preflight-fixture.cjs');
  for (const through of ['baseline','seeded','complete']) {
    assert.deepEqual(mod.assertNativePreflight(fixture.evidence(b, through), b, through),
      { status: through === 'complete' ? 'NATIVE-PREFLIGHT-PASS' : 'STAGE-ACCEPTED', complete: through === 'complete' });
  }
});
const mutations = {
  'wrong extension': e => { e.observations[0].identity.extensionId = 'a'.repeat(32); },
  'wrong version': e => { e.observations[0].identity.version = '2.13.4'; },
  'wrong display version': e => { e.observations[0].identity.versionName = '2.13.3'; },
  'wrong broker': e => { e.observations[0].identity.brokerHash = 'a'.repeat(64); },
  'wrong pathname': e => { e.observations[1].identity.pathname = '/styles.html'; },
  'wrong nonce': e => { e.observations[0].runNonce = 'f'.repeat(32); },
  'missing observation': e => e.observations.pop(),
  'duplicate observation': e => { e.observations[1] = structuredClone(e.observations[0]); },
  'explicit baseline default': e => { e.observations[0].observation.raw.settingsRevision = { present: true, value: 0 }; },
  'wrong config type': e => { e.observations[4].observation.raw.config.value.arrowSeek = 'false'; },
  'low revision': e => { e.observations[4].observation.raw.settingsRevision.value = 3; },
  'unsafe revision': e => { e.observations[4].observation.raw.settingsRevision.value = Number.MAX_SAFE_INTEGER + 1; },
  'cold revision mismatch': e => { e.observations[8].observation.raw.settingsRevision.value = 8; },
  'missing CSS': e => { e.observations[4].observation.registrations = []; },
  'CSS adds JS': e => { e.observations[4].observation.registrations[0].js.push('extra.js'); },
  'one disabled field': e => { e.observations[5].observation.secondDisabled = true; },
  'pending UI': e => { e.observations[5].observation.phase = 'saving'; },
  'CSS retry visible': e => { e.observations[6].observation.retryHidden = false; },
  'stale UI value': e => { e.observations[5].observation.value = 5; },
  'before after different': e => { e.observations[7].observation.raw.styles.value.reverse(); },
  'unknown finalization': e => { e.events.at(-1).status = 'unknown'; },
  'first failure then later success': e => { e.events[3].status = 'failed'; e.events[3].code = 'native-timeout'; },
  'reversed ordinal': e => { e.events[3].ordinal = 1; },
  'reversed time': e => { e.events[3].recordedAt = 1; },
  'unconfirmed context': e => { e.events[1].status = 'unknown'; },
  'browser still open': e => { e.nativeFacts[1].process.root = { pid: 10, startedAt: 1 }; },
  'browser never queried': e => { e.nativeFacts[1].process.queried = false; },
  'profile changes': e => { e.nativeFacts[2].profileIdentity = 'e'.repeat(64); },
  'not from store': e => { e.nativeFacts[0].installation.fromWebstore = false; },
  'HTML changed': e => { e.nativeFacts[0].installation.files.find(row => row[0] === 'popup.html')[1] = 'a'.repeat(64); },
  'extra runtime': e => { e.nativeFacts[0].installation.files.push(['extra.js','a'.repeat(64)]); },
  'developer mode not restored': e => { e.nativeFacts.at(-1).developerMode = true; },
};
for (const [name, mutate] of Object.entries(mutations)) test(`native acceptance rejects ${name}`, async () => {
  const mod = await subject(), b = mod.nativePreflightBaseline(await payload());
  const e = require('./native-preflight-fixture.cjs').evidence(b); mutate(e);
  assert.throws(() => mod.assertNativePreflight(e, b, 'complete'), error => ['native-evidence-invalid','native-sequence-invalid'].includes(error.code));
});
