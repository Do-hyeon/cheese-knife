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

  // src/main/features/audio/eq.ts
  var EQ_FREQUENCIES = [63, 125, 250, 500, 1e3, 2e3, 4e3, 8e3];
  function eqSettings(config, sampleRate) {
    const supported = Number.isFinite(sampleRate) && sampleRate >= 22050;
    const enabled = config.eqEnabled === true && supported;
    const values = [config.eq63, config.eq125, config.eq250, config.eq500, config.eq1000, config.eq2000, config.eq4000, config.eq8000];
    const levels = values.map((value) => enabled && typeof value === "number" && Number.isFinite(value) && value >= -6 && value <= 6 ? value : 0);
    return { supported, levels, headroom: 10 ** (-levels.reduce((sum, value) => sum + Math.max(0, value), 0) / 20) };
  }

  // src/main/features/audio/normalizer.ts
  function normalizerWindow(sampleRate) {
    if (!Number.isFinite(sampleRate) || sampleRate < 22050 || sampleRate > 96e3) return null;
    return 2 ** Math.ceil(Math.log2(sampleRate * 0.25));
  }
  function createNormalizer(sampleRate) {
    const fftSize = normalizerWindow(sampleRate);
    return fftSize === null ? null : {
      fftSize,
      windowSeconds: fftSize / sampleRate,
      lastTime: null,
      warmSince: null,
      power: null,
      silentSeconds: 0,
      fromDb: 0,
      toDb: 0,
      start: 0,
      end: 0
    };
  }
  function normalizerDbAt(state, time) {
    const progress = state.end > state.start ? Math.max(0, Math.min(1, (time - state.start) / (state.end - state.start))) : 1;
    return state.fromDb + (state.toDb - state.fromDb) * progress;
  }
  function stepNormalizer(state, input) {
    const validTime = Number.isFinite(input.time), time = validTime ? input.time : state.lastTime ?? state.end;
    const current = normalizerDbAt(state, time), dt = state.lastTime === null ? null : time - state.lastTime;
    const schedule = (mode, toDb = current, seconds = 0) => {
      state.fromDb = current;
      state.toDb = toDb;
      state.start = time;
      state.end = time + seconds;
      return { mode, fromDb: current, toDb, start: time, end: time + seconds };
    };
    const reset = () => {
      state.power = null;
      state.silentSeconds = 0;
      state.warmSince = null;
      state.lastTime = null;
    };
    if (!validTime || !input.active) {
      reset();
      return schedule("hold");
    }
    if (![input.leftPower, input.rightPower].every((power2) => Number.isFinite(power2) && power2 >= 0)) {
      reset();
      return schedule("error", 0, 0.01);
    }
    state.lastTime = time;
    if (dt !== null && (dt <= 0 || dt > 0.2)) {
      state.power = null;
      state.silentSeconds = 0;
      state.warmSince = time;
      return schedule("hold");
    }
    state.warmSince ??= time;
    if (time - state.warmSince < state.windowSeconds || dt === null) return schedule("warmup");
    const power = Math.max(input.leftPower, input.rightPower);
    state.power = state.power === null ? power : state.power + (power - state.power) * (1 - Math.exp(-dt / 0.75));
    const silent = power <= 10 ** (-55 / 10);
    state.silentSeconds = silent ? state.silentSeconds + dt : 0;
    const target = Number.isFinite(input.targetDbfs) && input.targetDbfs >= -30 && input.targetDbfs <= -12 ? input.targetDbfs : -20;
    let desired = Math.max(-12, Math.min(6, target - 10 * Math.log10(Math.max(1e-12, state.power))));
    let down = 1.2;
    if (silent && state.silentSeconds >= 2) {
      desired = 0;
      down = 0.1;
    } else if (silent) desired = Math.min(desired, current);
    return schedule("ramp", Math.max(current - down, Math.min(current + 0.1, desired)), 0.1);
  }

  // src/main/features/audio/controller.ts
  var registryName = "cheese-knife.runtime.v1";
  var number = (value, min, max, fallback) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  function installAudio(target) {
    const browser = target;
    const key = browser.Symbol.for(registryName);
    const runtime = Object.getOwnPropertyDescriptor(target, key)?.value;
    if (runtime?.ownerProtocol !== 3 || runtime.audio) return null;
    const entries = /* @__PURE__ */ new WeakMap();
    const connected = /* @__PURE__ */ new Set();
    const meters = /* @__PURE__ */ new Set();
    const scope = runtime.createScope();
    let context;
    const transitions = /* @__PURE__ */ new WeakMap();
    const storedGain = () => {
      try {
        const value = target.localStorage.getItem("knifeGain");
        return value == null || !value.trim() || value.length > 64 ? 1 : number(Number(value), 0, 2, 1);
      } catch {
        return 1;
      }
    };
    const entryFor = (video) => {
      let entry = entries.get(video);
      if (!entry) {
        entry = { video, state: "off", wanted: false, generation: 0, sources: 0, gain: storedGain(), listeners: /* @__PURE__ */ new Set() };
        entries.set(video, entry);
      }
      return entry;
    };
    const publish = (entry, reason = "") => {
      if (runtime.state.player?.video !== entry.video) return;
      const status = entry.state === "on" ? "ready" : entry.state === "off" ? "disabled" : entry.state === "pending" ? "pending" : "limited";
      runtime.setStatus("audioProcessing", status, reason);
      runtime.setStatus("compressor", runtime.config.compressorEnabled === false ? "disabled" : status, reason);
      const supported = context && eqSettings(runtime.config, context.sampleRate).supported;
      runtime.setStatus(
        "equalizer",
        runtime.config.eqEnabled !== true ? "disabled" : entry.state === "on" && !supported ? "limited" : status,
        runtime.config.eqEnabled === true && entry.state === "on" && !supported ? "eq-sample-rate-unsupported" : reason
      );
      runtime.setStatus(
        "normalizer",
        runtime.config.normalizerEnabled !== true ? "disabled" : entry.state === "on" ? entry.normalizerStatus?.state ?? "pending" : status,
        runtime.config.normalizerEnabled === true && entry.state === "on" ? entry.normalizerStatus?.reason ?? "normalizer-warming-up" : reason
      );
    };
    const announce = (entry, state, reason = "") => {
      entry.state = state;
      syncMeter(entry);
      publish(entry, reason);
      for (const callback of entry.listeners) {
        try {
          callback(state, entry.gain);
        } catch {
        }
      }
    };
    const ramp = (parameter, value, seconds = 0.01) => {
      const now = context.currentTime;
      const previous = transitions.get(parameter);
      if (previous?.to === value) return;
      const progress = previous && previous.end > previous.start ? Math.max(0, Math.min(1, (now - previous.start) / (previous.end - previous.start))) : 1;
      const from = previous ? previous.from + (previous.to - previous.from) * progress : parameter.value;
      transitions.set(parameter, { from, to: value, start: now, end: now + seconds });
      if (!previous && from === value) return;
      parameter.cancelScheduledValues?.(now);
      parameter.setValueAtTime?.(from, now);
      if (parameter.linearRampToValueAtTime) parameter.linearRampToValueAtTime(value, now + seconds);
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
      if (!entry.compressor || !entry.headroom || !entry.equalizers || !entry.compWet || !entry.compDry) return;
      if (runtime.selectPlayer()?.video !== entry.video) {
        bypassEntry(entry);
        return;
      }
      if (!runtime.mediaCurrent() || !eligible(entry.video)) {
        controller.suspend(entry.video);
        return;
      }
      const preview = entry.preview;
      if (preview && (preview.source !== entry.video.currentSrc || preview.document !== runtime.media.context.documentGeneration || preview.path !== runtime.media.context.routePath || preview.binding !== runtime.media.audioBindingGeneration)) entry.preview = null;
      entry.gain = entry.preview?.value ?? (runtime.media.gainOrigin === "site-legacy" ? storedGain() : number(runtime.config.audioGain, 0, 2, 1));
      const parameters = [
        { parameter: entry.compressor.threshold, configured: runtime.config.compressorThreshold, min: -100, max: 0, fallback: -50 },
        { parameter: entry.compressor.knee, configured: runtime.config.compressorKnee, min: 0, max: 40, fallback: 40 },
        { parameter: entry.compressor.ratio, configured: runtime.config.compressorRatio, min: 1, max: 20, fallback: 12 },
        { parameter: entry.compressor.attack, configured: runtime.config.compressorAttack, min: 0, max: 1, fallback: 0 },
        { parameter: entry.compressor.release, configured: runtime.config.compressorRelease, min: 0, max: 1, fallback: 0.25 }
      ];
      for (const item of parameters) item.parameter.value = number(item.configured, item.min, item.max, item.fallback);
      const settings = eqSettings(runtime.config, context.sampleRate);
      ramp(entry.headroom.gain, settings.headroom, 0.02);
      entry.equalizers.forEach((filter, index) => ramp(filter.gain, settings.levels.at(index), 0.02));
      const compressed = runtime.config.compressorEnabled !== false;
      ramp(entry.compWet.gain, compressed ? 1 : 0);
      ramp(entry.compDry.gain, compressed ? 0 : 1);
      applyGain(entry);
      syncMeter(entry);
      publish(entry);
    };
    const connect = (entry) => {
      if (entry.connected) return;
      entry.source.connect(entry.dryDelay);
      entry.dryDelay.connect(entry.dry);
      entry.source.connect(entry.headroom);
      let equalized = entry.headroom;
      for (const filter of entry.equalizers) {
        equalized.connect(filter);
        equalized = filter;
      }
      equalized.connect(entry.compressor);
      equalized.connect(entry.compDelay);
      entry.compressor.connect(entry.compWet);
      entry.compDelay.connect(entry.compDry);
      entry.compWet.connect(entry.compMix);
      entry.compDry.connect(entry.compMix);
      entry.compMix.connect(entry.normalizer);
      entry.normalizer.connect(entry.gainNode);
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
    const automateNormalizer = (entry, curve) => {
      const parameter = entry.normalizer.gain;
      parameter.cancelScheduledValues(curve.start);
      parameter.setValueAtTime(10 ** (curve.fromDb / 20), curve.start);
      if (curve.end > curve.start) parameter.exponentialRampToValueAtTime(10 ** (curve.toDb / 20), curve.end);
    };
    const stopMeter = (entry) => {
      const data = entry.meter;
      if (!data) return;
      entry.meter = null;
      meters.delete(entry);
      data.scope.dispose();
      try {
        entry.compMix.disconnect(data.splitter);
      } catch {
      }
      data.splitter.disconnect();
      data.left.disconnect();
      data.right.disconnect();
      const time = context.currentTime;
      automateNormalizer(entry, { fromDb: normalizerDbAt(data.control, time), toDb: 0, start: time, end: time + 0.01 });
    };
    const tickMeter = (entry) => {
      const data = entry.meter;
      if (!data || data.scope.disposed || scope.disposed) return;
      if (runtime.state.player?.video !== entry.video || !entry.wanted || runtime.config.normalizerEnabled !== true || data.source !== entry.video.currentSrc || data.path !== target.location.pathname || data.path !== runtime.media.context.routePath || data.document !== runtime.media.context.documentGeneration) {
        stopMeter(entry);
        return;
      }
      const active = entry.state === "on" && runtime.mediaCurrent() && context.state === "running" && eligible(entry.video) && !entry.video.paused && !entry.video.ended && !entry.video.muted && entry.video.volume > 0 && entry.gain > 0 && !target.document.hidden;
      let leftPower = 0, rightPower = 0;
      const power = (buffer) => {
        let sum = 0;
        for (const sample of buffer) {
          if (!Number.isFinite(sample)) throw new Error("normalizer-samples-invalid");
          sum += sample * sample;
        }
        return sum / buffer.length;
      };
      if (active) {
        try {
          data.left.getFloatTimeDomainData(data.leftBuffer);
          data.right.getFloatTimeDomainData(data.rightBuffer);
          leftPower = power(data.leftBuffer);
          rightPower = power(data.rightBuffer);
        } catch {
          leftPower = NaN;
          rightPower = NaN;
        }
      }
      const curve = stepNormalizer(data.control, {
        time: context.currentTime,
        leftPower,
        rightPower,
        active,
        targetDbfs: number(runtime.config.normalizerTargetDbfs, -30, -12, -20)
      });
      automateNormalizer(entry, curve);
      entry.normalizerStatus = curve.mode === "error" ? { state: "limited", reason: "normalizer-samples-invalid" } : curve.mode === "ramp" ? { state: "ready", reason: "" } : { state: "pending", reason: curve.mode === "warmup" ? "normalizer-warming-up" : "normalizer-hold" };
      publish(entry);
    };
    const syncMeter = (entry) => {
      if (entry.meter && (entry.meter.source !== entry.video.currentSrc || entry.meter.path !== runtime.media.context.routePath || entry.meter.document !== runtime.media.context.documentGeneration)) stopMeter(entry);
      if (scope.disposed || !entry.wanted || runtime.config.normalizerEnabled !== true || runtime.state.player?.video !== entry.video) {
        stopMeter(entry);
        return;
      }
      if (entry.meter) {
        if (entry.state !== "on" || !runtime.mediaCurrent()) tickMeter(entry);
        return;
      }
      if (!context || !entry.source || !entry.connected || entry.state !== "on" || !runtime.mediaCurrent()) return;
      const control = createNormalizer(context.sampleRate);
      if (!control) {
        entry.normalizerStatus = { state: "limited", reason: "normalizer-sample-rate-unsupported" };
        return;
      }
      try {
        const splitter = context.createChannelSplitter(2), left = context.createAnalyser(), right = context.createAnalyser();
        left.fftSize = control.fftSize;
        right.fftSize = control.fftSize;
        entry.meter = {
          control,
          splitter,
          left,
          right,
          leftBuffer: new Float32Array(control.fftSize),
          rightBuffer: new Float32Array(control.fftSize),
          scope: runtime.createScope(),
          source: entry.video.currentSrc,
          path: runtime.media.context.routePath,
          document: runtime.media.context.documentGeneration
        };
        meters.add(entry);
        entry.compMix.connect(splitter);
        splitter.connect(left, 0);
        splitter.connect(right, 1);
        entry.meter.scope.interval(() => tickMeter(entry), 100);
        tickMeter(entry);
      } catch {
        stopMeter(entry);
        entry.normalizerStatus = { state: "limited", reason: "normalizer-unavailable" };
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
        if (!runtime.mediaCurrent()) {
          bypassEntry(entry);
          announce(entry, "pending", "scoped-config-pending");
          return entry.state;
        }
        const requestId = runtime.mediaRequestId, binding = runtime.media.audioBindingGeneration;
        const current = () => runtime.mediaCurrent() && runtime.mediaRequestId === requestId && runtime.media.audioBindingGeneration === binding && runtime.selectPlayer()?.video === video;
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
          if (!current()) {
            bypassEntry(entry);
            announce(entry, "pending", "scoped-config-pending");
            return entry.state;
          }
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
            const settings = eqSettings(runtime.config, context.sampleRate);
            entry.headroom = context.createGain();
            entry.headroom.gain.value = settings.headroom;
            entry.headroom.channelCount = 2;
            entry.headroom.channelCountMode = "explicit";
            entry.headroom.channelInterpretation = "speakers";
            entry.equalizers = settings.supported ? EQ_FREQUENCIES.map((frequency, index) => {
              const filter = context.createBiquadFilter();
              filter.type = "peaking";
              filter.frequency.value = frequency;
              filter.Q.value = 1;
              filter.gain.value = settings.levels.at(index);
              return filter;
            }) : [];
            entry.compDelay = context.createDelay(0.02);
            entry.compDelay.delayTime.value = compressorDelay(context.sampleRate);
            entry.compDry = context.createGain();
            entry.compDry.gain.value = runtime.config.compressorEnabled === false ? 1 : 0;
            entry.compWet = context.createGain();
            entry.compWet.gain.value = runtime.config.compressorEnabled === false ? 0 : 1;
            entry.compMix = context.createGain();
            entry.normalizer = context.createGain();
            entry.normalizer.gain.value = 1;
            apply(entry);
            entry.limiter = context.createWaveShaper();
            entry.limiter.curve = limiterCurve();
            entry.limiter.oversample = "none";
            if (!current() || generation !== entry.generation || !entry.wanted) return entry.state;
            entry.source = context.createMediaElementSource(video);
            entry.sources++;
          }
          if (scope.disposed || !current() || generation !== entry.generation || !entry.wanted) {
            connect(entry);
            bypassEntry(entry);
            return entry.state;
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
        entry.preview = {
          value: entry.gain,
          source: video.currentSrc,
          document: runtime.media.context.documentGeneration,
          path: runtime.media.context.routePath,
          binding: runtime.media.audioBindingGeneration
        };
        apply(entry);
        announce(entry, entry.state);
        return entry.gain;
      },
      applyPreviewGain(video, value, current) {
        const expected = runtime.media.context;
        if (!Number.isFinite(value) || value < 0 || value > 2 || !runtime.mediaCurrent() || runtime.state.player?.video !== video || !current || !["documentGeneration", "routePath", "channelId", "playerGeneration"].every((key2) => Object.getOwnPropertyDescriptor(current, key2)?.value === Object.getOwnPropertyDescriptor(expected, key2)?.value)) return false;
        controller.setGain(video, value);
        return true;
      },
      getReadback(video) {
        const entry = entries.get(video);
        return {
          state: entry?.state ?? "off",
          wanted: entry?.wanted ?? false,
          gain: entry?.gain ?? storedGain(),
          appliedGain: entry?.gainNode?.gain.value ?? null,
          sources: entry?.sources ?? 0
        };
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
      suspend(video) {
        const entry = entries.get(video);
        if (entry) {
          entry.generation++;
          bypassEntry(entry);
          announce(entry, entry.wanted ? "pending" : "off");
        }
      },
      resumeWanted(video) {
        return entries.get(video)?.wanted ? controller.setEnabled(video, true) : Promise.resolve("off");
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
            for (const node of [entry.source, entry.headroom, ...entry.equalizers, entry.compressor, entry.compDelay, entry.compDry, entry.compWet, entry.compMix, entry.normalizer, entry.gainNode, entry.limiter, entry.wet]) node.disconnect();
            entry.source.connect(entry.dryDelay);
            entry.connected = false;
            connected.delete(entry);
          }
        }
      }, 1e3);
      scope.add(() => {
        for (const entry of [...meters]) stopMeter(entry);
      });
      scope.on(target, "pagehide", (event) => {
        for (const entry of connected) entry.preview = null;
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
