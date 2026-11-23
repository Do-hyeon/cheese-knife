const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const load=()=>import('../scripts/extension-e2e/harness.mjs');
const url='chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html';
const target={targetId:'popup',type:'other',url,browserContextId:'fixture'};
test('popup selection refuses another context URL duplicates and absent identity facts',async()=>{
  const {selectPopupTarget}=await load();assert.equal(typeof selectPopupTarget,'function');
  assert.equal(selectPopupTarget([target],url,'fixture').targetId,'popup');
  for(const list of [[],[target,target],[{...target,url:url+'?x=1'}],[{...target,browserContextId:'other'}],
    [{...target,type:'service_worker'}],[{...target,targetId:''}],null]){
    assert.throws(()=>selectPopupTarget(list,url,'fixture'),{code:'popup-target-unavailable'});
  }
  assert.throws(()=>selectPopupTarget([target],url,''),{code:'popup-target-unavailable'});
});
function wire(mode='ok'){
  const bus=new EventEmitter();bus.send=async(method,params)=>{
    if(method==='Target.attachToTarget')return {sessionId:'owned'};
    if(method==='Target.detachFromTarget'){
      if(mode.startsWith('detach-'))throw Error(mode==='detach-unknown-gone'?'other detach error':'Protocol error (Target.detachFromTarget): No session with given id');
      return {};
    }
    if(method==='Target.getTargets')return {targetInfos:mode==='detach-missing-live'?[target]:mode==='detach-missing-malformed'?[{}]:[]};
    assert.equal(method,'Target.sendMessageToTarget');assert.equal(params.sessionId,'owned');
    const input=JSON.parse(params.message);
    queueMicrotask(()=>{
      bus.emit('Target.receivedMessageFromTarget',{sessionId:'foreign',message:JSON.stringify({id:input.id,result:{value:'foreign'}})});
      if(mode==='close')bus.emit('Target.detachedFromTarget',{sessionId:'owned'});
      else if(mode!=='timeout')bus.emit('Target.receivedMessageFromTarget',{sessionId:'owned',message:JSON.stringify(mode==='error'
        ? {id:input.id,error:{code:-1,message:'Protocol failed'}}:{id:input.id,result:{value:'owned'}})});
    });return {};
  };return bus;
}
test('popup commands only settle from the owned numeric request and session',async()=>{
  const {attachPopupCDP}=await load();assert.equal(typeof attachPopupCDP,'function');const bus=wire();
  const popup=await attachPopupCDP(bus,target,50);
  assert.deepEqual(await popup.command('Runtime.evaluate',{expression:'1'}),{value:'owned'});
  await popup.detach();assert.equal(bus.listenerCount('Target.receivedMessageFromTarget'),0);
  await assert.rejects(popup.command('Runtime.evaluate',{}),{code:'popup-target-closed'});
});
for(const [mode,code]of [['close','popup-target-closed'],['timeout','popup-command-timeout'],['error','popup-command-failed']])
  test('popup '+mode+' rejects pending work rather than inventing a result',async()=>{
    const {attachPopupCDP}=await load();assert.equal(typeof attachPopupCDP,'function');const bus=wire(mode);
    const popup=await attachPopupCDP(bus,target,15);await assert.rejects(popup.command('Runtime.evaluate',{}),{code});
    await popup.detach();assert.equal(bus.listenerCount('Target.receivedMessageFromTarget'),0);
  });

test('missing CDP session is accepted only with independently witnessed own target absence',async()=>{
  const {attachPopupCDP}=await load(),bus=wire('detach-missing-gone'),popup=await attachPopupCDP(bus,target,50);
  await popup.command('Runtime.evaluate',{});await assert.doesNotReject(popup.detach());
  assert.equal(bus.listenerCount('Target.receivedMessageFromTarget'),0);
});
for(const mode of ['detach-missing-live','detach-missing-malformed','detach-unknown-gone'])test(mode+' cannot certify cleanup',async()=>{
  const {attachPopupCDP}=await load(),bus=wire(mode),popup=await attachPopupCDP(bus,target,50);
  await popup.command('Runtime.evaluate',{});await assert.rejects(popup.detach());
  assert.equal(bus.listenerCount('Target.receivedMessageFromTarget'),0);
});
