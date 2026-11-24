const test=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('./audio-fixture.cjs');
const {flush,runtime}=require('./helpers.cjs');
const moduleUrl='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/web/audio-transition-worklet.js';
// Exercise current TS without rewriting the generated D resources used by older fixtures.
const controllerCode=require('esbuild').buildSync({entryPoints:['src/main/features/audio/controller.ts'],bundle:true,write:false,
  format:'iife',globalName:'F01LatchControllerUnderTest',platform:'browser'}).outputFiles[0].text;
async function latchFixture(t){
  const failures={clock:true},h=setup(t,false,true,{},failures);delete runtime(h.dom).audio;
  h.audio=h.dom.window.eval(controllerCode+'\nF01LatchControllerUnderTest;').installAudio(h.dom.window);await h.audio.prepareTransitionModule(moduleUrl);
  await h.audio.setEnabled(h.video,true);await flush();
  return {...h,failures,node:h.nodes.find(n=>n.type==='transition'),latch:h.nodes.find(n=>n.type==='constant')};
}

test('healthy latch serializes an in-flight Gain0 ON before explicit OFF',async t=>{
  const h=await latchFixture(t);h.failures.manualWorkletAck=true;h.audio.setGain(h.video,0);
  const on=h.node.commands.at(-1),count=h.node.commands.length,sets=h.latch.offset.events.length;
  assert.equal(on.wanted,true);assert.equal(on.gain,0);assert.equal(h.latch.offset.value,-1);
  assert.equal(await h.audio.setEnabled(h.video,false),'off');assert.equal(h.node.commands.length,count);
  assert.equal(h.latch.offset.value,-1,'the unaccepted ON still owns its native latch');assert.equal(h.latch.offset.events.length,sets);
  assert.equal(h.audio.getReadback(h.video).wanted,false);assert.equal(h.audio.getReadback(h.video).appliedGain,null);
  h.node.reply('accepted');const off=h.node.commands.at(-1);assert.equal(off.wanted,false);assert.ok(off.seq>on.seq);assert.equal(h.node.commands.length,count+1);assert.equal(h.latch.offset.value,0);
  h.node.reply('completed',{seq:on.seq});assert.equal(h.audio.getReadback(h.video).appliedGain,null,'a stale completed ACK cannot confirm the newer OFF');
  h.node.reply('accepted');h.node.reply('completed');assert.equal(h.audio.getReadback(h.video).appliedGain,1);assert.equal(h.sources(),1);
});

test('healthy latch keeps the latest Gain0 ON when it supersedes a pending OFF',async t=>{
  const h=await latchFixture(t);h.failures.manualWorkletAck=true;h.audio.setGain(h.video,0);
  const first=h.node.commands.at(-1),count=h.node.commands.length,sets=h.latch.offset.events.length;
  await h.audio.setEnabled(h.video,false);const resumed=h.audio.setEnabled(h.video,true);await flush();
  assert.equal(h.latch.offset.value,-1);assert.equal(h.latch.offset.events.length,sets,'an unsent OFF must not pulse the raw latch');assert.equal(h.node.commands.length,count);
  h.node.reply('accepted');const latest=h.node.commands.at(-1);assert.equal(latest.wanted,true);assert.equal(latest.gain,0);assert.ok(latest.seq>first.seq+1);
  assert.ok(h.node.commands.slice(count).every(packet=>packet.wanted===true));assert.equal(h.latch.offset.value,-1);
  h.node.reply('accepted');h.node.reply('completed');assert.equal(await resumed,'on');assert.equal(h.audio.getReadback(h.video).appliedGain,0);assert.equal(h.sources(),1);
});

test('healthy latch waits for resume before dispatching a suspended-context OFF',async t=>{
  const h=await latchFixture(t);h.audio.setGain(h.video,0);await flush();assert.equal(h.audio.getReadback(h.video).appliedGain,0);
  h.failures.manualWorkletAck=true;h.context().state='suspended';const count=h.node.commands.length,sets=h.latch.offset.events.length;
  await h.audio.setEnabled(h.video,false);assert.equal(h.node.commands.length,count);assert.equal(h.latch.offset.value,-1);assert.equal(h.latch.offset.events.length,sets);
  await h.time.advance(1500);assert.equal(h.audio.getState(h.video),'off','an unsent job has no flight watchdog');
  h.context().state='running';h.context().dispatchEvent(new h.dom.window.Event('statechange'));
  assert.equal(h.node.commands.length,count+1);assert.equal(h.node.commands.at(-1).wanted,false);assert.equal(h.latch.offset.value,0);
  assert.equal(h.audio.getReadback(h.video).appliedGain,null);h.node.reply('accepted');h.node.reply('completed');assert.equal(h.audio.getReadback(h.video).appliedGain,1);assert.equal(h.sources(),1);
});

test('healthy latch pending OFF falls back to raw at the unchanged in-flight watchdog',async t=>{
  const h=await latchFixture(t);h.failures.manualWorkletAck=true;h.audio.setGain(h.video,0);const count=h.node.commands.length;
  await h.audio.setEnabled(h.video,false);assert.equal(h.latch.offset.value,-1);h.context().state='suspended';
  await h.time.advance(999);assert.equal(h.audio.getState(h.video),'off');assert.equal(h.latch.offset.value,-1);
  await h.time.advance(1);assert.equal(h.audio.getState(h.video),'unavailable');assert.equal(h.audio.getReadback(h.video).wanted,false);assert.equal(h.latch.offset.value,0,'failed pending OFF must release the independent raw latch');
  assert.ok(h.statusChanges.some(([feature,,reason])=>feature==='audioProcessing'&&reason==='audio-command-timeout'));
  h.context().state='running';h.context().dispatchEvent(new h.dom.window.Event('statechange'));assert.equal(h.node.commands.length,count);assert.equal(h.sources(),1);
  const source=h.nodes.find(n=>n.type==='source'),raw=h.nodes.find(n=>n.type==='delay');assert.ok(source.outputs.has(raw));assert.equal(h.node.outputs.size,0);
});

test('healthy latch wanted Gain0 stays silent when its unaccepted flight reaches 1000ms',async t=>{
  const h=await latchFixture(t);h.failures.manualWorkletAck=true;h.audio.setGain(h.video,0);const count=h.node.commands.length;
  await h.time.advance(999);assert.equal(h.audio.getState(h.video),'on');assert.equal(h.latch.offset.value,-1);
  await h.time.advance(1);assert.equal(h.audio.getState(h.video),'unavailable');assert.equal(h.audio.getReadback(h.video).wanted,true);assert.equal(h.latch.offset.value,-1);assert.equal(h.node.commands.length,count);assert.equal(h.sources(),1);
});

test('failed processor explicit OFF releases the raw latch without another command or source',async t=>{
  const h=await latchFixture(t);h.audio.setGain(h.video,0);await flush();h.node.onprocessorerror();const count=h.node.commands.length;
  assert.equal(h.audio.getState(h.video),'unavailable');assert.equal(h.latch.offset.value,-1);
  assert.equal(await h.audio.setEnabled(h.video,false),'off');assert.equal(h.latch.offset.value,0);assert.equal(h.node.commands.length,count);assert.equal(h.sources(),1);
});

async function detached(t,gain=1){
  const failures={clock:true},h=setup(t,false,true,{},failures);await h.audio.setEnabled(h.video,true);
  h.audio.setGain(h.video,gain);await flush();failures.manualWorkletAck=true;
  const parent=h.video.parentNode;let now=100;h.dom.window.Date.now=()=>now;h.video.remove();h.tick();now=5100;h.tick();
  return {...h,parent,failures,node:h.nodes.find(n=>n.type==='transition')};
}
test('detached cleanup waits completed OFF then matching retired before reuse of source1',async t=>{
  const h=await detached(t),node=h.node;
  assert.equal(node.commands.at(-1).wanted,false,'ownership cleanup requests OFF');
  node.reply('accepted');assert.equal(node.messages.filter(p=>p.kind==='retire').length,0);
  node.reply('completed');const retire=node.messages.find(p=>p.kind==='retire');assert.ok(retire);
  h.parent.append(h.video);const resumed=h.audio.setEnabled(h.video,true);await flush();
  assert.equal(h.nodes.filter(n=>n.type==='transition').length,1,'no replacement before success');
  node.reply('retired',{seq:retire.seq+1});await flush();assert.equal(h.nodes.filter(n=>n.type==='transition').length,1);
  h.failures.manualWorkletAck=false;node.reply('retired',{seq:retire.seq});assert.equal(await resumed,'on',JSON.stringify(h.statusChanges.slice(-10)));
  assert.equal(h.sources(),1);assert.equal(h.nodes.filter(n=>n.type==='transition').length,2);assert.equal(node.outputs.size,0);
  assert.notEqual(h.nodes.filter(n=>n.type==='transition')[1].epoch,node.epoch);
});
for(const mode of ['rejected','timeout'])test('retire '+mode+' never allocates a replacement or retries',async t=>{
  const h=await detached(t);h.node.reply('accepted');h.node.reply('completed');
  const retire=h.node.messages.find(p=>p.kind==='retire');assert.ok(retire);
  h.parent.append(h.video);const pending=h.audio.setEnabled(h.video,true);await flush();
  if(mode==='timeout')await h.time.advance(1001);else h.node.reply('rejected',{seq:retire.seq});
  await pending;await h.audio.setEnabled(h.video,true);await h.time.advance(6000);
  assert.equal(h.audio.getState(h.video),'unavailable');assert.equal(h.nodes.filter(n=>n.type==='transition').length,1);
  assert.equal(h.node.messages.filter(p=>p.kind==='retire').length,1);
});
test('Gain0 ownership and plain OFF do not retire the processor',async t=>{
  const h=await detached(t,0);assert.equal(h.node.messages.filter(p=>p.kind==='retire'||p.wanted===false).length,0);
  const b=setup(t);await b.audio.setEnabled(b.video,true);await b.audio.setEnabled(b.video,false);await flush();
  assert.equal(b.nodes.find(n=>n.type==='transition').messages.filter(p=>p.kind==='retire').length,0);
});
test('a newer Gain0 ON is latched before a late retired reply and survives replacement',async t=>{
  const h=await detached(t);h.node.reply('accepted');h.node.reply('completed');const retire=h.node.messages.find(p=>p.kind==='retire');assert.ok(retire);
  h.parent.append(h.video);h.audio.setGain(h.video,0);
  const resumed=h.audio.setEnabled(h.video,true);await flush();assert.equal(h.nodes.find(n=>n.type==='constant').offset.value,-1);
  h.failures.manualWorkletAck=false;h.node.reply('retired',{seq:retire.seq});assert.equal(await resumed,'on',JSON.stringify(h.statusChanges.slice(-10)));
  assert.equal(h.sources(),1);assert.equal(h.nodes.filter(n=>n.type==='transition')[1].options.processorOptions.initial,'silent-hold');
  assert.equal(h.nodes.find(n=>n.type==='constant').offset.value,-1);assert.equal(h.audio.getReadback(h.video).appliedGain,0);
});
test('successful retirement removes inactive ownership and wet graph but leaves delayed raw connected',async t=>{
  const h=await detached(t);h.node.reply('accepted');h.node.reply('completed');h.node.reply('retired');
  const count=h.node.messages.length;h.audio.configure();h.tick();await flush();assert.equal(h.node.messages.length,count);
  assert.equal(h.node.port.onmessage,null);assert.equal(h.node.outputs.size,0);assert.equal(h.nodes.find(n=>n.type==='compressor').outputs.size,0);
  const source=h.nodes.find(n=>n.type==='source');assert.equal(source.outputs.size,1);
  const delay=[...source.outputs][0];assert.equal(delay.type,'delay');assert.equal(delay.outputs.size,1);
  assert.equal(h.nodes.find(n=>n.type==='constant').stopped,true);
});
for(const extra of [{frame:-1},{frame:NaN},{meterEpoch:99},{gain:0},{code:'unexpected'},{extra:true}])test('unsafe matching retired ACK cannot release ownership: '+JSON.stringify(extra),async t=>{
  const h=await detached(t);h.node.reply('accepted');h.node.reply('completed');h.node.reply('retired',extra);await flush();
  assert.equal(h.audio.getState(h.video),'unavailable');assert.equal(h.nodes.filter(n=>n.type==='transition').length,1);
});
test('new Gain0 before completed OFF prevents retirement and any automatic replacement',async t=>{
  const h=await detached(t);h.node.reply('accepted');h.parent.append(h.video);h.audio.setGain(h.video,0);
  const pending=h.audio.setEnabled(h.video,true);await flush();h.node.reply('completed');await pending;
  assert.equal(h.nodes.find(n=>n.type==='constant').offset.value,-1);assert.equal(h.audio.getState(h.video),'unavailable');
  assert.equal(h.node.messages.filter(p=>p.kind==='retire').length,0);assert.equal(h.nodes.filter(n=>n.type==='transition').length,1);
});
test('known suspended context cannot enter an unsent retirement that blocks a later ON resume',async t=>{
  const h=setup(t,false,true,{}, {clock:true});await h.audio.setEnabled(h.video,true);
  const parent=h.video.parentNode,node=h.nodes.find(n=>n.type==='transition'),count=node.commands.length;
  h.context().state='suspended';let now=100;h.dom.window.Date.now=()=>now;h.video.remove();h.tick();now=5100;h.tick();
  parent.append(h.video);let resumes=0;
  h.context().resume=async()=>{resumes++;h.context().state='running';h.context().dispatchEvent(new h.dom.window.Event('statechange'));};
  const pending=h.audio.setEnabled(h.video,true);await flush();
  assert.equal(resumes,1,'ON must reach native resume, not await an unsent retire OFF');assert.equal(await pending,'on');
  assert.equal(h.sources(),1);assert.equal(h.nodes.filter(n=>n.type==='transition').length,1);
  assert.ok(node.commands.slice(count).every(c=>c.wanted===true));
});
for(const timing of ['during','after'])test('changed source '+timing+' retirement prepares only the current processor epoch',async t=>{
  const h=await detached(t);h.node.reply('accepted');h.node.reply('completed');
  if(timing==='after')h.node.reply('retired');
  Object.defineProperty(h.video,'currentSrc',{configurable:true,value:'blob:https://chzzk.naver.com/new-retired-source'});h.parent.append(h.video);
  const pending=h.audio.setEnabled(h.video,true);await flush();h.failures.manualWorkletAck=false;
  if(timing==='during')h.node.reply('retired');else h.nodes.filter(n=>n.type==='transition').at(-1).reply('prepared');
  await pending;await flush();
  assert.equal(h.nodes.filter(n=>n.type==='transition').length,2,'no abandoned intermediate processor');assert.equal(h.sources(),1);
  assert.equal(h.audio.getState(h.video),'on');
});
for(const resume of [true,false])test('suspend between OFF acceptance and completion cannot strand retirement; resume='+resume,async t=>{
  const h=await detached(t);h.node.reply('accepted');h.context().state='suspended';h.node.reply('completed');
  if(resume){h.parent.append(h.video);let resumed=0;h.context().resume=async()=>{resumed++;h.context().state='running';h.context().dispatchEvent(new h.dom.window.Event('statechange'));};
    const pending=h.audio.setEnabled(h.video,true);await flush();assert.equal(resumed,1);
    const retire=h.node.messages.find(p=>p.kind==='retire');assert.ok(retire);h.failures.manualWorkletAck=false;h.node.reply('retired');
    assert.equal(await pending,'on');assert.equal(h.sources(),1);
  }else{await h.time.advance(2001);assert.equal(h.audio.getState(h.video),'unavailable');assert.equal(h.nodes.filter(n=>n.type==='transition').length,1);}
});
test('fixed bootstrap only registers the local module without creating context/source',async t=>{
  const {audio,nodes,sources}=setup(t);
  assert.equal(typeof audio.prepareTransitionModule,'function','fixed local module registration must exist');
  await assert.rejects(audio.prepareTransitionModule('https://example.com/module.js'));
  await assert.rejects(audio.prepareTransitionModule(moduleUrl.replace('://','://user:pass@')));
  await audio.prepareTransitionModule(moduleUrl);assert.equal(nodes.length,0);assert.equal(sources(),0);
});

test('a pending suspended-context intent is sent on real resume without losing or re-capturing the source',async t=>{
  const {audio,video,nodes,context,dom,sources}=setup(t);await audio.setEnabled(video,true);
  const node=nodes.find(n=>n.type==='transition'),count=node.commands.length;
  context().state='suspended';audio.setGain(video,.6);await flush();assert.equal(node.commands.length,count);
  context().state='running';context().dispatchEvent(new dom.window.Event('statechange'));await flush();
  assert.equal(node.commands.at(-1).gain,.6);assert.equal(audio.getReadback(video).appliedGain,.6);assert.equal(sources(),1);
});
test('missing or failed local worklet preparation must not capture the media source',async t=>{
  const {audio,video,sources}=setup(t,false,false,{}, {noBootstrap:true});
  assert.equal(await audio.setEnabled(video,true),'unavailable');assert.equal(sources(),0);
});
test('Gain readback waits for matching completed ACK, not intrinsic audio parameter',async t=>{
  const {audio,video,nodes}=setup(t,false,false,{}, {manualWorkletAck:true});
  assert.equal(typeof audio.prepareTransitionModule,'function');await audio.prepareTransitionModule(moduleUrl);
  const pending=audio.setEnabled(video,true);await flush();
  const worklet=nodes.find(n=>n.type==='transition');assert.ok(worklet);
  worklet.reply('prepared');await flush();worklet.reply('accepted');await pending;
  assert.equal(audio.getReadback(video).appliedGain,null);
  worklet.reply('completed');assert.equal(audio.getReadback(video).appliedGain,1);
  audio.setGain(video,.5);assert.equal(audio.getReadback(video).appliedGain,null);
  worklet.reply('completed',{seq:1});assert.equal(audio.getReadback(video).appliedGain,null);
});
test('automatic suspension preserves confirmed Gain0 while explicit OFF releases raw',async t=>{
  const {audio,video,nodes,sources}=setup(t);
  assert.equal(typeof audio.prepareTransitionModule,'function');await audio.prepareTransitionModule(moduleUrl);
  await audio.setEnabled(video,true);audio.setGain(video,0);await flush();
  assert.equal(audio.getReadback(video).appliedGain,0);
  const worklet=nodes.find(n=>n.type==='transition'),before=worklet.commands.length;
  audio.suspend(video);await flush();assert.equal(audio.getState(video),'pending');
  assert.ok(worklet.commands.slice(before).every(c=>c.wanted!==false));
  const latch=nodes.find(n=>n.type==='constant');assert.equal(latch.offset.value,-1);assert.equal(sources(),1);
  await audio.setEnabled(video,false);await flush();assert.equal(latch.offset.value,0);
  assert.equal(worklet.commands.at(-1).wanted,false);assert.equal(audio.getState(video),'off');
});
test('processor failure keeps independent raw/source1 and Gain0 latch without retry',async t=>{
  const {audio,video,nodes,sources}=setup(t);
  assert.equal(typeof audio.prepareTransitionModule,'function');await audio.prepareTransitionModule(moduleUrl);
  await audio.setEnabled(video,true);audio.setGain(video,0);await flush();
  const worklet=nodes.find(n=>n.type==='transition');worklet.onprocessorerror();await flush();
  assert.equal(audio.getState(video),'unavailable');assert.equal(sources(),1);
  assert.equal(nodes.find(n=>n.type==='constant').offset.value,-1);
  assert.equal(nodes.filter(n=>n.type==='transition').length,1);assert.equal(audio.getReadback(video).appliedGain,null);
  assert.equal(await audio.resumeWanted(video),'unavailable');
});
test('a changed media source starts a fresh processor epoch without another MediaElementSource',async t=>{
  const {audio,video,nodes,sources}=setup(t);await audio.setEnabled(video,true);
  const old=nodes.find(n=>n.type==='transition');
  Object.defineProperty(video,'currentSrc',{configurable:true,value:'blob:https://chzzk.naver.com/replaced'});
  audio.configure();await flush();
  const processors=nodes.filter(n=>n.type==='transition');assert.equal(processors.length,2);assert.equal(sources(),1);
  assert.notEqual(processors[1].epoch,old.epoch);assert.equal(old.outputs.size,0);
});

for(const mode of ['normalizer-off','suspend'])test('already sent meter watchdog survives '+mode,async t=>{
  const failures={clock:true},h=setup(t,false,true,{normalizerEnabled:true},failures);await h.audio.setEnabled(h.video,true);await flush();
  failures.manualWorkletAck=true;h.tick();
  const node=h.nodes.find(n=>n.type==='transition'),meter=node.messages.filter(m=>m.kind==='power').at(-1);assert.ok(meter);
  if(mode==='normalizer-off'){runtime(h.dom).config.normalizerEnabled=false;h.audio.configure();}else h.audio.suspend(h.video);
  node.reply('accepted');node.reply('completed');await flush();
  await h.time.advance(1001);
  assert.equal(h.audio.getState(h.video),'unavailable');
  assert.ok(h.statusChanges.some(([feature,state,reason])=>feature==='audioProcessing'&&state==='limited'&&reason==='audio-meter-timeout'));
});
const {settingsHarness,extensionId}=require('./settings-fixture.cjs');
const bootstrap={namespace:'cheese-knife-audio-bootstrap',type:'audio-module-bootstrap'};
const nativeSender=()=>({id:extensionId,url:'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',origin:'https://chzzk.naver.com',frameId:0,documentId:'l1-document',documentLifecycle:'active',tab:{id:7,windowId:9,incognito:false}});
test('bootstrap executes only its fixed module function in the native sender document',async t=>{
  const h=settingsHarness(t),sender=nativeSender();let called=0;
  h.worker.window.chrome.scripting.executeScript=async options=>{
    called++;assert.equal(options.world,'MAIN');assert.equal(options.target.tabId,7);assert.deepEqual(Array.from(options.target.documentIds),['l1-document']);
    assert.deepEqual(Array.from(options.args),[moduleUrl]);assert.equal(typeof options.func,'function');
    return [{frameId:0,documentId:sender.documentId,result:{ok:true,url:sender.url}}];
  };
  const reply=await h.send('page',bootstrap,sender);assert.equal(reply?.ok,true);assert.equal(called,1);
});
test('bootstrap rejects sender/field/origin/incognito substitutions before native execution',async t=>{
  const h=settingsHarness(t);let calls=0;h.worker.window.chrome.scripting.executeScript=async()=>{calls++;throw Error('must not execute');};
  const sender=nativeSender();
  const variants=[{...sender,id:'other'},{...sender,frameId:1},{...sender,documentId:''},{...sender,origin:'https://example.com'},
    {...sender,url:'https://example.com/'},{...sender,tab:{...sender.tab,incognito:true}},{...sender,documentLifecycle:'prerender'}];
  for(const variant of variants)assert.equal((await h.send('page',bootstrap,variant))?.ok,false);
  assert.equal((await h.send('page',{...bootstrap,url:'https://example.com/payload.js'},sender))?.ok,false);
  assert.equal(calls,0);
});

for(const [compressorEnabled,normalizerEnabled,dynamics]of [[false,false,false],[true,false,true],[false,true,true],[true,true,true]])
test(`configure packets preserve selected EQ/Gain across master edges with compressor=${compressorEnabled}, normalizer=${normalizerEnabled}`,async t=>{
  const config={compressorEnabled,normalizerEnabled,normalizerTargetDbfs:-18,eqEnabled:true,eq63:3,eq125:-6,eq500:4,eq1000:-2,eq2000:1,eq4000:-5,eq8000:6};
  const h=setup(t,false,false,config,{clock:true});await h.audio.setEnabled(h.video,true);h.audio.setGain(h.video,1.32);await flush();
  const node=h.nodes.find(node=>node.type==='transition');
  const check=wanted=>{
    const packet=node.commands.at(-1);assert.equal(packet.dynamics,dynamics);assert.equal(packet.wanted,wanted);
    assert.equal(packet.gain,1.32);assert.equal(packet.normalizer,normalizerEnabled);assert.equal(packet.targetDbfs,-18);
    assert.deepEqual(Array.from(packet.eq),[3,-6,0,4,-2,1,-5,6]);
    for(const [key,value]of Object.entries(config))assert.equal(runtime(h.dom).config[key],value);
  };
  check(true);await h.audio.setEnabled(h.video,false);await flush();check(false);
  await h.audio.setEnabled(h.video,true);await flush();check(true);
});
