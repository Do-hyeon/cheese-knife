import type { SitePlayerMetrics } from '../../site-adapter/contracts';
import type { VideoValues } from '../../../shared/media-contracts';
import type { ScopedContext } from '../../../shared/media-contracts';
import type { AudioState } from '../audio/contracts';

export interface AudioWantedReadback { ok: boolean; wanted: boolean; state: AudioState | null; context: ScopedContext }

export interface VideoFilterController {
  reconcile(base: VideoValues, channel: VideoValues | null, filterTarget: Element | null): void;
  dispose(): void;
}

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
  setAudioWanted(enabled: boolean, context: ScopedContext): Promise<AudioWantedReadback>;
  getAudioWanted(context: ScopedContext): AudioWantedReadback;
}
