import crypto from 'node:crypto';

/** @typedef {'media-profiles.js'|'config.js'|'web/runtime.js'|'web/site-adapter.js'|'web/audio.js'|'web/player.js'} AudioArtifactPath */
/** @typedef {{readonly root:string,readonly readFile:(relative:AudioArtifactPath)=>Promise<Uint8Array>}} AudioArtifactReader */
/** @typedef {{path:AudioArtifactPath,sha256:string}} AudioArtifactFile */
/** @typedef {{label:string,root:string,files:readonly AudioArtifactFile[]}} AudioArtifactDescription */
/** @typedef {number|string|boolean|null|undefined|readonly ComparableValue[]|{readonly[key:string]:ComparableValue}} ComparableValue */
/** @template T @typedef {{[K in keyof T]?:T[K]|undefined}} OptionalFields */
/** @typedef {OptionalFields<import('./audio-signal.mjs').RmsEnvelope>&{readonly[key:string]:ComparableValue}} ComparisonEnvelope */
/** @typedef {OptionalFields<Pick<import('./audio-signal.mjs').ChannelMeasurement,'rms'|'peak'|'overFullScaleSamples'|'maxAdjacentStep'|'thdPercent'>>&OptionalFields<{envelope8ms:ComparisonEnvelope|null}>} ComparisonChannel */
/** @typedef {OptionalFields<Pick<import('./audio-signal.mjs').CaptureSummary,'sampleRate'|'windowSeconds'|'channelDifferenceRms'>>&OptionalFields<{channels:readonly(ComparisonChannel|null|undefined)[]|null}>} ComparisonWindow */
/** @typedef {ComparisonWindow&OptionalFields<Pick<import('./audio-metrics.mjs').QualityCase,'frequency'|'inputAmplitude'|'gain'|'enabled'|'stereo'|'bursts'>>} ComparisonCase */
/** @typedef {OptionalFields<Pick<import('./audio-metrics.mjs').QualityTransition,'frequency'|'kind'|'value'>>&OptionalFields<{before:ComparisonWindow|null,change:ComparisonWindow|null,after:ComparisonWindow|null}>} ComparisonTransition */
/** @typedef {OptionalFields<import('./audio-metrics.mjs').DelayAlignment>&{readonly[key:string]:ComparableValue}} ComparisonAlignment */
/** @typedef {ComparisonWindow&OptionalFields<{profile:string}>} ComparisonStress */
/** @typedef {OptionalFields<{path:string,sha256:string}>} ComparisonFile */
/** @typedef {OptionalFields<{label:string,root:string,files:readonly ComparisonFile[]|null}>} ComparisonArtifact */
/** @typedef {OptionalFields<{artifact:ComparisonArtifact|null,qualityFailures:readonly string[]|null,nodes:ComparableValue,cases:readonly ComparisonCase[]|null,transitions:readonly ComparisonTransition[]|null,alignments:readonly(ComparisonAlignment|null|undefined)[]|null,stress:ComparisonStress|null}>} AudioComparisonReport */
/** @typedef {{nodes:ComparableValue,cases:ComparableValue,transitions:ComparableValue,alignments:ComparableValue,stress:ComparableValue}} ComparableMeasurement */
/** @typedef {[string,ComparableValue]} ComparableEntry */

/** @type {readonly AudioArtifactPath[]} */
export const AUDIO_ARTIFACT_FILES = Object.freeze([
  'media-profiles.js',
  'config.js',
  'web/runtime.js',
  'web/site-adapter.js',
  'web/audio.js',
  'web/player.js'
]);
export const AUDIO_COMPARISON_ABSOLUTE_TOLERANCE = 1e-7;
export const AUDIO_COMPARISON_RELATIVE_TOLERANCE = 1e-6;

/** @param {AudioArtifactReader} files @param {string} label @returns {Promise<AudioArtifactDescription>} */
export async function describeAudioArtifactFiles(files, label) {
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

/** @param {readonly(AudioComparisonReport|null|undefined)[]} [reports] @returns {string[]} */
export function compareAudioArtifactReports(reports) {
  if (!Array.isArray(reports) || reports.length < 2) return ['artifact-report-count'];
  const failures = [];
  const baseline = /** @type {AudioComparisonReport|null|undefined} */ (reports[0]);
  const baselineFiles = new Map((baseline?.artifact?.files || []).map(item => [item.path, item.sha256]));
  const baselineMeasurement = comparableMeasurement(baseline);
  for (const report of /** @type {readonly(AudioComparisonReport|null|undefined)[]} */ (reports)) {
    const label = report?.artifact?.label || 'unknown';
    if (!Array.isArray(report?.qualityFailures)) failures.push(`${label}/quality/missing`);
    else for (const failure of /** @type {readonly string[]} */ (report.qualityFailures)) failures.push(`${label}/quality/${failure}`);
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

/** @param {AudioComparisonReport|null|undefined} report @returns {ComparableMeasurement} */
function comparableMeasurement(report) {
  /** @param {ComparisonChannel|null|undefined} channel */
  const steadyChannel = channel => channel && ({
    rms: channel.rms,
    peak: channel.peak,
    overFullScaleSamples: channel.overFullScaleSamples,
    maxAdjacentStep: channel.maxAdjacentStep,
    thdPercent: channel.thdPercent,
    envelope8ms: channel.envelope8ms
  });
  /** @param {ComparisonChannel|null|undefined} channel */
  const transitionChannel = channel => channel && ({
    peak: channel.peak,
    overFullScaleSamples: channel.overFullScaleSamples,
    maxAdjacentStep: channel.maxAdjacentStep,
    envelope8ms: channel.envelope8ms
  });
  /** @param {ComparisonWindow|null|undefined} value */
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

/** @param {ComparableValue} expected @param {ComparableValue} actual @param {string} location @param {string} label @param {string[]} failures */
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
      compareMeasurement((/** @type {readonly ComparableValue[]} */ (expected)).at(index), (/** @type {readonly ComparableValue[]} */ (actual)).at(index), `${location}[${index}]`, label, failures);
    }
    return;
  }
  if (expected && typeof expected === 'object' || actual && typeof actual === 'object') {
    if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object') {
      failures.push(`${label}/numeric/${location}`);
      return;
    }
    const expectedEntries = /** @type {ComparableEntry[]} */ (Object.entries(expected).sort(([left], [right]) => left.localeCompare(right)));
    const actualEntries = /** @type {ComparableEntry[]} */ (Object.entries(actual).sort(([left], [right]) => left.localeCompare(right)));
    if (expectedEntries.length !== actualEntries.length) {
      failures.push(`${label}/numeric/${location}`);
      return;
    }
    for (let index = 0; index < expectedEntries.length; index++) {
      const expectedEntry = /** @type {ComparableEntry} */ (expectedEntries.at(index)), actualEntry = /** @type {ComparableEntry} */ (actualEntries.at(index));
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
