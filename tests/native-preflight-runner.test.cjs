const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fixture = require('./native-preflight-fixture.cjs');
const subject = () => import('../scripts/check-native-preflight.mjs');
const sources = ['scripts/check-native-preflight.mjs','scripts/extension-e2e/native-preflight.mjs','scripts/extension-e2e/native-preflight-contract.mjs','scripts/extension-e2e/published-payload.mjs',
  'scripts/extension-e2e/transition-scenario.mjs','scripts/extension-e2e/fixture-router.mjs','scripts/owned-files.mjs','tests/fixtures/installed-extension/published-payload.json'];
async function runFixture(t) {
  const { openOwnedRoot } = await import('../scripts/owned-files.mjs');
  const base = path.resolve('output');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'native-local-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const files = await openOwnedRoot(root), repository = await openOwnedRoot(process.cwd());
  for (const name of sources) { await files.ensureDirectory(path.posix.dirname(name)); await files.copyFileFrom(repository, name, name); }
  const payload = await (await import('../scripts/extension-e2e/published-payload.mjs')).readPublishedPayload();
  const baseline = (await import('../scripts/extension-e2e/native-preflight.mjs')).nativePreflightBaseline(payload);
  let clock = 1000, inspectCalls = 0;
  const dependencies = { repository: files, readPayload: async () => payload, now: () => clock += 10,
    inspectNative: async (phase, nonce) => { inspectCalls++; return fixture.facts(baseline, phase, clock += 10, nonce); } };
  const mod = await subject(), call = options => mod.executeNativePreflight([...options, '--run-id=Local'], dependencies);
  const prepared = await call(['--prepare']);
  const run = await openOwnedRoot(path.join(root, 'output/native-preflight-Local'));
  async function record(event, status = 'confirmed', code) { return call([`--record=${event}`, `--status=${status}`, ...(code ? [`--code=${code}`] : [])]); }
  async function inspect(phase) { return call([`--inspect-native=${phase}`]); }
  async function stage(stageName) {
    for (const context of fixture.contexts) {
      await record(`probe:${stageName}:${context}`, 'requested');
      const value = fixture.observation(stageName, context, clock + 1, prepared.runNonce);
      await run.writeFile(`observations/${stageName}-${context}.json`, JSON.stringify(value), { flag: 'wx' });
      await record(`probe:${stageName}:${context}`);
    }
  }
  async function baselineReady() { await inspect('before'); await record('profile-context'); await stage('baseline'); return call(['--check=baseline']); }
  async function seededReady() { await baselineReady(); await record('seed-start'); await stage('seeded'); return call(['--check=seeded']); }
  return { files, root, run, prepared, dependencies, call, record, inspect, stage, baselineReady, seededReady, inspectCalls: () => inspectCalls };
}
test('CLI supports real owned-file 4 to 8 to 12 stages without native profile lookup', async t => {
  const f = await runFixture(t);
  assert.equal(f.prepared.status, 'PREPARED'); assert.equal(f.inspectCalls(), 0);
  assert.equal((await f.baselineReady()).status, 'STAGE-ACCEPTED');
  assert.equal(f.inspectCalls(), 1);
  await f.record('seed-start'); await f.stage('seeded');
  assert.equal((await f.call(['--check=seeded'])).complete, false);
  await f.inspect('closed'); await f.inspect('restarted'); await f.stage('cold'); await f.inspect('after'); await f.record('finalize');
  const result = await f.call(['--check=complete']);
  assert.equal(result.status, 'NATIVE-PREFLIGHT-PASS'); assert.equal(result.complete, true); assert.equal(f.inspectCalls(), 4);
});
test('prepare refuses an existing run without modifying it', async t => {
  const f = await runFixture(t), before = await f.run.readFile('manifest.json');
  await assert.rejects(f.call(['--prepare']), { code: 'native-evidence-invalid' });
  assert.deepEqual(await f.run.readFile('manifest.json'), before); assert.equal(f.inspectCalls(), 0);
});
test('native inspection has no default implementation or automatic fallback', async t => {
  const f = await runFixture(t); delete f.dependencies.inspectNative;
  await assert.rejects(f.inspect('before'), { code: 'native-unavailable' });
  assert.equal(f.inspectCalls(), 0);
});
for (const args of [['--prepare','--run-id=../bad'],['--prepare','--profile=x'],['--check=unknown'],['--record=anything','--status=confirmed']]) {
  test(`CLI refuses unsupported arguments ${args.join(' ')}`, async () => {
    const mod = await subject(); await assert.rejects(mod.executeNativePreflight(args), { code: 'native-evidence-invalid' });
  });
}
test('missing stages fail closed and retain the first failure across a later valid-looking retry', async t => {
  const f = await runFixture(t); await f.inspect('before'); await f.record('profile-context');
  await assert.rejects(f.call(['--check=baseline']));
  await f.stage('baseline').catch(() => {});
  await assert.rejects(f.call(['--check=baseline']));
  assert.ok((await f.run.readdir('events')).length > 0);
});
test('malformed JSON receipts poison the run without exporting raw secrets', async t => {
  const f = await runFixture(t); await f.inspect('before'); await f.record('profile-context');
  await f.record('probe:baseline:worker-before', 'requested');
  await f.run.writeFile('observations/baseline-worker-before.json', 'private-sentinel', { flag: 'wx' });
  await assert.rejects(f.record('probe:baseline:worker-before'), error => error.code === 'native-evidence-invalid' && !error.message.includes('private-sentinel'));
  await assert.rejects(f.call(['--check=baseline']));
});
test('oversized observation is rejected before parsing', async t => {
  const f = await runFixture(t); await f.inspect('before'); await f.record('profile-context'); await f.record('probe:baseline:worker-before','requested');
  await f.run.writeFile('observations/baseline-worker-before.json', Buffer.alloc(1048577), { flag: 'wx' });
  await assert.rejects(f.record('probe:baseline:worker-before'), { code: 'native-evidence-invalid' });
});
test('script source drift vetoes both partial and complete checks', async t => {
  const f = await runFixture(t); await f.inspect('before'); await f.record('profile-context'); await f.stage('baseline');
  await f.files.writeFile(sources[0], 'changed source');
  await assert.rejects(f.call(['--check=baseline']), { code: 'native-source-changed' });
});

test('a backward clock remains terminal after the clock recovers', async t => {
  const f = await runFixture(t); await f.inspect('before'); await f.record('profile-context'); await f.stage('baseline');
  const names = (await f.run.readdir('events')).sort(), last = JSON.parse(await f.run.readFile(`events/${names.at(-1)}`));
  const original = f.dependencies.now; f.dependencies.now = () => last.recordedAt - 1;
  await assert.rejects(f.call(['--check=baseline']), { code: 'native-sequence-invalid' });
  f.dependencies.now = original;
  await assert.rejects(f.call(['--check=baseline']), { code: 'native-sequence-invalid' });
});

test('unresolved intent survives primary and secondary journal write failures', async t => {
  const f = await runFixture(t); await f.inspect('before'); await f.record('profile-context');
  const { openOwnedRoot } = await import('../scripts/owned-files.mjs');
  f.dependencies.openRun = async directory => {
    const owned = await openOwnedRoot(directory);
    return { ...owned, writeFile: async (name, ...args) => {
      if (name.startsWith('events/') || name.endsWith('-result.json')) throw Error('private-io-sentinel');
      return owned.writeFile(name, ...args);
    } };
  };
  await assert.rejects(f.record('probe:baseline:worker-before', 'requested'), error => error.code === 'native-owned-io-failed' && !error.message.includes('private-io-sentinel'));
  delete f.dependencies.openRun;
  await assert.rejects(f.record('probe:baseline:worker-before', 'requested'), { code: 'native-sequence-invalid' });
});

for (const totalBudget of [false, true]) test(`inspector output respects ${totalBudget ? 'prospective run' : 'per-file'} budget before writing`, async t => {
  const f = await runFixture(t), inspect = f.dependencies.inspectNative;
  if (totalBudget) {
    const manifestBytes = (await f.run.readFile('manifest.json')).length;
    let current = manifestBytes;
    for (const name of await f.run.readdir('probes')) current += (await f.run.lstat(`probes/${name}`)).size;
    let remaining = 16777216 - current - 1024, index = 0;
    while (remaining > 0) {
      const size = Math.min(remaining,1048576);
      await f.run.writeFile(`padding${index++}`, Buffer.alloc(size), { flag: 'wx' }); remaining -= size;
    }
  } else f.dependencies.inspectNative = async (...args) => ({ ...await inspect(...args), extra: 'x'.repeat(1048576) });
  await assert.rejects(f.inspect('before'), { code: 'native-evidence-invalid' });
  assert.deepEqual(await f.run.readdir('native'), []);
});
test('failed finalization cannot be replaced by a confirmed event', async t => {
  const f = await runFixture(t); await f.seededReady(); await f.inspect('closed'); await f.inspect('restarted'); await f.stage('cold'); await f.inspect('after');
  await f.record('finalize', 'failed', 'native-finalization-failed');
  await f.record('finalize').catch(() => {});
  await assert.rejects(f.call(['--check=complete']));
});
test('seeded abort preserves storage observations and cannot pass a new baseline', async t => {
  const f = await runFixture(t); await f.seededReady();
  const before = await f.run.readFile('observations/seeded-worker-before.json');
  await f.record('abort','failed','native-user-aborted');
  await assert.rejects(f.call(['--check=complete']));
  assert.deepEqual(await f.run.readFile('observations/seeded-worker-before.json'), before);
});
test('wrong or missing pinned payload never creates valid probes', async t => {
  const f = await runFixture(t);
  for (const readPayload of [async () => { throw Error('private-sentinel'); }, async () => ({ entries: [] })]) {
    await assert.rejects((await subject()).executeNativePreflight(['--prepare','--run-id=Missing'], { ...f.dependencies, readPayload }));
  }
});
test('linked run directories are refused rather than adopted', async t => {
  const f = await runFixture(t), target = path.join(f.root, 'link-target'); await fs.mkdir(target);
  await fs.symlink(target, path.join(f.root,'output/native-preflight-Link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects((await subject()).executeNativePreflight(['--prepare','--run-id=Link'], f.dependencies));
  assert.deepEqual(await fs.readdir(target), []);
});
test('real subprocess CLI prepares only local probes and refuses native inspection', async t => {
  const f = await runFixture(t), repo = await (await import('../scripts/owned-files.mjs')).openOwnedRoot(process.cwd());
  await f.files.ensureDirectory('output/playwright');
  await f.files.copyFileFrom(repo, 'output/playwright/published-payload-67ae9c1512fef7e0.zip', 'output/playwright/published-payload-67ae9c1512fef7e0.zip');
  const script = path.join(f.root,'scripts/check-native-preflight.mjs');
  const prepared = spawnSync(process.execPath,[script,'--prepare','--run-id=Child'],{cwd:f.root,encoding:'utf8',timeout:15000});
  assert.equal(prepared.status,0,prepared.stderr); assert.equal(JSON.parse(prepared.stdout).status,'PREPARED');
  const blocked = spawnSync(process.execPath,[script,'--inspect-native=before','--run-id=Child'],{cwd:f.root,encoding:'utf8',timeout:15000});
  assert.equal(blocked.status,1); assert.equal(JSON.parse(blocked.stderr).code,'native-unavailable');
  assert.ok(!blocked.stderr.includes(f.root));
});

for (const malformed of [false, true]) test(`subprocess startup ${malformed ? 'malformed' : 'missing'} metadata is sanitized and terminal`, async t => {
  const f = await runFixture(t), repo = await (await import('../scripts/owned-files.mjs')).openOwnedRoot(process.cwd());
  await f.files.ensureDirectory('output/playwright');
  await f.files.copyFileFrom(repo, 'output/playwright/published-payload-67ae9c1512fef7e0.zip', 'output/playwright/published-payload-67ae9c1512fef7e0.zip');
  const script = path.join(f.root,'scripts/check-native-preflight.mjs'), metadataName = sources.at(-1), original = await f.files.readFile(metadataName);
  const call = () => spawnSync(process.execPath,[script,'--inspect-native=before','--run-id=Local'],{cwd:f.root,encoding:'utf8',timeout:15000});
  if (malformed) await f.files.writeFile(metadataName, 'private-startup-sentinel');
  else await fs.unlink(await f.files.resolve(metadataName, { type: 'file' }));
  const bad = call(); assert.equal(bad.status,1);
  assert.equal(JSON.parse(bad.stderr).ok,false);
  assert.ok(!bad.stderr.includes(f.root) && !bad.stderr.includes('private-startup-sentinel') && !bad.stderr.includes('Error:'));
  await f.files.writeFile(metadataName, original);
  const later = call(); assert.equal(later.status,1); assert.equal(JSON.parse(later.stderr).code,'native-sequence-invalid');
});
