import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { openOwnedRoot } from './owned-files.mjs';
import { NATIVE_STAGES, NATIVE_CONTEXTS, NATIVE_CODES } from './extension-e2e/native-preflight-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = ['scripts/check-native-preflight.mjs','scripts/extension-e2e/native-preflight.mjs','scripts/extension-e2e/native-preflight-contract.mjs','scripts/extension-e2e/published-payload.mjs',
  'scripts/extension-e2e/transition-scenario.mjs','scripts/extension-e2e/fixture-router.mjs','scripts/owned-files.mjs','tests/fixtures/installed-extension/published-payload.json'];
const fail = code => Object.assign(new Error(code), { code });
const need = (value, code = 'native-evidence-invalid') => { if (!value) throw fail(code); };
const hash = value => createHash('sha256').update(value).digest('hex');
const eventName = name => ['profile-context','seed-start','abort','finalize'].includes(name) ||
  NATIVE_STAGES.some(stage => NATIVE_CONTEXTS.some(context => name === `probe:${stage}:${context}`));
function parse(args) {
  need(Array.isArray(args) && args.length <= 5); const parsed = new Map();
  for (const value of args) {
    need(typeof value === 'string' && value.length <= 128);
    const parts = value.split('='), name = parts[0];
    need(parts.length <= 2 && ['--prepare','--check','--inspect-native','--record','--run-id','--status','--code'].includes(name) && !parsed.has(name));
    parsed.set(name, parts[1] ?? true);
  }
  const actions = ['--prepare','--check','--inspect-native','--record'].filter(k => parsed.has(k));
  need(actions.length === 1 && typeof parsed.get('--run-id') === 'string' && /^[A-Za-z0-9]{1,64}$/.test(parsed.get('--run-id')));
  const action = actions[0], value = parsed.get(action);
  need(action === '--prepare' ? value === true : action === '--check' ? ['baseline','seeded','complete'].includes(value) :
    action === '--inspect-native' ? ['before','closed','restarted','after'].includes(value) : eventName(value));
  if (action === '--record') {
    need(['requested','confirmed','failed','unknown'].includes(parsed.get('--status')));
    need(['failed','unknown'].includes(parsed.get('--status')) ? NATIVE_CODES.includes(parsed.get('--code')) : !parsed.has('--code'));
  } else need(!parsed.has('--status') && !parsed.has('--code'));
  return { action, value, runId: parsed.get('--run-id'), status: parsed.get('--status'), code: parsed.get('--code') || null };
}
const workflow = () => {
  const result = [['inspection:before','confirmed'],['profile-context','confirmed']];
  for (const stage of NATIVE_STAGES) {
    if (stage === 'seeded') result.push(['check:baseline','confirmed'],['seed-start','confirmed']);
    if (stage === 'cold') result.push(['check:seeded','confirmed'],['inspection:closed','confirmed'],['inspection:restarted','confirmed']);
    for (const context of NATIVE_CONTEXTS) result.push([`probe:${stage}:${context}`,'requested'],[`probe:${stage}:${context}`,'confirmed']);
  }
  return [...result,['inspection:after','confirmed'],['finalize','confirmed'],['check:complete','confirmed']];
};
async function boundedRead(files, name) {
  need((await files.lstat(name)).size <= 1048576);
  const bytes = await files.readFile(name); need(bytes.length <= 1048576); return bytes;
}
async function json(files, name) {
  try { return JSON.parse(await boundedRead(files, name)); }
  catch (e) { if (e.code === 'native-evidence-invalid') throw e; throw fail('native-evidence-invalid'); }
}
async function sourceSnapshot(repository) {
  return { node: process.version, files: await Promise.all(sourceFiles.map(async name => [name, hash(await repository.readFile(name))])) };
}
async function artifactSize(files, folder = '') {
  let total = 0;
  for (const name of await files.readdir(folder)) {
    const relative = folder ? `${folder}/${name}` : name, stat = await files.lstat(relative);
    if (stat.isDirectory()) total += await artifactSize(files, relative);
    else { need(stat.isFile() && stat.size <= 1048576); total += stat.size; }
    need(total <= 16777216);
  }
  return total;
}
async function journal(files) {
  const names = (await files.readdir('events')).sort(); need(names.length <= 64);
  const result = [];
  for (const [index, name] of names.entries()) {
    need(name === `${String(index + 1).padStart(3,'0')}.json`, 'native-sequence-invalid');
    result.push(await json(files, `events/${name}`));
  }
  return result;
}
async function append(files, manifest, event, status, code, now) {
  const events = await journal(files); need(events.length < 64, 'native-sequence-invalid');
  const value = { schema: 1, runNonce: manifest.runNonce, ordinal: events.length + 1, event, recordedAt: now(), status, code };
  need(Number.isSafeInteger(value.recordedAt) && value.recordedAt > 0 && value.recordedAt >= (events.at(-1)?.recordedAt || 0), 'native-sequence-invalid');
  await files.writeFile(`events/${String(value.ordinal).padStart(3,'0')}.json`, JSON.stringify(value), { flag: 'wx' });
}
function next(events, event, status) {
  const sequence = workflow();
  need(events.length < sequence.length, 'native-sequence-invalid');
  for (const [index, e] of events.entries()) need(e.event === sequence.at(index)[0] && e.status === sequence.at(index)[1] && e.code === null && e.ordinal === index + 1, 'native-sequence-invalid');
  need(sequence.at(events.length)[0] === event && sequence.at(events.length)[1] === status, 'native-sequence-invalid');
}
async function verifyInputs(files, repository, manifest, baseline, now, zipHash, createProbe) {
  need(manifest.schema === 1 && /^[a-f0-9]{32}$/.test(manifest.runNonce) && Number.isSafeInteger(manifest.createdAt) && manifest.createdAt > 0 && manifest.createdAt <= now());
  need(manifest.zipSha256 === zipHash);
  need(isDeepStrictEqual(manifest.source, await sourceSnapshot(repository)), 'native-source-changed');
  for (const stage of NATIVE_STAGES) for (const context of NATIVE_CONTEXTS) {
    const expected = createProbe({ runNonce: manifest.runNonce, stage, context, baseline });
    need(hash(await boundedRead(files, `probes/${stage}-${context}.js`)) === hash(expected), 'native-source-changed');
  }
  await artifactSize(files);
}

async function beginAttempt(files, manifest, event, status) {
  const names = new Set(await files.readdir('attempts')); need(names.size < 128, 'native-sequence-invalid');
  let ordinal = 1;
  while (names.size) {
    const stem = String(ordinal).padStart(3,'0'), intentName = `${stem}.json`, resultName = `${stem}-result.json`;
    need(names.has(intentName) && names.has(resultName), 'native-sequence-invalid');
    const intent = await json(files, `attempts/${intentName}`), result = await json(files, `attempts/${resultName}`);
    need(intent.schema === 1 && intent.runNonce === manifest.runNonce && intent.ordinal === ordinal &&
      result.schema === 1 && result.runNonce === manifest.runNonce && result.ordinal === ordinal && result.outcome === 'completed' && result.code === null, 'native-sequence-invalid');
    names.delete(intentName); names.delete(resultName); ordinal++;
  }
  const intent = { schema: 1, runNonce: manifest.runNonce, ordinal, event, status };
  await files.writeFile(`attempts/${String(ordinal).padStart(3,'0')}.json`, JSON.stringify(intent), { flag: 'wx' });
  return intent;
}
async function finishAttempt(files, attempt, outcome, code) {
  await files.writeFile(`attempts/${String(attempt.ordinal).padStart(3,'0')}-result.json`,
    JSON.stringify({ schema: 1, runNonce: attempt.runNonce, ordinal: attempt.ordinal, outcome, code }), { flag: 'wx' });
}

/** Local artifact IO only. Native access has no default implementation in Task1. */
export async function executeNativePreflight(args, dependencies = {}) {
  const options = parse(args), now = dependencies.now || Date.now;
  const repository = dependencies.repository || await openOwnedRoot(root);
  const relative = `output/native-preflight-${options.runId}`;
  let files, manifest, attempt;
  const event = options.action === '--record' ? options.value : options.action === '--check' ? `check:${options.value}` : `inspection:${options.value}`;
  const done = async summary => { if (attempt) await finishAttempt(files, attempt, 'completed', null); return summary; };
  try {
    if (options.action === '--prepare') need(!(await repository.lstat(relative, { optional: true })));
    else {
      files = await (dependencies.openRun || openOwnedRoot)(await repository.resolve(relative, { type: 'directory' }));
      manifest = await json(files, 'manifest.json'); need(manifest.runId === options.runId && /^[a-f0-9]{32}$/.test(manifest.runNonce));
      // An unresolved intent blocks retries even if all subsequent journal writes fail.
      attempt = await beginAttempt(files, manifest, event, options.status || 'confirmed');
    }
    const { readPublishedPayload, PUBLISHED_PAYLOAD_BASELINE } = await import('./extension-e2e/published-payload.mjs');
    const { nativePreflightBaseline, createNativePreflightProbe, assertNativePreflight } = await import('./extension-e2e/native-preflight.mjs');
    const baseline = nativePreflightBaseline(await (dependencies.readPayload || readPublishedPayload)());
    const verify = () => verifyInputs(files, repository, manifest, baseline, now, PUBLISHED_PAYLOAD_BASELINE.sha256, createNativePreflightProbe);
    if (options.action === '--prepare') {
      const source = await sourceSnapshot(repository);
      await repository.ensureDirectory('output'); await repository.ensureDirectory(relative);
      files = await openOwnedRoot(await repository.resolve(relative, { type: 'directory' }));
      manifest = { schema: 1, runId: options.runId, runNonce: randomBytes(16).toString('hex'), createdAt: now(), zipSha256: PUBLISHED_PAYLOAD_BASELINE.sha256, source };
      await files.writeFile('manifest.json', JSON.stringify(manifest), { flag: 'wx' });
      for (const folder of ['probes','observations','native','events','attempts']) await files.ensureDirectory(folder);
      for (const stage of NATIVE_STAGES) for (const context of NATIVE_CONTEXTS) {
        await files.writeFile(`probes/${stage}-${context}.js`, createNativePreflightProbe({ runNonce: manifest.runNonce, stage, context, baseline }), { flag: 'wx' });
      }
      await verify();
      return { ok: true, status: 'PREPARED', complete: false, runNonce: manifest.runNonce };
    }
    await verify();
    const events = await journal(files);
    if (options.action === '--record') {
      if (['requested','confirmed'].includes(options.status)) next(events, event, options.status);
      else need(['failed','unknown'].includes(options.status));
      if (event.startsWith('probe:') && options.status === 'confirmed') {
        const [,stage,context] = event.split(':'), value = await json(files, `observations/${stage}-${context}.json`);
        need(value.schema === 1 && value.runNonce === manifest.runNonce && value.stage === stage && value.context === context && value.outcome === 'observed' && value.code === null);
      }
      await append(files, manifest, event, options.status, options.code, now);
      return await done({ ok: true, status: 'RECORDED', complete: false });
    }
    next(events, event, 'confirmed');
    if (options.action === '--inspect-native') {
      if (!dependencies.inspectNative) throw fail('native-unavailable');
      const facts = await dependencies.inspectNative(options.value, manifest.runNonce);
      need(facts?.schema === 1 && facts.runNonce === manifest.runNonce && facts.phase === options.value);
      const serialized = JSON.stringify(facts), bytes = Buffer.byteLength(serialized);
      // Reserve 4 KiB for fixed journal and attempt-result records before publishing facts.
      need(bytes <= 1048576 && await artifactSize(files) + bytes + 4096 <= 16777216);
      await files.writeFile(`native/${options.value}.json`, serialized, { flag: 'wx' });
      await append(files, manifest, event, 'confirmed', null, now);
      return await done({ ok: true, status: 'FACTS-RECORDED', complete: false });
    }
    const observations = [];
    const stages = options.value === 'baseline' ? NATIVE_STAGES.slice(0,1) : options.value === 'seeded' ? NATIVE_STAGES.slice(0,2) : NATIVE_STAGES;
    const expectedNames = stages.flatMap(stage => NATIVE_CONTEXTS.map(context => `${stage}-${context}.json`));
    need(isDeepStrictEqual((await files.readdir('observations')).sort(), [...expectedNames].sort()));
    for (const name of expectedNames) observations.push(await json(files, `observations/${name}`));
    const phases = options.value === 'complete' ? ['before','closed','restarted','after'] : ['before'];
    need(isDeepStrictEqual((await files.readdir('native')).sort(), phases.map(phase => `${phase}.json`).sort()));
    const nativeFacts = await Promise.all(phases.map(phase => json(files, `native/${phase}.json`)));
    need(events[0]?.recordedAt >= manifest.createdAt, 'native-sequence-invalid');
    const accepted = assertNativePreflight({ observations, events, nativeFacts }, baseline, options.value);
    await verify();
    await append(files, manifest, event, 'confirmed', null, now);
    return await done({ ok: true, ...accepted });
  } catch (error) {
    const code = NATIVE_CODES.includes(error?.code) ? error.code : 'native-owned-io-failed';
    const secondaryCodes = [];
    if (files && manifest && options.action !== '--prepare') {
      try { await append(files, manifest, event, 'failed', code, now); }
      catch { secondaryCodes.push('native-owned-io-failed'); }
    }
    if (attempt) {
      try { await finishAttempt(files, attempt, 'failed', code); }
      catch { if (!secondaryCodes.length) secondaryCodes.push('native-owned-io-failed'); }
    }
    throw Object.assign(fail(code), { secondaryCodes });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executeNativePreflight(process.argv.slice(2)).then(summary => console.log(JSON.stringify(summary)), error => {
    console.error(JSON.stringify({ ok: false, code: NATIVE_CODES.includes(error.code) ? error.code : 'native-owned-io-failed', secondaryCodes: error.secondaryCodes || [] }));
    process.exitCode = 1;
  });
}
