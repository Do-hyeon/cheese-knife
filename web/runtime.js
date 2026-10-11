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
      return Object.getPrototypeOf(prototype) === null && constructor !== void 0 && "value" in constructor && typeof constructor.value === "function" && constructor.value.name === "Object";
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
  function readConfigEnvelope(event, expected) {
    if (event.source !== expected.source || event.origin !== expected.origin || !ordinaryRecord(event.data)) return null;
    const data = event.data;
    try {
      if (ownValue(data, "namespace") !== "cheese-knife" || ownValue(data, "protocol") !== 1 || ownValue(data, "type") !== "config" || ownValue(data, "requestId") !== expected.requestId) return null;
      const revision = ownValue(data, "revision");
      if (!Number.isSafeInteger(revision) || revision <= expected.revision) return null;
      const config = copyRecord(ownValue(data, "config"), false);
      if (!config) return null;
      const rawI18n = ownValue(data, "i18n");
      const i18n = rawI18n == null ? {} : copyRecord(rawI18n, true);
      if (!i18n) return null;
      return { revision, config, i18n };
    } catch {
      return null;
    }
  }

  // src/main/runtime/lifecycle.ts
  var interesting = '#root, #layout-body, #sidebar, #live_player_layout, #player_layout, .pzp-pc, .pzp-pc__video, .pzp-pc__bottom-buttons-left, #license, video, section, aside, [role="tablist"]';
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
      if (disposed || suspended || runtime.configReady) return;
      if (attempts++ >= 20) {
        runtime.setStatus("configuration", "limited", "config-unavailable");
        return;
      }
      environment.window.postMessage({ namespace: "cheese-knife", protocol: 1, type: "config-request", requestId: runtime.requestId }, environment.location.origin);
      requestTimer = environment.setTimeout(requestConfig, 100);
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
      const envelope = readConfigEnvelope(event, {
        source: environment.window,
        origin: environment.location.origin,
        requestId: runtime.requestId,
        revision
      });
      if (!envelope) return;
      revision = envelope.revision;
      runtime.config = envelope.config;
      runtime.i18n = envelope.i18n;
      runtime.configReady = true;
      clearRequest();
      runtime.setStatus("configuration", "ready");
      runtime.reconcile();
    };
    const onMutations = (mutations) => {
      if (runtime.state.player && !runtime.state.player.pzp.isConnected) {
        schedule();
        return;
      }
      for (const mutation of mutations) {
        const changed = [...mutation.addedNodes, ...mutation.removedNodes];
        const foreign = changed.some((node) => node.nodeType === 1 && !node.classList?.contains("knife-owned") && !node.closest?.(".knife-owned"));
        if (foreign && !mutation.target.closest?.(".knife-owned") && mutation.target.closest?.(".pzp-pc__bottom-buttons-left, .pzp-pc__video, #license")) {
          schedule();
          return;
        }
        for (const node of changed) {
          if (node.nodeType !== 1) continue;
          const element = node;
          if (element.classList?.contains("knife-owned") || element.closest?.(".knife-owned")) continue;
          if (element.matches?.(interesting) || element.querySelector?.(interesting)) {
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
        });
        on(environment.window, "popstate", () => runtime.reconcile());
        on(environment.window, "pageshow", () => {
          if (disposed) return;
          suspended = false;
          startPulse();
          runtime.reconcile();
          if (!runtime.configReady) requestConfig();
        });
        on(environment.window, "pagehide", (event) => {
          if (event.persisted) {
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
      dispose
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
  function selectPlayer(document, kind) {
    if (kind !== "live" && kind !== "vod") return null;
    const body = document.getElementById("layout-body");
    const layout = document.getElementById(kind === "live" ? "live_player_layout" : "player_layout");
    const container = layout || body;
    if (!container) return null;
    const candidates = [...container.querySelectorAll(".pzp-pc")].filter((node) => !node.closest(".knife-preview, .knife-popup"));
    if (container.matches(".pzp-pc")) candidates.unshift(container);
    if (candidates.length !== 1 || !candidates[0]) return null;
    const pzp = candidates[0];
    const video = pzp.querySelector(".pzp-pc__video video") || pzp.querySelector("video");
    return { layout: layout || pzp.parentElement, pzp, video };
  }
  function installRuntime(target) {
    const browser = target;
    const key = browser.Symbol.for(registryName);
    if (Object.getOwnPropertyDescriptor(target, key)?.value) return null;
    const subscribers = /* @__PURE__ */ new Set();
    let lifecycle;
    let runtime;
    const status = createStatusStore(
      (payload) => target.postMessage(payload, target.location.origin),
      () => runtime.diagnostics()
    );
    runtime = {
      requestId: `knife-${Date.now().toString(36)}`,
      config: {},
      i18n: {},
      configReady: false,
      state: {},
      statuses: status.statuses,
      features: {},
      generation: 0,
      route: () => parseRoute(target.location.pathname),
      selectPlayer: () => selectPlayer(target.document, runtime.route().kind),
      setStatus: (feature, state, reason = "") => status.setStatus(feature, state, reason),
      diagnostics() {
        const player = runtime.state.player;
        const webpack = Object.getOwnPropertyDescriptor(target, "webpackChunkglive_fe_pc")?.value;
        return {
          world: "MAIN",
          route: runtime.route().kind,
          player: !!player,
          vue: !!player?.pzp?.__vue__,
          webpackKnown: Array.isArray(webpack),
          reactOnLayout: !!player && Object.keys(player.layout || {}).some((name) => name.startsWith("__reactFiber$")),
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
      reconcile() {
        const route = runtime.route();
        const body = target.document.getElementById("layout-body");
        const player = runtime.selectPlayer();
        const sidebar = target.document.getElementById("sidebar") || target.document.querySelector('aside[aria-label="사이드바"]');
        const previous = runtime.state;
        if (previous.route?.path === route.path && previous.body === body && previous.sidebar === sidebar && previous.player?.pzp === player?.pzp && previous.player?.video === player?.video) {
          runtime.notify();
          return;
        }
        runtime.generation++;
        runtime.state = { route, body, player, sidebar, generation: runtime.generation };
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
