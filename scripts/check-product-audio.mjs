import {audioInputs, assertLiveAudioSource} from './audio-verification-contract.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {addAbortListener} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {openOwnedRoot} from './owned-files.mjs';
import {verifyCandidate} from './verify-candidate.mjs';
import {runInstalledExtensionE2E,expectedCurrentAudioFiles,audioCandidateInventory} from './check-installed-extension.mjs';
import {attestL1Source,l1OwnedCloser} from './extension-e2e/audio-l1.mjs';
import {isGain4JobCase,launchVisibilityBrowser,requiresR3PrelaunchCollisionCheck} from './extension-e2e/visibility-browser.mjs';
import {isRunJobRetirement,isRunJobShutdown,verifyRunJobHelper} from './extension-e2e/run-job.mjs';
import {closeInstalledMediaBrowser,openMediaBrowserSession,verifyBrowserCandidate} from './extension-e2e/harness.mjs';
import {refreshTransitionWorker} from './extension-e2e/transition-preparation.mjs';
import {audioOperation,nativeFailureDetails} from './audio-native-browser.mjs';
import {parseProductAudioArgs,selectProductCase,PRODUCT_TRANSITION_CASES,PRODUCT_OUTPUT_CONTROL_CASES,PRODUCT_DRY_CASES,PRODUCT_EXTREME_CASES,assessProductOutputControl,assessProductExtreme,productSignalFailures,productInputFailures,productOutputFailures,productTransitionTargetFailures,assessProductTransitions,productLifecycleFailures,runProductAudioScenario,runProductEqualizerScenario,runProductNormalizerScenario,runProductNormalizerControlScenario,runProductReentryScenario,createProductArchive,assessMasterComplementary,createMasterEvidenceFiles,verifyMasterStoredCost} from './extension-e2e/audio-product.mjs';
import {selectEqualizerCase,isColdEqualizerCase,selectEqualizerTarget,assertEqualizerBaseline,assertEqualizerRequest,assertEqualizerReadback,assessPackagedEqualizer,equalizerSignalFailures} from './extension-e2e/audio-equalizer.mjs';

import {PACKAGED_REENTRY_CASES,verifyReentryRun,verifySavedReentry} from './extension-e2e/audio-reentry.mjs';
import {PACKAGED_NORMALIZER_CASES,selectNormalizerTarget,assessPackagedNormalizer,fftBufferPairBytes} from './audio-l1-normalizer-oracle.mjs';
import {SOURCE_OWNER_CASES,SOURCE_PENDING_OFF_CASES,SOURCE_SUSPEND_REBIND_CASES,SOURCE_OFF_STAGE_CASES,SOURCE_HISTORY_CASES,SOURCE_WET_HISTORY_CASES,SOURCE_EXTREME_HISTORY_CASES,runProductSourceOwnerScenario,verifySourceOwnerEvidence} from './extension-e2e/audio-source-owner.mjs';
import {NORMALIZER_CONTROL_CASES,assessPackagedNormalizerControl} from './extension-e2e/audio-normalizer-control.mjs';
import {WARMUP_CASE,warmupArtifact,readWarmupExport,diagnoseWarmupFailure} from './extension-e2e/audio-warmup-diagnostic.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=[...audioInputs,'scripts/audio-normalizer-signal-source.mjs','tests/f01-product-normalizer-signal.test.cjs','scripts/extension-e2e/audio-normalizer-control.mjs','tests/f01-product-normalizer-control.test.cjs','scripts/audio-source-owner-probe.mjs','scripts/extension-e2e/audio-source-owner.mjs','tests/f01-product-source-owner.test.cjs','tests/f01-pending-source-owner.test.cjs','tests/f01-suspend-rebind-source-owner.test.cjs','tests/f01-suspend-rebind-controller.test.cjs','tests/f01-off-stages-worklet.test.cjs','tests/f01-off-stages-source-owner.test.cjs','tests/f01-off-stages-controller.test.cjs','tests/f01-off-stages-dispatch.test.cjs','tests/f01-off-stages-probe.test.cjs',...['contracts','controller','curve','entry','eq','normalizer','transition','transition-worklet'].map(name=>'src/main/features/audio/'+name+'.ts'),
  'scripts/check-product-audio.mjs','scripts/extension-e2e/audio-product.mjs','scripts/extension-e2e/audio-warmup-diagnostic.mjs','scripts/extension-e2e/audio-equalizer.mjs','scripts/audio-l1-processing-metrics.mjs','scripts/audio-l1-normalizer-oracle.mjs','tests/f01-product-normalizer.test.cjs','scripts/extension-e2e/audio-reentry.mjs','tests/f01-product-reentry.test.cjs','scripts/audio-processing-probe.mjs','scripts/audio-processing-metrics.mjs','scripts/audio-signal.mjs','tests/fixtures/f01-audio-processing.json','tests/f01-product-equalizer.test.cjs',
  'scripts/audio-native-browser.mjs','scripts/extension-e2e/visibility-browser.mjs','tests/visibility-browser.test.cjs','tests/f01-product-native.test.cjs','tests/f01-product-rates.test.cjs','tests/f01-product-probe.test.cjs','tests/f01-product-dynamics.test.cjs','tests/f01-product-latch.test.cjs','tests/fixtures/f01-current-runtime-executable.json','tests/fixtures/installed-extension/audio-live.html','extension/web/audio-transition-worklet.js'];
const sha=data=>createHash('sha256').update(data).digest('hex');

async function restoreProductArchive(report,retained,rate,componentWitness,kind,check){
  const observation=report.facts?.productObservation,artifactError=code=>Error('audio-product-'+kind+'-'+code);
  const master=report.masterWitnessRequested===true,finalMaster=report.facts?.masterWitness;
  if(master&&(!['transition','750'].includes(kind)||!Object.hasOwn(report,'masterComplementary')||finalMaster?.schema!=='f01-master-binding-v1'||finalMaster.available!==true||finalMaster.reason!==null||finalMaster.pending!==0||finalMaster.sealed!==true||!Number.isSafeInteger(finalMaster.cursor)||finalMaster.cursor<0||!Number.isSafeInteger(finalMaster.endFrame)||finalMaster.endFrame!==report.archive.end))throw artifactError('master-final');
  const count=componentWitness?4:3,archive=createProductArchive({writeFile:async()=>{}},'memory-only-product-replay',rate,kind==='extreme'?'extreme':kind==='dry'?'dry':kind==='wet-peak'?'wet-peak':kind==='normalizer-control'?'normalizer-control':componentWitness?'equalizer-component':'legacy'),used=new Set();let last=null,controlEventCount=0,commandCount=0,replyCount=0,ledgerEventCount=0,ledgerBytes=0;
  let masterCursor=0,masterSealed=false;
  const metadata=report.archive.artifacts.filter(row=>row.kind==='metadata');
  if(metadata.length!==report.archive.segments||metadata.length*(count+1)!==retained.size)throw artifactError('segments');
  for(const entry of metadata){
    check?.();
    const bytes=retained.get(entry.file);if(bytes.length>1048576)throw artifactError('metadata');
    const raw=JSON.parse(bytes.toString('utf8'));if(raw.start!==entry.start||raw.end!==entry.end||!Array.isArray(raw.streams)||raw.streams.length!==count)throw artifactError('segment');
    if(kind==='transition'||kind==='wet-peak'||kind==='dry'||kind==='extreme'||master){
      if(!Array.isArray(raw.commands)||!Array.isArray(raw.replies)||raw.commands.length<commandCount||raw.replies.length<replyCount||!isDeepStrictEqual(raw.commands,observation.commands.slice(0,raw.commands.length))||!isDeepStrictEqual(raw.replies,observation.replies.slice(0,raw.replies.length)))throw artifactError('ledger-prefix');
      commandCount=raw.commands.length;replyCount=raw.replies.length;
    }
    if(master){
      const ref=raw.masterWitness;
      if(!ref||Object.keys(ref).sort().join(',')!=='available,contextId,cursor,endFrame,initial,nodeId,pending,portId,reason,schema,sealed,sourceEpoch'||ref.schema!==finalMaster.schema||ref.available!==true||ref.reason!==null||ref.sourceEpoch!==finalMaster.initial?.sourceEpoch||ref.initial!==finalMaster.initial?.initial||ref.contextId!==finalMaster.initial?.contextId||ref.portId!==finalMaster.initial?.portId||ref.nodeId!==finalMaster.initial?.nodeId||!Number.isSafeInteger(ref.cursor)||ref.cursor<masterCursor||ref.cursor>finalMaster.cursor||ref.pending!==0||typeof ref.sealed!=='boolean'||masterSealed&&!ref.sealed||ref.sealed&&ref.endFrame!==finalMaster.endFrame||!ref.sealed&&ref.endFrame!==null||raw.end>finalMaster.endFrame)throw artifactError('master-prefix');
      masterCursor=ref.cursor;masterSealed=ref.sealed;
    }
    if(kind==='normalizer-headroom'||kind==='extreme'){
      const e=raw.oracleEvidence,final=report.facts?.oracleEvidence,l=e?.ledger;
      if(e?.schema!=='f01-oracle-evidence-v3'||e.initial?.headroomWitness!==true||!isDeepStrictEqual(e.initial,final?.initial)||l?.schema!=='f01-control-ledger-v3'||l.available!==true||l.reason!==null||l.maxEvents!==4128||l.maxBytes!==1048576||!Number.isSafeInteger(l.eventCount)||l.eventCount<ledgerEventCount||l.eventCount>final?.ledger?.eventCount||!Number.isSafeInteger(l.bytes)||l.bytes<ledgerBytes||l.bytes>final?.ledger?.bytes)throw artifactError('ledger-prefix');
      ledgerEventCount=l.eventCount;ledgerBytes=l.bytes;
    }
    if(kind==='normalizer-control'){
      if(report.spec?.id==='44100/normalizer-control/tone-silence'){
        const f=report.facts;
        if(!f.normalizerControl?.frozenAt||!isDeepStrictEqual(raw.recordingCutoff,f.normalizerControl.frozenAt)||raw.audioTime!==f.audioTime||raw.mediaTime!==f.video.currentTime||!isDeepStrictEqual(raw.readback,f.readback)||raw.hidden!==f.hidden||raw.contextState!==f.contextState)throw artifactError('recording-cutoff');
      }
      const prefix=raw.normalizerControlEvents,events=report.facts?.normalizerControl?.events;
      if(!Array.isArray(prefix)||!Array.isArray(events)||prefix.length<controlEventCount||prefix.length>events.length||!isDeepStrictEqual(prefix,events.slice(0,prefix.length)))throw artifactError('event-prefix');
      controlEventCount=prefix.length;
    }
    const streams=raw.streams.map((row,index)=>{
      if(row.file!==entry.file.replace(/\.json$/,`-stream-${index}.f32le`)||componentWitness&&row.role!==['program','source','control','component'][index])throw artifactError('stream-role');
      const item=report.archive.artifacts.find(item=>item.file===row.file),data=retained.get(row.file);
      if(!data||used.has(row.file)||!isDeepStrictEqual(row,item))throw artifactError('stream');used.add(row.file);
      return {start:row.start,end:row.end,channels:row.channels,encoding:'interleaved-float32le',base64:data.toString('base64'),...(componentWitness?{role:row.role}:{})};
    });
    await archive.append({...raw,streams});check?.();last=raw;
  }
  const coverage=archive.summary();
  if(master&&masterCursor!==finalMaster.cursor)throw artifactError('master-final-prefix');
  if(used.size!==metadata.length*count||coverage.start!==report.archive.start||coverage.end!==report.archive.end||coverage.bytes!==report.archive.bytes||
    !isDeepStrictEqual(last?.commands,observation.commands)||!isDeepStrictEqual(last?.replies,observation.replies)||last?.sources!==observation.sources||last?.l1Nodes!==observation.l1Nodes||last?.streamError!==observation.streamError||last?.invalidFrames!==observation.invalidFrames||kind==='reentry'&&!isDeepStrictEqual(last?.rapidMasterRequest,observation.rapidMasterRequest))throw artifactError('coverage');
  return archive;
}

/** Replay the retained representation through the same original assessor; metadata alone is insufficient. */
async function verifyOutputControlEvidence(files,artifact,report,retained,spec){
  const dry=PRODUCT_DRY_CASES.includes(spec),extreme=PRODUCT_EXTREME_CASES.includes(spec),profile=extreme?'extreme':dry?'dry':'wet-peak';
  if(!isDeepStrictEqual(report.spec,spec)||report.qualityAssessed!==true||report.outcome!=='PASS'||report.archive.profile!==profile||report.archive.reservedBytes!==spec.sampleRate*8+(extreme?2*fftBufferPairBytes(spec.sampleRate):0)||extreme&&(report.native3Witness!=='UNASSESSED'||!isDeepStrictEqual(report.archive.pendingWrites,[])||report.archive.sealed!==false)||report.native7Witness!=='UNASSESSED'||report.native8Witness!=='UNASSESSED'||report.overallQualification!==false||!isDeepStrictEqual(report.failures,[])||!isDeepStrictEqual(report.pageErrors,[]))throw Error('audio-product-'+profile+'-report');
  const stat=await files.lstat(artifact+'/'+profile+'-target.json');if(!stat?.isFile()||stat.size>1048576)throw Error('audio-product-'+profile+'-proof');
  const proof=JSON.parse(await files.readFile(artifact+'/'+profile+'-target.json','utf8'));
  if(proof.capture?.file!==artifact+'/'+profile+'-capture.f32le'||proof.capture.writeStatus!=='completed'||proof.capture.bytes!==spec.sampleRate*8||report.extraEvidenceBytes!==proof.capture.bytes+(extreme?fftBufferPairBytes(spec.sampleRate):0)||report.archive.bytes+proof.capture.bytes>96*1024*1024||!isDeepStrictEqual(proof.measurement,report.measurement))throw Error('audio-product-'+profile+'-capture');
  const captureStat=await files.lstat(proof.capture.file);if(!captureStat?.isFile()||captureStat.size!==proof.capture.bytes)throw Error('audio-product-'+profile+'-capture');
  const capture=await files.readFile(proof.capture.file);if(capture.length!==proof.capture.bytes||sha(capture)!==proof.capture.sha256)throw Error('audio-product-'+profile+'-capture');
  let fftBytes;
  if(extreme){const row=proof.fftBuffer,size=fftBufferPairBytes(spec.sampleRate);if(row?.file!==artifact+'/extreme-fft-buffer.f32le'||row.writeStatus!=='completed'||row.bytes!==size||report.archive.bytes+report.extraEvidenceBytes>96*1024*1024)throw Error('audio-product-fft-buffer-proof');const stat=await files.lstat(row.file);if(!stat?.isFile()||stat.size!==size)throw Error('audio-product-fft-buffer-file');fftBytes=await files.readFile(row.file);if(fftBytes.length!==size||sha(fftBytes)!==row.sha256)throw Error('audio-product-fft-buffer-file');}
  const archive=await restoreProductArchive(report,retained,spec.sampleRate,false,profile),measured=JSON.parse(JSON.stringify(extreme?assessProductExtreme(archive,report.facts,proof,spec,fftBytes):assessProductOutputControl(archive,report.facts,proof,spec)));
  if(!measured.passed||!measured.qualityAssessed||!isDeepStrictEqual(measured,report[extreme?'extreme':dry?'dry':'wetPeak']))throw Error('audio-product-'+profile+'-assessment');
  const fetched=await files.readFile(artifact+'/module-resource.fetched.js'),expected=await files.readFile('extension/web/audio-transition-worklet.js');
  if(!report.module?.loaded||report.module.expectedSha256!==sha(expected)||report.module.fetchedSha256!==sha(fetched)||sha(expected)!==sha(fetched)||!report.facts.productObservation.moduleLoads.includes(report.module.url))throw Error('audio-product-'+profile+'-module');
}

async function verifyTransitionEvidence(files,artifact,report,retained,spec,check){
  if(!isDeepStrictEqual(report.spec,spec)||report.qualityAssessed!==true||report.outcome!=='PASS'||report.archive.profile!==undefined||report.nativeComplementaryWitness!=='UNASSESSED'||report.overallQualification!==false||!isDeepStrictEqual(report.failures,[])||!isDeepStrictEqual(report.pageErrors,[])||report.facts?.readback?.state!=='on'||report.facts.readback.sources!==1||report.facts.readback.wanted!==true||report.facts.readback.appliedGain!==1||productTransitionTargetFailures(report,spec).length)throw Error('audio-product-transition-target');
  const archive=await restoreProductArchive(report,retained,spec.sampleRate,false,'transition',check);
  const transitions=JSON.parse(JSON.stringify(assessProductTransitions(archive,report.actions)));
  if(productInputFailures(archive,report.actions,spec.frequency).length||productOutputFailures(archive).length||transitions.some(row=>row.failures.length)||!isDeepStrictEqual(transitions,report.transitions))throw Error('audio-product-transition-assessment');
  if(report.masterWitnessRequested===true){check?.();const measured=JSON.parse(JSON.stringify(assessMasterComplementary(archive,report,{check})));check?.();if(measured.status!=='CALL_MODEL_MATCH'||!isDeepStrictEqual(measured,report.masterComplementary))throw Error('audio-product-transition-master-assessment');}
  else if(Object.hasOwn(report,'masterComplementary'))throw Error('audio-product-transition-master-profile');
  const fetched=await files.readFile(artifact+'/module-resource.fetched.js'),expected=await files.readFile('extension/web/audio-transition-worklet.js');
  if(!report.module?.loaded||report.module.expectedSha256!==sha(expected)||report.module.fetchedSha256!==sha(fetched)||sha(expected)!==sha(fetched)||!report.facts.productObservation.moduleLoads.includes(report.module.url))throw Error('audio-product-transition-module');
}

async function verify750Evidence(files,artifact,report,retained,check){
  const rate=report.archive.sampleRate,names=['eq-on','eq-off','compressor-on','compressor-off','normalizer-on','normalizer-off','master-off','master-on'];
  if(report.archive.profile!==undefined||!isDeepStrictEqual(report.failures,[])||!isDeepStrictEqual(report.pageErrors,[])||report.facts?.readback?.state!=='on'||report.facts.readback.sources!==1||report.facts.readback.wanted!==true||report.facts.readback.appliedGain!==1||
    !Array.isArray(report.actions)||!isDeepStrictEqual(report.actions.map(a=>a?.name),names)||!Array.isArray(report.checkpoints)||!isDeepStrictEqual(report.checkpoints.map(c=>c?.name),['cold750-zero-on',...names])||report.actions.some((a,i)=>a.frame!==report.checkpoints[i+1]?.request?.frame))throw Error('audio-product-750-target');
  // The default producer has no transition-spec/config gate; replay its original live contract.
  const archive=await restoreProductArchive(report,retained,rate,false,'750',check);check();
  const transitions=JSON.parse(JSON.stringify(assessProductTransitions(archive,report.actions)));
  if(productLifecycleFailures(report.facts.productObservation,archive.summary().end).length||productInputFailures(archive,report.actions).length||productOutputFailures(archive).length||transitions.some(row=>row.failures.length)||!isDeepStrictEqual(transitions,report.transitions))throw Error('audio-product-750-assessment');
  if(report.masterWitnessRequested===true){check();const measured=JSON.parse(JSON.stringify(assessMasterComplementary(archive,report,{check})));check();if(measured.status!=='CALL_MODEL_MATCH'||!isDeepStrictEqual(measured,report.masterComplementary))throw Error('audio-product-750-master-assessment');}
  else if(Object.hasOwn(report,'masterComplementary'))throw Error('audio-product-750-master-profile');
  check();const fetched=await files.readFile(artifact+'/module-resource.fetched.js');check();const expected=await files.readFile('extension/web/audio-transition-worklet.js');check();
  if(!report.module?.loaded||report.module.expectedSha256!==sha(expected)||report.module.fetchedSha256!==sha(fetched)||sha(expected)!==sha(fetched)||!report.facts.productObservation.moduleLoads.includes(report.module.url))throw Error('audio-product-750-module');check();
}

async function verifyEqualizerEvidence(files,artifact,report,retained,spec,componentWitness,check){
  check?.();
  if(report.qualityAssessed!==true||report.outcome!=='PASS')throw Error('audio-product-equalizer-assessment');
  if((report.componentWitness===true)!==componentWitness||report.archive.profile!==(componentWitness?'equalizer-component':undefined))throw Error('audio-product-equalizer-profile');
  const proofPath=artifact+'/equalizer-target.json',proofStat=await files.lstat(proofPath);check?.();
  if(!proofStat?.isFile()||proofStat.size>1048576)throw Error('audio-product-equalizer-proof');
  const proof=JSON.parse(await files.readFile(proofPath,'utf8')),observation=report.facts?.productObservation;check?.();
  if(!isDeepStrictEqual(report.spec,spec)||!isDeepStrictEqual(proof.spec,spec))throw Error('audio-product-equalizer-spec');
  if(equalizerSignalFailures(report.facts,spec).length||equalizerSignalFailures(proof.beforeTarget,spec).length)throw Error('audio-product-equalizer-signal');
  assertEqualizerBaseline(proof.beforeTarget,spec,componentWitness);assertEqualizerRequest(proof.beforeTarget,proof.request,spec);assertEqualizerReadback(report.facts,spec);
  const cursor=proof.beforeTarget.productObservation?.commands?.length;
  const bound=selectEqualizerTarget(observation,cursor,proof.request?.frame,spec);
  if(!bound||!isDeepStrictEqual(bound,proof.target)||!isDeepStrictEqual(bound,report.target)||!isDeepStrictEqual(observation.commands.slice(0,cursor),proof.beforeTarget.productObservation.commands)||
    (spec.masterGain!==1||isColdEqualizerCase(spec))&&!isDeepStrictEqual(observation.replies.slice(0,proof.beforeTarget.productObservation.replies.length),proof.beforeTarget.productObservation.replies))throw Error('audio-product-equalizer-target');
  check?.();
  const archive=await restoreProductArchive(report,retained,spec.sampleRate,componentWitness,'equalizer',check);check?.();
  const measured=JSON.parse(JSON.stringify(assessPackagedEqualizer(archive,report.facts,bound,spec,componentWitness)));check?.();
  if(!measured.originalOutputGatesPassed||componentWitness&&measured.componentWitnessPassed!==true||measured.native8ComponentWitness!=='UNASSESSED'||measured.overallQualification!==false||!isDeepStrictEqual(measured,report.equalizer))throw Error('audio-product-equalizer-assessment');
  const fetched=await files.readFile(artifact+'/module-resource.fetched.js'),expected=await files.readFile('extension/web/audio-transition-worklet.js');check?.();
  if(!report.module?.loaded||report.module.expectedSha256!==sha(expected)||report.module.fetchedSha256!==sha(fetched)||sha(expected)!==sha(fetched)||!observation.moduleLoads.includes(report.module.url))throw Error('audio-product-equalizer-module');
  check?.();
}

async function verifyNormalizerEvidence(files,artifact,report,retained,spec,headroomWitness=false){
  if(report.qualityAssessed!==true||report.outcome!=='PASS'||report.archive.profile!==undefined||!isDeepStrictEqual(report.spec,spec))throw Error('audio-product-normalizer-assessment');
  const proofFile=artifact+'/normalizer-target.json',stat=await files.lstat(proofFile);if(!stat?.isFile()||stat.size>1048576)throw Error('audio-product-normalizer-proof');
  const proof=JSON.parse(await files.readFile(proofFile,'utf8'));
  if(!isDeepStrictEqual(proof.spec,spec)||!isDeepStrictEqual(proof.target,report.target)||!isDeepStrictEqual(proof.measurement,report.measurement))throw Error('audio-product-normalizer-proof');
  const target=selectNormalizerTarget(report.facts,proof.beforeTarget,proof.request,spec,headroomWitness);if(!target||!isDeepStrictEqual(target,proof.target))throw Error('audio-product-normalizer-target');
  const archive=await restoreProductArchive(report,retained,spec.sampleRate,false,headroomWitness?'normalizer-headroom':'normalizer'),measured=JSON.parse(JSON.stringify(assessPackagedNormalizer(archive,report.facts,proof,spec,headroomWitness)));
  if(!measured.passed||measured.native7Witness!=='UNASSESSED'||measured.overallQualification!==false||!isDeepStrictEqual(measured,report.normalizer))throw Error('audio-product-normalizer-assessment');
  const fetched=await files.readFile(artifact+'/module-resource.fetched.js'),expected=await files.readFile('extension/web/audio-transition-worklet.js');
  if(!report.module?.loaded||report.module.expectedSha256!==sha(expected)||report.module.fetchedSha256!==sha(fetched)||sha(expected)!==sha(fetched)||!report.facts.productObservation.moduleLoads.includes(report.module.url))throw Error('audio-product-normalizer-module');
}

async function verifyNormalizerControlEvidence(files,artifact,report,retained,spec){
  if(report.qualityAssessed!==false||report.controlAssessed!==true||report.outcome!=='PASS'||report.archive.profile!=='normalizer-control'||!isDeepStrictEqual(report.archive.pendingWrites,[])||!isDeepStrictEqual(report.spec,spec))throw Error('audio-product-normalizer-control-assessment');
  await replayNormalizerControl(files,artifact,report,retained,spec,true);
}

async function replayNormalizerControl(files,artifact,report,retained,spec,expectedPassed,targetSha256){
  const file=artifact+'/normalizer-control-target.json',stat=await files.lstat(file);if(!stat?.isFile()||stat.size>1048576)throw Error('audio-product-normalizer-control-proof');
  const bytes=await files.readFile(file);
  if(targetSha256!==undefined&&sha(bytes)!==targetSha256)throw Error('audio-product-normalizer-control-proof');
  const proof=JSON.parse(bytes);
  if(!isDeepStrictEqual(proof.spec,spec)||!isDeepStrictEqual(proof.target,report.target)||!isDeepStrictEqual(proof.measurement,report.measurement))throw Error('audio-product-normalizer-control-proof');
  const archive=await restoreProductArchive(report,retained,spec.sampleRate,false,'normalizer-control'),measured=JSON.parse(JSON.stringify(assessPackagedNormalizerControl(archive,report.facts,proof,spec)));
  if(measured.passed!==expectedPassed||measured.overallQualification!==false||!isDeepStrictEqual(measured,report.control))throw Error('audio-product-normalizer-control-assessment');
  const fetched=await files.readFile(artifact+'/module-resource.fetched.js'),expected=await files.readFile('extension/web/audio-transition-worklet.js');
  if(!report.module?.loaded||report.module.expectedSha256!==sha(expected)||report.module.fetchedSha256!==sha(fetched)||sha(expected)!==sha(fetched)||!report.facts.productObservation.moduleLoads.includes(report.module.url))throw Error('audio-product-normalizer-control-module');
  return {archive,measured};
}

async function readProductSegments(files,artifact,archive,sampleRate,caseId,check){
  const retained=new Map();
  if(!caseId){
    if(!Number.isSafeInteger(archive.segments)||archive.artifacts.length!==archive.segments*4)throw Error('audio-product-artifact-path');
    let pcmBytes=0;
    for(let i=0;i<archive.artifacts.length;i++){
      const row=archive.artifacts[i],stream=i%4,metadata=stream===3,name=artifact+'/segment-'+String(Math.floor(i/4)).padStart(4,'0')+(metadata?'.json':'-stream-'+stream+'.f32le');
      if(row.file!==name||(row.kind==='metadata')!==metadata||!Number.isSafeInteger(row.bytes)||row.bytes<=0||row.bytes>(metadata?1048576:sampleRate*1.5*5*4))throw Error('audio-product-artifact-path');
      if(!metadata)pcmBytes+=row.bytes;
    }
    if(pcmBytes!==archive.bytes||pcmBytes>96*1024*1024)throw Error('audio-product-artifact-path');
  }
  for(const row of archive.artifacts){
    check?.();
    if(typeof row.file!=='string'||!row.file.startsWith(artifact+'/segment-')||retained.has(row.file)||row.bytes>(row.kind==='metadata'?1048576:sampleRate*1.5*5*4))throw Error('audio-product-artifact-path');
    if(!caseId){const stat=await files.lstat(row.file);check();if(!stat?.isFile()||stat.size!==row.bytes)throw Error('audio-product-artifact-changed');}
    const bytes=await files.readFile(row.file);check?.();
    if(bytes.length!==row.bytes||sha(bytes)!==row.sha256)throw Error('audio-product-artifact-changed');
    retained.set(row.file,bytes);
  }
  return retained;
}

async function replayToneSilenceCloseFailure(files,artifact,closeReport,spec,prelaunch,browserBefore,browserAfter){
  const report=closeReport.audioProduct;
  const archive=report?.archive,cap=96*1024*1024;
  if(report?.schema!=='f01-product-normalizer-control-observation-v1'||report.scope!==spec.id||report.passed!==true||
    !isDeepStrictEqual(report.spec,spec)||!isDeepStrictEqual(report.pageErrors,[])||!isDeepStrictEqual(archive?.pendingWrites,[])||!report.facts?.normalizerControl?.frozenAt||
    archive.sampleRate!==spec.sampleRate||!Number.isSafeInteger(archive.bytes)||archive.bytes<=0||archive.bytes>cap||
    !Array.isArray(archive.artifacts)||archive.artifacts.length<4||archive.artifacts.length>4096)throw Error('audio-product-close-replay-incomplete');
  const boundRecords=[['summary.json',closeReport,4*1048576],['before.json',prelaunch,1048576],
    ['browser-candidate-before.json',browserBefore,1048576],['browser-candidate-after.json',browserAfter,1048576],['assessment.json',report,4*1048576]];
  const limits=new Map([[artifact+'/normalizer-control-target.json',1048576],
    [artifact+'/module-resource.fetched.js',1048576],['extension/web/audio-transition-worklet.js',1048576]]);
  for(const [name,,limit] of boundRecords)limits.set(artifact+'/'+name,limit);
  for(const row of archive.artifacts){
    if(typeof row.file!=='string'||!row.file.startsWith(artifact+'/segment-')||limits.has(row.file)||
      !Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>(row.kind==='metadata'?1048576:spec.sampleRate*1.5*5*4))throw Error('audio-product-artifact-path');
    limits.set(row.file,row.bytes);
  }
  const controller=new AbortController(),{files:bounded,check}=boundedReplayFiles(files,limits,controller.signal,'close');
  try{
    await audioOperation('tone-silence-close-replay',async()=>{
      const trace=await bounded.lstat(artifact+'/trace.zip');
      if(!trace?.isFile()||trace.size<1)throw Error('audio-product-disk-evidence');
      for(const [name,expected] of boundRecords)
        if(!isDeepStrictEqual(JSON.parse(await bounded.readFile(artifact+'/'+name,'utf8')),expected))throw Error('audio-product-close-replay-binding');
      const retained=await readProductSegments(bounded,artifact,archive,spec.sampleRate,spec.id);
      await verifyNormalizerControlEvidence(bounded,artifact,report,retained,spec);
      check();
    },30000);
  }finally{controller.abort();}
}

function boundedReplayFiles(files,limits,signal,kind){
  const deadline=performance.now()+30000,cap=96*1024*1024,error=suffix=>Error('audio-product-'+kind+'-replay-'+suffix);
  let consumed=0;
  const check=()=>{if(signal.aborted||performance.now()>=deadline)throw error('timeout');};
  const bounded={lstat:async file=>{check();const stat=await files.lstat(file);check();return stat;},
    readFile:async(file,encoding)=>{
      const limit=limits.get(file),stat=await bounded.lstat(file);
      if(!limit||!stat?.isFile()||stat.size<1||stat.size>limit||consumed+stat.size>cap)throw error('file');
      const chunks=[];let size=0;
      for await(const chunk of files.readChunks(file,{signal})){
        check();size+=chunk.length;consumed+=chunk.length;
        if(size>stat.size||consumed>cap)throw error('file');
        chunks.push(chunk);
      }
      check();if(size!==stat.size)throw error('file');
      const bytes=Buffer.concat(chunks,size);return encoding?bytes.toString(encoding):bytes;
    }};
  return {files:bounded,check};
}

/** Read-only diagnosis of one original failed case. The seal digest comes from independent run custody. */
export async function replayWarmupFailure(files,selection){
  const controller=new AbortController(),spec=NORMALIZER_CONTROL_CASES.find(row=>row.id===WARMUP_CASE);
  const invalid=code=>{throw Error('audio-product-warmup-'+code);};
  try{
    const {runId,seal,sealSha256,candidateSha256}=selection??{},artifact=warmupArtifact(runId);
    if(!artifact||!Buffer.isBuffer(seal)||
      seal.length>1048576||sha(seal)!==sealSha256)invalid('seal');
    const {graph,completion}=JSON.parse(seal);
    if(graph?.runId!==runId||graph.caseId!==spec.id||graph.clock!=='native-frame'||graph.delayFrames!==264||graph.sourceStream!==1||
      graph.continuous!==true||!Array.isArray(graph.ports)||graph.ports.length!==3||new Set(graph.ports).size!==3||
      graph.ports.some(p=>typeof p!=='string'||!p)||!Array.isArray(graph.firstWrites)||graph.firstWrites.length!==2||
      graph.firstWrites.some(n=>!Number.isSafeInteger(n)||n<0||n%128!==0)||graph.candidateSha256!==candidateSha256||
      ![graph.assessmentSha256,graph.targetSha256,graph.candidateSha256].every(p=>typeof p==='string'&&/^[a-f0-9]{64}$/.test(p)))invalid('lineage');
    const limits=new Map([[artifact+'/assessment.json',4*1048576],[artifact+'/normalizer-control-target.json',1048576],
      [artifact+'/partial.json',8*1048576],
      [artifact+'/module-resource.fetched.js',1048576],['extension/web/audio-transition-worklet.js',1048576],[artifact+'/analyser-pcm.json',1048576]]);
    const {files:bounded,check}=boundedReplayFiles(files,limits,controller.signal,'warmup');
    return await audioOperation('warmup-replay',async()=>{
      const assessment=await bounded.readFile(artifact+'/assessment.json');
      if(sha(assessment)!==graph.assessmentSha256)invalid('assessment');
      const report=JSON.parse(assessment),{archive,facts}=report,proof=facts?.retainedAnalyserProof;
      if(report.schema!=='f01-product-normalizer-control-observation-v1'||report.scope!==spec.id||!isDeepStrictEqual(report.spec,spec)||
        report.passed!==false||report.outcome!=='FAIL'||report.qualityAssessed!==false||report.controlAssessed!==true||
        !report.failures?.includes('normalizer-control-fft-source')||!isDeepStrictEqual(report.pageErrors,[])||
        archive?.profile!=='normalizer-control'||archive.sampleRate!==44100||!isDeepStrictEqual(archive.pendingWrites,[])||
        !Number.isSafeInteger(archive.bytes)||archive.bytes<1||!Array.isArray(archive.artifacts)||archive.artifacts.length<4||
        archive.artifacts.length>4096||!Number.isSafeInteger(archive.segments)||archive.segments*4!==archive.artifacts.length||
        !proof||proof.cutoffFrame!==facts.normalizerControl?.frozenAt?.frame||graph.cutoffFrame!==proof.cutoffFrame||
        !Number.isSafeInteger(proof.rawRows)||proof.rawRows<2||proof.rawRows>402||archive.bytes+proof.rawRows*65536>96*1024*1024)invalid('assessment');
      for(const row of archive.artifacts){
        const name=row.file?.slice(artifact.length+1),bound=row.kind==='metadata'?1048576:44100*1.5*5*4;
        if(row.file!==artifact+'/'+name||!/^segment-[0-9]{4}(?:\.json|-stream-[0-2]\.f32le)$/.test(name)||limits.has(row.file)||
          !Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>bound)invalid('segment');
        limits.set(row.file,row.bytes);
      }
      for(let start=0;start<proof.rawRows;start+=16)limits.set(artifact+'/analyser-pcm-'+start+'.f32le',Math.min(16,proof.rawRows-start)*65536);
      const binding={runId,assessmentSha256:graph.assessmentSha256,targetSha256:graph.targetSha256};
      const partial=JSON.parse(await bounded.readFile(artifact+'/partial.json'));
      if(partial.error!=='Error: audio-product-control-or-observation-failed'||!completion||
        !isDeepStrictEqual(partial.warmupExport,completion))invalid('export-receipt');
      const raw=await readWarmupExport(bounded,artifact,binding,completion,proof);
      const retained=await readProductSegments(bounded,artifact,archive,spec.sampleRate,spec.id);
      const replay=await replayNormalizerControl(bounded,artifact,report,retained,spec,false,binding.targetSha256);
      const diagnostic=diagnoseWarmupFailure({report,...replay,proof,raw,graph});check();
      return diagnostic;
    },30000);
  }catch(error){
    const message=error?.message;
    return {state:'UNFORMED',reason:typeof message==='string'&&/^audio-product-warmup-[a-z-]+$/.test(message)?message:'audio-product-warmup-evidence'};
  }finally{controller.abort();}
}

async function verifyReentryEvidence(files,artifact,report,retained,spec,runId,source){
  if(report.qualityAssessed!==true||report.outcome!=='PASS'||report.archive.profile!==undefined||!isDeepStrictEqual(report.spec,spec))throw Error('audio-product-reentry-assessment');
  const file=artifact+'/reentry-target.json',stat=await files.lstat(file);if(!stat?.isFile()||stat.size>1048576)throw Error('audio-product-reentry-proof');
  const proof=JSON.parse(await files.readFile(file,'utf8'));
  const archive=await restoreProductArchive(report,retained,spec.sampleRate,false,'reentry');
  verifySavedReentry(archive,report,proof,spec,runId,source);
  const fetched=await files.readFile(artifact+'/module-resource.fetched.js'),expected=await files.readFile('extension/web/audio-transition-worklet.js');
  if(!report.module?.loaded||report.module.expectedSha256!==sha(expected)||report.module.fetchedSha256!==sha(fetched)||sha(expected)!==sha(fetched)||!report.facts.productObservation.moduleLoads.includes(report.module.url))throw Error('audio-product-reentry-module');
}

/** @typedef {{launchBy:number,abortBy:number,retireBy:number,saveBy:number,stopSignal?:AbortSignal,recordFirst?:(error:Error)=>void}} JobObservation */
/** @typedef {import('./extension-e2e/visibility-browser.mjs').RunJobHandoff} RunJobHandoff */
/** @typedef {{signal:AbortSignal, failure?:{reason:unknown}, listener?:ReturnType<typeof addAbortListener>}} LaunchStop */
/** @template T @param {()=>Promise<T>} work @param {number} end @param {string} failure @param {LaunchStop} [stop] */
export async function beforeDeadline(work,end,failure,stop){
  const check=()=>{if(stop?.failure)throw stop.failure.reason;if(performance.now()>=end)throw Error(failure);};
  let timer;
  try{
    const result=await new Promise((resolve,reject)=>{
      if(stop){
        const onStop=()=>{
          stop.failure={reason:performance.now()>=end?Error(failure):stop.signal.reason};
          reject(stop.failure.reason);
        };
        if(stop.signal.aborted){onStop();return;}
        stop.listener=addAbortListener(stop.signal,onStop);
      }
      const remaining=end-performance.now();
      if(remaining<=0){reject(Error(failure));return;}
      timer=setTimeout(()=>reject(Error(failure)),remaining);
      queueMicrotask(()=>{
        try{
          check();
          work().then(resolve,error=>reject(performance.now()>=end?Error(failure,{cause:error}):error));
        }catch(error){reject(error);}
      });
    });
    check();return result;
  }finally{clearTimeout(timer);}
}

/** @param {(control:{deadline:number,signal:AbortSignal,observeRunJobOwner:(value:RunJobHandoff)=>RunJobHandoff['abort']})=>Promise<any>} launch
 * @param {(value:any,control:{deadline:number,signal:AbortSignal})=>Promise<void>} recordLate @param {number} milliseconds @param {JobObservation} observation */
async function observeProductJobLaunch(launch,recordLate,milliseconds,observation){
  const start=performance.now(),{abortBy,retireBy,saveBy,stopSignal}=observation,launchBy=Math.min(observation.launchBy,start+milliseconds);
  const remaining=Math.floor(launchBy-start);
  if(![launchBy,abortBy,retireBy,saveBy].every(Number.isFinite)||remaining<1||launchBy>abortBy||abortBy+15000>retireBy||retireBy>=saveBy||saveBy-start>240000)throw Error('audio-product-job-observation-bound');
  const controller=new AbortController(),deadline=Date.now()+remaining;
  /** @type {LaunchStop|undefined} */const stop=stopSignal===undefined?undefined:{signal:stopSignal};
  /** @type {RunJobHandoff|undefined} */let owner;
  /** @type {Promise<unknown>|undefined} */let retirement;
  /** @type {Promise<any>|undefined} */let pending;
  /** @type {unknown} */let launchFailure;
  /** @type {unknown} */let observedJob;
  let launchState='NOT_STARTED',launchSettledAt=0;
  /** @param {RunJobHandoff} handoff */
  const observeRunJobOwner=({binding,abort})=>{
    if(owner||!binding||typeof abort!=='function')throw Error('audio-product-job-handoff');
    const expected=structuredClone(binding);
    const retire=()=>retirement??=(async()=>{
      if(performance.now()>=abortBy)throw Error('audio-product-job-abort-deadline');
      const candidate=await abort(abortBy);
      if(isRunJobRetirement(candidate,expected))observedJob=structuredClone(candidate);
      return candidate;
    })();
    owner={binding:expected,abort:retire};return retire;
  };
  try{
    try{
      const launched=await beforeDeadline(()=>{
        launchState='PENDING';
        pending=Promise.resolve(launch({deadline,signal:controller.signal,observeRunJobOwner}));
        void pending.then(()=>{launchState='RETURNED';launchSettledAt=performance.now();},
          error=>{launchState='REJECTED';launchSettledAt=performance.now();launchFailure=error;});
        return pending;
      },launchBy,'audio-product-launch-timeout',stop);
      if(stop?.failure)throw stop.failure.reason;
      if(performance.now()>=launchBy)throw Error('audio-product-launch-timeout');
      if(!owner||launched.abort!==owner.abort||!isDeepStrictEqual(launched.runJobOwner?.binding,owner.binding))throw Error('audio-product-job-handoff');
      return launched;
    }finally{stop?.listener?.[Symbol.dispose]();}
  }catch(cause){
    const first=cause instanceof Error?cause:Error('audio-product-launch-failed',{cause});
    try{observation.recordFirst?.(first);}
    catch(error){Object.assign(first,{evidenceError:nativeFailureDetails(error)});}
    controller.abort();
    /** @type {unknown} */let job=null,retirementError;
    const launchSettled=pending===undefined?Promise.resolve():beforeDeadline(()=>/** @type {Promise<any>} */(pending),retireBy,'audio-product-job-retirement-timeout').catch(()=>{});
    const observeRetirement=async()=>{
      if(!owner)await launchSettled;
      if(!owner)return;
      try{
        await beforeDeadline(owner.abort,retireBy,'audio-product-job-retirement-timeout');
        if(!observedJob)throw Error('audio-product-job-retirement-unconfirmed');
        job=observedJob;
      }catch(error){retirementError=error;}
    };
    await Promise.all([launchSettled,observeRetirement()]);
    const receipt={status:job===null?'UNKNOWN':'CONFIRMED',
      launchState:launchState==='PENDING'||launchSettledAt>=retireBy?'PENDING_AT_CUTOFF':launchState,
      binding:owner?.binding??null,job,firstError:nativeFailureDetails(first),
      ...launchFailure&&launchFailure!==cause?{[launchSettledAt<retireBy?'launchError':'unacceptedLaunchError']:nativeFailureDetails(launchFailure)}:{},
      ...retirementError?{retirementError:nativeFailureDetails(retirementError)}:{},
      ...job===null&&observedJob?{unacceptedJob:observedJob}:{}};
    const saving=new AbortController();
    try{await beforeDeadline(()=>recordLate(structuredClone(receipt),{deadline:saveBy,signal:saving.signal}),saveBy,'audio-product-job-evidence-timeout');}
    catch(error){saving.abort();Object.assign(first,{evidenceError:nativeFailureDetails(error),jobRetirement:receipt});}
    throw first;
  }
}

/** A timed-out preparation may finish later; retire only the handle it created.
 * @param {(control:any)=>Promise<any>} launch @param {(value:any,control?:{deadline:number,signal:AbortSignal})=>Promise<void>} recordLate
 * @param {number} milliseconds @param {JobObservation} [observation] */
export async function boundedProductLaunch(launch,recordLate,milliseconds=150000,observation){
  if(!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>150000)throw Error('audio-product-launch-bound');
  if(observation!==undefined)return observeProductJobLaunch(launch,recordLate,milliseconds,observation);
  let expired=false,timer;const controller=new AbortController(),deadline=Date.now()+milliseconds;const pending=Promise.resolve().then(()=>launch({deadline,signal:controller.signal}));
  const record=async retirement=>{try{await recordLate(retirement);}catch(error){console.error('audio-product-late-retirement-record-failed:'+String(error));}};
  void pending.then(async launched=>{if(expired){let retirement;try{await launched.abort();retirement={retired:true};}catch(error){retirement={retired:false,error:nativeFailureDetails(error)};}await record(retirement);}},
    async error=>{if(expired)await record({retired:null,error:nativeFailureDetails(error)});});
  try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;controller.abort();reject(Error('audio-product-launch-timeout'));},milliseconds);})]);}
  finally{clearTimeout(timer);}
}

const diagnosticSlotBytes=65536,diagnosticRawLimit=96*1024*1024;
/** The launcher supplies a retained handle whose Windows file ID, allocation and share mode it has verified.
 * @param {{handle:Pick<import('node:fs/promises').FileHandle,'stat'|'read'|'write'|'sync'>,sha256:string}} reserve
 * @param {number} launchBy @param {number} saveBy
 * @param {(receipt:{slot:0|1,sha256:string,at:number})=>void} [recordSlot] */
async function diagnosticSlotWriter({handle,sha256},launchBy,saveBy,recordSlot){
  const initial=Buffer.alloc(diagnosticSlotBytes*2);
  const admission='chromium-diagnostic-reserve';
  const stat=await beforeDeadline(()=>handle.stat(),launchBy,admission);
  if(!stat.isFile()||stat.size!==initial.length)throw Error(admission);
  const input=await beforeDeadline(()=>handle.read(initial,0,initial.length,0),launchBy,admission);
  if(input.bytesRead!==initial.length||sha(initial)!==sha256)throw Error(admission);
  let next=0;
  /** @param {0|1} slot @param {unknown} evidence */
  return async(slot,evidence)=>{
    if(next!==slot)throw Error('chromium-diagnostic-slot-order');
    next=-1;
    const frame=Buffer.alloc(diagnosticSlotBytes),body=Buffer.from(JSON.stringify({reservationSha256:sha256,slot,evidence}));
    const checksumAt=frame.length-32;
    if(body.length>=checksumAt)throw Error('chromium-diagnostic-slot-size');
    body.copy(frame);
    createHash('sha256').update(frame.subarray(0,checksumAt)).digest().copy(frame,checksumAt);
    const position=slot*frame.length,error='chromium-diagnostic-slot-deadline';
    const written=await beforeDeadline(()=>handle.write(frame,0,frame.length,position),saveBy,error);
    if(written.bytesWritten!==frame.length)throw Error('chromium-diagnostic-slot-partial');
    await beforeDeadline(()=>handle.sync(),saveBy,error);
    const check=Buffer.alloc(frame.length);
    const read=await beforeDeadline(()=>handle.read(check,0,check.length,position),saveBy,error);
    if(read.bytesRead!==check.length||!frame.equals(check))throw Error('chromium-diagnostic-slot-readback');
    const digest=sha(check),at=performance.now();
    if(at>=saveBy)throw Error(error);
    recordSlot?.({slot,sha256:digest,at});
    next=slot+1;
  };
}

/** One opt-in diagnostic boundary. The fixed driver owns the scanner bridge, handle and evidence budget.
 * @param {{started:number,reserve:Parameters<typeof diagnosticSlotWriter>[0],
 * scan:(deadline:number)=>Promise<{logicalBytes:number,entries:number}>,
 * launchOptions:Parameters<typeof launchVisibilityBrowser>[0],
 * observe:(launched:Awaited<ReturnType<typeof launchVisibilityBrowser>>,control:{deadline:number,signal:AbortSignal})=>Promise<import('playwright').CDPSession>,
 * prepare?:(deadline:number)=>Promise<void>,finish?:(shutdown:Awaited<ReturnType<typeof closeInstalledMediaBrowser>>,deadline:number)=>Promise<void>,
 * recordSlot?:(receipt:{slot:0|1,sha256:string,at:number})=>void}} input
 * @param {{launch?:typeof launchVisibilityBrowser,close?:typeof closeInstalledMediaBrowser}} [dependencies] */
export async function runChromiumJobDiagnostic({started,reserve,scan,launchOptions,observe,prepare,finish,recordSlot},
  {launch=launchVisibilityBrowser,close=closeInstalledMediaBrowser}={}){
  if(!Number.isFinite(started)||started>performance.now())throw Error('chromium-diagnostic-clock');
  const {runJob,browserCandidate,diagnosticPaths}=launchOptions;
  if(runJob?.contract!=='run-job-v1'||!runJob.helper||!browserCandidate||
     !diagnosticPaths?.chromiumTempDir||!diagnosticPaths.playwrightArtifactsDir||
     launchOptions.headed!==false||![launchOptions.extensionPath,launchOptions.profilePath,launchOptions.artifactPath].every(value=>typeof value==='string'&&path.isAbsolute(value))||
     launchOptions.productCaseId!=='44100/normalizer-control/tone-silence')throw Error('chromium-diagnostic-selection');
  const options={...launchOptions,runJob:{...runJob,helper:{...runJob.helper}},browserCandidate:{...browserCandidate},diagnosticPaths:{...diagnosticPaths}};
  const launchBy=started+150000,observeBy=started+180000,abortBy=started+195000,retireBy=started+210000,saveBy=started+240000;
  const write=await diagnosticSlotWriter(reserve,launchBy,saveBy,recordSlot);
  const stop=new AbortController(),watchEnd=new AbortController(),observationEnd=new AbortController();
  /** @type {Promise<unknown>|undefined} */let firstWrite;
  /** @param {Error} error */const recordFirst=error=>{
    firstWrite??=Promise.resolve().then(()=>write(0,nativeFailureDetails(error))).then(()=>null,cause=>nativeFailureDetails(cause));
  };
  const scanOnce=async(end=retireBy)=>{
    const cutoff=Math.min(end,performance.now()+1000);
    const sample=await beforeDeadline(()=>scan(cutoff),cutoff,'chromium-diagnostic-scan-deadline');
    if(!Number.isSafeInteger(sample?.logicalBytes)||sample.logicalBytes<0||
       !Number.isSafeInteger(sample.entries)||sample.entries<0||sample.entries>4096)throw Error('chromium-diagnostic-scan-invalid');
    if(sample.logicalBytes>=diagnosticRawLimit)throw Error('chromium-diagnostic-raw-limit');
  };
  const watch=async()=>{
    try{
      while(!watchEnd.signal.aborted){
        await delay(100,undefined,{signal:watchEnd.signal}).catch(error=>{
          if(!watchEnd.signal.aborted)throw error;
        });
        if(!watchEnd.signal.aborted)await scanOnce();
      }
    }catch(error){stop.abort(error);}
  };
  /** @template T @param {()=>Promise<T>} work @param {number} deadline @param {string} error */
  const phase=async(work,deadline,error)=>{
    /** @type {LaunchStop} */const signal={signal:stop.signal};
    try{return await beforeDeadline(work,deadline,error,signal);}
    finally{signal.listener?.[Symbol.dispose]();}
  };
  /** @type {Awaited<ReturnType<typeof launchVisibilityBrowser>>|undefined} */let launched;
  /** @type {RunJobHandoff['binding']|undefined} */let expectedBinding;
  /** @type {Promise<void>|undefined} */let watching;
  /** @type {Promise<Awaited<ReturnType<typeof closeInstalledMediaBrowser>>>|undefined} */let closing;
  /** @type {Awaited<ReturnType<typeof closeInstalledMediaBrowser>>|undefined} */let shutdown;
  /** @type {Awaited<ReturnType<typeof closeInstalledMediaBrowser>>|undefined} */let unacceptedShutdown;
  /** @type {unknown} */let receipt,closeError;
  try{
    if(prepare)await beforeDeadline(()=>prepare(launchBy),launchBy,'chromium-diagnostic-prepare-deadline');
    await scanOnce(launchBy);
    watching=watch();
    launched=await boundedProductLaunch(control=>launch({...options,...control,diagnosticAbortBy:abortBy}),async value=>{receipt=value;},
      Math.floor(launchBy-performance.now()),{launchBy,abortBy,retireBy,saveBy,stopSignal:stop.signal,recordFirst});
    const current=launched;
    if(!current?.runJobOwner)throw Error('chromium-diagnostic-owner');
    const binding=expectedBinding=structuredClone(current.runJobOwner.binding);
    const browserSession=await phase(()=>observe(current,{deadline:observeBy,signal:observationEnd.signal}),observeBy,'chromium-diagnostic-observe-deadline');
    const shutdownBy=Math.min(abortBy,performance.now()+15000);
    await phase(()=>{
      const timeoutMs=Math.floor(shutdownBy-performance.now());
      if(timeoutMs<1)throw Error('chromium-diagnostic-close-deadline');
      closing=close({context:current.context,browserSession,profilePath:options.profilePath,runJobOwner:current.runJobOwner,timeoutMs}).then(value=>{
        if(!isRunJobShutdown(value,binding))throw Error('chromium-diagnostic-close-unconfirmed');
        const observedAt=performance.now();
        if(observedAt>=shutdownBy){
          if(observedAt<retireBy)unacceptedShutdown=structuredClone(value);
          throw Error('chromium-diagnostic-close-deadline');
        }
        shutdown=structuredClone(value);
        return shutdown;
      }).catch(error=>{if(performance.now()<retireBy)closeError=error;throw error;});
      return closing;
    },shutdownBy,'chromium-diagnostic-close-deadline');
    watchEnd.abort();await watching;
    if(stop.signal.aborted)throw stop.signal.reason;
    await scanOnce();
    if(finish){
      if(!shutdown)throw Error('chromium-diagnostic-close-unconfirmed');
      const proof=shutdown;
      await beforeDeadline(()=>finish(proof,saveBy),saveBy,'chromium-diagnostic-save-deadline');
    }
    return shutdown;
  }catch(cause){
    const first=cause instanceof Error?cause:Error('chromium-diagnostic-failed',{cause});
    recordFirst(first);
    observationEnd.abort(first);
    if(launched){
      const current=launched;
      let job=null,retirementError;
      const retirement=async()=>{
        if(shutdown)return;
        try{
          const candidate=await beforeDeadline(current.abort,retireBy,'chromium-diagnostic-retirement-deadline');
          if(!expectedBinding||!isRunJobRetirement(candidate,expectedBinding))throw Error('chromium-diagnostic-retirement-unconfirmed');
          job=structuredClone(candidate);
        }catch(error){retirementError=nativeFailureDetails(error);}
      };
      await Promise.all([retirement(),closing&&beforeDeadline(()=>/** @type {NonNullable<typeof closing>} */(closing),
        retireBy,'chromium-diagnostic-close-pending').catch(error=>{closeError??=error;})]);
      receipt={status:shutdown||job?'CONFIRMED':'UNKNOWN',shutdown:shutdown??null,job,retirementError,
        ...(unacceptedShutdown?{unacceptedShutdown}:{}),
        ...(closeError&&closeError!==cause?{closeError:nativeFailureDetails(closeError)}:{})};
    }
    watchEnd.abort();await watching;
    receipt??=Reflect.get(first,'jobRetirement')??{status:'UNKNOWN',launchState:'NOT_STARTED'};
    if(stop.signal.aborted&&stop.signal.reason!==cause)receipt={.../** @type {object} */(receipt),monitorError:nativeFailureDetails(stop.signal.reason)};
    try{
      const storage=await firstWrite;
      if(storage)Object.assign(first,{evidenceError:storage,jobRetirement:receipt});
      else await write(1,receipt);
    }catch(error){Object.assign(first,{evidenceError:nativeFailureDetails(error),jobRetirement:receipt});}
    throw first;
  }
}

/** Fresh local observation only; never the reserved J1 qualification. */
export async function runProductAudio(options,dependencies={}){
  if(isGain4JobCase(options?.caseId)&&(options?.browserCandidate!==undefined||options?.runJob!==undefined))options=structuredClone(options);
  if(options?.sampleRate!==undefined&&typeof options.sampleRate!=='number')throw Error('audio-product-sample-rate');
  if(options?.masterWitness!==undefined&&typeof options.masterWitness!=='boolean')throw Error('audio-product-master-profile');
  if(options?.componentWitness!==undefined&&typeof options.componentWitness!=='boolean')throw Error('audio-product-component-profile');
  if(options?.headroomWitness!==undefined&&typeof options.headroomWitness!=='boolean')throw Error('audio-product-headroom-profile');
  if(options?.caseId!==undefined)selectProductCase(options.caseId);
  if(options?.browserCandidate!==undefined&&(!options.browserCandidate||typeof options.browserCandidate.root!=='string'||typeof options.browserCandidate.manifestSha256!=='string'))throw Error('audio-product-browser-selection');
  if(options?.runJob!==undefined&&(!options.runJob||typeof options.runJob.contract!=='string'||typeof options.runJob.helper?.path!=='string'||typeof options.runJob.helper.sha256!=='string'))throw Error('audio-product-shutdown-selection');
  const parsed=parseProductAudioArgs([`--run-id=${options?.runId}`,...(options?.browserCandidate===undefined?[]:['--browser-root='+options.browserCandidate.root,'--browser-manifest-sha256='+options.browserCandidate.manifestSha256]),...(options?.runJob===undefined?[]:['--shutdown-contract='+options.runJob.contract,'--job-helper='+options.runJob.helper.path,'--job-helper-sha256='+options.runJob.helper.sha256]),...(options?.sampleRate===undefined?[]:[`--sample-rate=${options.sampleRate}`]),...(options?.caseId?['--case='+options.caseId]:[]),...(options?.componentWitness?['--component-witness']:[]),...(options?.headroomWitness?['--headroom-witness']:[])]);
  const {runId,caseId,browserCandidate,runJob}=parsed;
  const gain4Job=!!runJob&&isGain4JobCase(caseId);
  const firstHostSelected=caseId==='96000/reentry/2/10';
  const observeToneSilenceClose=caseId==='44100/normalizer-control/tone-silence'&&!!browserCandidate&&!runJob;
  const runRequired=runJob?[...required,'scripts/extension-e2e/run-job.mjs','scripts/extension-e2e/run-job-owner.cpp','scripts/extension-e2e/run-job-owner.h','scripts/extension-e2e/harness.mjs','scripts/check-installed-extension.mjs','tests/run-job.test.cjs','tests/run-job-integration.test.cjs','tests/run-job-owner-native.cpp']:required;
  const componentWitness=parsed.componentWitness===true,headroomWitness=parsed.headroomWitness===true,masterWitness=options?.masterWitness===true;
  const outputControl=PRODUCT_OUTPUT_CONTROL_CASES.some(c=>c.id===caseId),dry=PRODUCT_DRY_CASES.some(c=>c.id===caseId),extreme=PRODUCT_EXTREME_CASES.some(c=>c.id===caseId),transition=PRODUCT_TRANSITION_CASES.some(c=>c.id===caseId),normalizer=PACKAGED_NORMALIZER_CASES.some(c=>c.id===caseId),normalizerControl=NORMALIZER_CONTROL_CASES.some(c=>c.id===caseId),reentry=PACKAGED_REENTRY_CASES.some(c=>c.id===caseId),sourceHistory=(SOURCE_HISTORY_CASES.some(c=>c.id===caseId)||(SOURCE_WET_HISTORY_CASES.some(c=>c.id===caseId)||SOURCE_EXTREME_HISTORY_CASES.some(c=>c.id===caseId))),sourceOffStages=SOURCE_OFF_STAGE_CASES.some(c=>c.id===caseId),sourceSuspendRebind=SOURCE_SUSPEND_REBIND_CASES.some(c=>c.id===caseId),sourcePendingOff=SOURCE_PENDING_OFF_CASES.some(c=>c.id===caseId),sourceOwner=sourceHistory||sourceOffStages||sourceSuspendRebind||sourcePendingOff||SOURCE_OWNER_CASES.some(c=>c.id===caseId),spec=caseId?selectProductCase(caseId):null;
  const sampleRate=parsed.sampleRate??spec?.sampleRate??44100;
  if(masterWitness&&(caseId&&!transition||componentWitness||headroomWitness))throw Error('audio-product-master-profile');
  if((dependencies.platform??process.platform)!=='win32')throw Error('audio-product-platform');
  const launchBrowser=dependencies.launchVisibilityBrowser??launchVisibilityBrowser;
  let files=dependencies.files??await openOwnedRoot(root);
  const execute=dependencies.execute??runInstalledExtensionE2E,attest=dependencies.attest??attestL1Source;
  const output=`output/audio-product-${runId}`,artifact=`output/playwright/installed-extension-${runId}`;
  let masterBudget=null,masterCostResult=null,masterCheck=null,masterTerminalError=null;
  if(masterWitness)({files,budget:masterBudget}=createMasterEvidenceFiles(files,{artifact,output}));
  for(const name of [output,artifact,`output/tool-audit/p02-candidate-${runId}`])if(await files.lstat(name,{optional:true}))throw Error('audio-product-run-exists');
  const before=await attest(files,runRequired);
  if(reentry)assertLiveAudioSource(before,files);
  await files.ensureDirectory(output);await files.writeFile(output+'/before.json',JSON.stringify({runId,sampleRate,...caseId?{caseId}:{},...(componentWitness?{componentWitness:true}:{}),...(headroomWitness?{headroomWitness:true}:{}),...(masterWitness?{masterWitnessRequested:true}:{}),...runJob?{runJob,browserCandidate}:{},source:before,node:{version:process.version,path:process.execPath},scope:'current-working-tree-packaged-product-observation'},null,2)+'\n',{flag:'wx'});
  let candidate=null,candidateBefore=null,candidateAfter=null,abort=null,result=null,error=null,after=null,browserCandidateBefore=null,browserCandidateAfter=null,browserCandidateVersion=null,sameChildExit=null;const secondary=[];
  let jobPrelaunch=null,jobLaunch=null;
  let hostResponseStorage=null,hostOutgoing,hostThrowRegistered=false;
  let closeReplayPrelaunch,closeReplayReceipt,browserRootExited,rootExitAtAbort=false,closeReplayEligible=false;
  let closeFailureReplay={status:'UNASSESSED'};
  const inventory=()=>audioCandidateInventory(files,candidate.dist,candidate.files,'audio-product-candidate-files');
  try{
    if(runJob)await verifyRunJobHelper(runJob.helper);
    result=await execute({runId,qualification:'media-tab',retainEvidence:true,...firstHostSelected?{firstHostShutdownCase:caseId}:{},...runJob?{shutdownContract:{...runJob,caseId,browserCandidate,...gain4Job?{componentWitness:true}:{}}}:{},dependencies:{
      openRepository:async()=>files,
      ...firstHostSelected?{
        recordHostResponseStorage:receipt=>{
          const rejected=()=>{hostResponseStorage??=Object.freeze({receipt:null,consumedAt:performance.now(),delivery:'REJECTED-receipt'});return Error('audio-product-host-storage-receipt');};
          if(hostResponseStorage!==null||Object.keys(receipt??{}).sort().join(',')!=="bytes,caseId,chargedBytesAtDecision,deadline,file,firstAt,limit,nativeSeal,reason,runId,schema,sha256,status,verifiedAt"||
            receipt.schema!=='f01-host-response-storage-v1'||receipt.nativeSeal!=='UNFORMED'||receipt.runId!==runId||receipt.caseId!==caseId||receipt.file!==artifact+'/first-host-response.json'||
            !['CONFIRMED','REJECTED'].includes(receipt.status)||receipt.limit!==96*1024*1024||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<0||
            !Number.isSafeInteger(receipt.chargedBytesAtDecision)||receipt.chargedBytesAtDecision<receipt.bytes||receipt.chargedBytesAtDecision>receipt.limit||
            receipt.status==='CONFIRMED'&&(receipt.reason!==null||receipt.bytes<1||!/^([a-f0-9]{64})$/.test(receipt.sha256??'')||!Number.isFinite(receipt.firstAt)||
              !Number.isFinite(receipt.deadline)||!Number.isFinite(receipt.verifiedAt)||receipt.verifiedAt>=receipt.deadline))throw rejected();
          const consumedAt=performance.now();if(receipt.status==='CONFIRMED'&&consumedAt>=receipt.deadline)throw rejected();
          hostResponseStorage=Object.freeze({receipt:Object.freeze({...receipt}),consumedAt,delivery:'CONSUMED'});
        },
        recordHostResponseThrow:outgoing=>{if(hostThrowRegistered)throw Error('audio-product-host-storage-throw');hostThrowRegistered=true;hostOutgoing=outgoing;},
      }:{},
      sourceAttestation:(current,inputs)=>attest(current,[...new Set([...runRequired,...inputs])].sort()),
      verifyCandidate:async(id,directory,settings)=>{const produced=await (dependencies.verifyCandidate??verifyCandidate)(id,directory,settings);candidate=Object.freeze({...produced,files:Object.freeze([...produced.files])});candidateBefore=await audioOperation('product-candidate-before',inventory,30000);return candidate;},
      expectedMediaFiles:expectedCurrentAudioFiles,
      loadFixtureResponses:async()=>[],
      refreshTransitionWorker:launched=>audioOperation('product-worker-refresh',()=>refreshTransitionWorker(launched),30000),
      openMediaBrowserSession:context=>audioOperation('product-browser-session',()=>openMediaBrowserSession(context),30000),
      launchInstalledExtension:async settings=>{
        const prelaunch={profilePath:settings.profilePath,candidatePath:settings.extensionPath,candidate:candidateBefore,source:before,...browserCandidate?{browserCandidate}:{},...runJob?{runId,caseId,sampleRate,runJob,...gain4Job?{componentWitness:true}:{}}:{}};
        if(runJob)jobPrelaunch=structuredClone(prelaunch);
        if(observeToneSilenceClose)closeReplayPrelaunch=prelaunch;
        await files.writeFile(artifact+'/before.json',JSON.stringify(prelaunch,null,2)+'\n',{flag:'wx'});
        const launched=await boundedProductLaunch(control=>launchBrowser({...settings,...control,...requiresR3PrelaunchCollisionCheck(caseId)?{productCaseId:caseId}:{},...runJob?{runJob,productCaseId:caseId,...gain4Job?{productComponentWitness:true}:{},recordRunJob:async binding=>{
          if(jobLaunch||binding.helperSha256!==runJob.helper.sha256||binding.executable!==browserCandidateBefore?.executable)throw Error('audio-product-job-binding');
          jobLaunch={prelaunchSha256:sha(JSON.stringify(jobPrelaunch)),browserCandidateSha256:sha(JSON.stringify(browserCandidateBefore)),binding:structuredClone(binding)};
          const bytes=JSON.stringify(jobLaunch,null,2)+'\n';if(Buffer.byteLength(bytes)>4096)throw Error('audio-product-job-evidence-bound');
          await files.writeFile(artifact+'/run-job-launch.json',bytes,{flag:'wx'});
        }}:{},...browserCandidate?{browserCandidate,recordBrowserCandidate:async evidence=>{browserCandidateBefore=structuredClone(evidence);await files.writeFile(artifact+'/browser-candidate-before.json',JSON.stringify(browserCandidateBefore,null,2)+'\n',{flag:'wx'});}}:{}}),retirement=>files.writeFile(artifact+'/late-launch-retirement.json',JSON.stringify(retirement,null,2)+'\n',{flag:'wx'}));abort=launched.abort;
        if(firstHostSelected)sameChildExit=launched.sameChildExit;
        if(browserCandidate)browserCandidateVersion=launched.browserCandidateVersion??null;
        if(observeToneSilenceClose)browserRootExited=launched.browserRootExited;
        if(runJob&&(!jobLaunch||!isDeepStrictEqual(jobLaunch.binding,launched.runJobOwner?.binding)||browserCandidateVersion!=='159.0.8132.0')){
          const cause=Error('audio-product-job-launch');try{await abort();}catch(retirementError){Object.assign(cause,{retirementError});}throw cause;
        }
        const tracing=launched.context.tracing,start=tracing.start.bind(tracing),stop=tracing.stop.bind(tracing);let stopAttempted=false;
        tracing.start=settings=>audioOperation('product-trace-start',()=>start(settings),30000);
        tracing.stop=()=>{if(stopAttempted)throw Error('audio-product-trace-already-stopped');stopAttempted=true;return audioOperation('product-trace-stop',()=>stop({path:path.join(files.root,artifact,'trace.zip')}),30000);};
        return launched;
      },
      ...observeToneSilenceClose?{recordToneSilenceCloseFailure:(cause,report)=>{closeReplayReceipt={cause,report};}}:{},
      closeInstalledMediaBrowser:l1OwnedCloser(input=>{
        if(firstHostSelected&&input.shutdownBy!==undefined&&(!Number.isFinite(input.shutdownBy)||input.sameChildExit!==sameChildExit))throw Error('audio-product-first-host-owner');
        return observeToneSilenceClose?closeInstalledMediaBrowser({...input,
          queryProcesses:async(profile,deadline)=>(await import('./extension-e2e/native-profile.mjs')).queryWindowsProcesses(profile,undefined,deadline,{observeUnavailable:true})}):closeInstalledMediaBrowser(input);
      },
      async input=>{
        if(!abort)throw Error('audio-product-owned-abort-missing');
        const abortBy=observeToneSilenceClose?performance.now()+15000:0;
        const retirement=firstHostSelected&&input?.shutdownBy!==undefined?await abort({shutdownBy:input.shutdownBy}):await abort();
        // The existing abort can settle on a ChildProcess error; replay needs observed root exit.
        if(observeToneSilenceClose&&performance.now()<abortBy)rootExitAtAbort=browserRootExited?.()===true;
        return retirement;
      }),
      mediaScenario:input=>outputControl||transition?runProductAudioScenario(input,files,candidate,sampleRate,spec,masterWitness):sourceOwner?runProductSourceOwnerScenario(input,files,candidate,spec):normalizerControl?runProductNormalizerControlScenario(input,files,candidate,spec):reentry?runProductReentryScenario(input,files,candidate,spec):normalizer?runProductNormalizerScenario(input,files,candidate,spec,headroomWitness):spec?runProductEqualizerScenario(input,files,candidate,spec,componentWitness):runProductAudioScenario(input,files,candidate,sampleRate,null,masterWitness),
    }});
    if(masterWitness){const by=performance.now()+30000;masterCheck=()=>{if(performance.now()>=by)throw Error('audio-product-master-replay-deadline');};masterBudget.beginRead(masterCheck);}
    if(result?.ok!==true||result.audioProduct?.schema!==(outputControl?(extreme?'f01-product-extreme-observation-v3':dry?'f01-product-dry-observation-v1':'f01-product-wet-peak-observation-v1'):transition?'f01-product-transition-observation-v1':sourceOwner?sourceHistory?SOURCE_EXTREME_HISTORY_CASES.some(c=>c.id===caseId)?'f01-source-extreme-prefix-observation-v2':(SOURCE_WET_HISTORY_CASES.some(c=>c.id===caseId)||SOURCE_EXTREME_HISTORY_CASES.some(c=>c.id===caseId))?'f01-source-wet-prefix-observation-v1':'f01-source-dry-prefix-observation-v1':sourceOffStages?'f01-source-off-stages-observation-v1':sourceSuspendRebind?'f01-source-suspend-rebind-observation-v1':sourcePendingOff?'f01-source-pending-off-observation-v1':'f01-source-owner-observation-v1':normalizerControl?'f01-product-normalizer-control-observation-v1':reentry?'f01-product-reentry-observation-v3':normalizer?headroomWitness?'f01-product-normalizer-headroom-observation-v1':'f01-product-normalizer-observation-v1':caseId?componentWitness?'f01-product-eq-observation-v2':'f01-product-eq-observation-v1':'f01-product-observation-v2')||result.audioProduct?.passed!==true||!result.profileRetained||!result.candidateRetained||
      !(runJob?isRunJobShutdown(result.shutdown,jobLaunch?.binding):result.shutdown?.contract===undefined&&['browserCloseAcknowledged','browserDisconnected','ownedRootClosed'].every(key=>result.shutdown?.[key]===true))||!isDeepStrictEqual(result.source,result.after))throw Error('audio-product-result-incomplete');
    if(reentry)verifyReentryRun(before,result,runId,caseId,files);
    if(masterWitness!==(result.audioProduct.masterWitnessRequested===true)||masterWitness&&!Object.hasOwn(result.audioProduct,'masterComplementary'))throw Error('audio-product-master-result');
    if(firstHostSelected){
      const proof=result.firstHostShutdown,exit=result.shutdown?.actualChildExit;
      if(proof?.caseId!==caseId||proof.scope!=='scenario-first-host'||proof.firstAt!==null||!Number.isFinite(proof.shutdownBy)||!Number.isFinite(proof.acceptedAt)||proof.acceptedAt>=proof.shutdownBy||exit?.kind!=='exit'||exit.code!==0||exit.signal!==null||!Number.isFinite(exit.at)||exit.at<0||exit.at>proof.acceptedAt)throw Error('audio-product-first-host-proof');
    }
    if(gain4Job){
      const controller=new AbortController(),report=result.audioProduct,archive=report.archive,cap=96*1024*1024;
      if(!componentWitness||report.componentWitness!==true||report.schema!=='f01-product-eq-observation-v2'||report.scope!==caseId||!isDeepStrictEqual(report.spec,spec)||
        archive?.profile!=='equalizer-component'||archive.sampleRate!==sampleRate||!Number.isSafeInteger(archive.bytes)||archive.bytes<1||archive.bytes>cap||
        !Number.isSafeInteger(archive.segments)||archive.segments<1||!Array.isArray(archive.artifacts)||archive.artifacts.length!==archive.segments*5||archive.artifacts.length>4096)throw Error('audio-product-gain4-replay-archive');
      const limits=new Map([[artifact+'/before.json',1048576],[artifact+'/run-job-launch.json',4096],[artifact+'/browser-candidate-before.json',1048576],
        [artifact+'/assessment.json',1048576],[artifact+'/equalizer-target.json',1048576],[artifact+'/module-resource.fetched.js',1048576],
        ['extension/web/audio-transition-worklet.js',1048576],[artifact+'/trace.zip',cap]]);
      let pcmBytes=0;
      for(let i=0;i<archive.artifacts.length;i++){
        const row=archive.artifacts[i],slot=i%5,metadata=slot===4,channels=[2,2,5,2][slot],first=archive.artifacts[i-slot],
          name=artifact+'/segment-'+String(Math.floor(i/5)).padStart(4,'0')+(metadata?'.json':'-stream-'+slot+'.f32le');
        if(!row||row.file!==name||limits.has(row.file)||row.kind!==(metadata?'metadata':undefined)||!Number.isSafeInteger(row.start)||row.start<0||
          !Number.isSafeInteger(row.end)||row.end<=row.start||row.end-row.start>sampleRate*1.5||row.start!==first.start||row.end!==first.end||
          !Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>(metadata?1048576:sampleRate*1.5*channels*4)||!/^[a-f0-9]{64}$/.test(row.sha256??'')||
          !metadata&&(row.channels!==channels||row.role!==['program','source','control','component'][slot]||row.bytes!==(row.end-row.start)*channels*4))throw Error('audio-product-gain4-replay-artifact');
        limits.set(row.file,row.bytes);if(!metadata)pcmBytes+=row.bytes;
      }
      if(pcmBytes!==archive.bytes||pcmBytes>cap)throw Error('audio-product-gain4-replay-bytes');
      const {files:bounded,check}=boundedReplayFiles(files,limits,controller.signal,'gain4');
      try{
        await audioOperation('product-gain4-retained-evidence',async()=>{
          if(result.runId!==runId||result.evidence?.profilePath!==jobPrelaunch?.profilePath||result.evidence?.candidatePath!==(candidate?.root||path.dirname(candidate?.dist??''))||!isDeepStrictEqual(result.source,before)||
            !isDeepStrictEqual(result.shutdownSelection,{...runJob,caseId,browserCandidate,componentWitness:true,binding:jobLaunch?.binding})||
            !isDeepStrictEqual(JSON.parse(await bounded.readFile(artifact+'/before.json','utf8')),jobPrelaunch)||
            !isDeepStrictEqual(JSON.parse(await bounded.readFile(artifact+'/run-job-launch.json','utf8')),jobLaunch)||
            !isDeepStrictEqual(JSON.parse(await bounded.readFile(artifact+'/browser-candidate-before.json','utf8')),browserCandidateBefore))throw Error('audio-product-job-evidence');
          check();
          if(!(await bounded.readFile(artifact+'/trace.zip')).length||!isDeepStrictEqual(JSON.parse(await bounded.readFile(artifact+'/assessment.json','utf8')),report))throw Error('audio-product-disk-evidence');
          check();
          const retained=await readProductSegments(bounded,artifact,archive,sampleRate,caseId,check);check();
          await verifyEqualizerEvidence(bounded,artifact,report,retained,spec,true,check);check();
        },30000);check();
      }finally{controller.abort();}
    }else{
    if(runJob&&(result.runId!==runId||result.evidence?.profilePath!==jobPrelaunch?.profilePath||result.evidence?.candidatePath!==(candidate?.root||path.dirname(candidate?.dist??''))||!isDeepStrictEqual(result.source,before)||
      !isDeepStrictEqual(result.shutdownSelection,{...runJob,caseId,browserCandidate,binding:jobLaunch?.binding})||!isDeepStrictEqual(JSON.parse(await files.readFile(artifact+'/before.json','utf8')),jobPrelaunch)||!isDeepStrictEqual(JSON.parse(await files.readFile(artifact+'/run-job-launch.json','utf8')),jobLaunch)||!isDeepStrictEqual(JSON.parse(await files.readFile(artifact+'/browser-candidate-before.json','utf8')),browserCandidateBefore)))throw Error('audio-product-job-evidence');
    if(sourceOwner){
      if(!(await files.readFile(artifact+'/trace.zip')).length||!isDeepStrictEqual(JSON.parse(await files.readFile(artifact+'/assessment.json','utf8')),result.audioProduct))throw Error('audio-source-owner-disk-evidence');
      const replayDeadline=Date.now()+30000;
      await audioOperation('source-owner-retained-evidence',()=>verifySourceOwnerEvidence(files,artifact,result.audioProduct,spec),30000);
      if(Date.now()>=replayDeadline)throw Error('audio-source-owner-evidence-timeout');
    }else{
    const archive=result.audioProduct.archive;
    if(!archive||archive.sampleRate!==sampleRate||result.audioProduct.scope!==(caseId??`current-packaged-${sampleRate}-750-eight-step-sequence`)||!Number.isSafeInteger(archive.bytes)||archive.bytes<=0||archive.bytes>96*1024*1024||!Array.isArray(archive.artifacts)||archive.artifacts.length<4||archive.artifacts.length>4096||archive.segments<1)throw Error('audio-product-evidence-incomplete');
    if(!caseId||transition){
    const input=result.audioProduct.inputValidation,width=.04*sampleRate,stride=.02*sampleRate;
    if(result.audioProduct.qualityAssessed!==true||result.audioProduct.outcome!=='PASS'||productSignalFailures(result.audioProduct.facts,sampleRate,spec?.frequency??750).length||!input||!Number.isSafeInteger(archive.start)||archive.start<0||!Number.isSafeInteger(archive.end)||archive.end-archive.start<width||archive.bytes!==(archive.end-archive.start)*36||
      input.start!==archive.start||input.end!==archive.end||input.windowFrames!==width||input.strideFrames!==stride||input.windows!==Math.ceil((archive.end-archive.start-width)/stride)+1||input.absolutePhaseProven!==false)throw Error('audio-product-input-evidence-incomplete');
    }
    if(masterWitness){masterCheck();const trace=await files.lstat(artifact+'/trace.zip');masterCheck();if(!trace?.isFile()||trace.size<=0)throw Error('audio-product-master-trace-missing');}
    if((!masterWitness&&!(await files.readFile(artifact+'/trace.zip')).length)||!isDeepStrictEqual(JSON.parse(await files.readFile(artifact+'/assessment.json','utf8')),result.audioProduct))throw Error('audio-product-disk-evidence');
    if(!caseId){
      const replayDeadline=performance.now()+30000,check=masterCheck??(()=>{if(performance.now()>=replayDeadline)throw Error('audio-product-750-evidence-timeout');});
      await audioOperation('product-750-retained-evidence',async()=>{
        const retained=await readProductSegments(files,artifact,archive,sampleRate,caseId,check);check();
        await verify750Evidence(files,artifact,result.audioProduct,retained,check);check();
      },30000);check();
    }else{
      let replayDeadline=masterWitness?Date.now()+30000:null;
      const check=masterCheck??undefined;
      const retained=await readProductSegments(files,artifact,archive,sampleRate,caseId,check);check?.();
      replayDeadline??=Date.now()+30000;
      await audioOperation('product-equalizer-retained-evidence',()=>outputControl?verifyOutputControlEvidence(files,artifact,result.audioProduct,retained,spec):transition?verifyTransitionEvidence(files,artifact,result.audioProduct,retained,spec,check):normalizerControl?verifyNormalizerControlEvidence(files,artifact,result.audioProduct,retained,spec):reentry?verifyReentryEvidence(files,artifact,result.audioProduct,retained,spec,runId,before):normalizer?verifyNormalizerEvidence(files,artifact,result.audioProduct,retained,spec,headroomWitness):verifyEqualizerEvidence(files,artifact,result.audioProduct,retained,spec,componentWitness),30000);
      if(masterWitness)masterCheck();else if(Date.now()>=replayDeadline)throw Error('audio-product-equalizer-evidence-timeout');
    }
    }
    }
    if(browserCandidate&&(!browserCandidateBefore||browserCandidateVersion!=='159.0.8132.0'))throw Error('audio-product-browser-unformed');
    if(!candidateBefore?.length)throw Error('audio-product-candidate-unformed');
  }catch(cause){if(firstHostSelected&&hostResponseStorage?.delivery==='CONSUMED'&&(!hostThrowRegistered||!Object.is(cause,hostOutgoing))){hostResponseStorage=Object.freeze({...hostResponseStorage,delivery:'REJECTED-outgoing'});secondary.push(nativeFailureDetails(Error('audio-product-host-storage-outgoing')));}
    closeReplayEligible=rootExitAtAbort&&closeReplayReceipt?.cause===cause&&cause?.forcedRetirement===true;error={...nativeFailureDetails(cause),...(typeof cause?.evidenceError==='string'?{evidenceError:cause.evidenceError}:{})};}
  finally{
    try{after=await attest(files,runRequired);if(reentry)assertLiveAudioSource(after,files);if(!isDeepStrictEqual(before,after))throw Error('audio-product-source-changed');}catch(cause){secondary.push(nativeFailureDetails(cause));}
    try{if(runJob)await verifyRunJobHelper(runJob.helper);}catch(cause){secondary.push(nativeFailureDetails(cause));}
    try{if(candidateBefore!==null){candidateAfter=await audioOperation('product-candidate-after',inventory,30000);if(!isDeepStrictEqual(candidateBefore,candidateAfter))throw Error('audio-product-candidate-changed');}}catch(cause){secondary.push(nativeFailureDetails(cause));}
    try{if(browserCandidateBefore){browserCandidateAfter=await verifyBrowserCandidate(browserCandidate);if(!isDeepStrictEqual(browserCandidateBefore,browserCandidateAfter))throw Error('audio-product-browser-changed');await files.writeFile(artifact+'/browser-candidate-after.json',JSON.stringify(browserCandidateAfter,null,2)+'\n',{flag:'wx'});}}catch(cause){secondary.push(nativeFailureDetails(cause));}
    const closeReport=closeReplayReceipt?.report;
    if(observeToneSilenceClose&&closeReplayEligible&&!secondary.length&&closeReport?.ok===false&&closeReport.shutdown===null&&
      closeReport.runId===runId&&closeReport.qualification==='media-tab'&&isDeepStrictEqual(closeReport.pageErrors,[])&&closeReport.profileRetained&&closeReport.candidateRetained&&closeReport.evidence?.retained&&
      closeReplayPrelaunch?.profilePath&&closeReport.evidence.profilePath===closeReplayPrelaunch.profilePath&&closeReport.evidence.candidatePath===candidate?.root&&closeReplayPrelaunch.candidatePath===candidate?.dist&&
      isDeepStrictEqual(closeReport.source,before)&&isDeepStrictEqual(closeReport.after,after)&&candidateBefore?.length&&browserCandidateBefore&&browserCandidateAfter&&browserCandidateVersion==='159.0.8132.0'){
      try{await replayToneSilenceCloseFailure(files,artifact,closeReport,spec,closeReplayPrelaunch,browserCandidateBefore,browserCandidateAfter);closeFailureReplay={status:'PASS'};}
      catch(cause){closeFailureReplay={status:'REJECTED',error:nativeFailureDetails(cause)};}
    }
    try{const masterCost=masterWitness?masterBudget.beforeFinal():null;await files.writeFile(output+'/summary.json',JSON.stringify({schema:'f01-product-observation-run-v1',ok:!error&&secondary.length===0,runId,sampleRate,...caseId?{caseId}:{},...(componentWitness?{componentWitness:true}:{}),...(headroomWitness?{headroomWitness:true}:{}),...(masterWitness?{masterWitnessRequested:true,masterCost}:{}),before,after,candidate:candidateBefore,candidateAfter,...browserCandidate?{browserCandidate:{selection:browserCandidate,before:browserCandidateBefore,after:browserCandidateAfter,version:browserCandidateVersion}}:{},...runJob?{runJob:{selection:runJob,launch:jobLaunch}}:{},result,error,secondaryErrors:secondary,...firstHostSelected?{hostResponseStorage}:{},...observeToneSilenceClose&&error?{closeFailureReplay}:{},
      artifact,retention:firstHostSelected?'candidate, profile and formed PCM retained; trace availability recorded in firstHostShutdown; no cleanup':'candidate, profile, trace and every formed PCM segment retained; no cleanup',limits:outputControl?(extreme?'one original combined extreme source/FFT/plan/control and fixed 9500ms/latest1sec output subgate only; Native3/7/8 UNASSESSED, frameOrigin UNPROVEN, full source-change/profile/R5/F01 OPEN':dry?'one fixed original dry RMS subgate with explicit ON priming and OFF; no original source-change history or full profile acceptance; Native7/8 UNASSESSED, overallQualification false':'one original wet-peak safety upper-bound subgate only; silence may pass; dry/extreme/full 3Fs/profile/R5/F01 OPEN; Native7/8 UNASSESSED, overallQualification false'):transition?'one original transition input/output subgate; Native complementary automation UNASSESSED, Native7/8 UNASSESSED, overallQualification false; full 3Fs/profile and F01 open':sourceOwner?(sourceOffStages?'positive OFF stage receipts only; missing UNKNOWN, no Native clear/close ordering or original late substitution; source Worklet requires separately approved regeneration before candidate launch':sourceSuspendRebind?'controlled public suspend main-flight reconstruction only; opportunity may be NOT_OBSERVED, natural HOLD and Native/late/waveform/overall UNASSESSED':sourcePendingOff?'conditional main pending-OFF flight reconstruction only; natural formation may be NOT_OBSERVED, Native/late/waveform/overall UNASSESSED':'stable source-key ownership observation only; pending/late Native, waveform, physical exclusivity and overall qualification UNASSESSED'):normalizerControl?'one original N control signal or contiguous stall/error case only; no waveform, Native7/8 or overall qualification':reentry?'one original R3 stimulus with actual ACK phase, independent N/q and tail output; Native7/8 UNASSESSED, phase coverage false, old SOURCE STOP and overall F01 open':normalizer?headroomWitness?'one original normalizer calibration with actual rendered headroom; no extreme combined case or Native3/7/8 acceptance; frameOrigin UNPROVEN and overallQualification false':'one original normalizer case source/FFT/plan/control/output observation; Native7 UNASSESSED, frameOrigin UNPROVEN and overallQualification false; not full R2 or F01':caseId?`one original ${caseId} composite output subgate; Native8 UNASSESSED and overallQualification false; not full R2, I4, settings, physical output or F01 completion`:`one local synthetic ${sampleRate===44100?'44.1':sampleRate/1000}kHz/750Hz history; not J1, I4, settings authority, physical output or F01 completion`},null,2)+'\n',{flag:'wx'});
    }catch(cause){
      if(gain4Job){if(!error&&secondary.length===0)error=nativeFailureDetails(cause);else secondary.push(nativeFailureDetails(cause));}
      else{
        if(!masterWitness&&(caseId?((!observeToneSilenceClose&&!firstHostSelected)||!error):(!error&&secondary.length===0)))throw cause;
        if(masterWitness){masterTerminalError=cause;if(!error)error=nativeFailureDetails(cause);else secondary.push(nativeFailureDetails(cause));}
        else secondary.push(nativeFailureDetails(cause));
      }
    }finally{masterBudget?.close();}
    if(masterWitness&&!error&&secondary.length===0){
      try{masterCheck();masterBudget.assertFinal();masterCostResult=await verifyMasterStoredCost(files,{artifact,output,report:result.audioProduct,expected:masterBudget.readbackExpectation(),check:masterCheck});masterCheck();masterBudget.assertFinal();}
      catch(cause){masterTerminalError=cause;error=nativeFailureDetails(cause);}
    }
    if(masterTerminalError){
      try{await masterBudget.failureOnly({schema:'f01-master-cost-failure-v1',primary:error,secondaryErrors:secondary,costFailure:nativeFailureDetails(masterTerminalError),firstStorageReason:masterBudget.snapshot().firstReason});}
      catch(cause){secondary.push(nativeFailureDetails(cause));}
    }
  }
  if(error||secondary.length)throw Object.assign(Error('audio-product-observation-failed'),{error,secondaryErrors:secondary,...firstHostSelected?{hostResponseStorage}:{}});return masterWitness?{...result,masterStoredCost:masterCostResult}:result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await runProductAudio(parseProductAudioArgs(process.argv.slice(2))),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
