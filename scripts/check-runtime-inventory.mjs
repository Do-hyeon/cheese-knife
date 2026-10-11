import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { openOwnedRoot } from './owned-files.mjs';

const fail = code => Object.assign(new Error(code), { code });

export async function listRuntimeJavaScript(root = process.cwd()) {
  const files = await openOwnedRoot(root);
  const result = [];
  for (const entry of await files.readdir('', { withFileTypes: true })) {
    if (!entry.name.endsWith('.js')) continue;
    const stat = await files.lstat(entry.name);
    if (!stat.isFile()) throw fail('owned-path-type');
    result.push(entry.name);
  }

  async function visit(folder) {
    for (const entry of await files.readdir(folder, { withFileTypes: true })) {
      const relative = `${folder}/${entry.name}`;
      const stat = await files.lstat(relative);
      if (stat.isDirectory()) await visit(relative);
      else if (stat.isFile()) {
        if (entry.name.endsWith('.js')) result.push(relative);
      } else throw fail('owned-path-type');
    }
  }
  await visit('web');
  return result.sort();
}

export async function runtimeExecutableHashes(root, runtimeFiles) {
  if (!Array.isArray(runtimeFiles) || new Set(runtimeFiles).size !== runtimeFiles.length || runtimeFiles.some(file => typeof file !== 'string' || file.includes('\\'))) {
    throw fail('runtime-js-inventory-invalid');
  }
  const files = await openOwnedRoot(root);
  const hashes = {};
  for (const relative of runtimeFiles) {
    const source = await files.readFile(relative, 'utf8');
    const output = await transform(source, {
      loader: 'js',
      target: 'chrome121',
      legalComments: 'none',
      minifyWhitespace: true,
      minifySyntax: false,
      minifyIdentifiers: false,
      sourcemap: false,
    });
    hashes[relative] = createHash('sha256').update(output.code).digest('hex');
  }
  return hashes;
}

export async function checkRuntimeInventory(
  root = process.cwd(),
  inventoryFile = 'tests/fixtures/runtime-js-baseline.json',
  executableFile = 'tests/fixtures/runtime-executable-baseline.json',
) {
  const owned = await openOwnedRoot(root);
  const approvedFiles = JSON.parse(await owned.readFile(inventoryFile, 'utf8'));
  const approvedHashes = JSON.parse(await owned.readFile(executableFile, 'utf8'));
  const files = await listRuntimeJavaScript(root);
  if (JSON.stringify(files) !== JSON.stringify(approvedFiles)) throw fail('runtime-js-inventory-changed');
  const hashes = await runtimeExecutableHashes(root, files);
  if (JSON.stringify(hashes) !== JSON.stringify(approvedHashes)) throw fail('runtime-executable-changed');
  return { files, hashes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkRuntimeInventory().then(({ files }) => console.log(`Runtime JavaScript inventory OK: ${files.length} files`)).catch(error => {
    console.error(error.code ?? error.message);
    process.exitCode = 1;
  });
}
