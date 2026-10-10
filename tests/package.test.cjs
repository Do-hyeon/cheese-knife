const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-package-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
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

test('portable build contains referenced vendor and its license but not backups', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'web/inject.js.bak'), 'must not ship');
  const { build } = await import(pathToFileURL(path.resolve('scripts/build.mjs')));
  await build(root, path.join(root, 'dist'));
  assert.equal(await fs.readFile(path.join(root, 'dist/vendor/hls.light.private.js'), 'utf8'), '// fixture vendor');
  assert.equal(await fs.readFile(path.join(root, 'dist/vendor/hls.js.LICENSE'), 'utf8'), 'fixture license');
  await assert.rejects(fs.access(path.join(root, 'dist/web/inject.js.bak')));
});

test('package check rejects a missing manifest-referenced script', async t => {
  const root = await fixture(t);
  await fs.rm(path.join(root, 'web/inject.js'));
  const { checkPackage } = await import(pathToFileURL(path.resolve('scripts/check-package.mjs')));
  await assert.rejects(checkPackage(root), /web\/inject.js/);
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
  const manifest = JSON.parse(await fs.readFile('manifest.json', 'utf8'));
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

test('separate Firefox artifact preserves its background and metadata without contaminating Chrome', async t => {
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
  await build(root, path.join(root, 'dist-firefox'), 'firefox');
  const chrome = JSON.parse(await fs.readFile(path.join(root, 'dist/manifest.json'), 'utf8'));
  const firefox = JSON.parse(await fs.readFile(path.join(root, 'dist-firefox/manifest.json'), 'utf8'));
  assert.equal(await fs.readFile(path.join(root, 'dist/manifest.json'), 'utf8'), JSON.stringify(manifest), 'Chrome manifest preserves exact source bytes');
  assert.deepEqual(chrome.background, { service_worker: 'background.js' }); assert.equal(chrome.browser_specific_settings, undefined);
  assert.deepEqual(firefox.background, { scripts: ['background.js'] }); assert.equal(firefox.browser_specific_settings.gecko.id, 'fixture@example.test');
  await checkPackage(path.join(root, 'dist-firefox'), '2.13.1', 'firefox');
  await assert.rejects(checkPackage(path.join(root, 'dist-firefox')), /background\.scripts/);
  assert.equal(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'), JSON.stringify(manifest));
});
