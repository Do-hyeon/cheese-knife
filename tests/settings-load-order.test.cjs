const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { page, load, flush } = require('./helpers.cjs');
const { settingsHarness } = require('./settings-fixture.cjs');
const dependencies = ['media-profiles.js', 'config.js', 'style-schema.js', 'settings-contract.js', 'settings-broker.js'];
test('classic Chrome worker imports dependencies and installs callback listener synchronously', async t => {
  const h = settingsHarness(t); const dom = page(); t.after(() => dom.window.close()); const api = h.apiFor(); dom.window.chrome = api;
  const imported = []; dom.window.importScripts = (...files) => { for (const file of files) { imported.push(file); load(dom, file); } };
  load(dom, 'background.js'); assert.deepEqual(imported, dependencies); assert.equal(api.runtime.onMessage.listeners.size, 1);
  const message = { namespace: 'cheese-knife-settings', protocol: 1, action: 'get-snapshot', requestId: 'load-fixture' };
  const sender = { id: api.runtime.id, url: api.runtime.getURL('popup.html'), frameId: 0 };
  const reply = await new Promise(resolve => { assert.equal([...api.runtime.onMessage.listeners][0](message, sender, resolve), true); });
  assert.equal(reply.ok, true); await flush();
});
for (const name of ['popup', 'styles']) test(name + ' HTML loads its shared client dependencies in order', () => {
  const html = fs.readFileSync(`${name}.html`, 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(scripts, [...dependencies.slice(0, 4), 'settings-client.js', `${name}.js`]);
});
test('permission HTML loads the host policy before its grant UI', () => {
  const html = fs.readFileSync('permission.html', 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(scripts, ['media-profiles.js', 'config.js', 'permission.js']);
});
