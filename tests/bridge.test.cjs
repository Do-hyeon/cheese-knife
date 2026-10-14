const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliverScoped: deliver, playerHTML, flush } = require('./helpers.cjs');

/** @typedef {{config: Record<string, unknown>, styleParameters: Record<string, unknown>}} Snapshot */
/** @param {import('node:test').TestContext} t @param {boolean} mainFirst @param {() => Promise<Snapshot>} [get] */
function bridge(t, mainFirst, get = async () => ({ config: { arrowSeek: false }, styleParameters: {} })) {
  const dom = page(playerHTML);
  /** @type {((changes: unknown) => void) | undefined} */
  let storageListener;
  dom.window.chrome = {
    storage: { local: { get,
      onChanged: {
        /** @param {(changes: unknown) => void} fn */
        addListener(fn) { storageListener = fn; }, removeListener() {},
      } } },
    i18n: {
      /** @param {string} key */
      getMessage: key => key,
    },
    runtime: { id: 'fixture-extension-id', onMessage: { addListener() {}, removeListener() {} } },
  };
  load(dom, 'media-profiles.js'); load(dom, 'config.js');
  if (mainFirst) { load(dom, 'web/main.js'); load(dom, 'web/runtime.js'); }
  else { load(dom, 'web/runtime.js'); load(dom, 'web/main.js'); }
  t.after(async () => {
    dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
    await flush(); dom.window.close();
  });
  return { dom,
    /** @param {unknown} changes */
    storageListener(changes) { assert.ok(storageListener); storageListener(changes); },
  };
}

for (const mainFirst of [true, false]) test(`settings handshake works with ISOLATED script first=${mainFirst}`, async t => {
  const { dom } = bridge(t, mainFirst);
  const Message = /** @type {import('./helpers.cjs').FixtureMessageEventConstructor} */ (dom.window.MessageEvent);
  // jsdom intentionally does not provide postMessage event.source/origin;
  // cross-world message transport is the one external boundary substituted.
  dom.window.postMessage = data => {
    queueMicrotask(() => dom.window.dispatchEvent(new Message('message', {
      source: dom.window, origin: dom.window.location.origin, data,
    })));
  };
  const api = runtime(dom); assert.ok(api);
  dom.window.dispatchEvent(new Message('message', {
    source: dom.window, origin: dom.window.location.origin,
    data: { namespace: 'cheese-knife', protocol: 2, type: 'config-request', requestId: api.mediaRequestId,context:{...api.media.context} },
  }));
  await flush();
  assert.equal(api.configReady, true);
  assert.equal(api.config.arrowSeek, false);
  assert.equal(api.config.previewWidth, 400);
  assert.equal(api.i18n.fastForward, 'content_fastForward');
  assert.equal(api.i18n.previewAudioBlocked, 'content_previewAudioBlocked');
  assert.equal(api.i18n.previewAudioRightClick, 'content_previewAudioRightClick');
});

for (const latest of [{ 'chat-font-size': 8 }, {}]) test(`initial style snapshot does not overwrite a newer parameter event: ${Object.keys(latest).length ? 'offset' : 'reset'}`, async t => {
  /** @type {((snapshot: Snapshot) => void) | undefined} */
  let resolveRead;
  let calls = 0;
  const { dom, storageListener } = bridge(t, false, () => ++calls === 1 ? new Promise(resolve => { resolveRead = resolve; }) : Promise.resolve({ config: {}, styleParameters: latest }));
  const Message = /** @type {import('./helpers.cjs').FixtureMessageEventConstructor} */ (dom.window.MessageEvent);
  storageListener({ styleParameters: { newValue: latest } });
  const api = runtime(dom); assert.ok(api);
  dom.window.dispatchEvent(new Message('message', {
    source: dom.window, origin: dom.window.location.origin,
    data: { namespace: 'cheese-knife', protocol: 2, type: 'config-request', requestId: api.mediaRequestId,context:{...api.media.context} },
  }));
  assert.ok(resolveRead); resolveRead({ config: {}, styleParameters: { 'chat-font-size': 4 } }); await flush();
  assert.equal(dom.window.document.documentElement.style.getPropertyValue('--knife-chat-size-1'), Object.keys(latest).length ? '8px' : '');
});
