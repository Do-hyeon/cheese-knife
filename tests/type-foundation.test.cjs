const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const contractFiles = ['config.js', 'style-schema.js', 'settings-contract.js', 'settings-client.js', 'settings-broker.js'];
const requiredTrue = ['allowJs', 'checkJs', 'noEmit', 'strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'useUnknownInCatchVariables'];

test('AF01 tsconfig has the strict no-emit contract and narrow include', async () => {
  const config = JSON.parse(await fs.readFile('tsconfig.af01.json', 'utf8'));
  for (const option of requiredTrue) assert.equal(config.compilerOptions[option], true, `${option} must be true`);
  assert.equal(Object.hasOwn(config.compilerOptions, 'skipLibCheck'), false);
  assert.deepEqual(config.compilerOptions.types, ['chrome']);
  assert.deepEqual(config.include, [...contractFiles, 'types/**/*.d.ts', 'build-proof/**/*.ts']);
});

test('contract files contain no type-check bypass', async () => {
  for (const file of contractFiles) {
    const source = await fs.readFile(file, 'utf8');
    assert.doesNotMatch(source, /@ts-(?:ignore|nocheck)|@type\s*{\s*any\s*}/, file);
  }
});

test('the independent strict checkJs negative control fails', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-type-negative-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'bad.js'), "const af01TypeError = /** @type {number} */ ('wrong');\n");
  await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    allowJs: true, checkJs: true, noEmit: true, strict: true, noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true, useUnknownInCatchVariables: true, target: 'ES2022', lib: ['ES2023', 'DOM'],
  }, include: ['bad.js'] }));
  const result = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', path.join(root, 'tsconfig.json')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'negative control must fail');
  assert.match(result.stdout + result.stderr, /TS2322|TS2352/);
});

test('AF01 typecheck passes without diagnostics', () => {
  const result = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.af01.json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
