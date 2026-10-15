import { createHash, randomBytes } from 'node:crypto';
import { fork, execFile, execFileSync } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { openOwnedRoot } from './owned-files.mjs';
import { verifyCandidate, removeCandidate } from './verify-candidate.mjs';
import { loadFixtureResponses,loadAudioFixtureResponses,FIXTURE_LIVE_URL,FIXTURE_AUDIO_URL } from './extension-e2e/fixture-router.mjs';
import { launchInstalledExtension, parseInstalledE2EArgs, openMediaBrowserSession, closeInstalledMediaBrowser } from './extension-e2e/harness.mjs';
import { refreshTransitionWorker } from './extension-e2e/transition-preparation.mjs';
import {parseF01TransitionArgs,readFrozenF00Payload,f01TransitionAssignments,f01TransitionStages,f01TransitionSeed,
  expectedF01TransitionRaw,runF01TransitionPhase,assertF01TransitionPhase,matchF01TransitionLoss} from './extension-e2e/f01-transition.mjs';
export { refreshTransitionWorker };
import { readPublishedPayload, PUBLISHED_PAYLOAD_BASELINE, validatePayloadMetadata } from './extension-e2e/published-payload.mjs';
import { TRANSITION_CASES, transitionSeed, expectedTransitionRaw, expectedTransitionState, assertTransitionState, runTransitionPhase,
  MEDIA_TRANSITION_PHASES, runInstalledMediaPreservationScenario, expectedInstalledMediaStore, matchesInstalledMediaLoss,brokerFunctionSource } from './extension-e2e/transition-scenario.mjs';

const scriptPath = fileURLToPath(import.meta.url), repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => Object.assign(new Error(code), { code });
const execFileAsync = promisify(execFile);
const slash = value => value.split(path.sep).join('/');
const genericFailure = error => error?.failure || { code: String(error?.code || 'transition-failed').slice(0, 240),
  caseId: null, phase: null, step: 'prepare', stage: 'prepare',
  diagnostic: { name: String(error?.name || 'Error').slice(0, 80), message: String(error?.message || '').replaceAll(repositoryRoot, '<repository>').slice(0, 240) }, cleanupErrors: [] };
const relative = (files, absolute) => {
  const value = slash(path.relative(files.root, absolute));
  if (!value || value === '..' || value.startsWith('../') || path.isAbsolute(value)) throw fail('transition-owned-path');
  return value;
};
const timeout = async (work, milliseconds, code) => {
  let timer;
  try { return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(fail(code)), milliseconds); })]); }
  finally { clearTimeout(timer); }
};

export function phasePayload(payload, phase, control) {
  if (!['old', 'new', 'rollback'].includes(phase) || (control !== undefined && !['storage-loss','media-profile-loss'].includes(control))) throw fail('transition-control-invalid');
  return payload.entries.map(entry => {
    let bytes = Buffer.from(entry.bytes);
    if (entry.name === 'manifest.json' && phase !== 'old') {
      const manifest = JSON.parse(bytes);
      manifest.version = phase === 'new' ? '2.13.4' : '2.13.5';
      manifest.version_name = `AF05-B2 TEST ONLY ${phase}`;
      bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    }
    if (entry.name === 'settings-broker.js' && phase === 'new' && control) {
      const source = bytes.toString('utf8'), boot = 'boot = enqueue(async () => {', read = 'const raw = await read(true), revision = contract.readRevision(raw.settingsRevision);';
      const index = source.indexOf(read), bootIndex = source.indexOf(boot);
      if (index < 0 || bootIndex < 0 || source.split(read).length !== 2 || source.split(boot).length !== 2 ||
          !/^\r?\n {6}$/.test(source.slice(bootIndex + boot.length, index))) throw fail('transition-control-preparation');
      const eol = source.slice(bootIndex + boot.length, index).startsWith('\r') ? '\r\n' : '\n';
      const injected = control === 'storage-loss' ? "await chromeApi.storage.local.remove('config');" :
        "const mediaLossRaw = await chromeApi.storage.local.get(['mediaProfiles']);" + eol +
        "      const mediaLossStore = mediaLossRaw.mediaProfiles;" + eol +
        "      if (!mediaLossStore || mediaLossStore.schema !== 1 || !Array.isArray(mediaLossStore.channels)) throw new Error('media-loss-control-invalid');" + eol +
        "      const mediaLossA = mediaLossStore?.channels?.find(channel => channel.channelId === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');" + eol +
        "      if (mediaLossA?.audio) {" + eol +
        "      delete mediaLossA.audio;" + eol +
        "      if (!mediaLossA.video) mediaLossStore.channels = mediaLossStore.channels.filter(channel => channel !== mediaLossA);" + eol +
        "      await chromeApi.storage.local.set({ mediaProfiles: mediaLossStore });" + eol +
        "      }";
      bytes = Buffer.from(`${source.slice(0, index)}${injected}${eol}      ${source.slice(index)}`);
    }
    return { name: entry.name, bytes, sha256: sha256(bytes) };
  });
}

export function matchesStorageLoss(failure, nonce, extensionId) {
  const expected = expectedTransitionRaw('valid-ui', 'old', 'font8', nonce); delete expected.config;
  return failure?.code === 'transition-storage-preservation' && failure.caseId === 'valid-ui' && failure.phase === 'new' &&
    failure.step === 'startup' && failure.stage === 'candidate-init' && Array.isArray(failure.cleanupErrors) && failure.cleanupErrors.length === 0 &&
    /^[a-p]{32}$/.test(extensionId || '') &&
    isDeepStrictEqual(failure.observation?.execution, { extensionId, version: '2.13.4', brokerMatches: true }) &&
    isDeepStrictEqual(failure.observation?.raw, expected);
}

export function validateTransitionResult(result, nonce, control, launches) {
  const cases = control ? ['valid-ui'] : TRANSITION_CASES;
  if (!result?.source?.sourceCommit || !isDeepStrictEqual(result.source, result.after) ||
      !/^[a-f0-9]{64}$/.test(result.candidateInventory || '') || result.seeds?.length !== cases.length ||
      result.phases?.length !== cases.length * (control ? 1 : 3) || launches.length !== cases.length * (control ? 3 : 4)) throw fail('transition-result-incomplete');
  for (const caseId of cases) {
    const seed = result.seeds.find(value => value.caseId === caseId), phases = result.phases.filter(value => value.caseId === caseId);
    if (!seed || seed.writes !== 1 || !/^[a-p]{32}$/.test(seed.extensionId || '') || !isDeepStrictEqual(seed.raw, transitionSeed(caseId, nonce)) ||
        !isDeepStrictEqual(seed.preparation, { developerMode: true, workerClosed: true, extensionId: seed.extensionId, version: '2.13.3', state: 'ENABLED' }) ||
        !isDeepStrictEqual(phases.map(value => value.phase), control ? ['old'] : ['old', 'new', 'rollback']) ||
        !isDeepStrictEqual(launches.filter(value => value.caseId === caseId).map(value => value.phase), control ? ['seed', 'old', 'new'] : ['seed', 'old', 'new', 'rollback'])) throw fail('transition-result-incomplete');
    for (const phase of phases) {
      const steps = caseId !== 'valid-ui' ? ['startup'] : phase.phase === 'old' ? ['startup', 'arrow-off', 'volume25', 'hide-ranking-on', 'font8', 'font8'] :
        phase.phase === 'new' ? ['startup', 'two-popup-merge', 'font0', 'font0'] : ['startup', 'volume26', 'rollback-font8', 'rollback-font8', 'rollback-font0'];
      if (phase.extensionId !== seed.extensionId || !/^[a-f0-9]{64}$/.test(phase.inventorySha256 || '') ||
          !isDeepStrictEqual(phase.preparation, { developerMode: true, workerClosed: true, extensionId: seed.extensionId,
            version: phase.phase === 'old' ? '2.13.3' : phase.phase === 'new' ? '2.13.4' : '2.13.5', state: 'ENABLED' }) ||
          !/^[a-f0-9]{64}$/.test(phase.manifestSha256 || '') || !Array.isArray(phase.records) ||
          !isDeepStrictEqual(phase.records.map(value => value.step), steps)) throw fail('transition-result-incomplete');
      let reloaded = false;
      for (const [index, record] of phase.records.entries()) {
        const shouldReload = index > 0 && steps.at(index - 1) === record.step;
        if (Boolean(record.reloaded) !== shouldReload) throw fail('transition-result-incomplete');
        reloaded ||= shouldReload;
        assertTransitionState(record.observation, expectedTransitionState(caseId, phase.phase, record.step, nonce, seed.extensionId,
          { reloaded, reloads: reloaded ? [1, 0] : [0, 0] }));
      }
      if (!isDeepStrictEqual(phase.final, phase.records.at(-1).observation)) throw fail('transition-result-incomplete');
    }
  }
}

export function validateInstalledMediaTransitionResult(result,nonce,control,launches) {
  const seed=result?.seeds?.[0],phases=result?.phases,firstNew=phases?.find(value=>value.launchOccurrence===2),presetId=firstNew?.presetId;
  if(result?.scenario!=='media-preservation'||!result.source?.sourceCommit||!isDeepStrictEqual(result.source,result.after)||
    !/^[a-f0-9]{64}$/.test(result.candidateInventory||'')||result.seeds?.length!==1||seed.caseId!=='valid-ui'||seed.writes!==1||
    !/^[a-p]{32}$/.test(seed.extensionId||'')||!isDeepStrictEqual(seed.raw,transitionSeed('valid-ui',nonce))||
    !Array.isArray(phases)||phases.length!==(control?3:4)||launches.length!==5)throw fail('media-result-incomplete');
  const prepare=version=>({developerMode:true,workerClosed:true,extensionId:seed.extensionId,version,state:'ENABLED'});
  if(!isDeepStrictEqual(seed.preparation,prepare('2.13.3')))throw fail('media-result-incomplete');
  const store=expectedInstalledMediaStore(nonce,presetId);
  for(const [index,phase] of phases.entries()){
    const occurrence=index+1,wanted=MEDIA_TRANSITION_PHASES.at(index),version=wanted==='old'?'2.13.3':wanted==='rollback'?'2.13.5':'2.13.4';
    const steps=occurrence===2?['startup','create-media','observe-ui']:['startup','observe-ui'];
    if(phase.caseId!=='valid-ui'||phase.phase!==wanted||phase.launchOccurrence!==occurrence||phase.extensionId!==seed.extensionId||
      !/^[a-f0-9]{64}$/.test(phase.inventorySha256||'')||!/^[a-f0-9]{64}$/.test(phase.manifestSha256||'')||
      !isDeepStrictEqual(phase.preparation,prepare(version))||!isDeepStrictEqual(phase.records?.map(value=>value.step),steps)||
      !isDeepStrictEqual(phase.final,phase.records.at(-1)?.observation))throw fail('media-result-incomplete');
    for(const record of phase.records){
      const expected={raw:{...transitionSeed('valid-ui',nonce),...(occurrence>=3||occurrence===2&&record.step!=='startup'?{mediaProfiles:store}:{})},
        execution:{extensionId:seed.extensionId,version,brokerMatches:true}};
      if(!isDeepStrictEqual(record.observation,expected))throw fail('media-result-incomplete');
      if(occurrence>=3&&JSON.stringify(record.observation.raw.mediaProfiles)!==JSON.stringify(firstNew.final.raw.mediaProfiles))throw fail('media-result-incomplete');
    }
  }
  for(const [launchOccurrence,phase] of ['seed',...MEDIA_TRANSITION_PHASES].entries()){
    const launch=launches.at(launchOccurrence);
    if(launch?.caseId!=='valid-ui'||launch.phase!==phase||launch.launchOccurrence!==launchOccurrence||
      launch.launchId!==`valid-ui:${launchOccurrence}:${phase}`||launch.closed!==true||launch.shutdown?.browserCloseAcknowledged!==true||
      launch.shutdown?.browserDisconnected!==true||launch.shutdown?.ownedRootClosed!==true)throw fail('media-result-incomplete');
  }
}

export function validateF01TransitionResult(result,nonce,control,launches,seedFixture,expectedFixture){
  const assignments=f01TransitionAssignments(control),source=result?.source;
  if(result?.mediaSchema!=='f01'||result.failure!==undefined&&result.failure!==null||!source||!/^[a-f0-9]{40}$/.test(source.sourceCommit||'')||
    !['sourceSha256','lockSha256','manifestSha256','toolchainSha256'].every(key=>/^[a-f0-9]{64}$/.test(Reflect.get(source,key)||''))||
    !isDeepStrictEqual(source,result.after)||!Array.isArray(result.seeds)||result.seeds.length!==assignments.length||!Array.isArray(result.phases)||
    !Array.isArray(result.detected)||result.detected.length!==(control?5:0)||!isDeepStrictEqual(result.cleanupErrors,[])||!isDeepStrictEqual(result.secondaryErrors,[])||
    result.payloads?.published?.inventorySha256!==PUBLISHED_PAYLOAD_BASELINE.inventorySha256||result.payloads.published.count!==58||
    result.payloads?.f00?.inventorySha256!=='9715087af1aa2b36fc54b330e5a879ce384f4c9a4f56faf1c6fd8847436580df'||result.payloads.f00.count!==59||
    result.payloads?.f01?.count!==62||result.payloads.f01.inventorySha256!==result.candidateInventory||!/^[a-f0-9]{64}$/.test(result.candidateInventory||'')||
    launches.length!==assignments.reduce((sum,row)=>sum+f01TransitionStages(row,control).length,0))throw fail('f01-transition-result');
  const legacyIds=assignments.filter(row=>row.kind==='legacy').map(row=>row.caseId);
  validateTransitionResult({...result,seeds:result.seeds.filter(row=>legacyIds.includes(row.caseId)),phases:result.phases.filter(row=>legacyIds.includes(row.caseId)),candidateInventory:result.payloads.f00.inventorySha256},
    nonce,control,launches.filter(row=>legacyIds.includes(row.caseId)));
  let phaseCount=0,launchIndex=0;
  for(const [index,assignment]of assignments.entries()){
    const seed=result.seeds.at(index),stages=f01TransitionStages(assignment,control),phases=result.phases.filter(row=>row.caseId===assignment.caseId),
      loss=control?result.detected.find(row=>row.caseId===assignment.caseId):null;
    if(seed?.caseId!==assignment.caseId||seed.writes!==1||!/^[a-p]{32}$/.test(seed.extensionId||'')||!isDeepStrictEqual(seed.raw,assignment.kind==='legacy'?transitionSeed(assignment.caseId,nonce):f01TransitionSeed(assignment.mediaCase,nonce,seedFixture)))throw fail('f01-transition-result');
    const prepare=version=>({developerMode:true,workerClosed:true,extensionId:seed.extensionId,version,state:'ENABLED'});
    if(!isDeepStrictEqual(seed.preparation,prepare('2.13.3'))||phases.length!==stages.length-1-(control?1:0))throw fail('f01-transition-result');
    for(const [occurrence,stage]of stages.entries()){
      const launch=launches.at(launchIndex++);if(launch?.caseId!==assignment.caseId||launch.phase!==stage.phase||launch.payload!==stage.payload||launch.launchOccurrence!==occurrence||
        launch.launchId!==`${assignment.caseId}:${occurrence}:${stage.phase}`||launch.closed!==true||!isDeepStrictEqual(launch.shutdown,{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}))throw fail('f01-transition-result');
    }
    if(assignment.kind==='legacy'){
      if(control&&!matchesStorageLoss(loss,nonce,seed.extensionId))throw fail('f01-transition-result');
    }else{
      const presetId=phases.find(row=>row.launchOccurrence===2)?.presetId;
      for(const [position,phase]of phases.entries()){
        const occurrence=position+1,stage=stages.at(occurrence);
        assertF01TransitionPhase(phase,{caseId:assignment.mediaCase,assignedCaseId:assignment.caseId,runNonce:nonce,seed:seedFixture,expected:expectedFixture,occurrence,
          phase:stage.phase,payload:stage.payload,extensionId:seed.extensionId,...(presetId?{presetId}:{})});
      }
      if(control&&!matchF01TransitionLoss(loss,expectedF01TransitionRaw({caseId:'valid-v1',runNonce:nonce,seed:seedFixture,expected:expectedFixture,occurrence:3,step:'startup',presetId}),assignment.loss,seed.extensionId))throw fail('f01-transition-result');
    }
    for(const phase of phases){const version=phase.phase==='old'?'2.13.3':phase.phase==='new'?'2.13.4':'2.13.5';
      if(phase.extensionId!==seed.extensionId||!isDeepStrictEqual(phase.preparation,prepare(version))||!/^[a-f0-9]{64}$/.test(phase.inventorySha256||'')||!/^[a-f0-9]{64}$/.test(phase.manifestSha256||''))throw fail('f01-transition-result');}
    phaseCount+=phases.length;
  }
  if(phaseCount!==result.phases.length)throw fail('f01-transition-result');
}

export async function terminateTransitionChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) throw fail('transition-child-pid');
  await timeout(async () => {
    if (process.platform === 'win32') await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
    else process.kill(-child.pid, 'SIGKILL');
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once('exit', resolve));
  }, 5000, 'transition-kill-failed');
}

export function superviseTransitionChild({ child, nonce, roots, scenario, mediaSchema, control, deadlineMs = 600000, phaseTimeoutMs = 130000, killChild = terminateTransitionChild }) {
  if (scenario !== undefined && scenario !== 'media-preservation') throw fail('transition-scenario-invalid');
  if(mediaSchema!==undefined&&(mediaSchema!=='f01'||scenario!==undefined))throw fail('transition-scenario-invalid');
  const f01=mediaSchema==='f01',media = scenario === 'media-preservation'||f01;
  return new Promise(resolve => {
    const launches = new Map(), cleanupErrors = [], secondaryErrors = [];
    let failure = null, result, receivedResult = false, finished = false, phaseTimer;
    const remember = error => {
      const next = genericFailure(error);
      if (!failure) failure = next;
      else if (secondaryErrors.length < 32) secondaryErrors.push(next);
    };
    const finish = normalExit => {
      if (finished) return; finished = true; clearTimeout(timer); clearTimeout(phaseTimer);
      child.removeListener('message', onMessage); child.removeListener('exit', onExit); child.removeListener('error', onError);
      const unconfirmedRoots = [...new Set([...launches.values()].filter(value => !value.closed).map(value => value.root))];
      if (!receivedResult) remember(fail('transition-child-result-missing'));
      if (!normalExit) remember(fail('transition-child-exit'));
      if (unconfirmedRoots.length) remember(fail('cleanup-unconfirmed'));
      resolve({ result, failure, cleanupErrors, secondaryErrors, unconfirmedRoots, normalExit, launches: [...launches.values()] });
    };
    const expire = async code => {
      if (finished) return;
      remember(fail(code));
      try { await killChild(child); }
      catch { cleanupErrors.push({ code: 'transition-kill-failed', caseId: null, phase: null }); }
      finish(false);
    };
    const timer = setTimeout(() => { void expire('transition-child-timeout'); }, deadlineMs);
    const onError = error => { remember(error); void expire('transition-child-error'); };
    const onExit = (code, signal) => finish(code === 0 && signal === null);
    const onMessage = message => {
      try {
        if (!message || message.nonce !== nonce || Buffer.byteLength(JSON.stringify(message)) > 1048576) throw fail('transition-ipc');
        if (message.type === 'failure') { if (!message.failure?.code) throw fail('transition-ipc'); remember({ failure: message.failure }); return; }
        if (message.type === 'result') {
          if (receivedResult || [...launches.values()].some(value => !value.closed)) throw fail('transition-ipc');
          receivedResult = true; result = message.result; return;
        }
        const assigned = roots.find(value => value.caseId === message.caseId && value.root === message.root);
        const launchId = media ? `${message.caseId}:${message.launchOccurrence}:${message.phase}` : `${message.caseId}:${message.phase}`;
        const stages=f01&&assigned?f01TransitionStages(Object.fromEntries(Object.entries(assigned).filter(([key])=>key!=='root')),control):null;
        if (!assigned || !['seed', 'old', 'new', 'rollback'].includes(message.phase) || message.launchId !== launchId ||
          media && (!Number.isInteger(message.launchOccurrence) || message.launchOccurrence < 0 || message.launchOccurrence > (f01?6:4))||
          f01&&(stages.at(message.launchOccurrence)?.phase!==message.phase||stages.at(message.launchOccurrence)?.payload!==message.payload)) throw fail('transition-ipc');
        if (message.type === 'launch-intent') {
          if (failure || receivedResult || launches.has(message.launchId) || [...launches.values()].some(value => !value.closed)) throw fail('transition-ipc');
          const previous = [...launches.values()].filter(value => value.caseId === message.caseId);
          if ((f01?stages.map(value=>value.phase):media ? ['seed','old','new','rollback','new'] : ['seed', 'old', 'new', 'rollback']).at(previous.length) !== message.phase ||
            media && message.launchOccurrence !== previous.length) throw fail('transition-ipc');
          launches.set(message.launchId, { caseId: message.caseId, phase: message.phase, launchId: message.launchId, root: message.root,
            ...(media ? { launchOccurrence: message.launchOccurrence } : {}),...(f01?{payload:message.payload}:{}), closed: false });
          clearTimeout(phaseTimer); phaseTimer = setTimeout(() => { void expire('transition-phase-timeout'); }, phaseTimeoutMs);
          child.send({ ...message, type: 'launch-ack' }, error => { if (error) remember(error); });
        } else if (message.type === 'close-success') {
          const launch = launches.get(message.launchId);
          if (!launch || launch.closed || launch.root !== message.root) throw fail('transition-ipc');
          if (media) {
            const proof = message.shutdown;
            if (!proof || typeof proof !== 'object' || Array.isArray(proof) || Object.keys(proof).length !== 3 ||
              !Object.hasOwn(proof,'browserCloseAcknowledged') || !Object.hasOwn(proof,'browserDisconnected') || !Object.hasOwn(proof,'ownedRootClosed') ||
              proof.browserCloseAcknowledged !== true || proof.browserDisconnected !== true || proof.ownedRootClosed !== true) throw fail('transition-ipc');
            launch.shutdown = { browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true };
          }
          launch.closed = true; clearTimeout(phaseTimer);
        } else throw fail('transition-ipc');
      } catch (error) { remember(error); }
    };
    child.on('message', onMessage); child.once('exit', onExit); child.once('error', onError);
  });
}

export async function sourceAttestation(files, required = []) {
  const command = args => execFileSync('git', args, { cwd: files.root, encoding: 'utf8', timeout: 15000, maxBuffer: 2097152, stdio: ['ignore', 'pipe', 'pipe'] });
  if (command(['status', '--porcelain', '--untracked-files=no']).trim()) throw fail('transition-source-dirty');
  const sourceCommit = command(['rev-parse', 'HEAD']).trim();
  const tracked = command(['ls-files', '-z']).split('\0').filter(Boolean).sort();
  if (!Array.isArray(required) || required.some(name => typeof name !== 'string' || !tracked.includes(name))) throw fail('transition-input-untracked');
  const entries = [];
  for (const name of tracked) entries.push([name, sha256(await files.readFile(name))]);
  return { sourceCommit, sourceSha256: sha256(JSON.stringify(entries)),
    lockSha256: sha256(await files.readFile('package-lock.json')), manifestSha256: sha256(await files.readFile('manifest.json')),
    toolchainSha256: sha256(await files.readFile('scripts/check-toolchain.mjs')) };
}

async function payloadFromDirectory(directory, expectedNames) {
  const files = await openOwnedRoot(directory), entries = [];
  async function visit(folder) {
    for (const item of await files.readdir(folder, { withFileTypes: true })) {
      const name = folder ? `${folder}/${item.name}` : item.name;
      if (item.isDirectory()) await visit(name);
      else if (item.isFile()) { const bytes = await files.readFile(name); entries.push({ name, bytes, sha256: sha256(bytes) }); }
      else throw fail('transition-inventory');
    }
  }
  await visit(''); entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (!isDeepStrictEqual(entries.map(entry=>entry.name),expectedNames)) throw fail('transition-inventory');
  return { entries, inventorySha256: sha256(JSON.stringify(entries.map(({ name, sha256 }) => [name, sha256]))) };
}

async function checkInventory(directory, expected) {
  const actual = await payloadFromDirectory(directory,expected.map(entry=>entry.name));
  if (!isDeepStrictEqual(actual.entries.map(({ name, sha256 }) => [name, sha256]), expected.map(({ name, sha256 }) => [name, sha256]))) throw fail('transition-inventory');
  return actual.inventorySha256;
}

async function replacePayload(files, entries) {
  await files.removeTree('extension'); await files.ensureDirectory('extension');
  for (const entry of entries) {
    const target = `extension/${entry.name}`, parent = path.posix.dirname(target);
    await files.ensureDirectory(parent); await files.writeFile(target, entry.bytes, { flag: 'wx' });
  }
}

const send = (message, processApi = process) => new Promise((resolve, reject) => {
  if (!processApi.connected) { reject(fail('transition-ipc-disconnected')); return; }
  processApi.send(message, error => error ? reject(error) : resolve());
});

async function requestLaunch(message) {
  await timeout(async () => {
    let handler;
    const ack = new Promise((resolve, reject) => {
      handler = reply => {
        if (!isDeepStrictEqual(reply, { ...message, type: 'launch-ack' })) reject(fail('transition-launch-ack'));
        else resolve();
      };
      process.once('message', handler);
    });
    try { await send(message); await ack; }
    finally { process.removeListener('message', handler); }
  }, 15000, 'transition-launch-ack-timeout');
}

/** Parent-selected owned roots only; this runs in the supervised child. */
export async function executeTransitionChild(options, dependencies = {}) {
  const deps = { openRepository: () => openOwnedRoot(repositoryRoot), openWorkRoot: openOwnedRoot, sourceAttestation,
    readPublishedPayload, verifyCandidate, loadFixtureResponses, launchInstalledExtension, refreshTransitionWorker,
    runTransitionPhase, runInstalledMediaPreservationScenario, openMediaBrowserSession, closeInstalledMediaBrowser, requestLaunch, send, ...dependencies };
  const files = await deps.openRepository(), phases = [], seeds = [], cleanupErrors = [], secondaryErrors = [],detected=[];
  let failure, source, after, candidateInventory, active,payloads;
  const noticed = new Set();
  const noticeFailure = async error => {
    if (noticed.has(error)) return;
    noticed.add(error);
    for (const cleanup of (error?.cleanupErrors || []).slice(0, 32)) cleanupErrors.push({ code: String(cleanup.code).slice(0, 240), caseId: active?.caseId || null, phase: active?.phase || null });
    const next = error?.failure || { ...genericFailure(error), ...active };
    if (failure) { if (secondaryErrors.length < 32) secondaryErrors.push(next); return; }
    failure = next;
    await deps.send({ type: 'failure', nonce: options.nonce, failure });
  };
  try {
    if (options.scenario !== undefined && options.scenario !== 'media-preservation') throw fail('transition-scenario-invalid');
    if(options.mediaSchema!==undefined&&(options.mediaSchema!=='f01'||options.scenario!==undefined))throw fail('transition-scenario-invalid');
    const f01=options.mediaSchema==='f01',media=options.scenario==='media-preservation'||f01;
    if (options.control !== undefined && (!f01&&media ? options.control !== 'media-profile-loss' : options.control !== 'storage-loss')) throw fail('transition-control-invalid');
    source = await deps.sourceAttestation(files,f01?['scripts/extension-e2e/f01-transition.mjs','scripts/check-installed-transition.mjs','tests/f01-installed-transition.test.cjs',
      'tests/fixtures/installed-extension/f00-payload.json','tests/fixtures/installed-extension/f01-transition-seed.json','tests/fixtures/installed-extension/f01-transition-expected-media.json',
      'audio-settings-ui.js','gain-authority.js','web/player-gain.js']:[]);
    const published = await deps.readPublishedPayload();
    const metadata=validatePayloadMetadata(JSON.parse(await (await openOwnedRoot(repositoryRoot)).readFile('tests/fixtures/installed-extension/published-payload.json','utf8')));
    const currentNames=[...metadata.map(entry=>entry.name),'media-profiles.js',...(f01?['gain-authority.js','web/player-gain.js','audio-settings-ui.js']:[])].sort();
    const first = await deps.verifyCandidate(options.candidateIds[0], files.root);
    const current = await payloadFromDirectory(first.dist,currentNames);
    const second = await deps.verifyCandidate(options.candidateIds[1], files.root);
    if (current.inventorySha256 !== (await payloadFromDirectory(second.dist,currentNames)).inventorySha256) throw fail('transition-build-reproducibility');
    candidateInventory = current.inventorySha256;
    const responses = await deps.loadFixtureResponses(files);
    const frozen=f01?readFrozenF00Payload(files.root,JSON.parse(await files.readFile('tests/fixtures/installed-extension/f00-payload.json','utf8'))):null;
    const seedFixture=f01?JSON.parse(await files.readFile('tests/fixtures/installed-extension/f01-transition-seed.json','utf8')):null,
      expectedFixture=f01?JSON.parse(await files.readFile('tests/fixtures/installed-extension/f01-transition-expected-media.json','utf8')):null;
    const audioResponses=f01?(await loadAudioFixtureResponses(files)).map(row=>row.url===FIXTURE_AUDIO_URL?{...row,url:FIXTURE_LIVE_URL}:row):null;
    if(f01)payloads={published:{count:58,inventorySha256:published.inventorySha256},f00:{count:59,inventorySha256:frozen.inventorySha256},f01:{count:62,inventorySha256:current.inventorySha256}};
    let failureArtifacts = false;
    for (const assigned of options.roots) {
      const work = await deps.openWorkRoot(await files.resolve(assigned.root, { type: 'directory' }));
      const profilePath = await work.ensureDirectory('profile'), extensionPath = await work.ensureDirectory('extension'), artifactPath = await work.ensureDirectory('trace');
      let expectedId,presetId;
      const assignment=Object.fromEntries(Object.entries(assigned).filter(([key])=>key!=='root')),
        stages=f01?f01TransitionStages(assignment,options.control):(media ? ['seed',...MEDIA_TRANSITION_PHASES] : ['seed', 'old', 'new', 'rollback']).map(phase=>({phase}));
      for (const [launchOccurrence,stage] of stages.entries()) {
        const {phase,payload}=stage;
        active = { caseId: assigned.caseId, phase, step: 'replace', stage: 'replace',...(media?{launchOccurrence}:{}) };
        const sourcePayload=f01?(payload==='f01'?current:payload==='f00'?frozen:published):(phase==='new'?current:published);
        const entries = phasePayload(sourcePayload, phase === 'seed' ? 'old' : phase,
          f01?(assignment.kind==='legacy'&&phase==='new'?options.control:undefined):phase === 'new' && (!media || launchOccurrence===4) ? options.control : undefined);
        await replacePayload(work, entries);
        active = { ...active, step: 'prelaunch', stage: 'inventory' };
        const beforeHash = await checkInventory(extensionPath, entries);
        const intent = { type: 'launch-intent', nonce: options.nonce, caseId: assigned.caseId, phase,
          launchId:media?`${assigned.caseId}:${launchOccurrence}:${phase}`:`${assigned.caseId}:${phase}`,root:assigned.root,...(media?{launchOccurrence}:{}),...(f01?{payload}:{}) };
        active = { ...active, step: 'launch', stage: 'launch' };
        await deps.requestLaunch(intent);
        let context,browserSession,shutdown,traced = false, closed = false, phaseError;
        try {
          let launched = await deps.launchInstalledExtension({ chromiumApi: chromium, extensionPath, profilePath, artifactPath, headed: options.headed });
          context = launched.context;
          context.setDefaultTimeout(15000);
          launched = await deps.refreshTransitionWorker(launched);
          if(media)browserSession=await deps.openMediaBrowserSession(context);
          if (expectedId && expectedId !== launched.extensionId) throw fail('transition-execution');
          expectedId ||= launched.extensionId;
          await context.tracing.start({ screenshots: false, snapshots: true, sources: false }); traced = true;
          if (phase === 'seed') {
            active = { ...active, step: 'seed', stage: 'seed' };
            const popup = await context.newPage();
            await popup.goto(`chrome-extension://${expectedId}/popup.html`, { waitUntil: 'domcontentloaded' });
            await popup.locator('#settings-status[data-phase="ready"]').waitFor({ timeout: 15000 });
            const raw = await launched.worker.evaluate(() => chrome.storage.local.get(null));
            if (!isDeepStrictEqual(raw, {})) throw fail('transition-seed-not-empty');
            const seed = f01&&assignment.kind==='f01'?f01TransitionSeed(assignment.mediaCase,options.nonce,seedFixture):transitionSeed(assigned.caseId, options.nonce);
            await launched.worker.evaluate(value => chrome.storage.local.set(value), seed);
            if (!isDeepStrictEqual(await launched.worker.evaluate(() => chrome.storage.local.get(null)), seed)) throw fail('transition-seed-write');
            seeds.push({ caseId: assigned.caseId, raw: seed, extensionId: expectedId, writes: 1, preparation: launched.preparation });
          } else {
            const args={ ...launched, responses, caseId: assigned.caseId, phase,runNonce:options.nonce,
              expectedBrokerSource:entries.find(entry=>entry.name==='settings-broker.js').bytes.toString('utf8') };
            const result = f01?(assignment.kind==='legacy'?await deps.runTransitionPhase(args):await runF01TransitionPhase({...args,responses:audioResponses,
              caseId:assignment.mediaCase,assignedCaseId:assignment.caseId,occurrence:launchOccurrence,payload,browserSession,...(presetId?{presetId}:{}),
              seed:seedFixture,expected:expectedFixture,expectedBrokerFunction:brokerFunctionSource(args.expectedBrokerSource)})):
              media ? await deps.runInstalledMediaPreservationScenario({...args,launchOccurrence,browserSession,presetId}) : await deps.runTransitionPhase(args);
            if(media&&launchOccurrence===2)presetId=result.presetId;
            phases.push({ ...result,...(f01?{payload,launchOccurrence}:{}), extensionId: expectedId, inventorySha256: beforeHash, preparation: launched.preparation,
              manifestSha256: entries.find(entry => entry.name === 'manifest.json').sha256 });
            if(f01&&assignment.loss&&launchOccurrence===2){
              const raw=await launched.worker.evaluate(()=>chrome.storage.local.get(null));
              if(!isDeepStrictEqual(raw,expectedF01TransitionRaw({caseId:'valid-v1',runNonce:options.nonce,seed:seedFixture,expected:expectedFixture,occurrence:2,step:'final',presetId})))throw fail('f01-transition-loss-preparation');
              await launched.worker.evaluate(async loss=>{const raw=await chrome.storage.local.get('mediaProfiles'),store=raw.mediaProfiles;
                if(loss==='preset-id')delete store.presets[1].id;else delete store.channels[0].audio.values[loss==='owned-gain'?'audioGain':loss==='inherit-bit'?'gainInherited':'eq125'];
                await chrome.storage.local.set({mediaProfiles:store});},assignment.loss);
            }
          }
        } catch (error) {
          const expectedLoss=f01&&options.control&&(assignment.kind==='legacy'?matchesStorageLoss(error?.failure,options.nonce,expectedId):
            launchOccurrence===3&&presetId&&matchF01TransitionLoss(error?.failure,expectedF01TransitionRaw({caseId:'valid-v1',runNonce:options.nonce,seed:seedFixture,expected:expectedFixture,occurrence:3,step:'startup',presetId}),assignment.loss,expectedId));
          if(expectedLoss)detected.push(error.failure);else{phaseError = error; await noticeFailure(error);}
          if (!expectedLoss && context && !failureArtifacts) {
            failureArtifacts = true;
            try {
              const page = context.pages().at(-1);
              if (page) {
                const screenshot = await page.screenshot({ fullPage: false, timeout: 5000 });
                if (screenshot.length > 8388608) throw fail('transition-artifact-limit');
                await files.writeFile(`${options.artifact}/failure.png`, screenshot, { flag: 'wx' });
              }
              if (traced) {
                const trace = `${options.artifact}/trace.zip`;
                await timeout(() => context.tracing.stop({ path: awaitPath(files, trace) }), 10000, 'transition-trace-timeout');
                traced = false;
                if ((await files.lstat(trace)).size > 33554432) { await files.removeTree(trace); throw fail('transition-artifact-limit'); }
              }
            } catch (artifactError) { cleanupErrors.push({ code: artifactError?.code || 'transition-artifact-failed', caseId: assigned.caseId, phase }); }
          }
        } finally {
          if (context) {
            if (traced) {
              try { await timeout(() => context.tracing.stop(), 10000, 'transition-trace-timeout'); }
              catch (error) { cleanupErrors.push({ code: error?.code || 'transition-trace-failed', caseId: assigned.caseId, phase }); }
            }
            try {
              if(media){shutdown=await deps.closeInstalledMediaBrowser({context,browserSession,profilePath});
                if(shutdown?.browserCloseAcknowledged!==true||shutdown?.browserDisconnected!==true||shutdown?.ownedRootClosed!==true)throw fail('media-close-unconfirmed');
                await context.close();
              }else await timeout(async () => { for (const page of context.pages()) await page.close(); await context.close(); }, 10000, 'transition-close-timeout');
              closed = true;await deps.send({...intent,type:'close-success',...(media?{shutdown}:{})});
            } catch (error) { cleanupErrors.push({ code: error?.code || 'transition-close-failed', caseId: assigned.caseId, phase }); }
          }
        }
        if (!closed) { active = { ...active, step: 'close', stage: 'close' }; throw phaseError || fail('cleanup-unconfirmed'); }
        active = { ...active, step: 'postclose', stage: 'inventory' };
        await checkInventory(extensionPath, entries);
        if (phaseError) throw phaseError;
        if (cleanupErrors.length) throw fail('transition-cleanup-failed');
      }
    }
  } catch (error) { await noticeFailure(error); }
  try { after = await deps.sourceAttestation(files); if (source && !isDeepStrictEqual(source, after)) throw fail('transition-source-changed'); }
  catch (error) { await noticeFailure(error); }
  await deps.send({ type: 'result', nonce: options.nonce, result: { source, after, candidateInventory, seeds, phases, failure, cleanupErrors, secondaryErrors,
    ...(options.scenario?{scenario:options.scenario}:{}),...(options.mediaSchema?{mediaSchema:options.mediaSchema,payloads,detected}:{}) } });
}

// This path is below the freshly claimed artifact root; Playwright needs an absolute output path.
const awaitPath = (files, value) => path.join(files.root, ...value.split('/'));

const dependenciesDefault = {
  openRepository: () => openOwnedRoot(repositoryRoot),
  forkChild: () => fork(scriptPath, [], { detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true }),
  supervise: superviseTransitionChild,
  removeCandidate,
};

export async function runInstalledTransition({ runId, headed = false, scenario, mediaSchema, control, dependencies = {} } = {}) {
  if (!/^[A-Za-z0-9]{1,64}$/.test(runId || '') || typeof headed !== 'boolean') throw fail('installed-e2e-args-invalid');
  if (scenario !== undefined && scenario !== 'media-preservation') throw fail('transition-scenario-invalid');
  if(mediaSchema!==undefined&&(mediaSchema!=='f01'||scenario!==undefined))throw fail('transition-scenario-invalid');
  const f01=mediaSchema==='f01',media=scenario==='media-preservation'||f01;
  if (control !== undefined && (!f01&&media ? control !== 'media-profile-loss' : control !== 'storage-loss')) throw fail('transition-control-invalid');
  const deps = { ...dependenciesDefault, ...dependencies }, files = await deps.openRepository();
  const nonce = randomBytes(16).toString('hex'), artifact = `output/playwright/installed-extension-transition-${runId}`;
  const claim = `output/playwright/installed-transition-claim-${runId}.lock`, candidateIds = [`B2${runId}A`, `B2${runId}B`];
  const roots = [], candidates = [], cleanupErrors = [], secondaryErrors = [];
  let claimed = false, artifactCreated = false, supervision, primary, child, report;
  try {
    await files.ensureDirectory('output/playwright');
    if (await files.lstat(artifact, { optional: true })) throw fail('transition-artifact-exists');
    await files.writeFile(claim, nonce, { flag: 'wx' }); claimed = true;
    await files.ensureDirectory(artifact); artifactCreated = true;
    for (const id of candidateIds) {
      const directory = `output/tool-audit/p02-candidate-${id}`;
      if (await files.lstat(directory, { optional: true })) throw fail('transition-candidate-exists');
      await files.ensureDirectory(directory); candidates.push(id);
    }
    for (const assigned of f01?f01TransitionAssignments(control):(media || control ? ['valid-ui'] : TRANSITION_CASES).map(caseId=>({caseId}))) {
      roots.push({ ...assigned, root: relative(files, await files.makeTempDirectory('output/playwright/installed-transition-work-')) });
    }
    child = deps.forkChild();
    const pending = deps.supervise({ child, nonce, roots,...(scenario?{scenario}:{}),...(f01?{mediaSchema,control}:{}) });
    child.send({ nonce, roots, candidateIds, artifact, runId, headed, control,...(scenario?{scenario}:{}),...(f01?{mediaSchema}:{}) }, error => { if (error) child.emit('error', error); });
    supervision = await pending;
    primary = supervision.failure;
    const result = supervision.result;
    if (!result || !result.source || !isDeepStrictEqual(result.source, result.after)) primary ||= genericFailure(fail('transition-source-changed'));
    if (Array.isArray(result?.cleanupErrors)) cleanupErrors.push(...result.cleanupErrors);
    secondaryErrors.push(...(supervision.secondaryErrors || []), ...(result?.secondaryErrors || []));
    cleanupErrors.push(...supervision.cleanupErrors);
    if(f01&&!primary&&supervision.normalExit&&!supervision.unconfirmedRoots.length&&!cleanupErrors.length&&!secondaryErrors.length){
      validateF01TransitionResult(result,nonce,control,supervision.launches,JSON.parse(await files.readFile('tests/fixtures/installed-extension/f01-transition-seed.json','utf8')),
        JSON.parse(await files.readFile('tests/fixtures/installed-extension/f01-transition-expected-media.json','utf8')));
      report={ok:true,mediaSchema,control,result};
    }else if(!f01&&media&&control&&primary&&supervision.normalExit&&!supervision.unconfirmedRoots.length&&!cleanupErrors.length&&!secondaryErrors.length&&
      matchesInstalledMediaLoss(primary,nonce,result?.seeds?.[0]?.extensionId,result?.phases?.find(value=>value.launchOccurrence===2)?.presetId)){
      validateInstalledMediaTransitionResult(result,nonce,control,supervision.launches);report={ok:true,scenario,control,detected:primary,result};primary=null;
    }else if (!media && control && primary && supervision.normalExit && !supervision.unconfirmedRoots.length && !cleanupErrors.length && !secondaryErrors.length &&
        matchesStorageLoss(primary, nonce, result?.seeds?.[0]?.extensionId)) {
      validateTransitionResult(result, nonce, control, supervision.launches);
      const old = result?.phases;
      if (old?.length !== 1 || old[0].caseId !== 'valid-ui' || old[0].phase !== 'old' || old[0].final?.raw?.settingsRevision !== 8) throw fail('transition-control-old-baseline');
      report = { ok: true, control, detected: primary, result }; primary = null;
    } else if (!f01&&!primary && !secondaryErrors.length) {
      if (control) throw fail('transition-control-unexpected-pass');
      if(media)validateInstalledMediaTransitionResult(result,nonce,control,supervision.launches);else validateTransitionResult(result, nonce, control, supervision.launches);
      report = { ok: true, result };
    }
    if(f01&&!report&&!primary)throw fail('f01-transition-result');
  } catch (error) { primary ||= genericFailure(error); }
  finally {
    const uncertain = new Set(supervision?.unconfirmedRoots || (child && !supervision ? roots.map(value => value.root) : []));
    for (const assigned of roots) {
      if(media)continue;
      if (uncertain.has(assigned.root) || (child && !supervision?.normalExit)) {
        cleanupErrors.push({ code: 'cleanup-unconfirmed', caseId: assigned.caseId, phase: null }); continue;
      }
      try { await files.removeTree(assigned.root); }
      catch (error) { cleanupErrors.push({ code: error?.code || 'transition-root-cleanup', caseId: assigned.caseId, phase: null }); }
    }
    for (const id of candidates) {
      if(media)continue;
      if (child && !supervision?.normalExit) { cleanupErrors.push({ code: 'cleanup-unconfirmed', caseId: null, phase: null }); continue; }
      try { await deps.removeCandidate(id); }
      catch (error) { cleanupErrors.push({ code: error?.code || 'transition-candidate-cleanup', caseId: null, phase: null }); }
    }
    if (claimed) {
      try { await files.removeTree(claim); }
      catch (error) { cleanupErrors.push({ code: error?.code || 'transition-claim-cleanup', caseId: null, phase: null }); }
    }
  }
  report = { ...(report || {}), ...(supervision?.result ? { result: supervision.result } : {}), ok: !primary && cleanupErrors.length === 0 && secondaryErrors.length === 0, runId, ...(control ? { control } : {}),
    ...(primary ? { failure: primary } : {}), cleanupErrors: cleanupErrors.slice(0, 32), secondaryErrors: secondaryErrors.slice(0, 32),
    retainedRoots: roots.filter(value => media || supervision?.unconfirmedRoots.includes(value.root) || (child && !supervision?.normalExit)),
    ...(media?{...(scenario?{scenario}:{}),...(f01?{mediaSchema}:{}),candidatesRetained:true,shutdown:{normalExit:supervision?.normalExit===true,
      closes:(supervision?.launches||[]).map(value=>({caseId:value.caseId,phase:value.phase,launchOccurrence:value.launchOccurrence,...(f01?{payload:value.payload}:{}),closed:value.closed===true,
        browserCloseAcknowledged:value.shutdown?.browserCloseAcknowledged===true,browserDisconnected:value.shutdown?.browserDisconnected===true,
        ownedRootClosed:value.shutdown?.ownedRootClosed===true}))}}:{}),
    limits: ['bundled-code-relaunch-not-native-update', 'no-platform-rollback', 'detached-browser-needs-close-ack'] };
  if (artifactCreated) {
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (Buffer.byteLength(text) > 1048576) throw fail('transition-artifact-limit');
    await files.writeFile(`${artifact}/summary.json`, text, { flag: 'wx' });
  }
  if (!report.ok) { const error = fail(primary?.code || 'transition-cleanup-failed'); error.failure = report.failure; error.report = report; throw error; }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  if (process.send) {
    process.once('message', options => {
      void executeTransitionChild(options).then(() => process.disconnect()).catch(error => {
        console.error(error?.code || error?.message); process.exitCode = 1; process.disconnect();
      });
    });
  } else {
    try {
      const args = process.argv.slice(2);
      if(args.some(value=>value.startsWith('--media-schema='))){
        const report=await runInstalledTransition(parseF01TransitionArgs(args));
        console.log(JSON.stringify({ok:report.ok,runId:report.runId,mediaSchema:report.mediaSchema,control:report.control,phases:report.result.phases.length}));
      }else{
      const controls = args.filter(value => value.startsWith('--control=')),scenarios=args.filter(value=>value.startsWith('--scenario='));
      if(scenarios.length>1||scenarios.length===1&&scenarios[0]!=='--scenario=media-preservation')throw fail('transition-scenario-invalid');
      const media=scenarios.length===1;
      if (controls.length > 1 || (controls.length === 1 && controls[0] !== (media?'--control=media-profile-loss':'--control=storage-loss'))) throw fail('transition-control-invalid');
      const options = parseInstalledE2EArgs(args.filter(value => !value.startsWith('--control=')&&!value.startsWith('--scenario=')));
      if (options.qualification !== undefined) throw fail('installed-e2e-args-invalid');
      const report = await runInstalledTransition({ ...options,...(media?{scenario:'media-preservation'}:{}),...(controls.length?{control:media?'media-profile-loss':'storage-loss'}:{}) });
      console.log(JSON.stringify({ ok: report.ok, runId: report.runId, control: report.control, phases: report.result.phases.length }));
      }
    } catch (error) { console.error(error?.code || error?.message); process.exitCode = 1; }
  }
}
