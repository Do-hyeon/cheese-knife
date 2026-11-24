// 공개 계약의 바이트, Git 입력 수집과 저장한 재진입 PCM의 재판정을 오프라인에서 확인한다.
// 저장소 루트에서 node --test tests/f01-public-audio-contract.test.cjs 로 실행한다.
// Git과 로컬 계약 두 파일이 필요하다. 합성 임시 저장소를 만들고 끝나면 지운다. 기대와 다르면 시험이 실패한다.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const clone=x=>JSON.parse(JSON.stringify(x));
const rate=44100,spec={id:'44100/reentry/2/10',sampleRate:rate,frequency:1000,inputDbfs:-36,pattern:'stereo',warmupMilliseconds:6500,startPhaseMs:2,milliseconds:10,afterMilliseconds:180,tailSeconds:.05};
const command=(seq,wanted,normalizer=true)=>({kind:'configure',sourceEpoch:1,seq,wanted,gain:1,eq:Array(8).fill(0),normalizer,dynamics:normalizer,targetDbfs:-20});
const reply=(kind,seq,frame,meterEpoch)=>({kind,sourceEpoch:1,seq,frame,meterEpoch,gain:kind==='completed'?1:null,code:null});

function fixture({programDb=0,frequency=1000,caseSpec=spec,acceptedDelta=512,missingAccepted=null,edgeToOffWallMs=caseSpec.startPhaseMs,offToOnWallMs=caseSpec.milliseconds,offReturnMs=0}={}){
  const rate=caseSpec.sampleRate,fft=rate===96000?32768:16384,delay=rate===96000?576:264,done=rate*.03+delay,targetFrame=rate*.05;
  const A=rate===96000?633728:291072,B=A+acceptedDelta,onRequest=A+Math.min(Math.round(caseSpec.milliseconds*rate/1000),acceptedDelta),end=B+128+rate*.18,initial={available:true,reason:null,sourceEpoch:1,initial:'raw',normalizerWitness:true};
  const inheritedDb=6*Math.max(0,Math.min(1,(A+done+rate*.01-B)/(rate*.01)));
  const commands=[{requestedFrame:0,message:command(1,true,false)},{requestedFrame:targetFrame,message:command(2,true)},{requestedFrame:A,message:command(3,false)},{requestedFrame:onRequest,message:command(4,true)}];
  const replies=[reply('prepared',0,0,0),reply('accepted',1,0,1),reply('completed',1,done,1),reply('accepted',2,targetFrame,2),reply('completed',2,targetFrame+rate*.02,2),reply('accepted',3,A,3),reply('accepted',4,B,4),reply('completed',4,B+done,4)]
    .filter(row=>row.kind!=='accepted'||row.seq!==missingAccepted);
  if(acceptedDelta>done)replies.splice(6,0,reply('completed',3,A+done,3));
  const scheduled=[],powerReads=[],meterTickReads=[];let meterSeq=0;
  const put=(direction,packet,frame)=>scheduled.push({direction,packet,frame,serial:scheduled.length});
  for(const c of commands)put('send',c.message,c.requestedFrame);for(const r of replies)put('receive',r,r.frame);
  if(caseSpec.milliseconds===0&&onRequest===A){
    // 컨트롤러는 OFF의 ACK를 받은 뒤 대기하던 ON을 전달한다.
    const offAck=scheduled.find(e=>e.direction==='receive'&&e.packet.kind==='accepted'&&e.packet.seq===3);
    const onPost=scheduled.find(e=>e.direction==='send'&&e.packet.kind==='configure'&&e.packet.seq===4);
    if(offAck&&onPost)onPost.serial=offAck.serial+.5;
  }
  const power=(time,group,direct)=>{
    const frame=Math.round(time*rate),epoch=group?4:2,seq=++meterSeq,startRead=powerReads.length,fromDb=group?inheritedDb:Math.max(0,Math.min(6,time-.5)),mode=group||time<.5?'warmup':'ramp';
    const toDb=mode==='ramp'?Math.min(6,fromDb+.1):fromDb;
    powerReads.push({index:group*2,time:time-.0002,power:time===.1?0:10**(-36/10),size:fft},{index:group*2+1,time:time-.0001,power:time===.1?0:10**(-36/10),size:fft});
    if(!direct)meterTickReads.push({ordinal:meterTickReads.length+1,startRead,endRead:startRead+2,startTime:time-.0003,endTime:time});
    put('send',{kind:'power',sourceEpoch:1,meterEpoch:epoch,meterSeq:seq,observedTime:time-.0003,leftPower:powerReads.at(-2).power,rightPower:powerReads.at(-1).power,active:true,targetDbfs:-20},frame-13);
    put('receive',{...reply('meter-accepted',seq,frame,epoch),code:mode,application:{sourceEpoch:1,meterEpoch:epoch,meterSeq:seq,commandSeq:group?4:2,frame,mode,fromDb,toDb,start:time,end:mode==='ramp'?time+.1:time}},frame);
  };
  for(let i=1;i<=66;i++)power(i/10,0,i===1);for(let i=0;i<3;i++)power(B/rate+.01+i/10,1,i===0);
  scheduled.sort((a,b)=>a.frame-b.frame||(a.packet.kind==='prepared'?-1:b.packet.kind==='prepared'?1:a.serial-b.serial));
  const events=scheduled.map(({direction,packet},i)=>({order:i+1,direction,packet})),ledger={schema:'f01-control-ledger-v2',available:true,reason:null,events,eventCount:events.length,maxEvents:4128,maxBytes:1048576,bytes:0};ledger.bytes=Buffer.byteLength(JSON.stringify(ledger))+256;
  const warmupMeasurement={frame:targetFrame+rate*.02+rate*6.5,powerReadCursor:130,meterTickCursor:64,sourceEpoch:1,commandSeq:2},measurement={frame:end,powerReadCursor:136,meterTickCursor:66,sourceEpoch:1,commandSeq:4};
  const offWall=6600+edgeToOffWallMs,onWall=offWall+caseSpec.milliseconds;
  const boundary={edge:{audio:(A-128)/rate,wall:6600},off:{audio:A/rate,wall:offWall},offDone:{audio:A/rate,wall:offWall+offReturnMs},on:{audio:onRequest/rate,wall:offWall+offToOnWallMs},onDone:{audio:(B+128)/rate,wall:onWall+5},status:'on',offEventIndex:0,offEventEnd:0,onStepIndex:0,onStepEnd:0};
  const attempt={input:{startPhaseMs:caseSpec.startPhaseMs,milliseconds:caseSpec.milliseconds},sourceEpoch:1,commandCursor:2,replyCursor:5,warmupMeasurement,boundary,measurement:{...measurement,wall:onWall+185},error:null};
  if(rate===96000)attempt.warmupMeter={power:clone(events.find(e=>e.direction==='send'&&e.packet.meterSeq===67).packet),application:clone(events.find(e=>e.packet.kind==='meter-accepted'&&e.packet.seq===67).packet.application),reads:clone(powerReads.slice(132,134))};
  const signal={frequency:1000,inputDbfs:-36,pattern:'stereo',phase:.37,channels:2,durationSeconds:90,frames:rate*90,loop:false,error:''};
  const facts={sampleRate:rate,audioTime:(end+2048)/rate,hidden:false,contextState:'running',sources:1,filters:0,analysers:4,fftSizes:Array(4).fill(fft),buffers:4,active100msTimers:1,gains:[1,0,0,1,1,0,1,0],events:[],linearEvents:[],steps:[],reads:powerReads.length,powerReads,meterTickReads,normalizerMeasurement:measurement,normalizerSettings:{normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false},signal,video:{muted:false,volume:1,loop:false,ended:false,paused:false,playbackRate:1,currentTime:7},readback:{state:'on',sources:1,wanted:true,gain:1,appliedGain:1},oracleEvidence:{schema:'f01-oracle-evidence-v2',initial,ledger},productObservation:{commands,replies,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',moduleLoads:[],meterDiagnostics:{sent:69,received:69},rapidMasterRequest:attempt}};
  const before=clone(facts);Object.assign(before,{audioTime:.04,analysers:0,fftSizes:[],buffers:0,active100msTimers:0,reads:0,powerReads:[],meterTickReads:[],normalizerMeasurement:null});before.productObservation.commands=commands.slice(0,1);before.productObservation.replies=replies.slice(0,3);before.productObservation.meterDiagnostics={sent:0,received:0};delete before.productObservation.rapidMasterRequest;
  const warmed=clone(facts);Object.assign(warmed,{audioTime:warmupMeasurement.frame/rate,analysers:2,fftSizes:[fft,fft],buffers:2,normalizerMeasurement:warmupMeasurement});warmed.productObservation.commands=commands.slice(0,2);warmed.productObservation.replies=replies.slice(0,5);delete warmed.productObservation.rapidMasterRequest;
  const nDb=f=>f<A?Math.min(6,Math.max(0,f/rate-.5)):6*Math.max(0,Math.min(1,(A+done+rate*.01-Math.min(f,B))/(rate*.01))),offQ=f=>1-Math.max(0,Math.min(1,(f-A-.02*rate-delay)/(.01*rate))),qB=offQ(B),q=f=>f<B?offQ(f):qB+(1-qB)*Math.max(0,Math.min(1,(f-B)/(.01*rate)));
  const archive={summary:()=>({sampleRate:rate,start:0,end:end+128,bytes:(end+128)*36,cap:96*1024*1024}),window(start,stop,stream=0){return {rate,start,end:stop,channels:Array.from({length:stream===2?5:2},(_,c)=>Float32Array.from({length:stop-start},(_,i)=>{const f=start+i;if(stream===2)return [-q(f),q(f),1,10**(nDb(f)/20),0][c];return Math.SQRT2*10**(-36/20)*Math.sin(2*Math.PI*frequency*(f-(stream===0?delay:0))/rate+.37)*(stream===0?10**((nDb(f)+programDb)/20):1);} ))};}};
  return {spec:clone(caseSpec),facts,before,warmed,warmupMeasurement,measurement,boundary,request:{status:'on',frame:targetFrame},archive,A,B,end};
}
function proof(f,select){return clone({spec:f.spec,beforeTarget:f.before,request:f.request,target:select(f.warmed,f.before,f.request,f.spec),warmupMeasurement:f.warmupMeasurement,warmupFacts:f.warmed,boundary:f.boundary,measurement:f.measurement});}

async function audioGitFixture() {
  const helpers=await import('../scripts/audio-verification-contract.mjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'audio-contract-git-'));
  const env={...process.env,GIT_AUTHOR_DATE:'2026-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2026-01-01T00:00:00Z'};
  const git=(...args)=>execFileSync('git',['-c','core.hooksPath=disabled-hooks',...args],{cwd:root,env,stdio:'pipe'});
  git('init','--quiet');
  const data=new Map();
  for (const name of helpers.audioInputs) data.set(name,await fs.readFile(path.join(__dirname,'..',name)));
  for (const name of ['package-lock.json','extension/manifest.json','scripts/check-toolchain.mjs','retired.txt']) data.set(name,Buffer.from(name));
  for(const [name,b] of data){const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,b);}
  git('add','--all');git('-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','-c','commit.gpgsign=false','commit','-qm','fixture');
  const seen=new Set();
  const files={root,readFile:async name=>{seen.add(name);return data.has(name)||name==='untracked.txt'?fs.readFile(path.join(root,name)):Buffer.from(name);}};
  return {root,files,git,data,seen,remove:()=>fs.rm(root,{recursive:true,force:true})};
}

module.exports = {fixture, proof, command, reply, audioGitFixture};

if (require.main === module) {
  test('public rules require the canonical bytes and exact semantics', async () => {
    const {readAudioContract,contractPath}=await import('../scripts/audio-verification-contract.mjs');
    const bytes=await fs.readFile(contractPath);
    const original=readAudioContract(bytes), text=bytes.toString().replace(/\r\n/g,'\n');
    assert.deepEqual(readAudioContract(Buffer.from(text.replace(/\n/g,'\r\n'))),original);
    assert.deepEqual(original.rules.delayFrames,[264,288,576]);
    for (const mutate of [r=>delete r.qFallMs,r=>r.delayFrames[0]++,r=>r.delaySeconds='0.006',
      r=>r.schema='legacy',r=>r.schema+='-future',r=>r.hold='B<R',r=>r.extra=0,r=>r.maxDelayFrames=2047]) {
      const copy=structuredClone(original.rules); mutate(copy);
      assert.throws(()=>readAudioContract(Buffer.from(JSON.stringify(copy))),/audio-contract/);
    }
    for (const bytes of [Buffer.from('{'),Buffer.from(''),Buffer.from([0xff])]) assert.throws(()=>readAudioContract(bytes));
  });

  test('clean and working-tree inventory verify required source bytes and preserve tracked deletion and J1 union',async t=>{
    const helpers=await import('../scripts/audio-verification-contract.mjs');
    const {sourceAttestation}=await import('../scripts/check-installed-transition.mjs');
    const {attestL1Source,attestJ1Source}=await import('../scripts/extension-e2e/audio-l1.mjs');
    const {root,files,git,data,seen,remove}=await audioGitFixture();t.after(remove);
    const plain=await sourceAttestation(files,[]);
    const sha=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    const names=git('ls-files','-z').toString().split('\0').filter(Boolean).sort();
    const entries=await Promise.all(names.map(async name=>[name,sha(await files.readFile(name))]));
    const legacy={sourceCommit:git('rev-parse','HEAD').toString().trim(),sourceSha256:sha(JSON.stringify(entries)),
      lockSha256:sha(data.get('package-lock.json')),manifestSha256:sha(data.get('extension/manifest.json')),
      toolchainSha256:sha(data.get('scripts/check-toolchain.mjs'))};
    assert.equal(JSON.stringify(plain),JSON.stringify(legacy));
    const clean=await sourceAttestation(files,helpers.audioInputs);
    const {verifyReentryRun}=await import('../scripts/extension-e2e/audio-reentry.mjs');
    const run={runId:'One',source:clean,after:clean,audioProduct:{runId:'One',scope:'A',source:clean}};
    verifyReentryRun(clean,run,'One','A',files);
    const second=await audioGitFixture();t.after(second.remove);
    const other=await sourceAttestation(second.files,helpers.audioInputs);
    assert.deepEqual(other,clean);
    const otherRun={...run,source:other,after:other,audioProduct:{...run.audioProduct,source:other}};
    verifyReentryRun(other,otherRun,'One','A',second.files);
    assert.throws(()=>verifyReentryRun(other,otherRun,'One','A',files),/unobserved/);
    for (const key of ['source','after']) assert.throws(()=>verifyReentryRun(clean,{...run,[key]:other},'One','A',files),/unobserved/);
    for(const mutate of [r=>r.runId='Other',r=>r.audioProduct.scope='B',r=>r.after.toolchainSha256='f'.repeat(64),
      r=>r.audioProduct.source.lockSha256='e'.repeat(64),r=>delete r.source.audioSourceSchema]){
      const copy={...run,source:{...clean},after:{...clean},audioProduct:{...run.audioProduct,source:{...clean}}};mutate(copy);
      assert.throws(()=>verifyReentryRun(clean,copy,'One','A',files));
    }
    helpers.assertLiveAudioSource(clean,files);assert.throws(()=>helpers.assertLiveAudioSource(structuredClone(clean),files));
    const fields=['sourceCommit','lockSha256','manifestSha256','toolchainSha256'];
    const replacements=Object.fromEntries(fields.map(key=>[key,'0'.repeat(key==='sourceCommit'?40:64)]));
    for(const key of fields) assert.throws(()=>helpers.assertLiveAudioSource({...clean,[key]:replacements[key]},files));
    assert.throws(()=>helpers.assertLiveAudioSource({...clean,...replacements},files));
    assert.throws(()=>helpers.assertLiveAudioSource({...clean,sourceSha256:'0'.repeat(64)},files));
    assert.throws(()=>helpers.assertLiveAudioSource({...legacy,audioSourceSchema:clean.audioSourceSchema,
      audioContract:helpers.readAudioContract().authority},files));
    const jf=await attestJ1Source(files,['tests/f01-j1-native-contract.test.cjs']);
    assert.equal(jf.audioContract.sha256,clean.audioContract.sha256);
    assert.ok(seen.has('tests/f01-j1-observation.test.cjs')&&seen.has('tests/f01-l1-clock.test.cjs'));
    assert.ok(!seen.has('docs/AUDIO.md')&&!seen.has('docs/VALIDATION.md'));
    const before=await attestL1Source(files);
    helpers.assertLiveAudioSource(before,files);
    await fs.writeFile(path.join(root,'untracked.txt'),'new'); const untracked=await attestL1Source(files);
    assert.notEqual(before.sourceSha256,untracked.sourceSha256);
    await fs.unlink(path.join(root,'retired.txt'));const after=await attestL1Source(files);
    assert.notEqual(untracked.sourceSha256,after.sourceSha256);
    await assert.rejects(attestL1Source(files,['retired.txt']));
    let reads=0;
    const switched={...files,readFile:async name=>name===helpers.contractPath&&++reads===2?Buffer.from('{}'):files.readFile(name)};
    await attestL1Source(switched);assert.equal(reads,1);
    await assert.rejects(attestL1Source(switched),/audio-contract/);
    await fs.writeFile(path.join(root,helpers.loaderPath),'untrusted loader');
    await assert.rejects(attestL1Source(files),/audio-contract-loader/);
    await fs.unlink(path.join(root,helpers.contractPath));await assert.rejects(attestL1Source(files));
    await assert.rejects(sourceAttestation(files,helpers.audioInputs),/dirty/);
  });

  test('retained reentry recomputes actual PCM and rejects legacy, transplanted source, run, case and phase',async()=>{
    const {readAudioContract}=await import('../scripts/audio-verification-contract.mjs');
    const {assessPackagedReentry,verifySavedReentry}=await import('../scripts/extension-e2e/audio-reentry.mjs');
    const {selectNormalizerTarget}=await import('../scripts/audio-l1-normalizer-oracle.mjs');
    const source={audioSourceSchema:'f01-audio-source-v2',audioContract:readAudioContract().authority,sourceCommit:'1'.repeat(40),
      sourceSha256:'2'.repeat(64),lockSha256:'3'.repeat(64),manifestSha256:'4'.repeat(64),toolchainSha256:'5'.repeat(64)};
    const f=fixture(), p={...proof(f,selectNormalizerTarget),runId:'Synthetic',source};
    const assessment=assessPackagedReentry(f.archive,f.facts,p,f.spec);
    const report=JSON.parse(JSON.stringify({schema:'f01-product-reentry-observation-v3',runId:p.runId,source,scope:f.spec.id,spec:f.spec,
      target:p.target,measurement:p.measurement,facts:f.facts,reentry:assessment}));
    const check=(a,r,p)=>verifySavedReentry(a,r,p,f.spec,'Synthetic',source);
    check(f.archive, report, p);
    for (const mutate of [r=>r.schema='f01-product-reentry-observation-v2',r=>r.runId='Other',r=>r.scope='44100/reentry/0/0',
      r=>r.source.sourceSha256='9'.repeat(64),r=>delete r.source.audioContract,r=>r.reentry.phase.phase='UNITY',
      r=>r.reentry.phase.authority.sha256='8'.repeat(64),r=>r.reentry.phase.schema='f01-l1-reentry-phase-v1']) {
      const changed=structuredClone(report);mutate(changed);assert.throws(()=>check(f.archive,changed,p));
    }
    assert.throws(()=>check(f.archive,report,{...p,runId:'Other'}));
    assert.throws(()=>check(f.archive,report,{...p,spec:{...f.spec,milliseconds:15}}));
    assert.throws(()=>check(fixture({programDb:.051}).archive,report,p));
  });
}
