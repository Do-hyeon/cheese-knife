const test=require('node:test');
const assert=require('node:assert/strict');
const subject=()=>import('../scripts/audio-observer-isolation.mjs');
const suffixes=['f1','u1','t1','u2','t2','f2','t3','f3','u3'];
const paths=['media-profiles.js','config.js','web/runtime.js','web/site-adapter.js','web/audio.js','web/player.js'];
const caseInputs=[[1000,.5,1,false,'identical',false],[1000,.01,1,false,'identical',false],[100,.8,1,false,'identical',false],[5000,.8,1,false,'identical',false],
  [1000,.5,1,true,'identical',false],[1000,.01,1.5,true,'identical',false],[1000,.1,1.5,true,'identical',false],[1000,.5,1.5,true,'identical',false],
  [1000,.98,1.5,true,'identical',false],[1000,.98,2,true,'identical',false],[100,.8,1.5,true,'identical',false],[5000,.8,1.5,true,'identical',false],
  [1000,.5,1.5,true,'left-only',false],[1000,.98,1.5,true,'identical',true]];

async function nine(){
  const {summarizeCapture}=await import('../scripts/audio-signal.mjs');
  const order=suffixes.map(s=>({label:'f01obs-test-'+s,mode:s[0]}));
  const files=paths.map(path=>({path,sha256:'c'.repeat(64)}));
  const manifest={schema:1,prefix:'f01obs-test',order,tools:{frozen:{commit:'c5d45b8a7abf30450d3f1bbff45afbb8cd020cb5',inputSha256:'b'.repeat(64)},current:{commit:'a'.repeat(40),inputSha256:'d'.repeat(64)}},
    product:{files},environment:{platform:'linux',nodeVersion:'v24.19.0',nodeExecutableSha256:'e'.repeat(64),playwrightVersion:'1.62.1',browserExecutableSha256:'f'.repeat(64),sampleRate:48000},ci:{checkout:'a'.repeat(40),head:null}};
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
  return {manifest,records};
}

test('observer order fixes all nine positions and rejects unsafe or overflowing labels',async()=>{
  const {observerRunPlan}=await subject();
  assert.deepEqual(observerRunPlan('f01obs-test'),suffixes.map(s=>({label:'f01obs-test-'+s,mode:s[0]})));
  for(const prefix of ['', '../x','UPPER','a'.repeat(62)])assert.throws(()=>observerRunPlan(prefix));
});

test('nine-role assessment requires original shape and independent complete U/T PCM',async()=>{
  const {assessObserverRunSet}=await subject(),f=await nine();
  assert.deepEqual(assessObserverRunSet(f),{transportComplete:true,qualityPass:true,failures:[]});
  for(const mutate of [x=>x.records.pop(),x=>x.records.reverse(),x=>{x.records[1].report=null;},x=>{x.records[0].diagnostic={};},
    x=>{x.records[1].diagnostic.sourceCommit='b'.repeat(40);},x=>{x.records[1].diagnostic.traceEnabled=true;},
    x=>{x.records[2].diagnostic.captures[0].capture.channels[0][0]=.1;},x=>{x.records[1].diagnostic.shutdown.browserDisconnected=false;},
    x=>{x.records[0].report.artifact.files[0].sha256='b'.repeat(64);},x=>{x.records[0].report.browser='other';},
    x=>{x.records[1].diagnostic.nodeVersion='v25.0';},x=>{x.manifest.tools.frozen.commit='b'.repeat(40);},x=>{x.manifest.ci.checkout='b'.repeat(40);},
    x=>{x.records[0].report.cases[0].frequency=750;},x=>{x.records[0].report.cases[0].gain=2;},x=>{x.records[0].report.cases[0].enabled=0;},
    x=>{x.records[0].report.transitions[0].value=2;},x=>{x.records[0].report.alignments[0].sampleRate=11025;},
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
  assert.deepEqual(assessObserverRunSet(fixture),{transportComplete:true,qualityPass:false,failures:[row.label+'/48000/delay-alignment']});
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

for(const expiry of ['prepare','child-timeout','last-attestation','evidence','publication'])test(`whole observer deadline rejects expiry during ${expiry}`,async()=>{
  const fs=require('node:fs/promises'),path=require('node:path'),{isDeepStrictEqual}=require('node:util'),api=await subject();
  const {validateQualityEvidence}=await import('../scripts/audio-quality-diagnostics.mjs'),fixture=await nine(),saved=new Map();
  const repositoryRoot=path.resolve('memory-current'),frozenRoot=path.resolve('memory-frozen');let elapsed=0,count=0,advanced=false;
  const expire=()=>{if(!advanced){elapsed=1201000;advanced=true;}};
  const makeFiles=root=>({root,lstat:async name=>{if(expiry==='evidence'&&count===9&&name.endsWith('-report.json'))expire();return saved.has(name)?{isFile:()=>true}:null;},
    resolve:async name=>path.join(root,name),ensureDirectory:async name=>path.join(root,name),
    writeFile:async(name,data)=>{saved.set(name,data);if(expiry==='publication'&&name.endsWith('/result.json'))expire();},
    readFile:async name=>saved.get(name)??Buffer.from('fixed tracked bytes')});
  const files=makeFiles(repositoryRoot),frozen=makeFiles(frozenRoot);
  const identities={current:{...fixture.manifest.tools.current,lockSha256:'1'.repeat(64)},frozen:{...fixture.manifest.tools.frozen,lockSha256:'1'.repeat(64)}};
  const boundaries={path,isDeepStrictEqual,observerRunPlan:api.observerRunPlan,observerEvidencePaths:api.observerEvidencePaths,
    executeObserverSequence:api.executeObserverSequence,assessObserverRunSet:api.assessObserverRunSet,validateQualityEvidence,
    repositoryRoot,frozenCommit:'c5d45b8a7abf30450d3f1bbff45afbb8cd020cb5',process:{platform:'linux',version:'v24.19.0',execPath:path.resolve('memory-node'),env:{}},
    Date:{now:()=>elapsed},need:(value,code)=>{if(!value)throw Error(code);},record:value=>value,fs:{mkdir:async()=>{}},
    ownedRoot:async root=>root===repositoryRoot?files:frozen,sourceIdentity:async root=>{
      if(expiry==='prepare'||expiry==='last-attestation'&&count===9)expire();return identities[root===files?'current':'frozen'];},
    execFileSync:()=>Buffer.from('fixed tracked bytes'),sha:()=> '2'.repeat(64),hashFile:async()=> '3'.repeat(64),
    browserExecutable:async()=>{if(expiry==='child-timeout')elapsed=1180000;return path.resolve('memory-browser');},productIdentity:async()=>fixture.manifest.product.files,profiles:async()=>[],
    executeObserverChild:async options=>{count++;if(expiry==='child-timeout'){
      assert.equal(options.timeoutMs,20000);elapsed+=21000;
      return{exitCode:null,signal:'SIGTERM',timedOut:true,overflow:false,closeConfirmed:false,errors:['child-stop-sentinel']};
    }elapsed+=119000;return{exitCode:0,signal:null,timedOut:false,overflow:false,closeConfirmed:true,errors:[]};},
    boundedJSON:async(_root,name)=>Buffer.from(JSON.stringify(name.includes('-diagnostic.json')?fixture.records[count-1].diagnostic:fixture.records[count-1].report))};
  const source=await fs.readFile('scripts/audio-observer-isolation.mjs','utf8'),original=source.slice(source.indexOf('export async function runObserverIsolation')).replace(/^export /,'');
  const io=source.match(/^async function readWithin.*$/m)?.[0]||'';
  const run=new Function('boundaries',`with(boundaries){${io};return (${original});}`)(boundaries);
  let result,error;try{result=await run({frozenRoot,prefix:'f01obs-test'});}catch(cause){error=cause;}
  assert.ok(error||result?.transportComplete===false,'expired host must reject or report incomplete');
  assert.notEqual(result?.qualityPass,true);assert.ok(elapsed>=1200000);
  if(expiry==='prepare')assert.equal(count,0);else if(expiry==='child-timeout'){
    assert.equal(count,1);const actual=JSON.parse(saved.get('output/audio-observer/f01obs-test/result.json')).records[0];
    assert.equal(actual.signal,'SIGTERM');assert.equal(actual.timedOut,true);assert.ok(actual.errors.includes('child-stop-sentinel'));
  }else{assert.equal(count,9);if(expiry==='last-attestation')assert.equal(JSON.parse(saved.get('output/audio-observer/f01obs-test/result.json')).records.at(-1).exitCode,0);}
});
