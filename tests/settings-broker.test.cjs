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

test('reload returns only its own canonical applied styles even after a later save', async t => {
  const h = settingsHarness(t, { styles: ['left-chat', 'future-style'] }); await h.initialize();
  const response = h.holdNext('response'), pending = h.reload(); await response.reached;
  await h.patch('styles', [style('hide-studio', true)]); response.release();
  const result = await pending;
  assert.equal(result.reloaded, true); assert.equal(result.revision, 0);
  assert.deepEqual(Array.from(result.appliedStyles), ['left-chat']);
  assert.ok(h.saved.styles.includes('hide-studio'));
  assert.ok(h.saved.styles.includes('future-style'), 'unknown stored field remains private and preserved');
});
test('a closed response channel cannot create an unhandled failure or block later requests', async t => {
  const h = settingsHarness(t); await h.initialize();
  h.broker.listener({ namespace: 'cheese-knife-settings', protocol: 1, action: 'patch', requestId: 'closed', operations: [config('arrowSeek', false)] },
    { id: extensionId, url: getURL('popup.html') }, () => { throw new Error('receiver-closed'); });
  await h.settle(); assert.equal((await h.patch('popup', [config('previewVolume', 25)])).stored, true);
});

test('owned wildcard CSS registration updates to HTTPS only without touching foreign registration or settings', async t => {
  const initial = { config: { arrowSeek: false }, styles: ['left-chat'], styleParameters: { fontSize: 2 }, settingsRevision: 7 };
  const h = settingsHarness(t, initial);
  h.registrations.set('styles', { id: 'styles', matches: ['*://chzzk.naver.com/*'], css: ['styles/left-chat.css'], runAt: 'document_start' });
  h.registrations.set('foreign', { id: 'foreign', matches: ['https://example.com/*'], js: ['foreign.js'] });
  await h.initialize();
  assert.deepEqual(h.registrations.get('styles').matches, ['https://chzzk.naver.com/*']);
  assert.deepEqual(h.registrations.get('foreign'), { id: 'foreign', matches: ['https://example.com/*'], js: ['foreign.js'] });
  assert.deepEqual(h.saved, initial);
  assert.equal(h.calls.filter(call => call.kind === 'css-update').length, 1);
});

test('explicit retry bypasses an identical failed CSS fingerprint exactly once', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] }); h.failNext('css-register'); await h.initialize();
  assert.equal(h.registrations.has('styles'), false);
  const before = h.calls.filter(call => call.kind === 'css-register').length;
  h.invalidate({ retry: true }); await h.settle();
  assert.deepEqual(h.registrations.get('styles').matches, ['https://chzzk.naver.com/*']);
  assert.equal(h.calls.filter(call => call.kind === 'css-register').length, before + 1);
});

test('a read failure before CSS work preserves the explicit retry for the next invalidation', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] }); h.failNext('css-register'); await h.initialize();
  const before = h.calls.filter(call => call.kind === 'css-register').length;
  h.failNext('read'); h.invalidate({ retry: true }); await h.settle();
  assert.equal(h.calls.filter(call => call.kind === 'css-register').length, before);
  h.invalidate(); await h.settle();
  assert.deepEqual(h.registrations.get('styles').matches, ['https://chzzk.naver.com/*']);
  assert.equal(h.calls.filter(call => call.kind === 'css-register').length, before + 1);
});

test('normal invalidation cannot erase a queued permission retry', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] }); h.failNext('css-register'); await h.initialize();
  const read = h.holdNext('read'); h.invalidate(); await read.reached;
  h.invalidate({ retry: true }); h.invalidate(); read.release(); await h.settle();
  assert.equal(h.registrations.has('styles'), true);
});

test('retry arriving during CSS registration remains pending for the latest stored selection', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] }); h.failNext('css-register'); await h.initialize();
  h.saved.styles = ['hide-studio'];
  const registration = h.holdNext('css-register'); h.invalidate({ retry: true }); await registration.reached;
  h.saved.styles = ['left-chat']; h.invalidate({ retry: true }); registration.release(); await h.settle();
  assert.deepEqual(h.registrations.get('styles').css, ['styles/left-chat.css']);
  assert.equal(h.maxConcurrentCss, 1);
});

test('queue saturation retains permission retry until queued writes drain', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] }); h.failNext('css-register'); await h.initialize();
  const commit = h.holdNext('commit'); const first = h.patch('popup', [config('previewVolume', 1)]); await commit.reached;
  const queued = Array.from({ length: 64 }, (_, i) => h.patch('popup', [config('previewVolume', (i + 2) % 101)]));
  h.invalidate({ retry: true }); commit.release(); await Promise.all([first, ...queued]); await h.settle();
  assert.equal(h.registrations.has('styles'), true); assert.equal(h.maxConcurrentCss, 1);
});

test('repeated retry notifications coalesce without parallel registration', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] }); h.failNext('css-register'); await h.initialize();
  h.saved.styles = ['hide-studio'];
  const registration = h.holdNext('css-register'); h.invalidate({ retry: true }); await registration.reached;
  h.invalidate({ retry: true }); h.invalidate({ retry: true }); registration.release(); await h.settle();
  assert.equal(h.calls.filter(call => call.kind === 'css-register').length, 2);
  assert.equal(h.maxConcurrentCss, 1);
});

test('failed retry settles until a new explicit retry signal', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] }); h.failNext('css-register'); await h.initialize();
  let count = h.calls.filter(call => call.kind === 'css-register').length;
  h.failNext('css-register'); h.invalidate({ retry: true }); await h.settle();
  assert.equal(h.calls.filter(call => call.kind === 'css-register').length, ++count);
  await h.settle(); assert.equal(h.calls.filter(call => call.kind === 'css-register').length, count);
  h.failNext('css-register'); h.invalidate({ retry: true }); await h.settle();
  assert.equal(h.calls.filter(call => call.kind === 'css-register').length, count + 1);
});

test('failed boot keeps permission retry gated', async t => {
  const h = settingsHarness(t); h.failNext('read'); await assert.rejects(h.initialize());
  h.invalidate({ retry: true }); await h.settle();
  assert.equal(h.calls.some(call => call.kind.startsWith('css-')), false);
  assert.equal((await h.patch('popup', [config('arrowSeek', false)])).stage, 'initialization');
});
