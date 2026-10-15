import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {openAudioMeasurementBrowser} from './audio-native-browser.mjs';
import {installProcessingProbe,callProcessingProbe} from './audio-processing-probe.mjs';
import {AUDIO_ARTIFACT_FILES} from './audio-artifact-core.mjs';
import {summarizeCapture} from './audio-signal.mjs';
import {equalizerMeasurementCases,evaluateEqualizerCapture,normalizerMeasurementCases,evaluateNormalizerTrace,validateProcessingCapture,processingReportFailures} from './audio-processing-metrics.mjs';

/** @typedef {{root:string,readFile:(relative:string,encoding:'utf8')=>Promise<string>,ensureDirectory:(relative:string)=>Promise<string>,makeTempDirectory:(prefix:string)=>Promise<string>,writeFile:(relative:string,data:string|Uint8Array,options?:{flag:string})=>Promise<unknown>}} MeasurementFiles */
/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('audio-processing-data');return /** @type {Record<string,unknown>} */(value);}
/** @param {Record<string,unknown>} value @param {string} key */
function numeric(value,key){const number=value[key];if(typeof number!=='number'||!Number.isFinite(number))throw new Error('audio-processing-data-'+key);return number;}
/** @param {Record<string,unknown>} value @param {string} key */
function list(value,key){const row=value[key];if(!Array.isArray(row))throw new Error('audio-processing-data-'+key);return /** @type {unknown[]} */(row);}
/** @param {readonly string[]} args */
export function parseAudioProcessingArgs(args){
  if(args.length!==1||!/^--run-id=[A-Za-z0-9]{1,64}$/.test(args[0]??''))throw new Error('audio-processing-args');
  return {runId:/** @type {string} */(args[0]).slice(9)};
}
/** @param {import('playwright').Page} page @param {import('./audio-processing-probe.mjs').ProcessingAction} action */
async function call(page,action){
  /** @type {ReturnType<typeof setTimeout>|undefined} */let timer;
  try{return await Promise.race([page.evaluate(callProcessingProbe,action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('audio-processing-action-timeout')),30000);})]);}
  finally{clearTimeout(timer);}
}
/** @param {import('playwright').Page} page */
const facts=async page=>record(await call(page,{kind:'facts'}));
/** @param {import('playwright').Page} page @param {Record<string,unknown>} config @param {number} [gain] @param {boolean} [enabled] */
async function configure(page,config,gain=1,enabled=true){
  const result=record(await call(page,{kind:'configure',config,gain,enabled}));
  if(result.status!==(enabled?'on':'off'))throw new Error('audio-processing-graph-not-ready');
}
/** @param {import('playwright').Page} page @param {number} [seconds] */
const capture=async(page,seconds=1)=>validateProcessingCapture(await call(page,{kind:'capture',seconds}));
/** @param {Record<string,unknown>} state @param {number} index */
function gainAt(state,index){const value=list(state,'gains')[index];if(typeof value!=='number'||!Number.isFinite(value))throw new Error('audio-processing-gain-missing');return value;}
/** @param {import('playwright').Page} page @param {number} sampleRate @param {MeasurementFiles} files @param {string} html */
async function preparePage(page,sampleRate,files,html){
  page.setDefaultTimeout(15000);
  await page.route('**/*',route=>route.request().url()==='https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'?route.fulfill({contentType:'text/html',body:html}):route.abort('blockedbyclient'));
  await page.goto('https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');await page.bringToFront();
  await page.evaluate(installProcessingProbe,sampleRate);
  for(const file of AUDIO_ARTIFACT_FILES)await page.evaluate(await files.readFile(file,'utf8'));
  await call(page,{kind:'bootstrap'});await page.locator('.knife-comp').waitFor();
  await call(page,{kind:'signal',frequency:1000,inputDbfs:-40,pattern:'stereo'});
  await page.locator('.knife-comp button').click();await configure(page,{compressorEnabled:false,eqEnabled:false,normalizerEnabled:false});
  await page.waitForTimeout(1250);
  const observed=await facts(page);
  if(observed.contextState!=='running'||observed.hidden!==false||observed.sources!==1)throw new Error('audio-processing-native-start');
}
/** @param {import('playwright').Page} page @param {number} sampleRate @param {MeasurementFiles} files @param {string} directory */
async function equalizerProof(page,sampleRate,files,directory){
  const rows=[];
  for(const spec of equalizerMeasurementCases().filter(row=>row.sampleRate===sampleRate)){
    await configure(page,{normalizerEnabled:false,compressorEnabled:false,eqEnabled:false},1,false);
    await call(page,{kind:'signal',frequency:spec.frequency,inputDbfs:-40,pattern:'stereo'});
    const bands=Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map((frequency,index)=>['eq'+frequency,spec.levels[index]]));
    await configure(page,{...bands,eqEnabled:true,normalizerEnabled:false,compressorEnabled:false},spec.masterGain);
    await page.waitForTimeout(1500);
    const data=await capture(page),nativeDb=await call(page,{kind:'response',frequency:spec.frequency});
    if(typeof nativeDb!=='number')throw new Error('audio-processing-native-response');
    const measured=evaluateEqualizerCapture(data,spec,.01,nativeDb);
    const bytes=Buffer.alloc(data.channels[0].length*8);
    for(let frame=0;frame<data.channels[0].length;frame++)for(let channel=0;channel<2;channel++)bytes.writeFloatLE(/** @type {number} */(data.channels[channel]?.at(frame)),frame*8+channel*4);
    const file=`${directory}/${spec.id.replaceAll('/','-')}.f32le`;
    await files.writeFile(file,bytes,{flag:'wx'});
    rows.push({id:spec.id,inputRms:.01,...measured,capture:{file,sha256:createHash('sha256').update(bytes).digest('hex'),frames:data.end-data.start,sampleRate:data.rate,channels:2,encoding:'interleaved-float32le'}});
  }
  return rows;
}
/** @param {import('playwright').Page} page @param {number} sampleRate */
async function normalizerProof(page,sampleRate){
  const rows=[];
  for(const spec of normalizerMeasurementCases().filter(row=>row.sampleRate===sampleRate)){
    await configure(page,{normalizerEnabled:false,eqEnabled:false,compressorEnabled:false},1,false);
    await call(page,{kind:'signal',frequency:1000,inputDbfs:spec.inputDbfs,pattern:/** @type {import('./audio-processing-probe.mjs').SignalPattern} */(spec.pattern)});
    await configure(page,{normalizerEnabled:true,normalizerTargetDbfs:-20,eqEnabled:false,compressorEnabled:false});
    await call(page,{kind:'reset-events'});await page.waitForTimeout(spec.seconds*1000);
    const trace=await facts(page),measured=evaluateNormalizerTrace(trace,spec);
    if(trace.buffers!==2||trace.active100msTimers!==1)measured.failures.push('normalizer-buffer-or-timer-bound');
    rows.push({id:spec.id,trace,measured});
    console.log(JSON.stringify({stage:'normalizer',id:spec.id,failures:measured.failures}));
  }
  return rows;
}
/** @param {import('playwright').Page} page */
async function controlProof(page){
  await configure(page,{normalizerEnabled:false,eqEnabled:false,compressorEnabled:false},1,false);
  await call(page,{kind:'signal',frequency:1000,inputDbfs:0,pattern:'dc'});await configure(page,{},1,false);await page.waitForTimeout(1250);
  const unity=summarizeCapture(await capture(page));
  await call(page,{kind:'signal',frequency:1000,inputDbfs:20*Math.log10(.99),pattern:'dc'});await configure(page,{},1,false);await page.waitForTimeout(1250);
  const dry99=summarizeCapture(await capture(page));
  await configure(page,{compressorThreshold:0,compressorKnee:0,compressorRatio:1},2);await page.waitForTimeout(1250);
  const wet=summarizeCapture(await capture(page));
  const bands=Object.fromEntries([63,125,250,500,1000,2000,4000,8000].map(frequency=>['eq'+frequency,6]));
  await call(page,{kind:'signal',frequency:1000,inputDbfs:-6,pattern:'stereo'});
  await configure(page,{...bands,eqEnabled:true,compressorEnabled:true,normalizerEnabled:true,normalizerTargetDbfs:-12},2);
  await page.waitForTimeout(9500);const extreme=summarizeCapture(await capture(page)),extremeFacts=await facts(page);
  /** @type {Record<string,unknown>} */const noise={};
  for(const pattern of /** @type {const} */(['silence','noise','bursts'])){
    await configure(page,{normalizerEnabled:false,eqEnabled:false,compressorEnabled:false},1,false);
    await call(page,{kind:'signal',frequency:1000,inputDbfs:pattern==='noise'?-70:-24,pattern});
    await configure(page,{normalizerEnabled:true,normalizerTargetDbfs:-20});await call(page,{kind:'reset-events'});
    await page.waitForTimeout(pattern==='bursts'?9000:3500);noise[pattern]=await facts(page);
  }
  await configure(page,{normalizerEnabled:false},1,false);
  await call(page,{kind:'signal',frequency:1000,inputDbfs:-24,pattern:'stereo'});await configure(page,{normalizerEnabled:true});
  await page.waitForTimeout(6500);await call(page,{kind:'reset-events'});
  await call(page,{kind:'stall',milliseconds:240});await page.waitForTimeout(700);const stall=await facts(page);
  await call(page,{kind:'reset-events'});await call(page,{kind:'analysis-error',enabled:true});await page.waitForTimeout(220);const error=await facts(page);
  await call(page,{kind:'analysis-error',enabled:false});
  const silence=record(noise.silence),lowNoise=record(noise.noise),burst=record(noise.bursts);
  const bounded=/** @param {Record<string,unknown>} row */row=>row.invalidFrames===0&&list(row,'gains').every(value=>typeof value==='number'&&Number.isFinite(value))&&list(row,'bins').length>10;
  const silenceNoBoost=/** @param {Record<string,unknown>} row */row=>bounded(row)&&list(row,'events').every(value=>{const event=record(value);return event.node!==7||numeric(event,'to')<=1.00001&&numeric(event,'from')<=1.00001;});
  const steps=list(stall,'steps').map(record).filter(row=>row.node===7),hold=steps.find(row=>row.start===row.end),ramp=steps.find(row=>numeric(row,'end')>numeric(row,'start'));
  const fft=2**Math.ceil(Math.log2(numeric(stall,'sampleRate')*.25)),window=fft/numeric(stall,'sampleRate');
  return {dryUnity:unity.channels.every(row=>Math.abs(row.rms-1)<.00001),dry99:dry99.channels.every(row=>Math.abs(row.rms-.99)<.00001),
    wetPeak:wet.channels.every(row=>row.peak<=.9801&&row.overFullScaleSamples===0),
    extreme48db:extreme.channels.every(row=>row.peak<=.9801&&row.overFullScaleSamples===0)&&Math.abs(20*Math.log10(gainAt(extremeFacts,3))+48)<.01&&gainAt(extremeFacts,2)===2,
    silenceNoBoost:silenceNoBoost(silence),noiseNoBoost:silenceNoBoost(lowNoise),burstFinite:bounded(burst),
    stallHold:!!hold&&!!ramp&&numeric(ramp,'start')-numeric(hold,'start')>=window-.025,
    analysisErrorUnity:list(error,'events').some(value=>{const event=record(value);return event.node===7&&Math.abs(numeric(event,'end')-numeric(event,'start')-.01)<.001&&numeric(event,'to')===1;}),
    evidence:{unity,dry99,wet,extreme,extremeFacts,silence,lowNoise,burst,stall,error}};
}
/** @param {import('playwright').Page} page @param {Awaited<ReturnType<typeof openAudioMeasurementBrowser>>} measurement @param {number} sampleRate @param {MeasurementFiles} files @param {string} html */
async function lifetimeProof(page,measurement,sampleRate,files,html){
  await configure(page,{normalizerEnabled:false,eqEnabled:false,compressorEnabled:false},1,false);
  await call(page,{kind:'signal',frequency:1000,inputDbfs:-24,pattern:'stereo'});await configure(page,{normalizerEnabled:true});await page.waitForTimeout(6000);
  const visible=await facts(page),volume=record(visible.video);
  const other=await measurement.context.newPage();await other.bringToFront();
  await page.waitForFunction(()=>document.hidden===true);const hidden=await facts(page);await page.waitForTimeout(1400);const held=await facts(page);
  await page.bringToFront();await page.waitForFunction(()=>document.hidden===false);await page.waitForTimeout(550);
  const restored=await facts(page);await other.close();
  await configure(page,{normalizerEnabled:false});await page.waitForTimeout(50);await call(page,{kind:'reset-events'});
  const before=await facts(page);await call(page,{kind:'retired-ticks'});const after=await facts(page);
  await configure(page,{normalizerEnabled:false},0);await page.waitForTimeout(1200);const zero=summarizeCapture(await capture(page));
  await configure(page,{},.5);
  const target=await measurement.browserSession.send('Target.createTarget',{url:'about:blank',newWindow:true});
  let second=measurement.context.pages().find(candidate=>candidate!==page);
  if(!second)second=await measurement.context.waitForEvent('page',{timeout:15000});
  await preparePage(second,sampleRate,files,html);await configure(second,{normalizerEnabled:false,compressorEnabled:false,eqEnabled:false},2);
  const session=await measurement.context.newCDPSession(page),identity=await session.send('Target.getTargetInfo');await session.detach();
  const firstWindow=await measurement.browserSession.send('Browser.getWindowForTarget',{targetId:identity.targetInfo.targetId});
  const secondWindow=await measurement.browserSession.send('Browser.getWindowForTarget',{targetId:target.targetId});
  const first=await facts(page),secondFacts=await facts(second);await second.close();await page.bringToFront();await page.waitForTimeout(300);const remaining=await facts(page);
  return {sourceOne:visible.sources===1&&restored.sources===1,gainZero:zero.channels.every(row=>row.peak===0&&row.rms===0),
    muteVolumePreserved:record(remaining.video).muted===volume.muted&&record(remaining.video).volume===volume.volume,
    oldCallbacksZero:list(before,'events').length===list(after,'events').length&&list(before,'steps').length===list(after,'steps').length&&before.reads===after.reads,
    metersOffAfterDisable:after.active100msTimers===0,hiddenObserved:hidden.hidden===true,hiddenHold:Math.abs(gainAt(held,7)-gainAt(hidden,7))<.0001,
    visibleRestored:restored.hidden===false,independentWindows:firstWindow.windowId!==secondWindow.windowId&&gainAt(first,2)===.5&&gainAt(secondFacts,2)===2,
    oneWindowClosed:second.isClosed(),remainingSourceOne:remaining.sources===1,
    evidence:{visible,hidden,held,restored,before,after,zero,first,secondFacts,remaining,windowIds:[firstWindow.windowId,secondWindow.windowId]}};
}

/** @param {{runId:string}} options */
export async function runAudioProcessing(options){
  parseAudioProcessingArgs([`--run-id=${options.runId}`]);
  if(process.platform!=='win32')throw new Error('audio-processing-native-platform');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const ownedSpecifier='./owned-files.mjs',sourceSpecifier='./check-installed-transition.mjs';
  /** @type {unknown} */const owned=await import(ownedSpecifier),sourceModule=await import(sourceSpecifier);
  const open=record(owned).openOwnedRoot,attest=record(sourceModule).sourceAttestation;
  if(typeof open!=='function'||typeof attest!=='function')throw new Error('audio-processing-provider');
  /** @type {unknown} */const rawFiles=await Reflect.apply(open,undefined,[root]);
  if(!['readFile','writeFile','ensureDirectory','makeTempDirectory'].every(key=>typeof record(rawFiles)[key]==='function')||record(rawFiles).root!==root)throw new Error('audio-processing-files');
  const files=/** @type {MeasurementFiles} */(rawFiles);
  const required=['scripts/check-audio-processing.mjs','scripts/audio-processing-probe.mjs','scripts/audio-processing-metrics.mjs','scripts/audio-native-browser.mjs','tests/f01-audio-quality-contract.test.cjs','tests/fixtures/f01-audio-processing.json','tsconfig.audio-tools.json'];
  /** @type {unknown} */const source=await Reflect.apply(attest,undefined,[files,required]);
  const directory=await files.makeTempDirectory(`output/audio-processing-${options.runId}-`),relative=path.relative(root,directory).split(path.sep).join('/');
  await files.ensureDirectory(relative+'/captures');
  const {chromium}=await import('playwright'),require=createRequire(import.meta.url),helperSpecifier='../tests/helpers.cjs';
  /** @type {unknown} */const helper=require(helperSpecifier);const html=record(helper).playerHTML;
  if(typeof html!=='string')throw new Error('audio-processing-fixture');
  /** @type {Record<string,unknown>[]} */const rates=[];
  /** @type {string[]} */const pageErrors=[];
  /** @type {string|null} */let error=null;
  try{
    for(const sampleRate of [44100,48000,96000]){
      const measurement=await openAudioMeasurementBrowser(chromium,files),page=await measurement.context.newPage();
      const row=/** @type {Record<string,unknown>} */({sampleRate,profilePath:measurement.profilePath});rates.push(row);
      page.on('pageerror',exception=>pageErrors.push(exception.message));
      try{
        await preparePage(page,sampleRate,files,html);row.nodes=await facts(page);
        row.equalizer=await equalizerProof(page,sampleRate,files,relative+'/captures');
        row.normalizer=await normalizerProof(page,sampleRate);row.controls=await controlProof(page);
        row.lifetime=await lifetimeProof(page,measurement,sampleRate,files,html);
      }finally{row.shutdown=await measurement.close();}
      console.log(JSON.stringify({stage:'rate-complete',sampleRate}));
    }
  }catch(cause){error=cause instanceof Error?cause.message:'audio-processing-failed';}
  /** @type {unknown} */const after=await Reflect.apply(attest,undefined,[files,required]);
  const report={schema:'f01-audio-processing-v1',runId:options.runId,source,after,rates,pageErrors,error,
    limits:'Synthetic floating output before a silent sink. Not physical speakers, protected streams, or durable Gain actor/storage authority. Retained profiles and raw EQ captures. Finite allocations are not a leak-free proof.'};
  const failures=processingReportFailures(report,source);
  await files.writeFile(relative+'/report.json',JSON.stringify({...report,passed:failures.length===0,failures},null,2),{flag:'wx'});
  console.log(JSON.stringify({report:relative+'/report.json',passed:failures.length===0,failures}));
  if(failures.length)throw new Error('audio-processing-qualification-failed');
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await runAudioProcessing(parseAudioProcessingArgs(process.argv.slice(2)));}
  catch(error){console.error(error instanceof Error?error.message:'audio-processing-failed');process.exitCode=1;}
}
