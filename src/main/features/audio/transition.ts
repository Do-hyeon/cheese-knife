import { EQ_FREQUENCIES } from './eq';
import { compressorDelay } from './curve';
import { createNormalizer, normalizerDbAt, stepNormalizer, type NormalizerControl } from './normalizer';

export type Eq8 = readonly [number, number, number, number, number, number, number, number];
export interface L1Command {
  kind: 'configure'; sourceEpoch: number; seq: number; wanted: boolean; gain: number;
  eq: Eq8; normalizer: boolean; targetDbfs: number;
  dynamics?: boolean;
}
export interface L1Retire { kind: 'retire'; sourceEpoch: number; seq: number }
export type L1Meter = { sourceEpoch: number; meterEpoch: number; meterSeq: number; observedTime: number } &
  ({ kind: 'power'; leftPower: number; rightPower: number; active: boolean; targetDbfs: number } | { kind: 'read-error' });
export interface L1Reply {
  kind: 'prepared' | 'accepted' | 'completed' | 'rejected' | 'failed' | 'meter-accepted' | 'retired';
  sourceEpoch: number; seq: number; frame: number; meterEpoch: number; gain: number | null; code: string | null;
}
interface Curve { from: number; to: number; start: number; end: number }
interface OffJoint { start: number; end: number; until: number; fromEq: Eq8; fromGain: number; logGain: number | null }
export interface NormalizerApplication {
  sourceEpoch: number; meterEpoch: number; meterSeq: number; commandSeq: number; frame: number;
  mode: 'hold' | 'warmup' | 'ramp' | 'error'; fromDb: number; toDb: number; start: number; end: number;
}
export interface RenderHeadroom { sourceEpoch: number; commandSeq: number; startFrame: number; endFrame: number; eq: number[]; headroom: number }
export interface L1State {
  renderHeadroom?: RenderHeadroom | null;
  rate: number; sourceEpoch: number; seq: number; meterEpoch: number; meterSeq: number;
  wanted: boolean; normEnabled: boolean; normMode: 'RUN' | 'OFF-HOLD' | 'RETIRE' | 'DISABLED';
  norm: NormalizerControl | null; normStatus: string; meter: L1Meter | null;
  normalizerWitness: boolean; normalizerApplication: NormalizerApplication | null;
  eq: Curve[]; q: Curve; gainPlans: Curve[]; gainRing: Float64Array; delay: number;
  states: Float64Array; cos: Float64Array; sin: Float64Array; coefficients: Float64Array;
  gains: Float64Array; scratch: Float32Array[]; doneFrame: number; completed: boolean; failed: boolean; retired: boolean;
  offJoint: OffJoint | null; beta: Float64Array; amplitudes: Float64Array;
}
const flat = (value: number): Curve => ({ from: value, to: value, start: 0, end: 0 });
const at = (curve: Curve, frame: number): number => frame >= curve.end ? curve.to : frame <= curve.start ? curve.from
  : curve.from + (curve.to - curve.from) * ((frame - curve.start) / (curve.end - curve.start));
const curve = (from: number, to: number, start: number, length: number): Curve => ({ from, to, start, end: start + length });
const safe = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const finiteRange = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function isL1Command(value: unknown): value is L1Command {
  if (!record(value)) return false;
  const keys=Object.keys(value).sort().join(',');
  if (keys !== 'eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted' &&
      (keys !== 'dynamics,eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted' || typeof value.dynamics !== 'boolean')) return false;
  if (!Array.isArray(value.eq) || value.eq.length !== 8) return false;
  for (let i = 0; i < 8; i++) if (!Object.hasOwn(value.eq, i) || !finiteRange(value.eq[i], -6, 6)) return false;
  return value.kind === 'configure' && safe(value.sourceEpoch) && value.sourceEpoch > 0 && safe(value.seq) && value.seq > 0 &&
    typeof value.wanted === 'boolean' && typeof value.normalizer === 'boolean' && finiteRange(value.gain, 0, 2) &&
    finiteRange(value.targetDbfs, -30, -12);
}
export function isL1Retire(value: unknown): value is L1Retire {
  return record(value) && Object.keys(value).sort().join(',') === 'kind,seq,sourceEpoch' && value.kind === 'retire' &&
    safe(value.sourceEpoch) && value.sourceEpoch > 0 && safe(value.seq) && value.seq > 0;
}
export function acceptRetire(state: L1State, value: L1Retire, frame: number, nativeK: number): L1Reply {
  if (!isL1Retire(value) || !safe(frame) || state.failed || state.retired || value.sourceEpoch !== state.sourceEpoch || value.seq <= state.seq ||
      state.seq === 0 || state.wanted || !state.completed || frame < state.doneFrame || at(state.q,frame) !== 0 || nativeK !== 0)
    return {...transitionReply(state,'rejected',frame,'l1-retire-invalid'),seq:safe(value?.seq) ? value.seq : 0};
  state.seq=value.seq;state.retired=true;state.offJoint=null;return transitionReply(state,'retired',frame);
}
export function isL1Meter(value: unknown): value is L1Meter {
  if (!record(value) || !safe(value.sourceEpoch) || !safe(value.meterEpoch) || !safe(value.meterSeq) || value.meterSeq === 0 ||
      !finiteRange(value.observedTime, 0, Number.MAX_VALUE)) return false;
  const keys = Object.keys(value).sort().join(',');
  if (value.kind === 'read-error') return keys === 'kind,meterEpoch,meterSeq,observedTime,sourceEpoch';
  return value.kind === 'power' && keys === 'active,kind,leftPower,meterEpoch,meterSeq,observedTime,rightPower,sourceEpoch,targetDbfs' &&
    typeof value.active === 'boolean' && finiteRange(value.leftPower, 0, Number.MAX_VALUE) &&
    finiteRange(value.rightPower, 0, Number.MAX_VALUE) && finiteRange(value.targetDbfs, -30, -12);
}
export function transitionReply(state: L1State, kind: L1Reply['kind'], frame: number, code: string | null = null): L1Reply {
  return { kind, sourceEpoch: state.sourceEpoch, seq: state.seq, frame, meterEpoch: state.meterEpoch,
    gain: kind === 'completed' ? gainAt(state, frame - state.delay) : null, code };
}
export function createTransition(rate: number, sourceEpoch: number, initial: 'raw' | 'silent-hold', normalizerWitness = false, headroomWitness = false): L1State {
  if(headroomWitness && !normalizerWitness)throw Error('headroom-witness-requires-normalizer');
  if (!finiteRange(rate, 8000, 384000) || !safe(sourceEpoch) || sourceEpoch === 0 || !['raw','silent-hold'].includes(initial)) throw Error('l1-initial-invalid');
  const silent = initial === 'silent-hold', delay = Math.round(compressorDelay(rate) * rate);
  return { rate, sourceEpoch, seq: 0, meterEpoch: 0, meterSeq: 0, wanted: silent, normEnabled: false,
    normMode: 'DISABLED', norm: createNormalizer(rate), normStatus: 'hold', meter: null, normalizerWitness, normalizerApplication: null,...(headroomWitness?{renderHeadroom:null}:{}),
    eq: EQ_FREQUENCIES.map(() => flat(0)), q: flat(silent ? 1 : 0), gainPlans: [flat(silent ? 0 : 1)],
    gainRing: new Float64Array(delay + 1).fill(silent ? 0 : 1), delay, states: new Float64Array(32),
    cos: Float64Array.from(EQ_FREQUENCIES, f => Math.cos(2 * Math.PI * f / rate)),
    sin: Float64Array.from(EQ_FREQUENCIES, f => Math.sin(2 * Math.PI * f / rate)),
    coefficients: new Float64Array(24), gains: new Float64Array(8).fill(NaN), amplitudes: new Float64Array(8).fill(NaN),
    offJoint: null, beta: Float64Array.from(EQ_FREQUENCIES, f => rate >= 22050 ? .5 / Math.tan(Math.PI*f/rate) : 0),
    scratch: Array.from({length: 7}, () => new Float32Array(1024)), doneFrame: 0, completed: true, failed: false, retired: false };
}
function jointAt(state: L1State, frame: number): OffJoint | null {
  const plan=state.offJoint;return plan && frame>=plan.start && frame<Math.min(plan.end,plan.until) ? plan : null;
}
function jointProgress(plan: OffJoint, frame: number): number {
  const x=frame-plan.start,N=plan.end-plan.start,Q=128;
  if(x<=0)return 0;if(x>=N)return 1;
  const z=Math.min(x,N-x)/Q,F=z*z*z*z*(2.5+z*(-3+z));
  return x<Q ? Q/(N-Q)*F : x>N-Q ? 1-Q/(N-Q)*F : (x-Q/2)/(N-Q);
}
function jointDerivative(plan: OffJoint, frame: number): number {
  const x=frame-plan.start,N=plan.end-plan.start;
  if(x<=0||x>=N)return 0;
  const z=Math.min(1,Math.min(x,N-x)/128);
  return z*z*z*(10+z*(-15+6*z))/(N-128);
}
function jointGain(plan: OffJoint, frame: number, p: number, nu: number): number {
  if(frame<=plan.start)return plan.fromGain;if(frame>=plan.end)return 1;
  const base=plan.fromGain>1 ? Math.exp((1-p)*plan.logGain!) : plan.fromGain+(1-plan.fromGain)*p;
  return base/(1+nu);
}
function eqAt(state: L1State, band: number, frame: number): number {
  const joint=jointAt(state,frame);return joint ? joint.fromEq[band]!*(1-jointProgress(joint,frame)) : at(state.eq[band]!,frame);
}
function sourceTupleAt(state: L1State, frame: number): { eq: Eq8; gain: number } {
  return {eq:[eqAt(state,0,frame),eqAt(state,1,frame),eqAt(state,2,frame),eqAt(state,3,frame),
    eqAt(state,4,frame),eqAt(state,5,frame),eqAt(state,6,frame),eqAt(state,7,frame)],gain:gainAt(state,frame)};
}
function gainAt(state: L1State, frame: number): number {
  const joint=jointAt(state,frame);
  if(joint){
    const p=jointProgress(joint,frame),dp=jointDerivative(joint,frame);let nu=0;
    // Command-time future queries must not use the last render frame's amplitude cache.
    for(let band=0;band<8;band++)if(joint.fromEq[band]!<0){
      const A=10**(joint.fromEq[band]!*(1-p)/40);
      nu+=state.beta[band]!*Math.LN10/40*(A+1/A)*(-joint.fromEq[band]!)*dp;
    }
    return jointGain(joint,frame,p,nu);
  }
  let plan = state.gainPlans[0]!;
  for (let i = 1; i < state.gainPlans.length && state.gainPlans[i]!.start <= frame; i++) plan = state.gainPlans[i]!;
  return at(plan, frame);
}
export function acceptCommand(state: L1State, value: L1Command, frame: number, nativeK: number): L1Reply {
  if (!isL1Command(value) || !safe(frame) || state.failed || state.retired || value.sourceEpoch !== state.sourceEpoch || value.seq <= state.seq ||
      nativeK !== (value.wanted && value.gain === 0 ? -1 : 0)) return { ...transitionReply(state, 'rejected', frame, 'l1-command-invalid'), seq: safe(value?.seq) ? value.seq : 0 };
  const masterChanged = state.wanted !== value.wanted, normChanged = state.normEnabled !== value.normalizer;
  const now = frame / state.rate, oldDb = state.norm ? normalizerDbAt(state.norm, now) : 0;
  const q = at(state.q, frame), on = value.wanted;
  state.seq = value.seq; state.completed = false;
  if (masterChanged || normChanged) { state.meterEpoch++; state.meter = null; }
  if (!on && !masterChanged) return transitionReply(state, 'accepted', frame);
  const gainStart=frame+(masterChanged&&on ? .01*state.rate : 0);
  const current=sourceTupleAt(state,frame),from=masterChanged&&on ? sourceTupleAt(state,gainStart) : current;
  const previousJoint=jointAt(state,frame);
  if (masterChanged) {
    state.q = on ? curve(q, 1, frame, .01 * state.rate) : curve(q, 0, frame + .02 * state.rate + state.delay, .01 * state.rate);
  }
  // Keep the input of active nonlinear stages warm while only the master gate changes.
  for (let i = 0; i < 8; i++) state.eq[i] = curve(from.eq[i]!, on && state.rate >= 22050 ? value.eq[i]! : value.dynamics === true ? from.eq[i]! : 0,
    gainStart, on || masterChanged ? .02 * state.rate : 0);
  // Keep the already scheduled prefix until a delayed replacement starts; no PCM look-ahead.
  while (state.gainPlans.length > 1 && state.gainPlans[1]!.start <= frame) state.gainPlans.shift();
  state.gainPlans = state.gainPlans.filter(p => p.start < gainStart);
  if (!state.gainPlans.length) state.gainPlans.push(flat(from.gain));
  const gainPlan = curve(from.gain, on ? value.gain : 1, gainStart, (masterChanged ? .02 : .01) * state.rate);
  state.gainPlans.push(gainPlan);
  state.offJoint=!on&&masterChanged&&value.dynamics!==true&&state.rate>=22050&&(current.gain!==1||current.eq.some(g=>g!==0))
    ? {start:frame,end:frame+.02*state.rate,until:frame+.02*state.rate,fromEq:current.eq,fromGain:current.gain,logGain:current.gain>1?Math.log(current.gain):null}
    : masterChanged&&on&&previousJoint ? {...previousJoint,until:Math.min(previousJoint.until,gainStart)} : null;
  if (state.gainPlans.length > Math.ceil(.01 * state.rate) + 2) { state.failed = true; return transitionReply(state, 'failed', frame, 'l1-plan-bound'); }
  state.wanted = on; state.normEnabled = value.normalizer;
  if (!on && masterChanged) {
    state.normMode = 'OFF-HOLD';
    if (state.norm) Object.assign(state.norm, {fromDb:oldDb,toDb:oldDb,start:now,end:now});
  } else if (on && (!value.normalizer || !state.norm)) {
    state.normMode = 'RETIRE';
    if (state.norm) Object.assign(state.norm, {fromDb:oldDb,toDb:0,start:now,end:now+.01});
  } else if (on && value.normalizer && (masterChanged || normChanged)) {
    state.normMode = 'RUN'; const norm = createNormalizer(state.rate);
    if (norm) Object.assign(norm, {fromDb:oldDb,toDb:oldDb,start:now,end:now}); state.norm = norm;
  }
  state.doneFrame = Math.ceil(Math.max(state.q.end, ...state.eq.map(p => p.end), gainPlan.end + state.delay));
  return transitionReply(state, 'accepted', frame);
}
export function acceptMeter(state: L1State, meter: L1Meter): void {
  if (!isL1Meter(meter) || meter.sourceEpoch !== state.sourceEpoch || meter.meterSeq <= state.meterSeq) return;
  state.meterSeq = meter.meterSeq;
  if (meter.meterEpoch === state.meterEpoch && state.normMode === 'RUN') state.meter = meter;
}
function normalizerFrame(state: L1State, frame: number): number {
  const norm = state.norm, time = frame / state.rate;
  if (!norm) { state.meter = null; return 1; }
  if (state.normMode === 'OFF-HOLD' && frame >= state.q.end) {
    const start = Math.ceil(state.q.end) / state.rate;
    const db = normalizerDbAt(norm, start); Object.assign(norm,{fromDb:db,toDb:0,start,end:start+.01}); state.normMode = 'RETIRE';
  }
  if (state.normMode === 'RETIRE' && time >= norm.end) state.normMode = 'DISABLED';
  const meter = state.meter; state.meter = null;
  if (state.normMode === 'RUN' && meter && meter.meterEpoch === state.meterEpoch) {
    const stale = time - meter.observedTime > .2 || meter.observedTime > time;
    const result = stepNormalizer(norm,{time,active:!stale && (meter.kind === 'read-error' || meter.active),
      leftPower:meter.kind === 'read-error' ? NaN : meter.leftPower,rightPower:meter.kind === 'read-error' ? NaN : meter.rightPower,
      targetDbfs:meter.kind === 'power' ? meter.targetDbfs : -20});
    state.normStatus = result.mode;
    if (state.normalizerWitness) state.normalizerApplication = {sourceEpoch:meter.sourceEpoch,meterEpoch:meter.meterEpoch,
      meterSeq:meter.meterSeq,commandSeq:state.seq,frame,...result};
  }
  return 10 ** (normalizerDbAt(norm, time) / 20);
}
export function renderTransition(state: L1State, input: readonly Float32Array[], frame: number, frames: number,
  nativeK: Float32Array, audio: readonly Float32Array[], control: readonly Float32Array[], collectHeadroom = false): L1Reply | null {
  state.normalizerApplication = null;
  if('renderHeadroom' in state)state.renderHeadroom=null;
  let appliedHeadroom=0;
  const fail = (): L1Reply => {
    state.failed = true;
    for (const channel of audio) channel.fill(0); for (const channel of control) channel.fill(0);
    return transitionReply(state,'failed',safe(frame) ? frame : 0,'l1-render-invalid');
  };
  if (state.failed || typeof collectHeadroom!=='boolean' || collectHeadroom && !('renderHeadroom' in state) || !safe(frame) || !Number.isInteger(frames) || frames < 1 || frames > 1024 || audio.length !== 2 || control.length !== 5 ||
      input.length > 2 || [...audio,...control].some(c => c.length < frames) || input.some(c => c.length < frames) ||
      ![1,frames].includes(nativeK.length)) return fail();
  const planned=state.offJoint;
  if(planned&&(!safe(planned.start)||!Number.isFinite(planned.end)||planned.end!==planned.start+.02*state.rate||
    !finiteRange(planned.until,planned.start,planned.end)||!finiteRange(planned.fromGain,0,2)||planned.fromEq.length!==8||
    !planned.fromEq.every(g=>finiteRange(g,-6,6))|| (planned.fromGain>1 ? !finiteRange(planned.logGain,0,Math.LN2) : planned.logGain!==null)))return fail();
  for (let n = 0; n < frames; n++) {
    const absolute = frame + n, K = nativeK[nativeK.length === 1 ? 0 : n]!;
    if (K !== 0 && K !== -1) return fail();
    if(state.offJoint&&absolute>=Math.min(state.offJoint.end,state.offJoint.until))state.offJoint=null;
    const joint=jointAt(state,absolute),p=joint?jointProgress(joint,absolute):0,dp=joint?jointDerivative(joint,absolute):0;
    if(!finiteRange(p,0,1)||!Number.isFinite(dp)||dp<0)return fail();
    let sum = 0,nu=0;
    for (let band = 0; band < 8; band++) {
      const g = joint ? joint.fromEq[band]!*(1-p) : at(state.eq[band]!, absolute); sum += Math.max(0,g);
      if (g !== state.gains[band]) {
        state.gains[band] = g;
        const A = 10 ** (g / 40), t = state.rate >= 22050 ? state.sin[band]! / (2 * A) : 0;
        state.amplitudes[band]=A;
        state.coefficients[band*3] = (1-t)/(1+t); state.coefficients[band*3+1] = 2*Math.sqrt(t)/(1+t); state.coefficients[band*3+2] = (1-A*A)/2;
      }
      if(joint&&joint.fromEq[band]!<0){const A=state.amplitudes[band]!;nu+=state.beta[band]!*Math.LN10/40*(A+1/A)*(-joint.fromEq[band]!)*dp;}
    }
    const sourceGain=joint?jointGain(joint,absolute,p,nu):gainAt(state,absolute);
    if(!Number.isFinite(nu)||nu<0||!finiteRange(sourceGain,0,2))return fail();
    const headroom = 10 ** (-sum/20);
    for (let channel = 0; channel < 2; channel++) {
      let x = input.length ? input[Math.min(channel,input.length-1)]![n]! : 0;
      if (!Number.isFinite(x)) return fail(); x *= headroom;
      if (state.rate >= 22050) for (let band = 0; band < 8; band++) {
        const offset = channel*16+band*2, s1 = state.states[offset]!, s2 = state.states[offset+1]!;
        const k1 = -state.cos[band]!, r1 = state.sin[band]!, k2 = state.coefficients[band*3]!, r2 = state.coefficients[band*3+1]!;
        const a = k2*x+r2*s2, u = r2*x-k2*s2;
        const next2 = k1*u+r1*s1, next1 = r1*u-k1*s1;
        if (!Number.isFinite(a) || !Number.isFinite(u) || !Number.isFinite(next1) || !Number.isFinite(next2)) return fail();
        state.states[offset] = next1; state.states[offset+1] = next2;
        if (state.gains[band] !== 0) x += state.coefficients[band*3+2]! * (a-x);
      }
      state.scratch[channel]![n] = x;
      if (!Number.isFinite(state.scratch[channel]![n])) return fail();
    }
    appliedHeadroom=headroom;
    state.gainRing[absolute % state.gainRing.length] = sourceGain;
    const G = state.gainRing[(absolute-state.delay+state.gainRing.length) % state.gainRing.length]!;
    const q = at(state.q,absolute), N = normalizerFrame(state,absolute);
    // A newer Gain0 intent must stay silent while an older OFF/retire awaits its reply.
    const silentOff = K === -1 && !state.wanted;
    state.scratch[2]![n] = -q; state.scratch[3]![n] = silentOff ? 0 : q; state.scratch[4]![n] = G; state.scratch[5]![n] = N; state.scratch[6]![n] = silentOff ? 0 : -K;
    if (!Number.isFinite(G) || !Number.isFinite(N) || q < 0 || q > 1 || G < 0 || G > 2) return fail();
  }
  for (let c = 0; c < 2; c++) audio[c]!.set(state.scratch[c]!.subarray(0,frames));
  for (let c = 0; c < 5; c++) control[c]!.set(state.scratch[c+2]!.subarray(0,frames));
  if(collectHeadroom)state.renderHeadroom={sourceEpoch:state.sourceEpoch,commandSeq:state.seq,startFrame:frame,endFrame:frame+frames,eq:Array.from(state.gains),headroom:appliedHeadroom};
  if (!state.completed && frame+frames-1 >= state.doneFrame) {
    state.completed = true; return transitionReply(state,'completed',Math.max(frame,state.doneFrame));
  }
  return null;
}
