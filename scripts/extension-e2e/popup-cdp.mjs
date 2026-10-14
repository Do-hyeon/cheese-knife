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
    async detach(){if(closed)return;retire();await bounded(()=>browser.send('Target.detachFromTarget',{sessionId}),timeoutMs,'popup-detach-timeout');},
  };
}
