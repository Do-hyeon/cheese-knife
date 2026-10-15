/** @typedef {'stereo'|'mono'|'antiphase'|'left'|'right'|'silence'|'noise'|'bursts'|'dc'|'tone-silence'} SignalPattern */
/** @typedef {{kind:'bootstrap'}|{kind:'signal',frequency:number,inputDbfs:number,pattern:SignalPattern,phase?:number}|{kind:'configure',config:Record<string,unknown>,gain:number,enabled:boolean}|{kind:'capture',seconds:number,endFrame?:number}|{kind:'facts'}|{kind:'response',frequency:number}|{kind:'reset-events'}|{kind:'analysis-error',enabled:boolean}|{kind:'stall',milliseconds:number}|{kind:'rapid-master',milliseconds:0|10|15|25,startPhaseMs:0|2|5}|{kind:'retired-ticks'}|{kind:'video',muted:boolean,volume:number}} ProcessingAction */
/** @typedef {{action:(input:ProcessingAction)=>Promise<unknown>}} ProcessingProbe */
/** @typedef {{config:Record<string,unknown>,mediaRequestId:string,media:{context:Record<string,unknown>},audio:{configure:()=>void,setEnabled:(video:HTMLVideoElement,value:boolean)=>Promise<string>,getState:(video:HTMLVideoElement)=>string,setGain:(video:HTMLVideoElement,value:number)=>number,getReadback:(video:HTMLVideoElement)=>unknown}}} ProbeRuntime */

/** Synthetic-only instrumentation; nothing here is injected by the released extension.
 * @param {number} sampleRate
 */
export async function installProcessingProbe(sampleRate){
  if(![44100,48000,96000].includes(sampleRate))throw new Error('audio-probe-rate');
  const target=/** @type {Window & typeof globalThis & {normalizeConfig:(value:Record<string,unknown>)=>Record<string,unknown>,KnifeMediaProfiles:{projectGlobalAudio:(value:Record<string,unknown>)=>Record<string,unknown>}}} */(window);
  const context=new AudioContext({sampleRate}),Native=target.AudioContext;
  if(context.sampleRate!==sampleRate)throw new Error('audio-probe-native-rate');
  /** @type {{frame:number,samples:Float32Array[]}[]} */let chunks=[];
  /** @type {GainNode[]} */const gains=[];
  /** @type {BiquadFilterNode[]} */const filters=[];
  /** @type {AnalyserNode[]} */const analysers=[];
  /** @type {{node:number,from:number,to:number,start:number,end:number,observed:number}[]} */let events=[];
  /** @type {{node:number,from:number,to:number,start:number,end:number,observed:number}[]} */let linearEvents=[];
  /** @type {{node:number,from:number,to:number,start:number,end:number,observed:number}[]} */let steps=[];
  /** @type {{start:number,end:number,count:number[],squares:number[],peaks:number[],over:number[]}[]} */let bins=[];
  /** @type {{index:number,time:number,power:number,size:number}[]} */let powerReads=[];
  /** @type {{frame:number,observedFrame:number,sourceFrame:number|null,reason:string,lengths:number[]}[]} */const invalidChunks=[];
  /** @type {number|null} */let sourceFrame=null;
  /** @type {number|null} */let captureStartFrame=null;
  const buffers=new Set(),ticks=new Map();
  let sources=0,compressors=0,delays=0,shapers=0,splitters=0,reads=0,invalidFrames=0,analysisError=false,url='',sequence=100;
  /** @type {Record<string,unknown>|null} */let configured=null;
  const code=`class Capture extends AudioWorkletProcessor {
    process(inputs,outputs){for(const channel of outputs[0]||[])channel.fill(0);
      const samples=(inputs[0]||[]).map(channel=>new Float32Array(channel));
      this.port.postMessage({frame:currentFrame,samples},samples.map(channel=>channel.buffer));return true;}
  }registerProcessor('f01-processing-capture',Capture);`;
  const module=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  try{await context.audioWorklet.addModule(module);}finally{URL.revokeObjectURL(module);}
  const sink=new AudioWorkletNode(context,'f01-processing-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});
  sink.connect(context.destination);
  Object.defineProperty(context,'destination',{get:()=>sink});
  sink.port.onmessage=({data})=>{
    /** @type {{frame:number,samples:Float32Array[]}} */const chunk=data;
    if(chunk.samples.length!==2||chunk.samples.some(channel=>!(channel instanceof Float32Array)||channel.length!==128)){
      if(sources){
        const startup=chunk.samples.length===0&&Number.isSafeInteger(chunk.frame)&&chunk.frame>=0&&(captureStartFrame===null||chunk.frame<captureStartFrame);
        if(!startup)invalidFrames++;
        invalidChunks.push({frame:chunk.frame,observedFrame:Math.round(context.currentTime*sampleRate),sourceFrame,reason:'channel-shape',lengths:chunk.samples.map(channel=>channel.length)});if(invalidChunks.length>64)invalidChunks.shift();
      }return;
    }
    if(sources&&captureStartFrame===null)captureStartFrame=chunk.frame;
    chunks.push(chunk);while(chunks.length>2000)chunks.shift();
    const width=sampleRate/10;
    for(let n=0;n<128;n++){
      const frame=chunk.frame+n,start=Math.floor(frame/width)*width;
      let bin=bins.at(-1);
      if(!bin||bin.start!==start){bin={start,end:start+width,count:[0,0],squares:[0,0],peaks:[0,0],over:[0,0]};bins.push(bin);while(bins.length>600)bins.shift();}
      for(let channel=0;channel<2;channel++){
        const value=chunk.samples[channel]?.[n];
        if(value===undefined||!Number.isFinite(value)){invalidFrames++;invalidChunks.push({frame,observedFrame:Math.round(context.currentTime*sampleRate),sourceFrame,reason:'nonfinite',lengths:chunk.samples.map(channel=>channel.length)});if(invalidChunks.length>64)invalidChunks.shift();continue;}
        bin.count[channel]=/** @type {number} */(bin.count[channel])+1;
        bin.squares[channel]=/** @type {number} */(bin.squares[channel])+value*value;
        bin.peaks[channel]=Math.max(/** @type {number} */(bin.peaks[channel]),Math.abs(value));
        if(Math.abs(value)>1)bin.over[channel]=/** @type {number} */(bin.over[channel])+1;
      }
    }
  };
  const source=context.createMediaElementSource.bind(context);
  context.createMediaElementSource=video=>{sources++;sourceFrame=Math.round(context.currentTime*sampleRate);return source(video);};
  const gain=context.createGain.bind(context);
  context.createGain=()=>{
    const node=gain(),index=gains.length;gains.push(node);
    const set=node.gain.setValueAtTime.bind(node.gain),exponential=node.gain.exponentialRampToValueAtTime.bind(node.gain),linear=node.gain.linearRampToValueAtTime.bind(node.gain);
    let value=node.gain.value,start=context.currentTime;
    node.gain.setValueAtTime=(next,time)=>{value=next;start=time;steps.push({node:index,from:next,to:next,start:time,end:time,observed:context.currentTime});return set(next,time);};
    node.gain.exponentialRampToValueAtTime=(next,end)=>{const step=steps.at(-1);if(step?.node===index){step.to=next;step.end=end;}events.push({node:index,from:value,to:next,start,end,observed:context.currentTime});if(events.length>10000)throw new Error('audio-probe-event-bound');return exponential(next,end);};
    node.gain.linearRampToValueAtTime=(next,end)=>{linearEvents.push({node:index,from:value,to:next,start,end,observed:context.currentTime});return linear(next,end);};
    return node;
  };
  const filter=context.createBiquadFilter.bind(context);
  context.createBiquadFilter=()=>{const node=filter();filters.push(node);return node;};
  const analyser=context.createAnalyser.bind(context);
  context.createAnalyser=()=>{
    const node=analyser(),index=analysers.length,read=node.getFloatTimeDomainData.bind(node);analysers.push(node);
    node.getFloatTimeDomainData=buffer=>{reads++;buffers.add(buffer);if(analysisError)throw new Error('synthetic-native-analysis-fault');read(buffer);
      let sum=0;for(const value of buffer)sum+=value*value;powerReads.push({index,time:context.currentTime,power:sum/buffer.length,size:buffer.length});
      if(powerReads.length>2000)throw new Error('audio-probe-power-bound');};return node;
  };
  const compressor=context.createDynamicsCompressor.bind(context),delay=context.createDelay.bind(context),shaper=context.createWaveShaper.bind(context),splitter=context.createChannelSplitter.bind(context);
  context.createDynamicsCompressor=()=>{compressors++;return compressor();};
  context.createDelay=maximum=>{delays++;return delay(maximum);};
  context.createWaveShaper=()=>{shapers++;return shaper();};
  context.createChannelSplitter=channels=>{splitters++;return splitter(channels);};
  const timers=/** @type {Window} */(target),interval=timers.setInterval.bind(timers),clear=timers.clearInterval.bind(timers);
  timers.setInterval=(callback,timeout,...args)=>{
    if(typeof callback!=='function')throw new Error('audio-probe-timer');
    const invoke=()=>callback(...args),id=interval(invoke,timeout);ticks.set(id,{invoke,active:true,timeout});return id;
  };
  timers.clearInterval=id=>{const tick=ticks.get(id);if(tick)tick.active=false;clear(id);};
  target.AudioContext=/** @type {typeof AudioContext} */(/** @type {unknown} */(class {constructor(){return context;}}));
  const runtime=()=>{
    /** @type {unknown} */const value=Object.getOwnPropertyDescriptor(target,Symbol.for('cheese-knife.runtime.v1'))?.value;
    if(!value||typeof value!=='object')throw new Error('audio-probe-runtime');
    return /** @type {ProbeRuntime} */(value);
  };
  const video=()=>{const element=document.querySelector('video');if(!element)throw new Error('audio-probe-video');return element;};
  const bootstrap=()=>{
    const state=runtime(),config=configured??={...target.normalizeConfig({}),...target.KnifeMediaProfiles.projectGlobalAudio({})};
    target.postMessage({namespace:'cheese-knife',protocol:3,type:'config',requestId:state.mediaRequestId,context:{...state.media.context},
      deliverySequence:sequence++,baseConfig:config,effectiveConfig:config,i18n:{},version:{globalRevision:0,mediaRevision:0},
      profileState:'global',revisionStatus:'ready',mediaPhase:'ready',audioBindingGeneration:1,audioKind:'global',videoKind:'global',gainOrigin:'site-legacy'},location.origin);
  };
  target.addEventListener('message',event=>{
    /** @type {unknown} */const data=event.data;
    if(!configured||event.source!==target||event.origin!==target.location.origin||!data||typeof data!=='object')return;
    if(Reflect.get(data,'namespace')==='cheese-knife'&&Reflect.get(data,'protocol')===3&&Reflect.get(data,'type')==='config-request'&&
      Reflect.get(data,'requestId')===runtime().mediaRequestId)bootstrap();
  });
  const probe=/** @type {ProcessingProbe} */({async action(input){
    switch(input.kind){
      case 'bootstrap':bootstrap();return null;
      case 'signal':{
        if(!Number.isFinite(input.frequency)||input.frequency<=0||input.frequency>=sampleRate/2||!Number.isFinite(input.inputDbfs)||input.inputDbfs>(input.pattern==='dc'?0:-3.1)||input.inputDbfs< -90)throw new Error('audio-probe-signal');
        const element=video();element.pause();
        // Keep every measured window before the media decoder's loop boundary.
        const channels=input.pattern==='mono'?1:2,length=sampleRate*20,bytes=new ArrayBuffer(44+length*channels*4),view=new DataView(bytes);
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
        if(url)URL.revokeObjectURL(url);element.loop=true;element.src=url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
        await new Promise((resolve,reject)=>{element.addEventListener('loadeddata',resolve,{once:true});element.addEventListener('error',reject,{once:true});});return {channels,sampleRate};
      }
      case 'configure':{
        const state=runtime(),element=video(),frame=Math.round(context.currentTime*sampleRate);configured={...state.config,...input.config};state.config={...configured};state.audio.configure();
        state.audio.setGain(element,input.gain);const expected=input.enabled?'on':'off';
        const status=state.audio.getState(element)===expected?expected:await state.audio.setEnabled(element,input.enabled);await element.play();return {status,frame};
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
      case 'reset-events':events=[];linearEvents=[];steps=[];bins=[];powerReads=[];reads=0;buffers.clear();return null;
      case 'video':if(typeof input.muted!=='boolean'||!Number.isFinite(input.volume)||input.volume<0||input.volume>1)throw new Error('audio-probe-video-state');video().muted=input.muted;video().volume=input.volume;return null;
      case 'analysis-error':analysisError=input.enabled;return null;
      case 'stall':{if(input.milliseconds<210||input.milliseconds>1000)throw new Error('audio-probe-stall');const start=context.currentTime,end=performance.now()+input.milliseconds;while(performance.now()<end){}return {start,end:context.currentTime};}
      case 'rapid-master':{
        if(![0,10,15,25].includes(input.milliseconds)||![0,2,5].includes(input.startPhaseMs))throw new Error('audio-probe-rapid-master');
        const state=runtime(),element=video(),initial=context.currentTime,deadline=performance.now()+100;
        while(context.currentTime===initial&&performance.now()<deadline){}
        if(context.currentTime===initial)throw new Error('audio-probe-clock-stalled');
        const stamp=()=>({audio:context.currentTime,wall:performance.now()}),edge=stamp();
        while(performance.now()<edge.wall+input.startPhaseMs){}
        const off=stamp();await state.audio.setEnabled(element,false);const offDone=stamp();
        while(performance.now()<off.wall+input.milliseconds){}
        const on=stamp(),status=await state.audio.setEnabled(element,true),onDone=stamp();
        return {edge,off,offDone,on,onDone,status};
      }
      case 'retired-ticks':for(const tick of ticks.values())if(!tick.active&&tick.timeout===100)tick.invoke();return null;
      case 'facts':return {sampleRate,audioTime:context.currentTime,contextState:context.state,hidden:document.hidden,sources,gainNodes:gains.length,filters:filters.length,compressors,delays,shapers,splitters,
        analysers:analysers.length,fftSizes:analysers.map(node=>node.fftSize),buffers:buffers.size,reads,invalidFrames,invalidChunks,captureStartFrame,events,linearEvents,steps,bins,powerReads,
        gains:gains.map(node=>node.gain.value),active100msTimers:[...ticks.values()].filter(tick=>tick.active&&tick.timeout===100).length,
        readback:runtime().audio.getReadback(video()),video:{muted:video().muted,volume:video().volume,paused:video().paused,currentTime:video().currentTime}};
    }
  }});
  Object.defineProperty(target,Symbol.for('cheese-knife.f01-processing-probe'),{value:probe});
  // The retained native constructor is only used to attest this test context, never to replace product DSP.
  if(!(context instanceof Native))throw new Error('audio-probe-context');
}

/** Serializable Playwright entry point.
 * @param {ProcessingAction} input
 */
export async function callProcessingProbe(input){
  /** @type {unknown} */const probe=Object.getOwnPropertyDescriptor(window,Symbol.for('cheese-knife.f01-processing-probe'))?.value;
  if(!probe||typeof probe!=='object'||typeof Reflect.get(probe,'action')!=='function')throw new Error('audio-probe-missing');
  return await /** @type {ProcessingProbe} */(probe).action(input);
}
