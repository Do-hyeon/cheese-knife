export type AudioState = 'off' | 'pending' | 'on' | 'unavailable';

export interface AudioController {
  setEnabled(video: HTMLVideoElement, enabled: boolean): Promise<AudioState>;
  getState(video: HTMLVideoElement): AudioState;
  setGain(video: HTMLVideoElement, value: number): number;
  configure(): void;
  bypass(video: HTMLVideoElement): void;
  subscribe(video: HTMLVideoElement, callback: (state: AudioState, gain: number) => void): () => boolean;
  eligible(video: HTMLVideoElement): boolean;
}
