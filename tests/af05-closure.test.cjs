const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
test('release version staging includes the relocated manifest with package and lockfile', async t => {
  const os = require('node:os'), { execFileSync } = require('node:child_process');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-version-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'extension'));
  for (const file of ['package.json', 'package-lock.json', 'extension/manifest.json', 'renovate.json'])
    await fs.writeFile(path.join(root, file), '{"version":"0.0.2"}\n');
  execFileSync('git', ['init', '-q', root]);
  const workflow = await fs.readFile('.github/workflows/publish.yml', 'utf8');
  const command = workflow.match(/^\s+(git add .+)$/m)?.[1];
  assert.ok(command, 'version step must stage its files');
  const bash = process.platform === 'win32'
    ? path.resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../bin/bash.exe') : 'bash';
  execFileSync(bash, ['-c', command], { cwd: root });
  assert.deepEqual(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/),
    ['extension/manifest.json', 'package-lock.json', 'package.json']);
});
function noAnyType(source, file) {
  assert.doesNotMatch(source.replace(/(['"])any\1/g, ''), /\bany\b/, file);
}
test('type policy distinguishes native step strings from prohibited any types', () => {
  noAnyType("input.step = 'any';", 'native-input.ts');
  assert.throws(() => noAnyType('let value: any;', 'bad.ts'), assert.AssertionError);
  assert.throws(() => noAnyType('type Value = Promise<any>;', 'bad.ts'), assert.AssertionError);
  assert.throws(() => noAnyType("type Value = { 'any': any };", 'bad.ts'), assert.AssertionError);
});

test('every first-party runtime file has a checked TypeScript generation entry', async () => {
  const settings = await import(pathToFileURL(path.resolve('scripts/settings-runtime.mjs')));
  const main = await import(pathToFileURL(path.resolve('scripts/main-runtime.mjs')));
  const entries = [...settings.SETTINGS_RUNTIME_ENTRIES, ...main.MAIN_RUNTIME_ENTRIES, main.AUDIO_WORKLET_ENTRY];
  const inventory = JSON.parse(await fs.readFile('tests/fixtures/f01-j1-runtime-js.json', 'utf8'));
  assert.deepEqual(entries.map(entry => entry.output).sort(), inventory);
  for (const entry of entries) {
    assert.ok(entry.source.endsWith('.ts'));
    assert.ok((await fs.readFile(entry.source, 'utf8')).length > 0);
    assert.ok((await fs.readFile(path.join('extension',entry.output), 'utf8')).startsWith(`// Generated from ${entry.source} by scripts/`));
  }
});

test('product TypeScript source graph has no any or type-check suppression', async () => {
  async function visit(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await visit(file);
      else if (item.name.endsWith('.ts')) {
        const source = await fs.readFile(file, 'utf8');
        assert.doesNotMatch(source, /@ts-(?:ignore|nocheck|expect-error)/, file);
        noAnyType(source, file);
      }
    }
  }
  await visit('src');
});
