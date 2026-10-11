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
