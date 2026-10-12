import type { KnifeRuntime } from '../../runtime/contracts';
import type { PreviewBackend, PreviewIntent, PreviewLiveInfo, PreviewSession } from './contracts';
import type { PreviewPanel } from './panel';

type BrowserWindow = Window & typeof globalThis;

interface HlsLevel { height?: number; videoCodec?: string; audioCodec?: string }
interface HlsInstance extends PreviewBackend {
  levels: HlsLevel[];
  startLevel: number;
  autoLevelCapping: number;
  on(event: string, callback: (event: string, data: unknown) => void): void;
  loadSource(path: string): void;
  attachMedia(video: HTMLVideoElement): void;
  startLoad(): void;
  recoverMediaError(): void;
}
interface HlsConstructor {
  new(options: Record<string, boolean | number>): HlsInstance;
  isSupported(): boolean;
  Events: { ERROR: string; MANIFEST_PARSED: string };
}
type PreviewRuntime = KnifeRuntime & { Hls?: HlsConstructor };
export interface PlaybackIntent extends PreviewIntent { invalidate(): void }
export interface PreviewPlaybackSession extends PreviewSession {
  play(manual?: boolean): Promise<void>;
  toggle(): void;
  refresh(): void;
  setVolume(): void;
}

let sessionSequence = 0;

function own(record: unknown, key: string): unknown {
  if (typeof record !== 'object' || record === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function code(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : 'unknown';
}

function errorInfo(value: unknown): { type: string; details: string; fatal: boolean; status: number | null } {
  const response = own(value, 'response');
  const status = own(response, 'code');
  return {
    type: code(own(value, 'type')),
    details: code(own(value, 'details')),
    fatal: own(value, 'fatal') === true,
    status: typeof status === 'number' && Number.isFinite(status) ? status : null,
  };
}

function volume(runtime: KnifeRuntime): number {
  const value = runtime.config.previewVolume;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : 0.05;
}

export function createPlayback(runtime: KnifeRuntime, panel: PreviewPanel, intent: PlaybackIntent, info: PreviewLiveInfo): PreviewPlaybackSession {
  const target = intent.anchor.ownerDocument.defaultView as BrowserWindow | null;
  if (!target || !panel.player || !panel.root || !panel.audioNote) throw new Error('preview-window-unavailable');
  const Hls = (runtime as PreviewRuntime).Hls;
  panel.diagnostics.hlsSupported = !!Hls?.isSupported();
  const path = info.playback?.media.find(item => item.mediaId === 'HLS')?.path;
  const controller = new target.AbortController();
  const timers = new Set<number>();
  let disposed = false;
  let failed = false;
  const video = target.document.createElement('video'); video.playsInline = true; video.muted = true; video.volume = volume(runtime);
  video.className = 'knife-preview-video'; video.style.visibility = 'hidden';
  video.style.cssText += ';width:100%;height:100%;object-fit:contain;background:#000;';
  panel.player.append(video);
  const session: PreviewPlaybackSession = {
    token: ++sessionSequence, abort: controller, timers, backend: null, media: video,
    dispose() {
      if (disposed) return;
      disposed = true; controller.abort();
      for (const timer of timers) target.clearTimeout(timer); timers.clear();
      try { session.backend?.destroy(); } catch {}
      session.backend = null;
      try { video.pause(); video.removeAttribute('src'); video.srcObject = null; video.load(); } catch {}
      video.remove(); session.media = null;
    },
    play: async () => {}, toggle: () => {}, refresh: () => {}, setVolume: () => { video.volume = volume(runtime); },
  };
  const later = (callback: () => void, delay: number): number => {
    const timer = target.setTimeout(() => { timers.delete(timer); callback(); }, delay); timers.add(timer); return timer;
  };
  const ownsAnchor = (): boolean => !!runtime.state.sidebar?.isConnected && intent.anchor.isConnected && runtime.state.sidebar.contains(intent.anchor);
  const active = (): boolean => !disposed && !failed && session.media === video && ownsAnchor() && intent.anchor.href === intent.href &&
    target.location.pathname === intent.route && runtime.config.preview === true && runtime.configReady && !target.document.hidden;
  const note = (event: { type: string; readonly [key: string]: unknown }): void => {
    panel.diagnostics.events.push(event);
    if (panel.diagnostics.events.length > 20) panel.diagnostics.events.shift();
  };
  const sample = (type: string): void => {
    if (!active()) return;
    let ahead = 0;
    for (let index = 0; index < video.buffered.length; index++) {
      if (video.buffered.start(index) <= video.currentTime && video.buffered.end(index) >= video.currentTime) ahead = video.buffered.end(index) - video.currentTime;
    }
    note({ type, currentTime: video.currentTime, readyState: video.readyState, bufferedAhead: ahead,
      width: video.videoWidth, height: video.videoHeight, paused: video.paused });
  };
  const fail = (reason = 'stream-playback-unavailable'): void => {
    if (!active()) return;
    failed = true; intent.invalidate();
    try { session.backend?.destroy(); video.pause(); video.removeAttribute('src'); video.load(); } catch {}
    session.backend = null; video.style.visibility = 'hidden'; panel.audioNote!.hidden = true;
    runtime.setStatus('livePreview', 'limited', reason);
  };
  if (!path) {
    failed = true; video.remove(); session.media = null;
    runtime.setStatus('livePreview', 'limited', info.adult ? 'age-restricted-stream' : 'stream-unavailable');
    return session;
  }

  let attempt = 0;
  let playingRequest: { attempt: number; audioRevision: number } | null = null;
  let dataReady = false;
  const startUnmuted = intent.startUnmuted;
  let desiredMuted = !startUnmuted;
  let audioRevision = 0;
  let fallbackUsed = false;
  let soundBlocked = false;
  let policyBlockRevision: number | null = null;
  let recoveries = 0;
  let loaded = false;
  let watching = false;
  let lastTime = 0;
  let lastProgress = 0;
  const watchProgress = (): void => {
    if (!active()) return;
    const now = target.performance.now();
    if (Math.abs(video.currentTime - lastTime) > 0.01) lastProgress = now;
    else if (now - lastProgress >= 10000) { sample('stalled-timeout'); fail('stream-stalled'); return; }
    lastTime = video.currentTime; later(watchProgress, 1000);
  };
  const renderAudioNote = (): void => {
    if (!active()) return;
    const element = panel.audioNote!;
    element.hidden = !soundBlocked;
    const text = soundBlocked ? (runtime.i18n.previewAudioBlocked || 'The browser blocked automatic sound. Playing muted.') +
      (runtime.config.rightClickToUnmute === true ? ` ${runtime.i18n.previewAudioRightClick || 'Right-click the sidebar target to unmute.'}` : '') : '';
    if (element.textContent !== text) element.textContent = text;
  };
  const play = async (manual = false): Promise<void> => {
    if (!active() || !dataReady || (startUnmuted && panel.root!.hidden) ||
      (!manual && (playingRequest?.attempt === attempt || (loaded && !video.paused)))) return;
    const request = { attempt, audioRevision }; playingRequest = request;
    const currentRequest = (): boolean => active() && request.attempt === attempt;
    const currentAudio = (): boolean => currentRequest() && request.audioRevision === audioRevision;
    const complete = (): void => {
      if (!currentRequest()) return;
      loaded = true; video.style.visibility = ''; runtime.setStatus('livePreview', 'ready');
      if (currentAudio() && !desiredMuted && !video.muted && !video.paused) {
        policyBlockRevision = null; soundBlocked = false; renderAudioNote();
      } else if (currentAudio() && video.muted && policyBlockRevision === audioRevision) {
        soundBlocked = true; renderAudioNote();
      }
      if (!watching) { watching = true; lastTime = video.currentTime; lastProgress = target.performance.now(); later(watchProgress, 1000); }
    };
    video.muted = desiredMuted;
    try { await video.play(); complete(); }
    catch (error: unknown) {
      if (!currentAudio()) return;
      if (!manual && startUnmuted && !desiredMuted && !fallbackUsed && own(error, 'name') === 'NotAllowedError') {
        fallbackUsed = true; policyBlockRevision = audioRevision; desiredMuted = true; video.muted = true;
        try { await video.play(); complete(); }
        catch { if (currentAudio()) fail(); }
      } else fail();
    } finally { if (playingRequest === request) playingRequest = null; }
  };
  session.play = play;
  session.refresh = renderAudioNote;
  session.toggle = () => {
    if (!active()) return;
    audioRevision++; desiredMuted = !desiredMuted;
    video.volume = volume(runtime); video.muted = startUnmuted && panel.root!.hidden ? true : desiredMuted;
    if (!desiredMuted || video.paused) void play(true);
  };
  video.addEventListener('loadeddata', () => { dataReady = true; void play(); });
  video.addEventListener('error', () => { sample('media-error'); if (!session.backend) fail(); });
  for (const event of ['waiting', 'stalled', 'playing', 'loadedmetadata']) video.addEventListener(event, () => {
    sample(event);
    if (!active()) return;
    if (event === 'playing') runtime.setStatus('livePreview', 'ready');
    else if (event === 'waiting' || event === 'stalled') runtime.setStatus('livePreview', 'pending', 'stream-buffering');
  });
  try {
    if (Hls?.isSupported()) {
      const hls = session.backend = new Hls({ enableWorker: false, autoStartLoad: false, capLevelToPlayerSize: true,
        maxBufferLength: 8, maxMaxBufferLength: 16, backBufferLength: 0 });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!active() || session.backend !== hls) return;
        const info = errorInfo(data);
        note({ type: info.type, details: info.details, fatal: info.fatal, status: info.status });
        if (!info.fatal) return;
        const denied = info.status === 401 || info.status === 403;
        const mediaFailure = info.type === 'mediaError';
        const networkFailure = info.type === 'networkError' && hls.levels.length > 0;
        if (denied || recoveries >= 2 || (!mediaFailure && !networkFailure)) { fail(); return; }
        recoveries++; attempt++;
        const recoveryAttempt = attempt;
        runtime.setStatus('livePreview', 'pending', 'stream-recovering');
        note({ type: 'recovery', attempt: recoveries, reason: mediaFailure ? 'media' : 'network' });
        const recover = (): void => {
          if (!active() || session.backend !== hls || recoveryAttempt !== attempt) return;
          try {
            if (mediaFailure) { const position = video.currentTime; hls.recoverMediaError(); if (position === 0) hls.startLoad(); }
            else hls.startLoad();
          } catch { fail(); }
        };
        if (mediaFailure) recover(); else later(recover, 500);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!active() || session.backend !== hls) return;
        note({ type: 'manifestParsed', levels: hls.levels.map(level => ({
          height: typeof level.height === 'number' && Number.isFinite(level.height) ? level.height : null,
          videoCodec: code(level.videoCodec), audioCodec: code(level.audioCodec),
        })) });
        const targetHeight = Math.max(480, (parseFloat(panel.root!.style.width) || 400) * 9 / 16 * Math.min(target.devicePixelRatio || 1, 2));
        const levels = hls.levels.map((level, index) => ({ height: level.height, index }))
          .filter((item): item is { height: number; index: number } => typeof item.height === 'number' && Number.isFinite(item.height) && item.height > 0)
          .sort((a, b) => a.height - b.height);
        const initial = levels.find(item => item.height >= targetHeight) || levels.at(-1);
        if (initial) {
          hls.startLevel = initial.index;
          const cap = hls.autoLevelCapping;
          hls.autoLevelCapping = cap >= 0 ? Math.min(cap, initial.index) : initial.index;
        }
        hls.startLoad();
      });
      hls.loadSource(path); hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = path;
    else { fail(); return session; }
    runtime.setStatus('livePreview', 'pending', 'stream-loading');
    later(() => { if (active() && !loaded) fail(); }, 15000);
  } catch { fail(); }
  return session;
}
