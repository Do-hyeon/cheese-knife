import {audioInputs, assertLiveAudioSource} from './audio-verification-contract.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import {createHostResponseStorage} from './extension-e2e/host-response-storage.mjs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { checkPackage } from './check-package.mjs';
import { AUDIO_WORKLET_ENTRY } from './main-runtime.mjs';
import { FIXTURE_LIVE_URL, FIXTURE_VOD_URL, fixtureDecision, loadFixtureResponses, loadAudioFixtureResponses } from './extension-e2e/fixture-router.mjs';
import { launchInstalledExtension, parseInstalledE2EArgs, reacquireExtensionWorker, openInstalledMediaSettings,
  openMediaBrowserSession, closeInstalledMediaBrowser } from './extension-e2e/harness.mjs';
import { refreshTransitionWorker } from './extension-e2e/transition-preparation.mjs';
import { openOwnedRoot } from './owned-files.mjs';
import { nativeFailureDetails, audioOperation } from './audio-native-browser.mjs';
import { removeCandidate, verifyCandidate } from './verify-candidate.mjs';
import { observeInstalledProtocol, sendInstalledEnvelopeControl } from './extension-e2e/installed-protocol.mjs';
import {isRunJobShutdown} from './extension-e2e/run-job.mjs';
import {isGain4JobCase} from './extension-e2e/visibility-browser.mjs';

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

export async function runBaseInstalledScenario({ context, worker, extensionId, responses, restartSession, captureState, expectedProtocol = 3 }) {
  assertCondition([1,2,3].includes(expectedProtocol),'installed-protocol-invalid');
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
  try {
    await page.waitForFunction(() => {
      const runtime = window[Symbol.for('cheese-knife.runtime.v1')];
      return !!runtime?.configReady;
    }, null, { timeout: 15000 });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw runnerError('main-runtime-missing', error);
    throw error;
  }

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
    () => page.evaluate(observeInstalledProtocol,expectedProtocol),
    value => value?.config.arrowSeek === false,
    'main-setting-missing',
  );
  const envelope = main.metadata;
  assertCondition(envelope && typeof envelope.requestId === 'string' && Number.isSafeInteger(expectedProtocol === 1 ? envelope.revision : envelope.deliverySequence), 'isolated-bridge-metadata-missing');

  const beforeInvalid = await storageSnapshot(worker);
  const invalidReply = await popup.evaluate(() => new Promise(resolve => chrome.runtime.sendMessage({
    namespace: 'cheese-knife-settings', protocol: 1, action: 'patch', requestId: 'e2e-invalid', unexpected: true,
  }, resolve)));
  const afterInvalid = await storageSnapshot(worker);
  assertCondition(invalidReply?.ok === false && invalidReply.code === 'invalid-request', 'invalid-message-accepted');
  assertCondition(JSON.stringify(beforeInvalid) === JSON.stringify(afterInvalid), 'invalid-message-mutated-storage');

  for (const mode of expectedProtocol===1?['accepted','stale']:['accepted','stale','context']) {
    const control=await context.newPage();
    try {
      await control.goto(FIXTURE_LIVE_URL,{waitUntil:'domcontentloaded'});
      const canonical=await waitUntil(()=>control.evaluate(observeInstalledProtocol,expectedProtocol),value=>value?.config.arrowSeek===false,'control-handshake-missing');
      await control.evaluate(sendInstalledEnvelopeControl,{metadata:canonical.metadata,protocol:expectedProtocol,mode});
      await control.waitForTimeout(100);
      assertCondition(await control.evaluate(()=>window[Symbol.for('cheese-knife.runtime.v1')].config.arrowSeek) === (mode==='accepted'),mode==='accepted'?'positive-envelope-not-applied':mode==='stale'?'stale-revision-accepted':'retired-channel-envelope-accepted');
      assertCondition(isDeepStrictEqual(await storageSnapshot(worker),afterInvalid),'envelope-control-mutated-storage');
    } finally { await control.close(); }
  }
  // Start ordinary route checks with a fresh handshake, never the injected fixture slot.
  await page.reload({waitUntil:'domcontentloaded'});
  await waitUntil(()=>page.evaluate(observeInstalledProtocol,expectedProtocol),Boolean,'fresh-handshake-missing');
  if(expectedProtocol!==1){
    await page.evaluate(()=>{history.pushState(null,'','/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');window.dispatchEvent(new PopStateEvent('popstate'));});
    await waitUntil(()=>page.evaluate(observeInstalledProtocol,expectedProtocol),value=>value?.metadata.context.channelId==='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','route-handshake-missing');
    await page.evaluate(()=>{history.pushState(null,'','/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');window.dispatchEvent(new PopStateEvent('popstate'));});
    await waitUntil(()=>page.evaluate(observeInstalledProtocol,expectedProtocol),value=>value?.metadata.context.channelId==='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','return-handshake-missing');
  }

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
    mainRuntime: passed({ arrowSeek: main.config.arrowSeek }),
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

export async function runMultiWindowScenario({ context, worker, extensionId, page, popup, pageErrors = [], routeErrors = [], captureState }) {
  assertCondition(context && worker && page && popup, 'base-handshake-state-missing');
  await popup.close();
  const firstPages = context.pages();
  assertCondition(firstPages.length === 1 && firstPages[0] === page && !page.isClosed() && page.url() === FIXTURE_LIVE_URL, 'first-page-missing');
  const firstTab = await worker.evaluate(async url => {
    const tabs = await chrome.tabs.query({});
    return tabs.length === 1 && tabs[0].url === url ? { tabId: tabs[0].id, windowId: tabs[0].windowId } : null;
  }, FIXTURE_LIVE_URL);
  const validTarget = target => target && [target.tabId, target.windowId].every(id => Number.isSafeInteger(id) && id >= 0);
  assertCondition(validTarget(firstTab), 'first-target-missing');

  const secondTarget = await worker.evaluate(async () => {
    const created = await chrome.windows.create({ url: 'about:blank', focused: false });
    if (!Number.isSafeInteger(created?.id) || created.id < 0) return null;
    const tabs = created.tabs?.length ? created.tabs : await chrome.tabs.query({ windowId: created.id });
    return tabs.length === 1 && tabs[0].windowId === created.id ? { tabId: tabs[0].id, windowId: created.id } : null;
  });
  assertCondition(validTarget(secondTarget), 'second-target-missing');
  assertCondition(firstTab.tabId !== secondTarget.tabId && firstTab.windowId !== secondTarget.windowId, 'multi-window-not-distinct');

  const assertOwnedTabs = async navigated => {
    const owned = await worker.evaluate(async ({ first, second, url, navigated }) => {
      const matches = (tab, target, expectedUrl) => tab?.id === target.tabId && tab.windowId === target.windowId &&
        (expectedUrl === undefined || tab.url === expectedUrl);
      const tabs = await chrome.tabs.query({});
      if (tabs.length !== 2 || !tabs.some(tab => matches(tab, first, url)) ||
          !tabs.some(tab => matches(tab, second, navigated ? url : undefined))) return false;
      if (!navigated) return true;
      const [firstTab, secondTab] = await Promise.all([chrome.tabs.get(first.tabId), chrome.tabs.get(second.tabId)]);
      return matches(firstTab, first, url) && matches(secondTab, second, url);
    }, { first: firstTab, second: secondTarget, url: FIXTURE_LIVE_URL, navigated });
    assertCondition(owned, 'multi-window-tab-ownership');
  };

  await assertOwnedTabs(false);
  const secondPage = await waitUntil(() => {
    const pages = context.pages();
    assertCondition(pages.length <= 2 && pages.includes(page) && !page.isClosed() && page.url() === FIXTURE_LIVE_URL, 'multi-window-page-ownership');
    const candidate = pages.find(candidate => candidate !== page);
    assertCondition(!candidate || !candidate.isClosed() && candidate.url() === 'about:blank', 'multi-window-page-ownership');
    return candidate;
  }, Boolean, 'second-page-missing');

  const assertOwnedPages = secondUrl => {
    const pages = context.pages();
    assertCondition(pages.length === 2 && pages.includes(page) && pages.includes(secondPage) &&
      !page.isClosed() && !secondPage.isClosed() && page.url() === FIXTURE_LIVE_URL && secondPage.url() === secondUrl, 'multi-window-page-ownership');
  };
  await assertOwnedTabs(false);
  assertOwnedPages('about:blank');
  await secondPage.goto(FIXTURE_LIVE_URL, { waitUntil: 'domcontentloaded' });
  await secondPage.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.configReady === true, null, { timeout: 15000 });
  await page.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.configReady === true, null, { timeout: 15000 });
  await Promise.all([
    page.waitForFunction(() => Number.isSafeInteger(window.__knifeFixture?.loads), null, { timeout: 15000 }),
    secondPage.waitForFunction(() => Number.isSafeInteger(window.__knifeFixture?.loads), null, { timeout: 15000 }),
  ]);
  await assertOwnedTabs(true);
  assertOwnedPages(FIXTURE_LIVE_URL);

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
  await popupB.locator('#previewVolume').fill('25');
  await waitUntil(() => storageSnapshot(worker), value => value?.config?.previewVolume === 25, 'isolation-setting-restore-failed');
  await secondPage.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.config.previewVolume === 25, null, { timeout: 15000 });
  assertCondition(routeErrors.length === 0, 'fixture-route-error');
  assertCondition(pageErrors.length === 0, 'installed-page-error');
  if (typeof captureState === 'function') captureState({
    context, worker, extensionId, page: secondPage, popupA, popupB, stylesPage, pageErrors, routeErrors,
  });

  return {
    multiWindow: passed({ first: firstTab, second: secondTarget }),
    concurrentSettings: passed({ revision: concurrent.settingsRevision, arrowSeek: false, previewVolume: 25 }),
    styleTargetReload: passed({ firstReloads: afterFirstReload.loads - beforeFirstReload.loads, secondReloads: afterSecondReload.loads - beforeSecondReload.loads, closedTargetCode: reloadReply.code }),
    runtimeIsolation: passed({ firstGeneration: isolationFirst.generation, secondGeneration: finalSecond.generation, secondLoads: finalSecond.loads }),
  };
}

export async function runLifecycleScenario({ context, worker, extensionId, page, popupA, popupB, stylesPage,
  pageErrors = [], routeErrors = [], responses, restartSession }) {
  assertCondition(context && worker && page, 'multi-window-state-missing');
  const sentinel = randomBytes(16).toString('hex');
  await worker.evaluate(value => { globalThis.__knifeE2ESentinel = value; }, sentinel);
  await Promise.all([popupA, popupB, stylesPage].filter(Boolean).map(extensionPage => extensionPage.close().catch(() => {})));
  const workerBeforeIdle = worker;
  await new Promise(resolve => setTimeout(resolve, 35000));
  let wakePopup = await context.newPage();
  await wakePopup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await wakePopup.locator('#settings-status[data-phase="ready"]').waitFor({ timeout: 15000 });
  ({ worker, extensionId } = await reacquireExtensionWorker(context, worker, 15000));
  const idleWorkerReused = worker === workerBeforeIdle;
  const sentinelAfterWake = await worker.evaluate(() => globalThis.__knifeE2ESentinel ?? null);
  const wakeStorage = await storageSnapshot(worker);
  const idleSuspensionObserved = sentinelAfterWake === null;
  if (!idleSuspensionObserved) await worker.evaluate(() => { delete globalThis.__knifeE2ESentinel; });
  assertCondition(wakeStorage?.config?.arrowSeek === false && wakeStorage?.config?.previewVolume === 25, 'worker-wake-settings-changed');
  assertCondition(!Object.hasOwn(wakeStorage, '__knifeE2ESentinel'), 'worker-sentinel-persisted');
  await wakePopup.close();

  const beforeLifecycle = await runtimeSnapshot(page);
  const beforeLifecycleConfig = await page.evaluate(() => ({ ...window[Symbol.for('cheese-knife.runtime.v1')].config }));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.configReady === true, null, { timeout: 15000 });
  const generationBeforePulse = await page.evaluate(() => window[Symbol.for('cheese-knife.runtime.v1')].generation);
  const originalPath = await page.evaluate(() => location.pathname);
  await page.evaluate(() => history.pushState({}, '', '/live/cccccccccccccccccccccccccccccccc'));
  await page.waitForFunction(previous => window[Symbol.for('cheese-knife.runtime.v1')].generation > previous, generationBeforePulse, { timeout: 5000 });
  const generationAfterPulse = await page.evaluate(() => window[Symbol.for('cheese-knife.runtime.v1')].generation);
  await page.evaluate(pathname => history.replaceState({}, '', pathname), originalPath);
  await page.waitForFunction(previous => window[Symbol.for('cheese-knife.runtime.v1')].generation > previous, generationAfterPulse, { timeout: 5000 });
  const afterLifecycle = await runtimeSnapshot(page);
  const afterLifecycleState = await page.evaluate(() => ({
    config: { ...window[Symbol.for('cheese-knife.runtime.v1')].config },
    pageshowPersisted: window.__knifeFixture.pageshowPersisted,
    pagehidePersisted: window.__knifeFixture.pagehidePersisted,
  }));
  assertCondition(afterLifecycleState.config.arrowSeek === false && afterLifecycleState.config.previewVolume === 25, 'bfcache-settings-changed');
  assertCondition(beforeLifecycleConfig.arrowSeek === false && beforeLifecycleConfig.previewVolume === 25, 'bfcache-baseline-invalid');
  assertCondition(afterLifecycleState.pageshowPersisted >= 1 && afterLifecycleState.pagehidePersisted >= 1, 'bfcache-events-missing');
  assertCondition(afterLifecycle.ownedControls === beforeLifecycle.ownedControls, 'bfcache-duplicate-controls');
  assertCondition(afterLifecycle.loads === beforeLifecycle.loads, 'bfcache-unexpected-reload');

  const disposable = await context.newPage();
  await disposable.goto(FIXTURE_LIVE_URL, { waitUntil: 'domcontentloaded' });
  await disposable.waitForFunction(() => window[Symbol.for('cheese-knife.runtime.v1')]?.configReady === true, null, { timeout: 15000 });
  await disposable.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  await disposable.waitForFunction(() => document.querySelectorAll('.knife-owned').length === 0, null, { timeout: 5000 });
  await disposable.close();

  const trigger = await context.newPage();
  await trigger.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await trigger.locator('#settings-status[data-phase="ready"]').waitFor({ timeout: 15000 });
  try { await trigger.evaluate(() => chrome.runtime.reload()); }
  catch (error) {
    if (!/closed|destroyed|Target page/i.test(String(error?.message || error))) throw error;
  }
  await new Promise(resolve => setTimeout(resolve, 250));
  let inPlaceReloadObserved = true;
  try {
    ({ worker, extensionId } = await reacquireExtensionWorker(context, worker, 15000, { reusePrevious: false }));
    await page.close();
  } catch (error) {
    if (error?.code !== 'extension-worker-reacquire-timeout' || typeof restartSession !== 'function') throw error;
    inPlaceReloadObserved = false;
    ({ context, worker, extensionId } = await restartSession());
    const attachPage = candidate => candidate.on('pageerror', pageError => pageErrors.push(String(pageError?.message || pageError).slice(0, 240)));
    for (const existing of context.pages()) attachPage(existing);
    context.on('page', attachPage);
    await context.route(/^https?:\/\//, async route => {
      try {
        const decision = fixtureDecision(route.request().url(), responses);
        if (decision.action === 'fulfill') await route.fulfill({ status: decision.status, contentType: decision.contentType, body: decision.body });
        else await route.abort('blockedbyclient');
      } catch (routeError) {
        routeErrors.push(String(routeError?.code || routeError?.message || routeError).slice(0, 120));
        await route.abort('blockedbyclient').catch(() => {});
      }
    });
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  assertCondition(!pageErrors.some(message => message.includes('Extension context invalidated')), 'extension-context-invalidated-error');
  const freshPage = await context.newPage();
  await freshPage.goto(FIXTURE_LIVE_URL, { waitUntil: 'domcontentloaded' });
  await freshPage.waitForFunction(() => {
    const runtime = window[Symbol.for('cheese-knife.runtime.v1')];
    return runtime?.configReady && runtime.config.arrowSeek === false && runtime.config.previewVolume === 25;
  }, null, { timeout: 15000 });
  assertCondition(routeErrors.length === 0, 'fixture-route-error');
  assertCondition(pageErrors.length === 0, 'installed-page-error');

  return {
    workerWake: passed({ playwrightWorkerReused: idleWorkerReused, settingsPreserved: true,
      idleSuspensionObserved, limitation: idleSuspensionObserved ? null : 'playwright-debug-session-kept-worker-alive' }),
    bfcacheLifecycle: passed({ syntheticPersisted: true, generationBefore: beforeLifecycle.generation, generationAfter: afterLifecycle.generation, timersResumed: true, controls: afterLifecycle.ownedControls }),
    contextReload: passed({ extensionIdRecalculated: true, freshHandshake: true, inPlaceReloadObserved,
      limitation: inPlaceReloadObserved ? null : 'headless-unpacked-runtime-reload-did-not-restart-worker' }),
  };
}

export async function runInstalledScenarioSequence(args, implementations = {}) {
  const state = {};
  const base = implementations.base || runBaseInstalledScenario;
  const multiWindow = implementations.multiWindow || runMultiWindowScenario;
  const lifecycle = implementations.lifecycle || runLifecycleScenario;
  const baseSections = await base({ ...args, captureState: value => Object.assign(state, value) });
  assertCondition(state.context && state.worker, 'base-handshake-state-missing');
  const multiWindowSections = await multiWindow({ ...args, ...state, captureState: value => Object.assign(state, value) });
  const lifecycleSections = await lifecycle({ ...args, ...state });
  return { ...baseSections, ...multiWindowSections, ...lifecycleSections };
}

/** Actual toolbar-to-TAB UI in the caller's new disposable profile; no positive storage writes. */
export async function runInstalledMediaTabScenario({ context, worker, extensionId, responses, browserSession }) {
  const pageErrors=[],routeErrors=[];
  const observe=page=>page.on('pageerror',()=>{if(pageErrors.length<32)pageErrors.push(true);});
  for(const page of context.pages())observe(page);context.on('page',observe);
  await context.route(/^https?:\/\//,async route=>{
    try{const decision=fixtureDecision(route.request().url(),responses);
      if(decision.action==='fulfill')await route.fulfill({status:decision.status,contentType:decision.contentType,body:decision.body});
      else await route.abort('blockedbyclient');
    }catch{routeErrors.push(true);await route.abort('blockedbyclient').catch(()=>{});}
  });
  await context.routeWebSocket(/.*/,socket=>socket.close());
  const page=await context.newPage();await page.setViewportSize({width:1280,height:720});
  await page.goto(FIXTURE_LIVE_URL,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>window[Symbol.for('cheese-knife.runtime.v1')]?.media.phase==='ready',null,{timeout:15000});
  try{
    const {settingsPage}=await openInstalledMediaSettings({context,worker,fixturePage:page,extensionId,browserSession});
    assertCondition(await settingsPage.locator('#media-scope').inputValue()==='global','media-tab-initial-scope');
    assertCondition(!Object.hasOwn(await storageSnapshot(worker),'mediaProfiles'),'media-tab-read-created-store');
    await settingsPage.locator('#media-scope').selectOption('current');
    await settingsPage.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    await settingsPage.locator('#media-audio-enable').click();
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.channels[0]?.audio,'media-tab-enable-failed');
    await settingsPage.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    const original=await settingsPage.locator('#compressorThreshold').inputValue();
    await settingsPage.locator('#compressorThreshold').fill('-35');
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.channels[0]?.audio?.values.compressorThreshold===-35,'media-tab-save-failed');
    await page.waitForFunction(()=>window[Symbol.for('cheese-knife.runtime.v1')]?.config.compressorThreshold===-35,null,{timeout:15000});
    await settingsPage.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    let {settingsPage:second}=await openInstalledMediaSettings({context,worker,fixturePage:page,extensionId,browserSession});
    await second.locator('#media-scope').selectOption('current');await second.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    const firstWindow=await settingsPage.evaluate(async()=>{const tab=await chrome.tabs.getCurrent();return tab?.windowId;});
    const secondTab=await second.evaluate(async()=>{const tab=await chrome.tabs.getCurrent();return {id:tab?.id,windowId:tab?.windowId};});
    assertCondition(Number.isSafeInteger(firstWindow)&&Number.isSafeInteger(secondTab.id)&&secondTab.windowId===firstWindow,'media-tab-window-facts');
    const moved=await worker.evaluate(async tabId=>{const window=await chrome.windows.create({tabId});return {id:window.id,incognito:window.incognito};},secondTab.id);
    assertCondition(Number.isSafeInteger(moved.id)&&moved.id!==firstWindow&&moved.incognito===false&&
      await second.evaluate(async()=>{const tab=await chrome.tabs.getCurrent();return tab?.windowId;})===moved.id,'media-tab-window-separation');
    await Promise.all([settingsPage.locator('#compressorThreshold').fill('-30'),second.locator('#compressorRatio').fill('8')]);
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.channels[0]?.audio?.values.compressorThreshold===-30&&
      value?.mediaProfiles?.channels[0]?.audio?.values.compressorRatio===8,'media-tab-merge-failed');
    await waitUntil(()=>Promise.all([settingsPage,second].map(tab=>tab.locator('#compressorThreshold').inputValue())),values=>values.every(value=>value==='-30'),'media-tab-sync-failed');
    await second.close();await worker.evaluate(windowId=>chrome.windows.update(windowId,{focused:true}),firstWindow);
    ({settingsPage:second}=await openInstalledMediaSettings({context,worker,fixturePage:page,extensionId,browserSession}));
    assertCondition(await second.evaluate(async()=>{const tab=await chrome.tabs.getCurrent();return tab?.windowId;})===firstWindow,'media-tab-window-restore');
    await second.locator('#media-scope').selectOption('current');
    await second.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    await second.locator('#media-video-enable').click();
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.channels[0]?.video,'media-tab-video-enable');
    await second.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    await second.locator('#brightness').fill('1.5');
    await page.waitForFunction(()=>{const runtime=window[Symbol.for('cheese-knife.runtime.v1')];return runtime?.config.brightness===1.5&&
      document.querySelector('video')?.hasAttribute('data-knife-channel-filter');},null,{timeout:15000});
    await page.evaluate(url=>{const frame=document.createElement('iframe');frame.id='native-global-frame';frame.src=url;document.body.append(frame);},FIXTURE_LIVE_URL);
    const frame=await waitUntil(()=>Promise.resolve(page.frames().find(value=>value.parentFrame()&&value.url()===FIXTURE_LIVE_URL)),Boolean,'media-tab-frame-missing');
    await frame.waitForFunction(()=>window[Symbol.for('cheese-knife.runtime.v1')]?.configReady,null,{timeout:15000});
    assertCondition(await frame.evaluate(()=>{const runtime=window[Symbol.for('cheese-knife.runtime.v1')];return runtime.config.brightness===1&&
      !document.querySelector('video')?.hasAttribute('data-knife-channel-filter');}),'media-tab-frame-overlay');
    await page.locator('#native-global-frame').evaluate(element=>element.remove());
    await settingsPage.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    await second.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    await second.setViewportSize({width:480,height:900});
    const narrow=await second.evaluate(()=>{
      const video=document.getElementById('brightness').closest('details').getBoundingClientRect();
      const audio=document.getElementById('compressorThreshold').closest('details').getBoundingClientRect();
      return document.documentElement.scrollWidth<=document.documentElement.clientWidth&&video.left===audio.left&&video.top!==audio.top;
    });assertCondition(narrow,'media-tab-narrow-layout');
    const arrow=second.locator('#arrowSeek'),originalArrow=await arrow.isChecked();
    await arrow.focus();await arrow.press('Space');
    await waitUntil(()=>storageSnapshot(worker),value=>value?.config?.arrowSeek===!originalArrow,'media-tab-keyboard-save');
    await arrow.focus();await arrow.press('Space');
    await waitUntil(()=>storageSnapshot(worker),value=>value?.config?.arrowSeek===originalArrow,'media-tab-keyboard-restore');
    await second.locator('#settings-status[data-phase="ready"]').waitFor({timeout:15000});
    await second.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    await second.locator('#media-preset-name').fill('F00 native audio');await second.locator('#media-preset-create').click();
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.presets.length===1,'media-tab-preset-save');
    const management=await context.newPage();await management.goto(`chrome-extension://${extensionId}/popup.html?mediaSettings=1`,{waitUntil:'domcontentloaded'});
    await management.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    assertCondition(await management.locator('#media-scope').inputValue()==='global'&&
      await management.locator('#media-scope option[value="current"]').evaluate(option=>option.disabled),'media-tab-targetless-retarget');
    await management.locator('#media-scope').selectOption('saved:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await management.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    await management.locator('#compressorRatio').fill('9');
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.channels[0]?.audio?.values.compressorRatio===9,'media-tab-saved-scope');
    await second.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    await second.locator('#compressorThreshold').fill(original);
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.channels[0]?.audio?.values.compressorThreshold===Number(original),'media-tab-restore-failed');
    await second.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    const {settingsPage:closing}=await openInstalledMediaSettings({context,worker,fixturePage:page,extensionId,browserSession});
    await closing.locator('#media-scope').selectOption('current');await closing.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    await closing.locator('#compressorThreshold').fill('-32');await closing.close();
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.channels[0]?.audio?.values.compressorThreshold===-32,'media-tab-closed-save');
    let reopened;
    try{({settingsPage:reopened}=await openInstalledMediaSettings({context,worker,fixturePage:page,extensionId,browserSession}));}
    catch(error){
      try{
        const targets=await browserSession.send('Target.getTargets');
        error.nativePopupDiagnostics={ownPopupTargets:targets.targetInfos.filter(target=>target.url===`chrome-extension://${extensionId}/popup.html`).length,
          windows:await worker.evaluate(async url=>(await chrome.windows.getAll({populate:true})).map(window=>({normal:window.type==='normal',focused:window.focused,
            liveTabs:window.tabs?.filter(tab=>tab.url===url).length??0,activeLive:window.tabs?.some(tab=>tab.active&&tab.url===url)===true})),FIXTURE_LIVE_URL)};
      }catch{error.nativePopupDiagnostics={unavailable:true};}
      throw error;
    }
    await reopened.locator('#media-scope').selectOption('current');await reopened.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    assertCondition(await reopened.locator('#compressorThreshold').inputValue()==='-32','media-tab-reopened-save');
    await reopened.locator('#compressorThreshold').fill(original);
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.channels[0]?.audio?.values.compressorThreshold===Number(original),'media-tab-closed-restore');
    await reopened.close();await second.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    const beforeCancel=await storageSnapshot(worker);second.once('dialog',dialog=>{void dialog.dismiss();});
    await second.locator('#media-channel-delete').click();assertCondition(isDeepStrictEqual(await storageSnapshot(worker),beforeCancel),'media-tab-confirm-cancel-write');
    second.once('dialog',dialog=>{void dialog.accept();});await second.locator('#media-channel-delete').click();
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.channels.length===0,'media-tab-delete-restore-failed');
    await management.locator('#media-scope').selectOption('global');await management.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
    management.once('dialog',dialog=>{void dialog.accept();});await management.locator('#media-preset-delete').click();
    await waitUntil(()=>storageSnapshot(worker),value=>value?.mediaProfiles?.presets.length===0,'media-tab-preset-restore');
    const vod=await context.newPage();await vod.goto(FIXTURE_VOD_URL,{waitUntil:'domcontentloaded'});
    await vod.waitForFunction(()=>window[Symbol.for('cheese-knife.runtime.v1')]?.configReady,null,{timeout:15000});
    const {settingsPage:vodSettings}=await openInstalledMediaSettings({context,worker,fixturePage:vod,extensionId,browserSession});
    assertCondition(await vodSettings.locator('#media-scope option[value="current"]').evaluate(option=>option.disabled),'media-tab-vod-channel-invented');
    const stylesLink=await vodSettings.locator('#stylesConfig').evaluate(element=>element.closest('a').href);
    const styles=await context.newPage();await styles.goto(stylesLink,{waitUntil:'domcontentloaded'});
    await styles.locator('#settings-status[data-phase="ready"]').waitFor({timeout:15000});
    const loads=await Promise.all([page,vod].map(tab=>tab.evaluate(()=>window.__knifeFixture.loads)));
    await styles.locator('#left-chat').check();await styles.locator('#settings-status[data-phase="ready"]').waitFor({timeout:15000});
    await styles.locator('#reload').click();await vod.waitForFunction(before=>window.__knifeFixture?.loads===before+1,loads[1],{timeout:15000});
    assertCondition(await page.evaluate(()=>window.__knifeFixture.loads)===loads[0],'media-tab-vod-reloaded-other');
    await styles.locator('#left-chat').uncheck();await styles.locator('#settings-status[data-phase="ready"]').waitFor({timeout:15000});
    await styles.locator('#reload').click();await vod.waitForFunction(before=>window.__knifeFixture?.loads===before+2,loads[1],{timeout:15000});
    const beforeRetire=await storageSnapshot(worker);
    await management.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    assertCondition(!(await management.locator('#brightness').isEnabled())&&await management.locator('#settings-status').getAttribute('data-phase')==='reconnect-required','media-tab-restored-ready');
    management.once('dialog',dialog=>{void dialog.accept();});await management.locator('#settings-reconnect').click();
    await management.locator('#settings-status[data-phase="ready"]').waitFor({timeout:15000});
    assertCondition(isDeepStrictEqual(await storageSnapshot(worker),beforeRetire),'media-tab-reconnect-wrote');
    await management.evaluate(()=>{window.__knifeNativePersisted=false;window.addEventListener('pageshow',event=>{window.__knifeNativePersisted=event.persisted;});});
    await management.goto('about:blank');await management.goBack({waitUntil:'domcontentloaded'});
    const actualRestore=await management.evaluate(()=>({persisted:window.__knifeNativePersisted===true,
      phase:document.getElementById('settings-status').dataset.phase,disabled:document.getElementById('brightness').disabled}));
    if(actualRestore.persisted)assertCondition(actualRestore.phase==='reconnect-required'&&actualRestore.disabled,'media-tab-native-restore-ready');
    else await management.locator('#settings-status[data-phase="ready"]').waitFor({timeout:15000});
    assertCondition(pageErrors.length===0&&routeErrors.length===0,'media-tab-page-error');
    return {mediaTab:passed({popupAttached:true,tabWriterQualified:true,currentSaved:true,mainApplied:true,twoTabMerge:true,restored:true,
      twoWindowMerge:true,topFrameOnlyOverlay:true,closedUiReopen:true,
      targetless:true,savedScope:true,presetSaved:true,confirmCancelPreserved:true,keyboard:true,narrowLayout:true,vodStylePair:true,
      syntheticPersistedLocked:true,ownReconnect:true,actualBackForwardSmoke:true,bfcacheObserved:actualRestore.persisted}),
      network:passed({fixtureRoutes:true,initialPopupNavigationCovered:false})};
  }finally{context.off('page',observe);}
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
  mediaScenario: runInstalledMediaTabScenario,
  refreshTransitionWorker, openMediaBrowserSession, closeInstalledMediaBrowser,
  platform: process.platform,
  sourceAttestation: async (files, required) => (await import('./check-installed-transition.mjs')).sourceAttestation(files, required),
  expectedMediaFiles: async files => {
    const { validatePayloadMetadata } = await import('./extension-e2e/published-payload.mjs');
    const rows = validatePayloadMetadata(JSON.parse(await files.readFile('tests/fixtures/installed-extension/published-payload.json','utf8')));
    return [...rows.map(row=>`dist/${row.name}`),'dist/media-profiles.js'].sort();
  },
};

export async function expectedF01MediaFiles(files) {
  const { validatePayloadMetadata } = await import('./extension-e2e/published-payload.mjs');
  const rows = validatePayloadMetadata(JSON.parse(await files.readFile('tests/fixtures/installed-extension/published-payload.json','utf8')));
  return [...rows.map(row=>`dist/${row.name}`),'dist/media-profiles.js','dist/gain-authority.js','dist/web/player-gain.js','dist/audio-settings-ui.js'].sort();
}

export async function expectedCurrentAudioFiles(files) {
  return [...await expectedF01MediaFiles(files),'dist/'+AUDIO_WORKLET_ENTRY.output].sort();
}

const relativeOwnedPath = (root, absolute) => {
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw runnerError('owned-cleanup-path-invalid');
  return slash(relative);
};

export async function audioCandidateInventory(files,dist,expected,code='audio-settings-candidate-files'){
  const prefix=relativeOwnedPath(files.root,dist),rows=[];
  const visit=async directory=>{
    const entries=await files.readdir(prefix+(directory?'/'+directory:''),{withFileTypes:true});
    for(const entry of entries){
      if(typeof entry.name!=='string'||!entry.name||['.','..'].includes(entry.name)||entry.name.includes('/')||entry.name.includes('\\')||entry.isSymbolicLink())throw runnerError(code);
      const relative=(directory?directory+'/':'')+entry.name,name='dist/'+relative;
      if(entry.isDirectory()){
        if(!expected.some(file=>file.startsWith(name+'/')))throw runnerError(code);
        await visit(relative);
      }else if(entry.isFile()&&expected.includes(name)){
        const bytes=await files.readFile(prefix+'/'+relative);rows.push({file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
      }else throw runnerError(code);
    }
  };
  await visit('');rows.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
  if(!isDeepStrictEqual(rows.map(row=>row.file),expected))throw runnerError(code);
  return rows;
}


export async function runInstalledExtensionE2E({ headed = false, runId, qualification, retainEvidence = false, shutdownContract, firstHostShutdownCase, dependencies = {} } = {}) {
  const firstHostSelected=firstHostShutdownCase!==undefined;
  if(firstHostSelected&&(firstHostShutdownCase!=='96000/reentry/2/10'||qualification!=='media-tab'||retainEvidence!==true||shutdownContract!==undefined||typeof dependencies.mediaScenario!=='function'))throw runnerError('media-first-host-selection-invalid');
  const jobSelection=shutdownContract===undefined?null:structuredClone(shutdownContract);
  if(shutdownContract!==undefined&&!jobSelection)throw runnerError('media-shutdown-selection-invalid');
  const gainJob=isGain4JobCase(jobSelection?.caseId)&&jobSelection?.componentWitness===true;
  if(jobSelection&&(jobSelection.contract!=='run-job-v1'||qualification!=='media-tab'||!retainEvidence||(!gainJob&&(jobSelection.caseId!=='44100/normalizer-control/tone-silence'||jobSelection.componentWitness!==undefined))||
    typeof jobSelection.helper?.path!=='string'||!path.isAbsolute(jobSelection.helper.path)||!/^[a-f0-9]{64}$/.test(jobSelection.helper.sha256??'')||
    typeof jobSelection.browserCandidate?.root!=='string'||!path.isAbsolute(jobSelection.browserCandidate.root)||!/^[a-f0-9]{64}$/.test(jobSelection.browserCandidate.manifestSha256??'')||
    typeof dependencies.mediaScenario!=='function'))throw runnerError('media-shutdown-selection-invalid');
  if (typeof retainEvidence !== 'boolean') throw runnerError('installed-e2e-retention-invalid');
  if (!/^[A-Za-z0-9]{1,64}$/.test(runId || '')) throw runnerError('installed-e2e-run-id-invalid');
  const joint=qualification==='audio-j1';
  if (/^F01J1Native20261018(?:R48)?$/.test(runId||'')&&(!joint||runId!=='F01J1Native20261018R48'))throw runnerError('audio-j1-reserved-id');
  if (qualification !== undefined && !['media-tab', 'player-gain', 'audio-settings','audio-l1','audio-j1'].includes(qualification)) throw runnerError('installed-e2e-qualification-invalid');
  if(joint&&(runId!=='F01J1Native20261018R48'||!retainEvidence||
    !['mediaScenario','expectedMediaFiles','sourceAttestation','loadFixtureResponses','launchInstalledExtension','verifyCandidate'].every(key=>typeof dependencies[key]==='function')))throw runnerError('audio-j1-scenario-required');
  if (qualification === 'player-gain' && (typeof dependencies.mediaScenario !== 'function' || typeof dependencies.expectedMediaFiles !== 'function')) throw runnerError('player-gain-scenario-required');
  if (qualification === 'audio-settings' && typeof dependencies.mediaScenario !== 'function') throw runnerError('audio-settings-scenario-required');
  if (qualification === 'audio-settings' && typeof dependencies.createAudioSettingsObservation !== 'function') throw runnerError('audio-settings-observation-required');
  if (qualification === 'audio-l1' && (runId!=='F01L1Clock20261018R48'||!retainEvidence||
    !['mediaScenario','expectedMediaFiles','sourceAttestation','loadFixtureResponses','launchInstalledExtension','verifyCandidate'].every(key=>typeof dependencies[key]==='function'))) throw runnerError('audio-l1-scenario-required');
  if(dependencies.readAudioSettingsNormal!==undefined&&(qualification!=='audio-settings'||typeof dependencies.readAudioSettingsNormal!=='function'))throw runnerError('audio-settings-normal-reader-invalid');
  const nativeQualification = qualification !== undefined;
  const browserIO=(name,work)=>qualification==='audio-settings'||qualification==='audio-l1'||joint?audioOperation((joint?'j1':qualification==='audio-settings'?'settings':'l1')+'-installed-'+name,work,30000):work();
  const startedAt = Date.now();
  const deps = { ...defaultDependencies, ...qualification === 'audio-settings' ? {loadFixtureResponses:loadAudioFixtureResponses,expectedMediaFiles:expectedCurrentAudioFiles} : {}, ...dependencies };
  const requiredInputs = qualification === 'audio-settings' ? ['scripts/check-installed-audio-settings.mjs','tests/installed-audio-settings.test.cjs',
    'scripts/extension-e2e/visibility-browser.mjs','tests/visibility-browser.test.cjs',
    'src/settings/audio-settings-ui.ts','extension/audio-settings-ui.js','tests/fixtures/f01-runtime-executable.json','tests/fixtures/f01-runtime-js.json'] : qualification==='audio-l1'||joint ? [
      'src/main/features/audio/transition.ts','src/main/features/audio/transition-worklet.ts','src/main/features/audio/controller.ts',
      'extension/web/audio-transition-worklet.js','scripts/extension-e2e/audio-l1.mjs','scripts/audio-processing-probe.mjs','scripts/audio-processing-metrics.mjs',
      'scripts/extension-e2e/visibility-browser.mjs','tests/f01-l1-native-contract.test.cjs',
      ...audioInputs] : [];
  if(joint)requiredInputs.push('tests/f01-j1-native-contract.test.cjs','tests/f01-j1-transition.test.cjs','tests/f01-j1-observation.test.cjs',
    'tests/fixtures/f01-j1-runtime-js.json','tests/fixtures/f01-j1-runtime-executable.json',
    ...audioInputs);
  const files = await deps.openRepository();
  const artifactRelative = `output/playwright/installed-extension-${runId}`;
  let candidateBuilt = false;
  let artifactCreated = false;
  let profilePath;
  let context;
  let traceStarted = false;
  let traceStopped = false;
  let report;
  let primaryError,primaryFailed=false,audioSettingsObservation=null,audioSettingsSnapshot=null,contextCloseAcknowledged=false;
  let firstHostOwned=null,firstHostFirst=null,firstHostCloseBy=null,firstHostClosePromise=null,firstHostWatchdog=null,firstHostCloseAcceptedAt=null;
  let firstHostTraceTask=null;const firstHostTrace={attempted:false,stopAcknowledged:false,error:null};
  let firstHostFailureState=null,firstHostSecondaryDropped=0;
  let firstHostObservedExit=null,firstHostStorage=null;
  let candidatePath,candidateDist=null,candidateExpected=null,candidateBefore=null,candidateAfter=null;
  let normalBefore=null,normalAfter=null,normalAdmitted=false;
  const normalLink=reference=>reference?{runId:reference.runId,sha256:reference.sha256}:null;
  const secondaryErrors = [];
  let browserSession, shutdownProof, source, after,runJobOwner,expectedJobBinding, toneSilenceCloseFailure;
  const shutdownAccepted=()=>{
    const accepted=jobSelection?isRunJobShutdown(shutdownProof,expectedJobBinding):shutdownProof?.contract===undefined&&['browserCloseAcknowledged','browserDisconnected','ownedRootClosed'].every(key=>shutdownProof?.[key]===true);
    if(!firstHostOwned)return accepted;
    const exit=shutdownProof?.actualChildExit;
    return accepted&&firstHostFirst?.authority!=='catch-only'&&exit?.kind==='exit'&&exit.code===0&&exit.signal===null&&Number.isFinite(exit.at)&&exit.at<firstHostCloseBy&&Number.isFinite(firstHostCloseAcceptedAt)&&exit.at<=firstHostCloseAcceptedAt&&firstHostCloseAcceptedAt<firstHostCloseBy;
  };
  let stage='preparation',traceStopAttempted=false;
  const artifactErrors=new Map();
  const failureDetails=nativeFailureDetails;

  const remember = error => {
    const distinct=firstHostOwned?!Object.is(error,primaryError):error!==primaryError;
    if (!primaryFailed) { primaryError = error; primaryFailed = true; }
    else if (distinct && secondaryErrors.length < 32) secondaryErrors.push({code:String(error?.code || 'installed-e2e-secondary').slice(0,80),message:String(error?.message || error).slice(0,240),...(joint||qualification==='media-tab'?{native:failureDetails(error)}:{})});
    else if(distinct&&firstHostOwned)firstHostSecondaryDropped++;
  };
  const recordFirstHost=(error,authority='source')=>{
    if(firstHostFirst!==null)return firstHostFirst;
    const firstAt=performance.now();
    firstHostCloseBy=Math.min(firstHostCloseBy??Infinity,firstAt+15000);
    firstHostFirst=Object.freeze({error,firstAt,shutdownBy:firstHostCloseBy,authority});
    remember(error);
    if(firstHostClosePromise===null){
      // Reuse the existing failed-rings copy bound; it consumes the same shutdown budget.
      firstHostWatchdog=setTimeout(()=>{void startFirstHostClose().catch(()=>{});},Math.max(0,Math.min(2000,firstHostCloseBy-performance.now())));
    }
    return firstHostFirst;
  };
  const startFirstHostClose=()=>{
    if(firstHostClosePromise!==null)return firstHostClosePromise;
    firstHostCloseBy??=performance.now()+15000;
    clearTimeout(firstHostWatchdog);
    // Publish the promise before calling a dependency which may reenter this owner.
    firstHostClosePromise=Promise.resolve().then(async()=>{
      const owned=firstHostOwned;
      const timeoutMs=Math.max(1,Math.min(15000,Math.floor(firstHostCloseBy-performance.now())));
      const proof=await deps.closeInstalledMediaBrowser({...owned,shutdownBy:firstHostCloseBy,timeoutMs});
      if(performance.now()>=firstHostCloseBy)throw runnerError('media-first-host-close-late');
      shutdownProof=proof;
      firstHostCloseAcceptedAt=performance.now();
      if(!shutdownAccepted())throw runnerError('media-first-host-close-unconfirmed');
      return proof;
    });
    void firstHostStorage?.start();
    void firstHostClosePromise.catch(error=>{recordFirstHost(error,'catch-only');remember(error);});
    return firstHostClosePromise;
  };
  const claimArtifact = async () => {
    await files.ensureDirectory('output/playwright');
    if (await files.lstat(artifactRelative, {optional:true})) throw runnerError('installed-artifact-exists');
    await files.ensureDirectory(artifactRelative); artifactCreated = true;
  };
  try {
    if (nativeQualification) {
      if (deps.platform !== 'win32') throw runnerError('media-qualification-platform-unsupported');
      source = await deps.sourceAttestation(files, requiredInputs);
      if (qualification === 'audio-l1' || joint) assertLiveAudioSource(source, files);
    }
    if (retainEvidence||qualification==='audio-settings'&&deps.readAudioSettingsNormal) await claimArtifact();
    if(qualification==='audio-settings'&&deps.readAudioSettingsNormal){
      normalBefore=structuredClone(await browserIO('normal-before',()=>deps.readAudioSettingsNormal(files)));
      if(!isDeepStrictEqual(normalBefore.source,source))throw runnerError('audio-settings-normal-source');
    }
    const candidate = await deps.verifyCandidate(runId,files.root,{retainEvidence});
    candidateBuilt = true;
    candidatePath = candidate.root || path.dirname(candidate.dist);
    if (nativeQualification) {
      const expected=await deps.expectedMediaFiles(files);
      if (!isDeepStrictEqual(candidate.files,expected)) throw runnerError('media-candidate-assets-invalid');
      if(qualification==='audio-settings'){candidateExpected=[...expected];candidateDist=candidate.dist;}
    }
    await deps.checkPackage(candidate.dist);
    if (!artifactCreated) await claimArtifact();
    if(qualification==='audio-settings')candidateBefore=await browserIO('candidate-before',()=>audioCandidateInventory(files,candidateDist,candidateExpected));
    if(normalBefore!==null){if(!isDeepStrictEqual(normalBefore.candidate,candidateBefore))throw runnerError('audio-settings-normal-candidate');normalAdmitted=true;}
    const artifactPath = await files.resolve(artifactRelative, { type: 'directory' });
    profilePath = await files.makeTempDirectory('output/playwright/installed-profile-');
    if(joint){stage='prelaunch-record';await files.writeFile(`${artifactRelative}/before.json`,JSON.stringify({stage,profilePath,candidatePath,source},null,2)+'\n',{flag:'wx'});}
    const responses = await deps.loadFixtureResponses(files);
    const launchOptions = {
      chromiumApi: deps.chromiumApi,
      extensionPath: candidate.dist,
      profilePath,
      artifactPath,
      headed,
    };
    stage='launch';let launched = await deps.launchInstalledExtension(launchOptions);
    context = launched.context;
    runJobOwner=launched.runJobOwner;
    if(jobSelection){
      expectedJobBinding=structuredClone(runJobOwner?.binding);
      if(!expectedJobBinding||expectedJobBinding.helperSha256!==jobSelection.helper.sha256||expectedJobBinding.executable!==path.join(jobSelection.browserCandidate.root,'chrome.exe')||launched.browserCandidateVersion!=='159.0.8132.0')throw runnerError('media-job-launch-unconfirmed');
    }else if(runJobOwner!==undefined)throw runnerError('media-job-unselected');
    if (nativeQualification) {
      launched = await browserIO('worker-refresh',()=>deps.refreshTransitionWorker(launched));context = launched.context;
      browserSession = await browserIO('browser-session',()=>deps.openMediaBrowserSession(context));
      if (!browserSession || typeof browserSession.send !== 'function' || typeof browserSession.on !== 'function' || typeof browserSession.off !== 'function') throw runnerError('media-browser-session-unavailable');
    }
    stage='trace-start';await browserIO('trace-start',()=>context.tracing.start({ screenshots: true, snapshots: true, sources: false }));
    traceStarted = true;
    const restartSession = async () => {
      if (traceStarted && !traceStopped) {
        await browserIO('trace-stop-restart',()=>context.tracing.stop());
        traceStopped = true;
      }
      await context.close();
      launched = await deps.launchInstalledExtension(launchOptions);
      context = launched.context;
      await browserIO('trace-start-restart',()=>context.tracing.start({ screenshots: true, snapshots: true, sources: false }));
      traceStarted = true;
      traceStopped = false;
      return launched;
    };
    const writeZoomCapture = async (name, bytes) => {
      if (qualification !== 'audio-settings' || !['audio-zoom200.png','audio-zoom200-controls.png','audio-zoom200-eq.png'].includes(name) ||
        !(bytes instanceof Uint8Array) || bytes.length < 24 || bytes.length > 8388608 ||
        !Buffer.from(bytes.subarray(0,8)).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw runnerError('media-zoom-capture-invalid');
      await files.writeFile(`${artifactRelative}/${name}`,bytes,{flag:'wx'});
    };
    if(qualification==='audio-settings')audioSettingsObservation=deps.createAudioSettingsObservation(context);
    let firstHostShutdown;
    if(firstHostSelected){
      firstHostStorage=createHostResponseStorage({files,directory:artifactRelative,runId,caseId:firstHostShutdownCase,first:()=>firstHostFirst,onSecondary:remember,
        onReceipt:receipt=>deps.recordHostResponseStorage?.(receipt)});
      firstHostOwned=Object.freeze({context,browserSession,profilePath,sameChildExit:launched.sameChildExit});
      if(firstHostOwned.sameChildExit instanceof Promise)void firstHostOwned.sameChildExit.then(exit=>{
        if(exit?.kind==='exit'&&Number.isFinite(exit.at)&&exit.at>=0&&(exit.code===null||Number.isSafeInteger(exit.code))&&(exit.signal===null||typeof exit.signal==='string'))firstHostObservedExit=Object.freeze({kind:'exit',code:exit.code,signal:exit.signal,at:exit.at,receivedAt:performance.now()});
      },error=>{remember(error);});
      firstHostShutdown=Object.freeze({recordFirst:recordFirstHost,rendererDone:startFirstHostClose,hostStorage:firstHostStorage,
        recordSecondary:error=>{if(firstHostFirst===null)recordFirstHost(error,'catch-only');else remember(error);},
        recordFailureState:state=>{
          if(firstHostFailureState!==null)return;
          const pending=Array.isArray(state?.pending)?state.pending.slice(0,32).map(row=>({name:String(row.name).slice(0,240),state:String(row.state).slice(0,32)})):null;
          firstHostFailureState=Object.freeze({status:'UNFORMED',responseAvailable:state?.responseAvailable===true,responseStored:'not-confirmed',pending,
            pendingTruncated:Array.isArray(state?.pending)&&state.pending.length>32,snapshotError:state?.snapshotError==null?null:String(state.snapshotError).slice(0,240),observerError:state?.observerError==null?null:String(state.observerError).slice(0,240)});
        }});
    }
    stage='scenario';let sections;
    try{sections = nativeQualification
      ? await deps.mediaScenario({ ...launched, responses, artifactPath, browserSession, writeZoomCapture, ...(source?.audioSourceSchema==='f01-audio-source-v2'?{audioEvidenceSource:source}:{}), ...(firstHostShutdown?{firstHostShutdown}:{}),...(audioSettingsObservation?{observation:audioSettingsObservation}:{}) })
      : await deps.scenario({ ...launched, responses, artifactPath, restartSession });}
    finally{audioSettingsObservation?.endScenario();}
    if(jobSelection&&(sections?.audioProduct?.scope!==jobSelection.caseId||sections.audioProduct.spec?.id!==jobSelection.caseId))throw runnerError('media-job-case-invalid');
    if(gainJob&&(sections.audioProduct.schema!=='f01-product-eq-observation-v2'||
      sections.audioProduct.componentWitness!==true||sections.audioProduct.archive?.profile!=='equalizer-component'||
      sections.audioProduct.archive.coverage!=='contiguous-program2-source2-control5-component2'||
      sections.audioProduct.spec.sampleRate!==Number(jobSelection.caseId.split('/')[0])||
      sections.audioProduct.archive.sampleRate!==sections.audioProduct.spec.sampleRate))throw runnerError('media-job-component-invalid');
    if(joint&&(!sections?.audioJ1?.passed||sections.audioJ1.schema!=='f01-j1-native-v1'||sections.audioJ1.trajectory!=='j1-unity-v1'))throw runnerError('audio-j1-result-invalid');
    stage='trace-stop';traceStopAttempted=true;
    await browserIO('trace-stop',()=>context.tracing.stop(joint||qualification==='audio-settings'?{path:path.join(artifactPath,'trace.zip')}:undefined));
    traceStopped = true;
    report = { ok: true, runId, ...sections };
  } catch (error) {
    const partial = path.join(files.root,'output','tool-audit',`p02-candidate-${runId}`,'chrome-candidate');
    if (retainEvidence && error?.retainedCandidatePath === partial) candidatePath = partial;
    if(firstHostOwned){recordFirstHost(error,'catch-only');void startFirstHostClose().catch(()=>{});}
    remember(error);
    if(joint){if(stage==='prelaunch-record')artifactErrors.set('before.json',String(error));if(stage==='trace-stop')artifactErrors.set('trace.zip',String(error));if(typeof error?.artifactName==='string')artifactErrors.set(error.artifactName,String(error));
      if(typeof error?.evidenceError==='string'){artifactErrors.set('partial.json',error.evidenceError);remember(runnerError('audio-j1-partial-write-failed',Error(error.evidenceError)));}}
    const reportError=firstHostFirst===null?error:firstHostFirst.error;
    report = { ok: false, runId, error: { code: reportError?.code || 'installed-e2e-failed',native:failureDetails(reportError),
      ...(typeof reportError?.startupDiagnostic === 'string' ? {startupDiagnostic:reportError.startupDiagnostic.slice(0,4096)} : {}) } };
    if(context&&firstHostOwned&&traceStarted&&!traceStopped&&!traceStopAttempted){
      traceStopAttempted=true;firstHostTrace.attempted=true;
      // The owned close task was queued first; trace persistence cannot delay its start.
      firstHostTraceTask=Promise.resolve().then(()=>context.tracing.stop({path:path.join(files.root,...artifactRelative.split('/'),'trace.zip')})).then(()=>{
        traceStopped=true;firstHostTrace.stopAcknowledged=true;
      },error=>{firstHostTrace.error=failureDetails(error);remember(error);});
    }
    if (context&&!firstHostOwned) {
      const page = context.pages().at(-1);
      if (page) {
        try { await browserIO('failure-screenshot',()=>page.screenshot({ path: path.join(files.root, ...artifactRelative.split('/'), 'failure.png'), fullPage: false })); } catch (error) {if(joint)artifactErrors.set('failure.png',String(error));if(joint||qualification==='audio-settings'||gainJob)remember(error);}
      }
      if (traceStarted && !traceStopped&&((!joint&&qualification!=='audio-settings')||!traceStopAttempted)) {
        try {
          traceStopAttempted=true;
          await browserIO('trace-stop-failure',()=>context.tracing.stop({ path: path.join(files.root, ...artifactRelative.split('/'), 'trace.zip') }));
          traceStopped = true;
        } catch (error) {if(joint)artifactErrors.set('trace.zip',String(error));remember(error);}
      }
    }
  } finally {
    if (nativeQualification && context) {
      try {
        const close=()=>{if(jobSelection&&!runJobOwner)throw runnerError('media-job-launch-unconfirmed');return deps.closeInstalledMediaBrowser({ context, browserSession, profilePath,...jobSelection?{runJobOwner}:{} });};
        shutdownProof = firstHostOwned?await startFirstHostClose():qualification==='audio-settings'?await browserIO('owned-close',close):await close();
        if (!shutdownAccepted()) throw runnerError('media-close-unconfirmed');
      } catch (error) {
        if(qualification==='media-tab'&&!jobSelection&&retainEvidence&&!primaryFailed&&traceStopped&&report?.ok&&
          report.audioProduct?.scope==='44100/normalizer-control/tone-silence'&&isDeepStrictEqual(report.pageErrors,[])&&
          error?.forcedRetirement===true&&typeof deps.recordToneSilenceCloseFailure==='function')toneSilenceCloseFailure=error;
        remember(error);
      }
    }
    if(firstHostStorage)await firstHostStorage.finish();
    if (context && (!nativeQualification || shutdownAccepted())) {
      try { if(qualification==='audio-settings')await browserIO('context-close',()=>context.close());else await context.close();contextCloseAcknowledged=true; } catch (error) { remember(error); }
    }
    if(firstHostTraceTask)await firstHostTraceTask;
    if(audioSettingsObservation)try{
      audioSettingsSnapshot=audioSettingsObservation.finish(contextCloseAcknowledged&&['browserCloseAcknowledged','browserDisconnected','ownedRootClosed'].every(k=>shutdownProof?.[k]===true));
      if(audioSettingsSnapshot.pageErrorCount>0)remember(runnerError('audio-settings-page-error'));
      if(!audioSettingsSnapshot.complete&&(!primaryFailed||audioSettingsSnapshot.faults.length))remember(runnerError('audio-settings-observation-incomplete'));
    }catch(error){remember(error);}
    if(qualification==='audio-settings'&&candidateBefore!==null)try{
      candidateAfter=await browserIO('candidate-after',()=>audioCandidateInventory(files,candidateDist,candidateExpected));
      if(!isDeepStrictEqual(candidateBefore,candidateAfter))throw runnerError('audio-settings-candidate-changed');
    }catch(error){remember(error);}
    if(normalAdmitted)try{
      normalAfter=structuredClone(await browserIO('normal-after',()=>deps.readAudioSettingsNormal(files)));
      if(!isDeepStrictEqual(normalBefore,normalAfter))throw runnerError('audio-settings-normal-changed');
    }catch(error){remember(error);}
    if (profilePath && !nativeQualification && !retainEvidence) {
      try { await files.removeTree(relativeOwnedPath(files.root, profilePath)); } catch (error) { remember(error); }
    }
    if (candidateBuilt && !nativeQualification && !retainEvidence) {
      try { await deps.removeCandidate(runId); } catch (error) { remember(error); }
    }
  }

  if (nativeQualification && source) {
    try { after = await deps.sourceAttestation(files, requiredInputs);
      if (qualification === 'audio-l1' || joint) assertLiveAudioSource(after, files);
      if (!isDeepStrictEqual(source, after)) throw runnerError('media-source-changed'); }
    catch (error) { remember(error); }
  }
  if (nativeQualification && report) report = { ...report, qualification, shutdown: shutdownProof ?? null,
    profileRetained: !!profilePath, candidateRetained: candidateBuilt, source, after,...jobSelection?{shutdownSelection:{...jobSelection,binding:expectedJobBinding??null}}:{} };
  if (retainEvidence && report) {
    const evidence = {profilePath:null,candidatePath:null,retained:false};
    for (const [key,value] of [['profilePath',profilePath],['candidatePath',candidatePath]]) if (value) {
      try {
        const relative = relativeOwnedPath(files.root,value),stat = await files.lstat(relative,{optional:true});
        if (!stat?.isDirectory()) throw runnerError('installed-e2e-evidence-missing');
        Reflect.set(evidence,key,value);
      } catch (error) { remember(error); }
    }
    evidence.retained = !!(evidence.profilePath || evidence.candidatePath); report.evidence = evidence;
  }
  if(qualification==='audio-settings'&&report)report={...report,audioSettingsNormal:deps.readAudioSettingsNormal?{before:normalLink(normalBefore),after:normalLink(normalAfter)}:null,audioSettingsCandidate:{before:candidateBefore,after:candidateAfter},audioSettingsObservation:audioSettingsSnapshot,
    audioSettingsTrace:{file:artifactRelative+'/trace.zip',attempted:traceStopAttempted,stopAcknowledged:traceStopped},...(audioSettingsSnapshot?.pageErrorCount>0?{pageErrors:['audio-settings-page-error']}:{})};
  if(firstHostOwned&&report){
    if(firstHostFirst!==null)report={...report,ok:false,error:{code:firstHostFirst.error?.code||'installed-e2e-failed',native:failureDetails(firstHostFirst.error)}};
    report={...report,hostResponseStorage:{receipt:firstHostStorage.receipt(),filesBudget:firstHostStorage.budget()},firstHostShutdown:{caseId:firstHostShutdownCase,scope:'scenario-first-host',firstAt:firstHostFirst?.firstAt??null,authority:firstHostFirst?.authority??null,shutdownBy:firstHostCloseBy,acceptedAt:firstHostCloseAcceptedAt,observedChildExit:firstHostObservedExit,failureState:firstHostFailureState,secondaryDropped:firstHostSecondaryDropped,trace:{...firstHostTrace,attempted:traceStopAttempted,stopAcknowledged:traceStopped},failureScreenshot:firstHostFirst===null?'not-required':'not-attempted-close-priority'}};
  }
  if (primaryFailed && report?.ok) report = {...report,ok:false,error:{code:primaryError?.code || 'installed-e2e-cleanup-failed',native:failureDetails(primaryError)}};
  if (secondaryErrors.length && report) report = {...report,ok:false,secondaryErrors};
  if (report) report.durationMs = Date.now() - startedAt;
  if(joint&&artifactCreated){
    const artifacts={},mandatory=['before.json','trace.zip','cold.json','playback.json','clock-0.json','clock-1.json','request-timing.json','capture.json',
      'stream-0.f32le','stream-1.f32le','stream-2.f32le','assessment.json','module.json','module-resource.fetched.js'];
    for(const name of [...mandatory,'partial.json','failure.png']){
      try{const stat=await files.lstat(`${artifactRelative}/${name}`,{optional:true});
        artifacts[name]=artifactErrors.has(name)?{status:'write-failed',stage,reason:artifactErrors.get(name)}:
          stat?.isFile()?{status:'written'}:{status:'unavailable',stage,reason:'not-formed-before-failure'};
        if(!primaryFailed&&mandatory.includes(name)&&artifacts[name].status!=='written')remember(runnerError('audio-j1-evidence-incomplete'));
      }catch(error){remember(error);artifacts[name]={status:'write-failed',stage,reason:String(error)};}
    }
    try{await files.writeFile(`${artifactRelative}/evidence-status.json`,JSON.stringify({stage,artifacts},null,2)+'\n',{flag:'wx'});}
    catch(error){remember(error);}
    if(primaryFailed&&report?.ok)report={...report,ok:false,error:{code:primaryError?.code||'audio-j1-evidence-failed',native:failureDetails(primaryError)}};
    if(secondaryErrors.length&&report)report={...report,ok:false,secondaryErrors};
  }
  if (artifactCreated) {
    try {
      await files.writeFile(`${artifactRelative}/summary.json`, `${JSON.stringify(report, null, 2)}\n`,joint?{flag:'wx'}:'utf8');
      if(toneSilenceCloseFailure&&!secondaryErrors.length&&isDeepStrictEqual(report.pageErrors,[])&&isDeepStrictEqual(source,after))deps.recordToneSilenceCloseFailure(toneSilenceCloseFailure,report);
    } catch (error) {
      remember(error);
    }
  }
  if (primaryFailed) {
    if (retainEvidence && !secondaryErrors.length && Object.isExtensible(primaryError)) primaryError.evidence = report?.evidence;
    const outgoing=secondaryErrors.length?Object.assign(runnerError('installed-e2e-incomplete'),{cause:primaryError,secondaryErrors,...retainEvidence?{evidence:report?.evidence}:{}}):primaryError;
    if(firstHostSelected)try{deps.recordHostResponseThrow?.(outgoing);}catch(error){remember(error);}
    throw outgoing;
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseInstalledE2EArgs(process.argv.slice(2));
  console.log(JSON.stringify(await runInstalledExtensionE2E(options), null, 2));
}
