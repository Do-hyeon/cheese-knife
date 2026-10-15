import path from 'node:path';
import {spawn} from 'node:child_process';
import {Readable,Writable} from 'node:stream';

/** @param {string} code */
const fail=code=>Object.assign(new Error(code),{code});
const maxFrame=32*1024*1024;
/** Retire only the ChildProcess handle created by this launcher; never a PID search.
 * @param {import('node:child_process').ChildProcess} child @param {Promise<unknown>} exited
 */
export async function stopVisibilityChild(child,exited){
  /** @type {ReturnType<typeof setTimeout>|undefined} */let timer;
  if(child.exitCode===null&&child.signalCode===null&&!child.kill())throw fail('visibility-child-stop-failed');
  try{await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('visibility-startup-close-unconfirmed')),15000);})]);}
  finally{clearTimeout(timer);}
}
/** @param {readonly string[]} extensionArgs @param {string} profilePath @param {boolean} headed */
export function visibilityBrowserArgs(extensionArgs,profilePath,headed){
  return [...extensionArgs,`--user-data-dir=${profilePath}`,'--remote-debugging-pipe',
    '--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps',
    '--disable-component-extensions-with-background-pages',
    ...headed?[]:['--headless=new'],'about:blank'];
}
/** @param {Readable} read @param {Writable} write @returns {import('playwright').ConnectOverCDPTransport} */
export function createVisibilityTransport(read,write){
  let pending=Buffer.alloc(0),closed=false;
  /** @type {import('playwright').ConnectOverCDPTransport} */
  const transport={send(message){
    if(closed)throw fail('visibility-pipe-closed');
    const bytes=Buffer.from(JSON.stringify(message)+'\0');
    if(bytes.length>maxFrame){retire();throw fail('visibility-pipe-size');}
    write.write(bytes);
  },close:retire};
  function retire(){
    if(closed)return;closed=true;pending=Buffer.alloc(0);read.off('data',receive);write.end();transport.onclose?.();
  }
  /** @param {Buffer} chunk */
  function receive(chunk){
    if(closed)return;
    pending=Buffer.concat([pending,chunk]);
    if(pending.length>maxFrame){retire();return;}
    let index;
    while((index=pending.indexOf(0))>=0){
      /** @type {unknown} */let message;
      try{message=JSON.parse(pending.subarray(0,index).toString('utf8'));}catch{retire();return;}
      pending=pending.subarray(index+1);
      if(!message||typeof message!=='object'||Array.isArray(message)){retire();return;}
      transport.onmessage?.(message);
      if(closed)return;
    }
  }
  read.on('data',receive);read.on('end',retire);read.on('error',retire);write.on('error',retire);
  return transport;
}

/** @typedef {{chromiumApi:import('playwright').BrowserType,extensionPath?:string,profilePath:string,artifactPath:string,headed:boolean}} VisibilityOptions */
/** @param {VisibilityOptions} options */
export async function launchVisibilityBrowser(options){
  const {chromiumApi,extensionPath,profilePath,artifactPath,headed}=options;
  if(process.platform!=='win32'||typeof headed!=='boolean'||!chromiumApi||typeof chromiumApi.connectOverCDP!=='function'||
    ![profilePath,artifactPath,...extensionPath===undefined?[]:[extensionPath]].every(value=>typeof value==='string'&&path.isAbsolute(value)))throw fail('visibility-launch-invalid');
  // Keep the legacy untyped harness behind a checked runtime boundary, as the other strict Native runners do.
  const harnessSpecifier='./harness.mjs';
  /** @type {unknown} */const loaded=await import(harnessSpecifier);
  if(!loaded||typeof loaded!=='object')throw fail('visibility-provider-invalid');
  const prepare=Reflect.get(loaded,'prepareWindowsBundledChromium'),wait=Reflect.get(loaded,'waitForExtensionWorker'),launchOptions=Reflect.get(loaded,'extensionLaunchOptions');
  if(typeof prepare!=='function'||typeof wait!=='function'||typeof launchOptions!=='function')throw fail('visibility-provider-invalid');
  /** @type {unknown} */const prepared=await Reflect.apply(prepare,undefined,[{chromiumApi,profilePath}]);
  if(typeof prepared!=='string'||!path.isAbsolute(prepared)||path.relative(profilePath,prepared).startsWith('..')||path.isAbsolute(path.relative(profilePath,prepared)))throw fail('visibility-provider-invalid');
  /** @type {string[]} */let args=[];
  if(extensionPath!==undefined){
    /** @type {unknown} */const launch=Reflect.apply(launchOptions,undefined,[extensionPath,headed]);
    if(!launch||typeof launch!=='object')throw fail('visibility-provider-invalid');
    /** @type {unknown} */const supplied=Reflect.get(launch,'args');
    if(!Array.isArray(supplied)||supplied.length!==2||supplied[0]!==`--disable-extensions-except=${extensionPath}`||supplied[1]!==`--load-extension=${extensionPath}`)throw fail('visibility-provider-invalid');
    args=supplied;
  }
  const child=spawn(prepared,visibilityBrowserArgs(args,profilePath,headed),{stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true});
  const exited=new Promise(resolve=>{child.once('exit',()=>resolve(true));child.once('error',()=>resolve(true));});
  let ready=false;
  try{
    const read=child.stdio[4],write=child.stdio[3];
    if(!(read instanceof Readable)||!(write instanceof Writable))throw fail('visibility-pipe-unavailable');
    const transport=createVisibilityTransport(read,write);
    child.once('exit',()=>transport.close());child.once('error',()=>transport.close());
    // The ordinary launcher forces focused/visible pages; this supported connection preserves native tab visibility.
    const browser=await chromiumApi.connectOverCDP(transport,{noDefaults:true,timeout:15000});
    const contexts=browser.contexts(),context=contexts.at(0);
    if(contexts.length!==1||!context)throw fail('visibility-context-invalid');
    /** @type {import('playwright').Worker|null} */let worker=null;
    /** @type {string|null} */let extensionId=null;
    if(extensionPath!==undefined){
      /** @type {unknown} */const found=await Reflect.apply(wait,undefined,[context]);
      worker=context.serviceWorkers().find(worker=>worker===found)??null;
      const match=worker?.url().match(/^chrome-extension:\/\/([a-p]{32})\/background\.js$/);
      if(!worker||!match?.[1])throw fail('visibility-worker-invalid');extensionId=match[1];
    }
    /** @type {import('playwright').CDPSession|null} */let browserSession=null;
    if(extensionPath===undefined){
      const openSession=Reflect.get(loaded,'openMediaBrowserSession');
      if(typeof openSession!=='function')throw fail('visibility-provider-invalid');
      /** @type {unknown} */const session=await Reflect.apply(openSession,undefined,[context]);
      if(!session||typeof session!=='object'||typeof Reflect.get(session,'send')!=='function')throw fail('visibility-provider-invalid');
      browserSession=/** @type {import('playwright').CDPSession} */(session);
    }
    ready=true;return {browser,context,worker,extensionId,browserSession,abort:()=>stopVisibilityChild(child,exited)};
  }finally{
    if(!ready){
      await stopVisibilityChild(child,exited);
    }
  }
}

/** @param {VisibilityOptions & {extensionPath:string}} options */
export async function launchVisibilityExtension(options){
  const {context,worker,extensionId}=await launchVisibilityBrowser(options);
  if(!worker||!extensionId)throw fail('visibility-worker-invalid');
  return {context,worker,extensionId};
}
