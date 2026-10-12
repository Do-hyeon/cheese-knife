// Generated from src/main/features/inject/entry.ts by scripts/main-runtime.mjs. Do not edit.
"use strict";
(() => {
  // src/main/features/inject/chat.ts
  var pad = (value) => String(value).padStart(2, "0");
  var formatTime = (value) => {
    const total = Math.max(0, Math.floor(value / 1e3));
    const hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, seconds = total % 60;
    return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  };
  function createChatFeature(runtime, target, adapter) {
    const browser = target;
    let config = {};
    let owner = null;
    let chats = /* @__PURE__ */ new WeakMap();
    let timestampRoots = /* @__PURE__ */ new WeakSet();
    const resizeChat = (container, scope) => {
      if (!container || browser.getComputedStyle(browser.document.documentElement).getPropertyValue("--knife-chat-resize").trim() !== "1") return;
      if (!container.parentElement || container.parentElement.querySelector(".knife-resize-handle")) return;
      const handle = browser.document.createElement("div");
      handle.className = "knife-resize-handle knife-owned";
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", "vertical");
      container.before(handle);
      scope.add(() => {
        handle.remove();
        container.style.width = "";
      });
      let dragging = null;
      let width;
      try {
        const saved = Number(browser.localStorage.getItem("chatWidth"));
        if (Number.isFinite(saved) && saved >= 24 && saved < browser.innerWidth) browser.document.documentElement.style.setProperty("--knife-chat-width", `${saved}px`);
      } catch {
      }
      const finish = () => {
        if (!dragging) return;
        if (handle.hasPointerCapture?.(dragging.id)) handle.releasePointerCapture(dragging.id);
        dragging = null;
        container.style.width = "";
        if (Number.isFinite(width)) {
          browser.document.documentElement.style.setProperty("--knife-chat-width", `${width}px`);
          try {
            browser.localStorage.setItem("chatWidth", String(width));
          } catch {
          }
        }
      };
      scope.on(handle, "pointerdown", (raw) => {
        const event = raw;
        if (event.button !== 0) return;
        event.preventDefault();
        const rect = container.getBoundingClientRect();
        dragging = {
          id: event.pointerId,
          left: rect.left,
          right: rect.right,
          reverse: browser.getComputedStyle(container.parentElement).flexDirection.endsWith("reverse")
        };
        handle.setPointerCapture?.(event.pointerId);
      });
      scope.on(handle, "pointermove", (raw) => {
        const event = raw;
        if (!dragging) return;
        width = Math.max(24, Math.min(
          browser.innerWidth - 24,
          dragging.reverse ? event.clientX - dragging.left - 1 : dragging.right - event.clientX - 1
        ));
        container.style.width = `${width}px`;
      });
      scope.on(handle, "pointerup", finish);
      scope.on(handle, "pointercancel", finish);
      scope.on(target, "blur", finish);
      scope.add(() => {
        dragging = null;
      });
      runtime.setStatus("chatResize", "ready");
    };
    const timestamps = (container, isLive, scope) => {
      if (browser.getComputedStyle(browser.document.documentElement).getPropertyValue("--knife-chat-timestamp").trim() !== "1") return;
      const root = adapter.chat.findLogRoot(container);
      if (!root || timestampRoots.has(root)) return;
      timestampRoots.add(root);
      const apply = () => {
        let supported = 0;
        for (const row of adapter.chat.messageRows(root)) {
          const message = adapter.chat.readMessage(row), timestamp = adapter.chat.timestampTarget(row);
          if (!message || !timestamp) continue;
          if (isLive && message.time != null) {
            const date = new browser.Date(message.time);
            if (Number.isFinite(date.getTime())) {
              timestamp.dataset.timestamp = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
              supported++;
            }
          } else if (Number.isFinite(message.playerTime)) {
            timestamp.dataset.timestamp = formatTime(message.playerTime);
            supported++;
          }
        }
        runtime.setStatus("chatTimestamp", supported ? "ready" : "pending", supported ? "" : "message-props-unavailable");
      };
      apply();
      scope.observe(new browser.MutationObserver(apply), root, { childList: true, subtree: true, characterData: true });
    };
    const bindDeletedChat = (port, container, isLive, scope) => {
      const retained = /* @__PURE__ */ new Map(), markers = /* @__PURE__ */ new Set();
      let binding = null, limited = false;
      const ownsMessage = (message, saved) => !!saved && message?.status === "NORMAL" && message.type === 1 && message.key === saved.key && message.user === saved.user && message.time === saved.time && message.content === saved.content;
      const releaseMarker = (node) => {
        if (node.dataset.knifeDeleted === "1") delete node.dataset.knifeDeleted;
        markers.delete(node);
      };
      const paint = () => {
        const messages = port.messages();
        const identities = new Set(messages.map((message) => message.identity));
        for (const identity of retained.keys()) if (!identities.has(identity)) retained.delete(identity);
        const wanted = /* @__PURE__ */ new Set();
        if (config.showDeleted === true && !scope.disposed) for (const row of adapter.chat.messageRows(container)) {
          const message = adapter.chat.readMessage(row);
          const current = message && messages.find((value) => value.key === message.key && value.user === message.user && value.time === message.time);
          const saved = current ? retained.get(current.identity) : void 0;
          if (current && saved && !ownsMessage(current, saved)) retained.delete(current.identity);
          if (!ownsMessage(current || null, saved) || message?.status !== "NORMAL" || message.content !== saved?.content) continue;
          for (const node of adapter.chat.deletedTextTargets(row)) wanted.add(node);
        }
        for (const node of markers) if (!wanted.has(node) || !node.isConnected) releaseMarker(node);
        for (const node of wanted) {
          if (markers.has(node)) {
            if (node.dataset.knifeDeleted !== "1") markers.delete(node);
          } else if (!node.hasAttribute("data-knife-deleted")) {
            node.dataset.knifeDeleted = "1";
            markers.add(node);
          }
        }
      };
      const rehide = () => {
        for (const message of port.messages()) {
          const saved = retained.get(message.identity);
          if (!saved) continue;
          retained.delete(message.identity);
          if (message.status !== "NORMAL" || message.content !== saved.content || message.key !== saved.key || message.user !== saved.user || message.time !== saved.time || message.type !== 1) continue;
          port.replaceStatus(message, saved.status);
        }
        retained.clear();
        for (const node of markers) releaseMarker(node);
      };
      const unbind = () => {
        binding?.dispose();
        binding = null;
      };
      const dispose = () => {
        unbind();
        rehide();
      };
      const sync = () => {
        if (config.showDeleted !== true) {
          dispose();
          runtime.setStatus("deletedChat", "disabled");
          return;
        }
        if (binding?.active) {
          paint();
          runtime.setStatus("deletedChat", limited ? "limited" : "ready", limited ? "native-deletion-adapter-unavailable" : "");
          return;
        }
        unbind();
        if (!isLive || port.emptyStatus() !== "NORMAL") {
          rehide();
          runtime.setStatus("deletedChat", "limited", "native-deletion-adapter-unavailable");
          return;
        }
        const installed = port.installBlindListener(({ event, before, after, replaceAfterStatus }) => {
          const enabled = !scope.disposed && config.showDeleted === true;
          if (enabled && event && !before) {
            limited = true;
            runtime.setStatus("deletedChat", "limited", "native-deletion-adapter-unavailable");
            paint();
            return;
          }
          const previous = before ? retained.get(before.identity) : void 0;
          const unchanged = !previous || ownsMessage(before, previous);
          if (before && previous && !unchanged) retained.delete(before.identity);
          const eligible = enabled && before && before.type === 1 && before.status === "NORMAL" && unchanged && typeof event?.blindType === "string" && event.blindType.length > 0 && event.blindType.length <= 80 && !["CANCEL", "NORMAL", "CBOTBLIND"].includes(event.blindType);
          if (!eligible || !before || !event) {
            paint();
            return;
          }
          if (after && after.identity !== before.identity && after.key === before.key && after.type === 1 && after.status === event.blindType && after.content === before.content) {
            const visible = replaceAfterStatus(after, "NORMAL");
            if (visible) {
              retained.delete(before.identity);
              retained.set(visible.identity, {
                status: typeof event.blindType === "string" ? event.blindType : "",
                content: before.content,
                key: before.key,
                user: before.user,
                time: before.time
              });
            } else {
              limited = true;
              runtime.setStatus("deletedChat", "limited", "native-deletion-adapter-unavailable");
            }
          } else {
            limited = true;
            runtime.setStatus("deletedChat", "limited", "native-deletion-adapter-unavailable");
          }
          paint();
        });
        if (!installed) {
          rehide();
          runtime.setStatus("deletedChat", "limited", "native-deletion-adapter-unavailable");
          return;
        }
        limited = false;
        binding = installed;
        paint();
        runtime.setStatus("deletedChat", "ready");
      };
      return { sync, paint, dispose };
    };
    const attach = (container, isLive, scope) => {
      timestamps(container, isLive, scope);
      const existing = chats.get(container);
      if (existing?.owner === scope) {
        existing.find();
        return;
      }
      const resizeTarget = isLive ? container : container.closest("aside") || container.parentElement;
      resizeChat(resizeTarget instanceof browser.HTMLElement ? resizeTarget : null, scope);
      const record = { owner: scope, timer: null, port: null, filter: null, deleted: null, find: () => {
      } };
      const report = () => {
        runtime.setStatus(
          "donationChat",
          config.hideDonation ? record.filter?.active ? "ready" : "limited" : "disabled",
          config.hideDonation && !record.filter?.active ? "chat-controller-unavailable" : ""
        );
        record.deleted?.sync();
      };
      let attempts = 0;
      const find = () => {
        if (scope.disposed || !container.isConnected) return;
        const port = adapter.chat.connect(container);
        if (port === record.port && record.filter?.active) {
          report();
          return;
        }
        record.deleted?.dispose();
        record.deleted = null;
        record.filter?.dispose();
        record.filter = null;
        if (record.port && record.port !== port) record.port.dispose();
        record.port = null;
        if (!port) {
          if (record.timer !== null) return;
          if (++attempts < 20) record.timer = scope.timeout(() => {
            record.timer = null;
            find();
          }, 100);
          else {
            runtime.setStatus("donationChat", config.hideDonation ? "limited" : "disabled", config.hideDonation ? "chat-controller-unavailable" : "");
            runtime.setStatus("deletedChat", config.showDeleted ? "limited" : "disabled", config.showDeleted ? "chat-controller-unavailable" : "");
          }
          return;
        }
        record.port = port;
        record.filter = port.installMessageFilter((message) => config.hideDonation === true && message?.type === 10);
        record.deleted = bindDeletedChat(port, container, isLive, scope);
        report();
      };
      record.find = find;
      chats.set(container, record);
      scope.add(() => {
        record.deleted?.dispose();
        record.filter?.dispose();
        record.port?.dispose();
      });
      scope.observe(new browser.MutationObserver((mutations) => {
        timestamps(container, isLive, scope);
        record.deleted?.paint();
        if (mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node instanceof browser.Element && !node.closest(".knife-owned")))) {
          attempts = 0;
          find();
        }
      }), container, { childList: true, subtree: true });
      find();
    };
    return {
      reconcile(container, isLive, nextOwner, nextConfig) {
        config = nextConfig;
        if (owner !== nextOwner) {
          owner = nextOwner;
          chats = /* @__PURE__ */ new WeakMap();
          timestampRoots = /* @__PURE__ */ new WeakSet();
        }
        if (container) attach(container, isLive, nextOwner);
      },
      dispose() {
        owner = null;
        chats = /* @__PURE__ */ new WeakMap();
        timestampRoots = /* @__PURE__ */ new WeakSet();
        config = {};
      }
    };
  }

  // src/main/features/inject/page.ts
  function own(record, key) {
    if (typeof record !== "object" || record === null) return void 0;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && "value" in descriptor ? descriptor.value : void 0;
  }
  function createPageFeature(runtime, target, adapter, popups) {
    const browser = target;
    const cache = /* @__PURE__ */ new Map();
    let mounted = null, config = {}, labels = {};
    const bindStartTimes = (body, scope) => {
      const pending = /* @__PURE__ */ new WeakMap(), annotations = /* @__PURE__ */ new WeakMap();
      const annotated = /* @__PURE__ */ new Set();
      const annotate = (found, date, id = null) => {
        const node = found.node;
        if (scope.disposed || !node.isConnected || !date.trim()) return;
        let record = annotations.get(node);
        if (node.dataset.knifeTooltip && node.dataset.knifeTooltip !== record?.text) return;
        const text = `${labels.liveStart || "Live start"}: ${date}`;
        if (!record) {
          record = { id, text };
          annotations.set(node, record);
          annotated.add(node);
          scope.add(() => {
            if (node.dataset.knifeTooltip === record?.text) delete node.dataset.knifeTooltip;
            annotated.delete(node);
          });
        }
        record.id = id;
        record.text = text;
        node.dataset.knifeTooltip = text;
        runtime.setStatus("startTime", "ready");
      };
      scope.on(body, "mouseover", async (raw) => {
        const event = raw;
        const route = runtime.state.route;
        if (!route) return;
        const found = adapter.page.startTarget(event.target, route);
        if (!found) {
          if (event.target instanceof browser.Node) {
            for (const node2 of annotated) if (node2 === event.target || node2.contains(event.target)) {
              const record2 = annotations.get(node2);
              if (record2 && node2.dataset.knifeTooltip === record2.text) delete node2.dataset.knifeTooltip;
            }
          }
          return;
        }
        if (found.node.contains(event.relatedTarget)) return;
        if (found.kind === "live") {
          if (found.node.dataset.knifeTooltip) return;
          const date = adapter.video.openDate(found.node);
          if (date) annotate(found, date);
          else runtime.setStatus("startTime", "limited", "start-metadata-unavailable");
          return;
        }
        const { node, link, id } = found;
        const record = annotations.get(node);
        if (record && record.id !== id && node.dataset.knifeTooltip === record.text) delete node.dataset.knifeTooltip;
        const waiting = pending.get(node);
        if (waiting && waiting.id !== id) {
          waiting.abort();
          target.clearTimeout(waiting.timeout);
          pending.delete(node);
        }
        if (node.dataset.knifeTooltip || pending.has(node)) return;
        const cached = cache.get(id);
        if (cached && cached.expires > browser.Date.now()) {
          annotate(found, cached.date, id);
          return;
        }
        const controller = new browser.AbortController();
        const abort = scope.add(() => controller.abort());
        const timeout = target.setTimeout(abort, 5e3);
        const request = { id, abort, timeout };
        pending.set(node, request);
        const href = link.href;
        try {
          const endpoint = ["https:", "", "api.chzzk.naver.com", "service", "v3", "videos", id].join(String.fromCharCode(47));
          const response = await browser.fetch(endpoint, { credentials: "include", signal: controller.signal });
          if (!response.ok) throw new Error("metadata-unavailable");
          const info = await response.json();
          const content = own(info, "content"), code = own(info, "code"), liveOpenDate = own(content, "liveOpenDate");
          if (scope.disposed || !node.isConnected || link.href !== href || pending.get(node) !== request) return;
          if (code !== 200 || typeof liveOpenDate !== "string") throw new Error("metadata-unavailable");
          cache.delete(id);
          cache.set(id, { date: liveOpenDate, expires: browser.Date.now() + 18e5 });
          while (cache.size > 100) cache.delete(cache.keys().next().value);
          annotate(found, liveOpenDate, id);
        } catch {
          if (!scope.disposed && pending.get(node) === request) runtime.setStatus("startTime", "limited", "start-metadata-unavailable");
        } finally {
          target.clearTimeout(timeout);
          if (pending.get(node) === request) pending.delete(node);
        }
      });
    };
    return {
      mountOwner(state, owner, nextConfig, nextLabels) {
        config = nextConfig;
        labels = nextLabels;
        if (mounted === owner) return;
        mounted = owner;
        const body = state.body;
        if (!body) return;
        if (state.route?.path === String.fromCharCode(47)) {
          body.dataset.knifeHome = "1";
          owner.add(() => {
            if (body.dataset.knifeHome === "1") delete body.dataset.knifeHome;
          });
        }
        bindStartTimes(body, owner);
        owner.on(body, "drop", (raw) => {
          const event = raw;
          const href = event.dataTransfer?.getData("knife-data");
          if (!href || config.popupPlayer !== true) return;
          const popup = popups.open(href, event.pageX - 320, event.pageY - 12, labels);
          if (!popup) return;
          event.preventDefault();
          body.append(popup);
        });
        owner.on(body, "dragover", (raw) => {
          const event = raw;
          if (config.popupPlayer === true && event.dataTransfer?.types.includes("knife-data")) event.preventDefault();
        });
      },
      reconcileChannel(state, owner) {
        if (state.route?.kind !== "channel" || !state.body) return;
        const list = adapter.page.channelTabs(state.body, state.route);
        if (!list || list.querySelector(".knife-channel-chat")) return;
        const button = browser.document.createElement("button");
        button.type = "button";
        button.className = `${list.lastElementChild?.className || ""} knife-channel-chat knife-owned`;
        button.textContent = `↗ ${labels.chat || "Chat"}`;
        owner.on(button, "click", () => {
          target.location.href = `${String.fromCharCode(47)}live/${state.route?.id || ""}`;
        });
        list.append(button);
        owner.add(() => button.remove());
      },
      reconcileBanner(state, owner) {
        if (!state.body) return;
        const banner = adapter.page.bannerRoot(state.body);
        if (!banner || banner.querySelector("button")) return;
        const close = adapter.banner.closeHandler(banner);
        if (!close) return;
        const button = browser.document.createElement("button");
        button.type = "button";
        button.className = "knife-owned";
        button.textContent = "×";
        owner.on(button, "click", () => {
          try {
            close();
          } catch {
          }
        });
        banner.append(button);
        owner.add(() => button.remove());
      },
      dispose() {
        mounted = null;
        config = {};
        labels = {};
        cache.clear();
      }
    };
  }

  // src/main/features/inject/popup.ts
  function liveURL(target, href) {
    try {
      const url = new URL(href, target.location.origin);
      return url.origin === target.location.origin && /^\/live\/[a-f0-9]{32}\/?$/i.test(url.pathname) ? url : null;
    } catch {
      return null;
    }
  }
  function createPopupRegistry(runtime, target) {
    const browser = target;
    const popups = /* @__PURE__ */ new Map();
    let zIndex = 1e3;
    const disposePopup = (popup, player, scope) => {
      player.src = "about:blank";
      popup.remove();
      popups.delete(popup);
      if (!scope.disposed) scope.dispose();
    };
    return {
      open(href, left, top, labels) {
        const url = liveURL(target, href);
        if (!url) return null;
        let popup = null, player = null, scope = null;
        try {
          const createdPopup = popup = browser.document.createElement("div");
          const createdScope = scope = runtime.createScope();
          createdPopup.classList.add("knife-popup");
          createdPopup.style.left = `${left}px`;
          createdPopup.style.top = `${top}px`;
          createdPopup.style.zIndex = `${zIndex++}`;
          const createdPlayer = player = browser.document.createElement("iframe");
          createdPlayer.classList.add("knife-popup-player");
          createdPlayer.src = url.href;
          createdPlayer.allowFullscreen = true;
          createdPlayer.allow = "autoplay; encrypted-media; picture-in-picture";
          createdPlayer.scrolling = "no";
          createdPopup.append(createdPlayer);
          createdScope.add(() => {
            createdPlayer.src = "about:blank";
            createdPopup.remove();
            popups.delete(createdPopup);
          });
          const dragArea = browser.document.createElement("div");
          dragArea.classList.add("knife-popup-drag-area");
          createdPopup.append(dragArea);
          let x = 0, y = 0, stopDrag = () => {
          };
          const finishDrag = () => stopDrag();
          createdScope.add(() => finishDrag());
          createdScope.on(target, "blur", finishDrag);
          createdScope.on(target, "pagehide", finishDrag);
          createdScope.on(dragArea, "mousedown", (raw) => {
            const event = raw;
            if (event.button !== 0) return;
            event.preventDefault();
            stopDrag();
            createdPopup.style.zIndex = `${zIndex++}`;
            x = event.clientX;
            y = event.clientY;
            const move = (rawMove) => {
              const moveEvent = rawMove;
              if (!(moveEvent.buttons & 1)) {
                stopDrag();
                return;
              }
              moveEvent.preventDefault();
              browser.document.body.classList.add("knife-dragging");
              const dx = moveEvent.clientX - x, dy = moveEvent.clientY - y;
              x = moveEvent.clientX;
              if (createdPopup.offsetTop + dy < 0) createdPopup.style.top = "0";
              else {
                y = moveEvent.clientY;
                createdPopup.style.top = `${createdPopup.offsetTop + dy}px`;
              }
              createdPopup.style.left = `${createdPopup.offsetLeft + dx}px`;
            };
            const up = () => {
              browser.document.removeEventListener("mousemove", move);
              browser.document.removeEventListener("mouseup", up);
              browser.document.body.classList.remove("knife-dragging");
              stopDrag = () => {
              };
            };
            stopDrag = up;
            browser.document.addEventListener("mousemove", move);
            browser.document.addEventListener("mouseup", up);
          });
          const close = browser.document.createElement("button");
          close.classList.add("knife-popup-close-button");
          close.title = labels.close || "";
          close.textContent = "X";
          createdScope.on(close, "click", () => createdScope.dispose());
          createdPopup.append(close);
          popups.set(createdPopup, createdScope);
          return createdPopup;
        } catch {
          try {
            scope?.dispose();
          } catch {
          }
          if (player) player.src = "about:blank";
          popup?.remove();
          return null;
        }
      },
      retireDetached() {
        for (const [popup, scope] of popups) if (!popup.isConnected) {
          try {
            scope.dispose();
          } catch {
            popups.delete(popup);
          }
        }
      },
      dispose() {
        for (const [popup, scope] of [...popups]) {
          const player = popup.querySelector("iframe");
          try {
            if (player instanceof browser.HTMLIFrameElement) disposePopup(popup, player, scope);
            else scope.dispose();
          } catch {
            if (player instanceof browser.HTMLIFrameElement) player.src = "about:blank";
            popup.remove();
            popups.delete(popup);
          }
        }
      }
    };
  }

  // src/main/features/inject/sidebar.ts
  function createSidebarFeature(runtime, target, adapter, preview) {
    const browser = target;
    let config = {}, record = null;
    let observedOwner = null;
    let anchors = /* @__PURE__ */ new WeakSet();
    let userCollapsed = false, enabled = false, wide = null, modeKnown = false;
    let manualCancelled = false, manualUncertain = false, routePath, epoch = 0;
    let settlement = null, intent = null, gesture = null;
    const validLive = (href) => {
      try {
        const url = new browser.URL(href, target.location.origin);
        return url.origin === target.location.origin && /^\/live\/[a-f0-9]{32}\/?$/i.test(url.pathname);
      } catch {
        return false;
      }
    };
    const syncMode = (state = runtime.state) => {
      const route = state.route;
      if (route?.path !== routePath) {
        routePath = route?.path;
        manualCancelled = manualUncertain = false;
        epoch++;
      }
      const next = route ? adapter.sidebar.viewMode(state.body || null, state.player?.pzp || null, route) : null;
      if (next === null) {
        modeKnown = false;
        return;
      }
      modeKnown = true;
      if (next !== wide) {
        if (wide !== null && !manualUncertain) manualCancelled = false;
        wide = next;
        epoch++;
      }
      manualUncertain = false;
    };
    const setEnabled = () => {
      const next = config.expandFollowings === true;
      if (next === enabled) return;
      enabled = next;
      userCollapsed = manualCancelled = manualUncertain = false;
      intent = gesture = null;
      epoch++;
    };
    const bind = (root, state, owner) => {
      if (record?.root === root && record.owner === owner) {
        record.sync();
        return;
      }
      const current = record = {
        root,
        owner,
        timer: null,
        settleTimer: null,
        settleAt: null,
        expanding: false,
        suspended: false,
        sync: () => {
        }
      };
      anchors = /* @__PURE__ */ new WeakSet();
      if (settlement?.epoch === epoch && !settlement.attempted) settlement.quietAt = browser.performance.now();
      const marker = "data-knife-sidebar-section";
      const markers = /* @__PURE__ */ new Map();
      const release = (section) => {
        if (section.getAttribute(marker) === markers.get(section)) section.removeAttribute(marker);
        markers.delete(section);
      };
      const syncSections = () => {
        const sections = new Set(adapter.sidebar.sections(root));
        for (const section of markers.keys()) if (!sections.has(section)) release(section);
        for (const section of sections) {
          const existing = section.getAttribute(marker);
          if (markers.has(section) && existing !== markers.get(section)) {
            markers.delete(section);
            continue;
          }
          if (!markers.has(section) && existing !== null) continue;
          const kind = adapter.sidebar.classify(section);
          if (!kind) {
            if (markers.has(section)) release(section);
            continue;
          }
          if (existing !== kind) section.setAttribute(marker, kind);
          markers.set(section, kind);
        }
      };
      owner.add(() => {
        for (const section of markers.keys()) release(section);
      });
      const controls = () => adapter.sidebar.following(root);
      const control = (value) => value.kind === "more" ? controls()?.more || null : controls()?.fold || null;
      const confirmIntent = () => {
        if (!gesture) return;
        if (gesture.epoch !== epoch) {
          intent = gesture = null;
          return;
        }
        if (browser.performance.now() >= gesture.expires) intent = null;
        const currentControl = control(gesture);
        if (!intent && currentControl !== gesture.control.deref()) {
          gesture = null;
          return;
        }
        const expanded = currentControl?.getAttribute("aria-expanded");
        if (expanded && ["true", "false"].includes(expanded) && expanded !== gesture.before) {
          userCollapsed = expanded === "false";
          intent = gesture = null;
        }
      };
      let expiryIntent = null, expiryTimer;
      const armIntentExpiry = () => {
        if (expiryIntent === intent) return;
        if (expiryTimer !== void 0) target.clearTimeout(expiryTimer);
        expiryIntent = intent;
        if (!expiryIntent) return;
        const expected = expiryIntent;
        expiryTimer = owner.timeout(() => {
          expiryIntent = null;
          if (intent === expected) {
            confirmIntent();
            if (intent === expected) intent = null;
            current.sync();
          }
        }, Math.max(0, expected.expires - browser.performance.now()));
      };
      const stopRefresh = () => {
        if (current.timer !== null) target.clearInterval(current.timer);
        current.timer = null;
      };
      const stopSettlement = () => {
        if (current.settleTimer !== null) target.clearTimeout(current.settleTimer);
        current.settleTimer = current.settleAt = null;
      };
      const scheduleSettlement = (at) => {
        if (current.settleTimer !== null && current.settleAt === at) return;
        stopSettlement();
        current.settleAt = at;
        current.settleTimer = target.setTimeout(() => {
          current.settleTimer = current.settleAt = null;
          current.sync();
        }, Math.max(0, at - browser.performance.now()));
      };
      owner.add(stopSettlement);
      const refresh = () => {
        if (owner.disposed || current.suspended || browser.document.hidden || !root.isConnected || config.updateSidebar !== true) return;
        const button = controls()?.refresh;
        if (button && !button.disabled) button.click();
      };
      current.sync = () => {
        if (owner.disposed || !root.isConnected) {
          stopRefresh();
          stopSettlement();
          return;
        }
        if (runtime.route().path !== runtime.state.route?.path) {
          stopSettlement();
          runtime.reconcile();
          return;
        }
        syncMode();
        confirmIntent();
        armIntentExpiry();
        syncSections();
        const refreshButton = controls()?.refresh;
        if (config.updateSidebar === true && refreshButton) {
          if (current.timer === null && !current.suspended) current.timer = owner.interval(refresh, 3e4);
          runtime.setStatus("sidebarRefresh", "ready");
        } else {
          stopRefresh();
          runtime.setStatus("sidebarRefresh", config.updateSidebar ? "limited" : "disabled", config.updateSidebar ? "following-control-unavailable" : "");
        }
        if (config.expandFollowings !== true) {
          stopSettlement();
          runtime.setStatus("expandFollowings", "disabled");
          return;
        }
        if (userCollapsed) {
          stopSettlement();
          runtime.setStatus("expandFollowings", "disabled", "user-collapsed");
          return;
        }
        if (!modeKnown || wide || current.suspended || browser.document.hidden) {
          stopSettlement();
          if (settlement) settlement.quietAt = browser.performance.now();
          runtime.setStatus(
            "expandFollowings",
            modeKnown ? "pending" : "limited",
            !modeKnown ? "native-mode-unavailable" : wide ? "native-wide-mode" : "page-suspended"
          );
          return;
        }
        const now = browser.performance.now();
        if (settlement?.epoch !== epoch) settlement = { epoch, deadline: now + 5e3, quietAt: now, attempted: false, cancelled: manualCancelled, confirmed: false };
        const active = settlement;
        const more = controls()?.more || null;
        if (active.control?.deref() !== more) {
          active.control = more ? new WeakRef(more) : null;
          active.quietAt = now;
        }
        if (!more || !["true", "false"].includes(more.getAttribute("aria-expanded") || "")) {
          if (!active.cancelled && !active.attempted && now < active.deadline) scheduleSettlement(active.deadline);
          else stopSettlement();
          runtime.setStatus("expandFollowings", "limited", "following-control-unavailable");
          return;
        }
        if (more.getAttribute("aria-expanded") === "true") {
          active.confirmed = true;
          stopSettlement();
          runtime.setStatus("expandFollowings", "ready");
          return;
        }
        if (active.cancelled) {
          stopSettlement();
          runtime.setStatus("expandFollowings", "pending", "user-activation");
          return;
        }
        if (active.attempted) {
          if (!active.confirmed && now < active.deadline) scheduleSettlement(active.deadline);
          else stopSettlement();
          runtime.setStatus(
            "expandFollowings",
            active.confirmed || now >= active.deadline ? "limited" : "pending",
            active.confirmed ? "following-native-reset" : "following-expand-unconfirmed"
          );
          return;
        }
        if (now >= active.deadline) {
          stopSettlement();
          runtime.setStatus("expandFollowings", "limited", "following-settlement-timeout");
          return;
        }
        if (more.disabled || intent || now - active.quietAt < 500) {
          scheduleSettlement(more.disabled || intent ? active.deadline : Math.min(active.deadline, active.quietAt + 500));
          runtime.setStatus("expandFollowings", "pending", "following-native-settling");
          return;
        }
        stopSettlement();
        active.attempted = true;
        current.expanding = true;
        try {
          more.click();
        } finally {
          current.expanding = false;
        }
        current.sync();
      };
      owner.on(root, "click", (raw) => {
        if (current.expanding || config.expandFollowings !== true) return;
        const event = raw;
        const button = event.target instanceof browser.Element ? event.target.closest("button[aria-expanded]") : null;
        const found = controls();
        if (!(button instanceof browser.HTMLButtonElement) || button.disabled || !found?.section.contains(button)) return;
        const kind = button === found.more ? "more" : button === found.fold ? "fold" : null;
        const expanded = button.getAttribute("aria-expanded");
        if (!kind || !expanded || !["true", "false"].includes(expanded)) return;
        syncMode();
        manualCancelled = true;
        manualUncertain = !modeKnown;
        if (settlement?.epoch === epoch) settlement.cancelled = true;
        stopSettlement();
        intent = gesture = { kind, before: expanded, control: new WeakRef(button), epoch, expires: browser.performance.now() + 200 };
        armIntentExpiry();
      }, { capture: true });
      owner.on(root, "click", confirmIntent);
      owner.add(stopRefresh);
      owner.on(target, "pagehide", () => {
        current.suspended = true;
        stopRefresh();
        stopSettlement();
      });
      owner.on(target, "pageshow", () => {
        current.suspended = false;
        if (settlement) settlement.quietAt = browser.performance.now();
        current.sync();
      });
      const attach = (anchor) => {
        if (!validLive(anchor.href) || anchors.has(anchor)) return;
        anchors.add(anchor);
        anchor.draggable = true;
        owner.on(anchor, "mouseenter", () => {
          if (config.preview !== true) return;
          try {
            void preview()?.show(anchor.href, anchor, true).catch(() => {
            });
          } catch {
          }
        });
        owner.on(anchor, "mouseleave", () => {
          try {
            preview()?.hide(anchor.href);
          } catch {
          }
        });
        owner.on(anchor, "dragstart", (raw) => {
          const event = raw;
          if (!config.popupPlayer || !event.dataTransfer || !validLive(anchor.href)) return;
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("knife-data", anchor.href);
        });
      };
      for (const node of root.querySelectorAll("a[href]")) if (node instanceof browser.HTMLAnchorElement) attach(node);
      owner.observe(new browser.MutationObserver((mutations) => {
        const found = controls(), more = found?.more, fold = found?.fold;
        const nativeUpdate = mutations.some((mutation) => found?.section.contains(mutation.target) && !(mutation.target instanceof browser.Element && mutation.target.closest(".knife-owned")) && (mutation.type !== "attributes" || (mutation.target === more || mutation.target === fold) && mutation.attributeName !== "class" && mutation.attributeName !== "href"));
        if (nativeUpdate && settlement?.epoch === epoch && !settlement.attempted) settlement.quietAt = browser.performance.now();
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.attributeName === "href" && mutation.target instanceof browser.HTMLAnchorElement) attach(mutation.target);
          for (const added of mutation.addedNodes) if (added instanceof browser.Element) {
            if (added instanceof browser.HTMLAnchorElement && added.matches("a[href]")) attach(added);
            for (const node of added.querySelectorAll("a[href]")) if (node instanceof browser.HTMLAnchorElement) attach(node);
          }
        }
        current.sync();
      }), root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-expanded", "disabled", "aria-label", "href", "class"]
      });
      current.sync();
    };
    return {
      reconcile(root, state, owner, nextConfig) {
        config = nextConfig;
        setEnabled();
        syncMode(state);
        if (observedOwner !== owner) {
          observedOwner = owner;
          const changed = () => {
            syncMode();
            record?.sync();
          };
          if (state.body) owner.observe(
            new browser.MutationObserver(changed),
            state.body,
            { attributes: true, attributeFilter: ["class"] }
          );
          if (state.player?.pzp) owner.observe(
            new browser.MutationObserver(changed),
            state.player.pzp,
            { attributes: true, subtree: true, attributeFilter: ["class", "aria-label", "aria-pressed"] }
          );
        }
        if (root) bind(root, state, owner);
      },
      dispose() {
        record = null;
        observedOwner = null;
        anchors = /* @__PURE__ */ new WeakSet();
        config = {};
      }
    };
  }

  // src/main/features/inject/coordinator.ts
  function startCoordinator(target) {
    const browser = target;
    const key = browser.Symbol.for("cheese-knife.runtime.v1");
    const runtime = Object.getOwnPropertyDescriptor(target, key)?.value;
    if (!runtime || runtime.coordinatorStarted) return false;
    const adapter = runtime.adapter;
    if (!adapter) {
      for (const feature of ["donationChat", "deletedChat", "chatTimestamp"]) runtime.setStatus(feature, "pending", "site-adapter-unavailable");
      return false;
    }
    const popups = createPopupRegistry(runtime, target);
    const chat = createChatFeature(runtime, target, adapter);
    const sidebar = createSidebarFeature(runtime, target, adapter, () => runtime.preview);
    const page = createPageFeature(runtime, target, adapter, popups);
    let owner = null, ownerGeneration = -1, unsubscribe = null, disposed = false;
    const status = (feature) => {
      try {
        runtime.setStatus(feature, "failed", "feature-initialization");
      } catch {
      }
    };
    const fail = (feature, action) => {
      try {
        action();
      } catch {
        status(feature);
      }
    };
    const retireOwner = () => {
      const previous = owner;
      owner = null;
      ownerGeneration = -1;
      if (previous) fail("runtime", () => previous.dispose());
    };
    const reconcile = (state) => {
      if (disposed) return;
      const config = runtime.config, labels = runtime.i18n;
      fail("popupPlayer", () => popups.retireDetached());
      if (!runtime.configReady || state.route?.kind === "excluded") {
        retireOwner();
        if (state.route?.kind === "excluded") fail("popupPlayer", () => popups.dispose());
        return;
      }
      if (!owner || ownerGeneration !== runtime.generation) {
        retireOwner();
        try {
          owner = runtime.createScope();
          ownerGeneration = runtime.generation;
        } catch {
          status("runtime");
          return;
        }
      }
      const activeOwner = owner;
      fail("startTime", () => page.mountOwner(state, activeOwner, config, labels));
      fail("sidebarRefresh", () => sidebar.reconcile(state.sidebar || null, state, activeOwner, config));
      fail("channelChat", () => page.reconcileChannel(state, activeOwner));
      const routeKind = state.route?.kind;
      fail("donationChat", () => {
        const container = state.body && (routeKind === "live" || routeKind === "vod") ? adapter.chat.findContainer(state.body, routeKind) : null;
        chat.reconcile(container, routeKind === "live", activeOwner, config);
      });
      fail("bannerClose", () => page.reconcileBanner(state, activeOwner));
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      const stop = unsubscribe;
      unsubscribe = null;
      if (stop) fail("runtime", () => {
        stop();
      });
      retireOwner();
      fail("donationChat", () => chat.dispose());
      fail("sidebarRefresh", () => sidebar.dispose());
      fail("startTime", () => page.dispose());
      fail("popupPlayer", () => popups.dispose());
    };
    runtime.coordinatorStarted = true;
    try {
      unsubscribe = runtime.subscribe(reconcile);
      target.addEventListener("pagehide", (raw) => {
        if (!raw.persisted) dispose();
      });
      return true;
    } catch {
      Reflect.deleteProperty(runtime, "coordinatorStarted");
      dispose();
      return false;
    }
  }

  // src/main/features/inject/entry.ts
  startCoordinator(window);
})();
