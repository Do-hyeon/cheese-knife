// 제품 루트에서 node --test tests/audio-worklet-roles.test.cjs 로 원장 판정의 반례를 확인한다.
// 브라우저나 디스크 산출물이 필요하지 않다. 수용해야 할 원장을 거절하거나 변조를 통과시키면 실패한다.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {roleFixture}=require('./fixtures/audio-worklet-roles.cjs');
async function fixture(){
  const {AUDIO_ARTIFACT_FILES}=await import('../scripts/audio-artifact-core.mjs');
  const sha='a'.repeat(64),files=AUDIO_ARTIFACT_FILES.map(path=>({path,sha256:sha})),source='blob:measurement';
  const roles=roleFixture('fixture-t1',source,files,sha);
  return {label:roles.label,roleProfile:true,traceEnabled:true,workletSha256:sha,artifact:{files},injectedMain:files,roles,
    workletSigned:{mode:'T',gainTraceInstalled:true,registration:{...roles.registration},events:[{type:'create',source}]}};
}
test('역할은 모든 native 연결과 파라미터 소유자가 같을 때만 일치한다',async()=>{
  const {validateRoleEvidence}=await import('../scripts/audio-worklet-roles.mjs'),d=await fixture();
  assert.deepEqual(validateRoleEvidence(d),{main:'blob:measurement',calibration:'blob:calibration-fixture-t1'});
  for(const mutate of [
    g=>g.edges.splice(g.edges.findIndex(e=>e.to===2),1),g=>{g.edges.find(e=>e.to===2).to=18;},
    g=>g.edges.push({...g.edges[0]}),g=>g.edges.push({from:23,to:15,input:0,output:0}),
    g=>{g.disconnects=1;},g=>{g.silentGain=.01;},g=>{g.destination=g.sink;},
    g=>{g.edges.find(e=>e.from===7).to=18;},g=>{g.edges.find(e=>e.from===19).output=1;},
    g=>{g.edges.find(e=>e.from===23&&e.to===6).from=20;},g=>{g.gains[0].param=g.gains[1].param;},
    g=>{delete g.edges;},g=>{g.edges.find(e=>e.from===20&&e.output===1).to=21;},
  ]){const changed=structuredClone(d);mutate(changed.roles.graph);assert.throws(()=>validateRoleEvidence(changed),/worklet-role-/);}
});
test('최초 활성 측정은 같은 포트와 명령의 마지막 표본으로 검증한다',async()=>{
  const {validateRoleEvidence}=await import('../scripts/audio-worklet-roles.mjs'),d=await fixture();
  for(const mutate of [
    (r,e,m)=>{m.packet.code=m.packet.application.mode='error';},(r,e,m)=>{m.packet.code=m.packet.application.mode='invented';},
    (r,e,m)=>{delete m.packet.application.start;},(r,e,m)=>{m.packet.application.fromDb=null;},(r,e,m)=>{m.packet.application.end+=.1;},
    (r,e,m)=>{e.at(-2).packet.observedTime=(m.packet.frame+1)/48000;},(r,e)=>{e.at(-2).packet.observedTime=0;},
    (r,e,m)=>{const p=m.packet;p.frame+=12288;p.application.frame=p.renderHeadroom.startFrame=p.frame;
      p.application.start=p.application.end=p.frame/48000;p.renderHeadroom.endFrame=p.frame+128;r.terminalFrame=p.frame+256;},
    (r,e,m)=>{m.packet.renderHeadroom=null;const later=structuredClone(e.at(-2)),receipt=structuredClone(d.roles.port.events.at(-1));
      later.packet.meterSeq=receipt.packet.seq=receipt.packet.application.meterSeq=3;e.push(later,receipt);},
    r=>{r.cleanupError='close';},r=>{r.failure='calibration';},(r,e,m)=>{m.packet.renderHeadroom.headroom=1;},(r,e,m)=>{m.packet.renderHeadroom.headroom=null;},
    (r,e,m)=>{m.packet.renderHeadroom.endFrame--;},(r,e,m)=>{m.packet.renderHeadroom.eq[4]=0;},
    (r,e,m)=>{m.packet.application.commandSeq--;},(r,e,m)=>{m.packet.meterEpoch++;},(r,e,m)=>{m.packet.seq++;},
    (r,e,m)=>{m.port++;},(r,e,m)=>{m.packet.sourceEpoch++;},(r,e)=>{e.at(-3).packet.frame+=128;},
    (r,e)=>{e.push(structuredClone(e[1]));},(r,e)=>{e.push(structuredClone(e.at(-1)));},r=>{r.terminalFrame=3712;},
  ]){const changed=structuredClone(d),r=changed.roles,e=r.port.events;mutate(r,e,e.at(-1));assert.throws(()=>validateRoleEvidence(changed),/worklet-role-/);}
});
test('실제 MAIN 원바이트를 한 번씩 읽고 유효 UTF-8과 Worklet을 결속한다',async()=>{
  const {readRoleInputs}=await import('../scripts/audio-worklet-roles.mjs'),calls=[];
  const input=await readRoleInputs({async readFile(path){calls.push(path);return Buffer.from(path);}});
  assert.equal(calls.length,7);assert.equal(new Set(calls).size,7);
  assert.deepEqual(input.scripts,calls.slice(0,-1));assert.deepEqual(input.manifest.map(v=>v.path),input.scripts);
  await assert.rejects(readRoleInputs({async readFile(){return Uint8Array.of(255);}}),/encoded data/i);
});

test('전용 측정 보고서는 UTF-8 8 MiB까지만 쓸 수 있다',async()=>{
  const {serializeRoleReport}=await import('../scripts/audio-worklet-roles.mjs');
  const limit=8*1024*1024,text='가'.repeat((limit-2)/3);
  assert.equal(Buffer.byteLength(serializeRoleReport(text)),limit);
  assert.throws(()=>serializeRoleReport(text+'a'),/audio-quality-report-size/);
});
