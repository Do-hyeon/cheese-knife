const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const esbuild = require('esbuild');
const {setup} = require('./audio-fixture.cjs');
const {runtime, flush} = require('./helpers.cjs');

const compile = (source, extra = {}) => esbuild.buildSync({entryPoints:[source], bundle:true,
  write:false, format:'iife', platform:'browser', ...extra}).outputFiles[0].text;
const controllerCode = compile('src/main/features/audio/controller.ts', {globalName:'CoupledAudio'});
const workletCode = compile('src/main/features/audio/transition-worklet.ts');
test.after(() => esbuild.stop());
const microtasks = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
const config = {compressorEnabled:true, normalizerEnabled:true, normalizerTargetDbfs:-18,
  gainInherited:false, audioGain:1.32, eqEnabled:true, eq63:3, eq125:-6, eq500:4,
  eq1000:-2, eq2000:1, eq4000:-5, eq8000:6};

async function coupled(t,sampleRate=48000,reentryCase=false) {
  const settings=reentryCase?{compressorEnabled:false,normalizerEnabled:true,normalizerTargetDbfs:-20,gainInherited:false,audioGain:1,eqEnabled:false}:config;
  const h = setup(t, false, true, {...settings}, {clock:true, manualWorkletAck:true,sampleRate});
  let frame=0, wall=1, nextInterval=10000;
  const ledger=[],commands=[],blocks=[];let recording=false;
  const event=(direction,packet)=>{if(reentryCase)ledger.push({order:ledger.length+1,direction,packet:structuredClone(packet)});};
  const signal=n=>reentryCase?(n<0?0:Math.SQRT2*10**(-36/20)*Math.sin(2*Math.PI*1000*n/sampleRate+.37)):.1*Math.sin(2*Math.PI*750*n/sampleRate+.37);
  if(reentryCase){
    Object.defineProperty(h.video,'paused',{value:false,configurable:true});
    const create=h.dom.window.AudioContext.prototype.createAnalyser;
    h.dom.window.AudioContext.prototype.createAnalyser=function(){const node=create.call(this);node.getFloatTimeDomainData=buffer=>{node.reads++;for(let i=0;i<buffer.length;i++)buffer[i]=signal(frame-buffer.length+i);};return node;};
  }
  const intervals=new Map();
  h.dom.window.Date.now=()=>wall;
  h.dom.window.setInterval=(fn,ms)=>{const id=++nextInterval;intervals.set(id,{fn,ms,next:frame+ms*sampleRate/1000});return id;};
  h.dom.window.clearInterval=id=>intervals.delete(id);
  const BaseNode=h.dom.window.AudioWorkletNode;
  h.dom.window.AudioWorkletNode=class extends BaseNode {
    constructor(context,name,options) {
      super(context,name,options);
      this.incoming=[];this.outgoing=[];this.emitted=[];this.alive=true;this.closed=false;
      // No synthesized prepared/accepted/completed/retired responses are permitted.
      this.reply=()=>{throw Error('fake ACK used by coupled host');};
      this.port.postMessage=packet=>{
        const copy=structuredClone(packet);this.messages.push(copy);this.incoming.push(copy);event('send',copy);
        if(copy.kind==='configure'){this.commands.push(copy);if(reentryCase)commands.push({requestedFrame:frame,message:structuredClone(copy)});}
      };
      this.port.close=()=>{this.closed=true;};
      let Processor;
      const replies=this;
      this.box={sampleRate:context.sampleRate,currentFrame:frame,Float32Array,Float64Array,
        AudioWorkletProcessor:class {constructor(){this.port={onmessage:null,postMessage:packet=>{
          const copy=structuredClone(packet);replies.outgoing.push(copy);replies.emitted.push(copy);event('receive',copy);
        }};}},registerProcessor:(registered,ctor)=>{
          assert.equal(registered,name);Processor=ctor;
        }};
      vm.runInNewContext(workletCode,this.box);
      assert.ok(Processor);this.processor=new Processor(options);
    }
  };
  delete runtime(h.dom).audio;
  h.audio=h.dom.window.eval(controllerCode+'\nCoupledAudio;').installAudio(h.dom.window);
  await h.audio.prepareTransitionModule('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/web/audio-transition-worklet.js');
  const nodes=()=>h.nodes.filter(n=>n.type==='transition');
  const deliver=(node,packet,handler=node.port.onmessage)=>{
    assert.ok(node.emitted.includes(packet),'only actual Worklet replies can be delivered');
    handler?.({data:structuredClone(packet)});
  };
  const drain=()=>{for(const node of nodes())while(node.outgoing.length)deliver(node,node.outgoing.shift());};
  const step=async (count=128,send=true)=>{
    if(reentryCase)assert.equal(count,128,'reentry host advances through complete render quanta');
    h.context().currentTime=frame/h.context().sampleRate;
    if(reentryCase)for(const timer of intervals.values())if(timer.ms===100&&frame>=timer.next){timer.next+=sampleRate/10;timer.fn();}
    for(const node of nodes())if(node.alive&&!node.closed){
      node.box.currentFrame=frame;
      while(node.incoming.length)node.processor.port.onmessage({data:node.incoming.shift()});
      const input=Float32Array.from({length:count},(_,n)=>signal(frame+n));
      const audio=Array.from({length:2},()=>new Float32Array(count));
      const control=Array.from({length:5},()=>new Float32Array(count));
      const K=node.parameters.get('K').actual();
      node.alive=node.processor.process([[input,input]],[audio,control],{K:new Float32Array([K])});
      node.lastBlock={K,control};
      if(recording)blocks.push({frame,input,audio,control});
      node.control=control.map(c=>c[count-1]);
      assert.ok([...audio,...control].every(c=>c.every(Number.isFinite)));
    }
    frame+=count;h.context().currentTime=frame/h.context().sampleRate;
    wall+=count/h.context().sampleRate*1000;await h.time.advance(count/h.context().sampleRate*1000);
    if(send)drain();await microtasks();
  };
  const render=async (count,send=true)=>{while(count>0){const n=Math.min(count,128);await step(n,send);count-=n;}};
  const until=async predicate=>{for(let n=0;n<80&&!predicate();n++)await step();assert.ok(predicate(),'coupled event did not arrive in bounded frames');};
  const start=async()=>{
    const on=h.audio.setEnabled(h.video,true);await flush();drain();await microtasks();
    await step();await on;return nodes().at(-1);
  };
  const detach=async()=>{
    const parent=h.video.parentNode;h.video.remove();
    const maintain=[...intervals.values()].find(x=>x.ms===1000);assert.ok(maintain);
    maintain.fn();wall+=5001;await h.time.advance(5001);maintain.fn();return parent;
  };
  return {...h,allNodes:h.nodes,nodes,deliver,drain,step,render,until,start,detach,ledger,commands,blocks,recordBlocks:()=>{recording=true;},
    advance:async ms=>{wall+=ms;await h.time.advance(ms);await microtasks();},
    take:(node,predicate)=>{const i=node.outgoing.findIndex(predicate);assert.ok(i>=0,'missing actual reply');return node.outgoing.splice(i,1)[0];},
    meterTick:()=>{const meter=[...intervals.values()].find(x=>x.ms===100);assert.ok(meter);meter.fn();}};
}

test('real Worklet render drives acceptance, completion, and normalizer meter receipts',async t=>{
  const h=await coupled(t),node=await h.start();
  assert.equal(h.audio.getState(h.video),'on');
  assert.equal(h.audio.getReadback(h.video).appliedGain,null,'accepted is not completed');
  assert.equal(node.commands[0].dynamics,true);assert.equal(node.commands[0].normalizer,true);
  assert.deepEqual(Array.from(node.commands[0].eq),[3,-6,0,4,-2,1,-5,6]);
  await h.render(4096);assert.equal(h.audio.getReadback(h.video).appliedGain,1.32);
  h.meterTick();await h.step();
  assert.ok(node.emitted.some(p=>p.kind==='meter-accepted'));
  assert.equal(h.sources(),1);assert.ok(!node.emitted.some(p=>p.kind==='failed'||p.kind==='rejected'));
});

for(const [rate,delayMs,expectedPhase,partial]of [...[44100,48000].flatMap(rate=>[[rate,0,'HOLD'],[rate,40,'RETIRE'],[rate,50,'UNITY']]),[44100,30,'HOLD',true]])test('nonunity N '+rate+' '+(partial?'partial-q ':'')+expectedPhase+' reentry follows actual controller packets and independent retirement',async t=>{
  const {compareL1Normalizer}=await import('../scripts/audio-l1-normalizer-oracle.mjs');
  const {classifyL1Reentry}=await import('../scripts/audio-l1-processing-metrics.mjs');
  const h=await coupled(t,rate,true),node=await h.start();await h.render(Math.ceil(6.5*rate/128)*128);
  assert.ok(node.control[3]>1.5,'real meter warmup must create nonunity N without seeding kernel state');
  for(let n=0;n<80&&!node.outgoing.some(p=>p.kind==='meter-accepted');n++)await h.step(128,false);
  const late=h.take(node,p=>p.kind==='meter-accepted');h.drain();
  h.recordBlocks();await h.audio.setEnabled(h.video,false);await h.render(Math.ceil(delayMs*rate/1000/128)*128);
  const on=h.audio.setEnabled(h.video,true);await h.until(()=>node.commands.length===3&&h.audio.getState(h.video)==='on');await on;
  const readback={...h.audio.getReadback(h.video)},publications=h.statusChanges.length,posted=node.messages.length;
  h.deliver(node,late);assert.deepEqual({...h.audio.getReadback(h.video)},readback);assert.equal(h.statusChanges.length,publications);
  const forwarded=node.messages.slice(posted);assert.equal(forwarded.length,1);assert.equal(forwarded[0].kind,'power');assert.ok(forwarded[0].meterSeq>late.seq&&forwarded[0].meterEpoch>late.meterEpoch);
  await h.render(Math.ceil(rate/5/128)*128);
  const replies=node.emitted.filter(p=>p.kind!=='meter-accepted'&&p.kind!=='prepared');
  const phase=classifyL1Reentry({sampleRate:rate,sourceEpoch:node.epoch,commands:h.commands,replies,offSeq:node.commands[1].seq,onSeq:node.commands[2].seq});
  const acceptedOn=replies.find(p=>p.kind==='accepted'&&p.seq===node.commands[2].seq);
  assert.ok(acceptedOn.meterEpoch>late.meterEpoch);
  const fresh=node.messages.filter(p=>p.kind==='power'&&p.meterEpoch===acceptedOn.meterEpoch);assert.ok(fresh.length>0&&fresh.every(p=>p.meterSeq>late.seq));
  assert.ok(fresh.every(p=>node.emitted.some(r=>r.kind==='meter-accepted'&&r.seq===p.meterSeq&&r.meterEpoch===acceptedOn.meterEpoch)));
  assert.equal(phase.phase,expectedPhase);assert.equal(phase.coverageChecked,false);assert.equal(phase.overallQualification,false);
  const start=h.blocks[0].frame,end=h.blocks.at(-1).frame+h.blocks.at(-1).input.length;
  const join=(kind,count)=>Array.from({length:count},(_,c)=>{const values=new Float32Array(end-start);for(const b of h.blocks)values.set(kind==='input'?b.input:b[kind][c],b.frame-start);return values;});
  const source={rate,start,end,channels:join('input',2)},program={rate,start,end,channels:join('audio',2)},control={rate,start,end,channels:join('control',5)};
  assert.deepEqual(program.channels,source.channels,'this fixture observes pre-native Worklet audio only');
  const evidence={schema:'f01-oracle-evidence-v1',initial:{available:true,reason:null,sourceEpoch:node.epoch,initial:'raw'},ledger:{schema:'f01-control-ledger-v1',available:true,reason:null,events:h.ledger,eventCount:h.ledger.length,maxEvents:4128,bytes:JSON.stringify(h.ledger).length+256,maxBytes:1048576}};
  const input={schema:'f01-l1-normalizer-input-v1',sampleRate:rate,source,program,control,evidence,observation:{sources:h.sources(),l1Nodes:h.nodes().length,invalidFrames:0,streamError:'',contextState:h.context().state,hidden:false}};
  const result=compareL1Normalizer(input);assert.equal(result.status,'diagnostic-match',JSON.stringify(result));assert.equal(result.frameOrigin,'UNPROVEN');assert.equal(result.overallQualification,false);
  const A=phase.acceptedOffFrame,B=phase.acceptedOnFrame,R=phase.retirementStartFrame;
  const offQ=f=>1-Math.max(0,Math.min(1,(f-(R-rate*.01))/(rate*.01))),qB=offQ(B);
  if(partial){
    assert.equal(R,A+1587);assert.ok(A+1146<B&&B<A+1587,'partial-q formation requires actual accepted ON inside the q fall');
    assert.ok(qB>0&&qB<1);assert.ok(end>B+441);
    assert.ok(Math.abs(control.channels[1][B-start]-qB)<1e-6,'ON starts at the current q');assert.equal(control.channels[1][B+441-start],1);
    const heldN=control.channels[3][B-1-start];assert.ok(heldN>1);assert.ok(control.channels[3].slice(A-start).every(n=>n===heldN),'OFF hold and renewed warmup preserve nonunity N');
    assert.ok(result.prediction.maxDb-result.prediction.minDb<1e-10,'independent N history predicts the held value');
    t.diagnostic(JSON.stringify({scope:'HOST partial-q only',acceptedOff:A,acceptedOn:B,delta:B-A,retirementStart:R,expectedQAtOn:qB,actualQAtOn:control.channels[1][B-start],heldN,predictedDb:result.prediction.lastDb,recordedFrames:end-start}));
  }
  const checkControls=channels=>{for(let i=0;i<end-start;i++){
    const f=start+i,q=f<B?offQ(f):qB+(1-qB)*Math.max(0,Math.min(1,(f-B)/(rate*.01)));
    assert.ok(Math.abs(channels[1][i]-q)<1e-6,'q-control '+f);assert.equal(channels[0][i],-channels[1][i]);
    assert.equal(channels[2][i],1);assert.ok(channels[4][i]===0);
  }};
  checkControls(control.channels);
  if(partial)for(const bad of [0,1]){
    const changed=control.channels.map(c=>c.slice());changed[0][B-start]=-bad;changed[1][B-start]=bad;
    assert.throws(()=>checkControls(changed),/q-control/,'the same trajectory check rejects a clamped ON jump');
  }
  for(const [index,base,channel]of [[0,1,0],[1,0,1],[2,0,2],[7,0,3],[3,1,4]])assert.equal(h.allNodes.filter(n=>n.type==='gain')[index].gain.actual(),base+node.control[channel]);
  const wrong=control.channels.map(c=>c.slice()),at=Math.max(0,Math.min(end-start-1,B-start));wrong[3][at]=expectedPhase==='UNITY'?1.5:1;
  assert.equal(compareL1Normalizer({...input,control:{...control,channels:wrong}}).status,'diagnostic-mismatch','an early unity/late retirement/ON jump must not pass');
  assert.equal(h.sources(),1);assert.equal(h.nodes().length,1);assert.ok(!node.emitted.some(p=>p.kind==='failed'||p.kind==='rejected'||p.kind==='retired'));
});

test('OFF then fast ON ignores a delayed actual completion and keeps one source',async t=>{
  const h=await coupled(t),node=await h.start();
  await h.render(4096,false);const late=h.take(node,p=>p.kind==='completed');
  await h.audio.setEnabled(h.video,false);const on=h.audio.setEnabled(h.video,true);
  await h.step();h.deliver(node,late);
  assert.equal(h.audio.getReadback(h.video).appliedGain,null);
  await h.step();await on;await h.render(4096);
  assert.equal(h.audio.getReadback(h.video).appliedGain,1.32);
  assert.equal(h.sources(),1);assert.equal(h.nodes().length,1);
  assert.equal(node.messages.filter(p=>p.kind==='retire').length,0);
});

test('actual OFF completion precedes retired and source reuse rejects the old endpoint',async t=>{
  const h=await coupled(t),node=await h.start();await h.render(4096);
  const oldHandler=node.port.onmessage,late=node.emitted.find(p=>p.kind==='completed');
  const parent=await h.detach();
  await h.until(()=>node.messages.some(p=>p.kind==='retire'));
  assert.ok(!node.emitted.some(p=>p.kind==='retired'));
  parent.append(h.video);const on=h.audio.setEnabled(h.video,true);
  assert.equal(h.nodes().length,1,'no replacement before actual retired');
  await h.step();h.drain();await microtasks();
  await h.until(()=>h.nodes().length===2&&h.audio.getState(h.video)==='on');await on;
  await h.render(4096);h.deliver(node,late,oldHandler);
  assert.equal(h.audio.getReadback(h.video).appliedGain,1.32);
  assert.equal(h.sources(),1);assert.equal(node.alive,false);assert.equal(node.closed,true);
  assert.notEqual(h.nodes()[1].epoch,node.epoch);
});

test('new Gain0 intent before queued retire stays silent through rejection without retry',async t=>{
  const h=await coupled(t),node=await h.start();await h.render(4096);
  const parent=await h.detach();await h.until(()=>node.messages.some(p=>p.kind==='retire'));
  parent.append(h.video);h.audio.setGain(h.video,0);
  const on=h.audio.setEnabled(h.video,true);await microtasks();
  const latch=h.allNodes.find(n=>n.type==='constant');assert.equal(latch.offset.value,-1);
  await h.step(128,false);
  assert.equal(node.outgoing.at(-1).code,'l1-retire-invalid','the original K0 retirement gate is preserved');
  const {K,control}=node.lastBlock;
  for(let i=0;i<128;i++){
    assert.equal((1+control[0][i])*(1+K+control[4][i]),0,'new Gain0 must not reopen dry before the rejected reply is delivered');
    assert.equal(control[1][i],0,'new Gain0 must keep wet gated before main handles retirement failure');
  }
  h.drain();await microtasks();assert.equal(await on,'unavailable');
  assert.equal(latch.offset.value,-1);assert.equal(h.nodes().length,1);assert.equal(h.sources(),1);
  assert.equal(node.messages.filter(p=>p.kind==='retire').length,1);
});

test('new Gain0 during unfinished retiring OFF gates wet and dry until safe unavailable',async t=>{
  const h=await coupled(t),node=await h.start();await h.render(4096);
  const parent=await h.detach();await h.step();
  assert.equal(node.emitted.at(-1).kind,'accepted');
  parent.append(h.video);h.audio.setGain(h.video,0);const on=h.audio.setEnabled(h.video,true);await microtasks();
  await h.step(128,false);const {K,control}=node.lastBlock;assert.equal(K,-1);
  for(let i=0;i<128;i++){
    assert.equal((1+control[0][i])*(1+K+control[4][i]),0);
    assert.equal(control[1][i],0,'Gain0 must also gate the still-active wet branch');
  }
  h.drain();await h.until(()=>h.audio.getState(h.video)==='unavailable');
  assert.equal(await on,'unavailable');assert.equal(h.sources(),1);assert.equal(h.nodes().length,1);
  assert.equal(node.messages.filter(p=>p.kind==='retire').length,0);
});

test('new Gain0 after actual retirement but before its reply preserves silent-hold source reuse',async t=>{
  const h=await coupled(t),node=await h.start();await h.render(4096);
  const parent=await h.detach();await h.until(()=>node.messages.some(p=>p.kind==='retire'));
  const oldHandler=node.port.onmessage;
  await h.step(128,false);const retired=h.take(node,p=>p.kind==='retired');
  assert.equal(node.alive,false);assert.ok(node.lastBlock.control.every(c=>c.every(x=>x===0)));
  parent.append(h.video);h.audio.setGain(h.video,0);const on=h.audio.setEnabled(h.video,true);await microtasks();
  const latch=h.allNodes.find(n=>n.type==='constant');assert.equal(latch.offset.value,-1);
  h.deliver(node,retired);await microtasks();h.drain();await microtasks();
  await h.until(()=>h.nodes().length===2&&h.audio.getState(h.video)==='on');await on;
  await h.render(4096);h.deliver(node,retired,oldHandler);
  assert.equal(h.audio.getReadback(h.video).appliedGain,0);assert.equal(latch.offset.value,-1);
  assert.equal(h.sources(),1);assert.equal(h.nodes()[1].options.processorOptions.initial,'silent-hold');
  assert.ok(!node.emitted.some(p=>p.kind==='failed'||p.kind==='rejected'));
});

test('reply boundary: delayed prepared after OFF creates no source and permits safe reuse',async t=>{
  const h=await coupled(t),states=[];h.audio.subscribe(h.video,state=>states.push(state));
  const on=h.audio.setEnabled(h.video,true);await flush();const node=h.nodes()[0];
  const prepared=h.take(node,p=>p.kind==='prepared');assert.equal(h.sources(),0);
  await h.advance(400);assert.equal(await h.audio.setEnabled(h.video,false),'off');
  h.deliver(node,prepared);await microtasks();assert.equal(await on,'off');
  assert.equal(h.sources(),0);assert.equal(node.commands.length,0);assert.ok(!states.includes('on'));
  const active=await h.start();await h.render(4096);
  assert.equal(active,node);assert.equal(h.sources(),1);assert.equal(h.nodes().length,1);
  assert.equal(h.audio.getReadback(h.video).appliedGain,1.32);
});

test('reply boundary: prepared timeout ignores late reply and retries only with a fresh no-source epoch',async t=>{
  const h=await coupled(t),on=h.audio.setEnabled(h.video,true);await flush();const old=h.nodes()[0];
  const prepared=h.take(old,p=>p.kind==='prepared'),handler=old.port.onmessage;
  await h.advance(999);assert.equal(h.audio.getState(h.video),'pending');assert.equal(h.sources(),0);
  await h.advance(1);assert.equal(await on,'unavailable');assert.equal(h.sources(),0);
  assert.equal(old.outputs.size,0);assert.ok(h.allNodes.find(n=>n.type==='constant').stopped);
  h.deliver(old,prepared,handler);assert.equal(h.audio.getState(h.video),'unavailable');assert.equal(h.sources(),0);
  const node=await h.start();await h.render(4096);
  assert.notEqual(node.epoch,old.epoch);assert.equal(h.sources(),1);assert.equal(old.commands.length,0);
  h.deliver(old,prepared,handler);assert.equal(h.audio.getState(h.video),'on');
  assert.equal(h.audio.getReadback(h.video).appliedGain,1.32);assert.equal(h.nodes().length,2);
});

test('reply boundary: OFF supersedes withheld actual accepted and completed without late ON',async t=>{
  const h=await coupled(t),states=[];h.audio.subscribe(h.video,state=>states.push(state));
  const on=h.audio.setEnabled(h.video,true);await flush();h.drain();await microtasks();
  const node=h.nodes()[0];await h.render(4096,false);
  const accepted=h.take(node,p=>p.kind==='accepted'),completed=h.take(node,p=>p.kind==='completed');
  assert.equal(h.audio.getState(h.video),'pending');assert.equal(h.sources(),1);
  await h.audio.setEnabled(h.video,false);const seq=node.commands[0].seq;
  h.deliver(node,accepted);h.deliver(node,completed);await microtasks();assert.equal(await on,'off');
  assert.equal(h.audio.getReadback(h.video).appliedGain,null);assert.ok(!states.includes('on'));
  assert.ok(node.commands.at(-1).seq>seq);assert.equal(node.commands.at(-1).wanted,false);
  await h.step();await h.render(4096);assert.equal(h.audio.getState(h.video),'off');
  assert.equal(h.audio.getReadback(h.video).appliedGain,1);assert.equal(h.sources(),1);
  assert.equal(h.nodes().length,1);assert.equal(node.messages.filter(p=>p.kind==='retire').length,0);
});

for(const gain of [1.32,0])test('reply boundary: accepted timeout preserves native fallback and rejects late replies; gain='+gain,async t=>{
  const h=await coupled(t);h.audio.setGain(h.video,gain);
  const on=h.audio.setEnabled(h.video,true);await flush();h.drain();await microtasks();const node=h.nodes()[0];
  await h.render(4096,false);const handler=node.port.onmessage;
  const accepted=h.take(node,p=>p.kind==='accepted'),completed=h.take(node,p=>p.kind==='completed');
  assert.equal(h.audio.getState(h.video),'pending');assert.equal(h.audio.getReadback(h.video).appliedGain,null);
  await h.advance(999-h.dom.window.performance.now());assert.equal(h.audio.getState(h.video),'pending');
  await h.advance(1);assert.equal(await on,'unavailable');
  assert.ok(h.statusChanges.some(([feature,,reason])=>feature==='audioProcessing'&&reason==='audio-command-timeout'));
  const [dry,wet,,permit]=h.allNodes.filter(n=>n.type==='gain');
  assert.equal(dry.gain.actual()*permit.gain.actual(),gain===0?0:1);assert.equal(wet.gain.actual(),0);
  assert.equal(node.outputs.size,0);assert.ok(!h.allNodes.find(n=>n.type==='source').outputs.has(node));
  h.deliver(node,accepted,handler);h.deliver(node,completed,handler);await microtasks();
  assert.equal(h.audio.getReadback(h.video).appliedGain,null);assert.equal(h.audio.getState(h.video),'unavailable');
  const messages=node.messages.length;assert.equal(await h.audio.setEnabled(h.video,true),'unavailable');
  assert.equal(node.messages.length,messages);assert.equal(h.nodes().length,1);assert.equal(h.sources(),1);
  assert.equal(dry.gain.actual()*permit.gain.actual(),gain===0?0:1);assert.equal(wet.gain.actual(),0);
});

test('disposal boundary: actual prepared after final pagehide cannot create a source or enable again',async t=>{
  const h=await coupled(t),states=[];h.audio.subscribe(h.video,state=>states.push(state));
  const on=h.audio.setEnabled(h.video,true);await flush();const node=h.nodes()[0];
  const prepared=h.take(node,p=>p.kind==='prepared'),handler=node.port.onmessage;
  assert.equal(h.sources(),0);await h.advance(400);
  for(let i=0;i<2;i++)h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pagehide',{persisted:false}));
  const statusCount=h.statusChanges.length,stateCount=states.length;
  h.deliver(node,prepared,handler);await microtasks();assert.equal(await on,'off');
  await h.advance(1100);h.deliver(node,prepared,handler);await microtasks();
  assert.equal(await h.audio.setEnabled(h.video,true),'off');
  assert.equal(h.audio.getState(h.video),'off');assert.equal(h.sources(),0);
  assert.equal(node.commands.length,0);assert.equal(h.nodes().length,1);
  assert.equal(h.statusChanges.length,statusCount);assert.ok(!states.slice(stateCount).includes('on'));
});

test('disposal boundary: actual accepted after final pagehide settles safe OFF or preserves Gain0 mute',async t=>{
  for(const gain of [1.32,0]){
    const h=await coupled(t),states=[];h.audio.subscribe(h.video,state=>states.push(state));h.audio.setGain(h.video,gain);
    const on=h.audio.setEnabled(h.video,true);await flush();h.drain();await microtasks();const node=h.nodes()[0];
    await h.render(4096,false);const handler=node.port.onmessage;
    const accepted=h.take(node,p=>p.kind==='accepted'),completed=h.take(node,p=>p.kind==='completed');
    assert.equal(h.audio.getState(h.video),'pending');assert.equal(h.sources(),1);
    for(let i=0;i<2;i++)h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pagehide',{persisted:false}));
    const statusCount=h.statusChanges.length,stateCount=states.length;
    assert.equal(node.commands.length,1,'ordinary OFF waits behind accepted; protected Gain0 fails silently');
    h.deliver(node,accepted,handler);h.deliver(node,completed,handler);await microtasks();
    assert.equal(await on,'off');assert.equal(h.audio.getReadback(h.video).appliedGain,null);
    if(gain!==0){
      assert.equal(node.commands.length,2);assert.equal(node.commands[1].wanted,false);
      assert.ok(node.commands[1].seq>node.commands[0].seq);
      await h.step();await h.render(4096);
      assert.equal(h.audio.getReadback(h.video).appliedGain,1,'actual OFF completion may settle after disposal');
    }else{
      assert.equal(node.commands.length,1,'unconfirmed Gain0 may not send an unsafe OFF');
      assert.equal(node.outputs.size,0);assert.ok(!h.allNodes.find(n=>n.type==='source').outputs.has(node));
    }
    await h.advance(1100);h.deliver(node,accepted,handler);h.deliver(node,completed,handler);await microtasks();
    assert.equal(await h.audio.setEnabled(h.video,true),'off');assert.equal(h.audio.getState(h.video),'off');
    const [dry,wet,,permit]=h.allNodes.filter(n=>n.type==='gain');
    assert.equal(dry.gain.actual()*permit.gain.actual(),gain===0?0:1);assert.equal(wet.gain.actual(),0);
    assert.equal(h.sources(),1);assert.equal(h.nodes().length,1);
    assert.equal(node.commands.filter(p=>p.wanted).length,1);
    assert.equal(h.statusChanges.length,statusCount);assert.ok(!states.slice(stateCount).includes('on'));
  }
});

for (const [label, eq63] of [['same configuration', config.eq63], ['latest EQ', -4]]) {
  test('source-key boundary: replacement Worklet sends ' + label + ' after prepared', async t => {
    const h = await coupled(t);
    const active = await h.start();
    await h.render(4096);

    Object.defineProperty(h.video, 'currentSrc', {configurable:true, value:'blob:https://chzzk.naver.com/queued-replacement'});
    h.audio.configure();
    await flush();
    await microtasks();
    assert.equal(h.nodes().length, 2);
    const node = h.nodes()[1];
    assert.notEqual(node.epoch, active.epoch);
    const prepared = h.take(node, packet => packet.kind === 'prepared');
    const source = h.allNodes.find(part => part.type === 'source');
    h.audio.configure();
    h.audio.configure();
    assert.equal(source.outputs.has(node), false);
    assert.equal(node.messages.length, 0, 'the replacement port must stay idle before prepared');

    runtime(h.dom).config.eq63 = eq63;
    h.deliver(node, prepared);
    await microtasks();
    assert.equal(node.commands.length, 1, 'prepared and source connection must release one configure');
    const [command] = node.commands;
    assert.equal(source.outputs.has(node), true);
    assert.equal(command.sourceEpoch, prepared.sourceEpoch);
    assert.equal(command.eq[0], eq63, 'the first sent configure must use the latest EQ');
    assert.equal(command.wanted, true);
    assert.equal(command.gain, config.audioGain);

    await h.step(128, false);
    const accepted = h.take(node, packet => packet.kind === 'accepted');
    assert.equal(accepted.sourceEpoch, node.epoch);
    assert.equal(accepted.seq, command.seq);
    h.deliver(node, accepted);
    await h.until(() => h.audio.getState(h.video) === 'on');
    assert.equal(h.audio.getReadback(h.video).appliedGain, null);

    await h.render(4096, false);
    const completed = h.take(node, packet => packet.kind === 'completed');
    assert.equal(completed.sourceEpoch, node.epoch);
    assert.equal(completed.seq, command.seq);
    h.deliver(node, completed);
    assert.equal(h.audio.getReadback(h.video).appliedGain, config.audioGain);
    assert.equal(node.commands.length, 1);
    assert.equal(h.sources(), 1);
  });
}

test('source-key boundary: actual replies from a replaced flight cannot own the new epoch',async t=>{
  for(const gain of [1.32,0]){
    const h=await coupled(t),api=runtime(h.dom),states=[];
    api.config.audioGain=gain;assert.notEqual(api.media.gainOrigin,'site-legacy');
    h.audio.subscribe(h.video,state=>states.push(state));h.audio.setGain(h.video,gain);
    const on=h.audio.setEnabled(h.video,true);await flush();h.drain();await microtasks();
    const old=h.nodes()[0];await h.render(4096,false);const handler=old.port.onmessage;
    const accepted=h.take(old,p=>p.kind==='accepted'),completed=h.take(old,p=>p.kind==='completed');
    assert.equal(h.audio.getState(h.video),'pending');assert.equal(h.sources(),1);
    assert.equal(old.commands[0].gain,gain);assert.equal(typeof handler,'function');
    Object.defineProperty(h.video,'currentSrc',{configurable:true,value:'blob:https://chzzk.naver.com/replaced-flight'});
    h.audio.configure();await flush();await microtasks();
    assert.notEqual(await on,'on');assert.equal(h.nodes().length,2);const node=h.nodes()[1];
    const source=h.allNodes.find(n=>n.type==='source'),latch=h.allNodes.find(n=>n.type==='constant');
    assert.notEqual(node.epoch,old.epoch);assert.equal(old.closed,true);assert.equal(old.port.onmessage,null);
    assert.equal(old.outputs.size,0);assert.equal(old.parameters.get('K').inputs.size,0);
    assert.ok(!source.outputs.has(old));assert.equal(h.sources(),1);
    assert.equal(node.options.processorOptions.initial,gain===0?'silent-hold':'raw');
    assert.equal(latch.offset.value,gain===0?-1:0);
    const statusCount=h.statusChanges.length,stateCount=states.length;
    h.deliver(old,accepted,handler);h.deliver(old,completed,handler);await microtasks();
    assert.equal(h.audio.getState(h.video),'pending');assert.equal(h.audio.getReadback(h.video).appliedGain,null);
    assert.equal(node.commands.length,0,'old replies cannot bypass actual new prepared');
    assert.equal(h.statusChanges.length,statusCount);assert.ok(!states.slice(stateCount).includes('on'));
    const [dry,wet,gainNode,permit]=h.allNodes.filter(n=>n.type==='gain');
    if(gain===0){assert.equal(dry.gain.actual()*permit.gain.actual(),0);assert.equal(wet.gain.actual()*gainNode.gain.actual(),0);}
    const prepared=h.take(node,p=>p.kind==='prepared');h.deliver(node,prepared);await microtasks();
    assert.equal(node.commands.length,1);assert.equal(node.commands[0].gain,gain);
    assert.equal(node.commands[0].seq,accepted.seq,'epoch identity must protect even reused sequence numbers');
    assert.equal(node.commands[0].sourceEpoch,node.epoch);assert.ok(source.outputs.has(node));
    await h.step(128,false);const currentAccepted=h.take(node,p=>p.kind==='accepted');
    h.deliver(old,accepted,handler);h.deliver(old,completed,handler);await microtasks();
    assert.equal(h.audio.getState(h.video),'pending');assert.equal(h.audio.getReadback(h.video).appliedGain,null);
    if(gain===0){const {K,control}=node.lastBlock;for(let i=0;i<128;i++){
      assert.equal((1+control[0][i])*(1+K+control[4][i]),0);assert.equal(control[1][i]*control[2][i],0);
    }}
    h.deliver(node,currentAccepted);await microtasks();await h.until(()=>h.audio.getState(h.video)==='on');
    assert.equal(h.audio.getReadback(h.video).appliedGain,null,'new accepted alone is not completed');
    await h.render(4096);assert.equal(h.audio.getReadback(h.video).appliedGain,gain);
    const view={...h.audio.getReadback(h.video)},publications=h.statusChanges.length;
    h.deliver(old,accepted,handler);h.deliver(old,completed,handler);await h.advance(1100);
    assert.deepEqual({...h.audio.getReadback(h.video)},view);assert.equal(h.statusChanges.length,publications);
    assert.equal(h.sources(),1);assert.equal(h.nodes().length,2);assert.equal(node.commands.filter(p=>p.wanted).length,1);
    assert.equal(old.commands.length,1);assert.equal(node.messages.filter(p=>p.kind==='retire').length,0);
    if(gain===0){assert.equal(latch.offset.value,-1);assert.equal(dry.gain.actual()*permit.gain.actual(),0);assert.equal(wet.gain.actual()*gainNode.gain.actual(),0);}
  }
});

test('source-key boundary: OFF can replace a Worklet awaiting prepared and keep the dry source',async t=>{
  const h=await coupled(t);
  const active=await h.start();await h.render(4096);
  assert.equal(h.audio.getState(h.video),'on');
  assert.equal(h.audio.getReadback(h.video).appliedGain,config.audioGain);
  const source=h.allNodes.find(node=>node.type==='source');
  const dryDelay=[...source.outputs].find(node=>node.type==='delay');
  assert.ok(dryDelay);assert.ok(source.outputs.has(active));
  const disconnect=source.disconnect;
  source.disconnect=function(...args){
    if(args.length && !this.outputs.has(args[0]))throw new h.dom.window.DOMException('연결되지 않은 오디오 목적지','InvalidAccessError');
    disconnect.apply(this,args);
  };
  const replaceSource=name=>Object.defineProperty(h.video,'currentSrc',{configurable:true,value:`blob:https://chzzk.naver.com/${name}`});

  replaceSource('awaiting-prepared');h.audio.configure();await flush();await microtasks();
  assert.equal(h.nodes().length,2);
  const preparing=h.nodes()[1],handler=preparing.port.onmessage;
  const prepared=h.take(preparing,p=>p.kind==='prepared');
  const controls=[...preparing.outputs].find(node=>node.type==='splitter');
  assert.equal(controls.outputs.size,5);assert.equal(preparing.parameters.get('K').inputs.size,1);
  assert.equal(active.closed,true);assert.ok(preparing.epoch>active.epoch);
  assert.deepEqual([...source.outputs],[dryDelay]);
  assert.equal(h.audio.getState(h.video),'pending');

  assert.equal(await h.audio.setEnabled(h.video,false),'off');
  replaceSource('after-off');
  const gain=.8;
  let actualGain;
  assert.doesNotThrow(()=>{actualGain=h.audio.setGain(h.video,gain);},'OFF 상태에서 다음 소스의 gain을 적용할 수 있어야 한다');
  assert.equal(actualGain,gain);
  assert.equal(preparing.port.onmessage,null);assert.equal(preparing.closed,true);
  assert.equal(preparing.outputs.size,0);assert.equal(controls.outputs.size,0);
  assert.equal(preparing.parameters.get('K').inputs.size,0);
  assert.deepEqual([...source.outputs],[dryDelay]);
  const [dry,wet,,permit]=h.allNodes.filter(node=>node.type==='gain');
  assert.ok(dryDelay.outputs.has(dry));assert.ok(dry.outputs.has(permit));
  assert.ok(permit.outputs.has(h.context().destination));
  assert.equal(dry.gain.actual()*permit.gain.actual(),1);assert.equal(wet.gain.actual(),0);
  const off={state:'off',wanted:false,gain,appliedGain:null,sources:1};
  assert.deepEqual({...h.audio.getReadback(h.video)},off);

  h.deliver(preparing,prepared,handler);await h.advance(1001);
  assert.deepEqual({...h.audio.getReadback(h.video)},off);
  assert.deepEqual([...source.outputs],[dryDelay]);assert.equal(h.nodes().length,2);
  assert.equal(preparing.commands.length,0);

  const current=await h.start();await h.render(4096);
  assert.ok(current.epoch>preparing.epoch);assert.equal(h.nodes().length,3);
  assert.equal(current.commands[0].gain,gain);
  const replies=current.emitted.filter(packet=>['prepared','accepted','completed'].includes(packet.kind));
  assert.deepEqual(replies.map(packet=>packet.kind),['prepared','accepted','completed']);
  assert.ok(replies.every(packet=>packet.sourceEpoch===current.epoch));
  assert.deepEqual({...h.audio.getReadback(h.video)},{state:'on',wanted:true,gain,appliedGain:gain,sources:1});
  assert.deepEqual([...source.outputs],[dryDelay,current]);
});

for(const sampleRate of [48000,96000])for(const gain of [.5,2])test('Gain '+gain+' at '+sampleRate+' target follows a deduplicated zero-EQ baseline with actual Worklet completion',async t=>{
  const h=await coupled(t,sampleRate),state=runtime(h.dom);Object.assign(state.config,{compressorEnabled:false,normalizerEnabled:false,normalizerTargetDbfs:-20,eqEnabled:false});
  h.audio.setGain(h.video,1);const node=await h.start();await h.render(4096);
  assert.equal(h.audio.getReadback(h.video).appliedGain,1);assert.equal(node.commands.length,1);assert.deepEqual(Array.from(node.commands[0].eq),Array(8).fill(0));
  Object.assign(state.config,{eqEnabled:true,...Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map(hz=>['eq'+hz,0]))});
  h.audio.configure();assert.equal(node.commands.length,1,'configure-before-setGain must be deduplicated');
  h.audio.setGain(h.video,gain);assert.equal(node.commands.length,2);assert.equal(node.commands[1].gain,gain);assert.equal(node.commands[1].seq,node.commands[0].seq+1);
  await h.render(4096);assert.equal(h.audio.getReadback(h.video).gain,gain);assert.equal(h.audio.getReadback(h.video).appliedGain,gain);assert.ok(node.control.every((value,i)=>value===[-1,1,gain,1,0][i]));
  const target=node.emitted.filter(r=>r.seq===node.commands[1].seq);assert.equal(target.filter(r=>r.kind==='accepted').length,1);assert.equal(target.filter(r=>r.kind==='completed'&&r.gain===gain).length,1);
});
test('a different baseline target would post an intermediate Gain1 packet and must not be skipped',async t=>{
  const h=await coupled(t),state=runtime(h.dom);Object.assign(state.config,{compressorEnabled:false,normalizerEnabled:false,normalizerTargetDbfs:-19,eqEnabled:false});h.audio.setGain(h.video,1);const node=await h.start();await h.render(4096);
  Object.assign(state.config,{normalizerTargetDbfs:-20,eqEnabled:true,...Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map(hz=>['eq'+hz,0]))});h.audio.configure();
  assert.equal(node.commands.length,2);assert.equal(node.commands[1].gain,1);assert.equal(node.commands[1].targetDbfs,-20);h.audio.setGain(h.video,.5);await h.render(8192);
  assert.deepEqual(node.commands.map(p=>p.gain),[1,1,.5]);assert.equal(h.audio.getReadback(h.video).appliedGain,.5);
});

test('cold zero-EQ configure/setGain queues nothing before actual first ON seq1 and completed readback',async t=>{
  const h=await coupled(t),state=runtime(h.dom);Object.assign(state.config,{audioGain:1,compressorEnabled:false,normalizerEnabled:false,normalizerTargetDbfs:-20,eqEnabled:true,...Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map(hz=>['eq'+hz,0]))});
  h.audio.configure();h.audio.setGain(h.video,1);assert.equal(h.nodes().length,0);assert.equal(h.sources(),0);const before=h.audio.getReadback(h.video);assert.equal(before.state,'off');assert.equal(before.wanted,false);assert.equal(before.gain,1);assert.equal(before.appliedGain,null);
  const node=await h.start();assert.equal(node.commands.length,1);assert.equal(node.commands[0].seq,1);assert.equal(node.commands[0].gain,1);assert.deepEqual(Array.from(node.commands[0].eq),Array(8).fill(0));assert.equal(node.commands[0].targetDbfs,-20);assert.equal(node.commands[0].normalizer,false);assert.equal(node.commands[0].dynamics,false);assert.equal(state.config.eqEnabled,true);
  assert.equal(h.audio.getReadback(h.video).appliedGain,null,'statusON/accepted is not completed');await h.render(4096);assert.equal(h.audio.getReadback(h.video).appliedGain,1);assert.ok(node.control.every((v,i)=>v===[-1,1,1,1,0][i]));assert.equal(node.emitted.filter(r=>r.kind==='accepted').length,1);assert.equal(node.emitted.filter(r=>r.kind==='completed'&&r.gain===1).length,1);assert.equal(node.commands.length,1);
});
