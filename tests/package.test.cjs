const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

async function fixture(t, { retain = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-package-'));
  if (!retain) t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'web'));
  await fs.mkdir(path.join(root, 'vendor'));
  const manifest = { manifest_version: 3, version: '2.13.1', content_scripts: [
    { matches: ['https://chzzk.naver.com/*'], js: ['web/inject.js', 'vendor/hls.light.private.js'] },
  ] };
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '2.13.1' }));
  await fs.writeFile(path.join(root, 'web/inject.js'), '// fixture script');
  await fs.writeFile(path.join(root, 'vendor/hls.light.private.js'), '// fixture vendor');
  await fs.writeFile(path.join(root, 'vendor/hls.js.LICENSE'), 'fixture license');
  return root;
}

async function addSettingsRuntime(root) {
  const { SETTINGS_RUNTIME_ENTRIES: entries, renderSettingsRuntime } = await import(pathToFileURL(path.resolve('scripts/settings-runtime.mjs')));
  await fs.mkdir(path.join(root, 'src/settings'), { recursive: true });
  for (const entry of entries) await fs.writeFile(path.join(root, entry.source), entry.global ? `var ${entry.global} = () => ${JSON.stringify(entry.global)};\n` : '(() => { document.title = "fixture"; })();\n');
  for (const [file, source] of Object.entries(await renderSettingsRuntime(root))) await fs.writeFile(path.join(root, file), source);
}

test('extension sources build to the existing flat distribution layout', async t => {
  const root=await fixture(t),extension=path.join(root,'extension');
  await fs.mkdir(extension);
  for(const name of ['manifest.json','web','vendor'])await fs.rename(path.join(root,name),path.join(extension,name));
  const {checkPackage}=await import('../scripts/check-package.mjs');
  const {build}=await import('../scripts/build.mjs');
  assert.equal((await checkPackage(root)).version,'2.13.1');
  const output=await build(root);
  for(const name of ['manifest.json','web/inject.js','vendor/hls.light.private.js'])
    assert.deepEqual(await fs.readFile(path.join(output,name)),await fs.readFile(path.join(extension,name)));
  await assert.rejects(fs.stat(path.join(output,'extension')), {code:'ENOENT'});
});

test('an incomplete extension directory cannot fall back to stale root assets', async t => {
  const root=await fixture(t);
  await fs.mkdir(path.join(root,'extension'));
  const {checkPackage}=await import('../scripts/check-package.mjs');
  await assert.rejects(checkPackage(root),{code:'extension-layout-ambiguous'});
  await fs.unlink(path.join(root,'manifest.json'));
  await assert.rejects(checkPackage(root),/Missing extension resource/);
});

test('package validation cannot hide an invalid installed manifest behind nested source assets', async t => {
  const root=await fixture(t);
  await fs.mkdir(path.join(root,'extension'));
  await fs.writeFile(path.join(root,'extension/manifest.json'),JSON.stringify({manifest_version:3,version:'2.13.1'}));
  await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({manifest_version:2,version:'2.13.1'}));
  const {checkPackage}=await import('../scripts/check-package.mjs');
  await assert.rejects(checkPackage(root),{code:'extension-layout-ambiguous'});
});

test('a linked extension source directory cannot escape the owned repository', async t => {
  const root=await fixture(t),outside=await fixture(t);
  await fs.unlink(path.join(root,'manifest.json'));
  await fs.symlink(outside,path.join(root,'extension'),'junction');
  const {checkPackage}=await import('../scripts/check-package.mjs');
  await assert.rejects(checkPackage(root),{code:'owned-path-link'});
});

async function addMainRuntime(root) {
  await fs.cp('src/main', path.join(root, 'src/main'), { recursive: true });
  const { renderMainRuntime, renderAudioWorklet } = await import(pathToFileURL(path.resolve('scripts/main-runtime.mjs')));
  for (const [file, source] of Object.entries({...await renderMainRuntime(root),...await renderAudioWorklet(root)})) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), source);
  }
}

// These exercise actual filesystem types and the real package checker. Each
// reference lives on its own path, so testing HTML/worker dependencies cannot
// accidentally pass because a manifest script rejected it first.
async function referencedFixture(t, kind) {
  const root = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  let resource = 'web/inject.js';
  if (kind === 'HTML') {
    resource = 'assets/page.js'; manifest.action = { default_popup: 'popup.html' };
    await fs.writeFile(path.join(root, 'popup.html'), '<script src="assets/page.js"></script>');
  } else if (kind === 'worker') {
    resource = 'parts/worker-part.js'; manifest.background = { service_worker: 'background.js' };
    await fs.writeFile(path.join(root, 'background.js'), "importScripts('parts/worker-part.js');");
  } else if (kind === 'locale') {
    resource = '_locales/ko/messages.json'; manifest.default_locale = 'ko';
  } else if (kind === 'WAR') {
    resource = 'web/audio-transition-worklet.js';manifest.web_accessible_resources=[{resources:[resource],matches:['https://chzzk.naver.com/*']}];
  }
  await fs.mkdir(path.dirname(path.join(root, resource)), { recursive: true });
  await fs.writeFile(path.join(root, resource), '// fixture resource');
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  return { root, resource };
}

// Break caught: existence-only checks accept a folder as a declared file.
for (const kind of ['manifest', 'HTML', 'worker', 'locale','WAR']) {
  test(`${kind} resource must be a regular file, not an existing directory`, async t => {
    const { root, resource } = await referencedFixture(t, kind);
    await fs.unlink(path.join(root, resource)); await fs.mkdir(path.join(root, resource));
    const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
    await assert.rejects(checkPackage(root), /Not a regular package file/);
  });
}

// Directory junctions need no Windows symlink privilege and are reported by
// lstat as links. All targets are test-owned directories, never user files.
for (const kind of ['manifest', 'HTML', 'worker']) {
  test(`${kind} reference rejects an intermediate directory link even to an internal target`, async t => {
    const { root, resource } = await referencedFixture(t, kind);
    const parent = path.dirname(resource), target = path.join(root, 'stored-' + parent);
    await fs.rename(path.join(root, parent), target);
    await fs.symlink(target, path.join(root, parent), 'junction');
    const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
    await assert.rejects(checkPackage(root), /Linked package path/);
  });
}

test('a final resource link is rejected before its target type can be mistaken for a file', async t => {
  const { root, resource } = await referencedFixture(t, 'manifest');
  const target = path.join(root, 'link-target'); await fs.mkdir(target);
  await fs.unlink(path.join(root, resource)); await fs.symlink(target, path.join(root, resource), 'junction');
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  await assert.rejects(checkPackage(root), /Linked package path/);
});

for (const metadata of ['manifest.json', 'package.json']) {
  test(`${metadata} rejects a linked path before attempting to parse metadata`, async t => {
    const root = await fixture(t), target = path.join(root, 'metadata-target'); await fs.mkdir(target);
    await fs.unlink(path.join(root, metadata)); await fs.symlink(target, path.join(root, metadata), 'junction');
    const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
    await assert.rejects(checkPackage(root), /Linked package path/);
  });
}

test('a broken optional package metadata link is not treated as an absent package.json', async t => {
  const root = await fixture(t); await fs.unlink(path.join(root, 'package.json'));
  await fs.symlink(path.join(root, 'missing-target'), path.join(root, 'package.json'), 'junction');
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  await assert.rejects(checkPackage(root), /Linked package path/);
});

test('a truly absent optional package.json remains valid with an explicit expected version', async t => {
  const root = await fixture(t); await fs.unlink(path.join(root, 'package.json'));
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  assert.equal((await checkPackage(root, '2.13.1')).version, '2.13.1');
});

test('a package root alias remains supported while internal linked resources are forbidden', async t => {
  const root = await fixture(t), alias = root + '-alias';
  await fs.symlink(root, alias, 'junction'); t.after(() => fs.unlink(alias));
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  assert.equal((await checkPackage(alias, '2.13.1')).version, '2.13.1');
});

test('portable build contains referenced vendor and its license but not backups', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'web/inject.js.bak'), 'must not ship');
  const { build } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  await build(root, path.join(root, 'dist'));
  assert.equal(await fs.readFile(path.join(root, 'dist/vendor/hls.light.private.js'), 'utf8'), '// fixture vendor');
  assert.equal(await fs.readFile(path.join(root, 'dist/vendor/hls.js.LICENSE'), 'utf8'), 'fixture license');
  await assert.rejects(fs.access(path.join(root, 'dist/web/inject.js.bak')));
});

test('checked build rejects settings drift before touching an existing dist', async t => {
  const root = await fixture(t);
  await addSettingsRuntime(root);
  await fs.mkdir(path.join(root, 'dist'));
  await fs.writeFile(path.join(root, 'dist/sentinel.txt'), 'unchanged');
  await fs.appendFile(path.join(root, 'settings-client.js'), '// stale\n');
  const { buildChecked } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  await assert.rejects(buildChecked(root, path.join(root, 'dist')), { code: 'settings-runtime-drift' });
  assert.equal(await fs.readFile(path.join(root, 'dist/sentinel.txt'), 'utf8'), 'unchanged');
});

test('checked build accepts matching settings runtime and produces a portable dist', async t => {
  const root = await fixture(t);
  await addSettingsRuntime(root); await addMainRuntime(root);
  const { buildChecked } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  const target = await buildChecked(root, path.join(root, 'dist'));
  assert.equal(await fs.readFile(path.join(target, 'settings-contract.js'), 'utf8'), await fs.readFile(path.join(root, 'settings-contract.js'), 'utf8'));
});

test('checked build rejects MAIN drift before touching generated files or dist', async t => {
  const root = await fixture(t);
  await addSettingsRuntime(root); await addMainRuntime(root);
  await fs.mkdir(path.join(root, 'dist'));
  await fs.writeFile(path.join(root, 'dist/sentinel.txt'), 'unchanged');
  const stale = path.join(root, 'web/runtime.js');
  const before = await fs.readFile(stale, 'utf8');
  await fs.appendFile(stale, '// stale\n');
  const { buildChecked } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  await assert.rejects(buildChecked(root, path.join(root, 'dist')), { code: 'main-runtime-drift' });
  assert.equal(await fs.readFile(stale, 'utf8'), before + '// stale\n');
  assert.equal(await fs.readFile(path.join(root, 'dist/sentinel.txt'), 'utf8'), 'unchanged');
});

test('foundation checks MAIN runtime after typecheck and settings before build proof', async () => {
  const workflow = await fs.readFile('.github/workflows/ci.yml', 'utf8');
  const command = workflow.match(/run: (npm run check:toolchain[^\r\n]+)/)?.[1] || '';
  const ordered = ['npm run typecheck', 'npm run typecheck:development', 'npm run check:settings-runtime', 'npm run check:main-runtime', 'npm run check:build-proof'];
  for (const value of ordered) assert.notEqual(command.indexOf(value), -1, value);
  for (let index = 1; index < ordered.length; index++) assert.ok(command.indexOf(ordered[index - 1]) < command.indexOf(ordered[index]));
});

test('build accepts a root alias but rejects a linked dist without touching its target', async t => {
  const root = await fixture(t), alias = root + '-build-alias', outside = root + '-outside';
  await fs.mkdir(outside); t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'sentinel.txt'), 'unchanged');
  await fs.symlink(root, alias, 'junction'); t.after(() => fs.unlink(alias));
  const { build } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  await build(alias, path.join(alias, 'dist'));
  await fs.rm(path.join(root, 'dist'), { recursive: true, force: true });
  await fs.symlink(outside, path.join(root, 'dist'), 'junction');
  await assert.rejects(build(root, path.join(root, 'dist')), /owned-path-link/);
  assert.equal(await fs.readFile(path.join(outside, 'sentinel.txt'), 'utf8'), 'unchanged');
});

test('build rejects a broken optional notice link instead of treating it as absent', async t => {
  const root = await fixture(t);
  await fs.symlink(path.join(root, 'missing-notice'), path.join(root, 'THIRD_PARTY_NOTICES.md'), 'junction');
  const { build } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  await assert.rejects(build(root, path.join(root, 'dist')), /owned-path-link/);
});

test('Chrome artifact excludes development dependencies and local audit reports', async t => {
  const root = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.background = { service_worker: 'background.js' };
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, 'background.js'), '// fixture background');
  await fs.mkdir(path.join(root, 'node_modules/node-forge'), { recursive: true });
  await fs.mkdir(path.join(root, 'output/tool-audit'), { recursive: true });
  await fs.writeFile(path.join(root, 'node_modules/node-forge/index.js'), '// development dependency fixture');
  await fs.writeFile(path.join(root, 'output/tool-audit/summary.json'), '{"fixture":"private report"}');
  await fs.writeFile(path.join(root, 'eslint.security.config.mjs'), '// development configuration fixture');
  await fs.writeFile(path.join(root, 'gitleaks.audit.toml'), 'title="fixture"');
  const { build } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  const output = path.join(root, 'dist');
  await build(root, output);
  for (const file of ['node_modules', 'output', 'eslint.security.config.mjs', 'gitleaks.audit.toml', 'package-lock.json', 'package.json']) {
    await assert.rejects(fs.access(path.join(output, file)), { code: 'ENOENT' });
  }
  assert.equal(await fs.readFile(path.join(output, 'web/inject.js'), 'utf8'), '// fixture script');
});

test('package check rejects a missing manifest-referenced script', async t => {
  const root = await fixture(t);
  await fs.rm(path.join(root, 'web/inject.js'));
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  await assert.rejects(checkPackage(root), /web\/inject.js/);
});
test('classic worker literal importScripts dependencies must exist in the package', async t => {
  const root = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.background = { service_worker: 'background.js' };
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, 'background.js'), "importScripts('settings-broker.js');");
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  await assert.rejects(checkPackage(root), /settings-broker.js/);
  await fs.writeFile(path.join(root, 'settings-broker.js'), '// local dependency'); await checkPackage(root);
});
test('package checker does not execute or guess computed worker imports', async t => {
  const root = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.background = { service_worker: 'background.js' };
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, 'background.js'), "throw new Error('must-not-execute'); importScripts(computedPath);");
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs'))); await checkPackage(root);
});

test('literal worker imports support commas inside filenames and reject a missing second import', async t => {
  const root = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.background = { service_worker: 'background.js' };
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, 'background.js'), "importScripts('first,part.js', 'second.js');");
  await fs.writeFile(path.join(root, 'first,part.js'), '// fixture');
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  await assert.rejects(checkPackage(root), /second\.js/);
  await fs.writeFile(path.join(root, 'second.js'), '// fixture');
  await checkPackage(root);
});

test('worker literal checker rejects misplaced separators instead of guessing missing dependencies', async t => {
  const root = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.background = { service_worker: 'background.js' };
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, 'background.js'), "importScripts(,'missing.js''another.js');");
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  await checkPackage(root);
});

test('build refuses a target outside its repository dist directory', async t => {
  const root = await fixture(t);
  const { build } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  await assert.rejects(build(root, path.dirname(root)), /dist/);
});

test('Chrome MV3 package validation rejects a legacy background scripts declaration', async t => {
  const root = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.background = { scripts: ['background.js'], service_worker: 'background.js' };
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, 'background.js'), '// fixture background');
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  await assert.rejects(checkPackage(root), /background\.scripts/);
});

test('Chrome source manifest is accepted only without MV2 background declarations', async () => {
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  const manifest = JSON.parse(await fs.readFile("extension/manifest.json", 'utf8'));
  assert.equal(Object.hasOwn(manifest.background, 'scripts'), false);
  assert.equal(manifest.background.service_worker, 'background.js');
  await checkPackage(process.cwd());
});

test('Chrome validation rejects Firefox-only manifest metadata instead of shipping warnings', async t => {
  const root = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.browser_specific_settings = { gecko: { id: 'fixture@example.test' } };
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  await assert.rejects(checkPackage(root), /browser_specific_settings/);
});

test('retired Firefox build and validation targets cannot replace a Chrome artifact', async t => {
  const root = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.background = { service_worker: 'background.js' };
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, 'background.js'), '// fixture background');
  await fs.writeFile(path.join(root, 'manifest.firefox.json'), JSON.stringify({
    background: { scripts: ['background.js'] }, browser_specific_settings: { gecko: { id: 'fixture@example.test', strict_min_version: '128.0' } },
  }));
  const { build } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  await build(root, path.join(root, 'dist'));
  await assert.rejects(build(root, path.join(root, 'dist-firefox'), 'firefox'), /Chrome only/);
  await assert.rejects(checkPackage(root, '2.13.1', 'firefox'), /Chrome only/);
  await assert.rejects(fs.access(path.join(root, 'dist-firefox')), { code: 'ENOENT' });
  const chrome = JSON.parse(await fs.readFile(path.join(root, 'dist/manifest.json'), 'utf8'));
  assert.equal(await fs.readFile(path.join(root, 'dist/manifest.json'), 'utf8'), JSON.stringify(manifest), 'Chrome manifest preserves exact source bytes');
  assert.deepEqual(chrome.background, { service_worker: 'background.js' }); assert.equal(chrome.browser_specific_settings, undefined);
  assert.equal(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'), JSON.stringify(manifest));
});

// Exercise real CLIs in an owned fixture, never the installed dist directory.
for (const script of ['build.mjs', 'check-package.mjs']) test(`retired --firefox option fails explicitly in ${script}`, async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'scripts'));
  for (const file of ['build.mjs', 'check-package.mjs', 'owned-files.mjs']) await fs.copyFile(path.resolve('scripts', file), path.join(root, 'scripts', file));
  await fs.writeFile(path.join(root, 'background.js'), '// fixture background');
  await fs.writeFile(path.join(root, 'manifest.firefox.json'), JSON.stringify({ background: { scripts: ['background.js'] } }));
  if (script === 'check-package.mjs') {
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
    manifest.background = { scripts: ['background.js'] };
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  }
  const execution = spawnSync(process.execPath, [path.join(root, 'scripts', script), '--firefox'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(execution.status, 0, 'a retired option must not silently create or accept a Firefox package');
  assert.match(execution.stderr, /Chrome only/);
  await assert.rejects(fs.access(path.join(root, 'dist-firefox')), { code: 'ENOENT' });
});

test('candidate verifier rejects unsafe IDs and existing destinations without overwriting them', async t => {
  const { verifyCandidate } = await import(pathToFileURL(path.resolve('scripts/verify-candidate.mjs')));
  for (const id of ['..', '../escape', 'with/slash', 'with\\backslash', 'C:absolute', 'space id', '']) {
    await assert.rejects(verifyCandidate(id), { code: 'candidate-id-invalid' });
  }
  const id = `existing${Date.now()}`;
  const destination = path.resolve('output', 'tool-audit', `p02-candidate-${id}`, 'chrome-candidate');
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(destination, 'sentinel.txt'), 'unchanged');
  t.after(() => fs.rm(path.dirname(destination), { recursive: true, force: true }));
  await assert.rejects(verifyCandidate(id), { code: 'candidate-destination-exists' });
  assert.equal(await fs.readFile(path.join(destination, 'sentinel.txt'), 'utf8'), 'unchanged');
});

test('candidate verifier rejects a same-ID contender before sharing candidate writes', { timeout: 90000 }, async t => {
  const { AsyncLocalStorage } = require('node:async_hooks');
  const { createHash } = require('node:crypto');
  const { verifyCandidate } = await import(pathToFileURL(path.resolve('scripts/verify-candidate.mjs')));
  const root = await fixture(t, { retain: true });
  t.diagnostic(`candidate-race retained fixture: ${root}`);
  await addSettingsRuntime(root);
  await addMainRuntime(root);
  const destination = path.join(root, 'output/tool-audit/p02-candidate-Race/chrome-candidate');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const context = new AsyncLocalStorage(), checked = new Set(), writes = [];
  const realLstat = fs.lstat, realCopy = fs.copyFile;
  const stopCode = 'candidate-race-harness-stop';
  let releaseChecks, releaseWrites, firstError = null;
  const checksReady = new Promise(resolve => { releaseChecks = resolve; });
  const writesReady = new Promise(resolve => { releaseWrites = resolve; });
  const stop = error => {
    firstError ??= error;
    releaseChecks();
    releaseWrites();
  };
  const timer = setTimeout(() => stop(Object.assign(new Error('candidate-race-deadline'), { code: 'candidate-race-deadline' })), 30000);
  const statMock = t.mock.method(fs, 'lstat', async function (file, ...args) {
    const owner = context.getStore();
    try { return await realLstat.call(fs, file, ...args); }
    catch (error) {
      if (owner && file === destination && error.code === 'ENOENT' && !checked.has(owner)) {
        checked.add(owner);
        if (checked.size === 2) releaseChecks();
        await checksReady;
        if (firstError) throw firstError;
      }
      throw error;
    }
  });
  const copyMock = t.mock.method(fs, 'copyFile', async function (source, target, ...args) {
    const owner = context.getStore();
    if (!owner || !target.startsWith(destination + path.sep)) return realCopy.call(fs, source, target, ...args);
    if (firstError) throw firstError;
    try {
      // Preserve real I/O; only delay its return so both callers reach their first write.
      await realCopy.call(fs, source, target, ...args);
      writes.push({ owner, source: path.relative(root, source), target: path.relative(root, target), completed: true });
      if (writes.length === 2) releaseWrites();
    } catch (error) { stop(error); throw error; }
    await writesReady;
    if (firstError) throw firstError;
    throw Object.assign(new Error(stopCode), { code: stopCode });
  });
  let outcomes;
  try {
    outcomes = await Promise.allSettled(['A', 'B'].map(owner => context.run(owner, async () => {
      try { return await verifyCandidate('Race', root, { retainEvidence: true }); }
      catch (error) {
        if (error.code === 'candidate-destination-exists') releaseWrites();
        else if (error.code !== stopCode) stop(error);
        throw error;
      }
    })));
  } finally {
    clearTimeout(timer);
    statMock.mock.restore();
    copyMock.mock.restore();
  }
  let finalFile = null;
  if (writes.length) {
    try {
      const bytes = await fs.readFile(path.join(root, writes[0].target));
      finalFile = { target: writes[0].target, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    } catch (error) { finalFile = { code: error.code, message: error.message }; }
  }
  const report = {
    scope: 'same-ID first candidate writes only', fixture: root, initialMissing: [...checked], writes,
    finalFile, firstError: firstError && { code: firstError.code, message: firstError.message, stack: firstError.stack },
    outcomes: outcomes.map((result, index) => ({ owner: ['A', 'B'][index], status: result.status,
      code: result.reason?.code ?? null, message: result.reason?.message ?? null, stack: result.reason?.stack ?? null,
      retainedCandidatePath: result.reason?.retainedCandidatePath ?? null })),
  };
  let preservationError = null;
  if (process.env.KNIFE_TEST_EVIDENCE_DIR) {
    try {
      report.archive = path.join(await fs.mkdtemp(path.join(path.resolve(process.env.KNIFE_TEST_EVIDENCE_DIR), 'candidate-race-')), 'fixture');
      const relative = path.relative(root, report.archive);
      if (!relative || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw new Error('candidate-evidence-overlap');
      await fs.writeFile(path.join(root, 'candidate-race-observation.json'), JSON.stringify(report, null, 2));
      await fs.cp(root, report.archive, { recursive: true, force: false, errorOnExist: true });
    } catch (error) { preservationError = error; report.preservationError = { code: error.code, message: error.message }; }
  }
  await fs.writeFile(path.join(root, 'candidate-race-observation.json'), JSON.stringify(report, null, 2));
  t.diagnostic(JSON.stringify(report));
  assert.equal(firstError, null, 'a fixture, real I/O or deadline failure is not a formed ownership result');
  assert.deepEqual([...checked].sort(), ['A', 'B'], 'both callers must observe real initial ENOENT');
  assert.equal(finalFile?.code, undefined, 'final evidence must remain readable after both callers settle');
  assert.equal(new Set(writes.map(row => row.owner)).size, writes.length, 'at most one real write per caller');
  assert.equal(new Set(writes.map(row => row.target)).size, 1, 'the observation must address the same candidate file');
  assert.equal(writes.length, 1, 'the contender must be rejected before a second real candidate write');
  assert.equal(report.outcomes.filter(result => result.code === 'candidate-destination-exists').length, 1);
  assert.equal(report.outcomes.filter(result => result.code === stopCode).length, 1);
  assert.equal(preservationError, null, 'evidence export must finish before fixture cleanup');
  await fs.rm(root, { recursive: true, force: true });
});

test('candidate claim loser cannot clean another creator sentinel with retention disabled', async t => {
  const { verifyCandidate } = await import(pathToFileURL(path.resolve('scripts/verify-candidate.mjs')));
  const root = await fixture(t);
  await addSettingsRuntime(root); await addMainRuntime(root);
  const destination = path.join(root, 'output/tool-audit/p02-candidate-Claim/chrome-candidate');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const mkdir = fs.mkdir, copy = fs.copyFile, remove = fs.rm; let claimed = false, copies = 0, removals = 0;
  const mock = t.mock.method(fs, 'mkdir', async function (target, ...args) {
    if (target === destination && !claimed) {
      claimed = true;
      await mkdir.call(fs, destination);
      await fs.writeFile(path.join(destination, 'sentinel'), 'other creator');
    }
    return mkdir.call(fs, target, ...args);
  });
  const copyMock = t.mock.method(fs, 'copyFile', async function (source, target, ...args) {
    if (target.startsWith(destination + path.sep)) copies++;
    return copy.call(fs, source, target, ...args);
  });
  const removeMock = t.mock.method(fs, 'rm', async function (target, ...args) {
    if (target === destination) removals++;
    return remove.call(fs, target, ...args);
  });
  try { await assert.rejects(verifyCandidate('Claim', root), { code: 'candidate-destination-exists' }); }
  finally { mock.mock.restore(); copyMock.mock.restore(); removeMock.mock.restore(); }
  assert.equal(claimed, true);
  assert.equal(copies, 0); assert.equal(removals, 0);
  assert.equal(await fs.readFile(path.join(destination, 'sentinel'), 'utf8'), 'other creator');
});

test('candidate verifier copies package inputs only and builds an isolated Chrome dist', async t => {
  const { verifyCandidate } = await import(pathToFileURL(path.resolve('scripts/verify-candidate.mjs')));
  const id = `fixture${Date.now()}`;
  const result = await verifyCandidate(id);
  t.after(() => fs.rm(path.resolve('output', 'tool-audit', `p02-candidate-${id}`), { recursive: true, force: true }));
  assert.ok(result.files.includes('dist/manifest.json'));
  assert.ok(result.files.includes('dist/vendor/hls.light.private.js'));
  assert.equal(result.files.some(file => /(?:node_modules|output|tests|scripts|eslint\.security|gitleaks)/.test(file)), false);
  for (const name of ['node_modules', 'output', 'tests', 'scripts', 'eslint.security.config.mjs', 'gitleaks.audit.toml']) {
    await assert.rejects(fs.access(path.join(result.root, name)), { code: 'ENOENT' });
  }
  assert.equal(result.resources > 0, true);
});

test('distribution rejects proof, type, config, TypeScript and source-map developer files', async t => {
  const { checkDistributionFiles } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  for (const forbidden of ['build-proof/main.js', 'types/knife-settings.d.ts', 'tsconfig.af01.json', 'source.js.map', 'src/settings/contract.ts', 'nested/source.ts']) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-dist-boundary-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.mkdir(path.dirname(path.join(root, forbidden)), { recursive: true });
    await fs.writeFile(path.join(root, forbidden), 'forbidden');
    await assert.rejects(checkDistributionFiles(root), error => error?.code === 'distribution-developer-file');
  }
});

test('production build preserves first-party runtime bytes and excludes developer files', async t => {
  const { verifyCandidate, removeCandidate } = await import(pathToFileURL(path.resolve('scripts/verify-candidate.mjs')));
  const baseline = require('./fixtures/runtime-js-baseline.json');
  const id = `production${process.pid}${Date.now()}`;
  const { root, dist: target } = await verifyCandidate(id);
  t.after(() => removeCandidate(id));
  // Candidate staging filters developers' inputs; the real builder must reject leaks too.
  for (const file of ['build-proof/main.js', 'types/knife-settings.d.ts', 'tsconfig.json', 'source.js.map', 'src/settings/contract.ts', 'nested/source.ts']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), 'development-only input');
  }
  const { build } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  await build(root, target);
  for (const file of baseline) assert.deepEqual(await fs.readFile(path.join(target, file)), await fs.readFile(path.join('extension',file)), file);
  const { files } = await (await import(pathToFileURL(path.resolve('scripts/check-package.mjs')))).checkDistributionFiles(target);
  assert.equal(files.some(file => file.endsWith('.map') || file.endsWith('.ts') || file.startsWith('src/') || file.startsWith('build-proof/') || file.startsWith('types/') || /^tsconfig.*\.json$/.test(file)), false);
});
