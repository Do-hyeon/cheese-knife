const test = require('node:test');
const assert = require('node:assert/strict');
const { page, load, runtime, deliverScoped: deliver, playerHTML, clock } = require('./helpers.cjs');

function fixture(t, { modeKnown = true, noEffect = false } = {}) {
  const dom = page(playerHTML.replace('<div class="pzp-pc__volume-control"></div>',
    '<div class="pzp-pc__volume-control"></div><button class="pzp-pc__viewmode-button" aria-label="넓은 화면"></button>') +
    '<aside id="sidebar"><nav aria-label="팔로우"><div class="_header_test"><button id="fold" aria-expanded="true" aria-label="펼쳐짐, 접기"></button></div>' +
    '<ul><li>Live</li></ul><div class="_box_test"><button id="more" class="_more_button_test" aria-expanded="false">더보기</button></div></nav></aside>');
  const time = clock(dom), document = dom.window.document;
  const more = document.querySelector('#more'), fold = document.querySelector('#fold');
  if (!modeKnown) document.querySelector('.pzp-pc__viewmode-button').removeAttribute('aria-label');
  let clicks = 0;
  const hook = button => button.addEventListener('click', () => {
    clicks++; if (!noEffect) button.setAttribute('aria-expanded', button.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
  });
  hook(more);
  fold.addEventListener('click', () => {
    fold.setAttribute('aria-expanded', 'false'); fold.setAttribute('aria-label', '접힘, 펼치기');
    more.setAttribute('aria-expanded', 'false');
  });
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  deliver(dom, { expandFollowings: true }); load(dom, 'web/inject.js');
  t.after(() => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); dom.window.close(); });
  return { dom, document, more, fold, hook, clicks: () => clicks, advance: ms => time.advance(ms),
    mode: document.querySelector('.pzp-pc__viewmode-button'),
    changeList() { document.querySelector('nav[aria-label="팔로우"] li').textContent += '.'; },
  };
}

// Break caught: an immediate click can race native list hydration; only a
// continuously quiet following subtree earns automatic activation.
test('following activation waits for quiet native list rather than the first available button', async t => {
  const f = fixture(t); assert.equal(f.clicks(), 0);
  await f.advance(300); f.changeList(); await f.advance(499);
  assert.equal(f.clicks(), 0); assert.equal(f.more.getAttribute('aria-expanded'), 'false');
  await f.advance(1); assert.equal(f.clicks(), 1); assert.equal(f.more.getAttribute('aria-expanded'), 'true');
});

test('unrelated sidebar mutations cannot starve a settled following list', async t => {
  const f = fixture(t);
  await f.advance(300); f.document.querySelector('#sidebar').insertAdjacentHTML('beforeend', '<nav>Unrelated menu</nav>');
  runtime(f.dom).reconcile(); await f.advance(200);
  assert.equal(f.clicks(), 1);
});

test('a continuously changing native list expires without forcing a click', async t => {
  const f = fixture(t);
  for (let i = 0; i < 12; i++) { await f.advance(400); f.changeList(); }
  await f.advance(200); assert.equal(f.clicks(), 0);
  assert.equal(runtime(f.dom).statuses.expandFollowings.state, 'limited');
  await f.advance(2000); runtime(f.dom).reconcile(); await f.advance(600);
  assert.equal(f.clicks(), 0, 'deadline must not restart on later reconciliation');
});

test('manual section folding cancels scheduled automatic expansion', async t => {
  const f = fixture(t); await f.advance(300); f.fold.click(); await f.advance(1000);
  assert.equal(f.clicks(), 0); assert.equal(f.more.getAttribute('aria-expanded'), 'false');
  assert.equal(runtime(f.dom).statuses.expandFollowings.reason, 'user-collapsed');
});

test('manual More activation cancels the restoration even before native confirmation', async t => {
  const f = fixture(t); await f.advance(300);
  const replacement = f.more.cloneNode(true); f.more.replaceWith(replacement); // Native no-op click.
  let activations = 0; replacement.addEventListener('click', () => activations++);
  await f.advance(50); replacement.click(); await f.advance(1000);
  assert.equal(activations, 1, 'only the manual no-op activation, never an automatic second one');
  assert.equal(f.clicks(), 0, 'a manual no-op must not be followed by a queued automatic click');
  assert.equal(replacement.getAttribute('aria-expanded'), 'false');
});

for (const replaced of [false, true]) test('manual activation before mode discovery cancels first restoration, replacement=' + replaced, async t => {
  const f = fixture(t, { modeKnown: false, noEffect: true }); f.more.click();
  if (replaced) {
    const next = f.more.cloneNode(true); f.hook(next); f.more.replaceWith(next);
    const body = f.document.querySelector('#layout-body'); body.replaceWith(body.cloneNode(true)); runtime(f.dom).reconcile();
    f.mode = f.document.querySelector('.pzp-pc__viewmode-button');
  }
  await f.advance(100); f.mode.setAttribute('aria-label', '넓은 화면'); await f.advance(1000);
  assert.equal(f.clicks(), 1, 'only manual activation despite first mode confirmation');
  f.mode.setAttribute('aria-label', '좁은 화면'); await f.advance(20);
  f.mode.setAttribute('aria-label', '넓은 화면'); await f.advance(500);
  assert.equal(f.clicks(), 2, 'a subsequent confirmed screen restoration may activate once');
});

test('wide reversal cancels pending activation and a missing player is not normal mode', async t => {
  const f = fixture(t); await f.advance(300); f.mode.setAttribute('aria-label', '좁은 화면'); await f.advance(100);
  const player = f.document.querySelector('.pzp-pc'); const parent = player.parentElement;
  player.remove(); runtime(f.dom).reconcile(); await f.advance(1000);
  assert.equal(f.clicks(), 0);
  parent.append(player); runtime(f.dom).reconcile(); await f.advance(600); assert.equal(f.clicks(), 0);
  f.mode.setAttribute('aria-label', '넓은 화면'); await f.advance(499); assert.equal(f.clicks(), 0);
  await f.advance(1); assert.equal(f.clicks(), 1);
});

test('known wide to normal restoration rearms after an unknown gap without fresh manual input', async t => {
  const f = fixture(t, { modeKnown: false, noEffect: true }); f.more.click();
  f.mode.setAttribute('aria-label', '좁은 화면'); await f.advance(100);
  assert.equal(f.clicks(), 1);
  f.mode.removeAttribute('aria-label'); await f.advance(100);
  f.mode.setAttribute('aria-label', '넓은 화면'); await f.advance(500);
  assert.equal(f.clicks(), 2, 'known endpoints earn one restoration despite the intervening unknown sample');
});

for (const flushed of [false, true]) test('fresh manual input during unknown gap cancels rediscovered restoration, flushed=' + flushed, async t => {
  const f = fixture(t, { noEffect: true });
  f.mode.setAttribute('aria-label', '좁은 화면'); await f.advance(100);
  f.mode.removeAttribute('aria-label'); if (flushed) await f.advance(100);
  f.more.click(); f.mode.setAttribute('aria-label', '넓은 화면'); await f.advance(1000);
  assert.equal(f.clicks(), 1, 'only fresh manual no-op activation; rediscovery must not erase it');
  f.mode.setAttribute('aria-label', '좁은 화면'); await f.advance(20);
  f.mode.setAttribute('aria-label', '넓은 화면'); await f.advance(500);
  assert.equal(f.clicks(), 2, 'a later genuine reversal can rearm');
});

test('same known endpoint after an unknown gap does not rearm manual cancellation', async t => {
  const f = fixture(t, { noEffect: true }); f.more.click(); await f.advance(100);
  f.mode.removeAttribute('aria-label'); await f.advance(100);
  f.mode.setAttribute('aria-label', '넓은 화면'); await f.advance(1000);
  assert.equal(f.clicks(), 1, 'rediscovery alone must not replenish automatic activation');
});

test('control replacement restarts quiet observation but never extends its deadline', async t => {
  const f = fixture(t); let more = f.more;
  for (let i = 0; i < 12; i++) {
    await f.advance(400); const next = more.cloneNode(true); f.hook(next); more.replaceWith(next); more = next;
  }
  await f.advance(1000); assert.equal(f.clicks(), 0);
  assert.equal(runtime(f.dom).statuses.expandFollowings.state, 'limited');
});

test('owner replacement cancels old timers without renewing the observation deadline', async t => {
  const f = fixture(t);
  for (let i = 0; i < 12; i++) {
    await f.advance(400); const body = f.document.querySelector('#layout-body'); body.replaceWith(body.cloneNode(true));
    runtime(f.dom).reconcile();
  }
  await f.advance(1000); assert.equal(f.clicks(), 0);
  assert.equal(runtime(f.dom).statuses.expandFollowings.state, 'limited');
});

test('one automatic activation does not fight subsequent native collapse in the same restoration', async t => {
  const f = fixture(t); await f.advance(500); assert.equal(f.clicks(), 1);
  f.more.setAttribute('aria-expanded', 'false'); await f.advance(1000);
  assert.equal(f.clicks(), 1); assert.equal(f.more.getAttribute('aria-expanded'), 'false');
  f.mode.setAttribute('aria-label', '좁은 화면'); await f.advance(20);
  f.mode.setAttribute('aria-label', '넓은 화면'); await f.advance(500);
  assert.equal(f.clicks(), 2, 'a confirmed new screen restoration earns one new activation');
});

test('disablement and excluded navigation dispose pending following activation', async t => {
  const f = fixture(t); await f.advance(300); deliver(f.dom, { expandFollowings: false }, 2); await f.advance(1000);
  assert.equal(f.clicks(), 0);
  deliver(f.dom, { expandFollowings: true }, 3); await f.advance(300);
  f.dom.reconfigure({ url: 'https://chzzk.naver.com/settings/profile' }); runtime(f.dom).reconcile(); await f.advance(1000);
  assert.equal(f.clicks(), 0);
});

test('excluded navigation rearms following restoration on return to the same live route', async t => {
  const f = fixture(t); await f.advance(500);
  assert.equal(f.clicks(), 1); assert.equal(f.more.getAttribute('aria-expanded'), 'true');
  f.dom.reconfigure({ url: 'https://chzzk.naver.com/settings/profile' }); runtime(f.dom).reconcile();
  f.more.setAttribute('aria-expanded', 'false'); await f.advance(1000);
  f.dom.reconfigure({ url: 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }); runtime(f.dom).reconcile();
  await f.advance(500);
  assert.equal(f.clicks(), 2); assert.equal(f.more.getAttribute('aria-expanded'), 'true');
});

test('following OFF and ON while excluded clears a previous manual collapse', async t => {
  const f = fixture(t); await f.advance(500); f.more.click();
  assert.equal(f.clicks(), 2); assert.equal(f.more.getAttribute('aria-expanded'), 'false');
  f.dom.reconfigure({ url: 'https://chzzk.naver.com/settings/profile' }); runtime(f.dom).reconcile();
  deliver(f.dom, { expandFollowings: false }, 2); deliver(f.dom, { expandFollowings: true }, 3);
  f.dom.reconfigure({ url: 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }); runtime(f.dom).reconcile();
  await f.advance(500);
  assert.equal(f.clicks(), 3); assert.equal(f.more.getAttribute('aria-expanded'), 'true');
});

test('a timer cannot activate the old sidebar after silent SPA navigation before reconciliation', async t => {
  const f = fixture(t); await f.advance(300);
  f.dom.reconfigure({ url: 'https://chzzk.naver.com/settings/profile' });
  // The runtime's one-second route pulse has not run; the timer must recheck.
  await f.advance(1000); assert.equal(f.clicks(), 0);
});

test('bfcache suspension cancels pending activation and pageshow starts fresh quiet observation', async t => {
  const f = fixture(t); await f.advance(300);
  f.dom.window.dispatchEvent(new f.dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  await f.advance(1000); assert.equal(f.clicks(), 0);
  f.dom.window.dispatchEvent(new f.dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  await f.advance(499); assert.equal(f.clicks(), 0); await f.advance(1); assert.equal(f.clicks(), 1);
});
