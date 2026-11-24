const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
function eq() {
  assert.ok(fs.existsSync('src/main/features/audio/eq.ts'), 'fixed EQ source must exist');
  const code = transformSync(fs.readFileSync('src/main/features/audio/eq.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const module = { exports: {} }; vm.runInNewContext(code, { module, exports: module.exports }); return module.exports;
}
test('fixed eight-band EQ is neutral when OFF and reserves only positive boost headroom', () => {
  const { eqSettings, EQ_FREQUENCIES } = eq();
  assert.deepEqual(Array.from(EQ_FREQUENCIES), [63,125,250,500,1000,2000,4000,8000]);
  const off = eqSettings({ eqEnabled: false, eq63: 6 }, 48000);
  assert.deepEqual(Array.from(off.levels), [0,0,0,0,0,0,0,0]); assert.equal(off.headroom, 1);
  const on = eqSettings({ eqEnabled: true, eq63: 6, eq125: -6, eq250: 2 }, 44100);
  assert.deepEqual(Array.from(on.levels), [6,-6,2,0,0,0,0,0]);
  assert.ok(Math.abs(on.headroom - 0.3981071705534972) < 1e-12);
});
test('EQ rejects unsupported rates and never forwards invalid or out-of-range gains', () => {
  const { eqSettings } = eq();
  for (const rate of [0,16000,NaN,Infinity]) {
    const result = eqSettings({ eqEnabled: true, eq63: 6 }, rate);
    assert.equal(result.supported, false); assert.equal(result.headroom, 1); assert.equal(result.levels.every(value => value === 0), true);
  }
  for (const rate of [22050,44100,48000,96000]) assert.equal(eqSettings({}, rate).supported, true);
  const result = eqSettings({ eqEnabled: true, eq63: NaN, eq125: Infinity, eq250: 7, eq500: -7, eq1000: -2.375 }, 48000);
  assert.deepEqual(Array.from(result.levels), [0,0,0,0,-2.375,0,0,0]); assert.equal(result.headroom, 1);
});
