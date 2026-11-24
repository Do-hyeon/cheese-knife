'use strict';
// Explicit synthetic HOST entry: actual public module, owned archive windows, full-summary reference.
const assert=require('node:assert/strict'),write=require('node:fs').writeSync.bind(require('node:fs'));
const clock=process.hrtime.bigint.bind(process.hrtime),began=clock();
const SCOPE='actual module owned-archive regression only; HOST65 and product remain HOLD';
let fullSummary;
const LIMIT=536870912,RATES=[44100,48000,96000],FREQS=[250,750,1000],CONTROL=[-1,1,1,1,0];
const MODES=['good','left-silence','right-silence','db-below','db-above','wrong-tone','rms-only','fund-only'];
const defs=[];
for(const rate of RATES)for(const frequency of FREQS)for(const mode of MODES)defs.push({id:rate+'/'+frequency+'/'+mode,rate,frequency,mode});
for(const rate of RATES)for(const mode of ['prefix','seam','tail'])defs.push({id:rate+'/750/'+mode,rate,frequency:750,mode});
for(const rate of RATES)defs.push({id:rate+'/750/action-order',rate,frequency:750,mode:'action-order'});
for(const rate of RATES)for(const mode of ['empty','short','null-tone','noncoherent','zero-tone','nyquist'])defs.push({id:rate+'/750/'+mode,rate,frequency:750,mode});
for(const rate of RATES)defs.push({id:rate+'/750/nonfinite-append',rate,frequency:750,mode:'nonfinite-append'});
defs.push({id:'44100/750/nan-tone',rate:44100,frequency:750,mode:'nan-tone'});
const IDS=defs.map(d=>d.id);assert.equal(IDS.length,106);assert.equal(new Set(IDS).size,106);
let first=null,emitted=false,reservedBytes=262144,comparisons=0;
function latch(error,code='CHECK_FAILED'){
  if(!first)first={error,code,diagnostic:String(error?.message??error).slice(0,256)};
  process.exitCode=1;return first.error;
}
function live(){if(first)throw first.error;if(Number(clock()-began)/1e6>=45000)throw latch(Error('checker work deadline'),'WORK_DEADLINE');}
function reserve(bytes){live();assert.ok(Number.isSafeInteger(bytes)&&bytes>=0&&reservedBytes+bytes<=LIMIT,'SELECTED_PAYLOAD_RESERVATION');reservedBytes+=bytes;}
function emit(row){
  if(emitted)return;emitted=true;const bytes=Buffer.from(JSON.stringify(row)+'\n');
  assert.ok(bytes.length<=8192,'OUTPUT_LINE_LIMIT');let at=0;
  while(at<bytes.length){const n=write(1,bytes,at,bytes.length-at);assert.ok(n>0,'STDOUT_WRITE');at+=n;}
}
function stop(error){latch(error);try{emit({schema:'f01-product-input-host-v1',status:'STOP',firstCode:first.code,diagnostic:first.diagnostic});}catch{process.exitCode=1;}}
process.on('uncaughtException',stop);process.on('unhandledRejection',stop);
const outcome=work=>{try{return {value:work()};}catch(error){return {error};}};
function sameOutcome(a,b,label){
  assert.equal(Object.hasOwn(a,'error'),Object.hasOwn(b,'error'),label+' outcome');
  if(Object.hasOwn(a,'error')){assert.equal(a.error?.constructor,b.error?.constructor,label+' type');assert.equal(a.error?.name,b.error?.name,label+' name');assert.equal(a.error?.message,b.error?.message,label+' message');return;}
  assert.deepEqual(a.value,b.value,label+' failures');
}
function referenceInputFailures(archive,actions,frequency=750){
  const summary=archive.summary(),rate=summary.sampleRate;
  const failures=[],wholeFailures=new Set(),expectedRms=10**(-24/20),expectedPeak=Math.SQRT2*expectedRms;
  const check=(start,end,label,whole=false)=>{
    const source=fullSummary(archive.window(start,end,1),frequency);
    for(const [channel,row]of source.channels.entries())if(row.rms<=0||Math.abs(20*Math.log10(row.rms/expectedRms))>.05||row.fundamentalAmplitude===null||row.fundamentalAmplitude<=0||Math.abs(20*Math.log10(row.fundamentalAmplitude/expectedPeak))>.05){
      if(!whole||!wholeFailures.has(channel))failures.push(label+'channel-'+channel);if(whole)wholeFailures.add(channel);
    }
  };
  for(const action of actions)check(action.frame+Math.round(.1*rate),action.frame+Math.round(.14*rate),action.name+'/input-');
  const width=Math.round(.04*rate),stride=width/2;
  if(summary.start===null||summary.end===null||summary.end-summary.start<width)return [...failures,'whole-source/coverage'];
  // Fixed coherent windows measure the whole source; they do not establish an absolute phase origin.
  for(let start=summary.start;;start=Math.min(start+stride,summary.end-width)){
    check(start,start+width,'whole-source/'+start+'/',true);
    if(start===summary.end-width)break;
  }
  return failures;
}

function signalValue(def,n,c,N){
  const r=def.rate,f=def.frequency,A=Math.SQRT2*10**(-24/20),phase=c===0?.37:1.07;
  if(def.mode==='left-silence'&&c===0||def.mode==='right-silence'&&c===1||def.mode==='action-order')return 0;
  if(def.mode==='prefix'&&n<Math.round(.02*r)||def.mode==='seam'&&n>=Math.round(.04*r)-8&&n<Math.round(.05*r)||def.mode==='tail'&&n>=N-Math.round(.01*r))return 0;
  const frequency=def.mode==='rms-only'?f+50:def.mode==='wrong-tone'?f*1.17:f;
  let value=A*Math.sin(2*Math.PI*frequency*n/r+phase);
  if(def.mode==='db-below'||def.mode==='db-above')value*=10**((c===0?1:-1)*(.05+(def.mode==='db-below'?-1e-5:1e-5))/20);
  if(def.mode==='fund-only')value+=.2*10**(-24/20);
  return value;
}
function buildInput(def){
  const r=def.rate,N=def.mode==='empty'?0:def.mode==='short'?Math.round(.02*r):Math.round((def.mode==='action-order'?.16:.08)*r)+17;
  // Conservative cumulative selected-payload reservation; no GC or allocator/RSS credit.
  reserve(512*N+131072);
  const raw=[],original=[];const W=Math.round(.04*r);
  for(let start=0;start<N;start+=W){
    const end=Math.min(start+W,N),buffers=[2,2,5].map(count=>Buffer.alloc((end-start)*count*4));
    for(let n=start;n<end;n++){
      for(let c=0;c<2;c++){buffers[0].writeFloatLE(.2,((n-start)*2+c)*4);buffers[1].writeFloatLE(signalValue(def,n,c,N),((n-start)*2+c)*4);}
      for(let c=0;c<5;c++)buffers[2].writeFloatLE(CONTROL[c],((n-start)*5+c)*4);
    }
    if(def.mode==='nonfinite-append'&&start===0)buffers[1].writeFloatLE(NaN,0);
    original.push(buffers);
    raw.push({schema:'f01-product-window-v1',sampleRate:r,start,end,sources:1,l1Nodes:1,invalidFrames:0,streamError:'',hidden:false,contextState:'running',commands:[],replies:[],
      streams:buffers.map((data,index)=>({start,end,channels:[2,2,5][index],encoding:'interleaved-float32le',base64:data.toString('base64')}))});
  }
  const frequency=def.mode==='null-tone'?null:def.mode==='noncoherent'?def.frequency+.1:def.mode==='zero-tone'?0:def.mode==='nyquist'?r/2:def.mode==='nan-tone'?NaN:def.frequency;
  const actions=def.mode==='action-order'?[{name:'first',frame:0},{name:'second',frame:Math.round(.02*r)}]:[];
  return {raw,original,frequency,actions};
}
async function makeArchive(createProductArchive,def,input){
  const files=new Map(),archive=createProductArchive({async writeFile(file,data,options){assert.equal(options.flag,'wx');assert.ok(!files.has(file),'duplicate memory write');files.set(file,Buffer.from(data));}},'fixed',def.rate);
  try{for(const raw of input.raw){live();await archive.append(raw);}return {archive,files};}catch(error){return {archive,files,error};}
}
function checkStored(a,b,input){
  assert.deepEqual([...a.keys()],[...b.keys()],'stored order');
  for(const [name,bytes]of a){assert.ok(bytes.equals(b.get(name)),'stored bytes '+name);}
  for(const [i,streams]of input.original.entries())for(const [s,bytes]of streams.entries()){
    const name='fixed/segment-'+String(i).padStart(4,'0')+'-stream-'+s+'.f32le';assert.ok(bytes.equals(a.get(name)),'original PCM '+name);
  }
}
function snapshot(files){return new Map([...files].map(([name,bytes])=>[name,Buffer.from(bytes)]));}
function unchanged(files,before){
  assert.deepEqual([...files.keys()],[...before.keys()],'stored key order');
  for(const [name,bytes]of before)assert.ok(bytes.equals(files.get(name)),'stored mutation '+name);
}
function checkAppend(result,def){
  if(Object.hasOwn(result,'error')){
    if(def.mode==='nonfinite-append'&&result.error?.constructor===Error&&result.error.message==='audio-product-archive-nonfinite')return;
    throw result.error;
  }
  assert.notEqual(def.mode,'nonfinite-append','append must reject before continuing');
}
function checkedAdmission(work,def){
  const result=outcome(work),expected=['zero-tone','nyquist','nan-tone'].includes(def.mode);
  if(Object.hasOwn(result,'error')){if(!expected||result.error?.constructor!==Error||result.error.message!=='invalid tone frequency')throw result.error;}
  else assert.equal(expected,false,'missing tone error');
  return result;
}
async function main(){
  assert.equal(process.argv.length,2);
  const api=await import('../scripts/extension-e2e/audio-product.mjs');
  fullSummary=(await import('../scripts/audio-signal.mjs')).summarizeCapture;
  for(const def of defs){
    live();const input=buildInput(def),a=await makeArchive(api.createProductArchive,def,input);checkAppend(a,def);
    const b=await makeArchive(api.createProductArchive,def,input);checkAppend(b,def);
    if(def.mode==='nonfinite-append'){
      assert.ok(a.error&&b.error,'append must reject');sameOutcome({error:a.error},{error:b.error},def.id);
      assert.equal(a.error.message,'audio-product-archive-nonfinite');assert.equal(a.files.size,0);assert.equal(b.files.size,0);comparisons++;continue;
    }
    checkStored(a.files,b.files,input);
    const beforeA=snapshot(a.files),beforeB=snapshot(b.files);
    const reference=checkedAdmission(()=>referenceInputFailures(a.archive,input.actions,input.frequency),def);
    const actual=checkedAdmission(()=>api.productInputFailures(b.archive,input.actions,input.frequency),def);
    sameOutcome(reference,actual,def.id);
    if(def.mode==='rms-only'||def.mode==='fund-only'){
      const row=fullSummary(a.archive.window(0,Math.round(.04*def.rate),1),def.frequency).channels[0];
      const rmsOk=row.rms>0&&Math.abs(20*Math.log10(row.rms/10**(-24/20)))<=.05;
      const fundOk=row.fundamentalAmplitude!==null&&row.fundamentalAmplitude>0&&Math.abs(20*Math.log10(row.fundamentalAmplitude/(Math.SQRT2*10**(-24/20))))<=.05;
      assert.equal(rmsOk,def.mode==='rms-only','independent RMS predicate');assert.equal(fundOk,def.mode==='fund-only','independent fundamental predicate');
    }
    if(def.mode==='nan-tone'){
      const sentinel=Error('opaque window sentinel'),throwing={summary:()=>a.archive.summary(),window(){throw sentinel;}};
      assert.equal(outcome(()=>referenceInputFailures(throwing,[],750)).error,sentinel);
      assert.equal(outcome(()=>api.productInputFailures(throwing,[],750)).error,sentinel);
    }
    unchanged(a.files,beforeA);unchanged(b.files,beforeB);checkStored(a.files,b.files,input);comparisons++;
  }
  live();assert.equal(comparisons,106);assert.equal(reservedBytes,280714240);
  emit({schema:'f01-product-input-host-v1',status:'PASS',cases:IDS,comparisons,reservedBytes,scope:SCOPE});
}
main().catch(stop);
