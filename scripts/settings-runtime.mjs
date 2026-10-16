import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import {
  CLASSIC_RUNTIME_OPTIONS, checkGeneratedRuntime, generatedFailure, validateClassicRuntime, writeGeneratedRuntime,
} from './generated-runtime.mjs';
import { openOwnedRoot } from './owned-files.mjs';

export const SETTINGS_RUNTIME_ENTRIES = Object.freeze([
  Object.freeze({ source: 'src/settings/media-profiles.ts', output: 'media-profiles.js', global: 'KnifeMediaProfiles' }),
  Object.freeze({ source: 'src/settings/gain-authority.ts', output: 'gain-authority.js', global: 'createPlayerGainAuthority' }),
  Object.freeze({ source: 'src/settings/player-gain.ts', output: 'web/player-gain.js', global: null }),
  Object.freeze({ source: 'src/settings/config.ts', output: 'config.js', global: 'KnifeHostPolicy' }),
  Object.freeze({ source: 'src/settings/style-schema.ts', output: 'style-schema.js', global: 'STYLES' }),
  Object.freeze({ source: 'src/settings/contract.ts', output: 'settings-contract.js', global: 'KnifeSettingsContract' }),
  Object.freeze({ source: 'src/settings/client.ts', output: 'settings-client.js', global: 'createSettingsClient' }),
  Object.freeze({ source: 'src/settings/audio-settings-ui.ts', output: 'audio-settings-ui.js', global: 'createAudioSettingsUI' }),
  Object.freeze({ source: 'src/settings/broker.ts', output: 'settings-broker.js', global: 'createSettingsBroker' }),
  Object.freeze({ source: 'src/settings/background.ts', output: 'background.js', global: null }),
  Object.freeze({ source: 'src/settings/permission.ts', output: 'permission.js', global: null }),
  Object.freeze({ source: 'src/settings/popup.ts', output: 'popup.js', global: null }),
  Object.freeze({ source: 'src/settings/styles.ts', output: 'styles.js', global: null }),
  Object.freeze({ source: 'src/settings/bridge.ts', output: 'web/main.js', global: 'initStyleParameters' }),
]);
export const SETTINGS_RUNTIME_OPTIONS = Object.freeze({
  loader: 'ts', target: CLASSIC_RUNTIME_OPTIONS.target, minify: CLASSIC_RUNTIME_OPTIONS.minify,
  sourcemap: CLASSIC_RUNTIME_OPTIONS.sourcemap, legalComments: CLASSIC_RUNTIME_OPTIONS.legalComments,
});

const fail = generatedFailure;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const repositoryRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedCodes = Object.freeze({
  outputSet: 'settings-runtime-output-set', syntax: 'settings-runtime-source-module',
  sourceMap: 'settings-runtime-source-map', forbidden: 'settings-runtime-source-module',
  nondeterministic: 'settings-runtime-nondeterministic', drift: 'settings-runtime-drift',
  writeCi: 'settings-runtime-write-ci',
});
const hasExpectedGlobal = (entry, source) => entry.global
  ? source.match(/^(?:var|const|let)\s+([A-Za-z_$][\w$]*)\b/)?.[1] === entry.global
  : /^\(\(\) => \{/.test(source);

export async function renderSettingsRuntime(root = repositoryRoot()) {
  const owned = await openOwnedRoot(root);
  const outputs = {};
  for (const entry of SETTINGS_RUNTIME_ENTRIES) {
    const source = await owned.readFile(entry.source, 'utf8');
    if (/^\s*(?:import(?:\s|["'{*])|export(?:\s|[({*]|default\b))/m.test(source)) throw fail('settings-runtime-source-module');
    const result = await transform(source, SETTINGS_RUNTIME_OPTIONS);
    outputs[entry.output] = `// Generated from ${entry.source} by scripts/settings-runtime.mjs. Do not edit.\n${result.code}`;
  }
  validateSettingsRuntime(outputs);
  return outputs;
}

export function validateSettingsRuntime(outputs, identities = []) {
  const names = Object.keys(outputs).sort();
  const expected = SETTINGS_RUNTIME_ENTRIES.map(entry => entry.output).sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw fail('settings-runtime-output-set');
  for (const entry of SETTINGS_RUNTIME_ENTRIES) {
    const source = outputs[entry.output];
    if (typeof source !== 'string') throw fail('settings-runtime-global');
    const marker = `// Generated from ${entry.source} by scripts/settings-runtime.mjs. Do not edit.\n`;
    const body = source.startsWith(marker) ? source.slice(marker.length) : source;
    if (!hasExpectedGlobal(entry, body)) throw fail('settings-runtime-global');
    let inspected = source.replace(/(\.origin\s*!==\s*)(["'])https:\/\/chzzk\.naver\.com\2/g, '$1$2$2');
    if (entry.output === 'config.js') inspected = inspected.replace(/(origins: Object\.freeze\(\[)["']https:\/\/chzzk\.naver\.com\/\*["'](\]\))/, '$1""$2');
    if (entry.output === 'web/main.js' || entry.output === 'audio-settings-ui.js') inspected = inspected.replace(/(\b(?:document|doc)\.createElementNS\()["']http:\/\/www\.w3\.org\/2000\/svg["']/g, '$1""');
    validateClassicRuntime(inspected, identities, generatedCodes);
  }
}

function report(outputs) {
  const files = SETTINGS_RUNTIME_ENTRIES.map(entry => entry.output);
  const hashes = Object.fromEntries(Object.entries(outputs).map(([file, source]) => [file, sha256(source)]));
  return { files, hashes };
}

export async function checkSettingsRuntime(root = repositoryRoot()) {
  return report(await checkGeneratedRuntime(root, SETTINGS_RUNTIME_ENTRIES, renderSettingsRuntime, generatedCodes));
}

export async function writeSettingsRuntime(root = repositoryRoot()) {
  return report(await writeGeneratedRuntime(root, SETTINGS_RUNTIME_ENTRIES, renderSettingsRuntime, generatedCodes));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--write')) throw new Error('Unknown settings runtime option');
  const result = args[0] === '--write' ? await writeSettingsRuntime() : await checkSettingsRuntime();
  console.log(`Settings runtime OK: ${result.files.length} files`);
}
