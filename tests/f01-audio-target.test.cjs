const test=require('node:test'),assert=require('node:assert/strict');
const {settingsHarness}=require('./settings-fixture.cjs');
const {page}=require('./helpers.cjs');
const url='https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const context={documentGeneration:1,routePath:'/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',channelId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',playerGeneration:2};
async function fixture(t){
  const h=settingsHarness(t),dom=page('',url);t.after(()=>dom.window.close());let wanted=true,documentId='native-doc',sets=0;
  const runtime={ownerProtocol:3,requestId:'runtime-1',mediaRequestId:'scope-1',media:{context},
    player:{getAudioWanted:()=>({ok:true,wanted,state:wanted?'on':'off',context}),setAudioWanted:async value=>{wanted=value;sets++;return {ok:true,wanted,state:wanted?'on':'off',context};}}};
  dom.window[dom.window.Symbol.for('cheese-knife.runtime.v1')]=runtime;
  h.worker.window.chrome.scripting.executeScript=async options=>{
    assert.equal(options.world,'MAIN');assert.equal(options.target.tabId,7);
    if(options.target.documentIds && options.target.documentIds[0]!==documentId)return [];
    const result=await dom.window.eval(`(${options.func.toString()})(...${JSON.stringify(options.args||[])})`);
    return [{frameId:0,documentId,result}];
  };
  let sequence=0;const send=body=>h.send('popup',{namespace:'cheese-knife-settings',protocol:3,requestId:`audio-${++sequence}`,...body});
  const target={tabId:7,windowId:9,routePath:context.routePath};await h.initialize();await h.settle();return {h,send,target,runtime,sets:()=>sets,replace:()=>{documentId='replacement';}};
}
test('own TAB master uses one existing player intent and writes no settings/default/Gain',async t=>{
  const {h,send,target,sets}=await fixture(t),read=await send({action:'get-audio-state',target});
  assert.equal(read.ok,true,read.code);assert.equal(read.stored,false);assert.equal(read.audioState.wanted,true);
  const reply=await send({action:'set-audio-wanted',target,binding:read.audioState,wanted:false});
  assert.equal(reply.ok,true,reply.code);assert.equal(reply.audioState.wanted,false);assert.equal(sets(),1);
  assert.equal(h.calls.filter(call=>call.kind==='commit').length,0);assert.deepEqual(h.saved,{});
});
test('same URL replacement, runtime ABA, moved window, unknown fields never retarget master',async t=>{
  for(const kind of ['document','runtime','window','field']){
    const {h,send,target,runtime,replace,sets}=await fixture(t),read=await send({action:'get-audio-state',target});assert.equal(read.ok,true,read.code);
    if(kind==='document')replace();if(kind==='runtime')runtime.mediaRequestId='scope-2';if(kind==='window')h.tabs.get(7).windowId=10;
    const reply=await send({action:'set-audio-wanted',target,binding:read.audioState,wanted:false,...kind==='field'?{script:'arbitrary'}:{}});
    assert.equal(reply.ok,false,kind);assert.equal(sets(),0,kind);assert.equal(h.calls.filter(call=>call.kind==='commit').length,0);
  }
});
test('master relay validates original route and rejects non TAB sender and missing owner',async t=>{
  const {h,send,target,runtime}=await fixture(t);runtime.ownerProtocol=2;
  assert.equal((await send({action:'get-audio-state',target})).ok,false);
  assert.equal((await h.send('popup',{namespace:'cheese-knife-settings',protocol:3,requestId:'toolbar',action:'get-audio-state',target},{id:h.worker.window.chrome.runtime.id,url:h.worker.window.chrome.runtime.getURL('popup.html')})).ok,false);
  h.tabs.get(7).url='https://example.com/';assert.equal((await send({action:'get-audio-state',target})).ok,false);
});
test('route changed before first read and settings document retired before mutation cannot toggle a substitute',async t=>{
  const first=await fixture(t);first.target.routePath='/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  assert.equal((await first.send({action:'get-audio-state',target:first.target})).ok,false);assert.equal(first.sets(),0);
  const second=await fixture(t),read=await second.send({action:'get-audio-state',target:second.target});assert.equal(read.ok,true,read.code);
  const api=second.h.worker.window.chrome,execute=api.scripting.executeScript;let probes=0;
  api.scripting.executeScript=async options=>{const reply=await execute(options);if(++probes===1)second.h.contexts.clear();return reply;};
  const reply=await second.send({action:'set-audio-wanted',target:second.target,binding:read.audioState,wanted:false});
  assert.equal(reply.ok,false);assert.equal(second.sets(),0);assert.equal(second.h.calls.filter(c=>c.kind==='commit').length,0);
});
test('TAB OFF updates the real private manual intent across settings binding and same-video remount',async t=>{
  const {setup}=require('./audio-fixture.cjs'),{load,runtime,deliverScoped,flush}=require('./helpers.cjs');
  const config={audioDefault:true,compressorDefault:true,compressorEnabled:true,audioGain:1,gainInherited:false};
  const actual=setup(t,false,false,config);load(actual.dom,'web/player.js');const api=runtime(actual.dom);api.reconcile();await flush();
  const h=settingsHarness(t);h.worker.window.chrome.scripting.executeScript=async options=>{
    assert.equal(options.world,'MAIN');const result=await actual.dom.window.eval(`(${options.func.toString()})(...${JSON.stringify(options.args||[])})`);
    return [{frameId:0,documentId:'real-runtime-document',result}];
  };
  const target={tabId:7,windowId:9,routePath:context.routePath};let sequence=0;
  const send=body=>h.send('popup',{namespace:'cheese-knife-settings',protocol:3,requestId:`real-${++sequence}`,...body});
  let read=await send({action:'get-audio-state',target});assert.equal(read.ok,true,read.code);assert.equal(read.audioState.wanted,true);
  const off=await send({action:'set-audio-wanted',target,binding:read.audioState,wanted:false});assert.equal(off.ok,true,off.code);
  assert.equal(actual.audio.getState(actual.video),'off');
  deliverScoped(actual.dom,{...config,audioGain:.5,eqEnabled:true,eq63:2},2);await flush();
  const old=actual.dom.window.document.querySelector('.pzp-pc'),next=old.cloneNode(true);next.querySelector('video').replaceWith(actual.video);old.replaceWith(next);api.reconcile();await flush();
  read=await send({action:'get-audio-state',target});assert.equal(read.ok,true,read.code);assert.equal(read.audioState.wanted,false);
  assert.equal(actual.audio.getState(actual.video),'off');assert.equal(h.calls.filter(c=>c.kind==='commit').length,0);
  const replacement=actual.dom.window.document.createElement('video');Object.defineProperty(replacement,'currentSrc',{value:'blob:https://chzzk.naver.com/new-video'});
  actual.video.replaceWith(replacement);api.reconcile();await flush();deliverScoped(actual.dom,config,3);await flush();
  assert.equal(api.player.getAudioWanted({...api.media.context}).wanted,true,'genuine new video renews the default');
});
