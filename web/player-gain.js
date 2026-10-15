// Generated from src/settings/player-gain.ts by scripts/settings-runtime.mjs. Do not edit.
(() => {
  if (window.top !== window || chrome.extension?.inIncognitoContext !== false) return;
  const registry = /* @__PURE__ */ Symbol.for("cheese-knife.player-gain.private.v3");
  if (Object.getOwnPropertyDescriptor(globalThis, registry)) return;
  let current = null, main = null, frozen = false, disposed = false;
  let blocked = null;
  const cancels = /* @__PURE__ */ new Set();
  const own = (value, key) => value && typeof value === "object" ? Object.getOwnPropertyDescriptor(value, key)?.value : void 0;
  const fault = (code) => Object.assign(new Error(code), { code });
  function discover() {
    if (!/^\/(?:live\/[a-f0-9]{32}|[a-f0-9]{32}|video\/\d+)\/?$/i.test(location.pathname)) return null;
    const candidates = [...document.querySelectorAll(".pzp-pc")].filter((node) => !node.closest(".knife-preview,.knife-popup"));
    if (candidates.length !== 1) return null;
    const pzp = candidates[0], videos = pzp.querySelectorAll(".pzp-pc__video video"), volumes = pzp.querySelectorAll(".pzp-pc__volume-control:not(.knife-comp)");
    const video = videos[0], container = volumes[0]?.parentElement;
    if (videos.length !== 1 || volumes.length !== 1 || !(video instanceof HTMLVideoElement) || !container || video.mediaKeys) return null;
    try {
      if (!video.currentSrc.startsWith("blob:") || new URL(video.currentSrc).origin !== location.origin) return null;
    } catch {
      return null;
    }
    return { pzp, container, video, source: video.currentSrc };
  }
  function owned(owner) {
    if (disposed || frozen || current !== owner || owner.retired || owner.path !== location.pathname || !owner.host.isConnected || owner.host.parentElement !== owner.container || owner.root.host !== owner.host || owner.range.getRootNode() !== owner.root) return false;
    const site = discover();
    return !!site && site.video === owner.video && site.pzp === owner.pzp && site.container === owner.container && site.source === owner.source;
  }
  function legacyValue() {
    try {
      const raw = localStorage.getItem("knifeGain");
      if (raw === null || !raw.trim()) return 1;
      const value = raw.length <= 64 ? Number(raw) : NaN;
      return Number.isFinite(value) && value >= 0 && value <= 2 ? value : null;
    } catch {
      return null;
    }
  }
  const phases = {
    loading: "\uD655\uC778 \uC911",
    ready: "\uC800\uC7A5\uB428",
    preparing: "\uC900\uBE44 \uC911",
    saving: "\uC800\uC7A5 \uC911",
    hold: "\uD655\uC778 \uC911",
    failed: "\uBBF8\uC800\uC7A5",
    unknown: "\uACB0\uACFC \uBD88\uBA85",
    conflict: "\uCDA9\uB3CC",
    retired: "\uC81C\uD55C"
  };
  function render(owner) {
    owner.host.dataset.phase = owner.phase;
    owner.recover.hidden = !["failed", "unknown", "conflict"].includes(owner.phase);
    const value = owner.draft ?? owner.intent?.value ?? owner.view?.value;
    if (typeof value === "number") {
      owner.range.value = String(value);
      owner.range.title = `${(value * 100).toFixed(2)}%`;
    }
    owner.range.disabled = !owned(owner) || owner.view?.value === null || !["ready", "preparing", "saving"].includes(owner.phase);
    const scope = owner.view?.scope === "channel" ? "\uCC44\uB110 \uC800\uC7A5" : "\uC804\uC5ED \uC800\uC7A5";
    owner.range.setAttribute("aria-description", owner.view?.scope === "channel" ? "\uD604\uC7AC \uCC44\uB110\uC5D0 Gain\uB9CC \uC800\uC7A5\uD569\uB2C8\uB2E4. \uC0C1\uC18D \uC0C1\uD0DC\uC758 \uC9C1\uC811 \uC870\uC791\uC740 \uCC44\uB110 \uC18C\uC720\uAC12\uC73C\uB85C \uC804\uD658\uD569\uB2C8\uB2E4." : "\uC804\uC5ED Gain\uC744 \uC800\uC7A5\uD558\uBA70 \uC804\uC5ED \uAC12\uC774\uB098 \uC804\uC5ED Gain\uC744 \uC0C1\uC18D\uD558\uB294 \uB2E4\uB978 \uD0ED\uC5D0\uB3C4 \uBC18\uC601\uB429\uB2C8\uB2E4.");
    const state = owner.phase === "ready" && owner.view?.origin === "site-legacy" ? "\uAE30\uC874 \uAC12" : owner.phase === "ready" && owner.view?.scope === "channel" && owner.view.inherited ? "\uC0C1\uC18D" : Object.getOwnPropertyDescriptor(phases, owner.phase)?.value;
    owner.badge.textContent = `${scope} \xB7 ${state}`;
    owner.range.setAttribute("aria-label", `Gain \xB7 ${scope}`);
    owner.host.hidden = !["on", "pending"].includes(owner.pzp.querySelector(".knife-comp")?.getAttribute("data-state") ?? "");
    owner.host.style.display = owner.host.hidden ? "none" : "inline-flex";
  }
  function preview(owner, value) {
    if (!owned(owner) || !main || main.context.routePath !== owner.path) return;
    window.postMessage({
      namespace: "cheese-knife",
      protocol: 3,
      type: "gain-preview",
      requestId: main.requestId,
      context: { ...main.context },
      audioBindingGeneration: main.binding,
      value
    }, location.origin);
  }
  function validView(value) {
    if (!value || typeof value !== "object") return false;
    const record = value, version = record.version;
    return record.ok === true && typeof record.ticket === "string" && /^[a-zA-Z0-9:_-]{1,128}$/.test(record.ticket) && typeof record.workerEpoch === "string" && record.workerEpoch.length <= 128 && KnifeMediaProfiles.isCounter(record.gainEpoch) && typeof record.cold === "boolean" && ["global", "channel"].includes(record.scope) && ["site-legacy", "global-owned", "channel-owned"].includes(record.origin) && typeof record.inherited === "boolean" && typeof record.storedValue === "number" && Number.isFinite(record.storedValue) && record.storedValue >= 0 && record.storedValue <= 2 && (record.value === null || typeof record.value === "number" && Number.isFinite(record.value) && record.value >= 0 && record.value <= 2) && !!version && KnifeMediaProfiles.isCounter(version.globalRevision) && KnifeMediaProfiles.isCounter(version.mediaRevision) && (record.channelId === null || KnifeMediaProfiles.isChannelId(record.channelId));
  }
  function sameBasis(before, after) {
    return before.scope === after.scope && before.channelId === after.channelId && JSON.stringify(before.token) === JSON.stringify(after.token) && before.origin === after.origin && before.value === after.value && before.storedValue === after.storedValue && before.inherited === after.inherited && (after.cold || before.workerEpoch !== after.workerEpoch ? before.version.globalRevision === after.version.globalRevision && before.version.mediaRevision === after.version.mediaRevision : before.gainEpoch === after.gainEpoch);
  }
  function request(owner, action, deadline, intent) {
    return new Promise((resolve, reject) => {
      let ended = false;
      const finish = (error, response) => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        cancels.delete(cancel);
        if (error) reject(fault(error));
        else resolve(response);
      };
      const cancel = () => finish("gain-retired");
      const remaining = deadline - Date.now();
      const timer = setTimeout(() => finish(action === "set-gain" ? "gain-unknown" : "gain-prepare-failed"), Math.max(0, remaining));
      cancels.add(cancel);
      if (remaining <= 0 || !owned(owner) || !chrome.runtime?.id) {
        finish("gain-retired");
        return;
      }
      const requestId = crypto.randomUUID();
      const message = {
        namespace: "cheese-knife-player-gain",
        protocol: 3,
        action,
        requestId,
        ...intent ? { ticket: owner.view.ticket, intentId: intent.id, value: intent.value } : {}
      };
      try {
        chrome.runtime.sendMessage(message, (reply) => {
          if (ended) return;
          if (chrome.runtime.lastError) {
            finish(action === "set-gain" ? "gain-unknown" : "gain-prepare-failed");
            return;
          }
          if (!reply || typeof reply !== "object" || own(reply, "requestId") !== requestId || own(reply, "protocol") !== 3 || typeof own(reply, "ok") !== "boolean") {
            finish(action === "set-gain" ? "gain-unknown" : "gain-prepare-failed");
            return;
          }
          finish(null, reply);
        });
      } catch {
        finish(action === "set-gain" ? "gain-unknown" : "gain-prepare-failed");
      }
    });
  }
  async function refresh(owner, compare, deadline = Date.now() + 5e3) {
    if (!owned(owner)) throw fault("gain-retired");
    const before = owner.view;
    do {
      owner.notified = false;
      const reply = await request(owner, "get-gain-view", deadline);
      if (!owned(owner)) throw fault("gain-retired");
      if (reply.ok !== true || !validView(reply.view)) throw fault(typeof reply.code === "string" ? reply.code : "gain-prepare-failed");
      if (owner.notified) continue;
      if (compare && before && !sameBasis(before, reply.view)) throw fault("gain-conflict");
      owner.view = reply.view;
      if (reply.view.value === null) throw fault("gain-legacy-unavailable");
      if (owner.draft === null) preview(owner, reply.view.value);
      render(owner);
      return;
    } while (true);
  }
  function clearTimer(owner) {
    if (owner.timer !== null) clearTimeout(owner.timer);
    owner.timer = null;
  }
  function failed(owner, error) {
    if (owner.retired || current !== owner) return;
    const code = own(error, "code");
    owner.phase = code === "gain-unknown" ? "unknown" : code === "gain-conflict" || code === "gain-context-changed" ? "conflict" : "failed";
    clearTimer(owner);
    owner.intent = null;
    owner.preparing = null;
    render(owner);
  }
  function prepare(owner) {
    if (!owned(owner) || owner.inflight || owner.draft !== null || !["ready", "loading"].includes(owner.phase) || owner.preparing) return;
    owner.deadline = Date.now() + 5e3;
    owner.phase = "preparing";
    owner.preparing = refresh(owner, true, owner.deadline).then(async () => {
      if (owner.notified) {
        owner.notified = false;
        await refresh(owner, true, owner.deadline);
      }
      if (!owned(owner)) return;
      owner.preparing = null;
      owner.phase = "ready";
      render(owner);
      if (owner.draft !== null) schedule(owner);
    }).catch((error) => failed(owner, error));
    render(owner);
  }
  function schedule(owner, ending = false) {
    clearTimer(owner);
    if (!owned(owner) || owner.inflight || owner.preparing || owner.draft === null || !["ready", "saving"].includes(owner.phase)) return;
    const delay = Math.max(ending ? 0 : 250, 250 - (Date.now() - owner.lastFinished));
    owner.timer = setTimeout(() => {
      owner.timer = null;
      void commit(owner);
    }, delay);
  }
  async function commit(owner) {
    if (!owned(owner) || owner.inflight || owner.preparing || owner.draft === null || !owner.view || !["ready", "saving"].includes(owner.phase)) return;
    if (Date.now() > owner.deadline) {
      failed(owner, fault("gain-prepare-failed"));
      return;
    }
    const value = owner.draft;
    owner.inflight = true;
    owner.phase = "saving";
    owner.draft = null;
    owner.intent = { id: crypto.randomUUID(), value };
    const intent = owner.intent;
    render(owner);
    try {
      const reply = await request(owner, "set-gain", owner.deadline, intent);
      if (!owned(owner) || owner.intent !== intent) return;
      if (reply.ok !== true) throw fault(typeof reply.code === "string" ? reply.code : "gain-unknown");
      if (reply.stored !== true || reply.intentId !== intent.id || !validView(reply.view) || reply.view.value !== value || reply.view.inherited !== false || reply.view.scope !== owner.view.scope || reply.view.channelId !== owner.view.channelId || JSON.stringify(reply.view.token) !== JSON.stringify(owner.view.token) || reply.view.workerEpoch !== owner.view.workerEpoch || reply.view.gainEpoch < owner.view.gainEpoch || reply.view.origin !== (owner.view.scope === "channel" ? "channel-owned" : "global-owned")) throw fault("gain-unknown");
      owner.view = reply.view;
      owner.intent = null;
      owner.lastFinished = Date.now();
      owner.phase = "ready";
      if (owner.notified) {
        owner.notified = false;
        await refresh(owner, true, Date.now() + 5e3);
      }
      if (!owned(owner)) return;
      if (owner.draft !== null) {
        owner.deadline = Date.now() + 5e3;
        schedule(owner, true);
      }
    } catch (error) {
      if (owned(owner)) {
        owner.draft ??= value;
        failed(owner, error);
      }
    } finally {
      owner.inflight = false;
      if (owned(owner)) {
        render(owner);
        if (owner.phase === "ready" && owner.draft !== null) schedule(owner, true);
      }
    }
  }
  function retire(owner, block = false) {
    clearTimer(owner);
    owner.retired = true;
    owner.phase = "retired";
    owner.intent = null;
    if (block) blocked = { video: owner.video, path: owner.path, source: owner.source };
    owner.range.disabled = true;
    render(owner);
    owner.host.remove();
  }
  function create(site) {
    const host = document.createElement("span");
    host.className = "knife-owned knife-gain-owner";
    host.style.cssText = "display:inline-flex;position:relative;align-items:center;margin-right:8px";
    const root = host.attachShadow({ mode: "closed" }), style = document.createElement("style");
    style.textContent = ":host{font:inherit;color:inherit}input{width:48px;margin:0;accent-color:#287aff}small{position:absolute;top:100%;left:50%;transform:translateX(-50%);font:9px sans-serif;white-space:nowrap}button{font:9px sans-serif}";
    const range = document.createElement("input");
    range.type = "range";
    range.min = "0";
    range.max = "2";
    range.step = "0.05";
    range.disabled = true;
    const badge = document.createElement("small");
    badge.setAttribute("aria-live", "polite");
    const recover = document.createElement("button");
    recover.type = "button";
    recover.textContent = "\uD3D0\uAE30/\uC7AC\uC870\uD68C";
    recover.hidden = true;
    root.append(style, range, badge, recover);
    site.container.append(host);
    const owner = {
      ...site,
      host,
      root,
      range,
      badge,
      recover,
      path: location.pathname,
      id: crypto.randomUUID(),
      retired: false,
      phase: "loading",
      view: null,
      draft: null,
      intent: null,
      preparing: null,
      inflight: false,
      notified: false,
      lastFinished: -Infinity,
      timer: null,
      deadline: 0,
      dirtyGesture: false
    };
    const input = (event) => {
      event.stopPropagation();
      if (!event.isTrusted || event.target !== range || !owned(owner) || range.disabled || !owner.dirtyGesture || !["ready", "preparing", "saving"].includes(owner.phase)) return;
      const value = Number(range.value);
      if (!Number.isFinite(value) || value < 0 || value > 2) return;
      if (!owner.inflight && owner.draft === null && !owner.preparing) prepare(owner);
      owner.draft = value;
      preview(owner, value);
      render(owner);
      schedule(owner, event.type === "change");
    };
    range.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      if (event.isTrusted && owned(owner)) {
        owner.dirtyGesture = true;
        prepare(owner);
      }
    });
    range.addEventListener("focus", (event) => {
      if (event.isTrusted && owned(owner)) prepare(owner);
    });
    range.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.isTrusted && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key) && owned(owner)) {
        owner.dirtyGesture = true;
        prepare(owner);
      }
    });
    range.addEventListener("input", input);
    range.addEventListener("change", input);
    range.addEventListener("pointerup", (event) => {
      event.stopPropagation();
      if (event.isTrusted) schedule(owner, true);
    });
    range.addEventListener("keyup", (event) => {
      event.stopPropagation();
      if (event.isTrusted) schedule(owner, true);
    });
    range.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (!event.isTrusted || !owned(owner) || range.disabled || !["ready", "preparing"].includes(owner.phase)) return;
      owner.dirtyGesture = true;
      prepare(owner);
      owner.draft = 1;
      preview(owner, 1);
      render(owner);
      schedule(owner, true);
    });
    recover.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!event.isTrusted || !owned(owner) || owner.inflight) return;
      clearTimer(owner);
      owner.draft = null;
      owner.intent = null;
      owner.dirtyGesture = false;
      owner.phase = "loading";
      owner.preparing = refresh(owner, false).then(() => {
        if (owned(owner)) {
          owner.preparing = null;
          owner.lastFinished = Date.now();
          owner.phase = "ready";
          render(owner);
        }
      }).catch((error) => failed(owner, error));
    });
    return owner;
  }
  function reconcile() {
    if (disposed || frozen) return;
    const site = discover(), previous = current;
    if (previous && !previous.retired) {
      if (!site || site.video !== previous.video || site.source !== previous.source || previous.path !== location.pathname) retire(previous);
      else if (previous.host.parentElement !== previous.container) {
        retire(previous, true);
        return;
      } else if (site.pzp !== previous.pzp || site.container !== previous.container) {
        const locked = ["failed", "unknown", "conflict"].includes(previous.phase);
        if (!locked) previous.phase = "hold";
        clearTimer(previous);
        previous.pzp = site.pzp;
        previous.container = site.container;
        site.container.append(previous.host);
        previous.notified = true;
        render(previous);
        if (locked || previous.inflight || previous.preparing) return;
        previous.notified = false;
        previous.preparing = refresh(previous, true).then(() => {
          if (owned(previous)) {
            previous.preparing = null;
            previous.phase = "ready";
            render(previous);
            schedule(previous);
          }
        }).catch((error) => failed(previous, error));
        return;
      } else {
        render(previous);
        return;
      }
    }
    if (!site || blocked && blocked.video === site.video && blocked.path === location.pathname && blocked.source === site.source) return;
    blocked = null;
    current = create(site);
    const owner = current;
    owner.preparing = refresh(owner, false).then(async () => {
      if (owner.notified) {
        owner.notified = false;
        await refresh(owner, false);
      }
      if (owned(owner)) {
        owner.preparing = null;
        owner.phase = "ready";
        render(owner);
      }
    }).catch((error) => failed(owner, error));
  }
  Object.defineProperty(globalThis, registry, { configurable: true, get: () => current ? {
    url: location.href,
    owned: owned(current),
    bindingId: current.id,
    legacyValue: legacyValue(),
    intent: owned(current) ? current.intent : null
  } : null });
  const onMessage = (event) => {
    if (event.source !== window || event.origin !== location.origin || own(event.data, "namespace") !== "cheese-knife" || own(event.data, "protocol") !== 3) return;
    const type = own(event.data, "type");
    if (type !== "config" && type !== "config-request") return;
    if (type === "config") {
      const context = own(event.data, "context"), requestId = own(event.data, "requestId"), binding = own(event.data, "audioBindingGeneration");
      const path = own(context, "routePath"), documentGeneration = own(context, "documentGeneration"), playerGeneration = own(context, "playerGeneration"), channelId = own(context, "channelId");
      if (path === location.pathname && KnifeMediaProfiles.isCounter(documentGeneration) && documentGeneration > 0 && KnifeMediaProfiles.isCounter(playerGeneration) && (channelId === null || KnifeMediaProfiles.isChannelId(channelId)) && typeof requestId === "string" && requestId.length > 0 && requestId.length <= 128 && KnifeMediaProfiles.isCounter(binding))
        main = { context: { documentGeneration, routePath: path, channelId, playerGeneration }, requestId, binding };
    }
    reconcile();
    if (current && owned(current) && current.draft !== null) preview(current, current.draft);
  };
  const onStorage = (changes, area) => {
    if (area !== "local" || !["config", "settingsRevision", "mediaProfiles"].some((key) => Object.hasOwn(changes, key)) || !current || !owned(current)) return;
    const owner = current;
    if (owner.phase === "loading") {
      owner.notified = true;
      return;
    }
    if (owner.inflight) {
      owner.notified = true;
      return;
    }
    if (owner.draft !== null || owner.preparing) {
      owner.notified = true;
      return;
    }
    if (owner.phase === "ready") {
      owner.phase = "loading";
      render(owner);
      owner.preparing = refresh(owner, false).then(() => {
        if (owned(owner)) {
          owner.preparing = null;
          owner.phase = "ready";
          render(owner);
        }
      }).catch((error) => failed(owner, error));
    }
  };
  const observer = new MutationObserver(reconcile);
  const navigation = Reflect.get(window, "navigation");
  const onNavigate = () => {
    if (current) retire(current);
    current = null;
    main = null;
    queueMicrotask(reconcile);
  };
  const onHide = (event) => {
    frozen = true;
    if (current) retire(current);
    for (const cancel of [...cancels]) cancel();
    if (event.persisted) return;
    disposed = true;
    observer.disconnect();
    Reflect.deleteProperty(globalThis, registry);
    if (chrome.runtime?.id) chrome.storage.onChanged.removeListener(onStorage);
    window.removeEventListener("message", onMessage);
    window.removeEventListener("popstate", reconcile);
    window.removeEventListener("pageshow", onShow);
    window.removeEventListener("pagehide", onHide);
    navigation?.removeEventListener("navigate", onNavigate);
  };
  const onShow = () => {
    if (!disposed) {
      frozen = false;
      blocked = null;
      reconcile();
    }
  };
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
  window.addEventListener("message", onMessage);
  window.addEventListener("popstate", reconcile);
  window.addEventListener("pageshow", onShow);
  window.addEventListener("pagehide", onHide);
  chrome.storage.onChanged.addListener(onStorage);
  reconcile();
  navigation?.addEventListener("navigate", onNavigate);
})();
