const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliverScoped: deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t, html = playerHTML, url) {
  const dom = page(html, url);
  t.after(async () => {
    dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
    await flush();
    dom.window.close();
  });
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js');
  load(dom, 'web/site-adapter.js');
  return dom;
}

test('hidden player replacement is reconciled even when animation frames never run', async t => {
  const dom=page(playerHTML);
  t.after(()=>{dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));dom.window.close();});
  Object.defineProperty(dom.window.document,'hidden',{configurable:true,value:true});
  dom.window.requestAnimationFrame=()=>1;dom.window.cancelAnimationFrame=()=>{};
  load(dom,'media-profiles.js');load(dom,'web/runtime.js');load(dom,'web/site-adapter.js');
  const knife=runtime(dom),old=knife.state.player.video,next=dom.window.document.createElement('video');
  old.replaceWith(next);
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal(knife.state.player.video,next,'a hidden player must not retain the detached video while rAF is suspended');
});

async function scheduledPage(t) {
  const dom=page(playerHTML),{window}=dom;
  if(window.document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));
  let hidden=true,nextId=0,reconciles=0;
  const timers=new Map(),frames=new Map();
  Object.defineProperty(window.document,'hidden',{configurable:true,get:()=>hidden});
  window.setTimeout=(fn,delay)=>{const id=++nextId;timers.set(id,{fn,delay});return id;};
  window.clearTimeout=id=>timers.delete(id);
  window.requestAnimationFrame=fn=>{const id=++nextId;frames.set(id,fn);return id;};
  window.cancelAnimationFrame=id=>frames.delete(id);
  t.after(()=>{window.dispatchEvent(new window.PageTransitionEvent('pagehide'));window.close();});
  load(dom,'media-profiles.js');load(dom,'web/runtime.js');load(dom,'web/site-adapter.js');deliver(dom);
  const knife=runtime(dom),reconcile=knife.reconcile;
  knife.reconcile=()=>{reconciles++;reconcile();};
  return {dom,knife,timers,frames,count:()=>reconciles,
    visibility(value){hidden=value;window.document.dispatchEvent(new window.Event('visibilitychange'));}};
}

test('hidden relevant mutations coalesce into one bounded task without polling or owned DOM feedback',async t=>{
  const {dom,knife,timers,frames,count}=await scheduledPage(t),document=dom.window.document;
  const owned=document.createElement('button');owned.className='knife-owned';document.body.append(owned);await flush();
  assert.equal(timers.size,0);assert.equal(frames.size,0);assert.equal(count(),0);
  const first=document.createElement('video'),latest=document.createElement('video');
  knife.state.player.video.replaceWith(first);first.replaceWith(latest);await flush();
  assert.equal(frames.size,0);assert.equal(timers.size,1);assert.equal(count(),0);
  const [id,task]=[...timers][0];assert.equal(task.delay,100);
  knife.schedule();knife.schedule();assert.equal(timers.size,1);
  timers.delete(id);task.fn();assert.equal(knife.state.player.video,latest);assert.equal(count(),1);
  deliver(dom);await flush();assert.equal(timers.size,0);assert.equal(frames.size,0);
});

test('visibility changes cancel both scheduling kinds and stale tasks cannot consume the new frame',async t=>{
  const state=await scheduledPage(t),{dom,knife,timers,frames,count}=state;
  knife.schedule();const old=[...timers.values()][0];assert.ok(old,'hidden reconciliation must not depend on rAF');
  state.visibility(false);deliver(dom);assert.equal(timers.size,0);
  knife.schedule();knife.schedule();assert.equal(frames.size,1);assert.equal(timers.size,0);
  const before=count();old.fn();assert.equal(count(),before);assert.equal(frames.size,1);
  const frame=[...frames.values()][0];
  state.visibility(true);deliver(dom);assert.equal(frames.size,0);
  knife.schedule();const pending=[...timers.values()][0];assert.ok(pending);
  const hiddenBefore=count();frame();assert.equal(count(),hiddenBefore);assert.equal(timers.size,1);
  pending.fn();assert.equal(count(),hiddenBefore+1);
});

test('BFCache and final disposal retire hidden tasks including callbacks delivered after a new schedule',async t=>{
  const state=await scheduledPage(t),{dom,knife,timers,count}=state,{window}=dom;
  knife.schedule();const old=[...timers.values()][0];assert.ok(old);
  window.dispatchEvent(new window.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(timers.size,0);
  const frozenCount=count();state.visibility(false);state.visibility(true);assert.equal(count(),frozenCount);
  window.dispatchEvent(new window.PageTransitionEvent('pageshow',{persisted:true}));deliver(dom);
  knife.schedule();const current=[...timers.values()][0];assert.ok(current);
  const before=count();old.fn();assert.equal(count(),before);assert.equal(timers.size,1);
  window.dispatchEvent(new window.PageTransitionEvent('pagehide'));assert.equal(timers.size,0);
  current.fn();assert.equal(count(),before);assert.equal(runtime(dom),undefined);
});

test('runtime stays useful without an adapter and late adapter reconciles exactly once', t => {
  const dom = page(playerHTML), key = dom.window.Symbol.for('cheese-knife.runtime.v1');
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js');
  const knife = runtime(dom);
  assert.equal(knife.route().kind, 'live');
  assert.equal(knife.state.body, null);
  assert.equal(knife.state.sidebar, null);
  assert.equal(knife.state.player, null);
  let reconciles = 0;
  const reconcile = knife.reconcile;
  knife.reconcile = () => { reconciles++; return reconcile(); };
  load(dom, 'web/site-adapter.js');
  assert.equal(reconciles, 1);
  assert.equal(knife.state.player.video.tagName, 'VIDEO');
  load(dom, 'web/site-adapter.js');
  assert.equal(reconciles, 1);
  assert.equal(Object.getOwnPropertyDescriptor(dom.window, key)?.value, knife);
});

test('runtime installs an own singleton instead of trusting an inherited symbol value', t => {
  const dom = page(playerHTML);
  const key = dom.window.Symbol.for('cheese-knife.runtime.v1');
  const prototype = Object.getPrototypeOf(dom.window);
  Object.defineProperty(prototype, key, { configurable: true, value: { foreign: true } });
  t.after(async () => {
    delete prototype[key];
    dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
    await flush(); dom.window.close();
  });
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js');
  const descriptor = Object.getOwnPropertyDescriptor(dom.window, key);
  assert.ok(descriptor, 'the page runtime must be an own property');
  assert.notEqual(descriptor.value, prototype[key]);
  assert.equal(descriptor.value.requestId.startsWith('knife-'), true);
});

test('runtime status keys reject prototype names and preserve a bounded ordinary snapshot', t => {
  const dom = setup(t), knife = runtime(dom);
  const baseline=Object.keys(knife.statuses);
  const beforePrototype = Object.getPrototypeOf(knife.statuses);
  for (const key of ['__proto__', 'prototype', 'constructor', '', 'a'.repeat(41), 'bad key']) {
    knife.setStatus(key, 'ready', 'must-not-appear');
  }
  knife.setStatus('validFeature', 'limited', 'x'.repeat(100));
  assert.equal(Object.getPrototypeOf(knife.statuses), beforePrototype);
  assert.deepEqual(Object.keys(knife.statuses), [...baseline,'validFeature']);
  assert.equal(knife.statuses.validFeature.state, 'limited');
  assert.equal(knife.statuses.validFeature.reason, 'x'.repeat(80));
});

test('VOD route remains VOD when the same player class is present', t => {
  const dom = setup(t, playerHTML.replace('live_player_layout', 'player_layout'), 'https://chzzk.naver.com/video/123456');
  assert.equal(runtime(dom).route().kind, 'vod');
  assert.equal(runtime(dom).selectPlayer().video.tagName, 'VIDEO');
});

test('nonchannel paths and excluded routes cannot become channel/player routes', t => {
  const dom = setup(t, playerHTML, 'https://chzzk.naver.com/following');
  assert.equal(runtime(dom).route().kind, 'explore');
  assert.equal(runtime(dom).selectPlayer(), null);
  dom.reconfigure({ url: 'https://chzzk.naver.com/settings/anything' });
  assert.equal(runtime(dom).route().kind, 'excluded');
});

test('preview video is not selected as the main player', t => {
  const dom = setup(t, '<div class="knife-preview"><div class="pzp-pc"><video></video></div></div>' + playerHTML);
  assert.equal(runtime(dom).selectPlayer().video.closest('#live_player_layout').id, 'live_player_layout');
});

test('delayed root and video replacement are reconciled without duplicate runtime', async t => {
  const dom = setup(t, '');
  const original = runtime(dom);
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js');
  assert.equal(runtime(dom), original);
  dom.window.document.body.innerHTML = playerHTML;
  await flush();
  const first = runtime(dom).state.player.video;
  first.replaceWith(dom.window.document.createElement('video'));
  await flush();
  assert.notEqual(runtime(dom).state.player.video, first);
});

test('late site layout divs trigger adapter discovery without leaking selectors into runtime', async t => {
  const dom = setup(t, '<div id="root"></div>');
  assert.equal(runtime(dom).state.body, null);
  const body = dom.window.document.createElement('div');
  body.id = 'layout-body';
  dom.window.document.getElementById('root').append(body);
  await flush();
  assert.equal(runtime(dom).state.body, body);
});

test('late license anchor triggers one adapter-owned discovery reconciliation', async t => {
  const dom = setup(t, playerHTML + '<div id="license"></div>'), knife = runtime(dom);
  let reconciles = 0;
  const reconcile = knife.reconcile;
  knife.reconcile = () => { reconciles++; return reconcile(); };
  const anchor = dom.window.document.createElement('a'); anchor.href = '/license'; anchor.textContent = 'License';
  dom.window.document.getElementById('license').append(anchor);
  await flush();
  assert.equal(reconciles, 1);
});

test('config accepts current same-window response and rejects null, foreign, stale messages', t => {
  const dom = setup(t);
  let accepted;dom.window.addEventListener('message',event=>{accepted=event.data;});
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: null }));
  deliver(dom, { arrowSeek: false }, 2);
  deliver(dom, { arrowSeek: true }, 1);
  for(const [source,origin] of [[null,dom.window.location.origin],[dom.window,'https://other.invalid']]) {
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source,origin,data:{...accepted,deliverySequence:3}}));
  }
  assert.equal(runtime(dom).config.arrowSeek, false);
  assert.equal(runtime(dom).configReady, true);
});

test('resource scope disposal removes listeners and timers exactly once', async t => {
  const dom = setup(t);
  const scope = runtime(dom).createScope();
  let calls = 0;
  scope.on(dom.window, 'sample', () => calls++);
  scope.timeout(() => calls++, 5);
  scope.dispose(); scope.dispose();
  dom.window.dispatchEvent(new dom.window.Event('sample'));
  await flush();
  assert.equal(calls, 0);
});
test('same-route runtimes keep window-local configuration and scopes', async t => {
  const a = setup(t), b = setup(t);
  deliver(a, { preview: false }, 1); deliver(b, { preview: true }, 1);
  assert.notEqual(runtime(a), runtime(b)); assert.equal(runtime(a).config.preview, false); assert.equal(runtime(b).config.preview, true);
  const scopeA = runtime(a).createScope(), scopeB = runtime(b).createScope(); let calls = 0;
  scopeB.on(b.window, 'local-sample', () => calls++); scopeA.dispose();
  b.window.dispatchEvent(new b.window.Event('local-sample')); assert.equal(calls, 1); scopeB.dispose();
});

test('startup failure rolls back only its own registry and resources', t => {
  for (const replaceRegistry of [false, true]) {
    const dom = page(playerHTML), key = dom.window.Symbol.for('cheese-knife.runtime.v1'), foreign = { foreign: true };
    const listeners = new Set();
    const add = dom.window.addEventListener.bind(dom.window), remove = dom.window.removeEventListener.bind(dom.window);
    dom.window.addEventListener = (type, listener, options) => { listeners.add(listener); add(type, listener, options); };
    dom.window.removeEventListener = (type, listener, options) => { listeners.delete(listener); remove(type, listener, options); };
    dom.window.MutationObserver = class {
      observe() { if (replaceRegistry) Object.defineProperty(dom.window, key, { configurable: true, value: foreign }); throw new Error('fixture-startup'); }
      disconnect() {}
    };
    t.after(() => dom.window.close());
    assert.throws(() => { load(dom, 'media-profiles.js');load(dom, 'web/runtime.js'); }, /fixture-startup/);
    assert.equal(Object.getOwnPropertyDescriptor(dom.window, key)?.value, replaceRegistry ? foreign : undefined);
    assert.equal(listeners.size, 0);
  }
});

test('scope cleanup is reverse ordered and one cleanup failure does not stop the rest', t => {
  const dom = setup(t), calls = [];
  const scope = runtime(dom).createScope();
  scope.add(() => calls.push('first'));
  scope.add(() => { calls.push('second'); throw new Error('fixture-cleanup'); });
  scope.add(() => calls.push('third'));
  scope.dispose(); scope.dispose();
  assert.deepEqual(calls, ['third', 'second', 'first']);
  assert.equal(scope.signal.aborted, true);
});

test('persisted pagehide freezes one pulse and pageshow resumes it once', t => {
  const dom = page(playerHTML);
  const active = new Set(); let next = 0;
  dom.window.setInterval = () => { const id = ++next; active.add(id); return id; };
  dom.window.clearInterval = id => active.delete(id);
  t.after(() => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); dom.window.close(); });
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js');
  assert.equal(active.size, 1);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(active.size, 0);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(active.size, 1);
});

test('configuration retry owns one timeout across repeated pageshow and teardown', t => {
  const dom = page(playerHTML);
  const active = new Map(); let next = 0;
  dom.window.setTimeout = callback => { const id = ++next; active.set(id, callback); return id; };
  dom.window.clearTimeout = id => active.delete(id);
  t.after(() => dom.window.close());
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js');
  assert.equal(active.size, 1);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(active.size, 1);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(active.size, 0);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(active.size, 1);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
  assert.equal(active.size, 0);
});

test('final pagehide removes owned listeners observer timers and registry', t => {
  const dom = page(playerHTML), key = dom.window.Symbol.for('cheese-knife.runtime.v1');
  const active = new Set(), listeners = new Set(), ownedTypes = new Set(['message', 'visibilitychange', 'popstate', 'pageshow', 'pagehide']);
  let next = 0, disconnected = 0;
  dom.window.setInterval = () => { const id = ++next; active.add(id); return id; };
  dom.window.clearInterval = id => active.delete(id);
  for (const target of [dom.window, dom.window.document]) {
    const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, listener, options) => { if (ownedTypes.has(type)) listeners.add(listener); add(type, listener, options); };
    target.removeEventListener = (type, listener, options) => { if (ownedTypes.has(type)) listeners.delete(listener); remove(type, listener, options); };
  }
  const NativeObserver = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends NativeObserver { disconnect() { disconnected++; super.disconnect(); } };
  t.after(() => dom.window.close());
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js');
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
  assert.equal(Object.getOwnPropertyDescriptor(dom.window, key), undefined);
  assert.equal(active.size, 0);
  assert.equal(listeners.size, 0);
  assert.equal(disconnected, 1);
});

test('bridge copies config and i18n own data descriptors and rejects accessors prototypes and stale revisions', t => {
  const dom = setup(t), knife = runtime(dom); let getters = 0;
  let accepted;dom.window.addEventListener('message',event=>{accepted=event.data;});
  deliver(dom, { arrowSeek: false }, 1);
  const positive=accepted;assert.equal(knife.configReady,true);
  const accessorConfig = {};
  Object.defineProperty(accessorConfig, 'arrowSeek', { enumerable: true, get() { getters++; return true; } });
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { source: dom.window, origin: dom.window.location.origin,
    data: { ...positive,deliverySequence:2,baseConfig:accessorConfig,effectiveConfig:accessorConfig } }));
  const inheritedConfig = Object.create({ arrowSeek: true });
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { source: dom.window, origin: dom.window.location.origin,
    data: { ...positive,deliverySequence:3,baseConfig:inheritedConfig,effectiveConfig:inheritedConfig } }));
  const accessorI18n = {};
  Object.defineProperty(accessorI18n, 'fastForward', { enumerable: true, get() { getters++; return 'unsafe'; } });
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { source: dom.window, origin: dom.window.location.origin,
    data: { ...positive,deliverySequence:4,baseConfig:{...positive.baseConfig,arrowSeek:true},
      effectiveConfig:{...positive.effectiveConfig,arrowSeek:true},i18n:accessorI18n } }));
  assert.equal(getters, 0);
  assert.equal(knife.config.arrowSeek, false);
  deliver(dom, { arrowSeek: true }, 2);
  assert.equal(knife.config.arrowSeek, true);
});
