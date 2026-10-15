// Generated from src/settings/broker.ts by scripts/settings-runtime.mjs. Do not edit.
var createSettingsBroker = (chromeApi) => {
  const contract = KnifeSettingsContract;
  const keys = ["config", "styles", "styleParameters", "settingsRevision", "mediaProfiles"];
  const gainAuthority = createPlayerGainAuthority();
  const jobs = [];
  let running = false, boot, initFailure;
  let css = { state: "pending", code: null }, lastFailedCss;
  let stylesDirty = false, stylesQueued = false, stylesRetry = false;
  const fault = (stage, code) => Object.assign(new Error(code), { stage, code });
  const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function enqueue(work) {
    if (running && jobs.length >= 64) return Promise.reject(fault("busy", "settings-busy"));
    const result = new Promise((resolve, reject) => jobs.push({ work, resolve, reject }));
    void drain();
    return result;
  }
  async function drain() {
    if (running) return;
    running = true;
    while (jobs.length) {
      const job = jobs.shift();
      try {
        job.resolve(await job.work());
      } catch (error) {
        job.reject(error);
      }
      scheduleStyles();
    }
    running = false;
  }
  async function read(includeLegacy = false) {
    try {
      return await chromeApi.storage.local.get(includeLegacy ? [...keys, "t"] : keys);
    } catch {
      throw fault("read", "storage-read-failed");
    }
  }
  async function write(changes, raw) {
    gainAuthority.beforeWrite(raw, changes);
    try {
      await chromeApi.storage.local.set(changes);
    } catch {
      gainAuthority.writeFailed(raw, changes);
      throw fault("write", "storage-write-failed");
    }
  }
  async function applyStyles(raw, force = false) {
    const files = contract.cssFiles(raw.styles), fingerprint = JSON.stringify(files);
    try {
      const [existing] = await chromeApi.scripting.getRegisteredContentScripts({ ids: ["styles"] });
      const desired = {
        id: "styles",
        matches: [...KnifeHostPolicy.origins],
        css: files,
        runAt: "document_start"
      };
      const matches = !files.length ? !existing : existing && equal(existing.css, files) && equal(existing.matches, desired.matches) && existing.runAt === desired.runAt && !existing.js?.length;
      if (matches) {
        css = { state: "ready", code: null };
        lastFailedCss = void 0;
        return;
      }
      if (!force && lastFailedCss === fingerprint) return;
      if (existing?.js?.length) throw new Error("unexpected-owned-script");
      css = { state: "pending", code: null };
      if (!files.length) await chromeApi.scripting.unregisterContentScripts({ ids: ["styles"] });
      else if (existing) await chromeApi.scripting.updateContentScripts([desired]);
      else await chromeApi.scripting.registerContentScripts([desired]);
      css = { state: "ready", code: null };
      lastFailedCss = void 0;
    } catch {
      css = { state: "failed", code: "style-registration-failed" };
      lastFailedCss = fingerprint;
    }
  }
  function scheduleStyles() {
    if (!stylesDirty || stylesQueued || !boot || initFailure || jobs.length >= 64) return;
    stylesQueued = true;
    void enqueue(async () => {
      const retry = stylesRetry;
      stylesDirty = false;
      stylesRetry = false;
      let raw;
      try {
        await boot;
        raw = await read();
        contract.readRevision(raw.settingsRevision);
      } catch (error) {
        if (retry) stylesRetry = true;
        throw error;
      }
      await applyStyles(raw, retry);
    }).catch(() => {
    }).finally(() => {
      stylesQueued = false;
      scheduleStyles();
    });
  }
  function invalidateStyles(options = {}) {
    stylesDirty = true;
    if (options.retry === true) stylesRetry = true;
    scheduleStyles();
  }
  function initialize() {
    if (boot) return boot;
    boot = enqueue(async () => {
      const raw = await read(true), revision = contract.readRevision(raw.settingsRevision);
      const config = { ...record(raw.config) }, styles = Array.isArray(raw.styles) ? [...raw.styles] : [];
      if (config.resizeChat) {
        delete config.resizeChat;
        if (!styles.includes("chat-resize")) styles.push("chat-resize");
      }
      if (raw.t != null) {
        const sharpness = Number(raw.t);
        if (contract.validateOperations([{ type: "config", id: "sharpness", value: sharpness }]).ok) config.sharpness = sharpness;
      }
      const changes = {};
      if (!equal(config, record(raw.config))) changes.config = config;
      if (!equal(styles, Array.isArray(raw.styles) ? raw.styles : [])) changes.styles = styles;
      if (Object.keys(changes).length) {
        changes.settingsRevision = revision + 1;
        await write(changes, raw);
      }
      if (Object.hasOwn(raw, "t")) {
        try {
          await chromeApi.storage.local.remove("t");
        } catch {
          throw fault("initialization", "legacy-cleanup-failed");
        }
      }
      await applyStyles({ ...raw, ...changes }, true);
    });
    void boot.catch((error) => {
      initFailure = error;
    });
    return boot;
  }
  async function execute(request) {
    const raw = await read();
    let revision;
    try {
      revision = contract.readRevision(raw.settingsRevision);
    } catch (error) {
      throw fault("read", error.code);
    }
    if (request.action === "get-snapshot") return { ok: true, requestId: request.requestId, snapshot: contract.makeSnapshot(raw, css) };
    if (request.action === "patch") {
      const result = contract.mergeOperations(raw, request.operations);
      if (Object.keys(result.changes).length) await write(result.changes, raw);
      if (result.stylesTouched) await applyStyles({ ...raw, ...result.changes }, true);
      const failed = result.stylesTouched && css.state === "failed";
      return {
        ok: !failed,
        requestId: request.requestId,
        revision: result.revision,
        stored: true,
        css: { ...css },
        stage: failed ? "css" : null,
        code: failed ? css.code : null
      };
    }
    await applyStyles(raw);
    if (css.state !== "ready") throw fault("css", css.code || "style-registration-failed");
    let tab;
    try {
      tab = await chromeApi.tabs.get(request.targetTabId);
    } catch {
      throw fault("target", "target-missing");
    }
    try {
      if (new URL(tab.url).origin !== "https://chzzk.naver.com") throw new Error();
    } catch {
      throw fault("target", "target-origin-changed");
    }
    if (tab.windowId !== request.targetWindowId) throw fault("target", "target-window-changed");
    try {
      await chromeApi.tabs.reload(request.targetTabId);
    } catch {
      throw fault("reload", "target-reload-failed");
    }
    return {
      ok: true,
      requestId: request.requestId,
      revision,
      reloaded: true,
      appliedStyles: contract.makeSnapshot(raw, css).styles,
      css: { ...css },
      stage: null,
      code: null
    };
  }
  async function mediaContext(sender, tabOnly = false) {
    if (!sender.documentId || typeof chromeApi.runtime.getContexts !== "function") throw fault("sender", "sender-context-unavailable");
    let timer;
    try {
      const contexts = await Promise.race([
        chromeApi.runtime.getContexts({ documentIds: [sender.documentId] }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(fault("sender", "sender-context-unavailable")), 2e3);
        })
      ]);
      const context = contexts.length === 1 ? contexts[0] : void 0;
      if (!context || context.documentId !== sender.documentId || context.documentUrl !== sender.url || context.documentOrigin !== chromeApi.runtime.getURL("").replace(/\/$/, "") || typeof context.incognito !== "boolean" || !(context.contextType === "TAB" && context.frameId === 0 || !tabOnly && context.contextType === "POPUP" && [0, -1].includes(context.frameId))) {
        throw fault("sender", "sender-context-unavailable");
      }
      return context.incognito;
    } catch {
      throw fault("sender", "sender-context-unavailable");
    } finally {
      if (timer !== void 0) clearTimeout(timer);
    }
  }
  async function mediaTarget(selection) {
    if (selection.kind !== "current") return false;
    let tab;
    try {
      tab = await chromeApi.tabs.get(selection.tabId);
    } catch {
      throw fault("target", "target-missing");
    }
    if (tab.id !== selection.tabId || tab.windowId !== selection.windowId) throw fault("target", "target-window-changed");
    let url;
    try {
      url = new URL(tab.url);
    } catch {
      throw fault("target", "target-origin-changed");
    }
    if (url.origin !== "https://chzzk.naver.com") throw fault("target", "target-origin-changed");
    const channel = /^\/(?:live\/)?([a-f0-9]{32})\/?$/i.exec(url.pathname)?.[1]?.toLowerCase();
    if (channel !== selection.channelId) throw fault("target", "target-channel-changed");
    if (typeof tab.incognito !== "boolean") throw fault("target", "target-context-unavailable");
    return tab.incognito;
  }
  function mediaSnapshot(raw, selection, incognito) {
    const global = contract.makeSnapshot(raw, css), read2 = KnifeMediaProfiles.readLegacyStore(raw.mediaProfiles);
    const channelId = selection.kind === "global" ? null : selection.channelId;
    const resolved = KnifeMediaProfiles.resolveLegacyMediaSettings(global.config, read2, { channelId, topFrame: true, incognito });
    const domainValues = (domain) => KnifeMediaProfiles.validateValues(domain, Object.fromEntries(
      (domain === "audio" ? KnifeMediaProfiles.audioFields : KnifeMediaProfiles.videoFields).map((field) => [field.id, resolved.effectiveConfig[field.id]])
    ));
    const audio = domainValues("audio"), video = domainValues("video");
    if (!audio.ok || audio.domain !== "audio" || !video.ok || video.domain !== "video") throw fault("read", "invalid-media-values");
    const store = read2.state === "valid" || read2.state === "absent" ? read2.store : null;
    return {
      selection,
      version: { globalRevision: global.revision, mediaRevision: store?.revision ?? null },
      profileState: resolved.profileState,
      code: store ? null : read2.state === "invalid" || read2.state === "unsupported" ? read2.code : null,
      canWrite: !!store && !incognito,
      values: { audio: audio.values, video: video.values },
      store,
      channel: incognito ? null : store?.channels.find((item) => item.channelId === channelId) ?? null
    };
  }
  async function executeMedia(request, sender) {
    const selection = "selection" in request ? request.selection : { kind: "global" };
    const checkContext = async () => await mediaContext(sender) || await mediaTarget(selection);
    const incognito = await checkContext();
    let raw;
    try {
      raw = await chromeApi.storage.local.get(keys);
    } catch {
      throw fault("read", "storage-read-failed");
    }
    let snapshot = mediaSnapshot(raw, selection, incognito);
    if (request.action !== "get-media-snapshot") {
      if (incognito) throw fault("sender", "incognito-media-disabled");
      const read2 = KnifeMediaProfiles.readLegacyStore(raw.mediaProfiles);
      if (read2.state !== "valid" && read2.state !== "absent") throw fault("media", read2.code);
      const global = contract.makeSnapshot(raw, css);
      const merged = KnifeMediaProfiles.mergeMediaOperation(read2.store, request, { config: global.config, revision: global.revision });
      if (!merged.ok) throw fault("media", merged.code);
      if (await checkContext()) throw fault("sender", "incognito-media-disabled");
      if (merged.globalOperations) {
        const result = contract.mergeOperations(raw, merged.globalOperations);
        if (Object.keys(result.changes).length) await write(result.changes, raw);
        if (result.stylesTouched) await applyStyles({ ...raw, ...result.changes }, true);
        raw = { ...raw, ...result.changes };
      } else if (merged.changed) {
        await write({ mediaProfiles: merged.nextStore }, raw);
        raw = { ...raw, mediaProfiles: merged.nextStore };
      }
      snapshot = mediaSnapshot(raw, selection, false);
    }
    return {
      protocol: 2,
      ok: true,
      requestId: request.requestId,
      stored: request.action !== "get-media-snapshot",
      snapshot,
      version: snapshot.version,
      profileState: snapshot.profileState,
      stage: null,
      code: null
    };
  }
  function mediaSnapshotV3(raw, selection, incognito) {
    const global = contract.makeSnapshot(raw, css), read2 = KnifeMediaProfiles.readStore(raw.mediaProfiles);
    const channelId = selection.kind === "global" ? null : selection.channelId;
    const resolved = KnifeMediaProfiles.resolveMediaSettings(
      { ...global.config, ...record(raw.config) },
      read2,
      { channelId, topFrame: true, incognito }
    );
    const store = read2.state === "valid" || read2.state === "absent" ? read2.store : null;
    const channel = incognito ? null : store?.channels.find((item) => item.channelId === channelId) ?? null;
    const audio = channel?.audio ? store.schema === 1 ? KnifeMediaProfiles.projectAudioV2(channel.audio.values) : channel.audio.values : KnifeMediaProfiles.projectGlobalAudio(record(raw.config));
    const video = KnifeMediaProfiles.validateValues("video", Object.fromEntries(KnifeMediaProfiles.videoFields.map((field) => [field.id, resolved.effectiveConfig[field.id]])));
    if (!video.ok || video.domain !== "video") throw fault("read", "invalid-media-values");
    const effectiveGain = resolved.effectiveConfig.audioGain;
    if (typeof effectiveGain !== "number" || !Number.isFinite(effectiveGain) || effectiveGain < 0 || effectiveGain > 2) throw fault("read", "invalid-media-values");
    return {
      selection,
      version: { globalRevision: global.revision, mediaRevision: store?.revision ?? null },
      profileState: resolved.profileState,
      gainOrigin: resolved.gainOrigin,
      effectiveGain,
      code: incognito ? "incognito-media-disabled" : store ? store.schema === 1 ? "media-upgrade-required" : null : read2.state === "invalid" || read2.state === "unsupported" ? read2.code : null,
      canWrite: !!store && store.schema === 2 && !incognito,
      values: { audio, video: video.values },
      store,
      channel
    };
  }
  async function nativeCall(work, deadline) {
    const remaining = Math.min(2e3, deadline - Date.now());
    if (remaining <= 0) throw fault("target", "native-read-timeout");
    let timer;
    try {
      return await Promise.race([work(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(fault("target", "native-read-timeout")), remaining);
      })]);
    } finally {
      if (timer !== void 0) clearTimeout(timer);
    }
  }
  async function legacyGain(selection) {
    const deadline = Date.now() + 4e3;
    if (await nativeCall(() => mediaTarget(selection), deadline)) throw fault("target", "incognito-media-disabled");
    const before = await nativeCall(() => chromeApi.tabs.get(selection.tabId), deadline);
    const probe = async () => {
      const result = await nativeCall(() => chromeApi.scripting.executeScript({ target: { tabId: selection.tabId, frameIds: [0] }, world: "ISOLATED", func: fixedLegacyGainRead }), deadline);
      const row = result.length === 1 ? result[0] : void 0, value = row?.result;
      if (!row || row.frameId !== 0 || typeof row.documentId !== "string" || !row.documentId.length || row.documentId.length > 128 || !value || value.url !== before.url || !["valid", "fallback"].includes(value.state) || typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0 || value.value > 2) throw fault("target", "legacy-read-unavailable");
      return {
        value: value.value,
        state: value.state,
        documentId: row.documentId,
        tabId: selection.tabId,
        windowId: selection.windowId,
        url: value.url
      };
    };
    const first = await probe(), second = await probe();
    if (first.documentId !== second.documentId) throw fault("target", "legacy-document-changed");
    if (first.value !== second.value || first.state !== second.state) throw fault("target", "conflict");
    const after = await nativeCall(() => chromeApi.tabs.get(selection.tabId), deadline);
    if (after.id !== before.id || after.windowId !== before.windowId || after.url !== before.url || after.incognito !== false) throw fault("target", "target-context-changed");
    return second;
  }
  function globalMediaChanges(raw, domain, patch, direct = true) {
    const snapshot = mediaSnapshotV3(raw, { kind: "global" }, false);
    const previous = domain === "audio" ? snapshot.values.audio : snapshot.values.video;
    const updates = record(patch);
    const values = { ...previous, ...updates, ...direct && domain === "audio" && Object.hasOwn(updates, "audioGain") ? { gainInherited: false } : {} };
    const checked = domain === "audio" ? KnifeMediaProfiles.validateAudioV2(values) : KnifeMediaProfiles.validateValues("video", values);
    if (!checked.ok) throw fault("validation", "invalid-values");
    const config = { ...record(raw.config) };
    for (const [id, value] of Object.entries(updates)) Object.defineProperty(
      config,
      id === "audioDefault" ? "compressorDefault" : id,
      { value, enumerable: true, configurable: true, writable: true }
    );
    if (direct && domain === "audio" && Object.hasOwn(updates, "audioGain")) config.gainInherited = false;
    if (equal(config, record(raw.config))) return {};
    return { config, settingsRevision: contract.readRevision(raw.settingsRevision) + 1 };
  }
  async function executeMediaV3(request, sender) {
    if (request.action === "get-audio-state" || request.action === "set-audio-wanted") {
      if (await mediaContext(sender, true)) throw fault("sender", "incognito-media-disabled");
      const audioState = await relayAudio(request, sender);
      if (await mediaContext(sender, true)) throw fault("sender", "incognito-media-disabled");
      return { protocol: 3, ok: true, requestId: request.requestId, stored: false, audioState, stage: null, code: null };
    }
    const selection = "selection" in request ? request.selection : { kind: "global" };
    const checkContext = async () => await mediaContext(sender, true) || await mediaTarget(selection);
    const incognito = await checkContext();
    let raw = await read(), snapshot = mediaSnapshotV3(raw, selection, incognito);
    const response = (stored) => {
      const current = mediaSnapshotV3(raw, selection, incognito);
      return {
        protocol: 3,
        ok: true,
        requestId: request.requestId,
        stored,
        snapshot: current,
        version: current.version,
        profileState: current.profileState,
        stage: null,
        code: null
      };
    };
    if (request.action === "get-media-snapshot") return response(false);
    if (incognito) throw fault("sender", "incognito-media-disabled");
    if (request.action === "read-legacy-gain") return { ...response(false), legacyGain: await legacyGain(request.selection) };
    const readStore = KnifeMediaProfiles.readStore(raw.mediaProfiles);
    if (readStore.state !== "valid" && readStore.state !== "absent") throw fault("media", readStore.code);
    if (request.storeSchema !== readStore.store.schema) throw fault("media", "conflict");
    let changes;
    if (request.action === "upgrade-media-store") {
      const merged = KnifeMediaProfiles.upgradeMediaStore(raw.mediaProfiles, request.expectedMediaRevision);
      if (!merged.ok) throw fault("media", merged.code);
      changes = { mediaProfiles: merged.nextStore };
    } else {
      if (readStore.store.schema !== 2) throw fault("media", "media-upgrade-required");
      if (request.action === "create-preset" && request.domain === "audio" && request.values.gainInherited) throw fault("media", "preset-gain-unconfirmed");
      if (request.action === "patch-global-fields") {
        if (contract.readRevision(raw.settingsRevision) !== request.expectedGlobalRevision) throw fault("media", "conflict");
        changes = globalMediaChanges(raw, request.domain, request.patch);
      } else if (request.action === "import-legacy-gain") {
        if (snapshot.version.globalRevision !== request.expectedGlobalRevision) throw fault("media", "conflict");
        const fresh = await legacyGain(request.selection);
        if (fresh.documentId !== request.documentId) throw fault("target", "legacy-document-changed");
        if (fresh.value !== request.value) throw fault("media", "conflict");
        raw = await read();
        const latest = KnifeMediaProfiles.readStore(raw.mediaProfiles);
        if (contract.readRevision(raw.settingsRevision) !== request.expectedGlobalRevision || latest.state !== "valid" && latest.state !== "absent" || latest.store.schema !== 2) throw fault("media", "conflict");
        changes = globalMediaChanges(raw, "audio", { audioGain: request.value });
      } else {
        const merged = KnifeMediaProfiles.mergeMediaOperationV2(
          readStore.store,
          request,
          { config: { ...snapshot.values.video, ...record(raw.config) }, revision: snapshot.version.globalRevision }
        );
        if (!merged.ok) throw fault("media", merged.code);
        changes = merged.globalValues && merged.domain ? globalMediaChanges(raw, merged.domain, merged.globalValues, false) : merged.changed ? { mediaProfiles: merged.nextStore } : {};
      }
    }
    if (await checkContext()) throw fault("sender", "incognito-media-disabled");
    if (Object.keys(changes).length) await write(changes, raw);
    raw = { ...raw, ...changes };
    snapshot = mediaSnapshotV3(raw, selection, false);
    return response(true);
  }
  async function fixedAudioRead(expected, wanted) {
    const runtime = globalThis[/* @__PURE__ */ Symbol.for("cheese-knife.runtime.v1")];
    if (!runtime || runtime.ownerProtocol !== 3 || !runtime.player) return null;
    const context = { ...runtime.media.context }, runtimeRequestId = runtime.requestId, mediaRequestId = runtime.mediaRequestId;
    if (expected && (runtimeRequestId !== expected.runtimeRequestId || mediaRequestId !== expected.mediaRequestId || JSON.stringify(context) !== JSON.stringify(expected.context))) return null;
    const result = wanted === null ? runtime.player.getAudioWanted(context) : await runtime.player.setAudioWanted(wanted, context);
    if (!result.ok || runtime.requestId !== runtimeRequestId || runtime.mediaRequestId !== mediaRequestId || JSON.stringify(runtime.media.context) !== JSON.stringify(context) || JSON.stringify(result.context) !== JSON.stringify(context)) return null;
    return { url: location.href, runtimeRequestId, mediaRequestId, context, wanted: result.wanted, state: result.state };
  }
  async function relayAudio(request, sender) {
    const deadline = Date.now() + 4e3, target = request.target;
    const tab = async () => {
      const current = await nativeCall(() => chromeApi.tabs.get(target.tabId), deadline);
      let url;
      try {
        url = new URL(current.url);
      } catch {
        throw fault("target", "target-context-changed");
      }
      if (current.id !== target.tabId || current.windowId !== target.windowId || current.incognito !== false || url.origin !== "https://chzzk.naver.com" || url.pathname !== target.routePath) throw fault("target", "target-context-changed");
      return current;
    };
    const before = await tab();
    const probe = async (binding2, wanted) => {
      const expected = binding2 ? { runtimeRequestId: binding2.runtimeRequestId, mediaRequestId: binding2.mediaRequestId, context: binding2.context } : null;
      const rows = await nativeCall(() => chromeApi.scripting.executeScript({
        target: binding2 ? { tabId: target.tabId, documentIds: [binding2.documentId] } : { tabId: target.tabId, frameIds: [0] },
        world: "MAIN",
        func: fixedAudioRead,
        args: [expected, wanted]
      }), deadline);
      const row = rows.length === 1 ? rows[0] : void 0;
      const state = row?.result ? { ...row.result, tabId: target.tabId, windowId: target.windowId, documentId: row.documentId } : null;
      if (!row || row.frameId !== 0 || !contract.audioState(state) || state.url !== before.url || new URL(state.url).pathname !== state.context.routePath || binding2 && (state.documentId !== binding2.documentId || state.runtimeRequestId !== binding2.runtimeRequestId || state.mediaRequestId !== binding2.mediaRequestId || JSON.stringify(state.context) !== JSON.stringify(binding2.context))) throw fault("target", "audio-target-changed");
      return state;
    };
    const first = await probe(null, null);
    const binding = request.action === "set-audio-wanted" ? request.binding : first;
    if (first.documentId !== binding.documentId || first.url !== binding.url || first.runtimeRequestId !== binding.runtimeRequestId || first.mediaRequestId !== binding.mediaRequestId || JSON.stringify(first.context) !== JSON.stringify(binding.context)) throw fault("target", "audio-target-changed");
    if ((await tab()).url !== before.url) throw fault("target", "audio-target-changed");
    if (await mediaContext(sender, true)) throw fault("sender", "incognito-media-disabled");
    const result = await probe(binding, request.action === "set-audio-wanted" ? request.wanted : null);
    const after = await probe(null, null);
    if ((await tab()).url !== before.url || after.documentId !== result.documentId || after.runtimeRequestId !== result.runtimeRequestId || after.mediaRequestId !== result.mediaRequestId || JSON.stringify(after.context) !== JSON.stringify(result.context)) throw fault("target", "audio-target-changed");
    return result;
  }
  function fixedLegacyGainRead() {
    try {
      const raw = localStorage.getItem("knifeGain");
      if (raw === null || !raw.trim()) return { url: location.href, value: 1, state: "fallback" };
      if (raw.length > 64) return { url: location.href, value: null, state: "invalid" };
      const value = Number(raw);
      return { url: location.href, value: Number.isFinite(value) && value >= 0 && value <= 2 ? value : null, state: "valid" };
    } catch {
      return { url: location.href, value: null, state: "unavailable" };
    }
  }
  function fixedPlayerGainProbe() {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, /* @__PURE__ */ Symbol.for("cheese-knife.player-gain.private.v3"));
    if (!descriptor || typeof descriptor.get !== "function") return null;
    return descriptor.get.call(globalThis);
  }
  async function playerNative(sender, deadline) {
    const tabId = sender.tab.id, windowId = sender.tab.windowId;
    const tab = await nativeCall(() => chromeApi.tabs.get(tabId), deadline);
    if (tab.id !== tabId || tab.windowId !== windowId || tab.url !== sender.url || tab.incognito !== false) throw fault("target", "gain-context-changed");
    const rows = await nativeCall(() => chromeApi.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: "ISOLATED", func: fixedPlayerGainProbe }), deadline);
    const row = rows.length === 1 ? rows[0] : void 0, probe = row?.result;
    if (!row || row.frameId !== 0 || row.documentId !== sender.documentId || !probe || probe.url !== tab.url || probe.owned !== true || typeof probe.bindingId !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(probe.bindingId) || probe.legacyValue !== null && (typeof probe.legacyValue !== "number" || !Number.isFinite(probe.legacyValue) || probe.legacyValue < 0 || probe.legacyValue > 2) || probe.intent !== null && (!probe.intent || typeof probe.intent.id !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(probe.intent.id) || typeof probe.intent.value !== "number" || !Number.isFinite(probe.intent.value) || probe.intent.value < 0 || probe.intent.value > 2)) throw fault("target", "gain-probe-unavailable");
    const after = await nativeCall(() => chromeApi.tabs.get(tabId), deadline);
    if (after.id !== tabId || after.windowId !== windowId || after.url !== tab.url || after.incognito !== false) throw fault("target", "gain-context-changed");
    return { native: { tabId, windowId, documentId: sender.documentId, route: tab.url, bindingId: probe.bindingId, legacyValue: probe.legacyValue }, intent: probe.intent };
  }
  async function executeGain(request, sender) {
    const deadline = Date.now() + 4e3;
    const current = await playerNative(sender, deadline);
    let raw = await read();
    const reply = (view, stored) => ({
      protocol: 3,
      ok: true,
      requestId: request.requestId,
      stored,
      view,
      ...request.action === "set-gain" ? { intentId: request.intentId } : {}
    });
    if (request.action === "get-gain-view") {
      const view = gainAuthority.view(current.native, raw);
      if (!view.ok) throw fault("gain", view.code);
      return reply(view, false);
    }
    if (!current.intent || current.intent.id !== request.intentId || current.intent.value !== request.value) throw fault("gain", "gain-intent-mismatch");
    const checked = gainAuthority.begin(request.ticket, current.native, raw, request.intentId, request.value);
    if (!checked.ok) throw fault("gain", checked.code);
    try {
      const final = await playerNative(sender, deadline);
      raw = await read();
      if (!final.intent || final.intent.id !== request.intentId || final.intent.value !== request.value || !gainAuthority.check(request.ticket, final.native, raw).ok) throw fault("gain", "gain-context-changed");
      let changes;
      if (checked.state.token) {
        const readStore = KnifeMediaProfiles.readStore(raw.mediaProfiles);
        if (readStore.state !== "valid" || readStore.store.schema !== 2) throw fault("gain", "gain-conflict");
        const merged = KnifeMediaProfiles.mergeMediaOperationV2(
          readStore.store,
          {
            action: "patch-channel-fields",
            selection: { kind: "saved", channelId: checked.state.token.channelId },
            channelToken: checked.state.token,
            domain: "audio",
            patch: { audioGain: request.value, gainInherited: false }
          },
          { config: record(raw.config), revision: checked.state.version.globalRevision }
        );
        if (!merged.ok) throw fault("gain", merged.code);
        changes = merged.changed ? { mediaProfiles: merged.nextStore } : {};
      } else changes = globalMediaChanges(raw, "audio", { audioGain: request.value });
      if (Object.keys(changes).length) await write(changes, raw);
      gainAuthority.finish(request.ticket, true);
      const view = gainAuthority.view(final.native, { ...raw, ...changes });
      if (!view.ok) throw fault("gain", view.code);
      return reply(view, true);
    } catch (error) {
      gainAuthority.finish(request.ticket, false);
      throw error;
    }
  }
  function listener(message, sender, respond) {
    const namespace = message?.namespace;
    if (namespace !== "cheese-knife-settings" && namespace !== "cheese-knife-player-gain") return false;
    const gain = namespace === "cheese-knife-player-gain";
    const modern = message.protocol === 3;
    const media = modern || message.protocol === 2;
    const validated = gain ? contract.validateGainRequest(message, sender, chromeApi.runtime.id) : modern ? contract.validateMediaRequestV3(message, sender, chromeApi.runtime.id, (path) => chromeApi.runtime.getURL(path)) : media ? contract.validateMediaRequest(message, sender, chromeApi.runtime.id, (path) => chromeApi.runtime.getURL(path)) : contract.validateRequest(message, sender, chromeApi.runtime.id, (path) => chromeApi.runtime.getURL(path));
    const requestId = typeof message.requestId === "string" && message.requestId.length <= 128 ? message.requestId : void 0;
    const deliver = (result) => {
      try {
        respond(result);
      } catch {
      }
    };
    const replyError = (stage, code) => media ? { protocol: modern ? 3 : 2, ok: false, requestId, stored: false, stage, code } : { ok: false, requestId, stored: false, reloaded: false, css: { ...css }, stage, code };
    if (!validated.ok) {
      deliver(replyError("validation", validated.code));
      return true;
    }
    const ready = initialize();
    void enqueue(async () => {
      try {
        await ready;
      } catch (error) {
        throw fault("initialization", error.code || "initialization-failed");
      }
      return validated.request.namespace === "cheese-knife-player-gain" ? executeGain(validated.request, sender) : validated.request.protocol === 3 ? executeMediaV3(validated.request, sender) : validated.request.protocol === 2 ? executeMedia(validated.request, sender) : execute(validated.request);
    }).then(deliver, (error) => deliver(replyError(error.stage || "read", error.code || "settings-operation-failed")));
    return true;
  }
  return {
    listener,
    initialize,
    invalidateStyles,
    observeGainChanges: gainAuthority.observe,
    retireGainTab: gainAuthority.retireTab,
    retireGainActors: gainAuthority.retireAll
  };
};
