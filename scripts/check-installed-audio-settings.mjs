/// <reference types="chrome" />
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {openInstalledMediaSettings} from './extension-e2e/popup-cdp.mjs';
import {launchVisibilityExtension} from './extension-e2e/visibility-browser.mjs';

/** @typedef {{runId:string,headed:boolean,control:null|'storage-loss',normalRunId?:string}} AudioSettingsOptions */
/** @typedef {'audio-zoom200.png'|'audio-zoom200-controls.png'|'audio-zoom200-eq.png'} ZoomCaptureName */
/** @typedef {{context:import('playwright').BrowserContext,worker:import('playwright').Worker,extensionId:string,
 * responses:readonly {url:string,status:number,contentType:string,body:string}[],artifactPath:string,
 * browserSession:import('playwright').CDPSession,observation:ReturnType<typeof createAudioSettingsObservation>,writeZoomCapture:(name:ZoomCaptureName,bytes:Uint8Array)=>Promise<void>}} AudioSettingsScenario */
/** @typedef {{runId:string,headed:boolean,qualification:'audio-settings',dependencies:{
 * launchInstalledExtension:typeof launchVisibilityExtension,createAudioSettingsObservation:typeof createAudioSettingsObservation,readAudioSettingsNormal?:(files:AudioSettingsReferenceFiles)=>Promise<AudioSettingsNormalProof>,mediaScenario:(input:AudioSettingsScenario)=>Promise<unknown>}}} AudioSettingsExecution */
/** @param {string} code */
const fail=code=>Object.assign(new Error(code),{code});
/** @param {unknown} value @returns {Record<string,unknown>|null} */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?/** @type {Record<string,unknown>} */(value):null;
const OBSERVATION_LIMITS=Object.freeze({pages:32,events:256,prefixCharacters:240,bytes:1048576,gainEvents:128});
const OBSERVATION_CODES=new Set(['audio-settings-owned-restore','audio-settings-page-error','settings-operation-failed','conflict','quota-exceeded','Extension context invalidated']);
const CONSOLE_LEVELS=new Set(['log','debug','info','warning','error','assert','trace','clear','dir','dirxml','table','startGroup','startGroupCollapsed','endGroup','count','timeEnd','profile','profileEnd']);
/** @param {unknown} value @returns {value is NativeInputCounts} */
function validNativeInputs(value){
  const c=record(value);return !!c&&c.overflow===false&&[c.pointer,c.key,c.input].every(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0)&&
    [c.synthetic,c.total].every(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=4096)&&Number(c.pointer)+Number(c.key)+Number(c.input)+Number(c.synthetic)===c.total;
}
/** Owns only the synthetic audio-settings scenario and its shutdown; no URL, args or raw console text.
 * @param {import('playwright').BrowserContext} context */
export function createAudioSettingsObservation(context){
  /** @type {'scenario'|'shutdown'|'stopped'} */let phase='scenario';
  /** @type {{id:number,closed:boolean}[]} */const pages=[];
  /** @type {Record<string,unknown>[]} */const events=[];
  /** @type {Set<string>} */const faults=new Set();let pageErrorCount=0,dropped=0;
  /** @type {{settings:{pageId:number,counts:NativeInputCounts}|null,other:{pageId:number,counts:NativeInputCounts}|null}} */const inputs={settings:null,other:null};
  /** @type {Record<string,unknown>|null} */let gainDraft=null;
  /** @type {Record<string,unknown>|null} */let finalSnapshot=null;
  /** @type {Map<import('playwright').Page,{row:{id:number,closed:boolean},error:(e:Error)=>void,console:(m:import('playwright').ConsoleMessage)=>void,close:()=>void}>} */const attached=new Map();
  /** @param {{id:number}} row @param {'console'|'pageerror'|'close'} kind @param {string|null} level @param {string|null} text */
  const append=(row,kind,level,text)=>{
    if(phase==='stopped')return;
    if(events.length===OBSERVATION_LIMITS.events){faults.add('event-bound');dropped=Math.min(Number.MAX_SAFE_INTEGER,dropped+1);return;}
    events.push({order:events.length+1,pageId:row.id,phase,kind,level,code:text!==null&&OBSERVATION_CODES.has(text)?text:null,
      prefixSha256:text===null?null:createHash('sha256').update(text.slice(0,OBSERVATION_LIMITS.prefixCharacters)).digest('hex'),characters:text?.length??0,truncated:text!==null&&text.length>OBSERVATION_LIMITS.prefixCharacters});
  };
  /** @param {import('playwright').Page} page */
  const attach=page=>{
    if(phase==='stopped'||attached.has(page))return;
    if(pages.length===OBSERVATION_LIMITS.pages){faults.add('page-bound');return;}
    const row={id:pages.length,closed:false};pages.push(row);
    const error=/** @param {Error} e */e=>{if(phase==='stopped')return;pageErrorCount=Math.min(Number.MAX_SAFE_INTEGER,pageErrorCount+1);try{if(typeof e.message!=='string')throw Error();append(row,'pageerror',null,e.message);}catch{faults.add('read-event');}};
    const console=/** @param {import('playwright').ConsoleMessage} m */m=>{if(phase==='stopped')return;try{const text=m.text(),level=m.type();if(typeof text!=='string')throw Error();append(row,'console',CONSOLE_LEVELS.has(level)?level:'other',text);}catch{faults.add('read-event');}};
    const close=()=>{if(phase==='stopped')return;row.closed=true;append(row,'close',null,null);};
    attached.set(page,{row,error,console,close});
    try{page.on('pageerror',error);page.on('console',console);page.on('close',close);if(page.isClosed())faults.add('attach-closed');}catch{faults.add('attach');}
  };
  try{context.on('page',attach);for(const page of context.pages().slice(0,OBSERVATION_LIMITS.pages+1))attach(page);}catch{faults.add('attach');}
  return {
    /** @param {import('playwright').Page} page @param {'settings'|'other'} role @param {unknown} counts */
    input(page,role,counts){
      if(phase!=='scenario')return;
      const owner=attached.get(page);
      if(!owner||owner.row.closed||!['settings','other'].includes(role)||(role==='settings'?inputs.settings:inputs.other)!==null||Object.values(inputs).some(v=>v?.pageId===owner.row.id)||!validNativeInputs(counts)){faults.add('input');return;}
      const checkpoint={pageId:owner.row.id,counts:{pointer:counts.pointer,key:counts.key,input:counts.input,synthetic:counts.synthetic,total:counts.total,overflow:counts.overflow}};
      if(role==='settings')inputs.settings=checkpoint;else inputs.other=checkpoint;
    },
    /** @param {import('playwright').Page} page @param {number} restored */
    beginGainDraft(page,restored){
      if(phase!=='scenario')return false;
      const owner=attached.get(page);if(!owner||gainDraft!==null||!Number.isFinite(restored)){faults.add('gain-draft');return false;}
      gainDraft={pageId:owner.row.id,restored,status:'pending',events:null,gain:null,inherited:null,atLimit:false};return true;
    },
    /** Only a read already registered during the scenario may complete during shutdown.
     * @param {import('playwright').Page} page @param {unknown} raw @param {unknown} stored */
    gainDraft(page,raw,stored){
      if(phase==='stopped'||!gainDraft||gainDraft.status!=='pending'||attached.get(page)?.row.id!==gainDraft.pageId)return;
      try{
        if(!Array.isArray(raw)||raw.length>OBSERVATION_LIMITS.gainEvents)throw Error();
        const trace=raw.map(value=>{
          const e=record(value);if(!e||typeof e.time!=='number'||!Number.isFinite(e.time)||e.time<0||(typeof e.type!=='string'||!['initial','input-before','input-after','render'].includes(e.type))||typeof e.focused!=='boolean')throw Error();
          /** @param {unknown} v */const numeric=v=>{
            if(typeof v!=='string'||v.length>32)return null;
            const text=v.endsWith('%')?v.slice(0,-1):v,parts=text.split('.');
            return parts.length<=2&&/^-?\d+$/.test(parts[0]??'')&&(parts.length===1||/^\d+$/.test(parts[1]??''))&&Number.isFinite(Number(text))?Number(text):null;
          };
          const v=numeric(e.value);if(v===null)throw Error();return {time:e.time,type:e.type,value:v,phase:typeof e.phase==='string'&&['ready','pending','error','failed'].includes(e.phase)?e.phase:null,output:numeric(e.output),focused:e.focused};
        });
        const state=record(stored);Object.assign(gainDraft,{status:'recovered',events:trace,gain:typeof state?.audioGain==='number'&&Number.isFinite(state.audioGain)?state.audioGain:null,inherited:typeof state?.gainInherited==='boolean'?state.gainInherited:null,atLimit:raw.length===OBSERVATION_LIMITS.gainEvents});
        if(raw.length===OBSERVATION_LIMITS.gainEvents)faults.add('gain-draft-bound');
      }catch{gainDraft.status='unavailable';faults.add('gain-draft');}
    },
    /** @param {import('playwright').Page} page */
    gainDraftFailed(page){if(phase!=='stopped'&&gainDraft?.status==='pending'&&attached.get(page)?.row.id===gainDraft.pageId){gainDraft.status='unavailable';faults.add('gain-draft-read');}},
    endScenario(){if(phase==='scenario')phase='shutdown';},
    /** @param {boolean} shutdownConfirmed */
    finish(shutdownConfirmed){
      if(finalSnapshot)return structuredClone(finalSnapshot);
      phase='stopped';let detached=true;
      try{context.off('page',attach);}catch{detached=false;faults.add('detach');}
      for(const [page,h]of attached)for(const remove of [()=>page.off('pageerror',h.error),()=>page.off('console',h.console),()=>page.off('close',h.close)])try{remove();}catch{detached=false;faults.add('detach');}
      if(gainDraft?.status==='pending')faults.add('gain-draft-pending');
      const complete=detached&&shutdownConfirmed===true&&faults.size===0&&pages.every(p=>p.closed)&&inputs.settings!==null&&inputs.other!==null;
      finalSnapshot={schema:'f01-audio-settings-observation-v1',limits:OBSERVATION_LIMITS,complete,detached,shutdownConfirmed:shutdownConfirmed===true,pages,events,inputs,gainDraft,pageErrorCount,dropped,faults:[...faults]};
      finalSnapshot=structuredClone(finalSnapshot);attached.clear();
      if(Buffer.byteLength(JSON.stringify(finalSnapshot))>OBSERVATION_LIMITS.bytes)throw fail('audio-settings-observation-byte-bound');
      return structuredClone(finalSnapshot);
    },
  };
}
/** Starts existing diagnostic reads without postponing the original failure or adding a timer.
 * @param {AudioSettingsScenario} input @param {import('playwright').Page} page @param {number} restored */
export function retainGainDraftFailure(input,page,restored){
  if(!input.observation.beginGainDraft(page,restored))return;
  try{
    void Promise.all([page.evaluate(()=>{const state=/** @type {typeof globalThis & {__f01GainDraftEvents?:unknown}} */(globalThis);return state.__f01GainDraftEvents??null;}),stored(input.worker)])
      .then(([events,raw])=>input.observation.gainDraft(page,events,channelAudio(raw,'d'.repeat(32)))).catch(()=>input.observation.gainDraftFailed(page));
  }catch{input.observation.gainDraftFailed(page);}
}
const checks=Object.freeze(['native-ui','two-windows','storage-authority','layout','original-target','preset-draft','input-focus','lifecycle']);
/** @typedef {{caseId:string,code:string,phase:'storage-readback',matched:true,rawDiff:{path:string,expected:unknown,actual:'missing'}[]}} AudioLossObservation */
const lossPaths=new Map([['owned-gain','config.audioGain'],['inherit-bit','config.gainInherited'],['eq-band','config.eq125'],['preset-id','mediaProfiles.presets[0].id']]);

/** @param {unknown} before @param {unknown} after @param {string} caseId @returns {AudioLossObservation|null} */
export function matchAudioStorageLoss(before,after,caseId){
  const original=record(before),repaired=record(structuredClone(after)),lossPath=lossPaths.get(caseId);
  if(!original||!repaired||!lossPath)return null;
  /** @type {Record<string,unknown>|null} */let source=null,target=null;
  let key='';
  if(caseId==='preset-id'){
    const first=record(original.mediaProfiles)?.presets,second=record(repaired.mediaProfiles)?.presets;
    if(!Array.isArray(first)||!Array.isArray(second)||first.length!==1||second.length!==1)return null;
    source=record(first.at(0));target=record(second.at(0));key='id';
  }else{
    source=record(original.config);target=record(repaired.config);
    key=caseId==='owned-gain'?'audioGain':caseId==='inherit-bit'?'gainInherited':'eq125';
  }
  if(!source||!target||!Object.hasOwn(source,key)||Object.hasOwn(target,key))return null;
  const expected=Reflect.get(source,key);
  if(key==='id' ? typeof expected!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(expected) :
    !isDeepStrictEqual(expected,key==='audioGain'?0:key==='gainInherited'?false:1.25))return null;
  Object.defineProperty(target,key,{value:expected,enumerable:true,writable:true,configurable:true});
  if(!isDeepStrictEqual(before,repaired))return null;
  return {caseId,code:'f01-storage-loss-'+caseId,phase:'storage-readback',matched:true,rawDiff:[{path:lossPath,expected,actual:'missing'}]};
}

/** @typedef {{lstat:(name:string)=>Promise<{isFile:()=>boolean,size:number}|null>,readFile:(name:string)=>Promise<Uint8Array>}} AudioSettingsReferenceFiles */
/** @typedef {{runId:string,sha256:string,source:unknown,candidate:unknown}} AudioSettingsNormalProof */
/** @param {unknown} value @returns {value is string} */
const validRunId=value=>typeof value==='string'&&/^[A-Za-z0-9]{1,64}$/.test(value);
/** @param {AudioSettingsOptions} options */
const validAudioSettingsOptions=options=>!!options&&validRunId(options.runId)&&typeof options.headed==='boolean'&&[null,'storage-loss'].includes(options.control)&&
  (options.control===null?options.normalRunId===undefined:validRunId(options.normalRunId)&&options.normalRunId!==options.runId);

/** @param {readonly string[]} args @returns {AudioSettingsOptions} */
export function parseAudioSettingsArgs(args){
  let runId,normalRunId,headed=false;
  /** @type {AudioSettingsOptions['control']} */
  let control=null;
  for(const arg of args){
    if(arg.startsWith('--run-id=')&&runId===undefined)runId=arg.slice(9);
    else if(arg==='--headed'&&!headed)headed=true;
    else if(arg==='--control=storage-loss'&&control===null)control='storage-loss';
    else if(arg.startsWith('--normal-run-id=')&&normalRunId===undefined)normalRunId=arg.slice(16);
    else throw fail('audio-settings-args');
  }
  if(!validRunId(runId))throw fail('audio-settings-args');
  const options={runId,headed,control,...normalRunId!==undefined?{normalRunId}:{}};
  if(!validAudioSettingsOptions(options))throw fail('audio-settings-args');
  return options;
}

/** @template T @param {()=>Promise<T>} work @param {number} milliseconds @returns {Promise<T>} */
export async function boundedAudioScenario(work,milliseconds){
  if(!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>180000)throw fail('audio-settings-timeout-invalid');
  /** @type {ReturnType<typeof setTimeout>|undefined} */let timer;
  try{
    /** @type {Promise<never>} */const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('audio-settings-timeout')),milliseconds);});
    return await Promise.race([work(),timeout]);
  }
  finally{clearTimeout(timer);}
}

/** Checks the complete successful representation; failed snapshots remain explicit partial evidence.
 * @param {unknown} value @param {unknown[]} nativeInputs */
function assertAudioSettingsObservation(value,nativeInputs){
  const o=record(value),roles=record(o?.inputs),a=record(roles?.settings),b=record(roles?.other);
  /** @param {Record<string,unknown>} row @param {string} keys */const exact=(row,keys)=>Object.keys(row).sort().join(',')===keys;
  if(!o||!exact(o,'complete,detached,dropped,events,faults,gainDraft,inputs,limits,pageErrorCount,pages,schema,shutdownConfirmed')||o.schema!=='f01-audio-settings-observation-v1'||
    o.complete!==true||o.detached!==true||o.shutdownConfirmed!==true||o.pageErrorCount!==0||o.dropped!==0||o.gainDraft!==null||!isDeepStrictEqual(o.faults,[])||!isDeepStrictEqual(o.limits,OBSERVATION_LIMITS)||
    !Array.isArray(o.pages)||!o.pages.length||o.pages.length>32||!Array.isArray(o.events)||o.events.length>256||!roles||!exact(roles,'other,settings')||!a||!b||a.pageId===b.pageId)throw fail('audio-settings-proof');
  for(const [i,raw]of o.pages.entries()){const page=record(raw);if(!page||!exact(page,'closed,id')||page.id!==i||page.closed!==true)throw fail('audio-settings-proof');}
  let shutdownSeen=false;
  for(const [i,raw]of o.events.entries()){
    const e=record(raw);if(!e||!exact(e,'characters,code,kind,level,order,pageId,phase,prefixSha256,truncated')||e.order!==i+1||!Number.isSafeInteger(e.pageId)||Number(e.pageId)<0||Number(e.pageId)>=o.pages.length||(typeof e.phase!=='string'||!['scenario','shutdown'].includes(e.phase)))throw fail('audio-settings-proof');
    if(e.phase==='shutdown')shutdownSeen=true;else if(shutdownSeen)throw fail('audio-settings-proof');
    if(e.kind==='close'){if(e.level!==null||e.code!==null||e.prefixSha256!==null||e.characters!==0||e.truncated!==false)throw fail('audio-settings-proof');}
    else if(e.kind!=='console'||typeof e.level!=='string'||!CONSOLE_LEVELS.has(e.level)&&e.level!=='other'||typeof e.prefixSha256!=='string'||!/^[a-f0-9]{64}$/.test(e.prefixSha256)||
      !Number.isSafeInteger(e.characters)||Number(e.characters)<0||e.truncated!==(Number(e.characters)>240)||e.code!==null&&(typeof e.code!=='string'||!OBSERVATION_CODES.has(e.code)))throw fail('audio-settings-proof');
    if(typeof e.code==='string'&&(e.prefixSha256!==createHash('sha256').update(e.code).digest('hex')||e.characters!==e.code.length||e.truncated!==false))throw fail('audio-settings-proof');
  }
  for(const [i,entry]of [a,b].entries()){
    const counts=record(entry.counts);if(!exact(entry,'counts,pageId')||!Number.isSafeInteger(entry.pageId)||Number(entry.pageId)<0||Number(entry.pageId)>=o.pages.length||!counts||!validNativeInputs(counts)||!exact(counts,'input,key,overflow,pointer,synthetic,total')||!isDeepStrictEqual(counts,nativeInputs.at(i))||!o.events.some(raw=>{const e=record(raw);return e?.kind==='close'&&e.pageId===entry.pageId&&(i===0||e.phase==='scenario');}))throw fail('audio-settings-proof');
  }
  if(Buffer.byteLength(JSON.stringify(o))>OBSERVATION_LIMITS.bytes)throw fail('audio-settings-proof');
}

/** @param {unknown} raw @param {AudioSettingsOptions} options @returns {Record<string,unknown>} */
export function assertAudioSettingsReport(raw,options){
  const report=record(raw),shutdown=record(report?.shutdown),source=record(report?.source),result=record(report?.audioSettings);
  if(!report||report.ok!==true||report.runId!==options.runId||report.qualification!=='audio-settings'||!shutdown||!source||!result||
    !['browserCloseAcknowledged','browserDisconnected','ownedRootClosed'].every(key=>Reflect.get(shutdown,key)===true)||
    report.profileRetained!==true||report.candidateRetained!==true||!isDeepStrictEqual(source,report.after)||
    !isDeepStrictEqual(Object.keys(source).sort(),['lockSha256','manifestSha256','sourceCommit','sourceSha256','toolchainSha256'])||
    typeof source.sourceCommit!=='string'||!/^[a-f0-9]{40}$/.test(source.sourceCommit)||
    ![source.sourceSha256,source.lockSha256,source.manifestSha256,source.toolchainSha256].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value))||
    !isDeepStrictEqual(result.checks,checks)||!isDeepStrictEqual(report.pageErrors,[])||result.passed!==(options.control===null))throw fail('audio-settings-proof');
  if(options.control===null){if(report.audioSettingsNormal!==null)throw fail('audio-settings-proof');}
  else{
    const link=record(report.audioSettingsNormal),before=record(link?.before);
    if(!validRunId(options.normalRunId)||options.normalRunId===options.runId||!link||Object.keys(link).sort().join(',')!=='after,before'||!before||Object.keys(before).sort().join(',')!=='runId,sha256'||before.runId!==options.normalRunId||typeof before.sha256!=='string'||!/^[a-f0-9]{64}$/.test(before.sha256)||!isDeepStrictEqual(before,link.after))throw fail('audio-settings-proof');
  }
  const candidate=record(report.audioSettingsCandidate);
  if(!candidate||Object.keys(candidate).sort().join(',')!=='after,before'||!Array.isArray(candidate.before)||!candidate.before.length||!isDeepStrictEqual(candidate.before,candidate.after))throw fail('audio-settings-proof');
  let previous='';
  for(const raw of candidate.before){
    const row=record(raw);
    if(!row||Object.keys(row).sort().join(',')!=='bytes,file,sha256'||typeof row.file!=='string'||!row.file.startsWith('dist/')||row.file.includes('\\')||row.file.split('/').some(part=>!part||part==='.'||part==='..')||row.file<=previous||typeof row.bytes!=='number'||!Number.isSafeInteger(row.bytes)||row.bytes<0||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256))throw fail('audio-settings-proof');
    previous=row.file;
  }
  const trace=record(report.audioSettingsTrace);if(!trace||Object.keys(trace).sort().join(',')!=='attempted,file,stopAcknowledged'||trace.attempted!==true||trace.stopAcknowledged!==true||trace.file!=='output/playwright/installed-extension-'+options.runId+'/trace.zip')throw fail('audio-settings-proof');
  const controls=result.lossControls;
  const entry=record(result.presetEntry);
  if(!entry||!['emptyFirstOpen','saveAsNameFocused','pairLegacyLimited','rawPreserved'].every(key=>Reflect.get(entry,key)===true))throw fail('audio-settings-proof');
  const inputs=result.nativeInputs,windows=result.nativeWindows,tabWindows=result.nativeTabWindows;
  const lifecycle=record(result.lifecycle),quota=record(result.quota),restart=record(result.workerRestart),layout=record(result.layout),zoom=record(layout?.zoom);
  const zoomBands=zoom?.bands;
  const race=record(result.sameScope);
  if(race?.nativeFullRequests!==2||race.heldDispatches!==1||race.committedRevisionDelta!==1||race.lateCode!=='conflict'||race.lateStored!==false)throw fail('audio-settings-proof');
  const aba=record(result.aba),merge=record(result.unrelatedMerge);
  if(aba?.nativeFullRequests!==1||aba.nativePatchRequests!==2||aba.heldDispatches!==1||aba.committedRevisionDelta!==2||aba.valuesRestored!==true||
    aba.lateCode!=='conflict'||aba.lateStored!==false||merge?.nativeRequests!==2||merge.nativeDocumentsDistinct!==true||merge.globalRevisionDelta!==2||
    merge.mediaUnchanged!==true||merge.unknownRawPreserved!==true||merge.styleEnabled!==true||merge.eqValue!==.5)throw fail('audio-settings-proof');
  if(!Array.isArray(inputs)||inputs.length!==2||!Array.isArray(windows)||windows.length!==2||windows[0]===windows[1]||
    !windows.every(value=>Number.isSafeInteger(value))||!Array.isArray(tabWindows)||tabWindows.length!==2||tabWindows[0]===tabWindows[1]||
    !tabWindows.every(value=>Number.isSafeInteger(value)&&value>=0)||lifecycle?.oneWindowClosed!==true||lifecycle.remainingNativeSource!==1||
    ![lifecycle.beforeHeap,lifecycle.afterHeap].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0)||
    lifecycle.closedNativeMissing!==true||lifecycle.closedReplyStage!=='read'||lifecycle.closedReplyCode!=='settings-operation-failed'||lifecycle.closedUiDisabled!==true||lifecycle.hiddenObserved!==true||lifecycle.visibleRestored!==true||
    quota?.actualQuotaFailure!==true||typeof quota.bytesAtLimit!=='number'||!Number.isSafeInteger(quota.bytesAtLimit)||quota.bytesAtLimit<1||quota.bytesAtLimit>16*1024*1024||
    restart?.actualWorkerReplacement!==true||restart.nativeStopped!==true||restart.nativeRunning!==true||restart.markerAbsent!==true||
    ![restart.beforeTimeOrigin,restart.afterTimeOrigin].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0)||
    Number(restart.afterTimeOrigin)<=Number(restart.beforeTimeOrigin)||typeof restart.wrapperReused!=='boolean'||typeof restart.targetReused!=='boolean'||
    zoom?.actual!==2||typeof zoom.output!=='number'||Math.abs(zoom.output-80)>.1||
    ![zoom.beforeDpr,zoom.afterDpr,zoom.beforeWidth,zoom.afterWidth].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0)||
    Math.abs(Number(zoom.afterDpr)-Number(zoom.beforeDpr)*2)>.01||Math.abs(Number(zoom.afterWidth)*2-Number(zoom.beforeWidth))>2||
    zoom.overflow!==false||!Array.isArray(zoomBands)||zoomBands.length!==8||!zoomBands.every(y=>typeof y==='number'&&Number.isFinite(y))||
    zoomBands.some(y=>Math.abs(Number(y)-Number(zoomBands.at(0)))>1)||typeof zoom.shell!=='number'||Math.abs(zoom.shell-580)>.1||
    !Array.isArray(layout?.viewports)||layout.viewports.length!==3)throw fail('audio-settings-proof');
  for(const raw of inputs){
    const counts=record(raw);
    if(!counts||counts.overflow!==false||![counts.pointer,counts.key,counts.input].every(value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0)||
      ![counts.synthetic,counts.total].every(value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=4096)||
      Number(counts.pointer)+Number(counts.key)+Number(counts.input)+Number(counts.synthetic)!==counts.total)throw fail('audio-settings-proof');
  }
  assertAudioSettingsObservation(report.audioSettingsObservation,inputs);
  for(const [index,width]of [1280,800,360].entries()){
    const view=record(layout.viewports.at(index)),bands=view?.bands;
    if(!view||view.width!==width||typeof view.output!=='number'||Math.abs(view.output-80)>.1||typeof view.shell!=='number'||Math.abs(view.shell-580)>.1||
      view.overflow!==false||width===360&&view.scrollable!==true||!Array.isArray(bands)||bands.length!==8||
      !bands.every(y=>typeof y==='number'&&Number.isFinite(y))||bands.some(y=>Math.abs(Number(y)-Number(bands.at(0)))>1))throw fail('audio-settings-proof');
  }
  if(!Array.isArray(controls)||options.control===null&&controls.length!==0||options.control!==null&&controls.length!==4)throw fail('audio-settings-proof');
  if(options.control)for(const [index,name]of ['owned-gain','inherit-bit','eq-band','preset-id'].entries()){
    const entry=record(controls.at(index));
    const diff=Array.isArray(entry?.rawDiff)?record(entry.rawDiff.at(0)):null;
    if(!entry||entry.caseId!==name||entry.code!=='f01-storage-loss-'+name||entry.phase!=='storage-readback'||entry.matched!==true||
      !Array.isArray(entry.rawDiff)||entry.rawDiff.length!==1||!diff||diff.path!==lossPaths.get(name)||diff.actual!=='missing')throw fail('audio-settings-proof');
    if(name==='preset-id' ? typeof diff.expected!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(diff.expected) :
      !isDeepStrictEqual(diff.expected,name==='owned-gain'?0:name==='inherit-bit'?false:1.25))throw fail('audio-settings-proof');
  }
  return report;
}

/** Explicit normal report only; this validates producer evidence, not its cryptographic authenticity.
 * @param {AudioSettingsReferenceFiles} files @param {string} runId @returns {Promise<AudioSettingsNormalProof>} */
export async function readAudioSettingsNormal(files,runId){
  if(!validRunId(runId))throw fail('audio-settings-args');
  const name='output/playwright/installed-extension-'+runId+'/summary.json',stat=await files.lstat(name);
  if(!stat?.isFile()||!Number.isSafeInteger(stat.size)||stat.size<1||stat.size>1048576)throw fail('audio-settings-normal-summary');
  const bytes=await files.readFile(name);
  if(!(bytes instanceof Uint8Array)||bytes.length!==stat.size||bytes.length>1048576)throw fail('audio-settings-normal-summary');
  let parsed;try{parsed=JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{throw fail('audio-settings-normal-json');}
  const report=assertAudioSettingsReport(parsed,{runId,headed:false,control:null});
  return {runId,sha256:createHash('sha256').update(bytes).digest('hex'),source:report.source,candidate:record(report.audioSettingsCandidate)?.before};
}

/** @param {AudioSettingsExecution} options @returns {Promise<unknown>} */
async function executeNative(options){
  // The existing executor keeps its own tests; this boundary returns unknown, not an inferred unchecked result.
  const nativeExecutorSpecifier='./check-installed-extension.mjs';
  /** @type {unknown} */const module=await import(nativeExecutorSpecifier);
  const provider=record(module),execute=provider&&Reflect.get(provider,'runInstalledExtensionE2E');
  if(typeof execute!=='function')throw fail('audio-settings-executor-unavailable');
  /** @type {unknown} */const result=await Reflect.apply(execute,undefined,[options]);return result;
}

/** @template T @param {()=>Promise<T>} read @param {(value:T)=>boolean} accept @param {string} code */
async function waitNative(read,accept,code){
  const deadline=Date.now()+15000;
  do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,25));}while(Date.now()<deadline);
  throw fail(code);
}
/** @param {import('playwright').Page} page */
async function readyUI(page){
  await page.waitForFunction(()=>document.getElementById('media-status')?.dataset.phase==='ready',null,{timeout:15000});
}
/** @param {import('playwright').Worker} worker @returns {Promise<Record<string,unknown>>} */
async function stored(worker){
  /** @type {unknown} */const raw=await worker.evaluate(()=>chrome.storage.local.get(null));
  const result=record(raw);if(!result)throw fail('audio-settings-storage-read');return result;
}
/** @param {import('playwright').Page} page */
async function audioFacts(page){
  return page.evaluate(()=>{
    const runtime=/** @type {import('../src/main/runtime/contracts.js').KnifeRuntime|undefined} */(Reflect.get(window,Symbol.for('cheese-knife.runtime.v1')));
    const video=document.querySelector('video');
    return {owner:runtime?.ownerProtocol,ready:runtime?.configReady===true,decoded:!!video&&video.readyState>=2,
      blob:!!video&&video.currentSrc.startsWith('blob:'),wanted:runtime?.player?.getAudioWanted({...runtime.media.context}).wanted??null,
      effectiveGain:typeof runtime?.config.audioGain==='number'?runtime.config.audioGain:null,
      audio:video?runtime?.audio?.getReadback(video)??null:null,muted:video?.muted,volume:video?.volume,hidden:document.hidden};
  });
}
/** @param {import('playwright').Page} page @param {number} arrows */
async function gainFromHome(page,arrows){
  const gain=page.locator('#audioGain');await gain.focus();await page.keyboard.press('Home');
  for(let index=0;index<arrows;index++)await page.keyboard.press('ArrowRight');
  const value=Number(await gain.inputValue());if(!Number.isFinite(value)||value<0||value>2)throw fail('audio-settings-native-gain-input');return value;
}
/** @typedef {{pointer:number,key:number,input:number,synthetic:number,total:number,overflow:boolean}} NativeInputCounts */
/** @param {import('playwright').Page} page */
async function observeNativeInputs(page){
  await page.evaluate(()=>{
    const state=/** @type {typeof globalThis & {__f01NativeInputs?:NativeInputCounts}} */(globalThis);
    if(state.__f01NativeInputs)throw new Error('audio-settings-input-observer-exists');
    const counts={pointer:0,key:0,input:0,synthetic:0,total:0,overflow:false};state.__f01NativeInputs=counts;
    for(const type of ['pointerdown','keydown','input'])document.addEventListener(type,event=>{
      if(counts.total>=4096){counts.overflow=true;return;}counts.total++;
      if(!event.isTrusted){counts.synthetic++;return;}
      if(event.type==='pointerdown')counts.pointer++;else if(event.type==='keydown')counts.key++;else counts.input++;
    },true);
  });
}
/** @param {import('playwright').Page} page @param {AudioSettingsScenario['observation']} observation @param {'settings'|'other'} role */
async function nativeInputProof(page,observation,role){
  const counts=await page.evaluate(()=>({...(/** @type {typeof globalThis & {__f01NativeInputs?:NativeInputCounts}} */(globalThis)).__f01NativeInputs}));
  if(!validNativeInputs(counts))throw fail('audio-settings-native-input-unobserved');
  observation.input(page,role,counts);return counts;
}
/** @param {import('playwright').Page} page @param {string} selector @param {string} value @param {import('playwright').Worker} worker @param {(raw:Record<string,unknown>)=>boolean} accept */
async function numberInput(page,selector,value,worker,accept){
  await page.locator(selector).fill(value);await waitNative(()=>stored(worker),accept,'audio-settings-number-ack');await readyUI(page);
}
/** @param {import('playwright').Page} page @param {AudioSettingsScenario} input */
async function layoutProof(page,input){
  const measurements=[];
  /** @type {{actual:number,output:number,beforeDpr:number,afterDpr:number,beforeWidth:number,afterWidth:number,overflow:boolean,bands:number[],shell:number}} */
  let zoomMeasurement={actual:0,output:0,beforeDpr:0,afterDpr:0,beforeWidth:0,afterWidth:0,overflow:true,bands:[],shell:0};
  for(const width of [1280,800,360]){
    await page.setViewportSize({width,height:1000});
    const measurement=await page.evaluate(()=>{
      const output=document.getElementById('audioGain-value'),shell=document.querySelector('.f01-eq-shell'),scroll=shell?.parentElement;
      if(!output||!shell||!scroll)throw new Error('audio-settings-layout-missing');
      const bands=[...document.querySelectorAll('.f01-eq-band')].map(element=>element.getBoundingClientRect().top);
      return {width:innerWidth,output:output.getBoundingClientRect().width,shell:shell.getBoundingClientRect().width,
        bands,scrollable:scroll.scrollWidth>scroll.clientWidth,overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    if(measurement.width!==width||Math.abs(measurement.output-80)>.1||Math.abs(measurement.shell-580)>.1||measurement.bands.length!==8||
      measurement.bands.some(y=>Math.abs(y-(measurement.bands.at(0)??NaN))>1)||measurement.overflow||width===360&&!measurement.scrollable)throw fail('audio-settings-layout');
    measurements.push(measurement);await page.screenshot({path:path.join(input.artifactPath,'audio-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1280,height:1000});
  const own=await page.evaluate(()=>chrome.tabs.getCurrent());if(typeof own?.id!=='number')throw fail('audio-settings-zoom-target');
  const before=await page.evaluate(()=>({dpr:devicePixelRatio,width:innerWidth}));
  await input.worker.evaluate(async id=>{await chrome.tabs.setZoomSettings(id,{mode:'automatic',scope:'per-tab'});await chrome.tabs.setZoom(id,2);},own.id);
  try{
    const zoom=await input.worker.evaluate(id=>chrome.tabs.getZoom(id),own.id);
    const scaled=await waitNative(()=>page.evaluate(()=>({dpr:devicePixelRatio,width:innerWidth})),
      value=>Math.abs(value.dpr-before.dpr*2)<.01&&Math.abs(value.width*2-before.width)<=2,'audio-settings-zoom-not-scaled');
    const width=await page.locator('#audioGain-value').evaluate(node=>node.getBoundingClientRect().width);
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,
      bands:[...document.querySelectorAll('.f01-eq-band')].map(node=>node.getBoundingClientRect().top),shell:document.querySelector('.f01-eq-shell')?.getBoundingClientRect().width??0}));
    if(layout.overflow||layout.bands.length!==8||layout.bands.some(y=>Math.abs(y-(layout.bands[0]??NaN))>1)||Math.abs(layout.shell-580)>.1)throw fail('audio-settings-zoom-layout');
    if(zoom!==2||Math.abs(width-80)>.1)throw fail('audio-settings-zoom');
    zoomMeasurement={actual:zoom,output:width,beforeDpr:before.dpr,afterDpr:scaled.dpr,beforeWidth:before.width,afterWidth:scaled.width,...layout};
    // Native zoom exposes a Playwright scrolled-clip mismatch; CDP captures the actual surface without a clip or metrics override.
    const surface=await input.context.newCDPSession(page);
    try{
      /** @param {ZoomCaptureName} name */const capture=async name=>{
        const image=await surface.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
        if(image.data.length>12*1024*1024)throw fail('audio-settings-zoom-capture-limit');
        const bytes=Buffer.from(image.data,'base64'),viewport=page.viewportSize();
        if(bytes.length<24||!viewport||bytes.readUInt32BE(16)!==viewport.width||bytes.readUInt32BE(20)!==viewport.height)throw fail('audio-settings-zoom-capture-size');
        await input.writeZoomCapture(name,bytes);
      };
      await page.evaluate(async()=>{scrollTo(0,0);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));});
      await capture('audio-zoom200.png');
      /** @type {[string,ZoomCaptureName][]} */const sections=[['compressorRatio','audio-zoom200-controls.png'],['eq125','audio-zoom200-eq.png']];
      for(const [id,name]of sections){
        const visible=await page.locator('#'+id).evaluate(async node=>{
          node.scrollIntoView({block:'center',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));
          const rect=node.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight;
        });
        if(!visible)throw fail('audio-settings-zoom-capture-target');await capture(name);
      }
    }finally{await surface.detach();}
  }finally{
    await input.worker.evaluate(id=>chrome.tabs.setZoom(id,1),own.id);
    await waitNative(()=>page.evaluate(()=>({dpr:devicePixelRatio,width:innerWidth})),
      value=>Math.abs(value.dpr-before.dpr)<.01&&Math.abs(value.width-before.width)<=1,'audio-settings-zoom-restore');
  }
  return {viewports:measurements,zoom:zoomMeasurement};
}
/** @param {Record<string,unknown>} raw */
function firstPreset(raw){const presets=record(raw.mediaProfiles)?.presets;return Array.isArray(presets)?record(presets.at(0)):null;}
/** @param {import('playwright').Page} page @param {string} id @param {boolean} accept */
async function confirmClick(page,id,accept){
  /** @type {(dialog:import('playwright').Dialog)=>void} */let listener=()=>{};
  const handled=new Promise((resolve,reject)=>{listener=dialog=>{(accept?dialog.accept():dialog.dismiss()).then(resolve,reject);};page.once('dialog',listener);});
  try{await Promise.all([page.locator(id).click(),handled]);}finally{page.off('dialog',listener);}
}
/** @param {AudioSettingsScenario} input @param {import('playwright').Page} settings @param {import('playwright').Page} first */
async function presetAndMasterProof(input,settings,first){
  const before=await stored(input.worker);
  const target=await exactTab(input.worker,first.url()),pair=await input.context.newPage();
  try{
    await pair.goto(`chrome-extension://${input.extensionId}/popup.html?mediaSettings=1&targetTabId=${target.id}&targetWindowId=${target.windowId}`);
    await readyUI(pair);
    const limited=await pair.evaluate(()=>({read:document.getElementById('media-legacy-read') instanceof HTMLButtonElement&&
      /** @type {HTMLButtonElement} */(document.getElementById('media-legacy-read')).disabled,
      import:/** @type {HTMLButtonElement} */(document.getElementById('media-legacy-import')).disabled,
      note:document.getElementById('media-legacy-status')?.textContent,
      described:document.getElementById('media-legacy-read')?.getAttribute('aria-describedby')}));
    if(!limited.read||!limited.import||!limited.note?.includes('VOD')||limited.described!=='media-legacy-status')throw fail('audio-settings-legacy-pair-limit');
    if(!isDeepStrictEqual(before,await stored(input.worker)))throw fail('audio-settings-legacy-pair-write');
  }finally{await pair.close();}
  await settings.locator('#media-presets-tab').click();
  if(!await settings.locator('#media-preset-new').evaluate(node=>/** @type {HTMLDetailsElement} */(node).open))throw fail('audio-settings-empty-create-closed');
  if(!await settings.locator('#media-preset-create').isEnabled())throw fail('audio-settings-empty-create-unprepared');
  await settings.locator('#media-preset-new > summary').click();await settings.locator('#media-audio-tab').click();
  await settings.locator('#audio-master').click();
  await waitNative(()=>audioFacts(first),facts=>facts.wanted===false&&facts.audio?.state==='off','audio-settings-master-off');
  if(!isDeepStrictEqual(before,await stored(input.worker)))throw fail('audio-settings-master-stored');
  await settings.locator('#media-audio-save-preset').click();
  if(!await settings.locator('#media-preset-create-name').evaluate(node=>node===document.activeElement))throw fail('audio-settings-save-as-focus');
  await settings.locator('#media-preset-create-name').fill('F01 native audio');await settings.locator('#media-preset-create').click();
  const created=await waitNative(()=>stored(input.worker),raw=>firstPreset(raw)?.name==='F01 native audio','audio-settings-preset-create');
  const id=firstPreset(created)?.id;
  if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))throw fail('audio-settings-preset-id');
  const expectedAudio={audioDefault:false,compressorEnabled:true,compressorThreshold:-50,compressorKnee:40,compressorRatio:12,
    compressorAttack:0,compressorRelease:0.25,audioGain:0,gainInherited:false,eqEnabled:true,eq63:0,eq125:1.25,eq250:0,eq500:0,
    eq1000:0,eq2000:0,eq4000:0,eq8000:0,normalizerEnabled:false,normalizerTargetDbfs:-20};
  const expected={schema:2,revision:1,channels:[],presets:[{id,createdRevision:1,revision:1,name:'F01 native audio',domain:'audio',values:expectedAudio}]};
  if(!isDeepStrictEqual(created.mediaProfiles,expected))throw fail('audio-settings-preset-snapshot');
  await readyUI(settings);await settings.locator('#media-preset-name').fill('F01 renamed');await settings.locator('#media-preset-rename').click();
  await waitNative(()=>stored(input.worker),raw=>firstPreset(raw)?.name==='F01 renamed'&&firstPreset(raw)?.revision===2,'audio-settings-preset-rename');await readyUI(settings);
  await settings.locator('#media-audio-tab').click();await settings.locator('#media-audio-preset').selectOption('recipe:compressor');
  const beforeCancel=await stored(input.worker);await confirmClick(settings,'#media-audio-preset-apply',false);
  if(!isDeepStrictEqual(await stored(input.worker),beforeCancel))throw fail('audio-settings-cancel-write');
  await confirmClick(settings,'#media-audio-preset-apply',true);
  await waitNative(()=>stored(input.worker),raw=>record(raw.config)?.eqEnabled===false&&record(raw.config)?.eq125===0,'audio-settings-recipe');await readyUI(settings);
  const recipe=await stored(input.worker);
  if(record(recipe.config)?.audioGain!==0||record(recipe.config)?.gainInherited!==false||record(recipe.config)?.compressorDefault!==record(before.config)?.compressorDefault&&
    Object.hasOwn(record(before.config)??{},'compressorDefault'))throw fail('audio-settings-recipe-gain-default');
  await settings.locator('#media-audio-preset').selectOption(id);await confirmClick(settings,'#media-audio-preset-apply',true);
  await waitNative(()=>stored(input.worker),raw=>record(raw.config)?.eqEnabled===true&&record(raw.config)?.eq125===1.25,'audio-settings-preset-apply');await readyUI(settings);
  if((await audioFacts(first)).wanted!==false)throw fail('audio-settings-preset-reset-master');
  return {emptyFirstOpen:true,saveAsNameFocused:true,pairLegacyLimited:true,rawPreserved:true};
}
/** @param {AudioSettingsScenario} input @param {import('playwright').Page} settings */
async function dialProof(input,settings){
  const before=await stored(input.worker),dial=settings.locator('#compressorRatio');await dial.scrollIntoViewIfNeeded();
  const box=await dial.boundingBox();if(!box||Math.abs(box.width-72)>.1||Math.abs(box.height-72)>.1)throw fail('audio-settings-dial-box');
  const x=box.x+box.width/2,y=box.y+box.height/2;await settings.mouse.move(x,y);await settings.mouse.down();
  let reversed;
  try{
    await settings.mouse.move(x,y-200,{steps:8});if(Number(await dial.inputValue())!==20)throw fail('audio-settings-dial-endpoint');
    await settings.mouse.move(x,y-260);await settings.mouse.move(x,y-259);
    reversed=Number(await dial.inputValue());if(!Number.isFinite(reversed)||reversed>=20||reversed<19)throw fail('audio-settings-dial-reverse');
  }finally{await settings.mouse.up();}
  await waitNative(()=>stored(input.worker),raw=>record(raw.config)?.compressorRatio===reversed,'audio-settings-dial-ack');await readyUI(settings);
  await dial.dblclick();await waitNative(()=>stored(input.worker),raw=>record(raw.config)?.compressorRatio===12,'audio-settings-dial-reset');await readyUI(settings);
  const after=await stored(input.worker);const {settingsRevision:oldRevision,...oldStable}=before,{settingsRevision:newRevision,...newStable}=after;
  if(!isDeepStrictEqual(oldStable,newStable)||typeof oldRevision!=='number'||typeof newRevision!=='number'||newRevision<=oldRevision)throw fail('audio-settings-dial-reset-scope');
}
/** @param {Record<string,unknown>} raw @param {string} channelId */
function channelAudio(raw,channelId){
  const channels=record(raw.mediaProfiles)?.channels;
  if(!Array.isArray(channels))return null;
  const channel=channels.map(record).find(value=>value?.channelId===channelId);
  return record(record(channel?.audio)?.values);
}
/** @param {import('playwright').Page} page @param {string} selection */
async function selectScope(page,selection){await page.locator('#media-scope').selectOption(selection);await readyUI(page);}
/** @param {import('playwright').Worker} worker @param {string} url */
async function exactTab(worker,url){
  const tabs=await worker.evaluate(url=>chrome.tabs.query({url}),url),tab=tabs.at(0);
  if(tabs.length!==1||!tab||typeof tab.id!=='number'||!Number.isSafeInteger(tab.id)||tab.windowId<0||tab.incognito!==false||tab.url!==url)throw fail('audio-settings-native-tab');
  return {id:tab.id,windowId:tab.windowId};
}
/** @param {import('playwright').Worker} worker @param {number} tabId */
async function documentId(worker,tabId){
  const rows=await worker.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'ISOLATED',func:()=>location.href}),tabId);
  if(rows.length!==1||rows[0]?.frameId!==0||typeof rows[0].documentId!=='string'||!rows[0].documentId)throw fail('audio-settings-native-document');
  return rows[0].documentId;
}
/** @param {AudioSettingsScenario} input @param {import('playwright').Page} first @param {import('playwright').Page} settings */
async function secondWindowProof(input,first,settings){
  const {context,worker,browserSession,extensionId}=input;
  const secondURL='https://chzzk.naver.com/live/dddddddddddddddddddddddddddddddd';
  const firstSession=await context.newCDPSession(first);
  let firstTarget;
  try{firstTarget=await firstSession.send('Target.getTargetInfo');}finally{await firstSession.detach();}
  const contextId=firstTarget.targetInfo.browserContextId;
  if(!contextId)throw fail('audio-settings-browser-context');
  const arriving=context.waitForEvent('page',{timeout:15000});
  const target=await browserSession.send('Target.createTarget',{url:'about:blank',newWindow:true,browserContextId:contextId});
  const second=await arriving;second.setDefaultTimeout(15000);
  const secondSession=await context.newCDPSession(second);
  try{if((await secondSession.send('Target.getTargetInfo')).targetInfo.targetId!==target.targetId)throw fail('audio-settings-window-target');}
  finally{await secondSession.detach();}
  const firstWindow=await browserSession.send('Browser.getWindowForTarget',{targetId:firstTarget.targetInfo.targetId});
  const secondWindow=await browserSession.send('Browser.getWindowForTarget',{targetId:target.targetId});
  if(firstWindow.windowId===secondWindow.windowId)throw fail('audio-settings-two-windows');
  await second.goto(secondURL,{waitUntil:'domcontentloaded'});
  await waitNative(()=>audioFacts(second),facts=>facts.owner===3&&facts.ready&&facts.decoded&&facts.blob,'audio-settings-second-source');
  await second.locator('.knife-comp button').click();
  await waitNative(()=>audioFacts(second),facts=>facts.audio?.state==='on'&&facts.audio.sources===1,'audio-settings-second-audio');
  const other=(await openInstalledMediaSettings({context,worker,fixturePage:second,extensionId,browserSession,mediaProtocol:3})).settingsPage;
  other.setDefaultTimeout(15000);await readyUI(other);await observeNativeInputs(other);
  const number=settings.locator('#compressorThreshold-number');await number.fill('');
  await numberInput(other,'#eq250-value','0.5',worker,raw=>record(raw.config)?.eq250===.5);
  const focus=await number.evaluate(input=>{
    if(!(input instanceof HTMLInputElement))throw new Error('audio-settings-number-type');
    return {focused:document.activeElement===input,disabled:input.disabled,value:input.value};
  });
  if(!focus.focused||focus.disabled||focus.value!=='')throw fail('audio-settings-native-focus-draft');
  await numberInput(settings,'#compressorThreshold-number','-36.1256',worker,raw=>record(raw.config)?.compressorThreshold===-36.1256);
  if(!(await number.evaluate(input=>document.activeElement===input))||await number.inputValue()!=='-36.1256')throw fail('audio-settings-native-focus-ack');
  await settings.keyboard.press('Tab');
  if(await number.inputValue()!=='-36.13'||record((await stored(worker)).config)?.compressorThreshold!==-36.1256)throw fail('audio-settings-native-rounding-write');
  await numberInput(other,'#eq250-value','0',worker,raw=>record(raw.config)?.eq250===0);
  const a='c'.repeat(32),b='d'.repeat(32);
  /** @type {[import('playwright').Page,string,number][]} */
  const channels=[[settings,a,25],[other,b,20]];
  for(const [page,id,arrows]of channels){
    await selectScope(page,'current');await page.locator('#media-audio-enable').click();
    await waitNative(()=>stored(worker),raw=>channelAudio(raw,id)!==null,'audio-settings-channel-enable');await readyUI(page);
    const value=await gainFromHome(page,arrows);
    await waitNative(()=>stored(worker),raw=>channelAudio(raw,id)?.audioGain===value&&channelAudio(raw,id)?.gainInherited===false,'audio-settings-channel-owned');await readyUI(page);
    if(Math.abs(value-(id===a ? .5 : .4))>1e-12)throw fail('audio-settings-native-owned-value');
  }
  await confirmClick(other,'#gainInherited',true);
  await waitNative(()=>stored(worker),raw=>channelAudio(raw,b)?.gainInherited===true,'audio-settings-inherit-bit');await readyUI(other);
  await selectScope(settings,'global');const inherited=await gainFromHome(settings,10);
  await waitNative(()=>stored(worker),raw=>record(raw.config)?.audioGain===inherited,'audio-settings-global-propagation');await readyUI(settings);
  await waitNative(async()=>({a:await audioFacts(first),b:await audioFacts(second)}),facts=>facts.a.effectiveGain===.5&&facts.b.effectiveGain===inherited&&
    facts.a.wanted===false&&facts.b.wanted===true,'audio-settings-owned-independent');
  await gainFromHome(settings,0);await waitNative(()=>stored(worker),raw=>record(raw.config)?.audioGain===0,'audio-settings-global-zero-restore');await readyUI(settings);
  await other.evaluate(()=>{
    const range=document.getElementById('audioGain'),status=document.getElementById('media-status');
    if(!(range instanceof HTMLInputElement)||!status)throw new Error('audio-settings-gain-diagnostic-missing');
    const events=/** @type {{time:number,type:string,value:string,phase:string|undefined,output:string|null,focused:boolean}[]} */([]);
    const state=/** @type {typeof globalThis & {__f01GainDraftEvents?:typeof events}} */(globalThis);state.__f01GainDraftEvents=events;
    const record=(/** @type {string} */type)=>{if(events.length<128)events.push({time:performance.now(),type,value:range.value,
      phase:status.dataset.phase,output:document.getElementById('audioGain-value')?.textContent??null,focused:document.activeElement===range});};
    range.addEventListener('input',()=>{record('input-before');queueMicrotask(()=>record('input-after'));},{capture:true});
    new MutationObserver(()=>record('render')).observe(status,{attributes:true,attributeFilter:['data-phase']});record('initial');
  });
  const restored=await gainFromHome(other,20);
  try{await waitNative(()=>stored(worker),raw=>channelAudio(raw,b)?.audioGain===restored&&channelAudio(raw,b)?.gainInherited===false,'audio-settings-owned-restore');}
  catch(error){
    retainGainDraftFailure(input,other,restored);
    throw error;
  }
  await readyUI(other);
  await selectScope(settings,'current');await settings.locator('#media-audio-save-preset').click();await settings.locator('#media-preset-create-name').fill('Keep original draft');
  const before=await stored(worker);await selectScope(settings,'global');
  if(!(await settings.locator('#media-preset-create').isDisabled())||await settings.locator('#media-preset-create-name').inputValue()!=='Keep original draft'||
    !isDeepStrictEqual(before,await stored(worker)))throw fail('audio-settings-native-preset-draft');
  await settings.locator('#media-audio-tab').click();await selectScope(settings,'current');
  const firstTab=await exactTab(worker,first.url()),secondTab=await exactTab(worker,second.url());
  if(firstTab.windowId===secondTab.windowId)throw fail('audio-settings-native-windows');
  return {second,other,firstTab,secondTab,cdpWindows:[firstWindow.windowId,secondWindow.windowId]};
}
/** @param {AudioSettingsScenario} input @param {import('playwright').Page} settings @param {import('playwright').Page} other @param {boolean} [aba] */
async function sameScopeProof(input,settings,other,aba=false){
  const channelId='c'.repeat(32);await selectScope(settings,'current');await selectScope(other,'saved:'+channelId);
  await settings.locator('#media-audio-preset').selectOption(aba?'recipe:compressor':'recipe:voice');await other.locator('#media-audio-preset').selectOption('recipe:voice');
  const before=await stored(input.worker),revision=record(before.mediaProfiles)?.revision;
  if(typeof revision!=='number')throw fail('audio-settings-race-revision');
  await input.worker.evaluate(()=>{
    const entries=/** @type {{action:string,tabId:number|undefined,frameId:number|undefined,documentId:string|undefined}[]} */([]);
    const observe=(/** @type {unknown} */message,/** @type {chrome.runtime.MessageSender} */sender)=>{
      if(message&&typeof message==='object'&&Reflect.get(message,'namespace')==='cheese-knife-settings'&&Reflect.get(message,'protocol')===3){
        const action=Reflect.get(message,'action');if(typeof action==='string'&&['replace-channel-domain','patch-channel-fields'].includes(action)&&entries.length<4)
          entries.push({action,tabId:sender.tab?.id,frameId:sender.frameId,documentId:sender.documentId});
      }return false;
    };
    const state=/** @type {typeof globalThis & {__f01NativeFullRequests?:typeof entries,__f01NativeFullRestore?:()=>void}} */(globalThis);
    if(state.__f01NativeFullRequests)throw new Error('audio-settings-cas-observer-exists');
    state.__f01NativeFullRequests=entries;state.__f01NativeFullRestore=()=>chrome.runtime.onMessage.removeListener(observe);chrome.runtime.onMessage.addListener(observe);
  });
  await settings.evaluate(()=>{
    const state=/** @type {typeof globalThis & {__f01NativeFullHold?:NativeFullHold}} */(globalThis);
    if(state.__f01NativeFullHold)throw new Error('audio-settings-cas-hold-exists');
    const original=chrome.runtime.sendMessage,descriptor=Object.getOwnPropertyDescriptor(chrome.runtime,'sendMessage');
    /** @type {unknown[]|null} */let held=null;
    /** @type {NativeFullHold} */const fault={calls:0,dispatches:0,code:null,stored:null,release(){
      if(!held||fault.calls!==1||fault.dispatches!==0)throw new Error('audio-settings-cas-dispatch');
      const message=held[0],callback=held[1];if(typeof callback!=='function')throw new Error('audio-settings-cas-callback');
      fault.dispatches++;held=null;
      Reflect.apply(original,chrome.runtime,[message,(/** @type {unknown} */reply)=>{
        if(reply&&typeof reply==='object'){
          const code=Reflect.get(reply,'code'),stored=Reflect.get(reply,'stored');fault.code=typeof code==='string'?code:null;fault.stored=typeof stored==='boolean'?stored:null;
        }
        Reflect.apply(callback,undefined,[reply]);
      }]);
    },restore(){if(descriptor)Object.defineProperty(chrome.runtime,'sendMessage',descriptor);else Reflect.deleteProperty(chrome.runtime,'sendMessage');}};
    state.__f01NativeFullHold=fault;
    Object.defineProperty(chrome.runtime,'sendMessage',{configurable:true,writable:true,
      /** @param {...unknown} args @returns {unknown} */value(...args){
        const message=args[0];
        if(message&&typeof message==='object'&&Reflect.get(message,'namespace')==='cheese-knife-settings'&&Reflect.get(message,'protocol')===3&&Reflect.get(message,'action')==='replace-channel-domain'){
          fault.calls++;if(held||fault.calls!==1||args.length!==2||typeof args[1]!=='function')throw new Error('audio-settings-cas-hold-duplicate');held=args;return;
        }
        return Reflect.apply(original,chrome.runtime,args);
      }});
  });
  try{
    await confirmClick(settings,'#media-audio-preset-apply',true);
    await settings.waitForFunction(()=>{
      const state=/** @type {typeof globalThis & {__f01NativeFullHold?:NativeFullHold}} */(globalThis);return state.__f01NativeFullHold?.calls===1;
    });
    if(!isDeepStrictEqual(before,await stored(input.worker)))throw fail('audio-settings-race-held-write');
    if(aba){
      const original=channelAudio(before,channelId)?.eq250;if(typeof original!=='number')throw fail('audio-settings-aba-original');
      const temporary=original===.75?1:.75;
      await numberInput(other,'#eq250-value',String(temporary),input.worker,raw=>channelAudio(raw,channelId)?.eq250===temporary);
      await numberInput(other,'#eq250-value',String(original),input.worker,raw=>channelAudio(raw,channelId)?.eq250===original);
    }else await confirmClick(other,'#media-audio-preset-apply',true);
    await waitNative(()=>stored(input.worker),raw=>record(raw.mediaProfiles)?.revision===revision+(aba?2:1),'audio-settings-race-first');
    await settings.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__f01NativeFullHold?:NativeFullHold}} */(globalThis);state.__f01NativeFullHold?.release();
    });
    await settings.waitForFunction(()=>document.getElementById('media-status')?.dataset.phase==='conflict',null,{timeout:15000});
    const fault=await settings.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__f01NativeFullHold?:NativeFullHold}} */(globalThis),held=state.__f01NativeFullHold;
      return held?{calls:held.calls,dispatches:held.dispatches,code:held.code,stored:held.stored}:null;
    });
    const senders=await input.worker.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__f01NativeFullRequests?:{action:string,tabId:number|undefined,frameId:number|undefined,documentId:string|undefined}[]}} */(globalThis);return state.__f01NativeFullRequests??[];
    });
    const a=await settings.evaluate(()=>chrome.tabs.getCurrent()),b=await other.evaluate(()=>chrome.tabs.getCurrent());
    const full=senders.filter(row=>row.action==='replace-channel-domain'),patches=senders.filter(row=>row.action==='patch-channel-fields');
    if(fault?.calls!==1||fault.dispatches!==1||fault.code!=='conflict'||fault.stored!==false||senders.length!==(aba?3:2)||full.length!==(aba?1:2)||patches.length!==(aba?2:0)||
      senders.slice(0,-1).some(row=>row.tabId!==b?.id||row.documentId!==senders[0]?.documentId)||senders.at(-1)?.tabId!==a?.id||a?.id===b?.id||
      !senders.every(sender=>sender.frameId===0&&typeof sender.documentId==='string'&&sender.documentId.length>0)||senders[0]?.documentId===senders.at(-1)?.documentId)throw fail('audio-settings-race-native-requests');
    const after=await stored(input.worker),audio=channelAudio(after,channelId);
    if(aba){
      const expected=structuredClone(before),store=record(expected.mediaProfiles),channels=store?.channels;
      const channel=Array.isArray(channels)?channels.map(record).find(row=>row?.channelId===channelId):null;
      if(!store||!channel||typeof channel.revision!=='number')throw fail('audio-settings-aba-original');
      store.revision=revision+2;channel.revision+=2;if(!isDeepStrictEqual(after,expected))throw fail('audio-settings-aba-values');
    }else if(record(after.mediaProfiles)?.revision!==revision+1||audio?.audioGain!==.5||audio.gainInherited!==false||audio.eqEnabled!==true||audio.eq63!==-2||audio.eq2000!==2)throw fail('audio-settings-race-loss');
    await settings.locator('#media-discard').click();await readyUI(settings);await readyUI(other);await selectScope(other,'current');
    return {nativeFullRequests:full.length,nativePatchRequests:patches.length,heldDispatches:fault.dispatches,committedRevisionDelta:Number(record(after.mediaProfiles)?.revision)-revision,
      valuesRestored:aba,lateCode:fault.code,lateStored:fault.stored};
  }finally{
    await settings.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__f01NativeFullHold?:NativeFullHold}} */(globalThis);state.__f01NativeFullHold?.restore();delete state.__f01NativeFullHold;
    });
    await input.worker.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__f01NativeFullRequests?:unknown,__f01NativeFullRestore?:()=>void}} */(globalThis);
      state.__f01NativeFullRestore?.();delete state.__f01NativeFullRequests;delete state.__f01NativeFullRestore;
    });
  }
}
/** @typedef {{calls:number,dispatches:number,code:string|null,stored:boolean|null,release:()=>void,restore:()=>void}} NativeFullHold */
/** @param {AudioSettingsScenario} input @param {import('playwright').Page} settings @param {{id:number,windowId:number}} target */
async function unrelatedStyleProof(input,settings,target){
  await selectScope(settings,'global');const styles=await input.context.newPage();styles.setDefaultTimeout(15000);
  let observing=false;
  try{
    await styles.goto(`chrome-extension://${input.extensionId}/styles.html?targetTabId=${target.id}&targetWindowId=${target.windowId}`,{waitUntil:'domcontentloaded'});
    await styles.locator('#settings-status[data-phase="ready"]').waitFor();
    const before=await stored(input.worker),revision=before.settingsRevision,config=record(before.config),prior=before.styles;
    if(typeof revision!=='number'||!config||prior!==undefined&&(!Array.isArray(prior)||prior.some(value=>typeof value!=='string'))||
      Array.isArray(prior)&&prior.includes('hide-ranking')||config.eq4000===.5)throw fail('audio-settings-merge-baseline');
    await input.worker.evaluate(()=>{
      const entries=/** @type {{protocol:number,own:boolean,tabId:number|undefined,frame:number|undefined,documentId:string|undefined}[]} */([]);
      const observe=(/** @type {unknown} */message,/** @type {chrome.runtime.MessageSender} */sender)=>{
        if(!message||typeof message!=='object'||Reflect.get(message,'namespace')!=='cheese-knife-settings')return false;
        const protocol=Reflect.get(message,'protocol'),action=Reflect.get(message,'action');
        if((protocol===1&&action==='patch'||protocol===3&&action==='patch-global-fields')&&entries.length<8)
          entries.push({protocol,own:sender.id===chrome.runtime.id,tabId:sender.tab?.id,frame:sender.frameId,documentId:sender.documentId});return false;
      };
      const state=/** @type {typeof globalThis & {__f01MergeEntries?:typeof entries,__f01MergeRestore?:()=>void}} */(globalThis);
      if(state.__f01MergeEntries)throw new Error('audio-settings-merge-observer-exists');state.__f01MergeEntries=entries;
      state.__f01MergeRestore=()=>chrome.runtime.onMessage.removeListener(observe);chrome.runtime.onMessage.addListener(observe);
    });observing=true;
    await Promise.all([styles.locator('#hide-ranking').check(),settings.locator('#eq4000-value').fill('0.5')]);
    const after=await waitNative(()=>stored(input.worker),raw=>record(raw.config)?.eq4000===.5&&Array.isArray(raw.styles)&&raw.styles.includes('hide-ranking'),'audio-settings-merge-lost');
    await styles.locator('#settings-status[data-phase="ready"]').waitFor();await readyUI(settings);
    const expected=structuredClone(before),expectedConfig=record(expected.config);if(!expectedConfig)throw fail('audio-settings-merge-baseline');
    expectedConfig.eq4000=.5;expected.styles=[...(Array.isArray(prior)?prior:[]),'hide-ranking'];expected.settingsRevision=revision+2;
    if(!isDeepStrictEqual(after,expected))throw fail('audio-settings-merge-unknown-loss');
    const rows=await input.worker.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__f01MergeEntries?:{protocol:number,own:boolean,tabId:number|undefined,frame:number|undefined,documentId:string|undefined}[]}} */(globalThis);
      return state.__f01MergeEntries??[];
    });
    const a=await styles.evaluate(()=>chrome.tabs.getCurrent()),b=await settings.evaluate(()=>chrome.tabs.getCurrent()),styleRow=rows.find(row=>row.protocol===1),mediaRow=rows.find(row=>row.protocol===3);
    if(rows.length!==2||styleRow?.tabId!==a?.id||mediaRow?.tabId!==b?.id||a?.id===b?.id||styleRow?.documentId===mediaRow?.documentId||
      !rows.every(row=>row.own&&row.frame===0&&typeof row.documentId==='string'&&row.documentId.length>0))throw fail('audio-settings-merge-senders');
    const registered=await input.worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts({ids:['styles']}));
    if(registered.length!==1||!registered[0]?.css?.includes('styles/hide-ranking.css'))throw fail('audio-settings-merge-style-registration');
    await selectScope(settings,'current');
    return {nativeRequests:rows.length,nativeDocumentsDistinct:true,globalRevisionDelta:2,mediaUnchanged:true,unknownRawPreserved:true,styleEnabled:true,eqValue:.5};
  }finally{
    if(observing)await input.worker.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__f01MergeEntries?:unknown,__f01MergeRestore?:()=>void}} */(globalThis);
      state.__f01MergeRestore?.();delete state.__f01MergeEntries;delete state.__f01MergeRestore;
    });
    await styles.close();
  }
}
/** @param {AudioSettingsScenario} input @param {import('playwright').Page} other */
async function unknownAckProof(input,other){
  await other.bringToFront();
  await readyUI(other);
  await other.evaluate(()=>{
    const state=/** @type {typeof globalThis & {__f01NativeAckFault?:{calls:number,dropped:boolean,restore:()=>void}}} */(globalThis);
    if(state.__f01NativeAckFault)throw new Error('audio-settings-ack-fault-exists');
    const original=chrome.runtime.sendMessage,descriptor=Object.getOwnPropertyDescriptor(chrome.runtime,'sendMessage');
    if(descriptor&&!descriptor.configurable&&!descriptor.writable)throw new Error('audio-settings-ack-fault-unavailable');
    const fault={calls:0,dropped:false,restore(){
      if(descriptor)Object.defineProperty(chrome.runtime,'sendMessage',descriptor);else Reflect.deleteProperty(chrome.runtime,'sendMessage');
    }};
    state.__f01NativeAckFault=fault;
    Object.defineProperty(chrome.runtime,'sendMessage',{configurable:true,writable:true,
      /** @param {...unknown} args @returns {unknown} */value(...args){
        const message=args.at(0);
        const request=message&&typeof message==='object'?/** @type {Record<string,unknown>} */(message):null;
        const patch=request?.patch&&typeof request.patch==='object'?/** @type {Record<string,unknown>} */(request.patch):null;
        if(request?.namespace==='cheese-knife-settings'&&request.protocol===3&&request.action==='patch-channel-fields'&&patch&&Object.hasOwn(patch,'compressorKnee')){
          fault.calls++;
          if(!fault.dropped&&args.length===2&&typeof args.at(1)==='function'){fault.dropped=true;return Reflect.apply(original,chrome.runtime,[message,()=>{}]);}
        }
        return Reflect.apply(original,chrome.runtime,args);
      }});
  });
  try{
    await other.locator('#compressorKnee-number').fill('35');
    await waitNative(()=>stored(input.worker),raw=>channelAudio(raw,'d'.repeat(32))?.compressorKnee===35,'audio-settings-unknown-saved');
    await other.locator('#compressorKnee-number').fill('36');
    await other.waitForFunction(()=>document.getElementById('media-status')?.dataset.phase==='unknown',null,{timeout:15000});
    const before=await stored(input.worker);await other.locator('#media-refresh').click();
    await other.waitForTimeout(300);
    const observation=await other.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__f01NativeAckFault?:{calls:number,dropped:boolean}}} */(globalThis);
      return {calls:state.__f01NativeAckFault?.calls,dropped:state.__f01NativeAckFault?.dropped,
        phase:document.getElementById('media-status')?.dataset.phase,draft:document.getElementById('media-draft')?.textContent};
    });
    if(!observation.dropped||observation.calls!==1||observation.phase!=='unknown'||!observation.draft?.includes('36')||
      !isDeepStrictEqual(before,await stored(input.worker)))throw fail('audio-settings-unknown-retried');
  }finally{
    await other.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__f01NativeAckFault?:{restore:()=>void}}} */(globalThis);
      state.__f01NativeAckFault?.restore();delete state.__f01NativeAckFault;
    });
  }
  await other.locator('#media-discard').click();await readyUI(other);
  if(await other.locator('#compressorKnee-number').inputValue()!=='35.00')throw fail('audio-settings-unknown-discard');
}
/** @param {import('playwright').Page} page @param {{id:number,windowId:number}} tab @param {string} routePath */
async function captureNativeTarget(page,tab,routePath){
  const target={tabId:tab.id,windowId:tab.windowId,routePath};
  /** @type {unknown} */const reply=await page.evaluate(target=>chrome.runtime.sendMessage({namespace:'cheese-knife-settings',protocol:3,
    action:'get-audio-state',requestId:'native-target-read',target}),target);
  const value=record(reply),binding=record(value?.audioState);
  if(value?.ok!==true||value.stored!==false||!binding||typeof binding.documentId!=='string'||!binding.documentId){
    const code=typeof value?.code==='string'&&/^[a-z-]{1,80}$/.test(value.code)?value.code:'invalid-reply';
    throw fail('audio-settings-target-read-'+code);
  }
  return {target,binding};
}
/** @param {import('playwright').Page} page @param {Awaited<ReturnType<typeof captureNativeTarget>>} captured @param {boolean} wanted @param {string} expected @param {string} [stage] */
async function rejectNativeTarget(page,captured,wanted,expected,stage='target'){
  /** @type {unknown} */const raw=await page.evaluate(request=>chrome.runtime.sendMessage(request),{namespace:'cheese-knife-settings',protocol:3,
    action:'set-audio-wanted',requestId:'native-target-reject',...captured,wanted});
  const reply=record(raw);
  if(reply?.ok!==false||reply.stored!==false||reply.stage!==stage||reply.code!==expected)throw fail('audio-settings-target-denial-unconfirmed');
}
/** @param {import('playwright').Worker} worker @param {import('playwright').Page} first
 * @param {Pick<Awaited<ReturnType<typeof secondWindowProof>>,'other'|'secondTab'>} state */
export async function closeSecondAudioWindow(worker,first,state){
  if(state.other.isClosed())throw fail('audio-settings-second-window-unobserved');
  await worker.evaluate(id=>chrome.windows.remove(id),state.secondTab.windowId);
  await waitNative(async()=>state.other.isClosed(),closed=>closed,'audio-settings-second-window-open');
  await first.bringToFront();
}
/** @param {AudioSettingsScenario} input @param {import('playwright').Page} first @param {import('playwright').Page} settings
 * @param {Awaited<ReturnType<typeof secondWindowProof>>} secondState */
async function targetAndLifecycleProof(input,first,settings,secondState){
  const {second,other,firstTab,secondTab}=secondState;
  await settings.bringToFront();
  const hiddenObserved=(await waitNative(()=>audioFacts(first),facts=>facts.hidden===true,'audio-settings-hidden-unobserved')).hidden;
  await settings.locator('#audioDefault').check();
  await waitNative(()=>stored(input.worker),raw=>channelAudio(raw,'c'.repeat(32))?.audioDefault===true,'audio-settings-channel-default');await readyUI(settings);
  if((await audioFacts(first)).wanted!==false)throw fail('audio-settings-default-reset-manual');
  await other.bringToFront();
  await other.locator('#media-refresh').click();
  await other.locator('#audio-master:not([disabled])').waitFor();
  const secondBinding=await captureNativeTarget(other,secondTab,new URL(second.url()).pathname);
  const oldDocument=await documentId(input.worker,secondTab.id),before=await stored(input.worker);
  await second.bringToFront();
  await second.reload({waitUntil:'domcontentloaded'});
  await waitNative(()=>audioFacts(second),facts=>facts.ready&&facts.decoded&&facts.blob,'audio-settings-replacement-ready');
  await second.locator('.knife-comp button').click();await waitNative(()=>audioFacts(second),facts=>facts.wanted===true&&facts.audio?.state==='on','audio-settings-replacement-on');
  if(await documentId(input.worker,secondTab.id)===oldDocument)throw fail('audio-settings-replacement-not-observed');
  await rejectNativeTarget(other,secondBinding,false,'audio-target-changed');
  await other.bringToFront();
  await other.locator('#audio-master').click();
  await other.locator('#audio-master:disabled').waitFor();
  if((await audioFacts(second)).wanted!==true||!isDeepStrictEqual(before,await stored(input.worker)))throw fail('audio-settings-document-retarget');
  const firstBinding=await captureNativeTarget(settings,firstTab,new URL(first.url()).pathname);
  await settings.bringToFront();
  await input.worker.evaluate(({id,windowId})=>chrome.tabs.move(id,{windowId,index:-1}),{id:firstTab.id,windowId:secondTab.windowId});
  try{
    await rejectNativeTarget(settings,firstBinding,true,'target-context-changed');
    await settings.locator('#audio-master').click();await settings.locator('#audio-master:disabled').waitFor();
    if((await audioFacts(first)).wanted!==false||!isDeepStrictEqual(before,await stored(input.worker)))throw fail('audio-settings-window-retarget');
  }finally{await input.worker.evaluate(({id,windowId})=>chrome.tabs.move(id,{windowId,index:-1}),firstTab);}
  await settings.bringToFront();
  await settings.locator('#media-refresh').click();await settings.locator('#audio-master:not([disabled])').waitFor();
  await first.evaluate(()=>{
    const video=document.querySelector('video'),old=video?.closest('.pzp-pc');if(!video||!old)throw new Error('audio-settings-pzp-source');
    const next=document.createElement('div'),picture=document.createElement('div'),controls=document.createElement('div'),volume=document.createElement('div');
    next.className='pzp-pc';picture.className='pzp-pc__video';controls.className='pzp-pc__bottom-buttons-left';volume.className='pzp-pc__volume-control';
    picture.append(video);controls.append(volume);next.append(picture,controls);old.replaceWith(next);
  });
  await waitNative(()=>audioFacts(first),facts=>facts.ready&&facts.wanted===false&&facts.audio?.sources===1,'audio-settings-pzp-reset');
  await first.evaluate(()=>{
    const old=document.querySelector('video');if(!old)throw new Error('audio-settings-video-source');
    const video=document.createElement('video');video.muted=old.muted;video.volume=old.volume;video.loop=true;video.playsInline=true;video.src=old.currentSrc;
    old.replaceWith(video);void video.play().catch(()=>{});
  });
  await waitNative(()=>audioFacts(first),facts=>facts.decoded&&facts.blob&&facts.wanted===true&&facts.audio?.state==='on'&&facts.audio.sources===1,'audio-settings-new-video-default');
  const session=await input.context.newCDPSession(first);
  try{
    await session.send('Performance.enable');const beforeClose=await session.send('Performance.getMetrics');
    await other.bringToFront();
    await other.locator('#media-refresh').click();await other.locator('#audio-master:not([disabled])').waitFor();
    const closedBinding=await captureNativeTarget(other,secondTab,new URL(second.url()).pathname);
    await input.worker.evaluate(id=>chrome.tabs.remove(id),secondTab.id);await waitNative(async()=>second.isClosed(),closed=>closed,'audio-settings-original-target-open');
    const closedNativeMissing=await input.worker.evaluate(async id=>{
      try{await chrome.tabs.get(id);return false;}catch{return (await chrome.runtime.getContexts({tabIds:[id]})).length===0;}
    },secondTab.id);
    if(!closedNativeMissing||other.isClosed())throw fail('audio-settings-original-target-present');
    await rejectNativeTarget(other,closedBinding,false,'settings-operation-failed','read');
    if(await other.locator('#audio-master').isEnabled())await other.locator('#audio-master').click();
    await other.locator('#audio-master:disabled').waitFor();
    if(!isDeepStrictEqual(before,await stored(input.worker)))throw fail('audio-settings-closed-target-write');
    const secondInputs=await nativeInputProof(other,input.observation,'other');
    await closeSecondAudioWindow(input.worker,first,secondState);
    const visibleRestored=!(await waitNative(()=>audioFacts(first),facts=>facts.hidden===false,'audio-settings-visible-unobserved')).hidden;
    const time=await first.locator('video').evaluate(video=>{
      if(!(video instanceof HTMLVideoElement))throw new Error('audio-settings-video-type');return video.currentTime;
    });await first.waitForTimeout(500);
    const after=await audioFacts(first),nextTime=await first.locator('video').evaluate(video=>{
      if(!(video instanceof HTMLVideoElement))throw new Error('audio-settings-video-type');return video.currentTime;
    });
    if(after.wanted!==true||after.audio?.sources!==1||after.muted!==true||after.volume!==.5||Math.abs(nextTime-time)<.01)throw fail('audio-settings-other-window-stopped');
    const afterClose=await session.send('Performance.getMetrics');
    /** @param {typeof beforeClose} metrics */const heap=metrics=>metrics.metrics.find(metric=>metric.name==='JSHeapUsedSize')?.value;
    if(!Number.isFinite(heap(beforeClose))||!Number.isFinite(heap(afterClose))||(heap(beforeClose)??0)<=0||(heap(afterClose)??0)<=0)throw fail('audio-settings-memory-unobserved');
    return {beforeHeap:heap(beforeClose),afterHeap:heap(afterClose),oneWindowClosed:true,remainingNativeSource:1,secondInputs,hiddenObserved,visibleRestored,closedNativeMissing,
      closedReplyStage:'read',closedReplyCode:'settings-operation-failed',closedUiDisabled:true};
  }finally{await session.detach();}
}
/** @param {AudioSettingsScenario} input @param {import('playwright').Page} settings */
async function quotaProof(input,settings){
  await settings.bringToFront();
  await selectScope(settings,'global');const before=await stored(input.worker);
  const quota=await input.worker.evaluate(async()=>{
    const area=chrome.storage.local,key='__f01NativeQuotaPadding';
    if(Object.hasOwn(await area.get(null),key))throw new Error('audio-settings-quota-key-exists');
    await area.set({__f01NativeQuotaPadding:'Q'});const used=await area.getBytesInUse(null),length=1+area.QUOTA_BYTES-used;
    if(!Number.isSafeInteger(length)||length<1||length>16*1024*1024)throw new Error('audio-settings-quota-size');
    await area.set({__f01NativeQuotaPadding:'Q'.repeat(length)});const full=await area.getBytesInUse(null);
    if(full!==area.QUOTA_BYTES)throw new Error('audio-settings-quota-not-full');return full;
  });
  try{
    await settings.locator('#normalizerTargetDbfs').fill('-20.123456');
    await settings.waitForFunction(()=>document.getElementById('media-status')?.dataset.phase==='failed'&&
      document.getElementById('media-status')?.textContent?.includes('storage-write-failed'),null,{timeout:15000});
    /** @type {unknown} */const raw=await input.worker.evaluate(()=>chrome.storage.local.get(['config','settingsRevision','mediaProfiles']));
    const expected={config:before.config,settingsRevision:before.settingsRevision,mediaProfiles:before.mediaProfiles};
    if(!isDeepStrictEqual(raw,expected))throw fail('audio-settings-quota-lost-data');
  }finally{await input.worker.evaluate(()=>chrome.storage.local.remove('__f01NativeQuotaPadding'));}
  if(!isDeepStrictEqual(before,await stored(input.worker)))throw fail('audio-settings-quota-cleanup');
  await settings.locator('#media-discard').click();await readyUI(settings);return {actualQuotaFailure:true,bytesAtLimit:quota};
}
/** @param {AudioSettingsScenario} input @param {import('playwright').Page} settings */
async function restartWorkerProof(input,settings){
  const before=await stored(input.worker),url=input.worker.url();
  const beforeRealm=await input.worker.evaluate(()=>{
    const state=/** @type {typeof globalThis & {__f01NativeWorkerMarker?:string}} */(globalThis);
    if(state.__f01NativeWorkerMarker)throw new Error('audio-settings-worker-marker-exists');
    state.__f01NativeWorkerMarker=crypto.randomUUID();return {marker:state.__f01NativeWorkerMarker,timeOrigin:performance.timeOrigin};
  });
  const targets=(await input.browserSession.send('Target.getTargets')).targetInfos.filter(target=>target.type==='service_worker'&&target.url===url);
  const old=targets.at(0);if(targets.length!==1||!old)throw fail('audio-settings-worker-target');
  const inspector=await input.context.newCDPSession(settings);
  /** @type {Map<string,{versionId:string,scriptURL:string,runningStatus:string}>} */const versions=new Map();let overflow=false;
  const observe=(/** @type {{versions:readonly {versionId:string,scriptURL:string,runningStatus:string}[]}} */event)=>{
    for(const version of event.versions)if(version.scriptURL===url){
      if(!versions.has(version.versionId)&&versions.size>=4){overflow=true;continue;}
      versions.set(version.versionId,{versionId:version.versionId,scriptURL:version.scriptURL,runningStatus:version.runningStatus});
    }
  };
  inspector.on('ServiceWorker.workerVersionUpdated',observe);
  try{
    await inspector.send('ServiceWorker.enable');
    const rows=await waitNative(async()=>[...versions.values()].filter(version=>version.runningStatus==='running'),values=>!overflow&&values.length===1,'audio-settings-worker-version');
    const version=rows[0];if(!version)throw fail('audio-settings-worker-version');
    await inspector.send('ServiceWorker.stopWorker',{versionId:version.versionId});
    await waitNative(async()=>versions.get(version.versionId)?.runningStatus,value=>!overflow&&value==='stopped','audio-settings-worker-not-stopped');
    await settings.locator('#media-refresh').click();
    const previous=input.worker;
    const workers=await waitNative(async()=>input.context.serviceWorkers().filter(worker=>worker.url()===url),values=>values.length===1,'audio-settings-worker-unavailable');
    const worker=workers[0];if(!worker||await worker.evaluate(()=>chrome.runtime.id)!==input.extensionId)throw fail('audio-settings-worker-not-replaced');
    const realm=await worker.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__f01NativeWorkerMarker?:string}} */(globalThis);
      return {markerAbsent:!Object.hasOwn(state,'__f01NativeWorkerMarker'),timeOrigin:performance.timeOrigin};
    });
    if(!realm.markerAbsent||!Number.isFinite(realm.timeOrigin)||realm.timeOrigin<=beforeRealm.timeOrigin)throw fail('audio-settings-worker-realm-unchanged');
    await waitNative(async()=>versions.get(version.versionId)?.runningStatus,value=>!overflow&&value==='running','audio-settings-worker-not-running');
    await waitNative(()=>stored(worker),raw=>isDeepStrictEqual(raw,before),'audio-settings-worker-storage-loss');await readyUI(settings);
    const current=(await input.browserSession.send('Target.getTargets')).targetInfos.filter(target=>target.type==='service_worker'&&target.url===url);
    if(current.length!==1||!current[0])throw fail('audio-settings-worker-not-replaced');
    input.worker=worker;return {actualWorkerReplacement:true,nativeStopped:true,nativeRunning:true,markerAbsent:realm.markerAbsent,
      beforeTimeOrigin:beforeRealm.timeOrigin,afterTimeOrigin:realm.timeOrigin,wrapperReused:worker===previous,targetReused:current[0].targetId===old.targetId};
  }finally{
    inspector.off('ServiceWorker.workerVersionUpdated',observe);try{await inspector.send('ServiceWorker.disable');}finally{await inspector.detach();}
  }
}
/** @param {Pick<AudioSettingsScenario,'worker'>} input @returns {Promise<AudioLossObservation[]>} */
export async function lossControls(input){
  const before=await stored(input.worker),observations=[];
  for(const caseId of ['owned-gain','inherit-bit','eq-band','preset-id']){
    /** @type {unknown} */let primaryError;let primaryFailed=false;
    try{
      await input.worker.evaluate(async caseId=>{
        const raw=await chrome.storage.local.get(['config','mediaProfiles']);
        if(caseId==='preset-id'){
          const store=raw.mediaProfiles;
          if(!store||typeof store!=='object'||Array.isArray(store))throw new Error('audio-settings-loss-store');
          /** @type {unknown} */const presets=Reflect.get(store,'presets');
          const preset=Array.isArray(presets)&&presets.length===1?presets.at(0):null;
          if(!preset||typeof preset!=='object'||!Object.hasOwn(preset,'id'))throw new Error('audio-settings-loss-preset');
          Reflect.deleteProperty(preset,'id');await chrome.storage.local.set({mediaProfiles:store});
        }else{
          const config=raw.config,key=caseId==='owned-gain'?'audioGain':caseId==='inherit-bit'?'gainInherited':caseId==='eq-band'?'eq125':null;
          if(!key||!config||typeof config!=='object'||!Object.hasOwn(config,key))throw new Error('audio-settings-loss-field');
          Reflect.deleteProperty(config,key);await chrome.storage.local.set({config});
        }
      },caseId);
      const result=matchAudioStorageLoss(before,await stored(input.worker),caseId);
      if(!result)throw fail('audio-settings-loss-unmatched');observations.push(result);
    }catch(error){primaryError=error;primaryFailed=true;}
    try{
      await input.worker.evaluate(raw=>chrome.storage.local.set(raw),before);
      if(!isDeepStrictEqual(before,await stored(input.worker)))throw fail('audio-settings-loss-restore');
    }catch(restorationError){
      if(primaryFailed)throw Object.assign(fail('audio-settings-loss-control-failed'),{cause:primaryError,restorationError});
      throw restorationError;
    }
    if(primaryFailed)throw primaryError;
  }
  return observations;
}

/** @param {AudioSettingsScenario} input @param {AudioSettingsOptions} options @returns {Promise<unknown>} */
async function scenario(input,options){
  const {context,worker,browserSession,extensionId}=input;

  const firstURL='https://chzzk.naver.com/live/cccccccccccccccccccccccccccccccc';
  const responses=new Map(input.responses.map(response=>[response.url,response]));
  const html=responses.get(firstURL);if(!html)throw fail('audio-settings-fixture-pin');
  responses.set('https://chzzk.naver.com/live/dddddddddddddddddddddddddddddddd',{...html,url:'https://chzzk.naver.com/live/dddddddddddddddddddddddddddddddd'});
  await context.route(/^https?:\/\//,async route=>{
    const response=responses.get(route.request().url());
    if(response)await route.fulfill({status:response.status,contentType:response.contentType,body:response.body});
    else await route.abort('blockedbyclient');
  });
  const first=await context.newPage();first.setDefaultTimeout(15000);await first.goto(firstURL,{waitUntil:'domcontentloaded'});
  await waitNative(()=>audioFacts(first),facts=>facts.owner===3&&facts.ready&&facts.decoded&&facts.blob,'audio-settings-native-source');
  await first.locator('.knife-comp button').click();
  await waitNative(()=>audioFacts(first),facts=>facts.audio?.state==='on'&&facts.audio.sources===1,'audio-settings-native-audio');
  const initial=await stored(worker);
  const opened=await openInstalledMediaSettings({context,worker,fixturePage:first,extensionId,browserSession,mediaProtocol:3});
  const settings=opened.settingsPage;settings.setDefaultTimeout(15000);await readyUI(settings);await observeNativeInputs(settings);
  await captureNativeTarget(settings,await exactTab(worker,firstURL),new URL(firstURL).pathname);
  if(!isDeepStrictEqual(initial,await stored(worker)))throw fail('audio-settings-bootstrap-write');
  const globalGain=await gainFromHome(settings,0);
  if(globalGain!==0)throw fail('audio-settings-native-zero');
  await waitNative(()=>stored(worker),raw=>record(raw.config)?.audioGain===0&&record(raw.config)?.gainInherited===false,'audio-settings-global-gain');await readyUI(settings);
  await settings.locator('#eqEnabled').check();await readyUI(settings);
  await numberInput(settings,'#eq125-value','1.25',worker,raw=>record(raw.config)?.eq125===1.25);
  const expected=await stored(worker);
  if(record(expected.config)?.eqEnabled!==true||Object.hasOwn(expected,'mediaProfiles'))throw fail('audio-settings-global-field-merge');
  const layout=await layoutProof(settings,input),presetEntry=await presetAndMasterProof(input,settings,first);await dialProof(input,settings);
  const secondState=await secondWindowProof(input,first,settings),sameScope=await sameScopeProof(input,settings,secondState.other),aba=await sameScopeProof(input,settings,secondState.other,true);
  const unrelatedMerge=await unrelatedStyleProof(input,settings,secondState.firstTab);await unknownAckProof(input,secondState.other);
  const lifecycle=await targetAndLifecycleProof(input,first,settings,secondState),quota=await quotaProof(input,settings);
  const workerRestart=await restartWorkerProof(input,settings);
  const controls=options.control?await lossControls(input):[],firstInputs=await nativeInputProof(settings,input.observation,'settings');

  return {audioSettings:{passed:options.control===null,checks:[...checks],lossControls:controls,layout,lifecycle,quota,workerRestart,sameScope,aba,unrelatedMerge,presetEntry,
    nativeWindows:secondState.cdpWindows,nativeTabWindows:[secondState.firstTab.windowId,secondState.secondTab.windowId],nativeInputs:[firstInputs,lifecycle.secondInputs],physicalAudioNotEvaluated:true},pageErrors:[]};
}

/** @param {AudioSettingsOptions} input @param {(options:AudioSettingsExecution)=>Promise<unknown>} [execute] */
export async function runInstalledAudioSettings(input,execute=executeNative){
  const {runId,headed,control,normalRunId}=input??{};
  const options=Object.freeze({runId,headed,control,...normalRunId!==undefined?{normalRunId}:{}});
  if(!validAudioSettingsOptions(options))throw fail('audio-settings-args');
  const raw=await execute({runId:options.runId,headed:options.headed,qualification:'audio-settings',dependencies:{
    launchInstalledExtension:launchVisibilityExtension,
    createAudioSettingsObservation,
    ...typeof normalRunId==='string'?{readAudioSettingsNormal:files=>readAudioSettingsNormal(files,normalRunId)}:{},
    mediaScenario:input=>boundedAudioScenario(()=>scenario(input,options),180000),
  }});
  return assertAudioSettingsReport(raw,options);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await runInstalledAudioSettings(parseAudioSettingsArgs(process.argv.slice(2))),null,2));}
  catch(error){console.error(error instanceof Error?error.message:'audio-settings-failed');process.exitCode=1;}
}
