// Generated from src/settings/client.ts by scripts/settings-runtime.mjs. Do not edit.
var createSettingsClient = (chromeApi) => {
  const dirty = /* @__PURE__ */ new Map(), confirmed = /* @__PURE__ */ new Map(), subscribers = /* @__PURE__ */ new Set();
  let snapshot = null, css = { state: "pending", code: null }, phase = "loading", code = null;
  let disposed = false, generation = 0, epoch = 0, snapshotSequence = 0;
  const transport = createSettingsRequestTransport(chromeApi);
  let mutation = null, reading = null, readWanted = false, failurePhase = null, acceptedReads = 0;
  const key = (op) => `${op.type}:${op.id}`;
  const fault = (value) => Object.assign(new Error(value), { code: value });
  const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  const isCssState = (value) => isRecord(value) && ["pending", "ready", "failed"].includes(value.state) && (value.code === null || typeof value.code === "string");
  const isValueRecord = (value, accept) => isRecord(value) && Object.values(value).every(accept);
  const isSnapshot = (value) => isRecord(value) && Number.isSafeInteger(value.revision) && value.revision >= 0 && isValueRecord(value.config, (entry) => typeof entry === "boolean" || typeof entry === "number" && Number.isFinite(entry)) && Array.isArray(value.styles) && value.styles.every((entry) => typeof entry === "string") && isValueRecord(value.styleParameters, (entry) => typeof entry === "number" && Number.isFinite(entry)) && isCssState(value.css);
  const validateReply = (action, value, requestId) => {
    if (!isRecord(value) || value.requestId !== requestId || typeof value.ok !== "boolean") return null;
    if (value.code !== void 0 && value.code !== null && typeof value.code !== "string") return null;
    if (value.stage !== void 0 && value.stage !== null && typeof value.stage !== "string") return null;
    if (value.stored !== void 0 && typeof value.stored !== "boolean") return null;
    if (value.reloaded !== void 0 && typeof value.reloaded !== "boolean") return null;
    if (value.revision !== void 0 && (!Number.isSafeInteger(value.revision) || value.revision < 0)) return null;
    if (value.snapshot !== void 0 && !isSnapshot(value.snapshot)) return null;
    if (value.css !== void 0 && !isCssState(value.css)) return null;
    if (value.appliedStyles !== void 0 && (!Array.isArray(value.appliedStyles) || !value.appliedStyles.every((entry) => typeof entry === "string"))) return null;
    if (!value.ok && typeof value.code !== "string") return null;
    if (action === "get-snapshot" && value.ok && !isSnapshot(value.snapshot)) return null;
    if (action === "patch" && (value.ok || value.stored === true) && (value.stored !== true || !Number.isSafeInteger(value.revision) || !isCssState(value.css))) return null;
    if (action === "reload-target" && value.ok && (value.reloaded !== true || !Number.isSafeInteger(value.revision) || !isCssState(value.css) || !Array.isArray(value.appliedStyles) || !value.appliedStyles.every((entry) => typeof entry === "string"))) return null;
    return value;
  };
  function view() {
    const base = snapshot || KnifeSettingsContract.makeSnapshot({}, css);
    const raw = { config: base.config, styles: base.styles, styleParameters: base.styleParameters, settingsRevision: base.revision };
    const operations = [...confirmed.values(), ...dirty.values()].map((entry) => entry.op);
    const merged = { ...raw, ...KnifeSettingsContract.mergeOperations(raw, operations).changes };
    return {
      snapshot,
      values: { config: merged.config, styles: merged.styles, styleParameters: merged.styleParameters },
      phase,
      css: { ...css },
      pendingKeys: [...dirty.keys()],
      code
    };
  }
  function emit() {
    if (disposed) return;
    const value = view();
    for (const subscriber of subscribers) subscriber(value);
  }
  function updatePhase() {
    if (failurePhase === "repair-required") phase = "repair-required";
    else if (mutation || [...dirty.values()].some((entry) => entry.status === "pending")) phase = "saving";
    else if ([...dirty.values()].some((entry) => entry.status === "unknown")) phase = "unknown";
    else if ([...dirty.values()].some((entry) => entry.status === "held")) phase = "failed";
    else phase = failurePhase || (snapshot ? "ready" : "loading");
  }
  function send(action, payload = {}) {
    return transport.send(1, action, payload, validateReply);
  }
  function refresh() {
    if (disposed) return Promise.resolve();
    readWanted = true;
    if (reading) return reading;
    reading = (async () => {
      while (readWanted && !disposed) {
        readWanted = false;
        const started = epoch;
        try {
          const { reply, requestSequence } = await send("get-snapshot").promise;
          if (disposed) return;
          if (started !== epoch) {
            readWanted = true;
            continue;
          }
          if (!reply.ok) throw fault(reply.code || "read-failed");
          const next = reply.snapshot;
          KnifeSettingsContract.readRevision(next?.revision);
          if (!next || !next.config || !Array.isArray(next.styles) || !next.styleParameters || !next.css) throw fault("read-failed");
          if (snapshot && next.revision < snapshot.revision) continue;
          snapshot = next;
          snapshotSequence = requestSequence;
          css = { ...next.css };
          acceptedReads++;
          for (const [id, entry] of confirmed) if (entry.revision <= next.revision) confirmed.delete(id);
          updatePhase();
          emit();
          flush();
        } catch (error) {
          if (disposed) return;
          code = error.code || "read-failed";
          failurePhase = code === "revision-invalid" || code === "revision-exhausted" ? "repair-required" : code === "response-unknown" ? "unknown" : "failed";
          updatePhase();
          emit();
        }
      }
    })().finally(() => {
      reading = null;
    });
    return reading;
  }
  function acceptAck(reply, entries, requestSequence) {
    if (!reply.stored) return false;
    if (typeof reply.revision !== "number" || !Number.isSafeInteger(reply.revision) || reply.revision < 0) throw fault("response-unknown");
    for (const [id, entry] of entries) {
      if (dirty.get(id)?.generation !== entry.generation) continue;
      dirty.delete(id);
      if (!snapshot || snapshot.revision < reply.revision) confirmed.set(id, { op: entry.op, revision: reply.revision });
    }
    if ((!snapshot || snapshot.revision < reply.revision || snapshot.revision === reply.revision && snapshotSequence < requestSequence) && reply.css) css = { ...reply.css };
    return true;
  }
  async function mutate(action, payload, entries = []) {
    const transport2 = send(action, payload);
    mutation = transport2;
    updatePhase();
    emit();
    try {
      const { reply, requestSequence } = await transport2.promise;
      if (disposed) throw fault("disposed");
      const stored = action === "patch" && acceptAck(reply, entries, requestSequence);
      if (!reply.ok && !stored) {
        for (const entry of dirty.values()) entry.status = "held";
        code = reply.code || "write-failed";
        failurePhase = "failed";
      } else {
        code = reply.revision === Number.MAX_SAFE_INTEGER ? "revision-exhausted" : reply.ok ? null : reply.code;
        failurePhase = reply.revision === Number.MAX_SAFE_INTEGER ? "repair-required" : null;
      }
      epoch++;
      void refresh();
      return reply;
    } catch (error) {
      if (!disposed) {
        for (const entry of dirty.values()) entry.status = "unknown";
        code = error.code || "response-unknown";
        failurePhase = "unknown";
        epoch++;
        void refresh();
      }
      throw error;
    } finally {
      if (!disposed) {
        mutation = null;
        updatePhase();
        emit();
        flush();
      }
    }
  }
  function flush() {
    if (disposed || mutation || !snapshot) return;
    const entries = [...dirty].filter(([, entry]) => entry.status === "pending").slice(0, 64);
    if (!entries.length) return;
    for (const [, entry] of entries) entry.status = "sent";
    void mutate("patch", { operations: entries.map(([, entry]) => entry.op) }, entries).catch(() => {
    });
  }
  function edit(operation) {
    if (disposed || phase === "repair-required") return;
    const validation = KnifeSettingsContract.validateOperations([operation]);
    if (!validation.ok) {
      code = validation.code;
      phase = "failed";
      emit();
      return;
    }
    const op = validation.operations[0];
    dirty.set(key(op), { op, generation: ++generation, status: "pending" });
    epoch++;
    code = null;
    failurePhase = null;
    updatePhase();
    emit();
    flush();
  }
  function available() {
    if (disposed || !snapshot || mutation || dirty.size || phase === "unknown" || phase === "repair-required") throw fault("settings-not-ready");
  }
  async function retryStyles() {
    available();
    return mutate("patch", { operations: [] });
  }
  async function reloadTarget({ tabId, windowId }) {
    available();
    if (phase !== "ready" || css.state !== "ready" || ![tabId, windowId].every((id) => Number.isSafeInteger(id) && id >= 0)) throw fault("settings-not-ready");
    return mutate("reload-target", { targetTabId: tabId, targetWindowId: windowId });
  }
  async function discardPending() {
    if (disposed) return;
    const before = acceptedReads;
    dirty.clear();
    confirmed.clear();
    epoch++;
    updatePhase();
    emit();
    await refresh();
    if (!disposed && acceptedReads > before) {
      failurePhase = null;
      code = null;
      updatePhase();
      emit();
    }
  }
  const onChanged = (changes, area) => {
    if (area !== "local" || !["config", "styles", "styleParameters", "settingsRevision"].some((id) => Object.hasOwn(changes, id))) return;
    epoch++;
    void refresh();
  };
  chromeApi.storage.onChanged.addListener(onChanged);
  void refresh();
  return {
    subscribe(fn) {
      if (disposed) return () => {
      };
      subscribers.add(fn);
      fn(view());
      return () => subscribers.delete(fn);
    },
    edit,
    refresh,
    retryStyles,
    reloadTarget,
    discardPending,
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        chromeApi.storage.onChanged.removeListener(onChanged);
      } finally {
        subscribers.clear();
        transport.dispose();
      }
    }
  };
};
var createSettingsRequestTransport = (chromeApi) => {
  const pending = /* @__PURE__ */ new Set();
  let sequence = 0, disposed = false;
  function send(protocol, action, payload = {}, validate) {
    const requestId = `settings-${++sequence}`, requestSequence = sequence;
    const request = protocol === 1 ? { namespace: "cheese-knife-settings", protocol, action, requestId, ...payload } : { namespace: "cheese-knife-settings", protocol, requestId, ...action };
    let cancel = () => {
    };
    const promise = new Promise((resolve, reject) => {
      let ended = false;
      const finish = (code, reply) => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        pending.delete(cancel);
        if (code) reject(Object.assign(new Error(code), { code }));
        else if (reply) resolve({ reply, requestSequence });
      };
      cancel = () => finish("disposed");
      const timer = setTimeout(() => finish("response-unknown"), 1e4);
      pending.add(cancel);
      if (disposed) {
        cancel();
        return;
      }
      try {
        chromeApi.runtime.sendMessage(request, (value) => {
          if (chromeApi.runtime.lastError) {
            finish("response-unknown");
            return;
          }
          const reply = protocol === 1 ? validate?.(action, value, requestId) : validateMediaReply(action, value, requestId);
          if (!reply) finish("response-unknown");
          else finish(null, reply);
        });
      } catch {
        finish("response-unknown");
      }
    });
    return { promise, requestSequence, cancel };
  }
  return { send, dispose() {
    disposed = true;
    for (const cancel of [...pending]) cancel();
  } };
};
function validateMediaReply(request, value, requestId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const reply = value;
  if (reply.protocol !== 2 || reply.requestId !== requestId || typeof reply.ok !== "boolean" || typeof reply.stored !== "boolean" || reply.code !== void 0 && reply.code !== null && typeof reply.code !== "string" || reply.stage !== void 0 && reply.stage !== null && typeof reply.stage !== "string") return null;
  if (!reply.ok) return typeof reply.code === "string" && reply.stored === false ? reply : null;
  if (reply.stored !== (request.action !== "get-media-snapshot")) return null;
  const snapshot = reply.snapshot;
  if (!snapshot || typeof snapshot !== "object" || !snapshot.version || !snapshot.values || !snapshot.selection || typeof snapshot.canWrite !== "boolean" || !(snapshot.code === null || typeof snapshot.code === "string") || !["global", "scoped", "repair-required"].includes(snapshot.profileState)) return null;
  const selection = "selection" in request ? request.selection : { kind: "global" };
  if (JSON.stringify(snapshot.selection) !== JSON.stringify(selection)) return null;
  if (!KnifeMediaProfiles.isCounter(snapshot.version.globalRevision) || snapshot.version.mediaRevision !== null && !KnifeMediaProfiles.isCounter(snapshot.version.mediaRevision) || !KnifeMediaProfiles.validateValues("audio", snapshot.values.audio).ok || !KnifeMediaProfiles.validateValues("video", snapshot.values.video).ok) return null;
  if (snapshot.store === null) {
    if (snapshot.profileState !== "repair-required" || snapshot.version.mediaRevision !== null || snapshot.canWrite) return null;
  } else {
    const read = KnifeMediaProfiles.readStore(snapshot.store);
    if (read.state !== "valid" || read.store.revision !== snapshot.version.mediaRevision) return null;
    if (snapshot.channel !== null && !read.store.channels.some((channel) => JSON.stringify(channel) === JSON.stringify(snapshot.channel))) return null;
  }
  if (JSON.stringify(reply.version) !== JSON.stringify(snapshot.version) || reply.profileState !== snapshot.profileState) return null;
  return reply;
}
var createMediaSettingsClient = (chromeApi) => {
  const transport = createSettingsRequestTransport(chromeApi), subscribers = /* @__PURE__ */ new Set();
  const dirty = /* @__PURE__ */ new Map();
  let selection = { kind: "global" }, snapshot = null;
  let phase = "loading", code = null, disposed = false, busy = false;
  let generation = 0, scopeEpoch = 0, epoch = 0, acceptedSequence = 0, reading = null, wanted = false;
  let pendingRequest = null;
  let pendingValues = null;
  const pendingGenerations = /* @__PURE__ */ new Map();
  const fault = (code2) => Object.assign(new Error(code2), { code: code2 });
  const defaults = (domain) => Object.fromEntries((domain === "audio" ? KnifeMediaProfiles.audioFields : KnifeMediaProfiles.videoFields).map((field) => [field.id, field.defaultValue]));
  function view() {
    const values = {
      audio: { ...snapshot?.values.audio ?? defaults("audio") },
      video: { ...snapshot?.values.video ?? defaults("video") }
    };
    for (const entry of dirty.values()) Object.assign(values[entry.domain], { [entry.id]: entry.value });
    return { selection, snapshot, values, phase, pendingKeys: [...dirty.keys()], pendingRequest, pendingValues, code };
  }
  function emit() {
    if (!disposed) for (const fn of subscribers) fn(view());
  }
  function accept(next, requestSequence) {
    if (requestSequence < acceptedSequence) return;
    if (snapshot && (next.version.globalRevision < snapshot.version.globalRevision || next.version.mediaRevision !== null && snapshot.version.mediaRevision !== null && next.version.mediaRevision < snapshot.version.mediaRevision)) return;
    snapshot = next;
    acceptedSequence = requestSequence;
  }
  function settledPhase() {
    if (busy) phase = "saving";
    else if (!["unknown", "conflict", "failed", "unavailable"].includes(phase)) phase = [...dirty.values()].some((entry) => entry.status === "pending" || entry.status === "sent") ? "saving" : snapshot?.profileState === "repair-required" ? "repair-required" : snapshot ? "ready" : "loading";
  }
  function refresh() {
    if (disposed) return Promise.resolve();
    wanted = true;
    if (reading) return reading;
    reading = (async () => {
      while (wanted && !disposed) {
        wanted = false;
        const started = epoch, scope = scopeEpoch, confirming = phase === "unknown" ? pendingRequest : null;
        try {
          const result = await transport.send(2, { action: "get-media-snapshot", selection }).promise;
          if (disposed || scope !== scopeEpoch) continue;
          if (started !== epoch) {
            wanted = true;
            continue;
          }
          if (!result.reply.ok || !result.reply.snapshot) throw fault(result.reply.code || "media-read-failed");
          accept(result.reply.snapshot, result.requestSequence);
          if (!busy && phase === "unknown" && pendingRequest && pendingRequest === confirming && snapshot?.store && ["create-preset", "enable-channel-domain"].includes(pendingRequest.action)) {
            const merged = KnifeMediaProfiles.mergeMediaOperation(
              snapshot.store,
              pendingRequest,
              { config: { ...snapshot.values.audio, ...snapshot.values.video }, revision: snapshot.version.globalRevision }
            );
            if (merged.ok && !merged.changed) {
              for (const [key, expected] of pendingGenerations) if (dirty.get(key)?.generation === expected) dirty.delete(key);
              pendingGenerations.clear();
              pendingRequest = null;
              pendingValues = null;
              for (const entry of dirty.values()) entry.status = "held";
              phase = dirty.size ? "failed" : "ready";
              code = dirty.size ? "draft-held" : null;
            }
          }
          settledPhase();
          emit();
        } catch (error) {
          if (disposed || scope !== scopeEpoch) continue;
          code = error.code || "media-read-failed";
          phase = code === "response-unknown" ? "unknown" : "unavailable";
          emit();
        }
      }
    })().finally(() => {
      reading = null;
    });
    return reading;
  }
  async function mutateMedia(request, entries = []) {
    if (disposed || busy || !snapshot || !snapshot.canWrite || ["unknown", "conflict", "failed", "repair-required", "unavailable"].includes(phase)) throw fault("media-not-ready");
    if ("selection" in request && JSON.stringify(request.selection) !== JSON.stringify(selection)) throw fault("scope-changed");
    const scope = scopeEpoch;
    pendingRequest = JSON.parse(JSON.stringify(request));
    const sourceToken = "presetToken" in pendingRequest ? pendingRequest.presetToken : null;
    pendingValues = "values" in pendingRequest && pendingRequest.values ? { ...pendingRequest.values } : sourceToken ? snapshot.store?.presets.find((preset) => preset.id === sourceToken.id && preset.createdRevision === sourceToken.createdRevision && preset.revision === sourceToken.revision)?.values ?? null : null;
    pendingGenerations.clear();
    for (const [key, entry] of entries) pendingGenerations.set(key, entry.generation);
    busy = true;
    phase = "saving";
    code = null;
    emit();
    try {
      const result = await transport.send(2, request).promise;
      if (disposed) throw fault("disposed");
      if (scope !== scopeEpoch) throw fault("scope-changed");
      if (!result.reply.ok) {
        phase = result.reply.code === "conflict" ? "conflict" : "failed";
        code = result.reply.code || "media-write-failed";
        for (const [, entry] of entries) entry.status = "held";
      } else {
        for (const [key, entry] of entries) if (dirty.get(key)?.generation === entry.generation) dirty.delete(key);
        if (result.reply.snapshot && JSON.stringify(result.reply.snapshot.selection) === JSON.stringify(selection)) accept(result.reply.snapshot, result.requestSequence);
        pendingGenerations.clear();
        pendingRequest = null;
        pendingValues = null;
        phase = "ready";
        code = null;
      }
      epoch++;
      void refresh();
      return result.reply;
    } catch (error) {
      if (!disposed) {
        code = error.code || "response-unknown";
        phase = "unknown";
        for (const [, entry] of entries) entry.status = "unknown";
      }
      throw error;
    } finally {
      if (!disposed) {
        busy = false;
        settledPhase();
        emit();
        flush();
      }
    }
  }
  function flush() {
    if (disposed || busy || !snapshot || !snapshot.canWrite || selection.kind === "global" || ["unknown", "conflict", "failed", "repair-required", "unavailable"].includes(phase)) return;
    const pending = [...dirty].filter(([, entry]) => entry.status === "pending"), domain = pending[0]?.[1].domain;
    if (!domain) return;
    const channel = snapshot.channel, binding = domain === "audio" ? channel?.audio : channel?.video;
    if (!channel || !binding) {
      code = "domain-not-enabled";
      phase = "failed";
      emit();
      return;
    }
    const entries = pending.filter(([, entry]) => entry.domain === domain);
    for (const [, entry] of entries) entry.status = "sent";
    const patch = Object.fromEntries(entries.map(([, entry]) => [entry.id, entry.value]));
    const request = {
      action: "patch-channel-fields",
      selection,
      domain,
      channelToken: { channelId: channel.channelId, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: binding.createdRevision },
      patch
    };
    void mutateMedia(request, entries).catch(() => {
    });
  }
  function editFields(domain, patch) {
    if (domain !== "audio" && domain !== "video") return;
    if (disposed || !snapshot?.canWrite || selection.kind === "global" || !(domain === "audio" ? snapshot.channel?.audio : snapshot.channel?.video) || ["unknown", "conflict", "failed"].includes(phase)) return;
    if (!Object.keys(patch).length) return;
    const values = view().values;
    const check = KnifeMediaProfiles.validateValues(domain, { ...domain === "audio" ? values.audio : values.video, ...patch });
    if (!check.ok) {
      code = check.code;
      phase = "failed";
      emit();
      return;
    }
    for (const [id, value] of Object.entries(patch)) dirty.set(`${domain}:${id}`, { domain, id, value, generation: ++generation, status: "pending" });
    epoch++;
    code = null;
    phase = "saving";
    emit();
    flush();
  }
  async function selectScope(next) {
    if (disposed || busy || dirty.size || phase === "unknown") return { ok: false, code: "media-not-ready" };
    if (pendingRequest) return { ok: false, code: "media-not-ready" };
    selection = { ...next };
    snapshot = null;
    scopeEpoch++;
    epoch++;
    acceptedSequence = 0;
    phase = "loading";
    code = null;
    emit();
    await refresh();
    return { ok: true };
  }
  function discardPending() {
    if (disposed) return;
    dirty.clear();
    if (!busy) {
      pendingGenerations.clear();
      pendingRequest = null;
      pendingValues = null;
    }
    epoch++;
    phase = busy ? "saving" : "loading";
    code = null;
    emit();
    void refresh();
  }
  const onChanged = (changes, area) => {
    if (area !== "local" || !["mediaProfiles", "config", "settingsRevision"].some((key) => Object.hasOwn(changes, key))) return;
    epoch++;
    void refresh();
  };
  chromeApi.storage.onChanged.addListener(onChanged);
  void refresh();
  return {
    subscribe(fn) {
      if (disposed) return () => {
      };
      subscribers.add(fn);
      fn(view());
      return () => {
        subscribers.delete(fn);
      };
    },
    selectScope,
    editFields,
    perform: (request) => mutateMedia(request),
    refresh,
    discardPending,
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        chromeApi.storage.onChanged.removeListener(onChanged);
      } finally {
        transport.dispose();
        subscribers.clear();
      }
    }
  };
};
