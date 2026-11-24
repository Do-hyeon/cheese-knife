import { acceptCommand, acceptRetire, acceptMeter, createTransition, isL1Command, isL1Retire, isL1Meter, renderTransition, transitionReply,
  type L1Command, type L1Retire, type L1Meter, type L1Reply, type L1State } from './transition';

declare const currentFrame: number;
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new(): { port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof TransitionProcessor): void;

class TransitionProcessor extends AudioWorkletProcessor {
  private state: L1State;
  private command: L1Command | L1Retire | null = null;
  private meter: L1Meter | null = null;
  private headroomWitness: boolean;
  private offStageWitness: boolean;
  private offStage: { port: MessagePort | null; registration: string; expected: L1Command; command: L1Command | null;
    accepted: L1Reply | null; completed: boolean } | null = null;
  static get parameterDescriptors() { return [{name:'K',defaultValue:0,minValue:-1,maxValue:0,automationRate:'a-rate'}]; }
  constructor(options: { processorOptions: {sourceEpoch: number; initial: 'raw' | 'silent-hold'; normalizerWitness?: boolean; headroomWitness?: boolean; offStageWitness?: boolean} }) {
    super();
    this.headroomWitness=options.processorOptions.headroomWitness===true;
    this.offStageWitness=options.processorOptions.offStageWitness===true;
    this.state = createTransition(sampleRate, options.processorOptions.sourceEpoch, options.processorOptions.initial, options.processorOptions.normalizerWitness === true,this.headroomWitness);
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      const packet = event.data;
      if(this.offStageWitness && packet!==null && typeof packet==='object' && 'kind' in packet && packet.kind==='off-stage-register'){
        this.registerOffStage(packet as Record<string,unknown>,event.ports);return;
      }
      const witness=this.offStage;let target=false;
      if(witness && !witness.command && this.isOffStageTarget(packet)){
        witness.command=packet;target=true;this.postOffStage('callback');
      }
      if ((isL1Command(packet) || isL1Retire(packet)) && !this.command) {
        this.command = packet;
        if(target)this.postOffStage('stored');
      }
      else if (isL1Meter(packet) && !this.meter) this.meter = packet;
      else this.port.postMessage(transitionReply(this.state,'failed',currentFrame,'l1-packet-invalid'));
    };
    this.port.postMessage(transitionReply(this.state,'prepared',currentFrame));
  }
  private isOffStageTarget(packet: unknown): packet is L1Command {
    return isL1Command(packet) && packet.sourceEpoch===this.state.sourceEpoch && packet.seq===2 && !packet.wanted &&
      packet.gain===1 && packet.eq.every(gain=>gain===0) && !packet.normalizer && packet.dynamics===true && packet.targetDbfs===-20;
  }
  private registerOffStage(packet: Record<string,unknown>, ports: readonly MessagePort[]): void {
    if(this.offStage || this.state.rate!==44100 || this.state.failed || this.state.retired || this.state.seq!==1 ||
        !this.state.completed || !this.state.wanted || this.command || ports.length!==1 || Array.isArray(packet) ||
        Object.keys(packet).sort().join(',')!=='kind,registration,sourceEpoch,target' || packet.sourceEpoch!==this.state.sourceEpoch ||
        typeof packet.registration!=='string' || !/^[0-9a-f]{32}$/.test(packet.registration) || !this.isOffStageTarget(packet.target)){
      for(const port of ports)try{port.close();}catch{}
      return;
    }
    this.offStage={port:ports[0]!,registration:packet.registration,expected:packet.target,command:null,accepted:null,completed:false};
    this.postOffStage('registered');
  }
  private postOffStage(stage: 'registered' | 'callback' | 'stored' | 'accepted' | 'accepted-post-returned' | 'completed', reply?: L1Reply): void {
    const witness=this.offStage,port=witness?.port;
    if(!witness || !port)return;
    try{
      port.postMessage({schema:'f01-off-stage-receipt-v1',registration:witness.registration,sourceEpoch:this.state.sourceEpoch,
        seq:2,stage,target:witness.command ?? witness.expected,...(reply ? {reply} : {})});
    }catch{
      witness.port=null;
      try{port.close();}catch{}
    }
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    this.state.normalizerApplication = null;
    if(this.headroomWitness)this.state.renderHeadroom=null;
    const K = parameters.K, audio = outputs[0], control = outputs[1];
    if (!K || !audio || !control || !audio[0]) return false;
    if (this.command) {
      const command = this.command;
      // MessagePort delivery can precede the native latch's next render quantum.
      const waiting = isL1Command(command) && Number.isSafeInteger(currentFrame) && currentFrame >= 0 && !this.state.failed && !this.state.retired &&
        command.sourceEpoch === this.state.sourceEpoch && command.seq > this.state.seq && (K[0] === 0 || K[0] === -1) &&
        K[0] !== (command.wanted && command.gain === 0 ? -1 : 0);
      if (!waiting) {
        this.command = null;
        const reply=command.kind === 'retire' ? acceptRetire(this.state,command,currentFrame,K.every(k=>k===0) ? 0 : -1)
          : acceptCommand(this.state,command,currentFrame,K[0]!);
        if(reply.kind === 'retired'){
          for(const channel of [...audio,...control])channel.fill(0);
          this.port.postMessage(reply);return false;
        }
        const witness=this.offStage,target=witness?.command===command && reply.kind==='accepted' &&
          reply.sourceEpoch===this.state.sourceEpoch && reply.seq===2;
        if(target && witness){witness.accepted=reply;this.postOffStage('accepted',reply);}
        this.port.postMessage(reply);
        if(target)this.postOffStage('accepted-post-returned',reply);
      }
    }
    const meter = this.meter; this.meter = null;
    if (meter) acceptMeter(this.state,meter);
    const reply = renderTransition(this.state,inputs[0] ?? [],currentFrame,audio[0].length,K,audio,control,this.headroomWitness && meter!==null);
    const witness=this.offStage;
    if(reply?.kind==='completed' && witness?.accepted && !witness.completed && reply.sourceEpoch===this.state.sourceEpoch && reply.seq===2){
      witness.completed=true;this.postOffStage('completed',reply);
    }
    if (meter) this.port.postMessage({...transitionReply(this.state,'meter-accepted',currentFrame,this.state.normStatus),seq:meter.meterSeq,
      ...(this.state.normalizerWitness ? {application:this.state.normalizerApplication} : {}),
      ...(this.headroomWitness ? {renderHeadroom:this.state.renderHeadroom} : {})});
    if (reply) this.port.postMessage(reply);
    return !this.state.failed;
  }
}
registerProcessor('knife-audio-transition-l1',TransitionProcessor);
