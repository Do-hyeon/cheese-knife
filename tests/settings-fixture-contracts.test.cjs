/// <reference path="../src/settings/config.ts" />
/// <reference path="../src/settings/style-schema.ts" />
/// <reference path="../src/settings/contract.ts" />
/// <reference path="../src/settings/client.ts" />
/// <reference path="../src/settings/broker.ts" />
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {transformSync} = require('esbuild');
const {settingsHarness, config, style, parameter, event} = require('./settings-fixture.cjs');

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
/** @param {string} source */
function normalizedHash(source) {
  const code = transformSync(source, {loader:'js',format:'cjs',platform:'node',target:'node24',treeShaking:false,minifyWhitespace:true,minifySyntax:false,legalComments:'none'}).code;
  return createHash('sha256').update(code).digest('hex');
}
/** @param {string} source */
function child(source) {
  const result = spawnSync(process.execPath, ['-e',source], {encoding:'utf8',timeout:15000,maxBuffer:1048576});
  assert.ifError(result.error); assert.equal(result.signal,null); assert.equal(result.status,0,result.stdout+result.stderr); assert.equal(result.stderr,'');
  return result.stdout.trim();
}
/** @param {import('node:test').TestContext} t */
function proofDirectory(t) {
  fs.mkdirSync('output',{recursive:true});
  const directory = fs.mkdtempSync(path.resolve('output/settings-fixture-types-'));
  t.after(() => {
    const real = fs.realpathSync(directory), relative = path.relative(fs.realpathSync('output'),real);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(real,{recursive:true,force:true});
  });
  return directory;
}

test('fixture compatibility: event snapshots listeners and preserves returns', () => {
  /** @type {string[]} */ const trace=[];
  const events=event();
  const c=()=>trace.push('C'), b=()=>trace.push('B');
  const a=()=>{trace.push('A');events.removeListener(b);events.addListener(c);};
  assert.equal(events.addListener(a),events.listeners); events.addListener(b);
  events.emit(); events.emit(); assert.deepEqual(trace,['A','B','A','C']);
  assert.equal(events.removeListener(c),true); assert.equal(events.removeListener(c),false);
});

test('fixture compatibility: seed read commit clocks and identities stay distinct', async t => {
  const seed={future:{value:1}}, h=settingsHarness(t,seed), saved=h.saved, registrations=h.registrations;
  seed.future.value=9; assert.deepEqual(h.saved.future,{value:1});
  const api=h.apiFor(), commit=h.holdNext('commit'), value={future:{value:1}};
  const writing=api.storage.local.set(value); await commit.reached;
  const log=h.calls.find(entry=>entry.kind==='commit'); assert.ok(log && record(log.args));
  assert.deepEqual(log.args.value,{future:{value:1}});
  value.future.value=2; commit.release(); await writing; await h.settle();
  assert.deepEqual(h.saved.future,{value:2}); assert.deepEqual(log.args.value,{future:{value:1}});
  const read=h.holdNext('read'), reading=api.storage.local.get(['future']); await read.reached;
  h.saved.future={value:3}; read.release(); assert.deepEqual(await reading,{future:{value:2}});
  const css=h.holdNext('css-register'), registering=api.scripting.registerContentScripts([{id:'foreign'}]);
  await css.reached; assert.equal(h.maxConcurrentCss,1); css.release(); await registering;
  assert.equal(h.saved,saved); assert.equal(h.registrations,registrations); assert.equal(h.maxConcurrentWrites,1);
});

test('fixture compatibility: normal requests clone before delivery and callback replies clone late', async t => {
  const h=settingsHarness(t); await h.initialize(); const api=h.apiFor('popup'), commit=h.holdNext('commit');
  const operation=config('arrowSeek',false);
  /** @type {KnifeSettingsRequest} */ const request={namespace:'cheese-knife-settings',protocol:1,requestId:'clone',action:'patch',operations:[operation]};
  const done=new Promise(resolve=>api.runtime.sendMessage(request,resolve));
  operation.value=true; await commit.reached; commit.release(); await done; await h.settle();
  const logged=h.messages.at(-1); assert.ok(logged); assert.deepEqual(logged.message,{
    namespace:'cheese-knife-settings',protocol:1,requestId:'clone',action:'patch',operations:[{type:'config',id:'arrowSeek',value:false}],
  });
  assert.ok(record(h.saved.config)); assert.equal(h.saved.config.arrowSeek,false);
  const gate=h.holdNext('callback:get-snapshot');
  /** @type {Promise<unknown>} */ const replyPromise=new Promise(resolve=>api.runtime.sendMessage({namespace:'cheese-knife-settings',protocol:1,requestId:'late',action:'get-snapshot'},resolve));
  const reply=await gate.reached; assert.ok(record(reply)); reply.probe=7; gate.release();
  const delivered=await replyPromise; assert.notEqual(delivered,reply); assert.ok(record(delivered)); assert.equal(delivered.probe,7);
  const response=h.holdNext('response'), raw=h.snapshot(); const original=await response.reached;
  response.release(); assert.equal(await raw,original);
});

test('fixture compatibility: generated state commit ack disposal and explicit recovery', async t => {
  const h=settingsHarness(t); await h.initialize(); const c=h.client('popup',{fakeTime:true});
  const initial=c.view(); assert.ok(initial); assert.equal(initial.phase,'loading'); assert.equal(initial.snapshot,null);
  await h.settle(); const ready=c.view(); assert.ok(ready && ready.snapshot); assert.equal(ready.phase,'ready'); assert.ok(c.time);
  const commit=h.holdNext('commit'), ack=h.holdNext('callback:patch'); c.edit(config('arrowSeek',false)); await commit.reached;
  assert.deepEqual(h.saved,{});
  const pending=c.view(); assert.ok(pending); assert.equal(pending.values.config.arrowSeek,false); assert.deepEqual(Array.from(pending.pendingKeys),['config:arrowSeek']);
  commit.release(); await ack.reached; assert.ok(record(h.saved.config)); assert.equal(h.saved.config.arrowSeek,false); assert.equal(c.maxInflight(),1);
  ack.release(); await h.settle();
  c.edit(config('previewVolume',25)); await h.settle(); c.edit(style('left-chat',true)); await h.settle();
  c.edit(parameter('chat-font-size',8)); await h.settle(); c.edit(parameter('chat-font-size',0)); await h.settle();
  const final=c.view(); assert.ok(final && final.snapshot); assert.equal(final.values.config.previewVolume,25);
  assert.ok(final.values.styles.includes('left-chat')); assert.equal(final.values.styleParameters['chat-font-size'],0);
  h.failNext('callback:patch'); c.edit(config('previewVolume',10)); await h.settle();
  const uncertain=c.view(); assert.ok(uncertain); assert.equal(uncertain.phase,'unknown'); assert.equal(uncertain.code,'response-unknown');
  const count=h.messages.filter(m=>m.message.action==='patch').length; await c.time.advance(10000); await h.settle();
  assert.equal(h.messages.filter(m=>m.message.action==='patch').length,count);
  c.edit(config('previewVolume',30)); await h.settle(); const recovered=c.view(); assert.ok(recovered); assert.equal(recovered.phase,'ready');
  const late=h.holdNext('callback:patch'); let renders=0; c.subscribe(()=>renders++); c.edit(config('previewVolume',40)); await late.reached;
  const before=renders,listeners=h.changes.listeners.size; c.dispose(); c.dom.window.close(); late.release(); await h.settle();
  assert.equal(renders,before); assert.equal(h.changes.listeners.size,listeners-1);
});

const fixturePath=path.resolve('tests/settings-fixture.cjs');
/** @param {string} fixture @param {string} mode */
function callbackScript(fixture,mode) {
  return `const assert=require('node:assert/strict'),fs=require('node:fs');
const {settingsHarness,config}=require(${JSON.stringify(fixture)});
const cleanup=[],rejections=[],watchdog=setTimeout(()=>process.exit(2),10000);
const onReject=e=>rejections.push(e.message);process.on('unhandledRejection',onReject);
(async()=>{const sources=Object.fromEntries(['config.js','style-schema.js','settings-contract.js','settings-broker.js'].map(f=>[f,fs.readFileSync(f,'utf8')]));
const h=settingsHarness({after:f=>cleanup.push(f)}, {}, sources);await h.initialize();const c=h.client('popup');await h.settle();const api=c.api;
let calls=0;const observations=[];const gate=h.holdNext('callback:patch');
api.runtime.sendMessage({namespace:'cheese-knife-settings',protocol:1,requestId:'probe',action:'patch',operations:[config('arrowSeek',false)]},reply=>{
calls++;observations.push({ok:reply?.ok??null,error:api.runtime.lastError?.message??null});
if(${JSON.stringify(mode)}==='failure-throw'||${JSON.stringify(mode)}==='both-throw'||(${JSON.stringify(mode)}==='success-once'&&calls===1))throw new Error('callback-probe-threw');});
await gate.reached;if(${JSON.stringify(mode)}.startsWith('failure'))gate.fail();else gate.release();await h.settle();await new Promise(r=>setTimeout(r,30));
let max=null;if(${JSON.stringify(mode)}==='success-once'){const a=h.holdNext('callback:patch'),b=h.holdNext('callback:patch');
for(const id of ['a','b'])api.runtime.sendMessage({namespace:'cheese-knife-settings',protocol:1,requestId:id,action:'patch',operations:[config('arrowSeek',false)]},()=>{});
await Promise.all([a.reached,b.reached]);max=c.maxInflight();a.release();b.release();await h.settle();}
const last=api.runtime.lastError?.message??null;await h.settle();h.restartBroker(sources);await h.initialize();await h.settle();
console.log(JSON.stringify({calls,observations,last,rejections,max,restarted:true}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const f of cleanup)f();process.removeListener('unhandledRejection',onReject);clearTimeout(watchdog);});`;
}
test('fixture compatibility: callback exceptions retain actual cleanup and counter outcomes', () => {
  /** @type {Array<[string,unknown]>} */ const expected=[
    ['failure-normal',{calls:1,observations:[{ok:null,error:'channel-unavailable'}],last:null,rejections:[],max:null,restarted:true}],
    ['failure-throw',{calls:1,observations:[{ok:null,error:'channel-unavailable'}],last:'channel-unavailable',rejections:['callback-probe-threw'],max:null,restarted:true}],
    ['success-once',{calls:2,observations:[{ok:true,error:null},{ok:null,error:'channel-unavailable'}],last:null,rejections:[],max:1,restarted:true}],
    ['both-throw',{calls:2,observations:[{ok:true,error:null},{ok:null,error:'channel-unavailable'}],last:'channel-unavailable',rejections:['callback-probe-threw'],max:null,restarted:true}],
  ];
  for(const [mode,want] of expected) assert.deepEqual(JSON.parse(child(callbackScript(fixturePath,mode))),want);
});

test('fixture compatibility: post-eval Chrome replacement and original nullable src exception', async t => {
  const sources={
    'config.js':fs.readFileSync('config.js','utf8')+`;globalThis.fixtureReads=0;const prior=chrome;chrome=new Proxy(prior,{get(target,key){if(key==='storage')fixtureReads++;return Reflect.get(target,key);}});`,
    'style-schema.js':fs.readFileSync('style-schema.js','utf8'), 'settings-contract.js':fs.readFileSync('settings-contract.js','utf8'), 'settings-broker.js':fs.readFileSync('settings-broker.js','utf8'),
  };
  const h=settingsHarness(t,{},sources); await h.initialize(); await h.patch('popup',[config('arrowSeek',false)]); assert.ok(h.worker);
  const reads=h.worker.window.eval('fixtureReads'); assert.ok(typeof reads==='number'&&reads>0);
  await assert.rejects(h.openUi('popup',{setup:(_api,dom)=>{
    const script=dom.window.document.querySelector('script[src]'); assert.ok(script); const original=script.getAttribute.bind(script);
    script.getAttribute=name=>name==='src'?null:original(name);
  }}),{name:'TypeError',code:'ERR_INVALID_ARG_TYPE',message:'The "path" argument must be of type string or an instance of Buffer or URL. Received null'});
});

test('fixture compatibility: baseline runtime tokens and changed lastError oracle control', t => {
  const original=fs.readFileSync(fixturePath,'utf8');
  // One-time provenance: untouched051aad1/82eb66d; CI needs no historical object.
  assert.equal(normalizedHash(original),'839420561b9c62c7ca0d66fc65dd5313216b81e6751bed41e3d2073f09ad4713');
  const directory=proofDirectory(t), copy=original.replace("require('./helpers.cjs')",`require(${JSON.stringify(path.resolve('tests/helpers.cjs'))})`);
  assert.equal(original.split("require('./helpers.cjs')").length,2);
  const file=path.join(directory,'raw.cjs'); fs.writeFileSync(file,copy);
  assert.equal(JSON.parse(child(callbackScript(file,'failure-normal'))).last,null);
  assert.equal(copy.split('delete api.runtime.lastError;').length,2);
  fs.writeFileSync(file,copy.replace('delete api.runtime.lastError;',''));
  assert.equal(JSON.parse(child(callbackScript(file,'failure-normal'))).last,'channel-unavailable');
  const assertCleanup=callbackScript(file,'failure-normal').replace('console.log(JSON.stringify({calls,observations,last,rejections,max,restarted:true}));',"assert.equal(last,null,'lastError cleanup oracle');");
  const failed=spawnSync(process.execPath,['-e',assertCleanup],{encoding:'utf8',timeout:15000,maxBuffer:1048576});
  assert.ifError(failed.error); assert.equal(failed.signal,null); assert.equal(failed.status,1); assert.match(failed.stderr,/AssertionError.*lastError cleanup oracle/s);
  assert.notEqual(normalizedHash(copy),normalizedHash(copy.replace('delete api.runtime.lastError;','')));
  assert.equal(fs.readFileSync(fixturePath,'utf8'),original);
});

test('fixture compatibility: clone timing oracle rejects an eager commit clone', t => {
  const original=fs.readFileSync(fixturePath,'utf8'), directory=proofDirectory(t), file=path.join(directory,'raw.cjs');
  const copy=original.replace("require('./helpers.cjs')",`require(${JSON.stringify(path.resolve('tests/helpers.cjs'))})`);
  const source=`const assert=require('node:assert/strict'),{settingsHarness}=require(${JSON.stringify(file)}),cleanup=[];
const watchdog=setTimeout(()=>process.exit(2),10000);
(async()=>{const h=settingsHarness({after:f=>cleanup.push(f)}),api=h.apiFor(),gate=h.holdNext('commit'),value={future:{value:1}};
const writing=api.storage.local.set(value);await gate.reached;value.future.value=2;gate.release();await writing;
assert.deepEqual(h.saved.future,{value:2},'late commit clone oracle');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const f of cleanup)f();clearTimeout(watchdog);});`;
  fs.writeFileSync(file,copy); child(source);
  assert.equal(copy.split("await boundary('commit', { name, value });").length,2);
  assert.equal(copy.split('Object.assign(saved, structuredClone(value))').length,2);
  const eager=copy.replace("await boundary('commit', { name, value });","const eager = structuredClone(value); await boundary('commit', { name, value });").replace('Object.assign(saved, structuredClone(value))','Object.assign(saved, eager)');
  fs.writeFileSync(file,eager);
  const failed=spawnSync(process.execPath,['-e',source],{encoding:'utf8',timeout:15000,maxBuffer:1048576});
  assert.ifError(failed.error); assert.equal(failed.signal,null); assert.equal(failed.status,1); assert.match(failed.stderr,/AssertionError.*late commit clone oracle/s);
  assert.equal(fs.readFileSync(fixturePath,'utf8'),original);
});

/** @param {string} configFile @param {boolean} [inventory] */
function compile(configFile,inventory=false) {
  const result=spawnSync(process.execPath,[path.resolve('node_modules/typescript/bin/tsc'),'-p',configFile,...(inventory?['--listFilesOnly']:['--pretty','false'])],{encoding:'utf8',timeout:30000,maxBuffer:1048576});
  assert.ifError(result.error); assert.equal(result.signal,null); assert.notEqual(result.status,null); assert.equal(result.stderr,''); return result;
}
/** @param {string} directory @param {string[]} files */
function proofConfig(directory,files) {
  const file=path.join(directory,'tsconfig.json'); fs.writeFileSync(file,JSON.stringify({extends:path.resolve('tsconfig.settings-fixture.json'),files,include:[]})); return file;
}
/** @param {ReturnType<typeof compile>} result @param {Map<string,Map<number,string>>} targets */
function diagnostics(result,targets) {
  assert.ok(result.status!==null&&result.status>0,result.stdout);
  /** @type {Map<string,Set<number>>} */ const seen=new Map();
  for(const line of result.stdout.trim().split(/\r?\n/)) {
    if(/^ {2,}\S/.test(line)){assert.doesNotMatch(line,/\berror TS\d+:/);continue;}
    const match=/^(.+)\((\d+),\d+\): error (TS\d+):/.exec(line); assert.ok(match,line);
    const file=path.resolve(match[1]||''), number=Number(match[2]), codes=targets.get(file)?.get(number);
    assert.ok(codes,line); assert.ok(codes.split('|').includes(match[3]||''),line);
    const positions=seen.get(file)||new Set(); positions.add(number); seen.set(file,positions);
  }
  assert.deepEqual([...seen.keys()].sort(),[...targets.keys()].filter(file=>targets.get(file)?.size).sort());
  for(const [file,rows] of targets) assert.deepEqual([...(seen.get(file)||[])].sort((a,b)=>a-b),[...rows.keys()].sort((a,b)=>a-b),file);
}

test('fixture checker keeps strict options and the exact thirteen-file graph', () => {
  const project=JSON.parse(fs.readFileSync('tsconfig.settings-fixture.json','utf8')), parent=JSON.parse(fs.readFileSync('tsconfig.development.json','utf8'));
  assert.deepEqual(project,{extends:'./tsconfig.development.json',compilerOptions:{moduleDetection:'legacy',types:['node','chrome']},files:['tests/settings-fixture.cjs','tests/settings-fixture-contracts.test.cjs'],include:[]});
  for(const key of ['allowJs','checkJs','noEmit','strict','noUncheckedIndexedAccess','exactOptionalPropertyTypes','useUnknownInCatchVariables']) assert.equal(parent.compilerOptions[key],true);
  assert.equal(parent.compilerOptions.skipLibCheck,undefined);
  const inventory=compile(path.resolve('tsconfig.settings-fixture.json'),true); assert.equal(inventory.status,0,inventory.stdout);
  const actual=inventory.stdout.trim().split(/\r?\n/).map(file=>path.relative(process.cwd(),file).replaceAll('\\','/')).filter(file=>!file.startsWith('node_modules/'));
  assert.deepEqual(actual.sort(),[
    'tests/settings-fixture.cjs','tests/settings-fixture-contracts.test.cjs','tests/helpers.cjs',
    'src/settings/config.ts','src/settings/style-schema.ts','src/settings/contract.ts','src/settings/client.ts','src/settings/broker.ts',
    'src/main/runtime/contracts.ts','src/main/site-adapter/contracts.ts','src/main/features/audio/contracts.ts','src/main/features/player/contracts.ts','src/main/features/preview/contracts.ts',
  ].sort());
});

test('fixture public contract accepts real raw normal calls and rejects eighteen misuses', t => {
  const directory=proofDirectory(t), file=path.join(directory,'proof.cjs'), project=proofConfig(directory,[file]);
  const setup=[
    `const {settingsHarness,config,style,parameter,event}=require(${JSON.stringify(fixturePath)});`,
    '/** @param {import("node:test").TestContext} t */',
    'async function proof(t){',
    'const h=settingsHarness(t),c=h.client("popup"),api=c.api;',
    'const request={namespace:"cheese-knife-settings",protocol:1,requestId:"proof",action:"get-snapshot"};',
  ];
  const positive=[...setup,
    'c.edit(config("any-id",NaN));c.edit(style("left-chat",true));c.edit(parameter("chat-font-size",Infinity));',
    'api.runtime.sendMessage({namespace:"cheese-knife-settings",protocol:1,requestId:"proof",action:"get-snapshot"},reply=>{const raw=reply;});',
    'api.storage.onChanged.emit({config:42},"local");api.storage.onChanged.addListener((delta,area)=>{area.toUpperCase();});',
    'const gate=h.holdNext("anything");gate.release();gate.entered({arbitrary:true});gate.reached.then(value=>{const raw=value;});',
    'const view=c.view();if(view?.snapshot)view.snapshot.revision.toFixed();if(c.time)await c.time.advance(0);',
    'await api.scripting.registerContentScripts([{id:"foreign"},{id:"mixed",js:["x"],css:["y"]}]);const tabs=await api.tabs.query({active:true});if(tabs[0])tabs[0].id.toFixed();',
    'settingsHarness(t,{}, {"config.js":"x","style-schema.js":"x","settings-contract.js":"x","settings-broker.js":"x"});',
    'h.client("popup",{fakeTime:undefined});await h.openUi("popup",{locale:undefined,query:undefined,target:undefined,fakeTime:undefined,setup:undefined});',
    'await h.send("popup",42,{arbitrary:true});await h.request("popup","unknown",{payload:42});const raw=await h.snapshot();',
    '}'];
  fs.writeFileSync(file,positive.join('\n')); const valid=compile(project); assert.equal(valid.status,0,valid.stdout); assert.equal(valid.stdout,'');
  const rows=[
    ['config(42,true);','TS2345'],['config("x","true");','TS2345'],['style("x",1);','TS2345'],['parameter("x","8");','TS2345'],
    ['c.edit({type:"style",id:"x",enabled:1});','TS2322'],
    ['api.runtime.sendMessage({namespace:"cheese-knife-settings",protocol:1,requestId:"x",action:"get-snapshot"},reply=>reply.ok);','TS18046'],
    ['api.runtime.sendMessage({namespace:"cheese-knife-settings",protocol:1,requestId:"x",action:"get-snapshot"},/** @param {number} reply */ reply=>{});','TS2345'],
    ['api.storage.onChanged.emit({},42);','TS2345'],['api.storage.onChanged.addListener((delta,area)=>area.__missing);','TS2339'],
    ['h.holdNext(42);','TS2345'],['h.holdNext("x").reached.then(value=>value.__missing);','TS18046'],
    ['c.view().phase;','TS2532|TS18048'],['const nullable=c.view();if(nullable)nullable.snapshot.revision;','TS18047'],
    ['c.time.advance(0);','TS2532|TS18048'],['h.saved.config.preview;','TS18046'],['const rawSnapshot=await h.snapshot();rawSnapshot.ok;','TS18046'],
    ['api.tabs.create({url:42});','TS2322'],['api.scripting.registerContentScripts([{id:42}]);','TS2322'],
  ];
  fs.writeFileSync(file,[...setup,...rows.map(row=>row[0]),'}'].join('\n'));
  const targets=new Map(rows.map((row,index)=>[setup.length+index+1,row[1]||''])); assert.equal(targets.size,18); diagnostics(compile(project),new Map([[file,targets]]));
});

test('fixture actual internal bindings reject five goals and each one-boundary weakening is falsifiable', t => {
  const directory=proofDirectory(t), original=fs.readFileSync(fixturePath,'utf8').replaceAll('\r\n','\n');
  const helper="require('./helpers.cjs')", absoluteHelper=`require(${JSON.stringify(path.resolve('tests/helpers.cjs'))})`;
  assert.equal(original.split(helper).length,2);
  let copy=original.replace(helper,absoluteHelper), references=0;
  /** @type {Array<[string,string]>} */ const rewrites=[];
  copy=copy.replace(/<reference path="([^"]+)" \/>/g,(match,relative)=>{
    references++; const replacement=`<reference path="${path.resolve('tests',relative).replaceAll('\\','/')}" />`; rewrites.push([match,replacement]); return replacement;
  });
  assert.equal(references,5);
  let restored=copy.replace(absoluteHelper,helper); for(const [before,after] of rewrites) restored=restored.replace(after,before);
  assert.equal(restored,original);
  const controls=[
    ['/** @type {Set<FixtureFn<Args>>} */','/** @type {Set<any>} */'],
    ['respond:(response:unknown)=>void','respond:(response:any)=>void'],
    ['/** @type {Promise<unknown>} */ const reached','/** @type {Promise<any>} */ const reached'],
    ['@typedef {(value:RawStore)=>Promise<void>} FixtureStorageWrite','@typedef {(value:Record<string,any>)=>Promise<void>} FixtureStorageWrite'],
    ['@typedef {(value:FixtureChrome)=>FixtureClient} FixtureClientFactory',"@typedef {(value:FixtureChrome)=>Omit<FixtureClient,'subscribe'>&{subscribe:(fn:(view:any)=>void)=>ReturnType<FixtureClient['subscribe']>}} FixtureClientFactory"],
  ];
  /** @type {Array<{file:string,source:string,weak:number}>} */ const copies=[];
  for(let index=-1;index<controls.length;index++) {
    let source=copy; const control=controls[index];
    if(control){assert.ok(control[0]&&control[1]);assert.equal(source.split(control[0]).length,2);source=source.replace(control[0],control[1]);}
    const file=path.join(directory,index<0?'strong.cjs':`weak-${index}.cjs`); fs.writeFileSync(file,source); copies.push({file,source,weak:index});
  }
  const project=proofConfig(directory,copies.map(entry=>entry.file));
  const clean=compile(project); assert.equal(clean.status,0,clean.stdout); assert.equal(clean.stdout,'');
  const anchors=['fn(...args);','broker.listener(structuredClone(message), sender, reply => {','const reached = new Promise(a =>','Object.entries(value).map(([k, v]) => [k,','instance.subscribe(v => { view = v; });'];
  /** @type {Map<string,Map<number,string>>} */ const allTargets=new Map();
  for(const entry of copies) {
    for(const anchor of anchors) assert.equal(entry.source.split(anchor).length,2,anchor);
    /** @type {string[]} */ const lines=[]; const targets=new Map();
    for(let line of entry.source.split('\n')) {
      if(line.includes(anchors[0]||'')) {line=line.replace('fn(...args);',"fn(...args,'__dt01s_extra');");if(entry.weak!==0)targets.set(lines.length+1,'TS2345');}
      if(line.includes(anchors[3]||'')) {line=line.replace('[k, v]) => [k,','[k, v]) => [(v.__dt01s_missing,k),');if(entry.weak!==3)targets.set(lines.length+1,'TS18046');}
      if(line.includes(anchors[4]||'')) {line=line.replace('view = v;','v.__dt01s_missing; view = v;');if(entry.weak!==4)targets.set(lines.length+1,'TS2339');}
      lines.push(line);
      if(line.includes(anchors[1]||'')){lines.push('          reply.__dt01s_missing;');if(entry.weak!==1)targets.set(lines.length,'TS18046');}
      if(line.includes(anchors[2]||'')){lines.push('    reached.then(value=>value.__dt01s_missing);');if(entry.weak!==2)targets.set(lines.length,'TS18046');}
    }
    assert.equal(targets.size,entry.weak<0?5:4); fs.writeFileSync(entry.file,lines.join('\n')); allTargets.set(entry.file,targets);
  }
  assert.equal([...allTargets.values()].reduce((sum,targets)=>sum+targets.size,0),25); diagnostics(compile(project),allTargets);
  assert.equal(fs.readFileSync(fixturePath,'utf8').replaceAll('\r\n','\n'),original);
});

test('fixture checker connects once to both offline foundation platforms without changing old gates', () => {
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8')), ci=fs.readFileSync('.github/workflows/ci.yml','utf8');
  assert.equal(pkg.scripts['typecheck:settings-fixture'],'tsc -p tsconfig.settings-fixture.json');
  assert.equal(pkg.scripts.test,'node --test tests/*.test.cjs');
  assert.match(ci,/os: \[windows-latest, ubuntu-latest\]/);
  const foundation=ci.split('\n  verify:')[0]; assert.ok(foundation);
  const command=/run: (npm run check:toolchain[^\r\n]+)/.exec(foundation)?.[1]; assert.ok(command);
  assert.equal(command,'npm run check:toolchain && npm run check:runtime-js && npm run typecheck:settings-fixture && npm run typecheck && npm run typecheck:development && npm run check:settings-runtime && npm run check:main-runtime && npm run check:build-proof && npm run typecheck:audio-tools');
  assert.equal((ci.match(/npm run typecheck:settings-fixture/g)||[]).length,1);
  assert.match(command,/npm run typecheck && npm run typecheck:development/); assert.ok(command.endsWith('npm run typecheck:audio-tools'));
  for(const fragment of ['npm_config_offline: "true"','HTTP_PROXY: http://127.0.0.1:9','HTTPS_PROXY: http://127.0.0.1:9','NO_PROXY: ""']) assert.ok(foundation.includes(fragment));
});
