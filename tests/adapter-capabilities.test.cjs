const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const { page, load, runtime, flush } = require('./helpers.cjs');

function setup(t, html = '') {
  const dom = page(html);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  return { dom, adapter: runtime(dom).adapter };
}

test('adapter publishes only the bounded capability surface', t => {
  const { adapter } = setup(t);
  assert.deepEqual(Array.from(Object.keys(adapter)).sort(), ['affectsDiscovery', 'banner', 'chat', 'discover', 'player', 'video']);
});

function attachState(node, value) {
  const hook = { memoizedState: value, next: null };
  node.__reactFiber$fixture = { memoizedState: hook, return: null };
  return hook;
}

function message(overrides = {}) {
  return { key: 'fixture', user: 'synthetic', time: 123, playerMessageTime: 456,
    type: 1, status: 'NORMAL', content: 'content', ...overrides };
}

async function sourceReader(dom) {
  const result = await build({ stdin: {
    contents: "import { createReactReader } from './src/main/site-adapter/react.ts'; globalThis.__knifeSourceReader = createReactReader();",
    resolveDir: path.resolve('.'), sourcefile: 'adapter-reader-fixture.ts', loader: 'ts',
  }, bundle: true, format: 'iife', platform: 'browser', target: 'chrome121', write: false, logLevel: 'silent' });
  dom.window.eval(result.outputFiles[0].text);
  return dom.window.__knifeSourceReader;
}

function controllerFixture(overrides = {}) {
  let updates = 0, receiver;
  const controller = {
    emptyMessage: { status: 'NORMAL' },
    messageList: [message()],
    messageFilter(value) { receiver = this; return value.type === 99 ? 0 : 'native-allowed'; },
    notiUpdateMessageList() { updates++; },
    notiBlindListener(event) {
      const index = this.messageList.findIndex(value => value.time === event.messageTime && value.user === event.userId);
      if (index >= 0) this.messageList[index] = { ...this.messageList[index], status: event.blindType };
      this.notiUpdateMessageList();
      return 'native-result';
    },
    ...overrides,
  };
  controller.notiBlindListener = controller.notiBlindListener.bind(controller);
  const originalBlind = controller.notiBlindListener;
  const entry = { listener: originalBlind, once: false };
  controller.chatClient = { _events: { notiBlind: [entry] } };
  return { controller, entry, originalBlind, get updates() { return updates; }, get receiver() { return receiver; } };
}

test('React traversal reads own data only and caches a throwing proxy failure', async t => {
  const { dom } = setup(t), reader = await sourceReader(dom);
  const inherited = Object.create({ __reactFiber$bad: { memoizedState: null } });
  assert.equal(reader.fiberOf(inherited), null);
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, '__reactFiber$bad', { enumerable: true, get() { getterCalls++; return {}; } });
  assert.equal(reader.fiberOf(accessor), null);
  assert.equal(getterCalls, 0);
  let proxyCalls = 0;
  const proxy = new Proxy({}, { ownKeys() { proxyCalls++; throw new Error('fixture-proxy'); } });
  assert.equal(reader.fiberOf(proxy), null);
  assert.equal(reader.fiberOf(proxy), null);
  assert.equal(proxyCalls, 1);
  let descriptorCalls = 0;
  const descriptorProxy = new Proxy({}, {
    ownKeys() { return ['__reactFiber$fixture']; },
    getOwnPropertyDescriptor() { descriptorCalls++; throw new Error('fixture-descriptor-proxy'); },
  });
  assert.equal(reader.fiberOf(descriptorProxy), null);
  assert.equal(reader.fiberOf(descriptorProxy), null);
  assert.equal(descriptorCalls, 1);
});

test('fiber and hook traversal stop at 300 and cycles return null', async t => {
  const { dom } = setup(t), reader = await sourceReader(dom);
  const node = {}, head = { memoizedState: null, return: null };
  node.__reactFiber$fixture = head;
  let fiber = head;
  for (let i = 1; i < 300; i++) fiber = fiber.return = { memoizedState: null, return: null };
  fiber.return = { memoizedState: { memoizedState: { target: true }, next: null }, return: null };
  assert.equal(reader.stateOf(node, value => value.target === true), null);
  head.return = head;
  assert.equal(reader.stateOf(node, () => false), null);

  const hookNode = {}, hookHead = { memoizedState: null, next: null };
  hookNode.__reactFiber$fixture = { memoizedState: hookHead, return: null };
  let hook = hookHead;
  for (let i = 1; i < 300; i++) hook = hook.next = { memoizedState: null, next: null };
  hook.next = { memoizedState: { target: true }, next: null };
  assert.equal(reader.stateOf(hookNode, value => value.target === true), null);
  hookHead.next = hookHead;
  assert.equal(reader.stateOf(hookNode, () => false), null);
});

test('private context traversal stops at 100 and cycles return null', async t => {
  const { dom } = setup(t), reader = await sourceReader(dom), node = {};
  const first = { memoizedValue: null, next: null };
  node.__reactFiber$fixture = { dependencies: { firstContext: first }, return: null };
  let context = first;
  for (let i = 1; i < 100; i++) context = context.next = { memoizedValue: null, next: null };
  context.next = { memoizedValue: { target: true }, next: null };
  assert.equal(reader.contextOf(node, value => value.target === true), null);
  first.next = first;
  assert.equal(reader.contextOf(node, () => false), null);
});

test('discover selects one route player and exact sidebar without broad fallbacks', t => {
  const html = '<div id="root"><div id="layout-body"><div id="live_player_layout"><div class="pzp-pc"><video></video></div></div>' +
    '<div class="knife-preview"><div class="pzp-pc"><video></video></div></div></div><aside>foreign</aside><nav>foreign</nav><aside id="sidebar"></aside></div>';
  const { dom, adapter } = setup(t, html);
  const site = adapter.discover(dom.window.document, runtime(dom).route());
  assert.equal(site.player.video.closest('#live_player_layout').id, 'live_player_layout');
  assert.equal(site.sidebar.id, 'sidebar');
  dom.window.document.querySelector('#live_player_layout').insertAdjacentHTML('beforeend', '<div class="pzp-pc"><video></video></div>');
  assert.equal(adapter.discover(dom.window.document, runtime(dom).route()).player, null);
  dom.window.document.getElementById('sidebar').remove();
  assert.equal(adapter.discover(dom.window.document, runtime(dom).route()).sidebar, null);
});

test('readMessage returns bounded primitive snapshots with stable numeric identity', t => {
  const { dom, adapter } = setup(t);
  const row = dom.window.document.createElement('div'), source = message();
  row.__reactProps$fixture = { children: { props: { chatMessage: source } } };
  const first = adapter.chat.readMessage(row), second = adapter.chat.readMessage(row);
  assert.equal(Number.isSafeInteger(first.identity), true);
  assert.equal(second.identity, first.identity);
  assert.deepEqual({ ...first, identity: 0 }, { identity: 0, key: 'fixture', user: 'synthetic', time: 123,
    playerTime: 456, type: 1, status: 'NORMAL', content: 'content' });
  source.content = 'x'.repeat(65537);
  assert.equal(adapter.chat.readMessage(row), null);
  source.content = 'ok'; source.time = Infinity;
  assert.equal(adapter.chat.readMessage(row), null);
  source.time = 123; source.key = 'x'.repeat(257);
  assert.equal(adapter.chat.readMessage(row), null);
  source.key = 'fixture'; let getters = 0;
  Object.defineProperty(source, 'content', { configurable: true, enumerable: true, get() { getters++; return 'unsafe'; } });
  assert.equal(adapter.chat.readMessage(row), null);
  assert.equal(getters, 0);
});

test('banner video and player capabilities preserve receiver and expose primitives only', async t => {
  const { dom, adapter } = setup(t);
  const banner = dom.window.document.createElement('div'), receiver = { calls: 0, closeHandler() { this.calls++; return 'closed'; } };
  banner.__reactFiber$fixture = { return: { memoizedProps: receiver } };
  const close = adapter.banner.closeHandler(banner);
  assert.equal(close(), 'closed'); assert.equal(receiver.calls, 1);
  const videoNode = dom.window.document.createElement('span');
  attachState(videoNode, [{ openDate: '2026-10-12 10:00:00' }]);
  assert.equal(adapter.video.openDate(videoNode), '2026-10-12 10:00:00');
  const layout = dom.window.document.createElement('div');
  const core = { _currentCodecs: { video: 'avc1.640028', audio: 'mp4a.40.2' } };
  attachState(layout, { _corePlayer: core });
  const metrics = await adapter.player.readMetrics(layout);
  assert.equal(metrics.codec, 'avc1.640028, mp4a.40.2');
  assert.deepEqual(Object.keys(metrics), ['codec']);
  assert.equal(Object.values(metrics).includes(core), false);
  core._currentCodecs.video = 'x'.repeat(257);
  assert.equal(await adapter.player.readMetrics(layout), null);
});

test('chat connect reuses a controller port and message filter owns only its replacement', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  const first = controllerFixture(); const hook = attachState(container, first.controller);
  const port = adapter.chat.connect(container);
  assert.equal(adapter.chat.connect(container), port);
  const binding = port.installMessageFilter(snapshot => snapshot?.type === 10);
  assert.equal(first.controller.messageFilter(message({ type: 10 })), false);
  assert.equal(first.controller.messageFilter(message({ type: 1 })), 'native-allowed');
  assert.equal(first.receiver, first.controller);
  const foreign = () => 'foreign'; first.controller.messageFilter = foreign;
  binding.dispose(); assert.equal(first.controller.messageFilter, foreign);
  const second = controllerFixture(); hook.memoizedState = second.controller;
  assert.notEqual(adapter.chat.connect(container), port);
});

test('blind listener exposes snapshots and identity-checked replacement while preserving native result', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  const fixture = controllerFixture(); attachState(container, fixture.controller);
  const port = adapter.chat.connect(container); let transition;
  const binding = port.installBlindListener(value => { transition = value; });
  const result = fixture.entry.listener({ messageTime: 123, userId: 'synthetic', blindType: 'BLIND' });
  assert.equal(result, 'native-result');
  assert.equal(transition.event.blindType, 'BLIND');
  assert.equal(transition.before.status, 'NORMAL');
  assert.equal(transition.after.status, 'BLIND');
  const visible = transition.replaceAfterStatus(transition.after, 'NORMAL');
  assert.equal(visible.status, 'NORMAL');
  assert.equal(fixture.controller.messageList[0].status, 'NORMAL');
  assert.equal(fixture.updates, 2);
  assert.equal(binding.active, true);
  binding.dispose();
  assert.equal(fixture.controller.notiBlindListener, fixture.originalBlind);
  assert.equal(fixture.entry.listener, fixture.originalBlind);
});

test('status replacement rolls back its exact slot when native publication fails', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  const fixture = controllerFixture({ notiUpdateMessageList() { throw new Error('fixture-update'); } });
  const original = fixture.controller.messageList[0];
  attachState(container, fixture.controller);
  const port = adapter.chat.connect(container), before = port.messages()[0];
  assert.equal(port.replaceStatus(before, 'BLIND'), null);
  assert.equal(fixture.controller.messageList[0], original);
  assert.equal(original.status, 'NORMAL');
});

test('status replacement ignores a hostile length getter and replaces exactly one owned slot', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  const target = [message({ status: 'BLIND' })];
  const fixture = controllerFixture({ messageList: new Proxy(target, { get(value, key, receiver) {
    return key === 'length' ? Infinity : Reflect.get(value, key, receiver);
  } }) });
  attachState(container, fixture.controller);
  const port = adapter.chat.connect(container), before = port.messages()[0];
  const visible = port.replaceStatus(before, 'NORMAL');
  assert.equal(visible.status, 'NORMAL');
  assert.equal(target[0].status, 'NORMAL');
  assert.equal(fixture.updates, 1);
});

test('status replacement rolls back the exact Proxy slot without reading its hostile length getter', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  const original = message({ status: 'BLIND' }), target = [original]; let lengthReads = 0;
  const fixture = controllerFixture({
    messageList: new Proxy(target, { get(value, key, receiver) {
      if (key === 'length') { lengthReads++; return Infinity; }
      return Reflect.get(value, key, receiver);
    } }),
    notiUpdateMessageList() { throw new Error('fixture-update'); },
  });
  attachState(container, fixture.controller);
  const port = adapter.chat.connect(container), before = port.messages()[0];
  assert.equal(port.replaceStatus(before, 'NORMAL'), null);
  assert.equal(target[0], original);
  assert.equal(target[0].status, 'BLIND');
  assert.equal(lengthReads, 0);
});

test('blind listener reconnect unwraps only its exact copied callback', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  const fixture = controllerFixture(); attachState(container, fixture.controller);
  const port = adapter.chat.connect(container), first = port.installBlindListener(() => {});
  const copied = fixture.entry.listener, foreign = () => 'foreign';
  const freshEntry = { listener: copied, once: false }, foreignEntry = { listener: foreign, once: false };
  fixture.controller.chatClient = { _events: { notiBlind: [foreignEntry, freshEntry] } };
  const second = port.installBlindListener(() => {});
  assert.notEqual(second, first);
  assert.equal(fixture.entry.listener, fixture.originalBlind);
  assert.equal(foreignEntry.listener, foreign);
  assert.notEqual(freshEntry.listener, copied);
  second.dispose(); second.dispose(); port.dispose(); port.dispose();
  assert.equal(freshEntry.listener, fixture.originalBlind);
  assert.equal(foreignEntry.listener, foreign);
});

test('blind listener reconnects when the same client replaces its event array', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  const fixture = controllerFixture(); attachState(container, fixture.controller);
  const port = adapter.chat.connect(container), first = port.installBlindListener(() => {});
  const copied = fixture.entry.listener, foreign = () => 'foreign';
  const freshEntry = { listener: copied, once: false }, foreignEntry = { listener: foreign, once: false };
  fixture.controller.chatClient._events.notiBlind = [foreignEntry, freshEntry];
  assert.equal(first.active, false);
  const second = port.installBlindListener(() => {});
  assert.notEqual(second, first);
  assert.equal(fixture.entry.listener, fixture.originalBlind);
  assert.equal(foreignEntry.listener, foreign);
  assert.notEqual(freshEntry.listener, copied);
  second.dispose();
  assert.equal(freshEntry.listener, fixture.originalBlind);
  assert.equal(foreignEntry.listener, foreign);
});

test('blind listener disposal unwraps an exact callback copied into a replacement array', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  const fixture = controllerFixture(); attachState(container, fixture.controller);
  const port = adapter.chat.connect(container), first = port.installBlindListener(() => {});
  const copied = fixture.entry.listener, foreign = () => 'foreign';
  const freshEntry = { listener: copied, once: false }, foreignEntry = { listener: foreign, once: false };
  fixture.controller.chatClient._events.notiBlind = [foreignEntry, freshEntry];
  assert.equal(first.active, false);
  port.dispose();
  assert.equal(freshEntry.listener, fixture.originalBlind);
  assert.equal(foreignEntry.listener, foreign);
  const next = adapter.chat.connect(container);
  assert.notEqual(next, port);
  assert.ok(next.installBlindListener(() => {}));
  next.dispose();
});

test('blind listener contains thenables and stale list identity without overwriting foreign handlers', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  const thenable = { then() {} };
  const fixture = controllerFixture({ notiBlindListener() { return thenable; } });
  fixture.controller.notiBlindListener = fixture.controller.notiBlindListener.bind(fixture.controller);
  fixture.entry.listener = fixture.controller.notiBlindListener;
  attachState(container, fixture.controller);
  const port = adapter.chat.connect(container); let transition;
  const binding = port.installBlindListener(value => { transition = value; });
  assert.equal(fixture.entry.listener({ messageTime: 123, userId: 'synthetic', blindType: 'BLIND' }), thenable);
  assert.equal(transition.before.status, 'NORMAL');
  assert.equal(transition.after, null);
  assert.equal(transition.replaceAfterStatus(transition.before, 'BLIND'), null);
  const before = port.messages()[0];
  const initialStatus = fixture.controller.messageList[0].status;
  assert.equal(port.replaceStatus(before, null), null);
  assert.equal(fixture.controller.messageList[0].status, initialStatus);
  fixture.controller.messageList = [message({ key: 'foreign' })];
  assert.equal(port.replaceStatus(before, 'BLIND'), null);
  const foreign = () => 'foreign'; fixture.entry.listener = foreign; fixture.controller.notiBlindListener = foreign;
  binding.dispose(); port.dispose();
  assert.equal(fixture.entry.listener, foreign);
  assert.equal(fixture.controller.notiBlindListener, foreign);
});

test('blind listener preserves native handling when a hostile list length throws', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  let nativeCalls = 0;
  const fixture = controllerFixture({ notiBlindListener() { nativeCalls++; return 'native-result'; } });
  fixture.controller.notiBlindListener = fixture.controller.notiBlindListener.bind(fixture.controller);
  fixture.entry.listener = fixture.controller.notiBlindListener;
  fixture.controller.messageList = new Proxy([], { get(target, key, receiver) {
    if (key === 'length') throw new Error('fixture-length');
    return Reflect.get(target, key, receiver);
  } });
  attachState(container, fixture.controller);
  const port = adapter.chat.connect(container), binding = port.installBlindListener(() => assert.fail('no transition expected'));
  assert.equal(port.messages().length, 0);
  assert.equal(fixture.entry.listener({ messageTime: 1, userId: 'x', blindType: 'BLIND' }), 'native-result');
  assert.equal(nativeCalls, 1);
  binding.dispose();
});

test('blind listener treats an accessor then result as unsupported without exposing after state', t => {
  const { dom, adapter } = setup(t), container = dom.window.document.createElement('aside');
  const result = {};
  Object.defineProperty(result, 'then', { get() { throw new Error('fixture-then'); } });
  const fixture = controllerFixture({ notiBlindListener(event) {
    this.messageList[0] = { ...this.messageList[0], status: event.blindType };
    return result;
  } });
  fixture.controller.notiBlindListener = fixture.controller.notiBlindListener.bind(fixture.controller);
  fixture.entry.listener = fixture.controller.notiBlindListener;
  attachState(container, fixture.controller);
  let transition;
  const binding = adapter.chat.connect(container).installBlindListener(value => { transition = value; });
  assert.equal(fixture.entry.listener({ messageTime: 123, userId: 'synthetic', blindType: 'BLIND' }), result);
  assert.equal(transition.before.status, 'NORMAL');
  assert.equal(transition.after, null);
  assert.equal(transition.replaceAfterStatus(transition.before, 'NORMAL'), null);
  binding.dispose();
});
