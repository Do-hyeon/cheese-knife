const test=require('node:test'),assert=require('node:assert/strict');
const subject=()=>import('../scripts/audio-signed-transition.mjs');
function fixture({frequency=750,period=384,delta=.01}={}){
  const action={frame:10000,afterFrame:10128};
  const wave=f=>.35*Math.sin(2*Math.PI*(f%period)/period)+.001*Math.sin(4*Math.PI*(f%period)/period);
  const window=(start,end,phase)=>{const samples=Array.from({length:end-start},(_,i)=>{const f=start+i,w=phase==='before'?0:phase==='after'?1:Math.max(0,Math.min(1,(f-action.frame)/480));return wave(f)*(1+w*delta);});return {rate:48000,start,end,channels:[samples,samples.slice()]};};
  return {frequency,action,before:window(6160,8080,'before'),change:window(9040,11920,'change'),after:window(14800,16720,'after')};
}
test('endpoint-only reference selects longer common period and one signed stereo anchor',async()=>{
  const {deriveSignedReference,evaluateSignedChange}=await subject(),f=fixture(),reference=deriveSignedReference(f);
  assert.equal(reference.status,'passed');assert.equal(reference.period,384);
  const result=evaluateSignedChange({...f,reference,traceBinding:null});assert.equal(result.status,'passed');assert.equal(result.anchor,10000);
  assert.ok(result.maxResidual<1e-6);
});
for(const location of ['train','remaining'])test('all endpoint samples including '+location+' must fit selected template',async()=>{
  const {deriveSignedReference}=await subject(),f=fixture();
  for(const channel of f.before.channels){if(location==='train'){channel[0]+=.001;channel[384]-=.001;}else channel[1700]+=.001;}
  assert.equal(deriveSignedReference(f).status,'inconclusive');
});
test('identical endpoints and insufficient endpoint window are inconclusive',async()=>{
  const {deriveSignedReference}=await subject();assert.equal(deriveSignedReference(fixture({delta:0})).reason,'signed-unidentifiable');
  const f=fixture();f.before.end=f.before.start+100;f.before.channels=f.before.channels.map(c=>c.slice(0,100));assert.equal(deriveSignedReference(f).status,'inconclusive');
});
test('multiple indistinguishable integer anchors are inconclusive, never chosen arbitrarily',async()=>{
  const {deriveSignedReference,evaluateSignedChange}=await subject(),f=fixture({delta:.0004}),reference=deriveSignedReference(f);
  assert.equal(reference.status,'passed');assert.equal(evaluateSignedChange({...f,reference,traceBinding:null}).reason,'signed-anchor-ambiguous');
});
for(const fault of ['right-zero','absolute','no-change','channel-anchor','outside','trace-anchor','trace-inconclusive'])test('signed oracle rejects '+fault,async()=>{
  const {deriveSignedReference,evaluateSignedChange}=await subject(),f=fixture(),reference=deriveSignedReference(f);let traceBinding=null;
  if(fault==='right-zero')f.change.channels[1].fill(0);
  if(fault==='absolute')f.change.channels=f.change.channels.map(c=>c.map(Math.abs));
  if(fault==='no-change')f.change.channels=f.change.channels.map(c=>c.map((_,i)=>{const n=f.change.start+i;return .35*Math.sin(2*Math.PI*(n%384)/384)+.001*Math.sin(4*Math.PI*(n%384)/384);}));
  if(fault==='channel-anchor')f.change.channels[1]=[f.change.channels[1][0],...f.change.channels[1].slice(0,-1)];
  if(fault==='outside')f.action={frame:12000,afterFrame:12128};
  if(fault==='trace-anchor')traceBinding={status:'passed',reason:'test',anchor:10001};
  if(fault==='trace-inconclusive')traceBinding={status:'inconclusive',reason:'signed-trace-subframe'};
  const result=evaluateSignedChange({...f,reference,traceBinding});assert.notEqual(result.status,'passed');
});
test('six master anchors bind to paired trace and reject subframe skew without epsilon',async()=>{
  const {assessSignedTransitions}=await subject(),{summarizeCapture}=await import('../scripts/audio-signal.mjs');
  const report={nodes:{},transitions:[250,750,1000].flatMap(frequency=>[['gain',1.5],['gain',2],['gain',0],['gain',1],['enabled',false],['enabled',true]].map(([kind,value])=>({frequency,kind,value})))},diagnostic={traceEnabled:true,trace:{events:[]}};
  require('./fixtures/audio-signed.cjs').installSignedFixture({report,diagnostic},summarizeCapture);
  for(const row of report.transitions)if(row.kind==='gain')for(const p of ['before','change','after'])row[p]=report.transitions[4][p];
  const run=()=>assessSignedTransitions({diagnostic,transitions:report.transitions});assert.equal(run().status,'passed');
  for(const mutate of [d=>{d.trace.events[0].time+=1e-9;d.trace.events[1].time+=1e-9;d.trace.events[2].time=d.trace.events[1].time+.01;},d=>d.trace.events.push({...d.trace.events[0]}),d=>{d.trace.events[1].value=1;},d=>{d.trace.events[5].time+=1/48000;}]){
    const broken=structuredClone(diagnostic);mutate(broken);assert.notEqual(assessSignedTransitions({diagnostic:broken,transitions:report.transitions}).status,'passed');
  }
  for(const mutate of [rows=>rows.pop(),rows=>rows.reverse(),rows=>{rows[0].kind='unknown';},rows=>{rows[0].value=1.7;}]){const rows=structuredClone(report.transitions);mutate(rows);assert.throws(()=>assessSignedTransitions({diagnostic,transitions:rows}));}
});
