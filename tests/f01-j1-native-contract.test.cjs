// 저장소 루트에서 node --test tests/f01-j1-native-contract.test.cjs 로 실행한다. Node.js와 Git이 필요하다.
// J1 시나리오·봉인·소스·보존 계약을 검사한다. 임시 Git 저장소는 종료 시 제거하고, 검증 실패는 테스트 실패로 표시한다.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const load=()=>import('../scripts/extension-e2e/audio-l1.mjs'),root=process.cwd(),id='F01J1Native20261018',child=id+'R48';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('sealed Native qualifications reject direct and programmatic calls while reusable scenarios remain available',async()=>{
  const m=await load(),runner=await import('../scripts/check-audio-processing.mjs');
  assert.equal(typeof m.runL1Scenario,'function');assert.equal(typeof m.runJ1Scenario,'function');
  for(const run of [m.runL1Qualification,m.runJ1Qualification]){
    const guarded=Function('fail','runMinimumQualification','return ('+run.toString()+')')(
      code=>Object.assign(Error(code),{code}),()=>{throw Error('historical-execution-must-not-dispatch');});
    await assert.rejects(()=>guarded(),/audio-qualification-sealed/);
  }
  for(const qualification of ['l1','j1'])await assert.rejects(()=>runner.runAudioProcessing({runId:'sealed-test',qualification}),/audio-qualification-sealed/);
});
function candidateEntries(names,folder){
  const children=new Map();for(const name of names)if(name.startsWith(folder+'/')){
    const tail=name.slice(folder.length+1),child=tail.split('/')[0];children.set(child,tail.includes('/'));
  }
  return [...children].map(([name,directory])=>({name,isDirectory:()=>directory,isFile:()=>!directory}));
}
// 임시 저장소 한 곳의 실제 HEAD와 index를 사용한다. 기대 목록은 합성 입력으로 따로 만든다.
async function protectionFixture(t){
  const {execFileSync}=require('node:child_process'),{tmpdir}=require('node:os');
  const root=await fs.mkdtemp(path.join(tmpdir(),'audio-preservation-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',['-c','core.hooksPath=disabled-hooks','-c','core.autocrlf=false',
    '-c','commit.gpgsign=false','-c','user.name=Fixture','-c','user.email=fixture@example.invalid',...args],{cwd:root,encoding:'utf8',stdio:'pipe'});
  const files={root,readFile:(name,encoding)=>fs.readFile(path.join(root,name),encoding),
    readdir:(name,options)=>fs.readdir(path.join(root,name),options)};
  async function write(file,bytes){
    await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),bytes);
  }
  const tracked='tracked.txt',trackedBytes=Buffer.from('fixture\n');
  git('init','--quiet','--object-format=sha1');await write(tracked,trackedBytes);git('add','--',tracked);git('commit','-qm','fixture');
  const head=git('rev-parse','HEAD').trim();
  const blob=createHash('sha1').update('blob '+trackedBytes.length+'\0').update(trackedBytes).digest('hex');
  const semanticIndex=sha(JSON.stringify([tracked+' 100644 '+blob]));
  const index=sha(await files.readFile('.git/index')),oldIndex=Buffer.from('older synthetic index');
  const historicalIndex={expected:sha(oldIndex),actual:index,byteMatch:false};
  const protectedPins=[{file:'.git/index',bytes:oldIndex.length,sha256:sha(oldIndex)}];
  const dirty=[],priorRun=[],dist=[],rows=[],inputs=new Map();
  function pin(file){
    const bytes=Buffer.from('fixture '+file);
    inputs.set(file,bytes);
    return {file,bytes:bytes.length,sha256:sha(bytes)};
  }
  for(let i=0;i<24;i++)protectedPins.push(pin('protected/file-'+i));
  for(const file of ['scripts/extension-e2e/visibility-browser.mjs','tests/visibility-browser.test.cjs','tests/visibility-browser-protocol.test.cjs'])dirty.push(pin(file));
  for(const file of ['parent/before.json','parent/summary.json','child/capture.json','child/partial.json','child/summary.json',
    'child/playback.json','child/cold.json','child/trace.zip','child/failure.png'])priorRun.push(pin('history/'+file));
  for(let i=0;i<58;i++){
    const {file,sha256}=pin('dist/assets/asset-'+String(i).padStart(2,'0'));dist.push([file,sha256]);
  }
  const folders=Array.from({length:5},(_,i)=>'folders/group-'+i);
  for(const folder of folders){
    const {file,bytes,sha256}=pin(folder+'/nested/fixture.bin');rows.push([file,bytes,sha256]);
  }
  for(const [file,bytes] of inputs)await write(file,bytes);
  const pairs=pins=>pins.map(pin=>[pin.file,pin.sha256]);
  const protection={pins:25,historicalIndex,semanticIndex,dirty:pairs(dirty),dist,priorRun:pairs(priorRun),index};
  const manifest={schema:'f01-j1-protected-inputs-v1',rows,protection},baseline={index};
  // 손상된 내부 행과 외부 해시 불일치를 각각 검증할 수 있게 시험 입력을 따로 봉인한다.
  async function preparation(m=manifest,b=baseline){
    const json=Buffer.from(JSON.stringify(m)),manifestHash=sha(json);
    const base=Buffer.from(JSON.stringify({protectedSha256:manifestHash,...b}));
    const pins={manifest:{file:'reference/manifest.json',sha256:manifestHash},baseline:{file:'reference/baseline.json',sha256:sha(base)}};
    await write(pins.manifest.file,json);await write(pins.baseline.file,base);
    return pins;
  }
  const l1={head,semanticIndex,protectedPins,dirty,priorRun};
  return {files,git,write,inputs,l1,reference:{l1,folders,preparation:await preparation()},manifest,protection,preparation,tracked};
}
async function dispatchModule(){
  const m=await import('../scripts/check-audio-processing.mjs');
  // Substitute only the slow Native import; execute the real parser and function's branch logic.
  const body=m.runAudioProcessing.toString().replace("import('./extension-e2e/audio-l1.mjs')",'loadMinimum()').replace(/import\.meta\.url/g,JSON.stringify(pathToFileURL(path.resolve('scripts/check-audio-processing.mjs')).href));
  return {runAudioProcessing:Function('parseAudioProcessingArgs','loadMinimum','return '+body)(m.parseAudioProcessingArgs,async()=>({runJ1Qualification:()=> 'J1-boundary',runL1Qualification:()=> 'L1-boundary'}))};
}
const levels=[0,0,0,-6,-6,-6,-6,-6],ramp=(f,a,n,x,y)=>x+(y-x)*Math.max(0,Math.min(1,(f-a)/n));
// Independent control reference uses cotangent, not the assessor's half-angle sine expression.
function offGain(x){
  if(x<=0)return 1.32;if(x>=960)return 1;
  const z=Math.min(x,960-x)/128,p=x<128?128/832*(2.5*z**4-3*z**5+z**6):x>832?1-128/832*(2.5*z**4-3*z**5+z**6):(x-64)/832;
  const d=x<128||x>832?(10*z**3-15*z**4+6*z**5)/832:1/832,A=10**(-6*(1-p)/40);
  let nu=0;for(const f of [500,1000,2000,4000,8000])nu+=.5/Math.tan(Math.PI*f/48000)*Math.LN10/40*(A+1/A)*6*d;
  return 1.32**(1-p)/(1+nu);
}
function observation(events=[128,73472,92160],end=116160,linear=false){
  const streams=[];for(const channels of [2,2,5]){
    const bytes=Buffer.alloc(end*channels*4);for(let n=0;n<end;n++){
      const q=n<events[1]?ramp(n,events[0],480,0,1):n<events[2]?ramp(n,events[1]+1248,480,1,0):ramp(n,events[2],480,0,1),f=n-288;
      const G=f<events[1]?ramp(f,events[0]+480,960,1,1.32):f<events[2]?(linear?ramp(f,events[1],960,1.32,1):offGain(f-events[1])):ramp(f,events[2]+480,960,1,1.32);
      const control=[-q,q,G,1,0],value=.1*Math.sin(2*Math.PI*250*(streams.length===0?n-288:n)/48000+.37);
      for(let c=0;c<channels;c++)bytes.writeFloatLE(channels===5?control[c]:value,(n*channels+c)*4);
    }streams.push({start:0,end,channels,encoding:'interleaved-float32le',base64:bytes.toString('base64')});
  }
  return {sampleRate:48000,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',sourceFrame:0,captureStartFrame:0,streams,
    commands:events.map((f,i)=>({requestedFrame:Math.max(0,f-64),mediaTime:f/48000,message:{kind:'configure',sourceEpoch:1,seq:i+1,wanted:i!==1,gain:1.32,eq:levels,normalizer:false}})),
    replies:events.flatMap((f,i)=>[{kind:'accepted',sourceEpoch:1,seq:i+1,frame:f,meterEpoch:0,gain:null,code:null},{kind:'completed',sourceEpoch:1,seq:i+1,frame:f+1728,meterEpoch:0,gain:i===1?1:1.32,code:null}]),
    readback:{sources:1,state:'on',wanted:true,appliedGain:1.32},moduleLoads:['chrome-extension://'+'a'.repeat(32)+'/web/audio-transition-worklet.js']};
}

test('J1 CLI rejects the sealed qualified pair and reserves both IDs from broader entry',async()=>{
  const {parseAudioProcessingArgs}=await import('../scripts/check-audio-processing.mjs');
  assert.throws(()=>parseAudioProcessingArgs([`--run-id=${id}`,'--qualification=j1']),/audio-qualification-sealed/);
  for(const args of [[`--run-id=${id}`],[`--run-id=${child}`],[`--run-id=${child}`,'--qualification=j1'],['--run-id=Other','--qualification=j1'],[`--run-id=${id}`,'--qualification=l1'],[`--run-id=${id}`,'--qualification=j1','--rate=48000']])assert.throws(()=>parseAudioProcessingArgs(args));
  assert.deepEqual(parseAudioProcessingArgs(['--run-id=Other']),{runId:'Other'});
});
test('actual processing dispatcher rejects sealed J1 and L1 before the Native import boundary',async()=>{
  const m=await dispatchModule();await assert.rejects(()=>m.runAudioProcessing({runId:id,qualification:'j1'}),/audio-qualification-sealed/);
  await assert.rejects(()=>m.runAudioProcessing({runId:'F01L1Clock20261018',qualification:'l1'}),/audio-qualification-sealed/);
  await assert.rejects(()=>m.runAudioProcessing({runId:id,qualification:'l1'}),/audio-qualification-sealed/);
});
test('J1 Native assessor keeps independent local numbers but never claims a local schema or accepts linear metadata',async()=>{
  const m=await load();assert.equal(typeof m.assessJ1NativeCapture,'function');const raw=observation(),local=m.assessJ1Capture(raw),native=m.assessJ1NativeCapture(raw);
  assert.equal(native.passed,true);assert.equal(native.schema,'f01-j1-native-v1');assert.equal(native.scope,'48k-original250-D0-only');
  const {schema:a,scope:b,...l}=local,{schema:c,scope:d,...n}=native;assert.deepEqual(n,l);
  assert.equal(m.assessJ1NativeCapture({...observation(undefined,undefined,true),schema:native.schema,trajectory:'j1-unity-v1'}).passed,false);
  assert.equal(m.assessL1Capture(observation(undefined,undefined,true)).passed,true);
});
for(const fault of ['delay','tail','clip','ack','readback'])test('J1 Native entry still rejects '+fault,async()=>{
  const m=await load();assert.equal(typeof m.assessJ1NativeCapture,'function');const raw=observation();
  if(fault==='delay')raw.streams[0].base64=raw.streams[1].base64;
  if(fault==='ack'){raw.replies[3].frame++;assert.throws(()=>m.assessJ1NativeCapture(raw));return;}
  if(fault==='readback')raw.readback.appliedGain=null;
  if(fault==='tail'||fault==='clip'){const b=Buffer.from(raw.streams[0].base64,'base64');if(fault==='clip')b.writeFloatLE(1.01,110000*8+4);else for(let n=110000;n<110768;n++)b.writeFloatLE(0,n*8);raw.streams[0].base64=b.toString('base64');}
  assert.equal(m.assessJ1NativeCapture(raw).passed,false);
});
test('J1 candidate handoff verifies exact physical path and is consumed even when its first verification fails',async()=>{
  const m=await load();assert.equal(typeof m.j1CandidateProvider,'function');assert.equal(typeof m.j1CandidateDigest,'function');
  const fixed=path.join(root,`output/tool-audit/p02-candidate-${id}/chrome-candidate`),candidate={root:fixed,dist:path.join(fixed,'dist'),files:['dist/web/audio-transition-worklet.js']};
  let bytes=Buffer.from('first'),calls=0;const relative=`output/tool-audit/p02-candidate-${id}/chrome-candidate/`;
  const files={root,resolve:async()=>fixed,readFile:async()=>bytes,readdir:async n=>candidateEntries(candidate.files,n.slice(relative.length))};
  const before=await m.j1CandidateDigest(files,candidate);bytes=Buffer.from('changed');
  const provide=m.j1CandidateProvider(candidate,root,async()=>{calls++;assert.equal(await m.j1CandidateDigest(files,candidate),before);});
  await assert.rejects(()=>provide(child,root,{retainEvidence:true}));await assert.rejects(()=>provide(child,root,{retainEvidence:true}));assert.equal(calls,1);
  await assert.rejects(()=>m.j1CandidateDigest(files,{...candidate,root:root+'/other'}));
  for(const [name,directory,retention]of [['Other',root,true],[child,root+'/other',true],[child,root,false]])await assert.rejects(()=>m.j1CandidateProvider(candidate,root,async()=>{})(name,directory,{retainEvidence:retention}));
});

test('J1 candidate rejects physical extra or missing files without trusting the stale build list',async()=>{
  const m=await load(),relative=`output/tool-audit/p02-candidate-${id}/chrome-candidate/`,fixed=path.join(root,relative);
  const candidate={root:fixed,dist:path.join(fixed,'dist'),files:['dist/web/audio-transition-worklet.js']};
  let physical=[...candidate.files];const files={root,resolve:async()=>fixed,readFile:async()=>Buffer.from('same'),readdir:async n=>candidateEntries(physical,n.slice(relative.length))};
  await m.j1CandidateDigest(files,candidate);
  physical.push('dist/extra.js');await assert.rejects(()=>m.j1CandidateDigest(files,candidate),/candidate-files/);
  physical=[];await assert.rejects(()=>m.j1CandidateDigest(files,candidate),/candidate-files/);
  assert.deepEqual(candidate.files,['dist/web/audio-transition-worklet.js']);
});

function scenarioFixture(fault){
  let frame=0,wall=0,sources=0,wanted=false,playing=false;const clicks=[],saved=new Map(),bytes=Buffer.from('test module resource'),handlers={};
  const video={readyState:4,currentTime:0,muted:true,volume:0,async play(){playing=true;}},readback=()=>({sources,state:wanted?'on':'off',wanted,appliedGain:wanted?1.32:1});
  const facts=()=>({sampleRate:48000,audioTime:frame/48000,contextState:'running',hidden:false,sources,video:{currentTime:playing?frame/48000:0}});
  const button={async click(){wanted=!wanted;sources=1;clicks.push(frame);}};
  const win={AudioContext:class{}};
  Object.defineProperty(win,Symbol.for('cheese-knife.runtime.v1'),{value:{ownerProtocol:3,configReady:true,mediaCurrent:()=>true,audio:{getReadback:readback}}});
  const probe={async action(action){
    if(action.kind==='facts')return facts();if(action.kind==='signal')return {};
    if(action.kind==='l1-partial')return {schema:'test-prefix',frame};
    if(action.kind==='l1-capture'){
      const raw=observation([128,clicks[1],clicks[2]],frame);
      raw.commands.forEach((c,i)=>c.requestedFrame=clicks[i]);
      if(fault==='quality'){const b=Buffer.from(raw.streams[0].base64,'base64');b.writeFloatLE(1.01,raw.streams[0].end*8-4);raw.streams[0].base64=b.toString('base64');}
      if(fault==='ack')raw.replies.pop();if(fault==='module')raw.moduleLoads=[];
      if(fault==='pageerror')handlers.pageerror?.(Error('page-error-sentinel'));
      return raw;
    }throw Error('unexpected probe '+action.kind);
  }};
  Object.defineProperty(win,Symbol.for('cheese-knife.f01-processing-probe'),{value:probe});
  const globals={window:win,chrome:{storage:{local:{set:async value=>{assert.equal(value.config.audioGain,1.32);assert.equal(value.config.compressorEnabled,false);}}}},document:{querySelector:s=>s==='video'?video:button},Symbol,performance:{now:()=>wall},setTimeout:fn=>{wall+=4;if(fault!=='clock')frame+=192;queueMicrotask(fn);},fetch:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})};
  const evaluate=(fn,arg)=>vm.runInNewContext(`(${fn.toString()})(arg)`,{...globals,arg});
  const page={on(n,cb){handlers[n]=cb;},setDefaultTimeout(){},goto:async()=>{},bringToFront:async()=>{},locator:()=>button,
    evaluate:async(fn,arg)=>fn.name==='installProcessingProbe'?undefined:evaluate(fn,arg),
    waitForFunction:async fn=>{assert.ok(await evaluate(fn));},waitForTimeout:async ms=>{wall+=ms;frame+=ms*48;}};
  const artifactPath=path.join(root,'output/virtual-j1-scenario'),files={root,
    readFile:async name=>name.endsWith('.html')?'<html></html>':bytes,
    writeFile:async(name,data,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(name),'exclusive '+name);if(fault==='save-module'&&name.endsWith('module.json'))throw Error('write-module-sentinel');saved.set(name,Buffer.from(data));}};
  const context={on(){},route:async()=>{},addInitScript:async fn=>evaluate(fn),newPage:async()=>page};
  const worker={evaluate:async(fn,arg)=>evaluate(fn,arg)};
  return {input:{context,worker,extensionId:'a'.repeat(32),artifactPath},files,saved,clicks};
}
test('J1 installed scenario calls the explicit Native oracle after actual timed clicks and saves fetched module bytes',async()=>{
  const m=await load();assert.equal(typeof m.runJ1Scenario,'function');const f=scenarioFixture(),r=await m.runJ1Scenario(f.input,f.files);
  assert.equal(r.audioJ1.schema,'f01-j1-native-v1');assert.equal(r.audioJ1.passed,true);assert.deepEqual(f.clicks,[0,73536,92160]);
  const name=path.relative(root,f.input.artifactPath).split(path.sep).join('/');
  assert.deepEqual(f.saved.get(name+'/module-resource.fetched.js'),Buffer.from('test module resource'));
  assert.equal(JSON.parse(f.saved.get(name+'/module.json')).actualPackageMatch,true);
  assert.equal(JSON.parse(f.saved.get(name+'/assessment.json')).schema,'f01-j1-native-v1');
});
for(const fault of ['clock','ack','quality','module','pageerror','save-module'])test('J1 scenario preserves real failure prefix for '+fault,async()=>{
  const m=await load();assert.equal(typeof m.runJ1Scenario,'function');const f=scenarioFixture(fault);
  await assert.rejects(()=>m.runJ1Scenario(f.input,f.files));const partial=[...f.saved].find(([n])=>n.endsWith('/partial.json'));
  assert.ok(partial);assert.ok(JSON.parse(partial[1]).error);assert.equal(f.clicks.length,fault==='clock'?1:3);
});
test('J1 source attestation separates the current input union from explicit historical preparation',async()=>{
  const {attestJ1Source}=await load(),seen=new Set();
  const files={root,readFile:async(name,encoding)=>{seen.add(name);return fs.readFile(path.join(root,name),encoding);}};
  const current=await attestJ1Source(files);
  assert.deepEqual(await attestJ1Source(files,['tests/f01-j1-native-contract.test.cjs','extension/web/audio-transition-worklet.js']),current);
  for(const name of ['scripts/audio-verification-contract.json','scripts/audio-verification-contract.mjs','tests/f01-j1-native-contract.test.cjs','tests/f01-j1-transition.test.cjs','tests/fixtures/f01-j1-runtime-executable.json','src/main/features/audio/transition.ts','scripts/check-installed-extension.mjs','package-lock.json'])assert.ok(seen.has(name),name);
  assert.ok([...seen].every(name=>!name.startsWith('docs/superpowers/')&&!name.startsWith('.superpowers/')));
  assert.equal(current.nodeSha256,sha(await fs.readFile(process.execPath)));
  assert.ok(!Object.hasOwn(current,'protectedManifestSha256')&&!Object.hasOwn(current,'preparationSourceSha256'));
  const samples=new Map([['archive/manifest',Buffer.from('synthetic manifest')],['archive/baseline',Buffer.from('synthetic baseline')]]);
  const prep=Object.fromEntries([...samples].map(([file,bytes])=>[path.posix.basename(file),{file,sha256:sha(bytes)}]));
  const archive={...files,readFile:(file,encoding)=>samples.has(file)?Promise.resolve(samples.get(file)):files.readFile(file,encoding)};
  assert.deepEqual(await attestJ1Source(archive,[],prep),{...current,
    protectedManifestSha256:prep.manifest.sha256,preparationSourceSha256:prep.baseline.sha256});
  await assert.rejects(attestJ1Source(archive,[],{manifest:prep.manifest}),/audio-l1-record/);
  await assert.rejects(attestJ1Source(archive,[],{...prep,manifest:{...prep.manifest,sha256:'0'.repeat(64)}}),/audio-j1-protected-manifest/);
  await assert.rejects(attestJ1Source(archive,[],{...prep,baseline:{...prep.baseline,file:'archive/missing'}}),/ENOENT/);
});

test('source attestation binds tracked deletions and still requires every mandatory input',async t=>{
  const {audioGitFixture}=require('./f01-public-audio-contract.test.cjs');
  const {root,files,seen,remove}=await audioGitFixture();t.after(remove);
  const {attestL1Source}=await load(),original=await attestL1Source(files);
  await fs.unlink(path.join(root,'retired.txt'));seen.clear();
  const removed=await attestL1Source(files);
  assert.equal(seen.has('retired.txt'),false);
  assert.notEqual(original.sourceSha256,removed.sourceSha256);
  await assert.rejects(attestL1Source(files,['retired.txt']),/ENOENT/);
});
test('preservation requires complete distinct relative references before reading evidence',async()=>{
  const {l1Preservation,j1Preservation}=await load();
  let reads=0;const unread={readFile(){reads++;},readdir(){reads++;}};
  await assert.rejects(l1Preservation(unread));await assert.rejects(j1Preservation(unread));
  for(const file of ['../outside','/absolute','C:/drive','C:drive','\\\\server\\share','prefix/../file']){
    await assert.rejects(j1Preservation(unread,{preparation:{manifest:{file,sha256:'0'.repeat(64)},baseline:{file:'base',sha256:'1'.repeat(64)}}}),/audio-protection-path/);
  }
  assert.equal(reads,0);
});

test('J1 preservation snapshots L1 pins before asynchronous reads',async t=>{
  const {j1Preservation}=await load(),{files,reference}=await protectionFixture(t);
  // 파일 읽기를 기다리는 동안 호출자가 기대값을 고쳐도 최초 pin으로 판정해야 한다.
  const mutable=structuredClone(reference),pin=mutable.l1.protectedPins[1],original=pin.sha256;
  pin.sha256='0'.repeat(64);
  const inFlight=j1Preservation(files,mutable);
  pin.sha256=original;
  await assert.rejects(inFlight,/audio-l1-pin-changed/);
});

test('preservation rejects sparse references before file access',async t=>{
  const {l1Preservation,j1Preservation}=await load(),{reference}=await protectionFixture(t);
  const forbiddenRead=()=>{throw Error('unexpected-protection-read');};
  const forbidden={readFile:forbiddenRead,readdir:forbiddenRead};
  for(const key of ['protectedPins','dirty','priorRun','folders']){
    const sparse=structuredClone(reference),rows=key==='folders'?sparse.folders:sparse.l1[key];
    delete rows[rows.length-1];
    if(key!=='folders')await assert.rejects(l1Preservation(forbidden,sparse.l1),/audio-protection-missing-row/);
    await assert.rejects(j1Preservation(forbidden,sparse),/audio-protection-missing-row/);
  }
});

test('actual L1 and J1 preservation bind independent Git state and the original protected bytes',async t=>{
  const {l1Preservation,j1Preservation}=await load(),f=await protectionFixture(t);
  const {files,l1,reference,manifest,protection}=f;
  assert.deepEqual(await l1Preservation(files,l1),protection);
  assert.deepEqual(await j1Preservation(files,reference),{...protection,
    protectedManifestSha256:reference.preparation.manifest.sha256,protectedFileCount:manifest.rows.length});
  let reads=0;const unread={readFile(){reads++;},readdir(){reads++;}};
  for(const change of [
    r=>r.protectedPins.pop(),r=>r.protectedPins[0].file='other/index',r=>r.protectedPins[0].file=r.protectedPins[1].file,
    r=>r.dirty.pop(),r=>r.dirty[0].file='other/launcher',r=>r.priorRun.pop(),r=>r.priorRun[0].sha256='invalid',
  ]){
    const broken=structuredClone(l1);change(broken);
    await assert.rejects(l1Preservation(unread,broken));await assert.rejects(j1Preservation(unread,{...reference,l1:broken}));
  }
  for(const folders of [reference.folders.slice(1),[...reference.folders.slice(1),reference.folders[1]],
    [...reference.folders.slice(1),reference.folders[1]+'/nested']])await assert.rejects(j1Preservation(unread,{...reference,folders}));
  assert.equal(reads,0);
  for(const [file,code] of [[l1.protectedPins[1].file,/audio-l1-pin-changed/],[l1.dirty[0].file,/audio-l1-dirty-launcher-changed/],
    [l1.priorRun[0].file,/audio-l1-prior-run-changed/],[manifest.rows[0][0],/audio-j1-protected-data/]]){
    await f.write(file,Buffer.alloc(f.inputs.get(file).length,33));
    await assert.rejects(j1Preservation(files,reference),code);await f.write(file,f.inputs.get(file));
  }
  const missing=manifest.rows[0][0];
  await fs.unlink(path.join(files.root,missing));await assert.rejects(j1Preservation(files,reference),/audio-j1-protected-files/);
  await f.write(missing,f.inputs.get(missing));
  for(const mutate of [m=>m.schema='wrong',m=>m.rows.push(m.rows[0]),m=>m.rows[0][0]='outside/fixture',m=>m.rows.pop(),
    m=>m.rows[0][1]++,m=>m.protection.index='0'.repeat(64)]){
    const broken=structuredClone(manifest);mutate(broken);
    await assert.rejects(j1Preservation(files,{...reference,preparation:await f.preparation(broken)}));
  }
  const wrongIndex=await f.preparation(manifest,{index:'0'.repeat(64)});
  await assert.rejects(j1Preservation(files,{...reference,preparation:wrongIndex}),/audio-j1-protection-changed/);
  await f.preparation();
  for(const [key,error] of [['manifest',/audio-j1-protected-manifest/],['baseline',/audio-j1-preparation-source/]]){
    await f.write(reference.preparation[key].file,'changed');await assert.rejects(j1Preservation(files,reference),error);await f.preparation();
  }
  await assert.rejects(l1Preservation(files,{...l1,semanticIndex:'0'.repeat(64)}),/audio-l1-index-content-changed/);
  f.git('commit','--allow-empty','-qm','new head');
  await assert.rejects(l1Preservation(files,l1),/audio-l1-index-content-changed/);
  const newHead=f.git('rev-parse','HEAD').trim();await f.write(f.tracked,'changed');f.git('add','--',f.tracked);
  await assert.rejects(j1Preservation(files,{...reference,l1:{...l1,head:newHead}}),/audio-l1-index-content-changed/);
});

test('historical J1 parent fixture preserves the exact original two audio resources',()=>{
  const baseline=require('./fixtures/f01-j1-product-baseline.json');
  assert.deepEqual(Object.keys(baseline),['web/audio.js','web/audio-transition-worklet.js']);
  assert.equal(sha(Buffer.from(baseline['web/audio.js'])),'07e4961d1f0c7105ebe8d4ce62e6139c6d766cf1302b07c2c9a540d21ab67606');
  assert.equal(sha(Buffer.from(baseline['web/audio-transition-worklet.js'])),'bd51050b44d6065068912e805f3683785f31fbcf3fd6d59250235caa241b285f');
});
