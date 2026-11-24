// 합성 자식 프로세스로 Windows Job의 소유권·종료 응답과 helper 파일 검증을 시험한다.
// 저장소 루트에서 Node.js로 node --test tests/run-job.test.cjs 를 실행한다. Windows 전용 진단은 다른 OS에서 생략한다.
// 합성 helper 파일은 실행하지 않고 시험 후 임시 파일과 폴더를 지운다. 실패한 단언은 해당 검증 조건을 표시한다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const path=require('node:path');
const load=()=>import('../scripts/extension-e2e/run-job.mjs');
const nonce='a'.repeat(64),digest='b'.repeat(64);
const diagnosticWindows={skip:process.platform!=='win32'};
const options=()=>({helper:{path:path.resolve('synthetic-owner.exe'),sha256:digest},executable:path.resolve('synthetic-chrome.exe'),args:['--remote-debugging-pipe'],deadline:Date.now()+1000});
function fixture(change=()=>{}){
  const child=new EventEmitter();Object.assign(child,{pid:456,stdin:new PassThrough(),stdout:new PassThrough(),stdio:[null,null,null,new PassThrough(),new PassThrough()],exitCode:null,signalCode:null,kills:0});
  const sent=[];let total=2,active=0,aborted=false;
  const emit=row=>child.stdout.write(JSON.stringify(row)+'\n');
  const identity={v:1,nonce,pid:123,created:'0123456789abcdef',helperPid:456,helperCreated:'0123456789abcdee'};
  const exit=()=>{child.exitCode=0;child.emit('exit',0,null);child.stdout.end();};
  child.kill=()=>{child.kills++;child.signalCode='SIGTERM';child.emit('exit',null,'SIGTERM');return true;};
  child.stdin.on('data',bytes=>{const [op,n]=String(bytes).trim().split(' ');sent.push(op);if(op==='A')aborted=true;
    const row={...identity,seq:Number(n),event:op==='C'?'closed':'state',active,total,rootExited:active===0,aborted};
    queueMicrotask(()=>{change(row,child);emit(row);if(op==='C')queueMicrotask(exit);});
  });
  return {child,sent,emit,identity,setActive:n=>active=n,setTotal:n=>total=n,deps:{verifyHelper:async()=>{},nonce:()=>nonce,spawnChild:()=>{setImmediate(()=>emit({...identity,seq:0,event:'ready',active:1,total:1}));return child;}}};
}
test('diagnostic owner spawn receives only fixed uppercase temp keys without mutating ambient env',diagnosticWindows,async t=>{
  const {launchRunJob}=await load(),f=fixture(),old=process.env;
  const fs=require('node:fs/promises'),os=require('node:os');
  const chromiumTempDir=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'job-temp-'));
  t.after(()=>fs.rmdir(chromiumTempDir));
  await assert.rejects(launchRunJob({...options(),chromiumTempDir:path.join(chromiumTempDir,'missing')},{
    ...f.deps,spawnChild:()=>assert.fail('unexpected helper spawn'),
  }),{code:'ENOENT'});
  const ambient={...Object.fromEntries(Object.entries(old).filter(([key])=>!/^(?:TEMP|TMP)$/i.test(key))),
    TeMp:'C:\\old-a',TEMP:'C:\\old-b',tMp:'C:\\old-c',TMP_KEEP:'other'};
  process.env=ambient;
  t.after(()=>{process.env=old;});
  const capture=f.deps.spawnChild;
  let spawnOptions;
  f.deps.spawnChild=(file,args,options)=>{spawnOptions=options;return capture(file,args,options);};
  const owner=await launchRunJob({...options(),chromiumTempDir},f.deps);
  assert.deepEqual(Object.entries(spawnOptions.env).filter(([key])=>/^(?:temp|tmp)$/i.test(key)),[['TEMP',chromiumTempDir],['TMP',chromiumTempDir]]);
  assert.equal(spawnOptions.env.TMP_KEEP,'other');
  assert.equal(process.env,ambient);
  assert.equal(ambient.TeMp,'C:\\old-a');
  assert.equal(ambient.TEMP,'C:\\old-b');
  assert.equal(ambient.tMp,'C:\\old-c');
  await owner.close(performance.now()+1000);
});
test('diagnostic owner rejects invalid Windows temp paths before helper spawn',async()=>{
  const {launchRunJob}=await load();
  for(const chromiumTempDir of ['C:\\','C:\\trial\\..\\folder','C:\\trial\\NUL.txt']){
    let spawns=0;
    await assert.rejects(launchRunJob({...options(),chromiumTempDir},{
      verifyHelper:async()=>{},spawnChild:()=>{spawns++;throw Error('unexpected helper spawn');},
    }),/run-job-temp-directory/);
    assert.equal(spawns,0);
  }
});
test('run Job requires initial ownership then OS zero, root exit and helper actual exit',async()=>{
  const {launchRunJob,isRunJobShutdown}=await load(),f=fixture(),owner=await launchRunJob(options(),f.deps);
  const job=await owner.close(performance.now()+1000);assert.deepEqual(f.sent,['Q','C']);assert.equal(job.helperExited,true);assert.equal(f.child.kills,0);
  const proof={contract:'run-job-v1',browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:null,runJobClosed:true,profileRootAssessment:'UNASSESSED',job};
  assert.equal(isRunJobShutdown(proof,owner.binding),true);
  for(const patch of [{ownedRootClosed:true},{profileRootAssessment:'PASS'},{job:{...job,active:1}},{job:{...job,helperExited:false}},{job:{...job,timing:undefined}},{job:{...job,timing:{budgetMs:15000,remainingBeforeMs:16000,remainingAfterMs:1}}}])assert.equal(isRunJobShutdown({...proof,...patch},owner.binding),false);
  assert.equal(isRunJobShutdown(proof,{...owner.binding,nonce:'c'.repeat(64)}),false);
  assert.equal(isRunJobShutdown({...proof,job:{...job,aborted:true}},owner.binding),false);
});

test('optional Job evidence retains validated READY, first Q and final C without changing the proof',async()=>{
  const {launchRunJob}=await load(),accounting={};
  const f=fixture(row=>{if(row.seq===1){row.total=1;f.setActive(0);}});
  f.setActive(1);
  const owner=await launchRunJob(options(),{...f.deps,accounting});
  const proof=await owner.close(performance.now()+1000);
  assert.deepEqual(f.sent,['Q','Q','C']);
  assert.deepEqual(accounting,{binding:owner.binding,ready:{seq:0,active:1,total:1},
    firstQ:{seq:1,active:1,total:1},closed:{seq:3,active:0,total:2}});
  assert.equal(proof.total,2);
  assert.deepEqual(Object.keys(proof),['binding','active','rootExited','total','helperExited','aborted','timing']);
});

test('optional Job evidence keeps a validated prefix through startup or close failure',async()=>{
  const {launchRunJob}=await load(),first=fixture(),startup={};
  first.deps.spawnChild=()=>{
    setImmediate(()=>first.child.stdout.write(JSON.stringify({...first.identity,seq:0,event:'ready',active:1,total:2})+'\nnot-json\n'));
    return first.child;
  };
  await assert.rejects(launchRunJob(options(),{...first.deps,accounting:startup}),/run-job-startup-incomplete/);
  assert.deepEqual(startup.ready,{seq:0,active:1,total:2});
  assert.equal(startup.binding.helperPid,first.child.pid);
  assert.equal(startup.firstQ,undefined);

  const accounting={},f=fixture(row=>{if(row.event==='closed')row.total=0;});
  const owner=await launchRunJob(options(),{...f.deps,accounting});
  await assert.rejects(owner.close(performance.now()+1000),/run-job-response-state/);
  await assert.rejects(owner.abort(),/run-job-abort-unconfirmed/);
  assert.deepEqual(accounting,{binding:owner.binding,ready:{seq:0,active:1,total:1},firstQ:{seq:1,active:0,total:2}});
});

test('pipe-exit PID sample binds the original first Q and cannot answer a pending Q',async()=>{
  const {launchRunJob}=await load(),accounting={};
  const f=fixture(row=>{
    if(row.seq===1)f.setActive(0);
    if(row.seq===2){
      assert.deepEqual(accounting.firstQ,{seq:1,active:2,total:2});
      const sample={...f.identity,event:'job-members',seq:1,pids:[123,789]};
      f.emit({...sample,nonce:'c'.repeat(64)});
      f.emit({...sample,seq:2});
      f.emit({...sample,created:'0123456789abcdee'});
      f.emit(sample);
      f.emit({...sample,pids:[123,999]});
    }
  });
  f.setActive(2);
  const selected={...options(),executable:path.resolve('synthetic-fixture.exe'),args:['--role=root','--nonce='+nonce,'--remote-debugging-pipe']};
  const owner=await launchRunJob(selected,{...f.deps,accounting,diagnoseJobMembers:true,spawnChild:(file,args)=>{
    assert.deepEqual(args,[`--nonce=${nonce}`,`--executable=${selected.executable}`,'--job-members-diagnostic','--',...selected.args]);
    return f.deps.spawnChild(file,args);
  }});
  const proof=await owner.close(performance.now()+1000);
  assert.deepEqual(f.sent,['Q','Q','C']);
  assert.deepEqual(accounting.members,{seq:1,pids:[123,789]});
  assert.equal(proof.total,2);
  assert.equal(proof.members,undefined);
});

test('pipe-exit PID evidence cannot overwrite the first Q or an original close error',async()=>{
  const {launchRunJob}=await load();
  for(const firstActive of [1,2]){
    const accounting={},f=fixture(row=>{
      if(row.seq===1)f.setActive(2);
      if(row.seq===2){
        const line=JSON.stringify({...f.identity,event:'job-members',seq:1,pids:[123,789]})+'\n';
        f.child.stdout.write(line.slice(0,20));f.child.stdout.write(line.slice(20));
        f.setActive(0);
      }
      if(row.event==='closed')row.total=0;
    });
    f.setActive(firstActive);
    const owner=await launchRunJob({...options(),args:['--role=root','--nonce='+nonce,'--remote-debugging-pipe']},
      {...f.deps,accounting,diagnoseJobMembers:true});
    await assert.rejects(owner.close(performance.now()+1000),/run-job-response-state/);
    assert.deepEqual(accounting.firstQ,{seq:1,active:firstActive,total:2});
    assert.deepEqual(accounting.members,firstActive===2?{seq:1,pids:[123,789]}:undefined);
  }
});

test('pipe-exit PID evidence arriving at the original deadline leaves the first Q and timeout intact',async t=>{
  const {launchRunJob}=await load(),accounting={};
  let now=100;
  t.mock.method(performance,'now',()=>now);
  const f=fixture(row=>{
    if(row.seq!==1)return;
    f.setActive(0);
    queueMicrotask(()=>{now=200;f.emit({...f.identity,event:'job-members',seq:1,pids:[123,789]});});
  });
  f.setActive(2);
  const owner=await launchRunJob({...options(),args:['--role=root','--nonce='+nonce,'--remote-debugging-pipe']},
    {...f.deps,accounting,diagnoseJobMembers:true});
  await assert.rejects(owner.close(200),/run-job-deadline/);
  assert.deepEqual(accounting.firstQ,{seq:1,active:2,total:2});
  assert.equal(accounting.members,undefined);
  await owner.abort();
  assert.deepEqual(f.sent,['Q','A','Q','C']);
});

test('a matched invalid PID sample or a sample sent after the next Q cannot be repaired',async()=>{
  const {launchRunJob}=await load();
  for(const invalid of [[123,123],[123,789,790],[123,0],[789,790],null]){
    const accounting={},f=fixture(row=>{
      const sample={...f.identity,event:'job-members',seq:1,pids:[123,789]};
      if(row.seq===1)f.setActive(0);
      if(row.seq===2&&invalid){f.emit({...sample,pids:invalid});f.emit(sample);}
      if(row.event==='closed'&&!invalid)f.emit(sample);
    });
    f.setActive(2);
    const owner=await launchRunJob({...options(),args:['--role=root','--nonce='+nonce,'--remote-debugging-pipe']},
      {...f.deps,accounting,diagnoseJobMembers:true});
    assert.equal((await owner.close(performance.now()+1000)).total,2);
    assert.deepEqual(accounting.firstQ,{seq:1,active:2,total:2});
    assert.equal(accounting.members,undefined);
  }
});

test('Job PID diagnostic is rejected for default launcher inputs before spawn',async()=>{
  const {launchRunJob}=await load(),f=fixture();
  await assert.rejects(launchRunJob(options(),{...f.deps,accounting:{},diagnoseJobMembers:true,
    spawnChild:()=>assert.fail('spawned')}),/run-job-member-diagnostic-input/);
});

test('synthetic detached mode reaches the owner without PID accounting and rejects mixed or foreign inputs',async()=>{
  const {launchRunJob}=await load(),f=fixture();
  const selected={...options(),executable:path.resolve('synthetic-fixture.exe'),args:['--role=root','--nonce='+nonce,'--remote-debugging-pipe']};
  const owner=await launchRunJob(selected,{...f.deps,syntheticRootConsole:'detached-v1',spawnChild:(file,args)=>{
    assert.deepEqual(args,['--nonce='+nonce,'--executable='+selected.executable,
      '--synthetic-root-console=detached-v1','--',...selected.args]);
    return f.deps.spawnChild(file,args);
  }});
  await owner.close(performance.now()+1000);
  for(const [input,mode] of [[options(),{syntheticRootConsole:'detached-v1'}],
    [selected,{syntheticRootConsole:'other'}],[selected,{syntheticRootConsole:'detached-v1',diagnoseJobMembers:true,accounting:{}}]]){
    await assert.rejects(launchRunJob(input,{...f.deps,...mode,spawnChild:()=>assert.fail('spawned')}),/run-job-synthetic-root-console/);
  }
});

test('Job accounting excludes late replies and abort polling from normal samples',async t=>{
  const {launchRunJob}=await load(),accounting={};
  let now=100;
  t.mock.method(performance,'now',()=>now);
  const f=fixture(row=>{if(row.seq===1)now=201;});
  const owner=await launchRunJob(options(),{...f.deps,accounting});
  await assert.rejects(owner.close(200),/run-job-deadline/);
  await owner.abort();
  assert.deepEqual(f.sent,['Q','A','Q','C']);
  assert.deepEqual(accounting,{binding:owner.binding,ready:{seq:0,active:1,total:1}});
});

test('an unwritable optional Job evidence sink leaves the original close error and cleanup intact',async()=>{
  const {launchRunJob}=await load(),f=fixture(row=>{row.total=0;});
  const owner=await launchRunJob(options(),{...f.deps,accounting:Object.freeze({})});
  await assert.rejects(owner.close(performance.now()+1000),/run-job-response-state/);
  await assert.rejects(owner.abort(),/run-job-abort-unconfirmed/);
  assert.equal(f.child.kills,1);
});

test('run Job binds helper ready identity to the actual spawned owner and rejects missing or zero FILETIME',async()=>{
  const {launchRunJob,isRunJobShutdown}=await load(),f=fixture(),owner=await launchRunJob(options(),f.deps);
  assert.equal(owner.binding.helperPid,f.child.pid);assert.equal(owner.binding.helperCreated,f.identity.helperCreated);
  const job=await owner.close(performance.now()+1000);
  const proof={contract:'run-job-v1',browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:null,runJobClosed:true,profileRootAssessment:'UNASSESSED',job};
  for(const patch of [{helperPid:undefined},{helperPid:0},{helperCreated:undefined},{helperCreated:'0000000000000000'},{created:'0000000000000000'}]){
    const bad={...owner.binding,...patch};assert.equal(isRunJobShutdown({...proof,job:{...job,binding:bad}},bad),false);
  }
  for(const patch of [{helperPid:undefined},{helperPid:457},{helperPid:123},{helperCreated:undefined},{helperCreated:'0000000000000000'},{created:'0000000000000000'}]){
    const g=fixture();g.deps.spawnChild=()=>{setImmediate(()=>g.emit({...g.identity,seq:0,event:'ready',active:1,total:1,...patch}));return g.child;};
    await assert.rejects(launchRunJob(options(),g.deps),/run-job-startup-incomplete/);assert.equal(g.child.kills,1);
  }
});
test('run Job rejects wrong identity, sequence, accounting and false root exit',async()=>{
  const {launchRunJob}=await load();
  for(const corrupt of [r=>r.nonce='c'.repeat(64),r=>r.pid++,r=>r.seq++,r=>r.active=3,r=>r.total=0,r=>r.rootExited=false]){
    const f=fixture(corrupt),owner=await launchRunJob(options(),f.deps);
    await assert.rejects(owner.close(performance.now()+1000),/run-job-/);
    await assert.rejects(owner.abort(),/run-job-/);assert.equal(f.child.kills,1);
  }
});
test('run Job abort is one attempt and uses the same root/job identity',async()=>{
  const {launchRunJob}=await load(),f=fixture(),owner=await launchRunJob(options(),f.deps);
  const first=owner.abort();assert.equal(owner.abort(),first);await first;
  assert.deepEqual(f.sent,['A','Q','C']);assert.equal(f.child.kills,0);
});
for(const lost of ['Q','C'])test('diagnostic abort sends nothing while a normal '+lost+' is unconfirmed',diagnosticWindows,async()=>{
  const {launchRunJob}=await load(),f=fixture();
  const owner=await launchRunJob({...options(),chromiumTempDir:process.cwd()},f.deps);
  f.child.stdin.removeAllListeners('data');
  f.child.stdin.on('data',bytes=>{
    const [op,seq]=String(bytes).trim().split(' ');f.sent.push(op);
    if(op==='A'||op==='Q'&&lost==='C')f.emit({...f.identity,seq:Number(seq),event:'state',active:0,total:2,rootExited:true,aborted:op==='A'});
  });
  const close=assert.rejects(owner.close(performance.now()+40),/run-job-deadline/);
  const first=owner.abort(performance.now()+200);
  assert.equal(owner.abort(),first);
  await Promise.all([close,assert.rejects(first,/run-job-close-unconfirmed/)]);
  assert.deepEqual(f.sent,lost==='Q'?['Q']:['Q','C']);
  assert.equal(f.child.kills,0);
});
test('diagnostic pre-READY failure cannot start an exact-owner kill after the shared abort cutoff',diagnosticWindows,async t=>{
  const {launchRunJob}=await load(),f=fixture();let now=100;
  t.mock.method(performance,'now',()=>now);
  f.deps.spawnChild=()=>{
    setImmediate(()=>{now=200;f.emit({...f.identity,seq:0,event:'error',code:5});});
    return f.child;
  };
  await assert.rejects(launchRunJob({...options(),chromiumTempDir:process.cwd(),diagnosticAbortBy:200},f.deps),
    error=>error.cause?.message==='run-job-owner-error-5'&&error.retirementError?.message==='run-job-abort-deadline');
  assert.deepEqual(f.sent,[]);assert.equal(f.child.kills,0);
});
test('diagnostic abort can retire once after the final normal Q response was matched',diagnosticWindows,async t=>{
  const {launchRunJob}=await load();let now=100;
  t.mock.method(performance,'now',()=>now);
  const f=fixture(row=>{if(row.seq===1)now=120;});
  const owner=await launchRunJob({...options(),chromiumTempDir:process.cwd(),diagnosticAbortBy:200},f.deps);
  const close=assert.rejects(owner.close(120),/run-job-deadline/);
  const abort=owner.abort(200);
  assert.equal(owner.abort(),abort);
  await close;assert.equal((await abort).aborted,true);
  assert.deepEqual(f.sent,['Q','A','Q','C']);assert.equal(f.child.kills,0);
});
test('run Job late result cannot repair deadline failure; EOF and error are not exit proof',async()=>{
  const {launchRunJob}=await load(),f=fixture(),owner=await launchRunJob(options(),f.deps);
  await assert.rejects(owner.close(performance.now()-1),/run-job-deadline/);
  await assert.rejects(owner.close(performance.now()+1000),/run-job-/);
  await owner.abort();
  const g=fixture(),other=await launchRunJob(options(),g.deps);g.child.stdout.end();
  await assert.rejects(other.close(performance.now()+1000),/run-job-/);
  await assert.rejects(other.abort(),/run-job-/);assert.equal(g.child.kills,1);
});
test('run Job no launch after helper verification failure or expired launch deadline',async()=>{
  const {launchRunJob}=await load();let spawned=0;
  const deps={verifyHelper:async()=>{throw Error('bytes-changed');},spawnChild:()=>spawned++};
  await assert.rejects(launchRunJob(options(),deps),/bytes-changed/);
  await assert.rejects(launchRunJob({...options(),deadline:Date.now()-1},deps),/run-job-deadline/);assert.equal(spawned,0);
});
test('run Job freezes caller launch selection before asynchronous helper verification',async()=>{
  const {launchRunJob}=await load(),f=fixture(),selected=options();let received;
  const originalHelper=selected.helper.path;
  f.deps.verifyHelper=async helper=>{received=helper;selected.helper.path=path.resolve('other.exe');selected.helper.sha256='d'.repeat(64);selected.args.push('--changed');};
  const original=f.deps.spawnChild;f.deps.spawnChild=(file,args)=>{assert.equal(file,originalHelper);assert.ok(!args.includes('--changed'));return original();};
  const owner=await launchRunJob(selected,f.deps);assert.equal(received.sha256,digest);assert.equal(owner.binding.helperSha256,digest);await owner.close(performance.now()+1000);
});
test('run Job drains final control evidence even when exit arrives before data',async()=>{
  const {launchRunJob}=await load();const f=fixture((row,child)=>{if(row.event==='closed'){child.exitCode=0;child.emit('exit',0,null);}});
  const owner=await launchRunJob(options(),f.deps);assert.equal((await owner.close(performance.now()+1000)).helperExited,true);
});
test('run Job rejects trailing control bytes after closed and exit',async()=>{
  const {launchRunJob}=await load(),accounting={};
  const f=fixture((row,child)=>{if(row.event==='closed')queueMicrotask(()=>{child.exitCode=0;child.emit('exit',0,null);child.stdout.write('garbage');});});
  const owner=await launchRunJob(options(),{...f.deps,accounting});
  await assert.rejects(owner.close(performance.now()+1000),/run-job-/);
  assert.deepEqual(accounting.closed,{seq:2,active:0,total:2});
});
test('run Job rejects unowned initial zero and bounded malformed owner replies',async()=>{
  const {launchRunJob}=await load();
  const initial={v:1,nonce,seq:0,event:'ready',pid:123,created:'0123456789abcdef',helperPid:456,helperCreated:'0123456789abcdee',active:1,total:1};
  for(const raw of [JSON.stringify({...initial,active:0,total:0})+'\n','x'.repeat(1025),'not-json\n',JSON.stringify(initial)+'\nnot-json\n']){
    const f=fixture();f.deps.spawnChild=()=>{setImmediate(()=>f.child.stdout.write(raw));return f.child;};
    await assert.rejects(launchRunJob(options(),f.deps),/run-job-startup-incomplete/);assert.equal(f.child.kills,1);
  }
});
test('run Job preserves safe numeric Win32 failure and never treats child error as exit',async()=>{
  const {launchRunJob}=await load(),f=fixture(),owner=await launchRunJob(options(),f.deps);
  f.emit({v:1,nonce,seq:1,event:'error',code:5,private:'must not escape'});
  await assert.rejects(owner.close(performance.now()+1000),error=>error.message==='run-job-owner-error-5');
  await assert.rejects(owner.abort(),/run-job-abort-unconfirmed/);assert.equal(f.child.kills,1);
  const g=fixture(),other=await launchRunJob(options(),g.deps);g.child.emit('error',Error('private path'));
  await assert.rejects(other.close(performance.now()+1000),/run-job-helper-error/);
  await assert.rejects(other.abort(),/run-job-abort-unconfirmed/);assert.equal(g.child.kills,1);
});
test('run Job helper selection checks regular-file bytes without executing it',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
  const directory=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'run-job-bytes-')),file=path.join(directory,'owner.exe');
  t.after(async()=>{await fs.unlink(file);await fs.rmdir(directory);});
  const bytes=Buffer.from('synthetic non-executable bytes');await fs.writeFile(file,bytes,{flag:'wx'});
  const {verifyRunJobHelper}=await load(),selected={path:file,sha256:createHash('sha256').update(bytes).digest('hex')};
  await verifyRunJobHelper(selected);await assert.rejects(verifyRunJobHelper({...selected,sha256:digest}),/run-job-helper-bytes/);
  await fs.writeFile(file,'changed');await assert.rejects(verifyRunJobHelper(selected),/run-job-helper-bytes/);
  await assert.rejects(verifyRunJobHelper({...selected,path:'relative.exe'}),/run-job-helper-selection/);
});
test('original close error keeps bounded abort cause through the existing failure projection',async()=>{
  const {l1OwnedCloser}=await import('../scripts/extension-e2e/audio-l1.mjs');
  const {nativeFailureDetails}=await import('../scripts/audio-native-browser.mjs');
  const first=Error('media-close-unconfirmed'),abortError=Object.assign(Error('run-job-abort-unconfirmed'),{cause:Error('run-job-owner-error-5'),private:'never saved'});let calls=0;
  const close=l1OwnedCloser(async()=>{throw first;},async()=>{calls++;throw abortError;});
  await assert.rejects(close({}),error=>error===first);
  const saved=nativeFailureDetails(first);assert.equal(saved.forcedRetirement,false);assert.equal(saved.retirementError.cause.message,'run-job-owner-error-5');assert.equal(saved.retirementError.private,undefined);
  await assert.rejects(close({}));assert.equal(calls,1);
});
