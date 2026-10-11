import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { checkPackage } from './check-package.mjs';
import { FIXTURE_LIVE_URL, fixtureDecision, loadFixtureResponses } from './extension-e2e/fixture-router.mjs';
import { launchInstalledExtension, parseInstalledE2EArgs } from './extension-e2e/harness.mjs';
import { openOwnedRoot } from './owned-files.mjs';
import { removeCandidate, verifyCandidate } from './verify-candidate.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slash = value => value.split(path.sep).join('/');
const runnerError = (code, cause) => Object.assign(new Error(code, cause ? { cause } : undefined), { code });
const passed = details => ({ passed: true, ...details });

const assertCondition = (condition, code) => {
  if (!condition) throw runnerError(code);
};

const waitUntil = async (read, accept, code, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  let value;
  do {
    value = await read();
    if (accept(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw runnerError(code);
};

const storageSnapshot = worker => worker.evaluate(() => chrome.storage.local.get(null));

export async function runBaseInstalledScenario({ context, worker, extensionId, responses, restartSession }) {
  const pageErrors = [];
  const routeErrors = [];
  const fulfilled = [];
  const aborted = [];
  const attachPage = page => page.on('pageerror', error => pageErrors.push(String(error?.message || error).slice(0, 240)));
  const installContextObservers = async current => {
    for (const existing of current.pages()) attachPage(existing);
    current.on('page', attachPage);
    await current.route(/^https?:\/\//, async route => {
      const url = route.request().url();
      try {
        const decision = fixtureDecision(url, responses);
        if (decision.action === 'fulfill') {
          fulfilled.push(url);
          await route.fulfill({ status: decision.status, contentType: decision.contentType, body: decision.body });
        } else {
          aborted.push(url);
          await route.abort('blockedbyclient');
        }
      } catch (error) {
        routeErrors.push(String(error?.code || error?.message || error).slice(0, 120));
        await route.abort('blockedbyclient').catch(() => {});
      }
    });
  };
  await installContextObservers(context);

  let page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(FIXTURE_LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const runtime = window[Symbol.for('cheese-knife.runtime.v1')];
    return !!runtime?.configReady;
  }, null, { timeout: 15000 });

  let popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await popup.locator('#settings-status[data-phase="ready"]').waitFor({ timeout: 15000 });
  const arrowSeek = popup.locator('#arrowSeek');
  await arrowSeek.waitFor({ state: 'visible' });
  await arrowSeek.uncheck();

  const stored = await waitUntil(
    () => storageSnapshot(worker),
    value => value?.config?.arrowSeek === false,
    'storage-setting-missing',
  );
  const main = await waitUntil(
    () => page.evaluate(() => {
      const runtime = window[Symbol.for('cheese-knife.runtime.v1')];
      return runtime ? { ready: runtime.configReady, arrowSeek: runtime.config.arrowSeek } : null;
    }),
    value => value?.ready && value.arrowSeek === false,
    'main-setting-missing',
  );
  const envelope = await page.evaluate(() => window.__knifeFixture?.lastConfigEnvelope || null);
  assertCondition(envelope && typeof envelope.requestId === 'string' && Number.isSafeInteger(envelope.revision), 'isolated-bridge-metadata-missing');

  const beforeInvalid = await storageSnapshot(worker);
  const invalidReply = await popup.evaluate(() => new Promise(resolve => chrome.runtime.sendMessage({
    namespace: 'cheese-knife-settings', protocol: 1, action: 'patch', requestId: 'e2e-invalid', unexpected: true,
  }, resolve)));
  const afterInvalid = await storageSnapshot(worker);
  assertCondition(invalidReply?.ok === false && invalidReply.code === 'invalid-request', 'invalid-message-accepted');
  assertCondition(JSON.stringify(beforeInvalid) === JSON.stringify(afterInvalid), 'invalid-message-mutated-storage');

  await page.evaluate(metadata => {
    const runtime = window[Symbol.for('cheese-knife.runtime.v1')];
    window.postMessage({
      namespace: 'cheese-knife', protocol: 1, type: 'config', requestId: metadata.requestId,
      revision: metadata.revision - 1, config: { ...runtime.config, arrowSeek: true }, i18n: {},
    }, location.origin);
  }, envelope);
  await page.waitForTimeout(100);
  assertCondition(await page.evaluate(() => window[Symbol.for('cheese-knife.runtime.v1')].config.arrowSeek === false), 'stale-revision-accepted');

  const validSnapshot = await storageSnapshot(worker);
  await worker.evaluate(() => chrome.storage.local.set({ settingsRevision: 'invalid-e2e-revision' }));
  await popup.close();
  ({ context, worker, extensionId } = await restartSession());
  await installContextObservers(context);
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await popup.locator('#settings-status[data-phase="repair-required"]').waitFor({ timeout: 15000 });
  assertCondition((await storageSnapshot(worker)).settingsRevision === 'invalid-e2e-revision', 'damaged-storage-mutated');
  await popup.evaluate(snapshot => chrome.storage.local.set(snapshot), validSnapshot);
  await popup.close();
  ({ context, worker, extensionId } = await restartSession());
  await installContextObservers(context);
  page = context.pages()[0] || await context.newPage();
  await page.goto(FIXTURE_LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.configReady === true, null, { timeout: 15000 });
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await popup.locator('#settings-status[data-phase="ready"]').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.config.arrowSeek === false, null, { timeout: 15000 });

  assertCondition(routeErrors.length === 0, 'fixture-route-error');
  assertCondition(pageErrors.length === 0, 'installed-page-error');
  const allowed = new Set(responses.map(response => response.url));
  assertCondition(fulfilled.every(url => allowed.has(url)), 'network-allowlist-escape');

  return {
    worker: passed({ extensionId }),
    popup: passed({ phase: 'ready' }),
    storage: passed({ revision: validSnapshot.settingsRevision, arrowSeek: stored.config.arrowSeek }),
    isolatedBridge: passed({ requestIdObserved: true, revisionObserved: true }),
    mainRuntime: passed({ arrowSeek: main.arrowSeek }),
    invalidMessage: passed({ code: invalidReply.code }),
    staleRevision: passed({ preserved: true }),
    damagedStorage: passed({ repairPhase: 'repair-required', restored: true }),
    network: passed({ fulfilled: [...new Set(fulfilled)].sort(), aborted: [...new Set(aborted)].sort() }),
  };
}

const defaultDependencies = {
  openRepository: () => openOwnedRoot(repositoryRoot),
  verifyCandidate,
  removeCandidate,
  checkPackage,
  loadFixtureResponses,
  launchInstalledExtension,
  chromiumApi: chromium,
  scenario: runBaseInstalledScenario,
};

const relativeOwnedPath = (root, absolute) => {
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw runnerError('owned-cleanup-path-invalid');
  return slash(relative);
};

export async function runInstalledExtensionE2E({ headed = false, runId, dependencies = {} } = {}) {
  if (!/^[A-Za-z0-9]{1,64}$/.test(runId || '')) throw runnerError('installed-e2e-run-id-invalid');
  const deps = { ...defaultDependencies, ...dependencies };
  const files = await deps.openRepository();
  const artifactRelative = `output/playwright/installed-extension-${runId}`;
  let candidateBuilt = false;
  let artifactCreated = false;
  let profilePath;
  let context;
  let traceStarted = false;
  let traceStopped = false;
  let report;
  let primaryError;

  const remember = error => { if (!primaryError) primaryError = error; };
  try {
    const candidate = await deps.verifyCandidate(runId);
    candidateBuilt = true;
    await deps.checkPackage(candidate.dist);
    await files.ensureDirectory('output/playwright');
    if (await files.lstat(artifactRelative, { optional: true })) throw runnerError('installed-artifact-exists');
    await files.ensureDirectory(artifactRelative);
    artifactCreated = true;
    const artifactPath = await files.resolve(artifactRelative, { type: 'directory' });
    profilePath = await files.makeTempDirectory('output/playwright/installed-profile-');
    const responses = await deps.loadFixtureResponses(files);
    const launchOptions = {
      chromiumApi: deps.chromiumApi,
      extensionPath: candidate.dist,
      profilePath,
      artifactPath,
      headed,
    };
    let launched = await deps.launchInstalledExtension(launchOptions);
    context = launched.context;
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    traceStarted = true;
    const restartSession = async () => {
      if (traceStarted && !traceStopped) {
        await context.tracing.stop();
        traceStopped = true;
      }
      await context.close();
      launched = await deps.launchInstalledExtension(launchOptions);
      context = launched.context;
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      traceStarted = true;
      traceStopped = false;
      return launched;
    };
    const sections = await deps.scenario({ ...launched, responses, artifactPath, restartSession });
    await context.tracing.stop();
    traceStopped = true;
    report = { ok: true, runId, ...sections };
  } catch (error) {
    remember(error);
    report = { ok: false, runId, error: { code: error?.code || 'installed-e2e-failed' } };
    if (context) {
      const page = context.pages().at(-1);
      if (page) {
        try { await page.screenshot({ path: path.join(files.root, ...artifactRelative.split('/'), 'failure.png'), fullPage: false }); } catch {}
      }
      if (traceStarted && !traceStopped) {
        try {
          await context.tracing.stop({ path: path.join(files.root, ...artifactRelative.split('/'), 'trace.zip') });
          traceStopped = true;
        } catch {}
      }
    }
  } finally {
    if (context) {
      try { await context.close(); } catch (error) { remember(error); }
    }
    if (profilePath) {
      try { await files.removeTree(relativeOwnedPath(files.root, profilePath)); } catch (error) { remember(error); }
    }
    if (candidateBuilt) {
      try { await deps.removeCandidate(runId); } catch (error) { remember(error); }
    }
  }

  if (primaryError && report?.ok) report = { ok: false, runId, error: { code: primaryError?.code || 'installed-e2e-cleanup-failed' } };
  if (artifactCreated) {
    try {
      await files.writeFile(`${artifactRelative}/summary.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    } catch (error) {
      remember(error);
    }
  }
  if (primaryError) throw primaryError;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseInstalledE2EArgs(process.argv.slice(2));
  console.log(JSON.stringify(await runInstalledExtensionE2E(options), null, 2));
}
