const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsHarness, config, style, parameter, getURL, extensionId } = require('./settings-fixture.cjs');

test('different setting fields merge against current storage with one writer', async t => {
  const h = settingsHarness(t, { config: { future: 'kept' } }); await h.initialize();
  await Promise.all([h.patch('popup', [config('arrowSeek', false)]), h.patch('styles', [config('previewVolume', 25)])]);
  assert.deepEqual(h.saved.config, { future: 'kept', arrowSeek: false, previewVolume: 25 });
  assert.equal(h.saved.settingsRevision, 2); assert.equal(h.maxConcurrentWrites, 1);
});
test('same-field last request wins and no-op confirms without a write', async t => {
  const h = settingsHarness(t); await h.initialize();
  await Promise.all([h.patch('popup', [config('arrowSeek', false)]), h.patch('popup', [config('arrowSeek', true)])]);
  const before = h.calls.filter(c => c.kind === 'commit').length;
  const result = await h.patch('popup', [config('arrowSeek', true)]);
  assert.equal(result.stored, true); assert.equal(result.revision, 2); assert.equal(h.saved.config.arrowSeek, true);
  assert.equal(h.calls.filter(c => c.kind === 'commit').length, before);
});
test('worker recreation keeps persistent revision and values', async t => {
  const h = settingsHarness(t); await h.initialize(); await h.patch('popup', [config('arrowSeek', false)]);
  h.restartBroker(); await h.initialize(); await h.patch('popup', [config('previewVolume', 25)]);
  assert.equal(h.saved.settingsRevision, 2); assert.equal(h.saved.config.arrowSeek, false);
});
test('commit and callback completion are independent and next write cannot overtake either', async t => {
  const h = settingsHarness(t); await h.initialize(); const commit = h.holdNext('commit'), reply = h.holdNext('write-result');
  const first = h.patch('popup', [config('arrowSeek', false)]); await commit.reached;
  assert.equal(h.saved.config, undefined);
  const second = h.patch('popup', [config('previewVolume', 25)]);
  commit.release(); await reply.reached; assert.equal(h.saved.config.arrowSeek, false); assert.equal(h.saved.config.previewVolume, undefined);
  reply.release(); await Promise.all([first, second]); assert.equal(h.saved.config.previewVolume, 25);
});
test('queue accepts 64 waiting jobs and rejects overflow before storage side effects', async t => {
  const h = settingsHarness(t); await h.initialize(); const gate = h.holdNext('commit');
  const first = h.patch('popup', [config('arrowSeek', false)]); await gate.reached;
  const waiting = Array.from({ length: 64 }, () => h.patch('popup', [config('previewVolume', 25)]));
  const overflow = await h.patch('popup', [config('hideDonation', true)]);
  assert.equal(overflow.stage, 'busy'); assert.equal(h.calls.filter(c => c.kind === 'commit').length, 1);
  gate.release(); const responses = await Promise.all([first, ...waiting]); assert.ok(responses.every(r => r.stored));
});
test('failed storage task does not poison next queued request or roll back a full object', async t => {
  const h = settingsHarness(t, { config: { future: 'kept' } }); await h.initialize(); h.failNext('commit');
  const [bad, good] = await Promise.all([h.patch('popup', [config('arrowSeek', false)]), h.patch('popup', [config('previewVolume', 25)])]);
  assert.equal(bad.stage, 'write'); assert.equal(good.stored, true); assert.deepEqual(h.saved.config, { future: 'kept', previewVolume: 25 });
});
test('legacy migration serializes before user patches and removes legacy only after commit', async t => {
  const h = settingsHarness(t, { config: { resizeChat: true }, styles: [], t: 0 }); const gate = h.holdNext('remove');
  const init = h.initialize(); await gate.reached;
  assert.equal(h.saved.config.sharpness, 0); assert.equal(h.saved.config.resizeChat, undefined); assert.deepEqual(h.saved.styles, ['chat-resize']);
  const write = h.patch('popup', [config('sharpness', 4)]); await h.settle(); assert.equal(h.saved.config.sharpness, 0);
  gate.release(); await init; await write; assert.equal(h.saved.config.sharpness, 4); assert.equal(Object.hasOwn(h.saved, 't'), false);
});
for (const kind of ['read', 'commit', 'remove']) test('migration ' + kind + ' failure gates user writes until a fresh worker', async t => {
  const h = settingsHarness(t, { t: 2 }); h.failNext(kind);
  await assert.rejects(h.initialize()); const blocked = await h.patch('popup', [config('sharpness', 4)]);
  assert.equal(blocked.stage, 'initialization'); assert.notEqual(h.saved.config?.sharpness, 4);
  h.restartBroker(); await h.initialize(); assert.equal((await h.patch('popup', [config('sharpness', 4)])).stored, true);
});
test('invalid or foreign requests cause no read write CSS or reload side effects', async t => {
  const h = settingsHarness(t); await h.initialize(); await h.settle(); const before = h.calls.length;
  const req = { namespace: 'cheese-knife-settings', protocol: 1, action: 'patch', requestId: 'x', operations: [config('arrowSeek', false)] };
  for (const sender of [{ id: extensionId, url: 'https://chzzk.naver.com/' }, { id: extensionId, url: getURL('styles.html'), frameId: 2 }]) assert.equal((await h.send('popup', req, sender)).stage, 'validation');
  assert.equal((await h.patch('popup', [config('unknown', true)])).stage, 'validation');
  assert.equal(await h.send('popup', { namespace: 'other' }), undefined);
  assert.equal(h.calls.slice(before).filter(c => c.kind !== 'response').length, 0);
});
test('snapshot waits for pending write instead of exposing its intermediate state', async t => {
  const h = settingsHarness(t); await h.initialize(); const gate = h.holdNext('commit');
  const write = h.patch('popup', [config('arrowSeek', false)]); await gate.reached;
  let readDone = false; const read = h.snapshot().then(r => { readDone = true; return r; }); await h.settle(); assert.equal(readDone, false);
  gate.release(); await write; assert.equal((await read).snapshot.config.arrowSeek, false);
});
test('a closed response channel cannot create an unhandled failure or block later requests', async t => {
  const h = settingsHarness(t); await h.initialize();
  h.broker.listener({ namespace: 'cheese-knife-settings', protocol: 1, action: 'patch', requestId: 'closed', operations: [config('arrowSeek', false)] },
    { id: extensionId, url: getURL('popup.html') }, () => { throw new Error('receiver-closed'); });
  await h.settle(); assert.equal((await h.patch('popup', [config('previewVolume', 25)])).stored, true);
});
