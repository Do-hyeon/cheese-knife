// 음질 진단의 assessSignedTransitions({diagnostic,transitions})는 저장한 18개 전환의 양 채널을 평가한다.
// 참조 파형과 캡처가 필요하며, 불완전한 입력은 예외 또는 실패 사유로 반환한다. 파일은 변경하지 않는다.
import {isDeepStrictEqual} from 'node:util';
import {evaluateProcessingTransition} from './audio-processing-metrics.mjs';

/** @typedef {import('./audio-signal.mjs').CaptureWindow} Capture */
/** @typedef {{status:'passed'|'failed'|'inconclusive',reason:string,anchor?:number,maxResidual?:number}} Assessment */
/** @typedef {{status:'passed',reason:string,period:number,before:number[][],after:number[][]}|{status:'failed'|'inconclusive',reason:string}} Reference */
/** @typedef {{frame:number,afterFrame:number}} Action */
/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('signed-object');return /** @type {Record<string,unknown>} */(value);}
/** @param {unknown} value @returns {unknown[]} */
function array(value){if(!Array.isArray(value))throw Error('signed-array');return value;}
/** @param {unknown} value @returns {Capture} */
export function validateSignedCapture(value){
  const c=record(value);
  if(!Number.isSafeInteger(c.start)||!Number.isSafeInteger(c.end)||Number(c.start)<0||Number(c.end)<=Number(c.start)||
    !Number.isSafeInteger(c.rate)||Number(c.rate)<=0)throw Error('signed-capture');
  const channels=array(c.channels);
  if(channels.length!==2||channels.some(channel=>!Array.isArray(channel)||channel.length!==Number(c.end)-Number(c.start)||
    Array.from(channel).some(sample=>typeof sample!=='number'||!Number.isFinite(sample))))throw Error('signed-samples');
  return /** @type {Capture} */(/** @type {unknown} */(c));
}
/** @param {Capture} c @returns {Assessment|null} */
function signedStereo(c){
  for(const channel of c.channels){let min=Infinity,max=-Infinity;for(const sample of channel){min=Math.min(min,sample);max=Math.max(max,sample);}
    if(min>=-1e-4||max<=1e-4)return {status:'failed',reason:'signed-polarity'};}
  for(let i=0;i<c.end-c.start;i++)if(Math.abs(Number(c.channels[0].at(i))-Number(c.channels[1].at(i)))>1e-6)return {status:'failed',reason:'signed-stereo'};
  return null;
}
/** Endpoint-only selection: the changing window is intentionally not an argument.
 * @param {{frequency:number,before:Capture,after:Capture}} input @returns {Reference} */
export function deriveSignedReference({frequency,before,after}){
  if(![250,750,1000].includes(frequency)||before.rate!==48000||after.rate!==48000)return {status:'inconclusive',reason:'signed-unsupported'};
  if(Math.min(before.end-before.start,after.end-after.start)<3*48000/frequency)return {status:'inconclusive',reason:'signed-reference-window'};
  const fault=signedStereo(before)||signedStereo(after);if(fault)return {status:fault.status==='failed'?'failed':'inconclusive',reason:fault.reason};
  const base=48000/frequency,limit=Math.floor(Math.min(before.end-before.start,after.end-after.start)/3);
  for(let period=base;period<=limit;period+=base){
    const templates=[before,after].map(c=>c.channels.map(channel=>{
      return Array.from({length:period},(_,phase)=>{const offset=(phase-c.start%period+period)%period;
        return (Number(channel.at(offset))+Number(channel.at(offset+period)))/2;});
    }));
    let stable=true;
    for(const [index,c]of [before,after].entries())for(const [channel,samples]of c.channels.entries())for(let i=0;i<samples.length;i++){
      if(Math.abs(Number(samples.at(i))-Number(templates.at(index)?.at(channel)?.at((c.start+i)%period)))>1e-6){stable=false;break;}
    }
    if(!stable)continue;
    const first=/** @type {number[][]} */(templates[0]),last=/** @type {number[][]} */(templates[1]);
    let difference=0;for(let c=0;c<2;c++)for(let i=0;i<period;i++)difference=Math.max(difference,Math.abs(Number(first.at(c)?.at(i))-Number(last.at(c)?.at(i))));
    if(difference<1e-4)return {status:'inconclusive',reason:'signed-unidentifiable'};
    return {status:'passed',reason:'signed-reference',period,before:first,after:last};
  }
  return {status:'inconclusive',reason:'signed-reference-unstable'};
}

/** @param {{reference:Reference,change:Capture,action:Action,traceBinding:Assessment|null}} input @returns {Assessment} */
export function evaluateSignedChange({reference,change,action,traceBinding}){
  if(reference.status!=='passed')return reference;
  if(change.rate!==48000)return {status:'inconclusive',reason:'signed-unsupported'};
  const fault=signedStereo(change);if(fault)return fault;
  const upper=Math.min(action.afterFrame,change.end-480);
  if(!Number.isSafeInteger(action.frame)||!Number.isSafeInteger(action.afterFrame)||action.frame<change.start||upper<action.frame||upper-action.frame>1440)
    return {status:'inconclusive',reason:'signed-action-window'};
  const anchors=Array.from({length:upper-action.frame+1},(_,i)=>action.frame+i);
  const match=matchSignedAnchors(reference,change,anchors);
  if(match.status!=='passed')return match;
  if(traceBinding&&traceBinding.status!=='passed')return traceBinding;
  if(traceBinding&&traceBinding.anchor!==match.anchor)return {status:'failed',reason:'signed-trace-anchor'};
  return match;
}

/** 각 후보의 전체 창을 두 채널에서 비교한다. @param {Extract<Reference,{status:'passed'}>} reference @param {Capture} change @param {number[]} anchors @returns {Assessment} */
export function matchSignedAnchors(reference,change,anchors){
  const fault=signedStereo(change);if(fault)return fault;
  /** @type {{anchor:number,maxResidual:number}[]} */const matches=[];
  for(const anchor of anchors){
    let residual=0;
    for(let c=0;c<2;c++){
      for(let i=0;i<change.end-change.start;i++){
        const frame=change.start+i,phase=frame%reference.period,w=Math.max(0,Math.min(1,(frame-anchor)/480));
        const expected=(1-w)*Number(reference.before.at(c)?.at(phase))+w*Number(reference.after.at(c)?.at(phase));
        residual=Math.max(residual,Math.abs(Number(change.channels.at(c)?.at(i))-expected));
        if(residual>1e-6)break;
      }
      if(residual>1e-6)break;
    }
    if(residual<=1e-6)matches.push({anchor,maxResidual:residual});
  }
  if(matches.length!==1)return {status:matches.length?'inconclusive':'failed',reason:matches.length?'signed-anchor-ambiguous':'signed-transition-mismatch'};
  return {status:'passed',reason:'signed-crossfade',...matches[0]};
}

/** @param {unknown} raw @param {Action} action @param {boolean} enabled @param {{start:number,end:number}} window @returns {Assessment} */
function traceForAction(raw,action,enabled,window){
  const events=array(record(raw).events).map(record),pairs=[];
  for(const node of [0,1]){
    const branch=events.filter(row=>row.node===node),starts=branch.map((row,index)=>({row,index})).filter(({row})=>
      row.method==='cancelScheduledValues'&&Number(row.time)>=action.frame/48000&&Number(row.time)<=action.afterFrame/48000);
    if(starts.length!==1)return {status:'failed',reason:'signed-trace-count'};
    const index=Number(starts[0]?.index),next=branch.findIndex((row,i)=>i>index&&row.method==='cancelScheduledValues');
    const triple=branch.slice(index,next===-1?branch.length:next),from=node===0?(enabled?1:0):(enabled?0:1);
    const overlapping=branch.filter(row=>Number(row.time)>=window.start/48000&&Number(row.time)<window.end/48000);
    if(!isDeepStrictEqual(overlapping,triple))return {status:'failed',reason:'signed-trace-overlap'};
    if(triple.length!==3||!isDeepStrictEqual(triple.map(row=>row.method),['cancelScheduledValues','setValueAtTime','linearRampToValueAtTime'])||
      triple[0]?.value!==null||triple[1]?.value!==from||triple[2]?.value!==1-from||triple[0]?.time!==triple[1]?.time)
      return {status:'failed',reason:'signed-trace-direction'};
    const time=Number(triple[1]?.time),end=Number(triple[2]?.time),anchor=Math.round(time*48000);
    if(time!==anchor/48000)return {status:'inconclusive',reason:'signed-trace-subframe'};
    if(end!==time+.01||Math.round(end*48000)-anchor!==480)return {status:'failed',reason:'signed-trace-duration'};
    pairs.push({time,end,anchor});
  }
  if(!isDeepStrictEqual(pairs[0],pairs[1]))return {status:'failed',reason:'signed-trace-pair'};
  return {status:'passed',reason:'signed-trace',anchor:Number(pairs[0]?.anchor)};
}

/** @param {{diagnostic:unknown,transitions:unknown}} input */
export function assessSignedTransitions({diagnostic,transitions}){
  return assessSignedRows({diagnostic,transitions});
}

/** 같은 순서·수치 게이트에서 master PCM의 수락 좌표만 대상에 따라 결정한다.
 * @typedef {{group:number,frequency:number,enabled:boolean,before:Capture,change:Capture,after:Capture,action:Action}} MasterInput
 * @param {{diagnostic:unknown,transitions:unknown}} input @param {(input:MasterInput)=>Assessment} [workletMaster] */
export function assessSignedRows({diagnostic,transitions},workletMaster){
  const d=record(diagnostic),rows=array(transitions).map(record),captures=array(d.captures).map(record),actions=array(d.actions).map(record);
  const steps=[['gain',1.5],['gain',2],['gain',0],['gain',1],['enabled',false],['enabled',true]];
  if(rows.length!==18||captures.length!==18||actions.length!==6)throw Error('signed-transition-shape');
  /** @type {(Assessment&{frequency:number,kind:string,value:unknown})[]} */const results=[];
  for(const [index,row]of rows.entries()){
    const frequency=Number(row.frequency),kind=String(row.kind);
    if(frequency!==[250,750,1000].at(Math.floor(index/6))||!isDeepStrictEqual([row.kind,row.value],steps.at(index%6)))throw Error('signed-transition-input');
    const gate=evaluateProcessingTransition(row.before,row.change,row.after,kind==='enabled'?'master':'component');
    /** @type {Assessment} */let assessment={status:gate.length?'failed':'passed',reason:gate.length?gate.join(','):'both-channel-gate'};
    if(kind==='enabled'){
      const group=Math.floor(index/6)*2+(row.value===true?1:0),raw=captures.slice(group*3,group*3+3);
      for(const [i,c]of raw.entries())if(!isDeepStrictEqual(c.transition,{frequency,value:row.value,frame:actions.at(group)?.frame})||c.phase!==['before','change','after'].at(i))throw Error('signed-capture-order');
      const [before,change,after]=raw.map(c=>validateSignedCapture(c.capture)),action=/** @type {Action} */(/** @type {unknown} */(actions.at(group)));
      if(!before||!change||!after)throw Error('signed-capture-shape');
      const signed=workletMaster?workletMaster({group,frequency,enabled:row.value===true,before,change,after,action}):evaluateSignedChange({reference:deriveSignedReference({frequency,before,after}),change,action,
        traceBinding:d.traceEnabled===true?traceForAction(d.trace,action,row.value===true,{start:before.start,end:after.end}):null});
      if(!gate.length)assessment=signed;
    }
    results.push({...assessment,frequency,kind,value:row.value});
  }
  const status=results.some(row=>row.status==='failed')?'failed':results.some(row=>row.status==='inconclusive')?'inconclusive':'passed';
  return {status,transitions:results,failures:results.filter(row=>row.status!=='passed').map(row=>`${row.frequency}/${row.kind}/${row.value}/${row.status}/${row.reason}`)};
}
