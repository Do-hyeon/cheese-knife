const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const subject=()=>import('../scripts/audio-quality-diagnostics.mjs');

async function traceFixture(){
  const {installQualityTrace}=await subject();let calls=0,throwNext=false,lastResult;const sentinel=Error('native-sentinel'),nodes=[];
  const context={get currentTime(){throw Error('unexpected-clock-read');},createGain(){
    assert.equal(this,context);const gain={value:1};
    for(const name of ['cancelScheduledValues','setValueAtTime','linearRampToValueAtTime'])gain[name]=function(...args){
      assert.equal(this,gain);assert.equal(trace.snapshot().events.length,Math.min(calls,4096),'native must run before a diagnostic record');
      calls++;if(throwNext){throwNext=false;throw sentinel;}return lastResult={receiver:this,args};
    };
    const node={gain};nodes.push(node);return node;
  }};
  const window={__quality:{context}};vm.runInNewContext('('+installQualityTrace.toString()+')()',{window,Symbol,Float64Array});
  const trace=window[Symbol.for('cheese-knife.quality-trace')];
  return {context,trace,nodes,sentinel,calls:()=>calls,result:()=>lastResult,throwNext:()=>{throwNext=true;}};
}
test('quality trace preserves native receiver arguments return and original throw without reading a clock',async()=>{
  const f=await traceFixture(),nodes=Array.from({length:8},()=>f.context.createGain());
  assert.equal(nodes[0],f.nodes[0]);const param=nodes[0].gain;
  const result=param.setValueAtTime(0.5,10);assert.equal(result,f.result());assert.equal(result.receiver,param);assert.deepEqual(result.args,[0.5,10]);
  assert.equal(f.trace.snapshot().events.length,1);assert.equal(f.trace.snapshot().nodeCount,8);
  assert.equal(param.cancelScheduledValues(12),f.result());assert.equal(f.trace.snapshot().events[1].value,null);assert.equal(f.trace.snapshot().events[1].time,12);
  f.throwNext();assert.throws(()=>param.linearRampToValueAtTime(1,11),error=>error===f.sentinel);
  assert.equal(f.trace.snapshot().events.length,2,'native throw never invents a successful reservation');
});
test('trace capacity never prevents native call4097 and reports truncation',async()=>{
  const f=await traceFixture(),nodes=Array.from({length:8},()=>f.context.createGain());
  for(let i=0;i<4097;i++)nodes[0].gain.setValueAtTime(1,i);
  assert.equal(f.calls(),4097);const snapshot=f.trace.snapshot();assert.equal(snapshot.events.length,4096);
  assert.equal(snapshot.truncated,true);assert.equal(snapshot.complete,false);
});
test('post-native diagnostic coercion failure cannot change the native result',async()=>{
  const f=await traceFixture(),nodes=Array.from({length:8},()=>f.context.createGain());
  const value={valueOf(){throw Error('diagnostic-coercion');}};
  const result=nodes[0].gain.setValueAtTime(value,1);assert.equal(result.args[0],value);assert.equal(f.calls(),1);
  assert.equal(f.trace.snapshot().complete,false);
});
test('unknown gain graph is incomplete rather than assigned invented roles',async()=>{
  const f=await traceFixture();for(let i=0;i<9;i++)f.context.createGain();
  assert.equal(f.trace.snapshot().complete,false);assert.equal(f.trace.snapshot().nodeCount,9);
});
test('trace environment accepts only unset or the approved value before browser startup',async()=>{
  const {qualityTraceMode}=await subject();assert.equal(qualityTraceMode(undefined),false);assert.equal(qualityTraceMode('1'),true);
  for(const input of ['', '0','true','2'])assert.throws(()=>qualityTraceMode(input),/audio-quality-trace-invalid/);
});

async function evidenceFixture(label='set-u1',instrumented=false){
  const {createQualityDiagnostics}=await subject(),{summarizeCapture}=await import('../scripts/audio-signal.mjs');
  const collector=createQualityDiagnostics({label,trace:instrumented}),transitions=[],actions=[];
  let frame=1000;
  for(const frequency of [250,750,1000])for(const [kind,value]of [['gain',1.5],['gain',2],['gain',0],['gain',1],['enabled',false],['enabled',true]]){
    const row={frequency,kind,value};
    for(const [phase,a,b]of [['before',-80,-40],['change',-20,40],['after',100,140]]){
      const capture={rate:1000,start:frame+a,end:frame+b,channels:[Array(b-a).fill(0.25),Array(b-a).fill(0.25)]};
      if(kind==='enabled')assert.equal(collector.retainCapture(capture,{frequency,value,frame},phase),capture,'capture passthrough identity');
      row[phase]=summarizeCapture(capture);
    }
    if(kind==='enabled')actions.push({frame,afterFrame:frame+1});
    transitions.push(row);frame+=1000;
  }
  const signal=transitions[0].before,stress=summarizeCapture({rate:1000,start:0,end:40,channels:[Array(40).fill(0.98),Array(40).fill(0.98)]});
  const artifact={label,root:'/synthetic/source',files:['media-profiles.js','config.js','web/runtime.js','web/site-adapter.js','web/audio.js','web/player.js'].map(path=>({path,sha256:'c'.repeat(64)}))};
  const metadata={artifact,sourceCommit:'a'.repeat(40),pullRequestHead:null,platform:'linux',nodeVersion:'v24.19.0',browserVersion:'151.0',sampleRate:1000,
    audioConfig:{audioDefault:false,audioGain:1},wanted:true,state:'on',error:null,actions,
    trace:{complete:true,truncated:false,error:null,nodeCount:8,gains:Array(8).fill(1),events:instrumented?[{node:0,method:'setValueAtTime',value:1,time:1}]:[]},
    shutdown:{kind:'playwright',browserCloseAcknowledged:true,browserDisconnected:true}};
  const report={artifact,browser:'151.0',nodes:{sources:1,sampleRate:1000,compressor:[]},cases:Array.from({length:14},()=>({frequency:250,inputAmplitude:0.25,gain:1,enabled:true,stereo:'identical',bursts:false,...signal})),
    transitions,alignments:Array.from({length:12},(_,i)=>({sampleRate:8000+i,expectedFrame:0,dryFirst:0,dryLast:0,compressorFirst:0,compressorLast:0})),stress:{profile:'fixture',...stress},qualityFailures:[]};
  return {collector,metadata,report,diagnostic:collector.buildReport(metadata)};
}
test('collector keeps exactly six master transitions and independently checkable two-channel PCM',async()=>{
  const f=await evidenceFixture();assert.equal(f.diagnostic.complete,true);assert.equal(f.diagnostic.captures.length,18);
  assert.equal(f.diagnostic.captures[0].capture.channels[0][0],0.25);assert.equal(f.diagnostic.trace.events.length,0);
  const independent=await evidenceFixture('other-u1');assert.notEqual(independent.diagnostic.captures,f.diagnostic.captures);
});
test('malformed missing holed and nonfinite PCM cannot become complete diagnostics',async()=>{
  const {createQualityDiagnostics}=await subject(),f=await evidenceFixture();
  assert.equal(createQualityDiagnostics({label:'empty-u1',trace:false}).buildReport(f.metadata).complete,false);
  for(const mutate of [c=>{c.channels.pop();},c=>{delete c.channels[0][2];},c=>{c.channels[0][2]=NaN;},c=>{c.end++;},c=>{c.channels[1].pop();}]){
    const broken=await evidenceFixture();mutate(broken.diagnostic.captures[0].capture);
    assert.equal(broken.collector.buildReport(broken.metadata).complete,false);
  }
  for(const trace of [null,{...f.metadata.trace,truncated:true},{...f.metadata.trace,nodeCount:7},{...f.metadata.trace,events:[{node:0,method:'setValueAtTime',time:NaN,value:1}]}]){
    assert.equal(f.collector.buildReport({...f.metadata,trace}).complete,false);
  }
});
test('diagnostic writes use exact owned paths, reject preexisting evidence and enforce the eight-MiB ceiling',async t=>{
  const {qualityOutputPaths,writeQualityDiagnostic}=await subject(),{openOwnedRoot}=await import('../scripts/owned-files.mjs');
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quality-diag-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const files=await openOwnedRoot(root);await files.ensureDirectory('output/audio-quality');
  assert.deepEqual(qualityOutputPaths('run-u1'),{report:'output/audio-quality/report-run-u1.json',diagnostic:'output/audio-quality/report-run-u1-diagnostic.json'});
  assert.equal(qualityOutputPaths('source').diagnostic,'output/audio-quality/report-diagnostic.json');
  for(const label of ['../escape','A','a'.repeat(65)])assert.throws(()=>qualityOutputPaths(label),/audio-label-invalid/);
  const f=await evidenceFixture();await writeQualityDiagnostic(files,qualityOutputPaths('run-u1').diagnostic,f.diagnostic);
  await assert.rejects(writeQualityDiagnostic(files,qualityOutputPaths('run-u1').diagnostic,{changed:true}),{code:'EEXIST'});
  assert.equal(JSON.parse(await files.readFile(qualityOutputPaths('run-u1').diagnostic,'utf8')).complete,true);
  await assert.rejects(writeQualityDiagnostic(files,qualityOutputPaths('large-u1').diagnostic,{data:'x'.repeat(8*1024*1024)}),/audio-quality-diagnostic-size/);
  assert.equal(await files.lstat(qualityOutputPaths('large-u1').diagnostic,{optional:true}),null);
});
test('ordered six-run assessment recomputes quality and PCM instead of trusting pass fields',async()=>{
  const {assessQualityRunSet}=await subject(),expectedLabels=['set-u1','set-t1','set-u2','set-t2','set-u3','set-t3'];
  const records=[];for(const label of expectedLabels){const f=await evidenceFixture(label,label.includes('-t'));records.push({label,exitCode:0,report:f.report,diagnostic:f.diagnostic});}
  assert.deepEqual(assessQualityRunSet({expectedLabels,records}),{complete:true,failures:[]});
  for(const mutate of [rows=>{rows.pop();},rows=>{rows.reverse();},rows=>{rows[0].exitCode=1;},rows=>{rows[0].report=null;},
    rows=>{rows[0].diagnostic.complete=false;},rows=>{rows[0].diagnostic.sourceCommit='b'.repeat(40);},rows=>{rows[0].diagnostic.traceEnabled=true;},
    rows=>{rows[0].diagnostic.captures[0].capture.channels[0][0]=0.3;},rows=>{rows[0].report.transitions[4].change.channels[0].maxAdjacentStep=0.2;},
    rows=>{rows[0].report.qualityFailures=['invented'];},rows=>{rows[0].report.cases.pop();},rows=>{rows[0].diagnostic.shutdown.browserDisconnected=false;}]){
    const broken=structuredClone(records);mutate(broken);assert.equal(assessQualityRunSet({expectedLabels,records:broken}).complete,false);
  }
});

test('preflight rejects existing reports and invalid environment before touching a browser',async t=>{
  const {prepareQualityRun}=await subject(),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const {openOwnedRoot}=await import('../scripts/owned-files.mjs'),root=await fs.mkdtemp(path.join(os.tmpdir(),'quality-preflight-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));const files=await openOwnedRoot(root);
  await assert.rejects(prepareQualityRun({lstat(){throw Error('filesystem-touched');}},'run-u1','0'),/audio-quality-trace-invalid/);
  const first=await prepareQualityRun(files,'run-u1',undefined);assert.equal(first.trace,false);
  await files.ensureDirectory('output/audio-quality');await files.writeFile(first.paths.report,'original',{flag:'wx'});
  await assert.rejects(prepareQualityRun(files,'run-u1',undefined),/audio-quality-output-exists/);
  assert.equal(await files.readFile(first.paths.report,'utf8'),'original');
});

test('six-run orchestration executes every real child despite failure, isolates trace env and reads only twelve owned files',async t=>{
  const {runQualityRunSet,qualityOutputPaths}=await subject(),{openOwnedRoot}=await import('../scripts/owned-files.mjs');
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quality-set-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const files=await openOwnedRoot(root);await files.ensureDirectory('output/audio-quality');
  const calls=[];const result=await runQualityRunSet({files,prefix:'fixture',execute:async({label,env})=>{
    const f=await evidenceFixture(label,label.includes('-t')),paths=qualityOutputPaths(label);
    await files.writeFile(paths.report,JSON.stringify(f.report),{flag:'wx'});await files.writeFile(paths.diagnostic,JSON.stringify(f.diagnostic),{flag:'wx'});
    const child=spawnSync(process.execPath,['-e',`process.stdout.write(process.env.KNIFE_AUDIO_QUALITY_TRACE??'unset');process.exit(${label==='fixture-u1'?1:0});`],{env,encoding:'utf8'});
    calls.push([label,child.stdout]);return child.status;
  }});
  assert.deepEqual(calls,[['fixture-u1','unset'],['fixture-t1','1'],['fixture-u2','unset'],['fixture-t2','1'],['fixture-u3','unset'],['fixture-t3','1']]);
  assert.equal(result.complete,false);assert.ok(result.failures.some(value=>value.startsWith('fixture-u1/')));
  assert.equal(result.paths.length,12);assert.equal(new Set(result.paths).size,12);
  assert.equal(result.paths.some(value=>value.includes('profile')),false);
  assert.deepEqual((await files.readdir('output/audio-quality')).sort(),result.paths.map(value=>path.posix.basename(value)).sort());
});
test('six successful child exits without reports never pass and do not stop later observations',async()=>{
  const {runQualityRunSet}=await subject();let calls=0;
  const result=await runQualityRunSet({files:{root:process.cwd(),async readFile(){throw Error('missing');}},prefix:'absent',execute:async()=>{calls++;return 0;}});
  assert.equal(calls,6);assert.equal(result.complete,false);
  await assert.rejects(runQualityRunSet({files:{root:process.cwd()},prefix:'x'.repeat(62),execute:async()=>{throw Error('must-not-execute');}}),/audio-label-invalid/);
});

test('actual runner teardown retains original quality error when close and evidence write also fail',async()=>{
  const fs=require('node:fs/promises'),source=(await fs.readFile('scripts/check-audio-quality.mjs','utf8')).replaceAll('\r\n','\n');
  const start=source.indexOf('let diagnosticFailure=null;'),end=source.indexOf('try {\nconst measurement=',start);
  const footer=source.slice(source.indexOf("}catch(error){diagnosticError('quality',error);}"));
  assert.ok(start>0&&end>start&&footer.length>0);
  const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
  const run=new AsyncFunction('primary','measurement','browser','writeQualityDiagnostic','files','diagnosticRun','diagnosticEvidence','diagnosticPage','console',
    source.slice(start,end)+'\ntry{try{if(primary)throw primary;\n'+footer+'\nreturn diagnosticEvidence;');
  const quality=Error('original-quality'),close=Error('close-failed'),write=Error('write-failed');
  for(const primary of [quality,null]){
    const f=await evidenceFixture(),logs=[];
    await assert.rejects(run(primary,null,{async close(){throw close;}},async()=>{throw write;},{async ensureDirectory(){}},
      {collector:f.collector,paths:{diagnostic:'unused'}},f.metadata,{async evaluate(){return {};}},{error:value=>logs.push(JSON.parse(value))}),
      error=>error===(primary??close));
    assert.equal(logs.length,1);assert.deepEqual(logs[0].secondaryErrors,primary?['close:close-failed','diagnostic-write:write-failed']:['diagnostic-write:write-failed']);
  }
  for(const native of [false,true]){
    const f=await evidenceFixture();let written;
    const result=await run(null,native?{async close(){return {browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true};}}:null,
      {async close(){},isConnected(){return false;}},async(_files,_path,diagnostic)=>{written=diagnostic;},{async ensureDirectory(){}},
      {collector:f.collector,paths:{diagnostic:'unused'}},f.metadata,{async evaluate(){return {};}},{error(){throw Error('unexpected-log');}});
    assert.equal(written.complete,true);assert.equal(result.shutdown.kind,native?'windows-native':'playwright');
    assert.equal(Object.hasOwn(result.shutdown,'ownedRootClosed'),native);
  }
});

test('CI upload paths exactly match the executable six-run set rather than uploading profiles or broad output',async()=>{
  const fs=require('node:fs/promises'),workflow=(await fs.readFile('.github/workflows/ci.yml','utf8')).replaceAll('\r\n','\n');
  const block=workflow.split('      - name: Upload exact synthetic audio evidence\n')[1].split('      - name: Upload E2E failure artifacts')[0];
  const entries=block.split('          path: |\n')[1].split('          if-no-files-found:')[0].trim().split('\n').map(value=>value.trim()
    .replaceAll('${{ github.run_id }}','123').replaceAll('${{ github.run_attempt }}','4'));
  const {qualityOutputPaths}=await subject();
  assert.deepEqual(entries,['u1','t1','u2','t2','u3','t3'].flatMap(suffix=>Object.values(qualityOutputPaths('f01ci-123-4-'+suffix))));
  assert.equal(entries.some(value=>value.includes('*')||value.includes('profile')),false);
});

test('actual quality window extraction rejects missing right-channel coverage instead of manufacturing zero samples',async()=>{
  const fs=require('node:fs/promises'),source=(await fs.readFile('scripts/check-audio-quality.mjs','utf8')).replaceAll('\r\n','\n');
  const start=source.indexOf('const windowSamples='),end=source.indexOf('  const cases=[];',start);
  assert.ok(start>0&&end>start);
  const chunks=[{frame:0,samples:[new Float32Array(128).fill(0.25),new Float32Array(128).fill(0.25)]}];
  const page={async evaluate(fn,args){return vm.runInNewContext('('+fn.toString()+')('+JSON.stringify(args)+')',{window:{__quality:{context:{sampleRate:1000},chunks}},Float32Array,Uint8Array});}};
  const run=new (Object.getPrototypeOf(async()=>{}).constructor)('page',source.slice(start,end)+'return windowSamples;');
  const samples=await run(page);assert.equal((await samples(0,128)).channels[1][0],0.25);
  chunks[0].samples.pop();await assert.rejects(samples(0,128),/Incomplete stereo audio capture window/);
});
