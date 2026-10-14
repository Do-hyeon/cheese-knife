// Generated from src/main/runtime/entry.ts by scripts/main-runtime.mjs. Do not edit.
"use strict";
(() => {
  // src/main/runtime/bridge.ts
  function ordinaryRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    try {
      const prototype = Object.getPrototypeOf(value);
      if (prototype === null) return true;
      const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor");
      return Object.getPrototypeOf(prototype) === null && constructor !== void 0 && "value" in constructor && typeof constructor.value === "function" && Object.getOwnPropertyDescriptor(constructor.value, "name")?.value === "Object";
    } catch {
      return false;
    }
  }
  function ownValue(record, key) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && "value" in descriptor ? descriptor.value : void 0;
  }
  function copyRecord(value, stringsOnly) {
    if (!ordinaryRecord(value)) return null;
    const output = {};
    try {
      for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor)) return null;
        if (!stringsOnly || typeof descriptor.value === "string") {
          Object.defineProperty(output, key, { enumerable: true, configurable: true, writable: true, value: descriptor.value });
        }
      }
    } catch {
      return null;
    }
    return output;
  }
  function readScopedConfigEnvelope(event, expected) {
    const exact = (value, keys) => {
      if (!ordinaryRecord(value) || Reflect.ownKeys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) return null;
      return copyRecord(value, false);
    };
    try {
      const data = exact(event.data, [
        "namespace",
        "protocol",
        "type",
        "requestId",
        "context",
        "deliverySequence",
        "baseConfig",
        "effectiveConfig",
        "i18n",
        "version",
        "profileState",
        "revisionStatus",
        "mediaPhase",
        "audioBindingGeneration",
        "audioKind",
        "videoKind"
      ]);
      if (!data || data.namespace !== "cheese-knife" || data.protocol !== 2 || data.type !== "config" || typeof data.requestId !== "string" || !data.requestId.length || data.requestId.length > 128 || !KnifeMediaProfiles.isCounter(data.deliverySequence) || !KnifeMediaProfiles.isCounter(data.audioBindingGeneration)) return null;
      const context = exact(data.context, ["documentGeneration", "routePath", "channelId", "playerGeneration"]);
      if (!context || !KnifeMediaProfiles.isCounter(context.documentGeneration) || context.documentGeneration < 1 || !KnifeMediaProfiles.isCounter(context.playerGeneration) || typeof context.routePath !== "string" || context.routePath.charCodeAt(0) !== 47 || context.routePath.length > 2048 || context.channelId !== null && !KnifeMediaProfiles.isChannelId(context.channelId) || context.documentGeneration !== expected.documentGeneration || context.routePath !== expected.routePath || context.channelId !== expected.channelId || context.playerGeneration !== expected.playerGeneration) return null;
      const baseConfig = copyRecord(data.baseConfig, false), effectiveConfig = copyRecord(data.effectiveConfig, false);
      const scalars = (record) => !!record && Reflect.ownKeys(record).length <= 128 && Object.values(record).every((value) => typeof value === "boolean" || typeof value === "number" && Number.isFinite(value));
      if (!scalars(baseConfig) || !scalars(effectiveConfig)) return null;
      const mediaFields = new Set([...KnifeMediaProfiles.audioFields, ...KnifeMediaProfiles.videoFields].map((field) => field.id));
      for (const config of [baseConfig, effectiveConfig]) for (const domain of ["audio", "video"]) {
        const fields = domain === "audio" ? KnifeMediaProfiles.audioFields : KnifeMediaProfiles.videoFields;
        if (!KnifeMediaProfiles.validateValues(domain, Object.fromEntries(fields.map((field) => [field.id, ownValue(config, field.id)]))).ok) return null;
      }
      if (Object.keys(baseConfig).length !== Object.keys(effectiveConfig).length || !Object.entries(baseConfig).every(([key, value]) => Object.hasOwn(effectiveConfig, key) && (mediaFields.has(key) || Object.is(value, ownValue(effectiveConfig, key))))) return null;
      const version = exact(data.version, ["globalRevision", "mediaRevision"]);
      if (!version || version.globalRevision !== null && !(KnifeMediaProfiles.isCounter(version.globalRevision) && version.globalRevision < Number.MAX_SAFE_INTEGER) || version.mediaRevision !== null && !KnifeMediaProfiles.isCounter(version.mediaRevision) || !["ready", "repair-required"].includes(data.revisionStatus) || version.globalRevision === null !== (data.revisionStatus === "repair-required") || !["global", "scoped", "repair-required"].includes(data.profileState) || !["pending", "ready", "limited"].includes(data.mediaPhase) || !["global", "channel"].includes(data.audioKind) || !["global", "channel"].includes(data.videoKind)) return null;
      const scoped = data.audioKind === "channel" || data.videoKind === "channel";
      if (scoped && !context.channelId || data.profileState === "scoped" !== scoped || data.profileState === "repair-required" && data.mediaPhase !== "limited" || data.mediaPhase === "ready" && version.mediaRevision === null || data.mediaPhase === "pending" && (scoped || !Object.entries(baseConfig).every(([key, value]) => Object.is(value, ownValue(effectiveConfig, key))))) return null;
      const i18n = copyRecord(data.i18n, true);
      if (!i18n || Object.keys(i18n).length > 64) return null;
      return {
        requestId: data.requestId,
        context,
        deliverySequence: data.deliverySequence,
        baseConfig,
        effectiveConfig,
        i18n,
        version,
        profileState: data.profileState,
        revisionStatus: data.revisionStatus,
        mediaPhase: data.mediaPhase,
        audioBindingGeneration: data.audioBindingGeneration,
        audioKind: data.audioKind,
        videoKind: data.videoKind
      };
    } catch {
      return null;
    }
  }

  // src/main/runtime/lifecycle.ts
  var interesting = 'video, button, section, aside, [role="tablist"]';
  function createLifecycle(runtime, environment) {
    const cleanups = [];
    let observer = null;
    let revision = -1, attempts = 0, frame = null, pulse = null, requestTimer = null;
    let started = false, suspended = false, disposed = false;
    const clearRequest = () => {
      if (requestTimer !== null) environment.clearTimeout(requestTimer);
      requestTimer = null;
    };
    const clearPulse = () => {
      if (pulse !== null) environment.clearInterval(pulse);
      pulse = null;
    };
    const clearFrame = () => {
      if (frame !== null) environment.cancelAnimationFrame(frame);
      frame = null;
    };
    const on = (target, type, listener) => {
      target.addEventListener(type, listener);
      cleanups.push(() => target.removeEventListener(type, listener));
    };
    const requestConfig = () => {
      if (disposed || suspended || runtime.media.phase !== "pending" || requestTimer !== null) return;
      if (runtime.media.context.routePath !== environment.location.pathname) {
        runtime.reconcile();
        return;
      }
      if (attempts++ >= 20) {
        runtime.setStatus("configuration", runtime.configReady ? "ready" : "limited", runtime.configReady ? "" : "config-unavailable");
        runtime.setStatus("mediaSettings", "limited", runtime.configReady ? "scoped-config-unavailable" : "reload-required");
        if (runtime.configReady) {
          runtime.media = {
            ...runtime.media,
            phase: "limited",
            version: { globalRevision: null, mediaRevision: null },
            profileState: "global",
            revisionStatus: "repair-required",
            audioBindingGeneration: 0,
            audioKind: "global",
            videoKind: "global"
          };
          runtime.config = { ...runtime.baseConfig };
          runtime.notify();
        }
        return;
      }
      environment.window.postMessage({
        namespace: "cheese-knife",
        protocol: 2,
        type: "config-request",
        requestId: runtime.mediaRequestId,
        context: { ...runtime.media.context }
      }, environment.location.origin);
      requestTimer = environment.setTimeout(() => {
        requestTimer = null;
        requestConfig();
      }, 100);
    };
    const startPulse = () => {
      clearPulse();
      if (!disposed && !suspended && !environment.document.hidden) pulse = environment.setInterval(() => {
        if (runtime.state.route?.path !== environment.location.pathname) runtime.reconcile();
      }, 1e3);
    };
    const freeze = () => {
      suspended = true;
      clearPulse();
      clearRequest();
      clearFrame();
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      freeze();
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup();
        } catch {
        }
      }
      cleanups.length = 0;
      observer = null;
    };
    const schedule = () => {
      if (disposed || suspended || frame !== null) return;
      frame = environment.requestAnimationFrame(() => {
        frame = null;
        if (!disposed && !suspended) runtime.reconcile();
      });
    };
    const onMessage = (event) => {
      const message = event;
      if (disposed || suspended || message.source !== environment.window || message.origin !== environment.location.origin) return;
      try {
        if (!message.data || typeof message.data !== "object" || Object.getOwnPropertyDescriptor(message.data, "protocol")?.value !== 2 || Object.getOwnPropertyDescriptor(message.data, "type")?.value !== "config") return;
      } catch {
        return;
      }
      runtime.reconcile();
      const envelope = readScopedConfigEnvelope(message, runtime.media.context);
      if (!envelope || envelope.requestId !== runtime.mediaRequestId || envelope.deliverySequence <= revision) return;
      revision = envelope.deliverySequence;
      runtime.baseConfig = envelope.baseConfig;
      runtime.config = envelope.effectiveConfig;
      runtime.media = {
        context: envelope.context,
        phase: envelope.mediaPhase,
        version: envelope.version,
        profileState: envelope.profileState,
        revisionStatus: envelope.revisionStatus,
        audioBindingGeneration: envelope.audioBindingGeneration,
        audioKind: envelope.audioKind,
        videoKind: envelope.videoKind
      };
      runtime.i18n = envelope.i18n;
      runtime.configReady = true;
      if (runtime.media.phase !== "pending") clearRequest();
      runtime.setStatus("configuration", "ready");
      runtime.setStatus(
        "mediaSettings",
        runtime.media.phase === "ready" ? "ready" : runtime.media.phase === "pending" ? "pending" : "limited",
        runtime.media.phase === "ready" ? "" : runtime.media.phase === "pending" ? "scoped-config-pending" : "profile-limited"
      );
      runtime.reconcile();
    };
    const onMutations = (mutations) => {
      if (runtime.state.player && !runtime.state.player.pzp.isConnected) {
        schedule();
        return;
      }
      for (const mutation of mutations) {
        const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (target?.closest?.(".knife-owned")) continue;
        const changed = [...mutation.addedNodes, ...mutation.removedNodes];
        for (const node of changed) {
          if (node.nodeType !== 1) continue;
          const element = node;
          if (element.classList?.contains("knife-owned") || element.closest?.(".knife-owned")) continue;
          let siteChange = false;
          try {
            siteChange = runtime.adapter?.affectsDiscovery(element, target || void 0) === true;
          } catch {
          }
          if (siteChange || element.matches?.(interesting) || element.querySelector?.(interesting)) {
            schedule();
            return;
          }
        }
      }
    };
    return {
      start() {
        if (started || disposed) return;
        started = true;
        observer = new environment.MutationObserver(onMutations);
        cleanups.push(() => observer?.disconnect());
        on(environment.window, "message", onMessage);
        on(environment.document, "visibilitychange", () => {
          startPulse();
          runtime.reconcile();
          if (!environment.document.hidden) {
            runtime.revalidateMedia();
            runtime.notify();
          }
        });
        on(environment.window, "popstate", () => runtime.reconcile());
        on(environment.window, "pageshow", () => {
          if (disposed) return;
          suspended = false;
          startPulse();
          runtime.reconcile();
          runtime.revalidateMedia();
          runtime.notify();
        });
        on(environment.window, "pagehide", (event) => {
          if (event.persisted) {
            const video = runtime.state.player?.video;
            if (video) runtime.audio?.suspend(video);
            freeze();
            return;
          }
          dispose();
          environment.onFinal();
        });
        observer.observe(environment.document.documentElement, { childList: true, subtree: true });
        runtime.reconcile();
        startPulse();
        requestConfig();
      },
      schedule,
      dispose,
      requestMedia() {
        clearRequest();
        attempts = 0;
        revision = -1;
        requestConfig();
      }
    };
  }

  // src/main/runtime/route.ts
  var excluded = /^\/(?:chat|donation|video-donation|mission-donation|party-donation|gift-effect|product-purchase|embed|error|subs_integration|event|partner|clip-editor|account-interlock|watchparty-source|prime|settings|broadcast-information|close)(?:\/|$)/;
  function parseRoute(pathname) {
    if (excluded.test(pathname) || /\/profile\//.test(pathname)) return { kind: "excluded", path: pathname };
    const live = pathname.match(/^\/live\/([a-f0-9]{32})(?:\/chat)?\/?$/i);
    if (live?.[1]) return { kind: "live", id: live[1], path: pathname };
    const vod = pathname.match(/^\/video\/(\d+)\/?$/);
    if (vod?.[1]) return { kind: "vod", id: vod[1], path: pathname };
    const channel = pathname.match(/^\/([a-f0-9]{32})(?:\/(?:videos|clips|community))?\/?$/i);
    return channel?.[1] ? { kind: "channel", id: channel[1], path: pathname } : { kind: "explore", path: pathname };
  }

  // src/main/runtime/scope.ts
  function createResourceScope(environment) {
    const cleanups = /* @__PURE__ */ new Set();
    const controller = new environment.AbortController();
    const scope = {
      signal: controller.signal,
      disposed: false,
      add(cleanup) {
        if (scope.disposed) {
          try {
            cleanup();
          } catch {
          }
        } else cleanups.add(cleanup);
        return cleanup;
      },
      on(target, type, listener, options) {
        if (scope.disposed) return;
        target.addEventListener(type, listener, options);
        scope.add(() => target.removeEventListener(type, listener, options));
      },
      timeout(callback, delay) {
        if (scope.disposed) return 0;
        let id = 0;
        const clear = () => environment.clearTimeout(id);
        id = environment.setTimeout(() => {
          cleanups.delete(clear);
          if (!scope.disposed) callback();
        }, delay);
        scope.add(clear);
        return id;
      },
      interval(callback, delay) {
        if (scope.disposed) return 0;
        const id = environment.setInterval(() => {
          if (!scope.disposed) callback();
        }, delay);
        scope.add(() => environment.clearInterval(id));
        return id;
      },
      observe(observer, target, options) {
        if (scope.disposed) {
          observer.disconnect();
          return;
        }
        observer.observe(target, options);
        scope.add(() => observer.disconnect());
      },
      dispose() {
        if (scope.disposed) return;
        scope.disposed = true;
        try {
          controller.abort();
        } catch {
        }
        for (const cleanup of [...cleanups].reverse()) {
          try {
            cleanup();
          } catch {
          }
        }
        cleanups.clear();
      }
    };
    return scope;
  }

  // src/main/runtime/status.ts
  var reserved = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
  function createStatusStore(post, diagnostics) {
    const statuses = {};
    const transitions = [];
    return {
      statuses,
      transitions,
      setStatus(feature, state, reason = "") {
        if (!/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/.test(feature) || reserved.has(feature) || !["pending", "ready", "limited", "failed", "disabled"].includes(state)) return;
        const normalizedReason = typeof reason === "string" ? reason.slice(0, 80) : "";
        const current = Object.getOwnPropertyDescriptor(statuses, feature)?.value;
        if (current?.state === state && current.reason === normalizedReason) return;
        const value = { state, reason: normalizedReason };
        Object.defineProperty(statuses, feature, { configurable: true, enumerable: true, writable: true, value });
        transitions.push({ feature, ...value });
        if (transitions.length > 20) transitions.shift();
        post({ namespace: "cheese-knife", protocol: 1, type: "status", statuses: { ...statuses }, diagnostics: diagnostics() });
      }
    };
  }

  // src/main/runtime/entry.ts
  var registryName = "cheese-knife.runtime.v1";
  function installRuntime(target) {
    const browser = target;
    const key = browser.Symbol.for(registryName);
    if (Object.getOwnPropertyDescriptor(target, key)?.value) return null;
    const subscribers = /* @__PURE__ */ new Set();
    let lifecycle;
    let runtime;
    let playerGeneration = 0, requestGeneration = 0;
    const channelId = (route) => target.top === target && route.kind === "live" && route.id && /^\/live\/[a-f0-9]{32}\/?$/i.test(route.path) ? route.id.toLowerCase() : null;
    const initialRoute = parseRoute(target.location.pathname);
    const status = createStatusStore(
      (payload) => target.postMessage(payload, target.location.origin),
      () => runtime.diagnostics()
    );
    runtime = {
      ownerProtocol: 2,
      requestId: `knife-${Date.now().toString(36)}`,
      config: {},
      baseConfig: {},
      mediaRequestId: "",
      media: {
        context: { documentGeneration: 1, routePath: initialRoute.path, channelId: channelId(initialRoute), playerGeneration },
        phase: "pending",
        version: { globalRevision: null, mediaRevision: null },
        profileState: "global",
        revisionStatus: "repair-required",
        audioBindingGeneration: 0,
        audioKind: "global",
        videoKind: "global"
      },
      i18n: {},
      configReady: false,
      state: {},
      statuses: status.statuses,
      features: {},
      generation: 0,
      route: () => parseRoute(target.location.pathname),
      selectPlayer() {
        try {
          return runtime.adapter?.discover(target.document, runtime.route()).player || null;
        } catch {
          return null;
        }
      },
      setStatus: (feature, state, reason = "") => status.setStatus(feature, state, reason),
      diagnostics() {
        const player = runtime.state.player;
        const webpack = Object.getOwnPropertyDescriptor(target, "webpackChunkglive_fe_pc")?.value;
        return {
          world: "MAIN",
          route: runtime.route().kind,
          player: !!player,
          vue: player?.vue === true,
          webpackKnown: Array.isArray(webpack),
          reactOnLayout: player?.reactOnLayout === true,
          mediaBlob: !!player?.video?.currentSrc?.startsWith("blob:")
        };
      },
      subscribe(callback) {
        subscribers.add(callback);
        callback(runtime.state);
        return () => subscribers.delete(callback);
      },
      notify() {
        for (const callback of subscribers) {
          try {
            callback(runtime.state);
          } catch {
            runtime.setStatus("runtime", "failed", "feature-initialization");
          }
        }
      },
      mediaCurrent() {
        const actual = runtime.selectPlayer(), previous = runtime.state.player;
        return runtime.configReady && runtime.media.phase !== "pending" && runtime.media.context.routePath === target.location.pathname && actual?.pzp === previous?.pzp && actual?.video === previous?.video;
      },
      revalidateMedia() {
        runtime.media.phase = "pending";
        runtime.mediaRequestId = `${runtime.requestId}-media-${++requestGeneration}`;
        runtime.config = { ...runtime.baseConfig };
        const video = runtime.state.player?.video;
        if (video) runtime.audio?.suspend(video);
        if (runtime.configReady) {
          const values = Object.fromEntries(KnifeMediaProfiles.videoFields.map((field) => [field.id, Object.getOwnPropertyDescriptor(runtime.baseConfig, field.id)?.value]));
          const checked = KnifeMediaProfiles.validateValues("video", values);
          if (checked.ok && checked.domain === "video") runtime.filters?.reconcile(checked.values, null, null);
        }
        runtime.setStatus("mediaSettings", "pending", "scoped-config-pending");
        lifecycle.requestMedia();
      },
      reconcile() {
        const route = runtime.route();
        let site;
        try {
          site = runtime.adapter?.discover(target.document, route);
        } catch {
        }
        const body = site?.body || null, player = site?.player || null, sidebar = site?.sidebar || null;
        const previous = runtime.state;
        if (previous.route?.path === route.path && previous.body === body && previous.sidebar === sidebar && previous.player?.pzp === player?.pzp && previous.player?.video === player?.video && previous.player?.filterTarget === player?.filterTarget) {
          runtime.notify();
          return;
        }
        const mediaChanged = previous.route?.path !== route.path || previous.player?.pzp !== player?.pzp || previous.player?.video !== player?.video;
        if (mediaChanged) {
          if (previous.player?.video) {
            if (previous.player.video === player?.video && previous.route?.path === route.path) runtime.audio?.suspend(previous.player.video);
            else runtime.audio?.bypass(previous.player.video);
          }
          runtime.media.context = { documentGeneration: runtime.media.context.documentGeneration, routePath: route.path, channelId: channelId(route), playerGeneration: ++playerGeneration };
        }
        runtime.generation++;
        runtime.state = { route, body, player, sidebar, generation: runtime.generation };
        if (mediaChanged) runtime.revalidateMedia();
        runtime.notify();
      },
      schedule: () => lifecycle.schedule(),
      createScope: () => createResourceScope({
        AbortController: browser.AbortController,
        setTimeout: (callback, delay) => target.setTimeout(callback, delay),
        clearTimeout: (id) => target.clearTimeout(id),
        setInterval: (callback, delay) => target.setInterval(callback, delay),
        clearInterval: (id) => target.clearInterval(id)
      })
    };
    const removeRegistry = () => {
      if (Object.getOwnPropertyDescriptor(target, key)?.value === runtime) Reflect.deleteProperty(target, key);
    };
    lifecycle = createLifecycle(runtime, {
      window: target,
      document: target.document,
      location: target.location,
      MutationObserver: browser.MutationObserver,
      requestAnimationFrame: (callback) => target.requestAnimationFrame(callback),
      cancelAnimationFrame: (id) => target.cancelAnimationFrame(id),
      setTimeout: (callback, delay) => target.setTimeout(callback, delay),
      clearTimeout: (id) => target.clearTimeout(id),
      setInterval: (callback, delay) => target.setInterval(callback, delay),
      clearInterval: (id) => target.clearInterval(id),
      onFinal: removeRegistry
    });
    Object.defineProperty(target, key, { configurable: true, value: runtime });
    try {
      lifecycle.start();
      return runtime;
    } catch (error) {
      lifecycle.dispose();
      removeRegistry();
      throw error;
    }
  }
  installRuntime(window);
})();
