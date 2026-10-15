import {summarizeCapture} from './audio-signal.mjs';
import {readFile} from 'node:fs/promises';

/** @param {unknown} value @returns {Record<string,unknown>|null} */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?/** @type {Record<string,unknown>} */(value):null;
/** @param {unknown} value @returns {value is number} */
const finite=value=>typeof value==='number'&&Number.isFinite(value);
/** @type {unknown} */const rawFixture=JSON.parse(await readFile(new URL('../tests/fixtures/f01-audio-processing.json',import.meta.url),'utf8'));
const fixtureRecord=record(rawFixture);
if(!fixtureRecord||fixtureRecord.schema!=='f01-audio-processing-v1'||
  !['sampleRates','eqFrequencies','neutralAndMixedFrequencies','mixedLevels'].every(key=>{const row=fixtureRecord[key];return Array.isArray(row)&&row.length>0&&row.every(finite);}))throw new Error('audio-processing-fixture-invalid');
const fixture=/** @type {{sampleRates:number[],eqFrequencies:number[],neutralAndMixedFrequencies:number[],mixedLevels:number[]}} */(rawFixture);

/** Independent RBJ peaking transfer response; do not import the production EQ implementation.
 * @param {readonly number[]} levels @param {number} sampleRate @param {number} frequency
 */
export function equalizerResponseDb(levels,sampleRate,frequency){
  if(!Array.isArray(levels)||levels.length!==8||!levels.every(level=>finite(level)&&level>=-6&&level<=6)||
    ![44100,48000,96000].includes(sampleRate)||!finite(frequency)||frequency<=0||frequency>=sampleRate/2)throw new Error('eq-measurement-invalid');
  let db=0;
  const omega=2*Math.PI*frequency/sampleRate;
  for(const [index,centre] of [63,125,250,500,1000,2000,4000,8000].entries()){
    const a=10**(/** @type {number} */(levels[index])/40),w=2*Math.PI*centre/sampleRate,alpha=Math.sin(w)/2;
    const b=[1+alpha*a,-2*Math.cos(w),1-alpha*a],den=[1+alpha/a,-2*Math.cos(w),1-alpha/a];
    /** @param {number[]} coefficients */
    const power=coefficients=>{
      let re=0,im=0;
      for(const [n,c] of coefficients.entries()){re+=c*Math.cos(n*omega);im-=c*Math.sin(n*omega);}
      return re*re+im*im;
    };
    db+=10*Math.log10(power(b)/power(den));
  }
  if(!finite(db))throw new Error('eq-measurement-invalid');
  return db;
}

/** @param {unknown} raw @returns {import('./audio-signal.mjs').CaptureWindow} */
export function validateProcessingCapture(raw){
  const value=record(raw);
  if(!value||!finite(value.rate)||![44100,48000,96000].includes(value.rate)||
    !Number.isSafeInteger(value.start)||!Number.isSafeInteger(value.end)||Number(value.start)<0||Number(value.end)<=Number(value.start)||
    !Array.isArray(value.channels)||value.channels.length!==2)throw new Error('audio-capture-invalid');
  const length=Number(value.end)-Number(value.start);
  if(length>value.rate*15)throw new Error('audio-capture-invalid');
  for(const channel of value.channels){
    if((!Array.isArray(channel)&&!(channel instanceof Float32Array)&&!(channel instanceof Float64Array))||channel.length!==length)throw new Error('audio-capture-invalid');
    for(let index=0;index<length;index++)if(!finite(channel[index]))throw new Error('audio-capture-invalid');
  }
  return /** @type {import('./audio-signal.mjs').CaptureWindow} */(raw);
}

/** @typedef {{sampleRate:number,frequency:number,levels:readonly number[],masterGain:number}} EqualizerCase */
/** @param {unknown} raw @param {EqualizerCase} spec @param {number} inputRms @param {number} nativeDb */
export function evaluateEqualizerCapture(raw,spec,inputRms,nativeDb){
  const capture=validateProcessingCapture(raw),summary=summarizeCapture(capture);
  if(!finite(inputRms)||inputRms<=0||!finite(spec.masterGain)||spec.masterGain<=0||spec.masterGain>2)throw new Error('eq-measurement-invalid');
  const responseDb=equalizerResponseDb(spec.levels,spec.sampleRate,spec.frequency);
  const headroomDb=-spec.levels.reduce((sum,value)=>sum+Math.max(0,value),0),expectedDb=responseDb+headroomDb+20*Math.log10(spec.masterGain);
  const tolerance=spec.levels.every(level=>level===0)?.05:.5;
  const failures=[];
  if(capture.rate!==spec.sampleRate)failures.push('eq-capture-rate');
  if(!finite(nativeDb)||Math.abs(nativeDb-responseDb)>.05)failures.push('eq-native-response');
  const measuredDb=summary.channels.map(channel=>channel.rms>0?20*Math.log10(channel.rms/inputRms):null);
  for(const [index,value] of measuredDb.entries())if(value===null||!finite(value)||Math.abs(value-expectedDb)>tolerance)failures.push(`eq-output-channel-${index}`);
  for(const [index,channel] of summary.channels.entries())if(channel.overFullScaleSamples!==0||channel.peak>.9801)failures.push(`eq-headroom-channel-${index}`);
  return {summary,responseDb,nativeDb,headroomDb,expectedDb,measuredDb,tolerance,failures};
}

/** @returns {(EqualizerCase & {id:string})[]} */
export function equalizerMeasurementCases(){
  const zero=()=>Array(8).fill(0);
  return fixture.sampleRates.flatMap(sampleRate=>{
    /** @type {(EqualizerCase & {id:string})[]} */const cases=[];
    for(const frequency of fixture.neutralAndMixedFrequencies)cases.push({id:`${sampleRate}/neutral/${frequency}`,sampleRate,frequency,levels:zero(),masterGain:1});
    for(const [index,frequency] of fixture.eqFrequencies.entries())for(const value of [-6,6]){
      const levels=zero();levels[index]=value;cases.push({id:`${sampleRate}/band/${frequency}/${value}`,sampleRate,frequency,levels,masterGain:1});
    }
    for(const frequency of fixture.neutralAndMixedFrequencies)cases.push({id:`${sampleRate}/mixed/${frequency}`,sampleRate,frequency,levels:fixture.mixedLevels,masterGain:1});
    for(const masterGain of [.5,2])cases.push({id:`${sampleRate}/gain/${masterGain}`,sampleRate,frequency:1000,levels:zero(),masterGain});
    return cases;
  });
}

/** @typedef {{sampleRate:number,inputDbfs:number,pattern:string,seconds:number}} NormalizerCase */
/** @typedef {{node:number,from:number,to:number,start:number,end:number,observed:number}} AutomationEvent */
/** @typedef {{start:number,end:number,count:number[],squares:number[],peaks:number[],over:number[]}} OutputBin */
/** @param {unknown} raw @param {NormalizerCase} spec */
export function evaluateNormalizerTrace(raw,spec){
  const trace=record(raw),bad=()=>new Error('normalizer-trace-invalid');
  if(!trace||trace.sampleRate!==spec.sampleRate||![44100,48000,96000].includes(spec.sampleRate)||
    !finite(spec.inputDbfs)||!finite(spec.seconds)||spec.seconds<1||!Array.isArray(trace.events)||!Array.isArray(trace.bins)||!trace.bins.length||
    !Array.isArray(trace.powerReads)||trace.powerReads.length<2||trace.invalidFrames!==0)throw bad();
  const fftSize=2**Math.ceil(Math.log2(spec.sampleRate*.25)),window=fftSize/spec.sampleRate;
  for(const raw of trace.powerReads){const read=record(raw);if(!read||!finite(read.time)||!finite(read.power)||read.power<0||!Number.isSafeInteger(read.index)||read.size!==fftSize)throw bad();}
  /** @type {AutomationEvent[]} */const events=[];
  for(const value of trace.events){
    const event=record(value);if(!event||![event.node,event.from,event.to,event.start,event.end,event.observed].every(finite)||
      Number(event.from)<=0||Number(event.to)<=0||Number(event.end)<=Number(event.start))throw bad();
    if(event.node===7)events.push(/** @type {AutomationEvent} */(value));
  }
  /** @type {OutputBin[]} */const bins=[];
  for(const value of trace.bins){
    const bin=record(value);if(!bin||!Number.isSafeInteger(bin.start)||!Number.isSafeInteger(bin.end)||Number(bin.end)-Number(bin.start)!==spec.sampleRate/10||
      ![bin.count,bin.squares,bin.peaks,bin.over].every(row=>Array.isArray(row)&&row.length===2&&row.every(value=>finite(value)&&value>=0)))throw bad();
    const row=/** @type {OutputBin} */(value);
    if(row.count.every(count=>count===spec.sampleRate/10))bins.push(row);
    else if(value!==trace.bins.at(0)&&value!==trace.bins.at(-1))throw bad();
  }
  if(bins.length<10)throw bad();
  const failures=[];
  const first=/** @type {OutputBin} */(bins.at(0)),last=/** @type {OutputBin} */(bins.at(-1));
  const seconds=(last.end-first.start)/spec.sampleRate;
  if(seconds<spec.seconds-.4)failures.push('normalizer-duration');
  for(let index=1;index<bins.length;index++)if(bins[index]?.start!==bins[index-1]?.end)failures.push('normalizer-output-gap');
  if(!events.length)failures.push('normalizer-missing-automation');
  const firstRead=record(trace.powerReads[0]);
  if(events[0]&&events[0].start-Number(firstRead?.time)<window-.02)failures.push('normalizer-window-warmup');
  let maxUpDbPerSecond=0,maxDownDbPerSecond=0,maxGap=0,previous;
  for(const event of events){
    const fromDb=20*Math.log10(event.from),toDb=20*Math.log10(event.to),slope=(toDb-fromDb)/(event.end-event.start);
    maxUpDbPerSecond=Math.max(maxUpDbPerSecond,slope);maxDownDbPerSecond=Math.max(maxDownDbPerSecond,-slope);
    if(fromDb< -12.0001||fromDb>6.0001||toDb< -12.0001||toDb>6.0001)failures.push('normalizer-clamp');
    if(previous!==undefined)maxGap=Math.max(maxGap,event.start-previous);previous=event.start;
  }
  if(maxUpDbPerSecond>1.0001||maxDownDbPerSecond>12.0001)failures.push('normalizer-rate');
  if(maxGap>.2001)failures.push('normalizer-tick-gap');
  for(const bin of bins)if(bin.over.some(value=>value!==0)||bin.peaks.some(value=>value>.9801))failures.push('normalizer-output-headroom');
  const tail=bins.slice(-10),outputDbfs=[0,1].map(channel=>{
    const sum=tail.reduce((total,bin)=>total+/** @type {number} */(bin.squares[channel]),0),count=tail.reduce((total,bin)=>total+/** @type {number} */(bin.count[channel]),0);
    return sum>0?10*Math.log10(sum/count):null;
  });
  const targetDelta=Math.max(-12,Math.min(6,-20-spec.inputDbfs)),expectedDbfs=spec.inputDbfs+targetDelta;
  if(['mono','stereo','antiphase','left','right'].includes(spec.pattern))for(const [channel,db] of outputDbfs.entries()){
    const silent=spec.pattern==='left'&&channel===1||spec.pattern==='right'&&channel===0;
    if(silent?db!==null&&db> -90:db===null||Math.abs(db-expectedDbfs)>1)failures.push(`normalizer-target-channel-${channel}`);
  }
  return {seconds,outputDbfs,expectedDbfs,targetReachable:targetDelta===-20-spec.inputDbfs,maxUpDbPerSecond,maxDownDbPerSecond,maxGap,automationEvents:events.length,completeBins:bins.length,fftSize,windowSeconds:window,powerReads:trace.powerReads.length,failures:[...new Set(failures)]};
}

/** @returns {(NormalizerCase & {id:string})[]} */
export function normalizerMeasurementCases(){
  return [44100,48000,96000].flatMap(sampleRate=>[-36,-24,-12,-6].flatMap(inputDbfs=>['mono','stereo','antiphase','left','right'].map(pattern=>({
    id:`${sampleRate}/normalizer/${inputDbfs}/${pattern}`,sampleRate,inputDbfs,pattern,seconds:inputDbfs===-24?15:inputDbfs===-36?10:4,
  }))));
}

/** @param {unknown} before @param {unknown} change @param {unknown} after @param {'master'|'component'} [kind] */
export function evaluateProcessingTransition(before,change,after,kind='master'){
  const summaries=[before,change,after].map(record);
  if(summaries.some(row=>!row||!Array.isArray(row.channels)||row.channels.length!==2))throw new Error('audio-transition-invalid');
  const failures=[];
  for(const index of [0,1]){
    const channels=summaries.map(row=>record(/** @type {unknown[]} */(row?.channels)[index]));
    for(const row of channels)if(!row||![row.rms,row.peak,row.maxAdjacentStep,record(row.envelope8ms)?.min].every(value=>finite(value)&&value>=0)||!Number.isSafeInteger(row.overFullScaleSamples))throw new Error('audio-transition-invalid');
    const [first,middle,last]=/** @type {[Record<string,unknown>,Record<string,unknown>,Record<string,unknown>]} */(channels);
    const minimum=Math.min(Number(record(first.envelope8ms)?.min),Number(record(last.envelope8ms)?.min));
    if(kind==='master'){
      if(minimum<1e-4||Number(record(middle.envelope8ms)?.min)<minimum*.95)failures.push(`transition-channel-${index}/dip`);
      if(Number(middle.maxAdjacentStep)>Math.max(Number(first.maxAdjacentStep),Number(last.maxAdjacentStep))+1e-6)failures.push(`transition-channel-${index}/step`);
    }else if(channels.some(row=>Number(row?.peak)>.9801))failures.push(`transition-channel-${index}/wet-ceiling`);
    if(channels.some(row=>row?.overFullScaleSamples!==0||Number(row?.peak)>1))failures.push(`transition-channel-${index}/fullscale`);
  }
  return failures;
}

/** @param {unknown} raw */
export function complementaryAudioRamps(raw){
  if(!Array.isArray(raw))return false;
  const pair=raw.map(record).filter(row=>row?.node===0||row?.node===1);
  if(pair.length!==2||pair[0]?.node===pair[1]?.node)return false;
  for(const row of pair)if(!row||![row.from,row.to,row.start,row.end].every(finite)||Number(row.end)<=Number(row.start))return false;
  const times=pair.flatMap(row=>[Number(row?.start),Number(row?.end)]);
  for(const time of times){
    const sum=pair.reduce((sum,row)=>{const progress=Math.max(0,Math.min(1,(time-Number(row?.start))/(Number(row?.end)-Number(row?.start))));return sum+Number(row?.from)+(Number(row?.to)-Number(row?.from))*progress;},0);
    if(Math.abs(sum-1)>1e-6)return false;
  }
  return true;
}

export function rapidMasterStimuli(){
  return /** @type {const} */([0,2,5]).flatMap(startPhaseMs=>/** @type {const} */([0,10,15,25]).map(milliseconds=>({startPhaseMs,milliseconds})));
}

/** Assess every raw comparison before coverage; a missing stimulus is not a product PASS.
 * @param {unknown} raw
 */
export function rapidMasterAssessment(raw){
  /** @type {Set<string>} */const phases=new Set();
  /** @type {string[]} */const failures=[];
  if(!Array.isArray(raw)||raw.length!==12)return {status:'failed',phases:[],failures:['rapid-input-count']};
  for(const spec of rapidMasterStimuli()){
    const matches=raw.filter(value=>{const row=record(value);return row?.milliseconds===spec.milliseconds&&row.startPhaseMs===spec.startPhaseMs;}),row=record(matches[0]);
    const id=`${spec.startPhaseMs}/${spec.milliseconds}`,reset=record(row?.reset),entry=record(row?.reentry),boundary=record(row?.boundary),state=record(row?.state),output=record(row?.output);
    const clocks=['edge','off','offDone','on','onDone'].map(key=>record(boundary?.[key]));
    if(matches.length!==1||!row||row.error!==undefined||!reset||!entry||!state||!output||boundary?.status!=='on'||
      clocks.some(clock=>!clock||![clock.audio,clock.wall].every(finite))||
      ![reset.from,reset.to,reset.start,reset.end,reset.observed,entry.start,entry.end,entry.observed].every(finite)){
      failures.push(id+'/evidence');continue;
    }
    const edge=clocks[0],off=clocks[1],offDone=clocks[2],on=clocks[3],onDone=clocks[4];
    const ordered=clocks.every((clock,index)=>index===0||Number(clock?.audio)>=Number(clocks[index-1]?.audio)&&Number(clock?.wall)>=Number(clocks[index-1]?.wall));
    if(!ordered||Number(off?.wall)-Number(edge?.wall)<spec.startPhaseMs||Number(on?.wall)-Number(off?.wall)<spec.milliseconds||
      reset.node!==7||entry.node!==7||Number(reset.from)<=1||reset.to!==1||Math.abs(Number(reset.end)-Number(reset.start)-.01)>1e-6||
      Number(reset.observed)<Number(off?.audio)||Number(reset.observed)>Number(offDone?.audio)||Number(reset.start)<Number(reset.observed)||
      Number(entry.start)<Number(on?.audio)||Number(entry.observed)<Number(on?.audio)||Number(entry.observed)>Number(onDone?.audio)||entry.end!==entry.start){
      failures.push(id+'/clock-or-curve');continue;
    }
    const progress=Math.max(0,Math.min(1,(Number(entry.start)-Number(reset.start))/(Number(reset.end)-Number(reset.start))));
    const expectedDb=20*Math.log10(Number(reset.from))*(1-progress),gain=Array.isArray(state.gains)?state.gains[7]:undefined;
    if(state.sources!==1||state.active100msTimers!==1||state.invalidFrames!==0||!finite(gain)||gain<=0||Math.abs(20*Math.log10(gain)-expectedDb)>=.001||
      !Array.isArray(output.channels)||output.channels.length!==2||output.channels.some(value=>{const channel=record(value);return !channel||!finite(channel.rms)||channel.rms<=0||!finite(channel.peak)||channel.peak<0||channel.peak>.9801||channel.overFullScaleSamples!==0||Math.abs(20*Math.log10(channel.rms)+36-expectedDb)>=.05;}))failures.push(id+'/output');
    phases.add(Number(entry.start)<=Number(reset.start)?'hold':Number(entry.start)>=Number(reset.end)?'unity':'reset');
  }
  return {status:failures.length?'failed':phases.size===3?'passed':'stimulus-unformed',phases:[...phases],failures};
}

/** @param {unknown} value */
function validSource(value){
  const source=record(value);
  return source!==null&&Object.keys(source).length===5&&typeof source.sourceCommit==='string'&&/^[a-f0-9]{40}$/.test(source.sourceCommit)&&
    ['sourceSha256','lockSha256','manifestSha256','toolchainSha256'].every(key=>typeof source[key]==='string'&&/^[a-f0-9]{64}$/.test(source[key]));
}
/** @param {unknown} value */
function validEnvironment(value){
  const row=record(value);
  return !!row&&typeof row.browserVersion==='string'&&/^\d+\.\d+\.\d+\.\d+$/.test(row.browserVersion)&&row.platform==='win32'&&
    ['x64','arm64'].includes(String(row.arch))&&typeof row.nodeVersion==='string'&&/^v\d+\.\d+\.\d+$/.test(row.nodeVersion);
}
/** @param {unknown} raw @param {unknown} expectedSource */
export function processingPreflightFailures(raw,expectedSource){
  const report=record(raw),failures=[];
  if(!report||report.schema!=='f01-audio-preflight-v1'||!validSource(expectedSource)||!validSource(report.source)||!validSource(report.after)||
    JSON.stringify(report.source)!==JSON.stringify(expectedSource)||JSON.stringify(report.after)!==JSON.stringify(expectedSource))return ['audio-preflight-source'];
  if(report.error!==null||!Array.isArray(report.pageErrors)||report.pageErrors.length)failures.push('audio-preflight-exception');
  if(!Array.isArray(report.rates)||report.rates.length!==3)return [...failures,'audio-preflight-rates'];
  for(const sampleRate of [44100,48000,96000]){
    const rows=report.rates.filter(value=>record(value)?.sampleRate===sampleRate),row=record(rows[0]),shutdown=record(row?.shutdown);
    if(rows.length!==1||!row||!validEnvironment(row.environment)||!shutdown||!['browserCloseAcknowledged','browserDisconnected','ownedRootClosed'].every(key=>shutdown[key]===true))failures.push(`preflight-${sampleRate}/environment-or-close`);
    const assessment=rapidMasterAssessment(row?.rapid);
    if(assessment.status!=='passed')failures.push(`preflight-${sampleRate}/${assessment.status}`);
  }
  return failures;
}
/** Only complete, same-source Native results can clear the gate.
 * @param {unknown} raw @param {unknown} expectedSource
 */
export function processingReportFailures(raw,expectedSource){
  const report=record(raw),failures=[];
  if(!report||report.schema!=='f01-audio-processing-v2'||!validSource(expectedSource)||!validSource(report.source)||!validSource(report.after)||
    JSON.stringify(report.source)!==JSON.stringify(expectedSource)||JSON.stringify(report.after)!==JSON.stringify(expectedSource))return ['audio-processing-source'];
  if(report.error!==null||!Array.isArray(report.pageErrors)||report.pageErrors.length)failures.push('audio-processing-exception');
  failures.push(...processingPreflightFailures(report.preflight,expectedSource));
  if(!Array.isArray(report.rates)||report.rates.length!==3)return [...failures,'audio-processing-rates'];
  for(const sampleRate of [44100,48000,96000]){
    const rows=report.rates.filter(row=>record(row)?.sampleRate===sampleRate),rate=record(rows[0]);
    if(rows.length!==1||!rate){failures.push(`rate-${sampleRate}/missing`);continue;}
    const preflightRates=record(report.preflight)?.rates,preflight=Array.isArray(preflightRates)?record(preflightRates.find(value=>record(value)?.sampleRate===sampleRate)):null;
    if(!validEnvironment(rate.environment)||JSON.stringify(rate.environment)!==JSON.stringify(preflight?.environment))failures.push(`rate-${sampleRate}/preflight-environment`);
    const shutdown=record(rate.shutdown),nodes=record(rate.nodes);
    if(!shutdown||!['browserCloseAcknowledged','browserDisconnected','ownedRootClosed'].every(key=>shutdown[key]===true))failures.push(`rate-${sampleRate}/shutdown`);
    const expectedNodes={sources:1,gainNodes:8,filters:8,compressors:1,delays:2,shapers:1};
    if(!nodes||Object.entries(expectedNodes).some(([key,value])=>nodes[key]!==value))failures.push(`rate-${sampleRate}/identity-nodes`);
    const expectedEq=equalizerMeasurementCases().filter(row=>row.sampleRate===sampleRate);
    if(!Array.isArray(rate.equalizer)||rate.equalizer.length!==expectedEq.length){failures.push(`rate-${sampleRate}/equalizer-missing`);continue;}
    for(const spec of expectedEq){
      const matches=rate.equalizer.filter(row=>record(row)?.id===spec.id),row=record(matches[0]),summary=record(row?.summary);
      if(matches.length!==1||!row||!summary||!Array.isArray(summary.channels)||summary.channels.length!==2||!finite(row.nativeDb)||!finite(row.inputRms)||row.inputRms<=0||
        !Array.isArray(row.failures)||row.failures.length){failures.push(spec.id+'/incomplete');continue;}
      const db=equalizerResponseDb(spec.levels,spec.sampleRate,spec.frequency),headroom=-spec.levels.reduce((sum,value)=>sum+Math.max(0,value),0);
      if(Math.abs(row.nativeDb-db)>.05)failures.push(spec.id+'/native-response');
      for(const value of summary.channels){const channel=record(value);
        if(!channel||!finite(channel.rms)||channel.rms<=0||!finite(channel.peak)||channel.peak>.9801||channel.overFullScaleSamples!==0||
          Math.abs(20*Math.log10(channel.rms/row.inputRms)-db-headroom-20*Math.log10(spec.masterGain))>(spec.levels.every(value=>value===0)?.05:.5))failures.push(spec.id+'/output');
      }
    }
    const expectedNorm=normalizerMeasurementCases().filter(row=>row.sampleRate===sampleRate);
    const transitions=rate.transitions;
    if(!Array.isArray(transitions)||transitions.length!==24)failures.push(`rate-${sampleRate}/transitions-missing`);
    else for(const frequency of [250,750,1000])for(const name of ['eq-on','eq-off','compressor-on','compressor-off','normalizer-on','normalizer-off','master-off','master-on']){
      const id=`${sampleRate}/${frequency}/${name}`,matches=transitions.filter(value=>record(value)?.id===id),row=record(matches[0]);
      try{if(matches.length!==1||!row||evaluateProcessingTransition(row.before,row.change,row.after,name.startsWith('master-')?'master':'component').length||name.startsWith('master-')&&!complementaryAudioRamps(row.linearEvents))failures.push(id+'/transition');}
      catch{failures.push(id+'/incomplete');}
    }
    if(!Array.isArray(rate.normalizer)||rate.normalizer.length!==expectedNorm.length)failures.push(`rate-${sampleRate}/normalizer-missing`);
    else for(const spec of expectedNorm){
      const rows=rate.normalizer.filter(row=>record(row)?.id===spec.id),row=record(rows[0]);
      try{const trace=record(row?.trace);if(rows.length!==1||!row||trace?.buffers!==2||trace.active100msTimers!==1||evaluateNormalizerTrace(trace,spec).failures.length)failures.push(spec.id+'/output');}
      catch{failures.push(spec.id+'/incomplete');}
    }
    const lifetime=record(rate.lifetime);
    for(const key of ['sourceOne','gainZero','gainZeroHold','muteVolumePreserved','oldCallbacksZero','metersOffAfterDisable','hiddenObserved','hiddenHold','visibleRestored','independentWindows','oneWindowClosed','remainingSourceOne'])if(lifetime?.[key]!==true)failures.push(`rate-${sampleRate}/lifetime-${key}`);
    const evidence=record(lifetime?.evidence),windows=evidence?.windowIds,targets=evidence?.targetIds;
    if(!Array.isArray(windows)||windows.length!==2||windows[0]===windows[1]||!windows.every(value=>Number.isSafeInteger(value)&&value>=0)||
      !Array.isArray(targets)||targets.length!==2||targets[0]===targets[1]||!targets.every(value=>typeof value==='string'&&/^[A-Fa-f0-9]{32}$/.test(value)))failures.push(`rate-${sampleRate}/native-window-identity`);
    const controls=record(rate.controls);
    for(const key of ['dryUnity','dry99','wetPeak','extreme48db','silenceNoBoost','noiseNoBoost','silenceReturnUnity','burstFinite','stallHold','analysisErrorUnity'])if(controls?.[key]!==true)failures.push(`rate-${sampleRate}/control-${key}`);
  }
  return failures;
}
