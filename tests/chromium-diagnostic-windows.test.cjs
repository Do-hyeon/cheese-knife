const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const fs=require('node:fs/promises'),{createHash,randomBytes}=require('node:crypto'),{tmpdir}=require('node:os');
const pwsh=process.env.CK_TEST_DIAGNOSTIC_PWSH,scanner=process.env.CK_TEST_DIAGNOSTIC_SCANNER;
const windows={skip:process.platform!=='win32'||!pwsh||!scanner,timeout:20000};
const frame=65536,hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(tmpdir(),'ck-diagnostic-host-'));
  const dirs=['evidence','profile','browser-artifacts','chromium-temp','dist','playwright-artifacts'].map(name=>path.join(root,name));
  const reservePath=path.join(dirs[0],'failure-slots.bin'),raw=path.join(dirs[1],'known-raw.bin'),source=path.join(root,'delayed-scanner.ps1');
  const disposition={safeToClean:true};
  t.after(async()=>{
    if(!disposition.safeToClean){t.diagnostic('Unconfirmed worker closure. Preserved fixture: '+root);return;}
    for(const file of [reservePath,raw,source])await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    for(const dir of dirs)await fs.rmdir(dir);
    await fs.rmdir(root);
  });
  for(const dir of dirs)await fs.mkdir(dir);
  const initial=randomBytes(2*frame);
  const allocated=await fs.open(reservePath,'wx');
  try{await allocated.writeFile(initial);await allocated.sync();}finally{await allocated.close();}
  await fs.writeFile(raw,Buffer.from([1,2,3]));
  return {root,dirs,reservePath,source,initial,disposition};
}
function readFrame(bytes,slot,reservationSha256){
  const start=slot*frame,body=bytes.subarray(start,start+frame-32);
  assert.equal(bytes.subarray(start+frame-32,start+frame).toString('hex'),hash(body));
  const {reservationSha256:received,slot:index,evidence}=JSON.parse(body.toString('utf8').split('\0',1)[0]);
  assert.equal(received,reservationSha256);assert.equal(index,slot);return evidence;
}
test('Windows diagnostic HOST observes scanner delay while an actual exclusive NTFS slot worker records STOP and retirement',windows,async t=>{
  const {openChromiumDiagnosticHost}=await import('../scripts/extension-e2e/chromium-diagnostic-host.mjs');
  const {runChromiumJobDiagnostic}=await import('../scripts/check-product-audio.mjs');
  const f=await fixture(t);
  const scannerBytes=Buffer.concat([await fs.readFile(scanner),Buffer.from(
    "\n$script:samples=0\n$measure=${function:Measure-ChromiumCompatRaw}\nfunction Measure-ChromiumCompatRaw { param([string]$RunRoot,[long]$ScanByTick)\nif ((++$script:samples) -eq 2) { Start-Sleep -Milliseconds 1400 }\n& $measure $RunRoot $ScanByTick\n}\n")]);
  await fs.writeFile(f.source,scannerBytes,{flag:'wx'});
  const started=performance.now();
  f.disposition.safeToClean=false;
  const host=await openChromiumDiagnosticHost({started,root:f.root,pwsh,scanner:f.source,
    scannerSha256:hash(scannerBytes),reservationSha256:hash(f.initial)});
  const binding={nonce:'a'.repeat(64),pid:42,created:'0123456789abcdef',helperPid:43,helperCreated:'0123456789abcdee',helperSha256:'b'.repeat(64),executable:path.join(f.root,'never-chrome.exe')};
  let launches=0,aborts=0,elapsed,scanSettled=true,closure;
  try{
    assert.equal(host.allocation.allocatedBytes,2*frame);
    assert.equal(host.allocation.clusters*host.allocation.clusterBytes,2*frame);
    await assert.rejects(fs.open(f.reservePath,'r'),{code:'EBUSY'});
    const {reserve,scan}=host;
    await assert.rejects(runChromiumJobDiagnostic({started,reserve,scan:async cutoff=>{
      scanSettled=false;
      try{return await scan(cutoff);}finally{scanSettled=true;}
    },launchOptions:{
      headed:false,extensionPath:f.dirs[4],profilePath:f.dirs[1],artifactPath:f.dirs[2],productCaseId:'44100/normalizer-control/tone-silence',
      browserCandidate:{root:f.root,manifestSha256:'c'.repeat(64)},runJob:{contract:'run-job-v1',helper:{path:path.join(f.root,'never-owner.exe'),sha256:binding.helperSha256}},
      diagnosticPaths:{chromiumTempDir:f.dirs[3],playwrightArtifactsDir:f.dirs[5]},
    },observe:async()=>assert.fail('unexpected observe')},{
      launch:async ({observeRunJobOwner,signal})=>{
        launches++;const abort=observeRunJobOwner({binding,abort:async()=>{
          aborts++;elapsed=performance.now()-started;assert.equal(scanSettled,false);
          return {binding,active:0,rootExited:true,total:1,helperExited:true,aborted:true,timing:{budgetMs:15000,remainingBeforeMs:14000,remainingAfterMs:13000}};
        }});
        await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));await abort();throw Error('late-host-fixture');
      },
    }),/chromium-diagnostic-scan-deadline/);
    assert.equal(launches,1);assert.equal(aborts,1);assert.ok(elapsed<10000);
    const live=Buffer.alloc(2*frame);
    assert.equal((await reserve.handle.read(live,0,live.length,0)).bytesRead,live.length);
    assert.equal(readFrame(live,0,hash(f.initial)).message,'chromium-diagnostic-scan-deadline');
    const retired=readFrame(live,1,hash(f.initial));
    assert.equal(retired.status,'CONFIRMED');assert.equal(retired.launchError.message,'late-host-fixture');
  }finally{
    closure=await host.close(started+10000);
    f.disposition.safeToClean=closure.every(child=>child.status==='CONFIRMED');
  }
  assert.equal(closure.length,2);
  for(const [index,child] of closure.entries()){
    assert.ok(child.pid>0);assert.equal(child.exited,true);assert.equal(child.stdoutEnded,true);assert.equal(child.signal,null);
    assert.equal(child.status,'CONFIRMED');assert.equal(child.outstanding,null);assert.equal(child.stderrBytes,0);
    assert.equal(child.code,index);assert.equal(child.error,index===0?null:'raw-scan-deadline');
  }
  const saved=await fs.readFile(f.reservePath);
  assert.equal(readFrame(saved,0,hash(f.initial)).message,'chromium-diagnostic-scan-deadline');
  assert.equal(readFrame(saved,1,hash(f.initial)).status,'CONFIRMED');
});
