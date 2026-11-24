const test=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const load=()=>import('../scripts/extension-e2e/chromium-diagnostic-startup.mjs');
const nonce='a'.repeat(64),node='C:\\runtime\\node.exe',entry='C:\\fixed\\startup.mjs';
const frame={type:'origin',nonce,elapsedMs:225};
const environment={SystemRoot:'C:\\Windows',windir:'C:\\Windows',Path:'C:\\Windows\\System32',CK_STARTUP_NONCE:nonce};
const input=(...chunks)=>Readable.from(chunks.map(chunk=>Buffer.from(chunk)));
const line=value=>JSON.stringify(value)+'\n';
test('parent origin charges pre-spawn time and IPC wait against one launch deadline',async()=>{
  const {translateDiagnosticStart}=await load();
  assert.equal(translateDiagnosticStart(42,67,frame,nonce),-183);
  assert.throws(()=>translateDiagnosticStart(42,149817,frame,nonce),/diagnostic-startup-deadline/);
  for(const message of [{...frame,elapsedMs:-1},{...frame,elapsedMs:150000},{...frame,nonce:'b'.repeat(64)},{...frame,another:0}])
    assert.throws(()=>translateDiagnosticStart(42,67,message,nonce),/diagnostic-startup-origin/);
});
test('bootstrap rejects inherited preload/log/inspector state and extra argv before READY',async()=>{
  const {runDiagnosticStartupProbe}=await load();
  for(const change of [{env:{...environment,NODE_OPTIONS:'--require=unsafe'}},{env:{...environment,DEBUG_FILE:'outside'}},
    {env:{...environment,npm_config_pwdebug:'1'}},{argv:[node,entry,'--live']},{execArgv:['--require','outside']}])
    await assert.rejects(runDiagnosticStartupProbe({env:environment,argv:[node,entry],execArgv:[],node,entry,input:input(line(frame)),
      emit:()=>assert.fail('must not emit READY'),bind:()=>assert.fail('must not bind'),...change}),/diagnostic-startup-selection/);
});
test('startup probe rejects duplicate or unbounded parent frames and never binds them',async()=>{
  const {runDiagnosticStartupProbe}=await load();
  for(const wire of [input(line(frame),line(frame)),input('x'.repeat(300)),input(JSON.stringify(frame))]){
    let events=[];
    await assert.rejects(runDiagnosticStartupProbe({env:environment,argv:[node,entry],execArgv:[],node,entry,input:wire,
      now:()=>42,emit:value=>events.push(value.type),bind:()=>assert.fail('must not bind')}),/diagnostic-startup-frame/);
    assert.deepEqual(events,['ready']);
  }
});
test('one parent handshake binds the original clock and holds before a browser launch',async()=>{
  const {runDiagnosticStartupProbe}=await load(),events=[];let now=42,bindings=0;
  const result=await runDiagnosticStartupProbe({env:environment,argv:[node,entry],execArgv:[],node,entry,input:input(line(frame)),
    now:()=>now,emit:value=>{events.push(value);now=67;},
    bind:async started=>{bindings++;assert.equal(started,-183);return {started};}});
  assert.equal(bindings,1);
  assert.deepEqual(events,[{type:'ready',nonce}]);
  assert.deepEqual(result,{type:'hold',nonce,reason:'download-before-file-init-unproved',started:-183,elapsedMs:250,chromiumLaunches:0});
});
