const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const load=()=>import('../scripts/audio-i4-assumptions.mjs');
/** @param {string|Uint8Array} b */const sha=b=>createHash('sha256').update(b).digest('hex');
/** @template T @param {T|undefined|null} v @returns {T} */function must(v){assert(v!==undefined&&v!==null);return v;}
const target={nodeSha256:'1'.repeat(64),engineSha256:'2'.repeat(64),graphSha256:'3'.repeat(64),nodeVersion:'contract-node',engineVersion:'contract-engine',platform:'win32',arch:'x64',sourceRevision:'contract-revision',buildOrDispatchScope:['scalar']};
const ids=['math.pow','math.exp','math.log','math.tan','math.sin','math.cos','math.sqrt','arith.add','arith.sub','arith.mul','arith.div','arith.fma','cast.f32','cast.f64','fp.ftz32','fp.ftz64','graph.gain','graph.sum','graph.delay','graph.channel','graph.waveshaper'];
const range=()=>({lo:{n:'-2',d:'1'},hi:{n:'2',d:'1'}});
const spec=()=>({id:'contract-only/48000',fs:48000,source:{channels:2,sha256:'4'.repeat(64)},requiredStart:0,requiredEnd:128});
const backend=()=>({targetIdentity:structuredClone(target),backendSha256:'5'.repeat(64)});
const budget=()=>({caseId:'contract-only/48000',deadlineMonoMs:120000,check(){}});
/** @param {import('node:test').TestContext} t @param {(l:{operations:import('../scripts/audio-i4-assumptions.mjs', {with:{'resolution-mode':'import'}}).Operation[]})=>void} [changeLedger] */
async function approved(t,changeLedger=()=>{}){
  const api=await load(),root=await fs.mkdtemp(path.join(os.tmpdir(),'cheese-i4-contract-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const review=Buffer.from('Synthetic validator contract only; no real engine analysis or approval.');
  const caseSpec=spec(),ledger={schema:'f01-i4-assumptions-v1',binding:{...backend(),caseId:caseSpec.id,caseSha256:api.i4CaseDigest(caseSpec),sourceSha256:caseSpec.source.sha256,fs:48000,channels:2},reviewDigest:sha(review),operations:ids.map(id=>({id,operation:id,domain:[range()],targetIdentity:structuredClone(target),sourceRevision:'contract-revision',buildOrDispatchScope:['scalar'],evidence:[{id:'synthetic-only',sha256:'6'.repeat(64)}],derivation:'Synthetic parser contract, not a numerical bound for Chrome.',bound:{n:'1',d:'1024'},status:'SOURCE_REVIEWED'}))};
  changeLedger(ledger);const bytes=Buffer.from(JSON.stringify(ledger));
  const approvalRecord={schema:'f01-i4-approval-v1',ledgerSha256:sha(bytes),reviewSha256:sha(review),reviewPath:'review.md',allowedTarget:structuredClone(target),operationCoverage:[...ids],scope:{caseBindings:[{caseId:caseSpec.id,caseSha256:api.i4CaseDigest(caseSpec),sourceSha256:caseSpec.source.sha256,fs:48000,channels:2,requiredOperations:ids.map(id=>({id,domain:[range()]}))}]}};
  await fs.writeFile(path.join(root,'approval.json'),JSON.stringify(approvalRecord));await fs.writeFile(path.join(root,'review.md'),review);
  const ownedSpecifier='../scripts/owned-files.mjs', {openOwnedRoot}=await import(ownedSpecifier);
  const files=await openOwnedRoot(root),approval=await api.loadI4Approval(files,'approval.json');
  return {api,root,files,caseSpec,bytes,approval,approvalRecord,backend:backend(),budget:budget()};
}
test('selfDeclaredStatusCannotAdmit',async()=>{
  const api=await load();const result=api.admitI4Assumptions(spec(),Buffer.from('{}'),{status:'approved'},backend(),budget());
  assert.equal(result.status,'NOT_READY');assert(result.reasons.includes('i4-approval-untrusted'));
});
test('independentlyLoadedApprovalAdmitsOnlyItsSyntheticBinding',async t=>{
  const f=await approved(t),a=f.api.admitI4Assumptions(f.caseSpec,f.bytes,f.approval,f.backend,f.budget);
  assert.equal(a.status,'READY_CONDITIONAL');assert.equal(must(a.binding).sourceSha256,'4'.repeat(64));
  assert.equal(f.api.requireI4Admission(a,f.caseSpec,f.backend,f.budget),a);
  assert.throws(()=>f.api.requireI4Admission(JSON.parse(JSON.stringify(a)),f.caseSpec,f.backend,f.budget));
});
test('copiedDigestWrongTarget',async t=>{
  const f=await approved(t);f.backend.targetIdentity.engineSha256='a'.repeat(64);
  assert.equal(f.api.admitI4Assumptions(f.caseSpec,f.bytes,f.approval,f.backend,f.budget).status,'NOT_READY');
});
test('domainHoleIsNotReady',async t=>{
  const f=await approved(t,l=>{must(must(l.operations[0]).domain[0]).hi.n='1';});
  const a=f.api.admitI4Assumptions(f.caseSpec,f.bytes,f.approval,f.backend,f.budget);
  assert.equal(a.status,'NOT_READY');assert(a.reasons.includes('i4-domain-coverage'));
});
test('unreviewedFinitePathUnion',async t=>{
  const f=await approved(t,l=>{must(l.operations[0]).buildOrDispatchScope.push('unknown-fma');});
  assert.equal(f.api.admitI4Assumptions(f.caseSpec,f.bytes,f.approval,f.backend,f.budget).status,'NOT_READY');
});
test('actualGetterUntouched',async t=>{
  const f=await approved(t);let reads=0;
  Object.defineProperty(f.caseSpec,'programPCM',{enumerable:true,get(){reads++;throw Error('must not read actual');}});
  assert.equal(f.api.admitI4Assumptions(f.caseSpec,f.bytes,f.approval,f.backend,f.budget).status,'NOT_READY');assert.equal(reads,0);
});
test('arrayAccessorAndOverriddenMapCannotReadActual',async t=>{
  const f=await approved(t);let reads=0;
  for(const kind of ['index','map']){
    const commands=[0];
    Object.defineProperty(commands,kind==='index'?'0':'map',{enumerable:true,get(){reads++;throw Error('must not read actual');}});
    const a=f.api.admitI4Assumptions({...f.caseSpec,commands},f.bytes,f.approval,f.backend,f.budget);
    assert.equal(a.status,'NOT_READY');assert.equal(reads,0);
  }
});
test('approvedOperationRevisionMustMatchBoundTarget',async t=>{
  const f=await approved(t,l=>{must(l.operations[0]).sourceRevision='unrelated-main';});
  const a=f.api.admitI4Assumptions(f.caseSpec,f.bytes,f.approval,f.backend,f.budget);
  assert.equal(a.status,'NOT_READY');assert(a.reasons.includes('i4-source-revision'));
});
for(const mutation of ['missing','contradicted','duplicate','negative-bound','nan-bound','unknown-field','missing-operation'])test('ledger rejects '+mutation,async t=>{
  const f=await approved(t,l=>{
    if(mutation==='missing')must(l.operations[0]).status='MISSING';
    if(mutation==='contradicted')must(l.operations[0]).status='CONTRADICTED';
    if(mutation==='duplicate')l.operations.push(structuredClone(must(l.operations[0])));
    if(mutation==='negative-bound')must(l.operations[0]).bound.n='-1';
    if(mutation==='nan-bound')must(l.operations[0]).bound.n='NaN';
    if(mutation==='unknown-field')Object.assign(must(l.operations[0]),{certified:true});
    if(mutation==='missing-operation')l.operations.pop();
  });assert.equal(f.api.admitI4Assumptions(f.caseSpec,f.bytes,f.approval,f.backend,f.budget).status,'NOT_READY');
});
test('expiredOrChangedBudgetCannotReuseAdmission',async t=>{
  const f=await approved(t),a=f.api.admitI4Assumptions(f.caseSpec,f.bytes,f.approval,f.backend,f.budget);
  assert.throws(()=>f.api.requireI4Admission(a,f.caseSpec,f.backend,budget()));
  f.budget.deadlineMonoMs++;assert.throws(()=>f.api.requireI4Admission(a,f.caseSpec,f.backend,f.budget));
  const other=await approved(t);other.budget.check=()=>{throw Error('expired');};assert.equal(other.api.admitI4Assumptions(other.caseSpec,other.bytes,other.approval,other.backend,other.budget).status,'NOT_READY');
});
test('approvalReviewBytesAreIndependentlyBound',async t=>{
  const f=await approved(t);await fs.writeFile(path.join(f.root,'review.md'),'changed');
  await assert.rejects(()=>f.api.loadI4Approval(f.files,'approval.json'));
});
test('mutatedSourceCaseOrLedgerCannotReuseAdmission',async t=>{
  const f=await approved(t),a=f.api.admitI4Assumptions(f.caseSpec,f.bytes,f.approval,f.backend,f.budget);
  f.caseSpec.source.sha256='7'.repeat(64);assert.throws(()=>f.api.requireI4Admission(a,f.caseSpec,f.backend,f.budget));
  assert.equal(f.api.admitI4Assumptions(spec(),Buffer.concat([f.bytes,Buffer.from(' ')]),f.approval,f.backend,f.budget).status,'NOT_READY');
});
test('oversizeAndMalformedLedgerAreNotReady',async t=>{
  const f=await approved(t);
  for(const bytes of [Buffer.alloc(8*1024*1024+1),Buffer.from([255]),Buffer.from('{')])assert.equal(f.api.admitI4Assumptions(f.caseSpec,bytes,f.approval,f.backend,f.budget).status,'NOT_READY');
});
test('caseCountIs66',async()=>{
  const {i4Cases}=require('./fixtures/f01-i4-cases.cjs'),cases=i4Cases();
  assert.equal(cases.length,66);assert.equal(new Set(cases.map(c=>c.id)).size,66);
  for(const fs of [44100,48000,96000])assert.equal(cases.filter(c=>c.fs===fs).length,22);
  assert.equal(cases.filter(c=>c.initial.sourceGainRing!==1||c.initial.eqStates!==0||c.initial.pcmDelayRings!==0).length,0);
});
test('defaultAmplitudePoint1Gain132',()=>{
  const {i4Cases}=require('./fixtures/f01-i4-cases.cjs'),c=must(i4Cases().find(c=>c.id==='i4/48000/timing-setting'));
  assert.equal(c.source.recipe.amplitude,.1);assert.equal(must(c.commands[0]).gain,1.32);assert.equal(must(c.commands.find(p=>p.kind==='setting')).gain,.5);
  assert.deepEqual(must(c.commands[0]).eq,[0,0,0,-6,-6,-6,-6,-6]);assert.equal(c.requiredStart,0);assert.equal(c.sourceFrame,4864);assert.equal(c.requiredEnd,120064);
  assert(c.commands.every(p=>p.normalizer===false&&p.targetDbfs===-20));
});
test('monoCanonicalOneChannel',()=>{
  const {i4Cases,generateI4Source,canonicalI4Source}=require('./fixtures/f01-i4-cases.cjs'),c=must(i4Cases().find(c=>c.id==='i4/48000/d4-mono')),bytes=generateI4Source(c);
  assert.equal(bytes.length,(c.requiredEnd-c.sourceFrame)*4);
  const left=new Float32Array(c.requiredEnd),right=new Float32Array(c.requiredEnd);
  for(let n=c.sourceFrame;n<c.requiredEnd;n++)left[n]=bytes.readFloatLE((n-c.sourceFrame)*4);
  assert.deepEqual(canonicalI4Source(c,[left,right]),bytes);
  right[c.sourceFrame]=.1;assert.throws(()=>canonicalI4Source(c,[left,right]));right[c.sourceFrame]=0;left[0]=.1;assert.throws(()=>canonicalI4Source(c,[left,right]));
});
test('stereoCanonicalKeepsBothLanesAndResidualPrefix',()=>{
  const {i4Cases,generateI4Source,canonicalI4Source}=require('./fixtures/f01-i4-cases.cjs'),all=i4Cases(),c=must(all.find(c=>c.id==='i4/44100/d4-antiphase')),bytes=generateI4Source(c),left=new Float32Array(c.requiredEnd),right=new Float32Array(c.requiredEnd);
  for(let n=c.sourceFrame;n<c.requiredEnd;n++){const k=(n-c.sourceFrame)*8;left[n]=bytes.readFloatLE(k);right[n]=bytes.readFloatLE(k+4);assert.equal(right[n],-must(left[n]));}
  assert.deepEqual(canonicalI4Source(c,[left,right]),bytes);
  const residual=must(all.find(c=>c.id==='i4/44100/d3-residual')),r=generateI4Source(residual);assert.notEqual(r.readFloatLE(0),0);assert.equal(r.readFloatLE(44100*8),0);
});
test('interiorQHasFirstOnPrefix',()=>{
  const {i4InteriorUnits}=require('./fixtures/f01-i4-cases.cjs'),units=i4InteriorUnits();assert.equal(units.length,6);
  const on=must(units.find(c=>c.id==='i4-unit/48000/qInteriorOnToOff')),off=must(units.find(c=>c.id==='i4-unit/48000/qInteriorOffToOn'));
  assert.deepEqual(on.commands.map(p=>p.frame),[256,496]);assert.deepEqual(off.commands.map(p=>p.frame),[256,2112,3600]);
  assert.equal(on.interiorQ,.5);assert.equal(off.interiorQ,.5);assert.equal(off.requiredStart,0);assert(off.requiredEnd>=must(off.commands.at(-1)).frame+9600);
});
test('fixedRecipeAndCanonicalBoundsCannotBeEdited',()=>{
  const {i4Cases,generateI4Source,canonicalI4Source}=require('./fixtures/f01-i4-cases.cjs'),c=must(i4Cases().find(c=>c.id==='i4/48000/d4-mono'));
  for(const broken of [{...c,sourceFrame:-1},{...c,requiredEnd:1.5},{...c,source:{...c.source,recipe:{...c.source.recipe,amplitude:Infinity}}}])assert.throws(()=>generateI4Source(broken));
  assert.throws(()=>canonicalI4Source({...c,sourceFrame:-1},[new Float32Array(c.requiredEnd),new Float32Array(c.requiredEnd)]));
});
test('sourceBindingRejectsBytesNotGeneratedOrChangedAfterGeneration',()=>{
  const {i4Cases,generateI4Source,bindI4Source}=require('./fixtures/f01-i4-cases.cjs'),c=must(i4Cases().find(c=>c.id==='i4/48000/d2-zero')),bytes=generateI4Source(c),bound=bindI4Source(c,bytes);
  assert.equal(bound.source.sha256,sha(bytes));assert.equal(c.source.sha256,null);
  const other=Buffer.from(bytes);other[0]=must(other[0])^1;assert.throws(()=>bindI4Source(c,other));
  bytes[0]=must(bytes[0])^1;assert.throws(()=>bindI4Source(c,bytes));
});
test('fixedCasesPreserveCapsTailCancellationAndPairedResponsibilities',()=>{
  const {i4Cases}=require('./fixtures/f01-i4-cases.cjs'),cases=i4Cases();
  for(const c of cases){assert(c.requiredEnd<=256000);assert.equal(c.requiredStart,0);assert(c.sourceFrame<=Math.ceil(.2*c.fs));assert(c.requiredEnd-c.sourceFrame<=2.4*c.fs);assert(c.commands.every((cmd,i)=>cmd.seq===i+1));
    for(const cmd of c.commands)if(cmd.completedFrame!==null)assert(c.requiredEnd-cmd.completedFrame>=.2*c.fs);
    for(const w of c.witnesses)assert(w.from>=0&&w.to<=c.requiredEnd&&w.from<w.to);
    assert(cases.some(other=>other.id===c.paired));assert.equal(c.mutationResponsibilities.swap,`i4/${c.fs}/d4-asymmetric`);assert.equal(c.mutationResponsibilities['omit-limiter'],'unit/limiter-rational-plus-minus-one');
  }
  const same=must(cases.find(c=>c.id==='i4/48000/timing-same-frame'));assert.equal(must(same.commands[1]).cancelled,true);assert.equal(must(same.commands[2]).cancelled,false);
});
test('publicContractFixtureCannotSupplyLiveApproval',async()=>{
  const f=JSON.parse(await fs.readFile(path.join(__dirname,'fixtures/f01-i4-assumption-contract.json'),'utf8')),api=await load();assert.equal(api.admitI4Assumptions(spec(),Buffer.from('{}'),f,backend(),budget()).status,'NOT_READY');
});
test('gainZeroMuteRequiresBothDomainsAtEveryRate',()=>{
  const {i4Cases}=require('./fixtures/f01-i4-cases.cjs');
  for(const c of i4Cases().filter(c=>c.id.endsWith('/d2-muted-zero'))){
    assert.deepEqual(c.domains,['D2','D3']);assert(c.commands.every(p=>p.gain===0));
    assert.deepEqual(c.mediaEvents.map(e=>[e.property,e.value]),[['muted',true],['muted',false]]);
  }
});
test('leftOnlyRightZeroResponsibilityIsPairedNotLocallyIdentifiable',()=>{
  const {i4Cases}=require('./fixtures/f01-i4-cases.cjs');
  for(const c of i4Cases().filter(c=>c.id.endsWith('/d4-left'))){
    assert.equal(c.source.recipe.layout,'left');assert.equal(c.initial.eqStates,0);
    assert.equal(c.mutationResponsibilities['right-zero'],`i4/${c.fs}/d4-asymmetric`);
  }
});
