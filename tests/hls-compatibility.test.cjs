const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const original = path.resolve(__dirname, '../node_modules/hls.js/dist/hls.light.min.js');
const originalHash = crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex');
assert.equal(originalHash, '947b45be1392e39569d4aefc2cff9ff6ecbe6cc246cf67ab12ece0c41c24b793', 'compatibility baseline must be the pinned upstream artifact');

function exercise(name, bundle) {
  const selectedBundle = bundle || process.env.KNIFE_HLS_TEST_BUNDLE || path.resolve(__dirname, '../vendor/hls.light.private.js');
  const selectedHash = crypto.createHash('sha256').update(fs.readFileSync(selectedBundle)).digest('hex');
  const result = spawnSync(process.execPath, ['--max-old-space-size=192', path.join(__dirname, 'fixtures/hls-parser-child.cjs'), name], {
    timeout: 5000, windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024,
    env: { ...process.env, KNIFE_HLS_TEST_BUNDLE: selectedBundle, KNIFE_HLS_EXPECTED_BUNDLE_SHA256: selectedHash },
  });
  if (result.error?.code === 'ETIMEDOUT') throw new Error('KNIFE_HLS_INFRA:parser-child-timeout');
  if (result.error?.code === 'ENOBUFS') throw new Error('KNIFE_HLS_INFRA:parser-child-output-overflow');
  if (result.error) throw new Error('KNIFE_HLS_INFRA:parser-child-process-error');
  if (result.status !== 0) throw new Error('KNIFE_HLS_INFRA:parser-child-crash ' + result.stderr.slice(0, 250));
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new Error('KNIFE_HLS_INFRA:parser-child-json-invalid'); }
  if (parsed.timedOut === true) throw new Error('KNIFE_HLS_INFRA:parser-vm-timeout');
  return parsed;
}

// Literal expectations are hand-derived, not calculated by either parser.
// Both runs are private-parser checks, not decoder/MSE playback evidence.
const cases = [
  ['skip-valid', { rejected: false, skipped: 3, fragments: 4 }],
  ['emsg-valid', { samples: 1, payloadLength: 10 }],
  ['emsg-multiple-valid', { samples: 2, payloadLength: 10 }],
  ['trun-valid', { captions: 0 }],
  ['trun-vp9-valid', { captions: 0 }],
  ['trun-av1-valid', { captions: 0 }],
  ['trun-hevc-valid', { captions: 0 }],
  ['trun-multi-valid', { captions: 2 }],
  ['trun-shared-valid', { captions: 2 }],
  ['trun-remux-valid', { samples: 2, duration: 2 }],
  ['id3-valid', { frames: 1, values: ['OK'] }],
  ['id3-padding-valid', { frames: 1, values: ['OK'] }],
  ['id3-pinned-extended-header', { frames: 1, values: ['OK'] }],
  ['id3-adjacent', { frames: 2, values: ['OK', 'OK'] }],
];
for (const [name, expected] of cases) {
  test('local HLS changes preserve the pinned upstream result for ' + name, () => {
    assert.deepEqual(exercise(name, original), { result: expected }, 'upstream accepted behavior');
    assert.deepEqual(exercise(name), { result: expected }, 'local candidate accepted behavior');
  });
}
