// 제품 루트에서 의존성 설치 후 node --test tests/audio-quality-diagnostics.test.cjs 로 합성 러너의 증거 계약을 검사한다.
// 임시 진단 파일을 생성·정리하며, 실패한 조건은 TAP 결과에 표시한다.
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const subject=()=>import('../scripts/audio-quality-diagnostics.mjs');

test('합성 context는 고정 주소에만 원바이트를 공급하고 native 호출과 Blob 수명을 보존한다',async()=>{
  const {registerQualityWorklet}=await subject(),bytes=[0xff,0x80,0x00,0x41];
  const url='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/web/audio-transition-worklet.js';
  const sentinel=Error('native'),options={credentials:'omit'},calls=[],revoked=[],blobs=[];
  let registered,nativeResult,mode='ok';
  const worklet={addModule(...args){
    calls.push({receiver:this,args});
    if(mode==='throw')throw sentinel;
    return nativeResult=mode==='reject'?Promise.reject(sentinel):Promise.resolve();
  }};
  const window={__quality:{context:{audioWorklet:worklet}},[Symbol.for('cheese-knife.runtime.v1')]:{audio:{prepareTransitionModule(value){registered=value;}}}};
  const URL={createObjectURL(blob){blobs.push(blob);return 'blob:test-'+blobs.length;},revokeObjectURL(value){revoked.push(value);}};
  vm.runInNewContext('('+registerQualityWorklet.toString()+')(bytes)',{window,bytes,URL,Blob,Uint8Array});
  assert.equal(registered,url);
  const other={};
  for(const [receiver,request] of [[worklet,url+'?other'],[other,url],[worklet,url]]){
    const promise=worklet.addModule.call(receiver,request,options);
    assert.equal(promise,nativeResult);
    const last=calls.at(-1);assert.equal(last.receiver,receiver);assert.equal(last.args[1],options);
    assert.equal(last.args[0],receiver===worklet&&request===url?'blob:test-1':request);
    await promise;
  }
  assert.equal(blobs.length,1);assert.equal(blobs[0].type,'text/javascript');
  assert.deepEqual([...new Uint8Array(await blobs[0].arrayBuffer())],bytes);
  assert.deepEqual(revoked,['blob:test-1']);
  mode='reject';const rejected=worklet.addModule(url);
  assert.equal(rejected,nativeResult);await assert.rejects(rejected,error=>error===sentinel);
  mode='throw';assert.throws(()=>worklet.addModule(url),error=>error===sentinel);
  assert.deepEqual(revoked,['blob:test-1','blob:test-2','blob:test-3']);
});

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
test('Worklet 진단은 원바이트 SHA를 남기고 옛 GainNode 역할을 확정하지 않는다',async()=>{
  const {validateQualityEvidence}=await subject(),f=await evidenceFixture(),hash='c'.repeat(64);
  const diagnostic=f.collector.buildReport({...f.metadata,workletSha256:hash});
  assert.equal(diagnostic.workletSha256,hash);assert.deepEqual(diagnostic.gainRoles,[]);
  assert.equal(diagnostic.complete,false);assert.deepEqual(diagnostic.validationErrors,['diagnostic-gain-roles']);
  assert.throws(()=>validateQualityEvidence({...diagnostic,complete:true,gainRoles:f.diagnostic.gainRoles}),/diagnostic-gain-roles/);
  for(const invalid of [null,'',hash.slice(1),hash.toUpperCase(),hash.slice(1)+'\n']){
    assert.throws(()=>validateQualityEvidence({...diagnostic,workletSha256:invalid}),/diagnostic-worklet-hash/);
  }
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
  const {summarizeCapture}=await import('../scripts/audio-signal.mjs');
  const records=[];for(const label of expectedLabels){const f=await evidenceFixture(label,label.includes('-t'));require('./fixtures/audio-signed.cjs').installSignedFixture(f,summarizeCapture);records.push({label,exitCode:0,report:f.report,diagnostic:f.diagnostic});}
  const result=assessQualityRunSet({expectedLabels,records});
  assert.deepEqual(result,{complete:true,transportComplete:true,qualityPass:true,failures:[],legacy:result.legacy,supplementary:result.supplementary});
  assert.equal(result.legacy.length,6);assert.equal(result.supplementary.length,6);assert.ok(result.supplementary.every(row=>row.status==='passed'&&row.transitions.length===18));
  const first=records[0],second=records[1],hash='a'.repeat(64);
  function marked(item,reported,diagnosed){
    const nodes={...item.report.nodes},diagnostic={...item.diagnostic,complete:false};
    if(reported!==undefined)nodes.workletSha256=reported;
    if(diagnosed!==undefined)diagnostic.workletSha256=diagnosed;
    return {...item,report:{...item.report,nodes},diagnostic};
  }
  for(const [reported,diagnosed,expected] of [[hash,undefined,'quality-run-worklet-hash'],[undefined,hash,'quality-run-worklet-hash'],
    [hash,'b'.repeat(64),'quality-run-worklet-hash'],['bad',hash,'diagnostic-worklet-hash'],[null,null,'diagnostic-worklet-hash']]){
    const mismatch=marked(first,reported,diagnosed);
    assert.ok(assessQualityRunSet({expectedLabels,records:[mismatch,...records.slice(1)]}).failures.includes(first.label+'/'+expected));
  }
  for(const otherHash of [undefined,'b'.repeat(64)]){
    const updated=[marked(first,hash,hash),marked(second,otherHash,otherHash),...records.slice(2)];
    assert.ok(assessQualityRunSet({expectedLabels,records:updated}).failures.includes(second.label+'/quality-run-worklet-drift'));
  }
  for(const mutate of [rows=>{rows.pop();},rows=>{rows.reverse();},rows=>{rows[0].exitCode=1;},rows=>{rows[0].report=null;},
    rows=>{rows[0].diagnostic.complete=false;},rows=>{rows[0].diagnostic.sourceCommit='b'.repeat(40);},rows=>{rows[0].diagnostic.traceEnabled=true;},
    rows=>{rows[0].diagnostic.captures[0].capture.channels[0][0]=0.3;},rows=>{rows[0].report.transitions[4].change.channels[0].maxAdjacentStep=0.2;},
    rows=>{rows[0].report.transitions[0].kind='unknown';},rows=>{rows[0].report.transitions[0].value=1.7;},
    rows=>{rows[0].report.qualityFailures=['invented'];},rows=>{rows[0].report.cases.pop();},rows=>{rows[0].diagnostic.shutdown.browserDisconnected=false;}]){
    const broken=structuredClone(records);mutate(broken);assert.equal(assessQualityRunSet({expectedLabels,records:broken}).complete,false);
  }
});

for(const mutation of ['right-zero','absolute','no-change'])test('six-run consumer rejects signed '+mutation+' even with matching summaries',async()=>{
  const {assessQualityRunSet}=await subject(),{summarizeCapture}=await import('../scripts/audio-signal.mjs');
  const expectedLabels=['set-u1','set-t1','set-u2','set-t2','set-u3','set-t3'],records=[];
  for(const label of expectedLabels){const f=await evidenceFixture(label,label.includes('-t'));require('./fixtures/audio-signed.cjs').installSignedFixture(f,summarizeCapture);records.push({label,exitCode:0,report:f.report,diagnostic:f.diagnostic});}
  const item=records[0];for(const row of item.diagnostic.captures){const c=row.capture;
    if(mutation==='right-zero')c.channels[1].fill(0);
    if(mutation==='absolute')c.channels=c.channels.map(channel=>channel.map(Math.abs));
    if(mutation==='no-change'&&row.phase==='change'){const amplitude=row.transition.value?.36:.35;c.channels=c.channels.map(channel=>channel.map((_,i)=>amplitude*Math.sin(2*Math.PI*((c.start+i)%(48000/row.transition.frequency))/(48000/row.transition.frequency))));}
    item.report.transitions.find(t=>t.kind==='enabled'&&t.frequency===row.transition.frequency&&t.value===row.transition.value)[row.phase]=summarizeCapture(c);
  }
  assert.equal(assessQualityRunSet({expectedLabels,records}).complete,false);
});
for(const method of ['setValueAtTime','linearRampToValueAtTime'])test('six-run consumer rejects additional master automation '+method,async()=>{
  const {assessQualityRunSet}=await subject(),{summarizeCapture}=await import('../scripts/audio-signal.mjs'),expectedLabels=['set-u1','set-t1','set-u2','set-t2','set-u3','set-t3'],records=[];
  for(const label of expectedLabels){const f=await evidenceFixture(label,label.includes('-t'));require('./fixtures/audio-signed.cjs').installSignedFixture(f,summarizeCapture);records.push({label,exitCode:0,report:f.report,diagnostic:f.diagnostic});}
  const trace=records[1].diagnostic.trace;trace.events.splice(3,0,{node:0,method,value:.5,time:trace.events[0].time+1/48000});
  const result=assessQualityRunSet({expectedLabels,records});assert.equal(result.transportComplete,true);assert.equal(result.complete,false);
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
    source.slice(start,end)+'\nlet calibrate;try{try{if(primary)throw primary;\n'+footer+'\nreturn diagnosticEvidence;');
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

// 각 fixture의 기대 프레임과 파형을 독립 생성한다. Worklet이나 조사한 브라우저의 데이터를 사용하지 않는다.
async function workletFixture(label){
  const traced=label.includes('-t'),f=await evidenceFixture(label,traced);
  const {summarizeCapture}=await import('../scripts/audio-signal.mjs');
  require('./fixtures/audio-signed.cjs').installSignedFixture(f,summarizeCapture);
  const d=f.diagnostic,proof=d.workletSigned={
    schema:'worklet-signed-v1',mode:traced?'T':'U',gainTraceInstalled:traced,registration:{attempts:1,successes:1,sha256:'e'.repeat(64)},firstOn:{sources:1,state:'running',on:true},wide:[],error:'',
  };
  d.workletSha256=f.report.nodes.workletSha256=proof.registration.sha256;
  d.complete=false;d.validationErrors=['diagnostic-gain-roles'];d.gainRoles=[];d.trace.events=[];
  const events=[];if(traced)proof.events=events;
  let seq=0,meter=0;
  for(const [i,action]of d.actions.entries()){
    const enabled=i%2===1,id=Math.floor(i/2)+1,source='blob:synthetic-'+id;
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
  return {label,exitCode:1,report:f.report,diagnostic:d};
}

test('CI의 여섯 역할 차단과 독립 signed 결과가 저장된 증거에서 함께 보존된다',async()=>{
  const {assessQualityRunSet}=await subject();
  const expectedLabels=['set-u1','set-t1','set-u2','set-t2','set-u3','set-t3'];
  const records=await Promise.all(expectedLabels.map(workletFixture));
  const assess=(first=records[0])=>assessQualityRunSet({expectedLabels,records:[first,...records.slice(1)],requireWorkletSigned:true});
  const result=assess();
  assert.deepEqual(result.failures,expectedLabels.map(label=>label+'/diagnostic-gain-roles'));
  assert.ok(!result.complete&&!result.transportComplete&&!result.qualityPass);
  assert.equal(result.supplementary.length,6);assert.ok(result.supplementary.every(row=>row.status==='passed'&&row.transitions.length===18));
  for(const mutate of [
    r=>{delete r.diagnostic.workletSigned;delete r.diagnostic.workletSha256;delete r.report.nodes.workletSha256;},
    r=>{delete r.diagnostic.workletSigned.mode;},r=>{r.diagnostic.gainRoles=['dry','wet','masterGain','headroom','compDry','compWet','compMix','normalizer'];},
    r=>{r.diagnostic.complete=true;},r=>{r.diagnostic.error='unexpected';},r=>{r.exitCode=0;},
    r=>{r.diagnostic.workletSigned.registration.successes=0;},r=>{r.diagnostic.workletSigned.registration.sha256='c'.repeat(64);},
    r=>{r.diagnostic.shutdown.browserDisconnected=false;},r=>{r.report.transitions[4].change.channels[0].peak=3;},
  ]){
    const first=structuredClone(records[0]);mutate(first);
    assert.equal(assess(first).supplementary.some(row=>row.label===first.label&&row.status==='passed'),false);
  }
  const numerical=structuredClone(records[0]);numerical.report.stress.channels[0].peak=.8;
  const {audioQualityFailures}=await import('../scripts/audio-metrics.mjs');
  numerical.report.qualityFailures=audioQualityFailures(numerical.report);
  numerical.diagnostic.error='Audio quality failed: '+numerical.report.qualityFailures.join(', ');
  assert.ok(assess(numerical).failures.includes(numerical.label+'/stress-channel-0/stress-peak-low'));
  assert.ok(assess(numerical).supplementary.some(row=>row.label===numerical.label&&row.status==='passed'));
  const legacy=assessQualityRunSet({expectedLabels,records});
  assert.equal(legacy.complete,false);assert.equal(legacy.supplementary.length,0);
});

test('수락·발신·완료의 이식과 순서 변경은 같은 프레임과 PCM에서도 실패한다',async()=>{
  const {assessWorkletSigned}=await import('../scripts/audio-worklet-signed.mjs');
  const {diagnostic,report}=await workletFixture('set-t1'),proof=diagnostic.workletSigned,original=proof.events;
  proof.gainTraceInstalled=false;assert.throws(()=>assessWorkletSigned(diagnostic,report.transitions),/worklet-registration/);
  proof.gainTraceInstalled=true;
  const start=original.findIndex(e=>e.type==='start'),on=original.findIndex((e,i)=>i>start&&e.type==='start');
  const after=(events,from,to)=>{const [event]=events.splice(from,1);events.splice(to,0,event);};
  for(const mutate of [
    e=>{e[start+1].id=2;},e=>{e[start+1].data.sourceEpoch++;},e=>{e[start+3].data.seq++;},
    e=>{e[start].source='blob:other';},e=>{e[start+5].source='blob:other';},e=>{e[start+1].data.wanted=true;},
    e=>{e[start+1].data.gain=1.5;},e=>{e[start+1].data.eq[2]=1;},e=>{e[start+1].data.dynamics=false;},
    e=>{e[start+1].data.normalizer=true;},e=>{e[start+1].data.targetDbfs=-22;},
    e=>{after(e,start+1,start+2);},e=>{after(e,on+1,on+3);},e=>{after(e,on+2,on+3);},
    e=>{e[on+2].data.frame+=128;e[on+4].data.frame+=128;},
    e=>{e.splice(start+4,1);},e=>{e[start+4].data.frame++;},e=>{e[start+3].data.frame+=1536;e[start+4].data.frame+=1536;},
    e=>{e.splice(start+2,0,structuredClone(e[start+1]));},e=>{e[start-1].data.kind='rejected';},
    e=>{e.splice(start-1,1);},e=>{e[start+1].data.kind='retire';},e=>{e[start+4].data.gain=null;},
    e=>{e.splice(start+4,0,{type:'processorerror',id:1});},e=>{e[start+4].data.meterEpoch++;},
    e=>{e[1].data.kind='completed';},e=>{e[start+3].data.code='error';},
    e=>{e[start+5].frame=e[start+4].data.frame;},e=>{e[1].data.frame=e[3].data.frame+128;},e=>{e[1].data.meterEpoch=1;},
  ]){
    const changed=structuredClone(original);mutate(changed);proof.events=changed;
    assert.throws(()=>assessWorkletSigned(diagnostic,report.transitions),/worklet-/);
  }
});

test('U에서는 포트 기록과 고정 창·중첩·오른쪽 채널의 변조를 거부한다',async()=>{
  const {assessWorkletSigned}=await import('../scripts/audio-worklet-signed.mjs');
  const {diagnostic,report}=await workletFixture('set-u1'),proof=diagnostic.workletSigned;
  proof.gainTraceInstalled=true;assert.throws(()=>assessWorkletSigned(diagnostic,report.transitions),/worklet-registration/);
  proof.gainTraceInstalled=false;
  proof.events=[];assert.throws(()=>assessWorkletSigned(diagnostic,report.transitions),/trace-mode/);delete proof.events;
  const wide=proof.wide[0];
  wide.end--;assert.throws(()=>assessWorkletSigned(diagnostic,report.transitions),/signed-samples|wide-window/);wide.end++;
  wide.channels[1][50]+=.1;assert.throws(()=>assessWorkletSigned(diagnostic,report.transitions),/wide-window/);wide.channels[1][50]=wide.channels[0][50];
  wide.channels[1][4000]+=.1;assert.equal(assessWorkletSigned(diagnostic,report.transitions).status,'failed');
});

test('U의 서로 다른 두 양자에서 같은 PCM이 나오면 수락점을 확정하지 않는다',async()=>{
  const {assessWorkletSigned}=await import('../scripts/audio-worklet-signed.mjs'),{summarizeCapture}=await import('../scripts/audio-signal.mjs');
  const {diagnostic:d,report}=await workletFixture('set-u1'),group=2,frame=d.actions[group].frame;
  const anchor=Math.ceil(frame/128)*128+1248,phase=(anchor+620)%640;
  const row=report.transitions.find(r=>r.frequency===750&&r.kind==='enabled'&&!r.value);
  const captures=d.captures.slice(3*group,3*group+3);
  for(const {capture,phase:name} of [...captures,{capture:d.workletSigned.wide[group],phase:'wide'}]){
    const samples=Array.from({length:capture.end-capture.start},(_,i)=>{
      const f=capture.start+i,w=Math.max(0,Math.min(1,(f-anchor)/480));
      return .35*Math.sin(2*Math.PI*(f%64)/64)+(f%640===phase?w*.001:0);
    });
    capture.channels=[samples,samples.slice()];if(name!=='wide')row[name]=summarizeCapture(capture);
  }
  const result=assessWorkletSigned(d,report.transitions);
  assert.equal(result.transitions.find(r=>r.frequency===750&&r.kind==='enabled'&&!r.value).reason,'signed-anchor-ambiguous');
});

test('역할 프로파일은 여섯 회의 제품 및 T 소유권을 재판정하고 원 수치와 signed 결과를 보존한다',async()=>{
  const {assessQualityRunSet}=await subject(),{roleFixture}=require('./fixtures/audio-worklet-roles.cjs');
  const expectedLabels=['set-u1','set-t1','set-u2','set-t2','set-u3','set-t3'];
  const records=await Promise.all(expectedLabels.map(workletFixture));
  for(const item of records){
    const d=item.diagnostic;item.exitCode=0;
    Object.assign(d,{roleProfile:true,complete:true,validationErrors:[],injectedMain:structuredClone(d.artifact.files)});
    if(d.traceEnabled){
      for(const event of d.workletSigned.events)if(event.source)event.source+='-'+d.label;
      d.roles=roleFixture(d.label,d.workletSigned.events[0].source,d.injectedMain,d.workletSha256);
    }
  }
  const d=records[0].diagnostic,identity={sourceCommit:d.sourceCommit,workletSha256:d.workletSha256,files:d.artifact.files};
  const assess=(values=records,expectedIdentity=identity)=>assessQualityRunSet({records:values,expectedLabels,requireWorkletRoles:true,expectedIdentity});
  const good=assess();assert.deepEqual(good.failures,[]);assert.ok(good.complete&&good.transportComplete&&good.qualityPass);
  for(const mutate of [
    d=>{d.shutdown.browserDisconnected=false;},d=>{d.artifact=structuredClone(d.artifact);d.artifact.files[0].sha256='0'.repeat(64);},
    d=>{delete d.roles;},d=>{delete d.injectedMain;},d=>{delete d.roles.registration.sha256;},
    d=>{d.roles=structuredClone(records[3].diagnostic.roles);},d=>{d.roles.graph=structuredClone(records[3].diagnostic.roles.graph);},
    d=>{d.roles.port=structuredClone(records[3].diagnostic.roles.port);},d=>{d.roles.mainSource=records[3].diagnostic.roles.mainSource;},
    d=>{d.injectedMain[0].sha256='9'.repeat(64);},d=>{d.sourceCommit='9'.repeat(40);},
  ]){
    const bad=structuredClone(records[1]);mutate(bad.diagnostic);const values=records.slice();values[1]=bad;
    const result=assess(values);assert.ok(!result.transportComplete&&!result.qualityPass&&!result.complete);
    assert.equal(result.supplementary.length,6);assert.equal(result.legacy.length,6);
  }
  for(const owner of [records[1],records[3]]){
    const bad=structuredClone(records[1]),roles=bad.diagnostic.roles;
    const later=owner.diagnostic.workletSigned.events.filter(event=>event.type==='create')[1].source;
    roles.source=roles.graph.source=roles.graph.sources[0].source=roles.port.source=later;
    const values=records.slice();values[1]=bad;
    const mixed=assess(values);assert.ok(!mixed.transportComplete&&!mixed.qualityPass);
    assert.equal(mixed.supplementary.length,6);assert.equal(mixed.legacy.length,6);
  }
  for(const expected of [null,{...identity,sourceCommit:'0'.repeat(40)},{...identity,workletSha256:'0'.repeat(64)},{...identity,files:[]}]){
    assert.equal(assess(records,expected).transportComplete,false);
  }
  const u=structuredClone(records[0]);u.diagnostic.roles=records[1].diagnostic.roles;
  assert.equal(assess([u,...records.slice(1)]).transportComplete,false);
  const signed=structuredClone(records[0]);signed.diagnostic.workletSigned.wide[0].channels[1][4000]+=.1;
  const failed=assess([signed,...records.slice(1)]);assert.ok(failed.transportComplete&&!failed.complete&&!failed.qualityPass);
  const low=structuredClone(records[0]);low.report.stress.channels[0].peak=.8;
  low.report.qualityFailures=(await import('../scripts/audio-metrics.mjs')).audioQualityFailures(low.report);
  low.diagnostic.error='Audio quality failed: '+low.report.qualityFailures.join(', ');low.exitCode=1;
  const numerical=assess([low,...records.slice(1)]);assert.ok(numerical.transportComplete&&!numerical.qualityPass);
});

test('기존 두 평가 모드는 signed 입력 예외가 발생한 회차의 수치 실패를 legacy에 보존한다',async()=>{
  const {assessQualityRunSet}=await subject(),{audioQualityFailures}=await import('../scripts/audio-metrics.mjs');
  const expectedLabels=['set-u1','set-t1','set-u2','set-t2','set-u3','set-t3'],label=expectedLabels[0];
  for(const requireWorkletSigned of [false,true]){
    const {diagnostic,report}=requireWorkletSigned?await workletFixture(label):await evidenceFixture(label);
    report.stress.channels[0].peak=.8;report.transitions[0].value=1.7;
    report.qualityFailures=audioQualityFailures(report);
    assert.ok(report.qualityFailures.includes('stress-channel-0/stress-peak-low'));
    diagnostic.error='Audio quality failed: '+report.qualityFailures.join(', ');
    const result=assessQualityRunSet({expectedLabels,records:[{label,diagnostic,report,exitCode:1}],requireWorkletSigned});
    assert.deepEqual(result.legacy[0].failures,report.qualityFailures);
    assert.deepEqual(result.failures.filter(value=>value.startsWith(label+'/')),[
      ...(requireWorkletSigned?[label+'/diagnostic-gain-roles']:[]),label+'/signed-transition-input',
    ]);
  }
});
