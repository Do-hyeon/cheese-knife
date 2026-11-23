const assert = require('node:assert/strict');
const fs = require('node:fs');
const { page, load, flush, clock } = require('./helpers.cjs');
const extensionId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const getURL = p => `chrome-extension://${extensionId}/${p}`;
const config = (id, value) => ({ type: 'config', id, value });
const style = (id, enabled) => ({ type: 'style', id, enabled });
const parameter = (id, value) => ({ type: 'parameter', id, value });
function event() {
  const listeners = new Set();
  return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
    emit: (...args) => { for (const fn of [...listeners]) fn(...args); }, listeners };
}
/** @typedef {'config.js'|'style-schema.js'|'settings-contract.js'|'settings-broker.js'} WorkerFile */
/** @typedef {Readonly<Record<WorkerFile,string>>} WorkerSources */
const workerFiles = ['config.js', 'style-schema.js', 'settings-contract.js', 'settings-broker.js'];
function validatedSources(value) {
  if (!value || typeof value !== 'object' || Reflect.ownKeys(value).length !== workerFiles.length) throw new Error('fixture-worker-sources');
  const entries = workerFiles.map(file => [file, Object.getOwnPropertyDescriptor(value, file)?.value]);
  if (!entries.every(([, source]) => typeof source === 'string' && source.trim())) throw new Error('fixture-worker-sources');
  return Object.freeze(Object.fromEntries(entries));
}
/** @param {import('node:test').TestContext} t @param {object} [stored] @param {WorkerSources} [workerSources] */
function settingsHarness(t, stored = {}, workerSources) {
  const saved = structuredClone(stored), gates = new Map(), allGates = [], changes = event();
  const calls = [], registrations = new Map(), tabs = new Map([[7, { id: 7, windowId: 9, url: 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]]);
  const windows = [], clients = [], messages = [], metrics = new WeakMap();
  let counter = 0, activeWrites = 0, maxWrites = 0, activeCss = 0, maxCss = 0, permissionGranted = true, worker, broker, stopInvalidation;
  let selectedSources = workerSources === undefined ? undefined : validatedSources(workerSources);
  let versioned = selectedSources !== undefined, activityEpoch = 0, settledEpoch, activeBoundaries = 0, pendingRequests = 0;
  const noteActivity = () => { activityEpoch++; };
  function holdNext(kind) {
    let resolve, reject, entered;
    const wait = new Promise((a, b) => { resolve = a; reject = b; });
    const reached = new Promise(a => { entered = a; });
    const gate = { reached, release: resolve, fail: () => reject(new Error('fixture-failure')), wait, entered };
    if (!gates.has(kind)) gates.set(kind, []); gates.get(kind).push(gate); allGates.push(gate); return gate;
  }
  async function boundary(kind, args) {
    noteActivity(); activeBoundaries++;
    try { calls.push({ kind, args: structuredClone(args) }); const g = gates.get(kind)?.shift(); if (g) { g.entered(args); await g.wait; } }
    finally { activeBoundaries--; }
  }
  async function cssBoundary(kind, args) {
    activeCss++; maxCss = Math.max(maxCss, activeCss);
    try { await boundary(kind, args); } finally { activeCss--; }
  }
  const announce = delta => { void boundary('event', delta).then(() => changes.emit(delta, 'local')).catch(() => {}); };
  function apiFor(name = 'background') {
    const metric = { current: 0, max: 0 };
    const api = {
      runtime: { id: extensionId, getURL, onMessage: event(), onInstalled: event(), onStartup: event() },
      i18n: { getMessage: key => key },
      storage: { onChanged: changes, local: { onChanged: changes,
        get: async keys => {
          const data = Array.isArray(keys) ? Object.fromEntries(keys.filter(k => Object.hasOwn(saved, k)).map(k => [k, saved[k]])) : { ...(keys || {}), ...saved };
          const snapshot = structuredClone(data); await boundary('read', { keys }); return snapshot;
        },
        set: async value => {
          activeWrites++; maxWrites = Math.max(maxWrites, activeWrites);
          try {
            await boundary('commit', { name, value });
            const delta = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, { oldValue: structuredClone(saved[k]), newValue: structuredClone(v) }]));
            Object.assign(saved, structuredClone(value)); announce(delta); await boundary('write-result', { name });
          } finally { activeWrites--; }
        },
        remove: async key => {
          await boundary('remove', { key }); const keys = Array.isArray(key) ? key : [key];
          const delta = {}; for (const k of keys) { if (Object.hasOwn(saved, k)) { delta[k] = { oldValue: saved[k] }; delete saved[k]; } } announce(delta);
        },
      } },
      scripting: {
        getRegisteredContentScripts: async options => { await boundary('css-get', options); return structuredClone([...registrations.values()].filter(s => !options?.ids || options.ids.includes(s.id))); },
        registerContentScripts: async scripts => { await cssBoundary('css-register', scripts); for (const s of scripts) { if (registrations.has(s.id)) throw new Error('duplicate'); registrations.set(s.id, structuredClone(s)); } },
        updateContentScripts: async scripts => { await cssBoundary('css-update', scripts); for (const s of scripts) { if (!registrations.has(s.id)) throw new Error('missing'); registrations.set(s.id, { ...registrations.get(s.id), ...structuredClone(s) }); } },
        unregisterContentScripts: async options => { await cssBoundary('css-unregister', options); for (const id of options?.ids || [...registrations.keys()]) registrations.delete(id); },
      },
      tabs: {
        get: async id => { await boundary('tab-get', { id }); if (!tabs.has(id)) throw new Error('missing-tab'); return structuredClone(tabs.get(id)); },
        reload: async id => { await boundary('tab-reload', { id }); },
        query: async options => { await boundary('tab-query', options); return [structuredClone(tabs.get(7))]; },
        sendMessage: async () => ({ statuses: { player: { state: 'ready' }, deletedChat: { state: 'limited', reason: 'jsx-adapter-unavailable' } } }), create: async options => { await boundary('tab-create', options); },
      },
      permissions: {
        contains: async options => { await boundary('permission-contains', options); return permissionGranted; },
        onRemoved: event(), onAdded: event(),
      },
    };
    api.runtime.sendMessage = (message, callback) => {
      noteActivity(); pendingRequests++;
      let mutation = false;
      try {
        messages.push({ api, message: structuredClone(message), subscribers: changes.listeners.size });
        mutation = message.action !== 'get-snapshot';
        if (mutation) { metric.current++; metric.max = Math.max(metric.max, metric.current); }
        const sender = { id: extensionId, url: getURL(`${name}.html`), frameId: 0 };
        const handled = broker.listener(structuredClone(message), sender, reply => {
          void boundary('callback:' + message.action, reply).then(() => {
            if (mutation) metric.current--; callback(structuredClone(reply));
          }).catch(() => {
            if (mutation) metric.current--;
            api.runtime.lastError = { message: 'channel-unavailable' }; callback(undefined); delete api.runtime.lastError;
          }).finally(() => { pendingRequests--; });
        });
        if (!handled) { if (mutation) metric.current--; pendingRequests--; }
      } catch (error) {
        if (mutation) metric.current--; pendingRequests--; throw error;
      }
    };
    metrics.set(api, metric); return api;
  }
  function startWorker(nextSources = selectedSources) {
    const sources = nextSources === undefined ? undefined : validatedSources(nextSources);
    const switchingVersion = versioned || sources !== undefined;
    // A scheduled invalidation can be between boundaries; only a settled epoch may retire it.
    if (worker && switchingVersion && (settledEpoch !== activityEpoch || pendingRequests || activeBoundaries)) {
      throw Object.assign(new Error('fixture-worker-busy'), { code: 'fixture-worker-busy' });
    }
    stopInvalidation?.(); if (switchingVersion) worker?.window.close();
    selectedSources = sources; versioned = switchingVersion; settledEpoch = undefined;
    worker = page('', getURL('background.html')); windows.push(worker);
    worker.window.chrome = apiFor();
    if (sources) for (const f of workerFiles) worker.window.eval(sources[f]);
    else {
      for (const f of ['config.js', 'style-schema.js', 'settings-contract.js']) load(worker, f);
      if (fs.existsSync('settings-broker.js')) load(worker, 'settings-broker.js');
    }
    assert.equal(typeof worker.window.createSettingsBroker, 'function', 'settings writer must exist');
    broker = worker.window.createSettingsBroker(worker.window.chrome);
    const activeBroker = broker;
    const signal = delta => { if (delta.styles || delta.styleParameters || delta.settingsRevision) { noteActivity(); activeBroker.invalidateStyles(); } };
    changes.addListener(signal); stopInvalidation = () => changes.removeListener(signal);
  }
  startWorker();
  t.after(() => { for (const c of clients) c.dispose(); stopInvalidation?.(); for (const g of allGates) g.release(); for (const dom of windows) dom.window.close(); });
  function send(name, message, override) {
    noteActivity(); pendingRequests++;
    const sender = override || { id: extensionId, url: getURL(`${name}.html`), frameId: 0 };
    return new Promise(resolve => {
      const handled = broker.listener(message, sender, reply => { void boundary('response', reply).then(() => resolve(reply)).catch(() => resolve(undefined)); });
      if (!handled) resolve(undefined);
    }).finally(() => { pendingRequests--; });
  }
  function request(name, action, payload = {}) { return send(name, { namespace: 'cheese-knife-settings', protocol: 1, action, requestId: `fixture-${++counter}`, ...payload }); }
  function client(name = 'popup', { fakeTime = false } = {}) {
    const dom = page('', getURL(`${name}.html`)); windows.push(dom); const time = fakeTime ? clock(dom) : undefined;
    const api = apiFor(name); dom.window.chrome = api;
    for (const f of ['config.js', 'style-schema.js', 'settings-contract.js']) load(dom, f);
    if (fs.existsSync('settings-client.js')) load(dom, 'settings-client.js');
    assert.equal(typeof dom.window.createSettingsClient, 'function', 'settings client must exist');
    const instance = dom.window.createSettingsClient(api); clients.push(instance); let view;
    instance.subscribe(v => { view = v; });
    return { ...instance, dom, api, time, view: () => view, maxInflight: () => metrics.get(api).max };
  }
  async function openUi(name, { locale = 'ko', target, query, fakeTime = false, setup } = {}) {
    const search = query ?? (target ? `?targetTabId=${target.tabId}&targetWindowId=${target.windowId}` : '');
    const dom = page(fs.readFileSync(`${name}.html`, 'utf8'), getURL(`${name}.html`) + search); windows.push(dom);
    const time = fakeTime ? clock(dom) : undefined, api = apiFor(name);
    const translated = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    api.i18n.getMessage = key => translated[key]?.message || '';
    dom.window.chrome = api; dom.window.HTMLCanvasElement.prototype.getContext = () => null;
    setup?.(api, dom);
    for (const script of dom.window.document.querySelectorAll('script[src]')) load(dom, script.getAttribute('src'));
    t.after(() => dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')));
    await flush(); return { dom, api, time };
  }
  return { saved, calls, messages, client, openUi, registrations, tabs, changes, holdNext, apiFor, send, request,
    get worker() { return worker; }, get broker() { return broker; },
    get maxConcurrentWrites() { return maxWrites; }, get maxConcurrentCss() { return maxCss; },
    initialize: () => { noteActivity(); return broker.initialize(); }, snapshot: (name = 'popup') => request(name, 'get-snapshot'),
    patch: (name, operations) => request(name, 'patch', { operations }),
    reload: (id = 7, windowId = 9) => request('styles', 'reload-target', { targetTabId: id, targetWindowId: windowId }),
    failNext: kind => { const g = holdNext(kind); void g.reached.then(() => g.fail()); },
    restartBroker: startWorker, invalidate: options => { noteActivity(); broker.invalidateStyles(options); },
    setPermission: value => { permissionGranted = value; },
    settle: async () => {
      await flush(); const observedEpoch = activityEpoch; await flush();
      settledEpoch = observedEpoch === activityEpoch && !pendingRequests && !activeBoundaries ? activityEpoch : undefined;
    },
  };
}
module.exports = { settingsHarness, config, style, parameter, getURL, extensionId, event };
