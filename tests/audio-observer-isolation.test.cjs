// 제품 루트에서 node --test tests/audio-observer-isolation.test.cjs로 실행한다.
// 고정 셀·증거·종료 계약을 합성 입력과 임시 파일에서 검사한다. 계약 위반은 실패로 보고한다.
const test=require('node:test');
const assert=require('node:assert/strict');
const subject=()=>import('../scripts/audio-observer-isolation.mjs');
const suffixes=['f1','u1','t1','u2','t2','f2','t3','f3','u3'];
const paths=['media-profiles.js','config.js','web/runtime.js','web/site-adapter.js','web/audio.js','web/player.js'];
for(const nested of [false,true])test(`observer resolves one flat readable product root from ${nested?'nested':'flat'} assets`,async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'observer-product-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const assets=nested?path.join(root,'extension'):root;
  await fs.mkdir(path.join(assets,'web'),{recursive:true});await fs.writeFile(path.join(assets,'manifest.json'),'{}');
  for(const [index,file]of paths.entries())await fs.writeFile(path.join(assets,file),'asset-'+index);
  await fs.writeFile(path.join(assets,'web/audio-transition-worklet.js'),'worklet-bytes');
  const api=await subject(),{openOwnedRoot}=await import('../scripts/owned-files.mjs');
  assert.equal(typeof api.observerProductInput,'function');
  const owned=await openOwnedRoot(root),input=await api.observerProductInput(owned,()=>5000);
  assert.equal(input.workletSha256,require('node:crypto').createHash('sha256').update('worklet-bytes').digest('hex'));
  assert.equal(input.root,await fs.realpath(assets));assert.deepEqual(input.files.map(row=>row.path),paths);
  for(const [index,file]of paths.entries())assert.equal(await fs.readFile(path.join(input.root,file),'utf8'),'asset-'+index);
  if(nested){await fs.writeFile(path.join(root,'manifest.json'),'{}');await assert.rejects(()=>api.observerProductInput(owned,()=>5000));}
});
const caseInputs=[[1000,.5,1,false,'identical',false],[1000,.01,1,false,'identical',false],[100,.8,1,false,'identical',false],[5000,.8,1,false,'identical',false],
  [1000,.5,1,true,'identical',false],[1000,.01,1.5,true,'identical',false],[1000,.1,1.5,true,'identical',false],[1000,.5,1.5,true,'identical',false],
  [1000,.98,1.5,true,'identical',false],[1000,.98,2,true,'identical',false],[100,.8,1.5,true,'identical',false],[5000,.8,1.5,true,'identical',false],
  [1000,.5,1.5,true,'left-only',false],[1000,.98,1.5,true,'identical',true]];

async function nine(){
  const {summarizeCapture}=await import('../scripts/audio-signal.mjs');
  const order=suffixes.map(s=>({label:'f01obs-test-'+s,mode:s[0]}));
  const files=paths.map(path=>({path,sha256:'c'.repeat(64)}));
  const manifest={schema:2,prefix:'f01obs-test',order,tools:{frozen:{commit:'c5d45b8a7abf30450d3f1bbff45afbb8cd020cb5',inputSha256:'b'.repeat(64)},current:{commit:'a'.repeat(40),inputSha256:'d'.repeat(64)}},
    product:{root:'/synthetic/current',files},environment:{platform:'linux',nodeVersion:'v24.19.0',nodeExecutableSha256:'e'.repeat(64),playwrightVersion:'1.62.1',browserExecutableSha256:'f'.repeat(64),sampleRate:48000},ci:{checkout:'a'.repeat(40),head:null}};
  const capture=(start,end,value=.35)=>({rate:48000,start,end,channels:[Array(end-start).fill(value),Array(end-start).fill(value)]});
  const summary=summarizeCapture(capture(0,2400));
  const records=order.map(({label,mode})=>{
    const artifact={label,root:'/synthetic/current',files:structuredClone(files)};
    const captures=[],transitions=[],actions=[];let frame=10000;
    for(const frequency of [250,750,1000])for(const [kind,value]of [['gain',1.5],['gain',2],['gain',0],['gain',1],['enabled',false],['enabled',true]]){
      const row={frequency,kind,value};
      for(const [phase,a,b]of [['before',-3840,-1920],['change',-960,1920],['after',4800,6720]]){
        const raw=capture(frame+a,frame+b);row[phase]=summarizeCapture(raw);
        if(kind==='enabled')captures.push({capture:raw,transition:{frequency,value,frame},phase});
      }
      if(kind==='enabled')actions.push({frame,afterFrame:frame});transitions.push(row);frame+=10000;
    }
    const report={artifact,browser:'151.0',nodes:{sources:1,sampleRate:48000,compressor:[]},
      cases:caseInputs.map(([frequency,inputAmplitude,gain,enabled,stereo,bursts])=>({frequency,inputAmplitude,gain,enabled,stereo,bursts,...structuredClone(summary)})),transitions,
      alignments:[[8000,48],[11025,66],[16000,96],[22050,132],[32000,192],[44100,264],[48000,288],[88200,529],[96000,576],[176400,1023],[192000,1023],[384000,1023]]
        .map(([sampleRate,expectedFrame])=>({sampleRate,expectedFrame,dryFirst:expectedFrame,dryLast:expectedFrame,compressorFirst:expectedFrame,compressorLast:expectedFrame})),
      stress:{profile:'threshold0/knee0/ratio1/gain2',...summarizeCapture(capture(0,2400,.98))},qualityFailures:[]};
    const diagnostic=mode==='f'?null:{artifact:structuredClone(artifact),sourceCommit:'a'.repeat(40),pullRequestHead:null,platform:'linux',nodeVersion:'v24.19.0',browserVersion:'151.0',sampleRate:48000,
      audioConfig:{audioDefault:false,audioGain:1},wanted:true,state:'on',traceEnabled:mode==='t',label,complete:true,truncated:false,error:null,validationErrors:[],secondaryErrors:[],
      gainRoles:['dry','wet','masterGain','headroom','compDry','compWet','compMix','normalizer'],captures,actions,
      trace:{complete:true,truncated:false,error:null,nodeCount:8,gains:Array(8).fill(1),events:mode==='t'?[{node:0,method:'setValueAtTime',value:1,time:1}]:[]},
      shutdown:{kind:'playwright',browserCloseAcknowledged:true,browserDisconnected:true}};
    return {label,mode,exitCode:0,signal:null,timedOut:false,overflow:false,closeConfirmed:true,report,diagnostic};
  });
  for(const item of records)if(item.diagnostic)require('./fixtures/audio-signed.cjs').installSignedFixture(item,summarizeCapture);
  return {manifest,records};
}

test('observer rejects a product root that differs from the bound manifest root',async()=>{
  const f=await nine();f.manifest.product.root='/synthetic/another-product';
  const result=(await subject()).assessObserverRunSet(f);assert.equal(result.transportComplete,false);
});
for(const root of ['', 'relative/product', null])test('observer rejects an unbound or nonabsolute product root '+root,async()=>{
  const f=await nine();f.manifest.product.root=root;
  assert.equal((await subject()).assessObserverRunSet(f).transportComplete,false);
});
test('observer cannot promote a schema1 manifest into root-bound evidence',async()=>{
  const f=await nine();f.manifest.schema=1;
  assert.equal((await subject()).assessObserverRunSet(f).transportComplete,false);
});

for(const mutation of ['right-zero','absolute','no-change'])test('observer consumer rejects signed '+mutation+' without corrupt transport',async()=>{
  const {assessObserverRunSet}=await subject(),fixture=await nine(),item=fixture.records[1],{summarizeCapture}=await import('../scripts/audio-signal.mjs');
  for(const row of item.diagnostic.captures){const c=row.capture;
    if(mutation==='right-zero')c.channels[1].fill(0);
    if(mutation==='absolute')c.channels=c.channels.map(channel=>channel.map(Math.abs));
    if(mutation==='no-change'&&row.phase==='change'){const amplitude=row.transition.value?.36:.35;c.channels=c.channels.map(channel=>channel.map((_,i)=>amplitude*Math.sin(2*Math.PI*((c.start+i)%(48000/row.transition.frequency))/(48000/row.transition.frequency))));}
    item.report.transitions.find(t=>t.kind==='enabled'&&t.frequency===row.transition.frequency&&t.value===row.transition.value)[row.phase]=summarizeCapture(c);
  }
  const result=assessObserverRunSet(fixture);assert.equal(result.transportComplete,true);assert.equal(result.qualityPass,false);
});
for(const delay of [1/48000,.03,.12])test('observer rejects extra or delayed overlapping master automation '+delay,async()=>{
  const {assessObserverRunSet}=await subject(),fixture=await nine(),trace=fixture.records[2].diagnostic.trace;
  trace.events.push({node:0,method:'setValueAtTime',value:.5,time:trace.events[0].time+delay});
  const result=assessObserverRunSet(fixture);assert.equal(result.transportComplete,true);assert.equal(result.qualityPass,false);
});

test('observer order fixes all nine positions and rejects unsafe or overflowing labels',async()=>{
  const {observerRunPlan}=await subject();
  assert.deepEqual(observerRunPlan('f01obs-test'),suffixes.map(s=>({label:'f01obs-test-'+s,mode:s[0]})));
  for(const prefix of ['', '../x','UPPER','a'.repeat(62)])assert.throws(()=>observerRunPlan(prefix));
});

test('nine-role assessment requires original shape and independent complete U/T PCM',async()=>{
  const {assessObserverRunSet}=await subject(),f=await nine();
  const result=assessObserverRunSet(f);assert.deepEqual(result,{transportComplete:true,qualityPass:true,failures:[],legacy:result.legacy,supplementary:result.supplementary});
  assert.equal(result.legacy.length,9);assert.equal(result.supplementary.filter(row=>row.status==='legacy-only').length,3);
  assert.equal(result.supplementary.filter(row=>row.status==='passed'&&row.transitions.length===18).length,6);
  for(const mutate of [x=>x.records.pop(),x=>x.records.reverse(),x=>{x.records[1].report=null;},x=>{x.records[0].diagnostic={};},
    x=>{x.records[1].diagnostic.sourceCommit='b'.repeat(40);},x=>{x.records[1].diagnostic.traceEnabled=true;},
    x=>{x.records[2].diagnostic.captures[0].capture.channels[0][0]=.1;},x=>{x.records[1].diagnostic.shutdown.browserDisconnected=false;},
    x=>{x.records[0].report.artifact.files[0].sha256='b'.repeat(64);},x=>{x.records[0].report.browser='other';},
    x=>{x.records[1].diagnostic.nodeVersion='v25.0';},x=>{x.manifest.tools.frozen.commit='b'.repeat(40);},x=>{x.manifest.ci.checkout='b'.repeat(40);},
    x=>{x.records[0].report.cases[0].frequency=750;},x=>{x.records[0].report.cases[0].gain=2;},x=>{x.records[0].report.cases[0].enabled=0;},
    x=>{x.records[0].report.transitions[0].value=2;},x=>{x.records[1].report.transitions[0].kind='unknown';},x=>{x.records[1].report.transitions[0].value=1.7;},x=>{x.records[0].report.alignments[0].sampleRate=11025;},
    x=>{x.records[0].report.cases[0].channels.pop();},x=>{x.records[0].report.cases[0].channels[0].rms=NaN;},
    x=>{x.records[0].report.cases[0].channels[0].peak=Infinity;},x=>{x.records[0].report.qualityFailures=['forged'];},
    x=>{x.records[0].closeConfirmed=false;},x=>{x.records[0].exitCode=1;},x=>{x.records[0].overflow=true;},x=>{x.records[0].timedOut=true;}]){
    const broken=structuredClone(f);mutate(broken);const actual=assessObserverRunSet(broken);
    assert.equal(actual.transportComplete,false,String(mutate));assert.equal(actual.qualityPass,false);
  }
});

test('real numerical failure stays available without becoming transport success from exit alone',async()=>{
  const {assessObserverRunSet}=await subject(),f=await nine(),record=f.records[1];
  record.report.stress.channels[0].peak=1.1;record.report.qualityFailures=['stress-channel-0/peak=1.1'];record.exitCode=1;
  record.diagnostic.error='Audio quality failed: stress-channel-0/peak=1.1';
  const result=assessObserverRunSet(f);assert.equal(result.transportComplete,true);assert.equal(result.qualityPass,false);
  assert.ok(result.failures.some(x=>x.includes('peak=1.1')));assert.equal(record.report.stress.channels[0].peak,1.1);
  record.closeConfirmed=false;assert.equal(assessObserverRunSet(f).transportComplete,false);
});

for(const mode of ['f','u','t'])for(const frame of [289,-1])test(`${mode} alignment measurement ${frame} is a complete numeric failure, not corrupt input`,async()=>{
  const {assessObserverRunSet}=await subject(),fixture=await nine(),row=fixture.records.find(row=>row.mode===mode);
  row.report.alignments[6].compressorFirst=frame;row.report.alignments[6].compressorLast=frame;
  row.report.qualityFailures=['48000/delay-alignment'];row.exitCode=1;
  if(row.diagnostic)row.diagnostic.error='Audio quality failed: 48000/delay-alignment';
  const result=assessObserverRunSet(fixture);assert.deepEqual(result,{transportComplete:true,qualityPass:false,failures:[row.label+'/48000/delay-alignment'],legacy:result.legacy,supplementary:result.supplementary});
  row.report.alignments[6].compressorFirst=NaN;
  assert.equal(assessObserverRunSet(fixture).transportComplete,false);
});

test('owned child streams exact separate logs and retains exit1 without replacing a written result',async t=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'observer-child-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {openOwnedRoot}=await import('../scripts/owned-files.mjs'),files=await openOwnedRoot(root);
  const {executeObserverChild}=await subject();
  const result=await executeObserverChild({files,cwd:root,args:['-e',"require('node:fs').writeFileSync('result.json','kept');process.stdout.write('out');process.stderr.write('err');process.exitCode=1"],env:{...process.env},stdout:'stdout.log',stderr:'stderr.log'});
  assert.equal(result.exitCode,1);assert.equal(result.signal,null);assert.equal(result.timedOut,false);assert.equal(result.overflow,false);
  assert.equal(await files.readFile('stdout.log','utf8'),'out');assert.equal(await files.readFile('stderr.log','utf8'),'err');assert.equal(await files.readFile('result.json','utf8'),'kept');
  await assert.rejects(executeObserverChild({files,cwd:root,args:['-e',"throw Error('must not start')"],env:{...process.env},stdout:'stdout.log',stderr:'other.log'}));
  assert.equal(await files.readFile('stdout.log','utf8'),'out');
});

test('owned child output overflow and timeout cannot be promoted to normal closure',async t=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'observer-bounds-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {openOwnedRoot}=await import('../scripts/owned-files.mjs'),files=await openOwnedRoot(root),{executeObserverChild}=await subject();
  const overflow=await executeObserverChild({files,cwd:root,args:['-e',"process.stdout.write(Buffer.alloc(3*1024*1024));setInterval(()=>{},1000)"],env:{...process.env},stdout:'large.log',stderr:'large-err.log'});
  assert.equal(overflow.overflow,true);assert.equal(overflow.closeConfirmed,false);assert.ok((await files.lstat('large.log')).size<=2*1024*1024);
  const timeout=await executeObserverChild({files,cwd:root,args:['-e','setInterval(()=>{},1000)'],env:{...process.env},stdout:'hang.log',stderr:'hang-err.log',timeoutMs:80});
  assert.equal(timeout.timedOut,true);assert.equal(timeout.closeConfirmed,false);
});

test('fixed sequence continues after numeric exit but stops before another child after uncertain close',async()=>{
  const {executeObserverSequence}=await subject();
  const all=await executeObserverSequence('f01obs-test',async run=>({...run,exitCode:1,closeConfirmed:true}));
  assert.deepEqual(all.map(x=>x.label),'f1,u1,t1,u2,t2,f2,t3,f3,u3'.split(',').map(s=>'f01obs-test-'+s));
  const stopped=await executeObserverSequence('f01obs-test',async run=>({...run,exitCode:0,closeConfirmed:run.mode==='f'}));
  assert.equal(stopped.length,2);assert.equal(stopped.at(-1).label,'f01obs-test-u1');
  const failed=await executeObserverSequence('f01obs-test',async run=>{if(run.mode==='u')throw Error('later-read-failed');return {...run,closeConfirmed:true};});
  assert.equal(failed.length,2);assert.equal(failed[0].label,'f01obs-test-f1');assert.equal(failed[1].closeConfirmed,false);
  const drift=await executeObserverSequence('f01obs-test',async run=>({...run,closeConfirmed:true,stopReason:'input-drift'}));assert.equal(drift.length,1);
});

test('public evidence layout materializes exactly35 unique owned files with no profiles',async t=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'observer-paths-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {observerEvidencePaths}=await subject(),{openOwnedRoot}=await import('../scripts/owned-files.mjs'),files=await openOwnedRoot(root);
  const paths=observerEvidencePaths('f01obs-test');assert.equal(paths.length,35);assert.equal(new Set(paths).size,35);
  for(const name of paths){assert.ok(name.startsWith('output/audio-observer/f01obs-test/'));assert.ok(!name.includes('profile'));await files.ensureDirectory(path.posix.dirname(name));await files.writeFile(name,'{}',{flag:'wx'});}
  assert.equal((await files.readdir('output/audio-observer/f01obs-test')).length,35);
});

test('isolation rejects overlap and dirty or unpinned source before a browser invocation',async()=>{
  const {runObserverIsolation}=await subject();
  for(const frozenRoot of ['.','output','../cheese-knife'])await assert.rejects(runObserverIsolation({frozenRoot,prefix:'f01obs-reject'}));
});

test('CI publishes the exact35 paths even when the real host rejects its frozen root before launch',async t=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'observer-ci-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const workflow=await fs.readFile('.github/workflows/ci.yml','utf8'),match=workflow.match(/<<'OBSERVER_NODE'\r?\n([\s\S]*?)\r?\n\s+OBSERVER_NODE/);assert.ok(match);
  const script=match[1].split(/\r?\n/).map(line=>line.replace(/^          /,'')).join('\n');
  const filename=path.join(root,'github-output');
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_OUTPUT:filename,F01_OBSERVER_FROZEN:'.'},timeout:15000});
  assert.equal(result.status,1);assert.match(result.stderr,/observer-root-overlap/);
  const lines=(await fs.readFile(filename,'utf8')).trim().split('\n');assert.equal(lines.shift(),'paths<<F01_OBSERVER_PATHS');assert.equal(lines.pop(),'F01_OBSERVER_PATHS');
  const {observerEvidencePaths}=await subject();assert.deepEqual(lines,observerEvidencePaths('f01obs-123-1'));
});

test('browser attestation selects an installed pinned executable without launching a browser',async()=>{
  const fs=require('node:fs/promises'),{observerBrowserExecutable}=await subject();
  const executable=await observerBrowserExecutable(process.cwd());assert.ok((await fs.lstat(executable)).isFile());
  assert.match(executable,process.platform==='win32'?/chrome\.exe$/:/headless_shell/);
});

test('두 러너의 설치가 같아도 helper가 다른 jsdom을 해석하면 관측을 거부한다',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
  const {observerSharedInstallation}=await subject(),root=await fs.mkdtemp(path.join(os.tmpdir(),'observer-install-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'scripts'));
  await fs.symlink(await fs.realpath('node_modules'),path.join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
  const ok=await observerSharedInstallation(process.cwd(),root,()=>5000);
  for(const value of Object.values(ok.hashes))assert.match(value,/^[0-9a-f]{64}$/);
  const shadow=path.join(root,'tests','node_modules','jsdom');await fs.mkdir(shadow,{recursive:true});
  await fs.writeFile(path.join(shadow,'index.js'),'module.exports={}');
  await assert.rejects(observerSharedInstallation(process.cwd(),root,()=>5000),/observer-dependency-outside-install/);
});

test('공유 jsdom의 package.json main이 바뀌면 다음 대조가 새 진입점과 바이트를 읽는다',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
  const {createHash}=require('node:crypto'),{observerSharedInstallation}=await subject();
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'observer-package-main-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const current=path.join(root,'current'),frozen=path.join(root,'frozen'),modules=path.join(current,'node_modules');
  for(const checkout of [current,frozen])await fs.mkdir(path.join(checkout,'scripts'),{recursive:true});
  const playwright=path.join(modules,'playwright'),jsdom=path.join(modules,'jsdom');
  await fs.mkdir(playwright,{recursive:true});await fs.mkdir(jsdom);
  await fs.symlink(modules,path.join(frozen,'node_modules'),process.platform==='win32'?'junction':'dir');
  await fs.writeFile(path.join(playwright,'package.json'),JSON.stringify({exports:{'.':{import:'./index.mjs',require:'./index.cjs'}}}));
  for(const name of ['index.mjs','index.cjs'])await fs.writeFile(path.join(playwright,name),'throw Error("본문 실행 금지")');
  for(const name of ['first.cjs','second.cjs'])await fs.writeFile(path.join(jsdom,name),'throw Error('+JSON.stringify(name)+')');
  const resolved=[];
  for(const main of ['first.cjs','second.cjs']){
    await fs.writeFile(path.join(jsdom,'package.json'),JSON.stringify({main}));
    const checked=await observerSharedInstallation(current,frozen,()=>5000);
    assert.equal(checked.install.entries[2],await fs.realpath(path.join(jsdom,main)));
    assert.equal(checked.hashes.jsdom,createHash('sha256').update(await fs.readFile(path.join(jsdom,main))).digest('hex'));
    resolved.push(checked);
  }
  assert.notEqual(resolved[0].hashes.jsdom,resolved[1].hashes.jsdom);
});

test('F는 선택한 브라우저의 첫 player 원문 평가 뒤 로더만 준비하고 즉시 원래 메서드를 복구한다',async()=>{
  const {prepareFrozenWorklet,frozenWorkletPrepared}=await import('../scripts/audio-observer-frozen-bootstrap.mjs');
  const {registerQualityWorklet}=await import('../scripts/audio-quality-diagnostics.mjs');
  for(const method of ['launch','connectOverCDP']){
    const events=[],nativeBlocked=new Promise(()=>{}),player='exact player source',bytes=Uint8Array.of(0,1,255);
    const page={async evaluate(fn,data){
      if(fn===registerQualityWorklet){assert.deepEqual(data,[0,1,255]);events.push('loader');return undefined;}
      if(fn==='native-completion')return nativeBlocked;
      events.push(fn);return 23;
    }};
    const browser={async newPage(){return page;}},chromium={async [method](){return browser;}};
    const open=chromium[method],newPage=browser.newPage,evaluate=page.evaluate;
    prepareFrozenWorklet(chromium,method,player,bytes,()=>events.push('prepared'));
    await chromium[method]();await browser.newPage();await page.evaluate('other');
    assert.equal(await page.evaluate(player),23);await page.evaluate(player);
    assert.deepEqual(events,['other',player,'loader','prepared',player]);
    assert.equal(chromium[method],open);assert.equal(browser.newPage,newPage);assert.equal(page.evaluate,evaluate);
  }
  const sha='a'.repeat(64),line='observer-frozen-worklet-prepared:'+sha;
  assert.equal(frozenWorkletPrepared('before\n'+line+'\r\nafter',sha),true);
  for(const text of ['',line+'\n'+line,'prefix '+line,line+'a',line.replace(sha,'b'.repeat(64))])
    assert.equal(frozenWorkletPrepared(text,sha),false);
});

// 첫 슬롯만 유실된 뒤에도 다른 다섯 셀의 실제 수치·signed 판정이 유지되는지 볼 합성 입력이다.
function installObserverRoles(f,sha,summarizeCapture){
  const traced=f.mode==='t';
  const d=f.diagnostic,proof=d.workletSigned={
    schema:'worklet-signed-v1',mode:traced?'T':'U',gainTraceInstalled:traced,registration:{attempts:1,successes:1,sha256:sha},firstOn:{sources:1,state:'running',on:true},wide:[],error:'',
  };
  d.workletSha256=f.report.nodes.workletSha256=proof.registration.sha256;
  d.roleProfile=true;d.injectedMain=structuredClone(d.artifact.files);
  const events=[];if(traced)proof.events=events;
  let seq=0,meter=0;
  for(const [i,action]of d.actions.entries()){
    const enabled=i%2===1,id=Math.floor(i/2)+1,source='blob:synthetic-'+f.label+'-'+id;
    const command=wanted=>({kind:'configure',seq:++seq,sourceEpoch:id,wanted,eq:Array(8).fill(0),gain:1,dynamics:true,normalizer:false,targetDbfs:-20});
    const receive=(kind,frame)=>({type:'receive',id,data:{kind,seq,sourceEpoch:id,frame,meterEpoch:meter,gain:kind==='completed'?1:null,code:null}});
    if(!enabled){
      seq=0;meter=0;
      events.push({type:'create',id,source,epoch:id},receive('prepared',0),{type:'send',id,data:command(true)});
      meter++;events.push(receive('accepted',128),receive('completed',1856));
    }
    const accepted=Math.ceil((action.frame+128)/128)*128,anchor=accepted+(enabled?0:1248);
    action.afterFrame=enabled?accepted:action.frame;
    const mark=(type,frame)=>({type,id,source,frame});
    events.push(mark('start',action.frame),{type:'send',id,data:command(enabled)});
    meter++;
    if(!enabled)events.push(mark('settle',action.afterFrame));
    events.push(receive('accepted',accepted));
    if(enabled)events.push(mark('settle',action.afterFrame));
    events.push(receive('completed',accepted+1728),mark('end',action.frame+14400));
    const row=f.report.transitions.filter(r=>r.kind==='enabled')[i],start=action.frame-960;
    const samples=Array.from({length:4800},(_,j)=>{
      const frame=start+j,w=Math.min(1,Math.max(0,(frame-anchor)/480));
      const amplitude=enabled?(1-w)*.36+w*.35:(1-w)*.35+w*.36;
      return amplitude*Math.sin(2*Math.PI*(frame%(48000/row.frequency))/(48000/row.frequency));
    });
    proof.wide.push({start,end:start+4800,rate:48000,channels:[samples,samples.slice()]});
    const change=d.captures[3*i+1].capture;
    change.channels=[samples.slice(0,2880),samples.slice(0,2880)];row.change=summarizeCapture(change);
  }
  if(traced)d.roles=require('./fixtures/audio-worklet-roles.cjs').roleFixture(f.label,events[0].source,d.injectedMain,sha);
}

test('스키마 3은 F 준비 해시와 별도 Worklet 역할·제품 증거를 재판정한다',async()=>{
  const {assessObserverRunSet}=await subject(),fixture=await nine(),{manifest,records}=fixture;
  const sha='1'.repeat(64);
  manifest.schema=3;manifest.frozenPreparation='frozen-player-worklet-url-and-byte-loader';
  manifest.tools.current.lockSha256=manifest.environment.lockSha256=sha;
  manifest.tools.frozen.lockSha256='2'.repeat(64);manifest.product.workletSha256=sha;
  manifest.environment.sharedInstallation={playwrightImport:sha,playwrightRequire:sha,jsdom:sha};
  for(const item of records){
    if(item.mode==='f')item.preparedWorkletSha256=sha;
    else{
      item.report.nodes.workletSha256=item.diagnostic.workletSha256=sha;
      item.diagnostic.gainRoles=[];item.diagnostic.trace.events=[];
    }
  }
  const result=assessObserverRunSet(fixture);
  assert.equal(result.transportComplete,false);assert.equal(result.qualityPass,false);
  for(const item of records.filter(row=>row.mode!=='f'))
    assert.ok(result.failures.some(value=>value.startsWith(item.label+'/')),item.label);
  assert.equal(result.failures.some(value=>value.includes('observer-environment-drift')||value.includes('diagnostic-gain-roles')),false);
  records[0].preparedWorkletSha256='9'.repeat(64);
  assert.ok(assessObserverRunSet(fixture).failures.includes(records[0].label+'/observer-frozen-preparation'));
  records[1].report.nodes.workletSha256='9'.repeat(64);
  assert.ok(assessObserverRunSet(fixture).failures.includes(records[1].label+'/observer-worklet-hash'));
  records[0].preparedWorkletSha256=sha;
  const {summarizeCapture}=await import('../scripts/audio-signal.mjs');
  for(const item of records.filter(row=>row.mode!=='f'))installObserverRoles(item,sha,summarizeCapture);
  const good=assessObserverRunSet(fixture);assert.deepEqual(good.failures,[]);
  const later=records.filter(row=>row.mode!=='f'&&row!==records[1]);
  for(const [item,key] of [[records[1],'report'],[records[1],'diagnostic'],[records[0],'report']]){
    const original=item[key];item[key]=null;
    const bad=assessObserverRunSet(fixture);item[key]=original;
    assert.equal(bad.transportComplete,false);assert.equal(bad.qualityPass,false);
    assert.ok(bad.failures.length&&bad.failures.every(value=>value.startsWith(item.label+'/')),bad.failures.join(', '));
    for(const row of later){
      for(const outcomes of ['legacy','supplementary']){
        const expected=good[outcomes].find(value=>value.label===row.label);
        assert.equal(expected.status,'passed');
        assert.deepEqual(bad[outcomes].find(value=>value.label===row.label),expected);
      }
    }
  }
});

for(const expiry of ['prepare','child-timeout','last-attestation','evidence','publication','root-switch','uncertain-ut','complete','missing-log','special-log'])test(expiry==='root-switch'?'observer stops when the product root changes with identical hashes':`whole observer deadline rejects expiry during ${expiry}`,async()=>{
  const fs=require('node:fs/promises'),path=require('node:path'),{isDeepStrictEqual}=require('node:util'),api=await subject();
  const {validateQualityEvidence}=await import('../scripts/audio-quality-diagnostics.mjs'),fixture=await nine(),saved=new Map();
  const repositoryRoot=path.resolve('memory-current'),frozenRoot=path.resolve('memory-frozen');let elapsed=0,count=0,advanced=false;
  const expire=()=>{if(!advanced){elapsed=1201000;advanced=true;}};
  const challenged='output/audio-observer/f01obs-test/f01obs-test-u2-stdout.log';
  const makeFiles=root=>({root,lstat:async name=>{
    if(expiry==='evidence'&&count===9&&name.endsWith('-report.json'))expire();
    if(name===challenged&&expiry==='missing-log')return null;
    return saved.has(name)?{isFile:()=>name!==challenged||expiry!=='special-log'}:null;
  },
    resolve:async name=>path.join(root,name),ensureDirectory:async name=>path.join(root,name),
    writeFile:async(name,data)=>{saved.set(name,data);if(expiry==='publication'&&name.endsWith('/result.json'))expire();},
    readFile:async name=>saved.get(name)??Buffer.from('fixed tracked bytes')});
  const files=makeFiles(repositoryRoot),frozen=makeFiles(frozenRoot);
  const workletSha256='4'.repeat(64),frozenPreparation='frozen-player-worklet-url-and-byte-loader';
  const {frozenWorkletPrepared}=await import('../scripts/audio-observer-frozen-bootstrap.mjs');
  for(const item of fixture.records)if(item.diagnostic){item.diagnostic.gainRoles=[];item.diagnostic.trace.events=[];}
  if(expiry==='uncertain-ut')fixture.records[1].diagnostic.secondaryErrors=['failed-close'];
  const identities={current:{...fixture.manifest.tools.current,lockSha256:'1'.repeat(64)},frozen:{...fixture.manifest.tools.frozen,lockSha256:'2'.repeat(64)}};
  const boundaries={path,isDeepStrictEqual,frozenPreparation,preloadUrl:'file:///preload.mjs',frozenWorkletPrepared,
    sharedInstallation:async()=>({hashes:{playwrightImport:workletSha256,playwrightRequire:workletSha256,jsdom:workletSha256}}),observerRunPlan:api.observerRunPlan,observerEvidencePaths:api.observerEvidencePaths,
    executeObserverSequence:api.executeObserverSequence,validateQualityEvidence,
    // 이 시계 fixture는 셀 종료 뒤 호스트의 마지막 마감 검사까지 도달해야 한다.
    assessObserverRunSet:({records})=>{const complete=records.length===9&&records.every(row=>row.closeConfirmed);
      return {transportComplete:complete,qualityPass:complete,failures:[]};},
    repositoryRoot,frozenCommit:'c5d45b8a7abf30450d3f1bbff45afbb8cd020cb5',process:{platform:'linux',version:'v24.19.0',execPath:path.resolve('memory-node'),env:{}},
    Date:{now:()=>elapsed},need:(value,code)=>{if(!value)throw Error(code);},record:value=>value,fs:{mkdir:async()=>{}},
    ownedRoot:async root=>root===repositoryRoot?files:frozen,sourceIdentity:async root=>{
      if(expiry==='prepare'||expiry==='last-attestation'&&count===9)expire();return identities[root===files?'current':'frozen'];},
    execFileSync:()=>Buffer.from('fixed tracked bytes'),sha:()=> '2'.repeat(64),hashFile:async()=> '3'.repeat(64),
    browserExecutable:async()=>{if(expiry==='child-timeout')elapsed=1180000;return path.resolve('memory-browser');},
    productIdentity:async()=>({...fixture.manifest.product,workletSha256,...expiry==='root-switch'&&count?{root:'/synthetic/changed-root'}:{}}),profiles:async()=>[],
    executeObserverChild:async options=>{
      const {label,mode}=fixture.records[count];
      const expected=mode==='f'?['--import','file:///preload.mjs','scripts/check-audio-quality.mjs','--root',fixture.manifest.product.root,'--label',label]:
        ['scripts/check-audio-quality.mjs','--ci-worklet-signed','--label',label];
      assert.deepEqual(options.args,expected);assert.equal(options.env.KNIFE_AUDIO_QUALITY_TRACE,mode==='t'?'1':undefined);
      saved.set(options.stdout,'');saved.set(options.stderr,'');
      if(mode==='f'){
        assert.equal(options.env.F01_OBSERVER_WORKLET_SHA256,workletSha256);
        saved.set(options.stderr,'observer-frozen-worklet-prepared:'+workletSha256+'\n');
      }
      count++;if(expiry==='child-timeout'){
      assert.equal(options.timeoutMs,20000);elapsed+=21000;
      return{exitCode:null,signal:'SIGTERM',timedOut:true,overflow:false,closeConfirmed:false,errors:['child-stop-sentinel']};
    }elapsed+=119000;return{exitCode:0,signal:null,timedOut:false,overflow:false,closeConfirmed:true,errors:[]};},
    boundedJSON:async(_root,name)=>Buffer.from(JSON.stringify(name.includes('-diagnostic.json')?fixture.records[count-1].diagnostic:fixture.records[count-1].report))};
  const source=await fs.readFile('scripts/audio-observer-isolation.mjs','utf8'),original=source.slice(source.indexOf('export async function runObserverIsolation')).replace(/^export /,'');
  const io=source.match(/^async function readWithin.*$/m)?.[0]||'';
  const run=new Function('boundaries',`with(boundaries){${io};return (${original});}`)(boundaries);
  let result,error;try{result=await run({frozenRoot,prefix:'f01obs-test'});}catch(cause){error=cause;}
  if(['complete','missing-log','special-log'].includes(expiry)){
    assert.ifError(error);const complete=expiry==='complete';
    const output=JSON.parse(saved.get('output/audio-observer/f01obs-test/result.json'));
    assert.equal(count,9);assert.equal(result.transportComplete,complete);assert.equal(result.qualityPass,complete);
    assert.deepEqual(result.failures,complete?[]:['observer-evidence-file/'+challenged]);
    const expected=api.observerEvidencePaths('f01obs-test').filter(name=>!name.endsWith('/result.json')&&(complete||name!==challenged));
    assert.deepEqual(output.evidence.map(file=>file.path),expected);
    assert.equal(output.evidence.length,complete?34:33);return;
  }
  assert.ok(error||result?.transportComplete===false,'expired host must reject or report incomplete');
  assert.notEqual(result?.qualityPass,true);
  if(expiry==='uncertain-ut'){assert.equal(count,2);assert.equal(result.transportComplete,false);return;}
  if(expiry==='root-switch'){assert.equal(count,1);assert.equal(JSON.parse(saved.get('output/audio-observer/f01obs-test/result.json')).records[0].stopReason,'observer-input-changed');return;}
  assert.ok(elapsed>=1200000);
  if(expiry==='prepare')assert.equal(count,0);else if(expiry==='child-timeout'){
    assert.equal(count,1);const actual=JSON.parse(saved.get('output/audio-observer/f01obs-test/result.json')).records[0];
    assert.equal(actual.signal,'SIGTERM');assert.equal(actual.timedOut,true);assert.ok(actual.errors.includes('child-stop-sentinel'));
  }else{assert.equal(count,9);if(expiry==='last-attestation')assert.equal(JSON.parse(saved.get('output/audio-observer/f01obs-test/result.json')).records.at(-1).exitCode,0);}
});
