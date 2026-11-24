const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {PassThrough}=require('node:stream');
const {chromium}=require('playwright');

// The real Playwright client and pipe use a memory-only protocol peer; no Chrome, SDK, profile or port.
for(const framing of ['coalesced','fragmented'])test(`visibility pipe initializes Playwright evaluation with ${framing} protocol messages`,{timeout:5000},async()=>{
  const {createVisibilityTransport}=await import('../scripts/extension-e2e/visibility-browser.mjs');
  const read=new PassThrough(),write=new PassThrough(),transport=createVisibilityTransport(read,write),commands=[],queue=[];
  let flush=null,closed=false,world='utility',browser;
  const frameId='frame-one',sessionId='session-one';
  const targetInfo={targetId:frameId,browserContextId:'context-one',type:'page',title:'',url:'about:blank',attached:true,canAccessOpener:false};
  const deliver=message=>{
    queue.push(message);
    if(!flush)flush=setImmediate(()=>{
      flush=null;if(closed)return;
      const bytes=Buffer.from(queue.splice(0).map(row=>JSON.stringify(row)+'\0').join(''));
      if(framing==='fragmented'){const split=Math.floor(bytes.length/2);read.write(bytes.subarray(0,split));read.write(bytes.subarray(split));}
      else read.write(bytes);
    });
  };
  const event=(method,params)=>({method,params,sessionId});
  write.on('data',data=>{
    const command=JSON.parse(data.toString().replace(/\0$/,''));commands.push(command.method);let result={};
    if(command.method==='Browser.getVersion')result={protocolVersion:'1.3',product:'Chrome/151.0.7922.34',revision:'local-fixture',userAgent:'HeadlessChrome/151.0.7922.34',jsVersion:'local-fixture'};
    if(command.method==='Target.setAutoAttach'&&!command.sessionId)deliver({method:'Target.attachedToTarget',params:{sessionId,targetInfo,waitingForDebugger:false}});
    if(command.method==='Target.getTargetInfo')result={targetInfo};
    if(command.method==='Page.getFrameTree')result={frameTree:{frame:{id:frameId,loaderId:'loader-one',url:'about:blank',securityOrigin:':',mimeType:'text/html'}}};
    if(command.method==='Page.addScriptToEvaluateOnNewDocument'){world=command.params.worldName;result={identifier:'script-one'};}
    if(command.method==='Runtime.enable')deliver(event('Runtime.executionContextCreated',{context:{id:1,origin:':',name:'',uniqueId:'context-one',auxData:{isDefault:true,type:'default',frameId}}}));
    if(command.method==='Page.createIsolatedWorld'){
      deliver(event('Runtime.executionContextCreated',{context:{id:2,origin:':',name:world,uniqueId:'context-two',auxData:{isDefault:false,type:'isolated',frameId}}}));
      result={executionContextId:2};
    }
    if(command.method==='Runtime.evaluate')result={result:{type:'object',className:'Object',objectId:'utility-one'}};
    if(command.method==='Runtime.callFunctionOn')result={result:{type:'number',value:2}};
    deliver({id:command.id,result,...command.sessionId?{sessionId:command.sessionId}:{}});
  });
  try{
    browser=await chromium.connectOverCDP(transport,{noDefaults:true,artifactsDir:path.resolve(__dirname),timeout:2000});
    const contexts=browser.contexts();assert.equal(contexts.length,1);assert.equal(contexts[0].pages().length,1);
    const page=contexts[0].pages()[0];assert.equal(page.url(),'about:blank');
    let timer;
    try{assert.equal(await Promise.race([page.evaluate(()=>2),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('evaluation-not-dispatched')),500);})]),2);}
    finally{clearTimeout(timer);}
    assert.equal(commands.filter(method=>method==='Runtime.evaluate').length,1);
    assert.equal(commands.filter(method=>method==='Runtime.callFunctionOn').length,1);
  }finally{
    closed=true;clearImmediate(flush);
    if(browser)await browser.close();else transport.close();
    read.destroy();write.destroy();
  }
});
