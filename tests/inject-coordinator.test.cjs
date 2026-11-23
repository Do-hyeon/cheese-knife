const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliverScoped: deliver, flush } = require('./helpers.cjs');

const channel = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const bodyHTML = id => `<div id="layout-body" data-instance="${id}"><section><div role="tablist"><button>Videos</button></div><main><div id="live_player_layout"><div class="pzp-pc"><button class="pzp-pc__viewmode-button" aria-label="Wide screen"></button><video></video></div></div><aside id="chat-${id}"><div role="log"></div></aside><div id="banner-${id}" class="band_banner_container__fixture"></div></main></section></div>`;
const sidebarHTML = '<aside id="sidebar"><nav class="_section_popular" aria-label="인기 카테고리"></nav><nav aria-label="팔로우"><button aria-label="새로고침"></button><div class="_box_fixture"><button class="_more_button_fixture" aria-expanded="true"></button></div><a id="live-anchor" href="/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb">Live</a></nav></aside>';

function controller() { return { messageList: [], emptyMessage: { status: 'NORMAL' }, messageFilter() { return true; } }; }
function attachOwnedState(dom, body) {
  const chat = body.querySelector('aside');
  chat.__reactFiber$fixture = { memoizedState: { memoizedState: controller(), next: null }, return: null };
  const banner = body.querySelector('[class^="band_banner_container__"]');
  banner.__reactFiber$fixture = { return: { memoizedProps: { closeHandler() {} } } };
  return { chat, banner };
}

function monitorInject(dom) {
  const OriginalObserver = dom.window.MutationObserver;
  const observers = new Set(); let observerCreates = 0;
  dom.window.MutationObserver = class extends OriginalObserver {
    constructor(callback) { super(callback); observerCreates++; observers.add(this); }
    disconnect() { observers.delete(this); return super.disconnect(); }
  };
  const nativeSetInterval = dom.window.setInterval.bind(dom.window), nativeClearInterval = dom.window.clearInterval.bind(dom.window);
  const intervals = new Set();
  dom.window.setInterval = (callback, delay) => { const id = nativeSetInterval(callback, delay); intervals.add(id); return id; };
  dom.window.clearInterval = id => { intervals.delete(id); return nativeClearInterval(id); };
  const knife = runtime(dom), originalSubscribe = knife.subscribe.bind(knife); let subscriptions = 0;
  knife.subscribe = callback => { subscriptions++; return originalSubscribe(callback); };
  return { observers, intervals, observerCreates: () => observerCreates, subscriptions: () => subscriptions };
}

function setup(t, { url = `https://chzzk.naver.com/live/${channel}`, config = {} } = {}) {
  const dom = page(`<div id="root">${bodyHTML('one')}${sidebarHTML}</div>`, url);
  dom.window.document.documentElement.style.setProperty('--knife-chat-resize', '1');
  dom.window.document.documentElement.style.setProperty('--knife-chat-timestamp', '1');
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  const first = attachOwnedState(dom, dom.window.document.getElementById('layout-body'));
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  deliver(dom, { updateSidebar: true, expandFollowings: false, ...config });
  const monitor = monitorInject(dom);
  return { dom, first, monitor, start() { load(dom, 'web/inject.js'); } };
}

test('single subscriber preserves reconcile order and reuses one owner for same-generation updates', async t => {
  const f = setup(t); const knife = runtime(f.dom), calls = [];
  const connect = knife.adapter.chat.connect.bind(knife.adapter.chat);
  knife.adapter.chat.connect = container => {
    calls.push('chat');
    assert.equal(f.dom.window.document.querySelector('nav._section_popular').dataset.knifeSidebarSection, 'popular', 'sidebar reconciles before chat');
    return connect(container);
  };
  const closeHandler = knife.adapter.banner.closeHandler.bind(knife.adapter.banner);
  knife.adapter.banner.closeHandler = node => { calls.push('banner'); return closeHandler(node); };
  f.start();
  assert.equal(f.monitor.subscriptions(), 1);
  assert.deepEqual(calls, ['chat', 'banner']);
  assert.equal(f.dom.window.document.querySelectorAll('.knife-resize-handle').length, 1);
  assert.equal(f.dom.window.document.querySelectorAll('[class^="band_banner_container__"] > .knife-owned').length, 1);
  assert.equal(f.monitor.observers.size, 5);
  assert.equal(f.monitor.intervals.size, 1);
  const created = f.monitor.observerCreates();

  knife.notify();
  assert.equal(f.monitor.subscriptions(), 1); assert.equal(f.monitor.observerCreates(), created);
  assert.equal(f.monitor.observers.size, 5); assert.equal(f.monitor.intervals.size, 1);
  assert.deepEqual(calls, ['chat', 'banner', 'chat']);
  load(f.dom, 'web/inject.js');
  assert.equal(f.monitor.subscriptions(), 1, 'duplicate bundle preserves the existing coordinator');

  deliver(f.dom, { updateSidebar: false, expandFollowings: false }, 2);
  assert.equal(f.monitor.observerCreates(), created, 'config updates resync without replacing the owner');
  assert.equal(f.monitor.intervals.size, 0);
  deliver(f.dom, { updateSidebar: true, expandFollowings: false }, 3);
  assert.equal(f.monitor.intervals.size, 1);
});

test('owner generation replacement retires old resources before binding the replacement', async t => {
  const f = setup(t); f.start(); const knife = runtime(f.dom), document = f.dom.window.document;
  const oldBody = document.getElementById('layout-body'), oldHandle = document.querySelector('.knife-resize-handle');
  const oldBannerButton = oldBody.querySelector('[class^="band_banner_container__"] > .knife-owned');
  const replacement = document.createElement('div'); replacement.innerHTML = bodyHTML('two');
  const nextBody = replacement.firstElementChild; attachOwnedState(f.dom, nextBody); oldBody.replaceWith(nextBody);
  knife.reconcile(); await flush();
  assert.equal(oldHandle.isConnected, false); assert.equal(oldBannerButton.isConnected, false);
  assert.equal(document.querySelectorAll('.knife-resize-handle').length, 1);
  assert.equal(document.querySelector('[class^="band_banner_container__"] > .knife-owned').isConnected, true);
  assert.equal(f.monitor.observers.size, 5); assert.equal(f.monitor.intervals.size, 1);
  assert.equal(f.monitor.observerCreates(), 10, 'five owner observers are replaced, never layered');

  f.dom.window.dispatchEvent(new f.dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(document.querySelectorAll('.knife-resize-handle').length, 1);
  assert.equal(f.monitor.observers.size, 5, 'persisted pagehide retains resumable owner state');
  f.dom.window.dispatchEvent(new f.dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(f.monitor.observers.size, 5);
  f.dom.window.dispatchEvent(new f.dom.window.PageTransitionEvent('pagehide'));
  assert.equal(document.querySelectorAll('.knife-resize-handle').length, 0);
  assert.equal(document.querySelectorAll('[data-knife-sidebar-section]').length, 0);
  assert.equal(f.monitor.observers.size, 0); assert.equal(f.monitor.intervals.size, 0);
});

function drop(dom, href) {
  const event = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: { getData: type => type === 'knife-data' ? href : '', types: ['knife-data'] } },
    pageX: { value: 640 }, pageY: { value: 40 },
  });
  dom.window.document.getElementById('layout-body').dispatchEvent(event);
  return event;
}

test('popup registry accepts only local live URLs and final or excluded disposal retires every iframe', async t => {
  const f = setup(t, { config: { popupPlayer: true } }); f.start(); const document = f.dom.window.document;
  assert.equal(drop(f.dom, 'https://foreign.invalid/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb').defaultPrevented, false);
  assert.equal(document.querySelectorAll('.knife-popup').length, 0);
  assert.equal(drop(f.dom, '/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb').defaultPrevented, true);
  assert.equal(drop(f.dom, '/live/cccccccccccccccccccccccccccccccc').defaultPrevented, true);
  const popups = [...document.querySelectorAll('.knife-popup')];
  assert.deepEqual(popups.map(node => node.style.zIndex), ['1000', '1001']);
  const firstFrame = popups[0].querySelector('iframe'); popups[0].querySelector('button').click();
  assert.equal(popups[0].isConnected, false); assert.equal(firstFrame.src, 'about:blank');
  f.dom.window.dispatchEvent(new f.dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(document.querySelectorAll('.knife-popup').length, 1, 'persisted pagehide retains popup ownership');
  f.dom.reconfigure({ url: 'https://chzzk.naver.com/settings/profile' }); runtime(f.dom).reconcile(); await flush();
  assert.equal(document.querySelectorAll('.knife-popup').length, 0, 'excluded navigation retires remaining popups');
});

test('route owner moves home and channel decorations without retaining foreign roots', async t => {
  const f = setup(t, { url: 'https://chzzk.naver.com/' }); f.start(); const document = f.dom.window.document, knife = runtime(f.dom);
  const body = document.getElementById('layout-body');
  assert.equal(body.dataset.knifeHome, '1'); assert.equal(document.querySelector('.knife-channel-chat'), null);
  f.dom.reconfigure({ url: `https://chzzk.naver.com/${channel}` }); knife.reconcile();
  assert.equal(body.dataset.knifeHome, undefined); assert.equal(document.querySelectorAll('.knife-channel-chat').length, 1);
  f.dom.reconfigure({ url: 'https://chzzk.naver.com/following' }); knife.reconcile();
  assert.equal(document.querySelector('.knife-channel-chat'), null); assert.equal(body.dataset.knifeHome, undefined);
});

test('chat discovery and status-reporting failures do not block later feature reconciliation', async t => {
  await t.test('chat discovery', t => {
    const f = setup(t); const knife = runtime(f.dom); let banners = 0;
    knife.adapter.chat.findContainer = () => { throw new Error('fixture-chat'); };
    const close = knife.adapter.banner.closeHandler.bind(knife.adapter.banner);
    knife.adapter.banner.closeHandler = node => { banners++; return close(node); };
    assert.doesNotThrow(() => f.start());
    assert.equal(banners, 1); assert.equal(knife.statuses.donationChat?.state, 'failed');
  });
  await t.test('status reporting', t => {
    const f = setup(t); const knife = runtime(f.dom); let banners = 0;
    knife.adapter.sidebar.sections = () => { throw new Error('fixture-sidebar'); };
    const setStatus = knife.setStatus.bind(knife);
    knife.setStatus = (feature, ...args) => { if (feature === 'sidebarRefresh') throw new Error('fixture-status'); return setStatus(feature, ...args); };
    const close = knife.adapter.banner.closeHandler.bind(knife.adapter.banner);
    knife.adapter.banner.closeHandler = node => { banners++; return close(node); };
    assert.doesNotThrow(() => f.start()); assert.equal(banners, 1);
  });
});

test('owner disposal failure cannot prevent the replacement generation from binding', async t => {
  const f = setup(t); const knife = runtime(f.dom), document = f.dom.window.document;
  const createScope = knife.createScope.bind(knife); let first = true;
  knife.createScope = () => {
    const scope = createScope();
    if (first) {
      first = false; const dispose = scope.dispose.bind(scope);
      scope.dispose = () => { dispose(); throw new Error('fixture-dispose'); };
    }
    return scope;
  };
  f.start();
  const oldBody = document.getElementById('layout-body'), replacement = document.createElement('div');
  replacement.innerHTML = bodyHTML('replacement'); const nextBody = replacement.firstElementChild;
  attachOwnedState(f.dom, nextBody); oldBody.replaceWith(nextBody);
  assert.doesNotThrow(() => knife.reconcile());
  assert.equal(document.querySelectorAll('.knife-resize-handle').length, 1);
  assert.equal(nextBody.querySelector('[class^="band_banner_container__"] > .knife-owned')?.isConnected, true);
});

test('preview and popup callback failures stay inside their feature boundaries', async t => {
  const f = setup(t, { config: { preview: true, popupPlayer: true } }); const knife = runtime(f.dom), errors = [];
  knife.preview = { diagnostics: {}, show() { throw new Error('fixture-preview'); }, hide() {} };
  f.dom.window.addEventListener('error', event => { errors.push(event.error); event.preventDefault(); });
  f.start();
  f.dom.window.document.getElementById('live-anchor').dispatchEvent(new f.dom.window.MouseEvent('mouseenter', { bubbles: true }));
  const create = f.dom.window.document.createElement.bind(f.dom.window.document);
  f.dom.window.document.createElement = name => { if (name === 'div') throw new Error('fixture-popup'); return create(name); };
  assert.equal(drop(f.dom, '/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb').defaultPrevented, false);
  f.dom.window.document.createElement = create;
  assert.deepEqual(errors, []);
  assert.equal(f.dom.window.document.querySelectorAll('.knife-popup').length, 0);
});

test('one popup disposer failure cannot retain sibling popups on excluded navigation', async t => {
  const f = setup(t, { config: { popupPlayer: true } }); f.start(); const knife = runtime(f.dom), document = f.dom.window.document;
  const createScope = knife.createScope.bind(knife); let first = true;
  knife.createScope = () => {
    const scope = createScope();
    if (first) {
      first = false; const dispose = scope.dispose.bind(scope);
      scope.dispose = () => { dispose(); throw new Error('fixture-popup-dispose'); };
    }
    return scope;
  };
  drop(f.dom, '/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  drop(f.dom, '/live/cccccccccccccccccccccccccccccccc');
  assert.equal(document.querySelectorAll('.knife-popup').length, 2);
  f.dom.reconfigure({ url: 'https://chzzk.naver.com/settings/profile' }); knife.reconcile();
  assert.equal(document.querySelectorAll('.knife-popup').length, 0);
});

test('foreign coordinator ownership is untouched and final disposal is idempotent', async t => {
  await t.test('foreign owner', t => {
    const f = setup(t); const knife = runtime(f.dom); knife.coordinatorStarted = true;
    f.start(); assert.equal(f.monitor.subscriptions(), 0); assert.equal(f.dom.window.document.querySelector('.knife-resize-handle'), null);
  });
  await t.test('repeated final pagehide', t => {
    const f = setup(t); f.start(); const knife = runtime(f.dom), event = () => new f.dom.window.PageTransitionEvent('pagehide');
    f.dom.window.dispatchEvent(event()); f.dom.window.dispatchEvent(event()); knife.notify();
    assert.equal(f.monitor.observers.size, 0); assert.equal(f.monitor.intervals.size, 0);
    assert.equal(f.dom.window.document.querySelector('.knife-resize-handle'), null);
  });
});
