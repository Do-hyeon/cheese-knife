const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const candidateModule = () => import(pathToFileURL(path.resolve('scripts/verify-candidate.mjs')));

test('removeCandidate rejects every ID rejected by verifyCandidate', async () => {
  const { verifyCandidate, removeCandidate } = await candidateModule();
  for (const id of ['..', '../escape', 'with/slash', 'with\\backslash', 'C:absolute', 'space id', '']) {
    await assert.rejects(verifyCandidate(id), { code: 'candidate-id-invalid' }, `verifyCandidate ${JSON.stringify(id)}`);
    await assert.rejects(removeCandidate(id), { code: 'candidate-id-invalid' }, `removeCandidate ${JSON.stringify(id)}`);
  }
});

test('removeCandidate removes only its exact generated candidate root', async t => {
  const { removeCandidate } = await candidateModule();
  const id = `remove${Date.now()}`;
  const root = path.resolve('output', 'tool-audit', `p02-candidate-${id}`);
  const sibling = path.resolve('output', 'tool-audit', `p02-candidate-${id}Sibling`);
  await fs.mkdir(path.join(root, 'chrome-candidate'), { recursive: true });
  await fs.mkdir(sibling, { recursive: true });
  await fs.writeFile(path.join(root, 'chrome-candidate', 'sentinel.txt'), 'remove');
  await fs.writeFile(path.join(sibling, 'sentinel.txt'), 'keep');
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(sibling, { recursive: true, force: true });
  });

  assert.equal(await removeCandidate(id), true);
  await assert.rejects(fs.access(root), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(sibling, 'sentinel.txt'), 'utf8'), 'keep');
  assert.equal(await removeCandidate(id), false);
});

test('candidate verifier rejects MAIN drift without leaving a candidate directory', async t => {
  const { verifyCandidate } = await candidateModule();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-candidate-main-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp('src/settings', path.join(root, 'src/settings'), { recursive: true });
  await fs.cp('src/main', path.join(root, 'src/main'), { recursive: true });
  await fs.mkdir(path.join(root, 'web'), { recursive: true });
  const settings = await import(pathToFileURL(path.resolve('scripts/settings-runtime.mjs')));
  const main = await import(pathToFileURL(path.resolve('scripts/main-runtime.mjs')));
  for (const [file, source] of Object.entries(await settings.renderSettingsRuntime(root))) await fs.writeFile(path.join(root, file), source);
  for (const [file, source] of Object.entries(await main.renderMainRuntime(root))) await fs.writeFile(path.join(root, file), source);
  await fs.appendFile(path.join(root, 'web/site-adapter.js'), '// stale\n');
  const id = 'staleMain';
  await assert.rejects(verifyCandidate(id, root), { code: 'main-runtime-drift' });
  await assert.rejects(fs.access(path.join(root, 'output/tool-audit', `p02-candidate-${id}`)), { code: 'ENOENT' });
});
