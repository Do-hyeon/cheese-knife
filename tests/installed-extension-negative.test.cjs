const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const negativeModule = () => import(pathToFileURL(path.resolve('scripts/check-installed-extension-negative.mjs')));

test('negative manifest mutation removes exactly one MAIN entry and preserves every other field', async () => {
  const { withoutMainContentScript } = await negativeModule();
  const manifest = {
    manifest_version: 3,
    name: 'fixture',
    content_scripts: [
      { matches: ['https://chzzk.naver.com/*'], js: ['web/main.js'] },
      { matches: ['https://chzzk.naver.com/*'], js: ['web/runtime.js'], world: 'MAIN' },
    ],
  };
  const mutated = withoutMainContentScript(manifest);
  assert.deepEqual(mutated, {
    manifest_version: 3,
    name: 'fixture',
    content_scripts: [{ matches: ['https://chzzk.naver.com/*'], js: ['web/main.js'] }],
  });
  assert.equal(manifest.content_scripts.length, 2);
  assert.throws(() => withoutMainContentScript({ content_scripts: [] }), { code: 'negative-main-entry-count' });
  assert.throws(() => withoutMainContentScript({ content_scripts: [{ world: 'MAIN' }, { world: 'MAIN' }] }), { code: 'negative-main-entry-count' });
});

test('negative runner accepts only the expected missing MAIN runtime failure', async () => {
  const { runInstalledExtensionNegative } = await negativeModule();
  const events = [];
  const dependencies = {
    prepareCandidate: async () => ({ candidate: { dist: path.resolve('negative-dist') }, cleanup: async () => { events.push('cleanup'); } }),
    runInstalled: async options => {
      events.push('run');
      assert.equal(typeof options.dependencies.verifyCandidate, 'function');
      assert.equal(options.dependencies.scenario.name, 'runBaseInstalledScenario');
      throw Object.assign(new Error('main-runtime-missing'), { code: 'main-runtime-missing' });
    },
    writeReport: async report => { events.push(`report:${report.observedFailure}`); },
  };
  const report = await runInstalledExtensionNegative({ runId: 'Negative1', headed: false, dependencies });
  assert.equal(report.ok, true);
  assert.equal(report.observedFailure, 'main-runtime-missing');
  assert.deepEqual(events, ['run', 'cleanup', 'report:main-runtime-missing']);
});

test('negative runner rejects an unexpected pass or any other failure code and still cleans', async () => {
  const { runInstalledExtensionNegative } = await negativeModule();
  for (const observed of ['pass', 'storage-setting-missing']) {
    let cleaned = 0;
    const dependencies = {
      prepareCandidate: async () => ({ candidate: { dist: path.resolve('negative-dist') }, cleanup: async () => { cleaned += 1; } }),
      runInstalled: async () => {
        if (observed === 'pass') return { ok: true };
        throw Object.assign(new Error(observed), { code: observed });
      },
      writeReport: async () => {},
    };
    await assert.rejects(runInstalledExtensionNegative({ runId: 'Negative1', headed: false, dependencies }), {
      code: observed === 'pass' ? 'negative-control-unexpected-pass' : 'negative-control-unexpected-failure',
    });
    assert.equal(cleaned, 1, observed);
  }
});
