import type { KnifeRuntime, PlayerSnapshot, ResourceScope, RuntimeState } from '../../runtime/contracts';
import type { PlayerController } from './contracts';
import { bounded, ranges, readStats } from './seek';

type BrowserWindow = Window & typeof globalThis;
type MountedSnapshot = PlayerSnapshot & { layout: Element; video: HTMLVideoElement };

interface HoldState {
  target: Element;
  id: number;
  x: number;
  y: number;
  originalRate: number;
  active: boolean;
  timer: number;
  startedPlaying?: boolean;
  indicator?: HTMLElement;
}

interface ClickBlock { target: Element; id: number }

export interface PlayerMount extends MountedSnapshot {
  runtime: KnifeRuntime;
  target: BrowserWindow;
  scope: ResourceScope;
  nodes: Set<Element>;
  pointer: HoldState | null;
  cancelledHold: ClickBlock | null;
  clickBlock: ClickBlock | null;
  clickTimer: number | null;
  path: string;
  holdTarget?: Element;
  track<T extends Element>(node: T): T;
  stopHold(event?: Event | { type: string }): void;
}

interface AudioIntent { path:string;manual:boolean;requested:boolean;automatic:boolean;binding:number;needsResume:boolean }
const audioIntents = new WeakMap<HTMLVideoElement,AudioIntent>();
function audioIntent(runtime: KnifeRuntime,video:HTMLVideoElement): AudioIntent {
  const context = runtime.media.context;let intent = audioIntents.get(video);
  // Replacing the PZP shell renews delivery authority, not the same video's audio intent.
  if (!intent || intent.path !== context.routePath) {
    intent = {path:context.routePath,manual:false,requested:false,automatic:false,binding:-1,needsResume:false};
    audioIntents.set(video,intent);
  }
  return intent;
}
const labelKeys = new Set(['fastForward', 'stats', 'close', 'unknown', 'resolution', 'bitrate', 'fps',
  'measured', 'latency', 'codec', 'enableCompressor', 'disableCompressor', 'speed2x']);

function label(runtime: KnifeRuntime, key: string, fallback: string): string {
  if (!labelKeys.has(key)) return fallback;
  const value = Object.getOwnPropertyDescriptor(runtime.i18n || {}, key)?.value;
  return typeof value === 'string' && value ? value : fallback;
}

function pointerOf(event?: Event | { type: string }): PointerEvent | null {
  return event instanceof Event && event.type.startsWith('pointer') ? event as PointerEvent : null;
}

function ownedButton(document: Document, className: string, text: string, iconKind: 'compressor' | 'live-edge'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `pzp-button knife-owned ${className}`;
  button.title = text;
  button.setAttribute('aria-label', text);
  const svgNamespace = ['http:', '', 'www.w3.org', '2000', 'svg'].join(String.fromCharCode(47));
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS(svgNamespace, 'path');
  if (iconKind === 'compressor') {
    shape.setAttribute('stroke', 'currentColor');
    shape.setAttribute('stroke-width', '2');
    shape.setAttribute('d', 'M3 7v10m4-13v16m5-18v20m5-18v16m4-13v10');
  } else {
    shape.setAttribute('fill', 'currentColor');
    shape.setAttribute('d', 'M4 6v12l8-6zm9 0v12l8-6z');
  }
  svg.append(shape);
  button.append(svg);
  return button;
}

export function mountPlayer(runtime: KnifeRuntime, snapshot: MountedSnapshot): PlayerMount {
  const target = snapshot.pzp.ownerDocument.defaultView as BrowserWindow | null;
  if (!target) throw new Error('player-window-unavailable');
  const scope = runtime.createScope();
  const nodes = new Set<Element>();
  const mount: PlayerMount = {
    ...snapshot, runtime, target, scope, nodes, pointer: null, cancelledHold: null, clickBlock: null, clickTimer: null,
    path: runtime.state.route?.path || '',
    track<T extends Element>(node: T): T { nodes.add(node); return node; },
    stopHold: (_event?: Event | { type: string }) => {},
  };
  scope.add(() => {
    for (const node of nodes) node.remove();
  });
  const clearClick = () => {
    if (mount.clickTimer !== null) target.clearTimeout(mount.clickTimer);
    mount.clickTimer = null; mount.clickBlock = null; mount.cancelledHold = null;
  };
  scope.add(clearClick);
  const blockCompletingClick = (hold: ClickBlock) => {
    clearClick();
    mount.clickBlock = { target: hold.target, id: hold.id };
    mount.clickTimer = target.setTimeout(clearClick, 1000);
  };
  mount.stopHold = event => {
    const pointer = pointerOf(event);
    const cancelled = mount.cancelledHold;
    if (cancelled) {
      if (pointer && pointer.pointerId !== cancelled.id) return;
      if (event?.type === 'pointerup') blockCompletingClick(cancelled);
      else if (event?.type !== 'config-off') mount.cancelledHold = null;
    }
    const hold = mount.pointer;
    if (!hold) return;
    if (pointer && pointer.pointerId !== hold.id) return;
    mount.pointer = null;
    target.clearTimeout(hold.timer);
    if (hold.active && event?.type === 'pointerup') blockCompletingClick(hold);
    else if (hold.active && event?.type === 'config-off') {
      clearClick();
      mount.cancelledHold = { target: hold.target, id: hold.id };
    }
    if (hold.active && mount.video.playbackRate === 2) mount.video.playbackRate = hold.originalRate;
    if (hold.active && hold.startedPlaying && !mount.video.paused) mount.video.pause();
    hold.indicator?.remove();
    if (hold.target.hasPointerCapture?.(hold.id)) hold.target.releasePointerCapture(hold.id);
  };
  scope.add(mount.stopHold);
  scope.on(target, 'pointerdown', clearClick, true);
  scope.on(target, 'click', event => {
    const block = mount.clickBlock;
    const click = event as MouseEvent;
    const eventTarget = event.target;
    if (!block || click.detail === 0 || ('pointerId' in click && typeof click.pointerId === 'number' && click.pointerId !== block.id) ||
        !(eventTarget instanceof target.Node) || !(block.target.contains(eventTarget) || eventTarget === mount.pzp)) return;
    clearClick();
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  scope.on(target, 'blur', mount.stopHold);
  scope.on(target, 'pagehide', mount.stopHold);
  scope.on(target, 'pointerup', mount.stopHold, true);
  scope.on(target, 'pointercancel', mount.stopHold, true);
  scope.on(target, 'pointermove', event => {
    const hold = mount.pointer;
    const pointer = event as PointerEvent;
    if (hold && !hold.active && (Math.abs(pointer.clientX - hold.x) > 10 || Math.abs(pointer.clientY - hold.y) > 10)) mount.stopHold();
  }, true);
  return mount;
}

export function syncControls(mount: PlayerMount): void {
  const { runtime, target, pzp, video, scope } = mount;
  const document = target.document;
  if (runtime.config.pressToFastForward !== true) mount.stopHold({ type: 'config-off' });
  if (runtime.state.route?.kind === 'live') {
    const play = pzp.querySelector('.pzp-pc__playback-switch');
    if (play && !pzp.querySelector('.knife-ff')) {
      const button = mount.track(ownedButton(document, 'pzp-pc__playback-switch knife-ff', label(runtime, 'fastForward', 'Live edge'), 'live-edge'));
      scope.on(button, 'click', event => { event.stopPropagation(); runtime.player?.liveEdge(); });
      play.after(button);
    }
  }
  const license = mount.layout.querySelector('#license') || document.getElementById('license');
  if (license && pzp.contains(license) && !pzp.querySelector('#knife-stats')) {
    const menu = mount.track(license.cloneNode(true) as Element);
    menu.id = 'knife-stats';
    menu.classList.add('knife-owned');
    const link = menu.querySelector<HTMLElement>('button,a');
    if (link) {
      link.textContent = label(runtime, 'stats', 'Stats');
      if (link instanceof target.HTMLAnchorElement) link.href = '#';
      scope.on(link, 'click', event => {
        event.preventDefault(); event.stopPropagation();
        if (mount.layout.querySelector('.knife-stats-overlay')) return;
        const overlayScope = runtime.createScope();
        scope.add(() => overlayScope.dispose());
        const overlay = mount.track(document.createElement('div'));
        overlay.className = 'knife-stats-overlay knife-owned';
        const content = document.createElement('pre');
        const close = document.createElement('button');
        close.type = 'button'; close.textContent = '×'; close.title = label(runtime, 'close', 'Close');
        overlay.append(content, close); mount.layout.append(overlay);
        overlayScope.add(() => overlay.remove());
        overlayScope.on(close, 'click', () => overlayScope.dispose());
        let last: { frames: number; at: number } | undefined;
        const update = async () => {
          let metrics = null;
          try { metrics = await runtime.adapter?.player.readMetrics(mount.layout) || null; } catch {}
          if (overlayScope.disposed || scope.disposed) return;
          const info = readStats(video, metrics);
          let fps: number | null = null;
          const quality = video.getVideoPlaybackQuality?.();
          const now = target.performance.now();
          if (quality) {
            if (last && now > last.at) fps = Math.round((quality.totalVideoFrames - last.frames) * 1000 / (now - last.at));
            last = { frames: quality.totalVideoFrames, at: now };
          }
          const unknown = label(runtime, 'unknown', 'Unknown');
          content.textContent = [
            `${label(runtime, 'resolution', 'Resolution')}: ${info.resolution || unknown}`,
            `${label(runtime, 'bitrate', 'Bitrate')}: ${unknown}`,
            `${label(runtime, 'fps', 'FPS')} (${label(runtime, 'measured', 'measured')}): ${fps ?? unknown}`,
            `${label(runtime, 'latency', 'Latency')}: ${unknown}`,
            `${label(runtime, 'codec', 'Codec')}: ${info.codec || unknown}`,
          ].join('\n');
        };
        void update();
        overlayScope.interval(() => { void update(); }, 1000);
        runtime.setStatus('statistics', 'limited', 'internal-metrics-unavailable');
      });
      license.before(menu);
    }
  }
  const audio = runtime.audio;
  if (audio) {
    const volume = pzp.querySelector('.pzp-pc__volume-control:not(.knife-comp)');
    if (volume && !pzp.querySelector('.knife-comp')) {
      const box = mount.track(document.createElement('div'));
      box.className = 'pzp-pc__volume-control knife-comp knife-owned';
      const button = ownedButton(document, 'pzp-pc__volume-button', label(runtime, 'enableCompressor', 'Enable compressor'), 'compressor');
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0'; slider.max = '2'; slider.step = '0.05';
      slider.className = 'knife-gain-slider'; slider.setAttribute('aria-label', 'Gain');
      box.append(button, slider); volume.after(box);
      scope.on(button, 'click', event => {
        event.stopPropagation();const intent = audioIntent(runtime,video);intent.manual = true;intent.automatic = false;intent.needsResume = !runtime.mediaCurrent();
        void audio.setEnabled(video, !['on', 'pending'].includes(audio.getState(video)));
      });
      scope.on(slider, 'input', () => audio.setGain(video, Number(slider.value)));
      scope.on(slider, 'keydown', event => event.stopPropagation());
      scope.add(audio.subscribe(video, (status, gain) => {
        box.dataset.state = status;
        button.setAttribute('aria-pressed', String(status === 'on'));
        const text = label(runtime, status === 'on' || status === 'pending' ? 'disableCompressor' : 'enableCompressor', 'Compressor');
        button.title = text; button.setAttribute('aria-label', text);
        slider.value = String(gain); slider.hidden = status !== 'on'; slider.title = `${Math.round(gain * 100)}%`;
      }));
    }
    const intent = audioIntent(runtime,video);
    if (!runtime.mediaCurrent()) {
      audio.suspend(video);intent.needsResume = true;
    } else {
      if (intent.binding !== runtime.media.audioBindingGeneration) {
        if (intent.automatic && !intent.manual) { audio.bypass(video);intent.automatic = false;intent.requested = false; }
        if (intent.manual && audio.getState(video) === 'pending') intent.needsResume = true;
        intent.binding = runtime.media.audioBindingGeneration;
      }
      audio.configure();
      if (intent.needsResume) { intent.needsResume = false;void audio.resumeWanted(video); }
      if (runtime.config.compressorDefault === true && !intent.requested && !intent.manual && audio.eligible(video)) {
        intent.requested = true;intent.automatic = true;void audio.setEnabled(video,true);
      }
    }
  }
  const container = pzp.querySelector('.pzp-pc__video');
  if (runtime.state.route?.kind === 'vod' && container && mount.holdTarget !== container) {
    mount.holdTarget = container;
    scope.on(container, 'pointerdown', event => {
      const pointer = event as PointerEvent;
      if (pointer.button !== 0 || runtime.config.pressToFastForward !== true) return;
      mount.stopHold();
      const hold: HoldState = { target: container, id: pointer.pointerId, x: pointer.clientX, y: pointer.clientY,
        originalRate: video.playbackRate, active: false, timer: 0 };
      mount.pointer = hold;
      hold.timer = target.setTimeout(async () => {
        if (mount.pointer !== hold || scope.disposed) return;
        if (runtime.config.pressToFastForward !== true) { mount.stopHold(); return; }
        hold.active = true; hold.originalRate = video.playbackRate; video.playbackRate = 2;
        const indicator = hold.indicator = document.createElement('div');
        indicator.className = 'knife-ff-indicator knife-owned';
        indicator.textContent = label(runtime, 'speed2x', '2x'); pzp.append(indicator);
        try {
          container.setPointerCapture?.(hold.id);
          if (video.paused) {
            hold.startedPlaying = true;
            await video.play();
            if (mount.pointer !== hold && !video.paused) video.pause();
          }
        } catch { mount.stopHold(); }
      }, 500);
    });
  }
}

export function installPlayer(target: Window): PlayerController | null {
  const browser = target as BrowserWindow;
  const key = browser.Symbol.for('cheese-knife.runtime.v1');
  const runtime = Object.getOwnPropertyDescriptor(target, key)?.value as KnifeRuntime | undefined;
  if (runtime?.ownerProtocol !== 2 || runtime.player) return null;
  if (!runtime.adapter) runtime.setStatus('player', 'pending', 'site-adapter-unavailable');
  let current: PlayerMount | null = null;
  let unsubscribe: (() => boolean) | null = null;
  let disposed = false;
  const disposeCurrent = () => { current?.scope.dispose(); current = null; };
  const controller: PlayerController = {
    seek(backward) {
      const video = runtime.state.player?.video;
      if (runtime.state.route?.kind !== 'live' || runtime.config.arrowSeek !== true || !video) return false;
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
    readStats,
  };
  const reconcile = (state: RuntimeState) => {
    const player = state.player;
    if (runtime.configReady) {
      const values = (config: Record<string,unknown>) => KnifeMediaProfiles.validateValues('video',Object.fromEntries(
        KnifeMediaProfiles.videoFields.map(field => [field.id,Object.getOwnPropertyDescriptor(config,field.id)?.value])));
      const base = values(runtime.baseConfig),channel = runtime.media.videoKind === 'channel' && runtime.mediaCurrent() ? values(runtime.config) : null;
      if (base.ok && base.domain === 'video') runtime.filters?.reconcile(base.values,
        channel?.ok && channel.domain === 'video' ? channel.values : null,player?.filterTarget ?? null);
    }
    if (current && (!runtime.configReady || !player || current.pzp !== player.pzp || current.video !== player.video ||
        current.layout !== player.layout || current.path !== state.route?.path)) {
      current.scope.dispose(); current = null;
    }
    if (!runtime.configReady || !player?.video || !player.layout) return;
    if (!current) {
      current = mountPlayer(runtime, player as MountedSnapshot);
      for (const type of ['loadedmetadata', 'loadeddata', 'emptied']) current.scope.on(player.video, type, () => runtime.schedule());
    }
    syncControls(current);
    runtime.setStatus('player', 'ready');
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const element = event.target instanceof browser.Element ? event.target : null;
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        !['ArrowLeft', 'ArrowRight'].includes(event.key) || element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"]')) return;
    const video = runtime.state.player?.video;
    if (runtime.state.route?.kind !== 'live' || runtime.config.arrowSeek !== true || !video || video.seeking || !ranges(video).length) return;
    event.preventDefault(); event.stopImmediatePropagation(); controller.seek(event.key === 'ArrowLeft');
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeCurrent();
    unsubscribe?.(); unsubscribe = null;
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('pagehide', onPageHide);
    if (runtime.player === controller) Reflect.deleteProperty(runtime, 'player');
  };
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose();
  };
  const onState = (state: RuntimeState) => {
    if (disposed) return;
    try { reconcile(state); }
    catch {
      disposeCurrent();
      runtime.setStatus('player', 'failed', 'feature-initialization');
    }
  };
  try {
    unsubscribe = runtime.subscribe(onState);
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('pagehide', onPageHide);
    runtime.player = controller;
    return controller;
  } catch {
    dispose();
    return null;
  }
}
