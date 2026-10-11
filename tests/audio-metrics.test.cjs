const test = require('node:test');
const assert = require('node:assert/strict');
const metrics = () => import('../scripts/audio-metrics.mjs');
const tone = (n, harmonic = 0) => Float64Array.from({length:n}, (_, i) =>
  0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000) + harmonic * Math.sin(2 * Math.PI * 3000 * i / 48000));

test('waveform summary reports peak, RMS and samples outside floating full scale', async () => {
  const {measureSignal} = await metrics();
  const report = measureSignal([-1.2,0,1.2], 48000);
  assert.equal(report.peak, 1.2); assert.equal(report.mean, 0);
  assert.ok(Math.abs(report.rms - 0.9797958971132712) < 1e-12);
  assert.equal(report.overFullScaleSamples, 2); assert.equal(report.maxAdjacentStep, 1.2);
});

test('coherent pure tone has its hand-derived RMS and negligible harmonic distortion', async () => {
  const {measureSignal} = await metrics();
  const report = measureSignal(tone(4800), 48000, 1000);
  assert.ok(Math.abs(report.rms - 0.3535533905932738) < 1e-9);
  assert.ok(Math.abs(report.fundamentalAmplitude - 0.5) < 1e-9);
  assert.ok(report.thdPercent < 1e-7);
});

test('third harmonic with one tenth fundamental amplitude measures ten percent THD', async () => {
  const {measureSignal} = await metrics();
  const report = measureSignal(tone(4800, 0.05), 48000, 1000);
  assert.ok(Math.abs(report.thdPercent - 10) < 1e-6);
  assert.ok(Math.abs(report.thdnPercent - 10) < 1e-6);
});

test('noncoherent analysis does not mislabel spectral leakage as distortion', async () => {
  const {measureSignal} = await metrics();
  const report = measureSignal(tone(4801), 48000, 1000);
  assert.equal(report.thdPercent, null); assert.equal(report.spectralReason, 'non-coherent-window');
});

test('nonfinite or empty waveforms cannot receive a clean quality result', async () => {
  const {measureSignal} = await metrics();
  assert.throws(() => measureSignal([0,NaN],48000), /non-finite/);
  assert.throws(() => measureSignal([],48000), /samples required/);
});

test('stereo residual distinguishes identical channels from a silent partner', async () => {
  const {channelDifferenceRms} = await metrics();
  assert.equal(channelDifferenceRms([0.1,-0.1,0],[0.1,-0.1,0]), 0);
  assert.ok(Math.abs(channelDifferenceRms([0.1,-0.1,0],[0,0,0]) - 0.08164965809277261) < 1e-12);
});

test('local RMS envelope distinguishes a quieter interval without waveform phase bias', async () => {
  const {rmsEnvelope} = await metrics();
  const report = rmsEnvelope([0.5,-0.5,0.5,-0.5,1,-1,1,-1],1000,2);
  assert.equal(report.min,0.5); assert.equal(report.max,1); assert.equal(report.windowSamples,2);
});

test('numeric boundaries cover first and last samples, channel shape, and envelope windows', async t => {
  const { measureSignal, channelDifferenceRms, rmsEnvelope } = await metrics();
  const cases = [
    ['first and last waveform samples', () => measureSignal([1, 0, -1], 1000), report => {
      assert.equal(report.mean, 0); assert.equal(report.peak, 1); assert.equal(report.maxAdjacentStep, 1);
    }],
    ['equal one-sample stereo channels', () => channelDifferenceRms([1], [-1]), value => assert.equal(value, 2)],
    ['exact one-window envelope', () => rmsEnvelope([0.5, -0.5], 1000, 2), report => {
      assert.equal(report.windowSamples, 2); assert.equal(report.min, 0.5); assert.equal(report.max, 0.5);
    }],
  ];
  for (const [name, run, verify] of cases) await t.test(name, () => verify(run()));
  for (const run of [
    () => channelDifferenceRms([0], [0, 1]),
    () => channelDifferenceRms([0, Infinity], [0, 0]),
    () => channelDifferenceRms([0, 0], [0, NaN]),
    () => rmsEnvelope([0, Infinity], 1000, 1),
    () => rmsEnvelope([0], 1000, 2),
  ]) assert.throws(run);
});

test('quality gate rejects a silent enabled path instead of accepting zero baselines', async () => {
  const { audioQualityFailures } = await metrics();
  const channel = (rms, peak = rms) => ({ rms, peak, overFullScaleSamples: 0, maxAdjacentStep: 0.1, envelope8ms: { min: rms } });
  const silent = channel(0, 0), audible = channel(0.25, 0.5);
  const failures = audioQualityFailures({
    cases: [{ enabled: true, stereo: 'identical', channels: [silent, silent] }],
    transitions: [{ frequency: 250, kind: 'enabled', value: false, before: { channels: [silent] }, change: { channels: [silent] }, after: { channels: [audible] } }],
    stress: { channels: [silent, silent] },
    alignments: [{ sampleRate: 48000, expectedFrame: 288, dryFirst: 288, dryLast: 288, compressorFirst: 288, compressorLast: 288 }],
  });
  assert.ok(failures.some(value => value.includes('enabled-signal')));
  assert.ok(failures.some(value => value.includes('transition-signal')));
  assert.ok(failures.some(value => value.includes('stress-peak-low')));
});

test('quality gate rejects missing and negative delay alignment frames', async () => {
  const { audioQualityFailures } = await metrics();
  const channel = { rms: 0.25, peak: 0.98, overFullScaleSamples: 0, maxAdjacentStep: 0.1, envelope8ms: { min: 0.25 } };
  const base = {
    cases: [{ enabled: true, stereo: 'identical', channels: [channel, channel] }],
    transitions: [{ frequency: 250, kind: 'enabled', value: true, before: { channels: [channel] }, change: { channels: [channel] }, after: { channels: [channel] } }],
    stress: { channels: [channel, channel] },
  };
  for (const alignment of [{}, { sampleRate: -1, expectedFrame: -1, dryFirst: -1, dryLast: -1, compressorFirst: -1, compressorLast: -1 }]) {
    assert.ok(audioQualityFailures({ ...base, alignments: [alignment] }).some(value => value.includes('delay-alignment')));
  }
});
