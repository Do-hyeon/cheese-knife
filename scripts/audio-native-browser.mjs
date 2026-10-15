import {launchVisibilityBrowser} from './extension-e2e/visibility-browser.mjs';

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
  const {browser,context,browserSession}=await launchVisibilityBrowser({chromiumApi,profilePath,artifactPath,headed:false});
  if(!browserSession)throw new Error('audio-browser-session-invalid');
  return {browser,context,profilePath,browserSession,async close(){
    /** @type {unknown} */const proof=await Reflect.apply(close,undefined,[{context,browserSession,profilePath}]);
    if(!proof||typeof proof!=='object'||!['browserCloseAcknowledged','browserDisconnected','ownedRootClosed'].every(key=>Reflect.get(proof,key)===true))throw new Error('audio-browser-close-unconfirmed');
    return proof;
  }};
}

/** @param {import('playwright').BrowserContext} context @param {import('playwright').CDPSession} browserSession */
export async function openAudioMeasurementWindow(context,browserSession){
  const created=context.waitForEvent('page',{timeout:15000}).catch(()=>null);
  /** @type {unknown} */const target=await browserSession.send('Target.createTarget',{url:'about:blank',newWindow:true});
  if(!target||typeof target!=='object'||typeof Reflect.get(target,'targetId')!=='string')throw new Error('audio-browser-window-target');
  const targetId=/** @type {string} */(Reflect.get(target,'targetId')),page=await created;
  if(!page)throw new Error('audio-browser-window-target');
  const session=await context.newCDPSession(page);
  try{
    /** @type {unknown} */const identity=await session.send('Target.getTargetInfo');
    const info=identity&&typeof identity==='object'?Reflect.get(identity,'targetInfo'):null;
    if(!info||typeof info!=='object'||Reflect.get(info,'targetId')!==targetId)throw new Error('audio-browser-window-target');
  }finally{await session.detach();}
  /** @type {unknown} */const window=await browserSession.send('Browser.getWindowForTarget',{targetId});
  const windowId=window&&typeof window==='object'?Reflect.get(window,'windowId'):null;
  if(typeof windowId!=='number'||!Number.isSafeInteger(windowId)||windowId<0)throw new Error('audio-browser-window-target');
  return {page,targetId,windowId};
}
