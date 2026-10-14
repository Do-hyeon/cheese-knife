const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const entries = [
  { source: 'src/settings/media-profiles.ts', output: 'media-profiles.js', global: 'KnifeMediaProfiles' },
  { source: 'src/settings/gain-authority.ts', output: 'gain-authority.js', global: 'createPlayerGainAuthority' },
  { source: 'src/settings/config.ts', output: 'config.js', global: 'KnifeHostPolicy' },
  { source: 'src/settings/style-schema.ts', output: 'style-schema.js', global: 'STYLES' },
  { source: 'src/settings/contract.ts', output: 'settings-contract.js', global: 'KnifeSettingsContract' },
  { source: 'src/settings/client.ts', output: 'settings-client.js', global: 'createSettingsClient' },
  { source: 'src/settings/broker.ts', output: 'settings-broker.js', global: 'createSettingsBroker' },
  { source: 'src/settings/background.ts', output: 'background.js', global: null },
  { source: 'src/settings/permission.ts', output: 'permission.js', global: null },
  { source: 'src/settings/popup.ts', output: 'popup.js', global: null },
  { source: 'src/settings/styles.ts', output: 'styles.js', global: null },
  { source: 'src/settings/bridge.ts', output: 'web/main.js', global: 'initStyleParameters' },
];

async function runtimeModule() {
  return import(pathToFileURL(path.resolve('scripts/settings-runtime.mjs')));
}

async function withCi(value, callback) {
  const previous = process.env.CI;
  if (value === undefined) delete process.env.CI; else process.env.CI = value;
  try { return await callback(); } finally {
    if (previous === undefined) delete process.env.CI; else process.env.CI = previous;
  }
}

async function fixture(t) {
  await fs.mkdir('output', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('output/af02-settings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src/settings'), { recursive: true });
  await fs.mkdir(path.join(root, 'web'));
  for (const entry of entries) {
    await fs.writeFile(path.join(root, entry.source), entry.global ? `var ${entry.global} = () => ${JSON.stringify(entry.global)};\n` : '(() => { document.title = "fixture"; })();\n');
  }
  return root;
}

test('settings runtime entries and transform options are fixed', async () => {
  const mod = await runtimeModule();
  assert.deepEqual(mod.SETTINGS_RUNTIME_ENTRIES, entries);
  assert.deepEqual(mod.SETTINGS_RUNTIME_OPTIONS, {
    loader: 'ts', target: 'chrome121', minify: false, sourcemap: false, legalComments: 'none',
  });
});

test('render is deterministic and write creates exactly the checked runtime files', async t => {
  const mod = await runtimeModule();
  const root = await fixture(t);
  const first = await mod.renderSettingsRuntime(root);
  const second = await mod.renderSettingsRuntime(root);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), entries.map(entry => entry.output).sort());
  for (const entry of entries) if (entry.global) assert.match(first[entry.output], new RegExp(`\\bvar ${entry.global}\\b`));
  await assert.rejects(mod.checkSettingsRuntime(root), { code: 'settings-runtime-drift' });
  await withCi(undefined, () => mod.writeSettingsRuntime(root));
  assert.deepEqual((await fs.readdir(root)).sort(), [...entries.map(entry => entry.output).filter(file => !file.includes('/')), 'src', 'web'].sort());
  const report = await mod.checkSettingsRuntime(root);
  assert.deepEqual(report.files, entries.map(entry => entry.output));
  assert.deepEqual(Object.keys(report.hashes).sort(), entries.map(entry => entry.output).sort());
});

test('check is read-only when committed output is stale', async t => {
  const mod = await runtimeModule();
  const root = await fixture(t);
  for (const entry of entries) await fs.writeFile(path.join(root, entry.output), 'stale\n');
  const before = await Promise.all(entries.flatMap(entry => [entry.source, entry.output]).map(file => fs.readFile(path.join(root, file))));
  await assert.rejects(mod.checkSettingsRuntime(root), { code: 'settings-runtime-drift' });
  const after = await Promise.all(entries.flatMap(entry => [entry.source, entry.output]).map(file => fs.readFile(path.join(root, file))));
  assert.deepEqual(after, before);
});

test('module sources, linked inputs, and invalid generated artifacts are rejected', async t => {
  const mod = await runtimeModule();
  const root = await fixture(t);
  await fs.writeFile(path.join(root, entries[0].source), 'export const value = 1;\n');
  await assert.rejects(mod.renderSettingsRuntime(root), { code: 'settings-runtime-source-module' });
  await fs.writeFile(path.join(root, entries[0].source), `var ${entries[0].global} = {}; export { ${entries[0].global} };\n`);
  await assert.rejects(mod.renderSettingsRuntime(root), { code: 'settings-runtime-source-module' });
  await fs.writeFile(path.join(root, entries[0].source), `var ${entries[0].global} = {}; import helper = require("./helper");\n`);
  await assert.rejects(mod.renderSettingsRuntime(root), { code: 'settings-runtime-source-module' });

  const linkedSettings = path.join(root, 'linked-settings');
  await fs.mkdir(linkedSettings);
  for (const entry of entries) await fs.writeFile(path.join(linkedSettings, path.basename(entry.source)), entry.global ? `var ${entry.global} = 1;\n` : '(() => {})();\n');
  await fs.rm(path.join(root, 'src/settings'), { recursive: true });
  await fs.symlink(linkedSettings, path.join(root, 'src/settings'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(mod.renderSettingsRuntime(root), { code: 'owned-path-link' });

  const clean = Object.fromEntries(entries.map(entry => [entry.output, entry.global ? `var ${entry.global} = 1;\n` : '(() => {})();\n']));
  for (const [code, source] of [
    ['settings-runtime-source-map', '//# sourceMappingURL=runtime.js.map'],
    ['proof-eval', 'eval("x")'],
    ['proof-function-constructor', 'new Function("x")'],
    ['proof-remote-url', 'fetch("https://example.test")'],
    ['proof-windows-path', 'const value = "C:\\\\Users\\\\name\\\\repo"'],
    ['proof-posix-path', 'const value = "/home/runner/repo"'],
    ['proof-timestamp', 'const value = "2026-10-12T12:34:56.000Z"'],
  ]) {
    const outputs = { ...clean, [entries[0].output]: `${clean[entries[0].output]}${source};\n` };
    assert.throws(() => mod.validateSettingsRuntime(outputs, ['runner-host']), error => error?.code === code, code);
  }
  const identityOutputs = { ...clean, [entries[0].output]: `${clean[entries[0].output]}const host = "runner-host";\n` };
  assert.throws(() => mod.validateSettingsRuntime(identityOutputs, ['runner-host']), { code: 'proof-environment-identity' });
  const firstParty = { ...clean, [entries[0].output]: `${clean[entries[0].output]}const origin = "https://chzzk.naver.com";\n` };
  assert.throws(() => mod.validateSettingsRuntime(firstParty, ['runner-host']), { code: 'proof-remote-url' });
  const originCheck = { ...clean, [entries[0].output]: `${clean[entries[0].output]}if (new URL(value).origin !== "https://chzzk.naver.com") throw new Error();\n` };
  assert.doesNotThrow(() => mod.validateSettingsRuntime(originCheck, ['runner-host']));
  const remoteImport = { ...clean, [entries[0].output]: `${clean[entries[0].output]}import("https://chzzk.naver.com");\n` };
  assert.throws(() => mod.validateSettingsRuntime(remoteImport, ['runner-host']), { code: 'proof-remote-import' });
  const hostPolicy = { ...clean, 'config.js': 'var KnifeHostPolicy = Object.freeze({ origins: Object.freeze(["https://chzzk.naver.com/*"]) });\n' };
  assert.doesNotThrow(() => mod.validateSettingsRuntime(hostPolicy, ['runner-host']));
  assert.throws(() => mod.validateSettingsRuntime({ ...hostPolicy, 'config.js': hostPolicy['config.js'] + 'fetch("https://chzzk.naver.com/*");\n' }, ['runner-host']), { code: 'proof-remote-url' });
  const svg = { ...clean, 'web/main.js': 'const initStyleParameters = () => document.createElementNS("http://www.w3.org/2000/svg", "svg");\n' };
  assert.doesNotThrow(() => mod.validateSettingsRuntime(svg, ['runner-host']));
  assert.throws(() => mod.validateSettingsRuntime({ ...svg, 'web/main.js': svg['web/main.js'] + 'fetch("http://www.w3.org/2000/svg");\n' }, ['runner-host']), { code: 'proof-remote-url' });
  const hiddenGlobal = { ...clean, [entries[0].output]: '(() => { var KnifeSettingsContract = 1; })();\n' };
  assert.throws(() => mod.validateSettingsRuntime(hiddenGlobal, ['runner-host']), { code: 'settings-runtime-global' });
  const importMeta = { ...clean, [entries[0].output]: `${clean[entries[0].output]}console.log(import.meta.url);\n` };
  assert.throws(() => mod.validateSettingsRuntime(importMeta, ['runner-host']), { code: 'settings-runtime-source-module' });
  assert.throws(() => mod.validateSettingsRuntime({}), { code: 'settings-runtime-output-set' });
  assert.throws(() => mod.validateSettingsRuntime({ ...clean, [entries[0].output]: 'var WrongGlobal = 1;\n' }), { code: 'settings-runtime-global' });

  const previousUsername = process.env.USERNAME;
  process.env.USERNAME = 'styles';
  try {
    const ordinarySource = { ...clean, [entries[0].output]: `${clean[entries[0].output]}const section = "styles";\n` };
    assert.doesNotThrow(() => mod.validateSettingsRuntime(ordinarySource));
  } finally {
    if (previousUsername === undefined) delete process.env.USERNAME; else process.env.USERNAME = previousUsername;
  }
});

test('write is forbidden in CI', async t => {
  const mod = await runtimeModule();
  const root = await fixture(t);
  await withCi('1', () => assert.rejects(mod.writeSettingsRuntime(root), { code: 'settings-runtime-write-ci' }));
});

test('repository generated settings runtime is current and check is read-only', async () => {
  const mod = await runtimeModule();
  const files = entries.flatMap(entry => [entry.source, entry.output]);
  const before = await Promise.all(files.map(file => fs.readFile(file)));
  await mod.checkSettingsRuntime(path.resolve('.'));
  const after = await Promise.all(files.map(file => fs.readFile(file)));
  assert.deepEqual(after, before);
});
