const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsHarness, config, style } = require('./settings-fixture.cjs');
async function clientFixture(t, stored = {}, options) {
  const h = settingsHarness(t, stored); await h.initialize(); const a = h.client('popup', options); await h.settle(); return { h, a };
}
test('initial subscription precedes read and two clients preserve different fields', async t => {
  const { h, a } = await clientFixture(t); const b = h.client('styles'); await h.settle();
  assert.ok(h.messages[0].subscribers >= 2);
  a.edit(config('arrowSeek', false)); b.edit(config('previewVolume', 25)); await h.settle();
  assert.equal(h.saved.config.arrowSeek, false); assert.equal(h.saved.config.previewVolume, 25);
  assert.equal(a.view().values.config.previewVolume, 25); assert.equal(b.view().values.config.arrowSeek, false);
});
test('rapid input coalesces only unsent fields and keeps one mutation in flight', async t => {
  const { h, a } = await clientFixture(t); const gate = h.holdNext('callback:patch');
  a.edit(config('previewVolume', 10)); await gate.reached;
  a.edit(config('previewVolume', 20)); a.edit(config('previewVolume', 30)); a.edit(config('arrowSeek', false));
  assert.equal(a.view().values.config.previewVolume, 30); gate.release(); await h.settle();
  assert.equal(h.saved.config.previewVolume, 30); assert.equal(h.saved.config.arrowSeek, false); assert.equal(a.maxInflight(), 1);
  assert.equal(h.messages.filter(m => m.message.action === 'patch').length, 2);
});
test('successful ack keeps confirmed value until its snapshot arrives without advancing whole snapshot', async t => {
  const { h, a } = await clientFixture(t, { config: { previewVolume: 5 }, settingsRevision: 4 });
  const event = h.holdNext('event'), read = h.holdNext('callback:get-snapshot');
  a.edit(config('previewVolume', 10)); await read.reached;
  assert.equal(a.view().values.config.previewVolume, 10); assert.equal(a.view().snapshot.revision, 4);
  assert.deepEqual(Array.from(a.view().pendingKeys), []); read.release(); event.release(); await h.settle();
  assert.equal(a.view().snapshot.revision, 5); assert.equal(a.view().values.config.previewVolume, 10);
});
test('no-op ack also confirms value and requests a current snapshot', async t => {
  const { h, a } = await clientFixture(t, { config: { previewVolume: 5 }, settingsRevision: 4 });
  const event = h.holdNext('event'); await h.patch('styles', [config('previewVolume', 10)]);
  const before = h.calls.filter(c => c.kind === 'commit').length; const read = h.holdNext('callback:get-snapshot');
  a.edit(config('previewVolume', 10)); await read.reached;
  assert.equal(a.view().values.config.previewVolume, 10); assert.equal(a.view().snapshot.revision, 4);
  assert.equal(h.calls.filter(c => c.kind === 'commit').length, before);
  read.release(); event.release(); await h.settle(); assert.equal(a.view().snapshot.revision, 5);
});
test('newer snapshot survives an older ack and its CSS status', async t => {
  const { h, a } = await clientFixture(t, { config: { previewVolume: 5 }, settingsRevision: 4 });
  const ack = h.holdNext('callback:patch'); a.edit(config('previewVolume', 10)); await ack.reached;
  h.failNext('css-register'); await h.patch('styles', [config('previewVolume', 25), style('left-chat', true)]); await h.settle();
  assert.equal(a.view().snapshot.revision, 6); ack.release(); await h.settle();
  assert.equal(a.view().values.config.previewVolume, 25); assert.equal(a.view().css.state, 'failed');
});
test('old read cannot undo successful same-revision CSS retry', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'], settingsRevision: 4 }); h.failNext('css-register'); await h.initialize();
  const a = h.client('styles'); await h.settle(); assert.equal(a.view().css.state, 'failed');
  const old = h.holdNext('callback:get-snapshot'); const reading = a.refresh(); await old.reached;
  assert.equal((await a.retryStyles()).css.state, 'ready'); old.release(); await reading; await h.settle();
  assert.equal(a.view().css.state, 'ready'); assert.equal(a.view().snapshot.revision, 4);
});
test('old snapshot read after newer storage event is discarded and refreshed', async t => {
  const { h, a } = await clientFixture(t); const old = h.holdNext('callback:get-snapshot'); const reading = a.refresh(); await old.reached;
  await h.patch('styles', [config('previewVolume', 25)]); old.release(); await reading; await h.settle();
  assert.equal(a.view().values.config.previewVolume, 25); assert.equal(a.view().snapshot.revision, 1);
});
for (const boundary of ['commit', 'callback:patch']) test('lost response at ' + boundary + ' never automatically resends intent or applies late ack', async t => {
  const { h, a } = await clientFixture(t, {}, { fakeTime: true }); const gate = h.holdNext(boundary);
  a.edit(config('arrowSeek', false)); await gate.reached; await a.time.advance(10000); await h.settle();
  assert.equal(a.view().phase, 'unknown'); assert.equal(h.messages.filter(m => m.message.action === 'patch').length, 1);
  gate.release(); await h.settle(); assert.equal(a.view().phase, 'unknown');
  assert.equal(h.messages.filter(m => m.message.action === 'patch').length, 1);
  await a.discardPending(); assert.equal(a.view().values.config.arrowSeek, false); assert.equal(a.view().phase, 'ready');
});
test('storage failure holds unsent inputs but explicit new field intent and discard remain possible', async t => {
  const { h, a } = await clientFixture(t); const commit = h.holdNext('commit');
  a.edit(config('arrowSeek', false)); await commit.reached; a.edit(config('previewVolume', 25)); commit.fail(); await h.settle();
  assert.equal(a.view().phase, 'failed'); assert.equal(h.messages.filter(m => m.message.action === 'patch').length, 1);
  a.edit(config('previewVolume', 30)); await h.settle(); assert.equal(h.saved.config.previewVolume, 30); assert.equal(h.saved.config.arrowSeek, undefined);
  await a.discardPending(); assert.equal(a.view().values.config.arrowSeek, true); assert.equal(a.view().phase, 'ready');
});
test('saved CSS failure clears stored inputs but blocks reload until explicit retry', async t => {
  const { h, a } = await clientFixture(t); h.failNext('css-register'); a.edit(style('left-chat', true)); await h.settle();
  assert.deepEqual(Array.from(a.view().pendingKeys), []); assert.equal(a.view().css.state, 'failed');
  await assert.rejects(a.reloadTarget({ tabId: 7, windowId: 9 })); assert.equal(h.calls.filter(c => c.kind === 'tab-reload').length, 0);
  await a.retryStyles(); await h.settle(); assert.equal((await a.reloadTarget({ tabId: 7, windowId: 9 })).reloaded, true);
});
test('transport error reports uncertainty, preserves later input, and cannot replay automatically', async t => {
  const { h, a } = await clientFixture(t); h.failNext('callback:patch'); a.edit(config('previewVolume', 10)); await h.settle();
  assert.equal(a.view().phase, 'unknown'); assert.equal(h.messages.filter(m => m.message.action === 'patch').length, 1);
  a.edit(config('previewVolume', 25)); await h.settle(); assert.equal(h.saved.config.previewVolume, 25); assert.equal(a.view().phase, 'ready');
});
test('dispose removes subscription and late callback cannot render or send more requests', async t => {
  const { h, a } = await clientFixture(t); const gate = h.holdNext('callback:patch'); let renders = 0;
  a.subscribe(() => renders++); a.edit(config('previewVolume', 10)); await gate.reached;
  const before = renders, listeners = h.changes.listeners.size; a.dispose(); gate.release(); await h.settle();
  assert.equal(renders, before); assert.equal(h.changes.listeners.size, listeners - 1);
  const count = h.messages.length; a.edit(config('previewVolume', 25)); await h.settle(); assert.equal(h.messages.length, count);
});
test('invalid local operation cannot send a mutation message', async t => {
  const { h, a } = await clientFixture(t); const before = h.messages.length;
  a.edit(config('previewVolume', Infinity)); await h.settle(); assert.equal(h.messages.length, before); assert.equal(a.view().phase, 'failed');
});
test('busy response holds intent without automatic resubmission', async t => {
  const { h, a } = await clientFixture(t); const gate = h.holdNext('commit');
  const first = h.patch('styles', [config('previewVolume', 5)]); await gate.reached;
  const waiting = Array.from({ length: 64 }, () => h.snapshot('styles'));
  a.edit(config('arrowSeek', false)); await h.settle();
  assert.equal(a.view().phase, 'failed'); assert.equal(a.view().code, 'settings-busy');
  assert.equal(h.messages.filter(m => m.message.action === 'patch').length, 1);
  gate.release(); await first; await Promise.all(waiting); await h.settle();
  assert.equal(h.saved.config.arrowSeek, undefined); assert.equal(a.view().phase, 'failed');
});
test('lost empty CSS retry response remains unknown even without field buffers', async t => {
  const { h, a } = await clientFixture(t); h.failNext('callback:patch');
  await assert.rejects(a.retryStyles()); await h.settle();
  assert.equal(a.view().phase, 'unknown');
  await assert.rejects(a.reloadTarget({ tabId: 7, windowId: 9 }));
  await a.discardPending(); assert.equal(a.view().phase, 'ready');
});
test('failed refresh while discarding intent cannot claim ready or allow reload', async t => {
  const { h, a } = await clientFixture(t); h.failNext('callback:patch'); a.edit(config('previewVolume', 10)); await h.settle();
  h.failNext('callback:get-snapshot'); await a.discardPending();
  assert.notEqual(a.view().phase, 'ready'); await assert.rejects(a.reloadTarget({ tabId: 7, windowId: 9 }));
});
