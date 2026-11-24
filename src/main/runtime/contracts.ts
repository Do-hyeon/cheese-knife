import type { SiteAdapter } from '../site-adapter/contracts';
import type { AudioController } from '../features/audio/contracts';
import type { PlayerController, VideoFilterController } from '../features/player/contracts';
import type { PreviewController } from '../features/preview/contracts';
import type { ScopedContext as KnifeScopedContext, MediaVersion as KnifeMediaVersion } from '../../shared/media-contracts';

export type RouteKind = 'excluded' | 'live' | 'vod' | 'channel' | 'explore';

export interface Route {
  kind: RouteKind;
  path: string;
  id?: string;
}

export interface PlayerSnapshot {
  layout: Element | null;
  pzp: Element;
  video: HTMLVideoElement | null;
  vue: boolean;
  reactOnLayout: boolean;
  filterTarget: Element | null;
}

export interface RuntimeState {
  route?: Route;
  body?: HTMLElement | null;
  player?: PlayerSnapshot | null;
  sidebar?: Element | null;
  generation?: number;
}

export type FeatureState = 'pending' | 'ready' | 'limited' | 'failed' | 'disabled';

export interface FeatureStatus {
  state: FeatureState;
  reason: string;
}

export interface RuntimeDiagnostics {
  world: 'MAIN';
  route: RouteKind;
  player: boolean;
  vue: boolean;
  webpackKnown: boolean;
  reactOnLayout: boolean;
  mediaBlob: boolean;
}

export interface StatusPayload {
  namespace: 'cheese-knife';
  protocol: 1;
  type: 'status';
  statuses: Record<string, FeatureStatus>;
  diagnostics: RuntimeDiagnostics;
}

export interface StatusStore {
  readonly statuses: Record<string, FeatureStatus>;
  readonly transitions: readonly FeatureStatusTransition[];
  setStatus(feature: string, state: FeatureState, reason?: unknown): void;
}

export interface FeatureStatusTransition extends FeatureStatus {
  feature: string;
}

export interface ScopeEnvironment {
  AbortController: typeof AbortController;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
  setInterval(callback: () => void, delay: number): number;
  clearInterval(id: number): void;
}

export interface ResourceScope {
  readonly signal: AbortSignal;
  disposed: boolean;
  add(cleanup: () => void): () => void;
  on(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  timeout(callback: () => void, delay: number): number;
  interval(callback: () => void, delay: number): number;
  observe(observer: MutationObserver, target: Node, options?: MutationObserverInit): void;
  dispose(): void;
}

export interface KnifeRuntime {
  readonly ownerProtocol: 3;
  readonly requestId: string;
  config: Record<string, unknown>;
  baseConfig: Record<string, unknown>;
  mediaRequestId: string;
  media: { context: KnifeScopedContext; phase: 'pending' | 'ready' | 'limited'; version: KnifeMediaVersion;
    profileState: 'global' | 'scoped' | 'repair-required'; revisionStatus: 'ready' | 'repair-required';
    audioBindingGeneration: number; audioKind: 'global' | 'channel'; videoKind: 'global' | 'channel'; gainOrigin: import('../../shared/media-contracts').GainOrigin };
  i18n: Record<string, string>;
  configReady: boolean;
  state: RuntimeState;
  readonly statuses: Record<string, FeatureStatus>;
  features: Record<string, unknown>;
  generation: number;
  adapter?: SiteAdapter;
  audio?: AudioController;
  player?: PlayerController;
  preview?: PreviewController;
  filters?: VideoFilterController;
  coordinatorStarted?: boolean;
  route(): Route;
  selectPlayer(): PlayerSnapshot | null;
  setStatus(feature: string, state: FeatureState, reason?: unknown): void;
  diagnostics(): RuntimeDiagnostics;
  subscribe(callback: (state: RuntimeState) => void): () => boolean;
  notify(): void;
  reconcile(): void;
  revalidateMedia(): void;
  mediaCurrent(): boolean;
  schedule(): void;
  createScope(): ResourceScope;
}

export interface RuntimeEnvironment {
  window: Window;
  document: Document;
  location: Location;
  MutationObserver: typeof MutationObserver;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
  setInterval(callback: () => void, delay: number): number;
  clearInterval(id: number): void;
  onFinal(): void;
}

export interface RuntimeLifecycle {
  start(): void;
  schedule(): void;
  dispose(): void;
  requestMedia(): void;
}

export interface ConfigEnvelope {
  revision: number;
  config: Record<string, unknown>;
  i18n: Record<string, string>;
}

export interface ScopedEnvelope {
  requestId: string;
  context: KnifeScopedContext;
  deliverySequence: number;
  baseConfig: Record<string, unknown>;
  effectiveConfig: Record<string, unknown>;
  i18n: Record<string, string>;
  version: KnifeMediaVersion;
  profileState: 'global' | 'scoped' | 'repair-required';
  revisionStatus: 'ready' | 'repair-required';
  mediaPhase: 'pending' | 'ready' | 'limited';
  audioBindingGeneration: number;
  audioKind: 'global' | 'channel';
  videoKind: 'global' | 'channel';
  gainOrigin: import('../../shared/media-contracts').GainOrigin;
}

export interface BridgeExpectation {
  source: Window;
  origin: string;
  requestId: string;
  revision: number;
}
