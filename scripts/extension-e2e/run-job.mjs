import path from 'node:path';
import {open,lstat,realpath} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';

/** @param {string} code */const fail=code=>Error('run-job-'+code);
/** @param {unknown} value */const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
/** @param {unknown} value */const integer=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=0xffffffff;
/** @param {unknown} value */const filetime=value=>typeof value==='string'&&/^[a-f0-9]{16}$/.test(value)&&value!=='0000000000000000';
/** @typedef {{path:string,sha256:string}} Helper */
/** @typedef {{nonce:string,pid:number,created:string,helperPid:number,helperCreated:string,helperSha256:string,executable:string}} JobBinding */
/** @typedef {{active:number,total:number,rootExited:boolean}} State */
/** @typedef {{seq:number,active:number,total:number}} AccountingSample */
/** @typedef {{binding?:JobBinding,ready?:AccountingSample,firstQ?:AccountingSample,closed?:AccountingSample,members?:{seq:number,pids:number[]}}} AccountingCapture */
/** @typedef {{code:number|null,signal:NodeJS.Signals|null}} Exit */
/** @param {Helper} helper */
export async function verifyRunJobHelper(helper){
  if(!helper||typeof helper.path!=='string'||!path.isAbsolute(helper.path)||/^[\\/]{2}/.test(helper.path)||!helper.path.toLowerCase().endsWith('.exe')||!hex(helper.sha256))throw fail('helper-selection');
  const stat=await lstat(helper.path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>16*1024*1024||path.resolve(await realpath(helper.path)).toLowerCase()!==path.resolve(helper.path).toLowerCase())throw fail('helper-file');
  const handle=await open(helper.path,'r');
  try{const before=await handle.stat(),bytes=await handle.readFile(),after=await handle.stat();
    if(before.size!==stat.size||bytes.length!==stat.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||createHash('sha256').update(bytes).digest('hex')!==helper.sha256)throw fail('helper-bytes');
  }finally{await handle.close();}
}

/** @param {unknown} value @param {JobBinding} expected */
export function isRunJobShutdown(value,expected){
  if(!value||typeof value!=='object')return false;
  const p=/** @type {Record<string,any>} */(value);
  return p.contract==='run-job-v1'&&p.browserCloseAcknowledged===true&&p.browserDisconnected===true&&p.ownedRootClosed===null&&p.runJobClosed===true&&p.profileRootAssessment==='UNASSESSED'&&
    isRunJobExit(p.job,expected,false);
}

/** @param {any} job @param {JobBinding} expected @param {boolean} aborted */
function isRunJobExit(job,expected,aborted){
  return !!expected&&hex(expected.nonce)&&integer(expected.pid)&&expected.pid>0&&filetime(expected.created)&&integer(expected.helperPid)&&expected.helperPid>0&&expected.helperPid!==expected.pid&&filetime(expected.helperCreated)&&hex(expected.helperSha256)&&
    !!job&&isDeepStrictEqual(job.binding,expected)&&job.active===0&&job.rootExited===true&&job.helperExited===true&&job.aborted===aborted&&integer(job.total)&&job.total>0&&
    job.timing?.budgetMs===15000&&Number.isFinite(job.timing.remainingBeforeMs)&&job.timing.remainingBeforeMs<=15000&&Number.isFinite(job.timing.remainingAfterMs)&&job.timing.remainingAfterMs>0&&job.timing.remainingBeforeMs>=job.timing.remainingAfterMs;
}

/** @param {unknown} job @param {JobBinding} expected */
export function isRunJobRetirement(job,expected){return isRunJobExit(job,expected,true);}

/** @param {Promise<any>} promise @param {number} deadline */
async function bounded(promise,deadline){
  const remaining=deadline-performance.now();if(!Number.isFinite(remaining)||remaining<=0)throw fail('deadline');
  let timer;
  try{const result=await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('deadline')),remaining);})]);
    if(performance.now()>=deadline)throw fail('deadline');return result;
  }finally{clearTimeout(timer);}
}

/** @param {{helper:Helper,executable:string,args:string[],deadline:number,signal?:AbortSignal,chromiumTempDir?:string,diagnosticAbortBy?:number}} options
 * @param {{spawnChild?:typeof spawn,verifyHelper?:typeof verifyRunJobHelper,nonce?:()=>string,accounting?:AccountingCapture,diagnoseJobMembers?:boolean,syntheticRootConsole?:'detached-v1'}} dependencies */
export async function launchRunJob(options,dependencies={}){
  const {executable,signal,chromiumTempDir,diagnosticAbortBy}=options,helper=Object.freeze({...options.helper}),args=[...options.args];
  if(diagnosticAbortBy!==undefined&&(chromiumTempDir===undefined||!Number.isFinite(diagnosticAbortBy)))throw fail('abort-deadline');
  const {accounting,syntheticRootConsole}=dependencies,diagnoseMembers=dependencies.diagnoseJobMembers===true;
  const detachedSyntheticRoot=syntheticRootConsole==='detached-v1';
  if(syntheticRootConsole!==undefined&&(!detachedSyntheticRoot||diagnoseMembers))throw fail('synthetic-root-console');
  if(chromiumTempDir!==undefined&&(syntheticRootConsole!==undefined||diagnoseMembers||typeof chromiumTempDir!=='string'||
    !/^[a-z]:[\\]/i.test(chromiumTempDir)||chromiumTempDir.length>258||path.normalize(chromiumTempDir)!==chromiumTempDir||
    chromiumTempDir.slice(3).split('\\').some(part=>!part||/[<>:"|?*\x00-\x1f]|[. ]$/.test(part)||
      /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))))throw fail('temp-directory');
  const env=chromiumTempDir===undefined?undefined:{
    ...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(?:TEMP|TMP)$/i.test(key))),
    TEMP:chromiumTempDir,TMP:chromiumTempDir,
  };
  const launchDeadline=performance.now()+(options.deadline-Date.now());
  const check=()=>{if(signal?.aborted||!Number.isFinite(launchDeadline)||performance.now()>=launchDeadline)throw fail('deadline');};
  check();await (dependencies.verifyHelper??verifyRunJobHelper)(helper);check();
  if(chromiumTempDir!==undefined){
    const stat=await lstat(chromiumTempDir),actual=await realpath(chromiumTempDir);
    if(!stat.isDirectory()||stat.isSymbolicLink()||actual.toLowerCase()!==chromiumTempDir.toLowerCase())throw fail('temp-directory');
    check();
  }
  if(!path.isAbsolute(executable)||!Array.isArray(args)||args.some(arg=>typeof arg!=='string'||arg.includes('\0'))||!args.includes('--remote-debugging-pipe')||args.some(arg=>arg.startsWith('--remote-debugging-io-pipes')))throw fail('launch-input');
  if(diagnoseMembers||detachedSyntheticRoot){
    const [role,fixtureNonce,pipe]=args;
    if(diagnoseMembers&&!accounting||args.length!==3||role!=='--role=root'||!fixtureNonce?.startsWith('--nonce=')||
      !hex(fixtureNonce.slice(8))||pipe!=='--remote-debugging-pipe')throw fail(diagnoseMembers?'member-diagnostic-input':'synthetic-root-console-input');
  }
  const nonce=(dependencies.nonce??(()=>randomBytes(32).toString('hex')))();if(!hex(nonce))throw fail('nonce');
  const ownerArgs=[`--nonce=${nonce}`,`--executable=${executable}`];
  if(diagnoseMembers)ownerArgs.push('--job-members-diagnostic');
  if(detachedSyntheticRoot)ownerArgs.push('--synthetic-root-console=detached-v1');
  const child=(dependencies.spawnChild??spawn)(helper.path,[...ownerArgs,'--',...args],{stdio:['pipe','pipe','ignore','pipe','pipe'],windowsHide:true,...env===undefined?{}:{env}});
  /** @type {Error|null} */let protocolError=null;
  /** @type {JobBinding|null} */let binding=null;
  /** @type {{seq:number,op:string,deadline:number,resolve:(value:State)=>void,reject:(error:Error)=>void}|null} */let pending=null;
  /** @type {Exit|null} */let exitResult=null;
  /** @type {Promise<unknown>|null} */let abortPromise=null;
  /** @type {Promise<unknown>|undefined} */let normalClose;
  let normalWire=0;
  let buffer='',sequence=0,total=0,aborted=false,closeAttempted=false,closed=false,memberDeadline=0;
  /** @type {(value:JobBinding)=>void} */let readyResolve=()=>{};
  /** @type {(error:Error)=>void} */let readyReject=()=>{};
  /** @type {(value:Exit)=>void} */let exitResolve=()=>{};
  /** @type {()=>void} */let drainResolve=()=>{};
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
  const exited=new Promise(resolve=>{exitResolve=resolve;});
  const drained=new Promise(resolve=>{drainResolve=()=>resolve(true);});
  /** @param {'ready'|'firstQ'|'closed'} slot @param {AccountingSample} row */
  const saveAccounting=(slot,{seq,active,total})=>{
    if(!accounting||!binding)return;
    try{
      const sample={seq,active,total};
      if(slot==='ready'){
        accounting.binding=binding;
        accounting.ready=sample;
      }else if(accounting.binding===binding){
        if(slot==='firstQ')accounting.firstQ??=sample;
        else accounting.closed??=sample;
      }
    }catch{/* Optional diagnostic storage cannot change ownership or control errors. */}
  };
  /** @param {string} code */const broken=code=>{protocolError??=fail(code);readyReject(protocolError);if(pending){const p=pending;pending=null;p.reject(protocolError);}};
  child.once('exit',(code,signal)=>{exitResult={code,signal};exitResolve(exitResult);});
  child.once('error',()=>broken('helper-error'));
  child.stdin?.on('error',()=>broken('control-write'));
  child.stdout?.on('error',()=>broken('control-read'));
  child.stdout?.on('end',()=>{if(!closed||buffer!==''||pending)broken('control-eof');drainResolve();});
  child.stdout?.on('close',()=>{if(!child.stdout?.readableEnded)broken('control-close');});
  child.stdout?.on('data',bytes=>{
    if(protocolError)return;
    buffer+=bytes.toString('utf8');
    if(Buffer.byteLength(buffer)>1024)return broken('response-bound');
    let newline;
    while((newline=buffer.indexOf('\n'))!==-1){
      const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);let row;
      try{row=JSON.parse(line);}catch{return broken('response-json');}
      if(diagnoseMembers&&binding&&!closed&&row?.event==='job-members'){
        if(!aborted&&performance.now()<memberDeadline&&row.v===1&&row.nonce===nonce&&row.seq===1&&
          row.pid===binding.pid&&row.created===binding.created){
          memberDeadline=0;
          const {pids}=row;
          if(Array.isArray(pids)&&pids.length===2&&pids.every(pid=>integer(pid)&&pid>0)&&
            pids[0]!==pids[1]&&pids.includes(binding.pid)){
            try{if(accounting?.binding===binding)accounting.members={seq:row.seq,pids};}catch{/* Optional evidence only. */}
          }
        }
        continue;
      }
      if(!row||row.v!==1||row.nonce!==nonce)return broken('response-identity');
      if(row.event==='error')return broken(integer(row.code)?`owner-error-${row.code}`:'owner-error');
      if(!binding){
        if(row.event!=='ready'||row.seq!==0||!integer(row.pid)||row.pid===0||!filetime(row.created)||!integer(row.helperPid)||row.helperPid===0||row.helperPid!==child.pid||row.helperPid===row.pid||!filetime(row.helperCreated)||!integer(row.active)||row.active<1||!integer(row.total)||row.total<row.active)return broken('initial-membership');
        total=row.total;binding=Object.freeze({nonce,pid:row.pid,created:row.created,helperPid:row.helperPid,helperCreated:row.helperCreated,helperSha256:helper.sha256,executable});
        if(accounting&&!signal?.aborted&&performance.now()<launchDeadline)saveAccounting('ready',row);
        readyResolve(binding);continue;
      }
      if(!pending||row.seq!==pending.seq||row.pid!==binding.pid||row.created!==binding.created||row.event!==(pending.op==='C'?'closed':'state')||!integer(row.total)||row.total<total||!integer(row.active)||row.active>row.total||typeof row.rootExited!=='boolean'||row.aborted!==aborted||row.active===0&&!row.rootExited)return broken('response-state');
      if(pending.op==='C'&&(row.active!==0||!row.rootExited))return broken('close-unconfirmed');
      if(pending.seq>1)memberDeadline=0;
      if(accounting&&!aborted&&performance.now()<pending.deadline){
        if(pending.op==='Q'){
          saveAccounting('firstQ',row);
          if(diagnoseMembers&&pending.seq===1&&row.active===2&&row.total===2)memberDeadline=pending.deadline;
        }
        if(pending.op==='C')saveAccounting('closed',row);
      }
      total=row.total;if(pending.op==='C')closed=true;
      if(normalWire===pending.seq)normalWire=0;
      const p=pending;pending=null;p.resolve(row);
    }
  });
  /** @param {string} op @param {number} deadline */const command=async(op,deadline)=>{
    if(protocolError)throw protocolError;if(!binding||pending||closed||performance.now()>=deadline)throw fail('deadline');
    if(sequence===0xffffffff)throw fail('sequence');
    const seq=++sequence;
    const response=new Promise((resolve,reject)=>{pending={seq,op,deadline,resolve,reject};});
    try{
      if(!child.stdin)throw fail('control-unavailable');
      if(chromiumTempDir!==undefined&&!aborted&&(op==='Q'||op==='C'))normalWire=seq;
      child.stdin.write(`${op} ${seq}\n`);
      return await bounded(response,deadline);
    }finally{const outstanding=/** @type {{seq:number}|null} */(pending);if(outstanding?.seq===seq)pending=null;}
  };
  /** @param {number} deadline */const finish=async deadline=>{
    const remainingBeforeMs=deadline-performance.now();if(!Number.isFinite(remainingBeforeMs)||remainingBeforeMs<=0||remainingBeforeMs>15000)throw fail('deadline');
    let state=await command('Q',deadline);
    while(state.active!==0){await bounded(new Promise(resolve=>setTimeout(resolve,50)),deadline);state=await command('Q',deadline);}
    state=await command('C',deadline);
    const exit=await bounded(exited,deadline);
    await bounded(drained,deadline);
    if(exit.code!==0||exit.signal!==null||protocolError)throw fail('helper-exit-unconfirmed');
    const remainingAfterMs=deadline-performance.now();if(remainingAfterMs<=0)throw fail('deadline');
    return {binding,active:0,rootExited:true,total:state.total,helperExited:true,aborted,timing:{budgetMs:15000,remainingBeforeMs,remainingAfterMs}};
  };
  /** @param {number} [startBy] */
  const abort=(startBy)=>abortPromise??=(async()=>{
    let started=performance.now();
    if(chromiumTempDir!==undefined){
      await Promise.resolve();
      const latest=Math.min(diagnosticAbortBy??Infinity,startBy??Infinity,performance.now()+15000);
      if(normalClose)await bounded(normalClose,latest).catch(()=>{});
      // A timed-out Q/C may still be executing in the helper.
      if(normalWire!==0)throw fail('close-unconfirmed');
      started=performance.now();
      if(started>=latest)throw fail('abort-deadline');
    }
    const deadline=started+15000;
    try{if(closed){const exit=await bounded(exited,deadline);await bounded(drained,deadline);if(exit.code!==0||exit.signal!==null||protocolError)throw fail('helper-exit-unconfirmed');return;}
      if(protocolError||!binding)throw fail('abort-unformed');aborted=true;await command('A',deadline);return await finish(deadline);
    }catch(cause){
      // Killing the owner releases its private Job; it does not prove OS accounting zero.
      if(!exitResult&&(chromiumTempDir===undefined||performance.now()<deadline)){
        if(!child.kill())throw Object.assign(fail('abort-stop-failed'),{cause});await bounded(exited,deadline);
      }
      throw Object.assign(fail('abort-unconfirmed'),{cause});
    }
  })();
  const onAbort=()=>broken('launch-aborted');signal?.addEventListener('abort',onAbort,{once:true});
  try{await bounded(ready,launchDeadline);check();if(protocolError)throw protocolError;if(!binding)throw fail('initial-membership');return {child,binding:/** @type {JobBinding} */(binding),abort,close:async(/** @type {number} */deadline)=>{
    if(closeAttempted||chromiumTempDir!==undefined&&abortPromise)throw fail('close-repeated');
    closeAttempted=true;
    if(chromiumTempDir===undefined)return finish(deadline);
    return normalClose=Promise.resolve().then(()=>finish(deadline));
  }};}catch(cause){try{await abort();}catch(retirementError){throw Object.assign(fail('startup-incomplete'),{cause,retirementError});}throw cause;
  }finally{signal?.removeEventListener('abort',onAbort);}
}
