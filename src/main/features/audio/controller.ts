import type { FeatureStatus, KnifeRuntime, ResourceScope } from '../../runtime/contracts';
import type { AudioController, AudioState } from './contracts';
import { compressorDelay, limiterCurve } from './curve';
import { eqSettings } from './eq';
import { normalizerWindow } from './normalizer';
import type { Eq8, L1Command, L1Retire, L1Meter, L1Reply } from './transition';

type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
interface Job { packet: L1Command | L1Retire; signature: string; resolve: () => void; reject: (error: Error) => void; promise: Promise<void> }
interface Meter {
  splitter: ChannelSplitterNode; left: AnalyserNode; right: AnalyserNode; leftBuffer: Float32Array<ArrayBuffer>;
  rightBuffer: Float32Array<ArrayBuffer>; scope: ResourceScope; source: string; path: string; document: number;
}
interface AudioEntry {
  video: HTMLVideoElement; state: AudioState; wanted: boolean; generation: number; gain: number; sources: number;
  listeners: Set<(state: AudioState, gain: number) => void>; source?: MediaElementAudioSourceNode;
  dry?: GainNode; wet?: GainNode; permit?: GainNode; dryDelay?: DelayNode; compressor?: DynamicsCompressorNode;
  compDelay?: DelayNode; compDry?: GainNode; compWet?: GainNode; compMix?: GainNode; normalizer?: GainNode;
  gainNode?: GainNode; limiter?: WaveShaperNode; latch?: ConstantSourceNode | undefined; node?: AudioWorkletNode | undefined; controls?: ChannelSplitterNode | undefined;
  prepared?: Promise<void> | undefined; boundKey?: string; detachedSince?: number | null;
  connected?: boolean; failed?: boolean; preview?: {value:number;source:string;document:number;path:string;binding:number} | null;
  epoch: number; seq: number; meterEpoch: number; meterSeq: number; appliedGain: number | null; normalizerStatus?: FeatureStatus;
  flight?: Job | null; pending?: Job | null; lastJob?: Job | undefined; commandTimer?: number | undefined;
  meter?: Meter | null; meterFlight?: {seq:number;timer:number} | null; meterPending?: L1Meter | null; meterFailureEpoch?: number;
  retiring?: { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void; offFrame: number | null; timer: number } | undefined;
}
const number = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;

export function installAudio(target: Window): AudioController | null {
  const browser = target as AudioWindow;
  const runtime = Object.getOwnPropertyDescriptor(target, browser.Symbol.for('cheese-knife.runtime.v1'))?.value as KnifeRuntime | undefined;
  if (runtime?.ownerProtocol !== 3 || runtime.audio) return null;
  const entries = new WeakMap<HTMLVideoElement, AudioEntry>(), connected = new Set<AudioEntry>();
  const scope = runtime.createScope();
  let context: AudioContext | undefined, moduleUrl: string | undefined, moduleLoad: Promise<void> | undefined, epoch = 0;
  let registerModule!: () => void;
  const moduleRegistered = new Promise<void>(resolve => { registerModule = resolve; });
  const compTransitions = new WeakMap<AudioParam,{from:number;to:number;start:number;end:number}>();
  const storedGain = () => { try { const raw = target.localStorage.getItem('knifeGain'); return raw && raw.trim() && raw.length <= 64 ? number(Number(raw),0,2,1) : 1; } catch { return 1; } };
  const entryFor = (video: HTMLVideoElement): AudioEntry => {
    let entry = entries.get(video);
    if (!entry) { entry = {video,state:'off',wanted:false,generation:0,gain:storedGain(),sources:0,listeners:new Set(),epoch:++epoch,seq:0,meterEpoch:0,meterSeq:0,appliedGain:null}; entries.set(video,entry); }
    return entry;
  };
  const eligible = (video: HTMLVideoElement): boolean => {
    if (!video || video.ownerDocument !== target.document || video.mediaKeys) return false;
    try { return video.currentSrc.startsWith('blob:') && new URL(video.currentSrc).origin === target.location.origin; } catch { return false; }
  };
  const publish = (entry: AudioEntry): void => {
    if (scope.disposed || runtime.state.player?.video !== entry.video) return;
    const status = entry.state === 'on' ? 'ready' : entry.state === 'off' ? 'disabled' : entry.state === 'pending' ? 'pending' : 'limited';
    runtime.setStatus('audioProcessing',status); runtime.setStatus('compressor',runtime.config.compressorEnabled === false ? 'disabled' : status);
    const eqSupported = context && eqSettings(runtime.config,context.sampleRate).supported;
    runtime.setStatus('equalizer',runtime.config.eqEnabled !== true ? 'disabled' : entry.state === 'on' && !eqSupported ? 'limited' : status,
      entry.state === 'on' && !eqSupported ? 'eq-sample-rate-unsupported' : '');
    runtime.setStatus('normalizer',runtime.config.normalizerEnabled !== true ? 'disabled' : entry.state === 'on' ? entry.normalizerStatus?.state ?? 'pending' : status,
      runtime.config.normalizerEnabled === true ? entry.normalizerStatus?.reason ?? 'normalizer-warming-up' : '');
  };
  const announce = (entry: AudioEntry, state: AudioState, reason = '') => {
    entry.state = state; syncMeter(entry); publish(entry);
    if (!scope.disposed && reason && runtime.state.player?.video === entry.video) runtime.setStatus('audioProcessing',state === 'pending' ? 'pending' : 'limited',reason);
    for (const listener of entry.listeners) { try { listener(state,entry.gain); } catch {} }
  };
  const budget = async <T>(promise: Promise<T>, deadline: number): Promise<T> => {
    const remaining = deadline - Date.now(); if (remaining <= 0) throw Error('audio-prepare-timeout');
    let timer: number | undefined;
    try { return await Promise.race([promise,new Promise<never>((_,reject) => { timer = target.setTimeout(() => reject(Error('audio-prepare-timeout')),remaining); })]); }
    finally { if (timer !== undefined) target.clearTimeout(timer); }
  };
  const clearMeterFlight = (entry: AudioEntry) => {
    if (entry.meterFlight) target.clearTimeout(entry.meterFlight.timer);
    entry.meterFlight = null; entry.meterPending = null;
  };
  const stopMeter = (entry: AudioEntry) => {
    entry.meterPending=null;const data = entry.meter; entry.meter = null;
    if (!data) return; data.scope.dispose();
    try { entry.compMix?.disconnect(data.splitter); } catch {}
    data.splitter.disconnect(); data.left.disconnect(); data.right.disconnect();
  };
  const fail = (entry: AudioEntry, reason: string) => {
    entry.failed = true; entry.appliedGain = null; clearMeterFlight(entry);stopMeter(entry);
    if (entry.commandTimer !== undefined) target.clearTimeout(entry.commandTimer);
    entry.commandTimer = undefined;
    const flight = entry.flight, pending = entry.pending; entry.flight = entry.pending = null; entry.lastJob = undefined;
    const retiring=entry.retiring;entry.retiring=undefined;if(retiring){target.clearTimeout(retiring.timer);retiring.reject(Error(reason));}
    // Native defaults and the intent latch remain independent of the failed processor.
    if(!entry.wanted)try{entry.latch?.offset.setValueAtTime(0,context!.currentTime);}catch{}
    try { entry.controls?.disconnect(); entry.node?.disconnect(); if (entry.node) entry.source?.disconnect(entry.node); if(!entry.source)entry.latch?.stop(); } catch {}
    flight?.reject(Error(reason)); pending?.reject(Error(reason)); announce(entry,'unavailable',reason);
  };
  const sendPending = (entry: AudioEntry) => {
    if (!entry.node || !entry.connected || entry.failed || entry.flight || !entry.pending || context?.state !== 'running') return;
    const job = entry.pending; entry.pending = null; entry.flight = job;
    if(job.packet.kind==='configure')entry.latch!.offset.setValueAtTime(job.packet.wanted && job.packet.gain === 0 ? -1 : 0,context.currentTime);
    entry.commandTimer = target.setTimeout(() => { if (entry.flight === job) fail(entry,'audio-command-timeout'); },1000);
    entry.node.port.postMessage(job.packet);
  };
  const queue = (entry: AudioEntry, wanted: boolean): Promise<void> => {
    if (!context || !entry.node || entry.failed) return Promise.reject(Error('audio-unavailable'));
    const settings = eqSettings(runtime.config,context.sampleRate);
    const data = {wanted,gain:entry.gain,eq:settings.levels as unknown as Eq8,normalizer:runtime.config.normalizerEnabled === true,
      dynamics:runtime.config.compressorEnabled !== false || runtime.config.normalizerEnabled === true,
      targetDbfs:number(runtime.config.normalizerTargetDbfs,-30,-12,-20)};
    const signature = JSON.stringify(data);
    if (entry.lastJob?.signature === signature) return entry.lastJob.promise;
    entry.appliedGain = null;
    const packet: L1Command = {kind:'configure',sourceEpoch:entry.epoch,seq:++entry.seq,...data};
    let resolve!: () => void, reject!: (error: Error) => void;
    const promise = new Promise<void>((a,b) => { resolve=a;reject=b; });
    void promise.catch(() => {});
    entry.pending?.resolve(); const job = {packet,signature,resolve,reject,promise}; entry.pending=job;entry.lastJob=job;
    sendPending(entry); return promise;
  };
  const sendMeter = (entry: AudioEntry, packet: L1Meter) => {
    if (!entry.node || entry.failed || !entry.meter && packet.kind!=='read-error' || context?.state !== 'running') return;
    if (entry.meterFlight) { entry.meterPending=packet; return; }
    const seq=packet.meterSeq, timer=target.setTimeout(() => { if (entry.meterFlight?.seq === seq) fail(entry,'audio-meter-timeout'); },1000);
    entry.meterFlight={seq,timer};entry.node.port.postMessage(packet);
  };
  const syncMeter = (entry: AudioEntry) => {
    const prior=entry.meter;
    if (prior && (prior.source !== entry.video.currentSrc || prior.path !== runtime.media.context.routePath || prior.document !== runtime.media.context.documentGeneration)) stopMeter(entry);
    if (scope.disposed || entry.failed || !entry.wanted || entry.state !== 'on' || !runtime.mediaCurrent() || runtime.config.normalizerEnabled !== true) { stopMeter(entry);return; }
    if (!context || !entry.source || entry.meter || entry.flight || entry.pending || entry.meterFailureEpoch===entry.meterEpoch) return;
    const fftSize=normalizerWindow(context.sampleRate);
    if (fftSize === null) { entry.normalizerStatus={state:'limited',reason:'normalizer-sample-rate-unsupported'};return; }
    try {
      const splitter=context.createChannelSplitter(2),left=context.createAnalyser(),right=context.createAnalyser();
      left.fftSize=right.fftSize=fftSize;
      const data: Meter = {splitter,left,right,leftBuffer:new Float32Array(fftSize),rightBuffer:new Float32Array(fftSize),scope:runtime.createScope(),
        source:entry.video.currentSrc,path:runtime.media.context.routePath,document:runtime.media.context.documentGeneration};
      entry.meter=data;entry.compMix!.connect(splitter);splitter.connect(left,0);splitter.connect(right,1);
      const tick=() => {
        if (!context || entry.meter !== data || data.scope.disposed) return;
        if (scope.disposed || !entry.wanted || entry.state !== 'on' || !runtime.mediaCurrent() || data.source !== entry.video.currentSrc ||
            data.path !== runtime.media.context.routePath || data.document !== runtime.media.context.documentGeneration) { stopMeter(entry);return; }
        const active=context.state === 'running' && eligible(entry.video) && !entry.video.paused && !entry.video.ended && !entry.video.muted &&
          entry.video.volume > 0 && entry.gain > 0 && !target.document.hidden;
        const base={sourceEpoch:entry.epoch,meterEpoch:entry.meterEpoch,meterSeq:++entry.meterSeq,observedTime:context.currentTime};
        const power=(buffer:Float32Array<ArrayBuffer>) => { let sum=0;for(const sample of buffer){if(!Number.isFinite(sample))throw Error('meter-sample');sum+=sample*sample;}const p=sum/buffer.length;if(!Number.isFinite(p))throw Error('meter-power');return p; };
        try {
          let leftPower=0,rightPower=0;
          if(active){left.getFloatTimeDomainData(data.leftBuffer);right.getFloatTimeDomainData(data.rightBuffer);leftPower=power(data.leftBuffer);rightPower=power(data.rightBuffer);}
          sendMeter(entry,{kind:'power',...base,leftPower,rightPower,active,targetDbfs:number(runtime.config.normalizerTargetDbfs,-30,-12,-20)});
        } catch { sendMeter(entry,{kind:'read-error',...base}); }
      };
      data.scope.interval(tick,100);tick();
    } catch {
      stopMeter(entry);entry.meterFailureEpoch=entry.meterEpoch;entry.normalizerStatus={state:'limited',reason:'normalizer-unavailable'};
      sendMeter(entry,{kind:'read-error',sourceEpoch:entry.epoch,meterEpoch:entry.meterEpoch,meterSeq:++entry.meterSeq,observedTime:context.currentTime});
    }
  };
  const apply = (entry: AudioEntry): void => {
    if (!entry.source || entry.failed || !context) return;
    if (runtime.selectPlayer()?.video !== entry.video || !runtime.mediaCurrent() || !eligible(entry.video)) { controller.suspend(entry.video);return; }
    const preview=entry.preview;
    if(preview && (preview.source !== entry.video.currentSrc || preview.document !== runtime.media.context.documentGeneration ||
      preview.path !== runtime.media.context.routePath || preview.binding !== runtime.media.audioBindingGeneration)) entry.preview=null;
    entry.gain=entry.preview?.value ?? (runtime.media.gainOrigin === 'site-legacy' ? storedGain() : number(runtime.config.audioGain,0,2,1));
    if(entry.retiring){if(entry.wanted && entry.gain===0)entry.latch!.offset.setValueAtTime(-1,context.currentTime);return;}
    const boundKey=JSON.stringify([entry.video.currentSrc,runtime.media.context.documentGeneration,runtime.media.context.routePath]);
    if(entry.boundKey!==boundKey){
      clearMeterFlight(entry);stopMeter(entry);entry.generation++;entry.appliedGain=null;
      if(entry.commandTimer!==undefined)target.clearTimeout(entry.commandTimer);entry.commandTimer=undefined;
      const flight=entry.flight,pending=entry.pending;entry.flight=entry.pending=null;entry.lastJob=undefined;
      flight?.reject(Error('audio-source-retired'));pending?.reject(Error('audio-source-retired'));
      entry.latch!.offset.setValueAtTime(entry.wanted && entry.gain===0?-1:0,context.currentTime);
      entry.controls?.disconnect();
      if(entry.node){
        if(entry.connected)entry.source.disconnect(entry.node);
        entry.node.disconnect();entry.node.port.onmessage=null;entry.node.port.close?.();
        const K=entry.node.parameters.get('K');if(K)entry.latch!.disconnect(K);}
      entry.node=undefined;entry.controls=undefined;entry.prepared=undefined;entry.connected=false;
      entry.epoch=++epoch;entry.seq=entry.meterSeq=entry.meterEpoch=0;entry.boundKey=boundKey;
      if(entry.wanted)void controller.setEnabled(entry.video,true);return;
    }
    const parameters=[['threshold','compressorThreshold',-100,0,-50],['knee','compressorKnee',0,40,40],['ratio','compressorRatio',1,20,12],
      ['attack','compressorAttack',0,1,0],['release','compressorRelease',0,1,.25]] as const;
    for(const [name,key,min,max,fallback] of parameters) (Reflect.get(entry.compressor!,name) as AudioParam).value=number(Reflect.get(runtime.config,key),min,max,fallback);
    const compressed=runtime.config.compressorEnabled !== false;
    for(const [node,value] of [[entry.compWet!,compressed?1:0],[entry.compDry!,compressed?0:1]] as const){
      const param=node.gain,now=context.currentTime,prior=compTransitions.get(param);
      if(prior?.to===value || !prior && param.value===value)continue;
      const from=prior?prior.from+(prior.to-prior.from)*Math.max(0,Math.min(1,(now-prior.start)/(prior.end-prior.start))):param.value;
      compTransitions.set(param,{from,to:value,start:now,end:now+.01});param.cancelScheduledValues(now);param.setValueAtTime(from,now);param.linearRampToValueAtTime(value,now+.01);
    }
    void queue(entry,entry.wanted).catch(() => {});syncMeter(entry);publish(entry);
  };
  const silenceProtected = (entry:AudioEntry) => entry.wanted && entry.gain === 0 && !!entry.latch && entry.latch.offset.value === -1;
  const suspend = (entry:AudioEntry,dropWanted=false) => {
    entry.generation++;entry.preview=null;stopMeter(entry);
    if(entry.failed){announce(entry,'unavailable','audio-unavailable');return;}
    if(silenceProtected(entry)) {
      if(entry.appliedGain !== 0 && !entry.failed) fail(entry,'audio-binding-unconfirmed');
      else announce(entry,entry.failed?'unavailable':'pending','scoped-config-pending');
      return;
    }
    if(dropWanted)entry.wanted=false;
    if(entry.source && !entry.failed)void queue(entry,false).catch(() => {});
    announce(entry,entry.wanted?'pending':'off');
  };
  const controller: AudioController = {
    async prepareTransitionModule(url) {
      const resource=new URL(url),path=['','web','audio-transition-worklet.js'].join(String.fromCharCode(47));
      if(resource.protocol!=='chrome-extension:' || !/^[a-p]{32}$/.test(resource.hostname) || resource.username || resource.password || resource.port || resource.pathname!==path || resource.search || resource.hash ||
        resource.href!==url || moduleUrl && moduleUrl !== url)throw Error('audio-module-invalid');
      moduleUrl=url;registerModule();
    },
    async setEnabled(video,enabled) {
      if(scope.disposed)return 'off';
      let entry=entryFor(video);
      if(enabled && entry.failed && !entry.source){
        const listeners=entry.listeners;entry.generation++;entries.delete(video);entry=entryFor(video);entry.listeners=listeners;
      }
      const generation=++entry.generation;entry.wanted=enabled === true;
      if(!entry.wanted){entry.appliedGain=null;stopMeter(entry);
        if(!entry.node || !entry.connected || entry.failed || entry.retiring)entry.latch?.offset.setValueAtTime(0,context!.currentTime);
        if(entry.node && !entry.failed && !entry.retiring)void queue(entry,false).catch(() => {});announce(entry,'off');return 'off';}
      if(entry.failed)return 'unavailable';
      if(entry.retiring){
        apply(entry);announce(entry,'pending','audio-retiring');
        const retiring=entry.retiring;
        try{
          if(context && context.state!=='running')await budget(context.resume(),Date.now()+1000);
          await retiring.promise;
        }catch{if(entry.retiring===retiring)fail(entry,'audio-retire-unavailable');return entry.state;}
        if(generation!==entry.generation || !entry.wanted || scope.disposed)return entry.state;
        return controller.setEnabled(video,true);
      }
      if(runtime.selectPlayer()?.video !== video || !eligible(video)){suspend(entry);announce(entry,'unavailable','unsupported-media-source');return entry.state;}
      if(!runtime.mediaCurrent()){suspend(entry);return entry.state;}
      const requestId=runtime.mediaRequestId,binding=runtime.media.audioBindingGeneration;
      const current=() => !scope.disposed && generation===entry.generation && entry.wanted && runtime.mediaCurrent() &&
        runtime.mediaRequestId===requestId && runtime.media.audioBindingGeneration===binding && runtime.selectPlayer()?.video===video && eligible(video);
      const inactive=():AudioState=>{
        if(scope.disposed || runtime.selectPlayer()?.video!==video){entry.wanted=false;entry.state='off';}
        return entry.state;
      };
      announce(entry,'pending','audio-context');const deadline=Date.now()+1000;
      try {
        await budget(moduleRegistered,deadline);if(!current())return inactive();
        const Context=browser.AudioContext || browser.webkitAudioContext;if(!Context)throw Error('audio-context-unavailable');
        if(!context){context=new Context();scope.on(context,'statechange',()=>{
          if(context?.state==='running')for(const entry of connected){sendPending(entry);syncMeter(entry);}
        });}
        if(context.state !== 'running')await budget(context.resume(),deadline);
        if(!current() || context.state !== 'running')return inactive();
        moduleLoad ||= context.audioWorklet.addModule(moduleUrl!);await budget(moduleLoad,deadline);
        if(!current())return inactive();if(Date.now()>=deadline)throw Error('audio-prepare-timeout');
        if(!entry.node){
          if(!entry.dry){
          entry.dry=context.createGain();entry.dry.gain.value=1;entry.wet=context.createGain();entry.wet.gain.value=0;
          entry.gainNode=context.createGain();entry.gainNode.gain.value=0;entry.permit=context.createGain();entry.permit.gain.value=1;
          entry.dryDelay=context.createDelay(.02);entry.dryDelay.delayTime.value=compressorDelay(context.sampleRate);
          entry.compressor=context.createDynamicsCompressor();entry.compDelay=context.createDelay(.02);entry.compDelay.delayTime.value=compressorDelay(context.sampleRate);
          entry.compDry=context.createGain();entry.compDry.gain.value=runtime.config.compressorEnabled === false?1:0;
          entry.compWet=context.createGain();entry.compWet.gain.value=runtime.config.compressorEnabled === false?0:1;
          entry.compMix=context.createGain();entry.normalizer=context.createGain();entry.normalizer.gain.value=0;
          entry.limiter=context.createWaveShaper();entry.limiter.curve=limiterCurve();entry.limiter.oversample='none';
          entry.dryDelay.connect(entry.dry);entry.dry.connect(entry.permit);entry.permit.connect(context.destination);
          }
          if(!entry.latch){entry.latch=context.createConstantSource();entry.latch.offset.value=0;entry.latch.start();entry.latch.connect(entry.permit!.gain);}
          entry.compressor!.connect(entry.compWet!);entry.compDelay!.connect(entry.compDry!);
          entry.compWet!.connect(entry.compMix!);entry.compDry!.connect(entry.compMix!);entry.compMix!.connect(entry.normalizer!);entry.normalizer!.connect(entry.gainNode!);
          entry.gainNode!.connect(entry.limiter!);entry.limiter!.connect(entry.wet!);entry.wet!.connect(context.destination);
          entry.boundKey=JSON.stringify([video.currentSrc,runtime.media.context.documentGeneration,runtime.media.context.routePath]);
          const node=new browser.AudioWorkletNode(context,'knife-audio-transition-l1',{numberOfInputs:1,numberOfOutputs:2,outputChannelCount:[2,5],
            channelCount:2,channelCountMode:'explicit',channelInterpretation:'speakers',processorOptions:{sourceEpoch:entry.epoch,
              initial:entry.source && entry.latch!.offset.value===-1?'silent-hold':'raw'}});
          entry.node=node;entry.controls=context.createChannelSplitter(5);
          let ready!: () => void;entry.prepared=new Promise<void>(resolve => {ready=resolve;});
          node.onprocessorerror=() => {if(entry.node===node && entries.get(video)===entry)fail(entry,'audio-processor-failed');};
          node.port.onmessage=(event:MessageEvent<unknown>) => {
            if(entry.node!==node || entry.failed)return;
            const row=event.data as Partial<L1Reply> | null;
            if(!row || row.sourceEpoch!==entry.epoch || !Number.isSafeInteger(row.seq) || row.kind==='prepared' && row.seq!==0 || !Number.isSafeInteger(row.frame) || row.kind==='prepared' && row.frame!<0 ||
                !Number.isSafeInteger(row.meterEpoch) || !['prepared','accepted','completed','rejected','failed','meter-accepted','retired'].includes(row.kind as string) ||
                row.code !== null && (typeof row.code !== 'string' || row.code.length>80)){fail(entry,'audio-reply-invalid');return;}
            if(row.kind==='prepared'){ready();return;}
            if(row.kind==='failed'){fail(entry,row.code || 'audio-processor-failed');return;}
            if(row.kind==='meter-accepted'){
              const ticket=entry.meterFlight;
              if(ticket && ticket.seq===row.seq){target.clearTimeout(ticket.timer);entry.meterFlight=null;
                const packet=entry.meterPending;entry.meterPending=null;if(packet)sendMeter(entry,packet);
                if(row.meterEpoch!==entry.meterEpoch || !entry.meter || !entry.wanted || runtime.config.normalizerEnabled!==true)return;
                entry.normalizerStatus=entry.meterFailureEpoch===entry.meterEpoch?{state:'limited',reason:'normalizer-unavailable'}:
                  row.code==='error'?{state:'limited',reason:'normalizer-samples-invalid'}:row.code==='ramp'?{state:'ready',reason:''}:{state:'pending',reason:'normalizer-warming-up'};publish(entry);}
              return;
            }
            const job=entry.flight;
            if(row.kind==='retired'){
              const retiring=entry.retiring;
              if(!retiring || !job || job.packet.kind!=='retire' || row.seq!==job.packet.seq)return;
              if(Object.keys(row).sort().join(',')!=='code,frame,gain,kind,meterEpoch,seq,sourceEpoch' || row.gain!==null || row.code!==null ||
                retiring.offFrame===null || row.frame!<retiring.offFrame || row.meterEpoch!==entry.meterEpoch){fail(entry,'audio-retire-invalid');return;}
              if(entry.commandTimer!==undefined)target.clearTimeout(entry.commandTimer);entry.commandTimer=undefined;
              clearMeterFlight(entry);stopMeter(entry);entry.source?.disconnect(node);entry.controls?.disconnect();node.disconnect();node.port.onmessage=null;node.port.close?.();
              const K=node.parameters.get('K');if(K)entry.latch!.disconnect(K);
              for(const part of [entry.compressor,entry.compDelay,entry.compWet,entry.compDry,entry.compMix,entry.normalizer,entry.gainNode,entry.limiter,entry.wet])part?.disconnect();
              if(!(entry.wanted && entry.gain===0)){entry.latch!.disconnect();entry.latch!.stop();entry.latch=undefined;}
              entry.node=undefined;entry.controls=undefined;entry.prepared=undefined;entry.connected=false;connected.delete(entry);
              entry.flight=entry.pending=null;entry.lastJob=undefined;entry.appliedGain=null;entry.epoch=++epoch;entry.seq=entry.meterSeq=entry.meterEpoch=0;
              target.clearTimeout(retiring.timer);entry.retiring=undefined;retiring.resolve();return;
            }
            if(row.kind==='completed'){
              if(row.seq===entry.seq && typeof row.gain==='number' && Number.isFinite(row.gain) && row.gain>=0 && row.gain<=2)entry.appliedGain=row.gain;
              if(entry.retiring && job?.packet.kind==='configure' && !job.packet.wanted && row.seq===job.packet.seq){
                if(row.gain!==1 || entry.latch!.offset.value!==0){fail(entry,'audio-retire-not-raw');return;}
                if(entry.commandTimer!==undefined)target.clearTimeout(entry.commandTimer);entry.commandTimer=undefined;
                entry.retiring.offFrame=row.frame!;entry.flight=null;job.resolve();
                const retiring=entry.retiring;
                entry.pending={packet:{kind:'retire',sourceEpoch:entry.epoch,seq:++entry.seq},signature:'retire',...retiring};sendPending(entry);
              }
              return;
            }
            if(!job || row.seq!==job.packet.seq)return;
            if(row.kind==='accepted' && (job.packet.kind==='retire' || entry.retiring)){
              if(job.packet.kind==='configure')entry.meterEpoch=row.meterEpoch!;return;
            }
            if(entry.commandTimer!==undefined)target.clearTimeout(entry.commandTimer);entry.commandTimer=undefined;entry.flight=null;
            if(row.kind==='rejected'){job.reject(Error('audio-command-rejected'));fail(entry,'audio-command-rejected');return;}
            entry.meterEpoch=row.meterEpoch!;job.resolve();sendPending(entry);syncMeter(entry);
          };
          node.connect(entry.controls,1);const params=[entry.dry!.gain,entry.wet!.gain,entry.gainNode!.gain,entry.normalizer!.gain,entry.permit!.gain];
          params.forEach((param,i)=>{param.automationRate='a-rate';entry.controls!.connect(param,i);});
          const K=node.parameters.get('K');if(!K)throw Error('audio-latch-parameter');entry.latch!.connect(K);
          node.connect(entry.compressor!,0);node.connect(entry.compDelay!,0);
        }
        await budget(entry.prepared!,deadline);if(!current())return inactive();if(Date.now()>=deadline)throw Error('audio-prepare-timeout');
        if(!entry.source){entry.boundKey=JSON.stringify([video.currentSrc,runtime.media.context.documentGeneration,runtime.media.context.routePath]);
          entry.source=context.createMediaElementSource(video);entry.sources++;entry.source.connect(entry.dryDelay!);}
        connected.add(entry);
        if(!current()){suspend(entry,runtime.selectPlayer()?.video!==video);return inactive();}
        if(!entry.connected){entry.source.connect(entry.node!);entry.connected=true;}
        apply(entry);
        // 연결 전에 같은 설정으로 대기하던 명령도 최신 설정을 적용한 뒤 전송한다.
        sendPending(entry);
        const accepted=entry.lastJob?.promise;if(accepted)await budget(accepted,deadline);
        if(current())announce(entry,'on');
      } catch {
        if(generation!==entry.generation || !entry.wanted || scope.disposed)return inactive();
        fail(entry,'audio-unavailable');
      }
      return entry.state;
    },
    getState(video){return entries.get(video)?.state || 'off';},
    setGain(video,value){const entry=entryFor(video);entry.gain=number(value,0,2,1);
      entry.preview={value:entry.gain,source:video.currentSrc,document:runtime.media.context.documentGeneration,path:runtime.media.context.routePath,binding:runtime.media.audioBindingGeneration};
      apply(entry);publish(entry);return entry.gain;},
    applyPreviewGain(video,value,current){const expected=runtime.media.context;
      if(!Number.isFinite(value)||value<0||value>2||!runtime.mediaCurrent()||runtime.state.player?.video!==video||!current||
        !['documentGeneration','routePath','channelId','playerGeneration'].every(key=>Object.getOwnPropertyDescriptor(current,key)?.value===Object.getOwnPropertyDescriptor(expected,key)?.value))return false;
      controller.setGain(video,value);return true;},
    getReadback(video){const entry=entries.get(video);return {state:entry?.state??'off',wanted:entry?.wanted??false,gain:entry?.gain??storedGain(),appliedGain:entry?.appliedGain??null,sources:entry?.sources??0};},
    configure(){for(const entry of connected)apply(entry);},
    bypass(video){const entry=entries.get(video);if(entry)suspend(entry,true);},
    suspend(video){const entry=entries.get(video);if(entry)suspend(entry);},
    resumeWanted(video){const entry=entries.get(video);if(entry?.failed)return Promise.resolve('unavailable');return entry?.wanted?controller.setEnabled(video,true):Promise.resolve('off');},
    subscribe(video,callback){const entry=entryFor(video);entry.listeners.add(callback);callback(entry.state,entry.gain);return ()=>entry.listeners.delete(callback);},
    eligible,
  };
  try {
    scope.interval(()=>{for(const entry of connected){
      if(entry.video.isConnected || !entry.video.paused){entry.detachedSince=null;continue;}
      entry.detachedSince ||= Date.now();
      if(Date.now()-entry.detachedSince>=5000 && context?.state==='running' && !silenceProtected(entry) && !entry.failed && !entry.retiring && !entry.flight && !entry.pending && entry.appliedGain!==null){
        let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((a,b)=>{resolve=a;reject=b;});void promise.catch(()=>{});
        // Bound the unsent gap between two 1000ms flight budgets if the context suspends.
        const timer=target.setTimeout(()=>{if(entry.retiring?.promise===promise)fail(entry,'audio-retire-timeout');},2000);
        entry.retiring={promise,resolve,reject,offFrame:null,timer};entry.lastJob=undefined;
        suspend(entry,true);
      }
    }},1000);
    scope.on(target,'pagehide',event=>{if(!scope.disposed && !(event as PageTransitionEvent).persisted){for(const entry of connected){suspend(entry,true);clearMeterFlight(entry);stopMeter(entry);}scope.dispose();}});
  } catch(error){scope.dispose();throw error;}
  runtime.audio=controller;return controller;
}
