import {launchVisibilityBrowser} from './extension-e2e/visibility-browser.mjs';

/** @param {unknown} value */
export function commandLineUnavailableRow(value){
  if(!value||typeof value!=='object')return;
  const kind=Reflect.get(value,'kind'),pid=Reflect.get(value,'pid'),createdTicks=Reflect.get(value,'createdTicks');
  if(!['null','empty','too-long'].includes(kind))return;
  const validIdentity=Number.isSafeInteger(pid)&&pid>0&&pid<=0xffffffff&&typeof createdTicks==='string'&&
    /^[1-9][0-9]{0,18}$/.test(createdTicks)&&BigInt(createdTicks)<=3155378975999999999n;
  return {kind,...validIdentity?{pid,createdTicks}:{}};
}

/** Only local launcher evidence, never arbitrary Error properties or environment dumps.
 * @param {unknown} cause @param {number} [depth] @returns {Record<string,unknown>}
 */
export function nativeFailureDetails(cause,depth=0){
  const message=typeof cause==='string'?cause:cause&&typeof cause==='object'?Reflect.get(cause,'message'):undefined;
  /** @type {Record<string,unknown>} */const result={message:typeof message==='string'?message.slice(0,4096):'native-failed'};
  if(!cause||typeof cause!=='object')return result;
  /** @param {unknown} value */
  const exitReceipt=value=>{
    if(!value||typeof value!=='object')return;
    const kind=Reflect.get(value,'kind'),code=Reflect.get(value,'code'),signal=Reflect.get(value,'signal'),at=Reflect.get(value,'at');
    if(kind!=='exit'||!Number.isFinite(at)||at<0||!(code===null||Number.isSafeInteger(code))||!(signal===null||typeof signal==='string')||(code===null)===(signal===null))return;
    return {kind,code,signal:signal===null?null:signal.slice(0,32),at};
  };
  const abortChildExit=exitReceipt(Reflect.get(cause,'abortChildExit'));if(abortChildExit)result.abortChildExit=abortChildExit;
  const retirement=Reflect.get(cause,'childRetirement');
  if(retirement&&typeof retirement==='object'){
    const attempted=Reflect.get(retirement,'attempted'),killAccepted=Reflect.get(retirement,'killAccepted'),late=Reflect.get(retirement,'late'),attemptedAt=Reflect.get(retirement,'attemptedAt'),shutdownBy=Reflect.get(retirement,'shutdownBy');
    if(typeof attempted==='boolean'&&(killAccepted===null||typeof killAccepted==='boolean')&&typeof late==='boolean'&&Number.isFinite(attemptedAt)&&Number.isFinite(shutdownBy))result.childRetirement={attempted,killAccepted,late,attemptedAt,shutdownBy};
  }
  const keys=['code','signal','killed','stdout','stderr','forcedRetirement','abortError','profilePath','retireError'];
  for(const key of keys){const value=Reflect.get(cause,key);
    if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))result[key]=value;
    else if(typeof value==='string')result[key]=value.slice(0,4096);
  }
  for(const key of ['closeDiagnostic','preparationDiagnostic']){
    const diagnostic=Reflect.get(cause,key);if(!diagnostic||typeof diagnostic!=='object')continue;
    /** @type {Record<string,unknown>} */const detail={};
    for(const field of ['stage','elapsedMs','profilePath','version','manifestTool','browserCloseAcknowledged','browserDisconnected','connected','queryPending','queryCount','lastRootCount']){
      const value=Reflect.get(diagnostic,field);
      if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))detail[field]=value;
      else if(typeof value==='string')detail[field]=value.slice(0,4096);
    }
    const actualChildExit=exitReceipt(Reflect.get(diagnostic,'actualChildExit'));if(actualChildExit)detail.actualChildExit=actualChildExit;
    result[key]=detail;
  }
  const query=Reflect.get(cause,'queryDiagnostic');
  if(query&&typeof query==='object'){
    /** @type {Record<string,unknown>} */const diagnostic={};
    const reason=Reflect.get(query,'reason'),exitCode=Reflect.get(query,'exitCode'),signal=Reflect.get(query,'signal'),timedOut=Reflect.get(query,'timedOut');
    if(['query-failed','command-line-unavailable','command-line-format','profile-path','extension-path-conflict','timeout','output-limit','subprocess','json','output-shape'].includes(reason))diagnostic.reason=reason;
    if(typeof timedOut==='boolean')diagnostic.timedOut=timedOut;
    const unavailableRow=reason==='command-line-unavailable'&&timedOut===false&&commandLineUnavailableRow(Reflect.get(query,'unavailableRow'));
    if(unavailableRow)diagnostic.unavailableRow=unavailableRow;
    if(typeof exitCode==='number'&&Number.isSafeInteger(exitCode))diagnostic.exitCode=exitCode;
    if(['SIGTERM','SIGKILL','SIGINT','SIGBREAK'].includes(signal))diagnostic.signal=signal;
    result.queryDiagnostic=diagnostic;
  }
  // Runner secondaries are already bounded records; re-project them rather than copying arbitrary objects.
  const secondary=Reflect.get(cause,'secondaryErrors');
  if(depth===0&&Array.isArray(secondary))result.secondaryErrors=secondary.slice(0,32).map(row=>{
    const value=row&&typeof row==='object'?row:{};
    return {code:typeof value.code==='string'?value.code.slice(0,80):'native-failed',message:typeof value.message==='string'?value.message.slice(0,240):'native-failed',...(value.native&&typeof value.native==='object'?{native:nativeFailureDetails(value.native,depth+1)}:{})};
  });
  if(depth<2){
    /** @type {unknown} */const nested=Reflect.get(cause,'cause');
    if(nested!==undefined&&nested!==cause)result.cause=nativeFailureDetails(nested,depth+1);
    /** @type {unknown} */const retirement=Reflect.get(cause,'retirementError');
    if(retirement!==undefined&&retirement!==cause)result.retirementError=nativeFailureDetails(retirement,depth+1);
    if(Object.hasOwn(cause,'restorationError')){
      /** @type {unknown} */const restoration=Reflect.get(cause,'restorationError');
      if(restoration!==cause)result.restorationError=nativeFailureDetails(restoration,depth+1);
    }
  }
  return result;
}

/** @template T @param {string} name @param {()=>Promise<T>} work @param {number} [milliseconds] @param {(error:unknown,source:string)=>void} [onFailure] @returns {Promise<T>} */
export async function audioOperation(name,work,milliseconds=15000,onFailure){
  if(onFailure!==undefined){
    /** @param {unknown} error @param {string} source */
    const report=(error,source)=>{try{onFailure(error,source);}catch{/* An observer cannot replace the operation's settlement. */}};
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(name)||!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>30000){const error=new Error('audio-operation-invalid');report(error,'invalid');throw error;}
    let timer;
    const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('audio-operation-timeout:'+name);report(error,'timeout');reject(error);},milliseconds);});
    const actual=Promise.resolve().then(()=>{
      let result;
      try{result=work();}catch(error){report(error,'work-sync');throw error;}
      return Promise.resolve(result).then(value=>value,error=>{report(error,'work-async');throw error;});
    });
    try{return await Promise.race([actual,expired]);}finally{clearTimeout(timer);}
  }
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(name)||!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>30000)throw new Error('audio-operation-invalid');
  /** @type {ReturnType<typeof setTimeout>|undefined} */let timer;
  /** @type {Promise<never>} */const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('audio-operation-timeout:'+name)),milliseconds);});
  try{return await Promise.race([Promise.resolve().then(work),timeout]);}
  finally{clearTimeout(timer);}
}

/**
 * @param {typeof import('playwright').chromium} chromiumApi
 * @param {{ensureDirectory(relative:string):Promise<string>,makeTempDirectory(prefix:string):Promise<string>}} files
 */
export async function openAudioMeasurementBrowser(chromiumApi,files){
  const artifactPath=await files.ensureDirectory('output/audio-quality');
  const profilePath=await files.makeTempDirectory('output/audio-quality/profile-');
  const specifier='./extension-e2e/harness.mjs';
  /** @type {unknown} */const loaded=await import(specifier);
  if(!loaded||typeof loaded!=='object')throw new Error('audio-browser-provider-invalid');
  const close=Reflect.get(loaded,'closeInstalledMediaBrowser');
  if(typeof close!=='function')throw new Error('audio-browser-provider-invalid');
  let launched;
  try{launched=await launchVisibilityBrowser({chromiumApi,profilePath,artifactPath,headed:false});}
  catch(cause){if(cause&&typeof cause==='object')Object.assign(cause,{profilePath});throw cause;}
  const {browser,context,browserSession,abort}=launched;
  if(!browserSession)throw new Error('audio-browser-session-invalid');
  return {browser,context,profilePath,browserSession,async close(){
    try{
    /** @type {unknown} */const proof=await Reflect.apply(close,undefined,[{context,browserSession,profilePath}]);
    if(!proof||typeof proof!=='object'||!['browserCloseAcknowledged','browserDisconnected','ownedRootClosed'].every(key=>Reflect.get(proof,key)===true))throw new Error('audio-browser-close-unconfirmed');
    return proof;
    }catch(cause){
      // Forced retirement is retained as failed shutdown, never an orderly-close proof.
      const error=cause instanceof Error?cause:new Error('audio-browser-close-unconfirmed');
      try{await abort();Object.assign(error,{forcedRetirement:true});}catch(abortError){Object.assign(error,{forcedRetirement:false,abortError:abortError instanceof Error?abortError.message:'audio-browser-abort-failed'});}
      throw error;
    }
  }};
}

/** @param {import('playwright').Page} page @param {import('playwright').BrowserContext} context @param {import('playwright').CDPSession} browserSession */
async function windowIdentity(page,context,browserSession){
  const session=await context.newCDPSession(page);
  /** @type {unknown} */let identity;
  try{
    identity=await session.send('Target.getTargetInfo');
  }finally{await session.detach();}
  const info=identity&&typeof identity==='object'?Reflect.get(identity,'targetInfo'):null;
  if(!info||typeof info!=='object'||typeof Reflect.get(info,'targetId')!=='string')throw new Error('audio-browser-window-target');
  const targetId=/** @type {string} */(Reflect.get(info,'targetId'));
  /** @type {unknown} */const window=await browserSession.send('Browser.getWindowForTarget',{targetId});
  const windowId=window&&typeof window==='object'?Reflect.get(window,'windowId'):null;
  if(typeof windowId!=='number'||!Number.isSafeInteger(windowId)||windowId<0)throw new Error('audio-browser-window-target');
  return {targetId,windowId};
}

/** @param {import('playwright').BrowserContext} context @param {import('playwright').CDPSession} browserSession */
export async function openAudioMeasurementWindow(context,browserSession){
  const created=context.waitForEvent('page',{timeout:15000}).catch(()=>null);
  /** @type {unknown} */const target=await browserSession.send('Target.createTarget',{url:'about:blank',newWindow:true});
  if(!target||typeof target!=='object'||typeof Reflect.get(target,'targetId')!=='string')throw new Error('audio-browser-window-target');
  const page=await created;if(!page)throw new Error('audio-browser-window-target');
  const identity=await windowIdentity(page,context,browserSession);
  if(identity.targetId!==Reflect.get(target,'targetId'))throw new Error('audio-browser-window-target');
  return {page,...identity};
}

/** A trusted link opens a sibling tab in its owner's native window; verify, never assume.
 * @param {import('playwright').Page} first @param {import('playwright').BrowserContext} context @param {import('playwright').CDPSession} browserSession
 */
export async function openAudioSiblingTab(first,context,browserSession){
  const before=await windowIdentity(first,context,browserSession),created=context.waitForEvent('page',{timeout:15000}).catch(()=>null);
  await first.evaluate(()=>{
    const link=document.createElement('a');link.id='f01-visibility-sibling';link.href='about:blank';link.target='_blank';link.rel='noopener';link.textContent='Visibility test';
    link.style.cssText='position:fixed;left:16px;top:16px;z-index:2147483647';document.body.append(link);
  });
  await first.locator('#f01-visibility-sibling').click();const page=await created;
  if(!page)throw new Error('audio-browser-sibling-window');
  const after=await windowIdentity(page,context,browserSession);
  if(after.windowId!==before.windowId||after.targetId===before.targetId)throw new Error('audio-browser-sibling-window');
  return {page,...after,firstWindowId:before.windowId,firstTargetId:before.targetId};
}
