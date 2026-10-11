const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

test('optional site adapter survives absent webpack and React', async t => {
  const dom = page();
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  assert.equal(await runtime(dom).adapter.player.readMetrics(dom.window.document.body), null);
  for (const key of ['fiberOf', 'propsOf', 'stateOf', 'contextOf', 'getWebpackRequire', 'getCorePlayer']) {
    assert.equal(Object.hasOwn(runtime(dom).adapter, key), false);
  }
});

test('optional site adapter does not evaluate throwing global getters', async t => {
  const dom = page();
  let getters = 0;
  Object.defineProperty(dom.window, 'webpackChunkglive_fe_pc', { get() { getters++; throw new Error('unexpected getter'); } });
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  assert.equal(runtime(dom).adapter.getWebpackRequire, undefined);
  assert.equal(getters, 0);
});

test('site adapter installs once and a duplicate bundle leaves the same adapter', async t => {
  const dom = page();
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  const first = runtime(dom).adapter;
  load(dom, 'web/site-adapter.js');
  assert.equal(runtime(dom).adapter, first);
});

test('site adapter without a runtime performs no installation', t => {
  const dom = page();
  t.after(() => dom.window.close());
  load(dom, 'web/site-adapter.js');
  assert.equal(Object.getOwnPropertyDescriptor(dom.window, dom.window.Symbol.for('cheese-knife.runtime.v1')), undefined);
});

test('missing adapter limits only adapter-backed features', async t => {
  const dom = page(playerHTML);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'web/runtime.js'); deliver(dom, { showDeleted: true, hideDonation: true });
  load(dom, 'web/player.js'); load(dom, 'web/inject.js');
  assert.equal(runtime(dom).route().kind, 'live');
  assert.equal(runtime(dom).configReady, true);
  assert.equal(runtime(dom).statuses.player.state, 'pending');
  for (const feature of ['donationChat', 'deletedChat', 'chatTimestamp']) {
    assert.equal(runtime(dom).statuses[feature].state, 'pending');
    assert.equal(runtime(dom).statuses[feature].reason, 'site-adapter-unavailable');
  }
  assert.equal(runtime(dom).statuses.configuration.state, 'ready');
});
