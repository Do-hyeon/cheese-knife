const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');

const expected = require('./fixtures/f01-j1-runtime-js.json');

async function inventoryModule() {
  return import(pathToFileURL(path.resolve('scripts/check-runtime-inventory.mjs')));
}

async function fixture(t, source = 'const answer = 42;\n') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-runtime-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const folder of ['web', 'styles', '_locales']) await fs.mkdir(path.join(root, folder));
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

test('repository runtime inventory is exactly the current F01 files', async () => {
  const mod = await inventoryModule();
  assert.deepEqual(await mod.listRuntimeJavaScript(path.resolve('.')), expected);
  await mod.checkRuntimeInventory(path.resolve('.'));
});

test('historical latch executable pin changes only the audio pair and preserves the J1 fixtures',async()=>{
  const oldBytes=await fs.readFile('tests/fixtures/f01-j1-runtime-executable.json'),inventoryBytes=await fs.readFile('tests/fixtures/f01-j1-runtime-js.json');
  const old=JSON.parse(oldBytes),latch=JSON.parse(await fs.readFile('tests/fixtures/f01-product-latch-runtime-executable.json','utf8'));
  assert.equal(createHash('sha256').update(oldBytes).digest('hex'),'261f5f60a287a62f0bae2a97aa1c0b9f2d58a7cbb7d8e6af7747bd016ba8973a');
  assert.equal(createHash('sha256').update(inventoryBytes).digest('hex'),'cbfd5b2567b2f4a46813768e026a3437b9765ce99edab61ec99717602239a438');
  assert.equal(createHash('sha256').update(await fs.readFile('tests/fixtures/f01-product-latch-runtime-executable.json')).digest('hex'),'17df5a255990782207a462960a71ae1d6d624135b71fd7c3a7c4b5fa6cd9155c');
  assert.deepEqual(Object.keys(latch),expected);
  assert.deepEqual(expected.filter(file=>latch[file]!==old[file]),['web/audio-transition-worklet.js','web/audio.js']);
});

test('current executable authority is separate from the immutable historical latch subject',async()=>{
  const file='tests/fixtures/f01-current-runtime-executable.json';
  assert.ok(await fs.access(file).then(()=>true,()=>false),'reviewed current authority must be declared separately');
  const mod=await inventoryModule(),current=JSON.parse(await fs.readFile(file,'utf8')),
    latch=JSON.parse(await fs.readFile('tests/fixtures/f01-product-latch-runtime-executable.json','utf8'));
  assert.deepEqual(Object.keys(current),expected);
  assert.deepEqual(expected.filter(name=>current[name]!==latch[name]),['web/audio-transition-worklet.js','web/audio.js']);
  assert.deepEqual(await mod.runtimeExecutableHashes(path.resolve('.'),expected),current);
  await mod.checkRuntimeInventory(path.resolve('.'));
  await assert.rejects(mod.checkRuntimeInventory(path.resolve('.'),'tests/fixtures/f01-j1-runtime-js.json',
    'tests/fixtures/f01-product-latch-runtime-executable.json'),error=>error?.code==='runtime-executable-changed');
});

test('latch repair keeps the reviewed D pin immutable and changes only its audio pair',async()=>{
  const reviewedBytes=await fs.readFile('tests/fixtures/f01-product-runtime-executable.json');
  assert.equal(createHash('sha256').update(reviewedBytes).digest('hex'),'ae118cf33e5c4be2a60677027aabcc21ea115c37cfa78368c0cdac94d25bed3f');
  const reviewed=JSON.parse(reviewedBytes),latch=JSON.parse(await fs.readFile('tests/fixtures/f01-product-latch-runtime-executable.json','utf8'));
  assert.deepEqual(Object.keys(latch),Object.keys(reviewed));
  assert.deepEqual(expected.filter(file=>latch[file]!==reviewed[file]),['web/audio-transition-worklet.js','web/audio.js']);
});

test('a new nested web script changes the inventory', async t => {
  const mod = await inventoryModule();
  const root = await fixture(t);
  await writeBaselines(root, mod);
  await fs.mkdir(path.join(root, 'web/nested'));
  await fs.writeFile(path.join(root, 'web/nested/new-feature.js'), 'void 0;');
  await assert.rejects(mod.checkRuntimeInventory(root, 'inventory.json', 'executable.json'), error => error?.code === 'runtime-js-inventory-changed');
});

for (const relative of ['styles/new-feature.js', '_locales/ko/new-feature.js']) {
  test(`a new shipped ${relative} changes the inventory`, async t => {
    const mod = await inventoryModule();
    const root = await fixture(t);
    await writeBaselines(root, mod);
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.writeFile(path.join(root, relative), 'void 0;');
    await assert.rejects(mod.checkRuntimeInventory(root, 'inventory.json', 'executable.json'), error => error?.code === 'runtime-js-inventory-changed');
  });
}

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
