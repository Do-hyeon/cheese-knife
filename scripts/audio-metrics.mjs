export function measureSignal(samples, sampleRate, toneHz = null) {
  if (!samples?.length) throw new Error('samples required');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('invalid sample rate');
  let sum = 0, squares = 0, peak = 0, overFullScaleSamples = 0, maxAdjacentStep = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples.at(i);
    if (!Number.isFinite(value)) throw new Error('non-finite audio sample');
    sum += value; squares += value * value; peak = Math.max(peak, Math.abs(value));
    if (Math.abs(value) > 1) overFullScaleSamples++;
    if (i) maxAdjacentStep = Math.max(maxAdjacentStep, Math.abs(value - samples.at(i - 1)));
  }
  const mean = sum / samples.length, rms = Math.sqrt(squares / samples.length);
  const result = { samples:samples.length, mean, rms, peak, peakDbfs:peak ? 20*Math.log10(peak) : null,
    rmsDbfs:rms ? 20*Math.log10(rms) : null, overFullScaleSamples, maxAdjacentStep,
    thdPercent:null, thdnPercent:null, fundamentalAmplitude:null, spectralReason:'' };
  if (toneHz == null) return result;
  if (!Number.isFinite(toneHz) || toneHz <= 0 || toneHz >= sampleRate/2) throw new Error('invalid tone frequency');
  const cycles = toneHz * samples.length / sampleRate;
  if (Math.abs(cycles - Math.round(cycles)) > 1e-6) return {...result,spectralReason:'non-coherent-window'};
  let fundamental = 0, harmonicPower = 0;
  for (let h = 1; h <= 10 && h*toneHz < sampleRate/2; h++) {
    let sin = 0, cos = 0;
    for (let i = 0; i < samples.length; i++) {
      const phase = 2*Math.PI*h*toneHz*i/sampleRate;
      const sample = samples.at(i);
      sin += sample*Math.sin(phase); cos += sample*Math.cos(phase);
    }
    const amplitudeSquared = 4*(sin*sin+cos*cos)/(samples.length*samples.length);
    if (h === 1) fundamental = Math.sqrt(amplitudeSquared); else harmonicPower += amplitudeSquared;
  }
  if (fundamental < 1e-9) return {...result,spectralReason:'tone-not-detectable'};
  return {...result,fundamentalAmplitude:fundamental,
    thdPercent:100*Math.sqrt(harmonicPower)/fundamental,
    thdnPercent:100*Math.sqrt(Math.max(0,2*(rms*rms-mean*mean)-fundamental*fundamental))/fundamental};
}

export function channelDifferenceRms(left, right) {
  if (!left?.length || left.length !== right?.length) throw new Error('equal nonempty channels required');
  let squares = 0;
  for (let i = 0; i < left.length; i++) {
    const leftSample = left.at(i), rightSample = right.at(i);
    if (!Number.isFinite(leftSample) || !Number.isFinite(rightSample)) throw new Error('non-finite audio sample');
    squares += (leftSample-rightSample)**2;
  }
  return Math.sqrt(squares/left.length);
}

export function rmsEnvelope(samples,sampleRate,windowMs=8) {
  const windowSamples=Math.round(sampleRate*windowMs/1000);
  if(windowSamples<1||samples.length<windowSamples)throw new Error('invalid envelope window');
  let squares=0,min=Infinity,max=0;
  for(let i=0;i<samples.length;i++){
    const sample=samples.at(i);
    if(!Number.isFinite(sample))throw new Error('non-finite audio sample');
    squares+=sample**2;
    if(i>=windowSamples)squares-=samples.at(i-windowSamples)**2;
    if(i>=windowSamples-1){const value=Math.sqrt(Math.max(0,squares/windowSamples));min=Math.min(min,value);max=Math.max(max,value);}
  }
  return {windowSamples,min,max};
}

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
