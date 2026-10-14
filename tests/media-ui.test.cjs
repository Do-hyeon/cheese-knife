const test=require('node:test'),assert=require('node:assert/strict');
const {settingsHarness}=require('./settings-fixture.cjs');
const A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
async function popup(t,raw={}){const h=settingsHarness(t,raw),ui=await h.openUi('popup');await h.settle();return {h,...ui,doc:ui.dom.window.document};}
test('popup defaults to global and explicit channel enable saves only one selected domain',async t=>{
  const {h,dom,doc}=await popup(t),scope=doc.getElementById('media-scope');assert.ok(scope,'scope selector must exist');
  assert.equal(scope.value,'global');assert.equal(h.calls.filter(call=>call.kind==='commit').length,0);
  scope.value='current';scope.dispatchEvent(new dom.window.Event('change'));await h.settle();
  assert.equal(doc.getElementById('compressorThreshold').disabled,true);
  doc.getElementById('media-audio-enable').click();await h.settle();
  assert.equal(h.saved.mediaProfiles.channels[0].channelId,A);assert.equal(h.saved.mediaProfiles.channels[0].video,undefined);
  const input=doc.getElementById('compressorThreshold');input.value='-35';input.dispatchEvent(new dom.window.Event('input'));await h.settle();
  assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorThreshold,-35);
  const preview=doc.getElementById('previewVolume');preview.value='25';preview.dispatchEvent(new dom.window.Event('input'));await h.settle();
  assert.equal(h.saved.config.previewVolume,25);assert.equal(h.saved.config.compressorThreshold,undefined);
});
test('media repair still allows global video/audio controls and renders labels as plain text',async t=>{
  const {h,dom,doc}=await popup(t,{mediaProfiles:{schema:99,revision:0,channels:[],presets:[]}});
  assert.ok(doc.getElementById('media-scope'));const input=doc.getElementById('brightness');assert.equal(input.disabled,false);
  input.value='1.25';input.dispatchEvent(new dom.window.Event('input'));await h.settle();assert.equal(h.saved.config.brightness,1.25);
  assert.equal(doc.getElementById('media-preset-create').disabled,true);
});
test('popup cannot infer a current channel from a numeric VOD or silently change target',async t=>{
  const h=settingsHarness(t);h.tabs.get(7).url='https://chzzk.naver.com/video/123456';
  const {dom}=await h.openUi('popup');await h.settle();const scope=dom.window.document.getElementById('media-scope');assert.ok(scope);
  assert.equal(scope.querySelector('option[value="current"]').disabled,true);assert.equal(h.calls.filter(call=>call.kind==='commit').length,0);
});
test('channel neutral reset and global inheritance preserve the other domain',async t=>{
  const {h,dom,doc}=await popup(t),scope=doc.getElementById('media-scope');scope.value='current';scope.dispatchEvent(new dom.window.Event('change'));await h.settle();
  doc.getElementById('media-audio-enable').click();await h.settle();doc.getElementById('media-video-enable').click();await h.settle();
  const ratio=doc.getElementById('compressorRatio');ratio.value='7';ratio.dispatchEvent(new dom.window.Event('input'));await h.settle();
  const brightness=doc.getElementById('brightness');brightness.value='2';brightness.dispatchEvent(new dom.window.Event('input'));await h.settle();
  brightness.dispatchEvent(new dom.window.Event('dblclick'));await h.settle();assert.equal(h.saved.mediaProfiles.channels[0].video.values.brightness,1);
  assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorRatio,7);
  doc.getElementById('media-video-global').click();await h.settle();assert.equal(h.saved.mediaProfiles.channels[0].video,undefined);
  assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorRatio,7);
});
test('preset names remain plain text and save/apply/rename/delete use the selected domain only',async t=>{
  const {h,dom,doc}=await popup(t),name=doc.getElementById('media-preset-name');name.value='<img src=x onerror=alert(1)>';
  doc.getElementById('media-preset-create').click();await h.settle();assert.equal(h.saved.mediaProfiles.presets.length,1);
  const id=h.saved.mediaProfiles.presets[0].id;assert.equal(doc.querySelector('#media-preset img'),null);
  assert.ok(doc.getElementById('media-preset').textContent.includes(name.value));
  name.value='Quiet';doc.getElementById('media-preset-rename').click();await h.settle();assert.equal(h.saved.mediaProfiles.presets[0].id,id);
  assert.equal(h.saved.mediaProfiles.presets[0].name,'Quiet');doc.getElementById('media-preset-apply').click();await h.settle();
  assert.equal(h.saved.config.compressorThreshold,-50);assert.equal(h.saved.config.brightness,undefined);
  doc.getElementById('media-preset-delete').click();await h.settle();assert.equal(h.saved.mediaProfiles.presets.length,0);
});
test('preset apply is disabled when its domain has not been explicitly enabled on the selected channel',async t=>{
  const {h,dom,doc}=await popup(t);doc.getElementById('media-preset-name').value='Quiet';doc.getElementById('media-preset-create').click();await h.settle();
  const scope=doc.getElementById('media-scope');scope.value='current';scope.dispatchEvent(new dom.window.Event('change'));await h.settle();
  assert.equal(doc.getElementById('media-preset-apply').disabled,true);doc.getElementById('media-audio-enable').click();await h.settle();
  assert.equal(doc.getElementById('media-preset-apply').disabled,false);
});
test('deleting a managed saved channel retains its explicit selection without silently retargeting',async t=>{
  const {h,dom,doc}=await popup(t),scope=doc.getElementById('media-scope');scope.value='current';scope.dispatchEvent(new dom.window.Event('change'));await h.settle();
  doc.getElementById('media-audio-enable').click();await h.settle();scope.value=`saved:${A}`;scope.dispatchEvent(new dom.window.Event('change'));await h.settle();
  doc.getElementById('media-channel-delete').click();await h.settle();assert.equal(h.saved.mediaProfiles.channels.length,0);
  assert.equal(scope.value,`saved:${A}`);assert.equal(doc.getElementById('compressorThreshold').disabled,true);
});
test('conflict preserves intended full replacement and exposes saved-versus-draft values before discard',async t=>{
  const {h,dom,doc}=await popup(t),scope=doc.getElementById('media-scope');scope.value='current';scope.dispatchEvent(new dom.window.Event('change'));await h.settle();
  doc.getElementById('media-audio-enable').click();await h.settle();doc.getElementById('media-preset-name').value='Quiet';doc.getElementById('media-preset-create').click();await h.settle();
  const gate=h.holdNext('context-get');doc.getElementById('media-preset-apply').click();await gate.reached;
  h.saved.mediaProfiles.channels[0].revision++;h.saved.mediaProfiles.revision++;gate.release();await h.settle();
  assert.equal(doc.getElementById('media-status').dataset.phase,'conflict');
  const draft=doc.getElementById('media-draft');assert.ok(draft,'draft differences must be visible');assert.equal(draft.hidden,false);
  assert.ok(draft.textContent.includes('compressorThreshold'));assert.equal(doc.getElementById('media-preset-name').value,'Quiet');
  doc.getElementById('media-discard').click();await h.settle();assert.equal(draft.hidden,true);assert.equal(doc.getElementById('media-status').dataset.phase,'ready');
});
