const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const sourceCommit = 'fb15f9675f9ea910e98363635155bc4ff9eb1d2f';
const expectedHashes = {
  'config.js': 'b29dde24d8a7d0245a1a54a2eb55e08360e42a75e138ca34e072f816bf3730c1',
  'style-schema.js': '43f37f8231ebac76fcff3ea4630ef958b1781ba53c9cb3c6fbcb2404311280c8',
  'settings-contract.js': '5affb77bc67ade7ee48b4a00a84d5839a4bd7fd8bed24db59961db6514c954aa',
  'settings-broker.js': '83f3b72a9cfd63ad15e85680fa97b71d72972b5d356eea593e7278bbfbd1726e',
};
const moduleUnderTest = () => import('../scripts/published-settings-baseline.mjs');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const blobs = () => Object.fromEntries(Object.keys(expectedHashes).map(file => [file,
  execFileSync('git', ['show', `${sourceCommit}:${file}`], { timeout: 15000, maxBuffer: 1048576 })]));

test('published baseline bytes match the attested submission entries', async () => {
  const { readPublishedWorkerSources, validatePublishedWorkerBlobs, PUBLISHED_SETTINGS_BASELINE } = await moduleUnderTest();
  const input = blobs(), before = structuredClone(input);
  const sources = validatePublishedWorkerBlobs(input);
  assert.deepEqual(readPublishedWorkerSources(), sources);
  for (const [file, hash] of Object.entries(expectedHashes)) assert.equal(sha256(sources[file]), hash, file);
  assert.equal(Buffer.byteLength(sources['config.js']), 5716);
  assert.equal((sources['config.js'].match(/\n/g) || []).length, 254);
  assert.equal((sources['config.js'].match(/\r\n/g) || []).length, 210);
  assert.equal(sha256(input['config.js']), '9cd127c2ad33f349660d7730366db9015d08b94bc98f2d42e20bff244447f61b');
  assert.equal(sha256(input['config.js'].toString('utf8').replaceAll('\n', '\r\n')),
    '26c0db7bccbb73e305b75db01003bf9ec97eb7a012f62f6ab2409101685f10f7');
  assert.deepEqual(input, Object.fromEntries(Object.entries(before).map(([file, value]) => [file, Buffer.from(value)])));
  assert.equal(PUBLISHED_SETTINGS_BASELINE.sourceCommit, sourceCommit);
  assert.equal(PUBLISHED_SETTINGS_BASELINE.version, '2.13.3');
  assert.equal(PUBLISHED_SETTINGS_BASELINE.submissionZipSha256,
    '67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51');
  assert.deepEqual(PUBLISHED_SETTINGS_BASELINE.files['config.js'].crlfLineRanges, [[1, 12], [21, 49], [52, 220]]);
  assert.ok(Object.isFrozen(sources));
  assert.ok(Object.isFrozen(PUBLISHED_SETTINGS_BASELINE.files['config.js'].crlfLineRanges[0]));
});

test('published baseline rejects a changed blob before execution', async () => {
  const { validatePublishedWorkerBlobs } = await moduleUnderTest();
  for (const file of Object.keys(expectedHashes)) {
    const input = blobs(); input[file][0] ^= 1;
    assert.throws(() => validatePublishedWorkerBlobs(input), { code: 'published-baseline-git-hash' }, file);
  }
});

test('published baseline refuses missing extra inherited and non-buffer inputs', async () => {
  const { validatePublishedWorkerBlobs } = await moduleUnderTest();
  const input = blobs(), missing = { ...input }; delete missing['config.js'];
  for (const invalid of [null, [], missing, { ...input, extra: Buffer.from('x') }, Object.create(input),
    { ...input, 'config.js': input['config.js'].toString('utf8') }]) {
    assert.throws(() => validatePublishedWorkerBlobs(invalid), { code: 'published-baseline-input' });
  }
  const accessor = { ...input };
  Object.defineProperty(accessor, 'config.js', { get() { throw new Error('must-not-read-accessor'); } });
  assert.throws(() => validatePublishedWorkerBlobs(accessor), { code: 'published-baseline-input' });
});

test('published baseline checks individual and aggregate size before hashes', async () => {
  const { validatePublishedWorkerBlobs } = await moduleUnderTest();
  assert.throws(() => validatePublishedWorkerBlobs({ ...blobs(), 'config.js': Buffer.alloc(1048577) }),
    { code: 'published-baseline-size' });
  const input = Object.fromEntries(Object.keys(expectedHashes).map(file => [file, Buffer.alloc(524288)]));
  input['config.js'] = Buffer.alloc(524289);
  assert.throws(() => validatePublishedWorkerBlobs(input), { code: 'published-baseline-size' });
});

test('published baseline missing Git objects fails without current-source fallback', async t => {
  await moduleUnderTest();
  const parent = path.resolve('output'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'af05b1-baseline-'));
  assert.equal(path.dirname(root), parent);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root, timeout: 15000 });
  await fs.mkdir(path.join(root, 'scripts'));
  await fs.copyFile('scripts/published-settings-baseline.mjs', path.join(root, 'scripts/published-settings-baseline.mjs'));
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import {readPublishedWorkerSources} from './scripts/published-settings-baseline.mjs'; try { readPublishedWorkerSources(); } catch (error) { console.error(error.code); process.exitCode = 1; }"],
  { cwd: root, env, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(result.stderr.trim(), 'published-baseline-unavailable');
});
