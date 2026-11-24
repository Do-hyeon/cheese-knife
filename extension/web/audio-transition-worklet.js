// Generated from src/main/features/audio/transition-worklet.ts by scripts/main-runtime.mjs. Do not edit.
// src/main/features/audio/eq.ts
var EQ_FREQUENCIES = [63, 125, 250, 500, 1e3, 2e3, 4e3, 8e3];

// src/main/features/audio/curve.ts
function compressorDelay(sampleRate2) {
  return Math.min(
    Math.floor(Math.fround(Math.fround(6e-3) * Math.fround(sampleRate2))),
    1023
  ) / sampleRate2;
}

// src/main/features/audio/normalizer.ts
function normalizerWindow(sampleRate2) {
  if (!Number.isFinite(sampleRate2) || sampleRate2 < 22050 || sampleRate2 > 96e3) return null;
  return 2 ** Math.ceil(Math.log2(sampleRate2 * 0.25));
}
function createNormalizer(sampleRate2) {
  const fftSize = normalizerWindow(sampleRate2);
  return fftSize === null ? null : {
    fftSize,
    windowSeconds: fftSize / sampleRate2,
    lastTime: null,
    warmSince: null,
    power: null,
    silentSeconds: 0,
    fromDb: 0,
    toDb: 0,
    start: 0,
    end: 0
  };
}
function normalizerDbAt(state, time) {
  const progress = state.end > state.start ? Math.max(0, Math.min(1, (time - state.start) / (state.end - state.start))) : 1;
  return state.fromDb + (state.toDb - state.fromDb) * progress;
}
function stepNormalizer(state, input) {
  const validTime = Number.isFinite(input.time), time = validTime ? input.time : state.lastTime ?? state.end;
  const current = normalizerDbAt(state, time), dt = state.lastTime === null ? null : time - state.lastTime;
  const schedule = (mode, toDb = current, seconds = 0) => {
    state.fromDb = current;
    state.toDb = toDb;
    state.start = time;
    state.end = time + seconds;
    return { mode, fromDb: current, toDb, start: time, end: time + seconds };
  };
  const reset = () => {
    state.power = null;
    state.silentSeconds = 0;
    state.warmSince = null;
    state.lastTime = null;
  };
  if (!validTime || !input.active) {
    reset();
    return schedule("hold");
  }
  if (![input.leftPower, input.rightPower].every((power2) => Number.isFinite(power2) && power2 >= 0)) {
    reset();
    return schedule("error", 0, 0.01);
  }
  state.lastTime = time;
  if (dt !== null && (dt <= 0 || dt > 0.2)) {
    state.power = null;
    state.silentSeconds = 0;
    state.warmSince = time;
    return schedule("hold");
  }
  state.warmSince ??= time;
  if (time - state.warmSince < state.windowSeconds || dt === null) return schedule("warmup");
  const power = Math.max(input.leftPower, input.rightPower);
  state.power = state.power === null ? power : state.power + (power - state.power) * (1 - Math.exp(-dt / 0.75));
  const silent = power <= 10 ** (-55 / 10);
  state.silentSeconds = silent ? state.silentSeconds + dt : 0;
  const target = Number.isFinite(input.targetDbfs) && input.targetDbfs >= -30 && input.targetDbfs <= -12 ? input.targetDbfs : -20;
  let desired = Math.max(-12, Math.min(6, target - 10 * Math.log10(Math.max(1e-12, state.power))));
  let down = 1.2;
  if (silent && state.silentSeconds >= 2) {
    desired = 0;
    down = 0.1;
  } else if (silent) desired = Math.min(desired, current);
  return schedule("ramp", Math.max(current - down, Math.min(current + 0.1, desired)), 0.1);
}

// src/main/features/audio/transition.ts
var flat = (value) => ({ from: value, to: value, start: 0, end: 0 });
var at = (curve2, frame) => frame >= curve2.end ? curve2.to : frame <= curve2.start ? curve2.from : curve2.from + (curve2.to - curve2.from) * ((frame - curve2.start) / (curve2.end - curve2.start));
var curve = (from, to, start, length) => ({ from, to, start, end: start + length });
var safe = (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
var finiteRange = (n, min, max) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function isL1Command(value) {
  if (!record(value)) return false;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted" && (keys !== "dynamics,eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted" || typeof value.dynamics !== "boolean")) return false;
  if (!Array.isArray(value.eq) || value.eq.length !== 8) return false;
  for (let i = 0; i < 8; i++) if (!Object.hasOwn(value.eq, i) || !finiteRange(value.eq[i], -6, 6)) return false;
  return value.kind === "configure" && safe(value.sourceEpoch) && value.sourceEpoch > 0 && safe(value.seq) && value.seq > 0 && typeof value.wanted === "boolean" && typeof value.normalizer === "boolean" && finiteRange(value.gain, 0, 2) && finiteRange(value.targetDbfs, -30, -12);
}
function isL1Retire(value) {
  return record(value) && Object.keys(value).sort().join(",") === "kind,seq,sourceEpoch" && value.kind === "retire" && safe(value.sourceEpoch) && value.sourceEpoch > 0 && safe(value.seq) && value.seq > 0;
}
function acceptRetire(state, value, frame, nativeK) {
  if (!isL1Retire(value) || !safe(frame) || state.failed || state.retired || value.sourceEpoch !== state.sourceEpoch || value.seq <= state.seq || state.seq === 0 || state.wanted || !state.completed || frame < state.doneFrame || at(state.q, frame) !== 0 || nativeK !== 0)
    return { ...transitionReply(state, "rejected", frame, "l1-retire-invalid"), seq: safe(value?.seq) ? value.seq : 0 };
  state.seq = value.seq;
  state.retired = true;
  state.offJoint = null;
  return transitionReply(state, "retired", frame);
}
function isL1Meter(value) {
  if (!record(value) || !safe(value.sourceEpoch) || !safe(value.meterEpoch) || !safe(value.meterSeq) || value.meterSeq === 0 || !finiteRange(value.observedTime, 0, Number.MAX_VALUE)) return false;
  const keys = Object.keys(value).sort().join(",");
  if (value.kind === "read-error") return keys === "kind,meterEpoch,meterSeq,observedTime,sourceEpoch";
  return value.kind === "power" && keys === "active,kind,leftPower,meterEpoch,meterSeq,observedTime,rightPower,sourceEpoch,targetDbfs" && typeof value.active === "boolean" && finiteRange(value.leftPower, 0, Number.MAX_VALUE) && finiteRange(value.rightPower, 0, Number.MAX_VALUE) && finiteRange(value.targetDbfs, -30, -12);
}
function transitionReply(state, kind, frame, code = null) {
  return {
    kind,
    sourceEpoch: state.sourceEpoch,
    seq: state.seq,
    frame,
    meterEpoch: state.meterEpoch,
    gain: kind === "completed" ? gainAt(state, frame - state.delay) : null,
    code
  };
}
function createTransition(rate, sourceEpoch, initial, normalizerWitness = false, headroomWitness = false) {
  if (headroomWitness && !normalizerWitness) throw Error("headroom-witness-requires-normalizer");
  if (!finiteRange(rate, 8e3, 384e3) || !safe(sourceEpoch) || sourceEpoch === 0 || !["raw", "silent-hold"].includes(initial)) throw Error("l1-initial-invalid");
  const silent = initial === "silent-hold", delay = Math.round(compressorDelay(rate) * rate);
  return {
    rate,
    sourceEpoch,
    seq: 0,
    meterEpoch: 0,
    meterSeq: 0,
    wanted: silent,
    normEnabled: false,
    normMode: "DISABLED",
    norm: createNormalizer(rate),
    normStatus: "hold",
    meter: null,
    normalizerWitness,
    normalizerApplication: null,
    ...headroomWitness ? { renderHeadroom: null } : {},
    eq: EQ_FREQUENCIES.map(() => flat(0)),
    q: flat(silent ? 1 : 0),
    gainPlans: [flat(silent ? 0 : 1)],
    gainRing: new Float64Array(delay + 1).fill(silent ? 0 : 1),
    delay,
    states: new Float64Array(32),
    cos: Float64Array.from(EQ_FREQUENCIES, (f) => Math.cos(2 * Math.PI * f / rate)),
    sin: Float64Array.from(EQ_FREQUENCIES, (f) => Math.sin(2 * Math.PI * f / rate)),
    coefficients: new Float64Array(24),
    gains: new Float64Array(8).fill(NaN),
    amplitudes: new Float64Array(8).fill(NaN),
    offJoint: null,
    beta: Float64Array.from(EQ_FREQUENCIES, (f) => rate >= 22050 ? 0.5 / Math.tan(Math.PI * f / rate) : 0),
    scratch: Array.from({ length: 7 }, () => new Float32Array(1024)),
    doneFrame: 0,
    completed: true,
    failed: false,
    retired: false
  };
}
function jointAt(state, frame) {
  const plan = state.offJoint;
  return plan && frame >= plan.start && frame < Math.min(plan.end, plan.until) ? plan : null;
}
function jointProgress(plan, frame) {
  const x = frame - plan.start, N = plan.end - plan.start, Q = 128;
  if (x <= 0) return 0;
  if (x >= N) return 1;
  const z = Math.min(x, N - x) / Q, F = z * z * z * z * (2.5 + z * (-3 + z));
  return x < Q ? Q / (N - Q) * F : x > N - Q ? 1 - Q / (N - Q) * F : (x - Q / 2) / (N - Q);
}
function jointDerivative(plan, frame) {
  const x = frame - plan.start, N = plan.end - plan.start;
  if (x <= 0 || x >= N) return 0;
  const z = Math.min(1, Math.min(x, N - x) / 128);
  return z * z * z * (10 + z * (-15 + 6 * z)) / (N - 128);
}
function jointGain(plan, frame, p, nu) {
  if (frame <= plan.start) return plan.fromGain;
  if (frame >= plan.end) return 1;
  const base = plan.fromGain > 1 ? Math.exp((1 - p) * plan.logGain) : plan.fromGain + (1 - plan.fromGain) * p;
  return base / (1 + nu);
}
function eqAt(state, band, frame) {
  const joint = jointAt(state, frame);
  return joint ? joint.fromEq[band] * (1 - jointProgress(joint, frame)) : at(state.eq[band], frame);
}
function sourceTupleAt(state, frame) {
  return { eq: [
    eqAt(state, 0, frame),
    eqAt(state, 1, frame),
    eqAt(state, 2, frame),
    eqAt(state, 3, frame),
    eqAt(state, 4, frame),
    eqAt(state, 5, frame),
    eqAt(state, 6, frame),
    eqAt(state, 7, frame)
  ], gain: gainAt(state, frame) };
}
function gainAt(state, frame) {
  const joint = jointAt(state, frame);
  if (joint) {
    const p = jointProgress(joint, frame), dp = jointDerivative(joint, frame);
    let nu = 0;
    for (let band = 0; band < 8; band++) if (joint.fromEq[band] < 0) {
      const A = 10 ** (joint.fromEq[band] * (1 - p) / 40);
      nu += state.beta[band] * Math.LN10 / 40 * (A + 1 / A) * -joint.fromEq[band] * dp;
    }
    return jointGain(joint, frame, p, nu);
  }
  let plan = state.gainPlans[0];
  for (let i = 1; i < state.gainPlans.length && state.gainPlans[i].start <= frame; i++) plan = state.gainPlans[i];
  return at(plan, frame);
}
function acceptCommand(state, value, frame, nativeK) {
  if (!isL1Command(value) || !safe(frame) || state.failed || state.retired || value.sourceEpoch !== state.sourceEpoch || value.seq <= state.seq || nativeK !== (value.wanted && value.gain === 0 ? -1 : 0)) return { ...transitionReply(state, "rejected", frame, "l1-command-invalid"), seq: safe(value?.seq) ? value.seq : 0 };
  const masterChanged = state.wanted !== value.wanted, normChanged = state.normEnabled !== value.normalizer;
  const now = frame / state.rate, oldDb = state.norm ? normalizerDbAt(state.norm, now) : 0;
  const q = at(state.q, frame), on = value.wanted;
  state.seq = value.seq;
  state.completed = false;
  if (masterChanged || normChanged) {
    state.meterEpoch++;
    state.meter = null;
  }
  if (!on && !masterChanged) return transitionReply(state, "accepted", frame);
  const gainStart = frame + (masterChanged && on ? 0.01 * state.rate : 0);
  const current = sourceTupleAt(state, frame), from = masterChanged && on ? sourceTupleAt(state, gainStart) : current;
  const previousJoint = jointAt(state, frame);
  if (masterChanged) {
    state.q = on ? curve(q, 1, frame, 0.01 * state.rate) : curve(q, 0, frame + 0.02 * state.rate + state.delay, 0.01 * state.rate);
  }
  for (let i = 0; i < 8; i++) state.eq[i] = curve(
    from.eq[i],
    on && state.rate >= 22050 ? value.eq[i] : value.dynamics === true ? from.eq[i] : 0,
    gainStart,
    on || masterChanged ? 0.02 * state.rate : 0
  );
  while (state.gainPlans.length > 1 && state.gainPlans[1].start <= frame) state.gainPlans.shift();
  state.gainPlans = state.gainPlans.filter((p) => p.start < gainStart);
  if (!state.gainPlans.length) state.gainPlans.push(flat(from.gain));
  const gainPlan = curve(from.gain, on ? value.gain : 1, gainStart, (masterChanged ? 0.02 : 0.01) * state.rate);
  state.gainPlans.push(gainPlan);
  state.offJoint = !on && masterChanged && value.dynamics !== true && state.rate >= 22050 && (current.gain !== 1 || current.eq.some((g) => g !== 0)) ? { start: frame, end: frame + 0.02 * state.rate, until: frame + 0.02 * state.rate, fromEq: current.eq, fromGain: current.gain, logGain: current.gain > 1 ? Math.log(current.gain) : null } : masterChanged && on && previousJoint ? { ...previousJoint, until: Math.min(previousJoint.until, gainStart) } : null;
  if (state.gainPlans.length > Math.ceil(0.01 * state.rate) + 2) {
    state.failed = true;
    return transitionReply(state, "failed", frame, "l1-plan-bound");
  }
  state.wanted = on;
  state.normEnabled = value.normalizer;
  if (!on && masterChanged) {
    state.normMode = "OFF-HOLD";
    if (state.norm) Object.assign(state.norm, { fromDb: oldDb, toDb: oldDb, start: now, end: now });
  } else if (on && (!value.normalizer || !state.norm)) {
    state.normMode = "RETIRE";
    if (state.norm) Object.assign(state.norm, { fromDb: oldDb, toDb: 0, start: now, end: now + 0.01 });
  } else if (on && value.normalizer && (masterChanged || normChanged)) {
    state.normMode = "RUN";
    const norm = createNormalizer(state.rate);
    if (norm) Object.assign(norm, { fromDb: oldDb, toDb: oldDb, start: now, end: now });
    state.norm = norm;
  }
  state.doneFrame = Math.ceil(Math.max(state.q.end, ...state.eq.map((p) => p.end), gainPlan.end + state.delay));
  return transitionReply(state, "accepted", frame);
}
function acceptMeter(state, meter) {
  if (!isL1Meter(meter) || meter.sourceEpoch !== state.sourceEpoch || meter.meterSeq <= state.meterSeq) return;
  state.meterSeq = meter.meterSeq;
  if (meter.meterEpoch === state.meterEpoch && state.normMode === "RUN") state.meter = meter;
}
function normalizerFrame(state, frame) {
  const norm = state.norm, time = frame / state.rate;
  if (!norm) {
    state.meter = null;
    return 1;
  }
  if (state.normMode === "OFF-HOLD" && frame >= state.q.end) {
    const start = Math.ceil(state.q.end) / state.rate;
    const db = normalizerDbAt(norm, start);
    Object.assign(norm, { fromDb: db, toDb: 0, start, end: start + 0.01 });
    state.normMode = "RETIRE";
  }
  if (state.normMode === "RETIRE" && time >= norm.end) state.normMode = "DISABLED";
  const meter = state.meter;
  state.meter = null;
  if (state.normMode === "RUN" && meter && meter.meterEpoch === state.meterEpoch) {
    const stale = time - meter.observedTime > 0.2 || meter.observedTime > time;
    const result = stepNormalizer(norm, {
      time,
      active: !stale && (meter.kind === "read-error" || meter.active),
      leftPower: meter.kind === "read-error" ? NaN : meter.leftPower,
      rightPower: meter.kind === "read-error" ? NaN : meter.rightPower,
      targetDbfs: meter.kind === "power" ? meter.targetDbfs : -20
    });
    state.normStatus = result.mode;
    if (state.normalizerWitness) state.normalizerApplication = {
      sourceEpoch: meter.sourceEpoch,
      meterEpoch: meter.meterEpoch,
      meterSeq: meter.meterSeq,
      commandSeq: state.seq,
      frame,
      ...result
    };
  }
  return 10 ** (normalizerDbAt(norm, time) / 20);
}
function renderTransition(state, input, frame, frames, nativeK, audio, control, collectHeadroom = false) {
  state.normalizerApplication = null;
  if ("renderHeadroom" in state) state.renderHeadroom = null;
  let appliedHeadroom = 0;
  const fail = () => {
    state.failed = true;
    for (const channel of audio) channel.fill(0);
    for (const channel of control) channel.fill(0);
    return transitionReply(state, "failed", safe(frame) ? frame : 0, "l1-render-invalid");
  };
  if (state.failed || typeof collectHeadroom !== "boolean" || collectHeadroom && !("renderHeadroom" in state) || !safe(frame) || !Number.isInteger(frames) || frames < 1 || frames > 1024 || audio.length !== 2 || control.length !== 5 || input.length > 2 || [...audio, ...control].some((c) => c.length < frames) || input.some((c) => c.length < frames) || ![1, frames].includes(nativeK.length)) return fail();
  const planned = state.offJoint;
  if (planned && (!safe(planned.start) || !Number.isFinite(planned.end) || planned.end !== planned.start + 0.02 * state.rate || !finiteRange(planned.until, planned.start, planned.end) || !finiteRange(planned.fromGain, 0, 2) || planned.fromEq.length !== 8 || !planned.fromEq.every((g) => finiteRange(g, -6, 6)) || (planned.fromGain > 1 ? !finiteRange(planned.logGain, 0, Math.LN2) : planned.logGain !== null))) return fail();
  for (let n = 0; n < frames; n++) {
    const absolute = frame + n, K = nativeK[nativeK.length === 1 ? 0 : n];
    if (K !== 0 && K !== -1) return fail();
    if (state.offJoint && absolute >= Math.min(state.offJoint.end, state.offJoint.until)) state.offJoint = null;
    const joint = jointAt(state, absolute), p = joint ? jointProgress(joint, absolute) : 0, dp = joint ? jointDerivative(joint, absolute) : 0;
    if (!finiteRange(p, 0, 1) || !Number.isFinite(dp) || dp < 0) return fail();
    let sum = 0, nu = 0;
    for (let band = 0; band < 8; band++) {
      const g = joint ? joint.fromEq[band] * (1 - p) : at(state.eq[band], absolute);
      sum += Math.max(0, g);
      if (g !== state.gains[band]) {
        state.gains[band] = g;
        const A = 10 ** (g / 40), t = state.rate >= 22050 ? state.sin[band] / (2 * A) : 0;
        state.amplitudes[band] = A;
        state.coefficients[band * 3] = (1 - t) / (1 + t);
        state.coefficients[band * 3 + 1] = 2 * Math.sqrt(t) / (1 + t);
        state.coefficients[band * 3 + 2] = (1 - A * A) / 2;
      }
      if (joint && joint.fromEq[band] < 0) {
        const A = state.amplitudes[band];
        nu += state.beta[band] * Math.LN10 / 40 * (A + 1 / A) * -joint.fromEq[band] * dp;
      }
    }
    const sourceGain = joint ? jointGain(joint, absolute, p, nu) : gainAt(state, absolute);
    if (!Number.isFinite(nu) || nu < 0 || !finiteRange(sourceGain, 0, 2)) return fail();
    const headroom = 10 ** (-sum / 20);
    for (let channel = 0; channel < 2; channel++) {
      let x = input.length ? input[Math.min(channel, input.length - 1)][n] : 0;
      if (!Number.isFinite(x)) return fail();
      x *= headroom;
      if (state.rate >= 22050) for (let band = 0; band < 8; band++) {
        const offset = channel * 16 + band * 2, s1 = state.states[offset], s2 = state.states[offset + 1];
        const k1 = -state.cos[band], r1 = state.sin[band], k2 = state.coefficients[band * 3], r2 = state.coefficients[band * 3 + 1];
        const a = k2 * x + r2 * s2, u = r2 * x - k2 * s2;
        const next2 = k1 * u + r1 * s1, next1 = r1 * u - k1 * s1;
        if (!Number.isFinite(a) || !Number.isFinite(u) || !Number.isFinite(next1) || !Number.isFinite(next2)) return fail();
        state.states[offset] = next1;
        state.states[offset + 1] = next2;
        if (state.gains[band] !== 0) x += state.coefficients[band * 3 + 2] * (a - x);
      }
      state.scratch[channel][n] = x;
      if (!Number.isFinite(state.scratch[channel][n])) return fail();
    }
    appliedHeadroom = headroom;
    state.gainRing[absolute % state.gainRing.length] = sourceGain;
    const G = state.gainRing[(absolute - state.delay + state.gainRing.length) % state.gainRing.length];
    const q = at(state.q, absolute), N = normalizerFrame(state, absolute);
    const silentOff = K === -1 && !state.wanted;
    state.scratch[2][n] = -q;
    state.scratch[3][n] = silentOff ? 0 : q;
    state.scratch[4][n] = G;
    state.scratch[5][n] = N;
    state.scratch[6][n] = silentOff ? 0 : -K;
    if (!Number.isFinite(G) || !Number.isFinite(N) || q < 0 || q > 1 || G < 0 || G > 2) return fail();
  }
  for (let c = 0; c < 2; c++) audio[c].set(state.scratch[c].subarray(0, frames));
  for (let c = 0; c < 5; c++) control[c].set(state.scratch[c + 2].subarray(0, frames));
  if (collectHeadroom) state.renderHeadroom = { sourceEpoch: state.sourceEpoch, commandSeq: state.seq, startFrame: frame, endFrame: frame + frames, eq: Array.from(state.gains), headroom: appliedHeadroom };
  if (!state.completed && frame + frames - 1 >= state.doneFrame) {
    state.completed = true;
    return transitionReply(state, "completed", Math.max(frame, state.doneFrame));
  }
  return null;
}

// src/main/features/audio/transition-worklet.ts
var TransitionProcessor = class extends AudioWorkletProcessor {
  state;
  command = null;
  meter = null;
  headroomWitness;
  offStageWitness;
  offStage = null;
  static get parameterDescriptors() {
    return [{ name: "K", defaultValue: 0, minValue: -1, maxValue: 0, automationRate: "a-rate" }];
  }
  constructor(options) {
    super();
    this.headroomWitness = options.processorOptions.headroomWitness === true;
    this.offStageWitness = options.processorOptions.offStageWitness === true;
    this.state = createTransition(sampleRate, options.processorOptions.sourceEpoch, options.processorOptions.initial, options.processorOptions.normalizerWitness === true, this.headroomWitness);
    this.port.onmessage = (event) => {
      const packet = event.data;
      if (this.offStageWitness && packet !== null && typeof packet === "object" && "kind" in packet && packet.kind === "off-stage-register") {
        this.registerOffStage(packet, event.ports);
        return;
      }
      const witness = this.offStage;
      let target = false;
      if (witness && !witness.command && this.isOffStageTarget(packet)) {
        witness.command = packet;
        target = true;
        this.postOffStage("callback");
      }
      if ((isL1Command(packet) || isL1Retire(packet)) && !this.command) {
        this.command = packet;
        if (target) this.postOffStage("stored");
      } else if (isL1Meter(packet) && !this.meter) this.meter = packet;
      else this.port.postMessage(transitionReply(this.state, "failed", currentFrame, "l1-packet-invalid"));
    };
    this.port.postMessage(transitionReply(this.state, "prepared", currentFrame));
  }
  isOffStageTarget(packet) {
    return isL1Command(packet) && packet.sourceEpoch === this.state.sourceEpoch && packet.seq === 2 && !packet.wanted && packet.gain === 1 && packet.eq.every((gain) => gain === 0) && !packet.normalizer && packet.dynamics === true && packet.targetDbfs === -20;
  }
  registerOffStage(packet, ports) {
    if (this.offStage || this.state.rate !== 44100 || this.state.failed || this.state.retired || this.state.seq !== 1 || !this.state.completed || !this.state.wanted || this.command || ports.length !== 1 || Array.isArray(packet) || Object.keys(packet).sort().join(",") !== "kind,registration,sourceEpoch,target" || packet.sourceEpoch !== this.state.sourceEpoch || typeof packet.registration !== "string" || !/^[0-9a-f]{32}$/.test(packet.registration) || !this.isOffStageTarget(packet.target)) {
      for (const port of ports) try {
        port.close();
      } catch {
      }
      return;
    }
    this.offStage = { port: ports[0], registration: packet.registration, expected: packet.target, command: null, accepted: null, completed: false };
    this.postOffStage("registered");
  }
  postOffStage(stage, reply) {
    const witness = this.offStage, port = witness?.port;
    if (!witness || !port) return;
    try {
      port.postMessage({
        schema: "f01-off-stage-receipt-v1",
        registration: witness.registration,
        sourceEpoch: this.state.sourceEpoch,
        seq: 2,
        stage,
        target: witness.command ?? witness.expected,
        ...reply ? { reply } : {}
      });
    } catch {
      witness.port = null;
      try {
        port.close();
      } catch {
      }
    }
  }
  process(inputs, outputs, parameters) {
    this.state.normalizerApplication = null;
    if (this.headroomWitness) this.state.renderHeadroom = null;
    const K = parameters.K, audio = outputs[0], control = outputs[1];
    if (!K || !audio || !control || !audio[0]) return false;
    if (this.command) {
      const command = this.command;
      const waiting = isL1Command(command) && Number.isSafeInteger(currentFrame) && currentFrame >= 0 && !this.state.failed && !this.state.retired && command.sourceEpoch === this.state.sourceEpoch && command.seq > this.state.seq && (K[0] === 0 || K[0] === -1) && K[0] !== (command.wanted && command.gain === 0 ? -1 : 0);
      if (!waiting) {
        this.command = null;
        const reply2 = command.kind === "retire" ? acceptRetire(this.state, command, currentFrame, K.every((k) => k === 0) ? 0 : -1) : acceptCommand(this.state, command, currentFrame, K[0]);
        if (reply2.kind === "retired") {
          for (const channel of [...audio, ...control]) channel.fill(0);
          this.port.postMessage(reply2);
          return false;
        }
        const witness2 = this.offStage, target = witness2?.command === command && reply2.kind === "accepted" && reply2.sourceEpoch === this.state.sourceEpoch && reply2.seq === 2;
        if (target && witness2) {
          witness2.accepted = reply2;
          this.postOffStage("accepted", reply2);
        }
        this.port.postMessage(reply2);
        if (target) this.postOffStage("accepted-post-returned", reply2);
      }
    }
    const meter = this.meter;
    this.meter = null;
    if (meter) acceptMeter(this.state, meter);
    const reply = renderTransition(this.state, inputs[0] ?? [], currentFrame, audio[0].length, K, audio, control, this.headroomWitness && meter !== null);
    const witness = this.offStage;
    if (reply?.kind === "completed" && witness?.accepted && !witness.completed && reply.sourceEpoch === this.state.sourceEpoch && reply.seq === 2) {
      witness.completed = true;
      this.postOffStage("completed", reply);
    }
    if (meter) this.port.postMessage({
      ...transitionReply(this.state, "meter-accepted", currentFrame, this.state.normStatus),
      seq: meter.meterSeq,
      ...this.state.normalizerWitness ? { application: this.state.normalizerApplication } : {},
      ...this.headroomWitness ? { renderHeadroom: this.state.renderHeadroom } : {}
    });
    if (reply) this.port.postMessage(reply);
    return !this.state.failed;
  }
};
registerProcessor("knife-audio-transition-l1", TransitionProcessor);
