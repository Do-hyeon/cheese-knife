const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {page}=require('./helpers.cjs');

const subject=()=>import('../scripts/extension-e2e/installed-protocol.mjs');
const context={documentGeneration:1,routePath:'/live/'+ 'a'.repeat(32),channelId:'a'.repeat(32),playerGeneration:2};
function fixture(t,protocol){
  const dom=page();t.after(()=>dom.window.close());dom.window.eval(fs.readFileSync('tests/fixtures/installed-extension/site.js','utf8'));
  const runtime={configReady:true,config:{arrowSeek:false},requestId:'v1-current',mediaRequestId:'scoped-current',
    ...(protocol===1?{}:{ownerProtocol:protocol,media:{phase:'ready',context:{...context}}})};
  dom.window[dom.window.Symbol.for('cheese-knife.runtime.v1')]=runtime;
  const data={namespace:'cheese-knife',protocol,type:'config',requestId:protocol===1?runtime.requestId:runtime.mediaRequestId,
    revision:2,deliverySequence:3,context:{...context},version:{globalRevision:2,mediaRevision:0},audioBindingGeneration:1,
    mediaPhase:'ready',audioKind:'global',videoKind:'global',profileState:'global',revisionStatus:'ready',
    gainOrigin:'site-legacy',effectiveConfig:{gainInherited:true}};
  const send=value=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window,origin:dom.window.location.origin,data:value}));
  send(data);return {dom,runtime,data,send};
}
for(const protocol of [1,2,3])test(`protocol ${protocol} observes only current document/request/context`,async t=>{
  const {observeInstalledProtocol}=await subject(),{dom,runtime,data,send}=fixture(t,protocol);
  const observe=dom.window.eval('('+observeInstalledProtocol.toString()+')');
  assert.deepEqual(JSON.parse(JSON.stringify(observe(protocol).config)),{arrowSeek:false});
  assert.equal(observe(protocol).load,1);
  send({...data,requestId:'old-request'});assert.equal(observe(protocol),null);send(data);
  const slot=dom.window.__knifeFixture['lastConfigEnvelopeV'+protocol];slot.load=0;assert.equal(observe(protocol),null);slot.load=1;
  runtime.configReady=false;assert.equal(observe(protocol),null);runtime.configReady=true;
  if(protocol!==1){
    runtime.ownerProtocol=protocol===3?2:3;assert.equal(observe(protocol),null);runtime.ownerProtocol=protocol;
    for(const key of Object.keys(context)){
      const original=runtime.media.context[key];runtime.media.context[key]=key==='channelId'?'b'.repeat(32):key==='routePath'?'/video/12':9;
      assert.equal(observe(protocol),null,key);runtime.media.context[key]=original;
    }
    runtime.media.phase='pending';assert.equal(observe(protocol),null);
  }
});
test('unknown observation and host protocol inputs cannot touch browser state',async()=>{
  const {observeInstalledProtocol}=await subject();
  for(const value of [undefined,null,0,4,'3'])assert.throws(()=>observeInstalledProtocol(value),{code:'installed-protocol-invalid'});
  const {runBaseInstalledScenario}=await import('../scripts/check-installed-extension.mjs');
  const {runTransitionPhase}=await import('../scripts/extension-e2e/transition-scenario.mjs');
  const hostile=new Proxy({},{get(){throw new Error('browser-touched');}});
  for(const expectedProtocol of [null,0,4,'3']){
    await assert.rejects(runBaseInstalledScenario({context:hostile,expectedProtocol}),{code:'installed-protocol-invalid'});
  }
  for(const expectedProtocol of [undefined,null,4])await assert.rejects(runTransitionPhase({context:hostile,worker:hostile,expectedProtocol}),{code:'installed-protocol-invalid'});
});

for(const mode of ['accepted','stale','context'])test(`current V3 ${mode} control uses the real runtime decoder in a disposable document`,async t=>{
  const {sendInstalledEnvelopeControl}=await subject();
  const {load,runtime,deliverScoped,flush,playerHTML}=require('./helpers.cjs');
  const dom=page(playerHTML);t.after(()=>{dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));dom.window.close();});
  load(dom,'media-profiles.js');load(dom,'web/runtime.js');load(dom,'web/site-adapter.js');await flush();
  dom.window.eval(fs.readFileSync('tests/fixtures/installed-extension/site.js','utf8'));
  deliverScoped(dom,{arrowSeek:false},1);await flush();
  const api=runtime(dom),metadata=JSON.parse(JSON.stringify(dom.window.__knifeFixture.lastConfigEnvelopeV3));
  assert.equal(api.config.arrowSeek,false);assert.ok(metadata);
  // jsdom postMessage omits same-window source/origin; simulate only that native boundary.
  dom.window.postMessage=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window,origin:dom.window.location.origin,data}));
  const send=dom.window.eval('('+sendInstalledEnvelopeControl.toString()+')');
  send({metadata,protocol:3,mode});await flush();
  assert.equal(api.config.arrowSeek,mode==='accepted');
  assert.equal(metadata.deliverySequence,1,'canonical observation is not overwritten by injection');
});

for(const malformed of ['gain-origin','extra-key','missing-key'])test(`V3 ${malformed} does not count as a valid injected control`,async t=>{
  const {sendInstalledEnvelopeControl}=await subject(),{load,runtime,deliverScoped,flush,playerHTML}=require('./helpers.cjs');
  const dom=page(playerHTML);t.after(()=>{dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));dom.window.close();});
  load(dom,'media-profiles.js');load(dom,'web/runtime.js');load(dom,'web/site-adapter.js');await flush();
  dom.window.eval(fs.readFileSync('tests/fixtures/installed-extension/site.js','utf8'));deliverScoped(dom,{arrowSeek:false},1);await flush();
  const metadata=JSON.parse(JSON.stringify(dom.window.__knifeFixture.lastConfigEnvelopeV3));
  dom.window.postMessage=data=>{
    if(malformed==='gain-origin')data.gainOrigin='wrong';else if(malformed==='extra-key')data.extra=true;else delete data.effectiveConfig;
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window,origin:dom.window.location.origin,data}));
  };
  dom.window.eval('('+sendInstalledEnvelopeControl.toString()+')')({metadata,protocol:3,mode:'accepted'});await flush();
  assert.equal(runtime(dom).config.arrowSeek,false);
});
