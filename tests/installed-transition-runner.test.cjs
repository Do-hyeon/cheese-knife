const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { fork, spawnSync, execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const subject = () => import('../scripts/check-installed-transition.mjs');
const nonce = '0123456789abcdef0123456789abcdef';
const root = 'output/playwright/installed-transition-work-fixture';
function childFixture() {
  const child = new EventEmitter(); child.pid = 12345; child.exitCode = null; child.signalCode = null;
  child.connected = true; child.sent = [];
  child.send = (message, callback) => { child.sent.push(message); callback?.(); };
  child.disconnect = () => { child.connected = false; };
  return child;
}
const intent = () => ({ type: 'launch-intent', nonce, caseId: 'valid-ui', phase: 'seed', launchId: 'valid-ui:seed', root });
const close = () => ({ ...intent(), type: 'close-success' });
const roots = [{ caseId: 'valid-ui', root }];
function exit(child, code = 0) { child.exitCode = code; child.emit('exit', code, null); child.emit('close',code,null); }

async function cleanupDescendantFixture({owner,terminate,removable,remove,diagnostic,originalCode}) {
  let parentError;
  try { await terminate(); } catch(error) { parentError=error; }
  let descendantCleanup;
  try { descendantCleanup=await owner.cleanup(); }
  catch { descendantCleanup={confirmed:false,errors:['control-cleanup-error']}; }
  const canRemove=removable&&!parentError&&descendantCleanup.confirmed;
  diagnostic({code:'transition-fixture-cleanup',originalCode,termination:parentError?.termination,descendantCleanup,ownedRootRetained:!canRemove});
  if(canRemove)await remove();
  if(parentError)throw parentError;
  assert.equal(descendantCleanup.confirmed,true,'fixture descendant cleanup remains unconfirmed; root retained');
}

// All control-channel tests use simulated sockets, clocks and PID queries: no OS effects.
function controlLab() {
  let time=0, serial=0, presence='alive', probeEffect=()=>{}; const timers=new Map(), probes=[];
  const clock={now:()=>time,setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),setInterval(){return ++serial;}};
  const server=new EventEmitter();server.listen=(_name,fn)=>fn();server.close=fn=>{server.closed=true;fn?.();};
  const net={createServer(fn){server.accept=fn;return server;}};
  const probe=pid=>{probes.push(pid);probeEffect();if(presence!=='alive')throw Object.assign(Error('private-sentinel'),{code:presence});};
  const socket=()=>{const s=new EventEmitter();s.sent=[];s.write=data=>{s.sent.push(JSON.parse(data));return true;};s.destroy=()=>{if(!s.closed){s.closed=true;s.emit('close');}};s.end=s.destroy;return s;};
  return {clock,net,probe,probes,server,socket,setPresence(value){presence=value;},
    jump(ms){time+=ms;},setProbeEffect(fn){probeEffect=fn;},
    advance(ms){const end=time+ms;while(true){const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;time=due[1].at;timers.delete(due[0]);due[1].fn();}time=end;},
    connect(owner,role,pid=42,override={}){const s=socket();server.accept(s);s.emit('data',Buffer.from(JSON.stringify({...owner.descriptor,role,pid,...override})+'\n'));if(role==='parent')s.emit('data',Buffer.from('{"type":"spawned","pid":42}\n'));return s;},
    async owner(){return require('./fixtures/installed-extension/transition-child.cjs').createFixtureOwner({root:'/synthetic-owned-root',registrationMs:2000,net,clock,probe});}};
}
function registered(lab,owner){const parent=lab.connect(owner,'parent'),descendant=lab.connect(owner,'descendant');
  descendant.emit('data',Buffer.from('{"type":"ready"}\n'));return {parent,descendant};}

test('fixture control binds two roles and waits for descendant ready before parent release',async()=>{
  const lab=controlLab(),owner=await lab.owner(),parent=lab.connect(owner,'parent'),descendant=lab.connect(owner,'descendant');
  assert.deepEqual(parent.sent,[{type:'parent-registered'}]);assert.equal(descendant.sent[0].type,'registered');
  descendant.emit('data',Buffer.from('{"type":"ready"}\n'));
  assert.equal(parent.sent[1].type,'release');assert.equal(owner.registered,true);assert.deepEqual(lab.probes,[42]);
  const before=descendant.sent.length;lab.advance(2000);assert.equal(descendant.sent.length,before);
  const pending=owner.cleanup();assert.equal(descendant.sent.at(-1).type,'stop');
  assert.equal(owner.cleanup(),pending);assert.equal(descendant.sent.filter(x=>x.type==='stop').length,1);
  descendant.emit('data',Buffer.from('{"type":"stopped"}\n'));descendant.destroy();parent.destroy();
  let done=false;pending.then(()=>done=true);await Promise.resolve();assert.equal(done,false,'ACK and EOF are not process absence');
  lab.setPresence('ESRCH');lab.advance(50);const result=await pending;
  assert.equal(result.absent,true);assert.equal(result.confirmed,true);assert.equal(lab.server.closed,true);
});
for(const mutation of ['pid','root','token','generation','duplicate','overflow','initial-query'])test('fixture control refuses '+mutation,async()=>{
  const lab=controlLab(),owner=await lab.owner();lab.connect(owner,'parent');
  if(mutation==='initial-query')lab.setPresence('EPERM');
  const extra=mutation==='pid'?{pid:43}:['root','token','generation'].includes(mutation)?{[mutation]:'wrong'}:{};
  const child=lab.connect(owner,'descendant',42,extra);
  if(mutation==='duplicate')lab.connect(owner,'parent');
  if(mutation==='overflow')child.emit('data',Buffer.alloc(1048577,65));
  const resultPromise=owner.cleanup();lab.advance(5000);const result=await resultPromise;
  assert.equal(result.confirmed,false);assert.ok(result.errors.length);assert.equal(JSON.stringify(result).includes('private-sentinel'),false);
});
for(const presence of ['alive','EPERM'])test('fixture control preserves unknown/reused PID after EOF: '+presence,async()=>{
  const lab=controlLab(),owner=await lab.owner(),{parent,descendant}=registered(lab,owner);
  const pending=owner.cleanup();descendant.destroy();parent.destroy();lab.setPresence(presence);lab.advance(4999);
  let settled=false;pending.then(()=>settled=true);await Promise.resolve();assert.equal(settled,false);
  lab.advance(1);const result=await pending;assert.equal(result.confirmed,false);assert.equal(result.absent,false);
  lab.setPresence('ESRCH');lab.advance(5000);assert.equal(result.absent,false,'late absence cannot rewrite snapshot');
});
test('fixture control hang already absent sends no stop; early loss cannot pass exit witness',async()=>{
  for(const fence of ['before','after','none']){
    const lab=controlLab(),owner=await lab.owner(),{parent,descendant}=registered(lab,owner);
    if(fence==='before')owner.expectTreeTermination();
    descendant.destroy();parent.destroy();lab.setPresence('ESRCH');
    if(fence==='after')owner.expectTreeTermination();
    const result=await owner.cleanup();assert.equal(result.confirmed,fence==='before');
    assert.equal(descendant.sent.filter(x=>x.type==='stop').length,0);
  }
});
test('fixture control registration timeout closes channels and never becomes registered late',async()=>{
  const lab=controlLab(),owner=await lab.owner(),parent=lab.connect(owner,'parent');lab.advance(2000);
  assert.equal(parent.closed,true);assert.equal(owner.registered,false);
  const pending=owner.cleanup();lab.advance(5000);assert.equal((await pending).confirmed,false);
});
test('fixture control bounds listen startup and cancels a late listen without releasing a witness',async()=>{
  const lab=controlLab();let listenCallback;lab.server.listen=(_name,fn)=>{listenCallback=fn;};
  const pending=lab.owner();let rejected=false;pending.catch(()=>{rejected=true;});lab.advance(2000);
  await new Promise(setImmediate);assert.equal(rejected,true,'listen must share original registration deadline');
  await assert.rejects(pending,/control-registration-timeout/);assert.equal(lab.server.closed,true);
  listenCallback();assert.deepEqual(lab.probes,[]);
});
test('fixture control rejects probe results returned after registration or cleanup cutoff',async()=>{
  for(const stage of ['registration','stop','absence']){
    const lab=controlLab(),owner=await lab.owner();
    if(stage==='registration'){
      lab.setProbeEffect(()=>lab.jump(2001));registered(lab,owner);assert.equal(owner.registered,false);
      const pending=owner.cleanup();lab.advance(5000);assert.equal((await pending).confirmed,false);continue;
    }
    const {parent,descendant}=registered(lab,owner);
    if(stage==='stop')lab.setProbeEffect(()=>lab.jump(5001));
    const pending=owner.cleanup();
    if(stage==='absence'){parent.destroy();descendant.destroy();lab.advance(50);lab.setPresence('ESRCH');lab.setProbeEffect(()=>lab.jump(5001));lab.advance(50);}
    const result=await pending;assert.equal(result.confirmed,false);assert.equal(result.absent,false);
    if(stage==='stop')assert.equal(result.stopSent,false);
  }
});
test('fixture control waits for server closure inside the same cutoff and ignores late absence/close',async()=>{
  for(const late of ['server','absence']){
    const lab=controlLab(),owner=await lab.owner(),{parent,descendant}=registered(lab,owner);let closeServer;
    lab.server.close=fn=>{closeServer=fn;};const pending=owner.cleanup();parent.destroy();descendant.destroy();
    if(late==='server'){lab.setPresence('ESRCH');lab.advance(50);}
    lab.advance(late==='server'?4949:4999);let done=false;pending.then(()=>done=true);await Promise.resolve();assert.equal(done,false);
    if(late==='absence')lab.setPresence('ESRCH');lab.advance(1);const result=await pending;
    assert.equal(result.confirmed,false);if(late==='absence')assert.equal(result.absent,false);
    closeServer?.();assert.equal(result.confirmed,false);
  }
});
test('fixture control binds descendant arriving before spawned report and rejects role substitution',async()=>{
  const lab=controlLab(),owner=await lab.owner(),parent=lab.socket();lab.server.accept(parent);
  parent.emit('data',Buffer.from(JSON.stringify({...owner.descriptor,role:'parent',pid:8})+'\n'));
  const descendant=lab.connect(owner,'descendant');assert.deepEqual(descendant.sent,[]);
  parent.emit('data',Buffer.from('{"type":"spawned","pid":42}\n'));assert.equal(descendant.sent[0].type,'registered');
  descendant.emit('data',Buffer.from('{"type":"ready"}\n'));assert.equal(owner.registered,true);
  const pending=owner.cleanup();parent.destroy();descendant.destroy();lab.setPresence('ESRCH');lab.advance(50);assert.equal((await pending).confirmed,true);
  const second=controlLab(),other=await second.owner();second.connect(other,'parent',8,{parentToken:other.descriptor.token});
  const failed=other.cleanup();second.advance(5000);assert.equal((await failed).confirmed,false);
});
test('fixture control rejects unsolicited or duplicate stop ACK without requiring an ACK for absence',async()=>{
  for(const mutation of ['early','duplicate']){
    const lab=controlLab(),owner=await lab.owner(),{parent,descendant}=registered(lab,owner);
    if(mutation==='early')descendant.emit('data',Buffer.from('{"type":"stopped"}\n'));
    const pending=owner.cleanup();
    if(mutation==='duplicate')descendant.emit('data',Buffer.from('{"type":"stopped"}\n{"type":"stopped"}\n'));
    parent.destroy();descendant.destroy();lab.setPresence('ESRCH');lab.advance(50);
    const result=await pending;assert.equal(result.confirmed,false);assert.ok(result.errors.includes('control-protocol'));
  }
});

test('fixture control clients preserve launch ACK then authenticated spawn then ready/release sequence',()=>{
  const {runFixtureParent}=require('./fixtures/installed-extension/transition-child.cjs');
  for(const mode of ['exit','hang','pipe']){
    const lab=controlLab(),socket=lab.socket(),runtime=new EventEmitter(),events=[];
    Object.assign(runtime,{pid:8,execPath:'node',stderr:{marker:'inherited-stderr'},send:m=>events.push(m),exit:code=>events.push({exit:code}),disconnect(){}});
    const descriptor={root:'/owned',endpoint:'local',parentToken:'parent-secret',token:'child-secret',generation:'fresh',registrationMs:2000};
    let spawnOptions,childArgs;
    runFixtureParent({process:runtime,clock:lab.clock,connect:()=>socket,writeFileSync:()=>events.push('pid-file'),
      spawn:(_exe,args,options)=>{childArgs=args;spawnOptions=options;events.push('spawn');return {pid:42,unref:()=>events.push('unref')};}});
    runtime.emit('message',{nonce,root:'/owned',mode,control:descriptor});assert.equal(events[0].type,'launch-intent');assert.equal(spawnOptions,undefined);
    runtime.emit('message',{...events[0],type:'launch-ack'});socket.emit('connect');assert.equal(socket.sent[0].role,'parent');assert.equal(spawnOptions,undefined);
    socket.emit('data',Buffer.from('{"type":"parent-registered"}\n'));
    assert.equal(spawnOptions.detached,true);assert.deepEqual(spawnOptions.stdio,mode==='pipe'?['ignore','ignore',runtime.stderr]:'ignore');
    assert.equal(JSON.stringify(childArgs).includes('parent-secret'),false);assert.equal(socket.sent.at(-1).type,'spawned');assert.equal(events.some(x=>x.exit===0),false);
    socket.emit('data',Buffer.from('{"type":"release"}\n'));assert.equal(events.some(x=>x.exit===0),mode!=='hang');
    assert.equal(socket.closed,true);lab.advance(2000);assert.equal(events.some(x=>x.exit===1),false);
  }
});
test('fixture control descendant self exits on owner loss or bootstrap failure and stops once after ready',()=>{
  const {runFixtureDescendant}=require('./fixtures/installed-extension/transition-child.cjs');
  for(const reason of ['stop','loss','timeout','invalid']){
    const lab=controlLab(),socket=lab.socket(),exits=[],runtime={pid:42,exit:code=>exits.push(code)};
    runFixtureDescendant({descriptor:{endpoint:'local',root:'/owned',token:'secret',generation:'g',registrationMs:2000},process:runtime,clock:lab.clock,connect:()=>socket});
    socket.emit('connect');assert.equal(socket.sent[0].pid,42);
    if(reason==='timeout')lab.advance(2000);
    else if(reason==='invalid')socket.emit('data',Buffer.from('{"type":"stop"}\n'));
    else {socket.emit('data',Buffer.from('{"type":"registered"}\n'));assert.equal(socket.sent.at(-1).type,'ready');lab.advance(10000);assert.deepEqual(exits,[]);
      if(reason==='loss')socket.destroy();else {socket.emit('data',Buffer.from('{"type":"stop"}\n'));socket.emit('data',Buffer.from('{"type":"stop"}\n'));}}
    assert.deepEqual(exits,[reason==='stop'?0:1]);
  }
});
test('fixture control hook preserves primary error, still attempts descendant cleanup and retains uncertain root',async()=>{
  for(const kind of ['parent-failed','both-throw','descendant-failed','parent-unclosed','assertion-failed','confirmed']){
    const events=[],original=Object.assign(Error('original'),{termination:{outcome:'unconfirmed'}});
    const work=()=>cleanupDescendantFixture({
      owner:{async cleanup(){events.push('descendant');if(kind==='both-throw')throw Error('private-sentinel');return {confirmed:kind!=='descendant-failed',errors:kind==='descendant-failed'?['absence']:[]};}},
      terminate:async()=>{events.push('parent');if(kind==='parent-failed'||kind==='both-throw')throw original;},
      removable:kind!=='parent-unclosed'&&kind!=='assertion-failed',remove:async()=>events.push('remove'),diagnostic:entry=>events.push(entry),originalCode:'original-failure'});
    if(kind==='parent-failed'||kind==='both-throw')await assert.rejects(work,error=>error===original);
    else if(kind==='descendant-failed')await assert.rejects(work,/cleanup remains unconfirmed/);
    else await work();
    assert.deepEqual(events.slice(0,2),['parent','descendant']);assert.equal(events.includes('remove'),kind==='confirmed');
    assert.equal(events[2].originalCode,'original-failure');assert.equal(events[2].ownedRootRetained,kind!=='confirmed');
  }
});

test('supervisor drains late bounded stderr and waits for actual close',async()=>{
  const {superviseTransitionChild}=await subject(),child=childFixture();child.stderr=new EventEmitter();
  const pending=superviseTransitionChild({child,nonce,roots,deadlineMs:500});
  child.emit('message',{type:'result',nonce,result:{}});child.exitCode=0;child.emit('exit',0,null);
  let settled=false;pending.then(()=>{settled=true;});await Promise.resolve();assert.equal(settled,false);
  child.stderr.emit('data',Buffer.alloc(5000,97));child.emit('close',0,null);
  const result=await pending;assert.equal(result.normalExit,true);
  assert.deepEqual(result.childProcess,{exitObserved:true,exitCode:0,signal:null,closeConfirmed:true,stderr:'a'.repeat(4096),stderrTruncated:true});
});

test('stop waits for pending kill rejection even after close and preserves original diagnostic',async()=>{
  const {superviseTransitionChild}=await subject(),child=childFixture();let rejectKill,kills=0;
  const pending=superviseTransitionChild({child,nonce,roots,deadlineMs:10,killChild:()=>{kills++;return new Promise((_,reject)=>{rejectKill=reject;});}});
  child.emit('message',{type:'failure',nonce,failure:{code:'original'}});
  while(!rejectKill)await new Promise(resolve=>setTimeout(resolve,5));
  exit(child,1);let settled=false;pending.then(()=>{settled=true;});await Promise.resolve();assert.equal(settled,false);
  rejectKill(new TypeError('kill-sentinel'));const result=await pending;
  assert.equal(kills,1);assert.equal(result.failure.code,'original');assert.equal(result.childProcess.closeConfirmed,true);
  assert.equal(result.cleanupErrors[0].diagnostic.name,'TypeError');assert.equal(result.cleanupErrors[0].diagnostic.message,'kill-sentinel');
});

test('actual CJS eval forks real runner without eval code and preserves flags',()=>{
  const code=`(async()=>{const m=await import('./scripts/check-installed-transition.mjs');const child=m.forkTransitionChild();const result=await m.superviseTransitionChild({child,nonce:'a'.repeat(32),roots:[],deadlineMs:10000});process.stdout.write(JSON.stringify({args:child.spawnargs,result}));})().catch(e=>{console.error(e);process.exitCode=1;});`;
  // Send on spawn: invalid schema is rejected in the real child before any browser launch.
  const source=code.replace('const result=await','child.send({nonce:"a".repeat(32),mediaSchema:"invalid",roots:[],candidateIds:[]});const result=await');
  const run=spawnSync(process.execPath,['--trace-warnings','-e',source],{encoding:'utf8',timeout:20000});
  assert.equal(run.status,0,run.stderr);const {args,result}=JSON.parse(run.stdout);
  assert.ok(args.includes('--trace-warnings'));assert.ok(args.some(arg=>arg.endsWith('check-installed-transition.mjs')));assert.ok(!args.includes(source));
  assert.equal(result.childProcess.closeConfirmed,true);assert.equal(result.childProcess.exitObserved,true);
  assert.equal(result.result.failure.code,'transition-scenario-invalid');assert.equal(result.failure.code,'transition-scenario-invalid');
});

for(const flag of ['--input-type=module','--input_type=module','--input-type','--input_type'])test('module eval parent is explicitly rejected before allocation: '+flag,()=>{
  const args=flag.includes('=')?[flag]:[flag,'module'];
  const code=`import('./scripts/check-installed-transition.mjs').then(async m=>{for(const work of [()=>m.forkTransitionChild(),()=>m.runInstalledTransition({runId:'InputType',dependencies:{openRepository(){throw Error('allocated');}}})]){try{await work();throw Error('not-rejected');}catch(e){if(e.code!=='transition-parent-input-type')throw e;}}console.log('rejected');}).catch(e=>{console.error(e);process.exitCode=1;});`;
  const run=spawnSync(process.execPath,[...args,'-e',code],{encoding:'utf8',timeout:10000});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/rejected/);
});

test('F01 supervisor checks occurrence plus assigned payload role and all three shutdown facts',async()=>{
  const {superviseTransitionChild}=await subject();const child=childFixture(),assigned=[{caseId:'valid-v1',kind:'f01',mediaCase:'valid-v1',root}];
  const pending=superviseTransitionChild({child,nonce,roots:assigned,mediaSchema:'f01',deadlineMs:500});
  for(const [launchOccurrence,[phase,payload]]of [['seed','published'],['old','f00'],['new','f01'],['rollback','f00'],['new','f01'],['rollback','published'],['new','f01'],['rollback','published'],['new','f01']].entries()){
    const request={type:'launch-intent',nonce,caseId:'valid-v1',phase,payload,launchOccurrence,launchId:`valid-v1:${launchOccurrence}:${phase}`,root};
    child.emit('message',request);assert.deepEqual(child.sent.at(-1),{...request,type:'launch-ack'});
    child.emit('message',{...request,type:'close-success',shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}});
  }
  child.emit('message',{type:'result',nonce,result:{mediaSchema:'f01'}});exit(child);const result=await pending;
  assert.equal(result.failure,null);assert.equal(result.launches.length,9);assert.equal(result.launches[5].payload,'published');
});
for(const fault of ['payload','occurrence','close-payload','close-proof'])test('F01 supervisor rejects wrong '+fault,async()=>{
  const {superviseTransitionChild}=await subject(),child=childFixture(),assigned=[{caseId:'absent',kind:'f01',mediaCase:'absent',root}];
  const pending=superviseTransitionChild({child,nonce,roots:assigned,mediaSchema:'f01',deadlineMs:500});
  const request={...intent(),caseId:'absent',payload:'published',launchOccurrence:0,launchId:'absent:0:seed'};
  child.emit('message',fault==='payload'?{...request,payload:'f01'}:fault==='occurrence'?{...request,launchOccurrence:1,launchId:'absent:1:seed'}:request);
  if(fault.startsWith('close'))child.emit('message',{...request,type:'close-success',...(fault==='close-payload'?{payload:'f00'}:{}),shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:fault!=='close-proof'}});
  exit(child);assert.ok((await pending).failure);
});

test('media supervisor accepts exact seed plus four occurrences and requires three close facts',async()=>{
  const {superviseTransitionChild}=await subject(),child=childFixture();
  const pending=superviseTransitionChild({child,nonce,roots,scenario:'media-preservation',deadlineMs:500});
  for(const [launchOccurrence,phase] of ['seed','old','new','rollback','new'].entries()){
    const request={type:'launch-intent',nonce,caseId:'valid-ui',phase,launchOccurrence,launchId:`valid-ui:${launchOccurrence}:${phase}`,root};
    child.emit('message',request);assert.deepEqual(child.sent.at(-1),{...request,type:'launch-ack'});
    child.emit('message',{...request,type:'close-success',shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}});
  }
  child.emit('message',{type:'result',nonce,result:{scenario:'media-preservation'}});exit(child);const result=await pending;
  assert.equal(result.failure,null);assert.equal(result.launches.length,5);assert.deepEqual(result.unconfirmedRoots,[]);
});
for(const fault of ['skipped','duplicate','missing-proof','missing-root','unclosed'])test('media supervisor rejects '+fault+' before another launch',async()=>{
  const {superviseTransitionChild}=await subject(),child=childFixture();const pending=superviseTransitionChild({child,nonce,roots,scenario:'media-preservation',deadlineMs:500});
  const first={...intent(),launchOccurrence:0,launchId:'valid-ui:0:seed'};child.emit('message',fault==='skipped'?{...first,launchOccurrence:1,launchId:'valid-ui:1:seed'}:first);
  if(fault!=='skipped')assert.equal(child.sent.length,1,'valid first intent must actually be admitted');
  if(fault==='duplicate')child.emit('message',first);
  if(fault==='missing-proof')child.emit('message',{...first,type:'close-success'});
  if(fault==='missing-root')child.emit('message',{...first,type:'close-success',shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:false}});
  const before=child.sent.length;child.emit('message',{...first,phase:'old',launchOccurrence:1,launchId:'valid-ui:1:old'});
  assert.equal(child.sent.length,before);exit(child);assert.ok((await pending).failure);
});

test('supervisor requires matching close ACK, result and actual normal exit', async () => {
  const { superviseTransitionChild } = await subject(); const child = childFixture();
  const pending = superviseTransitionChild({ child, nonce, roots, control: 'storage-loss', deadlineMs: 500 });
  child.emit('message', intent());
  assert.deepEqual(child.sent, [{ ...intent(), type: 'launch-ack' }]);
  child.emit('message', close()); child.emit('message', { type: 'result', nonce, result: { marker: 'actual' } });
  let finished = false; pending.then(() => { finished = true; }); await Promise.resolve(); assert.equal(finished, false);
  exit(child);
  const result = await pending;
  assert.equal(result.result.marker, 'actual'); assert.equal(result.failure, null);
  assert.deepEqual(result.unconfirmedRoots, []); assert.equal(result.normalExit, true);
});

for (const mutation of ['duplicate-intent', 'wrong-root', 'wrong-nonce', 'wrong-close', 'duplicate-close', 'result-before-close', 'missing-result', 'abnormal-exit']) {
  test(`supervisor rejects ${mutation} rather than treating child exit as cleanup`, async () => {
    const { superviseTransitionChild } = await subject(); const child = childFixture();
    const pending = superviseTransitionChild({ child, nonce, roots, deadlineMs: 500 });
    if (mutation === 'wrong-root') child.emit('message', { ...intent(), root: '../other' });
    else if (mutation === 'wrong-nonce') child.emit('message', { ...intent(), nonce: 'bad' });
    else {
      child.emit('message', intent());
      if (mutation === 'duplicate-intent') child.emit('message', intent());
      if (mutation === 'wrong-close') child.emit('message', { ...close(), launchId: 'other' });
      if (mutation !== 'result-before-close') child.emit('message', close());
      if (mutation === 'duplicate-close') child.emit('message', close());
      if (mutation !== 'missing-result') child.emit('message', { type: 'result', nonce, result: {} });
    }
    exit(child, mutation === 'abnormal-exit' ? 1 : 0);
    const result = await pending;
    assert.ok(result.failure, mutation); assert.notEqual(result.failure.code, 'transition-storage-preservation');
    if (mutation === 'result-before-close') assert.deepEqual(result.unconfirmedRoots, [root]);
  });
}

test('supervisor deadline/kill failure is bounded and preserves unconfirmed launch root', async () => {
  const { superviseTransitionChild } = await subject(); const child = childFixture(); let killed = false;
  const pending = superviseTransitionChild({ child, nonce, roots, deadlineMs: 20,
    killChild: async target => { assert.equal(target, child); killed = true; throw Error('kill-failed'); } });
  child.emit('message', intent()); const result = await pending;
  assert.equal(killed, true); assert.equal(result.failure.code, 'transition-child-timeout');
  assert.equal(result.normalExit, false); assert.deepEqual(result.unconfirmedRoots, [root]);
  assert.equal(result.cleanupErrors[0].code, 'transition-kill-failed');
});

test('failure is retained through close and result instead of losing captured storage observation', async () => {
  const { superviseTransitionChild } = await subject(); const child = childFixture();
  const pending = superviseTransitionChild({ child, nonce, roots, deadlineMs: 500 });
  child.emit('message', intent());
  const failure = { code: 'transition-storage-preservation', caseId: 'valid-ui', phase: 'new', step: 'startup', stage: 'candidate-init', observation: { raw: {} }, cleanupErrors: [],diagnostic:{name:'TypeError',message:'sentinel-original',native:{message:'sentinel-original'}} };
  child.emit('message', { type: 'failure', nonce, failure }); child.emit('message', close());
  child.emit('message', { type: 'result', nonce, result: {} }); exit(child);
  const result = await pending; assert.deepEqual(result.failure, failure); assert.deepEqual(result.unconfirmedRoots, []);
});

test('test-only manifests change only two fields and loss insertion keeps background intact', async () => {
  const { phasePayload } = await subject();
  const { readPublishedPayload } = await import('../scripts/extension-e2e/published-payload.mjs');
  const payload = await readPublishedPayload();
  const original = structuredClone(payload);
  const input = payload.entries.find(e => e.name === 'manifest.json').bytes;
  for (const [phase, version] of [['old', '2.13.3'], ['new', '2.13.4'], ['rollback', '2.13.5']]) {
    const entries = phasePayload(payload, phase, phase === 'new' ? 'storage-loss' : undefined);
    const manifest = JSON.parse(entries.find(e => e.name === 'manifest.json').bytes);
    const originalManifest = JSON.parse(input);
    assert.equal(manifest.version, version);
    assert.equal(manifest.version.split('.').length, 3);
    if (phase !== 'old') assert.equal(manifest.version_name, `AF05-B2 TEST ONLY ${phase}`);
    delete manifest.version; delete manifest.version_name; delete originalManifest.version; delete originalManifest.version_name;
    assert.deepEqual(manifest, originalManifest);
    for (const entry of payload.entries) {
      if (entry.name === 'manifest.json' || (phase === 'new' && entry.name === 'settings-broker.js')) continue;
      assert.deepEqual(entries.find(e => e.name === entry.name).bytes, entry.bytes);
    }
    assert.deepEqual(entries.find(e => e.name === 'background.js').bytes, payload.entries.find(e => e.name === 'background.js').bytes);
  }
  assert.deepEqual(payload.entries.map(e => [...e.bytes]), original.entries.map(e => [...e.bytes]));
  const bad = { ...payload, entries: payload.entries.map(e => e.name === 'settings-broker.js' ? { ...e, bytes: Buffer.from('no marker') } : e) };
  assert.throws(() => phasePayload(bad, 'new', 'storage-loss'), { code: 'transition-control-preparation' });
});

test('loss control requires exact raw config removal at candidate-init with revision nonce and cleanup', async () => {
  const { matchesStorageLoss } = await subject();
  const raw = { styles: ['future-style', 'hide-ranking', 'chat-font-size'], styleParameters: { future: 9, 'chat-font-size': 8 },
    settingsRevision: 8, futureTop: { runNonce: nonce, untouched: true } };
  const failure = { code: 'transition-storage-preservation', caseId: 'valid-ui', phase: 'new', step: 'startup',
    stage: 'candidate-init', observation: { raw, execution: { extensionId: 'a'.repeat(32), version: '2.13.4', brokerMatches: true } }, cleanupErrors: [],pageErrors:[],routeErrors:[],errorsTruncated:false,errorsComplete:true };
  assert.equal(matchesStorageLoss(failure, nonce, 'a'.repeat(32)), true);
  for (const mutate of [v => { v.stage = 'phase-action'; }, v => { v.caseId = 'legacy-null'; }, v => { v.phase = 'old'; },
    v => { delete v.observation; }, v => { v.observation.raw.config = {}; }, v => { v.observation.raw.settingsRevision = 0; },
    v => { v.observation.raw.futureTop.runNonce = 'bad'; }, v => { v.cleanupErrors.push({ code: 'close-failed' }); },
    v => { v.code = 'transition-action-timeout'; }]) {
    const value = structuredClone(failure); mutate(value); assert.equal(matchesStorageLoss(value, nonce, 'a'.repeat(32)), false);
  }
});

test('loss admission refuses missing or wrong execution provenance', async () => {
  const { matchesStorageLoss } = await subject();
  const raw = { styles: ['future-style', 'hide-ranking', 'chat-font-size'], styleParameters: { future: 9, 'chat-font-size': 8 },
    settingsRevision: 8, futureTop: { runNonce: nonce, untouched: true } };
  const id = 'a'.repeat(32);
  const failure = { code: 'transition-storage-preservation', caseId: 'valid-ui', phase: 'new', step: 'startup', stage: 'candidate-init',
    observation: { raw, execution: { extensionId: id, version: '2.13.4', brokerMatches: true } }, cleanupErrors: [],pageErrors:[],routeErrors:[],errorsTruncated:false,errorsComplete:true };
  assert.equal(matchesStorageLoss(failure, nonce, id), true);
  for (const change of [v => { delete v.observation.execution; }, v => { v.observation.execution.version = '2.13.3'; },
    v => { v.observation.execution.extensionId = 'b'.repeat(32); }, v => { v.observation.execution.brokerMatches = false; }]) {
    const value = structuredClone(failure); change(value); assert.equal(matchesStorageLoss(value, nonce, id), false);
  }
});

test('protocol failure after expected loss is retained as a disqualifying secondary error', async () => {
  const { superviseTransitionChild } = await subject(); const child = childFixture();
  const pending = superviseTransitionChild({ child, nonce, roots, deadlineMs: 500 });
  child.emit('message', intent());
  child.emit('message', { type: 'failure', nonce, failure: { code: 'transition-storage-preservation' } });
  child.emit('message', close()); child.emit('message', close());
  child.emit('message', { type: 'result', nonce, result: {} }); exit(child);
  const value = await pending;
  assert.equal(value.failure.code, 'transition-storage-preservation');
  assert.ok(value.secondaryErrors.some(error => error.code === 'transition-ipc'));
});

for (const mode of ['exit', 'hang']) test(`real detached descendant ${mode} never proves browser close`, async t => {
  const { superviseTransitionChild, terminateTransitionChild } = await subject();
  const parent = path.resolve('output'); await fs.mkdir(parent, { recursive: true });
  const absolute = await fs.mkdtemp(path.join(parent, 'transition-descendant-'));
  const owner = await require('./fixtures/installed-extension/transition-child.cjs').createFixtureOwner({root:absolute,registrationMs:mode==='hang'?2000:5000});
  let child, supervision, checked = false;
  t.after(async () => {
    await cleanupDescendantFixture({owner,originalCode:supervision?.failure?.code,
      terminate:async()=>{if(child&&(supervision?.childProcess?.termination||child.exitCode===null&&child.signalCode===null))await terminateTransitionChild(child);},
      removable:checked&&supervision?.childProcess?.exitObserved&&supervision.childProcess.closeConfirmed,
      remove:()=>fs.rm(absolute,{recursive:true,force:true}),diagnostic:entry=>t.diagnostic(JSON.stringify(entry))});
  });
  child = fork('tests/fixtures/installed-extension/transition-child.cjs', [], { detached: process.platform !== 'win32',
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
  // The test's absolute root is sent explicitly, never discovered through general process scanning.
  const pending = superviseTransitionChild({ child, nonce, roots: [{ caseId: 'valid-ui', root: absolute }], deadlineMs: mode === 'hang' ? 2000 : 5000,
    killChild:(target,options)=>{if(process.platform==='win32'&&mode==='hang')owner.expectTreeTermination();return terminateTransitionChild(target,options);} });
  child.send({ nonce, root: absolute, mode, control:owner.descriptor });
  const result = supervision = await pending;
  t.diagnostic(JSON.stringify({code:'transition-fixture-observation',mode,supervision:result,
    descendantPidFile:await fs.readFile(path.join(absolute,'descendant.pid'),'utf8').catch(()=>null)}));
  assert.equal(owner.registered,true,'original descendant witness must actually form');
  assert.ok(result.failure); assert.deepEqual(result.unconfirmedRoots, [absolute]);
  assert.ok(![result.failure,...result.secondaryErrors].some(error=>error?.code==='transition-ipc'));
  assert.ok(await fs.stat(absolute));
  checked = true;
});

for(const mode of ['stderr-exit','signal'])test('actual child records '+mode,async()=>{
  const {superviseTransitionChild}=await subject();const child=fork('tests/fixtures/installed-extension/transition-child.cjs',[],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
  child.on('message',message=>{if(message.type==='signal-ready')child.kill('SIGTERM');});
  const pending=superviseTransitionChild({child,nonce,roots,deadlineMs:3000});child.send({nonce,root,mode});const result=await pending;
  assert.equal(result.childProcess.exitObserved,true);assert.equal(result.childProcess.closeConfirmed,true);assert.equal(result.normalExit,false);
  assert.equal(result.childProcess.exitCode,child.exitCode);assert.equal(result.childProcess.signal,child.signalCode);
  if(mode==='stderr-exit'){assert.equal(result.childProcess.stderr,'bootstrap-sentinel');assert.equal(result.childProcess.exitCode,7);}
  else assert.equal(result.childProcess.signal,'SIGTERM');
});

test('actual pipe-held descendant cannot keep parent CLI alive beyond shared grace',async t=>{
  await fs.mkdir('output',{recursive:true});const directory=await fs.mkdtemp(path.resolve('output/transition-pipe-'));
  const owner=await require('./fixtures/installed-extension/transition-child.cjs').createFixtureOwner({root:directory,registrationMs:10000});
  t.after(async()=>{
    // The immutable pipe counterexample lacks parent close proof; never delete its root.
    await cleanupDescendantFixture({owner,terminate:async()=>{},removable:false,remove:async()=>{},diagnostic:entry=>t.diagnostic(JSON.stringify(entry))});});
  const code=`(async()=>{const {fork}=require('node:child_process'),{superviseTransitionChild}=await import('./scripts/check-installed-transition.mjs');const child=fork('tests/fixtures/installed-extension/transition-child.cjs',[],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});const pending=superviseTransitionChild({child,nonce:${JSON.stringify(nonce)},roots:[{caseId:'valid-ui',root:${JSON.stringify(directory)}}],deadlineMs:10000});child.send({nonce:${JSON.stringify(nonce)},root:${JSON.stringify(directory)},mode:'pipe',control:${JSON.stringify(owner.descriptor)}});console.log(JSON.stringify(await pending));})().catch(e=>{console.error(e);process.exitCode=1;});`;
  const started=Date.now(),run=await new Promise(resolve=>execFile(process.execPath,['-e',code],{encoding:'utf8',timeout:12000,windowsHide:true},(error,stdout,stderr)=>resolve({error,stdout,stderr})));
  t.diagnostic(JSON.stringify({code:'transition-fixture-observation',mode:'pipe',stdout:run.stdout,stderr:run.stderr,
    descendantPidFile:await fs.readFile(path.join(directory,'descendant.pid'),'utf8').catch(()=>null)}));
  assert.equal(run.error===null,true,'pipe CLI failed; raw command omitted');assert.ok(Date.now()-started<10000);const result=JSON.parse(run.stdout);
  assert.equal(owner.registered,true);
  assert.equal(result.childProcess.exitObserved,true);assert.equal(result.childProcess.closeConfirmed,false);
  assert.ok([result.failure,...result.secondaryErrors].some(e=>e.code==='transition-child-close-unconfirmed'));
  assert.ok(![result.failure,...result.secondaryErrors].some(error=>error?.code==='transition-ipc'));
});

test('runner CLI refuses control/profile/source overrides and static tool rules remain unchanged', async () => {
  await subject();
  for (const argument of ['--profile=C:/Users/User', '--source=dist', '--control=other']) {
    const result = spawnSync(process.execPath, ['scripts/check-installed-transition.mjs', argument], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /installed-e2e-args-invalid|transition-control-invalid/);
  }
  const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--config', 'eslint.security.config.mjs',
    '--no-inline-config', '--max-warnings=0', '--format=json', 'scripts/check-installed-transition.mjs'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('parent refuses missing/mutated final evidence even when child result claims success', async () => {
  const { validateTransitionResult } = await subject();
  for (const result of [{}, { source: {}, after: {}, seeds: [], phases: [], cleanupErrors: [] }]) {
    assert.throws(() => validateTransitionResult(result, nonce, undefined, []), { code: 'transition-result-incomplete' });
  }
});

test('parent revalidates every action observation identity hash and no-reseed sequence', async () => {
  const { validateTransitionResult } = await subject();
  const { expectedTransitionState, transitionSeed } = await import('../scripts/extension-e2e/transition-scenario.mjs');
  const id = 'a'.repeat(32), hash = '1'.repeat(64);
  const steps = ['startup', 'arrow-off', 'volume25', 'hide-ranking-on', 'font8', 'font8'];
  const records = steps.map((step, index) => ({ step, ...(index === 5 ? { reloaded: true } : {}),
    observation: expectedTransitionState('valid-ui', 'old', step, nonce, id, { reloaded: index === 5, reloads: index === 5 ? [1, 0] : [0, 0] }) }));
  const result = { source: { sourceCommit: 'a'.repeat(40) }, after: { sourceCommit: 'a'.repeat(40) }, candidateInventory: hash,
    seeds: [{ caseId: 'valid-ui', raw: transitionSeed('valid-ui', nonce), extensionId: id, writes: 1,
      preparation: { developerMode: true, workerClosed: true, extensionId: id, version: '2.13.3', state: 'ENABLED' } }],
    phases: [{ caseId: 'valid-ui', phase: 'old', records, final: records.at(-1).observation, extensionId: id, inventorySha256: hash, manifestSha256: hash,pageErrors:[],routeErrors:[],errorsTruncated:false,errorsComplete:true,
      preparation: { developerMode: true, workerClosed: true, extensionId: id, version: '2.13.3', state: 'ENABLED' } }] };
  const launches = ['seed', 'old', 'new'].map(phase => ({ caseId: 'valid-ui', phase }));
  assert.equal(validateTransitionResult(result, nonce, 'storage-loss', launches), undefined);
  for (const mutate of [v => { v.seeds[0].writes = 2; }, v => { v.phases[0].records.pop(); },
    v => { v.phases[0].records[1].observation.raw.config.futureFlag = 'lost'; },
    v => { v.phases[0].records[1].observation.runtime.ready = false; },
    v => { v.phases[0].extensionId = 'b'.repeat(32); }, v => { v.phases[0].manifestSha256 = ''; },
    v => { v.after.sourceCommit = 'b'.repeat(40); }, v => { v.phases[0].records[5].observation.css.reloads = [1, 1]; },
    v => { v.seeds[0].preparation.developerMode = false; }, v => { v.phases[0].preparation.workerClosed = false; },
    v => { v.phases[0].preparation.version = '2.13.4'; },v=>{v.phases[0].pageErrors.push('page');},v=>{v.phases[0].routeErrors.push('route');},
    v=>{delete v.phases[0].errorsComplete;},v=>{v.phases[0].errorsTruncated=true;}]) {
    const value = structuredClone(result); mutate(value); assert.throws(() => validateTransitionResult(value, nonce, 'storage-loss', launches));
  }
});

function parentFixture(fault) {
  const events = [], child = childFixture(); let serial = 0;
  const directories = new Set();
  const files = {
    root: path.resolve('.'),
    async ensureDirectory(name) { events.push(`ensure:${name}`); directories.add(name);return path.join(this.root, name); },
    async lstat(name) { return (fault === 'artifact-exists' && name.includes('installed-extension-transition')) ||
      (fault === 'candidate-exists' && name.includes('p02-candidate')) ? {} : fault==='retention-missing'&&name.includes('installed-transition-work-')?null:directories.has(name)?{isDirectory:()=>true}:null; },
    async writeFile(name) { events.push(`write:${name}`); if ((fault === 'summary' && name.endsWith('summary.json')) ||
      (fault === 'claim' && name.endsWith('.lock'))) throw Object.assign(Error(fault), { code: `test-${fault}` }); },
    async makeTempDirectory() { events.push('root-create'); if (fault === 'root') throw Object.assign(Error('root'), { code: 'test-root' });
      const relative=`output/playwright/installed-transition-work-fixture${serial++}`;directories.add(relative);return path.join(this.root, relative); },
    async removeTree(name) { events.push(`remove:${name}`); if (fault === 'cleanup' && name.includes('installed-transition-work')) throw Object.assign(Error('cleanup'), { code: 'test-cleanup' }); },
  };
  const dependencies = {
    openRepository: async () => files, forkChild: () => { events.push('fork'); return child; },
    removeCandidate: async id => { events.push(`candidate-remove:${id}`); },
    supervise: async () => { await new Promise(resolve => setImmediate(resolve));
      const options = child.sent[0];
      return { failure: { code: 'test-phase', caseId: 'valid-ui', phase: 'new', step: 'startup', stage: 'candidate-init', observation: { raw: {} }, cleanupErrors: [] },
        result: { source: { sourceCommit: 'a'.repeat(40) }, after: { sourceCommit: 'a'.repeat(40) }, cleanupErrors: [] },
        unconfirmedRoots: fault === 'unconfirmed' ? [options.roots[0].root] : [], normalExit: true, launches: [] };
    },
  };
  return { events, dependencies };
}

test('general transition retention reaches child and preserves confirmed roots and candidates on failure',async()=>{
  const {runInstalledTransition}=await subject(),f=parentFixture('phase');let sent;
  const fork=f.dependencies.forkChild;f.dependencies.forkChild=()=>{const child=fork(),send=child.send;child.send=(message,callback)=>{sent=message;send(message,callback);};return child;};
  await assert.rejects(runInstalledTransition({runId:'Retained',retainEvidence:true,dependencies:f.dependencies}),error=>{
    assert.equal(sent.retainEvidence,true);assert.ok(error.report.retainedRoots.length>0);assert.equal(error.report.candidatesRetained,true);return true;
  });
  assert.equal(f.events.some(x=>x.startsWith('candidate-remove:')||x.startsWith('remove:output/playwright/installed-transition-work-')),false);
  assert.ok(f.events.some(x=>x.endsWith('.lock')&&x.startsWith('remove:')));
});

test('transition rejects invalid retention before opening a repository',async()=>{
  const {runInstalledTransition}=await subject();
  await assert.rejects(runInstalledTransition({runId:'Retained',retainEvidence:'yes',dependencies:{openRepository:async()=>{throw Error('must-not-open');}}}),{code:'transition-retention-invalid'});
});

test('retention cannot claim a root which disappeared after normal closure',async()=>{
  const {runInstalledTransition}=await subject(),f=parentFixture('retention-missing');
  await assert.rejects(runInstalledTransition({runId:'RetainedMissing',retainEvidence:true,dependencies:f.dependencies}),error=>{
    assert.equal(error.report.retainedRoots.length,0);assert.ok(error.report.cleanupErrors.some(x=>x.code==='transition-evidence-missing'));return true;
  });
});

test('F01 retention cannot claim disappeared candidates as retained',async()=>{
  const {runInstalledTransition}=await subject(),fixture=parentFixture('phase'),open=fixture.dependencies.openRepository;
  fixture.dependencies.openRepository=async()=>{const files=await open(),stat=files.lstat;files.lstat=async(name,options)=>
    name.includes('p02-candidate')&&fixture.events.includes('fork')?null:stat(name,options);return files;};
  await assert.rejects(runInstalledTransition({runId:'F01MissingCandidates',mediaSchema:'f01',retainEvidence:true,dependencies:fixture.dependencies}),error=>{
    assert.equal(error.report.candidatesRetained,false);assert.deepEqual(error.report.retainedCandidates,[]);
    assert.equal(error.report.cleanupErrors.filter(row=>row.code==='transition-evidence-missing').length,2);return true;
  });
});

for(const retainEvidence of [false,true])test(`transition final writer preserves original phase and evidence when retention=${retainEvidence}`,async()=>{
  const {runInstalledTransition}=await subject(),fixture=parentFixture('summary');
  await assert.rejects(runInstalledTransition({runId:'TransitionWriter',retainEvidence,dependencies:fixture.dependencies}),error=>{
    assert.equal(error.code,'test-phase');assert.equal(error.cause.code,'test-phase');assert.equal(error.report.ok,false);
    assert.equal(error.report.failure.caseId,'valid-ui');assert.equal(error.report.secondaryErrors.at(-1).code,'test-summary');
    if(retainEvidence)assert.ok(error.report.retainedRoots.length>0);return true;
  });
});

test('transition writer failure remains visible at the secondary-error bound',async()=>{
  const {runInstalledTransition}=await subject(),fixture=parentFixture('summary'),supervise=fixture.dependencies.supervise;
  fixture.dependencies.supervise=async options=>({...await supervise(options),secondaryErrors:Array.from({length:32},(_,index)=>({code:'earlier-'+index}))});
  await assert.rejects(runInstalledTransition({runId:'BoundedWriter',dependencies:fixture.dependencies}),error=>{
    assert.equal(error.report.secondaryErrors.length,32);assert.equal(error.report.secondaryErrors[0].code,'earlier-0');
    assert.equal(error.report.secondaryErrors.at(-1).code,'test-summary');assert.equal(error.cause.code,'test-phase');return true;
  });
});

test('F01 parent assigns every fixed case and retains its own roots and candidates after failure',async()=>{
  const {runInstalledTransition}=await subject(),fixture=parentFixture('phase');
  await assert.rejects(runInstalledTransition({runId:'F01parent',mediaSchema:'f01',dependencies:fixture.dependencies}),error=>{
    assert.equal(error.report.retainedRoots.length,11);assert.equal(error.report.mediaSchema,'f01');assert.equal(error.report.candidatesRetained,true);return true;
  });
  assert.equal(fixture.events.some(value=>value.startsWith('candidate-remove:')||value.startsWith('remove:output/playwright/installed-transition-work-')),false);
  for(const options of [{mediaSchema:'unknown'},{mediaSchema:'f01',scenario:'media-preservation'},{mediaSchema:'f01',control:'media-profile-loss'}]){
    await assert.rejects(runInstalledTransition({runId:'F01bad',...options,dependencies:fixture.dependencies}),/transition-(scenario|control)-invalid/);
  }
});

test('parent storage-loss PASS is vetoed by a later protocol or inventory fault', async () => {
  const { runInstalledTransition } = await subject();
  const { expectedTransitionState, transitionSeed, expectedTransitionRaw } = await import('../scripts/extension-e2e/transition-scenario.mjs');
  for (const later of [null, 'protocol', 'inventory','final-page','final-route','final-missing']) {
    const fixture = parentFixture('phase'), child = childFixture(), id = 'a'.repeat(32), hash = '1'.repeat(64);
    fixture.dependencies.forkChild = () => child;
    fixture.dependencies.supervise = async () => {
      await new Promise(resolve => setImmediate(resolve)); const options = child.sent[0], n = options.nonce;
      const steps = ['startup', 'arrow-off', 'volume25', 'hide-ranking-on', 'font8', 'font8'];
      const records = steps.map((step, i) => ({ step, ...(i === 5 ? { reloaded: true } : {}), observation: expectedTransitionState('valid-ui', 'old', step, n, id,
        { reloaded: i === 5, reloads: i === 5 ? [1, 0] : [0, 0] }) }));
      const raw = expectedTransitionRaw('valid-ui', 'old', 'font8', n); delete raw.config;
      const state={ failure: { code: 'transition-storage-preservation', caseId: 'valid-ui', phase: 'new', step: 'startup', stage: 'candidate-init', cleanupErrors: [],
        pageErrors:[],routeErrors:[],errorsTruncated:false,errorsComplete:true,
        observation: { raw, execution: { extensionId: id, version: '2.13.4', brokerMatches: true } } },
        result: { source: { sourceCommit: 'a'.repeat(40) }, after: { sourceCommit: 'a'.repeat(40) }, candidateInventory: hash,
          seeds: [{ caseId: 'valid-ui', raw: transitionSeed('valid-ui', n), extensionId: id, writes: 1,
            preparation: { developerMode: true, workerClosed: true, extensionId: id, version: '2.13.3', state: 'ENABLED' } }],
          phases: [{ caseId: 'valid-ui', phase: 'old', records, final: records.at(-1).observation, extensionId: id, inventorySha256: hash, manifestSha256: hash,pageErrors:[],routeErrors:[],errorsTruncated:false,errorsComplete:true,
            preparation: { developerMode: true, workerClosed: true, extensionId: id, version: '2.13.3', state: 'ENABLED' } }],
          secondaryErrors: later === 'inventory' ? [{ code: 'transition-inventory' }] : [], cleanupErrors: [] },
        secondaryErrors: later === 'protocol' ? [{ code: 'transition-ipc' }] : [], cleanupErrors: [], normalExit: true, unconfirmedRoots: [],
        launches: ['seed', 'old', 'new'].map(phase => ({ caseId: 'valid-ui', phase })) };
      state.result.failure=JSON.parse(JSON.stringify(state.failure));
      if(later==='final-page')state.result.failure.pageErrors.push('sentinel-final-page');
      if(later==='final-route')state.result.failure.routeErrors.push('sentinel-final-route');
      if(later==='final-missing')delete state.result.failure.errorsComplete;
      return state;
    };
    if (!later) assert.equal((await runInstalledTransition({ runId: 'Control1', control: 'storage-loss', dependencies: fixture.dependencies })).ok, true);
    else await assert.rejects(runInstalledTransition({ runId: 'Control1', control: 'storage-loss', dependencies: fixture.dependencies }), error => {
      assert.equal(error.report.ok, false);assert.equal(error.report.failure.code,'transition-storage-preservation');
      assert.ok(error.report.secondaryErrors.length>=1,'the later veto reason must survive beside the first expected loss');return true;
    });
  }
});

for (const fault of ['artifact-exists', 'candidate-exists', 'claim', 'root', 'phase', 'cleanup', 'summary', 'unconfirmed']) {
  test(`parent ${fault} never deletes an existing target or reports control PASS`, async () => {
    const { runInstalledTransition } = await subject(); const fixture = parentFixture(fault);
    await assert.rejects(runInstalledTransition({ runId: 'Fault1', dependencies: fixture.dependencies }), error => {
      assert.notEqual(error.report?.ok, true);
      if (fault === 'cleanup') { assert.equal(error.code, 'test-phase'); assert.ok(error.report.cleanupErrors.some(e => e.code === 'test-cleanup')); }
      if (fault === 'unconfirmed') assert.equal(error.report.retainedRoots.length, 1);
      return true;
    });
    if (['artifact-exists', 'claim', 'candidate-exists'].includes(fault)) {
      assert.equal(fixture.events.includes('fork'), false);
      assert.equal(fixture.events.some(e => e.startsWith('candidate-remove')), false);
    }
    if (fault === 'unconfirmed') {
      assert.equal(fixture.events.includes('remove:output/playwright/installed-transition-work-fixture0'), false);
      assert.equal(fixture.events.includes('remove:output/playwright/installed-transition-work-fixture1'), true);
    }
  });
}

test('media parent admits four observations and exact loss only, with later failures vetoing PASS', async () => {
  const { runInstalledTransition } = await subject();
  const api = await import('../scripts/extension-e2e/transition-scenario.mjs');
  for (const mode of ['positive','positive-final', 'loss', 'protocol', 'inventory', 'cleanup', 'unclosed', 'wrong-occurrence', 'timeout']) {
    const fixture = parentFixture('phase'), child = childFixture(), id = 'a'.repeat(32), hash = '1'.repeat(64);
    fixture.dependencies.forkChild = () => child;
    fixture.dependencies.supervise = async supplied => {
      assert.equal(supplied.scenario, 'media-preservation');
      await new Promise(resolve => setImmediate(resolve));
      const options = child.sent[0], n = options.nonce, presetId = '11111111-1111-4111-8111-111111111111';
      assert.equal(options.roots.length, 1); assert.equal(options.scenario, 'media-preservation');
      const store = api.expectedInstalledMediaStore(n, presetId), seed = api.transitionSeed('valid-ui', n);
      const prepare = version => ({ developerMode: true, workerClosed: true, extensionId: id, version, state: 'ENABLED' });
      const result = { scenario: 'media-preservation', source: { sourceCommit: 'a'.repeat(40) }, after: { sourceCommit: 'a'.repeat(40) },
        candidateInventory: hash, seeds: [{ caseId: 'valid-ui', raw: seed, writes: 1, extensionId: id, preparation: prepare('2.13.3') }], phases: [] };
      for (const [index, phase] of api.MEDIA_TRANSITION_PHASES.entries()) {
        const occurrence = index + 1, version = phase === 'old' ? '2.13.3' : phase === 'rollback' ? '2.13.5' : '2.13.4';
        if (!mode.startsWith('positive') && occurrence === 4) break;
        const observation = withStore => ({ raw: { ...structuredClone(seed), ...(withStore ? { mediaProfiles: structuredClone(store) } : {}) },
          execution: { extensionId: id, version, brokerMatches: true } });
        const initial = observation(occurrence >= 3), final = observation(occurrence >= 2);
        const records = [{ step: 'startup', observation: initial }, ...(occurrence === 2 ? [{ step: 'create-media', observation: final }] : []),
          { step: 'observe-ui', observation: final }];
        result.phases.push({ caseId: 'valid-ui', phase, launchOccurrence: occurrence, extensionId: id, inventorySha256: hash, manifestSha256: hash,pageErrors:[],routeErrors:[],errorsTruncated:false,errorsComplete:true,
          preparation: prepare(version), records, final, presetId: occurrence >= 2 ? presetId : undefined });
      }
      const launches = ['seed', ...api.MEDIA_TRANSITION_PHASES].map((phase, launchOccurrence) => ({ caseId: 'valid-ui', phase, launchOccurrence,
        launchId: `valid-ui:${launchOccurrence}:${phase}`, closed: true,
        shutdown: { browserCloseAcknowledged: true, browserDisconnected: true, ownedRootClosed: mode !== 'unclosed' } }));
      if(mode==='positive-final')result.failure={code:'sentinel-final-only',diagnostic:{name:'TypeError',message:'actual final cause'}};
      const state={ result, launches, normalExit: true, unconfirmedRoots: mode === 'unclosed' ? [options.roots[0].root] : [],
        secondaryErrors: mode === 'protocol' ? [{ code: 'transition-ipc' }] : [], cleanupErrors: mode === 'cleanup' ? [{ code: 'close' }] : [],
        ...(mode.startsWith('positive') ? {} : { failure: { code: mode === 'timeout' ? 'media-ui-timeout' : 'media-preservation', caseId: 'valid-ui', phase: 'new',pageErrors:[],routeErrors:[],errorsTruncated:false,errorsComplete:true,
          launchOccurrence: mode === 'wrong-occurrence' ? 2 : 4, step: 'startup', stage: 'candidate-init', cleanupErrors: [],
          observation: { raw: { ...seed, mediaProfiles: api.expectedInstalledMediaLoss(store) }, execution: { extensionId: id, version: '2.13.4', brokerMatches: true } } } }),
        ...(mode === 'inventory' ? { result: { ...result, secondaryErrors: [{ code: 'transition-inventory' }] } } : {}) };
      if(state.failure)state.result.failure=JSON.parse(JSON.stringify(state.failure));return state;
    };
    const options = { runId: 'Media1', scenario: 'media-preservation', dependencies: fixture.dependencies,
      ...(mode.startsWith('positive') ? {} : { control: 'media-profile-loss' }) };
    if (['positive', 'loss'].includes(mode)) {
      const report=await runInstalledTransition(options);assert.equal(report.ok,true);
      assert.equal(report.shutdown.normalExit,true);assert.equal(report.shutdown.closes.length,5);
      assert.ok(report.shutdown.closes.every(value=>value.closed&&value.browserCloseAcknowledged&&value.browserDisconnected&&value.ownedRootClosed));
    }
    else await assert.rejects(runInstalledTransition(options), error => error.report?.ok === false);
    assert.equal(fixture.events.some(value => value.startsWith('candidate-remove:')), false);
    assert.equal(fixture.events.some(value => value.startsWith('remove:output/playwright/installed-transition-work-')), false);
  }
});

test('media selectors reject duplicate unknown incompatible and source/profile overrides before launch', () => {
  for (const args of [ ['--scenario=other'], ['--scenario=media-preservation', '--scenario=media-preservation'],
    ['--control=media-profile-loss'], ['--scenario=media-preservation', '--control=storage-loss'],
    ['--scenario=media-preservation', '--control=media-profile-loss', '--control=media-profile-loss'],
    ['--scenario=media-preservation', '--qualification=media-tab'], ['--scenario=media-preservation', '--profile=C:/Users/User'] ]) {
    const result = spawnSync(process.execPath, ['scripts/check-installed-transition.mjs', ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /transition-scenario-invalid|transition-control-invalid|installed-e2e-args-invalid/);
  }
});

// Capture execFile before importing the real terminator; no OS process is created by these tests.
let terminationModule = 0;
async function terminationFixture(t) {
  const cp = require('node:child_process'), { syncBuiltinESMExports } = require('node:module');
  const original = cp.execFile, calls = [];
  cp.execFile = (file, args, options, callback) => { calls.push({ file, args, options, callback }); calls.onInvoke?.(callback); return {}; };
  syncBuiltinESMExports();
  let api;
  try { api = await import(`../scripts/check-installed-transition.mjs?termination=${++terminationModule}`); }
  finally { cp.execFile = original; syncBuiltinESMExports(); }
  const implementation = api;
  api = { ...implementation,
    terminateTransitionChild: (child, options) => implementation.terminateTransitionChild(child, { platform: 'win32', ...options }),
    superviseTransitionChild: options => implementation.superviseTransitionChild({ ...options,
      killChild: (child, options) => implementation.terminateTransitionChild(child, { platform: 'win32', ...options }) }) };
  // Windows and POSIX branches must both be harmless on any host running the suite.
  t.mock.method(process, 'kill', () => { throw Error('unexpected OS kill'); });
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  const flush = async () => { for (let n = 0; n < 16; n++) await Promise.resolve(); };
  return { api, calls, flush, child: childFixture() };
}
for (const stage of ['command-pending', 'exit-pending', 'close-pending']) test(`termination cutoff preserves ${stage} without retry or late rewrite`, async t => {
  const { api, calls, flush, child } = await terminationFixture(t);
  const first = api.terminateTransitionChild(child), observed = first.catch(error => error);
  const second = api.terminateTransitionChild(child); second.catch(() => {});
  await flush(); assert.equal(calls.length, 1);
  if (stage !== 'command-pending') { calls[0].callback(null, 'private stdout', 'private stderr'); await flush(); }
  if (stage === 'close-pending') { child.exitCode = 1; child.emit('exit', 1, null); }
  t.mock.timers.tick(4999); await flush();
  let settled = false; observed.then(() => { settled = true; }); await flush(); assert.equal(settled, false);
  t.mock.timers.tick(1); await flush(); const failure = await observed;
  assert.equal(failure.code, 'transition-kill-failed'); assert.equal(failure.termination.stage, stage);
  assert.equal(failure.termination.outcome, 'unconfirmed'); assert.ok(Object.isFrozen(failure.termination));
  assert.ok(Object.isFrozen(failure.termination.command));
  const saved = JSON.stringify(failure.termination);
  if (stage === 'command-pending') calls[0].callback(Object.assign(Error('private command'), { code: 'PRIVATE', stdout: 'private stdout' }));
  child.exitCode = 0; child.emit('exit', 0, null); child.emit('close', 0, null); await flush();
  assert.equal(JSON.stringify(failure.termination), saved); assert.equal(saved.includes('private'), false);
  assert.equal(await api.terminateTransitionChild(child).catch(error => error), failure);
  assert.equal(first, second); assert.equal(calls.length, 1);
});
test('termination completion preserves command exit and close before the original cutoff', async t => {
  const { api, calls, flush, child } = await terminationFixture(t);
  const pending = api.terminateTransitionChild(child); await flush();
  assert.equal(calls[0].options.timeout, 5000); assert.equal(calls[0].options.windowsHide, true);
  t.mock.timers.tick(4999); calls[0].callback(null, 'private', 'private'); exit(child, 1); await flush();
  const result = await pending;
  assert.equal(result.outcome, 'completed'); assert.equal(result.stage, 'settled');
  assert.equal(result.exitObserved, true); assert.equal(result.closeConfirmed, true);
  assert.equal(result.command.outcome, 'succeeded'); assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(await api.terminateTransitionChild(child), result); assert.equal(calls.length, 1);
});
test('termination command failure is sanitized and never retried after late exit', async t => {
  const { api, calls, flush, child } = await terminationFixture(t);
  const pending = api.terminateTransitionChild(child).catch(error => error); await flush();
  calls[0].callback(Object.assign(Error('private path'), { code: 5, signal: 'SIGTERM', stdout: 'private', stderr: 'private' })); await flush();
  const error = await pending; assert.equal(error.code, 'transition-kill-failed');
  assert.equal(error.termination.command.exitCode, 5); assert.equal(error.termination.command.signal, 'SIGTERM');
  assert.equal(error.termination.outcome, 'failed'); assert.equal(JSON.stringify(error).includes('private'), false);
  exit(child, 0); assert.equal(await api.terminateTransitionChild(child).catch(e => e), error); assert.equal(calls.length, 1);
});
test('termination expired shared cutoff never starts a command or renews the budget', async t => {
  const { api, calls, flush, child } = await terminationFixture(t);
  t.mock.timers.tick(5000);
  const pending = api.terminateTransitionChild(child, { deadline: 5000 }).catch(error => error); await flush();
  t.mock.timers.tick(5000); await flush(); const failure = await pending;
  assert.equal(calls.length, 0); assert.equal(failure.termination.attempted, false);
  assert.equal(failure.termination.outcome, 'unconfirmed');
  assert.equal(await api.terminateTransitionChild(child).catch(error => error), failure);
});
test('supervisor serializes the shared cutoff outcome and ignores late command failure', async t => {
  const { api, calls, flush, child } = await terminationFixture(t);
  const pending = api.superviseTransitionChild({ child, nonce, roots, deadlineMs: 10 });
  child.emit('message', intent()); child.emit('message', { type: 'failure', nonce, failure: { code: 'original' } });
  t.mock.timers.tick(10); await flush(); assert.equal(calls.length, 1);
  t.mock.timers.tick(5000); await flush(); const result = await pending;
  assert.equal(result.failure.code, 'original'); assert.equal(result.normalExit, false);
  assert.deepEqual(result.unconfirmedRoots, [root]);
  assert.equal(result.childProcess.termination.stage, 'command-pending');
  assert.equal(result.childProcess.termination.outcome, 'unconfirmed');
  const saved = JSON.stringify(result); calls[0].callback(Error('private late failure')); exit(child, 0); await flush();
  assert.equal(JSON.stringify(result), saved); assert.equal(saved.includes('private'), false);
  const error = await api.terminateTransitionChild(child).catch(error => error);
  assert.deepEqual(error.termination, result.childProcess.termination); assert.equal(calls.length, 1);
});

test('supervisor snapshot is detached and frozen before a late launch ACK failure', async t => {
  const { api, calls, flush, child } = await terminationFixture(t); let ack;
  child.send = (_message, callback) => { ack = callback; };
  const pending = api.superviseTransitionChild({ child, nonce, roots, deadlineMs: 10 });
  child.emit('message', intent());
  t.mock.timers.tick(10); await flush(); t.mock.timers.tick(5000); await flush();
  const report = await pending, saved = JSON.stringify(report);
  assert.ok(Object.isFrozen(report)); assert.ok(Object.isFrozen(report.secondaryErrors));
  assert.ok(Object.isFrozen(report.childProcess));
  ack(Error('private late ACK')); calls[0].callback(Error('private late kill')); await flush();
  assert.equal(JSON.stringify(report), saved); assert.equal(saved.includes('private'), false);
});
test('termination at cutoff cannot change an unconfirmed outcome to completion', async t => {
  const { api, calls, flush, child } = await terminationFixture(t);
  const pending = api.terminateTransitionChild(child).catch(error => error); await flush();
  // Advance the clock before callbacks, independently of the timer queue order.
  t.mock.timers.setTime(5000); calls[0].callback(null, '', ''); exit(child, 0); await flush();
  const failure = await pending; assert.equal(failure.termination.outcome, 'unconfirmed');
  assert.equal(failure.termination.stage, 'command-pending');
});
test('termination shares an earlier grace deadline and retains events seen before invocation', async t => {
  const { api, calls, flush, child } = await terminationFixture(t);
  t.mock.timers.tick(4000);
  const pending = api.terminateTransitionChild(child, { deadline: 5000 }).catch(error => error); await flush();
  assert.equal(calls[0].options.timeout, 1000); t.mock.timers.tick(1000); await flush();
  assert.equal((await pending).termination.outcome, 'unconfirmed');
  const already = childFixture(); already.exitCode = 0;
  const done = await api.terminateTransitionChild(already, { observed: { exitObserved: true, exitCode: 0, signal: null, closeConfirmed: true } });
  assert.equal(done.outcome, 'completed'); assert.equal(done.attempted, false); assert.equal(done.command.outcome, 'not-needed');
  assert.equal(calls.length, 1);
});
test('termination does not infer close from exit and rejects private command metadata', async t => {
  const { api, calls, flush, child } = await terminationFixture(t);
  child.exitCode = 0; const pending = api.terminateTransitionChild(child).catch(error => error);
  t.mock.timers.tick(5000); await flush(); const failure = await pending;
  assert.equal(failure.termination.stage, 'close-pending'); assert.equal(failure.termination.closeConfirmed, false); assert.equal(calls.length, 0);
  const next = childFixture(), errorPromise = api.terminateTransitionChild(next).catch(error => error); await flush();
  calls[0].callback(Object.assign(Error('private'), { code: 'private', signal: 'private', status: 'private', stdout: 'private', stderr: 'private' })); await flush();
  const error = await errorPromise; assert.equal(error.termination.command.reason, 'command-failed'); assert.equal(JSON.stringify(error).includes('private'), false);
});

test('termination caches before synchronous command callbacks and exit events', async t => {
  const { api, calls, flush, child } = await terminationFixture(t); let reentrant;
  calls.onInvoke = callback => { reentrant = api.terminateTransitionChild(child); callback(null, '', ''); exit(child, 1); };
  const first = api.terminateTransitionChild(child); await flush();
  assert.equal(first, reentrant); assert.equal((await first).outcome, 'completed'); assert.equal(calls.length, 1);
  assert.equal(child.listenerCount('exit'), 0); assert.equal(child.listenerCount('close'), 0);
});
test('parent saves the real supervisor cutoff snapshot without removing uncertain assets', async t => {
  const { api, calls, flush, child } = await terminationFixture(t), fixture = parentFixture('phase'); let saved;
  const open = fixture.dependencies.openRepository;
  fixture.dependencies.openRepository = async () => { const files = await open(), write = files.writeFile;
    files.writeFile = async (name, text) => { if (name.endsWith('summary.json')) saved = text; return write(name, text); }; return files; };
  fixture.dependencies.forkChild = () => child;
  fixture.dependencies.supervise = options => api.superviseTransitionChild({ ...options, deadlineMs: 10 });
  child.send = (message, callback) => {
    if (!message.type) {
      child.emit('message', { type: 'launch-intent', nonce: message.nonce, ...message.roots[0], phase: 'seed', payload: 'published', launchOccurrence: 0, launchId: message.roots[0].caseId + ':0:seed' });
      child.emit('message', { type: 'failure', nonce: message.nonce, failure: { code: 'original' } });
    }
    callback?.();
  };
  const pending = api.runInstalledTransition({ runId: 'TerminationReport', mediaSchema: 'f01', dependencies: fixture.dependencies }).catch(error => error);
  for (let n = 0; n < 10; n++) await flush();
  t.mock.timers.tick(10); await flush(); assert.equal(calls.length, 1);
  t.mock.timers.tick(5000); await flush(); const error = await pending, disk = JSON.parse(saved);
  assert.equal(error.code, 'original'); assert.equal(disk.ok, false); assert.equal(disk.shutdown.normalExit, false);
  assert.equal(disk.childProcess.termination.stage, 'command-pending'); assert.equal(disk.retainedRoots.length, 11);
  assert.deepEqual(disk.childProcess.termination, error.report.childProcess.termination);
  assert.equal(fixture.events.some(row => row.startsWith('candidate-remove:') || row.startsWith('remove:output/playwright/installed-transition-work-')), false);
  const before = JSON.stringify(error.report); calls[0].callback(Error('private late command')); exit(child, 0); await flush();
  assert.equal(JSON.stringify(error.report), before); assert.equal(JSON.parse(saved).childProcess.termination.outcome, 'unconfirmed');
});

test('termination POSIX primitive is injected without sending a real signal', async t => {
  const { api, calls, flush, child } = await terminationFixture(t); const signals = [];
  t.mock.method(process, 'kill', (pid, signal) => { signals.push([pid, signal]); return true; });
  const pending = api.terminateTransitionChild(child, { platform: 'linux' }); await flush(); exit(child, 1); await flush();
  assert.equal((await pending).outcome, 'completed'); assert.deepEqual(signals, [[-12345, 'SIGKILL']]); assert.equal(calls.length, 0);
});

test('supervisor never accepts natural close at the grace cutoff before its timer runs', async t => {
  const { api, calls, flush, child } = await terminationFixture(t);
  const pending = api.superviseTransitionChild({ child, nonce, roots, deadlineMs: 10000 });
  child.emit('message', { type: 'result', nonce, result: {} }); child.exitCode = 0; child.emit('exit', 0, null);
  t.mock.timers.setTime(5000); child.emit('close', 0, null); await flush();
  const report = await pending;
  assert.equal(report.normalExit, false); assert.equal(report.childProcess.closeConfirmed, false);
  assert.ok([report.failure, ...report.secondaryErrors].some(error => error?.code === 'transition-child-close-unconfirmed'));
  assert.equal(calls.length, 0);
});

test('termination keeps invalid owner error and never invokes an OS command', async t => {
  const { api, calls, child } = await terminationFixture(t); child.pid = -1;
  const error = await api.terminateTransitionChild(child).catch(error => error);
  assert.equal(error.code, 'transition-child-pid'); assert.equal(calls.length, 0);
  assert.equal(error.termination.attempted, false); assert.equal(await api.terminateTransitionChild(child).catch(e => e), error);
});
