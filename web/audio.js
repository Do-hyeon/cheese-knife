// Generated from src/main/features/audio/entry.ts by scripts/main-runtime.mjs. Do not edit.
"use strict";
(() => {
  // src/main/features/audio/curve.ts
  var sharedLimiterCurve;
  function compressorDelay(sampleRate) {
    return Math.min(
      Math.floor(Math.fround(Math.fround(6e-3) * Math.fround(sampleRate))),
      1023
    ) / sampleRate;
  }
  function limiterCurve() {
    if (sharedLimiterCurve) return sharedLimiterCurve;
    sharedLimiterCurve = Float32Array.from({ length: 4097 }, (_, index) => {
      const input = 2 * index / 4096 - 1;
      const magnitude = Math.abs(input);
      let output = magnitude;
      if (magnitude > 0.9) {
        const position = (magnitude - 0.9) / 0.1;
        const squared = position * position;
        const cubed = squared * position;
        output = (2 * cubed - 3 * squared + 1) * 0.9 + (cubed - 2 * squared + position) * 0.1 + (-2 * cubed + 3 * squared) * 0.98;
      }
      return input < 0 ? -output : output;
    });
    return sharedLimiterCurve;
  }

  // src/main/features/audio/controller.ts
  var registryName = "cheese-knife.runtime.v1";
  var number = (value, min, max, fallback) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  function installAudio(target) {
    const browser = target;
    const key = browser.Symbol.for(registryName);
    const runtime = Object.getOwnPropertyDescriptor(target, key)?.value;
    if (!runtime || runtime.audio) return null;
    const entries = /* @__PURE__ */ new WeakMap();
    const connected = /* @__PURE__ */ new Set();
    const scope = runtime.createScope();
    let context;
    const storedGain = () => {
      try {
        const value = target.localStorage.getItem("knifeGain");
        return value == null || !value.trim() ? 1 : number(Number(value), 0, 2, 1);
      } catch {
        return 1;
      }
    };
    const entryFor = (video) => {
      let entry = entries.get(video);
      if (!entry) {
        entry = { video, state: "off", wanted: false, generation: 0, gain: storedGain(), listeners: /* @__PURE__ */ new Set() };
        entries.set(video, entry);
      }
      return entry;
    };
    const announce = (entry, state, reason = "") => {
      entry.state = state;
      runtime.setStatus("compressor", state === "on" ? "ready" : state === "off" ? "disabled" : state === "pending" ? "pending" : "limited", reason);
      for (const callback of entry.listeners) {
        try {
          callback(state, entry.gain);
        } catch {
        }
      }
    };
    const ramp = (parameter, value) => {
      const now = context.currentTime;
      parameter.cancelScheduledValues?.(now);
      parameter.setValueAtTime?.(parameter.value, now);
      if (parameter.linearRampToValueAtTime) parameter.linearRampToValueAtTime(value, now + 0.01);
      else parameter.value = value;
    };
    const applyGain = (entry) => {
      const parameter = entry.gainNode.gain;
      const previous = entry.gainTransition;
      const now = context.currentTime;
      if (!previous) {
        parameter.value = entry.gain;
        entry.gainTransition = { from: entry.gain, to: entry.gain, start: now, end: now };
        return;
      }
      if (previous.to === entry.gain) return;
      const progress = previous.end > previous.start ? Math.max(0, Math.min(1, (now - previous.start) / (previous.end - previous.start))) : 1;
      const from = previous.from + (previous.to - previous.from) * progress;
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(from, now);
      parameter.linearRampToValueAtTime(entry.gain, now + 0.01);
      entry.gainTransition = { from, to: entry.gain, start: now, end: now + 0.01 };
    };
    const apply = (entry) => {
      if (!entry.compressor) return;
      const parameters = [
        { parameter: entry.compressor.threshold, configured: runtime.config.compressorThreshold, min: -100, max: 0, fallback: -50 },
        { parameter: entry.compressor.knee, configured: runtime.config.compressorKnee, min: 0, max: 40, fallback: 40 },
        { parameter: entry.compressor.ratio, configured: runtime.config.compressorRatio, min: 1, max: 20, fallback: 12 },
        { parameter: entry.compressor.attack, configured: runtime.config.compressorAttack, min: 0, max: 1, fallback: 0 },
        { parameter: entry.compressor.release, configured: runtime.config.compressorRelease, min: 0, max: 1, fallback: 0.25 }
      ];
      for (const item of parameters) item.parameter.value = number(item.configured, item.min, item.max, item.fallback);
      applyGain(entry);
    };
    const connect = (entry) => {
      if (entry.connected) return;
      entry.source.connect(entry.dryDelay);
      entry.dryDelay.connect(entry.dry);
      entry.source.connect(entry.compressor);
      entry.compressor.connect(entry.gainNode);
      entry.gainNode.connect(entry.limiter);
      entry.limiter.connect(entry.wet);
      entry.dry.connect(context.destination);
      entry.wet.connect(context.destination);
      entry.connected = true;
      connected.add(entry);
    };
    const bypassEntry = (entry) => {
      if (entry.source) {
        ramp(entry.dry.gain, 1);
        ramp(entry.wet.gain, 0);
      }
    };
    const eligible = (video) => {
      if (!video || video.ownerDocument !== target.document || video.mediaKeys) return false;
      try {
        return video.currentSrc.startsWith("blob:") && new URL(video.currentSrc).origin === target.location.origin;
      } catch {
        return false;
      }
    };
    const controller = {
      async setEnabled(video, enabled) {
        if (scope.disposed) return "off";
        const entry = entryFor(video);
        const generation = ++entry.generation;
        entry.wanted = enabled === true;
        if (!entry.wanted) {
          bypassEntry(entry);
          announce(entry, "off");
          return "off";
        }
        if (runtime.selectPlayer()?.video !== video || !eligible(video)) {
          bypassEntry(entry);
          announce(entry, "unavailable", "unsupported-media-source");
          return entry.state;
        }
        announce(entry, "pending", "audio-context");
        try {
          const AudioContextClass = browser.AudioContext || browser.webkitAudioContext;
          if (!AudioContextClass) throw new Error("audio-context-unavailable");
          context ||= new AudioContextClass();
          if (context.state !== "running") {
            let timer;
            try {
              await Promise.race([
                context.resume(),
                new Promise((_, reject) => {
                  timer = target.setTimeout(() => reject(new Error("user-gesture-required")), 1e3);
                })
              ]);
            } finally {
              if (timer !== void 0) target.clearTimeout(timer);
            }
          }
          if (scope.disposed) {
            entry.wanted = false;
            entry.state = "off";
            return entry.state;
          }
          if (generation !== entry.generation || !entry.wanted) return entry.state;
          if (context.state !== "running" || runtime.selectPlayer()?.video !== video || !eligible(video)) throw new Error("audio-not-ready");
          if (!entry.source) {
            entry.dry = context.createGain();
            entry.dry.gain.value = 1;
            entry.wet = context.createGain();
            entry.wet.gain.value = 0;
            entry.dryDelay = context.createDelay(0.02);
            entry.dryDelay.delayTime.value = compressorDelay(context.sampleRate);
            entry.compressor = context.createDynamicsCompressor();
            entry.gainNode = context.createGain();
            entry.gainTransition = null;
            apply(entry);
            entry.limiter = context.createWaveShaper();
            entry.limiter.curve = limiterCurve();
            entry.limiter.oversample = "none";
            entry.source = context.createMediaElementSource(video);
          }
          connect(entry);
          apply(entry);
          ramp(entry.dry.gain, 0);
          ramp(entry.wet.gain, 1);
          announce(entry, "on");
        } catch (error) {
          if (scope.disposed) {
            entry.wanted = false;
            entry.state = "off";
            return entry.state;
          }
          if (generation !== entry.generation || !entry.wanted) return entry.state;
          if (entry.source) {
            try {
              connect(entry);
              bypassEntry(entry);
            } catch {
              try {
                entry.source.disconnect();
                entry.source.connect(context.destination);
              } catch {
              }
            }
          }
          const reason = error instanceof browser.Error && error.message === "user-gesture-required" ? "user-gesture-required" : "audio-unavailable";
          announce(entry, "unavailable", reason);
        }
        return entry.state;
      },
      getState(video) {
        return entries.get(video)?.state || "off";
      },
      setGain(video, value) {
        const entry = entryFor(video);
        entry.gain = number(value, 0, 2, 1);
        try {
          target.localStorage.setItem("knifeGain", String(entry.gain));
        } catch {
        }
        apply(entry);
        announce(entry, entry.state);
        return entry.gain;
      },
      configure() {
        for (const entry of connected) apply(entry);
      },
      bypass(video) {
        const entry = entries.get(video);
        if (entry) {
          entry.generation++;
          entry.wanted = false;
          bypassEntry(entry);
          announce(entry, "off");
        }
      },
      subscribe(video, callback) {
        const entry = entryFor(video);
        entry.listeners.add(callback);
        callback(entry.state, entry.gain);
        return () => entry.listeners.delete(callback);
      },
      eligible
    };
    try {
      scope.interval(() => {
        for (const entry of connected) {
          if (entry.video.isConnected || !entry.video.paused) {
            entry.detachedSince = null;
            continue;
          }
          entry.detachedSince ||= Date.now();
          if (Date.now() - entry.detachedSince >= 5e3) {
            controller.bypass(entry.video);
            for (const node of [entry.source, entry.compressor, entry.gainNode, entry.limiter, entry.wet]) node.disconnect();
            entry.source.connect(entry.dryDelay);
            entry.connected = false;
            connected.delete(entry);
          }
        }
      }, 1e3);
      scope.on(target, "pagehide", (event) => {
        if (!event.persisted) {
          for (const entry of connected) controller.bypass(entry.video);
          scope.dispose();
        }
      });
    } catch (error) {
      scope.dispose();
      throw error;
    }
    runtime.audio = controller;
    return controller;
  }

  // src/main/features/audio/entry.ts
  installAudio(window);
})();
