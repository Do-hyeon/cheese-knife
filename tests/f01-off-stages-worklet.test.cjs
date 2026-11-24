const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

// Current Worklet and its four local dependencies only; no build, generated bundle, or browser.
const workletCode=['eq','curve','normalizer','transition','transition-worklet'].map(name=>{
  const file=path.join(__dirname,'../src/main/features/audio',name+'.ts');
  return stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{sourceUrl:file})
    .replace(/^import\b[^;]*;\s*/gm,'').replace(/^export /gm,'');
}).join('\n');
const registration='0123456789abcdef0123456789abcdef';
const configure=(seq,wanted)=>({kind:'configure',sourceEpoch:7,seq,wanted,gain:1,
  eq:[0,0,0,0,0,0,0,0],normalizer:false,dynamics:true,targetDbfs:-20});
const register=()=>({kind:'off-stage-register',sourceEpoch:7,registration,target:configure(2,false)});
const plain=value=>structuredClone(value);

function endpoint(throwStage){
  return {messages:[],attempts:[],closed:0,postMessage(receipt){
    this.attempts.push(receipt);
    if(receipt.stage===throwStage)throw Error('diagnostic-post-'+throwStage);
    this.messages.push(receipt);
  },close(){this.closed++;}};
}
function fixture(options={}){
  const replies=[],attempts=[],originalError=Error('original-post-error');let Processor,mode='normal';
  const box={Float32Array,Float64Array,sampleRate:options.rate??44100,currentFrame:0,
    AudioWorkletProcessor:class{constructor(){this.port={onmessage:null,postMessage(reply){
      attempts.push(reply);
      if(reply.seq===2&&reply.kind==='accepted'&&mode==='throw')throw originalError;
      if(!(reply.seq===2&&mode==='noop'))replies.push(reply);
    }};}},registerProcessor(name,ctor){assert.equal(name,'knife-audio-transition-l1');Processor=ctor;}};
  vm.runInNewContext(workletCode,box);
  const processor=new Processor({processorOptions:{sourceEpoch:7,initial:'raw',offStageWitness:Object.hasOwn(options,'optIn')?options.optIn:true}});
  const send=(packet,ports=[])=>processor.port.onmessage({data:packet,ports});
  const step=(frame,K=0)=>{
    box.currentFrame=frame;
    const input=Float32Array.from({length:128},(_,n)=>.05*Math.sin((frame+n)*.1));
    const audio=Array.from({length:2},()=>new Float32Array(128));
    const control=Array.from({length:5},()=>new Float32Array(128));
    const alive=processor.process([[input,input]],[audio,control],{K:new Float32Array([K])});
    return {alive,audio,control};
  };
  if(options.prime!==false){send(configure(1,true));for(let frame=0;frame<6144;frame+=128)step(frame);}
  return {processor,replies,attempts,originalError,send,step,setMode:value=>{mode=value;},
    finish(){const blocks=[];for(let frame=6144;frame<9216;frame+=128)blocks.push(step(frame));return blocks;}};
}

test('opt-out keeps an unknown registration on the original failed-reply path',()=>{
  for(const optIn of [false,undefined,1]){
    const f=fixture({optIn}),port=endpoint(),before=f.replies.length;
    f.send(register(),[port]);
    assert.equal(f.replies.length,before+1);
    assert.equal(f.replies.at(-1).kind,'failed');
    assert.equal(f.replies.at(-1).code,'l1-packet-invalid');
    assert.equal(port.messages.length,0);
    assert.equal(f.processor.state.seq,1);
    assert.equal(f.processor.state.failed,false);
  }
});

test('registered and five positive stages retain the actual command and original reply identities',()=>{
  const f=fixture(),port=endpoint(),packet=register(),before=plain(f.processor.state),originalCount=f.replies.length;
  f.send(packet,[port]);
  assert.deepEqual(plain(f.processor.state),before);
  assert.equal(f.processor.command,null);assert.equal(f.processor.meter,null);
  assert.equal(f.replies.length,originalCount,'ACK uses the dedicated endpoint only');
  assert.equal(port.messages[0]?.stage,'registered');
  assert.equal(port.messages[0].target,packet.target);
  const off=configure(2,false);f.send(off);
  assert.equal(f.processor.command,off);
  assert.deepEqual(port.messages.map(row=>row.stage),['registered','callback','stored']);
  f.finish();
  assert.deepEqual(port.messages.map(row=>row.stage),['registered','callback','stored','accepted','accepted-post-returned','completed']);
  for(const row of port.messages){
    assert.equal(row.schema,'f01-off-stage-receipt-v1');assert.equal(row.registration,registration);
    assert.equal(row.sourceEpoch,7);assert.equal(row.seq,2);assert.equal(Object.hasOwn(row,'frame'),false);
    assert.ok(Buffer.byteLength(JSON.stringify(row))<=1024);
    if(row.stage!=='registered')assert.equal(row.target,off,'diagnostic uses the original callback packet');
  }
  const accepted=f.replies.find(row=>row.seq===2&&row.kind==='accepted');
  const completed=f.replies.find(row=>row.seq===2&&row.kind==='completed');
  assert.equal(port.messages[3].reply,accepted);assert.equal(port.messages[4].reply,accepted);
  assert.equal(port.messages[5].reply,completed);
  assert.equal(port.closed,0);assert.equal(port.attempts.length,6);
});

test('malformed or out-of-scope registration closes offered endpoints without consuming L1 state',()=>{
  const cases=[
    ['rate',f=>{},p=>{}, {rate:48000}],
    ['unprepared',f=>{},p=>{}, {prime:false}],
    ['ON pending',f=>{f.send(configure(1,true));f.step(0);},p=>{}, {prime:false}],
    ['command pending',f=>f.send(configure(3,true)),p=>{}],
    ['OFF seq1',f=>{f.send(configure(1,false));f.finish();},p=>{}, {prime:false}],
    ['later sequence',f=>{f.send(configure(3,true));f.finish();},p=>{}],
    ['foreign epoch',f=>{},p=>{p.sourceEpoch=8;}],
    ['foreign target epoch',f=>{},p=>{p.target.sourceEpoch=8;}],
    ['nonce',f=>{},p=>{p.registration='short';}],
    ['extra key',f=>{},p=>{p.extra=true;}],
    ['seq',f=>{},p=>{p.target.seq=3;}],
    ['wanted',f=>{},p=>{p.target.wanted=true;}],
    ['gain',f=>{},p=>{p.target.gain=.5;}],
    ['EQ',f=>{},p=>{p.target.eq[0]=1;}],
    ['N',f=>{},p=>{p.target.normalizer=true;}],
    ['target dB',f=>{},p=>{p.target.targetDbfs=-18;}],
    ['dynamics missing',f=>{},p=>{delete p.target.dynamics;}],
    ['dynamics false',f=>{},p=>{p.target.dynamics=false;}],
    ['extra target key',f=>{},p=>{p.target.extra=true;}],
    ['no endpoint',f=>{},p=>{}, {},0],
    ['two endpoints',f=>{},p=>{}, {},2]
  ];
  for(const [name,prepare,mutate,options,count=1] of cases){
    const f=fixture(options),packet=register(),ports=Array.from({length:count},()=>endpoint());prepare(f);mutate(packet);
    const state=plain(f.processor.state),command=f.processor.command,meter=f.processor.meter,replies=f.replies.length;
    assert.doesNotThrow(()=>f.send(packet,ports),name);
    assert.deepEqual(plain(f.processor.state),state,name);assert.equal(f.processor.command,command,name);
    assert.equal(f.processor.meter,meter,name);assert.equal(f.replies.length,replies,name);
    for(const port of ports){assert.equal(port.closed,1,name);assert.deepEqual(port.messages,[],name);}
  }
});

test('a duplicate registration closes only the newly offered endpoint',()=>{
  const f=fixture(),first=endpoint(),duplicate=endpoint();f.send(register(),[first]);f.send(register(),[duplicate]);
  assert.deepEqual(first.messages.map(row=>row.stage),['registered']);
  assert.equal(first.closed,0);assert.equal(duplicate.closed,1);assert.deepEqual(duplicate.messages,[]);
  f.send(configure(2,false));f.finish();assert.equal(first.messages.length,6);
});

test('waiting and actually rejected commands never manufacture accepted stages',()=>{
  const waiting=fixture(),port=endpoint();waiting.send(register(),[port]);const off=configure(2,false);waiting.send(off);
  waiting.step(6144,-1);assert.equal(waiting.processor.command,off);
  assert.deepEqual(port.messages.map(row=>row.stage),['registered','callback','stored']);
  waiting.step(6272,0);assert.equal(port.messages.at(-1).stage,'accepted-post-returned');
  const rejected=fixture(),rejectedPort=endpoint();rejected.send(register(),[rejectedPort]);
  rejected.send(configure(3,true));rejected.step(6144);rejected.send(configure(2,false));rejected.step(6272);
  assert.ok(rejected.replies.some(row=>row.seq===2&&row.kind==='rejected'));
  assert.deepEqual(rejectedPort.messages.map(row=>row.stage),['registered','callback','stored']);
});

test('callback observation does not imply storage when the command slot is occupied',()=>{
  const f=fixture(),port=endpoint();f.send(register(),[port]);const other=configure(3,true),off=configure(2,false);
  f.send(other);f.send(off);assert.equal(f.processor.command,other);
  assert.equal(f.replies.at(-1).kind,'failed');f.finish();
  assert.deepEqual(port.messages.map(row=>row.stage),['registered','callback']);assert.equal(port.messages[1].target,off);
});

test('an original accepted post throw propagates without a post-returned success receipt',()=>{
  const baseline=fixture({optIn:false}),f=fixture(),port=endpoint();f.send(register(),[port]);
  for(const item of [baseline,f]){item.setMode('throw');item.send(configure(2,false));
    assert.throws(()=>item.step(6144),error=>error===item.originalError);}
  assert.deepEqual(plain(f.processor.state),plain(baseline.processor.state));
  assert.deepEqual(plain(f.replies),plain(baseline.replies));
  assert.deepEqual(port.messages.map(row=>row.stage),['registered','callback','stored','accepted']);
  assert.equal(port.messages.at(-1).reply,f.attempts.at(-1));
});

test('an original post no-op still means returned, without asserting original delivery',()=>{
  const f=fixture(),port=endpoint();f.send(register(),[port]);f.setMode('noop');f.send(configure(2,false));f.finish();
  assert.deepEqual(port.messages.map(row=>row.stage),['registered','callback','stored','accepted','accepted-post-returned','completed']);
  assert.equal(f.replies.filter(row=>row.seq===2).length,0);
  assert.equal(port.messages[4].reply,f.attempts.find(row=>row.seq===2&&row.kind==='accepted'));
  assert.equal(port.messages[5].reply,f.attempts.find(row=>row.seq===2&&row.kind==='completed'));
});

test('a diagnostic post throw at any stage preserves original replies, PCM, and processing state',()=>{
  const baseline=fixture({optIn:false});baseline.send(configure(2,false));const expected=baseline.finish();
  for(const stage of ['registered','callback','stored','accepted','accepted-post-returned','completed']){
    const f=fixture(),port=endpoint(stage);assert.doesNotThrow(()=>f.send(register(),[port]),stage);
    f.send(configure(2,false));let blocks;assert.doesNotThrow(()=>{blocks=f.finish();},stage);
    assert.deepEqual(blocks,expected,stage);assert.deepEqual(plain(f.replies),plain(baseline.replies),stage);
    assert.deepEqual(plain(f.processor.state),plain(baseline.processor.state),stage);
    const thrown=port.attempts.findIndex(row=>row.stage===stage);assert.ok(thrown>=0,stage);
    assert.equal(port.attempts.length,thrown+1,'failed diagnostic is never retried or flushed');
    const extra=endpoint();f.send(register(),[extra]);assert.equal(extra.closed,1,'failure cannot reopen registration');
  }
});

test('only the exact OFF target participates and another sequence cannot supply its completion',()=>{
  const mismatch=fixture(),mismatchPort=endpoint();mismatch.send(register(),[mismatchPort]);
  const otherOff=configure(2,false);otherOff.targetDbfs=-18;mismatch.send(otherOff);mismatch.finish();
  assert.deepEqual(mismatchPort.messages.map(row=>row.stage),['registered']);
  const f=fixture(),port=endpoint();f.send(register(),[port]);f.send(configure(2,false));f.step(6144);
  f.send(configure(3,true));for(let frame=6272;frame<10240;frame+=128)f.step(frame);
  assert.ok(f.replies.some(row=>row.kind==='completed'&&row.seq===3));
  assert.deepEqual(port.messages.map(row=>row.stage),['registered','callback','stored','accepted','accepted-post-returned']);
});
