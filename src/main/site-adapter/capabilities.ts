import type {
  BlindEventSnapshot, BlindTransition, ChatControllerPort, ChatMessageSnapshot, OwnedBinding, SiteAdapter, SitePlayerMetrics,
} from './contracts';
import { affectsSiteDiscovery, discoverSite } from './discovery';
import { ownData, replaceOwnData, siteObject, type ReactReader, type SiteObject } from './react';

const MAX_TEXT = 256, MAX_CONTENT = 64 * 1024, MAX_MESSAGES = 10000, MAX_EVENTS = 256;
const INVALID = Symbol('invalid');
type Invalid = typeof INVALID;
type SnapshotOwner = { list: unknown[]; index: number; raw: SiteObject };
type BoundedArray = { value: unknown[]; length: number };

function text(value: unknown, max = MAX_TEXT): string | null | Invalid {
  return value == null ? null : typeof value === 'string' && value.length <= max ? value : INVALID;
}
function finite(value: unknown): number | null | Invalid {
  return value == null ? null : typeof value === 'number' && Number.isFinite(value) ? value : INVALID;
}
function time(value: unknown): string | number | null | Invalid {
  if (value == null) return null;
  if (typeof value === 'string') return value.length <= MAX_TEXT ? value : INVALID;
  return typeof value === 'number' && Number.isFinite(value) ? value : INVALID;
}
function data(object: unknown, key: PropertyKey): unknown { return ownData(object, key)?.value; }
function field(object: unknown, key: PropertyKey): unknown | Invalid {
  if (!siteObject(object)) return INVALID;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return !descriptor ? undefined : 'value' in descriptor ? descriptor.value : INVALID;
  } catch { return INVALID; }
}
function thenable(value: unknown): boolean {
  if (!siteObject(value)) return false;
  let current: unknown = value;
  for (let depth = 0; siteObject(current) && depth < 4; depth++) {
    let descriptor: PropertyDescriptor | undefined;
    try { descriptor = Object.getOwnPropertyDescriptor(current, 'then'); } catch { return true; }
    if (descriptor) return !('value' in descriptor) || typeof descriptor.value === 'function';
    try { current = Object.getPrototypeOf(current); } catch { return true; }
  }
  return siteObject(current);
}
function boundedArray(value: unknown, max: number): BoundedArray | null {
  try {
    if (!Array.isArray(value)) return null;
    const length = ownData(value, 'length')?.value;
    return Number.isSafeInteger(length) && (length as number) >= 0 && (length as number) <= max ? { value, length: length as number } : null;
  } catch { return null; }
}
function binding(active: () => boolean, release: () => void): OwnedBinding {
  let disposed = false;
  return { get active() { return !disposed && active(); }, dispose() { if (disposed) return; disposed = true; release(); } };
}

export function createSiteCapabilities(reader: ReactReader): SiteAdapter {
  const identities = new WeakMap<SiteObject, number>();
  const ports = new WeakMap<SiteObject, ChatControllerPort>();
  let nextIdentity = 0;
  const identity = (value: SiteObject) => {
    let current = identities.get(value);
    if (current === undefined) { current = ++nextIdentity; identities.set(value, current); }
    return current;
  };
  const snapshotMessage = (value: unknown): ChatMessageSnapshot | null => {
    if (!siteObject(value)) return null;
    const key = text(field(value, 'key')), user = text(field(value, 'user')),
      messageTime = time(field(value, 'time')), playerTime = finite(field(value, 'playerMessageTime')),
      type = finite(field(value, 'type')), status = text(field(value, 'status'));
    const rawContent = field(value, 'content');
    const content = typeof rawContent === 'string' ? text(rawContent, MAX_CONTENT) :
      siteObject(rawContent) ? identity(rawContent) : finite(rawContent);
    if ([key, user, messageTime, playerTime, type, status, content].includes(INVALID)) return null;
    return Object.freeze({ identity: identity(value), key, user, time: messageTime, playerTime, type, status, content }) as ChatMessageSnapshot;
  };
  const snapshotEvent = (value: unknown): BlindEventSnapshot | null => {
    if (!siteObject(value)) return null;
    const messageTime = time(field(value, 'messageTime')), userId = text(field(value, 'userId')), blindType = text(field(value, 'blindType'));
    return [messageTime, userId, blindType].includes(INVALID) ? null : Object.freeze({ messageTime, userId, blindType }) as BlindEventSnapshot;
  };
  const messageFromRow = (row: Element): unknown => {
    const props = reader.propsOf(row), direct = data(props, 'chatMessage');
    if (direct !== undefined) return direct;
    return data(data(data(props, 'children'), 'props'), 'chatMessage');
  };
  const createPort = (controller: SiteObject): ChatControllerPort => {
    let active = true, filterBinding: OwnedBinding | null = null, blindBinding: OwnedBinding | null = null;
    let previousBlind: { original: unknown; replacement: unknown } | null = null;
    const owners = new WeakMap<ChatMessageSnapshot, SnapshotOwner>();
    const currentList = (): BoundedArray | null => {
      const value = data(controller, 'messageList');
      return boundedArray(value, MAX_MESSAGES);
    };
    const snapshotAt = (list: unknown[], index: number): ChatMessageSnapshot | null => {
      const property = ownData(list, String(index)), snapshot = property && snapshotMessage(property.value);
      if (snapshot && siteObject(property.value)) owners.set(snapshot, { list, index, raw: property.value });
      return snapshot;
    };
    const messages = (): readonly ChatMessageSnapshot[] => {
      const current = active && currentList();
      if (!current) return [];
      const { value: list, length } = current;
      const snapshots: ChatMessageSnapshot[] = [];
      for (let index = 0; index < length; index++) { const snapshot = snapshotAt(list, index); if (snapshot) snapshots.push(snapshot); }
      return snapshots;
    };
    const replaceStatus = (expected: ChatMessageSnapshot, nextStatus: string): ChatMessageSnapshot | null => {
      if (!active || typeof nextStatus !== 'string' || text(nextStatus) === INVALID) return null;
      const owner = owners.get(expected), current = currentList();
      if (!owner || !current || owner.list !== current.value || owner.index >= current.length || ownData(current.value, String(owner.index))?.value !== owner.raw) return null;
      const list = current.value;
      const currentSnapshot = snapshotMessage(owner.raw);
      if (!currentSnapshot || Object.keys(expected).some(key => data(expected, key) !== data(currentSnapshot, key))) return null;
      let descriptors: PropertyDescriptorMap;
      try { descriptors = Object.getOwnPropertyDescriptors(owner.raw); for (const descriptor of Object.values(descriptors)) if (!('value' in descriptor)) return null; }
      catch { return null; }
      const replacement: Record<PropertyKey, unknown> = {};
      try { Object.defineProperties(replacement, descriptors); Object.defineProperty(replacement, 'status', { configurable: true, enumerable: true, writable: true, value: nextStatus }); }
      catch { return null; }
      if (data(controller, 'messageList') !== list || ownData(list, String(owner.index))?.value !== owner.raw) return null;
      if (!replaceOwnData(list, String(owner.index), owner.raw, replacement)) return null;
      const update = data(controller, 'notiUpdateMessageList');
      if (typeof update === 'function') {
        let result: unknown;
        try { result = Reflect.apply(update, controller, []); }
        catch {
          replaceOwnData(list, String(owner.index), replacement, owner.raw);
          return null;
        }
        if (thenable(result)) {
          replaceOwnData(list, String(owner.index), replacement, owner.raw);
          return null;
        }
      }
      return snapshotAt(list, owner.index);
    };
    const port: ChatControllerPort = {
      get active() { return active; },
      emptyStatus() { const value = text(data(data(controller, 'emptyMessage'), 'status')); return value === INVALID ? null : value; },
      messages,
      installMessageFilter(block) {
        if (!active) return null;
        if (filterBinding?.active) return filterBinding;
        filterBinding?.dispose();
        const property = ownData(controller, 'messageFilter');
        if (!property || typeof property.value !== 'function' || property.descriptor.writable !== true) return null;
        const original = property.value;
        const replacement = function (this: unknown, message: unknown, ...args: unknown[]) {
          const result = Reflect.apply(original, this, [message, ...args]);
          if (!result) return result;
          try { return block(snapshotMessage(message)) ? false : result; } catch { return result; }
        };
        if (!replaceOwnData(controller, 'messageFilter', original, replacement)) return null;
        const owned = binding(() => data(controller, 'messageFilter') === replacement, () => { replaceOwnData(controller, 'messageFilter', replacement, original); });
        filterBinding = owned; return owned;
      },
      installBlindListener(handler) {
        if (!active) return null;
        if (blindBinding?.active) return blindBinding;
        blindBinding?.dispose();
        const originalProperty = ownData(controller, 'notiBlindListener');
        const client = data(controller, 'chatClient'), boundedEntries = boundedArray(data(data(client, '_events'), 'notiBlind'), MAX_EVENTS);
        if (!originalProperty || typeof originalProperty.value !== 'function' || originalProperty.descriptor.writable !== true || !boundedEntries) return null;
        const { value: entries, length: entryCount } = boundedEntries;
        const original = originalProperty.value;
        if (previousBlind) for (let index = 0; index < entryCount; index++) {
          const entry = ownData(entries, String(index))?.value;
          if (data(entry, 'listener') === previousBlind.replacement) replaceOwnData(entry, 'listener', previousBlind.replacement, previousBlind.original);
        }
        const matches: SiteObject[] = [];
        for (let index = 0; index < entryCount; index++) {
          const entry = ownData(entries, String(index))?.value;
          if (siteObject(entry) && data(entry, 'listener') === original) matches.push(entry);
        }
        const entry = matches.length === 1 ? matches[0] : null;
        if (!entry || data(entry, 'once') !== false || ownData(entry, 'listener')?.descriptor.writable !== true) return null;
        let owned: OwnedBinding;
        const replacement = function (this: unknown, event: unknown, ...args: unknown[]) {
          const current = currentList(), list = current?.value || null, listLength = current?.length || 0, eventSnapshot = snapshotEvent(event);
          let before: ChatMessageSnapshot | null = null;
          if (list && eventSnapshot) for (let index = 0; index < listLength; index++) {
            const candidate = snapshotAt(list, index);
            if (candidate && candidate.time === eventSnapshot.messageTime && candidate.user === eventSnapshot.userId) { before = candidate; break; }
          }
          const result = Reflect.apply(original, this, [event, ...args]);
          if (!owned.active) return result;
          if (thenable(result)) {
            try { handler({ event: eventSnapshot, before, after: null, replaceAfterStatus: () => null }); } catch {}
            return result;
          }
          if (!list || data(controller, 'messageList') !== list) {
            try { handler({ event: eventSnapshot, before, after: null, replaceAfterStatus: () => null }); } catch {}
            return result;
          }
          let after: ChatMessageSnapshot | null = null;
          if (eventSnapshot) for (let index = 0; index < listLength; index++) {
            const candidate = snapshotAt(list, index);
            if (candidate && candidate.time === eventSnapshot.messageTime && candidate.user === eventSnapshot.userId) { after = candidate; break; }
          }
          try { handler({ event: eventSnapshot, before, after, replaceAfterStatus: (expected, nextStatus) => expected === after ? replaceStatus(expected, nextStatus) : null }); } catch {}
          return result;
        };
        if (!replaceOwnData(entry, 'listener', original, replacement) || !replaceOwnData(controller, 'notiBlindListener', original, replacement)) {
          replaceOwnData(entry, 'listener', replacement, original); return null;
        }
        const ownsEntry = () => {
          const current = boundedArray(data(data(client, '_events'), 'notiBlind'), MAX_EVENTS);
          if (!current || current.value !== entries) return false;
          for (let index = 0; index < current.length; index++) if (ownData(entries, String(index))?.value === entry) return true;
          return false;
        };
        previousBlind = { original, replacement };
        owned = binding(() => data(controller, 'chatClient') === client && ownsEntry() && data(entry, 'listener') === replacement && data(controller, 'notiBlindListener') === replacement,
          () => {
            replaceOwnData(entry, 'listener', replacement, original);
            replaceOwnData(controller, 'notiBlindListener', replacement, original);
            const current = boundedArray(data(data(data(controller, 'chatClient'), '_events'), 'notiBlind'), MAX_EVENTS);
            if (current) for (let index = 0; index < current.length; index++) {
              const candidate = ownData(current.value, String(index))?.value;
              if (data(candidate, 'listener') === replacement) replaceOwnData(candidate, 'listener', replacement, original);
            }
          });
        blindBinding = owned; return owned;
      },
      replaceStatus,
      dispose() { if (!active) return; active = false; filterBinding?.dispose(); blindBinding?.dispose(); },
    };
    return port;
  };
  return {
    discover: (document, route) => discoverSite(document, route, reader),
    affectsDiscovery: affectsSiteDiscovery,
    chat: {
      readMessage: row => snapshotMessage(messageFromRow(row)),
      connect(container) {
        const controller = reader.stateOf(container, value => typeof data(value, 'messageFilter') === 'function');
        if (!siteObject(controller)) return null;
        const existing = ports.get(controller);
        if (existing?.active) return existing;
        const port = createPort(controller); ports.set(controller, port); return port;
      },
    },
    banner: { closeHandler(node) {
      const fiber = reader.fiberOf(node), props = data(data(fiber, 'return'), 'memoizedProps'), close = data(props, 'closeHandler');
      return typeof close === 'function' && siteObject(props) ? () => Reflect.apply(close, props, []) : null;
    } },
    video: { openDate(node) {
      const value = reader.stateOf(node, candidate => {
        const openDate = text(data(Array.isArray(candidate) ? data(candidate, '0') : null, 'openDate'));
        return openDate !== INVALID && openDate !== null;
      });
      const openDate = text(data(Array.isArray(value) ? data(value, '0') : null, 'openDate'));
      return openDate === INVALID ? null : openDate;
    } },
    player: { async readMetrics(layout): Promise<SitePlayerMetrics | null> {
      const state = reader.stateOf(layout, value => siteObject(data(value, '_corePlayer')));
      const core = data(state, '_corePlayer'), codecs = data(core, '_currentCodecs');
      if (!siteObject(core) || !siteObject(codecs)) return null;
      const video = text(data(codecs, 'video')), audio = text(data(codecs, 'audio'));
      if (video === INVALID || audio === INVALID) return null;
      const codec = [video, audio].filter((value): value is string => typeof value === 'string' && value.length > 0).join(', ');
      return { codec: codec || null };
    } },
  };
}
