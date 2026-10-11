const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const moduleUrl = pathToFileURL(path.join(root, 'scripts/hls-verification.mjs')).href;
const inputFiles = [
  'scripts/vendor-hls.mjs',
  'scripts/hls-hardening.mjs',
  'node_modules/hls.js/package.json',
  'node_modules/hls.js/dist/hls.light.min.js',
  'node_modules/hls.js/LICENSE',
];
const testFiles = [
  'tests/hls-parser-bounds.test.cjs',
  'tests/hls-compatibility.test.cjs',
  'tests/hls-hardening-negative-controls.test.cjs',
  'tests/hls-provenance.test.cjs',
];
const supportFiles = [
  'scripts/hls-verification.mjs',
  'scripts/verify-hls-candidate.mjs',
  'scripts/owned-files.mjs',
  'tests/fixtures/hls-parser-child.cjs',
  'tests/fixtures/hls-mutation-child.cjs',
];

async function loadVerifier() {
  return import(moduleUrl);
}

function copyFileTree(sourceRoot, targetRoot, file) {
  const target = path.join(targetRoot, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, file), target);
}

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'knife-hls-verifier-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  for (const file of [...inputFiles, 'vendor/hls.light.private.js', 'vendor/hls.js.LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    copyFileTree(root, temporary, file);
  }
  for (const file of supportFiles) copyFileTree(root, temporary, file);
  fs.mkdirSync(path.join(temporary, 'output/tool-audit'), { recursive: true });
  fs.mkdirSync(path.join(temporary, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(temporary, 'dist/marker.txt'), 'unchanged dist marker\n');
  const passing = "const test=require('node:test');test('fixture passes',()=>{});\n";
  for (const file of testFiles) {
    const target = path.join(temporary, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, passing);
  }
  return temporary;
}

function runId(prefix) {
  return prefix + crypto.randomBytes(8).toString('hex');
}

test('unsafe IDs fail before repository access and existing runs are never overwritten', async t => {
  const { runHlsVerification, hlsValidationPaths } = await loadVerifier();
  await assert.rejects(runHlsVerification('not-an-absolute-root', '../unsafe'), error => error?.code === 'hls-run-id-invalid');

  const id = runId('exists');
  const paths = hlsValidationPaths(root, id);
  fs.mkdirSync(paths.outputRoot, { recursive: true });
  const marker = path.join(paths.outputRoot, 'marker.txt');
  fs.writeFileSync(marker, 'preserve');
  t.after(() => fs.rmSync(paths.outputRoot, { recursive: true, force: true }));
  await assert.rejects(runHlsVerification(root, id), error => error?.code === 'hls-run-exists');
  assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve');
});

test('real verifier reproduces twice and binds all four test groups to generation two', { timeout: 60000 }, async t => {
  const { runHlsVerification, hlsValidationPaths } = await loadVerifier();
  const id = runId('success');
  const paths = hlsValidationPaths(root, id);
  t.after(() => fs.rmSync(paths.outputRoot, { recursive: true, force: true }));
  const report = await runHlsVerification(root, id);
  assert.equal(report.status, 'complete-pass');
  assert.equal(report.exitCode, 0);
  assert.equal(report.candidate.path, paths.inspectedCandidateBundle);
  assert.equal(report.candidate.sha256, '0317fbe50587ee7b46e734112ff9ceab96914ff87a0f695f9350214afa9cea92');
  assert.equal(report.generations.length, 2);
  assert.equal(report.testGroups.length, 4);
  assert.equal(report.testGroups.every(group => group.status === 'pass' && group.tests > 0 && group.bundle === paths.inspectedCandidateBundle), true);
  assert.deepEqual(report.limits, { parserHeapMiB: 192, parserTimeoutMs: 5000, parserOutputBytes: 65536, vmTimeoutMs: 250, aggregateTestTimeoutMs: 30000 });
  assert.equal(report.snapshots.inputsMatched, true);
  assert.equal(report.snapshots.protectedMatched, true);
  assert.equal(report.snapshots.rootDistMatched, true);
  assert.equal(JSON.parse(fs.readFileSync(paths.reportPath, 'utf8')).status, 'complete-pass');
});

test('different generation bytes are complete findings rather than a pass', { timeout: 20000 }, async t => {
  const { runHlsVerification, hlsValidationPaths } = await loadVerifier();
  const repository = fixture(t);
  const vendorPath = path.join(repository, 'scripts/vendor-hls.mjs');
  const source = fs.readFileSync(vendorPath, 'utf8');
  fs.writeFileSync(vendorPath, source.replace('const wrapped = `// HLS.js', "const wrapped = '// nonce:' + crypto.randomUUID() + '\\n' + `// HLS.js"));
  const id = runId('different');
  const report = await runHlsVerification(repository, id);
  assert.equal(report.status, 'complete-findings');
  assert.equal(report.exitCode, 1);
  assert.equal(report.findings.some(value => value.code === 'generation-bytes-differ'), true);
  assert.equal(fs.existsSync(hlsValidationPaths(repository, id).reportPath), true);
});

test('invalid vendoring JSON leaves an incomplete report', { timeout: 20000 }, async t => {
  const { runHlsVerification, hlsValidationPaths } = await loadVerifier();
  const repository = fixture(t);
  const vendorPath = path.join(repository, 'scripts/vendor-hls.mjs');
  const source = fs.readFileSync(vendorPath, 'utf8');
  const outputLine = "console.log(JSON.stringify({ version: metadata.version, sha256, licenseSha256, hardening: HARDENING_REVISION, hardenedSha256, wrapper: 'local UMD export capture; source-map comment removed' }));";
  assert.equal(source.split(outputLine).length, 2);
  fs.writeFileSync(vendorPath, source.replace(outputLine, "console.log('not-json');"));
  const id = runId('badjson');
  const report = await runHlsVerification(repository, id);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.exitCode, 2);
  assert.equal(report.errors.some(value => value.code === 'vendoring-json-invalid'), true);
  assert.equal(JSON.parse(fs.readFileSync(hlsValidationPaths(repository, id).reportPath, 'utf8')).status, 'incomplete');
});

test('generation timeout leaves an incomplete report', { timeout: 15000 }, async t => {
  const { runHlsVerification } = await loadVerifier();
  const repository = fixture(t);
  const vendorPath = path.join(repository, 'scripts/vendor-hls.mjs');
  fs.writeFileSync(vendorPath, "while (true) {}\n");
  const report = await runHlsVerification(repository, runId('timeout'));
  assert.equal(report.status, 'incomplete');
  assert.equal(report.exitCode, 2);
  assert.equal(report.errors.some(value => value.code === 'vendoring-timeout'), true);
});

test('an input changed by a completed test group makes the run incomplete', { timeout: 20000 }, async t => {
  const { runHlsVerification } = await loadVerifier();
  const repository = fixture(t);
  fs.writeFileSync(path.join(repository, testFiles[0]), "const test=require('node:test');const fs=require('node:fs');test('changes input',()=>fs.appendFileSync('scripts/hls-hardening.mjs','\\n// changed during verification\\n'));\n");
  const report = await runHlsVerification(repository, runId('drift'));
  assert.equal(report.status, 'incomplete');
  assert.equal(report.exitCode, 2);
  assert.equal(report.errors.some(value => value.code === 'input-snapshot-changed'), true);
});

test('a parser fixture changed by a completed test group makes the run incomplete', { timeout: 20000 }, async t => {
  const { runHlsVerification } = await loadVerifier();
  const repository = fixture(t);
  fs.writeFileSync(path.join(repository, testFiles[0]), "const test=require('node:test');const fs=require('node:fs');test('changes fixture',()=>fs.appendFileSync('tests/fixtures/hls-parser-child.cjs','\\n// changed during verification\\n'));\n");
  const report = await runHlsVerification(repository, runId('fixturedrift'), { testGroups: [{ id: 'fixture-drift', files: [testFiles[0]] }] });
  assert.equal(report.status, 'incomplete');
  assert.equal(report.exitCode, 2);
  assert.equal(report.errors.some(value => value.code === 'input-snapshot-changed'), true);
});

test('candidate bytes changed by a completed test group make the run incomplete', { timeout: 20000 }, async t => {
  const { runHlsVerification } = await loadVerifier();
  const repository = fixture(t);
  fs.writeFileSync(path.join(repository, testFiles[0]), "const test=require('node:test');const fs=require('node:fs');test('changes candidate',()=>fs.appendFileSync(process.env.KNIFE_HLS_TEST_BUNDLE,'\\n// changed during tests\\n'));\n");
  const report = await runHlsVerification(repository, runId('candidatedrift'), { testGroups: [{ id: 'candidate-drift', files: [testFiles[0]] }] });
  assert.equal(report.status, 'incomplete');
  assert.equal(report.exitCode, 2);
  assert.equal(report.errors.some(value => value.code === 'candidate-snapshot-changed'), true);
  assert.equal(report.snapshots.candidateMatched, false);
});

test('todo TAP is a finding and inconsistent TAP totals are incomplete', { timeout: 20000 }, async t => {
  const { runHlsVerification, parseTapSummary, tapSummaryIsConsistent } = await loadVerifier();
  const repository = fixture(t);
  fs.writeFileSync(path.join(repository, testFiles[0]), "const test=require('node:test');test.todo('unfinished');\n");
  const report = await runHlsVerification(repository, runId('todo'), { testGroups: [{ id: 'todo', files: [testFiles[0]] }] });
  assert.equal(report.status, 'complete-findings');
  assert.equal(report.exitCode, 1);
  assert.equal(report.testGroups[0].todo, 1);
  const inconsistent = parseTapSummary('# tests 9\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n');
  assert.equal(tapSummaryIsConsistent(inconsistent), false);
});

test('nested parser infrastructure markers make the verifier incomplete', { timeout: 20000 }, async t => {
  const { runHlsVerification } = await loadVerifier();
  const repository = fixture(t);
  fs.writeFileSync(path.join(repository, testFiles[0]), "const test=require('node:test');test('nested timeout',()=>{throw new Error('KNIFE_HLS_INFRA:parser-child-timeout')});\n");
  const report = await runHlsVerification(repository, runId('nestedinfra'), { testGroups: [{ id: 'nested-infra', files: [testFiles[0]] }] });
  assert.equal(report.status, 'incomplete');
  assert.equal(report.exitCode, 2);
  assert.equal(report.errors.some(value => value.code === 'parser-child-timeout'), true);
});

test('an empty configured test group list cannot pass', { timeout: 20000 }, async t => {
  const { runHlsVerification } = await loadVerifier();
  const repository = fixture(t);
  const report = await runHlsVerification(repository, runId('empty'), { testGroups: [] });
  assert.equal(report.status, 'incomplete');
  assert.equal(report.exitCode, 2);
  assert.equal(report.errors.some(value => value.code === 'test-groups-empty'), true);
});
