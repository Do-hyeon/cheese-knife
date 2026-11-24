const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const vm=require('node:vm');
const l1=()=>import('../scripts/extension-e2e/audio-l1.mjs');

async function installedPolling(){
  const code=await fs.readFile(path.join(path.dirname(require.resolve('playwright-core/package.json')),'lib/coreBundle.js'),'utf8');
  const marker=code.indexOf('const success = predicate();'),start=code.lastIndexOf('const next = () => {',marker);
  const end=code.indexOf('next();',code.indexOf('\n            };',marker));
  assert.ok(marker>0&&start>=0&&end>marker,'installed polling boundary must be reviewed if Playwright changes');
  return code.slice(start,end+7);
}

test('installed Playwright polling ends on an async false Promise rather than polling again',async()=>{
  const code=await installedPolling();let calls=0,scheduled=0;
  const result=await new Promise((fulfill,reject)=>vm.runInNewContext(code,{aborted:false,predicate:()=>{calls++;return Promise.resolve(false);},fulfill,reject,polling:4,
    injected:{utils:{builtins:{setTimeout:()=>{scheduled++;},requestAnimationFrame:()=>{scheduled++;}}}}}));
  assert.equal(result,false);assert.equal(calls,1);assert.equal(scheduled,0);
});

async function clockPage(options={}){
  const polling=await installedPolling(),{installProcessingProbe}=await import('../scripts/audio-processing-probe.mjs');
  let frame=3840,wall=0,timers=0,sources=0,wanted=false,playing=false;
  const clicks=[],saved=[];
  const facts=()=>options.facts?.({sampleRate:48000,audioTime:frame/48000,contextState:'running',hidden:false,sources})??
    {sampleRate:48000,audioTime:frame/48000,contextState:'running',hidden:false,sources};
  const video={readyState:4,muted:true,volume:0,get currentTime(){return playing?(frame-3840)/48000:0;},async play(){playing=true;}};
  const probe={async action(input){
    if(input.kind==='facts')return {...facts(),video:{currentTime:video.currentTime}};
    if(input.kind==='l1-capture')throw Error('clock-fixture-stop');
    if(input.kind==='l1-partial')return {testOnly:true};
    if(input.kind!=='signal')throw Error('unexpected-action');
  }};
  const window={__knifeL1ColdContexts:0};
  Object.defineProperty(window,Symbol.for('cheese-knife.f01-processing-probe'),{value:probe});
  Object.defineProperty(window,Symbol.for('cheese-knife.runtime.v1'),{value:{ownerProtocol:3,configReady:true,mediaCurrent:()=>true,
    audio:{getReadback:()=>({sources,state:wanted?'on':'off',wanted,appliedGain:wanted?1.32:1})}}});
  const button={async click(){wanted=!wanted;sources=1;clicks.push({frame,wanted});}};
  const later=(fn,delay)=>{if(++timers>2000)throw Error('clock-test-loop');wall+=delay;if(!options.frozen)frame+=Math.round(delay*48);queueMicrotask(fn);return timers;};
  const globals={window,document:{querySelector:selector=>selector==='video'?video:button},Symbol,performance:{now:()=>wall},setTimeout:later};
  const evaluate=(fn,arg)=>vm.runInNewContext(`(${fn.toString()})(arg)`,{...globals,arg});
  const page={
    on(){},setDefaultTimeout(){},goto:async()=>{},bringToFront:async()=>{},locator:()=>button,
    evaluate:async(fn,arg)=>fn===installProcessingProbe?undefined:evaluate(fn,arg),
    waitForFunction:(fn,arg,options)=>new Promise((fulfill,reject)=>vm.runInNewContext(polling,{aborted:false,predicate:()=>evaluate(fn,arg),fulfill,reject,
      polling:options?.polling??4,injected:{utils:{builtins:{setTimeout:later,requestAnimationFrame:fn=>later(fn,4)}}}})),
    waitForTimeout:async delay=>{wall+=delay;frame+=Math.round(delay*48);},
  };
  const root=path.resolve('output/virtual-clock-test');
  const files={root,readFile:async()=>'<html></html>',writeFile:async(name,data)=>{saved.push({name,value:JSON.parse(data)});}};
  const context={on(){},route:async()=>{},addInitScript:async()=>{},newPage:async()=>page};
  return {page,clicks,saved,files,context,artifactPath:path.join(root,'artifacts'),wall:()=>wall};
}

test('installed scenario cannot toggle OFF/ON before the fixed source-clock targets',async()=>{
  const {runL1Scenario}=await l1(),h=await clockPage();
  await assert.rejects(()=>runL1Scenario({...h,worker:{evaluate:async()=>{}},extensionId:'a'.repeat(32)},h.files),/clock-fixture-stop/);
  assert.equal(h.clicks.length,3);
  assert.ok(h.clicks[1].frame>=77280,`OFF too early: ${h.clicks[1].frame}`);
  assert.ok(h.clicks[2].frame>=96000,`ON too early: ${h.clicks[2].frame}`);
  assert.ok(h.clicks[2].frame-h.clicks[1].frame>1728);
});

test('source-clock wait spans false reads and validates actual frame at the returned boundary',async()=>{
  const {waitL1Frame}=await l1(),h=await clockPage();assert.equal(typeof waitL1Frame,'function');
  const row=await waitL1Frame(h.page,77280);
  assert.ok(row.frame>=77280);assert.equal(row.targetFrame,77280);assert.ok(h.wall()>=1530);
  await assert.rejects(()=>waitL1Frame({evaluate:async()=>({frame:77279,targetFrame:77280,audioTime:77279/48000})},77280),/clock-early/);
});

for(const [name,options]of [
  ['stopped',{frozen:true}],['NaN',{facts:row=>({...row,audioTime:NaN})}],
  ['suspended',{facts:row=>({...row,contextState:'suspended'})}],['hidden',{facts:row=>({...row,hidden:true})}],
  ['wrong-rate',{facts:row=>({...row,sampleRate:44100})}],
])test('source-clock wait rejects '+name+' without a toggle',async()=>{
  const {waitL1Frame}=await l1(),h=await clockPage(options);assert.equal(typeof waitL1Frame,'function');
  await assert.rejects(()=>waitL1Frame(h.page,77280));assert.equal(h.clicks.length,0);assert.ok(h.wall()<=5000);
});

test('backwards source clock and hung fact requests fail within their budgets',async()=>{
  const {waitL1Frame}=await l1();assert.equal(typeof waitL1Frame,'function');let reads=0;
  const h=await clockPage({facts:row=>({...row,audioTime:reads++===0?.08:.07})});
  await assert.rejects(()=>waitL1Frame(h.page,77280),/clock/);
  const nativeTimer=global.setTimeout;global.setTimeout=(fn,delay,...args)=>nativeTimer(fn,delay===5000?5:delay,...args);
  try{await assert.rejects(()=>waitL1Frame({evaluate:()=>new Promise(()=>{})},77280),/audio-operation-timeout/);}
  finally{global.setTimeout=nativeTimer;}
});

test('request-time guard rejects early actual requests while preserving fixed targets',async()=>{
  const {l1RequestTiming}=await l1();assert.equal(typeof l1RequestTiming,'function');
  const raw={commands:[{requestedFrame:1920},{requestedFrame:77280},{requestedFrame:96000}]};
  assert.deepEqual(l1RequestTiming(raw,.08).map(row=>row.targetFrame),[77280,96000]);
  for(const frames of [[1920,6272,7680],[1920,77279,96000],[1920,77280,95999]])
    assert.throws(()=>l1RequestTiming({commands:frames.map(requestedFrame=>({requestedFrame}))},.08));
});

test('a stopped source clock fails the real scenario before either fixed-time toggle',async()=>{
  const {runL1Scenario}=await l1(),h=await clockPage({frozen:true});
  await assert.rejects(()=>runL1Scenario({...h,worker:{evaluate:async()=>{}},extensionId:'a'.repeat(32)},h.files),/clock-timeout/);
  assert.equal(h.clicks.length,1,'only the initial ON is allowed before the stalled clock is rejected');
  assert.match(h.saved.at(-1).value.error,/clock-timeout/);
});
