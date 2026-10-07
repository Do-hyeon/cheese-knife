const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, flush } = require('./helpers.cjs');

function background(t, stored = {}) {
  const dom = page();
  const event = () => ({ addListener() {}, removeListener() {} });
  const data = structuredClone(stored);
  dom.window.chrome = {
    storage: { local: { get: async () => structuredClone(data), set: async value => Object.assign(data, structuredClone(value)), remove: async key => { delete data[key]; }, onChanged: event() } },
    scripting: { unregisterContentScripts: async () => {}, registerContentScripts: async () => {} },
    permissions: { contains: async () => true, onRemoved: event() },
    runtime: { onInstalled: event(), onStartup: event() }, tabs: { create() { throw new Error('unexpected permission tab'); } },
  };
  load(dom, 'background.js');
  t.after(() => dom.window.close());
  return { dom, data };
}

test('rapid style updates serialize registration so the latest selection wins', async t => {
  const { dom } = background(t);
  let registered = null, release;
  const blocked = new Promise(resolve => { release = resolve; });
  dom.window.chrome.scripting.unregisterContentScripts = async () => { registered = null; };
  dom.window.chrome.scripting.registerContentScripts = async scripts => {
    if (scripts[0].css[0] === 'styles/left-chat.css') await blocked;
    if (registered) throw new Error('duplicate-style-registration');
    registered = structuredClone(scripts[0]);
  };
  const first = dom.window.registerStyles(['left-chat']).then(() => 'ok', error => error.message);
  await flush();
  const last = dom.window.registerStyles(['hide-studio']).then(() => 'ok', error => error.message);
  await flush(); release();
  assert.equal(await first, 'ok'); assert.equal(await last, 'ok');
  assert.deepEqual(Array.from(registered.css), ['styles/hide-studio.css']);
});

test('legacy sharpness migration works when the old config object is missing', async t => {
  const { dom, data } = background(t, { t: 0 });
  await dom.window.initConfig();
  assert.equal(data.config.sharpness, 0);
  assert.equal(Object.hasOwn(data, 't'), false);
});
