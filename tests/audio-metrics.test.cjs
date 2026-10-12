const test = require('node:test');
const assert = require('node:assert/strict');
const metrics = () => import('../scripts/audio-metrics.mjs');
const tone = (n, harmonic = 0) => Float64Array.from({length:n}, (_, i) =>
  0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000) + harmonic * Math.sin(2 * Math.PI * 3000 * i / 48000));
const qualityChannel = () => ({ rms:0.25, peak:0.98, overFullScaleSamples:0, maxAdjacentStep:0.1, envelope8ms:{min:0.25} });
const qualityBase = () => ({
  cases:[{enabled:true,stereo:'identical',channels:[qualityChannel(),qualityChannel()]}],
  transitions:[{frequency:250,kind:'enabled',value:true,before:{channels:[qualityChannel()]},change:{channels:[qualityChannel()]},after:{channels:[qualityChannel()]}}],
  stress:{channels:[qualityChannel(),qualityChannel()]},
  alignments:[{sampleRate:48000,expectedFrame:288,dryFirst:288,dryLast:288,compressorFirst:288,compressorLast:288}],
});
const observe = run => {
  try { return {kind:'return',failures:run()}; }
  catch (error) { return {kind:'throw',name:error.name,message:error.message}; }
};

test('numeric API keeps the same function identity through the old module path', async () => {
  const old = await metrics();
  const current = await import('../scripts/audio-signal.mjs');
  assert.equal(old.measureSignal, current.measureSignal);
  assert.equal(old.channelDifferenceRms, current.channelDifferenceRms);
  assert.equal(old.rmsEnvelope, current.rmsEnvelope);
});

test('waveform summary reports peak, RMS and samples outside floating full scale', async () => {
  const {measureSignal} = await metrics();
  const report = measureSignal([-1.2,0,1.2], 48000);
  assert.equal(report.peak, 1.2); assert.equal(report.mean, 0);
  assert.ok(Math.abs(report.rms - 0.9797958971132712) < 1e-12);
  assert.equal(report.overFullScaleSamples, 2); assert.equal(report.maxAdjacentStep, 1.2);
});

test('coherent pure tone has its hand-derived RMS and negligible harmonic distortion', async () => {
  const {measureSignal} = await metrics();
  const report = measureSignal(tone(4800), 48000, 1000);
  assert.ok(Math.abs(report.rms - 0.3535533905932738) < 1e-9);
  assert.ok(Math.abs(report.fundamentalAmplitude - 0.5) < 1e-9);
  assert.ok(report.thdPercent < 1e-7);
});

test('third harmonic with one tenth fundamental amplitude measures ten percent THD', async () => {
  const {measureSignal} = await metrics();
  const report = measureSignal(tone(4800, 0.05), 48000, 1000);
  assert.ok(Math.abs(report.thdPercent - 10) < 1e-6);
  assert.ok(Math.abs(report.thdnPercent - 10) < 1e-6);
});

test('noncoherent analysis does not mislabel spectral leakage as distortion', async () => {
  const {measureSignal} = await metrics();
  const report = measureSignal(tone(4801), 48000, 1000);
  assert.equal(report.thdPercent, null); assert.equal(report.spectralReason, 'non-coherent-window');
});

test('nonfinite or empty waveforms cannot receive a clean quality result', async () => {
  const {measureSignal} = await metrics();
  assert.throws(() => measureSignal([0,NaN],48000), /non-finite/);
  assert.throws(() => measureSignal([],48000), /samples required/);
});

test('stereo residual distinguishes identical channels from a silent partner', async () => {
  const {channelDifferenceRms} = await metrics();
  assert.equal(channelDifferenceRms([0.1,-0.1,0],[0.1,-0.1,0]), 0);
  assert.ok(Math.abs(channelDifferenceRms([0.1,-0.1,0],[0,0,0]) - 0.08164965809277261) < 1e-12);
});

test('local RMS envelope distinguishes a quieter interval without waveform phase bias', async () => {
  const {rmsEnvelope} = await metrics();
  const report = rmsEnvelope([0.5,-0.5,0.5,-0.5,1,-1,1,-1],1000,2);
  assert.equal(report.min,0.5); assert.equal(report.max,1); assert.equal(report.windowSamples,2);
});

test('numeric boundaries cover first and last samples, channel shape, and envelope windows', async t => {
  const { measureSignal, channelDifferenceRms, rmsEnvelope } = await metrics();
  const cases = [
    ['first and last waveform samples', () => measureSignal([1, 0, -1], 1000), report => {
      assert.equal(report.mean, 0); assert.equal(report.peak, 1); assert.equal(report.maxAdjacentStep, 1);
    }],
    ['equal one-sample stereo channels', () => channelDifferenceRms([1], [-1]), value => assert.equal(value, 2)],
    ['exact one-window envelope', () => rmsEnvelope([0.5, -0.5], 1000, 2), report => {
      assert.equal(report.windowSamples, 2); assert.equal(report.min, 0.5); assert.equal(report.max, 0.5);
    }],
  ];
  for (const [name, run, verify] of cases) await t.test(name, () => verify(run()));
  for (const run of [
    () => channelDifferenceRms([0], [0, 1]),
    () => channelDifferenceRms([0, Infinity], [0, 0]),
    () => channelDifferenceRms([0, 0], [0, NaN]),
    () => rmsEnvelope([0, Infinity], 1000, 1),
    () => rmsEnvelope([0], 1000, 2),
  ]) assert.throws(run);
});

test('quality gate rejects a silent enabled path instead of accepting zero baselines', async () => {
  const { audioQualityFailures } = await metrics();
  const channel = (rms, peak = rms) => ({ rms, peak, overFullScaleSamples: 0, maxAdjacentStep: 0.1, envelope8ms: { min: rms } });
  const silent = channel(0, 0), audible = channel(0.25, 0.5);
  const failures = audioQualityFailures({
    cases: [{ enabled: true, stereo: 'identical', channels: [silent, silent] }],
    transitions: [{ frequency: 250, kind: 'enabled', value: false, before: { channels: [silent] }, change: { channels: [silent] }, after: { channels: [audible] } }],
    stress: { channels: [silent, silent] },
    alignments: [{ sampleRate: 48000, expectedFrame: 288, dryFirst: 288, dryLast: 288, compressorFirst: 288, compressorLast: 288 }],
  });
  assert.ok(failures.some(value => value.includes('enabled-signal')));
  assert.ok(failures.some(value => value.includes('transition-signal')));
  assert.ok(failures.some(value => value.includes('stress-peak-low')));
});

test('quality gate rejects missing and negative delay alignment frames', async () => {
  const { audioQualityFailures } = await metrics();
  const channel = { rms: 0.25, peak: 0.98, overFullScaleSamples: 0, maxAdjacentStep: 0.1, envelope8ms: { min: 0.25 } };
  const base = {
    cases: [{ enabled: true, stereo: 'identical', channels: [channel, channel] }],
    transitions: [{ frequency: 250, kind: 'enabled', value: true, before: { channels: [channel] }, change: { channels: [channel] }, after: { channels: [channel] } }],
    stress: { channels: [channel, channel] },
  };
  for (const alignment of [{}, { sampleRate: -1, expectedFrame: -1, dryFirst: -1, dryLast: -1, compressorFirst: -1, compressorLast: -1 }]) {
    assert.ok(audioQualityFailures({ ...base, alignments: [alignment] }).some(value => value.includes('delay-alignment')));
  }
});

test('quality gate preserves the pinned raw compatibility oracle', async t => {
  const {audioQualityFailures} = await metrics();
  const golden = require('./fixtures/audio-quality-compatibility.json');
  assert.equal(golden.baselineCommit, 'b1b7b70980c30e25aafa0c87d5b2e92f643f422e');
  const cases = [
    {name:'omitted',run:()=>audioQualityFailures()},
    ...[['undefined',undefined],['number',7],['empty',{}],['null',null]].map(([name,input])=>({name,input})),
    {name:'minimal'},
    {name:'empty-cases',edit:q=>{q.cases=[];}},
    {name:'gain-only',edit:q=>{q.transitions=[{kind:'gain',value:1}];}},
    {name:'null-items',edit:q=>{q.cases=[null];q.transitions=[null];q.stress.channels=[null,null];q.alignments=[null];}},
    {name:'missing-transition',edit:q=>{q.transitions=[{frequency:250,kind:'enabled',value:true}];}},
    {name:'wrong-transition-container',edit:q=>{q.transitions[0].before.channels={};}},
    {name:'truthy-numbers',edit:q=>{q.cases[0].enabled=1;q.transitions[0].value=1;}},
    {name:'nan-frequency',edit:q=>{q.transitions[0].frequency=NaN;}},
    {name:'left-only',edit:q=>{q.cases[0].stereo='left-only';}},
    {name:'case-one-channel',edit:q=>{q.cases[0].channels.pop();}},
    {name:'case-three-channels',edit:q=>{q.cases[0].channels.push(qualityChannel());}},
    {name:'stress-one-channel',edit:q=>{q.stress.channels.pop();}},
    {name:'case-hole',edit:q=>{delete q.cases[0].channels[0];}},
    {name:'stress-hole',edit:q=>{delete q.stress.channels[0];}},
    {name:'baseline-step-missing',edit:q=>{delete q.transitions[0].before.channels[0].maxAdjacentStep;}},
    {name:'baseline-step-null',edit:q=>{q.transitions[0].before.channels[0].maxAdjacentStep=null;}},
    {name:'baseline-step-string',edit:q=>{q.transitions[0].before.channels[0].maxAdjacentStep='0.1';}},
    {name:'change-step-string',edit:q=>{q.transitions[0].change.channels[0].maxAdjacentStep='0.1';}},
    {name:'baseline-step-bigint',edit:q=>{q.transitions[0].before.channels[0].maxAdjacentStep=1n;}},
    {name:'baseline-step-symbol',copy:false,edit:q=>{q.transitions[0].before.channels[0].maxAdjacentStep=Symbol('step');}},
    {name:'peak-string',edit:q=>{q.stress.channels[0].peak='1';}},
    {name:'peak-undefined',edit:q=>{q.stress.channels[0].peak=undefined;}},
    {name:'peak-null',edit:q=>{q.stress.channels[0].peak=null;}},
    {name:'peak-nan',edit:q=>{q.stress.channels[0].peak=NaN;}},
    {name:'peak-infinity',edit:q=>{q.stress.channels[0].peak=Infinity;}},
    {name:'peak-symbol',copy:false,edit:q=>{q.stress.channels[0].peak=Symbol('peak');}},
    {name:'peak-object',copy:false,edit:q=>{q.stress.channels[0].peak={valueOf:()=>1};}},
    {name:'rms-equal',edit:q=>{q.cases[0].channels[0].rms=1e-4;}},
    {name:'rms-below',edit:q=>{q.cases[0].channels[0].rms=1e-4-Number.EPSILON;}},
    {name:'rms-nan',edit:q=>{q.cases[0].channels[0].rms=NaN;}},
    {name:'rms-infinity',edit:q=>{q.cases[0].channels[0].rms=Infinity;}},
    {name:'rms-negative',edit:q=>{q.cases[0].channels[0].rms=-1;}},
    {name:'envelope-equal',edit:q=>{q.transitions[0].change.channels[0].envelope8ms.min=0.25*0.95;}},
    {name:'envelope-below',edit:q=>{q.transitions[0].change.channels[0].envelope8ms.min=0.25*0.95-Number.EPSILON;}},
    {name:'step-equal',edit:q=>{q.transitions[0].change.channels[0].maxAdjacentStep=0.1+1e-6;}},
    {name:'step-above',edit:q=>{q.transitions[0].change.channels[0].maxAdjacentStep=0.1+1e-6+Number.EPSILON;}},
    {name:'peak-min',edit:q=>{q.stress.channels[0].peak=0.97;}},
    {name:'peak-below',edit:q=>{q.stress.channels[0].peak=0.97-Number.EPSILON;}},
    {name:'peak-max',edit:q=>{q.stress.channels[0].peak=0.9801;}},
    {name:'peak-above',edit:q=>{q.stress.channels[0].peak=0.98010001;}},
    {name:'over-full-scale',edit:q=>{q.stress.channels[0].overFullScaleSamples=1;}},
    {name:'missing-alignments',edit:q=>{q.alignments=[];}},
    ...[['frame-max',1023],['frame-above',1024],['frame-negative',-1],['frame-fraction',0.5],['frame-nan',NaN]].map(([name,value])=>({name,edit:q=>{
      for (const key of ['expectedFrame','dryFirst','dryLast','compressorFirst','compressorLast']) q.alignments[0][key]=value;
    }})),
    {name:'rate-missing',edit:q=>{delete q.alignments[0].sampleRate;}},
    {name:'rate-zero',edit:q=>{q.alignments[0].sampleRate=0;}},
  ];
  assert.deepEqual(cases.map(item=>item.name),golden.cases.map(item=>item.name));
  for (const [index,item] of cases.entries()) await t.test(item.name,()=>{
    const input=Object.hasOwn(item,'input')?item.input:qualityBase();
    item.edit?.(input);
    const before=item.copy===false?null:structuredClone(input);
    assert.deepEqual(observe(item.run||(()=>audioQualityFailures(input))),golden.cases[index].expected);
    if(item.copy!==false)assert.deepEqual(input,before);
  });
});

test('quality gate retains peak and container getter read order', async t => {
  const {audioQualityFailures} = await metrics();
  const rows=[
    ['undefined',undefined,['stress-channel-0/stress-peak-low'],2],
    ['null',null,['stress-channel-0/stress-peak-low'],2],
    ['zero',0,['stress-channel-0/stress-peak-low'],3],
    ['normal',0.98,[],3],['max',0.9801,[],3],['above',1,['stress-channel-0/peak=1'],4],
    ['nan',NaN,['stress-channel-0/stress-peak-low'],2],
    ['infinity',Infinity,['stress-channel-0/stress-peak-low','stress-channel-0/peak=Infinity'],3],
    ['string','1',['stress-channel-0/stress-peak-low','stress-channel-0/peak=1'],3],
    ['bigint',1n,['stress-channel-0/stress-peak-low','stress-channel-0/peak=1'],3],
    ['symbol',Symbol('peak'),null,2],
    ['object',{valueOf:()=>1},['stress-channel-0/stress-peak-low','stress-channel-0/peak=[object Object]'],3],
  ];
  for(const [name,value,failures,count]of rows)await t.test(name,()=>{
    const q=qualityBase(),trace=[];
    Object.defineProperty(q.stress.channels[0],'peak',{get(){trace.push('peak');return value;}});
    const result=observe(()=>audioQualityFailures(q));
    assert.deepEqual(result,failures===null?{kind:'throw',name:'TypeError',message:'Cannot convert a Symbol value to a number'}:{kind:'return',failures});
    assert.deepEqual(trace,Array(count).fill('peak'));
  });
  for(const [name,values,failures]of [
    ['changing-finite',[0.98,0.98,1,0.5],['stress-channel-0/peak=0.5']],
    ['changing-missing',[undefined,1,0.5],['stress-channel-0/stress-peak-low','stress-channel-0/peak=0.5']],
    ['changing-after-low',[0.98,0,undefined],['stress-channel-0/stress-peak-low']],
  ])await t.test(name,()=>{
    const q=qualityBase(),trace=[];
    Object.defineProperty(q.stress.channels[0],'peak',{get(){trace.push('peak');return values.at(trace.length-1);}});
    assert.deepEqual(audioQualityFailures(q),failures);assert.equal(trace.length,values.length);
  });
  const q=qualityBase(),trace=[];
  const caseChannels=q.cases[0].channels,stressChannels=q.stress.channels;
  Object.defineProperty(q.cases[0],'channels',{get(){trace.push('case-channels');return caseChannels;}});
  Object.defineProperty(q.stress,'channels',{get(){trace.push('stress-channels');return stressChannels;}});
  assert.deepEqual(audioQualityFailures(q),[]);
  assert.deepEqual(trace,['stress-channels','case-channels','case-channels','case-channels','stress-channels','stress-channels']);
});

test('quality threshold mutation fails the independent transition oracle', async () => {
  const {audioQualityFailures} = await metrics();
  const source=audioQualityFailures.toString(),anchor='baselineRms * 0.95';
  assert.equal(source.split(anchor).length,2);
  const mutant=Function(`return (${source.replace(anchor,'baselineRms * 0.90')})`)();
  const q=qualityBase();q.transitions[0].change.channels[0].envelope8ms.min=0.25*0.95-Number.EPSILON;
  const expected=['250Hz/on/rms'];
  assert.deepEqual(audioQualityFailures(q),expected);
  assert.deepEqual(mutant(q),[]);
  assert.throws(()=>assert.deepEqual(mutant(q),expected),{code:'ERR_ASSERTION'});
});
