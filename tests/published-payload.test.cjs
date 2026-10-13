const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const subject = () => import('../scripts/extension-e2e/published-payload.mjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cache = 'published-payload-67ae9c1512fef7e0.zip';
const bytes = () => fs.readFile(path.resolve('output/playwright', cache));
async function fresh(t) {
  const { openOwnedRoot } = await import('../scripts/owned-files.mjs');
  const parent = path.resolve('output');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'payload-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return openOwnedRoot(root);
}
const response = data => new Response(data, { status: 200 });

test('fixed payload returns all independently attested entries and fresh buffers', async () => {
  const { readPublishedPayloadZip, readPublishedPayload } = await subject();
  const input = await bytes(), before = Buffer.from(input);
  const first = readPublishedPayloadZip(input), second = await readPublishedPayload();
  assert.equal(first.entries.length, 58);
  assert.equal(first.inventorySha256, 'a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2');
  assert.equal(first.entries.reduce((n, e) => n + e.bytes.length, 0), 599793);
  assert.equal(Math.max(...first.entries.map(e => e.bytes.length)), 359160);
  assert.deepEqual(input, before);
  const { readPublishedWorkerSources } = await import('../scripts/published-settings-baseline.mjs');
  for (const [name, source] of Object.entries(readPublishedWorkerSources())) {
    assert.equal(first.entries.find(e => e.name === name).bytes.toString(), source, name);
  }
  assert.equal(JSON.parse(first.entries.find(e => e.name === 'manifest.json').bytes).version, '2.13.3');
  for (let i = 0; i < first.entries.length; i++) {
    assert.notStrictEqual(first.entries[i].bytes, second.entries[i].bytes);
    assert.equal(hash(first.entries[i].bytes), first.entries[i].sha256);
  }
});

test('non-buffer, wrong lengths, cap and changed ZIP fail before decompression', async () => {
  const { readPublishedPayloadZip } = await subject();
  const input = await bytes();
  for (const value of [null, [], input.toString(), new Uint8Array(input)]) {
    assert.throws(() => readPublishedPayloadZip(value), { code: 'published-payload-input' });
  }
  for (const value of [input.subarray(1), Buffer.concat([input, Buffer.of(0)]), Buffer.alloc(1048577)]) {
    assert.throws(() => readPublishedPayloadZip(value), { code: 'published-payload-size' });
  }
  for (const offset of [0, 30, 1024, input.length - 1]) {
    const altered = Buffer.from(input); altered[offset] ^= 1;
    assert.throws(() => readPublishedPayloadZip(altered), { code: 'published-payload-hash' });
  }
});

test('metadata mutation, aliases, extra fields, overlap and overflow fail', async () => {
  const { validatePayloadMetadata } = await subject();
  const original = JSON.parse(await fs.readFile('tests/fixtures/installed-extension/published-payload.json', 'utf8'));
  assert.equal(validatePayloadMetadata(original).length, 58);
  for (const mutate of [rows => rows.pop(), rows => rows.push(rows[0]),
    rows => { rows[0].name = '../out'; }, rows => { rows[1].name = rows[0].name.toUpperCase(); },
    rows => { rows[0].dataOffset = Number.MAX_SAFE_INTEGER; }, rows => { rows[1].dataOffset = rows[0].dataOffset; },
    rows => { rows[0].rawBytes = 1048577; }, rows => { rows[0].flags = 8; },
    rows => { rows[0].extra = true; }, rows => rows.reverse()]) {
    const rows = structuredClone(original); mutate(rows);
    assert.throws(() => validatePayloadMetadata(rows), { code: 'published-payload-metadata' });
  }
});

test('reader never downloads or substitutes missing/corrupt/oversized cache', async t => {
  const { readPublishedPayload } = await subject();
  const files = await fresh(t);
  await assert.rejects(readPublishedPayload({ files }), { code: 'published-payload-unavailable' });
  await files.writeFile(cache, Buffer.alloc(201802), { flag: 'wx' });
  await assert.rejects(readPublishedPayload({ files }), { code: 'published-payload-hash' });
  await files.writeFile(cache, Buffer.alloc(1048577));
  await assert.rejects(readPublishedPayload({ files }), { code: 'published-payload-size' });
});

test('prepare downloads only explicit fixed anonymous source and reuses validated cache', async t => {
  const { preparePublishedPayload, readPublishedPayload } = await subject();
  const files = await fresh(t), input = await bytes(), calls = [];
  const fetchImpl = async (url, options) => { calls.push([url, options]); return response(input); };
  await preparePublishedPayload({ files, fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://github.com/Do-hyeon/cheese-knife/releases/download/v2.13.3-community.1/cheese-knife-community-recovery-2.13.3-fb15f967.zip');
  assert.equal(calls[0][1].redirect, 'manual');
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[0][1].headers, undefined);
  assert.equal((await readPublishedPayload({ files })).entries.length, 58);
  await preparePublishedPayload({ files, fetchImpl });
  assert.equal(calls.length, 1);
  assert.deepEqual(await files.readdir(''), [cache]);
});

test('prepare refuses corrupt existing cache without overwrite or network', async t => {
  const { preparePublishedPayload } = await subject(); const files = await fresh(t);
  await files.writeFile(cache, Buffer.alloc(201802), { flag: 'wx' });
  let calls = 0;
  await assert.rejects(preparePublishedPayload({ files, fetchImpl: async () => { calls++; throw Error('network'); } }),
    { code: 'published-payload-hash' });
  assert.equal(calls, 0); assert.deepEqual(await files.readFile(cache), Buffer.alloc(201802));
});

test('prepare permits four approved redirects but leaves no temporary files', async t => {
  const { preparePublishedPayload } = await subject(); const files = await fresh(t), input = await bytes(); let calls = 0;
  await preparePublishedPayload({ files, fetchImpl: async () => {
    calls++;
    return calls <= 4 ? new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/fixed' } }) : response(input);
  } });
  assert.equal(calls, 5); assert.deepEqual(await files.readFile(cache), input);
  assert.deepEqual(await files.readdir(''), [cache]);
});

test('prepare refuses network, stream and write failures and cleans only its own partial', async t => {
  const { preparePublishedPayload } = await subject();
  for (const kind of ['fetch', 'stream', 'partial-write', 'cache-write']) {
    const files = await fresh(t); await files.ensureDirectory('unrelated');
    const injected = { ...files, writeFile: async (name, data, options) => {
      if ((kind === 'partial-write' && name.endsWith('/payload.zip')) || (kind === 'cache-write' && name === cache)) throw Object.assign(Error('test-io'), { code: 'test-io' });
      return files.writeFile(name, data, options);
    }, publishFile: async (source, destination) => {
      if (kind === 'cache-write') throw Object.assign(Error('test-io'), { code: 'test-io' });
      return files.publishFile(source, destination);
    } };
    const fetchImpl = async () => {
      if (kind === 'fetch') throw Object.assign(Error('test-io'), { code: 'test-io' });
      if (kind === 'stream') return new Response(new ReadableStream({ start(controller) { controller.error(Object.assign(Error('test-io'), { code: 'test-io' })); } }));
      return response(await bytes());
    };
    await assert.rejects(preparePublishedPayload({ files: injected, fetchImpl }), { code: 'test-io' });
    assert.deepEqual(await files.readdir(''), ['unrelated']);
  }
});

test('failed partial cache write never publishes corrupt cache', async t => {
  const { preparePublishedPayload } = await subject(); const files = await fresh(t);
  const injected = { ...files, writeFile: async (name, data, options) => {
    if (name === cache) { await files.writeFile(name, data.subarray(0, 17), options); throw Object.assign(Error('disk-full'), { code: 'ENOSPC' }); }
    return files.writeFile(name, data, options);
  } };
  try { await preparePublishedPayload({ files: injected, fetchImpl: async () => response(await bytes()) }); }
  catch (error) { assert.equal(error.code, 'ENOSPC'); }
  const published = await files.lstat(cache, { optional: true });
  if (published) { assert.equal(published.size, 201802); assert.equal(hash(await files.readFile(cache)), hash(await bytes())); }
  else assert.deepEqual(await files.readdir(''), []);
});

test('publish failure cleans temporary bytes but never removes a concurrently created cache', async t => {
  const { preparePublishedPayload } = await subject();
  for (const code of ['ENOSPC', 'EEXIST']) {
    const files = await fresh(t);
    const injected = { ...files, publishFile: async () => {
      if (code === 'EEXIST') await files.writeFile(cache, 'existing', { flag: 'wx' });
      throw Object.assign(Error(code), { code });
    } };
    await assert.rejects(preparePublishedPayload({ files: injected, fetchImpl: async () => response(await bytes()) }), { code });
    assert.deepEqual(await files.readdir(''), code === 'EEXIST' ? [cache] : []);
    if (code === 'EEXIST') assert.equal(await files.readFile(cache, 'utf8'), 'existing');
  }
});

for (const [name, make, code, expectedCalls] of [
  ['wrong host', () => async () => new Response(null, { status: 302, headers: { location: 'https://example.com/x' } }), 'published-payload-url', 1],
  ['plain HTTP', () => async () => new Response(null, { status: 302, headers: { location: 'http://github.com/x' } }), 'published-payload-url', 1],
  ['URL credentials', () => async () => new Response(null, { status: 302, headers: { location: 'https://user:pass@github.com/x' } }), 'published-payload-url', 1],
  ['fifth redirect', () => async () => new Response(null, { status: 302, headers: { location: 'https://github.com/x' } }), 'published-payload-redirects', 5],
  ['HTTP error', () => async () => new Response(null, { status: 404 }), 'published-payload-response', 1],
  ['oversized stream', () => async () => response(Buffer.alloc(1048577)), 'published-payload-size', 1],
  ['wrong hash', () => async () => response(Buffer.alloc(201802)), 'published-payload-hash', 1],
]) test(`prepare rejects ${name} without cache or partial leftovers`, async t => {
  const { preparePublishedPayload } = await subject(); const files = await fresh(t), impl = make(); let calls = 0;
  await assert.rejects(preparePublishedPayload({ files, fetchImpl: (...args) => { calls++; return impl(...args); } }), { code });
  assert.equal(calls, expectedCalls); assert.deepEqual(await files.readdir(''), []);
});

test('prepare bounds unresolved fetch and stream using the abort deadline', async t => {
  const { preparePublishedPayload } = await subject();
  for (const fetchImpl of [() => new Promise(() => {}), async () => new Response(new ReadableStream({ start() {} }))]) {
    const files = await fresh(t), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25);
    try { await assert.rejects(preparePublishedPayload({ files, fetchImpl, signal: controller.signal }), { code: 'published-payload-timeout' }); }
    finally { clearTimeout(timer); }
    assert.deepEqual(await files.readdir(''), []);
  }
});

test('reader/prepare refuses linked cache and does not expose CLI override', async t => {
  const { readPublishedPayload } = await subject(); const files = await fresh(t);
  const target = process.platform === 'win32' ? path.resolve('output/playwright') : path.resolve('output/playwright', cache);
  await fs.symlink(target, path.join(files.root, cache), process.platform === 'win32' ? 'junction' : 'file');
  await assert.rejects(readPublishedPayload({ files }), { code: 'owned-path-link' });
  const result = spawnSync(process.execPath, ['scripts/extension-e2e/published-payload.mjs', '--url=https://example.com'],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /published-payload-args/);
});

test('fixed payload reader passes unchanged static tool rules with no new warnings', () => {
  const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--config', 'eslint.security.config.mjs',
    '--no-inline-config', '--max-warnings=0', '--format=json', 'scripts/extension-e2e/published-payload.mjs'],
  { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
