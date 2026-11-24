const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');

const inputs = [{ file: 'entry.js', sha256: 'a'.repeat(64) }];
const snapshot = async () => structuredClone(inputs);
const apiPromise = import('../scripts/tool-audit.mjs');

async function api() {
  const value = await apiPromise;
  assert.equal(typeof value.failedExecution, 'function', 'safe failure descriptor required');
  assert.equal(typeof value.runAuditCollection, 'function', 'shared durable collection boundary required');
  return value;
}

async function fixture(id, value) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'cheese-knife-p02-' + id + '-'));
  test.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, run: await value.openAuditRun(root, 'run-focused-') };
}

async function summary(run) {
  const raw = await fs.readFile(path.join(run.runDirectory, 'summary.json'), 'utf8');
  return { raw, data: JSON.parse(raw) };
}

const secret = 'PRIVATE_OUTPUT_SENTINEL';
const leaks = JSON.stringify([{ RuleID: 'fixture', File: 'entry.js', StartLine: 1,
  Secret: secret, Match: secret, Author: secret, Email: secret, Message: secret }]);
const eslint = JSON.stringify([{ filePath: 'entry.js', source: secret, messages: [{ ruleId: null,
  fatal: true, severity: 2, message: secret }], errorCount: 1, warningCount: 0, fatalErrorCount: 1 }]);

for (const [name, id, tool, stdout, exitCode] of [
  ['gitleaks-exit', 'gitleaks-dir', 'gitleaks', leaks, 2],
  ['gitleaks-interrupt', 'gitleaks-dir', 'gitleaks', leaks, null],
  ['eslint-parse', 'eslint', 'eslint', eslint, 1],
  ['malformed', 'eslint', 'eslint', secret + '{', 2],
  ['version', 'npm', null, secret, null],
]) test(`collector failure storage excludes raw ${name}`, async () => {
  const value = await api(), { run } = await fixture(name, value);
  const reason = tool ? value.classifyReport(tool, stdout, exitCode).reason : 'npm-cli-unavailable';
  assert.equal(typeof reason, 'string');
  const result = await value.runAuditCollection(run, async () => [{ id,
    run: async () => value.failedExecution(id, reason, { stdout, exitCode }) }], snapshot);
  const saved = await summary(run);
  assert.equal(result.exitCode, 2);
  assert.equal(saved.data.results[0].status, 'error');
  assert.equal(saved.data.results[0].exitCode, exitCode);
  assert.deepEqual(saved.data.results[0].failureOutput, {
    bytes: Buffer.byteLength(stdout), sha256: createHash('sha256').update(stdout).digest('hex'),
  });
  assert.equal(saved.raw.includes(secret), false);
  assert.deepEqual(await fs.readdir(run.runDirectory), ['summary.json']);
});

test('collector failure storage preserves empty output identity without a raw file', async () => {
  const value = await api();
  assert.deepEqual(value.failedExecution('npm', 'npm-cli-unavailable', { stdout: '', exitCode: null }), {
    id: 'npm', status: 'error', count: null, reason: 'npm-cli-unavailable', exitCode: null,
    failureOutput: { bytes: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  });
});

test('collector finalization preserves a successful stable result', async () => {
  const value = await api(), { run } = await fixture('stable', value), calls = [];
  const result = await value.runAuditCollection(run, async ({ source }) => {
    assert.deepEqual(source, ['entry.js']);
    return [{ id: 'npm', run: async () => { calls.push('npm'); return { id: 'npm', status: 'pass', count: 0 }; } }];
  }, async root => { assert.equal(root, run.owned.root); calls.push('snapshot'); return snapshot(); });
  const saved = await summary(run);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(calls, ['snapshot', 'npm', 'snapshot']);
  assert.deepEqual(saved.data.inputSnapshot.before, inputs);
  assert.deepEqual(saved.data.inputSnapshot.after, inputs);
  assert.equal(saved.data.inputSnapshot.matched, true);
  assert.equal(saved.data.results.length, 1);
});

test('collector finalization retains normal raw42 findings and safe reports', async () => {
  const value = await api(), { run } = await fixture('raw42', value);
  const result = await value.runAuditCollection(run, async ({ reports }) => [{ id: 'gitleaks-dir', run: async () => {
    const { report, ...assessed } = value.classifyReport('gitleaks', leaks, 42);
    reports.set('gitleaks-dir', report);
    await run.owned.writeFile(`${run.runRelative}/gitleaks-dir.json`, JSON.stringify(report));
    return { id: 'gitleaks-dir', ...assessed, exitCode: 42 };
  } }], snapshot);
  const saved = await summary(run);
  assert.equal(result.exitCode, 1);
  assert.equal(saved.data.results[0].exitCode, 42);
  assert.equal(saved.data.results[0].status, 'findings');
  assert.equal(saved.data.catalog[0].id, 'gitleaks-dir:entry.js:1:fixture:');
  assert.equal(saved.raw.includes(secret), false);
  assert.equal((await fs.readFile(path.join(run.runDirectory, 'gitleaks-dir.json'), 'utf8')).includes(secret), false);
});

test('collector finalization records initial snapshot failure without starting stages', async () => {
  const value = await api(), { run } = await fixture('before-error', value); let calls = 0, setups = 0;
  const result = await value.runAuditCollection(run, async () => { setups++; return []; }, async () => {
    calls++; throw Object.assign(Error(secret), { code: 'ENOENT' });
  });
  const saved = await summary(run);
  assert.equal(result.exitCode, 2);
  assert.equal(setups, 0); assert.equal(calls, 1);
  assert.equal(saved.data.inputSnapshot.before, null);
  assert.equal(saved.data.inputSnapshot.after, null);
  assert.equal(saved.data.inputSnapshot.matched, false);
  assert.equal(saved.data.results[0].id, 'input-snapshot-before');
  assert.equal(saved.data.results[0].errorCode, 'ENOENT');
  assert.equal(saved.raw.includes(secret), false);
});

test('collector finalization records setup failure and still records after context', async () => {
  const value = await api(), { run } = await fixture('setup-error', value);
  const result = await value.runAuditCollection(run, async () => { throw Object.assign(Error(secret), { code: 'EACCES' }); }, snapshot);
  const saved = await summary(run);
  assert.equal(result.exitCode, 2);
  assert.equal(saved.data.results[0].id, 'stage-setup');
  assert.equal(saved.data.results[0].errorCode, 'EACCES');
  assert.deepEqual(saved.data.inputSnapshot.after, inputs);
  assert.equal(saved.raw.includes(secret), false);
});

test('collector finalization records after failure even when the stage passed', async () => {
  const value = await api(), { run } = await fixture('after-error', value); let snapshots = 0;
  const result = await value.runAuditCollection(run, async () => [{ id: 'npm', run: async () => ({ id: 'npm', status: 'pass', count: 0 }) }], async () => {
    if (++snapshots === 2) throw Object.assign(Error(secret), { code: 'ENOENT' });
    return snapshot();
  });
  const saved = await summary(run);
  assert.equal(result.exitCode, 2);
  assert.deepEqual(saved.data.results.map(row => row.id), ['npm', 'input-snapshot-after']);
  assert.deepEqual(saved.data.inputSnapshot.before, inputs);
  assert.equal(saved.data.inputSnapshot.after, null);
  assert.equal(saved.data.inputSnapshot.matched, false);
  assert.equal(saved.raw.includes(secret), false);
});

test('collector finalization survives a real missing required input without later stages', async () => {
  const value = await api(), { root, run } = await fixture('missing-input', value); let later = 0;
  for (const [file, content] of [['package.json', '{}'], ['package-lock.json', '{}'], ['gitleaks.audit.toml', ''], ['entry.js', 'void 0;']]) {
    await fs.writeFile(path.join(root, file), content, { flag: 'wx' });
  }
  const result = await value.runAuditCollection(run, async () => [{ id: 'npm', run: async () => {
    await fs.rename(path.join(root, 'package-lock.json'), path.join(root, 'package-lock.retained'));
    await run.owned.readFile('package-lock.json');
  } }, { id: 'eslint', run: async () => { later++; } }], value.snapshotInput);
  const saved = await summary(run);
  assert.equal(result.exitCode, 2); assert.equal(later, 0);
  assert.deepEqual(saved.data.results.map(row => [row.id, row.errorCode]), [['npm', 'ENOENT'], ['input-snapshot-after', 'ENOENT']]);
  assert.ok(saved.data.inputSnapshot.before.some(row => row.file === 'package-lock.json'));
  assert.equal(saved.data.inputSnapshot.after, null);
  assert.equal(await fs.readFile(path.join(root, 'package-lock.retained'), 'utf8'), '{}');
});

test('collector finalization retains earlier results and the first error before after error', async () => {
  const value = await api(), { run } = await fixture('partial-error', value); let snapshots = 0, later = 0;
  const result = await value.runAuditCollection(run, async () => [
    { id: 'npm', run: async () => ({ id: 'npm', status: 'pass', count: 0 }) },
    { id: 'eslint', run: async () => { throw Object.assign(Error(secret), { code: 'EACCES' }); } },
    { id: 'gitleaks-dir', run: async () => { later++; } },
  ], async () => { if (++snapshots === 2) throw Object.assign(Error(secret), { code: 'ENOENT' }); return snapshot(); });
  const saved = await summary(run);
  assert.equal(result.exitCode, 2); assert.equal(later, 0);
  assert.deepEqual(saved.data.results.map(row => row.id), ['npm', 'eslint', 'input-snapshot-after']);
  assert.equal(saved.data.results[1].errorCode, 'EACCES');
  assert.equal(saved.data.results[2].errorCode, 'ENOENT');
  assert.equal(saved.raw.includes(secret), false);
});

test('collector finalization rejects changed input without losing either snapshot', async () => {
  const value = await api(), { run } = await fixture('drift', value); let count = 0;
  const result = await value.runAuditCollection(run, async () => [{ id: 'npm', run: async () => ({ id: 'npm', status: 'pass', count: 0 }) }],
    async () => [{ file: 'entry.js', sha256: (++count === 1 ? 'a' : 'b').repeat(64) }]);
  const saved = await summary(run);
  assert.equal(result.exitCode, 2);
  assert.equal(saved.data.inputSnapshot.matched, false);
  assert.equal(saved.data.inputSnapshot.before[0].sha256, 'a'.repeat(64));
  assert.equal(saved.data.inputSnapshot.after[0].sha256, 'b'.repeat(64));
  assert.equal(saved.data.results.at(-1).reason, 'covered-inputs-changed-between-snapshots');
});

test('collector finalization reports an unpersisted summary once with its allocated run', async () => {
  const value = await api(), { run } = await fixture('write-error', value); let writes = 0, stages = 0;
  const denied = { ...run, owned: { ...run.owned, writeFile: async () => { writes++; throw Object.assign(Error(secret), { code: 'EACCES' }); } } };
  await assert.rejects(value.runAuditCollection(denied, async () => [{ id: 'npm', run: async () => {
    stages++; return { id: 'npm', status: 'pass', count: 0 };
  } }], snapshot), error => error.code === 'audit-summary-write-failed' && error.runDirectory === run.runDirectory && !error.message.includes(secret));
  assert.equal(writes, 1); assert.equal(stages, 1);
  assert.deepEqual(await fs.readdir(run.runDirectory), []);
});

test('collector fixture allocation preserves repeated retained cases', async () => {
  const value = await api(), first = await fixture('replay-case', value);
  await first.run.owned.writeFile(`${first.run.runRelative}/keep.txt`, 'retained', { flag: 'wx' });
  let second;
  await assert.doesNotReject(async () => { second = await fixture('replay-case', value); });
  assert.notEqual(second.root, first.root);
  assert.equal(await fs.readFile(path.join(first.run.runDirectory, 'keep.txt'), 'utf8'), 'retained');
  assert.deepEqual(await fs.readdir(second.run.runDirectory), []);
});

test('collector finalization preserves errors when catalog construction fails', async () => {
  const value = await api(), { run } = await fixture('catalog-error', value); let snapshots = 0, result;
  await assert.doesNotReject(async () => {
    result = await value.runAuditCollection(run, async ({ reports }) => [
      { id: 'npm', run: async () => {
        const { report, ...assessed } = value.classifyReport('npm', JSON.stringify({ auditReportVersion: 2,
          vulnerabilities: { sample: null }, metadata: { vulnerabilities: { total: 1 } } }), 1);
        reports.set('npm', report);
        await run.owned.writeFile(`${run.runRelative}/npm.json`, JSON.stringify(report));
        return { id: 'npm', ...assessed, exitCode: 1 };
      } },
      { id: 'eslint', run: async () => { throw Object.assign(Error(secret), { code: 'EACCES' }); } },
    ], async () => { if (++snapshots === 2) throw Object.assign(Error(secret), { code: 'ENOENT' }); return snapshot(); });
  });
  const saved = await summary(run);
  assert.equal(result.exitCode, 2);
  assert.deepEqual(saved.data.results.map(row => row.id), ['npm', 'eslint', 'input-snapshot-after', 'catalog']);
  assert.equal(saved.data.results[1].errorCode, 'EACCES');
  assert.equal(saved.data.results[2].errorCode, 'ENOENT');
  assert.equal(saved.data.results[3].reason, 'catalog-construction-failed');
  assert.deepEqual(saved.data.inputSnapshot.before, inputs);
  assert.equal(saved.data.inputSnapshot.after, null);
  assert.deepEqual(saved.data.catalog, []);
  assert.equal(saved.raw.includes(secret), false);
});
