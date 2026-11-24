const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {buildSync} = require('esbuild');
function kernel() {
  assert.ok(fs.existsSync('src/main/features/audio/transition.ts'), 'L1 product kernel must exist');
  const module = {exports:{}};
  const code = buildSync({entryPoints:['src/main/features/audio/transition.ts'],bundle:true,write:false,format:'cjs',platform:'browser'}).outputFiles[0].text;
  vm.runInNewContext(code,{module,exports:module.exports,Float32Array,Float64Array,Number,Math});
  return module.exports;
}
const zero = [0,0,0,0,0,0,0,0];
const command = (seq,wanted,eq=zero,gain=1,normalizer=false) => ({kind:'configure',sourceEpoch:1,seq,wanted,eq,gain,normalizer,targetDbfs:-20});

test('controlled repeated-frame schedule isolates Worklet output and ACK sensitivity', t => {
  const {createHash} = require('node:crypto'), path = require('node:path');
  const rate=44100, quantum=128, end=22528, disturbedAt=18944;
  const code=buildSync({entryPoints:['src/main/features/audio/transition-worklet.ts'],bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0].text;
  const make=()=>{
    const messages=[],box={Float32Array,Float64Array,Number,Math,sampleRate:rate,currentFrame:0};let Processor,physicalFrame=0;
    box.AudioWorkletProcessor=class{constructor(){this.port={onmessage:null,postMessage:packet=>messages.push({physicalFrame,packet:structuredClone(packet)})};}};
    box.registerProcessor=(_,type)=>{Processor=type;};vm.runInNewContext(code,box);
    const processor=new Processor({processorOptions:{sourceEpoch:1,initial:'raw',normalizerWitness:true}});
    return {messages,processor,inputHash:createHash('sha256'),outputHash:createHash('sha256'),
      send:packet=>processor.port.onmessage({data:structuredClone(packet)}),
      run:(physical,frame,input)=>{
        physicalFrame=physical;box.currentFrame=frame;
        const left=new Float32Array(input),right=new Float32Array(input);
        const out=[Array.from({length:2},()=>new Float32Array(quantum)),Array.from({length:5},()=>new Float32Array(quantum))];
        const alive=processor.process([[left,right]],out,{K:new Float32Array([0])});
        assert.deepEqual(left,input);assert.deepEqual(right,input);
        return {physical,frame,alive,audio:out[0],control:out[1],ring:Array.from(processor.state.gainRing)};
      }};
  };
  const baseline=make(),disturbed=make(),meters=[],snapshots=[];
  const selected=new Set([18688,18816,18944,19072]);
  const maxima={eqTap:0,control:[0,0,0,0,0],gainRing:0};
  let nextMeter=0,meterSeq=0,firstDifference=null;
  const difference=(a,b)=>{assert.equal(a.length,b.length);let max=0;for(let n=0;n<a.length;n++)max=Math.max(max,Math.abs(a[n]-b[n]));return max;};
  for(let physical=0;physical<end;physical+=quantum){
    if(physical===0||physical===18560){
      const packet=physical===0?command(1,true,zero,1,true):command(2,true,[0,0,0,-6,0,0,0,0],2,true);
      baseline.send(packet);disturbed.send(packet);
    }
    if(physical>=nextMeter){
      const packet={kind:'power',sourceEpoch:1,meterEpoch:1,meterSeq:++meterSeq,observedTime:physical/rate,
        active:true,leftPower:10**(-36/10),rightPower:10**(-36/10),targetDbfs:-20};
      meters.push({physical,packet});baseline.send(packet);disturbed.send(packet);nextMeter+=rate/10;
    }
    const input=Float32Array.from({length:quantum},(_,n)=>Math.SQRT2*10**(-36/20)*Math.sin(2*Math.PI*1000*(physical+n)/rate+.37));
    const a=baseline.run(physical,physical,input),b=disturbed.run(physical,physical===disturbedAt?18816:physical,input);
    for(const [h,row] of [[baseline,a],[disturbed,b]]){
      h.inputHash.update(Buffer.from(input.buffer));
      assert.equal(row.alive,true);
      for(const channel of [...row.audio,...row.control]){assert.ok(channel.every(Number.isFinite));h.outputHash.update(Buffer.from(channel.buffer));}
    }
    const eqTap=Math.max(...a.audio.map((row,i)=>difference(row,b.audio[i])));
    const control=a.control.map((row,i)=>difference(row,b.control[i])),ring=difference(a.ring,b.ring);
    if(physical<disturbedAt){assert.equal(eqTap,0);assert.deepEqual(control,[0,0,0,0,0]);assert.equal(ring,0);}
    if(firstDifference===null&&(eqTap||control.some(Boolean)||ring))firstDifference=physical;
    maxima.eqTap=Math.max(maxima.eqTap,eqTap);maxima.gainRing=Math.max(maxima.gainRing,ring);
    control.forEach((value,index)=>{maxima.control[index]=Math.max(maxima.control[index],value);});
    if(selected.has(physical))snapshots.push({input:Array.from(input),baseline:{...a,audio:a.audio.map(channel=>Array.from(channel)),control:a.control.map(channel=>Array.from(channel))},disturbed:{...b,audio:b.audio.map(channel=>Array.from(channel)),control:b.control.map(channel=>Array.from(channel))}});
  }
  const acks=h=>h.messages.filter(row=>['accepted','completed','rejected','failed'].includes(row.packet.kind));
  const report={scope:'conditional HOST Worklet sensitivity, not a replay or Native output',rate,quantum,end,disturbedAt,
    input:'1kHz -36dBFS stereo phase .37; physical input advances independently of the injected global frame',
    meters,baselineInputHash:baseline.inputHash.digest('hex'),disturbedInputHash:disturbed.inputHash.digest('hex'),
    baselineOutputHash:baseline.outputHash.digest('hex'),disturbedOutputHash:disturbed.outputHash.digest('hex'),
    firstDifference,maxima,baselineAcks:acks(baseline),disturbedAcks:acks(disturbed),
    sameAcks:JSON.stringify(acks(baseline))===JSON.stringify(acks(disturbed)),snapshots};
  if(process.env.KNIFE_TEST_EVIDENCE_DIR){
    const archive=fs.mkdtempSync(path.join(path.resolve(process.env.KNIFE_TEST_EVIDENCE_DIR),'frame-impact-'));
    fs.writeFileSync(path.join(archive,'observation.json'),JSON.stringify(report,null,2));t.diagnostic(`frame-impact evidence: ${archive}`);
  }
  const {snapshots:raw,...summary}=report;t.diagnostic(JSON.stringify(summary));
  assert.equal(report.baselineInputHash,report.disturbedInputHash);
  assert.equal(firstDifference,disturbedAt);
  assert.ok(maxima.eqTap>0&&maxima.control.some(value=>value>0),'the clock perturbation must reach observable output/control');
  for(const replies of [report.baselineAcks,report.disturbedAcks]){
    assert.equal(replies.filter(row=>row.packet.kind==='accepted').length,2);
    assert.equal(replies.filter(row=>row.packet.kind==='completed').length,2);
    assert.equal(replies.filter(row=>['failed','rejected'].includes(row.packet.kind)).length,0);
  }
});
test('retirement requires a completed OFF, actual raw q/K, exact epoch and monotone packet',()=>{
  const k=kernel(),s=k.createTransition(48000,1,'raw'),packet={kind:'retire',sourceEpoch:1,seq:3};
  assert.equal(typeof k.acceptRetire,'function');
  assert.equal(k.acceptRetire(s,packet,0,0).kind,'rejected');
  k.acceptCommand(s,command(1,true),0,0);advance(k,s,0,4096);
  k.acceptCommand(s,command(2,false),4096,0);
  assert.equal(k.acceptRetire(s,packet,4096,0).kind,'rejected');advance(k,s,4096,6144);
  for(const bad of [{...packet,extra:true},{...packet,seq:2},{...packet,sourceEpoch:2},{...packet,seq:NaN}])assert.equal(k.acceptRetire(s,bad,6144,0).kind,'rejected');
  assert.equal(k.acceptRetire(s,packet,6144,-1).kind,'rejected');
  const reply=k.acceptRetire(s,packet,6144,0);assert.equal(reply.kind,'retired');assert.equal(reply.gain,null);assert.equal(reply.seq,3);
  assert.equal(k.acceptCommand(s,command(4,true),6144,0).kind,'rejected');
});
test('processor stops only on explicit safe retirement and zeroes the final output',()=>{
  const messages=[],sandbox={Float32Array,Float64Array,Number,Math,sampleRate:48000,currentFrame:0};let Processor;
  sandbox.AudioWorkletProcessor=class{constructor(){this.port={postMessage:v=>messages.push(v),onmessage:null};}};
  sandbox.registerProcessor=(_,type)=>{Processor=type;};
  vm.runInNewContext(buildSync({entryPoints:['src/main/features/audio/transition-worklet.ts'],bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0].text,sandbox);
  const p=new Processor({processorOptions:{sourceEpoch:1,initial:'raw'}}),out=[Array.from({length:2},()=>new Float32Array(128)),Array.from({length:5},()=>new Float32Array(128))];
  const process=K=>p.process([[]],out,{K:new Float32Array([K])});
  p.port.onmessage({data:command(1,false)});assert.equal(process(0),true);assert.equal(messages.at(-1).kind,'completed');
  sandbox.currentFrame=128;p.port.onmessage({data:{kind:'retire',sourceEpoch:1,seq:2}});
  assert.equal(process(-1),true);assert.equal(messages.findLast(m=>m.kind==='rejected')?.seq,2);
  sandbox.currentFrame=256;p.port.onmessage({data:{kind:'retire',sourceEpoch:1,seq:3}});
  assert.equal(process(0),false);assert.equal(messages.at(-1).kind,'retired');
  for(const channel of out.flat())assert.ok(channel.every(v=>v===0));
});
function render(k,s,frame,count,input=0,K=0) {
  const left=Float32Array.from({length:count},(_,i)=>typeof input==='function'?input(i):input);
  const audio=[new Float32Array(count),new Float32Array(count)];
  const control=Array.from({length:5},()=>new Float32Array(count));
  const reply=k.renderTransition(s,[left,left],frame,count,new Float32Array([K]),audio,control);
  return {audio,control,reply};
}
function advance(k,s,from,to,input=0,K=0) {
  for(let n=from;n<to;n+=128)render(k,s,n,Math.min(128,to-n),input,K);
}
test('opt-in actual normalizer application identifies consumed input without changing default replies or PCM',()=>{
  const code=buildSync({entryPoints:['src/main/features/audio/transition-worklet.ts'],bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0].text;
  for(const rate of [44100,48000,96000]){
    const make=enabled=>{const messages=[],box={Float32Array,Float64Array,Number,Math,sampleRate:rate,currentFrame:0};let Processor;
      box.AudioWorkletProcessor=class{constructor(){this.port={postMessage:v=>messages.push(structuredClone(v)),onmessage:null};}};
      box.registerProcessor=(_,type)=>{Processor=type;};vm.runInNewContext(code,box);
      const processor=new Processor({processorOptions:{sourceEpoch:1,initial:'raw',normalizerWitness:enabled}});
      const out=[Array.from({length:2},()=>new Float32Array(128)),Array.from({length:5},()=>new Float32Array(128))];
      return {messages,box,processor,out,send:packet=>processor.port.onmessage({data:packet}),run:frame=>{box.currentFrame=frame;return processor.process([[new Float32Array(128).fill(.01)]],out,{K:new Float32Array([0])});}};
    };
    const old=make(false),witness=make(true);
    for(const h of [old,witness])h.send(command(1,true,zero,1,true));
    for(let n=0;n<8;n++){
      const frame=n*rate/10,meter={kind:'power',sourceEpoch:1,meterEpoch:1,meterSeq:n+1,observedTime:frame/rate,active:true,leftPower:1e-4,rightPower:1e-4,targetDbfs:-20};
      for(const h of [old,witness]){h.send(meter);assert.equal(h.run(frame),true);}
      assert.deepEqual(witness.out,old.out);const raw=old.messages.findLast(p=>p.kind==='meter-accepted'),p=witness.messages.findLast(p=>p.kind==='meter-accepted');
      assert.deepEqual(Object.keys(raw).sort(),['code','frame','gain','kind','meterEpoch','seq','sourceEpoch']);
      const {application,...receipt}=p;assert.deepEqual(receipt,raw);assert.ok(application);
      assert.deepEqual(Object.keys(application).sort(),['commandSeq','end','frame','fromDb','meterEpoch','meterSeq','mode','sourceEpoch','start','toDb']);
      assert.equal(application.frame,frame);assert.equal(application.commandSeq,1);assert.equal(application.meterSeq,n+1);assert.equal(application.meterEpoch,1);assert.equal(application.sourceEpoch,1);
      assert.equal(application.start,frame/rate);assert.equal(application.mode,n<4?'warmup':'ramp');
      assert.ok(Math.abs(application.toDb-(n<4?0:(n-3)*.1))<1e-12);
    }
    const saved=structuredClone(witness.messages.findLast(p=>p.application));
    for(const [i,patch] of [{sourceEpoch:2},{meterSeq:1},{meterEpoch:0}].entries()){
      const frame=Math.round(rate*(.8+i*.1));witness.send({kind:'power',sourceEpoch:1,meterEpoch:1,meterSeq:9+i,observedTime:frame/rate,active:true,leftPower:1e-4,rightPower:1e-4,targetDbfs:-20,...patch});witness.run(frame);
      assert.equal(witness.messages.findLast(p=>p.kind==='meter-accepted').application,null);
    }
    assert.deepEqual(witness.messages.find(p=>p.application?.meterSeq===8),saved,'earlier snapshot does not mutate');
    witness.send({kind:'power',sourceEpoch:1,meterEpoch:1,meterSeq:12,observedTime:0,active:true,leftPower:1e-4,rightPower:1e-4,targetDbfs:-20});witness.run(Math.round(rate*1.05));
    assert.equal(witness.messages.findLast(p=>p.kind==='meter-accepted').application.mode,'hold','stale input records the actual hold step');
    witness.send({kind:'read-error',sourceEpoch:1,meterEpoch:1,meterSeq:13,observedTime:1.1});witness.run(Math.round(rate*1.1));
    assert.equal(witness.messages.findLast(p=>p.kind==='meter-accepted').application.mode,'error');
    witness.send(command(2,false,zero,1,true));witness.send({kind:'read-error',sourceEpoch:1,meterEpoch:1,meterSeq:14,observedTime:1.2});witness.run(Math.round(rate*1.2));
    assert.equal(witness.messages.findLast(p=>p.kind==='meter-accepted').application,null,'old epoch ignored after same-quantum configure');
  }
});
function impulseReference(rate,levels,length) {
  const filters=levels.map((g,i)=>{
    const omega=2*Math.PI*[63,125,250,500,1000,2000,4000,8000][i]/rate,A=10**(g/40),alpha=Math.sin(omega)/2,a0=1+alpha/A;
    return {b0:(1+alpha*A)/a0,b1:-2*Math.cos(omega)/a0,b2:(1-alpha*A)/a0,a1:-2*Math.cos(omega)/a0,a2:(1-alpha/A)/a0,z1:0,z2:0};
  });
  const headroom=10**(-levels.reduce((sum,g)=>sum+Math.max(0,g),0)/20);
  return Array.from({length},(_,n)=>{
    let x=n===0?headroom:0;
    for(const f of filters){const y=f.b0*x+f.z1;f.z1=f.b1*x-f.a1*y+f.z2;f.z2=f.b2*x-f.a2*y;x=y;}
    return x;
  });
}
test('L1 fixed impulse matches independent RBJ and positive headroom for all rates/bands',()=>{
  const k=kernel();
  for(const rate of [44100,48000,96000])for(let band=0;band<8;band++)for(const gain of [-6,0,6]){
    const levels=zero.map((_,i)=>i===band?gain:0),s=k.createTransition(rate,1,'raw');
    assert.equal(k.acceptCommand(s,command(1,true,levels),0,0).kind,'accepted');
    advance(k,s,0,4096);
    const got=render(k,s,4096,1024,i=>i===0?1:0).audio[0];
    const expected=impulseReference(rate,levels,1024);
    for(let i=0;i<1024;i++)assert.ok(Math.abs(got[i]-expected[i])<1e-7,`${rate}/${band}/${gain}/${i}`);
  }
});
test('L1 OFF neutralizes EQ before q handover and uses exact D aligned gain endpoints',()=>{
  const k=kernel(),s=k.createTransition(48000,1,'raw');
  k.acceptCommand(s,command(1,true,[0,0,0,-6,-6,-6,-6,-6],1.32),0,0);advance(k,s,0,4096);
  const before=render(k,s,4096,1,.1);assert.equal(before.control[1][0],1);assert.equal(before.control[2][0],Math.fround(1.32));
  const start=4097; k.acceptCommand(s,command(2,false,zero,1.32),start,0);
  advance(k,s,start,start+960);
  const identity=render(k,s,start+960,1,.1);assert.equal(identity.audio[0][0],Math.fround(.1));assert.equal(identity.control[1][0],1);
  advance(k,s,start+961,start+1728);
  const end=render(k,s,start+1728,1,.1);assert.equal(end.control[1][0],0);assert.equal(end.control[2][0],1);assert.equal(end.reply?.kind,'completed');
});
test('Gain0 requires actual native latch, rejection preserves state and silent hold never opens raw',()=>{
  const k=kernel(),s=k.createTransition(48000,1,'silent-hold');
  assert.equal(k.acceptCommand(s,command(1,true,zero,0),0,0).kind,'rejected');
  assert.equal(k.acceptCommand(s,command(2,true,zero,0),0,-1).kind,'accepted');
  const got=render(k,s,0,128,.1,-1);assert.equal(got.control[1][0],1);assert.equal(got.control[2][0],0);assert.equal(got.control[4][0],1);
  advance(k,s,128,2048,.1,-1);assert.equal(render(k,s,2048,1,.1,-1).control[2][0],0);
});
test('retired/invalid packets cannot change current source, or admit nonfinite values',()=>{
  const k=kernel(),s=k.createTransition(48000,1,'raw');
  for(const bad of [{...command(1,true),sourceEpoch:2},{...command(1,true),gain:NaN},{...command(1,true),eq:[0]},{...command(1,true),arbitrary:'url'}])assert.equal(k.acceptCommand(s,bad,0,0).kind,'rejected');
  assert.equal(k.acceptCommand(s,command(1,true),0,0).kind,'accepted');
  assert.equal(k.acceptCommand(s,command(1,false),0,0).kind,'rejected');
});
test('EQ packet requires eight own finite values before acceptance without consuming state or sequence',()=>{
  const k=kernel(),bad=[];
  for(let hole=0;hole<8;hole++){const eq=zero.slice();delete eq[hole];bad.push(structuredClone(command(1,true,eq)));}
  bad.push(structuredClone(command(1,true,Array(8))));
  const inherited=zero.slice();delete inherited[3];Object.setPrototypeOf(inherited,Object.assign(Object.create(Array.prototype),{3:0}));
  bad.push(command(1,true,inherited));
  for(const value of [undefined,NaN,Infinity,-Infinity,-6.0001,6.0001,'0',null]){const eq=zero.slice();eq[3]=value;bad.push(structuredClone(command(1,true,eq)));}
  for(const packet of bad){
    const state=k.createTransition(48000,1,'raw'),before=structuredClone(state);
    assert.equal(k.isL1Command(packet),false,'every EQ index must be an own finite value');
    assert.equal(k.acceptCommand(state,packet,0,0).kind,'rejected');assert.deepEqual(structuredClone(state),before);
    assert.equal(k.acceptCommand(state,command(1,true),0,0).kind,'accepted','rejection must not consume seq1');
  }
  for(const eq of [Array(8).fill(-6),Array(8).fill(6),[-6,6,-0,0,1,-1,.5,-.5],Object.assign(zero.slice(),{every:false})]){
    const packet=structuredClone(command(1,true,eq));assert.equal(k.isL1Command(packet),true);
    assert.equal(k.acceptCommand(k.createTransition(48000,1,'raw'),packet,0,0).kind,'accepted');
  }
});

test('packaged Worklet rejects cloned sparse EQ before queueing and still accepts the same sequence',()=>{
  const code=fs.readFileSync('extension/web/audio-transition-worklet.js','utf8');
  for(const hole of [...Array(8).keys(),'all']){
    const eq=zero.slice();if(hole==='all')eq.length=0,eq.length=8;else delete eq[hole];
    const messages=[],sandbox={Float32Array,Float64Array,Number,Math,sampleRate:48000,currentFrame:0};let Processor;
    sandbox.AudioWorkletProcessor=class{constructor(){this.port={postMessage:v=>messages.push(v),onmessage:null};}};
    sandbox.registerProcessor=(_,type)=>{Processor=type;};vm.runInNewContext(code,sandbox);
    const processor=new Processor({processorOptions:{sourceEpoch:1,initial:'raw'}});
    processor.port.onmessage({data:structuredClone(command(1,true,eq))});
    assert.equal(messages.at(-1).code,'l1-packet-invalid','malformed input must fail at the port, not later render');
    assert.equal(messages.some(r=>r.kind==='accepted'),false);
    processor.port.onmessage({data:structuredClone(command(1,true,Object.assign(zero.slice(),{every:false})))});
    const outputs=[Array.from({length:2},()=>new Float32Array(128)),Array.from({length:5},()=>new Float32Array(128))];
    for(let frame=0;frame<2048;frame+=128){sandbox.currentFrame=frame;assert.equal(processor.process([[new Float32Array(128).fill(.1)]],outputs,{K:new Float32Array([0])}),true);}
    assert.equal(messages.filter(r=>r.kind==='accepted'&&r.seq===1).length,1);
    assert.equal(messages.filter(r=>r.kind==='completed'&&r.seq===1).length,1);
    assert.equal(messages.some(r=>r.code==='l1-render-invalid'),false);
    assert.ok(outputs[0].every(c=>c.some(v=>v!==0)),'the valid follow-up must render');
  }
});

test('whole block fails silent on invalid input including control outputs, without partial publication',()=>{
  const k=kernel(),s=k.createTransition(48000,1,'raw');
  const got=render(k,s,0,128,i=>i===100?NaN:.1);
  assert.equal(got.reply?.kind,'failed');
  for(const channel of [...got.audio,...got.control])assert.ok(channel.every(v=>v===0));
});
test('unsupported EQ keeps identity while normalizer remains independently limited',()=>{
  const k=kernel(),s=k.createTransition(16000,1,'raw');
  k.acceptCommand(s,command(1,true,[6,6,6,6,6,6,6,6]),0,0);advance(k,s,0,1024);
  assert.equal(render(k,s,1024,1,.25).audio[0][0],.25);
  const high=k.createTransition(192000,1,'raw');k.acceptCommand(high,command(1,true,zero,1,true),0,0);
  assert.equal(render(k,high,0,128).control[3][0],1);
});
test('settings received during OFF cannot jump the ongoing neutralization or delayed gain',()=>{
  const k=kernel(),a=k.createTransition(48000,1,'raw'),b=k.createTransition(48000,1,'raw');
  for(const s of [a,b]){k.acceptCommand(s,command(1,true,[0,0,0,-6,-6,-6,-6,-6],1.32),0,0);advance(k,s,0,4096,.1);k.acceptCommand(s,command(2,false),4096,0);advance(k,s,4096,4224,.1);}
  k.acceptCommand(b,command(3,false,[6,6,6,6,6,6,6,6],2),4224,0);
  const x=render(k,a,4224,1024,.1),y=render(k,b,4224,1024,.1);
  for(let c=0;c<2;c++)assert.deepEqual(y.audio[c],x.audio[c]);
  for(let c=0;c<5;c++)assert.deepEqual(y.control[c],x.control[c]);
});
test('packaged processor prepares and emits five controls even with no audio input',()=>{
  assert.ok(fs.existsSync('src/main/features/audio/transition-worklet.ts'),'L1 packaged processor must exist');
  const messages=[],sandbox={Float32Array,Float64Array,Number,Math,sampleRate:48000,currentFrame:0};let Processor;
  sandbox.AudioWorkletProcessor=class{constructor(){this.port={postMessage:v=>messages.push(v),onmessage:null};}};
  sandbox.registerProcessor=(name,type)=>{assert.equal(name,'knife-audio-transition-l1');Processor=type;};
  const code=buildSync({entryPoints:['src/main/features/audio/transition-worklet.ts'],bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0].text;
  vm.runInNewContext(code,sandbox);const processor=new Processor({processorOptions:{sourceEpoch:1,initial:'raw'}});
  assert.equal(messages[0].kind,'prepared');
  const outputs=[Array.from({length:2},()=>new Float32Array(128)),Array.from({length:5},()=>new Float32Array(128))];
  assert.equal(processor.process([[]],outputs,{K:new Float32Array([0])}),true);
  assert.equal(outputs[1][3][0],1);assert.equal(outputs[1][1][0],0);
  processor.port.onmessage({data:command(1,true,zero,0)});
  sandbox.currentFrame=128;processor.process([[]],outputs,{K:new Float32Array([0])});
  assert.equal(messages.length,1);assert.equal(messages[0].kind,'prepared');
  sandbox.currentFrame=256;processor.process([[]],outputs,{K:new Float32Array([-1])});
  assert.equal(messages.length,2);assert.equal(messages.at(-1).kind,'accepted');assert.equal(messages.at(-1).frame,256);
});
test('a reversal preserves the already scheduled gain prefix until its new delayed start',()=>{
  const k=kernel(),a=k.createTransition(48000,1,'raw'),b=k.createTransition(48000,1,'raw');
  for(const s of [a,b]){k.acceptCommand(s,command(1,true,zero,1.32),0,0);advance(k,s,0,4096);k.acceptCommand(s,command(2,false),4096,0);advance(k,s,4096,4352);}
  k.acceptCommand(b,command(3,true,zero,2),4352,0);
  const x=render(k,a,4352,768),y=render(k,b,4352,768);
  assert.deepEqual(y.control[2],x.control[2]);
  advance(k,b,5120,6400);assert.equal(render(k,b,6400,1).control[2][0],2);
});
test('normalizer OFF holds through q0, ignores late/error packets, and reentry cancels retirement at current dB',()=>{
  const k=kernel(),s=k.createTransition(48000,1,'raw');
  k.acceptCommand(s,command(1,true,zero,1,true),0,0);advance(k,s,0,4096);
  Object.assign(s.norm,{fromDb:3,toDb:3,start:0,end:0});
  k.acceptCommand(s,command(2,false,zero,1,true),4096,0);
  k.acceptMeter(s,{kind:'read-error',sourceEpoch:1,meterEpoch:s.meterEpoch,meterSeq:1,observedTime:4096/48000});
  const held=render(k,s,4096,1024);assert.ok(held.control[3].every(v=>v===Math.fround(10**(3/20))));
  advance(k,s,5120,6064);const current=render(k,s,6064,1).control[3][0];
  assert.ok(Math.abs(current-Math.fround(10**(1.5/20)))<1e-7);
  const oldEpoch=s.meterEpoch;k.acceptCommand(s,command(3,true,zero,1,true),6065,0);
  const resumed=render(k,s,6065,128).control[3][0];assert.ok(resumed<current&&resumed>1);
  k.acceptMeter(s,{kind:'read-error',sourceEpoch:1,meterEpoch:oldEpoch,meterSeq:2,observedTime:6193/48000});
  assert.equal(render(k,s,6193,128).control[3][0],resumed);
  k.acceptMeter(s,{kind:'read-error',sourceEpoch:1,meterEpoch:s.meterEpoch,meterSeq:3,observedTime:6321/48000});
  render(k,s,6321,128);advance(k,s,6449,6801);assert.equal(render(k,s,6801,1).control[3][0],1);
});
test('neutral EQ still evolves previous scattering state instead of freezing or clearing it',()=>{
  const k=kernel(),s=k.createTransition(48000,1,'raw');
  k.acceptCommand(s,command(1,true),0,0);const first=render(k,s,0,128,i=>i===0?.25:0);
  assert.equal(first.audio[0][0],.25);assert.ok(s.states.some(v=>v!==0));const before=Array.from(s.states);
  render(k,s,128,128);assert.notDeepEqual(Array.from(s.states),before);assert.ok(s.states.some(v=>v!==0));
});


for(const rate of [44100,48000,96000])test('opt-in headroom records the actual extreme render and clears failures '+rate,()=>{
  const k=kernel(),s=k.createTransition(rate,1,'raw',true,true),eq=Array(8).fill(6),cmd={...command(1,true,eq,2,true),dynamics:true,targetDbfs:-12};
  assert.equal(s.renderHeadroom,null);k.acceptCommand(s,cmd,0,0);
  const input=Float32Array.from({length:128},(_,i)=>Math.SQRT2*10**(-6/20)*Math.sin(2*Math.PI*1000*i/rate+.37)),audio=[new Float32Array(128),new Float32Array(128)],control=Array.from({length:5},()=>new Float32Array(128));
  let frame=0;for(;frame<rate/10;frame+=128)k.renderTransition(s,[input,input],frame,128,new Float32Array([0]),audio,control);
  assert.equal(s.renderHeadroom,null,'no receipt request means no new snapshot');
  k.renderTransition(s,[input,input],frame,128,new Float32Array([0]),audio,control,true);
  const h=JSON.parse(JSON.stringify(s.renderHeadroom));assert.equal(h.startFrame,frame);assert.equal(h.endFrame,frame+128);assert.equal(h.commandSeq,1);assert.equal(h.sourceEpoch,1);assert.deepEqual(h.eq,eq);assert.ok(Math.abs(20*Math.log10(h.headroom)+48)<.01);
  input[127]=NaN;assert.equal(k.renderTransition(s,[input,input],frame+128,128,new Float32Array([0]),audio,control,true).kind,'failed');assert.equal(s.renderHeadroom,null,'bad render cannot reuse the previous scalar');
});

test('headroom observation is explicit and cannot silently change the default state',()=>{
  const k=kernel(),s=k.createTransition(48000,1,'raw',true);assert.equal('renderHeadroom' in s,false);
  assert.throws(()=>k.createTransition(48000,1,'raw',false,true),/headroom/);
});
