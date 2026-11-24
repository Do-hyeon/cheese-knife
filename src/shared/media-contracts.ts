export type MediaDomain = 'audio' | 'video';
export type LegacyAudioValues = { compressorDefault: boolean; compressorThreshold: number; compressorKnee: number;
  compressorRatio: number; compressorAttack: number; compressorRelease: number };
export type GainOrigin = 'site-legacy' | 'global-owned' | 'channel-owned';
export type AudioValues = Omit<LegacyAudioValues, 'compressorDefault'> & {
  audioDefault: boolean; compressorEnabled: boolean; audioGain: number; gainInherited: boolean; eqEnabled: boolean;
  eq63: number; eq125: number; eq250: number; eq500: number; eq1000: number; eq2000: number; eq4000: number; eq8000: number;
  normalizerEnabled: boolean; normalizerTargetDbfs: number;
};
export type VideoValues = { brightness: number; contrast: number; saturation: number; gamma: number; sharpness: number };
export type MediaVersion = { globalRevision: number | null; mediaRevision: number | null };
export type ScopedContext = { documentGeneration: number; routePath: string; channelId: string | null; playerGeneration: number };
