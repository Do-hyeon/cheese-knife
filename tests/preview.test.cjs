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
