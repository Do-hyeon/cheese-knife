import {isDeepStrictEqual} from 'node:util';
import {PACKAGED_NORMALIZER_SIGNAL_CASES} from './audio-l1-normalizer-oracle.mjs';
import {validateProcessingCapture} from './audio-processing-metrics.mjs';
/** @typedef {import('./audio-l1-normalizer-oracle.mjs').NormalizerSignalSpec} SignalSpec */
/** @typedef {{summary:()=>{sampleRate:number,start:number|null,end:number|null,bytes:number,cap:number},window:(a:number,b:number,stream?:number)=>import('./audio-signal.mjs').CaptureWindow}} Archive */
/** @param {string} code @returns {never} */
function fail(code){throw Error('audio-normalizer-signal-'+code);}
/** @param {SignalSpec} s @param {number} n */
function canonical(s,n){
  if(s.pattern==='silence'||s.pattern==='tone-silence'&&n>=8*s.sampleRate)return 0;
  const amplitude=Math.SQRT2*10**(s.inputDbfs/20);
  if(s.pattern==='noise')return Math.fround(amplitude*Math.sin(n*123.4567)*Math.sin(n*765.4321));
  if(s.pattern==='bursts'&&(n+Math.round(s.sampleRate*.1*s.phase/(2*Math.PI)))%(s.sampleRate/10)>=s.sampleRate/50)return 0;
  return Math.fround(amplitude*Math.sin(2*Math.PI*1000*n/s.sampleRate+s.phase));
}
/** One consistent numeric Float32 offset; signed zero carries no signal identity.
 * @param {Float32Array} observed @param {SignalSpec} spec */
function offsetFor(observed,spec){
  if(spec.pattern==='silence'){if(observed.some(v=>v!==0))fail('source-identity');return null;}
  const prefix=new Int32Array(observed.length);
  for(let i=1,j=0;i<observed.length;i++){while(j&&observed[i]!==observed[j])j=Number(prefix[j-1]);if(observed[i]===observed[j])j++;prefix[i]=j;}
  for(let n=0,j=0;n<90*spec.sampleRate;n++){
    const value=canonical(spec,n);while(j&&value!==observed[j])j=Number(prefix[j-1]);if(value===observed[j])j++;
    if(j===observed.length)return n-observed.length+1;
  }
  return fail('source-identity');
}
/** Exact same-rate source identity is a formation witness, never a physical frame-origin certificate.
 * @param {Archive} archive @param {SignalSpec} spec @param {number} identityStart */
export function createNormalizerSignalSource(archive,spec,identityStart){
  const original=PACKAGED_NORMALIZER_SIGNAL_CASES.find(s=>isDeepStrictEqual(s,spec));if(!original)fail('original-spec');spec=original;
  const s=archive.summary(),rate=spec.sampleRate;
  if(s.sampleRate!==rate||s.start===null||s.end===null||!Number.isSafeInteger(identityStart)||identityStart<s.start||identityStart>=s.end||s.end-s.start>20*rate||s.cap!==96*1024*1024||s.bytes>s.cap)fail('source-coverage');
  const start=s.start,end=s.end,values=new Float32Array(end-start);
  for(let a=start;a<end;a+=rate){
    const b=Math.min(a+rate,end),w=validateProcessingCapture(archive.window(a,b,1));if(w.rate!==rate||w.start!==a||w.end!==b)fail('source-window');
    const l=/** @type {import('./audio-signal.mjs').Samples} */(w.channels[0]),r=/** @type {import('./audio-signal.mjs').Samples} */(w.channels[1]);
    for(let i=0;i<b-a;i++){const value=Number(l[i]);if(value!==Math.fround(value)||value!==r[i])fail('source-identity');values[a-start+i]=value;}
  }
  const wavOffset=offsetFor(values.subarray(identityStart-start),spec),powerPrefix=new Float64Array(values.length+1);
  for(let n=0;n<values.length;n++)powerPrefix[n+1]=Number(powerPrefix[n])+Number(values[n])**2;
  const fftSize=2**Math.ceil(Math.log2(rate*.25)),delayFrames=rate===44100?264:rate===48000?288:576;
  return {
    report:{status:'EXACT_FLOAT32_COMPATIBILITY',start:identityStart,end,wavOffset,channels:2,pcmRateProven:false,absolutePhaseProven:false,frameOrigin:'UNPROVEN',limits:spec.pattern==='silence'?'silence has no unique offset or PCM rate':spec.pattern==='noise'?'noise formula encodes neither Fs nor phase/frequency':'one consistent offset; physical origin and unique periodic offset unproven'},
    /** Candidate bounds come from read clocks and a possible in-progress quantum, not a power fit.
     * @param {{index:number,time:number,size:number}} attempt @param {{index:number,time:number,size:number,power:number}} read @param {boolean} required */
    fft(attempt,read,required){
      const before=Math.round(attempt.time*rate),after=Math.round(read.time*rate),last=after+128,count=(last-before)/128+1;
      if(![before,after].every(n=>Number.isSafeInteger(n)&&n>=0&&n%128===0)||attempt.time!==before/rate||read.time!==after/rate||after<before||count>2000||attempt.index!==read.index||![0,1].includes(read.index)||attempt.size!==fftSize||read.size!==fftSize||!Number.isFinite(read.power)||read.power<0)fail('fft-read-clock');
      if(before-delayFrames-fftSize<start||last-delayFrames>end){if(required)fail('fft-history');return {status:'UNUSED_HISTORY',candidateCount:count,delayFrames,endpointProven:false};}
      let minPower=Infinity,maxPower=0,matchedCount=0,firstMatchedEndpoint=/** @type {number|null} */(null);
      for(let e=before;e<=last;e+=128){
        const expected=(Number(powerPrefix[e-delayFrames-start])-Number(powerPrefix[e-delayFrames-fftSize-start]))/fftSize;
        minPower=Math.min(minPower,expected);maxPower=Math.max(maxPower,expected);
        const matched=expected<=1e-9?read.power<=1e-9:read.power>0&&Math.abs(10*Math.log10(read.power/expected))<=.05;
        if(matched){matchedCount++;firstMatchedEndpoint??=e;}
      }
      return {status:matchedCount?'COMPATIBLE':'MISMATCH',before,last,candidateCount:count,delayFrames,minPower,maxPower,matchedCount,firstMatchedEndpoint,endpointProven:false};
    },
  };
}
