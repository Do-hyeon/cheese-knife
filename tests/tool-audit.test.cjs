const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const os = require('node:os');
const { createHash } = require('node:crypto');

async function auditModule() {
  const url = pathToFileURL(path.resolve('scripts/tool-audit.mjs')).href;
  const mod = await import(url).catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === url) return {};
    throw error;
  });
  assert.equal(typeof mod.classifyReport, 'function', 'audit result classification must exist');
  return mod;
}

const npmClean = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } };

test('audit runner accepts a complete successful npm report', async () => {
  const { classifyReport } = await auditModule();
  assert.equal(classifyReport('npm', JSON.stringify(npmClean), 0).status, 'pass');
});

test('npm registry errors cannot masquerade as an empty vulnerability list', async () => {
  const { classifyReport } = await auditModule();
  assert.equal(classifyReport('npm', JSON.stringify({ error: { code: 'ENOTFOUND' } }), 1).status, 'error');
});

test('npm nonzero exit cannot be called clean even with a zero-count report', async () => {
  const { classifyReport } = await auditModule();
  assert.equal(classifyReport('npm', JSON.stringify(npmClean), 1).status, 'error');
});

test('npm count mismatches and ESLint ignored-file placeholders are incomplete runs', async () => {
  const { classifyReport } = await auditModule();
  const mismatched = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { total: 1 } } };
  assert.equal(classifyReport('npm', JSON.stringify(mismatched), 1).status, 'error');
  const ignored = [{ filePath: 'sample.js', messages: [{ ruleId: null, severity: 1, message: 'File ignored' }], errorCount: 0, warningCount: 1, fatalErrorCount: 0 }];
  assert.equal(classifyReport('eslint', JSON.stringify(ignored), 1).status, 'error');
});

test('npm advisory count and affected package survive the tool result', async () => {
  const { classifyReport } = await auditModule();
  const report = { auditReportVersion: 2, vulnerabilities: { sample: { severity: 'high', via: [] } }, metadata: { vulnerabilities: { total: 1 } } };
  const result = classifyReport('npm', JSON.stringify(report), 1);
  assert.equal(result.status, 'findings');
  assert.equal(result.count, 1);
  assert.deepEqual(Object.keys(result.report.vulnerabilities), ['sample']);
});

test('invalid and missing scanner JSON are tool failures', async () => {
  const { classifyReport } = await auditModule();
  for (const tool of ['npm', 'eslint', 'gitleaks']) {
    for (const input of ['', '{broken', '{}', 'null']) assert.equal(classifyReport(tool, input, 0).status, 'error');
  }
});

test('ESLint rule warnings remain findings rather than clean scans', async () => {
  const { classifyReport } = await auditModule();
  const input = [{ filePath: 'sample.js', messages: [{ ruleId: 'no-eval', severity: 1, line: 2, message: 'tool warning' }], errorCount: 0, warningCount: 1, fatalErrorCount: 0 }];
  const result = classifyReport('eslint', JSON.stringify(input), 1);
  assert.equal(result.status, 'findings');
  assert.equal(result.count, 1);
});

test('ESLint parse failures are errors, not completed security findings', async () => {
  const { classifyReport } = await auditModule();
  const input = [{ filePath: 'sample.js', messages: [{ fatal: true, ruleId: null, message: 'parse failed' }], errorCount: 1, warningCount: 0, fatalErrorCount: 1 }];
  assert.equal(classifyReport('eslint', JSON.stringify(input), 1).status, 'error');
});

test('ESLint strips source text from retained reports', async () => {
  const { classifyReport } = await auditModule();
  const input = [{ filePath: 'sample.js', source: 'private source fixture', messages: [], errorCount: 0, warningCount: 0, fatalErrorCount: 0 }];
  const result = classifyReport('eslint', JSON.stringify(input), 0);
  assert.equal(result.status, 'pass');
  assert.equal(JSON.stringify(result).includes('private source fixture'), false);
});

test('Gitleaks uses a dedicated finding exit code and drops secret fields', async () => {
  const { classifyReport } = await auditModule();
  const input = [{ RuleID: 'fixture-rule', File: 'sample.js', StartLine: 4, EndLine: 4, Secret: 'private fixture value', Match: 'private fixture value', Email: 'private fixture author' }];
  const result = classifyReport('gitleaks', JSON.stringify(input), 42);
  assert.equal(result.status, 'findings');
  assert.equal(result.count, 1);
  assert.deepEqual(result.report, [{ RuleID: 'fixture-rule', File: 'sample.js', StartLine: 4, EndLine: 4 }]);
});

test('Gitleaks projection retains only eight explicit own fields', async () => {
  const { classifyReport } = await auditModule();
  const input = [{
    RuleID: 'fixture-rule', File: 'sample.js', StartLine: 4, EndLine: 5,
    StartColumn: 6, EndColumn: 7, Commit: 'fixture-commit', Fingerprint: 'fixture-fingerprint',
    Secret: 'private fixture', Match: 'private fixture', Unknown: 'drop me',
  }];
  const result = classifyReport('gitleaks', JSON.stringify(input), 42);
  assert.deepEqual(Object.keys(result.report[0]), ['RuleID', 'File', 'StartLine', 'EndLine', 'StartColumn', 'EndColumn', 'Commit', 'Fingerprint']);
  assert.equal(JSON.stringify(result.report).includes('private fixture'), false);
  assert.equal(Object.hasOwn(result.report[0], 'Unknown'), false);
});

test('Gitleaks failure exit codes and interrupted processes never pass', async () => {
  const { classifyReport } = await auditModule();
  for (const exit of [1, 2, null]) assert.equal(classifyReport('gitleaks', '[]', exit).status, 'error');
  assert.equal(classifyReport('gitleaks', '[]', 42).status, 'error');
  assert.equal(classifyReport('gitleaks', '[]', 0).status, 'pass');
});

test('static scan scope includes owned code but excludes HLS, dependencies, output and tests', async () => {
  const { sourceFiles } = await auditModule();
  const files = await sourceFiles(process.cwd());
  assert.ok(files.includes('web/preview.js'));
  assert.ok(files.includes('settings-broker.js'));
  assert.ok(files.includes('scripts/build.mjs'));
  assert.equal(files.some(file => /(?:^vendor\/|^node_modules\/|^output\/|^tests\/|^dist(?:\/|-)|^scripts\/(?:hls-hardening|vendor-hls)\.mjs$)/.test(file)), false);
});

test('source walk skips internal directory links and audit output rejects linked roots', async t => {
  const { sourceFiles, openAuditRun } = await auditModule();
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-audit-links-'));
  const root = path.join(base, 'root'), outside = path.join(base, 'outside');
  await fs.mkdir(root); await fs.mkdir(outside);
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'main.js'), '// owned');
  await fs.writeFile(path.join(outside, 'foreign.mjs'), '// foreign');
  await fs.symlink(outside, path.join(root, 'scripts'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(await sourceFiles(root), ['main.js']);
  await fs.symlink(outside, path.join(root, 'output'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(openAuditRun(root, 'run-fixture-'), { code: 'owned-path-link' });
  assert.equal(await fs.readFile(path.join(outside, 'foreign.mjs'), 'utf8'), '// foreign');
});

test('a timed-out tool is recorded as an error even if it prints clean JSON', async () => {
  const { runTool, classifyReport } = await auditModule();
  const result = await runTool(process.execPath, ['-e', 'process.stdout.write("[]");setTimeout(()=>{},1000)'], { timeout: 100 });
  assert.equal(result.exitCode, null);
  assert.equal(classifyReport('gitleaks', result.stdout, result.exitCode).status, 'error');
});

test('warning inventory retains package advisory provenance without asserting confirmation', async () => {
  const { buildCatalog } = await auditModule();
  assert.equal(typeof buildCatalog, 'function', 'warning inventory must exist');
  const rows = buildCatalog([{ id: 'npm', status: 'findings', report: { vulnerabilities: {
    sample: { severity: 'high', nodes: ['node_modules/sample'], via: [{ title: 'fixture advisory', url: 'https://example.invalid/advisory', range: '<2' }], fixAvailable: { name: 'parent', version: '1.0.0', isSemVerMajor: true } },
  } } }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].package, 'sample');
  assert.equal(rows[0].status, 'open');
  assert.equal(rows[0].advisories[0].url, 'https://example.invalid/advisory');
  assert.equal(rows[0].toolSuggestedFix.isSemVerMajor, true);
  assert.equal(Object.hasOwn(rows[0], 'confirmed'), false);
});

test('warning inventory preserves each static location and failed checks', async () => {
  const { buildCatalog } = await auditModule();
  assert.equal(typeof buildCatalog, 'function', 'warning inventory must exist');
  const rows = buildCatalog([
    { id: 'eslint', status: 'findings', report: [{ filePath: path.resolve('web/player.js'), messages: [{ ruleId: 'fixture-rule', severity: 1, line: 2, column: 3, message: 'fixture warning' }, { ruleId: 'fixture-rule', severity: 1, line: 4, column: 5, message: 'another warning' }] }] },
    { id: 'gitleaks-git', status: 'error', reason: 'process-interrupted-or-unavailable' },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].file, 'web/player.js');
  assert.equal(rows[0].line, 2);
  assert.equal(rows[1].line, 4);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[2].status, 'check-failed');
});

test('warning inventory treats prototype-like npm names and unusual ESLint strings as data', async () => {
  const { buildCatalog } = await auditModule();
  const vulnerabilities = JSON.parse('{"__proto__":{"severity":"low","nodes":[],"via":[],"fixAvailable":false}}');
  const rows = buildCatalog([
    { id: 'npm', status: 'findings', report: { vulnerabilities } },
    { id: 'eslint', status: 'findings', report: [{
      filePath: path.resolve('__proto__', 'odd:file.js'),
      messages: [{ ruleId: 'constructor/prototype', severity: 1, line: 7, column: 9, message: '__proto__ warning' }],
    }] },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].package, '__proto__');
  assert.equal(rows[1].rule, 'constructor/prototype');
  assert.match(rows[1].file, /__proto__\/odd:file\.js$/);
  assert.equal(Object.prototype.status, undefined);
  assert.equal(Object.getPrototypeOf(rows), Array.prototype);
});

test('warning inventory never copies Gitleaks secret or author values', async () => {
  const { buildCatalog } = await auditModule();
  assert.equal(typeof buildCatalog, 'function', 'warning inventory must exist');
  const rows = buildCatalog([{ id: 'gitleaks-dir', status: 'findings', report: [{ RuleID: 'fixture-rule', File: 'sample.js', StartLine: 3, Secret: 'private fixture value', Match: 'private fixture value', Email: 'private fixture identity' }] }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].file, 'sample.js');
  assert.equal(JSON.stringify(rows).includes('private fixture'), false);
});

const privateBacklog = path.resolve('output', 'tool-audit', 'recovery-backlog');
const privateLedgerAvailable = ['p02-static-boundaries-baseline-2026-10-11.json', 'warning-ledger.json']
  .every(file => existsSync(path.join(privateBacklog, file)));

test('P02 warning ledger closes every baseline row and preserves every latest guarded observation', {
  skip: privateLedgerAvailable ? false : 'private audit evidence is intentionally absent from a public checkout',
}, async () => {
  const backlog = privateBacklog;
  const baseline = JSON.parse(await fs.readFile(path.join(backlog, 'p02-static-boundaries-baseline-2026-10-11.json'), 'utf8'));
  const ledger = JSON.parse(await fs.readFile(path.join(backlog, 'warning-ledger.json'), 'utf8'));
  assert.equal(typeof ledger.latestReport, 'string');
  assert.notEqual(ledger.latestReport.trim(), '');
  const latest = JSON.parse(await fs.readFile(path.resolve(ledger.latestReport), 'utf8'));
  assert.equal(latest.inputSnapshot.matched, true);
  assert.deepEqual(latest.inputSnapshot.before, latest.inputSnapshot.after);
  const latestHashes = new Map(latest.inputSnapshot.before.map(row => [row.file, row.sha256]));
  for (const [file, expectedHash] of latestHashes) {
    const actualHash = createHash('sha256').update(await fs.readFile(path.resolve(file))).digest('hex');
    assert.equal(actualHash, expectedHash, `${file} must still match the latest complete report`);
  }
  const baselineRows = new Map(baseline.findingRows.map(row => [row.findingId, row]));
  assert.equal(baselineRows.size, baseline.findingRows.length);
  assert.equal(new Set(ledger.findings.map(finding => finding.findingId)).size, ledger.findings.length);

  for (const row of baseline.findingRows) {
    const successors = ledger.findings.filter(finding => finding.previousFindingId === row.findingId);
    assert.equal(successors.length, 1, `${row.findingId} must have exactly one disposition`);
    assert.equal(successors[0].previousSourceHash, row.sourceHash, `${row.findingId} previous hash`);
    assert.equal(successors[0].currentSourceHash, latestHashes.get(row.file), `${row.findingId} current hash`);
    assert.equal(successors[0].status, 'remediated', `${row.findingId} status`);
    assert.equal(latest.catalog.some(latestRow => latestRow.file === row.file && latestRow.rule === row.rule), false,
      `${row.findingId} cannot be remediated while its file/rule remains observed`);
  }
  assert.equal(ledger.findings.filter(finding => finding.previousFindingId !== null).length, baseline.findingRows.length);

  for (const finding of ledger.findings) {
    for (const field of ['previousSourceHash', 'currentSourceHash', 'redTest', 'greenCommand']) {
      assert.equal(typeof finding[field], 'string', `${finding.findingId}.${field}`);
      assert.notEqual(finding[field].trim(), '', `${finding.findingId}.${field}`);
    }
    assert.equal(typeof finding.finalObservation?.rule, 'string', `${finding.findingId}.finalObservation.rule`);
    assert.notEqual(finding.finalObservation.rule.trim(), '');
    assert.equal(typeof finding.finalObservation?.location, 'string', `${finding.findingId}.finalObservation.location`);
    assert.notEqual(finding.finalObservation.location.trim(), '');
    assert.equal(finding.finalObservation.report, ledger.latestReport, `${finding.findingId}.finalObservation.report`);
    assert.ok(['remediated', 'guarded-boundary'].includes(finding.status), `${finding.findingId}.status`);
  }

  for (const row of latest.catalog) {
    const matches = ledger.findings.filter(finding => finding.findingId === row.id);
    assert.equal(matches.length, 1, `${row.id} must remain visible`);
    assert.equal(matches[0].previousFindingId, null, `${row.id} predecessor`);
    assert.equal(matches[0].status, 'guarded-boundary', `${row.id} status`);
    assert.equal(matches[0].currentSourceHash, latestHashes.get(row.file), `${row.id} current hash`);
    assert.equal(matches[0].finalObservation.location, `${row.file}:${row.line}:${row.column}`, `${row.id} location`);
    assert.equal(typeof matches[0].scannerCommand, 'string', `${row.id} scanner command`);
    assert.match(matches[0].scannerCommand, /node_modules\/eslint\/bin\/eslint\.js/);
    assert.match(matches[0].scannerCommand, /--config eslint\.security\.config\.mjs/);
    assert.match(matches[0].scannerCommand, /--no-inline-config/);
    assert.match(matches[0].scannerCommand, /--max-warnings=0/);
  }
  const eslintResult = latest.results.find(result => result.id === 'eslint');
  assert.equal(eslintResult.status, 'findings');
  assert.equal(eslintResult.count, latest.catalog.length);
  assert.equal(ledger.counts.remediated, baseline.findingRows.length);
  assert.equal(ledger.counts.guardedBoundary, latest.catalog.length);
  assert.equal(ledger.counts.open, 0);
  assert.equal(ledger.counts.new, 0);
});

test('input snapshot changes when covered sources or the lockfile change', async t => {
  const { snapshotInput } = await auditModule();
  assert.equal(typeof snapshotInput, 'function', 'input snapshot must exist');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-audit-input-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const file of ['package.json', 'package-lock.json', 'eslint.security.config.mjs', 'gitleaks.audit.toml', 'sample.js']) await fs.writeFile(path.join(directory, file), 'fixture');
  const before = await snapshotInput(directory);
  await fs.writeFile(path.join(directory, 'sample.js'), 'changed fixture');
  const sourceChanged = await snapshotInput(directory);
  assert.notDeepEqual(before, sourceChanged);
  await fs.writeFile(path.join(directory, 'package-lock.json'), 'changed lock fixture');
  const lockChanged = await snapshotInput(directory);
  assert.notDeepEqual(sourceChanged, lockChanged);
  await fs.writeFile(path.join(directory, 'new-source.js'), 'new fixture');
  assert.notDeepEqual(lockChanged, await snapshotInput(directory));
});

test('empty checks and changed inputs cannot receive a passing exit code', async () => {
  const { auditExitCode } = await auditModule();
  assert.equal(typeof auditExitCode, 'function', 'run completion gate must exist');
  assert.equal(auditExitCode([], true), 2);
  assert.equal(auditExitCode([{ status: 'pass' }], false), 2);
  assert.equal(auditExitCode([{ status: 'findings' }], false), 2);
  assert.equal(auditExitCode([{ status: 'pass' }], true), 0);
  assert.equal(auditExitCode([{ status: 'findings' }], true), 1);
});
