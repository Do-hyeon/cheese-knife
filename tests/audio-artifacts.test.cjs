const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const load = () => import('../scripts/audio-artifacts.mjs');

async function artifactFixture(t, suffix = '') {
  await fs.mkdir(path.join(process.cwd(), 'output'), { recursive: true });
  const root = await fs.mkdtemp(path.join(process.cwd(), 'output', 'test-audio-artifact-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'web'));
  await fs.writeFile(path.join(root, 'config.js'), `config${suffix}`);
  await fs.writeFile(path.join(root, 'web/runtime.js'), `runtime${suffix}`);
  await fs.writeFile(path.join(root, 'web/site-adapter.js'), `adapter${suffix}`);
  await fs.writeFile(path.join(root, 'web/audio.js'), `audio${suffix}`);
  await fs.writeFile(path.join(root, 'web/player.js'), `player${suffix}`);
  return root;
}

test('audio quality arguments select an artifact root and a safe fixed report label', async () => {
  const { parseAudioQualityArgs } = await load();
  const parsed = parseAudioQualityArgs(['--chrome', '--root', 'dist', '--label', 'root-dist'], 'C:/repo');
  assert.equal(parsed.chrome, true);
  assert.equal(parsed.root, path.resolve('C:/repo', 'dist'));
  assert.equal(parsed.label, 'root-dist');
  assert.throws(() => parseAudioQualityArgs(['--label', '../escape'], 'C:/repo'), /audio-label-invalid/);
  assert.throws(() => parseAudioQualityArgs(['--root'], 'C:/repo'), /audio-root-missing/);
  assert.throws(() => parseAudioQualityArgs(['--unknown'], 'C:/repo'), /audio-argument-invalid/);
});

test('audio quality CLI rejects unknown arguments before starting browser work', () => {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts/check-audio-quality.mjs'), '--unknown'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 15000
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /audio-argument-invalid/);
});

test('audio CLI selects the strict normal alias without a wrapper', async () => {
  const source = await fs.readFile('scripts/check-audio-quality.mjs', 'utf8');
  assert.match(source, /import \{audioQualityReportFailures as audioQualityFailures\} from '\.\/audio-metrics\.mjs';/);
  assert.match(source, /audioQualityFailures\(report\)/);
});

test('artifact description hashes every production audio entry file', async t => {
  const { AUDIO_ARTIFACT_FILES, describeAudioArtifact } = await load();
  const root = await artifactFixture(t);
  const description = await describeAudioArtifact(root, 'fixture');
  assert.equal(description.label, 'fixture');
  assert.equal(description.files.length, 5);
  assert.deepEqual(description.files.map(item => item.path), AUDIO_ARTIFACT_FILES);
  assert.ok(description.files.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
});

test('artifact comparison rejects file drift and any numeric quality failure', async t => {
  const { compareAudioArtifactReports, describeAudioArtifact } = await load();
  const source = await describeAudioArtifact(await artifactFixture(t), 'source');
  const same = await describeAudioArtifact(await artifactFixture(t), 'candidate');
  const changed = await describeAudioArtifact(await artifactFixture(t, '-changed'), 'root-dist');
  assert.deepEqual(compareAudioArtifactReports([
    { artifact: source, qualityFailures: [] },
    { artifact: same, qualityFailures: [] }
  ]), []);
  const failures = compareAudioArtifactReports([
    { artifact: source, qualityFailures: [] },
    { artifact: changed, qualityFailures: ['stress-channel-0/peak=1.1'] }
  ]);
  assert.ok(failures.includes('root-dist/quality/stress-channel-0/peak=1.1'));
  assert.ok(failures.some(value => value.startsWith('root-dist/hash/')));
});

test('artifact comparison permits floating noise but rejects meaningful numeric drift', async t => {
  const { compareAudioArtifactReports, describeAudioArtifact } = await load();
  const source = await describeAudioArtifact(await artifactFixture(t), 'source');
  const candidate = await describeAudioArtifact(await artifactFixture(t), 'candidate');
  const report = (artifact, peak) => ({
    artifact, qualityFailures: [], nodes: { sources: 1, sampleRate: 48000 },
    cases: [{ frequency: 1000, enabled: true, channels: [{ peak, rms: 0.25 }] }],
    transitions: [], alignments: [], stress: { channels: [{ peak: 0.98 }] }
  });
  assert.deepEqual(compareAudioArtifactReports([
    report(source, 0.5), report(candidate, 0.5000000001)
  ]), []);
  assert.ok(compareAudioArtifactReports([
    report(source, 0.5), report(candidate, 0.51)
  ]).includes('candidate/numeric/cases[0].channels[0].peak'));
});

test('artifact comparison excludes timing-sensitive diagnostics while retaining raw reports', async t => {
  const { compareAudioArtifactReports, describeAudioArtifact } = await load();
  const source = await describeAudioArtifact(await artifactFixture(t), 'source');
  const candidate = await describeAudioArtifact(await artifactFixture(t), 'candidate');
  const report = (artifact, mean, thdnPercent) => ({
    artifact, qualityFailures: [], nodes: { sources: 1, sampleRate: 48000 },
    cases: [{ frequency: 1000, inputAmplitude: 0.5, gain: 1, enabled: true, stereo: 'identical', bursts: false,
      channels: [{ mean, rms: 0.25, rmsDbfs: -12, peak: 0.5, thdPercent: 0.01, thdnPercent, overFullScaleSamples: 0, maxAdjacentStep: 0.1 }] }],
    transitions: [], alignments: [], stress: { channels: [{ rms: 0.4, peak: 0.98, overFullScaleSamples: 0 }] }
  });
  assert.deepEqual(compareAudioArtifactReports([
    report(source, 0.001, 0.02), report(candidate, -0.004, 0.08)
  ]), []);
});
