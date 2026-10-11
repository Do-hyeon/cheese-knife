const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const parserChild = path.join(__dirname, 'fixtures/hls-parser-child.cjs');
const mutationChild = path.join(__dirname, 'fixtures/hls-mutation-child.cjs');

function run(childFile, args) {
  const child = spawnSync(process.execPath, ['--max-old-space-size=192', childFile, ...args], {
    timeout: 5000,
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024,
  });
  if (child.error?.code === 'ETIMEDOUT') throw new Error('KNIFE_HLS_INFRA:hls-child-timeout');
  if (child.error?.code === 'ENOBUFS') throw new Error('KNIFE_HLS_INFRA:hls-child-output-overflow');
  if (child.error) throw new Error('KNIFE_HLS_INFRA:hls-child-process-error');
  if (child.status !== 0) {
    const nested = child.stderr.match(/KNIFE_HLS_INFRA:[A-Za-z0-9-]+/);
    throw new Error(nested?.[0] || 'KNIFE_HLS_INFRA:hls-child-crash');
  }
  let parsed;
  try { parsed = JSON.parse(child.stdout); }
  catch { throw new Error('KNIFE_HLS_INFRA:hls-child-json-invalid'); }
  if (parsed.timedOut === true) throw new Error('KNIFE_HLS_INFRA:parser-vm-timeout');
  return parsed;
}

function mutate(mutation, caseName) {
  return run(mutationChild, [mutation, caseName]);
}

test('VP9 opaque sample establishes a no-drop baseline for the codec allowlist control', () => {
  assert.deepEqual(run(parserChild, ['trun-vp9-opaque-boundary']), { result: { captions: 0, drops: 0 } });
});

for (const [mutation, caseName, expected] of [
  ['skip-limit-relaxed', 'skip-limit-over', { result: { rejected: false, skipped: 10001, fragments: 10002 } }],
  ['emsg-limit-relaxed', 'emsg-v1-string-4097', { result: { accepted: true, version: 1, schemeLength: 4097, valueLength: 0 } }],
  ['run-limit-relaxed', 'run-count-100001', { result: { accepted: true } }],
  ['byte-relative-cap-removed', 'trun-byte-budget-over', { result: { captions: 0, drops: 0 } }],
  ['byte-absolute-cap-removed', 'trun-byte-absolute-over', { result: { accepted: true } }],
  ['nal-limit-relaxed', 'trun-nal-count-100001', { result: { captions: 0, drops: 0 } }],
  ['id3-payload-limit-relaxed', 'id3-payload-1048577', { result: { frames: 1 } }],
  ['id3-frame-limit-relaxed', 'id3-frames-4097', { result: { frames: 4097 } }],
  ['codec-allowlist-removed', 'trun-vp9-opaque-boundary', { result: { captions: 0, drops: 1 } }],
  ['required-run-reject-removed', 'run-truncated-width', { result: { accepted: true } }],
]) {
  test(mutation + ' is detected by ' + caseName, () => {
    assert.deepEqual(mutate(mutation, caseName), expected);
  });
}

test('removing subview offset correction changes the valid subview result', () => {
  assert.deepEqual(mutate('subview-offset-removed', 'trun-subview-valid'), { result: { captions: 0 } });
});

test('removing optional metadata catch exposes the bounded overflow instead of dropping it', () => {
  const output = mutate('optional-metadata-catch-removed', 'trun-byte-budget-over');
  assert.equal(output.result, undefined);
  assert.equal(output.name, 'Error');
  assert.equal(output.rejected, false);
  assert.equal(output.timedOut, false);
});
