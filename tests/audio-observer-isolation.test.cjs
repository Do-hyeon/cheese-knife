const test=require('node:test');
const assert=require('node:assert/strict');
const subject=()=>import('../scripts/audio-observer-isolation.mjs');
const suffixes=['f1','u1','t1','u2','t2','f2','t3','f3','u3'];
const paths=['media-profiles.js','config.js','web/runtime.js','web/site-adapter.js','web/audio.js','web/player.js'];
const caseInputs=[[1000,.5,1,false,'identical',false],[1000,.01,1,false,'identical',false],[100,.8,1,false,'identical',false],[5000,.8,1,false,'identical',false],
  [1000,.5,1,true,'identical',false],[1000,.01,1.5,true,'identical',false],[1000,.1,1.5,true,'identical',false],[1000,.5,1.5,true,'identical',false],
  [1000,.98,1.5,true,'identical',false],[1000,.98,2,true,'identical',false],[100,.8,1.5,true,'identical',false],[5000,.8,1.5,true,'identical',false],
  [1000,.5,1.5,true,'left-only',false],[1000,.98,1.5,true,'identical',true]];

async function nine(){
  const {summarizeCapture}=await import('../scripts/audio-signal.mjs');
  const order=suffixes.map(s=>({label:'f01obs-test-'+s,mode:s[0]}));
  const files=paths.map(path=>({path,sha256:'c'.repeat(64)}));
  const manifest={schema:1,prefix:'f01obs-test',order,tools:{frozen:{commit:'c5d45b8a7abf30450d3f1bbff45afbb8cd020cb5',inputSha256:'b'.repeat(64)},current:{commit:'a'.repeat(40),inputSha256:'d'.repeat(64)}},
    product:{files},environment:{platform:'linux',nodeVersion:'v24.19.0',nodeExecutableSha256:'e'.repeat(64),playwrightVersion:'1.62.1',browserExecutableSha256:'f'.repeat(64),sampleRate:48000},ci:{checkout:'a'.repeat(40),head:null}};
  const capture=(start,end,value=.35)=>({rate:48000,start,end,channels:[Array(end-start).fill(value),Array(end-start).fill(value)]});
  const summary=summarizeCapture(capture(0,2400));
  const records=order.map(({label,mode})=>{
    const artifact={label,root:'/synthetic/current',files:structuredClone(files)};
    const captures=[],transitions=[],actions=[];let frame=10000;
    for(const frequency of [250,750,1000])for(const [kind,value]of [['gain',1.5],['gain',2],['gain',0],['gain',1],['enabled',false],['enabled',true]]){
      const row={frequency,kind,value};
      for(const [phase,a,b]of [['before',-3840,-1920],['change',-960,1920],['after',4800,6720]]){
        const raw=capture(frame+a,frame+b);row[phase]=summarizeCapture(raw);
        if(kind==='enabled')captures.push({capture:raw,transition:{frequency,value,frame},phase});
      }
      if(kind==='enabled')actions.push({frame,afterFrame:frame});transitions.push(row);frame+=10000;
    }
    const report={artifact,browser:'151.0',nodes:{sources:1,sampleRate:48000,compressor:[]},
      cases:caseInputs.map(([frequency,inputAmplitude,gain,enabled,stereo,bursts])=>({frequency,inputAmplitude,gain,enabled,stereo,bursts,...structuredClone(summary)})),transitions,
      alignments:[[8000,48],[11025,66],[16000,96],[22050,132],[32000,192],[44100,264],[48000,288],[88200,529],[96000,576],[176400,1023],[192000,1023],[384000,1023]]
        .map(([sampleRate,expectedFrame])=>({sampleRate,expectedFrame,dryFirst:expectedFrame,dryLast:expectedFrame,compressorFirst:expectedFrame,compressorLast:expectedFrame})),
      stress:{profile:'threshold0/knee0/ratio1/gain2',...summarizeCapture(capture(0,2400,.98))},qualityFailures:[]};
    const diagnostic=mode==='f'?null:{artifact:structuredClone(artifact),sourceCommit:'a'.repeat(40),pullRequestHead:null,platform:'linux',nodeVersion:'v24.19.0',browserVersion:'151.0',sampleRate:48000,
      audioConfig:{audioDefault:false,audioGain:1},wanted:true,state:'on',traceEnabled:mode==='t',label,complete:true,truncated:false,error:null,validationErrors:[],secondaryErrors:[],
      gainRoles:['dry','wet','masterGain','headroom','compDry','compWet','compMix','normalizer'],captures,actions,
      trace:{complete:true,truncated:false,error:null,nodeCount:8,gains:Array(8).fill(1),events:mode==='t'?[{node:0,method:'setValueAtTime',value:1,time:1}]:[]},
      shutdown:{kind:'playwright',browserCloseAcknowledged:true,browserDisconnected:true}};
    return {label,mode,exitCode:0,signal:null,timedOut:false,overflow:false,closeConfirmed:true,report,diagnostic};
  });
  return {manifest,records};
}

test('observer order fixes all nine positions and rejects unsafe or overflowing labels',async()=>{
  const {observerRunPlan}=await subject();
  assert.deepEqual(observerRunPlan('f01obs-test'),suffixes.map(s=>({label:'f01obs-test-'+s,mode:s[0]})));
  for(const prefix of ['', '../x','UPPER','a'.repeat(62)])assert.throws(()=>observerRunPlan(prefix));
});

test('nine-role assessment requires original shape and independent complete U/T PCM',async()=>{
  const {assessObserverRunSet}=await subject(),f=await nine();
  assert.deepEqual(assessObserverRunSet(f),{transportComplete:true,qualityPass:true,failures:[]});
  for(const mutate of [x=>x.records.pop(),x=>x.records.reverse(),x=>{x.records[1].report=null;},x=>{x.records[0].diagnostic={};},
    x=>{x.records[1].diagnostic.sourceCommit='b'.repeat(40);},x=>{x.records[1].diagnostic.traceEnabled=true;},
    x=>{x.records[2].diagnostic.captures[0].capture.channels[0][0]=.1;},x=>{x.records[1].diagnostic.shutdown.browserDisconnected=false;},
    x=>{x.records[0].report.artifact.files[0].sha256='b'.repeat(64);},x=>{x.records[0].report.browser='other';},
    x=>{x.records[1].diagnostic.nodeVersion='v25.0';},x=>{x.manifest.tools.frozen.commit='b'.repeat(40);},x=>{x.manifest.ci.checkout='b'.repeat(40);},
    x=>{x.records[0].report.cases[0].frequency=750;},x=>{x.records[0].report.cases[0].gain=2;},x=>{x.records[0].report.cases[0].enabled=0;},
    x=>{x.records[0].report.transitions[0].value=2;},x=>{x.records[0].report.alignments[0].sampleRate=11025;},
    x=>{x.records[0].report.cases[0].channels.pop();},x=>{x.records[0].report.cases[0].channels[0].rms=NaN;},
    x=>{x.records[0].report.cases[0].channels[0].peak=Infinity;},x=>{x.records[0].report.qualityFailures=['forged'];},
    x=>{x.records[0].closeConfirmed=false;},x=>{x.records[0].exitCode=1;},x=>{x.records[0].overflow=true;},x=>{x.records[0].timedOut=true;}]){
    const broken=structuredClone(f);mutate(broken);const actual=assessObserverRunSet(broken);
    assert.equal(actual.transportComplete,false,String(mutate));assert.equal(actual.qualityPass,false);
  }
});

test('real numerical failure stays available without becoming transport success from exit alone',async()=>{
  const {assessObserverRunSet}=await subject(),f=await nine(),record=f.records[1];
  record.report.stress.channels[0].peak=1.1;record.report.qualityFailures=['stress-channel-0/peak=1.1'];record.exitCode=1;
  record.diagnostic.error='Audio quality failed: stress-channel-0/peak=1.1';
  const result=assessObserverRunSet(f);assert.equal(result.transportComplete,true);assert.equal(result.qualityPass,false);
  assert.ok(result.failures.some(x=>x.includes('peak=1.1')));assert.equal(record.report.stress.channels[0].peak,1.1);
  record.closeConfirmed=false;assert.equal(assessObserverRunSet(f).transportComplete,false);
});
