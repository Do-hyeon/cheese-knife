// Explicit process trial entry. Importing this module does not run a trial.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {open,lstat,realpath,readFile,readdir,mkdir,writeFile,rename,statfs} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {launchRunJob} from '../scripts/extension-e2e/run-job.mjs';
import {parseSelection,hashSelection,claimRow,finishRow,createBudget,createAttempts,parseIdentity,measureCase,cleanupCoverage} from './fixtures/installed-extension/run-job-process-support.mjs';

const entry=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(entry),'..');
const sourcePaths=[
  'scripts/extension-e2e/run-job.mjs','scripts/extension-e2e/run-job-owner.cpp','scripts/extension-e2e/run-job-owner.h',
  'tests/run-job-process.integration.mjs','tests/fixtures/installed-extension/run-job-process-support.mjs',
  'tests/fixtures/installed-extension/run-job-child.cpp','tests/fixtures/installed-extension/run-job-child.h',
];
const fail=code=>Error(`trial-${code}`);
const message=error=>String(error?.message??error).slice(0,1024);
const imageHex=image=>image.split('').map(ch=>ch.charCodeAt(0).toString(16).padStart(4,'0')).join('');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function bounded(promise,deadline){
  const remaining=deadline-performance.now();if(!Number.isFinite(remaining)||remaining<=0)throw fail('deadline');
  let timer;
  try{const value=await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('deadline')),remaining);})]);if(performance.now()>=deadline)throw fail('deadline');return value;}
  finally{clearTimeout(timer);}
}
async function exactFile(file,expected,maximum,pe=false){
  const before=await lstat(file);
  if(!before.isFile()||before.isSymbolicLink()||before.size<1||before.size>maximum||path.resolve(await realpath(file)).toLowerCase()!==path.resolve(file).toLowerCase())throw fail('file');
  const handle=await open(file,'r');
  try{
    const bytes=await handle.readFile(),after=await handle.stat();
    if(bytes.length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||createHash('sha256').update(bytes).digest('hex')!==expected)throw fail('bytes');
    if(pe){const offset=bytes.length>=64?bytes.readUInt32LE(0x3c):-1;if(bytes.toString('ascii',0,2)!=='MZ'||offset<64||offset+26>bytes.length||bytes.toString('binary',offset,offset+4)!=='PE\0\0'||bytes.readUInt16LE(offset+4)!==0x8664||bytes.readUInt16LE(offset+24)!==0x20b)throw fail('pe-x64');}
    return {bytes:bytes.length,sha256:expected};
  }finally{await handle.close();}
}
async function verifySources(expected){
  const digest=createHash('sha256');
  for(const relative of sourcePaths){const file=path.join(root,relative),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw fail('source');const bytes=await readFile(file);digest.update(relative+'\0'+bytes.length+'\0');digest.update(bytes);}
  if(digest.digest('hex')!==expected)throw fail('source-bytes');
}
async function storageBound(directory){
  let bytes=0,logs=0,count=0;
  async function visit(folder,depth){
    if(depth>3)throw fail('storage-depth');
    for(const name of await readdir(folder)){
      if(++count>128)throw fail('storage-count');
      const file=path.join(folder,name),stat=await lstat(file);
      if(stat.isSymbolicLink())throw fail('storage-link');
      if(stat.isDirectory())await visit(file,depth+1);
      else if(stat.isFile()){bytes+=stat.size;if(/\.(json|log|txt)$/i.test(name))logs+=stat.size;}
      else throw fail('storage-type');
      if(bytes>128*1024*1024-528*1024||logs>8*1024*1024-528*1024)throw fail('storage-bound');
    }
  }
  await visit(directory,0);
}
async function checkOutput(selection){
  if(process.platform!=='win32'||process.arch!=='x64')throw fail('windows-x64');
  const output=await lstat(selection.output);
  if(!output.isDirectory()||output.isSymbolicLink()||path.resolve(await realpath(selection.output)).toLowerCase()!==path.resolve(selection.output).toLowerCase())throw fail('output');
  if([selection.helper,selection.fixture].some(file=>path.dirname(file).toLowerCase()!==selection.output.toLowerCase()))throw fail('artifact-location');
}
async function preflight(selection){
  await checkOutput(selection);
  const capacity=await statfs(selection.output);
  if(capacity.bavail*capacity.bsize-128*1024*1024<10*1024**3)throw fail('free-space');
  await storageBound(selection.output);
  await verifySources(selection['source-sha256']);
  return {
    helper:await exactFile(selection.helper,selection['helper-sha256'],16*1024*1024,true),
    fixture:await exactFile(selection.fixture,selection['fixture-sha256'],16*1024*1024,true),
    node:await exactFile(process.execPath,selection['node-sha256'],256*1024*1024,true),
  };
}
function exitPromise(child){
  const promise=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  promise.catch(()=>{});return promise;
}
function lines(input,record){
  let partial='',error=null,ended=false,total=0,pending=null;const queue=[];
  const reject=reason=>{error??=reason;if(pending){pending.reject(error);pending=null;}};
  input.on('error',reject);
  input.on('data',chunk=>{
    total+=chunk.length;if(total>32768)return reject(fail('output-bound'));
    partial+=chunk.toString('utf8');if(partial.length>8192)return reject(fail('line-bound'));
    let newline;
    while((newline=partial.indexOf('\n'))>=0){
      const line=partial.slice(0,newline);partial=partial.slice(newline+1);try{record(line);}catch(error){return reject(error);}
      if(pending){const waiter=pending;pending=null;waiter.resolve(line);}else {queue.push(line);if(queue.length>32)reject(fail('output-queue'));}
    }
  });
  input.on('end',()=>{ended=true;if(partial)reject(fail('partial-line'));if(pending)reject(fail('unexpected-eof'));});
  input.on('close',()=>{if(!ended)reject(fail('unexpected-close'));});
  return {
    async next(deadline){if(error)throw error;if(queue.length)return queue.shift();if(ended||pending)throw fail('line-state');let waiter;const promise=new Promise((resolve,reject)=>{waiter={resolve,reject};pending=waiter;});try{return await bounded(promise,deadline);}finally{if(pending===waiter)pending=null;}},
    async eof(deadline){while(!ended&&!error){await bounded(delay(5),deadline);}if(error||partial||queue.length)throw error??fail('undrained-lines');return true;},
    check(){if(error||queue.length)throw error??fail('unexpected-line');},
  };
}
async function writeLine(output,line,deadline){
  if(!output||output.destroyed||!output.writable)throw fail('write-closed');
  await bounded(new Promise((resolve,reject)=>output.write(line+'\n',error=>error?reject(error):resolve())),deadline);
}
function witnessPort(child,nonce,budget,record){
  child.stdin.on('error',()=>{});
  const channel=lines(child.stdout,record),exited=exitPromise(child),prefix=nonce+'\tW\t';
  const next=async deadline=>{const line=await channel.next(deadline);if(!line.startsWith(prefix))throw fail('witness-identity');return line.slice(prefix.length);};
  return {
    async command(command,expected,deadline=budget.formation){
      channel.check();await writeLine(child.stdin,command,deadline);const line=await next(deadline);
      if(expected!==null&&line!==expected)throw fail('witness-response');return line;
    },
    async bind(role,identity,image){
      const line=await this.command(`B\t${role}\t${identity.pid}\t${identity.created??'-'}\t${imageHex(image)}`,null);
      const match=new RegExp(`^B\\t${role}\\t([a-f0-9]{16})$`).exec(line);
      if(!match||match[1]==='0000000000000000'||identity.created&&identity.created!==match[1])throw fail('witness-binding');return match[1];
    },
    async result(){
      const line=await next(budget.row-5000);if(!line.startsWith('RESULT\t'))throw fail('witness-result');
      const result=JSON.parse(line.slice(7)),exit=await bounded(exited,budget.row-1000);await channel.eof(budget.row-1000);
      if(exit.code!==0||exit.signal!==null)result.ok=false;result.exit=exit;return result;
    },
    async stop(){
      try{await writeLine(child.stdin,'STOP',Math.min(budget.row-5000,performance.now()+100));}catch{}
      try{return await this.result();}catch(error){return {ok:false,error:message(error),terminationUnconfirmed:true};}
    },
  };
}

async function startJob(selection,nonce,deadline,accounting){
  return launchRunJob({helper:{path:selection.helper,sha256:selection['helper-sha256']},executable:selection.fixture,
    args:['--role=root',`--nonce=${nonce}`,'--remote-debugging-pipe'],deadline:Date.now()+Math.max(0,deadline-performance.now())},
  {accounting,diagnoseJobMembers:selection['job-members-diagnostic']==='1',syntheticRootConsole:selection['synthetic-root-console']});
}
function targetPort(job,nonce,record){
  const output=job.child.stdio[3],input=job.child.stdio[4];output.on('error',()=>{});
  const channel=lines(input,record);
  return {
    async identity(role,deadline){await writeLine(output,`${role==='ROOT'?'PING':'CHILD'}\t${nonce}`,deadline);return parseIdentity(await channel.next(deadline),role,nonce);},
    exit:deadline=>writeLine(output,`EXIT\t${nonce}`,deadline),
    eof:deadline=>channel.eof(deadline),
  };
}

// This same fixed entry acts as controller only through a private inherited IPC channel.
async function controller(selection,nonce){
  if(typeof process.send!=='function'||!process.connected||selection.case!=='controller-death'||!/^[a-f0-9]{64}$/.test(nonce))throw fail('controller-channel');
  const localStart=performance.now(),formationEnd=localStart+10000;
  let job=null,port=null,challenged=false,started=false,sequence=0;
  const send=value=>process.send({...value,nonce});
  process.on('message',async request=>{
    try{
      if(!request||request.nonce!==nonce||request.seq!==++sequence||performance.now()>=formationEnd)throw fail('controller-request');
      if(request.op==='challenge'&&!challenged){if(!/^[a-f0-9]{64}$/.test(request.challenge))throw fail('controller-challenge');challenged=true;send({seq:request.seq,op:'challenge',challenge:request.challenge,pid:process.pid});}
      else if(request.op==='start'&&challenged&&!started){
        started=true;
        const remaining=request.remaining;
        if(!Number.isInteger(remaining)||remaining<=0||remaining>10000)throw fail('controller-budget');
        const deadline=Math.min(localStart+remaining,formationEnd);
        job=await startJob(selection,nonce,deadline);port=targetPort(job,nonce,()=>{});
        const identity=await port.identity('ROOT',deadline);
        if(identity.pid!==job.binding.pid||identity.created!==job.binding.created)throw fail('root-binding');
        send({seq:request.seq,op:'start',binding:job.binding,identity});
      }else if(request.op==='child'&&port){
        const remaining=request.remaining;if(!Number.isInteger(remaining)||remaining<=0||remaining>10000)throw fail('controller-budget');
        const identity=await port.identity('CHILD',Math.min(localStart+remaining,formationEnd));send({seq:request.seq,op:'child',identity});
      }else throw fail('controller-order');
    }catch(error){send({seq:request?.seq,op:'error',error:message(error),cause:error.cause?message(error.cause):null,retirementError:error.retirementError?message(error.retirementError):null});}
  });
  // Losing driver IPC is not fixture cleanup and must not pre-kill the helper.
  process.on('disconnect',()=>{});
  await new Promise(()=>{});
}
function controllerPort(child,nonce,budget,record){
  let sequence=0,pending=null,error=null,total=0;
  const exited=exitPromise(child);
  child.on('message',value=>{
    total+=Buffer.byteLength(JSON.stringify(value));if(total>8192||!pending||value?.nonce!==nonce||value.seq!==pending.seq){error??=fail('controller-response');pending?.reject(error);pending=null;return;}
    try{record(value);}catch(cause){error??=cause;pending.reject(error);pending=null;return;}
    const waiter=pending;pending=null;if(value.op==='error')waiter.reject(Object.assign(fail(`controller-${value.error}`),{cause:value.cause,retirementError:value.retirementError}));else if(value.op!==waiter.op)waiter.reject(fail('controller-op'));else waiter.resolve(value);
  });
  child.on('error',cause=>{error??=cause;pending?.reject(error);pending=null;});
  child.on('exit',()=>{if(pending){pending.reject(fail('controller-exit'));pending=null;}});
  return {
    async call(op,fields={}){
      if(error||pending||!child.connected)throw error??fail('controller-state');
      const seq=++sequence;
      const promise=new Promise((resolve,reject)=>{pending={seq,op,resolve,reject};child.send({nonce,seq,op,...fields},error=>{if(error)reject(error);});});
      try{return await bounded(promise,op==='start'?budget.measurementEnd:budget.formation);}finally{pending=null;}
    },exited,
  };
}

export async function runTrial(argv){
  const budget=createBudget(()=>performance.now()),args=[...argv],selection=parseSelection(args),attempts=createAttempts(selection.case);
  const accounting=selection.case==='pipe-exit'?{}:undefined;
  const batchRemaining=selection['batch-deadline']-Date.now();
  const batchCap=selection['synthetic-root-console']==='detached-v1'?240000:600000;
  if(batchRemaining<60000||batchRemaining>batchCap)throw fail('batch-budget');
  attempts.take('driver');
  const selectionHash=hashSelection(selection);
  const ledgerFile=path.join(selection.output,'trial-state.json'),lockFile=path.join(selection.output,'trial.lock');
  let lock=null,ledger=null,witness=null,result=null,before=null,rowDirectory=null,job=null,target=null,controllerChild=null;
  const evidence=[];let evidenceBytes=0;
  const record=value=>{const encoded=JSON.stringify(value);evidenceBytes+=Buffer.byteLength(encoded);if(evidenceBytes>256*1024)throw fail('evidence-bound');evidence.push(value);};
  const persistLedger=async value=>{const temporary=ledgerFile+'.tmp';await writeFile(temporary,JSON.stringify(value)+'\n',{flag:'wx'});await rename(temporary,ledgerFile);};
  try{
    await bounded(checkOutput(selection),budget.formation);
    lock=await open(lockFile,'wx');
    let previous=null;try{const stat=await lstat(ledgerFile);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384)throw fail('ledger-bound');const bytes=await readFile(ledgerFile);if(bytes.length>16384)throw fail('ledger-bound');previous=JSON.parse(bytes.toString('utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    ledger=claimRow(previous,selection.case,selectionHash,selection['batch-deadline']);await persistLedger(ledger);
    const nextDirectory=path.join(selection.output,selection.case);await mkdir(nextDirectory);rowDirectory=nextDirectory;
    before=await bounded(preflight(selection),budget.formation);budget.requireFormation();
    const nonce=randomBytes(32).toString('hex');record({nonce,case:selection.case,selection,before});
    attempts.take('witness');
    const child=spawn(selection.fixture,['--role=witness',`--nonce=${nonce}`,`--case=${selection.case}`],{stdio:['pipe','pipe','ignore'],windowsHide:true});
    witness=witnessPort(child,nonce,budget,line=>record({witness:line}));
    await witness.command('HELLO','HELLO');const remaining=budget.helloBudgets();await witness.command(`LIMIT\t${remaining.row}\t${remaining.formation}`,'LIMIT');
    let controllerWire=null,binding=null;
    if(selection.case==='controller-death'){
      budget.requireFormation();attempts.take('controller');
      controllerChild=spawn(process.execPath,[entry,...args,`--controller=${nonce}`],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
      controllerWire=controllerPort(controllerChild,nonce,budget,value=>record({controller:value}));
      const created=await witness.bind('controller',{pid:controllerChild.pid},process.execPath);
      const challenge=randomBytes(32).toString('hex'),reply=await controllerWire.call('challenge',{challenge});
      if(reply.pid!==controllerChild.pid||reply.challenge!==challenge)throw fail('controller-challenge');
      await witness.command(`C\tcontroller\t${created}`,`C\tcontroller\t${created}`);
      attempts.take('helper');attempts.take('root');
      const ready=await controllerWire.call('start',{remaining:budget.remaining(budget.formation)});budget.requireFormation();binding=ready.binding;
      if(binding.pid!==ready.identity.pid||binding.created!==ready.identity.created)throw fail('root-binding');
    }else{
      budget.requireFormation();attempts.take('helper');attempts.take('root');
      job=await bounded(startJob(selection,nonce,budget.formation,accounting),budget.measurementEnd);budget.requireFormation();binding=job.binding;target=targetPort(job,nonce,line=>record({fixture:line}));
      const identity=await target.identity('ROOT',budget.formation);
      if(identity.pid!==binding.pid||identity.created!==binding.created)throw fail('root-binding');
    }
    await witness.bind('helper',{pid:binding.helperPid,created:binding.helperCreated},selection.helper);
    await witness.bind('root',{pid:binding.pid,created:binding.created},selection.fixture);
    if(selection.case!=='pipe-exit'){
      budget.requireFormation();attempts.take('child');
      const identity=controllerWire?(await controllerWire.call('child',{remaining:budget.remaining(budget.formation)})).identity:await target.identity('CHILD',budget.formation);
      await witness.bind('child',identity,selection.fixture);
    }
    if(selection.case==='detached-abort'){
      await target.exit(budget.formation);
      for(;;){
        const state=await witness.command('CHECK',null);
        if(state==='CHECK\thelper:alive\troot:dead\tchild:alive')break;
        if(state!=='CHECK\thelper:alive\troot:alive\tchild:alive')throw fail('detached-formation');
        await bounded(delay(5),budget.formation);
      }
    }
    budget.requireFormation();
    result=await bounded(measureCase(selection.case,{
      binding,
      arm:()=>witness.command('ARM','ARM'),go:remaining=>witness.command(`GO\t${remaining}`,'GO',budget.measurementEnd),
      exitRoot:()=>target.exit(budget.measurementEnd),close:deadline=>job.close(deadline),abort:()=>job.abort(),
      controllerExit:()=>bounded(controllerWire.exited,budget.measurementEnd),witness:()=>witness.result(),eof:()=>target.eof(budget.measurementEnd),
    },budget),budget.row-5000);
    result.binding=binding;
    result.terminationUnconfirmed=!cleanupCoverage(attempts.roles,result.witness);
    if(result.terminationUnconfirmed)result.ok=false;
    if(!result.ok)throw Object.assign(fail('outcome'),{result});
    await bounded(preflight(selection),budget.row-1000);
  }catch(error){
    result={...(error.measurement??{}),...(error.result??result),ok:false,error:message(error),cause:error.cause?message(error.cause):null,retirementError:error.retirementError?message(error.retirementError):null};
    if(witness&&!result.witness)result.witness=await witness.stop();
    // Unbound or provisional identities are reported; no PID scan, reopen or extra kill.
    result.terminationUnconfirmed=!cleanupCoverage(attempts.roles,result.witness);
  }finally{
    result??={ok:false,error:'trial-incomplete'};
    if(accounting){
      const {binding=null,ready=null,firstQ=null,closed=null,members=null}=accounting;
      const jobAccounting={status:binding&&ready&&firstQ&&closed?'sampled':'unformed',binding,ready,firstQ,closed};
      if(selection['job-members-diagnostic']==='1'){
        const status=members?'sampled':firstQ&&(firstQ.active!==2||firstQ.total!==2)?'not-triggered':'unformed';
        jobAccounting.memberProbe={status,sample:members};
      }
      try{record({jobAccounting});}
      catch{result.jobAccountingEvidence='unformed';}
    }
    result.attempts={reserved:attempts.count,roles:attempts.roles};result.elapsedMs=performance.now()-budget.start;
    result.scope='synthetic run-job process trial; Chromium and product acceptance unassessed';
    try{
      if(!before)result.bytesAfter='preflight-unformed';
      else {await bounded(verifySources(selection['source-sha256']),budget.row);await bounded(exactFile(selection.helper,selection['helper-sha256'],16*1024*1024,true),budget.row);await bounded(exactFile(selection.fixture,selection['fixture-sha256'],16*1024*1024,true),budget.row);await bounded(exactFile(process.execPath,selection['node-sha256'],256*1024*1024,true),budget.row);result.bytesAfter='matched';}
    }catch(error){result.ok=false;result.bytesAfter=message(error);}
    if(ledger){
      try{
        if(performance.now()>=budget.row)throw fail('persistence-deadline');
        const report=JSON.stringify({result,evidence})+'\n';if(Buffer.byteLength(report)>512*1024)throw fail('report-bound');
        if(rowDirectory)await bounded(writeFile(path.join(rowDirectory,'result.json'),report,{flag:'wx'}),budget.row);
        ledger=finishRow(ledger,result);await bounded(persistLedger(ledger),budget.row);
      }catch(error){result.ok=false;result.persistenceError=message(error);}
    }
    // Only the designated outer executor may release this lock after actual exit and report checks.
    if(lock){try{await lock.close();}catch(error){result.ok=false;result.lockError=message(error);}}
  }
  return result;
}

if(process.argv[1]&&path.resolve(process.argv[1]).toLowerCase()===path.resolve(entry).toLowerCase()){
  const argv=process.argv.slice(2),controllerArg=argv.at(-1);
  try{
    if(controllerArg?.startsWith('--controller='))await controller(parseSelection(argv.slice(0,-1)),controllerArg.slice(13));
    else {
      const deadline=performance.now()+60000;
      const timer=setTimeout(()=>process.exit(1),60000);
      try{const result=await runTrial(argv);await writeLine(process.stdout,JSON.stringify(result),deadline);clearTimeout(timer);process.exit(result.ok?0:1);}
      catch(error){try{await writeLine(process.stderr,message(error),deadline);}catch{}clearTimeout(timer);process.exit(1);}
    }
  }catch(error){process.stderr.write(message(error)+'\n');process.exitCode=1;}
}
