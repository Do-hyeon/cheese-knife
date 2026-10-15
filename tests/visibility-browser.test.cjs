const test=require('node:test'),assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const load=()=>import('../scripts/extension-e2e/visibility-browser.mjs');
test('native visibility process excludes component background extensions without adding a network debug endpoint',async()=>{
  const {visibilityBrowserArgs}=await load();
  for(const headed of [false,true]){
    const args=visibilityBrowserArgs(['--disable-extensions-except=C:/owned/dist','--load-extension=C:/owned/dist'],'C:/owned/profile',headed);
    assert.ok(args.includes('--disable-component-extensions-with-background-pages'));
    assert.ok(args.includes('--remote-debugging-pipe'));assert.ok(args.includes('--user-data-dir=C:/owned/profile'));
    assert.equal(args.some(arg=>arg.startsWith('--remote-debugging-port')),false);
    assert.equal(args.includes('--headless=new'),!headed);
  }
});
test('visibility pipe preserves fragmented UTF8 frames and multiple native messages',async()=>{
  const {createVisibilityTransport}=await load(),read=new PassThrough(),write=new PassThrough(),messages=[],sent=[];
  write.on('data',data=>sent.push(data));
  const transport=createVisibilityTransport(read,write);transport.onmessage=message=>messages.push(message);
  const bytes=Buffer.from('{"id":1,"result":{"text":"한글"}}\0{"method":"Target.created"}\0');
  const split=bytes.indexOf(Buffer.from('한'))+1;
  read.write(bytes.subarray(0,split));assert.deepEqual(messages,[]);read.write(bytes.subarray(split));
  assert.deepEqual(messages,[{id:1,result:{text:'한글'}},{method:'Target.created'}]);
  transport.send({id:2,method:'Browser.close'});
  assert.equal(Buffer.concat(sent).toString(),'{"id":2,"method":"Browser.close"}\0');transport.close();
});
test('visibility pipe retires once on malformed oversized or truncated native frames',async()=>{
  const {createVisibilityTransport}=await load();
  for(const bytes of [Buffer.from('bad\0'),Buffer.from('[]\0'),Buffer.alloc(32*1024*1024+1,65),Buffer.from('{"id":1')]){
    const read=new PassThrough(),write=new PassThrough(),transport=createVisibilityTransport(read,write);let closed=0,received=0;
    transport.onclose=()=>closed++;transport.onmessage=()=>received++;
    read.write(bytes);read.end();await new Promise(resolve=>setImmediate(resolve));transport.close();transport.close();
    assert.equal(received,0);assert.equal(closed,1);assert.throws(()=>transport.send({id:1}),/visibility-pipe-closed/);
    assert.equal(read.listenerCount('data'),0);
  }
});
test('visibility pipe treats read and write errors as retirement instead of uncaught process errors',async()=>{
  const {createVisibilityTransport}=await load();
  for(const side of ['read','write']){
    const read=new PassThrough(),write=new PassThrough(),transport=createVisibilityTransport(read,write);let closed=0;
    transport.onclose=()=>closed++;(side==='read'?read:write).emit('error',new Error('owned pipe error'));
    assert.equal(closed,1);transport.close();assert.equal(closed,1);
  }
});
