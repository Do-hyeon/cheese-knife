const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const nonce = '0123456789abcdef0123456789abcdef', id = 'a'.repeat(32);
const faultError = code => Object.assign(Error(code), { code });

async function fixture(t, fault, scenario) {
  const { openOwnedRoot } = await import('../scripts/owned-files.mjs');
  const { readPublishedPayload } = await import('../scripts/extension-e2e/published-payload.mjs');
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'transition-child-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const files = await openOwnedRoot(base), events = [], messages = [], paths = [], storage = {};
  await files.ensureDirectory('work'); await files.ensureDirectory('artifact');
  let builds = 0, attestations = 0, launchIndex = 0, writes = 0;
  const payload = await readPublishedPayload();
  const options = { nonce, roots: [{ caseId: 'valid-ui', root: 'work' }], candidateIds: ['first', 'second'], artifact: 'artifact', headed: false,
    ...(scenario ? { scenario } : {}) };
  const source = { sourceCommit: 'a'.repeat(40) };
  const deps = {
    openRepository: async () => files,
    sourceAttestation: async () => { attestations++; if (fault === 'source-change' && attestations === 2) return { sourceCommit: 'b'.repeat(40) }; return source; },
    readPublishedPayload: async () => { if (fault === 'prepare') throw faultError('test-prepare'); return payload; },
    verifyCandidate: async () => {
      const name = `candidate${++builds}`;
      if (fault === 'second-build' && builds === 2) throw faultError('test-second-build');
      await files.ensureDirectory(name);
      for (const entry of payload.entries) {
        const target = `${name}/${entry.name}`; await files.ensureDirectory(path.posix.dirname(target)); await files.writeFile(target, entry.bytes);
      }
      if(fault!=='missing-media-module')await files.writeFile(`${name}/media-profiles.js`,'var KnifeMediaProfiles = {};');
      if(fault==='extra-media-module')await files.writeFile(`${name}/unexpected.js`,'var unexpected = true;');
      return { dist: await files.resolve(name, { type: 'directory' }) };
    },
    openWorkRoot: async directory => {
      const work = await openOwnedRoot(directory);
      return { ...work, writeFile: async (name, data, flags) => {
        if (fault === 'partial-install' && launchIndex === 2 && name.startsWith('extension/')) {
          await work.writeFile(name, data.subarray(0, 17), flags); throw faultError('test-partial-install');
        }
        return work.writeFile(name, data, flags);
      } };
    },
    loadFixtureResponses: async () => ({}),
    requestLaunch: async message => { events.push(`intent:${message.phase}`); },
    send: async message => { messages.push(message); if (message.type === 'close-success') events.push(`closed:${message.phase}`); },
    launchInstalledExtension: async args => {
      const phase = (scenario ? ['seed','old','new','rollback','new'] : ['seed', 'old', 'new', 'rollback'])[launchIndex++]; events.push(`launch:${phase}`);
      paths.push([args.profilePath, args.extensionPath]);
      if (fault === 'launch' && phase === 'old') throw faultError('test-launch');
      const manifest = JSON.parse(await fs.readFile(path.join(args.extensionPath, 'manifest.json')));
      assert.equal(manifest.version, { seed: '2.13.3', old: '2.13.3', new: '2.13.4', rollback: '2.13.5' }[phase]);
      const pages = [];
      const context = { fixturePhase:phase,setDefaultTimeout() {}, pages: () => pages,
        tracing: { start: async () => { if (fault === 'trace' && phase === 'old') throw faultError('test-trace'); }, stop: async options => { if (options?.path) await fs.writeFile(options.path, 'test trace'); } },
        newPage: async () => { const page = { goto: async () => {}, locator: () => ({ waitFor: async () => {} }), close: async () => {}, screenshot: async () => Buffer.from('test image') }; pages.push(page); return page; },
        close: async () => {
          events.push(`close:${phase}`);
          if (fault === 'close' && phase === 'old') throw faultError('test-close');
          if (fault === 'postclose-inventory' && phase === 'new') await fs.writeFile(path.join(args.extensionPath, 'popup.html'), 'mixed');
        } };
      const worker = { evaluate: (fn, value) => vm.runInNewContext(`(${fn.toString()})(value)`, { value, chrome: { storage: { local: {
        get: async () => structuredClone(storage), set: async raw => { writes++; events.push('seed-write'); Object.assign(storage, structuredClone(raw)); },
      } } } }) };
      return { context, worker, fixtureVersion: manifest.version, extensionId: fault === 'identity' && phase === 'new' ? 'b'.repeat(32) : id };
    },
    refreshTransitionWorker: async ({ fixtureVersion, ...launched }) => ({ ...launched,
      preparation: { developerMode: true, workerClosed: true, extensionId: launched.extensionId, version: fixtureVersion, state: 'ENABLED' } }),
    runTransitionPhase: async args => {
      events.push(`scenario:${args.phase}`);
      if (['loss', 'postclose-inventory'].includes(fault) && args.phase === 'new') throw Object.assign(faultError('transition-storage-preservation'), {
        failure: { code: 'transition-storage-preservation', caseId: 'valid-ui', phase: 'new', step: 'startup', stage: 'candidate-init', cleanupErrors: [], observation: { raw: {}, execution: { extensionId: id, version: '2.13.4', brokerMatches: true } } },
      });
      return { caseId: args.caseId, phase: args.phase, records: [], final: { marker: args.phase } };
    },
    openMediaBrowserSession:async()=>({send:async()=>({}),on(){},off(){}}),
    closeInstalledMediaBrowser:async({context})=>{events.push(`proof:${context.fixturePhase}`);return {browserCloseAcknowledged:true,browserDisconnected:true,
      ownedRootClosed:!(fault==='media-close-root'&&context.fixturePhase==='old')};},
    runInstalledMediaPreservationScenario:async args=>{
      events.push(`media:${args.launchOccurrence}:${args.phase}`);const {expectedInstalledMediaStore}=await import('../scripts/extension-e2e/transition-scenario.mjs');
      const presetId='11111111-1111-4111-8111-111111111111';if(args.launchOccurrence===2)storage.mediaProfiles=expectedInstalledMediaStore(nonce,presetId);
      return {caseId:'valid-ui',phase:args.phase,launchOccurrence:args.launchOccurrence,records:[],final:{raw:structuredClone(storage)},presetId:args.launchOccurrence>=2?presetId:undefined};
    },
  };
  return { options, deps, events, messages, paths, writes: () => writes };
}

test('child workflow seeds once, preserves path identity and closes before each physical replacement', async t => {
  const { executeTransitionChild } = await import('../scripts/check-installed-transition.mjs');
  const f = await fixture(t); await executeTransitionChild(f.options, f.deps);
  assert.equal(f.writes(), 1);
  assert.deepEqual(f.events, ['intent:seed', 'launch:seed', 'seed-write', 'close:seed', 'closed:seed',
    'intent:old', 'launch:old', 'scenario:old', 'close:old', 'closed:old',
    'intent:new', 'launch:new', 'scenario:new', 'close:new', 'closed:new',
    'intent:rollback', 'launch:rollback', 'scenario:rollback', 'close:rollback', 'closed:rollback']);
  assert.ok(f.paths.every(value => value[0] === f.paths[0][0] && value[1] === f.paths[0][1]));
  const result = f.messages.at(-1).result; assert.equal(result.failure, undefined); assert.deepEqual(result.secondaryErrors, []);
  assert.equal(result.seeds.length, 1); assert.equal(result.phases.length, 3);
  assert.deepEqual(result.seeds[0].preparation, { developerMode: true, workerClosed: true, extensionId: id, version: '2.13.3', state: 'ENABLED' });
  assert.deepEqual(result.phases.map(value => value.preparation.version), ['2.13.3', '2.13.4', '2.13.5']);
});

for (const [fault, code] of [['prepare', 'test-prepare'], ['second-build', 'test-second-build'], ['partial-install', 'test-partial-install'],
  ['launch', 'test-launch'], ['trace', 'test-trace'], ['close', 'cleanup-unconfirmed'], ['identity', 'transition-execution'], ['source-change', 'transition-source-changed']]) {
  test(`child ${fault} fails without continuing or replacing an unclosed extension`, async t => {
    const { executeTransitionChild } = await import('../scripts/check-installed-transition.mjs');
    const f = await fixture(t, fault); await executeTransitionChild(f.options, f.deps);
    const result = f.messages.at(-1).result;
    assert.equal(result.failure.code, code);
    if (['prepare', 'second-build'].includes(fault)) assert.equal(f.paths.length, 0);
    if (fault === 'close') { assert.equal(f.events.includes('launch:new'), false); assert.ok(result.cleanupErrors.some(error => error.code === 'test-close')); }
    if (fault !== 'source-change') assert.equal(f.events.includes('launch:rollback'), false);
  });
}

test('postclose inventory error cannot disappear behind the expected storage-loss failure', async t => {
  const { executeTransitionChild } = await import('../scripts/check-installed-transition.mjs');
  const f = await fixture(t, 'postclose-inventory'); await executeTransitionChild(f.options, f.deps);
  const result = f.messages.at(-1).result;
  assert.equal(result.failure.code, 'transition-storage-preservation');
  assert.ok(result.secondaryErrors.some(error => error.code === 'transition-inventory'));
  assert.equal(f.events.includes('launch:rollback'), false);
});
test('media child keeps the same root for seed and four observations, creating only first-new',async t=>{
  const {executeTransitionChild}=await import('../scripts/check-installed-transition.mjs'),f=await fixture(t,undefined,'media-preservation');await executeTransitionChild(f.options,f.deps);
  const result=f.messages.at(-1).result;assert.equal(result.failure,undefined);assert.equal(result.scenario,'media-preservation');assert.equal(f.writes(),1);
  assert.deepEqual(result.phases.map(value=>value.launchOccurrence),[1,2,3,4]);assert.deepEqual(result.phases.map(value=>value.phase),['old','new','rollback','new']);
  const close=f.messages.filter(value=>value.type==='close-success');assert.equal(close.length,5);
  assert.ok(close.every(value=>value.shutdown?.browserCloseAcknowledged&&value.shutdown?.browserDisconnected&&value.shutdown?.ownedRootClosed));
  assert.ok(f.paths.every(value=>value[0]===f.paths[0][0]&&value[1]===f.paths[0][1]));
});
test('media child never replaces or relaunches after an unproven owned root close',async t=>{
  const {executeTransitionChild}=await import('../scripts/check-installed-transition.mjs'),f=await fixture(t,'media-close-root','media-preservation');await executeTransitionChild(f.options,f.deps);
  assert.ok(f.messages.at(-1).result.failure);assert.equal(f.events.includes('launch:new'),false);
  assert.equal(f.messages.filter(value=>value.type==='close-success').length,1);
});
for(const fault of ['missing-media-module','extra-media-module'])test('child rejects current asset '+fault+' before launching',async t=>{
  const {executeTransitionChild}=await import('../scripts/check-installed-transition.mjs'),f=await fixture(t,fault);await executeTransitionChild(f.options,f.deps);
  assert.equal(f.paths.length,0);assert.equal(f.messages.at(-1).result.failure.code,'transition-inventory');
});
