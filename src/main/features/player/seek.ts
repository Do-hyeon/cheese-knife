import type { SitePlayerMetrics } from '../../site-adapter/contracts';
import type { PlayerStats } from './contracts';

export function ranges(video: HTMLVideoElement): [number, number][] {
  const list = video.seekable?.length ? video.seekable : video.buffered;
  const result: [number, number][] = [];
  for (let index = 0; index < (list?.length || 0); index++) {
    const start = list.start(index);
    const end = list.end(index);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) result.push([start, end]);
  }
  return result;
}

export function bounded(value: number, available: readonly [number, number][], forward: boolean): number {
  let previous: readonly [number, number] | undefined;
  for (const [start, end] of available) {
    const insideEnd = end - Math.min(0.05, (end - start) / 2);
    if (value >= start && value <= insideEnd) return value;
    if (value < start) {
      if (forward) return start;
      return previous ? previous[1] - Math.min(0.05, (previous[1] - previous[0]) / 2) : start;
    }
    previous = [start, end];
  }
  const [start, end] = available.at(-1)!;
  return end - Math.min(0.05, (end - start) / 2);
}

export function readStats(video: HTMLVideoElement, metrics: SitePlayerMetrics | null): PlayerStats {
  return {
    resolution: video.videoWidth > 0 && video.videoHeight > 0 ? `${video.videoWidth}×${video.videoHeight}` : null,
    bitrate: null,
    latency: null,
    codec: metrics?.codec || null,
  };
}
