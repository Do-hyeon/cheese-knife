// 일반 음질 CI의 T 페이지는 installRoleGraph()로 무음 그래프와 실제 포트 메시지를 관찰한다.
// validateRoleEvidence(diagnostic)는 저장된 원시 연결·메시지로 역할을 재구성하며 불일치 시 예외를 던진다.
// Chromium을 소유한 러너가 페이지와 컨텍스트를 닫는다. 별도 파일이나 외부 장치를 열지 않는다.
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {AUDIO_ARTIFACT_FILES} from './audio-artifact-core.mjs';

/** 전용 러너가 쓰기 전에 UTF-8 보고서 크기를 확인한다. @param {unknown} report */
export function serializeRoleReport(report){
  const json=JSON.stringify(report,null,2);
  if(Buffer.byteLength(json)>8*1024*1024)throw Error('audio-quality-report-size');
  return json;
}

/** @param {Uint8Array} bytes */
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

/** @param {{readFile:(path:string)=>Promise<Uint8Array>}} files */
export async function readRoleInputs(files){
  const scripts=[],manifest=[];
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  for(const path of AUDIO_ARTIFACT_FILES){
    const bytes=await files.readFile(path);
    scripts.push(decoder.decode(bytes));manifest.push({path,sha256:sha256(bytes)});
  }
  const worklet=await files.readFile('web/audio-transition-worklet.js');
  if(!worklet.length)throw Error('audio-quality-worklet-empty');
  return {scripts,manifest,worklet,workletSha256:sha256(worklet)};
}

/** 새 합성 페이지에만 설치한다. 브라우저에서 직렬화해 실행하므로 외부 변수를 참조하지 않는다. */
export function installRoleGraph(){
  const context=new AudioContext({sampleRate:48000}),physical=context.destination;
  const sink=context.createGain();sink.gain.value=0;
  const NativeWorklet=window.AudioWorkletNode;
  /** @type {WeakMap<object,number>} */const ids=new WeakMap();
  /** @type {{id:number,kind:string}[]} */const nodes=[];
  /** @type {{from:number,to:number,output:number,input:number|null}[]} */const edges=[];
  /** @type {{id:number,param:number}[]} */const gains=[];
  /** @type {{node:number,source:string}[]} */const sources=[];
  /** @type {{node:number,k:number,port:number,epoch:number}[]} */const worklets=[];
  /** @type {{direction:string,port:number,packet:Record<string,any>}[]} */const events=[];
  let error='',disconnects=0,graphSource='',portSource='';
  /** @type {ReturnType<typeof snapshot>|null} */let terminal=null;
  /** @template T @param {T[]} array @param {T} value */
  function add(array,value){if(array.length>=192)error='overflow';else array.push(value);}
  /** @param {object} object */
  function id(object){
    const existing=ids.get(object);if(existing!==undefined)return existing;
    const next=nodes.length+1;
    add(nodes,{id:next,kind:object instanceof NativeWorklet?'AudioWorkletNode':object.constructor.name});
    ids.set(object,next);return next;
  }
  /** @param {Function} fn @param {unknown} receiver @param {ArrayLike<unknown>} args */
  function call(fn,receiver,args){
    try{return Reflect.apply(fn,receiver,args);}catch(cause){error='native-call';throw cause;}
  }
  const connect=AudioNode.prototype.connect,disconnect=AudioNode.prototype.disconnect;
  AudioNode.prototype.connect=new Proxy(connect,{
    apply(native,receiver,args){
      const result=call(native,receiver,args);
      if(receiver.context===context)add(edges,{from:id(receiver),to:id(args[0]),output:args[1]??0,input:args[0] instanceof AudioParam?null:args[2]??0});
      return result;
    },
  });
  AudioNode.prototype.disconnect=new Proxy(disconnect,{
    apply(native,receiver,args){const result=call(native,receiver,args);if(receiver.context===context)disconnects++;return result;},
  });
  const destination=id(physical),sinkId=id(sink),silentGain=sink.gain.value;
  sink.connect(physical);
  Object.defineProperty(context,'destination',{get:()=>sink});
  const createGain=context.createGain,createSource=context.createMediaElementSource;
  context.createGain=function(){
    const gain=/** @type {GainNode} */(call(createGain,this,arguments));
    if(this===context)add(gains,{id:id(gain),param:id(gain.gain)});
    return gain;
  };
  context.createMediaElementSource=function(video){
    const node=/** @type {MediaElementAudioSourceNode} */(call(createSource,this,arguments));
    if(this===context){
      graphSource=node.mediaElement.currentSrc;portSource=graphSource;
      add(sources,{node:id(node),source:graphSource});
    }
    return node;
  };
  window.AudioWorkletNode=new Proxy(NativeWorklet,{
    construct(native,args,newTarget){
      if(args[0]!==context||args[1]!=='knife-audio-transition-l1')return Reflect.construct(native,args,newTarget);
      const opts=args[2],epoch=opts.processorOptions.sourceEpoch;
      args[2]={...opts,processorOptions:{...opts.processorOptions,normalizerWitness:true,headroomWitness:true}};
      let node;
      try{node=/** @type {AudioWorkletNode} */(Reflect.construct(native,args,newTarget));}catch(cause){error='native-worklet';throw cause;}
      const port=node.port,portId=id(port);
      const k=Reflect.get(node.parameters,'get').call(node.parameters,'K');
      if(!k){error='missing-worklet-K';return node;}
      add(worklets,{node:id(node),k:id(k),port:portId,epoch});
      node.addEventListener('processorerror',()=>{error='processorerror';});
      port.addEventListener('messageerror',()=>{error='messageerror';});
      port.addEventListener('message',event=>{
        if(!event.isTrusted){error='untrusted-message';return;}
        add(events,{direction:'receive',port:portId,packet:structuredClone(event.data)});
      });
      port.postMessage=new Proxy(port.postMessage,{
        apply(native,receiver,args){
          const result=call(native,receiver,args);
          if(receiver===port)add(events,{direction:'send',port:portId,packet:structuredClone(args[0])});
          return result;
        },
      });
      return node;
    },
  });
  Reflect.set(window,'AudioContext',new Proxy(window.AudioContext,{construct:()=>context}));
  Reflect.set(window,'__quality',{context});
  function snapshot(){
      return {error,rate:context.sampleRate,state:context.state,terminalFrame:Math.round(context.currentTime*context.sampleRate),
        source:graphSource,graph:{source:graphSource,destination,sink:sinkId,silentGain,terminalGain:sink.gain.value,disconnects,nodes,edges,gains,sources,worklets},
        port:{source:portSource,events}};
  }
  Reflect.set(window,'__qualityRoles',{
    /** @param {number} seq */
    observed(seq){
      const completed=events.findIndex(e=>e.direction==='receive'&&e.packet.kind==='completed'&&e.packet.seq===seq);
      if(completed<0)return false;
      const power=events.slice(completed+1).find(e=>e.direction==='send'&&e.packet.kind==='power'&&e.packet.active===true);
      if(!power||!events.some(e=>e.direction==='receive'&&e.packet.kind==='meter-accepted'&&e.packet.seq===power.packet.meterSeq))return false;
      if(seq===2){
        if(events.filter(e=>e.packet.kind==='power').length!==events.filter(e=>e.packet.kind==='meter-accepted').length)return false;
        terminal=structuredClone(snapshot());
      }
      return true;
    },
    snapshot:()=>terminal??snapshot(),
  });
}

/** @param {unknown} value @param {string} code @returns {asserts value} */
function need(value,code){if(!value)throw Error('worklet-role-'+code);}
/** @param {unknown} value @returns {Record<string,any>} */
function row(value){need(value&&typeof value==='object'&&!Array.isArray(value),'object');return /** @type {Record<string,any>} */(value);}
/** @param {unknown} value */
function rows(value){need(Array.isArray(value)&&value.length<=192,'rows');return value.map(row);}
/** @param {unknown} n @returns {n is number} */
function count(n){return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;}
/** @param {unknown} value */
function blob(value){return typeof value==='string'&&value.startsWith('blob:')&&value.length>5&&value.length<=2048;}

/** @param {Record<string,any>} graph */
function validateGraph(graph){
  const nodes=rows(graph.nodes),edges=rows(graph.edges),sources=rows(graph.sources),worklets=rows(graph.worklets);
  const kinds=new Map(nodes.map(n=>[n.id,n.kind]));
  need(nodes.every(n=>count(n.id)&&n.id>0)&&kinds.size===nodes.length,'node-id');
  const owned=new Set();
  /** @param {number} id @param {string} kind */
  function claim(id,kind){need(kinds.get(id)===kind&&!owned.has(id),'node-'+kind);owned.add(id);return id;}
  need(sources.length===1&&worklets.length===1&&graph.disconnects===0&&graph.silentGain===0&&graph.terminalGain===0,'graph');
  const source=row(sources[0]),processor=row(worklets[0]);
  need(source.source===graph.source,'media-source');
  const media=claim(source.node,'MediaElementAudioSourceNode'),worklet=claim(processor.node,'AudioWorkletNode');
  claim(processor.port,'MessagePort');const k=claim(processor.k,'AudioParam');
  const sink=claim(graph.sink,'GainNode'),destination=claim(graph.destination,'AudioDestinationNode');
  /** @param {number} from @param {number|string} to @param {number} [output] */
  function edge(from,to,output=0){
    const kind=typeof to==='string'?to:kinds.get(to),input=kind==='AudioParam'?null:0;
    const matches=edges.filter(e=>e.from===from&&e.output===output&&e.input===input&&(typeof to==='string'?kinds.get(e.to)===to:e.to===to));
    need(matches.length===1,'connection');
    const found=row(matches[0]);edges.splice(edges.indexOf(found),1);
    return typeof to==='string'?claim(found.to,to):found.to;
  }
  edge(sink,destination);edge(media,worklet);
  const dry=edge(edge(media,'DelayNode'),'GainNode'),permit=edge(dry,'GainNode');edge(permit,sink);
  const compWet=edge(edge(worklet,'DynamicsCompressorNode'),'GainNode'),compDry=edge(edge(worklet,'DelayNode'),'GainNode');
  const mix=edge(compWet,'GainNode');edge(compDry,mix);
  const normalizer=edge(mix,'GainNode'),master=edge(normalizer,'GainNode'),wet=edge(edge(master,'WaveShaperNode'),'GainNode');edge(wet,sink);
  const split=edge(worklet,'ChannelSplitterNode',1),meter=edge(mix,'ChannelSplitterNode');
  edge(meter,'AnalyserNode');edge(meter,'AnalyserNode',1);
  const gains=rows(graph.gains),params=new Map(gains.map(g=>[g.id,g.param]));
  need(gains.length===8&&params.size===8,'gain-count');
  for(const gain of [dry,permit,compWet,compDry,mix,normalizer,master,wet])claim(params.get(gain),'AudioParam');
  for(const [channel,gain]of [dry,wet,master,normalizer,permit].entries())edge(split,params.get(gain),channel);
  const constants=nodes.filter(n=>n.kind==='ConstantSourceNode');need(constants.length===1,'constant');
  const latch=claim(row(constants[0]).id,'ConstantSourceNode');edge(latch,params.get(permit));edge(latch,k);
  need(edges.length===0&&owned.size===nodes.length,'extra');
  return processor;
}

/** @param {Record<string,any>} proof @param {Record<string,any>} processor */
function validatePort(proof,processor){
  const events=rows(proof.port.events),epoch=processor.epoch;
  let lastFrame=-1,nextMeter=1,configured=0,accepted=0,completed=0,prepared=false;
  const witnessed=new Set();
  /** @type {Map<number,{after:number,packet:Record<string,any>}>} */const pending=new Map();
  let acceptedFrame=-1;
  need(count(epoch)&&epoch>0&&count(proof.terminalFrame)&&proof.terminalFrame%128===0,'epoch');
  for(const event of events){
    const p=row(event.packet);
    need(event.port===processor.port&&p.sourceEpoch===epoch,'port-epoch');
    if(event.direction==='send'){
      need(prepared,'prepare-order');
      if(p.kind==='configure'){
        need(configured===completed&&(configured===0||witnessed.has(configured))&&++configured<=2,'configure-order');
        const eq=[0,0,0,0,configured===1?0:6,0,0,0];
        need(isDeepStrictEqual(p,{kind:'configure',seq:configured,sourceEpoch:epoch,wanted:true,gain:1,dynamics:true,normalizer:true,targetDbfs:-20,eq}),'configure');
      }else{
        need(p.kind==='power'&&p.meterSeq===nextMeter++&&p.meterEpoch===1&&p.targetDbfs===-20&&
          typeof p.active==='boolean'&&[p.leftPower,p.rightPower,p.observedTime].every(n=>Number.isFinite(n)&&n>=0),'power');
        need(completed>0||p.active===false,'initial-power');
        const after=completed===configured&&p.active?completed:0;
        pending.set(p.meterSeq,{after,packet:p});
      }
      continue;
    }
    need(event.direction==='receive'&&count(p.frame)&&p.frame>=lastFrame&&p.frame<=proof.terminalFrame,'clock');lastFrame=p.frame;
    if(p.kind==='prepared'){
      need(!prepared&&p.seq===0&&p.meterEpoch===0&&p.code===null&&p.gain===null&&p.frame%128===0,'prepared');prepared=true;
    }else if(p.kind==='accepted'){
      need(configured===accepted+1&&p.seq===configured&&p.meterEpoch===1&&p.code===null&&p.gain===null&&p.frame%128===0,'accepted');
      accepted=configured;acceptedFrame=p.frame;
    }else if(p.kind==='completed'){
      need(accepted===completed+1&&p.seq===accepted&&p.code===null&&p.gain===1&&p.meterEpoch===1&&
        p.frame===acceptedFrame+(accepted===1?1728:960),'completed');completed=accepted;
    }else{
      need(p.kind==='meter-accepted'&&p.meterEpoch===1&&p.gain===null,'meter');
      const first=pending.keys().next().value,sent=pending.get(p.seq);
      need(sent&&p.seq===first,'meter-sequence');pending.delete(p.seq);
      if(!sent.after||witnessed.has(sent.after))continue;
      const seq=sent.after,application=row(p.application),render=row(p.renderHeadroom);
      const completedTime=(acceptedFrame+(seq===1?1728:960))/proof.rate,time=p.frame/proof.rate;
      const {mode,start,end,fromDb,toDb}=application;
      need(sent.packet.observedTime>=completedTime&&sent.packet.observedTime<=time&&time-sent.packet.observedTime<=.2,'meter-time');
      need(['hold','warmup','ramp'].includes(mode)&&mode===p.code&&start===time&&
        [fromDb,toDb].every(db=>Number.isFinite(db)&&db>=-12&&db<=6)&&
        (mode==='ramp'?end===start+.1&&toDb>=fromDb-1.2&&toDb<=fromDb+.1:end===start&&fromDb===toDb),'meter-application');
      need(seq===configured&&p.frame%128===0&&time>=completedTime&&
        application.sourceEpoch===epoch&&application.meterEpoch===p.meterEpoch&&application.meterSeq===p.seq&&application.commandSeq===seq&&
        application.frame===p.frame&&
        render.sourceEpoch===epoch&&render.commandSeq===seq&&render.startFrame===p.frame&&render.endFrame===p.frame+128&&render.endFrame<=proof.terminalFrame,'render');
      const eq=[0,0,0,0,seq===1?0:6,0,0,0];
      need(isDeepStrictEqual(render.eq,eq)&&typeof render.headroom==='number'&&Number.isFinite(render.headroom)&&render.headroom>0&&
        Math.abs(20*Math.log10(render.headroom)+Math.max(0,...eq))<0.01,'headroom');
      witnessed.add(seq);
    }
  }
  need(prepared&&configured===2&&completed===2&&witnessed.size===2&&pending.size===0,'missing');
}

/** @param {Record<string,any>} d */
export function validateRoleEvidence(d){
  const proof=row(d.workletSigned),registration=row(proof.registration);
  need(d.roleProfile===true&&isDeepStrictEqual(d.injectedMain,row(d.artifact).files)&&Array.isArray(d.injectedMain)&&
    d.injectedMain.length===AUDIO_ARTIFACT_FILES.length&&d.injectedMain.every((file,i)=>file?.path===AUDIO_ARTIFACT_FILES[i]&&/^[a-f0-9]{64}$/.test(file.sha256))&&
    typeof d.workletSha256==='string'&&/^[a-f0-9]{64}$/.test(d.workletSha256)&&
    registration.attempts===1&&registration.successes===1&&registration.sha256===d.workletSha256,'identity');
  if(d.traceEnabled===false){need(!Object.hasOwn(d,'roles')&&proof.mode==='U'&&proof.gainTraceInstalled===false&&!Object.hasOwn(proof,'events'),'U');return null;}
  const r=row(d.roles),g=row(r.graph),port=row(r.port),native=row(r.registration);
  const mainSource=Array.isArray(proof.events)?proof.events.find(e=>e.type==='create')?.source:null;
  need(d.traceEnabled===true&&proof.mode==='T'&&r.label===d.label&&r.mainSource===mainSource&&blob(mainSource)&&
    blob(r.source)&&r.source!==mainSource&&g.source===r.source&&port.source===r.source&&r.error===''&&!Object.hasOwn(r,'failure')&&!Object.hasOwn(r,'cleanupError')&&r.rate===48000&&r.state==='running'&&
    isDeepStrictEqual(r.injectedMain,d.injectedMain)&&native.attempts===1&&native.successes===1&&native.sha256===d.workletSha256,'T');
  validatePort(r,validateGraph(g));
  return {main:mainSource,calibration:r.source};
}
