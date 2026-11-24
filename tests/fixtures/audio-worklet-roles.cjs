// 합성 진단 시험에서 roleFixture(label, mainSource, files, sha256)로 한 회의 연결과 포트 원장을 만든다.
// Node 기본 라이브러리만 사용한다. 값은 메모리에 반환하며 호출자가 변조 사례마다 새 복사본을 소유한다.
'use strict';
function roleFixture(label,mainSource,files,sha256){
  const source='blob:calibration-'+label;
  const kinds=['GainNode','AudioDestinationNode','MediaElementAudioSourceNode','AudioWorkletNode','MessagePort','AudioParam',
    'DelayNode','GainNode','GainNode','DynamicsCompressorNode','DelayNode','GainNode','GainNode','GainNode','GainNode','GainNode',
    'WaveShaperNode','GainNode','ChannelSplitterNode','ChannelSplitterNode','AnalyserNode','AnalyserNode','ConstantSourceNode'];
  const gains=[8,9,12,13,14,15,16,18].map((id,i)=>({id,param:24+i}));
  kinds.push(...gains.map(()=>'AudioParam'));
  const edges=[];
  function edge(from,to,output=0,input=0){edges.push({from,to,output,input});}
  function path(...nodes){for(let i=1;i<nodes.length;i++)edge(nodes[i-1],nodes[i]);}
  path(3,7,8,9,1,2);path(3,4,10,12,14,15,16,17,18,1);path(4,11,13,14);
  edge(4,19,1);
  for(const [channel,param]of [24,31,30,29,25].entries())edge(19,param,channel,null);
  edge(23,25,0,null);edge(23,6,0,null);path(14,20,21);edge(20,22,1);
  const graph={source,sink:1,destination:2,silentGain:0,terminalGain:0,disconnects:0,nodes:kinds.map((kind,i)=>({id:i+1,kind})),edges,gains,
    sources:[{node:3,source}],worklets:[{node:4,k:6,port:5,epoch:1}]};
  const events=[];
  const send=packet=>events.push({direction:'send',port:5,packet:{...packet,sourceEpoch:1}});
  const receive=(kind,seq,frame,rest={})=>events.push({direction:'receive',port:5,
    packet:{kind,seq,sourceEpoch:1,frame,meterEpoch:kind==='prepared'?0:1,code:null,gain:null,...rest}});
  receive('prepared',0,0);
  for(const seq of [1,2]){
    const eq=[0,0,0,0,seq===2?6:0,0,0,0],accepted=seq===1?128:2560;
    send({kind:'configure',seq,wanted:true,gain:1,dynamics:true,normalizer:true,targetDbfs:-20,eq});
    receive('accepted',seq,accepted);receive('completed',seq,accepted+(seq===1?1728:960),{gain:1});
    const frame=seq===1?2048:3712;
    send({kind:'power',meterEpoch:1,meterSeq:seq,active:true,leftPower:.02,rightPower:.02,observedTime:frame/48000,targetDbfs:-20});
    receive('meter-accepted',seq,frame,{code:'warmup',application:{frame,commandSeq:seq,sourceEpoch:1,meterSeq:seq,meterEpoch:1,mode:'warmup',start:frame/48000,end:frame/48000,fromDb:0,toDb:0},
      renderHeadroom:{commandSeq:seq,sourceEpoch:1,startFrame:frame,endFrame:frame+128,eq,headroom:10**(-(seq===2?6:0)/20)}});
  }
  return {label,mainSource,source,graph,port:{source,events},injectedMain:structuredClone(files),
    registration:{attempts:1,successes:1,sha256},terminalFrame:4096,rate:48000,state:'running',error:''};
}
module.exports={roleFixture};
