import {isDeepStrictEqual} from 'node:util';
import {AUDIO_ARTIFACT_FILES} from './audio-artifact-core.mjs';
import {audioQualityFailures} from './audio-metrics.mjs';
import {summarizeCapture} from './audio-signal.mjs';
import {validateQualityEvidence} from './audio-quality-diagnostics.mjs';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {Writable} from 'node:stream';
import {finished} from 'node:stream/promises';
import {stopVisibilityChild} from './extension-e2e/visibility-browser.mjs';

const frozenCommit='c5d45b8a7abf30450d3f1bbff45afbb8cd020cb5';
/** @typedef {'f'|'u'|'t'} ObserverMode */
/** @typedef {{label:string,mode:ObserverMode}} ObserverRun */
/** @param {unknown} value @param {string} code @returns {asserts value} */
function need(value,code){if(!value)throw new Error(code);}
/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value){need(value&&typeof value==='object'&&!Array.isArray(value),'observer-object');return /** @type {Record<string,unknown>} */(value);}
/** @param {unknown} value @returns {unknown[]} */
function array(value){need(Array.isArray(value),'observer-array');return value;}
/** @param {unknown} value */
const finite=value=>typeof value==='number'&&Number.isFinite(value);
/** @param {unknown} value @param {number} length */
const hex=(value,length)=>typeof value==='string'&&(length===40?/^[a-f0-9]{40}$/:/^[a-f0-9]{64}$/).test(value);

/** @param {string} prefix @returns {readonly ObserverRun[]} */
export function observerRunPlan(prefix){
  need(typeof prefix==='string'&&/^[a-z0-9][a-z0-9-]{0,60}$/.test(prefix),'observer-prefix');
  return ['f1','u1','t1','u2','t2','f2','t3','f3','u3'].map(suffix=>({label:prefix+'-'+suffix,mode:/** @type {ObserverMode} */(suffix[0])}));
}

const caseInputs=[[1000,.5,1,false,'identical',false],[1000,.01,1,false,'identical',false],[100,.8,1,false,'identical',false],[5000,.8,1,false,'identical',false],
  [1000,.5,1,true,'identical',false],[1000,.01,1.5,true,'identical',false],[1000,.1,1.5,true,'identical',false],[1000,.5,1.5,true,'identical',false],
  [1000,.98,1.5,true,'identical',false],[1000,.98,2,true,'identical',false],[100,.8,1.5,true,'identical',false],[5000,.8,1.5,true,'identical',false],
  [1000,.5,1.5,true,'left-only',false],[1000,.98,1.5,true,'identical',true]];
const alignmentInputs=[[8000,48],[11025,66],[16000,96],[22050,132],[32000,192],[44100,264],[48000,288],[88200,529],[96000,576],[176400,1023],[192000,1023],[384000,1023]];

/** @param {unknown} input */
function validateSummary(input){
  const value=record(input),channels=array(value.channels);
  need(value.sampleRate===48000&&finite(value.windowSeconds)&&/** @type {number} */(value.windowSeconds)>0&&channels.length===2&&finite(value.channelDifferenceRms),'observer-window');
  for(const item of channels){
    const channel=record(item),envelope=record(channel.envelope8ms);
    for(const key of ['samples','mean','rms','peak','overFullScaleSamples','maxAdjacentStep'])need(finite(Reflect.get(channel,key)),'observer-channel');
    need(Number.isSafeInteger(channel.samples)&&/** @type {number} */(channel.samples)>0&&
      Math.abs(/** @type {number} */(channel.samples)-/** @type {number} */(value.windowSeconds)*48000)<1e-7,'observer-sample-count');
    need(Number.isSafeInteger(channel.overFullScaleSamples)&&/** @type {number} */(channel.overFullScaleSamples)>=0&&
      /** @type {number} */(channel.overFullScaleSamples)<=/** @type {number} */(channel.samples),'observer-full-scale-count');
    for(const key of ['peakDbfs','rmsDbfs','thdPercent','thdnPercent','fundamentalAmplitude']){const value=Reflect.get(channel,key);need(value===null||finite(value),'observer-nullable-metric');}
    need(['','non-coherent-window','tone-not-detectable'].includes(/** @type {string} */(channel.spectralReason)),'observer-spectrum');
    need(envelope.windowSamples===384&&finite(envelope.min)&&finite(envelope.max)&&/** @type {number} */(envelope.min)>=0&&
      /** @type {number} */(envelope.max)>=/** @type {number} */(envelope.min),'observer-envelope');
  }
}

/** @param {Record<string,unknown>} report */
function validateReport(report){
  const nodes=record(report.nodes),cases=array(report.cases),transitions=array(report.transitions),alignments=array(report.alignments);
  need(nodes.sampleRate===48000&&nodes.sources===1&&cases.length===14&&transitions.length===18&&alignments.length===12,'observer-report-shape');
  for(const [index,item]of cases.entries()){
    const row=record(item);need(isDeepStrictEqual(['frequency','inputAmplitude','gain','enabled','stereo','bursts'].map(key=>Reflect.get(row,key)),caseInputs.at(index)),'observer-case-input');validateSummary(row);
  }
  const calibration=record(array(record(cases[0]).channels)[0]);need(/** @type {number} */(calibration.rms)>=.34&&/** @type {number} */(calibration.rms)<=.36,'observer-calibration');
  const steps=[['gain',1.5],['gain',2],['gain',0],['gain',1],['enabled',false],['enabled',true]];
  for(const [index,item]of transitions.entries()){
    const row=record(item);need(row.frequency===[250,750,1000].at(Math.floor(index/6))&&isDeepStrictEqual([row.kind,row.value],steps.at(index%6)),'observer-transition-input');
    for(const phase of ['before','change','after'])validateSummary(Reflect.get(row,phase));
  }
  for(const [index,item]of alignments.entries()){
    const row=record(item),expected=alignmentInputs.at(index);need(expected&&row.sampleRate===expected[0]&&row.expectedFrame===expected[1]&&
      ['dryFirst','dryLast','compressorFirst','compressorLast'].every(key=>{
        const frame=Reflect.get(row,key);return typeof frame==='number'&&Number.isSafeInteger(frame)&&frame>=-1&&frame<2048;
      }),'observer-alignment-input');
  }
  const stress=record(report.stress);need(stress.profile==='threshold0/knee0/ratio1/gain2','observer-stress');validateSummary(stress);
  return audioQualityFailures(/** @type {import('./audio-metrics.mjs').QualityReport} */(/** @type {unknown} */(report)));
}

/** @param {{manifest:unknown,records:readonly unknown[]}} input */
export function assessObserverRunSet({manifest,records}){
  /** @type {string[]} */const failures=[];let transportComplete=true;
  try{
    const m=record(manifest),order=observerRunPlan(/** @type {string} */(m.prefix)),tools=record(m.tools),current=record(tools.current),frozen=record(tools.frozen),env=record(m.environment),ci=record(m.ci);
    need(m.schema===1&&isDeepStrictEqual(m.order,order)&&records.length===9,'observer-manifest-order');
    need(frozen.commit===frozenCommit&&hex(current.commit,40)&&hex(frozen.inputSha256,64)&&hex(current.inputSha256,64),'observer-tool-provenance');
    need(ci.checkout===current.commit&&(ci.head===null||hex(ci.head,40)),'observer-ci-provenance');
    need(['linux','win32'].includes(/** @type {string} */(env.platform))&&typeof env.nodeVersion==='string'&&/^v24\./.test(env.nodeVersion)&&
      env.playwrightVersion==='1.62.1'&&env.sampleRate===48000&&hex(env.nodeExecutableSha256,64)&&hex(env.browserExecutableSha256,64),'observer-environment');
    const files=array(record(m.product).files);need(files.length===6&&files.every((value,index)=>{const row=record(value);return row.path===AUDIO_ARTIFACT_FILES.at(index)&&hex(row.sha256,64);}),'observer-product');
    /** @type {unknown} */let identity,audioIdentity;
    for(const [index,expected]of order.entries()){
      try{
        const item=record(records.at(index)),report=record(item.report),artifact=record(report.artifact);
        need(item.label===expected.label&&item.mode===expected.mode&&item.signal===null&&item.timedOut===false&&item.overflow===false&&item.closeConfirmed===true,'observer-run-state');
        need(artifact.label===expected.label&&typeof artifact.root==='string'&&isDeepStrictEqual(artifact.files,files),'observer-artifact');
        need(typeof report.browser==='string'&&report.browser.length>0&&report.browser.length<=128,'observer-browser');
        const actualIdentity={root:artifact.root,browser:report.browser,nodes:report.nodes};
        if(index===0)identity=actualIdentity;else need(isDeepStrictEqual(identity,actualIdentity),'observer-environment-drift');
        const quality=validateReport(report);need(isDeepStrictEqual(report.qualityFailures,quality),'observer-producer-quality');
        need(item.exitCode===0&&quality.length===0||item.exitCode===1&&quality.length>0,'observer-unexplained-exit');
        if(expected.mode==='f')need(item.diagnostic===null,'observer-frozen-no-diagnostic');
        else{
          const d=record(item.diagnostic);validateQualityEvidence(d);
          need(d.complete===true&&d.truncated===false&&d.label===expected.label&&d.traceEnabled===(expected.mode==='t')&&
            d.sourceCommit===current.commit&&d.pullRequestHead===ci.head&&d.platform===env.platform&&d.nodeVersion===env.nodeVersion&&d.sampleRate===48000&&
            d.browserVersion===report.browser&&isDeepStrictEqual(d.artifact,artifact),'observer-diagnostic-provenance');
          need(quality.length?d.error==='Audio quality failed: '+quality.join(', '):d.error===null,'observer-diagnostic-error');
          const active={config:d.audioConfig,wanted:d.wanted,state:d.state};
          if(index===1)audioIdentity=active;else need(isDeepStrictEqual(audioIdentity,active),'observer-audio-state-drift');
          const transitions=array(report.transitions).map(record).filter(row=>row.kind==='enabled');
          for(const [i,value]of array(d.captures).entries()){
            const row=record(value),transition=transitions.at(Math.floor(i/3));
            need(transition&&isDeepStrictEqual(transition[/** @type {string} */(row.phase)],summarizeCapture(/** @type {import('./audio-signal.mjs').CaptureWindow} */(row.capture))),'observer-pcm-summary');
          }
        }
        failures.push(...quality.map(value=>expected.label+'/'+value));
      }catch(error){transportComplete=false;failures.push(expected.label+'/'+(error instanceof Error?error.message:'observer-invalid'));}
    }
  }catch(error){transportComplete=false;failures.push(error instanceof Error?error.message:'observer-invalid');}
  return {transportComplete,qualityPass:transportComplete&&failures.length===0,failures};
}

/** @typedef {{root:string,resolve:(name:string,options?:{type?:string,optional?:boolean})=>Promise<string>,lstat:(name:string,options?:{optional?:boolean})=>Promise<import('node:fs').Stats|null>,readFile:(name:string,options?:'utf8'|{signal:AbortSignal})=>Promise<string|Buffer>,writeFile:(name:string,data:string|Uint8Array,options:{flag:string,signal?:AbortSignal})=>Promise<unknown>,ensureDirectory:(name:string)=>Promise<string>,readdir:(name:string)=>Promise<string[]>}} ObserverFiles */
/** @param {string} prefix */
export function observerEvidencePaths(prefix){
  const directory='output/audio-observer/'+prefix;
  return [directory+'/manifest.json',directory+'/result.json',...observerRunPlan(prefix).flatMap(({label,mode})=>[
    directory+'/'+label+'-report.json',...mode==='f'?[]:[directory+'/'+label+'-diagnostic.json'],directory+'/'+label+'-stdout.log',directory+'/'+label+'-stderr.log'])];
}

/** Fixed iteration, not retries. @param {string} prefix @param {(run:ObserverRun)=>Promise<unknown>} execute */
export async function executeObserverSequence(prefix,execute){
  const records=[];
  for(const run of observerRunPlan(prefix)){
    /** @type {Record<string,unknown>} */let result;
    try{result=record(await execute(run));}
    catch(error){result={...run,exitCode:null,signal:null,timedOut:false,overflow:false,closeConfirmed:false,report:null,diagnostic:null,errors:[error instanceof Error?error.message.slice(0,240):'observer-invocation-failed']};}
    records.push(result);
    if(result.closeConfirmed!==true||result.label!==run.label||result.mode!==run.mode||result.stopReason!==undefined)break;
  }
  return records;
}

/** @param {{files:ObserverFiles,cwd:string,args:string[],env:NodeJS.ProcessEnv,stdout:string,stderr:string,timeoutMs?:number}} options */
export async function executeObserverChild({files,cwd,args,env,stdout,stderr,timeoutMs=120000}){
  need(path.isAbsolute(cwd)&&Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000,'observer-child-input');
  for(const name of [stdout,stderr])need(!await files.lstat(name,{optional:true}),'observer-log-exists');
  const outPath=await files.resolve(stdout,{type:'missing-or-file'}),errPath=await files.resolve(stderr,{type:'missing-or-file'});
  // Capability resolution checks every component; wx refuses an existing evidence file.
  const out=await fs.open(outPath,'wx'); // eslint-disable-line security/detect-non-literal-fs-filename
  let err;
  try{err=await fs.open(errPath,'wx');}catch(error){await out.close();throw error;} // eslint-disable-line security/detect-non-literal-fs-filename
  const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let timedOut=false,overflow=false,cancelled=false,stopStarted=false;
  /** @type {string[]} */const errors=[];
  const closed=new Promise(resolve=>{child.once('close',resolve);child.once('error',error=>errors.push(error.message.slice(0,240)));});
  /** @type {()=>void} */let stopped=()=>{};
  const stopCompleted=new Promise(resolve=>{stopped=()=>resolve(true);});
  const stop=()=>{if(stopStarted)return;stopStarted=true;void stopVisibilityChild(child,closed).catch(error=>errors.push(String(error?.message??error).slice(0,240))).finally(stopped);};
  /** @param {import('node:fs/promises').FileHandle} file */
  const sink=file=>{
    let count=0;
    return new Writable({write(chunk,encoding,callback){
      const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,encoding);
      if(overflow||count+bytes.length>2*1024*1024){overflow=true;stop();callback();return;}
      count+=bytes.length;file.writeFile(bytes).then(()=>callback(),error=>{errors.push(String(error.message).slice(0,240));stop();callback(error);});
    }});
  };
  const sinks=[sink(out),sink(err)],drained=sinks.map(stream=>finished(stream).catch(error=>{errors.push(String(error.message).slice(0,240));stop();}));
  child.stdout?.pipe(/** @type {Writable} */(sinks[0]));child.stderr?.pipe(/** @type {Writable} */(sinks[1]));
  const cancel=()=>{cancelled=true;stop();};
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
  try{
    await Promise.race([closed,stopCompleted]);
    if(stopStarted){child.stdout?.destroy();child.stderr?.destroy();}
    for(const stream of sinks)if(!stream.writableEnded)stream.end();
    await Promise.all(drained);
  }finally{
    clearTimeout(timer);process.off('SIGINT',cancel);process.off('SIGTERM',cancel);await out.close();await err.close();
  }
  return {exitCode:child.exitCode,signal:child.signalCode,timedOut,overflow,
    closeConfirmed:!stopStarted&&!cancelled&&!errors.length&&child.exitCode!==null,errors:errors.slice(0,16)};
}

const require=createRequire(import.meta.url),repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
/** @param {Uint8Array|string} bytes */
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
/** @param {string} filename @param {()=>number} remaining */
async function hashFile(filename,remaining){const hash=crypto.createHash('sha256');for await(const chunk of createReadStream(filename,{signal:AbortSignal.timeout(Math.min(15000,remaining()))}))hash.update(chunk);remaining();return hash.digest('hex');} // eslint-disable-line security/detect-non-literal-fs-filename
/** @param {ObserverFiles} files @param {string} name @param {()=>number} remaining */
async function readWithin(files,name,remaining){const bytes=await files.readFile(name,{signal:AbortSignal.timeout(Math.min(15000,remaining()))});remaining();return bytes;}
/** @param {string} root */
async function ownedRoot(root){
  need(!(await fs.lstat(root)).isSymbolicLink(),'observer-root-link'); // eslint-disable-line security/detect-non-literal-fs-filename
  const specifier='./owned-files.mjs',provider=record(await import(specifier)),open=provider.openOwnedRoot;
  need(typeof open==='function','observer-files-provider');
  const value=record(await open(root));need(typeof value.root==='string'&&['resolve','lstat','readFile','writeFile','ensureDirectory','readdir'].every(key=>typeof Reflect.get(value,key)==='function'),'observer-files-provider');
  return /** @type {ObserverFiles} */(/** @type {unknown} */(value));
}
/** @param {ObserverFiles} files @param {()=>number} remaining */
async function sourceIdentity(files,remaining){
  const git=/** @param {string[]} args */args=>execFileSync('git',args,{cwd:files.root,encoding:'utf8',timeout:Math.min(15000,remaining()),maxBuffer:2097152,windowsHide:true});
  need(!git(['status','--porcelain','--untracked-files=no']).trim(),'observer-source-dirty');
  const names=git(['ls-files','-z']).split('\0').filter(Boolean).sort(),entries=[];
  need(names.includes('scripts/check-audio-quality.mjs'),'observer-source-input');
  for(const name of names)entries.push([name,sha(await readWithin(files,name,remaining))]);
  return {commit:git(['rev-parse','HEAD']).trim(),inputSha256:sha(JSON.stringify(entries)),lockSha256:sha(await readWithin(files,'package-lock.json',remaining))};
}
/** @param {ObserverFiles} files @param {()=>number} remaining */
async function productIdentity(files,remaining){const result=[];for(const name of AUDIO_ARTIFACT_FILES)result.push({path:name,sha256:sha(await readWithin(files,name,remaining))});return result;}
/** @param {ObserverFiles} files @param {string} name @param {()=>number} remaining */
async function boundedJSON(files,name,remaining){remaining();const stat=await files.lstat(name);need(stat?.isFile()&&stat.size<=8*1024*1024,'observer-json-size');return await readWithin(files,name,remaining);}
/** @param {ObserverFiles} files */
async function profiles(files){return await files.lstat('output/audio-quality',{optional:true})?(await files.readdir('output/audio-quality')).filter(name=>/^profile-[a-zA-Z0-9_-]+$/.test(name)):[];}
/** @param {string} profilePath */
async function profileProcesses(profilePath){
  const specifier='./extension-e2e/native-profile.mjs';
  /** @type {unknown} */const loaded=await import(specifier);
  const query=record(loaded).queryWindowsProcesses;need(typeof query==='function','observer-process-provider');return array(await query(profilePath));
}
/** @param {string} root */
async function browserExecutable(root){
  const fromRoot=createRequire(path.join(root,'package.json'));
  need(await fs.realpath(fromRoot.resolve('playwright/package.json'))===await fs.realpath(require.resolve('playwright/package.json')),'observer-playwright-drift');
  const packageFile=record(require('playwright/package.json'));need(packageFile.version==='1.62.1','observer-playwright-version');
  const registry=record(record(record(require('playwright-core/lib/coreBundle')).registry).registry);
  need(typeof registry.findExecutable==='function','observer-browser-provider');
  const executable=record(registry.findExecutable(process.platform==='win32'?'chromium':'chromium-headless-shell'));
  need(typeof executable.executablePath==='function','observer-browser-provider');
  const filename=executable.executablePath();need(typeof filename==='string'&&path.isAbsolute(filename),'observer-browser-path');return filename;
}

export {browserExecutable as observerBrowserExecutable};

/** @param {{frozenRoot:string,prefix:string}} options */
export async function runObserverIsolation({frozenRoot,prefix}){
  const deadline=Date.now()+20*60000,remaining=()=>{const value=deadline-Date.now();need(value>0,'observer-set-timeout');return value;};
  const order=observerRunPlan(prefix),paths=observerEvidencePaths(prefix),files=await ownedRoot(repositoryRoot);remaining();
  need(typeof frozenRoot==='string'&&frozenRoot.length>0,'observer-frozen-root');
  const frozen=await ownedRoot(path.resolve(files.root,frozenRoot));
  const inside=/** @param {string} a @param {string} b */(a,b)=>{const r=path.relative(a,b);return r===''||r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
  need(!inside(files.root,frozen.root)&&!inside(frozen.root,files.root),'observer-root-overlap');
  const currentIdentity=await sourceIdentity(files,remaining),frozenIdentity=await sourceIdentity(frozen,remaining);remaining();
  need(frozenIdentity.commit===frozenCommit&&currentIdentity.lockSha256===frozenIdentity.lockSha256,'observer-frozen-input');
  const original=execFileSync('git',['show',frozenCommit+':scripts/check-audio-quality.mjs'],{cwd:frozen.root,maxBuffer:2097152,timeout:Math.min(15000,remaining()),windowsHide:true});
  const frozenBytes=await readWithin(frozen,'scripts/check-audio-quality.mjs',remaining);
  need(typeof frozenBytes!=='string'&&original.equals(frozenBytes),'observer-frozen-runner-bytes');
  for(const name of ['scripts/audio-artifacts.mjs','scripts/audio-artifact-core.mjs','scripts/audio-metrics.mjs','scripts/audio-signal.mjs','scripts/audio-native-browser.mjs','scripts/owned-files.mjs','scripts/extension-e2e/visibility-browser.mjs','tests/helpers.cjs'])
    need(sha(await readWithin(files,name,remaining))===sha(await readWithin(frozen,name,remaining)),'observer-shared-input-drift');
  need(!process.env.PLAYWRIGHT_BROWSERS_PATH||path.isAbsolute(process.env.PLAYWRIGHT_BROWSERS_PATH),'observer-browser-relative-cache');
  const executable=await browserExecutable(files.root);need(executable===await browserExecutable(frozen.root),'observer-browser-drift');
  const environment={platform:process.platform,nodeVersion:process.version,nodeExecutableSha256:await hashFile(process.execPath,remaining),playwrightVersion:'1.62.1',
    browserExecutableSha256:await hashFile(executable,remaining),sampleRate:48000,lockSha256:currentIdentity.lockSha256};
  const product=await productIdentity(files,remaining),ci={checkout:currentIdentity.commit,head:process.env.GITHUB_HEAD_SHA??null};
  const manifest={schema:1,prefix,order,tools:{frozen:frozenIdentity,current:currentIdentity},product:{files:product},environment,ci};
  const directory='output/audio-observer/'+prefix;
  need(!await files.lstat(directory,{optional:true}),'observer-output-exists');
  for(const run of order)for(const root of [files,frozen])for(const suffix of ['.json','-diagnostic.json'])
    need(!await root.lstat('output/audio-quality/report-'+run.label+suffix,{optional:true}),'observer-source-output-exists');
  await files.ensureDirectory('output/audio-observer');
  // Exclusive run-directory claim before publishing the immutable plan.
  await fs.mkdir(await files.resolve(directory,{type:'missing-or-directory'})); // eslint-disable-line security/detect-non-literal-fs-filename
  await files.writeFile(directory+'/manifest.json',JSON.stringify(manifest,null,2),{flag:'wx',signal:AbortSignal.timeout(Math.min(15000,remaining()))});remaining();
  /** @type {Record<string,unknown>[]} */let records=[];/** @type {string[]} */const hostFailures=[];
  try{
    records=await executeObserverSequence(prefix,async run=>{
      const role=run.mode==='f'?frozen:files,before=await profiles(role),env={...process.env};delete env.KNIFE_AUDIO_QUALITY_TRACE;if(run.mode==='t')env.KNIFE_AUDIO_QUALITY_TRACE='1';
      const execution=await executeObserverChild({files,cwd:role.root,args:['scripts/check-audio-quality.mjs','--root',files.root,'--label',run.label],env,
        stdout:directory+'/'+run.label+'-stdout.log',stderr:directory+'/'+run.label+'-stderr.log',timeoutMs:Math.min(120000,remaining())});remaining();
      /** @type {unknown} */let report=null,diagnostic=null;
      for(const suffix of ['report',...run.mode==='f'?[]:['diagnostic']]){
        const raw='output/audio-quality/report-'+run.label+(suffix==='report'?'':'-diagnostic')+'.json';
        try{const bytes=await boundedJSON(role,raw,remaining);await files.writeFile(directory+'/'+run.label+'-'+suffix+'.json',bytes,{flag:'wx',signal:AbortSignal.timeout(Math.min(15000,remaining()))});remaining();
          const value=JSON.parse(bytes.toString());if(suffix==='report')report=value;else diagnostic=value;}
        catch{hostFailures.push(run.label+'/observer-evidence-read');}
      }
      let closeConfirmed=execution.closeConfirmed;
      if(process.platform==='win32'){
        const created=(await profiles(role)).filter(name=>!before.includes(name));
        if(created.length!==1)closeConfirmed=false;
        else{
          try{closeConfirmed=closeConfirmed&&(await profileProcesses(path.join(role.root,'output/audio-quality',/** @type {string} */(created[0])))).length===0;}catch{closeConfirmed=false;}
          const copied=await ownedRoot(path.join(role.root,'output/audio-quality',/** @type {string} */(created[0])));
          try{need(await hashFile(await copied.resolve('bundled-chromium/chrome.exe',{type:'file'}),remaining)===environment.browserExecutableSha256,'observer-launched-binary-drift');}catch{closeConfirmed=false;}
        }
      }
      if(run.mode!=='f'){
        try{validateQualityEvidence(diagnostic);}catch{closeConfirmed=false;}
      }else if(execution.exitCode!==0){
        // Original F has no structured shutdown diagnostic; never infer a valid failure from exit1 alone.
        try{const failures=validateReport(record(report)),stderr=(await readWithin(files,directory+'/'+run.label+'-stderr.log',remaining)).toString();
          closeConfirmed=closeConfirmed&&execution.exitCode===1&&failures.length>0&&stderr.includes('Error: Audio quality failed: '+failures.join(', '));}
        catch{closeConfirmed=false;}
      }
      let stopReason;
      if(!isDeepStrictEqual(product,await productIdentity(files,remaining))||!isDeepStrictEqual(currentIdentity,await sourceIdentity(files,remaining))||!isDeepStrictEqual(frozenIdentity,await sourceIdentity(frozen,remaining))){
        stopReason='observer-input-changed';hostFailures.push(run.label+'/'+stopReason);
      }
      remaining();
      return {...run,...execution,closeConfirmed,report,diagnostic,...stopReason?{stopReason}:{}};
    });
  }catch(error){hostFailures.push(error instanceof Error?error.message:'observer-host-failed');}
  const result=assessObserverRunSet({manifest,records});
  try{remaining();need(isDeepStrictEqual(currentIdentity,await sourceIdentity(files,remaining))&&isDeepStrictEqual(frozenIdentity,await sourceIdentity(frozen,remaining))&&
    isDeepStrictEqual(product,await productIdentity(files,remaining))&&environment.nodeExecutableSha256===await hashFile(process.execPath,remaining)&&environment.browserExecutableSha256===await hashFile(executable,remaining),'observer-input-changed');remaining();}
  catch(error){hostFailures.push(error instanceof Error?error.message:'observer-input-changed');}
  const evidence=[];
  try{for(const name of paths.filter(name=>name!==directory+'/result.json')){remaining();const stat=await files.lstat(name,{optional:true});if(stat?.isFile())evidence.push({path:name,sha256:sha(await readWithin(files,name,remaining))});}remaining();}
  catch(error){hostFailures.push(error instanceof Error?error.message:'observer-evidence-failed');}
  if(hostFailures.length){result.transportComplete=false;result.qualityPass=false;result.failures.push(...hostFailures);}
  const output={...result,records:records.map(({report:_report,diagnostic:_diagnostic,...rest})=>rest),evidence,limits:['fixed-nine-not-statistical-proof','frozen-has-no-raw-pcm','not-causal-closure']};
  const json=JSON.stringify(output,null,2);need(Buffer.byteLength(json)<=8*1024*1024,'observer-result-size');
  // A failed run may publish its failure during bounded teardown; success never survives deadline expiry.
  await files.writeFile(directory+'/result.json',json,{flag:'wx',signal:AbortSignal.timeout(result.transportComplete?Math.min(15000,remaining()):15000)});
  if(result.transportComplete)remaining();
  return {...result,paths};
}
