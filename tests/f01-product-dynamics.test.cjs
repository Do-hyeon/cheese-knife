const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {buildSync}=require('esbuild');
const box={exports:{}};
vm.runInNewContext(buildSync({entryPoints:['src/main/features/audio/transition.ts'],bundle:true,write:false,format:'cjs',platform:'browser'}).outputFiles[0].text,
  {module:box,exports:box.exports,Float32Array,Float64Array,Number,Math});
const k=box.exports,mixed=[3,-6,0,4,-2,1,-5,6],cut=[0,0,0,-6,-6,-6,-6,-6];
const command=(seq,wanted,eq=mixed)=>({kind:'configure',sourceEpoch:1,seq,wanted,eq,gain:1.32,normalizer:false,targetDbfs:-18});
function render(state,frame,count,frequency=750){
  const input=Float32Array.from({length:count},(_,n)=>.1*Math.sin(2*Math.PI*frequency*(frame+n)/state.rate+.37));
  const audio=[new Float32Array(count),new Float32Array(count)],control=Array.from({length:5},()=>new Float32Array(count));
  const reply=k.renderTransition(state,[input,input],frame,count,new Float32Array([0]),audio,control);
  return {audio,control,reply};
}

test('an explicit dynamics flag accepts only booleans while legacy configure remains valid',()=>{
  for(const dynamics of [false,true]){
    const state=k.createTransition(48000,1,'raw');
    assert.equal(k.acceptCommand(state,{...command(1,true),dynamics},0,0).kind,'accepted');
  }
  for(const dynamics of [undefined,null,0,1,'yes',{},[]]){
    const state=k.createTransition(48000,1,'raw');
    assert.equal(k.acceptCommand(state,{...command(1,true),dynamics},0,0).kind,'rejected');assert.equal(state.seq,0);
  }
  assert.equal(k.acceptCommand(k.createTransition(48000,1,'raw'),command(1,true),0,0).kind,'accepted');
});

for(const [rate,delay,qLength,offLength]of [[44100,264,441,1587],[48000,288,480,1728],[96000,576,960,3456]])
test(`dynamics keeps mixed EQ and headroom warm through master OFF/ON at ${rate} without moving q or completion`,()=>{
  const switched=k.createTransition(rate,1,'raw'),alwaysOn=k.createTransition(rate,1,'raw'),replies=[];
  for(const state of [switched,alwaysOn])assert.equal(k.acceptCommand(state,{...command(1,true),dynamics:true},0,0).kind,'accepted');
  assert.equal(switched.delay,delay);let cursor=0;
  const block=count=>{
    const got=render(switched,cursor,count),reference=render(alwaysOn,cursor,count);
    assert.deepEqual(got.audio,reference.audio,`EQ audio changed at frame ${cursor}`);
    assert.deepEqual(switched.gains,alwaysOn.gains);assert.deepEqual(switched.coefficients,alwaysOn.coefficients);
    if(got.reply)replies.push(got.reply);cursor+=count;return got;
  };
  const advance=to=>{while(cursor<to)block(Math.min(128,to-cursor));};
  const sample=frame=>{advance(frame);return block(1);};
  advance(4096);assert.deepEqual(Array.from(switched.gains),mixed);
  assert.equal(k.acceptCommand(switched,{...command(2,false),dynamics:true},4096,0).kind,'accepted');
  const qStart=4096+2*qLength+delay;
  assert.equal(sample(qStart).control[1][0],1);
  assert.equal(sample(qStart+1).control[1][0],Math.fround(1-1/qLength));
  const off=sample(4096+offLength);assert.equal(off.control[1][0],0);assert.equal(off.reply?.kind,'completed');assert.equal(off.reply.frame,4096+offLength);
  assert.deepEqual(Array.from(switched.gains),mixed);
  const onFrame=4096+offLength+256;advance(onFrame);
  assert.equal(k.acceptCommand(switched,{...command(3,true),dynamics:true},onFrame,0).kind,'accepted');
  assert.equal(sample(onFrame).control[1][0],0);
  assert.equal(sample(onFrame+1).control[1][0],Math.fround(1/qLength));
  assert.equal(sample(onFrame+qLength).control[1][0],1);
  const on=sample(onFrame+offLength);assert.equal(on.reply?.kind,'completed');assert.equal(on.reply.frame,onFrame+offLength);
  assert.deepEqual(replies.filter(reply=>reply.seq===2||reply.seq===3).map(reply=>[reply.seq,reply.kind,reply.frame]),[
    [2,'completed',4096+offLength],[3,'completed',onFrame+offLength]
  ]);
});

function legacyTimeline(rate,eq,explicit){
  const state=k.createTransition(rate,1,'raw'),audio=Array.from({length:2},()=>new Float32Array(12288)),control=Array.from({length:5},()=>new Float32Array(12288)),replies=[];
  for(let frame=0;frame<12288;frame+=128){
    if([0,4096,8192].includes(frame)){
      const packet=command(frame===0?1:frame===4096?2:3,frame!==4096,eq);
      if(explicit)packet.dynamics=false;
      const accepted=k.acceptCommand(state,packet,frame,0);assert.equal(accepted.kind,'accepted');replies.push(accepted);
    }
    const got=render(state,frame,128,250);for(let channel=0;channel<2;channel++)audio[channel].set(got.audio[channel],frame);
    for(let channel=0;channel<5;channel++)control[channel].set(got.control[channel],frame);if(got.reply)replies.push(got.reply);
  }
  return {audio,control,replies};
}

test('explicit dynamics false preserves bit-identical legacy mixed EQ and negative-250 J1 audio and controls',()=>{
  for(const rate of [44100,48000,96000])for(const eq of [mixed,cut]){
    const legacy=legacyTimeline(rate,eq,false),explicit=legacyTimeline(rate,eq,true);assert.deepEqual(explicit,legacy);
    if(rate===48000&&eq===cut){
      assert.equal(legacy.control[2][4864],Math.fround(1.1211075303573608));
      assert.equal(legacy.control[1][5824],0);assert.equal(legacy.control[2][5824],1);
    }
  }
});
