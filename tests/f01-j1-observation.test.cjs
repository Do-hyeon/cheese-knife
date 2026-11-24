const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{buildSync}=require('esbuild');
const load=()=>import(pathToFileURL(path.resolve('scripts/extension-e2e/audio-l1.mjs')).href);
const events=[128,73472,92160],length=140800,levels=[0,0,0,-6,-6,-6,-6,-6],freq=[63,125,250,500,1000,2000,4000,8000];
// Self-contained independent fixture; no product imports, private PCM, control-table reuse or Native execution.
function offGain(x,{direction=1,skip=-1,linearProgress=false}={}){
  if(x<=0)return 1.32;if(x>=960)return 1;
  const z=Math.min(x,960-x)/128,edge=128/832*(z**6-3*z**5+2.5*z**4);
  const p=linearProgress?x/960:x<128?edge:x>832?1-edge:(x-64)/832;
  const dp=linearProgress?1/960:x<128||x>832?(6*z**5-15*z**4+10*z**3)/832:1/832;
  let nu=0;for(let i=0;i<8;i++)if(i!==skip){const A=10**(levels[i]*(1-p)/40);nu+=Math.max(0,.5/Math.tan(Math.PI*freq[i]/48000)*Math.LN10/40*(A+1/A)*(-levels[i])*dp);}
  return 1.32**(1-p)/(1+direction*nu);
}
const ramp=(n,start,size,from,to)=>from+(to-from)*Math.max(0,Math.min(1,(n-start)/size));
function gain(n,linear=false,opts){return n<events[1]?ramp(n,events[0]+480,960,1,1.32):n<events[2]?(linear?ramp(n,events[1],960,1.32,1):offGain(n-events[1],opts)):ramp(n,events[2]+480,960,1,1.32);}
function observation(linear=false){
  const streams=[];
  for(const channels of [2,2,5]){
    const bytes=Buffer.alloc(length*channels*4);
    for(let n=0;n<length;n++){
      const q=n<events[1]?ramp(n,events[0],480,0,1):n<events[2]?ramp(n,events[1]+1248,480,1,0):ramp(n,events[2],480,0,1);
      const controls=[-q,q,gain(n-288,linear),1,0],value=.1*Math.sin(2*Math.PI*250*(streams.length===0?n-288:n)/48000+.37);
      for(let c=0;c<channels;c++)bytes.writeFloatLE(channels===5?controls[c]:value,(n*channels+c)*4);
    }
    streams.push({start:0,end:length,channels,encoding:'interleaved-float32le',base64:bytes.toString('base64')});
  }
  return {sampleRate:48000,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',sourceFrame:0,captureStartFrame:0,streams,
    commands:events.map((f,i)=>({requestedFrame:f-64,mediaTime:f/48000,message:{kind:'configure',sourceEpoch:1,seq:i+1,wanted:i!==1,gain:1.32,eq:levels,normalizer:false}})),
    replies:events.flatMap((f,i)=>[{kind:'accepted',sourceEpoch:1,seq:i+1,frame:f,meterEpoch:0,gain:null,code:null},{kind:'completed',sourceEpoch:1,seq:i+1,frame:f+1728,meterEpoch:0,gain:i===1?1:1.32,code:null}]),
    readback:{sources:1,state:'on',wanted:true,appliedGain:1.32}};
}
const fixture=observation(),linearFixture=observation(true);
function copy(){return {...fixture,streams:fixture.streams.map(row=>({...row})),readback:{...fixture.readback},replies:fixture.replies.map(row=>({...row}))};}
function mutate(raw,index,edit){const bytes=Buffer.from(raw.streams[index].base64,'base64');edit(bytes);raw.streams[index].base64=bytes.toString('base64');}
test('J1 evaluator is explicit while historical linear evaluator keeps its original behavior',async()=>{
  const m=await load();assert.equal(typeof m.assessJ1Capture,'function');
  assert.equal(m.assessL1Capture(linearFixture).passed,true);
  assert.ok(m.assessL1Capture(fixture).failures.includes('control5-invariant'));
  const result=m.assessJ1Capture(fixture);assert.equal(result.passed,true,JSON.stringify(result.failures));assert.equal(result.schema,'f01-j1-local-v1');assert.equal(result.trajectory,'j1-unity-v1');
  assert.equal(m.assessJ1Capture(linearFixture).passed,false);
});
test('capture metadata cannot select a trajectory or disguise a wrong Gain schedule',async()=>{
  const m=await load();assert.equal(typeof m.assessJ1Capture,'function');
  assert.deepEqual(m.assessL1Capture({...fixture,trajectory:'j1-unity-v1'}),m.assessL1Capture(fixture));
  assert.equal(m.assessJ1Capture({...linearFixture,trajectory:'j1-unity-v1',schema:'f01-j1-local-v1'}).passed,false);
});
test('independent J1 fixture has literal source-frame anchor values',()=>{
  for(const [frame,want]of [[0,1.32],[128,1.2597475050640534],[480,1.1211075303573608],[832,.9972094742767621],[960,1]])assert.ok(Math.abs(offGain(frame)-want)<1e-12);
});
for(const [name,delay,options]of [['wrong D0',0,{}],['wrong D287',287,{}],['wrong D289',289,{}],['wrong phase sign',288,{direction:-1}],['missing cut band',288,{skip:3}],['linear EQ progress',288,{linearProgress:true}]])test('J1 control oracle rejects '+name,async()=>{
  const m=await load();assert.equal(typeof m.assessJ1Capture,'function');const raw=copy();
  mutate(raw,2,bytes=>{for(let n=events[1];n<events[2];n++)bytes.writeFloatLE(gain(n-delay,false,options),n*20+8);});
  assert.ok(m.assessJ1Capture(raw).failures.includes('control5-invariant'));
});
for(const name of ['instantGain','swap','tailDip','tailStep','otherChannelClip','nullReadback','zeroRawDelay'])test('J1 original waveform and observation rules reject '+name,async()=>{
  const m=await load();assert.equal(typeof m.assessJ1Capture,'function');const raw=copy();
  if(name==='nullReadback')raw.readback.appliedGain=null;
  else if(name==='zeroRawDelay')raw.streams[0].base64=raw.streams[1].base64;
  else mutate(raw,name==='instantGain'||name==='swap'?2:0,bytes=>{
    if(name==='instantGain')for(let n=events[1];n<events[2];n++)bytes.writeFloatLE(1,n*20+8);
    if(name==='swap')for(let n=0;n<length;n++){const x=bytes.readFloatLE(n*20);bytes.writeFloatLE(bytes.readFloatLE(n*20+4),n*20);bytes.writeFloatLE(x,n*20+4);}
    if(name==='tailDip')for(let n=110000;n<110768;n++)bytes.writeFloatLE(0,n*8);
    if(name==='tailStep')bytes.writeFloatLE(.4,110000*8);
    if(name==='otherChannelClip')bytes.writeFloatLE(1.01,110000*8+4);
  });assert.equal(m.assessJ1Capture(raw).passed,false);
});
for(const name of ['late','missing','fakeGain'])test('J1 decoder retains exact completion contract: '+name,async()=>{
  const m=await load();assert.equal(typeof m.assessJ1Capture,'function');const raw=copy();
  if(name==='late')raw.replies[3].frame++;if(name==='missing')raw.replies.pop();if(name==='fakeGain')raw.replies[3].gain=1.32;
  assert.throws(()=>m.assessJ1Capture(raw));
});
test('J1 observation dependency graph never imports product or private analysis code',()=>{
  const graph=buildSync({entryPoints:['scripts/extension-e2e/audio-l1.mjs'],bundle:true,write:false,metafile:true,format:'esm',platform:'node',packages:'external'}).metafile;
  assert.ok(Object.keys(graph.inputs).every(name=>!name.startsWith('src/')&&!name.startsWith('web/')&&!name.startsWith('.superpowers/')));
});
