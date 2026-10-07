const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t, html = playerHTML, url) {
  const dom = page(html, url);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  dom.window.document.documentElement.style.setProperty('--knife-chat-resize', '1');
  dom.window.document.documentElement.style.setProperty('--knife-chat-timestamp', '1');
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

test('chat discovery recovers after bounded timeout and controller replacement', async t => {
  const dom = setup(t, playerHTML.replace('</main>', '<aside><div role="log"></div></aside></main>'));
  deliver(dom, { hideDonation: true }, 2);
  await new Promise(resolve => setTimeout(resolve, 2150));
  const chat = dom.window.document.querySelector('aside');
  const first = { messageFilter: function (message) { return this.allowed && message.type !== 99; }, allowed: true };
  const original = first.messageFilter;
  chat.__reactFiber$test = { memoizedState: { memoizedState: first, next: null }, return: null };
  runtime(dom).reconcile(); await flush();
  assert.equal(first.messageFilter({ type: 10 }), false);
  assert.equal(first.messageFilter({ type: 1 }), true);
  const second = { messageFilter: function () { return true; } };
  chat.__reactFiber$test.memoizedState.memoizedState = second;
  runtime(dom).reconcile(); await flush();
  assert.equal(first.messageFilter, original);
  assert.equal(second.messageFilter({ type: 10 }), false);
});

test('timestamp capability remains pending until supported message rows are observed', async t => {
  const dom = setup(t, playerHTML.replace('</main>', '<aside><div role="log"></div></aside></main>'));
  dom.window.document.documentElement.style.setProperty('--knife-chat-timestamp', '1');
  runtime(dom).reconcile(); await flush();
  assert.equal(runtime(dom).statuses.chatTimestamp.state, 'pending');
  const root = dom.window.document.querySelector('[role="log"]');
  const row = dom.window.document.createElement('div'); row.className = '_item_test';
  row.innerHTML = '<span class="_chatting_message_test"></span>';
  row.__reactProps$test = { chatMessage: { time: '2026-10-08T01:02:00Z' } };
  root.append(row); await flush();
  assert.equal(runtime(dom).statuses.chatTimestamp.state, 'ready');
  assert.match(row.firstElementChild.dataset.timestamp, /^\d\d:\d\d$/);
});

test('live start tooltip reads verified React metadata without a network request', async t => {
  const dom = setup(t);
  const node = dom.window.document.createElement('span'); node.className = 'video_information_count__test';
  node.__reactFiber$test = { memoizedState: { memoizedState: [{ openDate: '2026-10-08 10:00:00' }], next: null } };
  dom.window.document.getElementById('layout-body').append(node);
  node.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })); await flush();
  assert.match(node.dataset.knifeTooltip || '', /2026-10-08 10:00:00/);
});

test('VOD start tooltip rejects stale route metadata and foreign video links', async t => {
  const dom = setup(t);
  const body = dom.window.document.getElementById('layout-body');
  body.insertAdjacentHTML('beforeend', '<article><a href="/video/123">VOD</a><div><span class="video_card_item__test">Date</span></div></article>');
  let resolve; let calls = 0;
  dom.window.fetch = (url, options) => {
    assert.equal(url, 'https://api.chzzk.naver.com/service/v3/videos/123');
    assert.equal(options.credentials, 'include'); calls++;
    return new Promise(done => { resolve = done; });
  };
  const node = body.querySelector('span');
  node.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })); await flush();
  assert.equal(calls, 1);
  dom.reconfigure({ url: 'https://chzzk.naver.com/following' }); runtime(dom).reconcile();
  resolve({ ok: true, json: async () => ({ code: 200, content: { liveOpenDate: '2026-10-08 10:00:00' } }) }); await flush();
  assert.equal(node.dataset.knifeTooltip, undefined);
  body.querySelector('a').href = 'https://foreign.invalid/video/123';
  node.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })); await flush();
  assert.equal(calls, 1);
});

test('VOD start tooltip shows successful metadata and reuses bounded cache', async t => {
  const dom = setup(t);
  dom.window.document.getElementById('layout-body').insertAdjacentHTML('beforeend', '<article><a href="/video/123">VOD</a><div><span class="video_card_item__test">Date</span></div></article>');
  let calls = 0;
  dom.window.fetch = async () => { calls++; return { ok: true, json: async () => ({ code: 200, content: { liveOpenDate: '2026-10-08 10:00:00' } }) }; };
  const node = dom.window.document.querySelector('span');
  for (let i = 0; i < 2; i++) { node.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })); await flush(); }
  assert.match(node.dataset.knifeTooltip || '', /2026-10-08 10:00:00/); assert.equal(calls, 1);
});
