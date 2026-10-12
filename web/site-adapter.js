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
  var discoverySelector = '#root, #layout-body, #sidebar, #live_player_layout, #player_layout, .pzp-pc, .pzp-pc__video, .pzp-pc__bottom-buttons-left, #license, aside[aria-label="사이드바"]';
  function affectsSiteDiscovery(node, target) {
    try {
      return node.matches(discoverySelector) || !!node.querySelector(discoverySelector) || !!target?.closest(".pzp-pc__bottom-buttons-left, .pzp-pc__video, #license");
    } catch {
      return false;
    }
  }
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
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(current, "then");
      } catch {
        return true;
      }
      if (descriptor) return !("value" in descriptor) || typeof descriptor.value === "function";
      try {
        current = Object.getPrototypeOf(current);
      } catch {
        return true;
      }
    }
    return siteObject(current);
  }
  function boundedArray(value, max) {
    try {
      if (!Array.isArray(value)) return null;
      const length = ownData(value, "length")?.value;
      return Number.isSafeInteger(length) && length >= 0 && length <= max ? { value, length } : null;
    } catch {
      return null;
    }
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
  function one(root, selector) {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }
  function many(root, selector) {
    try {
      return [...root.querySelectorAll(selector)];
    } catch {
      return [];
    }
  }
  function html(node) {
    return node instanceof HTMLElement ? node : null;
  }
  function button(node) {
    return node instanceof HTMLButtonElement ? node : null;
  }
  function anchor(node) {
    return node instanceof HTMLAnchorElement ? node : null;
  }
  function urlOf(node) {
    try {
      return new URL(node.getAttribute("href") || "", node.ownerDocument.location.href);
    } catch {
      return null;
    }
  }
  function sectionKind(section) {
    try {
      const label = section.getAttribute("aria-label");
      if (label === "팔로우" || label === "Following channels") return null;
      if (label === "인기 카테고리") return "popular";
      const header = one(section, ':scope > [class^="_header_"]');
      const title = header && one(header, ':scope > strong[class^="_title_"]');
      const titleText = [...title?.childNodes || []].filter((child) => child.nodeType === 3).map((child) => child.textContent).join("").trim().replace(/\s+/g, " ");
      if (titleText === "팔로잉 채널" || titleText === "Following channels") return null;
      if (titleText === "인기 카테고리") return "popular";
      if (titleText === "다가오는 방송 일정" || titleText === "방송일정") return "schedule";
      if (titleText === "파트너 스트리머") return "partner";
      if (titleText === "서비스 바로가기") return "shortcut";
      if (titleText) return null;
      const links = (root) => root ? many(root, "a[href]").flatMap((node) => {
        const link = anchor(node), url = link && urlOf(link);
        return url ? [url] : [];
      }) : [];
      const location = section.ownerDocument.location;
      if (links(header).some((url) => url.origin === location.origin && url.pathname.slice(1) === "partner")) return "partner";
      const services = links(one(section, ":scope > ul")).filter((url) => url.protocol === "https:" && url.hostname === ["game", "naver", "com"].join(".") && url.port === "");
      return services.some((url) => url.pathname.length === 1) && services.some((url) => url.pathname.slice(1) === "esports") ? "shortcut" : null;
    } catch {
      return null;
    }
  }
  function followingControls(root) {
    try {
      const section = one(root, 'nav[aria-label="팔로우"], nav[aria-label="Following channels"]') || many(root, "nav").find((candidate) => /^(팔로잉 채널|Following channels)$/i.test(
        one(candidate, '[class*="_title_"], [class^="navigation_bar_title__"]')?.textContent?.trim() || ""
      )) || null;
      if (!section) return null;
      const more = button(one(section, ':scope > button[class*="_more_button_"], :scope > div[class^="_box_"] > button[class*="_more_button_"], :scope > button[class^="navigation_bar_more_button__"]'));
      const fold = many(section, ':scope > [class^="_header_"] > button[aria-expanded], :scope > [class^="navigation_bar_header__"] > button[aria-expanded]').map(button).find((candidate) => candidate && /^(펼쳐짐, 접기|접혀짐, 펼치기|접힘, 펼치기|Expanded, collapse|Collapsed, expand)$/i.test(candidate.getAttribute("aria-label") || "")) || null;
      const refresh = button(one(section, 'button[aria-label="새로고침"], button[aria-label="Refresh"]'));
      return Object.freeze({ section, more, fold, refresh });
    } catch {
      return null;
    }
  }
  function viewMode(body, player, route) {
    try {
      const label = player?.isConnected ? one(player, ".pzp-pc__viewmode-button")?.getAttribute("aria-label") || "" : "";
      if (/^(좁은 화면|Narrow screen|Normal view)$/i.test(label)) return true;
      if (/^(넓은 화면|Wide screen|Wide view)$/i.test(label)) return false;
      if (route.kind !== "live" && route.kind !== "vod") return false;
      return /(?:^|\s)(?:_is_large_|live_information_is_large__)/.test(body?.getAttribute("class") || "") ? true : null;
    } catch {
      return null;
    }
  }
  function startTarget(target, route) {
    try {
      if (!(target instanceof Element)) return null;
      const liveCount = 'main [class*="_data_"] > strong[class*="_count_"]';
      const vodDate = '[class*="_area_"] > [class*="_information_"] > span[class*="_item_"]:last-child';
      const node = html(target.closest('[class^="video_information_count__"], span[class^="video_card_item__"], ' + liveCount + ", " + vodDate));
      if (!node) return null;
      const currentLive = node.matches(liveCount);
      if (currentLive && route.kind !== "live") return null;
      if ((node.getAttribute("class") || "").startsWith("video_information_count__") || currentLive) {
        return Object.freeze({ kind: "live", node });
      }
      if (node.nextElementSibling) return null;
      const link = anchor(one(node.parentElement?.parentElement || node, "a[href]"));
      if (!link) return null;
      const url = urlOf(link), location = node.ownerDocument.location;
      const id = url?.origin === location.origin ? url.pathname.match(/^\/video\/(\d+)\/?$/)?.[1] : null;
      return id ? Object.freeze({ kind: "vod", node, link, id }) : null;
    } catch {
      return null;
    }
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
        return boundedArray(value, MAX_MESSAGES);
      };
      const snapshotAt = (list, index) => {
        const property = ownData(list, String(index)), snapshot = property && snapshotMessage(property.value);
        if (snapshot && siteObject(property.value)) owners.set(snapshot, { list, index, raw: property.value });
        return snapshot;
      };
      const messages = () => {
        const current = active && currentList();
        if (!current) return [];
        const { value: list, length } = current;
        const snapshots = [];
        for (let index = 0; index < length; index++) {
          const snapshot = snapshotAt(list, index);
          if (snapshot) snapshots.push(snapshot);
        }
        return snapshots;
      };
      const replaceStatus = (expected, nextStatus) => {
        if (!active || typeof nextStatus !== "string" || text(nextStatus) === INVALID) return null;
        const owner = owners.get(expected), current = currentList();
        if (!owner || !current || owner.list !== current.value || owner.index >= current.length || ownData(current.value, String(owner.index))?.value !== owner.raw) return null;
        const list = current.value;
        const currentSnapshot = snapshotMessage(owner.raw);
        if (!currentSnapshot || Object.keys(expected).some((key) => data(expected, key) !== data(currentSnapshot, key))) return null;
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
        if (!replaceOwnData(list, String(owner.index), owner.raw, replacement)) return null;
        const update = data(controller, "notiUpdateMessageList");
        if (typeof update === "function") {
          let result;
          try {
            result = Reflect.apply(update, controller, []);
          } catch {
            replaceOwnData(list, String(owner.index), replacement, owner.raw);
            return null;
          }
          if (thenable(result)) {
            replaceOwnData(list, String(owner.index), replacement, owner.raw);
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
          const client = data(controller, "chatClient"), boundedEntries = boundedArray(data(data(client, "_events"), "notiBlind"), MAX_EVENTS);
          if (!originalProperty || typeof originalProperty.value !== "function" || originalProperty.descriptor.writable !== true || !boundedEntries) return null;
          const { value: entries, length: entryCount } = boundedEntries;
          const original = originalProperty.value;
          if (previousBlind) for (let index = 0; index < entryCount; index++) {
            const entry2 = ownData(entries, String(index))?.value;
            if (data(entry2, "listener") === previousBlind.replacement) replaceOwnData(entry2, "listener", previousBlind.replacement, previousBlind.original);
          }
          const matches = [];
          for (let index = 0; index < entryCount; index++) {
            const entry2 = ownData(entries, String(index))?.value;
            if (siteObject(entry2) && data(entry2, "listener") === original) matches.push(entry2);
          }
          const entry = matches.length === 1 ? matches[0] : null;
          if (!entry || data(entry, "once") !== false || ownData(entry, "listener")?.descriptor.writable !== true) return null;
          let owned;
          const replacement = function(event, ...args) {
            const current = currentList(), list = current?.value || null, listLength = current?.length || 0, eventSnapshot = snapshotEvent(event);
            let before = null;
            if (list && eventSnapshot) for (let index = 0; index < listLength; index++) {
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
            if (eventSnapshot) for (let index = 0; index < listLength; index++) {
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
          const ownsEntry = () => {
            const current = boundedArray(data(data(client, "_events"), "notiBlind"), MAX_EVENTS);
            if (!current || current.value !== entries) return false;
            for (let index = 0; index < current.length; index++) if (ownData(entries, String(index))?.value === entry) return true;
            return false;
          };
          previousBlind = { original, replacement };
          owned = binding(
            () => data(controller, "chatClient") === client && ownsEntry() && data(entry, "listener") === replacement && data(controller, "notiBlindListener") === replacement,
            () => {
              replaceOwnData(entry, "listener", replacement, original);
              replaceOwnData(controller, "notiBlindListener", replacement, original);
              const current = boundedArray(data(data(data(controller, "chatClient"), "_events"), "notiBlind"), MAX_EVENTS);
              if (current) for (let index = 0; index < current.length; index++) {
                const candidate = ownData(current.value, String(index))?.value;
                if (data(candidate, "listener") === replacement) replaceOwnData(candidate, "listener", replacement, original);
              }
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
      affectsDiscovery: affectsSiteDiscovery,
      chat: {
        findContainer(body, kind) {
          return kind === "vod" ? one(body, '[class^="vod_chatting_container__"]') || one(body, "aside:not([aria-label])") : one(body, "aside:not([aria-label])");
        },
        findLogRoot: (container) => one(container, '[role="log"], [class^="live_chatting_list_wrapper__"], [class^="vod_chatting_list__"]'),
        messageRows: (root) => many(root, '[class^="_item_"], [class^="live_chatting_item__"], [class^="vod_chatting_item__"]'),
        timestampTarget: (row) => html(one(row, '[class^="_chatting_message_"], [class^="live_chatting_message_chatting_message__"]')),
        deletedTextTargets: (row) => many(row, '[class^="_chatting_message_"] > span[class^="_text_"], [class^="live_chatting_message_chatting_message__"] > span[class^="live_chatting_message_text__"]').map(html).filter((node) => !!node),
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
      sidebar: {
        sections(root) {
          try {
            return many(root, 'nav[class^="_section_"]').filter((section) => !section.parentElement?.closest("nav"));
          } catch {
            return [];
          }
        },
        classify: sectionKind,
        following: followingControls,
        viewMode
      },
      page: {
        channelTabs: (body, route) => route.kind === "channel" ? one(body, '[role="tablist"], [class*="channel_area__"]') : null,
        startTarget,
        bannerRoot: (body) => one(body, '[class^="band_banner_container__"]')
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
