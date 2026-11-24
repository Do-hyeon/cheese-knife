const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs');
const subject=()=>{assert.ok(fs.existsSync('scripts/extension-e2e/transition-failure.mjs'),'shared transition error boundary must exist');return import('../scripts/extension-e2e/transition-failure.mjs');};
function browser(){const page=new EventEmitter(),context=new EventEmitter();context.pages=()=>[page];return {page,context};}

test('error observer covers existing and new pages then removes only its own listeners',async()=>{
  const {observeTransitionErrors,hasNoTransitionErrors}=await subject(),{page,context}=browser(),other=new EventEmitter();
  let external=0;page.on('pageerror',()=>external++);
  const observer=observeTransitionErrors(context);page.emit('pageerror',Error('existing'));
  context.emit('page',other);other.emit('pageerror',Error('new'));
  const evidence=await observer.dispose();assert.deepEqual(evidence,{pageErrors:['existing','new'],routeErrors:[],errorsTruncated:false,errorsComplete:true});
  assert.equal(hasNoTransitionErrors(evidence),false);assert.equal(context.listenerCount('page'),0);assert.equal(page.listenerCount('pageerror'),1);assert.equal(other.listenerCount('pageerror'),0);
  page.emit('pageerror',Error('external'));assert.equal(external,2);assert.deepEqual(evidence.pageErrors,['existing','new']);
  assert.ok(Object.isFrozen(evidence));assert.ok(Object.isFrozen(evidence.pageErrors));
});
test('route boundary records synchronous and delayed asynchronous failures before final snapshot',async()=>{
  const {observeTransitionErrors}=await subject(),{context}=browser(),observer=observeTransitionErrors(context);
  await observer.guardRoute(()=>{throw TypeError('sync-route');})();
  let reject;const route=observer.guardRoute(()=>new Promise((_,fail)=>{reject=fail;}))();
  const final=observer.dispose();setImmediate(()=>reject(Error('late-route')));await route;
  assert.deepEqual(await final,{pageErrors:[],routeErrors:['sync-route','late-route'],errorsTruncated:false,errorsComplete:true});
});
test('unsettled route cannot become a complete empty error observation',async()=>{
  const {observeTransitionErrors,hasNoTransitionErrors}=await subject(),{context}=browser(),observer=observeTransitionErrors(context);
  void observer.guardRoute(()=>new Promise(()=>{}))();const before=Date.now(),evidence=await observer.dispose();
  assert.equal(evidence.errorsComplete,false);assert.ok(evidence.routeErrors.includes('transition-route-unconfirmed'));assert.equal(hasNoTransitionErrors(evidence),false);
  assert.ok(Date.now()-before<3000);
});
test('bounded observations expose overflow and missing fields never mean no errors',async()=>{
  const {observeTransitionErrors,hasNoTransitionErrors}=await subject(),{context,page}=browser(),observer=observeTransitionErrors(context);
  for(let i=0;i<33;i++)page.emit('pageerror',Error('x'.repeat(300)));
  const evidence=await observer.dispose();assert.equal(evidence.pageErrors.length,32);assert.ok(evidence.pageErrors.every(value=>value.length===240));assert.equal(evidence.errorsTruncated,true);
  const empty={pageErrors:[],routeErrors:[],errorsTruncated:false,errorsComplete:true};assert.equal(hasNoTransitionErrors(empty),true);
  for(const key of Object.keys(empty)){const missing={...empty};delete missing[key];assert.equal(hasNoTransitionErrors(missing),false,key);}
  assert.equal(hasNoTransitionErrors({...empty,routeErrors:['route']}),false);assert.equal(hasNoTransitionErrors(evidence),false);
});
test('coded exceptions retain bounded original diagnostics and do not acquire arbitrary error fields',async()=>{
  const {withTransitionDiagnostic}=await subject(),cause=Object.assign(Error('native cause'),{stderr:'s'.repeat(5000),secret:'must-not-copy'});
  const error=Object.assign(new TypeError('worker disconnected'),{code:'worker-failed',cause,secret:'must-not-copy',diagnostic:{actualLength:12,expectedLength:13,actualCRLF:0,expectedCRLF:1,matchesAfterEOLNormalization:true}});
  const failure=withTransitionDiagnostic(error,{code:'worker-failed',caseId:'valid-ui',phase:'new',cleanupErrors:[]});
  assert.equal(failure.diagnostic.name,'TypeError');assert.equal(failure.diagnostic.message,'worker disconnected');assert.equal(failure.diagnostic.native.cause.stderr.length,4096);
  assert.equal(failure.diagnostic.actualLength,12);assert.equal(JSON.stringify(failure).includes('must-not-copy'),false);
  assert.deepEqual(withTransitionDiagnostic(Object.assign(Error('wrapper'),{failure}),failure),failure);
  const long=withTransitionDiagnostic(Object.assign(Error('m'.repeat(500)),{name:'n'.repeat(100)}),{code:'bounded'});
  assert.equal(long.diagnostic.name.length,80);assert.equal(long.diagnostic.message.length,240);
});

for(const kind of ['general','media','f01'])test(`${kind} actual producer retains a coded TypeError rather than only its phase code`,async()=>{
  const {observeTransitionErrors}=await subject(),{context}=browser();context.route=async()=>{};context.routeWebSocket=async()=>{};
  const errorObserver=observeTransitionErrors(context),original=Object.assign(new TypeError('sentinel-worker-disconnected'),{code:'worker-lost'});
  const worker={evaluate:async()=>{throw original;}},scenario=await import('../scripts/extension-e2e/transition-scenario.mjs'),f01=await import('../scripts/extension-e2e/f01-transition.mjs');
  const args={context,worker,errorObserver,extensionId:'a'.repeat(32),responses:[],caseId:'valid-ui',phase:'new',runNonce:'a'.repeat(32),expectedProtocol:3,
    expectedBrokerSource:'var createSettingsBroker = function() {};',launchOccurrence:4};
  const run=kind==='general'?()=>scenario.runTransitionPhase(args):kind==='media'?()=>scenario.runInstalledMediaPreservationScenario(args):
    ()=>f01.runF01TransitionPhase({...args,caseId:'valid-v1',assignedCaseId:'loss-owned-gain',phase:'rollback',payload:'f00',occurrence:3});
  try{await assert.rejects(run(),error=>{assert.equal(error.failure.diagnostic?.name,'TypeError');assert.equal(error.failure.diagnostic?.message,'sentinel-worker-disconnected');return true;});}
  finally{await errorObserver.dispose();}
});

for(const kind of ['media','f01'])for(const fault of ['none','page','route'])test(`${kind} actual loss producer plus ${fault} error is admitted only without an independent fault`,async()=>{
  const {observeTransitionErrors}=await subject(),{page,context}=browser(),scenario=await import('../scripts/extension-e2e/transition-scenario.mjs'),f01=await import('../scripts/extension-e2e/f01-transition.mjs');
  const nonce='a'.repeat(32),extensionId='a'.repeat(32),presetId='22222222-2222-4222-8222-222222222222';
  const seed=JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f01-transition-seed.json','utf8')),
    expected=JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f01-transition-expected-media.json','utf8'));
  const wanted=kind==='f01'?f01.expectedF01TransitionRaw({caseId:'valid-v1',runNonce:nonce,seed,expected,occurrence:3,step:'startup',presetId}):
    {...scenario.transitionSeed('valid-ui',nonce),mediaProfiles:scenario.expectedInstalledMediaStore(nonce,presetId)};
  const damaged=structuredClone(wanted);if(kind==='f01')delete damaged.mediaProfiles.channels[0].audio.values.audioGain;
  else damaged.mediaProfiles=scenario.expectedInstalledMediaLoss(wanted.mediaProfiles);
  context.route=async(_pattern,handler)=>{if(fault==='route')await handler({request:()=>({url:()=> 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}),fulfill:async()=>{throw Error('sentinel-route');},abort:async()=>{throw Error('sentinel-route');}});};
  context.routeWebSocket=async()=>{};
  const errorObserver=observeTransitionErrors(context);let reads=0;
  const worker={evaluate:async()=>{if(reads++===0)return {extensionId,version:kind==='f01'?'2.13.5':'2.13.4',brokerMatches:true,...(kind==='media'?{brokerSource:'function() {}'}:{})};
    if(fault==='page')page.emit('pageerror',Error('sentinel-page'));return structuredClone(damaged);}};
  const args={context,worker,errorObserver,extensionId,responses:[],phase:kind==='f01'?'rollback':'new',runNonce:nonce,presetId,
    caseId:kind==='f01'?'valid-v1':'valid-ui',assignedCaseId:'loss-owned-gain',payload:'f00',occurrence:3,launchOccurrence:4,seed,expected,
    expectedBrokerSource:'var createSettingsBroker = function() {};',expectedBrokerFunction:'function() {}'};
  let failure;
  try{await (kind==='f01'?f01.runF01TransitionPhase(args):scenario.runInstalledMediaPreservationScenario(args));assert.fail('exact loss must throw');}
  catch(error){failure=error.failure;assert.ok(failure,'actual producer must return structured phase evidence');}
  Object.assign(failure,await errorObserver.dispose());
  if(fault==='route')assert.ok(failure.routeErrors.includes('sentinel-route'),'registered real route handler must execute before preservation throws');
  if(fault==='page')assert.ok(failure.pageErrors.includes('sentinel-page'));
  const admitted=kind==='f01'?f01.matchF01TransitionLoss(failure,wanted,'owned-gain',extensionId):scenario.matchesInstalledMediaLoss(failure,nonce,extensionId,presetId);
  assert.equal(admitted,fault==='none');
  if(fault==='none')for(const key of ['pageErrors','routeErrors','errorsTruncated','errorsComplete']){
    const missing=structuredClone(failure);delete missing[key];
    assert.equal(kind==='f01'?f01.matchF01TransitionLoss(missing,wanted,'owned-gain',extensionId):scenario.matchesInstalledMediaLoss(missing,nonce,extensionId,presetId),false,key);
  }
});

for(const fault of ['none','page','route'])test(`general actual loss producer plus ${fault} error cannot hide behind raw preservation`,async()=>{
  const {observeTransitionErrors}=await subject(),{context,page}=browser(),scenario=await import('../scripts/extension-e2e/transition-scenario.mjs'),runner=await import('../scripts/check-installed-transition.mjs');
  const nonce='a'.repeat(32),extensionId='a'.repeat(32),raw={styles:['future-style','hide-ranking','chat-font-size'],styleParameters:{future:9,'chat-font-size':8},settingsRevision:8,futureTop:{runNonce:nonce,untouched:true}};
  context.route=async(_pattern,handler)=>{if(fault==='route')await handler({request:()=>({url:()=> 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}),fulfill:async()=>{throw Error('sentinel-route');},abort:async()=>{throw Error('sentinel-route');}});};
  context.routeWebSocket=async()=>{};context.newPage=async()=>{const view=new EventEmitter();view.goto=async()=>{};view.locator=()=>({waitFor:async()=>{}});
    view.evaluate=async fn=>fn.name==='observeInstalledProtocol'?{config:{},load:1}:fn.toString().includes('window.__knifeFixture.loads')?1:fn.toString().includes('getComputedStyle')?{font:[],ranking:'block'}:{};
    context.emit('page',view);return view;};
  const observer=observeTransitionErrors(context),worker={evaluate:async fn=>{
    const text=fn.toString();if(text.includes('brokerSource'))return {extensionId,version:'2.13.4',brokerSource:'function() {}'};
    if(text.includes('chrome.tabs.query'))return {tabId:1,windowId:1};if(text.includes('getRegisteredContentScripts'))return [];
    if(fault==='page')page.emit('pageerror',Error('sentinel-page'));return structuredClone(raw);
  }};
  let failure;try{await scenario.runTransitionPhase({context,worker,errorObserver:observer,extensionId,responses:[],caseId:'valid-ui',phase:'new',expectedProtocol:3,runNonce:nonce,expectedBrokerSource:'var createSettingsBroker = function() {};'});assert.fail('loss must throw');}
  catch(error){failure=error.failure;assert.ok(failure);}
  Object.assign(failure,await observer.dispose());
  if(fault==='route')assert.ok(failure.routeErrors.includes('sentinel-route'));
  assert.equal(runner.matchesStorageLoss(failure,nonce,extensionId),fault==='none');
  if(fault==='none')for(const key of ['pageErrors','routeErrors','errorsTruncated','errorsComplete']){const missing=structuredClone(failure);delete missing[key];assert.equal(runner.matchesStorageLoss(missing,nonce,extensionId),false,key);}
});
