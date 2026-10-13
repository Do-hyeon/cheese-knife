import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { isDeepStrictEqual } from 'node:util';
import { PUBLISHED_PAYLOAD_BASELINE } from './published-payload.mjs';
import { brokerFunctionSource } from './transition-scenario.mjs';
import { NATIVE_STAGES, NATIVE_CONTEXTS, NATIVE_ID } from './native-preflight-contract.mjs';
export { NATIVE_STAGES, NATIVE_CONTEXTS, NATIVE_ID, NATIVE_CODES } from './native-preflight-contract.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => Object.assign(new Error(code), { code });
const requireThat = (ok, code = 'native-evidence-invalid') => { if (!ok) throw fail(code); };

/** Consumes the complete attested payload, not caller-supplied schema/code text. */
export function nativePreflightBaseline(payload) {
  requireThat(Array.isArray(payload?.entries) && payload.entries.length === 58);
  const rows = payload.entries.map(e => { requireThat(Buffer.isBuffer(e.bytes) && hash(e.bytes) === e.sha256); return [e.name, e.sha256]; });
  requireThat(hash(JSON.stringify(rows)) === PUBLISHED_PAYLOAD_BASELINE.inventorySha256);
  const text = name => payload.entries.find(e => e.name === name).bytes.toString('utf8');
  const scope = runInNewContext(`${text('config.js')}\n${text('style-schema.js')}\n({ CONFIGS, STYLES })`, {}, { timeout: 1000 });
  const configFields = scope.CONFIGS.flatMap(g => g.configs.flatMap(f => f.type === 'details' ? f.configs : [f]));
  const styles = scope.STYLES.flatMap(g => g.styles);
  return JSON.parse(JSON.stringify({ id: NATIVE_ID, version: '2.13.3', versionName: '2.13.3 sidebar follow-up preview',
    brokerHash: hash(brokerFunctionSource(text('settings-broker.js'))),
    configFields, styles, files: rows, manifest: JSON.parse(text('manifest.json')),
    locales: { en: JSON.parse(text('_locales/en/messages.json')), ko: JSON.parse(text('_locales/ko/messages.json')) } }));
}

// This function runs in the user's selected extension context, never in a profile controller.
async function observeNative({ runNonce, stage, context, baseline }) {
  const envelope = { schema: 1, runNonce, stage, context, capturedAt: Date.now(), outcome: 'failed', code: null, identity: null, observation: null };
  const fault = code => { throw Object.assign(new Error(code), { code }); };
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const keys = ['config', 'styles', 'styleParameters', 'settingsRevision'];
  const timed = async work => {
    let timer;
    try { return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(), { code: 'native-timeout' })), 15000); })]); }
    catch (e) { fault(e?.code === 'native-timeout' ? 'native-timeout' : 'native-read-failed'); }
    finally { clearTimeout(timer); }
  };
  try {
    const worker = context.startsWith('worker-'), pathname = worker ? '/background.js' : `/${context}.html`;
    if (typeof chrome === 'undefined' || typeof location === 'undefined') fault('native-context-invalid');
    const url = new URL(location.href), m = chrome.runtime.getManifest();
    if (url.protocol !== 'chrome-extension:' || url.hostname !== baseline.id || url.pathname !== pathname ||
        chrome.runtime.id !== baseline.id || m.manifest_version !== 3 || m.version !== baseline.version || m.version_name !== baseline.versionName ||
        m.background?.service_worker !== 'background.js' || (worker ? typeof document !== 'undefined' : typeof document === 'undefined')) fault('native-context-invalid');
    const identity = { extensionId: chrome.runtime.id, version: m.version, versionName: m.version_name, manifestVersion: m.manifest_version, pathname };
    let observation;
    if (worker) {
      if (typeof crypto?.subtle?.digest !== 'function' || typeof TextEncoder === 'undefined') fault('native-crypto-unavailable');
      if (typeof createSettingsBroker !== 'function') fault('native-context-invalid');
      const digest = await timed(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(createSettingsBroker.toString())));
      identity.brokerHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (identity.brokerHash !== baseline.brokerHash) fault('native-context-invalid');
      const permissions = await timed(() => chrome.permissions.getAll());
      const exactSet = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length && expected.every(v => actual.includes(v));
      if (!exactSet(permissions.permissions, ['scripting','storage']) || !exactSet(permissions.origins, ['https://chzzk.naver.com/*'])) fault('native-context-invalid');
      identity.permissions = ['scripting','storage']; identity.origins = ['https://chzzk.naver.com/*'];
      const raw = await timed(() => chrome.storage.local.get(keys));
      if (!record(raw) || Object.keys(raw).some(k => !keys.includes(k))) fault('native-data-invalid');
      const validNumber = (value, field) => typeof value === 'number' && Number.isFinite(value) && value >= field.min && value <= field.max;
      if (Object.hasOwn(raw, 'config') && (!record(raw.config) || Object.entries(raw.config).some(([id, value]) => {
        const field = baseline.configFields.find(f => f.id === id);
        return !field || (field.type === 'range' ? !validNumber(value, field) : typeof value !== 'boolean');
      }))) fault('native-data-invalid');
      if (Object.hasOwn(raw, 'styles') && (!Array.isArray(raw.styles) || raw.styles.some(id => !baseline.styles.some(f => f.id === id)))) fault('native-data-invalid');
      if (Object.hasOwn(raw, 'styleParameters') && (!record(raw.styleParameters) || Object.entries(raw.styleParameters).some(([id, value]) => {
        const field = baseline.styles.find(f => f.id === id && f.type === 'range'); return !field || !validNumber(value, field);
      }))) fault('native-data-invalid');
      if (Object.hasOwn(raw, 'settingsRevision') && (!Number.isSafeInteger(raw.settingsRevision) || raw.settingsRevision < 0)) fault('native-data-invalid');
      const registered = await timed(() => chrome.scripting.getRegisteredContentScripts({ ids: ['styles'] }));
      if (!Array.isArray(registered) || registered.length > 1 || registered.some(r => !record(r) || r.id !== 'styles' ||
          !Array.isArray(r.css) || r.css.some(f => !baseline.styles.some(s => f === `styles/${s.id}.css`)) ||
          !exactSet(r.matches, ['https://chzzk.naver.com/*']) || r.runAt !== 'document_start' || (r.js !== undefined && (!Array.isArray(r.js) || r.js.length)))) fault('native-data-invalid');
      observation = { raw: Object.fromEntries(keys.map(k => [k, Object.hasOwn(raw, k) ? { present: true, value: Object.getOwnPropertyDescriptor(raw,k).value } : { present: false }])),
        registrations: registered.map(r => ({ id: r.id, css: r.css, matches: r.matches, runAt: r.runAt, js: r.js || [] })) };
    } else {
      const node = id => { const n = document.getElementById(id); if (!n) fault('native-ui-failed'); return n; };
      const phase = node('settings-status').dataset.phase, retryHidden = context === 'styles' ? node('settings-retry').hidden : null, discardHidden = node('settings-discard').hidden;
      if (phase !== 'ready' || (context === 'styles' && !retryHidden) || !discardHidden) fault('native-ui-failed');
      const first = node(context === 'popup' ? 'arrowSeek' : 'hide-ranking'), second = node(context === 'popup' ? 'previewVolume' : 'chat-font-size');
      if (first.disabled || second.disabled || !Number.isFinite(Number(second.value))) fault('native-ui-failed');
      observation = { phase, retryHidden, discardHidden, checked: first.checked, value: Number(second.value), firstDisabled: first.disabled, secondDisabled: second.disabled };
    }
    return { ...envelope, capturedAt: Date.now(), outcome: 'observed', code: null, identity, observation };
  } catch (e) {
    const allowed = ['native-context-invalid','native-read-failed','native-timeout','native-data-invalid','native-crypto-unavailable','native-ui-failed'];
    return { ...envelope, capturedAt: Date.now(), code: allowed.includes(e?.code) ? e.code : 'native-read-failed' };
  }
}

/** Generates a fixed read-only expression; the caller supplies an attested baseline. */
export function createNativePreflightProbe(options) {
  requireThat(/^[a-f0-9]{32}$/.test(options?.runNonce) && NATIVE_STAGES.includes(options?.stage) && NATIVE_CONTEXTS.includes(options?.context));
  requireThat(options.baseline?.id === NATIVE_ID && /^[a-f0-9]{64}$/.test(options.baseline?.brokerHash));
  // Do not embed locale text, installed files or other unneeded baseline metadata into the probe.
  const { id, version, versionName, brokerHash, configFields, styles } = options.baseline;
  return `(${observeNative.toString()})(${JSON.stringify({ ...options, baseline: { id, version, versionName, brokerHash, configFields, styles } })})`;
}

const origin = ['https://chzzk.naver.com/*'];
const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && new Set(a).size === a.length && b.every(value => a.includes(value));
const time = value => Number.isSafeInteger(value) && value > 0;
function assertInstallation(installation, baseline) {
  requireThat(installation?.extensionId === NATIVE_ID && installation.version === '2.13.3' && installation.publicKeyId === NATIVE_ID && installation.fromWebstore === true &&
    isDeepStrictEqual(installation.disableReasons, []) && sameSet(installation.permissions, ['scripting','storage']) && sameSet(installation.origins, origin));
  const normalized = structuredClone(installation.manifest);
  requireThat(typeof normalized?.key === 'string' && normalized.key.length > 0 && normalized.update_url === 'https://clients2.google.com/service/update2/crx');
  delete normalized.key; delete normalized.update_url;
  requireThat(isDeepStrictEqual(normalized, baseline.manifest) && isDeepStrictEqual(installation.locales, baseline.locales));
  const allowed = new Map([...baseline.files, ['_metadata/verified_contents.json', null], ['_metadata/computed_hashes.json', null]]);
  requireThat(Array.isArray(installation.files) && installation.files.length === allowed.size);
  const seen = new Set(), exceptions = new Set(['manifest.json','_locales/en/messages.json','_locales/ko/messages.json','icon16.png','icon48.png','icon128.png']);
  for (const row of installation.files) {
    requireThat(Array.isArray(row) && row.length === 2 && allowed.has(row[0]) && !seen.has(row[0]) && /^[a-f0-9]{64}$/.test(row[1]));
    seen.add(row[0]);
    if (allowed.get(row[0]) && !exceptions.has(row[0])) requireThat(allowed.get(row[0]) === row[1]);
  }
}

/** Validates already collected data. Never queries Chrome, a profile, or a process. */
export function assertNativePreflight(evidence, baseline, through) {
  const count = through === 'baseline' ? 1 : through === 'seeded' ? 2 : through === 'complete' ? 3 : 0;
  requireThat(count && baseline?.id === NATIVE_ID && /^[a-f0-9]{64}$/.test(baseline.brokerHash));
  const { observations, events, nativeFacts } = evidence || {};
  requireThat(Array.isArray(observations) && observations.length === count * 4 && Array.isArray(events) && events.length <= 64 && Array.isArray(nativeFacts));
  const nonce = observations[0]?.runNonce;
  requireThat(/^[a-f0-9]{32}$/.test(nonce));
  let previousTime = 0;
  for (const [index, event] of events.entries()) {
    requireThat(event.schema === 1 && event.runNonce === nonce && event.ordinal === index + 1 && time(event.recordedAt) && event.recordedAt >= previousTime &&
      ['confirmed','requested'].includes(event.status) && event.code === null, 'native-sequence-invalid');
    previousTime = event.recordedAt;
  }
  const phases = count === 3 ? ['before','closed','restarted','after'] : ['before'];
  requireThat(nativeFacts.length === phases.length);
  for (const [index, f] of nativeFacts.entries()) {
    requireThat(f.schema === 1 && f.runNonce === nonce && f.phase === phases.at(index) && time(f.capturedAt) &&
      /^[a-f0-9]{64}$/.test(f.profileIdentity) && f.profileIdentity === nativeFacts[0].profileIdentity && typeof f.developerMode === 'boolean' && f.process?.queried === true);
    assertInstallation(f.installation, baseline);
    if (['closed','after'].includes(f.phase)) requireThat(f.process.root === null);
    else requireThat(Number.isSafeInteger(f.process.root?.pid) && f.process.root.pid > 0 && time(f.process.root.startedAt) && f.process.root.startedAt <= f.capturedAt);
  }
  if (count === 3) {
    requireThat(nativeFacts[2].process.root.startedAt > nativeFacts[1].capturedAt &&
      nativeFacts[3].developerMode === nativeFacts[0].developerMode && isDeepStrictEqual(nativeFacts[3].installation, nativeFacts[0].installation));
  }
  let cursor = 0, observationIndex = 0, revision;
  const take = (name, status = 'confirmed') => {
    const event = events[cursor++];
    requireThat(event?.event === name && event.status === status, 'native-sequence-invalid');
    return event;
  };
  const inspect = phase => {
    const f = nativeFacts.find(value => value.phase === phase), event = take(`inspection:${phase}`);
    requireThat(f && f.capturedAt <= event.recordedAt && f.capturedAt >= (events[cursor - 2]?.recordedAt || 0), 'native-sequence-invalid');
  };
  inspect('before'); take('profile-context');
  for (const stage of NATIVE_STAGES.slice(0, count)) {
    if (stage === 'seeded') { take('check:baseline'); take('seed-start'); }
    if (stage === 'cold') { take('check:seeded'); inspect('closed'); inspect('restarted'); }
    let before;
    for (const context of NATIVE_CONTEXTS) {
      const requested = take(`probe:${stage}:${context}`, 'requested'), received = take(`probe:${stage}:${context}`);
      const value = observations[observationIndex++], worker = context.startsWith('worker-');
      requireThat(value?.schema === 1 && value.runNonce === nonce && value.stage === stage && value.context === context && value.outcome === 'observed' && value.code === null);
      requireThat(time(value.capturedAt) && value.capturedAt >= requested.recordedAt && value.capturedAt <= received.recordedAt, 'native-sequence-invalid');
      const identity = { extensionId: NATIVE_ID, version: '2.13.3', versionName: '2.13.3 sidebar follow-up preview', manifestVersion: 3,
        pathname: worker ? '/background.js' : `/${context}.html`, ...(worker ? { brokerHash: baseline.brokerHash, permissions: ['scripting','storage'], origins: origin } : {}) };
      requireThat(isDeepStrictEqual(value.identity, identity));
      if (worker) {
        const raw = value.observation?.raw;
        if (stage === 'seeded' && context === 'worker-before') {
          revision = raw?.settingsRevision?.value;
          requireThat(Number.isSafeInteger(revision) && revision >= 4);
        }
        const expected = stage === 'baseline' ? { config: { present: false }, styles: { present: false }, styleParameters: { present: false }, settingsRevision: { present: false } } :
          { config: { present: true, value: { arrowSeek: false, previewVolume: 25 } }, styles: { present: true, value: ['hide-ranking','chat-font-size'] },
            styleParameters: { present: true, value: { 'chat-font-size': 8 } }, settingsRevision: { present: true, value: revision } };
        const registrations = stage === 'baseline' ? [] : [{ id: 'styles', css: ['styles/chat-font-size.css','styles/hide-ranking.css'], matches: origin, runAt: 'document_start', js: [] }];
        requireThat(isDeepStrictEqual(value.observation, { raw: expected, registrations }));
        if (context === 'worker-before') before = value.observation;
        else requireThat(isDeepStrictEqual(value.observation, before));
      } else {
        const seeded = stage !== 'baseline';
        requireThat(isDeepStrictEqual(value.observation, { phase: 'ready', retryHidden: context === 'styles' ? true : null, discardHidden: true,
          checked: context === 'popup' ? !seeded : seeded, value: context === 'popup' ? seeded ? 25 : 5 : seeded ? 8 : 0,
          firstDisabled: false, secondDisabled: false }));
      }
    }
  }
  if (count === 3) { inspect('after'); take('finalize'); }
  requireThat(cursor === events.length, 'native-sequence-invalid');
  return { status: count === 3 ? 'NATIVE-PREFLIGHT-PASS' : 'STAGE-ACCEPTED', complete: count === 3 };
}
