const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const expectedOrigins = ['https://chzzk.naver.com/*'];
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function permissionPage(t, { locale = 'ko', request } = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(fs.readFileSync('permission.html', 'utf8'), {
    url: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/permission.html',
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  t.after(() => dom.window.close());
  const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
  const calls = []; let closeCount = 0;
  dom.window.close = () => { closeCount++; };
  dom.window.chrome = {
    i18n: { getMessage: (key, substitution) => {
      let message = messages[key]?.message || '';
      if (substitution != null) message = message.replace('$HOST$', String(substitution));
      return message;
    } },
    permissions: { request: options => { calls.push(structuredClone(options)); return request ? request(options) : Promise.resolve(true); } },
  };
  for (const script of dom.window.document.querySelectorAll('script[src]')) dom.window.eval(fs.readFileSync(script.getAttribute('src'), 'utf8'));
  return { dom, calls, errors, closeCount: () => closeCount, grant: () => dom.window.document.getElementById('grant'),
    status: () => dom.window.document.getElementById('permission-status') };
}

test('click requests the exact host synchronously and grant closes once', async t => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const ui = permissionPage(t, { request: () => pending });
  assert.equal(ui.calls.length, 0, 'permission is never requested automatically');
  ui.grant().click();
  assert.deepEqual(ui.calls, [{ origins: expectedOrigins }], 'request must happen in the click stack');
  assert.equal(ui.grant().disabled, true); assert.match(ui.status().textContent, /확인/);
  resolve(true); await settle();
  assert.equal(ui.closeCount(), 1); assert.deepEqual(ui.errors, []);
});

test('a pending decision ignores repeated clicks', () => {
  const ui = permissionPage({ after() {} }, { request: () => new Promise(() => {}) });
  ui.grant().click(); ui.grant().click();
  assert.equal(ui.calls.length, 1); assert.equal(ui.grant().disabled, true); ui.dom.window.close();
});

test('denial keeps the page open and permits a later retry', async t => {
  const decisions = [false, true];
  const ui = permissionPage(t, { request: () => Promise.resolve(decisions.shift()) });
  ui.grant().click(); await settle();
  assert.equal(ui.closeCount(), 0); assert.equal(ui.grant().disabled, false);
  assert.match(ui.status().textContent, /허용되지 않았습니다/);
  ui.grant().click(); await settle();
  assert.equal(ui.calls.length, 2); assert.equal(ui.closeCount(), 1);
});

test('synchronous request failure is localized and retryable', async t => {
  const ui = permissionPage(t, { locale: 'en', request: () => { throw new Error('private detail'); } });
  ui.grant().click(); await settle();
  assert.equal(ui.closeCount(), 0); assert.equal(ui.grant().disabled, false);
  assert.equal(ui.status().textContent, 'Could not complete the permission request. Please try again.');
  assert.doesNotMatch(ui.status().textContent, /private detail/); assert.deepEqual(ui.errors, []);
});

test('rejected thenable is handled without an unhandled error', async t => {
  let omittedReject = false;
  const rejection = {
    then(resolve, reject) { if (reject) reject(new Error('private detail')); else omittedReject = true; },
  };
  const ui = permissionPage(t, { request: () => rejection });
  ui.grant().click(); await settle();
  assert.equal(omittedReject, false); assert.equal(ui.grant().disabled, false);
  assert.match(ui.status().textContent, /완료하지 못했습니다/); assert.deepEqual(ui.errors, []);
});
