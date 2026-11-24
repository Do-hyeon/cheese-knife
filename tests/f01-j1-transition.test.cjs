const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {buildSync}=require('esbuild');
const box={exports:{}};let wallTime=0;
vm.runInNewContext(buildSync({entryPoints:['src/main/features/audio/transition.ts'],bundle:true,write:false,format:'cjs',platform:'browser'}).outputFiles[0].text,
  {module:box,exports:box.exports,Float32Array,Float64Array,Number,Math,Date:{now:()=>wallTime}});
const k=box.exports,flat=Array(8).fill(0),cut=[0,0,0,-6,-6,-6,-6,-6],frequencies=[63,125,250,500,1000,2000,4000,8000];
const command=(seq,wanted,eq=cut,gain=1.32,normalizer=false)=>({kind:'configure',sourceEpoch:1,seq,wanted,eq,gain,normalizer,targetDbfs:-20});
function render(s,frame,count=1,pattern='stereo',K=0){
  const wave=(channel)=>Float32Array.from({length:count},(_,n)=>.1*Math.sin(2*Math.PI*(channel?750:250)*(frame+n)/s.rate+.37));
  const left=wave(0),right=pattern==='antiphase'?Float32Array.from(left,v=>-v):pattern==='single'?new Float32Array(count):wave(1);
  const input=pattern==='mono'?[left]:[left,right],audio=[new Float32Array(count),new Float32Array(count)],control=Array.from({length:5},()=>new Float32Array(count));
  const reply=k.renderTransition(s,input,frame,count,new Float32Array([K]),audio,control);
  return {audio,control,reply};
}
function advance(s,from,to,pattern='stereo',K=0){for(let f=from;f<to;f+=128)render(s,f,Math.min(128,to-f),pattern,K);}
function settled(rate=48000,eq=cut,gain=1.32){
  const s=k.createTransition(rate,1,'raw'),a=Math.ceil(.05*rate)+s.delay;
  assert.equal(k.acceptCommand(s,command(1,true,eq,gain),0,gain===0?-1:0).kind,'accepted');advance(s,0,a,'stereo',gain===0?-1:0);
  return {s,a};
}
// Independent expanded polynomial/RBJ expression; not a product helper or captured control table.
function reference(rate,levels,gain,x){
  const N=.02*rate,Q=128;
  if(x<=0)return {eq:[...levels],gain};if(x>=N)return {eq:[...flat],gain:1};
  if(rate<22050)return {eq:[...flat],gain:gain+(1-gain)*x/N};
  const R=z=>10*z**3-15*z**4+6*z**5,F=z=>2.5*z**4-3*z**5+z**6;
  let p,dp;if(x<Q){p=Q*F(x/Q)/(N-Q);dp=R(x/Q)/(N-Q);}else if(x>N-Q){p=1-Q*F((N-x)/Q)/(N-Q);dp=R((N-x)/Q)/(N-Q);}else{p=(x-Q/2)/(N-Q);dp=1/(N-Q);}
  const eq=levels.map(g=>g*(1-p));let nu=0;
  for(let i=0;i<8;i++){const w=2*Math.PI*frequencies[i]/rate,A=10**(eq[i]/40);nu+=Math.max(0,Math.sin(w)/(4*Math.sin(w/2)**2)*Math.LN10/40*(A+1/A)*(-levels[i])*dp);}
  return {eq,gain:(gain>1?gain**(1-p):gain+(1-gain)*p)/(1+nu)};
}
function sample(rate,eq,gain,x){const {s,a}=settled(rate,eq,gain);k.acceptCommand(s,command(2,false,eq,gain),a,0);advance(s,a,a+x);render(s,a+x);return {s,gain:s.gainRing[(a+x)%s.gainRing.length]};}

test('J1 midpoint uses the coupled curve, not legacy linear Gain',()=>{
  const {s,a}=settled();k.acceptCommand(s,command(2,false),a,0);advance(s,a,a+480+s.delay);
  const midpoint=render(s,a+480+s.delay);assert.ok(Math.abs(midpoint.control[2][0]-1.1211075303573608)<=1e-6);
  assert.equal(s.doneFrame,a+1728);advance(s,a+481+s.delay,a+1728);
  const end=render(s,a+1728);assert.equal(end.reply?.kind,'completed');assert.equal(end.reply?.frame,a+1728);assert.equal(end.control[2][0],1);assert.equal(end.control[1][0],0);
});
test('J1 source controls match independent equations across rates, Gain and EQ boundaries',()=>{
  for(const rate of [22050,22051,44100,48000,96000,192000,384000])for(const gain of [0,1e-9,.5,1-1e-5,1,1+1e-5,1.32,2])for(const eq of [flat,cut,Array(8).fill(6),[6,-6,6,-6,6,-6,6,-6]]){
    const {s,a}=settled(rate,eq,gain);k.acceptCommand(s,command(2,false,eq,gain),a,0);let next=a;
    for(const x of [...new Set([0,1,128,Math.floor(.01*rate),Math.floor(.02*rate)-128,Math.ceil(.02*rate)])].sort((a,b)=>a-b)){
      advance(s,next,a+x);render(s,a+x);next=a+x+1;
      const expected=reference(rate,eq,gain,x),actual=s.gainRing[(a+x)%s.gainRing.length];
      assert.ok(Math.abs(actual-expected.gain)<=1e-12,`${rate}/${gain}/${eq}/${x}: ${actual} vs ${expected.gain}`);
      for(let i=0;i<8;i++)assert.ok(Math.abs(s.gains[i]-expected.eq[i])<=1e-12);
      assert.ok(Number.isFinite(actual)&&actual>=0&&actual<=2);
    }
    assert.equal(s.doneFrame,Math.ceil(a+.03*rate+s.delay));advance(s,next,s.doneFrame);assert.equal(render(s,s.doneFrame).reply?.kind,'completed');
  }
});
test('J1 zero and flat limits remain continuous and unity is C1',()=>{
  const atGain=g=>sample(48000,cut,g,480).gain;
  assert.ok(Math.abs(atGain(1e-9)-atGain(0))<1.1e-9);
  const d=1e-5,one=atGain(1);assert.ok(Math.abs((one-atGain(1-d))/d-(atGain(1+d)-one)/d)<2e-6);
  for(const gain of [0,.5,1,1.32,2])assert.ok(Math.abs(sample(48000,flat,gain,480).gain-sample(48000,Array(8).fill(-1e-9),gain,480).gain)<1e-9);
  const {s,a}=settled(16000,flat,1.32);k.acceptCommand(s,command(2,false),a,0);advance(s,a,a+160);render(s,a+160);assert.equal(s.gainRing[(a+160)%s.gainRing.length],1.1600000000000001);
});
test('J1 ON keeps both EQ and Gain prefix through its delayed source join',()=>{
  for(const offset of [64,256,480,832,960]){
    const {s,a}=settled(),a2=a+offset,B=a2+480;k.acceptCommand(s,command(2,false),a,0);advance(s,a,a2);
    k.acceptCommand(s,command(3,true,Array(8).fill(3),2),a2,0);
    for(let f=a2;f<=B;f++){
      render(s,f);const want=reference(48000,cut,1.32,f-a);
      for(let i=0;i<8;i++)assert.ok(Math.abs(s.gains[i]-want.eq[i])<1e-12,`offset${offset}/frame${f}/EQ${i}`);
      assert.ok(Math.abs(s.gainRing[f%s.gainRing.length]-want.gain)<1e-12);
    }
    advance(s,B+1,s.doneFrame);const end=render(s,s.doneFrame);assert.equal(end.reply?.gain,2);assert.ok(s.offJoint===null);
  }
});
test('J1 re-OFF and config before ON join capture the current source tuple and cancel the future',()=>{
  for(const mode of ['off','config']){
    const {s,a}=settled(),a2=a+256,now=a2+100;
    k.acceptCommand(s,command(2,false),a,0);advance(s,a,a2);k.acceptCommand(s,command(3,true,Array(8).fill(3),2),a2,0);advance(s,a2,now);
    const before=reference(48000,cut,1.32,now-a);k.acceptCommand(s,command(4,mode==='config',flat,.5),now,0);render(s,now);
    assert.ok(Math.abs(s.gainRing[now%s.gainRing.length]-before.gain)<1e-12);
    for(let i=0;i<8;i++)assert.ok(Math.abs(s.gains[i]-before.eq[i])<1e-12);
    advance(s,now+1,s.doneFrame);const end=render(s,s.doneFrame);assert.equal(end.reply?.seq,4);assert.equal(end.reply?.gain,mode==='config'?.5:1);assert.ok(s.gains.every(g=>g===0));
  }
});
test('J1 catches nonfinite source controls before entering the Gain delay ring',()=>{
  const corrupt={beta:s=>s.beta[3]=NaN,amplitudes:s=>s.amplitudes[3]=NaN,record:s=>s.offJoint.fromGain=NaN,
    infiniteBeta:s=>s.beta[3]=Infinity,infiniteAmplitude:s=>s.amplitudes[3]=Infinity,infiniteGain:s=>s.offJoint.fromGain=Infinity,
    start:s=>s.offJoint.start=-1,end:s=>s.offJoint.end++,until:s=>s.offJoint.until=Infinity,
    eqLength:s=>s.offJoint.fromEq.pop(),eqRange:s=>s.offJoint.fromEq[3]=-7,logGain:s=>s.offJoint.logGain=Infinity};
  for(const field of Object.keys(corrupt)){
    const {s,a}=settled();k.acceptCommand(s,command(2,false),a,0);advance(s,a,a+128);
    // Amplitude is corrupted only after that frame is cached so a coefficient refresh cannot repair the fixture.
    if(field==='amplitudes'||field==='infiniteAmplitude')render(s,a+128);
    corrupt[field](s);
    const failed=render(s,a+128);assert.equal(failed.reply?.kind,'failed');
    assert.ok([...failed.audio,...failed.control].every(channel=>channel.every(v=>v===0)));assert.ok(s.gainRing.every(Number.isFinite));
  }
});

test('J1 delayed ON joins independent EQ and delayed Gain at B+1 and B+D',()=>{
  const {s,a}=settled(),a2=a+256,B=a2+480,target=Array(8).fill(3);
  k.acceptCommand(s,command(2,false),a,0);advance(s,a,a2);k.acceptCommand(s,command(3,true,target,2),a2,0);
  const join=reference(48000,cut,1.32,B-a);let next=a2;
  for(const f of [B-1,B,B+1,B+s.delay,B+s.delay+1]){
    advance(s,next,f);const r=render(s,f);next=f+1;
    const eq=f<B?reference(48000,cut,1.32,f-a).eq:join.eq.map(g=>g+(3-g)*(f-B)/960);
    const source=f-s.delay,gain=source<B?reference(48000,cut,1.32,source-a).gain:join.gain+(2-join.gain)*(source-B)/960;
    for(let i=0;i<8;i++)assert.ok(Math.abs(s.gains[i]-eq[i])<1e-12);
    assert.ok(Math.abs(r.control[2][0]-gain)<1e-6);
    assert.equal(r.control[1][0],1);
  }
});

test('J1 nonflat prefix cancellation handles normalizer changes and same-frame commands',()=>{
  for(const sameFrame of [false,true]){
    const {s,a}=settled(),a2=a+256,now=a2+(sameFrame?0:100);
    k.acceptCommand(s,command(2,false),a,0);advance(s,a,a2);
    k.acceptCommand(s,command(3,true,cut,1.32,true),a2,0);advance(s,a2,now);
    const previous=reference(48000,cut,1.32,now-a),qBefore=s.q.from+(s.q.to-s.q.from)*Math.max(0,Math.min(1,(now-s.q.start)/(s.q.end-s.q.start)));
    const normEpoch=s.meterEpoch;
    assert.equal(k.acceptCommand(s,command(4,true,flat,.5,false),now,0).kind,'accepted');
    const r=render(s,now);assert.equal(s.offJoint,null);assert.equal(s.normMode,'RETIRE');assert.equal(s.meterEpoch,normEpoch+1);
    for(let i=0;i<8;i++)assert.ok(Math.abs(s.gains[i]-previous.eq[i])<1e-12);
    assert.ok(Math.abs(s.gainRing[now%s.gainRing.length]-previous.gain)<1e-12);assert.ok(Math.abs(r.control[1][0]-qBefore)<1e-6);
    k.acceptMeter(s,{kind:'read-error',sourceEpoch:1,meterEpoch:normEpoch,meterSeq:1,observedTime:now/48000});
    advance(s,now+1,s.doneFrame);const done=render(s,s.doneFrame);assert.equal(done.reply?.seq,4);assert.equal(done.reply?.gain,.5);assert.ok(s.gains.every(g=>g===0));
  }
});

test('J1 paused source frames resume unchanged despite elapsed wall time',()=>{
  const left=settled(),right=settled(),a=left.a;
  for(const s of [left.s,right.s]){k.acceptCommand(s,command(2,false),a,0);advance(s,a,a+400);}
  const snapshot=JSON.stringify(left.s);wallTime+=60000;assert.equal(JSON.stringify(left.s),snapshot);
  assert.deepEqual(render(left.s,a+400,128),render(right.s,a+400,128));assert.deepEqual(left.s,right.s);
});
function timeline(chunk,pattern){
  const s=k.createTransition(48000,1,'raw'),end=10000,events=[[0,command(1,true)],[4096,command(2,false)],[4352,command(3,true)],[4470,command(4,true,flat,.5)],[4600,command(5,false)],[4800,command(6,true)]];
  const audio=Array.from({length:2},()=>new Float32Array(end)),control=Array.from({length:5},()=>new Float32Array(end)),replies=[];
  for(let f=0;f<end;){for(const[at,p]of events)if(f===at)replies.push(k.acceptCommand(s,p,f,0));
    let count=Math.min(typeof chunk==='number'?chunk:chunk[f%chunk.length],end-f);for(const[at]of events)if(at>f)count=Math.min(count,at-f);
    const r=render(s,f,count,pattern);for(let c=0;c<2;c++)audio[c].set(r.audio[c],f);for(let c=0;c<5;c++)control[c].set(r.control[c],f);if(r.reply)replies.push(r.reply);f+=count;
  }return {audio,control,replies};
}
test('J1 controls, channel states and completion frames are independent of render chunk size',()=>{
  for(const pattern of ['stereo','mono','antiphase','single']){const expected=timeline(1,pattern);for(const chunk of [128,1024,[7,53,201,1024]])assert.deepEqual(timeline(chunk,pattern),expected);}
});
test('J1 rapid changes keep bounded reservations and discard joint state at safe retirement',()=>{
  const {s,a}=settled();let f=a;
  for(let i=0;i<1000;i++){k.acceptCommand(s,command(i+2,i%2===0),f,0);render(s,f,4);f+=4;assert.ok(s.gainPlans.length<=482);}
  k.acceptCommand(s,command(1002,false),f,0);advance(s,f,s.doneFrame);render(s,s.doneFrame);assert.ok(s.offJoint===null);
  assert.equal(s.gainRing.length,s.delay+1);assert.equal(k.acceptRetire(s,{kind:'retire',sourceEpoch:1,seq:1003},s.doneFrame+1,0).kind,'retired');
});
