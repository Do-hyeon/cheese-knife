// Generated from src/settings/client.ts by scripts/settings-runtime.mjs. Do not edit.
var createSettingsClient = (chromeApi) => {
  const dirty = /* @__PURE__ */ new Map(), confirmed = /* @__PURE__ */ new Map(), subscribers = /* @__PURE__ */ new Set(), transports = /* @__PURE__ */ new Set();
  let snapshot = null, css = { state: "pending", code: null }, phase = "loading", code = null;
  let disposed = false, sequence = 0, generation = 0, epoch = 0, snapshotSequence = 0;
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
    const requestId = `settings-${++sequence}`;
    const requestSequence = sequence;
    const promise = new Promise((resolve, reject) => {
      let ended = false;
      const finish = (error, result) => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        transports.delete(cancel);
        if (error) reject(error);
        else resolve({ reply: result, requestSequence });
      };
      const cancel = () => finish(fault("disposed"));
      const timer = setTimeout(() => finish(fault("response-unknown")), 1e4);
      transports.add(cancel);
      try {
        chromeApi.runtime.sendMessage({ namespace: "cheese-knife-settings", protocol: 1, action, requestId, ...payload }, (reply) => {
          const transportError = chromeApi.runtime.lastError;
          if (transportError) finish(fault("response-unknown"));
          else {
            const validated = validateReply(action, reply, requestId);
            if (!validated) finish(fault("response-unknown"));
            else finish(null, validated);
          }
        });
      } catch {
        finish(fault("response-unknown"));
      }
    });
    return { promise, requestSequence };
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
    const transport = send(action, payload);
    mutation = transport;
    updatePhase();
    emit();
    try {
      const { reply, requestSequence } = await transport.promise;
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
      chromeApi.storage.onChanged.removeListener(onChanged);
      subscribers.clear();
      for (const cancel of [...transports]) cancel();
    }
  };
};
