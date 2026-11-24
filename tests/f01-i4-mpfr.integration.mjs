import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {loadI4Backend,deriveI4MathReference} from '../scripts/audio-j1-signed-reference.mjs';
import * as referenceAPI from '../scripts/audio-j1-signed-reference.mjs';
import {createI4Budget,containsFloat32,separated} from '../scripts/audio-j1-arithmetic.mjs';

const manifest=process.env.F01_I4_BACKEND;
assert(manifest&&path.basename(manifest)==='backend.json');
const relative=path.relative(process.cwd(),path.dirname(path.resolve(manifest))).split(path.sep).join('/');
const specifier='../scripts/owned-files.mjs',{openOwnedRoot}=await import(specifier);
const files=await openOwnedRoot(process.cwd()),backend=await loadI4Backend(files,relative);
/** @param {Buffer} b */const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(){const source=Buffer.alloc(4096*8);source.writeFloatLE(1/8,128*8);source.writeFloatLE(-1/8,128*8+4);return {source,spec:{fs:48000,frames:4096,sourceFrame:0,channels:2,sourceSha256:hash(source),initial:'raw',commands:[]}};}

test('exactDyadicDelayRoundTrip',async()=>{
  const {source,spec}=fixture(),r=await deriveI4MathReference(spec,{source},backend,createI4Budget('dyadic-'+randomUUID()));
  assert.equal(r.status,'READY');assert.equal(r.kind,'math-only');assert.equal(r.ownership,'CLOSED');assert.equal(r.closeConfirmed,true);
  assert.equal(r.numericAssumptions,'MISSING');assert.equal(r.actualQualification,'NOT_RUN');assert.equal(r.signedModel,'NOT_EVALUATED');
  assert.equal(r.programIntervals.length,4096);assert.equal(r.expectedControls.length,4096*5);
  for(let n=0;n<4096;n++)for(let c=0;c<2;c++){
    const iv=r.programIntervals[n]?.[c];assert(iv);const v=n===416?(c?-1:1)/8:0;
    assert(containsFloat32(iv,v));assert(!containsFloat32(iv,n===416?-v:1/8));assert.equal(iv.lo,iv.hi);
  }
  // Fixed witness, same membership primitive for channel/sign/loss/timing mutations.
  const pair=r.programIntervals[416];assert(pair?.[0]&&pair[1]);
  for(const wrong of [[0,0],[1/8,0],[1/8,1/8],[-1/8,1/8],[-1/8,-1/8]]){
    assert(wrong.some((v,c)=>{const iv=pair[c];assert(iv);return !containsFloat32(iv,v);}));
  }
  for(const frame of [415,417]){const iv=r.programIntervals[frame]?.[0];assert(iv);assert(!containsFloat32(iv,1/8));}
  const base=path.join(files.root,r.caseDirectory),p=await fs.readFile(path.join(base,'reference.iv512le')),control=await fs.readFile(path.join(base,'control.f64le'));
  assert.equal(p.length,4096*256);assert.equal(control.length,4096*40);
  assert.equal(p.readBigInt64LE(416*256+24),1n<<61n);assert.equal(p[416*256+128+63],255);
  for(let n=0;n<4096;n++)assert.deepEqual(Array.from(r.expectedControls.slice(n*5,n*5+5)),[0,0,1,1,0]);
  await fs.writeFile(path.join(base,'parent-evidence.json'),JSON.stringify({schema:'f01-i4-e1-roundtrip',context:r.binding,programSha256:hash(p),controlsSha256:hash(control),referenceMath:'UNIT_VALIDATED',numericAssumptions:'MISSING',actualQualification:'NOT_RUN',formalEngineProof:'UNPROVEN'}),{flag:'wx'});
});
test('actualGraphHelperDomainFailureIsClosedNotReady',async()=>{
  const {source,spec}=fixture();
  // Parent accepts the bounded wire; Python validates the actual command domain.
  const commands=[{frame:128,seq:1,wanted:true,gain:1,eq:[7,0,0,0,0,0,0,0],sourceEpoch:1}];
  const r=await deriveI4MathReference({...spec,commands},{source},backend,createI4Budget('invalid-graph-'+randomUUID()));
  assert.equal(r.status,'NOT_READY');assert.equal(r.closeConfirmed,true);assert.equal(r.ownership,'CLOSED');
});

test('fullJ1MutationPathsUseSameClassifier',async()=>{
  assert.equal(typeof referenceAPI.deriveI4MathMutation,'function','mutation-only bridge is not implemented');
  const frames=4096,source=Buffer.alloc(frames*8);
  for(let n=0;n<frames;n++){source.writeFloatLE((n%17<8?1:-1)/8,n*8);source.writeFloatLE((n%29<14?1:-1)/16,n*8+4);}
  /** @param {number} frame @param {number} seq @param {boolean} wanted @param {number} [gain] @param {number[]} [eq] */
  const command=(frame,seq,wanted,gain=1.32,eq=[0,0,0,-6,-6,-6,-6,-6])=>({frame,seq,wanted,gain,eq,sourceEpoch:1});
  const spec={fs:48000,frames,sourceFrame:0,channels:2,sourceSha256:hash(source),initial:'raw',commands:[command(0,1,true),command(2048,2,false),command(2176,3,true,.5)]};
  const id=()=>createI4Budget('witness-'+randomUUID());
  const correct=await deriveI4MathReference(spec,{source},backend,id());assert.equal(correct.status,'READY');
  const witnesses=[...Array.from({length:256},(_,i)=>400+i),...Array.from({length:384},(_,i)=>2048+i),...Array.from({length:296},(_,i)=>3800+i)];
  const scale=2**256;
  /** @param {Awaited<ReturnType<typeof deriveI4MathReference>>} result */
  function positive(result){assert.equal(result.status,'READY');for(const row of result.programIntervals)for(const iv of row)assert(containsFloat32(iv,Math.fround(Number(iv.lo)/scale)));}
  positive(correct);
  /** @type {{mutation:string,caseDirectory:string,kind:string,separated:boolean}[]} */const records=[];
  for(const mutation of ['zero','right-zero','abs','invert','swap','clone','delay-minus-one','delay-plus-one','linear480','state-reset','immediate-source-gain','omit-eq','omit-gain','omit-delay']){
    const wrong=await referenceAPI.deriveI4MathMutation(spec,{source},backend,id(),mutation);assert.equal(wrong.kind,'mutation-only');positive(wrong);
    assert(witnesses.some(n=>[0,1].some(c=>{const good=correct.programIntervals[n]?.[c],bad=wrong.programIntervals[n]?.[c];assert(good&&bad);return separated(good,bad)&&!containsFloat32(good,Math.fround(Number(bad.lo)/scale));})),mutation);
    records.push({mutation,caseDirectory:wrong.caseDirectory,kind:wrong.kind,separated:true});
  }
  for(const mutation of ['omit-headroom','omit-limiter']){
    const impulse=Buffer.alloc(frames*8);impulse.writeFloatLE(mutation==='omit-limiter'?1:1/8,2048*8);impulse.writeFloatLE(mutation==='omit-limiter'?-1:-1/16,2048*8+4);
    const eq=mutation==='omit-headroom'?[0,0,6,0,0,0,0,0]:Array(8).fill(0),unit={...spec,sourceSha256:hash(impulse),commands:[command(0,1,true,1,eq)]};
    const good=await deriveI4MathReference(unit,{source:impulse},backend,id()),bad=await referenceAPI.deriveI4MathMutation(unit,{source:impulse},backend,id(),mutation);positive(good);positive(bad);
    for(let c=0;c<2;c++){const g=good.programIntervals[2336]?.[c],b=bad.programIntervals[2336]?.[c];assert(g&&b);assert(separated(g,b));assert(!containsFloat32(g,Math.fround(Number(b.lo)/scale)));if(mutation==='omit-limiter'){assert(containsFloat32(g,Math.fround(c?-.98:.98)));assert(containsFloat32(b,c?-1:1));}}
    records.push({mutation,caseDirectory:bad.caseDirectory,kind:bad.kind,separated:true});
  }
  const silence=Buffer.alloc(frames*8),silentSpec={...spec,sourceSha256:hash(silence),commands:[]};
  const silent=await deriveI4MathReference(silentSpec,{source:silence},backend,id()),swapped=await referenceAPI.deriveI4MathMutation(silentSpec,{source:silence},backend,id(),'swap');
  positive(silent);positive(swapped);assert.equal(swapped.kind,'mutation-only');
  assert(silent.programIntervals.every((row,n)=>row.every((iv,c)=>{const bad=swapped.programIntervals[n]?.[c];assert(bad);return !separated(iv,bad)&&containsFloat32(iv,0);})));
  await fs.writeFile(path.join(files.root,correct.caseDirectory,'witness-evidence.json'),JSON.stringify({records,silentSwap:'UNIDENTIFIABLE',pairedResponsibility:'fixed-asymmetric-unit',referenceMath:'E1_UNIT_ONLY',actualQualification:'NOT_RUN'}),{flag:'wx'});
});
