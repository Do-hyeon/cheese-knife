/// <reference path="../src/settings/config.ts" />
/// <reference path="../src/settings/media-profiles.ts" />
/// <reference path="../src/settings/style-schema.ts" />
/// <reference path="../src/settings/contract.ts" />
/// <reference path="../src/settings/client.ts" />
/// <reference path="../src/settings/broker.ts" />
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { page, load, flush, clock } = require('./helpers.cjs');
/** @typedef {Record<string,unknown>} RawStore */
/** @template {unknown[]} Args @typedef {(...args:Args)=>unknown} FixtureFn */
/** @template {unknown[]} Args @typedef {{listeners:Set<FixtureFn<Args>>,addListener:(fn:FixtureFn<Args>)=>Set<FixtureFn<Args>>,removeListener:(fn:FixtureFn<Args>)=>boolean,emit:(...args:Args)=>void}} FixtureEvent */
/** @typedef {{reached:Promise<unknown>,wait:Promise<void>,release:(value?:void)=>void,fail:()=>void,entered:(args:unknown)=>void}} FixtureGate */
/** @typedef {{kind:string,args:unknown}} FixtureCall */
/** @typedef {{current:number,max:number}} FixtureMetric */
// Partial merges retain explicit undefined fields under exactOptionalPropertyTypes.
/** @typedef {{[K in keyof chrome.scripting.RegisteredContentScript]?:chrome.scripting.RegisteredContentScript[K]|undefined}&{id:string}} FixtureScript */
/** @typedef {{id:number,windowId:number,url?:string|undefined}} FixtureTab */
/** @typedef {Pick<ReturnType<typeof createSettingsBroker>,'initialize'|'invalidateStyles'>&{listener:(message:unknown,sender:unknown,respond:(response:unknown)=>void)=>boolean}} FixtureBroker */
/** @typedef {ReturnType<typeof createSettingsClient>} FixtureClient */
/** @typedef {(message:KnifeSettingsRequest,callback:(response:unknown)=>void)=>void} FixtureSend */
/** @typedef {(value:RawStore)=>Promise<void>} FixtureStorageWrite */
/** @typedef {(value:FixtureChrome)=>FixtureClient} FixtureClientFactory */
/** @typedef {(value:unknown)=>FixtureBroker} FixtureBrokerFactory */
/** @typedef {{fakeTime?:boolean|undefined}} FixtureClientOptions */
/** @typedef {{locale?:string|undefined,query?:string|undefined,target?:{tabId:number,windowId:number}|undefined,fakeTime?:boolean|undefined,setup?:((api:FixtureChrome,dom:import('jsdom').JSDOM)=>void)|undefined}} FixtureUiOptions */
/** @typedef {{
 * runtime:{id:string,getURL:(path:string)=>string,sendMessage:FixtureSend,lastError?:{message:string}|undefined,onMessage:FixtureEvent<[unknown,unknown,(reply:unknown)=>void]>,onInstalled:FixtureEvent<[chrome.runtime.InstalledDetails]>,onStartup:FixtureEvent<[]>},
 * i18n:{getMessage:(key:string)=>string},
 * storage:{onChanged:FixtureEvent<[RawStore,string]>,local:{onChanged:FixtureEvent<[RawStore,string]>,get:(keys?:string[]|RawStore|null)=>Promise<RawStore>,set:FixtureStorageWrite,remove:(key:string|string[])=>Promise<void>}},
 * scripting:{getRegisteredContentScripts:(options?:{ids?:string[]|undefined})=>Promise<FixtureScript[]>,registerContentScripts:(scripts:FixtureScript[])=>Promise<void>,updateContentScripts:(scripts:FixtureScript[])=>Promise<void>,unregisterContentScripts:(options?:{ids?:string[]|undefined})=>Promise<void>},
 * tabs:{get:(id:number)=>Promise<FixtureTab>,reload:(id:number)=>Promise<void>,query:(options:chrome.tabs.QueryInfo)=>Promise<(FixtureTab|undefined)[]>,sendMessage:(id:number,message:unknown)=>Promise<unknown>,create:(options:chrome.tabs.CreateProperties)=>Promise<void>},
 * permissions:{contains:(options:chrome.permissions.Permissions)=>Promise<boolean>,onRemoved:FixtureEvent<[chrome.permissions.Permissions]>,onAdded:FixtureEvent<[chrome.permissions.Permissions]>}
 * }} FixtureChrome */
/** @typedef {Omit<FixtureChrome,'runtime'>&{runtime:Omit<FixtureChrome['runtime'],'sendMessage'>&Partial<Pick<FixtureChrome['runtime'],'sendMessage'>>}} ConstructingChrome */
const extensionId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
/** @param {string} p */
const getURL = p => `chrome-extension://${extensionId}/${p}`;
/** @param {string} id @param {KnifeScalar} value @returns {Extract<KnifeSettingsOperation,{type:'config'}>} */
const config = (id, value) => ({ type: 'config', id, value });
/** @param {string} id @param {boolean} enabled @returns {Extract<KnifeSettingsOperation,{type:'style'}>} */
const style = (id, enabled) => ({ type: 'style', id, enabled });
/** @param {string} id @param {number} value @returns {Extract<KnifeSettingsOperation,{type:'parameter'}>} */
const parameter = (id, value) => ({ type: 'parameter', id, value });
/** @template {unknown[]} Args @returns {FixtureEvent<Args>} */
function event() {
  /** @type {Set<FixtureFn<Args>>} */
  const listeners = new Set();
  return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
    emit: (...args) => { for (const fn of [...listeners]) fn(...args); }, listeners };
}
/** @typedef {'config.js'|'style-schema.js'|'settings-contract.js'|'settings-broker.js'} PublishedWorkerFile */
/** @typedef {PublishedWorkerFile|'media-profiles.js'} F00WorkerFile */
/** @typedef {{generation:'published',sources:Readonly<Record<PublishedWorkerFile,string>>}|{generation:'f00',sources:Readonly<Record<F00WorkerFile,string>>}} WorkerSources */
/** @type {PublishedWorkerFile[]} */ const publishedWorkerFiles = ['config.js', 'style-schema.js', 'settings-contract.js', 'settings-broker.js'];
/** @type {F00WorkerFile[]} */ const workerFiles = ['media-profiles.js', ...publishedWorkerFiles];
/** @param {unknown} value @returns {WorkerSources} */
function validatedSources(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Reflect.ownKeys(value).length !== 2) throw new Error('fixture-worker-sources');
  const generation = Object.getOwnPropertyDescriptor(value, 'generation')?.value;
  const sources = Object.getOwnPropertyDescriptor(value, 'sources')?.value;
  if (!['published', 'f00'].includes(generation) || !sources || typeof sources !== 'object' || Array.isArray(sources)) throw new Error('fixture-worker-sources');
  const names = generation === 'published' ? publishedWorkerFiles : workerFiles;
  if (Reflect.ownKeys(sources).length !== names.length) throw new Error('fixture-worker-sources');
  const entries = names.map(file => [file, Object.getOwnPropertyDescriptor(sources, file)?.value]);
  if (!entries.every(([, source]) => typeof source === 'string' && source.trim())) throw new Error('fixture-worker-sources');
  // Generation-specific exact own fields and source types were validated above.
  return /** @type {WorkerSources} */ (Object.freeze({generation,sources:Object.freeze(Object.fromEntries(entries))}));
}
/** @param {import('node:test').TestContext} t @param {object} [stored] @param {WorkerSources} [workerSources] */
function settingsHarness(t, stored = {}, workerSources) {
  const saved = /** @type {RawStore} */ (structuredClone(stored)), gates = /** @type {Map<string,FixtureGate[]>} */ (new Map()), allGates = /** @type {FixtureGate[]} */ ([]), changes = /** @type {FixtureEvent<[RawStore,string]>} */ (event());
  const calls = /** @type {FixtureCall[]} */ ([]), registrations = /** @type {Map<string,FixtureScript>} */ (new Map()), tabs = /** @type {Map<number,FixtureTab>} */ (new Map([[7, { id: 7, windowId: 9, url: 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]]));
  const windows = /** @type {import('jsdom').JSDOM[]} */ ([]), clients = /** @type {FixtureClient[]} */ ([]), messages = /** @type {{api:object,message:KnifeSettingsRequest,subscribers:number}[]} */ ([]), metrics = /** @type {WeakMap<object,FixtureMetric>} */ (new WeakMap());
  let counter = 0, activeWrites = 0, maxWrites = 0, activeCss = 0, maxCss = 0, permissionGranted = true, /** @type {import('jsdom').JSDOM|undefined} */ worker, /** @type {FixtureBroker} */ broker, /** @type {(()=>boolean)|undefined} */ stopInvalidation;
  let selectedSources = workerSources === undefined ? undefined : validatedSources(workerSources);
  let versioned = selectedSources !== undefined, activityEpoch = 0, /** @type {number|undefined} */ settledEpoch, activeBoundaries = 0, pendingRequests = 0;
  const noteActivity = () => { activityEpoch++; };
  /** @param {string} kind @returns {FixtureGate} */
  function holdNext(kind) {
    let /** @type {((value?:void)=>void)|undefined} */ resolve, /** @type {((reason?:unknown)=>void)|undefined} */ reject, /** @type {((args:unknown)=>void)|undefined} */ entered;
    /** @type {Promise<void>} */ const wait = new Promise((a, b) => { resolve = a; reject = b; });
    /** @type {Promise<unknown>} */ const reached = new Promise(a => { entered = a; });
    // Promise executors assign these slots synchronously before this object.
    const gate = { reached, release: /** @type {(value?:void)=>void} */ (resolve), fail: () => /** @type {(reason?:unknown)=>void} */ (reject)(new Error('fixture-failure')), wait, entered: /** @type {(args:unknown)=>void} */ (entered) };
    if (!gates.has(kind)) gates.set(kind, []); /** @type {FixtureGate[]} */ (gates.get(kind)).push(gate); allGates.push(gate); return gate;
  }
  /** @param {string} kind @param {unknown} args */
  async function boundary(kind, args) {
    noteActivity(); activeBoundaries++;
    try { calls.push({ kind, args: structuredClone(args) }); const g = gates.get(kind)?.shift(); if (g) { g.entered(args); await g.wait; } }
    finally { activeBoundaries--; }
  }
  /** @param {string} kind @param {unknown} args */
  async function cssBoundary(kind, args) {
    activeCss++; maxCss = Math.max(maxCss, activeCss);
    try { await boundary(kind, args); } finally { activeCss--; }
  }
  /** @param {RawStore} delta */
  const announce = delta => { void boundary('event', delta).then(() => changes.emit(delta, 'local')).catch(() => {}); };
  /** @param {string} [name] @returns {FixtureChrome} */
  function apiFor(name = 'background') {
    const metric = { current: 0, max: 0 };
    /** @type {ConstructingChrome} */ const api = {
      runtime: { id: extensionId, getURL, onMessage: event(), onInstalled: event(), onStartup: event() },
      i18n: { getMessage: key => key },
      storage: { onChanged: changes, local: { onChanged: changes,
        get: async keys => {
          const data = Array.isArray(keys) ? Object.fromEntries(/** @type {string[]} */ (keys).filter(k => Object.hasOwn(saved, k)).map(k => [k, saved[k]])) : { ...(keys || {}), ...saved };
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
          /** @type {RawStore} */ const delta = {}; for (const k of /** @type {string[]} */ (keys)) { if (Object.hasOwn(saved, k)) { delta[k] = { oldValue: saved[k] }; delete saved[k]; } } announce(delta);
        },
      } },
      scripting: {
        getRegisteredContentScripts: async options => { await boundary('css-get', options); return structuredClone([...registrations.values()].filter(s => !options?.ids || options.ids.includes(s.id))); },
        registerContentScripts: async scripts => { await cssBoundary('css-register', scripts); for (const s of scripts) { if (registrations.has(s.id)) throw new Error('duplicate'); registrations.set(s.id, structuredClone(s)); } },
        updateContentScripts: async scripts => { await cssBoundary('css-update', scripts); for (const s of scripts) { if (!registrations.has(s.id)) throw new Error('missing'); registrations.set(s.id, { .../** @type {FixtureScript} */ (registrations.get(s.id)), ...structuredClone(s) }); } },
        unregisterContentScripts: async options => { await cssBoundary('css-unregister', options); for (const id of options?.ids || [...registrations.keys()]) registrations.delete(id); },
      },
      tabs: {
        get: async id => { await boundary('tab-get', { id }); if (!tabs.has(id)) throw new Error('missing-tab'); return structuredClone(/** @type {FixtureTab} */ (tabs.get(id))); },
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
    // Only sendMessage differed in the checked initial construction state.
    metrics.set(api, metric); return /** @type {FixtureChrome} */ (api);
  }
  /** @param {WorkerSources} [nextSources] */
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
    /** @type {{chrome:unknown}} */ (worker.window).chrome = apiFor();
    if (sources) for (const source of Object.values(sources.sources)) worker.window.eval(source);
    else {
      for (const f of ['media-profiles.js', 'config.js', 'style-schema.js', 'settings-contract.js']) load(worker, f);
      if (fs.existsSync('settings-broker.js')) load(worker, 'settings-broker.js');
    }
    assert.equal(typeof worker.window.createSettingsBroker, 'function', 'settings writer must exist');
    // Constructor ABI after eval is assumed; scripts may replace the Chrome slot.
    broker = /** @type {FixtureBrokerFactory} */ (worker.window.createSettingsBroker)(/** @type {{chrome:unknown}} */ (worker.window).chrome);
    const activeBroker = broker;
    /** @param {RawStore} delta */ const signal = delta => { if (delta.styles || delta.styleParameters || delta.settingsRevision) { noteActivity(); activeBroker.invalidateStyles(); } };
    changes.addListener(signal); stopInvalidation = () => changes.removeListener(signal);
  }
  startWorker();
  t.after(() => { for (const c of clients) c.dispose(); stopInvalidation?.(); for (const g of allGates) g.release(); for (const dom of windows) dom.window.close(); });
  /** @param {string} name @param {unknown} message @param {unknown} [override] @returns {Promise<unknown>} */
  function send(name, message, override) {
    noteActivity(); pendingRequests++;
    const sender = override || { id: extensionId, url: getURL(`${name}.html`), frameId: 0 };
    return new Promise(resolve => {
      const handled = broker.listener(message, sender, reply => { void boundary('response', reply).then(() => resolve(reply)).catch(() => resolve(undefined)); });
      if (!handled) resolve(undefined);
    }).finally(() => { pendingRequests--; });
  }
  /** @param {string} name @param {string} action @param {RawStore} [payload] */
  function request(name, action, payload = {}) { return send(name, { namespace: 'cheese-knife-settings', protocol: 1, action, requestId: `fixture-${++counter}`, ...payload }); }
  /** @param {string} [name] @param {FixtureClientOptions} [options] */
  function client(name = 'popup', { fakeTime = false } = {}) {
    const dom = page('', getURL(`${name}.html`)); windows.push(dom); const time = fakeTime ? clock(dom) : undefined;
    const api = apiFor(name); /** @type {{chrome:unknown}} */ (dom.window).chrome = api;
    for (const f of ['media-profiles.js', 'config.js', 'style-schema.js', 'settings-contract.js']) load(dom, f);
    if (fs.existsSync('settings-client.js')) load(dom, 'settings-client.js');
    assert.equal(typeof dom.window.createSettingsClient, 'function', 'settings client must exist');
    const instance = /** @type {FixtureClientFactory} */ (dom.window.createSettingsClient)(api); clients.push(instance);
    /** @type {KnifeSettingsView|undefined} */ let view;
    instance.subscribe(v => { view = v; });
    return { ...instance, dom, api, time, view: () => view, maxInflight: () => /** @type {FixtureMetric} */ (metrics.get(api)).max };
  }
  /** @param {string} name @param {FixtureUiOptions} [options] */
  async function openUi(name, { locale = 'ko', target, query, fakeTime = false, setup } = {}) {
    const search = query ?? (target ? `?targetTabId=${target.tabId}&targetWindowId=${target.windowId}` : '');
    const dom = page(fs.readFileSync(`${name}.html`, 'utf8'), getURL(`${name}.html`) + search); windows.push(dom);
    const time = fakeTime ? clock(dom) : undefined, api = apiFor(name);
    const translated = /** @type {Record<string,{message?:string}>} */ (JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8')));
    api.i18n.getMessage = key => translated[key]?.message || '';
    /** @type {{chrome:unknown}} */ (dom.window).chrome = api; dom.window.HTMLCanvasElement.prototype.getContext = () => null;
    setup?.(api, dom);
    // Controlled page/load order assumes src remains present; retain native null failure.
    for (const script of dom.window.document.querySelectorAll('script[src]')) load(dom, /** @type {string} */ (script.getAttribute('src')));
    t.after(() => dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')));
    await flush(); return { dom, api, time };
  }
  return { saved, calls, messages, client, openUi, registrations, tabs, changes, holdNext, apiFor, send, request,
    get worker() { return worker; }, get broker() { return broker; },
    get maxConcurrentWrites() { return maxWrites; }, get maxConcurrentCss() { return maxCss; },
    initialize: () => { noteActivity(); return broker.initialize(); }, snapshot: (name = 'popup') => request(name, 'get-snapshot'),
    /** @param {string} name @param {KnifeSettingsOperation[]} operations */
    patch: (name, operations) => request(name, 'patch', { operations }),
    reload: (id = 7, windowId = 9) => request('styles', 'reload-target', { targetTabId: id, targetWindowId: windowId }),
    /** @param {string} kind */ failNext: kind => { const g = holdNext(kind); void g.reached.then(() => g.fail()); },
    restartBroker: startWorker,
    /** @param {{retry?:boolean}} [options] */ invalidate: options => { noteActivity(); broker.invalidateStyles(options); },
    /** @param {boolean} value */ setPermission: value => { permissionGranted = value; },
    settle: async () => {
      await flush(); const observedEpoch = activityEpoch; await flush();
      settledEpoch = observedEpoch === activityEpoch && !pendingRequests && !activeBoundaries ? activityEpoch : undefined;
    },
  };
}
module.exports = { settingsHarness, config, style, parameter, getURL, extensionId, event };
