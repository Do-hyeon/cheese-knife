const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'knife-hls-provenance-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  for (const folder of ['scripts', 'vendor', 'node_modules/hls.js/dist']) fs.mkdirSync(path.join(temporary, folder), { recursive: true });
  for (const file of ['scripts/vendor-hls.mjs', 'scripts/hls-hardening.mjs', 'node_modules/hls.js/package.json', 'node_modules/hls.js/LICENSE', 'node_modules/hls.js/dist/hls.light.min.js']) {
    fs.copyFileSync(path.join(root, file), path.join(temporary, file));
  }
  return temporary;
}
function generate(directory) {
  return spawnSync(process.execPath, [path.join(directory, 'scripts/vendor-hls.mjs')], {
    timeout: 10000, windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024,
  });
}
test('pinned vendoring deterministically reproduces the candidate and retains the upstream license', t => {
  const temporary = fixture(t);
  const first = generate(temporary);
  assert.equal(first.error, undefined);
  assert.equal(first.status, 0, first.stderr);
  const firstBytes = fs.readFileSync(path.join(temporary, 'vendor/hls.light.private.js'));
  assert.deepEqual(firstBytes, fs.readFileSync(path.join(root, 'vendor/hls.light.private.js')));
  const second = generate(temporary);
  assert.equal(second.error, undefined);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(fs.readFileSync(path.join(temporary, 'vendor/hls.light.private.js')), firstBytes);
  assert.deepEqual(fs.readFileSync(path.join(temporary, 'vendor/hls.js.LICENSE')), fs.readFileSync(path.join(root, 'node_modules/hls.js/LICENSE')));
});
test('vendoring refuses changed upstream bytes without replacing an existing candidate', t => {
  const temporary = fixture(t);
  const target = path.join(temporary, 'vendor/hls.light.private.js');
  const preserved = Buffer.from('existing candidate must survive a refused build');
  fs.writeFileSync(target, preserved);
  fs.appendFileSync(path.join(temporary, 'node_modules/hls.js/dist/hls.light.min.js'), '\n// different upstream bytes\n');
  const result = generate(temporary);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unreviewed upstream HLS distribution hash/);
  assert.deepEqual(fs.readFileSync(target), preserved);
});
test('vendoring refuses an unexpected dependency version before creating an artifact', t => {
  const temporary = fixture(t);
  const metadataPath = path.join(temporary, 'node_modules/hls.js/package.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  metadata.version = '0.0.0';
  fs.writeFileSync(metadataPath, JSON.stringify(metadata));
  const result = generate(temporary);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected the reviewed HLS.js version 1.6.16/);
  assert.equal(fs.existsSync(path.join(temporary, 'vendor/hls.light.private.js')), false);
});
test('hardening refuses missing and duplicate transform anchors', async () => {
  const { hardenHls } = await import(pathToFileURL(path.join(root, 'scripts/hls-hardening.mjs')).href);
  const original = fs.readFileSync(path.join(root, 'node_modules/hls.js/dist/hls.light.min.js'), 'utf8');
  const anchor = 'function ke(e,t){';
  assert.equal(original.split(anchor).length, 2, 'fixture requires one selected parser anchor');
  assert.throws(() => hardenHls(original.replace(anchor, 'function keMissing(e,t){')), /HLS hardening anchor changed/);
  assert.throws(() => hardenHls(original + '\n' + anchor), /HLS hardening anchor changed/);
});
test('vendoring refuses a changed upstream license without replacing an existing candidate', t => {
  const temporary = fixture(t);
  const target = path.join(temporary, 'vendor/hls.light.private.js');
  const preserved = Buffer.from('candidate must survive a refused license');
  fs.writeFileSync(target, preserved);
  fs.appendFileSync(path.join(temporary, 'node_modules/hls.js/LICENSE'), '\nchanged license bytes\n');
  const result = generate(temporary);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unreviewed upstream HLS license hash/);
  assert.deepEqual(fs.readFileSync(target), preserved);
});
test('vendoring preserves an existing candidate when a transform anchor is missing', t => {
  const temporary = fixture(t);
  const target = path.join(temporary, 'vendor/hls.light.private.js');
  const preserved = Buffer.from('candidate must survive a refused transform');
  fs.writeFileSync(target, preserved);
  const hardeningPath = path.join(temporary, 'scripts/hls-hardening.mjs');
  const hardening = fs.readFileSync(hardeningPath, 'utf8');
  const anchor = "source = replaceOnce(source, 'function ke(e,t){'";
  assert.equal(hardening.split(anchor).length, 2);
  fs.writeFileSync(hardeningPath, hardening.replace(anchor, "source = replaceOnce(source, 'function missingKe(e,t){'"));
  const result = generate(temporary);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HLS hardening anchor changed/);
  assert.deepEqual(fs.readFileSync(target), preserved);
});
