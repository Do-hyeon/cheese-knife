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

  // src/main/features/audio/controller.ts
  var number = (value, min, max, fallback) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  function installAudio(target) {
    const browser = target;
    const runtime = Object.getOwnPropertyDescriptor(target, browser.Symbol.for("cheese-knife.runtime.v1"))?.value;
    if (runtime?.ownerProtocol !== 3 || runtime.audio) return null;
    const entries = /* @__PURE__ */ new WeakMap(), connected = /* @__PURE__ */ new Set();
    const scope = runtime.createScope();
    let context, moduleUrl, moduleLoad, epoch = 0;
    let registerModule;
    const moduleRegistered = new Promise((resolve) => {
      registerModule = resolve;
    });
    const compTransitions = /* @__PURE__ */ new WeakMap();
    const storedGain = () => {
      try {
        const raw = target.localStorage.getItem("knifeGain");
        return raw && raw.trim() && raw.length <= 64 ? number(Number(raw), 0, 2, 1) : 1;
      } catch {
        return 1;
      }
    };
    const entryFor = (video) => {
      let entry = entries.get(video);
      if (!entry) {
        entry = { video, state: "off", wanted: false, generation: 0, gain: storedGain(), sources: 0, listeners: /* @__PURE__ */ new Set(), epoch: ++epoch, seq: 0, meterEpoch: 0, meterSeq: 0, appliedGain: null };
        entries.set(video, entry);
      }
      return entry;
    };
    const eligible = (video) => {
      if (!video || video.ownerDocument !== target.document || video.mediaKeys) return false;
      try {
        return video.currentSrc.startsWith("blob:") && new URL(video.currentSrc).origin === target.location.origin;
      } catch {
        return false;
      }
    };
    const publish = (entry) => {
      if (scope.disposed || runtime.state.player?.video !== entry.video) return;
      const status = entry.state === "on" ? "ready" : entry.state === "off" ? "disabled" : entry.state === "pending" ? "pending" : "limited";
      runtime.setStatus("audioProcessing", status);
      runtime.setStatus("compressor", runtime.config.compressorEnabled === false ? "disabled" : status);
      const eqSupported = context && eqSettings(runtime.config, context.sampleRate).supported;
      runtime.setStatus(
        "equalizer",
        runtime.config.eqEnabled !== true ? "disabled" : entry.state === "on" && !eqSupported ? "limited" : status,
        entry.state === "on" && !eqSupported ? "eq-sample-rate-unsupported" : ""
      );
      runtime.setStatus(
        "normalizer",
        runtime.config.normalizerEnabled !== true ? "disabled" : entry.state === "on" ? entry.normalizerStatus?.state ?? "pending" : status,
        runtime.config.normalizerEnabled === true ? entry.normalizerStatus?.reason ?? "normalizer-warming-up" : ""
      );
    };
    const announce = (entry, state, reason = "") => {
      entry.state = state;
      syncMeter(entry);
      publish(entry);
      if (!scope.disposed && reason && runtime.state.player?.video === entry.video) runtime.setStatus("audioProcessing", state === "pending" ? "pending" : "limited", reason);
      for (const listener of entry.listeners) {
        try {
          listener(state, entry.gain);
        } catch {
        }
      }
    };
    const budget = async (promise, deadline) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw Error("audio-prepare-timeout");
      let timer;
      try {
        return await Promise.race([promise, new Promise((_, reject) => {
          timer = target.setTimeout(() => reject(Error("audio-prepare-timeout")), remaining);
        })]);
      } finally {
        if (timer !== void 0) target.clearTimeout(timer);
      }
    };
    const clearMeterFlight = (entry) => {
      if (entry.meterFlight) target.clearTimeout(entry.meterFlight.timer);
      entry.meterFlight = null;
      entry.meterPending = null;
    };
    const stopMeter = (entry) => {
      entry.meterPending = null;
      const data = entry.meter;
      entry.meter = null;
      if (!data) return;
      data.scope.dispose();
      try {
        entry.compMix?.disconnect(data.splitter);
      } catch {
      }
      data.splitter.disconnect();
      data.left.disconnect();
      data.right.disconnect();
    };
    const fail = (entry, reason) => {
      entry.failed = true;
      entry.appliedGain = null;
      clearMeterFlight(entry);
      stopMeter(entry);
      if (entry.commandTimer !== void 0) target.clearTimeout(entry.commandTimer);
      entry.commandTimer = void 0;
      const flight = entry.flight, pending = entry.pending;
      entry.flight = entry.pending = null;
      entry.lastJob = void 0;
      const retiring = entry.retiring;
      entry.retiring = void 0;
      if (retiring) {
        target.clearTimeout(retiring.timer);
        retiring.reject(Error(reason));
      }
      if (!entry.wanted) try {
        entry.latch?.offset.setValueAtTime(0, context.currentTime);
      } catch {
      }
      try {
        entry.controls?.disconnect();
        entry.node?.disconnect();
        if (entry.node) entry.source?.disconnect(entry.node);
        if (!entry.source) entry.latch?.stop();
      } catch {
      }
      flight?.reject(Error(reason));
      pending?.reject(Error(reason));
      announce(entry, "unavailable", reason);
    };
    const sendPending = (entry) => {
      if (!entry.node || !entry.connected || entry.failed || entry.flight || !entry.pending || context?.state !== "running") return;
      const job = entry.pending;
      entry.pending = null;
      entry.flight = job;
      if (job.packet.kind === "configure") entry.latch.offset.setValueAtTime(job.packet.wanted && job.packet.gain === 0 ? -1 : 0, context.currentTime);
      entry.commandTimer = target.setTimeout(() => {
        if (entry.flight === job) fail(entry, "audio-command-timeout");
      }, 1e3);
      entry.node.port.postMessage(job.packet);
    };
    const queue = (entry, wanted) => {
      if (!context || !entry.node || entry.failed) return Promise.reject(Error("audio-unavailable"));
      const settings = eqSettings(runtime.config, context.sampleRate);
      const data = {
        wanted,
        gain: entry.gain,
        eq: settings.levels,
        normalizer: runtime.config.normalizerEnabled === true,
        dynamics: runtime.config.compressorEnabled !== false || runtime.config.normalizerEnabled === true,
        targetDbfs: number(runtime.config.normalizerTargetDbfs, -30, -12, -20)
      };
      const signature = JSON.stringify(data);
      if (entry.lastJob?.signature === signature) return entry.lastJob.promise;
      entry.appliedGain = null;
      const packet = { kind: "configure", sourceEpoch: entry.epoch, seq: ++entry.seq, ...data };
      let resolve, reject;
      const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
      });
      void promise.catch(() => {
      });
      entry.pending?.resolve();
      const job = { packet, signature, resolve, reject, promise };
      entry.pending = job;
      entry.lastJob = job;
      sendPending(entry);
      return promise;
    };
    const sendMeter = (entry, packet) => {
      if (!entry.node || entry.failed || !entry.meter && packet.kind !== "read-error" || context?.state !== "running") return;
      if (entry.meterFlight) {
        entry.meterPending = packet;
        return;
      }
      const seq = packet.meterSeq, timer = target.setTimeout(() => {
        if (entry.meterFlight?.seq === seq) fail(entry, "audio-meter-timeout");
      }, 1e3);
      entry.meterFlight = { seq, timer };
      entry.node.port.postMessage(packet);
    };
    const syncMeter = (entry) => {
      const prior = entry.meter;
      if (prior && (prior.source !== entry.video.currentSrc || prior.path !== runtime.media.context.routePath || prior.document !== runtime.media.context.documentGeneration)) stopMeter(entry);
      if (scope.disposed || entry.failed || !entry.wanted || entry.state !== "on" || !runtime.mediaCurrent() || runtime.config.normalizerEnabled !== true) {
        stopMeter(entry);
        return;
      }
      if (!context || !entry.source || entry.meter || entry.flight || entry.pending || entry.meterFailureEpoch === entry.meterEpoch) return;
      const fftSize = normalizerWindow(context.sampleRate);
      if (fftSize === null) {
        entry.normalizerStatus = { state: "limited", reason: "normalizer-sample-rate-unsupported" };
        return;
      }
      try {
        const splitter = context.createChannelSplitter(2), left = context.createAnalyser(), right = context.createAnalyser();
        left.fftSize = right.fftSize = fftSize;
        const data = {
          splitter,
          left,
          right,
          leftBuffer: new Float32Array(fftSize),
          rightBuffer: new Float32Array(fftSize),
          scope: runtime.createScope(),
          source: entry.video.currentSrc,
          path: runtime.media.context.routePath,
          document: runtime.media.context.documentGeneration
        };
        entry.meter = data;
        entry.compMix.connect(splitter);
        splitter.connect(left, 0);
        splitter.connect(right, 1);
        const tick = () => {
          if (!context || entry.meter !== data || data.scope.disposed) return;
          if (scope.disposed || !entry.wanted || entry.state !== "on" || !runtime.mediaCurrent() || data.source !== entry.video.currentSrc || data.path !== runtime.media.context.routePath || data.document !== runtime.media.context.documentGeneration) {
            stopMeter(entry);
            return;
          }
          const active = context.state === "running" && eligible(entry.video) && !entry.video.paused && !entry.video.ended && !entry.video.muted && entry.video.volume > 0 && entry.gain > 0 && !target.document.hidden;
          const base = { sourceEpoch: entry.epoch, meterEpoch: entry.meterEpoch, meterSeq: ++entry.meterSeq, observedTime: context.currentTime };
          const power = (buffer) => {
            let sum = 0;
            for (const sample of buffer) {
              if (!Number.isFinite(sample)) throw Error("meter-sample");
              sum += sample * sample;
            }
            const p = sum / buffer.length;
            if (!Number.isFinite(p)) throw Error("meter-power");
            return p;
          };
          try {
            let leftPower = 0, rightPower = 0;
            if (active) {
              left.getFloatTimeDomainData(data.leftBuffer);
              right.getFloatTimeDomainData(data.rightBuffer);
              leftPower = power(data.leftBuffer);
              rightPower = power(data.rightBuffer);
            }
            sendMeter(entry, { kind: "power", ...base, leftPower, rightPower, active, targetDbfs: number(runtime.config.normalizerTargetDbfs, -30, -12, -20) });
          } catch {
            sendMeter(entry, { kind: "read-error", ...base });
          }
        };
        data.scope.interval(tick, 100);
        tick();
      } catch {
        stopMeter(entry);
        entry.meterFailureEpoch = entry.meterEpoch;
        entry.normalizerStatus = { state: "limited", reason: "normalizer-unavailable" };
        sendMeter(entry, { kind: "read-error", sourceEpoch: entry.epoch, meterEpoch: entry.meterEpoch, meterSeq: ++entry.meterSeq, observedTime: context.currentTime });
      }
    };
    const apply = (entry) => {
      if (!entry.source || entry.failed || !context) return;
      if (runtime.selectPlayer()?.video !== entry.video || !runtime.mediaCurrent() || !eligible(entry.video)) {
        controller.suspend(entry.video);
        return;
      }
      const preview = entry.preview;
      if (preview && (preview.source !== entry.video.currentSrc || preview.document !== runtime.media.context.documentGeneration || preview.path !== runtime.media.context.routePath || preview.binding !== runtime.media.audioBindingGeneration)) entry.preview = null;
      entry.gain = entry.preview?.value ?? (runtime.media.gainOrigin === "site-legacy" ? storedGain() : number(runtime.config.audioGain, 0, 2, 1));
      if (entry.retiring) {
        if (entry.wanted && entry.gain === 0) entry.latch.offset.setValueAtTime(-1, context.currentTime);
        return;
      }
      const boundKey = JSON.stringify([entry.video.currentSrc, runtime.media.context.documentGeneration, runtime.media.context.routePath]);
      if (entry.boundKey !== boundKey) {
        clearMeterFlight(entry);
        stopMeter(entry);
        entry.generation++;
        entry.appliedGain = null;
        if (entry.commandTimer !== void 0) target.clearTimeout(entry.commandTimer);
        entry.commandTimer = void 0;
        const flight = entry.flight, pending = entry.pending;
        entry.flight = entry.pending = null;
        entry.lastJob = void 0;
        flight?.reject(Error("audio-source-retired"));
        pending?.reject(Error("audio-source-retired"));
        entry.latch.offset.setValueAtTime(entry.wanted && entry.gain === 0 ? -1 : 0, context.currentTime);
        entry.controls?.disconnect();
        if (entry.node) {
          if (entry.connected) entry.source.disconnect(entry.node);
          entry.node.disconnect();
          entry.node.port.onmessage = null;
          entry.node.port.close?.();
          const K = entry.node.parameters.get("K");
          if (K) entry.latch.disconnect(K);
        }
        entry.node = void 0;
        entry.controls = void 0;
        entry.prepared = void 0;
        entry.connected = false;
        entry.epoch = ++epoch;
        entry.seq = entry.meterSeq = entry.meterEpoch = 0;
        entry.boundKey = boundKey;
        if (entry.wanted) void controller.setEnabled(entry.video, true);
        return;
      }
      const parameters = [
        ["threshold", "compressorThreshold", -100, 0, -50],
        ["knee", "compressorKnee", 0, 40, 40],
        ["ratio", "compressorRatio", 1, 20, 12],
        ["attack", "compressorAttack", 0, 1, 0],
        ["release", "compressorRelease", 0, 1, 0.25]
      ];
      for (const [name, key, min, max, fallback] of parameters) Reflect.get(entry.compressor, name).value = number(Reflect.get(runtime.config, key), min, max, fallback);
      const compressed = runtime.config.compressorEnabled !== false;
      for (const [node, value] of [[entry.compWet, compressed ? 1 : 0], [entry.compDry, compressed ? 0 : 1]]) {
        const param = node.gain, now = context.currentTime, prior = compTransitions.get(param);
        if (prior?.to === value || !prior && param.value === value) continue;
        const from = prior ? prior.from + (prior.to - prior.from) * Math.max(0, Math.min(1, (now - prior.start) / (prior.end - prior.start))) : param.value;
        compTransitions.set(param, { from, to: value, start: now, end: now + 0.01 });
        param.cancelScheduledValues(now);
        param.setValueAtTime(from, now);
        param.linearRampToValueAtTime(value, now + 0.01);
      }
      void queue(entry, entry.wanted).catch(() => {
      });
      syncMeter(entry);
      publish(entry);
    };
    const silenceProtected = (entry) => entry.wanted && entry.gain === 0 && !!entry.latch && entry.latch.offset.value === -1;
    const suspend = (entry, dropWanted = false) => {
      entry.generation++;
      entry.preview = null;
      stopMeter(entry);
      if (entry.failed) {
        announce(entry, "unavailable", "audio-unavailable");
        return;
      }
      if (silenceProtected(entry)) {
        if (entry.appliedGain !== 0 && !entry.failed) fail(entry, "audio-binding-unconfirmed");
        else announce(entry, entry.failed ? "unavailable" : "pending", "scoped-config-pending");
        return;
      }
      if (dropWanted) entry.wanted = false;
      if (entry.source && !entry.failed) void queue(entry, false).catch(() => {
      });
      announce(entry, entry.wanted ? "pending" : "off");
    };
    const controller = {
      async prepareTransitionModule(url) {
        const resource = new URL(url), path = ["", "web", "audio-transition-worklet.js"].join(String.fromCharCode(47));
        if (resource.protocol !== "chrome-extension:" || !/^[a-p]{32}$/.test(resource.hostname) || resource.username || resource.password || resource.port || resource.pathname !== path || resource.search || resource.hash || resource.href !== url || moduleUrl && moduleUrl !== url) throw Error("audio-module-invalid");
        moduleUrl = url;
        registerModule();
      },
      async setEnabled(video, enabled) {
        if (scope.disposed) return "off";
        let entry = entryFor(video);
        if (enabled && entry.failed && !entry.source) {
          const listeners = entry.listeners;
          entry.generation++;
          entries.delete(video);
          entry = entryFor(video);
          entry.listeners = listeners;
        }
        const generation = ++entry.generation;
        entry.wanted = enabled === true;
        if (!entry.wanted) {
          entry.appliedGain = null;
          stopMeter(entry);
          if (!entry.node || !entry.connected || entry.failed || entry.retiring) entry.latch?.offset.setValueAtTime(0, context.currentTime);
          if (entry.node && !entry.failed && !entry.retiring) void queue(entry, false).catch(() => {
          });
          announce(entry, "off");
          return "off";
        }
        if (entry.failed) return "unavailable";
        if (entry.retiring) {
          apply(entry);
          announce(entry, "pending", "audio-retiring");
          const retiring = entry.retiring;
          try {
            if (context && context.state !== "running") await budget(context.resume(), Date.now() + 1e3);
            await retiring.promise;
          } catch {
            if (entry.retiring === retiring) fail(entry, "audio-retire-unavailable");
            return entry.state;
          }
          if (generation !== entry.generation || !entry.wanted || scope.disposed) return entry.state;
          return controller.setEnabled(video, true);
        }
        if (runtime.selectPlayer()?.video !== video || !eligible(video)) {
          suspend(entry);
          announce(entry, "unavailable", "unsupported-media-source");
          return entry.state;
        }
        if (!runtime.mediaCurrent()) {
          suspend(entry);
          return entry.state;
        }
        const requestId = runtime.mediaRequestId, binding = runtime.media.audioBindingGeneration;
        const current = () => !scope.disposed && generation === entry.generation && entry.wanted && runtime.mediaCurrent() && runtime.mediaRequestId === requestId && runtime.media.audioBindingGeneration === binding && runtime.selectPlayer()?.video === video && eligible(video);
        const inactive = () => {
          if (scope.disposed || runtime.selectPlayer()?.video !== video) {
            entry.wanted = false;
            entry.state = "off";
          }
          return entry.state;
        };
        announce(entry, "pending", "audio-context");
        const deadline = Date.now() + 1e3;
        try {
          await budget(moduleRegistered, deadline);
          if (!current()) return inactive();
          const Context = browser.AudioContext || browser.webkitAudioContext;
          if (!Context) throw Error("audio-context-unavailable");
          if (!context) {
            context = new Context();
            scope.on(context, "statechange", () => {
              if (context?.state === "running") for (const entry2 of connected) {
                sendPending(entry2);
                syncMeter(entry2);
              }
            });
          }
          if (context.state !== "running") await budget(context.resume(), deadline);
          if (!current() || context.state !== "running") return inactive();
          moduleLoad ||= context.audioWorklet.addModule(moduleUrl);
          await budget(moduleLoad, deadline);
          if (!current()) return inactive();
          if (Date.now() >= deadline) throw Error("audio-prepare-timeout");
          if (!entry.node) {
            if (!entry.dry) {
              entry.dry = context.createGain();
              entry.dry.gain.value = 1;
              entry.wet = context.createGain();
              entry.wet.gain.value = 0;
              entry.gainNode = context.createGain();
              entry.gainNode.gain.value = 0;
              entry.permit = context.createGain();
              entry.permit.gain.value = 1;
              entry.dryDelay = context.createDelay(0.02);
              entry.dryDelay.delayTime.value = compressorDelay(context.sampleRate);
              entry.compressor = context.createDynamicsCompressor();
              entry.compDelay = context.createDelay(0.02);
              entry.compDelay.delayTime.value = compressorDelay(context.sampleRate);
              entry.compDry = context.createGain();
              entry.compDry.gain.value = runtime.config.compressorEnabled === false ? 1 : 0;
              entry.compWet = context.createGain();
              entry.compWet.gain.value = runtime.config.compressorEnabled === false ? 0 : 1;
              entry.compMix = context.createGain();
              entry.normalizer = context.createGain();
              entry.normalizer.gain.value = 0;
              entry.limiter = context.createWaveShaper();
              entry.limiter.curve = limiterCurve();
              entry.limiter.oversample = "none";
              entry.dryDelay.connect(entry.dry);
              entry.dry.connect(entry.permit);
              entry.permit.connect(context.destination);
            }
            if (!entry.latch) {
              entry.latch = context.createConstantSource();
              entry.latch.offset.value = 0;
              entry.latch.start();
              entry.latch.connect(entry.permit.gain);
            }
            entry.compressor.connect(entry.compWet);
            entry.compDelay.connect(entry.compDry);
            entry.compWet.connect(entry.compMix);
            entry.compDry.connect(entry.compMix);
            entry.compMix.connect(entry.normalizer);
            entry.normalizer.connect(entry.gainNode);
            entry.gainNode.connect(entry.limiter);
            entry.limiter.connect(entry.wet);
            entry.wet.connect(context.destination);
            entry.boundKey = JSON.stringify([video.currentSrc, runtime.media.context.documentGeneration, runtime.media.context.routePath]);
            const node = new browser.AudioWorkletNode(context, "knife-audio-transition-l1", {
              numberOfInputs: 1,
              numberOfOutputs: 2,
              outputChannelCount: [2, 5],
              channelCount: 2,
              channelCountMode: "explicit",
              channelInterpretation: "speakers",
              processorOptions: {
                sourceEpoch: entry.epoch,
                initial: entry.source && entry.latch.offset.value === -1 ? "silent-hold" : "raw"
              }
            });
            entry.node = node;
            entry.controls = context.createChannelSplitter(5);
            let ready;
            entry.prepared = new Promise((resolve) => {
              ready = resolve;
            });
            node.onprocessorerror = () => {
              if (entry.node === node && entries.get(video) === entry) fail(entry, "audio-processor-failed");
            };
            node.port.onmessage = (event) => {
              if (entry.node !== node || entry.failed) return;
              const row = event.data;
              if (!row || row.sourceEpoch !== entry.epoch || !Number.isSafeInteger(row.seq) || row.kind === "prepared" && row.seq !== 0 || !Number.isSafeInteger(row.frame) || row.kind === "prepared" && row.frame < 0 || !Number.isSafeInteger(row.meterEpoch) || !["prepared", "accepted", "completed", "rejected", "failed", "meter-accepted", "retired"].includes(row.kind) || row.code !== null && (typeof row.code !== "string" || row.code.length > 80)) {
                fail(entry, "audio-reply-invalid");
                return;
              }
              if (row.kind === "prepared") {
                ready();
                return;
              }
              if (row.kind === "failed") {
                fail(entry, row.code || "audio-processor-failed");
                return;
              }
              if (row.kind === "meter-accepted") {
                const ticket = entry.meterFlight;
                if (ticket && ticket.seq === row.seq) {
                  target.clearTimeout(ticket.timer);
                  entry.meterFlight = null;
                  const packet = entry.meterPending;
                  entry.meterPending = null;
                  if (packet) sendMeter(entry, packet);
                  if (row.meterEpoch !== entry.meterEpoch || !entry.meter || !entry.wanted || runtime.config.normalizerEnabled !== true) return;
                  entry.normalizerStatus = entry.meterFailureEpoch === entry.meterEpoch ? { state: "limited", reason: "normalizer-unavailable" } : row.code === "error" ? { state: "limited", reason: "normalizer-samples-invalid" } : row.code === "ramp" ? { state: "ready", reason: "" } : { state: "pending", reason: "normalizer-warming-up" };
                  publish(entry);
                }
                return;
              }
              const job = entry.flight;
              if (row.kind === "retired") {
                const retiring = entry.retiring;
                if (!retiring || !job || job.packet.kind !== "retire" || row.seq !== job.packet.seq) return;
                if (Object.keys(row).sort().join(",") !== "code,frame,gain,kind,meterEpoch,seq,sourceEpoch" || row.gain !== null || row.code !== null || retiring.offFrame === null || row.frame < retiring.offFrame || row.meterEpoch !== entry.meterEpoch) {
                  fail(entry, "audio-retire-invalid");
                  return;
                }
                if (entry.commandTimer !== void 0) target.clearTimeout(entry.commandTimer);
                entry.commandTimer = void 0;
                clearMeterFlight(entry);
                stopMeter(entry);
                entry.source?.disconnect(node);
                entry.controls?.disconnect();
                node.disconnect();
                node.port.onmessage = null;
                node.port.close?.();
                const K2 = node.parameters.get("K");
                if (K2) entry.latch.disconnect(K2);
                for (const part of [entry.compressor, entry.compDelay, entry.compWet, entry.compDry, entry.compMix, entry.normalizer, entry.gainNode, entry.limiter, entry.wet]) part?.disconnect();
                if (!(entry.wanted && entry.gain === 0)) {
                  entry.latch.disconnect();
                  entry.latch.stop();
                  entry.latch = void 0;
                }
                entry.node = void 0;
                entry.controls = void 0;
                entry.prepared = void 0;
                entry.connected = false;
                connected.delete(entry);
                entry.flight = entry.pending = null;
                entry.lastJob = void 0;
                entry.appliedGain = null;
                entry.epoch = ++epoch;
                entry.seq = entry.meterSeq = entry.meterEpoch = 0;
                target.clearTimeout(retiring.timer);
                entry.retiring = void 0;
                retiring.resolve();
                return;
              }
              if (row.kind === "completed") {
                if (row.seq === entry.seq && typeof row.gain === "number" && Number.isFinite(row.gain) && row.gain >= 0 && row.gain <= 2) entry.appliedGain = row.gain;
                if (entry.retiring && job?.packet.kind === "configure" && !job.packet.wanted && row.seq === job.packet.seq) {
                  if (row.gain !== 1 || entry.latch.offset.value !== 0) {
                    fail(entry, "audio-retire-not-raw");
                    return;
                  }
                  if (entry.commandTimer !== void 0) target.clearTimeout(entry.commandTimer);
                  entry.commandTimer = void 0;
                  entry.retiring.offFrame = row.frame;
                  entry.flight = null;
                  job.resolve();
                  const retiring = entry.retiring;
                  entry.pending = { packet: { kind: "retire", sourceEpoch: entry.epoch, seq: ++entry.seq }, signature: "retire", ...retiring };
                  sendPending(entry);
                }
                return;
              }
              if (!job || row.seq !== job.packet.seq) return;
              if (row.kind === "accepted" && (job.packet.kind === "retire" || entry.retiring)) {
                if (job.packet.kind === "configure") entry.meterEpoch = row.meterEpoch;
                return;
              }
              if (entry.commandTimer !== void 0) target.clearTimeout(entry.commandTimer);
              entry.commandTimer = void 0;
              entry.flight = null;
              if (row.kind === "rejected") {
                job.reject(Error("audio-command-rejected"));
                fail(entry, "audio-command-rejected");
                return;
              }
              entry.meterEpoch = row.meterEpoch;
              job.resolve();
              sendPending(entry);
              syncMeter(entry);
            };
            node.connect(entry.controls, 1);
            const params = [entry.dry.gain, entry.wet.gain, entry.gainNode.gain, entry.normalizer.gain, entry.permit.gain];
            params.forEach((param, i) => {
              param.automationRate = "a-rate";
              entry.controls.connect(param, i);
            });
            const K = node.parameters.get("K");
            if (!K) throw Error("audio-latch-parameter");
            entry.latch.connect(K);
            node.connect(entry.compressor, 0);
            node.connect(entry.compDelay, 0);
          }
          await budget(entry.prepared, deadline);
          if (!current()) return inactive();
          if (Date.now() >= deadline) throw Error("audio-prepare-timeout");
          if (!entry.source) {
            entry.boundKey = JSON.stringify([video.currentSrc, runtime.media.context.documentGeneration, runtime.media.context.routePath]);
            entry.source = context.createMediaElementSource(video);
            entry.sources++;
            entry.source.connect(entry.dryDelay);
          }
          connected.add(entry);
          if (!current()) {
            suspend(entry, runtime.selectPlayer()?.video !== video);
            return inactive();
          }
          if (!entry.connected) {
            entry.source.connect(entry.node);
            entry.connected = true;
          }
          apply(entry);
          sendPending(entry);
          const accepted = entry.lastJob?.promise;
          if (accepted) await budget(accepted, deadline);
          if (current()) announce(entry, "on");
        } catch {
          if (generation !== entry.generation || !entry.wanted || scope.disposed) return inactive();
          fail(entry, "audio-unavailable");
        }
        return entry.state;
      },
      getState(video) {
        return entries.get(video)?.state || "off";
      },
      setGain(video, value) {
        const entry = entryFor(video);
        entry.gain = number(value, 0, 2, 1);
        entry.preview = { value: entry.gain, source: video.currentSrc, document: runtime.media.context.documentGeneration, path: runtime.media.context.routePath, binding: runtime.media.audioBindingGeneration };
        apply(entry);
        publish(entry);
        return entry.gain;
      },
      applyPreviewGain(video, value, current) {
        const expected = runtime.media.context;
        if (!Number.isFinite(value) || value < 0 || value > 2 || !runtime.mediaCurrent() || runtime.state.player?.video !== video || !current || !["documentGeneration", "routePath", "channelId", "playerGeneration"].every((key) => Object.getOwnPropertyDescriptor(current, key)?.value === Object.getOwnPropertyDescriptor(expected, key)?.value)) return false;
        controller.setGain(video, value);
        return true;
      },
      getReadback(video) {
        const entry = entries.get(video);
        return { state: entry?.state ?? "off", wanted: entry?.wanted ?? false, gain: entry?.gain ?? storedGain(), appliedGain: entry?.appliedGain ?? null, sources: entry?.sources ?? 0 };
      },
      configure() {
        for (const entry of connected) apply(entry);
      },
      bypass(video) {
        const entry = entries.get(video);
        if (entry) suspend(entry, true);
      },
      suspend(video) {
        const entry = entries.get(video);
        if (entry) suspend(entry);
      },
      resumeWanted(video) {
        const entry = entries.get(video);
        if (entry?.failed) return Promise.resolve("unavailable");
        return entry?.wanted ? controller.setEnabled(video, true) : Promise.resolve("off");
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
          if (Date.now() - entry.detachedSince >= 5e3 && context?.state === "running" && !silenceProtected(entry) && !entry.failed && !entry.retiring && !entry.flight && !entry.pending && entry.appliedGain !== null) {
            let resolve, reject;
            const promise = new Promise((a, b) => {
              resolve = a;
              reject = b;
            });
            void promise.catch(() => {
            });
            const timer = target.setTimeout(() => {
              if (entry.retiring?.promise === promise) fail(entry, "audio-retire-timeout");
            }, 2e3);
            entry.retiring = { promise, resolve, reject, offFrame: null, timer };
            entry.lastJob = void 0;
            suspend(entry, true);
          }
        }
      }, 1e3);
      scope.on(target, "pagehide", (event) => {
        if (!scope.disposed && !event.persisted) {
          for (const entry of connected) {
            suspend(entry, true);
            clearMeterFlight(entry);
            stopMeter(entry);
          }
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
