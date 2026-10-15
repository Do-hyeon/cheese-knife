/// <reference types="chrome" />
/** @param {string} code */
const fail=code=>Object.assign(new Error(code),{code});
/** @typedef {{targetId:string,type:string,url:string,browserContextId:string}} PopupTarget */
/** @typedef {Pick<import('playwright').CDPSession,'send'|'on'|'off'>} PopupBrowserSession */
/** @param {unknown} value @returns {Record<string,unknown>|null} */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?/** @type {Record<string,unknown>} */(value):null;
/** @param {unknown} targets @param {string} url @param {string} browserContextId @returns {PopupTarget} */
export function selectPopupTarget(targets,url,browserContextId){
  if(!Array.isArray(targets)||targets.length>128||!/^chrome-extension:\/\/[a-p]{32}\/popup\.html$/.test(url)||!browserContextId)throw fail('popup-target-unavailable');
  const matches=targets.map(record).filter(value=>value?.url===url&&value.browserContextId===browserContextId&&
    (value.type==='other'||value.type==='page')&&typeof value.targetId==='string'&&value.targetId.length>0);
  if(matches.length!==1)throw fail('popup-target-unavailable');
  return /** @type {PopupTarget} */(matches[0]);
}
/** @template T @param {()=>Promise<T>} work @param {number} milliseconds @param {string} code */
async function bounded(work,milliseconds,code){
  /** @type {ReturnType<typeof setTimeout>|undefined} */let timer;
  try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail(code)),milliseconds);})]);}
  finally{clearTimeout(timer);}
}
/** @param {PopupBrowserSession} browser @param {PopupTarget} target @param {number} timeoutMs @param {(method:string,params:unknown)=>void} onEvent */
export async function attachPopupCDP(browser,target,timeoutMs=8000,onEvent=()=>{}){
  if(!target.targetId||!target.browserContextId||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>8000)throw fail('popup-target-unavailable');
  const attached=record(await bounded(()=>browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:false}),timeoutMs,'popup-attach-timeout'));
  if(typeof attached?.sessionId!=='string'||!attached.sessionId)throw fail('popup-attach-failed');
  const sessionId=attached.sessionId;
  /** @type {Map<number,{resolve:(value:unknown)=>void,reject:(error:Error)=>void,timer:ReturnType<typeof setTimeout>}>} */const pending=new Map();
  let nextId=0,closed=false;
  function retire(){
    if(closed)return;closed=true;
    for(const job of pending.values()){clearTimeout(job.timer);job.reject(fail('popup-target-closed'));}pending.clear();
    browser.off('Target.receivedMessageFromTarget',received);browser.off('Target.detachedFromTarget',detached);browser.off('Target.targetDestroyed',destroyed);
  }
  /** @param {unknown} raw */function received(raw){
    const data=record(raw);if(closed||data?.sessionId!==sessionId||typeof data.message!=='string')return;
    /** @type {Record<string,unknown>|null} */let message;
    try{message=record(JSON.parse(data.message));}catch{return;}
    if(!message)return;
    if(typeof message.id==='number'){
      const job=pending.get(message.id);if(!job)return;pending.delete(message.id);clearTimeout(job.timer);
      if(message.error)job.reject(fail('popup-command-failed'));else if(Object.hasOwn(message,'result'))job.resolve(message.result);
      else job.reject(fail('popup-command-failed'));
    }else if(typeof message.method==='string')onEvent(message.method,message.params);
  }
  /** @param {unknown} data */function detached(data){if(record(data)?.sessionId===sessionId)retire();}
  /** @param {unknown} data */function destroyed(data){if(record(data)?.targetId===target.targetId)retire();}
  browser.on('Target.receivedMessageFromTarget',received);browser.on('Target.detachedFromTarget',detached);browser.on('Target.targetDestroyed',destroyed);
  return {
    /** @param {string} method @param {Record<string,unknown>} params @returns {Promise<unknown>} */
    command(method,params={}){
      if(closed)return Promise.reject(fail('popup-target-closed'));
      if(!/^[A-Za-z]+\.[A-Za-z]+$/.test(method))return Promise.reject(fail('popup-command-invalid'));
      const id=++nextId;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);reject(fail('popup-command-timeout'));},timeoutMs);
        pending.set(id,{resolve,reject,timer});
        void browser.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(()=>{
          const job=pending.get(id);if(job){pending.delete(id);clearTimeout(job.timer);job.reject(fail('popup-command-failed'));}
        });
      });
    },
    async detach(){if(closed)return;retire();await bounded(async()=>{
      try{await browser.send('Target.detachFromTarget',{sessionId});}
      catch(error){
        const message=record(error)?.message;
        if(typeof message!=='string'||!message.includes('No session with given id'))throw error;
        const targets=record(await browser.send('Target.getTargets'))?.targetInfos;
        if(!Array.isArray(targets)||targets.length>128)throw error;
        const rows=targets.map(record);
        if(rows.some(row=>!row||typeof row.targetId!=='string'||row.targetId===target.targetId))throw error;
      }
    },timeoutMs,'popup-detach-timeout');},
  };
}

/** @typedef {{protocol:number,action:string,ownId:boolean,url:string|null,frame:number|null,documentId:string|null}} MediaSenderObservation */
/** @typedef {{listener:(message:unknown,sender:chrome.runtime.MessageSender)=>void,observations:MediaSenderObservation[],overflow:boolean}} MediaObserver */
/**
 * @param {{context:import('playwright').BrowserContext,worker:import('playwright').Worker,fixturePage:import('playwright').Page,
 * extensionId:string,browserSession:PopupBrowserSession,timeoutMs?:number,mediaProtocol?:2|3}} options
 * @returns {Promise<{settingsPage:import('playwright').Page,popupAttached:true,tabWriterQualified:true}>}
 */
export async function openInstalledMediaSettings({context,worker,fixturePage,extensionId,browserSession,timeoutMs=15000,mediaProtocol=2}){
  if(mediaProtocol!==2&&mediaProtocol!==3)throw fail('media-tab-protocol-invalid');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw fail('media-tab-timeout-invalid');
  if(!/^[a-p]{32}$/.test(extensionId)||fixturePage.context()!==context)throw fail('media-tab-context-invalid');
  const deadline=Date.now()+timeoutMs;
  const remaining=()=>{const ms=Math.min(8000,deadline-Date.now());if(ms<1)throw fail('media-tab-timeout');return ms;};
  /** @template T @param {()=>Promise<T>} work */const run=work=>bounded(work,remaining(),'media-tab-timeout');
  /** @template T @param {()=>Promise<T|null>} read @returns {Promise<T>} */async function wait(read){
    for(;;){const value=await run(read);if(value!==null)return value;await run(()=>new Promise(resolve=>setTimeout(resolve,25)));}
  }
  const popupURL=`chrome-extension://${extensionId}/popup.html`,existing=new Set(context.pages());
  /** @type {import('playwright').Page[]} */const discovered=[];
  let pageOverflow=false,observerInstalled=false,networkFailure=false;
  /** @param {import('playwright').Page} page */const onPage=page=>{if(discovered.length>=16)pageOverflow=true;else discovered.push(page);};
  /** @type {import('playwright').CDPSession|undefined} */let pageSession;
  /** @type {Awaited<ReturnType<typeof attachPopupCDP>>|undefined} */let popup;
  /** @type {PopupTarget|undefined} */let openedPopup;
  try{
    await run(()=>worker.evaluate(protocol=>{
      const state=/** @type {typeof globalThis & {__knifeMediaTabObserver?:MediaObserver}} */(globalThis);
      if(state.__knifeMediaTabObserver)throw new Error('media-tab-observer-exists');
      /** @type {MediaSenderObservation[]} */const observations=[];
      /** @type {MediaObserver} */const observer={observations,overflow:false,listener:(message,sender)=>{
        if(!message||typeof message!=='object')return;
        const request=/** @type {{namespace?:unknown,protocol?:unknown,action?:unknown}} */(message);
        if(request.namespace!=='cheese-knife-settings'||typeof request.protocol!=='number'||(request.protocol!==1&&request.protocol!==protocol)||
          (request.action!=='get-snapshot'&&request.action!=='get-media-snapshot'))return;
        if(observations.length>=16){observer.overflow=true;return;}
        observations.push({protocol:request.protocol,action:request.action,ownId:sender.id===chrome.runtime.id,
          url:sender.url??null,frame:sender.frameId??null,documentId:sender.documentId??null});
      }};
      state.__knifeMediaTabObserver=observer;chrome.runtime.onMessage.addListener(observer.listener);
    },mediaProtocol));observerInstalled=true;
    await run(()=>fixturePage.bringToFront());
    const tabs=await run(()=>worker.evaluate(()=>chrome.tabs.query({active:true,currentWindow:true})));
    const tab=tabs[0];
    if(tabs.length!==1||!tab||typeof tab.id!=='number'||!Number.isSafeInteger(tab.id)||tab.id<0||!Number.isSafeInteger(tab.windowId)||tab.windowId<0||
      tab.incognito!==false||tab.url!==fixturePage.url())throw fail('media-tab-target-invalid');
    const channel=/^https:\/\/chzzk\.naver\.com\/(?:live\/)?([a-f0-9]{32})\/?$/.exec(tab.url)?.[1];
    if(!channel&&!/^https:\/\/chzzk\.naver\.com\/video\/[0-9]+\/?$/.test(tab.url))throw fail('media-tab-target-invalid');
    const expected=new URL(popupURL);expected.searchParams.set('mediaSettings','1');expected.searchParams.set('targetTabId',String(tab.id));
    expected.searchParams.set('targetWindowId',String(tab.windowId));if(channel)expected.searchParams.set('targetChannelId',channel);
    const ownPageSession=await run(()=>context.newCDPSession(fixturePage));pageSession=ownPageSession;
    const info=record(await run(()=>ownPageSession.send('Target.getTargetInfo'))),targetInfo=record(info?.targetInfo);
    if(typeof targetInfo?.browserContextId!=='string'||!targetInfo.browserContextId)throw fail('media-tab-context-invalid');
    const browserContextId=targetInfo.browserContextId;
    context.on('page',onPage);
    await run(()=>worker.evaluate(windowId=>chrome.action.openPopup({windowId}),tab.windowId));
    const target=await wait(async()=>{
      const targets=record(await run(()=>browserSession.send('Target.getTargets')));
      try{return selectPopupTarget(targets?.targetInfos,popupURL,browserContextId);}catch(error){if(record(error)?.code==='popup-target-unavailable')return null;throw error;}
    });
    openedPopup=target;
    const ownPopup=await run(()=>attachPopupCDP(browserSession,target,remaining(),(method,params)=>{
      if(method!=='Fetch.requestPaused')return;
      const requestId=record(params)?.requestId;
      if(typeof requestId!=='string'||!popup){networkFailure=true;return;}
      void popup.command('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'}).catch(()=>{networkFailure=true;});
    }));popup=ownPopup;
    await run(()=>ownPopup.command('Network.enable'));
    await run(()=>ownPopup.command('Fetch.enable',{patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'}]}));
    /** @param {string} expression */async function evaluate(expression){
      const response=record(await run(()=>ownPopup.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}))),result=record(response?.result);
      if(response?.exceptionDetails||!result||!Object.hasOwn(result,'value'))throw fail('media-tab-popup-evaluate-failed');return result.value;
    }
    const button=await wait(async()=>{
      const value=record(await evaluate(`(()=>{const b=document.getElementById('media-open');b?.focus();const r=b?.getBoundingClientRect();
        const x=r?r.x+r.width/2:0,y=r?r.y+r.height/2:0,s=b?getComputedStyle(b):null;
        return {ready:document.getElementById('settings-status')?.dataset.phase==='ready',visible:!!r&&r.width>0&&r.height>0&&
        s?.visibility==='visible'&&s.display!=='none'&&x>0&&y>0&&x<innerWidth&&y<innerHeight&&document.elementFromPoint(x,y)?.closest('#media-open')===b,
        focused:!!b&&document.activeElement===b,enabled:!!b&&!b.disabled,label:b?.textContent?.trim()||'',x,y};})()`));
      return value?.ready===true?value:null;
    });
    if(button.visible!==true||button.focused!==true||button.enabled!==true||typeof button.label!=='string'||!button.label||
      typeof button.x!=='number'||!Number.isFinite(button.x)||typeof button.y!=='number'||!Number.isFinite(button.y))throw fail('media-tab-opener-unavailable');
    /** @type {{observations:MediaSenderObservation[],overflow:boolean,contexts:chrome.runtime.ExtensionContext[]}} */
    const toolbar=await run(()=>worker.evaluate(async url=>{
      const state=/** @type {typeof globalThis & {__knifeMediaTabObserver?:MediaObserver}} */(globalThis);
      return {observations:state.__knifeMediaTabObserver?.observations??[],overflow:state.__knifeMediaTabObserver?.overflow??true,
        contexts:await chrome.runtime.getContexts({documentUrls:[url],contextTypes:['POPUP']})};
    },popupURL));
    if(toolbar.overflow||toolbar.contexts.length!==1||toolbar.contexts[0]?.documentOrigin!==`chrome-extension://${extensionId}`||
      toolbar.contexts[0]?.incognito!==false||toolbar.contexts[0]?.documentUrl!==popupURL||
      !toolbar.observations.some(value=>value.protocol===1&&value.ownId&&value.url===popupURL)||
      toolbar.observations.some(value=>value.protocol===mediaProtocol&&value.url===popupURL))throw fail('media-tab-toolbar-unqualified');
    await run(()=>ownPopup.command('Input.dispatchMouseEvent',{type:'mousePressed',x:button.x,y:button.y,button:'left',clickCount:1}));
    await run(()=>ownPopup.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:button.x,y:button.y,button:'left',clickCount:1}));
    const settingsPage=await wait(async()=>{
      if(pageOverflow)throw fail('media-tab-page-overflow');
      const matches=discovered.filter(page=>!existing.has(page)&&!page.isClosed()&&page.url()===expected.href);
      if(matches.length>1)throw fail('media-tab-page-ambiguous');return matches[0]??null;
    });
    if(settingsPage.context()!==context)throw fail('media-tab-context-invalid');
    const actualTab=await run(()=>settingsPage.evaluate(()=>chrome.tabs.getCurrent()));
    if(!actualTab||typeof actualTab.id!=='number'||!Number.isSafeInteger(actualTab.id)||actualTab.id<0||actualTab.windowId!==tab.windowId||actualTab.incognito!==false)throw fail('media-tab-identity-invalid');
    const tabId=actualTab.id;
    const liveContexts=await run(()=>worker.evaluate(id=>chrome.runtime.getContexts({tabIds:[id],contextTypes:['TAB']}),tabId));
    const live=liveContexts[0];
    if(liveContexts.length!==1||!live?.documentId||live.contextType!=='TAB'||live.frameId!==0||live.documentUrl!==expected.href||
      live.documentOrigin!==`chrome-extension://${extensionId}`||live.incognito!==false||live.tabId!==tabId||live.windowId!==actualTab.windowId)throw fail('media-tab-document-invalid');
    const documentId=live.documentId;
    const observations=await wait(async()=>{
      /** @type {{observations:MediaSenderObservation[],overflow:boolean}} */
      const state=await run(()=>worker.evaluate(()=>{
        const observer=/** @type {typeof globalThis & {__knifeMediaTabObserver?:MediaObserver}} */(globalThis).__knifeMediaTabObserver;
        return {observations:observer?.observations??[],overflow:observer?.overflow??true};
      }));
      if(state.overflow)throw fail('media-tab-observer-overflow');
      const own=state.observations.filter(value=>value.url===expected.href&&value.documentId===documentId);
      return own.some(value=>value.protocol===1)&&own.some(value=>value.protocol===mediaProtocol)?own:null;
    });
    const first=observations.find(value=>value.protocol===mediaProtocol);
    if(!first?.ownId||first.frame!==0||!first.documentId||observations.some(value=>!value.ownId||value.frame!==0||value.documentId!==first.documentId))throw fail('media-tab-sender-invalid');
    const confirmedDocumentId=first.documentId;
    const contexts=await run(()=>worker.evaluate(id=>chrome.runtime.getContexts({documentIds:[id]}),confirmedDocumentId));
    const current=contexts[0];
    if(contexts.length!==1||!current||current.contextType!=='TAB'||current.frameId!==0||current.documentId!==first.documentId||
      current.documentUrl!==expected.href||current.documentOrigin!==`chrome-extension://${extensionId}`||current.incognito!==false||
      current.tabId!==actualTab.id||current.windowId!==actualTab.windowId)throw fail('media-tab-document-invalid');
    await run(()=>settingsPage.waitForFunction(()=>document.getElementById('settings-status')?.dataset.phase==='ready'&&
      document.getElementById('media-status')?.dataset.phase==='ready',null,{timeout:remaining()}));
    if(!(await run(()=>settingsPage.locator('#brightness').isEnabled())))throw fail('media-tab-ui-not-ready');
    if(networkFailure)throw fail('media-tab-network-cleanup-failed');
    return {settingsPage,popupAttached:true,tabWriterQualified:true};
  }finally{
    context.off('page',onPage);
    /** @type {unknown} */let cleanupError;
    /** @param {()=>Promise<unknown>} work */async function cleanup(work){
      try{await bounded(work,Math.max(1,Math.min(8000,deadline-Date.now())),'media-tab-cleanup-failed');}catch(error){cleanupError??=error;}
    }
    if(popup){const attached=popup;await cleanup(()=>attached.detach());}
    if(openedPopup){const owned=openedPopup;await cleanup(async()=>{
      async function readOwnedPopup(){
        const targets=record(await run(()=>browserSession.send('Target.getTargets')))?.targetInfos;
        if(!Array.isArray(targets)||targets.length>128)throw fail('media-tab-popup-cleanup-invalid');
        const rows=targets.map(record);
        if(rows.some(row=>!row||typeof row.targetId!=='string'))throw fail('media-tab-popup-cleanup-invalid');
        const matches=rows.filter(row=>row?.targetId===owned.targetId);
        if(matches.length>1)throw fail('media-tab-popup-cleanup-invalid');
        const current=matches.at(0);
        if(current&&(current.url!==owned.url||current.browserContextId!==owned.browserContextId))throw fail('media-tab-popup-cleanup-invalid');
        return current??null;
      }
      if(await readOwnedPopup())await run(()=>browserSession.send('Target.closeTarget',{targetId:owned.targetId}));
      await wait(async()=>await readOwnedPopup()===null?true:null);
    });}
    if(pageSession){const attached=pageSession;await cleanup(()=>attached.detach());}
    if(observerInstalled)await cleanup(()=>worker.evaluate(()=>{
      const state=/** @type {typeof globalThis & {__knifeMediaTabObserver?:MediaObserver}} */(globalThis);
      if(state.__knifeMediaTabObserver){chrome.runtime.onMessage.removeListener(state.__knifeMediaTabObserver.listener);delete state.__knifeMediaTabObserver;}
    }));
    if(cleanupError)throw cleanupError;
  }
}
