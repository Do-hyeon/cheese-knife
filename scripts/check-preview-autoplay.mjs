// Fresh synthetic Chrome contexts; no user profile, extension installation,
// CHZZK account, real broadcast, audio capture, or browser-policy bypass.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const rootURL = 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const streamURL = 'https://media.invalid/silent-policy-probe.wav';
// A silent, ordinary audio track still exercises Chrome's audible-media policy.
// The PCM is synthesized here, never recorded from the user's computer.
const pcmLength = 8000 * 30 * 2;
const wave = Buffer.alloc(44 + pcmLength);
wave.write('RIFF', 0); wave.writeUInt32LE(36 + pcmLength, 4); wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32);
wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(pcmLength, 40);
await fs.mkdir('output/playwright', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const reports = [];
  const runtimeSource = await fs.readFile('web/runtime.js', 'utf8');
  const previewSource = await fs.readFile('web/preview.js', 'utf8');
  const css = await fs.readFile('web/main.css', 'utf8');
  for (const [locale, interact] of [['ko', false], ['en', false], ['ko', true]]) {
    const context = await browser.newContext({ viewport: { width: 700, height: 500 } });
    try {
      const messages = JSON.parse(await fs.readFile(`_locales/${locale}/messages.json`, 'utf8'));
      const translations = { previewAudioBlocked: messages.content_previewAudioBlocked.message, previewAudioRightClick: messages.content_previewAudioRightClick.message };
      // Normal parser scripts avoid Playwright's evaluate/userGesture=true.
      // The supposedly unactivated case must really remain unactivated.
      const bootstrap = `const r=window[Symbol.for('cheese-knife.runtime.v1')];
        window.dispatchEvent(new MessageEvent('message',{source:window,origin:location.origin,data:{namespace:'cheese-knife',protocol:1,type:'config',revision:1,requestId:r.requestId,
          config:{preview:true,livePreview:true,previewStartUnmuted:true,rightClickToUnmute:true,previewVolume:5,previewDelay:0.1,previewWidth:300},i18n:${JSON.stringify(translations)}}}));
        r.Hls={isSupported:()=>false};window.fetch=async()=>({ok:true,json:async()=>({code:200,content:{status:'OPEN',adult:false,livePlaybackJson:JSON.stringify({media:[{mediaId:'HLS',path:${JSON.stringify(streamURL)}}]})}})});`;
      const start = `const begin=()=>{const a=document.querySelector('#target');window[Symbol.for('cheese-knife.runtime.v1')].preview.show(a.href,a,true);};
        ${interact ? "document.querySelector('#activate').addEventListener('click',begin);" : 'setTimeout(begin,0);'}`;
      const html = `<html><head><meta charset="utf-8"><style>${css}</style></head><body><button id="activate">Synthetic interaction</button><aside id="sidebar"><a id="target" href="/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" style="display:block;width:180px;height:40px;margin:40px">Synthetic preview</a></aside><script src="/test-runtime.js"></script><script>${bootstrap}</script><script src="/test-preview.js"></script><script>${start}</script></body></html>`;
      // Fulfill every allowed request locally; abort all unrelated traffic.
      await context.route('**/*', route => route.request().url() === rootURL
        ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
        : route.request().url() === streamURL
          ? route.fulfill({ contentType: 'audio/wav', body: wave })
          : route.request().url() === 'https://chzzk.naver.com/test-runtime.js'
            ? route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: runtimeSource })
            : route.request().url() === 'https://chzzk.naver.com/test-preview.js'
              ? route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: previewSource }) : route.abort());
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(rootURL);
      const session = await context.newCDPSession(page);
      const read = async expression => (await session.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: false })).result.value;
      const nativeHls = await read("document.createElement('video').canPlayType('application/vnd.apple.mpegurl')");
      assert.ok(nativeHls, 'Chrome native-backend availability is required for this policy-only fixture');
      if (interact) await page.locator('#activate').click();
      const progressed = await read(`new Promise(resolve=>{const deadline=performance.now()+10000;const poll=()=>{const v=document.querySelector('.knife-preview-video');if(v&&!v.paused&&v.currentTime>0.2)resolve(true);else if(performance.now()>deadline)resolve(false);else setTimeout(poll,50);};poll();})`);
      assert.equal(progressed, true, 'native playback advances');
      const result = await read(`(() => {
        const v = document.querySelector('.knife-preview-video'), note = document.querySelector('.knife-preview-audio-note');
        const r = note.getBoundingClientRect(), panel = note.parentElement.getBoundingClientRect();
        return { muted: v.muted, volume: v.volume, paused: v.paused, time: v.currentTime,
          notice: !note.hidden, text: note.textContent, fits: note.hidden || r.left >= panel.left && r.right <= panel.right && r.top >= panel.top && r.bottom <= panel.bottom,
          userActivated: navigator.userActivation.hasBeenActive,
          status: window[Symbol.for('cheese-knife.runtime.v1')].statuses.livePreview };
      })()`);
      assert.equal(result.userActivated, interact);
      assert.deepEqual(errors, []); assert.equal(result.muted, !interact);
      assert.equal(result.volume, 0.05); assert.equal(result.notice, !interact); assert.equal(result.fits, true);
      assert.equal(result.status.state, 'ready');
      if (!interact) {
        assert.equal(result.text, messages.content_previewAudioBlocked.message + ' ' + messages.content_previewAudioRightClick.message);
        const clip = await read("(() => {const r=document.querySelector('.knife-preview').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()");
        const screenshot = await session.send('Page.captureScreenshot', { format: 'png', clip });
        await fs.writeFile(`output/playwright/preview-audio-blocked-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
        assert.equal(await read('navigator.userActivation.hasBeenActive'), false, 'capturing proof must not activate manual-unmute fixture');
        const target = await read("(() => {const r=document.querySelector('#target').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
        // Real right-button input, not evaluate/userGesture=true injection.
        await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...target });
        await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...target, button: 'right', clickCount: 1 });
        await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...target, button: 'right', clickCount: 1 });
        const manual = await read(`new Promise(resolve=>{const deadline=performance.now()+3000;const poll=()=>{const v=document.querySelector('.knife-preview-video'),n=document.querySelector('.knife-preview-audio-note');if(v&&!v.muted&&!v.paused&&n.hidden)resolve({muted:v.muted,paused:v.paused,notice:!n.hidden,userActivated:navigator.userActivation.hasBeenActive});else if(performance.now()>deadline)resolve({failed:true,muted:v?.muted,paused:v?.paused,notice:!n.hidden});else setTimeout(poll,50);};poll();})`);
        assert.equal(manual.failed, undefined, 'actual right-click enables sound and clears the notice');
        result.manualUnmute = manual;
      }
      reports.push({ locale, interactedWithSyntheticPage: interact, nativeHls, ...result });
      await read("window[Symbol.for('cheese-knife.runtime.v1')].preview.hide()");
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ browser: browser.version(), passed: reports.length, policyOnly: true, reports }, null, 2));
} finally { await browser.close(); }
