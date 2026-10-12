const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, clock } = require('./helpers.cjs');

test('runtime observation preserves absence before load and after final pagehide', t => {
  const dom = page(); t.after(() => dom.window.close());
  assert.equal(runtime(dom), undefined);
  load(dom, 'web/runtime.js');
  const api = runtime(dom); assert.ok(api);
  assert.equal(typeof api.requestId, 'string');
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
  assert.equal(runtime(dom), undefined);
});

test('deliver requires a loaded runtime instead of asserting away absence', t => {
  const dom = page(); t.after(() => dom.window.close());
  assert.throws(() => deliver(dom), { code: 'ERR_ASSERTION' });
});

test('raw malformed config and revisions reach the real bridge validator unchanged', t => {
  const dom = page(); t.after(() => dom.window.close()); load(dom, 'web/runtime.js');
  const api = runtime(dom); assert.ok(api);
  /** @type {MessageEvent<unknown> | undefined} */
  let received;
  dom.window.addEventListener('message', event => { received = event; });
  deliver(dom, { arrowSeek: false }, 2);
  assert.equal(api.configReady, true); assert.equal(api.config.arrowSeek, false);
  /** @type {unknown[]} */
  const configs = [null, [], 'wrong'];
  for (const config of configs) {
    deliver(dom, config, 3);
    assert.ok(received);
    assert.equal(Reflect.get(Object(received.data), 'config'), config);
  }
  /** @type {unknown[]} */
  const revisions = ['3', NaN, Infinity];
  for (const revision of revisions) {
    deliver(dom, { arrowSeek: true }, revision);
    assert.ok(received);
    assert.equal(Reflect.get(Object(received.data), 'revision'), revision);
  }
  assert.equal(api.config.arrowSeek, false);
  deliver(dom, { arrowSeek: true }, 3);
  assert.equal(api.config.arrowSeek, true);
});

test('fixture clock preserves deadline, cancellation and same-time registration order', async t => {
  const dom = page(); t.after(() => dom.window.close()); const time = clock(dom);
  /** @type {number[]} */
  const seen = [];
  dom.window.setTimeout(() => seen.push(1), 10);
  const cancelled = dom.window.setTimeout(() => seen.push(99), 10);
  dom.window.setTimeout(() => seen.push(2), 10);
  dom.window.clearTimeout(cancelled);
  await time.advance(9); assert.deepEqual(seen, []);
  await time.advance(1); assert.deepEqual(seen, [1, 2]);
});

test('fixture clock keeps DOM mutation delivery and microtask timer rescheduling real', async t => {
  const dom = page(); t.after(() => dom.window.close()); const time = clock(dom);
  /** @type {string[]} */
  const seen = [];
  const observer = new dom.window.MutationObserver(() => seen.push('mutation'));
  observer.observe(dom.window.document.body, { childList: true }); t.after(() => observer.disconnect());
  dom.window.setTimeout(() => {
    dom.window.document.body.append(dom.window.document.createElement('div'));
    void Promise.resolve().then(() => dom.window.setTimeout(() => seen.push('timer'), 0));
  }, 10);
  await time.advance(10); assert.deepEqual(seen, ['mutation', 'timer']);
});

test('fixture clock bounds a zero-delay loop instead of hanging', async t => {
  const dom = page(); t.after(() => dom.window.close()); const time = clock(dom);
  const repeat = () => { dom.window.setTimeout(repeat, 0); };
  repeat();
  await assert.rejects(time.advance(0), /Browser timeout loop did not converge/);
});
