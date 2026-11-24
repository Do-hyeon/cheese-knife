'use strict';
// Explicit synthetic HOST entry; only the fixed supervisor may run this file.
const assert=require('node:assert/strict'),path=require('node:path');
const fsNative=require('node:fs'),fsp=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),{syncBuiltinESMExports}=require('node:module');
const write=fsNative.writeSync.bind(fsNative),clock=process.hrtime.bigint.bind(process.hrtime),began=clock();
const root=path.resolve(__dirname,'..');
const SCOPE='parser-to-API selection consumption only; stored replay, HOST65, Native and product remain HOLD';
let first=null,emitted=false;
const observedEffects=[];
function latch(error,code='CHECK_FAILED'){first??={error,code,diagnostic:String(error?.message??error).slice(0,256)};process.exitCode=1;return first.error;}
function live(){if(first)throw first.error;if(Number(clock()-began)/1e6>=45000)throw latch(Error('work deadline'),'WORK_DEADLINE');}
function emit(row){
  if(emitted)return;const bytes=Buffer.from(JSON.stringify(row)+'\n');assert.ok(bytes.length<=8192,'OUTPUT_LINE_LIMIT');
  emitted=true;for(let offset=0;offset<bytes.length;){const n=write(1,bytes,offset,bytes.length-offset);assert.ok(n>0,'OUTPUT_WRITE');offset+=n;}
}
let lateDiagnostic=false;
function stop(error){
  latch(error);const row={schema:'f01-master-cli-host-v1',status:'STOP',firstCode:first.code,diagnostic:first.diagnostic};
  try{if(!emitted){emit(row);return;}}catch(outputError){row.outputFailure=String(outputError?.message??outputError).slice(0,128);}
  if(lateDiagnostic)return;lateDiagnostic=true;
  try{const bytes=Buffer.from(JSON.stringify({...row,late:true})+'\n');assert.ok(bytes.length<=8192);for(let offset=0;offset<bytes.length;){const n=write(2,bytes,offset,bytes.length-offset);if(n<=0)break;offset+=n;}}catch{}
}
// shortcut: cooperative guards cover reviewed JS paths; re-review changed imports, never claim OS isolation.
function denied(effect){return function(){if(observedEffects.length<16)observedEffects.push(effect);throw latch(Error('HOST_FORBIDDEN_EFFECT:'+effect),'FORBIDDEN_EFFECT');};}
function forbidMethods(object,names,prefix){for(const name of names)if(typeof object[name]==='function')object[name]=denied(prefix+'.'+name);}
function guardProcessesAndNetwork(){
  forbidMethods(require('node:child_process'),['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'],'child_process');
  for(const name of ['http','https'])forbidMethods(require('node:'+name),['request','get','createServer'],name);
  forbidMethods(require('node:net'),['connect','createConnection','createServer'],'net');
  forbidMethods(require('node:tls'),['connect','createServer'],'tls');
  forbidMethods(require('node:dgram'),['createSocket'],'dgram');
  require('node:worker_threads').Worker=denied('worker_threads.Worker');
  global.fetch=denied('fetch');if(typeof global.WebSocket==='function')global.WebSocket=denied('WebSocket');
  syncBuiltinESMExports();
}
function guardInitializationWrites(){
  // Pinned library initialization may read files; it cannot create diagnostics or caches.
  forbidMethods(fsp,['appendFile','chmod','chown','copyFile','cp','link','mkdir','mkdtemp','rename','rm','rmdir','symlink','truncate','unlink','utimes','writeFile'],'fs.promises.init');
  forbidMethods(fsNative,['appendFile','appendFileSync','chmod','chmodSync','chown','chownSync','copyFile','copyFileSync','cp','cpSync','createWriteStream','link','linkSync','mkdir','mkdirSync','mkdtemp','mkdtempSync','rename','renameSync','rm','rmSync','rmdir','rmdirSync','symlink','symlinkSync','truncate','truncateSync','unlink','unlinkSync','utimes','utimesSync','writeFile','writeFileSync'],'fs.init');
  syncBuiltinESMExports();
}
function guardOperationalFiles(){
  // Module initialization's pinned synthetic JSON read happens before this guard.
  forbidMethods(fsp,['access','appendFile','chmod','chown','copyFile','cp','link','lstat','mkdir','mkdtemp','open','opendir','readFile','readdir','readlink','realpath','rename','rm','rmdir','stat','symlink','truncate','unlink','utimes','watch','writeFile'],'fs.promises');
  forbidMethods(fsNative,['access','accessSync','appendFile','appendFileSync','chmod','chmodSync','chown','chownSync','copyFile','copyFileSync','cp','cpSync','createReadStream','createWriteStream','existsSync','link','linkSync','lstat','lstatSync','mkdir','mkdirSync','mkdtemp','mkdtempSync','open','openSync','opendir','opendirSync','readFile','readFileSync','readdir','readdirSync','readlink','readlinkSync','realpath','realpathSync','rename','renameSync','rm','rmSync','rmdir','rmdirSync','stat','statSync','symlink','symlinkSync','truncate','truncateSync','unlink','unlinkSync','utimes','utimesSync','watch','watchFile','writeFile','writeFileSync'],'fs');
  syncBuiltinESMExports();
}
function guardReadOnlyOpen(){
  for(const [object,key,label]of [[fsNative,'open','fs.open'],[fsNative,'openSync','fs.openSync'],[fsp,'open','fsp.open']]){
    const original=object[key];
    object[key]=function(...args){if(!['r','rs','sr',0].includes(args[1]))return denied(label)(...args);return original.apply(this,args);};
  }
  forbidMethods(fsNative,['write','writeSync','writev','writevSync','ftruncate','ftruncateSync','fchmod','fchmodSync','fchown','fchownSync'],'fs.init');
  syncBuiltinESMExports();
}
const HISTORIES=[
  ['44100/default750',['--sample-rate=44100'],{sampleRate:44100}],
  ['44100/transition/250',['--case=44100/transition/250'],{caseId:'44100/transition/250'}],
  ['44100/transition/1000',['--case=44100/transition/1000'],{caseId:'44100/transition/1000'}],
  ['48000/default750',['--sample-rate=48000'],{sampleRate:48000}],
  ['48000/transition/250',['--case=48000/transition/250'],{caseId:'48000/transition/250'}],
  ['48000/transition/1000',['--case=48000/transition/1000'],{caseId:'48000/transition/1000'}],
  ['96000/default750',['--sample-rate=96000'],{sampleRate:96000}],
  ['96000/transition/250',['--case=96000/transition/250'],{caseId:'96000/transition/250'}],
  ['96000/transition/1000',['--case=96000/transition/1000'],{caseId:'96000/transition/1000'}],
];
const ALIASES=[['44100/default750',[],{}],['48000/transition/250',['--sample-rate=48000','--case=48000/transition/250'],{sampleRate:48000,caseId:'48000/transition/250'}]];
const REJECTS=[
{"argv":["--run-id=MasterCliContract","--master-witness=true"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness=false"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness=1"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness="],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witnes"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--Master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","true"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/transition/750"],"error":"audio-equalizer-case"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=unknown"],"error":"audio-equalizer-case"},
{"argv":["--master-witness","--run-id=MasterCliContract"],"error":"audio-product-args"},
{"argv":["--run-id=F01J1Native20261018","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--master-witness","--master-witness","--master-witness","--master-witness","--master-witness","--master-witness","--master-witness","--master-witness","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--sample-rate=192000"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--sample-rate=192000","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--sample-rate=044100"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--sample-rate=044100","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--sample-rate=44100","--sample-rate=44100"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--sample-rate=44100","--sample-rate=44100","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=48000/transition/250","--sample-rate=44100"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=48000/transition/250","--sample-rate=44100","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/transition/250","--case=44100/transition/250"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=44100/transition/250","--case=44100/transition/250","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/output-control/dry-unity"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=44100/output-control/dry-unity","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/normalizer/-24/stereo"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=44100/normalizer/-24/stereo","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/normalizer-control/stall-error"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=44100/normalizer-control/stall-error","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/normalizer-control/tone-silence"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=44100/normalizer-control/tone-silence","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=96000/reentry/2/10"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=96000/reentry/2/10","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/source-owner/stable"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=44100/source-owner/stable","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/source-owner/suspend-rebind"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=44100/source-owner/suspend-rebind","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/band/63/-6"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=44100/band/63/-6","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=eq63-minus6"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=eq63-minus6","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--component-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--component-witness","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--headroom-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--headroom-witness","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--browser-root=C:\\MasterCliContract"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--browser-root=C:\\MasterCliContract","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--browser-root="],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--browser-root=","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--browser-manifest-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--browser-manifest-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--browser-manifest-sha256="],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--browser-manifest-sha256=","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--shutdown-contract=run-job-v1"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--shutdown-contract=run-job-v1","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--shutdown-contract="],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--shutdown-contract=","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--job-helper=C:\\MasterCliContract\\owner.exe"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--job-helper=C:\\MasterCliContract\\owner.exe","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--job-helper="],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--job-helper=","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--job-helper-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--job-helper-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--job-helper-sha256="],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--job-helper-sha256=","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/normalizer-control/tone-silence","--browser-root=C:\\MasterCliContract","--browser-manifest-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=44100/normalizer-control/tone-silence","--browser-root=C:\\MasterCliContract","--browser-manifest-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","--master-witness"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--master-witness","--case=44100/normalizer-control/tone-silence","--browser-root=C:\\MasterCliContract","--browser-manifest-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","--shutdown-contract=run-job-v1","--job-helper=C:\\MasterCliContract\\owner.exe","--job-helper-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],"error":"audio-product-args"},
{"argv":["--run-id=MasterCliContract","--case=44100/normalizer-control/tone-silence","--browser-root=C:\\MasterCliContract","--browser-manifest-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","--shutdown-contract=run-job-v1","--job-helper=C:\\MasterCliContract\\owner.exe","--job-helper-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","--master-witness"],"error":"audio-product-args"}
];
const counts={masterStops:0,legacyStops:0,falseStops:0,apiRejected:0,parserRejected:0,legacyParserBaselines:0};
async function stopAtAttest(runProductAudio,options,master){
  live();let attestCalls=0;const calls=[],sentinel=Object.freeze({sentinel:'selection-only'}),runId=options.runId;
  const files={
    async lstat(name,config){live();calls.push([name,config]);assert.ok(calls.length<=3,'LSTAT_LIMIT');return null;},
    writeFile:denied('synthetic.writeFile'),readFile:denied('synthetic.readFile'),readChunks:denied('synthetic.readChunks'),
    ensureDirectory:denied('synthetic.ensureDirectory'),rm:denied('synthetic.rm'),unlink:denied('synthetic.unlink'),readdir:denied('synthetic.readdir'),
  };
  const deps={platform:'win32',files,execute:denied('execute'),launchVisibilityBrowser:denied('launchVisibilityBrowser'),
    async attest(shared,required){
      live();attestCalls++;assert.equal(attestCalls,1);assert.ok(Array.isArray(required)&&required.includes('scripts/check-product-audio.mjs')&&required.includes('scripts/extension-e2e/audio-product.mjs'));
      if(master){assert.notEqual(shared,files);assert.notEqual(shared.writeFile,files.writeFile);assert.notEqual(shared.readFile,files.readFile);}
      else assert.equal(shared,files);
      for(const key of ['lstat','readChunks','ensureDirectory','rm','unlink','readdir'])assert.equal(shared[key],files[key]);
      throw sentinel;
    },
  };
  await assert.rejects(runProductAudio(Object.freeze({...options}),deps),error=>error===sentinel,'exact pre-write sentinel');
  live();assert.equal(attestCalls,1);assert.deepEqual(calls,[['output/audio-product-'+runId,{optional:true}],['output/playwright/installed-extension-'+runId,{optional:true}],['output/tool-audit/p02-candidate-'+runId,{optional:true}]]);
  assert.deepEqual(observedEffects,[]);
}
async function main(){
  assert.equal(process.platform,'win32');assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,['--max-old-space-size=256']);
  for(const key of Object.keys(process.env))assert.ok(!/^(NODE_|PW|PLAYWRIGHT_|ESBUILD_|DEBUG)/i.test(key),'unsafe init environment');
  guardProcessesAndNetwork();guardInitializationWrites();guardReadOnlyOpen();live();
  const product=await import(pathToFileURL(path.join(root,'scripts/extension-e2e/audio-product.mjs')));
  const {runProductAudio}=await import(pathToFileURL(path.join(root,'scripts/check-product-audio.mjs')));
  live();assert.deepEqual(observedEffects,[]);guardOperationalFiles();
  assert.deepEqual(product.PRODUCT_TRANSITION_CASES,HISTORIES.filter(row=>row[2].caseId).map(([id])=>({id,sampleRate:Number(id.split('/')[0]),frequency:Number(id.split('/')[2])})),'exact original transition registry');
  const parse=product.parseProductAudioArgs,runId='MasterCliContract';
  for(const [id,args,expected]of [...HISTORIES,...ALIASES]){
    live();const legacy=parse(['--run-id='+runId,...args]);assert.deepEqual(legacy,{runId,...expected},id);assert.equal(Object.hasOwn(legacy,'masterWitness'),false);
    await stopAtAttest(runProductAudio,legacy,false);counts.legacyStops++;
    const selected=parse(['--run-id='+runId,'--master-witness',...args]);assert.deepEqual(selected,{runId,...expected,masterWitness:true},id);
    await stopAtAttest(runProductAudio,selected,true);counts.masterStops++;
  }
  await stopAtAttest(runProductAudio,{runId:'MasterCliFalse',sampleRate:44100,masterWitness:false},false);counts.falseStops++;
  for(const {argv,error}of REJECTS){live();assert.throws(()=>parse(argv),{message:error});assert.deepEqual(observedEffects,[]);counts.parserRejected++;}
  const hash='a'.repeat(64),browserCandidate={root:'C:\\MasterCliContract',manifestSha256:hash},runJob={contract:'run-job-v1',helper:{path:'C:\\MasterCliContract\\owner.exe',sha256:hash}};
  const baselines=[
    [['--case=44100/band/63/-6','--component-witness'],{caseId:'44100/band/63/-6',componentWitness:true}],
    [['--case=44100/normalizer/-24/stereo','--headroom-witness'],{caseId:'44100/normalizer/-24/stereo',headroomWitness:true}],
    [['--case=44100/normalizer-control/tone-silence','--browser-root='+browserCandidate.root,'--browser-manifest-sha256='+hash],{caseId:'44100/normalizer-control/tone-silence',browserCandidate}],
    [['--case=44100/normalizer-control/tone-silence','--browser-root='+browserCandidate.root,'--browser-manifest-sha256='+hash,'--shutdown-contract=run-job-v1','--job-helper='+runJob.helper.path,'--job-helper-sha256='+hash],{caseId:'44100/normalizer-control/tone-silence',browserCandidate,runJob}],
  ];
  for(const [args,expected]of baselines){live();const actual=parse(['--run-id='+runId,...args]);assert.deepEqual(actual,{runId,...expected});assert.equal(Object.hasOwn(actual,'masterWitness'),false);counts.legacyParserBaselines++;}
  const apiRejects=[
    [{masterWitness:'true'},'audio-product-master-profile'],
    [{masterWitness:true,caseId:'44100/band/63/-6'},'audio-product-master-profile'],
    [{masterWitness:true,componentWitness:true,caseId:'44100/band/63/-6'},'audio-product-master-profile'],
    [{masterWitness:true,headroomWitness:true,caseId:'44100/normalizer/-24/stereo'},'audio-product-master-profile'],
    [{sampleRate:'44100',masterWitness:'true'},'audio-product-sample-rate'],
  ];
  for(const [options,error]of apiRejects){
    live();const forbidden=denied('rejected-API-effect');
    await assert.rejects(runProductAudio({runId,...options},{platform:'win32',files:{lstat:forbidden,writeFile:forbidden,ensureDirectory:forbidden},attest:forbidden,execute:forbidden,launchVisibilityBrowser:forbidden}),{message:error});
    live();assert.deepEqual(observedEffects,[]);counts.apiRejected++;
  }
  live();assert.deepEqual(counts,{masterStops:11,legacyStops:11,falseStops:1,apiRejected:5,parserRejected:69,legacyParserBaselines:4});assert.deepEqual(observedEffects,[]);
  emit({schema:'f01-master-cli-host-v1',status:'PASS',histories:HISTORIES.map(row=>row[0]),counts,scope:SCOPE});
}
process.on('unhandledRejection',stop);process.on('uncaughtException',stop);
process.once('beforeExit',()=>{try{live();assert.deepEqual(observedEffects,[]);}catch(error){stop(error);}});
main().catch(stop);
