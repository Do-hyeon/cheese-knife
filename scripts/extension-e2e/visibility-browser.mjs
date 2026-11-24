import path from 'node:path';
import {spawn} from 'node:child_process';
import {lstat,realpath} from 'node:fs/promises';
import {Readable,Writable} from 'node:stream';
/** @param {string|undefined} caseId */
export function isGain4JobCase(caseId){
  return caseId==='48000/gain/0.5'||caseId==='48000/gain/2'||
    caseId==='96000/gain/0.5'||caseId==='96000/gain/2';
}

/** @param {string} code */
const fail=code=>Object.assign(new Error(code),{code});
const maxFrame=32*1024*1024;

/** @param {string|undefined} caseId */
export function requiresR3PrelaunchCollisionCheck(caseId){
  return caseId==='44100/reentry/0/0'||caseId==='44100/reentry/0/10'||caseId==='44100/reentry/0/15'||caseId==='44100/reentry/0/25'||caseId==='44100/reentry/0/36'||caseId==='44100/reentry/0/41'||caseId==='44100/reentry/0/46'||caseId==='44100/reentry/2/0'||caseId==='44100/reentry/2/10'||caseId==='44100/reentry/2/15'||caseId==='44100/reentry/2/25'||caseId==='44100/reentry/5/0'||caseId==='44100/reentry/5/10'||caseId==='44100/reentry/5/15'||caseId==='44100/reentry/5/25'||caseId==='96000/reentry/2/10';
}

/** Retire only the ChildProcess handle created by this launcher; never a PID search.
 * @param {import('node:child_process').ChildProcess} child @param {Promise<unknown>} exited
 * @param {{shutdownBy:number}} [control]
 */
export async function stopVisibilityChild(child,exited,control){
  if(control!==undefined){
    const shutdownBy=control?.shutdownBy;
    if(typeof shutdownBy!=='number'||!Number.isFinite(shutdownBy))throw fail('visibility-shutdown-control-invalid');
    const attemptedAt=performance.now();let attempted=false;
    /** @type {boolean|null} */let killAccepted=null;
    /** @param {string} code */
    const failure=code=>Object.assign(fail(code),{childRetirement:Object.freeze({attempted,killAccepted,late:performance.now()>=shutdownBy,attemptedAt,shutdownBy})});
    const check=()=>{if(performance.now()>=shutdownBy)throw failure('visibility-shutdown-expired');};
    /** @type {ReturnType<typeof setTimeout>|undefined} */let timer;
    try{
      // Preserve the one owned stop attempt even when close exhausted the shared deadline.
      if(child.exitCode===null&&child.signalCode===null){
        attempted=true;
        try{killAccepted=child.kill();}catch(cause){throw Object.assign(failure('visibility-child-stop-failed'),{cause});}
      }
      check();
      if(killAccepted===false)throw failure('visibility-child-stop-failed');
      const observed=exited.catch(cause=>{throw Object.assign(failure('visibility-child-exit-unconfirmed'),{cause});});
      const actual=await Promise.race([observed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('visibility-child-exit-unconfirmed')),Math.max(0,shutdownBy-performance.now()));})]);
      const acceptedAt=performance.now();check();
      if(!actual||typeof actual!=='object')throw failure('visibility-child-exit-unconfirmed');
      const kind=Reflect.get(actual,'kind'),code=Reflect.get(actual,'code'),signal=Reflect.get(actual,'signal'),at=Reflect.get(actual,'at');
      if(kind!=='exit'||!Number.isFinite(at)||at<0||at>acceptedAt||at>=shutdownBy||
        !(code===null||Number.isSafeInteger(code))||!(signal===null||typeof signal==='string'&&signal.length>0)||
        (code===null)===(signal===null))throw failure('visibility-child-exit-unconfirmed');
      check();return actual;
    }finally{clearTimeout(timer);}
  }
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
  let pending=Buffer.alloc(0),closed=false,ended=false;
  /** @type {ReturnType<typeof setImmediate>|undefined} */let delivery;
  /** @type {import('playwright').ConnectOverCDPTransport} */
  const transport={send(message){
    if(closed)throw fail('visibility-pipe-closed');
    const bytes=Buffer.from(JSON.stringify(message)+'\0');
    if(bytes.length>maxFrame){retire();throw fail('visibility-pipe-size');}
    write.write(bytes);
  },close:retire};
  function retire(){
    if(closed)return;closed=true;clearImmediate(delivery);delivery=undefined;pending=Buffer.alloc(0);read.off('data',receive);write.end();transport.onclose?.();
  }
  function schedule(){
    if(closed||delivery)return;
    // Playwright installs context listeners in promise continuations between protocol messages.
    if(pending.indexOf(0)>=0)delivery=setImmediate(deliver);
    else if(ended)retire();
  }
  function deliver(){
    delivery=undefined;if(closed)return;
    const index=pending.indexOf(0);
    /** @type {unknown} */let message;
    try{message=JSON.parse(pending.subarray(0,index).toString('utf8'));}catch{retire();return;}
    pending=pending.subarray(index+1);
    if(!message||typeof message!=='object'||Array.isArray(message)){retire();return;}
    transport.onmessage?.(message);schedule();
  }
  /** @param {Buffer} chunk */
  function receive(chunk){
    if(closed)return;
    if(pending.length+chunk.length>maxFrame){retire();return;}
    pending=Buffer.concat([pending,chunk]);schedule();
  }
  read.on('data',receive);read.on('end',()=>{ended=true;schedule();});read.on('close',()=>{if(!ended)retire();});read.on('error',retire);write.on('error',retire);
  return transport;
}

/** @typedef {Pick<Awaited<ReturnType<typeof import('./run-job.mjs').launchRunJob>>, 'binding'|'abort'>} RunJobHandoff */
/** @typedef {{chromiumTempDir:string,playwrightArtifactsDir:string}} DiagnosticPaths */
/** @typedef {{chromiumApi:import('playwright').BrowserType,extensionPath?:string,profilePath:string,artifactPath:string,headed:boolean,browserCandidate?:{root:string,manifestSha256:string},runJob?:{contract:string,helper:import('./run-job.mjs').Helper},productCaseId?:string,productComponentWitness?:true,recordRunJob?:(value:import('./run-job.mjs').JobBinding)=>Promise<void>,observeRunJobOwner?:(owner:RunJobHandoff)=>RunJobHandoff['abort'],diagnosticPaths?:DiagnosticPaths,diagnosticAbortBy?:number,deadline?:number,signal?:AbortSignal,recordBrowserCandidate?:(value:unknown)=>Promise<void>}} VisibilityOptions */

/** @param {string} directory */
function localDirectory(directory){
  if(typeof directory!=='string'||!(/^[a-z]:[\\/]/i.test(directory))||
    directory.slice(3).split(/[\\/]/).some(part=>!part||/[<>:"|?*\x00-\x1f]|[. ]$/.test(part)||
      /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)))throw fail('visibility-job-directories');
  return path.normalize(directory);
}
/** @param {string[]} writes @param {string[]} protectedRoots */
async function verifyDiagnosticDirectories(writes,protectedRoots){
  const roots=await Promise.all([...writes,...protectedRoots].map(async directory=>{
    const expected=localDirectory(directory).toLowerCase(),stat=await lstat(directory),root=(await realpath(directory)).toLowerCase();
    if(!stat.isDirectory()||stat.isSymbolicLink()||root!==expected)throw fail('visibility-job-directories');
    return root;
  }));
  /** @param {string} a @param {string} b */
  const contains=(a,b)=>{const relative=path.relative(a,b);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
  if(roots.slice(0,writes.length).some((a,index)=>roots.some((b,other)=>other!==index&&(contains(a,b)||contains(b,a)))))throw fail('visibility-job-directories');
}

/** @param {VisibilityOptions} options */
export async function launchVisibilityBrowser(options){
  const {chromiumApi,extensionPath,profilePath,artifactPath,headed,signal,recordBrowserCandidate}=options;
  const browserCandidate=options.browserCandidate===undefined?undefined:Object.freeze({...options.browserCandidate});
  const runJob=options.runJob===undefined?undefined:Object.freeze({contract:options.runJob.contract,helper:Object.freeze({...options.runJob.helper})});
  const {recordRunJob,observeRunJobOwner,diagnosticAbortBy}=options;
  const gainJob=isGain4JobCase(options.productCaseId)&&options.productComponentWitness===true;
  const toneJob=options.productCaseId==='44100/normalizer-control/tone-silence'&&options.productComponentWitness===undefined;
  if(runJob!==undefined&&(runJob.contract!=='run-job-v1'||browserCandidate===undefined||(!toneJob&&!gainJob)||typeof recordRunJob!=='function'))throw fail('visibility-job-selection');
  if(runJob===undefined&&(options.productComponentWitness!==undefined||browserCandidate!==undefined&&isGain4JobCase(options.productCaseId)))throw fail('visibility-job-selection');
  if(observeRunJobOwner!==undefined&&(runJob===undefined||typeof observeRunJobOwner!=='function'))throw fail('visibility-job-observer');
  const diagnostic=options.diagnosticPaths;
  if(gainJob&&(extensionPath===undefined||diagnostic!==undefined||observeRunJobOwner!==undefined||diagnosticAbortBy!==undefined))throw fail('visibility-job-selection');
  if(diagnostic!==undefined&&(!diagnostic||!runJob||!observeRunJobOwner))throw fail('visibility-job-directories');
  if(diagnosticAbortBy!==undefined&&(diagnostic===undefined||!Number.isFinite(diagnosticAbortBy)))throw fail('visibility-job-abort-deadline');
  const chromiumTempDir=diagnostic===undefined?undefined:localDirectory(diagnostic.chromiumTempDir);
  const playwrightArtifactsDir=diagnostic===undefined?undefined:localDirectory(diagnostic.playwrightArtifactsDir);
  if(chromiumTempDir!==undefined&&chromiumTempDir.length>258)throw fail('visibility-job-directories');
  const diagnosticWrites=chromiumTempDir===undefined||playwrightArtifactsDir===undefined?[]:[chromiumTempDir,playwrightArtifactsDir];
  const protectedRoots=diagnosticWrites.length&&runJob?
    [profilePath,artifactPath,...extensionPath===undefined?[]:[extensionPath],path.dirname(localDirectory(runJob.helper.path))]:[];
  const deadline=options.deadline??(browserCandidate===undefined?undefined:Date.now()+150000);
  const checkDeadline=()=>{if(signal?.aborted||deadline!==undefined&&(!Number.isFinite(deadline)||Date.now()>=deadline))throw fail('visibility-launch-expired');};
  checkDeadline();
  if(process.platform!=='win32'||typeof headed!=='boolean'||!chromiumApi||typeof chromiumApi.connectOverCDP!=='function'||
    ![profilePath,artifactPath,...extensionPath===undefined?[]:[extensionPath]].every(value=>typeof value==='string'&&path.isAbsolute(value)))throw fail('visibility-launch-invalid');
  if(diagnosticWrites.length){await verifyDiagnosticDirectories(diagnosticWrites,protectedRoots);checkDeadline();}
  // Keep the legacy untyped harness behind a checked runtime boundary, as the other strict Native runners do.
  const harnessSpecifier='./harness.mjs';
  /** @type {unknown} */const loaded=await import(harnessSpecifier);
  if(!loaded||typeof loaded!=='object')throw fail('visibility-provider-invalid');
  const prepare=Reflect.get(loaded,'prepareWindowsBundledChromium'),wait=Reflect.get(loaded,'waitForExtensionWorker'),launchOptions=Reflect.get(loaded,'extensionLaunchOptions');
  if(typeof prepare!=='function'||typeof wait!=='function'||typeof launchOptions!=='function')throw fail('visibility-provider-invalid');
  /** @type {unknown} */let prepared;
  if(browserCandidate!==undefined){
    const verify=Reflect.get(loaded,'verifyBrowserCandidate');
    if(typeof verify!=='function'||recordBrowserCandidate!==undefined&&typeof recordBrowserCandidate!=='function')throw fail('visibility-provider-invalid');
    const controls={deadline,signal,exclude:[profilePath,artifactPath,...diagnosticWrites]};
    let evidence=await Reflect.apply(verify,undefined,[browserCandidate,controls]);checkDeadline();
    if(recordBrowserCandidate){await recordBrowserCandidate(evidence);checkDeadline();evidence=await Reflect.apply(verify,undefined,[browserCandidate,controls]);}
    if(!evidence||typeof evidence!=='object')throw fail('visibility-provider-invalid');
    prepared=Reflect.get(evidence,'executable');
  }else prepared=await Reflect.apply(prepare,undefined,[{chromiumApi,profilePath}]);
  checkDeadline();
  if(typeof prepared!=='string'||!path.isAbsolute(prepared)||browserCandidate===undefined&&(path.relative(profilePath,prepared).startsWith('..')||path.isAbsolute(path.relative(profilePath,prepared))))throw fail('visibility-provider-invalid');
  /** @type {string[]} */let args=[];
  if(extensionPath!==undefined){
    /** @type {unknown} */const launch=Reflect.apply(launchOptions,undefined,[extensionPath,headed]);
    if(!launch||typeof launch!=='object')throw fail('visibility-provider-invalid');
    /** @type {unknown} */const supplied=Reflect.get(launch,'args');
    if(!Array.isArray(supplied)||supplied.length!==2||supplied[0]!==`--disable-extensions-except=${extensionPath}`||supplied[1]!==`--load-extension=${extensionPath}`)throw fail('visibility-provider-invalid');
    args=supplied;
  }
  const argv=visibilityBrowserArgs(args,profilePath,headed);
  if(browserCandidate!==undefined)argv.push('--log-file='+path.join(artifactPath,'browser-candidate.log'));
  checkDeadline();
  /** @type {Awaited<ReturnType<typeof import('./run-job.mjs').launchRunJob>>|undefined} */let runJobOwner;
  if(runJob!==undefined){
    const provider=await import('./run-job.mjs');
    if(diagnosticWrites.length)await verifyDiagnosticDirectories(diagnosticWrites,protectedRoots);
    checkDeadline();runJobOwner=await provider.launchRunJob({helper:runJob.helper,executable:prepared,args:argv,deadline:deadline??Date.now(),...signal?{signal}:{},...chromiumTempDir===undefined?{}:{chromiumTempDir},...diagnosticAbortBy===undefined?{}:{diagnosticAbortBy}});
    if(!runJobOwner)throw fail('visibility-job-owner-unavailable');
  }
  if(requiresR3PrelaunchCollisionCheck(options.productCaseId)){
    if(extensionPath===undefined||deadline===undefined)throw fail('visibility-r3-prelaunch-input');
    const profileSpecifier='./native-profile.mjs';
    /** @type {unknown} */const profileProvider=await import(profileSpecifier);
    if(!profileProvider||typeof profileProvider!=='object')throw fail('visibility-provider-invalid');
    const query=Reflect.get(profileProvider,'queryWindowsProcesses');
    if(typeof query!=='function')throw fail('visibility-provider-invalid');
    checkDeadline();
    const remaining=deadline-Date.now();
    /** @type {unknown} */const roots=await query(profilePath,undefined,performance.now()+remaining,{extensionPath});
    checkDeadline();
    if(!Array.isArray(roots))throw fail('visibility-provider-invalid');
    if(roots.length)throw fail('visibility-r3-profile-conflict');
  }
  const child=runJobOwner?runJobOwner.child:spawn(prepared,argv,{stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true});
  const exited=new Promise(resolve=>{child.once('exit',()=>resolve(true));child.once('error',()=>resolve(true));});
  /** @type {Promise<{kind:'exit',code:number|null,signal:string|null,at:number}>|undefined} */
  const sameChildExit=options.productCaseId==='96000/reentry/2/10'&&!runJobOwner
    ?new Promise(resolve=>{child.once('exit',(code,signal)=>resolve(Object.freeze({kind:'exit',code,signal,at:performance.now()})));}):undefined;
  /** @type {Promise<unknown>|undefined} */let absoluteAbort;
  /** @type {number|undefined} */let absoluteShutdownBy;
  /** @type {((control?:{shutdownBy:number})=>Promise<unknown>) | RunJobHandoff['abort']} */
  let abort=(/** @type {{shutdownBy:number}|undefined} */control=undefined)=>{
    if(control!==undefined||absoluteAbort!==undefined){
      if(!sameChildExit||runJobOwner)throw fail('visibility-shutdown-control-invalid');
      if(absoluteAbort!==undefined){
        if(control!==undefined&&control?.shutdownBy!==absoluteShutdownBy)throw fail('visibility-shutdown-control-changed');
        return absoluteAbort;
      }
      const shutdownBy=control?.shutdownBy;
      if(typeof shutdownBy!=='number'||!Number.isFinite(shutdownBy))throw fail('visibility-shutdown-control-invalid');
      absoluteShutdownBy=shutdownBy;
      absoluteAbort=Promise.resolve().then(()=>stopVisibilityChild(child,sameChildExit,{shutdownBy}));
      return absoluteAbort;
    }
    return runJobOwner?runJobOwner.abort():stopVisibilityChild(child,exited);
  };
  try{
    if(runJobOwner){
      if(observeRunJobOwner){
        const observedAbort=observeRunJobOwner({binding:runJobOwner.binding,abort:runJobOwner.abort});
        if(typeof observedAbort!=='function')throw fail('visibility-job-observer');
        abort=observedAbort;checkDeadline();
      }
      await recordRunJob?.(runJobOwner.binding);checkDeadline();
    }
    if(diagnosticWrites.length){await verifyDiagnosticDirectories(diagnosticWrites,protectedRoots);checkDeadline();}
    const read=child.stdio[4],write=child.stdio[3];
    if(!(read instanceof Readable)||!(write instanceof Writable))throw fail('visibility-pipe-unavailable');
    const transport=createVisibilityTransport(read,write);
    child.once('error',()=>transport.close());
    // The ordinary launcher forces focused/visible pages; this supported connection preserves native tab visibility.
    const browser=await chromiumApi.connectOverCDP(transport,{noDefaults:true,timeout:15000,...playwrightArtifactsDir===undefined?{}:{artifactsDir:playwrightArtifactsDir}});
    checkDeadline();
    const browserCandidateVersion=browserCandidate===undefined?undefined:browser.version();
    if(browserCandidate!==undefined&&browserCandidateVersion!=='159.0.8132.0'){
      const error=fail('visibility-candidate-version');
      error.message+=': expected=159.0.8132.0 observed='+String(browserCandidateVersion).slice(0,128);throw error;
    }
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
    checkDeadline();
    return {browser,context,worker,extensionId,browserSession,...browserCandidate!==undefined?{browserCandidateVersion}:{},...runJobOwner?{runJobOwner}:{},...sameChildExit?{sameChildExit}:{},abort,
      ...browserCandidate&&!runJobOwner?{browserRootExited:()=>typeof child.exitCode==='number'||typeof child.signalCode==='string'}:{}};
  }catch(cause){
    try{await abort();}
    catch(retirementError){throw Object.assign(fail('visibility-startup-incomplete'),{cause,retirementError});}
    throw cause;
  }
}

/** @param {VisibilityOptions & {extensionPath:string}} options */
export async function launchVisibilityExtension(options){
  const {context,worker,extensionId}=await launchVisibilityBrowser(options);
  if(!worker||!extensionId)throw fail('visibility-worker-invalid');
  return {context,worker,extensionId};
}
