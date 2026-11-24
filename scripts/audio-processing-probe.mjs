// 합성 오디오 시험에서 page.evaluate(installProcessingProbe, options)로 설치한 뒤
// page.evaluate(callProcessingProbe, action)으로 관측을 요청하고 결과를 읽는다.
/** @typedef {'stereo'|'mono'|'antiphase'|'left'|'right'|'silence'|'noise'|'bursts'|'dc'|'tone-silence'} SignalPattern */
/** @typedef {{kind:'bootstrap'}|{kind:'signal',frequency:number,inputDbfs:number,pattern:SignalPattern,phase?:number,durationSeconds?:number}|{kind:'configure',config:Record<string,unknown>,gain:number,enabled:boolean}|{kind:'capture',seconds:number,endFrame?:number}|{kind:'product-capture',startFrame?:number,endFrame?:number,timing?:boolean}|{kind:'l1-capture'}|{kind:'l1-partial'}|{kind:'fft-buffer'}|{kind:'freeze-normalizer',endFrame:number,waitForReady?:true}|{kind:'master-seal',endFrame:number}|{kind:'facts',fullOracle?:boolean}|{kind:'response',frequency:number}|{kind:'reset-events',minimumFrame?:number,tail?:true}|{kind:'analysis-error',enabled:boolean}|{kind:'stall',milliseconds:number}|{kind:'rapid-master',milliseconds:0|10|15|25|36|41|46,startPhaseMs:0|2|5}|{kind:'retired-ticks'}|{kind:'video',muted:boolean,volume:number}} ProcessingAction */
/** @typedef {{action:(input:ProcessingAction)=>Promise<unknown>}} ProcessingProbe */
/** @typedef {{config:Record<string,unknown>,mediaRequestId:string,media:{context:Record<string,unknown>},audio:{configure:()=>void,setEnabled:(video:HTMLVideoElement,value:boolean)=>Promise<string>,getState:(video:HTMLVideoElement)=>string,setGain:(video:HTMLVideoElement,value:number)=>number,getReadback:(video:HTMLVideoElement)=>unknown}}} ProbeRuntime */
/** @typedef {{frame:number,samples:Float32Array[],producerId?:number,producerSequence?:number,receivedSequence?:number}} CaptureChunk */

/** 검증 페이지 안에만 설치하는 계측기다.
 * @param {number|{sampleRate:48000,installed:true}|{sampleRate:number,productObservation:true,oracleEvidence?:boolean,motionEvidence?:boolean,framePathEvidence?:boolean,normalizerWitness?:boolean,headroomWitness?:boolean,fftBufferWitness?:boolean,normalizerControl?:boolean,normalizerSignal?:boolean,retainSignal?:boolean,equalizerComponent?:boolean,sourceStartWitness?:boolean,masterWitness?:boolean}} options
 */
export async function installProcessingProbe(options){
  const installed=typeof options==='object'&&'installed'in options&&options.installed===true;
  const product=typeof options==='object'&&'productObservation'in options&&options.productObservation===true;
  if(typeof options==='object'&&'oracleEvidence'in options&&(!product||installed||typeof options.oracleEvidence!=='boolean'))throw new Error('audio-probe-oracle');
  const oracle=typeof options==='object'&&'oracleEvidence'in options&&options.oracleEvidence===true;
  if(typeof options==='object'&&'normalizerWitness'in options&&(!product||installed||typeof options.normalizerWitness!=='boolean'||options.normalizerWitness&&!oracle))throw new Error('audio-probe-normalizer-witness');
  const normalizerWitness=typeof options==='object'&&'normalizerWitness'in options&&options.normalizerWitness===true;
  if(typeof options==='object'&&'headroomWitness'in options&&(typeof options.headroomWitness!=='boolean'||options.headroomWitness&&(!normalizerWitness||!oracle||!product||installed)))throw Error('audio-probe-headroom-witness');
  const headroomWitness=typeof options==='object'&&'headroomWitness'in options&&options.headroomWitness===true;
  if(typeof options==='object'&&'fftBufferWitness'in options&&(typeof options.fftBufferWitness!=='boolean'||options.fftBufferWitness&&(!headroomWitness||'normalizerControl'in options&&options.normalizerControl)))throw Error('audio-probe-fft-buffer');
  const fftBufferWitness=typeof options==='object'&&'fftBufferWitness'in options&&options.fftBufferWitness===true;
  if(fftBufferWitness&&new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)throw Error('audio-probe-fft-buffer-endian');
  let headroomWitnessSelected=false;
  if(typeof options==='object'&&'normalizerControl'in options&&(typeof options.normalizerControl!=='boolean'||options.normalizerControl&&(!product||!normalizerWitness||!oracle||installed)))throw new Error('audio-probe-normalizer-control');
  const normalizerControl=typeof options==='object'&&'normalizerControl'in options&&options.normalizerControl===true;
  if(typeof options==='object'&&'normalizerSignal'in options&&(typeof options.normalizerSignal!=='boolean'||options.normalizerSignal&&!normalizerControl))throw new Error('audio-probe-normalizer-signal');
  const normalizerSignal=typeof options==='object'&&'normalizerSignal'in options&&options.normalizerSignal===true;
  let recordingFrozen=false;
  /** @type {Record<string,unknown>|null} */let frozenFacts=null;
  /** @type {ReturnType<typeof controlStamp>|null} */let frozenAt=null;
  /** @type {number|null} */let signalEndFrame=null;
  let normalizerWitnessSelected=false;
  if(typeof options==='object'&&'equalizerComponent'in options&&(!product||installed||typeof options.equalizerComponent!=='boolean'||options.equalizerComponent&&oracle))throw new Error('audio-probe-equalizer-component');
  const equalizerComponent=typeof options==='object'&&'equalizerComponent'in options&&options.equalizerComponent===true;
  if(typeof options==='object'&&'motionEvidence'in options&&(!product||installed||typeof options.motionEvidence!=='boolean'||options.motionEvidence&&!oracle))throw new Error('audio-probe-motion');
  const motion=typeof options==='object'&&'motionEvidence'in options&&options.motionEvidence===true;
  if(typeof options==='object'&&'framePathEvidence'in options&&(!product||installed||typeof options.framePathEvidence!=='boolean'||options.framePathEvidence&&(!oracle||!motion)))throw new Error('audio-probe-frame-path');
  const framePath=typeof options==='object'&&'framePathEvidence'in options&&options.framePathEvidence===true;
  const observed=installed||product,sampleRate=typeof options==='number'?options:options.sampleRate;
  if(typeof options==='object'&&'sourceStartWitness'in options&&(typeof options.sourceStartWitness!=='boolean'||options.sourceStartWitness&&(!normalizerWitness||!oracle||sampleRate!==44100||normalizerControl||motion||headroomWitness)))throw Error('audio-probe-source-start');
  const sourceStartWitness=typeof options==='object'&&'sourceStartWitness'in options&&options.sourceStartWitness===true;
  if(![44100,48000,96000].includes(sampleRate))throw new Error('audio-probe-rate');
  if(typeof options==='object'&&'retainSignal'in options&&(typeof options.retainSignal!=='boolean'||options.retainSignal&&(!normalizerSignal||sampleRate!==44100)))throw Error('audio-probe-retain-signal');
  const retainSignal=typeof options==='object'&&'retainSignal'in options&&options.retainSignal===true;
  if(typeof options==='object'&&'masterWitness'in options&&(typeof options.masterWitness!=='boolean'||options.masterWitness&&(!product||installed||oracle||motion||framePath||normalizerWitness||headroomWitness||fftBufferWitness||normalizerControl||normalizerSignal||retainSignal||equalizerComponent||sourceStartWitness)))throw Error('audio-probe-master-witness');
  const masterWitness=typeof options==='object'&&'masterWitness'in options&&options.masterWitness===true;
  const target=/** @type {Window & typeof globalThis & {normalizeConfig:(value:Record<string,unknown>)=>Record<string,unknown>,KnifeMediaProfiles:{projectGlobalAudio:(value:Record<string,unknown>)=>Record<string,unknown>}}} */(window);
  const context=new AudioContext({sampleRate}),Native=target.AudioContext;
  if(context.sampleRate!==sampleRate)throw new Error('audio-probe-native-rate');
  // 인스턴스별 진단 훅을 설치하기 전에 브라우저 원본 진입점을 보관한다.
  const masterNative=masterWitness?{
    factories:Object.fromEntries(['createGain','createDelay','createDynamicsCompressor','createWaveShaper','createChannelSplitter','createMediaElementSource'].map(name=>[name,Reflect.get(context,name)])),
    node:Object.fromEntries(['connect','disconnect'].map(name=>[name,Object.getOwnPropertyDescriptor(target.AudioNode.prototype,name)])),
    param:Object.fromEntries(['value','automationRate','setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime','setTargetAtTime','setValueCurveAtTime','cancelScheduledValues','cancelAndHoldAtTime'].map(name=>[name,Object.getOwnPropertyDescriptor(target.AudioParam.prototype,name)])),
    worklet:target.AudioWorkletNode
  }:null;
  /** @type {CaptureChunk[]} */let chunks=[];
  /** @type {CaptureChunk[]} */const echoChunks=[];
  /** @type {CaptureChunk[]} */const controlChunks=[];
  /** @type {CaptureChunk[]} */const componentChunks=[];
  const streamRows=[chunks,echoChunks,controlChunks,...(equalizerComponent?[componentChunks]:[])],streamCounts=equalizerComponent?[2,2,5,2]:[2,2,5];
  /** @type {CaptureChunk[][]} */const retainedRows=[[],[],[]];
  let retainedBytes=0,retainedError='';
  const retention=()=>({bytes:retainedBytes,cap:32*1024*1024,error:retainedError});
  // 이 신호만 전체 이력이 필요하므로 실시간 버퍼가 검증한 패킷을 함께 보관한다.
  /** @param {number} index @param {CaptureChunk} chunk */
  const retainChunk=(index,chunk)=>{
    if(!retainSignal||recordingFrozen||retainedError||sourceFrame===null||chunk.frame<Math.ceil(sourceFrame/128)*128)return;
    if(streamError||invalidFrames){retainedError=streamError||'audio-retained-nonfinite';return;}
    const rows=retainedRows[index];if(!rows)throw Error('audio-retained-stream');
    const previous=rows.at(-1);if(previous&&chunk.frame!==previous.frame+128){retainedError='audio-retained-gap';return;}
    if(chunk.frame+128>Math.ceil((sourceFrame+sampleRate*20)/128)*128){retainedError='audio-retained-history-bound';return;}
    const bytes=chunk.samples.length*128*4;
    if(retainedBytes+bytes>32*1024*1024){retainedError='audio-retained-cap';return;}
    rows.push(chunk);retainedBytes+=bytes;
  };
  /** @type {unknown[]} */const replies=[];
  /** @type {unknown[]} */const commands=[];
  /** @type {string[]} */const moduleLoads=[];
  const addModule=context.audioWorklet.addModule.bind(context.audioWorklet);
  context.audioWorklet.addModule=async(url,options)=>{moduleLoads.push(String(url));return addModule(url,options);};
  let l1Nodes=0,streamError='',signalError='';
  /** @type {{frequency:number,inputDbfs:number,phase:number,channels:number,durationSeconds:number,frames:number,loop:false,pattern?:SignalPattern}|null} */let signal=null;
  /** @type {HTMLVideoElement|null} */let signalVideo=null;
  const meterDiagnostics={sent:0,received:0,statuses:/** @type {Record<string,number>} */({}),firstFrame:/** @type {number|null} */(null),lastFrame:/** @type {number|null} */(null),firstSeq:/** @type {number|null} */(null),lastSeq:/** @type {number|null} */(null),fullPacketsRetained:false};
  let meterEpoch=-1,sentSeq=0,sentEpoch=-1,sourceEpoch=0;
  /** @param {unknown} value @returns {value is number} */
  const safe=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
  /** @param {unknown} raw @returns {raw is Record<string,unknown>} */
  const record=raw=>!!raw&&typeof raw==='object'&&!Array.isArray(raw);
  /** @param {Record<string,unknown>} value @param {string} names */
  const keys=(value,names)=>Object.keys(value).sort().join(',')===names;
  /** @param {unknown} value @param {number} low @param {number} high @returns {value is number} */
  const range=(value,low,high)=>typeof value==='number'&&Number.isFinite(value)&&value>=low&&value<=high;
  /** @param {Record<string,unknown>} raw */
  const applicationValid=raw=>{
    const a=raw.application;
    return a===null||record(a)&&keys(a,'commandSeq,end,frame,fromDb,meterEpoch,meterSeq,mode,sourceEpoch,start,toDb')&&
      a.sourceEpoch===raw.sourceEpoch&&a.meterEpoch===raw.meterEpoch&&a.meterSeq===raw.seq&&a.frame===raw.frame&&safe(a.commandSeq)&&a.commandSeq>0&&
      a.mode===raw.code&&['hold','warmup','ramp','error'].includes(String(a.mode))&&range(a.fromDb,-12.0001,6.0001)&&range(a.toDb,-12.0001,6.0001)&&
      a.start===Number(raw.frame)/sampleRate&&range(a.end,Number(a.start),Number.MAX_VALUE);
  };
  /** @param {Record<string,unknown>} raw */
  const headroomValid=raw=>{
    const h=raw.renderHeadroom;
    return h===null||record(h)&&keys(h,'commandSeq,endFrame,eq,headroom,sourceEpoch,startFrame')&&h.sourceEpoch===raw.sourceEpoch&&safe(h.commandSeq)&&h.commandSeq>0&&h.startFrame===raw.frame&&safe(h.endFrame)&&h.endFrame>Number(h.startFrame)&&h.endFrame<=Number(h.startFrame)+1024&&Array.isArray(h.eq)&&h.eq.length===8&&h.eq.every(v=>range(v,-6,6))&&range(h.headroom,Number.MIN_VALUE,1);
  };
  /** @param {Record<string,unknown>} raw */
  const receiveKeys=raw=>raw.kind==='meter-accepted'&&normalizerWitness
    ? keys(raw,headroomWitness?'application,code,frame,gain,kind,meterEpoch,renderHeadroom,seq,sourceEpoch':'application,code,frame,gain,kind,meterEpoch,seq,sourceEpoch')&&applicationValid(raw)&&(!headroomWitness||headroomValid(raw))
    : keys(raw,'code,frame,gain,kind,meterEpoch,seq,sourceEpoch');
  const schedule={parameter:'frameTimeline',automationRate:'a-rate',startTime:0,startValue:0,endTime:16777215/sampleRate,endValue:16777215,available:true,reason:/** @type {string|null} */(null),nodesScheduled:0,
    originGuard:{before:{state:context.state,currentTime:context.currentTime},after:{state:context.state,currentTime:context.currentTime}}};
  if(motion){schedule.available=false;schedule.reason='raw-motion-only';}
  const motionSchedule={parameter:'frameTimeline',automationRate:'a-rate',startValue:0,endValue:16777215,requests:/** @type {{producerId:number,role:string,before:{state:string,currentTime:number},after:{state:string,currentTime:number},startTime:number,endTime:number,requested:boolean,reason:string|null}[]} */([])};
  /** @type {Record<string,Record<string,unknown>>} */const latestMotion={};
  /** @type {Record<string,Record<string,unknown>>} */const previousMotion={};
  /** @type {{role:string,previous:Record<string,unknown>|null,current:Record<string,unknown>,status:string,clockOrigin:string}|null} */let motionFailure=null;
  /** @type {Record<string,Record<string,unknown>>} */const latestPath={};
  /** @type {Record<string,Record<string,unknown>>} */const previousPath={};
  /** @type {{role:string,previous:Record<string,unknown>|null,current:Record<string,unknown>}|null} */let pathFailure=null;
  const initial={available:false,reason:/** @type {string|null} */('initial-options'),sourceEpoch:/** @type {number|null} */(null),initial:/** @type {string|null} */(null)};
  // 이 설정에서 만든 노드와 파라미터만 등록해 다른 그래프의 호출이 증거에 섞이지 않게 한다.
  /** @type {WeakMap<object,string>} */const masterIds=new WeakMap();
  /** @type {Map<string,{object:AudioNode,id:string,kind:string,contextId:string,paramId?:string}>} */const masterObjects=new Map();
  /** @typedef {{status:string,value:number|AutomationRate|null,order:number|null}} MasterParamWrite */
  /** @type {{nodeId:string,paramId:string,base:MasterParamWrite,rate:MasterParamWrite,invalid:boolean,reason:string|null}[]} */
  const masterCandidates=Array.from({length:8},(_,i)=>({nodeId:`G${i}`,paramId:`P${i}`,base:{status:'not-attempted',value:null,order:null},rate:{status:'not-attempted',value:null,order:null},invalid:false,reason:null}));
  /** @type {[string,string,number,number][]} */
  const masterExpected=[['S0','D0',0,0],['D0','G0',0,0],['G0','G3',0,0],['G3','PROGRAM',0,0],['L1','C0',0,0],['L1','D1',0,0],['C0','G5',0,0],['D1','G4',0,0],['G5','G6',0,0],['G4','G6',0,0],['G6','G7',0,0],['G7','G2',0,0],['G2','H0',0,0],['H0','G1',0,0],['G1','PROGRAM',0,0],['L1','T5',1,0],['T5','P0',0,0],['T5','P1',1,0],['L1','CONTROL',1,0]];
  const masterEdges=masterExpected.map(([from,to,output,input])=>({from,to,output,input,status:'not-attempted',order:/** @type {number|null} */(null)}));
  const masterState={
    schema:'f01-master-binding-v1',available:true,reason:/** @type {string|null} */(null),
    initial:{sourceEpoch:/** @type {number|null} */(null),initial:/** @type {string|null} */(null),contextId:'CONTEXT',portId:'PORT',nodeId:'L1'},
    cursor:0,pending:0,sealed:false,endFrame:/** @type {number|null} */(null)
  };
  /** @type {ReturnType<typeof masterFullView>|null} */let masterFinal=null;
  /** @type {{cursor:number,endFrame:number,commandCount:number,replyCount:number}|null} */let masterLastCapture=null;
  /** @param {string} reason */
  const masterInvalid=reason=>{if(masterWitness&&!masterState.sealed){masterState.available=false;masterState.reason??=reason;}};
  /** @template T @param {()=>T} callback @returns {T|null} */
  const masterGuard=callback=>{try{return callback();}catch{masterInvalid('recording-error');return null;}};
  const masterBegin=()=>{
    if(masterState.sealed)return null;
    if(masterState.cursor>=Number.MAX_SAFE_INTEGER-1){masterInvalid('cursor-cap');return null;}
    if(masterState.pending)masterInvalid('native-reentry');
    masterState.pending++;return ++masterState.cursor;
  };
  /** @param {number|boolean|null} order */
  const masterEnd=order=>{if(order!==null)masterState.pending--;};
  /** @param {AudioNode & {gain?:AudioParam}} object @param {string} id @param {string} kind @param {string|null} paramId */
  const masterRegister=(object,id,kind,paramId=null)=>{
    if(masterState.sealed)return;
    if(masterObjects.has(id)||object.context!==context){masterInvalid('node-scope');return;}
    masterIds.set(object,id);masterObjects.set(id,{object,id,kind,contextId:'CONTEXT',...(paramId?{paramId}:{})});
    if(paramId){const param=object.gain;if(!param||masterIds.has(param)){masterInvalid('param-scope');return;}masterIds.set(param,paramId);}
  };
  const masterScope=()=>masterState.available&&masterState.initial.sourceEpoch!==null&&masterState.initial.initial!==null&&sources===1&&l1Nodes===1&&
    masterObjects.size===17&&masterEdges.every(edge=>edge.status==='succeeded')&&masterCandidates.slice(0,2).every((candidate,i)=>!candidate.invalid&&candidate.base.status==='succeeded'&&candidate.base.value===(i===0?1:0)&&candidate.rate.status==='succeeded'&&candidate.rate.value==='a-rate');
  const masterSummary=()=>{
    const available=masterScope();
    return {...masterState,available,reason:masterState.reason??(available?null:'incomplete-binding'),initial:{...masterState.initial}};
  };
  const masterFullView=()=>({
    ...masterSummary(),
    nodes:[...masterObjects.values()].map(({object,...node})=>node),
    candidates:masterCandidates.map(candidate=>({...candidate,base:{...candidate.base},rate:{...candidate.rate}})),
    edges:masterEdges.map(edge=>({...edge})),
    selected:{dry:{nodeId:'G0',paramId:'P0'},wet:{nodeId:'G1',paramId:'P1'}}
  });
  const masterView=(full=false)=>{
    if(full)return masterFinal?structuredClone(masterFinal):masterFullView();
    const value=masterFinal??masterSummary();
    return {schema:value.schema,available:value.available,reason:value.reason,...value.initial,cursor:value.cursor,pending:value.pending,sealed:value.sealed,endFrame:value.endFrame};
  };
  /** @param {AudioParam} param @param {string} name @param {unknown[]} args */
  const masterParamBefore=(param,name,args)=>{
    if(masterState.sealed)return null;
    const id=masterIds.get(param);if(!id||!/^P[0-7]$/.test(id))return null;
    const candidate=masterCandidates[Number(id.slice(1))],order=masterBegin();
    if(!candidate)throw Error('audio-probe-master-candidate');
    /** @param {string} reason */
    const bad=reason=>{candidate.invalid=true;candidate.reason??=reason;if(id==='P0'||id==='P1')masterInvalid(reason);};
    const slot=name==='value'?candidate.base:name==='automationRate'?candidate.rate:null;
    if(!slot)bad('selected-automation');
    else if(slot.status!=='not-attempted')bad('repeated-param-write');
    else{
      slot.status='attempted';slot.order=order;
      const value=args[0];
      if(args.length===1&&(name==='value'&&typeof value==='number'&&Number.isFinite(value)||name==='automationRate'&&(value==='a-rate'||value==='k-rate')))slot.value=value;
      else bad('param-argument');
    }
    return {order,slot,candidate,bad};
  };
  /** @param {ReturnType<typeof masterParamBefore>} ticket @param {boolean} threw */
  const masterParamAfter=(ticket,threw)=>{
    if(!ticket)return;
    if(ticket.slot&&ticket.slot.order===ticket.order)ticket.slot.status=threw?'threw':'succeeded';
    if(threw)ticket.bad('native-param');masterEnd(ticket.order);
  };
  /** @param {AudioNode} receiver @param {string} name @param {unknown[]} args */
  const masterGraphBefore=(receiver,name,args)=>{
    if(masterState.sealed)return null;
    const destination=args[0],from=masterIds.get(receiver)??'UNKNOWN';
    const to=(destination!==null&&(typeof destination==='object'||typeof destination==='function')?masterIds.get(destination):null)??'UNKNOWN';
    const protectedTarget=to!=='UNKNOWN'&&to!=='S0'&&!['P2','P3','P4','P5','P6','P7'].includes(to);
    if(name==='disconnect'){
      // 특정 미터만 대상으로 한 연결 해제는 보호 대상 연결을 제거할 수 없다.
      const broad=args.length===0||typeof args[0]==='number';
      if((broad&&from!=='UNKNOWN'&&from!=='PROGRAM'&&from!=='CONTROL')||protectedTarget){const order=masterBegin();masterInvalid('relevant-disconnect');return {order,edge:null};}
      return null;
    }
    if(!protectedTarget)return null;
    // 소스에서 프로세서로 직접 들어가는 기본 입력은 관측 대상 마스터 경로 밖에 있다.
    if(from==='S0'&&to==='L1'&&args.length>=1&&args.length<=3&&(args[1]??0)===0&&(args[2]??0)===0)return null;
    const order=masterBegin(),output=args.length>=2?args[1]:0,input=args.length>=3?args[2]:0;
    const param=to==='P0'||to==='P1';
    if(args.length<1||args.length>(param?2:3)||!safe(output)||!safe(input)){masterInvalid('connect-overload');return {order,edge:null};}
    const edge=masterEdges.find(edge=>edge.from===from&&edge.to===to&&edge.output===output&&edge.input===input);
    if(!edge){masterInvalid('unexpected-inbound');return {order,edge:null};}
    if(edge.status!=='not-attempted'){masterInvalid('duplicate-edge');return {order,edge:null};}
    edge.status='attempted';edge.order=order;return {order,edge};
  };
  /** @param {ReturnType<typeof masterGraphBefore>} ticket @param {boolean} threw */
  const masterGraphAfter=(ticket,threw)=>{
    if(!ticket)return;
    if(ticket.edge)ticket.edge.status=threw?'threw':'succeeded';
    if(threw)masterInvalid('native-graph');masterEnd(ticket.order);
  };
  /** @param {AudioWorkletNode} node @param {unknown} ctx @param {unknown} name @param {unknown[]} args */
  const masterL1=(node,ctx,name,args)=>{
    if(name!=='knife-audio-transition-l1')return;
    const options=record(args[2])?Object.getOwnPropertyDescriptor(args[2],'processorOptions'):null,actual=options&&'value'in options?options.value:null;
    const epoch=record(actual)?Object.getOwnPropertyDescriptor(actual,'sourceEpoch'):null,state=record(actual)?Object.getOwnPropertyDescriptor(actual,'initial'):null;
    if(ctx!==context||masterObjects.has('L1')||!epoch||!('value'in epoch)||!state||!('value'in state)||!safe(epoch.value)||epoch.value===0||!['raw','silent-hold'].includes(state.value)){masterInvalid('initial-options');return;}
    masterRegister(node,'L1','worklet');
    Object.assign(masterState.initial,{sourceEpoch:epoch.value,initial:state.value});
    Object.assign(initial,{available:true,reason:null,sourceEpoch:epoch.value,initial:state.value});
  };
  /** @type {{order:number,direction:'send'|'receive',packet:Record<string,unknown>}[]} */const ledgerEvents=[];
  const ledger={schema:headroomWitness?'f01-control-ledger-v3':normalizerWitness?'f01-control-ledger-v2':'f01-control-ledger-v1',available:true,reason:/** @type {string|null} */(null),eventCount:0,bytes:0,maxEvents:4128,maxBytes:1048576};
  // 가장 긴 외곽 JSON의 크기를 먼저 확보하고 각 이벤트의 UTF-8 바이트와 쉼표를 센다.
  if(oracle)ledger.bytes=new TextEncoder().encode(JSON.stringify({...ledger,available:false,reason:'noncanonical-receive-packet',eventCount:4128,bytes:1048576,events:[]})).length;
  /** @param {'send'|'receive'} direction @param {unknown} raw */
  const retainControl=(direction,raw)=>{
    if(recordingFrozen||!oracle||!ledger.available)return;
    try{
      let valid=false;
      if(record(raw)&&typeof raw.kind==='string'&&safe(raw.sourceEpoch)&&raw.sourceEpoch>0){
        if(direction==='receive')valid=receiveKeys(raw)&&safe(raw.seq)&&safe(raw.frame)&&safe(raw.meterEpoch)&&
          ['prepared','accepted','completed','rejected','failed','meter-accepted','retired'].includes(String(raw.kind))&&
          (raw.kind==='completed'?range(raw.gain,0,2):raw.gain===null)&&
          (raw.kind==='meter-accepted'?typeof raw.code==='string'&&['hold','warmup','ramp','error'].includes(raw.code):raw.code===null||typeof raw.code==='string'&&raw.code.length<=80);
        else if(raw.kind==='power'||raw.kind==='read-error')valid=keys(raw,raw.kind==='power'?'active,kind,leftPower,meterEpoch,meterSeq,observedTime,rightPower,sourceEpoch,targetDbfs':'kind,meterEpoch,meterSeq,observedTime,sourceEpoch')&&
          safe(raw.meterSeq)&&raw.meterSeq>0&&safe(raw.meterEpoch)&&range(raw.observedTime,0,Number.MAX_VALUE)&&
          (raw.kind==='read-error'||typeof raw.active==='boolean'&&range(raw.leftPower,0,Number.MAX_VALUE)&&range(raw.rightPower,0,Number.MAX_VALUE)&&range(raw.targetDbfs,-30,-12));
        else valid=safe(raw.seq)&&raw.seq>0&&(raw.kind==='retire'&&keys(raw,'kind,seq,sourceEpoch')||raw.kind==='configure'&&
          (keys(raw,'eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted')||keys(raw,'dynamics,eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted')&&typeof raw.dynamics==='boolean')&&
          typeof raw.wanted==='boolean'&&typeof raw.normalizer==='boolean'&&range(raw.gain,0,2)&&range(raw.targetDbfs,-30,-12)&&Array.isArray(raw.eq)&&raw.eq.length===8&&Array.from(raw.eq).every(value=>range(value,-6,6)));
      }
      if(!valid||!record(raw)){ledger.available=false;ledger.reason=`noncanonical-${direction}-packet`;return;}
      if(ledgerEvents.length>=ledger.maxEvents){ledger.available=false;ledger.reason='event-bound';return;}
      const packet=Object.fromEntries(Object.keys(raw).sort().map(key=>[key,Array.isArray(raw[key])?raw[key].slice():key==='application'&&record(raw[key])?{...raw[key]}:key==='renderHeadroom'&&record(raw[key])?{...raw[key],eq:Array.isArray(raw[key].eq)?raw[key].eq.slice():raw[key].eq}:raw[key]]));
      const event={order:ledgerEvents.length+1,direction,packet},bytes=new TextEncoder().encode(JSON.stringify(event)).length+(ledgerEvents.length?1:0);
      if(ledger.bytes+bytes>ledger.maxBytes){ledger.available=false;ledger.reason='byte-bound';return;}
      ledgerEvents.push(event);ledger.bytes+=bytes;ledger.eventCount=ledgerEvents.length;
    }catch{ledger.available=false;ledger.reason='ledger-recording-error';}
  };
  /** @type {Record<string,Record<string,unknown>>} */const latestByRole={};
  /** @type {Record<string,Record<string,unknown>>} */const previousTimeline={};
  /** @type {{role:string,previous:Record<string,unknown>|null,current:Record<string,unknown>}|null} */let timelineFailure=null;
  /** @param {unknown} raw */
  const timelineSummary=raw=>{
    const value=record(raw)&&record(raw.frameTimeline)?raw.frameTimeline:null;
    if(!value||!keys(value,'finite,first,last,length,reason,unitStep,valid')||!safe(value.length)||!(value.first===null||range(value.first,-1,16777215))||!(value.last===null||range(value.last,-1,16777215))||
      typeof value.finite!=='boolean'||typeof value.unitStep!=='boolean'||typeof value.valid!=='boolean'||!(value.reason===null||typeof value.reason==='string'&&value.reason.length<=32)){
      return {length:null,first:null,last:null,finite:false,unitStep:false,valid:false,reason:'missing-or-malformed'};
    }
    return {...value,valid:value.valid&&value.length===128&&value.finite&&value.unitStep&&range(value.first,Number.MIN_VALUE,16777214)&&range(value.last,Number.MIN_VALUE,16777214)&&value.last-value.first===127};
  };
  /** @param {unknown} raw @param {'program'|'source'|'control'} role */
  const motionSummary=(raw,role)=>{
    const packet=record(raw)?raw:null,value=record(packet?.rawMotion)?packet.rawMotion:null;
    const canonical=value&&keys(value,'available,finite,first,inRange,increasing,last,length,reason')&&safe(value.length)&&
      (value.first===null||range(value.first,-16777215,16777215))&&(value.last===null||range(value.last,-16777215,16777215))&&
      typeof value.finite==='boolean'&&typeof value.inRange==='boolean'&&typeof value.increasing==='boolean'&&typeof value.available==='boolean'&&
      (value.reason===null||typeof value.reason==='string'&&value.reason.length<=32);
    const summary=canonical?{...value,available:value.available&&value.length===128&&value.finite&&value.inRange&&value.increasing&&range(value.first,Number.MIN_VALUE,16777214)&&range(value.last,Number.MIN_VALUE,16777214)&&value.last>value.first}:
      {length:null,first:null,last:null,finite:false,inRange:false,increasing:false,available:false,reason:'missing-or-malformed'};
    return {...summary,frame:safe(packet?.frame)?packet.frame:null,producerId:safe(packet?.producerId)&&packet.producerId<=2?packet.producerId:null,
      producerRole:packet?.producerRole==='program'||packet?.producerRole==='source'||packet?.producerRole==='control'?packet.producerRole:null,producerSequence:safe(packet?.producerSequence)&&packet.producerSequence>0?packet.producerSequence:null,receivedSequence:receiverCounts[role==='program'?0:role==='source'?1:2]};
  };
  /** @param {unknown} raw @param {'program'|'source'|'control'} role @param {number} receiverContextTime */
  const pathSummary=(raw,role,receiverContextTime)=>{
    const packet=record(raw)?raw:null,value=record(packet?.framePath)?packet.framePath:null,index=role==='program'?0:role==='source'?1:2;
    const canonical=value&&keys(value,'entryFrame,entryTime,postFrame,postTime,schema,workletSampleRate')&&value.schema==='f01-frame-path-v1'&&
      safe(value.entryFrame)&&safe(value.postFrame)&&range(value.entryTime,0,Number.MAX_SAFE_INTEGER)&&range(value.postTime,0,Number.MAX_SAFE_INTEGER)&&range(value.workletSampleRate,Number.MIN_VALUE,Number.MAX_SAFE_INTEGER);
    const available=!!canonical&&value.workletSampleRate===sampleRate&&safe(packet?.frame)&&packet?.producerId===index&&packet?.producerRole===role&&safe(packet?.producerSequence)&&packet.producerSequence>0&&range(receiverContextTime,0,Number.MAX_SAFE_INTEGER);
    return {available,reason:available?null:canonical&&value.workletSampleRate!==sampleRate?'rate-mismatch':'missing-or-malformed',entryFrame:canonical?value.entryFrame:null,entryTime:canonical?value.entryTime:null,
      postFrame:canonical?value.postFrame:null,postTime:canonical?value.postTime:null,workletSampleRate:canonical?value.workletSampleRate:null,
      receivedFrame:safe(packet?.frame)?packet.frame:null,receiverContextTime:range(receiverContextTime,0,Number.MAX_SAFE_INTEGER)?receiverContextTime:null,
      producerId:safe(packet?.producerId)&&packet.producerId<=2?packet.producerId:null,producerRole:packet?.producerRole==='program'||packet?.producerRole==='source'||packet?.producerRole==='control'?packet.producerRole:null,
      producerSequence:safe(packet?.producerSequence)&&packet.producerSequence>0?packet.producerSequence:null,receivedSequence:receiverCounts[index]};
  };
  /** @param {boolean} full */
  const oracleView=full=>({schema:headroomWitness?'f01-oracle-evidence-v3':normalizerWitness?'f01-oracle-evidence-v2':'f01-oracle-evidence-v1',initial:{...initial,...(normalizerWitness?{normalizerWitness:normalizerWitnessSelected}:{}),...(headroomWitness?{headroomWitness:headroomWitnessSelected}:{})},schedule:{...schedule,originGuard:{before:{...schedule.originGuard.before},after:{...schedule.originGuard.after}}},ledger:{...ledger,...(full?{events:ledgerEvents.map(event=>({...event,packet:{...event.packet,...(record(event.packet.application)?{application:{...event.packet.application}}:{}),...(record(event.packet.renderHeadroom)?{renderHeadroom:{...event.packet.renderHeadroom,eq:Array.isArray(event.packet.renderHeadroom.eq)?event.packet.renderHeadroom.eq.slice():event.packet.renderHeadroom.eq}}:{}),...(Array.isArray(event.packet.eq)?{eq:event.packet.eq.slice()}: {})}}))}:{})},
    frameTimeline:{latestByRole:Object.fromEntries(Object.entries(latestByRole).map(([role,value])=>[role,{...value}])),firstFailure:timelineFailure?{role:timelineFailure.role,previous:timelineFailure.previous?{...timelineFailure.previous}:null,current:{...timelineFailure.current}}:null},
    ...(motion?{rawMotion:{schema:'f01-raw-motion-v1',clockOrigin:'UNPROVEN',schedule:{...motionSchedule,requests:motionSchedule.requests.map(value=>({...value,before:{...value.before},after:{...value.after}}))},latestByRole:Object.fromEntries(Object.entries(latestMotion).map(([role,value])=>[role,{...value}])),firstFailure:motionFailure?{...motionFailure,previous:motionFailure.previous?{...motionFailure.previous}:null,current:{...motionFailure.current}}:null}}:{}),
    ...(framePath?{framePath:{schema:'f01-frame-path-v1',latestByRole:Object.fromEntries(Object.entries(latestPath).map(([role,value])=>[role,{...value}])),firstFailure:pathFailure?{role:pathFailure.role,previous:pathFailure.previous?{...pathFailure.previous}:null,current:{...pathFailure.current}}:null}}:{})});
  /** @param {unknown} raw */
  const reply=raw=>{
    const valid=record(raw)&&receiveKeys(raw)&&safe(raw.sourceEpoch)&&raw.sourceEpoch>0&&
      raw.sourceEpoch===(sourceEpoch||raw.sourceEpoch)&&safe(raw.seq)&&safe(raw.frame)&&safe(raw.meterEpoch)&&
      (raw.kind==='completed'?range(raw.gain,0,2):raw.gain===null)&&(raw.code===null||typeof raw.code==='string'&&raw.code.length<=80);
    if(valid&&raw.kind==='meter-accepted'&&safe(raw.sourceEpoch)&&safe(raw.seq)&&safe(raw.frame)&&safe(raw.meterEpoch)&&['hold','warmup','ramp','error'].includes(String(raw.code))){
      meterDiagnostics.received++;
      if(meterDiagnostics.received>2000||raw.seq<=(meterDiagnostics.lastSeq??0)||raw.frame<(meterDiagnostics.lastFrame??0)||raw.meterEpoch<meterEpoch){
        streamError='audio-product-meter-order';if(replies.length<65)replies.push(raw);return;
      }
      sourceEpoch=raw.sourceEpoch;meterEpoch=raw.meterEpoch;
      meterDiagnostics.firstFrame??=raw.frame;meterDiagnostics.firstSeq??=raw.seq;
      meterDiagnostics.lastFrame=raw.frame;meterDiagnostics.lastSeq=raw.seq;
      const status=String(raw.code);meterDiagnostics.statuses[status]=(meterDiagnostics.statuses[status]??0)+1;return;
    }
    if(replies.length<65)replies.push(raw);
    if(replies.length>64)streamError='audio-product-reply-overflow';
    if(!valid||!['prepared','accepted','completed','retired'].includes(String(raw.kind))||raw.code!==null)streamError='audio-product-reply-invalid';
    else if(safe(raw.sourceEpoch))sourceEpoch=raw.sourceEpoch;
  };
  /** @param {unknown} message */
  const command=message=>{
    if(record(message)&&['power','read-error'].includes(String(message.kind))){
      meterDiagnostics.sent++;
      if(meterDiagnostics.sent>2000||!keys(message,message.kind==='power'?'active,kind,leftPower,meterEpoch,meterSeq,observedTime,rightPower,sourceEpoch,targetDbfs':'kind,meterEpoch,meterSeq,observedTime,sourceEpoch')||
        !safe(message.sourceEpoch)||message.sourceEpoch===0||!safe(message.meterSeq)||message.meterSeq<=sentSeq||
        !safe(message.meterEpoch)||message.meterEpoch<sentEpoch||typeof message.observedTime!=='number'||!Number.isFinite(message.observedTime)||
        message.observedTime<0||message.sourceEpoch!==(sourceEpoch||message.sourceEpoch)||message.kind==='power'&&
        (typeof message.active!=='boolean'||!range(message.leftPower,0,Number.MAX_VALUE)||!range(message.rightPower,0,Number.MAX_VALUE)||!range(message.targetDbfs,-30,-12))){
        streamError='audio-product-meter-command';
        if(commands.length<65)commands.push({message,requestedFrame:Math.round(context.currentTime*sampleRate),mediaTime:video().currentTime});return;
      }
      if(safe(message.sourceEpoch))sourceEpoch=message.sourceEpoch;
      if(safe(message.meterSeq))sentSeq=message.meterSeq;if(safe(message.meterEpoch))sentEpoch=message.meterEpoch;return;
    }
    if(commands.length<65)commands.push({message,requestedFrame:Math.round(context.currentTime*sampleRate),mediaTime:video().currentTime});
    if(commands.length>64)streamError='audio-product-command-overflow';
    if(!record(message)||!safe(message.sourceEpoch)||message.sourceEpoch===0||message.sourceEpoch!==(sourceEpoch||message.sourceEpoch)||!safe(message.seq)||message.seq===0||
      !(message.kind==='retire'&&keys(message,'kind,seq,sourceEpoch')||message.kind==='configure'&&
        (keys(message,'eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted')||keys(message,'dynamics,eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted')&&typeof message.dynamics==='boolean')&&
        typeof message.wanted==='boolean'&&typeof message.normalizer==='boolean'&&range(message.gain,0,2)&&range(message.targetDbfs,-30,-12)&&
        Array.isArray(message.eq)&&message.eq.length===8&&message.eq.every(value=>range(value,-6,6))))streamError='audio-product-command-invalid';
    else sourceEpoch=message.sourceEpoch;
  };
  /** @type {GainNode[]} */const gains=[];
  /** @type {BiquadFilterNode[]} */const filters=[];
  /** @type {AnalyserNode[]} */const analysers=[];
  /** @type {{node:number,from:number,to:number,start:number,end:number,observed:number}[]} */let events=[];
  /** @type {{node:number,from:number,to:number,start:number,end:number,observed:number}[]} */let linearEvents=[];
  /** @type {{node:number,from:number,to:number,start:number,end:number,observed:number}[]} */let steps=[];
  /** @type {{start:number,end:number,count:number[],squares:number[],peaks:number[],over:number[]}[]} */let bins=[];
  /** @type {{index:number,time:number,power:number,size:number,beforeTime?:number}[]} */let powerReads=[];
  /** @type {{ordinal:number,startRead:number,endRead:number,startTime:number,endTime:number,startAttempt?:number,endAttempt?:number,startWall?:number,endWall?:number}[]} */const meterTickReads=[];
  /** @type {{ordinal:number,index:number,time:number,wall:number,size:number,powerReadCursor:number,fault:boolean,error:string|null}[]} */const analysisAttempts=[];
  /** @type {Record<string,unknown>[]} */const controlEvents=[];
  /** @type {ReturnType<typeof controlStamp>|null} */let controlMeasurement=null;
  function controlStamp(){const time=context.currentTime,last=commands.at(-1),message=record(last)?last.message:null;return {frame:Math.round(time*sampleRate),time,wall:performance.now(),powerReadCursor:powerReads.length,meterTickCursor:meterTickReads.length,attemptCursor:analysisAttempts.length,sourceEpoch:initial.sourceEpoch,commandSeq:record(message)?message.seq:null};}
  function controlView(){return {events:JSON.parse(JSON.stringify(controlEvents)),attempts:analysisAttempts.map(a=>({...a})),measurement:controlMeasurement?{...controlMeasurement}:null,observedAt:frozenAt?{...frozenAt}:controlStamp(),...(normalizerSignal?{signalObservation:true,frozenAt:frozenAt?{...frozenAt}:null,signalEndFrame}:{})};}
  /** @type {WeakMap<AudioNode,number>} */const fftNodeIds=new WeakMap();
  /** @type {{id:number,kind:string,channels:number|null,sourceEpoch:number|null}[]} */const fftNodes=[];
  /** @type {{from:number,to:number,output:number,input:number}[]} */let fftEdges=[];
  let fftGraphVersion=0,fftGraphCalls=0,fftGraphReason=/** @type {string|null} */(null);
  /** @type {Record<string,unknown>|null} */let fftRouting=null;
  /** @template {AudioNode} T @param {T} node @param {string} kind @param {number|null} [channels] @param {number|null} [epoch] @returns {T} */
  const fftNode=(node,kind,channels=null,epoch=null)=>{
    if(!fftBufferWitness)return node;
    fftGraphVersion++;
    if(fftNodes.length>=64){fftGraphReason??='node-cap';return node;}
    const id=fftNodes.length+1;fftNodeIds.set(node,id);fftNodes.push({id,kind,channels,sourceEpoch:epoch});return node;
  };
  if(fftBufferWitness){
    /** @param {unknown} receiver */
    const inContext=receiver=>{try{return !!receiver&&typeof receiver==='object'&&Reflect.get(receiver,'context')===context;}catch{return false;}};
    /** @param {AudioNode} receiver @param {boolean} connecting @param {unknown[]} args */
    const trace=(receiver,connecting,args)=>{
      fftGraphVersion++;fftGraphCalls=Math.min(fftGraphCalls+1,257);
      if(fftGraphReason)return;
      if(fftGraphCalls>256){fftGraphReason='call-cap';return;}
      const id=fftNodeIds.get(receiver);if(id===undefined){fftGraphReason='untracked-source';return;}
      const [destination,output=0,input=0]=args,to=destination&&typeof destination==='object'?fftNodeIds.get(/** @type {AudioNode} */(destination)):undefined;
      if(connecting){
        // AudioParam으로 가는 제어 연결은 측정 중인 오디오 신호 경로에서 제외한다.
        if(to===undefined){if(!destination||typeof destination!=='object'||typeof Reflect.get(destination,'connect')==='function')fftGraphReason='untracked-destination';return;}
        if(args.length>3||!safe(output)||!safe(input)){fftGraphReason='connect-overload';return;}
        if(!fftEdges.some(e=>e.from===id&&e.to===to&&e.output===output&&e.input===input)){
          if(fftEdges.length>=128){fftGraphReason='edge-cap';return;}
          fftEdges.push({from:id,to,output,input});
        }
      }else{
        if(args.length>3||args.length===1&&typeof destination==='number'&&!safe(destination)||args.length>1&&(!safe(output)||args.length===3&&!safe(input))){fftGraphReason='disconnect-overload';return;}
        if(args.length===0)fftEdges=fftEdges.filter(e=>e.from!==id);
        else if(typeof destination==='number'&&args.length===1)fftEdges=fftEdges.filter(e=>e.from!==id||e.output!==destination);
        else if(to!==undefined)fftEdges=fftEdges.filter(e=>e.from!==id||e.to!==to||args.length>=2&&e.output!==output||args.length===3&&e.input!==input);
        else if(!destination||typeof destination!=='object'||typeof Reflect.get(destination,'connect')==='function')fftGraphReason='untracked-destination';
      }
    };
    const prototype=target.AudioNode.prototype,connect=prototype.connect,disconnect=prototype.disconnect;
    /** @this {AudioNode} @param {...unknown} args */
    const connectNode=function(...args){let result;try{result=Reflect.apply(connect,this,args);}catch(error){if(inContext(this))fftGraphReason??='native-connect';throw error;}if(inContext(this)){try{trace(this,true,args);}catch{fftGraphReason??='trace-failure';}}return result;};
    /** @this {AudioNode} @param {...unknown} args */
    const disconnectNode=function(...args){let result;try{result=Reflect.apply(disconnect,this,args);}catch(error){if(inContext(this))fftGraphReason??='native-disconnect';throw error;}if(inContext(this)){try{trace(this,false,args);}catch{fftGraphReason??='trace-failure';}}return result;};
    prototype.connect=connectNode;prototype.disconnect=disconnectNode;
  }
  let fftStatus='NOT_SELECTED',fftReason=/** @type {string|null} */(null),fftSelection=/** @type {Record<string,unknown>|null} */(null);
  /** @type {Float32Array[]} */const fftCopies=[];
  /** @type {{ordinal:number,index:number,beforeTime:number,time:number,size:number}[]} */const fftReads=[];
  /** @param {string} reason */const fftUnavailable=reason=>{fftStatus='UNAVAILABLE';fftReason??=reason;};
  /** @param {number} index @param {number} beforeTime @param {number} time @param {Float32Array} buffer @param {boolean} [begin] */
  const retainFft=(index,beforeTime,time,buffer,begin=false)=>{
    if(!fftBufferWitness||fftStatus==='CAPTURED'||fftStatus==='UNAVAILABLE')return;
    const last=commands.at(-1),p=record(last)&&record(last.message)?last.message:null,done=replies.find(r=>record(r)&&r.kind==='completed'&&r.seq===p?.seq&&r.sourceEpoch===p?.sourceEpoch),complete=record(done)?done:null,fftSize=2**Math.ceil(Math.log2(sampleRate*.25));
    if(!fftSelection){
      if(index!==0||!p||!complete||p.normalizer!==true||p.wanted!==true||p.gain!==2||p.targetDbfs!==-12||!Array.isArray(p.eq)||p.eq.length!==8||p.eq.some(v=>v!==6)||!safe(complete.frame))return;
      const eligibleFrame=complete.frame+fftSize+(sampleRate===44100?264:sampleRate*.006)+128;
      if(Math.round(beforeTime*sampleRate)<eligibleFrame)return;
      fftStatus='CAPTURING';fftRouting={schema:'f01-fft-routing-v1',reason:fftGraphReason,version:fftGraphVersion,endVersion:null,calls:fftGraphCalls,nodes:fftNodes.map(n=>({...n})),edges:fftEdges.map(e=>({...e})),analyserIds:analysers.map(n=>fftNodeIds.get(n)??null)};if(JSON.stringify(fftRouting).length>16384)fftRouting.reason='metadata-cap';fftSelection={sourceEpoch:p.sourceEpoch,commandSeq:p.seq,meterEpoch:complete.meterEpoch,completedFrame:complete.frame,eligibleFrame,firstReadOrdinal:reads,pairSeq:(reads+1)/2};
    }
    // 브라우저 코드가 예외를 던지거나 버퍼를 재사용하기 전에 첫 시도를 확정한다.
    if(begin)return;
    if(!p||p.sourceEpoch!==fftSelection.sourceEpoch||p.seq!==fftSelection.commandSeq||complete?.meterEpoch!==fftSelection.meterEpoch||reads!==Number(fftSelection.firstReadOrdinal)+fftReads.length||index!==fftReads.length||buffer.length!==fftSize||buffer.byteLength!==fftSize*4||!Number.isFinite(beforeTime)||!Number.isFinite(time)||time<beforeTime){fftUnavailable('first-pair-invalid');return;}
    if(fftRouting){fftRouting.endVersion=fftGraphVersion;if(fftGraphReason||fftRouting.version!==fftGraphVersion)fftRouting.reason??=fftGraphReason??'pair-graph-changed';}
    fftCopies.push(buffer.slice());fftReads.push({ordinal:reads,index,beforeTime,time,size:buffer.length});if(fftCopies.length===2)fftStatus='CAPTURED';
  };
  /** facts와 partial 응답에는 메타데이터만 담아 바이너리 오류 증거의 복사를 피한다. @param {boolean} full */
  const fftView=full=>{
    const metadata={schema:'f01-fft-buffer-witness-v2',routing:fftRouting?JSON.parse(JSON.stringify(fftRouting)):null,status:fftStatus,reason:fftSelection?fftReason:fftGraphReason??fftReason,selection:fftSelection?{...fftSelection}:null,reads:fftReads.map(r=>({...r})),bytes:fftCopies.reduce((n,c)=>n+c.byteLength,0),encoding:'float32le'};
    if(!full)return metadata;const bytes=new Uint8Array(metadata.bytes);let offset=0;for(const copy of fftCopies){bytes.set(new Uint8Array(copy.buffer,copy.byteOffset,copy.byteLength),offset);offset+=copy.byteLength;}let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));return {...metadata,base64:btoa(binary)};
  };
  /** @type {{frame:number,powerReadCursor:number,meterTickCursor:number,sourceEpoch:number|null,commandSeq:number|null}|null} */let normalizerMeasurement=null;
  /** @type {Record<string,unknown>|null} */let rapidMasterRequest=null;
  /** @type {{frame:number,observedFrame:number,sourceFrame:number|null,reason:string,lengths:number[]}[]} */const invalidChunks=[];
  /** @type {number|null} */let sourceFrame=null;
  /** @type {number|null} */let captureStartFrame=null;
  const buffers=new Set(),ticks=new Map();
  /** @type {DynamicsCompressorNode[]} */const compressorNodes=[];
  let sources=0,compressors=0,delays=0,shapers=0,splitters=0,reads=0,invalidFrames=0,analysisError=false,url='',sequence=100;
  /** @type {Record<string,unknown>|null} */let firstStreamFailure=null;
  /** @type {{bytes:number,packets:Record<string,unknown>[]} | null} */let firstStreamFailureEvidence=null;
  /** @type {[number,number,number,number]} */const receiverCounts=[0,0,0,0];
  const sourceStartLimit=8;
  const sourceStamp=(/** @type {HTMLMediaElement} */ element,frame=Math.round(context.currentTime*sampleRate))=>({frame,
    mediaTime:Number.isFinite(element.currentTime)?element.currentTime:null,readyState:safe(element.readyState)?element.readyState:null,paused:element.paused});
  /** @typedef {{frame:number,producerSequence:number,receivedSequence:number}} SourceReceipt */
  /** @type {{epoch:number|null,generation:number,signal:{frequency:number,inputDbfs:number,phase:number,frames:number}|null,beforeCreate:ReturnType<typeof sourceStamp>,afterCreate:ReturnType<typeof sourceStamp>|null,beforeConnect:ReturnType<typeof sourceStamp>|null,afterConnect:ReturnType<typeof sourceStamp>|null}|null} */
  let sourceBinding=null;
  /** @type {SourceReceipt|null} */let sourceEmpty=null;
  /** @type {(SourceReceipt&{samples:Float32Array[],producerPcm?:Float32Array[]})[]} */const sourcePackets=[];
  let sourceStartReason='',sourceStartUrl='';
  /** @type {number|null} */let sourceStartLastFrame=null;
  /** @type {ReturnType<typeof sourceStartView>|null} */let sourceStartReport=null;
  /** @param {unknown} data */
  const receiveSourceStart=data=>{
    if(sourceStartReason||sourcePackets.length===2||receiverCounts[1]>sourceStartLimit)return;
    const packet=record(data)?data:null,mark=record(packet?.sourceStart)?packet.sourceStart:null,receivedSequence=receiverCounts[1];
    if(!packet||!mark||!sourceBinding?.afterConnect){sourceStartReason='missing-receipt';return;}
    if(!safe(sourceBinding.epoch)||sourceBinding.epoch===0||mark.epoch!==sourceBinding.epoch||mark.generation!==sourceBinding.generation||initial.sourceEpoch!==sourceBinding.epoch){sourceStartReason='epoch';return;}
    if(packet.producerId!==1||packet.producerRole!=='source'||!safe(packet.frame)||mark.frame!==packet.frame||
      mark.sequence!==receivedSequence||packet.producerSequence!==receivedSequence||sourceStartLastFrame!==null&&packet.frame!==sourceStartLastFrame+128){sourceStartReason='sequence';return;}
    sourceStartLastFrame=packet.frame;
    const receipt={frame:packet.frame,producerSequence:receivedSequence,receivedSequence},samples=packet.samples,producer=mark.pcm;
    if(Array.isArray(samples)&&samples.length===0&&Array.isArray(producer)&&producer.length===0){sourceEmpty??=receipt;return;}
    /** @param {unknown} value @returns {value is Float32Array[]} */
    const stereo=value=>Array.isArray(value)&&value.length===2&&value.every(c=>c instanceof Float32Array&&c.length===128&&c.every(Number.isFinite));
    if(!stereo(samples)||!stereo(producer)){sourceStartReason='shape';return;}
    const same=producer.every((c,i)=>c.every((x,n)=>Object.is(x,samples[i]?.[n])));
    sourcePackets.push({...receipt,samples:samples.map(c=>new Float32Array(c)),...same?{}:{producerPcm:producer.map(c=>new Float32Array(c))}});
    if(!same)sourceStartReason='received-bytes';
  };
  /** @param {Float32Array[]} samples */
  const sourceStartPcm=samples=>{
    const bytes=new Uint8Array(1024),view=new DataView(bytes.buffer);
    samples.forEach((channel,c)=>channel.forEach((value,i)=>view.setFloat32((i*2+c)*4,value,true)));
    return btoa(String.fromCharCode(...bytes));
  };
  /** @param {{start:number,end:number,view:DataView}} [exported] */
  const sourceStartView=exported=>{
    const element=document.querySelector('video');
    let reason=sourceStartReason,comparedFrames=0;
    if(!reason&&(!sourceBinding?.signal||sources!==1||element!==signalVideo||element?.src!==sourceStartUrl||
      element?.currentSrc&&element.currentSrc!==sourceStartUrl||signalError||initial.sourceEpoch!==sourceBinding.epoch))reason='binding';
    if(!reason&&sourcePackets.length!==2)reason='prefix-incomplete';
    if(exported)for(const packet of sourcePackets){
      const a=Math.max(packet.frame,exported.start),b=Math.min(packet.frame+128,exported.end);
      for(let frame=a;frame<b;frame++){
        comparedFrames++;
        packet.samples.forEach((channel,c)=>{if(!Object.is(channel[frame-packet.frame],exported.view.getFloat32(((frame-exported.start)*2+c)*4,true)))reason||='archive-bytes';});
      }
    }
    if(!reason)reason=!exported?'archive-not-observed':comparedFrames===0?'outside':comparedFrames!==256?'archive-partial':'';
    return {schema:'f01-source-start-v1',status:reason?'UNFORMED':'FORMED',reason:reason||null,binding:sourceBinding,
      empty:sourceEmpty,packets:sourcePackets.map(({samples,producerPcm,...receipt})=>({...receipt,pcm:sourceStartPcm(samples),
        allZero:samples.every(c=>c.every(x=>x===0)),...producerPcm?{producerPcm:sourceStartPcm(producerPcm)}:{}})),
      archive:exported?{start:exported.start,end:exported.end,comparedFrames}:null};
  };
  /** @param {'program'|'source'|'control'|'component'} role @param {number} expectedChannels @param {unknown} data @param {CaptureChunk|null} previous @param {'shape'|'gap'|'nonfinite'} reason */
  const rememberStreamFailure=(role,expectedChannels,data,previous,reason)=>{
    if(retainSignal)retainedError||='audio-retained-'+reason;
    if(!product||firstStreamFailure)return;
    if(oracle)timelineFailure={role,previous:previousTimeline[role]?{...previousTimeline[role]}:null,current:timelineSummary(data)};
    if(framePath)pathFailure={role,previous:previousPath[role]?{...previousPath[role]}:null,current:{...latestPath[role]}};
    const packet=record(data)?data:null,samples=Array.isArray(packet?.samples)?packet.samples:null,channels=samples?.slice(0,5)??[];
    /** @type {{channel:number,index:number,kind:string}|null} */let firstNonfinite=null;
    const lengths=channels.map(channel=>{
      const length=channel?.length;
      return Number.isSafeInteger(length)&&length>=0?length:null;
    });
    for(let c=0;c<channels.length&&!firstNonfinite;c++)for(let n=0;n<Math.min(lengths[c]??0,128);n++){
      const value=channels[c][n];if(!Number.isFinite(value)){firstNonfinite={channel:c,index:n,kind:Number.isNaN(value)?'NaN':value===Infinity?'Infinity':value===-Infinity?'-Infinity':typeof value};break;}
    }
    /** @param {unknown} raw */
    const provenance=raw=>{const value=record(raw)?raw:null;return {
      producerId:safe(value?.producerId)&&value.producerId<streamCounts.length?value.producerId:null,
      producerSequence:safe(value?.producerSequence)&&value.producerSequence>0?value.producerSequence:null};};
    const currentProvenance=provenance(packet),previousProvenance=provenance(previous),receivedSequence=receiverCounts[role==='program'?0:role==='source'?1:role==='control'?2:3];
    const observedFrame=Math.round(context.currentTime*sampleRate);
    firstStreamFailure={role,reason,frame:Number.isFinite(packet?.frame)?packet?.frame:null,observedFrame:Number.isFinite(observedFrame)?observedFrame:null,
      sourceFrame:Number.isFinite(sourceFrame)?sourceFrame:null,captureStartFrame:Number.isFinite(captureStartFrame)?captureStartFrame:null,sources,
      expectedChannels,actualChannels:samples?.length??null,types:channels.map(channel=>Object.prototype.toString.call(channel).slice(8,-1).slice(0,32)),lengths,firstNonfinite,
      previousRetainedFrame:Number.isFinite(previous?.frame)?previous?.frame:null,...currentProvenance,
      previousProducerId:previousProvenance.producerId,previousProducerSequence:previousProvenance.producerSequence,
      receivedSequence,previousReceivedSequence:previous?.receivedSequence??null};
    if(motion&&role!=='component'){
      const before=previousMotion[role]??null,current=latestMotion[role]??motionSummary(data,role),f=firstStreamFailure,index=role==='program'?0:role==='source'?1:2;
      const advanced=motionSchedule.requests.find(value=>value.role===role)?.requested===true&&reason==='gap'&&safe(f.frame)&&f.frame===f.previousRetainedFrame&&
        f.producerId===index&&f.previousProducerId===index&&safe(f.previousProducerSequence)&&f.producerSequence===f.previousProducerSequence+1&&safe(f.previousReceivedSequence)&&f.receivedSequence===f.previousReceivedSequence+1&&
        before?.producerRole===role&&current.producerRole===role&&before.available===true&&current.available===true&&
        typeof current.first==='number'&&typeof before.first==='number'&&typeof current.last==='number'&&typeof before.last==='number'&&current.first>before.first&&current.last>before.last;
      motionFailure={role,previous:before?{...before}:null,current:{...current},status:advanced?'observed-motion-with-repeated-frame':'INCONCLUSIVE',clockOrigin:'UNPROVEN'};
    }
    let bytes=0;
    /** @param {'previous'|'current'} position @param {unknown} raw @param {number|null} received */
    const retain=(position,raw,received)=>{
      const value=record(raw)?raw:null,channels=Array.isArray(value?.samples)?value.samples.slice(0,5):[];
      return {position,frame:Number.isFinite(value?.frame)?value?.frame:null,...provenance(raw),receivedSequence:received,
        channels:channels.flatMap((channel,index)=>{
          if(!(channel instanceof Float32Array))return [];
          const rawBytes=new Uint8Array(channel.buffer,channel.byteOffset,Math.min(channel.length,128)*4);bytes+=rawBytes.length;
          return [{channel:index,encoding:'float32le',base64:btoa(String.fromCharCode(...rawBytes))}];
        })};
    };
    const packets=[...(previous?[retain('previous',previous,previous.receivedSequence??null)]:[]),retain('current',packet,receivedSequence)];
    firstStreamFailureEvidence={bytes,packets};
  };
  /** @type {Record<string,unknown>|null} */let configured=null;
  const code=oracle?`class Capture extends AudioWorkletProcessor {
    static get parameterDescriptors(){return [{name:'frameTimeline',defaultValue:-1,minValue:-1,maxValue:16777215,automationRate:'a-rate'}];}
    constructor(options){super();this.producerId=options.processorOptions.producerId;this.producerRole=options.processorOptions.producerRole;this.producerSequence=0;${sourceStartWitness?'this.sourceStart=options.processorOptions.sourceStart;this.sourceStartValid=0;':''}}
    process(inputs,outputs,parameters){${framePath?'const entryFrame=currentFrame,entryTime=currentTime;':''}for(const channel of outputs[0]||[])channel.fill(0);
      const samples=(inputs[0]||[]).map(channel=>new Float32Array(channel)),values=parameters.frameTimeline;
      const length=values instanceof Float32Array?values.length:0,finite=length>0&&values.every(Number.isFinite);
      const first=finite?values[0]:null,last=finite?values[length-1]:null;
      const unitStep=length===128&&finite&&values.every((value,index)=>index===0||value-values[index-1]===1);
      const valid=length===128&&finite&&unitStep&&first>0&&last<16777215;
      const frameTimeline={length,first,last,finite,unitStep,valid,reason:valid?null:length!==128?'length':!finite?'nonfinite':first<=0||last>=16777215?'boundary':'step'};${motion?`
      const inRange=length===128&&finite&&values.every(value=>value>0&&value<16777215),increasing=length===128&&finite&&values.every((value,index)=>index===0||value>values[index-1]);
      const available=inRange&&increasing,rawMotion={length,first,last,finite,inRange,increasing,available,reason:available?null:length!==128?'length':!finite?'nonfinite':!inRange?'boundary':'not-increasing'};`:''}
      ${framePath?`const packet={frame:currentFrame,samples,producerId:this.producerId,producerRole:this.producerRole,producerSequence:++this.producerSequence,frameTimeline,rawMotion};
      packet.framePath={schema:'f01-frame-path-v1',entryFrame,entryTime,postFrame:packet.frame,postTime:currentTime,workletSampleRate:sampleRate};
      this.port.postMessage(packet,samples.map(channel=>channel.buffer));`:`${sourceStartWitness?`
      const packet={frame:currentFrame,samples,producerId:this.producerId,producerRole:this.producerRole,producerSequence:++this.producerSequence,frameTimeline};
      const transfer=samples.map(channel=>channel.buffer);
      if(this.sourceStart&&this.producerSequence<=${sourceStartLimit}&&this.sourceStartValid<2){
        const valid=samples.length===2&&samples.every(c=>c.length===128&&c.every(Number.isFinite));
        const pcm=valid?inputs[0].map(c=>new Float32Array(c)):samples.length===0?[]:null;
        if(valid)this.sourceStartValid++;
        packet.sourceStart={...this.sourceStart,frame:packet.frame,sequence:this.producerSequence,pcm};
        if(pcm)transfer.push(...pcm.map(c=>c.buffer));
      }
      this.port.postMessage(packet,transfer);`:`this.port.postMessage({frame:currentFrame,samples,producerId:this.producerId,producerRole:this.producerRole,producerSequence:++this.producerSequence,frameTimeline${motion?',rawMotion':''}},samples.map(channel=>channel.buffer));`}`}return true;}
  }registerProcessor('f01-processing-capture',Capture);`:product?`class Capture extends AudioWorkletProcessor {
    constructor(options){super();this.producerId=options.processorOptions.producerId;this.producerRole=options.processorOptions.producerRole;this.producerSequence=0;}
    process(inputs,outputs){for(const channel of outputs[0]||[])channel.fill(0);
      const samples=(inputs[0]||[]).map(channel=>new Float32Array(channel));
      this.port.postMessage({frame:currentFrame,samples,producerId:this.producerId,producerRole:this.producerRole,producerSequence:++this.producerSequence},samples.map(channel=>channel.buffer));return true;}
  }registerProcessor('f01-processing-capture',Capture);`:`class Capture extends AudioWorkletProcessor {
    process(inputs,outputs){for(const channel of outputs[0]||[])channel.fill(0);
      const samples=(inputs[0]||[]).map(channel=>new Float32Array(channel));
      this.port.postMessage({frame:currentFrame,samples},samples.map(channel=>channel.buffer));return true;}
  }registerProcessor('f01-processing-capture',Capture);`;
  const module=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  try{await context.audioWorklet.addModule(module);}finally{URL.revokeObjectURL(module);}
  let timelineSchedules=0;
  /** @param {AudioWorkletNode} node @param {number} producerId @param {string} role */
  const scheduleTimeline=(node,producerId,role)=>{
    if(!oracle)return;
    if(timelineSchedules++===0)schedule.originGuard.before={state:context.state,currentTime:context.currentTime};
    if(motion){
      const before={state:context.state,currentTime:context.currentTime},startTime=before.currentTime,endTime=startTime+16777215/sampleRate;
      const request={producerId,role,before,after:{...before},startTime,endTime,requested:false,reason:/** @type {string|null} */(null)};
      try{if(!range(startTime,0,Number.MAX_VALUE)||!Number.isFinite(endTime))throw new Error('time');const parameter=node.parameters.get('frameTimeline');if(!parameter)throw new Error('missing');parameter.setValueAtTime(0,startTime);parameter.linearRampToValueAtTime(16777215,endTime);request.requested=true;}
      catch{request.reason='parameter-schedule';}
      request.after={state:context.state,currentTime:context.currentTime};motionSchedule.requests.push(request);
    }else if(schedule.originGuard.before.state==='suspended'&&schedule.originGuard.before.currentTime===0){
      try{const parameter=node.parameters.get('frameTimeline');if(!parameter)throw new Error('missing');parameter.setValueAtTime(0,0);parameter.linearRampToValueAtTime(16777215,16777215/sampleRate);schedule.nodesScheduled++;}
      catch{schedule.available=false;schedule.reason='parameter-schedule';}
    }else{schedule.available=false;schedule.reason??='schedule-origin';}
    if(timelineSchedules===3){
      schedule.originGuard.after={state:context.state,currentTime:context.currentTime};
      if([schedule.originGuard.before,schedule.originGuard.after].some(value=>value.state!=='suspended'||value.currentTime!==0)){schedule.available=false;schedule.reason??='schedule-origin';}
    }
  };
  fftNode(context.destination,'destination');
  const sink=fftNode(new AudioWorkletNode(context,'f01-processing-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',...(product?{processorOptions:{producerId:0,producerRole:'program',...(oracle?{oracleEvidence:true}:{})}}:{})}),'observer-program');
  scheduleTimeline(sink,0,'program');
  sink.connect(context.destination);
  const nativeDestination=context.destination;
  /** @param {number} count @param {CaptureChunk[]} rows @param {1|2|3} index @param {AudioNode} [input] @param {HTMLMediaElement} [element] */
  const observe=(count,rows,index,input,element)=>{
    const role=index===1?'source':index===2?'control':'component';
    const node=fftNode(new AudioWorkletNode(context,'f01-processing-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[count],channelCount:count,channelCountMode:'explicit',channelInterpretation:'discrete',...(product?{processorOptions:{producerId:index,producerRole:role,...(oracle?{oracleEvidence:true}:{}),
      ...(sourceStartWitness&&index===1&&sourceBinding?{sourceStart:{epoch:sourceBinding.epoch,generation:sourceBinding.generation}}:{})}}:{})}),'observer-'+role);
    scheduleTimeline(node,index,role);
    if(!input)node.connect(nativeDestination);node.port.onmessage=({data})=>{
      if(recordingFrozen)return;
      const receiverContextTime=framePath?context.currentTime:0;
      if(oracle)latestByRole[role]=timelineSummary(data);
      if(product)receiverCounts[index]++;
      if(sourceStartWitness&&index===1&&sourceStartReport===null)receiveSourceStart(data);
      if(framePath&&role!=='component')latestPath[role]=pathSummary(data,role,receiverContextTime);
      if(motion&&role!=='component')latestMotion[role]=motionSummary(data,role);
      if(product&&(!record(data)||!safe(data.frame)||!Array.isArray(data.samples))){rememberStreamFailure(role,count,data,rows.at(-1)??null,'shape');streamError='audio-product-stream-shape';return;}
      const chunk=/** @type {CaptureChunk} */(data);
      if(!Number.isSafeInteger(chunk.frame)||chunk.frame<0||chunk.samples.length!==count||chunk.samples.some(channel=>!(channel instanceof Float32Array)||channel.length!==128||channel.some(value=>!Number.isFinite(value)))){
        const startup=chunk.samples.length===0&&Number.isSafeInteger(chunk.frame)&&chunk.frame>=0&&(sourceFrame===null||chunk.frame<sourceFrame);
        if(sources&&!startup){rememberStreamFailure(role,count,chunk,rows.at(-1)??null,'shape');streamError='audio-l1-stream-shape';}return;
      }
      const last=rows.at(-1);if(last&&chunk.frame!==last.frame+128){rememberStreamFailure(role,count,chunk,last,'gap');streamError='audio-l1-stream-gap';}
      if(rows.length>=2000){if(product)rows.shift();else{if(sources)streamError='audio-l1-stream-overflow';return;}}rows.push(product?{...chunk,receivedSequence:receiverCounts[index]}:chunk);
      if(oracle){delete /** @type {Record<string,unknown>} */(rows.at(-1)).frameTimeline;previousTimeline[role]={...latestByRole[role]};}
      if(motion){delete /** @type {Record<string,unknown>} */(rows.at(-1)).rawMotion;previousMotion[role]={...latestMotion[role]};}
      if(framePath){delete /** @type {Record<string,unknown>} */(rows.at(-1)).framePath;previousPath[role]={...latestPath[role]};}
      retainChunk(index,/** @type {CaptureChunk} */(rows.at(-1)));
    };
    if(input){
      const binding=element?sourceBinding:null;
      if(binding&&element)binding.beforeConnect=sourceStamp(element);
      input.connect(node);node.connect(nativeDestination);
      if(binding&&element)binding.afterConnect=sourceStamp(element);
    }
    return node;
  };
  let echo=observed&&!product?observe(2,echoChunks,1):null;
  const control=observed?observe(5,controlChunks,2):null;
  const component=equalizerComponent?observe(2,componentChunks,3):null;
  if(observed&&!masterWitness){
    const Node=target.AudioWorkletNode;
    target.AudioWorkletNode=class extends Node {
      /** @param {BaseAudioContext} ctx @param {string} name @param {AudioWorkletNodeOptions} [options] */
      constructor(ctx,name,options){
        if(normalizerWitness&&name==='knife-audio-transition-l1')options={...options,processorOptions:{...options?.processorOptions,normalizerWitness:true,...(headroomWitness?{headroomWitness:true}:{})}};
        super(ctx,name,options);
        if(name==='knife-audio-transition-l1'){
          if(oracle){const actual=options?.processorOptions;if(l1Nodes){initial.available=false;initial.reason='multiple-l1-nodes';}else if(record(actual)&&safe(actual.sourceEpoch)&&actual.sourceEpoch>0&&(actual.initial==='raw'||actual.initial==='silent-hold')){initial.available=true;initial.reason=null;initial.sourceEpoch=actual.sourceEpoch;initial.initial=actual.initial;}}
          if(normalizerWitness)normalizerWitnessSelected=options?.processorOptions?.normalizerWitness===true;
          if(headroomWitness)headroomWitnessSelected=options?.processorOptions?.headroomWitness===true;
          fftNode(this,'l1',null,initial.sourceEpoch);l1Nodes++;if(!control)throw new Error('audio-l1-control-missing');this.connect(control,1);
          if(component)this.connect(component,0);
          this.port.addEventListener('message',event=>{if(recordingFrozen)return;retainControl('receive',event.data);if(product)reply(event.data);else{replies.push(event.data);if(replies.length>64)streamError='audio-l1-reply-overflow';}});this.port.start();
          const post=this.port.postMessage.bind(this.port);this.port.postMessage=message=>{if(recordingFrozen){post(message);return;}if(product)command(message);else commands.push({message,requestedFrame:Math.round(context.currentTime*sampleRate),mediaTime:video().currentTime});post(message);retainControl('send',message);};
        }
      }
    };
  }
  Object.defineProperty(context,'destination',{get:()=>sink});
  sink.port.onmessage=({data})=>{
    if(recordingFrozen)return;
    const receiverContextTime=framePath?context.currentTime:0;
    if(oracle)latestByRole.program=timelineSummary(data);
    /** @type {CaptureChunk} */const chunk=data;
    if(product){
      receiverCounts[0]++;
      if(framePath)latestPath.program=pathSummary(data,'program',receiverContextTime);
      if(motion)latestMotion.program=motionSummary(data,'program');
      if(!safe(chunk?.frame)||!Array.isArray(chunk.samples)){rememberStreamFailure('program',2,chunk,chunks.at(-1)??null,'shape');streamError='audio-product-stream-shape';return;}
      const last=chunks.at(-1);if(last&&chunk.frame!==last.frame+128){rememberStreamFailure('program',2,chunk,last,'gap');streamError='audio-product-stream-gap';}
    }
    if(chunk.samples.length!==2||chunk.samples.some(channel=>!(channel instanceof Float32Array)||channel.length!==128)){
      if(sources){
        const startup=chunk.samples.length===0&&Number.isSafeInteger(chunk.frame)&&chunk.frame>=0&&(captureStartFrame===null||chunk.frame<captureStartFrame);
        if(!startup){rememberStreamFailure('program',2,chunk,chunks.at(-1)??null,'shape');invalidFrames++;}
        invalidChunks.push({frame:chunk.frame,observedFrame:Math.round(context.currentTime*sampleRate),sourceFrame,reason:'channel-shape',lengths:chunk.samples.map(channel=>channel.length)});if(invalidChunks.length>64)invalidChunks.shift();
      }return;
    }
    if(sources&&captureStartFrame===null)captureStartFrame=chunk.frame;
    if(installed&&chunks.length>=2000){streamError='audio-l1-stream-overflow';return;}
    chunks.push(product?{...chunk,receivedSequence:receiverCounts[0]}:chunk);while(chunks.length>2000)chunks.shift();
    if(oracle)delete /** @type {Record<string,unknown>} */(chunks.at(-1)).frameTimeline;
    if(motion)delete /** @type {Record<string,unknown>} */(chunks.at(-1)).rawMotion;
    if(framePath)delete /** @type {Record<string,unknown>} */(chunks.at(-1)).framePath;
    const width=sampleRate/10;
    for(let n=0;n<128;n++){
      const frame=chunk.frame+n,start=Math.floor(frame/width)*width;
      let bin=bins.at(-1);
      if(!bin||bin.start!==start){bin={start,end:start+width,count:[0,0],squares:[0,0],peaks:[0,0],over:[0,0]};bins.push(bin);while(bins.length>600)bins.shift();}
      for(let channel=0;channel<2;channel++){
        const value=chunk.samples[channel]?.[n];
        if(value===undefined||!Number.isFinite(value)){rememberStreamFailure('program',2,chunk,chunks.at(-2)??null,'nonfinite');invalidFrames++;invalidChunks.push({frame,observedFrame:Math.round(context.currentTime*sampleRate),sourceFrame,reason:'nonfinite',lengths:chunk.samples.map(channel=>channel.length)});if(invalidChunks.length>64)invalidChunks.shift();continue;}
        bin.count[channel]=/** @type {number} */(bin.count[channel])+1;
        bin.squares[channel]=/** @type {number} */(bin.squares[channel])+value*value;
        bin.peaks[channel]=Math.max(/** @type {number} */(bin.peaks[channel]),Math.abs(value));
        if(Math.abs(value)>1)bin.over[channel]=/** @type {number} */(bin.over[channel])+1;
      }
    }
    retainChunk(0,/** @type {CaptureChunk} */(chunks.at(-1)));
    if(oracle)previousTimeline.program={...latestByRole.program};
    if(motion)previousMotion.program={...latestMotion.program};
    if(framePath)previousPath.program={...latestPath.program};
  };
  const source=context.createMediaElementSource.bind(context);
  context.createMediaElementSource=video=>{
    const frame=Math.round(context.currentTime*sampleRate);
    if(sourceStartWitness){
      if(sourceBinding)sourceStartReason||='binding';
      else{
        sourceStartUrl=url;
        const fixed=signal&&video===signalVideo&&video.src===url&&(!video.currentSrc||video.currentSrc===url)&&signal.frequency===1000&&signal.inputDbfs===-36&&
          signal.phase===.37&&signal.frames===3969000&&signal.channels===2&&signal.pattern==='stereo';
        sourceBinding={epoch:initial.sourceEpoch,generation:sources+1,signal:fixed?{frequency:1000,inputDbfs:-36,phase:.37,frames:3969000}:null,
          beforeCreate:sourceStamp(video,frame),afterCreate:null,beforeConnect:null,afterConnect:null};
      }
    }
    const node=fftNode(source(video),'source'),binding=sourceStartWitness&&!sources?sourceBinding:null;
    if(binding)binding.afterCreate=sourceStamp(video);
    if(product&&!echo)echo=observe(2,echoChunks,1,node,binding?video:undefined);else if(echo)node.connect(echo);
    sources++;sourceFrame=frame;return node;
  };
  const gain=context.createGain.bind(context);
  context.createGain=()=>{
    const node=fftNode(gain(),'gain'),index=gains.length;gains.push(node);
    const set=node.gain.setValueAtTime.bind(node.gain),exponential=node.gain.exponentialRampToValueAtTime.bind(node.gain),linear=node.gain.linearRampToValueAtTime.bind(node.gain);
    let value=node.gain.value,start=context.currentTime;
    node.gain.setValueAtTime=(next,time)=>{if(recordingFrozen)return set(next,time);value=next;start=time;steps.push({node:index,from:next,to:next,start:time,end:time,observed:context.currentTime});return set(next,time);};
    node.gain.exponentialRampToValueAtTime=(next,end)=>{if(recordingFrozen)return exponential(next,end);const step=steps.at(-1);if(step?.node===index){step.to=next;step.end=end;}events.push({node:index,from:value,to:next,start,end,observed:context.currentTime});if(events.length>10000)throw new Error('audio-probe-event-bound');return exponential(next,end);};
    node.gain.linearRampToValueAtTime=(next,end)=>{if(recordingFrozen)return linear(next,end);linearEvents.push({node:index,from:value,to:next,start,end,observed:context.currentTime});return linear(next,end);};
    return node;
  };
  const filter=context.createBiquadFilter.bind(context);
  context.createBiquadFilter=()=>{const node=fftNode(filter(),'biquad');filters.push(node);return node;};
  const analyser=context.createAnalyser.bind(context);
  context.createAnalyser=()=>{
    const node=fftNode(analyser(),'analyser'),index=analysers.length,read=node.getFloatTimeDomainData.bind(node);analysers.push(node);
    node.getFloatTimeDomainData=buffer=>{if(recordingFrozen){read(buffer);return;}reads++;buffers.add(buffer);
      const attempt=normalizerControl?{ordinal:analysisAttempts.length+1,index,time:context.currentTime,wall:performance.now(),size:buffer.length,powerReadCursor:powerReads.length,fault:analysisError,error:/** @type {string|null} */(null)}:null;
      if(attempt){if(analysisAttempts.length>=402){streamError||='audio-normalizer-control-attempt-bound';throw new Error(streamError);}analysisAttempts.push(attempt);}
      const beforeTime=fftBufferWitness?context.currentTime:0;
      try{if(fftBufferWitness)retainFft(index,beforeTime,beforeTime,buffer,true);if(analysisError)throw new Error('synthetic-native-analysis-fault');read(buffer);const time=fftBufferWitness?context.currentTime:0;if(fftBufferWitness)retainFft(index,beforeTime,time,buffer);
        let sum=0;for(const value of buffer)sum+=value*value;powerReads.push({index,time:fftBufferWitness?time:context.currentTime,power:sum/buffer.length,size:buffer.length,...(fftBufferWitness?{beforeTime}:{})});
        if(powerReads.length>2000)throw new Error('audio-probe-power-bound');
      }catch(error){if(fftBufferWitness&&fftSelection&&fftStatus!=='CAPTURED')fftUnavailable('first-pair-read-error');if(attempt)attempt.error=error instanceof Error?error.message:String(error);throw error;}
    };return node;
  };
  const compressor=context.createDynamicsCompressor.bind(context),delay=context.createDelay.bind(context),shaper=context.createWaveShaper.bind(context),splitter=context.createChannelSplitter.bind(context);
  context.createDynamicsCompressor=()=>{compressors++;const node=fftNode(compressor(),'compressor');if(headroomWitness)compressorNodes.push(node);return node;};
  context.createDelay=maximum=>{delays++;return fftNode(delay(maximum),'delay');};
  context.createWaveShaper=()=>{shapers++;return fftNode(shaper(),'shaper');};
  context.createChannelSplitter=channels=>{splitters++;return fftNode(splitter(channels),'splitter',channels??6);};
  if(fftBufferWitness){const constant=context.createConstantSource.bind(context);context.createConstantSource=()=>fftNode(constant(),'constant');}
  if(masterNative){
    if(!control)throw Error('audio-probe-master-control');
    const nodePrototype=target.AudioNode.prototype,paramPrototype=target.AudioParam.prototype;
    /** @type {Array<()=>object|boolean>} */const restorations=[];
    /** @param {object} object @param {string} name @param {PropertyDescriptor} descriptor */
    const replace=(object,name,descriptor)=>{
      const previous=Object.getOwnPropertyDescriptor(object,name);
      Object.defineProperty(object,name,descriptor);
      restorations.push(()=>previous?Object.defineProperty(object,name,previous):Reflect.deleteProperty(object,name));
    };
    try{
      const nodeMethods=Object.entries(masterNative.node).map(([name,descriptor])=>{
        if(!descriptor||typeof descriptor.value!=='function'||!descriptor.configurable)throw Error('audio-probe-master-node-descriptor');
        return {name,descriptor,native:descriptor.value};
      });
      const paramMethods=Object.entries(masterNative.param).map(([name,descriptor])=>{
        const setter=name==='value'||name==='automationRate';
        const native=setter?descriptor?.set:descriptor?.value;
        if(!descriptor?.configurable||typeof native!=='function'||setter&&typeof descriptor.get!=='function')throw Error('audio-probe-master-param-descriptor');
        return {name,descriptor,native,setter};
      });
      for(const name of Object.keys(masterNative.factories))if(typeof masterNative.factories[name]!=='function')throw Error('audio-probe-master-factory-descriptor');
      for(const {name,descriptor,native} of nodeMethods){
        replace(nodePrototype,name,{...descriptor,value:/** @this {AudioNode} @param {...unknown} args */function(...args){
          const ticket=masterGuard(()=>masterGraphBefore(this,name,args));
          let result;try{result=Reflect.apply(native,this,args);}catch(error){masterGuard(()=>masterGraphAfter(ticket,true));throw error;}
          masterGuard(()=>masterGraphAfter(ticket,false));return result;
        }});
      }
      for(const {name,descriptor,native,setter} of paramMethods){
        replace(paramPrototype,name,{...descriptor,[setter?'set':'value']:/** @this {AudioParam} @param {...unknown} args */function(...args){
          const ticket=masterGuard(()=>masterParamBefore(this,name,args));
          let result;try{result=Reflect.apply(native,this,args);}catch(error){masterGuard(()=>masterParamAfter(ticket,true));throw error;}
          masterGuard(()=>masterParamAfter(ticket,false));return result;
        }});
      }
      masterRegister(sink,'PROGRAM','observer');masterRegister(control,'CONTROL','observer');
      let gainCount=0,delayCount=0,compressorCount=0,shaperCount=0,sourceCount=0,splitterCount=0;
      for(const name of Object.keys(masterNative.factories)){
        const native=masterNative.factories[name];
        replace(context,name,{configurable:true,writable:true,value:/** @this {AudioContext} @param {...unknown} args */function(...args){
          const tracked=this===context&&!masterState.sealed,order=tracked?masterGuard(masterBegin):null;
          let node;try{node=Reflect.apply(native,this,args);}catch(error){if(tracked)masterGuard(()=>{masterInvalid('native-factory');masterEnd(order);});throw error;}
          if(tracked)masterGuard(()=>{
            if(name==='createMediaElementSource'?(args.length!==1||args[0]!==signalVideo):name==='createDelay'?(args.length!==1||typeof args[0]!=='number'||!Number.isFinite(args[0])):name==='createChannelSplitter'?(args.length!==1||typeof args[0]!=='number'):args.length!==0)masterInvalid('factory-argument');
            if(name==='createGain'){
              const i=gainCount;gainCount=Math.min(9,gainCount+1);if(i<8)gains.push(node);
              if(i>=8)masterInvalid('gain-cap');else masterRegister(node,`G${i}`,'gain',`P${i}`);
            }else if(name==='createDelay'){
              const i=delayCount;delayCount=Math.min(3,delayCount+1);delays=Math.min(3,delays+1);if(i>=2)masterInvalid('delay-cap');else masterRegister(node,`D${i}`,'delay');
            }else if(name==='createDynamicsCompressor'){
              compressors=Math.min(2,compressors+1);const duplicate=compressorCount>0;compressorCount=1;if(duplicate)masterInvalid('compressor-cap');else masterRegister(node,'C0','compressor');
            }else if(name==='createWaveShaper'){
              shapers=Math.min(2,shapers+1);const duplicate=shaperCount>0;shaperCount=1;if(duplicate)masterInvalid('shaper-cap');else masterRegister(node,'H0','shaper');
            }else if(name==='createChannelSplitter'){
              splitters++;
              if(args.length<=1&&args[0]===5){if(splitterCount)masterInvalid('control-splitter-cap');else{splitterCount=1;masterRegister(node,'T5','splitter');}}
              else if(args.length>1||args[0]!==2)masterInvalid('splitter-kind');
            }else if(name==='createMediaElementSource'){
              if(sourceCount)masterInvalid('source-cap');else{sourceCount=1;masterRegister(node,'S0','source');}
              const frame=Math.round(context.currentTime*sampleRate);
              if(!echo)echo=observe(2,echoChunks,1,node);else node.connect(echo);
              sources=Math.min(2,sources+1);sourceFrame=frame;
            }
            masterEnd(order);
          });
          return node;
        }});
      }
      replace(target,'AudioWorkletNode',{configurable:true,writable:true,value:new Proxy(masterNative.worklet,{construct(native,args,newTarget){
        const [ctx,name]=args,relevant=name==='knife-audio-transition-l1',order=relevant?masterGuard(masterBegin):null;
        /** @type {AudioWorkletNode} */let node;try{node=Reflect.construct(native,args,newTarget);}catch(error){if(relevant)masterGuard(()=>{masterInvalid('native-constructor');masterEnd(order);});throw error;}
        if(relevant)masterGuard(()=>{
          masterL1(node,ctx,name,args);l1Nodes=Math.min(2,l1Nodes+1);masterEnd(order);
          node.connect(control,1);
          node.port.addEventListener('message',event=>{
            if(recordingFrozen){masterInvalid('recording-frozen');return;}
            if(!masterState.sealed)masterGuard(()=>{const data=event.data;if(!record(data)||data.sourceEpoch!==masterState.initial.sourceEpoch)masterInvalid('reply-epoch');});
            reply(event.data);
          });node.port.start();
          const post=node.port.postMessage;
          node.port.postMessage=function(...argv){
            const ticket=!masterState.sealed?masterGuard(()=>{if(masterState.pending)masterInvalid('native-reentry');masterState.pending++;return true;}):null;
            let result;try{result=Reflect.apply(post,this,argv);}catch(error){masterGuard(()=>{masterInvalid('native-post');masterEnd(ticket);});throw error;}
            masterGuard(()=>{
              if(!masterState.sealed){
                if(this!==node.port||argv.length<1||argv.length>2||!record(argv[0])||argv[0].sourceEpoch!==masterState.initial.sourceEpoch)masterInvalid('post-scope');
                if(recordingFrozen)masterInvalid('recording-frozen');else command(argv[0]);
              }
              masterEnd(ticket);
            });return result;
          };
        });
        return node;
      }})});
    }catch(error){
      masterInvalid('hook-install');const errors=[error];
      for(const restore of restorations.reverse())try{if(restore()===false)throw Error('audio-probe-master-restore');}catch(restoreError){errors.push(restoreError);}
      throw new AggregateError(errors,'audio-probe-master-install');
    }
  }
  const timers=/** @type {Window} */(target),interval=timers.setInterval.bind(timers),clear=timers.clearInterval.bind(timers);
  timers.setInterval=(callback,timeout,...args)=>{
    if(typeof callback!=='function')throw new Error('audio-probe-timer');
    const invoke=()=>{
      if(recordingFrozen||!normalizerWitness||timeout!==100)return callback(...args);
      const startRead=powerReads.length,startTime=context.currentTime,startAttempt=analysisAttempts.length,startWall=normalizerControl?performance.now():0;
      try{return callback(...args);}finally{
        if(meterTickReads.length>=2000)streamError||='audio-normalizer-tick-bound';
        else meterTickReads.push({ordinal:meterTickReads.length+1,startRead,endRead:powerReads.length,startTime,endTime:context.currentTime,...(normalizerControl?{startAttempt,endAttempt:analysisAttempts.length,startWall,endWall:performance.now()}:{})});
      }
    },id=interval(invoke,timeout);ticks.set(id,{invoke,active:true,timeout});return id;
  };
  timers.clearInterval=id=>{const tick=ticks.get(id);if(tick)tick.active=false;clear(id);};
  target.AudioContext=/** @type {typeof AudioContext} */(/** @type {unknown} */(class {constructor(){return context;}}));
  const runtime=()=>{
    /** @type {unknown} */const value=Object.getOwnPropertyDescriptor(target,Symbol.for('cheese-knife.runtime.v1'))?.value;
    if(!value||typeof value!=='object')throw new Error('audio-probe-runtime');
    return /** @type {ProbeRuntime} */(value);
  };
  const video=()=>{const element=document.querySelector('video');if(!element)throw new Error('audio-probe-video');return element;};
  const signalFacts=()=>{
    if(!signal)return null;
    const element=video();
    if(element!==signalVideo||element.src!==url||element.currentSrc&&element.currentSrc!==url)signalError||='source-changed';
    if(element.loop||element.ended||element.playbackRate!==1)signalError||='media-state';
    return {...signal,error:signalError};
  };
  const bootstrap=()=>{
    if(observed)throw new Error('audio-l1-fake-bootstrap-forbidden');
    const state=runtime(),config=configured??={...target.normalizeConfig({}),...target.KnifeMediaProfiles.projectGlobalAudio({})};
    target.postMessage({namespace:'cheese-knife',protocol:3,type:'config',requestId:state.mediaRequestId,context:{...state.media.context},
      deliverySequence:sequence++,baseConfig:config,effectiveConfig:config,i18n:{},version:{globalRevision:0,mediaRevision:0},
      profileState:'global',revisionStatus:'ready',mediaPhase:'ready',audioBindingGeneration:1,audioKind:'global',videoKind:'global',gainOrigin:'site-legacy'},location.origin);
  };
  target.addEventListener('message',event=>{
    /** @type {unknown} */const data=event.data;
    if(product||!configured||event.source!==target||event.origin!==target.location.origin||!data||typeof data!=='object')return;
    if(Reflect.get(data,'namespace')==='cheese-knife'&&Reflect.get(data,'protocol')===3&&Reflect.get(data,'type')==='config-request'&&
      Reflect.get(data,'requestId')===runtime().mediaRequestId)bootstrap();
  });
  const probe=/** @type {ProcessingProbe} */({async action(input){
    switch(input.kind){
      case 'bootstrap':bootstrap();return null;
      case 'signal':{
        if(retainSignal&&(input.frequency!==1000||input.inputDbfs!==-36||input.pattern!=='tone-silence'||(input.phase??.37)!==.37||input.durationSeconds!==90))throw Error('audio-retained-signal');
        if(!Number.isFinite(input.frequency)||input.frequency<=0||input.frequency>=sampleRate/2||!Number.isFinite(input.inputDbfs)||input.inputDbfs>(input.pattern==='dc'?0:-3.1)||input.inputDbfs< -90)throw new Error('audio-probe-signal');
        if(input.durationSeconds!==undefined&&(!product||!Number.isSafeInteger(input.durationSeconds)||input.durationSeconds<1||input.durationSeconds>90))throw new Error('audio-probe-signal-duration');
        if(product&&signal){signalError||='signal-replaced';throw new Error('audio-product-input-replaced');}
        const durationSeconds=input.durationSeconds??20;
        const element=video();element.pause();
        const channels=input.pattern==='mono'?1:2,length=sampleRate*durationSeconds,bytes=new ArrayBuffer(44+length*channels*4),view=new DataView(bytes);
        /** @param {number} offset @param {string} text */const text=(offset,text)=>[...text].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));
        text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,3,true);view.setUint16(22,channels,true);
        view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channels*4,true);view.setUint16(32,channels*4,true);view.setUint16(34,32,true);text(36,'data');view.setUint32(40,length*channels*4,true);
        const amplitude=Math.SQRT2*10**(input.inputDbfs/20);
        const phase=input.phase??.37;if(!Number.isFinite(phase)||phase<0||phase>2*Math.PI)throw new Error('audio-probe-signal-phase');
        for(let n=0;n<length;n++)for(let channel=0;channel<channels;channel++){
          let value=Math.sin(2*Math.PI*input.frequency*n/sampleRate+phase)*amplitude;
          if(input.pattern==='silence'||input.pattern==='left'&&channel===1||input.pattern==='right'&&channel===0)value=0;
          if(input.pattern==='antiphase'&&channel===1)value=-value;
          if(input.pattern==='tone-silence'&&n>=sampleRate*8)value=0;
          if(input.pattern==='dc')value=10**(input.inputDbfs/20);
          if(input.pattern==='bursts')value*=(n+Math.round(sampleRate*.1*phase/(2*Math.PI)))%(sampleRate/10)<sampleRate/50?1:0;
          if(input.pattern==='noise')value=amplitude*Math.sin(n*123.4567)*Math.sin(n*765.4321);
          view.setFloat32(44+(n*channels+channel)*4,value,true);
        }
        if(url)URL.revokeObjectURL(url);element.loop=!installed&&!product;element.src=url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
        await new Promise((resolve,reject)=>{element.addEventListener('loadeddata',resolve,{once:true});element.addEventListener('error',reject,{once:true});});
        if(product){
          signal={frequency:input.frequency,inputDbfs:input.inputDbfs,phase,channels,durationSeconds,frames:length,loop:false,...(normalizerWitness?{pattern:input.pattern}:{})};signalVideo=element;
          for(const event of ['ended','seeking','ratechange','emptied','pause','error'])element.addEventListener(event,()=>{signalError||=event;});
          new MutationObserver(()=>{signalError||='source-or-loop-mutation';}).observe(element,{attributes:true,attributeFilter:['src','loop']});
        }
        return {channels,sampleRate,durationSeconds,frames:length};
      }
      case 'configure':{
        if(installed)throw new Error('audio-l1-direct-config-forbidden');
        if(product&&signalFacts()?.error)throw new Error('audio-product-input-invalid');
        const state=runtime(),element=video(),frame=Math.round(context.currentTime*sampleRate);configured={...state.config,...input.config};state.config={...configured};state.audio.configure();
        state.audio.setGain(element,input.gain);const expected=input.enabled?'on':'off';
        const status=state.audio.getState(element)===expected?expected:await state.audio.setEnabled(element,input.enabled);await element.play();return {status,frame};
      }
      case 'fft-buffer':if(!fftBufferWitness)throw Error('audio-probe-fft-buffer-disabled');return fftView(true);
      case 'l1-partial':{
        if(!observed)throw new Error('audio-l1-not-installed');
        return {...(masterWitness?{masterWitness:masterView(true)}:{}),...(sourceStartWitness?{sourceStart:sourceStartReport??sourceStartView()}:{}),...(retainSignal?{retention:{...retention(),exported:false}}:{}),...(fftBufferWitness?{fftBufferWitness:fftView(false)}:{}),schema:product?'f01-product-partial-v1':'f01-l1-partial-v1',...(normalizerControl?{normalizerControl:controlView()}:{}),...(product?{productObservation:true,signal:signalFacts(),meterDiagnostics,firstStreamFailure,firstStreamFailureEvidence,...(rapidMasterRequest?{rapidMasterRequest:JSON.parse(JSON.stringify(rapidMasterRequest))}:{})}:{}),...(oracle?{oracleEvidence:oracleView(true)}:{}),sampleRate,sourceFrame,captureStartFrame,sources,l1Nodes,streamError,invalidFrames,invalidChunks,commands,replies,moduleLoads,
          streams:streamRows.map((rows,index)=>({channels:streamCounts[index],chunks:rows.map(row=>{
            const count=row.samples.length,bytes=new Uint8Array(128*count*4),view=new DataView(bytes.buffer);
            for(let n=0;n<128;n++)for(let c=0;c<count;c++)view.setFloat32((n*count+c)*4,row.samples[c]?.[n]??NaN,true);
            let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));
            return {frame:row.frame,encoding:'interleaved-float32le',base64:btoa(binary)};
          })}))};
      }
      case 'product-capture':
      case 'l1-capture':{
        const timed=input.kind==='product-capture'&&input.timing===true;
        if(input.kind==='product-capture'&&input.timing!==undefined&&(typeof input.timing!=='boolean'||!normalizerSignal))throw new Error('audio-probe-timing-profile');
        const captureStarted=timed?performance.now():0;let pcmMs=0,encodeMs=0;
        if(retainSignal&&!recordingFrozen)throw Error('audio-retained-not-frozen');
        if((input.kind==='product-capture'?!product:!installed)||retainedError||streamError||invalidFrames||sources!==1||l1Nodes!==1||sourceFrame===null)throw new Error(streamError||'audio-l1-capture-invalid');
        const streams=retainSignal?retainedRows:streamRows,counts=streamCounts;
        const commonStart=Math.max(Math.ceil(sourceFrame/128)*128,...streams.map(rows=>rows[0]?.frame??Infinity));
        const commonEnd=Math.min(...streams.map(rows=>(rows.at(-1)?.frame??-128)+128));
        const start=input.kind==='product-capture'?(input.startFrame??commonStart):commonStart;
        const end=input.kind==='product-capture'?(input.endFrame??Math.min(commonEnd,start+sampleRate)):commonEnd;
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<commonStart||end>commonEnd||end<=start||(end-start)*counts.reduce((sum,n)=>sum+n,0)*4>96*1024*1024||product&&end-start>sampleRate*1.5)throw new Error('audio-l1-capture-bound');
        /** @type {ReturnType<typeof sourceStartView>|null} */let startReport=null;
        const encoded=streams.map((rows,index)=>{
          const streamStarted=timed?performance.now():0;
          const count=counts[index];if(count===undefined)throw new Error('audio-l1-channel-count');
          const bytes=new Uint8Array((end-start)*count*4),view=new DataView(bytes.buffer),coverage=new Uint8Array(end-start);
          for(const row of rows){const a=Math.max(start,row.frame),b=Math.min(end,row.frame+128);if(a>=b)continue;
            for(let frame=a;frame<b;frame++){
              if(coverage[frame-start])throw new Error('audio-l1-overlap');coverage[frame-start]=1;
              for(let c=0;c<count;c++){const value=row.samples[c]?.[frame-row.frame];if(value===undefined||!Number.isFinite(value))throw new Error('audio-l1-sample');view.setFloat32(((frame-start)*count+c)*4,value,true);}
            }
          }
          if(coverage.some(value=>value!==1))throw new Error('audio-l1-gap');
          if(sourceStartWitness&&input.kind==='product-capture'&&index===1&&sourceStartReport===null)startReport=sourceStartView({start,end,view});
          const pcmEnded=timed?performance.now():0;
          let base64;
          if('toBase64' in bytes&&typeof bytes.toBase64==='function')base64=bytes.toBase64();
          else{let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));base64=btoa(binary);}
          const encoded={start,end,channels:count,encoding:'interleaved-float32le',base64,...(equalizerComponent?{role:['program','source','control','component'][index]}:{})};
          if(timed){pcmMs+=pcmEnded-streamStarted;encodeMs+=performance.now()-pcmEnded;}
          return encoded;
        });
        const result={...(masterWitness?{masterWitness:masterView(false)}:{}),...(product?{schema:equalizerComponent?'f01-product-window-v2':'f01-product-window-v1',start,end,meterDiagnostics,coverage:equalizerComponent?'All four observed streams cover every requested frame exactly once; global formation errors reject all subwindows.':'All three observed streams cover every requested frame exactly once; global formation errors reject all subwindows.'}:{}),sampleRate,sourceFrame,captureStartFrame,observedStarts:{program:streams[0]?.[0]?.frame??null,source:streams[1]?.[0]?.frame??null,control:streams[2]?.[0]?.frame??null,...(equalizerComponent?{component:componentChunks[0]?.frame??null}:{})},commonStart:start,
          streams:encoded,replies,commands,moduleLoads,sources,l1Nodes,invalidFrames,streamError,...(normalizerControl?{normalizerControlEvents:JSON.parse(JSON.stringify(controlEvents))}:{}),...(rapidMasterRequest?{rapidMasterRequest:JSON.parse(JSON.stringify(rapidMasterRequest))}:{}),...(oracle?{oracleEvidence:oracleView(false)}:{}),
          ...(retainSignal&&frozenFacts?{recordingCutoff:frozenAt,readback:frozenFacts.readback,audioTime:frozenFacts.audioTime,mediaTime:/** @type {{currentTime:number}} */(frozenFacts.video).currentTime,hidden:frozenFacts.hidden,contextState:frozenFacts.contextState}:{readback:runtime().audio.getReadback(video()),audioTime:context.currentTime,mediaTime:video().currentTime,hidden:document.hidden,contextState:context.state})};
        if(masterWitness&&input.kind==='product-capture'&&!masterState.sealed&&result.masterWitness)masterLastCapture={cursor:result.masterWitness.cursor,endFrame:end,commandCount:commands.length,replyCount:replies.length};
        if(startReport){sourceStartReport=startReport;return {...result,sourceStart:startReport};}
        return timed?{...result,collectionTiming:{start,end,sampleRate,elapsedMs:performance.now()-captureStarted,pcmMs,encodeMs}}:result;
      }
      case 'capture':{
        if(!Number.isFinite(input.seconds)||input.seconds<=0||input.seconds>1.5)throw new Error('audio-probe-window');
        const last=chunks.at(-1);if(!last||invalidFrames)throw new Error('audio-probe-capture-invalid');
        const end=input.endFrame??last.frame+128,start=end-Math.round(sampleRate*input.seconds);
        if(!Number.isSafeInteger(end)||end>last.frame+128||start<0)throw new Error('audio-probe-window');
        const output=[new Float32Array(end-start),new Float32Array(end-start)],coverage=new Uint8Array(end-start);
        for(const chunk of chunks){const a=Math.max(start,chunk.frame),b=Math.min(end,chunk.frame+128);if(a>=b)continue;
          for(let channel=0;channel<2;channel++){const data=chunk.samples[channel],out=output[channel];if(!data||!out)throw new Error('audio-probe-channel');out.set(data.subarray(a-chunk.frame,b-chunk.frame),a-start);}
          for(let frame=a;frame<b;frame++){if(coverage[frame-start])throw new Error('audio-probe-capture-overlap');coverage[frame-start]=1;}
        }
        if(coverage.some(value=>value!==1))throw new Error('audio-probe-capture-incomplete');return {rate:sampleRate,start,end,channels:output.map(channel=>Array.from(channel))};
      }
      case 'response':{
        const frequency=new Float32Array([input.frequency]),magnitude=new Float32Array(1),phase=new Float32Array(1);let response=0;
        for(const node of filters){node.getFrequencyResponse(frequency,magnitude,phase);response+=20*Math.log10(/** @type {number} */(magnitude[0]));}return response;
      }
      case 'reset-events':{
        if(input.minimumFrame!==undefined&&(!product||!normalizerWitness||normalizerControl||rapidMasterRequest||!safe(input.minimumFrame)))throw Error('audio-probe-warmup-marker-invalid');
        const tail=input.tail===true,attempt=rapidMasterRequest;
        if(tail?(!attempt||!product||!normalizerWitness||normalizerControl||input.minimumFrame!==undefined||attempt.measurement!==null):attempt&&normalizerWitness)throw Error('audio-probe-reentry-tail-marker');
        if(normalizerWitness){
          if(normalizerControl&&controlMeasurement)throw new Error('audio-normalizer-control-marker-repeated');
          if(normalizerControl)controlMeasurement=controlStamp();
          const last=commands.at(-1),message=record(last)?last.message:null,seq=record(message)?message.seq:null;
          const wall=tail?performance.now():null;
          const frame=controlMeasurement?.frame??Math.round(context.currentTime*sampleRate);
          if(input.minimumFrame!==undefined&&frame<input.minimumFrame)return null;
          if(attempt&&wall!==null){
            if(streamError)throw Error(streamError);
            if(invalidFrames||signalFacts()?.error||document.hidden||context.state!=='running')throw Error('audio-probe-reentry-tail-state');
            const {boundary,sourceEpoch:epoch,replyCursor}=attempt,onDone=record(boundary)?boundary.onDone:null;
            const accepted=replies.filter(r=>record(r)&&r.kind==='accepted'&&r.seq===seq);
            const prepared=replies.filter(r=>record(r)&&r.kind==='prepared');
            const on=accepted[0],origin=prepared[0];
            if(attempt.error!==null||!record(boundary)||boundary.status!=='on'||!record(onDone)||typeof onDone.audio!=='number'||typeof onDone.wall!=='number'||!Number.isFinite(onDone.wall)||
              !initial.available||!safe(epoch)||epoch===0||epoch!==initial.sourceEpoch||epoch!==sourceEpoch||attempt.commandCursor!==2||commands.length!==4||
              seq!==4||!record(message)||message.kind!=='configure'||message.wanted!==true||message.sourceEpoch!==epoch||!safe(replyCursor)||
              accepted.length!==1||!record(on)||replies.indexOf(on)<replyCursor||on.sourceEpoch!==epoch||!safe(on.frame)||
              prepared.length!==1||!record(origin)||replies.indexOf(origin)>=replyCursor||origin.sourceEpoch!==epoch||origin.seq!==0||!safe(origin.frame))throw Error('audio-probe-reentry-tail-identity');
            const onDoneFrame=Math.round(onDone.audio*sampleRate),minimum=onDoneFrame+Math.round(sampleRate*180/1000);
            const fftSize=2**Math.ceil(Math.log2(sampleRate*.25)),maximum=Math.min(origin.frame+20*sampleRate,on.frame+fftSize-1);
            if(!safe(onDoneFrame)||on.frame>onDoneFrame||!safe(frame)||frame<onDoneFrame||!Number.isFinite(wall)||wall<onDone.wall||minimum>maximum||frame>maximum)throw Error('audio-probe-reentry-tail-window');
            if(wall-onDone.wall<180||frame<minimum)return null;
            if(sampleRate===96000){
              const completed=replies.filter(r=>record(r)&&r.kind==='completed'&&r.seq===seq);
              const done=completed[0];
              if(!record(done)||!safe(done.frame)||completed.length!==1||replies.indexOf(done)<=replies.indexOf(on)||done.sourceEpoch!==epoch||done.meterEpoch!==on.meterEpoch||done.gain!==1||done.frame<on.frame)throw Error('audio-probe-reentry-tail-identity');
              if(done.frame+4800>maximum)throw Error('audio-probe-reentry-tail-window');
              if(frame<done.frame+4800)return null;
              if(!ledger.available)throw Error('audio-probe-reentry-tail-meter');
              const acceptedEvent=ledgerEvents.find(e=>e.direction==='receive'&&e.packet.kind==='accepted'&&e.packet.seq===seq);
              for(const {direction,packet:ack,order} of ledgerEvents){
                if(direction!=='receive'||ack.kind!=='meter-accepted'||ack.sourceEpoch!==epoch||ack.meterEpoch!==on.meterEpoch||!safe(ack.seq)||!safe(ack.frame)||ack.frame<on.frame||ack.frame>=frame||!record(ack.application)||ack.application.commandSeq!==seq||ack.application.mode!=='warmup')continue;
                const send=ledgerEvents.find(e=>e.direction==='send'&&e.packet.kind==='power'&&e.packet.meterSeq===ack.seq);
                const left=powerReads[2*(ack.seq-1)],right=powerReads[2*(ack.seq-1)+1],time=ack.frame/sampleRate;
                if(send&&acceptedEvent&&acceptedEvent.order<send.order&&send.order<order&&send.packet.sourceEpoch===epoch&&send.packet.meterEpoch===on.meterEpoch&&send.packet.active===true&&send.packet.targetDbfs===-20&&typeof send.packet.observedTime==='number'&&
                  left?.index===2&&right?.index===3&&left.size===fftSize&&right.size===fftSize&&left.power===send.packet.leftPower&&right.power===send.packet.rightPower&&
                  send.packet.observedTime>=on.frame/sampleRate&&send.packet.observedTime<=left.time&&left.time<=right.time&&right.time<=time&&time-send.packet.observedTime<=.2){
                  attempt.warmupMeter={power:send.packet,application:ack.application,reads:[left,right]};break;
                }
              }
              if(!attempt.warmupMeter)throw Error('audio-probe-reentry-tail-meter');
            }
          }
          normalizerMeasurement={frame,powerReadCursor:powerReads.length,meterTickCursor:meterTickReads.length,sourceEpoch:initial.sourceEpoch,commandSeq:safe(seq)?seq:null};
          if(attempt&&wall!==null)attempt.measurement={...normalizerMeasurement,wall};
          return {...normalizerMeasurement};
        }
        events=[];linearEvents=[];steps=[];bins=[];
        powerReads=[];reads=0;buffers.clear();return null;
      }
      case 'video':if(typeof input.muted!=='boolean'||!Number.isFinite(input.volume)||input.volume<0||input.volume>1)throw new Error('audio-probe-video-state');video().muted=input.muted;video().volume=input.volume;return null;
      case 'analysis-error':{
        if(normalizerSignal){if(input.enabled!==false)throw new Error('audio-normalizer-signal-injection');return null;}
        if(normalizerControl){
          if(typeof input.enabled!=='boolean'||input.enabled&&(controlEvents.length!==1||analysisError)||!input.enabled&&analysisError&&controlEvents.length!==2)throw new Error('audio-normalizer-control-error-order');
          if(!input.enabled&&!analysisError)return null;
          const at=controlStamp();controlEvents.push({kind:'analysis-error',enabled:input.enabled,at});analysisError=input.enabled;return {enabled:input.enabled,at};
        }
        analysisError=input.enabled;return null;
      }
      case 'stall':{
        if(normalizerSignal)throw new Error('audio-normalizer-signal-injection');
        if(input.milliseconds<210||input.milliseconds>1000)throw new Error('audio-probe-stall');
        if(normalizerControl&&(input.milliseconds!==240||controlEvents.length||!controlMeasurement))throw new Error('audio-normalizer-control-stall-order');
        const boundary=normalizerControl?{kind:'stall',milliseconds:input.milliseconds,start:controlStamp(),end:/** @type {ReturnType<typeof controlStamp>|null} */(null)}:null;
        if(boundary)controlEvents.push(boundary);
        const start=context.currentTime,end=performance.now()+input.milliseconds;while(performance.now()<end){}
        if(boundary){boundary.end=controlStamp();return JSON.parse(JSON.stringify(boundary));}return {start,end:context.currentTime};
      }
      case 'rapid-master':{
        if(product){
          if(rapidMasterRequest)throw new Error('audio-product-rapid-already-attempted');
          if(normalizerWitness&&!normalizerControl&&sampleRate===96000&&(input.startPhaseMs!==2||input.milliseconds!==10))throw Error('audio-probe-rapid-master');
          rapidMasterRequest={input:{startPhaseMs:input.startPhaseMs,milliseconds:input.milliseconds},sourceEpoch:initial.sourceEpoch,commandCursor:commands.length,replyCursor:replies.length,warmupMeasurement:normalizerMeasurement?{...normalizerMeasurement}:null,boundary:null,measurement:null,error:null};
        }
        try{
        if(![0,10,15,25,36,41,46].includes(input.milliseconds)||![0,2,5].includes(input.startPhaseMs))throw new Error('audio-probe-rapid-master');
        const state=runtime(),element=video(),initial=context.currentTime,deadline=performance.now()+100;
        while(context.currentTime===initial&&performance.now()<deadline){}
        if(context.currentTime===initial)throw new Error('audio-probe-clock-stalled');
        const stamp=()=>({audio:context.currentTime,wall:performance.now()}),edge=stamp();
        while(performance.now()<edge.wall+input.startPhaseMs){}
        const offEventIndex=events.length,off=stamp();await state.audio.setEnabled(element,false);const offDone=stamp(),offEventEnd=events.length;
        while(performance.now()<off.wall+input.milliseconds){}
        const onStepIndex=steps.length,on=stamp(),status=await state.audio.setEnabled(element,true),onDone=stamp(),onStepEnd=steps.length;
        const boundary={edge,off,offDone,on,onDone,status,offEventIndex,offEventEnd,onStepIndex,onStepEnd};
        if(rapidMasterRequest)rapidMasterRequest.boundary=boundary;return boundary;
        }catch(error){if(rapidMasterRequest)rapidMasterRequest.error=String(error);throw error;}
      }
      case 'retired-ticks':for(const tick of ticks.values())if(!tick.active&&tick.timeout===100)tick.invoke();return null;
      case 'master-seal':{
        if(!masterWitness||!safe(input.endFrame)||input.endFrame===0)throw Error('audio-probe-master-seal-profile');
        if(masterState.sealed){if(input.endFrame!==masterState.endFrame)throw Error('audio-probe-master-seal-repeated');return masterView(true);}
        const lastFrames=[chunks,echoChunks,controlChunks].map(rows=>{const last=rows.at(-1),channel=last?.samples[0];return last&&channel?last.frame+channel.length:null;});
        if(recordingFrozen||!masterScope()||masterState.pending!==0||!masterLastCapture||masterLastCapture.endFrame!==input.endFrame||masterLastCapture.cursor!==masterState.cursor||masterLastCapture.commandCount!==commands.length||masterLastCapture.replyCount!==replies.length||streamError||signalError||invalidFrames||sources!==1||l1Nodes!==1||lastFrames.some(frame=>!safe(frame)||frame<input.endFrame))throw Error('audio-probe-master-seal-incomplete');
        masterState.sealed=true;masterState.endFrame=input.endFrame;masterFinal=masterFullView();return structuredClone(masterFinal);
      }
      case 'freeze-normalizer':
      case 'facts':{
        const pendingFreeze=input.kind==='freeze-normalizer';
        if(pendingFreeze){
          if(!normalizerSignal||!controlMeasurement)throw new Error('audio-normalizer-signal-freeze-profile');
          if(input.waitForReady!==undefined&&(!retainSignal||input.waitForReady!==true))throw new Error('audio-normalizer-signal-freeze-profile');
          if(recordingFrozen)throw new Error('audio-normalizer-signal-already-frozen');
          const at=controlStamp(),prepared=replies.find(raw=>record(raw)&&raw.kind==='prepared'),preparedFrame=record(prepared)?prepared.frame:null;
          if(!safe(input.endFrame)||input.endFrame<=controlMeasurement.frame||!safe(preparedFrame)||input.endFrame>preparedFrame+20*sampleRate||at.frame>preparedFrame+20*sampleRate||
            input.waitForReady&&input.endFrame!==controlMeasurement.frame+17.5*sampleRate)throw new Error('audio-normalizer-signal-freeze-bound');
          if(retainedError||streamError||invalidFrames||signalError||!ledger.available||sources!==1||l1Nodes!==1||controlEvents.length||analysisError)throw new Error('audio-normalizer-signal-freeze-invalid');
          const commonEnd=Math.min(...streamRows.map(rows=>(rows.at(-1)?.frame??-128)+128));
          if(at.frame<input.endFrame||meterDiagnostics.sent!==meterDiagnostics.received||commonEnd<input.endFrame||commonEnd<=Number(meterDiagnostics.lastFrame??-1)){
            if(!input.waitForReady)return null;
          }else{
            frozenAt=at;signalEndFrame=input.endFrame;recordingFrozen=true;
            frozenFacts=JSON.parse(JSON.stringify(await probe.action({kind:'facts',fullOracle:true})));
            return JSON.parse(JSON.stringify(frozenFacts));
          }
        }
        const observedRows=retainSignal&&recordingFrozen?retainedRows:streamRows;
        if(frozenFacts)return JSON.parse(JSON.stringify(frozenFacts));
        const fullOracle=input.kind==='facts'?input.fullOracle:undefined;
        if(fullOracle!==undefined&&(typeof fullOracle!=='boolean'||fullOracle&&!normalizerWitness))throw new Error('audio-probe-full-oracle');
        return {...(masterWitness?{masterWitness:masterView(true)}:{}),...(fftBufferWitness?{fftBufferWitness:fftView(false)}:{}),sampleRate,audioTime:frozenAt?.time??context.currentTime,contextState:context.state,hidden:document.hidden,sources,gainNodes:gains.length,filters:filters.length,compressors,delays,shapers,splitters,
        ...(headroomWitness?{compressorParameters:compressorNodes.map(node=>({threshold:node.threshold.value,knee:node.knee.value,ratio:node.ratio.value}))}:{}),
        ...(equalizerComponent?{equalizerComponent:true}:{}),
        ...(oracle?{oracleEvidence:oracleView(fullOracle===true)}:{}),
        ...(normalizerWitness?{normalizerMeasurement:normalizerMeasurement?{...normalizerMeasurement}:null,...(pendingFreeze?{}:{meterTickReads:meterTickReads.map(row=>({...row}))}),normalizerSettings:{normalizerEnabled:runtime().config.normalizerEnabled,normalizerTargetDbfs:runtime().config.normalizerTargetDbfs,compressorEnabled:runtime().config.compressorEnabled,eqEnabled:runtime().config.eqEnabled}}:{}),
        ...(product?{signal:signalFacts(),productObservation:{commonStart:Math.max(sourceFrame===null?Infinity:Math.ceil(sourceFrame/128)*128,...observedRows.map(rows=>rows[0]?.frame??Infinity)),commonEnd:Math.min(...observedRows.map(rows=>(rows.at(-1)?.frame??-128)+128)),bufferedChunks:observedRows.map(rows=>rows.length),meterDiagnostics,commands,replies,moduleLoads,sourceFrame,sources,l1Nodes,invalidFrames,streamError:retainedError||streamError,...(retainSignal?{retention:retention()}:{}),firstStreamFailure,...(rapidMasterRequest?{rapidMasterRequest:JSON.parse(JSON.stringify(rapidMasterRequest))}:{})}}:{}),
        ...(normalizerControl?{normalizerControl:controlView()}:{}),
        analysers:analysers.length,fftSizes:analysers.map(node=>node.fftSize),buffers:buffers.size,reads,invalidFrames,invalidChunks,captureStartFrame,events,linearEvents,steps,
        ...(pendingFreeze?{}:{bins,powerReads:normalizerControl?powerReads.map(p=>({...p})):powerReads}),
        gains:gains.map(node=>node.gain.value),active100msTimers:[...ticks.values()].filter(tick=>tick.active&&tick.timeout===100).length,
        readback:runtime().audio.getReadback(video()),video:{muted:video().muted,volume:video().volume,paused:video().paused,currentTime:video().currentTime,...(product?{ended:video().ended,loop:video().loop,playbackRate:video().playbackRate}:{})}};
      }
    }
  }});
  Object.defineProperty(target,Symbol.for('cheese-knife.f01-processing-probe'),{value:probe});
  // 보관한 원본 생성자로 시험 컨텍스트의 출처를 확인한다.
  if(!(context instanceof Native))throw new Error('audio-probe-context');
}

/** Playwright가 검증 페이지로 직렬화해 전달하는 진입점이다.
 * @param {ProcessingAction} input
 */
export async function callProcessingProbe(input){
  /** @type {unknown} */const probe=Object.getOwnPropertyDescriptor(window,Symbol.for('cheese-knife.f01-processing-probe'))?.value;
  if(!probe||typeof probe!=='object'||typeof Reflect.get(probe,'action')!=='function')throw new Error('audio-probe-missing');
  return await /** @type {ProcessingProbe} */(probe).action(input);
}
