import {createHash} from 'node:crypto';
import {open} from 'node:fs/promises';
import path from 'node:path';
import {openOwnedRoot} from '../owned-files.mjs';

const count=63,total=952532,version='2.13.3';
const hash=value=>createHash('sha256').update(value).digest('hex');
const hex=/^[a-f0-9]{64}$/;
const ordinary=part=>part&&part!=='.'&&part!=='..'&&
  !/[\\/:<>"|?*\x00-\x1f]|[. ]$/.test(part)&&
  !/^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(part);

export function chromiumUnpackedWindowsId(directory){
  if(typeof directory!=='string'||!/^[a-z]:\\/i.test(directory)||directory.length>=260||
     directory.includes(',')||!directory.slice(3).split('\\').every(ordinary)||path.win32.normalize(directory)!==directory)
    throw Error('diagnostic-dist-path');
  const absolute=directory[0].toUpperCase()+directory.slice(1);
  return [...hash(Buffer.from(absolute,'utf16le')).slice(0,32)].map(n=>'abcdefghijklmnop'[parseInt(n,16)]).join('');
}

export function assertFixedPlaywrightEnvironment(env=process.env){
  for(const [key,value] of Object.entries(env)){
    if(value&&/^(?:(?:npm_config_|npm_package_config_)?(?:pwdebug.*|pwtest.*|pw_.*|playwright_.*)|debug(?:_.*)?|node_(?:options|path|compile_cache|v8_coverage))$/i.test(key))
      throw Error('diagnostic-playwright-environment');
  }
}

function fixedRows(rows,ledgerSha256){
  if(!Array.isArray(rows)||rows.length!==count||!hex.test(ledgerSha256))throw Error('diagnostic-dist-ledger');
  const files=new Map(),directories=new Map(),seen=new Set();
  let bytes=0;
  const canonical=rows.map(row=>{
    if(!row||Object.keys(row).length!==3||typeof row.file!=='string'||!row.file.startsWith('dist/')||
       !Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>total||!hex.test(row.sha256))throw Error('diagnostic-dist-ledger');
    const relative=row.file.slice(5),parts=relative.split('/'),folded=relative.toLowerCase();
    if(parts.length>16||!parts.every(ordinary)||seen.has(folded))throw Error('diagnostic-dist-ledger');
    seen.add(folded);
    for(let i=1;i<parts.length;i++){
      const parent=parts.slice(0,i).join('/'),lower=parent.toLowerCase();
      if(directories.has(lower)&&directories.get(lower)!==parent)throw Error('diagnostic-dist-ledger');
      directories.set(lower,parent);
    }
    bytes+=row.bytes;
    const value={file:row.file,bytes:row.bytes,sha256:row.sha256};
    files.set(relative,value);
    return value;
  });
  if(bytes!==total||!files.has('manifest.json')||!files.has('background.js')||
     [...directories.keys()].some(name=>seen.has(name))||hash(JSON.stringify(canonical))!==ledgerSha256)
    throw Error('diagnostic-dist-ledger');
  return {files,directories:new Set(directories.values())};
}

async function inventory(root,expected,check){
  const files=new Set(expected.files.keys()),directories=new Set(expected.directories);
  async function visit(relative){
    check();
    for await(const entry of root.directoryEntries(relative)){
      check();
      const name=relative?relative+'/'+entry.name:entry.name;
      if(entry.isDirectory()&&directories.delete(name))await visit(name);
      else if(!entry.isFile()||!files.delete(name))throw Error('diagnostic-dist-inventory');
    }
  }
  await visit('');
  check();
  if(files.size||directories.size)throw Error('diagnostic-dist-inventory');
}

const sameFile=(a,b)=>a?.isFile()&&b?.isFile()&&a.nlink===1&&b.nlink===1&&a.ino===b.ino&&a.dev===b.dev&&
  a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
async function verifyFile(root,name,row,check,signal){
  check();
  const target=await root.resolve(name,{type:'file'}),initial=await root.lstat(name);
  check();
  if(initial.size!==row.bytes)throw Error('diagnostic-dist-file-bytes');
  const handle=await open(target,'r');
  const digest=createHash('sha256'),chunks=name==='manifest.json'?[]:null;
  let bytes=0,failed=false,first;
  try{
    if(!sameFile(initial,await handle.stat()))throw Error('diagnostic-dist-file-identity');
    check();
    for await(const chunk of handle.createReadStream({autoClose:false,highWaterMark:64*1024,signal})){
      check();
      bytes+=chunk.length;
      if(bytes>row.bytes)throw Error('diagnostic-dist-file-bytes');
      digest.update(chunk);chunks?.push(chunk);
    }
    check();
    if(!sameFile(initial,await handle.stat())||!sameFile(initial,await root.lstat(name)))throw Error('diagnostic-dist-file-identity');
    if(bytes!==row.bytes||digest.digest('hex')!==row.sha256)throw Error('diagnostic-dist-file-bytes');
  }catch(error){
    failed=true;
    first=signal?.aborted&&error?.name==='AbortError'?signal.reason:error;
    throw first;
  }finally{
    try{await handle.close();}
    catch(error){
      if(!failed)throw error;
      if(first instanceof Error&&Object.isExtensible(first))first.distCloseError=error;
    }
  }
  check();
  return chunks&&Buffer.concat(chunks);
}

/** The same frozen baseline is used before launch and after owned shutdown. */
export function createChromiumDistAttestor({dir,extensionId,rows,ledgerSha256}){
  if(chromiumUnpackedWindowsId(dir)!==extensionId)throw Error('diagnostic-dist-id');
  const expected=fixedRows(rows,ledgerSha256);
  return async({deadline,signal})=>{
    const check=()=>{
      if(signal?.aborted)throw signal.reason;
      if(!Number.isFinite(deadline)||performance.now()>=deadline)throw Error('diagnostic-dist-deadline');
    };
    check();
    const root=await openOwnedRoot(dir);
    if(root.root!==dir)throw Error('diagnostic-dist-path');
    await inventory(root,expected,check);
    let manifest;
    for(const [name,row] of expected.files){
      const bytes=await verifyFile(root,name,row,check,signal);
      if(bytes){
        try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
        catch{throw Error('diagnostic-dist-manifest');}
      }
    }
    if(!manifest||Object.hasOwn(manifest,'key')||manifest.manifest_version!==3||manifest.version!==version||
       manifest.background?.service_worker!=='background.js')throw Error('diagnostic-dist-manifest');
    await inventory(root,expected,check);
    return {extensionId,version,files:count,bytes:total,ledgerSha256};
  };
}
