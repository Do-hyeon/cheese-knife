const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const subject = () => import('../scripts/check-installed-transition.mjs');
const id = 'a'.repeat(32);

function fixture(t, { enabled = false, fault } = {}) {
  const dom = new JSDOM('<extensions-manager></extensions-manager>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const manager = dom.window.document.querySelector('extensions-manager').attachShadow({ mode: 'open' });
  manager.innerHTML = '<extensions-toolbar></extensions-toolbar><extensions-item-list></extensions-item-list>';
  const toolbar = manager.querySelector('extensions-toolbar').attachShadow({ mode: 'open' });
  toolbar.innerHTML = '<cr-toggle id="devMode"></cr-toggle>';
  const toggle = toolbar.querySelector('#devMode'); toggle.checked = enabled; toggle.disabled = fault === 'locked';
  const list = manager.querySelector('extensions-item-list').attachShadow({ mode: 'open' });
  list.innerHTML = `<extensions-item id="${id}"></extensions-item>`;
  const item = list.querySelector('extensions-item');
  item.data = { id, version: '2.13.3', state: 'ENABLED', disableReasons: { unsupportedDeveloperExtension: false, blockedByPolicy: false, reloading: false } };
  if (fault === 'missing-target') item.remove();
  const events = [], writes = [], worker = new EventEmitter(); let clicked = 0;
  toggle.addEventListener('click', () => { clicked++; if (fault !== 'toggle-noop') toggle.checked = !toggle.checked; events.push('mode-click'); });
  const chrome = { runtime: { id, getManifest: () => ({ version: '2.13.3' }), reload: () => {
    events.push('reload');
    if (fault === 'reload') throw Object.assign(Error('reload-failed'), { code: 'test-reload' });
    if (!toggle.checked) { item.data.state = 'DISABLED'; item.data.disableReasons.unsupportedDeveloperExtension = true; }
    if (fault !== 'worker-stays') { worker.emit('close'); events.push('old-close'); }
    if (fault === 'wrong-version') item.data.version = '2.13.4';
    if (fault === 'blocked') item.data.disableReasons.blockedByPolicy = true;
  } }, storage: { local: { set() { writes.push('set'); throw Error('must not seed'); }, clear() { writes.push('clear'); throw Error('must not clear'); } } } };
  worker.evaluate = async fn => vm.runInNewContext(`(${fn.toString()})()`, { chrome });
  const context = { newPage: async () => ({
    goto: async url => {
      if (url === 'chrome://extensions') { events.push('manager-open'); return; }
      assert.equal(url, `chrome-extension://${id}/popup.html`);
      if (['popup', 'popup-and-close'].includes(fault) || !toggle.checked || item.data.state !== 'ENABLED') throw Object.assign(Error('popup-blocked'), { code: 'test-popup' });
      events.push('popup-wake');
    },
    evaluate: async (fn, arg) => dom.window.eval(`(${fn.toString()})`)(arg),
    waitForFunction: async (fn, arg) => {
      if (!dom.window.eval(`(${fn.toString()})`)(arg)) throw Object.assign(Error('UI-timeout'), { code: 'test-ui-timeout' });
    },
    locator: selector => ({ click: async () => { assert.equal(selector, 'extensions-toolbar #devMode'); toggle.click(); } }),
    close: async () => { events.push('page-close'); if (fault === 'close' || fault === 'popup-and-close') throw Object.assign(Error('page-close'), { code: 'test-page-close' }); },
  }) };
  const next = {}, reacquire = async (actual, previous, milliseconds, options) => {
    assert.equal(actual, context); assert.equal(previous, worker); assert.deepEqual(options, { reusePrevious: false });
    assert.ok(events.includes('old-close')); assert.ok(events.includes('popup-wake')); events.push('fresh-worker');
    return { worker: next, extensionId: fault === 'wrong-id' ? 'b'.repeat(32) : id };
  };
  return { launched: { context, worker, extensionId: id }, reacquire, next, events, writes, clicked: () => clicked };
}

for (const enabled of [false, true]) test(`normal UI mode preparation enabled=${enabled} closes old worker before popup and never writes storage`, async t => {
  const { refreshTransitionWorker } = await subject(), f = fixture(t, { enabled });
  const result = await refreshTransitionWorker(f.launched, f.reacquire, 25);
  assert.equal(result.worker, f.next); assert.equal(f.clicked(), enabled ? 0 : 1); assert.deepEqual(f.writes, []);
  assert.ok(f.events.indexOf('old-close') < f.events.indexOf('popup-wake'));
  assert.deepEqual(result.preparation, { developerMode: true, workerClosed: true, extensionId: id, version: '2.13.3', state: 'ENABLED' });
});

for (const [fault, code] of [['locked', 'transition-developer-mode-locked'], ['missing-target', 'transition-preparation-timeout'],
  ['toggle-noop', 'transition-preparation-timeout'], ['worker-stays', 'transition-worker-close-timeout'], ['wrong-version', 'transition-preparation-timeout'],
  ['blocked', 'transition-preparation-timeout'], ['reload', 'test-reload'], ['popup', 'test-popup'], ['wrong-id', 'transition-execution'], ['close', 'test-page-close']]) {
  test(`preparation ${fault} fails without a success proof or fallback`, async t => {
    const { refreshTransitionWorker } = await subject(), f = fixture(t, { fault });
    await assert.rejects(refreshTransitionWorker(f.launched, f.reacquire, 25), { code });
    assert.deepEqual(f.writes, []);
    if (['locked', 'missing-target', 'toggle-noop'].includes(fault)) assert.equal(f.events.includes('reload'), false);
    if (['worker-stays', 'wrong-version', 'blocked'].includes(fault)) assert.equal(f.events.includes('popup-wake'), false);
  });
}

test('popup failure retains both helper cleanup errors without masking its primary error', async t => {
  const { refreshTransitionWorker } = await subject(), f = fixture(t, { fault: 'popup-and-close' });
  await assert.rejects(refreshTransitionWorker(f.launched, f.reacquire, 25), error => {
    assert.equal(error.code, 'test-popup'); assert.deepEqual(error.cleanupErrors, [{ code: 'test-page-close' }, { code: 'test-page-close' }]); return true;
  });
});

test('preparation refuses timeout overrides outside its fixed maximum before browser access', async () => {
  const { refreshTransitionWorker } = await subject();
  for (const value of [0, -1, 15001, NaN, '25']) await assert.rejects(refreshTransitionWorker({}, null, value), { code: 'transition-preparation-timeout-invalid' });
});
