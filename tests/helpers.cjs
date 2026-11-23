const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
/** @typedef {import('../src/main/runtime/contracts').KnifeRuntime} KnifeRuntime */
// jsdom accepts its own Window as source, without the browser's complete globals.
/** @typedef {typeof MessageEvent & {new(type: string, init: Omit<MessageEventInit<unknown>, 'source'> & {source: import('jsdom').DOMWindow}): MessageEvent<unknown>}} FixtureMessageEventConstructor */
const base = 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function page(html = '', url = base) {
  return new JSDOM(`<html><body>${html}</body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
}
/** @param {JSDOM} dom @param {string} file */
function load(dom, file) { dom.window.eval(fs.readFileSync(file, 'utf8')); }
/** @param {JSDOM} dom @returns {KnifeRuntime | undefined} */
function runtime(dom) {
  // Generated runtime owns this registry; loading and final disposal are tested.
  return /** @type {KnifeRuntime | undefined} */ (Reflect.get(dom.window, dom.window.Symbol.for('cheese-knife.runtime.v1')));
}
/** @param {JSDOM} dom @param {unknown} [config] @param {unknown} [revision] */
function deliver(dom, config = {}, revision = 1) {
  const api = runtime(dom); assert.ok(api, 'Load the runtime before delivering settings');
  const Message = /** @type {FixtureMessageEventConstructor} */ (dom.window.MessageEvent);
  dom.window.dispatchEvent(new Message('message', {
    source: dom.window, origin: dom.window.location.origin,
    data: { namespace: 'cheese-knife', protocol: 1, type: 'config', revision,
      requestId: api.requestId, config, i18n: { fastForward: 'Live edge', enableCompressor: 'Enable compressor', disableCompressor: 'Disable compressor', speed2x: '2x' } },
  }));
}
const playerHTML = '<div id="root"><div id="layout-body"><section><main><div id="live_player_layout"><div class="pzp-pc"><div class="pzp-pc__video"><video></video></div><div class="pzp-pc__bottom-buttons-left"><button class="pzp-pc__playback-switch"></button><div class="pzp-pc__volume-control"></div></div></div></div></main></section></div></div>';
/** @type {() => Promise<void>} */
const flush = () => new Promise(resolve => setTimeout(resolve, 30));
// Only the browser timeout/monotonic-clock boundary is simulated. DOM events,
// MutationObservers, scope disposal, and feature code remain real.
/** @param {JSDOM} dom */
function clock(dom) {
  let now = 0, next = 0;
  /** @type {Map<number, {fn: () => void, at: number}>} */
  const timers = new Map();
  // These fixtures schedule functions only, with browser numeric timer IDs.
  const boundary = /** @type {{setTimeout(fn: () => void, delay?: number): number; clearTimeout(id: number): void}} */ (dom.window);
  dom.window.performance.now = () => now;
  boundary.setTimeout = (fn, delay = 0) => {
    const id = ++next; timers.set(id, { fn, at: now + Math.max(0, delay) }); return id;
  };
  boundary.clearTimeout = id => timers.delete(id);
  const mutations = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return {
    /** @param {number} ms */
    async advance(ms) {
      const end = now + ms; await mutations();
      for (let guard = 0; guard < 1000; guard++) {
        const due = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) { now = end; await mutations(); return; }
        now = due[1].at; timers.delete(due[0]); due[1].fn(); await mutations();
      }
      throw new Error('Browser timeout loop did not converge');
    },
  };
}
module.exports = { page, load, runtime, deliver, playerHTML, flush, clock };
