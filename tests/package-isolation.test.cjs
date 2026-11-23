const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function repositoryCopy(t) {
  const parent = path.resolve('output');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'inc01-package-'));
  assert.equal(path.dirname(root), parent);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  // A real child test must never exercise the broken cleanup on the user's dist.
  for (const folder of ['scripts', 'src', 'web', 'styles', '_locales', 'vendor', 'tests/fixtures']) {
    await fs.cp(folder, path.join(root, folder), { recursive: true });
  }
  for (const entry of await fs.readdir('.', { withFileTypes: true })) {
    if (entry.isFile() && (/\.(?:html|js|css|png)$/.test(entry.name) || /^tsconfig.*\.json$/.test(entry.name) ||
      ['manifest.json', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md'].includes(entry.name))) {
      await fs.copyFile(entry.name, path.join(root, entry.name));
    }
  }
  await fs.copyFile('tests/package.test.cjs', path.join(root, 'tests/package.test.cjs'));
  const sentinel = path.join(root, 'dist', 'installed-sentinel.txt');
  await fs.mkdir(path.dirname(sentinel));
  await fs.writeFile(sentinel, 'existing installed artifact');
  return { root, sentinel };
}

function runProductionTest(root) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [
    '--test', '--test-reporter=tap',
    '--test-name-pattern=^production build preserves first-party runtime bytes and excludes developer files$',
    'tests/package.test.cjs',
  ], { cwd: root, env, encoding: 'utf8', timeout: 30000 });
}

test('production package test preserves an existing installed dist', async t => {
  const { root, sentinel } = await repositoryCopy(t);
  const execution = runProductionTest(root);
  assert.equal(execution.error, undefined);
  assert.equal(execution.status, 0, execution.stdout + execution.stderr);
  assert.match(execution.stdout, /^ok \d+ - production build preserves first-party runtime bytes and excludes developer files$/m);
  const preserved = await fs.readFile(sentinel, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  assert.equal(preserved, 'existing installed artifact', 'production test deleted or replaced the installed dist');
  assert.deepEqual(await fs.readdir(path.dirname(sentinel)), ['installed-sentinel.txt']);
});

test('production package test detects a builder that leaks TypeScript config', async t => {
  const { root } = await repositoryCopy(t);
  const file = path.join(root, 'scripts/build.mjs');
  const original = await fs.readFile(file, 'utf8');
  const copyRule = 'if (entry.isFile() && /\\.(?:html|js|css|png)$/.test(entry.name)) {';
  assert.ok(original.includes(copyRule), 'the mutation must reach the real root-file copy rule');
  await fs.writeFile(file, original.replace(copyRule,
    'if (entry.isFile() && (/\\.(?:html|js|css|png)$/.test(entry.name) || /^tsconfig.*\\.json$/.test(entry.name))) {'));
  const execution = runProductionTest(root);
  assert.equal(execution.error, undefined);
  assert.notEqual(execution.status, 0, 'production test must detect the developer-file leak');
  assert.match(execution.stdout + execution.stderr, /distribution-developer-file/);
});
