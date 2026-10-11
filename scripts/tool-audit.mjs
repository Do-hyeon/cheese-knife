import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { openOwnedRoot } from './owned-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failure = reason => ({ status: 'error', count: null, reason });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// An exit status alone is insufficient: require the matching report contract too.
export function classifyReport(tool, text, exitCode) {
  let report;
  try { report = JSON.parse(text); } catch { return failure('missing-or-invalid-json'); }
  if (!Number.isInteger(exitCode)) return failure('process-interrupted-or-unavailable');
  if (tool === 'npm') {
    const count = report?.metadata?.vulnerabilities?.total;
    if (report?.error || report?.auditReportVersion !== 2 || !object(report.vulnerabilities) ||
        !Number.isSafeInteger(count) || count < 0 || count !== Object.keys(report.vulnerabilities).length || ![0, 1].includes(exitCode) ||
        (count === 0 && (exitCode !== 0 || Object.keys(report.vulnerabilities).length !== 0))) return failure('invalid-npm-report-or-exit');
    return { status: count ? 'findings' : 'pass', count, report };
  }
  if (!Array.isArray(report)) return failure('invalid-report-shape');
  if (tool === 'eslint') {
    if (!report.length || ![0, 1].includes(exitCode) || report.some(file => !object(file) ||
        !Array.isArray(file.messages) || !Number.isSafeInteger(file.errorCount) || !Number.isSafeInteger(file.warningCount) ||
        file.fatalErrorCount > 0 || file.messages.some(message => message.fatal || typeof message.ruleId !== 'string'))) return failure('eslint-incomplete-or-parse-error');
    const retained = report.map(({ filePath, messages, errorCount, warningCount, fatalErrorCount }) => ({ filePath, messages, errorCount, warningCount, fatalErrorCount }));
    const count = retained.reduce((sum, file) => sum + file.messages.length, 0);
    if (count === 0 && exitCode !== 0) return failure('eslint-nonzero-without-findings');
    return { status: count ? 'findings' : 'pass', count, report: retained };
  }
  if (tool === 'gitleaks') {
    if ((report.length === 0 && exitCode !== 0) || (report.length > 0 && exitCode !== 42) ||
        report.some(item => !object(item) || !Object.hasOwn(item, 'RuleID') || !Object.hasOwn(item, 'File') || !Object.hasOwn(item, 'StartLine') ||
          typeof item.RuleID !== 'string' || typeof item.File !== 'string' || !Number.isSafeInteger(item.StartLine))) return failure('gitleaks-incomplete-or-failed');
    // Do not retain Secret, Match, author identity, email or commit messages, even
    // if a future tool version changes the effect of --redact on JSON reports.
    const retained = report.map(item => {
      const { RuleID, File, StartLine, EndLine, StartColumn, EndColumn, Commit, Fingerprint } = item;
      return Object.fromEntries([
        ['RuleID', RuleID], ['File', File], ['StartLine', StartLine],
        ...(Object.hasOwn(item, 'EndLine') ? [['EndLine', EndLine]] : []),
        ...(Object.hasOwn(item, 'StartColumn') ? [['StartColumn', StartColumn]] : []),
        ...(Object.hasOwn(item, 'EndColumn') ? [['EndColumn', EndColumn]] : []),
        ...(Object.hasOwn(item, 'Commit') ? [['Commit', Commit]] : []),
        ...(Object.hasOwn(item, 'Fingerprint') ? [['Fingerprint', Fingerprint]] : []),
      ]);
    });
    return { status: retained.length ? 'findings' : 'pass', count: retained.length, report: retained };
  }
  return failure('unsupported-tool');
}

export async function sourceFiles(directory) {
  const owned = await openOwnedRoot(directory);
  const files = [];
  async function visit(relative) {
    for (const entry of await owned.readdir(relative, { withFileTypes: true })) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && (relative || ['web', 'scripts'].includes(entry.name))) {
        if (relative || ['web', 'scripts'].includes(entry.name)) await visit(file);
      } else if (entry.isFile() && /\.(?:js|mjs)$/.test(file) && !/^scripts\/(?:hls-hardening|vendor-hls)\.mjs$/.test(file)) files.push(file);
    }
  }
  await visit('');
  return files.sort();
}

// Records tool observations only. No row is automatically accepted, suppressed
// or called a confirmed vulnerability based on a heuristic scanner warning.
export function buildCatalog(results) {
  const rows = [];
  for (const result of results) {
    if (result.status === 'error') {
      rows.push({ id: result.id, tool: result.id, status: 'check-failed', reason: result.reason });
    } else if (result.id === 'npm' && result.report) {
      for (const [name, item] of Object.entries(result.report.vulnerabilities)) rows.push({
        id: `npm:${name}`, tool: 'npm', package: name, status: 'open', toolSeverity: item.severity,
        affectedNodes: item.nodes || [],
        inheritedFrom: (item.via || []).filter(value => typeof value === 'string'),
        advisories: (item.via || []).filter(object).map(({ title, url, range }) => ({ title, url, affectedRange: range })),
        toolSuggestedFix: item.fixAvailable,
      });
    } else if (result.id === 'eslint' && result.report) {
      for (const item of result.report) for (const message of item.messages) {
        const file = path.relative(root, item.filePath).split(path.sep).join('/');
        rows.push({ id: `eslint:${file}:${message.line}:${message.column}:${message.ruleId}`,
          tool: 'eslint', status: 'open', file, line: message.line, column: message.column,
          rule: message.ruleId, toolSeverity: message.severity, message: message.message });
      }
    } else if (result.id.startsWith('gitleaks-') && result.report) {
      for (const item of result.report) rows.push({
        id: `${result.id}:${item.File}:${item.StartLine}:${item.RuleID}:${item.Commit || ''}`,
        tool: result.id, status: 'open', file: item.File, line: item.StartLine, rule: item.RuleID, commit: item.Commit,
      });
    }
  }
  return rows;
}

export async function snapshotInput(directory) {
  const owned = await openOwnedRoot(directory);
  const files = [...new Set([...(await sourceFiles(directory)), 'package.json', 'package-lock.json', 'gitleaks.audit.toml'])].sort();
  return Promise.all(files.map(async file => ({ file,
    sha256: createHash('sha256').update(await owned.readFile(file)).digest('hex'),
  })));
}

export function auditExitCode(results, stableInputs) {
  if (!results.length || !stableInputs || results.some(result => result.status === 'error')) return 2;
  return results.some(result => result.status === 'findings') ? 1 : 0;
}

export function runTool(command, args, { cwd = root, timeout = 120000 } = {}) {
  return new Promise(resolve => {
    let stdout = '', settled = false, interrupted = false;
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { interrupted = true; child.kill(); }, timeout);
    const finish = exitCode => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ stdout, exitCode: interrupted ? null : exitCode });
    };
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 64 * 1024 * 1024) { interrupted = true; child.kill(); }
    });
    // Keep arbitrary tool logs (potential secret excerpts) out of terminal and reports.
    child.stderr.resume();
    child.once('error', () => finish(null));
    child.once('close', code => finish(code));
  });
}

export async function openAuditRun(directory, prefix) {
  if (typeof prefix !== 'string' || !/^run-[A-Za-z0-9-]+-$/.test(prefix)) throw Object.assign(new Error('audit-run-prefix-invalid'), { code: 'audit-run-prefix-invalid' });
  const owned = await openOwnedRoot(directory);
  const outputRelative = 'output/tool-audit';
  await owned.ensureDirectory(outputRelative);
  const runDirectory = await owned.makeTempDirectory(`${outputRelative}/${prefix}`);
  const runRelative = path.relative(owned.root, runDirectory).split(path.sep).join('/');
  return { owned, outputRelative, runDirectory, runRelative };
}

async function packageVersion(owned, name) {
  return JSON.parse(await owned.readFile(`node_modules/${name}/package.json`, 'utf8')).version;
}

async function main() {
  const only = process.argv[2]?.replace(/^--only=/, '');
  if (process.argv.length > 3 || (only && !['npm', 'eslint', 'gitleaks'].includes(only))) throw new Error('Usage: node scripts/tool-audit.mjs [--only=npm|eslint|gitleaks]');
  const { owned, outputRelative, runDirectory, runRelative } = await openAuditRun(root, `run-${new Date().toISOString().replace(/[:.]/g, '-')}-`);
  const results = [];
  const reports = new Map();
  const before = await snapshotInput(root);
  const source = before.filter(item => /\.(?:js|mjs)$/.test(item.file)).map(item => item.file);
  async function collect(id, tool, command, args, versions) {
    const execution = await runTool(command, args);
    const assessed = classifyReport(tool, execution.stdout, execution.exitCode);
    const { report, ...summary } = assessed;
    if (report) {
      reports.set(id, report);
      await owned.writeFile(`${runRelative}/${id}.json`, JSON.stringify(report, null, 2) + '\n');
    }
    results.push({ id, ...summary, exitCode: execution.exitCode, versions });
    console.log(`${id}: ${summary.status}${summary.count === null ? '' : ` (${summary.count})`}`);
  }
  if (!only || only === 'npm') {
    const npmCli = process.env.TOOL_AUDIT_NPM_CLI || process.env.npm_execpath ||
      await owned.resolve(`${outputRelative}/tools/npm-12.2.0/package/bin/npm-cli.js`, { type: 'file', optional: true });
    if (!npmCli) results.push({ id: 'npm', ...failure('npm-cli-unavailable') });
    else {
    const npmVersion = await runTool(process.execPath, [npmCli, '--version'], { timeout: 10000 });
    if (npmVersion.exitCode !== 0) results.push({ id: 'npm', ...failure('npm-cli-unavailable') });
    else await collect('npm', 'npm', process.execPath, [npmCli, 'audit', '--json', '--include=dev', '--ignore-scripts', '--registry=https://registry.npmjs.org', `--cache=${path.join(runDirectory, 'npm-cache')}`, '--fetch-retries=0', '--fetch-timeout=30000'], { npm: npmVersion.stdout.trim(), node: process.versions.node });
    }
  }
  if (!only || only === 'eslint') {
    const versionEntries = [];
    try {
      for (const name of ['eslint', 'eslint-plugin-security', 'eslint-plugin-no-unsanitized']) versionEntries.push([name, await packageVersion(owned, name)]);
      const versions = Object.fromEntries(versionEntries);
      const eslintCli = await owned.resolve('node_modules/eslint/bin/eslint.js', { type: 'file' });
      await collect('eslint', 'eslint', process.execPath, [eslintCli, '--config', 'eslint.security.config.mjs', '--no-inline-config', '--max-warnings=0', '--format=json', ...source], versions);
    } catch { results.push({ id: 'eslint', ...failure('tool-dependency-unavailable') }); }
  }
  if (!only || only === 'gitleaks') {
    const defaultGitleaks = `${outputRelative}/tools/gitleaks-8.30.1/${process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks'}`;
    const executable = process.env.TOOL_AUDIT_GITLEAKS || await owned.resolve(defaultGitleaks, { type: 'file', optional: true });
    if (!executable) results.push({ id: 'gitleaks', ...failure('pinned-gitleaks-unavailable') });
    else {
    const version = await runTool(executable, ['version']);
    if (version.exitCode !== 0 || version.stdout.trim() !== '8.30.1') results.push({ id: 'gitleaks', ...failure('pinned-gitleaks-unavailable') });
    else {
      const gitleaksConfig = await owned.resolve('gitleaks.audit.toml', { type: 'file' });
      for (const mode of ['dir', 'git']) {
        await collect(`gitleaks-${mode}`, 'gitleaks', executable, [mode, root,
          '--config', gitleaksConfig, '--redact=100', '--report-format=json', '--report-path=-',
          '--exit-code=42', '--timeout=110', '--no-banner', '--no-color', '--ignore-gitleaks-allow',
          ...(mode === 'git' ? ['--log-opts=--all'] : [])], { gitleaks: '8.30.1' });
      }
    }
    }
  }
  const after = await snapshotInput(root);
  const stableInputs = JSON.stringify(before) === JSON.stringify(after);
  if (!stableInputs) results.push({ id: 'input-snapshot', ...failure('covered-inputs-changed-between-snapshots') });
  const metadata = {
    startedFor: 'scanner-reports-only; not a complete security certification',
    generatedAt: new Date().toISOString(),
    staticSourceFiles: source,
    inputSnapshot: { scope: 'owned static sources, package manifests/lockfile and scanner configuration', before, after, matched: stableInputs },
    catalog: buildCatalog(results.map(result => ({ ...result, report: reports.get(result.id) }))),
    staticExclusions: ['vendor/**', 'node_modules/**', 'tests/**', 'dist/**', 'dist-firefox/**', 'output/**', 'scripts/hls-hardening.mjs', 'scripts/vendor-hls.mjs'],
    limitations: ['No validation of the previously blocked HLS candidate.', 'Dependency advisories do not analyze locally patched vendored code.', 'Static pattern warnings are not automatically confirmed vulnerabilities.', 'No exploit reproduction or model security scan is performed.'],
    results,
  };
  await owned.writeFile(`${runRelative}/summary.json`, JSON.stringify(metadata, null, 2) + '\n');
  console.log(`Reports: ${runDirectory}`);
  process.exitCode = auditExitCode(results, stableInputs);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  console.error('Tool audit could not complete; do not treat this as a clean result.');
  process.exitCode = 2;
});
