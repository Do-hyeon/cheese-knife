import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openOwnedRoot } from './owned-files.mjs';

export const TOOLCHAIN_CONTRACT = {
  typescript: { version: '7.0.2', license: 'Apache-2.0' },
  '@types/chrome': { version: '0.2.8', license: 'MIT' },
  esbuild: { version: '0.28.2', license: 'MIT' },
};

const fail = (code, message) => Object.assign(new Error(message), { code });
const ownValue = (record, key) => Object.getOwnPropertyDescriptor(record || {}, key)?.value;

function companionNames() {
  const platform = process.platform === 'win32' ? 'win32' : process.platform;
  const arch = process.arch === 'x64' ? 'x64' : process.arch;
  return {
    typescript: `@typescript/typescript-${platform}-${arch}`,
    esbuild: `@esbuild/${platform}-${arch}`,
  };
}

export async function inspectToolchain(root = process.cwd()) {
  const owned = await openOwnedRoot(root);
  const packageJson = JSON.parse(await owned.readFile('package.json', 'utf8'));
  const lock = JSON.parse(await owned.readFile('package-lock.json', 'utf8'));
  const packages = Object.entries(TOOLCHAIN_CONTRACT).map(([name, contract]) => ({
    name,
    requested: ownValue(packageJson.devDependencies, name),
    contract,
    lock: ownValue(lock.packages, `node_modules/${name}`),
  }));
  const companions = Object.entries(companionNames()).map(([parent, name]) => ({
    parent,
    name,
    lock: ownValue(lock.packages, `node_modules/${name}`),
  }));
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  const executables = [];
  for (const name of ['esbuild', 'tsc']) {
    try {
      if (await owned.resolve(`node_modules/.bin/${name}${suffix}`, { type: 'file', optional: true })) executables.push(name);
    } catch {}
  }
  return { packageJson, lock, packages, companions, executables };
}

export async function checkToolchain(root = process.cwd()) {
  const report = await inspectToolchain(root);
  const owned = await openOwnedRoot(root);
  const invalid = [];

  for (const item of report.packages) {
    const installed = JSON.parse(await owned.readFile(`node_modules/${item.name}/package.json`, 'utf8'));
    const { name, requested, contract, lock } = item;
    if (requested !== contract.version) invalid.push(`${name} must be pinned to ${contract.version}`);
    if (!lock || lock.version !== contract.version || lock.license !== contract.license || lock.dev !== true || !lock.integrity || !lock.resolved) {
      invalid.push(`${name} lock metadata does not match the contract`);
    }
    if (installed.version !== contract.version || installed.license !== contract.license) {
      invalid.push(`${name} installed metadata does not match the contract`);
    }
  }

  for (const item of report.companions) {
    const contract = TOOLCHAIN_CONTRACT[item.parent];
    const lock = item.lock;
    if (!lock || lock.version !== contract.version || lock.license !== contract.license || lock.dev !== true || !lock.integrity || !lock.resolved) {
      invalid.push(`${item.name} lock metadata does not match ${item.parent}`);
    }
  }

  if (invalid.length) throw fail('toolchain-contract-invalid', invalid.join('\n'));
  if (report.executables.length !== 2) {
    throw fail('toolchain-executable-missing', 'tsc and esbuild executables must both be installed');
  }

  return {
    packages: report.packages.map(({ name, lock }) => ({ name, version: lock.version, license: lock.license })),
    companions: report.companions.map(({ parent, name, lock }) => ({ parent, name, version: lock.version, license: lock.license })),
    executables: report.executables,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkToolchain().then(report => console.log(JSON.stringify(report, null, 2))).catch(error => {
    console.error(`${error.code ?? 'toolchain-check-failed'}: ${error.message}`);
    process.exitCode = 1;
  });
}
