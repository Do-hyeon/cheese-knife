const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const load=()=>import(pathToFileURL(path.resolve('scripts/extension-e2e/audio-product.mjs')));
const channel=(bytes=512)=>({encoding:'float32le',base64:Buffer.alloc(bytes,0xa5).toString('base64')});
const evidence=()=>({bytes:5120,packets:Array.from({length:2},()=>({channels:Array.from({length:5},()=>channel())}))});

test('first-discontinuity packet bytes share the original PCM cap, including overlapping frames',async()=>{
  const {productFailureEvidenceBytes}=await load();
  assert.equal(productFailureEvidenceBytes({}),0);
  assert.equal(productFailureEvidenceBytes({firstStreamFailureEvidence:null}),0);
  assert.equal(productFailureEvidenceBytes({firstStreamFailureEvidence:evidence()}),5120);
  assert.equal(productFailureEvidenceBytes({firstStreamFailureEvidence:{bytes:4,packets:[{channels:[channel(4)]}]}}),4);
});

test('failure evidence cannot understate bytes or exceed the fixed two-packet bound',async()=>{
  const {productFailureEvidenceBytes}=await load();
  const bad=[];
  for(const bytes of [0,NaN,5121])bad.push({...evidence(),bytes});
  bad.push({bytes:0,packets:[{channels:[]},{channels:[]},{channels:[]}]});
  bad.push({bytes:0,packets:[null]},{bytes:0,packets:[{channels:[null]}]});
  bad.push({bytes:0,packets:[{channels:Array.from({length:6},()=>channel())}]});
  bad.push({bytes:516,packets:[{channels:[channel(516)]}]});
  bad.push({bytes:3,packets:[{channels:[channel(3)]}]});
  bad.push({bytes:4,packets:[{channels:[{encoding:'float32le',base64:'!!!!'}]}]});
  bad.push({bytes:4,packets:[{channels:[{encoding:'float64le',base64:channel(4).base64}]}]});
  for(const value of bad)assert.throws(()=>productFailureEvidenceBytes({firstStreamFailureEvidence:value}),/failure-evidence/);
});
