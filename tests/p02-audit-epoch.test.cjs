const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pin = (file, letter = 'a') => ({ file, bytes: 8, sha256: letter.repeat(64) });
const clone = value => JSON.parse(JSON.stringify(value));
const fixtureOccurrences = (report, rows) => rows.map((row, ordinal) => ({ ...row, occurrenceId: JSON.stringify([report.file, report.bytes, report.sha256, ordinal]) }));
async function subject() {
  const url = pathToFileURL(path.resolve('scripts/p02-audit-epoch.mjs')).href;
  const mod = await import(url).catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === url) return {};
    throw error;
  });
  assert.equal(typeof mod.snapshotEpochContext, 'function', 'P02 epoch context implementation required');
  assert.equal(typeof mod.validateEpoch, 'function', 'P02 epoch validation implementation required');
  return mod;
}

function evidence() {
  const root = process.cwd();
  const files = [pin('entry.js'), pin('tests/proof.test.cjs'), pin('eslint.security.config.mjs'), pin('package.json'), pin('package-lock.json'), pin('gitleaks.audit.toml')].sort((a, b) => a.file.localeCompare(b.file));
  const node = pin(process.execPath, 'b');
  const tools = ['npm', 'eslint', 'gitleaks'].map((id, i) => ({ id, ...pin(path.join(root, 'tools', id), String(i + 1)) }));
  const context = {
    schemaVersion: 1, root, scannerInputs: files, gitleaksDirInputs: files,
    provenanceInputs: files, node, tools,
    gitState: { head: 'a'.repeat(40), refs: [{ ref: 'refs/heads/fixture', object: 'a'.repeat(40) }] },
  };
  const originals = Array.from({ length: 82 }, (_, i) => `original-${i}`);
  const later = Array.from({ length: 62 }, (_, i) => `later-${i}`);
  const historical = { anchors: [pin('historical/baseline.json'), pin('historical/ledger.json'), pin('historical/later.json')],
    originalReportPin: pin('historical/ledger.json'), laterReportPin: pin('historical/later.json'), originalRows: originals, laterRows: later };
  const ids = ['npm', 'eslint', 'gitleaks-dir', 'gitleaks-git'];
  const reports = ids.map(id => ({ id, pin: pin(`run/${id}.json`), data: id === 'npm'
    ? { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } }
    : id === 'eslint' ? ['entry.js', 'eslint.security.config.mjs'].map(file => ({ filePath: path.join(root, file), messages: [], errorCount: 0, warningCount: 0, fatalErrorCount: 0 })) : [] }));
  const results = ids.map(id => {
    const tool = tools.find(row => row.id === (id.startsWith('gitleaks') ? 'gitleaks' : id));
    return { id, status: 'pass', count: 0, exitCode: 0, command: id.startsWith('gitleaks') ? tool.file : process.execPath,
      args: id === 'npm' ? [tool.file, 'audit', '--json', '--include=dev', '--ignore-scripts', '--registry=https://registry.npmjs.org', `--cache=${path.join(root, 'run', 'npm-cache')}`, '--fetch-retries=0', '--fetch-timeout=30000']
        : id === 'eslint' ? [tool.file, '--config', 'eslint.security.config.mjs', '--no-inline-config', '--max-warnings=0', '--format=json', ...files.filter(row => /\.(?:js|mjs)$/.test(row.file)).map(row => row.file)]
          : [id === 'gitleaks-dir' ? 'dir' : 'git', root, '--config', path.join(root, 'gitleaks.audit.toml'), '--redact=100', '--report-format=json', '--report-path=-', '--exit-code=42', '--timeout=110', '--no-banner', '--no-color', '--ignore-gitleaks-allow', ...(id === 'gitleaks-git' ? ['--log-opts=--all'] : [])],
      cwd: root, executablePins: id.startsWith('gitleaks') ? [clone(tool)] : [clone(node), clone(tool)], configurationPins: id === 'npm' ? [pin('package.json'), pin('package-lock.json')] : [pin(id === 'eslint' ? 'eslint.security.config.mjs' : 'gitleaks.audit.toml')],
      versions: id === 'npm' ? { npm: '12.2.0', node: '24.19.0' } : id === 'eslint' ? { eslint: '10.12.0', 'eslint-plugin-security': '4.2.0', 'eslint-plugin-no-unsanitized': '4.1.5' } : { gitleaks: '8.30.1' } };
  });
  const receipts = ['coverage', 'generation', 'typecheck', 'candidate', 'regression', 'counterexample'].map(kind => ({
    id: kind, kind, pin: pin(`receipts/${kind}.json`), contextSha256: hash(context),
    result: { exitCode: 0, failed: 0, cancelled: 0, skipped: 0, passed: 1 },
  }));
  const continuity = [ ...fixtureOccurrences(historical.originalReportPin, originals.map(id => ({ source: 'original', id }))),
    ...fixtureOccurrences(historical.laterReportPin, later.map(id => ({ source: 'later', id }))) ].map(row => ({
    ...row, relation: 'not-observed', currentIds: [], rationale: 'Synthetic boundary absent from the complete fixture scan',
    sourceReferences: [pin('entry.js')], evidenceIds: ['coverage', 'counterexample', 'regression'],
  }));
  const current = { epochId: 'P02CURRENT20261022A', before: clone(context), after: clone(context),
    audit: { pin: pin('run/summary.json'), exitCode: 0, reports, summary: { inputSnapshot: { matched: true, before: clone(files), after: clone(files) }, results, catalog: [] } },
    receipts, continuity, rows: [] };
  const observed = { expectedEpochId: current.epochId, expectedEpochSha256: 'e'.repeat(64), epochPin: pin('epoch.json', 'e'),
    historicalAnchors: clone(historical.anchors), context: clone(context), summaryPin: clone(current.audit.pin),
    reportPins: reports.map(row => ({ id: row.id, ...clone(row.pin) })), receiptPins: receipts.map(row => ({ id: row.id, ...clone(row.pin) })) };
  return bindEvidence({ historical, current, observed });
}

// Hand-authored approved targets and separate execution observations; no subject helpers.
function bindEvidence(sample) {
  const { current, observed } = sample;
  const targets = [
    ...current.continuity.map(link => ({ type: 'continuity', source: link.source, id: link.id, occurrenceId: link.occurrenceId,
      relation: link.relation, currentIds: clone(link.currentIds), rationale: link.rationale, sourceReferences: clone(link.sourceReferences) })),
    ...current.rows.map(row => {
      const item = fixtureOccurrences(current.audit.pin, current.audit.summary.catalog).find(item => item.occurrenceId === row.occurrenceId);
      return { type: 'finding', id: row.id, occurrenceId: row.occurrenceId, file: row.file, sourceHash: row.sourceHash,
        line: item.line, column: item.column, rule: item.rule, boundary: row.boundary,
        ...(current.contract?.version === 2 ? { status: row.status, assessment: clone(row.assessment) } : {}) };
    }),
    ...(current.defects ?? []).map(row => ({ type: 'defect', ...clone(row) })),
  ];
  const plans = current.receipts.map(receipt => ({ id: receipt.id, kind: receipt.kind,
    invocation: { command: current.before.node.file, cwd: current.before.root,
      args: ['--test', 'tests/proof.test.cjs'] },
    files: [pin('tests/proof.test.cjs')],
    cases: [{ file: 'tests/proof.test.cjs', name: `${receipt.kind} owned path rejects foreign input`,
      inputPins: [pin('entry.js')], targets: ['coverage', 'counterexample', 'regression'].includes(receipt.kind) ? clone(targets) : [] }],
  }));
  current.evidenceScope = { pin: pin('scope.json', '6'), data: { schemaVersion: 1, contextSha256: hash(current.before), receipts: plans } };
  observed.evidenceScopePin = clone(current.evidenceScope.pin);
  observed.expectedEvidenceScopeSha256 = '6'.repeat(64);
  observed.executions = plans.map(plan => ({ id: plan.id, pin: pin(`results/${plan.id}.json`, '7'),
    data: { schemaVersion: 1, id: plan.id, contextSha256: hash(current.before), invocation: clone(plan.invocation), files: clone(plan.files),
      cases: plan.cases.map(({ targets, ...entry }) => ({ ...clone(entry), status: 'passed' })),
      result: { exitCode: 0, failed: 0, cancelled: 0, skipped: 0, passed: plan.cases.length } },
  }));
  for (const receipt of current.receipts) receipt.executionPin = clone(observed.executions.find(row => row.id === receipt.id).pin);
  return sample;
}

test('P02 synthetic complete evidence is distinct from local completion', async () => {
  const { validateEpoch } = await subject();
  const result = validateEpoch(evidence());
  assert.equal(result.integrity, true);
  assert.equal(result.currentStatus, 'EVIDENCE_READY');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unresolved, []);
  assert.equal(Object.hasOwn(result, 'localComplete'), false);
});

test('P02 missing current evidence remains a real NOT_READY with historical integrity', async () => {
  const { validateEpoch } = await subject();
  const sample = evidence(); sample.current = null;
  const result = validateEpoch(sample);
  assert.equal(result.integrity, true);
  assert.equal(result.currentStatus, 'NOT_READY');
  assert.ok(result.unresolved.includes('current-missing'));
});

const eslintFiles = sample => sample.current.audit.reports.find(row => row.id === 'eslint').data;
const eslintFileInvalid = [
  ['first requested file omitted', x => eslintFiles(x).shift()],
  ['second requested file omitted', x => eslintFiles(x).pop()],
  ['duplicate extra record', x => eslintFiles(x).push(clone(eslintFiles(x)[0]))],
  ['duplicate replacing a requested file', x => eslintFiles(x)[1] = clone(eslintFiles(x)[0])],
  ['unexpected extra file', x => eslintFiles(x).push({ ...clone(eslintFiles(x)[0]), filePath: path.join(process.cwd(), 'unrequested.js') })],
  ['unrequested replacement with equal count', x => eslintFiles(x)[1].filePath = path.join(process.cwd(), 'unrequested.js')],
  ['non-JavaScript context file substituted', x => eslintFiles(x)[1].filePath = path.join(process.cwd(), 'package.json')],
  ['missing filePath', x => delete eslintFiles(x)[0].filePath],
  ['empty filePath', x => eslintFiles(x)[0].filePath = ''],
  ['null filePath', x => eslintFiles(x)[0].filePath = null],
  ['nonstring filePath', x => eslintFiles(x)[0].filePath = 7],
  ['relative filePath', x => eslintFiles(x)[0].filePath = 'entry.js'],
  ['outside-root filePath', x => eslintFiles(x)[0].filePath = path.resolve(process.cwd(), '..', 'entry.js')],
  ['sibling with root prefix', x => eslintFiles(x)[0].filePath = path.join(process.cwd() + '-other', 'entry.js')],
  ['dot alias', x => eslintFiles(x)[0].filePath = process.cwd() + path.sep + '.' + path.sep + 'entry.js'],
  ['traversal alias ending inside root', x => eslintFiles(x)[0].filePath = process.cwd() + path.sep + 'child' + path.sep + '..' + path.sep + 'entry.js'],
  ['repeated separator alias', x => eslintFiles(x)[0].filePath = process.cwd() + path.sep + path.sep + 'entry.js'],
  ['NUL path', x => eslintFiles(x)[0].filePath += '\0'],
  ['drive-relative path', x => eslintFiles(x)[0].filePath = 'C:entry.js'],
  ['file URL', x => eslintFiles(x)[0].filePath = pathToFileURL(eslintFiles(x)[0].filePath).href],
  ['case alias', x => eslintFiles(x)[0].filePath = path.join(process.cwd(), 'ENTRY.js')],
  ['alternate data stream', x => eslintFiles(x)[0].filePath += ':stream'],
  ['duplicate normalized slash identities', x => eslintFiles(x)[1].filePath = eslintFiles(x)[0].filePath.split(path.sep).join('/')],
];
for (const [name, mutate] of eslintFileInvalid) test(`P02 ESLint files rejects ${name}`, async () => {
  const { validateEpoch } = await subject(); const sample = evidence(); mutate(sample);
  const checked = validateEpoch(sample);
  assert.equal(checked.currentStatus, 'NOT_READY', 'ESLint report must cover the exact requested files once');
  assert.ok(checked.errors.includes('eslint-report-files'), JSON.stringify(checked));
});

test('P02 ESLint complete file set accepts arbitrary report ordering', async () => {
  const { validateEpoch } = await subject(); const sample = evidence();
  assert.deepEqual(eslintFiles(sample).map(row => path.basename(row.filePath)), ['entry.js', 'eslint.security.config.mjs']);
  eslintFiles(sample).reverse();
  assert.equal(validateEpoch(sample).currentStatus, 'EVIDENCE_READY');
});

test('P02 ESLint canonical slash spelling retains exact owned file identity', async () => {
  const { validateEpoch } = await subject(); const sample = evidence();
  for (const row of eslintFiles(sample)) row.filePath = row.filePath.split(path.sep).join('/');
  assert.equal(validateEpoch(sample).currentStatus, 'EVIDENCE_READY');
});

const invalid = [
  ['historical bytes changed', x => x.observed.historicalAnchors[0].sha256 = 'f'.repeat(64)],
  ['partial historical evidence', x => x.observed.historicalAnchors = []],
  ['epoch expected pin absent', x => delete x.observed.expectedEpochSha256],
  ['epoch expected pin differs', x => x.observed.expectedEpochSha256 = 'f'.repeat(64)],
  ['new eligible public document', x => x.observed.context.gitleaksDirInputs.push(pin('PLANS.md'))],
  ['deleted eligible input', x => x.observed.context.gitleaksDirInputs.pop()],
  ['changed eligible input', x => x.observed.context.gitleaksDirInputs[0].sha256 = 'f'.repeat(64)],
  ['changed scanner input', x => x.current.after.scannerInputs.pop()],
  ['changed refs', x => x.observed.context.gitState.head = 'b'.repeat(40)],
  ['duplicate source row', x => x.current.continuity.push(clone(x.current.continuity[0]))],
  ['lost source row', x => x.current.continuity.pop()],
  ['unknown source relation', x => x.current.continuity[0].relation = 'unclassified'],
  ['counterexample evidence missing', x => x.current.receipts = x.current.receipts.filter(r => r.kind !== 'counterexample')],
  ['old-context evidence', x => x.current.receipts[0].contextSha256 = 'f'.repeat(64)],
  ['failed prerequisite', x => x.current.receipts[0].result.exitCode = 1],
  ['skipped prerequisite', x => x.current.receipts[0].result.skipped = 1],
  ['self acceptance receipt', x => x.current.receipts[0].kind = 'live'],
  ['tool omitted', x => x.current.audit.summary.results.pop()],
  ['single-tool substitute', x => x.current.audit.summary.results = x.current.audit.summary.results.slice(1, 2)],
  ['tool report differs', x => x.observed.reportPins[0].sha256 = 'f'.repeat(64)],
  ['tool error exit', x => x.current.audit.summary.results[0].exitCode = 2],
  ['tool interrupted', x => x.current.audit.summary.results[0].exitCode = null],
  ['ESLint required flags absent', x => x.current.audit.summary.results[1].args = ['fixture']],
  ['summary catalog invented', x => x.current.audit.summary.catalog.push({ id: 'invented' })],
  ['unproven current observation', x => x.current.rows.push({ id: 'new', status: 'guarded-boundary' })],
];
for (const [name, mutate] of invalid) test(`P02 rejects ${name}`, async () => {
  const { validateEpoch } = await subject(); const sample = evidence(); mutate(sample);
  const result = validateEpoch(sample);
  assert.equal(result.currentStatus, 'NOT_READY');
  assert.ok(result.errors.length + result.unresolved.length > 0);
});

function guardedEvidence(count = 1) {
  const sample = evidence(), rule = 'security/detect-non-literal-fs-filename';
  const messages = Array.from({ length: count }, (_, i) => ({ ruleId: rule, line: i + 1, column: 1, severity: 1, message: 'fixture boundary' }));
  const report = sample.current.audit.reports.find(row => row.id === 'eslint');
  Object.assign(report.data[0], { messages, warningCount: count });
  Object.assign(sample.current.audit.summary.results.find(row => row.id === 'eslint'), { status: 'findings', count, exitCode: 1 });
  sample.current.audit.exitCode = 1;
  sample.current.audit.summary.catalog = messages.map(message => ({ id: `eslint:entry.js:${message.line}:1:${rule}`, tool: 'eslint', status: 'open', file: 'entry.js', line: message.line, column: 1, rule, toolSeverity: 1, message: message.message }));
  sample.current.rows = fixtureOccurrences(sample.current.audit.pin, sample.current.audit.summary.catalog).map(row => ({ id: row.id, occurrenceId: row.occurrenceId, status: 'guarded-boundary', file: row.file, sourceHash: 'a'.repeat(64), boundary: 'Synthetic owned capability checks precede the primitive', evidenceIds: ['coverage', 'counterexample', 'regression'] }));
  sample.current.continuity[0].currentIds = sample.current.rows.map(row => row.occurrenceId);
  sample.current.continuity[0].relation = count === 1 ? 'moved' : 'split';
  return bindEvidence(sample);
}

function repeatedHistorical() {
  const sample = evidence(), links = sample.current.continuity.filter(row => row.source === 'later');
  sample.historical.laterRows[61] = sample.historical.laterRows[60];
  links[61].id = links[60].id;
  return bindEvidence(sample);
}
function repeatedCurrent() {
  const sample = guardedEvidence(2), report = sample.current.audit.reports.find(row => row.id === 'eslint');
  report.data[0].messages[1] = clone(report.data[0].messages[0]);
  sample.current.audit.summary.catalog[1] = clone(sample.current.audit.summary.catalog[0]);
  sample.current.rows[1].id = sample.current.rows[0].id;
  return bindEvidence(sample);
}
test('A3 preserves all62 historical occurrences with61 scanner IDs', async () => {
  const { validateEpoch } = await subject(), sample = repeatedHistorical();
  assert.equal(sample.historical.laterRows.length, 62); assert.equal(new Set(sample.historical.laterRows).size, 61);
  assert.equal(validateEpoch(sample).currentStatus, 'EVIDENCE_READY');
});
test('A3 preserves repeated current findings as separate occurrences', async () => {
  const { validateEpoch } = await subject(), sample = repeatedCurrent();
  assert.equal(sample.current.rows.length, 2); assert.equal(sample.current.rows[0].id, sample.current.rows[1].id);
  assert.equal(validateEpoch(sample).currentStatus, 'EVIDENCE_READY');
});
const occurrenceInvalid = [
  ['missing historical duplicate', x => x.current.continuity.pop()],
  ['substituted historical occurrence', x => x.current.continuity.at(-1).occurrenceId = x.current.continuity.at(-2).occurrenceId],
  ['unanchored source report', x => x.historical.laterReportPin = pin('unknown-report.json')],
  ['duplicate current occurrence', x => x.current.rows[1].occurrenceId = x.current.rows[0].occurrenceId],
  ['wrong occurrence scanner ID', x => x.current.rows[1].id = 'substituted-id'],
];
for (const [name, mutate] of occurrenceInvalid) test(`A3 occurrence rejects ${name}`, async () => {
  const { validateEpoch } = await subject(), sample = repeatedCurrent();
  const later = sample.current.continuity.filter(row => row.source === 'later');
  sample.historical.laterRows[61] = sample.historical.laterRows[60]; later[61].id = later[60].id; bindEvidence(sample);
  assert.equal(validateEpoch(sample).currentStatus, 'EVIDENCE_READY');
  mutate(sample); assert.equal(validateEpoch(sample).currentStatus, 'NOT_READY');
});

for (const field of ['errorCount', 'warningCount']) test(`P02 ESLint consistency rejects hidden ${field} in a complete report`, async () => {
  const { validateEpoch } = await subject(); const sample = evidence();
  eslintFiles(sample)[0][field] = 1;
  const checked = validateEpoch(sample);
  assert.equal(checked.currentStatus, 'NOT_READY', 'Complete file coverage cannot hide a declared finding');
  assert.ok(checked.errors.includes('tool-result:eslint'), JSON.stringify(checked));
});

test('P02 ESLint consistency rejects findings with incompatible raw success exit', async () => {
  const { validateEpoch } = await subject(); const sample = guardedEvidence();
  sample.current.audit.summary.results.find(row => row.id === 'eslint').exitCode = 0;
  const checked = validateEpoch(sample);
  assert.equal(checked.currentStatus, 'NOT_READY', 'Pinned findings require the fixed-command finding exit');
  assert.ok(checked.errors.includes('tool-result:eslint'), JSON.stringify(checked));
});

test('P02 guarded evidence requires current source and counterexample receipts, not old seven-row allowance', async () => {
  const { validateEpoch } = await subject(); const sample = guardedEvidence();
  assert.equal(validateEpoch(sample).currentStatus, 'EVIDENCE_READY');
  sample.current.rows[0].sourceHash = 'f'.repeat(64);
  assert.equal(validateEpoch(sample).currentStatus, 'NOT_READY');
});

test('P02 split and merge keep source rows unique while allowing multiple relation edges', async () => {
  const { validateEpoch } = await subject(); const split = guardedEvidence(2);
  assert.equal(validateEpoch(split).currentStatus, 'EVIDENCE_READY');
  const merge = guardedEvidence();
  Object.assign(merge.current.continuity[0], { relation: 'merge' });
  Object.assign(merge.current.continuity[1], { relation: 'merge', currentIds: clone(merge.current.continuity[0].currentIds) });
  bindEvidence(merge);
  assert.equal(validateEpoch(merge).currentStatus, 'EVIDENCE_READY');
});

const receiptPlan = (sample, id) => sample.current.evidenceScope.data.receipts.find(row => row.id === id);
const execution = (sample, id) => sample.observed.executions.find(row => row.id === id).data;
const i1Invalid = [
  ['generic PASS without execution pin', x => delete x.current.receipts[0].executionPin],
  ['approved scope absent', x => delete x.current.evidenceScope],
  ['external scope authority absent', x => delete x.observed.expectedEvidenceScopeSha256],
  ['external scope pin differs', x => x.observed.expectedEvidenceScopeSha256 = 'f'.repeat(64)],
  ['physical scope pin differs', x => x.observed.evidenceScopePin.sha256 = 'f'.repeat(64)],
  ['scope context differs', x => x.current.evidenceScope.data.contextSha256 = 'f'.repeat(64)],
  ['unrelated finding evidence', x => {
    const target = receiptPlan(x, 'counterexample').cases[0].targets.find(row => row.type === 'finding'); target.id = 'another-finding';
  }],
  ['different boundary evidence', x => {
    const target = receiptPlan(x, 'counterexample').cases[0].targets.find(row => row.type === 'finding'); target.boundary = 'another boundary';
  }],
  ['historical relation not exercised', x => {
    receiptPlan(x, 'regression').cases[0].targets = receiptPlan(x, 'regression').cases[0].targets.filter(row => row.type !== 'continuity' || row.id !== 'original-0');
  }],
  ['current row coverage omitted', x => {
    receiptPlan(x, 'coverage').cases[0].targets = receiptPlan(x, 'coverage').cases[0].targets.filter(row => row.type !== 'finding');
  }],
  ['required case absent from results', x => execution(x, 'counterexample').cases = []],
  ['required case failed', x => execution(x, 'counterexample').cases[0].status = 'failed'],
  ['required case cancelled', x => execution(x, 'counterexample').cases[0].status = 'cancelled'],
  ['required case skipped', x => execution(x, 'counterexample').cases[0].status = 'skipped'],
  ['another named case passed', x => execution(x, 'counterexample').cases[0].name = 'unrelated pass'],
  ['another case file passed', x => execution(x, 'counterexample').cases[0].file = 'entry.js'],
  ['case input differs', x => execution(x, 'counterexample').cases[0].inputPins[0].sha256 = 'f'.repeat(64)],
  ['empty exercised input', x => {
    receiptPlan(x, 'counterexample').cases[0].inputPins = []; execution(x, 'counterexample').cases[0].inputPins = [];
  }],
  ['case source absent from context', x => {
    receiptPlan(x, 'counterexample').cases[0].inputPins = [pin('unapproved.js')]; execution(x, 'counterexample').cases[0].inputPins = [pin('unapproved.js')];
  }],
  ['required file omitted by runner', x => execution(x, 'regression').files = []],
  ['required extra file absent from runner', x => receiptPlan(x, 'regression').files.push(pin('entry.js'))],
  ['filtered execution command', x => execution(x, 'regression').invocation.args.push('--test-name-pattern=unrelated')],
  ['execution result pin differs', x => x.observed.executions[0].pin.sha256 = 'f'.repeat(64)],
  ['execution result absent', x => x.observed.executions.pop()],
  ['execution context differs', x => execution(x, 'counterexample').contextSha256 = 'f'.repeat(64)],
  ['receipt and execution counts differ', x => execution(x, 'regression').result.passed = 100],
  ['actual required run failed', x => execution(x, 'regression').result.exitCode = 1],
  ['duplicate observed case', x => execution(x, 'regression').cases.push(clone(execution(x, 'regression').cases[0]))],
  ['duplicate approved receipt', x => x.current.evidenceScope.data.receipts.push(clone(receiptPlan(x, 'coverage')))],
  ['unapproved receipt kind', x => receiptPlan(x, 'counterexample').kind = 'coverage'],
];
for (const [name, mutate] of i1Invalid) test(`P02 I1 rejects ${name}`, async () => {
  const { validateEpoch } = await subject(); const sample = guardedEvidence(); mutate(sample);
  const result = validateEpoch(sample);
  assert.equal(result.currentStatus, 'NOT_READY', 'I1 missing target/case/scope binding must not qualify');
  assert.ok(result.errors.length + result.unresolved.length > 0);
});

test('P02 I1 accepts explicitly shared passing cases covering every declared target', async () => {
  const { validateEpoch } = await subject(); const sample = guardedEvidence(2);
  assert.equal(sample.current.continuity.length, 144);
  assert.equal(receiptPlan(sample, 'coverage').cases[0].targets.length, 146);
  assert.equal(validateEpoch(sample).currentStatus, 'EVIDENCE_READY');
  assert.equal(Object.hasOwn(validateEpoch(sample), 'localComplete'), false);
});

test('P02 observed warning cannot be called remediated merely by copying an old disposition', async () => {
  const { validateEpoch } = await subject(); const sample = guardedEvidence();
  sample.current.rows[0].status = 'remediated';
  assert.equal(validateEpoch(sample).currentStatus, 'NOT_READY');
});

test('P02 preserves raw Gitleaks 42 and aggregate findings 1 without accepting an unproven row', async () => {
  const { validateEpoch } = await subject(); const sample = evidence();
  const report = sample.current.audit.reports.find(row => row.id === 'gitleaks-dir');
  report.data = [{ RuleID: 'fixture-rule', File: 'entry.js', StartLine: 1 }];
  const result = sample.current.audit.summary.results.find(row => row.id === 'gitleaks-dir');
  Object.assign(result, { status: 'findings', count: 1, exitCode: 42 });
  sample.current.audit.exitCode = 1;
  sample.current.audit.summary.catalog = [{ id: 'gitleaks-dir:entry.js:1:fixture-rule:', tool: 'gitleaks-dir', status: 'open', file: 'entry.js', line: 1, rule: 'fixture-rule' }];
  const checked = validateEpoch(sample);
  assert.equal(checked.currentStatus, 'NOT_READY');
  assert.equal(checked.errors.some(code => code.startsWith('tool-result:')), false);
  assert.ok(checked.unresolved.length > 0);
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p02-epoch-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [file, text] of Object.entries({
    'package.json': '{}', 'package-lock.json': '{}', 'gitleaks.audit.toml': 'title = "synthetic"',
    'entry.js': 'void 0;', 'PLANS.md': 'original', 'docs/note.md': 'note', 'styles/main.css': 'body {}',
    'index.html': '<html></html>', 'assets/image.bin': 'binary-fixture', 'src/entry.ts': 'export {};',
    'tests/input.cjs': 'void 0;', 'tools/npm': 'npm fixture', 'tools/eslint': 'eslint fixture',
    'tools/gitleaks': 'gitleaks fixture', 'node-fixture': 'Node fixture', 'output/private.txt': 'excluded',
  })) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), text); }
  return { root, options: { execPath: path.join(root, 'node-fixture'), toolPaths: { npm: 'tools/npm', eslint: 'tools/eslint', gitleaks: 'tools/gitleaks' },
    gitState: { head: 'a'.repeat(40), refs: [{ ref: 'refs/heads/fixture', object: 'a'.repeat(40) }] } } };
}

test('P02 context includes public documents/assets and detects publication with the same source list', async t => {
  const { snapshotEpochContext } = await subject(); const { root, options } = await fixture(t);
  await fs.mkdir(path.join(root,'extension'));
  await fs.writeFile(path.join(root,'extension/manifest.json'),'{}');
  const before = await snapshotEpochContext(root, options);
  assert.ok(before.provenanceInputs.some(row=>row.file==='extension/manifest.json'));
  for (const file of ['PLANS.md', 'docs/note.md', 'styles/main.css', 'index.html', 'assets/image.bin', 'src/entry.ts']) assert.ok(before.gitleaksDirInputs.some(row => row.file === file), file);
  assert.equal(before.gitleaksDirInputs.some(row => row.file.startsWith('output/')), false);
  await fs.writeFile(path.join(root, 'PLANS.md'), 'published');
  const after = await snapshotEpochContext(root, options);
  assert.deepEqual(before.scannerInputs, after.scannerInputs);
  assert.notDeepEqual(before.gitleaksDirInputs, after.gitleaksDirInputs);
});

test('P02 context rejects an unowned tool path and a symlinked eligible child', async t => {
  const { snapshotEpochContext } = await subject(); const { root, options } = await fixture(t);
  await assert.rejects(snapshotEpochContext(root, { ...options, toolPaths: { ...options.toolPaths, eslint: '../foreign' } }));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'p02-foreign-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(snapshotEpochContext(root, options), error => error.code === 'p02-context-link' || error.code === 'owned-path-link');
});

test('P02 context rejects invalid caller Git state instead of querying a process', async t => {
  const { snapshotEpochContext } = await subject(); const { root, options } = await fixture(t);
  await assert.rejects(snapshotEpochContext(root, { ...options, gitState: { head: null, refs: [] } }));
});

function v2Evidence(rule = 'security/detect-object-injection') {
  const sample = guardedEvidence(), { current, observed } = sample;
  const report = current.audit.reports.find(row => row.id === 'eslint');
  report.data[0].messages[0].ruleId = rule;
  const item = current.audit.summary.catalog[0];
  item.rule = rule; item.id = `eslint:entry.js:1:1:${rule}`;
  current.rows[0].id = item.id;
  current.contract = { version: 2, pin: pin('approved-contract.md', '9') };
  observed.expectedContract = clone(current.contract);
  const directories = { eslint: 'node_modules/eslint', npm: 'output/npm/package' };
  const packages = Object.entries(directories).map(([id, directory]) => ({ id, directory,
    manifest: { pin: pin(`${directory}/package.json`), data: { name: id, bin: { [id]: 'bin/cli.js' } } } }));
  for (const tool of current.before.tools.filter(row => row.id !== 'gitleaks')) tool.file = path.join(current.before.root, directories[tool.id], 'bin/cli.js');
  for (const entry of current.audit.summary.results.filter(row => ['npm', 'eslint'].includes(row.id))) {
    const tool = current.before.tools.find(row => row.id === entry.id);
    entry.args[0] = tool.file; entry.executablePins[1] = clone(tool);
  }
  const runtime = { platform: process.platform, arch: process.arch, nodeOptions: '', nodePath: '', packages,
    roots: ['node_modules', directories.npm].map(directory => ({ directory, files: packages.filter(pkg => pkg.directory.startsWith(directory)).flatMap(pkg =>
      [clone(pkg.manifest.pin), { ...pinValueForTest(current.before.tools.find(row => row.id === pkg.id)), file: `${pkg.directory}/bin/cli.js` }]) })) };
  for (const context of [current.after, observed.context]) context.tools = clone(current.before.tools);
  for (const context of [current.before, current.after, observed.context]) Object.assign(context, { schemaVersion: 2, runtime: clone(runtime) });
  for (const receipt of current.receipts) receipt.contextSha256 = hash(current.before);
  Object.assign(current.rows[0], { status: 'not-applicable', assessment: {
    contract: 'Read a closed fixture array within its literal bound', premise: 'Untrusted key selects an object property',
    domain: 'Only the literal fixture and its local index; no caller arguments or aliases',
    sourceReferences: [pin('entry.js')], limits: 'This synthetic fixture only', reopen: 'Any caller, alias, key or source change',
  } });
  current.defects = [{ id: 'fixture-fixed-defect', status: 'remediated', contract: 'Fixture must reject foreign input',
    priorFailure: pin('failures/new-defect-red.json'), sourceReferences: [pin('entry.js')],
    evidenceIds: ['coverage', 'counterexample', 'regression'] }];
  observed.failurePins = [clone(current.defects[0].priorFailure)];
  current.audit.summary.generatedAt = '2026-11-01T00:00:00.000Z';
  bindEvidence(sample);
  current.assessmentPin = pin('independent-assessment.json', '8');
  observed.expectedAssessmentSha256 = current.assessmentPin.sha256;
  observed.assessment = { pin: clone(current.assessmentPin), data: {
    contract: clone(current.contract), contextSha256: hash(current.before), author: 'fixture-author', reviewer: 'independent-reviewer',
    auditGeneratedAt: current.audit.summary.generatedAt, unresolvedIssues: [], rows: clone(current.rows), defects: clone(current.defects), continuity: clone(current.continuity),
  } };
  return sample;
}
const pinValueForTest = ({ file, bytes, sha256 }) => ({ file, bytes, sha256 });

for (const field of ['head', 'ref.object']) {
  test(`P02 Git ${field} bounded hex language at snapshot and saved epoch entrypoints`, { timeout: 15000 }, async t => {
    const { snapshotEpochContext, validateEpoch } = await subject();
    const { root, options } = await fixture(t);
    const setValue = (git, value) => { if (field === 'head') git.head = value; else git.refs[0].object = value; };
    const cases = [0, 1, 39, 40, 41, 63, 64, 65].map(length => [`length ${length}`, 'a'.repeat(length), length === 40 || length === 64]);
    for (const length of [40, 64]) {
      cases.push([`${length} full hex alphabet`, '0123456789abcdef'.repeat(4).slice(0, length), true]);
      for (const char of ['A', 'g', '/', ':', '\n', 'é']) {
        for (const index of new Set([0, 39, 40, length - 1].filter(index => index < length))) {
          const value = 'a'.repeat(index) + char + 'a'.repeat(length - index - 1);
          cases.push([`${length} char ${JSON.stringify(char)} at ${index}`, value, false]);
        }
      }
      for (const suffix of ['\n', '\r', '\r\n', '\u2028', '\u2029', '\0', ' ', 'a']) cases.push([`${length} suffix ${JSON.stringify(suffix)}`, 'a'.repeat(length) + suffix, false]);
    }
    for (const value of [null, undefined, 40, ['a'.repeat(40)], new String('a'.repeat(40)),
      { toString() { throw new Error('Git hash must not coerce objects'); } },
      'ａ'.repeat(40), 'é'.repeat(40), 'a'.repeat(8 * 1024 * 1024), 'a'.repeat(8 * 1024 * 1024) + '!']) {
      cases.push(['non-string, non-hex or long near-match', value, false]);
    }
    for (const [label, value, accepted] of cases) {
      const gitState = clone(options.gitState); setValue(gitState, value);
      if (accepted) {
        assert.deepEqual((await snapshotEpochContext(root, { ...options, gitState })).gitState, gitState, label);
        const sample = v2Evidence();
        for (const context of [sample.current.before, sample.current.after, sample.observed.context]) context.gitState = clone(gitState);
        for (const receipt of sample.current.receipts) receipt.contextSha256 = hash(sample.current.before);
        bindEvidence(sample);
        sample.observed.assessment.data.contextSha256 = hash(sample.current.before);
        assert.equal(validateEpoch(sample).currentStatus, 'EVIDENCE_READY', label);
      } else {
        await assert.rejects(snapshotEpochContext(root, { ...options, gitState }), { code: 'p02-context-options' }, label);
        const sample = v2Evidence();
        // Equal contexts isolate Git validation from the separate context-mismatch gate.
        for (const context of [sample.current.before, sample.current.after, sample.observed.context]) context.gitState = gitState;
        const result = validateEpoch(sample);
        assert.equal(result.currentStatus, 'NOT_READY', label);
        assert.ok(result.errors.includes('current-context'), label);
      }
    }
  });
}

for (const rule of ['security/detect-object-injection', 'security/detect-unsafe-regex', 'security/detect-non-literal-fs-filename']) {
  test(`P02 v2 accepts independently bound ${rule} evidence only for a fixed snapshot`, async () => {
    const sample = v2Evidence(rule), result = (await subject()).validateEpoch(sample);
    assert.equal(result.currentStatus, 'EVIDENCE_READY', JSON.stringify(result));
    assert.equal(result.evaluationScope, 'FIXED_SNAPSHOT');
    assert.equal(result.liveApplicability, 'NOT_ASSESSED');
    assert.equal(result.semanticCompleteness, 'EXTERNAL_REVIEW_REQUIRED');
    assert.equal(Object.hasOwn(result, 'localComplete'), false);
    assert.equal(sample.current.audit.exitCode, 1);
  });
}

const v2Invalid = [
  ['missing approval', x => delete x.observed.expectedContract],
  ['contract substitution', x => x.current.contract.pin.sha256 = 'f'.repeat(64)],
  ['version downgrade', x => delete x.current.contract],
  ['unknown version', x => { x.current.contract.version = 3; x.observed.expectedContract.version = 3; }],
  ['missing independent assessment', x => delete x.observed.assessment],
  ['unapproved assessment', x => delete x.observed.expectedAssessmentSha256],
  ['missing audit observation time', x => delete x.observed.assessment.data.auditGeneratedAt],
  ['invalid audit observation time', x => { x.observed.assessment.data.auditGeneratedAt = '2026-02-30T00:00:00.000Z'; x.current.audit.summary.generatedAt = x.observed.assessment.data.auditGeneratedAt; }],
  ['audit observation time substitution', x => x.observed.assessment.data.auditGeneratedAt = '2026-11-02T00:00:00.000Z'],
  ['self review', x => x.observed.assessment.data.reviewer = 'fixture-author'],
  ['open review issue', x => x.observed.assessment.data.unresolvedIssues.push('missing caller')],
  ['omitted known defect', x => { x.current.defects = []; bindEvidence(x); }],
  ['open known defect', x => { x.current.defects[0].status = 'open'; x.observed.assessment.data.defects = clone(x.current.defects); bindEvidence(x); }],
  ['unbound old failure', x => { x.current.defects[0].priorFailure = pin('invented.json'); x.observed.assessment.data.defects = clone(x.current.defects); bindEvidence(x); }],
  ['changed disposition with old proof', x => { x.current.rows[0].status = 'guarded-boundary'; x.observed.assessment.data.rows = clone(x.current.rows); }],
  ['changed caller premise with old proof', x => { x.current.rows[0].assessment.domain = 'External callers'; x.observed.assessment.data.rows = clone(x.current.rows); }],
  ['remediation used for an existing warning', x => { x.current.rows[0].status = 'remediated'; x.observed.assessment.data.rows = clone(x.current.rows); bindEvidence(x); }],
  ['caller bytes not in proof', x => { x.current.rows[0].assessment.sourceReferences.push(pin('package.json')); x.observed.assessment.data.rows = clone(x.current.rows); bindEvidence(x); }],
  ['missing dependencies', x => { for (const c of [x.current.before, x.current.after, x.observed.context]) delete c.runtime; }],
  ['npm package omitted', x => { for (const c of [x.current.before, x.current.after, x.observed.context]) c.runtime.roots.pop(); }],
  ['npm bin-only inventory', x => { for (const c of [x.current.before, x.current.after, x.observed.context]) {
    const root = c.runtime.roots[1]; root.directory += '/bin'; root.files = root.files.filter(row => row.file.endsWith('/cli.js'));
  } }],
  ['external loader', x => { for (const c of [x.current.before, x.current.after, x.observed.context]) c.runtime.nodeOptions = '--import=foreign'; }],
  ['dependency drift', x => x.observed.context.runtime.roots[0].files[0].sha256 = 'f'.repeat(64)],
];
test('P02 required tool version keys cannot be replaced by unrelated JSON properties', async () => {
  const { validateEpoch } = await subject();
  for (const [id, keys] of [['npm', ['npm', 'node']], ['eslint', ['eslint', 'eslint-plugin-security', 'eslint-plugin-no-unsanitized']], ['gitleaks-dir', ['gitleaks']], ['gitleaks-git', ['gitleaks']]]) {
    for (const key of keys) for (const value of [undefined, '', ' \t', null, 1, true, {}]) {
      const sample = v2Evidence(), versions = sample.current.audit.summary.results.find(row => row.id === id).versions;
      versions.unrelated = 'present';
      Object.defineProperty(versions, '__proto__', { value: { [key]: 'present' }, enumerable: true });
      assert.equal(validateEpoch(clone(sample)).currentStatus, 'EVIDENCE_READY');
      if (value === undefined) delete versions[key]; else versions[key] = value;
      const result = validateEpoch(clone(sample));
      assert.equal(result.currentStatus, 'NOT_READY', `${id}/${key}/${String(value)}`);
      assert.deepEqual(result.errors, [`tool-versions:${id}`]);
      assert.deepEqual(result.unresolved, []);
    }
  }
});

test('P02 required assessment keys reject empty or substituted values with fresh evidence bindings', async () => {
  const { validateEpoch } = await subject();
  for (const key of ['contract', 'premise', 'domain', 'limits', 'reopen']) {
    for (const value of [undefined, '', ' \t', null, 1, true, {}]) {
      const sample = v2Evidence(), assessment = sample.current.rows[0].assessment;
      const bind = () => { sample.observed.assessment.data.rows = clone(sample.current.rows); bindEvidence(sample); };
      assessment.unrelated = 'present';
      Object.defineProperty(assessment, '__proto__', { value: { [key]: 'present' }, enumerable: true });
      bind();
      assert.equal(validateEpoch(clone(sample)).currentStatus, 'EVIDENCE_READY');
      if (value === undefined) delete assessment[key]; else assessment[key] = value;
      bind();
      const result = validateEpoch(clone(sample));
      assert.equal(result.currentStatus, 'NOT_READY', `${key}/${String(value)}`);
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.unresolved, ['current-row-evidence']);
    }
  }
});

for (const [name, mutate] of v2Invalid) test(`P02 v2 rejects ${name}`, async () => {
  const { validateEpoch } = await subject(), sample = v2Evidence();
  assert.equal(validateEpoch(sample).currentStatus, 'EVIDENCE_READY');
  mutate(sample);
  assert.equal(validateEpoch(sample).currentStatus, 'NOT_READY');
});

test('P02 v2 inventory detects dependency bytes without expanding scanner or Gitleaks scope', async t => {
  const { snapshotEpochContext } = await subject(), { root, options } = await fixture(t);
  await fs.mkdir(path.join(root, 'node_modules/pkg'), { recursive: true });
  await fs.writeFile(path.join(root, 'node_modules/pkg/index.js'), 'original dependency');
  options.runtimePackages = { eslint: 'node_modules/eslint', npm: 'output/npm/package' };
  for (const [id, directory] of Object.entries(options.runtimePackages)) {
    await fs.mkdir(path.join(root, directory, 'bin'), { recursive: true });
    await fs.writeFile(path.join(root, directory, 'package.json'), JSON.stringify({ name: id, bin: { [id]: './bin/cli.js' } }));
    await fs.writeFile(path.join(root, directory, 'bin/cli.js'), `${id} fixture`);
    options.toolPaths[id] = `${directory}/bin/cli.js`;
  }
  const before = await snapshotEpochContext(root, options);
  assert.equal(before.schemaVersion, 2);
  await fs.writeFile(path.join(root, 'node_modules/pkg/index.js'), 'modified dependency');
  const after = await snapshotEpochContext(root, options);
  assert.notDeepEqual(before.runtime, after.runtime);
  assert.deepEqual(before.scannerInputs, after.scannerInputs);
  assert.deepEqual(before.gitleaksDirInputs, after.gitleaksDirInputs);
  await fs.writeFile(path.join(root, options.runtimePackages.npm, 'dependency.js'), 'npm internal code');
  const npmChanged = await snapshotEpochContext(root, options);
  assert.notDeepEqual(after.runtime, npmChanged.runtime);
  assert.deepEqual(after.gitleaksDirInputs, npmChanged.gitleaksDirInputs);
  await assert.rejects(snapshotEpochContext(root, { ...options, runtimePackages: { ...options.runtimePackages, npm: 'output/npm/package/bin' } }));
  for (const bin of ['../foreign.js', '/foreign.js', 'C:/foreign.js']) {
    await fs.writeFile(path.join(root, options.runtimePackages.npm, 'package.json'), JSON.stringify({ name: 'npm', bin: { npm: bin } }));
    await assert.rejects(snapshotEpochContext(root, options), { code: 'p02-runtime-context' });
  }
});

for (const version of [undefined, null, 3]) test(`P02 rejects explicitly malformed contract version ${version}`, async () => {
  const sample = evidence();
  sample.current.contract = { version, pin: pin('contract.md') };
  sample.observed.expectedContract = clone(sample.current.contract);
  assert.equal((await subject()).validateEpoch(sample).currentStatus, 'NOT_READY');
});
