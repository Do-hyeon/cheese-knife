const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
function normalizer() {
  assert.ok(fs.existsSync('src/main/features/audio/normalizer.ts'), 'bounded normalizer source must exist');
  const code = transformSync(fs.readFileSync('src/main/features/audio/normalizer.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const module = { exports: {} }; vm.runInNewContext(code, { module, exports: module.exports }); return module.exports;
}
test('normalizer waits one valid window and ignores gaps without repeating warm-up reset', () => {
  const { normalizerWindow, createNormalizer, stepNormalizer } = normalizer();
  assert.equal(normalizerWindow(22050), 8192); assert.equal(normalizerWindow(48000), 16384); assert.equal(normalizerWindow(96000), 32768);
  for (const rate of [16000,96001,0,NaN,Infinity]) assert.equal(normalizerWindow(rate), null);
  const state = createNormalizer(48000); assert.ok(state); assert.ok(state.fftSize * 8 <= 262144);
  const step = time => stepNormalizer(state, { time, leftPower: 0.001, rightPower: 0, targetDbfs: -20, active: true });
  for (const time of [0,0.1,0.2,0.3]) { assert.equal(step(time).mode, 'warmup'); assert.equal(state.toDb, 0); }
  assert.equal(step(0.4).mode, 'ramp'); assert.ok(Math.abs(state.toDb - 0.1) < 1e-12);
  const gap = step(1); assert.equal(gap.mode, 'hold'); assert.ok(Math.abs(state.toDb - 0.1) < 1e-12);
  for (const time of [1.1,1.2,1.3]) assert.equal(step(time).mode, 'warmup');
  assert.equal(step(1.4).mode, 'ramp'); assert.ok(Math.abs(state.toDb - 0.2) < 1e-12);
});
test('db automation is rate bounded, uses stronger stereo power and mute stays mute', () => {
  const { createNormalizer, stepNormalizer, normalizerDbAt } = normalizer();
  const state = createNormalizer(48000);
  for (let i = 0; i <= 4; i++) stepNormalizer(state, { time: i / 10, leftPower: 0, rightPower: 0.1, targetDbfs: -20, active: true });
  assert.ok(Math.abs(state.toDb + 1.2) < 1e-12);
  assert.ok(Math.abs(normalizerDbAt(state, 0.45) + 0.6) < 1e-10);
  const stopped = stepNormalizer(state, { time: 0.45, leftPower: 1, rightPower: 1, targetDbfs: -20, active: false });
  assert.equal(stopped.mode, 'hold'); assert.ok(Math.abs(state.toDb + 0.6) < 1e-10);
  for (let i = 1; i <= 3; i++) assert.equal(stepNormalizer(state, { time: 0.45 + i / 10, leftPower: 0.001, rightPower: 0, targetDbfs: -20, active: true }).mode, 'warmup');
});
test('invalid powers reset to short unity, silence adds no boost and returns bounded correction toward unity', () => {
  const { createNormalizer, stepNormalizer } = normalizer();
  const state = createNormalizer(48000);
  const step = (time, power) => stepNormalizer(state, { time, leftPower: power, rightPower: 0, targetDbfs: -20, active: true });
  for (let i = 0; i <= 20; i++) step(i / 10, 0.001);
  assert.ok(state.toDb > 1 && state.toDb <= 6);
  const invalid = step(2.1, NaN); assert.equal(invalid.mode, 'error'); assert.equal(state.toDb, 0); assert.ok(Math.abs(state.end - state.start - 0.01) < 1e-12);
  const silent = createNormalizer(48000);
  for (let i = 0; i < 60; i++) stepNormalizer(silent, { time: i / 10, leftPower: 0, rightPower: 0, targetDbfs: -12, active: true });
  assert.equal(silent.toDb, 0);
});
test('correction saturates at minus twelve or plus six and stalled clocks never catch up', () => {
  const { createNormalizer, stepNormalizer } = normalizer();
  for (const [power, expected] of [[1, -12], [0.0001, 6]]) {
    const state = createNormalizer(48000);
    for (let i = 0; i <= 80; i++) stepNormalizer(state, { time: i / 10, leftPower: power, rightPower: power, targetDbfs: -20, active: true });
    assert.ok(Math.abs(state.toDb - expected) < 1e-9);
    const before = state.toDb;
    for (const [time, mode] of [[8,'hold'],[7.9,'hold'],[NaN,'hold'],[Infinity,'hold'],[50,'warmup']]) {
      const result = stepNormalizer(state, { time, leftPower: power, rightPower: power, targetDbfs: -20, active: true });
      assert.equal(result.mode, mode); assert.ok(Math.abs(state.toDb - before) < 1e-9); assert.equal(Number.isFinite(result.start), true);
    }
  }
});
test('EMA is power-domain with tau point seven five and confirmed silence returns either correction at one dB per second', () => {
  const { createNormalizer, stepNormalizer } = normalizer();
  const state = createNormalizer(48000);
  for (let i = 0; i <= 4; i++) stepNormalizer(state, { time: i / 10, leftPower: 0.1, rightPower: 0, targetDbfs: -20, active: true });
  stepNormalizer(state, { time: 0.5, leftPower: 0.001, rightPower: 0, targetDbfs: -20, active: true });
  assert.ok(Math.abs(state.power - 0.087642158585257) < 1e-12);
  for (const power of [1,0.0001]) {
    const control = createNormalizer(48000);
    for (let i = 0; i <= 80; i++) stepNormalizer(control, { time: i / 10, leftPower: power, rightPower: 0, targetDbfs: -20, active: true });
    const initial = control.toDb;
    for (let i = 1; i <= 23; i++) {
      const before = control.toDb;
      stepNormalizer(control, { time: 8 + i / 10, leftPower: 0, rightPower: 0, targetDbfs: -20, active: true });
      if (i < 20) assert.ok(Math.abs(control.toDb - before) < 1e-10);
      else assert.ok(Math.abs(control.toDb - before) <= 0.1000000001);
    }
    assert.ok(Math.abs(control.toDb) < Math.abs(initial));
  }
});
