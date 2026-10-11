const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { ESLint } = require('eslint');
const { page, load, runtime, deliver, playerHTML, flush } = require('./helpers.cjs');

test('player controls use DOM SVG construction without an unsafe HTML assignment warning', async t => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.security.config.mjs' });
  const result = await lint.lintFiles(['web/player.js']);
  assert.equal(result.flatMap(file => file.messages).filter(message => message.ruleId === 'no-unsanitized/property').length, 0);
  const dom = page(playerHTML);
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  load(dom, 'web/runtime.js'); deliver(dom); load(dom, 'web/audio.js'); load(dom, 'web/player.js');
  runtime(dom).reconcile();
  for (const selector of ['.knife-ff', '.knife-comp button']) {
    const button = dom.window.document.querySelector(selector);
    assert.equal(button.type, 'button');
    assert.ok(button.getAttribute('aria-label'));
    const svg = button.querySelector('svg');
    assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(svg.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(svg.getAttribute('width'), '22');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.ok(svg.querySelector('path').getAttribute('d'));
  }
});

test('literal import validation retains multi-import behavior without an unsafe regex warning', async () => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.security.config.mjs' });
  const result = await lint.lintFiles(['scripts/check-package.mjs']);
  assert.equal(result.flatMap(file => file.messages).filter(message => message.ruleId === 'security/detect-unsafe-regex').length, 0);
});

test('HLS TAP summary parsing uses only fixed regular-expression boundaries', async () => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.security.config.mjs' });
  const result = await lint.lintFiles(['scripts/hls-verification.mjs']);
  const findings = result.flatMap(file => file.messages)
    .filter(message => message.ruleId === 'security/detect-non-literal-regexp');
  assert.deepEqual(findings.map(message => `${message.line}:${message.column}`), []);
});

test('webpack runtime callback remains functional without a Node dynamic-require warning', async t => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.security.config.mjs' });
  const result = await lint.lintFiles(['web/site-adapter.js']);
  assert.equal(result.flatMap(file => file.messages).filter(message => message.ruleId === 'security/detect-non-literal-require').length, 0);
  const dom = page();
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  const webpackLoader = () => 'fixture module';
  dom.window.webpackChunkglive_fe_pc = [];
  dom.window.webpackChunkglive_fe_pc.push = chunk => {
    const id = chunk[0][0];
    chunk[1][id](null, null, webpackLoader);
  };
  load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js');
  assert.equal(await runtime(dom).adapter.getWebpackRequire(), webpackLoader);
});

test('runtime dictionary boundaries have no generic object-injection observation', async () => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.security.config.mjs' });
  const result = await lint.lintFiles(['popup.js', 'web/main.js', 'web/player.js', 'web/runtime.js']);
  const findings = result.flatMap(file => file.messages)
    .filter(message => message.ruleId === 'security/detect-object-injection');
  assert.deepEqual(findings.map(message => `${message.line}:${message.column}`), []);
});

test('settings and compressor boundaries have no generic object-injection observation', async () => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.security.config.mjs' });
  const result = await lint.lintFiles(['settings-contract.js', 'web/audio.js']);
  const findings = result.flatMap(file => file.messages)
    .filter(message => message.ruleId === 'security/detect-object-injection');
  assert.deepEqual(findings.map(message => `${message.filePath}:${message.line}:${message.column}`), []);
});

test('deleted-chat array boundaries have no generic object-injection observation', async () => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.security.config.mjs' });
  const result = await lint.lintFiles(['web/inject.js']);
  const findings = result.flatMap(file => file.messages)
    .filter(message => message.ruleId === 'security/detect-object-injection');
  assert.deepEqual(findings.map(message => `${message.line}:${message.column}`), []);
});

test('development report boundaries have no generic object-injection observation', async () => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.security.config.mjs' });
  const result = await lint.lintFiles([
    'scripts/audio-metrics.mjs', 'scripts/check-audio-quality.mjs', 'scripts/check-store-popup.mjs',
    'scripts/check-video-filters.mjs', 'scripts/tool-audit.mjs',
  ]);
  const findings = result.flatMap(file => file.messages)
    .filter(message => message.ruleId === 'security/detect-object-injection');
  assert.deepEqual(findings.map(message => `${message.line}:${message.column}`), []);
});

test('owned file capability contains every remaining dynamic filesystem observation', async () => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.security.config.mjs', allowInlineConfig: false });
  const result = await lint.lintFiles(['scripts/owned-files.mjs']);
  const messages = result.flatMap(file => file.messages);
  assert.ok(messages.length > 0, 'the guarded dynamic filesystem boundary remains visible to the scanner');
  assert.equal(messages.every(message => message.ruleId === 'security/detect-non-literal-fs-filename'), true);
});

test('filesystem consumers delegate all dynamic paths to the owned capability', async () => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.security.config.mjs', allowInlineConfig: false });
  const result = await lint.lintFiles([
    'scripts/build.mjs', 'scripts/check-package.mjs', 'scripts/check-audio-quality.mjs',
    'scripts/check-preview-autoplay.mjs', 'scripts/check-store-popup.mjs', 'scripts/check-styles.mjs',
    'scripts/smoke-browser.mjs', 'scripts/tool-audit.mjs', 'scripts/verify-candidate.mjs',
    'scripts/check-installed-extension-negative.mjs', 'scripts/check-installed-extension.mjs',
    'scripts/extension-e2e/harness.mjs',
  ]);
  const findings = result.flatMap(file => file.messages)
    .filter(message => message.ruleId === 'security/detect-non-literal-fs-filename');
  assert.deepEqual(findings.map(message => `${message.line}:${message.column}`), []);
});
