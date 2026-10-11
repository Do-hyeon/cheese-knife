const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// A malformed response cannot monopolize the runner or the user's browser.
// The child VM is independently timed and the parent enforces process/heap bounds.
function exercise(name) {
  const child = spawnSync(process.execPath, ['--max-old-space-size=192', path.join(__dirname, 'fixtures/hls-parser-child.cjs'), name], {
    timeout: 5000, windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024,
  });
  if (child.error?.code === 'ETIMEDOUT') throw new Error('KNIFE_HLS_INFRA:parser-child-timeout');
  if (child.error?.code === 'ENOBUFS') throw new Error('KNIFE_HLS_INFRA:parser-child-output-overflow');
  if (child.error) throw new Error('KNIFE_HLS_INFRA:parser-child-process-error');
  if (child.status !== 0) throw new Error('KNIFE_HLS_INFRA:parser-child-crash ' + child.stderr.slice(0, 250));
  let result;
  try { result = JSON.parse(child.stdout); }
  catch { throw new Error('KNIFE_HLS_INFRA:parser-child-json-invalid'); }
  if (result.timedOut === true) throw new Error('KNIFE_HLS_INFRA:parser-vm-timeout');
  return result;
}

for (const name of ['skip-negative','skip-large','skip-fraction','skip-junk','skip-duplicate','skip-zero-duplicate']) {
  test('actual bundled playlist parser rejects ' + name + ' before placeholder allocation', () => {
    const output = exercise(name);
    assert.equal(output.result?.rejected ?? output.rejected, true);
  });
}
test('valid LL-HLS delta keeps its sequence placeholders', () => {
  assert.deepEqual(exercise('skip-valid'), { result: { rejected: false, skipped: 3, fragments: 4 } });
});
for (const [name, expected] of [
  ['skip-limit-minus-one', { rejected: false, skipped: 9999, fragments: 10000 }],
  ['skip-limit-exact', { rejected: false, skipped: 10000, fragments: 10001 }],
]) {
  test('LL-HLS SKIP accepts ' + name, () => {
    assert.deepEqual(exercise(name), { result: expected });
  });
}
test('LL-HLS SKIP rejects limit plus one', () => {
  assert.equal(exercise('skip-limit-over').result?.rejected, true);
});
for (const name of ['emsg-short','emsg-no-scheme-nul','emsg-no-value-nul']) {
  test('actual bundled MP4 metadata consumer rejects ' + name + ' without scanning past the box', () => {
    const output = exercise(name);
    assert.ok(output.rejected || output.result?.samples === 0);
  });
}
test('valid terminated MP4 ID3 event preserves its payload', () => {
  assert.deepEqual(exercise('emsg-valid'), { result: { samples: 1, payloadLength: 10 } });
});
test('bounded emsg search never examines more than the permitted terminator window', () => {
  assert.deepEqual(exercise('emsg-v1-search-window'), { result: { accepted: false, maxSearchLength: 4097 } });
});
for (const [name, expected] of [
  ['emsg-v1-string-4095', { accepted: true, version: 1, schemeLength: 4095, valueLength: 0 }],
  ['emsg-v1-string-4096', { accepted: true, version: 1, schemeLength: 4096, valueLength: 0 }],
  ['emsg-v1-string-4097', { accepted: false }],
  ['emsg-v0-value-4096', { accepted: true, version: 0, schemeLength: 0, valueLength: 4096 }],
  ['emsg-v0-value-4097', { accepted: false }],
  ['emsg-v1-boundary-no-nul', { accepted: false }],
]) {
  test('bounded emsg helper returns the hand-derived result for ' + name, () => {
    assert.deepEqual(exercise(name), { result: expected });
  });
}
for (const name of ['trun-count-large','trun-record-truncated','trun-duplicate-tfhd','trun-remux-large']) {
  test('actual bundled MP4 consumer rejects ' + name + ' before sample iteration', () => {
    assert.equal(exercise(name).rejected, true);
  });
}
test('optional captions drop an out-of-buffer sample without iterating absent NAL data', () => {
  assert.deepEqual(exercise('trun-size-large'), { result: { captions: 0 } });
});
test('defaulted zero-size sample records remain supported', () => {
  assert.deepEqual(exercise('trun-valid'), { result: { captions: 0 } });
});
test('valid non-NAL VP9 sample is not rejected by optional caption extraction', () => {
  assert.deepEqual(exercise('trun-vp9-valid'), { result: { captions: 0 } });
});
for (const name of ['trun-multi-valid','trun-shared-valid','trun-subview-valid']) {
  test('valid caption extraction preserves ' + name, () => {
    assert.deepEqual(exercise(name), { result: { captions: 2 } });
  });
}
test('optional caption byte budget prevents repeated metadata expansion', () => {
  assert.deepEqual(exercise('trun-shared-budget'), { result: { captions: 0 } });
});
test('passthrough remux preserves defaulted sample timing', () => {
  assert.deepEqual(exercise('trun-remux-valid'), { result: { samples: 2, duration: 2 } });
});
for (const name of ['run-count-99999', 'run-count-100000', 'run-unselected-malformed']) {
  test('selected-track run validator accepts ' + name, () => {
    assert.deepEqual(exercise(name), { result: { accepted: true } });
  });
}
for (const name of ['run-count-100001', 'run-missing-tfhd', 'run-short-tfhd', 'run-short-tfdt', 'run-truncated-width']) {
  test('selected-track run validator rejects ' + name, () => {
    assert.equal(exercise(name).rejected, true);
  });
}
for (const [name, drops] of [
  ['trun-byte-budget-before', 0],
  ['trun-byte-budget-exact', 0],
  ['trun-byte-budget-over', 1],
]) {
  test('optional byte budget classifies ' + name, () => {
    assert.deepEqual(exercise(name), { result: { captions: 0, drops } });
  });
}
for (const [name, accepted] of [
  ['trun-byte-absolute-before', true],
  ['trun-byte-absolute-exact', true],
  ['trun-byte-absolute-over', false],
]) {
  test('absolute optional byte budget classifies ' + name, () => {
    assert.deepEqual(exercise(name), { result: { accepted } });
  });
}
for (const [name, drops] of [
  ['trun-nal-count-99999', 0],
  ['trun-nal-count-100000', 0],
  ['trun-nal-count-100001', 1],
  ['trun-nal-header-truncated', 1],
  ['trun-nal-payload-truncated', 1],
]) {
  test('optional NAL boundary classifies ' + name, () => {
    assert.deepEqual(exercise(name), { result: { captions: 0, drops } });
  });
}
for (const name of ['id3-truncated','id3-frame-truncated']) {
  test('actual shared ID3 parser drops ' + name + ' rather than interpreting absent bytes', () => {
    const output = exercise(name);
    assert.ok(output.rejected || output.result?.frames === 0);
  });
}
test('shared ID3 parser rejects a nonzero short tail instead of accepting it as padding', () => {
  assert.deepEqual(exercise('id3-padding-nonzero-short'), { result: { frames: 0, values: [] } });
});
test('initial audio timestamp path also rejects an oversized ID3 tag', () => {
  const output = exercise('id3-timestamp-truncated');
  assert.ok(output.rejected || output.result?.timestamp === null);
});
test('valid ID3 text and adjacent tags remain available', () => {
  assert.deepEqual(exercise('id3-valid'), { result: { frames: 1, values: ['OK'] } });
  assert.deepEqual(exercise('id3-adjacent'), { result: { frames: 2, values: ['OK','OK'] } });
});
for (const [name, frames] of [
  ['id3-payload-1048575', 1],
  ['id3-payload-1048576', 1],
  ['id3-payload-1048577', 0],
  ['id3-frames-4095', 4095],
  ['id3-frames-4096', 4096],
  ['id3-frames-4097', 0],
  ['id3-extended-truncated', 0],
]) {
  test('shared ID3 boundary returns ' + frames + ' frames for ' + name, () => {
    assert.deepEqual(exercise(name), { result: { frames } });
  });
}
