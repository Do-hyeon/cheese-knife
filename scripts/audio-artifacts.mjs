import crypto from 'node:crypto';
import path from 'node:path';
import { openOwnedRoot } from './owned-files.mjs';

export const AUDIO_ARTIFACT_FILES = Object.freeze([
  'config.js',
  'web/runtime.js',
  'web/audio.js',
  'web/player.js'
]);
export const AUDIO_COMPARISON_ABSOLUTE_TOLERANCE = 1e-7;
export const AUDIO_COMPARISON_RELATIVE_TOLERANCE = 1e-6;

const fail = code => { throw new Error(code); };

export function parseAudioQualityArgs(argv, cwd = process.cwd()) {
  let chrome = false;
  let root = path.resolve(cwd);
  let label = 'source';
  for (let index = 0; index < argv.length; index++) {
    const argument = argv.at(index);
    if (argument === '--chrome') {
      chrome = true;
      continue;
    }
    if (argument === '--root') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) fail('audio-root-missing');
      root = path.resolve(cwd, value);
      continue;
    }
    if (argument === '--label') {
      const value = argv[++index];
      if (!value || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) fail('audio-label-invalid');
      label = value;
      continue;
    }
    fail('audio-argument-invalid');
  }
  return { chrome, root, label };
}

export async function describeAudioArtifact(root, label) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(label)) fail('audio-label-invalid');
  const files = await openOwnedRoot(root);
  const descriptions = [];
  for (const relative of AUDIO_ARTIFACT_FILES) {
    const contents = await files.readFile(relative);
    descriptions.push({
      path: relative,
      sha256: crypto.createHash('sha256').update(contents).digest('hex')
    });
  }
  return { label, root: files.root, files: descriptions };
}

export function compareAudioArtifactReports(reports) {
  if (!Array.isArray(reports) || reports.length < 2) return ['artifact-report-count'];
  const failures = [];
  const baseline = reports[0];
  const baselineFiles = new Map((baseline?.artifact?.files || []).map(item => [item.path, item.sha256]));
  const baselineMeasurement = comparableMeasurement(baseline);
  for (const report of reports) {
    const label = report?.artifact?.label || 'unknown';
    if (!Array.isArray(report?.qualityFailures)) failures.push(`${label}/quality/missing`);
    else for (const failure of report.qualityFailures) failures.push(`${label}/quality/${failure}`);
    const files = new Map((report?.artifact?.files || []).map(item => [item.path, item.sha256]));
    for (const relative of AUDIO_ARTIFACT_FILES) {
      if (!baselineFiles.has(relative) || !files.has(relative) || files.get(relative) !== baselineFiles.get(relative)) {
        failures.push(`${label}/hash/${relative}`);
      }
    }
    if (report !== baseline) {
      const measurement = comparableMeasurement(report);
      compareMeasurement(baselineMeasurement.nodes, measurement.nodes, 'nodes', label, failures);
      compareMeasurement(baselineMeasurement.cases, measurement.cases, 'cases', label, failures);
      compareMeasurement(baselineMeasurement.transitions, measurement.transitions, 'transitions', label, failures);
      compareMeasurement(baselineMeasurement.alignments, measurement.alignments, 'alignments', label, failures);
      compareMeasurement(baselineMeasurement.stress, measurement.stress, 'stress', label, failures);
    }
  }
  return [...new Set(failures)];
}

function comparableMeasurement(report) {
  const steadyChannel = channel => channel && ({
    rms: channel.rms,
    peak: channel.peak,
    overFullScaleSamples: channel.overFullScaleSamples,
    maxAdjacentStep: channel.maxAdjacentStep,
    thdPercent: channel.thdPercent,
    envelope8ms: channel.envelope8ms
  });
  const transitionChannel = channel => channel && ({
    peak: channel.peak,
    overFullScaleSamples: channel.overFullScaleSamples,
    maxAdjacentStep: channel.maxAdjacentStep,
    envelope8ms: channel.envelope8ms
  });
  const window = value => value && ({
    sampleRate: value.sampleRate,
    windowSeconds: value.windowSeconds,
    channelDifferenceRms: value.channelDifferenceRms,
    channels: value.channels?.map(transitionChannel)
  });
  return {
    nodes: report?.nodes,
    cases: report?.cases?.map(item => ({
      frequency: item.frequency,
      inputAmplitude: item.inputAmplitude,
      gain: item.gain,
      enabled: item.enabled,
      stereo: item.stereo,
      bursts: item.bursts,
      sampleRate: item.sampleRate,
      windowSeconds: item.windowSeconds,
      channelDifferenceRms: item.channelDifferenceRms,
      channels: item.channels?.map(steadyChannel)
    })),
    transitions: report?.transitions?.map(item => ({
      frequency: item.frequency,
      kind: item.kind,
      value: item.value,
      before: window(item.before),
      change: window(item.change),
      after: window(item.after)
    })),
    alignments: report?.alignments,
    stress: report?.stress && ({
      profile: report.stress.profile,
      sampleRate: report.stress.sampleRate,
      windowSeconds: report.stress.windowSeconds,
      channelDifferenceRms: report.stress.channelDifferenceRms,
      channels: report.stress.channels?.map(steadyChannel)
    })
  };
}

function compareMeasurement(expected, actual, location, label, failures) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const tolerance = AUDIO_COMPARISON_ABSOLUTE_TOLERANCE +
      AUDIO_COMPARISON_RELATIVE_TOLERANCE * Math.max(Math.abs(expected), Math.abs(actual));
    if (!Number.isFinite(expected) || !Number.isFinite(actual) || Math.abs(expected - actual) > tolerance) {
      failures.push(`${label}/numeric/${location}`);
    }
    return;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
      failures.push(`${label}/numeric/${location}`);
      return;
    }
    for (let index = 0; index < expected.length; index++) {
      compareMeasurement(expected.at(index), actual.at(index), `${location}[${index}]`, label, failures);
    }
    return;
  }
  if (expected && typeof expected === 'object' || actual && typeof actual === 'object') {
    if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object') {
      failures.push(`${label}/numeric/${location}`);
      return;
    }
    const expectedEntries = Object.entries(expected).sort(([left], [right]) => left.localeCompare(right));
    const actualEntries = Object.entries(actual).sort(([left], [right]) => left.localeCompare(right));
    if (expectedEntries.length !== actualEntries.length) {
      failures.push(`${label}/numeric/${location}`);
      return;
    }
    for (let index = 0; index < expectedEntries.length; index++) {
      const expectedEntry = expectedEntries.at(index), actualEntry = actualEntries.at(index);
      if (expectedEntry.at(0) !== actualEntry.at(0)) {
        failures.push(`${label}/numeric/${location}`);
        continue;
      }
      compareMeasurement(expectedEntry.at(1), actualEntry.at(1), `${location}.${expectedEntry.at(0)}`, label, failures);
    }
    return;
  }
  if (expected !== actual) failures.push(`${label}/numeric/${location}`);
}
