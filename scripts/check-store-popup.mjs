// Fresh synthetic profile only. No extension installation, store/dashboard,
// user account, browser profile, settings, broadcasts or uploads are accessed.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const css = await fs.readFile('popup.css', 'utf8');
  const html = (await fs.readFile('popup.html', 'utf8'))
    .replace(/<link[^>]+href="popup.css"[^>]*>/, `<style>${css}</style>`)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  const reports = [];
  for (const locale of ['ko', 'en']) {
    // A new document/page avoids redeclaring classic-script lexical globals
    // from the previous language; setContent alone keeps its JS context.
    const page = await browser.newPage({ viewport: { width: 350, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(html);
    const messages = JSON.parse(await fs.readFile(`_locales/${locale}/messages.json`, 'utf8'));
    await page.evaluate(messages => {
      window.chrome = {
        i18n: { getMessage: key => messages[key]?.message || '' },
        storage: { local: { get: async defaults => defaults, set: async () => {} } },
        tabs: { query: async () => [{ id: 1 }], sendMessage: async () => ({ statuses: {} }) },
      };
    }, messages);
    for (const file of ['config.js', 'popup.js']) await page.addScriptTag({ content: await fs.readFile(file, 'utf8') });
    assert.deepEqual(errors, [], 'production popup scripts run without page errors in ' + locale);
    await page.locator('#preview').waitFor({ state: 'attached', timeout: 5000 });
    const result = await page.evaluate(() => {
      const footer = document.querySelector('footer');
      const links = [...footer.querySelectorAll('a')];
      const box = footer.getBoundingClientRect();
      return {
        title: document.title, width: document.body.getBoundingClientRect().width,
        footerWidth: box.width, labels: links.map(a => a.textContent),
        fits: links.every(a => { const r = a.getBoundingClientRect(); return r.width > 0 && r.left >= box.left && r.right <= box.right + 1; }),
      };
    });
    assert.equal(result.width, 350);
    assert.equal(result.labels.length, 4);
    assert.equal(result.fits, true, 'localized footer cannot clip links at the native popup width');
    reports.push({ locale, ...result });
    await page.close();
  }
  console.log(JSON.stringify({ browser: browser.version(), checks: reports.length, passed: reports.length, reports }, null, 2));
} finally {
  await browser.close();
}
