import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openOwnedRoot } from './owned-files.mjs';
import { build } from './build.mjs';
import { checkPackage } from './check-package.mjs';
import { checkSettingsRuntime } from './settings-runtime.mjs';
import { checkMainRuntime } from './main-runtime.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slash = value => value.split(path.sep).join('/');
const validateCandidateId = id => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9]+$/.test(id)) {
    throw Object.assign(new Error('candidate-id-invalid'), { code: 'candidate-id-invalid' });
  }
  return id;
};

export async function removeCandidate(id) {
  const candidateId = validateCandidateId(id);
  const repository = await openOwnedRoot(repositoryRoot);
  return repository.removeTree(`output/tool-audit/p02-candidate-${candidateId}`);
}

export async function verifyCandidate(id, directory = repositoryRoot, {retainEvidence = false} = {}) {
  if (typeof retainEvidence !== 'boolean') throw Object.assign(new Error('candidate-retention-invalid'), {code:'candidate-retention-invalid'});
  const candidateId = validateCandidateId(id);
  const repository = await openOwnedRoot(directory);
  const candidateRelative = `output/tool-audit/p02-candidate-${candidateId}/chrome-candidate`;
  if (await repository.lstat(candidateRelative, { optional: true })) throw Object.assign(new Error('candidate-destination-exists'), { code: 'candidate-destination-exists' });
  await checkSettingsRuntime(repository.root);
  await checkMainRuntime(repository.root);
  await repository.ensureDirectory(candidateRelative);
  try {
    const manifest = JSON.parse(await repository.readFile('manifest.json', 'utf8'));
    const topEntries = await repository.readdir('', { withFileTypes: true });
    for (const entry of topEntries) {
      if (entry.isFile() && (/\.(?:html|js|css|png)$/.test(entry.name) || ['manifest.json', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md'].includes(entry.name))) {
        await repository.copyFile(entry.name, `${candidateRelative}/${entry.name}`);
      }
    }
    for (const folder of ['web', 'styles', '_locales']) if (await repository.lstat(folder, { optional: true })) {
      await repository.copyTree(folder, `${candidateRelative}/${folder}`, {
        accept: (_relative, entry) => entry.isDirectory() || /\.(?:js|css|json)$/.test(entry.name),
      });
    }
    const vendorFiles = new Set((manifest.content_scripts || []).flatMap(script => script.js || []).filter(file => file.startsWith('vendor/')));
    if (vendorFiles.size) vendorFiles.add('vendor/hls.js.LICENSE');
    for (const file of vendorFiles) {
      const parent = path.posix.dirname(`${candidateRelative}/${file}`);
      await repository.ensureDirectory(parent);
      await repository.copyFile(file, `${candidateRelative}/${file}`);
    }
    const root = await repository.resolve(candidateRelative, { type: 'directory' });
    const dist = await build(root, path.join(root, 'dist'));
    const checked = await checkPackage(dist);
    const candidate = await openOwnedRoot(root);
    const files = [];
    async function inventory(relative) {
      for (const entry of await candidate.readdir(relative, { withFileTypes: true })) {
        const child = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await inventory(child);
        else if (entry.isFile()) files.push(child);
        else throw Object.assign(new Error('candidate-linked-entry'), { code: 'candidate-linked-entry' });
      }
    }
    await inventory('dist');
    return { root, dist, files: files.sort().map(slash), resources: checked.resources };
  } catch (error) {
    if (retainEvidence) {
      if (error && typeof error === 'object' && Object.isExtensible(error)) error.retainedCandidatePath = path.join(repository.root,...candidateRelative.split('/'));
    } else {
      try { await repository.removeTree(candidateRelative); }
      catch (secondary) { throw Object.assign(new Error('candidate-preparation-incomplete',{cause:error}),{code:'candidate-preparation-incomplete',secondaryErrors:[String(secondary?.message||secondary).slice(0,240)]}); }
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/verify-candidate.mjs ALPHANUMERIC_ID');
  console.log(JSON.stringify(await verifyCandidate(process.argv[2]), null, 2));
}
