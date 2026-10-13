import { reacquireExtensionWorker } from './harness.mjs';
import { waitTransition } from './transition-scenario.mjs';

const fail = code => Object.assign(new Error(code), { code });
const bounded = async (work, milliseconds, code) => {
  let timer;
  try { return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(fail(code)), milliseconds); })]); }
  finally { clearTimeout(timer); }
};

/** Only the supervised runner's fresh fixture profiles call this normal Chrome UI setup. */
export async function refreshTransitionWorker(launched, reacquire = reacquireExtensionWorker, timeoutMs = 15000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15000) throw fail('transition-preparation-timeout-invalid');
  const readManifest = () => { const manifest = chrome.runtime.getManifest(); return { id: chrome.runtime.id, version: manifest.version,
    displayVersion: manifest.version_name || manifest.version }; };
  const expected = await bounded(() => launched.worker.evaluate(readManifest),
    timeoutMs, 'transition-preparation-worker-timeout');
  if (expected.id !== launched.extensionId || !/^\d+\.\d+\.\d+$/.test(expected.version)) throw fail('transition-execution');
  const manager = await launched.context.newPage();
  let wake, primary, result, oldCloseHandler;
  const readState = id => {
    const root = document.querySelector('extensions-manager')?.shadowRoot;
    const toggle = root?.querySelector('extensions-toolbar')?.shadowRoot?.querySelector('#devMode');
    const items = [...(root?.querySelector('extensions-item-list')?.shadowRoot?.querySelectorAll('extensions-item') || [])];
    const data = items.find(item => item.id === id || item.data?.id === id)?.data;
    if (!toggle || !data || typeof toggle.checked !== 'boolean') return null;
    return { developerMode: toggle.checked, locked: Boolean(toggle.disabled) || toggle.getAttribute('aria-disabled') === 'true',
      extensionId: data.id, displayVersion: data.version, state: data.state, restricted: Object.values(data.disableReasons || {}).some(value => value === true) };
  };
  const read = () => manager.evaluate(readState, launched.extensionId);
  const sameIdentity = value => value?.extensionId === expected.id && value.displayVersion === expected.displayVersion;
  try {
    await manager.goto('chrome://extensions', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const before = await waitTransition(read, sameIdentity, 'transition-preparation-timeout', timeoutMs);
    if (before.locked) throw fail('transition-developer-mode-locked');
    if (!before.developerMode) {
      await manager.locator('extensions-toolbar #devMode').click({ timeout: timeoutMs });
      await waitTransition(read, value => sameIdentity(value) && value.developerMode && !value.locked, 'transition-preparation-timeout', timeoutMs);
    }
    const closed = new Promise(resolve => { oldCloseHandler = resolve; launched.worker.once('close', oldCloseHandler); });
    await bounded(() => launched.worker.evaluate(() => chrome.runtime.reload()), timeoutMs, 'transition-preparation-worker-timeout');
    await bounded(() => closed, timeoutMs, 'transition-worker-close-timeout');
    // A new management document avoids treating the pre-reload ENABLED snapshot as completion.
    await manager.goto('chrome://extensions', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const active = await waitTransition(read, value => sameIdentity(value) && value.developerMode && !value.locked &&
      value.state === 'ENABLED' && !value.restricted, 'transition-preparation-timeout', timeoutMs);
    wake = await launched.context.newPage();
    await wake.goto(`chrome-extension://${launched.extensionId}/popup.html`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const fresh = await reacquire(launched.context, launched.worker, timeoutMs, { reusePrevious: false });
    if (fresh.extensionId !== launched.extensionId) throw fail('transition-execution');
    const actual = await bounded(() => fresh.worker.evaluate(readManifest), timeoutMs, 'transition-preparation-worker-timeout');
    if (actual.id !== expected.id || actual.version !== expected.version || actual.displayVersion !== expected.displayVersion) throw fail('transition-execution');
    result = { ...launched, ...fresh, preparation: { developerMode: active.developerMode, workerClosed: true,
      extensionId: actual.id, version: actual.version, state: active.state } };
  } catch (error) { primary = error; }
  finally {
    if (oldCloseHandler) launched.worker.removeListener('close', oldCloseHandler);
    for (const page of [wake, manager]) {
      if (!page) continue;
      try { await page.close(); }
      catch (error) {
        if (!primary) primary = error;
        else { primary.cleanupErrors ||= []; primary.cleanupErrors.push({ code: error?.code || 'transition-preparation-cleanup' }); }
      }
    }
  }
  if (primary) throw primary;
  return result;
}
