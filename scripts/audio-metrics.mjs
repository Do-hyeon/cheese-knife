export {measureSignal,channelDifferenceRms,rmsEnvelope} from './audio-signal.mjs';

/** @typedef {import('./audio-signal.mjs').CaptureSummary} CaptureSummary */
/** @typedef {CaptureSummary & {frequency:number,inputAmplitude:number,gain:number,enabled:boolean,stereo:'identical'|'left-only',bursts:boolean}} QualityCase */
/** @typedef {{frequency:number,before:CaptureSummary,change:CaptureSummary,after:CaptureSummary} & ({kind:'enabled',value:boolean}|{kind:'gain',value:number})} QualityTransition */
/** @typedef {{sampleRate:number,expectedFrame:number,dryFirst:number,dryLast:number,compressorFirst:number,compressorLast:number}} DelayAlignment */
/** @typedef {{cases:readonly QualityCase[],transitions:readonly QualityTransition[],stress:CaptureSummary & {profile:string},alignments:readonly DelayAlignment[]}} QualityReport */
/** @typedef {{rms?:number,peak?:number,maxAdjacentStep?:number,overFullScaleSamples?:number,envelope8ms?:{min?:number}|null}} QualityGateChannel */
/** @typedef {readonly (QualityGateChannel|null|undefined)[]} QualityGateChannels */
/** @typedef {{channels?:QualityGateChannels|null}} QualityGateCapture */
/** @typedef {QualityGateCapture & {enabled?:boolean,stereo?:string}} QualityGateCase */
/** @typedef {{frequency?:number,kind?:string,value?:number|boolean,before?:QualityGateCapture|null,change?:QualityGateCapture|null,after?:QualityGateCapture|null}} QualityGateTransition */
/** @typedef {{cases?:readonly (QualityGateCase|null|undefined)[]|null,transitions?:readonly (QualityGateTransition|null|undefined)[]|null,stress?:QualityGateCapture|null,alignments?:readonly (Partial<DelayAlignment>|null|undefined)[]|null}} QualityGateInput */

/** @param {QualityGateInput} [input] @returns {string[]} */
export function audioQualityFailures({ cases, transitions, stress, alignments } = {}) {
  if (!Array.isArray(cases) || !Array.isArray(transitions) || !Array.isArray(alignments) || !stress || !Array.isArray(stress.channels)) {
    return ['invalid-quality-report'];
  }
  const failures = [];
  let enabledSignals = 0;
  for (const [caseIndex, item] of (/** @type {NonNullable<QualityGateInput['cases']>} */ (cases)).entries()) {
    if (!item?.enabled || item.stereo !== 'identical') continue;
    enabledSignals++;
    if (!Array.isArray(item.channels) || item.channels.length !== 2) failures.push(`case-${caseIndex}/enabled-signal-shape`);
    else for (const [channelIndex, channel] of (/** @type {QualityGateChannels} */ (item.channels)).entries()) {
      if (!Number.isFinite(channel?.rms) || (/** @type {{rms:number}} */ (channel)).rms < 1e-4) failures.push(`case-${caseIndex}/channel-${channelIndex}/enabled-signal`);
    }
  }
  if (!enabledSignals) failures.push('missing-enabled-signal-case');

  let enabledTransitions = 0;
  for (const item of /** @type {NonNullable<QualityGateInput['transitions']>} */ (transitions)) {
    if (item?.kind !== 'enabled') continue;
    enabledTransitions++;
    const before = item.before?.channels?.at(0), change = item.change?.channels?.at(0), after = item.after?.channels?.at(0);
    const beforeRms = before?.envelope8ms?.min, changeRms = change?.envelope8ms?.min, afterRms = after?.envelope8ms?.min;
    if (![beforeRms, changeRms, afterRms].every(value => Number.isFinite(value) && /** @type {number} */ (value) >= 1e-4)) {
      failures.push(`${item.frequency}Hz/${item.value ? 'on' : 'off'}/transition-signal`);
      continue;
    }
    const baselineRms = Math.min(/** @type {number} */ (beforeRms), /** @type {number} */ (afterRms));
    // Preserve native optional-value coercion; missing steps still become NaN.
    const baselineStep = (/** @type {(...values:(number|undefined)[])=>number} */ (Math.max))(
      (/** @type {QualityGateChannel} */ (before)).maxAdjacentStep, (/** @type {QualityGateChannel} */ (after)).maxAdjacentStep);
    if (/** @type {number} */ (changeRms) < baselineRms * 0.95) failures.push(`${item.frequency}Hz/${item.value ? 'on' : 'off'}/rms`);
    if (!Number.isFinite((/** @type {QualityGateChannel} */ (change)).maxAdjacentStep) || !Number.isFinite(baselineStep) || (/** @type {{maxAdjacentStep:number}} */ (change)).maxAdjacentStep > baselineStep + 1e-6) {
      failures.push(`${item.frequency}Hz/${item.value ? 'on' : 'off'}/step`);
    }
  }
  if (!enabledTransitions) failures.push('missing-enabled-transitions');

  if (stress.channels.length !== 2) failures.push('stress-signal-shape');
  for (const [channelIndex, channel] of (/** @type {QualityGateChannels} */ (stress.channels)).entries()) {
    if (!Number.isFinite(channel?.rms) || (/** @type {{rms:number}} */ (channel)).rms < 1e-4) failures.push(`stress-channel-${channelIndex}/signal`);
    if (!Number.isFinite(channel?.peak) || (/** @type {{peak:number}} */ (channel)).peak < 0.97) failures.push(`stress-channel-${channelIndex}/stress-peak-low`);
    const peak = channel?.peak;
    if (peak !== undefined && peak > 0.9801) failures.push(`stress-channel-${channelIndex}/peak=${(/** @type {QualityGateChannel} */ (channel)).peak}`);
    if (channel?.overFullScaleSamples !== 0) failures.push(`stress-channel-${channelIndex}/overFullScaleSamples=${channel?.overFullScaleSamples}`);
  }

  if (!alignments.length) failures.push('missing-delay-alignments');
  for (const item of /** @type {NonNullable<QualityGateInput['alignments']>} */ (alignments)) {
    const frames = [item?.expectedFrame, item?.dryFirst, item?.dryLast, item?.compressorFirst, item?.compressorLast];
    if (!Number.isFinite(item?.sampleRate) || (/** @type {{sampleRate:number}} */ (item)).sampleRate <= 0 ||
        !frames.every(value => Number.isInteger(value) && /** @type {number} */ (value) >= 0) ||
        (/** @type {DelayAlignment} */ (item)).expectedFrame > 1023 ||
        (/** @type {DelayAlignment} */ (item)).dryFirst !== (/** @type {DelayAlignment} */ (item)).expectedFrame ||
        (/** @type {DelayAlignment} */ (item)).dryLast !== (/** @type {DelayAlignment} */ (item)).dryFirst ||
        (/** @type {DelayAlignment} */ (item)).compressorFirst !== (/** @type {DelayAlignment} */ (item)).expectedFrame ||
        (/** @type {DelayAlignment} */ (item)).compressorLast !== (/** @type {DelayAlignment} */ (item)).compressorFirst) {
      failures.push(`${item?.sampleRate}/delay-alignment`);
    }
  }
  return failures;
}

/** @type {(report:QualityReport)=>string[]} */
export const audioQualityReportFailures = audioQualityFailures;
