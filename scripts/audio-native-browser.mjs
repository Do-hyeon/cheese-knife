import {launchVisibilityBrowser} from './extension-e2e/visibility-browser.mjs';

/** Only local launcher evidence, never arbitrary Error properties or environment dumps.
 * @param {unknown} cause @param {number} [depth] @returns {Record<string,unknown>}
 */
export function nativeFailureDetails(cause,depth=0){
  /** @type {Record<string,unknown>} */const result={message:cause instanceof Error?cause.message.slice(0,4096):'native-failed'};
  if(!cause||typeof cause!=='object')return result;
  const keys=['code','signal','killed','stdout','stderr','forcedRetirement','abortError','profilePath'];
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
    result[key]=detail;
  }
  const nested=Reflect.get(cause,'cause');if(depth<2&&nested&&nested!==cause)result.cause=nativeFailureDetails(nested,depth+1);
  return result;
}

/** @template T @param {string} name @param {()=>Promise<T>} work @param {number} [milliseconds] @returns {Promise<T>} */
export async function audioOperation(name,work,milliseconds=15000){
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
