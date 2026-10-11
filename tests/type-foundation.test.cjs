const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const contractFiles = ['src/settings/contract.ts', 'src/settings/client.ts', 'src/settings/broker.ts'];
const generatedFiles = ['settings-contract.js', 'settings-client.js', 'settings-broker.js'];
const requiredTrue = ['allowJs', 'checkJs', 'noEmit', 'strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'useUnknownInCatchVariables'];

test('AF02 tsconfig has the strict no-emit contract and narrow include', async () => {
  const config = JSON.parse(await fs.readFile('tsconfig.json', 'utf8'));
  for (const option of requiredTrue) assert.equal(config.compilerOptions[option], true, `${option} must be true`);
  assert.equal(Object.hasOwn(config.compilerOptions, 'skipLibCheck'), false);
  assert.deepEqual(config.compilerOptions.types, ['chrome']);
  assert.deepEqual(config.include, ['config.js', 'style-schema.js', 'src/settings/**/*.ts', 'build-proof/**/*.ts']);
  await assert.rejects(fs.access('tsconfig.af01.json'));
  await assert.rejects(fs.access('types/knife-settings.d.ts'));
});

test('contract files contain no type-check bypass', async () => {
  for (const file of contractFiles) {
    const source = await fs.readFile(file, 'utf8');
    assert.doesNotMatch(source, /@ts-(?:ignore|nocheck)|\bany\b/, file);
    assert.doesNotMatch(source, /^\s*(?:import|export)\b/m, file);
  }
});

test('settings TypeScript and generated JavaScript use LF in Git', () => {
  const files = [...contractFiles, ...generatedFiles];
  const result = spawnSync('git', ['check-attr', 'eol', '--', ...files], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const file of files) assert.match(result.stdout, new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: eol: lf`));
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

test('AF02 typecheck passes without diagnostics', () => {
  const result = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
