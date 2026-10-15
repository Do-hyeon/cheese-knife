const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { page, playerHTML, load, flush } = require('./helpers.cjs');
const keyName = 'cheese-knife.player-gain.private.v3';
function setup(t, withNavigation = false, delayed = false) {
  const dom = page(playerHTML), messages = [], roots = [], replies = [], handlers = [];
  const server = { value: 0.75, epoch: 0, writeCode: null, delayed };
  const addListener = dom.window.EventTarget.prototype.addEventListener;
  dom.window.EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (this instanceof dom.window.HTMLInputElement || this instanceof dom.window.HTMLButtonElement) handlers.push({ target: this, type, listener });
    return addListener.call(this, type, listener, options);
  };
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'currentSrc', { value: 'blob:https://chzzk.naver.com/unit-source', configurable: true });
  const attach = dom.window.Element.prototype.attachShadow;
  dom.window.Element.prototype.attachShadow = function(options) { const root = attach.call(this, options); roots.push(root); return root; };
  const listeners = new Set();
  const navigation = new dom.window.EventTarget();
  if (withNavigation) Object.defineProperty(dom.window, 'navigation', { value: navigation });
  dom.window.chrome = { extension: { inIncognitoContext: false }, i18n: { getMessage: () => '' },
    runtime: { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', sendMessage(message, callback) {
      messages.push(structuredClone(message));
      const code = message.action === 'set-gain' ? server.writeCode : null;
      const view = { ok: true, ticket: 'unit-ticket', workerEpoch: 'unit-worker', gainEpoch: server.epoch, cold: messages.length === 1,
        scope: 'global', channelId: null, origin: 'global-owned', value: server.value, storedValue: server.value, inherited: false, token: null,
        version: { globalRevision: server.epoch, mediaRevision: 0 } };
      const reply = () => callback({ protocol: 3, ok: !code, code, requestId: message.requestId, stored: false, view });
      if (server.delayed) replies.push(reply); else reply();
    } }, storage: { onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'media-profiles.js');
  if (fs.existsSync('web/player-gain.js')) load(dom, 'web/player-gain.js');
  const probe = () => Object.getOwnPropertyDescriptor(dom.window, dom.window.Symbol.for(keyName))?.get?.call(dom.window);
  // Unit-only invocation of registered handlers; real trusted input remains a separate installed-browser gate.
  const gesture = (target, type) => {
    const handler = handlers.find(item => item.target === target && item.type === type);
    assert.ok(handler); handler.listener.call(target, { target, type, isTrusted: true, stopPropagation() {}, preventDefault() {} });
  };
  return { dom, video, messages, roots, listeners, probe, navigation, replies, server, gesture };
}
test('isolated Gain owns a closed root with bounded read-only probe and synthetic inputs never stage a commit', async t => {
  const { dom, messages, roots, probe } = setup(t); await flush();
  const host = dom.window.document.querySelector('.knife-gain-owner'); assert.ok(host, 'production isolated owner must exist');
  assert.equal(host.shadowRoot, null); assert.equal(roots.length, 1);
  const facts = probe(); assert.equal(facts.owned, true); assert.equal(facts.intent, null);
  assert.deepEqual(Object.keys(facts).sort(), ['bindingId', 'intent', 'legacyValue', 'owned', 'url']);
  const input = roots[0].querySelector('input'); assert.ok(input);
  let siteKeys = 0; host.parentElement.addEventListener('keydown', () => { siteKeys++; });
  input.value = '1.5';
  for (const event of [new dom.window.Event('input', { bubbles: true }), new dom.window.Event('change', { bubbles: true }),
    new dom.window.MouseEvent('dblclick', { bubbles: true }), new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })]) input.dispatchEvent(event);
  await flush(); assert.equal(messages.filter(item => item.action === 'set-gain').length, 0); assert.equal(probe().intent, null);
  assert.equal(siteKeys, 0);
});
test('platform navigation retires old binding even if route returns to the same URL', async t => {
  const { dom, probe, navigation, messages } = setup(t, true); await flush();
  const binding = probe().bindingId;
  navigation.dispatchEvent(new dom.window.Event('navigate')); await flush();
  assert.notEqual(probe().bindingId, binding);
  assert.equal(messages.filter(item => item.action === 'set-gain').length, 0);
});
test('invalidated runtime is not called during final page cleanup', async t => {
  const { dom, listeners } = setup(t); await flush();
  dom.window.chrome.runtime.id = undefined;
  dom.window.chrome.storage.onChanged.removeListener = () => { assert.fail('invalidated extension API was called'); };
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush();
  assert.equal(Object.getOwnPropertyDescriptor(dom.window, dom.window.Symbol.for(keyName)), undefined);
  listeners.clear();
});
test('external host replacement retires the old authority without transferring private intent', async t => {
  const { dom, probe, messages } = setup(t); await flush(); assert.equal(probe()?.owned, true);
  const host = dom.window.document.querySelector('.knife-gain-owner'), replacement = host.cloneNode(true);
  host.replaceWith(replacement); await flush();
  assert.equal(probe()?.owned, false); assert.equal(messages.filter(item => item.action === 'set-gain').length, 0);
});
test('same-video PZP-only owner reparent preserves the actual private host and binding after fresh validation', async t => {
  const { dom, video, probe } = setup(t); await flush();
  const initial = probe(); assert.equal(initial?.owned, true);
  const host = dom.window.document.querySelector('.knife-gain-owner'), old = dom.window.document.querySelector('.pzp-pc');
  const next = old.cloneNode(true); next.querySelector('.knife-gain-owner')?.remove(); next.querySelector('video').replaceWith(video); old.replaceWith(next);
  await flush(); await flush();
  assert.strictEqual(dom.window.document.querySelector('.knife-gain-owner'), host);
  assert.equal(probe()?.owned, true); assert.equal(probe().bindingId, initial.bindingId);
});
test('wanted master pending keeps the owned Gain visible without refocusing another control', async t => {
  const { dom, roots, messages } = setup(t); await flush();
  const document = dom.window.document, host = document.querySelector('.knife-gain-owner');
  const master = document.createElement('div'); master.className = 'knife-comp'; master.dataset.state = 'on';
  host.parentElement.append(master); await flush();
  assert.equal(host.hidden, false); assert.equal(host.style.display, 'inline-flex');
  const other = document.createElement('button'); document.body.append(other); other.focus();
  master.dataset.state = 'pending'; await flush();
  assert.equal(host.hidden, false, 'temporary config refresh is not master OFF');
  assert.equal(host.style.display, 'inline-flex'); assert.strictEqual(document.activeElement, other);
  assert.equal(roots[0].querySelector('input').disabled, false);
  assert.equal(messages.filter(item => item.action === 'set-gain').length, 0);
  master.dataset.state = 'off'; await flush();
  assert.equal(host.hidden, true); assert.equal(host.style.display, 'none');
});
test('reparent while preparation is pending locks input without starting a parallel view request', async t => {
  const { dom, video, messages, replies, roots, probe } = setup(t, false, true); await flush();
  const initial = probe(), host = dom.window.document.querySelector('.knife-gain-owner'), old = dom.window.document.querySelector('.pzp-pc');
  const next = old.cloneNode(true); next.querySelector('.knife-gain-owner')?.remove(); next.querySelector('video').replaceWith(video); old.replaceWith(next);
  await flush(); assert.equal(messages.length, 1, 'pending request is not duplicated');
  assert.equal(roots[0].querySelector('input').disabled, true);
  replies.shift()(); await flush(); assert.equal(messages.length, 2, 'fresh validation follows the pending request');
  replies.shift()(); await flush();
  assert.strictEqual(dom.window.document.querySelector('.knife-gain-owner'), host);
  assert.equal(probe().bindingId, initial.bindingId); assert.equal(host.dataset.phase, 'ready');
});
for (const [code, phase] of [['gain-busy', 'failed'], ['gain-unknown', 'unknown'], ['gain-conflict', 'conflict']]) {
  test(`same-video reparent keeps ${phase} draft locked without any automatic request`, async t => {
    const { dom, video, roots, server, gesture, messages, probe } = setup(t); await flush();
    const input = roots[0].querySelector('input'), host = dom.window.document.querySelector('.knife-gain-owner'), binding = probe().bindingId;
    server.writeCode = code;
    gesture(input, 'pointerdown'); input.value = '1.5'; gesture(input, 'input'); await flush();
    await new Promise(resolve => setTimeout(resolve, 300)); await flush();
    assert.equal(host.dataset.phase, phase); assert.equal(input.value, '1.5');
    assert.equal(messages.filter(item => item.action === 'set-gain').length, 1);
    const count = messages.length, old = dom.window.document.querySelector('.pzp-pc'), next = old.cloneNode(true);
    next.querySelector('.knife-gain-owner')?.remove(); next.querySelector('video').replaceWith(video); old.replaceWith(next);
    await flush(); await new Promise(resolve => setTimeout(resolve, 300)); await flush();
    assert.strictEqual(dom.window.document.querySelector('.knife-gain-owner'), host); assert.equal(probe().bindingId, binding);
    assert.equal(host.dataset.phase, phase, 'layout movement must not discard a failed/unknown/conflict lock');
    assert.equal(input.disabled, true); assert.equal(input.value, '1.5'); assert.equal(roots[0].querySelector('button').hidden, false);
    assert.equal(messages.length, count, 'neither a fresh view nor a new write may restart the failed gesture');
  });
}
test('clean Gain refresh drains every pending invalidation before previewing or declaring the last value ready', async t => {
  const { dom, roots, server, replies, listeners } = setup(t, false, true);
  replies.shift()(); await flush();
  const previews = [], input = roots[0].querySelector('input'), host = dom.window.document.querySelector('.knife-gain-owner');
  dom.window.postMessage = message => { if (message.type === 'gain-preview') previews.push(message.value); };
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { source: dom.window, origin: dom.window.location.origin,
    data: { namespace: 'cheese-knife', protocol: 3, type: 'config', requestId: 'unit-config', audioBindingGeneration: 1,
      context: { routePath: dom.window.location.pathname, documentGeneration: 1, playerGeneration: 1, channelId: null } } }));
  const notify = () => { for (const fn of listeners) fn({ config: {} }, 'local'); };
  server.value = 1; server.epoch++; notify();
  server.value = 1.5; server.epoch++; notify();
  replies.shift()(); await flush();
  assert.equal(host.dataset.phase, 'loading'); assert.equal(input.disabled, true);
  assert.deepEqual(previews, [], 'an invalidated old response must not be applied to audio');
  assert.equal(replies.length, 1, 'a coalesced next read must consume the newer notification');
  server.value = 0.25; server.epoch++; notify();
  replies.shift()(); await flush();
  assert.equal(host.dataset.phase, 'loading'); assert.deepEqual(previews, []); assert.equal(replies.length, 1);
  replies.shift()(); await flush();
  assert.equal(host.dataset.phase, 'ready'); assert.equal(input.value, '0.25'); assert.equal(input.disabled, false);
  assert.deepEqual(previews, [0.25]);
});
test('repeated Gain invalidation never extends the original five-second read deadline', async t => {
  const { dom, server, replies, listeners, messages, roots } = setup(t, false, true);
  replies.shift()(); await flush();
  let now = Date.now(); dom.window.Date.now = () => now;
  for (const fn of listeners) fn({ config: {} }, 'local');
  server.value = 1.5; server.epoch++;
  for (const fn of listeners) fn({ config: {} }, 'local');
  now += 5001; replies.shift()(); await flush();
  assert.equal(dom.window.document.querySelector('.knife-gain-owner').dataset.phase, 'failed');
  assert.equal(roots[0].querySelector('input').disabled, true);
  assert.equal(replies.length, 0); assert.equal(messages.length, 2, 'expired read must not start a fresh five-second request');
});
test('explicit Gain recovery stays single-flight across same-video reparent and never resends the discarded draft', async t => {
  const { dom, video, roots, server, gesture, messages, replies } = setup(t); await flush();
  const input = roots[0].querySelector('input'), host = dom.window.document.querySelector('.knife-gain-owner');
  server.writeCode = 'gain-busy'; gesture(input, 'pointerdown'); input.value = '1.5'; gesture(input, 'input');
  await flush(); await new Promise(resolve => setTimeout(resolve, 300)); await flush();
  assert.equal(host.dataset.phase, 'failed');
  server.delayed = true; gesture(roots[0].querySelector('button'), 'click');
  const old = dom.window.document.querySelector('.pzp-pc'), next = old.cloneNode(true);
  next.querySelector('.knife-gain-owner')?.remove(); next.querySelector('video').replaceWith(video); old.replaceWith(next);
  await flush(); assert.equal(replies.length, 1, 'explicit recovery read must remain the only pending owner request');
  replies.shift()(); await flush(); assert.equal(replies.length, 1, 'reparent invalidation is consumed by the same read chain');
  replies.shift()(); await flush();
  assert.equal(host.dataset.phase, 'ready'); assert.equal(input.value, '0.75'); assert.equal(input.disabled, false);
  assert.equal(messages.filter(item => item.action === 'set-gain').length, 1, 'recovery discards rather than retries the failed draft');
});
test('genuine route change and final pagehide invalidate private owner and detach extension subscriptions', async t => {
  const { dom, probe, listeners } = setup(t); await flush(); assert.equal(probe()?.owned, true);
  const initial = probe().bindingId;
  dom.window.history.pushState({}, '', '/video/12345'); dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate')); await flush();
  assert.notEqual(probe()?.bindingId, initial);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush();
  assert.equal(Object.getOwnPropertyDescriptor(dom.window, dom.window.Symbol.for(keyName)), undefined); assert.equal(listeners.size, 0);
});
