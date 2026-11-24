// Pure HOST support: process, filesystem and clock effects are supplied by the entry.
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
export const cases=Object.freeze(['pipe-exit','detached-abort','helper-death','controller-death']);
const fail=code=>Error(`trial-${code}`);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const absolute=value=>typeof value==='string'&&/^[a-z]:[\\/]/i.test(value)&&!/[\0\r\n]/.test(value)&&!value.slice(2).includes(':');
export function parseSelection(argv){
  const keys=['case','helper','helper-sha256','fixture','fixture-sha256','source-sha256','node-sha256','output','batch-deadline'];
  const diagnostic='job-members-diagnostic';
  const rootConsole='synthetic-root-console';
  const result={};
  for(const arg of argv){
    if(typeof arg!=='string')throw fail('selection');
    const match=/^--([^=]+)=(.+)$/.exec(arg);
    if(!match||(!keys.includes(match[1])&&match[1]!==diagnostic&&match[1]!==rootConsole)||Object.hasOwn(result,match[1]))throw fail('selection');
    result[match[1]]=match[2];
  }
  if(keys.some(key=>!Object.hasOwn(result,key))||!cases.includes(result.case)||
    (Object.hasOwn(result,diagnostic)&&(result.case!=='pipe-exit'||result[diagnostic]!=='1'))||
    (Object.hasOwn(result,rootConsole)&&(result[rootConsole]!=='detached-v1'||Object.hasOwn(result,diagnostic)))||
    ['helper','fixture','output'].some(key=>!absolute(result[key]))||
    ['helper','fixture'].some(key=>!result[key].toLowerCase().endsWith('.exe'))||
    keys.filter(key=>key.endsWith('sha256')).some(key=>!hash(result[key]))||
    !/^[1-9]\d{0,15}$/.test(result['batch-deadline'])||!Number.isSafeInteger(Number(result['batch-deadline'])))throw fail('selection');
  return Object.freeze({...result,'batch-deadline':Number(result['batch-deadline'])});
}
export function hashSelection(selection){
  return createHash('sha256').update(JSON.stringify({...selection,case:undefined})).digest('hex');
}
export function claimRow(previous,name,selectionHash,batchDeadline){
  if(!cases.includes(name)||!hash(selectionHash)||!Number.isSafeInteger(batchDeadline))throw fail('ledger-selection');
  const ledger=previous===null?{v:1,selectionHash,batchDeadline,rows:[],unexecuted:[]}:structuredClone(previous);
  if(ledger.v!==1||ledger.selectionHash!==selectionHash||ledger.batchDeadline!==batchDeadline||!Array.isArray(ledger.rows)||ledger.rows.length>=4||
    ledger.rows.some((row,index)=>row.case!==cases[index]||row.status!=='passed')||cases[ledger.rows.length]!==name)throw fail('ledger-stop');
  ledger.rows.push({case:name,status:'running'});ledger.unexecuted=cases.slice(ledger.rows.length);
  return ledger;
}
export function finishRow(previous,result){
  const ledger=structuredClone(previous),row=ledger.rows.at(-1);
  if(!row||row.status!=='running')throw fail('ledger-finish');
  row.status=result.ok===true?'passed':'failed';return ledger;
}
export function createBudget(now){
  const start=now(),formation=start+10000,measurementEnd=start+45000,row=start+60000;
  const requireFormation=()=>{if(now()>=formation)throw fail('formation');};
  return Object.freeze({now,start,row,formation,measurementEnd,
    requireFormation,
    helloBudgets(){requireFormation();return {row:Math.floor(row-now()),formation:Math.floor(formation-now())};},
    measurement(ms){const current=now();if(!Number.isFinite(ms)||ms<=0||ms>35000||current+ms>measurementEnd)throw fail('budget');return current+ms;},
    remaining(deadline){const value=Math.floor(deadline-now());if(value<=0)throw fail('budget');return value;},
  });
}
export function createAttempts(name){
  if(!cases.includes(name))throw fail('case');
  const allowed=['driver','witness',...(name==='controller-death'?['controller']:[]),'helper','root',...(name==='pipe-exit'?[]:['child'])];
  const used=[];
  return {take(role){if(!allowed.includes(role)||used.includes(role)||used.length>=allowed.length)throw fail('creation');used.push(role);},get count(){return used.length;},get roles(){return [...used];}};
}
export function parseIdentity(line,role,nonce){
  if(!['ROOT','CHILD'].includes(role)||!hash(nonce)||typeof line!=='string'||line.length>160)throw fail('identity');
  const parts=line.split('\t'),pid=Number(parts[1]);
  if(parts.length!==4||parts[0]!==role||parts[3]!==nonce||!Number.isInteger(pid)||pid<1||pid>0xffffffff||String(pid)!==parts[1]||!/^[a-f0-9]{16}$/.test(parts[2])||parts[2]==='0000000000000000')throw fail('identity');
  return {pid,created:parts[2]};
}
export function cleanupCoverage(roles,witness){
  const expected=roles.filter(role=>!['driver','witness'].includes(role));
  if(!witness||(witness.ok!==true&&witness.cleanupConfirmed!==true)||!Number.isInteger(witness.exit?.code)||witness.exit.signal!==null||
    !Array.isArray(witness.identities)||!Array.isArray(witness.exited)||witness.identities.length!==expected.length||witness.exited.length!==expected.length)return false;
  const ids=witness.identities;
  return new Set(ids.map(i=>i.role)).size===expected.length&&new Set(ids.map(i=>i.pid)).size===expected.length&&new Set(witness.exited).size===expected.length&&
    ids.every(i=>expected.includes(i.role)&&i.confirmed===true&&Number.isSafeInteger(i.pid)&&i.pid>0&&i.pid<=0xffffffff&&typeof i.created==='string'&&/^[a-f0-9]{16}$/.test(i.created)&&i.created!=='0000000000000000')&&
    expected.every(role=>witness.exited.includes(role));
}
export function assessOutcome(name,data){
  const expected=['root','helper',...(name==='pipe-exit'?[]:['child']),...(name==='controller-death'?['controller']:[])];
  const w=data.witness,p=data.proof;
  let ok=cases.includes(name)&&w?.ok===true&&w.cleanup===false&&w.created===(name==='pipe-exit'?0:1)&&Array.isArray(w.exited)&&
    w.exited.length===expected.length&&new Set(w.exited).size===expected.length&&expected.every(role=>w.exited.includes(role))&&(name==='controller-death'||data.pipeEof===true);
  if(name==='pipe-exit'||name==='detached-abort'){
    const b=data.expectedBinding,t=p?.timing;
    ok&&=!!b&&hash(b.nonce)&&hash(b.helperSha256)&&absolute(b.executable)&&
      [b.pid,b.helperPid].every(pid=>Number.isSafeInteger(pid)&&pid>0&&pid<=0xffffffff)&&b.pid!==b.helperPid&&
      [b.created,b.helperCreated].every(time=>typeof time==='string'&&/^[a-f0-9]{16}$/.test(time)&&time!=='0000000000000000')&&
      isDeepStrictEqual(p?.binding,b)&&p?.active===0&&p.rootExited===true&&p.helperExited===true&&p.total===(name==='pipe-exit'?1:2)&&p.aborted===(name==='detached-abort')&&
      t?.budgetMs===15000&&Number.isFinite(t.remainingBeforeMs)&&t.remainingBeforeMs<=15000&&Number.isFinite(t.remainingAfterMs)&&t.remainingAfterMs>0&&t.remainingAfterMs<=t.remainingBeforeMs;
  }
  if(name==='detached-abort')ok&&=data.closeError==='run-job-deadline';
  if(name==='helper-death')ok&&=/^run-job-(control-eof|control-close|control-write|helper-error)$/.test(data.ownerError??'');
  if(name==='controller-death')ok&&=data.controllerExit?.code===91&&data.controllerExit.signal===null;
  return {...data,ok:!!ok,normalShutdown:name==='pipe-exit'&&!!ok};
}
export async function measureCase(name,io,budget){
  const deadline=budget.measurement(name.endsWith('-death')?15000:35000);
  await io.arm();await io.go(budget.remaining(deadline));
  const data={expectedBinding:io.binding};
  try{
  if(name==='pipe-exit'){
    await io.exitRoot();data.proof=await io.close(budget.measurement(15000));
  }else if(name==='detached-abort'){
    try{data.proof=await io.close(budget.measurement(15000));}
    catch(error){data.closeError=error.message;}
    if(data.closeError!=='run-job-deadline')throw fail('expected-close-deadline');
    budget.measurement(15000);data.proof=await io.abort();
  }else if(name==='helper-death'){
    try{await io.close(deadline);}catch(error){data.ownerError=error.message;}
  }else if(name==='controller-death')data.controllerExit=await io.controllerExit();
  else throw fail('case');
  data.witness=await io.witness();
  data.pipeEof=name==='controller-death'?null:await io.eof();
  return assessOutcome(name,data);
  }catch(error){throw Object.assign(error,{measurement:data});}
}
