import {readAudioContract} from './audio-verification-contract.mjs';
import {isDeepStrictEqual} from 'node:util';
import {equalizerMeasurementCases,equalizerResponseDb,validateProcessingCapture} from './audio-processing-metrics.mjs';
import {summarizeCapture} from './audio-signal.mjs';

/** @typedef {{kind:string,sourceEpoch:number,seq:number,wanted?:boolean,gain?:number,eq?:number[],normalizer?:boolean,dynamics?:boolean,targetDbfs?:number}} Packet */
/** @typedef {{requestedFrame:number,message:Packet}} Command */
/** @typedef {{kind:string,sourceEpoch:number,seq:number,frame:number,meterEpoch:number,gain:number|null,code:string|null}} Reply */
/** @param {unknown} value @returns {Record<string,unknown>|null} */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?/** @type {Record<string,unknown>} */(value):null;
/** @param {unknown} value @returns {value is number} */
const safe=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
/** @param {unknown} value @param {number} min @param {number} max @returns {value is number} */
const range=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
/** @param {Record<string,unknown>} value @param {string} names */
const keys=(value,names)=>Object.keys(value).sort().join(',')===names;
const rates=[44100,48000,96000],cases=equalizerMeasurementCases();


/** Validate actual posted lifecycle packets; sequence gaps from coalescing are allowed.
 * @param {unknown} commandsRaw @param {unknown} repliesRaw
 */
function timeline(commandsRaw,repliesRaw){
  /** @type {Command[]} */const commands=[];
  /** @type {Reply[]} */const replies=[];const failures=[];
  if(!Array.isArray(commandsRaw)||!commandsRaw.length||commandsRaw.length>64||!Array.isArray(repliesRaw)||repliesRaw.length>64)return {commands,replies,failures:['lifecycle-missing-or-bound']};
  let epoch=0,lastSeq=0,lastRequest=0;
  for(const raw of commandsRaw){
    const row=record(raw),p=record(row?.message),shape=p&&(p.kind==='configure'?keys(p,'dynamics,eq,gain,kind,normalizer,seq,sourceEpoch,targetDbfs,wanted')&&typeof p.wanted==='boolean'&&typeof p.normalizer==='boolean'&&typeof p.dynamics==='boolean'&&range(p.gain,0,2)&&range(p.targetDbfs,-30,-12)&&Array.isArray(p.eq)&&p.eq.length===8&&p.eq.every(v=>range(v,-6,6)):p.kind==='retire'&&keys(p,'kind,seq,sourceEpoch'));
    if(!row||!p||!shape||!safe(row.requestedFrame)||!safe(p.sourceEpoch)||p.sourceEpoch===0||!safe(p.seq)||p.seq===0||p.seq<=lastSeq||row.requestedFrame<lastRequest||epoch&&p.sourceEpoch!==epoch){failures.push('lifecycle-command');continue;}
    epoch=p.sourceEpoch;lastSeq=p.seq;lastRequest=row.requestedFrame;commands.push({requestedFrame:row.requestedFrame,message:/** @type {Packet} */(/** @type {unknown} */(p))});
  }
  for(const raw of repliesRaw){
    const r=record(raw);
    if(!r||!keys(r,'code,frame,gain,kind,meterEpoch,seq,sourceEpoch')||!['prepared','accepted','completed','retired'].includes(String(r.kind))||!safe(r.sourceEpoch)||r.sourceEpoch!==epoch||!safe(r.seq)||!safe(r.frame)||!safe(r.meterEpoch)||r.code!==null||(r.kind==='completed'?!range(r.gain,0,2):r.gain!==null)||(r.kind!=='prepared'&&!commands.some(c=>c.message.seq===r.seq))){failures.push('lifecycle-reply');continue;}
    replies.push(/** @type {Reply} */(/** @type {unknown} */(r)));
  }
  return {commands,replies,failures};
}
/** @param {ReturnType<typeof timeline>} data @param {Command} command @param {'accepted'|'completed'} kind */
function matched(data,command,kind){return data.replies.filter(r=>r.kind===kind&&r.sourceEpoch===command.message.sourceEpoch&&r.seq===command.message.seq);}

/** Actual aligned one-second archive windows; no coefficient/native8 witness is fabricated.
 * @param {unknown} raw
 */
export function assessL1Equalizer(raw){
  const input=record(raw);
  const componentProfile=input?.schema==='f01-l1-eq-input-v2';
  if(!input||!keys(input,componentProfile?'component,control,observation,program,schema,source,spec':'control,observation,program,schema,source,spec')||!['f01-l1-eq-input-v1','f01-l1-eq-input-v2'].includes(String(input.schema)))throw Error('l1-eq-input');
  const supplied=record(input.spec),spec=cases.find(c=>c.id===supplied?.id);
  if(!spec||!isDeepStrictEqual(supplied,spec))throw Error('l1-eq-original-spec');
  const source=validateProcessingCapture(input.source),program=validateProcessingCapture(input.program),control=record(input.control);
  if(source.rate!==spec.sampleRate||source.end-source.start!==source.rate||program.rate!==source.rate||program.start!==source.start||program.end!==source.end||!control||control.rate!==source.rate||control.start!==source.start||control.end!==source.end||!Array.isArray(control.channels)||control.channels.length!==5)throw Error('l1-eq-window');
  for(const channel of control.channels){
    if((!Array.isArray(channel)&&!(channel instanceof Float32Array)&&!(channel instanceof Float64Array))||channel.length!==source.rate)throw Error('l1-eq-control-window');
    for(const value of channel)if(typeof value!=='number'||!Number.isFinite(value))throw Error('l1-eq-control-window');
  }
  const observation=record(input.observation),failures=[];
  if(!observation||observation.sources!==1||observation.l1Nodes!==1||observation.filters!==0||observation.invalidFrames!==0||observation.streamError!=='')failures.push('identity-or-stream-formation');
  const data=timeline(observation?.commands,observation?.replies);failures.push(...data.failures);
  const command=data.commands.filter(c=>c.requestedFrame<=source.start).at(-1),p=command?.message;
  if(!command||!p||p.kind!=='configure'||p.wanted!==true||p.normalizer!==false||p.dynamics!==false||p.gain!==spec.masterGain||!isDeepStrictEqual(p.eq,spec.levels))failures.push('configure-spec');
  if(data.commands.some(c=>c.requestedFrame>source.start&&c.requestedFrame<source.end))failures.push('window-command-change');
  if(command){
    const accepted=matched(data,command,'accepted'),completed=matched(data,command,'completed'),a=accepted[0],c=completed[0];
    if(accepted.length!==1||completed.length!==1||!a||!c||a.frame<command.requestedFrame||c.frame<a.frame||c.frame>source.start||c.gain!==spec.masterGain||data.replies.indexOf(a)>=data.replies.indexOf(c))failures.push('configure-lifecycle');
  }
  const sourceSummary=summarizeCapture(source,spec.frequency),programSummary=summarizeCapture(program,spec.frequency);
  const responseDb=equalizerResponseDb(spec.levels,spec.sampleRate,spec.frequency),headroomDb=-spec.levels.reduce((sum,v)=>sum+Math.max(0,v),0),gainDb=20*Math.log10(spec.masterGain),expectedCompositeDb=responseDb+headroomDb+gainDb,toleranceDb=spec.levels.every(v=>v===0)?.05:.5;
  const measuredCompositeTransfer=programSummary.channels.map((channel,c)=>{
    const inputChannel=sourceSummary.channels[c],inputRms=inputChannel?.rms??0,sourceDb=inputRms>0?20*Math.log10(inputRms/.01):null,fixedInputDb=channel.rms>0?20*Math.log10(channel.rms/.01):null,measuredDb=channel.rms>0&&inputRms>0?20*Math.log10(channel.rms/inputRms):null;
    if(sourceDb===null||Math.abs(sourceDb)>.05)failures.push('source-channel-'+c+'/rms');
    if(!inputChannel||inputChannel.spectralReason!==''||inputChannel.fundamentalAmplitude===null||inputChannel.fundamentalAmplitude<=0||Math.abs(20*Math.log10(inputChannel.fundamentalAmplitude/(Math.SQRT2*.01)))>.05)failures.push('source-channel-'+c+'/coherent-tone');
    if(fixedInputDb===null||Math.abs(fixedInputDb-expectedCompositeDb)>toleranceDb)failures.push('output-channel-'+c+'/fixed-input');
    if(measuredDb===null||Math.abs(measuredDb-expectedCompositeDb)>toleranceDb)failures.push('output-channel-'+c+'/composite');
    if(channel.peak>.9801||channel.overFullScaleSamples!==0)failures.push('output-channel-'+c+'/headroom');
    return {channel:c,inputRms,programRms:channel.rms,sourceDbFromFixedInput:sourceDb,programDbFromFixedInput:fixedInputDb,measuredDb};
  });
  const controls=/** @type {import('./audio-signal.mjs').Samples[]} */(control.channels);
  for(const [c,expected]of [-1,1,spec.masterGain,1,0].entries())if(controls[c]?.some(v=>v!==expected))failures.push('control-channel-'+c);
  const originalOutputGatesPassed=failures.length===0;
  let component;
  if(componentProfile){
    const capture=validateProcessingCapture(input.component);
    if(capture.rate!==source.rate||capture.start!==source.start||capture.end!==source.end)throw Error('l1-eq-component-window');
    const summary=summarizeCapture(capture,spec.frequency),expectedDb=responseDb+headroomDb;
    /** @type {string[]} */const componentFailures=[];
    const channels=summary.channels.map((channel,c)=>{
      const inputRms=sourceSummary.channels[c]?.rms??0,fixedDb=channel.rms>0?20*Math.log10(channel.rms/.01):null,measuredDb=channel.rms>0&&inputRms>0?20*Math.log10(channel.rms/inputRms):null;
      if(fixedDb===null||Math.abs(fixedDb-expectedDb)>toleranceDb)componentFailures.push('component-channel-'+c+'/fixed-input');
      if(measuredDb===null||Math.abs(measuredDb-expectedDb)>toleranceDb)componentFailures.push('component-channel-'+c+'/transfer');
      if(channel.spectralReason!==''||channel.fundamentalAmplitude===null||channel.fundamentalAmplitude<=0||Math.abs(20*Math.log10(channel.fundamentalAmplitude/(Math.SQRT2*.01))-expectedDb)>toleranceDb)componentFailures.push('component-channel-'+c+'/coherent-tone');
      if(channel.peak>.9801||channel.overFullScaleSamples!==0)componentFailures.push('component-channel-'+c+'/headroom');
      return {channel:c,fixedDb,measuredDb};
    });
    component={summary,expectedDb,channels,failures:componentFailures,scope:'actual EQ plus headroom output0, before native stages and user Gain'};failures.push(...componentFailures);
  }
  return {schema:componentProfile?'f01-l1-eq-observation-v2':'f01-l1-eq-observation-v1',caseId:spec.id,originalOutputGatesPassed,failures:[...new Set(failures)],native8ComponentWitness:'UNASSESSED',overallQualification:false,
    ...(component?{component,componentWitnessPassed:originalOutputGatesPassed&&component.failures.length===0}:{}),
    sourceSummary,programSummary,measuredCompositeTransfer:{kind:'measured-program-over-source',channels:measuredCompositeTransfer},responseDb,headroomDb,gainDb,expectedCompositeDb,toleranceDb,
    window:{rate:source.rate,start:source.start,end:source.end},lifecycle:command?{command,accepted:matched(data,command,'accepted'),completed:matched(data,command,'completed')}:null,
    limits:componentProfile?'Original final output and actual EQ plus headroom tap gates. Net0 does not prove the individual EQ/headroom stages or legacy native8. Original1500ms settling and authentic frame provenance remain runner obligations.':'Original output gates only. Measured composite PCM is not the legacy native8 coefficient witness. Original1500ms settling and authentic frame provenance remain runner obligations.'};
}

/** Phase classification only; no phase-coverage, N trajectory or quality qualification.
 * @param {unknown} raw
 */
export function classifyL1Reentry(raw){
  const input=record(raw);
  if(!input||!keys(input,'commands,offSeq,onSeq,replies,sampleRate,sourceEpoch')||typeof input.sampleRate!=='number'||!rates.includes(input.sampleRate)||!safe(input.sourceEpoch)||input.sourceEpoch===0||!safe(input.offSeq)||!safe(input.onSeq)||input.offSeq===0||input.onSeq<=input.offSeq)throw Error('l1-phase-input');
  const data=timeline(input.commands,input.replies),off=data.commands.find(c=>c.message.seq===input.offSeq&&c.message.sourceEpoch===input.sourceEpoch),on=data.commands.find(c=>c.message.seq===input.onSeq&&c.message.sourceEpoch===input.sourceEpoch);
  if(data.failures.length||!off||!on||off.message.kind!=='configure'||on.message.kind!=='configure'||off.message.wanted!==false||on.message.wanted!==true||off.message.normalizer!==true||on.message.normalizer!==true||data.commands.indexOf(on)!==data.commands.indexOf(off)+1)throw Error('l1-phase-lifecycle');
  const accepted=data.replies.filter(r=>r.kind==='accepted');
  if(accepted.some((r,i)=>i>0&&(r.frame<=Number(accepted[i-1]?.frame)||r.seq<=Number(accepted[i-1]?.seq))))throw Error('l1-phase-ambiguous-acceptance');
  const a=matched(data,off,'accepted'),b=matched(data,on,'accepted'),acceptedOff=a[0],acceptedOn=b[0];
  if(a.length!==1||b.length!==1||!acceptedOff||!acceptedOn||acceptedOff.frame<off.requestedFrame||acceptedOn.frame<on.requestedFrame||acceptedOn.frame<acceptedOff.frame||data.replies.indexOf(acceptedOff)>=data.replies.indexOf(acceptedOn))throw Error('l1-phase-accepted');
  const A=acceptedOff.frame,B=acceptedOn.frame;
  const {rules,authority}=readAudioContract();
  const delayFrames=rules.delayFrames[rules.sampleRateHz.indexOf(input.sampleRate)];
  const retirementStartFrame=Math.ceil(A+(rules.offProgressMs+rules.qFallMs)/1000*input.sampleRate+delayFrames);
  const retirementEndFrame=retirementStartFrame+rules.retireMs/1000*input.sampleRate;
  return {schema:'f01-l1-reentry-phase-v2',phase:B<=retirementStartFrame?'HOLD':B<retirementEndFrame?'RETIRE':'UNITY',acceptedOffFrame:A,acceptedOnFrame:B,delayFrames,retirementStartFrame,retirementEndFrame,
    coverageChecked:false,overallQualification:false,authority,preconditions:'Original rapid case with settled ON before OFF; input/warm-up, actual frame provenance, full phase coverage and N/output response are not checked here.'};
}
