import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { openOwnedRoot } from './owned-files.mjs';

export const PROOF_CONTEXTS = ['background', 'extension-page', 'isolated', 'main'];
export const PROOF_OPTIONS = Object.freeze({ bundle: true, format: 'iife', platform: 'browser', target: 'chrome121', minify: false, sourcemap: false, treeShaking: false, metafile: true, write: false });
const fail = code => Object.assign(new Error(code), { code });
const sha256 = value => createHash('sha256').update(value).digest('hex');

export async function buildProof(proofRoot) {
  const entryPoints = Object.fromEntries(PROOF_CONTEXTS.map(name => [name, `${name}.ts`]));
  const result = await build({ ...PROOF_OPTIONS, absWorkingDir: proofRoot, entryPoints, entryNames: '[name]', outdir: 'proof-output' });
  const outputs = Object.fromEntries(result.outputFiles.map(file => [path.basename(file.path), Buffer.from(file.contents).toString('utf8')]));
  return { outputs, metafile: result.metafile };
}

function normalizedMetafile(metafile) {
  const logical = name => {
    const clean = name.split('\\').join('/').replace(/^.*?build-proof\//, 'build-proof/');
    return clean.startsWith('build-proof/') ? clean : `build-proof/${clean.replace(/^\.\//, '')}`;
  };
  const inputs = Object.fromEntries(Object.entries(metafile.inputs || {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => {
    const imports = (value.imports || []).map(item => ({ path: logical(item.path), kind: item.kind, external: item.external === true })).sort((a, b) => a.path.localeCompare(b.path));
    return [logical(name), { imports }];
  }));
  const outputs = Object.fromEntries(Object.entries(metafile.outputs || {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => [path.posix.basename(name.split('\\').join('/')), {
    entryPoint: value.entryPoint ? logical(value.entryPoint) : null,
    inputs: Object.keys(value.inputs || {}).map(logical).sort(),
  }]));
  return { inputs, outputs };
}

function environmentIdentities() {
  const values = [os.hostname(), process.env.USERNAME, process.env.USER];
  try { values.push(os.userInfo().username); } catch {}
  return [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))];
}

function containsEnvironmentIdentity(source, identities) {
  const literals = source.match(/(["'`])(?:\\.|[^\\\r\n])*?\1/g) || [];
  return identities.some(identity => literals.some(raw => {
    let value = raw.slice(1, -1);
    if (raw.startsWith('"')) {
      try { value = JSON.parse(raw); } catch {}
    }
    if (identity.length > 2) return value.includes(identity);
    let offset = value.indexOf(identity);
    while (offset !== -1) {
      const left = offset === 0 || !/[A-Za-z0-9_-]/.test(value.charAt(offset - 1));
      const rightOffset = offset + identity.length;
      const right = rightOffset === value.length || !/[A-Za-z0-9_-]/.test(value.charAt(rightOffset));
      if (left && right) return true;
      offset = value.indexOf(identity, offset + 1);
    }
    return false;
  }));
}

export function inspectProofRun(run, identities = environmentIdentities()) {
  const names = Object.keys(run.outputs).sort();
  const expected = PROOF_CONTEXTS.map(name => `${name}.js`).sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw fail(names.some(name => name.endsWith('.map')) ? 'proof-source-map' : 'proof-output-set');
  for (const source of Object.values(run.outputs)) inspectBrowserSource(source, identities);
  if (Object.keys(run.metafile.inputs || {}).some(name => name.split('\\').join('/').includes('node_modules/'))) throw fail('proof-unexpected-dependency');
  const graph = normalizedMetafile(run.metafile);
  const outputs = new Map(Object.entries(run.outputs));
  return { hashes: Object.fromEntries(names.map(name => [name, sha256(outputs.get(name))])), graphHash: sha256(JSON.stringify(graph)) };
}

export function inspectBrowserSource(source, identities = environmentIdentities()) {
  if (/\beval\s*\(/.test(source)) throw fail('proof-eval');
  if (/\bnew\s+Function\s*\(/.test(source)) throw fail('proof-function-constructor');
  if (/\bimport\s*\(\s*["']https?:/.test(source)) throw fail('proof-remote-import');
  if (/https?:\/\//.test(source)) throw fail('proof-remote-url');
  if (/[A-Za-z]:\\[^\s"']+/.test(source)) throw fail('proof-windows-path');
  if (/\/(?:tmp|var\/tmp)\//.test(source)) throw fail('proof-temp-path');
  if (/(["'`])\/(?!\/)(?:\\.|[^\\\r\n])*?\1/.test(source)) throw fail('proof-posix-path');
  if (containsEnvironmentIdentity(source, identities)) throw fail('proof-environment-identity');
  if (source.split(/[\s"'`]+/).some(token => token.length >= 20 && token.length <= 30 && token.at(4) === '-' && token.at(7) === '-' && token.at(10) === 'T' && token.endsWith('Z') && Number.isFinite(Date.parse(token)))) throw fail('proof-timestamp');
}

export function compareProofRuns(left, right) {
  if (JSON.stringify(left) !== JSON.stringify(right)) throw fail('proof-nondeterministic');
}

export async function runBuildProof(repositoryRoot = process.cwd()) {
  const owned = await openOwnedRoot(repositoryRoot);
  await owned.ensureDirectory('output');
  const roots = [];
  try {
    for (let index = 0; index < 2; index++) {
      const created = await owned.makeTempDirectory('output/af01-proof-');
      const relative = path.relative(owned.root, created).split(path.sep).join('/');
      roots.push(relative);
      await owned.copyTree('build-proof', `${relative}/build-proof`);
    }
    const reports = [];
    for (const relative of roots) reports.push(inspectProofRun(await buildProof(path.join(owned.root, relative, 'build-proof'))));
    compareProofRuns(reports[0], reports[1]);
    return reports[0];
  } finally {
    for (const relative of roots) await owned.removeTree(relative);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const writeBaseline = process.argv.includes('--write-baseline');
  if (process.argv.length > (writeBaseline ? 3 : 2)) throw new Error('Unknown build proof option');
  if (writeBaseline && process.env.CI) throw new Error('CI cannot update the build proof baseline');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const report = await runBuildProof(root);
  if (writeBaseline) {
    const owned = await openOwnedRoot(root);
    await owned.writeFile('tests/fixtures/build-proof-baseline.json', `${JSON.stringify(report, null, 2)}\n`);
    console.log('Build proof baseline updated');
  } else {
    const owned = await openOwnedRoot(root);
    const baseline = JSON.parse(await owned.readFile('tests/fixtures/build-proof-baseline.json', 'utf8'));
    compareProofRuns(report, baseline);
    console.log('Build proof OK: 4 contexts');
  }
}
