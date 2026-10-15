const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const subject = () => import('../scripts/extension-e2e/transition-scenario.mjs');
const nonce = '0123456789abcdef0123456789abcdef', extensionId = 'a'.repeat(32);
const seed = { config: { futureFlag: 'keep', brightness: 1.25 }, styles: ['future-style'],
  styleParameters: { future: 9 }, settingsRevision: 4, futureTop: { runNonce: nonce, untouched: true } };
const normalized = { preview: true, livePreview: true, previewStartUnmuted: false, previewWidth: 400, previewDelay: 1,
  previewVolume: 5, rightClickToUnmute: true, updateSidebar: true, expandFollowings: false, popupPlayer: true,
  arrowSeek: true, pressToFastForward: true, brightness: 1.25, contrast: 1, saturation: 1, gamma: 1, sharpness: 0,
  compressorDefault: false, compressorThreshold: -50, compressorKnee: 40, compressorRatio: 12,
  compressorAttack: 0, compressorRelease: 0.25, hideDonation: false, showDeleted: false };
function observed(raw = seed, repair = false) {
  return { raw: structuredClone(raw),
    execution: { extensionId, version: '2.13.3', brokerMatches: true },
    ui: { popupPhase: repair ? 'repair-required' : 'ready', stylesPhase: repair ? 'repair-required' : 'ready',
      arrowSeek: true, previewVolume: 5, brightness: repair ? 1 : 1.25, hideRanking: false, fontSize: 0,
      popupArrowDisabled: repair, popupVolumeDisabled: repair, secondArrowDisabled: repair, secondVolumeDisabled: repair,
      stylesRankingDisabled: repair, stylesFontDisabled: repair, secondArrowSeek: true, secondPreviewVolume: 5 },
    css: { registrations: [], font: ['', '', '', ''], ranking: 'block', reloads: [0, 0] },
    runtime: { ready: true, config: { ...normalized }, requestIdObserved: true, revisionObserved: true, duplicatedControls: false } };
}

test('case seeds preserve unknown data and distinguish actual legacy own t values', async () => {
  const { transitionSeed } = await subject();
  assert.deepEqual(transitionSeed('valid-ui', nonce), seed);
  assert.deepEqual(transitionSeed('legacy-valid', nonce), { ...seed, config: { ...seed.config, resizeChat: true }, t: 0 });
  assert.deepEqual(transitionSeed('legacy-null', nonce), { ...seed, config: { ...seed.config, resizeChat: false }, t: null });
  assert.deepEqual(transitionSeed('legacy-invalid', nonce), { ...seed, config: { ...seed.config, resizeChat: false }, t: 'invalid' });
  assert.deepEqual(transitionSeed('damaged-revision', nonce), { ...seed, settingsRevision: 'invalid-b2' });
});

test('literal old new rollback states include all exact revisions and font membership', async () => {
  const { expectedTransitionRaw: expected } = await subject();
  const stages = [
    ['old', 'startup', 4, undefined, undefined, undefined], ['old', 'arrow-off', 5, false, undefined, undefined],
    ['old', 'volume25', 6, false, 25, undefined], ['old', 'hide-ranking-on', 7, false, 25, undefined],
    ['old', 'font8', 8, false, 25, 8], ['new', 'startup', 8, false, 25, 8],
    ['new', 'two-popup-merge', 10, true, 35, 8], ['new', 'font0', 11, true, 35, 0],
    ['rollback', 'startup', 11, true, 35, 0], ['rollback', 'volume26', 12, true, 26, 0],
    ['rollback', 'rollback-font8', 13, true, 26, 8], ['rollback', 'rollback-font0', 14, true, 26, 0],
  ];
  for (const [phase, step, revision, arrow, volume, font] of stages) {
    const config = { futureFlag: 'keep', brightness: 1.25 };
    if (arrow !== undefined) config.arrowSeek = arrow;
    if (volume !== undefined) config.previewVolume = volume;
    const styles = ['future-style']; if (revision >= 7) styles.push('hide-ranking'); if (font === 8) styles.push('chat-font-size');
    const styleParameters = { future: 9 }; if (font !== undefined) styleParameters['chat-font-size'] = font;
    assert.deepEqual(expected('valid-ui', phase, step, nonce), { config, styles, styleParameters,
      settingsRevision: revision, futureTop: { runNonce: nonce, untouched: true } }, `${phase}/${step}`);
  }
});

for (const phase of ['old', 'new', 'rollback']) test(`legacy/damaged literal startup stays stable in ${phase}`, async () => {
  const { expectedTransitionRaw: expected } = await subject();
  assert.deepEqual(expected('legacy-valid', phase, 'startup', nonce), { ...seed,
    config: { futureFlag: 'keep', brightness: 1.25, sharpness: 0 }, styles: ['future-style', 'chat-resize'], settingsRevision: 5 });
  for (const id of ['legacy-null', 'legacy-invalid']) assert.deepEqual(expected(id, phase, 'startup', nonce),
    { ...seed, config: { ...seed.config, resizeChat: false } });
  assert.deepEqual(expected('damaged-revision', phase, 'startup', nonce), { ...seed, settingsRevision: 'invalid-b2' });
});

test('oracle refuses invalid phase/action combinations and invalid nonce', async () => {
  const { transitionSeed, expectedTransitionRaw } = await subject();
  for (const id of [null, 'invalid']) assert.throws(() => transitionSeed(id, nonce), { code: 'transition-case-invalid' });
  for (const value of ['', 'user-session', 'x'.repeat(33)]) assert.throws(() => transitionSeed('valid-ui', value), { code: 'transition-nonce-invalid' });
  for (const [id, phase, step] of [['valid-ui', 'seed', 'startup'], ['valid-ui', 'new', 'font8'], ['legacy-valid', 'old', 'font8']]) {
    assert.throws(() => expectedTransitionRaw(id, phase, step, nonce), { code: 'transition-step-invalid' });
  }
});

test('oracle validates damaged UI separately from ready normalized MAIN', async () => {
  const { assertTransitionState, expectedTransitionState } = await subject();
  const raw = { ...seed, settingsRevision: 'invalid-b2' };
  const actual = observed(raw, true);
  const expected = expectedTransitionState('damaged-revision', 'old', 'startup', nonce, extensionId);
  assert.equal(assertTransitionState(actual, expected), undefined);
  assert.deepEqual(expected.runtime.config, normalized);
  for (const change of [...['popupArrowDisabled', 'popupVolumeDisabled', 'secondArrowDisabled', 'secondVolumeDisabled', 'stylesRankingDisabled', 'stylesFontDisabled'].map(field => value => { value.ui[field] = false; }), value => { value.ui.stylesPhase = 'ready'; }]) {
    const value = structuredClone(actual); change(value);
    assert.throws(() => assertTransitionState(value, expected), { code: 'transition-ui' });
  }
});

test('missing/lost unknown/revision/config is preservation failure, never a timeout', async () => {
  const { assertTransitionState, expectedTransitionState } = await subject();
  const expected = expectedTransitionState('valid-ui', 'old', 'startup', nonce, extensionId);
  for (const change of [value => { delete value.raw.config; }, value => { delete value.raw.futureTop; },
    value => { delete value.raw.config.futureFlag; }, value => { value.raw.settingsRevision = 0; }, value => { delete value.raw; }]) {
    const value = observed(); change(value);
    assert.throws(() => assertTransitionState(value, expected), { code: 'transition-storage-preservation' });
  }
});

test('wrong execution takes precedence over simultaneous storage loss', async () => {
  const { assertTransitionState, expectedTransitionState } = await subject();
  const value = observed(); delete value.raw.config; value.execution.version = '2.13.4';
  assert.throws(() => assertTransitionState(value, expectedTransitionState('valid-ui', 'old', 'startup', nonce, extensionId)), { code: 'transition-execution' });
});

test('phase refuses the wrong version before accessing any UI or storage', async () => {
  const { runTransitionPhase } = await subject();
  await assert.rejects(runTransitionPhase({ context: {}, worker: { evaluate: async () => ({ extensionId, version: '2.13.3', brokerSource: 'function() {}' }) },
    extensionId, responses: {}, caseId: 'valid-ui', phase: 'new', expectedProtocol:3, runNonce: nonce, expectedBrokerSource: 'var createSettingsBroker = function() {};' }),
  error => { assert.equal(error.code, 'transition-execution'); assert.equal(error.failure.observation.execution.version, '2.13.3'); return true; });
});

test('damaged state requires every writable control in both popups and styles disabled', async () => {
  const { expectedTransitionState } = await subject();
  const value = expectedTransitionState('damaged-revision', 'old', 'startup', nonce, extensionId);
  for (const field of ['popupArrowDisabled', 'popupVolumeDisabled', 'secondArrowDisabled', 'secondVolumeDisabled', 'stylesRankingDisabled', 'stylesFontDisabled']) {
    assert.equal(value.ui[field], true, field);
  }
});

test('independent UI CSS MAIN and execution mutations cannot satisfy the oracle', async () => {
  const { assertTransitionState, expectedTransitionState } = await subject();
  const expected = expectedTransitionState('valid-ui', 'old', 'startup', nonce, extensionId);
  for (const [change, code] of [
    [value => { value.execution.brokerMatches = false; }, 'transition-execution'],
    [value => { value.execution.extensionId = 'b'.repeat(32); }, 'transition-execution'],
    [value => { value.execution.version = '2.13.4'; }, 'transition-execution'],
    [value => { value.ui.secondPreviewVolume = 10; }, 'transition-ui'],
    [value => { value.css.registrations = [{ id: 'styles', css: [] }]; }, 'transition-css'],
    [value => { value.css.reloads = [1, 1]; }, 'transition-css'],
    [value => { value.runtime.ready = false; }, 'transition-main'],
    [value => { value.runtime.config.futureFlag = 'keep'; }, 'transition-main'],
    [value => { value.runtime.requestIdObserved = false; }, 'transition-main'],
    [value => { value.runtime.duplicatedControls = true; }, 'transition-main'],
  ]) {
    const value = observed(); change(value); assert.throws(() => assertTransitionState(value, expected), { code });
  }
});

test('font0 raw zero and registration contract are independently retained', async () => {
  const { expectedTransitionState, assertTransitionState } = await subject();
  const expected = expectedTransitionState('valid-ui', 'new', 'font0', nonce, extensionId);
  assert.deepEqual(expected.css, { registrations: [{ id: 'styles', css: ['styles/hide-ranking.css'],
    matches: ['https://chzzk.naver.com/*'], runAt: 'document_start', js: [] }], font: ['0px', '0px', '0px', '0px'], ranking: 'none', reloads: [0, 0] });
  assert.deepEqual(expected.raw.styleParameters, { future: 9, 'chat-font-size': 0 });
  assert.equal(expected.execution.version, '2.13.4');
  const value = structuredClone(expected); delete value.raw.styleParameters['chat-font-size'];
  assert.throws(() => assertTransitionState(value, expected), { code: 'transition-storage-preservation' });
  for (const mutate of [css => { css.registrations[0].js = ['wrong.js']; }, css => { css.registrations[0].runAt = 'document_idle'; },
    css => { css.registrations[0].matches.push('https://example.com/*'); }]) {
    const altered = structuredClone(expected); mutate(altered.css);
    assert.throws(() => assertTransitionState(altered, expected), { code: 'transition-css' });
  }
});

test('F01 runtime oracle includes the complete independent audio defaults while published and F00 stay unchanged',async()=>{
  const {expectedTransitionState,assertTransitionState}=await subject();
  const args=['legacy-invalid','new','startup',nonce,extensionId];
  const old=expectedTransitionState(...args,{expectedProtocol:2});
  assert.deepEqual(old.runtime.config,normalized);
  const current=expectedTransitionState(...args,{expectedProtocol:3});
  assert.deepEqual(current.runtime.config,{...normalized,audioDefault:false,compressorEnabled:true,audioGain:1,gainInherited:true,
    eqEnabled:false,eq63:0,eq125:0,eq250:0,eq500:0,eq1000:0,eq2000:0,eq4000:0,eq8000:0,
    normalizerEnabled:false,normalizerTargetDbfs:-20});
  assert.equal(Object.hasOwn(current.raw.config,'audioDefault'),false);
  for(const mutate of [config=>{delete config.eq8000;},config=>{config.extra=true;},config=>{config.audioGain=0;}]){
    const actual=structuredClone(current);mutate(actual.runtime.config);
    assert.throws(()=>assertTransitionState(actual,current),{code:'transition-main'});
  }
  assert.throws(()=>expectedTransitionState(...args,{expectedProtocol:4}),{code:'installed-protocol-invalid'});
});

test('bounded polling observes real provider results, does not swallow errors or accept timeout', async () => {
  const { waitTransition } = await subject();
  let calls = 0;
  assert.deepEqual(await waitTransition(async () => ({ revision: ++calls }), value => value.revision === 2, 'wait-failed', 500), { revision: 2 });
  await assert.rejects(waitTransition(async () => ({ config: {} }), value => value.config.arrowSeek === false, 'wait-failed', 1), { code: 'wait-failed' });
  await assert.rejects(waitTransition(async () => { throw Object.assign(Error('worker'), { code: 'worker-failed' }); }, Boolean, 'wait-failed'), { code: 'worker-failed' });
});

test('actual phase propagates worker failure with case phase step stage and no invented observation', async () => {
  const { runTransitionPhase } = await subject();
  const worker = { evaluate: async () => { throw Object.assign(Error('worker'), { code: 'worker-failed' }); } };
  await assert.rejects(runTransitionPhase({ context: {}, worker, extensionId, responses: [], caseId: 'valid-ui',
    phase: 'new', expectedProtocol:3, runNonce: nonce, expectedBrokerSource: 'source' }), error => {
    assert.equal(error.code, 'worker-failed');
    assert.deepEqual(error.failure, { code: 'worker-failed', caseId: 'valid-ui', phase: 'new', step: 'startup',
      stage: 'candidate-init', cleanupErrors: [] }); return true;
  });
});

test('transition scenario passes unchanged static tool rules', () => {
  const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--config', 'eslint.security.config.mjs',
    '--no-inline-config', '--max-warnings=0', '--format=json', 'scripts/extension-e2e/transition-scenario.mjs'],
  { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stdout + result.stderr);
});
