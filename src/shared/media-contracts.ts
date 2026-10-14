export type MediaDomain = 'audio' | 'video';
export type AudioValues = { compressorDefault: boolean; compressorThreshold: number; compressorKnee: number;
  compressorRatio: number; compressorAttack: number; compressorRelease: number };
export type VideoValues = { brightness: number; contrast: number; saturation: number; gamma: number; sharpness: number };
export type MediaVersion = { globalRevision: number | null; mediaRevision: number | null };
export type ScopedContext = { documentGeneration: number; routePath: string; channelId: string | null; playerGeneration: number };
