import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {summarizeCapture,measureSignal} from '../audio-signal.mjs';
import {assessRenderHeadroom,validateL1NormalizerPacket,compareL1Normalizer} from '../audio-l1-normalizer-oracle.mjs';
import {validateProcessingCapture} from '../audio-processing-metrics.mjs';
import {audioOperation} from '../audio-native-browser.mjs';
import {installSourceOwnerProbe,callSourceOwnerProbe} from '../audio-source-owner-probe.mjs';
export {installSourceOwnerProbe};

const PCM_CAP=96*1024*1024,PROOF_CAP=1048576,FAILURE_RESERVE=5120;
/** @param {string} code @returns {never} */
function fail(code){throw Error('audio-source-owner-'+code);}
/** @param {unknown} value @returns {Record<string,unknown>} */
const object=value=>{if(!value||typeof value!=='object'||Array.isArray(value))return fail('object');return /** @type {Record<string,unknown>} */(value);};
/** @param {unknown} value @returns {number} */
const integer=value=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)return fail('integer');return value;};
/** @param {unknown} value @returns {Record<string,unknown>[]} */
const rows=value=>{if(!Array.isArray(value))return fail('rows');return value.map(object);};
/** @template T @param {T} value @returns {T} */
const copy=value=>JSON.parse(JSON.stringify(value));
/** @param {Uint8Array|string} value */
const sha=value=>createHash('sha256').update(value).digest('hex');
/** @typedef {{root:string,writeFile:(file:string,data:string|Uint8Array,options:{flag:string})=>Promise<unknown>,readFile:(file:string,encoding?:string)=>Promise<Buffer|string>,lstat:(file:string)=>Promise<{isFile:()=>boolean,size:number}|null>,ensureDirectory?:(file:string)=>Promise<unknown>}} OwnerFiles */
/** @typedef {{id:string,sampleRate:number,frequency:number,inputDbfs:number,pattern:string,phase:number,seconds:number,gain:number,normalizer:boolean,compressor:boolean,equalizer:boolean}} OwnerSpec */

export const SOURCE_OWNER_CASES=Object.freeze([44100,48000,96000].map(sampleRate=>Object.freeze({
  id:sampleRate+'/source-owner/stable',sampleRate,frequency:1000,inputDbfs:-24,pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:true,equalizer:false,
})));
export const SOURCE_PENDING_OFF_CASES=Object.freeze(SOURCE_OWNER_CASES.map(s=>Object.freeze({...s,id:s.sampleRate+'/source-owner/pending-off'})));
export const SOURCE_SUSPEND_REBIND_CASES=Object.freeze(SOURCE_OWNER_CASES.filter(s=>s.sampleRate===44100).map(s=>Object.freeze({...s,id:'44100/source-owner/suspend-rebind'})));
export const SOURCE_OFF_STAGE_CASES=Object.freeze(SOURCE_OWNER_CASES.filter(s=>s.sampleRate===44100).map(s=>Object.freeze({...s,id:'44100/source-owner/off-stages'})));
/** @param {unknown} s */
const pendingOff=s=>SOURCE_PENDING_OFF_CASES.some(c=>isDeepStrictEqual(c,s));
/** @param {unknown} s */
const suspendRebind=s=>SOURCE_SUSPEND_REBIND_CASES.some(c=>isDeepStrictEqual(c,s));
/** @param {OwnerSpec} s */
const offStages=s=>SOURCE_OFF_STAGE_CASES.some(c=>isDeepStrictEqual(c,s));
/** @param {OwnerSpec} s */
const ownerProofSchema=s=>offStages(s)?'f01-source-off-stages-proof-v1':suspendRebind(s)?'f01-source-suspend-rebind-proof-v1':pendingOff(s)?'f01-source-pending-off-proof-v1':'f01-source-owner-proof-v1';
/** @param {OwnerSpec} s */
const ownerObservationSchema=s=>offStages(s)?'f01-source-off-stages-observation-v1':suspendRebind(s)?'f01-source-suspend-rebind-observation-v1':pendingOff(s)?'f01-source-pending-off-observation-v1':'f01-source-owner-observation-v1';
export const SOURCE_HISTORY_CASES=Object.freeze([44100,48000,96000].map(sampleRate=>Object.freeze({id:sampleRate+'/source-owner/dry-prefix',sampleRate,frequency:1000,inputDbfs:-40,pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:false,equalizer:false})));
export const SOURCE_WET_HISTORY_CASES=Object.freeze(SOURCE_HISTORY_CASES.map(s=>Object.freeze({...s,id:s.sampleRate+'/source-owner/wet-prefix'})));
export const SOURCE_EXTREME_HISTORY_CASES=Object.freeze(SOURCE_HISTORY_CASES.map(s=>Object.freeze({...s,id:s.sampleRate+'/source-owner/extreme-prefix'})));
/** @param {OwnerSpec} s */
const extremeHistory=s=>SOURCE_EXTREME_HISTORY_CASES.some(c=>isDeepStrictEqual(c,s));
/** @param {OwnerSpec} s @returns {'dry-prefix'|'wet-prefix'|'extreme-prefix'} */
const historyProfile=s=>extremeHistory(s)?'extreme-prefix':wetHistory(s)?'wet-prefix':'dry-prefix';
/** @param {OwnerSpec} s */
const historySchema=s=>extremeHistory(s)?'f01-source-extreme-prefix':wetHistory(s)?'f01-source-wet-prefix':'f01-source-dry-prefix';
/** @param {OwnerSpec} s */
const historyProofSchema=s=>historySchema(s)+'-proof-v'+(extremeHistory(s)?2:1);
/** @param {OwnerSpec} s */
const historyObservationSchema=s=>historySchema(s)+'-observation-v'+(extremeHistory(s)?2:1);
/** @param {OwnerSpec} s */
const historyArtifactCap=s=>extremeHistory(s)?4090:wetHistory(s)?4091:4092;
/** @param {OwnerSpec} s */
const wetHistory=s=>SOURCE_WET_HISTORY_CASES.some(c=>isDeepStrictEqual(c,s))||extremeHistory(s);
/** @param {OwnerSpec} s */
const isHistory=s=>SOURCE_HISTORY_CASES.some(c=>isDeepStrictEqual(c,s))||wetHistory(s);
/** @param {OwnerSpec} s */
const historyReserve=s=>s.sampleRate*(extremeHistory(s)?40:wetHistory(s)?32:24);
/** @param {unknown} caller */
const ownerSpec=caller=>SOURCE_OFF_STAGE_CASES.find(s=>isDeepStrictEqual(s,caller))??SOURCE_SUSPEND_REBIND_CASES.find(s=>isDeepStrictEqual(s,caller))??SOURCE_PENDING_OFF_CASES.find(s=>isDeepStrictEqual(s,caller))??SOURCE_HISTORY_CASES.find(s=>isDeepStrictEqual(s,caller))??SOURCE_WET_HISTORY_CASES.find(s=>isDeepStrictEqual(s,caller))??SOURCE_EXTREME_HISTORY_CASES.find(s=>isDeepStrictEqual(s,caller))??sourceOwnerCase(caller);
/** @param {unknown} spec */
export function sourceOwnerCase(spec){
  const selected=SOURCE_OWNER_CASES.find(s=>isDeepStrictEqual(s,spec));
  if(!selected)throw Error('audio-source-owner-original-spec');return selected;
}

/** @param {string} directory */
function ownerDirectory(directory){if(!/^output\/playwright\/installed-extension-[A-Za-z0-9]{1,64}$/.test(directory))fail('directory');return directory;}

/** Validate native-packet coordinates before decoding or allocating PCM.
 * @param {unknown} raw @param {number} rate @param {number} [maxId]
 */
function span(raw,rate,maxId=3){
  const r=object(raw),id=integer(r.producerId),first=integer(r.firstSequence),last=integer(r.lastSequence),received=integer(r.firstReceived),lastReceived=integer(r.lastReceived),packetFrame=integer(r.packetFrame),start=integer(r.start),end=integer(r.end),lo=integer(r.firstOffset),hi=integer(r.lastOffset);
  if(id>maxId||r.portId!==id||!first||last<first||!received||lastReceived-received!==last-first||packetFrame%128||lo>=128||hi<1||hi>128||start!==packetFrame+lo||end!==packetFrame+(last-first)*128+hi||end<=start)fail('span');
  const channels=id<2?2:5;
  if(id<2?(r.nodeId!==null||r.sourceEpoch!==null):(r.nodeId!==id-1||!integer(r.sourceEpoch)))fail('span-origin');
  if(r.kind!=='pcm'&&r.kind!=='empty'||r.channels!==(r.kind==='pcm'?channels:0)||r.kind==='empty'&&r.base64!==undefined||r.kind==='pcm'&&end-start>rate/10)fail('span-kind');
  return {r,id,first,last,received,lastReceived,packetFrame,start,end,lo,hi,channels};
}

/** @param {ReturnType<typeof span>|undefined} previous @param {ReturnType<typeof span>} current */
function follows(previous,current){
  if(!previous){if(current.first!==1||current.received!==1||current.lo!==0)fail('initial-span');return;}
  if(previous.end!==current.start||previous.r.sourceEpoch!==current.r.sourceEpoch)fail('span-gap');
  if(current.first===previous.last){
    if(current.received!==previous.lastReceived||current.lo!==previous.hi||previous.hi===128||current.r.kind!==previous.r.kind)fail('split-packet');
  }else if(current.first!==previous.last+1||current.received!==previous.lastReceived+1||previous.hi!==128||current.lo!==0)fail('packet-sequence');
}

/** @param {Record<string,unknown>} r @param {number} expected */
function decode(r,expected){
  if(typeof r.base64!=='string'||r.base64.length!==4*Math.ceil(expected/3))return fail('pcm-size');
  const bytes=Buffer.from(r.base64,'base64');if(bytes.length!==expected||bytes.toString('base64')!==r.base64)fail('pcm-encoding');
  for(let n=0;n<bytes.length;n+=4)if(!Number.isFinite(bytes.readFloatLE(n)))fail('pcm-nonfinite');return bytes;
}

/** Raw packets stay intact; their out-of-window suffix never extends the measured bridge.
 * @param {Record<string,unknown>[]} data @param {number|null} end
 */
function retainedTail(data,end){return end===null?[]:data.flatMap((r,i)=>integer(r.end)>end?[{rowIndex:i,producerId:r.producerId,start:Math.max(integer(r.start),end),end:r.end,reason:'raw-outside-fixed-window'}]:[]);}

/** @param {unknown} facts @param {OwnerSpec} spec */
function retainedEnd(facts,spec){
  if(isHistory(spec)&&facts&&typeof facts==='object'){const p=Reflect.get(facts,'dryPrefix'),phases=p&&typeof p==='object'?Reflect.get(p,'phases'):null;return Number.isSafeInteger(p?.extreme?.observedEnd)?p.extreme.observedEnd:Array.isArray(phases)&&Number.isSafeInteger(p?.wet?.end)?p.wet.end:Array.isArray(phases)&&phases.length===2&&Number.isSafeInteger(phases[1]?.end)?phases[1].end:null;}
  if(!facts||typeof facts!=='object'||!Array.isArray(Reflect.get(facts,'ledger')))return null;
  const events=Reflect.get(facts,'ledger').filter((/** @type {Record<string,unknown>} */e)=>e.type==='receive'&&e.nodeId===2&&e.packet&&typeof e.packet==='object'&&Reflect.get(e.packet,'kind')==='completed');
  if(events.length!==1)return null;const frame=Reflect.get(events[0].packet,'frame');return typeof frame==='number'&&Number.isSafeInteger(frame)&&frame>=0?(Math.ceil(frame/(spec.sampleRate/10))+1)*spec.sampleRate/10:null;
}

/** One run-wide charge includes attempted writes; a failed write never advances coverage.
 * @param {OwnerFiles} files @param {string} directory @param {unknown} caller
 */
export function createSourceOwnerArchive(files,directory,caller){
  const spec=ownerSpec(caller),history=isHistory(spec),reservedBytes=history?historyReserve(spec):0;ownerDirectory(directory);
  /** @type {Map<string,Buffer>} */const pcm=new Map();
  /** @type {Record<string,unknown>[]} */const stored=[];
  /** @type {Record<string,unknown>[]} */const attempts=[];
  /** @type {Map<number,ReturnType<typeof span>>} */const last=new Map();
  let chargedBytes=0,pcmBytes=0,failureBytes=0,sealed=false;let failureEvidence=/** @type {unknown} */(null);
  /** @param {Record<string,unknown>} row */
  const metadataBound=row=>{const data=[...stored,row];if(Buffer.byteLength(JSON.stringify({rows:data,retainedTail:retainedTail(data,0)}))>416*1024)fail('span-metadata-cap');};
  return {
    /** @param {unknown} input */
    async append(input){
      if(sealed)fail('archive-stopped');
      const s=span(input,spec.sampleRate,extremeHistory(spec)?4:3);follows(last.get(s.id),s);
      if(stored.filter(r=>r.kind==='pcm').length+attempts.length>=(history?historyArtifactCap(spec):4095))fail('artifact-cap');
      const row=copy(s.r);delete row.base64;
      if(s.r.kind==='pcm'){
        const expected=(s.end-s.start)*s.channels*4;if(chargedBytes+expected+reservedBytes+FAILURE_RESERVE-failureBytes>PCM_CAP)fail('pcm-cap');const bytes=decode(s.r,expected);
        const file=directory+'/segment-'+String(stored.length).padStart(6,'0')+'-p'+s.id+'.f32le';
        const artifact={file,bytes:bytes.length,sha256:sha(bytes)};Object.assign(row,artifact);metadataBound(row);chargedBytes+=bytes.length;attempts.push({...row,...artifact});
        await files.writeFile(file,bytes,{flag:'wx'});if(sealed)fail('archive-stopped');attempts.pop();Object.assign(row,artifact);pcmBytes+=bytes.length;if(history)pcm.set(file,bytes);
      }
      metadataBound(row);stored.push(row);last.set(s.id,s);
    },
    /** @param {unknown} value */
    recordFailure(value){
      if(failureEvidence!==null||!value)return;const r=object(value);let count=0;
      if(r.channels!==undefined)for(const c of rows(r.channels)){if(c.encoding!=='float32le'||typeof c.base64!=='string'||c.base64.length>684)fail('failure-evidence');const bytes=Buffer.from(c.base64,'base64');if(bytes.length>512||bytes.length%4||bytes.toString('base64')!==c.base64)fail('failure-evidence');count+=bytes.length;}
      if(count>FAILURE_RESERVE||r.bytes!==undefined&&r.bytes!==count||chargedBytes+count>PCM_CAP)fail('failure-cap');failureBytes=count;chargedBytes+=count;failureEvidence=copy(value);
    },
    summary(){return {...(history?{reservedBytes}:{}),rows:stored.length,pcmBytes,chargedBytes,failureBytes,attemptedWrites:copy(attempts)};},
    /** @param {number} start @param {number} end @param {number} [producerId] */
    window(start,end,producerId=0){return historyWindow(stored,pcm,spec.sampleRate,start,end,producerId);},
    seal(){sealed=true;},
    /** @param {unknown} facts */
    proof(facts){
      const proof={schema:history?historyProofSchema(spec):ownerProofSchema(spec),...(history?{reservedBytes}:{}),spec,facts:copy(facts),rows:copy(stored),retainedTail:retainedTail(stored,retainedEnd(facts,spec)),pcmBytes,chargedBytes,failureBytes,failureEvidence:copy(failureEvidence),attemptedWrites:copy(attempts)};
      if(Buffer.byteLength(JSON.stringify(proof))>PROOF_CAP)fail('proof-cap');return proof;
    },
  };
}

/** @param {Record<string,unknown>[]} data @param {Map<string,Buffer>} pcm @param {number} rate @param {number} start @param {number} end @param {number} producerId */
function historyWindow(data,pcm,rate,start,end,producerId){
  if(![0,1].includes(producerId)||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(end)||end<=start||end-start>rate)fail('dry-window');
  /** @type {[Float32Array,Float32Array]} */const channels=[new Float32Array(end-start),new Float32Array(end-start)];let next=start;
  for(const r of data.filter(r=>r.producerId===producerId&&r.kind==='pcm')){
    const a=Math.max(start,integer(r.start)),b=Math.min(end,integer(r.end));if(b<=a)continue;
    const bytes=pcm.get(String(r.file));if(a!==next||!bytes)fail('dry-window-gap');
    for(let n=a;n<b;n++)for(let c=0;c<2;c++)channels[c===0?0:1][n-start]=bytes.readFloatLE(((n-integer(r.start))*2+c)*4);next=b;
  }
  if(next!==end)fail('dry-window-gap');return {rate,start,end,channels};
}
/** @param {import('../audio-signal.mjs').CaptureWindow} capture */
function historyCaptureBytes(capture){
  const bytes=Buffer.alloc((capture.end-capture.start)*8);for(let n=0;n<capture.end-capture.start;n++)for(let c=0;c<2;c++)bytes.writeFloatLE(capture.channels[c===0?0:1][n]??fail('dry-capture-size'),(n*2+c)*4);return bytes;
}
/** @param {ReturnType<typeof historyWindow>} program @param {ReturnType<typeof historyWindow>} source @param {number} stage */
function assessDryCapture(program,source,stage){
  const level=stage===1?1:.99,measurement=summarizeCapture(program),inputValid=source.channels.every(c=>c.every(v=>Number.isFinite(v)&&Math.abs(v-level)<=1e-5));
  return {stage,level,passed:inputValid&&measurement.channels.every(c=>Math.abs(c.rms-level)<1e-5),qualityAssessed:inputValid,inputValid,measurement};
}
/** @param {unknown} raw @param {OwnerSpec} spec */
function historyPlan(raw,spec,stage=2){
  const p=object(raw),urls=p.urls,inputs=rows(p.inputs);
  if(!isDeepStrictEqual(p.spec,spec)||p.sameBlob!==false||!Array.isArray(urls)||urls.length!==stage+1||new Set(urls).size!==stage+1||inputs.length!==stage+1)fail('dry-plan');
  for(const [i,row]of inputs.entries())if(typeof urls[i]!=='string'||!/^blob:https:\/\/chzzk\.naver\.com\/[A-Za-z0-9-]+$/.test(urls[i])||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256)||!isDeepStrictEqual(row,{stage:i,url:urls[i],sha256:row.sha256,frequency:1000,inputDbfs:i===0?-40:i===1?0:i===2?20*Math.log10(.99):-6,pattern:i===1||i===2?'dc':'stereo',phase:.37,channels:2,frames:spec.sampleRate*90}))fail('dry-input');
  if(new Set(inputs.map(i=>i.sha256)).size!==stage+1)fail('dry-input-hash');return {plan:p,urls,inputs};
}
/** @param {Record<string,unknown>} f @param {unknown} url @param {boolean} wanted @param {OwnerSpec} spec */
function historyOwner(f,url,wanted,spec){
  const r=object(f.readback);if(f.profile!==historyProfile(spec)||!isDeepStrictEqual(object(f.inputPlan).spec,spec)||f.error!==null||f.sources!==1||f.contextId!==1||f.elementId!==1||f.contextState!=='running'||f.hidden!==false||f.paused!==false||f.currentSrc!==url||!isDeepStrictEqual(f.connected,wanted?[1]:[])||r.state!==(wanted?'on':'off')||r.wanted!==wanted||r.gain!==1||r.appliedGain!==(wanted?1:null)||r.sources!==1)fail('dry-owner');
  historyAcks(f,!wanted);
}
/** Check actual envelopes without manufacturing an OFF completion cancelled by source rebind.
 * @param {Record<string,unknown>} facts @param {boolean} off */
function historyAcks(facts,off){
  const ledger=rows(facts.ledger),nodes=rows(facts.nodes);if(nodes.length!==1)fail('dry-node-count');const epoch=integer(object(nodes[0]).sourceEpoch),sends=ledger.filter(e=>e.type==='send'),replies=ledger.filter(e=>e.type==='receive');
  if(!epoch||sends.length<(off?2:1)||sends.length>(off?3:1))fail('dry-command');
  for(const [i,e]of sends.entries())if(e.nodeId!==1||e.portId!==1||!isDeepStrictEqual(e.packet,i<2?{kind:'configure',sourceEpoch:epoch,seq:i+1,wanted:i===0,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:false,targetDbfs:-20}:{kind:'retire',sourceEpoch:epoch,seq:3}))fail('dry-command');
  const seen=new Map();let lastFrame=0,lastEpoch=0;
  for(const e of replies){
    const r=object(e.packet),seq=integer(r.seq),key=r.kind+'/'+seq,allowed=seq===0?['prepared']:seq===3?['retired']:seq<=2?['accepted','completed']:[];
    if(e.nodeId!==1||e.portId!==1||Object.keys(r).sort().join(',')!=='code,frame,gain,kind,meterEpoch,seq,sourceEpoch'||r.sourceEpoch!==epoch||!allowed.includes(String(r.kind))||r.code!==null||r.gain!==(r.kind==='completed'?1:null)||integer(r.frame)<lastFrame||integer(r.meterEpoch)<lastEpoch||seen.has(key)||seq===0&&r.meterEpoch!==0)fail('dry-reply');
    if(seq){const send=object(sends[seq-1]);if(integer(send.order)>=integer(e.order))fail('dry-reply-order');if(r.kind==='completed'){const a=seen.get('accepted/'+seq);if(!a||object(a.packet).meterEpoch!==r.meterEpoch)fail('dry-reply-order');}}
    seen.set(key,e);lastFrame=integer(r.frame);lastEpoch=integer(r.meterEpoch);
  }
  const prepared=seen.get('prepared/0'),done=seen.get('completed/1');if(!prepared||!done||!seen.has('accepted/1')||integer(prepared.order)>=integer(object(sends[0]).order)||off&&integer(done.order)>=integer(object(sends[1]).order)||sends.length===3&&!seen.has('completed/2'))fail('dry-prime-ack');
  if(sends.length===3){const offDone=object(seen.get('completed/2')),send=object(sends[2]),retired=seen.get('retired/3');if(integer(offDone.order)>=integer(send.order)||retired&&(integer(retired.order)<=integer(send.order)||object(retired.packet).meterEpoch!==object(offDone.packet).meterEpoch))fail('dry-retire-order-or-epoch');}
  const closed=ledger.filter(e=>e.type==='port-close');if(off&&(closed.length!==1||replies.some(e=>integer(e.order)>integer(object(closed[0]).order))))fail('dry-closed-node');return {prepared,done,sends,replies};
}
/** Fixed source identity, not a first-ON output quality gate.
 * @param {ReturnType<typeof historyWindow>} source @param {number} [inputDbfs] */
function primeIdentity(source,inputDbfs=-40){
  const channels=source.channels.map(c=>{const m=measureSignal(c,source.rate,1000);return {rmsDbfs:m.rmsDbfs,toneDbfs:m.fundamentalAmplitude?20*Math.log10(m.fundamentalAmplitude/Math.SQRT2):null};});
  let dot=0;for(let n=0;n<source.end-source.start;n++)dot+=(source.channels[0][n]??0)*(source.channels[1][n]??0);
  if(channels.some(c=>c.rmsDbfs===null||c.toneDbfs===null||Math.abs(c.rmsDbfs-inputDbfs)>.05||Math.abs(c.toneDbfs-inputDbfs)>.05)||dot<=0)fail('dry-prime-input');return {start:source.start,end:source.end,channels,polarity:'positive'};
}
/** Validate the original history and coordinates before consuming any claimed numeric PASS.
 * @param {unknown} value @param {OwnerSpec} spec @param {Map<string,Buffer>} pcm */
function assessDryPrefixProof(value,spec,pcm){
  const p=object(value),f=object(p.facts),h=object(f.dryPrefix),prime=object(h.priming),phases=rows(h.phases),data=rows(p.rows),ledger=rows(f.ledger),nodes=rows(f.nodes),producers=rows(f.producers),rate=spec.sampleRate;
  if(h.stage!=='complete'||f.slot!==2||!isHistory(spec)||p.schema!==historyProofSchema(spec)||!isDeepStrictEqual(p.spec,spec)||!isDeepStrictEqual(f.spec,spec)||p.reservedBytes!==historyReserve(spec)||p.failureBytes!==0||p.failureEvidence!==null||rows(p.attemptedWrites).length||Buffer.byteLength(JSON.stringify(p))>PROOF_CAP||phases.length!==2||nodes.length!==1||producers.length!==3||data.filter(r=>r.kind==='pcm').length>4092||ledger.length>4128)fail('dry-proof');
  const {plan,urls,inputs}=historyPlan(f.inputPlan,spec),node=object(nodes[0]),epoch=integer(node.sourceEpoch),options=object(node.options);
  if(!epoch||!isDeepStrictEqual(node,{id:1,portId:1,contextId:1,sourceEpoch:epoch,initial:'raw',options,producerId:2})||!isDeepStrictEqual(options,{sourceEpoch:epoch,initial:'raw'}))fail('dry-node');
  for(const [i,row]of producers.entries())if(!isDeepStrictEqual(row,{id:i,portId:i,role:i===0?'program':i===1?'source':'control',channels:i<2?2:5,contextId:1,nodeId:i<2?null:1,sourceEpoch:i<2?null:epoch}))fail('dry-producer');
  const allowed=['constructor','source-create','node-connect','source-connect','source-disconnect','node-disconnect','port-close','send','receive','history-signal','history-loaded','history-request','history-return','history-capture'];
  for(const [i,e]of ledger.entries())if(e.order!==i+1||!allowed.includes(String(e.type))||e.nodeId!==undefined&&e.nodeId!==1)fail('dry-ledger');
  const one=(/** @type {string} */type)=>{const a=ledger.filter(e=>e.type===type);if(a.length!==1)fail('dry-'+type);return object(a[0]);};
  if(one('source-create').sourceHandle!==1||one('source-connect').sourceHandle!==1||one('source-disconnect').sourceHandle!==1||one('node-disconnect').all!==true)fail('dry-source-handle');
  const close=integer(one('port-close').order),ctor=integer(one('constructor').order),sends=ledger.filter(e=>e.type==='send'),replies=ledger.filter(e=>e.type==='receive');
  if(sends.length<2||sends.length>3||ledger.some(e=>e.nodeId===1&&['send','source-connect','node-connect'].includes(String(e.type))&&integer(e.order)>close))fail('dry-closed-node');
  for(const [i,e]of sends.entries())if(e.portId!==1||!isDeepStrictEqual(e.packet,i<2?{kind:'configure',sourceEpoch:epoch,seq:i+1,wanted:i===0,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:false,targetDbfs:-20}:{kind:'retire',sourceEpoch:epoch,seq:3}))fail('dry-command');
  const {prepared,done}=historyAcks(f,true);if(ctor>=integer(prepared.order))fail('dry-prime-ack');
  const initial=object(h.before);if(initial.sources!==0||initial.contextId!==1||initial.elementId!==1||rows(initial.nodes).length||object(initial.readback).wanted!==false)fail('dry-initial');
  const finite=(/** @type {unknown} */v)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  if(!finite(h.scenarioStartedAt)||!finite(prime.start)||!finite(prime.end)||Number(prime.start)<Number(h.scenarioStartedAt)||prime.milliseconds!==1250||Number(prime.end)-Number(prime.start)<1250)fail('dry-prime-clock');historyOwner(object(prime.after),urls[0],true,spec);
  const signal=ledger.filter(e=>e.type==='history-signal'),loaded=ledger.filter(e=>e.type==='history-loaded'),requests=ledger.filter(e=>e.type==='history-request'),returns=ledger.filter(e=>e.type==='history-return'),captures=ledger.filter(e=>e.type==='history-capture');
  if(signal.length!==3||loaded.length!==3||requests.length!==4||returns.length!==4||captures.length!==2)fail('dry-history-count');
  for(let i=0;i<3;i++)if(object(signal[i]).stage!==i||object(signal[i]).fromUrl!==(i?urls[i-1]:null)||object(signal[i]).toUrl!==urls[i]||object(signal[i]).sha256!==object(inputs[i]).sha256||object(loaded[i]).stage!==i||object(loaded[i]).url!==urls[i]||integer(object(signal[i]).order)>=integer(object(loaded[i]).order)||i&&integer(object(signal[i]).order)<=integer(object(returns[i]).order))fail('dry-history-input');
  for(let i=0;i<4;i++)if(object(requests[i]).index!==i||object(returns[i]).index!==i||object(requests[i]).stage!==Math.max(0,i-1)||object(returns[i]).stage!==Math.max(0,i-1)||object(requests[i]).enabled!==(i===0)||object(returns[i]).enabled!==(i===0)||object(returns[i]).status!==(i===0?'on':'off')||integer(object(requests[i]).order)>=integer(object(returns[i]).order)||i&&integer(object(requests[i]).order)<=integer(object(returns[i-1]).order))fail('dry-history-request');
  for(const [i,receipt]of [prime,object(h.off),...phases.map(p=>object(p.configure))].entries()){const r=object(receipt.request);if(r.frame!==object(requests[i]).frame||r.status!==object(returns[i]).status)fail('dry-request-receipt');}
  if(integer(object(requests[1]).order)>=close||close>=integer(object(captures[0]).order)||integer(object(returns[0]).order)>=integer(object(requests[1]).order)||Number(prime.end)>Number(object(h.off).calledAt))fail('dry-off-order');
  const primeFrame=integer(object(prime.request).frame),primeStart=primeFrame+rate*23/20,primeEnd=primeFrame+rate*5/4;if(!Number.isSafeInteger(primeStart)||!Number.isSafeInteger(primeEnd)||primeEnd>Math.round(Number(object(prime.after).audioTime)*rate)||primeEnd>integer(object(signal[1]).frame)||!isDeepStrictEqual(prime.inputIdentity,primeIdentity(historyWindow(data,pcm,rate,primeStart,primeEnd,1))))fail('dry-prime-window');
  const previous=new Map();let bytes=0;for(const [i,r]of data.entries()){const x=span(r,rate);follows(previous.get(x.id),x);if(x.id>2||r.sourceEpoch!==(x.id<2?null:epoch))fail('dry-row-origin');if(r.kind==='pcm'){if(r.file===undefined||r.bytes!==(x.end-x.start)*x.channels*4||!String(r.file).endsWith('/segment-'+String(i).padStart(6,'0')+'-p'+x.id+'.f32le'))fail('dry-artifact');bytes+=integer(r.bytes);}else if(r.file!==undefined||r.bytes!==undefined||r.sha256!==undefined)fail('dry-empty');if(x.end-integer(object(prepared.packet).frame)>20*rate)fail('dry-history-bound');previous.set(x.id,x);}
  if(p.pcmBytes!==bytes||p.chargedBytes!==bytes||bytes+historyReserve(spec)+FAILURE_RESERVE>PCM_CAP||!isDeepStrictEqual(p.retainedTail,retainedTail(data,integer(object(phases[1]).end))))fail('dry-bytes');
  let prior=Number(prime.end);const measured=[];for(const [i,phase]of phases.entries()){
    const t=object(phase.settling),c=object(phase.capture),req=object(phase.configure),marker=object(captures[i]),start=integer(phase.start),end=integer(phase.end),after=object(phase.after);
    const clock=[req.calledAt,req.returnedAt,t.start,t.end,c.calledAt,c.returnedAt];if(clock.some(v=>!finite(v))||Number(req.calledAt)<prior||Number(req.returnedAt)<Number(req.calledAt)||Number(t.start)<Number(req.returnedAt)||t.milliseconds!==1250||Number(t.end)-Number(t.start)<1250||Number(c.calledAt)<Number(t.end)||Number(c.returnedAt)<Number(c.calledAt)||Number(c.returnedAt)-Number(h.scenarioStartedAt)>90000||phase.stage!==i+1||marker.stage!==i+1||marker.start!==start||marker.end!==end||end-start!==rate||end%128||end>integer(marker.frame)||end>Math.round(Number(after.audioTime)*rate)||integer(marker.order)<=integer(object(returns[i+2]).order)||i===0&&integer(object(signal[2]).order)<=integer(marker.order)||c.bytes!==rate*8||c.writeStatus!=='completed')fail('dry-capture-clock');
    historyOwner(after,urls[i+1],false,spec);if(!isDeepStrictEqual(after.ledger,ledger.slice(0,rows(after.ledger).length))||!isDeepStrictEqual(after.inputPlan,{...plan,urls:urls.slice(0,i+2),inputs:inputs.slice(0,i+2)}))fail('dry-snapshot-prefix');
    const tail=data.find(r=>r.producerId===0&&integer(r.firstReceived)<=integer(marker.lastReceived)&&integer(r.lastReceived)>=integer(marker.lastReceived));if(!tail||marker.producerId!==0||marker.producerSequence!==marker.lastReceived||end!==integer(marker.packetFrame)+128||integer(marker.packetFrame)!==integer(tail.packetFrame)+(integer(marker.lastReceived)-integer(tail.firstReceived))*128)fail('dry-latest-packet');
    const program=historyWindow(data,pcm,rate,start,end,0),source=historyWindow(data,pcm,rate,start,end,1),assessment=assessDryCapture(program,source,i+1);if(sha(historyCaptureBytes(program))!==c.sha256||!isDeepStrictEqual(phase.assessment,JSON.parse(JSON.stringify(assessment))))fail('dry-capture-replay');if(!assessment.inputValid)fail('dry-source');if(!assessment.passed)fail('dry-rms');
    if(!covered(data,2,start,end,'empty')||data.some(r=>r.producerId===2&&integer(r.end)>start&&integer(r.start)<end&&r.kind!=='empty'))fail('dry-control-not-empty');measured.push(assessment);prior=Number(c.returnedAt);
  }
  const firstP=data.find(r=>r.producerId===0&&r.kind==='pcm'),firstS=data.find(r=>r.producerId===1&&r.kind==='pcm');if(!firstP||!firstS)fail('dry-bridge');const begin=Math.max(integer(firstP.start),integer(firstS.start)),end=integer(object(phases[1]).end);if(begin>Math.round(Number(object(prime.after).audioTime)*rate))fail('dry-bridge');for(const id of [0,1])if(!covered(data,id,begin,end))fail('dry-bridge');historyOwner(f,urls[2],false,spec);
  return {formation:'FORMED',history:'CONSISTENT',phases:measured,bridge:{start:begin,end},native7Witness:'UNASSESSED',native8Witness:'UNASSESSED',frameOrigin:'UNPROVEN',overallQualification:false};
}

/** The same DC99 source re-enters master ON with compressor/EQ/N still OFF.
 * @param {Record<string,unknown>} f @param {OwnerSpec} spec @param {Record<string,unknown>} checkpoint
 */
function wetOwner(f,spec,checkpoint){
  const before=object(checkpoint.facts),old=rows(before.nodes),nodes=rows(f.nodes),ps=rows(f.producers),r=object(f.readback),ledger=rows(f.ledger),prior=rows(before.ledger),urls=historyPlan(f.inputPlan,spec).urls;
  if(f.profile!==historyProfile(spec)||f.slot!==2||f.error!==null||f.sources!==1||f.contextId!==1||f.elementId!==1||f.contextState!=='running'||f.hidden!==false||f.paused!==false||f.currentSrc!==urls[2]||!isDeepStrictEqual(f.inputPlan,before.inputPlan)||!isDeepStrictEqual(f.connected,[2])||r.state!=='on'||r.wanted!==true||r.gain!==2||r.appliedGain!==2||r.sources!==1||nodes.length!==2||!isDeepStrictEqual(nodes[0],old[0])||ps.length!==4||!isDeepStrictEqual(ps.slice(0,3),before.producers)||!isDeepStrictEqual(ledger.slice(0,prior.length),prior))fail('wet-owner');
  const node=object(nodes[1]),epoch=integer(node.sourceEpoch);if(epoch<=integer(object(old[0]).sourceEpoch)||!isDeepStrictEqual(node,{id:2,portId:2,sourceEpoch:epoch,contextId:1,initial:'raw',options:{sourceEpoch:epoch,initial:'raw'},producerId:3})||!isDeepStrictEqual(ps[3],{id:3,portId:3,role:'control',channels:5,contextId:1,nodeId:2,sourceEpoch:epoch}))fail('wet-node');
  const suffix=ledger.slice(prior.length),allowed=['history-wet-request','history-wet-return','constructor','receive','send','node-connect','source-connect','history-capture'];
  for(const [i,e]of suffix.entries())if(e.order!==prior.length+i+1||!allowed.includes(String(e.type))||e.nodeId!==undefined&&e.nodeId!==2)fail('wet-ledger');
  const one=(/** @type {string} */type)=>{const a=suffix.filter(e=>e.type===type);if(a.length!==1)fail('wet-'+type);return object(a[0]);};
  const req=one('history-wet-request'),ret=one('history-wet-return'),ctor=one('constructor'),connect=one('source-connect'),outputs=suffix.filter(e=>e.type==='node-connect'),send=one('send');
  if(connect.sourceHandle!==1||ret.status!=='on'||integer(req.order)>=integer(ctor.order)||integer(ctor.order)>=integer(connect.order)||(!outputs.length||outputs.some(e=>integer(e.order)<=integer(ctor.order)||integer(e.order)>=integer(ret.order)))||integer(connect.order)>=integer(ret.order)||send.portId!==2||!isDeepStrictEqual(send.packet,{kind:'configure',sourceEpoch:epoch,seq:1,wanted:true,gain:2,eq:Array(8).fill(0),normalizer:false,dynamics:false,targetDbfs:-20}))fail('wet-command');
  const replies=suffix.filter(e=>e.type==='receive');if(replies.length!==3)fail('wet-replies');let frame=0,order=integer(ctor.order);
  for(const [i,e]of replies.entries()){
    const packet=object(e.packet),kind=['prepared','accepted','completed'][i];if(e.portId!==2||!isDeepStrictEqual(packet,{kind,sourceEpoch:epoch,seq:i?1:0,frame:packet.frame,meterEpoch:i?1:0,gain:i===2?2:null,code:null})||integer(packet.frame)<frame||integer(e.order)<=order||i===0&&integer(e.order)>=integer(send.order)||i===1&&integer(e.order)<=integer(send.order))fail('wet-ack');frame=integer(packet.frame);order=integer(e.order);
  }
  if(integer(object(replies[1]).order)>=integer(ret.order))fail('wet-return-before-accepted');return {request:req,returned:ret,completed:object(object(replies[2]).packet),completedOrder:integer(object(replies[2]).order)};
}
/** @param {ReturnType<typeof historyWindow>} program @param {ReturnType<typeof historyWindow>} source */
function assessWetCapture(program,source){
  const measurement=summarizeCapture(program),inputValid=source.channels.every(c=>c.every(v=>Math.abs(v-.99)<=1e-5));
  return {stage:3,level:.99,passed:inputValid&&measurement.channels.every(c=>c.peak<=.9801&&c.overFullScaleSamples===0),qualityAssessed:inputValid,inputValid,measurement};
}
/** @param {Record<string,unknown>[]} data @param {Map<string,Buffer>} pcm @param {number} start @param {number} end */
function wetControl(data,pcm,start,end){
  if(!covered(data,3,start,end)||!covered(data,2,start,end,'empty'))fail('wet-control-coverage');
  for(const row of data.filter(r=>r.producerId===3&&r.kind==='pcm')){
    const a=Math.max(start,integer(row.start)),b=Math.min(end,integer(row.end));if(b<=a)continue;const bytes=pcm.get(String(row.file));if(!bytes)fail('wet-control-bytes');
    for(let n=a;n<b;n++)for(let c=0;c<5;c++)if(Math.abs(bytes.readFloatLE(((n-integer(row.start))*5+c)*4)-([-1,1,2,1,0][c]??fail('wet-control-channel')))>(c===0?1e-6:0))fail('wet-control');
  }
}
/** @param {unknown} value @param {OwnerSpec} spec @param {Map<string,Buffer>} pcm */
function assessWetPrefixProof(value,spec,pcm){
  const p=object(value),f=object(p.facts),h=object(f.dryPrefix),checkpoint=object(h.checkpoint),phase=object(h.wet),data=rows(p.rows),cut=rows(checkpoint.rows),rate=spec.sampleRate;
  if(!wetHistory(spec)||p.schema!==historyProofSchema(spec)||!isDeepStrictEqual(p.spec,spec)||!isDeepStrictEqual(f.spec,spec)||h.stage!=='complete'||p.reservedBytes!==historyReserve(spec)||p.failureBytes!==0||p.failureEvidence!==null||rows(p.attemptedWrites).length||Buffer.byteLength(JSON.stringify(p))>PROOF_CAP||data.filter(r=>r.kind==='pcm').length>4091||!isDeepStrictEqual(data.slice(0,cut.length),cut)||!isDeepStrictEqual(copy({...h,checkpoint:undefined,wet:undefined}),object(object(checkpoint.facts).dryPrefix)))fail('wet-proof');
  const prefix=assessDryPrefixProof(checkpoint,spec,pcm),owner=wetOwner(f,spec,checkpoint),req=object(phase.configure),receipt=object(req.request),settling=object(phase.settling),c=object(phase.capture),start=integer(phase.start),end=integer(phase.end),after=object(phase.after),clock=[req.calledAt,req.returnedAt,settling.start,settling.end,c.calledAt,c.returnedAt],prior=object(rows(h.phases)[1]).capture;
  if(clock.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0)||Number(req.calledAt)<Number(object(prior).returnedAt)||Number(req.returnedAt)<Number(req.calledAt)||Number(settling.start)<Number(req.returnedAt)||settling.milliseconds!==1250||Number(settling.end)-Number(settling.start)<1250||Number(c.calledAt)<Number(settling.end)||Number(c.returnedAt)<Number(c.calledAt)||Number(c.returnedAt)-Number(h.scenarioStartedAt)>90000||receipt.frame!==owner.request.frame||receipt.status!==owner.returned.status||phase.stage!==3||end-start!==rate||end%128||start<integer(owner.completed.frame)||end>Math.round(Number(after.audioTime)*rate)||c.bytes!==rate*8||c.writeStatus!=='completed')fail('wet-clock');
  wetOwner(after,spec,checkpoint);if(!isDeepStrictEqual(after.ledger,rows(f.ledger).slice(0,rows(after.ledger).length)))fail('wet-snapshot');
  const markers=rows(f.ledger).filter(e=>e.type==='history-capture');if(markers.length!==3)fail('wet-capture-count');const marker=object(markers[2]),tail=data.find(r=>r.producerId===0&&integer(r.firstReceived)<=integer(marker.lastReceived)&&integer(r.lastReceived)>=integer(marker.lastReceived));
  if(marker.stage!==3||marker.start!==start||marker.end!==end||marker.producerId!==0||marker.producerSequence!==marker.lastReceived||end!==integer(marker.packetFrame)+128||end>integer(marker.frame)||integer(marker.order)<=integer(owner.returned.order)||integer(marker.order)<=owner.completedOrder||!tail||integer(marker.packetFrame)!==integer(tail.packetFrame)+(integer(marker.lastReceived)-integer(tail.firstReceived))*128)fail('wet-latest');
  const previous=new Map();let bytes=0;const epoch=integer(object(rows(f.nodes)[1]).sourceEpoch),prepared=integer(object(object(rows(object(checkpoint.facts).ledger).find(e=>e.type==='receive'&&object(e.packet).kind==='prepared')).packet).frame);
  for(const [i,row]of data.entries()){
    const x=span(row,rate);follows(previous.get(x.id),x);if(row.sourceEpoch!==(x.id<2?null:x.id===2?object(rows(f.nodes)[0]).sourceEpoch:epoch)||x.end-prepared>20*rate)fail('wet-row-origin');
    if(row.kind==='pcm'){if(row.bytes!==(x.end-x.start)*x.channels*4||!String(row.file).endsWith('/segment-'+String(i).padStart(6,'0')+'-p'+x.id+'.f32le'))fail('wet-artifact');bytes+=integer(row.bytes);}else if(row.file!==undefined||row.bytes!==undefined||row.sha256!==undefined)fail('wet-empty');previous.set(x.id,x);
  }
  if(p.pcmBytes!==bytes||p.chargedBytes!==bytes||bytes+historyReserve(spec)+FAILURE_RESERVE>PCM_CAP||!isDeepStrictEqual(p.retainedTail,retainedTail(data,end)))fail('wet-bytes');
  for(const id of [0,1])if(!covered(data,id,prefix.bridge.start,end))fail('wet-bridge');
  for(let n=integer(object(rows(h.phases)[1]).start);n<end;n+=rate)if(historyWindow(data,pcm,rate,n,Math.min(n+rate,end),1).channels.some(c=>c.some(v=>Math.abs(v-.99)>1e-5)))fail('wet-source-history');wetControl(data,pcm,start,end);
  const wet=assessWetCapture(historyWindow(data,pcm,rate,start,end,0),historyWindow(data,pcm,rate,start,end,1));if(!isDeepStrictEqual(phase.assessment,JSON.parse(JSON.stringify(wet)))||sha(historyCaptureBytes(historyWindow(data,pcm,rate,start,end,0)))!==c.sha256)fail('wet-capture-replay');if(!wet.inputValid)fail('wet-source');if(!wet.passed)fail('wet-ceiling');
  return {formation:'FORMED',history:'CONSISTENT',prefix,wet,bridge:{start:prefix.bridge.start,end},native7Witness:'UNASSESSED',native8Witness:'UNASSESSED',frameOrigin:'UNPROVEN',overallQualification:false};
}

/** The original port/epoch packets form a view; global orders and frames remain in the proof.
 * @param {Record<string,unknown>} f @param {OwnerSpec} spec @param {Record<string,unknown>} checkpoint
 */
function extremeOwner(f,spec,checkpoint){
  const before=object(checkpoint.facts),nodes=rows(f.nodes),ps=rows(f.producers),r=object(f.readback),ledger=rows(f.ledger),prior=rows(before.ledger),plan=historyPlan(f.inputPlan,spec,3);
  if(!extremeHistory(spec)||f.profile!==historyProfile(spec)||f.slot!==3||f.error!==null||f.sources!==1||f.contextId!==1||f.elementId!==1||f.contextState!=='running'||f.hidden!==false||f.paused!==false||f.currentSrc!==plan.urls[3]||!isDeepStrictEqual(f.connected,[3])||r.state!=='on'||r.wanted!==true||r.gain!==2||r.appliedGain!==2||r.sources!==1||nodes.length!==3||ps.length!==5||!isDeepStrictEqual(nodes.slice(0,2),before.nodes)||!isDeepStrictEqual(ps.slice(0,4),before.producers)||!isDeepStrictEqual(plan.urls.slice(0,3),object(before.inputPlan).urls)||!isDeepStrictEqual(plan.inputs.slice(0,3),object(before.inputPlan).inputs)||!isDeepStrictEqual(ledger.slice(0,prior.length),prior))fail('extreme-owner');
  const node=object(nodes[2]),epoch=integer(node.sourceEpoch);if(epoch<=integer(object(nodes[1]).sourceEpoch)||!isDeepStrictEqual(node,{id:3,portId:3,sourceEpoch:epoch,contextId:1,initial:'raw',options:{sourceEpoch:epoch,initial:'raw',normalizerWitness:true,headroomWitness:true},producerId:4})||!isDeepStrictEqual(ps[4],{id:4,portId:4,role:'control',channels:5,contextId:1,nodeId:3,sourceEpoch:epoch}))fail('extreme-node');
  const suffix=ledger.slice(prior.length),allowed=['history-signal','history-loaded','history-extreme-request','history-extreme-return','constructor','source-disconnect','node-disconnect','port-close','source-connect','node-connect','send','receive','history-capture'];
  for(const [i,e]of suffix.entries())if(e.order!==prior.length+i+1||!allowed.includes(String(e.type))||e.nodeId!==undefined&&(e.nodeId!==3&&!(e.nodeId===2&&['source-disconnect','node-disconnect','port-close'].includes(String(e.type)))))fail('extreme-ledger');
  const one=(/** @type {string} */type)=>{const a=suffix.filter(e=>e.type===type);if(a.length!==1)fail('extreme-'+type);return object(a[0]);};
  const signal=one('history-signal'),loaded=one('history-loaded'),request=one('history-extreme-request'),returned=one('history-extreme-return'),close=one('port-close'),ctor=one('constructor'),source=one('source-connect');
  if(signal.stage!==3||signal.fromUrl!==plan.urls[2]||signal.toUrl!==plan.urls[3]||signal.sha256!==object(plan.inputs[3]).sha256||loaded.stage!==3||loaded.url!==plan.urls[3]||integer(signal.order)>=integer(loaded.order)||integer(loaded.order)>=integer(request.order)||integer(request.order)>=integer(returned.order)||returned.status!=='on'||close.nodeId!==2||integer(close.order)>=integer(ctor.order)||source.nodeId!==3||source.sourceHandle!==1||integer(source.order)<=integer(ctor.order)||integer(source.order)>=integer(returned.order)||one('node-disconnect').all!==true||one('source-disconnect').sourceHandle!==1||!suffix.some(e=>e.type==='node-connect'))fail('extreme-source-transition');
  const wire=suffix.filter(e=>e.nodeId===3&&['send','receive'].includes(String(e.type))),sent=new Map(),meters=new Map(),seen=new Set();const globalStart=integer(object(object(rows(before.ledger).find(e=>e.type==='receive'&&e.nodeId===1&&object(e.packet).kind==='prepared')).packet).frame);let prepared=0,lastFrame=0,lastMeterEpoch=0,lastMeterSend=0;
  for(const e of wire){
    let p;try{p=validateL1NormalizerPacket(e.packet,String(e.type),true,true);}catch{fail('extreme-wire-shape');}
    if(e.portId!==3||p.sourceEpoch!==epoch||['failed','rejected','retired','read-error'].includes(p.kind)||p.kind==='meter-accepted'&&p.code==='error')fail('extreme-wire-failure');
    if(e.type==='send'){if(p.kind==='configure')sent.set(p.seq,p);else if(p.kind==='power'){if(integer(p.meterSeq)<=lastMeterSend||Number(p.observedTime)<globalStart/spec.sampleRate||Number(p.observedTime)>globalStart/spec.sampleRate+20)fail('extreme-meter-bound');lastMeterSend=integer(p.meterSeq);meters.set(p.meterSeq,p);}else fail('extreme-wire-send');continue;}
    const key=p.kind+'/'+p.seq;if(integer(p.frame)<globalStart||integer(p.frame)-globalStart>20*spec.sampleRate||seen.has(key)||integer(p.frame)<lastFrame||integer(p.meterEpoch)<lastMeterEpoch)fail('extreme-wire-order');seen.add(key);lastFrame=integer(p.frame);lastMeterEpoch=integer(p.meterEpoch);
    if(p.kind==='prepared'){if(prepared++||p.seq!==0||p.meterEpoch!==0)fail('extreme-prepared');}
    else if(p.kind==='meter-accepted'){const meter=meters.get(p.seq);if(!meter||meter.meterEpoch!==p.meterEpoch||!['hold','warmup','ramp'].includes(String(p.code)))fail('extreme-meter-ack');}
    else {const command=sent.get(p.seq);if(!command||p.kind==='completed'&&(!seen.has('accepted/'+p.seq)||p.gain!==command.gain))fail('extreme-wire-command');}
  }
  if(prepared!==1)fail('extreme-prepared');
  const commands=suffix.filter(e=>e.nodeId===3&&e.type==='send'&&object(e.packet).kind==='configure'),replies=suffix.filter(e=>e.nodeId===3&&e.type==='receive'),targets=[];
  for(const [i,e]of commands.entries()){
    const p=object(e.packet),seq=integer(p.seq),combined=p.normalizer===true;if(!seq||i&&seq<=integer(object(object(commands[i-1]).packet).seq)||e.portId!==3||!isDeepStrictEqual(p,{kind:'configure',sourceEpoch:epoch,seq,wanted:true,gain:p.gain,eq:Array(8).fill(combined?6:0),normalizer:combined,dynamics:combined,targetDbfs:combined?-12:-20})||![1,2].includes(Number(p.gain))||combined&&integer(e.order)<=integer(request.order))fail('extreme-command');if(combined&&p.gain===2)targets.push(e);
  }
  if(targets.length!==1||commands.at(-1)!==targets[0])fail('extreme-target');const targetSend=object(targets[0]),targetPacket=object(targetSend.packet),accepted=replies.filter(e=>object(e.packet).kind==='accepted'&&object(e.packet).seq===targetPacket.seq),completed=replies.filter(e=>object(e.packet).kind==='completed'&&object(e.packet).seq===targetPacket.seq);
  if(accepted.length!==1||completed.length!==1||integer(object(accepted[0]).order)<=integer(targetSend.order)||integer(object(completed[0]).order)<=integer(object(accepted[0]).order)||object(object(accepted[0]).packet).meterEpoch!==object(object(completed[0]).packet).meterEpoch)fail('extreme-target-ack');
  return {epoch,request,returned,target:{command:{message:targetPacket},accepted:object(object(accepted[0]).packet),completed:object(object(completed[0]).packet)},events:suffix.filter(e=>e.nodeId===3&&['send','receive'].includes(String(e.type)))};
}
/** @param {ReturnType<typeof extremeOwner>} owner @param {number} rate @param {number} query */
function extremeHeadroom(owner,rate,query){
  const first=owner.events.find(e=>e.type==='receive'&&object(e.packet).kind==='meter-accepted'&&integer(object(e.packet).frame)>=query);if(!first)return null;
  return {assessment:assessRenderHeadroom(extremeEvidence(owner,integer(first.order)),owner.target,Array(8).fill(6),rate,query),cutoffOrder:integer(first.order),receipt:object(first.packet)};
}
/** @param {ReturnType<typeof extremeOwner>} owner @param {number} cutoff */
function extremeEvidence(owner,cutoff){
  const raw=owner.events.filter(e=>integer(e.order)<=cutoff),events=raw.map((e,i)=>({order:i+1,direction:e.type,packet:e.packet})),ledger={schema:'f01-control-ledger-v3',available:true,reason:null,eventCount:events.length,bytes:0,maxEvents:4128,maxBytes:1048576,events};
  for(let i=0;i<4;i++)ledger.bytes=Buffer.byteLength(JSON.stringify(ledger));
  const evidence={schema:'f01-oracle-evidence-v3',initial:{available:true,reason:null,sourceEpoch:owner.epoch,initial:'raw',normalizerWitness:true,headroomWitness:true},ledger};
  return evidence;
}
/** @param {Record<string,unknown>[]} data @param {Map<string,Buffer>} pcm @param {number} frame @param {number} channel */
function extremeControlAt(data,pcm,frame,channel){
  const row=data.find(r=>r.producerId===4&&r.kind==='pcm'&&integer(r.start)<=frame&&frame<integer(r.end));if(!row)fail('extreme-control-unformed');const b=pcm.get(String(row.file));if(!b)fail('extreme-control-bytes');return b.readFloatLE(((frame-integer(row.start))*5+channel)*4);
}
/** The selected port is explicit; no zero/N1 is invented for unformed control.
 * @param {Record<string,unknown>[]} data @param {Map<string,Buffer>} pcm @param {number} rate @param {number} start @param {number} end
 */
function extremeControlWindow(data,pcm,rate,start,end){
  if(end-start>rate||!covered(data,4,start,end))fail('N-plan-control-coverage');const channels=Array.from({length:5},()=>new Float32Array(end-start));let next=start;
  for(const row of data.filter(r=>r.producerId===4&&r.kind==='pcm')){const a=Math.max(start,integer(row.start)),b=Math.min(end,integer(row.end));if(b<=a)continue;const bytes=pcm.get(String(row.file));if(a!==next||!bytes)fail('N-plan-control-gap');for(let n=a;n<b;n++)for(let c=0;c<5;c++)/** @type {Float32Array} */(channels[c])[n-start]=bytes.readFloatLE(((n-integer(row.start))*5+c)*4);next=b;}
  if(next!==end)fail('N-plan-control-gap');return {rate,start,end,channels};
}
/** Every window replays the same complete actual port history through the fixed observed end.
 * @param {ReturnType<typeof extremeOwner>} owner @param {Record<string,unknown>} facts @param {Record<string,unknown>[]} data @param {Map<string,Buffer>} pcm @param {number} rate @param {number} end
 */
function assessHistoryNormalizer(owner,facts,data,pcm,rate,end){
  const prepared=owner.events.find(e=>e.type==='receive'&&object(e.packet).kind==='prepared'),construction=integer(object(object(prepared).packet).frame),first=data.find(r=>r.producerId===4&&r.kind==='pcm'&&integer(r.end)>construction);
  if(!first)fail('N-plan-unformed');const start=Math.max(construction,integer(first.start));if(start>=end||!covered(data,4,construction,start,'empty')||!covered(data,4,start,end))fail('N-plan-control-coverage');
  const last=owner.events.filter(e=>e.type==='receive'&&integer(object(e.packet).frame)<end).at(-1);if(!last)fail('N-plan-history-unformed');const cutoff=integer(last.order),evidence=extremeEvidence(owner,cutoff),observation={schema:'f01-source-owner-normalizer-observation-v1',sources:facts.sources,l1Nodes:rows(facts.nodes).length,contextId:facts.contextId,elementId:facts.elementId,error:facts.error,contextState:facts.contextState,hidden:facts.hidden,selected:{nodeId:3,portId:3,producerId:4,sourceEpoch:owner.epoch}};
  let windows=0,maxDbError=0;/** @type {Record<string,unknown>|null} */let firstFailure=null;
  for(let a=start;a<end;a+=rate){const b=Math.min(a+rate,end),result=object(compareL1Normalizer({schema:'f01-l1-normalizer-input-source-owner-v1',sampleRate:rate,evidence,observation,source:historyWindow(data,pcm,rate,a,b,1),program:historyWindow(data,pcm,rate,a,b,0),control:extremeControlWindow(data,pcm,rate,a,b)}));windows++;
    if(result.comparison)maxDbError=Math.max(maxDbError,Number(object(result.comparison).maxDbError));
    if(result.status!=='diagnostic-match'){firstFailure={start:a,end:b,status:result.status,reason:result.reason,comparison:result.comparison??null};break;}
  }
  return {passed:firstFailure===null,status:firstFailure?firstFailure.status:'diagnostic-match',scope:observation.selected,totalL1Nodes:observation.l1Nodes,constructionFrame:construction,initialEmpty:{start:construction,end:start,assessed:false},start,end,windows,toleranceDb:.001,applicationTolerance:1e-10,maxDbError,firstFailure,cutoffOrder:cutoff};
}
/** @param {unknown} value @param {OwnerSpec} spec @param {Map<string,Buffer>} pcm @param {boolean} [replay] */
function assessExtremePrefixProof(value,spec,pcm,replay=true){
  const p=object(value),f=object(p.facts),h=object(f.dryPrefix),phase=object(h.extreme),checkpoint=object(phase.checkpoint),data=rows(p.rows),cut=rows(checkpoint.rows),rate=spec.sampleRate;
  if(!extremeHistory(spec)||p.schema!==historyProofSchema(spec)||!isDeepStrictEqual(p.spec,spec)||!isDeepStrictEqual(f.spec,spec)||h.stage!=='complete'||p.reservedBytes!==historyReserve(spec)||p.failureBytes!==0||p.failureEvidence!==null||rows(p.attemptedWrites).length||Buffer.byteLength(JSON.stringify(p))>PROOF_CAP||data.filter(r=>r.kind==='pcm').length>historyArtifactCap(spec)||!isDeepStrictEqual(data.slice(0,cut.length),cut)||!isDeepStrictEqual(copy({...h,extreme:undefined}),object(object(checkpoint.facts).dryPrefix)))fail('extreme-proof');
  const previousCapture=object(object(object(object(checkpoint.facts).dryPrefix).wet).capture);
  const prefix=assessWetPrefixProof(checkpoint,spec,pcm),owner=extremeOwner(f,spec,checkpoint),c=object(phase.capture),req=object(phase.configure),receipt=object(req.request),t=object(phase.settling),query=object(phase.query),after=object(query.facts),start=integer(phase.start),end=integer(phase.end),q=integer(query.frame),load=object(phase.load),clock=[load.calledAt,load.returnedAt,req.calledAt,req.returnedAt,t.start,t.end,c.calledAt,c.returnedAt,query.calledAt,query.returnedAt];
  if(clock.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0)||Number(load.calledAt)<Number(previousCapture.returnedAt)||Number(load.returnedAt)<Number(load.calledAt)||Number(req.calledAt)<Number(load.returnedAt)||Number(req.returnedAt)<Number(req.calledAt)||Number(t.start)<Number(req.returnedAt)||t.milliseconds!==9500||Number(t.end)-Number(t.start)<9500||Number(c.calledAt)<Number(t.end)||Number(c.returnedAt)<Number(c.calledAt)||Number(query.calledAt)<Number(c.returnedAt)||Number(query.returnedAt)<Number(query.calledAt)||Number(query.returnedAt)-Number(h.scenarioStartedAt)>90000||receipt.frame!==owner.request.frame||receipt.status!==owner.returned.status||phase.stage!==4||end-start!==rate||end%128||start<integer(owner.target.completed.frame)||q!==Math.round(Number(after.audioTime)*rate)||q<end||c.bytes!==rate*8||c.writeStatus!=='completed')fail('extreme-clock');
  extremeOwner(after,spec,checkpoint);if(!isDeepStrictEqual(after.ledger,rows(f.ledger).slice(0,rows(after.ledger).length))||!isDeepStrictEqual(load.plan,f.inputPlan))fail('extreme-query-prefix');
  const markers=rows(f.ledger).filter(e=>e.type==='history-capture'),marker=object(markers[3]),tail=data.find(r=>r.producerId===0&&integer(r.firstReceived)<=integer(marker.lastReceived)&&integer(r.lastReceived)>=integer(marker.lastReceived));
  if(markers.length!==4||marker.stage!==4||marker.start!==start||marker.end!==end||marker.producerId!==0||marker.producerSequence!==marker.lastReceived||end!==integer(marker.packetFrame)+128||end>integer(marker.frame)||integer(marker.order)<=integer(owner.returned.order)||!tail||integer(marker.packetFrame)!==integer(tail.packetFrame)+(integer(marker.lastReceived)-integer(tail.firstReceived))*128)fail('extreme-latest');
  const headroom=extremeHeadroom(owner,rate,q);if(!headroom)fail('extreme-headroom-unformed');const observedEnd=Math.max(q+1,integer(headroom.receipt.frame)+128),firstPrepared=integer(object(object(rows(object(checkpoint.facts).ledger).find(e=>e.type==='receive'&&e.nodeId===1&&object(e.packet).kind==='prepared')).packet).frame),previous=new Map();let bytes=0;
  if(phase.observedEnd!==observedEnd||observedEnd-firstPrepared>20*rate)fail('extreme-observation-bound');
  for(const [i,row]of data.entries()){
    const x=span(row,rate,4);follows(previous.get(x.id),x);if(row.sourceEpoch!==(x.id<2?null:object(rows(f.nodes)[x.id-2]).sourceEpoch)||x.end-firstPrepared>20*rate)fail('extreme-row-origin');
    if(row.kind==='pcm'){if(row.bytes!==(x.end-x.start)*x.channels*4||!String(row.file).endsWith('/segment-'+String(i).padStart(6,'0')+'-p'+x.id+'.f32le'))fail('extreme-artifact');bytes+=integer(row.bytes);}else if(row.file!==undefined||row.bytes!==undefined||row.sha256!==undefined)fail('extreme-empty');previous.set(x.id,x);
  }
  if(p.pcmBytes!==bytes||p.chargedBytes!==bytes||bytes+historyReserve(spec)+FAILURE_RESERVE>PCM_CAP||!isDeepStrictEqual(p.retainedTail,retainedTail(data,observedEnd)))fail('extreme-bytes');
  for(const id of [0,1])if(!covered(data,id,prefix.bridge.start,observedEnd))fail('extreme-bridge');if(!covered(data,4,start,observedEnd)||![2,3].every(id=>covered(data,id,start,observedEnd,'empty')))fail('extreme-control-coverage');
  const inputIdentity=primeIdentity(historyWindow(data,pcm,rate,start,end,1),-6),program=historyWindow(data,pcm,rate,start,end,0),measurement=summarizeCapture(program);if(sha(historyCaptureBytes(program))!==c.sha256)fail('extreme-capture-replay');
  for(let n=start;n<end;n++)for(const channel of [0,1,2,4])if(Math.abs(extremeControlAt(data,pcm,n,channel)-([-1,1,2,0,0][channel]??fail('extreme-control-channel')))>(channel===0?1e-6:0))fail('extreme-control');
  const scalar=extremeControlAt(data,pcm,q,3),scalarDb=scalar>0?20*Math.log10(scalar):null,failures=[];if(scalarDb===null||Math.abs(scalarDb-6)>=.1)failures.push('extreme-N-scalar');if(!headroom.assessment.passed)failures.push('extreme-headroom-'+headroom.assessment.status);if(measurement.channels.some(row=>row.peak>.9801||row.overFullScaleSamples!==0))failures.push('extreme-ceiling');
  const normalizerPlan=assessHistoryNormalizer(owner,f,data,pcm,rate,observedEnd);if(!normalizerPlan.passed)failures.push('extreme-N-plan-'+normalizerPlan.status);
  const extreme={passed:!failures.length,failures,inputIdentity,measurement,scalarDb,scalarFrame:q,headroom:headroom.assessment,headroomCutoffOrder:headroom.cutoffOrder,independentNormalizerPlan:normalizerPlan,fftBufferPower:'UNASSESSED',physicalPowerEquality:'UNPROVEN'};
  if(replay&&!isDeepStrictEqual(phase.assessment,JSON.parse(JSON.stringify(extreme))))fail('extreme-assessment');return {formation:'FORMED',history:'CONSISTENT',prefix,extreme,bridge:{start:prefix.bridge.start,end:observedEnd},native3Witness:'UNASSESSED',native7Witness:'UNASSESSED',native8Witness:'UNASSESSED',frameOrigin:'UNPROVEN',overallQualification:false};
}

/** @param {Record<string,unknown>} facts @param {OwnerSpec} spec */
function inputPlan(facts,spec){
  const p=object(facts.inputPlan),urls=p.urls;
  if(!isDeepStrictEqual(p.spec,spec)||p.sameBlob!==true||typeof p.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(p.sourceSha256)||!Array.isArray(urls)||urls.length!==2||urls[0]===urls[1]||urls.some(u=>typeof u!=='string'||!/^blob:https:\/\/chzzk\.naver\.com\/[A-Za-z0-9-]+$/.test(u)))fail('input-plan');
  if(suspendRebind(spec)&&p.formationMethod!=='controlled-public-suspend')fail('stimulus-plan');
  if(offStages(spec)&&p.formationMethod!=='controlled-public-suspend-off-stages')fail('stimulus-plan');
  return {plan:p,urls};
}

/** A post-window JS snapshot, not an assertion of exclusive Native ownership at every frame.
 * @param {Record<string,unknown>} s @param {number} nodeId @param {unknown} url
 */
function stableOwner(s,nodeId,url){
  if(!isDeepStrictEqual(s.connected,[nodeId])||s.currentSrc!==url||s.sources!==1||s.contextState!=='running'||s.hidden!==false||s.paused!==false||!isDeepStrictEqual(s.readback,{state:'on',sources:1,wanted:true,gain:1,appliedGain:1}))fail('stable-owner');
}

/** The disconnect observation is after controller clear; only the fixed-source preimage is claimed.
 * @param {Record<string,unknown>} facts @param {Record<string,unknown>[]} nodes @param {unknown[]} urls @param {number} rate
 */
function assessPendingFlight(facts,nodes,urls,rate){
  const controlled=facts.profile==='suspend-rebind'||facts.profile==='off-stages',applied=controlled&&object(facts.stimulus).status==='APPLIED';if(!controlled&&facts.profile!=='pending-off')fail('pending-profile');
  const ledger=rows(facts.ledger),keys=nodes.map(n=>object(n.sourceKey)),a=object(nodes[0]),b=object(nodes[1]),origin=object(keys[0]);
  if(!integer(origin.documentGeneration)||origin.routePath!=='/live/'+'a'.repeat(32))fail('pending-source-key');
  for(const [i,key]of keys.entries())if(!isDeepStrictEqual(key,{currentSrc:urls[i],documentGeneration:origin.documentGeneration,routePath:origin.routePath}))fail('pending-source-key');
  /** @param {string} type */
  const events=type=>ledger.filter(e=>e.type===type);
  /** @param {string} type @param {number} id */
  const one=(type,id)=>{const all=events(type).filter(e=>e.nodeId===id);if(all.length!==1)fail('pending-'+type);return object(all[0]);};
  const sends=events('send'),returns=events('send-return');
  const aSends=sends.filter(e=>e.nodeId===1),bSends=sends.filter(e=>e.nodeId===2),off=aSends.find(e=>object(e.packet).seq===2);
  if(aSends.length!==(off?2:1)||bSends.length!==1||sends.length!==aSends.length+1||returns.length!==sends.length)fail('pending-sends');
  for(const send of sends){
    const packet=object(send.packet),id=integer(send.nodeId),node=id===1?a:b,matched=returns.filter(e=>e.sendOrder===send.order);
    if(id!==1&&id!==2||send.portId!==id||matched.length!==1)fail('pending-return');
    const receipt=object(matched[0]),isOff=send===off;
    if(receipt.order!==integer(send.order)+1||receipt.nodeId!==id||receipt.portId!==id||receipt.sourceEpoch!==node.sourceEpoch||
      receipt.contextId!==1||receipt.elementId!==1||receipt.sourceHandle!==1||receipt.sources!==1||receipt.wanted!==true||
      receipt.currentSrc!==(isOff?(applied?urls[1]:''):urls[id-1])||receipt.src!==urls[isOff?1:id-1]||receipt.documentGeneration!==origin.documentGeneration||receipt.routePath!==origin.routePath||
      !isDeepStrictEqual(packet,{kind:'configure',sourceEpoch:node.sourceEpoch,seq:isOff?2:1,wanted:!isOff,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:true,targetDbfs:-20}))fail('pending-return');
  }
  const attempt=one('source-disconnect-attempt',1),returned=one('source-disconnect-return',1),disconnected=one('source-disconnect',1),nodeDisconnected=one('node-disconnect',1),closed=one('port-close',1),ctor=one('constructor',2);
  if(events('source-disconnect-attempt').length!==1||events('source-disconnect-return').length!==1||events('source-disconnect').length!==1||events('node-disconnect').length!==1||events('port-close').length!==1||attempt.portId!==1||attempt.sourceEpoch!==a.sourceEpoch||
    attempt.sourceHandle!==1||attempt.contextId!==1||attempt.elementId!==1||attempt.connected!==true||attempt.outputs!==true||attempt.closed!==false||
    attempt.currentSrc!==urls[1]||attempt.src!==urls[1]||attempt.wanted!==true||attempt.documentGeneration!==origin.documentGeneration||attempt.routePath!==origin.routePath||
    integer(disconnected.order)!==integer(attempt.order)+1||returned.attemptOrder!==attempt.order||integer(returned.order)!==integer(disconnected.order)+1||
    integer(returned.order)>=integer(nodeDisconnected.order)||integer(nodeDisconnected.order)>=integer(closed.order)||integer(closed.order)>=integer(ctor.order))fail('pending-handoff');
  const transition=events('switch');if(transition.length!==1||integer(object(transition[0]).order)>=integer(attempt.order))fail('pending-switch');
  if(off&&(integer(off.order)<=integer(object(transition[0]).order)||integer(off.order)+1>=integer(attempt.order)))fail('pending-off-order');
  if(controlled)assessSuspendStimulus(facts,a,urls,off,attempt,closed,ctor);
  let accepted=/** @type {Record<string,unknown>|undefined} */(undefined),completed=false;
  const first=events('receive').find(e=>e.nodeId===1&&object(e.packet).kind==='prepared'),firstFrame=integer(object(first?.packet).frame);
  for(const event of events('receive')){const frame=integer(object(event.packet).frame);if(frame<firstFrame||frame-firstFrame>20*rate)fail('pending-history-bound');}
  const originalDone=events('receive').find(e=>e.nodeId===1&&object(e.packet).seq===1&&object(e.packet).kind==='completed');
  let lastFrame=integer(object(originalDone?.packet).frame),lastMeter=integer(object(originalDone?.packet).meterEpoch);
  for(const event of events('receive').filter(e=>e.nodeId===1&&object(e.packet).seq!==0&&object(e.packet).seq!==1)){
    const packet=object(event.packet);
    if(!off||event.portId!==1||packet.sourceEpoch!==a.sourceEpoch||packet.seq!==2||!['accepted','completed'].includes(String(packet.kind))||
      Object.keys(packet).sort().join(',')!=='code,frame,gain,kind,meterEpoch,seq,sourceEpoch'||packet.code!==null||packet.gain!==(packet.kind==='completed'?1:null)||
      integer(event.order)<=integer(off.order)+1||integer(packet.frame)<lastFrame||integer(packet.meterEpoch)<lastMeter)fail('pending-reply');
    if(packet.kind==='accepted'){if(accepted||completed)fail('pending-reply');accepted=event;}
    else {if(!accepted||completed||packet.meterEpoch!==object(accepted.packet).meterEpoch)fail('pending-reply');completed=true;}
    lastFrame=integer(packet.frame);lastMeter=integer(packet.meterEpoch);
  }
  return {flight:(!controlled||applied)&&off&&(!accepted||integer(accepted.order)>integer(attempt.order))?'MAIN_RECONSTRUCTED':'NOT_OBSERVED',lateObserved:events('receive').some(e=>e.nodeId===1&&object(e.packet).seq===2&&integer(e.order)>integer(closed.order))};
}

/** @param {Record<string,unknown>} facts @param {Record<string,unknown>} a @param {unknown[]} urls
 * @param {Record<string,unknown>|undefined} off @param {Record<string,unknown>} attempt @param {Record<string,unknown>} closed @param {Record<string,unknown>} ctor */
function assessSuspendStimulus(facts,a,urls,off,attempt,closed,ctor){
  const ledger=rows(facts.ledger),key=object(a.sourceKey),stimulus=object(facts.stimulus),method=facts.profile==='off-stages'?'controlled-public-suspend-off-stages':'controlled-public-suspend';
  const applied=stimulus.status==='APPLIED';if(stimulus.method!==method||!['APPLIED','NOT_OBSERVED'].includes(String(stimulus.status))||applied&&!off)fail('stimulus-status');
  const common={nodeId:1,portId:1,sourceEpoch:a.sourceEpoch,contextId:1,elementId:1,sourceHandle:1,method,documentGeneration:key.documentGeneration,routePath:key.routePath};
  /** @param {string} type */
  const one=type=>{const found=ledger.filter(e=>e.type===type);if(found.length!==1)fail('stimulus-'+type);const e=object(found[0]);for(const [k,v]of Object.entries(common))if(e[k]!==v)fail('stimulus-origin');return e;};
  const arm=one('stimulus-arm'),entry=one('stimulus-enter'),restored=one('stimulus-restored'),call=one('configure-call'),returned=one('configure-return'),transition=object(ledger.find(e=>e.type==='switch'));
  if(arm.aEnd!==transition.aEnd||!isDeepStrictEqual([transition,arm,entry,restored,call,returned].map(e=>integer(e.order)),[transition,arm,entry,restored,call,returned].map(e=>integer(e.order)).sort((x,y)=>x-y)))fail('stimulus-order');
  if(applied&&off){
    const suspend=one('suspend-call'),resumed=one('suspend-return');
    if(ledger.some(e=>e.type==='stimulus-missed')||!(integer(restored.order)<integer(suspend.order)&&integer(suspend.order)<integer(off.order)&&integer(off.order)+1<integer(resumed.order)&&integer(resumed.order)<integer(call.order)&&integer(call.order)<integer(attempt.order)&&integer(closed.order)<integer(returned.order)&&integer(returned.order)<integer(ctor.order)))fail('stimulus-order');
    if(entry.currentSrc!==urls[1]||entry.src!==urls[1]||entry.sources!==1||entry.connected!==true||entry.outputs!==true||entry.closed!==false||entry.videoConnected!==true||entry.selected!==true||entry.mediaCurrent!==true||entry.eligible!==true||entry.hidden!==false||entry.contextState!=='running'||!isDeepStrictEqual(entry.readback,{state:'on',sources:1,wanted:true,gain:1,appliedGain:1}))fail('stimulus-entry');
    if(ledger.some(e=>e.type==='receive'&&e.nodeId===1&&object(e.packet).seq===2&&integer(e.order)<integer(attempt.order)))fail('stimulus-early-reply');
  }else{
    const missed=one('stimulus-missed'),preempted=off?integer(off.order)+1<integer(entry.order):integer(closed.order)<integer(entry.order)&&entry.connected===false&&entry.outputs===false&&entry.closed===true;
    if(!preempted||!(integer(restored.order)<integer(missed.order)&&integer(missed.order)<integer(call.order))||entry.currentSrc!==urls[1]||entry.src!==urls[1]||ledger.some(e=>['suspend-call','suspend-return'].includes(String(e.type))))fail('stimulus-missed');
  }
  for(const type of ['node-disconnect','port-close']){
    const attempts=ledger.filter(e=>e.type===type+'-attempt'),returns=ledger.filter(e=>e.type===type+'-return'),events=ledger.filter(e=>e.type===type);
    if(attempts.length!==1||returns.length!==1||events.length!==1)fail('stimulus-release');const x=object(attempts[0]),y=object(returns[0]),e=object(events[0]);
    if(x.nodeId!==1||y.nodeId!==1||y.attemptOrder!==x.order||integer(e.order)!==integer(x.order)+1||integer(y.order)!==integer(e.order)+1||integer(x.order)<=integer(attempt.order))fail('stimulus-release');
  }
}

/** Dedicated receipts establish only their positive stage, without ordering the worker against original-port close.
 * @param {Record<string,unknown>} facts @param {Record<string,unknown>} node
 * @param {{end:number,prepared:number,completed:number,completedOrder:number}} a @param {OwnerSpec} spec
 */
function assessOffStages(facts,node,a,spec){
  const ledger=rows(facts.ledger),metadata=object(facts.offStages),registration=metadata.registration,key=object(node.sourceKey);
  if(typeof registration!=='string'||!/^[a-f0-9]{32}$/.test(registration)||!isDeepStrictEqual(metadata,{registration,endpointId:1,frozen:true})||facts.offStageCleanupErrors!==undefined&&!isDeepStrictEqual(facts.offStageCleanupErrors,[]))fail('off-stage-metadata');
  const binding={nodeId:1,portId:1,sourceEpoch:node.sourceEpoch,endpointId:1,contextId:1,elementId:1,sourceHandle:1,documentGeneration:key.documentGeneration,routePath:key.routePath};
  const target={kind:'configure',sourceEpoch:node.sourceEpoch,seq:2,wanted:false,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:true,targetDbfs:-20};
  /** @param {string} type */
  const one=type=>{const found=ledger.filter(e=>e.type===type);if(found.length!==1)fail('off-stage-'+type);return object(found[0]);};
  const sent=one('off-stage-register-send'),returned=one('off-stage-register-return'),transition=one('switch'),arm=one('stimulus-arm');
  if(!isDeepStrictEqual(sent,{order:sent.order,type:'off-stage-register-send',...binding,aEnd:a.end,packet:{kind:'off-stage-register',sourceEpoch:node.sourceEpoch,registration,target},transferEndpointIds:[1]})||
    !isDeepStrictEqual(returned,{order:returned.order,type:'off-stage-register-return',...binding,aEnd:a.end,sendOrder:sent.order})||
    integer(sent.order)<=a.completedOrder||integer(returned.order)!==integer(sent.order)+1)fail('off-stage-registration');
  const received=ledger.filter(e=>e.type==='off-stage-receive');if(!received.length||received.length>6)fail('off-stage-receipts');
  const off=ledger.find(e=>e.type==='send'&&e.nodeId===1&&object(e.packet).seq===2),stages=['registered','callback','stored','accepted','accepted-post-returned','completed'];
  /** @type {Map<string,Record<string,unknown>>} */const observed=new Map();let lastStage=-1;
  for(const row of received){
    const packet=object(row.packet),stage=String(packet.stage),hasReply=['accepted','accepted-post-returned','completed'].includes(stage);
    if(!stages.includes(stage)||stages.indexOf(stage)<=lastStage||observed.has(stage)||Buffer.byteLength(JSON.stringify(packet))>1024||
      !isDeepStrictEqual(row,{order:row.order,type:'off-stage-receive',...binding,packet})||
      !isDeepStrictEqual(packet,{schema:'f01-off-stage-receipt-v1',registration,sourceEpoch:node.sourceEpoch,seq:2,stage,target,...(hasReply?{reply:packet.reply}:{})}))fail('off-stage-receipt');
    if(hasReply){
      const reply=object(packet.reply),completed=stage==='completed',frame=integer(reply.frame),meterEpoch=integer(reply.meterEpoch);
      if(!isDeepStrictEqual(reply,{kind:completed?'completed':'accepted',sourceEpoch:node.sourceEpoch,seq:2,frame,meterEpoch,gain:completed?1:null,code:null})||frame<a.completed||frame-a.prepared>20*spec.sampleRate)fail('off-stage-reply');
      const original=ledger.find(e=>e.type==='receive'&&e.nodeId===1&&object(e.packet).seq===2&&object(e.packet).kind===reply.kind);
      if(original&&!isDeepStrictEqual(original.packet,reply))fail('off-stage-reply');
    }
    observed.set(stage,row);lastStage=stages.indexOf(stage);
  }
  const ack=observed.get('registered');if(!ack||!(integer(returned.order)<integer(ack.order)&&integer(ack.order)<integer(transition.order)&&integer(ack.order)<integer(arm.order)))fail('off-stage-ack');
  for(const [stage,row]of observed)if(stage!=='registered'&&(!off||!isDeepStrictEqual(off.packet,target)||integer(row.order)<=integer(off.order)+1||integer(row.order)<=integer(ack.order)))fail('off-stage-target');
  const accepted=observed.get('accepted'),posted=observed.get('accepted-post-returned');
  if(accepted&&posted&&!isDeepStrictEqual(object(accepted.packet).reply,object(posted.packet).reply))fail('off-stage-reply');
  const accept=accepted??posted,completed=observed.get('completed');
  if(accept&&completed){const first=object(object(accept.packet).reply),last=object(object(completed.packet).reply);if(integer(first.frame)>integer(last.frame)||first.meterEpoch!==last.meterEpoch)fail('off-stage-reply');}
  /** @param {string} stage @returns {'OBSERVED'|'UNKNOWN'} */
  const status=stage=>observed.has(stage)?'OBSERVED':'UNKNOWN';
  return {callback:status('callback'),stored:status('stored'),accepted:status('accepted'),acceptedPostReturned:status('accepted-post-returned'),completed:status('completed')};
}

/** @param {unknown} value @param {OwnerSpec} spec */
export function assessSourceOwnerProof(value,spec){
  const stages=offStages(spec),controlled=suspendRebind(spec)||stages,pending=pendingOff(spec)||controlled;if(!pending)sourceOwnerCase(spec);const p=object(value),f=object(p.facts);
  if(p.schema!==ownerProofSchema(spec)||f.profile!==(stages?'off-stages':controlled?'suspend-rebind':pending?'pending-off':f.profile)||!isDeepStrictEqual(p.spec,spec)||!isDeepStrictEqual(f.spec,spec)||f.sources!==1||f.contextId!==1||f.elementId!==1||f.error!==null||p.failureBytes!==0||p.failureEvidence!==null||rows(p.attemptedWrites).length||Buffer.byteLength(JSON.stringify(p))>PROOF_CAP)fail('proof');
  const {urls}=inputPlan(f,spec),nodes=rows(f.nodes),producers=rows(f.producers),ledger=rows(f.ledger),data=rows(p.rows);
  if(nodes.length!==2||producers.length!==4||ledger.length>4128||!data.length||data.length+1>4096)fail('counts');
  for(const [i,n]of nodes.entries()){
    const options=object(n.options);if(n.id!==i+1||n.portId!==i+1||n.contextId!==1||n.producerId!==i+2||!integer(n.sourceEpoch)||n.initial!=='raw'||options.sourceEpoch!==n.sourceEpoch||options.initial!=='raw'||Object.keys(options).some(k=>!['sourceEpoch','initial','normalizerWitness',...(stages&&i===0?['offStageWitness']:[])].includes(k))||stages&&i===0&&options.offStageWitness!==true||options.normalizerWitness!==undefined&&typeof options.normalizerWitness!=='boolean')fail('constructor');
  }
  if(integer(nodes[1]?.sourceEpoch)<=integer(nodes[0]?.sourceEpoch))fail('epoch-order');
  for(const [i,r]of producers.entries())if(!isDeepStrictEqual(r,{id:i,portId:i,role:i===0?'program':i===1?'source':'control',channels:i<2?2:5,contextId:1,nodeId:i<2?null:i-1,sourceEpoch:i<2?null:nodes[i-2]?.sourceEpoch}))fail('producer-binding');
  const allowed=['constructor','source-create','node-connect','source-connect','source-disconnect','node-disconnect','port-close','send','receive','switch','apply',...(pending?['send-return','source-disconnect-attempt','source-disconnect-return']:[]),...(controlled?['stimulus-arm','stimulus-enter','stimulus-restored','stimulus-missed','suspend-call','suspend-return','configure-call','configure-return','node-disconnect-attempt','node-disconnect-return','port-close-attempt','port-close-return']:[]),...(stages?['off-stage-register-send','off-stage-register-return','off-stage-receive']:[])];
  for(const [i,e]of ledger.entries())if(e.order!==i+1||!allowed.includes(String(e.type))||e.nodeId!==undefined&&![1,2].includes(Number(e.nodeId)))fail('ledger');
  if(pending&&Buffer.byteLength(JSON.stringify(ledger))>480*1024)fail('ledger-cap');
  const reconstructed=pending?assessPendingFlight(f,nodes,urls,spec.sampleRate):null;
  /** @param {string} type @param {number|undefined} id */
  const one=(type,id)=>{const found=ledger.filter(e=>e.type===type&&(id===undefined||e.nodeId===id));if(found.length!==1)return fail('ledger-'+type);return /** @type {Record<string,unknown>} */(found[0]);};
  const created=one('source-create',undefined);if(created.sourceHandle!==1)fail('source-handle');
  /** @type {{nodeId:number,start:number,end:number,prepared:number,completed:number,preparedOrder:number,completedOrder:number,sendOrder:number}[]} */const windows=[];
  for(const [i,n]of nodes.entries()){
    const id=i+1,ctor=one('constructor',id),sent=ledger.filter(e=>e.type==='send'&&e.nodeId===id&&(!pending||object(e.packet).seq===1));if(sent.length!==1)fail('command');
    const send=object(sent[0]),command=object(send.packet),replies=ledger.filter(e=>e.type==='receive'&&e.nodeId===id&&(!pending||id!==1||object(e.packet).seq!==2));
    if(send.portId!==id||!isDeepStrictEqual(command,{kind:'configure',sourceEpoch:n.sourceEpoch,seq:1,wanted:true,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:true,targetDbfs:-20})||replies.length!==3)fail('command');
    const kinds=['prepared','accepted','completed'];const packets=replies.map((r,j)=>{
      const m=object(r.packet);if(r.portId!==id||Object.keys(m).sort().join(',')!=='code,frame,gain,kind,meterEpoch,seq,sourceEpoch'||m.kind!==kinds[j]||m.sourceEpoch!==n.sourceEpoch||m.seq!==(j===0?0:1)||m.code!==null||m.gain!==(j===2?1:null))fail('reply');integer(m.frame);integer(m.meterEpoch);return m;
    });
    const prepared=integer(packets[0]?.frame),accepted=integer(packets[1]?.frame),completed=integer(packets[2]?.frame);
    if(integer(ctor.order)>=integer(replies[0]?.order)||integer(replies[0]?.order)>=integer(send.order)||integer(send.order)>=integer(replies[1]?.order)||prepared>accepted||accepted>completed||packets[0]?.meterEpoch!==0||packets[1]?.meterEpoch!==packets[2]?.meterEpoch)fail('ack-order');
    const start=Math.ceil(completed/(spec.sampleRate/10))*spec.sampleRate/10;windows.push({nodeId:id,start,end:start+spec.sampleRate/10,prepared,completed,preparedOrder:integer(replies[0]?.order),completedOrder:integer(replies[2]?.order),sendOrder:integer(send.order)});
  }
  const a=windows[0],b=windows[1];if(!a||!b||a.end>b.start||b.end-a.prepared>20*spec.sampleRate)fail('history-bound');
  if(!isDeepStrictEqual(p.retainedTail,retainedTail(data,b.end)))fail('retained-tail');
  const transition=one('switch',undefined),bCtor=one('constructor',2);if(transition.order!==f.switchOrder||transition.fromNodeId!==1||transition.sourceHandle!==1||transition.fromUrl!==urls[0]||transition.toUrl!==urls[1]||transition.aEnd!==a.end||integer(transition.order)>=integer(bCtor.order)||a.completedOrder>=integer(transition.order))fail('switch');
  for(const type of ['source-disconnect','node-disconnect','port-close']){const e=one(type,1);if(integer(e.order)<=integer(transition.order)||integer(e.order)>=integer(bCtor.order)||type==='source-disconnect'&&e.sourceHandle!==1||type==='node-disconnect'&&e.all!==true)fail('handoff');}
  const closeOrder=integer(one('port-close',1).order);if(ledger.some(e=>e.nodeId===1&&['source-connect','node-connect','send'].includes(String(e.type))&&integer(e.order)>closeOrder))fail('closed-node-reconnect');
  for(const w of windows){const e=one('source-connect',w.nodeId);if(e.sourceHandle!==1||integer(e.order)<=w.preparedOrder||integer(e.order)>=w.sendOrder||!ledger.some(r=>r.type==='node-connect'&&r.nodeId===w.nodeId))fail('source-handle');}
  if(integer(created.order)<=a.preparedOrder||integer(created.order)>=integer(one('source-connect',1).order))fail('source-create-order');
  const stable=object(f.stable);
  for(const [key,w]of /** @type {const} */([['a',a],['b',b]])){
    const s=object(stable[key]);stableOwner(s,w.nodeId,urls[w.nodeId-1]);if(s.nodeId!==w.nodeId||!isDeepStrictEqual(s.window,{start:w.start,end:w.end}))fail('stable-window');
  }
  /** @type {Map<number,ReturnType<typeof span>>} */const previous=new Map();let bytes=0;
  for(const [i,r]of data.entries()){
    const s=span(r,spec.sampleRate);follows(previous.get(s.id),s);if(s.r.sourceEpoch!==producers[s.id]?.sourceEpoch)fail('row-origin');
    if(s.r.kind==='pcm'){
      const size=(s.end-s.start)*s.channels*4;if(r.bytes!==size||typeof r.file!=='string'||!r.file.endsWith('/segment-'+String(i).padStart(6,'0')+'-p'+s.id+'.f32le')||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256))fail('artifact');bytes+=size;
    }else if(r.file!==undefined||r.bytes!==undefined||r.sha256!==undefined)fail('empty-artifact');
    if(s.end-a.prepared>20*spec.sampleRate)fail('history-bound');previous.set(s.id,s);
  }
  if(bytes<=0||bytes>PCM_CAP||p.pcmBytes!==bytes||p.chargedBytes!==bytes)fail('pcm-cap');
  /** @param {number} id @param {number} start @param {number} end */
  const covers=(id,start,end)=>{let next=start;for(const r of data.filter(r=>r.producerId===id&&r.kind==='pcm')){const x=Math.max(next,integer(r.start)),y=Math.min(end,integer(r.end));if(y<=x)continue;if(x!==next)fail('window-unformed');next=y;}if(next!==end)fail('window-unformed');};
  const firstP=data.find(r=>r.producerId===0&&r.kind==='pcm'),firstS=data.find(r=>r.producerId===1&&r.kind==='pcm');if(!firstP||!firstS)fail('bridge');
  const globalStart=Math.max(integer(firstP.start),integer(firstS.start));for(const id of [0,1])covers(id,globalStart,b.end);
  if(globalStart>a.start)fail('bridge');for(const w of windows){for(const id of [0,1,w.nodeId+1])covers(id,w.start,w.end);}
  return {formation:'FORMED',ownership:'CONSISTENT',...(controlled?{formationMethod:stages?'controlled-public-suspend-off-stages':'controlled-public-suspend'}:{}),...(stages?{offStages:assessOffStages(f,object(nodes[0]),a,spec)}:{}),windows:{a:{start:a.start,end:a.end},b:{start:b.start,end:b.end}},bridge:{start:globalStart,end:b.end},pcmBytes:bytes,lateReplyWitness:'UNASSESSED',lateReplyObservation:reconstructed?.lateObserved?'OBSERVED':'NOT_OBSERVED',pendingFlight:reconstructed?.flight??'UNASSESSED',waveQuality:'UNASSESSED',exclusiveNativeOwnership:'UNASSESSED',native7Witness:'UNASSESSED',native8Witness:'UNASSESSED',frameOrigin:'UNPROVEN',overallQualification:false};
}

/** @param {OwnerFiles} files @param {string} directory @param {unknown} caller */
export async function readSourceOwnerProof(files,directory,caller){
  const spec=ownerSpec(caller);ownerDirectory(directory);const file=directory+'/source-owner-proof.json',stat=await files.lstat(file);if(!stat?.isFile()||stat.size>PROOF_CAP)fail('proof-cap');
  const proof=object(JSON.parse(String(await files.readFile(file,'utf8')))),plan=await files.readFile(directory+'/input-plan.json','utf8');if(Buffer.byteLength(plan)>PROOF_CAP||!isDeepStrictEqual(JSON.parse(String(plan)),object(proof.facts).inputPlan))fail('input-plan');
  const assessment=assessSourceOwnerProof(proof,spec);
  for(const [index,r] of rows(proof.rows).entries())if(r.kind==='pcm'){
    if((suspendRebind(spec)||offStages(spec))&&r.file!==directory+'/segment-'+String(index).padStart(6,'0')+'-p'+r.producerId+'.f32le')fail('artifact-path');
    if(typeof r.file!=='string'||!r.file.startsWith(directory+'/segment-'))fail('artifact-path');const size=await files.lstat(r.file);if(!size?.isFile()||size.size!==r.bytes)fail('artifact-size');
    const value=await files.readFile(r.file);const bytes=typeof value==='string'?Buffer.from(value):value;if(sha(bytes)!==r.sha256)fail('artifact-hash');for(let n=0;n<bytes.length;n+=4)if(!Number.isFinite(bytes.readFloatLE(n)))fail('pcm-nonfinite');
  }
  return {proof,assessment};
}

/** @param {Record<string,unknown>} facts @param {number} id @param {OwnerSpec} spec */
function observationWindow(facts,id,spec){
  if(facts.error||facts.sources!==1||facts.contextState!=='running'||facts.hidden!==false)fail('live-state');
  const node=rows(facts.nodes).find(n=>n.id===id);if(!node)return null;
  const ledger=rows(facts.ledger),events=ledger.filter(e=>e.type==='receive'&&e.nodeId===id);
  for(const e of events)if(e.portId!==id||object(e.packet).sourceEpoch!==node.sourceEpoch)fail('reply-origin');
  const completed=events.filter(e=>object(e.packet).kind==='completed');if(completed.length>1)fail('duplicate-completed');if(!completed.length)return null;
  const packet=object(completed[0]?.packet);if(packet.gain!==1||packet.code!==null)fail('completed');
  const start=Math.ceil(integer(packet.frame)/(spec.sampleRate/10))*spec.sampleRate/10;return {nodeId:id,start,end:start+spec.sampleRate/10};
}

/** Only the first ON may wait for a not-yet-created source; completed windows still require source1.
 * @param {Record<string,unknown>} facts
 */
function initialSourcePending(facts){
  if(facts.sources!==0||facts.error!==null||facts.contextState!=='running'||facts.hidden!==false||!isDeepStrictEqual(facts.readback,{state:'pending',wanted:true,gain:1,appliedGain:null,sources:0}))return false;
  const nodes=rows(facts.nodes),ledger=rows(facts.ledger);
  if(nodes.length>1||ledger.some((e,i)=>e.order!==i+1||e.nodeId!==1||!['constructor','node-connect','receive'].includes(String(e.type))))return false;
  if(!nodes.length)return !ledger.length;
  const n=nodes[0];if(!n||n.id!==1||n.portId!==1||n.contextId!==1||!integer(n.sourceEpoch)||ledger.filter(e=>e.type==='constructor').length!==1)return false;
  const replies=ledger.filter(e=>e.type==='receive');if(replies.length>1)return false;
  for(const e of replies){const p=object(e.packet);if(e.portId!==1||Object.keys(p).sort().join(',')!=='code,frame,gain,kind,meterEpoch,seq,sourceEpoch'||p.kind!=='prepared'||p.sourceEpoch!==n.sourceEpoch||p.seq!==0||p.meterEpoch!==0||p.gain!==null||p.code!==null)return false;integer(p.frame);}
  return true;
}

/** @param {Record<string,unknown>[]} data @param {number} producerId @param {number} start @param {number} end */
function covered(data,producerId,start,end,kind='pcm'){let next=start;for(const r of data.filter(r=>r.producerId===producerId&&r.kind===kind)){const a=Math.max(next,integer(r.start)),b=Math.min(end,integer(r.end));if(b<=a)continue;if(a!==next)return false;next=b;}return next===end;}

/** Fixed, evidence-only handoff; no actual producer-delay fault or waveform qualification.
 * @param {{context:import('playwright').BrowserContext,worker:import('playwright').Worker,extensionId:string,artifactPath:string}} input
 * @param {OwnerFiles} files @param {{dist:string}} candidate @param {unknown} caller
 */
export async function runProductSourceOwnerScenario(input,files,candidate,caller){
  const spec=ownerSpec(caller),history=isHistory(spec),stages=offStages(spec),controlled=suspendRebind(spec),pendingOffSelected=pendingOff(spec),directory=ownerDirectory(path.relative(files.root,input.artifactPath).split(path.sep).join('/'));
  /** @typedef {{calledAt:number,returnedAt:number|null,request:unknown}} HistoryRequest */
  /** @typedef {{stage:number,configure:HistoryRequest,settling:{milliseconds:number,start:number|null,end:number|null},capture:{file:string,bytes:number,sha256:string,calledAt:number,returnedAt:number,writeStatus:string}|null,start:number|null,end:number|null,after:unknown,assessment:ReturnType<typeof assessDryCapture>|null}} DryPhase */
  /** @type {{scenarioStartedAt:number,stage:string,before:unknown,priming:{request:unknown,inputIdentity?:ReturnType<typeof primeIdentity>,milliseconds:number,start:number|null,end:number|null,after:unknown},off:HistoryRequest|null,phases:DryPhase[],checkpoint?:unknown,wet?:DryPhase,extreme?:Record<string,unknown>}|null} */let dryPrefix=null;
  /** @type {{stage:number,start:number,end:number,bytes:Buffer}|null} */let historyPending=null;
  /** @type {unknown} */let preparedPlan=null;
  /** @type {Record<string,unknown>|null} */let lastExtremeFacts=null;
  const extreme=extremeHistory(spec),wet=wetHistory(spec),archive=createSourceOwnerArchive(files,directory,spec),deadline=Date.now()+90000,cursors=extreme?[0,0,0,0,0]:[0,0,0,0],pageErrors=/** @type {string[]} */([]),secondary=/** @type {string[]} */([]);
  let page=/** @type {import('playwright').Page|undefined} */(undefined),collecting=false,collector=/** @type {Promise<void>|undefined} */(undefined),pending=/** @type {Promise<void>|null} */(null),collectorError=/** @type {unknown} */(null),goal=/** @type {number|undefined} */(undefined),appendFailed=false;
  /** @template T @param {string} name @param {()=>Promise<T>} work @param {number} [timeout] */
  const op=async(name,work,timeout=5000)=>{const left=deadline-Date.now();if(left<=0)fail('scenario-timeout');const result=await audioOperation('owner-'+name,work,Math.min(left,timeout));if(Date.now()>=deadline)fail('scenario-timeout');return result;};
  /** @param {string} name @param {unknown} value */const save=(name,value)=>files.writeFile(directory+'/'+name,JSON.stringify(value)+'\n',{flag:'wx'});
  /** @param {Record<string,unknown>} action */const call=async action=>{if(!page)fail('page');return op('probe-'+String(action.kind),()=>/** @type {import('playwright').Page} */(page).evaluate(callSourceOwnerProbe,action));};
  const collect=()=>{
    if(pending)return pending;
    pending=(async()=>{const batch=rows(await call({kind:'drain',cursors:cursors.slice(),...(goal===undefined?{}:{endFrame:goal})}));for(const r of batch){try{await op('append',()=>archive.append(r));}catch(error){appendFailed=true;archive.seal();throw error;}cursors[integer(r.producerId)]=integer(r.lastReceived);}})().finally(()=>{pending=null;});return pending;
  };
  /** @param {number} ms */const pause=async ms=>{if(collectorError)throw collectorError;await op('pause',()=>/** @type {import('playwright').Page} */(page).waitForTimeout(ms),ms+5000);};
  /** @param {number} id */const target=async id=>{
    let sourceSeen=false;
    for(let n=0;n<200;n++){
      if(collectorError)throw collectorError;const f=object(await call({kind:'facts'}));sourceSeen||=f.sources===1;
      try{const w=id===1&&!sourceSeen&&initialSourcePending(f)?null:observationWindow(f,id,spec);if(w)return w;}
      catch(cause){if(cause&&typeof cause==='object')Object.assign(cause,{ownerObservation:{nodeId:id,sources:f.sources,error:f.error,contextState:f.contextState,hidden:f.hidden,readback:copy(f.readback),nodeCount:Array.isArray(f.nodes)?f.nodes.length:null,ledgerEntries:Array.isArray(f.ledger)?f.ledger.length:null}});throw cause;}
      await pause(10);
    }
    return fail('ack-unformed');
  };
  /** @param {{nodeId:number,start:number,end:number}} w */const complete=async w=>{for(let n=0;n<200;n++){if(collectorError)throw collectorError;await collect();const data=archive.proof({}).rows;if([0,1,w.nodeId+1].every(id=>covered(data,id,w.start,w.end))){const f=object(await call({kind:'facts'}));observationWindow(f,w.nodeId,spec);const plan=inputPlan(f,spec);stableOwner(f,w.nodeId,plan.urls[w.nodeId-1]);return {nodeId:w.nodeId,window:{start:w.start,end:w.end},connected:f.connected,currentSrc:f.currentSrc,sources:f.sources,contextState:f.contextState,paused:f.paused,hidden:f.hidden,readback:f.readback};}await pause(10);}return fail('window-unformed');};
  try{
    await files.ensureDirectory?.(directory);
    const html=String(await files.readFile('tests/fixtures/installed-extension/audio-live.html','utf8')).replace(/<script[^>]+src="https:\/\/chzzk.naver.com\/__knife_fixture__\/audio-site.js"[^>]*><\/script>/,'');
    await op('routes',()=>input.context.route(/^https?:\/\//,route=>route.request().url()==='https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'?route.fulfill({status:200,contentType:'text/html',body:html}):route.abort('blockedbyclient')));
    await op('seed',()=>input.worker.evaluate(()=>Reflect.get(globalThis,'chrome').storage.local.set({config:{audioDefault:false,audioGain:1,gainInherited:false,normalizerEnabled:false,eqEnabled:false,compressorEnabled:true}})));
    page=await op('page',()=>input.context.newPage());page.setDefaultTimeout(15000);page.on('pageerror',e=>pageErrors.push(e.message));
    await op('goto',()=>/** @type {import('playwright').Page} */(page).goto('https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',{waitUntil:'domcontentloaded'}),15000);await op('front',()=>/** @type {import('playwright').Page} */(page).bringToFront());
    await op('ready',()=>/** @type {import('playwright').Page} */(page).waitForFunction(()=>{const r=Reflect.get(window,Symbol.for('cheese-knife.runtime.v1'));return r?.ownerProtocol===3&&r.configReady&&r.mediaCurrent()&&r.audio&&document.querySelector('.knife-comp button');}),15000);
    await op('install',()=>/** @type {import('playwright').Page} */(page).evaluate(installSourceOwnerProbe,{sampleRate:spec.sampleRate,...(history?{profile:historyProfile(spec)}:stages?{profile:/** @type {const} */('off-stages')}:controlled?{profile:/** @type {const} */('suspend-rebind')}:pendingOffSelected?{profile:/** @type {const} */('pending-off')}:{})}));
    const plan=await call({kind:'prepare',spec});preparedPlan=plan;if(!history)await op('input-save',()=>save('input-plan.json',plan));
    if(history)dryPrefix={scenarioStartedAt:performance.now(),stage:'first-on',before:await call({kind:'facts'}),priming:{request:null,milliseconds:1250,start:null,end:null,after:null},off:null,phases:[]};
    collecting=true;collector=(async()=>{try{while(collecting){await collect();await new Promise(resolve=>setTimeout(resolve,100));}}catch(cause){collectorError=cause;collecting=false;}})();
    await op('first-on',()=>/** @type {import('playwright').Page} */(page).locator('.knife-comp button').click());
    let aState=null,bState=null;
    if(history){
      if(!dryPrefix)fail('dry-profile-state');dryPrefix.stage='priming';
      dryPrefix.priming.request=await call({kind:'history-configure',enabled:true});dryPrefix.priming.start=performance.now();await pause(1250);dryPrefix.priming.end=performance.now();dryPrefix.priming.after=await call({kind:'facts'});historyOwner(object(dryPrefix.priming.after),historyPlan(object(dryPrefix.priming.after).inputPlan,spec,0).urls[0],true,spec);const primeFrame=integer(object(dryPrefix.priming.request).frame),primeStart=primeFrame+spec.sampleRate*23/20,primeEnd=primeFrame+spec.sampleRate*5/4;let primeCovered=false;for(let n=0;n<200;n++){if(collectorError)throw collectorError;await collect();if(covered(archive.proof({}).rows,1,primeStart,primeEnd)){primeCovered=true;break;}await pause(10);}if(!primeCovered)fail('dry-prime-unformed');dryPrefix.priming.inputIdentity=primeIdentity(archive.window(primeStart,primeEnd,1));
      dryPrefix.stage='off';dryPrefix.off={calledAt:performance.now(),request:null,returnedAt:null};dryPrefix.off.request=await call({kind:'history-configure',enabled:false});dryPrefix.off.returnedAt=performance.now();
      for(const stage of [1,2]){
        dryPrefix.stage='load-'+stage;preparedPlan=await call({kind:'history-next',stage});
        /** @type {DryPhase} */const phase={stage,configure:{calledAt:performance.now(),request:null,returnedAt:null},settling:{milliseconds:1250,start:null,end:null},capture:null,start:null,end:null,after:null,assessment:null};dryPrefix.phases.push(phase);
        dryPrefix.stage='configure-'+stage;phase.configure.request=await call({kind:'history-configure',enabled:false});phase.configure.returnedAt=performance.now();phase.settling.start=performance.now();await pause(1250);phase.settling.end=performance.now();
        dryPrefix.stage='capture-'+stage;const calledAt=performance.now(),raw=await call({kind:'history-capture'}),returnedAt=performance.now(),capture=validateProcessingCapture(raw);if(capture.rate!==spec.sampleRate||capture.end-capture.start!==spec.sampleRate)fail('dry-capture');
        const bytes=historyCaptureBytes(capture);historyPending={stage,start:capture.start,end:capture.end,bytes};phase.start=capture.start;phase.end=capture.end;const captureRecord={file:directory+'/dry-prefix-'+stage+'.f32le',bytes:bytes.length,sha256:sha(bytes),calledAt,returnedAt,writeStatus:'owned; not dispatched'};phase.capture=captureRecord;
        phase.after=await call({kind:'facts'});historyOwner(object(phase.after),historyPlan(object(phase.after).inputPlan,spec,stage).urls[stage],false,spec);captureRecord.writeStatus='dispatched; completion unknown';await op('dry-capture-save',()=>files.writeFile(captureRecord.file,bytes,{flag:'wx'}));phase.capture.writeStatus='completed';historyPending=null;
        let formed=false;for(let n=0;n<200;n++){if(collectorError)throw collectorError;await collect();const data=archive.proof({}).rows;if([0,1].every(id=>covered(data,id,capture.start,capture.end))&&covered(data,2,capture.start,capture.end,'empty')){formed=true;break;}await pause(10);}if(!formed)fail('dry-window-unformed');
        phase.assessment=assessDryCapture(archive.window(capture.start,capture.end,0),archive.window(capture.start,capture.end,1),stage);if(!phase.assessment.inputValid)fail('dry-source');if(!phase.assessment.passed)fail('dry-rms');if(stage===2&&!wet)goal=capture.end;
      }
      dryPrefix.stage='complete';
      if(wet){
        const cut=object(await call({kind:'facts'}));dryPrefix.checkpoint=archive.proof({...cut,spec,dryPrefix:copy(dryPrefix)});
        const checkpoint=object(dryPrefix.checkpoint),prefixPcm=new Map();for(const row of rows(checkpoint.rows).filter(r=>r.kind==='pcm'))prefixPcm.set(String(row.file),Buffer.from(await op('prefix-read',()=>files.readFile(String(row.file)))));assessDryPrefixProof(checkpoint,spec,prefixPcm);
        const phase={stage:3,configure:{calledAt:performance.now(),request:/** @type {unknown} */(null),returnedAt:/** @type {number|null} */(null)},settling:{milliseconds:1250,start:/** @type {number|null} */(null),end:/** @type {number|null} */(null)},capture:/** @type {DryPhase['capture']} */(null),start:/** @type {number|null} */(null),end:/** @type {number|null} */(null),after:/** @type {unknown} */(null),assessment:/** @type {DryPhase['assessment']} */(null)};dryPrefix.wet=phase;dryPrefix.stage='wet-configure';
        phase.configure.request=await call({kind:'history-wet'});phase.configure.returnedAt=performance.now();phase.settling.start=performance.now();await pause(1250);phase.settling.end=performance.now();
        dryPrefix.stage='wet-capture';const calledAt=performance.now(),raw=await call({kind:'history-capture'}),returnedAt=performance.now(),capture=validateProcessingCapture(raw);if(capture.rate!==spec.sampleRate||capture.end-capture.start!==spec.sampleRate)fail('wet-capture');
        const bytes=historyCaptureBytes(capture);historyPending={stage:3,start:capture.start,end:capture.end,bytes};phase.start=capture.start;phase.end=capture.end;phase.capture={file:directory+'/dry-prefix-3.f32le',bytes:bytes.length,sha256:sha(bytes),calledAt,returnedAt,writeStatus:'owned; not dispatched'};
        phase.after=await call({kind:'facts'});wetOwner(object(phase.after),spec,checkpoint);phase.capture.writeStatus='dispatched; completion unknown';const file=phase.capture.file;await op('wet-capture-save',()=>files.writeFile(file,bytes,{flag:'wx'}));phase.capture.writeStatus='completed';historyPending=null;
        let formed=false;for(let n=0;n<200;n++){if(collectorError)throw collectorError;await collect();const data=archive.proof({}).rows;if([0,1,3].every(id=>covered(data,id,capture.start,capture.end))&&covered(data,2,capture.start,capture.end,'empty')){formed=true;break;}await pause(10);}if(!formed)fail('wet-window-unformed');
        const data=archive.proof({}).rows,pcm=new Map();for(const row of data.filter(r=>r.kind==='pcm'))pcm.set(String(row.file),Buffer.from(await op('wet-control-read',()=>files.readFile(String(row.file)))));wetControl(data,pcm,capture.start,capture.end);
        phase.assessment=assessWetCapture(archive.window(capture.start,capture.end,0),archive.window(capture.start,capture.end,1));if(!phase.assessment.inputValid)fail('wet-source');if(!phase.assessment.passed)fail('wet-ceiling');if(!extreme)goal=capture.end;dryPrefix.stage='complete';
      }
      if(extreme){
        const cut=object(await call({kind:'facts'})),checkpoint=archive.proof({...cut,spec,dryPrefix:copy(dryPrefix)}),pcm=new Map();for(const row of rows(checkpoint.rows).filter(r=>r.kind==='pcm'))pcm.set(String(row.file),Buffer.from(await op('wet-prefix-read',()=>files.readFile(String(row.file)))));assessWetPrefixProof(checkpoint,spec,pcm);
        const phase={stage:4,checkpoint,load:{calledAt:performance.now(),returnedAt:/** @type {number|null} */(null),plan:/** @type {unknown} */(null)},configure:{calledAt:/** @type {number|null} */(null),returnedAt:/** @type {number|null} */(null),request:/** @type {unknown} */(null)},settling:{milliseconds:9500,start:/** @type {number|null} */(null),end:/** @type {number|null} */(null)},capture:/** @type {DryPhase['capture']} */(null),start:/** @type {number|null} */(null),end:/** @type {number|null} */(null),query:{calledAt:/** @type {number|null} */(null),returnedAt:/** @type {number|null} */(null),frame:/** @type {number|null} */(null),facts:/** @type {unknown} */(null)},observedEnd:/** @type {number|null} */(null),assessment:/** @type {unknown} */(null)};dryPrefix.extreme=phase;dryPrefix.stage='extreme-load';
        phase.load.plan=await call({kind:'history-extreme-load'});preparedPlan=phase.load.plan;phase.load.returnedAt=performance.now();dryPrefix.stage='extreme-configure';phase.configure.calledAt=performance.now();phase.configure.request=await call({kind:'history-extreme-configure'});phase.configure.returnedAt=performance.now();phase.settling.start=performance.now();await pause(9500);phase.settling.end=performance.now();
        dryPrefix.stage='extreme-capture';const calledAt=performance.now(),raw=await call({kind:'history-capture'}),returnedAt=performance.now(),capture=validateProcessingCapture(raw);if(capture.rate!==spec.sampleRate||capture.end-capture.start!==spec.sampleRate)fail('extreme-capture');const bytes=historyCaptureBytes(capture);historyPending={stage:4,start:capture.start,end:capture.end,bytes};phase.start=capture.start;phase.end=capture.end;phase.capture={file:directory+'/dry-prefix-4.f32le',bytes:bytes.length,sha256:sha(bytes),calledAt,returnedAt,writeStatus:'owned; not dispatched'};
        phase.query.calledAt=performance.now();phase.query.facts=await call({kind:'facts'});lastExtremeFacts=copy(object(phase.query.facts));phase.query.returnedAt=performance.now();phase.query.frame=Math.round(Number(object(phase.query.facts).audioTime)*spec.sampleRate);extremeOwner(object(phase.query.facts),spec,checkpoint);
        phase.capture.writeStatus='dispatched; completion unknown';const file=phase.capture.file;await op('extreme-capture-save',()=>files.writeFile(file,bytes,{flag:'wx'}));phase.capture.writeStatus='completed';historyPending=null;
        let observed=false;for(let n=0;n<200;n++){if(collectorError)throw collectorError;const f=object(await call({kind:'facts'}));lastExtremeFacts=copy(f);const owner=extremeOwner(f,spec,checkpoint),headroom=extremeHeadroom(owner,spec.sampleRate,phase.query.frame);if(headroom){if(!headroom.assessment.passed){phase.assessment={headroom:headroom.assessment};fail('extreme-headroom-'+headroom.assessment.status);}phase.observedEnd=Math.max(phase.query.frame+1,integer(headroom.receipt.frame)+128);goal=phase.observedEnd;observed=true;break;}await pause(10);}if(!observed)fail('extreme-headroom-unformed');
        let formed=false;for(let n=0;n<200;n++){if(collectorError)throw collectorError;await collect();const data=archive.proof({}).rows;if([0,1,4].every(id=>covered(data,id,capture.start,integer(phase.observedEnd)))&&[2,3].every(id=>covered(data,id,capture.start,integer(phase.observedEnd),'empty'))){formed=true;break;}await pause(10);}if(!formed)fail('extreme-window-unformed');dryPrefix.stage='complete';
      }
    }else{
      const a=await target(1);aState=await complete(a);await call({kind:'switch',aEnd:a.end});
      const b=await target(2);goal=b.end;bState=await complete(b);
    }
    collecting=false;await collector;if(collectorError)throw collectorError;
    for(;;){const before=cursors.join(',');await collect();if(cursors.join(',')===before)break;}
    const snapshot=object(await call({kind:'stop'})),facts={...snapshot,spec,...(history?{dryPrefix}:{stable:{a:aState,b:bState}})};
    let proof=archive.proof(facts);
    /** @type {unknown} */let assessment=history?null:assessSourceOwnerProof(proof,spec);if(history){const pcm=new Map();for(const r of proof.rows.filter(r=>r.kind==='pcm'))pcm.set(String(r.file),Buffer.from(await op('dry-proof-read',()=>files.readFile(String(r.file)))));assessment=extreme?assessExtremePrefixProof(proof,spec,pcm,false):wet?assessWetPrefixProof(proof,spec,pcm):assessDryPrefixProof(proof,spec,pcm);if(extreme){if(!dryPrefix?.extreme)fail('extreme-state');dryPrefix.extreme.assessment=object(assessment).extreme;proof=archive.proof(facts);if(object(object(assessment).extreme).passed!==true)fail(String(/** @type {unknown[]} */(object(object(assessment).extreme).failures)[0]));}await op('plan-save',()=>save('input-plan.json',snapshot.inputPlan));}await op('proof-save',()=>save('source-owner-proof.json',proof));
    const url='chrome-extension://'+input.extensionId+'/web/audio-transition-worklet.js',expected=await files.readFile(path.relative(files.root,path.join(candidate.dist,'web/audio-transition-worklet.js')).split(path.sep).join('/'));
    const fetched=Uint8Array.from(await op('module-fetch',()=>input.worker.evaluate(async url=>{const r=await fetch(url);if(!r.ok)throw Error('audio-source-owner-module-fetch');return Array.from(new Uint8Array(await r.arrayBuffer()));},url)));
    await op('module-save',()=>files.writeFile(directory+'/module-resource.fetched.js',fetched,{flag:'wx'}));
    const module={url,expectedSha256:sha(expected),fetchedSha256:sha(fetched),loaded:Array.isArray(snapshot.moduleLoads)&&snapshot.moduleLoads.includes(url)};
    if(!module.loaded||module.expectedSha256!==module.fetchedSha256||pageErrors.length)fail('module-or-page');
    const artifacts=proof.rows.filter(r=>r.kind==='pcm').map(r=>({file:r.file,bytes:r.bytes,sha256:r.sha256,producerId:r.producerId}));
    const report={schema:history?historyObservationSchema(spec):ownerObservationSchema(spec),scope:spec.id,spec,passed:true,outcome:extreme?'HISTORY_OBSERVED':history?'PREFIX_PASS':'OWNERSHIP_OBSERVED',qualityAssessed:history&&!extreme,...(history?{dryPrefix:assessment,extraEvidenceBytes:spec.sampleRate*(extreme?32:wet?24:16)}:{ownership:assessment}),archive:{sampleRate:spec.sampleRate,bytes:proof.pcmBytes,segments:artifacts.length,artifacts},module,pageErrors};
    await op('assessment-save',()=>save('assessment.json',report));return {audioProduct:report,pageErrors};
  }catch(cause){
    collecting=false;if(collector)try{await collector;}catch(error){secondary.push(String(error));}
    const failureDeadline=Date.now()+5000;
    /** @template T @param {string} name @param {()=>Promise<T>} work */
    const diagnostic=async(name,work)=>{const left=failureDeadline-Date.now();if(left<=0)fail('failure-deadline');return audioOperation('owner-failure-'+name,work,Math.min(left,5000));};
    /** @type {Record<string,unknown>|null} */let pendingRecovery=null;
    if(historyPending){
      const raw=historyPending.bytes,file=directory+'/dry-prefix-pending.f32le';pendingRecovery={stage:historyPending.stage,start:historyPending.start,end:historyPending.end,file,bytes:raw.length,sha256:sha(raw),encoding:'interleaved-float32le',writeStatus:'dispatched; disk preservation unconfirmed'};
      try{await diagnostic('capture-recovery',()=>files.writeFile(file,raw,{flag:'wx'}));pendingRecovery.writeStatus='completed';}catch(error){secondary.push(String(error));pendingRecovery.error=String(error);}
    }
    let snapshot=lastExtremeFacts;
    if(page)try{snapshot=object(await diagnostic('stop',()=>/** @type {import('playwright').Page} */(page).evaluate(callSourceOwnerProbe,{kind:'stop'})));}catch(error){secondary.push(String(error));}
    try{archive.recordFailure(snapshot?.firstFailure);}catch(error){secondary.push(String(error));}
    if(snapshot&&!appendFailed)try{
      for(;;){const batch=rows(await diagnostic('drain',()=>/** @type {import('playwright').Page} */(page).evaluate(callSourceOwnerProbe,{kind:'drain',cursors:cursors.slice(),failure:true})));if(!batch.length)break;
        for(const r of batch){await diagnostic('append',()=>archive.append(r));cursors[integer(r.producerId)]=integer(r.lastReceived);}
      }
    }catch(error){secondary.push(String(error));}
    archive.seal();let proof;
    try{proof=archive.proof(snapshot);}catch(error){secondary.push(String(error));proof=archive.proof(null);}
    const partial={...(history?{dryPrefix,preparedPlan,pendingCapture:pendingRecovery}:{}),spec,error:String(cause),observation:cause&&typeof cause==='object'?Reflect.get(cause,'ownerObservation')??null:null,secondary,archive:archive.summary(),proof,pageErrors};
    try{await audioOperation('owner-partial-save',()=>save('partial.json',partial),5000);}catch(error){secondary.push(String(error));}
    const original=cause instanceof Error?cause:Error(String(cause)),error=history&&secondary.length?new Error(original.message,{cause:original}):original;if(secondary.length)Object.assign(error,{evidenceError:secondary.join('; ').slice(0,4096)});throw error;
  }
}

/** @param {OwnerFiles} files @param {string} directory @param {unknown} reportValue @param {OwnerSpec} spec */
export async function verifySourceOwnerEvidence(files,directory,reportValue,spec){
  if(isHistory(spec)){
    const extreme=extremeHistory(spec),wet=wetHistory(spec);
    const report=object(reportValue);if(report.schema!==historyObservationSchema(spec)||report.scope!==spec.id||!isDeepStrictEqual(report.spec,spec)||report.passed!==true||report.qualityAssessed!==!extreme||report.outcome!==(extreme?'HISTORY_OBSERVED':'PREFIX_PASS')||report.extraEvidenceBytes!==spec.sampleRate*(extreme?32:wet?24:16)||!isDeepStrictEqual(report.pageErrors,[]))fail('dry-report');
    const stat=await files.lstat(directory+'/source-owner-proof.json');if(!stat?.isFile()||stat.size>PROOF_CAP)fail('proof-cap');
    const proof=object(JSON.parse(String(await files.readFile(directory+'/source-owner-proof.json','utf8')))),data=rows(proof.rows),pcm=new Map();
    if(data.filter(r=>r.kind==='pcm').length>historyArtifactCap(spec))fail('artifact-cap');
    let bytesRead=0;for(const [i,r]of data.entries())if(r.kind==='pcm'){
      const x=span(r,spec.sampleRate,extreme?4:3),file=directory+'/segment-'+String(i).padStart(6,'0')+'-p'+x.id+'.f32le',expected=(x.end-x.start)*x.channels*4;if(r.file!==file||r.bytes!==expected||(bytesRead+=expected)>PCM_CAP-historyReserve(spec)-FAILURE_RESERVE)fail('dry-artifact');
      const st=await files.lstat(file);if(!st?.isFile()||st.size!==expected)fail('artifact-size');const b=Buffer.from(await files.readFile(file));if(b.length!==expected||sha(b)!==r.sha256)fail('artifact-hash');for(let n=0;n<b.length;n+=4)if(!Number.isFinite(b.readFloatLE(n)))fail('pcm-nonfinite');pcm.set(file,b);
    }
    const assessment=extreme?assessExtremePrefixProof(proof,spec,pcm):wet?assessWetPrefixProof(proof,spec,pcm):assessDryPrefixProof(proof,spec,pcm);if(extreme&&object(object(assessment).extreme).passed!==true)fail('extreme-numeric');if(!isDeepStrictEqual(report.dryPrefix,assessment))fail('dry-assessment');
    const planFile=await files.lstat(directory+'/input-plan.json');if(!planFile?.isFile()||planFile.size>PROOF_CAP||!isDeepStrictEqual(JSON.parse(String(await files.readFile(directory+'/input-plan.json','utf8'))),object(proof.facts).inputPlan))fail('dry-plan');
    for(const [i,phase]of [...rows(object(object(proof.facts).dryPrefix).phases),...(wet?[object(object(object(proof.facts).dryPrefix).wet)]:[]),...(extreme?[object(object(object(proof.facts).dryPrefix).extreme)]:[])].entries()){
      const c=object(phase.capture),file=directory+'/dry-prefix-'+(i+1)+'.f32le',size=await files.lstat(file);if(c.file!==file||!size?.isFile()||size.size!==spec.sampleRate*8)fail('dry-capture-file');const b=Buffer.from(await files.readFile(file));if(b.length!==spec.sampleRate*8||sha(b)!==c.sha256)fail('dry-capture-file');
    }
    const artifacts=data.filter(r=>r.kind==='pcm').map(r=>({file:r.file,bytes:r.bytes,sha256:r.sha256,producerId:r.producerId}));if(!isDeepStrictEqual(report.archive,{sampleRate:spec.sampleRate,bytes:proof.pcmBytes,segments:artifacts.length,artifacts}))fail('archive-report');
    const module=object(report.module),fetched=await files.readFile(directory+'/module-resource.fetched.js'),expected=await files.readFile('extension/web/audio-transition-worklet.js');if(module.loaded!==true||module.expectedSha256!==sha(expected)||module.fetchedSha256!==sha(fetched)||sha(fetched)!==sha(expected)||!Array.isArray(object(proof.facts).moduleLoads)||!/** @type {unknown[]} */(object(proof.facts).moduleLoads).includes(module.url))fail('module');return;
  }
  const report=object(reportValue);if(report.schema!==ownerObservationSchema(spec)||report.passed!==true||report.outcome!=='OWNERSHIP_OBSERVED'||report.qualityAssessed!==false||report.scope!==spec.id||!isDeepStrictEqual(report.spec,spec)||!isDeepStrictEqual(report.pageErrors,[]))fail('assessment');
  const {proof,assessment}=await readSourceOwnerProof(files,directory,spec);if(!isDeepStrictEqual(report.ownership,assessment))fail('assessment');
  const artifacts=rows(proof.rows).filter(r=>r.kind==='pcm').map(r=>({file:r.file,bytes:r.bytes,sha256:r.sha256,producerId:r.producerId}));
  if(!isDeepStrictEqual(report.archive,{sampleRate:spec.sampleRate,bytes:proof.pcmBytes,segments:artifacts.length,artifacts}))fail('archive-report');
  const module=object(report.module),fetched=await files.readFile(directory+'/module-resource.fetched.js'),expected=await files.readFile('extension/web/audio-transition-worklet.js');
  if(module.loaded!==true||module.expectedSha256!==sha(expected)||module.fetchedSha256!==sha(fetched)||sha(fetched)!==sha(expected)||!Array.isArray(object(proof.facts).moduleLoads)||!/** @type {unknown[]} */(object(proof.facts).moduleLoads).includes(module.url))fail('module');
}
