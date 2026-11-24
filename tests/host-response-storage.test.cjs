const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../scripts/extension-e2e/host-response-storage.mjs');
async function fixture(){
  const {createHostResponseStorage}=await load(),saved=new Map(),receipts=[],secondary=[];let first=null;
  const files={writeFile:async(name,bytes,options,control)=>{assert.equal(options.flag,'wx');if(name.endsWith('first-host-response.json')){assert.ok(control.signal instanceof AbortSignal);assert.equal(typeof control.onFailure,'function');assert.ok(Number.isFinite(control.deadline));}assert.ok(!saved.has(name));saved.set(name,Buffer.from(bytes));},
    async *readChunks(name){yield saved.get(name);}};
  const storage=createHostResponseStorage({files,directory:'evidence',runId:'Unit',caseId:'96000/reentry/2/10',first:()=>first,
    onReceipt:receipt=>receipts.push(receipt),onSecondary:error=>secondary.push(error)});
  const deadline=storage.beginScenario();
  return {files,saved,receipts,secondary,storage,deadline,select(error){first=Object.freeze({error,firstAt:performance.now(),authority:'source'});return first;},replace(){first={...first};}};
}
test('HOST storage confirms exact JSON bytes once and keeps null distinct from missing',async()=>{
  for(const response of [null,{text:'한글',number:1.25,array:[false,null]}]){
    const f=await fixture(),error=Object.freeze(Error('FIRST'));f.select(error);
    const prepared=f.storage.captureFirst(error,response,true);assert.equal(prepared.available,true);
    const task=f.storage.start();assert.equal(task,f.storage.start());
    const receipt=await f.storage.finish();assert.equal(receipt.status,'CONFIRMED');assert.equal(receipt.nativeSeal,'UNFORMED');
    assert.deepEqual(JSON.parse(f.saved.get('evidence/first-host-response.json')),response);
    assert.equal(receipt.bytes,f.saved.get(receipt.file).length);assert.equal(f.receipts.length,1);assert.ok(Object.isFrozen(receipt));
    assert.throws(()=>f.storage.beginScenario(),/begin/);
  }
  const f=await fixture();f.select(undefined);f.storage.captureFirst(undefined,undefined,false);
  assert.equal((await f.storage.finish()).reason,'no-response');assert.equal(f.saved.size,0);
});
test('HOST storage rejects lossy JSON without invoking source getters or proxy traps',async()=>{
  let invoked=0;const cycle={};cycle.self=cycle;
  const accessor=Object.defineProperty({},'value',{enumerable:true,get(){invoked++;return 1;}});
  const proxy=new Proxy({},{ownKeys(){invoked++;return [];}});
  const hole=new Array(1);hole.extra=1;
  for(const response of [undefined,BigInt(1),NaN,Infinity,-0,cycle,accessor,proxy,hole,new Map(),{value:undefined},{[Symbol('hidden')]:1}]){
    const f=await fixture();f.select(null);const prepared=f.storage.captureFirst(null,response,true);
    assert.equal(prepared.available,false);assert.equal((await f.storage.finish()).status,'REJECTED');assert.equal(f.saved.size,0);
  }
  assert.equal(invoked,0);
});
test('HOST ledger owns mutable buffers and never refunds failed or duplicate file claims',async()=>{
  const f=await fixture(),data=Buffer.from('original');let release;
  f.files.writeFile=async(name,bytes)=>{await new Promise(resolve=>{release=resolve;});f.saved.set(name,Buffer.from(bytes));};
  const pending=f.storage.writeFile('evidence/one',data,{flag:'wx'},{deadline:f.deadline});data.fill(0);release();await pending;
  assert.equal(f.saved.get('evidence/one').toString(),'original');
  assert.throws(()=>f.storage.writeFile('evidence/one','again',{flag:'wx'},{deadline:f.deadline}),/duplicate/);
  f.files.writeFile=async()=>{throw Error('disk');};
  await assert.rejects(f.storage.writeFile('evidence/two','failed',{flag:'wx'},{deadline:f.deadline}),/disk/);
  assert.equal(f.storage.budget().chargedBytes,14);await f.storage.finish();
  assert.throws(()=>f.storage.writeFile('evidence/three','late',{flag:'wx'},{deadline:f.deadline}),/closed/);
});
test('HOST ledger reserves FIRST before recovery and counts duplicate payload files in full',async()=>{
  const f=await fixture();f.select(NaN);f.storage.captureFirst(NaN,{first:true},true);
  const reserved=f.storage.budget().chargedBytes;
  await f.storage.writeFile('evidence/recovery','same',{flag:'wx'},{deadline:f.deadline});
  await f.storage.writeFile('evidence/duplicate','same',{flag:'wx'},{deadline:f.deadline});
  const receipt=await f.storage.finish();assert.equal(receipt.status,'CONFIRMED');
  assert.equal(f.storage.budget().chargedBytes,reserved+8);assert.equal(receipt.chargedBytesAtDecision,reserved+8);
});
test('HOST storage rejects other FIRST identity and readback substitution',async()=>{
  for(const fault of ['first','bytes','oversize']){
    const f=await fixture();f.select('FIRST');f.storage.captureFirst('FIRST',{one:1},true);
    if(fault==='first')f.replace();else f.files.readChunks=async function*(){yield Buffer.from(fault==='bytes'?'different':'x'.repeat(1000));};
    assert.equal((await f.storage.finish()).status,'REJECTED');assert.equal(f.receipts.length,1);
  }
});
test('HOST storage expiry stays terminal after the original write completes late',async t=>{
  const f=await fixture();f.select('FIRST');f.storage.captureFirst('FIRST',{one:1},true);
  let expire,release;t.mock.method(globalThis,'setTimeout',fn=>{expire=fn;return undefined;});
  f.files.writeFile=async(name,bytes)=>{await new Promise(resolve=>{release=resolve;});f.saved.set(name,Buffer.from(bytes));};
  const task=f.storage.start();await Promise.resolve();expire();const receipt=await task;
  assert.equal(receipt.status,'REJECTED');assert.equal(receipt.reason,'deadline');assert.equal(f.storage.budget().pendingFiles,1);
  release();await Promise.resolve();await Promise.resolve();await f.storage.finish();
  assert.equal(f.receipts.length,1);assert.equal(f.storage.receipt(),receipt);
});
test('HOST ledger rejects capacity before dispatch without renewing a failed pathname',async()=>{
  const f=await fixture();const bytes=Buffer.alloc(96*1024*1024);
  await f.storage.writeFile('evidence/full',bytes,{flag:'wx'},{deadline:f.deadline});
  assert.throws(()=>f.storage.writeFile('evidence/overflow','x',{flag:'wx'},{deadline:f.deadline}),/capacity/);
  assert.throws(()=>f.storage.writeFile('evidence/overflow','',{flag:'wx'},{deadline:f.deadline}),/duplicate/);
  f.select(0);f.storage.captureFirst(0,{first:true},true);
  assert.equal((await f.storage.finish()).reason,'capacity');assert.equal(f.saved.size,1);
});
test('HOST storage rejection does not inspect throwing error metadata',async()=>{
  const f=await fixture();f.select(undefined);f.storage.captureFirst(undefined,{one:1},true);
  const error=Object.defineProperty({},'code',{get(){throw Error('metadata must not run');}});
  f.files.writeFile=async()=>{throw error;};
  assert.equal((await f.storage.finish()).reason,'io');assert.equal(f.receipts.length,1);assert.equal(f.secondary[0],error);
});
test('HOST storage emits a bounded rejection for FIRST after claims closed',async()=>{
  const f=await fixture();assert.equal(await f.storage.finish(),null);f.select(null);
  f.storage.captureFirst(null,{late:true},true);await Promise.resolve();
  assert.equal((await f.storage.finish()).reason,'closed');assert.equal(f.receipts.length,1);assert.equal(f.saved.size,0);
});
