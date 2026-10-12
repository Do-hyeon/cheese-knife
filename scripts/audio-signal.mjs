/** @typedef {readonly number[] | Float32Array | Float64Array} Samples */
/**
 * @typedef {object} SignalMeasurement
 * @property {number} samples
 * @property {number} mean
 * @property {number} rms
 * @property {number} peak
 * @property {number|null} peakDbfs
 * @property {number|null} rmsDbfs
 * @property {number} overFullScaleSamples
 * @property {number} maxAdjacentStep
 * @property {number|null} thdPercent
 * @property {number|null} thdnPercent
 * @property {number|null} fundamentalAmplitude
 * @property {''|'non-coherent-window'|'tone-not-detectable'} spectralReason
 */
/** @typedef {{windowSamples:number,min:number,max:number}} RmsEnvelope */
/** @typedef {SignalMeasurement & {envelope8ms:RmsEnvelope}} ChannelMeasurement */
/** @typedef {{rate:number,start:number,end:number,channels:readonly [Samples,Samples]}} CaptureWindow */
/** @typedef {{sampleRate:number,windowSeconds:number,channels:readonly [ChannelMeasurement,ChannelMeasurement],channelDifferenceRms:number}} CaptureSummary */

/** @param {Samples} samples @param {number} sampleRate @param {number|null} [toneHz] @returns {SignalMeasurement} */
export function measureSignal(samples, sampleRate, toneHz = null) {
  if (!samples?.length) throw new Error('samples required');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('invalid sample rate');
  let sum = 0, squares = 0, peak = 0, overFullScaleSamples = 0, maxAdjacentStep = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples.at(i);
    if (value === undefined || !Number.isFinite(value)) throw new Error('non-finite audio sample');
    sum += value; squares += value * value; peak = Math.max(peak, Math.abs(value));
    if (Math.abs(value) > 1) overFullScaleSamples++;
    // The preceding index in this owned buffer already passed the finite check.
    if (i) maxAdjacentStep = Math.max(maxAdjacentStep, Math.abs(value - /** @type {number} */ (samples.at(i - 1))));
  }
  const mean = sum / samples.length, rms = Math.sqrt(squares / samples.length);
  /** @type {SignalMeasurement} */
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
      // The first pass checked every index; re-read without changing arithmetic.
      const sample = /** @type {number} */ (samples.at(i));
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

/** @param {Samples} left @param {Samples} right @returns {number} */
export function channelDifferenceRms(left, right) {
  if (!left?.length || left.length !== right?.length) throw new Error('equal nonempty channels required');
  let squares = 0;
  for (let i = 0; i < left.length; i++) {
    const leftSample = left.at(i), rightSample = right.at(i);
    if (leftSample === undefined || rightSample === undefined || !Number.isFinite(leftSample) || !Number.isFinite(rightSample)) throw new Error('non-finite audio sample');
    squares += (leftSample-rightSample)**2;
  }
  return Math.sqrt(squares/left.length);
}

/** @param {Samples} samples @param {number} sampleRate @param {number} [windowMs] @returns {RmsEnvelope} */
export function rmsEnvelope(samples,sampleRate,windowMs=8) {
  const windowSamples=Math.round(sampleRate*windowMs/1000);
  if(windowSamples<1||samples.length<windowSamples)throw new Error('invalid envelope window');
  let squares=0,min=Infinity,max=0;
  for(let i=0;i<samples.length;i++){
    const sample=samples.at(i);
    if(sample === undefined || !Number.isFinite(sample))throw new Error('non-finite audio sample');
    squares+=sample**2;
    // This trailing index already passed the finite check in the same owned buffer.
    if(i>=windowSamples)squares-=(/** @type {number} */ (samples.at(i-windowSamples)))**2;
    if(i>=windowSamples-1){const value=Math.sqrt(Math.max(0,squares/windowSamples));min=Math.min(min,value);max=Math.max(max,value);}
  }
  return {windowSamples,min,max};
}

/** @param {CaptureWindow} data @param {number|null} [frequency] @returns {CaptureSummary} */
export function summarizeCapture(data,frequency) {
  return {sampleRate:data.rate,windowSeconds:(data.end-data.start)/data.rate,
    // map preserves length and order of the owned two-channel capture tuple.
    channels:/** @type {[ChannelMeasurement,ChannelMeasurement]} */ (data.channels.map(channel=>({...measureSignal(channel,data.rate,frequency),envelope8ms:rmsEnvelope(channel,data.rate)}))),
    channelDifferenceRms:channelDifferenceRms(...data.channels)};
}
