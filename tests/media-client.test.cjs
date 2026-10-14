const test=require('node:test'),assert=require('node:assert/strict');
const {settingsHarness}=require('./settings-fixture.cjs');
const {page,load,flush}=require('./helpers.cjs');
const A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',P='11111111-1111-4111-8111-111111111111';
const saved={kind:'saved',channelId:A};
function client(t,h){const dom=page();for(const file of ['media-profiles.js','config.js','style-schema.js','settings-contract.js','settings-client.js'])load(dom,file);
  assert.equal(typeof dom.window.createMediaSettingsClient,'function','media client must exist');
  const api=h.apiFor('popup'),instance=dom.window.createMediaSettingsClient(api);let view;instance.subscribe(next=>{view=next;});
  t.after(()=>{instance.dispose();dom.window.close();});return {...instance,api,dom,view:()=>view};}
async function enabled(t){const h=settingsHarness(t),c=client(t,h);await h.settle();assert.equal((await c.selectScope(saved)).ok,true);
  assert.equal((await c.perform({action:'enable-channel-domain',selection:saved,domain:'audio',expectedMediaRevision:0,expectedGlobalRevision:0,expectedRecord:null})).ok,true);
  await h.settle();return {h,c};}

test('media client subscribes before read and selection never writes',async t=>{
  const h=settingsHarness(t),c=client(t,h);await h.settle();assert.equal(c.view().phase,'ready');
  assert.equal((await c.selectScope(saved)).ok,true);await h.settle();assert.equal(c.view().selection.channelId,A);
  assert.equal(h.calls.filter(call=>call.kind==='commit').length,0);
  assert.ok(h.messages.filter(entry=>entry.message.protocol===2).every(entry=>entry.subscribers>0));
});
test('two independent media clients merge field patches and synchronize without global writes',async t=>{
  const {h,c}=await enabled(t),other=client(t,h);await h.settle();await other.selectScope(saved);
  c.editFields('audio',{compressorThreshold:-35});other.editFields('audio',{compressorRatio:8.125});await h.settle();
  for(const ui of [c,other]){assert.equal(ui.view().values.audio.compressorThreshold,-35);assert.equal(ui.view().values.audio.compressorRatio,8.125);}
  const patches=h.messages.filter(entry=>entry.message.action==='patch-channel-fields');
  assert.equal(patches.length,2);assert.ok(patches.every(entry=>Object.keys(entry.message.patch).length===1));
  assert.equal(Object.hasOwn(h.saved,'config'),false);assert.equal(h.maxConcurrentWrites,1);
});
test('saving scope cannot switch and unknown create keeps its original id and draft until explicit read-back',async t=>{
  const {h,c}=await enabled(t),gate=h.holdNext('callback:create-preset');
  const values=structuredClone(c.view().values.audio),pending=c.perform({action:'create-preset',id:P,expectedMediaRevision:1,domain:'audio',name:'Quiet',values});
  await gate.reached;assert.equal((await c.selectScope({kind:'global'})).code,'media-not-ready');gate.fail();
  await assert.rejects(pending);await h.settle();assert.equal(c.view().phase,'unknown');
  assert.equal((await c.selectScope({kind:'global'})).ok,false);
  assert.equal(h.saved.mediaProfiles.presets[0].id,P);
  c.discardPending();await h.settle();assert.equal(c.view().phase,'ready');
  assert.equal(h.messages.filter(entry=>entry.message.action==='create-preset').length,1);
});
test('closed local waiter does not cancel a durable queued media commit',async t=>{
  const {h,c}=await enabled(t),gate=h.holdNext('commit');c.editFields('audio',{compressorRatio:7});await gate.reached;
  c.dispose();gate.release();await h.settle();const reopened=client(t,h);await h.settle();await reopened.selectScope(saved);
  assert.equal(reopened.view().values.audio.compressorRatio,7);
});
test('corrupt media has independent repair state and does not block the existing global client',async t=>{
  const h=settingsHarness(t,{mediaProfiles:{schema:99,revision:0,channels:[],presets:[]}}),c=client(t,h),global=h.client();await h.settle();
  assert.equal(c.view().phase,'repair-required');global.edit({type:'config',id:'brightness',value:1.225});await h.settle();
  assert.equal(h.saved.config.brightness,1.225);assert.equal(global.view().phase,'ready');
});
test('explicit read-back confirms only the original unknown preset creation without a new UUID or write',async t=>{
  const {h,c}=await enabled(t),gate=h.holdNext('callback:create-preset');
  const request={action:'create-preset',id:P,expectedMediaRevision:1,domain:'audio',name:'Quiet',values:structuredClone(c.view().values.audio)};
  const pending=c.perform(request);await gate.reached;gate.fail();await assert.rejects(pending);await h.settle();
  assert.equal(c.view().pendingRequest?.id,P);const writes=h.calls.filter(call=>call.kind==='commit').length;
  await c.refresh();await h.settle();assert.equal(c.view().phase,'ready');assert.equal(c.view().pendingRequest,null);
  assert.equal(h.calls.filter(call=>call.kind==='commit').length,writes);assert.equal(h.messages.filter(entry=>entry.message.action==='create-preset').length,1);
});
test('stale read and acknowledgement cannot replace newer saved fields',async t=>{
  const {h,c}=await enabled(t),read=h.holdNext('callback:get-media-snapshot'),reading=c.refresh();await read.reached;
  const ack=h.holdNext('callback:patch-channel-fields');c.editFields('audio',{compressorRatio:7});await ack.reached;ack.release();await flush();
  assert.equal(c.view().values.audio.compressorRatio,7);read.release();await reading;await h.settle();
  assert.equal(c.view().values.audio.compressorRatio,7);assert.equal(c.view().phase,'ready');
});
test('lost patch ACK read-back holds newer draft without dispatch',async t=>{
  const {h,c}=await enabled(t),observed=[];c.subscribe(view=>observed.push({phase:view.phase,ratio:view.values.audio.compressorRatio}));
  const gate=h.holdNext('callback:patch-channel-fields');c.editFields('audio',{compressorRatio:7});await gate.reached;
  c.editFields('audio',{compressorRatio:5});gate.fail();await h.settle();
  assert.ok(observed.some(view=>view.phase==='unknown'&&view.ratio===5));
  await c.refresh();h.changes.emit({config:{newValue:{previewVolume:25}}},'local');await h.settle();
  const writes=h.messages.filter(entry=>entry.message.action==='patch-channel-fields').map(entry=>entry.message.patch.compressorRatio);
  assert.deepEqual(writes,[7]);assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorRatio,7);
  assert.equal(c.view().phase,'unknown');assert.equal(c.view().values.audio.compressorRatio,5);
  assert.equal(c.view().pendingRequest.patch.compressorRatio,7);assert.equal((await c.selectScope({kind:'global'})).ok,false);
  c.discardPending();await h.settle();assert.equal(c.view().values.audio.compressorRatio,7);
  c.editFields('audio',{compressorRatio:5});await h.settle();assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorRatio,5);
});

test('same saved field value does not authenticate an unknown patch commit',async t=>{
  const {h,c}=await enabled(t),gate=h.holdNext('callback:patch-channel-fields');
  c.editFields('audio',{compressorRatio:7});await gate.reached;gate.fail();await h.settle();const before=h.calls.filter(x=>x.kind==='commit').length;
  await c.refresh();await h.settle();assert.equal(c.view().phase,'unknown');assert.equal(c.view().pendingRequest.action,'patch-channel-fields');
  assert.equal(h.calls.filter(x=>x.kind==='commit').length,before);
});
test('unknown preset confirmation holds newer unsent fields until explicit discard and re-edit',async t=>{
  const {h,c}=await enabled(t),gate=h.holdNext('callback:create-preset');const request={action:'create-preset',id:P,
    expectedMediaRevision:1,domain:'audio',name:'Quiet',values:structuredClone(c.view().values.audio)};
  const pending=c.perform(request);await gate.reached;c.editFields('audio',{compressorRatio:5});gate.fail();await assert.rejects(pending);await h.settle();
  const before=h.calls.filter(x=>x.kind==='commit').length;await c.refresh();await h.settle();
  assert.equal(h.calls.filter(x=>x.kind==='commit').length,before);assert.equal(c.view().phase,'failed');assert.equal(c.view().code,'draft-held');
  assert.equal(c.view().pendingRequest,null);assert.deepEqual(Array.from(c.view().pendingKeys),['audio:compressorRatio']);assert.equal(c.view().values.audio.compressorRatio,5);
  assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorRatio,12);
  c.discardPending();await h.settle();assert.equal(c.view().phase,'ready');assert.equal(h.calls.filter(x=>x.kind==='commit').length,before);
});
test('unknown preset cannot confirm a modified or recreated record',async t=>{
  for(const change of [preset=>{preset.revision++;},preset=>{preset.createdRevision+=2;},preset=>{preset.values.compressorRatio=5;}]){
    const {h,c}=await enabled(t),gate=h.holdNext('callback:create-preset');const request={action:'create-preset',id:P,
      expectedMediaRevision:1,domain:'audio',name:'Quiet',values:structuredClone(c.view().values.audio)};
    const pending=c.perform(request);await gate.reached;gate.fail();await assert.rejects(pending);await h.settle();
    change(h.saved.mediaProfiles.presets[0]);h.saved.mediaProfiles.revision+=2;const before=h.messages.length;
    await c.refresh();await h.settle();assert.equal(c.view().phase,'unknown');assert.equal(c.view().pendingRequest.id,P);
    assert.ok(h.messages.slice(before).every(x=>x.message.action==='get-media-snapshot'));
  }
});
test('unknown channel enable confirms only its original creation without another write',async t=>{
  const h=settingsHarness(t),c=client(t,h);await h.settle();await c.selectScope(saved);const gate=h.holdNext('callback:enable-channel-domain');
  const pending=c.perform({action:'enable-channel-domain',selection:saved,domain:'audio',expectedMediaRevision:0,expectedGlobalRevision:0,expectedRecord:null});
  await gate.reached;gate.fail();await assert.rejects(pending);await h.settle();const before=h.calls.filter(x=>x.kind==='commit').length;
  await c.refresh();await h.settle();assert.equal(c.view().phase,'ready');assert.equal(c.view().pendingRequest,null);
  assert.equal(h.calls.filter(x=>x.kind==='commit').length,before);assert.equal(h.messages.filter(x=>x.message.action==='enable-channel-domain').length,1);
});
test('media transport retires even when invalidated Chrome rejects listener cleanup',async t=>{
  const {h,c}=await enabled(t),gate=h.holdNext('callback:create-preset');const pending=c.perform({action:'create-preset',id:P,
    expectedMediaRevision:1,domain:'audio',name:'Quiet',values:structuredClone(c.view().values.audio)});
  await gate.reached;const outcome=pending.then(()=> 'unexpected',error=>error.code);
  c.api.storage={...c.api.storage,onChanged:{...c.api.storage.onChanged,removeListener:()=>{throw Error('Extension context invalidated.');}}};
  assert.throws(()=>c.dispose(),/context invalidated/);
  assert.equal(await Promise.race([outcome,new Promise(resolve=>setTimeout(()=>resolve('still-pending'),100))]),'disposed');
});
test('media read codec rejects malformed protocol identity versions values and catalogue',async t=>{
  for(const corrupt of [reply=>{reply.protocol=1;},reply=>{reply.requestId='other';},reply=>{reply.stored=true;},
    reply=>{reply.snapshot.version.globalRevision=-1;},reply=>{reply.snapshot.values.audio.compressorRatio=99;},
    reply=>{reply.snapshot.store.channels.push({channelId:A});},reply=>{reply.snapshot.selection={kind:'saved',channelId:A};}]) {
    const h=settingsHarness(t),gate=h.holdNext('callback:get-media-snapshot'),c=client(t,h),reply=await gate.reached;
    corrupt(reply);gate.release();await h.settle();assert.equal(c.view().phase,'unknown');assert.equal(c.view().snapshot,null);
    assert.equal(h.calls.filter(call=>call.kind==='commit').length,0);
  }
});
test('empty media field edit is a no-op and a disposed client cannot acquire new subscribers',async t=>{
  const {h,c}=await enabled(t),writes=h.calls.filter(call=>call.kind==='commit').length;c.editFields('audio',{});await h.settle();
  assert.equal(c.view().phase,'ready');assert.equal(h.calls.filter(call=>call.kind==='commit').length,writes);
  c.dispose();let callbacks=0;c.subscribe(()=>callbacks++);assert.equal(callbacks,0);
});
