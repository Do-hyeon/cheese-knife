import type { FeatureState, KnifeRuntime, PlayerSnapshot, RuntimeLifecycle, RuntimeState } from './contracts';
import { createLifecycle } from './lifecycle';
import { parseRoute } from './route';
import { createResourceScope } from './scope';
import { createStatusStore } from './status';

const registryName = 'cheese-knife.runtime.v1';

function selectPlayer(document: Document, kind: string): PlayerSnapshot | null {
  if (kind !== 'live' && kind !== 'vod') return null;
  const body = document.getElementById('layout-body');
  const layout = document.getElementById(kind === 'live' ? 'live_player_layout' : 'player_layout');
  const container = layout || body;
  if (!container) return null;
  const candidates = [...container.querySelectorAll('.pzp-pc')].filter(node => !node.closest('.knife-preview, .knife-popup'));
  if (container.matches('.pzp-pc')) candidates.unshift(container);
  if (candidates.length !== 1 || !candidates[0]) return null;
  const pzp = candidates[0];
  const video = pzp.querySelector<HTMLVideoElement>('.pzp-pc__video video') || pzp.querySelector<HTMLVideoElement>('video');
  return { layout: layout || pzp.parentElement, pzp, video };
}

export function installRuntime(target: Window): KnifeRuntime | null {
  const browser = target as Window & typeof globalThis;
  const key = browser.Symbol.for(registryName);
  if (Object.getOwnPropertyDescriptor(target, key)?.value) return null;
  const subscribers = new Set<(state: RuntimeState) => void>();
  let lifecycle: RuntimeLifecycle;
  let runtime: KnifeRuntime;
  const status = createStatusStore(
    payload => target.postMessage(payload, target.location.origin),
    () => runtime.diagnostics(),
  );
  runtime = {
    requestId: `knife-${Date.now().toString(36)}`,
    config: {}, i18n: {}, configReady: false, state: {}, statuses: status.statuses, features: {}, generation: 0,
    route: () => parseRoute(target.location.pathname),
    selectPlayer: () => selectPlayer(target.document, runtime.route().kind),
    setStatus: (feature: string, state: FeatureState, reason: unknown = '') => status.setStatus(feature, state, reason),
    diagnostics() {
      const player = runtime.state.player;
      const webpack = Object.getOwnPropertyDescriptor(target, 'webpackChunkglive_fe_pc')?.value;
      return { world: 'MAIN', route: runtime.route().kind, player: !!player,
        vue: !!(player?.pzp as Element & { __vue__?: unknown } | undefined)?.__vue__,
        webpackKnown: Array.isArray(webpack),
        reactOnLayout: !!player && Object.keys(player.layout || {}).some(name => name.startsWith('__reactFiber$')),
        mediaBlob: !!player?.video?.currentSrc?.startsWith('blob:') };
    },
    subscribe(callback) {
      subscribers.add(callback);
      callback(runtime.state);
      return () => subscribers.delete(callback);
    },
    notify() {
      for (const callback of subscribers) {
        try { callback(runtime.state); }
        catch { runtime.setStatus('runtime', 'failed', 'feature-initialization'); }
      }
    },
    reconcile() {
      const route = runtime.route();
      const body = target.document.getElementById('layout-body');
      const player = runtime.selectPlayer();
      const sidebar = target.document.getElementById('sidebar') || target.document.querySelector('aside[aria-label="사이드바"]');
      const previous = runtime.state;
      if (previous.route?.path === route.path && previous.body === body && previous.sidebar === sidebar &&
          previous.player?.pzp === player?.pzp && previous.player?.video === player?.video) { runtime.notify(); return; }
      runtime.generation++;
      runtime.state = { route, body, player, sidebar, generation: runtime.generation };
      runtime.notify();
    },
    schedule: () => lifecycle.schedule(),
    createScope: () => createResourceScope({
      AbortController: browser.AbortController,
      setTimeout: (callback, delay) => target.setTimeout(callback, delay),
      clearTimeout: id => target.clearTimeout(id),
      setInterval: (callback, delay) => target.setInterval(callback, delay),
      clearInterval: id => target.clearInterval(id),
    }),
  };
  const removeRegistry = () => {
    if (Object.getOwnPropertyDescriptor(target, key)?.value === runtime) Reflect.deleteProperty(target, key);
  };
  lifecycle = createLifecycle(runtime, {
    window: target, document: target.document, location: target.location, MutationObserver: browser.MutationObserver,
    requestAnimationFrame: callback => target.requestAnimationFrame(callback),
    cancelAnimationFrame: id => target.cancelAnimationFrame(id),
    setTimeout: (callback, delay) => target.setTimeout(callback, delay),
    clearTimeout: id => target.clearTimeout(id),
    setInterval: (callback, delay) => target.setInterval(callback, delay),
    clearInterval: id => target.clearInterval(id),
    onFinal: removeRegistry,
  });
  Object.defineProperty(target, key, { configurable: true, value: runtime });
  try { lifecycle.start(); return runtime; }
  catch (error) { lifecycle.dispose(); removeRegistry(); throw error; }
}

installRuntime(window);
