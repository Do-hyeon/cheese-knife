const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const negativeModule = () => import(pathToFileURL(path.resolve('scripts/check-installed-extension-negative.mjs')));

test('negative manifest mutation removes exactly one MAIN entry and preserves every other field', async () => {
  const { withoutMainContentScript } = await negativeModule();
  const manifest = {
    manifest_version: 3,
    name: 'fixture',
    content_scripts: [
      { matches: ['https://chzzk.naver.com/*'], js: ['web/main.js'] },
      { matches: ['https://chzzk.naver.com/*'], js: ['web/runtime.js'], world: 'MAIN' },
    ],
  };
  const mutated = withoutMainContentScript(manifest);
  assert.deepEqual(mutated, {
    manifest_version: 3,
    name: 'fixture',
    content_scripts: [{ matches: ['https://chzzk.naver.com/*'], js: ['web/main.js'] }],
  });
  assert.equal(manifest.content_scripts.length, 2);
  assert.throws(() => withoutMainContentScript({ content_scripts: [] }), { code: 'negative-main-entry-count' });
  assert.throws(() => withoutMainContentScript({ content_scripts: [{ world: 'MAIN' }, { world: 'MAIN' }] }), { code: 'negative-main-entry-count' });
});

test('negative runner accepts only the expected missing MAIN runtime failure', async () => {
  const { runInstalledExtensionNegative } = await negativeModule();
  const events = [];
  const dependencies = {
    prepareCandidate: async () => ({ candidate: { dist: path.resolve('negative-dist') }, cleanup: async () => { events.push('cleanup'); } }),
    runInstalled: async options => {
      events.push('run');
      assert.equal(typeof options.dependencies.verifyCandidate, 'function');
      assert.equal(options.dependencies.scenario.name, 'runBaseInstalledScenario');
      throw Object.assign(new Error('main-runtime-missing'), { code: 'main-runtime-missing' });
    },
    writeReport: async report => { events.push(`report:${report.observedFailure}`); },
  };
  const report = await runInstalledExtensionNegative({ runId: 'Negative1', headed: false, dependencies });
  assert.equal(report.ok, true);
  assert.equal(report.observedFailure, 'main-runtime-missing');
  assert.deepEqual(events, ['run', 'cleanup', 'report:main-runtime-missing']);
});

test('negative runner rejects an unexpected pass or any other failure code and still cleans', async () => {
  const { runInstalledExtensionNegative } = await negativeModule();
  for (const observed of ['pass', 'storage-setting-missing']) {
    let cleaned = 0;
    const dependencies = {
      prepareCandidate: async () => ({ candidate: { dist: path.resolve('negative-dist') }, cleanup: async () => { cleaned += 1; } }),
      runInstalled: async () => {
        if (observed === 'pass') return { ok: true };
        throw Object.assign(new Error(observed), { code: observed });
      },
      writeReport: async () => {},
    };
    await assert.rejects(runInstalledExtensionNegative({ runId: 'Negative1', headed: false, dependencies }), {
      code: observed === 'pass' ? 'negative-control-unexpected-pass' : 'negative-control-unexpected-failure',
    });
    assert.equal(cleaned, 1, observed);
  }
});

test('negative retention validates before preparation and preserves cleanup errors as failures',async()=>{
  const {runInstalledExtensionNegative}=await negativeModule();
  await assert.rejects(runInstalledExtensionNegative({runId:'Invalid',retainEvidence:'yes',dependencies:{prepareCandidate:async()=>{throw Error('must-not-prepare');}}}),{code:'installed-e2e-retention-invalid'});
  const expected=Object.assign(Error('main-runtime-missing'),{code:'main-runtime-missing'});
  await assert.rejects(runInstalledExtensionNegative({runId:'Cleanup',dependencies:{prepareCandidate:async()=>({candidate:{},cleanup:async()=>{throw Error('cleanup-failed');}}),runInstalled:async()=>{throw expected;},writeReport:async()=>{throw Error('must-not-pass');}}}),error=>error.code==='negative-control-unexpected-failure'&&error.cause===expected);
});

for(const retainEvidence of [false,true])test(`negative final writer preserves MAIN failure and evidence when retention=${retainEvidence}`,async()=>{
  const {runInstalledExtensionNegative}=await negativeModule(),original=Object.assign(Error('main-runtime-missing'),{code:'main-runtime-missing',evidence:{candidatePath:'owned-candidate'}});
  const writer=Object.assign(Error('writer-failed'),{code:'EIO'});
  await assert.rejects(runInstalledExtensionNegative({runId:'WriterFailure',retainEvidence,dependencies:{
    prepareCandidate:async()=>({candidate:{},cleanup:async()=>{}}),runInstalled:async()=>{throw original;},writeReport:async()=>{throw writer;}
  }}),error=>{
    assert.equal(error.cause,original);assert.equal(error.report.ok,false);assert.equal(error.report.observedFailure,'main-runtime-missing');
    assert.equal(error.report.secondaryErrors[0].code,'EIO');
    if(retainEvidence)assert.equal(error.report.evidence.candidatePath,'owned-candidate');return true;
  });
});

for(const retainEvidence of [false,true])test(`negative preparation copy failure owns and retains only its new partials when retention=${retainEvidence}`,async t=>{
  const fs=require('node:fs/promises'),{runInstalledExtensionNegative}=await negativeModule(),runId='NegativeCopy'+String(retainEvidence);
  const candidate=path.resolve('output/tool-audit/p02-candidate-'+runId),negative=path.resolve('output/playwright/installed-negative-package-'+runId);
  t.after(async()=>{await fs.rm(candidate,{recursive:true,force:true});await fs.rm(negative,{recursive:true,force:true});});
  const sentinel=Error('negative-copy-sentinel'),copy=fs.copyFile;
  const mock=t.mock.method(fs,'copyFile',async(...args)=>{if(String(args[1]).startsWith(negative)&&String(args[1]).endsWith('manifest.json'))throw sentinel;return copy.apply(fs,args);});
  await assert.rejects(runInstalledExtensionNegative({runId,retainEvidence,dependencies:{runInstalled:async()=>{throw Error('must-not-launch');}}}),error=>error===sentinel);mock.mock.restore();
  if(retainEvidence){assert.ok((await fs.lstat(candidate)).isDirectory());assert.ok((await fs.lstat(negative)).isDirectory());}
  else{await assert.rejects(fs.access(candidate),{code:'ENOENT'});await assert.rejects(fs.access(negative),{code:'ENOENT'});}
});
