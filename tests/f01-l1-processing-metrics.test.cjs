const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../scripts/audio-l1-processing-metrics.mjs');
const frequencies=[63,125,250,500,1000,2000,4000,8000];
const spec=(kind='neutral',level=0,rate=48000)=>({id:rate+'/'+(kind==='band'?'band/1000/'+level:'neutral/1000'),sampleRate:rate,frequency:1000,levels:frequencies.map(f=>f===1000?level:0),masterGain:1});
const packet=(seq,wanted,eq=Array(8).fill(0),normalizer=false,gain=1)=>({kind:'configure',sourceEpoch:1,seq,wanted,eq,gain,normalizer,dynamics:normalizer,targetDbfs:-20});
const reply=(kind,seq,frame,gain=null)=>({kind,sourceEpoch:1,seq,frame,meterEpoch:0,gain,code:null});
function observation(s){return {sources:1,l1Nodes:1,filters:0,invalidFrames:0,streamError:'',commands:[{requestedFrame:100,message:packet(1,true,[...s.levels],false,s.masterGain)}],replies:[reply('prepared',0,0),reply('accepted',1,128),reply('completed',1,1600,s.masterGain)]};}
function window(rate,start,seconds,rms,channels=2){const end=start+Math.round(rate*seconds);return {rate,start,end,channels:Array.from({length:channels},()=>Float32Array.from({length:end-start},(_,n)=>Math.SQRT2*rms*Math.sin(2*Math.PI*1000*n/rate+.37)))};}
function input(s=spec(),db=0){const source=window(s.sampleRate,s.sampleRate,1,.01),program=window(s.sampleRate,s.sampleRate,1,.01*10**(db/20)),control={...source,channels:[-1,1,s.masterGain,1,0].map(v=>new Float32Array(s.sampleRate).fill(v))};return {schema:'f01-l1-eq-input-v1',spec:s,source,program,control,observation:observation(s)};}
function phase(B=11728,rate=48000){return {sampleRate:rate,sourceEpoch:1,offSeq:2,onSeq:3,commands:[{requestedFrame:9900,message:packet(2,false,undefined,true)},{requestedFrame:B-1,message:packet(3,true,undefined,true)}],replies:[reply('accepted',2,10000),reply('accepted',3,B)]};}

test('explicit EQ component profile excludes Gain from tap while retaining final output and legacy limits',async()=>{
  const {assessL1Equalizer}=await load();
  for(const rate of [44100,48000,96000])for(const gain of [.5,2]){
    const s={...spec('neutral',0,rate),id:`${rate}/gain/${gain}`,masterGain:gain},x=input(s,20*Math.log10(gain));
    x.schema='f01-l1-eq-input-v2';x.component=window(rate,rate,1,.01);const result=assessL1Equalizer(x);
    assert.deepEqual(result.failures,[]);assert.equal(result.componentWitnessPassed,true);assert.equal(result.component.expectedDb,0);
    assert.equal(result.native8ComponentWitness,'UNASSESSED');assert.equal(result.overallQualification,false);
    x.component=window(rate,rate,1,.01*gain);assert.equal(assessL1Equalizer(x).componentWitnessPassed,false,'final output cannot stand in for pre-Gain tap');
  }
  for(const level of [-6,6]){const s=spec('band',level),x=input(s,level<0?-6:0);x.schema='f01-l1-eq-input-v2';x.component=window(48000,48000,1,.01*10**((level<0?-6:0)/20));assert.equal(assessL1Equalizer(x).componentWitnessPassed,true);}
});
test('EQ component profile rejects missing misaligned nonfinite and frequency-transplanted taps',async()=>{
  const {assessL1Equalizer}=await load();
  for(const mutate of [x=>delete x.component,x=>x.component.start++,x=>x.component.rate=44100,x=>x.component.channels[0][0]=NaN,x=>x.schema='f01-l1-eq-input-v1']){
    const x=input();x.schema='f01-l1-eq-input-v2';x.component=structuredClone(x.source);mutate(x);assert.throws(()=>assessL1Equalizer(x));
  }
  const x=input();x.schema='f01-l1-eq-input-v2';x.component=window(48000,48000,1,.01);
  for(const c of x.component.channels)for(let n=0;n<c.length;n++)c[n]=Math.SQRT2*.01*Math.sin(2*Math.PI*2000*n/48000+.37);
  const r=assessL1Equalizer(x);assert.equal(r.originalOutputGatesPassed,true);assert.equal(r.componentWitnessPassed,false);assert.ok(r.failures.includes('component-channel-0/coherent-tone'));
  for(const c of x.component.channels)for(let n=0;n<c.length;n++)c[n]=Math.SQRT2*.01*(Math.sqrt(1-.01**2)*Math.sin(2*Math.PI*2000*n/48000+.37)+.01*Math.sin(2*Math.PI*1000*n/48000+.37));
  assert.ok(assessL1Equalizer(x).failures.includes('component-channel-0/coherent-tone'),'a small correct tone mixed into the donor does not establish expected response');
});

test('literal neutral and centre +/-6dB cases preserve both output gates and headroom',async()=>{
  const {assessL1Equalizer}=await load();for(const rate of [44100,48000,96000])for(const [s,db]of [[spec('neutral',0,rate),0],[spec('band',6,rate),0],[spec('band',-6,rate),-6]]){
    const r=assessL1Equalizer(input(s,db));assert.deepEqual(r.failures,[]);assert.equal(r.originalOutputGatesPassed,true);assert.equal(r.native8ComponentWitness,'UNASSESSED');assert.equal(r.overallQualification,false);assert.equal(r.measuredCompositeTransfer.kind,'measured-program-over-source');assert.ok(Math.abs(r.expectedCompositeDb-db)<1e-8);
  }
});
test('wrong source cannot be hidden by compensated program output or expected nativeDb',async()=>{
  const {assessL1Equalizer}=await load(),bad=input(spec('band',6));bad.source=window(48000,48000,1,.02);
  const r=assessL1Equalizer(bad);assert.ok(r.failures.includes('source-channel-0/rms'));assert.ok(r.failures.includes('output-channel-0/composite'));assert.equal(r.originalOutputGatesPassed,false);
  assert.throws(()=>assessL1Equalizer({...input(spec('band',6),6),nativeDb:6}),/input/);
  assert.throws(()=>assessL1Equalizer({...input(),expectedCompositeDb:0}),/input/);
});
test('a different frequency or DC with the same RMS is not the original coherent input',async()=>{
  const {assessL1Equalizer}=await load();for(const dc of [false,true]){const x=input();x.source.channels=x.source.channels.map(()=>Float32Array.from({length:48000},(_,n)=>dc?.01:Math.SQRT2*.01*Math.sin(2*Math.PI*2000*n/48000+.37)));assert.equal(assessL1Equalizer(x).originalOutputGatesPassed,false);}
});
test('EQ validates the original one-second aligned 2/2/5 streams and original case',async()=>{
  const {assessL1Equalizer}=await load();for(const change of [x=>{x.source.start++;},x=>{x.program=window(48000,48000,.5,.01);},x=>{x.control.channels.pop();},x=>{x.control.channels[3][200]=NaN;},x=>{x.control.channels[3]=Array(48000);},x=>{x.schema='f01-audio-processing-v2';},x=>{x.spec.frequency=999;},x=>{x.program.rate=44100;}]){const x=input();change(x);assert.throws(()=>assessL1Equalizer(x));}
});
test('actual channel/control/identity failures cannot pass while all other values match',async()=>{
  const {assessL1Equalizer}=await load();for(const change of [x=>x.program.channels[1].fill(0),x=>{[x.control.channels[1],x.control.channels[4]]=[x.control.channels[4],x.control.channels[1]];},x=>{x.control.channels[2][123]=.5;},x=>{x.observation.sources=2;},x=>{x.observation.filters=8;},x=>{x.observation.streamError='gap';}]){const x=input();change(x);assert.equal(assessL1Equalizer(x).originalOutputGatesPassed,false);}
});
test('latest stable configure must match full EQ/G/wanted/norm/dynamics and lifecycle order',async()=>{
  const {assessL1Equalizer}=await load();for(const change of [x=>{x.observation.replies.pop();},x=>{x.observation.replies[2].frame=64;},x=>{[x.observation.replies[1],x.observation.replies[2]]=[x.observation.replies[2],x.observation.replies[1]];},x=>{x.observation.commands[0].message.eq[0]=1;},x=>{x.observation.commands[0].message.normalizer=true;},x=>{x.observation.commands[0].message.dynamics=true;},x=>{x.observation.commands[0].message.wanted=false;},x=>{x.observation.commands.push({requestedFrame:47000,message:packet(2,true,undefined,false,.5)});},x=>{x.observation.commands.push({requestedFrame:48001,message:packet(2,true)});},x=>{x.observation.replies.push(reply('accepted',1,128));}]){const x=input();change(x);assert.equal(assessL1Equalizer(x).originalOutputGatesPassed,false);}
});
test('the .05/.5dB output limits and wet ceiling remain effective',async()=>{
  const {assessL1Equalizer}=await load();assert.equal(assessL1Equalizer(input(spec(),.049)).originalOutputGatesPassed,true);assert.equal(assessL1Equalizer(input(spec(),.051)).originalOutputGatesPassed,false);
  assert.equal(assessL1Equalizer(input(spec('band',6),.499)).originalOutputGatesPassed,true);assert.equal(assessL1Equalizer(input(spec('band',6),.501)).originalOutputGatesPassed,false);
  const bad=input();bad.program.channels[0][100]=1.01;assert.ok(assessL1Equalizer(bad).failures.includes('output-channel-0/headroom'));
});
test('phase labels use literal accepted-frame boundaries and never measured q or N',async()=>{
  const {classifyL1Reentry}=await load();for(const [rate,R,E]of [[44100,11587,12028],[48000,11728,12208],[96000,13456,14416]])for(const [B,label]of [[R-1,'HOLD'],[R,'HOLD'],[R+1,'RETIRE'],[E-1,'RETIRE'],[E,'UNITY']]){
    const r=classifyL1Reentry(phase(B,rate));assert.equal(r.schema,'f01-l1-reentry-phase-v2');assert.equal(r.authority.path,'scripts/audio-verification-contract.json');assert.equal(r.phase,label);assert.equal(r.retirementStartFrame,R);assert.equal(r.retirementEndFrame,E);assert.equal(r.coverageChecked,false);assert.equal(r.overallQualification,false);
  }
  assert.throws(()=>classifyL1Reentry({...phase(),q:0,N:1,retirementStartFrame:10000}),/input/);
});
test('phase rejects missing/ambiguous/reversed acceptance and wrong OFF/ON/source',async()=>{
  const {classifyL1Reentry}=await load();for(const change of [x=>{x.replies.pop();},x=>{x.replies.push(reply('accepted',3,11728));},x=>{x.replies[1].frame=9999;},x=>{x.commands[0].message.wanted=true;},x=>{x.commands[1].message.sourceEpoch=2;},x=>{x.commands[1].message.normalizer=false;},x=>{x.sampleRate=192000;}]){const x=phase();change(x);assert.throws(()=>classifyL1Reentry(x));}
});
test('phase cannot bridge an intervening command that already canceled the selected OFF',async()=>{
  const {classifyL1Reentry}=await load(),x=phase(15000);x.onSeq=4;x.commands[1].message.seq=4;x.replies[1].seq=4;
  x.commands.splice(1,0,{requestedFrame:10900,message:packet(3,true,undefined,true,.5)});x.replies.splice(1,0,reply('accepted',3,11000));assert.throws(()=>classifyL1Reentry(x));
  const y=phase();y.commands.push({requestedFrame:11728,message:packet(4,false,undefined,true)});y.replies.push(reply('accepted',4,11728));assert.throws(()=>classifyL1Reentry(y));
});
test('independent expected values must not import production EQ/normalizer/kernel',async()=>{
  const fs=require('node:fs'),text=fs.readFileSync('scripts/audio-l1-processing-metrics.mjs','utf8');assert.doesNotMatch(text,/from\s+['"][^'"]*(?:src\/main|transition|normalizer|\/eq)[^'"]*['"]/);
  const {equalizerMeasurementCases}=await import('../scripts/audio-processing-metrics.mjs');assert.equal(equalizerMeasurementCases().length,108);
});
