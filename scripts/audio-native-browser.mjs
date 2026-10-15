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
  const open=Reflect.get(loaded,'openMediaBrowserSession'),close=Reflect.get(loaded,'closeInstalledMediaBrowser');
  if(typeof open!=='function'||typeof close!=='function')throw new Error('audio-browser-provider-invalid');
  const {context}=await launchVisibilityBrowser({chromiumApi,profilePath,artifactPath,headed:false});
  const browser=context.browser();
  if(!browser)throw new Error('audio-browser-unavailable');
  /** @type {unknown} */const browserSession=await Reflect.apply(open,undefined,[context]);
  if(!browserSession||typeof browserSession!=='object'||typeof Reflect.get(browserSession,'send')!=='function')throw new Error('audio-browser-session-invalid');
  return {browser,context,profilePath,browserSession:/** @type {import('playwright').CDPSession} */(browserSession),async close(){
    /** @type {unknown} */const proof=await Reflect.apply(close,undefined,[{context,browserSession,profilePath}]);
    if(!proof||typeof proof!=='object'||!['browserCloseAcknowledged','browserDisconnected','ownedRootClosed'].every(key=>Reflect.get(proof,key)===true))throw new Error('audio-browser-close-unconfirmed');
    return proof;
  }};
}
