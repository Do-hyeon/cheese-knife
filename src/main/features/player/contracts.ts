import type { SitePlayerMetrics } from '../../site-adapter/contracts';

export interface PlayerStats {
  resolution: string | null;
  bitrate: string | null;
  latency: string | null;
  codec: string | null;
}

export interface PlayerController {
  seek(backward: boolean): boolean;
  liveEdge(): void;
  ranges(video: HTMLVideoElement): readonly [number, number][];
  readStats(video: HTMLVideoElement, metrics: SitePlayerMetrics | null): PlayerStats;
}
