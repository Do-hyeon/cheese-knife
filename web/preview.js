// Generated from src/main/features/preview/entry.ts by scripts/main-runtime.mjs. Do not edit.
"use strict";
(() => {
  // src/main/features/preview/panel.ts
  function createPanel(runtime, scope) {
    const document = runtime.state.body?.ownerDocument || window.document;
    const target = document.defaultView || window;
    const panel = {
      diagnostics: { events: [] },
      root: null,
      image: null,
      player: null,
      uptime: null,
      audioNote: null,
      ensure() {
        if (panel.root?.isConnected) return;
        const root = document.createElement("div");
        root.className = "knife-preview knife-owned";
        root.hidden = true;
        const image = document.createElement("img");
        image.alt = "";
        const player = document.createElement("div");
        player.className = "knife-preview-player";
        const uptime = document.createElement("div");
        uptime.className = "knife-preview-uptime";
        const audioNote = document.createElement("div");
        audioNote.className = "knife-preview-audio-note";
        audioNote.hidden = true;
        root.append(image, player, uptime, audioNote);
        document.body.append(root);
        panel.root = root;
        panel.image = image;
        panel.player = player;
        panel.uptime = uptime;
        panel.audioNote = audioNote;
      },
      place(anchor, tooltip, configuredWidth) {
        panel.ensure();
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(Math.max(configuredWidth, rect.width), target.innerWidth - 32);
        panel.root.style.position = "fixed";
        panel.root.style.width = `${width}px`;
        panel.root.style.left = `${Math.max(16, Math.min(rect.left, target.innerWidth - width - 16))}px`;
        panel.root.style.top = `${Math.max(0, Math.min(tooltip ? rect.bottom : rect.top, target.innerHeight - width * 9 / 16))}px`;
      },
      setImage(source) {
        panel.ensure();
        if (source) panel.image.src = source.replace("{type}", "480");
        else panel.image.removeAttribute("src");
      },
      setUptime(text) {
        panel.ensure();
        panel.uptime.textContent = text;
      },
      show() {
        panel.ensure();
        panel.root.hidden = false;
      },
      hide() {
        if (!panel.root) return;
        panel.root.hidden = true;
        panel.image.removeAttribute("src");
        panel.audioNote.hidden = true;
      },
      dispose() {
        panel.root?.remove();
        panel.root = null;
        panel.image = null;
        panel.player = null;
        panel.uptime = null;
        panel.audioNote = null;
      }
    };
    scope.add(() => panel.dispose());
    return panel;
  }

  // src/main/features/preview/playback.ts
  var sessionSequence = 0;
  function own(record, key) {
    if (typeof record !== "object" || record === null) return void 0;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && "value" in descriptor ? descriptor.value : void 0;
  }
  function code(value) {
    return typeof value === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : "unknown";
  }
  function errorInfo(value) {
    const response = own(value, "response");
    const status = own(response, "code");
    return {
      type: code(own(value, "type")),
      details: code(own(value, "details")),
      fatal: own(value, "fatal") === true,
      status: typeof status === "number" && Number.isFinite(status) ? status : null
    };
  }
  function volume(runtime) {
    const value = runtime.config.previewVolume;
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : 0.05;
  }
  function createPlayback(runtime, panel, intent, info) {
    const target = intent.anchor.ownerDocument.defaultView;
    if (!target || !panel.player || !panel.root || !panel.audioNote) throw new Error("preview-window-unavailable");
    const Hls = runtime.Hls;
    panel.diagnostics.hlsSupported = !!Hls?.isSupported();
    const path = info.playback?.media.find((item) => item.mediaId === "HLS")?.path;
    const controller = new target.AbortController();
    const timers = /* @__PURE__ */ new Set();
    let disposed = false;
    let failed = false;
    const video = target.document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.volume = volume(runtime);
    video.className = "knife-preview-video";
    video.style.visibility = "hidden";
    video.style.cssText += ";width:100%;height:100%;object-fit:contain;background:#000;";
    panel.player.append(video);
    const session = {
      token: ++sessionSequence,
      abort: controller,
      timers,
      backend: null,
      media: video,
      dispose() {
        if (disposed) return;
        disposed = true;
        controller.abort();
        for (const timer of timers) target.clearTimeout(timer);
        timers.clear();
        try {
          session.backend?.destroy();
        } catch {
        }
        session.backend = null;
        try {
          video.pause();
          video.removeAttribute("src");
          video.srcObject = null;
          video.load();
        } catch {
        }
        video.remove();
        session.media = null;
      },
      play: async () => {
      },
      toggle: () => {
      },
      refresh: () => {
      },
      setVolume: () => {
        video.volume = volume(runtime);
      }
    };
    const later = (callback, delay) => {
      const timer = target.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
      return timer;
    };
    const ownsAnchor = () => !!runtime.state.sidebar?.isConnected && intent.anchor.isConnected && runtime.state.sidebar.contains(intent.anchor);
    const active = () => !disposed && !failed && session.media === video && ownsAnchor() && intent.anchor.href === intent.href && target.location.pathname === intent.route && runtime.config.preview === true && runtime.configReady && !target.document.hidden;
    const note = (event) => {
      panel.diagnostics.events.push(event);
      if (panel.diagnostics.events.length > 20) panel.diagnostics.events.shift();
    };
    const sample = (type) => {
      if (!active()) return;
      let ahead = 0;
      for (let index = 0; index < video.buffered.length; index++) {
        if (video.buffered.start(index) <= video.currentTime && video.buffered.end(index) >= video.currentTime) ahead = video.buffered.end(index) - video.currentTime;
      }
      note({
        type,
        currentTime: video.currentTime,
        readyState: video.readyState,
        bufferedAhead: ahead,
        width: video.videoWidth,
        height: video.videoHeight,
        paused: video.paused
      });
    };
    const fail = (reason = "stream-playback-unavailable") => {
      if (!active()) return;
      failed = true;
      intent.invalidate();
      try {
        session.backend?.destroy();
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
      }
      session.backend = null;
      video.style.visibility = "hidden";
      panel.audioNote.hidden = true;
      runtime.setStatus("livePreview", "limited", reason);
    };
    if (!path) {
      failed = true;
      video.remove();
      session.media = null;
      runtime.setStatus("livePreview", "limited", info.adult ? "age-restricted-stream" : "stream-unavailable");
      return session;
    }
    let attempt = 0;
    let playingRequest = null;
    let dataReady = false;
    const startUnmuted = intent.startUnmuted;
    let desiredMuted = !startUnmuted;
    let audioRevision = 0;
    let fallbackUsed = false;
    let soundBlocked = false;
    let policyBlockRevision = null;
    let recoveries = 0;
    let loaded = false;
    let watching = false;
    let lastTime = 0;
    let lastProgress = 0;
    const watchProgress = () => {
      if (!active()) return;
      const now = target.performance.now();
      if (Math.abs(video.currentTime - lastTime) > 0.01) lastProgress = now;
      else if (now - lastProgress >= 1e4) {
        sample("stalled-timeout");
        fail("stream-stalled");
        return;
      }
      lastTime = video.currentTime;
      later(watchProgress, 1e3);
    };
    const renderAudioNote = () => {
      if (!active()) return;
      const element = panel.audioNote;
      element.hidden = !soundBlocked;
      const text = soundBlocked ? (runtime.i18n.previewAudioBlocked || "The browser blocked automatic sound. Playing muted.") + (runtime.config.rightClickToUnmute === true ? ` ${runtime.i18n.previewAudioRightClick || "Right-click the sidebar target to unmute."}` : "") : "";
      if (element.textContent !== text) element.textContent = text;
    };
    const play = async (manual = false) => {
      if (!active() || !dataReady || startUnmuted && panel.root.hidden || !manual && (playingRequest?.attempt === attempt || loaded && !video.paused)) return;
      const request = { attempt, audioRevision };
      playingRequest = request;
      const currentRequest = () => active() && request.attempt === attempt;
      const currentAudio = () => currentRequest() && request.audioRevision === audioRevision;
      const complete = () => {
        if (!currentRequest()) return;
        loaded = true;
        video.style.visibility = "";
        runtime.setStatus("livePreview", "ready");
        if (currentAudio() && !desiredMuted && !video.muted && !video.paused) {
          policyBlockRevision = null;
          soundBlocked = false;
          renderAudioNote();
        } else if (currentAudio() && video.muted && policyBlockRevision === audioRevision) {
          soundBlocked = true;
          renderAudioNote();
        }
        if (!watching) {
          watching = true;
          lastTime = video.currentTime;
          lastProgress = target.performance.now();
          later(watchProgress, 1e3);
        }
      };
      video.muted = desiredMuted;
      try {
        await video.play();
        complete();
      } catch (error) {
        if (!currentAudio()) return;
        if (!manual && startUnmuted && !desiredMuted && !fallbackUsed && own(error, "name") === "NotAllowedError") {
          fallbackUsed = true;
          policyBlockRevision = audioRevision;
          desiredMuted = true;
          video.muted = true;
          try {
            await video.play();
            complete();
          } catch {
            if (currentAudio()) fail();
          }
        } else fail();
      } finally {
        if (playingRequest === request) playingRequest = null;
      }
    };
    session.play = play;
    session.refresh = renderAudioNote;
    session.toggle = () => {
      if (!active()) return;
      audioRevision++;
      desiredMuted = !desiredMuted;
      video.volume = volume(runtime);
      video.muted = startUnmuted && panel.root.hidden ? true : desiredMuted;
      if (!desiredMuted || video.paused) void play(true);
    };
    video.addEventListener("loadeddata", () => {
      dataReady = true;
      void play();
    });
    video.addEventListener("error", () => {
      sample("media-error");
      if (!session.backend) fail();
    });
    for (const event of ["waiting", "stalled", "playing", "loadedmetadata"]) video.addEventListener(event, () => {
      sample(event);
      if (!active()) return;
      if (event === "playing") runtime.setStatus("livePreview", "ready");
      else if (event === "waiting" || event === "stalled") runtime.setStatus("livePreview", "pending", "stream-buffering");
    });
    try {
      if (Hls?.isSupported()) {
        const hls = session.backend = new Hls({
          enableWorker: false,
          autoStartLoad: false,
          capLevelToPlayerSize: true,
          maxBufferLength: 8,
          maxMaxBufferLength: 16,
          backBufferLength: 0
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!active() || session.backend !== hls) return;
          const info2 = errorInfo(data);
          note({ type: info2.type, details: info2.details, fatal: info2.fatal, status: info2.status });
          if (!info2.fatal) return;
          const denied = info2.status === 401 || info2.status === 403;
          const mediaFailure = info2.type === "mediaError";
          const networkFailure = info2.type === "networkError" && hls.levels.length > 0;
          if (denied || recoveries >= 2 || !mediaFailure && !networkFailure) {
            fail();
            return;
          }
          recoveries++;
          attempt++;
          const recoveryAttempt = attempt;
          runtime.setStatus("livePreview", "pending", "stream-recovering");
          note({ type: "recovery", attempt: recoveries, reason: mediaFailure ? "media" : "network" });
          const recover = () => {
            if (!active() || session.backend !== hls || recoveryAttempt !== attempt) return;
            try {
              if (mediaFailure) {
                const position = video.currentTime;
                hls.recoverMediaError();
                if (position === 0) hls.startLoad();
              } else hls.startLoad();
            } catch {
              fail();
            }
          };
          if (mediaFailure) recover();
          else later(recover, 500);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!active() || session.backend !== hls) return;
          note({ type: "manifestParsed", levels: hls.levels.map((level) => ({
            height: typeof level.height === "number" && Number.isFinite(level.height) ? level.height : null,
            videoCodec: code(level.videoCodec),
            audioCodec: code(level.audioCodec)
          })) });
          const targetHeight = Math.max(480, (parseFloat(panel.root.style.width) || 400) * 9 / 16 * Math.min(target.devicePixelRatio || 1, 2));
          const levels = hls.levels.map((level, index) => ({ height: level.height, index })).filter((item) => typeof item.height === "number" && Number.isFinite(item.height) && item.height > 0).sort((a, b) => a.height - b.height);
          const initial = levels.find((item) => item.height >= targetHeight) || levels.at(-1);
          if (initial) {
            hls.startLevel = initial.index;
            const cap = hls.autoLevelCapping;
            hls.autoLevelCapping = cap >= 0 ? Math.min(cap, initial.index) : initial.index;
          }
          hls.startLoad();
        });
        hls.loadSource(path);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = path;
      else {
        fail();
        return session;
      }
      runtime.setStatus("livePreview", "pending", "stream-loading");
      later(() => {
        if (active() && !loaded) fail();
      }, 15e3);
    } catch {
      fail();
    }
    return session;
  }

  // src/main/features/preview/entry.ts
  function own2(record, key) {
    if (typeof record !== "object" || record === null) return void 0;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && "value" in descriptor ? descriptor.value : void 0;
  }
  function https(value) {
    if (typeof value !== "string") return null;
    try {
      return new URL(value).protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  }
  function playback(value) {
    if (typeof value !== "string" || value.length > 1024 * 1024) return null;
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
    const rawMedia = own2(parsed, "media");
    const media = Array.isArray(rawMedia) ? rawMedia.slice(0, 128).flatMap((item) => {
      const mediaId = own2(item, "mediaId");
      const path = https(own2(item, "path"));
      return typeof mediaId === "string" && path ? [{ mediaId, path }] : [];
    }) : [];
    const thumbnail = https(own2(own2(parsed, "thumbnail"), "snapshotThumbnailTemplate"));
    return { media, thumbnail };
  }
  function liveInfo(body) {
    if (own2(body, "code") !== 200) return null;
    const content = own2(body, "content");
    if (typeof content !== "object" || content === null) return null;
    const status = own2(content, "status");
    if (typeof status !== "string") return null;
    const adult = own2(content, "adult");
    const openDate = own2(content, "openDate");
    return {
      status,
      adult: adult === true,
      openDate: typeof openDate === "string" ? openDate : null,
      image: https(own2(content, "liveImageUrl")),
      playback: playback(own2(content, "livePlaybackJson"))
    };
  }
  function configuredNumber(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
  function installPreview(target) {
    const browser = target;
    const key = browser.Symbol.for("cheese-knife.runtime.v1");
    const runtime = Object.getOwnPropertyDescriptor(target, key)?.value;
    if (!runtime || runtime.preview) return null;
    const scope = runtime.createScope();
    const panel = createPanel(runtime, scope);
    const cache = /* @__PURE__ */ new Map();
    const timers = /* @__PURE__ */ new Set();
    let generation = 0;
    let request = null;
    let current = null;
    let session = null;
    let unsubscribe = null;
    let disposed = false;
    const later = (callback, delay) => {
      const timer = browser.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
      return timer;
    };
    const ownsAnchor = (anchor) => !!runtime.state.sidebar?.isConnected && anchor.isConnected && runtime.state.sidebar.contains(anchor);
    const active = (token, intent) => token === generation && current === intent && ownsAnchor(intent.anchor) && intent.anchor.href === intent.href && browser.location.pathname === intent.route && runtime.config.preview === true && !browser.document.hidden && runtime.configReady;
    const cleanup = () => {
      generation++;
      request?.abort();
      request = null;
      for (const timer of timers) browser.clearTimeout(timer);
      timers.clear();
      session?.dispose();
      session = null;
      current = null;
      panel.hide();
    };
    const parseURL = (href) => {
      try {
        const url = new browser.URL(href);
        return url.origin === browser.location.origin && /^\/live\/[a-f0-9]{32}\/?$/i.test(url.pathname) ? url : null;
      } catch {
        return null;
      }
    };
    const controller = {
      diagnostics: panel.diagnostics,
      async show(href, anchor, tooltip = false) {
        const url = parseURL(href);
        if (!url || !ownsAnchor(anchor) || href !== anchor.href || runtime.config.preview !== true || !runtime.configReady || runtime.state.route?.kind === "excluded") return;
        if (current?.href === href && current.anchor === anchor) return;
        cleanup();
        const token = generation;
        const hoverStarted = browser.Date.now();
        const id = url.pathname.match(/[a-f0-9]{32}/i)?.[0];
        if (!id) return;
        const intent = current = {
          id,
          href,
          anchor,
          route: browser.location.pathname,
          live: runtime.config.livePreview === true,
          startUnmuted: runtime.config.previewStartUnmuted === true,
          invalidate: () => cache.delete(id)
        };
        const pending = request = new browser.AbortController();
        const timeout = later(() => pending.abort(), 5e3);
        let info;
        try {
          const cached = cache.get(id);
          if (cached && cached.expires > browser.Date.now()) info = cached.info;
          else {
            const api = ["https:", "", "api.chzzk.naver.com", "service", "v3.3", "channels", id, "live-detail"].join(String.fromCharCode(47));
            const response = await browser.fetch(api, {
              credentials: "include",
              signal: pending.signal
            });
            if (!response.ok) throw new Error("api-unavailable");
            const parsed = liveInfo(await response.json());
            if (!parsed) throw new Error("api-unavailable");
            info = parsed;
            if (active(token, intent)) {
              cache.delete(id);
              cache.set(id, { info, expires: browser.Date.now() + (info.status === "OPEN" ? 3e4 : 5e3) });
              while (cache.size > 100) cache.delete(cache.keys().next().value);
            }
          }
        } catch {
          if (active(token, intent)) runtime.setStatus("livePreview", "limited", "live-detail-unavailable");
          return;
        } finally {
          browser.clearTimeout(timeout);
          timers.delete(timeout);
        }
        if (!active(token, intent)) return;
        const rect = anchor.getBoundingClientRect();
        if (!rect.width) return;
        panel.place(anchor, tooltip, configuredNumber(runtime.config.previewWidth, 400));
        panel.setImage(info.image || info.playback?.thumbnail || null);
        const open = info.openDate ? new browser.Date(`${info.openDate}+0900`).getTime() : NaN;
        const updateUptime = () => {
          if (!active(token, intent)) return;
          if (Number.isFinite(open)) {
            const seconds = Math.max(0, Math.floor((browser.Date.now() - open) / 1e3));
            panel.setUptime(`${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`);
          } else panel.setUptime("");
          later(updateUptime, 1e3);
        };
        if (runtime.config.livePreview === true && info.status === "OPEN") session = createPlayback(runtime, panel, intent, info);
        const delay = Math.max(100, Math.min(3e3, configuredNumber(runtime.config.previewDelay, 1) * 1e3 || 1e3));
        later(() => {
          if (!active(token, intent)) return;
          panel.show();
          updateUptime();
          runtime.setStatus("preview", "ready");
          if (intent.startUnmuted) void session?.play();
        }, Math.max(0, hoverStarted + delay - browser.Date.now()));
      },
      hide(href) {
        if (!href || current?.href === href) cleanup();
      }
    };
    const checkActive = () => {
      if (current && (browser.location.pathname !== current.route || !ownsAnchor(current.anchor) || current.anchor.href !== current.href || panel.root && !panel.root.isConnected || runtime.config.preview !== true || (current.live || session) && runtime.config.livePreview !== true)) cleanup();
      if (current && session) {
        session.setVolume();
        session.refresh();
      }
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cleanup();
      unsubscribe?.();
      unsubscribe = null;
      scope.dispose();
      if (runtime.preview === controller) Reflect.deleteProperty(runtime, "preview");
    };
    try {
      scope.on(browser.document, "mouseout", (event) => {
        const mouse = event;
        const element = event.target instanceof browser.Element ? event.target : null;
        const anchor = element?.closest("a[href]");
        if (anchor instanceof browser.HTMLAnchorElement && anchor === current?.anchor && !anchor.contains(mouse.relatedTarget)) {
          controller.hide(anchor.href);
        }
      });
      scope.on(browser.document, "visibilitychange", () => {
        if (browser.document.hidden) cleanup();
      });
      scope.on(browser.document, "contextmenu", (event) => {
        if (runtime.config.rightClickToUnmute !== true || !current || !session?.media) return;
        const element = event.target instanceof browser.Element ? event.target : null;
        if (element?.closest("a[href]") !== current.anchor || !active(generation, current)) return;
        event.preventDefault();
        session.toggle();
      });
      scope.on(browser, "pagehide", (event) => {
        cleanup();
        if (!event.persisted) dispose();
      });
      scope.observe(
        new browser.MutationObserver(checkActive),
        browser.document.documentElement,
        { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] }
      );
      unsubscribe = runtime.subscribe(checkActive);
      scope.add(() => {
        unsubscribe?.();
        unsubscribe = null;
      });
      runtime.preview = controller;
      return controller;
    } catch {
      dispose();
      return null;
    }
  }
  installPreview(window);
})();
