const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
test('player Gain runner rejects unknown flags modes duplicate IDs before browser effects', async () => {
  const module = await import(pathToFileURL(path.resolve('scripts/check-installed-player-gain.mjs')));
  assert.deepEqual(module.parsePlayerGainArgs(['--run-id=F01qualification', '--mode=qualification']), { runId: 'F01qualification', mode: 'qualification', headed: false });
  assert.deepEqual(module.parsePlayerGainArgs(['--run-id=F01gain', '--mode=full']), { runId: 'F01gain', mode: 'full', headed: false });
  for (const args of [[], ['--run-id=../bad', '--mode=qualification'], ['--run-id=A','--run-id=B','--mode=qualification'],
    ['--run-id=A','--mode=unknown'], ['--run-id=A','--mode=qualification','--remote-port=9222']]) assert.throws(() => module.parsePlayerGainArgs(args), /player-gain-args/);
});
test('new real audio fixtures are independent and expose no forged eligibility source or staged intent', async () => {
  const html = await fs.readFile('tests/fixtures/installed-extension/audio-live.html', 'utf8');
  const script = await fs.readFile('tests/fixtures/installed-extension/audio-site.js', 'utf8');
  assert.match(html, /class="pzp-pc__video"/); assert.match(html, /class="pzp-pc__volume-control"/);
  assert.match(script, /URL\.createObjectURL\(new Blob/); assert.match(script, /audio\/wav/);
  assert.doesNotMatch(script, /Object\.defineProperty\(video|\.AudioContext\s*=|\.eligible\s*=|player-gain\.private|\bfetch\(/);
  const { loadAudioFixtureResponses, fixtureDecision, FIXTURE_AUDIO_URL } = await import('../scripts/extension-e2e/fixture-router.mjs');
  const { openOwnedRoot } = await import('../scripts/owned-files.mjs');
  const responses = await loadAudioFixtureResponses(await openOwnedRoot(process.cwd()));
  assert.equal(responses.length, 2); assert.equal(fixtureDecision(FIXTURE_AUDIO_URL, responses).action, 'fulfill');
  assert.equal(fixtureDecision(FIXTURE_AUDIO_URL + '?other=1', responses).action, 'abort');
});
test('closed Gain inspection requires one owner range and rejects open or oversized trees', async () => {
  const { findOwnedRange } = await import('../scripts/check-installed-player-gain.mjs');
  const input = { nodeName: 'INPUT', nodeId: 42 };
  const host = { nodeName: 'SPAN', attributes: ['class', 'knife-owned knife-gain-owner'], shadowRoots: [{ shadowRootType: 'closed', children: [input] }] };
  assert.equal(findOwnedRange({ children: [host] }), 42);
  assert.throws(() => findOwnedRange({ children: [] }), /range-missing/);
  assert.throws(() => findOwnedRange({ children: [host, host] }), /range-ambiguous/);
  assert.throws(() => findOwnedRange({ ...host, shadowRoots: [{ shadowRootType: 'open', children: [input] }] }), /shadow-open/);
  assert.throws(() => findOwnedRange({ children: Array.from({ length: 2049 }, () => ({ nodeName: 'DIV' })) }), /dom-budget/);
});
