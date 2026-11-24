import {assertLiveAudioSource} from '../audio-verification-contract.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isGain4JobCase} from './visibility-browser.mjs';
import {installProcessingProbe,callProcessingProbe} from '../audio-processing-probe.mjs';
import {audioOperation} from '../audio-native-browser.mjs';
import {summarizeCapture} from '../audio-signal.mjs';
import {evaluateProcessingTransition,validateProcessingCapture,complementaryAudioRamps} from '../audio-processing-metrics.mjs';
import {isDeepStrictEqual} from 'node:util';
import {EQUALIZER_CASE,selectEqualizerCase,isColdEqualizerCase,selectEqualizerTarget,assertEqualizerTarget,assertEqualizerBaseline,assertEqualizerRequest,assertEqualizerReadback,assessPackagedEqualizer,equalizerSignalFailures} from './audio-equalizer.mjs';
import {PACKAGED_REENTRY_CASE,PACKAGED_REENTRY_CASES,assessPackagedReentry} from './audio-reentry.mjs';
import {SOURCE_OWNER_CASES,SOURCE_PENDING_OFF_CASES,SOURCE_SUSPEND_REBIND_CASES,SOURCE_OFF_STAGE_CASES,SOURCE_HISTORY_CASES,SOURCE_WET_HISTORY_CASES,SOURCE_EXTREME_HISTORY_CASES} from './audio-source-owner.mjs';
import {NORMALIZER_CONTROL_CASES,normalizerControlSourceSpec,isNormalizerSignalControl,assertNormalizerControlLive,assessPackagedNormalizerControl} from './audio-normalizer-control.mjs';
import {WARMUP_CASE,writeWarmupExport} from './audio-warmup-diagnostic.mjs';
import {PACKAGED_NORMALIZER_CASE,PACKAGED_NORMALIZER_CASES,selectNormalizerCase,normalizerSignalFailures,selectNormalizerTarget,assessPackagedNormalizer,assessExtremeNormalizer,fftBufferPairBytes,assessFftBufferWitness} from '../audio-l1-normalizer-oracle.mjs';

const cap=96*1024*1024,scenarioTimeoutMs=90000;
const fail=code=>new Error('audio-product-'+code);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const frame=value=>Number.isSafeInteger(value)&&value>=0;

// Unapplied opt-in: this ledger covers the selected flat writer closure, not Native trace/profile files.
const masterMetadataLimit=1048576,masterFileLimit=4096;
const masterTerminals=(artifact,output)=>['assessment.json','product-partial.json','partial.json','summary.json'].map(n=>artifact+'/'+n).concat(output+'/summary.json');
const masterNativeFiles=artifact=>new Set([artifact+'/trace.zip',artifact+'/failure.png']);
function masterSelectedPath(file,artifact,output){
  if(typeof file!=='string'||file.includes('\\')||file.split('/').some(p=>p==='.'||p==='..')||file.startsWith('/')||file.includes('\0'))throw fail('master-cost-path');
  const lower=file.toLowerCase(),roots=[artifact,output];
  for(const root of roots)if(lower.startsWith(root.toLowerCase()+'/')){
    if(!file.startsWith(root+'/'))throw fail('master-cost-alias');
    const child=file.slice(root.length+1);
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(child)||child.endsWith('.'))throw fail('master-cost-child');
    return true;
  }
  return false;
}
export function createMasterEvidenceFiles(original,{artifact,output}){
  const terminals=masterTerminals(artifact,output),remaining=new Set(terminals),nativeFiles=masterNativeFiles(artifact),self=output+'/summary.json';
  const rows=[],keys=new Set();let reserved=terminals.length*masterMetadataLimit,charged=0,phase='OPEN',firstReason=null,checkRead=()=>{},readBytes=0,failureAttempted=false,manifest=null;
  const reject=reason=>{firstReason??=reason;throw fail('master-storage-'+reason);};
  const dispatch=async(file,data,options,failure=false)=>{
    let selected;try{selected=masterSelectedPath(file,artifact,output);}catch(error){firstReason??='path';throw error;}
    if(!selected)return original.writeFile(file,data,options);
    if(nativeFiles.has(file))reject('native-owned-path');
    if(!failure&&(phase!=='OPEN'&&!(phase==='FINAL_ONLY'&&file===self)))reject('sealed');
    if(failure&&(file!==artifact+'/partial.json'||phase!=='CLOSED'))reject('failure-path');
    const key=file.toLowerCase();if(keys.has(key))reject('duplicate-path');
    if(typeof data!=='string'&&!Buffer.isBuffer(data)&&!(data instanceof Uint8Array))reject('encoding');
    if(typeof data==='string'&&(typeof options==='string'&&options!=='utf8'||options?.encoding&&options.encoding!=='utf8'))reject('encoding');
    const size=typeof data==='string'?Buffer.byteLength(data,'utf8'):data.byteLength,release=remaining.has(file)?masterMetadataLimit:0;
    if(!Number.isSafeInteger(size)||size<0||file.endsWith('.json')&&size>masterMetadataLimit)reject('metadata');
    if(rows.length>=masterFileLimit||charged+size+reserved-release>cap)reject('cap');
    if(file===self)phase='SEALED'; // Close admission synchronously, before the Native write can yield.
    const bytes=typeof data==='string'?Buffer.from(data,'utf8'):data;
    const row={order:rows.length+1,file,bytes:size,sha256:sha(bytes),status:'DISPATCHED'};
    rows.push(row);keys.add(key);remaining.delete(file);reserved-=release;charged+=size;
    try{const result=await original.writeFile(file,data,options);row.status='FULFILLED';return result;}
    catch(error){row.status='REJECTED';firstReason??='write-failed';throw error;}
  };
  const readSelected=async(file,options)=>{
    if(!masterSelectedPath(file,artifact,output))return original.readFile(file,options);
    checkRead();if(nativeFiles.has(file))throw fail('master-native-read-outside-scope');
    const stat=await original.lstat(file);checkRead();
    if(!stat?.isFile()||!Number.isSafeInteger(stat.size)||stat.size<0||file.endsWith('.json')&&stat.size>masterMetadataLimit||readBytes+stat.size>cap)throw fail('master-read-cap');
    const parts=[];let size=0;
    for await(const chunk of original.readChunks(file)){checkRead();if(!(Buffer.isBuffer(chunk)||chunk instanceof Uint8Array)||!Number.isSafeInteger(chunk.byteLength)||chunk.byteLength<1||chunk.byteLength>masterMetadataLimit)throw fail('master-read-chunk');size+=chunk.byteLength;readBytes+=chunk.byteLength;if(size>stat.size||readBytes>cap)throw fail('master-read-size');parts.push(chunk);}
    checkRead();if(size!==stat.size)throw fail('master-read-size');
    const bytes=Buffer.concat(parts,size),encoding=typeof options==='string'?options:options?.encoding;
    if(encoding!==undefined&&encoding!=='utf8')throw fail('master-read-encoding');return encoding?bytes.toString('utf8'):bytes;
  };
  const budget={
    beginRead(check){checkRead=check;readBytes=0;checkRead();},
    beforeFinal(){
      if(phase!=='OPEN'||rows.some(r=>r.status==='DISPATCHED')||rows.length+1>masterFileLimit||!remaining.has(self))reject('snapshot-state');
      phase='FINAL_ONLY';
      manifest={schema:'f01-master-cost-v1',state:'PENDING_INDEPENDENT_READBACK',artifact,output,self,limit:cap,metadataLimit:masterMetadataLimit,fileLimit:masterFileLimit,
        chargedBefore:charged,reservedBefore:reserved,firstReason,rows:rows.map(r=>({...r}))};
      return structuredClone(manifest);
    },
    close(){phase='CLOSED';},
    assertFinal(){
      if(phase!=='CLOSED'||!manifest||firstReason!==null||rows.length!==manifest.rows.length+1||rows.some(r=>r.status!=='FULFILLED')||rows.at(-1)?.file!==self)throw fail('master-live-cost-unclosed');
      if(!isDeepStrictEqual(rows.slice(0,-1),manifest.rows)||charged!==manifest.chargedBefore+rows.at(-1).bytes||reserved!==manifest.reservedBefore-masterMetadataLimit)throw fail('master-live-cost-drift');
    },
    readbackExpectation(){this.assertFinal();return {manifest:structuredClone(manifest),self:{...rows.at(-1)}};},
    snapshot:()=>({phase,reserved,charged,readBytes,writes:rows.length,firstReason}),
    async failureOnly(value){
      if(failureAttempted)reject('failure-repeated');failureAttempted=true;firstReason??='readback-failed';phase='CLOSED';
      return dispatch(artifact+'/partial.json',JSON.stringify(value,null,2)+'\n',{flag:'wx'},true);
    },
  };
  return {files:{...original,writeFile:(file,data,options)=>dispatch(file,data,options),readFile:readSelected},budget};
}

/** Reconstruct the writer envelope against its private dispatch receipt; no self-hash cycle is persisted. */
export async function verifyMasterStoredCost(files,{artifact,output,report,expected,check}){
  const self=output+'/summary.json',nativeFiles=masterNativeFiles(artifact),terminals=new Set(masterTerminals(artifact,output));
  let total=0;const seen=new Set(),seenKeys=new Set();
  const read=async(file,expected=null,json=false)=>{
    check();const stat=await files.lstat(file);check();
    if(!stat?.isFile()||!Number.isSafeInteger(stat.size)||stat.size<0||json&&stat.size>masterMetadataLimit||expected&&stat.size!==expected.bytes||total+stat.size>cap)throw fail('master-cost-file-size');
    let size=0;const hash=createHash('sha256'),chunks=[];
    for await(const chunk of files.readChunks(file)){check();if(!(Buffer.isBuffer(chunk)||chunk instanceof Uint8Array)||!Number.isSafeInteger(chunk.byteLength)||chunk.byteLength<1||chunk.byteLength>masterMetadataLimit)throw fail('master-cost-chunk');size+=chunk.byteLength;total+=chunk.byteLength;if(size>stat.size||total>cap)throw fail('master-cost-read-cap');hash.update(chunk);if(json)chunks.push(chunk);}
    check();if(size!==stat.size||expected&&hash.digest('hex')!==expected.sha256)throw fail('master-cost-file-hash');
    return json?{bytes:size,value:JSON.parse(Buffer.concat(chunks,size).toString('utf8'))}:{bytes:size};
  };
  if(expected?.self?.file!==self||expected.self.status!=='FULFILLED'||!Number.isSafeInteger(expected.self.bytes)||expected.self.bytes<0||!/^[a-f0-9]{64}$/.test(expected.self.sha256??''))throw fail('master-cost-receipt');
  const saved=await read(self,expected.self,true),summary=saved.value,envelope=summary.masterCost;
  if(!isDeepStrictEqual(envelope,expected.manifest))throw fail('master-cost-dispatch-binding');
  if(summary.schema!=='f01-product-observation-run-v1'||summary.ok!==true||summary.error!==null||!isDeepStrictEqual(summary.secondaryErrors,[])||summary.masterWitnessRequested!==true||report?.masterWitnessRequested!==true||report.masterComplementary?.status!=='CALL_MODEL_MATCH'||summary.artifact!==artifact||!isDeepStrictEqual(summary.result?.audioProduct,report)||
     envelope?.schema!=='f01-master-cost-v1'||envelope.state!=='PENDING_INDEPENDENT_READBACK'||envelope.artifact!==artifact||envelope.output!==output||envelope.self!==self||envelope.limit!==cap||
     envelope.metadataLimit!==masterMetadataLimit||envelope.fileLimit!==masterFileLimit||envelope.firstReason!==null||!Array.isArray(envelope.rows)||envelope.rows.length+1>masterFileLimit)throw fail('master-cost-envelope');
  const claimed=new Map();let charged=0;
  for(let i=0;i<envelope.rows.length;i++){
    const row=envelope.rows[i];
    if(!row||Object.keys(row).sort().join(',')!=='bytes,file,order,sha256,status'||row.order!==i+1||!masterSelectedPath(row.file,artifact,output)||row.file===self||nativeFiles.has(row.file)||
       row.status!=='FULFILLED'||!Number.isSafeInteger(row.bytes)||row.bytes<0||row.file.endsWith('.json')&&row.bytes>masterMetadataLimit||!/^[a-f0-9]{64}$/.test(row.sha256??'')||claimed.has(row.file.toLowerCase()))throw fail('master-cost-row');
    charged+=row.bytes;if(!Number.isSafeInteger(charged)||charged>cap)throw fail('master-cost-aggregate');
    claimed.set(row.file.toLowerCase(),row);terminals.delete(row.file);
  }
  const expectedReserve=terminals.size*masterMetadataLimit;
  if(envelope.chargedBefore!==charged||envelope.reservedBefore!==expectedReserve||!terminals.has(self)||charged+saved.bytes+expectedReserve-masterMetadataLimit>cap)throw fail('master-cost-reserve');
  let entries=0;
  for(const directory of [artifact,output]){
    for await(const entry of files.directoryEntries(directory)){
      check();if(++entries>masterFileLimit+2)throw fail('master-cost-entry-cap');
      const file=directory+'/'+entry.name;
      if(!masterSelectedPath(file,artifact,output))throw fail('master-cost-entry');
      const key=file.toLowerCase();if(seenKeys.has(key))throw fail('master-cost-alias');seenKeys.add(key);
      const stat=await files.lstat(file);check();if(!stat?.isFile())throw fail('master-cost-child-type');
      if(nativeFiles.has(file))continue;
      if(file===self){seen.add(key);continue;}
      const row=claimed.get(key);if(!row||row.file!==file)throw fail('master-cost-unlisted-file');
      await read(file,row,false);seen.add(key);
    }
  }
  check();if(seen.size!==claimed.size+1||!seen.has(self.toLowerCase())||total!==charged+saved.bytes)throw fail('master-cost-closure');
  return {schema:'f01-master-cost-reassessment-v1',status:'VERIFIED',files:seen.size,bytes:total,reservedUnused:expectedReserve-masterMetadataLimit,selfBytes:saved.bytes,scope:'flat selected writer closure; Native trace/profile excluded'};
}
const masterEdges=[
  ['S0','D0',0,0],['D0','G0',0,0],['G0','G3',0,0],['G3','PROGRAM',0,0],
  ['L1','C0',0,0],['L1','D1',0,0],['C0','G5',0,0],['D1','G4',0,0],
  ['G5','G6',0,0],['G4','G6',0,0],['G6','G7',0,0],['G7','G2',0,0],
  ['G2','H0',0,0],['H0','G1',0,0],['G1','PROGRAM',0,0],
  ['L1','T5',1,0],['T5','P0',0,0],['T5','P1',1,0],['L1','CONTROL',1,0],
];
const masterStageNames=['cold','eq-on','eq-off','compressor-on','compressor-off','normalizer-on','normalizer-off','mixed','master-off','master-on'];

/** One conditional call-model witness; no production transition/oracle helper is imported. */
export function assessMasterComplementary(archive,report,{check=()=>{}}={}){
  const summary=archive.summary(),rate=summary.sampleRate,w=report?.facts?.masterWitness,o=report?.facts?.productObservation;
  const failures=[],hold=reason=>{if(!failures.includes(reason))failures.push(reason);};
  const result=(rows=[],samples=0)=>({schema:'f01-master-complementary-v1',status:failures.length?'HOLD':'CALL_MODEL_MATCH',
    scope:'selected native binding and reported-coordinate call model only',failures,rows,samples,
    representation:'exact-f32-values-zero-sign-agnostic',originalTolerance:1e-6,physicalOrigin:'UNPROVEN'});
  check();
  if(report?.masterWitnessRequested!==true||![44100,48000,96000].includes(rate)||!frame(summary.start)||!frame(summary.end)||summary.end<=summary.start){hold('scope');return result();}
  if(w?.schema!=='f01-master-binding-v1'||w.available!==true||w.reason!==null||w.sealed!==true||w.pending!==0||w.endFrame!==summary.end||!frame(w.cursor)||
     w.initial?.initial!=='raw'||w.initial?.contextId!=='CONTEXT'||w.initial?.nodeId!=='L1'||w.initial?.portId!=='PORT'||!frame(w.initial?.sourceEpoch)||!w.initial.sourceEpoch){hold('binding-or-initial');return result();}
  const epoch=w.initial.sourceEpoch;
  if(!Array.isArray(w.nodes)||w.nodes.some(n=>!n||typeof n!=='object')||!Array.isArray(w.candidates)||w.candidates.length!==8||w.candidates.some(c=>!c||typeof c!=='object')||!Array.isArray(w.edges)||w.edges.length!==19||w.edges.some(e=>!e||typeof e!=='object')||
     w.selected?.dry?.nodeId!=='G0'||w.selected?.dry?.paramId!=='P0'||w.selected?.wet?.nodeId!=='G1'||w.selected?.wet?.paramId!=='P1'){hold('binding-shape');return result();}
  const keys=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===names;
  const expectedKinds={G0:'gain',G1:'gain',G2:'gain',G3:'gain',G4:'gain',G5:'gain',G6:'gain',G7:'gain',D0:'delay',D1:'delay',C0:'compressor',H0:'shaper',S0:'source',L1:'worklet',T5:'splitter',PROGRAM:'observer',CONTROL:'observer'};
  if(!keys(w,'available,candidates,cursor,edges,endFrame,initial,nodes,pending,reason,schema,sealed,selected')||w.nodes.length!==17||!keys(w.initial,'contextId,initial,nodeId,portId,sourceEpoch')||!keys(w.selected,'dry,wet')||
     !keys(w.selected.dry,'nodeId,paramId')||!keys(w.selected.wet,'nodeId,paramId'))hold('binding-fixed-shape');
  for(const n of w.nodes){const gain=/^G[0-7]$/.test(n.id);
    if(!Object.hasOwn(expectedKinds,n.id)||n.kind!==expectedKinds[n.id]||!keys(n,gain?'contextId,id,kind,paramId':'contextId,id,kind')||gain&&n.paramId!=='P'+n.id.slice(1))hold('native-owner');
  }
  for(const c of w.candidates)if(!keys(c,'base,invalid,nodeId,paramId,rate,reason')||!keys(c.base,'order,status,value')||!keys(c.rate,'order,status,value')||typeof c.invalid!=='boolean'||
    (c.invalid?!['selected-automation','repeated-param-write','param-argument','native-param'].includes(c.reason):c.reason!==null))hold('candidate-shape');
  for(const e of w.edges)if(!keys(e,'from,input,order,output,status,to'))hold('edge-shape');
  const ids=new Set(w.nodes.map(n=>n?.id));
  if(ids.size!==w.nodes.length||['G0','G1','G2','G3','G4','G5','G6','G7','D0','D1','C0','H0','S0','L1','T5','PROGRAM','CONTROL'].some(id=>!ids.has(id))||w.nodes.some(n=>n.contextId!=='CONTEXT'))hold('native-identities');
  for(let i=0;i<8;i++)if(w.candidates[i]?.nodeId!=='G'+i||w.candidates[i]?.paramId!=='P'+i)hold('candidate-identity');
  for(const i of [0,1]){
    const c=w.candidates[i];
    if(c.invalid!==false||c.reason!==null||c.base?.status!=='succeeded'||c.base.value!==(i===0?1:0)||c.rate?.status!=='succeeded'||c.rate.value!=='a-rate'||
       !frame(c.base.order)||!c.base.order||!frame(c.rate.order)||c.rate.order<=c.base.order||c.rate.order>w.cursor)hold('selected-prefix');
  }
  const edgeOrders=new Set();
  for(const [from,to,output,input]of masterEdges){
    const matches=w.edges.filter(e=>e.from===from&&e.to===to&&e.output===output&&e.input===input);
    const e=matches[0];if(matches.length!==1||e.status!=='succeeded'||!frame(e.order)||!e.order||e.order>w.cursor||edgeOrders.has(e.order))hold('native-edge');
    if(e)edgeOrders.add(e.order);
  }
  if(failures.length)return result();
  const commands=o?.commands,replies=o?.replies,stages=report.masterStages;
  if(!Array.isArray(commands)||commands.length!==10||commands.length>64||commands.some(c=>!c?.message)||!Array.isArray(replies)||replies.length>64||replies.some(r=>!r||typeof r!=='object')||!Array.isArray(report.checkpoints)||!Array.isArray(stages)||stages.length!==10||
     !isDeepStrictEqual(stages.map(s=>s?.name),masterStageNames)){hold('whole-prefix');return result();}
  if(configureLifecycleFailures({commands,replies},summary.end).length)hold('lifecycle');
  let previousReplyFrame=-1;
  for(const reply of replies){if(!frame(reply.frame)||reply.frame<previousReplyFrame)hold('lifecycle-frame-regression');previousReplyFrame=reply.frame;}
  // The fixed isolated stimulus completes each posted command before the next is accepted.
  for(let i=0;i+1<commands.length;i++){
    const previousDone=replies.find(r=>r.kind==='completed'&&r.sourceEpoch===epoch&&r.seq===commands[i].message.seq);
    const nextAccepted=replies.find(r=>r.kind==='accepted'&&r.sourceEpoch===epoch&&r.seq===commands[i+1].message.seq);
    if(!previousDone||!nextAccepted||previousDone.frame>nextAccepted.frame||replies.indexOf(previousDone)>replies.indexOf(nextAccepted))hold('isolated-prefix-overlap');
  }
  const prepared=replies.filter(r=>r.kind==='prepared');
  if(prepared.length!==1||prepared[0].sourceEpoch!==epoch)hold('prepared');
  let previousSeq=0,previousRequest=-1,previousAccepted=-1;
  const accepted=[];
  for(let i=0;i<commands.length;i++){
    const c=commands[i],p=c?.message,stage=stages[i],mixed=i>=7,eq=mixed?[3,-3,6,-6,2,-2,4,-4]:[0,0,0,0,i===1?6:0,0,0,0];
    if(!p||p.kind!=='configure'||p.sourceEpoch!==epoch||!frame(p.seq)||p.seq<=previousSeq||!frame(c.requestedFrame)||c.requestedFrame<previousRequest||
       p.wanted!==(i!==8)||p.gain!==1||p.normalizer!==(mixed||i===5)||p.dynamics!==(mixed||i===3||i===5)||p.targetDbfs!==-20||!isDeepStrictEqual(p.eq,eq)||
       stage.cursor!==i||!frame(stage.request?.frame)||stage.request.frame>c.requestedFrame||stage.request.status!==(i===8?'off':'on'))hold('stimulus-prefix');
    const a=replies.filter(r=>r.kind==='accepted'&&r.sourceEpoch===epoch&&r.seq===p?.seq);
    if(a.length!==1||!frame(a[0]?.frame)||a[0].frame<=previousAccepted||a[0].frame<prepared[0]?.frame){hold('accepted-order');return result();}
    accepted.push({frame:a[0].frame,wanted:p.wanted,seq:p.seq,index:i});previousAccepted=a[0].frame;previousSeq=p.seq;previousRequest=c.requestedFrame;
  }
  let stageReplies=0,stageCursor=0;
  const digestPrefix=(rows,count)=>sha(JSON.stringify(rows.slice(0,count)));
  const reference=value=>{
    if(!value)return null;const initial=typeof value.initial==='object'?value.initial:null;
    return {schema:value.schema,available:value.available,reason:value.reason,sourceEpoch:initial?.sourceEpoch??value.sourceEpoch,initial:initial?.initial??value.initial,
      contextId:initial?.contextId??value.contextId,portId:initial?.portId??value.portId,nodeId:initial?.nodeId??value.nodeId,cursor:value.cursor,pending:value.pending,sealed:value.sealed,endFrame:value.endFrame};
  };
  for(let i=0;i<stages.length;i++){
    const s=stages[i],r=s.reference,b=s.before;
    if(s.commandCount!==i+1||!frame(s.replyCount)||s.replyCount<stageReplies||s.replyCount>replies.length||
       s.commandDigest!==digestPrefix(commands,s.commandCount)||s.replyDigest!==digestPrefix(replies,s.replyCount)||
       b?.commandCount!==i||!frame(b.replyCount)||b.replyCount>replies.length||b.replyCount>s.replyCount||b.replyCount<stageReplies||b.commandDigest!==digestPrefix(commands,b.commandCount)||b.replyDigest!==digestPrefix(replies,b.replyCount)||
       r?.schema!==w.schema||r.available!==true||r.reason!==null||r.sourceEpoch!==epoch||r.initial!==w.initial.initial||r.contextId!=='CONTEXT'||r.portId!=='PORT'||r.nodeId!=='L1'||
       !frame(r.cursor)||r.cursor<stageCursor||r.cursor>w.cursor||r.pending!==0||r.sealed!==false||r.endFrame!==null)hold('stage-prefix-reference');
    stageReplies=s.replyCount;stageCursor=r?.cursor??stageCursor;
    const checkpointName=s.name==='cold'?(report.spec?'cold-zero-on':'cold750-zero-on'):s.name==='mixed'?'mixed-before-master':s.name;
    const matches=report.checkpoints?.filter(c=>c.name===checkpointName)??[];
    if(s.name!=='mixed'||report.spec){
      const c=matches[0],co=c?.facts?.productObservation;
      if(matches.length!==1||!isDeepStrictEqual(co?.commands,commands.slice(0,s.commandCount))||!isDeepStrictEqual(co?.replies,replies.slice(0,s.replyCount))||
         !isDeepStrictEqual(reference(c?.facts?.masterWitness),r)||s.name!=='cold'&&c?.request?.frame!==s.request.frame)hold('checkpoint-prefix-reference');
    }
  }
  const actions=report.actions;
  if(!Array.isArray(actions)||!isDeepStrictEqual(actions.map(a=>a?.name),masterStageNames.filter(n=>n!=='cold'&&n!=='mixed')))hold('actions');
  else for(const action of actions){const stage=stages.find(s=>s.name===action.name);if(action.frame!==stage?.request.frame)hold('request-window');}
  if(failures.length)return result();
  const D=rate===44100?264:rate===48000?288:576,L=rate*.01,H=rate*.02;
  const at=(p,f)=>f<=p.s?p.a:f>=p.e?p.b:p.a+(p.b-p.a)*((f-p.s)/(p.e-p.s));
  let U={a:0,b:0,s:0,e:0},V={a:0,b:0,s:0,e:0},wanted=false,cursor=0,samples=0;
  const rows=[];let selected=null;
  // Advance the prefix once; do not persist a derived plan array or fit captured endpoints.
  const advance=f=>{
    while(cursor<accepted.length&&accepted[cursor].frame<=f){
      const event=accepted[cursor++];
      if(event.wanted===wanted)continue;
      if(selected&&event.frame<selected.end)hold('interrupted-master');
      const u=at(U,event.frame),v=at(V,event.frame),s=event.frame+(event.wanted?0:H+D),e=s+L;
      U={a:u,b:event.wanted?-1:0,s,e};V={a:v,b:event.wanted?1:0,s,e};wanted=event.wanted;
      if(event.index===8||event.index===9){
        const pair=[{node:0,from:1+U.a,to:1+U.b,start:s/rate,end:e/rate},{node:1,from:V.a,to:V.b,start:s/rate,end:e/rate}];
        selected={name:event.index===8?'master-off':'master-on',seq:event.seq,start:s,end:e,pair};
        if(!complementaryAudioRamps(pair))hold('original-predicate');
        if(s<summary.start||e>=summary.end)hold('endpoint-unformed');
        rows.push({...selected,provenance:'analytic adapter bound to actual native targets and both measured controls'});
      }
    }
  };
  for(let start=summary.start;start<summary.end;start+=rate){
    check();const end=Math.min(start+rate,summary.end),control=archive.window(start,end,2);
    if(control.start!==start||control.end!==end||control.channels?.length!==5){hold('control-coverage');return result(rows,samples);}
    for(let n=0;n<end-start;n++){
      const f=start+n;advance(f);const c0=control.channels[0][n],c1=control.channels[1][n];
      if(!Number.isFinite(c0)||!Number.isFinite(c1)||c0!==Math.fround(at(U,f))||c1!==Math.fround(at(V,f)))hold('representation-correspondence');
      const dry=1+c0,wet=c1;if(!Number.isFinite(dry+wet)||Math.abs(dry+wet-1)>1e-6)hold('actual-complementary-sum');samples++;
    }
    check();
  }
  advance(summary.end-1);if(cursor!==accepted.length||rows.length!==2)hold('selected-master-unformed');
  check();return result(rows,samples);
}
const sourceStartLimitBytes=8192;
const sourceStartUnavailable=reason=>({schema:'f01-source-start-v1',status:'UNFORMED',reason});
const markSourceStartUnavailable=(receipt,reason)=>boundedSourceStart({...receipt,status:'UNFORMED',reason});
function boundedSourceStart(value){
  if(value?.schema!=='f01-source-start-v1'||!['FORMED','UNFORMED'].includes(value.status))return sourceStartUnavailable('missing-receipt');
  // The failure artifacts can indent the receipt three levels deeper.
  return Buffer.byteLength(JSON.stringify(value,null,2).replaceAll('\n','\n      '))<=sourceStartLimitBytes?value:sourceStartUnavailable('size');
}
function bindSourceStartArchive(value,raw){
  const receipt=boundedSourceStart(value);
  if(receipt.status!=='FORMED')return receipt;
  const {start,end}=raw,source=raw.streams?.[1];
  const {binding,empty,packets}=receipt,initial=raw.oracleEvidence?.initial;
  const stamps=[binding?.beforeCreate,binding?.afterCreate,binding?.beforeConnect,binding?.afterConnect];
  if(!frame(binding?.epoch)||binding.epoch===0||initial?.available!==true||binding.epoch!==initial.sourceEpoch||binding.generation!==1||raw.sources!==1||
    !isDeepStrictEqual(binding.signal,{frequency:1000,inputDbfs:-36,phase:.37,frames:3969000})||binding.beforeCreate?.frame!==raw.sourceFrame||
    stamps.some((stamp,i)=>!frame(stamp?.frame)||i>0&&stamp.frame<stamps[i-1]?.frame||!Number.isFinite(stamp.mediaTime)||stamp.mediaTime<0||
      !frame(stamp.readyState)||stamp.readyState>4||typeof stamp.paused!=='boolean'))return markSourceStartUnavailable(receipt,'binding');
  const invalid=()=>markSourceStartUnavailable(receipt,'archive-bytes');
  if(!frame(start)||!frame(end)||end<=start||end-start>66150||source?.channels!==2||source.start!==start||source.end!==end||
    typeof source.base64!=='string'||source.base64.length!==Math.ceil((end-start)*8/3)*4||
    !isDeepStrictEqual(receipt.archive,{start,end,comparedFrames:256})||!Array.isArray(packets)||packets.length!==2)return invalid();
  const [first,second]=packets;
  if(packets.some(p=>!frame(p?.producerSequence)||p.producerSequence<1||p.producerSequence>8||p.receivedSequence!==p.producerSequence)||
    second.producerSequence!==first.producerSequence+1||
    (empty===null?first.producerSequence!==1:!frame(empty?.frame)||empty.producerSequence!==1||empty.receivedSequence!==1||
      first.producerSequence<=1||first.frame-empty.frame!==(first.producerSequence-1)*128))return markSourceStartUnavailable(receipt,'sequence');
  const bytes=Buffer.from(source.base64,'base64');
  if(bytes.length!==(end-start)*8||second.frame!==first.frame+128)return invalid();
  for(const packet of packets){
    if(!frame(packet.frame)||packet.frame<start||packet.frame+128>end||typeof packet.pcm!=='string'||packet.pcm.length!==1368||packet.producerPcm!==undefined)return invalid();
    const offset=(packet.frame-start)*8;
    if(bytes.subarray(offset,offset+1024).toString('base64')!==packet.pcm)return invalid();
    let allZero=true;
    for(let at=offset;at<offset+1024;at+=4)if(bytes.readFloatLE(at)!==0){allZero=false;break;}
    if(packet.allZero!==allZero)return invalid();
  }
  return receipt;
}
export function productFailureEvidenceBytes(partial){
  const evidence=partial?.firstStreamFailureEvidence;if(evidence==null)return 0;
  if(!Array.isArray(evidence.packets)||evidence.packets.length>2)throw fail('failure-evidence-bound');
  let bytes=0;
  for(const packet of evidence.packets){
    if(!Array.isArray(packet?.channels)||packet.channels.length>5)throw fail('failure-evidence-channels');
    for(const channel of packet.channels){
      if(channel?.encoding!=='float32le'||typeof channel.base64!=='string'||channel.base64.length>684)throw fail('failure-evidence-encoding');
      const data=Buffer.from(channel.base64,'base64');
      if(data.length>512||data.length%4!==0||data.toString('base64')!==channel.base64)throw fail('failure-evidence-bytes');bytes+=data.length;
    }
  }
  if(bytes!==evidence.bytes||bytes>5120)throw fail('failure-evidence-size');return bytes;
}
export const PRODUCT_WET_PEAK_CASES=Object.freeze([44100,48000,96000].map(sampleRate=>Object.freeze({id:`${sampleRate}/output-control/wet-peak`,sampleRate,frequency:1000,inputDbfs:20*Math.log10(.99),pattern:'dc',gain:2})));
export const PRODUCT_DRY_CASES=Object.freeze([44100,48000,96000].flatMap(sampleRate=>[1,.99].map(level=>Object.freeze({id:`${sampleRate}/output-control/${level===1?'dry-unity':'dry-99'}`,sampleRate,frequency:1000,inputDbfs:20*Math.log10(level),pattern:'dc',gain:1}))));
export const PRODUCT_EXTREME_CASES=Object.freeze([44100,48000,96000].map(sampleRate=>Object.freeze({id:`${sampleRate}/output-control/extreme`,sampleRate,frequency:1000,inputDbfs:-6,pattern:'stereo',gain:2})));
export const PRODUCT_OUTPUT_CONTROL_CASES=Object.freeze([...PRODUCT_WET_PEAK_CASES,...PRODUCT_DRY_CASES,...PRODUCT_EXTREME_CASES]);
export const PRODUCT_TRANSITION_CASES=Object.freeze([44100,48000,96000].flatMap(sampleRate=>[250,1000].map(frequency=>Object.freeze({id:`${sampleRate}/transition/${frequency}`,sampleRate,frequency}))));
export function selectProductCase(id){return PRODUCT_OUTPUT_CONTROL_CASES.find(c=>c.id===id)??PRODUCT_TRANSITION_CASES.find(c=>c.id===id)??PACKAGED_NORMALIZER_CASES.find(c=>c.id===id)??NORMALIZER_CONTROL_CASES.find(c=>c.id===id)??PACKAGED_REENTRY_CASES.find(c=>c.id===id)??SOURCE_OWNER_CASES.find(c=>c.id===id)??SOURCE_OFF_STAGE_CASES.find(c=>c.id===id)??SOURCE_SUSPEND_REBIND_CASES.find(c=>c.id===id)??SOURCE_PENDING_OFF_CASES.find(c=>c.id===id)??SOURCE_HISTORY_CASES.find(c=>c.id===id)??SOURCE_WET_HISTORY_CASES.find(c=>c.id===id)??SOURCE_EXTREME_HISTORY_CASES.find(c=>c.id===id)??selectEqualizerCase(id);}
export function parseProductAudioArgs(args){
  if(args.length<1||args.length>10||!/^--run-id=[A-Za-z0-9]{1,64}$/.test(args[0])||/^--run-id=F01(?:J1Native|L1Clock)20261018(?:R48)?$/.test(args[0]))throw fail('args');
  let sampleRate,caseId,browserRoot,browserManifestSha256,shutdownContract,jobHelper,jobHelperSha256,componentWitness=false,headroomWitness=false,masterWitness=false;
  for(const arg of args.slice(1)){
    if(/^--sample-rate=(44100|48000|96000)$/.test(arg)&&sampleRate===undefined)sampleRate=Number(arg.slice(14));
    else if(arg.startsWith('--case=')&&caseId===undefined)caseId=selectProductCase(arg==='--case=eq63-minus6'?EQUALIZER_CASE.id:arg.slice(7)).id;
    else if(arg.startsWith('--browser-root=')&&browserRoot===undefined)browserRoot=arg.slice(15);
    else if(arg.startsWith('--browser-manifest-sha256=')&&browserManifestSha256===undefined)browserManifestSha256=arg.slice(26);
    else if(arg.startsWith('--shutdown-contract=')&&shutdownContract===undefined)shutdownContract=arg.slice(20);
    else if(arg.startsWith('--job-helper=')&&jobHelper===undefined)jobHelper=arg.slice(13);
    else if(arg.startsWith('--job-helper-sha256=')&&jobHelperSha256===undefined)jobHelperSha256=arg.slice(20);
    else if(arg==='--component-witness'&&!componentWitness)componentWitness=true;
    else if(arg==='--headroom-witness'&&!headroomWitness)headroomWitness=true;
    else if(arg==='--master-witness'&&!masterWitness)masterWitness=true;
    else throw fail('args');
  }
  if(caseId&&sampleRate!==undefined&&sampleRate!==selectProductCase(caseId).sampleRate)throw fail('args');
  if(componentWitness&&(!caseId||PRODUCT_OUTPUT_CONTROL_CASES.some(c=>c.id===caseId)||PRODUCT_TRANSITION_CASES.some(c=>c.id===caseId)||PACKAGED_NORMALIZER_CASES.some(c=>c.id===caseId)||NORMALIZER_CONTROL_CASES.some(c=>c.id===caseId)||PACKAGED_REENTRY_CASES.some(c=>c.id===caseId)||SOURCE_OWNER_CASES.some(c=>c.id===caseId)||SOURCE_OFF_STAGE_CASES.some(c=>c.id===caseId)||SOURCE_SUSPEND_REBIND_CASES.some(c=>c.id===caseId)||SOURCE_PENDING_OFF_CASES.some(c=>c.id===caseId)||(SOURCE_HISTORY_CASES.some(c=>c.id===caseId)||(SOURCE_WET_HISTORY_CASES.some(c=>c.id===caseId)||SOURCE_EXTREME_HISTORY_CASES.some(c=>c.id===caseId)))))throw fail('args');
  if(headroomWitness&&(componentWitness||!PACKAGED_NORMALIZER_CASES.some(c=>c.id===caseId)))throw fail('args');
  if(masterWitness&&((caseId&&!PRODUCT_TRANSITION_CASES.some(c=>c.id===caseId))||componentWitness||headroomWitness||browserRoot!==undefined||browserManifestSha256!==undefined||shutdownContract!==undefined||jobHelper!==undefined||jobHelperSha256!==undefined))throw fail('args');
  const gainJob=isGain4JobCase(caseId)&&componentWitness;
  const toneBrowser=caseId==='44100/normalizer-control/tone-silence'&&!componentWitness;
  let browserCandidate;
  if(browserRoot!==undefined||browserManifestSha256!==undefined){
    if(typeof browserRoot!=='string'||!path.isAbsolute(browserRoot)||/^[\\/]{2}/.test(browserRoot)||process.platform==='win32'&&!/^[a-z]:[\\/]/i.test(browserRoot)||!/^([a-f0-9]{64})$/.test(browserManifestSha256??'')||(!toneBrowser&&!gainJob)||headroomWitness)throw fail('browser-selection');
    browserCandidate=Object.freeze({root:path.resolve(browserRoot),manifestSha256:browserManifestSha256});
  }
  let runJob;
  if(shutdownContract!==undefined||jobHelper!==undefined||jobHelperSha256!==undefined){
    if(shutdownContract!=='run-job-v1'||!browserCandidate||(!toneBrowser&&!gainJob)||typeof jobHelper!=='string'||!path.isAbsolute(jobHelper)||/^[\\/]{2}/.test(jobHelper)||process.platform==='win32'&&!/^[a-z]:[\\/]/i.test(jobHelper)||!jobHelper.toLowerCase().endsWith('.exe')||!/^([a-f0-9]{64})$/.test(jobHelperSha256??''))throw fail('shutdown-selection');
    runJob=Object.freeze({contract:shutdownContract,helper:Object.freeze({path:path.resolve(jobHelper),sha256:jobHelperSha256})});
  }
  if(gainJob&&browserCandidate&&!runJob)throw fail('shutdown-selection');
  return {runId:args[0].slice(9),...(browserCandidate?{browserCandidate}:{}),...(runJob?{runJob}:{}),...(sampleRate===undefined?{}:{sampleRate}),...(caseId?{caseId}:{}),...(componentWitness?{componentWitness:true}:{}),...(headroomWitness?{headroomWitness:true}:{}),...(masterWitness?{masterWitness:true}:{})};
}

/** Retain every unique exported frame; a missed ring window is a failure, never zero-filled. */
export function createProductArchive(files,directory,rate=44100,profile='legacy',failureControl){
  if(![44100,48000,96000].includes(rate))throw fail('sample-rate');
  if(!['legacy','equalizer-component','normalizer-control','wet-peak','dry','extreme'].includes(profile))throw fail('archive-profile');
  const component=profile==='equalizer-component',control=profile==='normalizer-control'||profile==='extreme',output=profile==='wet-peak'||profile==='dry'||profile==='extreme',reservedBytes=output?rate*8+(profile==='extreme'?2*fftBufferPairBytes(rate):0):0,counts=component?[2,2,5,2]:[2,2,5],frameBytes=component?44:36;
  const segments=[],artifacts=[];let start=null,end=null,bytes=0,sealed=false,pendingWrite=null,chargedBytes=0;
  const report=(error,response)=>{try{failureControl?.onFailure(error,response);}catch{/* Preserve the original archive error. */}};
  const check=()=>{if(failureControl?.stopped())throw failureControl.error();};
  const write=async(file,data,row)=>{
    if(failureControl){
      try{
        check();pendingWrite={...row,status:'dispatched; completion unknown after STOP'};
        await files.writeFile(file,data,{flag:'wx'});
        check();pendingWrite=null;return;
      }catch(error){report(error);throw error;}
    }
    if(control)pendingWrite={...row,status:'dispatched; completion unknown after STOP'};
    await files.writeFile(file,data,{flag:'wx'});
    if(control){if(sealed)throw fail('archive-sealed');pendingWrite=null;}
  };
  return {
    async append(raw){
      try{
      check();
      if(control&&sealed)throw fail('archive-sealed');
      if(raw?.schema!==(component?'f01-product-window-v2':'f01-product-window-v1')||raw.sampleRate!==rate||!frame(raw.start)||!frame(raw.end)||raw.end<=raw.start||raw.end-raw.start>rate*1.5||
        raw.sources!==1||raw.l1Nodes!==1||raw.invalidFrames!==0||raw.streamError!==''||raw.hidden!==false||raw.contextState!=='running'||
        !Array.isArray(raw.streams)||raw.streams.length!==counts.length||end!==null&&raw.start!==end)throw fail('archive-coverage');
      const size=(raw.end-raw.start)*frameBytes;if(bytes+reservedBytes+size>cap)throw fail('archive-cap');
      if(control&&artifacts.length+counts.length+1>4096)throw fail('archive-artifact-cap');
      const decoded=raw.streams.map((row,index)=>{
        if(row.start!==raw.start||row.end!==raw.end||row.channels!==counts[index]||component&&row.role!==['program','source','control','component'][index]||row.encoding!=='interleaved-float32le'||typeof row.base64!=='string'||
          row.base64.length>Math.ceil(size/3)*4||row.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(row.base64))throw fail('archive-stream');
        const data=Buffer.from(row.base64,'base64');if(data.length!==(raw.end-raw.start)*counts[index]*4)throw fail('archive-size');
        for(let n=0;n<data.length;n+=4)if(!Number.isFinite(data.readFloatLE(n)))throw fail('archive-nonfinite');return data;
      });
      if(failureControl){if(chargedBytes+reservedBytes+size>cap)throw fail('archive-cap');chargedBytes+=size;}
      if(control)bytes+=size;
      const number=String(segments.length).padStart(4,'0');
      for(const [index,data]of decoded.entries()){
        const file=`${directory}/segment-${number}-stream-${index}.f32le`,row={file,start:raw.start,end:raw.end,channels:counts[index],bytes:data.length,sha256:sha(data),...(component?{role:['program','source','control','component'][index]}:{})};
        await write(file,data,row);artifacts.push(row);
      }
      const {streams,...metadata}=raw,recordFile=`${directory}/segment-${number}.json`,recordBytes=Buffer.from(JSON.stringify({...metadata,streams:artifacts.slice(-counts.length)},null,2)+'\n');
      const row={file:recordFile,start:raw.start,end:raw.end,bytes:recordBytes.length,sha256:sha(recordBytes),kind:'metadata'};
      await write(recordFile,recordBytes,row);artifacts.push(row);
      check();segments.push({start:raw.start,end:raw.end,streams:decoded});start??=raw.start;end=raw.end;if(!control)bytes+=size;
      }catch(error){report(error,raw);throw error;}
    },
    window(a,b,stream=0){
      if(!frame(a)||!frame(b)||b<=a||start===null||a<start||b>end||!counts[stream])throw fail('archive-window');
      const channels=Array.from({length:counts[stream]},()=>new Float32Array(b-a));let covered=0;
      for(const segment of segments){const x=Math.max(a,segment.start),y=Math.min(b,segment.end);if(y<=x)continue;
        for(let n=x;n<y;n++)for(let c=0;c<counts[stream];c++)channels[c][n-a]=segment.streams[stream].readFloatLE(((n-segment.start)*counts[stream]+c)*4);
        covered+=y-x;
      }
      if(covered!==b-a)throw fail('archive-window-gap');return {rate,start:a,end:b,channels};
    },
    seal(){if(control)sealed=true;},
    summary(){return {sampleRate:rate,start,end,bytes,cap,segments:segments.length,artifacts:[...artifacts],coverage:component?'contiguous-program2-source2-control5-component2':'contiguous-program2-source2-control5',...(component||control||output?{profile}:{}),...(output?{reservedBytes}:{}),...(failureControl?{chargedBytes,pendingWrites:pendingWrite?[{...pendingWrite}]:[]} :control?{pendingWrites:pendingWrite?[{...pendingWrite}]:[],...(profile==='extreme'?{sealed}:{})}:{})};},
  };
}

export function assessProductTransitions(archive,actions){
  const rate=archive.summary().sampleRate;
  return actions.map((action,index)=>{
    const f=action.frame,window=(a,b)=>{const capture=archive.window(f+Math.round(rate*a),f+Math.round(rate*b));return {start:capture.start,end:capture.end,...summarizeCapture(capture)};};
    const before=window(-.08,-.04),change=window(-.02,.04),after=window(.1,.14),master=action.name.startsWith('master-');
    const failures=evaluateProcessingTransition(before,change,after,master?'master':'component');
    let entire=null;
    if(master){
      const end=actions[index+1]?.frame??archive.summary().end;entire=summarizeCapture(archive.window(f-Math.round(rate*.08),end));
      for(let c=0;c<2;c++){
        if(entire.channels[c].envelope8ms.min<Math.min(before.channels[c].envelope8ms.min,after.channels[c].envelope8ms.min)*.95)failures.push(`continuous-channel-${c}/dip`);
        if(entire.channels[c].maxAdjacentStep>Math.max(before.channels[c].maxAdjacentStep,after.channels[c].maxAdjacentStep)+1e-6)failures.push(`continuous-channel-${c}/step`);
      }
    }
    return {...action,before,change,after,entire,failures};
  });
}

export function productLifecycleFailures(observation,end){
  const {commands,replies}=observation??{};if(!Array.isArray(commands)||!commands.length||!Array.isArray(replies))return ['lifecycle-missing'];
  const failures=[],seen=new Set();
  if(replies.some(row=>!row||!['prepared','accepted','completed','retired'].includes(row.kind)||row.code!==null))failures.push('lifecycle-reply');
  for(const command of commands){
    const packet=command?.message,key=packet?.sourceEpoch+'/'+packet?.seq;
    if(!packet||!['configure','retire'].includes(packet.kind)||!frame(packet.sourceEpoch)||!frame(packet.seq)||!frame(command.requestedFrame)||seen.has(key)){failures.push('lifecycle-command');continue;}seen.add(key);
    const accepted=replies.filter(r=>r.kind==='accepted'&&r.sourceEpoch===packet.sourceEpoch&&r.seq===packet.seq),completed=replies.filter(r=>r.kind===(packet.kind==='retire'?'retired':'completed')&&r.sourceEpoch===packet.sourceEpoch&&r.seq===packet.seq);
    if(packet.kind==='configure'&&accepted.length!==1||completed.length!==1||accepted.some(r=>!frame(r.frame)||r.frame<command.requestedFrame)||
      completed.some(r=>!frame(r.frame)||r.frame<(accepted[0]?.frame??command.requestedFrame)||r.frame>=end))failures.push('lifecycle-'+key);
  }
  if(replies.some(row=>row.kind!=='prepared'&&!seen.has(row.sourceEpoch+'/'+row.seq)))failures.push('lifecycle-orphan');
  return failures;
}

/** Bind the requested stimulus to actual packets without moving the original numeric windows to ACK time. */
export function productTransitionTargetFailures(report,spec){
  const {commands,replies}=report.facts?.productObservation??{},rows=report.checkpoints,actions=report.actions;
  const names=['cold-zero-on','eq-on','eq-off','compressor-on','compressor-off','normalizer-on','normalizer-off','mixed-before-master','master-off','master-on'];
  if(!Array.isArray(commands)||!Array.isArray(replies)||!Array.isArray(rows)||!isDeepStrictEqual(rows.map(c=>c?.name),names)||!Array.isArray(actions)||!isDeepStrictEqual(actions.map(a=>a?.name),names.filter(n=>n!=='cold-zero-on'&&n!=='mixed-before-master')))return ['transition-target-shape'];
  const failures=[],cold=rows[0].facts?.productObservation,initial=cold?.commands?.length;
  if(initial!==1||commands.length!==10)return ['transition-target-count'];
  const first=rows[0],before=first.before;
  if(first.cursor!==0||first.request?.control!=='button-click'||!Number.isFinite(before?.audioTime)||first.request.frame!==Math.round(before.audioTime*spec.sampleRate)||!frame(first.request.frame)||!isDeepStrictEqual(before.productObservation?.commands,[])||!isDeepStrictEqual(before.productObservation?.replies,[])||before.productObservation?.sources!==0||before.readback?.state!=='off'||before.readback?.wanted!==false||first.facts.readback?.state!=='on'||first.facts.readback?.wanted!==true||commands[0]?.requestedFrame<first.request.frame||productSignalFailures(before,spec.sampleRate,spec.frequency).length)failures.push('cold-zero-on/transition-request');
  let previous=-1,replyCount=0;
  for(const [index,row]of rows.entries()){
    const observation=row.facts?.productObservation,cursor=index?initial+index-1:initial-1,command=commands[cursor],packet=command?.message;
    if(!observation||!Array.isArray(observation.commands)||!Array.isArray(observation.replies)||observation.commands.length!==cursor+1||
      !isDeepStrictEqual(observation.commands,commands.slice(0,cursor+1))||observation.replies.length<replyCount||!isDeepStrictEqual(observation.replies,replies.slice(0,observation.replies.length))||productSignalFailures(row.facts,spec.sampleRate,spec.frequency).length)failures.push(row.name+'/transition-prefix');
    replyCount=observation?.replies?.length??replyCount;
    if(packet&&replies.findIndex(r=>r.kind==='accepted'&&r.seq===packet.seq)>=replies.findIndex(r=>r.kind==='completed'&&r.seq===packet.seq))failures.push(row.name+'/transition-reply-order');
    const mixed=index>=7,eq=mixed?[3,-3,6,-6,2,-2,4,-4]:[0,0,0,0,index===1?6:0,0,0,0];
    if(!packet||Object.keys(packet).sort().join(',')!=='dynamics,eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted'||!frame(packet.sourceEpoch)||packet.sourceEpoch===0||!frame(packet.seq)||packet.seq===0||packet.kind!=='configure'||index>0&&(packet.seq<=commands[cursor-1].message.seq||command.requestedFrame<commands[cursor-1].requestedFrame)||packet.sourceEpoch!==commands[initial-1].message.sourceEpoch||packet.wanted!==(index!==8)||packet.gain!==1||!isDeepStrictEqual(packet.eq,eq)||packet.normalizer!==(mixed||index===5)||packet.dynamics!==(mixed||index===3||index===5)||packet.targetDbfs!==-20)failures.push(row.name+'/transition-config');
    if(index){
      const request=row.request,action=actions.find(a=>a.name===row.name);
      if(row.cursor!==cursor||!frame(request?.frame)||request.frame<=previous||request.status!==(index===8?'off':'on')||!frame(command?.requestedFrame)||command.requestedFrame<request.frame||action&&action.frame!==request.frame||request.frame<report.archive.start||request.frame>=report.archive.end)failures.push(row.name+'/transition-request');
      previous=request?.frame;
    }
  }
  return [...failures,...configureLifecycleFailures({commands,replies},report.archive.end)];
}

function configureLifecycleFailures(observation,end){
  const {commands,replies}=observation??{};
  if(!Array.isArray(commands)||!commands.length||!Array.isArray(replies))return ['configure-lifecycle'];
  const failures=productLifecycleFailures(observation,end),epoch=commands[0]?.message?.sourceEpoch;
  for(const [i,c]of commands.entries()){
    const p=c?.message;
    if(!p||Object.keys(p).sort().join(',')!=='dynamics,eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted'||p.kind!=='configure'||!frame(p.sourceEpoch)||!p.sourceEpoch||p.sourceEpoch!==epoch||!frame(p.seq)||!p.seq||i>0&&(p.seq<=commands[i-1].message.seq||c.requestedFrame<commands[i-1].requestedFrame))failures.push('configure-wire');
    if(p&&replies.findIndex(r=>r?.kind==='accepted'&&r.seq===p.seq)>=replies.findIndex(r=>r?.kind==='completed'&&r.seq===p.seq))failures.push('configure-reply-order');
  }
  if(replies[0]?.kind!=='prepared'||replies.filter(r=>r?.kind==='prepared').length!==1||replies.some(r=>!r||Object.keys(r).sort().join(',')!=='code,frame,gain,kind,meterEpoch,seq,sourceEpoch'||r.sourceEpoch!==epoch||!frame(r.seq)||!frame(r.frame)||!frame(r.meterEpoch)||r.code!==null||
    (r.kind==='prepared'?r.seq!==0||r.meterEpoch!==0||r.gain!==null:!['accepted','completed'].includes(r.kind)||r.seq===0||r.gain!==(r.kind==='completed'?commands.find(c=>c.message.seq===r.seq)?.message.gain:null))))failures.push('configure-reply-envelope');
  return failures;
}

function captureBytes(capture){
  const bytes=Buffer.alloc((capture.end-capture.start)*8);
  for(let n=0;n<capture.end-capture.start;n++)for(let c=0;c<2;c++)bytes.writeFloatLE(capture.channels[c][n],n*8+c*4);
  return bytes;
}

/** Preserve each original scalar gate; identity and coverage remain separate prerequisites. */
export function assessProductOutputControl(archive,facts,proof,spec){
  const selected=PRODUCT_OUTPUT_CONTROL_CASES.find(c=>isDeepStrictEqual(c,spec));if(!selected)throw fail('output-control-original-spec');
  const dry=PRODUCT_DRY_CASES.includes(selected),profile=dry?'dry':'wet-peak',wanted=!dry,level=10**(selected.inputDbfs/20);
  const state=facts?.productObservation,before=proof?.beforeTarget,request=proof?.request,m=proof?.measurement,summary=archive.summary(),failures=[],inputFailures=[];
  const signal=f=>productSignalFailures(f,spec.sampleRate,spec.frequency,spec.inputDbfs);
  if(summary.sampleRate!==spec.sampleRate||summary.profile!==profile||summary.reservedBytes!==spec.sampleRate*8||!isDeepStrictEqual(proof?.spec,spec)||!frame(summary.start)||!frame(summary.end)||summary.end<=summary.start||!state||state.sources!==1||state.l1Nodes!==1||state.invalidFrames!==0||state.streamError!==''||facts.hidden!==false||facts.contextState!=='running'||signal(facts).length)inputFailures.push(profile+'-formation');
  const initial=dry?proof?.priming?.before:before;
  if(!initial||signal(initial).length||!Number.isFinite(initial.audioTime)||initial.readback?.state!=='off'||initial.readback?.wanted!==false||initial.readback?.gain!==1||initial.readback?.sources!==0||initial.productObservation?.sources!==0||initial.productObservation?.l1Nodes!==0||initial.productObservation?.invalidFrames!==0||initial.productObservation?.streamError!==''||initial.readback?.appliedGain!==null||!isDeepStrictEqual(initial.productObservation?.commands,[])||!isDeepStrictEqual(initial.productObservation?.replies,[]))failures.push(profile+'-initial');
  if(!before||signal(before).length||!Number.isFinite(before.audioTime)||!frame(request?.frame)||request.frame<Math.round(before.audioTime*spec.sampleRate)||request.status!==(wanted?'on':'off'))failures.push(profile+'-baseline-request');
  const command=state?.commands?.[dry?1:0],packet=command?.message;
  if(state?.commands?.length!==(dry?2:1)||!packet||!isDeepStrictEqual(packet,{kind:'configure',sourceEpoch:packet.sourceEpoch,seq:packet.seq,wanted,gain:spec.gain,eq:Array(8).fill(0),normalizer:false,dynamics:false,targetDbfs:-20})||!frame(command.requestedFrame)||command.requestedFrame<request?.frame)failures.push(profile+'-target');
  if(dry){
    const prime=proof?.priming,o=before?.productObservation,r=before?.readback,p=state?.commands?.[0]?.message;
    if(!prime||prime.milliseconds!==1250||![prime.start,prime.end].every(n=>Number.isFinite(n)&&n>=0)||prime.start<proof.scenarioStartedAt||prime.end-prime.start<1250||prime.end>proof.settling?.start||!p||!isDeepStrictEqual(p,{kind:'configure',sourceEpoch:p.sourceEpoch,seq:p.seq,wanted:true,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:false,targetDbfs:-20})||state.commands[0].requestedFrame<Math.round(initial?.audioTime*spec.sampleRate)||o?.sources!==1||o.l1Nodes!==1||!isDeepStrictEqual(o.commands,state.commands.slice(0,1))||!Array.isArray(o.replies)||!isDeepStrictEqual(o.replies,state.replies?.slice(0,o.replies.length))||configureLifecycleFailures(o,Math.round(before.audioTime*spec.sampleRate)+1).length||r?.state!=='on'||r.wanted!==true||r.gain!==1||r.appliedGain!==1||r.sources!==1)failures.push(profile+'-priming');
  }
  failures.push(...configureLifecycleFailures(state,summary.end));
  let replyCount=0;
  for(const f of [proof?.captureAfter,facts]){
    const o=f?.productObservation,r=f?.readback;
    if(!o||!isDeepStrictEqual(o.commands,state?.commands)||!Array.isArray(o.replies)||configureLifecycleFailures(o,summary.end).length||o.replies.length<replyCount||!isDeepStrictEqual(o.replies,state?.replies?.slice(0,o.replies.length))||signal(f).length||r?.state!==(wanted?'on':'off')||r.wanted!==wanted||r.sources!==1||r.gain!==spec.gain||r.appliedGain!==spec.gain)failures.push(profile+'-target-prefix');
    replyCount=o?.replies?.length??replyCount;
  }
  const completed=state?.replies?.find(r=>r.kind==='completed'&&r.seq===packet?.seq),afterFrame=Math.round(proof?.captureAfter?.audioTime*spec.sampleRate);
  const t=proof?.settling,c=proof?.capture,clock=[proof?.scenarioStartedAt,t?.start,t?.end,c?.calledAt,c?.returnedAt];
  if(clock.some(n=>!Number.isFinite(n)||n<0)||t.start<proof.scenarioStartedAt||t.end-t.start<1250||c.calledAt<t.end||c.returnedAt<c.calledAt||c.returnedAt-proof.scenarioStartedAt>scenarioTimeoutMs||c.writeStatus!=='completed')failures.push(profile+'-clock');
  if(proof?.settling?.milliseconds!==1250||!frame(m?.start)||!frame(m?.end)||m.end-m.start!==spec.sampleRate||m.end%128!==0||m.start<summary.start||m.end>summary.end||!frame(afterFrame)||m.end>afterFrame||!frame(completed?.frame)||m.start<completed.frame||proof.capture?.bytes!==spec.sampleRate*8||summary.bytes+proof.capture.bytes>cap)failures.push(profile+'-window');
  if(inputFailures.length===0){
    const bad=new Set();
    for(let start=summary.start;start<summary.end;start+=spec.sampleRate){const source=archive.window(start,Math.min(start+spec.sampleRate,summary.end),1);for(const [c,channel]of source.channels.entries())if(channel.some(v=>!Number.isFinite(v)||Math.abs(v-level)>1e-5))bad.add(c);}
    for(const c of bad)inputFailures.push(profile+'-source-channel-'+c);
  }
  let measured=null;
  if(!failures.length&&!inputFailures.length){
    const window=archive.window(m.start,m.end),control=archive.window(m.start,m.end,2);measured=summarizeCapture(window);
    if(sha(captureBytes(window))!==proof.capture.sha256||!isDeepStrictEqual(JSON.parse(JSON.stringify(measured)),m.summary))failures.push(profile+'-capture-mismatch');
    for(let n=0;n<spec.sampleRate;n++)if(Math.abs(control.channels[0][n]+(wanted?1:0))>1e-6||control.channels[1][n]!==Number(wanted)||control.channels[2][n]!==spec.gain||control.channels[3][n]!==1||control.channels[4][n]!==0){failures.push(profile+'-control');break;}
  }
  const qualityAssessed=!!measured&&!failures.length&&!inputFailures.length;
  if(qualityAssessed)for(const [c,row]of measured.channels.entries())if(dry?Math.abs(row.rms-level)>=1e-5:row.peak>.9801||row.overFullScaleSamples!==0)failures.push(profile+'-channel-'+c+(dry?'/rms':'/ceiling'));
  return {passed:!failures.length&&!inputFailures.length,outcome:inputFailures.length?'INCONCLUSIVE':failures.length?'FAIL':'PASS',qualityAssessed,inputFailures,failures:[...inputFailures,...failures],measurement:measured,native7Witness:'UNASSESSED',native8Witness:'UNASSESSED',overallQualification:false};
}

/** The original combined safety/scalar gate, with formation kept separate from numeric failure. */
export function assessProductExtreme(archive,facts,proof,spec,fftBytes){
  if(!PRODUCT_EXTREME_CASES.some(c=>isDeepStrictEqual(c,spec)))throw fail('extreme-original-spec');
  const rate=spec.sampleRate,s=archive.summary(),o=facts?.productObservation,m=proof?.measurement,initial=proof?.priming?.before,before=proof?.beforeTarget,after=proof?.captureAfter,failures=[],inputFailures=[];
  const signal=(f,preOn=false)=>productSignalFailures(f,rate,1000,-6).length===0&&f.signal.pattern==='stereo'&&f.sampleRate===rate&&f.hidden===false&&(f.contextState==='running'||preOn&&f.contextState==='suspended');
  const graph=(f,compressed=true)=>f.compressors===1&&isDeepStrictEqual(f.compressorParameters,[{threshold:0,knee:0,ratio:1}])&&Array.isArray(f.gains)&&f.gains[4]===Number(!compressed)&&f.gains[5]===Number(compressed);
  if(!isDeepStrictEqual(proof?.spec,spec)||s.sampleRate!==rate||s.profile!=='extreme'||s.reservedBytes!==rate*8+2*fftBufferPairBytes(rate)||s.cap!==cap||s.bytes+rate*8+2*fftBufferPairBytes(rate)>cap||!frame(s.start)||!frame(s.end)||s.end<=s.start||!o||o.sources!==1||o.l1Nodes!==1||o.invalidFrames!==0||o.streamError!==''||!signal(facts))inputFailures.push('extreme-formation');
  if(!initial||!signal(initial,true)||initial.sources!==0||initial.readback?.state!=='off'||initial.readback?.wanted!==false||initial.readback?.gain!==1||initial.readback?.appliedGain!==null||initial.readback?.sources!==0||initial.productObservation?.sources!==0||initial.productObservation?.l1Nodes!==0||!isDeepStrictEqual(initial.productObservation?.commands,[])||!isDeepStrictEqual(initial.productObservation?.replies,[]))failures.push('extreme-initial');
  if(!before||!signal(before)||!graph(before,false)||before.sources!==1||before.analysers!==0||before.reads!==0||before.active100msTimers!==0||!isDeepStrictEqual(before.normalizerSettings,{normalizerEnabled:false,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false})||!isDeepStrictEqual(before.readback,{state:'on',sources:1,wanted:true,gain:2,appliedGain:2})||!isDeepStrictEqual(before.productObservation?.commands,o?.commands?.slice(0,2))||!isDeepStrictEqual(before.productObservation?.replies,o?.replies?.slice(0,before.productObservation.replies.length))||configureLifecycleFailures(before.productObservation,Math.round(before.audioTime*rate)+1).length)failures.push('extreme-baseline');
  if(o?.commands?.length!==3)failures.push('extreme-command-count');
  for(const [i,c]of (o?.commands??[]).entries()){const p=c.message;if(!p||!isDeepStrictEqual(p,{kind:'configure',sourceEpoch:p.sourceEpoch,seq:p.seq,wanted:true,gain:i?2:1,eq:Array(8).fill(i===2?6:0),normalizer:i===2,dynamics:i===2,targetDbfs:i===2?-12:-20}))failures.push('extreme-config');}
  failures.push(...configureLifecycleFailures(o,s.end));
  const command=o?.commands?.[2],packet=command?.message,completed=o?.replies?.find(p=>p.kind==='completed'&&p.seq===packet?.seq),accepted=o?.replies?.find(p=>p.kind==='accepted'&&p.seq===packet?.seq),target={command,accepted,completed},query=proof?.scalarQuery,scalarFrame=Math.round(after?.audioTime*rate),t=proof?.settling,c=proof?.capture,prime=proof?.priming;
  if(!frame(proof?.request?.frame)||proof.request.status!=='on'||proof.request.frame<Math.round(before?.audioTime*rate)||command?.requestedFrame<proof.request.frame||proof?.baselineRequest?.status!=='on'||proof.baselineRequest.frame<Math.round(initial?.audioTime*rate)||o?.commands?.[1]?.requestedFrame<proof.baselineRequest.frame)failures.push('extreme-request');
  const clock=[proof?.scenarioStartedAt,prime?.start,prime?.end,t?.start,t?.end,c?.calledAt,c?.returnedAt,query?.calledAt,query?.returnedAt];
  if(clock.some(v=>!Number.isFinite(v)||v<0)||prime.start<proof.scenarioStartedAt||prime.milliseconds!==1250||prime.end-prime.start<1250||t.start<prime.end||t.milliseconds!==9500||t.end-t.start<9500||c.calledAt<t.end||c.returnedAt<c.calledAt||query.calledAt<c.returnedAt||query.returnedAt<query.calledAt||query.returnedAt-proof.scenarioStartedAt>scenarioTimeoutMs||c.writeStatus!=='completed'||query.frame!==scalarFrame)failures.push('extreme-clock');
  if(!frame(m?.start)||!frame(m?.end)||m.end-m.start!==rate||m.end%128!==0||m.start<s.start||m.end>s.end||!frame(completed?.frame)||m.start<completed.frame||!frame(scalarFrame)||scalarFrame<m.end||scalarFrame>=s.end||c?.bytes!==rate*8)failures.push('extreme-window');
  for(const f of [after,facts])if(!f||!signal(f)||!graph(f)||f.sources!==1||!isDeepStrictEqual(f.normalizerSettings,{normalizerEnabled:true,normalizerTargetDbfs:-12,eqEnabled:true,compressorEnabled:true})||!isDeepStrictEqual(f.readback,{state:'on',sources:1,wanted:true,gain:2,appliedGain:2})||!isDeepStrictEqual(f.productObservation?.commands,o?.commands)||configureLifecycleFailures(f.productObservation,s.end).length||!isDeepStrictEqual(f.oracleEvidence?.initial,before?.oracleEvidence?.initial))failures.push('extreme-final-or-query');
  const aEvents=after?.oracleEvidence?.ledger?.events,events=facts?.oracleEvidence?.ledger?.events;
  if(!Array.isArray(aEvents)||!Array.isArray(events)||!isDeepStrictEqual(aEvents,events.slice(0,aEvents.length)))failures.push('extreme-query-ledger');
  if(!proof?.fftBuffer||proof.fftBuffer.writeStatus!=='completed'||!(fftBytes instanceof Uint8Array)||fftBytes.length!==fftBufferPairBytes(rate)||proof.fftBuffer.bytes!==fftBytes.length||sha(fftBytes)!==proof.fftBuffer.sha256||!isDeepStrictEqual(after?.fftBufferWitness,facts?.fftBufferWitness))failures.push('extreme-fft-buffer-proof');
  let normalizer=null,measured=null,fftBuffer=null;
  if(!failures.length&&!inputFailures.length){
    const starts=new Set([s.start,s.end-rate/10]);for(let start=s.start;start+rate/10<=s.end;start+=rate/10)starts.add(start);
    for(const start of starts){const source=archive.window(start,start+rate/10,1),sum=summarizeCapture(source,1000);let dot=0;for(let n=0;n<rate/10;n++)dot+=source.channels[0][n]*source.channels[1][n];for(const channel of sum.channels)if(channel.rms<=0||Math.abs(20*Math.log10(channel.rms/10**(-6/20)))>.05||!channel.fundamentalAmplitude||Math.abs(20*Math.log10(channel.fundamentalAmplitude/(Math.SQRT2*10**(-6/20))))>.05)inputFailures.push('extreme-source');if(dot<=0)inputFailures.push('extreme-source-polarity');}
    const capture=archive.window(m.start,m.end);measured=summarizeCapture(capture);if(sha(captureBytes(capture))!==c.sha256||!isDeepStrictEqual(JSON.parse(JSON.stringify(measured)),m.summary))failures.push('extreme-capture-mismatch');
    const control=archive.window(m.start,m.end,2);for(let n=0;n<rate;n++)if(control.channels[0][n]!==-1||control.channels[1][n]!==1||control.channels[2][n]!==2||control.channels[4][n]!==0){failures.push('extreme-window-control');break;}
    if(!inputFailures.length){normalizer=assessExtremeNormalizer(archive,facts,target,scalarFrame,rate);fftBuffer=assessFftBufferWitness(fftBytes,proof.fftBuffer?.metadata,facts,target,rate);if(!fftBuffer.passed)failures.push('extreme-fft-buffer-'+fftBuffer.bufferPowerConsistency);}
    if(normalizer)failures.push(...normalizer.failures);
  }
  const qualityAssessed=!!normalizer&&!inputFailures.length&&!failures.some(v=>!['extreme-N-scalar','extreme-headroom'].includes(v));
  if(qualityAssessed)for(const row of measured.channels)if(row.peak>.9801||row.overFullScaleSamples!==0)failures.push('extreme-ceiling');
  return {passed:!failures.length&&!inputFailures.length,qualityAssessed,inputFailures,failures:[...new Set([...inputFailures,...failures])],measurement:measured,headroom:normalizer?.headroom??null,normalizer,fftBuffer,native3Witness:'UNASSESSED',native7Witness:'UNASSESSED',native8Witness:'UNASSESSED',overallQualification:false};
}

export function productOutputFailures(archive){
  const summary=archive.summary();if(summary.start===null||summary.end===null)return ['output-missing'];
  const rate=summary.sampleRate;
  const failures=new Set();
  for(let start=summary.start;start<summary.end;start+=rate){
    const end=Math.min(start+rate,summary.end),program=archive.window(start,end),control=archive.window(start,end,2);
    for(let n=0;n<end-start;n++){
      const dry=control.channels[0][n],wet=control.channels[1][n],gain=control.channels[2][n],norm=control.channels[3][n],permit=control.channels[4][n];
      if(Math.abs(dry+wet)>1e-6||wet<0||wet>1||gain<0||gain>2||norm<=0||permit!==0)failures.add('control5-invariant');
      for(const channel of program.channels){if(Math.abs(channel[n])>1)failures.add('whole-fullscale');if(wet===1&&Math.abs(channel[n])>.9801)failures.add('wet-ceiling');}
    }
  }
  return [...failures];
}

// shortcut: owned archive windows only; recheck equivalence if the input caller domain changes.
function summarizeProductInput(data,toneHz){
  return {channels:data.channels.map(samples=>{
    if(!samples?.length)throw new Error('samples required');
    if(!Number.isFinite(data.rate)||data.rate<=0)throw new Error('invalid sample rate');
    let squares=0;
    for(let i=0;i<samples.length;i++){
      const value=samples.at(i);
      if(value===undefined||!Number.isFinite(value))throw new Error('non-finite audio sample');
      squares+=value*value;
    }
    const rms=Math.sqrt(squares/samples.length);
    if(toneHz==null)return {rms,fundamentalAmplitude:null};
    if(!Number.isFinite(toneHz)||toneHz<=0||toneHz>=data.rate/2)throw new Error('invalid tone frequency');
    const cycles=toneHz*samples.length/data.rate;
    if(Math.abs(cycles-Math.round(cycles))>1e-6)return {rms,fundamentalAmplitude:null};
    let sin=0,cos=0;
    for(let i=0;i<samples.length;i++){
      const phase=2*Math.PI*1*toneHz*i/data.rate;
      const sample=samples.at(i);
      sin+=sample*Math.sin(phase);cos+=sample*Math.cos(phase);
    }
    const amplitudeSquared=4*(sin*sin+cos*cos)/(samples.length*samples.length);
    const fundamental=Math.sqrt(amplitudeSquared);
    return {rms,fundamentalAmplitude:fundamental<1e-9?null:fundamental};
  })};
}

export function productInputFailures(archive,actions,frequency=750){
  const summary=archive.summary(),rate=summary.sampleRate;
  const failures=[],wholeFailures=new Set(),expectedRms=10**(-24/20),expectedPeak=Math.SQRT2*expectedRms;
  const check=(start,end,label,whole=false)=>{
    const source=summarizeProductInput(archive.window(start,end,1),frequency);
    for(const [channel,row]of source.channels.entries())if(row.rms<=0||Math.abs(20*Math.log10(row.rms/expectedRms))>.05||row.fundamentalAmplitude===null||row.fundamentalAmplitude<=0||Math.abs(20*Math.log10(row.fundamentalAmplitude/expectedPeak))>.05){
      if(!whole||!wholeFailures.has(channel))failures.push(label+'channel-'+channel);if(whole)wholeFailures.add(channel);
    }
  };
  for(const action of actions)check(action.frame+Math.round(.1*rate),action.frame+Math.round(.14*rate),action.name+'/input-');
  const width=Math.round(.04*rate),stride=width/2;
  if(summary.start===null||summary.end===null||summary.end-summary.start<width)return [...failures,'whole-source/coverage'];
  // Fixed coherent windows measure the whole source; they do not establish an absolute phase origin.
  for(let start=summary.start;;start=Math.min(start+stride,summary.end-width)){
    check(start,start+width,'whole-source/'+start+'/',true);
    if(start===summary.end-width)break;
  }
  return failures;
}

export function productSignalFailures(facts,rate,frequency=750,inputDbfs=-24){
  const signal=facts?.signal,video=facts?.video;
  return signal?.frequency===frequency&&signal.inputDbfs===inputDbfs&&signal.phase===.37&&signal.channels===2&&signal.durationSeconds===scenarioTimeoutMs/1000&&signal.frames===rate*scenarioTimeoutMs/1000&&signal.loop===false&&signal.error===''&&
    video?.muted===false&&video.volume===1&&video.loop===false&&video.ended===false&&video.paused===false&&video.playbackRate===1&&Number.isFinite(video.currentTime)&&video.currentTime>=0&&video.currentTime<signal.durationSeconds?[]:['input-signal-state'];
}

/** Original eight-step sequence; default R1 stays fixed at 750 Hz. */
export async function runProductAudioScenario({context,worker,extensionId,artifactPath},files,candidate,rate=44100,spec=null,masterWitness=false){
  const outputControl=spec===null?null:PRODUCT_OUTPUT_CONTROL_CASES.find(c=>isDeepStrictEqual(c,spec)),selected=outputControl??(spec===null?null:PRODUCT_TRANSITION_CASES.find(c=>isDeepStrictEqual(c,spec)));
  if(spec!==null&&(!selected||selected.sampleRate!==rate))throw fail('transition-original-spec');
  return runPackagedAudioScenario({context,worker,extensionId,artifactPath},files,candidate,rate,null,false,null,null,null,outputControl?null:selected,outputControl,false,masterWitness);
}

export async function runProductEqualizerScenario(input,files,candidate,spec=EQUALIZER_CASE,componentWitness=false){
  const selected=selectEqualizerCase(spec.id);if(!isDeepStrictEqual(spec,selected))throw fail('equalizer-original-spec');
  if(typeof componentWitness!=='boolean')throw fail('component-profile');
  return runPackagedAudioScenario(input,files,candidate,selected.sampleRate,selected,componentWitness);
}
export async function runProductNormalizerScenario(input,files,candidate,spec=PACKAGED_NORMALIZER_CASE,headroomWitness=false){
  const selected=selectNormalizerCase(spec.id);if(!isDeepStrictEqual(spec,selected))throw fail('normalizer-original-spec');
  if(typeof headroomWitness!=='boolean')throw fail('headroom-profile');
  return runPackagedAudioScenario(input,files,candidate,selected.sampleRate,null,false,selected,null,null,null,null,headroomWitness);
}

export async function runProductNormalizerControlScenario(input,files,candidate,spec){
  const selected=NORMALIZER_CONTROL_CASES.find(c=>isDeepStrictEqual(c,spec));if(!selected)throw fail('normalizer-control-original-spec');
  return runPackagedAudioScenario(input,files,candidate,selected.sampleRate,null,false,null,null,selected);
}

export async function runProductReentryScenario(input,files,candidate,spec=PACKAGED_REENTRY_CASE){
  const selected=PACKAGED_REENTRY_CASES.find(c=>isDeepStrictEqual(c,spec));if(!selected)throw fail('reentry-original-spec');
  assertLiveAudioSource(input.audioEvidenceSource,files);
  return runPackagedAudioScenario(input,files,candidate,selected.sampleRate,null,false,null,selected);
}

async function runPackagedAudioScenario({context,worker,extensionId,artifactPath,firstHostShutdown,audioEvidenceSource},files,candidate,rate,equalizer,componentWitness=false,normalizer=null,reentry=null,normalizerControl=null,transition=null,outputControl=null,headroomWitness=false,masterWitness=false){
  if(typeof masterWitness!=='boolean'||masterWitness&&(equalizer||componentWitness||normalizer||reentry||normalizerControl||outputControl||headroomWitness))throw fail('master-selection');
  const masterStages=[];let masterFirst=null;
  const sharedShutdown=reentry?.id==='96000/reentry/2/10'&&rate===96000&&firstHostShutdown?firstHostShutdown:null;
  let scenarioDeadline=null;const originalFiles=files;
  const ordinaryAbort=sharedShutdown?new AbortController():null,recoveryAbort=sharedShutdown?new AbortController():null;
  let firstFailure=null,failureResponse=undefined,recoveryTask=null,rawRecovery=null,rawRecoveryError=null,rendererCloseTask=null,rendererCloseError=null,failedAssessment=null;
  let observedPage,collecting=false;
  const errorText=cause=>{try{return String(cause);}catch{return 'unprintable-error';}};
  const recordSecondary=cause=>{try{sharedShutdown?.recordSecondary(cause);}catch{/* Keep FIRST if the diagnostic channel itself fails. */}};
  const actualPending=new Set(),recoveryClaims=new Set();
  const gate=()=>{if(firstFailure)throw firstFailure.error;};
  const withinIoDeadline=work=>{
    const remaining=Number.isFinite(scenarioDeadline)?Math.floor(scenarioDeadline-performance.now()):0;
    if(remaining<1){const error=new Error('audio-product-scenario-timeout');recordFailure(error);return Promise.reject(error);}
    let timer;
    const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('audio-product-scenario-timeout');recordFailure(error);reject(error);},remaining);});
    let result;
    try{result=work();}catch(error){clearTimeout(timer);recordFailure(error);throw error;}
    return Promise.race([Promise.resolve(result),expired]).finally(()=>clearTimeout(timer));
  };
  const recordFailure=(error,response=failureResponse)=>{
    if(masterWitness)masterFirst??=error;
    if(!sharedShutdown)return;
    if(firstFailure){if(!Object.is(error,firstFailure.error))recordSecondary(error);return;}
    const selected={error,status:'UNFORMED',reason:'native-seal-not-implemented',response:null,responseAvailable:false,pending:null,snapshotError:null,observerError:null};
    firstFailure=selected;collecting=false;
    const observedAt=performance.now();
    try{selected.shutdown=sharedShutdown.recordFirst(error);}catch(cause){selected.observerError=errorText(cause);}
    try{selected.pending=[...actualPending].map(token=>({name:token.name,state:token.state}));const snapshot=sharedShutdown.hostStorage.captureFirst(error,response,response!==undefined);selected.response=snapshot.response;selected.responseAvailable=snapshot.available;selected.snapshotError=snapshot.snapshotError;}catch(cause){selected.snapshotError=errorText(cause);}
    try{ordinaryAbort.abort(error);}catch(cause){selected.observerError??=errorText(cause);}
    try{sharedShutdown.recordFailureState({responseAvailable:selected.responseAvailable,pending:selected.pending,snapshotError:selected.snapshotError,observerError:selected.observerError});}catch(cause){recordSecondary(cause);}
    if(selected.snapshotError)recordSecondary(new Error('first-response-snapshot:'+selected.snapshotError));
    if(selected.observerError)recordSecondary(new Error('first-observer:'+selected.observerError));
    let finishRecovery;
    recoveryTask=new Promise(resolve=>{finishRecovery=resolve;});
    queueMicrotask(()=>{
      const recover=async()=>{
        const firstAt=Number.isFinite(selected.shutdown?.firstAt)?selected.shutdown.firstAt:observedAt;
        const by=Number.isFinite(scenarioDeadline)?Math.min(scenarioDeadline,firstAt+2000):0,remaining=Math.floor(by-performance.now());
        if(!observedPage||remaining<1){rawRecoveryError='raw-recovery-unavailable-before-deadline';return;}
        try{
          const raw=await audioOperation('product-failed-rings',()=>{
            if(performance.now()>=by)throw new Error('audio-product-raw-recovery-deadline');
            return observedPage.evaluate(callProcessingProbe,{kind:'l1-partial'});
          },Math.min(2000,remaining));
          if(performance.now()>=by)throw new Error('audio-product-raw-recovery-deadline');
          rawRecovery=raw;
        }catch(cause){rawRecoveryError=errorText(cause);}
      };
      const done=()=>{
        try{rendererCloseTask=Promise.resolve(sharedShutdown.rendererDone());rendererCloseTask.catch(cause=>{rendererCloseError=errorText(cause);});}
        catch(cause){rendererCloseError=errorText(cause);}
        finishRecovery();
      };
      recover().then(done,cause=>{rawRecoveryError=errorText(cause);done();});
    });
  };
  const fail=(code,response=failureResponse)=>{const error=new Error('audio-product-'+code);recordFailure(error,response);return error;};
  const observeSync=(response,work)=>{
    if(!sharedShutdown)return work();
    gate();const previous=failureResponse;failureResponse=response;
    try{return work();}catch(error){recordFailure(error,response);throw error;}finally{failureResponse=previous;}
  };
  if(sharedShutdown){
    const control=()=>Object.freeze({deadline:scenarioDeadline,signal:ordinaryAbort.signal,onFailure:recordFailure});
    const io=(name,work)=>{
      gate();const token={name,state:'QUEUED'};
      return withinIoDeadline(()=>{
        gate();token.state='RUNNING';actualPending.add(token);
        let result;
        try{result=work();}catch(error){token.state='REJECTED';actualPending.delete(token);recordFailure(error);throw error;}
        return Promise.resolve(result).then(value=>{token.state='FULFILLED';actualPending.delete(token);gate();return value;},error=>{token.state='REJECTED';actualPending.delete(token);recordFailure(error);throw error;});
      });
    };
    files={...originalFiles,readFile:(relative,options)=>io('read:'+relative,()=>originalFiles.readFile(relative,options,control())),writeFile:(relative,data,options)=>io('write:'+relative,()=>sharedShutdown.hostStorage.writeFile(relative,data,options,control()))};
  }
  const normalizerProfile=normalizer??reentry??(normalizerControl?normalizerControlSourceSpec(normalizerControl):null);let reentryStage='warmup',controlRestoreAttempted=false;
  const sourceStartWitness=reentry?.id==='44100/reentry/2/25';
  // First segment, retained failure rings, and last raw capture on failure.
  const sourceStartReserve=sourceStartWitness?3*sourceStartLimitBytes:0;
  let sourceStartReceipt=null;
  const signalControl=normalizerControl&&isNormalizerSignalControl(normalizerControl);
  const dry=PRODUCT_DRY_CASES.includes(outputControl),extreme=PRODUCT_EXTREME_CASES.includes(outputControl),outputProfile=extreme?'extreme':dry?'dry':'wet-peak';if(extreme)headroomWitness=true;
  const cold=outputControl?!dry&&!extreme:equalizer?isColdEqualizerCase(equalizer):false;
  const directory=path.relative(files.root,artifactPath).split(path.sep).join('/'),archive=createProductArchive(files,directory,rate,outputControl?outputProfile:normalizerControl?'normalizer-control':componentWitness?'equalizer-component':'legacy',sharedShutdown?{onFailure:recordFailure,stopped:()=>firstFailure!==null,error:()=>firstFailure?.error}:undefined),actions=[],errors=[],checkpoints=[];
  const json=value=>JSON.stringify(value,null,2)+'\n';
  const save=(name,value)=>{if(value?.collectionTiming&&Buffer.byteLength(JSON.stringify({collectionTiming:value.collectionTiming},null,2))>8192)throw fail('collection-timing-bound');return files.writeFile(directory+'/'+name,json(value),{flag:'wx'});};
  const saveRecovery=(name,value)=>{
    if(!firstFailure||!['assessment.json','product-partial.json','partial.json'].includes(name)||recoveryClaims.has(name))throw new Error('audio-product-recovery-write-invalid');
    recoveryClaims.add(name);
    return withinIoDeadline(()=>sharedShutdown.hostStorage.writeFile(directory+'/'+name,json(value),{flag:'wx'},{deadline:scenarioDeadline,signal:recoveryAbort.signal,onFailure:recordFailure}));
  };
  const retainedSignal=normalizerControl?.id==='44100/normalizer-control/tone-silence';
  let warmupFailure;
  const timedCollection=normalizerControl?.id==='44100/normalizer-control/tone-silence';
  const metric=()=>({count:0,totalMs:0,maxMs:0,maxBatch:null});
  const timing=timedCollection?{schema:'f01-collection-timing-v1',caseId:normalizerControl.id,sealed:false,attribution:'UNASSESSED',
    phases:Object.fromEntries(['collectorFacts','waitFacts','otherFacts','capture','append','yield','idle','waitPause'].map(name=>[name,{completed:0,failed:0,totalMs:0,maxMs:0,maxBatch:null,pending:null,lastMs:null}])),
    batches:{completed:0,browser:metric(),browserPcm:metric(),browserEncode:metric(),browserRemainder:metric(),evaluate:metric(),append:metric()},pendingBatch:null,responseBytes:0,reservedSummaryBytes:4*8192}:null;
  let timingFrozen=null,timingFailure=null;
  const timingReserve=()=>timing?timing.reservedSummaryBytes+timing.responseBytes:0;
  const elapsed=start=>{const ms=performance.now()-start;if(!Number.isFinite(ms)||ms<0||ms>scenarioTimeoutMs)throw fail('collection-timing-clock');return ms;};
  const addMetric=(row,ms,batch)=>{row.count++;row.totalMs+=ms;if(row.count===1||ms>row.maxMs){row.maxMs=ms;row.maxBatch=batch;}};
  const measure=async(name,work,batch=null)=>{
    if(!timing)return work();
    if(timing.sealed)throw timingFailure??collectorError??fail('collection-timing-sealed');
    const row=timing.phases[name],started=performance.now();row.pending={batch,status:'completion-unknown'};
    try{const value=await work();if(!timing.sealed){const ms=elapsed(started);row.completed++;row.totalMs+=ms;row.lastMs=ms;if(row.completed===1||ms>row.maxMs){row.maxMs=ms;row.maxBatch=batch;}row.pending=null;}return value;}
    catch(error){recordFailure(error);if(!timing.sealed){row.failed++;if(!String(error).includes('audio-operation-timeout:'))row.pending=null;timingFailure=error;freezeTiming();}throw error;}
  };
  const freezeTiming=()=>{
    if(!timing)return null;if(timingFrozen)return timingFrozen;
    timing.sealed=true;timingFrozen=JSON.parse(JSON.stringify(timing));return timingFrozen;
  };

  if(sharedShutdown)scenarioDeadline=sharedShutdown.hostStorage.beginScenario();
  const warmupScenarioDeadline=retainedSignal?performance.now()+scenarioTimeoutMs:0,deadline=Date.now()+scenarioTimeoutMs;const fftPairBytes=extreme?fftBufferPairBytes(rate):0,outputCaptureReserve=outputControl?rate*8+2*fftPairBytes:0,outputStartedAt=outputControl?performance.now():null;let outputRequest=null,outputCaptureBytes=0,outputCapturePending=null,fftOwned=null,fftMetadata=null,firstOnBefore=null,collector,collectorError,lastRaw=null,next=null,target=null,equalizerRequest=null,normalizerRequest=null,reentryRequest=null,headroomFacts=null;
  const signalFailures=facts=>outputControl?productSignalFailures(facts,rate,outputControl.frequency,outputControl.inputDbfs):normalizerProfile?normalizerSignalFailures(facts,normalizerProfile):equalizer?equalizerSignalFailures(facts,equalizer):productSignalFailures(facts,rate,transition?.frequency??750);
  const op=async(name,work,timeout=15000)=>{
    if(sharedShutdown){
      gate();const remaining=Math.floor(scenarioDeadline-performance.now());if(remaining<1)throw fail('scenario-timeout');
      const token={name,state:'QUEUED'};
      const actual=()=>{
        gate();token.state='RUNNING';actualPending.add(token);
        let result;
        try{result=work();}catch(error){token.state='REJECTED';actualPending.delete(token);recordFailure(error);throw error;}
        return Promise.resolve(result).then(value=>{token.state='FULFILLED';actualPending.delete(token);return value;},error=>{token.state='REJECTED';actualPending.delete(token);recordFailure(error);throw error;});
      };
      const result=await audioOperation('product-'+name,actual,Math.min(timeout,remaining),error=>recordFailure(error));
      gate();if(performance.now()>=scenarioDeadline)throw fail('scenario-timeout');return result;
    }
    const remaining=deadline-Date.now();if(remaining<=0)throw fail('scenario-timeout');
    try{const result=await audioOperation('product-'+name,work,Math.min(timeout,remaining));
      if(Date.now()>=deadline)throw fail('scenario-timeout');return result;
    }catch(error){if(masterWitness)masterFirst??=error;throw error;}
  };
  const call=(action,timeout=5000,role='otherFacts')=>action.kind==='facts'?measure(role,()=>op('probe-'+action.kind,()=>observedPage.evaluate(callProcessingProbe,action),timeout)):op('probe-'+action.kind,()=>observedPage.evaluate(callProcessingProbe,action),timeout);
  const configure=async(config={},enabled=true,gain=1,timeout=5000)=>{const result=await call({kind:'configure',config,gain,enabled},timeout);return observeSync(result,()=>{if(result.status!==(enabled?'on':'off'))throw fail('configure-state');return result;});};
  const masterRef=value=>{
    if(!value)return null;
    const initial=typeof value.initial==='object'?value.initial:null;
    return {schema:value.schema,available:value.available,reason:value.reason,sourceEpoch:initial?.sourceEpoch??value.sourceEpoch,
      initial:initial?.initial??value.initial,contextId:initial?.contextId??value.contextId,portId:initial?.portId??value.portId,nodeId:initial?.nodeId??value.nodeId,
      cursor:value.cursor,pending:value.pending,sealed:value.sealed,endFrame:value.endFrame};
  };
  const masterStage=(name,cursor,request,facts,before=null)=>{
    const o=facts.productObservation;
    return {name,cursor,request:{frame:request.frame,status:request.status},commandCount:o.commands.length,replyCount:o.replies.length,
      commandDigest:sha(JSON.stringify(o.commands)),replyDigest:sha(JSON.stringify(o.replies)),reference:masterRef(facts.masterWitness),
      before:before?{commandCount:before.productObservation.commands.length,replyCount:before.productObservation.replies.length,
        commandDigest:sha(JSON.stringify(before.productObservation.commands)),replyDigest:sha(JSON.stringify(before.productObservation.replies))}:null};
  };
  const assertNormalizerLive=facts=>observeSync(facts,()=>{
    if(!normalizerProfile||!target)return;
    if(normalizerControl){assertNormalizerControlLive(facts,normalizerControl);return;}
    if(reentry){
      const events=facts.oracleEvidence?.ledger?.events,r=facts.readback,o=facts.productObservation;
      if(signalFailures(facts).length||facts.hidden!==false||facts.contextState!=='running'||o?.streamError||o?.invalidFrames||facts.sources!==1||o?.sources!==1||o.l1Nodes!==1||!Array.isArray(events)||facts.oracleEvidence.ledger.available!==true||events.some(e=>e.direction==='send'&&(e.packet.kind==='read-error'||e.packet.kind==='power'&&e.packet.active!==true))||
        !isDeepStrictEqual(facts.normalizerSettings,{normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false})||r?.state==='unavailable'||r?.gain!==1||r.sources!==1||reentryStage!=='transition'&&(r.state!=='on'||r.wanted!==true||r.appliedGain!==1)||
        [facts.events,facts.linearEvents,facts.steps].some(rows=>!Array.isArray(rows)||rows.some(e=>e.node===4||e.node===5)))throw fail('reentry-live-state');
      return;
    }
    const o=facts.productObservation,r=facts.readback;
    if(signalFailures(facts).length||facts.hidden!==false||facts.contextState!=='running'||o?.streamError||o?.invalidFrames||facts.sources!==1||o?.sources!==1||o.l1Nodes!==1||r?.state!=='on'||r.wanted!==true||r.sources!==1||r.gain!==1||r.appliedGain!==1||
      facts.analysers!==2||facts.buffers!==2||facts.active100msTimers!==1||!isDeepStrictEqual(facts.normalizerSettings,{normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false})||
      !Array.isArray(facts.meterTickReads)||facts.meterTickReads.some(t=>t.endRead-t.startRead!==2)||!Array.isArray(facts.powerReads)||facts.powerReads.some(p=>!Number.isFinite(p.power)||p.power<0)||
      [facts.events,facts.linearEvents,facts.steps].some(rows=>!Array.isArray(rows)||rows.some(e=>e.node===4||e.node===5)))throw fail('normalizer-live-state');
  });
  const assertExtremeLive=facts=>{
    if(!extreme)return;const o=facts.productObservation,r=facts.readback;
    if(facts.fftBufferWitness?.reason||facts.fftBufferWitness?.routing?.reason)throw fail('fft-routing-unavailable');
    if(facts.audioTime-(o?.replies?.find(p=>p.kind==='prepared')?.frame??0)/rate>20||facts.signal?.pattern!=='stereo'||r?.state==='unavailable'||o?.commands?.length>3||facts.oracleEvidence?.ledger?.available!==true)throw fail('extreme-live-state');
    if(o?.commands?.length===3&&o.replies.some(p=>p.kind==='completed'&&p.seq===o.commands[2].message.seq)){
      if(r?.state!=='on'||r.wanted!==true||r.sources!==1||r.gain!==2||r.appliedGain!==2||facts.compressors!==1||!isDeepStrictEqual(facts.compressorParameters,[{threshold:0,knee:0,ratio:1}])||!isDeepStrictEqual(facts.normalizerSettings,{normalizerEnabled:true,normalizerTargetDbfs:-12,eqEnabled:true,compressorEnabled:true})||facts.analysers!==2||facts.buffers!==2||facts.active100msTimers!==1)throw fail('extreme-live-graph');
    }
  };
  const collect=async(force=false)=>{
    if(sharedShutdown)gate();
    try{
    const batch=retainedSignal?rate:normalizer||normalizerControl||extreme?rate/10:rate;let drainEnd=null,more;
    do{
    const facts=await call({kind:'facts',...(reentry?{fullOracle:true}:{})},5000,'collectorFacts'),state=observeSync(facts,()=>{const value=facts.productObservation;if(!value)throw fail('probe-mode');return value;});
    const skip=observeSync(facts,()=>{
    if(signalFailures(facts).length)throw fail('input-signal-state');
    assertNormalizerLive(facts);assertExtremeLive(facts);
    if(target){if(normalizer||normalizerControl){if(!isDeepStrictEqual(selectNormalizerTarget(facts,normalizerRequest.beforeTarget,normalizerRequest.request,normalizerProfile,headroomWitness),target))throw fail('normalizer-target-changed');}else if(!reentry)assertEqualizerTarget(state,target,equalizer);}
    if(state.sources===0&&next===null)return true;
    if(state.streamError||state.invalidFrames||facts.hidden!==false||facts.contextState!=='running')throw fail('collection-state');
    if(!frame(state.commonStart)||!frame(state.commonEnd)||state.commonEnd<=state.commonStart){if(next!==null)throw fail('collection-span');return true;}
    if(retainedSignal&&!facts.normalizerControl?.frozenAt)return true;
    next??=state.commonStart;if(state.commonStart>next||state.commonEnd<next)throw fail('collection-gap');
    return false;
    });if(skip)return;
    // Recheck live state between N batches without chasing the producer's advancing tail.
    drainEnd??=state.commonEnd;more=false;
    while(drainEnd-next>=batch||force&&drainEnd>next){
      const end=Math.min(next+batch,drainEnd);if(archive.summary().bytes+outputCaptureReserve+sourceStartReserve+timingReserve()+(timing?512:0)+(end-next)*(componentWitness?44:36)>cap)throw fail('archive-cap');
      const batchSpan={start:next,end};
      let pendingSourceStart=null;
      if(timing)timing.pendingBatch={...batchSpan,browserMs:null,pcmMs:null,encodeMs:null,evaluateMs:null,appendMs:null};
      const received=await measure('capture',()=>call({kind:'product-capture',startFrame:next,endFrame:end,...(timing?{timing:true}:{})}),batchSpan);
      if(timing){
        const {collectionTiming:pageTiming,...payload}=received;lastRaw=payload;
        if(timing.sealed)throw timingFailure??collectorError??fail('collection-timing-sealed');
        if(payload.start!==next||payload.end!==end||payload.sampleRate!==rate||!pageTiming||pageTiming.start!==next||pageTiming.end!==end||pageTiming.sampleRate!==rate||!Number.isFinite(pageTiming.elapsedMs)||pageTiming.elapsedMs<0||pageTiming.elapsedMs>scenarioTimeoutMs||!Number.isFinite(pageTiming.pcmMs)||pageTiming.pcmMs<0||!Number.isFinite(pageTiming.encodeMs)||pageTiming.encodeMs<0||pageTiming.pcmMs+pageTiming.encodeMs>pageTiming.elapsedMs||Object.keys(pageTiming).sort().join(',')!=='elapsedMs,encodeMs,end,pcmMs,sampleRate,start'||Buffer.byteLength(JSON.stringify(pageTiming))>256)throw fail('collection-timing');
        timing.responseBytes+=2*Buffer.byteLength(JSON.stringify({collectionTiming:pageTiming}));
        if(archive.summary().bytes+timingReserve()+(end-next)*36>cap)throw fail('archive-cap');
        timing.pendingBatch.browserMs=pageTiming.elapsedMs;timing.pendingBatch.pcmMs=pageTiming.pcmMs;timing.pendingBatch.encodeMs=pageTiming.encodeMs;timing.pendingBatch.evaluateMs=timing.phases.capture.lastMs;
      }else if(sourceStartWitness){
        const {sourceStart,...raw}=received;
        if(sourceStartReceipt===null){pendingSourceStart=bindSourceStartArchive(sourceStart,raw);lastRaw={...raw,sourceStart:pendingSourceStart};}
        else lastRaw=raw;
      }else lastRaw=received;
      if(normalizerControl||extreme){try{await measure('append',()=>op(extreme?'extreme-append':'normalizer-control-append',()=>archive.append(lastRaw),5000),batchSpan);}catch(error){archive.seal();throw error;}}
      else{
        try{await archive.append(lastRaw);}
        catch(error){
          if(pendingSourceStart){
            sourceStartReceipt=pendingSourceStart.status==='FORMED'?markSourceStartUnavailable(pendingSourceStart,'archive-not-stored'):pendingSourceStart;
            lastRaw.sourceStart=sourceStartReceipt;
          }
          throw error;
        }
        if(pendingSourceStart)sourceStartReceipt=pendingSourceStart;
      }
      if(timing&&!timing.sealed){
        const pending=timing.pendingBatch;pending.appendMs=timing.phases.append.lastMs;
        addMetric(timing.batches.browser,pending.browserMs,batchSpan);addMetric(timing.batches.browserPcm,pending.pcmMs,batchSpan);addMetric(timing.batches.browserEncode,pending.encodeMs,batchSpan);addMetric(timing.batches.browserRemainder,pending.browserMs-(pending.pcmMs+pending.encodeMs),batchSpan);addMetric(timing.batches.evaluate,pending.evaluateMs,batchSpan);addMetric(timing.batches.append,pending.appendMs,batchSpan);
        timing.batches.completed++;timing.pendingBatch=null;
      }
      next=end;
      if(normalizer||normalizerControl||extreme){
        await measure('yield',()=>op('batch-yield',()=>new Promise(resolve=>setTimeout(resolve,0)),5000),batchSpan);
        more=drainEnd-next>=batch||force&&drainEnd>next;break;
      }
    }
    }while(more);
    }catch(error){recordFailure(error);throw error;}
  };
  const pause=async(milliseconds,timeout=milliseconds+5000)=>{
    await op('pause-'+milliseconds,()=>observedPage.waitForTimeout(milliseconds),timeout);if(collectorError)throw collectorError;
  };
  let retainedFrozen=null;
  try{
    const html=String(await files.readFile('tests/fixtures/installed-extension/audio-live.html','utf8')).replace(/<script[^>]+src="https:\/\/chzzk.naver.com\/__knife_fixture__\/audio-site.js"[^>]*><\/script>/,'');
    await op('routes',()=>context.route(/^https?:\/\//,route=>route.request().url()==='https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'?route.fulfill({status:200,contentType:'text/html',body:html}):route.abort('blockedbyclient')));
    await op('seed',()=>worker.evaluate(()=>chrome.storage.local.set({config:{audioDefault:false,audioGain:1,gainInherited:false,compressorEnabled:false,eqEnabled:false,normalizerEnabled:false}})));
    observedPage=await op('page',()=>context.newPage());observedPage.setDefaultTimeout(15000);observedPage.on('pageerror',error=>{recordFailure(error);errors.push(error.message);});
    await op('goto',()=>observedPage.goto('https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',{waitUntil:'domcontentloaded'}));await op('front',()=>observedPage.bringToFront());
    await op('ready',()=>observedPage.waitForFunction(()=>{const r=Reflect.get(window,Symbol.for('cheese-knife.runtime.v1'));return r?.ownerProtocol===3&&r.configReady&&r.mediaCurrent()&&r.audio&&document.querySelector('.knife-comp button');}));
    await op('probe',()=>observedPage.evaluate(installProcessingProbe,{sampleRate:rate,productObservation:true,...(masterWitness?{masterWitness:true}:{}),...(componentWitness?{equalizerComponent:true}:{}),...(normalizerProfile||extreme?{oracleEvidence:true,normalizerWitness:true}:{}),...(sourceStartWitness?{sourceStartWitness:true}:{}),...(headroomWitness?{headroomWitness:true}:{}),...(extreme?{fftBufferWitness:true}:{}),...(normalizerControl?{normalizerControl:true,...(signalControl?{normalizerSignal:true,...(retainedSignal?{retainSignal:true}:{})}:{})}:{})}));
    await call({kind:'signal',frequency:outputControl?1000:normalizerProfile?1000:equalizer?equalizer.frequency:transition?.frequency??750,inputDbfs:outputControl?outputControl.inputDbfs:normalizerProfile?normalizerProfile.inputDbfs:equalizer?-40:-24,pattern:outputControl?outputControl.pattern:normalizerProfile?normalizerProfile.pattern:'stereo',phase:signalControl?normalizerControl.phase:.37,durationSeconds:scenarioTimeoutMs/1000});
    await configure({normalizerEnabled:false,eqEnabled:false,compressorEnabled:false},false);
    await call({kind:'video',muted:false,volume:1});
    collecting=true;collector=(async()=>{try{while(collecting){await collect();if(!retainedSignal||collecting)await measure('idle',()=>new Promise(resolve=>setTimeout(resolve,100)));}}catch(error){recordFailure(error);collectorError=error;collecting=false;freezeTiming();}})();
    if(!cold){
    if(transition||masterWitness||dry||extreme)firstOnBefore=await call({kind:'facts'});
    if(dry||extreme)outputRequest={spec:outputControl,scenarioStartedAt:outputStartedAt,stage:'first-on-dispatched',priming:{before:firstOnBefore,milliseconds:1250,start:null,end:null},beforeTarget:null,request:null};
    await op('first-on',()=>observedPage.locator('.knife-comp button').click());
    if(dry)outputRequest.stage='first-on-readback';
    await op('first-on-readback',()=>observedPage.waitForFunction(()=>{const r=Reflect.get(window,Symbol.for('cheese-knife.runtime.v1')),video=document.querySelector('video'),state=video?r?.audio?.getReadback(video):null;return state?.sources===1&&state.state==='on'&&state.wanted===true&&state.appliedGain===1;},null,{timeout:2000}));
    }
    const zero=Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map(f=>['eq'+f,0]));
    if(outputControl){
      if(extreme){outputRequest.stage='baseline-dispatched';outputRequest.baselineRequest=await configure({...zero,normalizerEnabled:false,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false,compressorThreshold:0,compressorKnee:0,compressorRatio:1},true,2);}
      if(dry||extreme){outputRequest.stage='priming-wait';outputRequest.priming.start=performance.now();await pause(1250);outputRequest.priming.end=performance.now();outputRequest.stage='before-target-facts';outputRequest.beforeTarget=await call({kind:'facts'});}
      else outputRequest={spec:outputControl,scenarioStartedAt:outputStartedAt,beforeTarget:await call({kind:'facts'}),request:null};
      if(dry)outputRequest.stage='off-dispatched';
      outputRequest.request=await configure({...Object.fromEntries(Object.keys(zero).map(k=>[k,extreme?6:0])),normalizerEnabled:extreme,...(extreme?{normalizerTargetDbfs:-12}:{}),eqEnabled:extreme,compressorEnabled:extreme,compressorThreshold:0,compressorKnee:0,compressorRatio:1},!dry,outputControl.gain);
      if(dry)outputRequest.stage='off-settling';
      outputRequest.settling={milliseconds:extreme?9500:1250,start:performance.now()};await pause(outputRequest.settling.milliseconds);outputRequest.settling.end=performance.now();
      const calledAt=performance.now(),raw=await call({kind:'capture',seconds:1}),returnedAt=performance.now(),capture=validateProcessingCapture(raw);
      if(capture.rate!==rate||capture.end-capture.start!==rate)throw fail(outputProfile+'-capture');
      const bytes=captureBytes(capture);outputCaptureBytes=bytes.length;outputCapturePending=bytes;
      outputRequest.capture={file:directory+'/'+outputProfile+'-capture.f32le',bytes:bytes.length,sha256:sha(bytes),calledAt,returnedAt,writeStatus:'dispatched; completion unknown'};
      outputRequest.measurement={start:capture.start,end:capture.end,summary:summarizeCapture(capture)};
      if(archive.summary().bytes+outputCaptureBytes>cap)throw fail('archive-cap');
      if(extreme){outputRequest.stage='scalar-query';outputRequest.scalarQuery={calledAt:performance.now(),returnedAt:null,frame:null};outputRequest.captureAfter=await call({kind:'facts',fullOracle:true});headroomFacts=outputRequest.captureAfter;outputRequest.scalarQuery.returnedAt=performance.now();outputRequest.scalarQuery.frame=Math.round(outputRequest.captureAfter.audioTime*rate);outputRequest.stage='capture-save';}
      if(extreme){
        outputRequest.stage='fft-buffer-fetch';const raw=await call({kind:'fft-buffer'}),{base64,...metadata}=raw;fftMetadata=metadata;
        if(typeof base64!=='string'||base64.length>Math.ceil(fftPairBytes/3)*4)throw fail('fft-buffer-bytes');const decoded=Buffer.from(base64,'base64');if(decoded.toString('base64')!==base64||decoded.length>fftPairBytes)throw fail('fft-buffer-bytes');fftOwned=decoded;
        outputRequest.fftBuffer={file:directory+'/extreme-fft-buffer.f32le',bytes:fftOwned.length,sha256:sha(fftOwned),metadata,writeStatus:'dispatched; completion unknown'};
        if(metadata.status!=='CAPTURED'||metadata.bytes!==fftPairBytes||fftOwned.length!==fftPairBytes)throw fail('fft-buffer-unavailable');
        outputRequest.stage='fft-buffer-save';await op('fft-buffer-save',()=>files.writeFile(outputRequest.fftBuffer.file,fftOwned,{flag:'wx'}),5000);outputRequest.fftBuffer.writeStatus='completed';outputRequest.stage='capture-save';
      }
      await op(outputProfile+'-capture-save',()=>files.writeFile(outputRequest.capture.file,bytes,{flag:'wx'}));outputCapturePending=null;outputRequest.capture.writeStatus='completed';
      if(collectorError)throw collectorError;if(!extreme)outputRequest.captureAfter=await call({kind:'facts'});
      await op(outputProfile+'-target-save',()=>save(outputProfile+'-target.json',outputRequest));
      for(;;){const current=await call({kind:'facts'});assertExtremeLive(current);if(extreme&&current.audioTime-(current.productObservation.replies.find(r=>r.kind==='prepared')?.frame??0)/rate>20)throw fail('extreme-history-bound');if(current.productObservation.commonEnd>=capture.end&&(!extreme||current.productObservation.meterDiagnostics?.lastFrame>=outputRequest.scalarQuery.frame&&current.productObservation.commonEnd>current.productObservation.meterDiagnostics.lastFrame))break;await pause(extreme?10:100);}
    }else if(equalizer){
      const beforeTarget=await call({kind:'facts'}),cursor=beforeTarget.productObservation?.commands?.length;
      if(!frame(cursor))throw fail('equalizer-command-cursor');
      equalizerRequest={beforeTarget,cursor,request:null};
      assertEqualizerBaseline(beforeTarget,equalizer,componentWitness);
      const [eq63,eq125,eq250,eq500,eq1000,eq2000,eq4000,eq8000]=equalizer.levels;
      const coldAckDeadline=cold?Math.min(deadline,Date.now()+2000):null;
      const configureBudget=coldAckDeadline===null?5000:coldAckDeadline-Date.now();
      if(configureBudget<=0)throw fail('equalizer-ack-timeout');
      const request=await configure({eq63,eq125,eq250,eq500,eq1000,eq2000,eq4000,eq8000,eqEnabled:true,normalizerEnabled:false,compressorEnabled:false,normalizerTargetDbfs:-20},true,equalizer.masterGain,configureBudget);
      equalizerRequest.request=request;
      const ackDeadline=coldAckDeadline??Math.min(deadline,Date.now()+2000);
      if(Date.now()>=ackDeadline)throw fail('equalizer-ack-timeout');
      assertEqualizerRequest(beforeTarget,request,equalizer);
      for(let attempt=0;attempt<200;attempt++){
        const remaining=ackDeadline-Date.now();if(remaining<=0)break;
        const facts=await op('equalizer-ack',()=>observedPage.evaluate(callProcessingProbe,{kind:'facts'}),remaining);
        if(Date.now()>=ackDeadline)throw fail('equalizer-ack-timeout');
        target=selectEqualizerTarget(facts.productObservation,cursor,request.frame,equalizer);if(target)break;
        await op('equalizer-ack-tick',()=>observedPage.waitForTimeout(10),Math.max(1,ackDeadline-Date.now()));
      }
      if(!target)throw fail('equalizer-ack-timeout');
      await op('equalizer-target-save',()=>save('equalizer-target.json',{spec:equalizer,beforeTarget,request,target}));
      for(;;){
        await pause(100);
        const current=await call({kind:'facts'});assertEqualizerTarget(current.productObservation,target,equalizer);
        if(frame(current.productObservation.commonEnd)&&current.productObservation.commonEnd>=target.end)break;
      }
    }else if(normalizerProfile){
      const beforeTarget=await call({kind:'facts'}),request=await configure({...zero,normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false},true,1);
      normalizerRequest={...(headroomWitness?{headroomWitness:true}:{}),spec:normalizerControl??normalizer,beforeTarget,request,target:null,measurement:null};
      const ackDeadline=Math.min(deadline,Date.now()+2000);
      for(let attempt=0;attempt<200;attempt++){
        const current=await call({kind:'facts'},Math.max(1,ackDeadline-Date.now()));if(Date.now()>=ackDeadline)throw fail('normalizer-ack-timeout');
        target=observeSync(current,()=>selectNormalizerTarget(current,beforeTarget,request,normalizerProfile,headroomWitness));if(target)break;await pause(10);
      }
      if(!target)throw fail('normalizer-ack-timeout');normalizerRequest.target=target;
      if(signalControl){
        normalizerRequest.measurement=await call({kind:'reset-events'});
        const prepared=beforeTarget.productObservation.replies.find(r=>r.kind==='prepared'),m=normalizerRequest.measurement,end=m?.frame+normalizerControl.seconds*rate;
        if(!frame(m?.frame)||!frame(prepared?.frame)||m.frame<target.completed.frame||!frame(end)||end>prepared.frame+20*rate)throw fail('normalizer-control-history-bound');
        normalizerRequest.events=[];normalizerRequest.signalWindow={start:m.frame,end};
        if(Buffer.byteLength(JSON.stringify(normalizerRequest))>1048576)throw fail('normalizer-control-proof-bound');
        if(retainedSignal&&(timingFailure??collectorError))throw timingFailure??collectorError;
        await op('normalizer-control-target-save',()=>save('normalizer-control-target.json',normalizerRequest));
        if(retainedSignal){
          collecting=false;
          await collector;
          if(collectorError)throw collectorError;
          let freezeDeadline=null;
          while(!retainedFrozen){
            const started=Date.now(),pollDeadline=Math.min(started+2000,freezeDeadline??Infinity),remaining=pollDeadline-started;
            if(remaining<=0)throw fail('normalizer-signal-freeze-timeout');
            const current=await measure('waitFacts',()=>call({kind:'freeze-normalizer',endFrame:end,waitForReady:true},remaining));
            if(Date.now()>=pollDeadline)throw fail('normalizer-signal-freeze-timeout');
            assertNormalizerLive(current);
            if(!isDeepStrictEqual(selectNormalizerTarget(current,beforeTarget,request,normalizerProfile,headroomWitness),target))throw fail('normalizer-target-changed');
            const {frozenAt,signalEndFrame}=current.normalizerControl;
            if(frozenAt){
              if(signalEndFrame!==end||!frame(frozenAt.frame)||frozenAt.frame<end||frozenAt.frame>prepared.frame+20*rate||current.audioTime!==frozenAt.time)throw fail('normalizer-signal-freeze-receipt');
              retainedFrozen=current;
              break;
            }
            if(freezeDeadline===null&&current.productObservation.commonEnd>=end)freezeDeadline=Math.min(deadline,Date.now()+2000);
            if(freezeDeadline===null)await measure('waitPause',()=>pause(100));
            else{
              const pauseBudget=freezeDeadline-Date.now();
              if(pauseBudget<=0)throw fail('normalizer-signal-freeze-timeout');
              await measure('waitPause',()=>pause(Math.min(10,pauseBudget),pauseBudget));
            }
          }
        }else{
          for(;;){const current=await call({kind:'facts'},5000,'waitFacts');assertNormalizerLive(current);if(current.productObservation.commonEnd>=end)break;await measure('waitPause',()=>pause(100));}
        }
      }else if(normalizerControl){
        normalizerRequest.measurement=await call({kind:'reset-events'});
        const prepared=beforeTarget.productObservation.replies.find(r=>r.kind==='prepared'),m=normalizerRequest.measurement,minimum=normalizerControl.warmupMilliseconds+normalizerControl.stallMilliseconds+normalizerControl.resumeMilliseconds+normalizerControl.errorMilliseconds;
        if(!frame(m?.frame)||!frame(prepared?.frame)||m.frame<target.completed.frame||m.frame+minimum*rate/1000>prepared.frame+20*rate)throw fail('normalizer-control-history-bound');
        await pause(normalizerControl.warmupMilliseconds);await call({kind:'stall',milliseconds:normalizerControl.stallMilliseconds});
        await pause(normalizerControl.resumeMilliseconds);await call({kind:'analysis-error',enabled:true});await pause(normalizerControl.errorMilliseconds);
        normalizerRequest.errorObservation=await call({kind:'facts',fullOracle:true});assertNormalizerLive(normalizerRequest.errorObservation);
        controlRestoreAttempted=true;await audioOperation('normalizer-control-restore',()=>observedPage.evaluate(callProcessingProbe,{kind:'analysis-error',enabled:false}),5000);
        const current=await call({kind:'facts',fullOracle:true});normalizerRequest.events=current.normalizerControl.events;
        if(Buffer.byteLength(JSON.stringify(normalizerRequest))>1048576)throw fail('normalizer-control-proof-bound');
        await op('normalizer-control-target-save',()=>save('normalizer-control-target.json',normalizerRequest));
        const end=current.normalizerControl.events[1]?.at.frame+normalizerControl.errorMilliseconds*rate/1000;
        if(!frame(end)||end>prepared.frame+20*rate)throw fail('normalizer-control-history-bound');
        for(;;){const current=await call({kind:'facts'});assertNormalizerLive(current);if(current.productObservation.commonEnd>=end)break;await pause(10);}
      }else if(reentry){
        const runId=/^output\/playwright\/installed-extension-([A-Za-z0-9]{1,64})$/.exec(directory)?.[1];
        if(!runId)throw fail('reentry-artifact-run');
        reentryRequest={runId,source:audioEvidenceSource,spec:reentry,beforeTarget,request,target,warmupMeasurement:null,warmupFacts:null,boundary:null,measurement:null};
        const prepared=beforeTarget.productObservation.replies.find(r=>r.kind==='prepared'),minimumTail=(reentry.startPhaseMs+reentry.milliseconds+reentry.afterMilliseconds)*rate/1000;
        const minimumFrame=target.completed.frame+reentry.warmupMilliseconds*rate/1000;
        if(!frame(prepared?.frame)||!frame(minimumFrame)||minimumFrame+minimumTail>prepared.frame+20*rate)throw fail('reentry-history-bound');
        const warmupBy=performance.now()+reentry.warmupMilliseconds+5000;
        const warmupRemaining=()=>{
          if(collectorError)throw collectorError;
          const remaining=Math.floor(warmupBy-performance.now());
          if(remaining<1)throw fail('reentry-warmup-deadline');
          return remaining;
        };
        await pause(reentry.warmupMilliseconds);
        for(;;){
          reentryRequest.warmupMeasurement=await call({kind:'reset-events',minimumFrame},Math.min(5000,warmupRemaining()));
          const remaining=warmupRemaining();
          if(reentryRequest.warmupMeasurement!==null)break;
          await pause(Math.min(10,remaining),remaining);
        }
        const marker=reentryRequest.warmupMeasurement;
        if(!frame(marker?.frame)||marker.frame<minimumFrame||marker.sourceEpoch!==target.completed.sourceEpoch||marker.commandSeq!==target.completed.seq)throw fail('reentry-warmup-marker',marker);
        const warmed=await call({kind:'facts',fullOracle:true});
        reentryRequest.warmupFacts=warmed;
        if(collectorError)throw collectorError;
        assertNormalizerLive(warmed);
        const latest=Math.round(warmed.audioTime*rate);
        if(!isDeepStrictEqual(marker,warmed.normalizerMeasurement)||!frame(latest)||marker.frame>latest)throw fail('reentry-warmup-marker',warmed);
        if(latest+minimumTail>prepared.frame+20*rate)throw fail('reentry-history-bound',warmed);
        reentryStage='transition';reentryRequest.boundary=await call({kind:'rapid-master',startPhaseMs:reentry.startPhaseMs,milliseconds:reentry.milliseconds});
        await pause(reentry.afterMilliseconds);reentryStage='tail';
        const tailBy=performance.now()+5000;
        const tailRemaining=()=>{
          if(collectorError)throw collectorError;
          const remaining=Math.floor(tailBy-performance.now());
          if(remaining<1)throw fail('reentry-tail-deadline');
          return remaining;
        };
        for(;;){
          const marker=await call({kind:'reset-events',tail:true},tailRemaining());
          const remaining=tailRemaining();
          if(marker!==null){
            if(!frame(marker?.frame)||marker.frame>prepared.frame+20*rate)throw fail('reentry-history-bound',marker);
            reentryRequest.measurement=marker;
            break;
          }
          await pause(Math.min(10,remaining),remaining);
        }
        await op('reentry-target-save',()=>save('reentry-target.json',reentryRequest));
        for(;;){const current=await call({kind:'facts',fullOracle:true});assertNormalizerLive(current);if(current.productObservation.commonEnd>=reentryRequest.measurement.frame)break;await pause(10);}
      }else{
      const measurement=await call({kind:'reset-events'});normalizerRequest.measurement=measurement;
      const prepared=beforeTarget.productObservation.replies.find(r=>r.kind==='prepared'),end=measurement?.frame+normalizer.seconds*rate;
      if(!frame(measurement?.frame)||!frame(prepared?.frame)||measurement.frame<target.completed.frame||end>prepared.frame+20*rate)throw fail('normalizer-history-bound');
      await op('normalizer-target-save',()=>save('normalizer-target.json',normalizerRequest));
      for(;;){await pause(100);const current=await call({kind:'facts'});assertNormalizerLive(current);if(!isDeepStrictEqual(selectNormalizerTarget(current,beforeTarget,request,normalizer,headroomWitness),target))throw fail('normalizer-target-changed');if(current.productObservation.commonEnd>=end&&(!headroomWitness||current.productObservation.meterDiagnostics?.lastFrame>=end))break;}
      }
    }else{
    await configure({...zero,normalizerEnabled:false,eqEnabled:false,compressorEnabled:false});await pause(1300);
    const coldFacts=await call({kind:'facts'});
    checkpoints.push({name:transition?'cold-zero-on':'cold750-zero-on',...(transition?{before:firstOnBefore,cursor:0,request:{control:'button-click',frame:Math.round(firstOnBefore.audioTime*rate)}}:{}),facts:coldFacts});
    if(masterWitness)masterStages.push(masterStage('cold',0,{frame:Math.round(firstOnBefore.audioTime*rate),status:'on'},coldFacts,firstOnBefore));
    const steps=[['eq-on',{eq1000:6,eqEnabled:true},true],['eq-off',{eqEnabled:false},true],['compressor-on',{compressorEnabled:true},true],['compressor-off',{compressorEnabled:false},true],
      ['normalizer-on',{normalizerEnabled:true,normalizerTargetDbfs:-20},true],['normalizer-off',{normalizerEnabled:false},true],['master-off',{},false],['master-on',{},true]];
    for(const [name,config,enabled]of steps){
      if(name==='master-off'){
        const mixed=Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map((f,i)=>['eq'+f,[3,-3,6,-6,2,-2,4,-4][i]]));
        const before=transition||masterWitness?await call({kind:'facts'}):null,cursor=before?.productObservation.commands.length??null;
        const request=await configure({...mixed,eqEnabled:true,normalizerEnabled:true,compressorEnabled:true});await pause(7000);
        if(transition||masterWitness){const facts=await call({kind:'facts'});if(transition)checkpoints.push({name:'mixed-before-master',cursor,request,facts});
          if(masterWitness)masterStages.push(masterStage('mixed',cursor,request,facts,before));}
      }
      const masterBefore=transition||masterWitness?await call({kind:'facts'}):null,cursor=masterBefore?.productObservation.commands.length??null;
      const request=await configure(config,enabled);actions.push({name,frame:request.frame});await pause(300);
      const checkpoint={name,...(transition?{cursor}:{}),request,facts:await call({kind:'facts'})};checkpoints.push(checkpoint);if(masterWitness)masterStages.push(masterStage(name,cursor,request,checkpoint.facts,masterBefore));await save('checkpoint-'+name+'.json',checkpoint);await pause(1500);
    }
    }
    if(!retainedSignal){collecting=false;await collector;if(collectorError)throw collectorError;await collect(true);}
    if(masterWitness)await call({kind:'master-seal',endFrame:archive.summary().end});
    let facts=retainedFrozen??await call({kind:'facts',...(normalizerProfile||extreme?{fullOracle:true}:{})});if(headroomWitness)headroomFacts=facts;
    if(retainedSignal){
      await collect(true);
    }else if(signalControl){
      const freezeDeadline=Math.min(deadline,Date.now()+2000);let frozen=null;
      while(!frozen){
        const remaining=freezeDeadline-Date.now();if(remaining<=0)throw fail('normalizer-signal-freeze-timeout');
        frozen=await call({kind:'freeze-normalizer',endFrame:normalizerRequest.signalWindow.end},remaining);
        if(Date.now()>=freezeDeadline)throw fail('normalizer-signal-freeze-timeout');
        if(!frozen)await pause(10);
      }
      facts=frozen;assertNormalizerLive(facts);await collect(true);
    }else if(normalizerProfile||extreme){
      const settleDeadline=Math.min(deadline,Date.now()+2000);
      assertNormalizerLive(facts);
      while(facts.productObservation.meterDiagnostics.sent!==facts.productObservation.meterDiagnostics.received){
        if(facts.productObservation.streamError||facts.productObservation.invalidFrames||Date.now()>=settleDeadline)throw fail('normalizer-final-ack');
        await pause(10);facts=await call({kind:'facts',fullOracle:true});if(headroomWitness)headroomFacts=facts;assertNormalizerLive(facts);
      }
    }
    assertExtremeLive(facts);
    const observation=facts.productObservation;
    const url=`chrome-extension://${extensionId}/web/audio-transition-worklet.js`,expected=await files.readFile(path.relative(files.root,path.join(candidate.dist,'web/audio-transition-worklet.js')).split(path.sep).join('/'));
    const fetched=Uint8Array.from(await op('module-fetch',()=>worker.evaluate(async url=>{const response=await fetch(url);if(!response.ok)throw Error('product-module-fetch');return Array.from(new Uint8Array(await response.arrayBuffer()));},url)));
    await files.writeFile(directory+'/module-resource.fetched.js',fetched,{flag:'wx'});
    const module={url,expectedSha256:sha(expected),fetchedSha256:sha(fetched),loaded:observation.moduleLoads.includes(url)};await save('module.json',module);
    const inputFailures=[...signalFailures(facts),...(equalizer||normalizerProfile||outputControl?[]:productInputFailures(archive,actions,transition?.frequency??750))],failures=[...inputFailures,...(reentry?[]:productLifecycleFailures(observation,archive.summary().end))];
    if(!module.loaded||module.expectedSha256!==module.fetchedSha256)failures.push('actual-module-bytes');
    if(errors.length)failures.push('page-errors');
    if(facts.readback?.state!==(dry?'off':'on')||facts.readback?.sources!==1||facts.readback?.wanted!==!dry||facts.readback?.appliedGain!==(outputControl?.gain??equalizer?.masterGain??1))failures.push('final-readback');
    if(outputControl){
      const prerequisites=failures.length===0,assessment=extreme?assessProductExtreme(archive,facts,outputRequest,outputControl,fftOwned):assessProductOutputControl(archive,facts,outputRequest,outputControl);failures.push(...assessment.failures);
      const result=JSON.parse(JSON.stringify({schema:extreme?'f01-product-extreme-observation-v3':dry?'f01-product-dry-observation-v1':'f01-product-wet-peak-observation-v1',scope:outputControl.id,spec:outputControl,passed:!failures.length,outcome:assessment.inputFailures.length?'INCONCLUSIVE':failures.length?'FAIL':'PASS',qualityAssessed:prerequisites&&assessment.qualityAssessed,failures,[extreme?'extreme':dry?'dry':'wetPeak']:assessment,measurement:outputRequest.measurement,extraEvidenceBytes:outputCaptureBytes+(fftOwned?.length??0),archive:archive.summary(),facts,module,pageErrors:errors,...(extreme?{native3Witness:'UNASSESSED'}:{}),native7Witness:'UNASSESSED',native8Witness:'UNASSESSED',overallQualification:false}));
      await op('assessment-save',()=>save('assessment.json',result));if(failures.length)throw fail('quality-or-observation-failed');return {audioProduct:result,pageErrors:errors};
    }
    if(reentry){
      const prerequisites=failures.length===0,assessment=observeSync(facts,()=>assessPackagedReentry(archive,facts,reentryRequest,reentry));failures.push(...assessment.failures);
      const sourceInvalid=inputFailures.length>0||assessment.failures.some(f=>f.startsWith('source-'));
      const passed=failures.length===0&&assessment.passed;
      const result=JSON.parse(JSON.stringify({schema:'f01-product-reentry-observation-v3',runId:reentryRequest.runId,source:reentryRequest.source,scope:reentry.id,spec:reentry,passed,outcome:sourceInvalid?'INCONCLUSIVE':failures.length?'FAIL':assessment.outcome,qualityAssessed:prerequisites&&!sourceInvalid,failures,reentry:assessment,target,measurement:reentryRequest.measurement,archive:archive.summary(),facts,module,pageErrors:errors}));
      if(sharedShutdown&&!passed){failedAssessment=result;throw observeSync(facts,()=>fail('quality-or-observation-failed'));}
      await op('assessment-save',()=>save('assessment.json',result));if(!passed)throw fail('quality-or-observation-failed');if(sharedShutdown)gate();return {audioProduct:result,pageErrors:errors};
    }
    if(normalizerControl){
      const assessment=assessPackagedNormalizerControl(archive,facts,normalizerRequest,normalizerControl);failures.push(...assessment.failures);
      const sourceInvalid=inputFailures.length>0||assessment.failures.some(f=>f.startsWith('source-'));
      const result=JSON.parse(JSON.stringify({...(timing?{collectionTiming:freezeTiming()}:{}),schema:'f01-product-normalizer-control-observation-v1',scope:normalizerControl.id,spec:normalizerControl,passed:failures.length===0,outcome:sourceInvalid?'INCONCLUSIVE':failures.length?'FAIL':'PASS',controlAssessed:!sourceInvalid,qualityAssessed:false,failures,control:assessment,target,measurement:normalizerRequest.measurement,archive:archive.summary(),facts,module,pageErrors:errors}));
      await op('assessment-save',()=>save('assessment.json',result));
      if(failures.length){
        const cause=fail('control-or-observation-failed');
        if(normalizerControl.id===WARMUP_CASE&&result.outcome==='FAIL'&&failures.includes('normalizer-control-fft-source')&&
          result.facts.retainedAnalyserProof?.firstError===null&&result.facts.retainedAnalyserProof.cutoffFrame===result.facts.normalizerControl?.frozenAt?.frame)
          warmupFailure={cause,report:result};
        throw cause;
      }
      return {audioProduct:result,pageErrors:errors};
    }
    if(normalizer){
      const prerequisites=failures.length===0,assessment=assessPackagedNormalizer(archive,facts,normalizerRequest,normalizer,headroomWitness);failures.push(...assessment.failures);
      const sourceInvalid=inputFailures.length>0||assessment.failures.some(f=>f.startsWith('source-'));
      const result=JSON.parse(JSON.stringify({schema:headroomWitness?'f01-product-normalizer-headroom-observation-v1':'f01-product-normalizer-observation-v1',scope:normalizer.id,spec:normalizer,passed:failures.length===0,outcome:sourceInvalid?'INCONCLUSIVE':failures.length?'FAIL':'PASS',qualityAssessed:prerequisites&&!sourceInvalid,failures,normalizer:assessment,target,measurement:normalizerRequest.measurement,archive:archive.summary(),facts,module,pageErrors:errors}));
      await op('assessment-save',()=>save('assessment.json',result));if(failures.length)throw fail('quality-or-observation-failed');return {audioProduct:result,pageErrors:errors};
    }
    if(equalizer){
      assertEqualizerReadback(facts,equalizer);
      const prerequisites=failures.length===0;
      const assessment=assessPackagedEqualizer(archive,facts,target,equalizer,componentWitness);
      failures.push(...assessment.failures);
      const sourceInvalid=inputFailures.length>0||assessment.failures.some(f=>f.startsWith('source-')||f==='identity-or-stream-formation');
      // Persisted JSON is the comparison authority, including normalization of signed zero.
      const result=JSON.parse(JSON.stringify({schema:componentWitness?'f01-product-eq-observation-v2':'f01-product-eq-observation-v1',...(componentWitness?{componentWitness:true}:{}),scope:equalizer.id,spec:equalizer,passed:failures.length===0,outcome:sourceInvalid?'INCONCLUSIVE':failures.length?'FAIL':'PASS',qualityAssessed:prerequisites&&assessment.failures.every(f=>f.startsWith('output-')||componentWitness&&f.startsWith('component-')),failures,equalizer:assessment,target,archive:archive.summary(),facts,module,pageErrors:errors}));
      await op('assessment-save',()=>save('assessment.json',result));if(failures.length)throw fail('quality-or-observation-failed');return {audioProduct:result,pageErrors:errors};
    }
    if(transition)failures.push(...productTransitionTargetFailures({facts,checkpoints,actions,archive:archive.summary()},transition));
    const qualityAssessed=failures.length===0,transitions=qualityAssessed?assessProductTransitions(archive,actions):[];
    if(qualityAssessed)failures.push(...productOutputFailures(archive),...transitions.flatMap(row=>row.failures.map(f=>row.name+'/'+f)));
    const outcome=inputFailures.length?'INCONCLUSIVE':failures.length?'FAIL':'PASS';
    const result={schema:transition?'f01-product-transition-observation-v1':'f01-product-observation-v2',scope:transition?.id??`current-packaged-${rate}-750-eight-step-sequence`,...(transition?{spec:transition,nativeComplementaryWitness:'UNASSESSED',overallQualification:false}:{}),passed:failures.length===0,outcome,qualityAssessed,failures,transitions,archive:archive.summary(),facts,checkpoints,actions,module,pageErrors:errors,...(masterWitness?{masterWitnessRequested:true,masterStages}:{}),
      inputValidation:{start:archive.summary().start,end:archive.summary().end,windowFrames:Math.round(.04*rate),strideFrames:Math.round(.02*rate),windows:Math.ceil((archive.summary().end-archive.summary().start-.04*rate)/(.02*rate))+1,tail:'last full window overlaps final remainder',absolutePhaseProven:false},
      collection:'all program2/source2/control5 frames across declared archive; configure/retire lifecycle replies; meter diagnostics, not full meter packets',controls:'ephemeral MAIN test controls; no settings or storage authority claim'};
    if(masterWitness){
      const check=()=>{if(Date.now()>=deadline)throw fail('master-assessment-timeout');};
      result.masterComplementary=assessMasterComplementary(archive,result,{check});
      if(result.masterComplementary.status!=='CALL_MODEL_MATCH')failures.push('master-witness-unformed');
      result.passed=failures.length===0;result.outcome=inputFailures.length?'INCONCLUSIVE':failures.length?'FAIL':'PASS';
      if(failures.length)recordFailure(fail('quality-or-observation-failed'));
    }
    await op('assessment-save',()=>save('assessment.json',result));if(failures.length)throw masterFirst??fail('quality-or-observation-failed');return {audioProduct:result,pageErrors:errors};
  }catch(error){
    if(sharedShutdown){
      recordFailure(error);
      const primary=firstFailure.error,secondary=[];
      const addSecondary=message=>{secondary.push(message);recordSecondary(new Error(message));};
      if(!Object.is(error,primary))addSecondary(errorText(error));
      // The single renderer attempt finishes before HOST storage; rendererDone already started close.
      await recoveryTask;
      if(rawRecoveryError)addSecondary('partial-export:'+rawRecoveryError);
      let partial=rawRecovery,partialBytes=null;
      if(partial)try{
        const saved=archive.summary();let additional=0;
        for(const stream of partial.streams)for(const chunk of stream.chunks){const size=Buffer.from(chunk.base64,'base64').length,overlap=saved.start===null?0:Math.max(0,Math.min(chunk.frame+128,saved.end)-Math.max(chunk.frame,saved.start));additional+=size*(1-overlap/128);}
        const failureEvidenceBytes=productFailureEvidenceBytes(partial);
        if((saved.chargedBytes??saved.bytes)+additional+failureEvidenceBytes>cap)throw new Error('audio-product-partial-unique-cap');
        await saveRecovery('product-partial.json',{coverage:'current rings overlap archive; failure evidence only, never successful coverage',additionalUniqueBytes:additional+failureEvidenceBytes,failureEvidenceBytes,partial});
        partialBytes=additional+failureEvidenceBytes;
      }catch(cause){addSecondary('partial-export:'+errorText(cause));partial=null;}
      if(failedAssessment)try{await saveRecovery('assessment.json',failedAssessment);}catch(cause){addSecondary('assessment-export:'+errorText(cause));}
      if(rendererCloseError)addSecondary('renderer-close:'+rendererCloseError);
      try{
        await saveRecovery('partial.json',{error:errorText(primary),collectorError:errorText(collectorError??''),secondary,
          firstHostFailure:{status:'UNFORMED',reason:firstFailure.reason,firstAt:firstFailure.shutdown?.firstAt??null,shutdownBy:firstFailure.shutdown?.shutdownBy??null,
            originalResponse:firstFailure.response,pending:firstFailure.pending,snapshotError:firstFailure.snapshotError,observerError:firstFailure.observerError},
          archive:archive.summary(),actions,checkpoints,reentry:reentryRequest,pageErrors:errors,
          facts:firstFailure.response?.productObservation?firstFailure.response:null,lastRaw,partialArtifact:partial?'product-partial.json':null,partialBytes});
      }catch(cause){
        recordSecondary(cause);
        if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{Object.assign(primary,{evidenceError:errorText(cause)});}catch{/* Keep FIRST even when it cannot accept metadata. */}
      }
      throw primary;
    }
    const secondary=[];
    const selectedFailure=masterWitness?(masterFirst??error):retainedSignal?(timingFailure??collectorError??error):error;
    if(selectedFailure!==error){
      secondary.push(String(error));
      error=selectedFailure;
    }
    freezeTiming();collecting=false;if(normalizerControl||extreme)archive.seal();if(collector)await collector;
    if(observedPage&&!normalizerControl&&!extreme)try{await collect(true);}catch(cause){secondary.push(String(cause));}
    if(extreme&&!fftOwned&&observedPage){try{const raw=await audioOperation('fft-buffer-failure-copy',()=>observedPage.evaluate(callProcessingProbe,{kind:'fft-buffer'}),2000);if(typeof raw.base64!=='string'||raw.base64.length>Math.ceil(fftPairBytes/3)*4)throw fail('fft-buffer-failure-bytes');const bytes=Buffer.from(raw.base64,'base64');if(bytes.length>fftPairBytes||bytes.toString('base64')!==raw.base64)throw fail('fft-buffer-failure-bytes');const {base64,...metadata}=raw;fftMetadata=metadata;if(bytes.length)fftOwned=bytes;}catch(cause){secondary.push('fft-buffer-export:'+String(cause));}}

    let partial=null,partialBytes=null;
    if(observedPage)try{
      partial=await audioOperation('product-failed-rings',()=>observedPage.evaluate(callProcessingProbe,{kind:'l1-partial'}),2000);
      if(sourceStartWitness){
        const receipt=sourceStartReceipt??boundedSourceStart(partial.sourceStart);
        partial.sourceStart=sourceStartReceipt===null&&receipt.status==='FORMED'?sourceStartUnavailable('archive-not-observed'):receipt;
      }
      const saved=archive.summary();let additional=0;
      for(const stream of partial.streams)for(const chunk of stream.chunks){const size=Buffer.from(chunk.base64,'base64').length,overlap=saved.start===null?0:Math.max(0,Math.min(chunk.frame+128,saved.end)-Math.max(chunk.frame,saved.start));additional+=size*(1-overlap/128);}
      // Charge the two failure snapshots even when their frames overlap archived PCM.
      const failureEvidenceBytes=productFailureEvidenceBytes(partial);
      if(saved.bytes+outputCaptureReserve+sourceStartReserve+timingReserve()+additional+failureEvidenceBytes>cap)throw fail('partial-unique-cap');
      await save('product-partial.json',{coverage:'current rings overlap archive; failure evidence only, never successful coverage',additionalUniqueBytes:additional+failureEvidenceBytes,failureEvidenceBytes,partial});
      partialBytes=additional+failureEvidenceBytes;
    }catch(cause){secondary.push('partial-export:'+String(cause));partial=null;}
    let facts=headroomFacts;if(observedPage&&!facts)try{facts=normalizerControl||headroomWitness?await audioOperation('normalizer-control-failure-facts',()=>observedPage.evaluate(callProcessingProbe,{kind:'facts',fullOracle:true}),2000):await call({kind:'facts'});}catch(cause){secondary.push(String(cause));}
    if(normalizerControl&&observedPage&&!controlRestoreAttempted){controlRestoreAttempted=true;try{await audioOperation('normalizer-control-restore',()=>observedPage.evaluate(callProcessingProbe,{kind:'analysis-error',enabled:false}),5000);}catch(cause){secondary.push('normalizer-control-restore:'+String(cause));}}
    let warmupExport;
    if(warmupFailure?.cause===error&&partialBytes!==null){
      const {report}=warmupFailure,proof=report.facts.retainedAnalyserProof;
      const runId=/^output\/playwright\/installed-extension-([A-Za-z0-9]{1,64})$/.exec(directory)?.[1];
      try{
        const exportDeadline=Math.min(warmupScenarioDeadline,performance.now()+Math.max(0,deadline-Date.now()));
        warmupExport=await writeWarmupExport(files,{
          runId,artifact:directory,proof,archiveBytes:report.archive.bytes+timingReserve()+partialBytes,
          assessmentSha256:sha(json(report)),targetSha256:sha(json(normalizerRequest)),scenarioDeadline:exportDeadline,
          readRows:async(start,end)=>{
            const item=await observedPage.evaluate(callProcessingProbe,{kind:'retained-analyser-chunk',start}),size=(end-start)*65536;
            if(item?.start!==start||item.end!==end||typeof item.base64!=='string'||item.base64.length!==Math.ceil(size/3)*4)throw fail('warmup-export-chunk');
            const bytes=Buffer.from(item.base64,'base64');
            if(bytes.length!==size||bytes.toString('base64')!==item.base64)throw fail('warmup-export-chunk');
            return bytes;
          },
        });
      }catch(cause){secondary.push('warmup-export:'+String(cause).slice(0,160));}
    }
    try{await save('partial.json',{...(timing?{collectionTiming:freezeTiming()}:{}),error:String(error),collectorError:String(collectorError??''),secondary,...(warmupExport?{warmupExport}:{}),archive:archive.summary(),actions,checkpoints,...(extreme&&(fftOwned||fftMetadata)?{fftFailureEvidence:{metadata:fftMetadata,encoding:'float32le',...(fftOwned?{base64:fftOwned.toString('base64')}:{}),bytes:fftOwned?.length??0},fftFailureEvidenceBytes:fftOwned?.length??0}:{}),...(outputControl?{[extreme?'extreme':dry?'dry':'wetPeak']:outputRequest,extraEvidenceBytes:outputCaptureBytes+(fftOwned?.length??0),...(outputCapturePending?{pendingCapture:{encoding:'float32le',base64:outputCapturePending.toString('base64')}}:{})}:{}),...(equalizer?{equalizer:{spec:equalizer,request:equalizerRequest,target}}:{}),...(normalizer?{normalizer:normalizerRequest}:{}),...(normalizerControl?{normalizerControl:normalizerRequest}:{}),...(reentry?{reentry:reentryRequest}:{}),pageErrors:errors,facts,lastRaw,partialArtifact:partial?'product-partial.json':null});}
    catch(cause){if(error&&typeof error==='object')Object.assign(error,{evidenceError:String(cause)});}throw error;
  }finally{collecting=false;}
}
