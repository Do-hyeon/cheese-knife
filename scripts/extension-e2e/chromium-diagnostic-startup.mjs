const launchMs=150000,frameLimit=256;
const token=/^[a-f0-9]{64}$/;

export function translateDiagnosticStart(ready,received,frame,nonce){
  if(!Number.isFinite(ready)||ready<0||!Number.isFinite(received)||received<ready||
     !frame||Object.keys(frame).length!==3||frame.type!=='origin'||frame.nonce!==nonce||!token.test(nonce)||
     !Number.isSafeInteger(frame.elapsedMs)||frame.elapsedMs<0||frame.elapsedMs>=launchMs)
    throw Error('diagnostic-startup-origin');
  // The parent measures after receiving READY, so subtraction can only charge extra IPC time.
  const started=ready-frame.elapsedMs;
  if(received>=started+launchMs)throw Error('diagnostic-startup-deadline');
  return started;
}

async function readOrigin(input){
  let length=0;
  const parts=[];
  for await(const chunk of input){
    const bytes=Buffer.from(chunk);
    length+=bytes.length;
    if(length>frameLimit)throw Error('diagnostic-startup-frame');
    parts.push(bytes);
  }
  try{
    const source=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
    const frame=JSON.parse(source);
    if(JSON.stringify(frame)+'\n'!==source)throw Error('diagnostic-startup-frame');
    return frame;
  }catch(error){throw Error('diagnostic-startup-frame',{cause:error});}
}

/** Safe child entry. Only the frozen input binder is run while startup download denial is unproved. */
export async function runDiagnosticStartupProbe({env,argv,execArgv,node,entry,input,emit,bind,now=()=>performance.now()}){
  const pairs=Object.entries(env);
  const values=new Map(pairs.map(([name,value])=>[name.toUpperCase(),value]));
  const nonce=values.get('CK_STARTUP_NONCE');
  if(argv.length!==2||argv[0]!==node||argv[1]!==entry||execArgv.length||
     pairs.length!==4||values.get('SYSTEMROOT')!=='C:\\Windows'||values.get('WINDIR')!=='C:\\Windows'||
     values.get('PATH')!=='C:\\Windows\\System32'||!token.test(nonce))
    throw Error('diagnostic-startup-selection');
  const ready=now();
  emit({type:'ready',nonce});
  const frame=await readOrigin(input);
  const started=translateDiagnosticStart(ready,now(),frame,nonce);
  const binding=await bind(started);
  const elapsedMs=now()-started;
  if(binding?.started!==started||!Number.isFinite(elapsedMs)||elapsedMs>=launchMs)throw Error('diagnostic-startup-deadline');
  return {type:'hold',nonce,reason:'download-before-file-init-unproved',started,elapsedMs,chromiumLaunches:0};
}
