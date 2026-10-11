import { readConfigEnvelope } from './bridge';
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
    if (disposed || suspended || runtime.configReady || requestTimer !== null) return;
    if (attempts++ >= 20) { runtime.setStatus('configuration', 'limited', 'config-unavailable'); return; }
    environment.window.postMessage({ namespace: 'cheese-knife', protocol: 1, type: 'config-request', requestId: runtime.requestId }, environment.location.origin);
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
    const envelope = readConfigEnvelope(event as MessageEvent, {
      source: environment.window, origin: environment.location.origin, requestId: runtime.requestId, revision,
    });
    if (!envelope) return;
    revision = envelope.revision;
    runtime.config = envelope.config;
    runtime.i18n = envelope.i18n;
    runtime.configReady = true;
    clearRequest();
    runtime.setStatus('configuration', 'ready');
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
      on(environment.document, 'visibilitychange', () => { startPulse(); runtime.reconcile(); });
      on(environment.window, 'popstate', () => runtime.reconcile());
      on(environment.window, 'pageshow', () => {
        if (disposed) return;
        suspended = false;
        startPulse(); runtime.reconcile();
        if (!runtime.configReady) requestConfig();
      });
      on(environment.window, 'pagehide', event => {
        if ((event as PageTransitionEvent).persisted) { freeze(); return; }
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
  };
}
