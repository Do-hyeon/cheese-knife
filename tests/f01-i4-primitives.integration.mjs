import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {loadI4Backend,createI4PrimitiveRunner} from '../scripts/audio-j1-signed-reference.mjs';
import {createI4Budget,containsFloat32} from '../scripts/audio-j1-arithmetic.mjs';

// Explicit command only: never discovered by the normal Node *.test.cjs suite.
const manifest=process.env.F01_I4_BACKEND;
assert(manifest,'F01_I4_BACKEND must name the approved local backend.json');
assert.equal(path.basename(manifest),'backend.json');
const relative=path.relative(process.cwd(),path.dirname(path.resolve(manifest))).split(path.sep).join('/');
const specifier='../scripts/owned-files.mjs',{openOwnedRoot}=await import(specifier);
const files=await openOwnedRoot(process.cwd()),backend=await loadI4Backend(files,relative);
const S=1n<<256n;
/** @param {bigint} n @param {bigint} [d] */const point=(n,d=1n)=>({lo:String(n*S/d),hi:String(n*S/d)});

test('actualMpfrPrimitiveRoundTripUsesSigned512LittleEndian',async()=>{
  const runner=createI4PrimitiveRunner(backend),id='primitive-roundtrip-'+randomUUID();
  const operations=[{op:'mul',a:point(-1n,8n),b:point(1n,2n)},{op:'add',a:point(1n,8n),b:point(-1n,8n)},
    {op:'div',a:point(-1n),b:point(3n)},{op:'sqrt',a:point(4n)},{op:'exp',a:point(0n)},
    {op:'log',a:point(1n)},{op:'sin',a:point(0n)},{op:'cos',a:point(0n)},
    {op:'sin',a:{lo:String(-4n*S),hi:String(4n*S)}},{op:'pi'}];
  const result=await runner.run(operations,createI4Budget(id));
  assert.equal(result.status,'READY');assert.equal(result.kind,'primitive-only');assert.equal(result.ownership,'CLOSED');assert.equal(result.closeConfirmed,true);
  assert.deepEqual(result.intervals[0],{lo:-(1n<<252n),hi:-(1n<<252n)});assert.deepEqual(result.intervals[1],{lo:0n,hi:0n});
  const third=result.intervals[2];assert(third&&third.lo*3n<=-S&&third.hi*3n>=-S);
  assert.deepEqual(result.intervals[3],{lo:2n*S,hi:2n*S});assert.deepEqual(result.intervals[4],{lo:S,hi:S});
  assert.deepEqual(result.intervals[5],{lo:0n,hi:0n});assert.deepEqual(result.intervals[6],{lo:0n,hi:0n});assert.deepEqual(result.intervals[7],{lo:S,hi:S});
  assert.deepEqual(result.intervals[8],{lo:-S,hi:S});const negative=result.intervals[0];assert(negative);assert(containsFloat32(negative,-1/16));assert(!containsFloat32(negative,1/16));
  await fs.writeFile(path.join(files.root,result.caseDirectory,'parent-evidence.json'),JSON.stringify({...result,stdout:result.stdout.toString('utf8'),intervals:result.intervals.map(p=>({lo:String(p.lo),hi:String(p.hi)})),referenceMath:'NOT_READY',actualQualification:'NOT_RUN',formalEngineProof:'UNPROVEN'},null,2),{flag:'wx'});
});
test('actualHelperInvalidDomainIsClosedNotAReferencePass',async()=>{
  const r=await createI4PrimitiveRunner(backend).run([{op:'log',a:point(0n)}],createI4Budget('invalid-domain-'+randomUUID()));
  assert.equal(r.status,'NOT_READY');assert.equal(r.closeConfirmed,true);assert.equal(r.ownership,'CLOSED');assert.equal(r.intervals.length,0);
});
test('copiedBackendCannotAcquireExecutionProvenance',()=>{
  assert.throws(()=>createI4PrimitiveRunner({...backend}));
});
