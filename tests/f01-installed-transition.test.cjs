const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const subject=async()=>{
  assert.ok(fs.existsSync('scripts/extension-e2e/f01-transition.mjs'),'the approved F01 transition helper must exist');
  return import('../scripts/extension-e2e/f01-transition.mjs');
};

test('frozen F00 input is the exact committed 59-resource snapshot, never the current F01 or published payload',async()=>{
  const {readFrozenF00Payload}=await subject();
  const metadata=JSON.parse(fs.readFileSync('tests/fixtures/installed-extension/f00-payload.json','utf8'));
  const payload=readFrozenF00Payload(process.cwd(),metadata);
  assert.equal(payload.sourceCommit,'ae9f8e50a22dae9d549f1e476d302549ecc03b4a');
  assert.equal(payload.entries.length,59);assert.equal(payload.inventorySha256,metadata.inventorySha256);
  assert.ok(payload.entries.some(entry=>entry.name==='media-profiles.js'));
  assert.equal(payload.entries.some(entry=>entry.name==='gain-authority.js'),false);
  const manifest=JSON.parse(payload.entries.find(entry=>entry.name==='manifest.json').bytes.toString('utf8'));
  assert.equal(manifest.version,'2.13.3');assert.equal(manifest.manifest_version,3);
  for(const mutate of [m=>{m.sourceCommit='a'.repeat(40);},m=>{m.entries.pop();},m=>{m.entries[0].sha256='0'.repeat(64);},
    m=>{m.entries[0].name='../outside';},m=>{m.entries[1]=m.entries[0];},m=>{m.entries[0].bytes=0;}]){
    const changed=structuredClone(metadata);mutate(changed);
    assert.throws(()=>readFrozenF00Payload(path.resolve('.'),changed),/f01-f00-payload/);
  }
  assert.throws(()=>readFrozenF00Payload('.',metadata),/f01-f00-root/);
});
