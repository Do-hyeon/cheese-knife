const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),vm=require('node:vm');
const E='abcdefghijklmnopabcdefghijklmnop',A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',popupURL=`chrome-extension://${E}/popup.html`;
function fixture(mode='ok'){
  const fixtureURL=mode==='vod'?'https://chzzk.naver.com/video/12345':`https://chzzk.naver.com/live/${A}`;
  const mediaURL=popupURL+`?mediaSettings=1&targetTabId=7&targetWindowId=9${mode==='vod'?'':`&targetChannelId=${A}`}`;
  const events=[],listeners=new Set(),bus=new EventEmitter(),pages=[];
  const actualContexts=[{contextType:'POPUP',documentId:'popup-doc',documentUrl:popupURL,documentOrigin:`chrome-extension://${E}`,frameId:0,incognito:false},
    {contextType:'TAB',documentId:'tab-doc',documentUrl:mediaURL,documentOrigin:`chrome-extension://${E}`,frameId:0,tabId:8,windowId:9,incognito:false}];
  if(mode==='wrong-tab')actualContexts[1].tabId=99;
  if(mode==='wrong-context-url')actualContexts[1].documentUrl=popupURL;
  if(mode==='incognito')actualContexts[1].incognito=true;
  if(mode==='frame')actualContexts[1].frameId=1;
  const sender=(protocol,url,doc)=>{for(const listener of listeners)listener({namespace:'cheese-knife-settings',protocol,
    action:protocol===1?'get-snapshot':'get-media-snapshot'}, {id:E,url,frameId:doc?0:undefined,documentId:mode==='missing-document'?undefined:doc});};
  const chrome={runtime:{id:E,getURL:file=>`chrome-extension://${E}/${file}`,onMessage:{addListener:fn=>{events.push('observer');listeners.add(fn);},removeListener:fn=>{listeners.delete(fn);}},
    getContexts:async filter=>actualContexts.filter(value=>(!filter.documentIds||filter.documentIds.includes(value.documentId))&&
      (!filter.documentUrls||filter.documentUrls.includes(value.documentUrl))&&(!filter.contextTypes||filter.contextTypes.includes(value.contextType))&&
      (!filter.tabIds||filter.tabIds.includes(value.tabId)))},
    tabs:{query:async()=>[{id:7,windowId:9,url:fixtureURL,incognito:false}],getCurrent:async()=>({id:8,windowId:9,incognito:false})},
    action:{openPopup:async options=>{assert.equal(JSON.stringify(options),'{"windowId":9}');events.push('popup');for(let i=0;i<(mode==='overflow'?17:1);i++)sender(1,popupURL);}}};
  const workerGlobal=vm.createContext({chrome,console});
  const worker={evaluate:async(fn,arg)=>vm.runInContext(`(${fn.toString()})(${JSON.stringify(arg)})`,workerGlobal),url:()=>`chrome-extension://${E}/background.js`};
  const settingsPage={url:()=>mediaURL,isClosed:()=>false,context:()=>context,evaluate:async fn=>fn.toString().includes('getCurrent')?{id:8,windowId:9,incognito:false}:true,
    waitForFunction:async()=>{},locator:()=>({waitFor:async()=>{},isEnabled:async()=>true})};
  const fixturePage={url:()=>fixtureURL,context:()=>context,bringToFront:async()=>{events.push('front');}};
  pages.push(fixturePage);
  const context=new EventEmitter();context.pages=()=>pages;context.newCDPSession=async()=>({send:async()=>({targetInfo:{browserContextId:'owned'}}),detach:async()=>{events.push('page-detach');}});
  bus.send=async(method,params)=>{
    if(method==='Target.getTargets')return {targetInfos:[{targetId:'popup',type:'other',url:popupURL,browserContextId:'owned'}]};
    if(method==='Target.attachToTarget')return {sessionId:'popup-session'};
    if(method==='Target.detachFromTarget'){events.push('detach');if(mode==='cleanup-error')throw Error('detach-failed');return {};}
    assert.equal(method,'Target.sendMessageToTarget');const input=JSON.parse(params.message);let value={};
    if(input.method==='Runtime.evaluate')value={result:{value:{ready:true,visible:mode!=='hidden',focused:mode!=='unfocused',enabled:mode!=='disabled',label:mode==='unlabelled'?'':'설정 열기',x:10,y:10}}};
    if(input.method==='Input.dispatchMouseEvent'&&input.params.type==='mouseReleased'){
      events.push('click');sender(1,mediaURL,'tab-doc');sender(2,mediaURL,'tab-doc');if(mode==='no-page')return;
      pages.push(settingsPage);context.emit('page',settingsPage);
      if(mode==='duplicate'){const other={...settingsPage};pages.push(other);context.emit('page',other);}
    }
    queueMicrotask(()=>bus.emit('Target.receivedMessageFromTarget',{sessionId:'popup-session',message:JSON.stringify({id:input.id,result:value})}));return {};
  };
  return {args:{context,worker,fixturePage,extensionId:E,browserSession:bus,timeoutMs:1000},events,listeners,bus,context,settingsPage};
}
test('media settings helper binds early production sender to the new actual TAB and borrows its session',async()=>{
  const {openInstalledMediaSettings}=await import('../scripts/extension-e2e/popup-cdp.mjs');assert.equal(typeof openInstalledMediaSettings,'function');
  const f=fixture(),result=await openInstalledMediaSettings(f.args);assert.equal(result.settingsPage,f.settingsPage);
  assert.equal(result.popupAttached,true);assert.equal(result.tabWriterQualified,true);assert.ok(f.events.indexOf('observer')<f.events.indexOf('popup'));
  assert.equal(f.listeners.size,0);assert.equal(f.context.listenerCount('page'),0);assert.equal(f.bus.listenerCount('Target.receivedMessageFromTarget'),0);
  assert.equal(f.events.includes('browser-close'),false);
});
for(const mode of ['missing-document','hidden','disabled','unlabelled','unfocused','duplicate','wrong-tab','wrong-context-url','incognito','frame','overflow','cleanup-error','no-page'])test('media helper refuses '+mode+' and clears only owned listeners',async()=>{
  const {openInstalledMediaSettings}=await import('../scripts/extension-e2e/popup-cdp.mjs');assert.equal(typeof openInstalledMediaSettings,'function');
  const f=fixture(mode);await assert.rejects(openInstalledMediaSettings(f.args));assert.equal(f.listeners.size,0);
  assert.equal(f.context.listenerCount('page'),0);assert.equal(f.bus.listenerCount('Target.receivedMessageFromTarget'),0);
});
test('media helper rejects invalid total deadlines before touching Chrome',async()=>{
  const {openInstalledMediaSettings}=await import('../scripts/extension-e2e/popup-cdp.mjs');assert.equal(typeof openInstalledMediaSettings,'function');
  for(const timeoutMs of [0,-1,1.5,15001,Infinity,'15000']){const f=fixture();await assert.rejects(openInstalledMediaSettings({...f.args,timeoutMs}),{code:'media-tab-timeout-invalid'});assert.equal(f.events.length,0);}
});
test('media helper qualifies VOD style pair without inventing a channel target',async()=>{
  const {openInstalledMediaSettings}=await import('../scripts/extension-e2e/popup-cdp.mjs'),f=fixture('vod');
  const result=await openInstalledMediaSettings(f.args);assert.equal(new URL(result.settingsPage.url()).searchParams.has('targetChannelId'),false);
  assert.equal(result.tabWriterQualified,true);
});
