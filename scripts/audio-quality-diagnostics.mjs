// 음질 러너가 prepareQualityRun(files,label,trace)로 생성한 수집기에 합성 PCM과 진단을 보관한다.
// assessQualityRunSet({expectedLabels,records})는 저장된 6회의 수치와 진단을 다시 검사해 실패 목록을 돌려준다.
import {isDeepStrictEqual} from 'node:util';
import {spawn,execFileSync} from 'node:child_process';
import {readRoleInputs,validateRoleEvidence} from './audio-worklet-roles.mjs';
import {AUDIO_ARTIFACT_FILES} from './audio-artifact-core.mjs';
import {audioQualityFailures} from './audio-metrics.mjs';
import {summarizeCapture} from './audio-signal.mjs';
import {assessSignedTransitions} from './audio-signed-transition.mjs';
import {assessWorkletSigned} from './audio-worklet-signed.mjs';

/** 합성 페이지의 AudioContext에서 제품 모듈의 고정 주소만 같은 대상의 원바이트로 읽는다. @param {number[]} bytes */
export function registerQualityWorklet(bytes){
  const url='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/web/audio-transition-worklet.js';
  const target=/** @type {Window & {__quality?:{context:AudioContext}}} */(window);
  const context=target.__quality?.context;
  if(!context)throw new Error('audio-quality-context-missing');
  const worklet=context.audioWorklet,native=worklet.addModule;
  worklet.addModule=function(...args){
    if(this!==worklet||args[0]!==url)return Reflect.apply(native,this,args);
    const blobUrl=URL.createObjectURL(new Blob([Uint8Array.from(bytes)],{type:'text/javascript'}));
    args[0]=blobUrl;
    const revoke=()=>URL.revokeObjectURL(blobUrl);
    const proof=Reflect.get(target,Symbol.for('cheese-knife.quality-worklet-signed'));
    if(proof)proof.registration.attempts++;
    try{
      const loading=Reflect.apply(native,this,args);
      void loading.then(()=>{revoke();if(proof)void proof.registered(bytes);},revoke);
      return loading;
    }catch(error){revoke();throw error;}
  };
  return Reflect.get(target,Symbol.for('cheese-knife.runtime.v1')).audio.prepareTransitionModule(url);
}

/** Self-contained; installs only on the synthetic page's owned context. */
export function installQualityTrace() {
  const target=/** @type {Window & {__quality?:{context:AudioContext}}} */(window);
  const key=Symbol.for('cheese-knife.quality-trace'),context=target.__quality?.context;
  if(!context)throw new Error('audio-quality-context-missing');
  if (Reflect.get(target,key)) throw new Error('audio-quality-trace-already-installed');
  const slots=new Float64Array(4096*4),methods=['cancelScheduledValues','setValueAtTime','linearRampToValueAtTime'];
  /** @type {GainNode[]} */const gains=[];
  let count=0,nodeCount=0,truncated=false,error='';
  const create=context.createGain;
  context.createGain=function(){
    const node=Reflect.apply(create,this,arguments);
    try {
      const index=nodeCount++;gains.push(node);
      if(index>=8){error='unexpected-gain-graph';return node;}
      for(const [kind,method]of methods.entries()){
        const native=Reflect.get(node.gain,method);
        if(typeof native!=='function')throw new Error('missing-native-method');
        /** @this {AudioParam} @param {number} value @param {number} [time] */
        const wrap=function(value,time){
          const result=Reflect.apply(native,this,arguments);
          try {
            if(count===4096)truncated=true;
            else {
              const offset=count++*4;slots.fill(index,offset,offset+1);slots[offset+1]=kind;
              slots[offset+2]=kind===0?0:value;slots[offset+3]=kind===0?value:/** @type {number} */(time);
            }
          }catch{error='trace-record-failed';}
          return result;
        };
        if(!Reflect.set(node.gain,method,wrap))throw new Error('trace-install-failed');
      }
    }catch{error='trace-install-or-record-failed';}
    return node;
  };
  Reflect.set(target,key,{snapshot(){
    const events=[];
    for(let i=0;i<count;i++)events.push({node:slots[i*4],method:methods.at(/** @type {number} */(slots[i*4+1])),
      value:slots[i*4+1]===0?null:slots[i*4+2],time:slots[i*4+3]});
    return {complete:!error&&!truncated&&nodeCount===8,truncated,error:error||null,nodeCount,
      gains:gains.map(node=>node.gain.value),events};
  }});
}

/** @param {string|undefined} value */
export function qualityTraceMode(value) {
  if(value!==undefined&&value!=='1')throw new Error('audio-quality-trace-invalid');
  return value==='1';
}

/** @typedef {{frequency:number,value:boolean,frame:number}} MasterTransition */
/** @typedef {'before'|'change'|'after'} CapturePhase */
/** @typedef {{capture:import('./audio-signal.mjs').CaptureWindow,transition:MasterTransition,phase:CapturePhase}} CaptureRow */
/** @typedef {{artifact:import('./audio-artifact-core.mjs').AudioArtifactDescription,workletSha256?:string|null,sourceCommit:string,pullRequestHead:string|null,platform:string,nodeVersion:string,browserVersion:string,sampleRate:number,audioConfig:Record<string,number|boolean>,wanted:boolean,state:string,trace:unknown,error:unknown,shutdown:unknown,actions:unknown,secondaryErrors?:string[]}} QualityEvidence */
/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('diagnostic-object');return /** @type {Record<string,unknown>} */(value);}
/** @param {unknown} value @param {string} code @returns {asserts value} */
function need(value,code){if(!value)throw new Error(code);}
/** @param {unknown} value */
const counter=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
/** @param {unknown} value */
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const gainRoles=Object.freeze(['dry','wet','masterGain','headroom','compDry','compWet','compMix','normalizer']);

/** @param {Record<string,unknown>} data */
function workletHash(data){
  if(!Object.hasOwn(data,'workletSha256'))return null;
  const hash=data.workletSha256;
  need(typeof hash==='string'&&hash.length===64&&!/[^a-f0-9]/.test(hash),'diagnostic-worklet-hash');
  return hash;
}

/** @param {string} label */
export function qualityOutputPaths(label){
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(label))throw new Error('audio-label-invalid');
  const stem=label==='source'?'output/audio-quality/report':`output/audio-quality/report-${label}`;
  return {report:stem+'.json',diagnostic:stem+'-diagnostic.json'};
}

/** @param {{lstat:(relative:string,options:{optional:boolean})=>Promise<unknown>}} files @param {string} label @param {string|undefined} traceValue */
export async function prepareQualityRun(files,label,traceValue){
  const trace=qualityTraceMode(traceValue),paths=qualityOutputPaths(label);
  for(const relative of Object.values(paths))if(await files.lstat(relative,{optional:true}))throw new Error('audio-quality-output-exists');
  return {trace,paths,collector:createQualityDiagnostics({label,trace})};
}

/** @param {unknown} value @returns {CaptureRow} */
function captureRow(value){
  const row=record(value),transition=record(row.transition),capture=record(row.capture);
  need([250,750,1000].includes(/** @type {number} */(transition.frequency))&&typeof transition.value==='boolean'&&counter(transition.frame),'capture-transition');
  need(row.phase==='before'||row.phase==='change'||row.phase==='after','capture-phase');
  need(counter(capture.rate)&&/** @type {number} */(capture.rate)>=1000&&/** @type {number} */(capture.rate)<=384000,'capture-rate');
  const rate=/** @type {number} */(capture.rate),frame=/** @type {number} */(transition.frame);
  const offsets=row.phase==='before'?[-0.08,-0.04]:row.phase==='change'?[-0.02,0.04]:[0.1,0.14];
  need(capture.start===frame+Math.round(rate* /** @type {number} */(offsets[0]))&&capture.end===frame+Math.round(rate* /** @type {number} */(offsets[1])),'capture-window');
  need(counter(capture.start)&&counter(capture.end)&&/** @type {number} */(capture.end)>/** @type {number} */(capture.start),'capture-frame');
  need(Array.isArray(capture.channels)&&capture.channels.length===2,'capture-channels');
  for(const channel of /** @type {unknown[]} */(capture.channels)){
    need(Array.isArray(channel)&&channel.length===/** @type {number} */(capture.end)-/** @type {number} */(capture.start),'capture-length');
    for(const sample of /** @type {unknown[]} */(channel))need(finite(sample),'capture-nonfinite');
  }
  return /** @type {CaptureRow} */(value);
}

/** @param {unknown} value @param {boolean} enabled */
function validateTrace(value,enabled){
  const trace=record(value);
  need(trace.complete===true&&trace.truncated===false&&trace.error===null&&trace.nodeCount===8,'trace-incomplete');
  need(Array.isArray(trace.gains)&&trace.gains.length===8&&trace.gains.every(finite),'trace-gains');
  need(Array.isArray(trace.events)&&trace.events.length<=4096&&(enabled?trace.events.length>0:trace.events.length===0),'trace-events');
  for(const value of /** @type {unknown[]} */(trace.events)){
    const event=record(value);need(counter(event.node)&&/** @type {number} */(event.node)<8&&finite(event.time)&&/** @type {number} */(event.time)>=0,'trace-event');
    need(['cancelScheduledValues','setValueAtTime','linearRampToValueAtTime'].includes(/** @type {string} */(event.method)),'trace-method');
    need(event.method==='cancelScheduledValues'?event.value===null:finite(event.value),'trace-value');
  }
}

/** 생산자와 저장 JSON의 종료·정리 증거를 확인한다. @param {unknown} value @param {boolean} [workletRoles] */
function validateEvidence(value,workletRoles=false){
  return validateStoredEvidence(value,workletRoles,workletRoles);
}

/** @param {unknown} value @param {boolean} worklet @param {boolean} [roles] */
function validateStoredEvidence(value,worklet,roles=false){
  const d=record(value);qualityOutputPaths(/** @type {string} */(d.label));
  need(typeof d.traceEnabled==='boolean','diagnostic-mode');
  need(typeof d.sourceCommit==='string'&&/^[a-f0-9]{40}$/.test(d.sourceCommit)&&
    (d.pullRequestHead===null||typeof d.pullRequestHead==='string'&&/^[a-f0-9]{40}$/.test(d.pullRequestHead)),'diagnostic-source');
  for(const key of ['platform','nodeVersion','browserVersion']){const value=Reflect.get(d,key);need(typeof value==='string'&&value.length>0&&value.length<=128,'diagnostic-environment');}
  if(worklet){
    need((roles||workletHash(d)!==null)&&isDeepStrictEqual(d.gainRoles,[])&&(roles||d.complete===false&&
      isDeepStrictEqual(d.validationErrors,['diagnostic-gain-roles'])),'diagnostic-gain-roles');
  }else need(workletHash(d)===null&&isDeepStrictEqual(d.gainRoles,gainRoles),'diagnostic-gain-roles');
  need(counter(d.sampleRate)&&typeof d.wanted==='boolean'&&['on','off','pending','unavailable'].includes(/** @type {string} */(d.state)),'diagnostic-state');
  const config=record(d.audioConfig);need(Object.keys(config).length>0&&Object.keys(config).length<=64&&Object.values(config).every(value=>typeof value==='boolean'||finite(value)),'diagnostic-config');
  const artifact=record(d.artifact);need(artifact.label===d.label&&typeof artifact.root==='string'&&Array.isArray(artifact.files)&&artifact.files.length===6,'diagnostic-artifact');
  for(const [index,value]of /** @type {unknown[]} */(artifact.files).entries()){
    const file=record(value);need(file.path===AUDIO_ARTIFACT_FILES.at(index)&&typeof file.sha256==='string'&&/^[a-f0-9]{64}$/.test(file.sha256),'diagnostic-artifact-hash');
  }
  // 이 그래프는 제어 출력을 AudioParam에 연결한다. T에서도 원래 예약 이벤트가 비어 있다.
  validateTrace(d.trace,worklet?false:d.traceEnabled);
  need(Array.isArray(d.captures)&&d.captures.length===18,'capture-count');
  need(Array.isArray(d.actions)&&d.actions.length===6,'action-count');
  let previousFrame=-1,groupFrame=-1;
  for(const [index,value]of /** @type {unknown[]} */(d.captures).entries()){
    const row=captureRow(value),group=Math.floor(index/3);
    need(row.transition.frequency===[250,750,1000].at(Math.floor(group/2))&&row.transition.value===(group%2===1)&&row.phase===['before','change','after'].at(index%3),'capture-order');
    need(row.capture.rate===d.sampleRate,'capture-environment');
    if(index%3===0){
      need(row.transition.frame>previousFrame,'capture-clock');previousFrame=groupFrame=row.transition.frame;
      const action=record(/** @type {unknown[]} */(d.actions).at(group));
      need(action.frame===groupFrame&&counter(action.afterFrame)&&/** @type {number} */(action.afterFrame)>=groupFrame,'action-clock');
    }
    else need(row.transition.frame===groupFrame,'capture-group-clock');
  }
  const shutdown=record(d.shutdown);need(['playwright','windows-native'].includes(/** @type {string} */(shutdown.kind))&&
    shutdown.browserCloseAcknowledged===true&&shutdown.browserDisconnected===true,'diagnostic-shutdown');
  if(shutdown.kind==='windows-native')need(shutdown.ownedRootClosed===true,'diagnostic-owned-root');
  need(Array.isArray(d.secondaryErrors)&&d.secondaryErrors.length===0,'diagnostic-secondary-error');
}

export {validateEvidence as validateQualityEvidence};

/** @param {{label:string,trace:boolean}} options */
export function createQualityDiagnostics({label,trace}){
  qualityOutputPaths(label);if(typeof trace!=='boolean')throw new Error('audio-quality-trace-invalid');
  /** @type {CaptureRow[]} */const captures=[];let overflow=false;
  return {
    /** @template {import('./audio-signal.mjs').CaptureWindow} T @param {T} capture @param {MasterTransition} transition @param {CapturePhase} phase @returns {T} */
    retainCapture(capture,transition,phase){
      if(captures.length===18)overflow=true;else captures.push({capture,transition:{...transition},phase});
      return capture;
    },
    /** @param {QualityEvidence} input */
    buildReport(input){
      const diagnostic={...input,label,traceEnabled:trace,gainRoles:Object.hasOwn(input,'workletSha256')?[]:gainRoles,captures:captures.slice(),secondaryErrors:input.secondaryErrors??[],
        error:input.error===null?null:input.error instanceof Error?input.error.message.slice(0,2048):'audio-quality-failed',
        complete:false,truncated:overflow,validationErrors:/** @type {string[]} */([])};
      try{
        need(!overflow,'capture-overflow');
        if(Reflect.get(input,'roleProfile')===true){
          validateStoredEvidence(diagnostic,true,true);validateRoleEvidence(diagnostic);
        }else validateEvidence(diagnostic);
        diagnostic.complete=true;
      }
      catch(error){diagnostic.validationErrors.push(error instanceof Error?error.message:'diagnostic-validation');}
      return diagnostic;
    },
  };
}

/** @param {{writeFile:(relative:string,data:string,options:{flag:string})=>Promise<unknown>}} files @param {string} relative @param {unknown} diagnostic */
export async function writeQualityDiagnostic(files,relative,diagnostic){
  const label=relative==='output/audio-quality/report-diagnostic.json'?'source':relative.slice('output/audio-quality/report-'.length,-'-diagnostic.json'.length);
  need(qualityOutputPaths(label).diagnostic===relative,'audio-quality-diagnostic-path');
  const json=JSON.stringify(diagnostic);need(Buffer.byteLength(json)<=8*1024*1024,'audio-quality-diagnostic-size');
  await files.writeFile(relative,json,{flag:'wx'});
}

/** @typedef {{sourceCommit:string,files:unknown,workletSha256:string}} RoleIdentity */
/** @param {{expectedLabels:readonly string[],records:readonly {label:string,exitCode:number|null,report:unknown,diagnostic:unknown}[],requireWorkletSigned?:boolean,requireWorkletRoles?:boolean,expectedIdentity?:RoleIdentity|null}} input */
export function assessQualityRunSet({expectedLabels,records,requireWorkletSigned=false,requireWorkletRoles=false,expectedIdentity=null}){
  const signedProfile=requireWorkletSigned||requireWorkletRoles;
  const firstSources=new Set(),mainSources=new Set(),calibrationSources=new Set();
  /** @type {string[]} */const failures=[];
  /** @type {{label:string,status:string,failures:string[]}[]} */const legacy=[];
  /** @type {({label:string} & ReturnType<typeof assessSignedTransitions>)[]} */const supplementary=[];
  let transportComplete=true;
  const suffixes=['u1','t1','u2','t2','u3','t3'];
  if(expectedLabels.length!==6||new Set(expectedLabels).size!==6||!expectedLabels.every((label,index)=>label.endsWith('-'+suffixes.at(index))))return {complete:false,transportComplete:false,qualityPass:false,failures:['quality-run-labels'],legacy,supplementary};
  if(records.length!==6)failures.push('quality-run-count');
  /** @type {unknown} */let identity;
  /** @type {string|null|undefined} */let firstWorkletHash;
  for(const [index,label]of expectedLabels.entries()){
    try{
      const item=records.at(index);need(item?.label===label,'quality-run-exit-or-order');
      /** @type {string[]|null} */let roleQuality=null;
      if(requireWorkletRoles){
        // 전송·정리 실패에도 각 계산이 보유한 입력의 결과는 별도로 남긴다.
        let evidenceFailure;
        try{
          const report=record(item.report);
          roleQuality=audioQualityFailures(report);
          legacy.push({label,status:roleQuality.length?'failed':'passed',failures:roleQuality});
          failures.push(...roleQuality.map(value=>label+'/'+value));
        }catch(error){evidenceFailure=error;}
        try{
          const signed=assessWorkletSigned(record(item.diagnostic),record(item.report).transitions);
          supplementary.push({label,...signed});failures.push(...signed.failures.map(value=>label+'/'+value));
        }catch(error){evidenceFailure??=error;}
        if(evidenceFailure)throw evidenceFailure;
      }
      need(item.exitCode===0||item.exitCode===1,'quality-run-exit-or-order');
      const d=record(item.diagnostic),report=record(item.report);
      const nodes=record(report.nodes);
      if(!requireWorkletRoles){
        const hash=workletHash(d);need(hash===workletHash(nodes),'quality-run-worklet-hash');
        if(firstWorkletHash===undefined)firstWorkletHash=hash;else need(hash===firstWorkletHash,'quality-run-worklet-drift');
      }
      need((requireWorkletRoles||d.complete===!requireWorkletSigned)&&d.truncated===false&&d.label===label&&d.traceEnabled===(index%2===1),'quality-run-evidence');
      validateStoredEvidence(d,signedProfile,requireWorkletRoles);
      need(isDeepStrictEqual(d.artifact,report.artifact)&&d.browserVersion===report.browser,'quality-run-artifact');
      need(nodes.sampleRate===d.sampleRate&&nodes.sources===1,'quality-run-calibration');
      need(Array.isArray(report.cases)&&report.cases.length===14&&Array.isArray(report.transitions)&&report.transitions.length===18&&Array.isArray(report.alignments)&&report.alignments.length===12,'quality-run-shape');
      const quality=roleQuality??audioQualityFailures(report);need(isDeepStrictEqual(report.qualityFailures,quality)&&(requireWorkletRoles||item.exitCode===(requireWorkletSigned||quality.length?1:0)),'quality-run-numerical-gate');
      if(signedProfile)need(d.error===(quality.length?('Audio quality failed: '+quality.join(', ')).slice(0,2048):null),'quality-run-error');
      const transitions=/** @type {unknown[]} */(report.transitions).map(record).filter(row=>row.kind==='enabled');need(transitions.length===6,'quality-run-master-count');
      for(const [captureIndex,value]of /** @type {unknown[]} */(d.captures).entries()){
        const row=captureRow(value),transition=transitions.at(Math.floor(captureIndex/3));
        need(transition?.frequency===row.transition.frequency&&transition.value===row.transition.value&&isDeepStrictEqual(Reflect.get(transition,row.phase),summarizeCapture(row.capture)),'quality-run-pcm-summary');
      }
      const artifact=record(d.artifact),current={sourceCommit:d.sourceCommit,pullRequestHead:d.pullRequestHead,platform:d.platform,nodeVersion:d.nodeVersion,
        browserVersion:d.browserVersion,sampleRate:d.sampleRate,audioConfig:d.audioConfig,wanted:d.wanted,state:d.state,files:artifact.files,root:artifact.root};
      if(!requireWorkletRoles){
        if(index===0)identity=current;
        need(isDeepStrictEqual(identity,current),'quality-run-environment-drift');
        legacy.push({label,status:quality.length?'failed':'passed',failures:quality});
        if(requireWorkletSigned){transportComplete=false;failures.push(label+'/diagnostic-gain-roles');}
        const signed=requireWorkletSigned?assessWorkletSigned(d,report.transitions):assessSignedTransitions({diagnostic:d,transitions:report.transitions});
        supplementary.push({label,...signed});
        failures.push(...quality.map(value=>label+'/'+value),...signed.failures.map(value=>label+'/'+value));
      }else{
        const pair=validateRoleEvidence(d);
        need(expectedIdentity&&d.sourceCommit===expectedIdentity.sourceCommit&&workletHash(d)===expectedIdentity.workletSha256&&
          workletHash(nodes)===d.workletSha256&&isDeepStrictEqual(artifact.files,expectedIdentity.files)&&
          (identity===undefined||isDeepStrictEqual(identity,current)),'quality-run-product-identity');
        need(d.complete===true&&isDeepStrictEqual(d.validationErrors,[])&&item.exitCode===(quality.length?1:0),'quality-run-role-completeness');
        if(pair){
          const events=record(d.workletSigned).events;
          need(Array.isArray(events),'quality-run-role-source');
          for(const value of events){
            const event=record(value);
            if(typeof event.source==='string'&&event.source.startsWith('blob:')){
              need(!calibrationSources.has(event.source),'quality-run-role-source');
              mainSources.add(event.source);
            }
          }
          need(!firstSources.has(pair.main)&&!mainSources.has(pair.calibration)&&!calibrationSources.has(pair.calibration),'quality-run-role-source');
          firstSources.add(pair.main);calibrationSources.add(pair.calibration);
        }
        identity??=current;
      }
    }catch(error){transportComplete=false;failures.push(label+'/'+(error instanceof Error?error.message:'quality-run-invalid'));}
  }
  if(records.length!==6)transportComplete=false;
  return {complete:transportComplete&&failures.length===0,transportComplete,qualityPass:transportComplete&&failures.length===0,failures,legacy,supplementary};
}

/** @typedef {{label:string,env:NodeJS.ProcessEnv}} QualityInvocation */
/** @param {QualityInvocation} invocation @param {string} root @returns {Promise<number|null>} */
function executeQuality({label,env},root){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/check-audio-quality.mjs','--ci-worklet-signed','--label',label],{cwd:root,env,stdio:'inherit'});
    child.once('error',reject);child.once('close',code=>resolve(code));
  });
}

/** 실제 CI 부모가 선택한 제품 바이트와 HEAD를 독립적으로 확인한다. 모의 실행에서만 예상값을 주입한다.
 * @param {{files:{root:string,readFile:{(relative:string,encoding:'utf8'):Promise<string>,(relative:string):Promise<Uint8Array>}},prefix:string,execute?:(invocation:QualityInvocation)=>Promise<number|null>,expectedIdentity?:RoleIdentity}} options */
export async function runQualityRunSet({files,prefix,execute,expectedIdentity}){
  let identity=expectedIdentity??null;
  const expectedLabels=['u1','t1','u2','t2','u3','t3'].map(suffix=>prefix+'-'+suffix);
  const paths=expectedLabels.flatMap(label=>Object.values(qualityOutputPaths(label)));
  if(!execute){
    const inputs=await readRoleInputs({readFile:path=>files.readFile('extension/'+path)});
    identity={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:files.root,encoding:'utf8'}).trim(),
      files:inputs.manifest,workletSha256:inputs.workletSha256};
  }
  const run=execute??(invocation=>executeQuality(invocation,files.root));
  /** @type {(number|null)[]} */const exits=[];
  for(const [index,label]of expectedLabels.entries()){
    const env={...process.env};delete env.KNIFE_AUDIO_QUALITY_TRACE;
    if(index%2===1)env.KNIFE_AUDIO_QUALITY_TRACE='1';
    try{exits.push(await run({label,env}));}catch{exits.push(null);}
  }
  const records=[];
  for(const [index,label]of expectedLabels.entries()){
    const names=qualityOutputPaths(label);
    /** @type {unknown} */let report=null,diagnostic=null;
    /** @param {string} path */
    const stored=async path=>{
      const data=await files.readFile(path,'utf8');need(Buffer.byteLength(data)<=8*1024*1024,'quality-run-size');
      return JSON.parse(data);
    };
    try{report=await stored(names.report);}catch{}
    try{diagnostic=await stored(names.diagnostic);}catch{}
    records.push({label,exitCode:exits.at(index)??null,report,diagnostic});
  }
  return {...assessQualityRunSet({expectedLabels,records,requireWorkletRoles:true,expectedIdentity:identity}),paths,records};
}
