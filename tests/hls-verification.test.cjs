const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(path.join(__dirname, '../scripts/hls-verification.mjs')).href;

async function loadVerification() {
  return import(moduleUrl);
}

test('accepts only one to sixty-four ASCII alphanumeric run ID characters', async () => {
  const { validateHlsRunId } = await loadVerification();
  assert.equal(validateHlsRunId('abc123'), 'abc123');
  assert.equal(validateHlsRunId('A'.repeat(64)), 'A'.repeat(64));

  for (const value of ['', 'A'.repeat(65), 'a b', 'a/b', 'a\\b', '..', 'a:b', 'a-b', '실행1', null, 123]) {
    assert.throws(() => validateHlsRunId(value), error => error?.code === 'hls-run-id-invalid');
  }
});

test('derives two isolated generation roots and inspects only the second bundle', async () => {
  const { hlsValidationPaths } = await loadVerification();
  const repoRoot = path.resolve('C:/verification-fixture/repository');
  const paths = hlsValidationPaths(repoRoot, 'abc123');
  const outputRoot = path.join(repoRoot, 'output', 'tool-audit', 'hls-validation-abc123');

  assert.deepEqual(paths, {
    outputRoot,
    generationOneRoot: path.join(outputRoot, 'generation-one'),
    generationTwoRoot: path.join(outputRoot, 'generation-two'),
    inspectedCandidateBundle: path.join(outputRoot, 'generation-two', 'vendor', 'hls.light.private.js'),
    reportPath: path.join(outputRoot, 'report.json')
  });
  assert.notEqual(paths.generationOneRoot, paths.generationTwoRoot);
  for (const value of Object.values(paths)) {
    assert.equal(path.isAbsolute(value), true);
    const relative = path.relative(outputRoot, value);
    assert.equal(relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)), true);
  }
});

test('rejects a relative repository root before calculating output paths', async () => {
  const { hlsValidationPaths } = await loadVerification();
  assert.throws(() => hlsValidationPaths('relative/repository', 'abc123'), error => error?.code === 'hls-repo-root-invalid');
});
