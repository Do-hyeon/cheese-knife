import { createHash, randomBytes } from 'node:crypto';
import { fork, execFile, execFileSync } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { openOwnedRoot } from './owned-files.mjs';
import { verifyCandidate, removeCandidate } from './verify-candidate.mjs';
import { loadFixtureResponses } from './extension-e2e/fixture-router.mjs';
import { launchInstalledExtension, parseInstalledE2EArgs, reacquireExtensionWorker } from './extension-e2e/harness.mjs';
import { readPublishedPayload, PUBLISHED_PAYLOAD_BASELINE } from './extension-e2e/published-payload.mjs';
import { TRANSITION_CASES, transitionSeed, expectedTransitionRaw, expectedTransitionState, assertTransitionState, runTransitionPhase } from './extension-e2e/transition-scenario.mjs';

const scriptPath = fileURLToPath(import.meta.url), repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => Object.assign(new Error(code), { code });
const execFileAsync = promisify(execFile);
const slash = value => value.split(path.sep).join('/');
const genericFailure = error => error?.failure || { code: String(error?.code || 'transition-failed').slice(0, 240),
  caseId: null, phase: null, step: 'prepare', stage: 'prepare',
  diagnostic: { name: String(error?.name || 'Error').slice(0, 80), message: String(error?.message || '').replaceAll(repositoryRoot, '<repository>').slice(0, 240) }, cleanupErrors: [] };
const relative = (files, absolute) => {
  const value = slash(path.relative(files.root, absolute));
  if (!value || value === '..' || value.startsWith('../') || path.isAbsolute(value)) throw fail('transition-owned-path');
  return value;
};
const timeout = async (work, milliseconds, code) => {
  let timer;
  try { return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(fail(code)), milliseconds); })]); }
  finally { clearTimeout(timer); }
};

export function phasePayload(payload, phase, control) {
  if (!['old', 'new', 'rollback'].includes(phase) || (control !== undefined && control !== 'storage-loss')) throw fail('transition-control-invalid');
  return payload.entries.map(entry => {
    let bytes = Buffer.from(entry.bytes);
    if (entry.name === 'manifest.json' && phase !== 'old') {
      const manifest = JSON.parse(bytes);
      manifest.version = phase === 'new' ? '2.13.3.1' : '2.13.3.2';
      manifest.version_name = `AF05-B2 TEST ONLY ${phase}`;
      bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    }
    if (entry.name === 'settings-broker.js' && phase === 'new' && control === 'storage-loss') {
      const source = bytes.toString('utf8'), boot = 'boot = enqueue(async () => {', read = 'const raw = await read(true), revision = contract.readRevision(raw.settingsRevision);';
      const index = source.indexOf(read), bootIndex = source.indexOf(boot);
      if (index < 0 || bootIndex < 0 || source.split(read).length !== 2 || source.split(boot).length !== 2 ||
          !/^\r?\n {6}$/.test(source.slice(bootIndex + boot.length, index))) throw fail('transition-control-preparation');
      const eol = source.slice(bootIndex + boot.length, index).startsWith('\r') ? '\r\n' : '\n';
      bytes = Buffer.from(`${source.slice(0, index)}await chromeApi.storage.local.remove('config');${eol}      ${source.slice(index)}`);
    }
    return { name: entry.name, bytes, sha256: sha256(bytes) };
  });
}

export function matchesStorageLoss(failure, nonce) {
  const expected = expectedTransitionRaw('valid-ui', 'old', 'font8', nonce); delete expected.config;
  return failure?.code === 'transition-storage-preservation' && failure.caseId === 'valid-ui' && failure.phase === 'new' &&
    failure.step === 'startup' && failure.stage === 'candidate-init' && Array.isArray(failure.cleanupErrors) && failure.cleanupErrors.length === 0 &&
    isDeepStrictEqual(failure.observation?.raw, expected);
}

export async function refreshTransitionWorker(launched, reacquire = reacquireExtensionWorker) {
  // Persistent unpacked Chromium can keep imported worker scripts across a versioned relaunch.
  await launched.worker.evaluate(() => chrome.runtime.reload());
  const wake = await launched.context.newPage();
  try {
    await wake.goto(`chrome-extension://${launched.extensionId}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const fresh = await reacquire(launched.context, launched.worker, 15000, { reusePrevious: false });
    if (fresh.extensionId !== launched.extensionId) throw fail('transition-execution');
    return { ...launched, ...fresh };
  } finally { await wake.close(); }
}

export function validateTransitionResult(result, nonce, control, launches) {
  const cases = control ? ['valid-ui'] : TRANSITION_CASES;
  if (!result?.source?.sourceCommit || !isDeepStrictEqual(result.source, result.after) ||
      !/^[a-f0-9]{64}$/.test(result.candidateInventory || '') || result.seeds?.length !== cases.length ||
      result.phases?.length !== cases.length * (control ? 1 : 3) || launches.length !== cases.length * (control ? 3 : 4)) throw fail('transition-result-incomplete');
  for (const caseId of cases) {
    const seed = result.seeds.find(value => value.caseId === caseId), phases = result.phases.filter(value => value.caseId === caseId);
    if (!seed || seed.writes !== 1 || !/^[a-p]{32}$/.test(seed.extensionId || '') || !isDeepStrictEqual(seed.raw, transitionSeed(caseId, nonce)) ||
        !isDeepStrictEqual(phases.map(value => value.phase), control ? ['old'] : ['old', 'new', 'rollback']) ||
        !isDeepStrictEqual(launches.filter(value => value.caseId === caseId).map(value => value.phase), control ? ['seed', 'old', 'new'] : ['seed', 'old', 'new', 'rollback'])) throw fail('transition-result-incomplete');
    for (const phase of phases) {
      const steps = caseId !== 'valid-ui' ? ['startup'] : phase.phase === 'old' ? ['startup', 'arrow-off', 'volume25', 'hide-ranking-on', 'font8', 'font8'] :
        phase.phase === 'new' ? ['startup', 'two-popup-merge', 'font0', 'font0'] : ['startup', 'volume26', 'rollback-font8', 'rollback-font8', 'rollback-font0'];
      if (phase.extensionId !== seed.extensionId || !/^[a-f0-9]{64}$/.test(phase.inventorySha256 || '') ||
          !/^[a-f0-9]{64}$/.test(phase.manifestSha256 || '') || !Array.isArray(phase.records) ||
          !isDeepStrictEqual(phase.records.map(value => value.step), steps)) throw fail('transition-result-incomplete');
      let reloaded = false;
      for (const [index, record] of phase.records.entries()) {
        const shouldReload = index > 0 && steps.at(index - 1) === record.step;
        if (Boolean(record.reloaded) !== shouldReload) throw fail('transition-result-incomplete');
        reloaded ||= shouldReload;
        assertTransitionState(record.observation, expectedTransitionState(caseId, phase.phase, record.step, nonce, seed.extensionId,
          { reloaded, reloads: reloaded ? [1, 0] : [0, 0] }));
      }
      if (!isDeepStrictEqual(phase.final, phase.records.at(-1).observation)) throw fail('transition-result-incomplete');
    }
  }
}

export async function terminateTransitionChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) throw fail('transition-child-pid');
  await timeout(async () => {
    if (process.platform === 'win32') await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
    else process.kill(-child.pid, 'SIGKILL');
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once('exit', resolve));
  }, 5000, 'transition-kill-failed');
}

export function superviseTransitionChild({ child, nonce, roots, deadlineMs = 600000, phaseTimeoutMs = 130000, killChild = terminateTransitionChild }) {
  return new Promise(resolve => {
    const launches = new Map(), cleanupErrors = [];
    let failure = null, result, receivedResult = false, finished = false, phaseTimer;
    const remember = error => { failure ||= genericFailure(error); };
    const finish = normalExit => {
      if (finished) return; finished = true; clearTimeout(timer); clearTimeout(phaseTimer);
      child.removeListener('message', onMessage); child.removeListener('exit', onExit); child.removeListener('error', onError);
      const unconfirmedRoots = [...new Set([...launches.values()].filter(value => !value.closed).map(value => value.root))];
      if (!receivedResult) remember(fail('transition-child-result-missing'));
      if (!normalExit) remember(fail('transition-child-exit'));
      if (unconfirmedRoots.length) remember(fail('cleanup-unconfirmed'));
      resolve({ result, failure, cleanupErrors, unconfirmedRoots, normalExit, launches: [...launches.values()] });
    };
    const expire = async code => {
      if (finished) return;
      remember(fail(code));
      try { await killChild(child); }
      catch { cleanupErrors.push({ code: 'transition-kill-failed', caseId: null, phase: null }); }
      finish(false);
    };
    const timer = setTimeout(() => { void expire('transition-child-timeout'); }, deadlineMs);
    const onError = error => { remember(error); void expire('transition-child-error'); };
    const onExit = (code, signal) => finish(code === 0 && signal === null);
    const onMessage = message => {
      try {
        if (!message || message.nonce !== nonce || Buffer.byteLength(JSON.stringify(message)) > 1048576) throw fail('transition-ipc');
        if (message.type === 'failure') { if (!message.failure?.code) throw fail('transition-ipc'); failure ||= message.failure; return; }
        if (message.type === 'result') {
          if (receivedResult || [...launches.values()].some(value => !value.closed)) throw fail('transition-ipc');
          receivedResult = true; result = message.result; return;
        }
        const assigned = roots.find(value => value.caseId === message.caseId && value.root === message.root);
        if (!assigned || !['seed', 'old', 'new', 'rollback'].includes(message.phase) || message.launchId !== `${message.caseId}:${message.phase}`) throw fail('transition-ipc');
        if (message.type === 'launch-intent') {
          if (failure || receivedResult || launches.has(message.launchId) || [...launches.values()].some(value => !value.closed)) throw fail('transition-ipc');
          const previous = [...launches.values()].filter(value => value.caseId === message.caseId);
          if (['seed', 'old', 'new', 'rollback'].at(previous.length) !== message.phase) throw fail('transition-ipc');
          launches.set(message.launchId, { caseId: message.caseId, phase: message.phase, launchId: message.launchId, root: message.root, closed: false });
          clearTimeout(phaseTimer); phaseTimer = setTimeout(() => { void expire('transition-phase-timeout'); }, phaseTimeoutMs);
          child.send({ ...message, type: 'launch-ack' }, error => { if (error) remember(error); });
        } else if (message.type === 'close-success') {
          const launch = launches.get(message.launchId);
          if (!launch || launch.closed || launch.root !== message.root) throw fail('transition-ipc');
          launch.closed = true; clearTimeout(phaseTimer);
        } else throw fail('transition-ipc');
      } catch (error) { remember(error); }
    };
    child.on('message', onMessage); child.once('exit', onExit); child.once('error', onError);
  });
}

async function sourceAttestation(files) {
  const command = args => execFileSync('git', args, { cwd: files.root, encoding: 'utf8', timeout: 15000, maxBuffer: 2097152, stdio: ['ignore', 'pipe', 'pipe'] });
  if (command(['status', '--porcelain', '--untracked-files=no']).trim()) throw fail('transition-source-dirty');
  const sourceCommit = command(['rev-parse', 'HEAD']).trim();
  const tracked = command(['ls-files', '-z']).split('\0').filter(Boolean).sort();
  const entries = [];
  for (const name of tracked) entries.push([name, sha256(await files.readFile(name))]);
  return { sourceCommit, sourceSha256: sha256(JSON.stringify(entries)),
    lockSha256: sha256(await files.readFile('package-lock.json')), manifestSha256: sha256(await files.readFile('manifest.json')),
    toolchainSha256: sha256(await files.readFile('scripts/check-toolchain.mjs')) };
}

async function payloadFromDirectory(directory) {
  const files = await openOwnedRoot(directory), entries = [];
  async function visit(folder) {
    for (const item of await files.readdir(folder, { withFileTypes: true })) {
      const name = folder ? `${folder}/${item.name}` : item.name;
      if (item.isDirectory()) await visit(name);
      else if (item.isFile()) { const bytes = await files.readFile(name); entries.push({ name, bytes, sha256: sha256(bytes) }); }
      else throw fail('transition-inventory');
    }
  }
  await visit(''); entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (entries.length !== 58) throw fail('transition-inventory');
  return { entries, inventorySha256: sha256(JSON.stringify(entries.map(({ name, sha256 }) => [name, sha256]))) };
}

async function checkInventory(directory, expected) {
  const actual = await payloadFromDirectory(directory);
  if (!isDeepStrictEqual(actual.entries.map(({ name, sha256 }) => [name, sha256]), expected.map(({ name, sha256 }) => [name, sha256]))) throw fail('transition-inventory');
  return actual.inventorySha256;
}

async function replacePayload(files, entries) {
  await files.removeTree('extension'); await files.ensureDirectory('extension');
  for (const entry of entries) {
    const target = `extension/${entry.name}`, parent = path.posix.dirname(target);
    await files.ensureDirectory(parent); await files.writeFile(target, entry.bytes, { flag: 'wx' });
  }
}

const send = (message, processApi = process) => new Promise((resolve, reject) => {
  if (!processApi.connected) { reject(fail('transition-ipc-disconnected')); return; }
  processApi.send(message, error => error ? reject(error) : resolve());
});

async function requestLaunch(message) {
  await timeout(async () => {
    let handler;
    const ack = new Promise((resolve, reject) => {
      handler = reply => {
        if (!isDeepStrictEqual(reply, { ...message, type: 'launch-ack' })) reject(fail('transition-launch-ack'));
        else resolve();
      };
      process.once('message', handler);
    });
    try { await send(message); await ack; }
    finally { process.removeListener('message', handler); }
  }, 15000, 'transition-launch-ack-timeout');
}

/** Parent-selected owned roots only; this runs in the supervised child. */
async function executeChild(options) {
  const files = await openOwnedRoot(repositoryRoot), phases = [], seeds = [], cleanupErrors = [];
  let failure, source, after, candidateInventory, active;
  const noticeFailure = async error => {
    failure ||= error?.failure || { ...genericFailure(error), ...active };
    await send({ type: 'failure', nonce: options.nonce, failure });
  };
  try {
    source = await sourceAttestation(files);
    const published = await readPublishedPayload();
    const first = await verifyCandidate(options.candidateIds[0], files.root);
    const current = await payloadFromDirectory(first.dist);
    const second = await verifyCandidate(options.candidateIds[1], files.root);
    if (current.inventorySha256 !== (await payloadFromDirectory(second.dist)).inventorySha256) throw fail('transition-build-reproducibility');
    candidateInventory = current.inventorySha256;
    const responses = await loadFixtureResponses(files);
    let failureArtifacts = false;
    for (const assigned of options.roots) {
      const work = await openOwnedRoot(await files.resolve(assigned.root, { type: 'directory' }));
      const profilePath = await work.ensureDirectory('profile'), extensionPath = await work.ensureDirectory('extension'), artifactPath = await work.ensureDirectory('trace');
      let expectedId;
      for (const phase of ['seed', 'old', 'new', 'rollback']) {
        active = { caseId: assigned.caseId, phase, step: 'replace', stage: 'replace' };
        const entries = phasePayload(phase === 'new' ? current : published, phase === 'seed' ? 'old' : phase, phase === 'new' ? options.control : undefined);
        await replacePayload(work, entries);
        active = { ...active, step: 'prelaunch', stage: 'inventory' };
        const beforeHash = await checkInventory(extensionPath, entries);
        const intent = { type: 'launch-intent', nonce: options.nonce, caseId: assigned.caseId, phase, launchId: `${assigned.caseId}:${phase}`, root: assigned.root };
        active = { ...active, step: 'launch', stage: 'launch' };
        await requestLaunch(intent);
        let context, traced = false, closed = false, phaseError;
        try {
          let launched = await launchInstalledExtension({ chromiumApi: chromium, extensionPath, profilePath, artifactPath, headed: options.headed });
          context = launched.context;
          context.setDefaultTimeout(15000);
          launched = await refreshTransitionWorker(launched);
          if (expectedId && expectedId !== launched.extensionId) throw fail('transition-execution');
          expectedId ||= launched.extensionId;
          await context.tracing.start({ screenshots: false, snapshots: true, sources: false }); traced = true;
          if (phase === 'seed') {
            active = { ...active, step: 'seed', stage: 'seed' };
            const popup = await context.newPage();
            await popup.goto(`chrome-extension://${expectedId}/popup.html`, { waitUntil: 'domcontentloaded' });
            await popup.locator('#settings-status[data-phase="ready"]').waitFor({ timeout: 15000 });
            const raw = await launched.worker.evaluate(() => chrome.storage.local.get(null));
            if (!isDeepStrictEqual(raw, {})) throw fail('transition-seed-not-empty');
            const seed = transitionSeed(assigned.caseId, options.nonce);
            await launched.worker.evaluate(value => chrome.storage.local.set(value), seed);
            if (!isDeepStrictEqual(await launched.worker.evaluate(() => chrome.storage.local.get(null)), seed)) throw fail('transition-seed-write');
            seeds.push({ caseId: assigned.caseId, raw: seed, extensionId: expectedId, writes: 1 });
          } else {
            const result = await runTransitionPhase({ ...launched, responses, caseId: assigned.caseId, phase,
              runNonce: options.nonce, expectedBrokerSource: entries.find(entry => entry.name === 'settings-broker.js').bytes.toString('utf8') });
            phases.push({ ...result, extensionId: expectedId, inventorySha256: beforeHash,
              manifestSha256: entries.find(entry => entry.name === 'manifest.json').sha256 });
          }
        } catch (error) {
          phaseError = error; await noticeFailure(error);
          if (context && !failureArtifacts) {
            failureArtifacts = true;
            try {
              const page = context.pages().at(-1);
              if (page) {
                const screenshot = await page.screenshot({ fullPage: false, timeout: 5000 });
                if (screenshot.length > 8388608) throw fail('transition-artifact-limit');
                await files.writeFile(`${options.artifact}/failure.png`, screenshot, { flag: 'wx' });
              }
              if (traced) {
                const trace = `${options.artifact}/trace.zip`;
                await timeout(() => context.tracing.stop({ path: awaitPath(files, trace) }), 10000, 'transition-trace-timeout');
                traced = false;
                if ((await files.lstat(trace)).size > 33554432) { await files.removeTree(trace); throw fail('transition-artifact-limit'); }
              }
            } catch (artifactError) { cleanupErrors.push({ code: artifactError?.code || 'transition-artifact-failed', caseId: assigned.caseId, phase }); }
          }
        } finally {
          if (context) {
            if (traced) {
              try { await timeout(() => context.tracing.stop(), 10000, 'transition-trace-timeout'); }
              catch (error) { cleanupErrors.push({ code: error?.code || 'transition-trace-failed', caseId: assigned.caseId, phase }); }
            }
            try {
              await timeout(async () => { for (const page of context.pages()) await page.close(); await context.close(); }, 10000, 'transition-close-timeout');
              closed = true; await send({ ...intent, type: 'close-success' });
            } catch (error) { cleanupErrors.push({ code: error?.code || 'transition-close-failed', caseId: assigned.caseId, phase }); }
          }
        }
        if (!closed) { active = { ...active, step: 'close', stage: 'close' }; throw phaseError || fail('cleanup-unconfirmed'); }
        active = { ...active, step: 'postclose', stage: 'inventory' };
        await checkInventory(extensionPath, entries);
        if (phaseError) throw phaseError;
        if (cleanupErrors.length) throw fail('transition-cleanup-failed');
      }
    }
  } catch (error) { if (!failure) await noticeFailure(error); }
  try { after = await sourceAttestation(files); if (source && !isDeepStrictEqual(source, after)) throw fail('transition-source-changed'); }
  catch (error) { if (!failure) await noticeFailure(error); else cleanupErrors.push({ code: error?.code || 'transition-source-changed', caseId: null, phase: null }); }
  await send({ type: 'result', nonce: options.nonce, result: { source, after, candidateInventory, seeds, phases, failure, cleanupErrors } });
}

// This path is below the freshly claimed artifact root; Playwright needs an absolute output path.
const awaitPath = (files, value) => path.join(files.root, ...value.split('/'));

const dependenciesDefault = {
  openRepository: () => openOwnedRoot(repositoryRoot),
  forkChild: () => fork(scriptPath, [], { detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true }),
  supervise: superviseTransitionChild,
  removeCandidate,
};

export async function runInstalledTransition({ runId, headed = false, control, dependencies = {} } = {}) {
  if (!/^[A-Za-z0-9]{1,64}$/.test(runId || '') || typeof headed !== 'boolean') throw fail('installed-e2e-args-invalid');
  if (control !== undefined && control !== 'storage-loss') throw fail('transition-control-invalid');
  const deps = { ...dependenciesDefault, ...dependencies }, files = await deps.openRepository();
  const nonce = randomBytes(16).toString('hex'), artifact = `output/playwright/installed-extension-transition-${runId}`;
  const claim = `output/playwright/installed-transition-claim-${runId}.lock`, candidateIds = [`B2${runId}A`, `B2${runId}B`];
  const roots = [], candidates = [], cleanupErrors = [];
  let claimed = false, artifactCreated = false, supervision, primary, child, report;
  try {
    await files.ensureDirectory('output/playwright');
    if (await files.lstat(artifact, { optional: true })) throw fail('transition-artifact-exists');
    await files.writeFile(claim, nonce, { flag: 'wx' }); claimed = true;
    await files.ensureDirectory(artifact); artifactCreated = true;
    for (const id of candidateIds) {
      const directory = `output/tool-audit/p02-candidate-${id}`;
      if (await files.lstat(directory, { optional: true })) throw fail('transition-candidate-exists');
      await files.ensureDirectory(directory); candidates.push(id);
    }
    for (const caseId of control ? ['valid-ui'] : TRANSITION_CASES) {
      roots.push({ caseId, root: relative(files, await files.makeTempDirectory('output/playwright/installed-transition-work-')) });
    }
    child = deps.forkChild();
    const pending = deps.supervise({ child, nonce, roots });
    child.send({ nonce, roots, candidateIds, artifact, runId, headed, control }, error => { if (error) child.emit('error', error); });
    supervision = await pending;
    primary = supervision.failure;
    const result = supervision.result;
    if (!result || !result.source || !isDeepStrictEqual(result.source, result.after)) primary ||= genericFailure(fail('transition-source-changed'));
    if (Array.isArray(result?.cleanupErrors)) cleanupErrors.push(...result.cleanupErrors);
    cleanupErrors.push(...supervision.cleanupErrors);
    if (control && primary && supervision.normalExit && !supervision.unconfirmedRoots.length && !cleanupErrors.length && matchesStorageLoss(primary, nonce)) {
      validateTransitionResult(result, nonce, control, supervision.launches);
      const old = result?.phases;
      if (old?.length !== 1 || old[0].caseId !== 'valid-ui' || old[0].phase !== 'old' || old[0].final?.raw?.settingsRevision !== 8) throw fail('transition-control-old-baseline');
      report = { ok: true, control, detected: primary, result }; primary = null;
    } else if (!primary) {
      if (control) throw fail('transition-control-unexpected-pass');
      validateTransitionResult(result, nonce, control, supervision.launches);
      report = { ok: true, result };
    }
  } catch (error) { primary ||= genericFailure(error); }
  finally {
    const uncertain = new Set(supervision?.unconfirmedRoots || (child && !supervision ? roots.map(value => value.root) : []));
    for (const assigned of roots) {
      if (uncertain.has(assigned.root) || (child && !supervision?.normalExit)) {
        cleanupErrors.push({ code: 'cleanup-unconfirmed', caseId: assigned.caseId, phase: null }); continue;
      }
      try { await files.removeTree(assigned.root); }
      catch (error) { cleanupErrors.push({ code: error?.code || 'transition-root-cleanup', caseId: assigned.caseId, phase: null }); }
    }
    for (const id of candidates) {
      if (child && !supervision?.normalExit) { cleanupErrors.push({ code: 'cleanup-unconfirmed', caseId: null, phase: null }); continue; }
      try { await deps.removeCandidate(id); }
      catch (error) { cleanupErrors.push({ code: error?.code || 'transition-candidate-cleanup', caseId: null, phase: null }); }
    }
    if (claimed) {
      try { await files.removeTree(claim); }
      catch (error) { cleanupErrors.push({ code: error?.code || 'transition-claim-cleanup', caseId: null, phase: null }); }
    }
  }
  report = { ...(report || {}), ...(supervision?.result ? { result: supervision.result } : {}), ok: !primary && cleanupErrors.length === 0, runId, ...(control ? { control } : {}),
    ...(primary ? { failure: primary } : {}), cleanupErrors: cleanupErrors.slice(0, 32),
    retainedRoots: roots.filter(value => supervision?.unconfirmedRoots.includes(value.root) || (child && !supervision?.normalExit)),
    limits: ['bundled-code-relaunch-not-native-update', 'no-platform-rollback', 'detached-browser-needs-close-ack'] };
  if (artifactCreated) {
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (Buffer.byteLength(text) > 1048576) throw fail('transition-artifact-limit');
    await files.writeFile(`${artifact}/summary.json`, text, { flag: 'wx' });
  }
  if (!report.ok) { const error = fail(primary?.code || 'transition-cleanup-failed'); error.failure = report.failure; error.report = report; throw error; }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  if (process.send) {
    process.once('message', options => {
      void executeChild(options).then(() => process.disconnect()).catch(error => {
        console.error(error?.code || error?.message); process.exitCode = 1; process.disconnect();
      });
    });
  } else {
    try {
      const args = process.argv.slice(2), controls = args.filter(value => value.startsWith('--control='));
      if (controls.length > 1 || (controls.length === 1 && controls[0] !== '--control=storage-loss')) throw fail('transition-control-invalid');
      const options = parseInstalledE2EArgs(args.filter(value => !value.startsWith('--control=')));
      const report = await runInstalledTransition({ ...options, ...(controls.length ? { control: 'storage-loss' } : {}) });
      console.log(JSON.stringify({ ok: report.ok, runId: report.runId, control: report.control, phases: report.result.phases.length }));
    } catch (error) { console.error(error?.code || error?.message); process.exitCode = 1; }
  }
}
