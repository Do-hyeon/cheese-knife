const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t, vod = false, beforePlayer = () => {}) {
  const dom = page(vod ? playerHTML.replace('live_player_layout', 'player_layout') : playerHTML,
    vod ? 'https://chzzk.naver.com/video/123456' : undefined);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'web/runtime.js');
  deliver(dom, { arrowSeek: true, pressToFastForward: true });
  beforePlayer(dom);
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

test('native replacement of control children automatically restores owned controls', async t => {
  const dom = setup(t);
  dom.window.document.querySelector('.pzp-pc__bottom-buttons-left').innerHTML = '<button class="pzp-pc__playback-switch"></button><div class="pzp-pc__volume-control"></div>';
  await flush(); await flush();
  assert.equal(dom.window.document.querySelectorAll('.knife-ff').length, 1);
});

function nativeVOD(t, initiallyPaused) {
  const dom = setup(t, true, dom => {
    const video = dom.window.document.querySelector('video');
    let paused = initiallyPaused;
    Object.defineProperty(video, 'paused', { get: () => paused });
    video.play = async () => { paused = false; };
    video.pause = () => { paused = true; };
    // External player boundary: the native video click toggles playback. Keep
    // actual DOM propagation and the production hold controller intact.
    dom.window.document.querySelector('.pzp-pc').addEventListener('click', event => {
      if (event.target.closest('.pzp-pc__video')) paused ? video.play() : video.pause();
    });
  });
  const video = dom.window.document.querySelector('video');
  const target = dom.window.document.querySelector('.pzp-pc__video');
  const send = (type, destination = target, detail = type === 'click' ? 1 : 0) => {
    const event = new dom.window.MouseEvent(type, { button: 0, bubbles: true, cancelable: true, detail, clientX: 10, clientY: 10 });
    Object.defineProperty(event, 'pointerId', { value: 7 });
    destination.dispatchEvent(event); return event;
  };
  return { dom, video, target, send };
}

for (const paused of [false, true]) {
  test('completed VOD hold restores speed/play state and consumes its native click, paused=' + paused, async t => {
    const { dom, video, send } = nativeVOD(t, paused);
    video.playbackRate = 1.5;
    send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal(video.playbackRate, 2); assert.equal(video.paused, false);
    send('pointerup'); const click = send('click');
    assert.equal(video.playbackRate, 1.5); assert.equal(video.paused, paused);
    assert.equal(click.defaultPrevented, true);
    assert.equal(dom.window.document.querySelector('.knife-ff-indicator'), null);
    send('pointerdown'); send('pointerup'); const shortClick = send('click');
    assert.equal(shortClick.defaultPrevented, false);
    assert.equal(video.paused, !paused, 'a subsequent short click must still toggle playback');
  });
}

test('short VOD click remains native and keyboard clicks are not consumed by a completed hold', async t => {
  const { dom, video, send } = nativeVOD(t, true);
  send('pointerdown'); send('pointerup');
  assert.equal(send('click').defaultPrevented, false); assert.equal(video.paused, false);
  send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550)); send('pointerup');
  assert.equal(send('click', undefined, 0).defaultPrevented, false); assert.equal(video.paused, true);
  const button = dom.window.document.querySelector('.pzp-pc__playback-switch');
  assert.equal(send('click', button).defaultPrevented, false);
});

test('cancelled VOD hold restores speed without consuming a later click', async t => {
  const { video, send } = nativeVOD(t, false);
  video.playbackRate = 1.5;
  send('pointerdown'); await new Promise(resolve => setTimeout(resolve, 550)); send('pointercancel');
  assert.equal(video.playbackRate, 1.5); assert.equal(video.paused, false);
  assert.equal(send('click').defaultPrevented, false); assert.equal(video.paused, true);
});
