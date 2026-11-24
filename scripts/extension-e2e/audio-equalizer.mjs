import {isDeepStrictEqual} from 'node:util';
import {equalizerMeasurementCases} from '../audio-processing-metrics.mjs';
import {assessL1Equalizer} from '../audio-l1-processing-metrics.mjs';

/** @typedef {import('../audio-l1-processing-metrics.mjs').Command} Command */
/** @typedef {import('../audio-l1-processing-metrics.mjs').Reply} Reply */
/** @typedef {{commands:Command[],replies:Reply[]}} Observation */
/** @typedef {Readonly<{id:string,sampleRate:number,frequency:number,levels:readonly number[],masterGain:number}>} EqualizerSpec */
/** @typedef {{caseId:string,cursor:number,requestFrame:number,command:Command,accepted:Reply,completed:Reply,acceptedFrame:number,completedFrame:number,start:number,end:number}} EqualizerTarget */
/** @typedef {{rate:number,start:number,end:number,channels:Float32Array[]}} Window */

/** @param {string} code */const fail=code=>Error('audio-equalizer-'+code);
const originals=equalizerMeasurementCases();
const cases=new Map(originals.map(row=>[row.id,Object.freeze({...row,levels:Object.freeze([...row.levels])})]));
if(originals.length!==108||cases.size!==originals.length)throw fail('registry');
/** @param {unknown} id @returns {EqualizerSpec} */
export function selectEqualizerCase(id){
  const spec=typeof id==='string'?cases.get(id):undefined;if(!spec)throw fail('case');return spec;
}
export const EQUALIZER_CASE=selectEqualizerCase('44100/band/63/-6');
/** @param {EqualizerSpec} spec */
function canonical(spec){const original=selectEqualizerCase(spec?.id);if(!isDeepStrictEqual(spec,original))throw fail('original-spec');return original;}
/** @param {EqualizerSpec} spec */
export function isColdEqualizerCase(spec){return canonical(spec).id.includes('/neutral/');}
/** @param {unknown} value @returns {value is number} */
const safe=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
/** @param {unknown} value @returns {Record<string,unknown>|null} */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?/** @type {Record<string,unknown>} */(value):null;

/** @param {unknown} facts @param {number} gain */
function matchesReadback(facts,gain){
  const r=record(record(facts)?.readback);
  return r?.state==='on'&&r.sources===1&&r.wanted===true&&r.gain===gain&&r.appliedGain===gain;
}
/** @param {unknown} facts @param {EqualizerSpec} [spec] */
export function assertEqualizerReadback(facts,spec=EQUALIZER_CASE){
  spec=canonical(spec);if((spec.masterGain!==1||isColdEqualizerCase(spec))&&!matchesReadback(facts,spec.masterGain))throw fail('readback');
}
/** Neutral needs an untouched source; a Gain change needs the completed baseline that deduplicates configure().
 * @param {unknown} facts @param {EqualizerSpec} [spec] @param {boolean} [componentWitness]
 */
export function assertEqualizerBaseline(facts,spec=EQUALIZER_CASE,componentWitness=false){
  spec=canonical(spec);
  if(isColdEqualizerCase(spec)){
    const row=record(facts),state=record(row?.productObservation),r=record(row?.readback);
    // Empty-stream span sentinels differ live/JSON; cold identity never treats them as captured coverage.
    if(typeof row?.audioTime!=='number'||!Number.isFinite(row.audioTime)||row.audioTime<0||!safe(Math.round(row.audioTime*spec.sampleRate))||row.captureStartFrame!==null||
      (row.equalizerComponent===true)!==componentWitness||state?.sources!==0||state.l1Nodes!==0||state.sourceFrame!==null||state.invalidFrames!==0||state.streamError!==''||!isDeepStrictEqual(state.bufferedChunks,componentWitness?[0,0,0,0]:[0,0,0])||
      !Array.isArray(state.commands)||state.commands.length!==0||!Array.isArray(state.replies)||state.replies.length!==0||
      r?.state!=='off'||r.wanted!==false||r.sources!==0||r.gain!==1||r.appliedGain!==null)throw fail('cold-baseline');
    return;
  }
  if(spec.masterGain===1)return;
  const row=record(facts),o=/** @type {Observation} */(/** @type {unknown} */(row?.productObservation));
  if(!matchesReadback(facts,1)||typeof row?.audioTime!=='number'||!Number.isFinite(row.audioTime)||row.audioTime<0||!Array.isArray(o?.commands)||o.commands.length!==1||!Array.isArray(o.replies)||o.replies.length>64)throw fail('baseline');
  const observedFrame=Math.round(row.audioTime*spec.sampleRate);if(!safe(observedFrame))throw fail('baseline');
  const command=o.commands[0],p=command?.message;
  if(!command||!p||!safe(command.requestedFrame)||!safe(p.seq)||p.seq===0||!safe(p.sourceEpoch)||p.sourceEpoch===0||
    !isDeepStrictEqual(p,{kind:'configure',sourceEpoch:p.sourceEpoch,seq:p.seq,wanted:true,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:false,targetDbfs:-20})||
    o.replies.some(r=>!r||r.sourceEpoch!==p.sourceEpoch||r.code!==null||r.kind!=='prepared'&&r.seq!==p.seq))throw fail('baseline');
  const accepted=o.replies.filter(r=>r.kind==='accepted'),completed=o.replies.filter(r=>r.kind==='completed'),a=accepted[0],c=completed[0];
  if(accepted.length!==1||completed.length!==1||!a||!c||!safe(a.frame)||!safe(c.frame)||!safe(a.meterEpoch)||a.meterEpoch!==c.meterEpoch||a.frame<command.requestedFrame||c.frame<a.frame||c.frame>observedFrame||a.gain!==null||c.gain!==1||o.replies.indexOf(a)>=o.replies.indexOf(c))throw fail('baseline');
}

/** @param {unknown} facts @param {unknown} request @param {EqualizerSpec} [spec] */
export function assertEqualizerRequest(facts,request,spec=EQUALIZER_CASE){
  spec=canonical(spec);if(!isColdEqualizerCase(spec))return;
  const row=record(facts),r=record(request);
  if(typeof row?.audioTime!=='number'||!Number.isFinite(row.audioTime)||row.audioTime<0||!safe(Math.round(row.audioTime*spec.sampleRate))||!r||!safe(r.frame)||r.frame<Math.round(row.audioTime*spec.sampleRate)||!isDeepStrictEqual(r,{status:'on',frame:r.frame}))throw fail('request');
}

/** Bind a newly posted command, never an old same-frame command or a later replacement.
 * @param {Observation} observation @param {number} cursor @param {number} requestFrame @param {EqualizerSpec} [spec] @returns {EqualizerTarget|null}
 */
export function selectEqualizerTarget(observation,cursor,requestFrame,spec=EQUALIZER_CASE){
  spec=canonical(spec);
  const cold=isColdEqualizerCase(spec);if(cold&&cursor!==0)throw fail('cold-cursor');
  if(!safe(cursor)||!safe(requestFrame)||!Array.isArray(observation?.commands)||!Array.isArray(observation?.replies)||observation.commands.length>64||observation.replies.length>64||cursor>observation.commands.length)throw fail('target-shape');
  const rows=observation.commands.slice(cursor);if(!rows.length)return null;
  if(rows.length!==1)throw fail('target-command-count');
  const command=record(rows[0]),p=record(command?.message);
  if(!command||!p||!safe(command.requestedFrame)||command.requestedFrame<requestFrame||!safe(p.seq)||p.seq===0||!safe(p.sourceEpoch)||p.sourceEpoch===0||
    cold&&(p.seq!==1||p.targetDbfs!==-20)||typeof p.targetDbfs!=='number'||!Number.isFinite(p.targetDbfs)||p.targetDbfs< -30||p.targetDbfs> -12||!isDeepStrictEqual(p,{kind:'configure',sourceEpoch:p.sourceEpoch,seq:p.seq,wanted:true,gain:spec.masterGain,eq:[...spec.levels],normalizer:false,dynamics:false,targetDbfs:p.targetDbfs}))throw fail('target-spec');
  if(observation.replies.some(r=>!r||r.sourceEpoch!==p.sourceEpoch))throw fail('target-epoch');
  const replies=observation.replies.filter(r=>r.seq===p.seq);
  if(replies.some(r=>!['accepted','completed'].includes(r.kind)||r.code!==null))throw fail('target-reply');
  const accepted=replies.filter(r=>r.kind==='accepted'),completed=replies.filter(r=>r.kind==='completed');
  if(accepted.length>1||completed.length>1)throw fail('target-duplicate-ack');
  if(!accepted.length||!completed.length)return null;
  const a=accepted[0],c=completed[0];if(!a||!c)return null;
  const start=c.frame+1.5*spec.sampleRate,end=c.frame+2.5*spec.sampleRate;
  if(!safe(a.frame)||!safe(c.frame)||!safe(start)||!safe(end)||a.frame<command.requestedFrame||c.frame<a.frame||a.gain!==null||c.gain!==spec.masterGain||observation.replies.indexOf(a)>=observation.replies.indexOf(c))throw fail('target-ack');
  return {caseId:spec.id,cursor,requestFrame,command:/** @type {Command} */(/** @type {unknown} */(structuredClone(command))),accepted:structuredClone(a),completed:structuredClone(c),acceptedFrame:a.frame,completedFrame:c.frame,start,end};
}

/** @param {Observation} observation @param {EqualizerTarget} target @param {EqualizerSpec} [spec] */
export function assertEqualizerTarget(observation,target,spec=EQUALIZER_CASE){
  const current=selectEqualizerTarget(observation,target.cursor,target.requestFrame,spec);
  if(!current||!isDeepStrictEqual(current,target))throw fail('target-changed');
}

/** The original numeric assessor owns both output gates and the Native8/overall limits.
 * @param {{window:(start:number,end:number,stream:number)=>Window}} archive
 * @param {{productObservation:Observation,filters:number,equalizerComponent?:boolean}} facts @param {EqualizerTarget} target @param {EqualizerSpec} [spec] @param {boolean} [componentWitness]
 */
export function assessPackagedEqualizer(archive,facts,target,spec=EQUALIZER_CASE,componentWitness=false){
  spec=canonical(spec);assertEqualizerTarget(facts.productObservation,target,spec);
  if((facts.equalizerComponent===true)!==componentWitness)throw fail('component-profile');
  const [program,source,control]=[0,1,2].map(stream=>archive.window(target.start,target.end,stream));
  if(!program||!source||!control||[program,source,control].some(row=>row.rate!==spec.sampleRate||row.start!==target.start||row.end!==target.end))throw fail('fixed-window');
  return assessL1Equalizer({schema:componentWitness?'f01-l1-eq-input-v2':'f01-l1-eq-input-v1',...(componentWitness?{component:archive.window(target.start,target.end,3)}:{}),spec:{...spec,levels:[...spec.levels]},program,source,control,observation:{...facts.productObservation,filters:facts.filters}});
}

/** @param {unknown} raw @param {EqualizerSpec} [spec] */
export function equalizerSignalFailures(raw,spec=EQUALIZER_CASE){
  spec=canonical(spec);
  const facts=record(raw),signal=record(facts?.signal),video=record(facts?.video);
  return facts?.sampleRate===spec.sampleRate&&signal?.frequency===spec.frequency&&signal.inputDbfs===-40&&signal.phase===.37&&signal.channels===2&&signal.durationSeconds===90&&signal.frames===90*spec.sampleRate&&signal.loop===false&&signal.error===''&&
    video?.muted===false&&video.volume===1&&video.loop===false&&video.ended===false&&video.paused===false&&video.playbackRate===1&&typeof video.currentTime==='number'&&Number.isFinite(video.currentTime)&&video.currentTime>=0&&video.currentTime<90?[]:['input-signal-state'];
}
