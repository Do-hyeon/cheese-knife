const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fixture = require('./native-preflight-fixture.cjs');
const subject = () => import('../scripts/extension-e2e/native-profile.mjs');

test('prelaunch query rejects an unquoted extension path at end, space or list delimiter',async t=>{
  if(process.platform!=='win32')return t.skip('PowerShell fixture requires Windows');
  const {queryWindowsProcesses}=await subject(),profile=path.resolve('output/synthetic-profile'),extensionPath=path.resolve('output/synthetic-dist');
  const invokeWith=commandLine=>(exe,args,options)=>{
    const script=Buffer.from(args.at(-1),'base64').toString('utf16le');
    const input=Buffer.from(JSON.stringify([{ProcessId:42,CommandLine:commandLine}])).toString('base64');
    const shim=`$taskSynthetic=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))); function Get-CimInstance { $taskSynthetic }; `;
    return execFileSync(exe,[...args.slice(0,-1),Buffer.from(shim+script,'utf16le').toString('base64')],{...options,input,stdio:['pipe','pipe','pipe']});
  };
  for(const [command,conflict] of [
    [`chrome.exe --load-extension=${extensionPath}`,true],
    [`chrome.exe --load-extension=${extensionPath} --type=renderer`,true],
    [`chrome.exe --load-extension=C:\\another,${extensionPath.replaceAll('\\','/')},C:\\third`,true],
    [`chrome.exe "--load-extension=${extensionPath.toUpperCase()}"`,true],
    [`chrome.exe --load-extension=${extensionPath}-other`,false],
  ]){
    const result=queryWindowsProcesses(profile,invokeWith(command),undefined,{extensionPath});
    if(conflict)await assert.rejects(result,error=>error.queryDiagnostic?.reason==='extension-path-conflict'&&!JSON.stringify(error).includes(extensionPath));
    else assert.deepEqual(await result,[]);
  }
});
function syntheticWindows(t){const descriptor=Object.getOwnPropertyDescriptor(process,'platform');Object.defineProperty(process,'platform',{value:'win32'});t.after(()=>Object.defineProperty(process,'platform',descriptor));}
test('query deadline retains default timeout and floors remaining budget at invocation',async t=>{
  syntheticWindows(t);
  const {queryWindowsProcesses}=await subject();let now=1000;t.mock.method(performance,'now',()=>now);const seen=[];
  const invoke=(_exe,_args,options)=>{seen.push(options);return '[]';};
  for(const deadline of [undefined,1023.9,51000])await queryWindowsProcesses(path.resolve('output/synthetic-query'),invoke,deadline);
  assert.deepEqual(seen.map(x=>x.timeout),[15000,23,15000]);assert.ok(seen.every(x=>x.maxBuffer===1048576&&x.windowsHide));
  now=1010;await queryWindowsProcesses(path.resolve('output/synthetic-query'),invoke,1023.9);assert.equal(seen.at(-1).timeout,13);
});
for(const remaining of [-1,0,.9])test('query deadline refuses invoke with remaining '+remaining,async t=>{
  syntheticWindows(t);
  const {queryWindowsProcesses}=await subject();t.mock.method(performance,'now',()=>1000);let invokes=0;
  await assert.rejects(queryWindowsProcesses(path.resolve('output/synthetic-query'),()=>{invokes++;return '[]';},1000+remaining),e=>e.code==='native-unavailable'&&e.queryDiagnostic.reason==='timeout');
  assert.equal(invokes,0);
});
for(const result of ['valid','json','shape','throw'])test('query deadline late '+result+' preserves failure classification',async t=>{
  syntheticWindows(t);
  const {queryWindowsProcesses}=await subject();let now=1000;t.mock.method(performance,'now',()=>now);
  await assert.rejects(queryWindowsProcesses(path.resolve('output/synthetic-query'),()=>{now=16000;
    if(result==='throw')throw Object.assign(Error('private-sentinel'),{code:'EACCES',status:7});
    return result==='json'?'{bad':result==='shape'?'{}':'[]';},16000),e=>{
    assert.equal(e.code,'native-unavailable');assert.equal(e.queryDiagnostic.reason,{valid:'timeout',json:'json',shape:'output-shape',throw:'subprocess'}[result]);
    assert.equal(JSON.stringify(e).includes('private-sentinel'),false);return true;});
});
test('query deadline never bypasses the non-Windows guard',async t=>{
  const descriptor=Object.getOwnPropertyDescriptor(process,'platform');Object.defineProperty(process,'platform',{value:'linux'});t.after(()=>Object.defineProperty(process,'platform',descriptor));
  let invokes=0;await assert.rejects((await subject()).queryWindowsProcesses('/synthetic',()=>{invokes++;return '[]';},performance.now()+1000),{code:'native-unavailable'});assert.equal(invokes,0);
});
test('query deadline rejects malformed deadlines without invoking a subprocess',async t=>{
  syntheticWindows(t);let invokes=0;const {queryWindowsProcesses}=await subject();
  for(const deadline of [NaN,Infinity,null,'16000'])await assert.rejects(queryWindowsProcesses(path.resolve('output/synthetic-query'),()=>{invokes++;return '[]';},deadline),{code:'native-unavailable'});
  assert.equal(invokes,0);
});
test('tone silence query keeps only the first unavailable CIM row observation',async t=>{
  if(process.platform!=='win32')return t.skip('PowerShell fixture requires Windows');
  const {queryWindowsProcesses}=await subject(),{nativeFailureDetails}=await import('../scripts/audio-native-browser.mjs');
  const profile=path.resolve('output/synthetic-query');
  const rows=[{ProcessId:41,CreationDate:'2026-11-04T13:10:00.1234567Z',CommandLine:null},
    {ProcessId:42,CreationDate:'2026-11-04T13:10:01Z',CommandLine:'private-sentinel'}];
  for(const [command,kind] of [[null,'null'],['','empty'],['private-sentinel'.repeat(3000),'too-long']]){
    rows[0].CommandLine=command;let calls=0;
    const invoke=(exe,args,options)=>{
      calls++;const script=Buffer.from(args.at(-1),'base64').toString('utf16le');
      const input=Buffer.from(JSON.stringify(rows)).toString('base64');
      // Pass fixture data on stdin, avoiding the Windows argv limit for the oversize row.
      const shim=`$ErrorActionPreference='Stop'; $taskSynthetic=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))); function Get-CimInstance { param($ClassName,$Filter) if($ClassName -ne 'Win32_Process' -or $Filter -ne "Name='chrome.exe'"){throw 'wrong filter'}; $taskSynthetic }; `;
      return execFileSync(exe,[...args.slice(0,-1),Buffer.from(shim+script,'utf16le').toString('base64')],{...options,input,stdio:['pipe','pipe','pipe']});
    };
    await assert.rejects(queryWindowsProcesses(profile,invoke,undefined,{observeUnavailable:true}),e=>{
      const detail=nativeFailureDetails(e).queryDiagnostic;
      assert.equal(detail.reason,'command-line-unavailable');
      assert.deepEqual(detail.unavailableRow,{kind,pid:41,createdTicks:'639293946001234567'},JSON.stringify(detail));
      assert.ok(!JSON.stringify(detail).includes('private-sentinel'));return true;
    });
    assert.equal(calls,1);
  }
});
test('tone silence query drops late, unselected and untrusted CIM row details without changing the original error',async t=>{
  syntheticWindows(t);
  const {queryWindowsProcesses}=await subject(),{nativeFailureDetails}=await import('../scripts/audio-native-browser.mjs');
  let now=1000;t.mock.method(performance,'now',()=>now);
  for(const mode of ['late','unselected','bad-identity']){
    now=1000;let calls=0;
    await assert.rejects(queryWindowsProcesses(path.resolve('output/synthetic-query'),(_exe,_args,options)=>{
      calls++;assert.equal(options.timeout,20);if(mode==='late')now=1020;
      return JSON.stringify({queryFailure:'command-line-unavailable',unavailableRow:{kind:'empty',pid:41,
        createdTicks:mode==='bad-identity'?'9999999999999999999':'639293946001234567',secret:'private-sentinel'}});
    },1020,{observeUnavailable:mode!=='unselected'}),e=>{
      assert.equal(e.code,'native-unavailable');const detail=nativeFailureDetails(e).queryDiagnostic;
      assert.equal(detail.reason,'command-line-unavailable');
      assert.deepEqual(detail.unavailableRow,mode==='bad-identity'?{kind:'empty'}:undefined);
      assert.ok(!JSON.stringify(detail).includes('private-sentinel'));return true;
    });
    assert.equal(calls,1);
  }
});
const profilePath = 'output/p09-public-20261012152819/fresh-chrome-profile';
const publicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArA8fqaxlCuy4iIbgvuIyg1UPWyZpQLp5UajypaswUgq1/gmJOtLl3kIFsf25l1TfKzAb9lgzY17U97VecqMu0hrLLKxoYjvuzfndCiO1LO5bX03xLAMNkJg1noThwTO2yhndk0rbQOz1MJtLmb1uLuYu0A0Mbu2g53gxBA0XBOfRZq9GGDlN6MLhQaFD0iQe0iLfFPQxLJliphVnfzLkr2DnUr9+EdTnRYR9mI1UCy6jQ8o1ahOBmjO9FhGoIhk9pHvMk9Lrol8AKWMlW6qHAL8jTpyr3h3RmsxIcKmTbe6WU7Rkz4az6OyA8/itEVcaNILKSI18NRzw/HID76YIpQIDAQAB';
async function installed(t) {
  const { openOwnedRoot } = await import('../scripts/owned-files.mjs');
  await fs.mkdir('output',{recursive:true}); const root = await fs.mkdtemp(path.resolve('output/native-profile-test-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const repository = await openOwnedRoot(root), payload = await (await import('../scripts/extension-e2e/published-payload.mjs')).readPublishedPayload();
  const baseline = (await import('../scripts/extension-e2e/native-preflight.mjs')).nativePreflightBaseline(payload);
  const prefix = `${profilePath}/Default/Extensions/${fixture.id}/2.13.3_0`;
  for (const e of payload.entries) { await repository.ensureDirectory(path.posix.dirname(`${prefix}/${e.name}`)); await repository.writeFile(`${prefix}/${e.name}`,e.bytes,{flag:'wx'}); }
  const manifest = { ...baseline.manifest, key:publicKey, update_url:'https://clients2.google.com/service/update2/crx' };
  await repository.writeFile(`${prefix}/manifest.json`,JSON.stringify(manifest));
  await repository.ensureDirectory(`${prefix}/_metadata`);
  for(const name of ['computed_hashes.json','verified_contents.json']) await repository.writeFile(`${prefix}/_metadata/${name}`,'{}',{flag:'wx'});
  const record = {from_webstore:true,disable_reasons:[],manifest,
    granted_permissions:{api:['storage','scripting'],explicit_host:['https://chzzk.naver.com/*'],scriptable_host:['https://chzzk.naver.com/*'],manifest_permissions:[]}};
  await repository.writeFile(`${profilePath}/Default/Preferences`,JSON.stringify({extensions:{ui:{}},private:'private-sentinel'}));
  const save = () => repository.writeFile(`${profilePath}/Default/Secure Preferences`,JSON.stringify({extensions:{settings:{[fixture.id]:record,unrelated:{private:'private-sentinel'}}}}));
  await save(); const profile = await repository.resolve(profilePath,{type:'directory'});
  let rows = [{ProcessId:10,startedAt:100,CommandLine:`chrome.exe --user-data-dir="${profile}"`}];
  const options = {repository,baseline,phase:'before',runNonce:fixture.nonce,now:()=>1000,queryProcesses:async()=>rows};
  return {repository,baseline,prefix,record,save,profile,options,setRows:r=>rows=r};
}
test('native reader derives the public-key ID and projects only current target facts without writes', async t => {
  const f = await installed(t), mod = await subject();
  const before = await f.repository.readFile(`${profilePath}/Default/Secure Preferences`);
  const result = await mod.readNativeFacts(f.options);
  assert.equal(result.installation.publicKeyId,fixture.id); assert.equal(result.installation.files.length,60);
  assert.equal(result.developerMode,false); assert.deepEqual(result.process,{queried:true,root:{pid:10,startedAt:100}});
  assert.ok(!JSON.stringify(result).includes('private-sentinel') && !JSON.stringify(result).includes(f.profile));
  assert.deepEqual(await f.repository.readFile(`${profilePath}/Default/Secure Preferences`),before);
  assert.equal(mod.extensionPublicKeyId(publicKey),fixture.id);
});
const invalid = {
  'not store':async f=>{f.record.from_webstore=false;await f.save();},
  'disabled':async f=>{f.record.disable_reasons=[1];await f.save();},
  'stale recorded version':async f=>{f.record.manifest.version='2.13.2';await f.save();},
  'permission mismatch':async f=>{f.record.granted_permissions.api.push('tabs');await f.save();},
  'HTML changed':f=>f.repository.writeFile(`${f.prefix}/popup.html`,'changed'),
  'extra runtime':f=>f.repository.writeFile(`${f.prefix}/extra.js`,'changed',{flag:'wx'}),
  'extra version':f=>f.repository.ensureDirectory(`${profilePath}/Default/Extensions/${fixture.id}/2.13.4_0`),
  'malformed preferences':f=>f.repository.writeFile(`${profilePath}/Default/Preferences`,'private-sentinel'),
  'developer mode null':f=>f.repository.writeFile(`${profilePath}/Default/Preferences`,JSON.stringify({extensions:{ui:{developer_mode:null}}})),
  'wrong key':async f=>{const m=JSON.parse(await f.repository.readFile(`${f.prefix}/manifest.json`));m.key='broken';await f.repository.writeFile(`${f.prefix}/manifest.json`,JSON.stringify(m));},
};
for(const [name,mutate] of Object.entries(invalid)) test(`native reader rejects ${name} before accepting facts`,async t=>{
  const f=await installed(t);await mutate(f);
  await assert.rejects((await subject()).readNativeFacts(f.options),e=>['native-evidence-invalid','native-unavailable'].includes(e.code)&&!e.message.includes('private-sentinel'));
});
test('native reader rejects linked installed resources rather than following them',async t=>{
  const f=await installed(t);
  await f.repository.removeTree(`${f.prefix}/styles`);
  const target=await f.repository.resolve(`${f.prefix}/styles`,{type:'missing-or-directory'});
  const external=path.join(f.repository.root,'external');await fs.mkdir(external);
  await fs.symlink(external,target,process.platform==='win32'?'junction':'dir');
  await assert.rejects((await subject()).readNativeFacts(f.options),{code:'native-unavailable'});
});
test('native root selection rejects prefix aliases, renderer-only, duplicates, and query failures',async t=>{
  const f=await installed(t),mod=await subject();
  for(const rows of [
    [{ProcessId:10,startedAt:100,CommandLine:`chrome.exe --user-data-dir="${f.profile}-other"`}],
    [{ProcessId:10,startedAt:100,CommandLine:`chrome.exe --type=renderer --user-data-dir="${f.profile}"`}],
    [{ProcessId:10,startedAt:100,CommandLine:`chrome.exe --user-data-dir="${f.profile}"`},{ProcessId:11,startedAt:100,CommandLine:`chrome.exe --user-data-dir="${f.profile}"`}],
  ]) {f.setRows(rows);await assert.rejects(mod.readNativeFacts(f.options),{code:'native-evidence-invalid'});}
  f.options.queryProcesses=async()=>{throw Error('private-process-sentinel');};
  await assert.rejects(mod.readNativeFacts(f.options),{code:'native-unavailable'});
});
test('closed proof requires a successful query with no target root and preserves installation facts',async t=>{
  const f=await installed(t),mod=await subject();
  await assert.rejects(mod.readNativeFacts({...f.options,phase:'closed'}),{code:'native-evidence-invalid'});
  f.setRows([]);const r=await mod.readNativeFacts({...f.options,phase:'closed'});
  assert.deepEqual(r.process,{queried:true,root:null});assert.equal(r.installation.version,'2.13.3');
});

test('actual PowerShell query projects only target candidates and rejects unreadable process command lines',async()=>{
  if(process.platform!=='win32') return;
  const mod=await subject(), profile=path.resolve('output/native-query-fixture');
  const invoke=(rows,cimThrows=false)=>(exe,args,options)=>{
    const script=Buffer.from(args.at(-1),'base64').toString('utf16le');
    const data=Buffer.from(JSON.stringify(rows)).toString('base64');
    const shim=`$taskSynthetic=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}'))); function Get-CimInstance { param($ClassName,$Filter) ${cimThrows?"throw 'private-sentinel'":'$taskSynthetic'} }; `;
    return execFileSync(exe,[...args.slice(0,-1),Buffer.from(shim+script,'utf16le').toString('base64')],options);
  };
  const alias=path.dirname(profile)+'\\..\\'+path.basename(path.dirname(profile))+'\\'+path.basename(profile);
  const rows=[{ProcessId:10,CreationDate:'2026-10-13T00:00:00Z',CommandLine:`chrome.exe --user-data-dir="${profile}"`},
    {ProcessId:11,CreationDate:'2026-10-13T00:00:00Z',CommandLine:'chrome.exe --user-data-dir="C:\\unrelated-private-sentinel"'},
    {ProcessId:12,CreationDate:'2026-10-13T00:00:00Z',CommandLine:`chrome.exe --user-data-dir="${alias}"`},
    {ProcessId:13,CreationDate:'2026-10-13T00:00:00Z',CommandLine:`chrome.exe --user-data-dir="${profile.replaceAll('\\','/')}"`},
    {ProcessId:14,CreationDate:'2026-10-13T00:00:00Z',CommandLine:`chrome.exe "--user-data-dir=${profile}"`}];
  assert.deepEqual(await mod.queryWindowsProcesses(profile,invoke([])),[]);
  assert.equal((await mod.queryWindowsProcesses(profile,invoke([rows[0]]))).length,1);
  await assert.rejects(mod.queryWindowsProcesses(profile,invoke([],true)),e=>{assert.equal(e.queryDiagnostic.reason,'query-failed');assert.equal(JSON.stringify(e).includes('private-sentinel'),false);return true;});
  const projected=await mod.queryWindowsProcesses(profile,invoke(rows));
  assert.deepEqual(projected.map(row=>row.ProcessId),[10,12,13,14]);assert.ok(!JSON.stringify(projected).includes('private-sentinel'));
  for(const [command,reason]of [[null,'command-line-unavailable'],['chrome.exe --user-data-dir=', 'command-line-format'],['chrome.exe --user-data-dir=relative-private-sentinel','profile-path']]){
    await assert.rejects(mod.queryWindowsProcesses(profile,invoke([rows[0],{ProcessId:99,CreationDate:'2026-10-13T00:00:00Z',CommandLine:command}])),e=>{
      assert.equal(e.code,'native-unavailable');assert.equal(e.queryDiagnostic.reason,reason);assert.equal(JSON.stringify(e).includes('private-sentinel'),false);assert.equal(e.stdout,undefined);assert.equal(e.stderr,undefined);return true;
    });
  }
});

for(const [code,reason]of [['ETIMEDOUT','timeout'],['ENOBUFS','output-limit'],['ENOENT','subprocess']])test('query diagnostics retain bounded '+reason+' without subprocess private data',async()=>{
  if(process.platform!=='win32')return;
  const mod=await subject();let calls=0;
  await assert.rejects(mod.queryWindowsProcesses(path.resolve('output/synthetic-query'),(_exe,_args,options)=>{
    calls++;assert.equal(options.timeout,15000);assert.equal(options.maxBuffer,1048576);
    throw Object.assign(Error('private-sentinel'),{code,status:7,signal:'SIGTERM',stdout:'private-sentinel',stderr:'private-sentinel',cause:Error('private-sentinel')});
  }),e=>{assert.equal(e.code,'native-unavailable');assert.equal(e.queryDiagnostic.reason,reason);assert.equal(e.queryDiagnostic.timedOut,code==='ETIMEDOUT');assert.equal(e.queryDiagnostic.exitCode,7);assert.equal(e.queryDiagnostic.signal,'SIGTERM');assert.equal(e.cause,undefined);assert.equal(JSON.stringify(e).includes('private-sentinel'),false);return true;});
  assert.equal(calls,1);
});
for(const [output,reason]of [['not-json-private-sentinel','json'],['null','output-shape'],['{}','output-shape'],[JSON.stringify({queryFailure:'command-line-unavailable'}),'command-line-unavailable'],[JSON.stringify({queryFailure:'private-sentinel'}),'output-shape']])test('query output failure remains closed and sanitized '+reason+' '+output,async()=>{
  if(process.platform!=='win32')return;
  await assert.rejects((await subject()).queryWindowsProcesses(path.resolve('output/synthetic-query'),()=>output),e=>{assert.equal(e.code,'native-unavailable');assert.equal(e.queryDiagnostic.reason,reason);assert.equal(JSON.stringify(e).includes('private-sentinel'),false);return true;});
});

test('query over-limit output and unknown signal remain bounded failures without leaking private text',async()=>{
  if(process.platform!=='win32')return;
  const mod=await subject(),profile=path.resolve('output/synthetic-query');
  await assert.rejects(mod.queryWindowsProcesses(profile,()=> ' '.repeat(1048577)),e=>e.queryDiagnostic.reason==='output-limit');
  await assert.rejects(mod.queryWindowsProcesses(profile,()=>{throw Object.assign(Error('private-sentinel'),{code:'private-sentinel',status:Infinity,signal:'private-sentinel'});}),e=>{assert.deepEqual(e.queryDiagnostic,{reason:'subprocess',timedOut:false});assert.equal(JSON.stringify(e).includes('private-sentinel'),false);return true;});
});
