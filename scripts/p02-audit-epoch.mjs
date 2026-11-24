import path from 'node:path';
import { createHash } from 'node:crypto';
import { openOwnedRoot } from './owned-files.mjs';
import { snapshotInput, classifyReport, buildCatalog, auditExitCode } from './tool-audit.mjs';

const excludedDirectories = new Set(['node_modules', 'dist', 'dist-firefox', 'output', '.git', '.superpowers', '.playwright-cli']);
const toolIds = ['npm', 'eslint', 'gitleaks-dir', 'gitleaks-git'];
const digest = value => createHash('sha256').update(value).digest('hex');
const contextHash = value => digest(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const pinValid = value => object(value) && text(value.file) && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && hex(value.sha256);
const pinValue = ({ file, bytes, sha256 }) => ({ file, bytes, sha256 });
const pinEqual = (a, b) => pinValid(a) && pinValid(b) && same(pinValue(a), pinValue(b));
const relativeFile = file => text(file) && !file.includes('\\') && !path.posix.isAbsolute(file) && !path.win32.isAbsolute(file) && file.split('/').every(part => part && part !== '.' && part !== '..');
const unique = values => new Set(values).size === values.length;
const sortedPins = rows => rows.map(pinValue).sort((a, b) => a.file.localeCompare(b.file));
const validPins = rows => Array.isArray(rows) && rows.every(pinValid) && unique(rows.map(row => row.file));
const gitValid = value => object(value) && typeof value.head === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value.head) &&
  Array.isArray(value.refs) && value.refs.every(row => object(row) && text(row.ref) && row.ref.startsWith('refs/') && typeof row.object === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(row.object)) && unique(value.refs.map(row => row.ref));
const fault = code => Object.assign(new Error(code), { code });
const continuityTarget = link => ({ type: 'continuity', source: link.source, id: link.id, occurrenceId: link.occurrenceId, relation: link.relation,
  currentIds: link.currentIds, rationale: link.rationale, sourceReferences: link.sourceReferences });
const findingTarget = (item, row, version) => ({ type: 'finding', id: row.id, occurrenceId: row.occurrenceId, file: row.file, sourceHash: row.sourceHash,
  line: item.line, column: item.column, rule: item.rule, boundary: row.boundary,
  ...(version === 2 ? { status: row.status, assessment: row.assessment } : {}) });
const defectTarget = row => ({ type: 'defect', ...row });
const caseKey = entry => JSON.stringify([entry.file, entry.name]);
const passed = result => object(result) && result.exitCode === 0 && result.failed === 0 && result.cancelled === 0 && result.skipped === 0 && Number.isSafeInteger(result.passed) && result.passed > 0;

export function identifyOccurrences(report, rows) {
  if (!pinValid(report) || !Array.isArray(rows) || !rows.every(row => object(row) && text(row.id))) throw fault('p02-occurrences');
  return rows.map((row, ordinal) => ({ ...row, occurrenceId: JSON.stringify([report.file, report.bytes, report.sha256, ordinal]) }));
}

export async function publicAuditAbsence(root, authority = {}) {
  if (authority.P02_CURRENT_EPOCH_SHA256 !== undefined || authority.P02_EVIDENCE_SCOPE_SHA256 !== undefined) return false;
  const owned = await openOwnedRoot(root);
  for (const file of ['output/tool-audit', '.superpowers/sdd/2026-10-22-p02-current-epoch-apply-A']) {
    if (await owned.lstat(file, { optional: true })) return false;
  }
  return true;
}

async function filePin(owned, file, label = file) {
  const bytes = await owned.readFile(file);
  return { file: label, bytes: bytes.length, sha256: digest(bytes) };
}

// Caller supplies the approved Git observation; this function never starts a child.
export async function snapshotEpochContext(root, { execPath, toolPaths, gitState, runtimePackages }) {
  if (!gitValid(gitState) || !object(toolPaths) || !same(Object.keys(toolPaths).sort(), ['eslint', 'gitleaks', 'npm']) || !path.isAbsolute(execPath)) throw fault('p02-context-options');
  const owned = await openOwnedRoot(root), eligible = [];
  async function visit(relative, output = eligible, exclude = true) {
    for (const entry of await owned.readdir(relative, { withFileTypes: true })) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw fault('p02-context-link');
      if (exclude && excludedDirectories.has(entry.name)) continue;
      if (entry.isDirectory()) await visit(file, output, exclude);
      else if (entry.isFile()) output.push(await filePin(owned, file));
      else throw fault('p02-context-type');
    }
  }
  await visit('');
  eligible.sort((a, b) => a.file.localeCompare(b.file));
  const byFile = new Map(eligible.map(row => [row.file, row]));
  const scanner = await snapshotInput(owned.root);
  const scannerInputs = scanner.map(row => {
    const observed = byFile.get(row.file);
    if (!observed || observed.sha256 !== row.sha256) throw fault('p02-context-drift');
    return pinValue(observed);
  });
  const executableRoot = await openOwnedRoot(path.dirname(execPath));
  const node = await filePin(executableRoot, path.basename(execPath), path.resolve(execPath));
  const tools = [];
  for (const [id, file] of Object.entries(toolPaths).sort(([a], [b]) => a.localeCompare(b))) {
    const absolute = await owned.resolve(file, { type: 'file' });
    tools.push({ id, ...await filePin(owned, file, absolute) });
  }
  const selected = new Set(scannerInputs.map(row => row.file));
  const provenanceInputs = eligible.filter(row => selected.has(row.file) || /^(?:src|build-proof|tests)\//.test(row.file) || /^tsconfig[^/]*\.json$/.test(row.file) || ['manifest.json','extension/manifest.json'].includes(row.file));
  const context = { schemaVersion: 1, root: owned.root, scannerInputs, gitleaksDirInputs: eligible, provenanceInputs, node, tools,
    gitState: { head: gitState.head, refs: gitState.refs.map(row => ({ ref: row.ref, object: row.object })).sort((a, b) => a.ref.localeCompare(b.ref)) } };
  if (runtimePackages !== undefined) {
    if (!object(runtimePackages) || !same(Object.keys(runtimePackages).sort(), ['eslint', 'npm']) || !Object.values(runtimePackages).every(relativeFile)) throw fault('p02-runtime-packages');
    const packages = [];
    for (const [id, directory] of Object.entries(runtimePackages).sort(([a], [b]) => a.localeCompare(b))) {
      const file = `${directory}/package.json`, bytes = await owned.readFile(file);
      packages.push({ id, directory, manifest: { pin: { file, bytes: bytes.length, sha256: digest(bytes) }, data: JSON.parse(bytes.toString('utf8')) } });
    }
    const runtimeRoots = ['node_modules', ...packages.map(row => row.directory).filter(directory => !directory.startsWith('node_modules/'))];
    const roots = [];
    for (const directory of [...runtimeRoots].sort()) {
      const files = [];
      await visit(directory, files, false);
      roots.push({ directory, files: sortedPins(files) });
    }
    context.schemaVersion = 2;
    context.runtime = { platform: process.platform, arch: process.arch, nodeOptions: process.env.NODE_OPTIONS ?? '', nodePath: process.env.NODE_PATH ?? '', packages, roots };
    if (!runtimeValid(context)) throw fault('p02-runtime-context');
  }
  return context;
}

function runtimeValid(context) {
  const runtime = context.runtime;
  if (!object(runtime) || !text(runtime.platform) || !text(runtime.arch) || runtime.nodeOptions !== '' || runtime.nodePath !== '' ||
      !Array.isArray(runtime.roots) || !runtime.roots.some(row => row.directory === 'node_modules') || !unique(runtime.roots.map(row => row.directory))) return false;
  if (!runtime.roots.every(row => relativeFile(row.directory) && validPins(row.files) && row.files.length > 0 &&
      row.files.every(file => relativeFile(file.file) && file.file.startsWith(`${row.directory}/`)))) return false;
  const files = runtime.roots.flatMap(row => row.files);
  if (!unique(files.map(row => row.file)) || !Array.isArray(runtime.packages) || !same(runtime.packages.map(row => row.id).sort(), ['eslint', 'npm'])) return false;
  return runtime.packages.every(pkg => {
    const manifest = pkg.manifest, declaredBin = typeof manifest?.data?.bin === 'string' ? manifest.data.bin : manifest?.data?.bin?.[pkg.id];
    const bin = typeof declaredBin === 'string' ? declaredBin.replace(/^\.\//, '') : declaredBin;
    const tool = context.tools.find(row => row.id === pkg.id);
    return relativeFile(pkg.directory) && relativeFile(bin) && manifest?.data?.name === pkg.id && manifest.pin?.file === `${pkg.directory}/package.json` &&
      files.some(file => pinEqual(file, manifest.pin)) && runtime.roots.some(root => root.directory === pkg.directory || root.directory === 'node_modules' && pkg.directory.startsWith('node_modules/')) &&
      tool?.file === path.resolve(context.root, pkg.directory, bin) && files.some(file => pinEqual({ ...file, file: path.resolve(context.root, file.file) }, tool));
  });
}

function contextValid(context) {
  if (!object(context) || ![1, 2].includes(context.schemaVersion) || !text(context.root) || !path.isAbsolute(context.root) || !pinValid(context.node) || !path.isAbsolute(context.node.file) || !gitValid(context.gitState)) return false;
  for (const rows of [context.scannerInputs, context.gitleaksDirInputs, context.provenanceInputs]) {
    if (!validPins(rows) || rows.some(row => !relativeFile(row.file))) return false;
  }
  if (!Array.isArray(context.tools) || !same(context.tools.map(row => row.id).sort(), ['eslint', 'gitleaks', 'npm']) || !context.tools.every(row => pinValid(row) && path.isAbsolute(row.file))) return false;
  const full = new Map(context.gitleaksDirInputs.map(row => [row.file, row]));
  return [...context.scannerInputs, ...context.provenanceInputs].every(row => pinEqual(row, full.get(row.file))) && (context.schemaVersion === 1 || runtimeValid(context));
}

// Inputs are parsed, byte-verified observations supplied by the owned-file caller.
// EVIDENCE_READY is not the result of the live test, local completion, or permission.
export function validateEpoch({ historical, current, observed } = {}) {
  const errors = [], unresolved = [];
  const version = observed?.expectedContract?.version ?? current?.contract?.version ?? 1;
  let integrity = false;
  const result = () => ({ integrity, currentStatus: integrity && errors.length === 0 && unresolved.length === 0 ? 'EVIDENCE_READY' : 'NOT_READY', unresolved, errors,
    ...(version === 2 ? { evaluationScope: 'FIXED_SNAPSHOT', liveApplicability: 'NOT_ASSESSED', semanticCompleteness: 'EXTERNAL_REVIEW_REQUIRED' } : {}) });
  try {
    if (!object(historical) || !object(observed) || !validPins(historical.anchors) || historical.anchors.length === 0 || !validPins(observed.historicalAnchors) || !same(sortedPins(historical.anchors), sortedPins(observed.historicalAnchors))) errors.push('historical-anchors');
    else integrity = true;
    if (!Array.isArray(historical?.originalRows) || historical.originalRows.length !== 82 || !historical.originalRows.every(text) ||
        !Array.isArray(historical?.laterRows) || historical.laterRows.length !== 62 || !historical.laterRows.every(text) ||
        ![historical.originalReportPin, historical.laterReportPin].every(pin => pinValid(pin) && historical.anchors?.some(anchor => pinEqual(pin, anchor)))) {
      errors.push('historical-row-identity'); integrity = false;
    }
    if (!current) { unresolved.push('current-missing'); return result(); }
    if (![1, 2].includes(version) || (current.contract !== undefined || observed.expectedContract !== undefined) &&
        (![1, 2].includes(current.contract?.version) || !same(current.contract, observed.expectedContract) || !pinValid(current.contract?.pin))) errors.push('contract-authority');
    if (version === 2 && current.before?.schemaVersion !== 2) errors.push('v2-runtime-required');
    if (!object(current) || !text(observed.expectedEpochId) || current.epochId !== observed.expectedEpochId || !hex(observed.expectedEpochSha256) || !pinValid(observed.epochPin) || observed.epochPin.sha256 !== observed.expectedEpochSha256) errors.push('epoch-authority');
    if (![current.before, current.after, observed.context].every(contextValid) || !same(current.before, current.after) || !same(current.before, observed.context)) {
      errors.push('current-context'); return result();
    }
    const context = current.before, inputHash = contextHash(context);
    const full = new Map(context.gitleaksDirInputs.map(row => [row.file, row]));
    const tools = new Map(context.tools.map(row => [row.id, row]));
    const eslintInputs = context.scannerInputs.filter(row => /\.(?:js|mjs)$/.test(row.file)).map(row => row.file);
    const audit = current.audit, summary = audit?.summary;
    const namedPinsMatch = (expected, actual) => Array.isArray(expected) && Array.isArray(actual) && unique(expected.map(row => row.id)) && unique(actual.map(row => row.id)) && expected.length === actual.length && expected.every(row => pinEqual(row.pin ?? row, actual.find(item => item.id === row.id)));
    if (!object(audit) || !object(summary) || !pinEqual(audit.pin, observed.summaryPin)) { errors.push('audit-summary-pin'); return result(); }
    const project = rows => Array.isArray(rows) ? rows.map(({ file, sha256 }) => ({ file, sha256 })) : null;
    if (summary.inputSnapshot?.matched !== true || !same(project(summary.inputSnapshot.before), project(context.scannerInputs)) || !same(project(summary.inputSnapshot.after), project(context.scannerInputs))) errors.push('audit-snapshot');
    if (!Array.isArray(summary.results) || !same(summary.results.map(row => row.id).sort(), [...toolIds].sort()) || !Array.isArray(audit.reports) || !same(audit.reports.map(row => row.id).sort(), [...toolIds].sort()) || !namedPinsMatch(audit.reports, observed.reportPins)) { errors.push('audit-tools'); return result(); }
    const classified = [];
    for (const entry of summary.results) {
      const tool = entry.id.startsWith('gitleaks') ? 'gitleaks' : entry.id;
      const source = audit.reports.find(row => row.id === entry.id);
      const assessed = classifyReport(tool, JSON.stringify(source.data), entry.exitCode);
      if (assessed.status === 'error' || assessed.status !== entry.status || assessed.count !== entry.count) errors.push(`tool-result:${entry.id}`);
      if (version === 2 && tool !== 'eslint' && assessed.status !== 'pass') unresolved.push(`tool-findings:${entry.id}`);
      if (tool === 'eslint') {
        const requested = eslintInputs.map(file => path.resolve(context.root, file));
        const reported = Array.isArray(source.data) ? source.data.map(row => {
          const file = row?.filePath;
          if (!text(file) || !path.isAbsolute(file) || file.includes('\0')) return null;
          const canonical = path.normalize(file);
          // Reject aliases before comparing identity; ESLint emits canonical absolute paths.
          if (file !== canonical && file !== canonical.split(path.sep).join('/')) return null;
          return canonical;
        }) : [];
        if (!reported.every(text) || !unique(reported) || !same([...reported].sort(), [...requested].sort())) {
          errors.push('eslint-report-files'); return result();
        }
      }
      classified.push({ id: entry.id, ...assessed });
      const selected = tools.get(tool);
      const expectedExecutables = tool === 'gitleaks' ? [selected] : [context.node, selected];
      if (entry.cwd !== context.root || entry.command !== (tool === 'gitleaks' ? selected.file : context.node.file) || !validPins(entry.executablePins) || entry.executablePins.length !== expectedExecutables.length || !expectedExecutables.every(row => entry.executablePins.some(item => pinEqual(row, item))) || !Array.isArray(entry.args) || !entry.args.every(value => typeof value === 'string') || !object(entry.versions) || Object.keys(entry.versions).length === 0) errors.push(`tool-invocation:${entry.id}`);
      const expectedArgs = tool === 'npm'
        ? [selected.file, 'audit', '--json', '--include=dev', '--ignore-scripts', '--registry=https://registry.npmjs.org', `--cache=${path.join(context.root, path.posix.dirname(audit.pin.file), 'npm-cache')}`, '--fetch-retries=0', '--fetch-timeout=30000']
        : tool === 'eslint'
          ? [selected.file, '--config', 'eslint.security.config.mjs', '--no-inline-config', '--max-warnings=0', '--format=json', ...eslintInputs]
          : [entry.id === 'gitleaks-dir' ? 'dir' : 'git', context.root, '--config', path.join(context.root, 'gitleaks.audit.toml'), '--redact=100', '--report-format=json', '--report-path=-', '--exit-code=42', '--timeout=110', '--no-banner', '--no-color', '--ignore-gitleaks-allow', ...(entry.id === 'gitleaks-git' ? ['--log-opts=--all'] : [])];
      if (!same(entry.args, expectedArgs)) errors.push(`tool-arguments:${entry.id}`);
      const versionKeys = tool === 'npm' ? ['npm', 'node'] : tool === 'eslint' ? ['eslint', 'eslint-plugin-security', 'eslint-plugin-no-unsanitized'] : ['gitleaks'];
      if (!versionKeys.every(key => text(entry.versions?.[key]))) errors.push(`tool-versions:${entry.id}`);
      if (path.posix.dirname(source.pin.file) !== path.posix.dirname(audit.pin.file)) errors.push(`tool-run-root:${entry.id}`);
      const configs = tool === 'npm' ? ['package.json', 'package-lock.json'] : [tool === 'eslint' ? 'eslint.security.config.mjs' : 'gitleaks.audit.toml'];
      if (!validPins(entry.configurationPins) || entry.configurationPins.length !== configs.length || !configs.every(file => pinEqual(full.get(file), entry.configurationPins.find(row => row.file === file)))) errors.push(`tool-config:${entry.id}`);
    }
    const catalog = buildCatalog(classified);
    if (!same(catalog, summary.catalog)) errors.push('audit-catalog');
    const occurrences = identifyOccurrences(audit.pin, catalog);
    if (audit.exitCode !== auditExitCode(summary.results, true)) errors.push('audit-exit');

    if (!Array.isArray(current.receipts) || !namedPinsMatch(current.receipts, observed.receiptPins)) { errors.push('receipt-pins'); return result(); }
    // Approval of the expected scope is external to both the epoch and run results.
    const scope = current.evidenceScope;
    if (!object(scope) || !pinEqual(scope.pin, observed.evidenceScopePin) || !hex(observed.expectedEvidenceScopeSha256) || scope.pin.sha256 !== observed.expectedEvidenceScopeSha256 ||
        scope.data?.schemaVersion !== 1 || scope.data.contextSha256 !== inputHash || !Array.isArray(scope.data.receipts) ||
        !same(scope.data.receipts.map(row => row.id).sort(), current.receipts.map(row => row.id).sort()) || !unique(scope.data.receipts.map(row => row.id))) {
      errors.push('receipt-approved-scope'); return result();
    }
    if (!Array.isArray(observed.executions) || !namedPinsMatch(current.receipts.map(row => ({ id: row.id, pin: row.executionPin })), observed.executions.map(row => ({ id: row.id, ...row.pin })))) {
      errors.push('receipt-execution-pins'); return result();
    }
    const targets = new Set([
      ...(current.continuity ?? []).map(link => JSON.stringify(continuityTarget(link))),
      ...(current.rows ?? []).map(row => JSON.stringify(findingTarget(occurrences.find(item => item.occurrenceId === row.occurrenceId), row, version))),
      ...(version === 2 ? (current.defects ?? []).map(row => JSON.stringify(defectTarget(row))) : []),
    ]);
    const currentPins = rows => validPins(rows) && rows.length > 0 && rows.every(row => pinEqual(row, full.get(row.file)));
    const receipts = new Map();
    for (const receipt of current.receipts) {
      if (!text(receipt.id) || receipts.has(receipt.id) || !pinValid(receipt.pin) || receipt.contextSha256 !== inputHash || !['coverage', 'generation', 'typecheck', 'candidate', 'regression', 'counterexample'].includes(receipt.kind) || !object(receipt.result) || receipt.result.exitCode !== 0 || receipt.result.failed !== 0 || receipt.result.cancelled !== 0 || receipt.result.skipped !== 0 || !Number.isSafeInteger(receipt.result.passed) || receipt.result.passed < 1) errors.push('receipt-evidence');
      const expected = scope.data.receipts.find(row => row.id === receipt.id);
      const execution = observed.executions.find(row => row.id === receipt.id)?.data;
      if (expected.kind !== receipt.kind || !object(expected.invocation) || expected.invocation.command !== context.node.file || expected.invocation.cwd !== context.root ||
          !Array.isArray(expected.invocation.args) || expected.invocation.args.length === 0 || !expected.invocation.args.every(text) || !currentPins(expected.files) ||
          !Array.isArray(expected.cases) || expected.cases.length === 0 || !unique(expected.cases.map(caseKey)) ||
          !expected.cases.every(entry => relativeFile(entry.file) && expected.files.some(row => row.file === entry.file) && text(entry.name) && currentPins(entry.inputPins) &&
            Array.isArray(entry.targets) && unique(entry.targets.map(value => JSON.stringify(value))) && entry.targets.every(value => targets.has(JSON.stringify(value)))) ||
          !object(execution) || execution.schemaVersion !== 1 || execution.id !== receipt.id || execution.contextSha256 !== inputHash ||
          !same(execution.invocation, expected.invocation) || !validPins(execution.files) || !same(sortedPins(execution.files), sortedPins(expected.files)) ||
          !Array.isArray(execution.cases) || execution.cases.length !== expected.cases.length || !unique(execution.cases.map(caseKey)) ||
          !expected.cases.every(entry => {
            const actual = execution.cases.find(value => caseKey(value) === caseKey(entry));
            return actual?.status === 'passed' && same(actual.inputPins, entry.inputPins);
          }) || !passed(execution.result) || execution.result.passed !== execution.cases.length || !same(execution.result, receipt.result)) {
        errors.push(`receipt-case-scope:${receipt.id}`); continue;
      }
      receipts.set(receipt.id, { ...receipt, cases: expected.cases });
    }
    for (const kind of ['coverage', 'generation', 'typecheck', 'candidate', 'regression', 'counterexample']) if (!current.receipts.some(row => row.kind === kind)) unresolved.push(`receipt-missing:${kind}`);
    const proof = (ids, target, sources) => Array.isArray(ids) && ids.length > 0 && unique(ids) && ids.every(id => receipts.has(id)) && validPins(sources) && sources.length > 0 &&
      ['coverage', 'counterexample', 'regression'].every(kind => ids.some(id => {
        const receipt = receipts.get(id);
        return receipt.kind === kind && receipt.cases.some(entry => entry.targets.some(value => same(value, target)) && sources.every(source => entry.inputPins.some(row => pinEqual(row, source))));
      }));
    if (version === 2) {
      // The owned-file caller supplies independently reviewed, byte-verified scope;
      // exact binding cannot prove the semantic completeness of that review.
      const assessment = observed.assessment, review = assessment?.data;
      if (!pinEqual(current.assessmentPin, assessment?.pin) || !hex(observed.expectedAssessmentSha256) || current.assessmentPin.sha256 !== observed.expectedAssessmentSha256 ||
          !object(review) || !same(review.contract, current.contract) || review.contextSha256 !== inputHash || !text(review.author) || !text(review.reviewer) || review.author === review.reviewer ||
          !text(summary.generatedAt) || !Number.isFinite(Date.parse(summary.generatedAt)) || new Date(summary.generatedAt).toISOString() !== summary.generatedAt || review.auditGeneratedAt !== summary.generatedAt ||
          !same(review.unresolvedIssues, []) || !same(review.rows, current.rows) || !same(review.continuity, current.continuity) || !same(review.defects, current.defects)) errors.push('independent-assessment');
      if (!Array.isArray(current.defects) || !unique(current.defects.map(row => row.id))) unresolved.push('known-defect-coverage');
      else for (const row of current.defects) {
        if (!text(row.id) || row.status !== 'remediated' || !text(row.contract) || !validPins(observed.failurePins) || !observed.failurePins.some(anchor => pinEqual(anchor, row.priorFailure)) ||
            !currentPins(row.sourceReferences) || !proof(row.evidenceIds, defectTarget(row), row.sourceReferences)) unresolved.push('known-defect-evidence');
      }
    }
    const identities = new Map([
      ...identifyOccurrences(historical.originalReportPin, historical.originalRows.map(id => ({ id }))).map(row => [`original:${row.occurrenceId}`, row.id]),
      ...identifyOccurrences(historical.laterReportPin, historical.laterRows.map(id => ({ id }))).map(row => [`later:${row.occurrenceId}`, row.id]),
    ]);
    const currentIds = new Set(occurrences.map(row => row.occurrenceId)), seen = new Set(), related = new Set();
    if (!Array.isArray(current.continuity)) { errors.push('continuity-missing'); return result(); }
    for (const link of current.continuity) {
      const key = `${link.source}:${link.occurrenceId}`;
      if (!identities.has(key) || identities.get(key) !== link.id || seen.has(key)) errors.push('continuity-identity');
      seen.add(key);
      if (!['same', 'moved', 'split', 'merge', 'not-observed'].includes(link.relation) || !text(link.rationale) || !Array.isArray(link.currentIds) || !unique(link.currentIds) || !link.currentIds.every(id => currentIds.has(id)) || !proof(link.evidenceIds, continuityTarget(link), link.sourceReferences) || !validPins(link.sourceReferences) || link.sourceReferences.length === 0 || !link.sourceReferences.every(row => pinEqual(row, full.get(row.file)))) unresolved.push('continuity-evidence');
      if (link.relation === 'not-observed' && link.currentIds.length !== 0 || ['same', 'moved', 'merge'].includes(link.relation) && link.currentIds.length !== 1 || link.relation === 'split' && link.currentIds.length < 2) unresolved.push('continuity-relation');
      for (const id of link.currentIds) related.add(id);
    }
    if (seen.size !== identities.size || [...identities.keys()].some(key => !seen.has(key))) errors.push('continuity-coverage');
    if (!Array.isArray(current.rows) || !unique(current.rows.map(row => row.occurrenceId)) || current.rows.length !== occurrences.length) { unresolved.push('current-row-coverage'); return result(); }
    for (const item of occurrences) {
      const row = current.rows.find(value => value.occurrenceId === item.occurrenceId);
      const assessment = row?.assessment;
      const disposition = version === 2
        ? ['guarded-boundary', 'not-applicable'].includes(row?.status) && ['security/detect-non-literal-fs-filename', 'security/detect-object-injection', 'security/detect-unsafe-regex'].includes(item.rule) &&
          object(assessment) && ['contract', 'premise', 'domain', 'limits', 'reopen'].every(key => text(assessment[key])) && currentPins(assessment.sourceReferences) && assessment.sourceReferences.some(source => source.file === row.file)
        : row?.status === 'guarded-boundary' && item.rule === 'security/detect-non-literal-fs-filename';
      if (!row || row.id !== item.id || !disposition || item.tool !== 'eslint' || row.file !== item.file || full.get(row.file)?.sha256 !== row.sourceHash || !text(row.boundary) || !proof(row.evidenceIds, findingTarget(item, row, version), version === 2 ? assessment?.sourceReferences : [full.get(row.file)]) || !related.has(item.occurrenceId) && row.origin !== 'new') unresolved.push('current-row-evidence');
    }
    return result();
  } catch {
    errors.push('invalid-epoch-shape');
    return result();
  }
}
