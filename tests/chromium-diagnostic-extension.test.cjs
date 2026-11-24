const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const fs=require('node:fs/promises'),{tmpdir}=require('node:os'),{createHash}=require('node:crypto');
const load=()=>import('../scripts/extension-e2e/chromium-diagnostic-extension.mjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixed='C:\\Fixture\\Chromium\\dist';
test('unpacked Windows ID hashes the exact UTF-16LE path with only the drive letter normalized',async()=>{
  const {chromiumUnpackedWindowsId}=await load(),expected='ilajapijkagfgoceflamppkolopkkmff';
  assert.equal(chromiumUnpackedWindowsId(fixed),expected);
  assert.equal(chromiumUnpackedWindowsId('c'+fixed.slice(1)),expected);
  assert.notEqual(chromiumUnpackedWindowsId(fixed.replace('Fixture','fixture')),expected);
  for(const value of [fixed+'\\',fixed+'\\..\\dist','relative\\dist','\\\\server\\share\\dist'])
    assert.throws(()=>chromiumUnpackedWindowsId(value),/diagnostic-dist-path/);
});

async function fixture(t,manifest={}){
  const dir=await fs.realpath(await fs.mkdtemp(path.join(tmpdir(),'ck-fixed-dist-')));
  const assets=path.join(dir,'assets');
  await fs.mkdir(assets);
  const files=new Map([['manifest.json',Buffer.from(JSON.stringify({manifest_version:3,version:'2.13.3',
    background:{service_worker:'background.js'},...manifest}))]]);
  for(let i=0;i<61;i++)files.set('assets/file-'+i+'.txt',Buffer.from([i]));
  files.set('background.js',Buffer.alloc(952532-files.get('manifest.json').length-61,0x41));
  t.after(async()=>{
    for(const name of await fs.readdir(assets))await fs.unlink(path.join(assets,name));
    await fs.rmdir(assets);
    for(const name of await fs.readdir(dir))await fs.unlink(path.join(dir,name));
    await fs.rmdir(dir);
  });
  const rows=[];
  for(const [name,bytes] of files){
    await fs.writeFile(path.join(dir,name),bytes,{flag:'wx'});
    rows.push({file:'dist/'+name,bytes:bytes.length,sha256:hash(bytes)});
  }
  return {dir,assets,rows,ledgerSha256:hash(JSON.stringify(rows))};
}
const windows={skip:process.platform!=='win32'};
const control=()=>({deadline:performance.now()+5000,signal:new AbortController().signal});
test('63-file attestor returns the same bound evidence before and after and rejects same-size drift',windows,async t=>{
  const {createChromiumDistAttestor,chromiumUnpackedWindowsId}=await load(),f=await fixture(t);
  const attest=createChromiumDistAttestor({...f,extensionId:chromiumUnpackedWindowsId(f.dir)});
  const before=await attest(control()),after=await attest(control());
  assert.deepEqual(before,after);assert.equal(before.files,63);assert.equal(before.bytes,952532);
  await fs.writeFile(path.join(f.assets,'file-0.txt'),Buffer.from([0x7f]));
  await assert.rejects(attest(control()),/diagnostic-dist-file-bytes/);
});
test('dist attestation rejects an extra file, a removed file, and a manifest key even with a matching ledger',windows,async t=>{
  const {createChromiumDistAttestor,chromiumUnpackedWindowsId}=await load(),f=await fixture(t);
  const attest=createChromiumDistAttestor({...f,extensionId:chromiumUnpackedWindowsId(f.dir)});
  const extra=path.join(f.assets,'unexpected.txt');
  await fs.writeFile(extra,Buffer.from([1]));
  await assert.rejects(attest(control()),/diagnostic-dist-inventory/);
  await fs.unlink(extra);
  await fs.unlink(path.join(f.assets,'file-0.txt'));
  await assert.rejects(attest(control()),/diagnostic-dist-inventory/);
  const keyed=await fixture(t,{key:null});
  const keyedAttest=createChromiumDistAttestor({...keyed,extensionId:chromiumUnpackedWindowsId(keyed.dir)});
  await assert.rejects(keyedAttest(control()),/diagnostic-dist-manifest/);
});
test('attestor binds manifest rows, path-derived ID and caller cancellation',windows,async t=>{
  const {createChromiumDistAttestor,chromiumUnpackedWindowsId}=await load(),f=await fixture(t),extensionId=chromiumUnpackedWindowsId(f.dir);
  assert.throws(()=>createChromiumDistAttestor({...f,extensionId:'a'.repeat(32)}),/diagnostic-dist-id/);
  assert.throws(()=>createChromiumDistAttestor({...f,extensionId,ledgerSha256:'a'.repeat(64)}),/diagnostic-dist-ledger/);
  const rows=structuredClone(f.rows);
  rows[2].file='dist/assets/FILE-0.txt';
  assert.throws(()=>createChromiumDistAttestor({...f,extensionId,rows,ledgerSha256:hash(JSON.stringify(rows))}),/diagnostic-dist-ledger/);
  const attest=createChromiumDistAttestor({...f,extensionId}),cancel=new AbortController(),first=Error('original-stop');
  cancel.abort(first);
  await assert.rejects(attest({...control(),signal:cancel.signal}),error=>error===first);
  await assert.rejects(attest({...control(),deadline:performance.now()}),/diagnostic-dist-deadline/);
});
test('fixed Playwright environment refuses pre-import file logging and inspector bootstrap aliases',async()=>{
  const {assertFixedPlaywrightEnvironment}=await load();
  for(const key of ['DEBUG_FILE','debug_file','PWDEBUG','npm_config_pwdebug','npm_package_config_pwdebug','PWTEST_UNDER_TEST','PLAYWRIGHT_ARTIFACTS_DIR']){
    assert.throws(()=>assertFixedPlaywrightEnvironment({[key]:'1'}),/diagnostic-playwright-environment/);
  }
  assert.doesNotThrow(()=>assertFixedPlaywrightEnvironment({SystemRoot:'C:\\Windows',DEBUG_FILE:''}));
});
