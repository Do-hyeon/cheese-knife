const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

function setup(t) {
  const dom = page(playerHTML + '<aside id="sidebar"><a id="one" href="/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb">One</a><a id="two" href="/live/cccccccccccccccccccccccccccccccc">Two</a></aside>');
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  const pending = [];
  dom.window.fetch = (_url, options) => new Promise(resolve => pending.push({ resolve, options }));
  for (const anchor of dom.window.document.querySelectorAll('a')) anchor.getBoundingClientRect = () => ({ left: 20, right: 120, top: 30, bottom: 50, width: 100, height: 20 });
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js'); deliver(dom, { preview: true, livePreview: false, previewWidth: 400, previewDelay: 0.1, previewVolume: 5 });
  load(dom, 'web/preview.js');
  const response = image => ({ ok: true, json: async () => ({ code: 200, content: { status: 'OPEN', liveImageUrl: image, livePlaybackJson: '{}' } }) });
  return { dom, preview: runtime(dom).preview, pending, response, one: dom.window.document.getElementById('one'), two: dom.window.document.getElementById('two') };
}

function enableStream(dom, destroyed) {
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.HTMLMediaElement.prototype.load = () => {};
  runtime(dom).Hls = class {
    static isSupported() { return true; }
    static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest' };
    constructor() { this.levels = []; }
    on() {} loadSource() {} attachMedia() {} startLoad() {} recoverMediaError() {}
    destroy() { destroyed.count++; }
  };
}

const streamResponse = () => ({ ok: true, json: async () => ({ code: 200, content: { status: 'OPEN', adult: false,
  livePlaybackJson: JSON.stringify({ media: [{ mediaId: 'HLS', path: 'https://media.invalid/master.m3u8' }] }) } }) });

test('duplicate install preserves an existing preview controller', t => {
  const dom = page(playerHTML + '<aside id="sidebar"></aside>');
  t.after(() => dom.window.close());
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js'); deliver(dom, { preview: true });
  const existing = { diagnostics: { events: [] }, show: async () => {}, hide: () => {} };
  runtime(dom).preview = existing;
  load(dom, 'web/preview.js');
  assert.equal(runtime(dom).preview, existing);
  assert.equal(dom.window.document.querySelector('.knife-preview'), null);
});

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

for (const invalidation of ['route', 'sidebar-owner']) {
  test(`displayed preview closes when its ${invalidation} identity changes`, async t => {
    const { dom, preview, pending, response, one } = setup(t);
    const showing = preview.show(one.href, one, true);
    pending[0].resolve(response('https://images.invalid/a.jpg')); await showing;
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(dom.window.document.querySelector('.knife-preview').hidden, false);
    if (invalidation === 'route') dom.window.history.pushState({}, '', '/live/dddddddddddddddddddddddddddddddd');
    else runtime(dom).state.sidebar = dom.window.document.createElement('aside');
    runtime(dom).notify();
    assert.equal(dom.window.document.querySelector('.knife-preview').hidden, true);
  });
}

test('untrusted hrefs do not request an API or create media', async t => {
  const { preview, pending, one } = setup(t);
  await preview.show('https://external.invalid/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', one, true);
  assert.equal(pending.length, 0);
});

for (const field of ['content', 'status']) test(`live-detail ${field} accessors are rejected without invocation`, async t => {
  const { dom, preview, pending, one } = setup(t);
  let reads = 0;
  const content = { adult: false, livePlaybackJson: '{}' };
  if (field === 'status') Object.defineProperty(content, 'status', { get() { reads++; return 'OPEN'; } });
  else content.status = 'OPEN';
  const body = { code: 200 };
  if (field === 'content') Object.defineProperty(body, 'content', { get() { reads++; return content; } });
  else body.content = content;
  const showing = preview.show(one.href, one, true);
  pending[0].resolve({ ok: true, json: async () => body }); await showing;
  assert.equal(reads, 0);
  assert.equal(dom.window.document.querySelector('.knife-preview'), null);
  assert.equal(runtime(dom).statuses.livePreview.reason, 'live-detail-unavailable');
});

test('oversized playback JSON is rejected before media creation', async t => {
  const { dom, preview, pending, one } = setup(t);
  deliver(dom, { preview: true, livePreview: true, previewDelay: 0.1 }, 2);
  const playback = JSON.stringify({ media: [{ mediaId: 'HLS', path: 'https://media.invalid/master.m3u8' }], padding: 'x'.repeat(1024 * 1024) });
  const showing = preview.show(one.href, one, true);
  pending[0].resolve({ ok: true, json: async () => ({ code: 200, content: { status: 'OPEN', adult: false, livePlaybackJson: playback } }) });
  await showing;
  assert.equal(dom.window.document.querySelector('.knife-preview-video'), null);
  assert.equal(runtime(dom).statuses.livePreview.reason, 'stream-unavailable');
});

for (const status of [401, 403]) test(`live-detail HTTP ${status} remains limited without playback`, async t => {
  const { dom, preview, pending, one } = setup(t);
  const showing = preview.show(one.href, one, true);
  pending[0].resolve({ ok: false, status, json: async () => { throw new Error('must not parse'); } }); await showing;
  assert.equal(dom.window.document.querySelector('.knife-preview'), null);
  assert.equal(runtime(dom).statuses.livePreview.reason, 'live-detail-unavailable');
});

test('live-detail cache evicts the oldest entry at 101 channels', async t => {
  const { dom, preview } = setup(t);
  const sidebar = dom.window.document.getElementById('sidebar');
  let requests = 0;
  dom.window.fetch = async () => { requests++; return { ok: true, json: async () => ({ code: 200, content: { status: 'CLOSE', adult: false, livePlaybackJson: '{}' } }) }; };
  const anchors = [];
  for (let index = 0; index < 101; index++) {
    const anchor = dom.window.document.createElement('a');
    anchor.href = `/live/${index.toString(16).padStart(32, '0')}`;
    anchor.getBoundingClientRect = () => ({ left: 20, right: 120, top: 30, bottom: 50, width: 100, height: 20 });
    sidebar.append(anchor); anchors.push(anchor);
    await preview.show(anchor.href, anchor, true); preview.hide();
  }
  assert.equal(requests, 101);
  await preview.show(anchors[0].href, anchors[0], true);
  assert.equal(requests, 102);
});

for (const invalidation of ['panel-removal', 'visibility-hidden']) test(`${invalidation} disposes only the active preview session`, async t => {
  const { dom, preview, pending, one } = setup(t);
  const destroyed = { count: 0 }; enableStream(dom, destroyed);
  deliver(dom, { preview: true, livePreview: true, previewDelay: 0.1 }, 2);
  const showing = preview.show(one.href, one, true); pending[0].resolve(streamResponse()); await showing;
  assert.ok(dom.window.document.querySelector('.knife-preview-video'));
  if (invalidation === 'panel-removal') dom.window.document.querySelector('.knife-preview').remove();
  else {
    Object.defineProperty(dom.window.document, 'hidden', { configurable: true, value: true });
    dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
  }
  await flush();
  assert.equal(destroyed.count, 1);
  assert.equal(dom.window.document.querySelector('.knife-preview-video'), null);
});

test('persisted pagehide clears media but keeps the controller; final pagehide is idempotent', async t => {
  const { dom, preview, pending, one, two } = setup(t);
  const destroyed = { count: 0 }; enableStream(dom, destroyed);
  deliver(dom, { preview: true, livePreview: true, previewDelay: 0.1 }, 2);
  const first = preview.show(one.href, one, true); pending[0].resolve(streamResponse()); await first;
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(destroyed.count, 1); assert.equal(runtime(dom).preview, preview);
  const second = preview.show(two.href, two, true); pending[1].resolve(streamResponse()); await second;
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
  assert.equal(destroyed.count, 2);
  assert.equal(dom.window[dom.window.Symbol.for('cheese-knife.runtime.v1')]?.preview, undefined);
});

test('a throwing status sink cannot abort preview setup or cleanup', async t => {
  const { dom, preview, pending, one } = setup(t);
  const destroyed = { count: 0 }; enableStream(dom, destroyed);
  deliver(dom, { preview: true, livePreview: true, previewDelay: 0.1 }, 2);
  runtime(dom).setStatus = () => { throw new Error('status-sink-failed'); };
  const showing = preview.show(one.href, one, true); pending[0].resolve(streamResponse());
  await assert.doesNotReject(showing);
  assert.ok(dom.window.document.querySelector('.knife-preview-video'));
  assert.doesNotThrow(() => preview.hide());
  assert.equal(destroyed.count, 1);
});

for (const phase of ['fetch', 'preload', 'displayed']) {
  test(`disabling sidebar preview cancels its ${phase} even with a legacy custom-preview flag`, async t => {
    const { dom, preview, pending, one } = setup(t);
    dom.window.HTMLMediaElement.prototype.pause = () => {};
    dom.window.HTMLMediaElement.prototype.load = () => {};
    let destroyed = 0;
    runtime(dom).Hls = class {
      static isSupported() { return true; }
      static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest' };
      on() {} loadSource() {} attachMedia() {} destroy() { destroyed++; }
    };
    const config = { preview: true, customPreview: true, livePreview: true, previewDelay: 0.1 };
    deliver(dom, config, 2);
    const showing = preview.show(one.href, one, true);
    const response = { ok: true, json: async () => ({ code: 200, content: { status: 'OPEN', livePlaybackJson: JSON.stringify({ media: [{ mediaId: 'HLS', path: 'https://media.invalid/master.m3u8' }] }) } }) };
    if (phase !== 'fetch') { pending[0].resolve(response); await showing; }
    if (phase === 'displayed') { await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(dom.window.document.querySelector('.knife-preview').hidden, false); }
    deliver(dom, { ...config, preview: false }, 3);
    assert.equal(pending[0].options.signal.aborted, true);
    if (phase === 'fetch') { pending[0].resolve(response); await showing; }
    await flush();
    assert.equal(destroyed, phase === 'fetch' ? 0 : 1);
    assert.equal(dom.window.document.querySelector('.knife-preview-video'), null);
    assert.equal(dom.window.document.querySelector('.knife-preview')?.hidden ?? true, true);
  });
}

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

test('native thumbnail right-click is not intercepted or modified by the extension', t => {
  const { dom } = setup(t);
  deliver(dom, { customPreview: false, rightClickToUnmute: true, previewVolume: 5 }, 2);
  const body = dom.window.document.getElementById('layout-body');
  body.insertAdjacentHTML('beforeend', '<a href="/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" id="native-card"><video muted></video></a>');
  const video = dom.window.document.querySelector('#native-card video'); video.muted = true; video.volume = 0.7;
  const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  video.dispatchEvent(event);
  assert.equal(video.muted, true); assert.equal(video.volume, 0.7); assert.equal(event.defaultPrevented, false);
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

function clockPreview(dom) {
  let now=0, sequence=0;
  const timers=new Map();
  dom.window.Date.now=()=>now;
  dom.window.setTimeout=(callback,delay=0)=>{const id=++sequence;timers.set(id,{at:now+delay,callback});return id;};
  dom.window.clearTimeout=id=>timers.delete(id);
  return time=>{now=time;for(let count=0;count<100;count++){
    const next=[...timers].filter(([,timer])=>timer.at<=now).sort((a,b)=>a[1].at-b[1].at)[0];
    if(!next)return;timers.delete(next[0]);next[1].callback();
  }throw new Error('timer loop');};
}

test('metadata latency consumes hover delay instead of starting an additional full delay', async t => {
  const {dom,preview,one,pending,response}=setup(t);
  const tick=clockPreview(dom);
  const showing=preview.show(one.href,one,true);
  tick(75);pending[0].resolve(response('https://images.invalid/one.jpg'));await showing;
  assert.equal(dom.window.document.querySelector('.knife-preview').hidden,true);
  tick(99);assert.equal(dom.window.document.querySelector('.knife-preview').hidden,true);
  tick(100);assert.equal(dom.window.document.querySelector('.knife-preview').hidden,false);
});

test('stream prepares during remaining hover delay and leaving disposes the preloaded graph', async t => {
  const {dom,preview,one,pending}=setup(t);
  dom.window.HTMLMediaElement.prototype.pause=()=>{};
  dom.window.HTMLMediaElement.prototype.load=()=>{};
  let attached=0,destroyed=0;
  runtime(dom).Hls=class{static isSupported(){return true;}static Events={ERROR:'error',MANIFEST_PARSED:'manifest'};
    on(){}loadSource(){}attachMedia(){attached++;}destroy(){destroyed++;}};
  deliver(dom,{preview:true,livePreview:true,previewDelay:0.1},2);
  const tick=clockPreview(dom),showing=preview.show(one.href,one,true);
  tick(25);pending[0].resolve({ok:true,json:async()=>({code:200,content:{status:'OPEN',livePlaybackJson:JSON.stringify({media:[{mediaId:'HLS',path:'https://media.invalid/master.m3u8'}]})}})});
  await showing;
  assert.equal(attached,1);
  assert.equal(dom.window.document.querySelector('.knife-preview').hidden,true);
  preview.hide();tick(200);
  assert.equal(destroyed,1);assert.equal(dom.window.document.querySelector('.knife-preview-video'),null);
  assert.equal(dom.window.document.querySelector('.knife-preview').hidden,true);
});

test('metadata arriving after the hover deadline does not add another configured wait', async t => {
  const {dom,preview,one,pending,response}=setup(t),tick=clockPreview(dom);
  const showing=preview.show(one.href,one,true);
  tick(150);pending[0].resolve(response('https://images.invalid/one.jpg'));await showing;tick(150);
  assert.equal(dom.window.document.querySelector('.knife-preview').hidden,false);
});

test('cached re-entry still waits its own hover delay without another API request', async t => {
  const {dom,preview,one,pending,response}=setup(t),tick=clockPreview(dom);
  const first=preview.show(one.href,one,true);
  tick(75);pending[0].resolve(response('https://images.invalid/one.jpg'));await first;tick(100);
  preview.hide();tick(200);await preview.show(one.href,one,true);
  assert.equal(pending.length,1);
  tick(299);assert.equal(dom.window.document.querySelector('.knife-preview').hidden,true);
  tick(300);assert.equal(dom.window.document.querySelector('.knife-preview').hidden,false);
});

test('an authenticated age-restricted stream prepares media when the API returns HLS playback', async t => {
  const {dom,preview,one,pending}=setup(t);
  dom.window.HTMLMediaElement.prototype.pause=()=>{};
  dom.window.HTMLMediaElement.prototype.load=()=>{};
  let attached=0;
  runtime(dom).Hls=class{static isSupported(){return true;}static Events={ERROR:'error',MANIFEST_PARSED:'manifest'};
    on(){}loadSource(){}attachMedia(){attached++;}destroy(){}};
  deliver(dom,{preview:true,livePreview:true,previewDelay:0.1},2);
  const tick=clockPreview(dom),showing=preview.show(one.href,one,true);
  pending[0].resolve({ok:true,json:async()=>({code:200,content:{status:'OPEN',adult:true,livePlaybackJson:JSON.stringify({media:[{mediaId:'HLS',path:'https://media.invalid/master.m3u8'}]})}})});
  await showing;tick(100);
  assert.equal(dom.window.document.querySelector('.knife-preview').hidden,false);
  assert.equal(attached,1);
  assert.ok(dom.window.document.querySelector('.knife-preview-video'));
  assert.notEqual(runtime(dom).statuses.livePreview.reason,'age-restricted-stream');
});

test('an age-restricted stream without returned playback stays thumbnail-only and limited', async t => {
  const {dom,preview,one,pending}=setup(t);
  deliver(dom,{preview:true,livePreview:true,previewDelay:0.1},2);
  const tick=clockPreview(dom),showing=preview.show(one.href,one,true);
  pending[0].resolve({ok:true,json:async()=>({code:200,content:{status:'OPEN',adult:true,livePlaybackJson:'{}'}})});
  await showing;tick(100);
  assert.equal(dom.window.document.querySelector('.knife-preview').hidden,false);
  assert.equal(dom.window.document.querySelector('.knife-preview-video'),null);
  assert.equal(runtime(dom).statuses.livePreview.reason,'age-restricted-stream');
});
