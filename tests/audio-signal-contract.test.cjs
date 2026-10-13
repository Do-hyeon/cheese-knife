const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const signal = () => import('../scripts/audio-signal.mjs');

/** @returns {import('../scripts/audio-signal.mjs', {with:{'resolution-mode':'import'}}).CaptureWindow} */
const capture = () => ({ rate: 1000, start: 20, end: 28,
  channels: [[0.5, -0.5, 0.5, -0.5, 1, -1, 1, -1], Array(8).fill(0)] });

test('summary preserves a pinned left-only 8ms window', async () => {
  const { summarizeCapture } = await signal();
  const expected = JSON.parse(await fs.readFile('tests/fixtures/audio-signal-summary.json', 'utf8'));
  const result = summarizeCapture(capture());
  assert.deepEqual(result, expected);
  assert.deepEqual(Object.keys(result), ['sampleRate', 'windowSeconds', 'channels', 'channelDifferenceRms']);
  const keys = ['samples', 'mean', 'rms', 'peak', 'peakDbfs', 'rmsDbfs', 'overFullScaleSamples',
    'maxAdjacentStep', 'thdPercent', 'thdnPercent', 'fundamentalAmplitude', 'spectralReason', 'envelope8ms'];
  for (const channel of result.channels) assert.deepEqual(Object.keys(channel), keys);
});

test('frequency omission undefined and null are equivalent', async () => {
  const { summarizeCapture } = await signal();
  const data = capture();
  const omitted = summarizeCapture(data);
  assert.deepEqual(summarizeCapture(data, undefined), omitted);
  assert.deepEqual(summarizeCapture(data, null), omitted);
  for (const channel of omitted.channels) {
    assert.equal(channel.thdPercent, null); assert.equal(channel.thdnPercent, null);
    assert.equal(channel.fundamentalAmplitude, null); assert.equal(channel.spectralReason, '');
  }
});

test('spectral reasons distinguish coherent silence from a noncoherent tone', async () => {
  const { measureSignal } = await signal();
  const silence = measureSignal(Array(8).fill(0), 1000, 125);
  assert.equal(silence.spectralReason, 'tone-not-detectable');
  assert.equal(silence.thdPercent, null); assert.equal(silence.thdnPercent, null);
  assert.equal(silence.fundamentalAmplitude, null);
  const samples = Float64Array.from({ length: 4801 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000));
  const leakage = measureSignal(samples, 48000, 1000);
  assert.equal(leakage.spectralReason, 'non-coherent-window');
  assert.equal(leakage.thdPercent, null); assert.equal(leakage.thdnPercent, null);
  assert.equal(leakage.fundamentalAmplitude, null);
});

test('owned sample buffers retain numeric meaning without mutation', async () => {
  const { measureSignal } = await signal();
  for (const samples of [[0.5, -0.5], new Float32Array([0.5, -0.5]), new Float64Array([0.5, -0.5])]) {
    const result = measureSignal(samples, 1000);
    assert.equal(result.rms, 0.5); assert.equal(result.peak, 0.5);
    assert.equal(result.mean, 0); assert.equal(result.samples, 2);
    assert.deepEqual(Array.from(samples), [0.5, -0.5]);
  }
});

test('numeric boundaries retain real failure behavior', async () => {
  const { measureSignal, channelDifferenceRms, rmsEnvelope } = await signal();
  assert.throws(() => measureSignal([], 1000), { message: 'samples required' });
  for (const samples of [[0, NaN], [0, Infinity], new Array(2)]) {
    assert.throws(() => measureSignal(samples, 1000), { message: 'non-finite audio sample' });
  }
  for (const rate of [0, NaN]) assert.throws(() => measureSignal([0], rate), { message: 'invalid sample rate' });
  for (const frequency of [0, 500]) assert.throws(() => measureSignal([0], 1000, frequency), { message: 'invalid tone frequency' });
  assert.throws(() => channelDifferenceRms([0], [0, 0]), { message: 'equal nonempty channels required' });
  assert.throws(() => rmsEnvelope([0], 1000, 2), { message: 'invalid envelope window' });
});

test('NUM01 remains a separate policy without JSON coercion', async () => {
  const { rmsEnvelope } = await signal();
  for (const result of [rmsEnvelope([0.5, -0.5], NaN, 2), rmsEnvelope([0.5, -0.5], 1000, NaN)]) {
    assert.ok(Number.isNaN(result.windowSamples));
    assert.equal(result.min, Infinity); assert.equal(result.max, 0);
  }
});

/** @param {string} config @param {string[]} [args] */
function compile(config, args = []) {
  const result = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'),
    '-p', config, '--pretty', 'false', ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 1048576 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test('audio checker and CI keep strict settings and the test discovery path', async () => {
  const config = JSON.parse(await fs.readFile('tsconfig.audio-tools.json', 'utf8'));
  assert.equal(config.extends, './tsconfig.development.json');
  assert.deepEqual(config.files, ['scripts/audio-signal.mjs', 'scripts/audio-metrics.mjs', 'scripts/audio-artifact-core.mjs', 'tests/audio-signal-contract.test.cjs', 'tests/audio-quality-contract.test.cjs', 'tests/audio-artifact-contract.test.cjs']);
  assert.deepEqual(config.include, []);
  const result = compile('tsconfig.audio-tools.json', ['--showConfig']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const effective = JSON.parse(result.stdout);
  for (const option of ['allowJs', 'checkJs', 'noEmit', 'strict', 'noUncheckedIndexedAccess',
    'exactOptionalPropertyTypes', 'useUnknownInCatchVariables']) assert.equal(effective.compilerOptions[option], true, option);
  assert.notEqual(effective.compilerOptions.skipLibCheck, true);
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  assert.equal(pkg.scripts['typecheck:audio-tools'], 'tsc -p tsconfig.audio-tools.json');
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.cjs');
  const ci = await fs.readFile('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /os: \[windows-latest, ubuntu-latest\]/);
  assert.match(ci, /npm run check:build-proof && npm run typecheck:audio-tools(?:\r?\n|$)/);
});

test('strict audio checker has no diagnostics and contains only the bounded repository graph', () => {
  const checked = compile('tsconfig.audio-tools.json');
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.equal(checked.stdout + checked.stderr, '');
  const listed = compile('tsconfig.audio-tools.json', ['--listFilesOnly']);
  assert.equal(listed.status, 0, listed.stdout + listed.stderr);
  const files = listed.stdout.trim().split(/\r?\n/).map(file => path.relative(process.cwd(), file).split(path.sep).join('/'))
    .filter(file => !file.startsWith('../') && !path.isAbsolute(file) && !file.startsWith('node_modules/'));
  assert.deepEqual(files.sort(), ['scripts/audio-artifact-core.mjs', 'scripts/audio-metrics.mjs', 'scripts/audio-signal.mjs', 'tests/audio-artifact-contract.test.cjs', 'tests/audio-quality-contract.test.cjs', 'tests/audio-signal-contract.test.cjs']);
});

for (const proof of [
  { name: 'valid buffers tuple optional frequency and narrowed spectral value', diagnostic: '', code:
    'const samples: readonly number[] = [0.5, -0.5]; measureSignal(samples,1000); measureSignal(new Float32Array(samples),1000); measureSignal(new Float64Array(samples),1000); const data = {rate:1000,start:0,end:8,channels:[samples,samples] as const}; summarizeCapture(data); summarizeCapture(data,undefined); summarizeCapture(data,null); const value = measureSignal(samples,1000,125).thdPercent; if (value !== null) value * 2;' },
  { name: 'non-numeric samples', diagnostic: 'TS2322|TS2345', code: "measureSignal(['wrong'],48000);" },
  { name: 'non-numeric sample rate', diagnostic: 'TS2345', code: "measureSignal([0],'48000');" },
  { name: 'missing capture channel', diagnostic: 'TS2322|TS2345', code: 'summarizeCapture({rate:1000,start:0,end:8,channels:[[0]]});' },
  { name: 'extra capture channel', diagnostic: 'TS2322|TS2345', code: 'summarizeCapture({rate:1000,start:0,end:8,channels:[[0],[0],[0]]});' },
  { name: 'missing summary field', diagnostic: 'TS2339', code: 'summarizeCapture({rate:1000,start:0,end:8,channels:[[0],[0]]}).nonexistentField;' },
  { name: 'nullable spectral arithmetic', diagnostic: 'TS2531|TS18047', code: 'summarizeCapture({rate:1000,start:0,end:8,channels:[[0],[0]]}).channels[0].thdPercent * 2;' },
]) test('audio compiler proof: ' + proof.name, async t => {
  await fs.mkdir('output', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('output/audio-types-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'proof.mts');
  await fs.writeFile(file, `import {measureSignal,summarizeCapture} from '../../scripts/audio-signal.mjs';\n${proof.code}\n`);
  const config = path.join(directory, 'tsconfig.json');
  await fs.writeFile(config, JSON.stringify({ extends: path.resolve('tsconfig.audio-tools.json'), files: [file], include: [] }));
  const result = compile(config);
  const diagnostics = result.stdout + result.stderr;
  if (!proof.diagnostic) {
    assert.equal(result.status, 0, diagnostics);
    assert.equal(diagnostics, '');
  } else {
    assert.ok(result.status !== null && result.status > 0, diagnostics);
    assert.equal(result.stderr, '');
    const lines = diagnostics.trim().split(/\r?\n/);
    const proofPath = path.relative(process.cwd(), file).split(path.sep).join('/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const heading = new RegExp(`^${proofPath}\\(2,\\d+\\): error (?:${proof.diagnostic}):`);
    assert.match(lines.at(0) || '', heading, diagnostics);
    for (const line of lines) {
      if (/^ {2,}\S/.test(line)) assert.doesNotMatch(line, /\berror TS\d+:/, diagnostics);
      else assert.match(line, heading, diagnostics);
    }
  }
});
