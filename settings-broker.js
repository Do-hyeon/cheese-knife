// Generated from src/settings/broker.ts by scripts/settings-runtime.mjs. Do not edit.
var createSettingsBroker = (chromeApi) => {
  const contract = KnifeSettingsContract;
  const keys = ["config", "styles", "styleParameters", "settingsRevision"];
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
  async function write(changes) {
    try {
      await chromeApi.storage.local.set(changes);
    } catch {
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
        await write(changes);
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
      if (Object.keys(result.changes).length) await write(result.changes);
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
  async function mediaContext(sender) {
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
      if (!context || context.documentId !== sender.documentId || context.documentUrl !== sender.url || context.documentOrigin !== chromeApi.runtime.getURL("").replace(/\/$/, "") || typeof context.incognito !== "boolean" || !(context.contextType === "TAB" && context.frameId === 0 || context.contextType === "POPUP" && [0, -1].includes(context.frameId))) {
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
    const global = contract.makeSnapshot(raw, css), read2 = KnifeMediaProfiles.readStore(raw.mediaProfiles);
    const channelId = selection.kind === "global" ? null : selection.channelId;
    const resolved = KnifeMediaProfiles.resolveMediaSettings(global.config, read2, { channelId, topFrame: true, incognito });
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
      raw = await chromeApi.storage.local.get([...keys, "mediaProfiles"]);
    } catch {
      throw fault("read", "storage-read-failed");
    }
    let snapshot = mediaSnapshot(raw, selection, incognito);
    if (request.action !== "get-media-snapshot") {
      if (incognito) throw fault("sender", "incognito-media-disabled");
      const read2 = KnifeMediaProfiles.readStore(raw.mediaProfiles);
      if (read2.state !== "valid" && read2.state !== "absent") throw fault("media", read2.code);
      const global = contract.makeSnapshot(raw, css);
      const merged = KnifeMediaProfiles.mergeMediaOperation(read2.store, request, { config: global.config, revision: global.revision });
      if (!merged.ok) throw fault("media", merged.code);
      if (await checkContext()) throw fault("sender", "incognito-media-disabled");
      if (merged.globalOperations) {
        const result = contract.mergeOperations(raw, merged.globalOperations);
        if (Object.keys(result.changes).length) await write(result.changes);
        if (result.stylesTouched) await applyStyles({ ...raw, ...result.changes }, true);
        raw = { ...raw, ...result.changes };
      } else if (merged.changed) {
        await write({ mediaProfiles: merged.nextStore });
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
  function listener(message, sender, respond) {
    if (message?.namespace !== "cheese-knife-settings") return false;
    const media = message.protocol === 2;
    const validated = media ? contract.validateMediaRequest(message, sender, chromeApi.runtime.id, (path) => chromeApi.runtime.getURL(path)) : contract.validateRequest(message, sender, chromeApi.runtime.id, (path) => chromeApi.runtime.getURL(path));
    const requestId = typeof message.requestId === "string" && message.requestId.length <= 128 ? message.requestId : void 0;
    const deliver = (result) => {
      try {
        respond(result);
      } catch {
      }
    };
    const replyError = (stage, code) => media ? { protocol: 2, ok: false, requestId, stored: false, stage, code } : { ok: false, requestId, stored: false, reloaded: false, css: { ...css }, stage, code };
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
      return validated.request.protocol === 2 ? executeMedia(validated.request, sender) : execute(validated.request);
    }).then(deliver, (error) => deliver(replyError(error.stage || "read", error.code || "settings-operation-failed")));
    return true;
  }
  return { listener, initialize, invalidateStyles };
};
