import {validateProcessingCapture,equalizerResponseDb,normalizerMeasurementCases,evaluateNormalizerOutputBins,rapidMasterStimuli} from './audio-processing-metrics.mjs';
import {summarizeCapture} from './audio-signal.mjs';
import {isDeepStrictEqual} from 'node:util';

/** @typedef {{kind:string,sourceEpoch:number,seq?:number,frame?:number,meterEpoch?:number,meterSeq?:number,observedTime?:number,active?:boolean,leftPower?:number,rightPower?:number,targetDbfs?:number,wanted?:boolean,normalizer?:boolean,gain?:number|null,code?:string|null,application?:unknown,renderHeadroom?:unknown}} Packet */
/** @typedef {{order:number,direction:string,packet:Packet}} Event */
/** @typedef {{send:Event,accepted?:Event,completed?:Event,retired?:Event,done?:number}} Command */
/** @typedef {{send:Event,ack?:Event}} Meter */
/** @param {unknown} value @returns {Record<string,unknown>|null} */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?/** @type {Record<string,unknown>} */(value):null;
/** @param {unknown} value @returns {value is number} */
const safe=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
/** @param {unknown} value @param {number} low @param {number} high @returns {value is number} */
const range=(value,low,high)=>typeof value==='number'&&Number.isFinite(value)&&value>=low&&value<=high;
/** @param {Record<string,unknown>} value @param {string} expected */
const keys=(value,expected)=>Object.keys(value).sort().join(',')===expected;
/** @param {string} reason @returns {never} */
function unavailable(reason){throw Error(reason);}
const limits={originalNative7Witness:'UNASSESSED',frameOrigin:'UNPROVEN',overallQualification:false,originalNormalizerEndpointSlopeCadenceMatrix:'UNRUN'};

/** Canonical packets only; no nonfinite wire power or guessed defaults.
 * @param {unknown} raw @param {string} direction @param {boolean} current @returns {Packet}
 */
function packet(raw,direction,current,headroom=false){
  const p=record(raw);if(!p||!safe(p.sourceEpoch)||p.sourceEpoch===0)unavailable('packet-source');let valid=false;
  if(direction==='send'){
    if(p.kind==='configure')valid=keys(p,'dynamics,eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted')&&safe(p.seq)&&p.seq>0&&typeof p.wanted==='boolean'&&typeof p.normalizer==='boolean'&&typeof p.dynamics==='boolean'&&range(p.gain,0,2)&&range(p.targetDbfs,-30,-12)&&Array.isArray(p.eq)&&p.eq.length===8&&p.eq.every(v=>range(v,-6,6));
    else if(p.kind==='retire')valid=keys(p,'kind,seq,sourceEpoch')&&safe(p.seq)&&p.seq>0;
    else if(p.kind==='power'||p.kind==='read-error')valid=keys(p,p.kind==='power'?'active,kind,leftPower,meterEpoch,meterSeq,observedTime,rightPower,sourceEpoch,targetDbfs':'kind,meterEpoch,meterSeq,observedTime,sourceEpoch')&&safe(p.meterEpoch)&&safe(p.meterSeq)&&p.meterSeq>0&&range(p.observedTime,0,Number.MAX_VALUE)&&(p.kind==='read-error'||typeof p.active==='boolean'&&range(p.leftPower,0,Number.MAX_VALUE)&&range(p.rightPower,0,Number.MAX_VALUE)&&range(p.targetDbfs,-30,-12));
  }else if(direction==='receive'){
    const a=record(p.application),applied=p.application===null||!!a&&keys(a,'commandSeq,end,frame,fromDb,meterEpoch,meterSeq,mode,sourceEpoch,start,toDb')&&
      safe(a.sourceEpoch)&&safe(a.meterEpoch)&&safe(a.meterSeq)&&safe(a.commandSeq)&&safe(a.frame)&&['hold','warmup','ramp','error'].includes(String(a.mode))&&
      a.sourceEpoch===p.sourceEpoch&&a.meterEpoch===p.meterEpoch&&a.meterSeq===p.seq&&a.commandSeq>0&&a.frame===p.frame&&a.mode===p.code&&
      range(a.fromDb,-12.0001,6.0001)&&range(a.toDb,-12.0001,6.0001)&&range(a.start,0,Number.MAX_VALUE)&&range(a.end,Number(a.start),Number.MAX_VALUE);
    const h=record(p.renderHeadroom),render=p.renderHeadroom===null||!!h&&keys(h,'commandSeq,endFrame,eq,headroom,sourceEpoch,startFrame')&&h.sourceEpoch===p.sourceEpoch&&safe(h.commandSeq)&&h.commandSeq>0&&h.startFrame===p.frame&&safe(h.endFrame)&&h.endFrame>Number(h.startFrame)&&h.endFrame<=Number(h.startFrame)+1024&&Array.isArray(h.eq)&&h.eq.length===8&&h.eq.every(v=>range(v,-6,6))&&range(h.headroom,Number.MIN_VALUE,1);
    valid=keys(p,current&&p.kind==='meter-accepted'?(headroom?'application,code,frame,gain,kind,meterEpoch,renderHeadroom,seq,sourceEpoch':'application,code,frame,gain,kind,meterEpoch,seq,sourceEpoch'):'code,frame,gain,kind,meterEpoch,seq,sourceEpoch')&&
      (!current||p.kind!=='meter-accepted'||applied)&&(!headroom||p.kind!=='meter-accepted'||render)&&['prepared','accepted','completed','retired','meter-accepted','rejected','failed'].includes(String(p.kind))&&safe(p.seq)&&safe(p.frame)&&safe(p.meterEpoch)&&(p.kind==='completed'?range(p.gain,0,2):p.gain===null)&&(p.code===null||typeof p.code==='string'&&p.code.length<=80);
  }
  if(!valid)unavailable('packet-shape');return /** @type {Packet} */(/** @type {unknown} */(p));
}

/** @param {Record<string,unknown>} evidence @param {number} rate @param {number} end @param {boolean} current */
function history(evidence,rate,end,current,headroom=false){
  const initial=record(evidence.initial),ledger=record(evidence.ledger);
  if(evidence.schema!==(headroom?'f01-oracle-evidence-v3':current?'f01-oracle-evidence-v2':'f01-oracle-evidence-v1')||!initial||current&&initial.normalizerWitness!==true||headroom&&initial.headroomWitness!==true||initial.available!==true||initial.reason!==null||!safe(initial.sourceEpoch)||initial.sourceEpoch===0||!['raw','silent-hold'].includes(String(initial.initial)))unavailable('initial-unavailable');
  if(!ledger||ledger.schema!==(headroom?'f01-control-ledger-v3':current?'f01-control-ledger-v2':'f01-control-ledger-v1')||ledger.available!==true||ledger.reason!==null||!Array.isArray(ledger.events)||!safe(ledger.eventCount)||ledger.eventCount!==ledger.events.length||ledger.eventCount>4128||ledger.maxEvents!==4128||!safe(ledger.bytes)||ledger.bytes>1048576||ledger.maxBytes!==1048576||new TextEncoder().encode(JSON.stringify(ledger)).length>ledger.bytes)unavailable('full-ledger-unavailable');
  /** @type {Map<number,Command>} */const commands=new Map();
  /** @type {Map<number,Meter>} */const meters=new Map();
  /** @type {Event|null} */let prepared=null;let commandSeq=0,meterSeq=0;
  for(const [index,raw]of ledger.events.entries()){
    const row=record(raw);if(!row||!keys(row,'direction,order,packet')||row.order!==index+1||!['send','receive'].includes(String(row.direction)))unavailable('ledger-order');
    const p=packet(row.packet,String(row.direction),current,headroom),event={order:index+1,direction:String(row.direction),packet:p};if(p.sourceEpoch!==initial.sourceEpoch)unavailable('multiple-source-history');
    if(event.direction==='receive'&&!prepared&&p.kind!=='prepared')unavailable('prepared-order');
    if(event.direction==='send'){
      if(p.kind==='configure'||p.kind==='retire'){const seq=Number(p.seq);if(seq<=commandSeq)unavailable('command-sequence');commandSeq=seq;commands.set(seq,{send:event});}
      else{const seq=Number(p.meterSeq);if(seq<=meterSeq)unavailable('meter-sequence');meterSeq=seq;meters.set(seq,{send:event});}
    }else if(p.kind==='prepared'){
      if(prepared||p.seq!==0||p.meterEpoch!==0||p.code!==null)unavailable('prepared-anchor');prepared=event;
    }else if(p.kind==='meter-accepted'){
      const item=meters.get(Number(p.seq));if(!item||item.ack||!['hold','warmup','ramp','error'].includes(String(p.code)))unavailable('meter-ack');item.ack=event;
    }else{
      if(p.kind==='failed'||p.kind==='rejected'||p.code!==null)unavailable('failed-lifecycle');
      const item=commands.get(Number(p.seq));if(!item)unavailable('orphan-command-reply');
      if(p.kind==='accepted'){if(item.accepted||item.send.packet.kind!=='configure')unavailable('command-accepted');item.accepted=event;}
      else if(p.kind==='completed'){if(item.completed||!item.accepted||item.send.packet.kind!=='configure')unavailable('command-completed');item.completed=event;}
      else if(p.kind==='retired'){if(item.retired||item.send.packet.kind!=='retire')unavailable('command-retired');item.retired=event;}
    }
  }
  if(!prepared)unavailable('prepared-missing');const start=Number(prepared.packet.frame);if(end<=start||end-start>20*rate)unavailable('history-bound');
  /** @type {Map<number,Command>} */const commandFrames=new Map();
  /** @type {Map<number,Meter>} */const meterFrames=new Map();const excludedFuturePosts=0;
  const bounded=/** @param {number} frame */frame=>{if(!safe(frame)||frame<start||frame-start>20*rate)unavailable('history-frame');};
  let priorCommandFrame=-1,priorCommandOrder=0,priorMeterFrame=-1,priorMeterOrder=0;
  for(const item of commands.values()){
    const ack=item.send.packet.kind==='retire'?item.retired:item.accepted;if(!ack)unavailable('command-ack-missing');const f=Number(ack.packet.frame);bounded(f);if(f<priorCommandFrame||ack.order<=priorCommandOrder)unavailable('command-ack-order');if(commandFrames.has(f))unavailable('same-frame-commands');commandFrames.set(f,item);priorCommandFrame=f;priorCommandOrder=ack.order;
    if(item.completed){bounded(Number(item.completed.packet.frame));if(Number(item.completed.packet.frame)<f)unavailable('completion-before-acceptance');}
  }
  for(const item of meters.values()){
    if(Number(item.send.packet.observedTime)>start/rate+20)unavailable('history-observed-time');
    if(!item.ack)unavailable('meter-ack-missing');
    const f=Number(item.ack.packet.frame);bounded(f);if(f<priorMeterFrame||item.ack.order<=priorMeterOrder)unavailable('meter-ack-order');if(meterFrames.has(f))unavailable('same-frame-meters');meterFrames.set(f,item);priorMeterFrame=f;priorMeterOrder=item.ack.order;
  }
  return {start,initial:String(initial.initial),commandFrames,meterFrames,excludedFuturePosts,commandCount:commands.size,meterCount:meters.size,eventCount:ledger.eventCount};
}

/** @typedef {{from:number,to:number,start:number,end:number,last:number|null,warm:number|null,power:number|null,silent:number}} Normalizer */
/** @param {Normalizer} n @param {number} time */
const dbAt=(n,time)=>n.end>n.start?n.from+(n.to-n.from)*Math.max(0,Math.min(1,(time-n.start)/(n.end-n.start))):n.to;
/** @param {Normalizer} n @param {number} time @param {number} db @param {number} seconds */
function schedule(n,time,db,seconds){n.from=dbAt(n,time);n.to=db;n.start=time;n.end=time+seconds;}
/** Independent published normalizer equations; never calls the production helper.
 * @param {Normalizer} n @param {number} time @param {Packet} p @param {number} window
 */
function step(n,time,p,window){
  const current=dbAt(n,time),dt=n.last===null?null:time-n.last,stale=time-Number(p.observedTime)>.2||Number(p.observedTime)>time;
  const reset=()=>{n.power=null;n.silent=0;n.warm=null;n.last=null;};
  if(stale||p.kind==='power'&&p.active!==true){reset();schedule(n,time,current,0);return 'hold';}
  if(p.kind==='read-error'){reset();schedule(n,time,0,.01);return 'error';}
  n.last=time;if(dt!==null&&(dt<=0||dt>.2)){n.power=null;n.silent=0;n.warm=time;schedule(n,time,current,0);return 'hold';}
  n.warm??=time;if(time-n.warm<window||dt===null){schedule(n,time,current,0);return 'warmup';}
  const power=Math.max(Number(p.leftPower),Number(p.rightPower));n.power=n.power===null?power:n.power+(power-n.power)*(1-Math.exp(-dt/.75));
  const silent=power<=10**(-55/10);n.silent=silent?n.silent+dt:0;
  let desired=Math.max(-12,Math.min(6,Number(p.targetDbfs)-10*Math.log10(Math.max(1e-12,n.power)))),down=1.2;
  if(silent&&n.silent>=2){desired=0;down=.1;}else if(silent)desired=Math.min(desired,current);
  schedule(n,time,Math.max(current-down,Math.min(current+.1,desired)),.1);
  return 'ramp';
}

/** @param {Record<string,unknown>} input */
function compare(input){
  const scoped=input.schema==='f01-l1-normalizer-input-source-owner-v1',headroom=scoped||input.schema==='f01-l1-normalizer-input-v3',current=headroom||input.schema==='f01-l1-normalizer-input-v2';
  if(!keys(input,'control,evidence,observation,program,sampleRate,schema,source')||!['f01-l1-normalizer-input-v1','f01-l1-normalizer-input-v2','f01-l1-normalizer-input-v3','f01-l1-normalizer-input-source-owner-v1'].includes(String(input.schema))||typeof input.sampleRate!=='number'||![44100,48000,96000].includes(input.sampleRate))unavailable('input-schema');
  const rate=input.sampleRate,source=validateProcessingCapture(input.source),program=validateProcessingCapture(input.program),control=record(input.control),observation=record(input.observation),evidence=record(input.evidence);
  if(source.rate!==rate||source.end-source.start>rate*1.5||program.rate!==rate||program.start!==source.start||program.end!==source.end||!control||control.rate!==rate||control.start!==source.start||control.end!==source.end||!Array.isArray(control.channels)||control.channels.length!==5)unavailable('window-formation');
  for(const c of control.channels){if((!Array.isArray(c)&&!(c instanceof Float32Array)&&!(c instanceof Float64Array))||c.length!==source.end-source.start)unavailable('control-shape');for(const v of c)if(typeof v!=='number'||!Number.isFinite(v))unavailable('control-nonfinite');}
  if(scoped){
    const selected=record(observation?.selected);
    if(!observation||!keys(observation,'contextId,contextState,elementId,error,hidden,l1Nodes,schema,selected,sources')||observation.schema!=='f01-source-owner-normalizer-observation-v1'||observation.sources!==1||observation.l1Nodes!==3||observation.contextId!==1||observation.elementId!==1||observation.error!==null||observation.contextState!=='running'||observation.hidden!==false||!selected||!keys(selected,'nodeId,portId,producerId,sourceEpoch')||selected.nodeId!==3||selected.portId!==3||selected.producerId!==4||!safe(selected.sourceEpoch)||selected.sourceEpoch===0||selected.sourceEpoch!==record(evidence?.initial)?.sourceEpoch)unavailable('source-owner-formation');
  }else if(!observation||observation.sources!==1||observation.l1Nodes!==1||observation.invalidFrames!==0||observation.streamError!==''||observation.contextState!=='running'||observation.hidden!==false)unavailable('global-formation');
  if(!evidence)unavailable('evidence-missing');const h=history(evidence,rate,source.end,current,headroom);if(source.start<h.start)unavailable('window-before-construction');
  const D=rate===44100?264:rate===48000?288:576,W=2**Math.ceil(Math.log2(rate*.25))/rate;
  /** @type {Normalizer} */let n={from:0,to:0,start:h.start/rate,end:h.start/rate,last:null,warm:null,power:null,silent:0};
  let wanted=h.initial==='silent-hold',normEnabled=false,epoch=0,mode='DISABLED',qEnd=h.start,ignoredMeters=0,usedMeters=0;
  /** @type {Command|null} */let job=null;
  const finish=/** @param {number} nextFrame */nextFrame=>{if(!job)return;const done=Number(job.done),completed=job.completed;
    if(completed&&(Number(completed.packet.frame)!==done||Number(completed.packet.meterEpoch)!==Number(job.accepted?.packet.meterEpoch)||nextFrame<=done))unavailable('completion-history');
    if(!completed&&done<Math.min(nextFrame,source.end))unavailable('completion-missing');};
  let maxDbError=0,firstDb=0,lastDb=0,minDb=Infinity,maxDb=-Infinity;
  /** @type {{frame:number,expectedDb:number,actualN:number,errorDb:number|null}|null} */let firstMismatch=null;
  for(let frame=h.start;frame<source.end;frame++){
    const command=h.commandFrames.get(frame),meter=h.meterFrames.get(frame),time=frame/rate;
    if(command){
      finish(frame);if(command.send.packet.kind==='retire')unavailable('retired-window');const p=command.send.packet,on=p.wanted===true,master=on!==wanted,normChange=p.normalizer!==normEnabled,oldDb=dbAt(n,time);
      if(master||normChange)epoch++;if(command.accepted?.packet.meterEpoch!==epoch)unavailable('command-epoch');
      if(!on&&!master){command.done=Math.max(frame,Number(job?.done??frame));}
      else{
        if(master)qEnd=on?frame+.01*rate:frame+.03*rate+D;
        const gainStart=frame+(master&&on?.01*rate:0),gainEnd=gainStart+(master?.02:.01)*rate,eqEnd=gainStart+(on||master?.02*rate:0);
        command.done=Math.ceil(Math.max(qEnd,eqEnd,gainEnd+D));wanted=on;normEnabled=p.normalizer===true;
        if(!on&&master){mode='OFF-HOLD';schedule(n,time,oldDb,0);}
        else if(on&&!normEnabled){mode='RETIRE';schedule(n,time,0,.01);}
        else if(on&&normEnabled&&(master||normChange)){mode='RUN';n={from:oldDb,to:oldDb,start:time,end:time,last:null,warm:null,power:null,silent:0};}
      }job=command;
    }
    if(mode==='OFF-HOLD'&&frame>=qEnd){const start=Math.ceil(qEnd)/rate;schedule(n,start,0,.01);mode='RETIRE';}
    if(mode==='RETIRE'&&time>=n.end)mode='DISABLED';
    if(meter){
      if(headroom&&meter.ack?.packet.renderHeadroom!==null&&record(meter.ack?.packet.renderHeadroom)?.commandSeq!==job?.send.packet.seq)unavailable('render-headroom-command');
      if(meter.ack?.packet.meterEpoch!==epoch)unavailable('meter-ack-current-epoch');
      if(mode==='RUN'&&meter.send.packet.meterEpoch===epoch){
        const expectedMode=step(n,time,meter.send.packet,W);usedMeters++;
        if(current){const a=record(meter.ack?.packet.application),p=meter.send.packet;
          if(!a||a.sourceEpoch!==p.sourceEpoch||a.meterEpoch!==p.meterEpoch||a.meterSeq!==p.meterSeq||a.commandSeq!==job?.send.packet.seq||a.frame!==frame||a.mode!==expectedMode||meter.ack?.packet.code!==expectedMode||
            [['fromDb',n.from],['toDb',n.to],['start',n.start],['end',n.end]].some(([key,value])=>typeof a[String(key)]!=='number'||Math.abs(Number(a[String(key)])-Number(value))>1e-10))unavailable('normalizer-application-mismatch');
        }
      }else{ignoredMeters++;if(current&&meter.ack?.packet.application!==null)unavailable('normalizer-ignored-application');}
    }
    if(frame<source.start)continue;const expectedDb=dbAt(n,time),actualN=Number(control.channels[3][frame-source.start]),errorDb=actualN>0?Math.abs(20*Math.log10(actualN)-expectedDb):null;
    if(frame===source.start)firstDb=expectedDb;lastDb=expectedDb;minDb=Math.min(minDb,expectedDb);maxDb=Math.max(maxDb,expectedDb);
    if(errorDb===null||errorDb>=.001){firstMismatch??={frame,expectedDb,actualN,errorDb};}if(errorDb!==null)maxDbError=Math.max(maxDbError,errorDb);
  }finish(Infinity);
  return {schema:scoped?'f01-l1-normalizer-comparison-source-owner-v1':headroom?'f01-l1-normalizer-comparison-v3':current?'f01-l1-normalizer-comparison-v2':'f01-l1-normalizer-comparison-v1',status:firstMismatch?'diagnostic-mismatch':'diagnostic-match',reason:null,...limits,
    ...(scoped?{observationScope:{l1Nodes:observation.l1Nodes,selected:observation.selected}}:{}),
    ...(current?{applicationComparison:{matched:usedMeters,ignored:ignoredMeters,tolerance:1e-10}}:{}),
    prediction:{start:source.start,end:source.end,frames:source.end-source.start,firstDb,lastDb,minDb,maxDb},comparison:{subject:'actual control5 channel3 N only',toleranceDb:.001,maxDbError,firstMismatch},
    history:{constructionFrame:h.start,events:h.eventCount,commands:h.commandCount,meters:h.meterCount,usedMeters,ignoredMeters,excludedFuturePosts:h.excludedFuturePosts,windowSeconds:W},
    authority:'Written L1 command-before-meter/render, q20ms+D then10ms, N retirement10ms; original published FFT/EMA.75/100ms/clamp/rate/silence rules. Frame identity and full Native7/endpoint/slope/cadence/matrix qualification remain unproven.'};
}

/** Incomplete/global-failed histories never produce a salvaged prefix comparison.
 * @param {unknown} raw
 */
export function compareL1Normalizer(raw){
  const scoped=record(raw)?.schema==='f01-l1-normalizer-input-source-owner-v1',headroom=scoped||record(raw)?.schema==='f01-l1-normalizer-input-v3',current=headroom||record(raw)?.schema==='f01-l1-normalizer-input-v2';
  try{const input=record(raw);if(!input)unavailable('input-schema');return compare(input);}
  catch(error){return {schema:scoped?'f01-l1-normalizer-comparison-source-owner-v1':headroom?'f01-l1-normalizer-comparison-v3':current?'f01-l1-normalizer-comparison-v2':'f01-l1-normalizer-comparison-v1',status:'UNAVAILABLE',reason:error instanceof Error?error.message:'unavailable',...limits};}
}


/** The first receipt after the fixed measurement wins, including a malformed/null observation.
 * @param {unknown} raw @param {unknown} targetRaw @param {readonly number[]} levels @param {number} rate @param {number} afterFrame
 */
export function assessRenderHeadroom(raw,targetRaw,levels,rate,afterFrame){
  const base={native3Witness:'UNASSESSED',overallQualification:false};
  try{
    if(![44100,48000,96000].includes(rate)||!safe(afterFrame)||levels.length!==8||levels.some(v=>!range(v,-6,6)))unavailable('headroom-spec');
    const evidence=record(raw),target=record(targetRaw),command=record(target?.command),p=record(command?.message),completed=record(target?.completed),accepted=record(target?.accepted);
    if(!evidence||!p||!completed||!accepted||!Array.isArray(p.eq)||!p.eq.every((v,i)=>v===levels[i])||!safe(completed.frame)||afterFrame<completed.frame)unavailable('headroom-target');
    const h=history(evidence,rate,afterFrame+128,true,true),events=/** @type {Event[]} */(record(evidence.ledger)?.events);
    const job=[...h.commandFrames.values()].find(c=>c.send.packet.seq===p.seq);
    if(!job||!isDeepStrictEqual(job.send.packet,p)||!isDeepStrictEqual(job.completed?.packet,completed)||!isDeepStrictEqual(job.accepted?.packet,accepted))unavailable('headroom-target-history');
    const first=events.find(e=>e.direction==='receive'&&e.packet.kind==='meter-accepted'&&Number(e.packet.frame)>=afterFrame),receipt=record(first?.packet),render=record(receipt?.renderHeadroom);
    if(!receipt||!render||receipt.sourceEpoch!==p.sourceEpoch||receipt.meterEpoch!==accepted.meterEpoch||render.commandSeq!==p.seq||render.startFrame!==receipt.frame||render.endFrame!==Number(render.startFrame)+128||!Array.isArray(render.eq)||!render.eq.every((v,i)=>v===levels[i]))unavailable('headroom-first-receipt');
    const latest=[...h.commandFrames.entries()].filter(([frame])=>frame<=Number(render.startFrame)).at(-1)?.[1];if(latest?.send.packet.seq!==p.seq)unavailable('headroom-target-changed');
    const expectedDb=0-levels.reduce((sum,v)=>sum+Math.max(0,v),0),actualDb=20*Math.log10(Number(render.headroom)),errorDb=Math.abs(actualDb-expectedDb),passed=errorDb<.01;
    return {schema:'f01-render-headroom-assessment-v1',passed,status:passed?'matched':'mismatch',reason:null,expectedDb,actualDb,errorDb,toleranceDb:.01,frame:Number(render.endFrame)-1,startFrame:render.startFrame,endFrame:render.endFrame,commandSeq:p.seq,meterSeq:receipt.seq,...base};
  }catch(error){return {schema:'f01-render-headroom-assessment-v1',passed:false,status:'UNAVAILABLE',reason:error instanceof Error?error.message:'headroom-invalid',...base};}
}

export const PACKAGED_NORMALIZER_CASES=Object.freeze(normalizerMeasurementCases().map(c=>Object.freeze(c)));
if(PACKAGED_NORMALIZER_CASES.length!==60||new Set(PACKAGED_NORMALIZER_CASES.map(c=>c.id)).size!==60)throw Error('normalizer-registry');
/** @param {unknown} id */
export function selectNormalizerCase(id){const spec=PACKAGED_NORMALIZER_CASES.find(c=>c.id===id);if(!spec)throw Error('audio-normalizer-case');return spec;}
export const PACKAGED_NORMALIZER_CASE=selectNormalizerCase('48000/normalizer/-24/stereo');
/** @typedef {{id:string,sampleRate:number,inputDbfs:number,pattern:'silence'|'noise'|'bursts'|'tone-silence',phase:number,seconds:number}} NormalizerSignalSpec */
/** @type {readonly Readonly<NormalizerSignalSpec>[]} */
export const PACKAGED_NORMALIZER_SIGNAL_CASES=Object.freeze([44100,48000,96000].flatMap(sampleRate=>/** @type {NormalizerSignalSpec[]} */([
  {id:sampleRate+'/normalizer-control/silence',sampleRate,inputDbfs:-24,pattern:'silence',phase:.37,seconds:3.5},
  {id:sampleRate+'/normalizer-control/noise',sampleRate,inputDbfs:-70,pattern:'noise',phase:.37,seconds:3.5},
  ...[.1,2.1,4.1].map(phase=>({id:sampleRate+'/normalizer-control/bursts/'+phase,sampleRate,inputDbfs:-24,pattern:/** @type {'bursts'} */('bursts'),phase,seconds:8})),
  {id:sampleRate+'/normalizer-control/tone-silence',sampleRate,inputDbfs:-36,pattern:'tone-silence',phase:.37,seconds:17.5},
])).map(s=>Object.freeze(s)));
if(PACKAGED_NORMALIZER_SIGNAL_CASES.length!==18||new Set(PACKAGED_NORMALIZER_SIGNAL_CASES.map(s=>s.id)).size!==18)throw Error('normalizer-signal-registry');
const originalReentry=rapidMasterStimuli().find(c=>c.startPhaseMs===2&&c.milliseconds===10);
const originalReentry20=rapidMasterStimuli().find(c=>c.startPhaseMs===2&&c.milliseconds===0);
const originalReentry215=rapidMasterStimuli().find(c=>c.startPhaseMs===2&&c.milliseconds===15);
const originalReentry225=rapidMasterStimuli().find(c=>c.startPhaseMs===2&&c.milliseconds===25);
const originalReentry50=rapidMasterStimuli().find(c=>c.startPhaseMs===5&&c.milliseconds===0);
const originalReentry510=rapidMasterStimuli().find(c=>c.startPhaseMs===5&&c.milliseconds===10);
const originalReentry515=rapidMasterStimuli().find(c=>c.startPhaseMs===5&&c.milliseconds===15);
const originalReentry525=rapidMasterStimuli().find(c=>c.startPhaseMs===5&&c.milliseconds===25);
const originalReentry00=rapidMasterStimuli().find(c=>c.startPhaseMs===0&&c.milliseconds===0);
const originalReentry010=rapidMasterStimuli().find(c=>c.startPhaseMs===0&&c.milliseconds===10);
const originalReentry015=rapidMasterStimuli().find(c=>c.startPhaseMs===0&&c.milliseconds===15);
const originalReentry025=rapidMasterStimuli().find(c=>c.startPhaseMs===0&&c.milliseconds===25);
if(!originalReentry||!originalReentry20||!originalReentry215||!originalReentry225||!originalReentry50||!originalReentry510||!originalReentry515||!originalReentry525||!originalReentry00||!originalReentry010||!originalReentry015||!originalReentry025)throw Error('reentry-registry');
export const PACKAGED_REENTRY_CASE=Object.freeze({id:'44100/reentry/2/10',sampleRate:44100,frequency:1000,inputDbfs:-36,pattern:'stereo',warmupMilliseconds:6500,...originalReentry,afterMilliseconds:180,tailSeconds:.05});
export const PACKAGED_REENTRY_CASES=Object.freeze([PACKAGED_REENTRY_CASE,
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/2/0',...originalReentry20}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/2/15',...originalReentry215}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/2/25',...originalReentry225}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/5/0',...originalReentry50}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/5/10',...originalReentry510}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/5/15',...originalReentry515}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/5/25',...originalReentry525}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/0/0',...originalReentry00}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/0/10',...originalReentry010}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/0/15',...originalReentry015}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/0/25',...originalReentry025}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/0/36',startPhaseMs:0,milliseconds:36}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/0/41',startPhaseMs:0,milliseconds:41}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'44100/reentry/0/46',startPhaseMs:0,milliseconds:46}),
  Object.freeze({...PACKAGED_REENTRY_CASE,id:'96000/reentry/2/10',sampleRate:96000})]);
const normalizerError=/** @param {string} code */code=>Error('audio-normalizer-'+code);
/** @param {unknown} raw @param {typeof PACKAGED_NORMALIZER_CASE|(typeof PACKAGED_REENTRY_CASES)[number]|NormalizerSignalSpec} [spec] */
export function normalizerSignalFailures(raw,spec=PACKAGED_NORMALIZER_CASE){
  const f=record(raw),s=record(f?.signal),v=record(f?.video);
  return [...PACKAGED_NORMALIZER_CASES,...PACKAGED_REENTRY_CASES,...PACKAGED_NORMALIZER_SIGNAL_CASES].some(c=>isDeepStrictEqual(c,spec))&&f?.sampleRate===spec.sampleRate&&s?.frequency===1000&&s.inputDbfs===spec.inputDbfs&&s.pattern===spec.pattern&&s.phase===('phase'in spec?spec.phase:.37)&&s.channels===(spec.pattern==='mono'?1:2)&&s.durationSeconds===90&&s.frames===spec.sampleRate*90&&s.loop===false&&s.error===''&&v?.muted===false&&v.volume===1&&v.loop===false&&v.ended===false&&v.paused===false&&v.playbackRate===1&&range(v.currentTime,0,90)?[]:['normalizer-input-signal'];
}
/** One fresh, previously disabled N path; never a generic baseline for reactivation.
 * @param {unknown} raw @param {unknown} beforeRaw @param {unknown} requestRaw @param {typeof PACKAGED_NORMALIZER_CASE|(typeof PACKAGED_REENTRY_CASES)[number]|NormalizerSignalSpec} [spec]
 */
export function selectNormalizerTarget(raw,beforeRaw,requestRaw,spec=PACKAGED_NORMALIZER_CASE,headroomWitness=false){
  if(![...PACKAGED_NORMALIZER_CASES,...PACKAGED_REENTRY_CASES,...PACKAGED_NORMALIZER_SIGNAL_CASES].some(c=>isDeepStrictEqual(c,spec)))throw normalizerError('original-spec');
  const f=record(raw),b=record(beforeRaw),o=record(f?.productObservation),prior=record(b?.productObservation),request=record(requestRaw),initial=record(record(b?.oracleEvidence)?.initial);
  const commands=o?.commands,replies=o?.replies,old=prior?.commands,oldReplies=prior?.replies;
  if(!b||!o||!prior||!request||request.status!=='on'||!safe(request.frame)||!range(b.audioTime,0,Number.MAX_SAFE_INTEGER)||request.frame<Math.round(b.audioTime*spec.sampleRate)||
    !Array.isArray(old)||old.length!==1||!Array.isArray(oldReplies)||!Array.isArray(commands)||commands.length>64||!Array.isArray(replies)||replies.length>64||
    !isDeepStrictEqual(commands.slice(0,old.length),old)||!isDeepStrictEqual(replies.slice(0,oldReplies.length),oldReplies)||
    b.analysers!==0||b.buffers!==0||b.reads!==0||b.active100msTimers!==0||record(prior.meterDiagnostics)?.sent!==0||record(prior.meterDiagnostics)?.received!==0||
    initial?.normalizerWitness!==true||initial.available!==true||initial.reason!==null||initial.initial!=='raw'||record(b.oracleEvidence)?.schema!==(headroomWitness?'f01-oracle-evidence-v3':'f01-oracle-evidence-v2')||headroomWitness&&initial?.headroomWitness!==true||b.normalizerMeasurement!==null||b.sources!==1||prior.sources!==1||prior.l1Nodes!==1||prior.invalidFrames!==0||prior.streamError!==''||
    record(b.readback)?.state!=='on'||record(b.readback)?.wanted!==true||record(b.readback)?.sources!==1||record(b.readback)?.gain!==1||normalizerSignalFailures(b,spec).length)throw normalizerError('baseline');
  const first=record(old[0]),bp=record(first?.message),baselineDone=oldReplies.map(record).filter(r=>r?.kind==='completed');
  if(!bp||!safe(bp.sourceEpoch)||bp.sourceEpoch===0||initial.sourceEpoch!==bp.sourceEpoch||bp.seq!==1||!isDeepStrictEqual(bp,{kind:'configure',sourceEpoch:bp.sourceEpoch,seq:1,wanted:true,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:false,targetDbfs:-20})||
    baselineDone.length!==1||!safe(baselineDone[0]?.frame)||Number(baselineDone[0]?.frame)>Math.round(b.audioTime*spec.sampleRate)||record(b.readback)?.appliedGain!==1)throw normalizerError('baseline-command');
  const rows=commands.slice(old.length);if(!rows.length)return null;if(rows.length!==1)throw normalizerError('target-command-count');
  const c=record(rows[0]),p=record(c?.message);
  if(!c||!p||!safe(c.requestedFrame)||c.requestedFrame<request.frame||!safe(p.seq)||p.seq<=1||!isDeepStrictEqual(p,{kind:'configure',sourceEpoch:bp.sourceEpoch,seq:p.seq,wanted:true,gain:1,eq:Array(8).fill(0),normalizer:true,dynamics:true,targetDbfs:-20}))throw normalizerError('target-command');
  const selected=replies.map(record).filter(r=>r?.seq===p.seq),accepted=selected.filter(r=>r?.kind==='accepted'),completed=selected.filter(r=>r?.kind==='completed');
  if(accepted.length>1||completed.length>1||selected.some(r=>!r||!['accepted','completed'].includes(String(r.kind))||r.sourceEpoch!==p.sourceEpoch||r.code!==null))throw normalizerError('target-reply');
  if(!accepted.length||!completed.length)return null;const a=accepted[0],end=completed[0];
  if(!a||!end||!safe(a.frame)||!safe(end.frame)||a.frame<c.requestedFrame||end.frame<a.frame||!range(f?.audioTime,0,Number.MAX_SAFE_INTEGER)||!safe(Math.round(f.audioTime*spec.sampleRate))||end.frame>Math.round(f.audioTime*spec.sampleRate)||a.gain!==null||end.gain!==1||!safe(a.meterEpoch)||end.meterEpoch!==a.meterEpoch||replies.indexOf(a)>=replies.indexOf(end))throw normalizerError('target-ack');
  return {caseId:spec.id,command:structuredClone(c),accepted:structuredClone(a),completed:structuredClone(end)};
}
/** Raw source uses discrete channels; mono is upmixed only in the product path.
 * @param {import('./audio-signal.mjs').CaptureWindow} raw @param {typeof PACKAGED_NORMALIZER_CASE} spec
 */
export function normalizerSourceFailures(raw,spec){
  const selected=selectNormalizerCase(spec.id);if(!isDeepStrictEqual(spec,selected))throw normalizerError('original-spec');
  const source=validateProcessingCapture(raw);if(source.rate!==spec.sampleRate||source.end-source.start!==spec.sampleRate/10)throw normalizerError('source-window');
  const failures=[];
  for(const [c,row]of summarizeCapture(source,1000).channels.entries()){
    const silent=spec.pattern==='right'?c===0:(spec.pattern==='left'||spec.pattern==='mono')&&c===1;
    if(silent?row.rms>10**(-90/20):row.rms<=0||Math.abs(20*Math.log10(row.rms/10**(spec.inputDbfs/20)))>.05||row.fundamentalAmplitude===null||row.fundamentalAmplitude<=0||Math.abs(20*Math.log10(row.fundamentalAmplitude/(Math.SQRT2*10**(spec.inputDbfs/20))))>.05)failures.push('source-channel-'+c);
  }
  if(spec.pattern==='stereo'||spec.pattern==='antiphase'){
    let dot=0;for(let i=0;i<source.channels[0].length;i++)dot+=Number(source.channels[0][i])*Number(source.channels[1]?.[i]);
    // Polarity rejects opposite-pattern donors; it does not certify relative phase.
    if(!Number.isFinite(dot)||(spec.pattern==='stereo'?dot<=0:dot>=0))failures.push('source-polarity');
  }
  return failures;
}
/** Saved PCM is the output authority; Native7 events are never synthesized from plans.
 * @param {{summary:()=>{sampleRate:number,start:number|null,end:number|null,bytes:number,cap:number},window:(start:number,end:number,stream?:number)=>import('./audio-signal.mjs').CaptureWindow}} archive
 * @param {unknown} raw @param {unknown} proofRaw @param {typeof PACKAGED_NORMALIZER_CASE} [spec]
 */
export function assessPackagedNormalizer(archive,raw,proofRaw,spec=PACKAGED_NORMALIZER_CASE,headroomWitness=false){
  const original=selectNormalizerCase(spec.id);if(!isDeepStrictEqual(spec,original))throw normalizerError('original-spec');spec=original;
  if(typeof headroomWitness!=='boolean')throw normalizerError('headroom-profile');
  const f=record(raw),proof=record(proofRaw),m=record(proof?.measurement);
  if(headroomWitness?proof?.headroomWitness!==true:proof?.headroomWitness!==undefined)throw normalizerError('headroom-profile');
  if(!f||!proof||!isDeepStrictEqual(proof.spec,spec)||!m||!safe(m.frame)||!safe(m.powerReadCursor)||!safe(m.meterTickCursor))throw normalizerError('original-spec-or-marker');
  const target=selectNormalizerTarget(f,proof.beforeTarget,proof.request,spec,headroomWitness);if(!target||!isDeepStrictEqual(target,proof.target))throw normalizerError('target-changed');
  if(!keys(m,'commandSeq,frame,meterTickCursor,powerReadCursor,sourceEpoch')||!isDeepStrictEqual(m,f.normalizerMeasurement)||m.sourceEpoch!==record(target.command.message)?.sourceEpoch||m.commandSeq!==record(target.command.message)?.seq)throw normalizerError('marker');
  const evidence=record(f.oracleEvidence),ledger=record(evidence?.ledger),events=ledger?.events,obs=record(f.productObservation),reads=f.powerReads,ticks=f.meterTickReads,settings=record(f.normalizerSettings),s=archive.summary(),rate=spec.sampleRate,start=m.frame,end=start+spec.seconds*rate;
  const prepared=Array.isArray(events)?events.map(record).map(e=>record(e?.packet)).find(p=>p?.kind==='prepared'):null;
  if(!prepared||!safe(prepared.frame)||end>prepared.frame+20*rate||start<Number(target.completed.frame)||s.sampleRate!==rate||s.start===null||s.end===null||s.start>start||s.end<end||s.bytes>s.cap||s.cap!==96*1024*1024||!range(f.audioTime,end/rate,Number.MAX_VALUE))throw normalizerError('measurement-history-bound');
  const fftSize=2**Math.ceil(Math.log2(rate*.25));
  if(f.sources!==1||obs?.sources!==1||obs.l1Nodes!==1||obs.invalidFrames!==0||obs.streamError!==''||f.hidden!==false||f.contextState!=='running'||f.filters!==0||f.analysers!==2||!isDeepStrictEqual(f.fftSizes,[fftSize,fftSize])||f.buffers!==2||f.active100msTimers!==1||
    !Array.isArray(f.gains)||f.gains.length!==8||f.gains[4]!==1||f.gains[5]!==0||!isDeepStrictEqual(settings,{normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false})||
    !isDeepStrictEqual(record(f.readback),{state:'on',sources:1,wanted:true,gain:1,appliedGain:1})||normalizerSignalFailures(f,spec).length)throw normalizerError('graph-or-input');
  if(!Array.isArray(events))throw normalizerError('history-target');
  if(!isDeepStrictEqual(record(record(proof.beforeTarget)?.oracleEvidence)?.initial,evidence?.initial))throw normalizerError('history-target');
  const lifecycle=events.map(record),ledgerCommands=lifecycle.filter(e=>e?.direction==='send').map(e=>record(e?.packet)).filter(p=>p?.kind==='configure'||p?.kind==='retire'),ledgerReplies=lifecycle.filter(e=>e?.direction==='receive').map(e=>record(e?.packet)).filter(p=>p?.kind!=='meter-accepted');
  if(!isDeepStrictEqual(ledgerCommands,/** @type {unknown[]} */(obs.commands).map(c=>record(c)?.message))||!isDeepStrictEqual(ledgerReplies,obs.replies))throw normalizerError('history-target');
  if(!Array.isArray(reads)||reads.length<2||reads.length>402||reads.length!==f.reads||!Array.isArray(ticks)||ticks.length>200||reads.length!==2*(ticks.length+1)||m.powerReadCursor!==2*(m.meterTickCursor+1)||m.powerReadCursor>reads.length)throw normalizerError('power-prefix');
  let previousTime=-1;
  for(const [i,rawRead]of reads.entries()){const r=record(rawRead);if(!r||r.index!==i%2||r.size!==fftSize||!range(r.time,previousTime,Number.MAX_VALUE)||!range(r.power,0,Number.MAX_VALUE))throw normalizerError('power-read');previousTime=Number(r.time);}
  for(const [i,rawTick]of ticks.entries()){const t=record(rawTick),left=record(reads[2*(i+1)]),right=record(reads[2*(i+1)+1]);
    if(!t||t.ordinal!==i+1||t.startRead!==2*(i+1)||t.endRead!==2*(i+2)||!range(t.startTime,0,Number.MAX_VALUE)||!range(t.endTime,t.startTime,Number.MAX_VALUE)||Number(left?.time)<t.startTime||Number(right?.time)>t.endTime)throw normalizerError('tick-read-count');
  }
  if(Number(record(reads[m.powerReadCursor-1])?.time)>start/rate||m.powerReadCursor<reads.length&&Number(record(reads[m.powerReadCursor])?.time)<start/rate)throw normalizerError('marker-read-cursor');
  const posted=/** @type {Record<string,unknown>[]} */(Array.isArray(events)?events.map(record).filter(e=>e?.direction==='send').map(e=>record(e?.packet)).filter(p=>p?.kind==='power'||p?.kind==='read-error'):[]);
  if(!posted.length||posted[0]?.meterSeq!==1)throw normalizerError('first-meter');
  const failures=[],used=new Set();let maxUp=0,maxDown=0,maxGap=0,previousFrame,firstFrame;
  if(![f.events,f.linearEvents,f.steps].every(Array.isArray))throw normalizerError('native-parameter-history');
  if([f.events,f.linearEvents,f.steps].flat().some(e=>record(e)?.node===4||record(e)?.node===5))failures.push('normalizer-compressor-change');
  for(const p of posted){
    if(p.kind!=='power'||p.active!==true||p.targetDbfs!==-20||p.sourceEpoch!==record(target.command.message)?.sourceEpoch||p.meterEpoch!==target.accepted.meterEpoch||!safe(p.meterSeq)||p.meterSeq===0||p.meterSeq>reads.length/2)throw normalizerError('power-packet');
    const l=record(reads[2*(p.meterSeq-1)]),r=record(reads[2*(p.meterSeq-1)+1]),ack=/** @type {Record<string,unknown>[]} */(events).map(record).filter(e=>e?.direction==='receive').map(e=>record(e?.packet)).find(a=>a?.kind==='meter-accepted'&&a.seq===p.meterSeq),a=record(ack?.application);
    if(!a||p.leftPower!==l?.power||p.rightPower!==r?.power||Number(p.observedTime)>Number(l?.time)||Number(r?.time)>Number(a.frame)/rate)throw normalizerError('power-packet-binding');
    if(Number(a.frame)>=end)continue;used.add(p.meterSeq);
    firstFrame??=Number(a.frame);
    if(a.mode==='ramp')for(const [c,power]of [p.leftPower,p.rightPower].entries()){
      const silent=spec.pattern==='left'&&c===1||spec.pattern==='right'&&c===0;
      if(silent?!range(power,0,10**(-90/10)):!range(power,Number.MIN_VALUE,Number.MAX_VALUE)||Math.abs(10*Math.log10(power/10**(spec.inputDbfs/10)))>.05)failures.push('normalizer-fft-source-power');
    }
    const from=Number(a.fromDb),to=Number(a.toDb),duration=Number(a.end)-Number(a.start);
    if(from< -12.0001||from>6.0001||to< -12.0001||to>6.0001)failures.push('normalizer-clamp');
    if(duration>0){maxUp=Math.max(maxUp,(to-from)/duration);maxDown=Math.max(maxDown,(from-to)/duration);}
    if(previousFrame!==undefined)maxGap=Math.max(maxGap,(Number(a.frame)-previousFrame)/rate);previousFrame=Number(a.frame);
  }
  maxGap=Math.max(maxGap,(end-(previousFrame??start))/rate,((firstFrame??end)-start)/rate);
  if(maxUp>1.0001||maxDown>12.0001)failures.push('normalizer-rate');if(maxGap>.2001)failures.push('normalizer-tick-gap');
  const program=validateProcessingCapture(archive.window(start,end,0)),width=rate/10;
  if(program.rate!==rate||program.start!==start||program.end!==end)throw normalizerError('program-window');
  /** @type {import('./audio-processing-metrics.mjs').OutputBin[]} */const bins=[];
  for(let n=0;n<end-start;n++){
    const binStart=Math.floor((start+n)/width)*width;let b=bins.at(-1);
    if(!b||b.start!==binStart){b={start:binStart,end:binStart+width,count:[0,0],squares:[0,0],peaks:[0,0],over:[0,0]};bins.push(b);}
    for(let c=0;c<2;c++){const v=Number(program.channels[c]?.[n]);b.count[c]=Number(b.count[c])+1;b.squares[c]=Number(b.squares[c])+v*v;b.peaks[c]=Math.max(Number(b.peaks[c]),Math.abs(v));if(Math.abs(v)>1)b.over[c]=Number(b.over[c])+1;}
  }
  const output=evaluateNormalizerOutputBins({sampleRate:rate,invalidFrames:0,bins},spec);failures.push(...output.failures);
  // Full 100ms windows overlap both partial edges instead of assigning a short-window RMS tolerance.
  const sourceStarts=new Set([start,end-width]);for(let a=Math.ceil(start/width)*width;a+width<=end;a+=width)sourceStarts.add(a);
  for(const a of [...sourceStarts].sort((x,y)=>x-y)){
    const source=validateProcessingCapture(archive.window(a,a+width,1));if(source.rate!==rate||source.start!==a||source.end!==a+width)throw normalizerError('source-window');
    failures.push(...normalizerSourceFailures(source,spec));
  }
  let windows=0;
  for(let a=start;a<end;a+=rate){
    const b=a+rate,source=archive.window(a,b,1),control=archive.window(a,b,2),slice={rate,start:a,end:b,channels:program.channels.map(c=>c.slice(a-start,b-start))};
    const comparison=compareL1Normalizer({schema:headroomWitness?'f01-l1-normalizer-input-v3':'f01-l1-normalizer-input-v2',sampleRate:rate,evidence,source,program:slice,control,observation:{...obs,hidden:f.hidden,contextState:f.contextState}});
    if(comparison.status==='UNAVAILABLE')throw normalizerError('history-'+comparison.reason);if(comparison.status!=='diagnostic-match')failures.push('normalizer-control-window-'+windows);
    for(const [c,value]of [-1,1,1,null,0].entries())if(value!==null&&control.channels[c]?.some(v=>v!==value))failures.push('normalizer-control-channel-'+c);
    windows++;
  }
  const headroom=headroomWitness?assessRenderHeadroom(evidence,target,Array(8).fill(0),rate,end):null;
  if(headroom?.status==='UNAVAILABLE')throw normalizerError('headroom-'+headroom.reason);if(headroom&&!headroom.passed)failures.push('headroom-scalar');
  return {schema:headroomWitness?'f01-packaged-normalizer-headroom-observation-v1':'f01-packaged-normalizer-observation-v1',...(headroomWitness?{headroom}:{}),caseId:spec.id,passed:failures.length===0,failures:[...new Set(failures)],output,controlCoverage:{start,end,frames:end-start,windows,toleranceDb:.001,kind:'independent plan versus actual N diagnostic'},power:{reads:reads.length,callbacks:ticks.length,posted:posted.length,uniqueAppliedBeforeEnd:used.size,unpostedPairs:reads.length/2-posted.length,maxUp,maxDown,maxGap},native7Witness:'UNASSESSED',frameOrigin:'UNPROVEN',overallQualification:false};
}


/** Fixed original combined case; N60's zero EQ/target -20 contract is unchanged.
 * @param {Parameters<typeof assessPackagedNormalizer>[0]} archive @param {unknown} raw @param {unknown} targetRaw @param {number} scalarFrame @param {number} rate */
export function assessExtremeNormalizer(archive,raw,targetRaw,scalarFrame,rate){
  const f=record(raw),target=record(targetRaw),p=record(record(target?.command)?.message),o=record(f?.productObservation),evidence=record(f?.oracleEvidence),ledger=record(evidence?.ledger),s=archive.summary(),fft=2**Math.ceil(Math.log2(rate*.25)),delay=rate===44100?264:rate*.006;
  if(!f||!target||!p||!o||!evidence||!Array.isArray(ledger?.events)||![44100,48000,96000].includes(rate)||!safe(scalarFrame)||s.sampleRate!==rate||s.start===null||s.end===null||scalarFrame<s.start||scalarFrame>=s.end||s.end-s.start>20*rate||s.bytes>s.cap||s.cap!==96*1024*1024||!Array.isArray(f.powerReads)||!Array.isArray(f.meterTickReads)||f.reads!==f.powerReads.length||f.reads<2||f.reads>402||f.reads!==2*(f.meterTickReads.length+1)||!isDeepStrictEqual(f.fftSizes,[fft,fft])||f.analysers!==2||f.buffers!==2||f.active100msTimers!==1)throw normalizerError('extreme-formation');
  const events=ledger.events.map(record),packets=events.map(e=>record(e?.packet)),posts=events.filter(e=>e?.direction==='send').map(e=>record(e?.packet)).filter(p=>p?.kind==='power'||p?.kind==='read-error'),reads=f.powerReads.map(record),ticks=f.meterTickReads.map(record),failures=[];
  if(!isDeepStrictEqual(events.filter(e=>e?.direction==='send'&&['configure','retire'].includes(String(record(e.packet)?.kind))).map(e=>e?.packet),/** @type {unknown[]} */(o.commands).map(c=>record(c)?.message))||!isDeepStrictEqual(events.filter(e=>e?.direction==='receive'&&record(e.packet)?.kind!=='meter-accepted').map(e=>e?.packet),o.replies))throw normalizerError('extreme-ledger-target');
  let prior=-1;for(const [i,r]of reads.entries()){if(!r||r.index!==i%2||r.size!==fft||!range(r.time,prior,20+Number(packets[0]?.frame)/rate)||!range(r.power,0,Number.MAX_VALUE))throw normalizerError('extreme-read');prior=Number(r.time);}
  for(const [i,t]of ticks.entries())if(!t||t.ordinal!==i+1||t.startRead!==2*(i+1)||t.endRead!==2*(i+2)||!range(t.startTime,0,Number.MAX_VALUE)||!range(t.endTime,t.startTime,Number.MAX_VALUE)||Number(reads[2*(i+1)]?.time)<t.startTime||Number(reads[2*(i+1)+1]?.time)>t.endTime)throw normalizerError('extreme-tick');
  if(!posts.length||posts[0]?.meterSeq!==1)throw normalizerError('extreme-posts');
  const expectedPowerDbfs=-6+equalizerResponseDb(Array(8).fill(6),rate,1000)-48,steady=Number(record(target.completed)?.frame)+fft+delay+128;let previousFrame=Number(record(target.completed)?.frame),maxGap=0,steadyReads=0,maxErrorDb=0,minMeasuredDbfs=Infinity,maxMeasuredDbfs=-Infinity;
  for(const post of posts){
    const i=Number(post?.meterSeq)-1,ack=packets.find(a=>a?.kind==='meter-accepted'&&a.seq===post?.meterSeq),a=record(ack?.application),left=reads[2*i],right=reads[2*i+1];
    if(!post||post.kind!=='power'||post.active!==true||post.targetDbfs!==-12||post.sourceEpoch!==p.sourceEpoch||post.meterEpoch!==record(target.accepted)?.meterEpoch||!safe(i)||i>=reads.length/2||!a||post.leftPower!==left?.power||post.rightPower!==right?.power||Number(post.observedTime)>Number(left?.time)||Number(right?.time)>Number(a.frame)/rate)throw normalizerError('extreme-power-binding');
    if(Number(a.frame)<=scalarFrame){maxGap=Math.max(maxGap,(Number(a.frame)-previousFrame)/rate);previousFrame=Number(a.frame);}
    if(Number(a.frame)>=steady){steadyReads++;for(const power of [post.leftPower,post.rightPower]){if(!range(power,Number.MIN_VALUE,Number.MAX_VALUE))throw normalizerError('extreme-power-positive');const measuredDbfs=10*Math.log10(Number(power));maxErrorDb=Math.max(maxErrorDb,Math.abs(measuredDbfs-expectedPowerDbfs));minMeasuredDbfs=Math.min(minMeasuredDbfs,measuredDbfs);maxMeasuredDbfs=Math.max(maxMeasuredDbfs,measuredDbfs);}}
    const from=Number(a.fromDb),to=Number(a.toDb),duration=Number(a.end)-Number(a.start);
    if(!range(from,-12.0001,6.0001)||!range(to,-12.0001,6.0001))failures.push('extreme-clamp');if(duration>0&&((to-from)/duration>1.0001||(from-to)/duration>12.0001))failures.push('extreme-slope');
  }
  maxGap=Math.max(maxGap,(scalarFrame-previousFrame)/rate);if(maxGap>.2001||!steadyReads)failures.push('extreme-cadence-or-steady-fft');
  const headroom=assessRenderHeadroom(evidence,target,Array(8).fill(6),rate,scalarFrame);if(headroom.status==='UNAVAILABLE')throw normalizerError('extreme-'+headroom.reason);if(!('endFrame'in headroom)||Number(headroom.endFrame)>s.end)throw normalizerError('extreme-headroom-coverage');if(!headroom.passed)failures.push('extreme-headroom');
  let windows=0;for(let start=s.start;start<s.end;start+=rate){const end=Math.min(start+rate,s.end),result=compareL1Normalizer({schema:'f01-l1-normalizer-input-v3',sampleRate:rate,evidence,source:archive.window(start,end,1),program:archive.window(start,end),control:archive.window(start,end,2),observation:{...o,hidden:f.hidden,contextState:f.contextState}});if(result.status==='UNAVAILABLE')throw normalizerError('extreme-plan-'+result.reason);if(result.status!=='diagnostic-match')failures.push('extreme-control-plan');windows++;}
  const channels=record(archive.window(scalarFrame,scalarFrame+1,2))?.channels,n=Array.isArray(channels)&&channels.length===5?channels[3]?.[0]:null,scalarDb=Number(n)>0?20*Math.log10(Number(n)):null;if(scalarDb===null||Math.abs(scalarDb-6)>=.1)failures.push('extreme-N-scalar');
  return {passed:!failures.length,failures:[...new Set(failures)],headroom,scalarDb,scalarFrame,expectedDb:6,toleranceDb:.1,controlCoverage:{start:s.start,end:s.end,windows,toleranceDb:.001},power:{expectedPowerDbfs,steadyFromFrame:steady,steadyReads,maxGap,maxErrorDb:steadyReads?maxErrorDb:null,minMeasuredDbfs:steadyReads?minMeasuredDbfs:null,maxMeasuredDbfs:steadyReads?maxMeasuredDbfs:null,physicalPowerEquality:'UNPROVEN'},native7Witness:'UNASSESSED',frameOrigin:'UNPROVEN',overallQualification:false};
}


/** Fixed binary evidence budgets use sample counts, never Fs times fftSize. @param {number} rate */
export function fftBufferPairBytes(rate){if(![44100,48000,96000].includes(rate))throw normalizerError('fft-buffer-rate');return 2*2**Math.ceil(Math.log2(rate*.25))*4;}
/** Selected pair API wiring only; not a waveform, clock, or engine equivalence proof.
 * @param {unknown} value @param {unknown} epoch */
function fftRoutingIdentity(value,epoch){
  const g=record(value);if(!g||!keys(g,'analyserIds,calls,edges,endVersion,nodes,reason,schema,version')||g.schema!=='f01-fft-routing-v1'||g.reason!==null||!safe(g.calls)||g.calls>256||!safe(g.version)||g.version!==g.endVersion||!Array.isArray(g.nodes)||g.nodes.length>64||g.version!==g.nodes.length+g.calls||!Array.isArray(g.edges)||g.edges.length>128||!Array.isArray(g.analyserIds)||g.analyserIds.length!==2||Buffer.byteLength(JSON.stringify(g))>16384)throw normalizerError('fft-routing-metadata');
  const nodes=g.nodes.map(record),edges=g.edges.map(record),kinds=['destination','observer-program','observer-source','observer-control','source','l1','gain','biquad','analyser','compressor','delay','shaper','splitter','constant'];
  for(const [i,n]of nodes.entries())if(!n||!keys(n,'channels,id,kind,sourceEpoch')||n.id!==i+1||typeof n.kind!=='string'||!kinds.includes(n.kind)||(n.kind==='splitter'?!safe(n.channels)||n.channels===0:n.channels!==null)||(n.kind==='l1'?!safe(n.sourceEpoch)||n.sourceEpoch===0:n.sourceEpoch!==null))throw normalizerError('fft-routing-node');
  const seen=new Set();for(const e of edges){if(!e||!keys(e,'from,input,output,to')||!safe(e.from)||!safe(e.to)||e.from===0||e.to===0||e.from>nodes.length||e.to>nodes.length||!safe(e.output)||!safe(e.input))throw normalizerError('fft-routing-edge');const key=[e.from,e.to,e.output,e.input].join('/');if(seen.has(key))throw normalizerError('fft-routing-duplicate');seen.add(key);}
  const kind=(/** @type {unknown} */ id,/** @type {string} */ k)=>nodes.some(n=>n?.id===id&&n?.kind===k),incoming=(/** @type {unknown} */ id)=>edges.filter(e=>e?.to===id),one=(/** @type {unknown} */ id,/** @type {string} */ k,/** @type {number} */ output=0)=>{
    const all=incoming(id),e=all[0];if(all.length!==1||!e||e.output!==output||e.input!==0||!kind(e.from,k))throw normalizerError('fft-routing-input');return e.from;
  };
  const [left,right]=g.analyserIds;if(left===right||!kind(left,'analyser')||!kind(right,'analyser')||nodes.filter(n=>n?.kind==='analyser').length!==2)throw normalizerError('fft-routing-analysers');
  const splitter=one(left,'splitter'),rightSplitter=one(right,'splitter',1);if(splitter!==rightSplitter||nodes.find(n=>n?.id===splitter)?.channels!==2)throw normalizerError('fft-routing-channels');
  const mix=one(splitter,'gain'),feeds=incoming(mix);if(feeds.length!==2||feeds.some(e=>e?.input!==0||e.output!==0||!kind(e.from,'gain'))||feeds[0]?.from===feeds[1]?.from)throw normalizerError('fft-routing-mix');
  const branches=feeds.map(e=>{const all=incoming(e?.from),b=all[0];if(all.length!==1||!b||b.output!==0||b.input!==0||!kind(b.from,'compressor')&&!kind(b.from,'delay'))throw normalizerError('fft-routing-branch');return b.from;});
  if(branches[0]===branches[1]||!branches.some(id=>kind(id,'compressor'))||!branches.some(id=>kind(id,'delay')))throw normalizerError('fft-routing-diamond');
  const origins=branches.map(id=>one(id,'l1'));if(origins[0]!==origins[1]||nodes.filter(n=>n?.kind==='l1').length!==1||nodes.find(n=>n?.id===origins[0])?.sourceEpoch!==epoch)throw normalizerError('fft-routing-origin');
  return {l1Id:origins[0],compMixId:mix,splitterId:splitter,analyserIds:[left,right]};
}
/** Independently recompute actual returned Float32 buffers; no physical routing or waveform claim.
 * @param {Uint8Array} bytes @param {unknown} metadata @param {unknown} raw @param {unknown} targetRaw @param {number} rate */
export function assessFftBufferWitness(bytes,metadata,raw,targetRaw,rate){
  const base={physicalPowerEquality:'UNPROVEN',overallQualification:false},f=record(raw),m=record(metadata),selection=record(m?.selection),target=record(targetRaw),p=record(record(target?.command)?.message),completed=record(target?.completed),accepted=record(target?.accepted),fftSize=fftBufferPairBytes(rate)/8;
  try{
    if(!(bytes instanceof Uint8Array)||bytes.byteLength!==fftSize*8||!m||!keys(m,'bytes,encoding,reads,reason,routing,schema,selection,status')||m.schema!=='f01-fft-buffer-witness-v2'||m.status!=='CAPTURED'||m.reason!==null||m.encoding!=='float32le'||m.bytes!==bytes.byteLength||!isDeepStrictEqual(m,f?.fftBufferWitness)||!selection||!keys(selection,'commandSeq,completedFrame,eligibleFrame,firstReadOrdinal,meterEpoch,pairSeq,sourceEpoch')||!p||!completed||!accepted||!Array.isArray(m.reads)||m.reads.length!==2||!Array.isArray(f?.powerReads))throw normalizerError('fft-buffer-metadata');
    if(f.reads!==f.powerReads.length||f.reads>402||f.reads%2!==0)throw normalizerError('fft-buffer-read-count');
    let priorTime=0;for(const rawRead of f.powerReads){const r=record(rawRead);if(!r||!range(r.beforeTime,priorTime,Number.MAX_VALUE)||!range(r.time,r.beforeTime,Number.MAX_VALUE))throw normalizerError('fft-buffer-read-clock');priorTime=Number(r.time);}
    const delay=rate===44100?264:rate*.006,eligibleFrame=Number(completed.frame)+fftSize+delay+128,reads=f.powerReads.map(record),first=reads.findIndex((r,i)=>i%2===0&&r&&Number.isFinite(r.beforeTime)&&Math.round(Number(r.beforeTime)*rate)>=eligibleFrame);
    if(first<0||selection.completedFrame!==completed.frame||selection.eligibleFrame!==eligibleFrame||selection.firstReadOrdinal!==first+1||selection.pairSeq!==first/2+1||selection.sourceEpoch!==p.sourceEpoch||selection.commandSeq!==p.seq||selection.meterEpoch!==accepted.meterEpoch)throw normalizerError('fft-buffer-first-pair');
    const routing=fftRoutingIdentity(m.routing,selection.sourceEpoch);
    const powers=[],view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let matched=true;
    for(let channel=0;channel<2;channel++){
      const r=reads[first+channel],at=record(m.reads[channel]);
      if(!r||!at||!keys(at,'beforeTime,index,ordinal,size,time')||at.ordinal!==first+channel+1||at.index!==channel||r.index!==channel||r.size!==fftSize||at.size!==fftSize||at.beforeTime!==r.beforeTime||at.time!==r.time||!range(at.beforeTime,0,Number.MAX_VALUE)||!range(at.time,at.beforeTime,Number.MAX_VALUE))throw normalizerError('fft-buffer-read-binding');
      let sum=0;for(let n=0;n<fftSize;n++){const v=view.getFloat32((channel*fftSize+n)*4,true);if(!Number.isFinite(v))throw normalizerError('fft-buffer-nonfinite');sum+=v*v;}const power=sum/fftSize;powers.push(power);if(power!==r.power)matched=false;
    }
    const evidence=record(f.oracleEvidence),ledger=record(evidence?.ledger);if(!Array.isArray(ledger?.events))throw normalizerError('fft-buffer-ledger');
    const h=history(/** @type {Record<string,unknown>} */(evidence),rate,Math.round(Number(f.audioTime)*rate)+1,true,true),job=[...h.commandFrames.values()].find(c=>isDeepStrictEqual(c.send.packet,p));if(!job||!isDeepStrictEqual(job.accepted?.packet,accepted)||!isDeepStrictEqual(job.completed?.packet,completed))throw normalizerError('fft-buffer-target-history');
    const posts=ledger.events.map(record).filter(e=>e?.direction==='send').map(e=>record(e?.packet)).filter(e=>e?.kind==='power'&&e.meterSeq===selection.pairSeq);
    if(posts.length>1)throw normalizerError('fft-buffer-post-count');const post=posts[0];
    if(post&&(post.sourceEpoch!==selection.sourceEpoch||post.meterEpoch!==selection.meterEpoch||post.targetDbfs!==-12||post.active!==true||post.leftPower!==powers[0]||post.rightPower!==powers[1]))matched=false;
    return {schema:'f01-fft-buffer-assessment-v2',routingConsistency:'MATCHED',routing,passed:matched,bufferPowerConsistency:matched?'MATCHED':'MISMATCH',postingStatus:post?'POSTED':'UNPOSTED',firstReadOrdinal:first+1,pairSeq:selection.pairSeq,bytes:bytes.byteLength,powers,...base};
  }catch(error){return {schema:'f01-fft-buffer-assessment-v2',routingConsistency:'UNAVAILABLE',passed:false,bufferPowerConsistency:'UNAVAILABLE',reason:error instanceof Error?error.message:'fft-buffer-invalid',...base};}
}

export {packet as validateL1NormalizerPacket};
