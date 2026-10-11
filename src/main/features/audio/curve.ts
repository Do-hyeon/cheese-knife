let sharedLimiterCurve: Float32Array<ArrayBuffer> | undefined;

export function compressorDelay(sampleRate: number): number {
  return Math.min(
    Math.floor(Math.fround(Math.fround(0.006) * Math.fround(sampleRate))),
    1023,
  ) / sampleRate;
}

export function limiterCurve(): Float32Array<ArrayBuffer> {
  if (sharedLimiterCurve) return sharedLimiterCurve;
  sharedLimiterCurve = Float32Array.from({ length: 4097 }, (_, index) => {
    const input = 2 * index / 4096 - 1;
    const magnitude = Math.abs(input);
    let output = magnitude;
    if (magnitude > 0.9) {
      const position = (magnitude - 0.9) / 0.1;
      const squared = position * position;
      const cubed = squared * position;
      output = (2 * cubed - 3 * squared + 1) * 0.9
        + (cubed - 2 * squared + position) * 0.1
        + (-2 * cubed + 3 * squared) * 0.98;
    }
    return input < 0 ? -output : output;
  }) as Float32Array<ArrayBuffer>;
  return sharedLimiterCurve;
}
