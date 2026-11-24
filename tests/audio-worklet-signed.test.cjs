// 제품 루트에서 node --test tests/audio-worklet-signed.test.cjs 로 실행한다.
// 합성 노드·포트와 원바이트만 사용한다. 브라우저를 띄우지 않으며 native 호출 보존·누락 기록 실패를 검사한다.
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');

async function pageFixture(trace){
  const {installWorkletProof}=await import('../scripts/audio-worklet-signed.mjs');
  const {registerQualityWorklet}=await import('../scripts/audio-quality-diagnostics.mjs');
  const nativeCalls=[],failure=Error('native'),sentinel={};
  class Port {
    listeners=new Map();
    addEventListener(type,listener){this.listeners.set(type,listener);}
    postMessage(...args){
      if(!(this instanceof Port)||args[0]==='throw')throw failure;
      nativeCalls.push({receiver:this,args});return sentinel;
    }
    dispatch(data){const event={isTrusted:true,data};this.listeners.get('message')?.(event);this.onmessage?.(event);}
  }
  class NativeNode{
    port=new Port();
    listeners=new Map();
    constructor(...args){this.args=args;}
    addEventListener(type,listener){this.listeners.set(type,listener);}
  }
  const context={audioWorklet:{addModule(){return Promise.resolve();}}};
  const window={__quality:{context},AudioWorkletNode:NativeNode};
  window[Symbol.for('cheese-knife.runtime.v1')]={audio:{prepareTransitionModule(url){return context.audioWorklet.addModule(url);}}};
  const sandbox=vm.createContext({window,crypto:webcrypto,structuredClone,document:{querySelector:()=>({currentSrc:'blob:fixture'})},URL,Blob});
  const evaluate=fn=>vm.runInContext('('+fn.toString()+')',sandbox);
  evaluate(installWorkletProof)({trace});
  const proof=window[Symbol.for('cheese-knife.quality-worklet-signed')];
  return {window,context,proof,NativeNode,Port,nativeCalls,failure,sentinel,register:evaluate(registerQualityWorklet)};
}

test('U는 노드·포트를 그대로 두고 실제 등록 바이트의 SHA를 남긴다',async()=>{
  const {window,context,NativeNode,proof,register}=await pageFixture(false),bytes=[0,255,65];
  assert.equal(window.AudioWorkletNode,NativeNode);assert.equal(Object.hasOwn(proof.snapshot(),'events'),false);
  assert.equal(proof.snapshot().gainTraceInstalled,false);
  window[Symbol.for('cheese-knife.quality-trace')]={snapshot(){}};
  assert.equal(proof.snapshot().gainTraceInstalled,true);
  let fulfill,loading=new Promise(resolve=>{fulfill=resolve;});
  context.audioWorklet.addModule=function(...args){assert.equal(this,context.audioWorklet);assert.match(args[0],/^blob:/);return loading;};
  assert.equal(register(bytes),loading);
  assert.equal(proof.registration.attempts,1);assert.equal(proof.registration.successes,0);
  fulfill();await loading;
  for(let i=0;i<100&&!proof.registration.sha256;i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(proof.registration.successes,1);assert.equal(proof.registration.sha256,createHash('sha256').update(Buffer.from(bytes)).digest('hex'));
});

test('T는 같은 context의 제품 포트만 기록하고 receiver·인자·반환·예외·onmessage를 보존한다',async()=>{
  const f=await pageFixture(true),Node=f.window.AudioWorkletNode,options={processorOptions:{sourceEpoch:1}};
  const other=new Node({},'knife-audio-transition-l1',options),sink=new Node(f.context,'knife-quality-capture',options);
  for(const node of [other,sink])assert.equal(node.port.postMessage,f.Port.prototype.postMessage);
  const node=new Node(f.context,'knife-audio-transition-l1',options),port=node.port;
  assert.ok(node instanceof f.NativeNode);assert.equal(node.args[2],options);
  const data={kind:'configure',seq:1,eq:Array(8).fill(0)},transfer=[];
  let delivered;port.onmessage=event=>{delivered=event.data;};
  assert.equal(port.postMessage(data,transfer),f.sentinel);
  assert.equal(f.nativeCalls[0].receiver,port);assert.equal(f.nativeCalls[0].args[0],data);assert.equal(f.nativeCalls[0].args[1],transfer);
  const reply={kind:'accepted',seq:1};port.dispatch(reply);assert.equal(delivered,reply);
  assert.deepEqual(Array.from(f.proof.snapshot().events,e=>e.type),['create','send','receive']);
  assert.throws(()=>port.postMessage.call({},data),err=>err===f.failure);
  assert.equal(f.proof.snapshot().error,'');
  assert.throws(()=>port.postMessage('throw'),err=>err===f.failure);
  assert.equal(f.proof.snapshot().error,'worklet-send-failed');
});

test('포트 기록 상한 뒤에도 native 전송은 원래 값을 돌려준다',async()=>{
  const f=await pageFixture(true),node=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:1}});
  for(let i=0;i<4097;i++)assert.equal(node.port.postMessage({kind:'retire',seq:i}),f.sentinel);
  assert.equal(f.nativeCalls.length,4097);assert.equal(f.proof.snapshot().events.length,4096);
  assert.equal(f.proof.snapshot().error,'worklet-trace-overflow');
});
