export interface NormalizerControl {
  fftSize: number; windowSeconds: number; lastTime: number | null; warmSince: number | null;
  power: number | null; silentSeconds: number; fromDb: number; toDb: number; start: number; end: number;
}
export function normalizerWindow(sampleRate: number): number | null {
  if (!Number.isFinite(sampleRate) || sampleRate < 22050 || sampleRate > 96000) return null;
  return 2 ** Math.ceil(Math.log2(sampleRate * 0.25));
}
export function createNormalizer(sampleRate: number): NormalizerControl | null {
  const fftSize = normalizerWindow(sampleRate);
  return fftSize === null ? null : { fftSize, windowSeconds: fftSize / sampleRate, lastTime: null, warmSince: null,
    power: null, silentSeconds: 0, fromDb: 0, toDb: 0, start: 0, end: 0 };
}
export function normalizerDbAt(state: NormalizerControl, time: number): number {
  const progress = state.end > state.start ? Math.max(0, Math.min(1, (time - state.start) / (state.end - state.start))) : 1;
  return state.fromDb + (state.toDb - state.fromDb) * progress;
}
export function stepNormalizer(state: NormalizerControl, input: {
  time: number; leftPower: number; rightPower: number; targetDbfs: number; active: boolean;
}) {
  const validTime = Number.isFinite(input.time), time = validTime ? input.time : state.lastTime ?? state.end;
  const current = normalizerDbAt(state, time), dt = state.lastTime === null ? null : time - state.lastTime;
  const schedule = (mode: 'hold' | 'warmup' | 'ramp' | 'error', toDb = current, seconds = 0) => {
    state.fromDb = current; state.toDb = toDb; state.start = time; state.end = time + seconds;
    return { mode, fromDb: current, toDb, start: time, end: time + seconds };
  };
  const reset = () => { state.power = null; state.silentSeconds = 0; state.warmSince = null; state.lastTime = null; };
  if (!validTime || !input.active) { reset(); return schedule('hold'); }
  if (![input.leftPower, input.rightPower].every(power => Number.isFinite(power) && power >= 0)) {
    reset(); return schedule('error', 0, 0.01);
  }
  state.lastTime = time;
  if (dt !== null && (dt <= 0 || dt > 0.2)) {
    state.power = null; state.silentSeconds = 0; state.warmSince = time; return schedule('hold');
  }
  state.warmSince ??= time;
  if (time - state.warmSince < state.windowSeconds || dt === null) return schedule('warmup');
  const power = Math.max(input.leftPower, input.rightPower);
  state.power = state.power === null ? power : state.power + (power - state.power) * (1 - Math.exp(-dt / 0.75));
  const silent = power <= 10 ** (-55 / 10);
  state.silentSeconds = silent ? state.silentSeconds + dt : 0;
  const target = Number.isFinite(input.targetDbfs) && input.targetDbfs >= -30 && input.targetDbfs <= -12 ? input.targetDbfs : -20;
  let desired = Math.max(-12, Math.min(6, target - 10 * Math.log10(Math.max(1e-12, state.power))));
  let down = 1.2;
  if (silent && state.silentSeconds >= 2) { desired = 0; down = 0.1; }
  else if (silent) desired = Math.min(desired, current);
  return schedule('ramp', Math.max(current - down, Math.min(current + 0.1, desired)), 0.1);
}
