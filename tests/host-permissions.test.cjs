const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { page, load } = require('./helpers.cjs');

const expectedOrigins = ['https://chzzk.naver.com/*'];
const baseline = JSON.parse(fs.readFileSync('tests/fixtures/host-permissions-baseline.json', 'utf8'));

test('host policy and manifest use HTTPS main only without changing static script boundaries', t => {
  const dom = page(); t.after(() => dom.window.close()); load(dom, 'media-profiles.js'); load(dom, 'config.js');
  const policy = dom.window.KnifeHostPolicy;
  assert.ok(policy, 'config must expose the shared host policy');
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.origins), true);
  assert.deepEqual(Array.from(policy.origins), expectedOrigins);

  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.deepEqual(manifest.host_permissions, expectedOrigins);
  assert.deepEqual(manifest.permissions, baseline.permissions);
  assert.equal(manifest.minimum_chrome_version, baseline.minimum_chrome_version);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts.map(item => item.matches), [expectedOrigins, expectedOrigins, expectedOrigins]);
  assert.deepEqual(manifest.content_scripts.slice(0, 2).map(({ matches, js, ...item }) => item),
    baseline.content_scripts.map(({ js, ...item }) => item));
  assert.deepEqual(manifest.content_scripts.slice(0, 2).map(item => item.js), baseline.content_scripts.map(item =>
    item.world==='MAIN'?item.js:['media-profiles.js',...item.js]));
  assert.deepEqual(manifest.content_scripts[2], { all_frames: false, js: ['web/player-gain.js'],
    matches: expectedOrigins, exclude_matches: manifest.content_scripts[0].exclude_matches, world: 'ISOLATED' });
});
