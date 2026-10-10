const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load } = require('./helpers.cjs');
const { settingsHarness, config, style } = require('./settings-fixture.cjs');
function background(t, stored = {}, hold) {
  const h = settingsHarness(t, stored), gate = hold ? h.holdNext(hold) : null;
  const dom = page(); t.after(() => dom.window.close()); const api = h.apiFor(); dom.window.chrome = api;
  dom.window.importScripts = (...files) => { for (const file of files) load(dom, file); };
  load(dom, 'background.js');
  let sequence = 0;
  const request = (action, payload = {}) => new Promise(resolve => {
    const listener = [...api.runtime.onMessage.listeners][0]; assert.ok(listener);
    listener({ namespace: 'cheese-knife-settings', protocol: 1, requestId: 'bg-' + ++sequence, action, ...payload },
      { id: api.runtime.id, url: api.runtime.getURL('popup.html'), frameId: 0 }, resolve);
  });
  return { h, api, gate, patch: operations => request('patch', { operations }), snapshot: () => request('get-snapshot') };
}
test('rapid style updates serialize registration so the latest selection wins', async t => {
  const { h, patch, snapshot } = background(t); await snapshot();
  const gate = h.holdNext('css-register'); const first = patch([style('left-chat', true)]); await gate.reached;
  const last = patch([style('left-chat', false), style('hide-studio', true)]); gate.release();
  assert.equal((await first).ok, true); assert.equal((await last).ok, true);
  assert.deepEqual(h.registrations.get('styles').css, ['styles/hide-studio.css']);
});
test('legacy sharpness migration works when the old config object is missing', async t => {
  const { h, snapshot } = background(t, { t: 0 }); await snapshot();
  assert.equal(h.saved.config.sharpness, 0); assert.equal(Object.hasOwn(h.saved, 't'), false);
});
test('a delayed startup style snapshot cannot overwrite a newer selection', async t => {
  const { h, gate, snapshot } = background(t, { styles: ['left-chat'] }, 'read'); await gate.reached;
  h.saved.styles = ['hide-studio']; h.changes.emit({ styles: { newValue: ['hide-studio'] } }, 'local'); gate.release();
  await snapshot(); await h.settle(); assert.deepEqual(h.registrations.get('styles').css, ['styles/hide-studio.css']);
});
test('style changes during a pending migration write are observed after that commit', async t => {
  const { h, gate, snapshot } = background(t, { config: { resizeChat: true }, styles: [] }, 'write-result'); await gate.reached;
  h.saved.styles = ['hide-studio']; h.changes.emit({ styles: { newValue: ['hide-studio'] } }, 'local'); gate.release();
  await snapshot(); await h.settle(); assert.deepEqual(h.registrations.get('styles').css, ['styles/hide-studio.css']);
});
test('legacy resize migration precedes queued newer style selections', async t => {
  const { h, gate, patch } = background(t, { config: { resizeChat: true }, styles: [] }, 'read'); await gate.reached;
  const changing = patch([style('chat-resize', false), style('hide-studio', true)]); gate.release(); await changing;
  assert.deepEqual(h.saved.styles, ['hide-studio']); assert.equal(Object.hasOwn(h.saved.config, 'resizeChat'), false);
});
test('legacy sharpness migration cannot overwrite a queued newer config value', async t => {
  const { h, gate, patch } = background(t, { config: { sharpness: 0 }, t: 2 }, 'read'); await gate.reached;
  const changing = patch([config('sharpness', 4), config('arrowSeek', false)]); gate.release(); await changing;
  assert.deepEqual(h.saved.config, { sharpness: 4, arrowSeek: false }); assert.equal(Object.hasOwn(h.saved, 't'), false);
});
test('install/startup reconcile only owned CSS and permission removal still opens the permission page', async t => {
  const { h, api, snapshot } = background(t, { styles: ['left-chat'] }); await snapshot();
  h.registrations.set('foreign', { id: 'foreign', js: ['foreign.js'] });
  api.runtime.onInstalled.emit(); api.runtime.onStartup.emit(); await h.settle(); assert.ok(h.registrations.has('foreign'));
  api.permissions.contains = async () => false; api.permissions.onRemoved.emit(); await h.settle();
  assert.equal(h.calls.filter(c => c.kind === 'tab-create').at(-1).args.url, api.runtime.getURL('permission.html'));
});
