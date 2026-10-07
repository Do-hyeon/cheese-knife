const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t, html = playerHTML, url) {
  const dom = page(html, url);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  dom.window.document.documentElement.style.setProperty('--knife-chat-resize', '1');
  for (const file of ['web/runtime.js','web/site-adapter.js','web/audio.js','web/player.js']) load(dom, file);
  deliver(dom, { arrowSeek: true, hideDonation: false });
  load(dom, 'web/inject.js');
  return dom;
}

test('chat resize and player controls survive missing React controller and webpack', async t => {
  const html = playerHTML.replace('</main>', '<aside class="_container_chat_1"><div role="log"></div></aside></main>');
  const dom = setup(t, html);
  await flush();
  assert.equal(dom.window.document.querySelectorAll('.knife-resize-handle').length, 1);
  assert.equal(dom.window.document.querySelectorAll('.knife-ff').length, 1);
});

test('channel button is unique and generic nonchannel tablists remain unchanged', async t => {
  const html = '<div id="root"><div id="layout-body"><section><div role="tablist"><button>Videos</button></div></section></div></div>';
  const dom = setup(t, html, 'https://chzzk.naver.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  runtime(dom).reconcile(); runtime(dom).reconcile();
  await flush();
  assert.equal(dom.window.document.querySelectorAll('.knife-channel-chat').length, 1);
  dom.reconfigure({ url: 'https://chzzk.naver.com/following' });
  runtime(dom).reconcile(); await flush();
  assert.equal(dom.window.document.querySelectorAll('.knife-channel-chat').length, 0);
});
