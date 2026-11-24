const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{createHash}=require('node:crypto');
const load=()=>import('../scripts/check-product-audio.mjs');
const frame=65536,cap=96*1024*1024;
const deferred=()=>Promise.withResolvers();
const binding={nonce:'a'.repeat(64),pid:42,created:'0123456789abcdef',helperPid:43,helperCreated:'0123456789abcdee',helperSha256:'b'.repeat(64),executable:'C:\\fixed\\chrome.exe'};
const retired={binding,active:0,rootExited:true,total:1,helperExited:true,aborted:true,timing:{budgetMs:15000,remainingBeforeMs:11000,remainingAfterMs:10000}};
const shutdown={contract:'run-job-v1',browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:null,runJobClosed:true,profileRootAssessment:'UNASSESSED',job:{...retired,aborted:false}};
const launchOptions={productCaseId:'44100/normalizer-control/tone-silence',runJob:{contract:'run-job-v1',helper:{path:'C:\\fixed\\owner.exe',sha256:'b'.repeat(64)}},
  browserCandidate:{root:'C:\\fixed',manifestSha256:'a'.repeat(64)},diagnosticPaths:{chromiumTempDir:'C:\\run\\temp',playwrightArtifactsDir:'C:\\run\\artifacts'},
  headed:false,extensionPath:path.resolve('fake-dist'),profilePath:path.resolve('fake-profile'),artifactPath:path.resolve('fake-raw')};
function reserve(){
  const bytes=Buffer.alloc(frame*2,42),writes=[],sha256=createHash('sha256').update(bytes).digest('hex');
  const handle={stat:async()=>({size:bytes.length,isFile:()=>true}),read:async(buffer,offset,length,position)=>({bytesRead:bytes.copy(buffer,offset,position,position+length)}),
    write:async(buffer,offset,length,position)=>{writes.push(position);buffer.copy(bytes,position,offset,offset+length);return {bytesWritten:length};},sync:async()=>{}};
  const get=offset=>{
    const data=bytes.subarray(offset,offset+frame-32);
    assert.deepEqual(bytes.subarray(offset+frame-32,offset+frame),createHash('sha256').update(data).digest());
    const record=JSON.parse(data.toString('utf8').split('\0',1)[0]);
    assert.equal(record.reservationSha256,sha256);assert.equal(record.slot,offset/frame);
    return record.evidence;
  };
  return {handle,sha256,bytes,writes,get};
}
const sample=(logicalBytes=0)=>({logicalBytes,entries:0});
test('diagnostic reserves both slots before forwarding first monitor STOP to the real launch observer',async()=>{
  const {runChromiumJobDiagnostic}=await load(),slots=reserve(),handed=deferred(),actual=deferred(),scan=deferred();
  const late=Error('actual-launch-late');let samples=0,aborts=0;
  const run=runChromiumJobDiagnostic({started:performance.now(),reserve:slots,scan:()=>++samples===1?Promise.resolve(sample()):scan.promise,
    launchOptions,observe:async()=>assert.fail('unexpected observe')},{
    launch:async ({observeRunJobOwner,signal})=>{
      const abort=observeRunJobOwner({binding,abort:async()=>{aborts++;return retired;}});
      signal.addEventListener('abort',()=>actual.resolve(),{once:true});
      handed.resolve();await actual.promise;await abort();throw late;
    }
  });
  const failure=assert.rejects(run,/chromium-diagnostic-raw-limit/);
  await handed.promise;scan.resolve(sample(cap));await failure;
  assert.equal(aborts,1);assert.deepEqual(slots.writes,[0,frame]);
  assert.equal(slots.get(0).message,'chromium-diagnostic-raw-limit');
  assert.equal(slots.get(frame).launchError.message,late.message);
  assert.equal(slots.get(frame).status,'CONFIRMED');
});
test('diagnostic admits no launch when reservation bytes changed or baseline sample STOPs',async()=>{
  const {runChromiumJobDiagnostic}=await load();
  for(const changed of [false,true]){
    const slots=reserve();if(changed)slots.bytes[100]=0;
    await assert.rejects(runChromiumJobDiagnostic({started:performance.now(),reserve:slots,scan:async()=>sample(cap),launchOptions,observe:async()=>{}},
      {launch:async()=>assert.fail('unexpected launch')}),changed?/chromium-diagnostic-reserve/:/chromium-diagnostic-raw-limit/);
    assert.deepEqual(slots.writes,changed?[]:[0,frame]);
  }
});
for(const fault of ['partial','readback','late-sync'])test('diagnostic preserves first STOP and refuses a second slot after '+fault,async t=>{
  const {runChromiumJobDiagnostic}=await load(),slots=reserve();let now=100;
  t.mock.method(performance,'now',()=>now);
  if(fault==='partial')slots.handle.write=async()=>{slots.writes.push(0);return {bytesWritten:8};};
  if(fault==='late-sync')slots.handle.sync=async()=>{now=240100;};
  if(fault==='readback'){
    const read=slots.handle.read;
    slots.handle.read=async(...args)=>{const result=await read(...args);if(slots.writes.length)args[0][0]^=1;return result;};
  }
  await assert.rejects(runChromiumJobDiagnostic({started:now,reserve:slots,scan:async()=>sample(cap),launchOptions,observe:async()=>{}},
    {launch:async()=>assert.fail('unexpected launch')}),error=>error.message==='chromium-diagnostic-raw-limit'&&Boolean(error.evidenceError));
  assert.deepEqual(slots.writes,[0]);
});
test('diagnostic rejects missing Job or isolated write paths before launching',async()=>{
  const {runChromiumJobDiagnostic}=await load();
  for(const change of [{runJob:undefined},{browserCandidate:undefined},{diagnosticPaths:undefined},{extensionPath:undefined},{headed:true}]){
    const options={...launchOptions,...change};
    const slots=reserve();let launches=0;
    await assert.rejects(runChromiumJobDiagnostic({started:performance.now(),reserve:slots,scan:async()=>sample(),launchOptions:options,observe:async()=>{}},
      {launch:async()=>{launches++;throw Error('unexpected launch');}}),/chromium-diagnostic-selection/);
    assert.equal(launches,0);assert.deepEqual(slots.writes,[]);
  }
});
test('diagnostic takes a final scan after confirmed normal close without aborting on final STOP',async()=>{
  const {runChromiumJobDiagnostic}=await load(),slots=reserve(),proof=structuredClone(shutdown);let closed=false,samples=0,aborts=0;
  await assert.rejects(runChromiumJobDiagnostic({started:performance.now(),reserve:slots,scan:async()=>{
    samples++;if(closed)proof.job.total=99;return sample(closed?cap:0);
  },launchOptions,observe:async()=>({})},{
    launch:async ({observeRunJobOwner})=>({runJobOwner:{binding},abort:observeRunJobOwner({binding,abort:async()=>{aborts++;return retired;}})}),
    close:async()=>{closed=true;return proof;}
  }),/chromium-diagnostic-raw-limit/);
  assert.ok(samples>=2);assert.equal(aborts,0);assert.deepEqual(slots.get(frame).shutdown,shutdown);
});
test('diagnostic preserves a separate monitor STOP while the original observation failure is retiring',async()=>{
  const {runChromiumJobDiagnostic}=await load(),slots=reserve(),scanning=deferred(),scan=deferred(),abort=deferred();
  const first=Error('observer-first'),later=Error('monitor-later');let samples=0;
  const run=runChromiumJobDiagnostic({started:performance.now(),reserve:slots,launchOptions,
    scan:async()=>{if(++samples===1)return sample();scanning.resolve();return scan.promise;},observe:async()=>{await scanning.promise;throw first;}},{
    launch:async ({observeRunJobOwner})=>({runJobOwner:{binding},abort:observeRunJobOwner({binding,abort:()=>abort.promise})})
  });
  const result=assert.rejects(run,error=>error===first);
  await scanning.promise;
  while(slots.writes.length===0)await new Promise(resolve=>setImmediate(resolve));
  scan.reject(later);
  await new Promise(resolve=>setImmediate(resolve));abort.resolve(retired);
  await result;
  assert.equal(slots.get(0).message,first.message);
  assert.equal(slots.get(frame).monitorError.message,later.message);
});
test('diagnostic writes and rereads both frames through one real file handle',async()=>{
  const {runChromiumJobDiagnostic}=await load(),slots=reserve();
  const fs=require('node:fs/promises'),{tmpdir}=require('node:os');
  const directory=await fs.mkdtemp(path.join(tmpdir(),'ck-diagnostic-slots-')),file=path.join(directory,'reserve.bin');
  let handle;
  try{
    handle=await fs.open(file,'wx+');
    await handle.writeFile(slots.bytes);
    await handle.sync();
    await assert.rejects(runChromiumJobDiagnostic({started:performance.now(),reserve:{handle,sha256:slots.sha256},
      scan:async()=>sample(cap),launchOptions,observe:async()=>{}},{launch:async()=>assert.fail('unexpected launch')}),/chromium-diagnostic-raw-limit/);
    const saved=await handle.read(slots.bytes,0,slots.bytes.length,0);
    assert.equal(saved.bytesRead,2*frame);assert.equal((await handle.stat()).size,2*frame);
    assert.equal(slots.get(0).message,'chromium-diagnostic-raw-limit');
    assert.equal(slots.get(frame).launchState,'NOT_STARTED');
  }finally{
    if(handle){await handle.close();await fs.unlink(file);}
    await fs.rmdir(directory);
  }
});
