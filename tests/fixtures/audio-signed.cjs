// Independent synthetic PCM, never copied from private Native evidence.
exports.installSignedFixture=({report,diagnostic},summarizeCapture)=>{
  diagnostic.sampleRate=report.nodes.sampleRate=48000;diagnostic.captures=[];diagnostic.actions=[];diagnostic.trace.events=[];
  let frame=10000;
  for(const row of report.transitions){
    if(row.kind!=='enabled')continue;
    const before=row.value?.36:.35,after=row.value?.35:.36,anchor=frame;
    for(const [phase,a,b]of [['before',-3840,-1920],['change',-960,1920],['after',4800,6720]]){
      const start=frame+a,end=frame+b;
      const samples=Array.from({length:end-start},(_,i)=>{const f=start+i,w=Math.max(0,Math.min(1,(f-anchor)/480));return ((1-w)*before+w*after)*Math.sin(2*Math.PI*(f%(48000/row.frequency))/(48000/row.frequency));});
      const capture={rate:48000,start,end,channels:[samples,samples.slice()]};
      diagnostic.captures.push({capture,phase,transition:{frequency:row.frequency,value:row.value,frame}});row[phase]=summarizeCapture(capture);
    }
    diagnostic.actions.push({frame,afterFrame:frame+128});
    if(diagnostic.traceEnabled)for(const node of [0,1]){
      const from=node===0?(row.value?1:0):(row.value?0:1),time=anchor/48000;
      diagnostic.trace.events.push({node,method:'cancelScheduledValues',value:null,time},{node,method:'setValueAtTime',value:from,time},{node,method:'linearRampToValueAtTime',value:1-from,time:time+.01});
    }
    frame+=10000;
  }
};
