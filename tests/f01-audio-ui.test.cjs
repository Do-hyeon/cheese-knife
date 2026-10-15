const test = require('node:test'), assert = require('node:assert/strict');
const { page, load } = require('./helpers.cjs');
function setup(t) {
  assert.ok(require('node:fs').existsSync('audio-settings-ui.js'),'approved audio interaction helper must be generated');
  const dom = page('<div id="audio"></div>'); t.after(() => dom.window.close());
  for (const file of ['media-profiles.js','audio-settings-ui.js']) load(dom, file);
  const edits = [], wanted = [], doc = dom.window.document;
  const ui = dom.window.createAudioSettingsUI(doc.getElementById('audio'), { edit: patch => edits.push(patch), wanted: value => wanted.push(value) });
  const values = Object.fromEntries(dom.window.KnifeMediaProfiles.audioFieldsV2.map(f => [f.id,f.defaultValue]));
  const state = { values, effectiveGain: 1.23456789, gainOrigin: 'global-owned', globalScope:true, editable: true, wanted: false, masterAvailable: true, masterStatus: 'off' };
  ui.render(state);
  const fire = (id, type, value) => { const input=doc.getElementById(id); if(value!==undefined) input.value=String(value);input.dispatchEvent(new dom.window.Event(type,{bubbles:true})); return input; };
  return { dom,doc,ui,state,edits,wanted,fire };
}
test('audio panel has one fixed-width Gain, separate source and independent master/default/effect controls', t => {
  const {doc,edits,wanted,fire} = setup(t);
  assert.equal(doc.querySelectorAll('#audioGain').length,1); assert.equal(doc.getElementById('audioGain-value').textContent,'123.46%');
  assert.equal(doc.getElementById('audioGain').value,'1.23456789'); assert.match(doc.getElementById('audioGain-source').textContent,/전역/);
  doc.getElementById('audio-master').click(); assert.deepEqual(wanted,[true]); assert.equal(edits.length,0);
  fire('audioGain','dblclick'); assert.deepEqual({...edits.at(-1)},{audioGain:1,gainInherited:false});
  assert.ok(doc.getElementById('audioDefault')); assert.ok(doc.getElementById('compressorEnabled'));
});
test('numeric drafts survive unrelated rendering; blank, nonfinite and outside range do not write', t => {
  const {doc,ui,state,edits,fire}=setup(t), input=doc.getElementById('compressorThreshold-number');input.focus();
  fire(input.id,'input','');ui.render({...state,values:{...state.values,eq63:2}});assert.equal(input.value,'');assert.equal(doc.activeElement,input);assert.equal(edits.length,0);
  fire(input.id,'input','-101');assert.equal(edits.length,0);assert.equal(input.getAttribute('aria-invalid'),'true');
  fire(input.id,'input','-37.123456');assert.equal(edits.at(-1).compressorThreshold,-37.123456);ui.render(state);assert.equal(input.value,'-37.123456');
  input.blur();assert.equal(input.value,'-37.12');
});
test('relative dial drag reaches endpoints from any start and reverses immediately', t => {
  const {dom,doc,edits}=setup(t), dial=doc.getElementById('compressorRatio');
  const pointer=(type,y)=>{const e=new dom.window.Event(type,{bubbles:true});Object.assign(e,{pointerId:1,button:0,clientY:y});dial.dispatchEvent(e);};
  pointer('pointerdown',900);pointer('pointermove',740);assert.equal(edits.at(-1).compressorRatio,20);
  pointer('pointermove',500);assert.equal(edits.at(-1).compressorRatio,20);
  pointer('pointermove',501);assert.ok(edits.at(-1).compressorRatio<20);pointer('pointerup',501);
  assert.equal(dial.getAttribute('role'),'slider');assert.equal(dial.getAttribute('aria-valuemax'),'20');
});
test('eight EQ faders and graphs preserve order, raw precision and section reset boundaries', t => {
  const {doc,ui,state,edits,fire}=setup(t);assert.equal(doc.querySelectorAll('.f01-eq-band').length,8);
  assert.deepEqual([...doc.querySelectorAll('[data-audio-graph]')].map(e=>e.dataset.audioGraph),['compressor','eq']);
  fire('eq63','input',1.23456789);assert.equal(edits.at(-1).eq63,1.23456789);assert.equal(doc.getElementById('eq63-value').value,'1.23');
  doc.getElementById('audio-comp-reset').click();assert.equal(Object.keys(edits.at(-1)).length,5);assert.equal('audioGain' in edits.at(-1),false);
  doc.getElementById('audio-eq-reset').click();assert.equal(Object.keys(edits.at(-1)).length,8);assert.equal('eqEnabled' in edits.at(-1),false);
  ui.render({...state,values:{...state.values,eqEnabled:true,eq1000:6}});const active=doc.querySelector('[data-audio-graph="eq"] path').getAttribute('d');
  ui.render(state);assert.notEqual(doc.querySelector('[data-audio-graph="eq"] path').getAttribute('d'),active);
  assert.match(doc.querySelector('[data-audio-graph="eq"]').textContent,/48 kHz.*Q=1/);
});
test('disabled storage does not prevent separately authorized master, and OFF still allows editing', t => {
  const {doc,ui,state,edits,fire}=setup(t);fire('eq63','input',2);assert.equal(edits.at(-1).eq63,2);
  ui.render({...state,editable:false});assert.equal(doc.getElementById('eq63').disabled,true);assert.equal(doc.getElementById('audio-master').disabled,false);
  ui.render({...state,masterAvailable:false});assert.equal(doc.getElementById('audio-master').disabled,true);
});
test('real stylesheet keeps reference graphs visible, Gain output fixed and eight-band EQ one row',t=>{
  const {dom,doc}=setup(t),style=doc.createElement('style');style.textContent=require('node:fs').readFileSync('popup.css','utf8');doc.head.append(style);
  const css=node=>dom.window.getComputedStyle(node);
  assert.equal(css(doc.getElementById('audioGain-value')).width,'80px');
  assert.equal(css(doc.querySelector('.f01-eq-shell')).minWidth,'580px');assert.equal(css(doc.querySelector('.f01-eq-scroll')).overflowX,'auto');
  assert.equal(css(doc.querySelector('.f01-graphs svg')).height,'auto');assert.equal(css(doc.querySelector('.f01-dial')).width,'72px');
});
test('incomplete numeric input blocks confirmed copies until corrected or explicitly reset, including focused double-click',t=>{
  const {doc,ui,state,fire,edits}=setup(t),input=doc.getElementById('compressorThreshold-number');input.focus();
  fire(input.id,'input','');assert.equal(ui.hasDraft(),true);ui.render(state);assert.equal(input.value,'');
  fire(input.id,'dblclick');assert.equal(input.value,'-50.00');assert.equal(ui.hasDraft(),false);assert.equal(edits.at(-1).compressorThreshold,-50);
  fire(input.id,'input','-101');assert.equal(ui.hasDraft(),true);doc.getElementById('audio-comp-reset').click();
  assert.equal(ui.hasDraft(),false);assert.equal(input.value,'-50.00');
});
test('EQ and normalizer support precise numeric entry and unobserved legacy Gain never claims 100 percent',t=>{
  const {doc,ui,state,edits,fire}=setup(t);assert.equal(doc.getElementById('eq63-value').type,'number');
  fire('eq63-value','input',1.23456789);assert.equal(edits.at(-1).eq63,1.23456789);
  assert.equal(doc.getElementById('normalizerTargetDbfs').type,'number');fire('normalizerTargetDbfs','input','');assert.equal(ui.hasDraft(),true);
  ui.render({...state,effectiveGain:null,gainOrigin:'site-legacy'});assert.equal(doc.getElementById('audioGain-value').textContent,'—');
});
