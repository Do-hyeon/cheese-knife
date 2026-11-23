export interface PreviewDiagnosticEvent {
  type: string;
  readonly [key: string]: unknown;
}

export interface PreviewDiagnostics {
  events: readonly PreviewDiagnosticEvent[];
  hlsSupported?: boolean;
}

export interface PreviewController {
  diagnostics: PreviewDiagnostics;
  show(href: string, anchor: HTMLAnchorElement, tooltip?: boolean): Promise<void>;
  hide(href?: string): void;
}

export interface PreviewIntent {
  id: string;
  href: string;
  anchor: HTMLAnchorElement;
  route: string;
  live: boolean;
  startUnmuted: boolean;
}

export interface PreviewBackend {
  destroy(): void;
}

export interface PreviewSession {
  token: number;
  abort: AbortController;
  timers: Set<number>;
  backend: PreviewBackend | null;
  media: HTMLVideoElement | null;
  dispose(): void;
}

export interface PreviewPlaybackMedia {
  mediaId: string;
  path: string;
}

export interface PreviewPlayback {
  media: readonly PreviewPlaybackMedia[];
  thumbnail: string | null;
}

export interface PreviewLiveInfo {
  status: string;
  adult: boolean;
  openDate: string | null;
  image: string | null;
  playback: PreviewPlayback | null;
}
