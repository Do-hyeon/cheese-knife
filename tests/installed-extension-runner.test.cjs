const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const runnerModule = () => import(pathToFileURL(path.resolve('scripts/check-installed-extension.mjs')));

function runnerFixture({ failAt, artifactExists = false } = {}) {
  const events = [];
  const root = path.resolve('.');
  const profilePath = path.join(root, 'output', 'playwright', 'installed-profile-fixture');
  const artifactPath = path.join(root, 'output', 'playwright', 'installed-extension-Run1');
  const context = {
    tracing: {
      async start() { events.push('trace-start'); if (failAt === 'tracing') throw Object.assign(new Error('trace-start-failed'), { code: 'trace-start-failed' }); },
      async stop() { events.push('trace-stop'); if (failAt === 'trace-stop') throw Object.assign(new Error('trace-stop-failed'), { code: 'trace-stop-failed' }); },
    },
    pages() { return [{ screenshot: async () => { events.push('screenshot'); } }]; },
    async close() { events.push('context-close'); },
  };
  const files = {
    root,
    async lstat() { return artifactExists ? { isDirectory: () => true } : null; },
    async ensureDirectory(relative) { events.push(`ensure:${relative}`); return path.join(root, ...relative.split('/')); },
    async makeTempDirectory() { events.push('profile-create'); return profilePath; },
    async resolve(relative) { return relative.includes('installed-extension-') ? artifactPath : path.join(root, ...relative.split('/')); },
    async removeTree(relative) { events.push(relative.includes('installed-profile-') ? 'profile-remove' : `remove:${relative}`); return true; },
    async writeFile(relative) {
      events.push('json-write');
      if (failAt === 'json') throw Object.assign(new Error('json-write-failed'), { code: 'json-write-failed' });
      return path.join(root, ...relative.split('/'));
    },
  };
  const dependencies = {
    openRepository: async () => files,
    verifyCandidate: async id => { events.push('candidate-build'); return { dist: path.join(root, 'candidate', id, 'dist') }; },
    checkPackage: async () => { events.push('candidate-check'); },
    loadFixtureResponses: async () => { events.push('fixture-load'); return []; },
    launchInstalledExtension: async () => { events.push('browser-launch'); return { context, worker: {}, extensionId: 'a'.repeat(32) }; },
    chromiumApi: {},
    scenario: async () => {
      events.push('scenarios');
      if (failAt === 'scenario') throw Object.assign(new Error('scenario-failed'), { code: 'scenario-failed' });
      return { worker: { passed: true } };
    },
    removeCandidate: async () => { events.push('candidate-remove'); return true; },
  };
  return { events, dependencies };
}

test('installed E2E runner orders isolated candidate, browser and cleanup lifecycle', async () => {
  const { runInstalledExtensionE2E } = await runnerModule();
  const fixture = runnerFixture();
  const report = await runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies });
  assert.equal(report.ok, true);
  const milestones = ['candidate-build', 'profile-create', 'browser-launch', 'scenarios', 'context-close', 'profile-remove', 'candidate-remove'];
  assert.deepEqual(fixture.events.filter(event => milestones.includes(event)), milestones);
  assert.ok(fixture.events.indexOf('candidate-check') > fixture.events.indexOf('candidate-build'));
  assert.ok(fixture.events.indexOf('fixture-load') < fixture.events.indexOf('browser-launch'));
  assert.ok(fixture.events.indexOf('json-write') > fixture.events.indexOf('candidate-remove'));
});

test('installed E2E runner cleans profile and candidate after scenario, tracing and JSON failures', async () => {
  const { runInstalledExtensionE2E } = await runnerModule();
  for (const failAt of ['scenario', 'tracing', 'trace-stop', 'json']) {
    const fixture = runnerFixture({ failAt });
    await assert.rejects(runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies }), error => {
      assert.equal(error.code, failAt === 'scenario' ? 'scenario-failed' : failAt === 'tracing' ? 'trace-start-failed' : failAt === 'trace-stop' ? 'trace-stop-failed' : 'json-write-failed');
      return true;
    });
    assert.equal(fixture.events.filter(event => event === 'context-close').length, 1, failAt);
    assert.equal(fixture.events.filter(event => event === 'profile-remove').length, 1, failAt);
    assert.equal(fixture.events.filter(event => event === 'candidate-remove').length, 1, failAt);
  }
});

test('installed E2E runner never overwrites an existing artifact directory', async () => {
  const { runInstalledExtensionE2E } = await runnerModule();
  const fixture = runnerFixture({ artifactExists: true });
  await assert.rejects(runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies }), {
    code: 'installed-artifact-exists',
  });
  assert.equal(fixture.events.includes('json-write'), false);
  assert.equal(fixture.events.includes('candidate-remove'), true);
  assert.equal(fixture.events.includes('profile-create'), false);
});

test('multi-window scenario starts only after the base handshake state is captured', async () => {
  const { runInstalledScenarioSequence } = await runnerModule();
  const order = [];
  const result = await runInstalledScenarioSequence({ marker: 'input' }, {
    async base(args) {
      order.push('base');
      assert.equal(args.marker, 'input');
      args.captureState({ context: {}, worker: {}, handshake: 'ready' });
      return { popup: { passed: true } };
    },
    async multiWindow(args) {
      order.push('multi-window');
      assert.equal(args.handshake, 'ready');
      return { multiWindow: { passed: true } };
    },
  });
  assert.deepEqual(order, ['base', 'multi-window']);
  assert.deepEqual(result, { popup: { passed: true }, multiWindow: { passed: true } });
});

test('multi-window scenario failure keeps runner cleanup guarantees', async () => {
  const { runInstalledExtensionE2E, runInstalledScenarioSequence } = await runnerModule();
  const fixture = runnerFixture();
  fixture.dependencies.scenario = args => runInstalledScenarioSequence(args, {
    async base(baseArgs) { baseArgs.captureState({ context: {}, worker: {}, handshake: 'ready' }); return { popup: { passed: true } }; },
    async multiWindow() { throw Object.assign(new Error('multi-window-failed'), { code: 'multi-window-failed' }); },
  });
  await assert.rejects(runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies }), {
    code: 'multi-window-failed',
  });
  assert.equal(fixture.events.includes('context-close'), true);
  assert.equal(fixture.events.includes('profile-remove'), true);
  assert.equal(fixture.events.includes('candidate-remove'), true);
});
