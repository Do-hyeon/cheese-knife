import type { SiteAdapter, StartTimeTarget } from '../../site-adapter/contracts';
import type { KnifeRuntime, ResourceScope, RuntimeState } from '../../runtime/contracts';
import type { PageFeature, PopupRegistry, RuntimeConfig, RuntimeLabels } from './contracts';

type BrowserWindow = Window & typeof globalThis;
interface Metadata { date: string; expires: number }
interface Annotation { id: string | null; text: string }
interface Pending { id: string; abort(): void; timeout: number }

function own(record: unknown, key: string): unknown {
  if (typeof record !== 'object' || record === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

export function createPageFeature(runtime: KnifeRuntime, target: Window, adapter: SiteAdapter, popups: PopupRegistry): PageFeature {
  const browser = target as BrowserWindow;
  const cache = new Map<string, Metadata>();
  let mounted: ResourceScope | null = null, config: RuntimeConfig = {}, labels: RuntimeLabels = {};

  const bindStartTimes = (body: Element, scope: ResourceScope): void => {
    const pending = new WeakMap<HTMLElement, Pending>(), annotations = new WeakMap<HTMLElement, Annotation>();
    const annotated = new Set<HTMLElement>();
    const annotate = (found: StartTimeTarget, date: string, id: string | null = null): void => {
      const node = found.node;
      if (scope.disposed || !node.isConnected || !date.trim()) return;
      let record = annotations.get(node);
      if (node.dataset.knifeTooltip && node.dataset.knifeTooltip !== record?.text) return;
      const text = `${labels.liveStart || 'Live start'}: ${date}`;
      if (!record) {
        record = { id, text }; annotations.set(node, record); annotated.add(node);
        scope.add(() => { if (node.dataset.knifeTooltip === record?.text) delete node.dataset.knifeTooltip; annotated.delete(node); });
      }
      record.id = id; record.text = text; node.dataset.knifeTooltip = text;
      runtime.setStatus('startTime', 'ready');
    };
    scope.on(body, 'mouseover', async raw => {
      const event = raw as MouseEvent;
      const route = runtime.state.route;
      if (!route) return;
      const found = adapter.page.startTarget(event.target, route);
      if (!found) {
        if (event.target instanceof browser.Node) for (const node of annotated) if (node === event.target || node.contains(event.target)) {
          const record = annotations.get(node);
          if (record && node.dataset.knifeTooltip === record.text) delete node.dataset.knifeTooltip;
        }
        return;
      }
      if (found.node.contains(event.relatedTarget as Node | null)) return;
      if (found.kind === 'live') {
        if (found.node.dataset.knifeTooltip) return;
        const date = adapter.video.openDate(found.node);
        if (date) annotate(found, date); else runtime.setStatus('startTime', 'limited', 'start-metadata-unavailable');
        return;
      }
      const { node, link, id } = found;
      const record = annotations.get(node);
      if (record && record.id !== id && node.dataset.knifeTooltip === record.text) delete node.dataset.knifeTooltip;
      const waiting = pending.get(node);
      if (waiting && waiting.id !== id) { waiting.abort(); target.clearTimeout(waiting.timeout); pending.delete(node); }
      if (node.dataset.knifeTooltip || pending.has(node)) return;
      const cached = cache.get(id);
      if (cached && cached.expires > browser.Date.now()) { annotate(found, cached.date, id); return; }
      const controller = new browser.AbortController();
      const abort = scope.add(() => controller.abort());
      const timeout = target.setTimeout(abort, 5000);
      const request: Pending = { id, abort, timeout }; pending.set(node, request);
      const href = link.href;
      try {
        const endpoint = ['https:', '', 'api.chzzk.naver.com', 'service', 'v3', 'videos', id].join(String.fromCharCode(47));
        const response = await browser.fetch(endpoint, { credentials: 'include', signal: controller.signal });
        if (!response.ok) throw new Error('metadata-unavailable');
        const info = await response.json() as unknown;
        const content = own(info, 'content'), code = own(info, 'code'), liveOpenDate = own(content, 'liveOpenDate');
        if (scope.disposed || !node.isConnected || link.href !== href || pending.get(node) !== request) return;
        if (code !== 200 || typeof liveOpenDate !== 'string') throw new Error('metadata-unavailable');
        cache.delete(id); cache.set(id, { date: liveOpenDate, expires: browser.Date.now() + 1800000 });
        while (cache.size > 100) cache.delete(cache.keys().next().value!);
        annotate(found, liveOpenDate, id);
      } catch {
        if (!scope.disposed && pending.get(node) === request) runtime.setStatus('startTime', 'limited', 'start-metadata-unavailable');
      } finally {
        target.clearTimeout(timeout); if (pending.get(node) === request) pending.delete(node);
      }
    });
  };

  return {
    mountOwner(state, owner, nextConfig, nextLabels) {
      config = nextConfig; labels = nextLabels;
      if (mounted === owner) return;
      mounted = owner;
      const body = state.body;
      if (!body) return;
      if (state.route?.path === String.fromCharCode(47)) {
        body.dataset.knifeHome = '1';
        owner.add(() => { if (body.dataset.knifeHome === '1') delete body.dataset.knifeHome; });
      }
      bindStartTimes(body, owner);
      owner.on(body, 'drop', raw => {
        const event = raw as DragEvent;
        const href = event.dataTransfer?.getData('knife-data');
        if (!href || config.popupPlayer !== true) return;
        const popup = popups.open(href, event.pageX - 320, event.pageY - 12, labels);
        if (!popup) return;
        event.preventDefault(); body.append(popup);
      });
      owner.on(body, 'dragover', raw => {
        const event = raw as DragEvent;
        if (config.popupPlayer === true && event.dataTransfer?.types.includes('knife-data')) event.preventDefault();
      });
    },
    reconcileChannel(state, owner) {
      if (state.route?.kind !== 'channel' || !state.body) return;
      const list = adapter.page.channelTabs(state.body, state.route);
      if (!list || list.querySelector('.knife-channel-chat')) return;
      const button = browser.document.createElement('button');
      button.type = 'button'; button.className = `${(list.lastElementChild as HTMLElement | null)?.className || ''} knife-channel-chat knife-owned`;
      button.textContent = `↗ ${labels.chat || 'Chat'}`;
      owner.on(button, 'click', () => { target.location.href = `${String.fromCharCode(47)}live/${state.route?.id || ''}`; });
      list.append(button); owner.add(() => button.remove());
    },
    reconcileBanner(state, owner) {
      if (!state.body) return;
      const banner = adapter.page.bannerRoot(state.body);
      if (!banner || banner.querySelector('button')) return;
      const close = adapter.banner.closeHandler(banner);
      if (!close) return;
      const button = browser.document.createElement('button');
      button.type = 'button'; button.className = 'knife-owned'; button.textContent = '×';
      owner.on(button, 'click', () => { try { close(); } catch {} }); banner.append(button); owner.add(() => button.remove());
    },
    dispose() { mounted = null; config = {}; labels = {}; cache.clear(); },
  };
}
