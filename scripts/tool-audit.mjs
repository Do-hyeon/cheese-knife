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
  if(tool==='actionlint'){
    if(exitCode!==(report.length?1:0)||report.some(item=>!object(item)||
      !['message','kind','filepath'].every(key=>typeof Reflect.get(item,key)==='string'&&Reflect.get(item,key).length>0)||
      !['line','column','end_column'].every(key=>Number.isSafeInteger(Reflect.get(item,key))&&Reflect.get(item,key)>0)||item.end_column<item.column))return failure('actionlint-incomplete-or-failed');
    return {status:report.length?'findings':'pass',count:report.length,report:report.map(({message,kind,filepath,line,column,end_column})=>({message,kind,filepath,line,column,end_column}))};
  }
  if (tool === 'eslint') {
    if (!report.length || ![0, 1].includes(exitCode)) return failure('eslint-incomplete-or-parse-error');
    for (const file of report) {
      if (!object(file) || typeof file.filePath !== 'string' || !file.filePath.trim() || !Array.isArray(file.messages) ||
          ![file.errorCount, file.warningCount, file.fatalErrorCount].every(value => Number.isSafeInteger(value) && value >= 0) ||
          file.fatalErrorCount !== 0) return failure('eslint-incomplete-or-parse-error');
      let errors = 0, warnings = 0;
      for (const message of file.messages) {
        if (!object(message) || typeof message.ruleId !== 'string' || !message.ruleId || ![1, 2].includes(message.severity) ||
            message.fatal !== undefined && message.fatal !== false) return failure('eslint-incomplete-or-parse-error');
        if (message.severity === 2) errors++;
        else warnings++;
      }
      if (errors !== file.errorCount || warnings !== file.warningCount) return failure('eslint-message-count-mismatch');
    }
    const retained = report.map(({ filePath, messages, errorCount, warningCount, fatalErrorCount }) => ({ filePath, messages, errorCount, warningCount, fatalErrorCount }));
    const count = retained.reduce((sum, file) => sum + file.messages.length, 0);
    // The fixed invocation uses --max-warnings=0, so either severity requires exit 1.
    if (exitCode !== (count ? 1 : 0)) return failure('eslint-report-exit-mismatch');
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
      if (file === 'extension/vendor') continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && (relative || ['extension', 'web', 'scripts'].includes(entry.name))) {
        if (relative || ['extension', 'web', 'scripts'].includes(entry.name)) await visit(file);
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
    } else if(result.id==='actionlint'&&result.report){
      for(const item of result.report)rows.push({id:`actionlint:${item.filepath}:${item.line}:${item.column}:${item.kind}`,tool:'actionlint',status:'open',file:item.filepath,line:item.line,column:item.column,endColumn:item.end_column,rule:item.kind,message:item.message});
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
  const config=[];for(const name of ['.github/actionlint.yaml','.github/actionlint.yml'])if(await owned.lstat(name,{optional:true}))config.push(name);
  const files = [...new Set([...(await sourceFiles(directory)),...(await workflowFiles(owned)),...config, 'package.json', 'package-lock.json', 'gitleaks.audit.toml'])].sort();
  return Promise.all(files.map(async file => ({ file,
    sha256: createHash('sha256').update(await owned.readFile(file)).digest('hex'),
  })));
}

async function workflowFiles(owned){
  if(!await owned.lstat('.github/workflows',{optional:true}))return [];
  return (await owned.readdir('.github/workflows',{withFileTypes:true})).filter(item=>item.isFile()&&/\.ya?ml$/.test(item.name)).map(item=>'.github/workflows/'+item.name).sort();
}

export async function actionlintInvocation(owned,execute=runTool){
  const executable=await owned.resolve('output/tool-audit/tools/actionlint-1.7.12/actionlint.exe',{type:'file'});
  const version=await execute(executable,['-version']);
  if(version.exitCode!==0||version.stdout.split(/\r?\n/)[0]!=='1.7.12')throw Error('pinned-actionlint-version');
  const files=await workflowFiles(owned);if(!files.length)throw Error('actionlint-workflows-missing');
  return {command:executable,args:['-shellcheck=','-pyflakes=','-format','{{json .}}',...files],versions:{actionlint:'1.7.12',sha256:createHash('sha256').update(await owned.readFile('output/tool-audit/tools/actionlint-1.7.12/actionlint.exe')).digest('hex')}};
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

export async function runAuditStages(stages) {
  const results = [];
  for (const stage of stages) {
    let result;
    try { result = await stage.run(); }
    catch (error) { result = { id: stage.id, ...failure('tool-stage-failed'), errorName: error?.name ?? 'Error', errorCode: error?.code ?? null }; }
    if (!object(result) || result.id !== stage.id || !['pass', 'findings', 'error'].includes(result.status)) result = { id: stage.id, ...failure('invalid-tool-stage-result') };
    results.push(result);
    if (result.status === 'error') break;
  }
  return results;
}

export function failedExecution(id, reason, execution) {
  const bytes = Buffer.from(execution.stdout);
  return { id, ...failure(reason), exitCode: execution.exitCode,
    failureOutput: { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } };
}

export async function runAuditCollection(run, createStages, snapshot = snapshotInput) {
  const { owned, runRelative, runDirectory } = run, reports = new Map();
  let before = null, after = null, source = [], results = [];
  const snapshotFailure = (id, error) => ({ id, ...failure('input-snapshot-unavailable'), errorCode: error?.code ?? null });
  try { before = await snapshot(owned.root); }
  catch (error) { results.push(snapshotFailure('input-snapshot-before', error)); }
  if (before !== null) {
    source = before.filter(item => /\.(?:js|mjs)$/.test(item.file)).map(item => item.file);
    try { results = await runAuditStages(await createStages({ source, reports })); }
    catch (error) { results.push({ id: 'stage-setup', ...failure('tool-stage-setup-failed'), errorCode: error?.code ?? null }); }
    try { after = await snapshot(owned.root); }
    catch (error) { results.push(snapshotFailure('input-snapshot-after', error)); }
  }
  const stableInputs = before !== null && after !== null && JSON.stringify(before) === JSON.stringify(after);
  if (before !== null && after !== null && !stableInputs) results.push({ id: 'input-snapshot', ...failure('covered-inputs-changed-between-snapshots') });
  let catalog;
  try { catalog = buildCatalog(results.map(result => ({ ...result, report: reports.get(result.id) }))); }
  catch (error) {
    catalog = [];
    results.push({ id: 'catalog', ...failure('catalog-construction-failed'), errorCode: error?.code ?? null });
  }
  const metadata = {
    startedFor: 'scanner-reports-only; not a complete security certification',
    generatedAt: new Date().toISOString(),
    staticSourceFiles: source,
    inputSnapshot: { scope: 'owned static sources, package manifests/lockfile, workflow YAML and scanner configuration', before, after, matched: stableInputs },
    catalog,
    staticExclusions: ['vendor/**', 'extension/vendor/**', 'node_modules/**', 'tests/**', 'dist/**', 'dist-firefox/**', 'output/**', 'scripts/hls-hardening.mjs', 'scripts/vendor-hls.mjs'],
    limitations: ['No validation of the previously blocked HLS candidate.', 'Dependency advisories do not analyze locally patched vendored code.', 'Static pattern warnings are not automatically confirmed vulnerabilities.', 'No exploit reproduction or model security scan is performed.'],
    results,
  };
  try { await owned.writeFile(`${runRelative}/summary.json`, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' }); }
  catch (error) { throw Object.assign(new Error('audit-summary-write-failed'), { code: 'audit-summary-write-failed', runDirectory, writeErrorCode: error?.code ?? null }); }
  return { metadata, exitCode: auditExitCode(results, stableInputs) };
}

async function main() {
  const only = process.argv[2]?.replace(/^--only=/, '');
  if (process.argv.length > 3 || (only && !['npm', 'eslint', 'gitleaks','actionlint'].includes(only))) throw new Error('Usage: node scripts/tool-audit.mjs [--only=npm|eslint|gitleaks|actionlint]');
  let run;
  try { run = await openAuditRun(root, `run-${new Date().toISOString().replace(/[:.]/g, '-')}-`); }
  catch { throw Object.assign(new Error('audit-run-create-failed'), { code: 'audit-run-create-failed' }); }
  const { owned, outputRelative, runDirectory, runRelative } = run;
  console.log(`Reports: ${runDirectory}`);
  const completed = await runAuditCollection(run, async ({ source, reports }) => {
  async function collect(id, tool, command, args, versions) {
    const executablePins = [];
    for (const file of [command, ...(['npm', 'eslint'].includes(tool) ? [args[0]] : [])]) {
      const absolute = path.resolve(root, file), executableRoot = await openOwnedRoot(path.dirname(absolute));
      const bytes = await executableRoot.readFile(path.basename(absolute));
      executablePins.push({ file: absolute, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    const configurationPins = [];
    for (const file of tool === 'npm' ? ['package.json', 'package-lock.json'] : tool === 'eslint' ? ['eslint.security.config.mjs'] : tool === 'gitleaks' ? ['gitleaks.audit.toml'] : ['.github/actionlint.yaml', '.github/actionlint.yml']) {
      if (tool === 'actionlint' && !await owned.lstat(file, { optional: true })) continue;
      const bytes = await owned.readFile(file);
      configurationPins.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    const execution = await runTool(command, args);
    const assessed = classifyReport(tool, execution.stdout, execution.exitCode);
    const { report, ...summary } = assessed;
    if (report) {
      reports.set(id, report);
      await owned.writeFile(`${runRelative}/${id}.json`, JSON.stringify(report, null, 2) + '\n');
    }
    const failed = summary.status === 'error' ? await failedExecution(id, summary.reason, execution) : {};
    console.log(`${id}: ${summary.status}${summary.count === null ? '' : ` (${summary.count})`}`);
    return { ...failed, id, ...summary, exitCode: execution.exitCode, versions, command, args, cwd: root, executablePins, configurationPins };
  }
  const stages = [];
  if (!only || only === 'npm') {
    stages.push({ id: 'npm', run: async () => {
    const npmCli = process.env.TOOL_AUDIT_NPM_CLI || process.env.npm_execpath ||
      await owned.resolve(`${outputRelative}/tools/npm-12.2.0/package/bin/npm-cli.js`, { type: 'file', optional: true });
    if (!npmCli) return { id: 'npm', ...failure('npm-cli-unavailable') };
    const npmVersion = await runTool(process.execPath, [npmCli, '--version'], { timeout: 10000 });
    if (npmVersion.exitCode !== 0) return failedExecution('npm', 'npm-cli-unavailable', npmVersion);
    return collect('npm', 'npm', process.execPath, [npmCli, 'audit', '--json', '--include=dev', '--ignore-scripts', '--registry=https://registry.npmjs.org', `--cache=${path.join(runDirectory, 'npm-cache')}`, '--fetch-retries=0', '--fetch-timeout=30000'], { npm: npmVersion.stdout.trim(), node: process.versions.node });
    } });
  }
  if (!only || only === 'eslint') {
    stages.push({ id: 'eslint', run: async () => {
    const versionEntries = [];
      for (const name of ['eslint', 'eslint-plugin-security', 'eslint-plugin-no-unsanitized']) versionEntries.push([name, await packageVersion(owned, name)]);
      const versions = Object.fromEntries(versionEntries);
      const eslintCli = await owned.resolve('node_modules/eslint/bin/eslint.js', { type: 'file' });
      return collect('eslint', 'eslint', process.execPath, [eslintCli, '--config', 'eslint.security.config.mjs', '--no-inline-config', '--max-warnings=0', '--format=json', ...source], versions);
    } });
  }
  let preparedGitleaks;
  if (!only || only === 'gitleaks') {
    for (const mode of ['dir', 'git']) stages.push({ id: `gitleaks-${mode}`, run: async () => {
    if (!preparedGitleaks) {
    const defaultGitleaks = `${outputRelative}/tools/gitleaks-8.30.1/${process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks'}`;
    const executable = process.env.TOOL_AUDIT_GITLEAKS || await owned.resolve(defaultGitleaks, { type: 'file', optional: true });
    if (!executable) return { id: `gitleaks-${mode}`, ...failure('pinned-gitleaks-unavailable') };
    const version = await runTool(executable, ['version']);
    if (version.exitCode !== 0 || version.stdout.trim() !== '8.30.1') return failedExecution(`gitleaks-${mode}`, 'pinned-gitleaks-unavailable', version);
      const gitleaksConfig = await owned.resolve('gitleaks.audit.toml', { type: 'file' });
      preparedGitleaks = { executable, gitleaksConfig };
    }
      const { executable, gitleaksConfig } = preparedGitleaks;
      return collect(`gitleaks-${mode}`, 'gitleaks', executable, [mode, root,
          '--config', gitleaksConfig, '--redact=100', '--report-format=json', '--report-path=-',
          '--exit-code=42', '--timeout=110', '--no-banner', '--no-color', '--ignore-gitleaks-allow',
          ...(mode === 'git' ? ['--log-opts=--all'] : [])], { gitleaks: '8.30.1' });
    } });
  }
  if(only==='actionlint'){
    stages.push({ id: 'actionlint', run: async () => {
      try { const { command, args, versions } = await actionlintInvocation(owned); return await collect('actionlint', 'actionlint', command, args, versions); }
      catch (error) { return { id: 'actionlint', ...failure(error?.message === 'actionlint-workflows-missing' ? 'actionlint-workflows-missing' : 'pinned-actionlint-unavailable-or-version') }; }
    } });
  }
  return stages;
  });
  process.exitCode = completed.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error?.code === 'audit-summary-write-failed'
    ? 'Tool audit summary could not be persisted in the allocated Reports directory; do not treat this as a clean result.'
    : error?.code === 'audit-run-create-failed'
      ? 'Tool audit run directory could not be allocated; do not treat this as a clean result.'
      : 'Tool audit could not complete; do not treat this as a clean result.');
  process.exitCode = 2;
});
