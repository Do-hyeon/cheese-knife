const test=require('node:test'),assert=require('node:assert/strict');
const {settingsHarness,getURL}=require('./settings-fixture.cjs');
const A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',B='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const triple=`?mediaSettings=1&targetTabId=7&targetWindowId=9&targetChannelId=${A}`;
async function ui(t,query='',surface='tab',setup){const h=settingsHarness(t);const result=await h.openUi('popup',{query,surface,setup});
  await h.settle();return {h,...result,doc:result.dom.window.document};}

test('toolbar keeps global edits without media bootstrap or automatic tab creation',async t=>{
  const {h,dom,doc}=await ui(t,'','toolbar');assert.equal(doc.getElementById('media-controls').hidden,true);
  assert.equal(h.messages.some(e=>e.message.protocol===2),false);assert.equal(Object.hasOwn(h.saved,'mediaProfiles'),false);
  assert.equal(h.calls.some(c=>c.kind==='tab-create'),false);
  const input=doc.getElementById('brightness');input.value='1.25';input.dispatchEvent(new dom.window.Event('input'));await h.settle();
  assert.equal(h.saved.config.brightness,1.25);assert.equal(Object.hasOwn(h.saved,'mediaProfiles'),false);
});
test('explicit toolbar opener pins original window and channel once',async t=>{
  const {h,doc}=await ui(t,'','toolbar');const opener=doc.getElementById('media-open');assert.ok(opener,'explicit opener');
  opener.click();await h.settle();const created=h.calls.filter(c=>c.kind==='tab-create');assert.equal(created.length,1);
  assert.deepEqual(created[0].args,{windowId:9,url:getURL(`popup.html${triple}`)});
  assert.equal(h.calls.filter(c=>c.kind==='tab-query').length,1);
});
test('queryless own tab never captures another active broadcast',async t=>{
  const {h,doc}=await ui(t);assert.equal(h.calls.some(c=>c.kind==='tab-query'),false);
  assert.equal(h.messages.some(e=>e.message.protocol===2),false);
  assert.equal(new URL(doc.getElementById('stylesConfig').closest('a').href).search,'');
});
test('valid media tab starts at global and enables only its exact original channel',async t=>{
  const {h,doc}=await ui(t,triple);assert.equal(doc.getElementById('media-controls').hidden,false);
  assert.equal(doc.getElementById('media-status').dataset.phase,'ready');assert.equal(doc.getElementById('media-scope').value,'global');
  assert.equal(doc.querySelector('#media-scope option[value="current"]').disabled,false);
  assert.equal(h.calls.some(c=>c.kind==='tab-query'),false);assert.equal(Object.hasOwn(h.saved,'mediaProfiles'),false);
});
test('VOD pair survives media tab to styles without inventing a channel',async t=>{
  const {h,doc}=await ui(t,'?mediaSettings=1&targetTabId=7&targetWindowId=9','tab',api=>{
    api.tabs.get=async()=>({id:7,windowId:9,url:'https://chzzk.naver.com/video/12345',incognito:false});});
  assert.equal(doc.getElementById('media-status').dataset.phase,'ready');
  assert.equal(doc.querySelector('#media-scope option[value="current"]').disabled,true);
  const link=new URL(doc.getElementById('stylesConfig').closest('a').href);
  assert.equal(link.searchParams.get('targetTabId'),'7');assert.equal(link.searchParams.get('targetWindowId'),'9');
  assert.equal(h.calls.some(c=>c.kind==='tab-query'),false);
});
test('navigation between capture and settings tab cannot adopt channel B',async t=>{
  const {doc}=await ui(t,triple,'tab',api=>{api.tabs.get=async()=>({id:7,windowId:9,url:`https://chzzk.naver.com/live/${B}`,incognito:false});});
  assert.equal(doc.querySelector('#media-scope option[value="current"]').disabled,true);
  assert.equal(doc.getElementById('media-status').dataset.phase,'ready');
});
test('targetless management does not query or create another tab',async t=>{
  const {h,doc}=await ui(t,'?mediaSettings=1');assert.equal(doc.getElementById('media-status').dataset.phase,'ready');
  assert.equal(doc.querySelector('#media-scope option[value="current"]').disabled,true);
  assert.equal(h.calls.some(c=>c.kind==='tab-query'||c.kind==='tab-create'),false);
});
test('malformed target is limited without breaking global media management',async t=>{
  for(const query of ['&targetTabId=7','&targetTabId=-1&targetWindowId=9','&targetTabId=07&targetWindowId=9',
    '&targetTabId=9007199254740992&targetWindowId=9','&targetTabId=7&targetTabId=7&targetWindowId=9',
    `&targetChannelId=${A}`,'&unknown=1','&targetTabId=7&targetWindowId=9#bad','&padding='+ 'x'.repeat(513)]){
    const {h,doc}=await ui(t,'?mediaSettings=1'+query);assert.equal(doc.getElementById('media-status').dataset.phase,'ready');
    assert.equal(doc.querySelector('#media-scope option[value="current"]').disabled,true);
    assert.equal(new URL(doc.getElementById('stylesConfig').closest('a').href).search,'');
    assert.equal(h.calls.some(c=>c.kind==='tab-query'),false);
  }
});
test('unknown or duplicated mode never bootstraps media client',async t=>{
  for(const query of ['?mediaSettings=0','?mediaSettings=1&mediaSettings=1']){
    const {h,doc}=await ui(t,query);assert.equal(h.messages.some(e=>e.message.protocol===2),false);
    assert.equal(doc.getElementById('media-controls').hidden,true);
  }
});
test('opener refuses incognito or missing original window without fallback',async t=>{
  for(const scenario of ['incognito','missing']){
    const {h,doc}=await ui(t,'','toolbar',api=>{api.windows.get=async()=>{if(scenario==='missing')throw Error('closed');return {id:9,incognito:true};};});
    const button=doc.getElementById('media-open');assert.ok(button);assert.equal(button.disabled,false);button.click();await h.settle();
    assert.equal(h.calls.some(c=>c.kind==='tab-create'),false);
    assert.equal(h.calls.filter(c=>c.kind==='tab-query').length,1);
  }
});
test('getCurrent failure is not a toolbar fallback',async t=>{
  const {h}=await ui(t,'','tab',api=>{api.tabs.getCurrent=async()=>{throw Error('unavailable');};});
  assert.equal(h.calls.some(c=>c.kind==='tab-query'||c.kind==='tab-create'),false);
});
test('iframe never bootstraps editors or media transport',async t=>{
  const {h,doc}=await ui(t,'?mediaSettings=1','tab',(_,dom)=>dom.reconfigure({windowTop:{}}));
  assert.equal(h.messages.length,0);assert.equal(doc.getElementById('list').children.length,0);
  assert.equal(doc.getElementById('media-controls').hidden,true);
});
test('target metadata failure never supplies current or styles target',async t=>{
  for(const change of [()=>undefined,tab=>({...tab,windowId:10}),tab=>({...tab,url:'http://chzzk.naver.com/live/'+A}),
    tab=>({...tab,url:'https://chzzk.naver.com.evil/live/'+A}),tab=>({...tab,incognito:true}),tab=>({...tab,incognito:undefined}),tab=>({...tab,id:8})]){
    const {h,doc}=await ui(t,triple,'tab',api=>{api.tabs.get=async()=>{const tab=change({id:7,windowId:9,url:'https://chzzk.naver.com/live/'+A,incognito:false});
      if(!tab)throw Error('closed');return tab;};});
    assert.equal(doc.querySelector('#media-scope option[value="current"]').disabled,true);
    assert.equal(new URL(doc.getElementById('stylesConfig').closest('a').href).search,'');
    assert.equal(h.calls.some(c=>c.kind==='tab-query'),false);
  }
});
test('rapid opener clicks create one pinned tab while window lookup waits',async t=>{
  const {h,doc}=await ui(t,'','toolbar');const gate=h.holdNext('window-get'),button=doc.getElementById('media-open');
  button.click();await gate.reached;button.click();assert.equal(button.disabled,true);gate.release();await h.settle();
  assert.equal(h.calls.filter(c=>c.kind==='tab-create').length,1);
});
test('non-CHZZK toolbar opens targetless management in the original window',async t=>{
  const {h,doc}=await ui(t,'','toolbar',api=>{api.tabs.query=async()=>[{id:7,windowId:9,url:'https://example.com/',incognito:false}];});
  doc.getElementById('media-open').click();await h.settle();
  assert.deepEqual(h.calls.find(c=>c.kind==='tab-create').args,{windowId:9,url:getURL('popup.html?mediaSettings=1')});
});
test('unsafe original tab id cannot enable toolbar opener',async t=>{
  const {h,doc}=await ui(t,'','toolbar',api=>{api.tabs.query=async()=>[{id:-1,windowId:9,incognito:false}];});
  assert.equal(doc.getElementById('media-open').disabled,true);doc.getElementById('media-open').click();await h.settle();
  assert.equal(h.calls.some(c=>c.kind==='tab-create'),false);
});
test('media layout puts one audio and video editor after scope and before presets',async t=>{
  const {doc}=await ui(t,triple);const fields=doc.getElementById('media-fields');assert.ok(fields);
  assert.equal(fields.querySelectorAll('input').length,11);assert.equal(fields.querySelectorAll('details[open]').length,2);
  for(const id of ['brightness','compressorThreshold'])assert.equal(doc.querySelectorAll('#'+id).length,1);
  const scope=doc.getElementById('media-scope'),presets=doc.getElementById('media-presets');
  assert.ok(scope.compareDocumentPosition(fields)&4);assert.ok(fields.compareDocumentPosition(presets)&4);
  assert.equal(doc.querySelector('#list #previewVolume')!==null,true);
});
test('VOD styles application reloads only captured VOD tab',async t=>{
  const h=settingsHarness(t);h.tabs.get(7).url='https://chzzk.naver.com/video/12345';
  const media=await h.openUi('popup',{surface:'tab',query:'?mediaSettings=1&targetTabId=7&targetWindowId=9'});await h.settle();
  const query=new URL(media.dom.window.document.getElementById('stylesConfig').closest('a').href).search;
  const styles=await h.openUi('styles',{surface:'tab',query});await h.settle();
  const input=styles.dom.window.document.getElementById('left-chat');input.checked=true;input.dispatchEvent(new styles.dom.window.Event('change'));
  await h.settle();styles.dom.window.document.getElementById('reload').click();await h.settle();
  assert.deepEqual(h.calls.filter(c=>c.kind==='tab-reload').map(c=>c.args.id),[7]);
});
function edit(dom,id,value){const input=dom.window.document.getElementById(id);input.value=String(value);input.dispatchEvent(new dom.window.Event('input'));}
function mutations(h){return h.messages.filter(x=>x.message.protocol===2&&x.message.action!=='get-media-snapshot');}
async function channel(t){const result=await ui(t,triple);result.doc.getElementById('media-scope').value='current';
  result.doc.getElementById('media-scope').dispatchEvent(new result.dom.window.Event('change'));await result.h.settle();
  result.doc.getElementById('media-audio-enable').click();await result.h.settle();return result;}
test('preset creation waits while displayed global value differs from delayed media snapshot',async t=>{
  const {h,dom,doc}=await ui(t,'?mediaSettings=1');const gate=h.holdNext('callback:get-media-snapshot');
  h.changes.emit({config:{newValue:{}}},'local');await gate.reached;edit(dom,'brightness',2);await new Promise(r=>setTimeout(r,60));
  doc.getElementById('media-preset-domain').value='video';doc.getElementById('media-preset-name').value='Bright';
  doc.getElementById('media-preset-domain').dispatchEvent(new dom.window.Event('change'));
  assert.equal(doc.getElementById('brightness').value,'2');assert.equal(doc.getElementById('media-preset-create').disabled,true);
  doc.getElementById('media-preset-create').click();assert.equal(mutations(h).length,0);gate.release();await h.settle();
  assert.equal(doc.getElementById('media-preset-create').disabled,false);doc.getElementById('media-preset-create').click();await h.settle();
  assert.equal(h.saved.mediaProfiles.presets[0].values.brightness,2);
});
test('ACK overlay cannot create a preset from equally stale v1 and v2 snapshots',async t=>{
  const {h,dom,doc}=await ui(t,'?mediaSettings=1');const readGlobal=h.holdNext('callback:get-snapshot'),readMedia=h.holdNext('callback:get-media-snapshot');
  h.changes.emit({config:{newValue:{}}},'local');await Promise.all([readGlobal.reached,readMedia.reached]);
  edit(dom,'brightness',2);await new Promise(r=>setTimeout(r,60));
  assert.equal(doc.getElementById('settings-status').dataset.phase,'ready');assert.equal(doc.getElementById('media-status').dataset.phase,'ready');
  doc.getElementById('media-preset-domain').value='video';doc.getElementById('media-preset-domain').dispatchEvent(new dom.window.Event('change'));
  doc.getElementById('media-preset-name').value='Bright';assert.equal(doc.getElementById('brightness').value,'2');
  assert.equal(doc.getElementById('media-preset-create').disabled,true);doc.getElementById('media-preset-create').click();assert.equal(mutations(h).length,0);
  readGlobal.release();readMedia.release();await h.settle();doc.getElementById('media-preset-create').click();await h.settle();
  assert.equal(h.saved.mediaProfiles.presets[0].values.brightness,2);
});
for(const action of ['reset','channel-delete','preset-delete'])test('destructive '+action+' cancel dispatches nothing; confirm dispatches once',async t=>{
  const {h,dom,doc}=await channel(t);doc.getElementById('media-preset-name').value='Quiet';doc.getElementById('media-preset-create').click();await h.settle();
  const id=action==='reset'?'media-audio-global':action==='channel-delete'?'media-channel-delete':'media-preset-delete';
  const before=mutations(h).length;let prompts=0;dom.window.confirm=message=>{assert.ok(message.length>10);prompts++;return false;};
  doc.getElementById(id).click();await h.settle();assert.equal(mutations(h).length,before);assert.equal(prompts,1);
  dom.window.confirm=()=>{prompts++;return true;};doc.getElementById(id).click();await h.settle();assert.equal(mutations(h).length,before+1);assert.equal(prompts,2);
});
test('confirmation captures old record token rather than adopting a concurrent change',async t=>{
  const {h,dom,doc}=await channel(t);dom.window.confirm=()=>{h.saved.mediaProfiles.channels[0].revision++;h.saved.mediaProfiles.revision++;return true;};
  doc.getElementById('media-audio-global').click();await h.settle();assert.equal(doc.getElementById('media-status').dataset.phase,'conflict');
  assert.ok(h.saved.mediaProfiles.channels[0].audio);assert.equal(mutations(h).at(-1).message.expectedRecordRevision,1);
});
test('confirmation cannot apply a captured destructive intent after scope changes',async t=>{
  const {h,dom,doc}=await channel(t),before=mutations(h).length;dom.window.confirm=()=>{const scope=doc.getElementById('media-scope');
    scope.value='global';scope.dispatchEvent(new dom.window.Event('change'));return true;};doc.getElementById('media-audio-global').click();await h.settle();
  assert.equal(mutations(h).length,before);assert.ok(h.saved.mediaProfiles.channels[0].audio);
});
test('UI read-back keeps unknown patch and newer draft without writes',async t=>{
  const {h,dom,doc}=await channel(t),gate=h.holdNext('callback:patch-channel-fields');edit(dom,'compressorRatio',7);await gate.reached;
  edit(dom,'compressorRatio',5);gate.fail();await h.settle();const before=mutations(h).length,button=doc.getElementById('media-refresh');assert.ok(button);
  button.click();await h.settle();assert.equal(mutations(h).length,before);assert.equal(doc.getElementById('media-status').dataset.phase,'unknown');
  assert.equal(doc.getElementById('compressorRatio').value,'5');assert.equal(doc.getElementById('media-draft').hidden,false);
});
test('UI retains held fields after original preset creation is confirmed without flushing',async t=>{
  const {h,dom,doc}=await channel(t),gate=h.holdNext('callback:create-preset');doc.getElementById('media-preset-name').value='Quiet';
  doc.getElementById('media-preset-create').click();await gate.reached;edit(dom,'compressorRatio',5);gate.fail();await h.settle();
  const before=mutations(h).length;doc.getElementById('media-refresh').click();await h.settle();
  assert.equal(mutations(h).length,before);assert.equal(doc.getElementById('media-status').dataset.phase,'failed');
  assert.equal(doc.getElementById('media-draft').hidden,false);assert.match(doc.getElementById('media-draft').textContent,/compressorRatio.*5/);
  assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorRatio,12);
  assert.equal(h.saved.mediaProfiles.presets[0].values.compressorRatio,12);assert.equal(h.saved.mediaProfiles.presets[0].name,'Quiet');
});
test('preset deletion cannot adopt a same UUID recreated during confirmation',async t=>{
  const {h,dom,doc}=await channel(t);doc.getElementById('media-preset-name').value='Quiet';doc.getElementById('media-preset-create').click();await h.settle();
  const original=h.saved.mediaProfiles.presets[0].createdRevision;dom.window.confirm=()=>{h.saved.mediaProfiles.revision+=2;
    h.saved.mediaProfiles.presets[0].createdRevision=h.saved.mediaProfiles.revision;return true;};doc.getElementById('media-preset-delete').click();await h.settle();
  assert.equal(doc.getElementById('media-status').dataset.phase,'conflict');assert.equal(h.saved.mediaProfiles.presets.length,1);
  assert.equal(mutations(h).at(-1).message.presetToken.createdRevision,original);
});
test('channel confirmation cannot delete settings after original broadcast navigates',async t=>{
  const {h,dom,doc}=await channel(t);dom.window.confirm=()=>{h.tabs.get(7).url='https://chzzk.naver.com/live/'+B;return true;};
  doc.getElementById('media-channel-delete').click();await h.settle();assert.equal(h.saved.mediaProfiles.channels.length,1);
  assert.notEqual(doc.getElementById('media-status').dataset.phase,'ready');assert.equal(h.saved.mediaProfiles.channels[0].channelId,A);
});
test('channel preset copies confirmed scoped values but inherited domain waits for global read',async t=>{
  const {h,dom,doc}=await channel(t);edit(dom,'compressorRatio',5);await h.settle();doc.getElementById('media-preset-name').value='Channel';
  doc.getElementById('media-preset-create').click();await h.settle();assert.equal(h.saved.mediaProfiles.presets[0].values.compressorRatio,5);
  const gate=h.holdNext('callback:get-media-snapshot');h.changes.emit({config:{newValue:{}}},'local');await gate.reached;
  const other=h.client();await new Promise(r=>setTimeout(r,60));other.edit({type:'config',id:'brightness',value:2});await new Promise(r=>setTimeout(r,60));
  doc.getElementById('media-preset-domain').value='video';doc.getElementById('media-preset-domain').dispatchEvent(new dom.window.Event('change'));
  assert.equal(doc.getElementById('media-preset-create').disabled,true);const before=mutations(h).length;doc.getElementById('media-preset-create').click();
  assert.equal(mutations(h).length,before);gate.release();await h.settle();doc.getElementById('media-preset-create').click();await h.settle();
  assert.equal(h.saved.mediaProfiles.presets.length,2);assert.equal(h.saved.mediaProfiles.presets.find(preset=>preset.domain==='video').values.brightness,2);
});
