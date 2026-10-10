const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsHarness, config, style, parameter } = require('./settings-fixture.cjs');
test('startup CSS failure leaves storage and explicit retry available in the same worker', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] }); h.failNext('css-register'); await h.initialize();
  assert.equal((await h.snapshot()).snapshot.css.state, 'failed');
  assert.equal((await h.patch('popup', [config('arrowSeek', false)])).stored, true);
  const before = h.saved.settingsRevision; assert.equal((await h.patch('styles', [])).css.state, 'ready'); assert.equal(h.saved.settingsRevision, before);
});
test('style ack waits for registration and preserves foreign dynamic registrations', async t => {
  const h = settingsHarness(t); h.registrations.set('foreign', { id: 'foreign', css: ['other.css'] }); await h.initialize();
  const gate = h.holdNext('css-register'); let responded = false;
  const write = h.patch('styles', [style('left-chat', true)]).then(r => { responded = true; return r; }); await gate.reached;
  assert.equal(responded, false); assert.deepEqual(h.saved.styles, ['left-chat']); gate.release(); assert.equal((await write).css.state, 'ready');
  await h.patch('styles', [style('hide-studio', true)]); assert.ok(h.calls.some(c => c.kind === 'css-update'));
  await h.patch('styles', [style('left-chat', false), style('hide-studio', false)]);
  assert.equal(h.registrations.has('styles'), false); assert.equal(h.registrations.has('foreign'), true);
  assert.ok(h.calls.filter(c => c.kind === 'css-unregister').every(c => JSON.stringify(c.args) === '{"ids":["styles"]}'));
});
test('CSS failure preserves saved values and own events cannot automatically retry forever', async t => {
  const h = settingsHarness(t); await h.initialize(); h.failNext('css-register');
  const result = await h.patch('styles', [style('left-chat', true)]); assert.equal(result.stored, true); assert.equal(result.stage, 'css');
  const before = h.calls.filter(c => c.kind === 'css-register').length;
  for (let i = 0; i < 4; i++) { h.invalidate(); await h.settle(); await h.snapshot(); }
  assert.equal(h.calls.filter(c => c.kind === 'css-register').length, before); assert.deepEqual(h.saved.styles, ['left-chat']);
  assert.equal((await h.patch('styles', [])).css.state, 'ready');
});
test('font membership and value share one commit and unknown style IDs never become CSS paths', async t => {
  const h = settingsHarness(t, { styles: ['future-style'] }); await h.initialize();
  await h.patch('styles', [parameter('chat-font-size', 8)]);
  const commit = h.calls.filter(c => c.kind === 'commit').at(-1).args.value;
  assert.deepEqual(commit.styles, ['future-style', 'chat-font-size']); assert.equal(commit.styleParameters['chat-font-size'], 8);
  assert.deepEqual(h.registrations.get('styles').css, ['styles/chat-font-size.css']);
});
test('reload waits for CSS and uses only explicit captured target ID', async t => {
  const h = settingsHarness(t); await h.initialize(); const gate = h.holdNext('css-register');
  const write = h.patch('styles', [style('left-chat', true)]); await gate.reached; const reload = h.reload(); await h.settle();
  assert.equal(h.calls.filter(c => c.kind === 'tab-reload').length, 0); gate.release(); await write; assert.equal((await reload).reloaded, true);
  assert.deepEqual(h.calls.filter(c => c.kind === 'tab-reload').map(c => c.args.id), [7]);
});
for (const [name, change] of [['deleted', h => h.tabs.delete(7)], ['foreign-origin', h => { h.tabs.get(7).url = 'https://chzzk.naver.com.evil/'; }], ['http', h => { h.tabs.get(7).url = 'http://chzzk.naver.com/'; }], ['moved-window', h => { h.tabs.get(7).windowId = 10; }]]) test('reload stops for target ' + name, async t => {
  const h = settingsHarness(t); await h.initialize(); change(h); assert.equal((await h.reload()).stage, 'target');
  assert.equal(h.calls.filter(c => c.kind === 'tab-reload').length, 0);
});
test('read CSS and reload failures are distinguishable and cannot report reloaded success', async t => {
  const h = settingsHarness(t); await h.initialize(); h.failNext('read'); assert.equal((await h.snapshot()).stage, 'read');
  h.failNext('tab-reload'); const result = await h.reload(); assert.equal(result.stage, 'reload'); assert.notEqual(result.reloaded, true);
});
for (const kind of ['css-get', 'css-update', 'css-unregister']) test(kind + ' failure preserves saved styles and requires explicit retry', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] }); await h.initialize(); h.failNext(kind);
  const operations = kind === 'css-unregister' ? [style('left-chat', false)] : [style('hide-studio', true)];
  const result = await h.patch('styles', operations); assert.equal(result.stored, true); assert.equal(result.stage, 'css');
  const next = await h.reload(); assert.equal(next.stage, 'css'); assert.equal(h.calls.filter(c => c.kind === 'tab-reload').length, 0);
  assert.equal((await h.patch('styles', [])).css.state, 'ready');
});
