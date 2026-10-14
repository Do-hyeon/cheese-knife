import type { KnifeRuntime, ResourceScope, RuntimeState } from '../../runtime/contracts';
import { createChatFeature } from './chat';
import { createPageFeature } from './page';
import { createPopupRegistry } from './popup';
import { createSidebarFeature } from './sidebar';

type BrowserWindow = Window & typeof globalThis;

export function startCoordinator(target: Window): boolean {
  const browser = target as BrowserWindow;
  const key = browser.Symbol.for('cheese-knife.runtime.v1');
  const runtime = Object.getOwnPropertyDescriptor(target, key)?.value as KnifeRuntime | undefined;
  if (runtime?.ownerProtocol !== 2 || runtime.coordinatorStarted) return false;
  const adapter = runtime.adapter;
  if (!adapter) {
    for (const feature of ['donationChat', 'deletedChat', 'chatTimestamp']) runtime.setStatus(feature, 'pending', 'site-adapter-unavailable');
    return false;
  }

  const popups = createPopupRegistry(runtime, target);
  const chat = createChatFeature(runtime, target, adapter);
  const sidebar = createSidebarFeature(runtime, target, adapter, () => runtime.preview);
  const page = createPageFeature(runtime, target, adapter, popups);
  let owner: ResourceScope | null = null, ownerGeneration = -1, unsubscribe: (() => boolean) | null = null, disposed = false;
  const status = (feature: string): void => { try { runtime.setStatus(feature, 'failed', 'feature-initialization'); } catch {} };
  const fail = (feature: string, action: () => void): void => {
    try { action(); } catch { status(feature); }
  };
  const retireOwner = (): void => {
    const previous = owner; owner = null; ownerGeneration = -1;
    if (previous) fail('runtime', () => previous.dispose());
  };
  const reconcile = (state: RuntimeState): void => {
    if (disposed) return;
    const config = runtime.config, labels = runtime.i18n;
    fail('popupPlayer', () => popups.retireDetached());
    if (!runtime.configReady || state.route?.kind === 'excluded') {
      fail('sidebarRefresh', () => sidebar.reconcile(null, state, owner, config));
      retireOwner();
      if (state.route?.kind === 'excluded') fail('popupPlayer', () => popups.dispose());
      return;
    }
    if (!owner || ownerGeneration !== runtime.generation) {
      retireOwner();
      try { owner = runtime.createScope(); ownerGeneration = runtime.generation; }
      catch { status('runtime'); return; }
    }
    const activeOwner = owner;
    fail('startTime', () => page.mountOwner(state, activeOwner, config, labels));
    fail('sidebarRefresh', () => sidebar.reconcile(state.sidebar || null, state, activeOwner, config));
    fail('channelChat', () => page.reconcileChannel(state, activeOwner));
    const routeKind = state.route?.kind;
    fail('donationChat', () => {
      const container = state.body && (routeKind === 'live' || routeKind === 'vod') ? adapter.chat.findContainer(state.body, routeKind) : null;
      chat.reconcile(container, routeKind === 'live', activeOwner, config);
    });
    fail('bannerClose', () => page.reconcileBanner(state, activeOwner));
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    const stop = unsubscribe; unsubscribe = null; if (stop) fail('runtime', () => { stop(); });
    retireOwner();
    fail('donationChat', () => chat.dispose());
    fail('sidebarRefresh', () => sidebar.dispose());
    fail('startTime', () => page.dispose());
    fail('popupPlayer', () => popups.dispose());
  };

  runtime.coordinatorStarted = true;
  try {
    unsubscribe = runtime.subscribe(reconcile);
    target.addEventListener('pagehide', raw => { if (!(raw as PageTransitionEvent).persisted) dispose(); });
    return true;
  } catch {
    Reflect.deleteProperty(runtime, 'coordinatorStarted'); dispose(); return false;
  }
}
