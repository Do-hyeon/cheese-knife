const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const harnessModule = () => import(pathToFileURL(path.resolve('scripts/extension-e2e/harness.mjs')));
const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const workerURL = `chrome-extension://${extensionId}/background.js`;
const fakeWorker = url => ({ url: () => url });

test('installed E2E arguments accept only bounded unique explicit forms', async () => {
  const { parseInstalledE2EArgs } = await harnessModule();
  const generated = parseInstalledE2EArgs([]);
  assert.equal(generated.headed, false);
  assert.match(generated.runId, /^installed[a-z0-9]+[0-9a-f]{8}$/);
  assert.deepEqual(parseInstalledE2EArgs(['--headed', '--run-id=Run42']), { headed: true, runId: 'Run42' });
  assert.deepEqual(parseInstalledE2EArgs(['--run-id=A1']), { headed: false, runId: 'A1' });

  for (const argv of [
    ['--headed', '--headed'],
    ['--run-id=A', '--run-id=B'],
    ['--unknown'],
    ['--run-id='],
    ['--run-id=with/slash'],
    ['--run-id=with\\slash'],
    [`--run-id=${'a'.repeat(65)}`],
  ]) assert.throws(() => parseInstalledE2EArgs(argv), { code: 'installed-e2e-args-invalid' }, argv.join(' '));
});

test('extension launch options pin bundled Chromium and the isolated candidate', async () => {
  const { extensionLaunchOptions } = await harnessModule();
  const extensionPath = path.resolve('output', 'candidate', 'chrome-candidate');
  assert.deepEqual(extensionLaunchOptions(extensionPath, false), {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  assert.equal(extensionLaunchOptions(extensionPath, true).headless, false);
  assert.throws(() => extensionLaunchOptions('relative/dist', false), { code: 'extension-path-invalid' });
});

test('extension worker URL accepts only the exact MV3 background worker form', async () => {
  const { extensionIdFromWorkerURL } = await harnessModule();
  assert.equal(extensionIdFromWorkerURL(workerURL), extensionId);
  for (const url of [
    `http://${extensionId}/background.js`,
    `chrome-extension://${extensionId.toUpperCase()}/background.js`,
    `chrome-extension://${'a'.repeat(31)}/background.js`,
    `chrome-extension://${extensionId}/other.js`,
    `${workerURL}?query=1`,
    `${workerURL}#fragment`,
    'not-a-url',
  ]) assert.throws(() => extensionIdFromWorkerURL(url), { code: 'extension-worker-url-invalid' }, url);
});

test('worker discovery is bounded and rejects ambiguous or malformed extension workers', async () => {
  const { waitForExtensionWorker } = await harnessModule();
  const valid = fakeWorker(workerURL);
  assert.equal(await waitForExtensionWorker({ serviceWorkers: () => [valid] }, 10), valid);
  await assert.rejects(waitForExtensionWorker({
    serviceWorkers: () => [],
    waitForEvent: async () => { throw new Error('Timeout 5ms exceeded'); },
  }, 5), { code: 'extension-worker-timeout' });
  await assert.rejects(waitForExtensionWorker({
    serviceWorkers: () => [valid, fakeWorker(workerURL)],
  }, 10), { code: 'extension-worker-ambiguous' });
  await assert.rejects(waitForExtensionWorker({
    serviceWorkers: () => [fakeWorker(`chrome-extension://${extensionId}/other.js`)],
  }, 10), { code: 'extension-worker-url-invalid' });
});

test('launch closes every created context when worker validation fails', async () => {
  const { launchInstalledExtension } = await harnessModule();
  const extensionPath = path.resolve('output', 'candidate', 'chrome-candidate');
  const profilePath = path.resolve('output', 'profile');
  const artifactPath = path.resolve('output', 'artifacts');
  const cases = [
    {
      code: 'extension-worker-url-invalid',
      context: { serviceWorkers: () => [fakeWorker(`chrome-extension://${extensionId}/other.js`)] },
    },
    {
      code: 'extension-worker-ambiguous',
      context: { serviceWorkers: () => [fakeWorker(workerURL), fakeWorker(workerURL)] },
    },
    {
      code: 'extension-worker-timeout',
      context: { serviceWorkers: () => [], waitForEvent: async () => { throw new Error('timeout'); } },
    },
  ];
  for (const item of cases) {
    let closed = 0;
    item.context.close = async () => { closed += 1; };
    await assert.rejects(launchInstalledExtension({
      chromiumApi: { launchPersistentContext: async () => item.context },
      extensionPath,
      profilePath,
      artifactPath,
      headed: false,
    }), { code: item.code });
    assert.equal(closed, 1, item.code);
  }
});

test('launch maps browser startup failures and returns a validated worker', async () => {
  const { launchInstalledExtension } = await harnessModule();
  const extensionPath = path.resolve('output', 'candidate', 'chrome-candidate');
  const profilePath = path.resolve('output', 'profile');
  const artifactPath = path.resolve('output', 'artifacts');
  const startup = new Error('Executable does not exist');
  await assert.rejects(launchInstalledExtension({
    chromiumApi: { launchPersistentContext: async () => { throw startup; } },
    extensionPath,
    profilePath,
    artifactPath,
    headed: false,
  }), error => error.code === 'browser-unavailable' && error.cause === startup);

  const worker = fakeWorker(workerURL);
  let launchArgs;
  const context = { serviceWorkers: () => [worker], close: async () => {} };
  const result = await launchInstalledExtension({
    chromiumApi: { launchPersistentContext: async (...args) => { launchArgs = args; return context; } },
    extensionPath,
    profilePath,
    artifactPath,
    headed: false,
  });
  assert.deepEqual(result, { context, worker, extensionId });
  assert.equal(launchArgs[0], profilePath);
  assert.equal(launchArgs[1].channel, 'chromium');
  assert.equal(launchArgs[1].tracesDir, artifactPath);
});

test('Windows SxS recovery retries only the same bundled Chromium through an injected preparation step', async () => {
  const { launchInstalledExtension } = await harnessModule();
  const extensionPath = path.resolve('output', 'candidate', 'chrome-candidate');
  const profilePath = path.resolve('output', 'profile');
  const artifactPath = path.resolve('output', 'artifacts');
  const repairedExecutable = path.join(profilePath, 'bundled-chromium', 'chrome.exe');
  const worker = fakeWorker(workerURL);
  const context = { serviceWorkers: () => [worker], close: async () => {} };
  const launches = [];
  let prepared = 0;
  const chromiumApi = {
    async launchPersistentContext(_profile, options) {
      launches.push(options);
      if (launches.length === 1) throw new Error('spawn UNKNOWN');
      return context;
    },
  };
  const result = await launchInstalledExtension({
    chromiumApi,
    extensionPath,
    profilePath,
    artifactPath,
    headed: false,
    browserCompatibility: {
      platform: 'win32',
      async prepare(input) { prepared += 1; assert.equal(input.chromiumApi, chromiumApi); assert.equal(input.profilePath, profilePath); return repairedExecutable; },
    },
  });
  assert.equal(result.worker, worker);
  assert.equal(prepared, 1);
  assert.equal(launches[1].executablePath, repairedExecutable);
  assert.equal(launches[1].channel, 'chromium');
  assert.deepEqual(launches[1].args, [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]);
});

test('worker reacquisition may reuse only a live valid previous worker', async () => {
  const { reacquireExtensionWorker } = await harnessModule();
  const previous = { url: () => workerURL, evaluate: async () => extensionId };
  const result = await reacquireExtensionWorker({ serviceWorkers: () => [previous] }, previous, 20);
  assert.deepEqual(result, { worker: previous, extensionId });
});

test('reload reacquisition rejects a still-responsive previous worker and requires a replacement', async () => {
  const { reacquireExtensionWorker } = await harnessModule();
  const previous = { url: () => workerURL, evaluate: async () => extensionId };
  await assert.rejects(reacquireExtensionWorker({
    serviceWorkers: () => [previous],
    waitForEvent: async () => { throw new Error('timeout'); },
  }, previous, 5, { reusePrevious: false }), { code: 'extension-worker-reacquire-timeout' });

  const nextId = 'ponmlkjihgfedcbaponmlkjihgfedcba';
  const replacement = { url: () => `chrome-extension://${nextId}/background.js`, evaluate: async () => nextId };
  const context = {
    serviceWorkers: () => [previous, replacement],
    waitForEvent: async () => replacement,
  };
  assert.deepEqual(await reacquireExtensionWorker(context, previous, 20, { reusePrevious: false }), {
    worker: replacement,
    extensionId: nextId,
  });
});

test('worker reacquisition excludes a dead previous worker and recalculates replacement ID', async () => {
  const { reacquireExtensionWorker } = await harnessModule();
  const nextId = 'ponmlkjihgfedcbaponmlkjihgfedcba';
  const previous = { url: () => workerURL, evaluate: async () => { throw new Error('closed'); } };
  const replacement = { url: () => `chrome-extension://${nextId}/background.js`, evaluate: async () => nextId };
  const context = {
    serviceWorkers: () => [previous, replacement],
    waitForEvent: async () => replacement,
  };
  assert.deepEqual(await reacquireExtensionWorker(context, previous, 20), { worker: replacement, extensionId: nextId });
});

test('worker reacquisition bounds timeout and rejects malformed or ambiguous replacements', async () => {
  const { reacquireExtensionWorker } = await harnessModule();
  const dead = { url: () => workerURL, evaluate: async () => { throw new Error('closed'); } };
  await assert.rejects(reacquireExtensionWorker({
    serviceWorkers: () => [dead],
    waitForEvent: async () => { throw new Error('timeout'); },
  }, dead, 5), { code: 'extension-worker-reacquire-timeout' });

  const malformed = { url: () => `chrome-extension://${extensionId}/other.js`, evaluate: async () => extensionId };
  await assert.rejects(reacquireExtensionWorker({ serviceWorkers: () => [dead, malformed] }, dead, 20), {
    code: 'extension-worker-url-invalid',
  });

  const first = { url: () => workerURL, evaluate: async () => extensionId };
  const second = { url: () => workerURL, evaluate: async () => extensionId };
  await assert.rejects(reacquireExtensionWorker({ serviceWorkers: () => [dead, first, second] }, dead, 20), {
    code: 'extension-worker-ambiguous',
  });
});
