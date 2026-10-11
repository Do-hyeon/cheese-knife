const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { flush } = require('./helpers.cjs');
const { settingsHarness } = require('./settings-fixture.cjs');

async function ui(t, html, stored, locale = 'ko', setup) {
  const h = settingsHarness(t, stored); await h.initialize();
  const result = await h.openUi(html.replace('.html', ''), { locale, setup, target: { tabId: 7, windowId: 9 } });
  return { ...result, data: h.saved };
}

test('every popup option saves its own field without dropping unrelated settings', async t => {
  const { dom, data } = await ui(t, 'popup.html', { config: { preview: false, compressorAttack: 0 } });
  await flush();
  const values = {
    preview: true, livePreview: false, previewWidth: 650, previewDelay: 0.1, previewVolume: 10,
    rightClickToUnmute: false, previewStartUnmuted: true, updateSidebar: false, expandFollowings: true, popupPlayer: false,
    arrowSeek: false, pressToFastForward: false, brightness: 1.2, contrast: 1.1, saturation: 0.8, gamma: 1.2, sharpness: 2,
    compressorDefault: true, compressorThreshold: -40, compressorKnee: 30, compressorRatio: 8, compressorAttack: 0.1, compressorRelease: 0.3,
    hideDonation: true, showDeleted: true,
  };
  for (const [id, value] of Object.entries(values)) {
    const input = dom.window.document.getElementById(id);
    assert.ok(input, `${id} is reachable in the popup`);
    assert.ok(dom.window.document.querySelector(`label[for="${id}"]`)?.textContent, `${id} has a translated label`);
    if (typeof value === 'boolean') input.checked = value; else input.value = value;
    input.dispatchEvent(new dom.window.Event(typeof value === 'boolean' ? 'change' : 'input', { bubbles: true }));
    await flush();
    assert.equal(data.config[id], value, `${id} persists`);
    for (const [priorId, priorValue] of Object.entries(values).slice(0, Object.keys(values).indexOf(id))) {
      assert.equal(data.config[priorId], priorValue, `${id} preserves ${priorId}`);
    }
  }
  assert.deepEqual(data.config, values);
  const delay = dom.window.document.getElementById('previewDelay');
  delay.dispatchEvent(new dom.window.Event('dblclick')); await flush();
  assert.equal(data.config.previewDelay, 1, 'double-click restores the declared default');
});

test('popup reports missing deleted-chat support as limited instead of ready', async t => {
  const { dom } = await ui(t, 'popup.html', {}); await flush();
  const values = [...dom.window.document.querySelectorAll('.capability-state')];
  assert.equal(values.length, 2);
  assert.equal(values[0].classList.contains('ready'), true);
  assert.equal(values[1].classList.contains('limited'), true);
  assert.ok(values[1].parentElement.title, 'limited capability has an explanation');
});

test('popup ignores inherited and unsupported capability statuses', async t => {
  const { dom } = await ui(t, 'popup.html', {}, 'ko', api => {
    api.tabs.sendMessage = async () => {
      const statuses = Object.create({ player: { state: 'ready', reason: 'inherited' } });
      Object.defineProperty(statuses, 'unsupportedFeature', { enumerable: true, value: { state: 'ready' } });
      return { statuses };
    };
  });
  await flush();
  assert.equal(dom.window.document.querySelectorAll('.capability-row').length, 0);
  assert.ok(dom.window.document.querySelector('#capabilities .desc'));
});

test('popup exposes only sidebar preview audio controls, not retired native-card overrides', async t => {
  const { dom } = await ui(t, 'popup.html', { config: { customPreview: true } });
  await flush();
  assert.equal(dom.window.document.getElementById('customPreview'), null);
  const unmute = dom.window.document.getElementById('rightClickToUnmute');
  assert.ok(unmute);
  assert.equal(unmute.closest('details'), null, 'sidebar unmute is not inside a native-thumbnail section');
});

// Break caught: the independently published fork must identify itself and
// route its guide/support links to the fork, not the original maintainer.
for (const [locale, recovery, unofficial, labels] of [
  ['ko', /복구판/, /비공식/, ['사용 안내', '문제 신고', '소스 코드', '원본 프로젝트']],
  ['en', /Recovery/, /unofficial/i, ['Guide', 'Report issue', 'Source', 'Original project']],
]) test('community popup identifies the fork and localizes its support destinations in ' + locale, async t => {
  const { dom } = await ui(t, 'popup.html', {}, locale); await flush();
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const resolve = field => {
    const key = manifest[field].match(/^__MSG_(.+)__$/)?.[1];
    return key ? dom.window.chrome.i18n.getMessage(key) : manifest[field];
  };
  assert.match(resolve('name'), recovery, 'installed/store name distinguishes the community recovery');
  assert.match(resolve('description'), unofficial, 'short description cannot imply an official release');
  assert.match(dom.window.document.title, recovery);
  assert.ok(resolve('name').length <= 75);
  assert.ok(resolve('description').length <= 132);
  assert.ok(dom.window.document.title.length <= 12, 'short name fits the extension metadata limit');
  const links = [...dom.window.document.querySelectorAll('footer a')];
  assert.deepEqual(links.map(a => a.textContent.trim()), labels);
  assert.deepEqual(links.map(a => a.href), [
    'https://github.com/Do-hyeon/cheese-knife/blob/main/README.md',
    'https://github.com/Do-hyeon/cheese-knife/issues',
    'https://github.com/Do-hyeon/cheese-knife/tree/main',
    'https://github.com/jebibot/cheese-knife',
  ]);
  for (const a of links) {
    assert.equal(a.target, '_blank');
    assert.ok(a.relList.contains('noopener'));
    assert.ok(a.relList.contains('noreferrer'));
  }
});

test('community homepage opens the same fork guide that the popup offers', async t => {
  const { dom } = await ui(t, 'popup.html', {}); await flush();
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const guide = 'https://github.com/Do-hyeon/cheese-knife/blob/main/README.md';
  assert.equal(manifest.homepage_url, guide);
  assert.equal(dom.window.document.querySelector('footer a')?.href, guide);
});

test('community footer remains usable when footer translations are unavailable', async t => {
  const { dom } = await ui(t, 'popup.html', {}, 'ko', api => {
    const getMessage = api.i18n.getMessage;
    api.i18n.getMessage = key => key.startsWith('footer_') ? '' : getMessage(key);
  });
  await flush();
  assert.deepEqual([...dom.window.document.querySelectorAll('footer a')].map(a => a.textContent.trim()),
    ['Guide', 'Report issue', 'Source', 'Original project']);
  assert.ok(dom.window.document.getElementById('preview'), 'missing optional translations cannot interrupt setting controls');
});

test('all style toggles and font offsets persist selections and show reload only when needed', async t => {
  const { dom, data } = await ui(t, 'styles.html', { styles: [], styleParameters: {} }); await flush();
  const ids = ['fit-player','volume-percentage','hide-ff','hide-comp','chat-resize','chat-timestamp','hide-ranking','hide-mission','left-chat','hide-offline','hide-recommended','hide-schedule','hide-sidebar-partner','hide-shortcut','right-sidebar','static-logo','hide-topics','hide-studio','auto-hide-toolbar','hide-recommended-live','top-explore','hide-blocked','hide-live-badge','rectangle-profile'];
  for (const id of ids) {
    const input = dom.window.document.getElementById(id); assert.ok(input, id);
    input.checked = true; input.dispatchEvent(new dom.window.Event('change')); await flush();
    assert.ok(data.styles.includes(id), `${id} is enabled`);
    input.checked = false; input.dispatchEvent(new dom.window.Event('change')); await flush();
    assert.equal(data.styles.includes(id), false, `${id} can be disabled`);
  }
  const font = dom.window.document.getElementById('chat-font-size');
  font.value = 8; font.dispatchEvent(new dom.window.Event('input')); await flush();
  assert.deepEqual(Array.from(data.styles), ['chat-font-size']); assert.equal(data.styleParameters['chat-font-size'], 8);
  assert.equal(dom.window.document.getElementById('reload').classList.contains('hidden'), false);
  font.value = 0; font.dispatchEvent(new dom.window.Event('input')); await flush();
  assert.deepEqual(Array.from(data.styles), []); assert.equal(data.styleParameters['chat-font-size'], 0);
});

// Break caught: this container-height option must not be mislabeled as a
// fullscreen, zoom or crop command in either published locale.
for (const [locale, labelText] of [['ko', '플레이어 영역 채우기'], ['en', 'Fill player area']]) test('fit-player control identifies the player area without enabling the style in ' + locale, async t => {
  const { dom, data } = await ui(t, 'styles.html', { styles: [], styleParameters: {} }, locale);
  await flush();
  const label = dom.window.document.querySelector('label[for="fit-player"]');
  assert.equal(label.textContent, labelText);
  assert.ok(label.title.length > 0);
  assert.equal(dom.window.document.getElementById('fit-player').checked, false);
  assert.deepEqual(data.styles, []);
});
