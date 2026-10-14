const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { settingsHarness, config } = require('./settings-fixture.cjs');
const {page,load,runtime,playerHTML}=require('./helpers.cjs');
const files = ['media-profiles.js', 'gain-authority.js', 'config.js', 'style-schema.js', 'settings-contract.js', 'settings-broker.js'];
const current = () => ({ generation: 'f01', sources: Object.fromEntries(files.map(file => [file, fs.readFileSync(file, 'utf8')])) });

test('tagged published four-file worker still writes through the unchanged v1 contract', async t => {
  const { readPublishedWorkerSources } = await import('../scripts/published-settings-baseline.mjs');
  const h = settingsHarness(t, {}, { generation: 'published', sources: readPublishedWorkerSources() });
  await h.initialize(); await h.settle();
  const reply = await h.patch('popup', [config('arrowSeek', false)]);
  assert.equal(reply.stored, true);
  assert.equal(h.saved.config.arrowSeek, false);
});

test('tagged F01 six-file worker loads media and authority before config and v1 writer', async t => {
  const h = settingsHarness(t, {}, current());
  await h.initialize(); await h.settle();
  assert.equal(typeof h.worker.window.KnifeMediaProfiles?.readStore, 'function');
  const reply = await h.patch('popup', [config('brightness', 1.225)]);
  assert.equal(reply.stored, true);
  assert.equal(h.saved.config.brightness, 1.225);
  assert.equal(Object.hasOwn(h.saved, 'mediaProfiles'), false);
});

test('missing dependency and incorrect generation cannot retire a healthy worker', async t => {
  const h = settingsHarness(t); await h.initialize(); await h.settle();
  const worker = h.worker, pack = current(), missing = { ...pack.sources }; delete missing['media-profiles.js'];
  for (const invalid of [{ generation: 'f00', sources: missing }, { generation: 'published', sources: pack.sources },
    { ...pack, sources: Object.create(pack.sources) }, { ...pack, extra: true }]) {
    assert.throws(() => h.restartBroker(invalid), /fixture-worker-sources/);
    assert.strictEqual(h.worker, worker);
  }
  assert.equal((await h.patch('popup', [config('arrowSeek', false)])).stored, true);
});
test('MAIN runtime owns its shared dependency when a repeated standalone filename is not injected again',t=>{
  const dom=page(playerHTML);t.after(()=>{dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));dom.window.close();});
  load(dom,'web/runtime.js');load(dom,'web/site-adapter.js');const api=runtime(dom);
  const values={compressorDefault:false,compressorThreshold:-50,compressorKnee:40,compressorRatio:12,compressorAttack:0,compressorRelease:0.25,
    brightness:1,contrast:1,saturation:1,gamma:1,sharpness:0,arrowSeek:false};
  dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window,origin:dom.window.location.origin,
    data:{namespace:'cheese-knife',protocol:2,type:'config',requestId:api.mediaRequestId,context:{...api.media.context},deliverySequence:1,
      baseConfig:values,effectiveConfig:values,i18n:{},version:{globalRevision:0,mediaRevision:0},profileState:'global',revisionStatus:'ready',
      mediaPhase:'ready',audioBindingGeneration:1,audioKind:'global',videoKind:'global'}}));
  assert.equal(api.configReady,true);assert.equal(api.config.arrowSeek,false);assert.equal(api.media.phase,'ready');
});
