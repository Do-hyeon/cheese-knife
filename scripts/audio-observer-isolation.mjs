import {isDeepStrictEqual} from 'node:util';
import {AUDIO_ARTIFACT_FILES} from './audio-artifact-core.mjs';
import {audioQualityFailures} from './audio-metrics.mjs';
import {summarizeCapture} from './audio-signal.mjs';
import {validateQualityEvidence} from './audio-quality-diagnostics.mjs';

const frozenCommit='c5d45b8a7abf30450d3f1bbff45afbb8cd020cb5';
/** @typedef {'f'|'u'|'t'} ObserverMode */
/** @typedef {{label:string,mode:ObserverMode}} ObserverRun */
/** @param {unknown} value @param {string} code @returns {asserts value} */
function need(value,code){if(!value)throw new Error(code);}
/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value){need(value&&typeof value==='object'&&!Array.isArray(value),'observer-object');return /** @type {Record<string,unknown>} */(value);}
/** @param {unknown} value @returns {unknown[]} */
function array(value){need(Array.isArray(value),'observer-array');return value;}
/** @param {unknown} value */
const finite=value=>typeof value==='number'&&Number.isFinite(value);
/** @param {unknown} value @param {number} length */
const hex=(value,length)=>typeof value==='string'&&new RegExp('^[a-f0-9]{'+length+'}$').test(value);

/** @param {string} prefix @returns {readonly ObserverRun[]} */
export function observerRunPlan(prefix){
  need(typeof prefix==='string'&&/^[a-z0-9][a-z0-9-]{0,60}$/.test(prefix),'observer-prefix');
  return ['f1','u1','t1','u2','t2','f2','t3','f3','u3'].map(suffix=>({label:prefix+'-'+suffix,mode:/** @type {ObserverMode} */(suffix[0])}));
}

const caseInputs=[[1000,.5,1,false,'identical',false],[1000,.01,1,false,'identical',false],[100,.8,1,false,'identical',false],[5000,.8,1,false,'identical',false],
  [1000,.5,1,true,'identical',false],[1000,.01,1.5,true,'identical',false],[1000,.1,1.5,true,'identical',false],[1000,.5,1.5,true,'identical',false],
  [1000,.98,1.5,true,'identical',false],[1000,.98,2,true,'identical',false],[100,.8,1.5,true,'identical',false],[5000,.8,1.5,true,'identical',false],
  [1000,.5,1.5,true,'left-only',false],[1000,.98,1.5,true,'identical',true]];
const alignmentInputs=[[8000,48],[11025,66],[16000,96],[22050,132],[32000,192],[44100,264],[48000,288],[88200,529],[96000,576],[176400,1023],[192000,1023],[384000,1023]];

/** @param {unknown} input */
function validateSummary(input){
  const value=record(input),channels=array(value.channels);
  need(value.sampleRate===48000&&finite(value.windowSeconds)&&/** @type {number} */(value.windowSeconds)>0&&channels.length===2&&finite(value.channelDifferenceRms),'observer-window');
  for(const item of channels){
    const channel=record(item),envelope=record(channel.envelope8ms);
    for(const key of ['samples','mean','rms','peak','overFullScaleSamples','maxAdjacentStep'])need(finite(channel[key]),'observer-channel');
    need(Number.isSafeInteger(channel.samples)&&/** @type {number} */(channel.samples)>0&&
      Math.abs(/** @type {number} */(channel.samples)-/** @type {number} */(value.windowSeconds)*48000)<1e-7,'observer-sample-count');
    need(Number.isSafeInteger(channel.overFullScaleSamples)&&/** @type {number} */(channel.overFullScaleSamples)>=0&&
      /** @type {number} */(channel.overFullScaleSamples)<=/** @type {number} */(channel.samples),'observer-full-scale-count');
    for(const key of ['peakDbfs','rmsDbfs','thdPercent','thdnPercent','fundamentalAmplitude'])need(channel[key]===null||finite(channel[key]),'observer-nullable-metric');
    need(['','non-coherent-window','tone-not-detectable'].includes(/** @type {string} */(channel.spectralReason)),'observer-spectrum');
    need(envelope.windowSamples===384&&finite(envelope.min)&&finite(envelope.max)&&/** @type {number} */(envelope.min)>=0&&
      /** @type {number} */(envelope.max)>=/** @type {number} */(envelope.min),'observer-envelope');
  }
}

/** @param {Record<string,unknown>} report */
function validateReport(report){
  const nodes=record(report.nodes),cases=array(report.cases),transitions=array(report.transitions),alignments=array(report.alignments);
  need(nodes.sampleRate===48000&&nodes.sources===1&&cases.length===14&&transitions.length===18&&alignments.length===12,'observer-report-shape');
  for(const [index,item]of cases.entries()){
    const row=record(item);need(isDeepStrictEqual(['frequency','inputAmplitude','gain','enabled','stereo','bursts'].map(key=>row[key]),caseInputs.at(index)),'observer-case-input');validateSummary(row);
  }
  const calibration=record(array(record(cases[0]).channels)[0]);need(/** @type {number} */(calibration.rms)>=.34&&/** @type {number} */(calibration.rms)<=.36,'observer-calibration');
  const steps=[['gain',1.5],['gain',2],['gain',0],['gain',1],['enabled',false],['enabled',true]];
  for(const [index,item]of transitions.entries()){
    const row=record(item);need(row.frequency===[250,750,1000].at(Math.floor(index/6))&&isDeepStrictEqual([row.kind,row.value],steps.at(index%6)),'observer-transition-input');
    for(const phase of ['before','change','after'])validateSummary(row[phase]);
  }
  for(const [index,item]of alignments.entries()){
    const row=record(item),expected=alignmentInputs.at(index);need(expected&&row.sampleRate===expected[0]&&
      ['expectedFrame','dryFirst','dryLast','compressorFirst','compressorLast'].every(key=>row[key]===expected[1]),'observer-alignment-input');
  }
  const stress=record(report.stress);need(stress.profile==='threshold0/knee0/ratio1/gain2','observer-stress');validateSummary(stress);
  return audioQualityFailures(/** @type {import('./audio-metrics.mjs').QualityReport} */(/** @type {unknown} */(report)));
}

/** @param {{manifest:unknown,records:readonly unknown[]}} input */
export function assessObserverRunSet({manifest,records}){
  /** @type {string[]} */const failures=[];let transportComplete=true;
  try{
    const m=record(manifest),order=observerRunPlan(/** @type {string} */(m.prefix)),tools=record(m.tools),current=record(tools.current),frozen=record(tools.frozen),env=record(m.environment),ci=record(m.ci);
    need(m.schema===1&&isDeepStrictEqual(m.order,order)&&records.length===9,'observer-manifest-order');
    need(frozen.commit===frozenCommit&&hex(current.commit,40)&&hex(frozen.inputSha256,64)&&hex(current.inputSha256,64),'observer-tool-provenance');
    need(ci.checkout===current.commit&&(ci.head===null||hex(ci.head,40)),'observer-ci-provenance');
    need(['linux','win32'].includes(/** @type {string} */(env.platform))&&typeof env.nodeVersion==='string'&&/^v24\./.test(env.nodeVersion)&&
      env.playwrightVersion==='1.62.1'&&env.sampleRate===48000&&hex(env.nodeExecutableSha256,64)&&hex(env.browserExecutableSha256,64),'observer-environment');
    const files=array(record(m.product).files);need(files.length===6&&files.every((value,index)=>{const row=record(value);return row.path===AUDIO_ARTIFACT_FILES.at(index)&&hex(row.sha256,64);}),'observer-product');
    /** @type {unknown} */let identity,audioIdentity;
    for(const [index,expected]of order.entries()){
      try{
        const item=record(records[index]),report=record(item.report),artifact=record(report.artifact);
        need(item.label===expected.label&&item.mode===expected.mode&&item.signal===null&&item.timedOut===false&&item.overflow===false&&item.closeConfirmed===true,'observer-run-state');
        need(artifact.label===expected.label&&typeof artifact.root==='string'&&isDeepStrictEqual(artifact.files,files),'observer-artifact');
        need(typeof report.browser==='string'&&report.browser.length>0&&report.browser.length<=128,'observer-browser');
        const actualIdentity={root:artifact.root,browser:report.browser,nodes:report.nodes};
        if(index===0)identity=actualIdentity;else need(isDeepStrictEqual(identity,actualIdentity),'observer-environment-drift');
        const quality=validateReport(report);need(isDeepStrictEqual(report.qualityFailures,quality),'observer-producer-quality');
        need(item.exitCode===0&&quality.length===0||item.exitCode===1&&quality.length>0,'observer-unexplained-exit');
        if(expected.mode==='f')need(item.diagnostic===null,'observer-frozen-no-diagnostic');
        else{
          const d=record(item.diagnostic);validateQualityEvidence(d);
          need(d.complete===true&&d.truncated===false&&d.label===expected.label&&d.traceEnabled===(expected.mode==='t')&&
            d.sourceCommit===current.commit&&d.pullRequestHead===ci.head&&d.platform===env.platform&&d.nodeVersion===env.nodeVersion&&d.sampleRate===48000&&
            d.browserVersion===report.browser&&isDeepStrictEqual(d.artifact,artifact),'observer-diagnostic-provenance');
          need(quality.length?d.error==='Audio quality failed: '+quality.join(', '):d.error===null,'observer-diagnostic-error');
          const active={config:d.audioConfig,wanted:d.wanted,state:d.state};
          if(index===1)audioIdentity=active;else need(isDeepStrictEqual(audioIdentity,active),'observer-audio-state-drift');
          const transitions=array(report.transitions).map(record).filter(row=>row.kind==='enabled');
          for(const [i,value]of array(d.captures).entries()){
            const row=record(value),transition=transitions.at(Math.floor(i/3));
            need(transition&&isDeepStrictEqual(transition[/** @type {string} */(row.phase)],summarizeCapture(/** @type {import('./audio-signal.mjs').CaptureWindow} */(row.capture))),'observer-pcm-summary');
          }
        }
        failures.push(...quality.map(value=>expected.label+'/'+value));
      }catch(error){transportComplete=false;failures.push(expected.label+'/'+(error instanceof Error?error.message:'observer-invalid'));}
    }
  }catch(error){transportComplete=false;failures.push(error instanceof Error?error.message:'observer-invalid');}
  return {transportComplete,qualityPass:transportComplete&&failures.length===0,failures};
}
