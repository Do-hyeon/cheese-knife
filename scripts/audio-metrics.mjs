export {measureSignal,channelDifferenceRms,rmsEnvelope} from './audio-signal.mjs';

export function audioQualityFailures({ cases, transitions, stress, alignments } = {}) {
  if (!Array.isArray(cases) || !Array.isArray(transitions) || !Array.isArray(alignments) || !stress || !Array.isArray(stress.channels)) {
    return ['invalid-quality-report'];
  }
  const failures = [];
  let enabledSignals = 0;
  for (const [caseIndex, item] of cases.entries()) {
    if (!item?.enabled || item.stereo !== 'identical') continue;
    enabledSignals++;
    if (!Array.isArray(item.channels) || item.channels.length !== 2) failures.push(`case-${caseIndex}/enabled-signal-shape`);
    else for (const [channelIndex, channel] of item.channels.entries()) {
      if (!Number.isFinite(channel?.rms) || channel.rms < 1e-4) failures.push(`case-${caseIndex}/channel-${channelIndex}/enabled-signal`);
    }
  }
  if (!enabledSignals) failures.push('missing-enabled-signal-case');

  let enabledTransitions = 0;
  for (const item of transitions) {
    if (item?.kind !== 'enabled') continue;
    enabledTransitions++;
    const before = item.before?.channels?.at(0), change = item.change?.channels?.at(0), after = item.after?.channels?.at(0);
    const beforeRms = before?.envelope8ms?.min, changeRms = change?.envelope8ms?.min, afterRms = after?.envelope8ms?.min;
    if (![beforeRms, changeRms, afterRms].every(value => Number.isFinite(value) && value >= 1e-4)) {
      failures.push(`${item.frequency}Hz/${item.value ? 'on' : 'off'}/transition-signal`);
      continue;
    }
    const baselineRms = Math.min(beforeRms, afterRms);
    const baselineStep = Math.max(before.maxAdjacentStep, after.maxAdjacentStep);
    if (changeRms < baselineRms * 0.95) failures.push(`${item.frequency}Hz/${item.value ? 'on' : 'off'}/rms`);
    if (!Number.isFinite(change.maxAdjacentStep) || !Number.isFinite(baselineStep) || change.maxAdjacentStep > baselineStep + 1e-6) {
      failures.push(`${item.frequency}Hz/${item.value ? 'on' : 'off'}/step`);
    }
  }
  if (!enabledTransitions) failures.push('missing-enabled-transitions');

  if (stress.channels.length !== 2) failures.push('stress-signal-shape');
  for (const [channelIndex, channel] of stress.channels.entries()) {
    if (!Number.isFinite(channel?.rms) || channel.rms < 1e-4) failures.push(`stress-channel-${channelIndex}/signal`);
    if (!Number.isFinite(channel?.peak) || channel.peak < 0.97) failures.push(`stress-channel-${channelIndex}/stress-peak-low`);
    if (channel?.peak > 0.9801) failures.push(`stress-channel-${channelIndex}/peak=${channel.peak}`);
    if (channel?.overFullScaleSamples !== 0) failures.push(`stress-channel-${channelIndex}/overFullScaleSamples=${channel?.overFullScaleSamples}`);
  }

  if (!alignments.length) failures.push('missing-delay-alignments');
  for (const item of alignments) {
    const frames = [item?.expectedFrame, item?.dryFirst, item?.dryLast, item?.compressorFirst, item?.compressorLast];
    if (!Number.isFinite(item?.sampleRate) || item.sampleRate <= 0 ||
        !frames.every(value => Number.isInteger(value) && value >= 0) ||
        item.expectedFrame > 1023 || item.dryFirst !== item.expectedFrame || item.dryLast !== item.dryFirst ||
        item.compressorFirst !== item.expectedFrame || item.compressorLast !== item.compressorFirst) {
      failures.push(`${item?.sampleRate}/delay-alignment`);
    }
  }
  return failures;
}
