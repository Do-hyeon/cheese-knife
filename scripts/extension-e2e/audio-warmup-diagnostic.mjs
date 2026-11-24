import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {audioOperation} from '../audio-native-browser.mjs';

export const WARMUP_CASE='44100/normalizer-control/tone-silence';
export const warmupArtifact=runId=>typeof runId==='string'&&/^[A-Za-z0-9]{1,64}$/.test(runId)?'output/playwright/installed-extension-'+runId:null;
const fft=16384,rowBytes=fft*4,ring=65536,delay=264,cap=96*1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const indexFile='analyser-pcm.json';
const chunkFile=start=>'analyser-pcm-'+start+'.f32le';
const reject=code=>{throw Error('audio-product-warmup-'+code);};
const validProof=proof=>proof?.firstError===null&&Number.isSafeInteger(proof.cutoffFrame)&&proof.cutoffFrame>0&&
  Array.isArray(proof.ticks)&&proof.ticks.length>0&&proof.ticks.length<=201&&proof.rawRows===2*proof.ticks.length;

// The caller seals only the returned receipt. A file left by a timed-out write is not a receipt.
export async function writeWarmupExport(files,{runId,assessmentSha256,targetSha256,artifact,proof,archiveBytes,scenarioDeadline,readRows},now=()=>performance.now()){
  if(!artifact||artifact!==warmupArtifact(runId)||!Number.isFinite(scenarioDeadline)||!validProof(proof)||
    !digest(assessmentSha256)||!digest(targetSha256)||!Number.isSafeInteger(archiveBytes)||
    archiveBytes<1||archiveBytes+proof.rawRows*rowBytes+1048576>cap)reject('export-input');
  const startedAt=now(),deadline=Math.min(scenarioDeadline,startedAt+2000),chunks=[];
  let previous=startedAt;
  const check=at=>{
    if(!Number.isFinite(startedAt)||startedAt<0||!Number.isFinite(at)||at<previous||at>=deadline)reject('export-deadline');
    previous=at;
  };
  const step=async work=>{
    const at=now();check(at);
    const remaining=Math.floor(deadline-at);
    if(remaining<1)reject('export-deadline');
    const result=await audioOperation('warmup-export',work,remaining);
    check(now());return result;
  };
  const save=async(name,bytes)=>{
    const file=artifact+'/'+name;
    await step(()=>files.writeFile(file,bytes,{flag:'wx'}));
    await step(async()=>{
      let offset=0;
      for await(const chunk of files.readChunks(file)){
        check(now());
        const end=offset+chunk.length;
        if(end>bytes.length||!bytes.subarray(offset,end).equals(chunk))reject('export-readback');
        offset=end;
      }
      if(offset!==bytes.length)reject('export-readback');
    });
  };
  for(let start=0;start<proof.rawRows;start+=16){
    const end=Math.min(start+16,proof.rawRows),raw=await step(()=>readRows(start,end));
    if(!ArrayBuffer.isView(raw)||raw.byteLength!==(end-start)*rowBytes)reject('export-chunk');
    const bytes=Buffer.from(new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength)),file=chunkFile(start);
    await save(file,bytes);
    chunks.push({start,end,file,bytes:bytes.length,sha256:sha(bytes)});
  }
  const index=Buffer.from(JSON.stringify({proof,chunks,encoding:'float32le'}));
  if(index.length>1048576)reject('export-index');
  await save(indexFile,index);
  const completedAt=now();check(completedAt);
  return {runId,assessmentSha256,targetSha256,cutoffFrame:proof.cutoffFrame,indexSha256:sha(index),startedAt,scenarioDeadline,deadline,completedAt};
}

export async function readWarmupExport(files,artifact,binding,completion,proof){
  const {startedAt,scenarioDeadline,deadline,completedAt}=completion??{};
  if(!validProof(proof)||!completion||!Object.keys(binding).every(key=>binding[key]===completion[key])||
    completion.cutoffFrame!==proof.cutoffFrame||!digest(completion.indexSha256)||
    ![startedAt,scenarioDeadline,deadline,completedAt].every(Number.isFinite)||startedAt<0||
    deadline!==Math.min(scenarioDeadline,startedAt+2000)||!(startedAt<=completedAt&&completedAt<deadline))reject('export-completion');
  const bytes=await files.readFile(artifact+'/'+indexFile);
  if(sha(bytes)!==completion.indexSha256)reject('export-index');
  const index=JSON.parse(bytes),raw=[];
  if(index.encoding!=='float32le'||!isDeepStrictEqual(index.proof,proof)||!Array.isArray(index.chunks)||
    index.chunks.length!==Math.ceil(proof.rawRows/16))reject('export-index');
  for(const [i,row] of index.chunks.entries()){
    const start=i*16,end=Math.min(start+16,proof.rawRows),file=chunkFile(start);
    if(row.start!==start||row.end!==end||row.file!==file||row.bytes!==(end-start)*rowBytes||!digest(row.sha256))reject('export-chunk');
    const data=await files.readFile(artifact+'/'+file);
    if(data.length!==row.bytes||sha(data)!==row.sha256)reject('export-chunk');
    raw.push(data);
  }
  return Buffer.concat(raw);
}

export function diagnoseWarmupFailure({report,archive,measured,proof,raw,graph}){
  const {facts,target}=report,events=facts.oracleEvidence.ledger.events,attempts=facts.normalizerControl.attempts,reads=facts.powerReads;
  const [sourceEpoch,meterEpoch,commandSeq]=proof.target;
  const epochMatches=p=>p?.sourceEpoch===sourceEpoch&&p?.meterEpoch===meterEpoch;
  if(!isDeepStrictEqual(proof.target,graph.target)||target.command.message.sourceEpoch!==sourceEpoch||target.command.message.seq!==commandSeq||
    ![target.accepted,target.completed].every(p=>epochMatches(p)&&p.seq===commandSeq)||
    !isDeepStrictEqual(proof.nativeCounts,[proof.ticks.length,proof.ticks.length])||attempts.length!==proof.rawRows||reads.length!==proof.rawRows||
    events.some((event,i)=>event.order!==i+1))reject('getter-binding');
  const wire=new Set(events.filter(e=>['power','meter-accepted','read-error'].includes(e.packet.kind)).map(e=>e.order));
  const lastWritten=[0,0],warmup=new Map();
  let lastAck=0;
  for(const [index,tick] of proof.ticks.entries()){
    const seq=index+1;
    if(tick.meterSeq!==seq||tick.reads.length!==2||!Number.isFinite(tick.observedTime))reject('getter-binding');
    for(const [side,read] of tick.reads.entries()){
      const pos=index*2+side,attempt=attempts[pos],power=reads[pos],cursor=read.cursor;
      if(read.attempt!==pos+1||attempt.ordinal!==pos+1||read.powerReadCursor!==pos||attempt.powerReadCursor!==pos||attempt.error!==null||
        attempt.index!==side||power.index!==side||attempt.size!==fft||power.size!==fft||
        !Array.isArray(cursor)||cursor.length!==7||!cursor.every(Number.isSafeInteger))reject('getter-binding');
      const [ordinal,modulo,written,first,end,before,after]=cursor;
      const startClock=Math.round(attempt.time*44100),endClock=Math.round(power.time*44100);
      if(ordinal!==seq||written<lastWritten[side]||written%128||modulo!==written%ring||
        (written===0?first!==-1||end!==-1:first!==graph.firstWrites[side]||end!==first+written||end<before||end>after+128)||
        attempt.time!==startClock/44100||power.time!==endClock/44100||[startClock,endClock,before,after].some(n=>n%128!==0)||
        !(0<=startClock&&startClock<=before&&before<=after&&after<=endClock&&endClock<=proof.cutoffFrame))reject('getter-cursor');
      lastWritten[side]=written;
      let sum=0;
      for(let i=0;i<fft;i++){
        const offset=pos*rowBytes+i*4,value=raw.readFloatLE(offset);
        if(!Number.isFinite(value)||i<fft-Math.min(written,fft)&&raw.readUInt32LE(offset)!==0)reject('getter-pcm');
        sum+=value*value;
      }
      if(sum/fft!==power.power)reject('getter-power');
    }
    if(tick.postOrder===null&&tick.ackOrder===null)continue;
    const post=events[tick.postOrder-1],ack=events[tick.ackOrder-1],packet=post?.packet,reply=ack?.packet,app=reply?.application;
    if(!Number.isSafeInteger(tick.postOrder)||!Number.isSafeInteger(tick.ackOrder)||!(lastAck<tick.postOrder&&tick.postOrder<tick.ackOrder)||
      post?.direction!=='send'||packet.kind!=='power'||!epochMatches(packet)||packet.meterSeq!==seq||packet.observedTime!==tick.observedTime||
      packet.leftPower!==reads[index*2].power||packet.rightPower!==reads[index*2+1].power||
      ack?.direction!=='receive'||reply.kind!=='meter-accepted'||!epochMatches(reply)||reply.seq!==seq||
      !epochMatches(app)||app.meterSeq!==seq||app.commandSeq!==commandSeq||app.frame!==reply.frame||
      !wire.delete(tick.postOrder)||!wire.delete(tick.ackOrder))reject('getter-ack');
    lastAck=tick.ackOrder;
    if(app.mode==='warmup')warmup.set(seq,tick);
  }
  if(wire.size||lastWritten.some(w=>w===0))reject('getter-ack');
  const selected=measured.fftCompatibility.records.filter(row=>row.status==='MISMATCH'&&warmup.has(row.meterSeq));
  if(!selected.length)reject('no-warmup-mismatch');
  const rows=selected.map(({meterSeq,channel})=>{
    const read=warmup.get(meterSeq).reads[channel],[,,written,,end]=read.cursor,used=Math.min(written,fft);
    if(!used)reject('first-write');
    const stop=end-delay,start=stop-used,window=archive.window(start,stop,1),samples=window.channels[channel];
    if(window.start!==start||window.end!==stop||samples?.length!==used)reject('source-coverage');
    let sum=0;
    for(const sample of samples){if(!Number.isFinite(sample))reject('source-coverage');sum+=sample*sample;}
    const expected=sum/fft,actual=reads[read.powerReadCursor].power;
    const compatible=expected<=1e-9?actual<=1e-9:actual>0&&Math.abs(10*Math.log10(actual/expected))<=.05;
    return {meterSeq,channel,expected,actual,unwritten:fft-used,compatible};
  });
  return {state:rows.every(row=>row.compatible)?'COMPATIBLE':'MISMATCH',originalOutcome:'FAIL',rows};
}
