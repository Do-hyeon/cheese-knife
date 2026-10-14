// Generated from src/settings/gain-authority.ts by scripts/settings-runtime.mjs. Do not edit.
var createPlayerGainAuthority = (now = Date.now) => {
  const workerEpoch = crypto.randomUUID(), actors = /* @__PURE__ */ new Map();
  const scopes = /* @__PURE__ */ new Map(), receipts = /* @__PURE__ */ new Set(), seenReceipts = [];
  let observed = null;
  const failure = (code) => ({ ok: false, code });
  const coded = (code) => Object.assign(new Error(code), { code });
  const own = (value, key) => value && typeof value === "object" ? Object.getOwnPropertyDescriptor(value, key)?.value : void 0;
  const actorKey = (native) => `${native.tabId}:${native.windowId}:${native.documentId}`;
  function state(raw, native) {
    const read = KnifeMediaProfiles.readStore(raw.mediaProfiles);
    if (read.state !== "valid" && read.state !== "absent") return failure(read.code);
    if (read.store.schema !== 2) return failure("media-upgrade-required");
    if (!KnifeMediaProfiles.isCounter(raw.settingsRevision ?? 0)) return failure("revision-invalid");
    let channelId = null;
    try {
      const url = new URL(native.route);
      channelId = /^\/(?:live\/)?([a-f0-9]{32})\/?$/i.exec(url.pathname)?.[1]?.toLowerCase() ?? null;
    } catch {
      return failure("gain-context-changed");
    }
    const global = KnifeMediaProfiles.projectGlobalAudio(raw.config ?? {});
    const channel = read.store.channels.find((row) => row.channelId === channelId);
    const binding = channel?.audio, values = binding?.values ?? global;
    const inherited = values.gainInherited;
    const origin = binding && !inherited ? "channel-owned" : global.gainInherited ? "site-legacy" : "global-owned";
    const token = binding && channel ? { channelId: channel.channelId, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: binding.createdRevision } : null;
    const signature = JSON.stringify([
      2,
      token,
      values.audioGain,
      inherited,
      !binding || inherited ? [global.audioGain, global.gainInherited] : null
    ]);
    return {
      key: token ? `channel:${token.channelId}` : "global",
      signature,
      channelId: token?.channelId ?? null,
      origin,
      value: origin === "site-legacy" ? native.legacyValue : origin === "channel-owned" ? values.audioGain : global.audioGain,
      inherited,
      storedValue: values.audioGain,
      token,
      schema: 2,
      version: { globalRevision: raw.settingsRevision ?? 0, mediaRevision: read.store.revision }
    };
  }
  const nativeEqual = (a, b) => a.tabId === b.tabId && a.windowId === b.windowId && a.documentId === b.documentId && a.route === b.route && a.bindingId === b.bindingId;
  function expire() {
    for (const [key, actor] of actors) if (!actor.busy && now() - actor.lastAccess > 6e4) actors.delete(key);
    for (const key of scopes.keys()) if (![...actors.values()].some((actor) => actor.scope === key)) scopes.delete(key);
  }
  function view(native, raw) {
    expire();
    const current = state(raw, native);
    if ("ok" in current) return current;
    const key = actorKey(native), previous = actors.get(key);
    if (previous?.busy) return failure("gain-busy");
    if (!previous && actors.size >= 64 || !scopes.has(current.key) && scopes.size >= 64) return failure("gain-busy");
    if (!scopes.has(current.key)) scopes.set(current.key, 0);
    const epoch = scopes.get(current.key);
    const actor = {
      native: { ...native },
      scope: current.key,
      signature: current.signature,
      epoch,
      lastAccess: now(),
      ticket: crypto.randomUUID(),
      busy: false,
      failed: false,
      lastCommit: previous?.lastCommit ?? -Infinity,
      intent: previous?.intent ?? null
    };
    actors.set(key, actor);
    observed = structuredClone(raw);
    return {
      ok: true,
      ticket: actor.ticket,
      workerEpoch,
      gainEpoch: epoch,
      cold: !previous || previous.failed || !nativeEqual(previous.native, native),
      scope: current.token ? "channel" : "global",
      channelId: current.channelId,
      token: current.token,
      origin: current.origin,
      value: current.value,
      storedValue: current.storedValue,
      inherited: current.inherited,
      version: current.version
    };
  }
  function check(ticket, native, raw) {
    expire();
    const actor = actors.get(actorKey(native)), current = state(raw, native);
    if (!actor || actor.ticket !== ticket || !nativeEqual(actor.native, native)) return failure("gain-context-changed");
    if ("ok" in current) return current;
    if (actor.failed || actor.scope !== current.key || actor.signature !== current.signature || actor.epoch !== scopes.get(current.key) || current.origin === "site-legacy" && actor.native.legacyValue !== native.legacyValue) return failure("gain-conflict");
    actor.lastAccess = now();
    return { ok: true, actor, state: current };
  }
  function begin(ticket, native, raw, intent, value) {
    const checked = check(ticket, native, raw);
    if (!checked.ok) return checked;
    const actor = checked.actor;
    if (actor.busy || now() - actor.lastCommit < 250) return failure("gain-busy");
    if (actor.intent === intent || !Number.isFinite(value) || value < 0 || value > 2) return failure("gain-conflict");
    actor.busy = true;
    actor.intent = intent;
    actor.lastCommit = now();
    return checked;
  }
  function finish(ticket, success) {
    const actor = [...actors.values()].find((row) => row.ticket === ticket);
    if (actor) {
      actor.busy = false;
      actor.failed = !success;
      actor.lastAccess = now();
    }
  }
  function invalidate(before, after, force = false) {
    const changed = /* @__PURE__ */ new Set();
    for (const actor of actors.values()) {
      const a = state(before, actor.native), b = state(after, actor.native);
      if (force || "ok" in a || "ok" in b || a.signature !== b.signature) changed.add(actor.scope);
    }
    for (const key of changed) scopes.set(key, (scopes.get(key) ?? 0) + 1);
  }
  function receipt(changes) {
    return JSON.stringify(["config", "settingsRevision", "mediaProfiles"].filter((key) => Object.hasOwn(changes, key)).map((key) => [key, own(own(changes, key), "oldValue"), own(own(changes, key), "newValue")]));
  }
  function beforeWrite(raw, changes) {
    const selected = Object.fromEntries(["config", "settingsRevision", "mediaProfiles"].filter((key) => Object.hasOwn(changes, key)).map((key) => [key, { oldValue: own(raw, key), newValue: own(changes, key) }]));
    if (!Object.keys(selected).length) return;
    if (receipts.size >= 64) throw coded("gain-busy");
    const after = { ...raw, ...changes };
    receipts.add(receipt(selected));
    invalidate(raw, after);
    observed = structuredClone(after);
  }
  function writeFailed(raw, changes) {
    const selected = Object.fromEntries(["config", "settingsRevision", "mediaProfiles"].filter((key) => Object.hasOwn(changes, key)).map((key) => [key, { oldValue: own(raw, key), newValue: own(changes, key) }]));
    receipts.delete(receipt(selected));
    observed = null;
  }
  function observe(changes) {
    const selected = Object.fromEntries(Object.entries(changes).filter(([key]) => ["config", "settingsRevision", "mediaProfiles"].includes(key)));
    if (!Object.keys(selected).length) return;
    const id = receipt(selected);
    if (receipts.delete(id)) {
      seenReceipts.push(id);
      if (seenReceipts.length > 64) seenReceipts.shift();
      return;
    }
    if (seenReceipts.includes(id)) return;
    const previous = observed ?? {};
    const next = { ...previous };
    for (const [key, delta] of Object.entries(selected)) {
      if (delta && typeof delta === "object" && Object.hasOwn(delta, "newValue")) Object.defineProperty(
        next,
        key,
        { value: own(delta, "newValue"), enumerable: true, writable: true, configurable: true }
      );
      else Reflect.deleteProperty(next, key);
    }
    const oldRevision = own(own(selected, "settingsRevision"), "oldValue"), newRevision = own(own(selected, "settingsRevision"), "newValue");
    const uncertain = observed === null || Object.hasOwn(selected, "settingsRevision") && (!KnifeMediaProfiles.isCounter(newRevision) || !KnifeMediaProfiles.isCounter(oldRevision ?? 0) || newRevision <= (oldRevision ?? 0));
    invalidate(previous, next, uncertain);
    observed = structuredClone(next);
  }
  function retireTab(tabId) {
    for (const [key, actor] of actors) if (actor.native.tabId === tabId) actors.delete(key);
    expire();
  }
  function retireAll() {
    actors.clear();
    scopes.clear();
    observed = null;
  }
  return { view, check, begin, finish, beforeWrite, writeFailed, observe, retireTab, retireAll };
};
