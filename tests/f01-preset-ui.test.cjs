const test=require('node:test'),assert=require('node:assert/strict');
const {settingsHarness}=require('./settings-fixture.cjs');
const A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
async function setup(t,raw={config:{audioGain:.75,gainInherited:false}}){const h=settingsHarness(t,raw),ui=await h.openUi('popup',{surface:'tab',query:`?mediaSettings=1&targetTabId=7&targetWindowId=9&targetChannelId=${A}`,setup:(_,dom)=>{dom.window.confirm=()=>true;}});await h.settle();return {h,...ui,doc:ui.dom.window.document};}
async function prepare(h,dom,doc,domain='audio'){
  doc.getElementById('media-preset-domain').value=domain;doc.getElementById('media-preset-domain').dispatchEvent(new dom.window.Event('change'));
  const details=doc.getElementById('media-preset-new');details.open=true;details.dispatchEvent(new dom.window.Event('toggle'));await h.settle();
  doc.getElementById('media-preset-create-name').value='Saved';
}
test('approved panel replaces legacy audio rows and preset application is not duplicated in management',async t=>{
  const {doc}=await setup(t);assert.ok(doc.getElementById('audio-master'));assert.equal(doc.querySelectorAll('#compressorThreshold').length,1);
  assert.equal(doc.getElementById('media-preset-apply'),null);assert.equal(doc.getElementById('media-preset-new').open,false);
  assert.ok(doc.getElementById('media-audio-preset-apply'));assert.ok(doc.getElementById('media-video-preset-apply'));
});
test('recipe keeps Gain/default/current intent and other domain, without implicit channel creation',async t=>{
  const {h,dom,doc}=await setup(t,{config:{audioGain:.75,gainInherited:false,compressorDefault:true,brightness:1.5}});
  const recipe=doc.getElementById('media-audio-preset');recipe.value='recipe:voice';recipe.dispatchEvent(new dom.window.Event('change'));doc.getElementById('media-audio-preset-apply').click();await h.settle();
  assert.equal(h.saved.config.eqEnabled,true);assert.equal(h.saved.config.eq2000,2);assert.equal(h.saved.config.audioGain,.75);assert.equal(h.saved.config.gainInherited,false);
  assert.equal(h.saved.config.compressorDefault,true);assert.equal(h.saved.config.brightness,1.5);assert.equal(h.saved.mediaProfiles,undefined);
});
test('creation captures confirmed origin and rejects changed scope/value while keeping draft name',async t=>{
  const {h,dom,doc}=await setup(t);await prepare(h,dom,doc);const number=doc.getElementById('compressorThreshold-number');number.value='-20';number.dispatchEvent(new dom.window.Event('input'));await h.settle();
  const writes=h.calls.filter(c=>c.kind==='commit').length;doc.getElementById('media-preset-create').click();await h.settle();
  assert.equal(h.saved.mediaProfiles,undefined);assert.equal(h.calls.filter(c=>c.kind==='commit').length,writes);assert.equal(doc.getElementById('media-preset-create-name').value,'Saved');
  assert.match(doc.getElementById('media-create-status').textContent,/다시/);
});
test('confirmed owned preset creates and renames separately; site legacy gain cannot be copied as confirmed',async t=>{
  const {h,dom,doc}=await setup(t);await prepare(h,dom,doc);doc.getElementById('media-preset-create').click();await h.settle();
  assert.equal(h.saved.mediaProfiles.presets[0].values.audioGain,.75);assert.equal(h.saved.mediaProfiles.presets[0].values.gainInherited,false);
  doc.getElementById('media-preset-name').value='Renamed';doc.getElementById('media-preset-rename').click();await h.settle();assert.equal(h.saved.mediaProfiles.presets[0].name,'Renamed');
  const other=await setup(t,{});await prepare(other.h,other.dom,other.doc);assert.equal(other.doc.getElementById('media-preset-create').disabled,true);
  assert.match(other.doc.getElementById('media-create-status').textContent,/Gain/);
});
test('cancelled apply and schema upgrade write nothing, schema projection stays locked until approved',async t=>{
  const {h,dom,doc}=await setup(t,{mediaProfiles:{schema:1,revision:0,channels:[],presets:[]}});assert.equal(doc.getElementById('eq63').disabled,true);
  dom.window.confirm=()=>false;doc.getElementById('media-upgrade').click();await h.settle();assert.equal(h.saved.mediaProfiles.schema,1);
  dom.window.confirm=()=>true;doc.getElementById('media-upgrade').click();await h.settle();assert.equal(h.saved.mediaProfiles.schema,2);
  dom.window.confirm=()=>false;doc.getElementById('media-audio-preset').value='recipe:voice';doc.getElementById('media-audio-preset').dispatchEvent(new dom.window.Event('change'));
  const writes=h.calls.filter(c=>c.kind==='commit').length;doc.getElementById('media-audio-preset-apply').click();await h.settle();assert.equal(h.calls.filter(c=>c.kind==='commit').length,writes);
});
test('external storage notification does not blur or overwrite a focused incomplete numeric draft',async t=>{
  const {h,dom,doc}=await setup(t),input=doc.getElementById('compressorThreshold-number');input.focus();input.value='';input.dispatchEvent(new dom.window.Event('input'));
  const gate=h.holdNext('callback:get-media-snapshot');h.changes.emit({config:{newValue:{}}},'local');await gate.reached;
  assert.equal(input.disabled,false);assert.equal(doc.activeElement,input);assert.equal(input.value,'');gate.release();await h.settle();
  assert.equal(doc.activeElement,input);assert.equal(input.value,'');assert.equal(h.calls.filter(c=>c.kind==='commit').length,0);
});
test('approved audio video and management tabs expose one panel and save-as opens management without copying stale drafts',async t=>{
  const {h,doc}=await setup(t),video=doc.querySelector('[data-media-panel="video"]');assert.ok(video,'approved panel navigation must exist');video.click();
  assert.equal(video.getAttribute('aria-selected'),'true');assert.equal(doc.getElementById('media-audio-tab-panel').hidden,true);
  doc.getElementById('media-video-save-preset').click();await h.settle();
  assert.equal(doc.getElementById('media-presets').hidden,false);assert.equal(doc.getElementById('media-preset-new').open,true);
  assert.equal(doc.getElementById('media-preset-domain').value,'video');assert.equal(h.calls.filter(c=>c.kind==='commit').length,0);
  assert.equal(doc.activeElement,doc.getElementById('media-preset-create-name'));
});
test('first empty management entry opens creation once without reopening a manually collapsed section',async t=>{
  const {h,doc}=await setup(t),details=doc.getElementById('media-preset-new');
  doc.querySelector('[data-media-panel="presets"]').click();await h.settle();assert.equal(details.open,true);
  const name=doc.getElementById('media-preset-create-name');name.value='Keep name';name.dispatchEvent(new doc.defaultView.Event('input'));
  details.open=false;await h.settle();doc.querySelector('[data-media-panel="audio"]').click();
  h.changes.emit({config:{}},'local');await h.settle();doc.querySelector('[data-media-panel="presets"]').click();await h.settle();
  assert.equal(details.open,false);assert.equal(name.value,'Keep name');assert.equal(h.calls.filter(c=>c.kind==='commit').length,0);
});
test('populated management preserves compact layout and save-as retains its domain name draft and focus',async t=>{
  const {h,dom,doc}=await setup(t);await prepare(h,dom,doc);doc.getElementById('media-preset-create').click();await h.settle();
  const details=doc.getElementById('media-preset-new');details.open=false;await h.settle();
  doc.querySelector('[data-media-panel="presets"]').click();await h.settle();assert.equal(details.open,false);
  doc.querySelector('[data-media-panel="audio"]').click();doc.getElementById('media-audio-save-preset').click();await h.settle();
  assert.equal(doc.activeElement,doc.getElementById('media-preset-create-name'));assert.equal(doc.getElementById('media-preset-create-name').value,'Saved');
  assert.equal(h.saved.mediaProfiles.presets.length,1);
});
test('live legacy read remains single-flight and disabled across intermediate UI renders',async t=>{
  const {h,doc}=await setup(t),read=doc.getElementById('media-legacy-read');assert.equal(read.disabled,false);
  const gate=h.holdNext('callback:read-legacy-gain');read.click();await gate.reached;
  doc.querySelector('[data-media-panel="presets"]').click();assert.equal(read.disabled,true);
  read.click();assert.equal(h.messages.filter(e=>e.message.action==='read-legacy-gain').length,1);
  gate.release();await h.settle();assert.equal(read.disabled,false);
});
test('empty first management entry during loading opens after its snapshot without writing',async t=>{
  const h=settingsHarness(t,{config:{audioGain:1,gainInherited:false}}),gate=h.holdNext('callback:get-media-snapshot');
  const {dom}=await h.openUi('popup',{surface:'tab',query:`?mediaSettings=1&targetTabId=7&targetWindowId=9&targetChannelId=${A}`});
  await gate.reached;const doc=dom.window.document;doc.querySelector('[data-media-panel="presets"]').click();
  gate.release();await h.settle();assert.equal(doc.getElementById('media-preset-new').open,true);
  assert.equal(h.calls.filter(c=>c.kind==='commit').length,0);
});
test('delayed native details toggle cannot recapture a changed source after save-as entry',async t=>{
  const {h,dom,doc}=await setup(t),details=doc.getElementById('media-preset-new'),hold=event=>event.stopImmediatePropagation();
  details.addEventListener('toggle',hold,true);doc.getElementById('media-audio-save-preset').click();
  doc.getElementById('media-preset-create-name').value='Original';
  await h.patch('popup',[{type:'config',id:'compressorThreshold',value:-20}]);await h.settle();
  details.removeEventListener('toggle',hold,true);details.dispatchEvent(new dom.window.Event('toggle'));
  const writes=h.calls.filter(c=>c.kind==='commit').length;doc.getElementById('media-preset-create').click();await h.settle();
  assert.equal(h.saved.mediaProfiles,undefined);assert.equal(h.calls.filter(c=>c.kind==='commit').length,writes);
  assert.equal(doc.getElementById('media-preset-create-name').value,'Original');
});
test('delayed first empty management toggle cannot capture settings changed after entry',async t=>{
  const {h,dom,doc}=await setup(t),details=doc.getElementById('media-preset-new'),hold=event=>event.stopImmediatePropagation();
  details.addEventListener('toggle',hold,true);doc.querySelector('[data-media-panel="presets"]').click();
  doc.getElementById('media-preset-create-name').value='First entry';
  await h.patch('popup',[{type:'config',id:'compressorThreshold',value:-20}]);await h.settle();
  details.removeEventListener('toggle',hold,true);details.dispatchEvent(new dom.window.Event('toggle'));
  const writes=h.calls.filter(c=>c.kind==='commit').length;doc.getElementById('media-preset-create').click();await h.settle();
  assert.equal(h.saved.mediaProfiles,undefined,'entry must not silently capture the later source');
  assert.equal(h.calls.filter(c=>c.kind==='commit').length,writes);assert.equal(doc.getElementById('media-preset-create-name').value,'First entry');
});
test('first management entry during invalidation waits for a fresh snapshot before preparing creation',async t=>{
  const {h,doc}=await setup(t),gate=h.holdNext('callback:get-media-snapshot');
  h.changes.emit({config:{}},'local');await gate.reached;
  doc.querySelector('[data-media-panel="presets"]').click();assert.equal(doc.getElementById('media-preset-new').open,false);
  gate.release();await h.settle();assert.equal(doc.getElementById('media-preset-new').open,true);
  assert.equal(doc.getElementById('media-preset-create').disabled,false);assert.equal(h.saved.mediaProfiles,undefined);
});
