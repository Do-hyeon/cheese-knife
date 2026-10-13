const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fixture = require('./native-preflight-fixture.cjs');
const subject = () => import('../scripts/extension-e2e/native-profile.mjs');
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
  const invoke=rows=>(exe,args,options)=>{
    const script=Buffer.from(args.at(-1),'base64').toString('utf16le');
    const data=Buffer.from(JSON.stringify(rows)).toString('base64');
    const shim=`$taskSynthetic=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}'))); function Get-CimInstance { param($ClassName,$Filter) $taskSynthetic }; `;
    return execFileSync(exe,[...args.slice(0,-1),Buffer.from(shim+script,'utf16le').toString('base64')],options);
  };
  const alias=path.dirname(profile)+'\\..\\'+path.basename(path.dirname(profile))+'\\'+path.basename(profile);
  const rows=[{ProcessId:10,CreationDate:'2026-10-13T00:00:00Z',CommandLine:`chrome.exe --user-data-dir="${profile}"`},
    {ProcessId:11,CreationDate:'2026-10-13T00:00:00Z',CommandLine:'chrome.exe --user-data-dir="C:\\unrelated-private-sentinel"'},
    {ProcessId:12,CreationDate:'2026-10-13T00:00:00Z',CommandLine:`chrome.exe --user-data-dir="${alias}"`},
    {ProcessId:13,CreationDate:'2026-10-13T00:00:00Z',CommandLine:`chrome.exe --user-data-dir="${profile.replaceAll('\\','/')}"`},
    {ProcessId:14,CreationDate:'2026-10-13T00:00:00Z',CommandLine:`chrome.exe "--user-data-dir=${profile}"`}];
  const projected=await mod.queryWindowsProcesses(profile,invoke(rows));
  assert.deepEqual(projected.map(row=>row.ProcessId),[10,12,13,14]);assert.ok(!JSON.stringify(projected).includes('private-sentinel'));
  await assert.rejects(mod.queryWindowsProcesses(profile,invoke([{ProcessId:10,CreationDate:'2026-10-13T00:00:00Z',CommandLine:null}])),{code:'native-unavailable'});
});
