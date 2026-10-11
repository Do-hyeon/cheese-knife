import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  CLASSIC_RUNTIME_OPTIONS, checkGeneratedRuntime, generatedFailure, validateClassicRuntime, writeGeneratedRuntime,
} from './generated-runtime.mjs';
import { openOwnedRoot } from './owned-files.mjs';

export const MAIN_RUNTIME_ENTRIES = Object.freeze([
  Object.freeze({ source: 'src/main/runtime/entry.ts', output: 'web/runtime.js', kind: 'runtime' }),
  Object.freeze({ source: 'src/main/site-adapter/entry.ts', output: 'web/site-adapter.js', kind: 'adapter' }),
]);
export const MAIN_RUNTIME_OPTIONS = Object.freeze({
  bundle: true, format: 'iife', platform: 'browser', target: CLASSIC_RUNTIME_OPTIONS.target,
  minify: CLASSIC_RUNTIME_OPTIONS.minify, sourcemap: CLASSIC_RUNTIME_OPTIONS.sourcemap,
  legalComments: CLASSIC_RUNTIME_OPTIONS.legalComments, charset: CLASSIC_RUNTIME_OPTIONS.charset, treeShaking: true,
});

const codes = Object.freeze({
  outputSet: 'main-runtime-output-set', syntax: 'main-runtime-source-module', sourceMap: 'main-runtime-source-map',
  forbidden: 'main-runtime-source-module', nondeterministic: 'main-runtime-nondeterministic', drift: 'main-runtime-drift',
  writeCi: 'main-runtime-write-ci',
});
const rawAdapterPublication = /runtime\.adapter\s*=\s*\{[\s\S]{0,1000}\b(?:fiberOf|propsOf|stateOf|contextOf|getWebpackRequire|getCorePlayer)\s*:/;
const repositoryRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = entry => `// Generated from ${entry.source} by scripts/main-runtime.mjs. Do not edit.\n`;
const slash = value => value.split(path.sep).join('/');

async function buildGraphs(root) {
  const owned = await openOwnedRoot(root);
  const outputs = {}, graphs = {};
  for (const entry of MAIN_RUNTIME_ENTRIES) {
    await owned.resolve(entry.source, { type: 'file' });
    const result = await build({
      absWorkingDir: owned.root, entryPoints: [entry.source], outfile: entry.output, write: false, metafile: true,
      logLevel: 'silent', ...MAIN_RUNTIME_OPTIONS,
    });
    if (result.outputFiles?.length !== 1 || !result.metafile) throw generatedFailure(codes.outputSet);
    const inputs = [];
    for (const input of Object.keys(result.metafile.inputs)) {
      const relative = slash(path.isAbsolute(input) ? path.relative(owned.root, input) : input);
      if (relative === '..' || relative.startsWith('../')) throw generatedFailure('main-runtime-source-outside');
      await owned.resolve(relative, { type: 'file' });
      inputs.push(relative);
    }
    graphs[entry.kind] = inputs.sort();
    outputs[entry.output] = marker(entry) + result.outputFiles[0].text.replace(/\r\n/g, '\n');
  }
  return { outputs, graphs };
}

export function validateMainRuntime(outputs, identities = []) {
  const expected = MAIN_RUNTIME_ENTRIES.map(entry => entry.output).sort();
  if (JSON.stringify(Object.keys(outputs || {}).sort()) !== JSON.stringify(expected)) throw generatedFailure(codes.outputSet);
  for (const entry of MAIN_RUNTIME_ENTRIES) {
    const source = outputs[entry.output];
    if (typeof source !== 'string' || !source.startsWith(marker(entry))) throw generatedFailure('main-runtime-marker');
    validateClassicRuntime(source.slice(marker(entry).length), identities, codes);
  }
  if (!outputs['web/runtime.js'].includes('cheese-knife.runtime.v1')) throw generatedFailure('main-runtime-abi');
  if (!outputs['web/site-adapter.js'].includes('cheese-knife.runtime.v1') || !outputs['web/site-adapter.js'].includes('runtime.adapter')) {
    throw generatedFailure('main-runtime-adapter-abi');
  }
  if (rawAdapterPublication.test(outputs['web/site-adapter.js'])) throw generatedFailure('main-runtime-raw-adapter');
}

export async function renderMainRuntime(root = repositoryRoot()) {
  const { outputs, graphs } = await buildGraphs(root);
  if (graphs.adapter.some(file => /src\/main\/runtime\/(?:entry|lifecycle)\.ts$/.test(file))) throw generatedFailure('main-runtime-adapter-graph');
  validateMainRuntime(outputs);
  return outputs;
}

export async function inspectMainRuntimeGraphs(root = repositoryRoot()) {
  const { graphs } = await buildGraphs(root);
  return graphs;
}

export async function checkMainRuntime(root = repositoryRoot()) {
  return checkGeneratedRuntime(root, MAIN_RUNTIME_ENTRIES, renderMainRuntime, codes);
}

export async function writeMainRuntime(root = repositoryRoot()) {
  return writeGeneratedRuntime(root, MAIN_RUNTIME_ENTRIES, renderMainRuntime, codes);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv[2] === '--write';
  if (process.argv.length > (write ? 3 : 2)) throw new Error('Usage: node scripts/main-runtime.mjs [--write]');
  const outputs = await (write ? writeMainRuntime() : checkMainRuntime());
  console.log(`MAIN runtime OK: ${Object.keys(outputs).length} files`);
}
