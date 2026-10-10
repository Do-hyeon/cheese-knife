const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsHarness } = require('./settings-fixture.cjs');
function input(ui, id, value) {
  const element = ui.dom.window.document.getElementById(id); assert.ok(element, id);
  if (typeof value === 'boolean') element.checked = value; else element.value = value;
  element.dispatchEvent(new ui.dom.window.Event(typeof value === 'boolean' ? 'change' : 'input', { bubbles: true }));
}
test('two actual popup documents retain different field changes', async t => {
  const h = settingsHarness(t); await h.initialize(); const a = await h.openUi('popup'), b = await h.openUi('popup');
  input(a, 'arrowSeek', false); await h.settle(); input(b, 'previewVolume', 25); await h.settle();
  assert.equal(h.saved.config.arrowSeek, false); assert.equal(h.saved.config.previewVolume, 25);
  assert.equal(h.calls.filter(c => c.kind === 'commit' && c.args.name === 'popup').length, 0, 'UI cannot write storage directly');
});
test('two actual style documents retain independent selections', async t => {
  const h = settingsHarness(t); await h.initialize(); const a = await h.openUi('styles'), b = await h.openUi('styles');
  input(a, 'left-chat', true); await h.settle(); input(b, 'hide-studio', true); await h.settle();
  assert.ok(h.saved.styles.includes('left-chat')); assert.ok(h.saved.styles.includes('hide-studio'));
  assert.equal(a.dom.window.document.getElementById('hide-studio').checked, true);
  assert.equal(h.calls.filter(c => c.kind === 'commit' && c.args.name === 'styles').length, 0);
});
test('style link waits for a single captured tab query and carries that original target', async t => {
  const h = settingsHarness(t); await h.initialize(); const gate = h.holdNext('tab-query'); const opening = h.openUi('popup');
  await gate.reached; const a = await opening, link = a.dom.window.document.getElementById('stylesConfig').closest('a');
  assert.equal(link.getAttribute('aria-disabled'), 'true');
  const click = new a.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }); assert.equal(link.dispatchEvent(click), false);
  gate.release(); await h.settle();
  assert.equal(new URL(link.href).searchParams.get('targetTabId'), '7'); assert.equal(new URL(link.href).searchParams.get('targetWindowId'), '9');
  assert.equal(link.getAttribute('aria-disabled'), 'false'); assert.equal(h.calls.filter(c => c.kind === 'tab-query').length, 1);
});
for (const locale of ['ko', 'en']) test('CSS save failure is localized and reload waits for explicit repair in ' + locale, async t => {
  const h = settingsHarness(t); await h.initialize(); const a = await h.openUi('styles', { locale, target: { tabId: 7, windowId: 9 } });
  const gate = h.holdNext('css-register'); input(a, 'left-chat', true); await gate.reached;
  const doc = a.dom.window.document, reload = doc.getElementById('reload');
  assert.equal(reload.disabled, true); reload.click(); assert.equal(h.calls.filter(c => c.kind === 'tab-reload').length, 0);
  gate.fail(); await h.settle();
  assert.match(doc.getElementById('settings-status').textContent, locale === 'ko' ? /CSS.*실패/ : /CSS.*failed/i);
  doc.getElementById('settings-retry').click(); await h.settle(); assert.equal(reload.disabled, false);
  reload.click(); await h.settle(); assert.deepEqual(h.calls.filter(c => c.kind === 'tab-reload').map(c => c.args.id), [7]);
});
for (const query of ['', '?targetTabId=0x7&targetWindowId=9', '?targetTabId=7', '?targetTabId=-1&targetWindowId=9', '?targetTabId=9007199254740992&targetWindowId=9'])
test('standalone or invalid style target never guesses active tab: ' + query, async t => {
  const h = settingsHarness(t); await h.initialize(); const a = await h.openUi('styles', { query }); input(a, 'left-chat', true); await h.settle();
  assert.ok(h.saved.styles.includes('left-chat')); const reload = a.dom.window.document.getElementById('reload'); assert.equal(reload.disabled, true);
  reload.click(); await h.settle(); assert.equal(h.calls.filter(c => c.kind === 'tab-reload').length, 0);
});
for (const change of ['deleted', 'foreign', 'window']) test('target ' + change + ' reports changed target without reloading a substitute', async t => {
  const h = settingsHarness(t); await h.initialize(); const a = await h.openUi('styles', { target: { tabId: 7, windowId: 9 } });
  input(a, 'left-chat', true); await h.settle();
  if (change === 'deleted') h.tabs.delete(7); else Object.assign(h.tabs.get(7), change === 'foreign' ? { url: 'https://example.com' } : { windowId: 10 });
  a.dom.window.document.getElementById('reload').click(); await h.settle();
  assert.equal(h.calls.filter(c => c.kind === 'tab-reload').length, 0);
  assert.match(a.dom.window.document.getElementById('settings-status').textContent, /대상.*(?:변경|없)/);
});
test('rapid slider displays newest local value while old callback is pending', async t => {
  const h = settingsHarness(t); await h.initialize(); const a = await h.openUi('popup'); const gate = h.holdNext('callback:patch');
  input(a, 'previewVolume', 10); await gate.reached; input(a, 'previewVolume', 20); input(a, 'previewVolume', 30);
  assert.equal(a.dom.window.document.getElementById('previewVolume').value, '30'); gate.release(); await h.settle();
  assert.equal(h.saved.config.previewVolume, 30);
});
test('font nonzero changes do not request an unnecessary second CSS reload', async t => {
  const h = settingsHarness(t); await h.initialize(); const a = await h.openUi('styles', { target: { tabId: 7, windowId: 9 } });
  input(a, 'chat-font-size', 8); await h.settle(); a.dom.window.document.getElementById('reload').click(); await h.settle();
  input(a, 'chat-font-size', 9); await h.settle(); assert.equal(a.dom.window.document.getElementById('reload').classList.contains('hidden'), true);
  assert.equal(h.saved.styleParameters['chat-font-size'], 9);
});
for (const locale of ['ko', 'en']) test('unknown response is shown honestly and never automatically resent in ' + locale, async t => {
  const h = settingsHarness(t); await h.initialize(); const a = await h.openUi('popup', { locale, fakeTime: true });
  const gate = h.holdNext('callback:patch'); input(a, 'previewVolume', 10); await gate.reached;
  await a.time.advance(10000); await h.settle();
  const doc = a.dom.window.document;
  assert.equal(doc.getElementById('settings-status').dataset.phase, 'unknown');
  assert.match(doc.getElementById('settings-status').textContent, locale === 'ko' ? /확인할 수 없/ : /unknown/i);
  gate.release(); await h.settle(); assert.equal(doc.getElementById('settings-status').dataset.phase, 'unknown');
  assert.equal(h.messages.filter(m => m.message.action === 'patch').length, 1);
  doc.getElementById('settings-discard').click(); await h.settle(); assert.equal(doc.getElementById('settings-status').dataset.phase, 'ready');
});
test('initial snapshot gates inputs and late read cannot overwrite a newer local slider value', async t => {
  const h = settingsHarness(t); await h.initialize(); const initial = h.holdNext('callback:get-snapshot');
  const a = await h.openUi('popup'); await initial.reached;
  const slider = a.dom.window.document.getElementById('previewVolume'); assert.equal(slider.disabled, true);
  initial.release(); await h.settle(); assert.equal(slider.disabled, false);
  const read = h.holdNext('callback:get-snapshot'); h.changes.emit({ settingsRevision: { newValue: 0 } }, 'local'); await read.reached;
  input(a, 'previewVolume', 35); read.release(); await h.settle(); assert.equal(slider.value, '35'); assert.equal(h.saved.config.previewVolume, 35);
});
for (const locale of ['ko', 'en']) test('invalid revision shows repair-required and disables edits in ' + locale, async t => {
  const h = settingsHarness(t, { settingsRevision: -1 }); await assert.rejects(h.initialize());
  const a = await h.openUi('styles', { locale }); const doc = a.dom.window.document;
  assert.equal(doc.getElementById('settings-status').dataset.phase, 'repair-required');
  assert.match(doc.getElementById('settings-status').textContent, locale === 'ko' ? /복구/ : /repair/i);
  assert.equal(doc.getElementById('left-chat').disabled, true); assert.equal(doc.getElementById('reload').disabled, true);
});
test('failed target capture opens an explicitly targetless styles link', async t => {
  const h = settingsHarness(t); await h.initialize(); h.failNext('tab-query'); const a = await h.openUi('popup');
  const link = a.dom.window.document.getElementById('stylesConfig').closest('a');
  assert.equal(new URL(link.href).search, ''); assert.equal(link.getAttribute('aria-disabled'), 'false');
});
module.exports = { input };
