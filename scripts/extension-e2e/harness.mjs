import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const harnessError = (code, cause) => Object.assign(new Error(code, cause ? { cause } : undefined), { code });
const runIdPattern = /^[A-Za-z0-9]{1,64}$/;
const workerURLPattern = /^chrome-extension:\/\/([a-p]{32})\/background\.js$/;
const execFileAsync = promisify(execFile);

export function parseInstalledE2EArgs(argv) {
  if (!Array.isArray(argv)) throw harnessError('installed-e2e-args-invalid');
  let headed = false;
  let sawHeaded = false;
  let runId = null;
  for (const argument of argv) {
    if (argument === '--headed') {
      if (sawHeaded) throw harnessError('installed-e2e-args-invalid');
      sawHeaded = true;
      headed = true;
      continue;
    }
    if (typeof argument === 'string' && argument.startsWith('--run-id=')) {
      if (runId !== null) throw harnessError('installed-e2e-args-invalid');
      runId = argument.slice('--run-id='.length);
      if (!runIdPattern.test(runId)) throw harnessError('installed-e2e-args-invalid');
      continue;
    }
    throw harnessError('installed-e2e-args-invalid');
  }
  if (runId === null) runId = `installed${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
  if (!runIdPattern.test(runId)) throw harnessError('installed-e2e-args-invalid');
  return { headed, runId };
}

export function extensionLaunchOptions(extensionPath, headed) {
  if (typeof extensionPath !== 'string' || !path.isAbsolute(extensionPath)) throw harnessError('extension-path-invalid');
  if (typeof headed !== 'boolean') throw harnessError('headed-invalid');
  return {
    channel: 'chromium',
    headless: !headed,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  };
}

export function extensionIdFromWorkerURL(url) {
  const match = typeof url === 'string' ? workerURLPattern.exec(url) : null;
  if (!match) throw harnessError('extension-worker-url-invalid');
  return match[1];
}

const serviceWorkers = context => {
  if (!context || typeof context.serviceWorkers !== 'function') throw harnessError('extension-context-invalid');
  const workers = context.serviceWorkers();
  if (!Array.isArray(workers)) throw harnessError('extension-context-invalid');
  return workers;
};

const selectExtensionWorker = workers => {
  const valid = [];
  for (const worker of new Set(workers)) {
    if (!worker || typeof worker.url !== 'function') throw harnessError('extension-worker-url-invalid');
    const url = worker.url();
    try {
      extensionIdFromWorkerURL(url);
      valid.push(worker);
    } catch (error) {
      if (typeof url === 'string' && url.startsWith('chrome-extension://')) throw error;
    }
  }
  if (valid.length > 1) throw harnessError('extension-worker-ambiguous');
  return valid[0] ?? null;
};

export async function waitForExtensionWorker(context, timeoutMs = 15000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw harnessError('extension-worker-timeout-invalid');
  const existing = selectExtensionWorker(serviceWorkers(context));
  if (existing) return existing;
  if (typeof context.waitForEvent !== 'function') throw harnessError('extension-context-invalid');
  let started;
  try {
    started = await context.waitForEvent('serviceworker', { timeout: timeoutMs });
  } catch (cause) {
    throw harnessError('extension-worker-timeout', cause);
  }
  const selected = selectExtensionWorker([...serviceWorkers(context), started]);
  if (!selected) throw harnessError('extension-worker-url-invalid');
  return selected;
}

const boundedWorkerProbe = async (worker, timeoutMs) => {
  if (!worker || typeof worker.url !== 'function' || typeof worker.evaluate !== 'function') throw harnessError('extension-worker-url-invalid');
  const expectedId = extensionIdFromWorkerURL(worker.url());
  let timer;
  try {
    const actualId = await Promise.race([
      Promise.resolve().then(() => worker.evaluate(() => chrome.runtime.id)).catch(cause => { throw harnessError('extension-worker-probe-failed', cause); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(harnessError('extension-worker-probe-timeout')), timeoutMs); }),
    ]);
    if (actualId !== expectedId) throw harnessError('extension-worker-probe-invalid');
    return expectedId;
  } finally {
    clearTimeout(timer);
  }
};

const replacementWorkers = (context, previousWorker) => {
  const candidates = [];
  for (const worker of new Set(serviceWorkers(context))) {
    if (worker === previousWorker) continue;
    const url = typeof worker?.url === 'function' ? worker.url() : '';
    try {
      extensionIdFromWorkerURL(url);
      candidates.push(worker);
    } catch (error) {
      if (typeof url === 'string' && url.startsWith('chrome-extension://')) throw error;
    }
  }
  if (candidates.length > 1) throw harnessError('extension-worker-ambiguous');
  return candidates;
};

export async function reacquireExtensionWorker(context, previousWorker, timeoutMs = 15000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw harnessError('extension-worker-timeout-invalid');
  const deadline = Date.now() + timeoutMs;
  try {
    const extensionId = await boundedWorkerProbe(previousWorker, timeoutMs);
    return { worker: previousWorker, extensionId };
  } catch (error) {
    if (!['extension-worker-probe-failed', 'extension-worker-probe-timeout'].includes(error?.code)) throw error;
  }

  const inspect = async () => {
    const [candidate] = replacementWorkers(context, previousWorker);
    if (!candidate) return null;
    const remaining = Math.max(1, deadline - Date.now());
    try { return { worker: candidate, extensionId: await boundedWorkerProbe(candidate, remaining) }; }
    catch (error) {
      if (['extension-worker-probe-failed', 'extension-worker-probe-timeout'].includes(error?.code)) return null;
      throw error;
    }
  };
  const existing = await inspect();
  if (existing) return existing;
  const remaining = deadline - Date.now();
  if (remaining <= 0 || typeof context.waitForEvent !== 'function') throw harnessError('extension-worker-reacquire-timeout');
  try { await context.waitForEvent('serviceworker', { timeout: remaining }); }
  catch (cause) { throw harnessError('extension-worker-reacquire-timeout', cause); }
  const replacement = await inspect();
  if (!replacement) throw harnessError('extension-worker-reacquire-timeout');
  return replacement;
}

const windowsSideBySideFailure = error => /spawn UNKNOWN|side-by-side/i.test(String(error?.message || error));

async function findManifestLayout(sourceRoot) {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const rootManifest = entries.find(entry => entry.isFile() && /^\d+\.\d+\.\d+\.\d+\.manifest$/.test(entry.name));
  if (rootManifest) return { version: rootManifest.name.slice(0, -'.manifest'.length), payloadRoot: sourceRoot };
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+\.\d+\.\d+\.\d+$/.test(entry.name)) continue;
    const manifest = path.join(sourceRoot, entry.name, `${entry.name}.manifest`);
    try { if ((await fs.lstat(manifest)).isFile()) return { version: entry.name, payloadRoot: path.join(sourceRoot, entry.name) }; }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  throw harnessError('bundled-chromium-layout-invalid');
}

async function findManifestTool() {
  const kitsRoot = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  const versions = (await fs.readdir(kitsRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^\d+(?:\.\d+){3}$/.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = path.join(kitsRoot, version, process.arch === 'arm64' ? 'arm64' : 'x64', 'mt.exe');
    try { if ((await fs.lstat(candidate)).isFile()) return candidate; }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  throw harnessError('manifest-tool-unavailable');
}

async function prepareWindowsBundledChromium({ chromiumApi, profilePath }) {
  if (typeof chromiumApi.executablePath !== 'function') throw harnessError('bundled-chromium-path-unavailable');
  const sourceExecutable = chromiumApi.executablePath();
  const sourceRoot = path.dirname(sourceExecutable);
  const { version, payloadRoot } = await findManifestLayout(sourceRoot);
  const targetRoot = path.join(profilePath, 'bundled-chromium');
  const targetVersion = path.join(targetRoot, version);
  const targetExecutable = path.join(targetRoot, 'chrome.exe');
  const readyMarker = path.join(targetRoot, '.knife-ready');
  try {
    if (await fs.readFile(readyMarker, 'utf8') === version && (await fs.lstat(targetExecutable)).isFile()) return targetExecutable;
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await fs.mkdir(targetVersion, { recursive: true });
  await fs.copyFile(sourceExecutable, targetExecutable);
  const proxy = path.join(sourceRoot, 'chrome_proxy.exe');
  try { await fs.copyFile(proxy, path.join(targetRoot, 'chrome_proxy.exe')); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  for (const entry of await fs.readdir(payloadRoot, { withFileTypes: true })) {
    if (payloadRoot === sourceRoot && ['chrome.exe', 'chrome_proxy.exe', version].includes(entry.name)) continue;
    await fs.cp(path.join(payloadRoot, entry.name), path.join(targetVersion, entry.name), { recursive: true, force: false, errorOnExist: true });
  }
  const manifest = path.join(targetVersion, `${version}.manifest`);
  const assembly = path.join(targetVersion, `${version}.dll`);
  await fs.copyFile(path.join(targetVersion, 'chrome_elf.dll'), assembly);
  const manifestTool = await findManifestTool();
  await execFileAsync(manifestTool, ['-manifest', manifest, `-outputresource:${assembly};#2`], { windowsHide: true });
  await fs.writeFile(readyMarker, version, 'utf8');
  return targetExecutable;
}

export async function launchInstalledExtension({ chromiumApi, extensionPath, profilePath, artifactPath, headed, browserCompatibility }) {
  const options = extensionLaunchOptions(extensionPath, headed);
  if (typeof profilePath !== 'string' || !path.isAbsolute(profilePath)) throw harnessError('profile-path-invalid');
  if (typeof artifactPath !== 'string' || !path.isAbsolute(artifactPath)) throw harnessError('artifact-path-invalid');
  if (!chromiumApi || typeof chromiumApi.launchPersistentContext !== 'function') throw harnessError('browser-api-invalid');

  let context;
  try {
    context = await chromiumApi.launchPersistentContext(profilePath, { ...options, tracesDir: artifactPath });
  } catch (cause) {
    const compatibility = browserCompatibility || { platform: process.platform, prepare: prepareWindowsBundledChromium };
    if (compatibility.platform !== 'win32' || !windowsSideBySideFailure(cause) || typeof compatibility.prepare !== 'function') {
      throw harnessError('browser-unavailable', cause);
    }
    try {
      const executablePath = await compatibility.prepare({ chromiumApi, profilePath });
      context = await chromiumApi.launchPersistentContext(profilePath, { ...options, tracesDir: artifactPath, executablePath });
    } catch (fallbackCause) {
      throw harnessError('browser-unavailable', fallbackCause);
    }
  }

  try {
    const worker = await waitForExtensionWorker(context);
    return { context, worker, extensionId: extensionIdFromWorkerURL(worker.url()) };
  } catch (error) {
    try {
      await context.close();
    } catch {
      // Preserve the worker-discovery failure; cleanup errors are secondary here.
    }
    throw error;
  }
}
