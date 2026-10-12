import type { FollowingControls, SiteAdapter } from '../../site-adapter/contracts';
import type { KnifeRuntime, ResourceScope, RuntimeState } from '../../runtime/contracts';
import type { PreviewController } from '../preview/contracts';
import type { RuntimeConfig, SidebarFeature } from './contracts';

type BrowserWindow = Window & typeof globalThis;
type IntentKind = 'more' | 'fold';
interface FollowingIntent { kind: IntentKind; before: string; control: WeakRef<HTMLButtonElement>; epoch: number; expires: number }
interface Settlement {
  epoch: number; deadline: number; quietAt: number; attempted: boolean; cancelled: boolean; confirmed: boolean;
  control?: WeakRef<HTMLButtonElement> | null;
}
interface SidebarRecord {
  root: Element; owner: ResourceScope; timer: number | null; settleTimer: number | null; settleAt: number | null;
  expanding: boolean; suspended: boolean; sync(): void;
}

export function createSidebarFeature(runtime: KnifeRuntime, target: Window, adapter: SiteAdapter,
  preview: () => PreviewController | undefined): SidebarFeature {
  const browser = target as BrowserWindow;
  let config: RuntimeConfig = {}, record: SidebarRecord | null = null;
  let observedOwner: ResourceScope | null = null;
  let anchors = new WeakSet<HTMLAnchorElement>();
  let userCollapsed = false, enabled = false, wide: boolean | null = null, modeKnown = false;
  let manualCancelled = false, manualUncertain = false, routePath: string | undefined, epoch = 0;
  let settlement: Settlement | null = null, intent: FollowingIntent | null = null, gesture: FollowingIntent | null = null;

  const validLive = (href: string): boolean => {
    try { const url = new browser.URL(href, target.location.origin); return url.origin === target.location.origin && /^\/live\/[a-f0-9]{32}\/?$/i.test(url.pathname); }
    catch { return false; }
  };
  const syncMode = (state = runtime.state): void => {
    const route = state.route;
    if (route?.path !== routePath) { routePath = route?.path; manualCancelled = manualUncertain = false; epoch++; }
    const next = route ? adapter.sidebar.viewMode(state.body || null, state.player?.pzp || null, route) : null;
    if (next === null) { modeKnown = false; return; }
    modeKnown = true;
    if (next !== wide) {
      if (wide !== null && !manualUncertain) manualCancelled = false;
      wide = next; epoch++;
    }
    manualUncertain = false;
  };
  const setEnabled = (): void => {
    const next = config.expandFollowings === true;
    if (next === enabled) return;
    enabled = next; userCollapsed = manualCancelled = manualUncertain = false;
    intent = gesture = null; epoch++;
  };

  const bind = (root: Element, state: RuntimeState, owner: ResourceScope): void => {
    if (record?.root === root && record.owner === owner) { record.sync(); return; }
    const current: SidebarRecord = record = {
      root, owner, timer: null, settleTimer: null, settleAt: null, expanding: false, suspended: false, sync: (): void => {},
    };
    anchors = new WeakSet();
    if (settlement?.epoch === epoch && !settlement.attempted) settlement.quietAt = browser.performance.now();
    const marker = 'data-knife-sidebar-section';
    const markers = new Map<Element, string>();
    const release = (section: Element): void => {
      if (section.getAttribute(marker) === markers.get(section)) section.removeAttribute(marker);
      markers.delete(section);
    };
    const syncSections = (): void => {
      const sections = new Set(adapter.sidebar.sections(root));
      for (const section of markers.keys()) if (!sections.has(section)) release(section);
      for (const section of sections) {
        const existing = section.getAttribute(marker);
        if (markers.has(section) && existing !== markers.get(section)) { markers.delete(section); continue; }
        if (!markers.has(section) && existing !== null) continue;
        const kind = adapter.sidebar.classify(section);
        if (!kind) { if (markers.has(section)) release(section); continue; }
        if (existing !== kind) section.setAttribute(marker, kind);
        markers.set(section, kind);
      }
    };
    owner.add(() => { for (const section of markers.keys()) release(section); });
    const controls = (): FollowingControls | null => adapter.sidebar.following(root);
    const control = (value: FollowingIntent): HTMLButtonElement | null => value.kind === 'more' ? controls()?.more || null : controls()?.fold || null;
    const confirmIntent = (): void => {
      if (!gesture) return;
      if (gesture.epoch !== epoch) { intent = gesture = null; return; }
      if (browser.performance.now() >= gesture.expires) intent = null;
      const currentControl = control(gesture);
      if (!intent && currentControl !== gesture.control.deref()) { gesture = null; return; }
      const expanded = currentControl?.getAttribute('aria-expanded');
      if (expanded && ['true', 'false'].includes(expanded) && expanded !== gesture.before) {
        userCollapsed = expanded === 'false'; intent = gesture = null;
      }
    };
    let expiryIntent: FollowingIntent | null = null, expiryTimer: number | undefined;
    const armIntentExpiry = (): void => {
      if (expiryIntent === intent) return;
      if (expiryTimer !== undefined) target.clearTimeout(expiryTimer);
      expiryIntent = intent;
      if (!expiryIntent) return;
      const expected = expiryIntent;
      expiryTimer = owner.timeout(() => {
        expiryIntent = null;
        if (intent === expected) { confirmIntent(); if (intent === expected) intent = null; current.sync(); }
      }, Math.max(0, expected.expires - browser.performance.now()));
    };
    const stopRefresh = (): void => { if (current.timer !== null) target.clearInterval(current.timer); current.timer = null; };
    const stopSettlement = (): void => {
      if (current.settleTimer !== null) target.clearTimeout(current.settleTimer);
      current.settleTimer = current.settleAt = null;
    };
    const scheduleSettlement = (at: number): void => {
      if (current.settleTimer !== null && current.settleAt === at) return;
      stopSettlement(); current.settleAt = at;
      current.settleTimer = target.setTimeout(() => { current.settleTimer = current.settleAt = null; current.sync(); }, Math.max(0, at - browser.performance.now()));
    };
    owner.add(stopSettlement);
    const refresh = (): void => {
      if (owner.disposed || current.suspended || browser.document.hidden || !root.isConnected || config.updateSidebar !== true) return;
      const button = controls()?.refresh;
      if (button && !button.disabled) button.click();
    };
    current.sync = (): void => {
      if (owner.disposed || !root.isConnected) { stopRefresh(); stopSettlement(); return; }
      if (runtime.route().path !== runtime.state.route?.path) { stopSettlement(); runtime.reconcile(); return; }
      syncMode(); confirmIntent(); armIntentExpiry(); syncSections();
      const refreshButton = controls()?.refresh;
      if (config.updateSidebar === true && refreshButton) {
        if (current.timer === null && !current.suspended) current.timer = owner.interval(refresh, 30000);
        runtime.setStatus('sidebarRefresh', 'ready');
      } else {
        stopRefresh(); runtime.setStatus('sidebarRefresh', config.updateSidebar ? 'limited' : 'disabled', config.updateSidebar ? 'following-control-unavailable' : '');
      }
      if (config.expandFollowings !== true) { stopSettlement(); runtime.setStatus('expandFollowings', 'disabled'); return; }
      if (userCollapsed) { stopSettlement(); runtime.setStatus('expandFollowings', 'disabled', 'user-collapsed'); return; }
      if (!modeKnown || wide || current.suspended || browser.document.hidden) {
        stopSettlement(); if (settlement) settlement.quietAt = browser.performance.now();
        runtime.setStatus('expandFollowings', modeKnown ? 'pending' : 'limited',
          !modeKnown ? 'native-mode-unavailable' : wide ? 'native-wide-mode' : 'page-suspended'); return;
      }
      const now = browser.performance.now();
      if (settlement?.epoch !== epoch) settlement = { epoch, deadline: now + 5000, quietAt: now, attempted: false, cancelled: manualCancelled, confirmed: false };
      const active = settlement;
      const more = controls()?.more || null;
      if (active.control?.deref() !== more) { active.control = more ? new WeakRef(more) : null; active.quietAt = now; }
      if (!more || !['true', 'false'].includes(more.getAttribute('aria-expanded') || '')) {
        if (!active.cancelled && !active.attempted && now < active.deadline) scheduleSettlement(active.deadline); else stopSettlement();
        runtime.setStatus('expandFollowings', 'limited', 'following-control-unavailable'); return;
      }
      if (more.getAttribute('aria-expanded') === 'true') { active.confirmed = true; stopSettlement(); runtime.setStatus('expandFollowings', 'ready'); return; }
      if (active.cancelled) { stopSettlement(); runtime.setStatus('expandFollowings', 'pending', 'user-activation'); return; }
      if (active.attempted) {
        if (!active.confirmed && now < active.deadline) scheduleSettlement(active.deadline); else stopSettlement();
        runtime.setStatus('expandFollowings', active.confirmed || now >= active.deadline ? 'limited' : 'pending',
          active.confirmed ? 'following-native-reset' : 'following-expand-unconfirmed'); return;
      }
      if (now >= active.deadline) { stopSettlement(); runtime.setStatus('expandFollowings', 'limited', 'following-settlement-timeout'); return; }
      if (more.disabled || intent || now - active.quietAt < 500) {
        scheduleSettlement(more.disabled || intent ? active.deadline : Math.min(active.deadline, active.quietAt + 500));
        runtime.setStatus('expandFollowings', 'pending', 'following-native-settling'); return;
      }
      stopSettlement(); active.attempted = true; current.expanding = true;
      try { more.click(); } finally { current.expanding = false; }
      current.sync();
    };
    owner.on(root, 'click', raw => {
      if (current.expanding || config.expandFollowings !== true) return;
      const event = raw as MouseEvent;
      const button = event.target instanceof browser.Element ? event.target.closest('button[aria-expanded]') : null;
      const found = controls();
      if (!(button instanceof browser.HTMLButtonElement) || button.disabled || !found?.section.contains(button)) return;
      const kind: IntentKind | null = button === found.more ? 'more' : button === found.fold ? 'fold' : null;
      const expanded = button.getAttribute('aria-expanded');
      if (!kind || !expanded || !['true', 'false'].includes(expanded)) return;
      syncMode(); manualCancelled = true; manualUncertain = !modeKnown;
      if (settlement?.epoch === epoch) settlement.cancelled = true;
      stopSettlement();
      intent = gesture = { kind, before: expanded, control: new WeakRef(button), epoch, expires: browser.performance.now() + 200 };
      armIntentExpiry();
    }, { capture: true });
    owner.on(root, 'click', confirmIntent);
    owner.add(stopRefresh);
    owner.on(target, 'pagehide', () => { current.suspended = true; stopRefresh(); stopSettlement(); });
    owner.on(target, 'pageshow', () => { current.suspended = false; if (settlement) settlement.quietAt = browser.performance.now(); current.sync(); });
    const attach = (anchor: HTMLAnchorElement): void => {
      if (!validLive(anchor.href) || anchors.has(anchor)) return;
      anchors.add(anchor); anchor.draggable = true;
      owner.on(anchor, 'mouseenter', () => {
        if (config.preview !== true) return;
        try { void preview()?.show(anchor.href, anchor, true).catch(() => {}); } catch {}
      });
      owner.on(anchor, 'mouseleave', () => { try { preview()?.hide(anchor.href); } catch {} });
      owner.on(anchor, 'dragstart', raw => {
        const event = raw as DragEvent;
        if (!config.popupPlayer || !event.dataTransfer || !validLive(anchor.href)) return;
        event.stopPropagation(); event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('knife-data', anchor.href);
      });
    };
    for (const node of root.querySelectorAll('a[href]')) if (node instanceof browser.HTMLAnchorElement) attach(node);
    owner.observe(new browser.MutationObserver(mutations => {
      const found = controls(), more = found?.more, fold = found?.fold;
      const nativeUpdate = mutations.some(mutation => found?.section.contains(mutation.target) &&
        !(mutation.target instanceof browser.Element && mutation.target.closest('.knife-owned')) &&
        (mutation.type !== 'attributes' || (mutation.target === more || mutation.target === fold) && mutation.attributeName !== 'class' && mutation.attributeName !== 'href'));
      if (nativeUpdate && settlement?.epoch === epoch && !settlement.attempted) settlement.quietAt = browser.performance.now();
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'href' && mutation.target instanceof browser.HTMLAnchorElement) attach(mutation.target);
        for (const added of mutation.addedNodes) if (added instanceof browser.Element) {
          if (added instanceof browser.HTMLAnchorElement && added.matches('a[href]')) attach(added);
          for (const node of added.querySelectorAll('a[href]')) if (node instanceof browser.HTMLAnchorElement) attach(node);
        }
      }
      current.sync();
    }), root, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['aria-expanded', 'disabled', 'aria-label', 'href', 'class'] });
    current.sync();
  };

  return {
    reconcile(root, state, owner, nextConfig) {
      config = nextConfig; setEnabled(); syncMode(state);
      if (observedOwner !== owner) {
        observedOwner = owner;
        const changed = (): void => { syncMode(); record?.sync(); };
        if (state.body) owner.observe(new browser.MutationObserver(changed), state.body,
          { attributes: true, attributeFilter: ['class'] });
        if (state.player?.pzp) owner.observe(new browser.MutationObserver(changed), state.player.pzp,
          { attributes: true, subtree: true, attributeFilter: ['class', 'aria-label', 'aria-pressed'] });
      }
      if (root) bind(root, state, owner);
    },
    dispose() { record = null; observedOwner = null; anchors = new WeakSet(); config = {}; },
  };
}
