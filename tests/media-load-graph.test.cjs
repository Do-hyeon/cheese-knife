const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { settingsHarness, config } = require('./settings-fixture.cjs');
const files = ['media-profiles.js', 'config.js', 'style-schema.js', 'settings-contract.js', 'settings-broker.js'];
const current = () => ({ generation: 'f00', sources: Object.fromEntries(files.map(file => [file, fs.readFileSync(file, 'utf8')])) });

test('tagged published four-file worker still writes through the unchanged v1 contract', async t => {
  const { readPublishedWorkerSources } = await import('../scripts/published-settings-baseline.mjs');
  const h = settingsHarness(t, {}, { generation: 'published', sources: readPublishedWorkerSources() });
  await h.initialize(); await h.settle();
  const reply = await h.patch('popup', [config('arrowSeek', false)]);
  assert.equal(reply.stored, true);
  assert.equal(h.saved.config.arrowSeek, false);
});

test('tagged F00 five-file worker loads the pure dependency before config and v1 writer', async t => {
  const h = settingsHarness(t, {}, current());
  await h.initialize(); await h.settle();
  assert.equal(typeof h.worker.window.KnifeMediaProfiles?.readStore, 'function');
  const reply = await h.patch('popup', [config('brightness', 1.225)]);
  assert.equal(reply.stored, true);
  assert.equal(h.saved.config.brightness, 1.225);
  assert.equal(Object.hasOwn(h.saved, 'mediaProfiles'), false);
});

test('missing dependency and incorrect generation cannot retire a healthy worker', async t => {
  const h = settingsHarness(t); await h.initialize(); await h.settle();
  const worker = h.worker, pack = current(), missing = { ...pack.sources }; delete missing['media-profiles.js'];
  for (const invalid of [{ generation: 'f00', sources: missing }, { generation: 'published', sources: pack.sources },
    { ...pack, sources: Object.create(pack.sources) }, { ...pack, extra: true }]) {
    assert.throws(() => h.restartBroker(invalid), /fixture-worker-sources/);
    assert.strictEqual(h.worker, worker);
  }
  assert.equal((await h.patch('popup', [config('arrowSeek', false)])).stored, true);
});
