// Pure HOST only: this file imports no process entry, native binary, or spawn adapter.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const support=import('./fixtures/installed-extension/run-job-process-support.mjs');
const binding={nonce:'a'.repeat(64),pid:42,created:'0123456789abcdef',helperPid:43,helperCreated:'0123456789abcdee',helperSha256:'b'.repeat(64),executable:'C:\\trial\\fixture.exe'};
const job=(aborted=true)=>({binding,active:0,rootExited:true,helperExited:true,aborted,total:aborted?2:1,timing:{budgetMs:15000,remainingBeforeMs:15000,remainingAfterMs:1}});
const trialArgs=['--case=pipe-exit','--helper=C:\\trial\\owner.exe','--helper-sha256='+ 'a'.repeat(64),'--fixture=C:\\trial\\fixture.exe','--fixture-sha256='+ 'b'.repeat(64),'--source-sha256='+ 'c'.repeat(64),'--node-sha256='+ 'd'.repeat(64),'--output=C:\\trial','--batch-deadline=123456'];
const detached='--synthetic-root-console=detached-v1';

test('external batch inventory compares exact filename values across realms',async()=>{
  const {runInNewContext}=require('node:vm');
  const {sameRunJobBatchInventory}=await import('./fixtures/installed-extension/run-job-batch-inventory.mjs');
  const expected=Object.freeze(['child.exe','owner.exe','pipe-exit','trial-state.json','trial.lock']);
  const actual=runInNewContext('Object.freeze(["trial.lock","owner.exe","pipe-exit","child.exe","trial-state.json"])');
  assert.notEqual(Object.getPrototypeOf(actual),Object.getPrototypeOf(expected));
  assert.equal(sameRunJobBatchInventory(actual,expected),true);
  assert.equal(sameRunJobBatchInventory(expected,actual),true);
  for(const names of [
    expected.slice(1),[...expected,'trial-state.json.tmp'],
    expected.map(name=>name==='owner.exe'?'other.exe':name),
    expected.map(name=>name==='owner.exe'?'OWNER.EXE':name),
    expected.map(name=>name==='owner.exe'?'child.exe':name),
    expected.map(name=>name==='owner.exe'?{toString:()=>name}:name),
  ])assert.equal(sameRunJobBatchInventory(names,expected),false);
});

const gateRow=Object.freeze({token:'20c31d22-1475-4a4f-b679-d415d337593b',index:0,name:'pipe-exit'});
const gateFrame='RUN_JOB_GATE_ACK {"event":"gate-pass","token":"20c31d22-1475-4a4f-b679-d415d337593b","index":0,"name":"pipe-exit"}';
const textResponse=(...lines)=>({content:lines.map(text=>({type:'text',text}))});

test('external gate accepts one exact acknowledgment after leading warnings',()=>{
  const {formatRunJobGateAck,assertRunJobGateAck}=require('./fixtures/installed-extension/run-job-batch-ack.cjs');
  const frame=formatRunJobGateAck({event:'gate-pass',...gateRow,reportSha:'audit-only'});
  assert.equal(frame,gateFrame);
  const warning='Warning: synthetic transport diagnostic';
  const attached='Warning: axObserved was declared with const; use let for reassignable variables.';
  for(const response of [
    textResponse(gateFrame),
    textResponse(warning,gateFrame),
    textResponse(warning,warning,gateFrame),
    textResponse(attached+'\n'+gateFrame),
    textResponse(warning,attached+'\r\n'+attached+'\r\n'+gateFrame),
  ])assert.doesNotThrow(()=>assertRunJobGateAck(response,gateRow));
});

test('external gate stops on missing, duplicate, conflicting, or unbound acknowledgment',()=>{
  const {assertRunJobGateAck}=require('./fixtures/installed-extension/run-job-batch-ack.cjs');
  const foreignRun=gateFrame.replace(gateRow.token,'a21c997a-f9aa-4d08-b830-dca43a7b8681');
  const wrongRow=gateFrame.replace('"index":0','"index":1');
  const wrongName=gateFrame.replace('pipe-exit','detached-abort');
  const stopped=gateFrame.replace('gate-pass','gate-stop');
  for(const [name,response] of [
    ['missing',textResponse('Warning: no result')],
    ['untagged',textResponse(gateFrame.slice('RUN_JOB_GATE_ACK '.length))],
    ['duplicate blocks',textResponse(gateFrame,gateFrame)],
    ['duplicate lines',textResponse(gateFrame+'\n'+gateFrame)],
    ['foreign run',textResponse(foreignRun)],
    ['wrong index',textResponse(wrongRow)],
    ['wrong case',textResponse(wrongName)],
    ['conflicting',textResponse(foreignRun,gateFrame)],
    ['stop',textResponse(stopped)],
    ['stop with pass',textResponse(stopped,gateFrame)],
    ['truncated',textResponse(gateFrame.slice(0,-1),gateFrame)],
    ['hidden frame',textResponse('Warning: '+gateFrame,gateFrame)],
    ['injected newline',textResponse('Warning: diagnostics\n'+gateFrame)],
    ['attached warning without ack',textResponse('Warning: axObserved was declared with const; use let for reassignable variables.\n')],
    ['unknown data within a warning',textResponse('Warning: diagnostics\nerror',gateFrame)],
    ['unicode line separators',textResponse('Warning: diagnostics\u2028error',gateFrame)],
    ['unicode paragraph separators',textResponse('Warning: diagnostics\u2029error',gateFrame)],
    ['modified frame bytes',textResponse(gateFrame+'\n')],
    ['oversized warning',textResponse('Warning: '+ 'x'.repeat(8192),gateFrame)],
    ['too many blocks',textResponse(...Array(8).fill('Warning: too many'),gateFrame)],
    ['unrecognized block',textResponse('unexplained extra text',gateFrame)],
    ['late warning',textResponse(gateFrame,'Warning: late')],
    ['tool error',{...textResponse(gateFrame),isError:true}],
    ['nontext block',{content:[{type:'image'},...textResponse(gateFrame).content]}],
  ])assert.throws(()=>assertRunJobGateAck(response,gateRow),/^Error: run-job-batch-gate-ack$/,name);
  assert.throws(()=>assertRunJobGateAck(textResponse(gateFrame),{...gateRow,token:undefined}),/run-job-batch-gate-ack/);
});

test('trial selection rejects missing, repeated, unknown cases and nonabsolute inputs',async()=>{
  const {parseSelection}=await support;
  const argv=trialArgs;
  assert.equal(parseSelection(argv).case,'pipe-exit');
  assert.equal(parseSelection(argv)['job-members-diagnostic'],undefined);
  const diagnostic='--job-members-diagnostic=1';
  assert.equal(parseSelection([...argv,diagnostic])['job-members-diagnostic'],'1');
  for(const bad of [[...argv,diagnostic,diagnostic],[...argv,'--job-members-diagnostic=0'],
    ['--case=detached-abort',...argv.slice(1),diagnostic]])assert.throws(()=>parseSelection(bad),/trial-selection/);
  for(const bad of [argv.slice(1),[...argv,'--case=helper-death'],argv.map(x=>x==='--case=pipe-exit'?'--case=all':x),[...argv,'--retry=1'],argv.map(x=>x.startsWith('--fixture=')?'--fixture=fixture.exe':x)])assert.throws(()=>parseSelection(bad));
});

test('synthetic batch console mode is exact, common to four rows and exclusive of PID diagnostics',async()=>{
  const {cases,parseSelection}=await support;
  for(const name of cases){
    const argv=['--case='+name,...trialArgs.slice(1),detached];
    assert.equal(parseSelection(argv)['synthetic-root-console'],'detached-v1');
  }
  for(const suffix of [[detached,detached],[detached,'--job-members-diagnostic=1'],
    ['--synthetic-root-console=default'],['--synthetic-root-console=DETACHED-V1'],['--synthetic-root-console='],
    [{toString:()=>detached}]]){
    assert.throws(()=>parseSelection([...trialArgs,...suffix]),/trial-selection/);
  }
});

test('synthetic batch ledger binds the fixed mode and all common inputs without donating a single PASS',async()=>{
  const {cases,parseSelection,hashSelection,claimRow,finishRow}=await support;
  const batchArgs=[...trialArgs,detached],selection=parseSelection(batchArgs),deadline=selection['batch-deadline'];
  const hash=hashSelection(selection);
  const passed=selected=>finishRow(claimRow(null,'pipe-exit',hashSelection(selected),selected['batch-deadline']),{ok:true});
  let ledger=passed(selection);
  for(const suffix of [[],['--job-members-diagnostic=1']]){
    assert.throws(()=>claimRow(passed(parseSelection([...trialArgs,...suffix])),'detached-abort',hash,deadline),/ledger-stop/);
  }
  for(const [key,value] of [
    ['helper','C:\\trial\\new-owner.exe'],['fixture','C:\\trial\\new-child.exe'],['output','C:\\new-trial'],
    ...['helper','fixture','source','node'].map(name=>[name+'-sha256','e'.repeat(64)]),
    ['batch-deadline','123457'],
  ]){
    const changed=parseSelection(batchArgs.map(arg=>arg.startsWith('--'+key+'=')?'--'+key+'='+value:arg));
    assert.throws(()=>claimRow(ledger,'detached-abort',hashSelection(changed),changed['batch-deadline']),/ledger-stop/);
  }
  for(const name of cases.slice(1)){
    const next=parseSelection(['--case='+name,...batchArgs.slice(1)]);
    assert.equal(hashSelection(next),hash);
    ledger=finishRow(claimRow(ledger,name,hashSelection(next),deadline),{ok:true});
  }
  assert.deepEqual(ledger.rows,cases.map(name=>({case:name,status:'passed'})));
  assert.deepEqual(ledger.unexecuted,[]);
});

test('trial ledger consumes the selected row before launch and permanently stops a failed suffix',async()=>{
  const {claimRow,finishRow}=await support;
  let ledger=claimRow(null,'pipe-exit','a'.repeat(64),100000);
  assert.equal(ledger.rows[0].status,'running');
  assert.throws(()=>claimRow(ledger,'pipe-exit','a'.repeat(64),100000));
  assert.throws(()=>claimRow(ledger,'detached-abort','a'.repeat(64),100000));
  ledger=finishRow(ledger,{ok:true});
  assert.throws(()=>claimRow(ledger,'helper-death','a'.repeat(64),100000));
  assert.throws(()=>claimRow(ledger,'detached-abort','b'.repeat(64),100000));
  ledger=claimRow(ledger,'detached-abort','a'.repeat(64),100000);
  ledger=finishRow(ledger,{ok:false,error:'original'});
  assert.deepEqual(ledger.unexecuted,['helper-death','controller-death']);
  assert.throws(()=>claimRow(ledger,'helper-death','a'.repeat(64),100000));
});

test('elapsed handshake time shortens transferred budgets and expired formation never restarts',async()=>{
  const {createBudget}=await support;
  let time=100;
  const b=createBudget(()=>time);
  time=1250.8;
  assert.deepEqual(b.helloBudgets(),{row:58849,formation:8849});
  time=10100;
  assert.throws(()=>b.requireFormation(),/formation/);
  assert.throws(()=>b.helloBudgets(),/formation/);
  time=45100;
  assert.throws(()=>b.measurement(15000),/budget/);
});

test('creation attempts are consumed before effects, failed attempts cannot retry or exceed row roles',async()=>{
  const {createAttempts}=await support;
  const a=createAttempts('detached-abort');
  for(const role of ['driver','witness','helper','root','child'])a.take(role);
  assert.equal(a.count,5);
  assert.throws(()=>a.take('child'));
  assert.throws(()=>a.take('controller'));
});

test('detached outcome requires original deadline, aborted proof and independent actual exits',async()=>{
  const {assessOutcome}=await support;
  const witness={ok:true,cleanup:false,exited:['root','child','helper'],created:1};
  const proof=job();
  assert.equal(assessOutcome('detached-abort',{expectedBinding:binding,closeError:'run-job-deadline',proof,witness,pipeEof:true}).ok,true);
  for(const mutation of [{closeError:null},{closeError:'unrelated'},{proof:{...proof,aborted:false}},{witness:{...witness,cleanup:true}},{witness:{...witness,exited:['root','helper']}},{pipeEof:false}])assert.equal(assessOutcome('detached-abort',{expectedBinding:binding,closeError:'run-job-deadline',proof,witness,pipeEof:true,...mutation}).ok,false);
});

test('normal and abort evidence require selected binding and positive original timing, never synthetic Browser ACK',async()=>{
  const {assessOutcome}=await support;
  for(const name of ['pipe-exit','detached-abort']){
    const data={expectedBinding:binding,proof:job(name==='detached-abort'),closeError:name==='detached-abort'?'run-job-deadline':undefined,pipeEof:true,witness:{ok:true,cleanup:false,created:name==='pipe-exit'?0:1,exited:name==='pipe-exit'?['root','helper']:['root','helper','child']}};
    assert.equal(assessOutcome(name,data).ok,true);assert.equal(assessOutcome(name,data).browserCloseAcknowledged,undefined);
    for(const patch of [{binding:undefined},{binding:{...binding,helperPid:44}},{timing:undefined},{timing:{budgetMs:15000,remainingBeforeMs:15001,remainingAfterMs:1}},{timing:{budgetMs:15000,remainingBeforeMs:1,remainingAfterMs:0}},{timing:{budgetMs:15000,remainingBeforeMs:1,remainingAfterMs:2}}])assert.equal(assessOutcome(name,{...data,proof:{...data.proof,...patch}}).ok,false);
    assert.equal(assessOutcome(name,{...data,expectedBinding:undefined}).ok,false);
  }
});

test('pipe-exit still fails when the final Job total is two despite observed shutdown',async()=>{
  const {assessOutcome}=await support;
  const data={expectedBinding:binding,proof:{...job(false),total:2},pipeEof:true,
    witness:{ok:true,cleanup:false,created:0,exited:['root','helper']}};
  const result=assessOutcome('pipe-exit',data);
  assert.equal(result.ok,false);
  assert.equal(result.normalShutdown,false);
  assert.equal(result.proof.total,2);
});

test('owner death requires owner-loss error plus the complete retained HANDLE witness, never cleanup success',async()=>{
  const {assessOutcome}=await support;
  const data={controllerExit:{code:91,signal:null},witness:{ok:true,cleanup:false,exited:['controller','helper','root','child'],created:1},pipeEof:true};
  assert.equal(assessOutcome('controller-death',data).ok,true);
  for(const mutation of [{controllerExit:null},{controllerExit:{}},{controllerExit:{code:0,signal:null}},{controllerExit:{code:92,signal:null}},{controllerExit:{code:null,signal:'SIGTERM'}},{witness:{...data.witness,exited:['root','child','controller']}},{witness:{...data.witness,cleanup:true}}])assert.equal(assessOutcome('controller-death',{...data,...mutation}).ok,false);
});

test('detached measurement preserves close failure and invokes abort once without resetting original row clock',async()=>{
  const {measureCase,createBudget}=await support;
  let now=0,aborts=0; const calls=[];
  const result=await measureCase('detached-abort',{
    binding,
    arm:async()=>calls.push('arm'),go:async remaining=>calls.push(remaining),
    close:async deadline=>{assert.equal(deadline,15000);now=15000;throw Error('run-job-deadline');},
    abort:async()=>{aborts++;now=15001;return job();},
    witness:async()=>({ok:true,cleanup:false,created:1,exited:['root','child','helper']}),
    eof:async()=>true,
  },createBudget(()=>now));
  assert.equal(result.ok,true);assert.equal(result.closeError,'run-job-deadline');assert.equal(aborts,1);
  assert.deepEqual(calls,['arm',35000]);
});

test('late close failure cannot buy a new abort window',async()=>{
  const {measureCase,createBudget}=await support;
  let now=0,aborts=0;
  await assert.rejects(measureCase('detached-abort',{
    arm:async()=>{},go:async()=>{},close:async()=>{now=40000;throw Error('run-job-deadline');},
    abort:async()=>{aborts++;},
  },createBudget(()=>now)),/budget/);
  assert.equal(aborts,0);
});

test('abort failure retains the original expected close failure and cannot become cleanup success',async()=>{
  const {measureCase,createBudget}=await support;let now=0;
  await assert.rejects(measureCase('detached-abort',{
    binding,arm:async()=>{},go:async()=>{},close:async()=>{now=15000;throw Error('run-job-deadline');},
    abort:async()=>{throw Error('run-job-abort-unconfirmed');},
  },createBudget(()=>now)),error=>error.message==='run-job-abort-unconfirmed'&&error.measurement?.closeError==='run-job-deadline');
});

test('fixture identities require the exact nonce, ready identity and bounded native format',async()=>{
  const {parseIdentity}=await support;
  const nonce='a'.repeat(64);
  assert.deepEqual(parseIdentity(`ROOT\t42\t0000000000000001\t${nonce}`,'ROOT',nonce),{pid:42,created:'0000000000000001'});
  for(const line of [`ROOT\t0\t0000000000000001\t${nonce}`,`ROOT\t42\t0000000000000001\twrong`,`CHILD\t42\t0000000000000001\t${nonce}`,`ROOT\t42\t0000000000000000\t${nonce}`])assert.throws(()=>parseIdentity(line,'ROOT',nonce));
});

test('cleanup confirms only the complete attempted identity set, never an empty or partial HANDLE subset',async()=>{
  const {cleanupCoverage}=await support;
  const roles=['driver','witness','helper','root','child'];
  const witness={cleanupConfirmed:true,exit:{code:1,signal:null},identities:['helper','root','child'].map((role,index)=>({role,pid:40+index,created:'0123456789abcdef',confirmed:true})),exited:['helper','root','child']};
  assert.equal(cleanupCoverage(roles,witness),true);
  for(const patch of [{identities:[]},{identities:witness.identities.slice(0,2)},{exited:['helper','root']},{exit:null},{identities:witness.identities.map(i=>({...i,confirmed:false}))},{identities:witness.identities.map(i=>({...i,pid:40}))}])assert.equal(cleanupCoverage(roles,{...witness,...patch}),false);
  assert.equal(cleanupCoverage([...roles,'controller'],witness),false);
  assert.equal(cleanupCoverage(roles,null),false);
});
