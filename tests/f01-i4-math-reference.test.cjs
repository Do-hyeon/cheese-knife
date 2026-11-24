const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
/** @param {Uint8Array} b */const hash=b=>createHash('sha256').update(b).digest('hex');
const api=()=>import('../scripts/audio-j1-signed-reference.mjs');
const arithmetic=()=>import('../scripts/audio-j1-arithmetic.mjs');
test('mathOnlyReaderRejectsShapeAndCapsBeforeReading',async()=>{
  const m=await api(),a=await arithmetic();let reads=0;
  const files={lstat:async()=>{reads++;return null;},readFile:async()=>{reads++;return Buffer.alloc(0);}};
  await assert.rejects(()=>m.readI4MathResult(files,{},256001,a.createI4Budget('oversize-math')));
  await assert.rejects(()=>m.readI4MathResult(files,{kind:'mutation-only',frames:1,program:null,controls:null,stateEnd:null,radiiEnd:null,doneFrame:0},1,a.createI4Budget('wrong-kind')),/i4-math-result/);
  assert.equal(reads,0);
});
test('mathMutationBridgeRejectsArbitraryOpcodeBeforeBackendAccess',async()=>{
  const m=await api(),a=await arithmetic(),backend={python:'unused',versions:[],contextSha256:'a'.repeat(64)};
  for(const mutation of ['../arbitrary-script','__proto__'])assert.throws(()=>m.deriveI4MathMutation({}, {source:Buffer.alloc(0)}, backend,a.createI4Budget('bad-mutation-'+mutation),mutation),/i4-mutation/);
});
test('mathOnlyReaderChecksSignedEndpointsControlHashAndFiniteValues',async()=>{
  const m=await api(),a=await arithmetic(),p=Buffer.alloc(256),c=Buffer.alloc(40);
  const descriptor=(/** @type {string} */file,/** @type {Buffer} */bytes)=>({file,bytes:bytes.length,sha256:hash(bytes)});
  const h={kind:'math-only',frames:1,program:descriptor('reference.iv512le',p),controls:descriptor('control.f64le',c),stateEnd:Array.from({length:2},()=>Array.from({length:8},()=>['0','0'])),radiiEnd:Array.from({length:2},()=>Array(8).fill('0')),doneFrame:0};
  const files={lstat:async(/** @type {string} */n)=>({isFile:()=>true,size:n==='control.f64le'?40:256}),readFile:async(/** @type {string} */n)=>n==='control.f64le'?c:p};
  const r=await m.readI4MathResult(files,h,1,a.createI4Budget('valid-math'));
  assert.deepEqual(r.programIntervals,[[{lo:0n,hi:0n},{lo:0n,hi:0n}]]);assert.equal(r.expectedControls.length,5);
  c.writeDoubleLE(NaN);h.controls=descriptor('control.f64le',c);
  await assert.rejects(()=>m.readI4MathResult(files,h,1,a.createI4Budget('nonfinite-control')));
  c.fill(0);h.controls=descriptor('control.f64le',c);p[63]=128;h.program=descriptor('reference.iv512le',p);
  // Negative lower endpoint is legal; reverse lo/hi is not.
  await m.readI4MathResult(files,h,1,a.createI4Budget('signed-lower'));
  p[63]=0;p[0]=1;h.program=descriptor('reference.iv512le',p);
  await assert.rejects(()=>m.readI4MathResult(files,h,1,a.createI4Budget('reverse-endpoints')));
});
