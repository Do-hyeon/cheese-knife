const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { fork, spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const subject = () => import('../scripts/check-installed-transition.mjs');
const nonce = '0123456789abcdef0123456789abcdef';
const root = 'output/playwright/installed-transition-work-fixture';
function childFixture() {
  const child = new EventEmitter(); child.pid = 12345; child.exitCode = null; child.signalCode = null;
  child.connected = true; child.sent = [];
  child.send = (message, callback) => { child.sent.push(message); callback?.(); };
  child.disconnect = () => { child.connected = false; };
  return child;
}
const intent = () => ({ type: 'launch-intent', nonce, caseId: 'valid-ui', phase: 'seed', launchId: 'valid-ui:seed', root });
const close = () => ({ ...intent(), type: 'close-success' });
const roots = [{ caseId: 'valid-ui', root }];
function exit(child, code = 0) { child.exitCode = code; child.emit('exit', code, null); }

test('F01 supervisor checks occurrence plus assigned payload role and all three shutdown facts',async()=>{
  const {superviseTransitionChild}=await subject();const child=childFixture(),assigned=[{caseId:'valid-v1',kind:'f01',mediaCase:'valid-v1',root}];
  const pending=superviseTransitionChild({child,nonce,roots:assigned,mediaSchema:'f01',deadlineMs:500});
  for(const [launchOccurrence,[phase,payload]]of [['seed','published'],['old','f00'],['new','f01'],['rollback','f00'],['new','f01'],['rollback','published'],['new','f01'],['rollback','published'],['new','f01']].entries()){
    const request={type:'launch-intent',nonce,caseId:'valid-v1',phase,payload,launchOccurrence,launchId:`valid-v1:${launchOccurrence}:${phase}`,root};
    child.emit('message',request);assert.deepEqual(child.sent.at(-1),{...request,type:'launch-ack'});
    child.emit('message',{...request,type:'close-success',shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}});
  }
  child.emit('message',{type:'result',nonce,result:{mediaSchema:'f01'}});exit(child);const result=await pending;
  assert.equal(result.failure,null);assert.equal(result.launches.length,9);assert.equal(result.launches[5].payload,'published');
});
for(const fault of ['payload','occurrence','close-payload','close-proof'])test('F01 supervisor rejects wrong '+fault,async()=>{
  const {superviseTransitionChild}=await subject(),child=childFixture(),assigned=[{caseId:'absent',kind:'f01',mediaCase:'absent',root}];
  const pending=superviseTransitionChild({child,nonce,roots:assigned,mediaSchema:'f01',deadlineMs:500});
  const request={...intent(),caseId:'absent',payload:'published',launchOccurrence:0,launchId:'absent:0:seed'};
  child.emit('message',fault==='payload'?{...request,payload:'f01'}:fault==='occurrence'?{...request,launchOccurrence:1,launchId:'absent:1:seed'}:request);
  if(fault.startsWith('close'))child.emit('message',{...request,type:'close-success',...(fault==='close-payload'?{payload:'f00'}:{}),shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:fault!=='close-proof'}});
  exit(child);assert.ok((await pending).failure);
});

test('media supervisor accepts exact seed plus four occurrences and requires three close facts',async()=>{
  const {superviseTransitionChild}=await subject(),child=childFixture();
  const pending=superviseTransitionChild({child,nonce,roots,scenario:'media-preservation',deadlineMs:500});
  for(const [launchOccurrence,phase] of ['seed','old','new','rollback','new'].entries()){
    const request={type:'launch-intent',nonce,caseId:'valid-ui',phase,launchOccurrence,launchId:`valid-ui:${launchOccurrence}:${phase}`,root};
    child.emit('message',request);assert.deepEqual(child.sent.at(-1),{...request,type:'launch-ack'});
    child.emit('message',{...request,type:'close-success',shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}});
  }
  child.emit('message',{type:'result',nonce,result:{scenario:'media-preservation'}});exit(child);const result=await pending;
  assert.equal(result.failure,null);assert.equal(result.launches.length,5);assert.deepEqual(result.unconfirmedRoots,[]);
});
for(const fault of ['skipped','duplicate','missing-proof','missing-root','unclosed'])test('media supervisor rejects '+fault+' before another launch',async()=>{
  const {superviseTransitionChild}=await subject(),child=childFixture();const pending=superviseTransitionChild({child,nonce,roots,scenario:'media-preservation',deadlineMs:500});
  const first={...intent(),launchOccurrence:0,launchId:'valid-ui:0:seed'};child.emit('message',fault==='skipped'?{...first,launchOccurrence:1,launchId:'valid-ui:1:seed'}:first);
  if(fault!=='skipped')assert.equal(child.sent.length,1,'valid first intent must actually be admitted');
  if(fault==='duplicate')child.emit('message',first);
  if(fault==='missing-proof')child.emit('message',{...first,type:'close-success'});
  if(fault==='missing-root')child.emit('message',{...first,type:'close-success',shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:false}});
  const before=child.sent.length;child.emit('message',{...first,phase:'old',launchOccurrence:1,launchId:'valid-ui:1:old'});
  assert.equal(child.sent.length,before);exit(child);assert.ok((await pending).failure);
});

test('supervisor requires matching close ACK, result and actual normal exit', async () => {
  const { superviseTransitionChild } = await subject(); const child = childFixture();
  const pending = superviseTransitionChild({ child, nonce, roots, control: 'storage-loss', deadlineMs: 500 });
  child.emit('message', intent());
  assert.deepEqual(child.sent, [{ ...intent(), type: 'launch-ack' }]);
  child.emit('message', close()); child.emit('message', { type: 'result', nonce, result: { marker: 'actual' } });
  let finished = false; pending.then(() => { finished = true; }); await Promise.resolve(); assert.equal(finished, false);
  exit(child);
  const result = await pending;
  assert.equal(result.result.marker, 'actual'); assert.equal(result.failure, null);
  assert.deepEqual(result.unconfirmedRoots, []); assert.equal(result.normalExit, true);
});

for (const mutation of ['duplicate-intent', 'wrong-root', 'wrong-nonce', 'wrong-close', 'duplicate-close', 'result-before-close', 'missing-result', 'abnormal-exit']) {
  test(`supervisor rejects ${mutation} rather than treating child exit as cleanup`, async () => {
    const { superviseTransitionChild } = await subject(); const child = childFixture();
    const pending = superviseTransitionChild({ child, nonce, roots, deadlineMs: 500 });
    if (mutation === 'wrong-root') child.emit('message', { ...intent(), root: '../other' });
    else if (mutation === 'wrong-nonce') child.emit('message', { ...intent(), nonce: 'bad' });
    else {
      child.emit('message', intent());
      if (mutation === 'duplicate-intent') child.emit('message', intent());
      if (mutation === 'wrong-close') child.emit('message', { ...close(), launchId: 'other' });
      if (mutation !== 'result-before-close') child.emit('message', close());
      if (mutation === 'duplicate-close') child.emit('message', close());
      if (mutation !== 'missing-result') child.emit('message', { type: 'result', nonce, result: {} });
    }
    exit(child, mutation === 'abnormal-exit' ? 1 : 0);
    const result = await pending;
    assert.ok(result.failure, mutation); assert.notEqual(result.failure.code, 'transition-storage-preservation');
    if (mutation === 'result-before-close') assert.deepEqual(result.unconfirmedRoots, [root]);
  });
}

test('supervisor deadline/kill failure is bounded and preserves unconfirmed launch root', async () => {
  const { superviseTransitionChild } = await subject(); const child = childFixture(); let killed = false;
  const pending = superviseTransitionChild({ child, nonce, roots, deadlineMs: 20,
    killChild: async target => { assert.equal(target, child); killed = true; throw Error('kill-failed'); } });
  child.emit('message', intent()); const result = await pending;
  assert.equal(killed, true); assert.equal(result.failure.code, 'transition-child-timeout');
  assert.equal(result.normalExit, false); assert.deepEqual(result.unconfirmedRoots, [root]);
  assert.equal(result.cleanupErrors[0].code, 'transition-kill-failed');
});

test('failure is retained through close and result instead of losing captured storage observation', async () => {
  const { superviseTransitionChild } = await subject(); const child = childFixture();
  const pending = superviseTransitionChild({ child, nonce, roots, deadlineMs: 500 });
  child.emit('message', intent());
  const failure = { code: 'transition-storage-preservation', caseId: 'valid-ui', phase: 'new', step: 'startup', stage: 'candidate-init', observation: { raw: {} }, cleanupErrors: [] };
  child.emit('message', { type: 'failure', nonce, failure }); child.emit('message', close());
  child.emit('message', { type: 'result', nonce, result: {} }); exit(child);
  const result = await pending; assert.deepEqual(result.failure, failure); assert.deepEqual(result.unconfirmedRoots, []);
});

test('test-only manifests change only two fields and loss insertion keeps background intact', async () => {
  const { phasePayload } = await subject();
  const { readPublishedPayload } = await import('../scripts/extension-e2e/published-payload.mjs');
  const payload = await readPublishedPayload();
  const original = structuredClone(payload);
  const input = payload.entries.find(e => e.name === 'manifest.json').bytes;
  for (const [phase, version] of [['old', '2.13.3'], ['new', '2.13.4'], ['rollback', '2.13.5']]) {
    const entries = phasePayload(payload, phase, phase === 'new' ? 'storage-loss' : undefined);
    const manifest = JSON.parse(entries.find(e => e.name === 'manifest.json').bytes);
    const originalManifest = JSON.parse(input);
    assert.equal(manifest.version, version);
    assert.equal(manifest.version.split('.').length, 3);
    if (phase !== 'old') assert.equal(manifest.version_name, `AF05-B2 TEST ONLY ${phase}`);
    delete manifest.version; delete manifest.version_name; delete originalManifest.version; delete originalManifest.version_name;
    assert.deepEqual(manifest, originalManifest);
    for (const entry of payload.entries) {
      if (entry.name === 'manifest.json' || (phase === 'new' && entry.name === 'settings-broker.js')) continue;
      assert.deepEqual(entries.find(e => e.name === entry.name).bytes, entry.bytes);
    }
    assert.deepEqual(entries.find(e => e.name === 'background.js').bytes, payload.entries.find(e => e.name === 'background.js').bytes);
  }
  assert.deepEqual(payload.entries.map(e => [...e.bytes]), original.entries.map(e => [...e.bytes]));
  const bad = { ...payload, entries: payload.entries.map(e => e.name === 'settings-broker.js' ? { ...e, bytes: Buffer.from('no marker') } : e) };
  assert.throws(() => phasePayload(bad, 'new', 'storage-loss'), { code: 'transition-control-preparation' });
});

test('loss control requires exact raw config removal at candidate-init with revision nonce and cleanup', async () => {
  const { matchesStorageLoss } = await subject();
  const raw = { styles: ['future-style', 'hide-ranking', 'chat-font-size'], styleParameters: { future: 9, 'chat-font-size': 8 },
    settingsRevision: 8, futureTop: { runNonce: nonce, untouched: true } };
  const failure = { code: 'transition-storage-preservation', caseId: 'valid-ui', phase: 'new', step: 'startup',
    stage: 'candidate-init', observation: { raw, execution: { extensionId: 'a'.repeat(32), version: '2.13.4', brokerMatches: true } }, cleanupErrors: [] };
  assert.equal(matchesStorageLoss(failure, nonce, 'a'.repeat(32)), true);
  for (const mutate of [v => { v.stage = 'phase-action'; }, v => { v.caseId = 'legacy-null'; }, v => { v.phase = 'old'; },
    v => { delete v.observation; }, v => { v.observation.raw.config = {}; }, v => { v.observation.raw.settingsRevision = 0; },
    v => { v.observation.raw.futureTop.runNonce = 'bad'; }, v => { v.cleanupErrors.push({ code: 'close-failed' }); },
    v => { v.code = 'transition-action-timeout'; }]) {
    const value = structuredClone(failure); mutate(value); assert.equal(matchesStorageLoss(value, nonce, 'a'.repeat(32)), false);
  }
});

test('loss admission refuses missing or wrong execution provenance', async () => {
  const { matchesStorageLoss } = await subject();
  const raw = { styles: ['future-style', 'hide-ranking', 'chat-font-size'], styleParameters: { future: 9, 'chat-font-size': 8 },
    settingsRevision: 8, futureTop: { runNonce: nonce, untouched: true } };
  const id = 'a'.repeat(32);
  const failure = { code: 'transition-storage-preservation', caseId: 'valid-ui', phase: 'new', step: 'startup', stage: 'candidate-init',
    observation: { raw, execution: { extensionId: id, version: '2.13.4', brokerMatches: true } }, cleanupErrors: [] };
  assert.equal(matchesStorageLoss(failure, nonce, id), true);
  for (const change of [v => { delete v.observation.execution; }, v => { v.observation.execution.version = '2.13.3'; },
    v => { v.observation.execution.extensionId = 'b'.repeat(32); }, v => { v.observation.execution.brokerMatches = false; }]) {
    const value = structuredClone(failure); change(value); assert.equal(matchesStorageLoss(value, nonce, id), false);
  }
});

test('protocol failure after expected loss is retained as a disqualifying secondary error', async () => {
  const { superviseTransitionChild } = await subject(); const child = childFixture();
  const pending = superviseTransitionChild({ child, nonce, roots, deadlineMs: 500 });
  child.emit('message', intent());
  child.emit('message', { type: 'failure', nonce, failure: { code: 'transition-storage-preservation' } });
  child.emit('message', close()); child.emit('message', close());
  child.emit('message', { type: 'result', nonce, result: {} }); exit(child);
  const value = await pending;
  assert.equal(value.failure.code, 'transition-storage-preservation');
  assert.ok(value.secondaryErrors.some(error => error.code === 'transition-ipc'));
});

for (const mode of ['exit', 'hang']) test(`real detached descendant ${mode} never proves browser close`, async t => {
  const { superviseTransitionChild, terminateTransitionChild } = await subject();
  const parent = path.resolve('output'); await fs.mkdir(parent, { recursive: true });
  const absolute = await fs.mkdtemp(path.join(parent, 'transition-descendant-'));
  const child = fork('tests/fixtures/installed-extension/transition-child.cjs', [], { detached: process.platform !== 'win32',
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
  let descendant;
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) await terminateTransitionChild(child);
    if (descendant) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(descendant), '/T', '/F'], { windowsHide: true, timeout: 5000 });
      else { try { process.kill(-descendant, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    }
    await fs.rm(absolute, { recursive: true, force: true });
  });
  // The test's absolute root is sent explicitly, never discovered through general process scanning.
  const pending = superviseTransitionChild({ child, nonce, roots: [{ caseId: 'valid-ui', root: absolute }], deadlineMs: mode === 'hang' ? 2000 : 5000 });
  child.send({ nonce, root: absolute, mode });
  const result = await pending;
  descendant = Number(await fs.readFile(path.join(absolute, 'descendant.pid'), 'utf8'));
  assert.ok(Number.isSafeInteger(descendant) && descendant > 0);
  try { process.kill(descendant, 0); }
  catch (error) { if (!(process.platform === 'win32' && mode === 'hang' && error.code === 'ESRCH')) throw error; }
  assert.ok(result.failure); assert.deepEqual(result.unconfirmedRoots, [absolute]);
  assert.ok(await fs.stat(absolute));
});

test('runner CLI refuses control/profile/source overrides and static tool rules remain unchanged', async () => {
  await subject();
  for (const argument of ['--profile=C:/Users/User', '--source=dist', '--control=other']) {
    const result = spawnSync(process.execPath, ['scripts/check-installed-transition.mjs', argument], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /installed-e2e-args-invalid|transition-control-invalid/);
  }
  const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--config', 'eslint.security.config.mjs',
    '--no-inline-config', '--max-warnings=0', '--format=json', 'scripts/check-installed-transition.mjs'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('parent refuses missing/mutated final evidence even when child result claims success', async () => {
  const { validateTransitionResult } = await subject();
  for (const result of [{}, { source: {}, after: {}, seeds: [], phases: [], cleanupErrors: [] }]) {
    assert.throws(() => validateTransitionResult(result, nonce, undefined, []), { code: 'transition-result-incomplete' });
  }
});

test('parent revalidates every action observation identity hash and no-reseed sequence', async () => {
  const { validateTransitionResult } = await subject();
  const { expectedTransitionState, transitionSeed } = await import('../scripts/extension-e2e/transition-scenario.mjs');
  const id = 'a'.repeat(32), hash = '1'.repeat(64);
  const steps = ['startup', 'arrow-off', 'volume25', 'hide-ranking-on', 'font8', 'font8'];
  const records = steps.map((step, index) => ({ step, ...(index === 5 ? { reloaded: true } : {}),
    observation: expectedTransitionState('valid-ui', 'old', step, nonce, id, { reloaded: index === 5, reloads: index === 5 ? [1, 0] : [0, 0] }) }));
  const result = { source: { sourceCommit: 'a'.repeat(40) }, after: { sourceCommit: 'a'.repeat(40) }, candidateInventory: hash,
    seeds: [{ caseId: 'valid-ui', raw: transitionSeed('valid-ui', nonce), extensionId: id, writes: 1,
      preparation: { developerMode: true, workerClosed: true, extensionId: id, version: '2.13.3', state: 'ENABLED' } }],
    phases: [{ caseId: 'valid-ui', phase: 'old', records, final: records.at(-1).observation, extensionId: id, inventorySha256: hash, manifestSha256: hash,
      preparation: { developerMode: true, workerClosed: true, extensionId: id, version: '2.13.3', state: 'ENABLED' } }] };
  const launches = ['seed', 'old', 'new'].map(phase => ({ caseId: 'valid-ui', phase }));
  assert.equal(validateTransitionResult(result, nonce, 'storage-loss', launches), undefined);
  for (const mutate of [v => { v.seeds[0].writes = 2; }, v => { v.phases[0].records.pop(); },
    v => { v.phases[0].records[1].observation.raw.config.futureFlag = 'lost'; },
    v => { v.phases[0].records[1].observation.runtime.ready = false; },
    v => { v.phases[0].extensionId = 'b'.repeat(32); }, v => { v.phases[0].manifestSha256 = ''; },
    v => { v.after.sourceCommit = 'b'.repeat(40); }, v => { v.phases[0].records[5].observation.css.reloads = [1, 1]; },
    v => { v.seeds[0].preparation.developerMode = false; }, v => { v.phases[0].preparation.workerClosed = false; },
    v => { v.phases[0].preparation.version = '2.13.4'; }]) {
    const value = structuredClone(result); mutate(value); assert.throws(() => validateTransitionResult(value, nonce, 'storage-loss', launches));
  }
});

function parentFixture(fault) {
  const events = [], child = childFixture(); let serial = 0;
  const files = {
    root: path.resolve('.'),
    async ensureDirectory(name) { events.push(`ensure:${name}`); return path.join(this.root, name); },
    async lstat(name) { return (fault === 'artifact-exists' && name.includes('installed-extension-transition')) ||
      (fault === 'candidate-exists' && name.includes('p02-candidate')) ? {} : null; },
    async writeFile(name) { events.push(`write:${name}`); if ((fault === 'summary' && name.endsWith('summary.json')) ||
      (fault === 'claim' && name.endsWith('.lock'))) throw Object.assign(Error(fault), { code: `test-${fault}` }); },
    async makeTempDirectory() { events.push('root-create'); if (fault === 'root') throw Object.assign(Error('root'), { code: 'test-root' });
      return path.join(this.root, `output/playwright/installed-transition-work-fixture${serial++}`); },
    async removeTree(name) { events.push(`remove:${name}`); if (fault === 'cleanup' && name.includes('installed-transition-work')) throw Object.assign(Error('cleanup'), { code: 'test-cleanup' }); },
  };
  const dependencies = {
    openRepository: async () => files, forkChild: () => { events.push('fork'); return child; },
    removeCandidate: async id => { events.push(`candidate-remove:${id}`); },
    supervise: async () => { await new Promise(resolve => setImmediate(resolve));
      const options = child.sent[0];
      return { failure: { code: 'test-phase', caseId: 'valid-ui', phase: 'new', step: 'startup', stage: 'candidate-init', observation: { raw: {} }, cleanupErrors: [] },
        result: { source: { sourceCommit: 'a'.repeat(40) }, after: { sourceCommit: 'a'.repeat(40) }, cleanupErrors: [] },
        unconfirmedRoots: fault === 'unconfirmed' ? [options.roots[0].root] : [], normalExit: true, launches: [] };
    },
  };
  return { events, dependencies };
}

test('F01 parent assigns every fixed case and retains its own roots and candidates after failure',async()=>{
  const {runInstalledTransition}=await subject(),fixture=parentFixture('phase');
  await assert.rejects(runInstalledTransition({runId:'F01parent',mediaSchema:'f01',dependencies:fixture.dependencies}),error=>{
    assert.equal(error.report.retainedRoots.length,11);assert.equal(error.report.mediaSchema,'f01');assert.equal(error.report.candidatesRetained,true);return true;
  });
  assert.equal(fixture.events.some(value=>value.startsWith('candidate-remove:')||value.startsWith('remove:output/playwright/installed-transition-work-')),false);
  for(const options of [{mediaSchema:'unknown'},{mediaSchema:'f01',scenario:'media-preservation'},{mediaSchema:'f01',control:'media-profile-loss'}]){
    await assert.rejects(runInstalledTransition({runId:'F01bad',...options,dependencies:fixture.dependencies}),/transition-(scenario|control)-invalid/);
  }
});

test('parent storage-loss PASS is vetoed by a later protocol or inventory fault', async () => {
  const { runInstalledTransition } = await subject();
  const { expectedTransitionState, transitionSeed, expectedTransitionRaw } = await import('../scripts/extension-e2e/transition-scenario.mjs');
  for (const later of [null, 'protocol', 'inventory']) {
    const fixture = parentFixture('phase'), child = childFixture(), id = 'a'.repeat(32), hash = '1'.repeat(64);
    fixture.dependencies.forkChild = () => child;
    fixture.dependencies.supervise = async () => {
      await new Promise(resolve => setImmediate(resolve)); const options = child.sent[0], n = options.nonce;
      const steps = ['startup', 'arrow-off', 'volume25', 'hide-ranking-on', 'font8', 'font8'];
      const records = steps.map((step, i) => ({ step, ...(i === 5 ? { reloaded: true } : {}), observation: expectedTransitionState('valid-ui', 'old', step, n, id,
        { reloaded: i === 5, reloads: i === 5 ? [1, 0] : [0, 0] }) }));
      const raw = expectedTransitionRaw('valid-ui', 'old', 'font8', n); delete raw.config;
      return { failure: { code: 'transition-storage-preservation', caseId: 'valid-ui', phase: 'new', step: 'startup', stage: 'candidate-init', cleanupErrors: [],
        observation: { raw, execution: { extensionId: id, version: '2.13.4', brokerMatches: true } } },
        result: { source: { sourceCommit: 'a'.repeat(40) }, after: { sourceCommit: 'a'.repeat(40) }, candidateInventory: hash,
          seeds: [{ caseId: 'valid-ui', raw: transitionSeed('valid-ui', n), extensionId: id, writes: 1,
            preparation: { developerMode: true, workerClosed: true, extensionId: id, version: '2.13.3', state: 'ENABLED' } }],
          phases: [{ caseId: 'valid-ui', phase: 'old', records, final: records.at(-1).observation, extensionId: id, inventorySha256: hash, manifestSha256: hash,
            preparation: { developerMode: true, workerClosed: true, extensionId: id, version: '2.13.3', state: 'ENABLED' } }],
          secondaryErrors: later === 'inventory' ? [{ code: 'transition-inventory' }] : [], cleanupErrors: [] },
        secondaryErrors: later === 'protocol' ? [{ code: 'transition-ipc' }] : [], cleanupErrors: [], normalExit: true, unconfirmedRoots: [],
        launches: ['seed', 'old', 'new'].map(phase => ({ caseId: 'valid-ui', phase })) };
    };
    if (!later) assert.equal((await runInstalledTransition({ runId: 'Control1', control: 'storage-loss', dependencies: fixture.dependencies })).ok, true);
    else await assert.rejects(runInstalledTransition({ runId: 'Control1', control: 'storage-loss', dependencies: fixture.dependencies }), error => {
      assert.equal(error.report.ok, false); assert.equal(error.report.secondaryErrors.length, 1); return true;
    });
  }
});

for (const fault of ['artifact-exists', 'candidate-exists', 'claim', 'root', 'phase', 'cleanup', 'summary', 'unconfirmed']) {
  test(`parent ${fault} never deletes an existing target or reports control PASS`, async () => {
    const { runInstalledTransition } = await subject(); const fixture = parentFixture(fault);
    await assert.rejects(runInstalledTransition({ runId: 'Fault1', dependencies: fixture.dependencies }), error => {
      assert.notEqual(error.report?.ok, true);
      if (fault === 'cleanup') { assert.equal(error.code, 'test-phase'); assert.ok(error.report.cleanupErrors.some(e => e.code === 'test-cleanup')); }
      if (fault === 'unconfirmed') assert.equal(error.report.retainedRoots.length, 1);
      return true;
    });
    if (['artifact-exists', 'claim', 'candidate-exists'].includes(fault)) {
      assert.equal(fixture.events.includes('fork'), false);
      assert.equal(fixture.events.some(e => e.startsWith('candidate-remove')), false);
    }
    if (fault === 'unconfirmed') {
      assert.equal(fixture.events.includes('remove:output/playwright/installed-transition-work-fixture0'), false);
      assert.equal(fixture.events.includes('remove:output/playwright/installed-transition-work-fixture1'), true);
    }
  });
}

test('media parent admits four observations and exact loss only, with later failures vetoing PASS', async () => {
  const { runInstalledTransition } = await subject();
  const api = await import('../scripts/extension-e2e/transition-scenario.mjs');
  for (const mode of ['positive', 'loss', 'protocol', 'inventory', 'cleanup', 'unclosed', 'wrong-occurrence', 'timeout']) {
    const fixture = parentFixture('phase'), child = childFixture(), id = 'a'.repeat(32), hash = '1'.repeat(64);
    fixture.dependencies.forkChild = () => child;
    fixture.dependencies.supervise = async supplied => {
      assert.equal(supplied.scenario, 'media-preservation');
      await new Promise(resolve => setImmediate(resolve));
      const options = child.sent[0], n = options.nonce, presetId = '11111111-1111-4111-8111-111111111111';
      assert.equal(options.roots.length, 1); assert.equal(options.scenario, 'media-preservation');
      const store = api.expectedInstalledMediaStore(n, presetId), seed = api.transitionSeed('valid-ui', n);
      const prepare = version => ({ developerMode: true, workerClosed: true, extensionId: id, version, state: 'ENABLED' });
      const result = { scenario: 'media-preservation', source: { sourceCommit: 'a'.repeat(40) }, after: { sourceCommit: 'a'.repeat(40) },
        candidateInventory: hash, seeds: [{ caseId: 'valid-ui', raw: seed, writes: 1, extensionId: id, preparation: prepare('2.13.3') }], phases: [] };
      for (const [index, phase] of api.MEDIA_TRANSITION_PHASES.entries()) {
        const occurrence = index + 1, version = phase === 'old' ? '2.13.3' : phase === 'rollback' ? '2.13.5' : '2.13.4';
        if (mode !== 'positive' && occurrence === 4) break;
        const observation = withStore => ({ raw: { ...structuredClone(seed), ...(withStore ? { mediaProfiles: structuredClone(store) } : {}) },
          execution: { extensionId: id, version, brokerMatches: true } });
        const initial = observation(occurrence >= 3), final = observation(occurrence >= 2);
        const records = [{ step: 'startup', observation: initial }, ...(occurrence === 2 ? [{ step: 'create-media', observation: final }] : []),
          { step: 'observe-ui', observation: final }];
        result.phases.push({ caseId: 'valid-ui', phase, launchOccurrence: occurrence, extensionId: id, inventorySha256: hash, manifestSha256: hash,
          preparation: prepare(version), records, final, presetId: occurrence >= 2 ? presetId : undefined });
      }
      const launches = ['seed', ...api.MEDIA_TRANSITION_PHASES].map((phase, launchOccurrence) => ({ caseId: 'valid-ui', phase, launchOccurrence,
        launchId: `valid-ui:${launchOccurrence}:${phase}`, closed: true,
        shutdown: { browserCloseAcknowledged: true, browserDisconnected: true, ownedRootClosed: mode !== 'unclosed' } }));
      return { result, launches, normalExit: true, unconfirmedRoots: mode === 'unclosed' ? [options.roots[0].root] : [],
        secondaryErrors: mode === 'protocol' ? [{ code: 'transition-ipc' }] : [], cleanupErrors: mode === 'cleanup' ? [{ code: 'close' }] : [],
        ...(mode === 'positive' ? {} : { failure: { code: mode === 'timeout' ? 'media-ui-timeout' : 'media-preservation', caseId: 'valid-ui', phase: 'new',
          launchOccurrence: mode === 'wrong-occurrence' ? 2 : 4, step: 'startup', stage: 'candidate-init', cleanupErrors: [],
          observation: { raw: { ...seed, mediaProfiles: api.expectedInstalledMediaLoss(store) }, execution: { extensionId: id, version: '2.13.4', brokerMatches: true } } } }),
        ...(mode === 'inventory' ? { result: { ...result, secondaryErrors: [{ code: 'transition-inventory' }] } } : {}) };
    };
    const options = { runId: 'Media1', scenario: 'media-preservation', dependencies: fixture.dependencies,
      ...(mode === 'positive' ? {} : { control: 'media-profile-loss' }) };
    if (['positive', 'loss'].includes(mode)) {
      const report=await runInstalledTransition(options);assert.equal(report.ok,true);
      assert.equal(report.shutdown.normalExit,true);assert.equal(report.shutdown.closes.length,5);
      assert.ok(report.shutdown.closes.every(value=>value.closed&&value.browserCloseAcknowledged&&value.browserDisconnected&&value.ownedRootClosed));
    }
    else await assert.rejects(runInstalledTransition(options), error => error.report?.ok === false);
    assert.equal(fixture.events.some(value => value.startsWith('candidate-remove:')), false);
    assert.equal(fixture.events.some(value => value.startsWith('remove:output/playwright/installed-transition-work-')), false);
  }
});

test('media selectors reject duplicate unknown incompatible and source/profile overrides before launch', () => {
  for (const args of [ ['--scenario=other'], ['--scenario=media-preservation', '--scenario=media-preservation'],
    ['--control=media-profile-loss'], ['--scenario=media-preservation', '--control=storage-loss'],
    ['--scenario=media-preservation', '--control=media-profile-loss', '--control=media-profile-loss'],
    ['--scenario=media-preservation', '--qualification=media-tab'], ['--scenario=media-preservation', '--profile=C:/Users/User'] ]) {
    const result = spawnSync(process.execPath, ['scripts/check-installed-transition.mjs', ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /transition-scenario-invalid|transition-control-invalid|installed-e2e-args-invalid/);
  }
});
