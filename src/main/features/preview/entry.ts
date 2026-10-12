import type { KnifeRuntime, ResourceScope } from '../../runtime/contracts';
import type { PreviewController, PreviewIntent, PreviewLiveInfo, PreviewPlayback } from './contracts';
import { createPanel } from './panel';
import { createPlayback, type PlaybackIntent, type PreviewPlaybackSession } from './playback';

type BrowserWindow = Window & typeof globalThis;
interface CacheEntry { info: PreviewLiveInfo; expires: number }

function own(record: unknown, key: string): unknown {
  if (typeof record !== 'object' || record === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function https(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { return new URL(value).protocol === 'https:' ? value : null; }
  catch { return null; }
}

function playback(value: unknown): PreviewPlayback | null {
  if (typeof value !== 'string' || value.length > 1024 * 1024) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { return null; }
  const rawMedia = own(parsed, 'media');
  const media = Array.isArray(rawMedia) ? rawMedia.slice(0, 128).flatMap(item => {
    const mediaId = own(item, 'mediaId');
    const path = https(own(item, 'path'));
    return typeof mediaId === 'string' && path ? [{ mediaId, path }] : [];
  }) : [];
  const thumbnail = https(own(own(parsed, 'thumbnail'), 'snapshotThumbnailTemplate'));
  return { media, thumbnail };
}

function liveInfo(body: unknown): PreviewLiveInfo | null {
  if (own(body, 'code') !== 200) return null;
  const content = own(body, 'content');
  if (typeof content !== 'object' || content === null) return null;
  const status = own(content, 'status');
  if (typeof status !== 'string') return null;
  const adult = own(content, 'adult');
  const openDate = own(content, 'openDate');
  return {
    status,
    adult: adult === true,
    openDate: typeof openDate === 'string' ? openDate : null,
    image: https(own(content, 'liveImageUrl')),
    playback: playback(own(content, 'livePlaybackJson')),
  };
}

function configuredNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function installPreview(target: Window): PreviewController | null {
  const browser = target as BrowserWindow;
  const key = browser.Symbol.for('cheese-knife.runtime.v1');
  const runtime = Object.getOwnPropertyDescriptor(target, key)?.value as KnifeRuntime | undefined;
  if (!runtime || runtime.preview) return null;
  const scope = runtime.createScope();
  const panel = createPanel(runtime, scope);
  const cache = new Map<string, CacheEntry>();
  const timers = new Set<number>();
  let generation = 0;
  let request: AbortController | null = null;
  let current: PlaybackIntent | null = null;
  let session: PreviewPlaybackSession | null = null;
  let unsubscribe: (() => boolean) | null = null;
  let disposed = false;
  const later = (callback: () => void, delay: number): number => {
    const timer = browser.setTimeout(() => { timers.delete(timer); callback(); }, delay); timers.add(timer); return timer;
  };
  const ownsAnchor = (anchor: HTMLAnchorElement): boolean => !!runtime.state.sidebar?.isConnected && anchor.isConnected && runtime.state.sidebar.contains(anchor);
  const active = (token: number, intent: PreviewIntent): boolean => token === generation && current === intent && ownsAnchor(intent.anchor) &&
    intent.anchor.href === intent.href && browser.location.pathname === intent.route && runtime.config.preview === true &&
    !browser.document.hidden && runtime.configReady;
  const cleanup = (): void => {
    generation++; request?.abort(); request = null;
    for (const timer of timers) browser.clearTimeout(timer); timers.clear();
    session?.dispose(); session = null; current = null; panel.hide();
  };
  const parseURL = (href: string): URL | null => {
    try {
      const url = new browser.URL(href);
      return url.origin === browser.location.origin && /^\/live\/[a-f0-9]{32}\/?$/i.test(url.pathname) ? url : null;
    } catch { return null; }
  };
  const controller: PreviewController = {
    diagnostics: panel.diagnostics,
    async show(href, anchor, tooltip = false) {
      const url = parseURL(href);
      if (!url || !ownsAnchor(anchor) || href !== anchor.href || runtime.config.preview !== true || !runtime.configReady ||
        runtime.state.route?.kind === 'excluded') return;
      if (current?.href === href && current.anchor === anchor) return;
      cleanup();
      const token = generation;
      const hoverStarted = browser.Date.now();
      const id = url.pathname.match(/[a-f0-9]{32}/i)?.[0];
      if (!id) return;
      const intent: PlaybackIntent = current = {
        id, href, anchor, route: browser.location.pathname, live: runtime.config.livePreview === true,
        startUnmuted: runtime.config.previewStartUnmuted === true,
        invalidate: () => cache.delete(id),
      };
      const pending = request = new browser.AbortController();
      const timeout = later(() => pending.abort(), 5000);
      let info: PreviewLiveInfo;
      try {
        const cached = cache.get(id);
        if (cached && cached.expires > browser.Date.now()) info = cached.info;
        else {
          const api = ['https:', '', 'api.chzzk.naver.com', 'service', 'v3.3', 'channels', id, 'live-detail'].join(String.fromCharCode(47));
          const response = await browser.fetch(api, {
            credentials: 'include', signal: pending.signal,
          });
          if (!response.ok) throw new Error('api-unavailable');
          const parsed = liveInfo(await response.json());
          if (!parsed) throw new Error('api-unavailable');
          info = parsed;
          if (active(token, intent)) {
            cache.delete(id); cache.set(id, { info, expires: browser.Date.now() + (info.status === 'OPEN' ? 30000 : 5000) });
            while (cache.size > 100) cache.delete(cache.keys().next().value!);
          }
        }
      } catch {
        if (active(token, intent)) runtime.setStatus('livePreview', 'limited', 'live-detail-unavailable');
        return;
      } finally { browser.clearTimeout(timeout); timers.delete(timeout); }
      if (!active(token, intent)) return;
      const rect = anchor.getBoundingClientRect();
      if (!rect.width) return;
      panel.place(anchor, tooltip, configuredNumber(runtime.config.previewWidth, 400));
      panel.setImage(info.image || info.playback?.thumbnail || null);
      const open = info.openDate ? new browser.Date(`${info.openDate}+0900`).getTime() : NaN;
      const updateUptime = (): void => {
        if (!active(token, intent)) return;
        if (Number.isFinite(open)) {
          const seconds = Math.max(0, Math.floor((browser.Date.now() - open) / 1000));
          panel.setUptime(`${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
        } else panel.setUptime('');
        later(updateUptime, 1000);
      };
      if (runtime.config.livePreview === true && info.status === 'OPEN') session = createPlayback(runtime, panel, intent, info);
      const delay = Math.max(100, Math.min(3000, configuredNumber(runtime.config.previewDelay, 1) * 1000 || 1000));
      later(() => {
        if (!active(token, intent)) return;
        panel.show(); updateUptime(); runtime.setStatus('preview', 'ready');
        if (intent.startUnmuted) void session?.play();
      }, Math.max(0, hoverStarted + delay - browser.Date.now()));
    },
    hide(href) { if (!href || current?.href === href) cleanup(); },
  };
  const checkActive = (): void => {
    if (current && (browser.location.pathname !== current.route || !ownsAnchor(current.anchor) || current.anchor.href !== current.href ||
      (panel.root && !panel.root.isConnected) || runtime.config.preview !== true ||
      ((current.live || session) && runtime.config.livePreview !== true))) cleanup();
    if (current && session) { session.setVolume(); session.refresh(); }
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true; cleanup(); unsubscribe?.(); unsubscribe = null; scope.dispose();
    if (runtime.preview === controller) Reflect.deleteProperty(runtime, 'preview');
  };
  try {
    scope.on(browser.document, 'mouseout', event => {
      const mouse = event as MouseEvent;
      const element = event.target instanceof browser.Element ? event.target : null;
      const anchor = element?.closest('a[href]');
      if (anchor instanceof browser.HTMLAnchorElement && anchor === current?.anchor && !anchor.contains(mouse.relatedTarget as Node | null)) {
        controller.hide(anchor.href);
      }
    });
    scope.on(browser.document, 'visibilitychange', () => { if (browser.document.hidden) cleanup(); });
    scope.on(browser.document, 'contextmenu', event => {
      if (runtime.config.rightClickToUnmute !== true || !current || !session?.media) return;
      const element = event.target instanceof browser.Element ? event.target : null;
      if (element?.closest('a[href]') !== current.anchor || !active(generation, current)) return;
      event.preventDefault(); session.toggle();
    });
    scope.on(browser, 'pagehide', event => { cleanup(); if (!(event as PageTransitionEvent).persisted) dispose(); });
    scope.observe(new browser.MutationObserver(checkActive), browser.document.documentElement,
      { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    unsubscribe = runtime.subscribe(checkActive); scope.add(() => { unsubscribe?.(); unsubscribe = null; });
    runtime.preview = controller;
    return controller;
  } catch {
    dispose();
    return null;
  }
}

installPreview(window);
