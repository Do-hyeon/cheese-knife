const test = require('node:test');
const assert = require('node:assert/strict');

const clean = () => ({ filePath: 'sample.js', messages: [], errorCount: 0, warningCount: 0, fatalErrorCount: 0 });
const warning = () => ({ ...clean(), messages: [{ ruleId: 'fixture-rule', severity: 1, line: 1, column: 1, message: 'warning' }], warningCount: 1 });
const error = () => ({ ...clean(), messages: [{ ruleId: 'fixture-rule', severity: 2, line: 1, column: 1, message: 'error' }], errorCount: 1 });
const clone = value => JSON.parse(JSON.stringify(value));

async function repairApi(name, tool = false) {
  const api = await import(tool ? '../scripts/tool-audit.mjs' : '../scripts/p02-audit-epoch.mjs');
  assert.equal(typeof api[name], 'function', `A3 integrated repair export required: ${name}`);
  return api[name];
}

for (const index of [0, 1, 2, 3]) for (const mode of ['error', 'throw']) test(`A3 stages stop at ${index} ${mode}`, async () => {
  const run = await repairApi('runAuditStages', true), calls = [], ids = ['npm', 'eslint', 'gitleaks-dir', 'gitleaks-git'];
  const result = await run(ids.map((id, i) => ({ id, run: async () => {
    calls.push(id); if (i === index && mode === 'throw') throw Error('synthetic-stage');
    return { id, status: i === index ? 'error' : 'pass', count: i === index ? null : 0 };
  } })));
  assert.deepEqual(calls, ids.slice(0, index + 1));
  assert.equal(result.length, index + 1); assert.equal(result.at(-1).status, 'error');
});
test('A3 stages preserve normal findings and raw42 then continue', async () => {
  const run = await repairApi('runAuditStages', true), calls = [];
  const results = await run(['npm', 'eslint', 'gitleaks-dir', 'gitleaks-git'].map(id => ({ id, run: async () => {
    calls.push(id); return { id, status: 'findings', count: 1, exitCode: id.startsWith('gitleaks') ? 42 : 1 };
  } })));
  assert.equal(calls.length, 4); assert.equal(results[2].exitCode, 42);
});
test('A3 stages treat an invalid stage return as failure before another call', async () => {
  const run = await repairApi('runAuditStages', true); let later = false;
  const results = await run([{ id: 'npm', run: async () => undefined }, { id: 'eslint', run: async () => { later = true; } }]);
  assert.equal(later, false); assert.equal(results[0].status, 'error');
});
for (const name of ['duplicates', 'stable', 'changed-report', 'invalid']) test(`A3 occurrence adapter ${name}`, async () => {
  const identify = await repairApi('identifyOccurrences');
  const report = { file: 'saved/report.json', bytes: 9, sha256: 'a'.repeat(64) }, rows = [{ id: 'same' }, { id: 'same' }];
  if (name === 'invalid') { assert.throws(() => identify(report, [{ id: null }])); return; }
  const actual = identify(report, rows);
  assert.deepEqual(actual.map(row => row.id), ['same', 'same']); assert.equal(new Set(actual.map(row => row.occurrenceId)).size, 2);
  assert.deepEqual(rows, [{ id: 'same' }, { id: 'same' }]);
  if (name === 'stable') assert.deepEqual(identify(report, rows), actual);
  if (name === 'changed-report') assert.notEqual(identify({ ...report, sha256: 'b'.repeat(64) }, rows)[0].occurrenceId, actual[0].occurrenceId);
});

async function publicRoot(t) {
  const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p02-public-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, fs, path };
}
test('A3 public absence requires truly absent private roots', async t => {
  const absent = await repairApi('publicAuditAbsence'), { root } = await publicRoot(t);
  assert.equal(await absent(root), true);
});
for (const key of ['P02_CURRENT_EPOCH_SHA256', 'P02_EVIDENCE_SCOPE_SHA256']) test(`A3 explicit ${key} prevents public skip`, async t => {
  const absent = await repairApi('publicAuditAbsence'), { root } = await publicRoot(t);
  assert.equal(await absent(root, { [key]: 'a'.repeat(64) }), false);
});
for (const [file, directory] of [
  ['output/tool-audit/recovery-backlog/implementation.json', false],
  ['output/tool-audit/run-old/summary.json', false],
  ['.superpowers/sdd/2026-10-22-p02-current-epoch-apply-A/orphan.txt', false],
  ['output/tool-audit', true],
  ['output/tool-audit', false],
]) test(`A3 partial private ${file} ${directory ? 'directory' : 'file'} prevents public skip`, async t => {
  const absent = await repairApi('publicAuditAbsence'), { root, fs, path } = await publicRoot(t), target = path.join(root, file);
  await fs.mkdir(directory ? target : path.dirname(target), { recursive: true });
  if (!directory) await fs.writeFile(target, 'preserved-private');
  assert.equal(await absent(root), false);
});
test('A3 ambiguous linked private root fails instead of public skip', async t => {
  const absent = await repairApi('publicAuditAbsence'), { root, fs, path } = await publicRoot(t);
  const target = path.join(root, 'outside'); await fs.mkdir(target); await fs.mkdir(path.join(root, 'output'));
  await fs.symlink(target, path.join(root, 'output/tool-audit'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(absent(root));
});

// This file imports the classifier only; it never starts the tool CLI or ESLint.
async function classify(report, exit) {
  const { classifyReport } = await import('../scripts/tool-audit.mjs');
  let result;
  assert.doesNotThrow(() => { result = classifyReport('eslint', JSON.stringify(report), exit); }, 'Malformed reports must return a tool error');
  return result;
}

const inconsistent = [
  ['declared error without messages', () => [{ ...clean(), errorCount: 1 }], 0],
  ['declared warning without messages', () => [{ ...clean(), warningCount: 1 }], 0],
  ['negative error count', () => [{ ...clean(), errorCount: -1 }], 0],
  ['negative warning count', () => [{ ...clean(), warningCount: -1 }], 0],
  ['fatal count absent', () => { const row = clean(); delete row.fatalErrorCount; return [row]; }, 0],
  ['negative fatal count', () => [{ ...clean(), fatalErrorCount: -1 }], 0],
  ['null fatal count', () => [{ ...clean(), fatalErrorCount: null }], 0],
  ['string fatal count', () => [{ ...clean(), fatalErrorCount: '0' }], 0],
  ['severity absent', () => { const row = warning(); delete row.messages[0].severity; return [row]; }, 1],
  ['severity zero', () => { const row = warning(); row.messages[0].severity = 0; return [row]; }, 1],
  ['severity outside domain', () => { const row = warning(); row.messages[0].severity = 3; return [row]; }, 1],
  ['string severity', () => { const row = warning(); row.messages[0].severity = '1'; return [row]; }, 1],
  ['boolean severity', () => { const row = warning(); row.messages[0].severity = true; return [row]; }, 1],
  ['null severity', () => { const row = warning(); row.messages[0].severity = null; return [row]; }, 1],
  ['error message in warning bucket', () => [{ ...error(), errorCount: 0, warningCount: 1 }], 1],
  ['warning message in error bucket', () => [{ ...warning(), warningCount: 0, errorCount: 1 }], 1],
  ['message count understated', () => { const row = warning(); row.messages.push(clone(row.messages[0])); return [row]; }, 1],
  ['per-file mismatches cancelling across report', () => [{ ...warning(), warningCount: 0 }, { ...clean(), filePath: 'second.js', warningCount: 1 }], 1],
  ['error message with zero declaration', () => [{ ...error(), errorCount: 0 }], 1],
  ['warning message with zero declaration', () => [{ ...warning(), warningCount: 0 }], 1],
  ['warnings with success exit', () => [warning()], 0],
  ['errors with success exit', () => [error()], 0],
  ['numeric fatal flag', () => { const row = warning(); row.messages[0].fatal = 0; return [row]; }, 1],
  ['null fatal flag', () => { const row = warning(); row.messages[0].fatal = null; return [row]; }, 1],
  ['empty fatal flag', () => { const row = warning(); row.messages[0].fatal = ''; return [row]; }, 1],
  ['empty rule identity', () => { const row = warning(); row.messages[0].ruleId = ''; return [row]; }, 1],
  ['null message record', () => [{ ...warning(), messages: [null] }], 1],
  ['missing filePath', () => { const row = clean(); delete row.filePath; return [row]; }, 0],
  ['empty filePath', () => [{ ...clean(), filePath: '' }], 0],
  ['nonstring filePath', () => [{ ...clean(), filePath: 7 }], 0],
];
for (const [name, report, exit] of inconsistent) test(`ESLint consistency rejects ${name}`, async () => {
  const result = await classify(report(), exit);
  assert.equal(result.status, 'error', 'Internally inconsistent ESLint evidence cannot be clean or findings');
});

const valid = [
  ['clean', () => [clean()], 0, 'pass', 0],
  ['warning', () => [warning()], 1, 'findings', 1],
  ['error', () => [error()], 1, 'findings', 1],
  ['mixed files', () => [warning(), { ...error(), filePath: 'second.js' }, { ...clean(), filePath: 'third.js' }], 1, 'findings', 2],
  ['explicit false fatal', () => { const row = warning(); row.messages[0].fatal = false; return [row]; }, 1, 'findings', 1],
];
for (const [name, report, exit, status, count] of valid) test(`ESLint consistency preserves valid ${name}`, async () => {
  const input = report();
  const result = await classify(input, exit);
  assert.equal(result.status, status);
  assert.equal(result.count, count);
  assert.deepEqual(result.report, input);
});

const blocked = [
  ['fatal parse failure', () => [{ ...error(), fatalErrorCount: 1, messages: [{ ruleId: null, severity: 2, fatal: true, message: 'parse failure' }] }], 1],
  ['fatal flag despite zero fatal count', () => { const row = error(); row.messages[0].fatal = true; return [row]; }, 1],
  ['positive fatal count without flagged message', () => [{ ...error(), fatalErrorCount: 1 }], 1],
  ['fractional counts', () => [{ ...clean(), errorCount: 0.5 }], 0],
  ['unsafe counts', () => [{ ...clean(), warningCount: Number.MAX_SAFE_INTEGER + 1 }], 0],
  ['missing counts', () => { const row = clean(); delete row.errorCount; return [row]; }, 0],
  ['interrupted run', () => [clean()], null],
  ['tool failure exit', () => [warning()], 2],
  ['clean report with failure exit', () => [clean()], 1],
  ['empty report', () => [], 0],
];
for (const [name, report, exit] of blocked) test(`ESLint consistency keeps ${name} blocked`, async () => {
  assert.equal((await classify(report(), exit)).status, 'error');
});
