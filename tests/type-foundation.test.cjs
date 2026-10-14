const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const contractFiles = ['src/settings/contract.ts', 'src/settings/client.ts', 'src/settings/broker.ts'];
const generatedFiles = ['settings-contract.js', 'settings-client.js', 'settings-broker.js'];
const requiredTrue = ['noEmit', 'strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'useUnknownInCatchVariables'];

test('audio runtime contract is explicit and typechecked', async () => {
  const audio = await fs.readFile('src/main/features/audio/contracts.ts', 'utf8');
  assert.match(audio, /export type AudioState = 'off' \| 'pending' \| 'on' \| 'unavailable';/);
  for (const signature of [
    'setEnabled(video: HTMLVideoElement, enabled: boolean): Promise<AudioState>;',
    'getState(video: HTMLVideoElement): AudioState;',
    'setGain(video: HTMLVideoElement, value: number): number;',
    'configure(): void;',
    'bypass(video: HTMLVideoElement): void;',
    'subscribe(video: HTMLVideoElement, callback: (state: AudioState, gain: number) => void): () => boolean;',
    'eligible(video: HTMLVideoElement): boolean;',
  ]) assert.ok(audio.includes(signature), signature);

  const runtime = await fs.readFile('src/main/runtime/contracts.ts', 'utf8');
  assert.match(runtime, /import type \{ AudioController \} from '\.\.\/features\/audio\/contracts';/);
  assert.match(runtime, /audio\?: AudioController;/);

  const result = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('player runtime contract is explicit and typechecked', async () => {
  const player = await fs.readFile('src/main/features/player/contracts.ts', 'utf8');
  for (const signature of [
    'resolution: string | null;',
    'bitrate: string | null;',
    'latency: string | null;',
    'codec: string | null;',
    'seek(backward: boolean): boolean;',
    'liveEdge(): void;',
    'ranges(video: HTMLVideoElement): readonly [number, number][];',
    'readStats(video: HTMLVideoElement, metrics: SitePlayerMetrics | null): PlayerStats;',
  ]) assert.ok(player.includes(signature), signature);

  const runtime = await fs.readFile('src/main/runtime/contracts.ts', 'utf8');
  assert.match(runtime, /import type \{ PlayerController, VideoFilterController \} from '\.\.\/features\/player\/contracts';/);
  assert.match(runtime, /player\?: PlayerController;/);
  assert.match(runtime, /filters\?: VideoFilterController;/);

  const result = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('preview runtime contract is explicit and typechecked', async () => {
  const preview = await fs.readFile('src/main/features/preview/contracts.ts', 'utf8');
  for (const signature of [
    'diagnostics: PreviewDiagnostics;',
    'show(href: string, anchor: HTMLAnchorElement, tooltip?: boolean): Promise<void>;',
    'hide(href?: string): void;',
    'id: string;',
    'href: string;',
    'anchor: HTMLAnchorElement;',
    'route: string;',
    'live: boolean;',
    'startUnmuted: boolean;',
    'token: number;',
    'abort: AbortController;',
    'timers: Set<number>;',
    'backend: PreviewBackend | null;',
    'media: HTMLVideoElement | null;',
    'dispose(): void;',
  ]) assert.ok(preview.includes(signature), signature);

  const runtime = await fs.readFile('src/main/runtime/contracts.ts', 'utf8');
  assert.match(runtime, /import type \{ PreviewController \} from '\.\.\/features\/preview\/contracts';/);
  assert.match(runtime, /preview\?: PreviewController;/);

  const result = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('inject runtime contracts are explicit and typechecked', async () => {
  const inject = await fs.readFile('src/main/features/inject/contracts.ts', 'utf8');
  for (const signature of [
    'open(url: string, left: number, top: number, labels: PopupLabels): HTMLElement | null;',
    'retireDetached(): void;',
    'reconcile(container: Element | null, isLive: boolean, owner: ResourceScope, config: RuntimeConfig): void;',
    'reconcile(root: Element | null, state: RuntimeState, owner: ResourceScope | null, config: RuntimeConfig): void;',
    'mountOwner(state: RuntimeState, owner: ResourceScope, config: RuntimeConfig, labels: RuntimeLabels): void;',
    'reconcileChannel(state: RuntimeState, owner: ResourceScope): void;',
    'reconcileBanner(state: RuntimeState, owner: ResourceScope): void;',
    'dispose(): void;',
  ]) assert.ok(inject.includes(signature), signature);

  const coordinator = await fs.readFile('src/main/features/inject/coordinator.ts', 'utf8');
  assert.match(coordinator, /export function startCoordinator\(target: Window\): boolean/);

  const runtime = await fs.readFile('src/main/runtime/contracts.ts', 'utf8');
  assert.match(runtime, /coordinatorStarted\?: boolean;/);

  const result = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('AF05 tsconfig checks only TypeScript product sources with strict no-emit', async () => {
  const config = JSON.parse(await fs.readFile('tsconfig.json', 'utf8'));
  for (const option of requiredTrue) assert.equal(config.compilerOptions[option], true, `${option} must be true`);
  assert.equal(Object.hasOwn(config.compilerOptions, 'skipLibCheck'), false);
  assert.deepEqual(config.compilerOptions.types, ['chrome']);
  assert.equal(config.compilerOptions.allowJs, false);
  assert.equal(Object.hasOwn(config.compilerOptions, 'checkJs'), false);
  assert.deepEqual(config.include, ['src/settings/**/*.ts', 'src/main/**/*.ts', 'build-proof/**/*.ts']);
  await assert.rejects(fs.access('tsconfig.af01.json'));
  await assert.rejects(fs.access('types/knife-settings.d.ts'));
});

test('contract files contain no type-check bypass', async () => {
  for (const file of contractFiles) {
    const source = await fs.readFile(file, 'utf8');
    assert.doesNotMatch(source, /@ts-(?:ignore|nocheck)|\bany\b/, file);
    assert.doesNotMatch(source, /^\s*(?:import|export)\b/m, file);
  }
});

test('settings TypeScript and generated JavaScript use LF in Git', () => {
  const files = [...contractFiles, ...generatedFiles];
  const result = spawnSync('git', ['check-attr', 'eol', '--', ...files], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const file of files) assert.match(result.stdout, new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: eol: lf`));
});

test('the independent strict checkJs negative control fails', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cheese-type-negative-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'bad.js'), "const af01TypeError = /** @type {number} */ ('wrong');\n");
  await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    allowJs: true, checkJs: true, noEmit: true, strict: true, noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true, useUnknownInCatchVariables: true, target: 'ES2022', lib: ['ES2023', 'DOM'],
  }, include: ['bad.js'] }));
  const result = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', path.join(root, 'tsconfig.json')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'negative control must fail');
  assert.match(result.stdout + result.stderr, /TS2322|TS2352/);
});

test('AF03 typecheck passes without diagnostics', () => {
  const result = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
