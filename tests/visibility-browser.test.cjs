const test=require('node:test'),assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const load=()=>import('../scripts/extension-e2e/visibility-browser.mjs');
test('standalone synthetic browser rejects unsafe profile paths before accessing the browser provider',async()=>{
  const {launchVisibilityBrowser}=await load();assert.equal(typeof launchVisibilityBrowser,'function');
  const chromiumApi={connectOverCDP(){throw new Error('provider invoked');},executablePath(){throw new Error('provider invoked');}};
  for(const profilePath of ['relative/profile',''])await assert.rejects(launchVisibilityBrowser({chromiumApi,profilePath,artifactPath:'C:/owned/artifacts',headed:false}),/visibility-launch-invalid/);
});
test('standalone measurement arguments keep an anonymous pipe and omit all extension loading flags',async()=>{
  const {visibilityBrowserArgs}=await load(),args=visibilityBrowserArgs([],'C:/owned/synthetic-profile',false);
  assert.ok(args.includes('--remote-debugging-pipe'));assert.ok(args.includes('--user-data-dir=C:/owned/synthetic-profile'));
  assert.equal(args.some(arg=>arg.startsWith('--load-extension=')||arg.startsWith('--disable-extensions-except=')||arg.startsWith('--remote-debugging-port=')),false);
});
test('native visibility process excludes component background extensions without adding a network debug endpoint',async()=>{
  const {visibilityBrowserArgs}=await load();
  for(const headed of [false,true]){
    const args=visibilityBrowserArgs(['--disable-extensions-except=C:/owned/dist','--load-extension=C:/owned/dist'],'C:/owned/profile',headed);
    assert.ok(args.includes('--disable-component-extensions-with-background-pages'));
    assert.ok(args.includes('--remote-debugging-pipe'));assert.ok(args.includes('--user-data-dir=C:/owned/profile'));
    assert.equal(args.some(arg=>arg.startsWith('--remote-debugging-port')),false);
    assert.equal(args.includes('--headless=new'),!headed);
  }
});
for(const productCaseId of ['44100/reentry/0/0','44100/reentry/0/10','44100/reentry/0/15','44100/reentry/0/25','44100/reentry/0/36','44100/reentry/0/41','44100/reentry/0/46','44100/reentry/2/0','44100/reentry/2/10','44100/reentry/2/15','44100/reentry/2/25','44100/reentry/5/0','44100/reentry/5/10','44100/reentry/5/15','44100/reentry/5/25','96000/reentry/2/10'])test(productCaseId+' rejects a profile, extension or late query before spawning Chromium',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync('scripts/extension-e2e/visibility-browser.mjs','utf8');
  const code=source.replace(/^import (.+) from ('node:[^']+');$/gm,'const $1=require($2);')
    .replace(/^export (?=(?:async )?function )/gm,'').replace('await import(harnessSpecifier)','await unitHarness()')
    .replace('await import(profileSpecifier)','await unitProfile()')+'\nmodule.exports={launchVisibilityBrowser};';
  for(const mode of ['profile','extension','late','late-extension']){
    const module={exports:{}},profilePath='C:/owned/profile',extensionPath='C:/owned/dist';
    const deadline=1000,conflict=Object.assign(Error('native-unavailable'),{queryDiagnostic:{reason:'extension-path-conflict'}});
    let now=100,queries=0,spawns=0;
    vm.runInNewContext(code,{module,exports:module.exports,Buffer,performance:{now:()=>0},Date:{now:()=>now},
      require:name=>{
        if(name==='node:child_process')return {spawn:()=>{spawns++;throw Error('must not spawn');}};
        if(name==='node:path')return require('node:path').win32;
        if(name==='node:stream')return require('node:stream');
        if(name==='node:fs/promises')return {lstat(){throw Error('must not query disk');},realpath(){throw Error('must not query disk');}};
        throw Error('unexpected module '+name);
      },
      process:{platform:'win32'},unitHarness:async()=>({prepareWindowsBundledChromium:async()=>profilePath+'/bundled-chromium/chrome.exe',
        waitForExtensionWorker(){},extensionLaunchOptions:()=>({args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]})}),
      unitProfile:async()=>({queryWindowsProcesses:async(profile,_invoke,remaining,options)=>{
        queries++;assert.equal(profile,profilePath);assert.equal(options.extensionPath,extensionPath);assert.equal(remaining,900);
        if(mode==='extension')throw conflict;
        if(mode==='late'){now=deadline;return [];}
        if(mode==='late-extension'){now=deadline;throw conflict;}
        return [{ProcessId:42}];
      }})
    });
    await assert.rejects(module.exports.launchVisibilityBrowser({productCaseId,deadline,profilePath,extensionPath,
      artifactPath:'C:/owned/artifacts',headed:false,chromiumApi:{connectOverCDP(){throw Error('must not connect');}}}),
    error=>mode.endsWith('extension')?error===conflict:error.code===(mode==='late'?'visibility-launch-expired':'visibility-r3-profile-conflict'));
    assert.equal(queries,1);assert.equal(spawns,0);
  }
});
test('visibility pipe preserves fragmented UTF8 frames and multiple native messages',async()=>{
  const {createVisibilityTransport}=await load(),read=new PassThrough(),write=new PassThrough(),messages=[],sent=[];
  write.on('data',data=>sent.push(data));
  let complete;const received=new Promise(resolve=>complete=resolve);
  const transport=createVisibilityTransport(read,write);transport.onmessage=message=>{messages.push(message);if(messages.length===2)complete();};
  const bytes=Buffer.from('{"id":1,"result":{"text":"한글"}}\0{"method":"Target.created"}\0');
  const split=bytes.indexOf(Buffer.from('한'))+1;
  read.write(bytes.subarray(0,split));assert.deepEqual(messages,[]);read.write(bytes.subarray(split));
  await received;assert.deepEqual(messages,[{id:1,result:{text:'한글'}},{method:'Target.created'}]);
  transport.send({id:2,method:'Browser.close'});
  assert.equal(Buffer.concat(sent).toString(),'{"id":2,"method":"Browser.close"}\0');transport.close();
});
test('visibility pipe yields between coalesced messages so async response handlers can install listeners',{timeout:2000},async()=>{
  const {createVisibilityTransport}=await load(),read=new PassThrough(),write=new PassThrough(),transport=createVisibilityTransport(read,write),seen=[];
  let resolveResponse,listenerReady=false,finish;
  const response=new Promise(resolve=>resolveResponse=resolve),done=new Promise(resolve=>finish=resolve);
  async function send(){return await response;}
  const registered=send().then(()=>{listenerReady=true;});
  transport.onmessage=message=>{if(message.id===1)resolveResponse();else{seen.push(listenerReady);finish();}};
  try{read.write(Buffer.from('{"id":1,"result":{}}\0{"method":"Runtime.executionContextCreated"}\0'));await done;await registered;assert.deepEqual(seen,[true]);}
  finally{transport.close();}
});
test('visibility pipe cancels queued delivery on explicit close or pipe errors',{timeout:2000},async()=>{
  const {createVisibilityTransport}=await load();
  for(const end of ['close','read-error','write-error','read-close']){
    const read=new PassThrough(),write=new PassThrough(),transport=createVisibilityTransport(read,write);let messages=0,closed=0;
    transport.onmessage=()=>messages++;transport.onclose=()=>closed++;
    read.write(Buffer.from('{"id":1,"result":{}}\0'));
    if(end==='close')transport.close();else if(end==='read-close')read.destroy();else(end==='read-error'?read:write).emit('error',Error('fixture'));
    await new Promise(resolve=>setImmediate(resolve));assert.equal(messages,0,end);assert.equal(closed,1,end);transport.close();assert.equal(closed,1,end);
  }
});
test('visibility pipe drains complete FIFO frames before EOF and drops a truncated tail',{timeout:2000},async()=>{
  const {createVisibilityTransport}=await load(),read=new PassThrough(),write=new PassThrough(),transport=createVisibilityTransport(read,write),seen=[];
  let finish;const closed=new Promise(resolve=>finish=resolve);
  transport.onmessage=message=>seen.push(message.id);transport.onclose=()=>{seen.push('closed');finish();};
  read.write(Buffer.from('{"id":1}\0{"id":2}\0{"id":'));
  read.end();await closed;assert.deepEqual(seen,[1,2,'closed']);
});
test('visibility pipe bounds all queued bytes, not only an unfinished frame',{timeout:2000},async()=>{
  const {createVisibilityTransport}=await load(),read=new PassThrough(),write=new PassThrough(),transport=createVisibilityTransport(read,write);let messages=0,closed=0;
  transport.onmessage=()=>messages++;transport.onclose=()=>closed++;
  const frame=Buffer.from(JSON.stringify({id:1,text:'a'.repeat(8*1024*1024)})+'\0');
  for(let i=0;i<4;i++)read.write(frame);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);assert.equal(messages,0);transport.close();
});
test('visibility pipe keeps reentrant FIFO and cancels the remainder when a receiver closes it',{timeout:2000},async()=>{
  const {createVisibilityTransport}=await load();
  for(const closeInside of [false,true]){
    const read=new PassThrough(),write=new PassThrough(),transport=createVisibilityTransport(read,write),seen=[];
    let finish;const done=new Promise(resolve=>finish=resolve);
    transport.onmessage=message=>{
      seen.push(message.id);
      if(message.id===1){if(closeInside)transport.close();else read.write(Buffer.from('{"id":3}\0'));}
      if(message.id===3)transport.close();
    };
    transport.onclose=()=>finish();read.write(Buffer.from('{"id":1}\0{"id":2}\0'));await done;assert.deepEqual(seen,closeInside?[1]:[1,2,3]);
  }
});
test('visibility pipe retires once on malformed oversized or truncated native frames',async()=>{
  const {createVisibilityTransport}=await load();
  for(const bytes of [Buffer.from('bad\0'),Buffer.from('[]\0'),Buffer.alloc(32*1024*1024+1,65),Buffer.from('{"id":1')]){
    const read=new PassThrough(),write=new PassThrough(),transport=createVisibilityTransport(read,write);let closed=0,received=0;
    transport.onclose=()=>closed++;transport.onmessage=()=>received++;
    read.write(bytes);read.end();await new Promise(resolve=>setImmediate(resolve));transport.close();transport.close();
    assert.equal(received,0);assert.equal(closed,1);assert.throws(()=>transport.send({id:1}),/visibility-pipe-closed/);
    assert.equal(read.listenerCount('data'),0);
  }
});
test('visibility pipe treats read and write errors as retirement instead of uncaught process errors',async()=>{
  const {createVisibilityTransport}=await load();
  for(const side of ['read','write']){
    const read=new PassThrough(),write=new PassThrough(),transport=createVisibilityTransport(read,write);let closed=0;
    transport.onclose=()=>closed++;(side==='read'?read:write).emit('error',new Error('owned pipe error'));
    assert.equal(closed,1);transport.close();assert.equal(closed,1);
  }
});
test('owned abort stops its exact child handle and is harmless after that child has exited',async()=>{
  const {spawn}=require('node:child_process'),{once}=require('node:events'),{stopVisibilityChild}=await load();
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true}),exited=once(child,'exit');
  try{
    await stopVisibilityChild(child,exited);
    assert.ok(child.exitCode!==null||child.signalCode!==null);
    await stopVisibilityChild(child,exited);
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();}
});

async function startupFailure(primary,killOkay){
  const fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{transformSync}=require('esbuild');
  const file='scripts/extension-e2e/visibility-browser.mjs',source=fs.readFileSync(file,'utf8');
  assert.equal(source.split('await import(harnessSpecifier)').length,2);
  const code=transformSync(source.replace('await import(harnessSpecifier)','await unitHarness(harnessSpecifier)'),{format:'cjs',target:'es2022'}).code;
  const child=new EventEmitter(),read=new PassThrough(),write=new PassThrough();let kills=0;
  Object.assign(child,{stdio:[null,null,null,write,read],exitCode:null,signalCode:null,kill(){kills++;if(killOkay){child.exitCode=0;queueMicrotask(()=>child.emit('exit',0));}return killOkay;}});
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,Error,Buffer,setTimeout,clearTimeout,setImmediate,clearImmediate,
    require:name=>name==='node:child_process'?{spawn:()=>child}:name==='node:path'?require(name).win32:require(name),
    process:{platform:'win32'},unitHarness:async()=>({prepareWindowsBundledChromium:async()=> 'C:/owned/profile/bundled-chromium/chrome.exe',waitForExtensionWorker(){},extensionLaunchOptions(){}})});
  try{await module.exports.launchVisibilityBrowser({chromiumApi:{connectOverCDP:async()=>{throw primary;}},profilePath:'C:/owned/profile',artifactPath:'C:/owned/artifacts',headed:false});assert.fail('startup must fail');}
  catch(error){assert.equal(kills,1);return error;}
  finally{read.destroy();write.destroy();}
}
test('failed startup and failed owned retirement both survive the final bounded diagnostic',async()=>{
  const {nativeFailureDetails}=await import('../scripts/audio-native-browser.mjs');
  const primary=Object.freeze(Object.assign(new Error('original connection failed'),{code:'CONNECT_FAILED',secret:'must not leak'})),error=await startupFailure(primary,false),details=nativeFailureDetails(error);
  assert.equal(error.cause,primary);assert.equal(details.cause.message,'original connection failed');assert.equal(details.cause.code,'CONNECT_FAILED');assert.equal(details.retirementError.message,'visibility-child-stop-failed');assert.equal(JSON.stringify(details).includes('must not leak'),false);
});
test('successful owned startup retirement preserves the original thrown identity',async()=>{
  const primary=Object.freeze(new Error('original startup failed'));assert.equal(await startupFailure(primary,true),primary);
});
test('startup string causes and retirement diagnostics remain bounded with the same depth limit',async()=>{
  const {nativeFailureDetails}=await import('../scripts/audio-native-browser.mjs'),primary='startup '+ 'x'.repeat(5000),error=await startupFailure(primary,false);
  assert.equal(error.cause,primary);const details=nativeFailureDetails(error);assert.equal(details.cause.message,primary.slice(0,4096));assert.equal(details.retirementError.message,'visibility-child-stop-failed');
  const nested=Object.assign(new Error('nested'),{cause:error,retirementError:error,secret:'hidden'}),bounded=nativeFailureDetails(nested);assert.equal(bounded.cause.cause.cause,undefined);assert.equal(bounded.retirementError.retirementError.retirementError,undefined);assert.equal(JSON.stringify(bounded).includes('hidden'),false);
});

test('restoration failure diagnostics retain both bounded causes without exposing arbitrary fields or bypassing depth limits',async()=>{
  const {nativeFailureDetails}=await import('../scripts/audio-native-browser.mjs');
  const primary=Object.assign(Error('first-failed'),{code:'FIRST',secret:'primary-secret'}),restore=Object.assign(Error('restore-'+'.'.repeat(5000)),{code:'RESTORE',secret:'restore-secret'}),both=Object.assign(Error('audio-settings-loss-control-failed'),{code:'audio-settings-loss-control-failed',cause:primary,restorationError:restore,secret:'outer-secret'});
  const r=nativeFailureDetails(both);assert.equal(r.cause.message,'first-failed');assert.equal(r.restorationError.code,'RESTORE');assert.equal(r.restorationError.message.length,4096);assert.equal(JSON.stringify(r).includes('secret'),false);
  const missing=Object.assign(Error('restore-failed'),{restorationError:undefined});assert.deepEqual(nativeFailureDetails(missing).restorationError,{message:'native-failed'});assert.equal(nativeFailureDetails(Object.create({restorationError:restore})).restorationError,undefined);
  both.restorationError=both;assert.equal(nativeFailureDetails(both).restorationError,undefined);
  const nested=Object.assign(Error('nested'),{restorationError:Object.assign(Error('level1'),{restorationError:Object.assign(Error('level2'),{restorationError:restore})})});assert.equal(nativeFailureDetails(nested).restorationError.restorationError.restorationError,undefined);
});

test('restoration diagnostics never invoke an inherited getter while recording the original error',async()=>{
  const {nativeFailureDetails}=await import('../scripts/audio-native-browser.mjs'),original=Error('original-to-retain'),prototype=Object.create(Error.prototype);let reads=0;
  Object.defineProperty(prototype,'restorationError',{get(){reads++;throw Error('inherited-getter-failed');}});Object.setPrototypeOf(original,prototype);
  assert.deepEqual(nativeFailureDetails(original),{message:'original-to-retain'});assert.equal(reads,0);
});

// Candidate payloads are inert text fixtures; these tests never execute a browser.
async function browserFixture(t){
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'knife-browser-candidate-'));
  for(const folder of [root+'-profile',root+'-artifacts'])await fs.mkdir(folder);
  t.after(async()=>{for(const folder of [root,root+'-profile',root+'-artifacts']){assert.equal(path.dirname(folder),os.tmpdir());await fs.rm(folder,{recursive:true,force:true});}});
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const payload={'chrome.exe':'inert executable fixture','blink_modules.dll':'inert component fixture'};
  for(const [name,data] of Object.entries(payload))await fs.writeFile(path.join(root,name),data);
  const manifest={schema:'f01-browser-candidate-v1',root,version:'159.0.8132.0',revision:'c409acbc7ae0155eb173d8d5b9fd815e244dbf97',platform:'win32',arch:'x64',executable:'chrome.exe',
    buildArgs:{is_debug:true,is_component_build:true,symbol_level:0,blink_symbol_level:0,v8_symbol_level:0,target_cpu:'x64',use_remoteexec:false,use_siso:true},
    files:Object.entries(payload).map(([name,data])=>({path:name,bytes:Buffer.byteLength(data),sha256:hash(data)}))};
  const write=async()=>{const bytes=Buffer.from(JSON.stringify(manifest));await fs.writeFile(path.join(root,'browser-candidate.json'),bytes);return {root,manifestSha256:hash(bytes)};};
  return {root,fs,path,manifest,write,selection:await write()};
}
test('candidate selection binds the caller manifest digest, root and every payload byte',async t=>{
  const {verifyBrowserCandidate}=await import('../scripts/extension-e2e/harness.mjs');
  assert.equal(typeof verifyBrowserCandidate,'function','candidate verification is implemented');
  const f=await browserFixture(t),expected=await verifyBrowserCandidate(f.selection);
  assert.equal(expected.root,f.root);assert.equal(expected.manifestSha256,f.selection.manifestSha256);assert.equal(expected.executable,f.path.join(f.root,'chrome.exe'));
  assert.equal(expected.files.length,2);
  await assert.rejects(verifyBrowserCandidate({...f.selection,manifestSha256:'0'.repeat(64)}),/candidate-manifest-hash/);
  await f.fs.writeFile(f.path.join(f.root,'blink_modules.dll'),'different component');
  await assert.rejects(verifyBrowserCandidate(f.selection),/candidate-file/);
});
test('candidate manifest rejects scope drift and unlisted or escaping payloads',async t=>{
  const {verifyBrowserCandidate}=await import('../scripts/extension-e2e/harness.mjs');assert.equal(typeof verifyBrowserCandidate,'function');
  const f=await browserFixture(t);
  for(const change of [m=>m.version='151.0.7922.34',m=>m.root=f.path.dirname(f.root),m=>m.executable='blink_unittests.exe',m=>m.buildArgs.is_debug=false,m=>m.files[0].path='../chrome.exe',m=>m.files.push({...m.files[0],path:'CHROME.EXE'})]){
    const original=structuredClone(f.manifest);change(f.manifest);await assert.rejects(verifyBrowserCandidate(await f.write()),/candidate-/);Object.assign(f.manifest,original);
  }
  const selected=await f.write();await f.fs.writeFile(f.path.join(f.root,'unlisted.dll'),'extra');
  await assert.rejects(verifyBrowserCandidate(selected),/candidate-inventory/);
});

async function candidateLauncher(f,{version='159.0.8132.0',killOkay=true,prepareWait,verify,connectError,connectWait,clock=Date}={}){
  const fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{transformSync}=require('esbuild'),harness=await import('../scripts/extension-e2e/harness.mjs');
  const source=fs.readFileSync('scripts/extension-e2e/visibility-browser.mjs','utf8'),code=transformSync(source.replace('await import(harnessSpecifier)','await unitHarness(harnessSpecifier)'),{format:'cjs',target:'es2022'}).code;
  const calls={prepare:0,spawns:[],kills:0,versions:0},children=[];
  const browser={contexts:()=>[{browser:()=>browser}],isConnected:()=>true,version:()=>{calls.versions++;return version;},newBrowserCDPSession:async()=>({send:async()=>({})})};
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,Error,Buffer,Date:clock,setTimeout,clearTimeout,setImmediate,clearImmediate,
    require:name=>name==='node:child_process'?{spawn:(exe,args)=>{calls.spawns.push({exe,args});const c=new EventEmitter();Object.assign(c,{stdio:[null,null,null,new PassThrough(),new PassThrough()],exitCode:null,signalCode:null,kill(){calls.kills++;if(killOkay){c.exitCode=0;queueMicrotask(()=>c.emit('exit',0));}return killOkay;}});children.push(c);return c;}}:require(name),
    process:{platform:'win32'},unitHarness:async()=>({...harness,verifyBrowserCandidate:verify??harness.verifyBrowserCandidate,prepareWindowsBundledChromium:async({profilePath})=>{calls.prepare++;if(prepareWait)await prepareWait;return f.path.join(profilePath,'bundled-chromium','chrome.exe');}})});
  const launch=extra=>module.exports.launchVisibilityBrowser({chromiumApi:{connectOverCDP:async()=>{if(connectWait)await connectWait;if(connectError)throw connectError;return browser;}},profilePath:f.path.join(f.root,'profile'),artifactPath:f.path.join(f.root,'artifacts'),headed:false,...extra});
  return {launch,calls,destroy:()=>children.forEach(c=>{c.stdio[3].destroy();c.stdio[4].destroy();})};
}
test('candidate launch bypasses bundled mutation, retains flags and owns the exact child',async t=>{
  const f=await browserFixture(t),v=await candidateLauncher(f);t.after(v.destroy);
  // Profiles are separate from the immutable runtime root.
  const launched=await v.launch({browserCandidate:f.selection,profilePath:f.root+'-profile',artifactPath:f.root+'-artifacts'});
  assert.equal(v.calls.prepare,0);assert.equal(v.calls.spawns.length,1);assert.equal(v.calls.spawns[0].exe,f.path.join(f.root,'chrome.exe'));
  assert.ok(v.calls.spawns[0].args.includes('--remote-debugging-pipe'));assert.ok(v.calls.spawns[0].args.includes('--headless=new'));
  assert.ok(v.calls.spawns[0].args.includes('--log-file='+f.path.join(f.root+'-artifacts','browser-candidate.log')));assert.equal(launched.browserCandidateVersion,'159.0.8132.0');assert.equal(v.calls.versions,1);await launched.abort();assert.equal(v.calls.kills,1);
  const bundled=await v.launch();assert.equal(v.calls.prepare,1);await bundled.abort();assert.equal(v.calls.kills,2);
});
test('candidate startup failure never falls back and preserves the first failure with retirement failure',async t=>{
  const f=await browserFixture(t),first=Object.freeze(Error('candidate-CDP-failed')),v=await candidateLauncher(f,{killOkay:false,connectError:first});t.after(v.destroy);
  await assert.rejects(v.launch({browserCandidate:f.selection,profilePath:f.root+'-profile',artifactPath:f.root+'-artifacts'}),e=>e.cause===first&&e.retirementError.message==='visibility-child-stop-failed');
  assert.equal(v.calls.prepare,0);assert.equal(v.calls.spawns.length,1);assert.equal(v.calls.kills,1);
});

test('bundled callers without a deadline retain their existing launch timing',async t=>{
  const f=await browserFixture(t);let now=1000,release;
  const wait=new Promise(resolve=>release=resolve),v=await candidateLauncher(f,{clock:{now:()=>now},prepareWait:wait});t.after(v.destroy);
  const pending=v.launch();await new Promise(resolve=>setImmediate(resolve));now+=150001;release();
  const launched=await pending;assert.equal(v.calls.prepare,1);assert.equal(v.calls.spawns.length,1);await launched.abort();
});
test('candidate validation and evidence waits share the launch deadline and never spawn after expiry',async t=>{
  const f=await browserFixture(t),{boundedProductLaunch}=await import('../scripts/check-product-audio.mjs');let release;
  const wait=new Promise(resolve=>release=resolve),v=await candidateLauncher(f,{prepareWait:wait,verify:async(...args)=>{await wait;return (await import('../scripts/extension-e2e/harness.mjs')).verifyBrowserCandidate(...args);}});t.after(v.destroy);
  await assert.rejects(boundedProductLaunch(control=>v.launch({...control,browserCandidate:f.selection,profilePath:f.root+'-profile',artifactPath:f.root+'-artifacts'}),async()=>{},5),/launch-timeout/);
  release();await new Promise(resolve=>setTimeout(resolve,50));assert.equal(v.calls.spawns.length,0);assert.equal(v.calls.prepare,0);
});

test('product wrapper freezes candidate selection, records evidence and preserves post-run drift as secondary',async t=>{
  const f=await browserFixture(t),{verifyBrowserCandidate}=await import('../scripts/extension-e2e/harness.mjs'),{runProductAudio}=await import('../scripts/check-product-audio.mjs');
  const saved=new Map(),source={sourceSha256:'same'},original={...f.selection},options={runId:'PinnedBrowserA',caseId:'44100/normalizer-control/tone-silence',browserCandidate:original};let launchCount=0;
  const files={root:process.cwd(),lstat:async name=>saved.has(name)?{isFile:()=>true}:null,ensureDirectory:async()=>{},writeFile:async(name,bytes,opts)=>{assert.equal(opts.flag,'wx');saved.set(name,Buffer.from(bytes));}};
  await assert.rejects(runProductAudio(options,{platform:'win32',files,attest:async()=>{original.root='changed';original.manifestSha256='0'.repeat(64);return source;},
    launchVisibilityBrowser:async settings=>{
      launchCount++;assert.deepEqual(settings.browserCandidate,f.selection);assert.ok(Object.isFrozen(settings.browserCandidate));assert.ok(settings.deadline>Date.now());assert.equal(settings.signal.aborted,false);
      await settings.recordBrowserCandidate(await verifyBrowserCandidate(settings.browserCandidate));
      return {browserCandidateVersion:'159.0.8132.0',abort:async()=>{},context:{tracing:{start:async()=>{},stop:async()=>{}}}};
    },execute:async settings=>{
      await settings.dependencies.launchInstalledExtension({profilePath:f.root+'-profile',artifactPath:f.root+'-artifacts',extensionPath:require('node:path').resolve('dist'),headed:false});
      await f.fs.writeFile(f.path.join(f.root,'blink_modules.dll'),'changed during synthetic run');throw Error('first-scenario-failure');
    }}),/audio-product-observation-failed/);
  assert.equal(launchCount,1);const summary=JSON.parse(saved.get('output/audio-product-PinnedBrowserA/summary.json'));
  assert.equal(summary.error.message,'first-scenario-failure');assert.equal(summary.ok,false);assert.match(summary.secondaryErrors[0].message,/candidate-file/);
  assert.deepEqual(summary.browserCandidate.selection,f.selection);assert.equal(summary.browserCandidate.before.manifestSha256,f.selection.manifestSha256);assert.equal(summary.browserCandidate.after,null);assert.equal(summary.browserCandidate.version,'159.0.8132.0');
  assert.ok(saved.has('output/playwright/installed-extension-PinnedBrowserA/browser-candidate-before.json'));
});
test('candidate rejects payload/evidence overlap and a mismatched connected browser version',async t=>{
  const f=await browserFixture(t),v=await candidateLauncher(f,{version:'151.0.7922.34'});t.after(v.destroy);
  await assert.rejects(v.launch({browserCandidate:f.selection}),/candidate-overlap/);assert.equal(v.calls.spawns.length,0);
  await assert.rejects(v.launch({browserCandidate:f.selection,profilePath:f.root+'-profile',artifactPath:f.root+'-artifacts'}),e=>e.code==='visibility-candidate-version'&&e.message.includes('159.0.8132.0')&&e.message.includes('151.0.7922.34'));assert.equal(v.calls.kills,1);assert.equal(v.calls.prepare,0);
});
test('candidate detects bytes changed during evidence persistence before any spawn',async t=>{
  const f=await browserFixture(t),v=await candidateLauncher(f);t.after(v.destroy);
  await assert.rejects(v.launch({browserCandidate:f.selection,profilePath:f.root+'-profile',artifactPath:f.root+'-artifacts',recordBrowserCandidate:async()=>{await f.fs.writeFile(f.path.join(f.root,'chrome.exe'),'changed after verification');}}),/candidate-file/);
  assert.equal(v.calls.spawns.length,0);assert.equal(v.calls.prepare,0);
});

test('candidate rejects profile or artifact aliases that resolve into its payload',async t=>{
  const f=await browserFixture(t),{verifyBrowserCandidate}=await import('../scripts/extension-e2e/harness.mjs'),alias=f.root+'-alias';
  // A physical junction could not be created in the sandbox (EPERM); model only realpath's alias result.
  const realpath=f.fs.realpath;f.fs.realpath=async input=>input===alias?f.root:realpath(input);
  try{
    await assert.rejects(verifyBrowserCandidate(f.selection,{exclude:[alias]}),/candidate-overlap/);
    await assert.rejects(verifyBrowserCandidate({...f.selection,root:alias}),/candidate-root-alias/);
  }finally{f.fs.realpath=realpath;}
});

test('candidate refuses UNC or device roots before any filesystem access',async()=>{
  const fs=require('node:fs/promises'),{verifyBrowserCandidate}=await import('../scripts/extension-e2e/harness.mjs'),realpath=fs.realpath;let reads=0;
  fs.realpath=async()=>{reads++;throw Error('unexpected-network-path');};
  try{for(const root of ['\\\\server\\share','\\\\?\\C:\\candidate','//server/share'])await assert.rejects(verifyBrowserCandidate({root,manifestSha256:'a'.repeat(64)}),/candidate-selection/);assert.equal(reads,0);}
  finally{fs.realpath=realpath;}
});

test('candidate verifier rejects expiry during the final executable resolution',async t=>{
  const f=await browserFixture(t),{verifyBrowserCandidate}=await import('../scripts/extension-e2e/harness.mjs'),lstat=f.fs.lstat,deadline=Date.now()+200;let checks=0;
  f.fs.lstat=async filename=>{const stat=await lstat(filename);if(filename===f.path.join(f.root,'chrome.exe')&&++checks===2)await new Promise(resolve=>setTimeout(resolve,Math.max(1,deadline-Date.now()+10)));return stat;};
  try{await assert.rejects(verifyBrowserCandidate(f.selection,{deadline}),/candidate-deadline/);}finally{f.fs.lstat=lstat;}
});

test('late connection rejection retains retirement failure after the original launch timeout',async t=>{
  const f=await browserFixture(t),{verifyBrowserCandidate}=await import('../scripts/extension-e2e/harness.mjs'),{boundedProductLaunch}=await import('../scripts/check-product-audio.mjs'),evidence=await verifyBrowserCandidate(f.selection);let release,record;
  const connectWait=new Promise(resolve=>release=resolve),v=await candidateLauncher(f,{killOkay:false,connectWait,verify:async()=>evidence});t.after(v.destroy);
  await assert.rejects(boundedProductLaunch(control=>v.launch({...control,browserCandidate:f.selection,profilePath:f.root+'-profile',artifactPath:f.root+'-artifacts'}),async value=>{record=value;},200),/launch-timeout/);
  assert.equal(v.calls.spawns.length,1);release();await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(v.calls.kills,1);assert.equal(record?.retired,null);assert.equal(record?.error.retirementError.message,'visibility-child-stop-failed');
});

test('secondary native diagnostics keep bounded messages and ignore cyclic excess and query secrets',async()=>{
  const {nativeFailureDetails}=await import('../scripts/audio-native-browser.mjs');
  const e=Object.assign(Error('primary'),{secondaryErrors:[]});
  const detail={message:'native-unavailable',code:'native-unavailable',queryDiagnostic:{reason:'timeout',timedOut:true,exitCode:1,signal:'SIGTERM',secret:'private-sentinel'},closeDiagnostic:{stage:'owned-roots',queryCount:1},forcedRetirement:false,retireError:'x'.repeat(5000),secret:'private-sentinel'};
  e.secondaryErrors=Array.from({length:40},()=>({code:'close',message:'native-unavailable',native:detail}));detail.secondaryErrors=e.secondaryErrors;detail.cause={message:"nested",cause:detail};
  const r=nativeFailureDetails(e);assert.equal(r.secondaryErrors.length,32);
  const n=r.secondaryErrors[0].native;assert.equal(n.message,'native-unavailable');assert.equal(n.queryDiagnostic.reason,'timeout');assert.equal(n.retireError.length,4096);assert.equal(n.secondaryErrors,undefined);assert.equal(n.cause.cause,undefined);assert.equal(JSON.stringify(r).includes('private-sentinel'),false);
});
test('shared shutdown expiry preserves one owned stop attempt without a renewed wait',async()=>{
  const {stopVisibilityChild}=await load();let kills=0;
  const child={exitCode:null,signalCode:null,kill(){kills++;return true;}};
  const shutdownBy=performance.now()-1;
  await assert.rejects(()=>stopVisibilityChild(child,Promise.resolve(true),{shutdownBy}),error=>{
    assert.equal(error.childRetirement.attempted,true);assert.equal(error.childRetirement.killAccepted,true);
    assert.equal(error.childRetirement.late,true);assert.equal(error.childRetirement.shutdownBy,shutdownBy);return true;
  });
  assert.equal(kills,1);
});

test('failed close and abort exit receipts survive bounded failure projection',async()=>{
  const {nativeFailureDetails}=await import('../scripts/audio-native-browser.mjs');
  const exit={kind:'exit',code:1,signal:null,at:performance.now()},abortExit={kind:'exit',code:null,signal:'SIGTERM',at:performance.now()};
  const detail=nativeFailureDetails(Object.assign(Error('close-failed'),{closeDiagnostic:{actualChildExit:exit,secret:'omit'},abortChildExit:abortExit,
    childRetirement:{attempted:true,killAccepted:true,late:true,attemptedAt:1,shutdownBy:1,secret:'omit'}}));
  assert.deepEqual(detail.closeDiagnostic.actualChildExit,exit);assert.deepEqual(detail.abortChildExit,abortExit);
  assert.equal(detail.childRetirement.attempted,true);assert.equal(detail.childRetirement.late,true);
  assert.equal(Object.hasOwn(detail.closeDiagnostic,'secret'),false);assert.equal(Object.hasOwn(detail.childRetirement,'secret'),false);
});
