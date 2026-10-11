const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const expected = {
  typescript: { version: '7.0.2', license: 'Apache-2.0' },
  '@types/chrome': { version: '0.2.8', license: 'MIT' },
  esbuild: { version: '0.28.2', license: 'MIT' },
};
const packageBins = {
  typescript: { tsc: './bin/tsc' },
  esbuild: { esbuild: 'bin/esbuild' },
};

function companionNames() {
  const platform = process.platform === 'win32' ? 'win32' : process.platform;
  const arch = process.arch === 'x64' ? 'x64' : process.arch;
  return {
    typescript: `@typescript/typescript-${platform}-${arch}`,
    esbuild: `@esbuild/${platform}-${arch}`,
  };
}

function companionTargets(companions) {
  return {
    [companions.typescript]: process.platform === 'win32' ? 'lib/tsc.exe' : 'lib/tsc',
    [companions.esbuild]: process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild',
  };
}

async function toolchainModule() {
  const url = pathToFileURL(path.resolve('scripts/check-toolchain.mjs')).href;
  const mod = await import(url).catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === url) return {};
    throw error;
  });
  assert.equal(typeof mod.inspectToolchain, 'function', 'toolchain inspection must exist');
  assert.equal(typeof mod.checkToolchain, 'function', 'toolchain validation must exist');
  assert.deepEqual(mod.TOOLCHAIN_CONTRACT, expected);
  return mod;
}

async function fixture(t, mutate = () => {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-toolchain-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const companions = companionNames();
  const packageJson = { private: true, devDependencies: Object.fromEntries(Object.entries(expected).map(([name, value]) => [name, value.version])) };
  const packages = {
    '': { devDependencies: { ...packageJson.devDependencies } },
  };
  const addPackage = (name, version, license, extra = {}) => {
    packages[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`,
      integrity: `sha512-fixture-${name}`,
      dev: true,
      license,
      ...extra,
    };
  };
  for (const [name, value] of Object.entries(expected)) addPackage(name, value.version, value.license);
  addPackage(companions.typescript, expected.typescript.version, expected.typescript.license, { optional: true });
  addPackage(companions.esbuild, expected.esbuild.version, expected.esbuild.license, { optional: true });
  const lock = { name: 'fixture', version: '1.0.0', lockfileVersion: 3, requires: true, packages };
  const nativeTargets = companionTargets(companions);
  const state = { root, companions, nativeTargets, packageJson, lock, missingExecutables: new Set() };
  mutate(state);
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(packageJson));
  await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify(lock));
  for (const [name, entry] of Object.entries(packages)) {
    if (!name) continue;
    const folder = path.join(root, ...name.split('/'));
    await fs.mkdir(folder, { recursive: true });
    const packageName = name.slice('node_modules/'.length);
    await fs.writeFile(path.join(folder, 'package.json'), JSON.stringify({ name: packageName, version: entry.version, license: entry.license, ...(packageBins[packageName] ? { bin: packageBins[packageName] } : {}) }));
    for (const [command, relative] of Object.entries(packageBins[packageName] || {})) {
      if (state.missingExecutables.has(command)) continue;
      const target = path.join(folder, ...relative.replace(/^\.\//, '').split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, 'fixture');
    }
    const nativeTarget = nativeTargets[packageName];
    if (nativeTarget) {
      const target = path.join(folder, ...nativeTarget.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, 'fixture');
    }
  }
  const bin = path.join(root, 'node_modules', '.bin');
  await fs.mkdir(bin, { recursive: true });
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  for (const command of ['tsc', 'esbuild']) {
    if (!state.missingExecutables.has(command)) await fs.writeFile(path.join(bin, `${command}${suffix}`), 'fixture');
  }
  return state;
}

test('complete exact toolchain reports direct packages, companions, and executables', async t => {
  const { checkToolchain } = await toolchainModule();
  const state = await fixture(t);
  const report = await checkToolchain(state.root);
  assert.deepEqual(Object.fromEntries(report.packages.map(row => [row.name, { version: row.version, license: row.license }])), expected);
  assert.deepEqual(report.companions.map(row => row.name).sort(), Object.values(state.companions).sort());
  assert.deepEqual(report.executables, ['esbuild', 'tsc']);
  assert.deepEqual(report.nativeExecutables, ['esbuild', 'tsc']);
});

test('dependency ranges and incomplete lock metadata are rejected', async t => {
  const { checkToolchain } = await toolchainModule();
  for (const mutation of [
    state => { state.packageJson.devDependencies.typescript = '^7.0.2'; state.lock.packages[''].devDependencies.typescript = '^7.0.2'; },
    state => { delete state.lock.packages['node_modules/esbuild'].integrity; },
    state => { delete state.lock.packages['node_modules/@types/chrome'].license; },
  ]) {
    const state = await fixture(t, mutation);
    await assert.rejects(checkToolchain(state.root), error => error?.code === 'toolchain-contract-invalid');
  }
});

test('missing package launcher is a distinct incomplete installation', async t => {
  const { checkToolchain } = await toolchainModule();
  const state = await fixture(t, value => value.missingExecutables.add('esbuild'));
  await assert.rejects(checkToolchain(state.root), error => error?.code === 'toolchain-executable-missing');
});

test('missing companion native binaries are distinct incomplete installations', async t => {
  const { checkToolchain } = await toolchainModule();
  for (const parent of ['typescript', 'esbuild']) {
    const state = await fixture(t);
    const packageName = state.companions[parent];
    const target = state.nativeTargets[packageName];
    await fs.rm(path.join(state.root, 'node_modules', ...packageName.split('/'), ...target.split('/')));
    await assert.rejects(checkToolchain(state.root), error => error?.code === 'toolchain-executable-missing');
  }
});

test('package executable targets do not depend on npm shim file type', async t => {
  const { checkToolchain } = await toolchainModule();
  const state = await fixture(t);
  await fs.rm(path.join(state.root, 'node_modules', '.bin'), { recursive: true });
  const report = await checkToolchain(state.root);
  assert.deepEqual(report.executables, ['esbuild', 'tsc']);
});

test('missing or redirected package bin targets are rejected', async t => {
  const { checkToolchain } = await toolchainModule();
  const missing = await fixture(t);
  await fs.rm(path.join(missing.root, 'node_modules', 'esbuild', 'bin', 'esbuild'));
  await assert.rejects(checkToolchain(missing.root), error => error?.code === 'toolchain-executable-missing');

  const redirected = await fixture(t);
  const metadataPath = path.join(redirected.root, 'node_modules', 'typescript', 'package.json');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  metadata.bin.tsc = '../outside';
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
  await assert.rejects(checkToolchain(redirected.root), error => error?.code === 'toolchain-contract-invalid');
});

test('platform companion version, integrity, and license must match its parent', async t => {
  const { checkToolchain } = await toolchainModule();
  for (const mutation of [
    state => { state.lock.packages[`node_modules/${state.companions.typescript}`].version = '7.0.1'; },
    state => { delete state.lock.packages[`node_modules/${state.companions.esbuild}`].integrity; },
    state => { state.lock.packages[`node_modules/${state.companions.esbuild}`].license = 'UNKNOWN'; },
  ]) {
    const state = await fixture(t, mutation);
    await assert.rejects(checkToolchain(state.root), error => error?.code === 'toolchain-contract-invalid');
  }
});
