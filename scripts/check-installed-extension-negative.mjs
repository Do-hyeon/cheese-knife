import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBaseInstalledScenario, runInstalledExtensionE2E } from './check-installed-extension.mjs';
import { parseInstalledE2EArgs } from './extension-e2e/harness.mjs';
import { openOwnedRoot } from './owned-files.mjs';
import { removeCandidate, verifyCandidate } from './verify-candidate.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slash = value => value.split(path.sep).join('/');
const negativeError = (code, cause) => Object.assign(new Error(code, cause ? { cause } : undefined), { code });

const validateRunId = runId => {
  if (!/^[A-Za-z0-9]{1,64}$/.test(runId || '')) throw negativeError('installed-e2e-run-id-invalid');
  return runId;
};

const ownedRelative = (root, absolute) => {
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw negativeError('negative-candidate-path-invalid');
  }
  return slash(relative);
};

export function withoutMainContentScript(manifest) {
  const scripts = manifest?.content_scripts;
  const mainIndexes = Array.isArray(scripts)
    ? scripts.flatMap((script, index) => script?.world === 'MAIN' ? [index] : [])
    : [];
  if (mainIndexes.length !== 1) throw negativeError('negative-main-entry-count');
  const mainIndex = mainIndexes[0];
  return {
    ...structuredClone(manifest),
    content_scripts: scripts.filter((_script, index) => index !== mainIndex).map(script => structuredClone(script)),
  };
}

async function prepareNegativeCandidate(runId,{retainEvidence = false} = {}) {
  const files = await openOwnedRoot(repositoryRoot);
  const candidate = await verifyCandidate(runId,repositoryRoot,{retainEvidence});
  const negativeRelative = `output/playwright/installed-negative-package-${runId}`;
  let copied = false;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    if (retainEvidence) {
      if (!(await files.lstat(ownedRelative(files.root,candidate.root),{optional:true}))?.isDirectory() ||
        copied && !(await files.lstat(negativeRelative,{optional:true}))?.isDirectory()) throw negativeError('negative-evidence-missing');
      return;
    }
    if (copied) await files.removeTree(negativeRelative);
    await removeCandidate(runId);
  };
  try {
    await files.ensureDirectory('output/playwright');
    if (await files.lstat(negativeRelative, { optional: true })) throw negativeError('negative-candidate-exists');
    const sourceRelative = ownedRelative(files.root, candidate.dist);
    copied = true;
    const negativePath = await files.copyTree(sourceRelative, negativeRelative);
    const manifestRelative = `${negativeRelative}/manifest.json`;
    const manifest = JSON.parse(await files.readFile(manifestRelative, 'utf8'));
    const mutated = withoutMainContentScript(manifest);
    await files.writeFile(manifestRelative, `${JSON.stringify(mutated, null, 2)}\n`, 'utf8');
    return { candidate: { ...candidate, dist: negativePath }, cleanup,
      ...(retainEvidence?{evidence:{candidatePath:candidate.root,negativePath,retained:true}}:{}) };
  } catch (error) {
    try { await cleanup(); } catch (secondary) { throw Object.assign(negativeError('negative-preparation-incomplete',error),{secondaryErrors:[String(secondary?.message||secondary).slice(0,240)]}); }
    throw error;
  }
}

async function writeNegativeReport(report) {
  const files = await openOwnedRoot(repositoryRoot);
  const artifactRelative = `output/playwright/installed-extension-${report.runId}`;
  await files.ensureDirectory('output/playwright');
  await files.ensureDirectory(artifactRelative);
  await files.writeFile(`${artifactRelative}/negative-summary.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

const defaults = {
  prepareCandidate: prepareNegativeCandidate,
  runInstalled: runInstalledExtensionE2E,
  writeReport: writeNegativeReport,
};

export async function runInstalledExtensionNegative({ runId, headed = false, retainEvidence = false, dependencies = {} } = {}) {
  if (typeof retainEvidence !== 'boolean') throw negativeError('installed-e2e-retention-invalid');
  validateRunId(runId);
  const deps = { ...defaults, ...dependencies };
  const prepared = await deps.prepareCandidate(runId,{retainEvidence});
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await prepared.cleanup();
  };
  let observed;
  try {
    try {
      await deps.runInstalled({
        runId,
        headed,
        retainEvidence,
        dependencies: {
          verifyCandidate: async () => prepared.candidate,
          removeCandidate: cleanup,
          scenario: runBaseInstalledScenario,
        },
      });
      observed = negativeError('negative-control-unexpected-pass');
    } catch (error) {
      observed = error;
    }
  } finally {
    try { await cleanup(); } catch (error) { throw Object.assign(negativeError('negative-control-unexpected-failure',observed||error),{secondaryErrors:[String(error?.message||error).slice(0,240)]}); }
  }
  if (observed?.code !== 'main-runtime-missing' || observed?.secondaryErrors?.length) {
    if (observed?.code === 'negative-control-unexpected-pass') throw observed;
    throw negativeError('negative-control-unexpected-failure', observed);
  }
  const report = { ok: true, runId, observedFailure: observed.code,
    ...(retainEvidence?{evidence:{...prepared.evidence,...observed.evidence}}:{}) };
  await deps.writeReport(report);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseInstalledE2EArgs(process.argv.slice(2));
  if (options.qualification !== undefined) throw negativeError('installed-e2e-args-invalid');
  console.log(JSON.stringify(await runInstalledExtensionNegative(options), null, 2));
}
