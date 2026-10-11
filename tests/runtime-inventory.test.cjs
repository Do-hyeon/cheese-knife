const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const expected = require('./fixtures/runtime-js-baseline.json');

async function inventoryModule() {
  return import(pathToFileURL(path.resolve('scripts/check-runtime-inventory.mjs')));
}

async function fixture(t, source = 'const answer = 42;\n') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-runtime-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'web'));
  await fs.writeFile(path.join(root, 'background.js'), source);
  await fs.writeFile(path.join(root, 'web/main.js'), source);
  return root;
}

async function writeBaselines(root, mod) {
  const files = await mod.listRuntimeJavaScript(root);
  const hashes = await mod.runtimeExecutableHashes(root, files);
  await fs.writeFile(path.join(root, 'inventory.json'), JSON.stringify(files));
  await fs.writeFile(path.join(root, 'executable.json'), JSON.stringify(hashes));
}

test('repository runtime inventory is exactly the approved 16 files', async () => {
  const mod = await inventoryModule();
  assert.deepEqual(await mod.listRuntimeJavaScript(path.resolve('.')), expected);
  await mod.checkRuntimeInventory(path.resolve('.'));
});

test('a new nested web script changes the inventory', async t => {
  const mod = await inventoryModule();
  const root = await fixture(t);
  await writeBaselines(root, mod);
  await fs.mkdir(path.join(root, 'web/nested'));
  await fs.writeFile(path.join(root, 'web/nested/new-feature.js'), 'void 0;');
  await assert.rejects(mod.checkRuntimeInventory(root, 'inventory.json', 'executable.json'), error => error?.code === 'runtime-js-inventory-changed');
});

test('non-runtime trees are excluded', async t => {
  const mod = await inventoryModule();
  const root = await fixture(t);
  for (const folder of ['vendor', 'tests', 'scripts', 'output', 'dist']) {
    await fs.mkdir(path.join(root, folder));
    await fs.writeFile(path.join(root, folder, 'ignored.js'), 'throw new Error();');
  }
  assert.deepEqual(await mod.listRuntimeJavaScript(root), ['background.js', 'web/main.js']);
});

test('a directory link inside the web runtime boundary is rejected', async t => {
  const mod = await inventoryModule();
  const root = await fixture(t);
  const target = path.join(root, 'linked-target');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'hidden.js'), 'void 0;');
  await fs.symlink(target, path.join(root, 'web/linked'), 'junction');
  await assert.rejects(mod.listRuntimeJavaScript(root), error => error?.code === 'owned-path-link');
});

test('comments do not change executable hashes, but literals and operators do', async t => {
  const mod = await inventoryModule();
  const root = await fixture(t);
  await writeBaselines(root, mod);
  await fs.writeFile(path.join(root, 'background.js'), '/** documentation only */\nconst answer = 42;\n');
  await mod.checkRuntimeInventory(root, 'inventory.json', 'executable.json');
  for (const changed of ['const answer = 43;\n', 'const answer = 42 + 0;\n']) {
    await fs.writeFile(path.join(root, 'background.js'), changed);
    await assert.rejects(mod.checkRuntimeInventory(root, 'inventory.json', 'executable.json'), error => error?.code === 'runtime-executable-changed');
  }
});
