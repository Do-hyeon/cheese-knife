const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../scripts/extension-e2e/audio-source-owner.mjs');
const clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>require('node:crypto').createHash('sha256').update(x).digest('hex');

function fixture(rate=44100){
  const spec={id:rate+'/source-owner/stable',sampleRate:rate,frequency:1000,inputDbfs:-24,pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:true,equalizer:false};
  const window=c=>({start:Math.ceil(c/(rate/10))*rate/10,end:(Math.ceil(c/(rate/10))+1)*rate/10}),a=window(1024),bPrepared=Math.ceil((a.end+512)/128)*128,b=window(bPrepared+1024),end=Math.ceil(b.end/128)*128;
  const nodes=[{id:1,portId:1,sourceEpoch:7,contextId:1,initial:'raw',options:{sourceEpoch:7,initial:'raw'},producerId:2},{id:2,portId:2,sourceEpoch:8,contextId:1,initial:'raw',options:{sourceEpoch:8,initial:'raw'},producerId:3}];
  const producers=[0,1,2,3].map(id=>({id,portId:id,role:id===0?'program':id===1?'source':'control',channels:id<2?2:5,contextId:1,nodeId:id<2?null:id-1,sourceEpoch:id<2?null:nodes[id-2].sourceEpoch}));
  const urls=['blob:https://chzzk.naver.com/owner-A','blob:https://chzzk.naver.com/owner-B'],inputPlan={spec:clone(spec),urls,sourceSha256:hash('unit immutable WAV'),sameBlob:true};
  const ledger=[],event=(type,data={})=>ledger.push({order:ledger.length+1,type,...data}),packet=(nodeId,kind,frame)=>({kind,sourceEpoch:nodes[nodeId-1].sourceEpoch,seq:kind==='prepared'?0:1,frame,meterEpoch:0,gain:kind==='completed'?1:null,code:null});
  const command=nodeId=>({kind:'configure',sourceEpoch:nodes[nodeId-1].sourceEpoch,seq:1,wanted:true,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:true,targetDbfs:-20});
  event('constructor',{nodeId:1});event('receive',{nodeId:1,portId:1,packet:packet(1,'prepared',0)});event('source-create',{sourceHandle:1});event('node-connect',{nodeId:1});event('source-connect',{nodeId:1,sourceHandle:1});event('send',{nodeId:1,portId:1,packet:command(1)});event('receive',{nodeId:1,portId:1,packet:packet(1,'accepted',128)});event('receive',{nodeId:1,portId:1,packet:packet(1,'completed',1024)});
  event('switch',{fromNodeId:1,sourceHandle:1,fromUrl:urls[0],toUrl:urls[1],aEnd:a.end});const switchOrder=ledger.length;
  event('source-disconnect',{nodeId:1,sourceHandle:1});event('node-disconnect',{nodeId:1,all:true});event('port-close',{nodeId:1});event('constructor',{nodeId:2});event('receive',{nodeId:2,portId:2,packet:packet(2,'prepared',bPrepared)});event('node-connect',{nodeId:2});event('source-connect',{nodeId:2,sourceHandle:1});event('send',{nodeId:2,portId:2,packet:command(2)});event('receive',{nodeId:2,portId:2,packet:packet(2,'accepted',bPrepared+128)});event('receive',{nodeId:2,portId:2,packet:packet(2,'completed',bPrepared+1024)});
  const stable=(id,w)=>({nodeId:id,window:w,connected:[id],currentSrc:urls[id-1],sources:1,contextState:'running',paused:false,hidden:false,readback:{state:'on',sources:1,wanted:true,gain:1,appliedGain:1}});
  const facts={spec:clone(spec),inputPlan,nodes,producers,ledger,sources:1,contextId:1,elementId:1,error:null,switchOrder,stable:{a:stable(1,a),b:stable(2,b)}};
  const records=[];for(const p of producers){const start=p.id===3?bPrepared:0,stop=p.id===2?bPrepared+256:end,chunk=Math.floor(rate/10/128)*128;let seq=1;for(let frame=start;frame<stop;frame+=chunk){const last=Math.min(stop,frame+chunk),count=(last-frame)/128,data=Buffer.alloc((last-frame)*p.channels*4);for(let n=0;n<last-frame;n++)for(let c=0;c<p.channels;c++)data.writeFloatLE(p.channels===5?[-1,1,1,1,0][c]:Math.SQRT2*10**(-24/20)*Math.sin(2*Math.PI*1000*(frame+n)/rate+.37),(n*p.channels+c)*4);records.push({producerId:p.id,portId:p.id,nodeId:p.nodeId,sourceEpoch:p.sourceEpoch,kind:'pcm',packetFrame:frame,start:frame,end:last,firstSequence:seq,lastSequence:seq+count-1,firstReceived:seq,lastReceived:seq+count-1,firstOffset:0,lastOffset:128,channels:p.channels,base64:data.toString('base64')});seq+=count;}}
  const saved=new Map(),directory='output/playwright/installed-extension-OwnerUnit';const files={root:process.cwd(),readdir:async p=>[{name:p==='dist'?'web':'audio-transition-worklet.js',isDirectory:()=>p==='dist',isFile:()=>p==='dist/web',isSymbolicLink:()=>false}],writeFile:async(file,data,options)=>{assert.equal(options.flag,'wx');assert.ok(!saved.has(file),'no overwrite '+file);saved.set(file,Buffer.from(data));},readFile:async(file,encoding)=>{if(!saved.has(file))throw Error('missing '+file);return encoding?saved.get(file).toString(encoding):saved.get(file);},lstat:async file=>saved.has(file)?{isFile:()=>true,size:saved.get(file).length}:null};
  return {spec,facts,records,saved,files,directory,a,b,end};
}

async function retained(f=fixture()){
  const m=await load();assert.equal(typeof m.createSourceOwnerArchive,'function','R4 sparse archive is not implemented');
  const archive=m.createSourceOwnerArchive(f.files,f.directory,f.spec);for(const r of f.records)await archive.append(r);const proof=archive.proof(f.facts);await f.files.writeFile(f.directory+'/source-owner-proof.json',JSON.stringify(proof),{flag:'wx'});await f.files.writeFile(f.directory+'/input-plan.json',JSON.stringify(f.facts.inputPlan),{flag:'wx'});return {...f,archive,proof};
}

test('R4 stable source ownership uses three fixed caller cases through the existing dispatcher',async()=>{
  const {selectProductCase,parseProductAudioArgs}=await import('../scripts/extension-e2e/audio-product.mjs');
  for(const sampleRate of [44100,48000,96000]){
    const id=sampleRate+'/source-owner/stable',spec=selectProductCase(id);
    assert.deepEqual(spec,{id,sampleRate,frequency:1000,inputDbfs:-24,pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:true,equalizer:false});
    assert.equal(Object.isFrozen(spec),true);assert.deepEqual(parseProductAudioArgs(['--run-id=OwnerUnit','--case='+id]),{runId:'OwnerUnit',caseId:id});
    assert.throws(()=>parseProductAudioArgs(['--run-id=OwnerUnit','--case='+id,'--component-witness']));
  }
  for(const id of ['44100/source-owner/pending','48000/source-owner/stable/extra','192000/source-owner/stable'])assert.throws(()=>selectProductCase(id));
});

for(const rate of [44100,48000,96000])test('R4 '+rate+' sparse controls retain the shared bridge and replay fixed windows',async()=>{
  const f=await retained(fixture(rate)),m=await load(),read=await m.readSourceOwnerProof(f.files,f.directory,f.spec);
  assert.equal(read.assessment.formation,'FORMED');assert.equal(read.assessment.ownership,'CONSISTENT');assert.equal(read.assessment.lateReplyWitness,'UNASSESSED');assert.equal(read.assessment.waveQuality,'UNASSESSED');assert.equal(read.assessment.overallQualification,false);
  assert.deepEqual(read.assessment.windows,{a:f.a,b:f.b});assert.ok(f.proof.rows.some(r=>r.producerId===2&&r.end>f.proof.rows.find(r=>r.producerId===3).start),'cross-port overlap is retained');
  assert.equal(f.proof.pcmBytes,f.proof.rows.reduce((sum,r)=>sum+(r.bytes??0),0));assert.ok(f.proof.pcmBytes<=96*1024*1024);
});

for(const fault of ['packet-epoch','port-origin','duplicate-ack','missing-prepared','wrong-gain','third-l1','source-count','wrong-url','current-owner','switch-after-b'])test('R4 stored '+fault+' is rejected instead of borrowing another owner',async()=>{
  const f=await retained(),p=f.proof;
  if(fault==='packet-epoch')p.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===1).packet.sourceEpoch=8;
  if(fault==='port-origin')p.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===1).portId=2;
  if(fault==='duplicate-ack'){const r=clone(p.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===2&&e.packet.kind==='completed'));r.order=p.facts.ledger.length+1;p.facts.ledger.push(r);}
  if(fault==='missing-prepared'){p.facts.ledger=p.facts.ledger.filter(e=>!(e.type==='receive'&&e.nodeId===1&&e.packet.kind==='prepared'));p.facts.ledger.forEach((e,i)=>e.order=i+1);p.facts.switchOrder--;}
  if(fault==='wrong-gain')p.facts.ledger.find(e=>e.type==='send'&&e.nodeId===2).packet.gain=.5;
  if(fault==='third-l1')p.facts.nodes.push({...clone(p.facts.nodes[1]),id:3});
  if(fault==='source-count')p.facts.sources=2;
  if(fault==='wrong-url')p.facts.stable.b.currentSrc=p.facts.inputPlan.urls[0];
  if(fault==='current-owner')p.facts.stable.b.connected=[1];
  if(fault==='switch-after-b')p.facts.switchOrder=p.facts.ledger.length;
  f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>(load()).then(m=>m.readSourceOwnerProof(f.files,f.directory,f.spec)),/source-owner/);
});

test('R4 replay rejects a different caller and a changed input plan without reusing the old spec',async()=>{
  const f=await retained(),m=await load();await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,{...f.spec,gain:2}),/original-spec/);f.saved.set(f.directory+'/input-plan.json',Buffer.from(JSON.stringify({...f.facts.inputPlan,sourceSha256:hash('another input')})));await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,f.spec),/input-plan/);
});

test('R4 reader binds file names and bytes to the original producer and refuses a rehashed swap',async()=>{
  const f=await retained(),a=f.proof.rows.find(r=>r.producerId===2),b=f.proof.rows.find(r=>r.producerId===3);a.file=b.file;a.sha256=b.sha256;a.bytes=b.bytes;f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(f.proof)));await assert.rejects(()=>(load()).then(m=>m.readSourceOwnerProof(f.files,f.directory,f.spec)),/source-owner/);
});

for(const fault of ['gap','overlap','nonfinite','receiver-gap'])test('R4 archive preserves a valid prefix on '+fault,async()=>{
  const m=await load();assert.equal(typeof m.createSourceOwnerArchive,'function');const f=fixture(),a=m.createSourceOwnerArchive(f.files,f.directory,f.spec),r=clone(f.records[0]);await a.append(r);const next=clone(f.records[1]);
  if(fault==='gap')next.start++;
  if(fault==='overlap')next.start--;
  if(fault==='nonfinite'){const bytes=Buffer.from(next.base64,'base64');bytes.writeFloatLE(NaN);next.base64=bytes.toString('base64');}
  if(fault==='receiver-gap')next.firstReceived++;
  await assert.rejects(()=>a.append(next),/source-owner/);assert.equal(a.summary().rows,1);assert.equal(a.summary().pcmBytes,Buffer.from(r.base64,'base64').length);
});

test('R4 empty status is not zero PCM and startup empty may become a valid owned stream',async()=>{
  const f=fixture(),m=await load();assert.equal(typeof m.createSourceOwnerArchive,'function');const a=m.createSourceOwnerArchive(f.files,f.directory,f.spec),r=clone(f.records[0]),count=(r.end-r.start)/128;
  const empty={...r,kind:'empty',channels:0};delete empty.base64;await a.append(empty);assert.equal(a.summary().pcmBytes,0);const next=clone(f.records[1]);await a.append(next);assert.equal(a.summary().rows,2);assert.equal(a.proof(f.facts).rows[0].kind,'empty');assert.ok(count>0);
});

test('R4 split packet offsets keep one received sequence while logical frames cover exactly once',async()=>{
  const f=fixture(),m=await load();assert.equal(typeof m.createSourceOwnerArchive,'function');const a=m.createSourceOwnerArchive(f.files,f.directory,f.spec),r=f.records[0],data=Buffer.from(r.base64,'base64');
  const first={...r,end:64,lastSequence:1,lastReceived:1,lastOffset:64,base64:data.subarray(0,64*8).toString('base64')};await a.append(first);
  const second={...r,start:64,packetFrame:0,firstSequence:1,firstReceived:1,firstOffset:64,base64:data.subarray(64*8).toString('base64')};await a.append(second);assert.equal(a.summary().pcmBytes,data.length);assert.equal(a.summary().rows,2);
});

test('R4 append failure retains the orphan evidence without advancing committed coverage',async()=>{
  const f=fixture(),m=await load();assert.equal(typeof m.createSourceOwnerArchive,'function');const write=f.files.writeFile;f.files.writeFile=async(...args)=>{await write(...args);throw Error('disk-full-after-write');};const a=m.createSourceOwnerArchive(f.files,f.directory,f.spec);await assert.rejects(()=>a.append(f.records[0]),/disk-full/);assert.equal(a.summary().rows,0);assert.equal(f.saved.size,1);assert.ok(a.summary().chargedBytes>0);
});

test('R4 product output connections are counted separately from its one source owner',async()=>{
  const f=fixture();for(const id of [1,2]){const i=f.facts.ledger.findIndex(e=>e.type==='node-connect'&&e.nodeId===id);f.facts.ledger.splice(i,0,{type:'node-connect',nodeId:id},{type:'node-connect',nodeId:id});}f.facts.ledger.forEach((e,i)=>e.order=i+1);f.facts.switchOrder=f.facts.ledger.find(e=>e.type==='switch').order;
  const r=await retained(f),m=await load();assert.equal((await m.readSourceOwnerProof(r.files,r.directory,r.spec)).assessment.ownership,'CONSISTENT');
});

async function probeFixture(rate=44100,profile=null){
  const m=await load();assert.equal(typeof m.installSourceOwnerProbe,'function','R4 browser observation is not implemented');
  const vm=require('node:vm'),nodes=[],contexts=[],blobs=new Map();let sourceCount=0,captureCode='';
  class Context{constructor(o){this.sampleRate=o.sampleRate;this.state='running';this.currentTime=0;this.destination={};contexts.push(this);}audioWorklet={addModule:async url=>{if(blobs.has(url))captureCode=await blobs.get(url).text();}};createMediaElementSource(){sourceCount++;return {connect(){},disconnect(){}};}}
  class Node{constructor(context,name,options){this.context=context;this.name=name;this.options=options;this.connections=[];const handlers=[];this.port={onmessage:null,closed:false,postMessage(){},addEventListener(_t,h){handlers.push(h);},start(){},close(){this.closed=true;}};this.receive=data=>{this.port.onmessage?.({data});handlers.forEach(h=>h({data}));};nodes.push(this);}connect(...x){this.connections.push(x);}disconnect(){this.connections=[];}}
  let holdLoad=false;const waiting=[],events=new Map(),video={src:'',currentSrc:'',muted:false,volume:1,paused:false,ended:false,loop:false,playbackRate:1,currentTime:1,addEventListener(t,h){if(t==='loadeddata'){if(holdLoad)waiting.push(h);else queueMicrotask(()=>{video.currentSrc=video.src;h();});}else events.set(t,h);},removeEventListener(){},play:async()=>{},pause(){}};
  let configured=0;const runtime={config:{},audio:{configure(){configured++;},setGain(){},setEnabled:async()=> 'off',getReadback:()=>({state:'on',sources:1,wanted:true,gain:1,appliedGain:1})}};
  const window={AudioContext:Context,AudioWorkletNode:Node,crypto:require('node:crypto').webcrypto};window[Symbol.for('cheese-knife.runtime.v1')]=runtime;const document={hidden:false,querySelector:s=>s==='video'?video:null};let next=0;const url={createObjectURL:blob=>{const key='blob:https://chzzk.naver.com/u'+(++next);blobs.set(key,blob);return key;},revokeObjectURL(){}};
  await vm.runInNewContext('('+m.installSourceOwnerProbe.toString()+')('+JSON.stringify({sampleRate:rate,...(profile?{profile}:{})})+')',{window,document,AudioContext:Context,AudioWorkletNode:Node,Float32Array,Uint8Array,DataView,ArrayBuffer,Map,Set,Blob,URL:url,Symbol,TextEncoder,crypto:require('node:crypto').webcrypto,performance:{now:()=>0},btoa:s=>Buffer.from(s,'binary').toString('base64')});
  const probe=window[Symbol.for('cheese-knife.source-owner-probe.v1')],context=contexts[0];void context.destination;return {window,video,nodes,context,probe,captureCode,runtime,blobs,configured:()=>configured,sources:()=>sourceCount,holdLoad:()=>{holdLoad=true;},releaseLoad:()=>{video.currentSrc=video.src;waiting.splice(0).forEach(h=>h());}};
}

test('R4 probe keeps original constructor options and separates both control ports',async()=>{
  const f=await probeFixture(),options=Object.freeze({processorOptions:Object.freeze({sourceEpoch:7,initial:'raw'})}),a=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',options),source=f.context.createMediaElementSource(f.video);a.connect({},0);source.connect(a);
  const aCapture=f.nodes.find(n=>n.options?.processorOptions?.producerId===2);assert.ok(aCapture);assert.equal(a.options,options);assert.equal(a.options.processorOptions.normalizerWitness,undefined);
  source.disconnect(a);a.disconnect();a.port.close();const b=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:8,initial:'raw'}});b.connect({},0);source.connect(b);
  const bCapture=f.nodes.find(n=>n.options?.processorOptions?.producerId===3);assert.notEqual(aCapture,bCapture);assert.equal(f.sources(),1);
  aCapture.receive({producerId:2,producerSequence:1,frame:0,samples:Array.from({length:5},()=>new Float32Array(128))});bCapture.receive({producerId:3,producerSequence:1,frame:128,samples:Array.from({length:5},()=>new Float32Array(128))});
  const raw=await f.probe.action({kind:'drain',cursors:[0,0,0,0]});assert.equal(raw.find(r=>r.producerId===2).nodeId,1);assert.equal(raw.find(r=>r.producerId===3).nodeId,2);assert.equal(raw.find(r=>r.producerId===2).sourceEpoch,7);
});

test('R4 probe records startup empty separately from real zero and never relabels a late old payload',async()=>{
  const f=await probeFixture(),a=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}}),capture=f.nodes.find(n=>n.options?.processorOptions?.producerId===2);
  capture.receive({producerId:2,producerSequence:1,frame:0,samples:[]});capture.receive({producerId:2,producerSequence:2,frame:128,samples:Array.from({length:5},()=>new Float32Array(128))});a.disconnect();a.port.close();new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:8,initial:'raw'}});
  capture.receive({producerId:2,producerSequence:3,frame:256,samples:Array.from({length:5},()=>new Float32Array(128))});const rows=await f.probe.action({kind:'drain',cursors:[0,0,0,0]});assert.equal(rows[0].kind,'empty');assert.equal(rows[0].channels,0);assert.equal(rows[1].kind,'pcm');assert.equal(rows[1].nodeId,1);assert.equal(rows[1].sourceEpoch,7);assert.ok(Buffer.from(rows[1].base64,'base64').every(v=>v===0));
});

for(const fault of ['producer','sequence','frame','nonfinite'])test('R4 browser capture '+fault+' is a sticky failure',async()=>{
  const f=await probeFixture(),capture=f.nodes.find(n=>n.options?.processorOptions?.producerId===0),r={producerId:0,producerSequence:1,frame:0,samples:[new Float32Array(128),new Float32Array(128)]};capture.receive(r);const bad={...r,producerSequence:2,frame:128};if(fault==='producer')bad.producerId=1;if(fault==='sequence')bad.producerSequence=3;if(fault==='frame')bad.frame=256;if(fault==='nonfinite')bad.samples=[Float32Array.from({length:128},()=>NaN),new Float32Array(128)];capture.receive(bad);const first=(await f.probe.action({kind:'facts'})).error;assert.match(first,/source-owner/);capture.receive({...r,producerSequence:3,frame:256});assert.equal((await f.probe.action({kind:'facts'})).error,first);
});

test('R4 third L1 or another source is refused without treating observer nodes as products',async()=>{
  const f=await probeFixture();for(const sourceEpoch of [7,8])new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch,initial:'raw'}});assert.equal(f.nodes.filter(n=>n.name==='knife-audio-transition-l1').length,2);assert.throws(()=>new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:9,initial:'raw'}}),/source-owner/);
  const g=await probeFixture();g.context.createMediaElementSource(g.video);assert.throws(()=>g.context.createMediaElementSource(g.video),/source-owner/);assert.equal(g.sources(),1);
});

function scenarioFixture(rate=44100,hooks={}){
  const f=fixture(rate),path=require('node:path'),module=Buffer.from('owner unit packaged module');let stage=0,stopped=false,switches=0;const calls=[];
  const current=()=>{const x=clone(f.facts),id=stage===2?2:1;x.nodes=x.nodes.slice(0,id);x.producers=x.producers.slice(0,id+2);x.ledger=stage===2?x.ledger:x.ledger.slice(0,8);x.connected=[id];x.currentSrc=x.inputPlan.urls[id-1];x.contextState='running';x.paused=false;x.hidden=false;x.moduleLoads=['chrome-extension://actual/web/audio-transition-worklet.js'];x.readback=clone(x.stable[id===1?'a':'b'].readback);delete x.stable;if(hooks.facts)hooks.facts(x,stage);return x;};
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},waitForTimeout:async()=>{},locator:()=>({click:async()=>{stage=1;}}),evaluate:async(fn,arg)=>{
    if(fn.name==='installSourceOwnerProbe'){assert.deepEqual(arg,{sampleRate:rate});return;}
    calls.push(clone(arg));if(arg.kind==='prepare'){assert.deepEqual(arg.spec,f.facts.spec);return clone(f.facts.inputPlan);}if(arg.kind==='facts')return current();if(arg.kind==='stop'){stopped=true;return current();}
    if(arg.kind==='switch'){assert.equal(arg.aEnd,f.a.end);assert.equal(++switches,1);stage=2;return current();}
    if(arg.kind==='drain'){
      if(!stage||stopped&&!arg.failure)return [];const pos=stage===2?f.end:Math.ceil(f.a.end/128)*128,out=[];
      for(const p of f.facts.producers.filter(p=>p.id<stage+2)){
        const base=p.id===3?f.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===2&&e.packet.kind==='prepared').packet.frame:0,start=base+arg.cursors[p.id]*128;
        let end=Math.min(pos,start+Math.floor(rate/10/128)*128);if(arg.endFrame!==undefined)end=Math.min(end,Math.ceil(arg.endFrame/128)*128);if(end<=start)continue;
        const empty=p.id===2&&start>=f.facts.ledger.find(e=>e.type==='receive'&&e.nodeId===2&&e.packet.kind==='prepared').packet.frame+256,count=(end-start)/128,data=Buffer.alloc((end-start)*p.channels*4);for(let n=0;n<end-start;n++)for(let c=0;c<p.channels;c++)data.writeFloatLE(p.channels===5?[-1,1,1,1,0][c]:.01,(n*p.channels+c)*4);
        out.push({producerId:p.id,portId:p.id,nodeId:p.nodeId,sourceEpoch:p.sourceEpoch,kind:empty?'empty':'pcm',packetFrame:start,start,end,firstSequence:arg.cursors[p.id]+1,lastSequence:arg.cursors[p.id]+count,firstReceived:arg.cursors[p.id]+1,lastReceived:arg.cursors[p.id]+count,firstOffset:0,lastOffset:128,channels:empty?0:p.channels,...(!empty?{base64:data.toString('base64')}:{})});
      }if(hooks.drain)hooks.drain(out,stage);return out;
    }
    throw Error('unexpected owner action '+arg.kind);
  }};
  const read=f.files.readFile;f.files.readFile=async(file,encoding)=>{const bytes=file.endsWith('audio-transition-worklet.js')?module:file.startsWith('tests/')?Buffer.from('<html></html>'):null;return bytes?(encoding?bytes.toString(encoding):bytes):read(file,encoding);};f.files.ensureDirectory=async()=>{};
  const input={context:{route:async()=>{if(hooks.route)hooks.route();},newPage:async()=>page},worker:{evaluate:async()=>Array.from(module)},extensionId:'actual',artifactPath:path.join(f.files.root,f.directory)};
  return {...f,input,calls,module,execute:async()=>{const m=await load();assert.equal(typeof m.runProductSourceOwnerScenario,'function','R4 scenario is not connected');return m.runProductSourceOwnerScenario(input,f.files,{dist:path.join(f.files.root,'dist')},f.spec);},switches:()=>switches};
}

async function wrapper(f,execute){
  const {runProductAudio}=await import('../scripts/check-product-audio.mjs'),path=require('node:path'),source={sourceSha256:'owner-unit'},candidate={root:process.cwd(),dist:path.join(process.cwd(),'dist'),files:['dist/web/audio-transition-worklet.js']};
  return runProductAudio({runId:'OwnerUnit',caseId:f.spec.id},{platform:'win32',files:f.files,attest:async()=>source,verifyCandidate:async()=>candidate,execute:async options=>{await options.dependencies.verifyCandidate('OwnerUnit',process.cwd(),{retainEvidence:true});const result=execute?await execute(options):await options.dependencies.mediaScenario(f.input);await f.files.writeFile(f.directory+'/trace.zip',Buffer.from('unit trace'),{flag:'wx'});return {...result,ok:true,profileRetained:true,candidateRetained:true,source,after:source,shutdown:{browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true}};}});
}

for(const rate of [44100,48000,96000])test('R4 '+rate+' existing wrapper consumes one real scenario and saved sparse proof',async()=>{
  const f=scenarioFixture(rate),r=(await wrapper(f)).audioProduct;assert.equal(f.switches(),1);assert.equal(r.passed,true);assert.equal(r.qualityAssessed,false);assert.equal(r.outcome,'OWNERSHIP_OBSERVED');assert.equal(r.ownership.overallQualification,false);assert.equal(r.ownership.waveQuality,'UNASSESSED');assert.deepEqual(r.ownership.windows,{a:f.a,b:f.b});assert.equal(f.calls.filter(c=>c.kind==='switch').length,1);assert.ok(f.saved.has(f.directory+'/input-plan.json'));
});

test('R4 freezes its caller before the first await and refuses modified canonical inputs',async()=>{
  const f=scenarioFixture(44100,{route:()=>{f.spec.gain=2;}}),original=clone(f.spec),r=(await f.execute()).audioProduct;assert.deepEqual(r.spec,original);const m=await load();await assert.rejects(()=>m.runProductSourceOwnerScenario({},null,null,f.spec),/original-spec/);
});

for(const fault of ['port-origin','no-b-ack','extra-source','bridge-gap'])test('R4 '+fault+' stops once and retains partial failure',async()=>{
  const f=scenarioFixture(44100,{facts:(x,stage)=>{if(stage!==2)return;if(fault==='port-origin')x.ledger.find(e=>e.type==='receive'&&e.nodeId===2).portId=1;if(fault==='no-b-ack')x.ledger=x.ledger.filter(e=>!(e.type==='receive'&&e.nodeId===2&&e.packet.kind==='completed'));if(fault==='extra-source')x.sources=2;},drain:(r,stage)=>{if(fault==='bridge-gap'&&stage===2&&r.length)r[0].start++;}});
  await assert.rejects(f.execute,/source-owner/);assert.equal(f.switches(),1);assert.ok(f.saved.has(f.directory+'/partial.json'));assert.equal(f.saved.has(f.directory+'/assessment.json'),false);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.ok(p.error);assert.ok(p.archive.pcmBytes>0);
});

test('R4 wrapper replays saved evidence and rejects a rehashed producer transplant',async()=>{
  const f=scenarioFixture();await assert.rejects(()=>wrapper(f,async options=>{const result=await options.dependencies.mediaScenario(f.input),p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json'));p.rows.find(r=>r.producerId===2).sourceEpoch=8;f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));return result;}),e=>/source-owner/.test(e.error?.message??''));
});

for(const fault of ['late-a-completed','partial-disconnect','source-before-prepared','reconnect-closed-a'])test('R4 refuses forged lifecycle '+fault,async()=>{
  const f=await retained(),ledger=f.proof.facts.ledger;
  if(fault==='late-a-completed'){const i=ledger.findIndex(e=>e.nodeId===1&&e.packet?.kind==='completed');ledger.push(...ledger.splice(i,1));}
  if(fault==='partial-disconnect')ledger.find(e=>e.type==='node-disconnect').all=false;
  if(fault==='source-before-prepared'){const i=ledger.findIndex(e=>e.type==='source-connect'&&e.nodeId===2);ledger.splice(0,0,...ledger.splice(i,1));}
  if(fault==='reconnect-closed-a')ledger.push({type:'node-connect',nodeId:1});
  ledger.forEach((e,i)=>e.order=i+1);f.proof.facts.switchOrder=ledger.find(e=>e.type==='switch').order;f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(f.proof)));await assert.rejects(()=>(load()).then(m=>m.readSourceOwnerProof(f.files,f.directory,f.spec)),/source-owner/);
});

test('R4 preserves the actual nonfinite Float32 bytes in a bounded first failure snapshot',async()=>{
  const f=await probeFixture(),p=f.nodes.find(n=>n.options?.processorOptions?.producerId===0),bad=Float32Array.from({length:128},()=>NaN);p.receive({producerId:0,producerSequence:1,frame:0,samples:[bad,new Float32Array(128)]});const error=(await f.probe.action({kind:'facts'})).firstFailure;assert.equal(error.bytes,1024);assert.ok(Number.isNaN(Buffer.from(error.channels[0].base64,'base64').readFloatLE(0)));assert.ok(error.bytes<=5120);
});

test('R4 retains frozen unread valid buffers after a capture failure without creating a positive replay',async()=>{
  const f=await probeFixture(),p=f.nodes.find(n=>n.options?.processorOptions?.producerId===0);p.receive({producerId:0,producerSequence:1,frame:0,samples:[new Float32Array(128),new Float32Array(128)]});p.receive({producerId:1,producerSequence:2,frame:128,samples:[]});await assert.rejects(()=>f.probe.action({kind:'drain',cursors:[0,0,0,0]}));const rows=await f.probe.action({kind:'drain',cursors:[0,0,0,0],failure:true});assert.equal(rows.length,1);assert.equal(rows[0].firstReceived,1);assert.match((await f.probe.action({kind:'facts'})).error,/source-owner/);
});

test('R4 bounded URL loading allows old currentSrc until B loadeddata but no unrelated URL',async()=>{
  const f=await probeFixture(),spec=fixture().spec;await f.probe.action({kind:'prepare',spec});new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}});f.context.createMediaElementSource(f.video);const a=f.video.currentSrc;f.holdLoad();const switched=f.probe.action({kind:'switch',aEnd:8820});assert.notEqual(f.video.src,a);assert.equal(f.video.currentSrc,a);assert.equal((await f.probe.action({kind:'facts'})).error,null);f.releaseLoad();await switched;assert.equal((await f.probe.action({kind:'facts'})).error,null);f.video.currentSrc='blob:https://chzzk.naver.com/unrelated';assert.match((await f.probe.action({kind:'facts'})).error,/source-changed/);
});

test('R4 retained native packet tails are explicit and never extend the fixed bridge',async()=>{
  const f=await retained(),m=await load();assert.ok(f.proof.retainedTail.length>0);assert.ok(f.proof.retainedTail.every(r=>r.start>=f.b.end&&r.end>r.start));const r=await m.readSourceOwnerProof(f.files,f.directory,f.spec);assert.equal(r.assessment.bridge.end,f.b.end);delete f.proof.retainedTail;f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(f.proof)));await assert.rejects(()=>m.readSourceOwnerProof(f.files,f.directory,f.spec),/tail/);
});

test('R4 unexpected pause is not a silent successful ownership observation',async()=>{
  const f=await probeFixture();await f.probe.action({kind:'prepare',spec:fixture().spec});f.video.paused=true;assert.match((await f.probe.action({kind:'facts'})).error,/media-state/);
});

test('R4 stopping an in-flight URL load rejects it before late play or configure',async()=>{
  const f=await probeFixture();await f.probe.action({kind:'prepare',spec:fixture().spec});new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}});f.context.createMediaElementSource(f.video);f.holdLoad();let played=0;f.video.play=async()=>{played++;};const before=f.configured(),switched=f.probe.action({kind:'switch',aEnd:8820}),rejected=assert.rejects(switched,/stopped/);await f.probe.action({kind:'stop'});f.releaseLoad();await rejected;assert.equal(played,0);assert.equal(f.configured(),before);
});

for(const fault of ['connection','readback'])test('R4 A '+fault+' failure stops before source B is attempted',async()=>{
  const f=scenarioFixture(44100,{facts:(x,stage)=>{if(stage===1){if(fault==='connection')x.connected=[];else x.readback.state='unavailable';}}});await assert.rejects(f.execute,/source-owner/);assert.equal(f.switches(),0);assert.ok(f.saved.has(f.directory+'/partial.json'));
});

test('R4 actual failure path drains only frozen valid prefix and charges raw failure bytes',async()=>{
  const raw=Buffer.alloc(512);raw.writeFloatLE(NaN);const firstFailure={error:'audio-source-owner-capture-invalid',bytes:512,channels:[{encoding:'float32le',base64:raw.toString('base64')}]};
  const f=scenarioFixture(44100,{facts:(x,stage)=>{if(stage===1){x.error=firstFailure.error;x.firstFailure=firstFailure;}}});await assert.rejects(f.execute,/live-state/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.ok(p.proof.rows.length);assert.equal(p.proof.failureBytes,512);assert.equal(p.proof.chargedBytes,p.proof.pcmBytes+512);assert.equal(f.switches(),0);assert.ok(f.calls.some(c=>c.kind==='drain'&&c.failure===true));
});

for(const point of ['input-plan.json','segment-','source-owner-proof.json','assessment.json'])test('R4 deadline crossing at '+point+' preserves failure without another transition',async()=>{
  const f=scenarioFixture(),write=f.files.writeFile,now=Date.now,start=now();let crossed=false;Date.now=()=>crossed?start+90001:start;f.files.writeFile=async(...args)=>{const r=await write(...args);if(args[0].includes(point))crossed=true;return r;};
  try{await assert.rejects(f.execute,/scenario-timeout/);assert.equal(crossed,true);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(p.error,/scenario-timeout/);assert.ok(f.switches()<=1);if(point==='segment-')assert.equal(f.switches(),0);}finally{Date.now=now;}
});

test('R4 secondary snapshot/proof errors cannot replace the original failure',async()=>{
  const f=scenarioFixture(44100,{facts:(x,stage)=>{if(stage===1){x.error='original-capture-error';x.oversize='x'.repeat(1048576);}}});await assert.rejects(f.execute,/live-state/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(p.error,/live-state/);assert.ok(p.secondary.some(s=>/proof-cap/.test(s)));assert.ok(p.proof.rows.length);
});

test('R4 one 96MiB budget includes both epochs and failure reserve without resetting',async()=>{
  const m=await load(),f=fixture(96000);f.files.writeFile=async()=>{};const a=m.createSourceOwnerArchive(f.files,f.directory,f.spec),frames=Math.floor(9600/128)*128,pcm=[2,2,5,5].map(c=>Buffer.alloc(frames*c*4).toString('base64'));let cause;
  for(let n=0;n<300&&!cause;n++)for(let id=0;id<4;id++){
    const start=n*frames,r={producerId:id,portId:id,nodeId:id<2?null:id-1,sourceEpoch:id<2?null:id===2?7:8,kind:'pcm',packetFrame:start,start,end:start+frames,firstSequence:n*frames/128+1,lastSequence:(n+1)*frames/128,firstReceived:n*frames/128+1,lastReceived:(n+1)*frames/128,firstOffset:0,lastOffset:128,channels:id<2?2:5,base64:pcm[id]};try{await a.append(r);}catch(e){cause=e;break;}
  }
  assert.match(cause?.message??'',/pcm-cap/);const before=a.summary();assert.ok(before.pcmBytes>95*1024*1024);const raw=Buffer.alloc(512).toString('base64');a.recordFailure({bytes:1024,channels:[{encoding:'float32le',base64:raw},{encoding:'float32le',base64:raw}]});assert.equal(a.summary().chargedBytes,before.chargedBytes+1024);assert.ok(a.summary().chargedBytes<=96*1024*1024);
});

test('R4 a write completing after STOP remains an attempted write and cannot advance coverage',async()=>{
  const f=fixture(),m=await load();let finish;f.files.writeFile=()=>new Promise(resolve=>{finish=resolve;});const a=m.createSourceOwnerArchive(f.files,f.directory,f.spec),pending=a.append(f.records[0]);a.seal();finish();await assert.rejects(pending,/archive-stopped/);assert.equal(a.summary().rows,0);assert.equal(a.summary().attemptedWrites.length,1);assert.ok(a.summary().chargedBytes>0);
});

test('R4 capture processor emits actual native frame/sequence and distinguishes empty from zero input',async()=>{
  const f=await probeFixture(),vm=require('node:vm'),messages=[];let Capture;const sandbox={currentFrame:128,Float32Array,AudioWorkletProcessor:class{port={postMessage:r=>messages.push(r)};},registerProcessor:(name,ctor)=>{assert.equal(name,'source-owner-capture');Capture=ctor;}};vm.runInNewContext(f.captureCode,sandbox);const p=new Capture({processorOptions:{producerId:3}}),out=[new Float32Array(128).fill(5)];assert.equal(p.process([[]],[out]),true);sandbox.currentFrame=256;p.process([[new Float32Array(128)]],[out]);assert.equal(messages[0].samples.length,0);assert.equal(messages[0].frame,128);assert.equal(messages[1].frame,256);assert.equal(messages[1].producerSequence,2);assert.equal(messages[1].producerId,3);assert.ok(messages[1].samples[0].every(x=>x===0));assert.ok(out[0].every(x=>x===0));
});

test('R4 live capture stops at the single A-prepared 20 second history cap across epochs',async()=>{
  const f=await probeFixture(),a=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}});a.receive({kind:'prepared',sourceEpoch:7,seq:0,frame:0});const p=f.nodes.find(n=>n.options?.processorOptions?.producerId===0),frame=Math.ceil(20*44100/128)*128;p.receive({producerId:0,producerSequence:1,frame,samples:[new Float32Array(128),new Float32Array(128)]});assert.match((await f.probe.action({kind:'facts'})).error,/history-bound/);
});

function pendingFirstOn(x,stage=0){
  x.sources=0;x.connected=[];x.readback={state:'pending',wanted:true,gain:1,appliedGain:null,sources:0};x.nodes=x.nodes.slice(0,stage?1:0);x.producers=x.producers.slice(0,stage?3:0);x.ledger=stage?x.ledger.filter(e=>['constructor','node-connect'].includes(e.type)||stage===2&&e.type==='receive'&&e.packet.kind==='prepared'):[];x.ledger.forEach((e,i)=>e.order=i+1);
}

test('R4 first ON waits for empty and constructed pending states before its original ACK window',async()=>{
  let polls=0;const f=scenarioFixture(44100,{facts:(x,stage)=>{if(stage===1&&polls++<3)pendingFirstOn(x,polls-1);}});const result=await f.execute();assert.equal(result.audioProduct.outcome,'OWNERSHIP_OBSERVED');assert.equal(f.switches(),1);assert.ok(polls>=4);
});

test('R4 permanent first ON pending exhausts the existing polling bound without B',async()=>{
  let polls=0;const f=scenarioFixture(44100,{facts:(x,stage)=>{if(stage===1){polls++;pendingFirstOn(x);}}});await assert.rejects(f.execute,/ack-unformed/);assert.equal(f.switches(),0);assert.equal(polls,201);assert.ok(f.saved.has(f.directory+'/partial.json'));
});

for(const fault of ['port','epoch','seq','code','orphan'])test('R4 first ON pending does not hide prepared '+fault,async()=>{
  const f=scenarioFixture(44100,{facts:(x,stage)=>{if(stage===1){pendingFirstOn(x,2);const e=x.ledger.find(r=>r.type==='receive');if(fault==='port')e.portId=2;if(fault==='epoch')e.packet.sourceEpoch=8;if(fault==='seq')e.packet.seq=1;if(fault==='code')e.packet.code='failed';if(fault==='orphan')x.nodes=[];}}});await assert.rejects(f.execute,/source-owner/);assert.equal(f.switches(),0);
});

for(const fault of ['source-created','command-completed','source-seen'])test('R4 first ON pending cannot hide a formed source loss: '+fault,async()=>{
  let polls=0;const f=scenarioFixture(44100,{facts:(x,stage)=>{if(stage!==1)return;polls++;if(fault==='source-seen'&&polls===1){x.ledger=x.ledger.filter(e=>e.packet?.kind!=='completed');return;}const ledger=clone(x.ledger);pendingFirstOn(x,2);if(fault==='source-created')x.ledger=ledger.slice(0,6);if(fault==='command-completed')x.ledger=ledger;}});await assert.rejects(f.execute,/live-state/);assert.equal(f.switches(),0);
});

for(const fault of ['extra-source','context','hidden','error'])test('R4 pending first ON still stops immediately on '+fault,async()=>{
  let polls=0;const f=scenarioFixture(44100,{facts:(x,stage)=>{if(stage===1){polls++;pendingFirstOn(x);if(fault==='extra-source')x.sources=2;if(fault==='context')x.contextState='suspended';if(fault==='hidden')x.hidden=true;if(fault==='error')x.error='native-fault';}}});await assert.rejects(f.execute,/live-state/);assert.equal(f.switches(),0);assert.equal(polls,2);
});

test('R4 partial distinguishes the rejected polling state from the later stop snapshot',async()=>{
  let polls=0;const f=scenarioFixture(44100,{facts:(x,stage)=>{if(stage===1&&++polls===1)x.sources=2;}});await assert.rejects(f.execute,/live-state/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.observation.sources,2);assert.equal(p.proof.facts.sources,1);
});


test('dry-prefix caller selection is finite and distinct from independent dry and stable R4',async()=>{
  const m=await import('../scripts/extension-e2e/audio-product.mjs');
  for(const sampleRate of [44100,48000,96000]){
    const id=sampleRate+'/source-owner/dry-prefix',s=m.selectProductCase(id);assert.deepEqual(s,{id,sampleRate,frequency:1000,inputDbfs:-40,pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:false,equalizer:false});assert.ok(Object.isFrozen(s));assert.equal(m.parseProductAudioArgs(['--run-id=DryPrefixUnit','--case='+id]).caseId,id);assert.throws(()=>m.parseProductAudioArgs(['--run-id=DryPrefixUnit','--case='+id,'--component-witness']));
  }
  assert.throws(()=>m.selectProductCase('44100/source-owner/dry-prefix/extra'));
});
test('dry-prefix loading stays paused until explicit configure and rejects an extra product node',async()=>{
  const f=await probeFixture(44100,'dry-prefix'),spec={id:'44100/source-owner/dry-prefix',sampleRate:44100,frequency:1000,inputDbfs:-40,pattern:'stereo',phase:.37,seconds:90,gain:1,normalizer:false,compressor:false,equalizer:false};let plays=0;
  f.video.pause=()=>{f.video.paused=true;};f.video.play=async()=>{plays++;f.video.paused=false;};let wanted=false;
  f.runtime.audio.getReadback=()=>({state:wanted?'on':'off',sources:f.sources(),wanted,gain:1,appliedGain:wanted?1:null});f.runtime.audio.setEnabled=async(_v,on)=>{wanted=on;return on?'on':'off';};
  await f.probe.action({kind:'prepare',spec});const first=Buffer.from(await f.blobs.get(f.video.src).arrayBuffer());assert.equal(first.readUInt32LE(24),44100);assert.equal(first.readUInt16LE(20),3);assert.equal(first.readUInt16LE(22),2);assert.equal(first.length,44+44100*90*8);assert.equal(first.subarray(44,60).toString('hex'),'7693a73b7693a73b033ae33b033ae33b');assert.equal(plays,0);assert.equal(f.video.paused,true);assert.equal((await f.probe.action({kind:'facts'})).error,null);
  const node=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}}),source=f.context.createMediaElementSource(f.video);source.connect(node);node.connect({},0);
  await f.probe.action({kind:'history-configure',enabled:true});await f.probe.action({kind:'history-configure',enabled:false});source.disconnect(node);node.disconnect();node.port.close();
  const before=f.configured();await f.probe.action({kind:'history-next',stage:1});assert.equal(f.configured(),before);const dc=Buffer.from(await f.blobs.get(f.video.src).arrayBuffer());for(const at of [44,48,dc.length-4])assert.equal(dc.subarray(at,at+4).toString('hex'),'0000803f');assert.equal(plays,2);assert.equal(f.video.paused,true);assert.equal((await f.probe.action({kind:'facts'})).error,null);await f.probe.action({kind:'history-configure',enabled:false});assert.equal(plays,3);
  assert.throws(()=>new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:8,initial:'raw'}}),/source-owner/);
});


let nKernel;
const nTraces=new Map();
function normalizerKernelTrace(rate,base,targetOffset=1152){
  const key=rate+'/'+base+'/'+targetOffset;if(nTraces.has(key))return nTraces.get(key);
  if(!nKernel){const box={exports:{}};require('node:vm').runInNewContext(require('esbuild').buildSync({entryPoints:['src/main/features/audio/transition.ts'],bundle:true,write:false,format:'cjs',platform:'browser'}).outputFiles[0].text,{module:box,exports:box.exports,Float32Array,Float64Array,Number,Math,Date});nKernel=box.exports;}
  const k=nKernel,state=k.createTransition(rate,37,'raw',true,true),count=Math.ceil(12*rate/128)*128,n=new Float32Array(count),commands=[],pending=[],prepared=clone(k.transitionReply(state,'prepared',base)),ordered=[{direction:'receive',packet:prepared}];let meterSeq=0,nextMeter=base+targetOffset+128;
  const cfg=(seq,combined)=>({kind:'configure',sourceEpoch:37,seq,wanted:true,gain:combined?2:1,eq:Array(8).fill(combined?6:0),normalizer:combined,dynamics:combined,targetDbfs:combined?-12:-20});
  for(let frame=base;frame<base+count;frame+=128){
    if(frame===base+128||frame===base+targetOffset){const message=cfg(commands.length+1,commands.length===1),accepted=clone(k.acceptCommand(state,message,frame,0));commands.push({message,accepted,completed:null});ordered.push({direction:'send',packet:clone(message)},{direction:'receive',packet:clone(accepted)});}
    let meter=null;if(frame>=nextMeter&&state.normEnabled){meter={kind:'power',sourceEpoch:37,meterEpoch:state.meterEpoch,meterSeq:++meterSeq,observedTime:frame/rate,leftPower:1e-5,rightPower:1e-5,active:true,targetDbfs:-12};k.acceptMeter(state,meter);ordered.push({direction:'send',packet:clone(meter)});nextMeter=base+targetOffset+128+Math.ceil(meterSeq*rate/10/128)*128;}
    const a=()=>new Float32Array(128),control=Array.from({length:5},a),reply=k.renderTransition(state,[a(),a()],frame,128,new Float32Array([0]),[a(),a()],control,!!meter);n.set(control[3],frame-base);
    if(meter){pending.push({available:frame+128,type:'send',packet:clone(meter)});pending.push({available:frame+128,type:'receive',packet:clone({...k.transitionReply(state,'meter-accepted',frame,state.normStatus),seq:meter.meterSeq,application:state.normalizerApplication,renderHeadroom:state.renderHeadroom})});ordered.push({direction:'receive',packet:clone(pending.at(-1).packet)});}
    if(reply){const c=commands.find(c=>c.message.seq===reply.seq);if(c)c.completed=clone(reply);ordered.push({direction:'receive',packet:clone(reply)});pending.push({available:frame+128,type:'receive',packet:clone(reply)});}
  }
  const value={prepared,commands,pending,n,base,ordered};nTraces.set(key,value);return value;
}
function firstExtremeMeter(f){const q=f.ledger.filter(e=>e.type==='history-capture'&&e.stage===4).at(-1)?.frame;return q===undefined?undefined:f.ledger.find(e=>e.nodeId===3&&e.packet?.kind==='meter-accepted'&&e.packet.frame>=q);}

async function dryPrefixFixture(rate=44100,hooks={},wet=false,extreme=false){
  const m=await load(),spec=(extreme?m.SOURCE_EXTREME_HISTORY_CASES:wet?m.SOURCE_WET_HISTORY_CASES:m.SOURCE_HISTORY_CASES).find(s=>s.sampleRate===rate),f=fixture(rate),path=require('node:path');f.spec=spec;let slot=0,on=false,closed=false,position=0,wall=0,requests=0,stopped=false,wetStart=null,extremeStart=null,queryFrame=null,trace=null,traceCursor=0;const calls=[],ledger=[],phasesAt=[0],urls=[0,1,2,...(extreme?[3]:[])].map(i=>'blob:https://chzzk.naver.com/dry'+i),inputs=[0,1,2,...(extreme?[3]:[])].map(stage=>({stage,url:urls[stage],sha256:String(stage+1).repeat(64),frequency:1000,inputDbfs:stage===0?-40:stage===1?0:stage===2?20*Math.log10(.99):-6,pattern:stage===1||stage===2?'dc':'stereo',phase:.37,channels:2,frames:rate*90}));
  const note=(type,data={})=>ledger.push({order:ledger.length+1,type,...clone(data)}),stamp=()=>({frame:position,wall}),packet=(kind,seq,frame,gain=null)=>({kind,sourceEpoch:7,seq,frame,meterEpoch:seq===0?0:seq===1?0:1,gain,code:null}),cfg=wanted=>({kind:'configure',sourceEpoch:7,seq:wanted?1:2,wanted,gain:1,eq:Array(8).fill(0),normalizer:false,dynamics:false,targetDbfs:-20});
  const plan=()=>({spec:clone(spec),urls:urls.slice(0,slot+1),inputs:clone(inputs.slice(0,slot+1)),sameBlob:false});
  const snapshot=()=>({profile:extreme?'extreme-prefix':wet?'wet-prefix':'dry-prefix',audioTime:position/rate,slot,sources:on?1:0,contextId:1,elementId:1,error:null,firstFailure:null,inputPlan:plan(),switchOrder:0,moduleLoads:['chrome-extension://actual/web/audio-transition-worklet.js'],nodes:on?[{id:1,portId:1,contextId:1,sourceEpoch:7,initial:'raw',options:{sourceEpoch:7,initial:'raw'},producerId:2},...(wetStart===null?[]:[{id:2,portId:2,contextId:1,sourceEpoch:8,initial:'raw',options:{sourceEpoch:8,initial:'raw'},producerId:3}]),...(extremeStart===null?[]:[{id:3,portId:3,contextId:1,sourceEpoch:37,initial:'raw',options:{sourceEpoch:37,initial:'raw',normalizerWitness:true,headroomWitness:true},producerId:4}])]:[],producers:(on?wetStart===null?[0,1,2]:extremeStart===null?[0,1,2,3]:[0,1,2,3,4]:[0,1]).map(id=>({id,portId:id,role:id===0?'program':id===1?'source':'control',channels:id<2?2:5,contextId:1,nodeId:id<2?null:id-1,sourceEpoch:id<2?null:id===2?7:id===3?8:37})),ledger:clone(ledger),connected:extremeStart!==null?[3]:wetStart!==null?[2]:on&&!closed?[1]:[],currentSrc:urls[slot],paused:false,contextState:'running',hidden:false,readback:{state:wetStart!==null||on&&!closed?'on':'off',wanted:wetStart!==null||on&&!closed,gain:wetStart===null?1:2,appliedGain:wetStart!==null?2:on&&!closed?1:null,sources:on?1:0}});
  const sourceValue=n=>n<(phasesAt[1]??Infinity)?Math.SQRT2*1e-2*Math.sin(2*Math.PI*1000*n/rate+.37):n<(phasesAt[2]??Infinity)?1:n<(phasesAt[3]??Infinity)?Math.fround(.99):Math.SQRT2*10**(-6/20)*Math.sin(2*Math.PI*1000*(n-phasesAt[3])/rate+.37);
  const capture=(start,end,pid=0)=>{const channels=Array.from({length:2},()=>new Float32Array(end-start));for(let n=start;n<end;n++){let v=sourceValue(n);if(pid===0&&wetStart!==null&&n>=wetStart)v=.98;if(pid===0&&extremeStart!==null&&n>=extremeStart)v=.5;if(pid===0&&hooks.program)v=hooks.program(v,n,extremeStart!==null?4:wetStart===null?slot:3);for(const [ch,c]of channels.entries())c[n-start]=pid===1&&hooks.source?hooks.source(v,n,extremeStart!==null?4:slot,ch):v;}return {rate,start,end,channels};};
  const page={setDefaultTimeout(){},on(){},goto:async()=>{},bringToFront:async()=>{},waitForFunction:async()=>{},waitForTimeout:async ms=>{wall+=ms;position+=Math.round(ms*rate/1000);},locator:()=>({click:async()=>{on=true;note('constructor',{nodeId:1});note('receive',{nodeId:1,portId:1,packet:packet('prepared',0,0)});note('node-connect',{nodeId:1});note('source-create',{sourceHandle:1});note('source-connect',{nodeId:1,sourceHandle:1});note('send',{nodeId:1,portId:1,packet:cfg(true)});note('receive',{nodeId:1,portId:1,packet:packet('accepted',1,128)});note('receive',{nodeId:1,portId:1,packet:packet('completed',1,1024,1)});}}),evaluate:async(fn,arg)=>{
    if(fn.name==='installSourceOwnerProbe'){assert.deepEqual(arg,{sampleRate:rate,profile:extreme?'extreme-prefix':wet?'wet-prefix':'dry-prefix'});return;}calls.push(clone(arg));
    if(arg.kind==='prepare'){assert.deepEqual(arg.spec,spec);note('history-signal',{stage:0,fromUrl:null,toUrl:urls[0],sha256:inputs[0].sha256,...stamp()});note('history-loaded',{stage:0,url:urls[0],...stamp()});return plan();}
    if(arg.kind==='facts'||arg.kind==='stop'){if(trace)while(traceCursor<trace.pending.length&&trace.pending[traceCursor].available<=position){const e=trace.pending[traceCursor++];if(e.packet.kind==='completed'&&e.packet.seq===1)continue;note(e.type,{nodeId:3,portId:3,packet:e.packet});}if(arg.kind==='stop')stopped=true;const f=snapshot();hooks.facts?.(f,extremeStart===null?slot:4);return f;}
    if(arg.kind==='history-configure'){
      assert.equal(arg.enabled,requests===0);note('history-request',{index:requests,stage:slot,enabled:arg.enabled,...stamp()});
      if(requests===1){note('send',{nodeId:1,portId:1,packet:cfg(false)});note('receive',{nodeId:1,portId:1,packet:packet('accepted',2,position)});note('receive',{nodeId:1,portId:1,packet:packet('completed',2,position,1)});note('send',{nodeId:1,portId:1,packet:{kind:'retire',sourceEpoch:7,seq:3}});note('receive',{nodeId:1,portId:1,packet:packet('retired',3,position)});note('source-disconnect',{nodeId:1,sourceHandle:1});note('node-disconnect',{nodeId:1,all:true});note('port-close',{nodeId:1});closed=true;}
      note('history-return',{index:requests++,stage:slot,enabled:arg.enabled,...stamp(),status:arg.enabled?'on':'off'});return {frame:position,status:arg.enabled?'on':'off'};
    }
    if(arg.kind==='history-next'){assert.equal(arg.stage,slot+1);hooks.next?.(arg.stage);slot++;phasesAt[slot]=position;note('history-signal',{stage:slot,fromUrl:urls[slot-1],toUrl:urls[slot],sha256:inputs[slot].sha256,...stamp()});note('history-loaded',{stage:slot,url:urls[slot],...stamp()});return plan();}
    if(arg.kind==='history-wet'){assert.equal(wet,true);assert.equal(requests,4);assert.equal(slot,2);assert.equal(wetStart,null);wetStart=Math.ceil(position/128)*128;note('history-wet-request',{frame:position,wall});const pk=(kind,seq,frame,gain=null)=>({kind,sourceEpoch:8,seq,frame,meterEpoch:seq?1:0,gain,code:null});note('constructor',{nodeId:2});note('receive',{nodeId:2,portId:2,packet:pk('prepared',0,wetStart)});for(let i=0;i<3;i++)note('node-connect',{nodeId:2});note('source-connect',{nodeId:2,sourceHandle:1});note('send',{nodeId:2,portId:2,packet:{...cfg(true),sourceEpoch:8,gain:2}});note('receive',{nodeId:2,portId:2,packet:pk('accepted',1,wetStart+128)});note('history-wet-return',{frame:position,wall,status:'on'});note('receive',{nodeId:2,portId:2,packet:pk('completed',1,wetStart+1024,2)});return {frame:position,status:'on'};}
    if(arg.kind==='history-extreme-load'){
      assert.equal(extreme,true);assert.equal(slot,2);assert.ok(wetStart!==null);slot=3;phasesAt[3]=position;note('history-signal',{stage:3,fromUrl:urls[2],toUrl:urls[3],sha256:inputs[3].sha256,...stamp()});note('source-disconnect',{nodeId:2,sourceHandle:1});note('node-disconnect',{nodeId:2,all:true});note('port-close',{nodeId:2});extremeStart=Math.ceil(position/128)*128;
      trace=normalizerKernelTrace(rate,extremeStart,hooks.targetOffset??1152);note('constructor',{nodeId:3});note('receive',{nodeId:3,portId:3,packet:trace.prepared});for(let i=0;i<3;i++)note('node-connect',{nodeId:3});note('source-connect',{nodeId:3,sourceHandle:1});const baseline=trace.commands[0];note('send',{nodeId:3,portId:3,packet:baseline.message});note('receive',{nodeId:3,portId:3,packet:baseline.accepted});if(baseline.completed)note('receive',{nodeId:3,portId:3,packet:baseline.completed});note('history-loaded',{stage:3,url:urls[3],...stamp()});return plan();
    }
    if(arg.kind==='history-extreme-configure'){
      const frame=position;note('history-extreme-request',{frame,wall});const target=trace.commands[1];note('send',{nodeId:3,portId:3,packet:target.message});note('receive',{nodeId:3,portId:3,packet:target.accepted});note('history-extreme-return',{frame,wall,status:'on'});return {frame,status:'on'};
    }
    if(arg.kind==='history-capture'){hooks.beforeCapture?.(extremeStart!==null?4:wetStart===null?slot:3);const end=Math.floor(position/128)*128,start=end-rate;note('history-capture',{stage:extremeStart!==null?4:wetStart===null?slot:3,start,end,producerId:0,lastReceived:end/128,producerSequence:end/128,packetFrame:end-128,...stamp()});if(extremeStart!==null)queryFrame=position;const c=capture(start,end);return {...c,channels:c.channels.map(c=>Array.from(c))};}
    if(arg.kind==='drain'){
      if(!on)return [];const end=Math.floor(position/128)*128,out=[];
      for(let id=0;id<(wetStart===null?3:extremeStart===null?4:5);id++){const start=(id===4?extremeStart:id===3?wetStart:0)+arg.cursors[id]*128,stop=Math.min(end,start+Math.floor(rate/10/128)*128);if(stop<=start)continue;const count=(stop-start)/128,empty=id===2&&closed||id===3&&extremeStart!==null,channels=id>=2?5:2,data=Buffer.alloc((stop-start)*channels*4);if(!empty){if(id<2){const c=capture(start,stop,id);for(let n=0;n<stop-start;n++)for(let ch=0;ch<2;ch++)data.writeFloatLE(c.channels[ch][n],(n*2+ch)*4);}else for(let n=0;n<stop-start;n++)for(let ch=0;ch<5;ch++)data.writeFloatLE((id===4?[-1,1,2,trace.n[start+n-extremeStart],0]:id===3?[-1,1,2,1,0]:[-1,1,1,1,0])[ch],(n*5+ch)*4);}
        out.push({producerId:id,portId:id,nodeId:id<2?null:id-1,sourceEpoch:id<2?null:id===2?7:id===3?8:37,kind:empty?'empty':'pcm',packetFrame:start,start,end:stop,firstSequence:arg.cursors[id]+1,lastSequence:arg.cursors[id]+count,firstReceived:arg.cursors[id]+1,lastReceived:arg.cursors[id]+count,firstOffset:0,lastOffset:128,channels:empty?0:channels,...(!empty?{base64:data.toString('base64')}:{})});
      }return out;
    }
    throw Error('unexpected dry-prefix '+arg.kind);
  }};
  const read=f.files.readFile,module=Buffer.from('dry prefix synthetic module');f.files.readFile=async(file,encoding)=>{const b=file.endsWith('audio-transition-worklet.js')?module:file.startsWith('tests/')?Buffer.from('<html></html>'):null;return b?encoding?b.toString(encoding):b:read(file,encoding);};f.files.ensureDirectory=async()=>{};
  const input={context:{route:async()=>{},newPage:async()=>page},worker:{evaluate:async()=>Array.from(module)},extensionId:'actual',artifactPath:path.join(f.files.root,f.directory)};
  const withClock=async work=>{const d=Object.getOwnPropertyDescriptor(performance,'now');Object.defineProperty(performance,'now',{configurable:true,value:()=>wall});try{return await work();}finally{if(d)Object.defineProperty(performance,'now',d);else delete performance.now;}};
  return {...f,spec,input,withClock,execute:()=>withClock(()=>m.runProductSourceOwnerScenario(input,f.files,{dist:path.join(f.files.root,'dist')},spec)),page,calls,module,isStopped:()=>stopped};
}
for(const rate of [44100,48000,96000])test('dry-prefix actual scenario consumes both original windows and saved replay '+rate,async()=>{
  const f=await dryPrefixFixture(rate),r=(await f.execute()).audioProduct,m=await load();assert.equal(r.passed,true);assert.equal(r.schema,'f01-source-dry-prefix-observation-v1');assert.equal(r.dryPrefix.overallQualification,false);assert.deepEqual(r.dryPrefix.phases.map(p=>p.level),[1,.99]);assert.equal(f.calls.filter(c=>c.kind==='history-capture').length,2);assert.equal(f.calls.filter(c=>c.kind==='history-configure'&&c.enabled).length,1);await m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec);
});
test('dry-prefix first RMS failure preserves raw and skips the second source instead of retrying',async()=>{
  const f=await dryPrefixFixture(44100,{program:(v,n,stage)=>stage===1?v*.9:v});await assert.rejects(()=>f.execute(),/dry-rms/);assert.equal(f.calls.filter(c=>c.kind==='history-capture').length,1);assert.equal(f.calls.some(c=>c.kind==='history-next'&&c.stage===2),false);assert.ok(f.saved.has(f.directory+'/dry-prefix-1.f32le'));assert.equal(f.saved.has(f.directory+'/assessment.json'),false);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.dryPrefix.phases[0].assessment.qualityAssessed,true);assert.equal(p.dryPrefix.phases[0].assessment.passed,false);
});


test('dry-prefix fixed priming source identity stops before OFF or DC1 for a wrong original input',async()=>{
  for(const fault of ['silence','level','frequency','polarity']){
    const f=await dryPrefixFixture(44100,{source:(v,n,stage,ch)=>stage===0?fault==='silence'?0:fault==='level'?v*10:fault==='frequency'?Math.SQRT2*1e-2*Math.sin(2*Math.PI*750*n/44100+.37):ch===1?-v:v:v});
    await assert.rejects(()=>f.execute(),/dry-prime-input/);assert.equal(f.calls.some(c=>c.kind==='history-next'),false);assert.equal(f.calls.some(c=>c.kind==='history-configure'&&c.enabled===false),false);assert.ok(f.saved.has(f.directory+'/partial.json'));
  }
});


test('dry-prefix saved proof rejects history clock owner ACK and caller donors',async()=>{
  const f=await dryPrefixFixture(),r=(await f.execute()).audioProduct,m=await load(),saved=[...f.saved].map(([k,v])=>[k,Buffer.from(v)]);
  for(const fault of ['inputs','source-handle','context','re-on','ON-ack-order','OFF-ack-order','prepared-epoch','wire-key','clock','latest','missing-empty','raw','caller','old-method']){
    f.saved.clear();for(const [k,v]of saved)f.saved.set(k,Buffer.from(v));const p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json')),h=p.facts.dryPrefix,events=p.facts.ledger,report=clone(r);let spec=f.spec;
    if(fault==='inputs')[p.facts.inputPlan.inputs[1],p.facts.inputPlan.inputs[2]]=[p.facts.inputPlan.inputs[2],p.facts.inputPlan.inputs[1]];
    if(fault==='source-handle')events.find(e=>e.type==='source-create').sourceHandle=2;if(fault==='context')p.facts.contextId=2;if(fault==='re-on')events.find(e=>e.type==='send'&&e.packet.seq===2).packet.wanted=true;
    if(fault==='ON-ack-order'||fault==='OFF-ack-order'){const seq=fault==='ON-ack-order'?1:2,a=events.findIndex(e=>e.type==='receive'&&e.packet.kind==='accepted'&&e.packet.seq===seq),b=events.findIndex(e=>e.type==='receive'&&e.packet.kind==='completed'&&e.packet.seq===seq);[events[a],events[b]]=[events[b],events[a]];events.forEach((e,i)=>e.order=i+1);}
    if(fault==='prepared-epoch')events.find(e=>e.type==='receive'&&e.packet.kind==='prepared').packet.meterEpoch=4;if(fault==='wire-key')events.find(e=>e.type==='receive').packet.extra=true;
    if(fault==='clock')h.phases[0].settling.end=h.phases[0].settling.start+1249;if(fault==='latest')events.find(e=>e.type==='history-capture').lastReceived--;
    if(fault==='missing-empty')p.rows=p.rows.filter(row=>row.producerId!==2);if(fault==='raw'){const file=h.phases[0].capture.file,b=Buffer.from(f.saved.get(file));b.writeFloatLE(.8,0);f.saved.set(file,b);h.phases[0].capture.sha256=require('node:crypto').createHash('sha256').update(b).digest('hex');}
    if(fault==='caller')spec={...f.spec,sampleRate:48000};if(fault==='old-method')report.schema='f01-source-owner-observation-v1';
    f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,report,spec),/source-owner/,fault);
  }
});

test('dry-prefix preserved priming source bytes cannot be rehashed into another input',async()=>{
  const f=await dryPrefixFixture(),r=(await f.execute()).audioProduct,m=await load(),p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json')),w=p.facts.dryPrefix.priming.inputIdentity;
  for(const row of p.rows.filter(r=>r.producerId===1&&r.kind==='pcm'&&r.end>w.start&&r.start<w.end)){
    const b=Buffer.from(f.saved.get(row.file));for(let n=Math.max(row.start,w.start);n<Math.min(row.end,w.end);n++)for(let c=0;c<2;c++)b.writeFloatLE(0,((n-row.start)*2+c)*4);row.sha256=require('node:crypto').createHash('sha256').update(b).digest('hex');f.saved.set(row.file,b);
  }
  f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/dry-prime-input/);
});

test('dry-prefix actual probe retains the first latest window after drain and refuses capture retry',async()=>{
  const f=await probeFixture(44100,'dry-prefix'),spec=(await load()).SOURCE_HISTORY_CASES[0];let wanted=false;
  f.video.pause=()=>{f.video.paused=true;};f.video.play=async()=>{f.video.paused=false;};f.runtime.audio.getReadback=()=>({state:wanted?'on':'off',sources:f.sources(),wanted,gain:1,appliedGain:wanted?1:null});f.runtime.audio.setEnabled=async(_,v)=>{wanted=v;return v?'on':'off';};
  await f.probe.action({kind:'prepare',spec});const node=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}}),source=f.context.createMediaElementSource(f.video);source.connect(node);node.connect({},0);await f.probe.action({kind:'history-configure',enabled:true});await f.probe.action({kind:'history-configure',enabled:false});source.disconnect(node);node.disconnect();node.port.close();await f.probe.action({kind:'history-next',stage:1});await f.probe.action({kind:'history-configure',enabled:false});
  const program=f.nodes.find(n=>n.options?.processorOptions?.producerId===0);for(let seq=1;seq<=500;seq++)program.receive({producerId:0,producerSequence:seq,frame:(seq-1)*128,samples:[new Float32Array(128).fill(1),new Float32Array(128).fill(1)]});f.context.currentTime=64000/44100;
  let cursor=0;for(;;){const rows=await f.probe.action({kind:'drain',cursors:[cursor,0,0,0]}),last=rows.find(r=>r.producerId===0);if(!last)break;cursor=last.lastReceived;}
  const raw=await f.probe.action({kind:'history-capture'});assert.equal(raw.end,64000);assert.equal(raw.start,19900);assert.equal(raw.channels[0].length,44100);assert.ok(raw.channels.every(c=>c.every(v=>v===1)));const marker=(await f.probe.action({kind:'facts'})).ledger.find(e=>e.type==='history-capture');assert.equal(marker.lastReceived,500);assert.equal(marker.packetFrame,63872);await assert.rejects(()=>f.probe.action({kind:'history-capture'}),/history-capture/);
  const previous=f.video.currentSrc;f.holdLoad();const pending=f.probe.action({kind:'history-next',stage:2});for(let i=0;i<200&&f.video.src===previous;i++)await new Promise(r=>setTimeout(r,1));assert.notEqual(f.video.src,previous);assert.equal(f.video.currentSrc,previous);assert.equal((await f.probe.action({kind:'facts'})).error,null);f.releaseLoad();await pending;const dc99=Buffer.from(await f.blobs.get(f.video.src).arrayBuffer());for(const at of [44,48,dc99.length-4])assert.equal(dc99.subarray(at,at+4).toString('hex'),'a4707d3f');await f.probe.action({kind:'history-configure',enabled:false});f.video.currentSrc='blob:https://chzzk.naver.com/foreign';await assert.rejects(()=>f.probe.action({kind:'history-capture'}),/source-changed/);assert.equal((await f.probe.action({kind:'facts'})).ledger.filter(e=>e.type==='history-capture').length,1);
});

test('dry-prefix keeps original RMS-only output meaning and checks formation before a next stage',async()=>{
  const negative=await dryPrefixFixture(44100,{program:(v,n,stage)=>stage>0?-v:v});assert.equal((await negative.execute()).audioProduct.passed,true);
  const bad=await dryPrefixFixture(44100,{facts:(f,stage)=>{if(stage===1)f.connected=[1];}});await assert.rejects(()=>bad.execute(),/dry-owner/);assert.equal(bad.calls.some(c=>c.kind==='history-next'&&c.stage===2),false);const p=JSON.parse(bad.saved.get(bad.directory+'/partial.json'));assert.equal(p.pendingCapture.bytes,44100*8);assert.equal(bad.saved.get(p.pendingCapture.file).length,44100*8);assert.equal(p.pendingCapture.writeStatus,'completed');
});

test('dry-prefix pending capture timeout preserves raw and cannot become a late success',async()=>{
  const f=await dryPrefixFixture(),write=f.files.writeFile,timer=global.setTimeout;let release,began;const held=new Promise(r=>{release=r;}),started=new Promise(r=>{began=r;});
  f.files.writeFile=async(file,...args)=>{if(file.endsWith('dry-prefix-1.f32le')){began();await held;}return write(file,...args);};global.setTimeout=(fn,ms,...args)=>timer(fn,ms===5000?10:ms,...args);
  try{const pending=f.execute(),failed=assert.rejects(pending,/timeout|capture-save/);await started;await failed;const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.pendingCapture.bytes,44100*8);assert.equal(f.saved.get(p.pendingCapture.file).length,44100*8);assert.equal(p.pendingCapture.writeStatus,'completed');assert.match(p.dryPrefix.phases[0].capture.writeStatus,/unknown/);assert.equal(f.calls.some(c=>c.kind==='history-next'&&c.stage===2),false);release();await new Promise(r=>timer(r,5));assert.equal(f.saved.has(f.directory+'/assessment.json'),false);assert.match(JSON.parse(f.saved.get(f.directory+'/partial.json')).dryPrefix.phases[0].capture.writeStatus,/unknown/);}finally{release();global.setTimeout=timer;}
});


test('dry-prefix accepts the actual retired-only wire without inventing an accepted retire ACK',async()=>{
  const f=await dryPrefixFixture(44100,{facts:f=>{f.ledger=f.ledger.filter(e=>!(e.type==='receive'&&e.packet.kind==='accepted'&&e.packet.seq===3));f.ledger.forEach((e,i)=>e.order=i+1);}});assert.equal((await f.execute()).audioProduct.passed,true);
});


test('dry-prefix does not require cancelled OFF ACKs or add a new RMS polarity criterion',async()=>{
  const f=await dryPrefixFixture(44100,{facts:f=>{f.ledger=f.ledger.filter(e=>!(e.type==='receive'&&e.packet.seq>=2||e.type==='send'&&e.packet.kind==='retire'));f.ledger.forEach((e,i)=>e.order=i+1);}});assert.equal((await f.execute()).audioProduct.passed,true);
  for(const delta of [.000009,.000011]){const f=await dryPrefixFixture(44100,{program:(v,n,stage)=>stage===1?v-delta:v});if(delta<1e-5)assert.equal((await f.execute()).audioProduct.passed,true);else await assert.rejects(()=>f.execute(),/dry-rms/);}
});

test('dry-prefix capture recovery failure keeps the frozen primary and explicitly unconfirmed disk evidence',async()=>{
  const f=await dryPrefixFixture(),evaluate=f.page.evaluate,write=f.files.writeFile,primary=Object.freeze(Error('frozen-primary-facts'));
  f.page.evaluate=async(fn,arg)=>{if(arg?.kind==='facts'&&f.calls.some(c=>c.kind==='history-capture'))throw primary;return evaluate(fn,arg);};f.files.writeFile=async(file,...args)=>{if(file.endsWith('dry-prefix-pending.f32le'))throw Error('capture-recovery-disk-failed');return write(file,...args);};
  await assert.rejects(()=>f.execute(),e=>e.message===primary.message&&e.cause===primary&&/capture-recovery-disk-failed/.test(e.evidenceError));const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.match(p.error,/frozen-primary-facts/);assert.match(p.pendingCapture.writeStatus,/unconfirmed/);assert.match(p.pendingCapture.error,/disk-failed/);assert.equal(p.pendingCapture.base64,undefined);assert.equal(f.saved.has(p.pendingCapture.file),false);assert.equal(f.calls.some(c=>c.kind==='history-next'&&c.stage===2),false);
});

test('dry-prefix reserves both captures and one failure binary before any archive append',async()=>{
  const m=await load(),spec=m.SOURCE_HISTORY_CASES[2],f=fixture(96000);let writes=0;f.files.writeFile=async()=>{writes++;};const a=m.createSourceOwnerArchive(f.files,f.directory,spec),frames=9600,chunk=Buffer.alloc(frames*5*4).toString('base64');let thrown;
  for(let i=0;i<2000;i++)try{await a.append({producerId:2,portId:2,nodeId:1,sourceEpoch:7,kind:'pcm',packetFrame:i*frames,start:i*frames,end:(i+1)*frames,firstSequence:i*75+1,lastSequence:(i+1)*75,firstReceived:i*75+1,lastReceived:(i+1)*75,firstOffset:0,lastOffset:128,channels:5,base64:chunk});}catch(e){thrown=e;break;}
  assert.match(thrown?.message??'',/pcm-cap/);const b=a.summary();assert.equal(b.reservedBytes,96000*24);assert.ok(b.chargedBytes+b.reservedBytes+5120<=96*1024*1024);assert.ok(b.chargedBytes+b.reservedBytes+5120+frames*5*4>96*1024*1024);assert.equal(writes,b.rows);
});


test('dry-prefix rejects a retire preceding OFF completion or changing its meter epoch',async()=>{
  for(const fault of ['order','epoch']){
    const f=await dryPrefixFixture(44100,{facts:f=>{const events=f.ledger,retired=events.find(e=>e.type==='receive'&&e.packet.kind==='retired');if(!retired)return;if(fault==='epoch')retired.packet.meterEpoch++;else{const send=events.find(e=>e.type==='send'&&e.packet.kind==='retire'),done=events.find(e=>e.type==='receive'&&e.packet.kind==='completed'&&e.packet.seq===2);f.ledger=events.filter(e=>e!==send&&e!==retired);f.ledger.splice(f.ledger.indexOf(done),0,send,retired);f.ledger.forEach((e,i)=>e.order=i+1);}}});await assert.rejects(()=>f.execute(),/dry-retire/);assert.equal(f.calls.some(c=>c.kind==='history-next'&&c.stage===2),false);
  }
});


test('wet-prefix finite caller preserves the original comp-OFF Gain2 continuation',async()=>{
  const m=await import('../scripts/extension-e2e/audio-product.mjs');
  for(const rate of [44100,48000,96000]){
    const spec=m.selectProductCase(rate+'/source-owner/wet-prefix');assert.equal(spec.compressor,false);assert.equal(spec.inputDbfs,-40);assert.equal(spec.gain,1);
    assert.equal(m.parseProductAudioArgs(['--run-id=WetPrefixUnit','--case='+spec.id]).caseId,spec.id);assert.throws(()=>m.parseProductAudioArgs(['--run-id=WetPrefixUnit','--case='+spec.id,'--component-witness']));
  }
  assert.throws(()=>m.selectProductCase('44100/source-owner/wet-prefix/extra'));
});

for(const rate of [44100,48000,96000])test('wet-prefix continues the same DC99 source after both dry gates and replays '+rate,async()=>{
  const f=await dryPrefixFixture(rate,{},true),m=await load(),r=(await f.execute()).audioProduct;
  assert.equal(r.schema,'f01-source-wet-prefix-observation-v1');assert.equal(r.passed,true);assert.equal(r.dryPrefix.overallQualification,false);assert.equal(r.dryPrefix.wet.qualityAssessed,true);
  assert.equal(f.calls.filter(c=>c.kind==='history-next').length,2);assert.equal(f.calls.filter(c=>c.kind==='history-capture').length,3);assert.equal(f.calls.filter(c=>c.kind==='history-wet').length,1);await m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec);
});
test('wet-prefix stops before re-ON on either dry failure and preserves wet numeric failure',async()=>{
  for(const stage of [1,2,3]){
    const f=await dryPrefixFixture(44100,{program:(v,n,s)=>s===stage?v*(stage===3?1.01:.9):v},true);
    await assert.rejects(()=>f.execute(),stage===3?/wet-ceiling/:/dry-rms/);assert.equal(f.calls.filter(c=>c.kind==='history-wet').length,stage===3?1:0);assert.equal(f.calls.filter(c=>c.kind==='history-capture').length,stage);assert.ok(f.saved.has(f.directory+'/dry-prefix-'+stage+'.f32le'));assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
  }
});

test('wet-prefix saved replay rejects checkpoint port epoch clock and latest-window transplants',async()=>{
  const f=await dryPrefixFixture(44100,{},true),m=await load(),r=(await f.execute()).audioProduct,original=[...f.saved].map(([k,v])=>[k,Buffer.from(v)]);
  for(const fault of ['checkpoint','profile','node-epoch','port','command-comp','missing-ack','ack-order','url','bridge','control','source-gap','capture','clock','reserve','caller','schema']){
    f.saved.clear();for(const [k,v]of original)f.saved.set(k,Buffer.from(v));const report=clone(r),p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json')),h=p.facts.dryPrefix,w=h.wet;let spec=f.spec;
    if(fault==='checkpoint')h.checkpoint.rows.pop();
    if(fault==='profile')h.checkpoint.facts.profile='dry-prefix';
    if(fault==='node-epoch')p.facts.nodes[1].sourceEpoch=7;
    if(fault==='port')p.facts.ledger.find(e=>e.nodeId===2&&e.type==='receive').portId=1;
    if(fault==='command-comp')p.facts.ledger.find(e=>e.nodeId===2&&e.type==='send').packet.dynamics=true;
    if(fault==='missing-ack')p.facts.ledger=p.facts.ledger.filter(e=>!(e.nodeId===2&&e.packet?.kind==='completed'));
    if(fault==='ack-order')p.facts.ledger.find(e=>e.nodeId===2&&e.packet?.kind==='completed').order=1;
    if(fault==='url')p.facts.inputPlan.urls[2]='blob:https://chzzk.naver.com/foreign';
    if(fault==='bridge')p.rows.find(x=>x.producerId===1&&x.start>=h.checkpoint.rows.filter(x=>x.producerId===1).at(-1).end).start++;
    if(fault==='control'||fault==='source-gap'){
      const row=p.rows.find(x=>x.producerId===(fault==='control'?3:1)&&x.start>= (fault==='control'?w.start:h.checkpoint.rows.filter(x=>x.producerId===1).at(-1).end));const b=Buffer.from(f.saved.get(row.file));b.writeFloatLE(0,0);row.sha256=hash(b);f.saved.set(row.file,b);
    }
    if(fault==='capture')p.facts.ledger.filter(e=>e.type==='history-capture').at(-1).producerSequence--;
    if(fault==='clock')w.settling.end=w.settling.start+1249;
    if(fault==='reserve')p.reservedBytes=24*44100;
    if(fault==='caller')spec={...f.spec,id:'48000/source-owner/wet-prefix',sampleRate:48000};
    if(fault==='schema')report.schema='f01-source-dry-prefix-observation-v1';
    f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,report,spec),/source-owner/,fault);
  }
});
test('wet-prefix original peak-only gate accepts silence output without claiming the full profile',async()=>{
  const f=await dryPrefixFixture(44100,{program:(v,n,s)=>s===3?0:v},true),r=(await f.execute()).audioProduct;assert.equal(r.passed,true);assert.equal(r.dryPrefix.wet.measurement.channels[0].rms,0);assert.equal(r.dryPrefix.overallQualification,false);
});
test('wet-prefix pending raw survives a post-capture owner failure',async()=>{
  const f=await dryPrefixFixture(44100,{facts:f=>{if(f.nodes.length===2)f.connected=[1,2];}},true);await assert.rejects(()=>f.execute(),/wet-owner/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.pendingCapture.stage,3);assert.equal(p.pendingCapture.writeStatus,'completed');assert.equal(f.saved.get(p.pendingCapture.file).length,44100*8);assert.equal(f.calls.filter(c=>c.kind==='history-wet').length,1);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
test('wet-prefix existing product wrapper consumes the new schema and saved reader',async()=>{
  const f=await dryPrefixFixture(44100,{},true),r=await f.withClock(()=>wrapper(f));assert.equal(r.audioProduct.schema,'f01-source-wet-prefix-observation-v1');assert.equal(r.audioProduct.passed,true);assert.equal(f.calls.filter(c=>c.kind==='history-wet').length,1);
});

test('wet-prefix uses actual kernel meter epochs with return before completion and a nonconsecutive source epoch',async()=>{
  const vm=require('node:vm'),box={exports:{}};vm.runInNewContext(require('esbuild').buildSync({entryPoints:['src/main/features/audio/transition.ts'],bundle:true,write:false,format:'cjs',platform:'browser'}).outputFiles[0].text,{module:box,exports:box.exports,Float32Array,Float64Array,Number,Math,Date});const k=box.exports;
  const f=await dryPrefixFixture(44100,{facts:f=>{if(f.nodes.length!==2)return;const events=f.ledger,node=f.nodes[1];node.sourceEpoch=37;node.options.sourceEpoch=37;f.producers[3].sourceEpoch=37;for(const e of events.filter(e=>e.nodeId===2&&e.packet))e.packet.sourceEpoch=37;
    const received=events.filter(e=>e.nodeId===2&&e.type==='receive'),s=k.createTransition(44100,37,'raw'),start=received[0].packet.frame;received[0].packet=clone(k.transitionReply(s,'prepared',start));received[1].packet=clone(k.acceptCommand(s,events.find(e=>e.nodeId===2&&e.type==='send').packet,start+128,0));let complete;
    for(let n=start+128;n<start+8192;n+=128){const c=()=>new Float32Array(128);const r=k.renderTransition(s,[c(),c()],n,128,new Float32Array([0]),[c(),c()],Array.from({length:5},c));if(r?.kind==='completed'){complete=r;break;}}assert.ok(complete);received[2].packet=clone(complete);
  }},true);
  const evaluate=f.page.evaluate;f.page.evaluate=async(fn,arg)=>{const x=await evaluate(fn,arg);if(arg?.kind==='drain')for(const row of x)if(row.producerId===3)row.sourceEpoch=37;return x;};const r=(await f.execute()).audioProduct;assert.equal(r.passed,true);await (await load()).verifySourceOwnerEvidence(f.files,f.directory,r,f.spec);
});

test('wet-prefix actual probe re-enters once without a URL replacement and preserves original comp-OFF settings',async()=>{
  const f=await probeFixture(44100,'wet-prefix'),spec=(await load()).SOURCE_WET_HISTORY_CASES[0];let wanted=false,gain=1;
  f.video.pause=()=>{f.video.paused=true;};f.video.play=async()=>{f.video.paused=false;};f.runtime.audio.getReadback=()=>({state:wanted?'on':'off',sources:f.sources(),wanted,gain,appliedGain:wanted?gain:null});f.runtime.audio.setEnabled=async(_,v)=>{wanted=v;return v?'on':'off';};f.runtime.audio.setGain=(_,v)=>{gain=v;};
  await f.probe.action({kind:'prepare',spec});const node=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:7,initial:'raw'}}),source=f.context.createMediaElementSource(f.video);source.connect(node);node.connect({},0);await f.probe.action({kind:'history-configure',enabled:true});await f.probe.action({kind:'history-configure',enabled:false});source.disconnect(node);node.disconnect();node.port.close();
  const program=f.nodes.find(n=>n.options?.processorOptions?.producerId===0);let seq=0;
  for(const stage of [1,2]){await f.probe.action({kind:'history-next',stage});await f.probe.action({kind:'history-configure',enabled:false});for(let i=0;i<400;i++){program.receive({producerId:0,producerSequence:++seq,frame:(seq-1)*128,samples:[new Float32Array(128).fill(stage===1?1:.99),new Float32Array(128).fill(stage===1?1:.99)]});}f.context.currentTime=seq*128/44100;await f.probe.action({kind:'history-capture'});}
  const url=f.video.currentSrc,blobs=f.blobs.size;await f.probe.action({kind:'history-wet'});assert.equal(f.video.currentSrc,url);assert.equal(f.blobs.size,blobs);assert.equal(gain,2);assert.equal(wanted,true);assert.equal(f.runtime.config.compressorEnabled,false);assert.equal(f.runtime.config.normalizerEnabled,false);assert.equal(f.runtime.config.eqEnabled,false);assert.deepEqual([f.runtime.config.compressorThreshold,f.runtime.config.compressorKnee,f.runtime.config.compressorRatio],[0,0,1]);
  new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:37,initial:'raw'}});assert.throws(()=>new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',{processorOptions:{sourceEpoch:38,initial:'raw'}}),/source-owner/);await assert.rejects(()=>f.probe.action({kind:'history-wet'}),/source-owner/);
});
test('wet-prefix reserves three captures and one failure binary in the unchanged shared cap',async()=>{
  const m=await load(),spec=m.SOURCE_WET_HISTORY_CASES[2],f=fixture(96000);f.files.writeFile=async()=>{};const a=m.createSourceOwnerArchive(f.files,f.directory,spec),frames=9600,chunk=Buffer.alloc(frames*5*4).toString('base64');let thrown;
  for(let i=0;i<2000;i++)try{await a.append({producerId:3,portId:3,nodeId:2,sourceEpoch:37,kind:'pcm',packetFrame:i*frames,start:i*frames,end:(i+1)*frames,firstSequence:i*75+1,lastSequence:(i+1)*75,firstReceived:i*75+1,lastReceived:(i+1)*75,firstOffset:0,lastOffset:128,channels:5,base64:chunk});}catch(e){thrown=e;break;}
  assert.match(thrown?.message??'',/pcm-cap/);const b=a.summary();assert.equal(b.reservedBytes,96000*32);assert.ok(b.chargedBytes+b.reservedBytes+5120<=96*1024*1024);assert.ok(b.chargedBytes+b.reservedBytes+5120+frames*5*4>96*1024*1024);
});
test('dry-prefix saved replay keeps its exact profile when wet continuation is added',async()=>{
  const f=await dryPrefixFixture(),m=await load(),r=(await f.execute()).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json'));p.facts.profile='wet-prefix';f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/dry-owner/);
});

test('dry-prefix canonical caller rejects a nested priming profile and spec changed together',async()=>{
  const f=await dryPrefixFixture(),m=await load(),r=(await f.execute()).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json'));p.facts.dryPrefix.priming.after.profile='wet-prefix';p.facts.dryPrefix.priming.after.inputPlan.spec.id='44100/source-owner/wet-prefix';f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/dry-owner/);
});


test('extreme-history finite caller selects a continuity subgate without enabling the independent extreme flags',async()=>{
  const m=await import('../scripts/extension-e2e/audio-product.mjs');
  for(const rate of [44100,48000,96000]){const spec=m.selectProductCase(rate+'/source-owner/extreme-prefix');assert.equal(spec.inputDbfs,-40);assert.equal(spec.compressor,false);assert.equal(spec.gain,1);assert.equal(m.parseProductAudioArgs(['--run-id=ExtremeHistoryUnit','--case='+spec.id]).caseId,spec.id);assert.throws(()=>m.parseProductAudioArgs(['--run-id=ExtremeHistoryUnit','--case='+spec.id,'--headroom-witness']));}
  assert.throws(()=>m.selectProductCase('44100/source-owner/extreme-prefix/extra'));
});

for(const rate of [44100,48000,96000])test('extreme-history actual consumer keeps the wet prefix and fixed original scalar windows '+rate,async()=>{
  const f=await dryPrefixFixture(rate,{},true,true),m=await load(),r=(await f.execute()).audioProduct;assert.equal(r.schema,'f01-source-extreme-prefix-observation-v2');assert.equal(r.outcome,'HISTORY_OBSERVED');assert.equal(r.qualityAssessed,false);assert.equal(r.dryPrefix.extreme.headroom.passed,true);assert.ok(Math.abs(r.dryPrefix.extreme.scalarDb-6)<.1);assert.equal(r.dryPrefix.extreme.independentNormalizerPlan.passed,true);assert.equal(r.dryPrefix.extreme.independentNormalizerPlan.toleranceDb,.001);assert.equal(r.dryPrefix.extreme.independentNormalizerPlan.totalL1Nodes,3);assert.equal(r.dryPrefix.extreme.independentNormalizerPlan.end,r.dryPrefix.bridge.end);assert.equal(r.dryPrefix.overallQualification,false);assert.equal(f.calls.filter(c=>c.kind==='history-capture').length,4);await m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec);
});

test('extreme-history retains the first null headroom packet when every later facts and stop fails',async()=>{
  let observed=false;const f=await dryPrefixFixture(44100,{facts:x=>{const p=firstExtremeMeter(x);if(p){p.packet.renderHeadroom=null;observed=true;}}},true,true),evaluate=f.page.evaluate;
  f.page.evaluate=async(fn,arg)=>{if(observed&&['facts','stop'].includes(arg?.kind))throw Error('post-first-bad-facts-unavailable');return evaluate(fn,arg);};
  await assert.rejects(()=>f.execute(),/extreme-headroom/);const partial=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(f.saved.get(f.directory+'/dry-prefix-4.f32le').length,44100*8);const packet=firstExtremeMeter(partial.proof.facts);assert.equal(packet.packet.renderHeadroom,null);assert.equal(packet.portId,3);assert.equal(packet.packet.sourceEpoch,37);assert.ok(partial.secondary.some(e=>e.includes('post-first-bad-facts-unavailable')));
});

test('extreme-history saved replay refuses failed or malformed replies after the selected headroom receipt',async()=>{
  const f=await dryPrefixFixture(44100,{},true,true),m=await load(),r=(await f.execute()).audioProduct,original=Buffer.from(f.saved.get(f.directory+'/source-owner-proof.json'));
  for(const kind of ['failed','unknown']){const p=JSON.parse(original),e=p.facts.ledger.at(-1),frame=p.facts.ledger.filter(e=>e.packet?.kind==='meter-accepted').at(-1).packet.frame;p.facts.ledger.push({order:e.order+1,type:'receive',nodeId:3,portId:3,packet:{kind,sourceEpoch:37,seq:2,frame,meterEpoch:2,gain:null,code:'unexpected-tail'}});f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/source-owner/,kind);}
});

test('extreme-history rejects duplicate or out-of-bound meter sends even after the selected receipt',async()=>{
  const f=await dryPrefixFixture(44100,{},true,true),m=await load(),r=(await f.execute()).audioProduct,original=Buffer.from(f.saved.get(f.directory+'/source-owner-proof.json'));
  for(const fault of ['duplicate','future']){const p=JSON.parse(original),first=p.facts.ledger.find(e=>e.nodeId===3&&e.packet?.kind==='power'),e=clone(first);e.order=p.facts.ledger.length+1;if(fault==='future'){e.packet.meterSeq=2;e.packet.observedTime=1000;}p.facts.ledger.push(e);f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/source-owner/,fault);}
});

test('extreme-history stops before the fourth source on any preceding numeric failure',async()=>{
  for(const stage of [1,2,3]){const f=await dryPrefixFixture(44100,{program:(v,n,k)=>k===stage?v*(stage===3?1.01:.9):v},true,true);await assert.rejects(()=>f.execute(),stage===3?/wet-ceiling/:/dry-rms/);assert.equal(f.calls.some(c=>c.kind==='history-extreme-load'),false);assert.equal(f.calls.filter(c=>c.kind==='history-capture').length,stage);}
});
test('extreme-history original peak and fixed query N failures retain raw without retry',async()=>{
  for(const fault of ['peak','N']){const f=await dryPrefixFixture(44100,{program:(v,n,k)=>fault==='peak'&&k===4?1:v},true,true),evaluate=f.page.evaluate;
    f.page.evaluate=async(fn,arg)=>{const x=await evaluate(fn,arg);if(fault==='N'&&arg?.kind==='drain')for(const row of x.filter(r=>r.producerId===4&&r.kind==='pcm')){const b=Buffer.from(row.base64,'base64');for(let n=12;n<b.length;n+=20)b.writeFloatLE(1,n);row.base64=b.toString('base64');}return x;};
    await assert.rejects(()=>f.execute(),fault==='peak'?/extreme-ceiling/:/extreme-N-scalar/);assert.equal(f.calls.filter(c=>c.kind==='history-capture').length,4);assert.equal(f.calls.filter(c=>c.kind==='history-extreme-configure').length,1);assert.equal(f.saved.get(f.directory+'/dry-prefix-4.f32le').length,44100*8);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
  }
});
test('extreme-history source identity is distinct from the original output ceiling-only gate',async()=>{
  const good=await dryPrefixFixture(44100,{program:(v,n,k)=>k===4?0:v},true,true);assert.equal((await good.execute()).audioProduct.passed,true);
  const bad=await dryPrefixFixture(44100,{source:(v,n,k)=>k===4?0:v},true,true);await assert.rejects(()=>bad.execute(),/prime-input/);assert.equal(bad.calls.filter(c=>c.kind==='history-capture').length,4);assert.equal(bad.saved.has(bad.directory+'/assessment.json'),false);
});
test('extreme-history saved proof refuses input epoch prefix clock and metadata donors',async()=>{
  const f=await dryPrefixFixture(44100,{},true,true),m=await load(),r=(await f.execute()).audioProduct,original=Buffer.from(f.saved.get(f.directory+'/source-owner-proof.json'));
  for(const fault of ['input','epoch','port','checkpoint','caller','query','clock','latest','budget','scope']){
    const p=JSON.parse(original),h=p.facts.dryPrefix,w=h.extreme,report=clone(r);let spec=f.spec;
    if(fault==='input')p.facts.inputPlan.inputs[3].inputDbfs=-40;
    if(fault==='epoch')p.facts.nodes[2].sourceEpoch=8;
    if(fault==='port')p.rows.find(r=>r.producerId===4).portId=3;
    if(fault==='checkpoint')w.checkpoint.rows.pop();
    if(fault==='caller')spec={...f.spec,id:'48000/source-owner/extreme-prefix',sampleRate:48000};
    if(fault==='query')w.query.frame++;
    if(fault==='clock')w.settling.end=w.settling.start+9499;
    if(fault==='latest')p.facts.ledger.filter(e=>e.type==='history-capture').at(-1).producerSequence--;
    if(fault==='budget')p.reservedBytes=44100*32;
    if(fault==='scope'){report.qualityAssessed=true;report.outcome='PASS';}
    f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,report,spec),/source-owner/,fault);
  }
});
test('extreme-history first null receipt is not rescued by a later matching receipt',async()=>{
  const f=await dryPrefixFixture(44100,{facts:f=>{const first=firstExtremeMeter(f);if(!first)return;const good=clone(first.packet);first.packet.renderHeadroom=null;const post=f.ledger.filter(e=>e.nodeId===3&&e.packet?.kind==='power').at(-1),seq=post.packet.meterSeq+1,frame=good.frame+128;f.ledger.push({...clone(post),order:f.ledger.length+1,packet:{...post.packet,meterSeq:seq,observedTime:post.packet.observedTime+.1}});f.ledger.push({order:f.ledger.length+1,type:'receive',nodeId:3,portId:3,packet:{...good,seq,frame,application:good.application?{...good.application,meterSeq:seq,frame,start:frame/44100,end:frame/44100+.1}:null,renderHeadroom:{...good.renderHeadroom,startFrame:frame,endFrame:frame+128}}});}},true,true);
  await assert.rejects(()=>f.execute(),/extreme-headroom-UNAVAILABLE/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.dryPrefix.extreme.assessment.headroom.passed,false);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
test('extreme-history saves a pending fourth capture if its immediate query fails',async()=>{
  const f=await dryPrefixFixture(44100,{},true,true),evaluate=f.page.evaluate;f.page.evaluate=async(fn,arg)=>{if(arg?.kind==='facts'&&f.calls.filter(c=>c.kind==='history-capture').length===4)throw Error('fixed-query-failed');return evaluate(fn,arg);};await assert.rejects(()=>f.execute(),/fixed-query-failed/);const p=JSON.parse(f.saved.get(f.directory+'/partial.json'));assert.equal(p.pendingCapture.stage,4);assert.equal(p.pendingCapture.writeStatus,'completed');assert.equal(f.saved.get(p.pendingCapture.file).length,44100*8);assert.equal(f.calls.filter(c=>c.kind==='history-capture').length,4);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);
});
test('extreme-history closed plan view allows a later unACKed tail without changing the bounded claim',async()=>{
  const f=await dryPrefixFixture(44100,{},true,true),m=await load(),r=(await f.withClock(()=>wrapper(f))).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json')),post=p.facts.ledger.filter(e=>e.nodeId===3&&e.packet?.kind==='power').at(-1);p.facts.ledger.push({...clone(post),order:p.facts.ledger.length+1,packet:{...post.packet,meterSeq:post.packet.meterSeq+1,observedTime:post.packet.observedTime+.1}});f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec);assert.equal(r.qualityAssessed,false);assert.equal(r.dryPrefix.extreme.independentNormalizerPlan.status,'diagnostic-match');
});
test('extreme-history reserves all four captures plus one failure copy before the shared cap',async()=>{
  const m=await load(),spec=m.SOURCE_EXTREME_HISTORY_CASES[2],f=fixture(96000);f.files.writeFile=async()=>{};const a=m.createSourceOwnerArchive(f.files,f.directory,spec),frames=9600,chunk=Buffer.alloc(frames*5*4).toString('base64');let thrown;
  for(let i=0;i<2000;i++)try{await a.append({producerId:4,portId:4,nodeId:3,sourceEpoch:37,kind:'pcm',packetFrame:i*frames,start:i*frames,end:(i+1)*frames,firstSequence:i*75+1,lastSequence:(i+1)*75,firstReceived:i*75+1,lastReceived:(i+1)*75,firstOffset:0,lastOffset:128,channels:5,base64:chunk});}catch(e){thrown=e;break;}
  assert.match(thrown?.message??'',/pcm-cap/);const b=a.summary();assert.equal(b.reservedBytes,96000*40);assert.ok(b.chargedBytes+b.reservedBytes+5120<=96*1024*1024);assert.ok(b.chargedBytes+b.reservedBytes+5120+frames*5*4>96*1024*1024);const old=m.createSourceOwnerArchive(f.files,f.directory,m.SOURCE_WET_HISTORY_CASES[2]);await assert.rejects(()=>old.append({producerId:4}),/span|integer/);
});

test('extreme-history actual probe creates the fourth sine once and opts only node3 into witnesses',async()=>{
  const f=await probeFixture(44100,'extreme-prefix'),spec=(await load()).SOURCE_EXTREME_HISTORY_CASES[0];let wanted=false,gain=1,seq=0;
  f.video.pause=()=>{f.video.paused=true;};f.video.play=async()=>{f.video.paused=false;};f.runtime.audio.getReadback=()=>({state:wanted?'on':'off',sources:f.sources(),wanted,gain,appliedGain:wanted?gain:null});f.runtime.audio.setEnabled=async(_,v)=>{wanted=v;return v?'on':'off';};f.runtime.audio.setGain=(_,v)=>{gain=v;};await f.probe.action({kind:'prepare',spec});
  const raw=epoch=>Object.freeze({processorOptions:Object.freeze({sourceEpoch:epoch,initial:'raw'})}),a=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',raw(7)),source=f.context.createMediaElementSource(f.video);source.connect(a);a.connect({},0);await f.probe.action({kind:'history-configure',enabled:true});await f.probe.action({kind:'history-configure',enabled:false});source.disconnect(a);a.disconnect();a.port.close();
  const program=f.nodes.find(n=>n.options?.processorOptions?.producerId===0),fill=level=>{for(let i=0;i<400;i++)program.receive({producerId:0,producerSequence:++seq,frame:(seq-1)*128,samples:[new Float32Array(128).fill(level),new Float32Array(128).fill(level)]});f.context.currentTime=seq*128/44100;};
  for(const stage of [1,2]){await f.probe.action({kind:'history-next',stage});await f.probe.action({kind:'history-configure',enabled:false});fill(stage===1?1:.99);await f.probe.action({kind:'history-capture'});}await f.probe.action({kind:'history-wet'});const b=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',raw(8));source.connect(b);b.connect({},0);fill(.98);await f.probe.action({kind:'history-capture'});source.disconnect(b);b.disconnect();b.port.close();
  const plan=await f.probe.action({kind:'history-extreme-load'});assert.equal(plan.urls.length,4);assert.equal(plan.inputs[3].inputDbfs,-6);assert.equal(plan.inputs[3].pattern,'stereo');assert.equal(f.video.paused,true);const wave=Buffer.from(await f.blobs.get(f.video.src).arrayBuffer());assert.equal(wave.subarray(44,52).toString('hex'),'c93a833ec93a833e');assert.equal(wave.subarray(52,60).toString('hex'),'3bf1b13e3bf1b13e');
  const options=raw(37),c=new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',options);assert.equal(options.processorOptions.normalizerWitness,undefined);assert.equal(c.options.processorOptions.normalizerWitness,true);assert.equal(c.options.processorOptions.headroomWitness,true);assert.equal(a.options.processorOptions.normalizerWitness,undefined);assert.equal(b.options.processorOptions.headroomWitness,undefined);await f.probe.action({kind:'history-extreme-configure'});assert.equal(gain,2);assert.equal(f.runtime.config.normalizerTargetDbfs,-12);assert.equal(f.runtime.config.compressorEnabled,true);assert.ok([63,125,250,500,1000,2000,4000,8000].every(hz=>f.runtime.config['eq'+hz]===6));await assert.rejects(()=>f.probe.action({kind:'history-extreme-load'}),/extreme-order/);await assert.rejects(()=>f.probe.action({kind:'history-extreme-configure'}),/extreme-configure/);assert.throws(()=>new f.window.AudioWorkletNode(f.context,'knife-audio-transition-l1',raw(38)),/source-owner/);assert.equal(f.sources(),1);
});

test('same-history N plan rejects a rehashed non-scalar control donor and keeps the .001dB obligation',async()=>{
  const f=await dryPrefixFixture(44100,{},true,true),m=await load(),r=(await f.execute()).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json')),w=p.facts.dryPrefix.extreme,row=p.rows.find(x=>x.producerId===4&&x.kind==='pcm'&&x.start>w.checkpoint.rows.filter(x=>x.producerId===0).at(-1).end&&x.end<w.start),b=Buffer.from(f.saved.get(row.file));
  b.writeFloatLE(b.readFloatLE(12)*10**(.002/20),12);row.sha256=hash(b);r.archive.artifacts.find(x=>x.file===row.file).sha256=row.sha256;f.saved.set(row.file,b);f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/normalizer|N-plan|extreme-assessment/);
});

function scopedNInput(rate=44100,targetOffset=1152){
  const base=131072,t=normalizerKernelTrace(rate,base,targetOffset),end=base+rate,last=t.ordered.findLastIndex(e=>e.direction==='receive'&&e.packet.frame<end),events=t.ordered.slice(0,last+1).map((e,i)=>({order:i+1,...clone(e)})),ledger={schema:'f01-control-ledger-v3',available:true,reason:null,eventCount:events.length,bytes:0,maxEvents:4128,maxBytes:1048576,events};for(let i=0;i<4;i++)ledger.bytes=Buffer.byteLength(JSON.stringify(ledger));const capture=()=>({rate,start:base,end,channels:[new Float32Array(rate),new Float32Array(rate)]});
  return {schema:'f01-l1-normalizer-input-source-owner-v1',sampleRate:rate,evidence:{schema:'f01-oracle-evidence-v3',initial:{available:true,reason:null,sourceEpoch:37,initial:'raw',normalizerWitness:true,headroomWitness:true},ledger},source:capture(),program:capture(),control:{rate,start:base,end,channels:[new Float32Array(rate),new Float32Array(rate),new Float32Array(rate),t.n.slice(0,rate),new Float32Array(rate)]},observation:{schema:'f01-source-owner-normalizer-observation-v1',sources:1,l1Nodes:3,contextId:1,elementId:1,error:null,hidden:false,contextState:'running',selected:{nodeId:3,portId:3,producerId:4,sourceEpoch:37}}};
}
test('same-history N oracle explicitly consumes total3 and real kernel preempt or completed baselines',async()=>{
  const {compareL1Normalizer:compare}=await import('../scripts/audio-l1-normalizer-oracle.mjs');
  for(const targetOffset of [1152,4096]){const input=scopedNInput(44100,targetOffset),trace=normalizerKernelTrace(44100,131072,targetOffset);assert.equal(trace.commands[0].completed===null,targetOffset===1152);const r=compare(input);assert.equal(r.status,'diagnostic-match',r.reason);assert.equal(r.comparison.toleranceDb,.001);assert.equal(r.observationScope.l1Nodes,3);assert.equal(r.observationScope.selected.sourceEpoch,37);}
});
test('same-history N scoped mode cannot relabel its selection or weaken the singleton contract',async()=>{
  const {compareL1Normalizer:compare}=await import('../scripts/audio-l1-normalizer-oracle.mjs');for(const field of ['nodeId','portId','producerId','sourceEpoch']){const input=scopedNInput();input.observation.selected[field]++;assert.equal(compare(input).status,'UNAVAILABLE',field);}const input=scopedNInput();input.observation.l1Nodes=1;assert.equal(compare(input).status,'UNAVAILABLE');input.schema='f01-l1-normalizer-input-v3';input.observation={sources:1,l1Nodes:1,invalidFrames:0,streamError:'',contextState:'running',hidden:false};assert.equal(compare(input).status,'diagnostic-match');input.observation.l1Nodes=3;assert.equal(compare(input).status,'UNAVAILABLE');
});

test('same-history N compares every formed sample and never fills initial or interior empty spans',async()=>{
  for(const initial of [true,false]){const f=await dryPrefixFixture(44100,{},true,true),evaluate=f.page.evaluate;let converted=false;
    f.page.evaluate=async(fn,arg)=>{const x=await evaluate(fn,arg);if(arg?.kind==='drain')for(const row of x.filter(r=>r.producerId===4&&r.kind==='pcm'))if(!converted&&(initial||row.firstSequence>750)){converted=true;delete row.base64;row.kind='empty';row.channels=0;}return x;};
    if(initial){const r=(await f.execute()).audioProduct,n=r.dryPrefix.extreme.independentNormalizerPlan;assert.equal(n.passed,true);assert.ok(n.initialEmpty.end>n.initialEmpty.start);assert.equal(n.initialEmpty.assessed,false);const p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json'));assert.equal(p.rows.find(r=>r.producerId===4).kind,'empty');}
    else{await assert.rejects(()=>f.execute(),/N-plan-control-coverage/);assert.equal(f.saved.has(f.directory+'/assessment.json'),false);assert.ok(f.saved.has(f.directory+'/dry-prefix-4.f32le'));}
  }
});
test('same-history N retains the strict .001dB comparison on real kernel controls',async()=>{
  const {compareL1Normalizer:compare}=await import('../scripts/audio-l1-normalizer-oracle.mjs');for(const db of [.0009,.0011]){const input=scopedNInput();input.control.channels[3][30000]*=10**(db/20);const r=compare(input);assert.equal(r.status,db<.001?'diagnostic-match':'diagnostic-mismatch');assert.equal(r.comparison.toleranceDb,.001);}
});
test('same-history N current evidence refuses the old scalar-only schema',async()=>{
  const f=await dryPrefixFixture(44100,{},true,true),m=await load(),r=(await f.execute()).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json'));r.schema='f01-source-extreme-prefix-observation-v1';p.schema='f01-source-extreme-prefix-proof-v1';p.facts.dryPrefix.extreme.assessment.independentNormalizerPlan='UNASSESSED';f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/dry-report|proof/);
});

test('same-history N includes retained ACKs inside its fixed end after the headroom cutoff',async()=>{
  const f=await dryPrefixFixture(44100,{},true,true),m=await load(),r=(await f.execute()).audioProduct,p=JSON.parse(f.saved.get(f.directory+'/source-owner-proof.json')),events=p.facts.ledger,index=events.findIndex(e=>e.order===r.dryPrefix.extreme.headroomCutoffOrder),first=events[index],seq=first.packet.seq+1,post=events.slice(0,index).findLast(e=>e.nodeId===3&&e.packet?.kind==='power');
  for(const e of events.slice(index+1)){if(e.nodeId!==3)continue;const q=e.packet;if(q?.kind==='power'&&q.meterSeq>=seq)q.meterSeq++;if(q?.kind==='meter-accepted'&&q.seq>=seq){q.seq++;if(q.application)q.application.meterSeq++;}}
  const packet=clone(first.packet);packet.seq=seq;if(packet.application)packet.application.meterSeq=seq;events.splice(index+1,0,{type:'send',nodeId:3,portId:3,packet:{...post.packet,meterSeq:seq}},{type:'receive',nodeId:3,portId:3,packet});events.forEach((e,i)=>e.order=i+1);f.saved.set(f.directory+'/source-owner-proof.json',Buffer.from(JSON.stringify(p)));await assert.rejects(()=>m.verifySourceOwnerEvidence(f.files,f.directory,r,f.spec),/N-plan|extreme-assessment/);
});
