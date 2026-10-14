import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { runInstalledExtensionE2E } from './check-installed-extension.mjs';
import { loadAudioFixtureResponses, FIXTURE_AUDIO_URL, fixtureDecision } from './extension-e2e/fixture-router.mjs';
import { validatePayloadMetadata } from './extension-e2e/published-payload.mjs';
import { reacquireExtensionWorker } from './extension-e2e/harness.mjs';
import { openOwnedRoot } from './owned-files.mjs';

const fail = code => Object.assign(new Error(code), { code });
const requireProof = (condition, code) => { if (!condition) throw fail(code); };
export function parsePlayerGainArgs(args) {
  let runId, mode, headed = false;
  for (const arg of args) {
    if (arg === '--headed' && !headed) headed = true;
    else if (arg.startsWith('--run-id=') && runId === undefined) runId = arg.slice(9);
    else if (arg.startsWith('--mode=') && mode === undefined) mode = arg.slice(7);
    else throw fail('player-gain-args');
  }
  if (!/^[A-Za-z0-9]{1,64}$/.test(runId ?? '') || !['qualification', 'negative'].includes(mode)) throw fail('player-gain-args');
  return { runId, mode, headed };
}
async function wait(read, accept, code, milliseconds = 15000) {
  const deadline = Date.now() + milliseconds;
  do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 25)); } while (Date.now() < deadline);
  throw fail(code);
}
export function findOwnedRange(root) {
  let range = null, count = 0;
  function visit(node, inside = false) {
    if (++count > 2048) throw fail('player-gain-dom-budget');
    const attrs = node.attributes ?? [];
    const at = attrs.indexOf('class'), owner = at >= 0 && attrs[at + 1].split(/\s+/).includes('knife-gain-owner');
    if (inside && node.nodeName === 'INPUT') { if (range) throw fail('player-gain-range-ambiguous'); range = node; }
    for (const child of node.children ?? []) visit(child, inside);
    for (const child of node.shadowRoots ?? []) { if (owner && child.shadowRootType !== 'closed') throw fail('player-gain-shadow-open'); visit(child, inside || owner); }
  }
  visit(root); if (!range) throw fail('player-gain-range-missing'); return range.nodeId;
}
async function rangePoint(cdp) {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const nodeId = findOwnedRange(root), { model } = await cdp.send('DOM.getBoxModel', { nodeId });
  requireProof(model.content.length === 8 && model.content.every(Number.isFinite), 'player-gain-box-invalid');
  return { nodeId, x: (model.content[0] + model.content[2]) / 2, y: (model.content[1] + model.content[5]) / 2 };
}
async function readRange(cdp, nodeId) {
  const { object } = await cdp.send('DOM.resolveNode', { nodeId });
  try {
    const result = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){return {value:Number(this.value),disabled:this.disabled,focused:this.getRootNode().activeElement===this};}', returnByValue: true });
    return result.result.value;
  } finally { if (object.objectId) await cdp.send('Runtime.releaseObject', { objectId: object.objectId }); }
}
async function observeRange(cdp, nodeId) {
  const { object } = await cdp.send('DOM.resolveNode', { nodeId });
  try {
    await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: `function(){
      const range=this, host=range.getRootNode().host, events=[];
      globalThis.__f01GainObservations=events;
      const record=event=>{if(events.length<128)events.push({time:performance.now(),type:event.type,key:event.key??null,
        trusted:event.isTrusted??null,value:Number(range.value),disabled:range.disabled,
        focused:range.getRootNode().activeElement===range,phase:host.dataset.phase});};
      for(const type of ['pointerdown','focus','blur','keydown','keyup','input','change'])range.addEventListener(type,record,{capture:true});
      new MutationObserver(()=>record({type:'state'})).observe(host,{attributes:true,attributeFilter:['data-phase'],subtree:true});
      record({type:'initial'});
    }`, returnByValue: true });
  } finally { if (object.objectId) await cdp.send('Runtime.releaseObject', { objectId: object.objectId }); }
}
async function scenario({ context, worker, responses, artifactPath }, mode) {
  const errors = [], page = await context.newPage();
  let activeWorker = worker;
  page.on('pageerror', error => errors.push(String(error.message).slice(0, 160)));
  await context.route(/^https?:\/\//, async route => {
    const response = fixtureDecision(route.request().url(), responses);
    if (response.action === 'fulfill') await route.fulfill({ status: response.status, contentType: response.contentType, body: response.body });
    else await route.abort('blockedbyclient');
  });
  await worker.evaluate(() => {
    globalThis.__f01GainWitness = [];
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (message?.namespace === 'cheese-knife-player-gain' && globalThis.__f01GainWitness.length < 128)
        globalThis.__f01GainWitness.push({ action: message.action, documentId: sender.documentId, frameId: sender.frameId,
          origin: sender.origin, tabId: sender.tab?.id, windowId: sender.tab?.windowId });
      return false;
    });
  });
  const stored = () => activeWorker.evaluate(() => chrome.storage.local.get(null));
  const readback = () => page.evaluate(() => {
    const api = window[Symbol.for('cheese-knife.runtime.v1')], video = document.querySelector('video');
    return { owner: api?.ownerProtocol, ready: api?.configReady, blob: video.currentSrc.startsWith('blob:'), decoded: video.readyState >= 2,
      muted: video.muted, volume: video.volume, state: api?.audio?.getReadback(video), facts: window.__knifeAudioFixture };
  });
  async function enter() {
    await page.goto(FIXTURE_AUDIO_URL, { waitUntil: 'domcontentloaded' });
    await wait(readback, value => value.owner === 3 && value.ready && value.blob && value.decoded, 'player-gain-native-source-unavailable');
    await page.locator('.knife-comp button').click();
    await wait(readback, value => value.state?.state === 'on' && value.state.sources === 1, 'player-gain-master-unavailable');
    await page.locator('.knife-gain-owner[data-phase="ready"]').waitFor({ state: 'visible' });
  }
  await enter();
  const before = await stored(), original = await readback(), cdp = await context.newCDPSession(page);
  const initialSender = await worker.evaluate(() => globalThis.__f01GainWitness.findLast(value => value.frameId === 0));
  requireProof(typeof initialSender?.documentId === 'string' && Number.isSafeInteger(initialSender.tabId), 'player-gain-initial-document-missing');
  let positiveWitnesses = [], naturalWorkerReplacement = false;
  try {
    let point = await rangePoint(cdp);
    await observeRange(cdp, point.nodeId);
    if (mode === 'qualification') {
      await page.mouse.click(point.x, point.y); await page.keyboard.press('Home');
      await wait(async () => ({ raw: await stored(), phase: await page.locator('.knife-gain-owner').getAttribute('data-phase') }),
        value => value.raw.config?.audioGain === 0 && value.raw.config?.gainInherited === false && value.phase === 'ready', 'player-gain-native-ack-missing');
      await wait(readback, value => value.state.gain === 0 && value.state.appliedGain === 0 && value.state.sources === 1, 'player-gain-preview-readback-missing');
      const actual = await readback();
      requireProof(actual.facts.nativePointer > 0 && actual.facts.nativeKey > 0, 'player-gain-native-input-missing');
      await page.keyboard.press('ArrowRight');
      await wait(async () => ({ raw: await stored(), phase: await page.locator('.knife-gain-owner').getAttribute('data-phase') }),
        value => value.raw.config?.audioGain === 0.05 && value.phase === 'ready', 'player-gain-native-keyboard-ack-missing');
      await page.mouse.dblclick(point.x, point.y);
      await wait(async () => ({ raw: await stored(), phase: await page.locator('.knife-gain-owner').getAttribute('data-phase') }),
        value => value.raw.config?.audioGain === 1 && value.raw.config?.gainInherited === false && value.phase === 'ready', 'player-gain-native-reset-ack-missing');
      const raw = await stored(); requireProof(!Object.hasOwn(raw, 'mediaProfiles'), 'player-gain-invented-catalogue');
      const preserved = { ...raw }; delete preserved.config; delete preserved.settingsRevision;
      requireProof(isDeepStrictEqual(preserved, before), 'player-gain-other-data-changed');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await wait(readback, value => value.ready && value.blob && value.decoded, 'player-gain-reentry-unavailable');
      await page.locator('.knife-comp button').click();
      await page.locator('.knife-gain-owner[data-phase="ready"]').waitFor({ state: 'visible' });
      point = await rangePoint(cdp);
      const restored = await readRange(cdp, point.nodeId);
      requireProof(restored.value === 1, 'player-gain-reentry-value-lost');
      positiveWitnesses = await worker.evaluate(() => globalThis.__f01GainWitness);
      // This checks actor expiry, not a guarantee that a debugger-attached worker naturally suspended.
      await page.waitForTimeout(61000);
      const fresh = await reacquireExtensionWorker(context, activeWorker);
      naturalWorkerReplacement = fresh.worker !== activeWorker; activeWorker = fresh.worker;
      await page.mouse.click(point.x, point.y); await page.keyboard.press('End');
      await wait(async () => ({ raw: await stored(), phase: await page.locator('.knife-gain-owner').getAttribute('data-phase') }),
        value => value.raw.config?.audioGain === 2 && value.phase === 'ready', 'player-gain-expired-first-gesture-lost');
    } else {
      await enter(); point = await rangePoint(cdp);
    }
    const checkpoint = await stored();
    const { object } = await cdp.send('DOM.resolveNode', { nodeId: point.nodeId });
    try {
      await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){this.value="1.5";for(const type of ["input","change","dblclick"])this.dispatchEvent(new Event(type,{bubbles:true}));}', returnByValue: true });
    } finally { if (object.objectId) await cdp.send('Runtime.releaseObject', { objectId: object.objectId }); }
    await page.evaluate(() => window.postMessage({ namespace: 'cheese-knife-player-gain', protocol: 3, action: 'set-gain', requestId: 'forged-main', ticket: 'forged', intentId: 'forged', value: 2 }, location.origin));
    await page.waitForTimeout(400);
    requireProof(isDeepStrictEqual(await stored(), checkpoint), 'player-gain-synthetic-write');
    const witnesses = positiveWitnesses.length ? positiveWitnesses : await activeWorker.evaluate(() => globalThis.__f01GainWitness ?? []);
    const positive = witnesses.filter(value => value.action === 'set-gain');
    if (mode === 'qualification') requireProof(positive.length > 0 && positive.every(value => value.frameId === 0 && typeof value.documentId === 'string' && value.documentId.length > 0 && value.origin === 'https://chzzk.naver.com'), 'player-gain-native-sender-missing');
    const nativeSender = witnesses.findLast(value => value.frameId === 0 && Number.isSafeInteger(value.tabId));
    requireProof(!!nativeSender, 'player-gain-native-tab-missing');
    const currentDocument = await activeWorker.evaluate(async tabId => chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: () => location.href }), initialSender.tabId);
    requireProof(currentDocument.length === 1 && currentDocument[0].documentId !== initialSender.documentId, 'player-gain-old-document-not-replaced');
    const oldDocument = await activeWorker.evaluate(async target => {
      try { await chrome.scripting.executeScript({ target, world: 'ISOLATED', func: () => chrome.runtime.sendMessage({ namespace: 'cheese-knife-player-gain', protocol: 3, requestId: 'negative-old-document', action: 'get-gain-view' }) }); return { rejected: false }; }
      catch (error) { return { rejected: true, message: String(error.message) }; }
    }, { tabId: initialSender.tabId, documentIds: [initialSender.documentId] });
    requireProof(oldDocument.rejected === true && /^No document with id .+ in tab with id /i.test(oldDocument.message), 'player-gain-old-document-denial-unconfirmed');
    requireProof(isDeepStrictEqual(await stored(), checkpoint), 'player-gain-old-document-wrote');
    await page.evaluate(url => { const frame = document.createElement('iframe'); frame.src = url; document.body.append(frame); }, FIXTURE_AUDIO_URL);
    const frameRows = await wait(() => activeWorker.evaluate(async tabId => chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'ISOLATED',
      func: () => ({ top: window.top === window, url: location.href }) }), nativeSender.tabId),
      rows => rows.length > 1 && rows.some(row => row.frameId !== 0 && row.result?.top === false), 'player-gain-negative-frame-missing');
    const child = frameRows.find(row => row.frameId !== 0 && row.result?.url === FIXTURE_AUDIO_URL);
    requireProof(!!child, 'player-gain-negative-frame-wrong-origin');
    const denied = await activeWorker.evaluate(async target => chrome.scripting.executeScript({ target, world: 'ISOLATED', func: () =>
      new Promise(resolve => chrome.runtime.sendMessage({ namespace: 'cheese-knife-player-gain', protocol: 3, requestId: 'negative-frame', action: 'get-gain-view' }, resolve)) }),
      { tabId: nativeSender.tabId, frameIds: [child.frameId] });
    requireProof(denied.length === 1 && denied[0].result?.ok === false && denied[0].result.code === 'invalid-sender', 'player-gain-frame-denial-unconfirmed');
    requireProof(isDeepStrictEqual(await stored(), checkpoint), 'player-gain-frame-wrote');
    await page.locator('.knife-gain-owner').evaluate(host => host.remove());
    const missing = await activeWorker.evaluate(async tabId => chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: () =>
      new Promise(resolve => chrome.runtime.sendMessage({ namespace: 'cheese-knife-player-gain', protocol: 3, requestId: 'negative-missing-owner', action: 'get-gain-view' }, resolve)) }), nativeSender.tabId);
    requireProof(missing.length === 1 && missing[0].result?.ok === false && missing[0].result.stage === 'target' && missing[0].result.code === 'gain-probe-unavailable', 'player-gain-missing-probe-denial-unconfirmed');
    requireProof(isDeepStrictEqual(await stored(), checkpoint), 'player-gain-missing-probe-wrote');
    const final = await readback();
    requireProof(final.muted === original.muted && final.volume === original.volume && errors.length === 0, 'player-gain-native-original-state-changed');
    await page.screenshot({ path: path.join(artifactPath, 'player-gain.png') });
    return { playerGain: { passed: true, mode, actualNativeSource: true, trustedPointerKeyboard: mode === 'qualification',
      nativeSenderFrameDocument: mode === 'qualification', ackAndReentry: mode === 'qualification', resetAndZero: mode === 'qualification', syntheticMainRejected: true,
      actualIframeRejected: true, oldDocumentRejected: true, missingOwnerProbeRejected: true, actorIdleOver60: mode === 'qualification', naturalWorkerReplacement,
      originalMuteVolumePreserved: true, physicalAudioNotEvaluated: true }, pageErrors: errors };
  } catch (error) {
    const events = await page.evaluate(() => globalThis.__f01GainObservations ?? []).catch(() => []);
    const files = await openOwnedRoot(artifactPath);
    await files.writeFile('gain-observations.json', JSON.stringify({ events, error: error.code ?? 'scenario-failed' }, null, 2) + '\n');
    throw error;
  } finally { await cdp.detach(); }
}
export async function runInstalledPlayerGain(options) {
  if (!options || !['qualification', 'negative'].includes(options.mode) || typeof options.headed !== 'boolean') throw fail('player-gain-args');
  return runInstalledExtensionE2E({ runId: options.runId, headed: options.headed, qualification: 'player-gain', dependencies: {
    loadFixtureResponses: loadAudioFixtureResponses,
    mediaScenario: input => scenario(input, options.mode),
    expectedMediaFiles: async files => {
      const rows = validatePayloadMetadata(JSON.parse(await files.readFile('tests/fixtures/installed-extension/published-payload.json', 'utf8')));
      return [...rows.map(row => `dist/${row.name}`), 'dist/media-profiles.js', 'dist/gain-authority.js', 'dist/web/player-gain.js'].sort();
    },
  } });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runInstalledPlayerGain(parsePlayerGainArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.code ?? error.message); process.exitCode = 1; }
}
