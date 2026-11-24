const test=require('node:test'),assert=require('node:assert/strict');
const api=()=>import('../scripts/audio-j1-arithmetic.mjs');
test('binaryTieEvenSubnormalSignedZero',async()=>{
  const a=await api(),S=1n<<256n;
  assert.deepEqual(a.fromFloat32(-0),{lo:0n,hi:0n});
  assert.deepEqual(a.fromFloat32(2**-149),{lo:1n<<107n,hi:1n<<107n});
  assert.deepEqual(a.roundFormat(a.fromRational((1n<<24n)+1n,1n<<24n),32),{lo:S,hi:S});
  assert.deepEqual(a.roundFormat(a.fromRational((1n<<24n)+3n,1n<<24n),32),a.fromFloat32(1+2**-22));
  assert.deepEqual(a.roundFormat(a.fromRational((1n<<53n)+1n,1n<<53n),64),{lo:S,hi:S});
  assert.deepEqual(a.roundFormat(a.fromRational(-(1n<<24n)-1n,1n<<24n),32),{lo:-S,hi:-S});
});
test('gridOverflowRejected',async()=>{
  const a=await api();assert.throws(()=>a.fromRational(1n<<256n,1n));
  assert.throws(()=>a.mul({lo:1n<<510n,hi:1n<<510n},{lo:1n<<510n,hi:1n<<510n}));
  assert.throws(()=>a.roundFormat(a.fromRational(1n<<128n,1n),32));
});
test('containsFloat32Shared',async()=>{
  const a=await api(),one=a.fromRational(1n,1n);
  assert.equal(a.containsFloat32(one,1),true);assert.equal(a.containsFloat32(one,-1),false);
  assert.equal(a.containsFloat32({lo:0n,hi:0n},2**-149),false);
  assert.equal(a.containsFloat32({lo:0n,hi:0n},-0),true);
  assert.throws(()=>a.containsFloat32(one,NaN));assert.throws(()=>a.fromFloat32(.1));
});
test('negativeThirdAndDirectedArithmeticEncloseExactRationals',async()=>{
  const a=await api(),S=1n<<256n,x=a.fromRational(-1n,3n);
  assert(x.lo*3n<=-S&&x.hi*3n>=-S);assert.equal(x.hi-x.lo,1n);
  assert.deepEqual(a.add(a.fromRational(1n,2n),a.fromRational(1n,4n)),a.fromRational(3n,4n));
  assert.deepEqual(a.sub(a.fromRational(1n,2n),a.fromRational(3n,4n)),a.fromRational(-1n,4n));
  assert.deepEqual(a.mul(a.fromRational(-2n,1n),a.fromRational(3n,4n)),a.fromRational(-3n,2n));
  assert.deepEqual(a.div(a.fromRational(1n,1n),a.fromRational(-3n,1n)),x);
  assert.throws(()=>a.div(x,{lo:-1n,hi:1n}));assert.throws(()=>a.fromRational(1n,0n));
  assert(a.separated(a.fromRational(-1n,1n),a.fromRational(1n,1n)));
  assert(!a.separated(x,x));
});
test('budget110Leaves10AcrossDifferentClockOrigins',async()=>{
  const a=await api();let now=700000;const b=a.createI4Budget('clock-origin',()=>now);
  now+=110000;assert.equal(a.i4RemainingMs(b),10000);assert.equal(b.deadlineMonoMs,820000);
  assert(Object.isFrozen(b));assert.throws(()=>a.i4RemainingMs({...b}));
});
test('cannotResetExpiredBudget',async()=>{
  const a=await api();let now=0;const b=a.createI4Budget('expiry',()=>now);now=120000;
  assert.throws(()=>b.check());now=1;assert.throws(()=>b.check());
});
