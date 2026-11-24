const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const load=()=>import('../scripts/extension-e2e/audio-source-owner.mjs'),clone=x=>JSON.parse(JSON.stringify(x)),routePath='/live/'+'a'.repeat(32),tuple={documentGeneration:1,routePath};
async function probeFixture(rate=44100){
  const m=await load(),nodes=[],contexts=[],blobs=new Map(),postReturn={},disconnectReturn={},postError=Error('native post failure'),disconnectError=Error('native disconnect failure');let posted=null,postThrows=false,disconnectThrows=false,sourceCalls=0,nativeSource=null;
  class Context{constructor(o){this.sampleRate=o.sampleRate;this.state='running';this.currentTime=0;this.destination={};contexts.push(this);}audioWorklet={addModule:async()=>{}};createMediaElementSource(){sourceCalls++;nativeSource={connect(){},disconnect(...args){if(disconnectThrows)throw disconnectError;return disconnectReturn;}};return nativeSource;}}
  class Node{constructor(context,name,options){Object.assign(this,{context,name,options});const handlers=[];this.port={onmessage:null,postMessage(...args){posted=args;if(postThrows)throw postError;return postReturn;},addEventListener(_t,h){handlers.push(h);},start(){},close(){}};this.receive=data=>{handlers.forEach(h=>h({data}));this.port.onmessage?.({data});};nodes.push(this);}connect(){}disconnect(){}}
  let holdLoad=false;const waiting=[],video={src:'',currentSrc:'',muted:false,volume:1,paused:false,ended:false,loop:false,playbackRate:1,currentTime:1,addEventListener(t,h){if(t==='loadeddata'){if(holdLoad)waiting.push(h);else queueMicrotask(()=>{video.currentSrc=video.src;h();});}},removeEventListener(){},play:async()=>{},pause(){}};
  const runtime={config:{},media:{context:clone(tuple)},mediaCurrent:()=>true,audio:{configure(){},setGain(){},setEnabled:async()=> 'off',getReadback:()=>({state:'on',sources:sourceCalls,wanted:true,gain:1,appliedGain:1})}};
  const window={AudioContext:Context,AudioWorkletNode:Node,crypto:webcrypto,location:{pathname:routePath}},document={hidden:false,querySelector:s=>s==='video'?video:null};window[Symbol.for('cheese-knife.runtime.v1')]=runtime;let id=0;
  await vm.runInNewContext('('+m.installSourceOwnerProbe.toString()+')('+JSON.stringify({sampleRate:rate,profile:'off-stages'})+')',{window,document,AudioContext:Context,AudioWorkletNode:Node,Float32Array,Uint8Array,DataView,ArrayBuffer,Map,Set,Blob,URL:{createObjectURL:blob=>{const url='blob:https://chzzk.naver.com/p'+(++id);blobs.set(url,blob);return url;},revokeObjectURL(){}},Symbol,TextEncoder,crypto:webcrypto,performance:{now:()=>0},btoa:s=>Buffer.from(s,'binary').toString('base64')});
  const probe=window[Symbol.for('cheese-knife.source-owner-probe.v1')],context=contexts[0];void context.destination;
  return {probe,nodes,window,document,video,context,runtime,postReturn,disconnectReturn,postError,disconnectError,posted:()=>posted,throwPost:v=>{postThrows=v;},throwDisconnect:v=>{disconnectThrows=v;},holdLoad:()=>{holdLoad=true;},releaseLoad:()=>{video.currentSrc=video.src;waiting.splice(0).forEach(h=>h());}};
}


const spec={id:'44100/source-owner/off-stages',sampleRate:44100,frequency:1000,inputDbfs:-24,pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:true,equalizer:false};
test('off-stages actual probe opts only original A into the diagnostic Worklet',async()=>{
 const f=await probeFixture();await f.probe.action({kind:'prepare',spec});
 const a=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}}),b=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:8,initial:'raw'}});
 assert.equal(a.options.processorOptions.offStageWitness,true);assert.equal(Object.hasOwn(b.options.processorOptions,'offStageWitness'),false);
 assert.equal((await f.probe.action({kind:'facts'})).profile,'off-stages');await f.probe.action({kind:'stop'});
});
test('off-stages actual probe rejects 48 and 96kHz before creating a context',async()=>{
 for(const rate of [48000,96000])await assert.rejects(()=>probeFixture(rate),/audio-source-owner/);
});
