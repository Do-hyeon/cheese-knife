import { Script } from 'node:vm';
import { inspectBrowserSource } from './check-build-proof.mjs';
import { openOwnedRoot } from './owned-files.mjs';

export const CLASSIC_RUNTIME_OPTIONS = Object.freeze({
  target: 'chrome121', minify: false, sourcemap: false, legalComments: 'none', charset: 'utf8',
});

export const generatedFailure = code => Object.assign(new Error(code), { code });

const outputNames = (entries, outputs, code) => {
  const expected = entries.map(entry => entry.output).sort();
  const actual = Object.keys(outputs || {}).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw generatedFailure(code);
};

export function validateClassicRuntime(source, identities = [], codes) {
  if (typeof source !== 'string') throw generatedFailure(codes.syntax);
  try { new Script(source); } catch { throw generatedFailure(codes.syntax); }
  if (/sourceMappingURL|sourceURL/.test(source)) throw generatedFailure(codes.sourceMap);
  inspectBrowserSource(source, identities);
  if (/\brequire\s*\(|\bimport\s*\(|\bimport\.meta\b/.test(source)) throw generatedFailure(codes.forbidden);
}

export async function checkGeneratedRuntime(root, entries, render, codes) {
  const first = await render(root);
  outputNames(entries, first, codes.outputSet);
  const second = await render(root);
  outputNames(entries, second, codes.outputSet);
  if (JSON.stringify(first) !== JSON.stringify(second)) throw generatedFailure(codes.nondeterministic);
  const owned = await openOwnedRoot(root);
  for (const entry of entries) {
    let committed;
    try { committed = await owned.readFile(entry.output, 'utf8'); }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      throw generatedFailure(codes.drift);
    }
    if (committed !== first[entry.output]) throw generatedFailure(codes.drift);
  }
  return first;
}

export async function writeGeneratedRuntime(root, entries, render, codes) {
  if (process.env.CI) throw generatedFailure(codes.writeCi);
  const outputs = await render(root);
  outputNames(entries, outputs, codes.outputSet);
  const owned = await openOwnedRoot(root);
  for (const entry of entries) await owned.writeFile(entry.output, outputs[entry.output], 'utf8');
  return outputs;
}
