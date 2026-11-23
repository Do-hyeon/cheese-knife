// Generated from src/settings/bridge.ts by scripts/settings-runtime.mjs. Do not edit.
const initStyleParameters = (styleParameters) => {
  const value = styleParameters?.["chat-font-size"];
  for (const t of [1, 2, 10, 20]) {
    if (typeof value === "number" && Number.isFinite(value) && value >= -6 && value <= 16) {
      document.documentElement.style.setProperty(
        `--knife-chat-size-${t}`,
        `${value / t}px`
      );
    } else document.documentElement.style.removeProperty(`--knife-chat-size-${t}`);
  }
};
let currentConfig;
let currentParameters = {};
let revision = 0, deliverySequence = 0;
let requestId;
let statuses = {};
let diagnostics = {};
let readEpoch = 0, reading = null, scopedReading = null;
let readWanted = false, scopedWanted = false, frozen = false, disposed = false, scopedAcceptedEpoch = -1;
let scopeRequest = null, audioBindingKey = null, audioBindingGeneration = 0;
const pendingReads = /* @__PURE__ */ new Set();
const own = (value, key) => value && typeof value === "object" ? Object.getOwnPropertyDescriptor(value, key)?.value : void 0;
function boundedRead(read) {
  return new Promise((resolve, reject) => {
    let ended = false;
    const finish = (result) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      pendingReads.delete(cancel);
      if (result.ok) resolve(result.value);
      else reject(result.error);
    };
    const cancel = () => finish({ ok: false, error: new Error("configuration-read-retired") });
    const timer = setTimeout(() => finish({ ok: false, error: new Error("configuration-read-timeout") }), 2e3);
    pendingReads.add(cancel);
    try {
      void read().then((value) => finish({ ok: true, value }), (error) => finish({ ok: false, error }));
    } catch (error) {
      finish({ ok: false, error });
    }
  });
}
function retireReads() {
  readEpoch++;
  reading = null;
  scopedReading = null;
  readWanted = false;
  scopedWanted = false;
  scopedAcceptedEpoch = -1;
  for (const cancel of [...pendingReads]) cancel();
}
const sendConfig = () => window.postMessage({
  namespace: "cheese-knife",
  protocol: 1,
  type: "config",
  requestId,
  revision: revision++,
  config: currentConfig,
  i18n
}, location.origin);
function sendScoped(snapshot) {
  const request = scopeRequest;
  if (!request || !currentConfig || disposed || frozen || request.context.routePath !== location.pathname) return;
  if (snapshot && snapshot.audioBindingKey !== audioBindingKey) {
    audioBindingKey = snapshot.audioBindingKey;
    audioBindingGeneration++;
  }
  window.postMessage({
    namespace: "cheese-knife",
    protocol: 2,
    type: "config",
    requestId: request.requestId,
    context: { ...request.context },
    deliverySequence: deliverySequence++,
    baseConfig: snapshot?.baseConfig ?? currentConfig,
    effectiveConfig: snapshot?.effectiveConfig ?? currentConfig,
    i18n,
    version: snapshot?.version ?? { globalRevision: null, mediaRevision: null },
    profileState: snapshot?.profileState ?? "global",
    revisionStatus: snapshot?.revisionStatus ?? "repair-required",
    mediaPhase: snapshot ? snapshot.profileState === "repair-required" || snapshot.revisionStatus === "repair-required" ? "limited" : "ready" : "pending",
    audioBindingGeneration: snapshot ? audioBindingGeneration : 0,
    audioKind: snapshot?.audioKind ?? "global",
    videoKind: snapshot?.videoKind ?? "global"
  }, location.origin);
}
function requestLatestSettings() {
  if (disposed || frozen) return Promise.resolve();
  readWanted = true;
  if (reading) return reading.promise;
  const job = {};
  reading = job;
  job.promise = (async () => {
    while (readWanted && !disposed && !frozen && reading === job) {
      readWanted = false;
      const started = readEpoch;
      try {
        const stored = await boundedRead(() => getConfig(true));
        if (disposed || frozen || reading !== job || started !== readEpoch) return;
        if (scopedAcceptedEpoch !== started) {
          currentConfig = stored.config;
          currentParameters = stored.styleParameters;
          initStyleParameters(currentParameters);
          if (scopeRequest) sendScoped();
        }
        if (requestId) sendConfig();
      } catch {
      }
    }
  })().finally(() => {
    if (reading === job) reading = null;
  });
  return job.promise;
}
function requestScopedSettings() {
  if (disposed || frozen || !scopeRequest) return Promise.resolve();
  scopedWanted = true;
  if (scopedReading) return scopedReading.promise;
  const job = {};
  scopedReading = job;
  job.promise = (async () => {
    while (scopedWanted && !disposed && !frozen && scopedReading === job && scopeRequest) {
      scopedWanted = false;
      const started = readEpoch, request = scopeRequest;
      try {
        const stored = await boundedRead(() => readScopedConfig(request.context));
        if (disposed || frozen || scopedReading !== job || started !== readEpoch || scopeRequest !== request || request.context.routePath !== location.pathname) return;
        currentConfig = stored.baseConfig;
        currentParameters = stored.styleParameters;
        scopedAcceptedEpoch = started;
        initStyleParameters(currentParameters);
        sendScoped(stored);
        if (requestId) sendConfig();
      } catch {
      }
    }
  })().finally(() => {
    if (scopedReading === job) scopedReading = null;
  });
  return job.promise;
}
function readScopeRequest(data) {
  const id = own(data, "requestId"), raw = own(data, "context");
  if (typeof id !== "string" || !id.length || id.length > 128 || !raw || typeof raw !== "object" || Array.isArray(raw) || Reflect.ownKeys(raw).length !== 4) return null;
  const documentGeneration = own(raw, "documentGeneration"), routePath = own(raw, "routePath"), channelId = own(raw, "channelId"), playerGeneration = own(raw, "playerGeneration");
  if (!KnifeMediaProfiles.isCounter(documentGeneration) || documentGeneration < 1 || !KnifeMediaProfiles.isCounter(playerGeneration) || routePath !== location.pathname || channelId !== null && !KnifeMediaProfiles.isChannelId(channelId)) return null;
  const actual = /^\/(?:live\/)?([a-f0-9]{32})\/?$/i.exec(location.pathname)?.[1]?.toLowerCase();
  if (channelId !== null && (window.top !== window || actual !== channelId)) return null;
  return { requestId: id, context: { documentGeneration, routePath, channelId, playerGeneration } };
}
const onBridgeMessage = (event) => {
  const data = event.data;
  if (disposed || frozen || event.source !== window || event.origin !== location.origin || own(data, "namespace") !== "cheese-knife") return;
  const protocol = own(data, "protocol"), type = own(data, "type");
  if (protocol === 2 && type === "config-request") {
    const next = readScopeRequest(data);
    if (!next) return;
    if (!scopeRequest || scopeRequest.requestId !== next.requestId || JSON.stringify(scopeRequest.context) !== JSON.stringify(next.context)) {
      retireReads();
      scopeRequest = next;
      sendScoped();
      void requestLatestSettings();
    }
    void requestScopedSettings();
  } else if (protocol === 1 && type === "config-request" && typeof own(data, "requestId") === "string") {
    requestId = own(data, "requestId");
    if (!requestId.length || requestId.length > 100) {
      requestId = void 0;
      return;
    }
    void requestLatestSettings();
  } else if (protocol === 1 && type === "status" && own(data, "statuses") && typeof own(data, "statuses") === "object") {
    const accepted = [];
    for (const [key, raw] of Object.entries(own(data, "statuses"))) {
      const state = own(raw, "state"), reason = own(raw, "reason");
      if (/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/.test(key) && !["__proto__", "prototype", "constructor"].includes(key) && ["pending", "ready", "limited", "failed", "disabled"].includes(state)) {
        accepted.push([key, { state, reason: typeof reason === "string" ? reason.slice(0, 80) : "" }]);
        if (accepted.length === 30) break;
      }
    }
    statuses = Object.fromEntries(accepted);
    const detail = own(data, "diagnostics");
    diagnostics = own(detail, "world") === "MAIN" ? detail : {};
    let node = document.getElementById("knife-status");
    if (!node) {
      node = document.createElement("script");
      node.id = "knife-status";
      node.type = "application/json";
      document.body.append(node);
    }
    node.textContent = JSON.stringify({ statuses, diagnostics });
  }
};
window.addEventListener("message", onBridgeMessage);
const onStatusRequest = (message, _sender, respond) => {
  if (own(message, "type") === "cheese-knife-status") respond({ statuses: requestId && !scopeRequest ? { ...statuses, mediaSettings: { state: "limited", reason: "reload-required" } } : statuses, diagnostics });
};
chrome.runtime.onMessage.addListener(onStatusRequest);
const onSettingsChanged = (changes) => {
  if (["config", "styleParameters", "settingsRevision", "mediaProfiles"].some((key) => Object.hasOwn(changes, key))) {
    retireReads();
    sendScoped();
    void requestLatestSettings();
    void requestScopedSettings();
  }
};
chrome.storage.local.onChanged.addListener(onSettingsChanged);
const onPageShow = (event) => {
  if (!event.persisted || disposed) return;
  frozen = false;
  retireReads();
  void requestLatestSettings();
  void requestScopedSettings();
};
window.addEventListener("pageshow", onPageShow);
const onPageHide = (event) => {
  if (disposed) return;
  retireReads();
  frozen = true;
  if (event.persisted) return;
  disposed = true;
  const failures = [];
  try {
    if (chrome.runtime?.id) {
      for (const remove of [
        () => chrome.storage.local.onChanged.removeListener(onSettingsChanged),
        () => chrome.runtime.onMessage.removeListener(onStatusRequest)
      ]) {
        try {
          remove();
        } catch (error) {
          if (error?.message !== "Extension context invalidated.") failures.push(error);
        }
      }
    }
  } finally {
    window.removeEventListener("message", onBridgeMessage);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("pagehide", onPageHide);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Extension listener cleanup failed");
};
window.addEventListener("pageshow", onPageShow);
window.addEventListener("pagehide", onPageHide);
const i18n = Object.fromEntries([
  "close",
  "chat",
  "stats",
  "resolution",
  "bitrate",
  "fps",
  "latency",
  "codec",
  "unknown",
  "fastForward",
  "enableCompressor",
  "disableCompressor",
  "liveStart",
  "speed2x",
  "previewAudioBlocked",
  "previewAudioRightClick",
  "measured"
].map((key) => [key, chrome.i18n.getMessage(`content_${key}`)]));
const i18nScript = document.createElement("script");
i18nScript.id = "knife-i18n";
i18nScript.type = "application/json";
i18nScript.textContent = JSON.stringify(i18n);
document.body.appendChild(i18nScript);
void requestLatestSettings();
