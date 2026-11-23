const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { settingsHarness, config, style, parameter, getURL, extensionId } = require('./settings-fixture.cjs');
const published = import('../scripts/published-settings-baseline.mjs').then(m => ({ generation: 'published', sources: m.readPublishedWorkerSources() }));
const files = ['media-profiles.js', 'config.js', 'style-schema.js', 'settings-contract.js', 'settings-broker.js'];
const current = Object.freeze({ generation: 'f00', sources: Object.freeze(Object.fromEntries(files.map(file => [file, fs.readFileSync(file, 'utf8')])) ) });
const plain = value => JSON.parse(JSON.stringify(value));
const count = (h, kind) => h.calls.filter(call => call.kind === kind).length;
function assertWorker(h, sources) {
  const source = sources.sources['settings-broker.js'];
  const marker = 'var createSettingsBroker = ', index = source.indexOf(marker);
  assert.notEqual(index, -1);
  assert.equal(h.worker.window.createSettingsBroker.toString(), source.slice(index + marker.length).trim().replace(/;$/, ''));
}

test('old new old keeps the same raw storage and registration identities', async t => {
  const old = await published;
  const initial = { config: { futureFlag: 'keep', brightness: 1.225 },
    styles: ['left-chat', 'future-style'], styleParameters: { future: 9 }, settingsRevision: 4,
    futureTop: { untouched: true } };
  const h = settingsHarness(t, initial, old), saved = h.saved, registrations = h.registrations;
  assertWorker(h, old);
  await h.initialize(); await h.patch('popup', [config('arrowSeek', false)]); await h.settle();
  assert.equal(h.saved.settingsRevision, 5);
  h.restartBroker(current); assertWorker(h, current); await h.initialize();
  assert.strictEqual(h.saved, saved); assert.strictEqual(h.registrations, registrations);
  await h.patch('styles', [parameter('chat-font-size', 8)]); await h.settle();
  assert.equal(h.saved.settingsRevision, 6);
  assert.deepEqual(h.registrations.get('styles').css, ['styles/chat-font-size.css', 'styles/left-chat.css']);
  h.restartBroker(old); assertWorker(h, old); await h.initialize();
  await h.patch('styles', [parameter('chat-font-size', 0)]); await h.settle();
  assert.deepEqual(h.saved, { ...initial, config: { ...initial.config, arrowSeek: false },
    styleParameters: { future: 9, 'chat-font-size': 0 }, settingsRevision: 7 });
  assert.strictEqual(h.saved, saved); assert.strictEqual(h.registrations, registrations);
  assert.deepEqual(h.registrations.get('styles').css, ['styles/left-chat.css']);
  assert.equal(h.changes.listeners.size, 1);
  assert.deepEqual(initial.config, { futureFlag: 'keep', brightness: 1.225 });
});

test('versioned switch refuses incomplete input without retiring current worker', async t => {
  const h = settingsHarness(t, {}, await published); await h.initialize(); await h.settle();
  const worker = h.worker, missing = { ...current.sources }; delete missing['config.js'];
  for (const input of [{ ...current, sources: missing }, { ...current, extra: 'x' },
    { ...current, sources: { ...current.sources, 'config.js': '' } }, Object.create(current), null]) {
    assert.throws(() => h.restartBroker(input)); assert.strictEqual(h.worker, worker);
  }
  assert.equal((await h.patch('popup', [config('arrowSeek', false)])).stored, true);
});

for (const kind of ['commit', 'write-result', 'response', 'css-register', 'event']) {
  test('versioned switch rejects in-flight ' + kind, async t => {
    const h = settingsHarness(t, {}, await published); await h.initialize(); await h.settle();
    const worker = h.worker, gate = h.holdNext(kind);
    const request = h.patch('styles', [style('left-chat', true)]); await gate.reached;
    await h.settle();
    assert.throws(() => h.restartBroker(current), { code: 'fixture-worker-busy' });
    assert.strictEqual(h.worker, worker);
    gate.release(); await request; await h.settle();
    h.restartBroker(current); await h.initialize(); await h.settle();
    assert.deepEqual(h.saved.styles, ['left-chat']);
  });
}

test('versioned switch rejects queued invalidation before any boundary', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] }, await published);
  await h.initialize(); await h.settle();
  const retiredApi = h.worker.window.chrome; let retired = false, retiredCalls = 0;
  for (const object of [retiredApi.storage.local, retiredApi.scripting, retiredApi.tabs, retiredApi.permissions]) {
    for (const [key, fn] of Object.entries(object)) if (typeof fn === 'function') {
      object[key] = function (...args) { if (retired) retiredCalls++; return fn.apply(this, args); };
    }
  }
  const before = h.calls.length;
  h.invalidate({ retry: true }); assert.equal(h.calls.length, before);
  assert.throws(() => h.restartBroker(current), { code: 'fixture-worker-busy' });
  await h.settle(); h.restartBroker(current); retired = true;
  await h.initialize(); await h.settle();
  assert.equal(retiredCalls, 0); assert.equal(h.changes.listeners.size, 1);
});

test('versioned zero-argument restart keeps the selected generation', async t => {
  const old = await published, h = settingsHarness(t, {}, old);
  await h.initialize(); await h.settle(); h.restartBroker(); assertWorker(h, old);
  await h.initialize(); await h.settle(); h.restartBroker(current);
  await h.initialize(); await h.settle(); h.restartBroker(); assertWorker(h, current);
});

function schema(h) {
  const fields = h.worker.window.CONFIGS.flatMap(g => g.configs.flatMap(f => f.configs || [f]));
  return plain({ config: fields.map(f => ({ id: f.id, type: f.type || 'boolean', defaultValue: f.defaultValue,
    ...(f.type === 'range' ? { min: f.min, max: f.max, step: f.step } : {}) })), styles: h.worker.window.STYLES });
}
function assertSchema(actual, expected) { assert.deepEqual(actual, expected); }
function assertSeededConfig(h) {
  assert.equal(h.saved.config.arrowSeek, false, 'arrowSeek lost');
  assert.equal(h.saved.config.futureFlag, 'keep', 'futureFlag lost');
}

test('all published field descriptors and bounds are fixed', async t => {
  const oldHarness = settingsHarness(t, {}, await published), newHarness = settingsHarness(t, {}, current);
  const expected = schema(oldHarness);
  assert.equal(expected.config.length, 25); assert.equal(expected.styles.length, 7);
  assert.equal(createHash('sha256').update(JSON.stringify(expected)).digest('hex'),
    'b5b80219c2554520640d060c73e1d9de4ce7670637fe22d9338c58d8528ca823');
  assertSchema(schema(newHarness), expected);
  for (const h of [oldHarness, newHarness]) {
    await h.initialize(); const { snapshot } = await h.snapshot(), api = h.worker.window.KnifeSettingsContract;
    for (const field of expected.config) {
      assert.equal(snapshot.config[field.id], field.defaultValue, field.id);
      const good = field.type === 'range' ? [field.min, field.max, field.defaultValue] : [false, true];
      const bad = field.type === 'range' ? [field.min - 1, field.max + 1, NaN, Infinity, '0', null, false] : [0, 1, 'true', null];
      for (const value of good) assert.equal(api.validateOperations([config(field.id, value)]).ok, true, field.id);
      for (const value of bad) assert.equal(api.validateOperations([config(field.id, value)]).ok, false, field.id);
    }
    for (const field of expected.styles.flatMap(group => group.styles)) {
      if (field.type === 'range') {
        for (const value of [field.min, field.max, 0, 2.5]) assert.equal(api.validateOperations([parameter(field.id, value)]).ok, true);
        for (const value of [field.min - 1, field.max + 1, NaN, Infinity, '0', null]) assert.equal(api.validateOperations([parameter(field.id, value)]).ok, false);
        for (const value of [true, false]) assert.equal(api.validateOperations([style(field.id, value)]).ok, false);
      } else {
        for (const value of [true, false]) assert.equal(api.validateOperations([style(field.id, value)]).ok, true);
        for (const value of [0, 1, 'true', null]) assert.equal(api.validateOperations([style(field.id, value)]).ok, false);
      }
    }
    assert.equal(api.validateOperations([config('brightness', 1.225)]).ok, true);
    assert.equal(api.validateOperations(Array.from({ length: 64 }, () => config('arrowSeek', false))).ok, true);
    assert.equal(api.validateOperations(Array.from({ length: 65 }, () => config('arrowSeek', false))).ok, false);
    for (const id of ['future', '__proto__', 'constructor', 'prototype']) {
      for (const op of [config(id, true), style(id, true), parameter(id, 1)]) assert.equal(api.validateOperations([op]).ok, false);
    }
    assert.equal(api.validateOperations([{ ...config('arrowSeek', false), extra: 1 }]).ok, false);
  }
});

for (const generation of ['published', 'current']) {
  const sources = async () => generation === 'published' ? await published : current;
  test(generation + ': defaults and unknown storage remain separate', async t => {
    const empty = settingsHarness(t, {}, await sources()); await empty.initialize();
    const defaults = (await empty.snapshot()).snapshot;
    assert.equal(defaults.config.arrowSeek, true); assert.equal(defaults.config.previewWidth, 400);
    assert.equal(defaults.config.previewVolume, 5); assert.equal(defaults.revision, 0);
    assert.equal(count(empty, 'commit'), 0); assert.equal(count(empty, 'remove'), 0);
    const seed = { config: { preview: false, compressorAttack: 0, secret: 'keep' },
      styles: ['future-style', 'left-chat', 'chat-font-size'], styleParameters: { 'chat-font-size': 8, secret: 'keep' },
      settingsRevision: 2, futureTop: { keep: true } };
    const h = settingsHarness(t, seed, await sources()); await h.initialize();
    const snapshot = (await h.snapshot()).snapshot;
    assert.deepEqual(h.saved, seed); assert.equal(snapshot.config.preview, false); assert.equal(snapshot.config.compressorAttack, 0);
    assert.equal(Object.hasOwn(snapshot.config, 'secret'), false); assert.equal(snapshot.styles.includes('future-style'), false);
    assert.deepEqual(plain(snapshot.styleParameters), { 'chat-font-size': 8 });
    assert.deepEqual(h.registrations.get('styles').css, ['styles/chat-font-size.css', 'styles/left-chat.css']);
  });

  test(generation + ': fractional field patch and no-op preserve the rest', async t => {
    const h = settingsHarness(t, { config: { futureFlag: 'keep', brightness: 1.225 }, settingsRevision: 4 }, await sources());
    await h.initialize(); await h.patch('popup', [config('arrowSeek', false)]);
    assert.deepEqual(h.saved, { config: { futureFlag: 'keep', brightness: 1.225, arrowSeek: false }, settingsRevision: 5 });
    const before = count(h, 'commit'); await h.patch('popup', [config('arrowSeek', false)]);
    assert.equal(count(h, 'commit'), before); assert.equal(h.saved.settingsRevision, 5);
  });

  test(generation + ': parameter zero removes membership not the raw value', async t => {
    const h = settingsHarness(t, { styles: ['left-chat', 'future-style'], styleParameters: { future: 9 }, settingsRevision: 4 }, await sources());
    await h.initialize(); await h.patch('styles', [parameter('chat-font-size', 8)]);
    assert.deepEqual(h.saved, { styles: ['left-chat', 'future-style', 'chat-font-size'], styleParameters: { future: 9, 'chat-font-size': 8 }, settingsRevision: 5 });
    await h.patch('styles', [parameter('chat-font-size', 0)]);
    assert.deepEqual(h.saved, { styles: ['left-chat', 'future-style'], styleParameters: { future: 9, 'chat-font-size': 0 }, settingsRevision: 6 });
  });

  for (const legacy of [true, 1, 'yes']) test(generation + ': legacy resize truthiness ' + String(legacy), async t => {
    const h = settingsHarness(t, { config: { resizeChat: legacy }, styles: [], t: 0 }, await sources());
    await h.initialize(); await h.settle();
    assert.deepEqual(h.saved, { config: { sharpness: 0 }, styles: ['chat-resize'], settingsRevision: 1 });
    assert.ok(h.calls.findIndex(c => c.kind === 'commit') < h.calls.findIndex(c => c.kind === 'remove'));
    const writes = count(h, 'commit'), removes = count(h, 'remove');
    h.restartBroker(); await h.initialize(); await h.settle();
    assert.equal(count(h, 'commit'), writes); assert.equal(count(h, 'remove'), removes);
  });
  for (const legacy of [null, 'invalid']) test(generation + ': cleanup-only t=' + String(legacy), async t => {
    const h = settingsHarness(t, { config: { resizeChat: false }, t: legacy }, await sources());
    await h.initialize(); await h.settle();
    assert.deepEqual(h.saved, { config: { resizeChat: false } });
    assert.equal(count(h, 'commit'), 0); assert.equal(count(h, 'remove'), 1);
    h.restartBroker(); await h.initialize(); assert.equal(count(h, 'remove'), 1);
  });

  for (const revision of [null, -1, 1.5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    test(generation + ': corrupt revision never resets ' + String(revision), async t => {
      const seed = { config: { futureFlag: 'keep' }, settingsRevision: revision, untouched: true };
      const h = settingsHarness(t, seed, await sources());
      await assert.rejects(h.initialize(), { code: revision === Number.MAX_SAFE_INTEGER ? 'revision-exhausted' : 'revision-invalid' });
      assert.equal((await h.patch('popup', [config('arrowSeek', false)])).stage, 'initialization');
      assert.deepEqual(h.saved, seed); assert.equal(count(h, 'commit'), 0); assert.equal(count(h, 'remove'), 0);
    });
  }

  test(generation + ': malformed non-legacy values normalize without rewriting raw', async t => {
    const seed = { config: { arrowSeek: 'no', previewVolume: 101, secret: 'keep' }, styles: 'invalid', styleParameters: null, settingsRevision: 3 };
    const h = settingsHarness(t, seed, await sources()); await h.initialize();
    const snapshot = (await h.snapshot()).snapshot;
    assert.equal(snapshot.config.arrowSeek, true); assert.equal(snapshot.config.previewVolume, 5);
    assert.deepEqual(plain(snapshot.styles), []); assert.deepEqual(plain(snapshot.styleParameters), {});
    assert.deepEqual(h.saved, seed); assert.equal(count(h, 'commit'), 0);
  });

  test(generation + ': two senders merge and same-field last request wins', async t => {
    const h = settingsHarness(t, { config: { futureFlag: 'keep' } }, await sources()); await h.initialize();
    await Promise.all([h.patch('popup', [config('arrowSeek', false)]), h.patch('styles', [config('previewVolume', 25)])]);
    assert.deepEqual(h.saved, { config: { futureFlag: 'keep', arrowSeek: false, previewVolume: 25 }, settingsRevision: 2 });
    assert.equal(h.maxConcurrentWrites, 1);
    await Promise.all([h.patch('popup', [config('previewVolume', 30)]), h.patch('styles', [config('previewVolume', 40)])]);
    assert.equal(h.saved.config.previewVolume, 40); assert.equal(h.saved.settingsRevision, 4);
    const before = count(h, 'commit'); await h.patch('styles', [config('previewVolume', 40)]);
    assert.equal(count(h, 'commit'), before); assert.equal(h.saved.settingsRevision, 4);
  });

  test(generation + ': snapshot waits for a held write', async t => {
    const h = settingsHarness(t, {}, await sources()); await h.initialize();
    const gate = h.holdNext('commit'), write = h.patch('popup', [config('arrowSeek', false)]); await gate.reached;
    let done = false; const read = h.snapshot().then(reply => { done = true; return reply; });
    await h.settle(); assert.equal(done, false);
    assert.throws(() => h.restartBroker(), { code: 'fixture-worker-busy' });
    gate.release(); await write; assert.equal((await read).snapshot.config.arrowSeek, false);
    await h.settle(); h.restartBroker(); await h.initialize();
  });

  for (const kind of ['read', 'commit', 'remove']) test(generation + ': migration ' + kind + ' failure gates writes until fresh worker', async t => {
    const h = settingsHarness(t, { t: 2 }, await sources()); h.failNext(kind);
    await assert.rejects(h.initialize());
    assert.equal((await h.patch('popup', [config('sharpness', 4)])).stage, 'initialization');
    if (kind === 'remove') assert.deepEqual(h.saved, { t: 2, config: { sharpness: 2 }, settingsRevision: 1 });
    else { assert.deepEqual(h.saved, { t: 2 }); assert.equal(count(h, 'remove'), 0); }
    await h.settle(); h.restartBroker(); await h.initialize();
    assert.equal(Object.hasOwn(h.saved, 't'), false);
    assert.equal((await h.patch('popup', [config('sharpness', 4)])).stored, true);
    assert.equal(h.saved.config.sharpness, 4); assert.equal(h.saved.settingsRevision, 2);
  });

  for (const kind of ['write-result', 'response']) test(generation + ': post-commit ' + kind + ' failure preserves values and releases busy state', async t => {
    const h = settingsHarness(t, { config: { futureFlag: 'keep' }, settingsRevision: 4 }, await sources());
    await h.initialize(); h.failNext(kind);
    const result = await h.patch('popup', [config('arrowSeek', false)]);
    if (kind === 'response') assert.equal(result, undefined);
    else { assert.equal(result.stored, false); assert.equal(result.stage, 'write'); }
    assert.deepEqual(h.saved, { config: { futureFlag: 'keep', arrowSeek: false }, settingsRevision: 5 });
    await h.patch('styles', [config('previewVolume', 25)]);
    assert.deepEqual(h.saved, { config: { futureFlag: 'keep', arrowSeek: false, previewVolume: 25 }, settingsRevision: 6 });
    await h.settle(); h.restartBroker(); await h.initialize(); await h.settle(); assertSeededConfig(h);
    assert.equal(h.saved.settingsRevision, 6);
  });

  test(generation + ': durable write and CSS result are not the same', async t => {
    const h = settingsHarness(t, { styles: ['left-chat'], settingsRevision: 4 }, await sources()); await h.initialize();
    h.registrations.set('foreign', { id: 'foreign', css: ['foreign.css'] }); h.failNext('css-update');
    const reply = await h.patch('styles', [style('hide-studio', true)]);
    assert.equal(reply.stored, true); assert.equal(reply.ok, false); assert.equal(reply.css.state, 'failed');
    assert.deepEqual(h.saved, { styles: ['left-chat', 'hide-studio'], settingsRevision: 5 });
    assert.deepEqual(h.registrations.get('styles').css, ['styles/left-chat.css']);
    await h.settle(); const writes = count(h, 'commit'); h.invalidate({ retry: true }); await h.settle();
    assert.deepEqual(h.registrations.get('styles').css, ['styles/left-chat.css', 'styles/hide-studio.css']);
    assert.deepEqual(h.registrations.get('foreign'), { id: 'foreign', css: ['foreign.css'] });
    assert.equal(count(h, 'commit'), writes); assert.equal(count(h, 'tab-reload'), 0);
  });

  test(generation + ': reload only touches original target and invalid requests have no effects', async t => {
    const h = settingsHarness(t, {}, await sources()); await h.initialize();
    assert.equal((await h.reload()).reloaded, true);
    assert.deepEqual(h.calls.filter(c => c.kind === 'tab-reload').map(c => c.args.id), [7]);
    h.tabs.get(7).windowId = 10; assert.equal((await h.reload()).stage, 'target');
    h.tabs.delete(7); assert.equal((await h.reload()).stage, 'target'); await h.settle();
    const before = h.calls.length;
    const req = { namespace: 'cheese-knife-settings', protocol: 1, action: 'patch', requestId: 'bad', operations: [config('arrowSeek', false)] };
    assert.equal((await h.send('popup', { ...req, protocol: '1' })).stage, 'validation');
    for (const sender of [{ id: extensionId, url: 'https://chzzk.naver.com/' }, { id: extensionId, url: getURL('styles.html'), frameId: 2 }]) {
      assert.equal((await h.send('popup', req, sender)).stage, 'validation');
    }
    for (const op of [config('future', true), style('future', true), parameter('chat-font-size', 17), { ...config('arrowSeek', false), extra: 1 }]) {
      assert.equal((await h.patch('popup', [op])).stage, 'validation');
    }
    assert.equal(await h.send('popup', { namespace: 'other' }), undefined);
    assert.equal(h.calls.slice(before).filter(c => c.kind !== 'response').length, 0);
  });
}

for (const [name, initial, initialized] of [
  ['empty', {}, {}],
  ['non-default', { config: { previewVolume: 25 }, styles: ['left-chat'], styleParameters: { 'chat-font-size': 8 }, settingsRevision: 4 },
    { config: { previewVolume: 25 }, styles: ['left-chat'], styleParameters: { 'chat-font-size': 8 }, settingsRevision: 4 }],
  ['unknown', { config: { futureFlag: 'keep' }, styles: ['future-style'], styleParameters: { future: 9 }, futureTop: 'keep', settingsRevision: 4 },
    { config: { futureFlag: 'keep' }, styles: ['future-style'], styleParameters: { future: 9 }, futureTop: 'keep', settingsRevision: 4 }],
  ['legacy', { config: { resizeChat: true }, styles: [], t: 0 }, { config: { sharpness: 0 }, styles: ['chat-resize'], settingsRevision: 1 }],
]) test('continuous old new old preserves ' + name + ' seed', async t => {
  const old = await published, h = settingsHarness(t, initial, old), saved = h.saved, registrations = h.registrations;
  await h.initialize(); assert.deepEqual(h.saved, initialized);
  const base = initialized.settingsRevision || 0;
  const ops = [config('arrowSeek', false), config('brightness', 1.225), config('contrast', 1.5)];
  for (const [index, sources] of [old, current, old].entries()) {
    if (index) h.restartBroker(sources);
    assertWorker(h, sources); await h.initialize();
    await h.patch(index === 1 ? 'styles' : 'popup', [ops[index]]); await h.settle();
    const additions = Object.fromEntries(ops.slice(0, index + 1).map(op => [op.id, op.value]));
    assert.deepEqual(h.saved, { ...initialized, config: { ...initialized.config, ...additions }, settingsRevision: base + index + 1 });
    assert.strictEqual(h.saved, saved); assert.strictEqual(h.registrations, registrations);
  }
});

test('compatibility oracle rejects seeded data loss', async t => {
  const h = settingsHarness(t, { config: { futureFlag: 'keep' }, settingsRevision: 4 }, await published);
  await h.initialize(); await h.patch('popup', [config('arrowSeek', false)]); await h.settle(); assertSeededConfig(h);
  h.restartBroker({ ...current, sources: { ...current.sources,
    'settings-broker.js': 'void chrome.storage.local.set({config:{}});\n' + current.sources['settings-broker.js'] } });
  await h.initialize(); await h.settle(); assert.deepEqual(h.saved.config, {});
  assert.throws(() => assertSeededConfig(h), error => error instanceof assert.AssertionError && error.message.startsWith('arrowSeek lost'));
});

test('schema oracle rejects widened previewVolume bound', async t => {
  const old = settingsHarness(t, {}, await published), candidate = settingsHarness(t, {}, current);
  const volume = candidate.worker.window.CONFIGS.flatMap(g => g.configs).find(f => f.id === 'previewVolume');
  assert.equal(volume.max, 100); volume.max = 101;
  assert.throws(() => assertSchema(schema(candidate), schema(old)), { name: 'AssertionError' });
  assert.equal(old.worker.window.KnifeSettingsContract.validateOperations([config('previewVolume', 101)]).ok, false);
  assert.equal(candidate.worker.window.KnifeSettingsContract.validateOperations([config('previewVolume', 101)]).ok, true);
});

test('runtime fixture synchronous send errors release the versioned busy guard', async t => {
  const h = settingsHarness(t, {}, await published); await h.initialize(); await h.settle();
  const api = h.apiFor('popup');
  assert.throws(() => api.runtime.sendMessage(null, () => {}));
  await h.settle(); h.restartBroker(current); await h.initialize();
  assert.equal((await h.snapshot()).ok, true);
});

for (const generation of ['published', 'current']) {
  test(generation + ': runtime callback failure drains pending requests', async t => {
    const h = settingsHarness(t, { config: { futureFlag: 'keep' }, settingsRevision: 4 }, generation === 'published' ? await published : current);
    await h.initialize(); const api = h.apiFor('popup'), gate = h.holdNext('callback:patch');
    const request = new Promise(resolve => api.runtime.sendMessage({ namespace: 'cheese-knife-settings', protocol: 1,
      action: 'patch', requestId: 'callback-fault', operations: [config('arrowSeek', false)] }, resolve));
    await gate.reached; assert.equal(h.saved.settingsRevision, 5);
    assert.throws(() => h.restartBroker(), { code: 'fixture-worker-busy' });
    gate.fail(); assert.equal(await request, undefined); await h.settle();
    h.restartBroker(); await h.initialize(); assertSeededConfig(h);
  });
  test(generation + ': 64 waiting jobs finish before generation switch', async t => {
    const h = settingsHarness(t, {}, generation === 'published' ? await published : current); await h.initialize();
    const gate = h.holdNext('commit'), first = h.patch('popup', [config('arrowSeek', false)]); await gate.reached;
    const waiting = Array.from({ length: 64 }, (_, i) => h.patch('styles', [config('previewVolume', i + 1)]));
    assert.equal((await h.patch('popup', [config('hideDonation', true)])).stage, 'busy');
    assert.equal(count(h, 'commit'), 1); await h.settle();
    assert.throws(() => h.restartBroker(), { code: 'fixture-worker-busy' });
    gate.release(); assert.ok((await Promise.all([first, ...waiting])).every(reply => reply.stored));
    assert.deepEqual(h.saved, { config: { arrowSeek: false, previewVolume: 64 }, settingsRevision: 65 });
    await h.settle(); h.restartBroker(); await h.initialize(); assert.equal(h.maxConcurrentWrites, 1);
  });
}

test('published and current observable projections agree with independent goldens', async t => {
  async function observe(sources) {
    const h = settingsHarness(t, { config: { resizeChat: true, futureFlag: 'keep' }, styles: ['future-style'],
      styleParameters: { future: 9 }, settingsRevision: 4, t: 0, futureTop: 'keep' }, sources);
    const observations = [];
    async function capture() {
      observations.push({ raw: structuredClone(h.saved), snapshot: plain((await h.snapshot()).snapshot),
        css: structuredClone([...h.registrations.values()]),
        sideEffects: h.calls.filter(c => ['commit', 'remove', 'tab-reload'].includes(c.kind)).map(c => c.kind) });
    }
    await h.initialize();
    assert.deepEqual(h.saved, { config: { futureFlag: 'keep', sharpness: 0 }, styles: ['future-style', 'chat-resize'],
      styleParameters: { future: 9 }, settingsRevision: 5, futureTop: 'keep' });
    await capture();
    await h.patch('styles', [parameter('chat-font-size', 8)]);
    assert.equal(h.saved.settingsRevision, 6); assert.equal(h.saved.styleParameters['chat-font-size'], 8); await capture();
    await h.reload(); assert.deepEqual(h.calls.filter(c => c.kind === 'tab-reload').map(c => c.args.id), [7]);
    await capture(); return observations;
  }
  const old = await observe(await published), candidate = await observe(current);
  assert.deepEqual(candidate, old);
  assert.deepEqual(old[0].sideEffects, ['commit', 'remove']);
  assert.deepEqual(old[2].sideEffects, ['commit', 'remove', 'commit', 'tab-reload']);
});
