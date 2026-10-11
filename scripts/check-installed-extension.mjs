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

export async function runBaseInstalledScenario({ context, worker, extensionId, responses, restartSession, captureState }) {
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

  if (typeof captureState === 'function') captureState({ context, worker, extensionId, page, popup, pageErrors, routeErrors });
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

const runtimeSnapshot = page => page.evaluate(() => {
  const runtime = window[Symbol.for('cheese-knife.runtime.v1')];
  const video = document.querySelector('video');
  return {
    ready: !!runtime?.configReady,
    generation: runtime?.generation,
    ownedControls: document.querySelectorAll('.knife-owned').length,
    loads: window.__knifeFixture?.loads,
    video: video ? { muted: video.muted, volume: video.volume, playbackRate: video.playbackRate } : null,
  };
});

const sendSettingsMessage = (page, message) => page.evaluate(value => new Promise(resolve => chrome.runtime.sendMessage(value, resolve)), message);

export async function runMultiWindowScenario({ context, worker, extensionId, page, popup, pageErrors = [], routeErrors = [] }) {
  assertCondition(context && worker && page && popup, 'base-handshake-state-missing');
  await popup.close();
  const firstTab = await worker.evaluate(async url => {
    const matches = (await chrome.tabs.query({})).filter(tab => tab.url === url);
    return matches.length === 1 ? { tabId: matches[0].id, windowId: matches[0].windowId } : null;
  }, FIXTURE_LIVE_URL);
  assertCondition(firstTab && [firstTab.tabId, firstTab.windowId].every(Number.isSafeInteger), 'first-target-missing');

  const secondTarget = await worker.evaluate(async url => {
    const created = await chrome.windows.create({ url, focused: false });
    const tabs = created.tabs?.length ? created.tabs : await chrome.tabs.query({ windowId: created.id });
    return tabs.length === 1 ? { tabId: tabs[0].id, windowId: created.id } : null;
  }, FIXTURE_LIVE_URL);
  assertCondition(secondTarget && [secondTarget.tabId, secondTarget.windowId].every(Number.isSafeInteger), 'second-target-missing');
  assertCondition(firstTab.tabId !== secondTarget.tabId && firstTab.windowId !== secondTarget.windowId, 'multi-window-not-distinct');
  const secondPage = await waitUntil(
    () => Promise.resolve(context.pages().find(candidate => candidate !== page && candidate.url() === FIXTURE_LIVE_URL)),
    Boolean,
    'second-page-missing',
  );
  await secondPage.goto(FIXTURE_LIVE_URL, { waitUntil: 'domcontentloaded' });
  await secondPage.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.configReady === true, null, { timeout: 15000 });
  await page.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.configReady === true, null, { timeout: 15000 });
  await Promise.all([
    page.waitForFunction(() => Number.isSafeInteger(window.__knifeFixture?.loads), null, { timeout: 15000 }),
    secondPage.waitForFunction(() => Number.isSafeInteger(window.__knifeFixture?.loads), null, { timeout: 15000 }),
  ]);

  const popupA = await context.newPage();
  const popupB = await context.newPage();
  await Promise.all([
    popupA.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' }),
    popupB.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' }),
  ]);
  await Promise.all([
    popupA.locator('#settings-status[data-phase="ready"]').waitFor({ timeout: 15000 }),
    popupB.locator('#settings-status[data-phase="ready"]').waitFor({ timeout: 15000 }),
  ]);
  await popupA.locator('#arrowSeek').check();
  await waitUntil(() => storageSnapshot(worker), value => value?.config?.arrowSeek === true, 'concurrent-prime-setting-missing');
  await Promise.all([popupA.locator('#arrowSeek').uncheck(), popupB.locator('#previewVolume').fill('25')]);
  const concurrent = await waitUntil(
    () => storageSnapshot(worker),
    value => value?.config?.arrowSeek === false && value?.config?.previewVolume === 25,
    'concurrent-settings-missing',
  );
  await waitUntil(async () => ({
    aArrow: await popupA.locator('#arrowSeek').isChecked(),
    aVolume: await popupA.locator('#previewVolume').inputValue(),
    bArrow: await popupB.locator('#arrowSeek').isChecked(),
    bVolume: await popupB.locator('#previewVolume').inputValue(),
  }), value => !value.aArrow && !value.bArrow && value.aVolume === '25' && value.bVolume === '25', 'concurrent-popup-sync-missing');

  const beforeFirstReload = await runtimeSnapshot(page);
  const beforeSecondReload = await runtimeSnapshot(secondPage);
  const stylesPage = await context.newPage();
  const stylesURL = new URL(`chrome-extension://${extensionId}/styles.html`);
  stylesURL.searchParams.set('targetTabId', firstTab.tabId);
  stylesURL.searchParams.set('targetWindowId', firstTab.windowId);
  await stylesPage.goto(stylesURL.href, { waitUntil: 'domcontentloaded' });
  await stylesPage.locator('#settings-status[data-phase="ready"]').waitFor({ timeout: 15000 });
  await stylesPage.locator('#hide-ranking').check();
  const reload = stylesPage.locator('#reload');
  await reload.waitFor({ state: 'visible', timeout: 15000 });
  await waitUntil(() => reload.isEnabled(), Boolean, 'style-reload-not-ready');
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await reload.click();
  await navigation;
  await page.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.configReady === true, null, { timeout: 15000 });
  await page.waitForFunction(() => Number.isSafeInteger(window.__knifeFixture?.loads), null, { timeout: 15000 });
  const afterFirstReload = await waitUntil(() => runtimeSnapshot(page), value => value.loads === beforeFirstReload.loads + 1, 'style-target-not-reloaded');
  const afterSecondReload = await runtimeSnapshot(secondPage);
  assertCondition(afterSecondReload.loads === beforeSecondReload.loads, 'style-cross-target-reload');
  assertCondition(await page.evaluate(() => getComputedStyle(document.querySelector('[class^="live_chatting_ranking_container__"]')).display === 'none'), 'style-not-applied');

  const isolationFirst = await runtimeSnapshot(page);
  const isolationSecond = await runtimeSnapshot(secondPage);
  await page.close();
  const reloadReply = await sendSettingsMessage(stylesPage, {
    namespace: 'cheese-knife-settings', protocol: 1, action: 'reload-target', requestId: 'e2e-closed-target',
    targetTabId: firstTab.tabId, targetWindowId: firstTab.windowId,
  });
  assertCondition(reloadReply?.ok === false && ['target-missing', 'target-origin-changed', 'target-window-changed'].includes(reloadReply.code), 'closed-style-target-accepted');
  assertCondition((await runtimeSnapshot(secondPage)).loads === isolationSecond.loads, 'closed-target-reloaded-other-tab');

  await popupB.locator('#previewVolume').fill('26');
  await waitUntil(() => storageSnapshot(worker), value => value?.config?.previewVolume === 26, 'isolation-setting-not-stored');
  await secondPage.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.config.previewVolume === 26, null, { timeout: 15000 });
  const finalSecond = await runtimeSnapshot(secondPage);
  assertCondition(finalSecond.generation === isolationSecond.generation, 'second-runtime-generation-changed');
  assertCondition(finalSecond.ownedControls === isolationSecond.ownedControls, 'second-runtime-controls-changed');
  assertCondition(finalSecond.loads === isolationSecond.loads, 'second-runtime-reloaded');
  assertCondition(JSON.stringify(finalSecond.video) === JSON.stringify(isolationSecond.video), 'second-runtime-video-changed');
  assertCondition(routeErrors.length === 0, 'fixture-route-error');
  assertCondition(pageErrors.length === 0, 'installed-page-error');

  return {
    multiWindow: passed({ first: firstTab, second: secondTarget }),
    concurrentSettings: passed({ revision: concurrent.settingsRevision, arrowSeek: false, previewVolume: 25 }),
    styleTargetReload: passed({ firstReloads: afterFirstReload.loads - beforeFirstReload.loads, secondReloads: afterSecondReload.loads - beforeSecondReload.loads, closedTargetCode: reloadReply.code }),
    runtimeIsolation: passed({ firstGeneration: isolationFirst.generation, secondGeneration: finalSecond.generation, secondLoads: finalSecond.loads }),
  };
}

export async function runInstalledScenarioSequence(args, implementations = {}) {
  const state = {};
  const base = implementations.base || runBaseInstalledScenario;
  const multiWindow = implementations.multiWindow || runMultiWindowScenario;
  const baseSections = await base({ ...args, captureState: value => Object.assign(state, value) });
  assertCondition(state.context && state.worker, 'base-handshake-state-missing');
  const multiWindowSections = await multiWindow({ ...args, ...state });
  return { ...baseSections, ...multiWindowSections };
}

const defaultDependencies = {
  openRepository: () => openOwnedRoot(repositoryRoot),
  verifyCandidate,
  removeCandidate,
  checkPackage,
  loadFixtureResponses,
  launchInstalledExtension,
  chromiumApi: chromium,
  scenario: runInstalledScenarioSequence,
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
