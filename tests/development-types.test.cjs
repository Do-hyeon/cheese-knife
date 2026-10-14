const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** @param {string} config */
function compile(config) {
  return spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', config], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
}

test('development typecheck covers the helper and consumers without weakening product typing', async () => {
  const config = JSON.parse(await fs.readFile('tsconfig.development.json', 'utf8'));
  for (const option of ['allowJs', 'checkJs', 'noEmit', 'strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'useUnknownInCatchVariables']) {
    assert.equal(config.compilerOptions[option], true, option);
  }
  assert.equal(Object.hasOwn(config.compilerOptions, 'skipLibCheck'), false);
  assert.deepEqual(config.compilerOptions.types, ['node']);
  assert.deepEqual(config.files, ['scripts/extension-e2e/popup-cdp.mjs','tests/helpers.cjs', 'tests/bridge.test.cjs', 'tests/helper-contracts.test.cjs', 'tests/development-types.test.cjs']);
  const product = JSON.parse(await fs.readFile('tsconfig.json', 'utf8'));
  assert.equal(product.compilerOptions.allowJs, false);
  assert.deepEqual(product.compilerOptions.types, ['chrome']);
});

test('both foundation platforms run the separate development typecheck', async () => {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  assert.equal(pkg.scripts['typecheck:development'], 'tsc -p tsconfig.development.json');
  const ci = await fs.readFile('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /os: \[windows-latest, ubuntu-latest\]/);
  assert.match(ci, /npm run typecheck && npm run typecheck:development && npm run check:settings-runtime/);
});

test('strict development typecheck has no diagnostics', () => {
  const result = compile('tsconfig.development.json');
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

for (const proof of [
  { name: 'HTML argument', code: 'page(42);', diagnostic: 'TS2345' },
  { name: 'script path', code: 'load(page(), 42);', diagnostic: 'TS2345' },
  { name: 'clock advance', code: "clock(page()).advance('30');", diagnostic: 'TS2345' },
  { name: 'runtime field', code: 'const api = runtime(page()); assert.ok(api); api.nonexistentField;', diagnostic: 'TS2339' },
  { name: 'absent runtime', code: 'runtime(page()).requestId;', diagnostic: 'TS2532|TS18048' },
  { name: 'valid and raw inputs', code: "const dom = page('', 'https://chzzk.naver.com/'); load(dom, 'web/runtime.js'); const api = runtime(dom); assert.ok(api); api.requestId; clock(dom).advance(30); const raw = /** @type {unknown} */ (null); deliver(dom, raw, raw);", diagnostic: '' },
]) test('helper compiler proof: ' + proof.name, async t => {
  await fs.mkdir('output', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('output/development-types-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'proof.cjs');
  await fs.writeFile(file, `const { page, load, runtime, deliver, clock } = require(${JSON.stringify(path.resolve('tests/helpers.cjs'))});\nconst assert = require('node:assert/strict');\n${proof.code}\n`);
  const config = path.join(root, 'tsconfig.json');
  await fs.writeFile(config, JSON.stringify({ extends: path.resolve('tsconfig.development.json'), files: [file], include: [] }));
  const result = compile(config);
  assert.ifError(result.error);
  const diagnostics = result.stdout + result.stderr;
  if (!proof.diagnostic) assert.equal(result.status, 0, diagnostics);
  else {
    assert.ok(result.status !== null && result.status > 0, diagnostics);
    const lines = diagnostics.trim().split(/\r?\n/);
    assert.ok(lines.length > 0);
    for (const line of lines) {
      assert.match(line, /proof\.cjs\(3,\d+\): error /, diagnostics);
      assert.match(line, new RegExp(proof.diagnostic), diagnostics);
    }
  }
});
