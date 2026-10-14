const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('every first-party runtime file has a checked TypeScript generation entry', async () => {
  const settings = await import(pathToFileURL(path.resolve('scripts/settings-runtime.mjs')));
  const main = await import(pathToFileURL(path.resolve('scripts/main-runtime.mjs')));
  const entries = [...settings.SETTINGS_RUNTIME_ENTRIES, ...main.MAIN_RUNTIME_ENTRIES];
  const inventory = JSON.parse(await fs.readFile('tests/fixtures/f01-runtime-js.json', 'utf8'));
  assert.deepEqual(entries.map(entry => entry.output).sort(), inventory);
  for (const entry of entries) {
    assert.ok(entry.source.endsWith('.ts'));
    assert.ok((await fs.readFile(entry.source, 'utf8')).length > 0);
    assert.ok((await fs.readFile(entry.output, 'utf8')).startsWith(`// Generated from ${entry.source} by scripts/`));
  }
});

test('product TypeScript source graph has no any or type-check suppression', async () => {
  async function visit(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await visit(file);
      else if (item.name.endsWith('.ts')) {
        const source = await fs.readFile(file, 'utf8');
        assert.doesNotMatch(source, /@ts-(?:ignore|nocheck|expect-error)|\bany\b/, file);
      }
    }
  }
  await visit('src');
});
