import fs from 'node:fs/promises';
import path from 'node:path';

const ownedError = code => Object.assign(new Error(code), { code });
const missingError = () => ownedError('ENOENT');
const validTypes = new Set(['file', 'directory', 'missing-or-file', 'missing-or-directory', 'any']);

export function resolveOwnedPath(root, input) {
  if (typeof input !== 'string' || input.includes('\\') || path.posix.isAbsolute(input) || path.win32.isAbsolute(input)) {
    throw ownedError('owned-path-invalid');
  }
  const absoluteRoot = path.resolve(root);
  if (!input) return absoluteRoot;
  const parts = input.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw ownedError('owned-path-invalid');
  const candidate = path.resolve(absoluteRoot, ...parts);
  const relative = path.relative(absoluteRoot, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw ownedError('owned-path-invalid');
  return candidate;
}

export async function openOwnedRoot(directory) {
  const requestedRoot = path.resolve(directory);
  // Guarded capability root: caller selects the root; realpath fixes an alias or junction before child validation.
  const root = await fs.realpath(requestedRoot); // eslint-disable-line security/detect-non-literal-fs-filename
  const rootStat = await fs.lstat(root); // eslint-disable-line security/detect-non-literal-fs-filename
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw ownedError('owned-root-invalid');

  const partsOf = relative => relative ? relative.split('/') : [];
  async function inspect(relative, type = 'any') {
    if (!validTypes.has(type)) throw ownedError('owned-path-type');
    const target = resolveOwnedPath(root, relative);
    const parts = partsOf(relative);
    if (!parts.length) {
      if (type === 'file' || type === 'missing-or-file') throw ownedError('owned-path-type');
      return { path: root, stat: rootStat, exists: true, missingAt: -1 };
    }
    let current = root;
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts.at(index));
      let stat;
      try {
        // inspect verifies every existing child component immediately before a capability operation.
        stat = await fs.lstat(current); // eslint-disable-line security/detect-non-literal-fs-filename
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        return { path: target, stat: null, exists: false, missingAt: index };
      }
      if (stat.isSymbolicLink()) throw ownedError('owned-path-link');
      const last = index === parts.length - 1;
      if (!last && !stat.isDirectory()) throw ownedError('owned-path-type');
      if (last) {
        const wantsFile = type === 'file' || type === 'missing-or-file';
        const wantsDirectory = type === 'directory' || type === 'missing-or-directory';
        if ((wantsFile && !stat.isFile()) || (wantsDirectory && !stat.isDirectory())) throw ownedError('owned-path-type');
        return { path: target, stat, exists: true, missingAt: -1 };
      }
    }
    throw ownedError('owned-path-invalid');
  }

  async function resolve(relative, { type = 'any', optional = false } = {}) {
    const result = await inspect(relative, type);
    if (result.exists) return result.path;
    if (optional) return null;
    if (type === 'missing-or-file' || type === 'missing-or-directory') return result.path;
    throw missingError();
  }

  async function readFile(relative, options) {
    const target = await resolve(relative, { type: 'file' });
    // resolve(file) rejects links and type mismatches before this read.
    return fs.readFile(target, options); // eslint-disable-line security/detect-non-literal-fs-filename
  }
  async function readdir(relative, options) {
    const target = await resolve(relative, { type: 'directory' });
    // resolve(directory) rejects links and type mismatches before enumeration.
    return fs.readdir(target, options); // eslint-disable-line security/detect-non-literal-fs-filename
  }
  async function lstat(relative, { optional = false } = {}) {
    const result = await inspect(relative, 'any');
    if (!result.exists) {
      if (optional) return null;
      throw missingError();
    }
    return result.stat;
  }
  async function ensureDirectory(relative) {
    if (!relative) return root;
    const result = await inspect(relative, 'missing-or-directory');
    if (result.exists) return result.path;
    // inspect checked the nearest existing parent and every existing component; mkdir creates only this owned suffix.
    await fs.mkdir(result.path, { recursive: true }); // eslint-disable-line security/detect-non-literal-fs-filename
    await inspect(relative, 'directory');
    return result.path;
  }
  async function makeTempDirectory(relativePrefix) {
    if (!relativePrefix) throw ownedError('owned-path-root-operation');
    const prefix = resolveOwnedPath(root, relativePrefix);
    const parent = path.posix.dirname(relativePrefix);
    await resolve(parent === '.' ? '' : parent, { type: 'directory' });
    // The verified parent owns the random mkdtemp child. Concurrent path replacement is outside this non-atomic model.
    const created = await fs.mkdtemp(prefix);
    const relative = path.relative(root, created).split(path.sep).join('/');
    await inspect(relative, 'directory');
    return created;
  }
  async function writeFile(relative, data, options) {
    if (!relative) throw ownedError('owned-path-root-operation');
    const result = await inspect(relative, 'missing-or-file');
    const parts = partsOf(relative);
    if (!result.exists && result.missingAt !== parts.length - 1) throw missingError();
    // inspect verified the target or its immediate parent and rejected links before this write.
    await fs.writeFile(result.path, data, options); // eslint-disable-line security/detect-non-literal-fs-filename
    await inspect(relative, 'file');
    return result.path;
  }
  async function removeTree(relative) {
    if (!relative) throw ownedError('owned-path-root-operation');
    const result = await inspect(relative, 'any');
    if (!result.exists) return false;
    // inspect rejected linked targets and all linked parent components before recursive removal.
    await fs.rm(result.path, { recursive: true, force: true });
    return true;
  }
  async function copyFile(sourceRelative, destinationRelative) {
    if (!destinationRelative) throw ownedError('owned-path-root-operation');
    const source = await inspect(sourceRelative, 'file');
    const destination = await inspect(destinationRelative, 'missing-or-file');
    if (source.path === destination.path) throw ownedError('owned-path-overlap');
    const parts = partsOf(destinationRelative);
    if (!destination.exists && destination.missingAt !== parts.length - 1) throw missingError();
    // Both source and destination boundaries were inspected immediately before copying.
    await fs.copyFile(source.path, destination.path);
    await inspect(destinationRelative, 'file');
    return destination.path;
  }
  const inside = (parent, child) => {
    const relative = path.relative(parent, child);
    return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  };
  async function copyTree(sourceRelative, destinationRelative, { accept = () => true } = {}) {
    if (!sourceRelative || !destinationRelative || typeof accept !== 'function') throw ownedError('owned-path-root-operation');
    const source = await inspect(sourceRelative, 'directory');
    const destinationPath = resolveOwnedPath(root, destinationRelative);
    if (inside(source.path, destinationPath) || inside(destinationPath, source.path)) throw ownedError('owned-path-overlap');
    await ensureDirectory(destinationRelative);
    async function visit(sourceFolder, destinationFolder) {
      const entries = await readdir(sourceFolder, { withFileTypes: true });
      for (const entry of entries) {
        const sourceChild = `${sourceFolder}/${entry.name}`;
        const destinationChild = `${destinationFolder}/${entry.name}`;
        const checked = await inspect(sourceChild, 'any');
        if (!checked.stat.isFile() && !checked.stat.isDirectory()) throw ownedError('owned-path-type');
        if (!await accept(sourceChild, entry)) continue;
        if (checked.stat.isDirectory()) {
          await ensureDirectory(destinationChild);
          await visit(sourceChild, destinationChild);
        } else await copyFile(sourceChild, destinationChild);
      }
    }
    await visit(sourceRelative, destinationRelative);
    return destinationPath;
  }

  return { root, resolve, readFile, readdir, lstat, ensureDirectory, makeTempDirectory, writeFile, removeTree, copyFile, copyTree };
}
