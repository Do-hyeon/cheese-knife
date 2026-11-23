import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openOwnedRoot } from '../owned-files.mjs';

export const PUBLISHED_PAYLOAD_BASELINE = Object.freeze({
  sourceCommit: 'fb15f9675f9ea910e98363635155bc4ff9eb1d2f',
  url: 'https://github.com/Do-hyeon/cheese-knife/releases/download/v2.13.3-community.1/cheese-knife-community-recovery-2.13.3-fb15f967.zip',
  bytes: 201802,
  sha256: '67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51',
  metadataSha256: '669cc7f64599e748f4d3ec86e45472786cf331e4a0b207914619a03f849a652c',
  inventorySha256: 'a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2',
  cache: 'published-payload-67ae9c1512fef7e0.zip',
  archiveLimit: 1048576, entryLimit: 1048576, totalLimit: 2097152, metadataLimit: 65536,
});
const baseline = PUBLISHED_PAYLOAD_BASELINE;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fail = code => Object.assign(new Error(code), { code });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const repository = await openOwnedRoot(repositoryRoot);
const metadataBytes = await repository.readFile('tests/fixtures/installed-extension/published-payload.json');
if (metadataBytes.length > baseline.metadataLimit) throw fail('published-payload-metadata');
const metadata = validatePayloadMetadata(JSON.parse(metadataBytes));

/** Only the attested table is accepted, including by callers of this validator. */
export function validatePayloadMetadata(rows) {
  try {
    if (!Array.isArray(rows) || rows.length !== 58) throw Error();
    const serialized = JSON.stringify(rows);
    if (Buffer.byteLength(serialized) > baseline.metadataLimit || hash(serialized) !== baseline.metadataSha256) throw Error();
    const names = new Set(), intervals = []; let total = 0, previous = '';
    for (const row of rows) {
      if (Object.keys(row).join(',') !== 'name,dataOffset,compressedBytes,rawBytes,sha256,method,flags' ||
          typeof row.name !== 'string' || row.name.split('/').some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..') || row.name <= previous ||
          names.has(row.name.toLowerCase()) || !/^[a-f0-9]{64}$/.test(row.sha256) || row.method !== 8 || row.flags !== 0 ||
          ![row.dataOffset, row.compressedBytes, row.rawBytes].every(n => Number.isSafeInteger(n) && n > 0) ||
          row.rawBytes > baseline.entryLimit || row.dataOffset + row.compressedBytes > baseline.bytes) throw Error();
      previous = row.name; names.add(row.name.toLowerCase());
      intervals.push([row.dataOffset, row.dataOffset + row.compressedBytes]); total += row.rawBytes;
    }
    intervals.sort((a, b) => a[0] - b[0]);
    if (intervals.some((interval, i) => i && intervals.at(i - 1)[1] > interval[0]) || total > baseline.totalLimit ||
        hash(JSON.stringify(rows.map(row => [row.name, row.sha256]))) !== baseline.inventorySha256) throw Error();
    return Object.freeze(rows.map(row => Object.freeze({ ...row })));
  } catch { throw fail('published-payload-metadata'); }
}

export function readPublishedPayloadZip(bytes) {
  if (!Buffer.isBuffer(bytes)) throw fail('published-payload-input');
  if (bytes.length > baseline.archiveLimit || bytes.length !== baseline.bytes) throw fail('published-payload-size');
  // Trust no offsets or paths until the complete fixed archive is authenticated.
  if (hash(bytes) !== baseline.sha256) throw fail('published-payload-hash');
  const entries = metadata.map(row => {
    const output = inflateRawSync(bytes.subarray(row.dataOffset, row.dataOffset + row.compressedBytes),
      { maxOutputLength: baseline.entryLimit });
    if (output.length !== row.rawBytes || hash(output) !== row.sha256) throw fail('published-payload-entry');
    return Object.freeze({ name: row.name, bytes: output, sha256: row.sha256 });
  });
  if (hash(JSON.stringify(entries.map(entry => [entry.name, hash(entry.bytes)]))) !== baseline.inventorySha256) {
    throw fail('published-payload-inventory');
  }
  return Object.freeze({ entries: Object.freeze(entries), inventorySha256: baseline.inventorySha256 });
}

async function cacheFiles(prepare) {
  if (prepare) await repository.ensureDirectory('output/playwright');
  try { return await openOwnedRoot(await repository.resolve('output/playwright', { type: 'directory' })); }
  catch (error) { if (error?.code === 'ENOENT') throw fail('published-payload-unavailable'); throw error; }
}

export async function readPublishedPayload({ files } = {}) {
  files ||= await cacheFiles(false);
  try {
    const stat = await files.lstat(baseline.cache);
    if (stat.size !== baseline.bytes) throw fail('published-payload-size');
    return readPublishedPayloadZip(await files.readFile(baseline.cache));
  } catch (error) {
    if (error?.code === 'ENOENT') throw fail('published-payload-unavailable');
    throw error;
  }
}

function allowedURL(value) {
  let url;
  try { url = new URL(value); } catch { throw fail('published-payload-url'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname)) {
    throw fail('published-payload-url');
  }
  return url.href;
}

async function download(fetchImpl, signal) {
  let url = baseline.url;
  for (let redirects = 0; ; redirects++) {
    const response = await fetchImpl(allowedURL(url), { redirect: 'manual', credentials: 'omit', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      if (redirects >= 4) throw fail('published-payload-redirects');
      const location = response.headers.get('location');
      if (!location) throw fail('published-payload-url');
      url = allowedURL(new URL(location, url).href); continue;
    }
    if (response.status !== 200 || !response.body) throw fail('published-payload-response');
    const reader = response.body.getReader(); let total = 0; const chunks = [];
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      while (true) {
        if (signal.aborted) throw fail('published-payload-timeout');
        const { value, done } = await reader.read(); if (done) break;
        total += value.byteLength;
        if (total > baseline.archiveLimit) { await reader.cancel(); throw fail('published-payload-size'); }
        chunks.push(Buffer.from(value));
      }
      if (signal.aborted) throw fail('published-payload-timeout');
      return Buffer.concat(chunks, total);
    } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  }
}

export async function preparePublishedPayload({ files, fetchImpl = fetch, signal = AbortSignal.timeout(30000) } = {}) {
  files ||= await cacheFiles(true);
  if (await files.lstat(baseline.cache, { optional: true })) { await readPublishedPayload({ files }); return; }
  let abort, partial;
  try {
    const timeout = new Promise((_, reject) => {
      abort = () => reject(fail('published-payload-timeout'));
      signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    });
    const bytes = await Promise.race([download(fetchImpl, signal), timeout]);
    readPublishedPayloadZip(bytes);
    const directory = await files.makeTempDirectory('published-payload-partial-');
    partial = path.relative(files.root, directory).split(path.sep).join('/');
    await files.writeFile(`${partial}/payload.zip`, bytes, { flag: 'wx' });
    await files.publishFile(`${partial}/payload.zip`, baseline.cache);
  } catch (error) {
    if (signal.aborted) throw fail('published-payload-timeout');
    throw error;
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
    if (partial) await files.removeTree(partial);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--prepare') throw fail('published-payload-args');
    await preparePublishedPayload(); console.log('published-payload-ready');
  } catch (error) { console.error(error?.code || error?.message); process.exitCode = 1; }
}
