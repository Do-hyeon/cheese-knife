const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const owned = () => import('../scripts/owned-files.mjs');
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-owned-files-'));
  const root = path.join(base, 'root'), outside = path.join(base, 'outside');
  await fs.mkdir(root); await fs.mkdir(outside);
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  return { base, root, outside };
}
const linkDirectory = (target, link) => fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');

test('resolveOwnedPath accepts only slash-based package-relative paths inside the root', async () => {
  const { resolveOwnedPath } = await owned();
  const root = path.resolve('fixture-root');
  assert.equal(resolveOwnedPath(root, ''), root);
  assert.equal(resolveOwnedPath(root, 'web/main.js'), path.join(root, 'web', 'main.js'));
  for (const input of ['..', '../fixture-root-sibling', 'web/../../escape', '/absolute', 'C:/absolute', 'D:/other-drive', '//server/share', '\\\\server\\share', 'web\\main.js']) {
    assert.throws(() => resolveOwnedPath(root, input), { code: 'owned-path-invalid' }, input);
  }
});

test('openOwnedRoot allows a root alias junction but rejects junctions below the real root', async t => {
  const { openOwnedRoot } = await owned();
  const { base, root, outside } = await fixture(t);
  const alias = path.join(base, 'root-alias');
  await linkDirectory(root, alias);
  const files = await openOwnedRoot(alias);
  assert.equal(files.root, await fs.realpath(root));
  await fs.writeFile(path.join(root, 'inside.txt'), 'inside');
  assert.equal(await files.readFile('inside.txt', 'utf8'), 'inside');
  await fs.writeFile(path.join(outside, 'outside.txt'), 'outside');
  await linkDirectory(outside, path.join(root, 'linked'));
  await assert.rejects(files.readFile('linked/outside.txt', 'utf8'), { code: 'owned-path-link' });
  await assert.rejects(files.resolve('linked', { type: 'directory' }), { code: 'owned-path-link' });
});

test('broken links, type mismatches, and linked output roots are rejected before operations', async t => {
  const { openOwnedRoot } = await owned();
  const { root, outside } = await fixture(t);
  await fs.writeFile(path.join(root, 'file.txt'), 'file');
  await fs.mkdir(path.join(root, 'directory'));
  const brokenTarget = path.join(outside, 'broken-target');
  await fs.mkdir(brokenTarget);
  await linkDirectory(brokenTarget, path.join(root, 'broken'));
  await fs.rm(brokenTarget, { recursive: true, force: true });
  const outputTarget = path.join(outside, 'output-target'); await fs.mkdir(outputTarget);
  await linkDirectory(outputTarget, path.join(root, 'output'));
  const files = await openOwnedRoot(root);
  await assert.rejects(files.resolve('broken/child.txt', { type: 'file', optional: true }), { code: 'owned-path-link' });
  await assert.rejects(files.resolve('file.txt', { type: 'directory' }), { code: 'owned-path-type' });
  await assert.rejects(files.resolve('directory', { type: 'file' }), { code: 'owned-path-type' });
  await assert.rejects(files.ensureDirectory('output/new-child'), { code: 'owned-path-link' });
  assert.equal(await files.resolve('missing.txt', { type: 'file', optional: true }), null);
});

test('missing outputs create only the requested children and preserve file operations', async t => {
  const { openOwnedRoot } = await owned();
  const { root } = await fixture(t);
  const files = await openOwnedRoot(root);
  await files.ensureDirectory('output/deep');
  await files.writeFile('output/deep/value.txt', 'value', 'utf8');
  assert.equal(await files.readFile('output/deep/value.txt', 'utf8'), 'value');
  assert.deepEqual((await files.readdir('output/deep')).sort(), ['value.txt']);
  const stat = await files.lstat('output/deep/value.txt'); assert.equal(stat.isFile(), true);
  const temporary = await files.makeTempDirectory('output/run-');
  assert.equal(path.dirname(temporary), path.join(files.root, 'output'));
  await files.copyFile('output/deep/value.txt', 'output/copied.txt');
  assert.equal(await files.readFile('output/copied.txt', 'utf8'), 'value');
  await files.removeTree('output/deep');
  assert.equal(await files.lstat('output/deep', { optional: true }), null);
  await assert.rejects(files.removeTree(''), { code: 'owned-path-root-operation' });
});

test('copyTree rejects overlap and copies accepted ordinary entries only', async t => {
  const { openOwnedRoot } = await owned();
  const { root } = await fixture(t);
  await fs.mkdir(path.join(root, 'source', 'nested'), { recursive: true });
  await fs.writeFile(path.join(root, 'source', 'keep.txt'), 'keep');
  await fs.writeFile(path.join(root, 'source', 'drop.txt'), 'drop');
  await fs.writeFile(path.join(root, 'source', 'nested', 'child.txt'), 'child');
  const files = await openOwnedRoot(root);
  await assert.rejects(files.copyTree('source', 'source/inner'), { code: 'owned-path-overlap' });
  await assert.rejects(files.copyTree('source', 'source'), { code: 'owned-path-overlap' });
  const seen = [];
  await files.copyTree('source', 'destination', { accept(relative, entry) {
    seen.push([relative, entry.name]); return entry.name !== 'drop.txt';
  } });
  assert.equal(await files.readFile('destination/keep.txt', 'utf8'), 'keep');
  assert.equal(await files.readFile('destination/nested/child.txt', 'utf8'), 'child');
  assert.equal(await files.lstat('destination/drop.txt', { optional: true }), null);
  assert.ok(seen.some(([relative]) => relative === 'source/nested/child.txt'));
});

test('file symlinks are rejected when the environment permits creating them', async t => {
  const { openOwnedRoot } = await owned();
  const { root, outside } = await fixture(t);
  const target = path.join(outside, 'target.txt'), link = path.join(root, 'file-link.txt');
  await fs.writeFile(target, 'outside');
  try { await fs.symlink(target, link, 'file'); }
  catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') {
      t.diagnostic('environment-unverified: Windows file symlink creation requires an unavailable privilege');
      return;
    }
    throw error;
  }
  const files = await openOwnedRoot(root);
  await assert.rejects(files.readFile('file-link.txt', 'utf8'), { code: 'owned-path-link' });
});
