type KnifeGainNative = { tabId: number; windowId: number; documentId: string; route: string;
  bindingId: string; legacyValue: number | null };
type KnifeGainState = { key: string; signature: string; channelId: string | null; origin: KnifeGainOrigin;
  value: number | null; inherited: boolean; storedValue: number; token: KnifeChannelToken | null;
  version: { globalRevision: number; mediaRevision: number }; schema: 2 };
type KnifeGainView = { ok: true; ticket: string; workerEpoch: string; gainEpoch: number; cold: boolean;
  scope: 'global' | 'channel'; channelId: string | null; origin: KnifeGainOrigin; value: number | null;
  storedValue: number; inherited: boolean; token: KnifeChannelToken | null; version: KnifeGainState['version'] };
type KnifeGainFailure = { ok: false; code: string };
type KnifeGainActor = { native: KnifeGainNative; scope: string; signature: string; epoch: number; lastAccess: number;
  ticket: string; busy: boolean; failed: boolean; lastCommit: number; intent: string | null };

var createPlayerGainAuthority = (now: () => number = Date.now) => {
  const workerEpoch = crypto.randomUUID(), actors = new Map<string, KnifeGainActor>();
  const scopes = new Map<string, number>(), receipts = new Set<string>(), seenReceipts: string[] = [];
  let observed: KnifeUnknownRecord | null = null;
  const failure = (code: string): KnifeGainFailure => ({ ok: false, code });
  const coded = (code: string) => Object.assign(new Error(code), { code });
  const own = (value: unknown, key: string) => value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key)?.value as unknown : undefined;
  const actorKey = (native: KnifeGainNative) => `${native.tabId}:${native.windowId}:${native.documentId}`;
  function state(raw: KnifeUnknownRecord, native: KnifeGainNative): KnifeGainState | KnifeGainFailure {
    const read = KnifeMediaProfiles.readStore(raw.mediaProfiles);
    if (read.state !== 'valid' && read.state !== 'absent') return failure(read.code);
    if (read.store.schema !== 2) return failure('media-upgrade-required');
    if (!KnifeMediaProfiles.isCounter(raw.settingsRevision ?? 0)) return failure('revision-invalid');
    let channelId: string | null = null;
    try {
      const url = new URL(native.route);
      channelId = /^\/live\/([a-f0-9]{32})\/?$/i.exec(url.pathname)?.[1]?.toLowerCase() ?? null;
    } catch { return failure('gain-context-changed'); }
    const global = KnifeMediaProfiles.projectGlobalAudio((raw.config ?? {}) as Record<string, KnifeScalar>);
    const channel = read.store.channels.find(row => row.channelId === channelId);
    const binding = channel?.audio, values = binding?.values ?? global;
    const inherited = values.gainInherited;
    const origin: KnifeGainOrigin = binding && !inherited ? 'channel-owned' : global.gainInherited ? 'site-legacy' : 'global-owned';
    const token = binding && channel ? { channelId: channel.channelId, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: binding.createdRevision } : null;
    const signature = JSON.stringify([2, token, values.audioGain, inherited,
      !binding || inherited ? [global.audioGain, global.gainInherited] : null]);
    return { key: token ? `channel:${token.channelId}` : 'global', signature, channelId: token?.channelId ?? null,
      origin, value: origin === 'site-legacy' ? native.legacyValue : origin === 'channel-owned' ? values.audioGain : global.audioGain,
      inherited, storedValue: values.audioGain, token, schema: 2,
      version: { globalRevision: raw.settingsRevision as number ?? 0, mediaRevision: read.store.revision } };
  }
  const nativeEqual = (a: KnifeGainNative, b: KnifeGainNative) => a.tabId === b.tabId && a.windowId === b.windowId &&
    a.documentId === b.documentId && a.route === b.route && a.bindingId === b.bindingId;
  function expire() {
    for (const [key, actor] of actors) if (!actor.busy && now() - actor.lastAccess > 60000) actors.delete(key);
    for (const key of scopes.keys()) if (![...actors.values()].some(actor => actor.scope === key)) scopes.delete(key);
  }
  function view(native: KnifeGainNative, raw: KnifeUnknownRecord): KnifeGainView | KnifeGainFailure {
    expire();
    const current = state(raw, native);
    if ('ok' in current) return current;
    const key = actorKey(native), previous = actors.get(key);
    if (previous?.busy) return failure('gain-busy');
    if (!previous && actors.size >= 64 || !scopes.has(current.key) && scopes.size >= 64) return failure('gain-busy');
    if (!scopes.has(current.key)) scopes.set(current.key, 0);
    const epoch = scopes.get(current.key)!;
    const actor: KnifeGainActor = { native: { ...native }, scope: current.key, signature: current.signature, epoch,
      lastAccess: now(), ticket: crypto.randomUUID(), busy: false, failed: false,
      lastCommit: previous?.lastCommit ?? -Infinity, intent: previous?.intent ?? null };
    actors.set(key, actor); observed = structuredClone(raw);
    return { ok: true, ticket: actor.ticket, workerEpoch, gainEpoch: epoch, cold: !previous || previous.failed || !nativeEqual(previous.native, native), scope: current.token ? 'channel' : 'global',
      channelId: current.channelId, token: current.token, origin: current.origin, value: current.value,
      storedValue: current.storedValue, inherited: current.inherited, version: current.version };
  }
  function check(ticket: string, native: KnifeGainNative, raw: KnifeUnknownRecord): { ok: true; actor: KnifeGainActor; state: KnifeGainState } | KnifeGainFailure {
    expire();
    const actor = actors.get(actorKey(native)), current = state(raw, native);
    if (!actor || actor.ticket !== ticket || !nativeEqual(actor.native, native)) return failure('gain-context-changed');
    if ('ok' in current) return current;
    if (actor.failed || actor.scope !== current.key || actor.signature !== current.signature || actor.epoch !== scopes.get(current.key) ||
        current.origin === 'site-legacy' && actor.native.legacyValue !== native.legacyValue) return failure('gain-conflict');
    actor.lastAccess = now(); return { ok: true, actor, state: current };
  }
  function begin(ticket: string, native: KnifeGainNative, raw: KnifeUnknownRecord, intent: string, value: number) {
    const checked = check(ticket, native, raw);
    if (!checked.ok) return checked;
    const actor = checked.actor;
    if (actor.busy || now() - actor.lastCommit < 250) return failure('gain-busy');
    if (actor.intent === intent || !Number.isFinite(value) || value < 0 || value > 2) return failure('gain-conflict');
    actor.busy = true; actor.intent = intent; actor.lastCommit = now(); return checked;
  }
  function finish(ticket: string, success: boolean) {
    const actor = [...actors.values()].find(row => row.ticket === ticket);
    if (actor) { actor.busy = false; actor.failed = !success; actor.lastAccess = now(); }
  }
  function invalidate(before: KnifeUnknownRecord, after: KnifeUnknownRecord, force = false) {
    const changed = new Set<string>();
    for (const actor of actors.values()) {
      const a = state(before, actor.native), b = state(after, actor.native);
      if (force || 'ok' in a || 'ok' in b || a.signature !== b.signature) changed.add(actor.scope);
    }
    for (const key of changed) scopes.set(key, (scopes.get(key) ?? 0) + 1);
  }
  function receipt(changes: KnifeUnknownRecord) {
    // Native storage can reorder object keys; preserve array order and distinguish absence from stored null.
    return JSON.stringify(['config', 'settingsRevision', 'mediaProfiles'].filter(key => Object.hasOwn(changes, key))
      .map(key => [key, ...['oldValue','newValue'].map(field => {
        const value = own(own(changes,key),field);return value === undefined ? [false] : [true,value];
      })]), (_key: string, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key,own(value,key)])) : value);
  }
  function beforeWrite(raw: KnifeUnknownRecord, changes: KnifeUnknownRecord) {
    const selected = Object.fromEntries(['config', 'settingsRevision', 'mediaProfiles'].filter(key => Object.hasOwn(changes, key))
      .map(key => [key, { oldValue: own(raw, key), newValue: own(changes, key) }]));
    if (!Object.keys(selected).length) return;
    if (receipts.size >= 64) throw coded('gain-busy');
    const after = { ...raw, ...changes };
    receipts.add(receipt(selected)); invalidate(raw, after); observed = structuredClone(after);
  }
  function writeFailed(raw: KnifeUnknownRecord, changes: KnifeUnknownRecord) {
    const selected = Object.fromEntries(['config', 'settingsRevision', 'mediaProfiles'].filter(key => Object.hasOwn(changes, key))
      .map(key => [key, { oldValue: own(raw, key), newValue: own(changes, key) }]));
    receipts.delete(receipt(selected));
    // The write may have committed before ACK loss. Authority is never restored from this result.
    observed = null;
  }
  function observe(changes: KnifeUnknownRecord) {
    const selected = Object.fromEntries(Object.entries(changes).filter(([key]) => ['config', 'settingsRevision', 'mediaProfiles'].includes(key)));
    if (!Object.keys(selected).length) return;
    const id = receipt(selected);
    if (receipts.delete(id)) {
      seenReceipts.push(id); if (seenReceipts.length > 64) seenReceipts.shift(); return;
    }
    if (seenReceipts.includes(id)) return;
    const previous = observed ?? {};
    const next = { ...previous };
    for (const [key, delta] of Object.entries(selected)) {
      if (delta && typeof delta === 'object' && Object.hasOwn(delta, 'newValue')) Object.defineProperty(next, key,
        { value: own(delta, 'newValue'), enumerable: true, writable: true, configurable: true });
      else Reflect.deleteProperty(next, key);
    }
    const oldRevision = own(own(selected, 'settingsRevision'), 'oldValue'), newRevision = own(own(selected, 'settingsRevision'), 'newValue');
    const uncertain = observed === null || Object.hasOwn(selected, 'settingsRevision') &&
      (!KnifeMediaProfiles.isCounter(newRevision) || !KnifeMediaProfiles.isCounter(oldRevision ?? 0) || newRevision <= (oldRevision as number ?? 0));
    invalidate(previous, next, uncertain); observed = structuredClone(next);
  }
  function retireTab(tabId: number) { for (const [key, actor] of actors) if (actor.native.tabId === tabId) actors.delete(key); expire(); }
  function retireAll() { actors.clear(); scopes.clear(); observed = null; }
  return { view, check, begin, finish, beforeWrite, writeFailed, observe, retireTab, retireAll };
};
