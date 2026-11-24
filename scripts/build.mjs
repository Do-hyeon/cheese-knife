import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDistributionFiles, checkPackage, resolveFile } from './check-package.mjs';
import { openOwnedRoot, openExtensionRoot } from './owned-files.mjs';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function build(directory = sourceRoot, output = path.join(directory, 'dist'), browser = 'chrome') {
  if (browser !== 'chrome') throw new Error('Chrome only: Firefox packages are not supported by the community recovery');
  const files = await openOwnedRoot(directory);
  const requestedTarget = path.resolve(output);
  if (![path.join(path.resolve(directory), 'dist'), path.join(files.root, 'dist')].includes(requestedTarget)) throw new Error('Build target must be this repository Chrome dist directory');
  const target = path.join(files.root, 'dist');
  const source = await checkPackage(files.root);
  const assets = await openExtensionRoot(files.root);
  const assetPath = name => path.posix.join(path.relative(files.root, assets.root).split(path.sep).join('/'), name);
  const manifest = JSON.parse(await assets.readFile('manifest.json', 'utf8'));
  await files.removeTree('dist');
  await files.ensureDirectory('dist');
  await files.copyFile(assetPath('manifest.json'), 'dist/manifest.json');
  for (const entry of await assets.readdir('', { withFileTypes: true })) {
    if (entry.isFile() && /\.(?:html|js|css|png)$/.test(entry.name)) {
      await files.copyFile(assetPath(entry.name), `dist/${entry.name}`);
    }
  }
  for (const folder of ['web', 'styles', '_locales']) {
    if (await assets.lstat(folder, { optional: true })) await files.copyTree(assetPath(folder), `dist/${folder}`, {
      accept: (_relative, entry) => entry.isDirectory() || /\.(?:js|css|json)$/.test(entry.name),
    });
  }
  const vendorFiles = new Set((manifest.content_scripts || []).flatMap(script => script.js || []).filter(file => file.startsWith('vendor/')));
  if (vendorFiles.size) vendorFiles.add('vendor/hls.js.LICENSE');
  for (const file of vendorFiles) {
    resolveFile(target, file);
    const parent = path.posix.dirname(`dist/${file}`);
    await files.ensureDirectory(parent);
    await files.copyFile(assetPath(file), `dist/${file}`);
  }
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) if (await files.lstat(file, { optional: true })) await files.copyFile(file, `dist/${file}`);
  await checkDistributionFiles(target);
  await checkPackage(target, source.version, browser);
  return target;
}

export async function buildChecked(directory = sourceRoot, output = path.join(directory, 'dist'), browser = 'chrome') {
  if (browser !== 'chrome') return build(directory, output, browser);
  const { checkSettingsRuntime } = await import('./settings-runtime.mjs');
  await checkSettingsRuntime(directory);
  const { checkMainRuntime } = await import('./main-runtime.mjs');
  await checkMainRuntime(directory);
  return build(directory, output, browser);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error('Chrome only: browser build options are not supported');
  console.log(`Built ${await buildChecked(sourceRoot, path.join(sourceRoot, 'dist'))}`);
}
