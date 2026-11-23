const initStyleParameters = (styleParameters: KnifeUnknownRecord | undefined) => {
  const value = styleParameters?.['chat-font-size'];
  for (const t of [1, 2, 10, 20]) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= -6 && value <= 16) {
      document.documentElement.style.setProperty(
        `--knife-chat-size-${t}`,
        `${value / t}px`
      );
    } else document.documentElement.style.removeProperty(`--knife-chat-size-${t}`);
  }
};

let currentConfig: Record<string, KnifeScalar> | undefined;
let currentParameters = {};
let revision = 0;
let requestId: string | undefined;
let statuses: Record<string, { state: string; reason: string }> = {};
let diagnostics: KnifeUnknownRecord = {};
let readEpoch = 0, reading: { promise: Promise<void> } | null = null, readWanted = false, frozen = false, disposed = false;
const sendConfig = () => window.postMessage({ namespace: "cheese-knife", protocol: 1,
  type: "config", requestId, revision: revision++, config: currentConfig, i18n }, location.origin);
function requestLatestSettings() {
  if (disposed) return Promise.resolve();
  readWanted = true;
  if (frozen) return Promise.resolve();
  if (reading) return reading.promise;
  const job = {} as { promise: Promise<void> }; reading = job;
  job.promise = (async () => {
    while (readWanted && !disposed && !frozen && reading === job) {
      readWanted = false;
      const started = readEpoch;
      try {
        const stored = await getConfig(true);
        if (disposed || frozen || reading !== job) return;
        if (started !== readEpoch) { readWanted = true; continue; }
        currentConfig = stored.config; currentParameters = stored.styleParameters;
        setFilters(currentConfig); initStyleParameters(currentParameters);
        if (requestId) sendConfig();
      } catch { /* MAIN reports a bounded initial configuration timeout. Do not invent a successful read. */ }
    }
  })().finally(() => { if (reading === job) reading = null; });
  return job.promise;
}
const onBridgeMessage = (e: MessageEvent<unknown>) => {
  const data = e.data as KnifeUnknownRecord;
  if (e.source !== window || e.origin !== location.origin || data == null || typeof data !== "object" ||
    data.namespace !== "cheese-knife" || data.protocol !== 1) return;
  if (data.type === "config-request" && typeof data.requestId === "string" && data.requestId.length <= 100) {
    requestId = data.requestId;
    void requestLatestSettings();
  } else if (data.type === "status" && data.statuses && typeof data.statuses === "object") {
    const accepted: [string, { state: string; reason: string }][] = [];
    for (const [key, rawValue] of Object.entries(data.statuses)) {
      const value = rawValue as { state: unknown; reason?: unknown } | null;
      if (/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/.test(key) &&
        !['__proto__', 'prototype', 'constructor'].includes(key) && value &&
        ["pending", "ready", "limited", "failed", "disabled"].includes(value.state as string)) {
        accepted.push([key, { state: value.state as string, reason: typeof value.reason === "string" ? value.reason.slice(0, 80) : "" }]);
        if (accepted.length === 30) break;
      }
    }
    statuses = Object.fromEntries(accepted);
    const detail = data.diagnostics as KnifeUnknownRecord | undefined;
    diagnostics = detail?.world === "MAIN" ? detail : {};
    let node = document.getElementById("knife-status");
    if (!node) { node = document.createElement("script"); node.id = "knife-status"; (node as HTMLScriptElement).type = "application/json"; document.body.appendChild(node); }
    node.textContent = JSON.stringify({ statuses, diagnostics });
  }
};
window.addEventListener('message', onBridgeMessage);
const onStatusRequest = (message: unknown, _sender: chrome.runtime.MessageSender, respond: (value: unknown) => void) => {
  if ((message as { type?: unknown } | null)?.type === "cheese-knife-status") respond({ statuses, diagnostics });
};
chrome.runtime.onMessage.addListener(onStatusRequest);
const onSettingsChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
  if (['config', 'styleParameters', 'settingsRevision'].some(id => Object.hasOwn(changes, id))) {
    readEpoch++; void requestLatestSettings();
  }
};
// Subscribe before starting the first read; event payloads are never the settings authority.
chrome.storage.local.onChanged.addListener(onSettingsChanged);
const onPageShow = (event: PageTransitionEvent) => {
  if (!event.persisted || disposed) return;
  frozen = false; readEpoch++; void requestLatestSettings();
};
const onPageHide = (event: PageTransitionEvent) => {
  if (disposed) return;
  readEpoch++; reading = null; frozen = true;
  if (event.persisted) return;
  disposed = true;
  const failures: unknown[] = [];
  try {
    // Chrome records an extension error as soon as an invalidated API boundary
    // is touched, even when the resulting exception is caught below. The old
    // context has already released these listeners, so only detach them while
    // this content-script context still owns a runtime ID.
    if (chrome.runtime?.id) {
      for (const remove of [
        () => chrome.storage.local.onChanged.removeListener(onSettingsChanged),
        () => chrome.runtime.onMessage.removeListener(onStatusRequest),
      ]) {
        try { remove(); }
        catch (error) {
          // Invalidation can still race the runtime-ID check. Only that expected
          // teardown error is tolerated, never arbitrary faults.
          if ((error as { message?: unknown } | null)?.message !== 'Extension context invalidated.') failures.push(error);
        }
      }
    }
  } finally {
    window.removeEventListener('message', onBridgeMessage);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Extension listener cleanup failed');
};
window.addEventListener('pageshow', onPageShow);
window.addEventListener('pagehide', onPageHide);

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
].map(key => [key, chrome.i18n.getMessage(`content_${key}`)]));
const i18nScript = document.createElement("script");
i18nScript.id = "knife-i18n";
i18nScript.type = "application/json";
i18nScript.textContent = JSON.stringify(i18n);
document.body.appendChild(i18nScript);

const createSVGElement = <K extends keyof SVGElementTagNameMap>(name: K) =>
  document.createElementNS("http://www.w3.org/2000/svg", name);
const svg = createSVGElement("svg");
if (navigator.userAgent.includes("Firefox")) {
  svg.style.height = "0";
} else {
  svg.style.display = "none";
}

const filter = createSVGElement("filter");
filter.id = "knifeFilter";
svg.appendChild(filter);
document.body.appendChild(svg);

const setFilters = (config: Record<string, KnifeScalar>) => {
  const filters = [];
  for (const [f, v] of [["brightness", config.brightness as number], ["contrast", config.contrast as number], ["gamma", config.gamma as number]] as const) {
    if (isNaN(v) || v === 1) {
      continue;
    }
    const transfer = createSVGElement("feComponentTransfer");
    filters.push(transfer);

    for (const ff of ["feFuncR", "feFuncG", "feFuncB"] as const) {
      const func = createSVGElement(ff);
      switch (f) {
        case "brightness":
          func.setAttribute("type", "linear");
          func.slope.baseVal = v;
          break;
        case "contrast":
          func.setAttribute("type", "linear");
          func.slope.baseVal = v;
          func.intercept.baseVal = -v / 2 + 0.5;
          break;
        case "gamma":
          func.setAttribute("type", "gamma");
          func.exponent.baseVal = v;
          break;
      }
      transfer.appendChild(func);
    }
  }

  const sat = config.saturation as number;
  if (!isNaN(sat) && sat !== 1) {
    const color = createSVGElement("feColorMatrix");
    color.setAttribute("type", "saturate");
    const v = svg.createSVGNumber();
    v.value = sat;
    color.values.baseVal.initialize(v);
    filters.push(color);
  }

  const s = config.sharpness as number;
  if (s > 0) {
    const v = Number((s / 5).toFixed(2));
    const conv = createSVGElement("feConvolveMatrix");
    conv.preserveAlpha.baseVal = true;
    conv.setAttribute(
      "kernelMatrix",
      `0 ${-v} 0 ${-v} ${1 + v * 4} ${-v} 0 ${-v} 0`
    );
    filters.push(conv);
  }
  filter.replaceChildren(...filters);
  if (filters.length) {
    document.body.classList.add("knife-filter");
  } else {
    document.body.classList.remove("knife-filter");
  }
};
void requestLatestSettings();
