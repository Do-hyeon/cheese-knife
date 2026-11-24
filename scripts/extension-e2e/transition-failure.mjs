import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {nativeFailureDetails} from '../audio-native-browser.mjs';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
/** @param {unknown} value @returns {Record<string,unknown>|null} */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?/** @type {Record<string,unknown>} */(value):null;
/** @param {unknown} value */
export function hasNoTransitionErrors(value){
  const row=record(value);return !!row&&Array.isArray(row.pageErrors)&&row.pageErrors.length===0&&
    Array.isArray(row.routeErrors)&&row.routeErrors.length===0&&row.errorsTruncated===false&&row.errorsComplete===true;
}

/** @typedef {{pageErrors:readonly string[],routeErrors:readonly string[],errorsTruncated:boolean,errorsComplete:boolean}} TransitionEvidence */
/** @param {import('playwright').BrowserContext} context */
export function observeTransitionErrors(context){
  /** @type {string[]} */const pageErrors=[];
  /** @type {string[]} */const routeErrors=[];
  let errorsTruncated=false;
  /** @type {Set<Promise<void>>} */const pending=new Set();
  /** @type {Map<import('playwright').Page,(error:Error)=>void>} */const listeners=new Map();
  /** @param {string[]} list @param {unknown} error */
  const add=(list,error)=>{if(list.length===32)errorsTruncated=true;else list.push(String(record(error)?.message??error).slice(0,240));};
  /** @param {import('playwright').Page} page */
  const attach=page=>{if(listeners.has(page))return;const listener=/** @param {Error} error */error=>add(pageErrors,error);listeners.set(page,listener);page.on('pageerror',listener);};
  for(const page of context.pages())attach(page);context.on('page',attach);
  /** @type {Promise<TransitionEvidence>|undefined} */let final;
  return {
    get evidence(){return {pageErrors:[...pageErrors],routeErrors:[...routeErrors],errorsTruncated,errorsComplete:false};},
    /** @template {unknown[]} Args @param {(...args:Args)=>unknown} handler */
    guardRoute(handler){return (/** @type {Args} */...args)=>{
      const work=Promise.resolve().then(()=>handler(...args)).then(()=>{},error=>add(routeErrors,error));
      pending.add(work);void work.then(()=>pending.delete(work));return work;
    };},
    dispose(){
      if(final)return final;
      final=(async()=>{
        let expired=false;
        /** @type {ReturnType<typeof setTimeout>|undefined} */let timer;
        const limit=new Promise(resolve=>{timer=setTimeout(()=>{expired=true;resolve(true);},1000);});
        try{while(pending.size&&!expired)await Promise.race([Promise.all([...pending]),limit]);}
        finally{clearTimeout(timer);context.off('page',attach);for(const [page,listener]of listeners)page.off('pageerror',listener);listeners.clear();}
        if(expired)add(routeErrors,'transition-route-unconfirmed');
        return Object.freeze({pageErrors:Object.freeze([...pageErrors]),routeErrors:Object.freeze([...routeErrors]),errorsTruncated,errorsComplete:!expired&&pending.size===0});
      })();return final;
    },
  };
}

/** Preserve messages when the existing bounded native normalizer receives serialized evidence.
 * @param {unknown} source @param {Record<string,unknown>} target @param {number} [depth]
 */
function restoreMessages(source,target,depth=0){
  const row=record(source);if(typeof row?.message==='string')target.message=row.message.slice(0,4096);
  const nested=record(target.cause);if(depth<2&&nested)restoreMessages(row?.cause,nested,depth+1);
}
/** @param {unknown} error @param {Record<string,unknown>} failure @returns {Record<string,unknown>} */
export function withTransitionDiagnostic(error,failure){
  const row=record(error),remembered=record(failure.diagnostic)??record(record(row?.failure)?.diagnostic),broker=remembered??record(row?.diagnostic);
  const native=remembered?.native?nativeFailureDetails(remembered.native):nativeFailureDetails(error);
  if(remembered?.native)restoreMessages(remembered.native,native);
  const diagnostic={name:String(remembered?.name??row?.name??'Error').slice(0,80),
    message:String(remembered?.message??row?.message??'').replaceAll(repository,'<repository>').slice(0,240),native};
  for(const key of ['actualLength','expectedLength','actualCRLF','expectedCRLF','matchesAfterEOLNormalization']){
    const value=broker?Reflect.get(broker,key):undefined;if(typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))Object.defineProperty(diagnostic,key,{value,enumerable:true});
  }
  return {...failure,diagnostic};
}
