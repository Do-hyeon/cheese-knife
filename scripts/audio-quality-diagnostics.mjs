import {isDeepStrictEqual} from 'node:util';
import {spawn} from 'node:child_process';
import {AUDIO_ARTIFACT_FILES} from './audio-artifact-core.mjs';
import {audioQualityFailures} from './audio-metrics.mjs';
import {summarizeCapture} from './audio-signal.mjs';

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
/** @typedef {{artifact:import('./audio-artifact-core.mjs').AudioArtifactDescription,sourceCommit:string,pullRequestHead:string|null,platform:string,nodeVersion:string,browserVersion:string,sampleRate:number,audioConfig:Record<string,number|boolean>,wanted:boolean,state:string,trace:unknown,error:unknown,shutdown:unknown,actions:unknown,secondaryErrors?:string[]}} QualityEvidence */
/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('diagnostic-object');return /** @type {Record<string,unknown>} */(value);}
/** @param {unknown} value @param {string} code @returns {asserts value} */
function need(value,code){if(!value)throw new Error(code);}
/** @param {unknown} value */
const counter=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
/** @param {unknown} value */
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const gainRoles=Object.freeze(['dry','wet','masterGain','headroom','compDry','compWet','compMix','normalizer']);

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

/** Revalidate producer evidence as well as consumer-loaded JSON. @param {unknown} value */
function validateEvidence(value){
  const d=record(value);qualityOutputPaths(/** @type {string} */(d.label));
  need(typeof d.traceEnabled==='boolean','diagnostic-mode');
  need(typeof d.sourceCommit==='string'&&/^[a-f0-9]{40}$/.test(d.sourceCommit)&&
    (d.pullRequestHead===null||typeof d.pullRequestHead==='string'&&/^[a-f0-9]{40}$/.test(d.pullRequestHead)),'diagnostic-source');
  for(const key of ['platform','nodeVersion','browserVersion']){const value=Reflect.get(d,key);need(typeof value==='string'&&value.length>0&&value.length<=128,'diagnostic-environment');}
  need(isDeepStrictEqual(d.gainRoles,gainRoles),'diagnostic-gain-roles');
  need(counter(d.sampleRate)&&typeof d.wanted==='boolean'&&['on','off','pending','unavailable'].includes(/** @type {string} */(d.state)),'diagnostic-state');
  const config=record(d.audioConfig);need(Object.keys(config).length>0&&Object.keys(config).length<=64&&Object.values(config).every(value=>typeof value==='boolean'||finite(value)),'diagnostic-config');
  const artifact=record(d.artifact);need(artifact.label===d.label&&typeof artifact.root==='string'&&Array.isArray(artifact.files)&&artifact.files.length===6,'diagnostic-artifact');
  for(const [index,value]of /** @type {unknown[]} */(artifact.files).entries()){
    const file=record(value);need(file.path===AUDIO_ARTIFACT_FILES.at(index)&&typeof file.sha256==='string'&&/^[a-f0-9]{64}$/.test(file.sha256),'diagnostic-artifact-hash');
  }
  validateTrace(d.trace,d.traceEnabled);
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
      const diagnostic={...input,label,traceEnabled:trace,gainRoles,captures:captures.slice(),secondaryErrors:input.secondaryErrors??[],
        error:input.error===null?null:input.error instanceof Error?input.error.message.slice(0,2048):'audio-quality-failed',
        complete:false,truncated:overflow,validationErrors:/** @type {string[]} */([])};
      try{need(!overflow,'capture-overflow');validateEvidence(diagnostic);diagnostic.complete=true;}
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

/** @param {{expectedLabels:readonly string[],records:readonly {label:string,exitCode:number|null,report:unknown,diagnostic:unknown}[]}} input */
export function assessQualityRunSet({expectedLabels,records}){
  /** @type {string[]} */const failures=[];
  const suffixes=['u1','t1','u2','t2','u3','t3'];
  if(expectedLabels.length!==6||new Set(expectedLabels).size!==6||!expectedLabels.every((label,index)=>label.endsWith('-'+suffixes.at(index))))return {complete:false,failures:['quality-run-labels']};
  if(records.length!==6)failures.push('quality-run-count');
  /** @type {unknown} */let identity;
  for(const [index,label]of expectedLabels.entries()){
    try{
      const item=records.at(index);need(item?.label===label&&item.exitCode===0,'quality-run-exit-or-order');
      const d=record(item.diagnostic),report=record(item.report);
      need(d.complete===true&&d.truncated===false&&d.label===label&&d.traceEnabled===(index%2===1),'quality-run-evidence');validateEvidence(d);
      need(isDeepStrictEqual(d.artifact,report.artifact)&&d.browserVersion===report.browser,'quality-run-artifact');
      const nodes=record(report.nodes);need(nodes.sampleRate===d.sampleRate&&nodes.sources===1,'quality-run-calibration');
      need(Array.isArray(report.cases)&&report.cases.length===14&&Array.isArray(report.transitions)&&report.transitions.length===18&&Array.isArray(report.alignments)&&report.alignments.length===12,'quality-run-shape');
      const quality=audioQualityFailures(report);need(quality.length===0&&isDeepStrictEqual(report.qualityFailures,quality),'quality-run-numerical-gate');
      const transitions=/** @type {unknown[]} */(report.transitions).map(record).filter(row=>row.kind==='enabled');need(transitions.length===6,'quality-run-master-count');
      for(const [captureIndex,value]of /** @type {unknown[]} */(d.captures).entries()){
        const row=captureRow(value),transition=transitions.at(Math.floor(captureIndex/3));
        need(transition?.frequency===row.transition.frequency&&transition.value===row.transition.value&&isDeepStrictEqual(Reflect.get(transition,row.phase),summarizeCapture(row.capture)),'quality-run-pcm-summary');
      }
      const artifact=record(d.artifact),current={sourceCommit:d.sourceCommit,pullRequestHead:d.pullRequestHead,platform:d.platform,nodeVersion:d.nodeVersion,
        browserVersion:d.browserVersion,sampleRate:d.sampleRate,audioConfig:d.audioConfig,wanted:d.wanted,state:d.state,files:artifact.files,root:artifact.root};
      if(index===0)identity=current;else need(isDeepStrictEqual(identity,current),'quality-run-environment-drift');
    }catch(error){failures.push(label+'/'+(error instanceof Error?error.message:'quality-run-invalid'));}
  }
  return {complete:failures.length===0,failures};
}

/** @typedef {{label:string,env:NodeJS.ProcessEnv}} QualityInvocation */
/** @param {QualityInvocation} invocation @param {string} root @returns {Promise<number|null>} */
function executeQuality({label,env},root){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/check-audio-quality.mjs','--label',label],{cwd:root,env,stdio:'inherit'});
    child.once('error',reject);child.once('close',code=>resolve(code));
  });
}

/** Fixed observation set, not retries. @param {{files:{root:string,readFile:(relative:string,encoding:'utf8')=>Promise<string>},prefix:string,execute?:(invocation:QualityInvocation)=>Promise<number|null>}} options */
export async function runQualityRunSet({files,prefix,execute=invocation=>executeQuality(invocation,files.root)}){
  const expectedLabels=['u1','t1','u2','t2','u3','t3'].map(suffix=>prefix+'-'+suffix);
  const paths=expectedLabels.flatMap(label=>Object.values(qualityOutputPaths(label)));
  /** @type {(number|null)[]} */const exits=[];
  for(const [index,label]of expectedLabels.entries()){
    const env={...process.env};delete env.KNIFE_AUDIO_QUALITY_TRACE;
    if(index%2===1)env.KNIFE_AUDIO_QUALITY_TRACE='1';
    try{exits.push(await execute({label,env}));}catch{exits.push(null);}
  }
  const records=[];
  for(const [index,label]of expectedLabels.entries()){
    const names=qualityOutputPaths(label);
    /** @type {unknown} */let report=null,diagnostic=null;
    try{report=JSON.parse(await files.readFile(names.report,'utf8'));}catch{}
    try{diagnostic=JSON.parse(await files.readFile(names.diagnostic,'utf8'));}catch{}
    records.push({label,exitCode:exits.at(index)??null,report,diagnostic});
  }
  return {...assessQualityRunSet({expectedLabels,records}),paths,records};
}
