import type { KnifeRuntime } from '../../runtime/contracts';
import type { AudioController, AudioState } from './contracts';
import { compressorDelay, limiterCurve } from './curve';

type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

interface GainTransition {
  from: number;
  to: number;
  start: number;
  end: number;
}

interface AudioEntry {
  video: HTMLVideoElement;
  state: AudioState;
  wanted: boolean;
  generation: number;
  gain: number;
  listeners: Set<(state: AudioState, gain: number) => void>;
  source?: MediaElementAudioSourceNode;
  dry?: GainNode;
  wet?: GainNode;
  dryDelay?: DelayNode;
  compressor?: DynamicsCompressorNode;
  gainNode?: GainNode;
  limiter?: WaveShaperNode;
  gainTransition?: GainTransition | null;
  connected?: boolean;
  detachedSince?: number | null;
}

const registryName = 'cheese-knife.runtime.v1';
const number = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;

export function installAudio(target: Window): AudioController | null {
  const browser = target as AudioWindow;
  const key = browser.Symbol.for(registryName);
  const runtime = Object.getOwnPropertyDescriptor(target, key)?.value as KnifeRuntime | undefined;
  if (runtime?.ownerProtocol !== 2 || runtime.audio) return null;

  const entries = new WeakMap<HTMLVideoElement, AudioEntry>();
  const connected = new Set<AudioEntry>();
  const scope = runtime.createScope();
  let context: AudioContext | undefined;

  const storedGain = (): number => {
    try {
      const value = target.localStorage.getItem('knifeGain');
      return value == null || !value.trim() ? 1 : number(Number(value), 0, 2, 1);
    } catch { return 1; }
  };
  const entryFor = (video: HTMLVideoElement): AudioEntry => {
    let entry = entries.get(video);
    if (!entry) {
      entry = { video, state: 'off', wanted: false, generation: 0, gain: storedGain(), listeners: new Set() };
      entries.set(video, entry);
    }
    return entry;
  };
  const announce = (entry: AudioEntry, state: AudioState, reason = ''): void => {
    entry.state = state;
    runtime.setStatus('compressor', state === 'on' ? 'ready' : state === 'off' ? 'disabled' : state === 'pending' ? 'pending' : 'limited', reason);
    for (const callback of entry.listeners) {
      try { callback(state, entry.gain); }
      catch {}
    }
  };
  const ramp = (parameter: AudioParam, value: number): void => {
    const now = context!.currentTime;
    parameter.cancelScheduledValues?.(now);
    parameter.setValueAtTime?.(parameter.value, now);
    if (parameter.linearRampToValueAtTime) parameter.linearRampToValueAtTime(value, now + 0.01);
    else parameter.value = value;
  };
  const applyGain = (entry: AudioEntry): void => {
    const parameter = entry.gainNode!.gain;
    const previous = entry.gainTransition;
    const now = context!.currentTime;
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
  const apply = (entry: AudioEntry): void => {
    if (!entry.compressor) return;
    if (!runtime.mediaCurrent() || runtime.selectPlayer()?.video !== entry.video || !eligible(entry.video)) { controller.suspend(entry.video);return; }
    const parameters = [
      { parameter: entry.compressor.threshold, configured: runtime.config.compressorThreshold, min: -100, max: 0, fallback: -50 },
      { parameter: entry.compressor.knee, configured: runtime.config.compressorKnee, min: 0, max: 40, fallback: 40 },
      { parameter: entry.compressor.ratio, configured: runtime.config.compressorRatio, min: 1, max: 20, fallback: 12 },
      { parameter: entry.compressor.attack, configured: runtime.config.compressorAttack, min: 0, max: 1, fallback: 0 },
      { parameter: entry.compressor.release, configured: runtime.config.compressorRelease, min: 0, max: 1, fallback: 0.25 },
    ];
    for (const item of parameters) item.parameter.value = number(item.configured, item.min, item.max, item.fallback);
    applyGain(entry);
  };
  const connect = (entry: AudioEntry): void => {
    if (entry.connected) return;
    entry.source!.connect(entry.dryDelay!);
    entry.dryDelay!.connect(entry.dry!);
    entry.source!.connect(entry.compressor!);
    entry.compressor!.connect(entry.gainNode!);
    entry.gainNode!.connect(entry.limiter!);
    entry.limiter!.connect(entry.wet!);
    entry.dry!.connect(context!.destination);
    entry.wet!.connect(context!.destination);
    entry.connected = true;
    connected.add(entry);
  };
  const bypassEntry = (entry: AudioEntry): void => {
    if (entry.source) {
      ramp(entry.dry!.gain, 1);
      ramp(entry.wet!.gain, 0);
    }
  };
  const eligible = (video: HTMLVideoElement): boolean => {
    if (!video || video.ownerDocument !== target.document || video.mediaKeys) return false;
    try { return video.currentSrc.startsWith('blob:') && new URL(video.currentSrc).origin === target.location.origin; }
    catch { return false; }
  };

  const controller: AudioController = {
    async setEnabled(video, enabled) {
      if (scope.disposed) return 'off';
      const entry = entryFor(video);
      const generation = ++entry.generation;
      entry.wanted = enabled === true;
      if (!entry.wanted) { bypassEntry(entry); announce(entry, 'off'); return 'off'; }
      if (runtime.selectPlayer()?.video !== video || !eligible(video)) {
        bypassEntry(entry); announce(entry, 'unavailable', 'unsupported-media-source'); return entry.state;
      }
      if (!runtime.mediaCurrent()) { bypassEntry(entry);announce(entry,'pending','scoped-config-pending');return entry.state; }
      const requestId = runtime.mediaRequestId,binding = runtime.media.audioBindingGeneration;
      const current = () => runtime.mediaCurrent() && runtime.mediaRequestId === requestId &&
        runtime.media.audioBindingGeneration === binding && runtime.selectPlayer()?.video === video;
      announce(entry, 'pending', 'audio-context');
      try {
        const AudioContextClass = browser.AudioContext || browser.webkitAudioContext;
        if (!AudioContextClass) throw new Error('audio-context-unavailable');
        context ||= new AudioContextClass();
        if (context.state !== 'running') {
          let timer: number | undefined;
          try {
            await Promise.race([
              context.resume(),
              new Promise<never>((_, reject) => { timer = target.setTimeout(() => reject(new Error('user-gesture-required')), 1000); }),
            ]);
          } finally { if (timer !== undefined) target.clearTimeout(timer); }
        }
        if (scope.disposed) { entry.wanted = false; entry.state = 'off'; return entry.state; }
        if (generation !== entry.generation || !entry.wanted) return entry.state;
        if (!current()) { bypassEntry(entry);announce(entry,'pending','scoped-config-pending');return entry.state; }
        if (context.state !== 'running' || runtime.selectPlayer()?.video !== video || !eligible(video)) throw new Error('audio-not-ready');
        if (!entry.source) {
          entry.dry = context.createGain(); entry.dry.gain.value = 1;
          entry.wet = context.createGain(); entry.wet.gain.value = 0;
          entry.dryDelay = context.createDelay(0.02); entry.dryDelay.delayTime.value = compressorDelay(context.sampleRate);
          entry.compressor = context.createDynamicsCompressor();
          entry.gainNode = context.createGain(); entry.gainTransition = null; apply(entry);
          entry.limiter = context.createWaveShaper();
          entry.limiter.curve = limiterCurve(); entry.limiter.oversample = 'none';
          if (!current() || generation !== entry.generation || !entry.wanted) return entry.state;
          entry.source = context.createMediaElementSource(video);
        }
        if (scope.disposed || !current() || generation !== entry.generation || !entry.wanted) {
          connect(entry);bypassEntry(entry);return entry.state;
        }
        connect(entry); apply(entry);
        ramp(entry.dry!.gain, 0); ramp(entry.wet!.gain, 1);
        announce(entry, 'on');
      } catch (error: unknown) {
        if (scope.disposed) { entry.wanted = false; entry.state = 'off'; return entry.state; }
        if (generation !== entry.generation || !entry.wanted) return entry.state;
        if (entry.source) {
          try { connect(entry); bypassEntry(entry); }
          catch {
            try { entry.source.disconnect(); entry.source.connect(context!.destination); }
            catch {}
          }
        }
        const reason = error instanceof browser.Error && error.message === 'user-gesture-required' ? 'user-gesture-required' : 'audio-unavailable';
        announce(entry, 'unavailable', reason);
      }
      return entry.state;
    },
    getState(video) { return entries.get(video)?.state || 'off'; },
    setGain(video, value) {
      const entry = entryFor(video);
      entry.gain = number(value, 0, 2, 1);
      try { target.localStorage.setItem('knifeGain', String(entry.gain)); } catch {}
      apply(entry); announce(entry, entry.state); return entry.gain;
    },
    configure() { for (const entry of connected) apply(entry); },
    bypass(video) {
      const entry = entries.get(video);
      if (entry) { entry.generation++; entry.wanted = false; bypassEntry(entry); announce(entry, 'off'); }
    },
    suspend(video) {
      const entry = entries.get(video);
      if (entry) { entry.generation++;bypassEntry(entry);announce(entry,entry.wanted ? 'pending' : 'off'); }
    },
    resumeWanted(video) {
      return entries.get(video)?.wanted ? controller.setEnabled(video,true) : Promise.resolve('off');
    },
    subscribe(video, callback) {
      const entry = entryFor(video);
      entry.listeners.add(callback);
      callback(entry.state, entry.gain);
      return () => entry.listeners.delete(callback);
    },
    eligible,
  };

  try {
    scope.interval(() => {
      for (const entry of connected) {
        if (entry.video.isConnected || !entry.video.paused) { entry.detachedSince = null; continue; }
        entry.detachedSince ||= Date.now();
        if (Date.now() - entry.detachedSince >= 5000) {
          controller.bypass(entry.video);
          for (const node of [entry.source!, entry.compressor!, entry.gainNode!, entry.limiter!, entry.wet!]) node.disconnect();
          entry.source!.connect(entry.dryDelay!);
          entry.connected = false; connected.delete(entry);
        }
      }
    }, 1000);
    scope.on(target, 'pagehide', event => {
      if (!(event as PageTransitionEvent).persisted) {
        for (const entry of connected) controller.bypass(entry.video);
        scope.dispose();
      }
    });
  } catch (error: unknown) {
    scope.dispose();
    throw error;
  }
  runtime.audio = controller;
  return controller;
}
