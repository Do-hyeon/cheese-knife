import {isDeepStrictEqual} from 'node:util';
import {validateProcessingCapture} from '../audio-processing-metrics.mjs';
import {createNormalizerSignalSource} from '../audio-normalizer-signal-source.mjs';
import {PACKAGED_NORMALIZER_SIGNAL_CASES,selectNormalizerCase,normalizerSignalFailures,selectNormalizerTarget,normalizerSourceFailures,compareL1Normalizer} from '../audio-l1-normalizer-oracle.mjs';

/** @typedef {{id:string,sampleRate:number,warmupMilliseconds:number,stallMilliseconds:number,resumeMilliseconds:number,errorMilliseconds:number}} FaultControlSpec */
/** @typedef {FaultControlSpec|import('../audio-l1-normalizer-oracle.mjs').NormalizerSignalSpec} NormalizerControlSpec */
/** @typedef {{summary:()=>{sampleRate:number,start:number|null,end:number|null,bytes:number,cap:number},window:(a:number,b:number,stream?:number)=>import('../audio-signal.mjs').CaptureWindow}} Archive */
/** @type {readonly Readonly<NormalizerControlSpec>[]} */
export const NORMALIZER_CONTROL_CASES=Object.freeze([... [44100,48000,96000].map(sampleRate=>Object.freeze({id:sampleRate+'/normalizer-control/stall-error',sampleRate,warmupMilliseconds:6500,stallMilliseconds:240,resumeMilliseconds:700,errorMilliseconds:220})),...PACKAGED_NORMALIZER_SIGNAL_CASES]);
/** @param {NormalizerControlSpec} spec @returns {spec is import('../audio-l1-normalizer-oracle.mjs').NormalizerSignalSpec} */
export function isNormalizerSignalControl(spec){return PACKAGED_NORMALIZER_SIGNAL_CASES.some(s=>isDeepStrictEqual(s,spec));}
/** @param {string} code @returns {never} */
const fail=code=>{throw Error('audio-normalizer-control-'+code);};
/** @param {unknown} v @returns {Record<string,unknown>} */
function object(v){if(!v||typeof v!=='object'||Array.isArray(v))return fail('object');return /** @type {Record<string,unknown>} */(v);}
/** @param {unknown} v */
function rows(v){if(!Array.isArray(v))return fail('rows');return v.map(object);}
/** @param {unknown} v */
function number(v){if(typeof v!=='number'||!Number.isFinite(v)||v<0)return fail('number');return v;}
/** @param {unknown} v */
function integer(v){const n=number(v);if(!Number.isSafeInteger(n))return fail('integer');return n;}
/** @param {unknown} v */
function selected(v){const s=NORMALIZER_CONTROL_CASES.find(s=>isDeepStrictEqual(s,v));if(!s)return fail('original-spec');return s;}
/** The immutable N60 source/target helper is reused; the outer control identity is never rewritten.
 * @param {unknown} spec */
export function normalizerControlSourceSpec(spec){const s=selected(spec);return isNormalizerSignalControl(s)?s:selectNormalizerCase(s.sampleRate+'/normalizer/-24/stereo');}
/** Only this explicit profile accepts failed analyser attempts. Legacy live guards are unchanged.
 * @param {unknown} raw @param {NormalizerControlSpec} spec */
export function assertNormalizerControlLive(raw,spec){
  const f=object(raw),o=object(f.productObservation),s=normalizerControlSourceSpec(spec),r=object(f.readback),c=object(f.normalizerControl);
  const prepared=rows(o.replies).find(p=>p.kind==='prepared');
  if(isNormalizerSignalControl(spec)?c.signalObservation!==true||rows(c.events).length!==0:c.signalObservation===true)fail('profile-or-unexpected-fault');
  if(normalizerSignalFailures(f,s).length||f.sources!==1||o.sources!==1||o.l1Nodes!==1||o.invalidFrames!==0||o.streamError!==''||f.hidden!==false||f.contextState!=='running'||f.filters!==0||f.analysers!==2||f.buffers!==2||f.active100msTimers!==1||
    !isDeepStrictEqual(r,{state:'on',sources:1,wanted:true,gain:1,appliedGain:1})||!isDeepStrictEqual(f.normalizerSettings,{normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false})||
    !prepared||number(f.audioTime)>integer(prepared.frame)/s.sampleRate+20||rows(c.events).length>3||rows(c.attempts).length>402||
    [f.events,f.linearEvents,f.steps].some(v=>rows(v).some(e=>e.node===4||e.node===5)))fail('live-state');
}

/** @param {Record<string,unknown>} f @param {Record<string,unknown>} proof @param {import('../audio-l1-normalizer-oracle.mjs').NormalizerSignalSpec} spec @param {ReturnType<typeof selectNormalizerTarget>} target */
function signalTimeline(f,proof,spec,target){
  if(!target)return fail('signal-target');
  const c=object(f.normalizerControl),m=object(proof.measurement),message=object(target.command.message),epoch=integer(message.sourceEpoch),seq=integer(message.seq),end=integer(m.frame)+spec.seconds*spec.sampleRate;
  const begin=stamp(c.measurement,spec.sampleRate,epoch,seq),cutoff=stamp(c.frozenAt,spec.sampleRate,epoch,seq),attempts=rows(c.attempts),reads=rows(f.powerReads),ticks=rows(f.meterTickReads);
  if(!isDeepStrictEqual(proof.spec,spec)||!isDeepStrictEqual(proof.target,target)||!isDeepStrictEqual(m,f.normalizerMeasurement)||Object.keys(m).sort().join(',')!=='commandSeq,frame,meterTickCursor,powerReadCursor,sourceEpoch'||m.sourceEpoch!==epoch||m.commandSeq!==seq||m.frame!==begin.frame||m.powerReadCursor!==begin.powerReadCursor||m.meterTickCursor!==begin.meterTickCursor||integer(m.frame)<integer(target.completed.frame)||!isDeepStrictEqual(proof.signalWindow,{start:m.frame,end})||c.signalEndFrame!==end||!isDeepStrictEqual(c.observedAt,cutoff)||f.audioTime!==cutoff.time||integer(cutoff.frame)<end||!isDeepStrictEqual(proof.events,[])||!isDeepStrictEqual(c.events,[]))fail('signal-marker-or-freeze');
  if(cutoff.attemptCursor!==attempts.length||cutoff.powerReadCursor!==reads.length||cutoff.meterTickCursor!==ticks.length||begin.attemptCursor!==begin.powerReadCursor||integer(begin.powerReadCursor)!==2*(integer(begin.meterTickCursor)+1))fail('signal-cursor');
  for(const at of [begin,cutoff]){
    for(const [key,items,prior,next]of /** @type {[string,Record<string,unknown>[],string,string][]} */([['attemptCursor',attempts,'time','time'],['powerReadCursor',reads,'time','time'],['meterTickCursor',ticks,'endTime','startTime']])){
      const cursor=integer(at[key]);if(cursor>items.length||items.slice(0,cursor).some(p=>number(p[prior])>number(at.time))||items.slice(cursor).some(p=>number(p[next])<number(at.time)))fail('signal-cursor');
    }
    const cursor=integer(at.attemptCursor);if(attempts.slice(0,cursor).some(p=>number(p.wall)>number(at.wall))||attempts.slice(cursor).some(p=>number(p.wall)<number(at.wall)))fail('signal-cursor');
  }
  return {start:integer(m.frame),end,epoch,seq,cutoff};
}

/** @param {Archive} archive @param {unknown} raw @param {unknown} proofRaw @param {import('../audio-l1-normalizer-oracle.mjs').NormalizerSignalSpec} spec */
function assessNormalizerSignal(archive,raw,proofRaw,spec){
  const f=object(raw),proof=object(proofRaw),rate=spec.sampleRate;assertNormalizerControlLive(f,spec);
  const target=selectNormalizerTarget(f,proof.beforeTarget,proof.request,spec),t=signalTimeline(f,proof,spec,target),data=controlReceipts(archive,f,proof,spec,target,t),{s,o,evidence,events,applied,groups,reads,attempts,used,posted,failures}=data;
  const prepared=rows(o.replies).find(p=>p.kind==='prepared'),bound=integer(prepared?.frame)+20*rate;
  if(s.end===null||s.start===null||applied.some(a=>a.frame>=integer(s.end))||s.end>bound||s.end>integer(t.cutoff.frame)+128||integer(t.cutoff.frame)>bound||!Array.isArray(f.gains)||f.gains.some(v=>typeof v!=='number'||!Number.isFinite(v))||object(o.meterDiagnostics).sent!==object(o.meterDiagnostics).received||events.some(e=>e.direction==='receive'?integer(object(e.packet).frame)>integer(t.cutoff.frame):['power','read-error'].includes(String(object(e.packet).kind))&&number(object(e.packet).observedTime)>number(t.cutoff.time)))fail('signal-history-bound');
  const fft=2**Math.ceil(Math.log2(rate*.25)),delay=rate===44100?264:rate===48000?288:576;let identityStart=t.start;
  for(const row of applied)if(row.application.mode==='ramp'){
    const a=object(attempts[integer(row.group.startAttempt)]);identityStart=Math.min(identityStart,Math.round(number(a.time)*rate)-delay-fft);
  }
  if(identityStart<integer(s.start))fail('fft-history');
  const source=createNormalizerSignalSource(archive,spec,identityStart),fftRecords=[];let unusedHistory=0;
  for(const row of applied){
    if(row.packet.kind!=='power')fail('signal-fault-packet');
    for(let channel=0;channel<2;channel++){
      const a=object(attempts[integer(row.group.startAttempt)+channel]),read=object(reads[integer(row.group.startRead)+channel]);
      const result=source.fft({index:integer(a.index),size:integer(a.size),time:number(a.time)},{index:integer(read.index),size:integer(read.size),time:number(read.time),power:number(read.power)},row.application.mode==='ramp');
      fftRecords.push({meterSeq:row.seq,channel,...result});if(result.status==='MISMATCH')failures.push('normalizer-control-fft-source');if(result.status==='UNUSED_HISTORY')unusedHistory++;
    }
  }
  const inside=applied.filter(a=>a.frame>=t.start&&a.frame<t.end);let maxGap=0,previous=t.start,maxUp=0,maxDown=0;
  for(const a of inside){
    maxGap=Math.max(maxGap,(a.frame-previous)/rate);previous=a.frame;
    const from=Number(a.application.fromDb),to=Number(a.application.toDb),duration=number(a.application.end)-number(a.application.start);
    if(!Number.isFinite(from)||!Number.isFinite(to)||from< -12.0001||from>6.0001||to< -12.0001||to>6.0001)failures.push('normalizer-control-clamp');
    if(duration>0){maxUp=Math.max(maxUp,(to-from)/duration);maxDown=Math.max(maxDown,(from-to)/duration);}
  }
  maxGap=Math.max(maxGap,(t.end-previous)/rate);
  if(maxGap>.2001)failures.push('normalizer-control-tick-gap');if(maxUp>1.0001||maxDown>12.0001)failures.push('normalizer-control-rate');
  for(let i=1;i<groups.length;i++)if(number(object(groups[i]).startTime)<t.end/rate&&number(object(groups[i]).startTime)-number(object(groups[i-1]).startTime)>.2001)failures.push('normalizer-control-callback-gap');
  const quiet=spec.pattern==='silence'||spec.pattern==='noise';let noBoost=true,peak=0,over=0,endpointN=1,windows=0,actualNoBoost=true;
  for(let a=integer(s.start);a<integer(s.end);a+=rate){
    const b=Math.min(a+rate,integer(s.end)),program=validateProcessingCapture(archive.window(a,b,0)),input=validateProcessingCapture(archive.window(a,b,1)),control=archive.window(a,b,2);
    const comparison=compareL1Normalizer({schema:'f01-l1-normalizer-input-v2',sampleRate:rate,evidence,source:input,program,control,observation:{...o,hidden:f.hidden,contextState:f.contextState}});
    if(comparison.status==='UNAVAILABLE')fail('history-'+comparison.reason);if(comparison.status!=='diagnostic-match')failures.push('normalizer-control-N-'+windows);
    const first=Math.max(0,t.start-a);
    for(const [channel,value]of [-1,1,1,null,0].entries())if(value!==null&&control.channels[channel]?.slice(first).some(v=>v!==value))failures.push('normalizer-control-channel-'+channel);
    for(let n=first;n<Math.min(b,t.end)-a;n++){
      const actual=Number(/** @type {readonly import('../audio-signal.mjs').Samples[]} */(control.channels)[3]?.[n]);if(actual>1.00001)actualNoBoost=false;if(a+n===t.end-1)endpointN=actual;
      for(const channel of program.channels){const v=Math.abs(Number(channel[n]));peak=Math.max(peak,v);if(v>1)over++;}
    }
    windows++;
  }
  if(quiet){noBoost=actualNoBoost&&inside.every(a=>10**(Number(a.application.toDb)/20)<=1.00001&&10**(Number(a.application.fromDb)/20)<=1.00001);if(!noBoost)failures.push('normalizer-control-no-boost');}
  let burstFinite=false,silenceReturnUnity=false,silentPlans=0,silentAfter=/** @type {number|null} */(null);
  if(spec.pattern==='bursts'){
    const firstRamp=inside.find(a=>a.application.mode==='ramp');if(!firstRamp||firstRamp.frame/rate-number(object(reads[0]).time)<fft/rate-.02)failures.push('normalizer-control-window-warmup');
    if(peak>.9801||over)failures.push('normalizer-control-output-headroom');burstFinite=failures.length===0;
  }
  if(spec.pattern==='tone-silence'){
    silentAfter=number(f.audioTime)-number(object(f.video).currentTime)+9.5;
    const tail=inside.filter(a=>a.application.mode==='ramp'&&number(a.application.start)>=/** @type {number} */(silentAfter));silentPlans=tail.length;
    silenceReturnUnity=endpointN>0&&Math.abs(20*Math.log10(endpointN))<=1&&inside.some(a=>Number(a.application.toDb)>=5.9)&&silentPlans>10&&tail.every(a=>10**(Number(a.application.toDb)/20)<=10**(Number(a.application.fromDb)/20)+1e-8);
    if(!silenceReturnUnity)failures.push('normalizer-control-silence-return');
  }
  return {schema:'f01-packaged-normalizer-control-v1',caseId:spec.id,passed:failures.length===0,controlAssessed:true,qualityAssessed:false,failures:[...new Set(failures)],noBoost,burstFinite,silenceReturnUnity,silentPlans,silentAfter,endpointN,program:{peak,overFullScaleSamples:over},sourceIdentity:source.report,fftCompatibility:{records:fftRecords,unusedHistory,endpointProven:false},coverage:{start:s.start,caseStart:t.start,end:t.end,frames:t.end-t.start,windows,toleranceDb:.001},cadence:{maxGap,maxUp,maxDown,stallExceptions:0},power:{callbacks:groups.length,attempts:attempts.length,successfulReads:reads.length,posted:posted.length,unpostedCallbacks:groups.length-used.size},recordingCutoff:t.cutoff,pcmTransportBarrierProven:false,native7Witness:'UNASSESSED',native8Witness:'UNASSESSED',frameOrigin:'UNPROVEN',overallQualification:false};
}
/** @param {unknown} raw @param {number} rate @param {number} epoch @param {number} commandSeq */
function stamp(raw,rate,epoch,commandSeq){
  const s=object(raw);
  if(Object.keys(s).sort().join(',')!=='attemptCursor,commandSeq,frame,meterTickCursor,powerReadCursor,sourceEpoch,time,wall'||s.sourceEpoch!==epoch||s.commandSeq!==commandSeq||integer(s.frame)!==Math.round(number(s.time)*rate))fail('stamp');
  number(s.wall);integer(s.powerReadCursor);integer(s.meterTickCursor);integer(s.attemptCursor);return s;
}
/** @param {Record<string,unknown>} f @param {Record<string,unknown>} proof @param {FaultControlSpec} spec @param {ReturnType<typeof selectNormalizerTarget>} target */
function timeline(f,proof,spec,target){
  if(!target) return fail('target');
  const rate=spec.sampleRate,c=object(f.normalizerControl),events=rows(c.events),m=object(proof.measurement),message=object(target.command.message),epoch=integer(message.sourceEpoch),seq=integer(message.seq);
  if(!isDeepStrictEqual(proof.spec,spec)||!isDeepStrictEqual(proof.target,target)||!isDeepStrictEqual(m,f.normalizerMeasurement)||Object.keys(m).sort().join(',')!=='commandSeq,frame,meterTickCursor,powerReadCursor,sourceEpoch'||m.sourceEpoch!==epoch||m.commandSeq!==seq||integer(m.frame)<integer(target.completed.frame))fail('marker');
  const start=stamp(c.measurement,rate,epoch,seq),observed=stamp(c.observedAt,rate,epoch,seq);
  if(start.frame!==m.frame||start.powerReadCursor!==m.powerReadCursor||start.meterTickCursor!==m.meterTickCursor||events.length!==3||!isDeepStrictEqual(events,proof.events))fail('timeline');
  const stall=object(events[0]),on=object(events[1]),off=object(events[2]);
  if(Object.keys(stall).sort().join(',')!=='end,kind,milliseconds,start'||stall.kind!=='stall'||stall.milliseconds!==240||Object.keys(on).sort().join(',')!=='at,enabled,kind'||on.kind!=='analysis-error'||on.enabled!==true||Object.keys(off).sort().join(',')!=='at,enabled,kind'||off.kind!=='analysis-error'||off.enabled!==false)fail('event-order');
  const a=stamp(stall.start,rate,epoch,seq),b=stamp(stall.end,rate,epoch,seq),x=stamp(on.at,rate,epoch,seq),y=stamp(off.at,rate,epoch,seq),errorFacts=object(proof.errorObservation),ec=object(errorFacts.normalizerControl),z=stamp(ec.observedAt,rate,epoch,seq);
  const end=integer(x.frame)+rate*spec.errorMilliseconds/1000;
  if(rows(ec.attempts).length!==z.attemptCursor||rows(errorFacts.powerReads).length!==z.powerReadCursor||rows(errorFacts.meterTickReads).length!==z.meterTickCursor||rows(c.attempts).length!==observed.attemptCursor||rows(f.powerReads).length!==observed.powerReadCursor||rows(f.meterTickReads).length!==observed.meterTickCursor)fail('snapshot-cursor');
  if(number(a.wall)-number(start.wall)<6500-1e-6||number(b.wall)-number(a.wall)<240-1e-6||number(x.wall)-number(b.wall)<700-1e-6||number(z.wall)-number(x.wall)<220-1e-6||number(y.wall)<number(z.wall)||integer(y.frame)<end||integer(z.frame)<end||integer(observed.frame)<integer(y.frame)||number(observed.wall)<number(y.wall)||integer(b.frame)<integer(a.frame)||integer(x.frame)<integer(b.frame)||!isDeepStrictEqual(ec.events,events.slice(0,2)))fail('event-duration');
  for(const key of ['attempts','events'])if(!isDeepStrictEqual(rows(c[key]).slice(0,rows(ec[key]).length),ec[key]))fail('error-snapshot');
  for(const key of ['powerReads','meterTickReads'])if(!isDeepStrictEqual(rows(f[key]).slice(0,rows(errorFacts[key]).length),errorFacts[key]))fail('error-snapshot');
  if(!isDeepStrictEqual(ec.measurement,c.measurement)||number(errorFacts.audioTime)<end/rate)fail('error-snapshot');
  const currentLedger=rows(object(object(f.oracleEvidence).ledger).events),oldLedger=rows(object(object(errorFacts.oracleEvidence).ledger).events);
  if(!isDeepStrictEqual(currentLedger.slice(0,oldLedger.length),oldLedger)||!isDeepStrictEqual(errorFacts.normalizerMeasurement,m)||!isDeepStrictEqual(errorFacts.signal,f.signal)||errorFacts.sampleRate!==rate)fail('error-snapshot');
  if(oldLedger.some(e=>e.direction==='receive'&&integer(object(e.packet).frame)>integer(z.frame)))fail('error-snapshot-future');
  const attempts=rows(c.attempts),reads=rows(f.powerReads),ticks=rows(f.meterTickReads);
  for(const at of [start,a,b,x,z,y,observed]){
    for(const [key,items,before,after]of /** @type {[string,Record<string,unknown>[],string,string][]} */([
      ['attemptCursor',attempts,'time','time'],['powerReadCursor',reads,'time','time'],['meterTickCursor',ticks,'endTime','startTime'],
    ])){
      const cursor=integer(at[key]);if(cursor>items.length||items.slice(0,cursor).some(p=>number(p[before])>number(at.time))||items.slice(cursor).some(p=>number(p[after])<number(at.time)))fail('stamp-cursor');
    }
    const cursor=integer(at.attemptCursor);if(attempts.slice(0,cursor).some(p=>number(p.wall)>number(at.wall))||attempts.slice(cursor).some(p=>number(p.wall)<number(at.wall)))fail('stamp-attempt-order');
  }
  if(integer(start.powerReadCursor)!==2*(integer(start.meterTickCursor)+1)||start.attemptCursor!==start.powerReadCursor)fail('initial-marker-cursor');
  return {start:integer(m.frame),end,stallStart:number(a.time),stallEnd:number(b.time),on:x,off:y,epoch,seq,events};
}
/** @param {Archive} archive @param {Record<string,unknown>} f @param {Record<string,unknown>} proof @param {NormalizerControlSpec} spec @param {ReturnType<typeof selectNormalizerTarget>} target @param {{start:number,end:number,epoch:number,seq:number,on?:Record<string,unknown>,off?:Record<string,unknown>}} t */
function controlReceipts(archive,f,proof,spec,target,t){
  const s=archive.summary(),rate=spec.sampleRate,o=object(f.productObservation),evidence=object(f.oracleEvidence),ledger=object(evidence.ledger),events=rows(ledger.events),c=object(f.normalizerControl),attempts=rows(c.attempts),reads=rows(f.powerReads),ticks=rows(f.meterTickReads),fft=2**Math.ceil(Math.log2(rate*.25));
  if(s.sampleRate!==rate||s.start===null||s.end===null||s.start>t.start||s.end<t.end||s.cap!==96*1024*1024||s.bytes>s.cap||!isDeepStrictEqual(f.fftSizes,[fft,fft])||!Array.isArray(f.gains)||f.gains.length!==8||f.gains[4]!==1||f.gains[5]!==0||f.reads!==attempts.length||attempts.length<2||attempts.length>402||ticks.length>200)fail('formation');
  const lifecycle=events.filter(e=>e.direction==='send').map(e=>object(e.packet)).filter(p=>p.kind==='configure'||p.kind==='retire'),replies=events.filter(e=>e.direction==='receive').map(e=>object(e.packet)).filter(p=>p.kind!=='meter-accepted');
  if(!isDeepStrictEqual(lifecycle,rows(o.commands).map(c=>c.message))||!isDeepStrictEqual(replies,o.replies)||lifecycle.length!==2||!isDeepStrictEqual(object(object(proof.beforeTarget).oracleEvidence).initial,evidence.initial))fail('lifecycle');
  /** @type {string[]} */const failures=[];let cursor=0,priorTime=-1,priorWall=-1,priorReadTime=-1;
  for(const [i,a]of attempts.entries()){
    const time=number(a.time),wall=number(a.wall),fault=!!t.on&&!!t.off&&wall>=number(t.on.wall)&&wall<number(t.off.wall);
    if(a.ordinal!==i+1||a.size!==fft||!([0,1].includes(integer(a.index)))||time<priorTime||wall<priorWall||a.powerReadCursor!==cursor||a.fault!==fault||a.error!==(fault?'synthetic-native-analysis-fault':null))fail('read-attempt');
    if(fault){if(a.index!==0)fail('error-side');}else{
      const p=object(reads[cursor]);if(p.index!==a.index||p.size!==fft||number(p.time)<time||number(p.time)<priorReadTime||number(p.time)>number(f.audioTime)||!Number.isFinite(p.power)||number(p.power)<0)fail('read-binding');priorReadTime=number(p.time);cursor++;
    }
    priorTime=time;priorWall=wall;
  }
  if(cursor!==reads.length)fail('orphan-read');
  if(object(attempts[0]).index!==0||object(attempts[1]).index!==1||attempts.slice(0,2).some(a=>a.error!==null)||ticks[0]?.startAttempt!==2||ticks[0]?.startRead!==2)fail('initial-callback');
  /** @type {Record<string,unknown>[]} */
  const groups=[{ordinal:0,startAttempt:0,endAttempt:2,startRead:0,endRead:2,startTime:integer(/** @type {NonNullable<typeof target>} */(target).accepted.frame)/rate,endTime:object(reads[1]).time}];
  let lastAttempt=2,lastRead=2;
  for(const [i,k]of ticks.entries()){
    const a=integer(k.startAttempt),b=integer(k.endAttempt),part=attempts.slice(a,b),error=part[0]?.error!==null;
    if(k.ordinal!==i+1||a!==lastAttempt||k.startRead!==lastRead||b>attempts.length||part.length!==(error?1:2)||part[0]?.index!==0||!error&&part[1]?.index!==1||integer(k.endRead)!==lastRead+(error?0:2)||number(k.startTime)>number(k.endTime)||number(k.startWall)>number(k.endWall)||part.some(p=>number(p.time)<number(k.startTime)||number(p.time)>number(k.endTime)||number(p.wall)<number(k.startWall)||number(p.wall)>number(k.endWall)))fail('callback-attempts');
    groups.push(k);lastAttempt=b;lastRead=integer(k.endRead);
  }
  if(lastAttempt!==attempts.length||lastRead!==reads.length)fail('orphan-attempt');
  for(const g of groups)if(reads.slice(integer(g.startRead),integer(g.endRead)).some(p=>number(p.time)<number(g.startTime)||number(p.time)>number(g.endTime)))fail('callback-read-time');
  const posted=events.filter(e=>e.direction==='send').map(e=>object(e.packet)).filter(p=>p.kind==='power'||p.kind==='read-error'),acks=events.filter(e=>e.direction==='receive').map(e=>object(e.packet)).filter(p=>p.kind==='meter-accepted'),used=new Set();
  /** @type {{frame:number,time:number,seq:number,application:Record<string,unknown>,packet:Record<string,unknown>,group:Record<string,unknown>}[]} */
  const applied=[];
  for(const p of posted){
    const seq=integer(p.meterSeq),g=object(groups[seq-1]),a=object(attempts[integer(g.startAttempt)]),error=a.error!==null;
    if(!seq||!g||used.has(seq)||p.sourceEpoch!==t.epoch||p.meterEpoch!==object(/** @type {NonNullable<typeof target>} */(target).accepted).meterEpoch||number(p.observedTime)<number(g.startTime)||number(p.observedTime)>number(a?.time)||p.kind!==(error?'read-error':'power'))fail('posted-callback');
    if(!error){const l=reads[integer(g.startRead)],r=reads[integer(g.startRead)+1];if(p.active!==true||p.targetDbfs!==-20||p.leftPower!==l?.power||p.rightPower!==r?.power)fail('posted-power');}
    const matches=acks.filter(a=>a.seq===seq);if(matches.length!==1)fail('meter-ack');const ack=object(matches[0]),app=object(ack.application);
    if(ack.sourceEpoch!==t.epoch||ack.meterEpoch!==p.meterEpoch||app.commandSeq!==t.seq||app.meterSeq!==seq||app.sourceEpoch!==t.epoch||app.meterEpoch!==p.meterEpoch||app.frame!==ack.frame||number(ack.frame)/rate<number(g.endTime))fail('application-binding');
    used.add(seq);
    if(isNormalizerSignalControl(spec)||number(ack.frame)<t.end){
      applied.push({frame:integer(ack.frame),time:number(g.startTime),seq,application:app,packet:p,group:g});
    }
  }
  if(acks.length!==posted.length||!posted.length)fail('meter-count');
  return {s,o,evidence,events,attempts,reads,ticks,groups,posted,acks,used,applied,failures};
}

/** Fixed original fault subgates. Source, actual N, and injected failures remain separate evidence.
 * @param {Archive} archive @param {unknown} raw @param {unknown} proofRaw @param {NormalizerControlSpec} spec */
export function assessPackagedNormalizerControl(archive,raw,proofRaw,spec){
  spec=selected(spec);if(isNormalizerSignalControl(spec))return assessNormalizerSignal(archive,raw,proofRaw,spec);
  const sourceSpec=selectNormalizerCase(spec.sampleRate+'/normalizer/-24/stereo'),rate=spec.sampleRate,f=object(raw),proof=object(proofRaw);
  assertNormalizerControlLive(f,spec);
  const target=selectNormalizerTarget(f,proof.beforeTarget,proof.request,sourceSpec),t=timeline(f,proof,spec,target),fft=2**Math.ceil(Math.log2(rate*.25));
  const {s,o,evidence,attempts,reads,groups,posted,used,applied,failures}=controlReceipts(archive,f,proof,spec,target,t);
  for(const row of applied)if(row.application.mode==='ramp')for(const power of [row.packet.leftPower,row.packet.rightPower])if(number(power)<=0||Math.abs(10*Math.log10(number(power)/10**(-24/10)))>.05)failures.push('normalizer-control-fft-source');
  /** @param {number} left @param {number} right */
  const crosses=(left,right)=>left<=t.stallStart&&right>=t.stallEnd&&t.stallStart-left<=.2001&&right-t.stallEnd<=.2001;
  let callbackExceptions=0,stallExceptions=0,maxGap=0,previous=t.start/rate;
  for(let i=1;i<groups.length;i++){
    const left=number(object(groups[i-1]).startTime),right=number(object(groups[i]).startTime);if(right-left>.2001){if(crosses(left,right))callbackExceptions++;else failures.push('normalizer-control-callback-gap');}
  }
  for(const [i,row]of applied.entries()){
    const time=row.frame/rate,gap=time-previous,prior=i?applied[i-1]:null;
    if(gap>.2001){if(prior&&crosses(prior.time,row.time)&&crosses(prior.frame/rate,time))stallExceptions++;else failures.push('normalizer-control-tick-gap');}else maxGap=Math.max(maxGap,gap);
    const app=row.application,from=Number(app.fromDb),to=Number(app.toDb),duration=number(app.end)-number(app.start);
    if(!Number.isFinite(from)||!Number.isFinite(to)||from< -12.0001||from>6.0001||to< -12.0001||to>6.0001)failures.push('normalizer-control-clamp');
    if(app.mode!=='error'&&duration>0&&((to-from)/duration>1.0001||(from-to)/duration>12.0001))failures.push('normalizer-control-rate');
    previous=time;
  }
  if(t.end/rate-previous>.2001||callbackExceptions>1||stallExceptions>1)failures.push('normalizer-control-tick-gap');
  const after=applied.filter(a=>a.frame/rate>=t.stallEnd&&a.frame<integer(t.on.frame)),hold=after.find(a=>a.application.mode==='hold'),ramp=after.find(a=>a.application.mode==='ramp');
  const stallHold=!!hold&&!!ramp&&(ramp.frame-hold.frame)/rate>=fft/rate-.025;
  const errors=applied.filter(a=>a.application.mode==='error'&&a.frame>=integer(t.on.frame)&&a.frame+rate*.01<=t.end);
  const errorUnity=errors.some(a=>a.application.toDb===0&&Math.abs(number(a.application.end)-number(a.application.start)-.01)<.001);
  if(!stallHold)failures.push('normalizer-control-stall-hold');if(!errorUnity)failures.push('normalizer-control-error-unity');
  const starts=new Set([t.start,t.end-rate/10]);for(let a=Math.ceil(t.start/(rate/10))*(rate/10);a+rate/10<=t.end;a+=rate/10)starts.add(a);
  for(const a of starts)failures.push(...normalizerSourceFailures(archive.window(a,a+rate/10,1),sourceSpec).map(s=>'source-'+s));
  let windows=0;
  for(let a=integer(s.start);a<t.end;a+=rate){
    const b=Math.min(a+rate,t.end),source=archive.window(a,b,1),program=archive.window(a,b,0),control=archive.window(a,b,2);
    const comparison=compareL1Normalizer({schema:'f01-l1-normalizer-input-v2',sampleRate:rate,evidence,source,program,control,observation:{...o,hidden:f.hidden,contextState:f.contextState}});
    if(comparison.status==='UNAVAILABLE')fail('history-'+comparison.reason);if(comparison.status!=='diagnostic-match')failures.push('normalizer-control-N-'+windows);
    const fixedStart=Math.max(0,t.start-a);
    for(const [channel,value]of [-1,1,1,null,0].entries())if(value!==null&&control.channels[channel]?.slice(fixedStart).some(v=>v!==value))failures.push('normalizer-control-channel-'+channel);
    windows++;
  }
  return {schema:'f01-packaged-normalizer-control-v1',caseId:spec.id,passed:failures.length===0,controlAssessed:true,qualityAssessed:false,failures:[...new Set(failures)],stallHold,errorUnity,coverage:{start:s.start,end:t.end,windows,toleranceDb:.001},cadence:{maxGap,stallExceptions,callbackExceptions},power:{callbacks:groups.length,attempts:attempts.length,successfulReads:reads.length,posted:posted.length,unpostedCallbacks:groups.length-used.size},native7Witness:'UNASSESSED',native8Witness:'UNASSESSED',frameOrigin:'UNPROVEN',overallQualification:false};
}
