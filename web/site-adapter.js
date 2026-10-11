// Generated from src/main/site-adapter/entry.ts by scripts/main-runtime.mjs. Do not edit.
"use strict";
(() => {
  // src/main/site-adapter/react.ts
  function siteObject(value) {
    return typeof value === "object" && value !== null || typeof value === "function";
  }
  function ownData(object, key) {
    if (!siteObject(object)) return null;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      return descriptor && "value" in descriptor ? { owner: object, descriptor, value: descriptor.value } : null;
    } catch {
      return null;
    }
  }
  function replaceOwnData(object, key, expected, next) {
    const current = ownData(object, key);
    if (!current || current.value !== expected || current.descriptor.writable !== true) return false;
    try {
      Object.defineProperty(current.owner, key, { ...current.descriptor, value: next });
      return true;
    } catch {
      return false;
    }
  }
  function createReactReader() {
    const failed = /* @__PURE__ */ new WeakSet();
    const read = (object, key) => {
      if (!siteObject(object) || failed.has(object)) return null;
      try {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        return descriptor && "value" in descriptor ? { owner: object, descriptor, value: descriptor.value } : null;
      } catch {
        failed.add(object);
        return null;
      }
    };
    const prefixed = (node, prefix) => {
      if (!siteObject(node) || failed.has(node)) return null;
      try {
        for (const key of Object.getOwnPropertyNames(node)) {
          if (!key.startsWith(prefix)) continue;
          const property = read(node, key);
          return property && siteObject(property.value) ? property.value : null;
        }
      } catch {
        failed.add(node);
      }
      return null;
    };
    const fiberOf = (node) => prefixed(node, "__reactFiber$");
    const propsOf = (node) => prefixed(node, "__reactProps$");
    const stateOf = (node, criterion, raw = false) => {
      const fibers = /* @__PURE__ */ new Set();
      for (let fiber = fiberOf(node); fiber && !fibers.has(fiber) && fibers.size < 300; ) {
        fibers.add(fiber);
        const hooks = /* @__PURE__ */ new Set();
        let state = read(fiber, "memoizedState")?.value;
        while (siteObject(state) && !hooks.has(state) && hooks.size < 300) {
          hooks.add(state);
          let value = read(state, "memoizedState")?.value;
          const queue = read(state, "queue")?.value;
          const pending = read(queue, "pending")?.value;
          const baseQueue = read(state, "baseQueue")?.value;
          if (read(pending, "hasEagerState")?.value === true) value = read(pending, "eagerState")?.value;
          else if (read(baseQueue, "hasEagerState")?.value === true) value = read(baseQueue, "eagerState")?.value;
          try {
            if (value != null && criterion(value)) return raw ? state : value;
          } catch {
          }
          state = read(state, "next")?.value;
        }
        const parent = read(fiber, "return")?.value;
        fiber = siteObject(parent) ? parent : null;
      }
      return null;
    };
    const contextOf = (node, criterion) => {
      const fibers = /* @__PURE__ */ new Set();
      for (let fiber = fiberOf(node); fiber && !fibers.has(fiber) && fibers.size < 300; ) {
        fibers.add(fiber);
        const dependencies = read(fiber, "dependencies")?.value;
        let context = read(dependencies, "firstContext")?.value;
        const contexts = /* @__PURE__ */ new Set();
        while (siteObject(context) && !contexts.has(context) && contexts.size < 100) {
          contexts.add(context);
          const value = read(context, "memoizedValue")?.value;
          try {
            if (value != null && criterion(value)) return value;
          } catch {
          }
          context = read(context, "next")?.value;
        }
        const parent = read(fiber, "return")?.value;
        fiber = siteObject(parent) ? parent : null;
      }
      return null;
    };
    return { fiberOf, propsOf, stateOf, contextOf };
  }

  // src/main/site-adapter/discovery.ts
  function discoverSite(document, route, reader) {
    const root = document.getElementById("root");
    const body = document.getElementById("layout-body");
    const sidebar = document.getElementById("sidebar") || document.querySelector('aside[aria-label="사이드바"]');
    if (route.kind !== "live" && route.kind !== "vod" || !body) return { root, body, sidebar, player: null };
    const layout = document.getElementById(route.kind === "live" ? "live_player_layout" : "player_layout");
    const container = layout || body;
    const candidates = [...container.querySelectorAll(".pzp-pc")].filter((node) => !node.closest(".knife-preview, .knife-popup"));
    if (container.matches(".pzp-pc")) candidates.unshift(container);
    if (candidates.length !== 1 || !candidates[0]) return { root, body, sidebar, player: null };
    const pzp = candidates[0];
    const video = pzp.querySelector(".pzp-pc__video video") || pzp.querySelector("video");
    const playerLayout = layout || pzp.parentElement;
    return { root, body, sidebar, player: {
      layout: playerLayout,
      pzp,
      video,
      vue: !!ownData(pzp, "__vue__")?.value,
      reactOnLayout: !!reader.fiberOf(playerLayout)
    } };
  }

  // src/main/site-adapter/capabilities.ts
  var MAX_TEXT = 256;
  var MAX_CONTENT = 64 * 1024;
  var MAX_MESSAGES = 1e4;
  var MAX_EVENTS = 256;
  var INVALID = /* @__PURE__ */ Symbol("invalid");
  function text(value, max = MAX_TEXT) {
    return value == null ? null : typeof value === "string" && value.length <= max ? value : INVALID;
  }
  function finite(value) {
    return value == null ? null : typeof value === "number" && Number.isFinite(value) ? value : INVALID;
  }
  function time(value) {
    if (value == null) return null;
    if (typeof value === "string") return value.length <= MAX_TEXT ? value : INVALID;
    return typeof value === "number" && Number.isFinite(value) ? value : INVALID;
  }
  function data(object, key) {
    return ownData(object, key)?.value;
  }
  function field(object, key) {
    if (!siteObject(object)) return INVALID;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      return !descriptor ? void 0 : "value" in descriptor ? descriptor.value : INVALID;
    } catch {
      return INVALID;
    }
  }
  function thenable(value) {
    if (!siteObject(value)) return false;
    let current = value;
    for (let depth = 0; siteObject(current) && depth < 4; depth++) {
      const property = ownData(current, "then");
      if (property) return typeof property.value === "function";
      try {
        current = Object.getPrototypeOf(current);
      } catch {
        return true;
      }
    }
    return false;
  }
  function binding(active, release) {
    let disposed = false;
    return { get active() {
      return !disposed && active();
    }, dispose() {
      if (disposed) return;
      disposed = true;
      release();
    } };
  }
  function createSiteCapabilities(reader) {
    const identities = /* @__PURE__ */ new WeakMap();
    const ports = /* @__PURE__ */ new WeakMap();
    let nextIdentity = 0;
    const identity = (value) => {
      let current = identities.get(value);
      if (current === void 0) {
        current = ++nextIdentity;
        identities.set(value, current);
      }
      return current;
    };
    const snapshotMessage = (value) => {
      if (!siteObject(value)) return null;
      const key = text(field(value, "key")), user = text(field(value, "user")), messageTime = time(field(value, "time")), playerTime = finite(field(value, "playerMessageTime")), type = finite(field(value, "type")), status = text(field(value, "status"));
      const rawContent = field(value, "content");
      const content = typeof rawContent === "string" ? text(rawContent, MAX_CONTENT) : siteObject(rawContent) ? identity(rawContent) : finite(rawContent);
      if ([key, user, messageTime, playerTime, type, status, content].includes(INVALID)) return null;
      return Object.freeze({ identity: identity(value), key, user, time: messageTime, playerTime, type, status, content });
    };
    const snapshotEvent = (value) => {
      if (!siteObject(value)) return null;
      const messageTime = time(field(value, "messageTime")), userId = text(field(value, "userId")), blindType = text(field(value, "blindType"));
      return [messageTime, userId, blindType].includes(INVALID) ? null : Object.freeze({ messageTime, userId, blindType });
    };
    const messageFromRow = (row) => {
      const props = reader.propsOf(row), direct = data(props, "chatMessage");
      if (direct !== void 0) return direct;
      return data(data(data(props, "children"), "props"), "chatMessage");
    };
    const createPort = (controller) => {
      let active = true, filterBinding = null, blindBinding = null;
      let previousBlind = null;
      const owners = /* @__PURE__ */ new WeakMap();
      const currentList = () => {
        const value = data(controller, "messageList");
        return Array.isArray(value) && value.length <= MAX_MESSAGES ? value : null;
      };
      const snapshotAt = (list, index) => {
        const property = ownData(list, String(index)), snapshot = property && snapshotMessage(property.value);
        if (snapshot && siteObject(property.value)) owners.set(snapshot, { list, index, raw: property.value });
        return snapshot;
      };
      const messages = () => {
        const list = active && currentList();
        if (!list) return [];
        const snapshots = [];
        for (let index = 0; index < list.length; index++) {
          const snapshot = snapshotAt(list, index);
          if (snapshot) snapshots.push(snapshot);
        }
        return snapshots;
      };
      const replaceStatus = (expected, nextStatus) => {
        if (!active || typeof nextStatus !== "string" || text(nextStatus) === INVALID) return null;
        const owner = owners.get(expected), list = currentList();
        if (!owner || !list || owner.list !== list || owner.index >= list.length || ownData(list, String(owner.index))?.value !== owner.raw) return null;
        const current = snapshotMessage(owner.raw);
        if (!current || Object.keys(expected).some((key) => data(expected, key) !== data(current, key))) return null;
        let descriptors;
        try {
          descriptors = Object.getOwnPropertyDescriptors(owner.raw);
          for (const descriptor of Object.values(descriptors)) if (!("value" in descriptor)) return null;
        } catch {
          return null;
        }
        const replacement = {};
        try {
          Object.defineProperties(replacement, descriptors);
          Object.defineProperty(replacement, "status", { configurable: true, enumerable: true, writable: true, value: nextStatus });
        } catch {
          return null;
        }
        if (data(controller, "messageList") !== list || ownData(list, String(owner.index))?.value !== owner.raw) return null;
        try {
          Array.prototype.splice.call(list, owner.index, 1, replacement);
        } catch {
          return null;
        }
        const update = data(controller, "notiUpdateMessageList");
        if (typeof update === "function") {
          let result;
          try {
            result = Reflect.apply(update, controller, []);
          } catch {
            if (ownData(list, String(owner.index))?.value === replacement) try {
              Array.prototype.splice.call(list, owner.index, 1, owner.raw);
            } catch {
            }
            return null;
          }
          if (thenable(result)) {
            if (ownData(list, String(owner.index))?.value === replacement) try {
              Array.prototype.splice.call(list, owner.index, 1, owner.raw);
            } catch {
            }
            return null;
          }
        }
        return snapshotAt(list, owner.index);
      };
      const port = {
        get active() {
          return active;
        },
        emptyStatus() {
          const value = text(data(data(controller, "emptyMessage"), "status"));
          return value === INVALID ? null : value;
        },
        messages,
        installMessageFilter(block) {
          if (!active) return null;
          if (filterBinding?.active) return filterBinding;
          filterBinding?.dispose();
          const property = ownData(controller, "messageFilter");
          if (!property || typeof property.value !== "function" || property.descriptor.writable !== true) return null;
          const original = property.value;
          const replacement = function(message, ...args) {
            const result = Reflect.apply(original, this, [message, ...args]);
            if (!result) return result;
            try {
              return block(snapshotMessage(message)) ? false : result;
            } catch {
              return result;
            }
          };
          if (!replaceOwnData(controller, "messageFilter", original, replacement)) return null;
          const owned = binding(() => data(controller, "messageFilter") === replacement, () => {
            replaceOwnData(controller, "messageFilter", replacement, original);
          });
          filterBinding = owned;
          return owned;
        },
        installBlindListener(handler) {
          if (!active) return null;
          if (blindBinding?.active) return blindBinding;
          blindBinding?.dispose();
          const originalProperty = ownData(controller, "notiBlindListener");
          const client = data(controller, "chatClient"), entries = data(data(client, "_events"), "notiBlind");
          if (!originalProperty || typeof originalProperty.value !== "function" || originalProperty.descriptor.writable !== true || !Array.isArray(entries) || entries.length > MAX_EVENTS) return null;
          const original = originalProperty.value;
          if (previousBlind) for (let index = 0; index < entries.length; index++) {
            const entry2 = ownData(entries, String(index))?.value;
            if (data(entry2, "listener") === previousBlind.replacement) replaceOwnData(entry2, "listener", previousBlind.replacement, previousBlind.original);
          }
          const matches = [];
          for (let index = 0; index < entries.length; index++) {
            const entry2 = ownData(entries, String(index))?.value;
            if (siteObject(entry2) && data(entry2, "listener") === original) matches.push(entry2);
          }
          const entry = matches.length === 1 ? matches[0] : null;
          if (!entry || data(entry, "once") !== false || ownData(entry, "listener")?.descriptor.writable !== true) return null;
          let owned;
          const replacement = function(event, ...args) {
            const list = currentList(), eventSnapshot = snapshotEvent(event);
            let before = null;
            if (list && eventSnapshot) for (let index = 0; index < list.length; index++) {
              const candidate = snapshotAt(list, index);
              if (candidate && candidate.time === eventSnapshot.messageTime && candidate.user === eventSnapshot.userId) {
                before = candidate;
                break;
              }
            }
            const result = Reflect.apply(original, this, [event, ...args]);
            if (!owned.active) return result;
            if (thenable(result)) {
              try {
                handler({ event: eventSnapshot, before, after: null, replaceAfterStatus: () => null });
              } catch {
              }
              return result;
            }
            if (!list || data(controller, "messageList") !== list) {
              try {
                handler({ event: eventSnapshot, before, after: null, replaceAfterStatus: () => null });
              } catch {
              }
              return result;
            }
            let after = null;
            if (eventSnapshot) for (let index = 0; index < list.length; index++) {
              const candidate = snapshotAt(list, index);
              if (candidate && candidate.time === eventSnapshot.messageTime && candidate.user === eventSnapshot.userId) {
                after = candidate;
                break;
              }
            }
            try {
              handler({ event: eventSnapshot, before, after, replaceAfterStatus: (expected, nextStatus) => expected === after ? replaceStatus(expected, nextStatus) : null });
            } catch {
            }
            return result;
          };
          if (!replaceOwnData(entry, "listener", original, replacement) || !replaceOwnData(controller, "notiBlindListener", original, replacement)) {
            replaceOwnData(entry, "listener", replacement, original);
            return null;
          }
          previousBlind = { original, replacement };
          owned = binding(
            () => data(controller, "chatClient") === client && data(entry, "listener") === replacement && data(controller, "notiBlindListener") === replacement,
            () => {
              replaceOwnData(entry, "listener", replacement, original);
              replaceOwnData(controller, "notiBlindListener", replacement, original);
            }
          );
          blindBinding = owned;
          return owned;
        },
        replaceStatus,
        dispose() {
          if (!active) return;
          active = false;
          filterBinding?.dispose();
          blindBinding?.dispose();
        }
      };
      return port;
    };
    return {
      discover: (document, route) => discoverSite(document, route, reader),
      chat: {
        readMessage: (row) => snapshotMessage(messageFromRow(row)),
        connect(container) {
          const controller = reader.stateOf(container, (value) => typeof data(value, "messageFilter") === "function");
          if (!siteObject(controller)) return null;
          const existing = ports.get(controller);
          if (existing?.active) return existing;
          const port = createPort(controller);
          ports.set(controller, port);
          return port;
        }
      },
      banner: { closeHandler(node) {
        const fiber = reader.fiberOf(node), props = data(data(fiber, "return"), "memoizedProps"), close = data(props, "closeHandler");
        return typeof close === "function" && siteObject(props) ? () => Reflect.apply(close, props, []) : null;
      } },
      video: { openDate(node) {
        const value = reader.stateOf(node, (candidate) => {
          const openDate2 = text(data(Array.isArray(candidate) ? data(candidate, "0") : null, "openDate"));
          return openDate2 !== INVALID && openDate2 !== null;
        });
        const openDate = text(data(Array.isArray(value) ? data(value, "0") : null, "openDate"));
        return openDate === INVALID ? null : openDate;
      } },
      player: { async readMetrics(layout) {
        const state = reader.stateOf(layout, (value) => siteObject(data(value, "_corePlayer")));
        const core = data(state, "_corePlayer"), codecs = data(core, "_currentCodecs");
        if (!siteObject(core) || !siteObject(codecs)) return null;
        const video = text(data(codecs, "video")), audio = text(data(codecs, "audio"));
        if (video === INVALID || audio === INVALID) return null;
        const codec = [video, audio].filter((value) => typeof value === "string" && value.length > 0).join(", ");
        return { codec: codec || null };
      } }
    };
  }

  // src/main/site-adapter/entry.ts
  var runtime = window[/* @__PURE__ */ Symbol.for("cheese-knife.runtime.v1")];
  if (runtime && !runtime.adapter) {
    runtime.adapter = createSiteCapabilities(createReactReader());
    runtime.reconcile();
  }
})();
