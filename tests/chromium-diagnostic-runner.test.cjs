const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),{tmpdir}=require('node:os'),{createHash}=require('node:crypto');
const load=()=>import('../scripts/extension-e2e/chromium-diagnostic-runner.mjs');
const budget=96*1024*1024,reserved=128*1024;
const volume='384eef3a4eeef014',fileId='000000000000000000300000000aaeee';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('controller budget precharges the full reserve and enforces total and launch limits before allocation',async()=>{
  const {createDiagnosticEvidenceLedger}=await load(),ledger=createDiagnosticEvidenceLedger();
  assert.equal(ledger.bytes,reserved);
  assert.throws(()=>ledger.charge('evidence/run-job-launch.json',4097),/diagnostic-evidence-launch-bound/);
  ledger.charge('evidence/run-job-launch.json',4096);
  ledger.charge('evidence/before.json',budget-reserved-4096);
  assert.equal(ledger.bytes,budget);
  assert.throws(()=>ledger.charge('evidence/result.json',1),/diagnostic-evidence-budget/);
  assert.throws(()=>ledger.charge('evidence/before.json',1),/diagnostic-evidence-name/);
});

async function fixture(t){
  const root=await fs.mkdtemp(path.join(tmpdir(),'ck-compat-evidence-'));
  const dirs=['evidence','profile','browser-artifacts','chromium-temp','playwright-artifacts','dist'];
  t.after(async()=>{
    for(const dir of dirs){
      const target=path.join(root,dir);
      for(const name of await fs.readdir(target))await fs.unlink(path.join(target,name));
      await fs.rmdir(target);
    }
    for(const name of await fs.readdir(root))await fs.unlink(path.join(root,name));
    await fs.rmdir(root);
  });
  await Promise.all(dirs.map(dir=>fs.mkdir(path.join(root,dir))));
  const slots=Buffer.alloc(reserved,23),reservationSha256=hash(slots),writes=[],calls=[];
  await fs.writeFile(path.join(root,'evidence','failure-slots.bin'),slots,{flag:'wx'});
  const scanner=Buffer.from('pinned fixture scanner');
  await fs.writeFile(path.join(root,'measure-raw.ps1'),scanner,{flag:'wx'});
  const binding={nonce:'a'.repeat(64),pid:21,created:'0123456789abcdef',helperPid:22,helperCreated:'0123456789abcdee',
    helperSha256:'b'.repeat(64),executable:path.resolve('never-chrome.exe')};
  const shutdown={contract:'run-job-v1',browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:null,runJobClosed:true,
    profileRootAssessment:'UNASSESSED',job:{binding,active:0,rootExited:true,total:1,helperExited:true,aborted:false,
      timing:{budgetMs:15000,remainingBeforeMs:11000,remainingAfterMs:10000}}};
  const candidate={root:path.resolve('never-candidate'),manifestSha256:'c'.repeat(64)};
  const options={started:performance.now(),root,host:{pwsh:path.resolve('never-pwsh.exe'),scannerSha256:hash(scanner),reservationSha256,fileId,volumeSerial:volume},
    browserCandidate:candidate,runJob:{contract:'run-job-v1',helper:{path:path.resolve('never-owner.exe'),sha256:binding.helperSha256}},
    extensionId:'e'.repeat(32),extensionVersion:'1.0.0',attestExtension:async()=>({sha256:'f'.repeat(64)})};
  const admitted={allocation:{fileId,volumeSerial:volume,allocatedBytes:reserved},reserve:{sha256:reservationSha256,handle:{
    stat:async()=>({size:reserved,isFile:()=>true}),read:async(out,offset,length,position)=>({bytesRead:slots.copy(out,offset,position,position+length)}),
    write:async(data,offset,length,position)=>{writes.push(position);data.copy(slots,position,offset,offset+length);return {bytesWritten:length};},sync:async()=>{},
  }},scan:async()=>({logicalBytes:0,entries:0}),close:async()=>['reserve','scan'].map(lane=>({lane,status:'CONFIRMED',exited:true,stdoutEnded:true,
    code:0,signal:null,stderrBytes:0,outstanding:null,error:null}))};
  const candidateProof={...candidate,version:'159.0.8132.0',executable:binding.executable};
  const dependencies={
    openHost:async input=>{calls.push('open-host');assert.equal(input.volumeSerial,volume);assert.equal(input.fileId,fileId);return admitted;},
    launch:async input=>{
      calls.push('launch');await input.recordBrowserCandidate(candidateProof);
      const abort=input.observeRunJobOwner({binding,abort:async()=>{calls.push('abort');return {...shutdown.job,aborted:true};}});
      await input.recordRunJob(binding);
      return {runJobOwner:{binding},abort};
    },
    observe:async()=>({browserSession:{},evidence:{extensionId:options.extensionId,version:options.extensionVersion,pid:binding.pid}}),
    close:async()=>{calls.push('close');return shutdown;},
    verifyCandidate:async()=>{calls.push('post');return candidateProof;},
  };
  return {root,options,dependencies,admitted,calls,writes};
}

test('bound runner checks exact evidence and unchanged reservation before confirming storage',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load(),f=await fixture(t);
  const result=await runChromiumCompatibilityDiagnostic(f.options,f.dependencies);
  assert.deepEqual(f.calls,['open-host','launch','close','post']);
  assert.deepEqual(f.writes,[]);
  assert.equal(result.storage.status,'CONFIRMED');
  assert.equal(result.storage.bytes,reserved+result.storage.files.reduce((sum,row)=>sum+row.bytes,0));
  assert.equal(result.storage.files.some(row=>row.name==='evidence/result.json'),true);
});
test('bound runner rejects a returned NTFS volume mismatch before controller writes or launch',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load(),f=await fixture(t);
  f.admitted.allocation.volumeSerial='0'.repeat(16);
  await assert.rejects(runChromiumCompatibilityDiagnostic(f.options,f.dependencies),/diagnostic-evidence-reservation/);
  assert.deepEqual(f.calls,['open-host']);
  assert.deepEqual(await fs.readdir(path.join(f.root,'evidence')),['failure-slots.bin']);
});
test('late flush cannot certify a controller file even if its complete bytes exist',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load(),f=await fixture(t);let now=f.options.started;
  t.mock.method(performance,'now',()=>now);
  f.dependencies.openEvidence=async(name,...args)=>{
    const handle=await fs.open(name,...args);
    if(path.basename(name)==='result.json'){
      const sync=handle.sync.bind(handle);
      handle.sync=async()=>{await sync();now=f.options.started+240000;};
    }
    return handle;
  };
  await assert.rejects(runChromiumCompatibilityDiagnostic(f.options,f.dependencies),error=>
    error.message==='diagnostic-evidence-deadline'&&error.storage?.status==='UNKNOWN');
  assert.ok((await fs.stat(path.join(f.root,'evidence','result.json'))).size>0);
  assert.equal(f.calls.includes('abort'),false);
});
test('tampered controller evidence cannot pass replay or trigger another abort after normal close',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load(),f=await fixture(t);
  const verify=f.dependencies.verifyCandidate;
  f.dependencies.verifyCandidate=async()=>{
    const result=await verify();
    await fs.writeFile(path.join(f.root,'evidence','startup-probe.json'),'changed');
    return result;
  };
  await assert.rejects(runChromiumCompatibilityDiagnostic(f.options,f.dependencies),error=>
    /diagnostic-evidence-replay/.test(error.message)&&error.storage?.failureSlots?.length===2);
  assert.deepEqual(f.writes,[0,reserved/2]);
  assert.equal(f.calls.includes('abort'),false);
});
test('Playwright writes outside the controller budget force STOP without being deleted',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load(),f=await fixture(t);
  const file=path.join(f.root,'playwright-artifacts','unexpected.bin');
  await fs.writeFile(file,Buffer.from([42]));
  await assert.rejects(runChromiumCompatibilityDiagnostic(f.options,f.dependencies),/diagnostic-evidence-unowned/);
  assert.deepEqual(f.calls,[]);
  assert.deepEqual(await fs.readFile(file),Buffer.from([42]));
});
test('oversize launch record stops before opening its file, retains the first error and aborts one owner',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load(),f=await fixture(t);
  const launch=f.dependencies.launch;
  f.dependencies.launch=input=>launch({...input,recordRunJob:binding=>input.recordRunJob({...binding,padding:'x'.repeat(4096)})});
  await assert.rejects(runChromiumCompatibilityDiagnostic(f.options,f.dependencies),error=>
    error.message==='diagnostic-evidence-launch-bound'&&error.storage?.failureSlots?.length===2);
  assert.deepEqual(f.calls,['open-host','launch','abort']);
  assert.equal((await fs.readdir(path.join(f.root,'evidence'))).includes('run-job-launch.json'),false);
});
test('worker exit failure saves STOP after replay instead of leaving a normal terminal record',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load(),f=await fixture(t);
  const close=f.admitted.close;
  f.admitted.close=async()=>{const workers=await close();workers[0].code=1;return workers;};
  await assert.rejects(runChromiumCompatibilityDiagnostic(f.options,f.dependencies),error=>
    error.message==='diagnostic-evidence-unconfirmed'&&error.storage?.status==='UNKNOWN');
  const result=JSON.parse(await fs.readFile(path.join(f.root,'evidence','result.json'),'utf8'));
  assert.equal(result.status,'STOP_OBSERVED');assert.equal(result.workers[0].code,1);
  assert.equal(f.calls.includes('abort'),false);
});
test('scanner input removed after launch cannot pass final storage replay',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load(),f=await fixture(t);
  const verify=f.dependencies.verifyCandidate;
  f.dependencies.verifyCandidate=async()=>{
    const result=await verify();
    await fs.unlink(path.join(f.root,'measure-raw.ps1'));
    return result;
  };
  await assert.rejects(runChromiumCompatibilityDiagnostic(f.options,f.dependencies),error=>
    error.message==='diagnostic-evidence-inventory'&&error.storage?.failureSlots?.length===2);
  assert.equal(f.calls.includes('abort'),false);
});
test('controller refuses launch evidence for an executable different from the verified candidate',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load(),f=await fixture(t);
  const launch=f.dependencies.launch;
  f.dependencies.launch=input=>launch({...input,recordRunJob:binding=>input.recordRunJob({...binding,executable:path.resolve('foreign.exe')})});
  await assert.rejects(runChromiumCompatibilityDiagnostic(f.options,f.dependencies),error=>
    error.message==='diagnostic-evidence-launch-binding'&&error.storage?.failureSlots?.length===2);
  assert.deepEqual(f.calls,['open-host','launch','abort']);
});
test('a prior raw profile is preserved and never opened for a new run',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load(),f=await fixture(t);
  const prior=path.join(f.root,'profile','prior.bin');
  await fs.writeFile(prior,Buffer.from([24]));
  await assert.rejects(runChromiumCompatibilityDiagnostic(f.options,f.dependencies),/diagnostic-evidence-used-root/);
  assert.deepEqual(f.calls,[]);
  assert.deepEqual(await fs.readFile(prior),Buffer.from([24]));
});
test('default compatibility probe permits only the blank page and this extension permission page',async t=>{
  const {runChromiumCompatibilityDiagnostic}=await load();
  for(const foreign of [false,true]){
    const f=await fixture(t);
    const launch=f.dependencies.launch;
    delete f.dependencies.observe;
    let probes=0;
    f.dependencies.launch=async input=>{
      const current=await launch(input),{pid}=current.runJobOwner.binding;
      const blank={url:()=>'about:blank',evaluate:async()=>true};
      const permission={url:()=>foreign?'https://invalid.example/':'chrome-extension://'+f.options.extensionId+'/permission.html'};
      return {...current,extensionId:f.options.extensionId,worker:{evaluate:async()=>({id:f.options.extensionId,version:f.options.extensionVersion})},
        context:{pages:()=>[blank,permission],browser:()=>({isConnected:()=>true,newBrowserCDPSession:async()=>({send:async method=>{
          assert.equal(method,'SystemInfo.getProcessInfo');probes++;
          return {processInfo:[{type:'browser',id:pid}]};
        }})})}};
    };
    if(foreign){
      await assert.rejects(runChromiumCompatibilityDiagnostic(f.options,f.dependencies),/chromium-diagnostic-local-target/);
      assert.equal(probes,0);assert.deepEqual(f.calls,['open-host','launch','abort']);
    }else{
      assert.equal((await runChromiumCompatibilityDiagnostic(f.options,f.dependencies)).storage.status,'CONFIRMED');
      assert.equal(probes,1);
    }
  }
});
