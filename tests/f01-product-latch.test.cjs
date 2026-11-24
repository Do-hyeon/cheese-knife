const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {buildSync}=require('esbuild');
const {setup}=require('./audio-fixture.cjs');
const {flush}=require('./helpers.cjs');

const code=buildSync({entryPoints:['src/main/features/audio/transition-worklet.ts'],bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0].text;
const rates=[[44100,1587,882],[48000,1728,960],[96000,3456,1920]];
const zero=[0,0,0,0,0,0,0,0],eq125=[0,1.25,0,0,0,0,0,0];
const command=(seq,wanted,gain=0,eq=zero)=>({kind:'configure',sourceEpoch:1,seq,wanted,gain,eq,normalizer:false,dynamics:false,targetDbfs:-20});

function worklet(rate,options={}){
  const messages=[],sandbox={Float32Array,Float64Array,Number,Math,sampleRate:rate,currentFrame:0};let Processor;
  sandbox.AudioWorkletProcessor=class{constructor(){this.port={postMessage:value=>messages.push(value),onmessage:null};}};
  sandbox.registerProcessor=(name,type)=>{assert.equal(name,'knife-audio-transition-l1');Processor=type;};
  vm.runInNewContext(code,sandbox);
  const processor=new Processor({processorOptions:{sourceEpoch:1,initial:'raw',...options}});
  const outputs=[Array.from({length:2},()=>new Float32Array(128)),Array.from({length:5},()=>new Float32Array(128))];
  const replies=seq=>messages.filter(value=>value.seq===seq);
  const step=K=>{
    const frame=sandbox.currentFrame,input=Float32Array.from({length:128},(_,i)=>.1*Math.sin(2*Math.PI*750*(frame+i)/rate+.37));
    assert.equal(processor.process([[input,input]],outputs,{K:new Float32Array([K])}),true);
    for(const channel of outputs.flat())assert.ok(channel.every(Number.isFinite),'audio and controls stay finite');
    sandbox.currentFrame+=128;return frame;
  };
  const finish=(seq,K)=>{
    for(let guard=0;!replies(seq).some(value=>value.kind==='completed')&&guard<Math.ceil(rate/128);guard++)step(K);
    const completed=replies(seq).filter(value=>value.kind==='completed');assert.equal(completed.length,1,'one actual completion');
    assert.equal(replies(seq).filter(value=>value.kind==='accepted').length,1,'one actual acceptance');
    assert.ok(replies(seq).every(value=>value.kind==='accepted'||value.kind==='completed'));
    return completed[0];
  };
  const settle=(packet,K)=>{processor.port.onmessage({data:packet});const frame=step(K);const completed=finish(packet.seq,K);
    assert.equal(replies(packet.seq).find(value=>value.kind==='accepted').frame,frame);return completed;};
  return {messages,replies,step,finish,settle,outputs,send:packet=>processor.port.onmessage({data:packet}),frame:()=>sandbox.currentFrame};
}

for(const [rate,duration,eqDuration]of rates){
  test(`completed Gain0/EQ then OFF waits one stale native K quantum at ${rate} Hz`,()=>{
    const h=worklet(rate);
    assert.equal(h.settle(command(3,true),-1).frame,duration);
    const eqFrame=h.frame();assert.equal(h.settle(command(4,true,0,eq125),-1).frame,eqFrame+eqDuration);
    const requestFrame=h.frame();h.send(command(5,false,0,eq125));h.step(-1);
    assert.equal(h.replies(5).length,0,'valid OFF must remain pending while native K is still -1');
    const acceptedFrame=h.step(0);assert.equal(acceptedFrame,requestFrame+128);
    assert.equal(h.replies(5).length,1);assert.equal(h.replies(5)[0].kind,'accepted');assert.equal(h.replies(5)[0].frame,acceptedFrame);
    assert.equal(h.finish(5,0).frame,acceptedFrame+duration,'completion clock starts at actual acceptance');
    assert.equal(h.outputs[1][1].at(-1),0);assert.equal(h.outputs[1][2].at(-1),1);assert.equal(h.outputs[1][4].at(-1),-0);
  });

  test(`Gain0 ON waits one native K engagement quantum at ${rate} Hz`,()=>{
    const h=worklet(rate);h.send(command(1,true));h.step(0);
    assert.equal(h.replies(1).length,0,'valid Gain0 ON must remain pending while native K is still 0');
    const acceptedFrame=h.step(-1);assert.equal(acceptedFrame,128);
    assert.equal(h.replies(1).length,1);assert.equal(h.replies(1)[0].kind,'accepted');assert.equal(h.replies(1)[0].frame,128);
    assert.equal(h.finish(1,-1).frame,128+duration);
    assert.equal(h.outputs[1][1].at(-1),1);assert.equal(h.outputs[1][2].at(-1),0);assert.equal(h.outputs[1][4].at(-1),1);
  });

  test(`permanently mismatched native K never acknowledges Gain0 at ${rate} Hz`,()=>{
    const h=worklet(rate);h.send(command(1,true));
    for(let frame=0;frame<rate+128;frame+=128)h.step(0);
    assert.equal(h.replies(1).length,0,'no accepted, rejected, completed or failed ACK may be fabricated for a valid waiting command');
    assert.equal(h.outputs[1][1].at(-1),0);assert.equal(h.outputs[1][2].at(-1),1);
  });

  test(`matching native K keeps normal acceptance and completion frames at ${rate} Hz`,()=>{
    const h=worklet(rate);assert.equal(h.settle(command(1,true),-1).frame,duration);
    assert.equal(h.outputs[1][1].at(-1),1);assert.equal(h.outputs[1][2].at(-1),0);
    const offFrame=h.frame();assert.equal(h.settle(command(2,false),0).frame,offFrame+duration);
    assert.equal(h.outputs[1][1].at(-1),0);assert.equal(h.outputs[1][2].at(-1),1);
  });

  for(const [label,bad]of [['stale seq',command(1,false)],['wrong epoch',{...command(2,false),sourceEpoch:2}]])
    test(`${label} rejects immediately despite native K mismatch at ${rate} Hz`,()=>{
      const h=worklet(rate);h.settle(command(1,true),-1);h.send(bad);const frame=h.step(-1);
      const reply=h.messages.at(-1);assert.equal(reply.kind,'rejected');assert.equal(reply.code,'l1-command-invalid');assert.equal(reply.seq,bad.seq);assert.equal(reply.frame,frame);
      const count=h.messages.length;h.step(0);assert.equal(h.messages.length,count,'invalid packet must not be retried after K changes');
    });

  test(`malformed packet fails immediately before native K can change at ${rate} Hz`,()=>{
    const h=worklet(rate);h.settle(command(1,true),-1);const frame=h.frame(),count=h.messages.length;
    h.send({...command(2,false),eq:[0]});assert.equal(h.messages.length,count+1);
    const reply=h.messages.at(-1);assert.equal(reply.kind,'failed');assert.equal(reply.code,'l1-packet-invalid');assert.equal(reply.frame,frame);
  });
}

test('unacknowledged native latch command retains the controller 1000 ms timeout',async t=>{
  const failures={clock:true},h=setup(t,false,true,{compressorEnabled:false,normalizerEnabled:false},failures);
  await h.audio.setEnabled(h.video,true);await flush();failures.manualWorkletAck=true;
  h.audio.setGain(h.video,0);await flush();const node=h.nodes.find(value=>value.type==='transition');
  assert.equal(node.commands.at(-1).gain,0);assert.equal(node.commands.at(-1).wanted,true);assert.equal(h.audio.getReadback(h.video).appliedGain,null);
  await h.time.advance(999);assert.notEqual(h.audio.getState(h.video),'unavailable');
  await h.time.advance(1);assert.equal(h.audio.getState(h.video),'unavailable');
  assert.ok(h.statusChanges.some(([feature,state,reason])=>feature==='audioProcessing'&&state==='limited'&&reason==='audio-command-timeout'));
  assert.equal(h.sources(),1);assert.equal(h.nodes.find(value=>value.type==='constant').offset.value,-1);
});


for(const rate of [44100,48000,96000])test('actual extreme headroom Worklet receipt is replayed at its final sample '+rate,async()=>{
  const {assessRenderHeadroom}=await import('../scripts/audio-l1-normalizer-oracle.mjs'),h=worklet(rate,{normalizerWitness:true,headroomWitness:true}),eq=Array(8).fill(6),p={...command(1,true,2,eq),normalizer:true,dynamics:true,targetDbfs:-12};
  const sent=[],send=packet=>{sent.push({index:h.messages.length,packet});h.send(packet);};send(p);h.step(0);const completed=h.finish(1,0),accepted=h.messages.find(x=>x.kind==='accepted');
  const anchor=h.frame(),meter={kind:'power',sourceEpoch:1,meterEpoch:accepted.meterEpoch,meterSeq:1,observedTime:anchor/rate,active:true,leftPower:10**(-6/10),rightPower:10**(-6/10),targetDbfs:-12};
  send(meter);h.step(0);const receipt=h.messages.at(-1);assert.equal(receipt.kind,'meter-accepted');assert.deepEqual(Array.from(receipt.renderHeadroom.eq),eq);assert.ok(Math.abs(20*Math.log10(receipt.renderHeadroom.headroom)+48)<.01);
  const events=[];for(let i=0;i<=h.messages.length;i++){for(const row of sent.filter(x=>x.index===i))events.push({direction:'send',packet:row.packet,order:events.length+1});if(i<h.messages.length)events.push({direction:'receive',packet:JSON.parse(JSON.stringify(h.messages[i])),order:events.length+1});}
  const ledger={schema:'f01-control-ledger-v3',available:true,reason:null,eventCount:events.length,maxEvents:4128,bytes:0,maxBytes:1048576,events};ledger.bytes=Buffer.byteLength(JSON.stringify(ledger))+2048;
  const evidence={schema:'f01-oracle-evidence-v3',initial:{available:true,reason:null,sourceEpoch:1,initial:'raw',normalizerWitness:true,headroomWitness:true},ledger};
  const result=assessRenderHeadroom(evidence,{command:{message:p},accepted:JSON.parse(JSON.stringify(accepted)),completed:JSON.parse(JSON.stringify(completed))},eq,rate,anchor);
  assert.equal(result.passed,true,result.reason);assert.equal(result.expectedDb,-48);assert.equal(result.frame,anchor+127);assert.equal(result.native3Witness,'UNASSESSED');assert.equal(result.overallQualification,false);
  h.step(0);send({...meter,meterSeq:2,observedTime:h.frame()/rate,meterEpoch:0});h.step(0);assert.equal(h.messages.at(-1).application,null,'ignored N input retains the original null meaning');assert.notEqual(h.messages.at(-1).renderHeadroom,null,'actual successful render is a separate scalar observation');
});
