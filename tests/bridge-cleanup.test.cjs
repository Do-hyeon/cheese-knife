const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load } = require('./helpers.cjs');
const { event } = require('./settings-fixture.cjs');

// Only Chrome's external API boundary is substituted. The content script,
// DOM, page transition events and error delivery are real.
async function bridge(t, sharedChanges = event()) {
  const dom = page(), faults = new Map(), attempts = [], errors = [];
  const lifecycle = new Map([['pageshow', []], ['pagehide', []]]);
  const nativeAdd = dom.window.addEventListener.bind(dom.window);
  const nativeRemove = dom.window.removeEventListener.bind(dom.window);
  const capture = options => typeof options === 'boolean' ? options : Boolean(options?.capture);
  // Record exact lifecycle subscriptions while forwarding to the real DOM.
  // Inert callbacks still retain resources, so a disposed guard alone is not
  // proof that their registered callback/capture pair was actually removed.
  dom.window.addEventListener = (type, fn, options) => {
    nativeAdd(type, fn, options);
    const active = lifecycle.get(type);
    if (active && !active.some(item => item.fn === fn && item.capture === capture(options))) {
      active.push({ fn, capture: capture(options) });
    }
  };
  dom.window.removeEventListener = (type, fn, options) => {
    nativeRemove(type, fn, options);
    const active = lifecycle.get(type);
    const index = active?.findIndex(item => item.fn === fn && item.capture === capture(options));
    if (index >= 0) active.splice(index, 1);
  };
  const messages = event();
  let saved = { config: {}, styleParameters: { 'chat-font-size': 8 } }, reads = 0;
  const apiEvent = (name, source) => ({
    addListener: fn => source.addListener(fn),
    removeListener(fn) {
      attempts.push(name);
      if (faults.has(name)) throw faults.get(name);
      source.removeListener(fn);
    },
  });
  dom.window.chrome = {
    storage: { local: { onChanged: apiEvent('storage', sharedChanges),
      get: async () => { reads++; return structuredClone(saved); } } },
    runtime: { id: 'fixture-extension-id', onMessage: apiEvent('runtime', messages) },
    i18n: { getMessage: key => key },
  };
  dom.window.addEventListener('error', e => { errors.push(e.error); e.preventDefault(); });
  load(dom, 'media-profiles.js'); load(dom, 'config.js'); load(dom, 'web/main.js');
  await dom.window.eval('requestLatestSettings()');
  const signal = () => sharedChanges.emit({ settingsRevision: { newValue: 1 } });
  const publishStatuses = statuses => dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    source: dom.window, origin: dom.window.location.origin,
    data: { namespace: 'cheese-knife', protocol: 1, type: 'status', statuses },
  }));
  const status = state => publishStatuses({ probe: { state } });
  status('ready');
  t.after(() => { faults.clear(); dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); dom.window.close(); });
  return { dom, faults, attempts, errors, messages, status, publishStatuses, signal, lifecycle,
    invalidate() { dom.window.chrome.runtime.id = undefined; },
    hide(persisted = false) { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted })); },
    show() { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true })); },
    settle: () => dom.window.eval('requestLatestSettings()'),
    setFont(value) { saved.styleParameters['chat-font-size'] = value; },
    reads: () => reads,
  };
}

test('final pagehide never calls Chrome cleanup APIs after context invalidation', async t => {
  const h = await bridge(t);
  h.invalidate();
  h.hide();
  assert.deepEqual(h.attempts, [], 'invalidated Chrome API boundaries must not be touched');
  assert.deepEqual(h.errors, []);
  assertPageDetached(h);
});

test('status bridge keeps thirty valid own entries and rejects inherited or reserved keys', async t => {
  const h = await bridge(t);
  const statuses = Object.create({ inherited: { state: 'ready', reason: 'foreign' } });
  Object.defineProperty(statuses, 'constructor', { enumerable: true, value: { state: 'ready', reason: 'reserved' } });
  for (let index = 0; index < 31; index++) {
    Object.defineProperty(statuses, `feature${String(index).padStart(2, '0')}`, {
      enumerable: true, value: { state: 'limited', reason: index === 0 ? 'r'.repeat(100) : `reason-${index}` },
    });
  }
  h.publishStatuses(statuses);
  const payload = JSON.parse(h.dom.window.document.getElementById('knife-status').textContent);
  const keys = Object.keys(payload.statuses);
  assert.deepEqual(keys, Array.from({ length: 30 }, (_value, index) => `feature${String(index).padStart(2, '0')}`));
  assert.equal(payload.statuses.feature00.reason, 'r'.repeat(80));
  assert.equal(Object.getPrototypeOf(payload.statuses), Object.prototype);
  assert.equal(Object.hasOwn(payload.statuses, 'inherited'), false);
  assert.equal(Object.hasOwn(payload.statuses, 'constructor'), false);
});

function assertPageDetached(h) {
  for (const [type, active] of h.lifecycle) {
    assert.equal(active.length, 0, type + ' must release its exact registered callback/capture pair');
  }
  const before = h.dom.window.document.getElementById('knife-status').textContent;
  h.status('failed');
  assert.equal(h.dom.window.document.getElementById('knife-status').textContent, before,
    'terminated bridge must not keep consuming page messages');
  const attempts = [...h.attempts];
  h.hide(); h.hide(true); h.show();
  assert.deepEqual(h.attempts, attempts, 'terminated bridge must not retry API cleanup');
}

// Break caught: an invalidated removal aborts the other API cleanup or leaves
// the page message handler attached. Catching all errors would fail below.
for (const failing of [['storage'], ['runtime'], ['storage', 'runtime']]) {
  test('final pagehide tolerates invalidation in ' + failing.join('+') + ' and detaches the page', async t => {
    const h = await bridge(t);
    for (const name of failing) h.faults.set(name, new Error('Extension context invalidated.'));
    h.hide();
    assert.deepEqual(h.errors, [], 'expected invalidation is not an uncaught error');
    assert.deepEqual(h.attempts, ['storage', 'runtime'], 'both independent removals are attempted');
    if (!failing.includes('runtime')) assert.equal(h.messages.listeners.size, 0);
    assertPageDetached(h);
  });
}

for (const failing of ['storage', 'runtime']) {
  test('unexpected ' + failing + ' cleanup failure remains observable after page detachment', async t => {
    const h = await bridge(t), failure = new Error('unexpected-' + failing + '-failure');
    h.faults.set(failing, failure); h.hide();
    assert.equal(h.errors.length, 1); assert.equal(h.errors[0], failure);
    assert.deepEqual(h.attempts, ['storage', 'runtime']);
    assertPageDetached(h);
  });
}

test('two unexpected cleanup failures retain both causes instead of masking one another', async t => {
  const h = await bridge(t), storage = new Error('storage-failure'), runtime = new Error('runtime-failure');
  h.faults.set('storage', storage); h.faults.set('runtime', runtime); h.hide();
  assert.equal(h.errors.length, 1);
  assert.ok(Array.isArray(h.errors[0].errors), 'reported failure must retain both cleanup causes');
  assert.deepEqual(Array.from(h.errors[0].errors), [storage, runtime]);
  assertPageDetached(h);
});

test('valid BFCache freeze retains subscriptions and rereads latest settings on restoration', async t => {
  const h = await bridge(t); h.hide(true); h.setFont(12); h.signal();
  await h.settle();
  assert.equal(h.dom.window.document.documentElement.style.getPropertyValue('--knife-chat-size-1'), '8px');
  assert.deepEqual(h.attempts, []); assert.equal(h.messages.listeners.size, 1);
  for (const active of h.lifecycle.values()) assert.equal(active.length, 1, 'BFCache retains the registered lifecycle handlers');
  h.show(); await h.settle();
  assert.equal(h.dom.window.document.documentElement.style.getPropertyValue('--knife-chat-size-1'), '12px');
  h.hide(); assert.deepEqual(h.attempts, ['storage', 'runtime']); assert.deepEqual(h.errors, []);
  assertPageDetached(h);
});

test('one invalidated page closing does not stop another page settings subscription', async t => {
  const changes = event(), a = await bridge(t, changes), b = await bridge(t, changes);
  a.faults.set('storage', new Error('Extension context invalidated.')); a.hide();
  assert.deepEqual(a.errors, []); assertPageDetached(a);
  const before = a.reads(); b.setFont(12); b.signal(); await b.settle();
  assert.equal(b.dom.window.document.documentElement.style.getPropertyValue('--knife-chat-size-1'), '12px');
  assert.equal(a.reads(), before, 'disposed page cannot read even if the external boundary retains its callback');
});
