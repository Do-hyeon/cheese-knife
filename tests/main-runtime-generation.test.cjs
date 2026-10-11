const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Script } = require('node:vm');
const { pathToFileURL } = require('node:url');

async function mainModule() {
  try { return await import(pathToFileURL(path.resolve('scripts/main-runtime.mjs'))); }
  catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') assert.fail('MAIN runtime generator is missing');
    throw error;
  }
}

async function fixture(t) {
  await fs.mkdir('output', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('output/af03-main-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp('src/main', path.join(root, 'src/main'), { recursive: true });
  await fs.mkdir(path.join(root, 'web'));
  return root;
}

async function withCi(callback) {
  const previous = process.env.CI;
  process.env.CI = '1';
  try { return await callback(); }
  finally { if (previous === undefined) delete process.env.CI; else process.env.CI = previous; }
}

test('MAIN runtime entries and build options are fixed', async () => {
  const mod = await mainModule();
  assert.deepEqual(mod.MAIN_RUNTIME_ENTRIES, [
    { source: 'src/main/runtime/entry.ts', output: 'web/runtime.js', kind: 'runtime' },
    { source: 'src/main/site-adapter/entry.ts', output: 'web/site-adapter.js', kind: 'adapter' },
  ]);
  assert.deepEqual(mod.MAIN_RUNTIME_OPTIONS, {
    bundle: true, format: 'iife', platform: 'browser', target: 'chrome121', minify: false,
    sourcemap: false, legalComments: 'none', charset: 'utf8', treeShaking: true,
  });
});

test('MAIN runtime render is deterministic classic JavaScript with separate graphs', async () => {
  const mod = await mainModule();
  const first = await mod.renderMainRuntime(path.resolve('.'));
  const second = await mod.renderMainRuntime(path.resolve('.'));
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['web/runtime.js', 'web/site-adapter.js']);
  for (const source of Object.values(first)) assert.doesNotThrow(() => new Script(source));
  assert.match(first['web/runtime.js'], /cheese-knife\.runtime\.v1/);
  assert.doesNotMatch(first['web/runtime.js'], /#layout-body|#sidebar|#live_player_layout|#player_layout|\.pzp-pc|#license/);
  assert.match(first['web/site-adapter.js'], /cheese-knife\.runtime\.v1/);
  assert.match(first['web/site-adapter.js'], /runtime\.adapter/);
  const graphs = await mod.inspectMainRuntimeGraphs(path.resolve('.'));
  assert.equal(graphs.adapter.some(file => /src\/main\/runtime\/(?:entry|lifecycle)\.ts$/.test(file)), false);
  assert.equal(graphs.runtime.some(file => /src\/main\/runtime\/entry\.ts$/.test(file)), true);
});

test('MAIN runtime validator rejects a raw adapter publication', async () => {
  const mod = await mainModule();
  const rendered = await mod.renderMainRuntime(path.resolve('.'));
  const unsafe = { ...rendered, 'web/site-adapter.js': rendered['web/site-adapter.js'] + '\nruntime.adapter = { fiberOf: null };\n' };
  assert.throws(() => mod.validateMainRuntime(unsafe), { code: 'main-runtime-raw-adapter' });
});

test('MAIN runtime check is read-only for stale and unexpected outputs', async t => {
  const mod = await mainModule();
  const root = await fixture(t);
  const rendered = await mod.renderMainRuntime(root);
  for (const [file, source] of Object.entries(rendered)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), source);
  }
  await fs.writeFile(path.join(root, 'web/runtime.js'), 'void 0;\n');
  await assert.rejects(mod.checkMainRuntime(root), { code: 'main-runtime-drift' });
  assert.equal(await fs.readFile(path.join(root, 'web/runtime.js'), 'utf8'), 'void 0;\n');
  assert.throws(() => mod.validateMainRuntime({ ...rendered, 'web/extra.js': 'void 0;\n' }), { code: 'main-runtime-output-set' });
});

test('MAIN runtime rejects linked sources and outputs', async t => {
  const mod = await mainModule();
  const root = await fixture(t);
  const linkedSource = path.join(root, 'linked-source');
  await fs.rename(path.join(root, 'src/main'), linkedSource);
  await fs.symlink(linkedSource, path.join(root, 'src/main'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(mod.renderMainRuntime(root), { code: 'owned-path-link' });

  await fs.rm(path.join(root, 'src/main'), { recursive: true });
  await fs.rename(linkedSource, path.join(root, 'src/main'));
  const rendered = await mod.renderMainRuntime(root);
  await fs.rm(path.join(root, 'web'), { recursive: true });
  const linkedOutput = path.join(root, 'linked-output');
  await fs.mkdir(linkedOutput);
  for (const [file, source] of Object.entries(rendered)) await fs.writeFile(path.join(linkedOutput, path.basename(file)), source);
  await fs.symlink(linkedOutput, path.join(root, 'web'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(mod.checkMainRuntime(root), { code: 'owned-path-link' });
});

test('MAIN runtime rejects graph inputs outside the repository and CI writes', async t => {
  const mod = await mainModule();
  const root = await fixture(t);
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.ts`);
  t.after(() => fs.rm(outside, { force: true }));
  await fs.writeFile(outside, 'export const outside = true;\n');
  const entry = path.join(root, 'src/main/runtime/entry.ts');
  const outsideImport = path.relative(path.dirname(entry), outside).split(path.sep).join('/');
  await fs.writeFile(entry, `import '${outsideImport}';\n` + await fs.readFile(entry, 'utf8'));
  await assert.rejects(mod.renderMainRuntime(root), error => ['owned-path-escape', 'main-runtime-source-outside'].includes(error?.code));
  await withCi(() => assert.rejects(mod.writeMainRuntime(path.resolve('.')), { code: 'main-runtime-write-ci' }));
});

test('repository generated MAIN runtime is current and check is read-only', async () => {
  const mod = await mainModule();
  const before = await Promise.all(mod.MAIN_RUNTIME_ENTRIES.map(entry => fs.readFile(entry.output, 'utf8')));
  const report = await mod.checkMainRuntime(path.resolve('.'));
  const after = await Promise.all(mod.MAIN_RUNTIME_ENTRIES.map(entry => fs.readFile(entry.output, 'utf8')));
  assert.deepEqual(after, before);
  assert.deepEqual(Object.keys(report).sort(), ['web/runtime.js', 'web/site-adapter.js']);
});
