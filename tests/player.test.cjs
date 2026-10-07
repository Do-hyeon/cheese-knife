const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t, vod = false) {
  const dom = page(vod ? playerHTML.replace('live_player_layout', 'player_layout') : playerHTML,
    vod ? 'https://chzzk.naver.com/video/123456' : undefined);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'web/runtime.js');
  deliver(dom, { arrowSeek: true, pressToFastForward: true });
  load(dom, 'web/player.js');
  return dom;
}
const ranges = values => ({ length: values.length, start: index => values[index][0], end: index => values[index][1] });

test('Vue-free live controls mount once and do not seek an empty buffer', t => {
  const dom = setup(t);
  runtime(dom).reconcile(); runtime(dom).reconcile();
  assert.equal(dom.window.document.querySelectorAll('.knife-ff').length, 1);
  dom.window.document.querySelector('.knife-ff').click();
  assert.equal(dom.window.document.querySelector('video').currentTime, 0);
});

test('live seeking clamps gaps and supports finite live duration', t => {
  const dom = setup(t);
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'seekable', { value: ranges([[10,20],[30,40]]) });
  Object.defineProperty(video, 'duration', { value: 40 });
  video.currentTime = 19;
  runtime(dom).player.seek(false);
  assert.equal(video.currentTime, 30);
  dom.window.document.querySelector('.knife-ff').click();
  assert.equal(video.currentTime, 39.95);
});

test('editable descendants and sliders retain arrow keys', t => {
  const dom = setup(t);
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'seekable', { value: ranges([[0,100]]) });
  video.currentTime = 50;
  dom.window.document.body.insertAdjacentHTML('beforeend', '<div contenteditable="true"><span id="typing">text</span></div><input id="slider" type="range">');
  for (const id of ['typing','slider']) {
    dom.window.document.getElementById(id).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  }
  assert.equal(video.currentTime, 50);
});

test('quick VOD release preserves original user speed', async t => {
  const dom = setup(t, true);
  const video = dom.window.document.querySelector('video');
  video.playbackRate = 1.5;
  const target = dom.window.document.querySelector('.pzp-pc__video');
  target.dispatchEvent(new dom.window.MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: 10, clientY: 10 }));
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { button: 0, bubbles: true }));
  await flush();
  assert.equal(video.playbackRate, 1.5);
});
