/** @typedef {{lo:bigint,hi:bigint}} Interval */
/** @typedef {import('./audio-i4-assumptions.mjs').Budget} Budget */
const scale=1n<<256n,min=-(1n<<511n),max=(1n<<511n)-1n;
/** @type {WeakMap<Budget,{now:()=>number,last:number,expired:boolean}>} */const budgets=new WeakMap();
/** @param {string} message @returns {never} */function fail(message){throw Error(message);}
/** @param {bigint} n @param {bigint} d */const floor=(n,d)=>n/d-(n<0n&&n%d!==0n?1n:0n);
/** @param {bigint} n @param {bigint} d */const ceil=(n,d)=>-floor(-n,d);
/** @param {bigint} lo @param {bigint} hi @returns {Interval} */
function interval(lo,hi){if(lo<min||hi>max||lo>hi)fail('i4-grid-overflow');return Object.freeze({lo,hi});}
/** @param {Interval} a */function check(a){if(typeof a.lo!=='bigint'||typeof a.hi!=='bigint')fail('i4-grid');return interval(a.lo,a.hi);}
/** @param {bigint} n @param {bigint} [d] */
export function fromRational(n,d=1n){if(typeof n!=='bigint'||typeof d!=='bigint'||d<=0n||n.toString(2).replace('-','').length>32768||d.toString(2).length>32768)fail('i4-rational');return interval(floor(n*scale,d),ceil(n*scale,d));}
/** @param {number} x */
function float32Ratio(x){
  if(!Number.isFinite(x)||Math.fround(x)!==x)fail('i4-float32');const b=Buffer.allocUnsafe(4);b.writeFloatLE(x);const bits=b.readUInt32LE(),e=(bits>>>23)&255,m=(bits&0x7fffff)+(e?0x800000:0),shift=e?e-150:-149;
  const n=BigInt(m)*(bits>>>31?-1n:1n);return shift>=0?[n<<BigInt(shift),1n]:[n,1n<<BigInt(-shift)];
}
/** @param {number} x */export function fromFloat32(x){const [n,d]=float32Ratio(x);if(n===undefined||d===undefined)return fail('i4-float32');return fromRational(n,d);}
/** @param {Interval} a @param {Interval} b @param {Budget} [budget] */export function add(a,b,budget){budget?.check();check(a);check(b);return interval(a.lo+b.lo,a.hi+b.hi);}
/** @param {Interval} a @param {Interval} b @param {Budget} [budget] */export function sub(a,b,budget){budget?.check();check(a);check(b);return interval(a.lo-b.hi,a.hi-b.lo);}
/** @param {bigint[]} values */function extrema(values){let lo=values[0],hi=values[0];if(lo===undefined||hi===undefined)return fail('i4-empty');for(const n of values){if(n<lo)lo=n;if(n>hi)hi=n;}return {lo,hi};}
/** @param {Interval} a @param {Interval} b @param {Budget} [budget] */export function mul(a,b,budget){budget?.check();check(a);check(b);const v=extrema([a.lo*b.lo,a.lo*b.hi,a.hi*b.lo,a.hi*b.hi]);return interval(floor(v.lo,scale),ceil(v.hi,scale));}
/** @param {Interval} a @param {Interval} b @param {Budget} [budget] */
export function div(a,b,budget){budget?.check();check(a);check(b);if(b.lo<=0n&&b.hi>=0n)fail('i4-divisor-zero');const lows=[],highs=[];for(const n of [a.lo,a.hi])for(const d of [b.lo,b.hi]){const sign=d<0n?-1n:1n;lows.push(floor(n*scale*sign,d*sign));highs.push(ceil(n*scale*sign,d*sign));}return interval(extrema(lows).lo,extrema(highs).hi);}
/** @param {Interval} a @param {number} x */export function containsFloat32(a,x){check(a);const [n,d]=float32Ratio(x);if(n===undefined||d===undefined)return fail('i4-float32');return a.lo*d<=n*scale&&n*scale<=a.hi*d;}
/** @param {Interval} a @param {Interval} b */export function separated(a,b){check(a);check(b);return a.hi<b.lo||b.hi<a.lo;}
/** Exact rational IEEE round-to-nearest/ties-even, not a host floating conversion.
 * @param {bigint} value @param {32|64} bits */
function rounded(value,bits){
  if(!value)return {n:0n,d:1n};const sign=value<0n?-1n:1n,n=value*sign,p=bits===32?24:53,emin=bits===32?-126:-1022,emax=bits===32?127:1023;
  let exponent=n.toString(2).length-257;if(exponent>=0?n<scale<<BigInt(exponent):n<<BigInt(-exponent)<scale)exponent--;
  const q=Math.max(exponent-p+1,emin-p+1),numerator=q<0?n<<BigInt(-q):n,denominator=q<0?scale:scale<<BigInt(q);
  let integer=numerator/denominator;const twice=2n*(numerator%denominator);if(twice>denominator||twice===denominator&&integer%2n===1n)integer++;
  const roundedN=q>=0?integer<<BigInt(q):integer,roundedD=q>=0?1n:1n<<BigInt(-q);
  if(roundedN>(((1n<<BigInt(p))-1n)<<BigInt(emax-p+1))*roundedD)fail('i4-format-overflow');return {n:roundedN*sign,d:roundedD};
}
/** @param {Interval} a @param {32|64} bits @param {Budget} [budget] */
export function roundFormat(a,bits,budget){budget?.check();check(a);if(bits!==32&&bits!==64)fail('i4-format');const lo=rounded(a.lo,bits),hi=rounded(a.hi,bits);return interval(fromRational(lo.n,lo.d).lo,fromRational(hi.n,hi.d).hi);}
/** @param {string} caseId @param {()=>number} [now] @returns {Budget} */
export function createI4Budget(caseId,now=()=>performance.now()){
  if(typeof caseId!=='string'||!caseId.length||caseId.length>128)fail('i4-case-id');const start=now();if(!Number.isFinite(start))fail('i4-clock');
  const budget=Object.freeze({caseId,deadlineMonoMs:start+120000,check(){i4RemainingMs(budget);}});budgets.set(budget,{now,last:start,expired:false});return budget;
}
/** @param {Budget} budget */
export function i4RemainingMs(budget){const state=budgets.get(budget);if(!state)fail('i4-budget-owner');const now=state.now();if(!Number.isFinite(now)||now<state.last||now>=budget.deadlineMonoMs)state.expired=true;state.last=now;if(state.expired)fail('i4-case-timeout');return budget.deadlineMonoMs-now;}
