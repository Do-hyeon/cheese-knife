import { readScopedConfigEnvelope, readGainPreviewEnvelope } from './bridge';
import type { KnifeRuntime, RuntimeEnvironment, RuntimeLifecycle } from './contracts';

const interesting = 'video, button, section, aside, [role="tablist"]';

export function createLifecycle(runtime: KnifeRuntime, environment: RuntimeEnvironment): RuntimeLifecycle {
  const cleanups: (() => void)[] = [];
  let observer: MutationObserver | null = null;
  let revision = -1, attempts = 0, frame: number | null = null, pulse: number | null = null, requestTimer: number | null = null;
  let started = false, suspended = false, disposed = false;

  const clearRequest = () => {
    if (requestTimer !== null) environment.clearTimeout(requestTimer);
    requestTimer = null;
  };
  const clearPulse = () => {
    if (pulse !== null) environment.clearInterval(pulse);
    pulse = null;
  };
  const clearFrame = () => {
    if (frame !== null) environment.cancelAnimationFrame(frame);
    frame = null;
  };
  const on = (target: EventTarget, type: string, listener: EventListener) => {
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  };
  const requestConfig = () => {
    if (disposed || suspended || runtime.media.phase !== 'pending' || requestTimer !== null) return;
    if (runtime.media.context.routePath !== environment.location.pathname) { runtime.reconcile();return; }
    if (attempts++ >= 20) {
      runtime.setStatus('configuration',runtime.configReady ? 'ready' : 'limited',runtime.configReady ? '' : 'config-unavailable');
      runtime.setStatus('mediaSettings','limited',runtime.configReady ? 'scoped-config-unavailable' : 'reload-required');
      if (runtime.configReady) {
        runtime.media = {...runtime.media,phase:'limited',version:{globalRevision:null,mediaRevision:null},profileState:'global',
          revisionStatus:'repair-required',audioBindingGeneration:0,audioKind:'global',videoKind:'global',gainOrigin:'site-legacy'};
        runtime.config = {...runtime.baseConfig};runtime.notify();
      }
      return;
    }
    environment.window.postMessage({ namespace:'cheese-knife',protocol:3,type:'config-request',requestId:runtime.mediaRequestId,
      context:{...runtime.media.context} },environment.location.origin);
    requestTimer = environment.setTimeout(() => { requestTimer = null; requestConfig(); }, 100);
  };
  const startPulse = () => {
    clearPulse();
    if (!disposed && !suspended && !environment.document.hidden) pulse = environment.setInterval(() => {
      if (runtime.state.route?.path !== environment.location.pathname) runtime.reconcile();
    }, 1000);
  };
  const freeze = () => {
    suspended = true;
    clearPulse(); clearRequest(); clearFrame();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    freeze();
    for (const cleanup of cleanups.reverse()) { try { cleanup(); } catch {} }
    cleanups.length = 0;
    observer = null;
  };
  const schedule = () => {
    if (disposed || suspended || frame !== null) return;
    frame = environment.requestAnimationFrame(() => { frame = null; if (!disposed && !suspended) runtime.reconcile(); });
  };
  const onMessage = (event: Event) => {
    const message = event as MessageEvent<unknown>;
    if (disposed || suspended || message.source !== environment.window || message.origin !== environment.location.origin) return;
    const preview = readGainPreviewEnvelope(message, runtime.media.context);
    if (preview) {
      const video = runtime.state.player?.video;
      if (video && preview.requestId === runtime.mediaRequestId && preview.audioBindingGeneration === runtime.media.audioBindingGeneration)
        runtime.audio?.applyPreviewGain(video, preview.value, preview.context);
      return;
    }
    try {
      if (!message.data || typeof message.data !== 'object' ||
        Object.getOwnPropertyDescriptor(message.data,'protocol')?.value !== 3 ||
        Object.getOwnPropertyDescriptor(message.data,'type')?.value !== 'config') return;
    } catch { return; }
    runtime.reconcile();
    const envelope = readScopedConfigEnvelope(message,runtime.media.context);
    if (!envelope || envelope.requestId !== runtime.mediaRequestId || envelope.deliverySequence <= revision) return;
    revision = envelope.deliverySequence;
    runtime.baseConfig = envelope.baseConfig;runtime.config = envelope.effectiveConfig;
    runtime.media = { context:envelope.context,phase:envelope.mediaPhase,version:envelope.version,profileState:envelope.profileState,
      revisionStatus:envelope.revisionStatus,audioBindingGeneration:envelope.audioBindingGeneration,audioKind:envelope.audioKind,videoKind:envelope.videoKind,gainOrigin:envelope.gainOrigin };
    runtime.i18n = envelope.i18n;
    runtime.configReady = true;
    if (runtime.media.phase !== 'pending') clearRequest();
    runtime.setStatus('configuration', 'ready');
    runtime.setStatus('mediaSettings',runtime.media.phase === 'ready' ? 'ready' : runtime.media.phase === 'pending' ? 'pending' : 'limited',
      runtime.media.phase === 'ready' ? '' : runtime.media.phase === 'pending' ? 'scoped-config-pending' : 'profile-limited');
    runtime.reconcile();
  };
  const onMutations: MutationCallback = mutations => {
    if (runtime.state.player && !runtime.state.player.pzp.isConnected) { schedule(); return; }
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === 1 ? mutation.target as Element : mutation.target.parentElement;
      if (target?.closest?.('.knife-owned')) continue;
      const changed = [...mutation.addedNodes, ...mutation.removedNodes];
      for (const node of changed) {
        if (node.nodeType !== 1) continue;
        const element = node as Element;
        if (element.classList?.contains('knife-owned') || element.closest?.('.knife-owned')) continue;
        let siteChange = false;
        try { siteChange = runtime.adapter?.affectsDiscovery(element, target || undefined) === true; } catch {}
        if (siteChange || element.matches?.(interesting) || element.querySelector?.(interesting)) { schedule(); return; }
      }
    }
  };

  return {
    start() {
      if (started || disposed) return;
      started = true;
      observer = new environment.MutationObserver(onMutations);
      cleanups.push(() => observer?.disconnect());
      on(environment.window, 'message', onMessage);
      on(environment.document, 'visibilitychange', () => { startPulse();runtime.reconcile();if (!environment.document.hidden) { runtime.revalidateMedia();runtime.notify(); } });
      on(environment.window, 'popstate', () => runtime.reconcile());
      on(environment.window, 'pageshow', () => {
        if (disposed) return;
        suspended = false;
        startPulse();runtime.reconcile();runtime.revalidateMedia();runtime.notify();
      });
      on(environment.window, 'pagehide', event => {
        if ((event as PageTransitionEvent).persisted) {
          const video = runtime.state.player?.video;if (video) runtime.audio?.suspend(video);
          freeze();return;
        }
        dispose();
        environment.onFinal();
      });
      observer.observe(environment.document.documentElement, { childList: true, subtree: true });
      runtime.reconcile();
      startPulse();
      requestConfig();
    },
    schedule,
    dispose,
    requestMedia() { clearRequest();attempts = 0;revision = -1;requestConfig(); },
  };
}
