const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t) {
  const dom = page(playerHTML + '<a id="one" href="/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb">One</a><a id="two" href="/live/cccccccccccccccccccccccccccccccc">Two</a>');
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  const pending = [];
  dom.window.fetch = (_url, options) => new Promise(resolve => pending.push({ resolve, options }));
  for (const anchor of dom.window.document.querySelectorAll('a')) anchor.getBoundingClientRect = () => ({ left: 20, right: 120, top: 30, bottom: 50, width: 100, height: 20 });
  load(dom, 'web/runtime.js'); deliver(dom, { preview: true, livePreview: false, previewWidth: 400, previewDelay: 0.1, previewVolume: 5 });
  load(dom, 'web/preview.js');
  const response = image => ({ ok: true, json: async () => ({ code: 200, content: { status: 'OPEN', liveImageUrl: image, livePlaybackJson: '{}' } }) });
  return { dom, preview: runtime(dom).preview, pending, response, one: dom.window.document.getElementById('one'), two: dom.window.document.getElementById('two') };
}

test('late hover A cannot replace newer hover B even when abort is ignored', async t => {
  const { dom, preview, pending, response, one, two } = setup(t);
  const first = preview.show(one.href, one, true);
  const second = preview.show(two.href, two, true);
  pending[1].resolve(response('https://images.invalid/b.jpg')); await second;
  pending[0].resolve(response('https://images.invalid/a.jpg')); await first;
  assert.equal(dom.window.document.querySelector('.knife-preview img').getAttribute('src'), 'https://images.invalid/b.jpg');
  assert.equal(pending[0].options.signal.aborted, true);
});

test('hide before request response cannot reopen the preview', async t => {
  const { dom, preview, pending, response, one } = setup(t);
  const first = preview.show(one.href, one, true);
  preview.hide(); pending[0].resolve(response('https://images.invalid/a.jpg')); await first;
  assert.equal(dom.window.document.querySelector('.knife-preview')?.hidden ?? true, true);
});

test('same anchor changing URL invalidates an earlier request', async t => {
  const { dom, preview, pending, response, one } = setup(t);
  const first = preview.show(one.href, one, true);
  one.href = '/live/cccccccccccccccccccccccccccccccc';
  pending[0].resolve(response('https://images.invalid/a.jpg')); await first;
  assert.equal(dom.window.document.querySelector('.knife-preview')?.hidden ?? true, true);
});

test('untrusted hrefs do not request an API or create media', async t => {
  const { preview, pending, one } = setup(t);
  await preview.show('https://external.invalid/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', one, true);
  assert.equal(pending.length, 0);
});

for (const invalidation of ['removed', 'changed-href', 'disabled-live-preview']) {
  test('active HLS media is destroyed when its anchor/config is ' + invalidation, async t => {
    const { dom, preview, pending, one } = setup(t);
    dom.window.HTMLMediaElement.prototype.pause = () => {};
    dom.window.HTMLMediaElement.prototype.load = () => {};
    let destroyed = 0;
    runtime(dom).Hls = class {
      static isSupported() { return true; }
      static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest' };
      on() {} loadSource() {} attachMedia() {} destroy() { destroyed++; }
    };
    const config = { preview: true, livePreview: true, previewDelay: 0.1 };
    deliver(dom, config, 2);
    const showing = preview.show(one.href, one);
    pending[0].resolve({ ok: true, json: async () => ({ code: 200, content: { status: 'OPEN', livePlaybackJson: JSON.stringify({ media: [{ mediaId: 'HLS', path: 'https://media.invalid/master.m3u8' }] }) } }) });
    await showing; await new Promise(resolve => setTimeout(resolve, 150));
    assert.ok(dom.window.document.querySelector('.knife-preview-video'));
    if (invalidation === 'removed') one.remove();
    else if (invalidation === 'changed-href') one.href = '/live/cccccccccccccccccccccccccccccccc';
    else deliver(dom, { ...config, livePreview: false }, 3);
    await flush();
    assert.equal(destroyed, 1);
    assert.equal(dom.window.document.querySelector('.knife-preview-video'), null);
  });
}

test('default native thumbnail right-click unmutes only the card video', t => {
  const { dom } = setup(t);
  deliver(dom, { customPreview: false, rightClickToUnmute: true, previewVolume: 5 }, 2);
  const body = dom.window.document.getElementById('layout-body');
  body.insertAdjacentHTML('beforeend', '<a href="/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" id="native-card"><video muted></video></a>');
  const video = dom.window.document.querySelector('#native-card video'); video.muted = true;
  const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  video.dispatchEvent(event);
  assert.equal(video.muted, false); assert.equal(video.volume, 0.05); assert.equal(event.defaultPrevented, true);
  const primary = dom.window.document.querySelector('.pzp-pc video'); primary.muted = true;
  primary.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  assert.equal(primary.muted, true);
});

test('preview display honors hover delay and hide cancels the scheduled display', async t => {
  const { dom, preview, one, pending, response } = setup(t);
  const showing = preview.show(one.href, one);
  pending[0].resolve(response('https://images.invalid/one.jpg')); await showing;
  assert.equal(dom.window.document.querySelector('.knife-preview').hidden, true);
  preview.hide(); await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(dom.window.document.querySelector('.knife-preview').hidden, true);
});
