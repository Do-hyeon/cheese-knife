const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const api=()=>import('../scripts/audio-j1-signed-reference.mjs');
const arithmetic=()=>import('../scripts/audio-j1-arithmetic.mjs');
/** @template T @param {T|undefined} v @returns {T} */function must(v){if(v===undefined)throw Error('missing fixture');return v;}
function harness(){
  /** @type {{fn:()=>void,ms:number,active:boolean}[]} */const timers=[];
  const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),stdin:Object.assign(new EventEmitter(),{end:()=>{}}),pid:37,kill:()=>Boolean(1)});
  let kills=0,spawns=0;child.kill=()=>{kills++;return true;};
  /** @param {()=>void} fn @param {number} ms */const timer=(fn,ms)=>{const row={fn,ms,active:true};timers.push(row);return()=>{row.active=false;};};
  return {child,timers,timer,kills:()=>kills,spawns:()=>spawns,spawn:()=>{spawns++;return child;}};
}
test('helperCrashAndTimeoutClosed',async()=>{
  const m=await api(),a=await arithmetic();
  for(const kind of ['crash','timeout','overflow']){
    const h=harness(),owner=m.createI4ChildOwner(h.timer),b=a.createI4Budget('closed-'+kind),promise=owner.run(h.spawn,b,Buffer.from('{}'));
    if(kind==='timeout')must(h.timers[0]).fn();
    if(kind==='overflow')h.child.stdout.emit('data',Buffer.alloc(65537));
    h.child.emit('close',kind==='crash'?1:null,'SIGKILL');const r=await promise;
    assert.equal(r.status,'NOT_READY');assert.equal(r.closeConfirmed,true);assert.equal(r.ownership,'CLOSED');assert.equal(h.kills(),kind==='crash'?0:1);
  }
});
test('terminationRequestedButCloseNeverArrives',async()=>{
  const m=await api(),a=await arithmetic(),h=harness(),owner=m.createI4ChildOwner(h.timer),b=a.createI4Budget('never-close'),p=owner.run(h.spawn,b,Buffer.from('{}'));
  must(h.timers[0]).fn();assert.equal(h.kills(),1);assert.equal(must(h.timers[1]).ms,3000);must(h.timers[1]).fn();const r=await p;
  assert.equal(r.ownership,'FAIL');assert.equal(r.closeConfirmed,false);
  assert.equal(r.pid,37);assert.equal(r.terminationOutcome,'ACCEPTED');
  await assert.rejects(()=>owner.run(h.spawn,a.createI4Budget('after-poison'),Buffer.from('{}')));assert.equal(h.spawns(),1);
});
test('terminationRequestFails',async()=>{
  const m=await api(),a=await arithmetic(),h=harness();let kills=0;h.child.kill=()=>{kills++;return false;};const owner=m.createI4ChildOwner(h.timer),p=owner.run(h.spawn,a.createI4Budget('kill-failed'),Buffer.from('{}'));
  must(h.timers[0]).fn();h.child.emit('close',null,'SIGKILL');const result=await p;assert.equal(result.ownership,'FAIL');assert.equal(kills,1);
  assert.equal(result.pid,37);assert.equal(result.terminationOutcome,'REJECTED');
});
test('throwingTerminationRequestIsRecorded',async()=>{
  const m=await api(),a=await arithmetic(),h=harness();h.child.kill=()=>{throw Error('OS refusal');};const p=m.createI4ChildOwner(h.timer).run(h.spawn,a.createI4Budget('kill-throw'),Buffer.from('{}'));
  must(h.timers[0]).fn();must(h.timers[1]).fn();const r=await p;
  assert.equal(r.ownership,'FAIL');assert.equal(r.pid,37);assert.equal(r.terminationOutcome,'THREW');assert.equal(r.closeConfirmed,false);
});
test('synchronousSpawnAndLateCloseCannotExtendOwnedDeadline',async()=>{
  const m=await api(),a=await arithmetic(),h=harness();let now=0;const b=a.createI4Budget('slow-spawn',()=>now);now=110000;
  const p=m.createI4ChildOwner(h.timer).run(()=>{now+=5000;return h.spawn();},b,Buffer.from('{}'));
  assert.equal(must(h.timers[0]).ms,5000);now=121000;h.child.emit('close',0,null);
  const r=await p;assert.equal(r.status,'NOT_READY');assert.equal(r.closeConfirmed,true);
});
test('helperOversizeBeforeAllocation',async()=>{
  const m=await api(),a=await arithmetic();let reads=0;const files={lstat:async()=>{reads++;throw Error('must not inspect');},readFile:async()=>{reads++;throw Error('must not allocate');}};
  await assert.rejects(()=>m.readI4PrimitiveResult(files,{kind:'primitive-intervals',count:257,bytes:32896,sha256:'a'.repeat(64),file:'reference.iv512le'},257,a.createI4Budget('cap')));assert.equal(reads,0);
});
test('helperWrongHashOrPath',async()=>{
  const m=await api(),a=await arithmetic(),bytes=Buffer.alloc(128);let reads=0;const files={lstat:async()=>({size:128,isFile:()=>true}),readFile:async()=>{reads++;return bytes;}};
  for(const file of ['../reference.iv512le','control.f64le']){await assert.rejects(()=>m.readI4PrimitiveResult(files,{kind:'primitive-intervals',count:1,bytes:128,sha256:'a'.repeat(64),file},1,a.createI4Budget('path-'+file)));}
  assert.equal(reads,0);await assert.rejects(()=>m.readI4PrimitiveResult(files,{kind:'primitive-intervals',count:1,bytes:128,sha256:'a'.repeat(64),file:'reference.iv512le'},1,a.createI4Budget('hash')));assert.equal(reads,1);
});
test('ownerUsesRemainingBudgetAndRejectsDuplicateCase',async()=>{
  const m=await api(),a=await arithmetic(),h=harness();let clock=700000;const b=a.createI4Budget('one-child',()=>clock);clock+=110000;const owner=m.createI4ChildOwner(h.timer),p=owner.run(h.spawn,b,Buffer.from('{}'));
  assert.equal(must(h.timers[0]).ms,10000);h.child.stdout.emit('data',Buffer.from('{}'));h.child.emit('close',0,null);assert.equal((await p).status,'READY');
  await assert.rejects(()=>owner.run(h.spawn,a.createI4Budget('one-child'),Buffer.from('{}')));assert.equal(h.spawns(),1);
});
test('replacementRunnerForSameBackendCannotDiscardPoison',async()=>{
  const fs=require('node:fs/promises'),vm=require('node:vm'),path=require('node:path'),a=await arithmetic();
  const file=path.resolve(__dirname,'../scripts/audio-j1-signed-reference.mjs');let source=await fs.readFile(file,'utf8'),spawns=0;
  const assumptions=await import('../scripts/audio-i4-assumptions.mjs');
  // Consumer-only VM admits a synthetic private capability, not a weaker real backend loader.
  source=source.replace(/^import (.+) from '([^']+)';$/gm,(_,bindings,id)=>`const ${bindings}=require(${JSON.stringify(id)});`).replace(/^export /gm,'');
  source+='\nmodule.exports={createI4PrimitiveRunner,createI4ChildOwner,backends};';
  const sandbox={module:{exports:{}},Buffer,setTimeout,clearTimeout,process:{env:{SystemRoot:'C:/Windows'}},require:(/** @type {string} */id)=>{
    if(id==='./audio-j1-arithmetic.mjs')return a;
    if(id==='./audio-i4-assumptions.mjs')return assumptions;
    if(id==='node:fs/promises')return {mkdir:async()=>{}};
    if(id==='node:child_process')return {spawn:()=>{spawns++;const h=harness();h.child.kill=()=>false;queueMicrotask(()=>{h.child.emit('error',Error('synthetic failure'));h.child.emit('close',null,'SIGKILL');});return h.child;}};
    return require(id);
  }};
  vm.runInNewContext(source,sandbox,{filename:file});
  const m=/** @type {typeof import('../scripts/audio-j1-signed-reference.mjs',{with:{'resolution-mode':'import'}})&{backends:WeakMap<object,unknown>}} */(sandbox.module.exports);
  const backend={python:'synthetic-only',versions:[],contextSha256:'a'.repeat(64)};
  m.backends.set(backend,{owner:m.createI4ChildOwner(),files:{resolve:async()=>'/synthetic/no-file',writeFile:async()=>{}},relative:'output/synthetic',pins:[],basePins:[],code:[]});
  const first=await m.createI4PrimitiveRunner(backend).run([{op:'pi'}],a.createI4Budget('first'));
  assert.equal(first.ownership,'FAIL');
  await assert.rejects(()=>m.createI4PrimitiveRunner(backend).run([{op:'pi'}],a.createI4Budget('second')));
  assert.equal(spawns,1);
});
