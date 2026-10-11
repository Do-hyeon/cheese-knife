import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { openOwnedRoot } from './owned-files.mjs';

const codedError = code => Object.assign(new Error(code), { code });
const INPUT_FILES = [
  'scripts/vendor-hls.mjs',
  'scripts/hls-hardening.mjs',
  'node_modules/hls.js/package.json',
  'node_modules/hls.js/dist/hls.light.min.js',
  'node_modules/hls.js/LICENSE',
];
const PROTECTED_FILES = [
  'scripts/hls-hardening.mjs',
  'scripts/vendor-hls.mjs',
  'vendor/hls.light.private.js',
  'vendor/hls.js.LICENSE',
  'THIRD_PARTY_NOTICES.md',
];
const VERIFICATION_FILES = [
  'scripts/hls-verification.mjs',
  'scripts/verify-hls-candidate.mjs',
  'scripts/owned-files.mjs',
  'tests/fixtures/hls-parser-child.cjs',
  'tests/fixtures/hls-mutation-child.cjs',
];
const DEFAULT_TEST_GROUPS = [
  { id: 'bounds', files: ['tests/hls-parser-bounds.test.cjs'] },
  { id: 'compatibility', files: ['tests/hls-compatibility.test.cjs'] },
  { id: 'negative-controls', files: ['tests/hls-hardening-negative-controls.test.cjs'] },
  { id: 'provenance', files: ['tests/hls-provenance.test.cjs'] },
];
const LIMITS = Object.freeze({
  parserHeapMiB: 192,
  parserTimeoutMs: 5000,
  parserOutputBytes: 64 * 1024,
  vmTimeoutMs: 250,
  aggregateTestTimeoutMs: 30000,
});
const PINNED = Object.freeze({
  package: 'hls.js',
  version: '1.6.16',
  originalSha256: '947b45be1392e39569d4aefc2cff9ff6ecbe6cc246cf67ab12ece0c41c24b793',
  licenseSha256: 'ca8773cf798c7ed997d4dd7c8e23c348699f8d5b7462636694cc14de6cda12db',
  hardeningRevision: 'parser-bounds-v2',
});
const TRANSFORM_ANCHORS = [
  ['selected-sample-parser', 'function ke(e,t){'],
  ['passthrough-run-parser', 'var v=function(e,t,r){for(var i={},a=me(e,["moof","traf"])'],
  ['skip-parser', 'case"SKIP":c.skippedSegments&&gr(c,P,l);var O=new Ht(x,c),F=O.decimalInteger("SKIPPED-SEGMENTS");if(L(F)){'],
  ['emsg-parser', 'var a=function(e){var t=e[0],r="",i="",a=0,n=0,s=0,o=0,l=0,u=0;'],
  ['id3-parser', 'function Jr(e){'],
];

export function validateHlsRunId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(value)) {
    throw codedError('hls-run-id-invalid');
  }
  return value;
}

export function hlsValidationPaths(repoRoot, runId) {
  if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)) {
    throw codedError('hls-repo-root-invalid');
  }
  const id = validateHlsRunId(runId);
  const absoluteRoot = path.resolve(repoRoot);
  const outputRoot = path.join(absoluteRoot, 'output', 'tool-audit', `hls-validation-${id}`);
  const generationOneRoot = path.join(outputRoot, 'generation-one');
  const generationTwoRoot = path.join(outputRoot, 'generation-two');
  return {
    outputRoot,
    generationOneRoot,
    generationTwoRoot,
    inspectedCandidateBundle: path.join(generationTwoRoot, 'vendor', 'hls.light.private.js'),
    reportPath: path.join(outputRoot, 'report.json')
  };
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function hashFiles(files, relativePaths) {
  const result = [];
  for (const file of relativePaths) {
    const bytes = await files.readFile(file);
    result.push({ path: file, sha256: sha256(bytes), bytes: bytes.length });
  }
  return result;
}

async function inventoryDirectory(files, relativeRoot) {
  const result = [];
  async function visit(folder) {
    const entries = await files.readdir(folder, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const child = `${folder}/${entry.name}`;
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) {
        const bytes = await files.readFile(child);
        result.push({ path: child, sha256: sha256(bytes), bytes: bytes.length });
      } else throw codedError('hls-inventory-entry-invalid');
    }
  }
  await visit(relativeRoot);
  return result;
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function commandResult(command, args, options) {
  const startedAt = Date.now();
  const child = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout,
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer,
  });
  return {
    command: [command, ...args],
    durationMs: Date.now() - startedAt,
    status: child.status,
    signal: child.signal ?? null,
    errorCode: child.error?.code ?? null,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
  };
}

function childEnvironment(extra = {}) {
  const environment = { ...process.env, ...extra };
  delete environment.NODE_TEST_CONTEXT;
  delete environment.NODE_TEST_REPORTER;
  delete environment.NODE_TEST_REPORTER_DESTINATION;
  return environment;
}

function shortCommand(result) {
  return {
    command: result.command,
    durationMs: result.durationMs,
    exitCode: result.status,
    signal: result.signal,
    errorCode: result.errorCode,
  };
}

function parseVendoringOutput(result) {
  if (result.errorCode === 'ETIMEDOUT') throw codedError('vendoring-timeout');
  if (result.errorCode === 'ENOBUFS') throw codedError('vendoring-output-overflow');
  if (result.errorCode || result.signal || result.status !== 0) throw codedError('vendoring-process-failed');
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    throw codedError('vendoring-json-invalid');
  }
  const projected = {
    version: parsed?.version,
    sha256: parsed?.sha256,
    licenseSha256: parsed?.licenseSha256,
    hardening: parsed?.hardening,
    hardenedSha256: parsed?.hardenedSha256,
    wrapper: parsed?.wrapper,
  };
  if (projected.version !== PINNED.version || projected.sha256 !== PINNED.originalSha256 || projected.licenseSha256 !== PINNED.licenseSha256 || projected.hardening !== PINNED.hardeningRevision || typeof projected.hardenedSha256 !== 'string') {
    throw codedError('vendoring-metadata-invalid');
  }
  return projected;
}

export function parseTapSummary(stdout) {
  const value = pattern => {
    const matches = [...stdout.matchAll(pattern)];
    return matches.length ? Number(matches.at(-1)[1]) : null;
  };
  const summary = {
    tests: value(/^# tests (\d+)$/gm),
    pass: value(/^# pass (\d+)$/gm),
    fail: value(/^# fail (\d+)$/gm),
    cancelled: value(/^# cancelled (\d+)$/gm),
    skipped: value(/^# skipped (\d+)$/gm),
    todo: value(/^# todo (\d+)$/gm),
  };
  return Object.values(summary).some(value => value === null) ? null : summary;
}

export function tapSummaryIsConsistent(summary) {
  if (!summary || Object.values(summary).some(value => !Number.isSafeInteger(value) || value < 0)) return false;
  return summary.tests === summary.pass + summary.fail + summary.cancelled + summary.skipped + summary.todo;
}

function gitValue(repoRoot, args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { windowsHide: true, encoding: 'utf8', timeout: 5000, maxBuffer: 16 * 1024 });
  return result.status === 0 ? result.stdout.trim() : null;
}

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1;
}

function safeTestGroups(value) {
  if (!Array.isArray(value)) throw codedError('test-groups-invalid');
  return value.map(group => {
    if (!group || typeof group.id !== 'string' || !group.id || !Array.isArray(group.files) || !group.files.length || group.files.some(file => typeof file !== 'string' || !file.startsWith('tests/') || file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..'))) {
      throw codedError('test-groups-invalid');
    }
    return { id: group.id, files: [...group.files] };
  });
}

export async function runHlsVerification(repoRoot, runId, options = {}) {
  const id = validateHlsRunId(runId);
  if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)) throw codedError('hls-repo-root-invalid');
  const absoluteRoot = path.resolve(repoRoot);
  const paths = hlsValidationPaths(absoluteRoot, id);
  const rootFiles = await openOwnedRoot(absoluteRoot);
  const runRelative = `output/tool-audit/hls-validation-${id}`;
  if (await rootFiles.lstat(runRelative, { optional: true })) throw codedError('hls-run-exists');
  await rootFiles.ensureDirectory(runRelative);
  const runFiles = await openOwnedRoot(paths.outputRoot);
  const findings = [];
  const errors = [];
  const configuredGroups = options.testGroups === undefined ? DEFAULT_TEST_GROUPS : options.testGroups;
  const testGroups = safeTestGroups(configuredGroups);
  const inputPaths = [...new Set([...INPUT_FILES, ...VERIFICATION_FILES, ...testGroups.flatMap(group => group.files)])].sort();
  let inputsBefore = [];
  let protectedBefore = [];
  let rootDistBefore = [];
  let inputsAfter = [];
  let protectedAfter = [];
  let rootDistAfter = [];
  const generations = [];
  const testResults = [];
  let candidate = null;
  let candidateBefore = null;
  let candidateAfter = null;
  const candidateRelative = `${runRelative}/generation-two/vendor/hls.light.private.js`;
  const report = {
    schemaVersion: 1,
    runId: id,
    status: 'incomplete',
    exitCode: 2,
    source: {
      root: absoluteRoot,
      branch: gitValue(absoluteRoot, ['branch', '--show-current']),
      commit: gitValue(absoluteRoot, ['rev-parse', 'HEAD']),
      node: process.version,
    },
    pinned: { ...PINNED },
    limits: { ...LIMITS },
    paths,
    anchors: [],
    generations,
    testGroups: testResults,
    candidate,
    findings,
    errors,
    snapshots: {
      inputsBefore,
      inputsAfter,
      inputsMatched: false,
      protectedBefore,
      protectedAfter,
      protectedMatched: false,
      rootDistBefore,
      rootDistAfter,
      rootDistMatched: false,
      candidateBefore,
      candidateAfter,
      candidateMatched: false,
    },
  };
  try {
    inputsBefore = await hashFiles(rootFiles, inputPaths);
    protectedBefore = await hashFiles(rootFiles, PROTECTED_FILES);
    rootDistBefore = await inventoryDirectory(rootFiles, 'dist');
    report.snapshots.inputsBefore = inputsBefore;
    report.snapshots.protectedBefore = protectedBefore;
    report.snapshots.rootDistBefore = rootDistBefore;
    const metadata = JSON.parse(await rootFiles.readFile('node_modules/hls.js/package.json', 'utf8'));
    if (metadata.name !== PINNED.package || metadata.version !== PINNED.version) findings.push({ code: 'package-version-mismatch' });
    const original = await rootFiles.readFile('node_modules/hls.js/dist/hls.light.min.js');
    const license = await rootFiles.readFile('node_modules/hls.js/LICENSE');
    if (sha256(original) !== PINNED.originalSha256) findings.push({ code: 'original-hash-mismatch' });
    if (sha256(license) !== PINNED.licenseSha256) findings.push({ code: 'license-hash-mismatch' });
    const originalText = original.toString('utf8');
    report.anchors = TRANSFORM_ANCHORS.map(([anchorId, needle]) => ({ id: anchorId, count: occurrenceCount(originalText, needle) }));
    if (report.anchors.some(anchor => anchor.count !== 1)) findings.push({ code: 'transform-anchor-count' });

    for (const [index, generation] of ['generation-one', 'generation-two'].entries()) {
      for (const file of INPUT_FILES) {
        const destination = `${runRelative}/${generation}/${file}`;
        await rootFiles.ensureDirectory(path.posix.dirname(destination));
        await rootFiles.copyFile(file, destination);
      }
      const generationRoot = index === 0 ? paths.generationOneRoot : paths.generationTwoRoot;
      const command = commandResult(process.execPath, ['scripts/vendor-hls.mjs'], {
        cwd: generationRoot,
        env: childEnvironment(),
        timeout: LIMITS.parserTimeoutMs,
        maxBuffer: LIMITS.parserOutputBytes,
      });
      const metadataResult = parseVendoringOutput(command);
      const generationFiles = await openOwnedRoot(generationRoot);
      const bundle = await generationFiles.readFile('vendor/hls.light.private.js');
      const licenseBytes = await generationFiles.readFile('vendor/hls.js.LICENSE');
      generations.push({
        id: generation,
        root: generationRoot,
        bundlePath: path.join(generationRoot, 'vendor/hls.light.private.js'),
        bundleSha256: sha256(bundle),
        licenseSha256: sha256(licenseBytes),
        metadata: metadataResult,
        process: shortCommand(command),
      });
    }

    if (generations[0].bundleSha256 !== generations[1].bundleSha256) findings.push({ code: 'generation-bytes-differ' });
    const protectedCandidate = protectedBefore.find(file => file.path === 'vendor/hls.light.private.js');
    if (!protectedCandidate || generations[1].bundleSha256 !== protectedCandidate.sha256) findings.push({ code: 'protected-candidate-differs' });
    candidate = { path: paths.inspectedCandidateBundle, sha256: generations[1].bundleSha256 };
    report.candidate = candidate;
    candidateBefore = (await hashFiles(rootFiles, [candidateRelative]))[0];
    report.snapshots.candidateBefore = candidateBefore;

    if (!testGroups.length) throw codedError('test-groups-empty');
    for (const group of testGroups) {
      const command = commandResult(process.execPath, ['--max-old-space-size=192', '--test', '--test-reporter=tap', ...group.files], {
        cwd: absoluteRoot,
        env: childEnvironment({ KNIFE_HLS_TEST_BUNDLE: paths.inspectedCandidateBundle, KNIFE_HLS_EXPECTED_BUNDLE_SHA256: generations[1].bundleSha256 }),
        timeout: LIMITS.aggregateTestTimeoutMs,
        maxBuffer: LIMITS.parserOutputBytes,
      });
      if (command.errorCode === 'ETIMEDOUT') throw codedError('test-group-timeout');
      if (command.errorCode === 'ENOBUFS') throw codedError('test-group-output-overflow');
      if (command.errorCode || command.signal) throw codedError('test-group-crash');
      const infrastructure = `${command.stdout}\n${command.stderr}`.match(/KNIFE_HLS_INFRA:([A-Za-z0-9-]+)/);
      if (infrastructure) throw codedError(infrastructure[1]);
      const summary = parseTapSummary(command.stdout);
      if (!summary) throw codedError('test-group-summary-invalid');
      if (summary.tests === 0) throw codedError('test-group-empty');
      if (!tapSummaryIsConsistent(summary)) throw codedError('test-group-summary-inconsistent');
      const groupStatus = command.status === 0 && summary.pass === summary.tests && summary.fail === 0 && summary.cancelled === 0 && summary.skipped === 0 && summary.todo === 0 ? 'pass' : 'findings';
      testResults.push({
        id: group.id,
        files: group.files,
        bundle: paths.inspectedCandidateBundle,
        status: groupStatus,
        ...summary,
        process: shortCommand(command),
      });
      if (groupStatus !== 'pass') findings.push({ code: 'test-group-findings', group: group.id });
    }
  } catch (error) {
    errors.push({ code: typeof error?.code === 'string' ? error.code : 'verification-exception' });
  }

  try {
    inputsAfter = await hashFiles(rootFiles, inputPaths);
    protectedAfter = await hashFiles(rootFiles, PROTECTED_FILES);
    rootDistAfter = await inventoryDirectory(rootFiles, 'dist');
    if (candidateBefore) candidateAfter = (await hashFiles(rootFiles, [candidateRelative]))[0];
    report.snapshots.inputsAfter = inputsAfter;
    report.snapshots.protectedAfter = protectedAfter;
    report.snapshots.rootDistAfter = rootDistAfter;
    report.snapshots.candidateAfter = candidateAfter;
    report.snapshots.inputsMatched = sameSnapshot(inputsBefore, inputsAfter);
    report.snapshots.protectedMatched = sameSnapshot(protectedBefore, protectedAfter);
    report.snapshots.rootDistMatched = sameSnapshot(rootDistBefore, rootDistAfter);
    report.snapshots.candidateMatched = candidateBefore !== null && sameSnapshot(candidateBefore, candidateAfter);
    if (!report.snapshots.inputsMatched && !errors.some(error => error.code === 'input-snapshot-changed')) errors.push({ code: 'input-snapshot-changed' });
    if (!report.snapshots.protectedMatched && !errors.some(error => error.code === 'protected-snapshot-changed')) errors.push({ code: 'protected-snapshot-changed' });
    if (!report.snapshots.rootDistMatched && !errors.some(error => error.code === 'root-dist-snapshot-changed')) errors.push({ code: 'root-dist-snapshot-changed' });
    if (candidateBefore && !report.snapshots.candidateMatched && !errors.some(error => error.code === 'candidate-snapshot-changed')) errors.push({ code: 'candidate-snapshot-changed' });
  } catch {
    errors.push({ code: 'final-snapshot-failed' });
  }

  if (errors.length) {
    report.status = 'incomplete';
    report.exitCode = 2;
  } else if (findings.length) {
    report.status = 'complete-findings';
    report.exitCode = 1;
  } else {
    report.status = 'complete-pass';
    report.exitCode = 0;
  }
  await runFiles.writeFile('report.json', JSON.stringify(report, null, 2) + '\n');
  return report;
}
