const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliverScoped: deliver, playerHTML, flush, clock } = require('./helpers.cjs');

function setup(t, suspended = false, manualClock = false, suppliedConfig = { compressorAttack: 0 }, failures = {}) {
  const dom = page(playerHTML);
  const time=failures.clock?clock(dom):undefined;
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'currentSrc', { value: 'blob:https://chzzk.naver.com/test-media', configurable: true });
  const parameter = value => ({ value, events: [], setValueAtTime(next, at) { this.events.push(['set', next, at]); this.value = next; }, cancelScheduledValues(at) { this.events.push(['cancel', at]); }, linearRampToValueAtTime(next, at) { this.events.push(['ramp', next, at]); this.value = next; } });
  const nodes = [];
  const node = type => { const value = { type, outputs: new Set(), connect(dest) { this.outputs.add(dest); }, disconnect() { this.outputs.clear(); } }; nodes.push(value); return value; };
  let resolveResume;
  let context;
  let sources = 0;
  let gains = 0;
  dom.window.AudioContext = class {
    constructor() { this.state = suspended ? 'suspended' : 'running'; this.destination = node('destination'); this.currentTime = 0; this.sampleRate = failures.sampleRate || 48000; context = this; }
    resume() {
      if (failures.resumeReject) return Promise.reject(new Error('resume unavailable'));
      return new Promise(resolve => { resolveResume = () => { this.state = 'running'; resolve(); }; });
    }
    createMediaElementSource(element) { if(failures.sourceVideos)assert.ok(failures.sourceVideos.has(element));else assert.equal(element, video);sources++;failures.onSource?.(dom);return node('source'); }
    createGain() {
      gains++;
      if (failures.gainAt === gains) throw new Error('gain unavailable');
      return Object.assign(node('gain'), { gain: parameter(1) });
    }
    createDelay(maxDelayTime) {
      if (failures.delay) throw new Error('delay unavailable');
      return Object.assign(node('delay'), { maxDelayTime, delayTime: parameter(0) });
    }
    createWaveShaper() {
      if (failures.limiter) throw new Error('limiter unavailable');
      return Object.assign(node('limiter'), { curve: null, oversample: 'none' });
    }
    createDynamicsCompressor() {
      if (failures.compressor) throw new Error('compressor unavailable');
      const compressor = Object.assign(node('compressor'), Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key => [key, parameter(0)])));
      Object.defineProperty(compressor, 'foreignParameter', { enumerable: true, value: parameter(77) });
      return compressor;
    }
  };
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js'); deliver(dom, suppliedConfig);
  // Exercise the controller's own numeric clamps, independently of the v2 projection decoder.
  if (!runtime(dom).configReady) deliver(dom, {});
  runtime(dom).config = suppliedConfig;
  const statusChanges = [];
  const setStatus = runtime(dom).setStatus;
  runtime(dom).setStatus = (...args) => { statusChanges.push(args); return setStatus(...args); };
  if (failures.storage) Object.defineProperty(dom.window, 'localStorage', { configurable: true, get() { throw new Error('storage unavailable'); } });
  let tick;
  if (manualClock) dom.window.setInterval = callback => { tick = callback; return 9001; };
  load(dom, 'web/audio.js');
  return { dom, video, audio: runtime(dom).audio, nodes, statusChanges, time, tick: () => tick(), sources: () => sources, resume: () => resolveResume(), context: () => context };
}

test('compressor applies only five explicit parameters with zero, bounds, and fallbacks', async t => {
  const cases = [
    {
      name: 'zero and boundary values',
      config: { compressorThreshold: 0, compressorKnee: 0, compressorRatio: 1, compressorAttack: 0, compressorRelease: 1 },
      expected: { threshold: 0, knee: 0, ratio: 1, attack: 0, release: 1 },
    },
    {
      name: 'out-of-range, nonfinite, and missing values',
      config: { compressorThreshold: -101, compressorKnee: 41, compressorRatio: NaN, compressorRelease: 2 },
      expected: { threshold: -50, knee: 40, ratio: 12, attack: 0, release: 0.25 },
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async child => {
      const { audio, video, nodes } = setup(child, false, false, fixture.config);
      await audio.setEnabled(video, true);
      const compressor = nodes.find(value => value.type === 'compressor');
      assert.deepEqual(Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, compressor[key].value])), fixture.expected);
      assert.equal(compressor.foreignParameter.value, 77);
    });
  }
});

test('scoped suspension bypasses wet output but preserves wanted and one source for resume', async t => {
  const {audio,video,nodes,sources}=setup(t);
  assert.equal(typeof audio.suspend,'function');assert.equal(typeof audio.resumeWanted,'function');
  audio.suspend(video);assert.equal(sources(),0);assert.equal(nodes.length,0);
  assert.equal(await audio.setEnabled(video,true),'on');audio.suspend(video);
  assert.equal(audio.getState(video),'pending');assert.equal(sources(),1);
  const gains=nodes.filter(node=>node.type==='gain');assert.equal(gains[0].gain.value,1);assert.equal(gains[1].gain.value,0);
  assert.equal(await audio.resumeWanted(video),'on');assert.equal(sources(),1);assert.equal(gains[1].gain.value,1);
});

test('scoped suspension retires an old asynchronous resume before source creation', async t => {
  const {audio,video,resume,sources}=setup(t,true);
  assert.equal(typeof audio.suspend,'function');const old=audio.setEnabled(video,true);await flush();audio.suspend(video);resume();
  await old;assert.equal(audio.getState(video),'pending');assert.equal(sources(),0);
  assert.equal(await audio.resumeWanted(video),'on');assert.equal(sources(),1);
});

test('manual OFF during scoped pending wins over retained automatic or manual wanted', async t => {
  const {audio,video,sources}=setup(t);assert.equal(typeof audio.suspend,'function');await audio.setEnabled(video,true);
  audio.suspend(video);assert.equal(await audio.setEnabled(video,false),'off');assert.equal(await audio.resumeWanted(video),'off');
  assert.equal(sources(),1);assert.equal(audio.getState(video),'off');
});
test('location change during source creation never engages the previous channel wet path',async t=>{
  const {audio,video,nodes,sources}=setup(t,false,false,{}, {onSource:dom=>{
    dom.reconfigure({url:'https://chzzk.naver.com/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'});runtime(dom).reconcile();
  }});
  const state=await audio.setEnabled(video,true);assert.notEqual(state,'on');assert.equal(sources(),1);
  const gains=nodes.filter(node=>node.type==='gain');assert.equal(gains[0].gain.value,1);assert.equal(gains[1].gain.value,0);
});
function scopedAudioFrame(dom,base,effective,{phase='ready',binding=1,sequence=2,channel=false}={}) {
  const api=runtime(dom);dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window,origin:dom.window.location.origin,
    data:{namespace:'cheese-knife',protocol:2,type:'config',requestId:api.mediaRequestId,context:{...api.media.context},deliverySequence:sequence,
      baseConfig:base,effectiveConfig:effective,i18n:api.i18n,version:phase==='pending'?{globalRevision:null,mediaRevision:null}:{globalRevision:0,mediaRevision:channel?1:0},
      profileState:channel?'scoped':'global',revisionStatus:phase==='pending'?'repair-required':'ready',mediaPhase:phase,
      audioBindingGeneration:binding,audioKind:channel?'channel':'global',videoKind:'global'}}));
}
for(const manual of ['none','on','off'])test('limited fallback to confirmed default OFF preserves '+manual+' intent',async t=>{
  const {dom,audio,video,sources,nodes,time}=setup(t,false,false,{}, {clock:true}),api=runtime(dom);
  api.revalidateMedia();const base={...api.baseConfig,compressorDefault:true};scopedAudioFrame(dom,base,base,{phase:'pending',binding:0,sequence:1});
  load(dom,'web/player.js');assert.equal(sources(),0);
  if(manual==='on')dom.window.document.querySelector('.knife-comp button').click();assert.equal(sources(),0);
  await time.advance(2100);await flush();assert.equal(api.media.phase,'limited');assert.equal(audio.getState(video),'on');assert.equal(sources(),1);
  if(manual==='off')dom.window.document.querySelector('.knife-comp button').click();
  scopedAudioFrame(dom,base,{...base,compressorDefault:false},{channel:true,sequence:2});await flush();
  assert.equal(audio.getState(video),manual==='on'?'on':'off');assert.equal(sources(),1);
  const gains=nodes.filter(node=>node.type==='gain');assert.equal(gains[1].gain.value,manual==='on'?1:0);
  if(manual==='off'){scopedAudioFrame(dom,base,base,{channel:true,sequence:3});await flush();assert.equal(audio.getState(video),'off');}
});
for(const wanted of [true,false])test('same-video PZP rewrap preserves manual '+wanted+' without consuming a new default entry',async t=>{
  const {dom,audio,video,sources}=setup(t,false,false,{compressorDefault:!wanted}),api=runtime(dom);load(dom,'web/player.js');
  dom.window.document.querySelector('.knife-comp button').click();await flush();assert.equal(audio.getState(video),wanted?'on':'off');
  const pzp=dom.window.document.querySelector('.pzp-pc'),replacement=pzp.cloneNode(false),before=api.media.context.playerGeneration;
  while(pzp.firstChild)replacement.append(pzp.firstChild);pzp.replaceWith(replacement);api.reconcile();
  assert.ok(api.media.context.playerGeneration>before);assert.equal(api.media.phase,'pending');
  deliver(dom,{compressorDefault:!wanted});await flush();assert.equal(audio.getState(video),wanted?'on':'off');assert.equal(sources(),1);
});
for(const manual of ['none','on','off'])test('genuine video A-B-A replacement retires previous '+manual+' intent',async t=>{
  const {dom,audio,video,sources,nodes}=setup(t,false,false,{compressorDefault:true}),api=runtime(dom);load(dom,'web/player.js');await flush();
  if(manual!=='none'){dom.window.document.querySelector('.knife-comp button').click();await flush();
    if(manual==='on'){dom.window.document.querySelector('.knife-comp button').click();await flush();}}
  const other=video.cloneNode();Object.defineProperty(other,'currentSrc',{value:'',configurable:true});
  video.replaceWith(other);api.reconcile();deliver(dom,{compressorDefault:true});await flush();
  assert.equal(audio.getState(video),'off');other.replaceWith(video);api.reconcile();
  assert.equal(api.media.phase,'pending');assert.equal(nodes.filter(node=>node.type==='gain')[1].gain.value,0);
  deliver(dom,{compressorDefault:true});await flush();assert.equal(api.mediaCurrent(),true);
  assert.equal(audio.getState(video),'on');assert.equal(dom.window.document.querySelector('.knife-comp button').getAttribute('aria-pressed'),'true');
  assert.equal(nodes.filter(node=>node.type==='gain')[1].gain.value,1);assert.equal(sources(),1);
});
for(const manual of ['none','on','off'])test('same-video source loss and recovery preserves '+manual+' intent and truthful wet state',async t=>{
  const {dom,audio,video,sources,nodes}=setup(t,false,false,{compressorDefault:manual!=='on'}),api=runtime(dom);load(dom,'web/player.js');await flush();
  if(manual!=='none'){dom.window.document.querySelector('.knife-comp button').click();await flush();}
  const wanted=manual!=='off',gains=nodes.filter(node=>node.type==='gain');assert.equal(audio.getState(video),wanted?'on':'off');
  Object.defineProperty(video,'currentSrc',{value:'',configurable:true});video.dispatchEvent(new dom.window.Event('emptied'));api.reconcile();await flush();
  assert.notEqual(audio.getState(video),'on');assert.equal(dom.window.document.querySelector('.knife-comp button').getAttribute('aria-pressed'),'false');
  assert.equal(gains[0].gain.value,1);assert.equal(gains[1].gain.value,0);
  Object.defineProperty(video,'currentSrc',{value:'blob:https://chzzk.naver.com/reloaded',configurable:true});
  video.dispatchEvent(new dom.window.Event('loadedmetadata'));api.reconcile();await flush();
  assert.equal(api.mediaCurrent(),true);assert.equal(audio.getState(video),wanted?'on':'off');
  assert.equal(gains[1].gain.value,wanted?1:0);assert.equal(sources(),1);
});
for(const wanted of [false,true])test('manual '+wanted+' while source is empty controls recovery without a second source',async t=>{
  const {dom,audio,video,sources,nodes}=setup(t,false,false,{compressorDefault:true}),api=runtime(dom);load(dom,'web/player.js');await flush();
  Object.defineProperty(video,'currentSrc',{value:'',configurable:true});api.reconcile();await flush();
  const button=dom.window.document.querySelector('.knife-comp button');button.click();if(wanted)button.click();
  Object.defineProperty(video,'currentSrc',{value:'blob:https://chzzk.naver.com/reloaded',configurable:true});api.reconcile();await flush();
  assert.equal(audio.getState(video),wanted?'on':'off');assert.equal(nodes.filter(node=>node.type==='gain')[1].gain.value,wanted?1:0);
  assert.equal(sources(),1);
});
test('removing and reinserting a video retires its old manual OFF entry',async t=>{
  const {dom,audio,video,sources}=setup(t,false,false,{compressorDefault:true}),api=runtime(dom);load(dom,'web/player.js');await flush();
  dom.window.document.querySelector('.knife-comp button').click();assert.equal(audio.getState(video),'off');
  const parent=video.parentElement;video.remove();api.reconcile();deliver(dom,{compressorDefault:true});await flush();
  parent.append(video);api.reconcile();deliver(dom,{compressorDefault:true});await flush();
  assert.equal(audio.getState(video),'on');assert.equal(sources(),1);
});
test('inactive audio graphs cannot overwrite the selected ON player status',async t=>{
  const sourceVideos=new Set(),{dom,audio,video,nodes,sources}=setup(t,false,false,{compressorDefault:true},{sourceVideos}),api=runtime(dom);
  sourceVideos.add(video);load(dom,'web/player.js');await flush();
  const other=video.cloneNode();Object.defineProperty(other,'currentSrc',{value:'blob:https://chzzk.naver.com/other',configurable:true});
  sourceVideos.add(other);video.replaceWith(other);api.reconcile();deliver(dom,{compressorDefault:true});await flush();
  assert.equal(audio.getState(video),'off');assert.equal(audio.getState(other),'on');assert.equal(sources(),2);
  api.notify();assert.equal(nodes.filter(node=>node.type==='gain')[4].gain.value,1);
  assert.equal(audio.getState(other),'on');assert.equal(api.statuses.compressor.state,'ready');
});
test('fallback without any new bridge frame uses unconfirmed authority rather than the previous channel binding',async t=>{
  const {dom,audio,video,time}=setup(t,false,false,{}, {clock:true}),api=runtime(dom);
  const base={...api.baseConfig,compressorDefault:true};scopedAudioFrame(dom,base,{...base,compressorDefault:false},{channel:true});
  load(dom,'web/player.js');assert.equal(audio.getState(video),'off');api.revalidateMedia();
  await time.advance(2100);await flush();assert.equal(api.media.phase,'limited');assert.equal(audio.getState(video),'on');
  scopedAudioFrame(dom,base,{...base,compressorDefault:false},{channel:true,sequence:3});await flush();
  assert.equal(audio.getState(video),'off');
});
test('default false to true requests once and subsequent default false does not force manual OFF or current ON',async t=>{
  const {dom,audio,video,sources}=setup(t),api=runtime(dom);load(dom,'web/player.js');
  const base={...api.baseConfig};scopedAudioFrame(dom,base,{...base,compressorDefault:true},{channel:true});await flush();
  assert.equal(audio.getState(video),'on');assert.equal(sources(),1);
  scopedAudioFrame(dom,base,{...base,compressorDefault:false},{channel:true,sequence:3});await flush();assert.equal(audio.getState(video),'on');
  dom.window.document.querySelector('.knife-comp button').click();assert.equal(audio.getState(video),'off');
  scopedAudioFrame(dom,base,{...base,compressorDefault:true},{channel:true,sequence:4});await flush();
  assert.equal(audio.getState(video),'off');assert.equal(sources(),1);
});

test('suspended context creates no media source before running and off cancels late resume', async t => {
  const { audio, video, sources, resume } = setup(t, true);
  const enabling = audio.setEnabled(video, true);
  assert.equal(audio.getState(video), 'pending');
  assert.equal(sources(), 0);
  await audio.setEnabled(video, false);
  resume(); await enabling;
  assert.equal(audio.getState(video), 'off');
  assert.equal(sources(), 0);
});

test('repeated toggles and UI reuse share one media source and have one bypass route', async t => {
  const { audio, video, sources, nodes } = setup(t);
  for (let index = 0; index < 20; index++) await audio.setEnabled(video, index % 2 === 0);
  assert.equal(sources(), 1);
  assert.equal(audio.getState(video), 'off');
  const source = nodes.find(value => value.type === 'source');
  const [delay] = [...source.outputs];
  const [dry] = [...delay.outputs];
  assert.equal(dry.gain.value, 1);
  const compressor = nodes.find(value => value.type === 'compressor');
  assert.equal(compressor.attack.value, 0);
  assert.equal(compressor.threshold.value, -50);
});

test('dry bypass matches the Chromium compressor pre-delay at 48kHz', async t => {
  const { audio, video, nodes } = setup(t);
  await audio.setEnabled(video, true);
  const source = nodes.find(value => value.type === 'source');
  const delay = nodes.find(value => value.type === 'delay');
  assert.ok(delay, 'the dry branch must own a delay node');
  assert.equal(delay.maxDelayTime, 0.02);
  assert.equal(delay.delayTime.value, 0.006);
  assert.deepEqual([...source.outputs].map(value => value.type).sort(), ['compressor', 'delay']);
  const [dry] = [...delay.outputs];
  assert.equal(dry.type, 'gain');
  assert.equal([...dry.outputs][0].type, 'destination');
});

test('dry delay follows Chromium compressor integer frames at fractional and capped rates', async t => {
  for (const [sampleRate, expectedFrames] of [[44100, 264], [48000, 288], [192000, 1023]]) {
    await t.test(String(sampleRate), async child => {
      const { audio, video, nodes } = setup(child, false, false, { compressorAttack: 0 }, { sampleRate });
      await audio.setEnabled(video, true);
      const delay = nodes.find(value => value.type === 'delay');
      assert.equal(delay.delayTime.value, expectedFrames / sampleRate);
    });
  }
});

test('delay construction failure leaves native media unintercepted', async t => {
  const { audio, video, sources } = setup(t, false, false, { compressorAttack: 0 }, { delay: true });
  assert.equal(await audio.setEnabled(video, true), 'unavailable');
  assert.equal(sources(), 0);
});

test('wet limiter is identity below point nine and bounded by point nine eight', async t => {
  const { audio, video, nodes } = setup(t);
  await audio.setEnabled(video, true);
  const compressor = nodes.find(value => value.type === 'compressor');
  const [userGain] = [...compressor.outputs];
  const [limiter] = [...userGain.outputs];
  assert.equal(limiter.type, 'limiter');
  assert.equal(limiter.oversample, 'none');
  assert.equal(limiter.curve.length, 4097);
  assert.equal([...limiter.outputs][0].type, 'gain');
  const curve = limiter.curve;
  assert.ok(Math.abs(curve[0] + 0.98) < 1e-6);
  assert.ok(Math.abs(curve.at(-1) - 0.98) < 1e-6);
  for (let index = 0; index < curve.length; index++) {
    const x = 2 * index / (curve.length - 1) - 1;
    assert.equal(Number.isFinite(curve[index]), true);
    if (index) assert.ok(curve[index] >= curve[index - 1]);
    assert.ok(Math.abs(curve[index] + curve.at(-1 - index)) < 1e-6);
    if (Math.abs(x) <= 0.9) assert.ok(Math.abs(curve[index] - x) < 1e-6);
    assert.ok(Math.abs(curve[index]) <= 0.980001);
  }
});

test('limiter construction failure leaves native media unintercepted', async t => {
  const { audio, video, sources } = setup(t, false, false, { compressorAttack: 0 }, { limiter: true });
  assert.equal(await audio.setEnabled(video, true), 'unavailable');
  assert.equal(sources(), 0);
});

test('audio preparation failure before source creation preserves the native path', async t => {
  for (const failures of [{ gainAt: 1 }, { gainAt: 2 }, { delay: true }, { compressor: true }, { gainAt: 3 }, { limiter: true }]) {
    await t.test(JSON.stringify(failures), async child => {
      const { audio, video, sources, statusChanges } = setup(child, false, false, { compressorAttack: 0 }, failures);
      assert.equal(await audio.setEnabled(video, true), 'unavailable');
      assert.equal(sources(), 0);
      assert.equal(statusChanges.every(([feature]) => feature === 'compressor'), true);
    });
  }
});

test('invalid or inaccessible gain storage falls back without blocking audio', async t => {
  for (const storage of ['invalid', 'inaccessible']) {
    await t.test(storage, async child => {
      const { audio, video, dom, nodes } = setup(child, false, false, { compressorAttack: 0 }, { storage: storage === 'inaccessible' });
      if (storage === 'invalid') dom.window.localStorage.setItem('knifeGain', 'not-a-number');
      assert.equal(await audio.setEnabled(video, true), 'on');
      assert.equal([...nodes.find(value => value.type === 'compressor').outputs][0].gain.value, 1);
    });
  }
});

test('audio entry does not publish a partial controller after startup failure', t => {
  const dom = page(playerHTML);
  t.after(() => dom.window.close());
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js');
  const owner = runtime(dom);
  owner.createScope = () => ({ interval() { throw new Error('interval unavailable'); }, on() {}, dispose() {} });
  assert.throws(() => load(dom, 'web/audio.js'), /interval unavailable/);
  assert.equal(Object.hasOwn(owner, 'audio'), false);
});

test('audio entry preserves an existing foreign controller', t => {
  const dom = page(playerHTML);
  t.after(() => dom.window.close());
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js');
  const owner = runtime(dom);
  const foreign = Object.freeze({ owner: 'foreign' });
  owner.audio = foreign;
  load(dom, 'web/audio.js');
  assert.equal(owner.audio, foreign);
});

test('selected-video replacement during pending resume never intercepts the old media', async t => {
  const { dom, audio, video, sources, resume, statusChanges } = setup(t, true);
  const enabling = audio.setEnabled(video, true);
  const replacement = video.cloneNode();
  Object.defineProperty(replacement, 'currentSrc', { value: video.currentSrc });
  video.replaceWith(replacement);
  runtime(dom).reconcile();
  resume();
  assert.equal(await enabling, 'off');
  assert.equal(sources(), 0);
  assert.equal(statusChanges.filter(([feature]) => feature === 'mediaSettings').length,1);
  assert.equal(statusChanges.every(([feature]) => feature === 'compressor' || feature === 'mediaSettings'), true);
});

test('one throwing audio subscriber cannot block another subscriber', async t => {
  const { audio, video, statusChanges } = setup(t);
  let initialized = false;
  audio.subscribe(video, () => {
    if (initialized) throw new Error('subscriber failed');
    initialized = true;
  });
  const received = [];
  audio.subscribe(video, state => received.push(state));
  assert.equal(await audio.setEnabled(video, true), 'on');
  assert.deepEqual(received, ['off', 'pending', 'on']);
  assert.equal(statusChanges.every(([feature]) => feature === 'compressor'), true);
});

test('final pagehide is idempotent and a late retirement callback is inert', async t => {
  const { dom, audio, video, nodes, tick, statusChanges } = setup(t, false, true);
  await audio.setEnabled(video, true);
  const source = nodes.find(value => value.type === 'source');
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
  video.remove();
  let now = 10000;
  dom.window.Date.now = () => now;
  tick(); now += 6000; tick();
  assert.equal(source.outputs.size, 2);
  assert.equal(audio.getState(video), 'off');
  assert.equal(statusChanges.filter(([feature, state]) => feature === 'compressor' && state === 'disabled').length, 1);
  assert.equal(statusChanges.every(([feature]) => feature === 'compressor'), true);
});

test('final pagehide blocks a pending resume and later enable calls', async t => {
  for (const rejected of [false, true]) {
    await t.test(rejected ? 'resume rejects' : 'resume resolves', async child => {
      const { dom, audio, video, sources, resume, statusChanges } = setup(child, true, false, { compressorAttack: 0 }, { resumeReject: rejected });
      const enabling = audio.setEnabled(video, true);
      const beforeFinal = statusChanges.length;
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
      if (!rejected) resume();
      assert.equal(await enabling, 'off');
      assert.equal(await audio.setEnabled(video, true), 'off');
      assert.equal(sources(), 0);
      assert.equal(statusChanges.length, beforeFinal);
    });
  }
});

test('invalid stored gain is normalized before being applied to an audio graph', async t => {
  const { audio, video, dom, nodes } = setup(t);
  dom.window.localStorage.setItem('knifeGain', 'NaN');
  await audio.setEnabled(video, true);
  assert.equal(audio.setGain(video, Infinity), 1);
  const gains = nodes.filter(value => value.type === 'gain');
  assert.equal(gains.every(value => Number.isFinite(value.gain.value)), true);
});

test('unsupported cross-origin media remains native without source interception', async t => {
  const { audio, video, sources } = setup(t);
  Object.defineProperty(video, 'currentSrc', { value: 'https://foreign.invalid/video.mp4' });
  await audio.setEnabled(video, true);
  assert.equal(audio.getState(video), 'unavailable');
  assert.equal(sources(), 0);
});

test('retired paused media retains audible bypass when reused with compression off', async t => {
  const { dom, audio, video, nodes, tick, sources } = setup(t, false, true);
  await audio.setEnabled(video, true); await audio.setEnabled(video, false);
  const container = video.parentElement; video.remove();
  let now = 10000; dom.window.Date.now = () => now;
  tick(); now += 6000; tick(); container.append(video); runtime(dom).reconcile();
  const source = nodes.find(node => node.type === 'source');
  const delay = [...source.outputs].find(node => node.type === 'delay');
  const dry = delay && [...delay.outputs].find(node => node.type === 'gain' && node.gain.value === 1);
  assert.ok(dry, 'intercepted video must retain an audible dry path without enabling compression');
  assert.equal(dry.outputs.has(nodes.find(node => node.type === 'destination')), true);
  assert.equal(audio.getState(video), 'off'); assert.equal(sources(), 1);
});

test('bfcache freeze preserves requested compression and its output path', async t => {
  const { dom, audio, video, sources, nodes } = setup(t);
  await audio.setEnabled(video, true);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(audio.getState(video),'pending');const gains=nodes.filter(node=>node.type==='gain');
  assert.equal(gains[0].gain.value,1);assert.equal(gains[1].gain.value,0);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(audio.getState(video),'pending');deliver(dom,{});await audio.resumeWanted(video);
  assert.equal(audio.getState(video), 'on');
  assert.equal(sources(),1);
});

test('sidebar identity changes and player UI reparenting preserve compression', async t => {
  const { dom, audio, video, sources } = setup(t);
  load(dom, 'web/player.js'); await audio.setEnabled(video, true);
  dom.window.document.body.insertAdjacentHTML('beforeend', '<aside id="sidebar"></aside>');
  runtime(dom).reconcile();
  assert.equal(audio.getState(video), 'on');
  const layout = dom.window.document.getElementById('live_player_layout');
  const pzp = layout.querySelector('.pzp-pc');
  const replacement = layout.cloneNode(false); layout.replaceWith(replacement); replacement.append(pzp);
  runtime(dom).reconcile();
  assert.equal(audio.getState(video), 'on'); assert.equal(sources(), 1);
  assert.equal(dom.window.document.querySelectorAll('.knife-comp').length, 1);
});

test('Gain changes schedule a short transition while UI and stored target update immediately', async t => {
  const { audio, video, nodes, context, dom } = setup(t);
  await audio.setEnabled(video, true);
  const compressor = nodes.find(node => node.type === 'compressor');
  const parameter = [...compressor.outputs][0].gain;
  context().currentTime = 1;
  assert.equal(audio.setGain(video, 1.5), 1.5);
  assert.equal(dom.window.localStorage.getItem('knifeGain'), '1.5');
  assert.deepEqual(parameter.events.slice(-3), [['cancel',1],['set',1,1],['ramp',1.5,1.01]]);
});

test('rapid Gain retargeting continues from the in-flight value instead of jumping to the previous target', async t => {
  const { audio, video, nodes, context } = setup(t);
  await audio.setEnabled(video, true);
  const parameter = [...nodes.find(node => node.type === 'compressor').outputs][0].gain;
  context().currentTime = 2; audio.setGain(video, 2);
  context().currentTime = 2.005; audio.setGain(video, 0);
  const [cancel,anchor,end] = parameter.events.slice(-3);
  assert.deepEqual(cancel,['cancel',2.005]);
  assert.equal(anchor[0],'set'); assert.ok(Math.abs(anchor[1]-1.5)<1e-10);
  assert.equal(anchor[2],2.005); assert.equal(end[0],'ramp'); assert.equal(end[1],0);
  assert.ok(Math.abs(end[2]-2.015)<1e-10);
});

test('unchanged Gain during configuration or repeated enable does not restart its transition', async t => {
  const { audio, video, nodes, context } = setup(t);
  await audio.setEnabled(video, true);
  const parameter = [...nodes.find(node => node.type === 'compressor').outputs][0].gain;
  context().currentTime = 3; audio.setGain(video, 1.5);
  const count = parameter.events.length;
  context().currentTime = 3.002; audio.configure(); await audio.setEnabled(video, true);
  assert.equal(parameter.events.length, count);
  context().currentTime = 3.1; audio.setGain(video, 0);
  assert.deepEqual(parameter.events.slice(-3),[['cancel',3.1],['set',1.5,3.1],['ramp',0,3.11]]);
});

test('source-creation retry initializes the replacement Gain node at the stored target', async t => {
  const { dom, audio, video, nodes, context } = setup(t);
  audio.setGain(video, 1.5);
  // First attempt creates the context but fails before intercepting the video.
  const original = video.currentSrc;
  await audio.setEnabled(video, true);
  // Reproduce a failure on a fresh media entry with the already-created context.
  const second = video.cloneNode(); video.replaceWith(second);
  Object.defineProperty(second,'currentSrc',{value:original});
  runtime({window:second.ownerDocument.defaultView}).reconcile();
  deliver(dom,{});
  const createSource = context().createMediaElementSource;
  context().createMediaElementSource = () => { throw new Error('temporary source failure'); };
  await audio.setEnabled(second,true);
  assert.equal(audio.getState(second),'unavailable');
  context().createMediaElementSource = () => ({ outputs:new Set(),connect(node){this.outputs.add(node);},disconnect(){this.outputs.clear();} });
  await audio.setEnabled(second,true);
  assert.equal(audio.getState(second),'on');
  const lastCompressor = nodes.filter(node=>node.type==='compressor').at(-1);
  assert.equal([...lastCompressor.outputs][0].gain.value,1.5);
  context().createMediaElementSource = createSource;
});
