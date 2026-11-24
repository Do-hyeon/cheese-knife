import {createHash} from 'node:crypto';
import {open} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import path from 'node:path';
import {beforeDeadline,runChromiumJobDiagnostic} from '../check-product-audio.mjs';
import {openOwnedRoot} from '../owned-files.mjs';
import {nativeFailureDetails} from '../audio-native-browser.mjs';
import {openChromiumDiagnosticHost} from './chromium-diagnostic-host.mjs';
import {openMediaBrowserSession,verifyBrowserCandidate} from './harness.mjs';

const reserved=128*1024,limit=96*1024*1024,slotBytes=reserved/2;
const reservation='evidence/failure-slots.bin',launchRecord='evidence/run-job-launch.json';
const names=new Set(['request.json',launchRecord,...[
  'before','browser-candidate-before','startup-probe','shutdown','browser-candidate-after','after','result',
].map(name=>'evidence/'+name+'.json')]);
const directories=['dist','evidence','profile','browser-artifacts','chromium-temp','playwright-artifacts'];
const caseId='44100/normalizer-control/tone-silence';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const deadlineError='diagnostic-evidence-deadline';
const check=deadline=>{if(performance.now()>=deadline)throw Error(deadlineError);};

export function createDiagnosticEvidenceLedger(){
  let total=reserved;
  const charged=new Set();
  return {
    get bytes(){return total;},
    charge(name,bytes){
      if(!names.has(name)||charged.has(name))throw Error('diagnostic-evidence-name');
      if(name===launchRecord&&bytes>4096)throw Error('diagnostic-evidence-launch-bound');
      if(!Number.isSafeInteger(bytes)||bytes<1||bytes>limit-total)throw Error('diagnostic-evidence-budget');
      charged.add(name);total+=bytes;
    },
  };
}

async function evidenceFiles(root,started,openEvidence,scannerSha256){
  const files=await openOwnedRoot(root);
  if(path.relative(path.resolve(root),files.root)!=='')throw Error('diagnostic-evidence-root');
  for(const name of directories){
    const target=await files.resolve(name,{type:'directory'});
    if(path.relative(path.join(files.root,name),(await openOwnedRoot(target)).root)!=='')throw Error('diagnostic-evidence-root');
  }
  const ledger=createDiagnosticEvidenceLedger(),records=new Map();
  const withHandle=async(target,mode,work)=>{
    const handle=await openEvidence(target,mode);
    let first;
    try{return await work(handle);}
    catch(error){first=error;throw error;}
    finally{
      try{await handle.close();}
      catch(error){
        if(!first)throw error;
        Object.assign(first,{evidenceCloseError:nativeFailureDetails(error)});
      }
    }
  };
  const assertEmpty=async(name,deadline)=>{
    for await(const _entry of files.directoryEntries(name))
      throw Error(name==='playwright-artifacts'?'diagnostic-evidence-unowned':'diagnostic-evidence-used-root');
    check(deadline);
  };
  const assertEmptyArtifacts=deadline=>assertEmpty('playwright-artifacts',deadline);
  const admit=async deadline=>{
    await inventory(deadline);
    for(const name of ['profile','browser-artifacts','chromium-temp'])await assertEmpty(name,deadline);
  };
  const inventory=async deadline=>{
    const expectedRoots=new Set([...directories,'measure-raw.ps1']);
    for await(const entry of files.directoryEntries('')){
      check(deadline);
      if(entry.isDirectory()&&expectedRoots.delete(entry.name))continue;
      if(entry.isFile()&&entry.name==='measure-raw.ps1'&&expectedRoots.delete(entry.name))continue;
      if(entry.isFile()&&entry.name==='request.json')continue;
      throw Error('diagnostic-evidence-inventory');
    }
    if(expectedRoots.size)throw Error('diagnostic-evidence-inventory');
    const expected=new Set([reservation,...[...records.keys()].filter(name=>name.startsWith('evidence/'))]);
    for await(const entry of files.directoryEntries('evidence')){
      check(deadline);
      if(!entry.isFile()||!expected.delete('evidence/'+entry.name))throw Error('diagnostic-evidence-inventory');
    }
    if(expected.size)throw Error('diagnostic-evidence-inventory');
    const request=await files.lstat('request.json',{optional:true});
    if(Boolean(request)!==records.has('request.json'))throw Error('diagnostic-evidence-inventory');
    await assertEmptyArtifacts(deadline);
    const scanner=await files.resolve('measure-raw.ps1',{type:'file'});
    check(deadline);
    await withHandle(scanner,'r',async handle=>{
      const stat=await handle.stat();
      if(stat.size<1||stat.size>16384||digest(await readExact(handle,stat.size,deadline))!==scannerSha256)
        throw Error('diagnostic-evidence-scanner');
    });
    check(deadline);
  };
  const readExact=async(handle,bytes,deadline)=>{
    check(deadline);
    const stat=await handle.stat();
    if(!stat.isFile()||stat.nlink!==1||stat.size!==bytes)throw Error('diagnostic-evidence-replay');
    check(deadline);
    const data=Buffer.alloc(bytes);
    const read=await handle.read(data,0,bytes,0);
    if(read.bytesRead!==bytes)throw Error('diagnostic-evidence-replay');
    check(deadline);
    const after=await handle.stat();
    if(after.size!==bytes||after.nlink!==1||after.ino!==stat.ino||after.dev!==stat.dev||
       after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs)throw Error('diagnostic-evidence-replay');
    check(deadline);
    return data;
  };
  const write=async(name,value,deadline)=>{
    check(deadline);
    const encoded=JSON.stringify(value);
    if(typeof encoded!=='string')throw Error('diagnostic-evidence-json');
    const data=Buffer.from(encoded+'\n'),sha256=digest(data);
    ledger.charge(name,data.length);
    await beforeDeadline(async()=>{
      const target=await files.resolve(name,{type:'missing-or-file'});
      check(deadline);
      await withHandle(target,'wx+',async handle=>{
        check(deadline);await handle.writeFile(data);
        check(deadline);await handle.sync();
        if(digest(await readExact(handle,data.length,deadline))!==sha256)throw Error('diagnostic-evidence-readback');
      });
    },deadline,deadlineError);
    const at=performance.now();
    if(at>=deadline)throw Error(deadlineError);
    records.set(name,{name,bytes:data.length,sha256,readbackAtMs:at-started});
  };
  const replay=async deadline=>{
    await inventory(deadline);
    for(const {name,bytes,sha256} of records.values()){
      const target=await files.resolve(name,{type:'file'});
      check(deadline);
      await withHandle(target,'r',async handle=>{
        if(digest(await readExact(handle,bytes,deadline))!==sha256)throw Error('diagnostic-evidence-replay');
      });
      check(deadline);
    }
    await inventory(deadline);
    if(ledger.bytes!==reserved+[...records.values()].reduce((sum,row)=>sum+row.bytes,0))throw Error('diagnostic-evidence-unconfirmed');
    return {bytes:ledger.bytes,files:[...records.values()]};
  };
  return {write,replay,admit,assertEmptyArtifacts,records};
}

async function observeCompatibility(launched,{deadline,signal},expected){
  const guard=()=>{check(deadline);if(signal.aborted)throw signal.reason;};
  const localPage=()=>{
    const allowed='chrome-extension://'+expected.id+'/permission.html';
    const pages=launched.context.pages(),blank=pages.filter(page=>page.url()==='about:blank');
    if(blank.length!==1||pages.length>2||pages.some(page=>page.url()!=='about:blank'&&page.url()!==allowed))
      throw Error('chromium-diagnostic-local-target');
    return blank[0];
  };
  guard();
  const page=localPage();
  if(launched.extensionId!==expected.id||!launched.worker)throw Error('chromium-diagnostic-local-target');
  const identity=await launched.worker.evaluate(()=>({id:globalThis.chrome.runtime.id,version:globalThis.chrome.runtime.getManifest().version}));
  guard();
  if(identity.id!==expected.id||identity.version!==expected.version||!await page.evaluate(()=>location.href==='about:blank'))
    throw Error('chromium-diagnostic-local-renderer');
  guard();
  const browserSession=await openMediaBrowserSession(launched.context);
  guard();
  const info=await browserSession.send('SystemInfo.getProcessInfo');
  guard();
  const browsers=info.processInfo.filter(item=>item.type==='browser');
  if(browsers.length!==1||browsers[0].id!==launched.runJobOwner?.binding.pid)throw Error('chromium-diagnostic-browser-pid');
  if(localPage()!==page)throw Error('chromium-diagnostic-local-target');
  return {browserSession,evidence:{extensionId:expected.id,version:identity.version,pid:browsers[0].id}};
}

async function replayReservation(reserve,receipts,deadline){
  const read=async(position,length)=>{
    const bytes=Buffer.alloc(length);
    const value=await beforeDeadline(()=>reserve.handle.read(bytes,0,length,position),deadline,deadlineError);
    if(value.bytesRead!==length)throw Error('diagnostic-evidence-slot-replay');
    return bytes;
  };
  if(!receipts.length){
    if(digest(await read(0,reserved))!==reserve.sha256)throw Error('diagnostic-evidence-slot-replay');
  }else{
    for(const [index,receipt] of receipts.entries()){
      if(receipt.slot!==index||receipt.at>=deadline)throw Error('diagnostic-evidence-slot-replay');
      const bytes=await read(index*slotBytes,slotBytes),body=bytes.subarray(0,slotBytes-32);
      if(digest(bytes)!==receipt.sha256||digest(body)!==bytes.subarray(slotBytes-32).toString('hex'))throw Error('diagnostic-evidence-slot-replay');
      const record=JSON.parse(body.toString('utf8').split('\0',1)[0]);
      if(record.reservationSha256!==reserve.sha256||record.slot!==index)throw Error('diagnostic-evidence-slot-replay');
    }
  }
  check(deadline);
}

/** The caller supplies the frozen inputs and separate execution authority. This module has no CLI. */
export async function runChromiumCompatibilityDiagnostic(input,dependencies={}){
  const {started,root,chromiumApi,attestExtension,extensionId,extensionVersion}=input;
  const hostInput={...input.host},browserCandidate={...input.browserCandidate};
  const runJob={contract:input.runJob?.contract,helper:{...input.runJob?.helper}};
  if(!Number.isFinite(started)||started>performance.now()||!path.isAbsolute(root)||
     !/^[a-f0-9]{16}$/.test(hostInput.volumeSerial)||!/^[a-f0-9]{32}$/.test(hostInput.fileId)||
     !/^[a-f0-9]{64}$/.test(hostInput.scannerSha256)||!/^[a-f0-9]{64}$/.test(hostInput.reservationSha256)||
     runJob.contract!=='run-job-v1'||!/^[a-f0-9]{64}$/.test(runJob.helper.sha256)||typeof attestExtension!=='function'||
     !/^[a-p]{32}$/.test(extensionId)||typeof extensionVersion!=='string'||!/^[0-9]+(?:\.[0-9]+){0,3}$/.test(extensionVersion))
    throw Error('diagnostic-evidence-selection');
  const {openHost=openChromiumDiagnosticHost,openEvidence=open,observe=observeCompatibility,
    verifyCandidate=verifyBrowserCandidate,launch,close}=dependencies;
  const launchBy=started+150000,saveBy=started+240000;
  const evidence=await beforeDeadline(()=>evidenceFiles(root,started,openEvidence,hostInput.scannerSha256),launchBy,deadlineError);
  await beforeDeadline(()=>evidence.admit(launchBy),launchBy,deadlineError);
  const host=await openHost({...hostInput,started,root,scanner:path.join(root,'measure-raw.ps1'),readOnly:false});
  const receipts=[];
  const paths=Object.fromEntries(directories.map(name=>[name,path.join(root,name)]));
  let failure,shutdown,replayed,before,candidateBefore,launchBinding,slotReplayError;
  const scan=async deadline=>{
    await evidence.assertEmptyArtifacts(deadline);
    return host.scan(deadline);
  };
  const attest=async deadline=>{
    const control=new AbortController();
    try{return structuredClone(await beforeDeadline(()=>attestExtension({deadline,signal:control.signal}),deadline,deadlineError));}
    finally{control.abort();}
  };
  try{
    check(launchBy);
    if(host.allocation.fileId!==hostInput.fileId||host.allocation.volumeSerial!==hostInput.volumeSerial||
       host.allocation.allocatedBytes!==reserved||host.reserve.sha256!==hostInput.reservationSha256)throw Error('diagnostic-evidence-reservation');
    shutdown=await runChromiumJobDiagnostic({
      started,reserve:host.reserve,scan,recordSlot:receipt=>receipts.push(receipt),
      launchOptions:{chromiumApi,headed:false,productCaseId:caseId,browserCandidate,runJob,
        extensionPath:paths.dist,profilePath:paths.profile,artifactPath:paths['browser-artifacts'],
        diagnosticPaths:{chromiumTempDir:paths['chromium-temp'],playwrightArtifactsDir:paths['playwright-artifacts']},
        recordBrowserCandidate:async value=>{
          if(value?.root!==browserCandidate.root||value.manifestSha256!==browserCandidate.manifestSha256||
             value.version!=='159.0.8132.0'||typeof value.executable!=='string'||!path.isAbsolute(value.executable))
            throw Error('diagnostic-evidence-candidate-binding');
          candidateBefore=structuredClone(value);
          await evidence.write('evidence/browser-candidate-before.json',candidateBefore,launchBy);
        },
        recordRunJob:async binding=>{
          if(!candidateBefore||binding.executable!==candidateBefore.executable||binding.helperSha256!==runJob.helper.sha256)
            throw Error('diagnostic-evidence-launch-binding');
          launchBinding=structuredClone(binding);
          await evidence.write(launchRecord,launchBinding,launchBy);
        }},
      prepare:async deadline=>{
        await evidence.write('request.json',{caseId,browserCandidate,runJob,extensionId,extensionVersion,fileId:host.allocation.fileId,
          volumeSerial:host.allocation.volumeSerial,scannerSha256:hostInput.scannerSha256,reservationSha256:host.reserve.sha256,reservedBytes:reserved},deadline);
        before=await attest(deadline);
        await evidence.write('evidence/before.json',before,deadline);
      },
      observe:async(launched,control)=>{
        if(!launchBinding||!isDeepStrictEqual(launchBinding,launched.runJobOwner?.binding))throw Error('diagnostic-evidence-launch-binding');
        const result=await observe(launched,control,{id:extensionId,version:extensionVersion});
        if(control.signal.aborted)throw control.signal.reason;
        if(result.evidence?.pid!==launchBinding.pid||result.evidence?.extensionId!==extensionId||result.evidence?.version!==extensionVersion)
          throw Error('diagnostic-evidence-startup-binding');
        await evidence.write('evidence/startup-probe.json',result.evidence,control.deadline);
        return result.browserSession;
      },
      finish:async(proof,deadline)=>{
        if(!isDeepStrictEqual(proof.job.binding,launchBinding))throw Error('diagnostic-evidence-shutdown-binding');
        await evidence.write('evidence/shutdown.json',proof,deadline);
        const postBy=Math.min(deadline,performance.now()+30000),control=new AbortController();
        let candidateAfter;
        try{
          candidateAfter=await beforeDeadline(()=>verifyCandidate(browserCandidate,{deadline:Date.now()+Math.floor(postBy-performance.now()),
            signal:control.signal,exclude:[...Object.values(paths)]}),postBy,deadlineError);
        }finally{control.abort();}
        if(!candidateBefore||!isDeepStrictEqual(candidateBefore,candidateAfter))throw Error('diagnostic-evidence-candidate-drift');
        await evidence.write('evidence/browser-candidate-after.json',candidateAfter,deadline);
        const after=await attest(postBy);
        if(!isDeepStrictEqual(before,after))throw Error('diagnostic-evidence-extension-drift');
        await evidence.write('evidence/after.json',after,deadline);
        if(evidence.records.size!==names.size-1)throw Error('diagnostic-evidence-unconfirmed');
        await replayReservation(host.reserve,receipts,deadline);
        replayed=await evidence.replay(deadline);
      },
    },{launch,close});
  }catch(error){failure=error;}
  let failureSlots;
  if(failure&&receipts.length){
    try{
      await replayReservation(host.reserve,receipts,saveBy);
      failureSlots=receipts.map(({slot,sha256,at})=>({slot,sha256,readbackAtMs:at-started}));
    }catch(error){slotReplayError=error.message;}
  }
  let workers=[],workerError;
  try{workers=await host.close(saveBy);}
  catch(error){workerError=error.message;}
  const clean=performance.now()<saveBy&&workers.length===2&&workers.every((worker,index)=>
    worker.lane===['reserve','scan'][index]&&worker.status==='CONFIRMED'&&worker.exited&&worker.stdoutEnded&&
    worker.code===0&&worker.signal===null&&worker.stderrBytes===0&&worker.outstanding===null&&worker.error===null);
  if(!failure&&(!shutdown||!replayed||!clean))failure=Error('diagnostic-evidence-unconfirmed');
  let terminalError;
  if(evidence.records.has('request.json')&&performance.now()<saveBy){
    try{
      const terminal=failure?{status:'STOP_OBSERVED',firstError:nativeFailureDetails(failure),evidenceCloseError:failure.evidenceCloseError,
        workers,workerError,failureSlots,slotReplayError}:
        {status:'NORMAL_OBSERVED',files:replayed.files,workers};
      await evidence.write('evidence/result.json',terminal,saveBy);
      if(!failure)replayed=await beforeDeadline(()=>evidence.replay(saveBy),saveBy,deadlineError);
    }catch(error){
      terminalError=nativeFailureDetails(error);
      failure??=error;
    }
  }
  if(!failure&&(!replayed?.files.some(row=>row.name==='evidence/result.json')||performance.now()>=saveBy))
    failure=Error('diagnostic-evidence-unconfirmed');
  if(failure)throw Object.assign(failure,{storage:{status:'UNKNOWN',workers,workerError,failureSlots,slotReplayError,terminalError}});
  return {shutdown,storage:{status:'CONFIRMED',...replayed,workers}};
}
