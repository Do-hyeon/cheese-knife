const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function proofModule() {
  return import(pathToFileURL(path.resolve('scripts/check-build-proof.mjs')));
}

const cleanRun = () => ({
  outputs: Object.fromEntries(['background.js', 'extension-page.js', 'isolated.js', 'main.js'].map(name => [name, `(() => { console.log(${JSON.stringify(name)}) })();\n`])),
  metafile: { inputs: Object.fromEntries(['background.ts', 'extension-page.ts', 'isolated.ts', 'main.ts', 'shared.ts'].map(name => [`build-proof/${name}`, { bytes: 1, imports: [] }])), outputs: {} },
});

test('proof contexts and build options are fixed', async () => {
  const mod = await proofModule();
  assert.deepEqual(mod.PROOF_CONTEXTS, ['background', 'extension-page', 'isolated', 'main']);
  assert.deepEqual(mod.PROOF_OPTIONS, { bundle: true, format: 'iife', platform: 'browser', target: 'chrome121', minify: false, sourcemap: false, treeShaking: false, metafile: true, write: false });
});

test('artifact negative table fails with distinct codes', async () => {
  const mod = await proofModule();
  const cases = [
    ['proof-eval', 'eval("x")'], ['proof-function-constructor', 'new Function("x")'],
    ['proof-remote-import', 'import("https://example.test/x.js")'], ['proof-remote-url', 'fetch("https://example.test")'],
    ['proof-source-map', null, 'main.js.map'], ['proof-windows-path', 'C:\\\\Users\\\\name\\\\repo'],
    ['proof-temp-path', '/tmp/af01-proof-x'], ['proof-timestamp', '2026-10-12T12:34:56.000Z'],
  ];
  for (const [code, content, outputName = 'main.js'] of cases) {
    const run = cleanRun();
    if (outputName !== 'main.js') run.outputs[outputName] = 'map'; else run.outputs['main.js'] = content;
    assert.throws(() => mod.inspectProofRun(run), error => error?.code === code, code);
  }
  const dependency = cleanRun(); dependency.metafile.inputs['node_modules/unapproved/index.js'] = { bytes: 1, imports: [] };
  assert.throws(() => mod.inspectProofRun(dependency), error => error?.code === 'proof-unexpected-dependency');

  const posixPath = cleanRun(); posixPath.outputs['main.js'] = 'const leaked = "/home/runner/work/repository/main.js";';
  assert.throws(() => mod.inspectProofRun(posixPath), error => error?.code === 'proof-posix-path');

  const uncommonPosixPath = cleanRun(); uncommonPosixPath.outputs['main.js'] = 'const leaked = "/data/build/repository/main.js";';
  assert.throws(() => mod.inspectProofRun(uncommonPosixPath), error => error?.code === 'proof-posix-path');

  const identity = cleanRun(); identity.outputs['main.js'] = 'const leaked = "runner-host";';
  assert.throws(() => mod.inspectProofRun(identity, ['runner-host']), error => error?.code === 'proof-environment-identity');

  const embeddedIdentity = cleanRun(); embeddedIdentity.outputs['main.js'] = 'const leaked = "host:runner-host";';
  assert.throws(() => mod.inspectProofRun(embeddedIdentity, ['runner-host']), error => error?.code === 'proof-environment-identity');

  const shortIdentity = cleanRun(); shortIdentity.outputs['main.js'] = 'const leaked = "x"; const extra = "example";';
  assert.throws(() => mod.inspectProofRun(shortIdentity, ['x']), error => error?.code === 'proof-environment-identity');

  const embeddedShortIdentity = cleanRun(); embeddedShortIdentity.outputs['main.js'] = 'const leaked = "host:x"; const allowed = "example";';
  assert.throws(() => mod.inspectProofRun(embeddedShortIdentity, ['x']), error => error?.code === 'proof-environment-identity');

  const shortSubstringOnly = cleanRun(); shortSubstringOnly.outputs['main.js'] = 'const allowed = "example";';
  assert.doesNotThrow(() => mod.inspectProofRun(shortSubstringOnly, ['x']));

  const twoCharacterSubstringOnly = cleanRun(); twoCharacterSubstringOnly.outputs['main.js'] = 'const allowed = "proxy";';
  assert.doesNotThrow(() => mod.inspectProofRun(twoCharacterSubstringOnly, ['xy']));

  const twoCharacterIdentity = cleanRun(); twoCharacterIdentity.outputs['main.js'] = 'const leaked = "host:xy";';
  assert.throws(() => mod.inspectProofRun(twoCharacterIdentity, ['xy']), error => error?.code === 'proof-environment-identity');
});

test('browser source inspection is reusable without changing proof errors', async () => {
  const mod = await proofModule();
  assert.doesNotThrow(() => mod.inspectBrowserSource('const local = "safe";', ['runner-host']));
  assert.throws(() => mod.inspectBrowserSource('eval("x")', ['runner-host']), { code: 'proof-eval' });
  assert.throws(() => mod.inspectBrowserSource('const host = "runner-host";', ['runner-host']), { code: 'proof-environment-identity' });
});

test('different proof runs are rejected', async () => {
  const mod = await proofModule();
  const left = mod.inspectProofRun(cleanRun());
  const changed = cleanRun(); changed.outputs['main.js'] += 'void 0;';
  assert.throws(() => mod.compareProofRuns(left, mod.inspectProofRun(changed)), error => error?.code === 'proof-nondeterministic');
});

test('metafile byte counts do not make the logical graph OS-dependent', async () => {
  const mod = await proofModule();
  const left = cleanRun(), right = cleanRun();
  right.metafile.inputs['build-proof/shared.ts'].bytes = 99;
  assert.equal(mod.inspectProofRun(left).graphHash, mod.inspectProofRun(right).graphHash);
});

test('runner source cannot import network modules', async () => {
  const source = await fs.readFile('scripts/check-build-proof.mjs', 'utf8');
  assert.doesNotMatch(source, /node:(?:http|https|net|tls|dns)/);
});

test('repository proof matches its committed baseline and cleans temporary roots', async () => {
  const mod = await proofModule();
  const report = await mod.runBuildProof(path.resolve('.'));
  const baseline = JSON.parse(await fs.readFile('tests/fixtures/build-proof-baseline.json', 'utf8'));
  assert.deepEqual(report, baseline);
  const output = await fs.readdir('output').catch(() => []);
  assert.equal(output.some(name => name.startsWith('af01-proof-')), false);
});
