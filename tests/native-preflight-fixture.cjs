const id = 'cgfddiiffponlciljlfbiecmlagflbpe';
const nonce = '0123456789abcdef0123456789abcdef';
const stages = ['baseline','seeded','cold'], contexts = ['worker-before','popup','styles','worker-after'];
const hash = 'b9a2192d8fcea6e8aa6afb7e0f2d19c203dc3a62c8ff99a11182440ef37cc1f8';
function observation(stage, context, capturedAt, runNonce = nonce) {
  const worker = context.startsWith('worker-'), seeded = stage !== 'baseline';
  return { schema: 1, runNonce, stage, context, capturedAt, outcome: 'observed', code: null,
    identity: { extensionId: id, version: '2.13.3', versionName: '2.13.3 sidebar follow-up preview', manifestVersion: 3,
      pathname: worker ? '/background.js' : `/${context}.html`, ...(worker ? { brokerHash: hash, permissions: ['scripting','storage'], origins: ['https://chzzk.naver.com/*'] } : {}) },
    observation: worker ? { raw: seeded ? { config: { present: true, value: { arrowSeek: false, previewVolume: 25 } },
      styles: { present: true, value: ['hide-ranking','chat-font-size'] }, styleParameters: { present: true, value: { 'chat-font-size': 8 } }, settingsRevision: { present: true, value: 7 } } :
      { config: { present: false }, styles: { present: false }, styleParameters: { present: false }, settingsRevision: { present: false } },
      registrations: seeded ? [{ id: 'styles', css: ['styles/chat-font-size.css','styles/hide-ranking.css'], matches: ['https://chzzk.naver.com/*'], runAt: 'document_start', js: [] }] : [] } :
      { phase: 'ready', retryHidden: context === 'styles' ? true : null, discardHidden: true, checked: context === 'popup' ? !seeded : seeded, value: context === 'popup' ? seeded ? 25 : 5 : seeded ? 8 : 0, firstDisabled: false, secondDisabled: false } };
}
function facts(baseline, phase, capturedAt, runNonce = nonce) {
  return { schema: 1, runNonce, phase, capturedAt, profileIdentity: 'f'.repeat(64), developerMode: phase === 'restarted',
    installation: { extensionId: id, version: '2.13.3', publicKeyId: id, fromWebstore: true, disableReasons: [], permissions: ['scripting','storage'], origins: ['https://chzzk.naver.com/*'],
      files: [...baseline.files.map(row => [...row]), ['_metadata/computed_hashes.json','a'.repeat(64)], ['_metadata/verified_contents.json','b'.repeat(64)]].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0),
      manifest: { ...structuredClone(baseline.manifest), key: 'fixture-public-key', update_url: 'https://clients2.google.com/service/update2/crx' }, locales: structuredClone(baseline.locales) },
    process: { queried: true, root: ['closed','after'].includes(phase) ? null : { pid: phase === 'before' ? 10 : 20, startedAt: capturedAt - 1 } } };
}
function evidence(baseline, through = 'complete', runNonce = nonce) {
  const result = { observations: [], events: [], nativeFacts: [] }; let time = 1000;
  const event = (name, status = 'confirmed') => result.events.push({ schema: 1, runNonce, ordinal: result.events.length + 1, event: name, recordedAt: ++time, status, code: null });
  const inspect = phase => { result.nativeFacts.push(facts(baseline, phase, ++time, runNonce)); event(`inspection:${phase}`); };
  inspect('before'); event('profile-context');
  const count = through === 'baseline' ? 1 : through === 'seeded' ? 2 : 3;
  for (const stage of stages.slice(0, count)) {
    if (stage === 'seeded') { event('check:baseline'); event('seed-start'); }
    if (stage === 'cold') { event('check:seeded'); inspect('closed'); inspect('restarted'); }
    for (const context of contexts) {
      event(`probe:${stage}:${context}`, 'requested');
      result.observations.push(observation(stage, context, ++time, runNonce));
      event(`probe:${stage}:${context}`);
    }
  }
  if (through === 'complete') { inspect('after'); event('finalize'); }
  return result;
}
module.exports = { id, nonce, stages, contexts, observation, facts, evidence };
