const test=require('node:test'),assert=require('node:assert/strict');
const {page,load,runtime,playerHTML}=require('./helpers.cjs');
const base={brightness:1,contrast:1,saturation:1,gamma:1,sharpness:0};
function setup(t,html=playerHTML){const dom=page(html);t.after(()=>{dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));dom.window.close();});
  for(const file of ['media-profiles.js','web/runtime.js','web/site-adapter.js','web/player.js'])load(dom,file);
  const api=runtime(dom);assert.ok(api.filters,'production filter controller must exist');return {dom,api,filters:api.filters,doc:dom.window.document};}
test('global renderer remains document-owned without a main player',t=>{
  const {filters,doc}=setup(t,'<video class="knife-preview-player"></video>');filters.reconcile({...base,brightness:1.5},null,null);
  assert.ok(doc.body.classList.contains('knife-filter'));assert.equal(doc.getElementById('knifeFilter').children.length,1);
  filters.reconcile(base,null,null);assert.equal(doc.body.classList.contains('knife-filter'),false);
});
test('channel filter targets only the main video while preview keeps document global filtering',t=>{
  const {filters,doc,api}=setup(t,playerHTML+'<video class="knife-preview-player"></video>'),target=doc.querySelector('.pzp-pc video');
  assert.equal(api.selectPlayer().filterTarget,target);filters.reconcile({...base,brightness:1.5},{...base,brightness:2},target);
  assert.equal(target.getAttribute('data-knife-channel-filter'),'owned');assert.equal(doc.querySelector('.knife-preview-player').hasAttribute('data-knife-channel-filter'),false);
  assert.equal(doc.getElementById('knifeFilter').querySelector('feFuncR').getAttribute('slope'),'1.5');
  assert.equal(doc.getElementById('knifeChannelFilter').querySelector('feFuncR').getAttribute('slope'),'2');
});
test('neutral channel overrides non-neutral global without changing a native inner video filter',t=>{
  const html=playerHTML.replace('<video></video>','<div class="webplayer-internal-source-wrapper"><video style="filter:brightness(0.5)"></video></div>');
  const {filters,doc,api}=setup(t,html),target=doc.querySelector('.webplayer-internal-source-wrapper'),video=doc.querySelector('video');
  assert.equal(api.selectPlayer().filterTarget,target);filters.reconcile({...base,brightness:2},base,target);
  assert.equal(target.getAttribute('data-knife-channel-filter'),'owned');assert.equal(target.style.getPropertyValue('--knife-channel-filter'),'none');
  assert.equal(video.style.filter,'brightness(0.5)');assert.equal(doc.getElementById('knifeChannelFilter').children.length,0);
});
test('base-neutral channel filter works and target replacement retires only the old own marker',t=>{
  const {filters,doc,api}=setup(t),video=doc.querySelector('video');filters.reconcile(base,{...base,brightness:2},video);
  assert.equal(doc.body.classList.contains('knife-filter'),false);const wrapper=doc.createElement('div');wrapper.className='webplayer-internal-source-wrapper';video.replaceWith(wrapper);wrapper.append(video);
  api.reconcile();assert.equal(api.selectPlayer().filterTarget,wrapper);filters.reconcile(base,{...base,brightness:2},wrapper);
  assert.equal(video.hasAttribute('data-knife-channel-filter'),false);assert.equal(wrapper.getAttribute('data-knife-channel-filter'),'owned');
});
test('foreign SVG marker and CSS slot changes are never replaced or removed',t=>{
  const {filters,doc}=setup(t),video=doc.querySelector('video');video.setAttribute('data-knife-channel-filter','foreign');
  filters.reconcile(base,{...base,brightness:2},video);assert.equal(video.getAttribute('data-knife-channel-filter'),'foreign');
  video.removeAttribute('data-knife-channel-filter');filters.reconcile(base,{...base,brightness:2},video);
  video.style.setProperty('--knife-channel-filter','brightness(0.5)');filters.reconcile(base,null,null);
  assert.equal(video.style.getPropertyValue('--knife-channel-filter'),'brightness(0.5)');
  const foreign=doc.createElementNS('http://www.w3.org/2000/svg','svg');foreign.id='knifeChannelFilter';doc.body.append(foreign);
  filters.reconcile(base,{...base,brightness:2},video);assert.equal(doc.getElementById('knifeChannelFilter'),foreign);
  filters.dispose();assert.equal(foreign.isConnected,true);
});
