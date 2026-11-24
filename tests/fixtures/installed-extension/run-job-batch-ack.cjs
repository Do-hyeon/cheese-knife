// Pure external executor transport. The sender emits this after the row audit is persisted.
const prefix='RUN_JOB_GATE_ACK ';
const fail=()=>Error('run-job-batch-gate-ack');
const redeclaration=/^Warning: [$A-Z_a-z][$\w]* was declared with const; use let for reassignable variables\.$/;

function formatRunJobGateAck({event,token,index,name}){
  return prefix+JSON.stringify({event,token,index,name});
}

function assertRunJobGateAck(response,row){
  if(typeof row?.token!=='string'||!row.token||!Number.isInteger(row.index)||row.index<0||
    typeof row.name!=='string'||!row.name||(response?.isError!==undefined&&response.isError!==false)||
    !Array.isArray(response?.content)||response.content.length>8)throw fail();
  const expected=formatRunJobGateAck({event:'gate-pass',token:row.token,index:row.index,name:row.name});
  let seen=false,length=0;
  for(const block of response.content){
    if(seen||block?.type!=='text'||typeof block.text!=='string')throw fail();
    const {text}=block;
    length+=text.length;
    if(length>8192)throw fail();
    const lines=text.split(/\r?\n/);
    if(lines.at(-1)===expected&&lines.slice(0,-1).every(line=>redeclaration.test(line)))seen=true;
    else if(!text.startsWith('Warning: ')||/[\r\n\u2028\u2029]/.test(text)||text.includes(prefix))throw fail();
  }
  if(!seen)throw fail();
}

module.exports={formatRunJobGateAck,assertRunJobGateAck};
