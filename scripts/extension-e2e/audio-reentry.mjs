import {assertAudioSource,assertLiveAudioSource} from '../audio-verification-contract.mjs';
import {isDeepStrictEqual} from 'node:util';
import {PACKAGED_REENTRY_CASE,PACKAGED_REENTRY_CASES,normalizerSignalFailures,selectNormalizerTarget,compareL1Normalizer} from '../audio-l1-normalizer-oracle.mjs';
import {classifyL1Reentry} from '../audio-l1-processing-metrics.mjs';
import {validateProcessingCapture} from '../audio-processing-metrics.mjs';
import {summarizeCapture} from '../audio-signal.mjs';
export {PACKAGED_REENTRY_CASE,PACKAGED_REENTRY_CASES};
/** @param {string} code */
const fail=code=>Error('audio-reentry-'+code);
/** @param {unknown} value @returns {Record<string,unknown>} */
function object(value){if(!value||typeof value!=='object'||Array.isArray(value))throw fail('shape');return /** @type {Record<string,unknown>} */(value);}
/** @param {unknown} value */
function rows(value){if(!Array.isArray(value))throw fail('rows');return value.map(object);}
/** @param {unknown} value */
function number(value){if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw fail('number');return value;}
/** @param {unknown} value */
function frame(value){const n=number(value);if(!Number.isSafeInteger(n))throw fail('frame');return n;}
/** @param {unknown} value */
function marker(value){const m=object(value);if(Object.keys(m).sort().join(',')!=='commandSeq,frame,meterTickCursor,powerReadCursor,sourceEpoch')throw fail('marker');for(const v of Object.values(m))frame(v);return m;}
/** @param {unknown} value @param {(typeof PACKAGED_REENTRY_CASES)[number]} [spec] */
export function reentrySignalFailures(value,spec=PACKAGED_REENTRY_CASE){return normalizerSignalFailures(value,spec);}

/** One original stimulus. The legacy twelve-case/phase coverage qualification remains open.
 * @param {{summary:()=>{sampleRate:number,start:number|null,end:number|null,bytes:number,cap:number},window:(start:number,end:number,stream?:number)=>{rate:number,start:number,end:number,channels:readonly import('../audio-signal.mjs').Samples[]}}} archive
 * @param {unknown} raw @param {unknown} proofRaw @param {(typeof PACKAGED_REENTRY_CASES)[number]} [spec]
 */
export function assessPackagedReentry(archive,raw,proofRaw,spec=PACKAGED_REENTRY_CASE){
  const f=object(raw),p=object(proofRaw),w=object(p.warmupFacts),o=object(f.productObservation),wo=object(w.productObservation),rate=spec.sampleRate;
  const fftSize=2**Math.ceil(Math.log2(rate*.25));
  if(!PACKAGED_REENTRY_CASES.some(c=>isDeepStrictEqual(c,spec))||!isDeepStrictEqual(p.spec,spec)||reentrySignalFailures(f,spec).length||reentrySignalFailures(w,spec).length)throw fail('original-spec-or-input');
  const target=selectNormalizerTarget(w,p.beforeTarget,p.request,spec);if(!target||!isDeepStrictEqual(target,p.target))throw fail('activation');
  const wm=marker(p.warmupMeasurement),m=marker(p.measurement),attempt=object(o.rapidMasterRequest),b=object(p.boundary),saved=object(attempt.measurement);
  const {wall,...savedMarker}=saved,commands=rows(o.commands),replies=rows(o.replies),messages=commands.map(c=>object(c.message)),warmCommands=rows(wo.commands),warmReplies=rows(wo.replies),epoch=number(object(target.command.message).sourceEpoch);
  if(!isDeepStrictEqual(wm,w.normalizerMeasurement)||!isDeepStrictEqual(wm,attempt.warmupMeasurement)||!isDeepStrictEqual(m,f.normalizerMeasurement)||!isDeepStrictEqual(m,savedMarker)||
    !isDeepStrictEqual(b,attempt.boundary)||!isDeepStrictEqual(attempt.input,{startPhaseMs:spec.startPhaseMs,milliseconds:spec.milliseconds})||attempt.error!==null||attempt.sourceEpoch!==epoch||attempt.commandCursor!==2||attempt.replyCursor!==warmReplies.length||
    wm.sourceEpoch!==epoch||wm.commandSeq!==2||m.sourceEpoch!==epoch||m.commandSeq!==4||frame(wm.frame)<number(target.completed.frame)+rate*6.5||frame(wm.frame)>Math.round(number(w.audioTime)*rate))throw fail('marker-or-attempt');
  if(commands.length!==4||warmCommands.length!==2||!isDeepStrictEqual(commands.slice(0,2),warmCommands)||!isDeepStrictEqual(replies.slice(0,warmReplies.length),warmReplies))throw fail('command-prefix');
  for(let i=0;i<4;i++)if(!isDeepStrictEqual(messages[i],{kind:'configure',sourceEpoch:epoch,seq:i+1,wanted:i!==2,gain:1,eq:Array(8).fill(0),normalizer:i!==0,dynamics:i!==0,targetDbfs:-20}))throw fail('command');
  const phase=classifyL1Reentry({sampleRate:rate,sourceEpoch:epoch,commands,replies,offSeq:3,onSeq:4}),A=phase.acceptedOffFrame,B=phase.acceptedOnFrame;
  if(B>phase.retirementStartFrame&&replies.filter(r=>r.kind==='completed'&&r.seq===3).length!==1||replies.some(r=>r.kind==='completed'&&r.gain!==1))throw fail('off-completion');
  const clocks=['edge','off','offDone','on','onDone'].map(k=>object(b[k]));
  for(let i=0;i<clocks.length;i++){number(clocks[i]?.audio);number(clocks[i]?.wall);if(i&&(number(clocks[i]?.audio)<number(clocks[i-1]?.audio)||number(clocks[i]?.wall)<number(clocks[i-1]?.wall)))throw fail('clock-order');}
  if(b.status!=='on'||number(clocks[1]?.wall)-number(clocks[0]?.wall)<spec.startPhaseMs||number(clocks[3]?.wall)-number(clocks[1]?.wall)<spec.milliseconds||number(wall)-number(clocks[4]?.wall)<spec.afterMilliseconds||
    number(commands[2]?.requestedFrame)<Math.round(number(clocks[1]?.audio)*rate)||number(commands[2]?.requestedFrame)>Math.round(number(clocks[2]?.audio)*rate)||
    number(commands[3]?.requestedFrame)<Math.round(number(clocks[3]?.audio)*rate)||number(commands[3]?.requestedFrame)>Math.round(number(clocks[4]?.audio)*rate)||B>Math.round(number(clocks[4]?.audio)*rate)||number(wm.frame)>Math.round(number(clocks[0]?.audio)*rate))throw fail('request-clocks');
  const onDone=replies.filter(r=>r.kind==='completed'&&r.seq===4);if(onDone.length!==1||!onDone[0])throw fail('on-completion');
  const onAccepted=replies.find(r=>r.kind==='accepted'&&r.seq===4);
  if(rate===96000&&(!onAccepted||replies.indexOf(onDone[0])<=replies.indexOf(onAccepted)||onDone[0]?.meterEpoch!==onAccepted.meterEpoch))throw fail('on-completion');
  const end=frame(m.frame),start=end-Math.round(rate*spec.tailSeconds),s=archive.summary(),events=rows(object(object(f.oracleEvidence).ledger).events),evidence=f.oracleEvidence;
  const prepared=events.find(e=>object(e.packet).kind==='prepared');
  if(!prepared||s.sampleRate!==rate||s.start===null||s.end===null||s.start>number(wm.frame)-rate/10||s.end<end||s.cap!==96*1024*1024||s.bytes>s.cap||end>frame(object(prepared.packet).frame)+20*rate||
    start<number(onDone[0]?.frame)||end<Math.round(number(clocks[4]?.audio)*rate)+Math.round(rate*spec.afterMilliseconds/1000)||end>=B+fftSize||end>Math.round(number(f.audioTime)*rate))throw fail('window-bound');
  if(f.sources!==1||o.sources!==1||o.l1Nodes!==1||o.invalidFrames!==0||o.streamError!==''||f.hidden!==false||f.contextState!=='running'||f.filters!==0||f.analysers!==4||f.buffers!==4||!isDeepStrictEqual(f.fftSizes,[fftSize,fftSize,fftSize,fftSize])||f.active100msTimers!==1||
    !isDeepStrictEqual(f.readback,{state:'on',sources:1,wanted:true,gain:1,appliedGain:1})||!isDeepStrictEqual(f.normalizerSettings,{normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false})||!Array.isArray(f.gains)||f.gains.length!==8||f.gains[4]!==1||f.gains[5]!==0)throw fail('graph');
  if(!isDeepStrictEqual(events.filter(e=>e.direction==='send'&&['configure','retire'].includes(String(object(e.packet).kind))).map(e=>e.packet),messages)||!isDeepStrictEqual(events.filter(e=>e.direction==='receive'&&object(e.packet).kind!=='meter-accepted').map(e=>e.packet),replies)||
    !isDeepStrictEqual(object(object(p.beforeTarget).oracleEvidence).initial,object(evidence).initial))throw fail('ledger-ownership');
  const reads=rows(f.powerReads),ticks=rows(f.meterTickReads),packets=events.filter(e=>e.direction==='send'&&['power','read-error'].includes(String(object(e.packet).kind))).map(e=>object(e.packet));
  const acceptedEvent=events.find(e=>e.direction==='receive'&&isDeepStrictEqual(e.packet,onAccepted));
  if(reads.length<4||reads.length>402||reads.length!==f.reads||reads.length%2||ticks.length>200)throw fail('power-bound');
  let prior=-1,secondGroup=false;
  for(let i=0;i<reads.length;i+=2){const l=object(reads[i]),r=object(reads[i+1]),group=number(l.index);if(![0,2].includes(group)||r.index!==group+1||group===0&&secondGroup||l.size!==fftSize||r.size!==fftSize||number(l.time)<prior||number(r.time)<number(l.time))throw fail('power-read');secondGroup||=group===2;if(group===2&&number(l.time)<B/rate)throw fail('power-epoch');number(l.power);number(r.power);prior=number(r.time);}
  if(!secondGroup)throw fail('power-restart');
  const filledAfter=number(target.completed.frame)/rate+fftSize/rate;
  for(const r of reads)if(number(r.index)<2&&number(r.time)>=filledAfter&&number(r.time)<=A/rate&&(number(r.power)<=0||Math.abs(10*Math.log10(number(r.power)/10**(-36/10)))>.05))throw fail('fft-source');
  let cursor=0,lastTick=-1;const covered=new Set();
  for(const [i,t]of ticks.entries()){const a=frame(t.startRead),z=frame(t.endRead),time=number(t.startTime);if(t.ordinal!==i+1||a<cursor||time<lastTick||![0,2].includes(z-a)||z>reads.length||number(t.endTime)<time)throw fail('tick');if(z>a){if(number(reads[a]?.time)<time||number(reads[z-1]?.time)>number(t.endTime))throw fail('tick-pair');covered.add(a/2);}cursor=z;lastTick=time;}
  const firstRestart=reads.findIndex(r=>r.index===2);for(let i=0;i<reads.length;i+=2)if(i!==0&&i!==firstRestart&&!covered.has(i/2))throw fail('tick-coverage');
  for(const mark of [wm,m]){const n=frame(mark.powerReadCursor),t=frame(mark.meterTickCursor),at=number(mark.frame)/rate;if(n%2||n>reads.length||t>ticks.length||n&&number(reads[n-1]?.time)>at||n<reads.length&&number(reads[n]?.time)<at||t&&number(ticks[t-1]?.endTime)>at||t<ticks.length&&number(ticks[t]?.startTime)<at)throw fail('marker-cursor');}
  const failures=new Set(),applications=[];let freshWarmup=false;
  for(const packet of packets){
    const seq=frame(packet.meterSeq),l=reads[2*(seq-1)],r=reads[2*(seq-1)+1],ack=events.filter(e=>e.direction==='receive').map(e=>object(e.packet)).find(a=>a.kind==='meter-accepted'&&a.seq===seq);
    if(packet.kind!=='power'||packet.active!==true||packet.targetDbfs!==-20||packet.sourceEpoch!==epoch||!l||!r||packet.leftPower!==l.power||packet.rightPower!==r.power||number(packet.observedTime)>number(l.time)||!ack||number(r.time)>number(ack.frame)/rate)throw fail('power-packet');
    if(ack.application!==null){const a=object(ack.application);applications.push(a);if(a.mode==='ramp'&&(number(l.power)<=0||number(r.power)<=0||[l,r].some(x=>Math.abs(10*Math.log10(number(x.power)/10**(-36/10)))>.05)))throw fail('fft-source');
      if(rate===96000&&a.meterEpoch===onDone[0]?.meterEpoch&&number(a.frame)>=B&&number(a.frame)<end){
        if(a.mode==='warmup'&&a.commandSeq===4&&a.sourceEpoch===epoch&&a.meterSeq===seq&&a.frame===ack.frame&&packet.meterEpoch===a.meterEpoch&&l.index===2&&r.index===3&&number(packet.observedTime)>=B/rate&&number(a.frame)/rate-number(packet.observedTime)<=.2&&2*seq<=number(m.powerReadCursor)&&isDeepStrictEqual(attempt.warmupMeter,{power:packet,application:a,reads:[l,r]})){
          const sent=events.find(e=>e.direction==='send'&&e.packet===packet),received=events.find(e=>e.direction==='receive'&&e.packet===ack);
          freshWarmup=number(acceptedEvent?.order)<number(sent?.order)&&number(sent?.order)<number(received?.order);
        }
      }
    }
  }
  if(rate===96000&&!freshWarmup)throw fail('tail-meter');
  /** @type {[number,number,number][]} */const activeIntervals=[[number(target.accepted.frame),A,number(target.accepted.meterEpoch)],[B,end,number(onDone[0]?.meterEpoch)]];
  for(const [a,z,epoch]of activeIntervals){
    const times=applications.filter(p=>p.meterEpoch===epoch&&number(p.frame)>=a&&number(p.frame)<z).map(p=>number(p.frame)).sort((a,b)=>a-b);const points=[a,...times,z];if(!times.length||points.some((n,i)=>i&&(n-number(points[i-1]))/rate>.2001))failures.add('normalizer-cadence');
  }
  for(const key of ['events','linearEvents','steps'])if(rows(f[key]).some(e=>e.node===4||e.node===5))failures.add('compressor-change');
  // Replay retains the whole prefix; every actual N sample is checked in bounded windows.
  /** @param {number} a @param {number} z @param {number} [stream] */
  const audio=(a,z,stream=0)=>{const c=validateProcessingCapture(archive.window(a,z,stream));if(c.rate!==rate||c.start!==a||c.end!==z)throw fail('audio-window');return c;};
  /** @param {number} a @param {number} z */
  const compare=(a,z)=>compareL1Normalizer({schema:'f01-l1-normalizer-input-v2',sampleRate:rate,evidence,source:audio(a,z,1),program:audio(a,z),control:archive.window(a,z,2),observation:{...o,hidden:f.hidden,contextState:f.contextState}});
  const beforeOff=compare(A-1,A);
  if(!('prediction'in beforeOff)||beforeOff.status!=='diagnostic-match'||beforeOff.prediction.lastDb<=0||Number(archive.window(A-1,A,2).channels[3]?.[0])<=1)throw fail('nonunity-precondition');
  let maxNDbError=0,windows=0;
  for(let a=s.start;a<end;a+=rate){const z=Math.min(a+rate,end),r=compare(a,z);if(!('prediction'in r))throw fail('history-'+r.reason);if(r.status!=='diagnostic-match')failures.add('normalizer-control');maxNDbError=Math.max(maxNDbError,r.comparison.maxDbError);windows++;}
  const tail=compare(start,end);if(!('prediction'in tail))throw fail('tail-history-'+tail.reason);if(tail.prediction.maxDb-tail.prediction.minDb>=.001)throw fail('tail-not-settled');
  const R=phase.retirementStartFrame,offQ=/** @param {number} n */n=>1-Math.max(0,Math.min(1,(n-(R-rate*.01))/(rate*.01))),qB=offQ(B);
  for(let a=s.start;a<s.end;a+=rate){const z=Math.min(a+rate,s.end),program=audio(a,z),control=archive.window(a,z,2);
    for(let i=0;i<z-a;i++){const n=a+i,wet=Number(control.channels[1]?.[i]),N=Number(control.channels[3]?.[i]),db=20*Math.log10(N);if(!Number.isFinite(wet)||!Number.isFinite(N)||control.channels[2]?.[i]!==1||control.channels[4]?.[i]!==0||N<=0||db< -12.0001||db>6.0001||wet<0||wet>1||Math.abs(Number(control.channels[0]?.[i])+wet)>1e-6)failures.add('control');
      if(n>=number(wm.frame)&&n<end){const q=n<B?offQ(n):qB+(1-qB)*Math.max(0,Math.min(1,(n-B)/(rate*.01)));if(Math.abs(wet-q)>1e-6)failures.add('q-control');}
      if(program.channels.some(c=>!Number.isFinite(c[i])||Math.abs(Number(c[i]))>1||wet===1&&Math.abs(Number(c[i]))>.9801))failures.add('program-ceiling');}
  }
  const width=rate/10,starts=new Set([s.start,s.end-width]);for(let a=Math.ceil(s.start/width)*width;a+width<=s.end;a+=width)starts.add(a);
  for(const a of starts)for(const row of summarizeCapture(audio(a,a+width,1),1000).channels)if(row.rms<=0||Math.abs(20*Math.log10(row.rms/10**(-36/20)))>.05||row.fundamentalAmplitude===null||row.fundamentalAmplitude<=0||Math.abs(20*Math.log10(row.fundamentalAmplitude/(Math.SQRT2*10**(-36/20))))>.05)failures.add('source-input');
  const expectedDbfs=-36+tail.prediction.lastDb,output=summarizeCapture(audio(start,end),1000);
  for(const row of output.channels)if(row.rms<=0||Math.abs(20*Math.log10(row.rms)-expectedDbfs)>.05||row.fundamentalAmplitude===null||row.fundamentalAmplitude<=0||Math.abs(20*Math.log10(row.fundamentalAmplitude/Math.SQRT2)-expectedDbfs)>.05||row.peak>.9801||row.overFullScaleSamples!==0)failures.add('tail-output');
  // Only the original 41/46 cases require a target phase; 0/36 fixes the stimulus.
  const expected=spec.id==='44100/reentry/0/41'?'RETIRE':spec.id==='44100/reentry/0/46'?'UNITY':null,formed=expected===null||phase.phase===expected,behavior={passed:failures.size===0,failures:[...failures]};
  return {schema:'f01-packaged-reentry-observation-v3',caseId:spec.id,passed:behavior.passed&&formed,outcome:!behavior.passed?'FAIL':formed?'PASS':'INCONCLUSIVE',formation:{expected,actual:phase.phase,status:expected===null?'NOT_REQUIRED':formed?'FORMED':'INCONCLUSIVE'},behavior,failures:[...failures],phase,window:{rate,start,end},expectedDbfs,output,controlCoverage:{start:s.start,end,frames:end-s.start,windows,maxNDbError,toleranceDb:.001},power:{reads:reads.length,callbacks:ticks.length,posted:packets.length},native7Witness:'UNASSESSED',native8Witness:'UNASSESSED',frameOrigin:'UNPROVEN',overallQualification:false};
}


/** 부모가 선택한 실행·사례와 실제 하위 검사의 시작/종료 소스를 결속한다.
 * @param {unknown} before @param {unknown} raw @param {string} runId @param {string} caseId @param {{root:string}} files */
export function verifyReentryRun(before,raw,runId,caseId,files) {
  const result=object(raw), report=object(result.audioProduct);
  for (const source of [before,result.source,result.after]) assertLiveAudioSource(source,files);
  if(result.runId!==runId||report.runId!==runId||report.scope!==caseId||
      !isDeepStrictEqual(result.source,before)||!isDeepStrictEqual(result.after,before)||
      !isDeepStrictEqual(report.source,before)) throw fail('source-or-run');
}

/** 보존한 PCM·수명 기록·실제 지정 대상에서 같은 실행의 저장 판정을 다시 계산한다.
 * @param {Parameters<typeof assessPackagedReentry>[0]} archive @param {unknown} rawReport @param {unknown} rawProof
 * @param {(typeof PACKAGED_REENTRY_CASES)[number]} spec @param {string} runId @param {unknown} source
 */
export function verifySavedReentry(archive,rawReport,rawProof,spec,runId,source) {
  const report=object(rawReport), proof=object(rawProof);
  assertAudioSource(source);
  if(report.schema!=='f01-product-reentry-observation-v3'||report.runId!==runId||proof.runId!==runId||
      report.scope!==spec.id||!isDeepStrictEqual(report.source,source)||!isDeepStrictEqual(proof.source,source)||
      !isDeepStrictEqual(report.spec,spec)||!isDeepStrictEqual(proof.spec,spec)||
      !isDeepStrictEqual(proof.target,report.target)||!isDeepStrictEqual(proof.measurement,report.measurement))throw fail('saved-context');
  const measured=JSON.parse(JSON.stringify(assessPackagedReentry(archive,report.facts,proof,spec)));
  if(!measured.passed||measured.native7Witness!=='UNASSESSED'||measured.overallQualification!==false||
      !isDeepStrictEqual(measured.phase.authority,object(source).audioContract)||!isDeepStrictEqual(measured,report.reentry))throw fail('saved-assessment');
}
