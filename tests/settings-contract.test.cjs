const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { page, load } = require('./helpers.cjs');
const config = (id, value) => ({ type: 'config', id, value });
const style = (id, enabled) => ({ type: 'style', id, enabled });
const parameter = (id, value) => ({ type: 'parameter', id, value });
const plain = value => JSON.parse(JSON.stringify(value));
function contract(t) {
  const dom = page(); t.after(() => dom.window.close()); load(dom, 'media-profiles.js'); load(dom, 'config.js');
  for (const file of ['style-schema.js', 'settings-contract.js']) if (fs.existsSync(file)) load(dom, file);
  assert.ok(dom.window.KnifeSettingsContract, 'new settings contract must be available');
  return { api: dom.window.KnifeSettingsContract, fields: dom.window.CONFIGS.flatMap(c => c.configs.flatMap(f => f.configs || [f])) };
}
const request = (action = 'patch', more = {}) => ({ namespace: 'cheese-knife-settings', protocol: 1, action, requestId: 'request-1', ...(action === 'patch' ? { operations: [] } : {}), ...more });
const getURL = path => 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/' + path;
const sender = { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', url: getURL('popup.html') };

test('field merge keeps unrelated raw fields and advances only one persistent revision', t => {
  const { api } = contract(t);
  const raw = { config: { futureFlag: 'keep', brightness: 1.225 }, settingsRevision: 4 };
  assert.deepEqual(plain(api.mergeOperations(raw, [config('arrowSeek', false)]).changes), {
    config: { futureFlag: 'keep', brightness: 1.225, arrowSeek: false }, settingsRevision: 5,
  });
  assert.deepEqual(raw, { config: { futureFlag: 'keep', brightness: 1.225 }, settingsRevision: 4 });
});
test('parameter value and style membership change together and preserve unknown stored parameters', t => {
  const { api } = contract(t);
  const raw = { styles: ['left-chat', 'future-style'], styleParameters: { future: 9 }, settingsRevision: 4 };
  const added = api.mergeOperations(raw, [parameter('chat-font-size', 8)]);
  assert.deepEqual(plain(added.changes), { styles: ['left-chat', 'future-style', 'chat-font-size'], styleParameters: { future: 9, 'chat-font-size': 8 }, settingsRevision: 5 });
  const removed = api.mergeOperations({ ...raw, ...added.changes }, [parameter('chat-font-size', 0)]);
  assert.deepEqual(plain(removed.changes), { styles: ['left-chat', 'future-style'], styleParameters: { future: 9, 'chat-font-size': 0 }, settingsRevision: 6 });
});
test('no-op and repeated absolute values do not unnecessarily write or advance revision', t => {
  const { api } = contract(t);
  const raw = { config: { arrowSeek: false }, styles: ['left-chat'], settingsRevision: 7 };
  for (const ops of [[], [config('arrowSeek', false)], [style('left-chat', true)], [style('hide-studio', true), style('hide-studio', false)]]) {
    const result = api.mergeOperations(raw, ops); assert.deepEqual(plain(result.changes), {}); assert.equal(result.revision, 7);
  }
  assert.equal(api.mergeOperations(raw, [config('arrowSeek', true), config('arrowSeek', false)]).revision, 7);
});
test('all declared config fields validate boolean and finite numeric bounds without step quantization', t => {
  const { api, fields } = contract(t);
  for (const f of fields) {
    const good = f.type === 'range' ? [f.min, f.max, f.defaultValue] : [false, true];
    for (const value of good) assert.equal(api.validateOperations([config(f.id, value)]).ok, true, f.id + ' accepts ' + value);
    const bad = f.type === 'range' ? [f.min - 1, f.max + 1, NaN, Infinity, '0', null, false] : [0, 1, 'true', null];
    for (const value of bad) assert.equal(api.validateOperations([config(f.id, value)]).ok, false, f.id + ' rejects ' + value);
  }
  assert.equal(api.validateOperations([config('brightness', 1.225)]).ok, true);
});
test('font bounds and strict operation shapes reject whole requests before merging', t => {
  const { api } = contract(t);
  for (const value of [-6, 0, 16, 2.5]) assert.equal(api.validateOperations([parameter('chat-font-size', value)]).ok, true);
  for (const op of [style('chat-font-size', true), parameter('chat-font-size', -7), parameter('chat-font-size', 17), parameter('future', 0), config('future', true), style('future', true), style('left-chat', 1), { ...config('arrowSeek', false), extra: 1 }, null, []]) {
    assert.equal(api.validateOperations([config('arrowSeek', false), op]).ok, false);
    assert.throws(() => api.mergeOperations({}, [config('arrowSeek', false), op]));
  }
  assert.equal(api.validateOperations(Array.from({ length: 64 }, () => config('arrowSeek', false))).ok, true);
  assert.equal(api.validateOperations(Array.from({ length: 65 }, () => config('arrowSeek', false))).ok, false);
});
test('persistent revision rejects corrupt or exhausted values rather than resetting them', t => {
  const { api } = contract(t); assert.equal(api.readRevision(undefined), 0); assert.equal(api.readRevision(0), 0); assert.equal(api.readRevision(100), 100);
  for (const value of [null, -1, 1.5, '1', NaN, Infinity]) assert.throws(() => api.readRevision(value), { code: 'revision-invalid' });
  assert.throws(() => api.readRevision(Number.MAX_SAFE_INTEGER), { code: 'revision-exhausted' });
  assert.throws(() => api.mergeOperations({ settingsRevision: -1 }, []), { code: 'revision-invalid' });
});
test('snapshot exposes only known normalized fields and CSS uses the fixed style list', t => {
  const { api } = contract(t);
  const raw = { config: { preview: false, compressorAttack: 0, secret: 'keep' }, styles: ['future-style', 'left-chat', 'chat-font-size'], styleParameters: { 'chat-font-size': 8, secret: 'keep' }, settingsRevision: 2 };
  const snap = api.makeSnapshot(raw, { state: 'ready', code: null });
  assert.equal(snap.config.preview, false); assert.equal(snap.config.compressorAttack, 0); assert.equal(snap.config.previewWidth, 400);
  assert.equal(Object.hasOwn(snap.config, 'secret'), false); assert.equal(Object.hasOwn(snap.styleParameters, 'secret'), false);
  assert.deepEqual(plain(snap.styleParameters), { 'chat-font-size': 8 });
  assert.deepEqual(plain(api.cssFiles(raw.styles)), ['styles/chat-font-size.css', 'styles/left-chat.css']);
  assert.equal(snap.styles.includes('future-style'), false); assert.equal(snap.revision, 2);
});
test('snapshot and operation boundaries ignore inherited and prototype-reserved keys', t => {
  const { api } = contract(t);
  const inheritedParameters = Object.create({ 'chat-font-size': 8 });
  Object.defineProperty(inheritedParameters, '__proto__', { enumerable: true, value: { polluted: true } });
  const raw = { config: { arrowSeek: false }, styles: ['chat-font-size'], styleParameters: inheritedParameters, settingsRevision: 3 };
  const objectPrototypeBefore = Object.getPrototypeOf({});
  const snapshot = api.makeSnapshot(raw, { state: 'ready' });
  assert.deepEqual(plain(snapshot.styleParameters), {});
  assert.equal(Object.getPrototypeOf(snapshot.styleParameters), Object.getPrototypeOf(snapshot.config));
  for (const id of ['__proto__', 'constructor', 'prototype', 'unknown-setting']) {
    for (const op of [config(id, true), style(id, true), parameter(id, 1)]) {
      assert.equal(api.validateOperations([op]).ok, false, `${op.type}:${id}`);
      assert.throws(() => api.mergeOperations(raw, [op]));
    }
  }
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.getPrototypeOf({}), objectPrototypeBefore);
});
test('record equality ignores key order but detects a changed own value', t => {
  const { api } = contract(t);
  const first = { brightness: 1.25, arrowSeek: false };
  const reordered = { arrowSeek: false, brightness: 1.25 };
  assert.deepEqual(plain(api.mergeOperations({ config: first, settingsRevision: 9 }, [config('brightness', 1.25)]).changes), {});
  assert.deepEqual(plain(api.mergeOperations({ config: reordered, settingsRevision: 9 }, [config('brightness', 1.5)]).changes), {
    config: { arrowSeek: false, brightness: 1.5 }, settingsRevision: 10,
  });
});
test('requests authorize exact extension document protocol host and path, not an opaque origin', t => {
  const { api } = contract(t);
  for (const url of [getURL('popup.html?targetTabId=7#x'), getURL('styles.html')]) assert.equal(api.validateRequest(request(), { ...sender, url, frameId: 0 }, sender.id, getURL).ok, true);
  for (const bad of [{ ...sender, url: 'https://chzzk.naver.com/live/test' }, { ...sender, id: 'different' }, { ...sender, url: getURL('popup.html.evil') }, { ...sender, url: 'chrome-extension://other/popup.html' }, { ...sender, frameId: 1 }, { url: sender.url }, { id: sender.id }, { ...sender, url: 'about:blank' }]) assert.equal(api.validateRequest(request(), bad, sender.id, getURL).ok, false);
  const mozURL = p => 'moz-extension://example-uuid/' + p;
  assert.equal(api.validateRequest(request(), { id: sender.id, url: mozURL('styles.html') }, sender.id, mozURL).ok, true);
});
test('request actions, IDs, properties, and reload targets are checked before acceptance', t => {
  const { api } = contract(t); const valid = m => api.validateRequest(m, sender, sender.id, getURL).ok;
  assert.equal(valid(request('get-snapshot')), true);
  assert.equal(valid(request('patch', { requestId: 'a'.repeat(128) })), true);
  assert.equal(valid(request('reload-target', { targetTabId: 7, targetWindowId: 9 })), true);
  for (const r of [request('unknown'), request('get-snapshot', { operations: [] }), request('patch', { requestId: '' }), request('patch', { requestId: 'a'.repeat(129) }), request('patch', { protocol: '1' }), request('patch', { config: {} }), request('reload-target', { targetTabId: -1, targetWindowId: 9 }), request('reload-target', { targetTabId: '7', targetWindowId: 9 }), request('reload-target', { targetTabId: 7, targetWindowId: 1.5 })]) assert.equal(valid(r), false);
});
