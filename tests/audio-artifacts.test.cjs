// 제품 루트에서 의존성 설치 후 node --test tests/audio-artifacts.test.cjs 로 자산 비교와 CLI 보존을 확인한다.
// 합성 자산을 임시 디렉터리에 만들고 정리한다. TAP에 실패한 계약을 표시한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const load = () => import('../scripts/audio-artifacts.mjs');

const artifactPaths=['media-profiles.js','config.js','web/runtime.js','web/site-adapter.js','web/audio.js','web/player.js'];
const rawReport=()=>({artifact:{label:'source',root:'fixture',files:artifactPaths.map(path=>({path,sha256:'a'.repeat(64)}))},qualityFailures:[]});
const rawPair=(left,right)=>[{...rawReport(),...left},{...rawReport(),...right}];
function rawInputs() {
  const repeated={...rawReport(),nodes:{sampleRate:Infinity}};
  const equality=1.0000010000009999e-7;
  return {
    omitted:undefined,nonArray:{},empty:[],single:[rawReport()],emptyPair:[{},{}],nullPair:[null,null],
    undefinedPair:[undefined,undefined],normal:rawPair({},{}),
    missingQuality:rawPair({qualityFailures:undefined},{qualityFailures:null}),
    duplicateHash:rawPair({artifact:{label:'source',files:[...rawReport().artifact.files,{path:'config.js',sha256:'b'.repeat(64)}]}},{}),
    ignoredExtraFile:rawPair({}, {artifact:{label:'source',files:[...rawReport().artifact.files,{path:'ignored',sha256:'b'}]}}),
    mixed:rawPair({qualityFailures:['a','a']},{qualityFailures:['b','b'],artifact:{label:'candidate',files:[]},nodes:1}),
    arrayLength:rawPair({nodes:[1]},{nodes:[1,2]}),keySet:rawPair({nodes:{a:1}},{nodes:{b:1}}),
    sortedKeys:rawPair({nodes:{z:1,a:1}},{nodes:{z:2,a:2}}),
    alignNull:rawPair({alignments:[null,undefined,,{}]},{alignments:[null,undefined,,{}]}),
    alignExtra:rawPair({alignments:[{extra:1}]},{alignments:[{extra:2}]}),
    repeated:[repeated,repeated],cloned:[repeated,structuredClone(repeated)],
    nan:rawPair({nodes:NaN},{nodes:NaN}),negativeInfinity:rawPair({nodes:-Infinity},{nodes:-Infinity}),
    signedZero:rawPair({nodes:-0},{nodes:0}),scalarType:rawPair({nodes:0},{nodes:'0'}),
    sameSymbol:(()=>{const value=Symbol('same');return rawPair({nodes:value},{nodes:value});})(),
    nullUndefined:rawPair({nodes:null},{nodes:undefined}),
    absoluteNoise:rawPair({nodes:0},{nodes:5e-8}),relativeNoise:rawPair({nodes:1},{nodes:1.0000005}),
    equality:rawPair({nodes:0},{nodes:equality}),excess:rawPair({nodes:0},{nodes:equality+1e-15}),
    partialChannel:rawPair({cases:[{channels:[{rms:0.25}]}]},{cases:[{channels:[{rms:0.25}]}]}),
    nullableChannel:rawPair({cases:[{channels:[null,undefined,,{}]}]},{cases:[{channels:[null,undefined,,{}]}]}),
    explicitUndefined:rawPair({cases:[{frequency:undefined}]},{cases:[{}]}),
    ignoredDiagnostics:rawPair({cases:[{channels:[{mean:1,rmsDbfs:1,thdnPercent:1}]}]},{cases:[{channels:[{mean:2,rmsDbfs:2,thdnPercent:2}]}]}),
    steadyThd:rawPair({cases:[{channels:[{thdPercent:1}]}]},{cases:[{channels:[{thdPercent:2}]}]}),
    envelopeExtra:rawPair({cases:[{channels:[{envelope8ms:{extra:1}}]}]},{cases:[{channels:[{envelope8ms:{extra:2}}]}]}),
    transitionIgnored:rawPair({transitions:[{before:{channels:[{rms:1,thdPercent:1}]}}]},{transitions:[{before:{channels:[{rms:2,thdPercent:2}]}}]}),
    stressThd:rawPair({stress:{channels:[{thdPercent:1}]}},{stress:{channels:[{thdPercent:2}]}}),
    filesObject:rawPair({artifact:{files:{}}},{}),fileNull:rawPair({artifact:{files:[null]}},{}),
    casesObject:rawPair({cases:{}},{}),caseNull:rawPair({cases:[null]},{}),
    transitionsObject:rawPair({transitions:{}},{}),transitionNull:rawPair({transitions:[null]},{}),
    stressObject:rawPair({stress:{}},{stress:{}}),stressChannelsObject:rawPair({stress:{channels:{}}},{}),
    rawStressFalsy:rawPair({stress:0},{stress:false}),
  };
}

test('literal raw artifact oracle preserves results exceptions order and plain inputs',async()=>{
  const {compareAudioArtifactReports}=await load();
  const expected=require('./fixtures/f00-audio-artifact-compatibility.json');
  const inputs=rawInputs();
  assert.deepEqual(Object.keys(inputs),Object.keys(expected));
  for(const [name,input] of Object.entries(inputs)) {
    let before;
    if(name!=='sameSymbol')before=structuredClone(input);
    let actual;
    try {actual={value:compareAudioArtifactReports(input)};}
    catch(error){actual={error:{name:error.name,message:error.message}};}
    assert.deepEqual(actual,expected[name],name);
    if(name!=='sameSymbol')assert.deepEqual(input,before,`${name} input mutation`);
  }
});

test('selected projection getters retain baseline and candidate access order',async()=>{
  const {compareAudioArtifactReports}=await load(),trace=[];
  const report=label=>{
    const channel=Object.fromEntries(['rms','peak','overFullScaleSamples','maxAdjacentStep','thdPercent','envelope8ms']
      .map(key=>[key,{get(){trace.push(`${label}.channel.${key}`);return undefined;},enumerable:true}]));
    const item={}; Object.defineProperties(item,Object.fromEntries(['frequency','inputAmplitude','gain','enabled','stereo','bursts','sampleRate','windowSeconds','channelDifferenceRms','channels']
      .map(key=>[key,{get(){trace.push(`${label}.case.${key}`);return key==='channels'?[Object.defineProperties({},channel)]:undefined;},enumerable:true}])));
    const result=rawReport();
    for(const key of ['nodes','cases','transitions','alignments','stress'])Object.defineProperty(result,key,{get(){trace.push(`${label}.${key}`);return key==='cases'?[item]:undefined;},enumerable:true});
    return result;
  };
  assert.deepEqual(compareAudioArtifactReports([report('baseline'),report('candidate')]),[]);
  const suffix=['nodes','cases','case.frequency','case.inputAmplitude','case.gain','case.enabled','case.stereo','case.bursts','case.sampleRate','case.windowSeconds','case.channelDifferenceRms','case.channels','channel.rms','channel.peak','channel.overFullScaleSamples','channel.maxAdjacentStep','channel.thdPercent','channel.envelope8ms','transitions','alignments','stress'];
  assert.deepEqual(trace,[...suffix.map(value=>`baseline.${value}`),...suffix.map(value=>`candidate.${value}`)]);
});

test('legacy artifact exports retain core function frozen list and constant identity',async()=>{
  const legacy=await load(),core=await import('../scripts/audio-artifact-core.mjs');
  for(const key of ['compareAudioArtifactReports','AUDIO_ARTIFACT_FILES','AUDIO_COMPARISON_ABSOLUTE_TOLERANCE','AUDIO_COMPARISON_RELATIVE_TOLERANCE'])assert.equal(legacy[key],core[key],key);
  assert.equal(Object.isFrozen(core.AUDIO_ARTIFACT_FILES),true);
});

test('independent raw oracle catches tolerance and selected THD mutations in actual core',async()=>{
  const crypto=require('node:crypto'),original=await fs.readFile('scripts/audio-artifact-core.mjs','utf8');
  const expected=require('./fixtures/f00-audio-artifact-compatibility.json');
  const comparator=source=>{
    assert.equal(source.split("import crypto from 'node:crypto';").length,2);
    return Function('crypto',source.replace("import crypto from 'node:crypto';",'').replace(/^export /gm,'')+'\nreturn compareAudioArtifactReports;')(crypto);
  };
  const clean=comparator(original);
  for(const [name,input]of Object.entries(rawInputs())){
    let actual;try{actual={value:clean(input)};}catch(error){actual={error:{name:error.name,message:error.message}};}
    assert.deepEqual(actual,expected[name],name);
  }
  const controls=[{from:'ABSOLUTE_TOLERANCE = 1e-7',to:'ABSOLUTE_TOLERANCE = 0',name:'absoluteNoise',want:['source/numeric/nodes']},
    {from:'RELATIVE_TOLERANCE = 1e-6',to:'RELATIVE_TOLERANCE = 0',name:'relativeNoise',want:['source/numeric/nodes']},
    {from:'thdPercent: channel.thdPercent',to:'thdPercent: undefined',name:'steadyThd',want:[]}];
  for(const control of controls){assert.equal(original.split(control.from).length,2);const mutated=comparator(original.replace(control.from,control.to));assert.deepEqual(mutated(rawInputs()[control.name]),control.want);assert.notDeepEqual(control.want,expected[control.name].value);assert.deepEqual(mutated(rawInputs().transitionIgnored),[]);}
  assert.equal(await fs.readFile('scripts/audio-artifact-core.mjs','utf8'),original);
});

test('audio quality selects the Windows Native launcher only on Windows without a Chrome override',async()=>{
  const source=await fs.readFile('scripts/check-audio-quality.mjs','utf8');
  const start=source.indexOf('const measurement='),end=source.indexOf("const output='output/audio-quality';",start);
  assert.ok(start>=0&&end>start);
  const launch=new (Object.getPrototypeOf(async()=>{}).constructor)('options','process','openAudioMeasurementBrowser','chromium','files',
    source.slice(start,end)+'return {measurement,browser};');
  for(const platform of ['win32','linux','darwin'])for(const chrome of [false,true]){
    const nativeBrowser={},bundledBrowser={},files={};
    const result=await launch({chrome},{platform},async(api,owned)=>{
      assert.equal(platform,'win32');assert.equal(chrome,false);assert.equal(owned,files);
      return {browser:nativeBrowser};
    },{async launch(options){assert.deepEqual(options,{headless:true,...chrome?{channel:'chrome'}:{}});return bundledBrowser;}},files);
    assert.equal(result.browser,platform==='win32'&&!chrome?nativeBrowser:bundledBrowser);
    assert.equal(result.measurement===null,platform!=='win32'||chrome);
  }
});

const workletBootstrap=`  if(await page.evaluate(()=>typeof window[Symbol.for('cheese-knife.runtime.v1')].audio.prepareTransitionModule==='function')){
    diagnosticEvidence.workletSha256=null;
    const bytes=await targetFiles.readFile('web/audio-transition-worklet.js');
    if(!bytes.length)throw new Error('audio-quality-worklet-empty');
    diagnosticEvidence.workletSha256=createHash('sha256').update(bytes).digest('hex');
    await page.evaluate(registerQualityWorklet,Array.from(bytes));
  }
`;
function withoutDiagnosticGlue(source){
  const begin=source.indexOf('  if(ciWorkletSigned&&diagnosticRun.trace)calibrate=async()=>{');
  const end=source.indexOf('  await signal();\n  // The media',begin);
  assert.ok(begin>=0&&end>begin);
  assert.equal(require('node:crypto').createHash('sha256').update(source.slice(begin,end)).digest('hex'),'da83f53ddf3ab898c6760f4f8978988cb0adee6582f86bc7bd8306933bafe1a2');
  source=source.slice(0,begin)+source.slice(end);
  const additions=[
    ["import {installRoleGraph,readRoleInputs,serializeRoleReport} from './audio-worklet-roles.mjs';", "import {installRoleGraph,readRoleInputs} from './audio-worklet-roles.mjs';"],
    ["await files.writeFile(reportPath,ciWorkletSigned?serializeRoleReport(report):JSON.stringify(report,null,2),{flag:'wx'});", "await files.writeFile(reportPath,JSON.stringify(report,null,2),{flag:'wx'});"],
    ["import {installWorkletProof} from './audio-worklet-signed.mjs';\nimport {installRoleGraph,readRoleInputs} from './audio-worklet-roles.mjs';",
      "import {installWorkletProof} from './audio-worklet-signed.mjs';"],
    ["let diagnosticPage,calibrate;",
      "let diagnosticPage;"],
    ["  const openPlayer=async target=>{\n    const url='https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';\n    await target.route(url,route=>route.fulfill({contentType:'text/html',body:playerHTML}));\n    await target.goto(url);\n  };\n  await openPlayer(page);",
      "  await page.route('https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',route=>route.fulfill({contentType:'text/html',body:playerHTML}));\n  await page.goto('https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');"],
    ["  let inputs;\n  if(ciWorkletSigned){\n    diagnosticEvidence.roleProfile=true;\n    inputs=await readRoleInputs(targetFiles);\n    diagnosticEvidence.injectedMain=inputs.manifest;\n    if(!inputs.manifest.every((file,i)=>{\n      const expected=artifact.files.at(i);\n      return expected!==undefined&&file.path===expected.path&&file.sha256===expected.sha256;\n    }))throw Error('worklet-role-main-manifest');\n    for(const script of inputs.scripts)await page.evaluate(script);\n  }else for(const file of AUDIO_ARTIFACT_FILES) await page.evaluate(await targetFiles.readFile(file,'utf8'));",
      "  for(const file of AUDIO_ARTIFACT_FILES) await page.evaluate(await targetFiles.readFile(file,'utf8'));"],
    ["    const bytes=inputs?.worklet??await targetFiles.readFile('web/audio-transition-worklet.js');",
      "    const bytes=await targetFiles.readFile('web/audio-transition-worklet.js');"],
    ["  const configurePlayer=(target,role)=>target.evaluate(role=>{\n    const runtime=window[Symbol.for('cheese-knife.runtime.v1')];\n    const config={...normalizeConfig({}),...KnifeMediaProfiles.projectGlobalAudio(role?{normalizerEnabled:true}:{})};\n    if(role)config.normalizerEnabled=true;",
      "  await page.evaluate(()=>{\n    const runtime=window[Symbol.for('cheese-knife.runtime.v1')];\n    const config={...normalizeConfig({}),...KnifeMediaProfiles.projectGlobalAudio({})};"],
    ["  },role);\n  await configurePlayer(page,false);\n  await page.locator('.knife-comp').waitFor();\n  const signal=async({frequency=1000,amplitude=0.5,stereo='identical',bursts=false}={},target=page)=>{\n    await target.evaluate(async options=>{",
      "  });\n  await page.locator('.knife-comp').waitFor();\n  const signal=async({frequency=1000,amplitude=0.5,stereo='identical',bursts=false}={})=>{\n    await page.evaluate(async options=>{"],
    ["  if(calibrate)try{await calibrate();}catch(error){diagnosticEvidence.roles??={};diagnosticEvidence.roles.cleanupError=String(error?.message??error).slice(0,2048);}\n  try{\n    if(measurement)diagnosticEvidence.shutdown=",
      "  try{\n    if(measurement)diagnosticEvidence.shutdown="],
    ["import {installWorkletProof} from './audio-worklet-signed.mjs';\nconst require=createRequire(import.meta.url);",
      "const require=createRequire(import.meta.url);"],
    ["const argv=process.argv.slice(2);\nconst ciWorkletSigned=argv.length===3&&argv[0]==='--ci-worklet-signed'&&argv[1]==='--label';\nconst options=parseAudioQualityArgs(ciWorkletSigned?argv.slice(1):argv,repositoryRoot);",
      "const options=parseAudioQualityArgs(process.argv.slice(2),repositoryRoot);"],
    ["  if(diagnosticRun.trace)await page.evaluate(installQualityTrace);\n  if(ciWorkletSigned)await page.evaluate(installWorkletProof,{trace:diagnosticRun.trace});",
      "  if(diagnosticRun.trace)await page.evaluate(installQualityTrace);"],
    ["  const wide=[];\n  const firstOn=ciWorkletSigned?{...captured,on:await page.locator('.knife-comp').getAttribute('data-state')==='on'}:null;\n  const run=async(enabled,gain)=>",
      "  const run=async(enabled,gain)=>"],
    ["      const frame=await page.evaluate(async({kind,value,recordPort})=>{",
      "      const frame=await page.evaluate(async({kind,value})=>{"],
    ["        const port=recordPort?window[Symbol.for('cheese-knife.quality-worklet-signed')]:null;\n        if(port)port.mark('start',frame);\n        if(kind==='gain')runtime.audio.setGain(video,value);else await runtime.audio.setEnabled(video,value);",
      "        if(kind==='gain')runtime.audio.setGain(video,value);else await runtime.audio.setEnabled(video,value);"],
    ["        if(port)port.mark('settle',window.__quality.masterFrames[window.__quality.masterFrameCount*2-1]);\n        return frame;\n      },{kind,value,recordPort:kind==='enabled'&&ciWorkletSigned&&diagnosticRun.trace});",
      "        return frame;\n      },{kind,value});"],
    ["      if(ciWorkletSigned&&kind==='enabled'){\n        if(diagnosticRun.trace)await page.evaluate(()=>{\n          const context=window.__quality.context;\n          window[Symbol.for('cheese-knife.quality-worklet-signed')].mark('end',Math.round(context.currentTime*context.sampleRate));\n        });\n        wide.push(await windowSamples(frame-960,frame+3840));\n      }\n      const rate=await page.evaluate(()=>window.__quality.context.sampleRate);",
      "      const rate=await page.evaluate(()=>window.__quality.context.sampleRate);"],
    ["  if(ciWorkletSigned)diagnosticEvidence.workletSigned={\n    ...await page.evaluate(()=>window[Symbol.for('cheese-knife.quality-worklet-signed')].snapshot()),firstOn,wide,\n  };\n  const alignments=await page.evaluate(async()=>{",
      "  const alignments=await page.evaluate(async()=>{"],
    ["// 제품 루트에서 Chromium과 빌드된 확장을 준비한 뒤 node scripts/check-audio-quality.mjs --label probe 로 실행한다.\n// 새 프로필에서 합성 음원을 무음 출력으로 측정한다. output/audio-quality에 수치·진단 JSON을 쓰고 검사 실패 시 비정상 종료한다.\n",''],
    ["import {execFileSync} from 'node:child_process';\nimport {createHash} from 'node:crypto';\nimport {prepareQualityRun,installQualityTrace,registerQualityWorklet,writeQualityDiagnostic} from './audio-quality-diagnostics.mjs';\n",''],
    [workletBootstrap,''],
    ["  if(Object.hasOwn(diagnosticEvidence,'workletSha256'))nodes.workletSha256=diagnosticEvidence.workletSha256;\n",''],
    [`const diagnosticRun=await prepareQualityRun(files,options.label,process.env.KNIFE_AUDIO_QUALITY_TRACE);
const diagnosticEvidence={artifact,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),
  pullRequestHead:process.env.GITHUB_HEAD_SHA??null,platform:process.platform,nodeVersion:process.version,browserVersion:'unavailable',
  sampleRate:0,audioConfig:{},wanted:false,state:'unavailable',trace:null,shutdown:null};
let diagnosticFailure=null;
const diagnosticSecondary=[];
const diagnosticError=(stage,error)=>{if(diagnosticFailure===null)diagnosticFailure=error;else diagnosticSecondary.push(stage+':'+String(error?.message??error).slice(0,2048));};
try {
`,''],
    ["let diagnosticPage;\ndiagnosticEvidence.browserVersion=browser.version();\n",''],
    ["  diagnosticPage=page;\n",''],
    ["  await page.evaluate(()=>{window.__quality.masterFrames=new Float64Array(12);window.__quality.masterFrameCount=0;});\n  if(diagnosticRun.trace)await page.evaluate(installQualityTrace);\n",''],
    ["      if(chunk.samples.length!==2||!chunk.samples[0]||!chunk.samples[1]||chunk.samples[0].length!==chunk.samples[1].length)throw new Error('Incomplete stereo audio capture window');\n",''],
    ["        if(kind==='enabled'){const probe=window.__quality,index=probe.masterFrameCount++*2;\n          probe.masterFrames.fill(frame,index,index+1);probe.masterFrames[index+1]=Math.round(probe.context.currentTime*probe.context.sampleRate);}\n",''],
    ["      const diagnosticCapture=(capture,phase)=>kind==='enabled'?diagnosticRun.collector.retainCapture(capture,{frequency,value,frame},phase):capture;\n",''],
    [`        before:summarizeCapture(diagnosticCapture(await windowSamples(frame-Math.round(rate*0.08),frame-Math.round(rate*0.04)),'before')),
        change:summarizeCapture(diagnosticCapture(await windowSamples(frame-Math.round(rate*0.02),frame+Math.round(rate*0.04)),'change')),
        after:summarizeCapture(diagnosticCapture(await windowSamples(frame+Math.round(rate*0.1),frame+Math.round(rate*0.14)),'after'))});`,
    `        before:summarizeCapture(await windowSamples(frame-Math.round(rate*0.08),frame-Math.round(rate*0.04))),
        change:summarizeCapture(await windowSamples(frame-Math.round(rate*0.02),frame+Math.round(rate*0.04))),
        after:summarizeCapture(await windowSamples(frame+Math.round(rate*0.1),frame+Math.round(rate*0.14)))});`],
    ["  await files.ensureDirectory(output);await files.writeFile(reportPath,JSON.stringify(report,null,2),{flag:'wx'});",
      "  await files.ensureDirectory(output);await files.writeFile(reportPath,JSON.stringify(report,null,2));"],
    [`}catch(error){diagnosticError('quality',error);}
finally{
  if(diagnosticPage)try{
    Object.assign(diagnosticEvidence,await diagnosticPage.evaluate(()=>{
      const runtime=window[Symbol.for('cheese-knife.runtime.v1')],probe=window.__quality,video=document.querySelector('video');
      const readback=runtime.audio.getReadback(video),wrapped=window[Symbol.for('cheese-knife.quality-trace')];
      return {sampleRate:probe.context.sampleRate,audioConfig:Object.fromEntries(KnifeMediaProfiles.audioFieldsV2.map(({id})=>[id,Reflect.get(runtime.config,id)])),
        wanted:readback.wanted,state:readback.state,actions:Array.from({length:probe.masterFrameCount},(_,index)=>({frame:probe.masterFrames[index*2],afterFrame:probe.masterFrames[index*2+1]})),
        trace:wrapped?wrapped.snapshot():{complete:probe.gains.length===8,truncated:false,error:null,nodeCount:probe.gains.length,gains:probe.gains.map(node=>node.gain.value),events:[]}};
    }));
  }catch(error){diagnosticError('snapshot',error);}
  try{
    if(measurement)diagnosticEvidence.shutdown={kind:'windows-native',...await measurement.close()};
    else{await browser.close();diagnosticEvidence.shutdown={kind:'playwright',browserCloseAcknowledged:true,browserDisconnected:!browser.isConnected()};}
  }catch(error){diagnosticError('close',error);}
}
}catch(error){diagnosticError('launch',error);}
const diagnostic=diagnosticRun.collector.buildReport({...diagnosticEvidence,error:diagnosticFailure,secondaryErrors:diagnosticSecondary});
try{await files.ensureDirectory('output/audio-quality');await writeQualityDiagnostic(files,diagnosticRun.paths.diagnostic,diagnostic);}
catch(error){diagnosticError('diagnostic-write',error);}
if(diagnosticFailure!==null){console.error(JSON.stringify({diagnosticComplete:diagnostic.complete,secondaryErrors:diagnosticSecondary}));throw diagnosticFailure;}
if(!diagnostic.complete)throw new Error('Audio diagnostic incomplete: '+diagnostic.validationErrors.join(', '));`,
      '}finally{if(measurement)await measurement.close();else await browser.close();}'],
  ];
  for(const [from,to]of additions){assert.equal(source.split(from).length,2,'only the exact approved diagnostic glue can be reversed');source=source.replace(from,to);}
  return source;
}

test('public entry retains frozen CLI calibration and limits apart from exact F01 bootstrap and owned browser glue',async()=>{
  const crypto=require('node:crypto'),source=(await fs.readFile('scripts/audio-artifacts.mjs','utf8')).replaceAll('\r\n','\n');
  const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
  assert.equal(hash(source.slice(source.indexOf('export function parseAudioQualityArgs'),source.indexOf('export async function describeAudioArtifact'))),'6a8fb8a811f17bba7a6ffbdd7f841fea21d4e7470231dd0a5f37a45959eb413b');
  const cli=withoutDiagnosticGlue((await fs.readFile('scripts/check-audio-quality.mjs','utf8')).replaceAll('\r\n','\n'))
    .replace("import {openOwnedRoot,openExtensionRoot}","import {openOwnedRoot}")
    .replace('const targetFiles=await openExtensionRoot(options.root);','const targetFiles=await openOwnedRoot(options.root);');
  const previous=`    window.postMessage({namespace:'cheese-knife',protocol:1,type:'config',requestId:runtime.requestId,
      revision:100,config:normalizeConfig({})},location.origin);`;
  const current=`    const config={...normalizeConfig({}),...KnifeMediaProfiles.projectGlobalAudio({})};
    window.postMessage({namespace:'cheese-knife',protocol:3,type:'config',requestId:runtime.mediaRequestId,context:{...runtime.media.context},
      deliverySequence:100,baseConfig:config,effectiveConfig:config,i18n:{},version:{globalRevision:0,mediaRevision:0},
      profileState:'global',revisionStatus:'ready',mediaPhase:'ready',audioBindingGeneration:1,audioKind:'global',videoKind:'global',gainOrigin:'site-legacy'},location.origin);`;
  const browserPrevious="const browser=await chromium.launch({headless:true,...(options.chrome?{channel:'chrome'}:{})});";
  const browserCurrent="const measurement=options.chrome||process.platform!=='win32'?null:await openAudioMeasurementBrowser(chromium,files);\nconst browser=measurement?.browser??await chromium.launch({headless:true,...(options.chrome?{channel:'chrome'}:{})});";
  const nativeImport="import {openAudioMeasurementBrowser} from './audio-native-browser.mjs';\n";
  const closeCurrent='}finally{if(measurement)await measurement.close();else await browser.close();}';
  for(const block of [current,browserCurrent,nativeImport,closeCurrent])assert.equal(cli.split(block).length,2,'only exact reviewed bootstrap/ownership glue differs');
  assert.equal(hash(cli.replace(current,previous).replace(browserCurrent,browserPrevious).replace(nativeImport,'').replace(closeCurrent,'}finally{await browser.close();}')),'6f8338b5c56b2043c33babea9957c3885c76b4be706ec578d300a849b789eee6');
  assert.match(source,/const files = await openExtensionRoot\(root\);\s+return describeAudioArtifactFiles\(files, label\);/);
  const {parseAudioQualityArgs}=await load();
  assert.deepEqual(parseAudioQualityArgs(['--chrome','--chrome','--label','first','--label','last'],process.cwd()),{chrome:true,root:process.cwd(),label:'last'});
});

test('diagnostic glue cannot conceal a changed measurement window or calibration threshold',async()=>{
  const crypto=require('node:crypto'),source=(await fs.readFile('scripts/check-audio-quality.mjs','utf8')).replaceAll('\r\n','\n');
  const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
  assert.throws(()=>withoutDiagnosticGlue(source.replace('frame-Math.round(rate*0.08)','frame-Math.round(rate*0.09)')),/exact approved diagnostic glue/);
  assert.notEqual(hash(withoutDiagnosticGlue(source.replace('cases[0].channels[0].rms<0.34','cases[0].channels[0].rms<0.35'))),hash(withoutDiagnosticGlue(source)));
});

test('합성 러너는 Worklet 대상에서만 같은 루트의 원바이트를 한 번 읽어 등록하고 해시한다',async()=>{
  const {createHash}=require('node:crypto'),vm=require('node:vm');
  const run=new (Object.getPrototypeOf(async()=>{}).constructor)('page','targetFiles','diagnosticEvidence','createHash','registerQualityWorklet',workletBootstrap);
  const {createQualityDiagnostics}=await import('../scripts/audio-quality-diagnostics.mjs');
  const install=()=>{},original=Buffer.from([0xff,0x00,0x80,0x41]);
  for(const mode of ['legacy','worklet','empty','ENOENT','owned-path-link']){
    const readError=['ENOENT','owned-path-link'].includes(mode)?Error(mode):null;
    const audio=mode==='legacy'?{}:{prepareTransitionModule(){}},evidence={},submitted=[];
    const window={[Symbol.for('cheese-knife.runtime.v1')]:{audio}};
    const page={evaluate(fn,arg){
      if(fn===install){submitted.push(arg);return;}
      return vm.runInNewContext('('+fn.toString()+')()',{window});
    }};
    let reads=0;
    const files={async readFile(...args){
      assert.deepEqual(args,['web/audio-transition-worklet.js']);reads++;
      if(readError)throw readError;
      return mode==='empty'?Buffer.alloc(0):original;
    }};
    const result=run(page,files,evidence,createHash,install);
    if(mode==='empty'||readError){
      await assert.rejects(result,error=>{
        if(readError)assert.equal(error,readError);
        else assert.equal(error.message,'audio-quality-worklet-empty');
        const diagnostic=createQualityDiagnostics({label:'probe',trace:false}).buildReport({...evidence,error});
        assert.equal(diagnostic.workletSha256,null);assert.deepEqual(diagnostic.gainRoles,[]);
        assert.equal(diagnostic.complete,false);assert.equal(diagnostic.error,error.message);
        return true;
      });
    }else{
      await result;
      assert.deepEqual(evidence,mode==='worklet'?{workletSha256:createHash('sha256').update(original).digest('hex')}:{});
    }
    assert.equal(reads,mode==='legacy'?0:1);
    assert.deepEqual(submitted,mode==='worklet'?[Array.from(original)]:[]);
  }
});

test('자산 비교는 동일한 MAIN 파일에서도 보조 Worklet SHA 차이와 누락을 검출한다',async()=>{
  const {compareAudioArtifactReports}=await load();
  const baseline={workletSha256:'a'.repeat(64)};
  for(const candidate of [{workletSha256:'b'.repeat(64)},{}]){
    const failures=compareAudioArtifactReports(rawPair({nodes:baseline},{nodes:candidate}));
    assert.ok(failures.some(failure=>failure.includes('numeric/nodes')));
  }
});

test('public entry hashes actual disk bytes and retains label precedence missing child and link rejection',async t=>{
  const {describeAudioArtifact}=await load(),root=await artifactFixture(t);
  for(const relative of artifactPaths)await fs.writeFile(path.join(root,relative),'abc');
  assert.deepEqual(await describeAudioArtifact(root,'fixture'),{label:'fixture',root:await fs.realpath(root),files:artifactPaths.map(path=>({path,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}))});
  await assert.rejects(describeAudioArtifact(path.join(root,'absent'),'!'),{name:'Error',message:'audio-label-invalid'});
  await fs.unlink(path.join(root,'web/runtime.js'));
  await assert.rejects(describeAudioArtifact(root,'fixture'),{name:'Error',message:'ENOENT',code:'ENOENT'});
  await fs.writeFile(path.join(root,'web/runtime.js'),'abc');
  // A fresh link destination avoids Windows locks on the just-renamed web directory.
  const linkedRoot=path.join(root,'linked-artifact');
  await fs.mkdir(linkedRoot);
  await fs.copyFile(path.join(root,'media-profiles.js'),path.join(linkedRoot,'media-profiles.js'));
  await fs.copyFile(path.join(root,'config.js'),path.join(linkedRoot,'config.js'));
  await fs.symlink(path.join(root,'web'),path.join(linkedRoot,'web'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(describeAudioArtifact(linkedRoot,'fixture'),{code:'owned-path-link'});
});

async function artifactFixture(t, suffix = '') {
  await fs.mkdir(path.join(process.cwd(), 'output'), { recursive: true });
  const root = await fs.mkdtemp(path.join(process.cwd(), 'output', 'test-audio-artifact-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'web'));
  await fs.writeFile(path.join(root, 'media-profiles.js'), `media${suffix}`);
  await fs.writeFile(path.join(root, 'config.js'), `config${suffix}`);
  await fs.writeFile(path.join(root, 'web/runtime.js'), `runtime${suffix}`);
  await fs.writeFile(path.join(root, 'web/site-adapter.js'), `adapter${suffix}`);
  await fs.writeFile(path.join(root, 'web/audio.js'), `audio${suffix}`);
  await fs.writeFile(path.join(root, 'web/player.js'), `player${suffix}`);
  return root;
}

test('audio quality arguments select an artifact root and a safe fixed report label', async () => {
  const { parseAudioQualityArgs } = await load();
  const parsed = parseAudioQualityArgs(['--chrome', '--root', 'dist', '--label', 'root-dist'], 'C:/repo');
  assert.equal(parsed.chrome, true);
  assert.equal(parsed.root, path.resolve('C:/repo', 'dist'));
  assert.equal(parsed.label, 'root-dist');
  assert.throws(() => parseAudioQualityArgs(['--label', '../escape'], 'C:/repo'), /audio-label-invalid/);
  assert.throws(() => parseAudioQualityArgs(['--root'], 'C:/repo'), /audio-root-missing/);
  assert.throws(() => parseAudioQualityArgs(['--unknown'], 'C:/repo'), /audio-argument-invalid/);
});

test('audio quality CLI rejects unknown arguments before starting browser work', () => {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts/check-audio-quality.mjs'), '--unknown'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 15000
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /audio-argument-invalid/);
});

test('audio CLI selects the strict normal alias without a wrapper', async () => {
  const source = await fs.readFile('scripts/check-audio-quality.mjs', 'utf8');
  assert.match(source, /import \{audioQualityReportFailures as audioQualityFailures\} from '\.\/audio-metrics\.mjs';/);
  assert.match(source, /audioQualityFailures\(report\)/);
});

test('artifact description hashes every production audio entry file', async t => {
  const { AUDIO_ARTIFACT_FILES, describeAudioArtifact } = await load();
  const root = await artifactFixture(t);
  const description = await describeAudioArtifact(root, 'fixture');
  assert.equal(description.label, 'fixture');
  assert.equal(description.files.length, 6);
  assert.deepEqual(description.files.map(item => item.path), AUDIO_ARTIFACT_FILES);
  assert.ok(description.files.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
});

test('artifact comparison rejects file drift and any numeric quality failure', async t => {
  const { compareAudioArtifactReports, describeAudioArtifact } = await load();
  const source = await describeAudioArtifact(await artifactFixture(t), 'source');
  const same = await describeAudioArtifact(await artifactFixture(t), 'candidate');
  const changed = await describeAudioArtifact(await artifactFixture(t, '-changed'), 'root-dist');
  assert.deepEqual(compareAudioArtifactReports([
    { artifact: source, qualityFailures: [] },
    { artifact: same, qualityFailures: [] }
  ]), []);
  const failures = compareAudioArtifactReports([
    { artifact: source, qualityFailures: [] },
    { artifact: changed, qualityFailures: ['stress-channel-0/peak=1.1'] }
  ]);
  assert.ok(failures.includes('root-dist/quality/stress-channel-0/peak=1.1'));
  assert.ok(failures.some(value => value.startsWith('root-dist/hash/')));
});

test('artifact comparison permits floating noise but rejects meaningful numeric drift', async t => {
  const { compareAudioArtifactReports, describeAudioArtifact } = await load();
  const source = await describeAudioArtifact(await artifactFixture(t), 'source');
  const candidate = await describeAudioArtifact(await artifactFixture(t), 'candidate');
  const report = (artifact, peak) => ({
    artifact, qualityFailures: [], nodes: { sources: 1, sampleRate: 48000 },
    cases: [{ frequency: 1000, enabled: true, channels: [{ peak, rms: 0.25 }] }],
    transitions: [], alignments: [], stress: { channels: [{ peak: 0.98 }] }
  });
  assert.deepEqual(compareAudioArtifactReports([
    report(source, 0.5), report(candidate, 0.5000000001)
  ]), []);
  assert.ok(compareAudioArtifactReports([
    report(source, 0.5), report(candidate, 0.51)
  ]).includes('candidate/numeric/cases[0].channels[0].peak'));
});

test('artifact comparison excludes timing-sensitive diagnostics while retaining raw reports', async t => {
  const { compareAudioArtifactReports, describeAudioArtifact } = await load();
  const source = await describeAudioArtifact(await artifactFixture(t), 'source');
  const candidate = await describeAudioArtifact(await artifactFixture(t), 'candidate');
  const report = (artifact, mean, thdnPercent) => ({
    artifact, qualityFailures: [], nodes: { sources: 1, sampleRate: 48000 },
    cases: [{ frequency: 1000, inputAmplitude: 0.5, gain: 1, enabled: true, stereo: 'identical', bursts: false,
      channels: [{ mean, rms: 0.25, rmsDbfs: -12, peak: 0.5, thdPercent: 0.01, thdnPercent, overFullScaleSamples: 0, maxAdjacentStep: 0.1 }] }],
    transitions: [], alignments: [], stress: { channels: [{ rms: 0.4, peak: 0.98, overFullScaleSamples: 0 }] }
  });
  assert.deepEqual(compareAudioArtifactReports([
    report(source, 0.001, 0.02), report(candidate, -0.004, 0.08)
  ]), []);
});

test('일반 CI 플래그는 정확히 첫 인자와 label 한 쌍에서만 활성화된다',async()=>{
  const source=(await fs.readFile('scripts/check-audio-quality.mjs','utf8')).replaceAll('\r\n','\n');
  const start=source.indexOf('const argv=process.argv.slice(2);'),end=source.indexOf('const {chromium}',start);
  assert.ok(start>0&&end>start);
  const parse=new Function('process','parseAudioQualityArgs','repositoryRoot',source.slice(start,end)+'return {ciWorkletSigned,options};');
  const {parseAudioQualityArgs}=await load();
  const run=(...argv)=>parse({argv:['node','runner',...argv]},parseAudioQualityArgs,process.cwd());
  assert.equal(run('--ci-worklet-signed','--label','probe-u1').ciWorkletSigned,true);
  assert.equal(run('--label','probe-u1').ciWorkletSigned,false);
  for(const argv of [['--label','probe-u1','--ci-worklet-signed'],['--ci-worklet-signed','--chrome','--label','probe-u1'],
    ['--ci-worklet-signed','--label','--chrome'],['--ci-worklet-signed','--label','one','--label','two']])assert.throws(()=>run(...argv));
});
