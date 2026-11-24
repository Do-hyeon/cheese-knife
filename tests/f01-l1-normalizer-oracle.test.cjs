const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../scripts/audio-l1-normalizer-oracle.mjs'),rate=48000;
const reply=(kind,seq,frame,meterEpoch=1,code=null)=>({kind,sourceEpoch:1,seq,frame,meterEpoch,gain:kind==='completed'?1:null,code});
const command=(seq,wanted)=>({kind:'configure',sourceEpoch:1,seq,wanted,gain:1,eq:Array(8).fill(0),normalizer:true,targetDbfs:-20,dynamics:true});
function ledger(options={}){
  const scheduled=[],add=(frame,priority,direction,packet)=>scheduled.push({frame,priority,direction,packet});
  add(0,-4,'receive',reply('prepared',0,0,0));add(0,-3,'send',command(1,true));add(0,-2,'receive',reply('accepted',1,0));add(1728,3,'receive',reply('completed',1,1728));
  for(let n=0;n<=7;n++){const seq=options.gaps?n*3+1:n+1,frame=n*4800;add(frame,0,'send',{kind:'power',sourceEpoch:1,meterEpoch:1,meterSeq:seq,observedTime:n/10,active:true,leftPower:1e-4,rightPower:1e-4,targetDbfs:-20});add(frame,1,'receive',reply('meter-accepted',seq,frame,1,n<4?'warmup':'ramp'));}
  if(options.off){const A=38400,R=40128,B=options.on;add(A,-3,'send',command(2,false));add(A,-2,'receive',reply('accepted',2,A,2));if(B===undefined||B>R)add(R,3,'receive',reply('completed',2,R,2));if(B!==undefined){add(B,-3,'send',command(3,true));add(B,-2,'receive',reply('accepted',3,B,3));add(B+1728,3,'receive',reply('completed',3,B+1728,3));}}
  if(options.extra){const {frame,packet,epoch=1,code='ramp',ack=true}=options.extra;add(frame,0,'send',packet);if(ack)add(frame,1,'receive',reply('meter-accepted',packet.meterSeq,frame,epoch,code));}
  scheduled.sort((a,b)=>a.frame-b.frame||a.priority-b.priority);return seal(scheduled.map(({direction,packet},i)=>({order:i+1,direction,packet})));
}
function seal(events){const value={schema:'f01-control-ledger-v1',available:true,reason:null,eventCount:events.length,bytes:0,maxEvents:4128,maxBytes:1048576,events};value.bytes=Buffer.byteLength(JSON.stringify(value))+2048;return value;}
function input(start,end,db,options={}){const a=Math.round(start*rate),b=Math.round(end*rate)+1,base={rate,start:a,end:b},source={...base,channels:[new Float32Array(b-a).fill(.01),new Float32Array(b-a).fill(.01)]};return {schema:'f01-l1-normalizer-input-v1',sampleRate:rate,evidence:{schema:'f01-oracle-evidence-v1',initial:{available:true,reason:null,sourceEpoch:1,initial:'raw'},ledger:ledger(options)},source,program:{...source,channels:source.channels.map(c=>c.slice())},control:{...base,channels:[-1,1,1,0,0].map((v,c)=>Float32Array.from({length:b-a},(_,n)=>c===3?10**(db((a+n)/rate)/20):v))},observation:{sources:1,l1Nodes:1,invalidFrames:0,streamError:'',contextState:'running',hidden:false}};}
const meter=(seq,observedTime,extra={})=>({kind:'power',sourceEpoch:1,meterEpoch:1,meterSeq:seq,observedTime,active:true,leftPower:1e-4,rightPower:1e-4,targetDbfs:-20,...extra});
function currentInput(){
  const x=input(.45,.55,t=>t-.4);x.schema='f01-l1-normalizer-input-v2';x.evidence.schema='f01-oracle-evidence-v2';x.evidence.initial.normalizerWitness=true;
  for(const e of x.evidence.ledger.events)if(e.direction==='receive'&&e.packet.kind==='meter-accepted'){
    const p=e.packet,n=p.seq-1;p.application={sourceEpoch:1,meterEpoch:1,meterSeq:p.seq,commandSeq:1,frame:p.frame,mode:n<4?'warmup':'ramp',fromDb:n<4?0:(n-4)*.1,toDb:n<4?0:(n-3)*.1,start:n/10,end:n<4?n/10:n/10+.1};
  }
  x.evidence.ledger=seal(x.evidence.ledger.events);x.evidence.ledger.schema='f01-control-ledger-v2';return x;
}
test('current normalizer profile independently verifies applied plan and real N without elevating legacy limits',async()=>{
  const {compareL1Normalizer}=await load(),x=currentInput(),r=compareL1Normalizer(x);
  assert.equal(r.status,'diagnostic-match');assert.equal(r.schema,'f01-l1-normalizer-comparison-v2');assert.equal(r.applicationComparison.matched,6,'only applications before the observation end are assessed');
  assert.equal(r.originalNative7Witness,'UNASSESSED');assert.equal(r.frameOrigin,'UNPROVEN');assert.equal(r.originalNormalizerEndpointSlopeCadenceMatrix,'UNRUN');assert.equal(r.overallQualification,false);
});
test('current normalizer profile rejects missing transplanted fabricated plans and profile mixing',async()=>{
  const {compareL1Normalizer}=await load();
  for(const patch of [null,undefined,{commandSeq:2},{meterSeq:7},{meterEpoch:2},{frame:19201},{start:.399},{toDb:1},{mode:'hold'},{extra:1}]){
    const x=currentInput(),p=x.evidence.ledger.events.find(e=>e.direction==='receive'&&e.packet.kind==='meter-accepted'&&e.packet.seq===5).packet;
    if(patch===undefined)delete p.application;else if(patch===null)p.application=null;else Object.assign(p.application,patch);
    x.evidence.ledger=seal(x.evidence.ledger.events);x.evidence.ledger.schema='f01-control-ledger-v2';
    assert.equal(compareL1Normalizer(x).status,'UNAVAILABLE',JSON.stringify(patch));
  }
  for(const mutate of [x=>x.schema='f01-l1-normalizer-input-v1',x=>x.evidence.schema='f01-oracle-evidence-v1',x=>x.evidence.ledger.schema='f01-control-ledger-v1',x=>x.evidence.initial.normalizerWitness=false]){
    const x=currentInput();mutate(x);assert.equal(compareL1Normalizer(x).status,'UNAVAILABLE');
  }
  const wrongN=currentInput();wrongN.control.channels[3].fill(1);assert.equal(compareL1Normalizer(wrongN).status,'diagnostic-mismatch','plan never seeds expected N');
});
test('current normalizer profile independently requires null for an ignored original epoch',async()=>{
  const {compareL1Normalizer}=await load(),x=currentInput();
  const send=x.evidence.ledger.events.find(e=>e.direction==='send'&&e.packet.meterSeq===3),ack=x.evidence.ledger.events.find(e=>e.direction==='receive'&&e.packet.kind==='meter-accepted'&&e.packet.seq===3);
  const fake=structuredClone(ack.packet.application);send.packet.meterEpoch=0;ack.packet.application=null;
  x.evidence.ledger=seal(x.evidence.ledger.events);x.evidence.ledger.schema='f01-control-ledger-v2';
  const result=compareL1Normalizer(x);assert.equal(result.status,'diagnostic-match');assert.equal(result.applicationComparison.ignored,1);
  ack.packet.application=fake;assert.equal(compareL1Normalizer(x).status,'UNAVAILABLE');
});

test('independent literal48k powers first ramp at.4: .05dB at.45 and .15 at.55',async()=>{
  const {compareL1Normalizer}=await load(),r=compareL1Normalizer(input(.45,.55,t=>t-.4));assert.equal(r.status,'diagnostic-match');assert.ok(Math.abs(r.prediction.firstDb-.05)<1e-12);assert.ok(Math.abs(r.prediction.lastDb-.15)<1e-12);assert.equal(r.originalNative7Witness,'UNASSESSED');assert.equal(r.frameOrigin,'UNPROVEN');assert.equal(r.overallQualification,false);
});
test('OFF freezes independently predicted .4dB throughqend then retires10ms',async()=>{
  const {compareL1Normalizer}=await load(),r=compareL1Normalizer(input(.8,.85,t=>t<=.836?.4:t>=.846?0:.4*(.846-t)/.01,{off:true}));assert.equal(r.status,'diagnostic-match');assert.ok(Math.abs(r.prediction.firstDb-.4)<1e-12);assert.equal(r.prediction.lastDb,0);
  const wrong=compareL1Normalizer(input(.8,.85,t=>t>=.81?0:.4*(.81-t)/.01,{off:true}));assert.equal(wrong.status,'diagnostic-mismatch');
});
test('ON atR/midpoint/E inherits .4/.2/0 without seeding from observed N',async()=>{
  const {compareL1Normalizer}=await load();for(const [B,db]of [[40128,.4],[40368,.2],[40608,0]]){const r=compareL1Normalizer(input(B/rate,B/rate+.002,()=>db,{off:true,on:B}));assert.equal(r.status,'diagnostic-match');assert.ok(Math.abs(r.prediction.firstDb-db)<1e-12);}
});
test('corrupt pre-OFF input history changes predicted d0 instead of trusting actual N',async()=>{
  const {compareL1Normalizer}=await load(),x=input(.82,.83,()=>.4,{off:true});const events=x.evidence.ledger.events;events.find(e=>e.direction==='send'&&e.packet.kind==='power'&&e.packet.meterSeq===8).packet.active=false;x.evidence.ledger=seal(events);assert.equal(compareL1Normalizer(x).status,'diagnostic-mismatch');
});
test('old original epoch is ignored even when ACK reports current epoch/ramp',async()=>{
  const {compareL1Normalizer}=await load(),x=input(.82,.83,()=>.4,{off:true,extra:{frame:38880,packet:meter(9,.81),epoch:2,code:'ramp'}});const r=compareL1Normalizer(x);assert.equal(r.status,'diagnostic-match');assert.equal(r.history.ignoredMeters,1);
});
test('stale/future observations hold; read-error uses independent10ms unity retirement',async()=>{
  const {compareL1Normalizer}=await load();for(const observedTime of [.1,.6]){const x=input(.55,.56,()=>.1);const events=x.evidence.ledger.events.filter(e=>!(e.packet.kind==='power'&&e.packet.meterSeq>=6)&&!(e.packet.kind==='meter-accepted'&&e.packet.seq>=6));events.push({order:0,direction:'send',packet:meter(9,observedTime)},{order:0,direction:'receive',packet:reply('meter-accepted',9,24000,1,'hold')});x.evidence.ledger=seal(events.map((e,i)=>({...e,order:i+1})));assert.equal(compareL1Normalizer(x).status,'diagnostic-match');}
  const x=input(.505,.51,t=>t>=.51?0:.1*(.51-t)/.01);const events=x.evidence.ledger.events.filter(e=>!(e.packet.kind==='power'&&e.packet.meterSeq>=6)&&!(e.packet.kind==='meter-accepted'&&e.packet.seq>=6));events.push({order:0,direction:'send',packet:{kind:'read-error',sourceEpoch:1,meterEpoch:1,meterSeq:9,observedTime:.5}},{order:0,direction:'receive',packet:reply('meter-accepted',9,24000,1,'error')});x.evidence.ledger=seal(events.map((e,i)=>({...e,order:i+1})));assert.equal(compareL1Normalizer(x).status,'diagnostic-match');
});
test('coalesced meter sequence gaps are allowed; duplicate/orphan/missing ACK is unavailable',async()=>{
  const {compareL1Normalizer}=await load();assert.equal(compareL1Normalizer(input(.45,.55,t=>t-.4,{gaps:true})).status,'diagnostic-match');
  for(const change of [events=>events.filter(e=>!(e.packet.kind==='meter-accepted'&&e.packet.seq===5)),events=>[...events,events.find(e=>e.packet.kind==='meter-accepted'&&e.packet.seq===5)],events=>events.filter(e=>!(e.packet.kind==='power'&&e.packet.meterSeq===5))]){const x=input(.45,.55,t=>t-.4);x.evidence.ledger=seal(change(x.evidence.ledger.events).map((e,i)=>({...e,order:i+1})));assert.equal(compareL1Normalizer(x).status,'UNAVAILABLE');}
});
test('every pending meter or command is unavailable regardless of observation time',async()=>{
  const {compareL1Normalizer}=await load();for(const packet of [meter(20,.9),meter(20,.5),command(20,true)]){const x=input(.45,.55,t=>t-.4);x.evidence.ledger=seal([...x.evidence.ledger.events,{order:x.evidence.ledger.events.length+1,direction:'send',packet}]);assert.equal(compareL1Normalizer(x).status,'UNAVAILABLE');}
});

test('future observation time cannot exclude an unACKed meter consumed before the window ends',async()=>{
  const {compareL1Normalizer}=await load(),frames=[0,4736,9600,14336,19200];
  const build=ackFrame=>{const x=input(21504/rate,26496/rate,t=>Math.min(.1,t-.4));const events=x.evidence.ledger.events.filter(e=>!(e.packet.kind==='power'&&e.packet.meterSeq>5)&&!(e.packet.kind==='meter-accepted'&&e.packet.seq>5));
    for(const e of events){if(e.packet.kind==='power')e.packet.observedTime=frames[e.packet.meterSeq-1]/rate;else if(e.packet.kind==='meter-accepted')e.packet.frame=frames[e.packet.seq-1];}
    events.push({order:0,direction:'send',packet:meter(6,.9)});if(ackFrame!==undefined)events.push({order:0,direction:'receive',packet:reply('meter-accepted',6,ackFrame,1,'hold')});x.evidence.ledger=seal(events.map((e,i)=>({...e,order:i+1})));return x;};
  assert.equal(compareL1Normalizer(build()).status,'UNAVAILABLE');
  const early=compareL1Normalizer(build(21504));assert.equal(early.status,'diagnostic-mismatch');assert.ok(Math.abs(early.prediction.firstDb-.048)<1e-12);assert.ok(Math.abs(early.prediction.lastDb-.048)<1e-12);
  assert.equal(compareL1Normalizer(build(48000)).status,'diagnostic-match');
});
test('a missing intermediate future ACK and reversed accepted order are not complete histories',async()=>{
  const {compareL1Normalizer}=await load(),x=input(.45,.55,t=>t-.4,{gaps:true});const events=x.evidence.ledger.events;events.splice(events.findIndex(e=>e.packet.kind==='power'&&e.packet.meterSeq===4),0,{order:0,direction:'send',packet:meter(2,.9)});x.evidence.ledger=seal(events.map((e,i)=>({...e,order:i+1})));assert.equal(compareL1Normalizer(x).status,'UNAVAILABLE');
  const y=input(.45,.55,t=>t-.4,{off:true,on:40368});const accepted=y.evidence.ledger.events.filter(e=>e.packet.kind==='accepted');accepted[1].packet.frame=41000;accepted[2].packet.frame=38400;y.evidence.ledger.events.find(e=>e.packet.kind==='completed'&&e.packet.seq===2).packet.frame=42728;y.evidence.ledger=seal(y.evidence.ledger.events);assert.equal(compareL1Normalizer(y).status,'UNAVAILABLE');
});
test('initial silent-hold uses known0dB and its own accepted lifecycle rather than observed N',async()=>{
  const {compareL1Normalizer}=await load(),x=input(.45,.55,t=>t-.4);x.evidence.initial.initial='silent-hold';assert.equal(compareL1Normalizer(x).status,'UNAVAILABLE');x.evidence.ledger.events.find(e=>e.packet.kind==='completed').packet.frame=960;x.evidence.ledger=seal(x.evidence.ledger.events);assert.equal(compareL1Normalizer(x).status,'diagnostic-match');
});
test('a repeated OFF before q0 preserves the outstanding retirement/completion clock',async()=>{
  const {compareL1Normalizer}=await load(),x=input(.82,.85,t=>t<=.836?.4:t>=.846?0:.4*(.846-t)/.01,{off:true});const events=x.evidence.ledger.events.filter(e=>!(e.packet.kind==='completed'&&e.packet.seq===2));events.push({order:0,direction:'send',packet:command(3,false)},{order:0,direction:'receive',packet:reply('accepted',3,38880,2)},{order:0,direction:'receive',packet:reply('completed',3,40128,2)});x.evidence.ledger=seal(events.map((e,i)=>({...e,order:i+1})));assert.equal(compareL1Normalizer(x).status,'diagnostic-match');
});
test('global failure, initial ambiguity, stream holes, long history and same-frame commands stay unavailable',async()=>{
  const {compareL1Normalizer}=await load();for(const change of [x=>{x.observation.streamError='gap';},x=>{x.evidence.initial.available=false;},x=>{x.control.channels[2]=Array(x.control.end-x.control.start);},x=>{x.source.end++;},x=>{x.evidence.ledger.available=false;},x=>{x.evidence.ledger.events.find(e=>e.packet.kind==='accepted').packet.frame=21*rate;},x=>{x.evidence.ledger.events.find(e=>e.packet.kind==='prepared').packet.frame=x.source.start+1;}]){const x=input(.45,.55,t=>t-.4);change(x);assert.equal(compareL1Normalizer(x).status,'UNAVAILABLE');}
  const x=input(.82,.83,()=>.4,{off:true});const events=x.evidence.ledger.events;events.push({order:0,direction:'send',packet:command(3,true)},{order:0,direction:'receive',packet:reply('accepted',3,38400,3)});x.evidence.ledger=seal(events.map((e,i)=>({...e,order:i+1})));assert.equal(compareL1Normalizer(x).status,'UNAVAILABLE');
});
test('N mutation fails original.001dB diagnostic tolerance without claiming endpoint/slope/matrix PASS',async()=>{
  const {compareL1Normalizer}=await load(),x=input(.45,.55,t=>t-.4);x.control.channels[3][100]*=10**(.002/20);const r=compareL1Normalizer(x);assert.equal(r.status,'diagnostic-mismatch');assert.ok(r.comparison.maxDbError>.001);assert.equal(r.originalNormalizerEndpointSlopeCadenceMatrix,'UNRUN');assert.equal(r.overallQualification,false);
});
