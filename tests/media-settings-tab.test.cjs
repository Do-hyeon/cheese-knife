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
