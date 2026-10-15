const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const runnerModule = () => import(pathToFileURL(path.resolve('scripts/check-installed-extension.mjs')));

test('installed runner summary preserves original native preparation details through a wrapped launch failure',async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=runnerFixture(),files=await f.dependencies.openRepository();let summary;
  const original=Object.assign(Error('browser-unavailable'),{code:'browser-unavailable',cause:Object.assign(Error('sdk failed'),{
    code:5,signal:null,killed:false,stderr:'denied',secret:'omit',preparationDiagnostic:{stage:'manifest-tool',elapsedMs:17}})});
  f.dependencies.launchInstalledExtension=async()=>{throw original;};
  const write=files.writeFile;files.writeFile=async(relative,data)=>{if(relative.endsWith('/summary.json'))summary=JSON.parse(data);return write(relative,data);};
  await assert.rejects(()=>runInstalledExtensionE2E({runId:'Run1',headed:false,dependencies:f.dependencies}),error=>error===original);
  assert.ok(summary.error.native,'summary must include the native failure chain');
  assert.equal(summary.error.native.cause.code,5);assert.equal(summary.error.native.cause.stderr,'denied');
  assert.equal(summary.error.native.cause.preparationDiagnostic.stage,'manifest-tool');assert.equal(summary.error.native.cause.secret,undefined);
});

function runnerFixture({ failAt, artifactExists = false } = {}) {
  const events = [];
  const root = path.resolve('.');
  const profilePath = path.join(root, 'output', 'playwright', 'installed-profile-fixture');
  const artifactPath = path.join(root, 'output', 'playwright', 'installed-extension-Run1');
  const context = {
    tracing: {
      async start() { events.push('trace-start'); if (failAt === 'tracing') throw Object.assign(new Error('trace-start-failed'), { code: 'trace-start-failed' }); },
      async stop() { events.push('trace-stop'); if (failAt === 'trace-stop') throw Object.assign(new Error('trace-stop-failed'), { code: 'trace-stop-failed' }); },
    },
    pages() { return [{ screenshot: async () => { events.push('screenshot'); } }]; },
    async close() { events.push('context-close'); },
  };
  const files = {
    root,
    async lstat() { return artifactExists ? { isDirectory: () => true } : null; },
    async ensureDirectory(relative) { events.push(`ensure:${relative}`); return path.join(root, ...relative.split('/')); },
    async makeTempDirectory() { events.push('profile-create'); return profilePath; },
    async resolve(relative) { return relative.includes('installed-extension-') ? artifactPath : path.join(root, ...relative.split('/')); },
    async removeTree(relative) { events.push(relative.includes('installed-profile-') ? 'profile-remove' : `remove:${relative}`); return true; },
    async writeFile(relative) {
      events.push('json-write');
      if (failAt === 'json') throw Object.assign(new Error('json-write-failed'), { code: 'json-write-failed' });
      return path.join(root, ...relative.split('/'));
    },
  };
  const dependencies = {
    openRepository: async () => files,
    verifyCandidate: async id => { events.push('candidate-build'); return { dist: path.join(root, 'candidate', id, 'dist') }; },
    checkPackage: async () => { events.push('candidate-check'); },
    loadFixtureResponses: async () => { events.push('fixture-load'); return []; },
    launchInstalledExtension: async () => { events.push('browser-launch'); return { context, worker: {}, extensionId: 'a'.repeat(32) }; },
    chromiumApi: {},
    scenario: async () => {
      events.push('scenarios');
      if (failAt === 'scenario') throw Object.assign(new Error('scenario-failed'), { code: 'scenario-failed' });
      return { worker: { passed: true } };
    },
    removeCandidate: async () => { events.push('candidate-remove'); return true; },
  };
  return { events, dependencies, context };
}

test('installed E2E runner orders isolated candidate, browser and cleanup lifecycle', async () => {
  const { runInstalledExtensionE2E } = await runnerModule();
  const fixture = runnerFixture();
  const report = await runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies });
  assert.equal(report.ok, true);
  const milestones = ['candidate-build', 'profile-create', 'browser-launch', 'scenarios', 'context-close', 'profile-remove', 'candidate-remove'];
  assert.deepEqual(fixture.events.filter(event => milestones.includes(event)), milestones);
  assert.ok(fixture.events.indexOf('candidate-check') > fixture.events.indexOf('candidate-build'));
  assert.ok(fixture.events.indexOf('fixture-load') < fixture.events.indexOf('browser-launch'));
  assert.ok(fixture.events.indexOf('json-write') > fixture.events.indexOf('candidate-remove'));
});

test('installed E2E runner cleans profile and candidate after scenario, tracing and JSON failures', async () => {
  const { runInstalledExtensionE2E } = await runnerModule();
  for (const failAt of ['scenario', 'tracing', 'trace-stop', 'json']) {
    const fixture = runnerFixture({ failAt });
    await assert.rejects(runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies }), error => {
      assert.equal(error.code, failAt === 'scenario' ? 'scenario-failed' : failAt === 'tracing' ? 'trace-start-failed' : failAt === 'trace-stop' ? 'trace-stop-failed' : 'json-write-failed');
      return true;
    });
    assert.equal(fixture.events.filter(event => event === 'context-close').length, 1, failAt);
    assert.equal(fixture.events.filter(event => event === 'profile-remove').length, 1, failAt);
    assert.equal(fixture.events.filter(event => event === 'candidate-remove').length, 1, failAt);
  }
});

test('installed E2E runner never overwrites an existing artifact directory', async () => {
  const { runInstalledExtensionE2E } = await runnerModule();
  const fixture = runnerFixture({ artifactExists: true });
  await assert.rejects(runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies }), {
    code: 'installed-artifact-exists',
  });
  assert.equal(fixture.events.includes('json-write'), false);
  assert.equal(fixture.events.includes('candidate-remove'), true);
  assert.equal(fixture.events.includes('profile-create'), false);
});
for(const qualification of ['media-tab','player-gain','audio-settings']) for(const mode of ['ok','scenario','close-proof','missing-proof','missing-session','unsupported','dirty-source','changed-source','extra-asset','missing-asset'])test(qualification+' runner owns shutdown and preserves failed candidates: '+mode,async()=>{
  const {runInstalledExtensionE2E}=await runnerModule(),f=runnerFixture();
  f.dependencies.platform=mode==='unsupported'?'linux':'win32';
  const buildCandidate=f.dependencies.verifyCandidate;f.dependencies.verifyCandidate=async id=>({...await buildCandidate(id),
    files:mode==='extra-asset'?['dist/media-profiles.js','dist/extra.js']:mode==='missing-asset'?[]:['dist/media-profiles.js']});
  f.dependencies.expectedMediaFiles=async()=>['dist/media-profiles.js'];
  let attestations=0;f.dependencies.sourceAttestation=async(_files,required)=>{f.events.push('source-attest');attestations++;
    if(qualification==='audio-settings')assert.ok(required.includes('scripts/check-installed-audio-settings.mjs'));else assert.deepEqual(required,[]);
    if(mode==='dirty-source')throw Object.assign(Error('dirty'),{code:'transition-source-dirty'});
    return {sourceCommit:'a'.repeat(40),sourceSha256:mode==='changed-source'&&attestations>1?'c'.repeat(64):'b'.repeat(64)};};
  f.dependencies.refreshTransitionWorker=async value=>{f.events.push('worker-refresh');return value;};
  f.dependencies.openMediaBrowserSession=async()=>{f.events.push('session-open');return mode==='missing-session'?null:{send:async()=>({}),on(){},off(){}};};
  f.dependencies.mediaScenario=async args=>{
    f.events.push('media-scenario');if(mode==='scenario')throw Object.assign(Error('scenario'),{code:'media-scenario-failed'});
    if(qualification==='audio-settings'&&mode==='ok'){
      assert.equal(typeof args.writeZoomCapture,'function');const before=f.events.filter(event=>event==='json-write').length;
      for(const [name,bytes]of [['../outside.png',new Uint8Array(24)],['audio-zoom200.png',new Uint8Array(24)],
        ['audio-zoom200.png',new Uint8Array(8388609)]])await assert.rejects(args.writeZoomCapture(name,bytes),{code:'media-zoom-capture-invalid'});
      assert.equal(f.events.filter(event=>event==='json-write').length,before);
      const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);
      await args.writeZoomCapture('audio-zoom200-controls.png',png);assert.equal(f.events.filter(event=>event==='json-write').length,before+1);
    }
    return {mediaTab:{passed:true}};
  };
  f.dependencies.closeInstalledMediaBrowser=async()=>{f.events.push('close-proof');if(mode==='close-proof')throw Object.assign(Error('close'),{code:'media-close-failed'});
    return {browserCloseAcknowledged:true,browserDisconnected:mode!=='missing-proof',ownedRootClosed:true};};
  const pending=runInstalledExtensionE2E({runId:'Run1',qualification,dependencies:f.dependencies});
  if(mode==='ok'){
    const report=await pending;assert.equal(report.ok,true);assert.equal(report.mediaTab.passed,true);
    assert.ok(f.events.indexOf('close-proof')<f.events.indexOf('context-close'));assert.equal(report.profileRetained,true);assert.equal(f.events.includes('profile-remove'),false);
  }else{await assert.rejects(pending);assert.equal(f.events.includes('profile-remove'),false);assert.equal(f.events.includes('candidate-remove'),false);}
  assert.equal(f.events.includes('scenarios'),false);
  if(mode==='dirty-source')assert.equal(f.events.includes('browser-launch'),false);
});

test('multi-window scenario starts only after the base handshake state is captured', async () => {
  const { runInstalledScenarioSequence } = await runnerModule();
  const order = [];
  const result = await runInstalledScenarioSequence({ marker: 'input' }, {
    async base(args) {
      order.push('base');
      assert.equal(args.marker, 'input');
      args.captureState({ context: {}, worker: {}, handshake: 'ready' });
      return { popup: { passed: true } };
    },
    async multiWindow(args) {
      order.push('multi-window');
      assert.equal(args.handshake, 'ready');
      args.captureState({ lifecycleReady: true });
      return { multiWindow: { passed: true } };
    },
    async lifecycle(args) {
      order.push('lifecycle');
      assert.equal(args.lifecycleReady, true);
      return { workerWake: { passed: true } };
    },
  });
  assert.deepEqual(order, ['base', 'multi-window', 'lifecycle']);
  assert.deepEqual(result, { popup: { passed: true }, multiWindow: { passed: true }, workerWake: { passed: true } });
});

test('multi-window scenario failure keeps runner cleanup guarantees', async () => {
  const { runInstalledExtensionE2E, runInstalledScenarioSequence } = await runnerModule();
  const fixture = runnerFixture();
  fixture.dependencies.scenario = args => runInstalledScenarioSequence(args, {
    async base(baseArgs) { baseArgs.captureState({ context: {}, worker: {}, handshake: 'ready' }); return { popup: { passed: true } }; },
    async multiWindow() { throw Object.assign(new Error('multi-window-failed'), { code: 'multi-window-failed' }); },
    async lifecycle() { throw new Error('must-not-run'); },
  });
  await assert.rejects(runInstalledExtensionE2E({ runId: 'Run1', headed: false, dependencies: fixture.dependencies }), {
    code: 'multi-window-failed',
  });
  assert.equal(fixture.events.includes('context-close'), true);
  assert.equal(fixture.events.includes('profile-remove'), true);
  assert.equal(fixture.events.includes('candidate-remove'), true);
});
