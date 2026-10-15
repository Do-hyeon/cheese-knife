import { isDeepStrictEqual } from 'node:util';
import { observeInstalledProtocol } from './installed-protocol.mjs';
import { FIXTURE_LIVE_URL, FIXTURE_CHANNEL_URL, fixtureDecision } from './fixture-router.mjs';

export const TRANSITION_CASES = Object.freeze(['valid-ui', 'legacy-valid', 'legacy-null', 'legacy-invalid', 'damaged-revision']);
const defaults = Object.freeze({ preview: true, livePreview: true, previewStartUnmuted: false, previewWidth: 400, previewDelay: 1,
  previewVolume: 5, rightClickToUnmute: true, updateSidebar: true, expandFollowings: false, popupPlayer: true,
  arrowSeek: true, pressToFastForward: true, brightness: 1, contrast: 1, saturation: 1, gamma: 1, sharpness: 0,
  compressorDefault: false, compressorThreshold: -50, compressorKnee: 40, compressorRatio: 12,
  compressorAttack: 0, compressorRelease: 0.25, hideDonation: false, showDeleted: false });
const fail = code => Object.assign(new Error(code), { code });
const stageFor = phase => phase === 'new' ? 'candidate-init' : phase === 'old' ? 'old-init' : 'rollback-init';

export const MEDIA_TRANSITION_PHASES = Object.freeze(['old','new','rollback','new']);
export function expectedInstalledMediaStore(runNonce,presetId) {
  transitionSeed('valid-ui',runNonce);
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(presetId))throw fail('media-preset-identity');
  const audio={compressorDefault:false,compressorThreshold:-35,compressorKnee:40,compressorRatio:12,compressorAttack:0,compressorRelease:0.25};
  return {schema:1,revision:5,channels:[{channelId:'a'.repeat(32),createdRevision:1,revision:2,audio:{createdRevision:1,values:audio}},
    {channelId:'b'.repeat(32),createdRevision:3,revision:2,video:{createdRevision:3,values:{brightness:1.75,contrast:1,saturation:1,gamma:1,sharpness:0}}}],
    presets:[{id:presetId,createdRevision:5,revision:1,name:'F00 '+runNonce,domain:'audio',values:{...audio}}]};
}
export function expectedInstalledMediaLoss(store) {
  const lost=structuredClone(store),channel=lost.channels.find(value=>value.channelId==='a'.repeat(32));
  if(!channel?.audio)throw fail('media-loss-control-invalid');delete channel.audio;
  if(!channel.video)lost.channels=lost.channels.filter(value=>value!==channel);return lost;
}
export function matchesInstalledMediaLoss(failure,runNonce,extensionId,presetId) {
  if(!/^[a-p]{32}$/.test(extensionId||'')||failure?.code!=='media-preservation'||failure.caseId!=='valid-ui'||
    failure.phase!=='new'||failure.launchOccurrence!==4||failure.step!=='startup'||failure.stage!=='candidate-init'||
    !Array.isArray(failure.cleanupErrors)||failure.cleanupErrors.length)return false;
  const raw={...transitionSeed('valid-ui',runNonce),mediaProfiles:expectedInstalledMediaLoss(expectedInstalledMediaStore(runNonce,presetId))};
  return isDeepStrictEqual(failure.observation?.raw,raw)&&isDeepStrictEqual(failure.observation?.execution,{extensionId,version:'2.13.4',brokerMatches:true});
}

/** Four cold observations; only first-new explicitly creates media data through the actual TAB. */
export async function runInstalledMediaPreservationScenario({context,worker,extensionId,responses,phase,launchOccurrence,runNonce,expectedBrokerSource,browserSession,presetId}) {
  if(!Number.isInteger(launchOccurrence)||MEDIA_TRANSITION_PHASES[launchOccurrence-1]!==phase)throw fail('media-occurrence-invalid');
  const {openInstalledMediaSettings}=await import('./popup-cdp.mjs');
  let step='startup',observation;
  const snapshot=()=>worker.evaluate(()=>chrome.storage.local.get(null));
  try{
    const execution=await worker.evaluate(()=>({extensionId:chrome.runtime.id,version:chrome.runtime.getManifest().version,brokerSource:createSettingsBroker.toString()}));
    execution.brokerMatches=execution.brokerSource===brokerFunctionSource(expectedBrokerSource);delete execution.brokerSource;
    if(!isDeepStrictEqual(execution,{extensionId,version:phase==='old'?'2.13.3':phase==='rollback'?'2.13.5':'2.13.4',brokerMatches:true}))throw fail('media-execution');
    observation={raw:await snapshot(),execution};
    const expectedRaw={...transitionSeed('valid-ui',runNonce),...(launchOccurrence>=3?{mediaProfiles:expectedInstalledMediaStore(runNonce,presetId)}:{})};
    if(!isDeepStrictEqual(observation.raw,expectedRaw))throw fail('media-preservation');
    const records=[{step,observation}];
    await context.route(/^https?:\/\//,async route=>{const decision=fixtureDecision(route.request().url(),responses);
      if(decision.action==='fulfill')await route.fulfill({status:decision.status,contentType:decision.contentType,body:decision.body});else await route.abort('blockedbyclient');});
    await context.routeWebSocket(/.*/,socket=>socket.close());
    const page=await context.newPage();await page.goto(FIXTURE_LIVE_URL,{waitUntil:'domcontentloaded'});
    const expectedProtocol=phase==='new'?2:1;
    await page.waitForFunction(protocol=>{const runtime=window[Symbol.for('cheese-knife.runtime.v1')];return runtime?.configReady&&
      (protocol===1||runtime.ownerProtocol===2&&runtime.media.phase!=='pending');},expectedProtocol,{timeout:15000});
    let popup;
    if(phase==='new')popup=(await openInstalledMediaSettings({context,worker,fixturePage:page,extensionId,browserSession})).settingsPage;
    else{popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`,{waitUntil:'domcontentloaded'});
      await popup.locator('#settings-status[data-phase="ready"]').waitFor({timeout:15000});}
    if(launchOccurrence===2){
      step='create-media';await popup.locator('#media-scope').selectOption('current');await popup.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
      await popup.locator('#media-audio-enable').click();await waitTransition(snapshot,raw=>raw?.mediaProfiles?.channels[0]?.audio,'media-enable-timeout');
      await popup.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});await popup.locator('#compressorThreshold').fill('-35');
      await waitTransition(snapshot,raw=>raw?.mediaProfiles?.channels[0]?.audio?.values.compressorThreshold===-35,'media-audio-timeout');
      await page.goto(FIXTURE_CHANNEL_URL,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window[Symbol.for('cheese-knife.runtime.v1')]?.configReady,null,{timeout:15000});
      const video=(await openInstalledMediaSettings({context,worker,fixturePage:page,extensionId,browserSession})).settingsPage;
      await video.locator('#media-scope').selectOption('current');await video.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
      await video.locator('#media-video-enable').click();await waitTransition(snapshot,raw=>raw?.mediaProfiles?.channels.some(value=>value.video),'media-video-enable-timeout');
      await video.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});await video.locator('#brightness').fill('1.75');
      await waitTransition(snapshot,raw=>raw?.mediaProfiles?.channels.find(value=>value.channelId==='b'.repeat(32))?.video?.values.brightness===1.75,'media-video-timeout');
      await page.goto(FIXTURE_LIVE_URL,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window[Symbol.for('cheese-knife.runtime.v1')]?.media.phase==='ready',null,{timeout:15000});
      popup=(await openInstalledMediaSettings({context,worker,fixturePage:page,extensionId,browserSession})).settingsPage;
      await popup.locator('#media-scope').selectOption('current');await popup.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});
      await popup.locator('#media-preset-name').fill('F00 '+runNonce);await popup.locator('#media-preset-create').click();
      const created=await waitTransition(snapshot,raw=>raw?.mediaProfiles?.presets.length===1,'media-preset-timeout');presetId=created.mediaProfiles.presets[0].id;
      observation={raw:await snapshot(),execution};
      if(!isDeepStrictEqual(observation.raw,{...transitionSeed('valid-ui',runNonce),mediaProfiles:expectedInstalledMediaStore(runNonce,presetId)}))throw fail('media-preservation');
      records.push({step,observation});
    }
    step='observe-ui';
    if(phase==='new'&&launchOccurrence===4){await popup.locator('#media-scope').selectOption('current');await popup.locator('#media-status[data-phase="ready"]').waitFor({timeout:15000});}
    const brightness=await popup.locator('#brightness').inputValue(),threshold=await popup.locator('#compressorThreshold').inputValue();
    if(Number(brightness)!==1.25||Number(threshold)!==(phase==='new'?-35:-50))throw fail('media-ui-values');
    const main=await page.evaluate(()=>{const runtime=window[Symbol.for('cheese-knife.runtime.v1')];return {brightness:runtime.config.brightness,threshold:runtime.config.compressorThreshold};});
    if(main.brightness!==1.25||main.threshold!==(phase==='new'?-35:-50))throw fail('media-main-values');
    observation={raw:await snapshot(),execution};
    if(!isDeepStrictEqual(observation.raw,{...transitionSeed('valid-ui',runNonce),...(presetId?{mediaProfiles:expectedInstalledMediaStore(runNonce,presetId)}:{})}))throw fail('media-preservation');
    records.push({step,observation});return {caseId:'valid-ui',phase,launchOccurrence,records,final:observation,presetId};
  }catch(error){error.failure={code:error.code||'media-phase-failed',caseId:'valid-ui',phase,launchOccurrence,step,stage:step==='startup'?stageFor(phase):'phase-action',
    ...(observation?{observation}:{}),cleanupErrors:[]};throw error;}
}

export function transitionSeed(caseId, runNonce) {
  if (!TRANSITION_CASES.includes(caseId)) throw fail('transition-case-invalid');
  if (typeof runNonce !== 'string' || !/^[a-f0-9]{32}$/.test(runNonce)) throw fail('transition-nonce-invalid');
  const raw = { config: { futureFlag: 'keep', brightness: 1.25 }, styles: ['future-style'], styleParameters: { future: 9 },
    settingsRevision: 4, futureTop: { runNonce, untouched: true } };
  if (caseId.startsWith('legacy-')) { raw.config.resizeChat = caseId === 'legacy-valid'; raw.t = caseId === 'legacy-valid' ? 0 : caseId === 'legacy-null' ? null : 'invalid'; }
  if (caseId === 'damaged-revision') raw.settingsRevision = 'invalid-b2';
  return raw;
}

export function expectedTransitionRaw(caseId, phase, step, runNonce) {
  const raw = transitionSeed(caseId, runNonce);
  if (!['old', 'new', 'rollback'].includes(phase)) throw fail('transition-step-invalid');
  if (caseId !== 'valid-ui') {
    if (step !== 'startup') throw fail('transition-step-invalid');
    if (caseId.startsWith('legacy-')) delete raw.t;
    if (caseId === 'legacy-valid') { delete raw.config.resizeChat; raw.config.sharpness = 0; raw.styles.push('chat-resize'); raw.settingsRevision = 5; }
    return raw;
  }
  const stages = phase === 'old' ? ['startup', 'arrow-off', 'volume25', 'hide-ranking-on', 'font8'] :
    phase === 'new' ? ['startup', 'two-popup-merge', 'font0'] : ['startup', 'volume26', 'rollback-font8', 'rollback-font0'];
  const index = stages.indexOf(step); if (index < 0) throw fail('transition-step-invalid');
  if (phase === 'old') {
    raw.settingsRevision = 4 + index;
    if (index >= 1) raw.config.arrowSeek = false;
    if (index >= 2) raw.config.previewVolume = 25;
    if (index >= 3) raw.styles.push('hide-ranking');
    if (index >= 4) { raw.styles.push('chat-font-size'); raw.styleParameters['chat-font-size'] = 8; }
  } else if (phase === 'new') {
    raw.settingsRevision = [8, 10, 11].at(index);
    raw.config.arrowSeek = index > 0; raw.config.previewVolume = index > 0 ? 35 : 25;
    raw.styles.push('hide-ranking'); if (index < 2) raw.styles.push('chat-font-size');
    raw.styleParameters['chat-font-size'] = index < 2 ? 8 : 0;
  } else {
    raw.settingsRevision = 11 + index; raw.config.arrowSeek = true; raw.config.previewVolume = index ? 26 : 35;
    raw.styles.push('hide-ranking'); if (index === 2) raw.styles.push('chat-font-size');
    raw.styleParameters['chat-font-size'] = index === 2 ? 8 : 0;
  }
  return raw;
}

export function expectedTransitionState(caseId, phase, step, runNonce, extensionId, { reloaded = false, reloads = [0, 0], expectedProtocol = phase==='new'?3:1 } = {}) {
  if (![1,2,3].includes(expectedProtocol)) throw fail('installed-protocol-invalid');
  const raw = expectedTransitionRaw(caseId, phase, step, runNonce), repair = caseId === 'damaged-revision';
  const known = { ...defaults, brightness: 1.25 };
  if (expectedProtocol===3) Object.assign(known,{audioDefault:false,compressorEnabled:true,audioGain:1,gainInherited:true,
    eqEnabled:false,eq63:0,eq125:0,eq250:0,eq500:0,eq1000:0,eq2000:0,eq4000:0,eq8000:0,
    normalizerEnabled:false,normalizerTargetDbfs:-20});
  if (Object.hasOwn(raw.config, 'arrowSeek')) known.arrowSeek = raw.config.arrowSeek;
  if (Object.hasOwn(raw.config, 'previewVolume')) known.previewVolume = raw.config.previewVolume;
  const font = raw.styleParameters['chat-font-size'], ranking = raw.styles.includes('hide-ranking');
  const cssFiles = [];
  if (raw.styles.includes('chat-font-size')) cssFiles.push('styles/chat-font-size.css');
  if (ranking) cssFiles.push('styles/hide-ranking.css');
  if (raw.styles.includes('chat-resize')) cssFiles.push('styles/chat-resize.css');
  return { raw,
    execution: { extensionId, version: phase === 'old' ? '2.13.3' : phase === 'new' ? '2.13.4' : '2.13.5', brokerMatches: true },
    ui: { popupPhase: repair ? 'repair-required' : 'ready', stylesPhase: repair ? 'repair-required' : 'ready',
      arrowSeek: repair ? true : known.arrowSeek, previewVolume: repair ? 5 : known.previewVolume, brightness: repair ? 1 : 1.25,
      hideRanking: repair ? false : ranking, fontSize: repair ? 0 : font ?? 0,
      popupArrowDisabled: repair, popupVolumeDisabled: repair, secondArrowDisabled: repair, secondVolumeDisabled: repair,
      stylesRankingDisabled: repair, stylesFontDisabled: repair,
      secondArrowSeek: repair ? true : known.arrowSeek, secondPreviewVolume: repair ? 5 : known.previewVolume },
    css: { registrations: cssFiles.length ? [{ id: 'styles', css: cssFiles, matches: ['https://chzzk.naver.com/*'], runAt: 'document_start', js: [] }] : [],
      font: typeof font === 'number' ? [1, 2, 10, 20].map(divisor => `${font / divisor}px`) : ['', '', '', ''],
      ranking: ranking && (phase !== 'old' || reloaded) ? 'none' : 'block', reloads },
    runtime: { ready: true, config: known, requestIdObserved: true, revisionObserved: true, duplicatedControls: false } };
}

export function assertTransitionState(actual, expected) {
  for (const [key, code] of [['execution', 'transition-execution'], ['raw', 'transition-storage-preservation'],
    ['ui', 'transition-ui'], ['css', 'transition-css'], ['runtime', 'transition-main']]) {
    const left = Object.getOwnPropertyDescriptor(actual || {}, key)?.value;
    const right = Object.getOwnPropertyDescriptor(expected || {}, key)?.value;
    if (!right || !isDeepStrictEqual(left, right)) throw fail(code);
  }
}

export async function waitTransition(read, accept, code, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const value = await read(); if (accept(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  throw fail(code);
}

export function brokerFunctionSource(source) {
  const marker = 'var createSettingsBroker = ', index = source.indexOf(marker);
  if (index < 0 || source.indexOf(marker, index + marker.length) >= 0) throw fail('transition-execution');
  return source.slice(index + marker.length).trim().replace(/;$/, '');
}

/** Observes packaged UI and worker only; the runner owns seed and context lifetime. */
export async function runTransitionPhase({ context, worker, extensionId, responses, caseId, phase, runNonce, expectedBrokerSource, expectedProtocol }) {
  if (![1,2,3].includes(expectedProtocol)) throw fail('installed-protocol-invalid');
  let step = 'startup', observation;
  try {
    expectedTransitionRaw(caseId, phase, step, runNonce);
    const execution = await worker.evaluate(() => ({ extensionId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version, brokerSource: createSettingsBroker.toString() }));
    const expectedFunction = brokerFunctionSource(expectedBrokerSource);
    execution.brokerMatches = execution.brokerSource === expectedFunction;
    const diagnostic = { actualLength: execution.brokerSource.length, expectedLength: expectedFunction.length,
      actualCRLF: execution.brokerSource.split('\r\n').length - 1, expectedCRLF: expectedFunction.split('\r\n').length - 1,
      matchesAfterEOLNormalization: execution.brokerSource.replaceAll('\r\n', '\n') === expectedFunction.replaceAll('\r\n', '\n') };
    delete execution.brokerSource; observation = { execution };
    const version = phase === 'old' ? '2.13.3' : phase === 'new' ? '2.13.4' : '2.13.5';
    if (execution.extensionId !== extensionId || execution.version !== version || !execution.brokerMatches) { const error = fail('transition-execution'); error.diagnostic = diagnostic; throw error; }
    const pageErrors = [], routeErrors = [];
    const attach = page => page.on('pageerror', error => { if (pageErrors.length < 32) pageErrors.push(String(error?.message || error).slice(0, 240)); });
    for (const page of context.pages()) attach(page);
    context.on('page', attach);
    await context.route(/^https?:\/\//, async route => {
      try {
        const decision = fixtureDecision(route.request().url(), responses);
        if (decision.action === 'fulfill') await route.fulfill({ status: decision.status, contentType: decision.contentType, body: decision.body });
        else await route.abort('blockedbyclient');
      } catch (error) { if (routeErrors.length < 32) routeErrors.push(String(error?.code || error?.message).slice(0, 240)); }
    });
    await context.routeWebSocket(/.*/, socket => socket.close());
    const page = await context.newPage(); await page.goto(FIXTURE_LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const target = await worker.evaluate(async url => {
      const tabs = (await chrome.tabs.query({})).filter(tab => tab.url === url);
      return tabs.length === 1 ? { tabId: tabs[0].id, windowId: tabs[0].windowId } : null;
    }, FIXTURE_LIVE_URL);
    if (!target || ![target.tabId, target.windowId].every(Number.isSafeInteger)) throw fail('transition-target');
    const second = await context.newPage(); await second.goto(FIXTURE_LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const popupA = await context.newPage(), popupB = await context.newPage(), styles = await context.newPage();
    await Promise.all([popupA, popupB].map(popup => popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 15000 })));
    await styles.goto(`chrome-extension://${extensionId}/styles.html?targetTabId=${target.tabId}&targetWindowId=${target.windowId}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const repair = caseId === 'damaged-revision';
    await Promise.all([popupA, popupB, styles].map(ui => ui.locator(`#settings-status[data-phase="${repair ? 'repair-required' : 'ready'}"]`).waitFor({ timeout: 15000 })));
    // Ready waits are value-independent: lost raw config must reach the oracle, not a timeout.
    await Promise.all([page, second].map(current => waitTransition(()=>current.evaluate(observeInstalledProtocol,expectedProtocol),Boolean,'transition-handshake-timeout')));
    const initialLoads = await Promise.all([page, second].map(current => current.evaluate(() => window.__knifeFixture.loads)));
    let reloaded = false, reloads = [0, 0];
    const capture = async () => {
      const [raw, registrations, uiA, uiB, styleUI, styleView, main] = await Promise.all([
        worker.evaluate(() => chrome.storage.local.get(null)),
        worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts({ ids: ['styles'] })).map(value =>
          ({ id: value.id, css: value.css || [], matches: value.matches, runAt: value.runAt, js: value.js || [] }))),
        popupA.evaluate(() => ({ popupPhase: document.querySelector('#settings-status').dataset.phase,
          arrowSeek: document.querySelector('#arrowSeek').checked, previewVolume: Number(document.querySelector('#previewVolume').value),
          brightness: Number(document.querySelector('#brightness').value), popupArrowDisabled: document.querySelector('#arrowSeek').disabled,
          popupVolumeDisabled: document.querySelector('#previewVolume').disabled })),
        popupB.evaluate(() => ({ secondArrowSeek: document.querySelector('#arrowSeek').checked, secondPreviewVolume: Number(document.querySelector('#previewVolume').value),
          secondArrowDisabled: document.querySelector('#arrowSeek').disabled, secondVolumeDisabled: document.querySelector('#previewVolume').disabled })),
        styles.evaluate(() => ({ stylesPhase: document.querySelector('#settings-status').dataset.phase,
          hideRanking: document.querySelector('#hide-ranking').checked, fontSize: Number(document.querySelector('#chat-font-size').value),
          stylesRankingDisabled: document.querySelector('#hide-ranking').disabled, stylesFontDisabled: document.querySelector('#chat-font-size').disabled })),
        page.evaluate(() => ({ font: [1, 2, 10, 20].map(divisor => getComputedStyle(document.documentElement).getPropertyValue(`--knife-chat-size-${divisor}`).trim()),
          ranking: getComputedStyle(document.querySelector('[class^="live_chatting_ranking_container__"]')).display })),
        (async()=>{
          const observed=await page.evaluate(observeInstalledProtocol,expectedProtocol);
          const duplicatedControls=await page.evaluate(()=>{const ids=[...document.querySelectorAll('.knife-owned[id]')].map(item=>item.id);return new Set(ids).size!==ids.length;});
          return {ready:!!observed,config:observed?.config??null,requestIdObserved:!!observed,revisionObserved:!!observed,duplicatedControls};
        })(),
      ]);
      reloads = await Promise.all([page, second].map(async (current, i) => await current.evaluate(() => window.__knifeFixture.loads) - initialLoads.at(i)));
      return { raw, execution, ui: { ...uiA, ...uiB, ...styleUI }, css: { registrations, ...styleView, reloads }, runtime: main };
    };
    const check = async () => {
      observation = await capture();
      assertTransitionState(observation, expectedTransitionState(caseId, phase, step, runNonce, extensionId, { reloaded, reloads: reloaded ? [1, 0] : [0, 0],expectedProtocol }));
      if (pageErrors.length || routeErrors.length) throw fail('transition-page-error');
    };
    await check();
    const records = [{ step, observation }];
    if (caseId === 'valid-ui') {
      const actions = phase === 'old' ? ['arrow-off', 'volume25', 'hide-ranking-on', 'font8'] :
        phase === 'new' ? ['two-popup-merge', 'font0'] : ['volume26', 'rollback-font8', 'rollback-font0'];
      for (step of actions) {
        if (step === 'arrow-off') await popupA.locator('#arrowSeek').uncheck();
        else if (step === 'volume25') await popupA.locator('#previewVolume').fill('25');
        else if (step === 'volume26') await popupA.locator('#previewVolume').fill('26');
        else if (step === 'hide-ranking-on') await styles.locator('#hide-ranking').check();
        else if (step === 'two-popup-merge') await Promise.all([popupA.locator('#arrowSeek').check(), popupB.locator('#previewVolume').fill('35')]);
        else await styles.locator('#chat-font-size').fill(step.endsWith('font8') ? '8' : '0');
        const wanted = expectedTransitionRaw(caseId, phase, step, runNonce);
        await waitTransition(() => worker.evaluate(() => chrome.storage.local.get(null)), raw => isDeepStrictEqual(raw, wanted), 'transition-action-timeout');
        // Storage completion alone is insufficient; both real clients and MAIN must catch up.
        await waitTransition(capture, value => isDeepStrictEqual(value.ui, expectedTransitionState(caseId, phase, step, runNonce, extensionId,{expectedProtocol}).ui) &&
          isDeepStrictEqual(value.runtime.config, expectedTransitionState(caseId, phase, step, runNonce, extensionId,{expectedProtocol}).runtime.config), 'transition-ui-timeout');
        await styles.locator('#settings-status[data-phase="ready"]').waitFor({ timeout: 15000 });
        await check(); records.push({ step, observation });
        if (step === 'font8' || step === 'font0' || step === 'rollback-font8') {
          await styles.locator('#reload').click({ timeout: 15000 });
          await waitTransition(()=>page.evaluate(observeInstalledProtocol,expectedProtocol),value=>value?.load===initialLoads[0]+1,'transition-reload-handshake-timeout');
          reloaded = true; await check(); records.push({ step, reloaded: true, observation });
        }
      }
    }
    return { caseId, phase, records, final: observation };
  } catch (error) {
    error.code ||= 'transition-phase-failed';
    error.failure = { code: String(error.code).slice(0, 240), caseId, phase, step,
      stage: step === 'startup' ? stageFor(phase) : 'phase-action', ...(observation ? { observation } : {}), ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}), cleanupErrors: [] };
    throw error;
  }
}
