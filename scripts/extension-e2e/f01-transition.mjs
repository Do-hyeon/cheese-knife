import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const F00_COMMIT='ae9f8e50a22dae9d549f1e476d302549ecc03b4a';
const F00_INVENTORY='9715087af1aa2b36fc54b330e5a879ce384f4c9a4f56faf1c6fd8847436580df';
/** @param {string} code */
const fail=code=>Object.assign(new Error(code),{code});
/** @param {unknown} value @returns {Record<string,unknown>|null} */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?/** @type {Record<string,unknown>} */(value):null;
/** @param {string|Uint8Array} value */
const hash=value=>createHash('sha256').update(value).digest('hex');
/** @typedef {{name:string,bytes:number,sha256:string}} FrozenRow */

/** Read only the pinned Git objects, never mutable root dist files or a remote checkout.
 * @param {string} repositoryRoot @param {unknown} metadata */
export function readFrozenF00Payload(repositoryRoot,metadata){
  if(typeof repositoryRoot!=='string'||!path.isAbsolute(repositoryRoot))throw fail('f01-f00-root');
  const value=record(metadata);
  if(!value||value.sourceCommit!==F00_COMMIT||value.inventorySha256!==F00_INVENTORY||!Array.isArray(value.entries)||value.entries.length!==59)throw fail('f01-f00-payload-metadata');
  /** @type {FrozenRow[]} */const rows=[];let total=0,previous='';/** @type {Set<string>} */const names=new Set();
  for(const entry of value.entries){
    const row=record(entry);
    if(!row||Object.keys(row).sort().join(',')!=='bytes,name,sha256'||typeof row.name!=='string'||row.name<=previous||row.name.length>256||
      !row.name.split('/').every(part=>/^[A-Za-z0-9_.-]+$/.test(part)&&part!=='.'&&part!=='..')||names.has(row.name.toLowerCase())||
      typeof row.bytes!=='number'||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>1048576||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256))throw fail('f01-f00-payload-metadata');
    rows.push({name:row.name,bytes:row.bytes,sha256:row.sha256});previous=row.name;names.add(row.name.toLowerCase());total+=row.bytes;
  }
  if(total>2097152||hash(JSON.stringify(rows.map(row=>[row.name,row.sha256])))!==F00_INVENTORY)throw fail('f01-f00-payload-metadata');
  const entries=rows.map(row=>{
    let bytes;
    try{bytes=execFileSync('git',['show',F00_COMMIT+':'+row.name],{cwd:repositoryRoot,stdio:['ignore','pipe','pipe'],timeout:15000,maxBuffer:1048576,windowsHide:true});}
    catch{throw fail('f01-f00-payload-git');}
    if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw fail('f01-f00-payload-bytes');
    return {name:row.name,bytes,sha256:row.sha256};
  });
  return {sourceCommit:F00_COMMIT,inventorySha256:F00_INVENTORY,entries};
}
