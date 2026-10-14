// Generated from src/main/features/player/entry.ts by scripts/main-runtime.mjs. Do not edit.
"use strict";
(() => {
  // src/main/features/player/seek.ts
  function ranges(video) {
    const list = video.seekable?.length ? video.seekable : video.buffered;
    const result = [];
    for (let index = 0; index < (list?.length || 0); index++) {
      const start = list.start(index);
      const end = list.end(index);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) result.push([start, end]);
    }
    return result;
  }
  function bounded(value, available, forward) {
    let previous;
    for (const [start2, end2] of available) {
      const insideEnd = end2 - Math.min(0.05, (end2 - start2) / 2);
      if (value >= start2 && value <= insideEnd) return value;
      if (value < start2) {
        if (forward) return start2;
        return previous ? previous[1] - Math.min(0.05, (previous[1] - previous[0]) / 2) : start2;
      }
      previous = [start2, end2];
    }
    const [start, end] = available.at(-1);
    return end - Math.min(0.05, (end - start) / 2);
  }
  function readStats(video, metrics) {
    return {
      resolution: video.videoWidth > 0 && video.videoHeight > 0 ? `${video.videoWidth}×${video.videoHeight}` : null,
      bitrate: null,
      latency: null,
      codec: metrics?.codec || null
    };
  }

  // src/main/features/player/controls.ts
  var audioIntents = /* @__PURE__ */ new WeakMap();
  function audioIntent(runtime, video) {
    const context = runtime.media.context;
    let intent = audioIntents.get(video);
    if (!intent || intent.path !== context.routePath) {
      intent = { path: context.routePath, manual: false, requested: false, automatic: false, binding: -1, needsResume: false };
      audioIntents.set(video, intent);
    }
    return intent;
  }
  var labelKeys = /* @__PURE__ */ new Set([
    "fastForward",
    "stats",
    "close",
    "unknown",
    "resolution",
    "bitrate",
    "fps",
    "measured",
    "latency",
    "codec",
    "enableCompressor",
    "disableCompressor",
    "speed2x"
  ]);
  function label(runtime, key, fallback) {
    if (!labelKeys.has(key)) return fallback;
    const value = Object.getOwnPropertyDescriptor(runtime.i18n || {}, key)?.value;
    return typeof value === "string" && value ? value : fallback;
  }
  function pointerOf(event) {
    return event instanceof Event && event.type.startsWith("pointer") ? event : null;
  }
  function ownedButton(document, className, text, iconKind) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `pzp-button knife-owned ${className}`;
    button.title = text;
    button.setAttribute("aria-label", text);
    const svgNamespace = ["http:", "", "www.w3.org", "2000", "svg"].join(String.fromCharCode(47));
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "22");
    svg.setAttribute("height", "22");
    svg.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(svgNamespace, "path");
    if (iconKind === "compressor") {
      shape.setAttribute("stroke", "currentColor");
      shape.setAttribute("stroke-width", "2");
      shape.setAttribute("d", "M3 7v10m4-13v16m5-18v20m5-18v16m4-13v10");
    } else {
      shape.setAttribute("fill", "currentColor");
      shape.setAttribute("d", "M4 6v12l8-6zm9 0v12l8-6z");
    }
    svg.append(shape);
    button.append(svg);
    return button;
  }
  function mountPlayer(runtime, snapshot) {
    const target = snapshot.pzp.ownerDocument.defaultView;
    if (!target) throw new Error("player-window-unavailable");
    const scope = runtime.createScope();
    const nodes = /* @__PURE__ */ new Set();
    const mount = {
      ...snapshot,
      runtime,
      target,
      scope,
      nodes,
      pointer: null,
      cancelledHold: null,
      clickBlock: null,
      clickTimer: null,
      path: runtime.state.route?.path || "",
      track(node) {
        nodes.add(node);
        return node;
      },
      stopHold: (_event) => {
      }
    };
    scope.add(() => {
      for (const node of nodes) node.remove();
    });
    const clearClick = () => {
      if (mount.clickTimer !== null) target.clearTimeout(mount.clickTimer);
      mount.clickTimer = null;
      mount.clickBlock = null;
      mount.cancelledHold = null;
    };
    scope.add(clearClick);
    const blockCompletingClick = (hold) => {
      clearClick();
      mount.clickBlock = { target: hold.target, id: hold.id };
      mount.clickTimer = target.setTimeout(clearClick, 1e3);
    };
    mount.stopHold = (event) => {
      const pointer = pointerOf(event);
      const cancelled = mount.cancelledHold;
      if (cancelled) {
        if (pointer && pointer.pointerId !== cancelled.id) return;
        if (event?.type === "pointerup") blockCompletingClick(cancelled);
        else if (event?.type !== "config-off") mount.cancelledHold = null;
      }
      const hold = mount.pointer;
      if (!hold) return;
      if (pointer && pointer.pointerId !== hold.id) return;
      mount.pointer = null;
      target.clearTimeout(hold.timer);
      if (hold.active && event?.type === "pointerup") blockCompletingClick(hold);
      else if (hold.active && event?.type === "config-off") {
        clearClick();
        mount.cancelledHold = { target: hold.target, id: hold.id };
      }
      if (hold.active && mount.video.playbackRate === 2) mount.video.playbackRate = hold.originalRate;
      if (hold.active && hold.startedPlaying && !mount.video.paused) mount.video.pause();
      hold.indicator?.remove();
      if (hold.target.hasPointerCapture?.(hold.id)) hold.target.releasePointerCapture(hold.id);
    };
    scope.add(mount.stopHold);
    scope.on(target, "pointerdown", clearClick, true);
    scope.on(target, "click", (event) => {
      const block = mount.clickBlock;
      const click = event;
      const eventTarget = event.target;
      if (!block || click.detail === 0 || "pointerId" in click && typeof click.pointerId === "number" && click.pointerId !== block.id || !(eventTarget instanceof target.Node) || !(block.target.contains(eventTarget) || eventTarget === mount.pzp)) return;
      clearClick();
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    scope.on(target, "blur", mount.stopHold);
    scope.on(target, "pagehide", mount.stopHold);
    scope.on(target, "pointerup", mount.stopHold, true);
    scope.on(target, "pointercancel", mount.stopHold, true);
    scope.on(target, "pointermove", (event) => {
      const hold = mount.pointer;
      const pointer = event;
      if (hold && !hold.active && (Math.abs(pointer.clientX - hold.x) > 10 || Math.abs(pointer.clientY - hold.y) > 10)) mount.stopHold();
    }, true);
    return mount;
  }
  function syncControls(mount) {
    const { runtime, target, pzp, video, scope } = mount;
    const document = target.document;
    if (runtime.config.pressToFastForward !== true) mount.stopHold({ type: "config-off" });
    if (runtime.state.route?.kind === "live") {
      const play = pzp.querySelector(".pzp-pc__playback-switch");
      if (play && !pzp.querySelector(".knife-ff")) {
        const button = mount.track(ownedButton(document, "pzp-pc__playback-switch knife-ff", label(runtime, "fastForward", "Live edge"), "live-edge"));
        scope.on(button, "click", (event) => {
          event.stopPropagation();
          runtime.player?.liveEdge();
        });
        play.after(button);
      }
    }
    const license = mount.layout.querySelector("#license") || document.getElementById("license");
    if (license && pzp.contains(license) && !pzp.querySelector("#knife-stats")) {
      const menu = mount.track(license.cloneNode(true));
      menu.id = "knife-stats";
      menu.classList.add("knife-owned");
      const link = menu.querySelector("button,a");
      if (link) {
        link.textContent = label(runtime, "stats", "Stats");
        if (link instanceof target.HTMLAnchorElement) link.href = "#";
        scope.on(link, "click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (mount.layout.querySelector(".knife-stats-overlay")) return;
          const overlayScope = runtime.createScope();
          scope.add(() => overlayScope.dispose());
          const overlay = mount.track(document.createElement("div"));
          overlay.className = "knife-stats-overlay knife-owned";
          const content = document.createElement("pre");
          const close = document.createElement("button");
          close.type = "button";
          close.textContent = "×";
          close.title = label(runtime, "close", "Close");
          overlay.append(content, close);
          mount.layout.append(overlay);
          overlayScope.add(() => overlay.remove());
          overlayScope.on(close, "click", () => overlayScope.dispose());
          let last;
          const update = async () => {
            let metrics = null;
            try {
              metrics = await runtime.adapter?.player.readMetrics(mount.layout) || null;
            } catch {
            }
            if (overlayScope.disposed || scope.disposed) return;
            const info = readStats(video, metrics);
            let fps = null;
            const quality = video.getVideoPlaybackQuality?.();
            const now = target.performance.now();
            if (quality) {
              if (last && now > last.at) fps = Math.round((quality.totalVideoFrames - last.frames) * 1e3 / (now - last.at));
              last = { frames: quality.totalVideoFrames, at: now };
            }
            const unknown = label(runtime, "unknown", "Unknown");
            content.textContent = [
              `${label(runtime, "resolution", "Resolution")}: ${info.resolution || unknown}`,
              `${label(runtime, "bitrate", "Bitrate")}: ${unknown}`,
              `${label(runtime, "fps", "FPS")} (${label(runtime, "measured", "measured")}): ${fps ?? unknown}`,
              `${label(runtime, "latency", "Latency")}: ${unknown}`,
              `${label(runtime, "codec", "Codec")}: ${info.codec || unknown}`
            ].join("\n");
          };
          void update();
          overlayScope.interval(() => {
            void update();
          }, 1e3);
          runtime.setStatus("statistics", "limited", "internal-metrics-unavailable");
        });
        license.before(menu);
      }
    }
    const audio = runtime.audio;
    if (audio) {
      const volume = pzp.querySelector(".pzp-pc__volume-control:not(.knife-comp)");
      if (volume && !pzp.querySelector(".knife-comp")) {
        const box = mount.track(document.createElement("div"));
        box.className = "pzp-pc__volume-control knife-comp knife-owned";
        const button = ownedButton(document, "pzp-pc__volume-button", label(runtime, "enableCompressor", "Enable compressor"), "compressor");
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "2";
        slider.step = "0.05";
        slider.className = "knife-gain-slider";
        slider.setAttribute("aria-label", "Gain");
        box.append(button, slider);
        volume.after(box);
        scope.on(button, "click", (event) => {
          event.stopPropagation();
          const intent2 = audioIntent(runtime, video);
          intent2.manual = true;
          intent2.automatic = false;
          intent2.needsResume = !runtime.mediaCurrent();
          void audio.setEnabled(video, !["on", "pending"].includes(audio.getState(video)));
        });
        scope.on(slider, "input", () => audio.setGain(video, Number(slider.value)));
        scope.on(slider, "keydown", (event) => event.stopPropagation());
        scope.add(audio.subscribe(video, (status, gain) => {
          box.dataset.state = status;
          button.setAttribute("aria-pressed", String(status === "on"));
          const text = label(runtime, status === "on" || status === "pending" ? "disableCompressor" : "enableCompressor", "Compressor");
          button.title = text;
          button.setAttribute("aria-label", text);
          slider.value = String(gain);
          slider.hidden = status !== "on";
          slider.title = `${Math.round(gain * 100)}%`;
        }));
      }
      const intent = audioIntent(runtime, video);
      if (!runtime.mediaCurrent()) {
        audio.suspend(video);
        intent.needsResume = true;
      } else {
        if (intent.binding !== runtime.media.audioBindingGeneration) {
          if (intent.automatic && !intent.manual) {
            audio.bypass(video);
            intent.automatic = false;
            intent.requested = false;
          }
          if (intent.manual && audio.getState(video) === "pending") intent.needsResume = true;
          intent.binding = runtime.media.audioBindingGeneration;
        }
        audio.configure();
        if (intent.needsResume) {
          intent.needsResume = false;
          void audio.resumeWanted(video);
        }
        if (runtime.config.compressorDefault === true && !intent.requested && !intent.manual && audio.eligible(video)) {
          intent.requested = true;
          intent.automatic = true;
          void audio.setEnabled(video, true);
        }
      }
    }
    const container = pzp.querySelector(".pzp-pc__video");
    if (runtime.state.route?.kind === "vod" && container && mount.holdTarget !== container) {
      mount.holdTarget = container;
      scope.on(container, "pointerdown", (event) => {
        const pointer = event;
        if (pointer.button !== 0 || runtime.config.pressToFastForward !== true) return;
        mount.stopHold();
        const hold = {
          target: container,
          id: pointer.pointerId,
          x: pointer.clientX,
          y: pointer.clientY,
          originalRate: video.playbackRate,
          active: false,
          timer: 0
        };
        mount.pointer = hold;
        hold.timer = target.setTimeout(async () => {
          if (mount.pointer !== hold || scope.disposed) return;
          if (runtime.config.pressToFastForward !== true) {
            mount.stopHold();
            return;
          }
          hold.active = true;
          hold.originalRate = video.playbackRate;
          video.playbackRate = 2;
          const indicator = hold.indicator = document.createElement("div");
          indicator.className = "knife-ff-indicator knife-owned";
          indicator.textContent = label(runtime, "speed2x", "2x");
          pzp.append(indicator);
          try {
            container.setPointerCapture?.(hold.id);
            if (video.paused) {
              hold.startedPlaying = true;
              await video.play();
              if (mount.pointer !== hold && !video.paused) video.pause();
            }
          } catch {
            mount.stopHold();
          }
        }, 500);
      });
    }
  }
  function installPlayer(target) {
    const browser = target;
    const key = browser.Symbol.for("cheese-knife.runtime.v1");
    const runtime = Object.getOwnPropertyDescriptor(target, key)?.value;
    if (runtime?.ownerProtocol !== 2 || runtime.player) return null;
    if (!runtime.adapter) runtime.setStatus("player", "pending", "site-adapter-unavailable");
    let current = null;
    let unsubscribe = null;
    let disposed = false;
    const disposeCurrent = () => {
      current?.scope.dispose();
      current = null;
    };
    const controller = {
      seek(backward) {
        const video = runtime.state.player?.video;
        if (runtime.state.route?.kind !== "live" || runtime.config.arrowSeek !== true || !video) return false;
        const available = ranges(video);
        if (!available.length) return false;
        video.currentTime = bounded(video.currentTime + (backward ? -5 : 5), available, !backward);
        return true;
      },
      liveEdge() {
        const video = runtime.state.player?.video;
        if (!video) return;
        const available = ranges(video);
        if (available.length) video.currentTime = bounded(Infinity, available, true);
      },
      ranges,
      readStats
    };
    const reconcile = (state) => {
      const player = state.player;
      if (runtime.configReady) {
        const values = (config) => KnifeMediaProfiles.validateValues("video", Object.fromEntries(
          KnifeMediaProfiles.videoFields.map((field) => [field.id, Object.getOwnPropertyDescriptor(config, field.id)?.value])
        ));
        const base = values(runtime.baseConfig), channel = runtime.media.videoKind === "channel" && runtime.mediaCurrent() ? values(runtime.config) : null;
        if (base.ok && base.domain === "video") runtime.filters?.reconcile(
          base.values,
          channel?.ok && channel.domain === "video" ? channel.values : null,
          player?.filterTarget ?? null
        );
      }
      if (current && (!runtime.configReady || !player || current.pzp !== player.pzp || current.video !== player.video || current.layout !== player.layout || current.path !== state.route?.path)) {
        current.scope.dispose();
        current = null;
      }
      if (!runtime.configReady || !player?.video || !player.layout) return;
      if (!current) {
        current = mountPlayer(runtime, player);
        for (const type of ["loadedmetadata", "loadeddata", "emptied"]) current.scope.on(player.video, type, () => runtime.schedule());
      }
      syncControls(current);
      runtime.setStatus("player", "ready");
    };
    const onKeyDown = (event) => {
      const element = event.target instanceof browser.Element ? event.target : null;
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !["ArrowLeft", "ArrowRight"].includes(event.key) || element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"]')) return;
      const video = runtime.state.player?.video;
      if (runtime.state.route?.kind !== "live" || runtime.config.arrowSeek !== true || !video || video.seeking || !ranges(video).length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      controller.seek(event.key === "ArrowLeft");
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      disposeCurrent();
      unsubscribe?.();
      unsubscribe = null;
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("pagehide", onPageHide);
      if (runtime.player === controller) Reflect.deleteProperty(runtime, "player");
    };
    const onPageHide = (event) => {
      if (!event.persisted) dispose();
    };
    const onState = (state) => {
      if (disposed) return;
      try {
        reconcile(state);
      } catch {
        disposeCurrent();
        runtime.setStatus("player", "failed", "feature-initialization");
      }
    };
    try {
      unsubscribe = runtime.subscribe(onState);
      target.addEventListener("keydown", onKeyDown);
      target.addEventListener("pagehide", onPageHide);
      runtime.player = controller;
      return controller;
    } catch {
      dispose();
      return null;
    }
  }

  // src/main/features/player/filters.ts
  function installVideoFilters(target) {
    const browser = target;
    const runtime = Object.getOwnPropertyDescriptor(target, browser.Symbol.for("cheese-knife.runtime.v1"))?.value;
    if (runtime?.ownerProtocol !== 2 || runtime.filters) return null;
    const document = target.document;
    let global = null, channel = null, disposed = false;
    let element = null, slot = null, body = null, ownsBodyClass = false;
    const svgNamespace = ["http:", "", "www.w3.org", "2000", "svg"].join(String.fromCharCode(47));
    const create = (tag) => document.createElementNS(svgNamespace, tag);
    const owned = (renderer2) => renderer2.svg.isConnected && renderer2.filter.parentNode === renderer2.svg && document.getElementById(renderer2.filter.id) === renderer2.filter;
    function renderer(id, existing) {
      if (existing) return owned(existing) ? existing : null;
      if (document.getElementById(id) || !document.body) return null;
      const svg = create("svg"), filter = create("filter");
      svg.classList.add("knife-owned");
      svg.style.display = "none";
      filter.id = id;
      svg.append(filter);
      document.body.append(svg);
      return { svg, filter };
    }
    function render(filter, values) {
      const children = [];
      for (const [kind, value] of [["brightness", values.brightness], ["contrast", values.contrast], ["gamma", values.gamma]]) {
        if (value === 1) continue;
        const transfer = create("feComponentTransfer");
        for (const tag of ["feFuncR", "feFuncG", "feFuncB"]) {
          const fn = create(tag);
          fn.setAttribute("type", kind === "gamma" ? "gamma" : "linear");
          if (kind === "gamma") fn.setAttribute("exponent", String(value));
          else {
            fn.setAttribute("slope", String(value));
            if (kind === "contrast") fn.setAttribute("intercept", String(-value / 2 + 0.5));
          }
          transfer.append(fn);
        }
        children.push(transfer);
      }
      if (values.saturation !== 1) {
        const matrix = create("feColorMatrix");
        matrix.setAttribute("type", "saturate");
        matrix.setAttribute("values", String(values.saturation));
        children.push(matrix);
      }
      if (values.sharpness > 0) {
        const amount = Number((values.sharpness / 5).toFixed(2)), matrix = create("feConvolveMatrix");
        matrix.setAttribute("preserveAlpha", "true");
        matrix.setAttribute("kernelMatrix", `0 ${-amount} 0 ${-amount} ${1 + amount * 4} ${-amount} 0 ${-amount} 0`);
        children.push(matrix);
      }
      filter.replaceChildren(...children);
      return children.length > 0;
    }
    function retireChannel() {
      if (element) {
        if (element.getAttribute("data-knife-channel-filter") === "owned") element.removeAttribute("data-knife-channel-filter");
        if (element.style.getPropertyValue("--knife-channel-filter") === slot) element.style.removeProperty("--knife-channel-filter");
      }
      element = null;
      slot = null;
      if (channel && owned(channel)) channel.svg.remove();
      channel = null;
    }
    const controller = {
      reconcile(base, values, filterTarget) {
        if (disposed) return;
        if (KnifeMediaProfiles.validateValues("video", base).ok) {
          global = renderer("knifeFilter", global);
          if (global) {
            const active = render(global.filter, base);
            if (body !== document.body) {
              if (ownsBodyClass) body?.classList.remove("knife-filter");
              body = document.body;
              ownsBodyClass = false;
            }
            if (active && body && !body.classList.contains("knife-filter")) {
              body.classList.add("knife-filter");
              ownsBodyClass = true;
            } else if (!active && ownsBodyClass) {
              body?.classList.remove("knife-filter");
              ownsBodyClass = false;
            }
          }
        }
        const validTarget = !!values && filterTarget instanceof browser.HTMLElement && filterTarget.isConnected && runtime.selectPlayer()?.filterTarget === filterTarget;
        if (element !== filterTarget || !values || !validTarget) retireChannel();
        if (!values || !validTarget || !KnifeMediaProfiles.validateValues("video", values).ok) return;
        const current = filterTarget;
        if (element && (current.getAttribute("data-knife-channel-filter") !== "owned" || current.style.getPropertyValue("--knife-channel-filter") !== slot)) {
          retireChannel();
          return;
        }
        if (!element && (current.hasAttribute("data-knife-channel-filter") || current.style.getPropertyValue("--knife-channel-filter") || current.style.filter)) return;
        channel = renderer("knifeChannelFilter", channel);
        if (!channel) return;
        slot = render(channel.filter, values) ? "url(#knifeChannelFilter)" : "none";
        element = current;
        current.setAttribute("data-knife-channel-filter", "owned");
        current.style.setProperty("--knife-channel-filter", slot);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        retireChannel();
        if (global && owned(global)) global.svg.remove();
        if (ownsBodyClass) body?.classList.remove("knife-filter");
        target.removeEventListener("pagehide", onHide);
      }
    };
    const onHide = (event) => {
      if (!event.persisted) controller.dispose();
    };
    target.addEventListener("pagehide", onHide);
    runtime.filters = controller;
    return controller;
  }

  // src/main/features/player/entry.ts
  installVideoFilters(window);
  installPlayer(window);
})();
