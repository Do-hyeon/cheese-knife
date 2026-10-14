import '../../settings/media-profiles';
import type { FeatureState, KnifeRuntime, RuntimeLifecycle, RuntimeState } from './contracts';
import { createLifecycle } from './lifecycle';
import { parseRoute } from './route';
import { createResourceScope } from './scope';
import { createStatusStore } from './status';

const registryName = 'cheese-knife.runtime.v1';

export function installRuntime(target: Window): KnifeRuntime | null {
  const browser = target as Window & typeof globalThis;
  const key = browser.Symbol.for(registryName);
  if (Object.getOwnPropertyDescriptor(target, key)?.value) return null;
  const subscribers = new Set<(state: RuntimeState) => void>();
  let lifecycle: RuntimeLifecycle;
  let runtime: KnifeRuntime;
  let playerGeneration = 0, requestGeneration = 0;
  const channelId = (route: ReturnType<typeof parseRoute>) => target.top === target && route.kind === 'live' && route.id &&
    /^\/live\/[a-f0-9]{32}\/?$/i.test(route.path) ? route.id.toLowerCase() : null;
  const initialRoute = parseRoute(target.location.pathname);
  const status = createStatusStore(
    payload => target.postMessage(payload, target.location.origin),
    () => runtime.diagnostics(),
  );
  runtime = {
    ownerProtocol: 2,
    requestId: `knife-${Date.now().toString(36)}`,
    config: {}, baseConfig: {}, mediaRequestId: '',
    media: { context: { documentGeneration:1,routePath:initialRoute.path,channelId:channelId(initialRoute),playerGeneration },
      phase:'pending',version:{globalRevision:null,mediaRevision:null},profileState:'global',revisionStatus:'repair-required',
      audioBindingGeneration:0,audioKind:'global',videoKind:'global' },
    i18n: {}, configReady: false, state: {}, statuses: status.statuses, features: {}, generation: 0,
    route: () => parseRoute(target.location.pathname),
    selectPlayer() {
      try { return runtime.adapter?.discover(target.document, runtime.route()).player || null; }
      catch { return null; }
    },
    setStatus: (feature: string, state: FeatureState, reason: unknown = '') => status.setStatus(feature, state, reason),
    diagnostics() {
      const player = runtime.state.player;
      const webpack = Object.getOwnPropertyDescriptor(target, 'webpackChunkglive_fe_pc')?.value;
      return { world: 'MAIN', route: runtime.route().kind, player: !!player,
        vue: player?.vue === true,
        webpackKnown: Array.isArray(webpack),
        reactOnLayout: player?.reactOnLayout === true,
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
    mediaCurrent() {
      const actual = runtime.selectPlayer(),previous = runtime.state.player;
      return runtime.configReady && runtime.media.phase !== 'pending' && runtime.media.context.routePath === target.location.pathname &&
        actual?.pzp === previous?.pzp && actual?.video === previous?.video;
    },
    revalidateMedia() {
      runtime.media.phase = 'pending';runtime.mediaRequestId = `${runtime.requestId}-media-${++requestGeneration}`;
      runtime.config = { ...runtime.baseConfig };
      const video = runtime.state.player?.video;if (video) runtime.audio?.suspend(video);
      if (runtime.configReady) {
        const values = Object.fromEntries(KnifeMediaProfiles.videoFields.map(field => [field.id,Object.getOwnPropertyDescriptor(runtime.baseConfig,field.id)?.value]));
        const checked = KnifeMediaProfiles.validateValues('video',values);if (checked.ok && checked.domain === 'video') runtime.filters?.reconcile(checked.values,null,null);
      }
      runtime.setStatus('mediaSettings','pending','scoped-config-pending');
      lifecycle.requestMedia();
    },
    reconcile() {
      const route = runtime.route();
      let site;
      try { site = runtime.adapter?.discover(target.document, route); } catch {}
      const body = site?.body || null, player = site?.player || null, sidebar = site?.sidebar || null;
      const previous = runtime.state;
      if (previous.route?.path === route.path && previous.body === body && previous.sidebar === sidebar &&
          previous.player?.pzp === player?.pzp && previous.player?.video === player?.video &&
          previous.player?.filterTarget === player?.filterTarget) { runtime.notify(); return; }
      const mediaChanged = previous.route?.path !== route.path || previous.player?.pzp !== player?.pzp || previous.player?.video !== player?.video;
      if (mediaChanged) {
        if (previous.player?.video) {
          if (previous.player.video === player?.video && previous.route?.path === route.path) runtime.audio?.suspend(previous.player.video);
          else runtime.audio?.bypass(previous.player.video);
        }
        runtime.media.context = { documentGeneration:runtime.media.context.documentGeneration,routePath:route.path,channelId:channelId(route),playerGeneration:++playerGeneration };
      }
      runtime.generation++;
      runtime.state = { route, body, player, sidebar, generation: runtime.generation };
      if (mediaChanged) runtime.revalidateMedia();
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
