const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createHash } = require('node:crypto');

test('ESLint glob traversal and negated ignores preserve the selected files and diagnostics', async t => {
  const { ESLint } = require('eslint');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-glob-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const names = ['src/deep/target.js', 'src/deep/module.mjs', 'src/.hidden.js', 'src/keep.js',
    'src/ignored.js', 'src/skip/hidden.js', 'src/notes.txt', 'outside/out.js'];
  for (const name of names) {
    await fs.mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await fs.writeFile(path.join(directory, name), 'eval("1");\n');
  }
  const eslint = new ESLint({ cwd: directory, overrideConfigFile: true, overrideConfig: [
    { ignores: ['src/skip/**', 'src/*.js', '!src/keep.js', '!src/.hidden.js'] },
    { files: ['src/**/*.{js,mjs}'], rules: { 'no-eval': 'error' } },
  ] });
  const selected = ['src/.hidden.js', 'src/deep/module.mjs', 'src/deep/target.js', 'src/keep.js'];
  for (const name of names.filter(name => name.startsWith('src/'))) {
    assert.equal(await eslint.isPathIgnored(path.join(directory, name)), !selected.includes(name), name);
  }
  const results = await eslint.lintFiles(['src/**/*.@(js|mjs)']);
  assert.deepEqual(results.map(row => path.relative(directory, row.filePath).split(path.sep).join('/')).sort(), selected);
  for (const row of results) {
    assert.equal(row.errorCount, 1); assert.equal(row.warningCount, 0); assert.equal(row.fatalErrorCount, 0);
    assert.deepEqual(row.messages.map(({ ruleId, severity, line, column }) => ({ ruleId, severity, line, column })),
      [{ ruleId: 'no-eval', severity: 2, line: 1, column: 1 }]);
  }
});

test('security inventory includes relocated extension code but excludes bundled vendor code', async () => {
  const {sourceFiles}=await import('../scripts/tool-audit.mjs');
  const names=await sourceFiles(process.cwd());
  assert.ok(names.includes('extension/background.js'));
  assert.ok(names.includes('extension/web/audio.js'));
  assert.equal(names.some(name=>name.startsWith('extension/vendor/')),false);
});

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

test('actionlint requires matching JSON shape and exact finding exit semantics',async()=>{
  const {classifyReport,buildCatalog}=await auditModule(),item={message:'context sentinel',filepath:'.github/workflows/ci.yml',line:147,column:32,end_column:42,kind:'expression'};
  assert.equal(classifyReport('actionlint','[]',0).status,'pass');
  const result=classifyReport('actionlint',JSON.stringify([item]),1);assert.equal(result.status,'findings');assert.equal(result.count,1);
  assert.equal(buildCatalog([{...result,id:'actionlint'}])[0].file,item.filepath);
  for(const [json,code]of [['[]',1],['[]',2],['[]',3],['[]',null],[JSON.stringify([item]),0],['{}',0],['bad',0],['[{}]',1]])assert.equal(classifyReport('actionlint',json,code).status,'error');
  for(const field of Object.keys(item)){const broken={...item};delete broken[field];assert.equal(classifyReport('actionlint',JSON.stringify([broken]),1).status,'error');}
});

test('workflow snapshot tracks filenames, YAML bytes and optional actionlint config',async t=>{
  const {snapshotInput}=await auditModule(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'workflow-audit-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  for(const file of ['package.json','package-lock.json','gitleaks.audit.toml'])await fs.writeFile(path.join(dir,file),'{}');
  await fs.mkdir(path.join(dir,'.github/workflows'),{recursive:true});await fs.writeFile(path.join(dir,'.github/workflows/a.yml'),'name: original');
  const first=await snapshotInput(dir);assert.ok(first.some(row=>row.file==='.github/workflows/a.yml'));
  await fs.rename(path.join(dir,'.github/workflows/a.yml'),path.join(dir,'.github/workflows/b.yml'));assert.notDeepEqual(await snapshotInput(dir),first);
  const second=await snapshotInput(dir);await fs.writeFile(path.join(dir,'.github/actionlint.yaml'),'self-hosted-runner: {}');assert.notDeepEqual(await snapshotInput(dir),second);
});

test('actionlint invocation pins version and exact flags with all sorted workflows',async()=>{
  const {actionlintInvocation}=await auditModule(),calls=[];
  const owned={resolve:async name=>path.resolve(name),readFile:async()=>Buffer.from('binary'),lstat:async()=>({}),readdir:async()=>['publish.yml','ci.yml','ignored.txt'].map(name=>({name,isFile:()=>true}))};
  const run=await actionlintInvocation(owned,async(command,args)=>{calls.push({command,args});return {stdout:'1.7.12\nbuild metadata\n',exitCode:0};});
  assert.deepEqual(calls[0].args,['-version']);assert.deepEqual(run.args,['-shellcheck=','-pyflakes=','-format','{{json .}}','.github/workflows/ci.yml','.github/workflows/publish.yml']);assert.match(run.versions.sha256,/^[a-f0-9]{64}$/);
  for(const version of [{stdout:'1.7.11',exitCode:0},{stdout:'1.7.12',exitCode:1},{stdout:'',exitCode:null}])await assert.rejects(actionlintInvocation(owned,async()=>version),/pinned-actionlint-version/);
  await assert.rejects(actionlintInvocation({...owned,readdir:async()=>[]},async()=>({stdout:'1.7.12',exitCode:0})),/actionlint-workflows-missing/);
  await assert.rejects(actionlintInvocation({...owned,resolve:async()=>{throw Error('missing');}},async()=>{throw Error('should not execute');}),/missing/);
});

test('explicit actionlint CLI does not start other scanners and missing portable tool fails closed',async t=>{
  const {spawnSync}=require('node:child_process'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'actionlint-cli-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  await fs.mkdir(path.join(directory,'scripts'));
  for(const name of ['tool-audit.mjs','owned-files.mjs'])await fs.copyFile(path.resolve('scripts',name),path.join(directory,'scripts',name));
  for(const name of ['package.json','package-lock.json','gitleaks.audit.toml'])await fs.writeFile(path.join(directory,name),'{}');
  const execution=spawnSync(process.execPath,['scripts/tool-audit.mjs','--only=actionlint'],{cwd:directory,encoding:'utf8',timeout:10000});
  assert.equal(execution.status,2,execution.stderr);const runs=await fs.readdir(path.join(directory,'output/tool-audit'));assert.equal(runs.length,1);
  const summary=JSON.parse(await fs.readFile(path.join(directory,'output/tool-audit',runs[0],'summary.json'),'utf8'));
  assert.deepEqual(summary.results.map(row=>row.id),['actionlint']);assert.equal(summary.results[0].status,'error');
  assert.equal(summary.inputSnapshot.matched,true);
  const pkg=JSON.parse(await fs.readFile('package.json','utf8'));assert.equal(pkg.scripts['check:workflow'],'node scripts/tool-audit.mjs --only=actionlint');
});

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

test('ESLint report counts reject malformed, missing or unsafe numeric fields',async()=>{
  const {classifyReport}=await auditModule();
  const clean={filePath:'sample.js',messages:[],errorCount:0,warningCount:0,fatalErrorCount:0};
  assert.equal(classifyReport('eslint',JSON.stringify([clean]),0).status,'pass');
  for(const field of ['errorCount','warningCount','fatalErrorCount'])for(const value of [-1,.5,Number.MAX_SAFE_INTEGER+1,'0',null,undefined]){
    const row={...clean,[field]:value};
    assert.equal(classifyReport('eslint',JSON.stringify([row]),0).status,'error',`${field}=${value}`);
  }
  for(const row of [{...clean,errorCount:1},{...clean,warningCount:1},{...clean,fatalErrorCount:1}])
    assert.equal(classifyReport('eslint',JSON.stringify([row]),0).status,'error');
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
  assert.ok(files.includes('extension/web/preview.js'));
  assert.ok(files.includes('extension/settings-broker.js'));
  assert.ok(files.includes('scripts/build.mjs'));
  assert.ok(files.includes('scripts/audio-signal.mjs'));
  assert.equal(files.some(file => /(?:^vendor\/|^node_modules\/|^output\/|^tests\/|^dist(?:\/|-)|^scripts\/(?:hls-hardening|vendor-hls)\.mjs$)/.test(file)), false);
});

test('audio numeric source snapshot records the actual module hash', async () => {
  const { snapshotInput } = await auditModule();
  const snapshot = await snapshotInput(process.cwd());
  const expected = createHash('sha256').update(await fs.readFile('scripts/audio-signal.mjs')).digest('hex');
  assert.deepEqual(snapshot.find(item => item.file === 'scripts/audio-signal.mjs'), {
    file: 'scripts/audio-signal.mjs', sha256: expected,
  });
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
    { id: 'eslint', status: 'findings', report: [{ filePath: path.resolve("extension/web/player.js"), messages: [{ ruleId: 'fixture-rule', severity: 1, line: 2, column: 3, message: 'fixture warning' }, { ruleId: 'fixture-rule', severity: 1, line: 4, column: 5, message: 'another warning' }] }] },
    { id: 'gitleaks-git', status: 'error', reason: 'process-interrupted-or-unavailable' },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].file, 'extension/web/player.js');
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
