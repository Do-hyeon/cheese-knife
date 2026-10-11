const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const base = 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function page(html = '', url = base) {
  return new JSDOM(`<html><body>${html}</body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
}
function load(dom, file) { dom.window.eval(fs.readFileSync(file, 'utf8')); }
function runtime(dom) { return dom.window[dom.window.Symbol.for('cheese-knife.runtime.v1')]; }
function deliver(dom, config = {}, revision = 1) {
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    source: dom.window, origin: dom.window.location.origin,
    data: { namespace: 'cheese-knife', protocol: 1, type: 'config', revision,
      requestId: runtime(dom).requestId, config, i18n: { fastForward: 'Live edge', enableCompressor: 'Enable compressor', disableCompressor: 'Disable compressor', speed2x: '2x' } },
  }));
}
const playerHTML = '<div id="root"><div id="layout-body"><section><main><div id="live_player_layout"><div class="pzp-pc"><div class="pzp-pc__video"><video></video></div><div class="pzp-pc__bottom-buttons-left"><button class="pzp-pc__playback-switch"></button><div class="pzp-pc__volume-control"></div></div></div></div></main></section></div></div>';
const flush = () => new Promise(resolve => setTimeout(resolve, 30));
// Only the browser timeout/monotonic-clock boundary is simulated. DOM events,
// MutationObservers, scope disposal, and feature code remain real.
function clock(dom) {
  let now = 0, next = 0;
  const timers = new Map();
  dom.window.performance.now = () => now;
  dom.window.setTimeout = (fn, delay = 0) => {
    const id = ++next; timers.set(id, { fn, at: now + Math.max(0, delay) }); return id;
  };
  dom.window.clearTimeout = id => timers.delete(id);
  const mutations = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return {
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
