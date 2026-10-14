export const EQ_FREQUENCIES = [63, 125, 250, 500, 1000, 2000, 4000, 8000] as const;

export function eqSettings(config: Record<string, unknown>, sampleRate: number) {
  const supported = Number.isFinite(sampleRate) && sampleRate >= 22050;
  const enabled = config.eqEnabled === true && supported;
  const values = [config.eq63, config.eq125, config.eq250, config.eq500, config.eq1000, config.eq2000, config.eq4000, config.eq8000];
  const levels = values.map(value => enabled && typeof value === 'number' && Number.isFinite(value) && value >= -6 && value <= 6 ? value : 0);
  return { supported, levels, headroom: 10 ** (-levels.reduce((sum, value) => sum + Math.max(0, value), 0) / 20) };
}
