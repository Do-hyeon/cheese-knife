/// <reference types="chrome" />
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {openInstalledMediaSettings} from './popup-cdp.mjs';

const F00_COMMIT='ae9f8e50a22dae9d549f1e476d302549ecc03b4a';
const F00_INVENTORY='9715087af1aa2b36fc54b330e5a879ce384f4c9a4f56faf1c6fd8847436580df';
/** @param {string} code */
const fail=code=>Object.assign(new Error(code),{code});
/** @param {unknown} value @returns {Record<string,unknown>|null} */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?/** @type {Record<string,unknown>} */(value):null;
/** @param {string|Uint8Array} value */
const hash=value=>createHash('sha256').update(value).digest('hex');
/** @typedef {{name:string,bytes:number,sha256:string}} FrozenRow */
/** @typedef {{runId:string,headed:boolean,mediaSchema:'f01',control?:'storage-loss'}} F01TransitionOptions */

/** @param {readonly string[]} args @returns {F01TransitionOptions} */
export function parseF01TransitionArgs(args){
  let runId,headed=false,schema=false;
  /** @type {'storage-loss'|undefined} */let control;
  for(const arg of args){
    if(typeof arg!=='string')throw fail('f01-transition-args');
    if(arg.startsWith('--run-id=')&&runId===undefined)runId=arg.slice(9);
    else if(arg==='--headed'&&!headed)headed=true;
    else if(arg==='--media-schema=f01'&&!schema)schema=true;
    else if(arg==='--control=storage-loss'&&control===undefined)control='storage-loss';
    else throw fail('f01-transition-args');
  }
  if(!schema||typeof runId!=='string'||!/^[A-Za-z0-9]{1,64}$/.test(runId))throw fail('f01-transition-args');
  return {runId,headed,mediaSchema:'f01',...(control?{control}:{})};
}

/** Read only the pinned Git objects, never mutable root dist files or a remote checkout.
 * @param {string} repositoryRoot @param {unknown} metadata */
export function readFrozenF00Payload(repositoryRoot,metadata){
  if(typeof repositoryRoot!=='string'||!path.isAbsolute(repositoryRoot))throw fail('f01-f00-root');
  const value=record(metadata);
  if(!value||value.sourceCommit!==F00_COMMIT||value.inventorySha256!==F00_INVENTORY||!Array.isArray(value.entries)||value.entries.length!==59)throw fail('f01-f00-payload-metadata');
  /** @type {FrozenRow[]} */const rows=[];let total=0,previous='';/** @type {Set<string>} */const names=new Set();
  for(const entry of value.entries){
    const row=record(entry);
    if(!row||Object.keys(row).sort().join(',')!=='bytes,name,sha256'||typeof row.name!=='string'||row.name<=previous||row.name.length>256||
      !row.name.split('/').every(part=>/^[A-Za-z0-9_.-]+$/.test(part)&&part!=='.'&&part!=='..')||names.has(row.name.toLowerCase())||
      typeof row.bytes!=='number'||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>1048576||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256))throw fail('f01-f00-payload-metadata');
    rows.push({name:row.name,bytes:row.bytes,sha256:row.sha256});previous=row.name;names.add(row.name.toLowerCase());total+=row.bytes;
  }
  if(total>2097152||hash(JSON.stringify(rows.map(row=>[row.name,row.sha256])))!==F00_INVENTORY)throw fail('f01-f00-payload-metadata');
  const entries=rows.map(row=>{
    let bytes;
    try{bytes=execFileSync('git',['show',F00_COMMIT+':'+row.name],{cwd:repositoryRoot,stdio:['ignore','pipe','pipe'],timeout:15000,maxBuffer:1048576,windowsHide:true});}
    catch{throw fail('f01-f00-payload-git');}
    if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw fail('f01-f00-payload-bytes');
    return {name:row.name,bytes,sha256:row.sha256};
  });
  return {sourceCommit:F00_COMMIT,inventorySha256:F00_INVENTORY,entries};
}

/** @typedef {'valid-v1'|'absent'|'global-max'|'media-max'|'corrupt'|'future'} F01TransitionCase */
/** @type {readonly F01TransitionCase[]} */
export const F01_TRANSITION_CASES=Object.freeze(['valid-v1','absent','global-max','media-max','corrupt','future']);
/** @type {readonly {phase:'seed'|'old'|'new'|'rollback',payload:'published'|'f00'|'f01'}[]} */
export const F01_TRANSITION_STAGES=Object.freeze([
  {phase:'seed',payload:'published'},{phase:'old',payload:'f00'},{phase:'new',payload:'f01'},
  {phase:'rollback',payload:'f00'},{phase:'new',payload:'f01'},{phase:'rollback',payload:'published'},{phase:'new',payload:'f01'},
]);
/** @typedef {'owned-gain'|'inherit-bit'|'eq-band'|'preset-id'} F01TransitionLoss */
/** @typedef {{caseId:string,kind:'legacy'|'f01',mediaCase?:F01TransitionCase,loss?:F01TransitionLoss}} F01Assignment */
/** @param {'storage-loss'|undefined} control @returns {F01Assignment[]} */
export function f01TransitionAssignments(control){
  if(control!==undefined&&control!=='storage-loss')throw fail('f01-transition-control');
  /** @type {F01Assignment[]} */const legacy=(control?['valid-ui']:['valid-ui','legacy-valid','legacy-null','legacy-invalid','damaged-revision']).map(caseId=>({caseId,kind:'legacy'}));
  /** @type {readonly F01TransitionLoss[]} */const losses=['owned-gain','inherit-bit','eq-band','preset-id'];
  return [...legacy,...(control?losses.map(loss=>({caseId:'loss-'+loss,kind:/** @type {const} */('f01'),mediaCase:/** @type {const} */('valid-v1'),loss})):
    F01_TRANSITION_CASES.map(mediaCase=>({caseId:mediaCase,kind:/** @type {const} */('f01'),mediaCase})))];
}
/** @param {F01Assignment} assignment @param {'storage-loss'|undefined} control */
export function f01TransitionStages(assignment,control){
  const known=f01TransitionAssignments(assignment.loss?'storage-loss':control).find(row=>isDeepStrictEqual(row,assignment));
  if(!known)throw fail('f01-transition-assignment');
  if(assignment.kind==='legacy')return [F01_TRANSITION_STAGES[0],{phase:/** @type {const} */('old'),payload:/** @type {const} */('published')},
    {phase:/** @type {const} */('new'),payload:/** @type {const} */('f00')},...(control?[]:[{phase:/** @type {const} */('rollback'),payload:/** @type {const} */('published')}])];
  if(assignment.mediaCase!=='valid-v1')return [F01_TRANSITION_STAGES[0],F01_TRANSITION_STAGES[2]];
  return F01_TRANSITION_STAGES.slice(0,assignment.loss?4:7);
}

/** @param {unknown} failure @param {unknown} expected @param {F01TransitionLoss} loss @param {string} extensionId */
export function matchF01TransitionLoss(failure,expected,loss,extensionId){
  const value=record(failure),observation=record(value?.observation),raw=record(structuredClone(observation?.raw)),original=record(expected);
  if(!value||!raw||!original||!/^[a-p]{32}$/.test(extensionId)||value.code!=='f01-transition-preservation'||value.caseId!=='loss-'+loss||
    value.phase!=='rollback'||value.payload!=='f00'||value.launchOccurrence!==3||value.step!=='startup'||value.stage!=='rollback-init'||
    !isDeepStrictEqual(value.cleanupErrors,[])||!isDeepStrictEqual(observation?.execution,{extensionId,version:'2.13.5',brokerMatches:true}))return false;
  const store=record(raw.mediaProfiles),source=record(original.mediaProfiles);
  let target,donor,key;
  if(loss==='preset-id'){
    if(!Array.isArray(store?.presets)||store.presets.length!==2||!Array.isArray(source?.presets)||source.presets.length!==2)return false;
    target=record(store.presets[1]);donor=record(source.presets[1]);key='id';
  }else{
    if(!['owned-gain','inherit-bit','eq-band'].includes(loss)||!Array.isArray(store?.channels)||!Array.isArray(source?.channels))return false;
    target=record(record(record(store.channels[0])?.audio)?.values);donor=record(record(record(source.channels[0])?.audio)?.values);
    key=loss==='owned-gain'?'audioGain':loss==='inherit-bit'?'gainInherited':'eq125';
  }
  if(!target||!donor||Object.hasOwn(target,key)||!Object.hasOwn(donor,key))return false;
  const wanted=Reflect.get(donor,key);
  if(key==='id'?typeof wanted!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(wanted):wanted!==(key==='audioGain'?0:key==='gainInherited'?false:1.25))return false;
  Object.defineProperty(target,key,{value:wanted,enumerable:true,writable:true,configurable:true});return isDeepStrictEqual(raw,expected);
}

/** @param {F01TransitionCase} caseId @param {string} runNonce @param {unknown} fixture @returns {Record<string,unknown>} */
export function f01TransitionSeed(caseId,runNonce,fixture){
  if(!F01_TRANSITION_CASES.includes(caseId)||typeof runNonce!=='string'||!/^[a-f0-9]{32}$/.test(runNonce))throw fail('f01-transition-seed');
  const raw=record(structuredClone(fixture)),future=record(raw?.futureTop),media=record(raw?.mediaProfiles);
  if(!raw||!future||future.runNonce!=='__RUN_NONCE__'||future.untouched!==true||!record(raw.config)||raw.settingsRevision!==4||
    !media||media.schema!==1||media.revision!==7||!Array.isArray(media.channels)||media.channels.length!==2||!Array.isArray(media.presets)||media.presets.length!==1)throw fail('f01-transition-seed-fixture');
  future.runNonce=runNonce;
  if(caseId==='absent')Reflect.deleteProperty(raw,'mediaProfiles');
  else if(caseId==='global-max'){raw.settingsRevision=Number.MAX_SAFE_INTEGER;raw.mediaProfiles={schema:2,revision:0,channels:[],presets:[]};}
  else if(caseId==='media-max')raw.mediaProfiles={schema:2,revision:Number.MAX_SAFE_INTEGER,channels:[],presets:[]};
  else if(caseId==='corrupt')raw.mediaProfiles={schema:2,revision:0,channels:'damaged',presets:[]};
  else if(caseId==='future')raw.mediaProfiles={schema:99,revision:0,channels:[],presets:[],future:'keep'};
  return raw;
}

/** @typedef {{caseId:F01TransitionCase,runNonce:string,seed:unknown,expected:unknown,occurrence:number,
 * step:'startup'|'upgraded'|'final',presetId?:string}} F01Expectation */
/** @param {F01Expectation} input @returns {Record<string,unknown>} */
export function expectedF01TransitionRaw(input){
  const {caseId,runNonce,seed,expected,occurrence,step,presetId}=input;
  if(!Number.isSafeInteger(occurrence)||occurrence<0||occurrence>(caseId==='valid-v1'?6:1)||!['startup','upgraded','final'].includes(step)||
    step==='upgraded'&&(caseId!=='valid-v1'||occurrence!==2))throw fail('f01-transition-expectation');
  const raw=f01TransitionSeed(caseId,runNonce,seed),config=record(raw.config);if(!config)throw fail('f01-transition-expectation');
  if(caseId!=='valid-v1'){
    if(caseId==='absent'&&occurrence===1&&step==='final'){Object.assign(config,{audioGain:0,gainInherited:false});raw.settingsRevision=5;}
    return raw;
  }
  if(occurrence<2||occurrence===2&&step==='startup')return raw;
  const fixtures=record(expected),upgrading=step==='upgraded',store=record(structuredClone(upgrading?fixtures?.upgraded:fixtures?.edited));
  if(!store||store.schema!==2||store.revision!==(upgrading?8:12)||!Array.isArray(store.channels)||store.channels.length!==2||
    !Array.isArray(store.presets)||store.presets.length!==(upgrading?1:2))throw fail('f01-transition-expectation-fixture');
  raw.mediaProfiles=store;if(upgrading)return raw;
  const preset=record(store.presets[1]);
  if(!preset||preset.id!=='__NATIVE_PRESET_ID__'||typeof presetId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(presetId)||
    presetId==='11111111-1111-4111-8111-111111111111')throw fail('f01-transition-expectation-preset');
  preset.id=presetId;
  const off=occurrence===3&&step==='final'||occurrence===4||occurrence===5&&step==='startup';
  raw.settingsRevision=off?10:occurrence>=5?11:9;
  Object.assign(config,{compressorDefault:!off,audioGain:0,gainInherited:false,eqEnabled:true,eq125:1.25});
  return raw;
}

/** @typedef {Omit<F01Expectation,'step'> & {phase:'old'|'new'|'rollback',payload:'published'|'f00'|'f01',extensionId:string,assignedCaseId?:string}} F01PhaseExpectation */
/** @param {unknown} value @param {F01PhaseExpectation} input */
export function assertF01TransitionPhase(value,input){
  const phase=record(value),rows=phase?.records,steps=input.caseId==='valid-v1'&&input.occurrence===2?['startup','upgraded','final']:['startup','final'];
  const execution={extensionId:input.extensionId,version:input.phase==='old'?'2.13.3':input.phase==='new'?'2.13.4':'2.13.5',brokerMatches:true};
  if(!phase||phase.caseId!==(input.assignedCaseId??input.caseId)||phase.phase!==input.phase||phase.payload!==input.payload||phase.launchOccurrence!==input.occurrence||
    !Array.isArray(rows)||!isDeepStrictEqual(rows.map(row=>record(row)?.step),steps)||!isDeepStrictEqual(phase.pageErrors,[])||!isDeepStrictEqual(phase.final,record(rows.at(-1))?.observation))throw fail('f01-transition-proof');
  for(const row of rows){const entry=record(row),step=entry?.step;if(!entry||step!=='startup'&&step!=='upgraded'&&step!=='final')throw fail('f01-transition-proof');
    if(!isDeepStrictEqual(entry.observation,{raw:expectedF01TransitionRaw({...input,step}),execution}))throw fail('f01-transition-proof');}
}

/** @template T @param {()=>Promise<T>} read @param {(value:T)=>boolean} accept @param {string} code */
async function waitCold(read,accept,code){
  const deadline=Date.now()+15000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,25));}while(Date.now()<deadline);throw fail(code);
}
/** @param {import('playwright').Page} page */
const readyCold=page=>page.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
/** @param {import('playwright').Page} page @param {string} selector */
async function confirmCold(page,selector){
  /** @type {(dialog:import('playwright').Dialog)=>void} */let listener=()=>{};
  const handled=new Promise((resolve,reject)=>{listener=dialog=>{dialog.accept().then(resolve,reject);};page.once('dialog',listener);});
  try{await Promise.all([page.locator(selector).click(),handled]);}finally{page.off('dialog',listener);}
}
/** @typedef {F01PhaseExpectation & {context:import('playwright').BrowserContext,worker:import('playwright').Worker,
 * browserSession:import('playwright').CDPSession,expectedBrokerFunction:string,
 * responses:readonly {url:string,status:number,contentType:string,body:string}[]}} F01ColdInput */
/** @param {F01ColdInput} input */
export async function runF01TransitionPhase(input){
  const {context,worker,extensionId,occurrence,phase,payload,caseId}=input;
  const stage=caseId==='valid-v1'?F01_TRANSITION_STAGES.at(occurrence):occurrence===1?F01_TRANSITION_STAGES[2]:null;
  if(!stage||stage.phase!==phase||stage.payload!==payload)throw fail('f01-transition-phase');
  let step=/** @type {'startup'|'upgraded'|'final'} */('startup'),presetId=input.presetId;
  /** @type {{raw:Record<string,unknown>,execution:{extensionId:string,version:string,brokerMatches:boolean}}|undefined} */let observation;
  /** @type {string[]} */const pageErrors=[];
  /** @param {import('playwright').Page} page */const attach=page=>page.on('pageerror',error=>{if(pageErrors.length<32)pageErrors.push(error.message.slice(0,240));});
  for(const page of context.pages())attach(page);context.on('page',attach);
  const snapshot=async()=>{/** @type {unknown} */const raw=await worker.evaluate(()=>chrome.storage.local.get(null));const result=record(raw);if(!result)throw fail('f01-transition-storage');return result;};
  try{
    const execution=await worker.evaluate(expected=>{const broker=Reflect.get(globalThis,'createSettingsBroker');return {extensionId:chrome.runtime.id,
      version:chrome.runtime.getManifest().version,brokerMatches:typeof broker==='function'&&broker.toString()===expected};},input.expectedBrokerFunction);
    if(!isDeepStrictEqual(execution,{extensionId,version:phase==='old'?'2.13.3':phase==='new'?'2.13.4':'2.13.5',brokerMatches:true}))throw fail('f01-transition-execution');
    /** @type {{step:string,observation:NonNullable<typeof observation>}[]} */const records=[];
    const check=async()=>{observation={raw:await snapshot(),execution};if(!isDeepStrictEqual(observation.raw,expectedF01TransitionRaw({...input,step,...(presetId?{presetId}:{})})))throw fail('f01-transition-preservation');
      if(pageErrors.length)throw fail('f01-transition-page-error');records.push({step,observation});};
    await check();
    await context.route(/^https?:\/\//,async route=>{const response=input.responses.find(row=>row.url===route.request().url());
      if(response)await route.fulfill({status:response.status,contentType:response.contentType,body:response.body});else await route.abort('blockedbyclient');});
    await context.routeWebSocket(/.*/,socket=>socket.close());
    if(payload!=='f01'){
      const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`,{waitUntil:'domcontentloaded'});
      await popup.locator('#settings-status[data-phase="ready"]').waitFor({timeout:15000});
      if(occurrence===3||occurrence===5){
        await popup.locator('#compressorDefault').setChecked(occurrence===5);
        await waitCold(snapshot,raw=>raw.settingsRevision===(occurrence===3?10:11),'f01-transition-alias-save');
      }
      if(payload==='f00'){
        await popup.close();
        const page=await context.newPage();await page.goto('https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>{const runtime=/** @type {{configReady?:boolean,ownerProtocol?:number,media?:{phase?:string}}|undefined} */(Reflect.get(window,Symbol.for('cheese-knife.runtime.v1')));
          return runtime?.configReady&&runtime.ownerProtocol===2&&runtime.media?.phase!=='pending';},null,{timeout:15000});
        const limited=(await openInstalledMediaSettings({context,worker,fixturePage:page,extensionId,browserSession:input.browserSession,mediaProtocol:2,
          uiState:occurrence===3?'repair-required':'ready'})).settingsPage;
        if(occurrence===3){
          await limited.locator('#media-status[data-phase="repair-required"]').waitFor({timeout:15000});
          if(!await limited.locator('#media-audio-enable').isDisabled()||!await limited.locator('#compressorThreshold').isDisabled())throw fail('f01-transition-f00-writable');
        }else{await readyCold(limited);await limited.locator('#media-scope').selectOption('current');await readyCold(limited);
          if(Number(await limited.locator('#compressorThreshold').inputValue())!==-35)throw fail('f01-transition-f00-projection');}
      }
    }else if(caseId==='global-max'||caseId==='corrupt'||caseId==='future'){
      const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html?mediaSettings=1`,{waitUntil:'domcontentloaded'});
      await popup.locator(caseId==='global-max'?'#settings-status[data-phase="repair-required"]':'#media-status[data-phase="repair-required"]').waitFor({timeout:15000});
      if(!await popup.locator('#audioGain').isDisabled())throw fail('f01-transition-repair-writable');
    }else{
      const page=await context.newPage();await page.goto('https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>{const runtime=/** @type {import('../../src/main/runtime/contracts.js').KnifeRuntime|undefined} */(Reflect.get(window,Symbol.for('cheese-knife.runtime.v1')));
        return runtime?.configReady&&runtime.ownerProtocol===3&&runtime.media.phase!=='pending';},null,{timeout:15000});
      const settings=(await openInstalledMediaSettings({context,worker,fixturePage:page,extensionId,browserSession:input.browserSession,mediaProtocol:3,
        uiState:caseId==='valid-v1'&&occurrence===2?'upgrade-required':'ready'})).settingsPage;
      await readyCold(settings);
      if(caseId==='valid-v1'&&occurrence===2){
        await confirmCold(settings,'#media-upgrade');await waitCold(snapshot,raw=>record(raw.mediaProfiles)?.revision===8,'f01-transition-upgrade');await readyCold(settings);step='upgraded';await check();
        for(const enabled of [false,true]){await settings.locator('#audioDefault').setChecked(enabled);await waitCold(snapshot,raw=>record(raw.config)?.compressorDefault===enabled,'f01-transition-default');await readyCold(settings);}
        await settings.locator('#audioGain').focus();await settings.keyboard.press('Home');await waitCold(snapshot,raw=>record(raw.config)?.audioGain===0,'f01-transition-global-gain');await readyCold(settings);
        await settings.locator('#eqEnabled').check();await waitCold(snapshot,raw=>record(raw.config)?.eqEnabled===true,'f01-transition-global-eq');await readyCold(settings);
        await settings.locator('#eq125-value').fill('1.25');await waitCold(snapshot,raw=>record(raw.config)?.eq125===1.25,'f01-transition-global-band');await readyCold(settings);
        await settings.locator('#media-scope').selectOption('current');await readyCold(settings);
        const channelAudio=async()=>{const raw=await snapshot(),channels=record(raw.mediaProfiles)?.channels;return Array.isArray(channels)?record(record(record(channels[0])?.audio)?.values):null;};
        await settings.locator('#eqEnabled').check();await waitCold(channelAudio,audio=>audio?.eqEnabled===true,'f01-transition-channel-eq');await readyCold(settings);
        await settings.locator('#eq125-value').fill('1.25');await waitCold(channelAudio,audio=>audio?.eq125===1.25,'f01-transition-channel-band');await readyCold(settings);
        await settings.locator('#media-audio-save-preset').click();await settings.locator('#media-preset-create-name').fill('F01 transition owned');await settings.locator('#media-preset-create').click();
        const created=await waitCold(snapshot,raw=>{const presets=record(raw.mediaProfiles)?.presets;return Array.isArray(presets)&&presets.length===2;},'f01-transition-native-preset');
        const presets=record(created.mediaProfiles)?.presets;const id=Array.isArray(presets)?record(presets[1])?.id:null;if(typeof id!=='string')throw fail('f01-transition-native-preset');presetId=id;await readyCold(settings);
        await settings.locator('#media-audio-tab').click();await settings.locator('#media-audio-preset').selectOption(presetId);await confirmCold(settings,'#media-audio-preset-apply');
        await waitCold(snapshot,raw=>record(raw.mediaProfiles)?.revision===12,'f01-transition-channel-owned');await readyCold(settings);
      }else if(caseId==='absent'){
        await settings.locator('#audioGain').focus();await settings.keyboard.press('Home');await waitCold(snapshot,raw=>raw.settingsRevision===5,'f01-transition-absent-save');await readyCold(settings);
      }else if(caseId==='media-max'){
        await settings.locator('#media-scope').selectOption('current');await readyCold(settings);await settings.locator('#media-audio-enable').click();
        await settings.locator('#media-status[data-phase="failed"]').waitFor({timeout:15000});
        if(!(await settings.locator('#media-status').textContent())?.includes('(revision-exhausted)'))throw fail('f01-transition-max-wrong-failure');
      }else{
        await settings.locator('#media-scope').selectOption('current');await readyCold(settings);
        if(Number(await settings.locator('#audioGain').inputValue())!==0||await settings.locator('#gainInherited').isChecked()||!await settings.locator('#eqEnabled').isChecked()||
          Number(await settings.locator('#eq125-value').inputValue())!==1.25)throw fail('f01-transition-resume-ui');
        await settings.locator('#media-scope').selectOption('global');await readyCold(settings);
        if(await settings.locator('#audioDefault').isChecked()!==(occurrence!==4))throw fail('f01-transition-alias-ui');
        await page.waitForFunction(()=>{const runtime=/** @type {import('../../src/main/runtime/contracts.js').KnifeRuntime|undefined} */(Reflect.get(window,Symbol.for('cheese-knife.runtime.v1')));
          return runtime?.config.compressorThreshold===-35&&runtime.config.audioGain===0&&runtime.config.eqEnabled===true&&runtime.config.eq125===1.25;},null,{timeout:15000});
      }
    }
    step='final';await check();const result={caseId:input.assignedCaseId??caseId,phase,payload,launchOccurrence:occurrence,records,final:observation,pageErrors,...(presetId?{presetId}:{})};
    assertF01TransitionPhase(result,{...input,...(presetId?{presetId}:{})});return result;
  }catch(error){
    const code=record(error)?.code;throw Object.assign(error instanceof Error?error:fail('f01-transition-phase-failed'),{failure:{code:typeof code==='string'?code:'f01-transition-phase-failed',caseId:input.assignedCaseId??caseId,
      phase,payload,launchOccurrence:occurrence,step,stage:step==='startup'?(phase==='old'?'old-init':phase==='new'?'candidate-init':'rollback-init'):'phase-action',...(observation?{observation}:{}),cleanupErrors:[]}});
  }finally{context.off('page',attach);}
}
