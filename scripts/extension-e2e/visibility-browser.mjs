import path from 'node:path';
import {spawn} from 'node:child_process';
import {Readable,Writable} from 'node:stream';

/** @param {string} code */
const fail=code=>Object.assign(new Error(code),{code});
const maxFrame=32*1024*1024;
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

/** @param {{chromiumApi:import('playwright').BrowserType,extensionPath:string,profilePath:string,artifactPath:string,headed:boolean}} options */
export async function launchVisibilityExtension(options){
  const {chromiumApi,extensionPath,profilePath,artifactPath,headed}=options;
  if(process.platform!=='win32'||typeof headed!=='boolean'||![extensionPath,profilePath,artifactPath].every(value=>typeof value==='string'&&path.isAbsolute(value)))throw fail('visibility-launch-invalid');
  // Keep the legacy untyped harness behind a checked runtime boundary, as the other strict Native runners do.
  const harnessSpecifier='./harness.mjs';
  /** @type {unknown} */const loaded=await import(harnessSpecifier);
  if(!loaded||typeof loaded!=='object')throw fail('visibility-provider-invalid');
  const prepare=Reflect.get(loaded,'prepareWindowsBundledChromium'),wait=Reflect.get(loaded,'waitForExtensionWorker'),launchOptions=Reflect.get(loaded,'extensionLaunchOptions');
  if(typeof prepare!=='function'||typeof wait!=='function'||typeof launchOptions!=='function')throw fail('visibility-provider-invalid');
  /** @type {unknown} */const prepared=await Reflect.apply(prepare,undefined,[{chromiumApi,profilePath}]);
  /** @type {unknown} */const launch=Reflect.apply(launchOptions,undefined,[extensionPath,headed]);
  if(typeof prepared!=='string'||!path.isAbsolute(prepared)||path.relative(profilePath,prepared).startsWith('..')||
    !launch||typeof launch!=='object')throw fail('visibility-provider-invalid');
  /** @type {unknown} */const args=Reflect.get(launch,'args');
  if(!Array.isArray(args)||args.length!==2||!args.every(value=>typeof value==='string')||args[0]!==`--disable-extensions-except=${extensionPath}`||args[1]!==`--load-extension=${extensionPath}`)throw fail('visibility-provider-invalid');
  const child=spawn(prepared,[...args,`--user-data-dir=${profilePath}`,'--remote-debugging-pipe',
    '--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps',
    ...headed?[]:['--headless=new'],'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true});
  /** @type {ReturnType<typeof setTimeout>|undefined} */let timer;
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
    /** @type {unknown} */const found=await Reflect.apply(wait,undefined,[context]);
    const worker=context.serviceWorkers().find(worker=>worker===found),match=worker?.url().match(/^chrome-extension:\/\/([a-p]{32})\/background\.js$/);
    if(!worker||!match?.[1])throw fail('visibility-worker-invalid');
    ready=true;return {context,worker,extensionId:match[1]};
  }finally{
    if(!ready){
      child.kill();
      try{await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('visibility-startup-close-unconfirmed')),15000);})]);}
      finally{clearTimeout(timer);}
    }
  }
}
