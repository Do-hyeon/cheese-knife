import { randomBytes } from 'node:crypto';
import path from 'node:path';

const harnessError = (code, cause) => Object.assign(new Error(code, cause ? { cause } : undefined), { code });
const runIdPattern = /^[A-Za-z0-9]{1,64}$/;
const workerURLPattern = /^chrome-extension:\/\/([a-p]{32})\/background\.js$/;

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

export async function launchInstalledExtension({ chromiumApi, extensionPath, profilePath, artifactPath, headed }) {
  const options = extensionLaunchOptions(extensionPath, headed);
  if (typeof profilePath !== 'string' || !path.isAbsolute(profilePath)) throw harnessError('profile-path-invalid');
  if (typeof artifactPath !== 'string' || !path.isAbsolute(artifactPath)) throw harnessError('artifact-path-invalid');
  if (!chromiumApi || typeof chromiumApi.launchPersistentContext !== 'function') throw harnessError('browser-api-invalid');

  let context;
  try {
    context = await chromiumApi.launchPersistentContext(profilePath, { ...options, tracesDir: artifactPath });
  } catch (cause) {
    throw harnessError('browser-unavailable', cause);
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
