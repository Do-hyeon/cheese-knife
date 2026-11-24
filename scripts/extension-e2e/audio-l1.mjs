// 네이티브 오디오 시나리오와 소스·보호 자료 검증 함수를 제공한다. 저장소 루트에서 node --test tests/f01-j1-native-contract.test.cjs 로 호출 계약을 확인한다.
// 보존 함수 호출 예: await l1Preservation(files, reference). 호출자가 고정한 참조를 읽어 관측값을 반환하며, 필수 입력이나 대조가 실패하면 예외를 던진다.
import {audioInputs, attestAudioSource} from '../audio-verification-contract.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {readFile} from 'node:fs/promises';
import {installProcessingProbe,callProcessingProbe} from '../audio-processing-probe.mjs';
import {summarizeCapture} from '../audio-signal.mjs';
import {equalizerResponseDb,evaluateProcessingTransition} from '../audio-processing-metrics.mjs';
import {audioOperation,nativeFailureDetails} from '../audio-native-browser.mjs';

/** @template T @param {readonly T[]} rows @param {number} index @returns {T} */
function at(rows,index){const value=rows[index];if(value===undefined)throw new Error('audio-l1-index');return value;}
/** @param {import('playwright').Page} page @param {import('../audio-processing-probe.mjs').ProcessingAction} action */
const probe=(page,action)=>audioOperation('l1-probe-'+action.kind,()=>page.evaluate(callProcessingProbe,action),30000);
const parentId='F01L1Clock20261018',childId=parentId+'R48';
const j1ParentId='F01J1Native20261018',j1ChildId=j1ParentId+'R48';
const fixtureURL='https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
/** @param {string} code */const fail=code=>Object.assign(new Error(code),{code});
/** @param {unknown} raw @returns {Record<string,unknown>} */
const record=raw=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw fail('audio-l1-record');return /** @type {Record<string,unknown>} */(raw);};
/** @param {unknown} raw @returns {unknown[]} */const list=raw=>{if(!Array.isArray(raw))throw fail('audio-l1-list');return raw;};
/** @param {unknown} value @returns {number} */const finite=value=>{if(typeof value!=='number'||!Number.isFinite(value))throw fail('audio-l1-number');return value;};
/** @param {unknown} value */const integer=value=>{const n=finite(value);if(!Number.isSafeInteger(n)||n<0)throw fail('audio-l1-frame');return n;};
/** @param {string|Uint8Array} bytes */const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

/** @typedef {{start:number,end:number,channels:Float32Array[]}} L1Stream */
/** Validate actual frame coverage, not an inferred time offset. @param {unknown} raw */
export function decodeL1Capture(raw){
  const row=record(raw);
  if(row.sampleRate!==48000||row.sources!==1||row.l1Nodes!==1||row.invalidFrames!==0||row.streamError!==''||row.hidden!==false||row.contextState!=='running')throw fail('audio-l1-observation');
  const sourceFrame=integer(row.sourceFrame),streams=list(row.streams);
  if(streams.length!==3)throw fail('audio-l1-stream-count');
  let bytesTotal=0;
  const decoded=streams.map((raw,index)=>{
    const stream=record(raw),start=integer(stream.start),end=integer(stream.end),count=index===2?5:2;
    if(end<=start||start<sourceFrame||stream.channels!==count||stream.encoding!=='interleaved-float32le'||typeof stream.base64!=='string'||
      stream.base64.length>128*1024*1024||stream.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(stream.base64))throw fail('audio-l1-stream-format');
    const bytes=Buffer.from(stream.base64,'base64');bytesTotal+=bytes.length;
    if(bytes.length!==(end-start)*count*4||bytesTotal>96*1024*1024)throw fail('audio-l1-stream-size');
    const channels=Array.from({length:count},()=>new Float32Array(end-start));
    for(let n=0;n<end-start;n++)for(let c=0;c<count;c++){
      const value=bytes.readFloatLE((n*count+c)*4);if(!Number.isFinite(value))throw fail('audio-l1-sample');at(channels,c)[n]=value;
    }
    return {start,end,channels};
  });
  const first=decoded[0];if(!first||decoded.some(stream=>stream.start!==first.start||stream.end!==first.end))throw fail('audio-l1-clock');
  const commands=list(row.commands).map(raw=>{const r=record(raw);return {message:record(r.message),requestedFrame:integer(r.requestedFrame),mediaTime:finite(r.mediaTime)};});
  if(commands.length!==3||commands.some((r,i)=>r.message.kind!=='configure'||r.message.seq!==i+1||r.message.wanted!==(i!==1)||r.message.gain!==1.32||
    !isDeepStrictEqual(r.message.eq,[0,0,0,-6,-6,-6,-6,-6])||r.message.normalizer!==false))throw fail('audio-l1-intent');
  const replies=list(row.replies).map(record),epoch=integer(at(commands,0).message.sourceEpoch);
  if(replies.some(r=>r.sourceEpoch!==epoch||!Number.isSafeInteger(r.frame)||!Number.isSafeInteger(r.seq)||['failed','rejected'].includes(String(r.kind))))throw fail('audio-l1-reply');
  const events=commands.map(command=>{
    const accepts=replies.filter(r=>r.kind==='accepted'&&r.seq===command.message.seq),completes=replies.filter(r=>r.kind==='completed'&&r.seq===command.message.seq);
    if(accepts.length!==1||completes.length!==1)throw fail('audio-l1-ack');
    const acceptedFrame=integer(at(accepts,0).frame),completedFrame=integer(at(completes,0).frame);
    if(acceptedFrame<command.requestedFrame||completedFrame!==acceptedFrame+1728||completedFrame+9600>first.end||at(accepts,0).code!==null||at(completes,0).code!==null||
      at(completes,0).gain!==(command.message.wanted?1.32:1))throw fail('audio-l1-ack-frame');
    return {...command,acceptedFrame,completedFrame};
  });
  if(events.some((event,i)=>event.acceptedFrame<first.start||i>0&&event.acceptedFrame<=at(events,i-1).completedFrame))throw fail('audio-l1-event-order');
  return {row,streams:decoded,events};
}

/** D0 only; never import the product kernel or fit a signed/phase reference. @param {unknown} raw */
export function assessL1Capture(raw){
  return assessCapture(raw,false);
}
/** Explicit local J1 check; capture metadata cannot select this path. @param {unknown} raw */
export function assessJ1Capture(raw){
  return {...assessCapture(raw,true),schema:'f01-j1-local-v1',scope:'48k-original250-D0-local-only',trajectory:'j1-unity-v1'};
}
/** Same independent numbers, explicitly selected installed qualification. @param {unknown} raw */
export function assessJ1NativeCapture(raw){
  return {...assessCapture(raw,true),schema:'f01-j1-native-v1',scope:'48k-original250-D0-only',trajectory:'j1-unity-v1'};
}
/** Independent fixed original-case OFF control reference, not a product helper. @param {number} x */
function j1OffGain(x){
  if(x<=0)return 1.32;if(x>=960)return 1;
  const z=Math.min(x,960-x)/128,integral=2.5*z**4-3*z**5+z**6;
  const p=x<128?128*integral/832:x>832?1-128*integral/832:(x-64)/832;
  const dp=x<128||x>832?(10*z**3-15*z**4+6*z**5)/832:1/832;
  const A=10**(-6*(1-p)/40);let nu=0;
  for(const frequency of [500,1000,2000,4000,8000]){
    const w=2*Math.PI*frequency/48000;
    nu+=Math.sin(w)/(4*Math.sin(w/2)**2)*Math.LN10/40*(A+1/A)*6*dp;
  }
  return 1.32**(1-p)/(1+nu);
}
/** @param {unknown} raw @param {boolean} joint */
function assessCapture(raw,joint){
  const data=decodeL1Capture(raw),program=at(data.streams,0),controls=at(data.streams,2);
  /** @param {number} start @param {number} end */const window=(start,end)=>{
    if(start<program.start||end>program.end||end<=start)throw fail('audio-l1-window');
    return summarizeCapture({rate:48000,start,end,channels:[at(program.channels,0).subarray(start-program.start,end-program.start),at(program.channels,1).subarray(start-program.start,end-program.start)]});
  };
  const failures=[];
  const transitions=data.events.slice(1).map((event,eventIndex)=>{
    const frame=event.acceptedFrame,before=window(frame-3840,frame-1920),change=window(frame-960,frame+1920),after=window(frame+4800,frame+6720);
    const errors=evaluateProcessingTransition(before,change,after);
    const source=at(data.streams,1),sourceSummary=summarizeCapture({rate:48000,start:frame+4800,end:frame+6720,
      channels:[at(source.channels,0).subarray(frame+4800-source.start,frame+6720-source.start),at(source.channels,1).subarray(frame+4800-source.start,frame+6720-source.start)]},250);
    const expectedDb=event.message.wanted?equalizerResponseDb([0,0,0,-6,-6,-6,-6,-6],48000,250)+20*Math.log10(1.32):0;
    for(let c=0;c<2;c++){
      const input=at(sourceSummary.channels,c),output=at(after.channels,c);
      if(input.rms<=0||Math.abs(20*Math.log10(input.rms/(.1/Math.SQRT2)))>.05||input.fundamentalAmplitude===null||
        input.fundamentalAmplitude<=0||Math.abs(20*Math.log10(input.fundamentalAmplitude/.1))>.05)errors.push('input-channel-'+c);
      if(output.rms<=0||Math.abs(20*Math.log10(output.rms/input.rms)-expectedDb)>(event.message.wanted?.5:.05))errors.push('endpoint-channel-'+c);
    }
    const minimum=before.channels.map((channel,c)=>Math.min(channel.envelope8ms.min,at(after.channels,c).envelope8ms.min));
    const end=data.events[eventIndex+2]?.acceptedFrame??program.end;
    const entire=window(frame-3840,end);
    for(let c=0;c<2;c++){
      if(at(entire.channels,c).envelope8ms.min<at(minimum,c)*.95)errors.push('continuous-channel-'+c+'/dip');
      if(at(entire.channels,c).maxAdjacentStep>Math.max(at(before.channels,c).maxAdjacentStep,at(after.channels,c).maxAdjacentStep)+1e-6)errors.push('continuous-channel-'+c+'/step');
    }
    failures.push(...errors.map(e=>String(event.message.seq)+'/'+e));
    const witnesses=program.channels.map(samples=>{
      let sum=0,min=Infinity,minFrame=0,step=0,stepFrame=0;
      const start=frame-3840;
      for(let f=start;f<end;f++){
        const n=f-program.start,x=finite(samples[n]);sum+=x*x;
        if(f-start>=384){const old=finite(samples[n-384]);sum-=old*old;}
        if(f-start>=383){const rms=Math.sqrt(Math.max(0,sum/384));if(rms<min){min=rms;minFrame=f-383;}}
        if(f>start){const d=Math.abs(x-finite(samples[n-1]));if(d>step){step=d;stepFrame=f;}}
      }
      return {rms8ms:min,startFrame:minFrame,endFrame:minFrame+384,relativeStart:minFrame-frame,maxStep:step,stepFrame,relativeStep:stepFrame-frame};
    });
    return {seq:event.message.seq,requestedFrame:event.requestedFrame,acceptedFrame:frame,completedFrame:event.completedFrame,before,change,after,entire,witnesses,failures:errors};
  });
  const whole=window(program.start,program.end);
  for(const [c,channel]of whole.channels.entries())if(channel.peak>1||channel.overFullScaleSamples!==0)failures.push('whole-channel-'+c+'/fullscale');
  let controlError=false;
  for(let n=0;n<controls.end-controls.start;n++){
    const dry=finite(at(controls.channels,0)[n]),wet=finite(at(controls.channels,1)[n]),gain=finite(at(controls.channels,2)[n]),norm=finite(at(controls.channels,3)[n]),permit=finite(at(controls.channels,4)[n]);
    if(Math.abs(dry+wet)>1e-6||wet<0||wet>1||gain<0||gain>2||norm!==1||permit!==0)controlError=true;
    const frame=controls.start+n;
    let expectedQ=0,expectedG=1;
    for(const event of data.events){
      if(frame>=event.acceptedFrame){
        const on=event.message.wanted===true,begin=event.acceptedFrame+(on?0:960+288),progress=Math.max(0,Math.min(1,(frame-begin)/480));
        expectedQ=on?progress:1-progress;
      }
      const gf=frame-288;
      if(gf>=event.acceptedFrame){
        const on=event.message.wanted===true,begin=event.acceptedFrame+(on?480:0),progress=Math.max(0,Math.min(1,(gf-begin)/960));
        expectedG=on?1+.32*progress:joint?j1OffGain(gf-event.acceptedFrame):1.32-.32*progress;
      }
    }
    if(Math.abs(wet-expectedQ)>1e-6||Math.abs(gain-expectedG)>1e-6)controlError=true;
    if(wet===1&&Math.max(Math.abs(finite(at(program.channels,0)[n])),Math.abs(finite(at(program.channels,1)[n])))>.9801)failures.push('wet-ceiling');
  }
  const off=at(data.events,1),on=at(data.events,2),echo=at(data.streams,1);
  let rawDelayError=0;
  for(let frame=off.completedFrame;frame<on.acceptedFrame;frame++)for(let c=0;c<2;c++){
    rawDelayError=Math.max(rawDelayError,Math.abs(finite(at(program.channels,c)[frame-program.start])-finite(at(echo.channels,c)[frame-288-echo.start])));
  }
  if(rawDelayError>1e-6)failures.push('raw-D288-relation');
  if(controlError)failures.push('control5-invariant');
  for(const event of data.events){
    const index=event.completedFrame-controls.start,wanted=event.message.wanted;
    if(at(controls.channels,0)[index]!== (wanted?-1:0)||at(controls.channels,1)[index]!== (wanted?1:0)||Math.abs(finite(at(controls.channels,2)[index])- (wanted?1.32:1))>1e-6)failures.push('control-completion-'+String(event.message.seq));
  }
  const readback=record(data.row.readback);
  if(readback.sources!==1||readback.state!=='on'||readback.wanted!==true||readback.appliedGain!==1.32)failures.push('final-readback');
  return {schema:'f01-l1-native-v1',scope:'48k-original250-D0-only',passed:failures.length===0,failures:[...new Set(failures)],transitions,whole,
    events:data.events,sourceFrame:data.row.sourceFrame,captureStartFrame:data.row.captureStartFrame,
    input:{rate:48000,frequency:250,peak:.1,phase:.37,channels:2,seconds:20},rawDelayError,signedOracle:'not-run-I4-open'};
}

/** @param {import('playwright').Page} page */
export async function waitL1On(page){
  await audioOperation('l1-actual-on',()=>page.waitForFunction(()=>{
    const r=Object.getOwnPropertyDescriptor(window,Symbol.for('cheese-knife.runtime.v1'))?.value,v=document.querySelector('video');
    const b=r?.audio?.getReadback(v);return b?.sources===1&&b.state==='on'&&b.appliedGain===1.32;
  },null,{timeout:2000}),30000);
}

/** Async facts must be awaited explicitly: Playwright's predicate polling treats a Promise as truthy.
 * @param {import('playwright').Page} page @param {number} targetFrame
 */
export async function waitL1Frame(page,targetFrame){
  integer(targetFrame);
  const row=record(await audioOperation('l1-source-clock',()=>page.evaluate(async target=>{
    const p=Object.getOwnPropertyDescriptor(window,Symbol.for('cheese-knife.f01-processing-probe'))?.value;
    if(!p||typeof p.action!=='function')throw Error('audio-l1-clock-probe');
    const started=performance.now();let previous=-1;
    for(;;){
      if(performance.now()-started>=5000)throw Error('audio-l1-clock-timeout');
      const facts=await p.action({kind:'facts'}),time=facts?.audioTime;
      if(typeof time!=='number'||!Number.isFinite(time)||time<0||facts.sampleRate!==48000||facts.contextState!=='running'||facts.hidden!==false)throw Error('audio-l1-clock-state');
      const frame=Math.round(time*48000);
      if(!Number.isSafeInteger(frame)||frame<previous)throw Error('audio-l1-clock-regressed');
      if(frame>=target)return {targetFrame:target,frame,audioTime:time};
      previous=frame;await new Promise(resolve=>setTimeout(resolve,4));
    }
  },targetFrame),5000));
  if(row.targetFrame!==targetFrame||integer(row.frame)<targetFrame||Math.round(finite(row.audioTime)*48000)!==row.frame)throw fail('audio-l1-clock-early');
  return {targetFrame,frame:integer(row.frame),audioTime:finite(row.audioTime)};
}

/** Formation guard, separate from all unchanged DSP gates. @param {unknown} raw @param {number} playAudioTime */
export function l1RequestTiming(raw,playAudioTime){
  const start=integer(Math.round(finite(playAudioTime)*48000)),commands=list(record(raw).commands);
  if(commands.length!==3)throw fail('audio-l1-clock-command-count');
  return [73440,92160].map((offset,index)=>{
    const targetFrame=integer(start+offset),requestedFrame=integer(record(at(commands,index+1)).requestedFrame);
    if(requestedFrame<targetFrame)throw fail('audio-l1-clock-early-request');
    return {targetFrame,requestedFrame};
  });
}

/** @template T @param {(input:T)=>Promise<unknown>} close @param {(input:T)=>Promise<unknown>} abort */
export function l1OwnedCloser(close,abort){let retired=false;return async(/** @type {T} */input)=>{
  try{return await close(input);}catch(cause){
    const error=cause instanceof Error?cause:Error(String(cause));
    if(!retired){retired=true;try{const retirement=await abort(input);Object.assign(error,{forcedRetirement:true,...retirement&&typeof retirement==='object'&&Reflect.get(retirement,'kind')==='exit'?{abortChildExit:retirement}:{}});}catch(retireError){Object.assign(error,{forcedRetirement:false,retireError:String(retireError),retirementError:nativeFailureDetails(retireError)});}}
    throw error;
  }
};}

/** @typedef {{root:string,readFile:{(relative:string):Promise<Buffer>;(relative:string,encoding:'utf8'):Promise<string>},resolve:(relative:string,options?:{type:string})=>Promise<string>,readdir:(relative:string,options:{withFileTypes:true})=>Promise<import('node:fs').Dirent[]>,writeFile:(relative:string,value:string|Uint8Array,options?:{flag:string})=>Promise<unknown>,ensureDirectory:(relative:string)=>Promise<string>,lstat:(relative:string,options?:{optional:boolean})=>Promise<import('node:fs').Stats|null>}} L1Files */
const newInputs=['src/main/features/audio/transition.ts','src/main/features/audio/transition-worklet.ts','extension/web/audio-transition-worklet.js','scripts/extension-e2e/audio-l1.mjs',
  'tests/f01-l1-kernel.test.cjs','tests/f01-l1-controller.test.cjs','tests/f01-l1-native-contract.test.cjs','tests/fixtures/f01-l1-runtime-js.json','tests/fixtures/f01-l1-runtime-executable.json',
  ...audioInputs,'tests/f01-l1-clock.test.cjs'];
/** @param {unknown} value */
function evidencePath(value){
  if(typeof value!=='string'||/[\\:\x00-\x1f]/.test(value)||
    value.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)))
    throw fail('audio-protection-path');
  return value;
}
/** @param {unknown} value */
function evidenceHash(value){
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)||value.length!==64)throw fail('audio-protection-hash');
  return value;
}
/** 고정 길이 외부 참조는 빈 슬롯과 상속된 슬롯도 누락으로 처리한다. @param {unknown} value @param {number} count */
function referenceRows(value,count){
  const rows=list(value);
  if(rows.length!==count)throw fail('audio-protection-path-count');
  for(let index=0;index<count;index++)if(!Object.hasOwn(rows,index))throw fail('audio-protection-missing-row');
  return rows;
}
/** @param {string[]} names @param {number} count */
function distinctPaths(names,count){
  if(names.length!==count||new Set(names.map(name=>name.toLowerCase())).size!==count)
    throw fail('audio-protection-path-count');
}
/** @param {unknown} value */
function evidencePin(value){
  const row=record(value);
  return {file:evidencePath(row.file),sha256:evidenceHash(row.sha256)};
}
/** @param {unknown} value */
function preparationPins(value){
  const row=record(value),manifest=evidencePin(row.manifest),baseline=evidencePin(row.baseline);
  distinctPaths([manifest.file,baseline.file],2);
  return {manifest,baseline};
}
/** @param {L1Files} files @param {{file:string,sha256:string}} pin @param {string} error */
async function pinnedBytes(files,pin,error){
  const bytes=await files.readFile(pin.file);
  if(sha(bytes)!==pin.sha256)throw fail(error);
  return bytes;
}
const launchers=['scripts/extension-e2e/visibility-browser.mjs','tests/visibility-browser.test.cjs','tests/visibility-browser-protocol.test.cjs'];
const priorNames=['before.json','summary.json','capture.json','partial.json','summary.json','playback.json','cold.json','trace.zip','failure.png'];
/** @param {unknown} raw */
function l1Reference(raw){
  const row=record(raw),head=row.head;
  if(typeof head!=='string'||head.length!==40||!/^[a-f0-9]{40}$/.test(head))throw fail('audio-l1-head');
  const semanticIndex=evidenceHash(row.semanticIndex);
  const pins=referenceRows(row.protectedPins,25).map(raw=>{
    const pin=record(raw);
    return {...evidencePin(pin),bytes:integer(pin.bytes)};
  });
  distinctPaths(pins.map(pin=>pin.file),25);
  if(!pins.some(pin=>pin.file==='.git/index'))throw fail('audio-l1-index-pin');
  const dirty=referenceRows(row.dirty,launchers.length).map(evidencePin),priorRun=referenceRows(row.priorRun,priorNames.length).map(evidencePin);
  distinctPaths(dirty.map(pin=>pin.file),launchers.length);
  if(dirty.some((pin,i)=>pin.file!==launchers[i]))throw fail('audio-l1-dirty-launcher-name');
  distinctPaths(priorRun.map(pin=>pin.file),priorNames.length);
  const parentFolder=path.posix.dirname(at(priorRun,0).file),childFolder=path.posix.dirname(at(priorRun,2).file);
  if(parentFolder.toLowerCase()===childFolder.toLowerCase()||priorRun.some((pin,i)=>
    pin.file!==(i<2?parentFolder:childFolder)+'/'+priorNames[i]))throw fail('audio-l1-prior-run-name');
  return {head,semanticIndex,pins,dirty,priorRun};
}
/** 외부 참조의 파일명·개수·해시를 모두 확인한 뒤 보호 파일을 읽는다. @param {L1Files} files @param {unknown} [reference] */
export async function l1Preservation(files,reference){
  return checkL1Preservation(files,l1Reference(reference));
}
/** 호출 시 검증하고 복사한 L1 참조만 사용한다. @param {L1Files} files @param {ReturnType<typeof l1Reference>} expected */
async function checkL1Preservation(files,expected){
  let historicalIndex=null;
  for(const pin of expected.pins){
    const bytes=await files.readFile(pin.file),actual=sha(bytes);
    // L1은 index 파일의 물리 바이트 차이를 기록하고, 아래에서 stage와 HEAD 내용을 검증한다.
    if(pin.file==='.git/index')historicalIndex={expected:pin.sha256,actual,byteMatch:actual===pin.sha256};
    else if(bytes.length!==pin.bytes||actual!==pin.sha256)throw fail('audio-l1-pin-changed');
  }
  /** @param {string[]} args */const git=args=>execFileSync('git',['--no-optional-locks',...args],{cwd:files.root,encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
  const staged=git(['ls-files','--stage','-z']).split('\0').filter(Boolean).map(row=>{
    const tab=row.indexOf('\t'),[mode,object,stage]=row.slice(0,tab).split(' ');
    if(stage!=='0')throw fail('audio-l1-index-content-changed');
    return row.slice(tab+1)+' '+mode+' '+object;
  }).sort();
  const head=git(['ls-tree','-rz','HEAD']).split('\0').filter(Boolean).map(row=>{
    const tab=row.indexOf('\t'),[mode,,object]=row.slice(0,tab).split(' ');
    return row.slice(tab+1)+' '+mode+' '+object;
  }).sort();
  const semanticIndex=sha(JSON.stringify(staged));
  if(!isDeepStrictEqual(staged,head)||semanticIndex!==expected.semanticIndex||
    git(['rev-parse','HEAD']).trim()!==expected.head)throw fail('audio-l1-index-content-changed');
  for(const pin of expected.dirty)await pinnedBytes(files,pin,'audio-l1-dirty-launcher-changed');
  /** @type {[string,string][]} */const dist=[];
  /** @param {string} folder */const walk=async folder=>{for(const entry of await files.readdir(folder,{withFileTypes:true})){
    const name=folder+'/'+entry.name;if(entry.isDirectory())await walk(name);else dist.push([name,sha(await files.readFile(name))]);
  }};await walk('dist');dist.sort((a,b)=>a[0].localeCompare(b[0]));if(dist.length!==58)throw fail('audio-l1-root-dist-count');
  for(const pin of expected.priorRun)await pinnedBytes(files,pin,'audio-l1-prior-run-changed');
  return {pins:25,historicalIndex,semanticIndex,dirty:expected.dirty.map(pin=>[pin.file,pin.sha256]),dist,
    priorRun:expected.priorRun.map(pin=>[pin.file,pin.sha256]),index:sha(await files.readFile('.git/index'))};
}
/** Working-tree attestation is explicit; the existing clean-commit attestor is unchanged. @param {L1Files} files @param {string[]} [required] */
export async function attestL1Source(files,required=[]){
  return attestAudioSource(files,[...newInputs,...required],'working');
}

const j1Inputs=[...audioInputs,
 'tests/f01-j1-transition.test.cjs','tests/f01-j1-observation.test.cjs','tests/f01-j1-native-contract.test.cjs',
 'tests/fixtures/f01-j1-runtime-js.json','tests/fixtures/f01-j1-runtime-executable.json',
 'scripts/check-runtime-inventory.mjs','tests/runtime-inventory.test.cjs','tests/af05-closure.test.cjs'];
/** 현재 소스와 실행 파일을 확인하고, 지정한 두 역사 자료만 별도로 검증한다. @param {L1Files} files @param {string[]} [required] @param {unknown} [preparation] */
export async function attestJ1Source(files,required=[],preparation){
  const pins=preparation===undefined?null:preparationPins(preparation);
  const current={...await attestL1Source(files,[...j1Inputs,...required]),nodeSha256:sha(await readFile(process.execPath))};
  if(!pins)return current;
  const manifest=await pinnedBytes(files,pins.manifest,'audio-j1-protected-manifest');
  const baseline=await pinnedBytes(files,pins.baseline,'audio-j1-preparation-source');
  return {...current,protectedManifestSha256:sha(manifest),preparationSourceSha256:sha(baseline)};
}
/** 실제 L1 결과를 J1의 외부 manifest와 baseline 양쪽에 대조한다. @param {L1Files} files @param {unknown} [reference] */
export async function j1Preservation(files,reference){
  const row=record(reference),pins=preparationPins(row.preparation),folders=referenceRows(row.folders,5).map(evidencePath);
  distinctPaths(folders,5);
  const lower=folders.map(folder=>folder.toLowerCase());
  if(lower.some(folder=>lower.some(other=>folder.startsWith(other+'/'))))throw fail('audio-j1-protected-folder');
  const l1=l1Reference(row.l1);
  const bytes=await pinnedBytes(files,pins.manifest,'audio-j1-protected-manifest'),manifest=record(JSON.parse(bytes.toString()));
  const baseline=record(JSON.parse((await pinnedBytes(files,pins.baseline,'audio-j1-preparation-source')).toString()));
  if(manifest.schema!=='f01-j1-protected-inputs-v1'||sha(bytes)!==baseline.protectedSha256)throw fail('audio-j1-protected-manifest');
  const entries=new Map();
  for(const raw of list(manifest.rows)){
    const entry=list(raw),name=evidencePath(entry[0]);
    if(entry.length!==3||!folders.some(folder=>name.startsWith(folder+'/'))||entries.has(name))
      throw fail('audio-j1-protected-row');
    entries.set(name,{bytes:integer(entry[1]),sha256:evidenceHash(entry[2])});
  }
  distinctPaths([...entries.keys()],entries.size);
  const seen=new Set();
  /** @param {string} folder */const walk=async folder=>{for(const entry of await files.readdir(folder,{withFileTypes:true})){
    const name=folder+'/'+entry.name;if(entry.isDirectory())await walk(name);else{
      const expected=entries.get(name);
      if(!expected||seen.has(name)||!entry.isFile())throw fail('audio-j1-protected-data');
      const data=await files.readFile(name);
      if(data.length!==expected.bytes||sha(data)!==expected.sha256)throw fail('audio-j1-protected-data');
      seen.add(name);
    }
  }};
  for(const folder of folders)await walk(folder);
  if(seen.size!==entries.size)throw fail('audio-j1-protected-files');
  const protection=await checkL1Preservation(files,l1);
  if(protection.index!==baseline.index||!isDeepStrictEqual(protection,manifest.protection))throw fail('audio-j1-protection-changed');
  return {...protection,protectedManifestSha256:sha(bytes),protectedFileCount:entries.size};
}

/** @param {{context:import('playwright').BrowserContext,worker:import('playwright').Worker,extensionId:string,artifactPath:string}} scenario @param {L1Files} files */
export async function runL1Scenario({context,worker,extensionId,artifactPath},files){
  return runMinimumScenario({context,worker,extensionId,artifactPath},files,false);
}
/** @param {Parameters<typeof runL1Scenario>[0]} input @param {L1Files} files */
export async function runJ1Scenario(input,files){return runMinimumScenario(input,files,true);}
/** @param {Parameters<typeof runL1Scenario>[0]} input @param {L1Files} files @param {boolean} joint */
async function runMinimumScenario({context,worker,extensionId,artifactPath},files,joint){
  let deadline=Date.now()+150000;
  /** @template T @param {string} name @param {()=>Promise<T>} work */const op=(name,work)=>{
    const left=deadline-Date.now();if(left<=0)throw fail('audio-l1-phase-timeout');return audioOperation(name,work,Math.min(30000,left));
  };
  const relative=path.relative(files.root,artifactPath).split(path.sep).join('/');
  /** @param {string} name @param {string|Uint8Array} data */const write=async(name,data)=>{
    try{return await files.writeFile(relative+'/'+name,data,{flag:'wx'});}catch(error){if(joint&&error instanceof Error)Object.assign(error,{artifactName:name});throw error;}
  };
  /** @param {string} name @param {unknown} value */const save=(name,value)=>write(name,JSON.stringify(value,null,2)+'\n');
  /** @type {string[]} */const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  /** @type {import('playwright').Page|undefined} */let observedPage;
  let raw=null,assessment=null;
  try{
    const html=String(await files.readFile('tests/fixtures/installed-extension/audio-live.html','utf8')).replace(/<script[^>]+src="https:\/\/chzzk.naver.com\/__knife_fixture__\/audio-site.js"[^>]*><\/script>/,'');
    await op('l1-fixture-route',()=>context.route(/^https?:\/\//,route=>route.request().url()===fixtureURL?route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}):route.abort('blockedbyclient')));
    await op('l1-seed',()=>worker.evaluate(()=>Reflect.get(globalThis,'chrome').storage.local.set({config:{audioDefault:false,audioGain:1.32,gainInherited:false,compressorEnabled:false,eqEnabled:true,
      eq63:0,eq125:0,eq250:0,eq500:-6,eq1000:-6,eq2000:-6,eq4000:-6,eq8000:-6,normalizerEnabled:false}})));
    await op('l1-cold-hook',()=>context.addInitScript(()=>{
      let count=0;const Native=window.AudioContext;
      window.AudioContext=class extends Native{
        /** @param {AudioContextOptions} [options] */
        constructor(options){super(options);count++;}
      };
      Object.defineProperty(window,'__knifeL1ColdContexts',{get:()=>count});
    }));
    const page=await op('l1-open-page',()=>context.newPage());observedPage=page;page.setDefaultTimeout(15000);
    page.on('pageerror',error=>errors.push(error.message));await op('l1-fixture-goto',()=>page.goto(fixtureURL,{waitUntil:'domcontentloaded'}));await op('l1-front',()=>page.bringToFront());
    await op('l1-owner-ready',()=>page.waitForFunction(()=>{
      const r=Object.getOwnPropertyDescriptor(window,Symbol.for('cheese-knife.runtime.v1'))?.value;
      return r?.ownerProtocol===3&&r.configReady&&r.mediaCurrent()&&r.audio&&document.querySelector('.knife-comp button');
    }));
    const cold=await op('l1-cold-readback',()=>page.evaluate(()=>({contexts:Reflect.get(window,'__knifeL1ColdContexts'),readback:Object.getOwnPropertyDescriptor(window,Symbol.for('cheese-knife.runtime.v1'))?.value.audio.getReadback(document.querySelector('video'))})));
    await save('cold.json',cold);if(cold.contexts!==0||cold.readback.sources!==0||cold.readback.wanted!==false)throw fail('audio-l1-cold-capture');
    await op('l1-install-observer',()=>page.evaluate(installProcessingProbe,/** @type {{sampleRate:48000,installed:true}} */({sampleRate:48000,installed:true})));
    await op('l1-prepare-signal',()=>probe(page,{kind:'signal',frequency:250,inputDbfs:20*Math.log10(.1/Math.SQRT2),pattern:'stereo',phase:.37}));
    await op('l1-binding-ready',()=>page.waitForFunction(()=>{const r=Object.getOwnPropertyDescriptor(window,Symbol.for('cheese-knife.runtime.v1'))?.value;return r?.mediaCurrent()&&(document.querySelector('video')?.readyState??0)>=2;}));
    if(Date.now()>deadline)throw fail('audio-l1-preparation-timeout');
    deadline=Date.now()+60000;
    const button=page.locator('.knife-comp button');await op('l1-first-on',()=>button.click());await op('l1-ready',()=>waitL1On(page));
    const anchor=await op('l1-play',()=>page.evaluate(async()=>{
      const v=document.querySelector('video'),p=Object.getOwnPropertyDescriptor(window,Symbol.for('cheese-knife.f01-processing-probe'))?.value;
      if(!v)throw Error('fixture-video');const before=await p.action({kind:'facts'});v.muted=false;v.volume=1;await v.play();const after=await p.action({kind:'facts'});
      return {unmuteAudioTime:before.audioTime,unmuteMediaTime:before.video.currentTime,playAudioTime:after.audioTime,playMediaTime:after.video.currentTime};
    }));
    await save('playback.json',{...record(anchor),initialOn:'paused-input-observed-not-audible-on-quality'});
    const anchorTime=finite(record(anchor).playAudioTime);
    const start=record(await op('l1-start-facts',()=>probe(page,{kind:'facts'})));
    if(start.sources!==1||start.contextState!=='running')throw fail('audio-l1-first-on');
    for(const [index,offset]of [73440,92160].entries()){
      const ready=await op('l1-fixed-time',()=>waitL1Frame(page,integer(Math.round(anchorTime*48000)+offset)));
      await save(`clock-${index}.json`,ready);await op('l1-native-toggle',()=>button.click());
    }
    await op('l1-final-tail',()=>page.waitForTimeout(500));raw=await op('l1-full-capture',()=>probe(page,{kind:'l1-capture'}));await save('capture.json',raw);
    await save('request-timing.json',l1RequestTiming(raw,anchorTime));
    const captured=decodeL1Capture(raw);
    for(const [index,stream]of list(record(raw).streams).entries())await write(`stream-${index}.f32le`,Buffer.from(String(record(stream).base64),'base64'));
    const url=`chrome-extension://${extensionId}/web/audio-transition-worklet.js`;
    if(!list(captured.row.moduleLoads).includes(url))throw fail('audio-l1-module-not-loaded');
    const packageBytes=await files.readFile("extension/web/audio-transition-worklet.js");
    const actual=await op('l1-package-bytes',()=>worker.evaluate(async url=>{const r=await fetch(url);if(!r.ok)throw Error('module-fetch');return Array.from(new Uint8Array(await r.arrayBuffer()));},url));
    const fetched=Uint8Array.from(actual),module={url,sha256:sha(packageBytes),fetchedSha256:sha(fetched),actualPackageMatch:sha(fetched)===sha(packageBytes)};
    if(joint){await write('module-resource.fetched.js',fetched);await save('module.json',module);}
    if(!module.actualPackageMatch)throw fail('audio-l1-module-bytes');
    assessment=joint?assessJ1NativeCapture(raw):assessL1Capture(raw);await save('assessment.json',assessment);
    if(Date.now()>deadline)throw fail('audio-l1-case-timeout');
    if(errors.length||!assessment.passed)throw fail(errors.length?'audio-l1-page-error':'audio-l1-quality-failed-stop');
    return joint?{audioJ1:assessment,pageErrors:errors,module}:{audioL1:assessment,pageErrors:errors,module:{url,sha256:sha(packageBytes),actualPackageMatch:true}};
  }catch(error){
    let partial=null,exportError=null;
    if(observedPage){const observed=observedPage;try{partial=await audioOperation('l1-failed-prefix',()=>probe(observed,{kind:'l1-partial'}),2000);}catch(cause){exportError=String(cause);}}
    try{await save('partial.json',{error:String(error),rawCaptured:raw!==null,assessment,pageErrors:errors,partial,exportError});}
    catch(cause){if(!joint)throw cause;Object.assign(error instanceof Error?error:record(error),{evidenceError:String(cause),evidenceArtifactName:'partial.json'});}
    throw error;
  }
}

/** @param {L1Files} files @param {unknown} raw */
export async function l1CandidateDigest(files,raw){
  return minimumCandidateDigest(files,raw,parentId);
}
/** @param {L1Files} files @param {unknown} raw */
export async function j1CandidateDigest(files,raw){return minimumCandidateDigest(files,raw,j1ParentId);}
/** @param {L1Files} files @param {unknown} raw @param {string} parent */
async function minimumCandidateDigest(files,raw,parent){
  const candidate=record(raw),relative=`output/tool-audit/p02-candidate-${parent}/chrome-candidate`;
  const expected=await files.resolve(relative,{type:'directory'});
  if(candidate.root!==expected||candidate.dist!==path.join(expected,'dist'))throw fail('audio-l1-candidate-path');
  const names=list(candidate.files);
  if(names.length===0||new Set(names).size!==names.length||names.some(name=>typeof name!=='string'||!name.startsWith('dist/')))throw fail('audio-l1-candidate-list');
  if(parent===j1ParentId){
    /** @type {string[]} */const actual=[];
    /** @param {string} folder */const walk=async folder=>{for(const entry of await files.readdir(relative+'/'+folder,{withFileTypes:true})){
      const name=folder+'/'+entry.name;
      if(entry.isDirectory())await walk(name);else if(entry.isFile())actual.push(name);else throw fail('audio-j1-candidate-type');
    }};
    await walk('dist');if(!isDeepStrictEqual(actual.sort(),[...names].sort()))throw fail('audio-j1-candidate-files');
  }
  const rows=[];for(const name of names){if(typeof name!=='string')throw fail('audio-l1-candidate-list');rows.push([name,sha(await files.readFile(relative+'/'+name))]);}
  return sha(JSON.stringify(rows));
}

/** Only the immutable parent/child pair can share one attested build. @param {unknown} candidate @param {string} root @param {()=>Promise<void>} verify */
export function l1CandidateProvider(candidate,root,verify){
  return minimumCandidateProvider(candidate,root,verify,childId);
}
/** @param {unknown} candidate @param {string} root @param {()=>Promise<void>} verify */
export function j1CandidateProvider(candidate,root,verify){return minimumCandidateProvider(candidate,root,verify,j1ChildId);}
/** @param {unknown} candidate @param {string} root @param {()=>Promise<void>} verify @param {string} child */
function minimumCandidateProvider(candidate,root,verify,child){let calls=0;
  /** @param {string} id @param {string} directory @param {{retainEvidence:boolean}} options */return async(id,directory,options)=>{
  if(++calls!==1||id!==child||directory!==root||options?.retainEvidence!==true)throw fail('audio-l1-candidate-owner');await verify();return candidate;
};}

/** One installed scenario only; no broader scheduler or retry. */
export async function runL1Qualification(){throw fail('audio-qualification-sealed');}
/** Sealed historical entry: reusable scenarios above do not inherit its old grant. */
export async function runJ1Qualification(){throw fail('audio-qualification-sealed');}
