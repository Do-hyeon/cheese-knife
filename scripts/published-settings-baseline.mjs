import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {'config.js'|'style-schema.js'|'settings-contract.js'|'settings-broker.js'} WorkerFile */
/** @typedef {Readonly<Record<WorkerFile,string>>} WorkerSources */
const sameHash = hash => Object.freeze({ gitSha256: hash, publishedSha256: hash });
export const PUBLISHED_SETTINGS_BASELINE = Object.freeze({
  sourceCommit: 'fb15f9675f9ea910e98363635155bc4ff9eb1d2f',
  version: '2.13.3',
  submissionZipSha256: '67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51',
  files: Object.freeze({
    'config.js': Object.freeze({
      gitSha256: '9cd127c2ad33f349660d7730366db9015d08b94bc98f2d42e20bff244447f61b',
      publishedSha256: 'b29dde24d8a7d0245a1a54a2eb55e08360e42a75e138ca34e072f816bf3730c1',
      crlfLineRanges: Object.freeze([Object.freeze([1, 12]), Object.freeze([21, 49]), Object.freeze([52, 220])]),
    }),
    'style-schema.js': sameHash('43f37f8231ebac76fcff3ea4630ef958b1781ba53c9cb3c6fbcb2404311280c8'),
    'settings-contract.js': sameHash('5affb77bc67ade7ee48b4a00a84d5839a4bd7fd8bed24db59961db6514c954aa'),
    'settings-broker.js': sameHash('83f3b72a9cfd63ad15e85680fa97b71d72972b5d356eea593e7278bbfbd1726e'),
  }),
});
const files = Object.keys(PUBLISHED_SETTINGS_BASELINE.files);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = code => Object.assign(new Error(code), { code });

/** @param {Readonly<Record<WorkerFile,Buffer>>} blobs @returns {WorkerSources} */
export function validatePublishedWorkerBlobs(blobs) {
  if (!blobs || typeof blobs !== 'object' || Array.isArray(blobs) ||
    Reflect.ownKeys(blobs).length !== files.length) throw fail('published-baseline-input');
  const values = files.map(file => Object.getOwnPropertyDescriptor(blobs, file)?.value);
  if (!values.every(value => Buffer.isBuffer(value))) throw fail('published-baseline-input');
  if (values.some(value => value.length > 1048576) ||
    values.reduce((total, value) => total + value.length, 0) > 2097152) throw fail('published-baseline-size');
  const sources = [];
  for (const [index, [file, entry]] of Object.entries(PUBLISHED_SETTINGS_BASELINE.files).entries()) {
    const value = values.at(index);
    if (sha256(value) !== entry.gitSha256) throw fail('published-baseline-git-hash');
    let source = value.toString('utf8');
    // The attested config entry has mixed EOLs; general normalization loses its exact identity.
    if (entry.crlfLineRanges) source = source.split('\n').map((line, i) =>
      entry.crlfLineRanges.some(([first, last]) => i + 1 >= first && i + 1 <= last) ? line + '\r' : line).join('\n');
    if (sha256(source) !== entry.publishedSha256) throw fail('published-baseline-payload-hash');
    sources.push([file, source]);
  }
  return Object.freeze(Object.fromEntries(sources));
}

/** @returns {WorkerSources} */
export function readPublishedWorkerSources() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let blobs;
  try {
    // Fixed local objects only: CI fetches this immutable commit before tests, never here.
    blobs = Object.fromEntries(files.map(file => [file, execFileSync('git',
      ['show', `${PUBLISHED_SETTINGS_BASELINE.sourceCommit}:${file}`],
      { cwd: root, timeout: 15000, maxBuffer: 1048576, stdio: ['ignore', 'pipe', 'pipe'] })]));
  } catch { throw fail('published-baseline-unavailable'); }
  return validatePublishedWorkerBlobs(blobs);
}
