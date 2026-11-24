import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const workerPath=fileURLToPath(new URL('chromium-diagnostic-worker.ps1',import.meta.url));
const lineLimit=180000,slotBytes=65536;

/** @param {string} pwsh @param {'reserve'|'scan'} lane */
function worker(pwsh,lane){
  const system=process.env.SystemRoot;
  if(!system)throw Error('diagnostic-worker-system-root');
  const env={SystemRoot:system,windir:system,Path:path.join(system,'System32'),
    PSModulePath:path.join(path.dirname(pwsh),'Modules'),POWERSHELL_TELEMETRY_OPTOUT:'1',
    ...process.env.TEMP?{TEMP:process.env.TEMP,TMP:process.env.TEMP}:{}};
  const child=spawn(pwsh,['-NoLogo','-NoProfile','-NonInteractive','-File',workerPath,lane],
    {env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let seq=0,buffer=Buffer.alloc(0),stderrBytes=0,ending=false,stdoutEnded=false,exited=false;
  /** @type {{seq:number,op:string}|undefined} */let issued;
  /** @type {Error|undefined} */let failure;
  /** @type {{resolve:(value:any)=>void,reject:(error:Error)=>void}|undefined} */let pending;
  /** @param {Error} error */const fail=error=>{
    failure??=error;pending?.reject(failure);pending=undefined;
  };
  child.on('error',()=>fail(Error(lane+'-worker-spawn')));
  child.stdin.on('error',()=>fail(Error(lane+'-worker-input')));
  child.stderr.on('data',chunk=>{
    stderrBytes+=chunk.length;
    if(stderrBytes>4096)fail(Error(lane+'-worker-stderr-bound'));
  });
  child.stdout.on('data',chunk=>{
    if(failure)return;
    if(buffer.length+chunk.length>lineLimit)return fail(Error(lane+'-worker-response-bound'));
    buffer=Buffer.concat([buffer,chunk]);
    const newline=buffer.indexOf(10);
    if(newline<0)return;
    if(!pending||newline!==buffer.length-1)return fail(Error(lane+'-worker-response-unexpected'));
    try{
      const value=JSON.parse(buffer.toString('utf8',0,newline));
      if(value.seq!==seq||Object.keys(value).length!==2)throw Error(lane+'-worker-response-sequence');
      buffer=Buffer.alloc(0);
      if(typeof value.error==='string'&&/^[a-z0-9-]{1,80}$/.test(value.error)){issued=undefined;return fail(Error(value.error));}
      if(!Object.hasOwn(value,'value'))throw Error(lane+'-worker-response-shape');
      issued=undefined;
      const current=pending;pending=undefined;current.resolve(value.value);
    }catch(error){fail(error instanceof Error?error:Error(lane+'-worker-response-invalid'));}
  });
  child.stdout.on('end',()=>{stdoutEnded=true;if(buffer.length||pending)fail(Error(lane+'-worker-eof'));});
  child.once('exit',()=>{exited=true;});
  /** @param {'CONFIRMED'|'UNKNOWN'} status @param {number|null} code @param {NodeJS.Signals|null} signal */
  const snapshot=(status,code,signal)=>({lane,status,pid:child.pid??null,code,signal,exited,stdoutEnded,stderrBytes,
    outstanding:issued??null,error:failure?.message??null});
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>{
    if(pending)fail(Error(lane+'-worker-close'));
    resolve(snapshot(exited&&stdoutEnded&&!issued?'CONFIRMED':'UNKNOWN',code,signal));
  }));
  /** @param {string} op @param {Record<string,unknown>} fields */
  const request=(op,fields={})=>new Promise((resolve,reject)=>{
    if(failure||ending||pending){reject(failure??Error(lane+'-worker-busy'));return;}
    const line=JSON.stringify({seq:seq+1,op,...fields})+'\n';
    if(Buffer.byteLength(line)>lineLimit){reject(Error(lane+'-worker-request-bound'));return;}
    seq++;issued={seq,op};pending={resolve,reject};
    child.stdin.write(line);
  });
  /** @param {number} deadline */
  const close=async deadline=>{
    if(!ending){ending=true;child.stdin.end();}
    let timer;
    try{
      const result=await Promise.race([closed,new Promise(resolve=>{
        timer=setTimeout(()=>resolve(null),Math.max(0,deadline-performance.now()));
      })]);
      if(result&&performance.now()<deadline)return result;
      return snapshot('UNKNOWN',null,null);
    }finally{clearTimeout(timer);}
  };
  return {request,close};
}

/** Attach only the two Windows diagnostic lanes. The caller owns approval and the 240s supervision window.
 * @param {{started:number,root:string,pwsh:string,scanner:string,scannerSha256:string,reservationSha256:string,
 * fileId?:string,volumeSerial?:string,readOnly?:boolean}} input */
export async function openChromiumDiagnosticHost({started,root,pwsh,scanner,scannerSha256,reservationSha256,fileId,volumeSerial,readOnly=false}){
  const deadline=started+150000;
  if(process.platform!=='win32'||![root,pwsh,scanner].every(value=>/^[a-z]:\\/i.test(value)&&path.normalize(value)===value)||
     ![scannerSha256,reservationSha256].every(value=>/^[a-f0-9]{64}$/.test(value))||
     typeof readOnly!=='boolean'||readOnly&&fileId===undefined||
     fileId!==undefined&&!/^[a-f0-9]{32}$/.test(fileId)||volumeSerial!==undefined&&!/^[a-f0-9]{16}$/.test(volumeSerial)||
     !Number.isFinite(started)||started>performance.now()||performance.now()>=deadline)
    throw Error('diagnostic-host-input');
  /** @type {ReturnType<typeof worker>[]} */const workers=[];
  /** @type {Promise<unknown[]>|undefined} */let closure;
  const close=(until=started+240000)=>closure??=Promise.all(workers.map(item=>item.close(Math.min(until,started+240000))));
  let timer;
  try{
    const slots=worker(pwsh,'reserve');workers.push(slots);
    const scannerWorker=worker(pwsh,'scan');workers.push(scannerWorker);
    const admitted=Promise.all([slots.request('open',{path:path.join(root,'evidence','failure-slots.bin'),sha256:reservationSha256,fileId,volumeSerial,readOnly}),
      scannerWorker.request('open',{root,path:scanner,sha256:scannerSha256})]);
    const [allocation,scannerReady]=await Promise.race([admitted,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Error('diagnostic-host-admission-deadline')),deadline-performance.now());
    })]);
    if(performance.now()>=deadline||scannerReady!==true||!allocation||allocation.allocatedBytes!==2*slotBytes||
       allocation.clusterBytes!==4096||allocation.clusters!==32||!Number.isSafeInteger(allocation.extentCount)||allocation.extentCount<1||
       !/^[a-f0-9]{32}$/.test(allocation.fileId)||!/^[a-f0-9]{16}$/.test(allocation.volumeSerial)||
       fileId!==undefined&&allocation.fileId!==fileId||
       volumeSerial!==undefined&&allocation.volumeSerial!==volumeSerial)throw Error('diagnostic-host-admission');
    const reserve={sha256:reservationSha256,handle:{
      stat:async()=>({size:allocation.allocatedBytes,isFile:()=>true}),
      /** @param {Buffer} buffer @param {number} offset @param {number} length @param {number} position */
      read:async(buffer,offset,length,position)=>{
        const data=await slots.request('read',{position,length});
        if(typeof data!=='string'||data.length!==Math.ceil(length/3)*4)throw Error('reserve-response-length');
        const bytes=Buffer.from(data,'base64');
        if(bytes.length!==length||bytes.toString('base64')!==data)throw Error('reserve-response-bytes');
        return {bytesRead:bytes.copy(buffer,offset),buffer};
      },
      /** @param {Buffer} buffer @param {number} offset @param {number} length @param {number} position */
      write:async(buffer,offset,length,position)=>{
        if(readOnly||length!==slotBytes)throw Error('reserve-write-range');
        const bytesWritten=await slots.request('write',{position,bytes:buffer.subarray(offset,offset+length).toString('base64')});
        return {bytesWritten,buffer};
      },
      sync:async()=>{
        if(readOnly||await slots.request('sync')!==true)throw Error('reserve-sync');
      },
    }};
    /** @param {number} cutoff */const scan=async cutoff=>{
      const ms=Math.min(1000,Math.floor(cutoff-performance.now()));
      if(!Number.isFinite(ms)||ms<1)throw Error('chromium-diagnostic-scan-deadline');
      const result=await scannerWorker.request('scan',{ms});
      if(performance.now()>=cutoff)throw Error('chromium-diagnostic-scan-deadline');
      return {logicalBytes:result.logicalBytes,entries:result.entries};
    };
    return {reserve,scan,allocation:Object.freeze(allocation),close};
  }catch(error){
    throw Object.assign(error instanceof Error?error:Error('diagnostic-host-admission'),{workerClosure:close()});
  }finally{clearTimeout(timer);}
}
