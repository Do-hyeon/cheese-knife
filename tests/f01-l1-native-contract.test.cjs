const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const mod=file=>import(pathToFileURL(path.resolve(file)));
test('L1 package exposes exactly its fixed local worklet and no additional host/API permissions',async()=>{
  const manifest=JSON.parse(await fs.readFile("extension/manifest.json",'utf8'));
  assert.deepEqual(manifest.web_accessible_resources,[{resources:['web/audio-transition-worklet.js'],matches:['https://chzzk.naver.com/*']}]);
  assert.deepEqual(manifest.permissions,['scripting','storage']);assert.deepEqual(manifest.host_permissions,['https://chzzk.naver.com/*']);
  const {manifestFiles}=await mod('scripts/check-package.mjs');assert.ok(manifestFiles(manifest).has('web/audio-transition-worklet.js'));
  for(const bad of [{resources:['../payload.js'],matches:['https://chzzk.naver.com/*']},{resources:['web/audio-transition-worklet.js'],matches:['<all_urls>']}]){
    assert.throws(()=>manifestFiles({...manifest,web_accessible_resources:[bad]}));
  }
});
test('worklet is a separate deterministic import-free generated entry while classic MAIN remains six',async()=>{
  const main=await mod('scripts/main-runtime.mjs');assert.equal(typeof main.renderAudioWorklet,'function','local worklet generator is required');
  const one=await main.renderAudioWorklet(),two=await main.renderAudioWorklet();assert.deepEqual(one,two);assert.equal(main.MAIN_RUNTIME_ENTRIES.length,6);
  assert.deepEqual(Object.keys(one),['web/audio-transition-worklet.js']);assert.doesNotMatch(one['web/audio-transition-worklet.js'],/\bimport\s|\bexport\s|\beval\s*\(|sourceMappingURL|https?:\/\//);
  await main.checkAudioWorklet();
});
test('sealed L1 CLI cannot select its old run ID, another rate, or silently start a broader run',async()=>{
  const runner=await mod('scripts/check-audio-processing.mjs');
  assert.throws(()=>runner.parseAudioProcessingArgs(['--run-id=F01L1Clock20261018','--qualification=l1']),/audio-qualification-sealed/);
  for(const runId of ['F01L1Clock20261018','F01L1Clock20261018R48'])assert.throws(()=>runner.parseAudioProcessingArgs(['--run-id='+runId]),/audio-qualification-sealed/);
  assert.throws(()=>runner.parseAudioProcessingArgs(['--run-id=FixturePriorRun','--qualification=l1']));
  assert.throws(()=>runner.parseAudioProcessingArgs(['--run-id=Other','--qualification=l1']));
  assert.throws(()=>runner.parseAudioProcessingArgs(['--run-id=F01L1Clock20261018','--qualification=l1','--rate=96000']));
});

function observation(){
  const start=0,end=140800,accepted=[128,73472,92160],completed=accepted.map(n=>n+1728),streams=[];
  const ramp=(n,start,length,from,to)=>from+(to-from)*Math.max(0,Math.min(1,(n-start)/length));
  const q=n=>n<accepted[1]?ramp(n,128,480,0,1):n<accepted[2]?ramp(n,accepted[1]+960+288,480,1,0):ramp(n,accepted[2],480,0,1);
  const g=n=>n<accepted[1]?ramp(n,128+480,960,1,1.32):n<accepted[2]?ramp(n,accepted[1],960,1.32,1):ramp(n,accepted[2]+480,960,1,1.32);
  for(const count of [2,2,5]){
    const bytes=Buffer.alloc(end*count*4);
    for(let n=0;n<end;n++){
      for(let c=0;c<count;c++)bytes.writeFloatLE(count===5?[-q(n),q(n),g(n-288),1,0][c]:.1*Math.sin(2*Math.PI*250*(count===2&&streams.length===0?n-288:n)/48000+.37),(n*count+c)*4);
    }
    streams.push({start,end,channels:count,encoding:'interleaved-float32le',base64:bytes.toString('base64')});
  }
  return {sampleRate:48000,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',sourceFrame:0,captureStartFrame:0,streams,
    commands:accepted.map((frame,i)=>({requestedFrame:frame-64,mediaTime:frame/48000,message:{kind:'configure',sourceEpoch:1,seq:i+1,wanted:i!==1,gain:1.32,eq:[0,0,0,-6,-6,-6,-6,-6],normalizer:false}})),
    replies:accepted.flatMap((frame,i)=>[{kind:'accepted',sourceEpoch:1,seq:i+1,frame,meterEpoch:0,gain:null,code:null},{kind:'completed',sourceEpoch:1,seq:i+1,frame:completed[i],meterEpoch:0,gain:i===1?1:1.32,code:null}]),
    readback:{sources:1,state:'on',wanted:true,appliedGain:1.32}};
}
test('L1 reads actual stereo/source/control5 frame coverage and distinguishes request acceptance completion',async()=>{
  const {decodeL1Capture}=await mod('scripts/extension-e2e/audio-l1.mjs'),decoded=decodeL1Capture(observation());
  assert.deepEqual(decoded.streams.map(s=>s.channels.length),[2,2,5]);assert.equal(decoded.events[1].acceptedFrame,73472);
  assert.equal(decoded.events[1].requestedFrame,73408);assert.equal(decoded.events[1].completedFrame,75200);
});
test('L1 decodes a large bounded capture without base64 validator stack overflow',async()=>{
  const {decodeL1Capture}=await mod('scripts/extension-e2e/audio-l1.mjs'),raw=observation(),end=400000;
  raw.streams=raw.streams.map(stream=>({...stream,end,base64:Buffer.alloc(end*stream.channels*4).toString('base64')}));
  const decoded=decodeL1Capture(raw);
  assert.deepEqual(decoded.streams.map(s=>[s.end,s.channels.length,s.channels[0].length]),[[end,2,end],[end,2,end],[end,5,end]]);
});
test('L1 rejects missing channels, truncated/gapped clocks, wrong source/rate, fake completion and nonfinite PCM',async()=>{
  const {decodeL1Capture}=await mod('scripts/extension-e2e/audio-l1.mjs');
  for(const corrupt of [r=>r.streams.pop(),r=>r.streams[2].channels=2,r=>r.streams[1].start=128,r=>r.streams[1].end--,
    r=>r.sources=2,r=>r.sampleRate=44100,r=>r.replies.pop(),r=>r.replies[3].frame=70000,r=>r.commands[1].message.wanted=true,
    r=>{const b=Buffer.from(r.streams[0].base64,'base64');b.writeFloatLE(NaN,0);r.streams[0].base64=b.toString('base64');}]){
    const raw=observation();corrupt(raw);assert.throws(()=>decodeL1Capture(raw));
  }
});
test('D0 never turns failed PCM or swapped control channels into static/ACK success',async()=>{
  const {assessL1Capture}=await mod('scripts/extension-e2e/audio-l1.mjs');
  assert.equal(assessL1Capture(observation()).passed,true,'metric self-check needs a positive control, not a product-quality claim');
  for(const corrupt of [r=>{const b=Buffer.from(r.streams[0].base64,'base64');for(let n=73472;n<74240;n++)b.writeFloatLE(0,n*8);r.streams[0].base64=b.toString('base64');},
    r=>{const b=Buffer.from(r.streams[0].base64,'base64');b.writeFloatLE(1.01,78000*8+4);r.streams[0].base64=b.toString('base64');},
    r=>{const b=Buffer.from(r.streams[2].base64,'base64');for(let n=0;n<140800;n++){const a=b.readFloatLE(n*20);b.writeFloatLE(b.readFloatLE(n*20+4),n*20);b.writeFloatLE(a,n*20+4);}r.streams[2].base64=b.toString('base64');},
    r=>r.readback.appliedGain=null]){
    const raw=observation();corrupt(raw);assert.equal(assessL1Capture(raw).passed,false);
  }
});

test('installed probe forbids legacy bootstrap/config injection and preserves separate observer channels with gap detection',async()=>{
  const vm=require('node:vm'),{installProcessingProbe}=await mod('scripts/audio-processing-probe.mjs'),nodes=[];
  class Native{
    state='running';sampleRate=48000;currentTime=0;destination={};audioWorklet={addModule:async()=>{}};
    createMediaElementSource(){return {connect(){}};}createGain(){}createBiquadFilter(){}createAnalyser(){}createDynamicsCompressor(){}createDelay(){}createWaveShaper(){}createChannelSplitter(){}
  }
  class Node{
    constructor(ctx,name,options){this.options=options;this.port={onmessage:null,postMessage(){},addEventListener(){},start(){}};nodes.push(this);}connect(){}
  }
  const target={AudioContext:Native,AudioWorkletNode:Node,Symbol,setInterval:()=>1,clearInterval(){},addEventListener(){}};
  const video={currentTime:0};Object.defineProperty(target,Symbol.for('cheese-knife.runtime.v1'),{value:{audio:{getReadback:()=>({sources:1})}}});
  await vm.runInNewContext(`(${installProcessingProbe.toString()})({sampleRate:48000,installed:true})`,{window:target,AudioContext:Native,AudioWorkletNode:Node,Float32Array,Blob,
    performance,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},document:{hidden:false,querySelector:()=>video},btoa:text=>Buffer.from(text,'binary').toString('base64')});
  const probe=Object.getOwnPropertyDescriptor(target,Symbol.for('cheese-knife.f01-processing-probe')).value,context=new target.AudioContext();
  assert.deepEqual(nodes.slice(0,3).map(node=>node.options.channelCount),[2,2,5]);
  await assert.rejects(()=>probe.action({kind:'bootstrap'}),/fake-bootstrap-forbidden/);
  await assert.rejects(()=>probe.action({kind:'configure'}),/direct-config-forbidden/);
  context.currentTime=128/48000;context.createMediaElementSource(video);new target.AudioWorkletNode(context,'knife-audio-transition-l1',{});
  for(const index of [1,2])nodes[index].port.onmessage({data:{frame:0,samples:[]}});
  for(const [i,count]of [2,2,5].entries())for(const frame of [128,256])nodes[i].port.onmessage({data:{frame,samples:Array.from({length:count},()=>new Float32Array(128))}});
  const captured=await probe.action({kind:'l1-capture'});assert.deepEqual(Array.from(captured.streams,s=>s.channels),[2,2,5]);
  nodes[2].port.onmessage({data:{frame:512,samples:Array.from({length:5},()=>new Float32Array(128))}});
  await assert.rejects(()=>probe.action({kind:'l1-capture'}),/stream-gap/);
  const partial=await probe.action({kind:'l1-partial'});assert.ok(partial,'failure must keep already captured PCM/control');
  assert.equal(partial.schema,'f01-l1-partial-v1');assert.equal(partial.streamError,'audio-l1-stream-gap');
  assert.deepEqual(Array.from(partial.streams[2].chunks,c=>c.frame),[128,256,512]);
  const {decodeL1Capture}=await mod('scripts/extension-e2e/audio-l1.mjs');assert.throws(()=>decodeL1Capture(partial));
  for(let i=0;i<2000;i++)nodes[2].port.onmessage({data:{frame:640+i*128,samples:Array.from({length:5},()=>new Float32Array(128))}});
  const overflow=await probe.action({kind:'l1-partial'});assert.equal(overflow.streamError,'audio-l1-stream-overflow');
  assert.equal(overflow.streams[2].chunks.length,2000);assert.equal(overflow.streams[2].chunks[0].frame,128,'retain original prefix rather than silently dropping it');
});
test('A rejects zero raw delay and instant q/G controls even when ACKs and endpoint RMS look valid',async()=>{
  const {assessL1Capture}=await mod('scripts/extension-e2e/audio-l1.mjs');
  for(const corrupt of [raw=>{raw.streams[0].base64=raw.streams[1].base64;},raw=>{
    const bytes=Buffer.from(raw.streams[2].base64,'base64');for(let n=0;n<140800;n++){
      const wanted=n<73472||n>=92160;bytes.writeFloatLE(wanted?-1:0,n*20);bytes.writeFloatLE(wanted?1:0,n*20+4);bytes.writeFloatLE(wanted?1.32:1,n*20+8);
    }raw.streams[2].base64=bytes.toString('base64');}]){
    const raw=observation();corrupt(raw);assert.equal(assessL1Capture(raw).passed,false);
  }
});
test('A requires actual accepted+1728 completion, not a late endpoint stamped as completed',async()=>{
  const {decodeL1Capture}=await mod('scripts/extension-e2e/audio-l1.mjs');const raw=observation();
  raw.replies.filter(reply=>reply.kind==='completed').forEach(reply=>reply.frame+=128);
  assert.throws(()=>decodeL1Capture(raw));
});
test('cold native click must await actual matching source/on/completed readback within its budget',async()=>{
  const {waitL1On}=await mod('scripts/extension-e2e/audio-l1.mjs');let waited=false;
  const page={waitForFunction:async fn=>{assert.match(String(fn),/appliedGain/);await new Promise(resolve=>setTimeout(resolve,5));waited=true;}};
  await waitL1On(page);assert.equal(waited,true);
});
test('forced exact-child retirement is once-only failed closure, never a shutdown PASS',async()=>{
  const {l1OwnedCloser}=await mod('scripts/extension-e2e/audio-l1.mjs');let aborted=0;
  const error=new Error('close-failed'),close=l1OwnedCloser(async()=>{throw error;},async()=>{aborted++;});
  await assert.rejects(()=>close({}),cause=>cause===error&&cause.forcedRetirement===true);assert.equal(aborted,1);
  await assert.rejects(()=>close({}));assert.equal(aborted,1);
  assert.deepEqual(await l1OwnedCloser(async()=>({ok:true}),async()=>{throw Error('must not abort')})({}),{ok:true});
});
test('successful ACKs cannot stand in for a missing applied Gain at the independently checked endpoint',async()=>{
  const {assessL1Capture}=await mod('scripts/extension-e2e/audio-l1.mjs');
  const raw=observation(),bytes=Buffer.from(raw.streams[0].base64,'base64');
  for(let n=0;n<bytes.length;n+=4)bytes.writeFloatLE(bytes.readFloatLE(n)/1.32,n);
  raw.streams[0].base64=bytes.toString('base64');
  assert.equal(assessL1Capture(raw).passed,false,'endpoint input/processing relationship must be independently checked');
});
test('one candidate may be handed only once to its fixed retained child, never a retry or broader run',async()=>{
  const {l1CandidateProvider}=await mod('scripts/extension-e2e/audio-l1.mjs');
  const candidate={dist:'test-only'},provide=l1CandidateProvider(candidate,'root',async()=>{});
  assert.equal(await provide('F01L1Clock20261018R48','root',{retainEvidence:true}),candidate);
  await assert.rejects(()=>provide('F01L1Clock20261018R48','root',{retainEvidence:true}));
  for(const [id,root,options]of [['Other','root',{retainEvidence:true}],['FixturePriorRunR48','root',{retainEvidence:true}],['F01L1Clock20261018R48','other',{retainEvidence:true}],['F01L1Clock20261018R48','root',{retainEvidence:false}]])
    await assert.rejects(()=>l1CandidateProvider(candidate,'root',async()=>{})(id,root,options));
});
test('the original dip/step gates cover last settled tail after +300ms, not only the first 200ms',async()=>{
  const {assessL1Capture}=await mod('scripts/extension-e2e/audio-l1.mjs');
  for(const corrupt of [bytes=>{for(let n=110000;n<110768;n++)bytes.writeFloatLE(bytes.readFloatLE(n*8)/2,n*8);},bytes=>bytes.writeFloatLE(.4,110000*8+4)]){
    const raw=observation(),bytes=Buffer.from(raw.streams[0].base64,'base64');corrupt(bytes);raw.streams[0].base64=bytes.toString('base64');
    assert.equal(assessL1Capture(raw).passed,false);
  }
});
test('candidate digest binds the fixed physical root and changed bytes prevent the launch handoff',async()=>{
  const {l1CandidateDigest,l1CandidateProvider}=await mod('scripts/extension-e2e/audio-l1.mjs');
  const root=path.resolve('output/virtual-l1-test-root'),fixed=path.join(root,'output/tool-audit/p02-candidate-F01L1Clock20261018/chrome-candidate');
  let bytes=Buffer.from('first');const files={root,resolve:async()=>fixed,readFile:async()=>bytes};
  const candidate={root:fixed,dist:path.join(fixed,'dist'),files:['dist/web/audio-transition-worklet.js']},before=await l1CandidateDigest(files,candidate);
  let launched=false;bytes=Buffer.from('changed');
  const provider=l1CandidateProvider(candidate,root,async()=>{assert.equal(await l1CandidateDigest(files,candidate),before);});
  await assert.rejects(async()=>{await provider('F01L1Clock20261018R48',root,{retainEvidence:true});launched=true;});assert.equal(launched,false);
  await assert.rejects(()=>l1CandidateDigest(files,{...candidate,root:path.join(root,'other')}));
});
test('a never-resolving native readiness request has a finite failure and exact-owner cleanup',async()=>{
  const {audioOperation}=await mod('scripts/audio-native-browser.mjs'),{l1OwnedCloser}=await mod('scripts/extension-e2e/audio-l1.mjs');
  let aborted=0;
  const close=l1OwnedCloser(()=>audioOperation('test-l1-stuck',()=>new Promise(()=>{}),5),async()=>{aborted++;});
  await assert.rejects(()=>close({}),/audio-operation-timeout:test-l1-stuck/);assert.equal(aborted,1);
});
test('the installed scenario actually times out a stuck worker request and preserves its failure checkpoint',async()=>{
  const {runL1Scenario}=await mod('scripts/extension-e2e/audio-l1.mjs');
  const saved=[],root=path.resolve('output/virtual-l1-timeout');
  const files={root,readFile:async()=>'<html></html>',writeFile:async(name,data)=>{saved.push({name,data:JSON.parse(data)});}};
  const nativeTimer=global.setTimeout;
  global.setTimeout=(fn,delay,...args)=>nativeTimer(fn,delay===30000?5:delay,...args);
  try{
    await assert.rejects(()=>runL1Scenario({context:{on(){},route:async()=>{}},worker:{evaluate:()=>new Promise(()=>{})},extensionId:'a'.repeat(32),artifactPath:path.join(root,'artifacts')},files),/audio-operation-timeout:l1-seed/);
  }finally{global.setTimeout=nativeTimer;}
  assert.equal(saved.length,1);assert.match(saved[0].name,/partial.json$/);assert.match(saved[0].data.error,/l1-seed/);
});
