import type { ChatControllerPort, ChatMessageSnapshot, OwnedBinding, SiteAdapter } from '../../site-adapter/contracts';
import type { KnifeRuntime, ResourceScope } from '../../runtime/contracts';
import type { ChatFeature, RuntimeConfig } from './contracts';

type BrowserWindow = Window & typeof globalThis;
interface DeletedRecord { sync(): void; paint(): void; dispose(): void }
interface ChatRecord {
  owner: ResourceScope;
  timer: number | null;
  port: ChatControllerPort | null;
  filter: OwnedBinding | null;
  deleted: DeletedRecord | null;
  find(): void;
}
interface RetainedMessage { status: string; content: string | number | null; key: string | null; user: string | null; time: string | number | null }

const pad = (value: number): string => String(value).padStart(2, '0');
const formatTime = (value: number): string => {
  const total = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, seconds = total % 60;
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

export function createChatFeature(runtime: KnifeRuntime, target: Window, adapter: SiteAdapter): ChatFeature {
  const browser = target as BrowserWindow;
  let config: RuntimeConfig = {};
  let owner: ResourceScope | null = null;
  let chats = new WeakMap<Element, ChatRecord>();
  let timestampRoots = new WeakSet<Element>();

  const resizeChat = (container: HTMLElement | null, scope: ResourceScope): void => {
    if (!container || browser.getComputedStyle(browser.document.documentElement).getPropertyValue('--knife-chat-resize').trim() !== '1') return;
    if (!container.parentElement || container.parentElement.querySelector('.knife-resize-handle')) return;
    const handle = browser.document.createElement('div');
    handle.className = 'knife-resize-handle knife-owned';
    handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
    container.before(handle);
    scope.add(() => { handle.remove(); container.style.width = ''; });
    let dragging: { id: number; left: number; right: number; reverse: boolean } | null = null;
    let width: number | undefined;
    try {
      const saved = Number(browser.localStorage.getItem('chatWidth'));
      if (Number.isFinite(saved) && saved >= 24 && saved < browser.innerWidth) browser.document.documentElement.style.setProperty('--knife-chat-width', `${saved}px`);
    } catch {}
    const finish = (): void => {
      if (!dragging) return;
      if (handle.hasPointerCapture?.(dragging.id)) handle.releasePointerCapture(dragging.id);
      dragging = null; container.style.width = '';
      if (Number.isFinite(width)) {
        browser.document.documentElement.style.setProperty('--knife-chat-width', `${width}px`);
        try { browser.localStorage.setItem('chatWidth', String(width)); } catch {}
      }
    };
    scope.on(handle, 'pointerdown', raw => {
      const event = raw as PointerEvent;
      if (event.button !== 0) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      dragging = { id: event.pointerId, left: rect.left, right: rect.right,
        reverse: browser.getComputedStyle(container.parentElement!).flexDirection.endsWith('reverse') };
      handle.setPointerCapture?.(event.pointerId);
    });
    scope.on(handle, 'pointermove', raw => {
      const event = raw as PointerEvent;
      if (!dragging) return;
      width = Math.max(24, Math.min(browser.innerWidth - 24,
        dragging.reverse ? event.clientX - dragging.left - 1 : dragging.right - event.clientX - 1));
      container.style.width = `${width}px`;
    });
    scope.on(handle, 'pointerup', finish); scope.on(handle, 'pointercancel', finish);
    scope.on(target, 'blur', finish); scope.add(() => { dragging = null; });
    runtime.setStatus('chatResize', 'ready');
  };

  const timestamps = (container: Element, isLive: boolean, scope: ResourceScope): void => {
    if (browser.getComputedStyle(browser.document.documentElement).getPropertyValue('--knife-chat-timestamp').trim() !== '1') return;
    const root = adapter.chat.findLogRoot(container);
    if (!root || timestampRoots.has(root)) return;
    timestampRoots.add(root);
    const apply = (): void => {
      let supported = 0;
      for (const row of adapter.chat.messageRows(root)) {
        const message = adapter.chat.readMessage(row), timestamp = adapter.chat.timestampTarget(row);
        if (!message || !timestamp) continue;
        if (isLive && message.time != null) {
          const date = new browser.Date(message.time);
          if (Number.isFinite(date.getTime())) { timestamp.dataset.timestamp = `${pad(date.getHours())}:${pad(date.getMinutes())}`; supported++; }
        } else if (Number.isFinite(message.playerTime)) {
          timestamp.dataset.timestamp = formatTime(message.playerTime!); supported++;
        }
      }
      runtime.setStatus('chatTimestamp', supported ? 'ready' : 'pending', supported ? '' : 'message-props-unavailable');
    };
    apply();
    scope.observe(new browser.MutationObserver(apply), root, { childList: true, subtree: true, characterData: true });
  };

  const bindDeletedChat = (port: ChatControllerPort, container: Element, isLive: boolean, scope: ResourceScope): DeletedRecord => {
    const retained = new Map<number, RetainedMessage>(), markers = new Set<HTMLElement>();
    let binding: OwnedBinding | null = null, limited = false;
    const ownsMessage = (message: ChatMessageSnapshot | null, saved: RetainedMessage | undefined): boolean => !!saved && message?.status === 'NORMAL' && message.type === 1 &&
      message.key === saved.key && message.user === saved.user && message.time === saved.time && message.content === saved.content;
    const releaseMarker = (node: HTMLElement): void => {
      if (node.dataset.knifeDeleted === '1') delete node.dataset.knifeDeleted;
      markers.delete(node);
    };
    const paint = (): void => {
      const messages = port.messages();
      const identities = new Set(messages.map(message => message.identity));
      for (const identity of retained.keys()) if (!identities.has(identity)) retained.delete(identity);
      const wanted = new Set<HTMLElement>();
      if (config.showDeleted === true && !scope.disposed) for (const row of adapter.chat.messageRows(container)) {
        const message = adapter.chat.readMessage(row);
        const current = message && messages.find(value => value.key === message.key && value.user === message.user && value.time === message.time);
        const saved = current ? retained.get(current.identity) : undefined;
        if (current && saved && !ownsMessage(current, saved)) retained.delete(current.identity);
        if (!ownsMessage(current || null, saved) || message?.status !== 'NORMAL' || message.content !== saved?.content) continue;
        for (const node of adapter.chat.deletedTextTargets(row)) wanted.add(node);
      }
      for (const node of markers) if (!wanted.has(node) || !node.isConnected) releaseMarker(node);
      for (const node of wanted) {
        if (markers.has(node)) {
          if (node.dataset.knifeDeleted !== '1') markers.delete(node);
        } else if (!node.hasAttribute('data-knife-deleted')) {
          node.dataset.knifeDeleted = '1'; markers.add(node);
        }
      }
    };
    const rehide = (): void => {
      for (const message of port.messages()) {
        const saved = retained.get(message.identity);
        if (!saved) continue;
        retained.delete(message.identity);
        if (message.status !== 'NORMAL' || message.content !== saved.content || message.key !== saved.key ||
          message.user !== saved.user || message.time !== saved.time || message.type !== 1) continue;
        port.replaceStatus(message, saved.status);
      }
      retained.clear(); for (const node of markers) releaseMarker(node);
    };
    const unbind = (): void => { binding?.dispose(); binding = null; };
    const dispose = (): void => { unbind(); rehide(); };
    const sync = (): void => {
      if (config.showDeleted !== true) { dispose(); runtime.setStatus('deletedChat', 'disabled'); return; }
      if (binding?.active) { paint(); runtime.setStatus('deletedChat', limited ? 'limited' : 'ready', limited ? 'native-deletion-adapter-unavailable' : ''); return; }
      unbind();
      if (!isLive || port.emptyStatus() !== 'NORMAL') { rehide(); runtime.setStatus('deletedChat', 'limited', 'native-deletion-adapter-unavailable'); return; }
      const installed = port.installBlindListener(({ event, before, after, replaceAfterStatus }) => {
        const enabled = !scope.disposed && config.showDeleted === true;
        if (enabled && event && !before) { limited = true; runtime.setStatus('deletedChat', 'limited', 'native-deletion-adapter-unavailable'); paint(); return; }
        const previous = before ? retained.get(before.identity) : undefined;
        const unchanged = !previous || ownsMessage(before, previous);
        if (before && previous && !unchanged) retained.delete(before.identity);
        const eligible = enabled && before && before.type === 1 && before.status === 'NORMAL' && unchanged &&
          typeof event?.blindType === 'string' && event.blindType.length > 0 && event.blindType.length <= 80 &&
          !['CANCEL', 'NORMAL', 'CBOTBLIND'].includes(event.blindType);
        if (!eligible || !before || !event) { paint(); return; }
        if (after && after.identity !== before.identity && after.key === before.key && after.type === 1 &&
          after.status === event.blindType && after.content === before.content) {
          const visible = replaceAfterStatus(after, 'NORMAL');
          if (visible) {
            retained.delete(before.identity);
            retained.set(visible.identity, { status: typeof event.blindType === 'string' ? event.blindType : '', content: before.content,
              key: before.key, user: before.user, time: before.time });
          } else { limited = true; runtime.setStatus('deletedChat', 'limited', 'native-deletion-adapter-unavailable'); }
        } else { limited = true; runtime.setStatus('deletedChat', 'limited', 'native-deletion-adapter-unavailable'); }
        paint();
      });
      if (!installed) { rehide(); runtime.setStatus('deletedChat', 'limited', 'native-deletion-adapter-unavailable'); return; }
      limited = false; binding = installed; paint(); runtime.setStatus('deletedChat', 'ready');
    };
    return { sync, paint, dispose };
  };

  const attach = (container: Element, isLive: boolean, scope: ResourceScope): void => {
    timestamps(container, isLive, scope);
    const existing = chats.get(container);
    if (existing?.owner === scope) { existing.find(); return; }
    const resizeTarget = (isLive ? container : container.closest('aside') || container.parentElement);
    resizeChat(resizeTarget instanceof browser.HTMLElement ? resizeTarget : null, scope);
    const record: ChatRecord = { owner: scope, timer: null, port: null, filter: null, deleted: null, find: (): void => {} };
    const report = (): void => {
      runtime.setStatus('donationChat', config.hideDonation ? (record.filter?.active ? 'ready' : 'limited') : 'disabled',
        config.hideDonation && !record.filter?.active ? 'chat-controller-unavailable' : '');
      record.deleted?.sync();
    };
    let attempts = 0;
    const find = (): void => {
      if (scope.disposed || !container.isConnected) return;
      const port = adapter.chat.connect(container);
      if (port === record.port && record.filter?.active) { report(); return; }
      record.deleted?.dispose(); record.deleted = null;
      record.filter?.dispose(); record.filter = null;
      if (record.port && record.port !== port) record.port.dispose();
      record.port = null;
      if (!port) {
        if (record.timer !== null) return;
        if (++attempts < 20) record.timer = scope.timeout(() => { record.timer = null; find(); }, 100);
        else {
          runtime.setStatus('donationChat', config.hideDonation ? 'limited' : 'disabled', config.hideDonation ? 'chat-controller-unavailable' : '');
          runtime.setStatus('deletedChat', config.showDeleted ? 'limited' : 'disabled', config.showDeleted ? 'chat-controller-unavailable' : '');
        }
        return;
      }
      record.port = port;
      record.filter = port.installMessageFilter(message => config.hideDonation === true && message?.type === 10);
      record.deleted = bindDeletedChat(port, container, isLive, scope);
      report();
    };
    record.find = find; chats.set(container, record);
    scope.add(() => { record.deleted?.dispose(); record.filter?.dispose(); record.port?.dispose(); });
    scope.observe(new browser.MutationObserver(mutations => {
      timestamps(container, isLive, scope); record.deleted?.paint();
      if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes]
        .some(node => node instanceof browser.Element && !node.closest('.knife-owned')))) { attempts = 0; find(); }
    }), container, { childList: true, subtree: true });
    find();
  };

  return {
    reconcile(container, isLive, nextOwner, nextConfig) {
      config = nextConfig;
      if (owner !== nextOwner) { owner = nextOwner; chats = new WeakMap(); timestampRoots = new WeakSet(); }
      if (container) attach(container, isLive, nextOwner);
    },
    dispose() { owner = null; chats = new WeakMap(); timestampRoots = new WeakSet(); config = {}; },
  };
}
