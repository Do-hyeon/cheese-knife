import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openOwnedRoot, resolveOwnedPath } from './owned-files.mjs';

export function manifestFiles(manifest) {
  const files = new Set(['manifest.json']);
  const add = file => { if (typeof file === 'string') files.add(file); };
  Object.values(manifest.icons || {}).forEach(add);
  add(manifest.action?.default_popup);
  Object.values(manifest.action?.default_icon || {}).forEach(add);
  add(manifest.background?.service_worker);
  for (const script of manifest.content_scripts || []) {
    [...script.js || [], ...script.css || []].forEach(add);
  }
  return files;
}

export function resolveFile(root, file) {
  try { return resolveOwnedPath(root, file); }
  catch { throw new Error(`Invalid extension path: ${file}`); }
}

// Check every component without following internal links. The caller may use
// an alias for the package root; checkPackage resolves that root once below.
// This checks a stable package tree, not an atomic filesystem read sandbox.
async function regularPackageFile(owned, file, missingMessage) {
  try { return await owned.resolve(file, { type: 'file' }); }
  catch (error) {
    if (error.code === 'owned-path-link') throw new Error(`Linked package path: ${file}`, { cause: error });
    if (error.code === 'owned-path-type') throw new Error(`Not a regular package file: ${file}`, { cause: error });
    if (missingMessage && error.code === 'ENOENT') throw new Error(`${missingMessage}: ${file}`, { cause: error });
    throw error;
  }
}

export async function checkPackage(directory, expectedVersion, browser = 'chrome') {
  if (browser !== 'chrome') throw new Error('Chrome only: Firefox packages are not supported by the community recovery');
  const owned = await openOwnedRoot(directory);
  await regularPackageFile(owned, 'manifest.json', 'Missing extension resource');
  const manifest = JSON.parse(await owned.readFile('manifest.json', 'utf8'));
  if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3');
  if (manifest.background && ['scripts', 'page', 'persistent'].some(key => Object.hasOwn(manifest.background, key))) {
    throw new Error('Chrome MV3 must not declare background.scripts, page or persistent');
  }
  if (manifest.browser_specific_settings) throw new Error('Chrome package must not declare browser_specific_settings');
  let project;
  try {
    await regularPackageFile(owned, 'package.json');
    project = JSON.parse(await owned.readFile('package.json', 'utf8'));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const version = expectedVersion || project?.version;
  if (version && manifest.version !== version) throw new Error('Package/manifest version mismatch');
  const resources = manifestFiles(manifest);
  for (const file of await owned.readdir('')) {
    if (file.endsWith('.html')) resources.add(file);
  }
  if ([...resources].some(file => file.startsWith('vendor/'))) resources.add('vendor/hls.js.LICENSE');
  if (manifest.default_locale) resources.add(`_locales/${manifest.default_locale}/messages.json`);
  for (const file of resources) {
    await regularPackageFile(owned, file, 'Missing extension resource');
    if (file.endsWith('.html')) {
      const html = await owned.readFile(file, 'utf8');
      for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)) {
        if (/^(?:https?:|#|data:)/.test(match[1])) continue;
        const asset = path.posix.join(path.posix.dirname(file), match[1]);
        await regularPackageFile(owned, asset, 'Missing HTML resource');
      }
    }
    if (file === manifest.background?.service_worker) {
      const worker = await owned.readFile(file, 'utf8');
      // Only inspect our literal classic-worker imports: never execute or guess computed paths.
      for (const call of worker.matchAll(/\bimportScripts\s*\(([^)]*)\)/g)) {
        const tokens = call[1].match(/['"][^'"\\]+['"]|,|[^\s]+/g) || [];
        if (!tokens.length || tokens.length % 2 !== 1 ||
            !tokens.every((token, index) => index % 2 ? token === ',' : /^['"][^'"\\]+['"]$/.test(token))) continue;
        const literals = tokens.filter((_token, index) => index % 2 === 0);
        for (const literal of literals) {
          const dependency = path.posix.join(path.posix.dirname(file), literal.slice(1, -1));
          await regularPackageFile(owned, dependency, 'Missing worker resource');
        }
      }
    }
  }
  return { version: manifest.version, resources: resources.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => arg.startsWith('--'))) throw new Error('Chrome only: supply at most one package directory, without browser options');
  const result = await checkPackage(args[0] || process.cwd());
  console.log(`Package OK: v${result.version}, ${result.resources} entry resources`);
}
