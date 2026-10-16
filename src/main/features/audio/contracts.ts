export type AudioState = 'off' | 'pending' | 'on' | 'unavailable';

export interface AudioController {
  setEnabled(video: HTMLVideoElement, enabled: boolean): Promise<AudioState>;
  getState(video: HTMLVideoElement): AudioState;
  setGain(video: HTMLVideoElement, value: number): number;
  applyPreviewGain(video: HTMLVideoElement, value: number, context: import('../../../shared/media-contracts').ScopedContext): boolean;
  getReadback(video: HTMLVideoElement): { state: AudioState; wanted: boolean; gain: number; appliedGain: number | null; sources: number };
  configure(): void;
  bypass(video: HTMLVideoElement): void;
  suspend(video: HTMLVideoElement): void;
  resumeWanted(video: HTMLVideoElement): Promise<AudioState>;
  subscribe(video: HTMLVideoElement, callback: (state: AudioState, gain: number) => void): () => boolean;
  eligible(video: HTMLVideoElement): boolean;
}
