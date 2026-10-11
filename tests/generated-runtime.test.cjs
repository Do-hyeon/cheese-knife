const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const entries = [{ source: 'src/entry.ts', output: 'web/runtime.js' }];
const codes = {
  outputSet: 'fixture-output-set',
  syntax: 'fixture-syntax',
  sourceMap: 'fixture-source-map',
  forbidden: 'fixture-forbidden',
  nondeterministic: 'fixture-nondeterministic',
  drift: 'fixture-drift',
  writeCi: 'fixture-write-ci',
};

async function generatedModule() {
  try {
    return await import(pathToFileURL(path.resolve('scripts/generated-runtime.mjs')));
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') assert.fail('generated runtime module is missing');
    throw error;
  }
}

async function fixture(t) {
  await fs.mkdir('output', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('output/af03-generated-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'web'));
  return root;
}

async function withCi(value, callback) {
  const previous = process.env.CI;
  if (value === undefined) delete process.env.CI; else process.env.CI = value;
  try { return await callback(); } finally {
    if (previous === undefined) delete process.env.CI; else process.env.CI = previous;
  }
}

test('classic runtime options retain deterministic Chrome output', async () => {
  const mod = await generatedModule();
  assert.deepEqual(mod.CLASSIC_RUNTIME_OPTIONS, {
    target: 'chrome121', minify: false, sourcemap: false, legalComments: 'none', charset: 'utf8',
  });
});

test('classic validation rejects syntax, module loaders, dynamic code, maps, and remote imports', async () => {
  const { validateClassicRuntime } = await generatedModule();
  assert.doesNotThrow(() => validateClassicRuntime('void 0;\n', [], codes));
  for (const [source, code] of [
    ['const = ;', codes.syntax],
    ['require("fixture")', codes.forbidden],
    ['import("./fixture.js")', codes.forbidden],
    ['console.log(import.meta.url)', codes.syntax],
    ['eval("fixture")', 'proof-eval'],
    ['new Function("fixture")', 'proof-function-constructor'],
    ['import("https://example.invalid/module.js")', 'proof-remote-import'],
    ['//# sourceMappingURL=runtime.js.map', codes.sourceMap],
  ]) {
    assert.throws(() => validateClassicRuntime(source, [], codes), error => error?.code === code, source);
  }
});

test('generated check rejects unexpected outputs and nondeterministic renders', async t => {
  const mod = await generatedModule();
  const root = await fixture(t);
  await fs.writeFile(path.join(root, entries[0].output), 'void 0;\n');
  await assert.rejects(mod.checkGeneratedRuntime(root, entries, async () => ({}), codes), { code: codes.outputSet });
  let run = 0;
  await assert.rejects(mod.checkGeneratedRuntime(root, entries, async () => ({
    [entries[0].output]: `void ${run++};\n`,
  }), codes), { code: codes.nondeterministic });
});

test('generated check is read-only when a committed output is stale', async t => {
  const mod = await generatedModule();
  const root = await fixture(t);
  const committed = 'void 1;\n';
  await fs.writeFile(path.join(root, entries[0].output), committed);
  await assert.rejects(mod.checkGeneratedRuntime(root, entries, async () => ({
    [entries[0].output]: 'void 0;\n',
  }), codes), { code: codes.drift });
  assert.equal(await fs.readFile(path.join(root, entries[0].output), 'utf8'), committed);
});

test('generated write creates the exact outputs and is forbidden in CI', async t => {
  const mod = await generatedModule();
  const root = await fixture(t);
  const render = async () => ({ [entries[0].output]: 'void 0;\n' });
  await withCi(undefined, () => mod.writeGeneratedRuntime(root, entries, render, codes));
  assert.equal(await fs.readFile(path.join(root, entries[0].output), 'utf8'), 'void 0;\n');
  await withCi('1', () => assert.rejects(mod.writeGeneratedRuntime(root, entries, render, codes), { code: codes.writeCi }));
});

test('generated check rejects a linked output parent', async t => {
  const mod = await generatedModule();
  const root = await fixture(t);
  const linked = path.join(root, 'linked-output');
  await fs.mkdir(linked);
  await fs.writeFile(path.join(linked, 'runtime.js'), 'void 0;\n');
  await fs.rm(path.join(root, 'web'), { recursive: true });
  await fs.symlink(linked, path.join(root, 'web'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(mod.checkGeneratedRuntime(root, entries, async () => ({
    [entries[0].output]: 'void 0;\n',
  }), codes), { code: 'owned-path-link' });
});
