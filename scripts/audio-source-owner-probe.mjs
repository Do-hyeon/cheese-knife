/** Synthetic, explicitly selected R4 observation. Released product code never imports this module.
 * @param {{sampleRate:number,profile?:'dry-prefix'|'wet-prefix'|'extreme-prefix'|'pending-off'|'suspend-rebind'|'off-stages'}} options
 */
export async function installSourceOwnerProbe(options){
  const rate=options.sampleRate;if(![44100,48000,96000].includes(rate))throw Error('audio-source-owner-rate');
  if(options.profile!==undefined&&!['dry-prefix','wet-prefix','extreme-prefix','pending-off','suspend-rebind','off-stages'].includes(options.profile))throw Error('audio-source-owner-profile');
  const offStages=options.profile==='off-stages',controlled=options.profile==='suspend-rebind'||offStages;if(controlled&&rate!==44100)throw Error('audio-source-owner-rate');
  const pending=options.profile==='pending-off'||controlled,extreme=options.profile==='extreme-prefix',wet=options.profile==='wet-prefix'||extreme,history=options.profile==='dry-prefix'||wet;
  const target=window,NativeContext=target.AudioContext,NativeNode=target.AudioWorkletNode,context=new NativeContext({sampleRate:rate});
  if(context.sampleRate!==rate)throw Error('audio-source-owner-native-rate');
  const foundVideo=document.querySelector('video');if(!foundVideo)throw Error('audio-source-owner-video');const video=foundVideo;
  /** @typedef {{config:Record<string,unknown>,media:{context:{documentGeneration:number,routePath:string}},state?:{player?:{video:HTMLVideoElement}},selectPlayer?:()=>{video:HTMLVideoElement}|null,mediaCurrent?:()=>boolean,audio:{configure:()=>void,suspend:(video:HTMLVideoElement)=>void,eligible:(video:HTMLVideoElement)=>boolean,setGain:(video:HTMLVideoElement,gain:number)=>unknown,setEnabled:(video:HTMLVideoElement,wanted:boolean)=>Promise<string>,getReadback:(video:HTMLVideoElement)=>unknown}}} Runtime */
  const runtime=()=>/** @type {Runtime} */(Reflect.get(target,Symbol.for('cheese-knife.runtime.v1')));
  const sourceKey=()=>{const {documentGeneration,routePath}=runtime().media.context;return {currentSrc:video.currentSrc,documentGeneration,routePath};};
  /** @template T @param {T} value @returns {T} */const copy=value=>JSON.parse(JSON.stringify(value));
  /** @param {unknown} value @returns {Record<string,unknown>|null} */const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?/** @type {Record<string,unknown>} */(value):null;
  /** @param {unknown} value @returns {value is number} */const safe=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
  /** @type {Record<string,unknown>[]} */const ledger=[];
  /** @type {string[]} */const moduleLoads=[];
  let error=/** @type {string|null} */(null),stopped=false,loading=false,sources=0,contextRequests=0,slot=0,switchOrder=0;
  let cancelLoad=/** @type {(()=>void)|null} */(null);
  let historyPaused=false,historyRequests=0,historyWet=false,extremeLoaded=false,extremeConfigured=false;const historyCaptures=new Set();
  /** @type {Chunk[]} */const historyRing=[];
  let firstPrepared=/** @type {number|null} */(null);
  const active=()=>{if(stopped||error)throw Error(error??'audio-source-owner-stopped');};
  let inputPlan=/** @type {Record<string,unknown>|null} */(null),firstFailure=/** @type {Record<string,unknown>|null} */(null);
  let restoreStimulus=()=>{};
  const stimulus={method:offStages?'controlled-public-suspend-off-stages':'controlled-public-suspend',status:'UNARMED'};
  /** @type {{registration:string,endpointId:number,frozen:boolean}|null} */let stageFacts=null;
  /** @type {MessageChannel|null} */let stageChannel=null;
  /** @type {((packet:Record<string,unknown>,endpoint:MessagePort)=>unknown)|null} */let registerA=null;
  /** @type {((cause:Error)=>void)|null} */let rejectRegistration=null;
  /** @type {number|undefined} */let registrationTimer;
  let stageClosed=false;
  /** @type {string[]} */const stageCleanupErrors=[];
  /** @param {string} code @param {Record<string,unknown>} [detail] */
  const broken=(code,detail={})=>{error??='audio-source-owner-'+code;firstFailure??={error,...copy(detail)};if(controlled)restoreStimulus();};
  /** @param {string} type @param {Record<string,unknown>} [data] */
  const note=(type,data={})=>{if(stopped)return;if(ledger.length>=4128){broken('ledger-cap');return;}const e={order:ledger.length+1,type,...copy(data)};if(new TextEncoder().encode(JSON.stringify([...ledger,e])).length>480*1024){broken('ledger-cap');return;}ledger.push(e);return e.order;};
  /** @param {string} type @param {()=>Record<string,unknown>} data */
  const pendingNote=(type,data)=>{try{return note(type,data())??null;}catch{error??='audio-source-owner-pending-observation';firstFailure??={error};return null;}};
  /** @typedef {{frame:number,sequence:number,received:number,samples:Float32Array[]}} Chunk */
  /** @typedef {{id:number,portId:number,role:string,channels:number,contextId:number,nodeId:number|null,sourceEpoch:number|null,node:AudioWorkletNode,queue:Chunk[],received:number,lastFrame:number|null}} Producer */
  /** @typedef {{id:number,portId:number,sourceEpoch:number,contextId:number,initial:unknown,options:Record<string,unknown>,sourceKey?:{currentSrc:string,documentGeneration:number,routePath:string},producerId:number,node:AudioWorkletNode,outputs:Set<unknown>,closed:boolean}} Binding */
  /** @type {Map<number,Producer>} */const producers=new Map();
  /** @type {Binding[]} */const bindings=[];
  /** @type {Map<AudioNode,Binding>} */const byNode=new Map();
  /** @type {Set<number>} */const sourceConnections=new Set();
  const nativeDestination=context.destination;
  const captureCode=`class Capture extends AudioWorkletProcessor {
    constructor(o){super();this.id=o.processorOptions.producerId;this.sequence=0;}
    process(inputs,outputs){for(const channel of outputs[0]||[])channel.fill(0);const samples=(inputs[0]||[]).map(c=>new Float32Array(c));this.port.postMessage({producerId:this.id,producerSequence:++this.sequence,frame:currentFrame,samples},samples.map(c=>c.buffer));return true;}
  }registerProcessor('source-owner-capture',Capture);`;
  const captureUrl=URL.createObjectURL(new Blob([captureCode],{type:'text/javascript'}));
  try{await context.audioWorklet.addModule(captureUrl);}finally{URL.revokeObjectURL(captureUrl);}
  const addModule=context.audioWorklet.addModule.bind(context.audioWorklet);
  context.audioWorklet.addModule=async(url,settings)=>{if(moduleLoads.length>=8||String(url).length>2048){broken('module-bound');throw Error(error??'audio-source-owner-module-bound');}moduleLoads.push(String(url));return addModule(url,settings);};
  /** @param {number} id @param {number|null} owner @param {number|null} epoch */
  function capture(id,owner=null,epoch=null){
    const channels=id<2?2:5,node=new NativeNode(context,'source-owner-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[channels],channelCount:channels,channelCountMode:'explicit',channelInterpretation:'discrete',processorOptions:{producerId:id}});
    /** @type {Producer} */const p={id,portId:id,role:id===0?'program':id===1?'source':'control',channels,contextId:1,nodeId:owner,sourceEpoch:epoch,node,queue:[],received:0,lastFrame:null};producers.set(id,p);
    node.port.onmessage=({data})=>{
      if(stopped||error)return;p.received++;const r=record(data),samples=r?.samples;
      const historyExceeded=!!r&&safe(r.frame)&&firstPrepared!==null&&r.frame+128-firstPrepared>20*rate;
      if(historyExceeded||!r||r.producerId!==id||!safe(r.producerSequence)||r.producerSequence!==p.received||!safe(r.frame)||r.frame%128||p.lastFrame!==null&&r.frame!==p.lastFrame+128||!Array.isArray(samples)||![0,channels].includes(samples.length)||samples.some(c=>!(c instanceof Float32Array)||c.length!==128||c.some(v=>!Number.isFinite(v)))){
        const kept=Array.isArray(samples)?samples.slice(0,5).filter(c=>c instanceof Float32Array).map(c=>{const bytes=new Uint8Array(c.buffer,c.byteOffset,Math.min(c.byteLength,512));return {encoding:'float32le',base64:btoa(String.fromCharCode(...bytes)),bytes:bytes.length,originalLength:c.length};}):[];
        broken(historyExceeded?'history-bound':'capture-invalid',{producerId:id,received:p.received,frame:r?.frame??null,sequence:r?.producerSequence??null,bytes:kept.reduce((n,c)=>n+c.bytes,0),channels:kept});return;
      }
      if(p.queue.length>=2000){broken('ring-overflow',{producerId:id,received:p.received,frame:r.frame});return;}
      const chunk={frame:r.frame,sequence:r.producerSequence,received:p.received,samples};p.queue.push(chunk);if(history&&p.id===0){historyRing.push(chunk);if(historyRing.length>2000)historyRing.shift();}p.lastFrame=r.frame;
    };node.port.start();node.connect(nativeDestination);return p;
  }
  function base(){if(!producers.has(0)){capture(0);capture(1);}return /** @type {Producer} */(producers.get(0));}
  Object.defineProperty(context,'destination',{get:()=>base().node});
  target.AudioContext=new Proxy(NativeContext,{construct(){if(contextRequests++){broken('context-recreated');throw Error(error??'audio-source-owner-context');}return context;}});
  const createSource=context.createMediaElementSource.bind(context);
  context.createMediaElementSource=element=>{
    active();
    if(element!==video||sources){broken('source-recreated');throw Error(error??'audio-source-owner-source');}base();
    const source=createSource(element);sources++;note('source-create',{sourceHandle:1});
    source.connect(/** @type {Producer} */(producers.get(1)).node);
    const connect=source.connect.bind(source),disconnect=source.disconnect.bind(source);
    source.connect=(...args)=>{const result=Reflect.apply(connect,source,args),binding=byNode.get(/** @type {AudioNode} */(args[0]));if(binding){sourceConnections.add(binding.id);note('source-connect',{nodeId:binding.id,sourceHandle:1});}return result;};
    /** @param {...unknown} args */
    const disconnectSource=(...args)=>{
      if(!pending){const result=Reflect.apply(disconnect,source,args);for(const b of bindings)if(!args.length||args[0]===b.node){if(sourceConnections.delete(b.id))note('source-disconnect',{nodeId:b.id,sourceHandle:1});}return result;}
      const affected=!args.length||typeof args[0]==='number'?bindings:bindings.filter(b=>args[0]===b.node);
      if(args.length&&!affected.length)broken('source-disconnect-untracked');
      const attempts=affected.map(b=>({binding:b,order:pendingNote('source-disconnect-attempt',()=>({nodeId:b.id,portId:b.portId,sourceEpoch:b.sourceEpoch,sourceHandle:1,contextId:1,elementId:1,connected:sourceConnections.has(b.id),outputs:b.outputs.size>0,closed:b.closed,...sourceKey(),src:video.src,wanted:record(runtime().audio.getReadback(video))?.wanted}))}));
      let result;try{result=Reflect.apply(disconnect,source,args);}catch(cause){for(const {binding:b,order} of attempts)pendingNote('source-disconnect-throw',()=>({nodeId:b.id,attemptOrder:order}));throw cause;}
      for(const {binding:b,order} of attempts){if(sourceConnections.delete(b.id))pendingNote('source-disconnect',()=>({nodeId:b.id,sourceHandle:1}));pendingNote('source-disconnect-return',()=>({nodeId:b.id,attemptOrder:order}));}return result;
    };source.disconnect=disconnectSource;return source;
  };
  target.AudioWorkletNode=new Proxy(NativeNode,{construct(Constructor,args){
    if(args[1]!=='knife-audio-transition-l1')return Reflect.construct(Constructor,args);
    active();
    if(args[0]!==context||bindings.length>=(extreme?3:history&&!wet?1:2)){broken('constructor-count');throw Error(error??'audio-source-owner-constructor');}base();
    if(extreme&&bindings.length===2)args[2]={...record(args[2]),processorOptions:{...record(record(args[2])?.processorOptions),normalizerWitness:true,headroomWitness:true}};
    if(offStages&&bindings.length===0)args[2]={...record(args[2]),processorOptions:{...record(record(args[2])?.processorOptions),offStageWitness:true}};
    const opts=record(record(args[2])?.processorOptions);if(!opts||!safe(opts.sourceEpoch)||!opts.sourceEpoch||opts.initial!=='raw'||Object.keys(opts).some(k=>!['sourceEpoch','initial','normalizerWitness',...(offStages&&bindings.length===0?['offStageWitness']:[]),...(extreme&&bindings.length===2?['headroomWitness']:[])].includes(k))||opts.normalizerWitness!==undefined&&typeof opts.normalizerWitness!=='boolean'){broken('constructor-options');throw Error(error??'audio-source-owner-options');}
    const id=bindings.length+1,p=capture(id+1,id,opts.sourceEpoch),key=pending?{sourceKey:sourceKey()}:{},node=/** @type {AudioWorkletNode} */(Reflect.construct(Constructor,args));
    /** @type {Binding} */const binding={id,portId:id,sourceEpoch:opts.sourceEpoch,contextId:1,initial:opts.initial,options:copy(opts),...key,producerId:p.id,node,outputs:new Set(),closed:false};bindings.push(binding);byNode.set(node,binding);note('constructor',{nodeId:id});
    node.connect(p.node,1);
    node.port.addEventListener('message',({data})=>{note('receive',{nodeId:id,portId:id,packet:copy(data)});const packet=record(data);if(id===1&&firstPrepared===null&&packet?.kind==='prepared'&&packet.sourceEpoch===binding.sourceEpoch&&packet.seq===0&&safe(packet.frame))firstPrepared=packet.frame;});node.port.start();
    const post=node.port.postMessage.bind(node.port),close=node.port.close.bind(node.port),connect=node.connect.bind(node),disconnect=node.disconnect.bind(node);
    if(offStages&&id===1)registerA=(packet,endpoint)=>Reflect.apply(post,node.port,[packet,[endpoint]]);
    node.port.postMessage=(...values)=>{
      if(!pending){note('send',{nodeId:id,portId:id,packet:copy(values[0])});return Reflect.apply(post,node.port,values);}
      const sendOrder=pendingNote('send',()=>({nodeId:id,portId:id,packet:copy(values[0])}));
      let result;try{result=Reflect.apply(post,node.port,values);}catch(cause){pendingNote('send-throw',()=>({nodeId:id,portId:id,sendOrder}));throw cause;}
      pendingNote('send-return',()=>({nodeId:id,portId:id,sourceEpoch:binding.sourceEpoch,sendOrder,contextId:1,elementId:1,sourceHandle:1,sources,...sourceKey(),src:video.src,wanted:record(runtime().audio.getReadback(video))?.wanted}));return result;
    };
    node.port.close=()=>{
      const attempt=controlled?pendingNote('port-close-attempt',()=>({nodeId:id})):null;
      try{close();}catch(cause){if(controlled)pendingNote('port-close-throw',()=>({nodeId:id,attemptOrder:attempt}));throw cause;}
      binding.closed=true;note('port-close',{nodeId:id});if(controlled)pendingNote('port-close-return',()=>({nodeId:id,attemptOrder:attempt}));
    };
    node.connect=(...values)=>{const result=Reflect.apply(connect,node,values);if(values[0]!==p.node){binding.outputs.add(values[0]);note('node-connect',{nodeId:id});}return result;};
    /** @param {...unknown} values */
    const disconnectNode=(...values)=>{
      const attempt=controlled?pendingNote('node-disconnect-attempt',()=>({nodeId:id,all:values.length===0})):null;
      let result;try{result=Reflect.apply(disconnect,node,values);}catch(cause){if(controlled)pendingNote('node-disconnect-throw',()=>({nodeId:id,attemptOrder:attempt}));throw cause;}
      if(!values.length)binding.outputs.clear();else binding.outputs.delete(values[0]);note('node-disconnect',{nodeId:id,all:values.length===0});if(controlled)pendingNote('node-disconnect-return',()=>({nodeId:id,attemptOrder:attempt}));return result;
    };node.disconnect=disconnectNode;return node;
  }});
  function cleanupStages(){
    if(!offStages||stageClosed)return;stageClosed=true;if(stageFacts)stageFacts.frozen=true;
    if(registrationTimer!==undefined)target.clearTimeout(registrationTimer);registrationTimer=undefined;
    if(stageChannel){
      for(const port of [stageChannel.port1,stageChannel.port2]){
        try{port.onmessage=null;port.close();}catch(cause){stageCleanupErrors.push(String(cause).slice(0,160));}
      }
    }
    if(stageCleanupErrors.length)broken('off-stage-close');
    rejectRegistration?.(Error(error??'audio-source-owner-stopped'));rejectRegistration=null;
  }
  /** @param {number} aEnd */
  async function registerStages(aEnd){
    active();
    const r=runtime(),b=bindings[0],readback=record(r.audio.getReadback(video)),urls=/** @type {string[]} */(inputPlan?.urls);
    const last=record(ledger.filter(e=>e.type==='receive'&&e.nodeId===1).at(-1)?.packet);
    if(stageFacts||stageClosed||!b||!registerA||bindings.length!==1||sources!==1||b.closed||!sourceConnections.has(1)||!b.outputs.size||context.state!=='running'||document.hidden||r.media.context.documentGeneration!==b.sourceKey?.documentGeneration||r.media.context.routePath!==b.sourceKey?.routePath||r.state?.player?.video!==video||r.selectPlayer?.()?.video!==video||r.mediaCurrent?.()!==true||!r.audio.eligible(video)||video.currentSrc!==urls[0]||video.src!==urls[0]||readback?.state!=='on'||readback.sources!==1||readback.wanted!==true||readback.gain!==1||readback.appliedGain!==1||last?.kind!=='completed'||last.seq!==1||!safe(last.frame)||(Math.ceil(last.frame/(rate/10))+1)*rate/10!==aEnd||![0,1,2].every(id=>(producers.get(id)?.lastFrame??-128)+128>=aEnd))throw Error('audio-source-owner-off-stage-precondition');
    const registration=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
    const targetPacket={kind:'configure',sourceEpoch:b.sourceEpoch,seq:2,wanted:false,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:true,targetDbfs:-20};
    const packet={kind:'off-stage-register',sourceEpoch:b.sourceEpoch,registration,target:targetPacket};
    const binding={nodeId:1,portId:1,sourceEpoch:b.sourceEpoch,endpointId:1,contextId:1,elementId:1,sourceHandle:1,documentGeneration:r.media.context.documentGeneration,routePath:r.media.context.routePath},origin={...binding,aEnd};
    stageFacts={registration,endpointId:1,frozen:false};stageChannel=new target.MessageChannel();
    let acknowledged=false,returned=false,lastRank=-1;
    const stages=['registered','callback','stored','accepted','accepted-post-returned','completed'],seen=new Set();
    /** @param {unknown} value */
    const matchesTarget=value=>{const t=record(value);return !!t&&Object.keys(t).sort().join(',')===Object.keys(targetPacket).sort().join(',')&&Object.entries(targetPacket).every(([k,v])=>k==='eq'?Array.isArray(t.eq)&&t.eq.length===8&&t.eq.every(x=>Object.is(x,0)):Object.is(t[k],v));};
    let resolveRegistration=()=>{};
    const ready=new Promise((resolve,reject)=>{resolveRegistration=()=>resolve(undefined);rejectRegistration=reject;});
    void ready.catch(()=>{});
    stageChannel.port1.onmessage=event=>{
      if(stageFacts?.frozen||stopped||error)return;
      try{
        const receipt=record(event.data),rank=receipt?stages.indexOf(String(receipt.stage)):-1,reply=record(receipt?.reply);
        const keys=receipt?Object.keys(receipt).sort().join(','):'';
        if(!receipt||new TextEncoder().encode(JSON.stringify(receipt)).length>1024||rank<0||rank<=lastRank||seen.has(receipt.stage)||receipt.schema!=='f01-off-stage-receipt-v1'||receipt.registration!==registration||receipt.sourceEpoch!==b.sourceEpoch||receipt.seq!==2||!matchesTarget(receipt.target)||keys!==(rank>=3?'registration,reply,schema,seq,sourceEpoch,stage,target':'registration,schema,seq,sourceEpoch,stage,target')||!returned||runtime()!==r||r.media.context.documentGeneration!==origin.documentGeneration||r.media.context.routePath!==origin.routePath)throw Error('receipt');
        if(rank>0&&(!acknowledged||!ledger.some(e=>e.type==='send'&&e.nodeId===1&&record(e.packet)?.seq===2)))throw Error('unbound-target');
        if(rank>=3&&(!reply||Object.keys(reply).sort().join(',')!=='code,frame,gain,kind,meterEpoch,seq,sourceEpoch'||reply.kind!==(rank===5?'completed':'accepted')||reply.sourceEpoch!==b.sourceEpoch||reply.seq!==2||!safe(reply.frame)||!safe(reply.meterEpoch)||reply.code!==null||reply.gain!==(rank===5?1:null)))throw Error('reply');
        if(pendingNote('off-stage-receive',()=>({...binding,packet:receipt}))===null||error)throw Error('observation');
        lastRank=rank;seen.add(receipt.stage);if(rank===0){acknowledged=true;resolveRegistration();}
      }catch{broken('off-stage-receipt');cleanupStages();}
    };
    stageChannel.port1.start();
    registrationTimer=target.setTimeout(()=>{broken('off-stage-registration-timeout');cleanupStages();},1000);
    try{
      const sendOrder=pendingNote('off-stage-register-send',()=>({...origin,packet,transferEndpointIds:[1]}));
      if(sendOrder===null||error)throw Error(error??'audio-source-owner-off-stage-observation');
      try{registerA(packet,stageChannel.port2);}catch(cause){pendingNote('off-stage-register-throw',()=>({...origin,sendOrder}));broken('off-stage-register');throw cause;}
      returned=true;
      if(pendingNote('off-stage-register-return',()=>({...origin,sendOrder}))===null||error)throw Error(error??'audio-source-owner-off-stage-observation');
      await ready;active();
    }finally{if(registrationTimer!==undefined)target.clearTimeout(registrationTimer);registrationTimer=undefined;rejectRegistration=null;}
  }
  /** @param {number} aEnd */
  function armStimulus(aEnd){
    const r=runtime(),audio=r.audio,binding=bindings[0],original=Object.getOwnPropertyDescriptor(audio,'configure');
    if(stimulus.status!=='UNARMED'||!original||typeof original.value!=='function'||!original.configurable||!binding)throw Error('audio-source-owner-stimulus-arm');
    const b=binding;
    const origin={nodeId:1,portId:1,sourceEpoch:b.sourceEpoch,contextId:1,elementId:1,sourceHandle:1,method:stimulus.method};
    // Only the document/route tuple belongs to this profile, not unrelated runtime context keys.
    const common={...origin,documentGeneration:r.media.context.documentGeneration,routePath:r.media.context.routePath};
    let armed=true;
    const same=(/** @type {PropertyDescriptor|undefined} */ d,/** @type {PropertyDescriptor} */ expected)=>!!d&&d.value===expected.value&&d.writable===expected.writable&&d.enumerable===expected.enumerable&&d.configurable===expected.configurable&&d.get===expected.get&&d.set===expected.set;
    /** @type {PropertyDescriptor} */let installed;
    const restore=()=>{
      if(!armed)return;armed=false;
      try{if(!same(Object.getOwnPropertyDescriptor(audio,'configure'),installed)){broken('stimulus-drift');return;}
        Object.defineProperty(audio,'configure',original);if(!same(Object.getOwnPropertyDescriptor(audio,'configure'),original)){broken('stimulus-restore');return;}
        pendingNote('stimulus-restored',()=>common);
      }catch{broken('stimulus-restore');}
    };
    restoreStimulus=restore;
    /** @this {unknown} @param {...unknown} args */
    function wrapped(...args){
      if(!armed||video.currentSrc!==/** @type {string[]} */(inputPlan?.urls)[1])return Reflect.apply(/** @type {Function} */(original?.value),this,args);
      let snapshot=/** @type {Record<string,unknown>|null} */(null),valid=false;
      try{
        const rb=record(audio.getReadback(video)),url=/** @type {string[]} */(inputPlan?.urls)[1];
        snapshot={...common,...sourceKey(),src:video.src,sources,connected:sourceConnections.has(1),outputs:b.outputs.size>0,closed:b.closed,videoConnected:video.isConnected,selected:r.state?.player?.video===video&&r.selectPlayer?.()?.video===video,mediaCurrent:r.mediaCurrent?.()===true,eligible:audio.eligible(video),hidden:document.hidden,contextState:context.state,readback:rb};
        pendingNote('stimulus-enter',()=>/** @type {Record<string,unknown>} */(snapshot));
        const replies=ledger.filter(e=>e.type==='receive'&&e.nodeId===1),sends=ledger.filter(e=>e.type==='send'),last=replies.at(-1),done=record(last?.packet),aWindowEnd=done?.kind==='completed'&&safe(done.frame)?(Math.ceil(done.frame/(rate/10))+1)*rate/10:-1;
        valid=!error&&runtime()===r&&r.audio===audio&&snapshot.currentSrc===url&&snapshot.src===url&&snapshot.documentGeneration===b.sourceKey?.documentGeneration&&snapshot.routePath===b.sourceKey?.routePath&&snapshot.connected===true&&snapshot.outputs===true&&snapshot.closed===false&&snapshot.videoConnected===true&&snapshot.selected===true&&snapshot.mediaCurrent===true&&snapshot.eligible===true&&snapshot.hidden===false&&snapshot.contextState==='running'&&bindings.length===1&&sources===1&&rb?.state==='on'&&rb.wanted===true&&rb.gain===1&&rb.appliedGain===1&&rb.sources===1&&r.config.audioGain===1&&r.config.normalizerEnabled===false&&r.config.compressorEnabled===true&&r.config.eqEnabled===false&&aWindowEnd===aEnd&&[0,1,2].every(id=>(producers.get(id)?.lastFrame??-128)+128>=aEnd)&&sends.length===1&&record(sends[0]?.packet)?.seq===1&&replies.length===3&&replies.every((e,i)=>record(e.packet)?.kind===['prepared','accepted','completed'][i]&&record(e.packet)?.seq===(i?1:0))&&!ledger.some(e=>['source-disconnect-attempt','node-disconnect-attempt','port-close-attempt'].includes(String(e.type)));
      }catch{broken('stimulus-observation');}
      if(!valid)stimulus.status='NOT_OBSERVED';restore();
      if(valid&&!error){
        try{
          if(pendingNote('suspend-call',()=>common)===null||error)throw Error('audio-source-owner-stimulus-observation');
          const start=ledger.length;audio.suspend(video);
          pendingNote('suspend-return',()=>common);const during=ledger.slice(start),sends=during.filter(e=>e.type==='send'),receipts=during.filter(e=>e.type==='send-return'),sent=record(sends[0]?.packet),returned=receipts[0];
          if(error||sends.length!==1||receipts.length!==1||sends[0]?.nodeId!==1||sends[0]?.portId!==1||sent?.kind!=='configure'||sent.sourceEpoch!==b.sourceEpoch||sent.seq!==2||sent.wanted!==false||returned?.sendOrder!==sends[0]?.order||returned?.order!==Number(sends[0]?.order)+1||returned?.wanted!==true||returned?.currentSrc!==snapshot?.currentSrc||returned?.src!==snapshot?.src||during.some(e=>e.type==='receive'||String(e.type).includes('disconnect')||String(e.type).startsWith('port-close'))||bindings.length!==1||b.closed||!sourceConnections.has(1)||!b.outputs.size)broken('stimulus-flight');
          else stimulus.status='APPLIED';
        }catch{broken('stimulus-suspend');}
      }else if(!error)pendingNote('stimulus-missed',()=>common);
      pendingNote('configure-call',()=>common);
      try{const result=Reflect.apply(/** @type {Function} */(original?.value),this,args);pendingNote('configure-return',()=>common);return result;}
      catch(cause){broken('stimulus-configure');pendingNote('configure-throw',()=>common);throw cause;}
    }
    installed={...original,value:wrapped};Object.defineProperty(audio,'configure',installed);stimulus.status='ARMED';pendingNote('stimulus-arm',()=>({...common,aEnd}));
  }
  function sourceValid(){
    if(!inputPlan)return;const urls=/** @type {string[]} */(inputPlan.urls);
    if(history&&!urls.length)return;
    const previousWhileLoading=loading&&(history?slot>0&&video.currentSrc===urls[slot-1]:slot===1&&video.currentSrc===urls[0]);
    if(video!==document.querySelector('video')||video.src!==urls[slot]||video.currentSrc&&video.currentSrc!==urls[slot]&&!previousWhileLoading)broken('source-changed');
    if(video.muted||video.volume!==1||video.loop||video.ended||video.playbackRate!==1||video.paused&&!loading&&!(history&&historyPaused))broken('media-state');
  }
  /** @param {string} url */
  const loadVideo=async url=>{
    active();loading=true;
    let cleanup=()=>{};
    try{
      const loaded=new Promise((resolve,reject)=>{
        const done=()=>resolve(undefined),failed=()=>reject(Error('audio-source-owner-media-error'));
        cleanup=()=>{video.removeEventListener('loadeddata',done);video.removeEventListener('error',failed);};
        cancelLoad=()=>reject(Error('audio-source-owner-stopped'));
        video.addEventListener('loadeddata',done,{once:true});video.addEventListener('error',failed,{once:true});
      });
      video.loop=false;video.muted=false;video.volume=1;video.src=url;await loaded;active();
      if(video.src!==url||video.currentSrc!==url)throw Error('audio-source-owner-loaded-source');if(!history)await video.play();active();
    }finally{cleanup();cancelLoad=null;loading=false;}
  };
  /** @param {number} inputDbfs @param {boolean} dc */
  function wave(inputDbfs,dc){
    const length=rate*90,bytes=new Uint8Array(44+length*8),view=new DataView(bytes.buffer),text=(/** @type {number} */n,/** @type {string} */v)=>{for(let i=0;i<v.length;i++)view.setUint8(n+i,v.charCodeAt(i));};
    text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,3,true);view.setUint16(22,2,true);view.setUint32(24,rate,true);view.setUint32(28,rate*8,true);view.setUint16(32,8,true);view.setUint16(34,32,true);text(36,'data');view.setUint32(40,length*8,true);
    const level=10**(inputDbfs/20),amplitude=Math.SQRT2*level;for(let n=0;n<length;n++){const value=dc?level:Math.sin(2*Math.PI*1000*n/rate+.37)*amplitude;view.setFloat32(44+n*8,value,true);view.setFloat32(48+n*8,value,true);}return bytes;
  }
  /** @param {number} stage */
  async function historyLoad(stage){
    active();if(!inputPlan)throw Error('audio-source-owner-input');loading=true;historyPaused=true;video.pause();
    try{
      const inputDbfs=stage===0?-40:stage===1?0:stage===2?20*Math.log10(.99):-6,bytes=wave(inputDbfs,stage===1||stage===2),digest=await crypto.subtle.digest('SHA-256',bytes);active();
      const sha256=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})),urls=/** @type {string[]} */(inputPlan.urls),inputs=/** @type {Record<string,unknown>[]} */(inputPlan.inputs),fromUrl=urls.at(-1)??null;
      urls.push(url);inputs.push({stage,url,sha256,frequency:1000,inputDbfs,pattern:stage===1||stage===2?'dc':'stereo',phase:.37,channels:2,frames:rate*90});slot=stage;note('history-signal',{stage,fromUrl,toUrl:url,sha256,frame:Math.round(context.currentTime*rate),wall:performance.now()});
      if(fromUrl)URL.revokeObjectURL(fromUrl);await loadVideo(url);active();note('history-loaded',{stage,url,frame:Math.round(context.currentTime*rate),wall:performance.now()});return copy(inputPlan);
    }finally{loading=false;}
  }
  const state=()=>{sourceValid();return {...(history?{profile:options.profile,audioTime:context.currentTime,slot}:pending?{profile:options.profile,...(controlled?{stimulus:{...stimulus}}:{}),...(offStages?{offStages:copy(stageFacts),...(stageCleanupErrors.length?{offStageCleanupErrors:stageCleanupErrors.slice()}:{})}:{})}:{}),sources,contextId:1,elementId:1,error,firstFailure:copy(firstFailure),inputPlan:copy(inputPlan),switchOrder,moduleLoads:moduleLoads.slice(),nodes:bindings.map(({node,outputs,closed,...n})=>copy(n)),producers:[...producers.values()].map(({node,queue,received,lastFrame,...p})=>copy(p)),ledger:copy(ledger),connected:bindings.filter(b=>sourceConnections.has(b.id)&&b.outputs.size&&!b.closed).map(b=>b.id),currentSrc:video.currentSrc,paused:video.paused,contextState:context.state,hidden:document.hidden,readback:copy(runtime().audio.getReadback(video))};};
  /** @param {Record<string,unknown>} input */
  async function performAction(input){
    if(input.kind==='facts')return state();
    if(history&&input.kind==='history-configure'){
      active();sourceValid();active();const enabled=historyRequests===0;if(!inputPlan||input.enabled!==enabled||historyRequests>=4||slot!==Math.max(0,historyRequests-1))throw Error('audio-source-owner-history-configure');
      const frame=Math.round(context.currentTime*rate);note('history-request',{index:historyRequests,stage:slot,enabled,frame,wall:performance.now()});
      const r=runtime();Object.assign(r.config,{normalizerEnabled:false,normalizerTargetDbfs:-20,compressorEnabled:false,eqEnabled:false,...Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map(f=>['eq'+f,0]))});r.audio.configure();r.audio.setGain(video,1);const status=await r.audio.setEnabled(video,enabled);active();if(status!==(enabled?'on':'off'))throw Error('audio-source-owner-history-state');await video.play();active();historyPaused=false;historyRequests++;
      note('history-return',{index:historyRequests-1,stage:slot,enabled,frame:Math.round(context.currentTime*rate),wall:performance.now(),status});return {frame,status};
    }
    if(wet&&input.kind==='history-wet'){
      active();sourceValid();active();const before=record(runtime().audio.getReadback(video));
      if(historyWet||historyRequests!==4||slot!==2||!historyCaptures.has(2)||bindings.length!==1||sources!==1||before?.state!=='off'||before.wanted!==false||before.gain!==1)throw Error('audio-source-owner-history-wet');
      historyWet=true;const frame=Math.round(context.currentTime*rate);note('history-wet-request',{frame,wall:performance.now()});
      const r=runtime();Object.assign(r.config,{compressorThreshold:0,compressorKnee:0,compressorRatio:1});r.audio.configure();r.audio.setGain(video,2);const status=await r.audio.setEnabled(video,true);active();if(status!=='on')throw Error('audio-source-owner-history-state');
      note('history-wet-return',{frame:Math.round(context.currentTime*rate),wall:performance.now(),status});return {frame,status};
    }
    if(extreme&&input.kind==='history-extreme-load'){
      active();sourceValid();active();const before=record(runtime().audio.getReadback(video));
      if(extremeLoaded||!historyWet||!historyCaptures.has(3)||slot!==2||bindings.length!==2||sources!==1||before?.state!=='on'||before.wanted!==true||before.gain!==2)throw Error('audio-source-owner-extreme-order');
      extremeLoaded=true;return historyLoad(3);
    }
    if(extreme&&input.kind==='history-extreme-configure'){
      active();sourceValid();active();if(!extremeLoaded||extremeConfigured||slot!==3)throw Error('audio-source-owner-extreme-configure');extremeConfigured=true;
      const frame=Math.round(context.currentTime*rate);note('history-extreme-request',{frame,wall:performance.now()});const r=runtime();
      Object.assign(r.config,{...Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map(f=>['eq'+f,6])),eqEnabled:true,normalizerEnabled:true,normalizerTargetDbfs:-12,compressorEnabled:true,compressorThreshold:0,compressorKnee:0,compressorRatio:1});r.audio.configure();r.audio.setGain(video,2);const status=await r.audio.setEnabled(video,true);active();if(status!=='on')throw Error('audio-source-owner-history-state');await video.play();active();historyPaused=false;
      note('history-extreme-return',{frame:Math.round(context.currentTime*rate),wall:performance.now(),status});return {frame,status};
    }
    if(history&&input.kind==='history-next'){
      active();sourceValid();active();const r=record(runtime().audio.getReadback(video));if(!inputPlan||input.stage!==slot+1||slot>=2||bindings.length!==1||sources!==1||r?.state!=='off'||r.wanted!==false||r.gain!==1||historyRequests!==slot+2||slot===1&&!historyCaptures.has(1))throw Error('audio-source-owner-history-order');return historyLoad(slot+1);
    }
    if(history&&input.kind==='history-capture'){
      active();sourceValid();active();if(slot<1||(extremeLoaded?slot!==3||!extremeConfigured:historyRequests!==slot+2)||historyCaptures.has(extremeConfigured?4:historyWet?3:slot))throw Error('audio-source-owner-history-capture');historyCaptures.add(extremeConfigured?4:historyWet?3:slot);
      const captureStage=extremeConfigured?4:historyWet?3:slot;
      const end=(historyRing.at(-1)?.frame??-128)+128,start=end-rate,output=[new Float32Array(rate),new Float32Array(rate)];let covered=0;
      if(start<0)throw Error('audio-source-owner-history-unformed');
      for(const chunk of historyRing){const a=Math.max(start,chunk.frame),b=Math.min(end,chunk.frame+128);if(b<=a)continue;if(a!==start+covered||chunk.samples.length!==2)throw Error('audio-source-owner-history-unformed');for(let c=0;c<2;c++)output[c]?.set(chunk.samples[c]?.subarray(a-chunk.frame,b-chunk.frame)??[],a-start);covered+=b-a;}
      if(covered!==rate)throw Error('audio-source-owner-history-unformed');const tail=historyRing.at(-1);note('history-capture',{stage:captureStage,start,end,producerId:0,lastReceived:tail?.received,producerSequence:tail?.sequence,packetFrame:tail?.frame,frame:Math.round(context.currentTime*rate),wall:performance.now()});return {rate,start,end,channels:output.map(c=>Array.from(c))};
    }
    if(input.kind==='prepare'){
      active();if(inputPlan)throw Error('audio-source-owner-already-prepared');
      const spec=copy(record(input.spec));if(!spec||spec.id!==rate+(offStages?'/source-owner/off-stages':controlled?'/source-owner/suspend-rebind':pending?'/source-owner/pending-off':history?extreme?'/source-owner/extreme-prefix':wet?'/source-owner/wet-prefix':'/source-owner/dry-prefix':'/source-owner/stable')||spec.sampleRate!==rate||spec.frequency!==1000||spec.inputDbfs!==(history?-40:-24)||spec.pattern!=='stereo'||spec.phase!==.37||spec.seconds!==90||spec.gain!==1||spec.normalizer!==false||spec.compressor!==!history||spec.equalizer!==false||Object.keys(spec).length!==11)throw Error('audio-source-owner-input');
      if(history){inputPlan={spec:copy(spec),urls:[],inputs:[],sameBlob:false};const r=runtime();Object.assign(r.config,{audioDefault:false,audioGain:1,normalizerEnabled:false,normalizerTargetDbfs:-20,compressorEnabled:false,eqEnabled:false,...Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map(f=>['eq'+f,0]))});r.audio.setGain(video,1);r.audio.configure();await r.audio.setEnabled(video,false);return historyLoad(0);}
      const bytes=wave(-24,false);
      const digest=await crypto.subtle.digest('SHA-256',bytes);active();const sourceSha256=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),blob=new Blob([bytes],{type:'audio/wav'}),urls=[URL.createObjectURL(blob),URL.createObjectURL(blob)];
      inputPlan={spec:copy(spec),urls,sourceSha256,sameBlob:true,...(controlled?{formationMethod:stimulus.method}:{})};const r=runtime();Object.assign(r.config,{audioDefault:false,audioGain:1,normalizerEnabled:false,normalizerTargetDbfs:-20,compressorEnabled:true,eqEnabled:false,...Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map(x=>['eq'+x,0]))});r.audio.setGain(video,1);r.audio.configure();await r.audio.setEnabled(video,false);await loadVideo(/** @type {string} */(urls[0]));return copy(inputPlan);
    }
    if(input.kind==='switch'){
      if(!inputPlan||slot!==0||bindings.length!==1||sources!==1||!safe(input.aEnd))throw Error('audio-source-owner-switch');sourceValid();
      if(offStages){await registerStages(input.aEnd);active();sourceValid();}
      const urls=/** @type {string[]} */(inputPlan.urls);note('switch',{fromNodeId:1,sourceHandle:1,fromUrl:urls[0],toUrl:urls[1],aEnd:input.aEnd});switchOrder=ledger.length;if(controlled)armStimulus(input.aEnd);slot=1;
      await loadVideo(/** @type {string} */(urls[1]));active();runtime().audio.configure();note('apply');return state();
    }
    if(input.kind==='drain'){
      if(history&&input.failure!==true&&!stopped)sourceValid();
      if(error&&input.failure!==true)throw Error(error);if(input.failure===true&&!error&&!stopped)throw Error('audio-source-owner-failure-mode');const cursors=input.cursors;if(!Array.isArray(cursors)||cursors.length!==(extreme?5:4)||cursors.some(x=>!safe(x)))throw Error('audio-source-owner-cursors');
      /** @type {Record<string,unknown>[]} */const out=[];
      for(const p of producers.values()){
        const after=Number(cursors[p.id]);p.queue=p.queue.filter(r=>r.received>after);if(!p.queue.length)continue;if(p.queue[0]?.received!==after+1)throw Error('audio-source-owner-collection-gap');
        const limit=Math.floor(rate/10/128),eligible=p.queue.filter(r=>input.endFrame===undefined||r.frame<Number(input.endFrame)).slice(0,limit);if(!eligible.length)continue;
        let offset=0;while(offset<eligible.length){const first=/** @type {Chunk} */(eligible[offset]),empty=first.samples.length===0;let finish=offset+1;while(finish<eligible.length&&(eligible[finish]?.samples.length===0)===empty)finish++;const run=eligible.slice(offset,finish),last=/** @type {Chunk} */(run.at(-1));
          const row={producerId:p.id,portId:p.portId,nodeId:p.nodeId,sourceEpoch:p.sourceEpoch,kind:empty?'empty':'pcm',packetFrame:first.frame,start:first.frame,end:last.frame+128,firstSequence:first.sequence,lastSequence:last.sequence,firstReceived:first.received,lastReceived:last.received,firstOffset:0,lastOffset:128,channels:empty?0:p.channels};
          if(empty)out.push(row);else{const bytes=new Uint8Array(run.length*128*p.channels*4),view=new DataView(bytes.buffer);let n=0;for(const packet of run)for(let frame=0;frame<128;frame++)for(let c=0;c<p.channels;c++)view.setFloat32(n++*4,/** @type {number} */(packet.samples[c]?.[frame]),true);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));out.push({...row,base64:btoa(binary)});}offset=finish;
        }
      }return out;
    }
    if(input.kind==='stop'&&offStages){
      if(stageFacts)stageFacts.frozen=true;let snapshot;
      try{restoreStimulus();snapshot=state();}catch(cause){broken('off-stage-snapshot',{cause:String(cause).slice(0,160)});throw cause;}finally{cleanupStages();restoreStimulus();stopped=true;cancelLoad?.();}
      return {...snapshot,error,firstFailure:copy(firstFailure),offStages:copy(stageFacts),...(stageCleanupErrors.length?{offStageCleanupErrors:stageCleanupErrors.slice()}:{})};
    }
    if(input.kind==='stop'){try{if(controlled){if(stimulus.status==='ARMED')stimulus.status='NOT_OBSERVED';restoreStimulus();}return state();}finally{restoreStimulus();stopped=true;cancelLoad?.();}}
    throw Error('audio-source-owner-action');
  }
  /** @param {Record<string,unknown>} input */
  async function action(input){try{return await performAction(input);}catch(cause){if(offStages){broken('off-stage-action');cleanupStages();}restoreStimulus();throw cause;}}
  Object.defineProperty(target,Symbol.for('cheese-knife.source-owner-probe.v1'),{value:{action},configurable:true});
}

/** @param {Record<string,unknown>} input */
export function callSourceOwnerProbe(input){
  const probe=Reflect.get(window,Symbol.for('cheese-knife.source-owner-probe.v1'));
  if(!probe||typeof probe.action!=='function')throw Error('audio-source-owner-probe-missing');return probe.action(input);
}
