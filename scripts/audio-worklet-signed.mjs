// 일반 CI의 합성 페이지에서만 installWorkletProof({trace})를 호출한다. T만 실제 노드의 포트를 관찰한다.
// assessWorkletSigned(diagnostic, transitions)는 저장한 증거로 각 전환을 재판정한다. 잘못된 증거는 예외 또는 실패 결과가 된다.
import {isDeepStrictEqual} from 'node:util';
import {assessSignedRows,deriveSignedReference,matchSignedAnchors,validateSignedCapture} from './audio-signed-transition.mjs';

/** 브라우저에 직렬화하므로 외부 변수를 참조하지 않는다. @param {{trace:boolean}} options */
export function installWorkletProof({trace}){
  const key=Symbol.for('cheese-knife.quality-worklet-signed');
  const context=Reflect.get(window,'__quality').context;
  if(!context||Reflect.has(window,key))throw Error('worklet-proof-install');
  const registration={attempts:0,successes:0,sha256:''};
  /** @type {Record<string,unknown>[]} */const events=[];
  let error='',lastPort=0;
  const source=()=>document.querySelector('video')?.currentSrc??'';
  /** @param {Record<string,unknown>} row */
  function add(row){
    if(events.length>=4096){error='worklet-trace-overflow';return;}
    events.push(row);
  }
  /** @param {string} type @param {number} id @param {unknown} input */
  function packet(type,id,input){
    try{
      if(!input||typeof input!=='object'||Object.keys(input).length>12)throw Error();
      const value=/** @type {Record<string,unknown>} */(input);
      if(type==='send'&&value.kind!=='configure'&&value.kind!=='retire')return;
      for(const field of Object.values(value)){
        if(Array.isArray(field)?field.length!==8||!field.every(n=>typeof n==='number'):field!==null&&!['number','string','boolean'].includes(typeof field))throw Error();
        if(typeof field==='string'&&field.length>128)throw Error();
      }
      add({type,id,data:structuredClone(value)});
    }catch{error='worklet-trace-packet';}
  }
  const proof={
    registration,
    /** @param {number[]} bytes */
    async registered(bytes){
      registration.successes++;
      try{
        const hash=await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes));
        registration.sha256=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
      }catch{error='worklet-registration-hash';}
    },
    /** @param {string} type @param {number} frame */
    mark(type,frame){
      if(trace)add({type,id:lastPort,source:source(),frame});
    },
    snapshot(){
      const gainTraceInstalled=typeof Reflect.get(window,Symbol.for('cheese-knife.quality-trace'))?.snapshot==='function';
      return {schema:'worklet-signed-v1',mode:trace?'T':'U',gainTraceInstalled,registration,error,...(trace?{events}:{})};
    },
  };
  Reflect.set(window,key,proof);
  if(!trace)return;
  window.AudioWorkletNode=new Proxy(window.AudioWorkletNode,{
    construct(native,args,newTarget){
      const node=/** @type {AudioWorkletNode} */(Reflect.construct(native,args,newTarget));
      if(args[0]!==context||args[1]!=='knife-audio-transition-l1')return node;
      try{
        const port=node.port,id=++lastPort;
        add({type:'create',id,source:source(),epoch:args[2]?.processorOptions?.sourceEpoch});
        node.addEventListener('processorerror',()=>add({type:'processorerror',id}));
        port.addEventListener('messageerror',()=>add({type:'messageerror',id}));
        port.addEventListener('message',event=>{
          if(!event.isTrusted){error='worklet-untrusted-message';return;}
          packet('receive',id,event.data);
        });
        const send=port.postMessage;
        port.postMessage=function(...args){
          try{
            const result=Reflect.apply(send,this,args);
            if(this===port)packet('send',id,args[0]);
            return result;
          }catch(cause){if(this===port)error='worklet-send-failed';throw cause;}
        };
      }catch{error='worklet-trace-install';}
      return node;
    },
  });
}

/** @param {unknown} condition @param {string} code @returns {asserts condition} */
function need(condition,code){if(!condition)throw Error(code);}
/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value){
  need(value&&typeof value==='object'&&!Array.isArray(value),'worklet-proof-object');
  return /** @type {Record<string,unknown>} */(value);
}
/** @param {unknown} n @returns {n is number} */
function counter(n){return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;}
/** @param {Record<string,unknown>} row @param {boolean} wanted */
function target(row,wanted){
  return isDeepStrictEqual(Object.keys(row).sort(),['dynamics','eq','gain','kind','normalizer','seq','sourceEpoch','targetDbfs','wanted'])&&
    row.kind==='configure'&&row.wanted===wanted&&row.gain===1&&row.normalizer===false&&row.dynamics===true&&
    row.targetDbfs===-20&&isDeepStrictEqual(row.eq,[0,0,0,0,0,0,0,0]);
}
/** @param {Record<string,unknown>} row @param {string} kind @param {unknown} epoch @param {unknown} seq */
function reply(row,kind,epoch,seq){
  return isDeepStrictEqual(Object.keys(row).sort(),['code','frame','gain','kind','meterEpoch','seq','sourceEpoch'])&&
    row.kind===kind&&row.sourceEpoch===epoch&&row.seq===seq&&row.code===null&&counter(row.frame)&&counter(row.meterEpoch)&&
    (kind==='completed'?typeof row.gain==='number'&&Number.isFinite(row.gain):row.gain===null);
}

/** 호출 앞의 명령이 완료됐는지와 호출 중 일어난 실제 발신·응답을 같은 포트의 기록 순서로 검사한다.
 * @param {Record<string,unknown>[]} events @param {import('./audio-signed-transition.mjs').MasterInput} input */
function acceptedFrame(events,{group,enabled,action,after}){
  const starts=events.flatMap((e,i)=>e.type==='start'?[i]:[]);
  const settles=events.flatMap((e,i)=>e.type==='settle'?[i]:[]);
  const ends=events.flatMap((e,i)=>e.type==='end'?[i]:[]);
  const start=starts[group],settle=settles[group],end=ends[group];
  need(starts.length===6&&settles.length===6&&ends.length===6&&start!==undefined&&settle!==undefined&&end!==undefined&&
    start<settle&&settle<end&&(group===0||Number(ends[group-1])<start),'worklet-mark-order');
  const mark=record(events[start]),stop=record(events[settle]),last=record(events[end]);
  const earlier=events.slice(0,start);
  const created=record(earlier.filter(e=>e.type==='create').at(-1));
  const {id,epoch,source}=created;
  need(counter(id)&&id>0&&counter(epoch)&&epoch>0&&typeof source==='string'&&source.length>0&&source.length<=2048&&
    [mark,stop,last].every(e=>e.id===id&&e.source===source)&&mark.frame===action.frame&&stop.frame===action.afterFrame&&
    counter(last.frame)&&last.frame>=Math.max(action.afterFrame,after.end,action.frame+3840),'worklet-source');
  const history=earlier.filter(e=>e.id===id&&['create','send','receive'].includes(String(e.type)));
  need(history[0]===created&&history.filter(e=>e.type==='create').length===1,'worklet-port');
  const prepared=record(history[1]?.data);
  need(history[1]?.type==='receive'&&reply(prepared,'prepared',epoch,0)&&prepared.meterEpoch===0&&counter(prepared.frame),'worklet-prepared');
  let renderFrame=prepared.frame;
  // 이전 gain 변경이 여러 개면 마지막으로 확정된 configure의 방향과 완료까지 확인한다.
  let seq=0,phase='complete';
  /** @type {Record<string,unknown>|undefined} */let previous;
  /** @type {Record<string,unknown>|undefined} */let previousAccept;
  /** @type {Record<string,unknown>|undefined} */let previousComplete;
  for(const event of history.slice(2)){
    const data=record(event.data);
    need(data.sourceEpoch===epoch,'worklet-history-epoch');
    if(event.type==='receive'){
      need(counter(data.frame)&&data.frame>=renderFrame,'worklet-render-order');
      renderFrame=data.frame;
    }
    if(event.type==='send'){
      need(phase==='complete'&&data.kind==='configure'&&counter(data.seq)&&data.seq>seq,'worklet-history-command');
      seq=data.seq;previous=data;phase='sent';
    }else if(phase==='sent'&&reply(data,'accepted',epoch,seq)){phase='accepted';previousAccept=data;}
    else if(phase==='accepted'&&reply(data,'completed',epoch,seq)){phase='complete';previousComplete=data;}
    else throw Error('worklet-history-reply');
  }
  need(phase==='complete'&&previous&&target(previous,!enabled)&&previousAccept&&previousComplete&&
    previousAccept.meterEpoch===previousComplete.meterEpoch&&previousComplete.gain===1&&counter(previousComplete.frame)&&
    counter(previousAccept.frame)&&previousAccept.frame<=previousComplete.frame&&previousComplete.frame<=action.frame,'worklet-prior-state');
  // 생성이나 다른 포트의 지연 응답도 현재 호출의 증거 구간에는 끼어들 수 없다.
  const body=events.slice(start+1,end).filter(e=>e.type!=='settle');
  need(body.length===3&&body.every(e=>e.id===id)&&body[0]?.type==='send'&&body[1]?.type==='receive'&&body[2]?.type==='receive','worklet-call-events');
  const send=record(body[0].data),accepted=record(body[1].data),completed=record(body[2].data);
  need(events.indexOf(body[0])<settle&&(!enabled||events.indexOf(body[1])<settle),'worklet-call-settlement');
  need(send.sourceEpoch===epoch&&send.seq===seq+1&&target(send,enabled),'worklet-command');
  need(reply(accepted,'accepted',epoch,send.seq)&&reply(completed,'completed',epoch,send.seq)&&
    accepted.meterEpoch===Number(previousComplete.meterEpoch)+1&&completed.meterEpoch===accepted.meterEpoch&&completed.gain===1&&
    counter(accepted.frame)&&accepted.frame>=renderFrame&&accepted.frame%128===0&&accepted.frame>=action.frame&&accepted.frame<=action.frame+1440&&
    (!enabled||accepted.frame<=action.afterFrame)&&
    completed.frame===accepted.frame+1728&&Number(completed.frame)<=last.frame,'worklet-response');
  return accepted.frame;
}

/** @param {Record<string,unknown>} diagnostic @param {unknown} transitions */
export function assessWorkletSigned(diagnostic,transitions){
  const proof=record(diagnostic.workletSigned),reg=record(proof.registration);
  const traced=diagnostic.traceEnabled===true;
  need(proof.schema==='worklet-signed-v1'&&proof.mode===(traced?'T':'U')&&proof.gainTraceInstalled===traced&&proof.error===''&&typeof diagnostic.workletSha256==='string'&&
    reg.attempts===1&&reg.successes===1&&reg.sha256===diagnostic.workletSha256,'worklet-registration');
  need(isDeepStrictEqual(proof.firstOn,{sources:1,state:'running',on:true}),'worklet-first-on');
  need(Array.isArray(proof.wide)&&proof.wide.length===6,'worklet-wide-count');
  const wide=proof.wide;
  need(traced?Array.isArray(proof.events)&&proof.events.length>0&&proof.events.length<=4096:!Object.hasOwn(proof,'events'),'worklet-trace-mode');
  const events=traced?/** @type {unknown[]} */(proof.events).map(record):[];
  let lastId=0,lastEpoch=0;
  for(const event of events){
    if(event.type==='create'){
      need(event.id===++lastId&&counter(event.epoch)&&event.epoch>lastEpoch,'worklet-created');lastEpoch=event.epoch;
    }else need(counter(event.id)&&event.id>0&&event.id<=lastId&&['start','settle','end','send','receive'].includes(String(event.type)),'worklet-event');
  }
  return assessSignedRows({diagnostic,transitions},input=>{
    const {group,frequency,enabled,action,before,change,after}=input,c=validateSignedCapture(wide[group]);
    need(c.rate===48000&&c.start===action.frame-960&&c.end===action.frame+3840&&change.rate===c.rate&&
      change.start===c.start&&change.end===action.frame+1920&&change.channels.every((channel,k)=>
        channel.every((sample,i)=>sample===c.channels.at(k)?.at(i))),'worklet-wide-window');
    const acceptance=traced?[acceptedFrame(events,input)]:Array.from({length:12},(_,i)=>Math.ceil(action.frame/128)*128+i*128)
      .filter(frame=>frame<=action.frame+1440);
    const anchors=acceptance.map(frame=>frame+(enabled?0:1248));
    need(anchors.every(frame=>frame+480<c.end),'worklet-cut-ramp');
    const reference=deriveSignedReference({frequency,before,after});
    return reference.status==='passed'?matchSignedAnchors(reference,c,anchors):reference;
  });
}
