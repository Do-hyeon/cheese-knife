const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
/** @type {WeakMap<Buffer,{caseId:string,sha256:string}>} */const generated=new WeakMap();
/** @param {Buffer} bytes */const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const rates=[44100,48000,96000],cut=[0,0,0,-6,-6,-6,-6,-6];
const suffixes=['d1-low-g100','d1-low-g132','d1-low-g001','pair-g100','pair-g132','pair-g001','d2-zero','d3-initial-zero','d3-residual','d4-mono','d4-left','d4-right','d4-antiphase','d4-asymmetric','timing-prefix','timing-reoff','timing-setting','timing-same-frame','hidden-zero-db','d3-muted','d3-volume0','d2-muted-zero'];
/** @template T @param {ArrayLike<T>} values @param {number} i @returns {T} */function at(values,i){const v=values[i];if(v===undefined)throw Error('i4-fixture-index');return v;}
/** @template T @param {T} v @returns {T} */function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
/** @param {number} fs @param {number} t */const block=(fs,t)=>128*Math.ceil(t*fs/128);
/** @param {number} fs */const delay=fs=>Math.min(Math.floor(Math.fround(Math.fround(.006)*Math.fround(fs))),1023);
/** @param {number} fs @param {string} suffix */
function build(fs,suffix){
  const S=block(fs,.1),E=S+128*Math.floor(2.4*fs/128),gain=suffix.endsWith('g100')?1:suffix.endsWith('g001')?.01:suffix==='d2-zero'||suffix==='d2-muted-zero'?0:1.32;
  const source={channels:suffix==='d4-mono'?1:2,sha256:/** @type {string|null} */(null),recipe:{frequency:250,amplitude:suffix.startsWith('d1-low')?1e-5:.1,phase:.37,rightFrequency:suffix==='d4-asymmetric'?750:250,rightAmplitude:suffix==='d4-asymmetric'?.05:suffix.startsWith('d1-low')?1e-5:.1,rightPhase:suffix==='d4-asymmetric'?-.23:.37,layout:suffix==='d3-initial-zero'?'zero':suffix==='d4-left'?'left':suffix==='d4-right'?'right':suffix==='d4-antiphase'?'antiphase':'normal',silenceAt:suffix==='d3-residual'?fs:null}};
  /** @type {[number,number,number]} */const times=[S+block(fs,.1),S+block(fs,.9),S+block(fs,1.45)];
  if(['timing-prefix','timing-reoff','timing-setting'].includes(suffix))times[2]=times[1]+128;
  if(suffix==='timing-same-frame')times[2]=times[1];
  const commands=times.map((frame,i)=>({kind:'configure',frame,wanted:i!==1,gain,eq:suffix==='hidden-zero-db'&&i===0?Array.from({length:8},()=>0):[...cut],normalizer:false,targetDbfs:-20,sourceEpoch:1,seq:0,expectedDoneFrame:0,completedFrame:/** @type {number|null} */(null),cancelled:false}));
  if(suffix==='timing-reoff')commands.push({...at(commands,1),frame:times[2]+128,eq:[...cut]});
  if(suffix==='timing-setting')commands.push({...at(commands,2),kind:'setting',frame:times[2]+128,gain:.5,eq:[0,0,-3,0,0,0,0,0]});
  if(suffix==='hidden-zero-db')commands.push({...at(commands,0),kind:'setting',frame:S+block(fs,.7),eq:[...cut]});
  commands.sort((a,b)=>a.frame-b.frame);let wanted=false,qEnd=0;
  for(const [i,c]of commands.entries()){
    c.seq=i+1;const changed=c.wanted!==wanted,start=c.frame+(changed&&c.wanted?.01*fs:0);
    if(changed)qEnd=c.frame+(c.wanted?.01*fs:.03*fs+delay(fs));
    c.expectedDoneFrame=Math.ceil(Math.max(qEnd,start+.02*fs,start+(changed?.02:.01)*fs+delay(fs)));wanted=c.wanted;
  }
  for(const [i,c]of commands.entries()){const next=commands[i+1];c.cancelled=Boolean(next&&next.frame<=c.expectedDoneFrame);c.completedFrame=c.cancelled?null:c.expectedDoneFrame;}
  const kind=suffix==='d3-muted'||suffix==='d2-muted-zero'?'muted':suffix==='d3-volume0'?'volume':null;
  const mediaEvents=kind?[{frame:S+block(fs,.7),property:kind,value:kind==='muted'?true:0},{frame:S+block(fs,1.8),property:kind,value:kind==='muted'?false:1}]:[];
  const witnesses=[{from:S+block(fs,.2),to:S+block(fs,.25)},...commands.flatMap(c=>[{from:c.frame-128,to:c.frame+129},...(c.completedFrame===null?[]:[{from:c.completedFrame,to:c.completedFrame+128}])]),{from:E-128,to:E}];
  const mutations=['zero','right-zero','abs','invert','swap','clone','delay-minus-one','delay-plus-one','linear480','state-reset','immediate-source-gain','omit-eq','omit-headroom','omit-gain','omit-delay','omit-limiter'];
  const mutationResponsibilities=Object.fromEntries(mutations.map(m=>[m,suffix==='d3-initial-zero'?`i4/${fs}/d4-asymmetric`:'self']));
  Object.assign(mutationResponsibilities,{swap:`i4/${fs}/d4-asymmetric`,clone:`i4/${fs}/d4-asymmetric`,'state-reset':`i4/${fs}/hidden-zero-db`,'immediate-source-gain':`i4/${fs}/timing-setting`,linear480:`i4/${fs}/timing-prefix`,'omit-eq':'unit/nonzero-eight-band-impulses','omit-headroom':'unit/positive-band-headroom','omit-gain':`i4/${fs}/pair-g132`,'omit-limiter':'unit/limiter-rational-plus-minus-one'});
  if(suffix==='d4-left')mutationResponsibilities['right-zero']=`i4/${fs}/d4-asymmetric`;
  return freeze({id:`i4/${fs}/${suffix}`,fs,domains:suffix==='d2-muted-zero'?['D2','D3']:suffix.startsWith('d1')?['D1']:suffix.startsWith('d2')?['D2']:suffix.startsWith('d3')?['D3']:suffix.startsWith('d4')?['D4']:['timing'],source,initial:{epoch:1,frame:0,mode:'raw',eq:Array.from({length:8},()=>0),gain:1,q:0,latch:0,eqStates:0,pcmDelayRings:0,sourceGainRing:1},commands,mediaEvents,channelMap:{Cd:source.channels===1?'mono-speakers':'stereo-identity',Cw:source.channels===1?'mono-speakers':'stereo-identity',Cobs:'identity'},originalApplicability:{minimumRms:.0001,lowDipOnly:suffix.startsWith('d1-low'),windows:[[-.08,-.04],[-.02,.04],[.10,.14]],rmsWindowSeconds:.008},witnesses,mutations,mutationResponsibilities,paired:suffix.startsWith('d1-low')?`i4/${fs}/pair-${suffix.slice(7)}`:`i4/${fs}/d4-asymmetric`,requiredStart:0,sourceFrame:S,requiredEnd:E,minimumTailFrames:Math.ceil(.2*fs),streamFrameCap:256000,comp:false,norm:false});
}
/** @param {ReturnType<typeof build>} c */function validate(c){const parts=c.id.split('/'),suffix=parts[2];if(parts.length!==3||parts[0]!=='i4'||Number(parts[1])!==c.fs||!rates.includes(c.fs)||!suffix||!suffixes.includes(suffix)||c.source.sha256!==null&&!/^[0-9a-f]{64}$/.test(c.source.sha256)||!isDeepStrictEqual({...c,source:{...c.source,sha256:null}},build(c.fs,suffix)))throw Error('i4-fixed-case');}
/** @returns {ReturnType<typeof build>[]} */exports.i4Cases=()=>rates.flatMap(fs=>suffixes.map(s=>build(fs,s)));
/** Generate only the declared canonical source, never product/reference output.
 * @param {ReturnType<typeof build>} c */
exports.generateI4Source=c=>{
  validate(c);
  const frames=c.requiredEnd-c.sourceFrame;if(!rates.includes(c.fs)||frames<=0||c.requiredStart!==0||c.requiredEnd>256000||![1,2].includes(c.source.channels))throw Error('i4-source-case');
  const r=c.source.recipe,bytes=Buffer.alloc(frames*c.source.channels*4);
  for(let k=0;k<frames;k++){
    const silent=r.layout==='zero'||r.silenceAt!==null&&k>=r.silenceAt;
    const left=silent||r.layout==='right'?0:Math.fround(r.amplitude*Math.sin(2*Math.PI*r.frequency*k/c.fs+r.phase));
    const right=silent||r.layout==='left'?0:r.layout==='antiphase'?-left:Math.fround(r.rightAmplitude*Math.sin(2*Math.PI*r.rightFrequency*k/c.fs+r.rightPhase));
    bytes.writeFloatLE(left,k*c.source.channels*4);if(c.source.channels===2)bytes.writeFloatLE(right,(k*2+1)*4);
  }const hash=sha(bytes);if(c.source.sha256!==null&&c.source.sha256!==hash)throw Error('i4-source-hash');generated.set(bytes,{caseId:c.id,sha256:hash});return bytes;
};
/** Canonical source tap is discrete [u,0] for mono, not speakers [u,u].
 * @param {ReturnType<typeof build>} c @param {Float32Array[]} tap */
exports.canonicalI4Source=(c,tap)=>{
  validate(c);
  if(tap.length!==2||tap.some(x=>!(x instanceof Float32Array)||x.length!==c.requiredEnd)||c.requiredStart!==0||c.requiredEnd>256000)throw Error('i4-source-tap');
  const bytes=Buffer.alloc((c.requiredEnd-c.sourceFrame)*c.source.channels*4);
  for(let n=0;n<c.requiredEnd;n++)for(let lane=0;lane<2;lane++){
    const value=at(at(tap,lane),n);if(!Number.isFinite(value)||n<c.sourceFrame&&value!==0||c.source.channels===1&&lane===1&&value!==0)throw Error('i4-source-tap');
    if(n>=c.sourceFrame&&lane<c.source.channels)bytes.writeFloatLE(value,((n-c.sourceFrame)*c.source.channels+lane)*4);
  }if(c.source.sha256!==null&&sha(bytes)!==c.source.sha256)throw Error('i4-source-hash');return bytes;
};
/** Bind once-generated canonical bytes; metadata never claims engine readiness.
 * @param {ReturnType<typeof build>} c @param {Buffer} bytes */
exports.bindI4Source=(c,bytes)=>{validate(c);const proof=generated.get(bytes);if(!proof||proof.caseId!==c.id||proof.sha256!==sha(bytes)||bytes.length!==(c.requiredEnd-c.sourceFrame)*c.source.channels*4)throw Error('i4-source-bytes');return freeze({...c,source:{...c.source,sha256:proof.sha256}});};
exports.i4InteriorUnits=()=>rates.flatMap(fs=>{
  const N=.02*fs,M=.01*fs,D=delay(fs),on=256,off=on+Math.ceil(M+N+D)+128;
  return [{name:'qInteriorOnToOff',frames:[on,on+Math.floor(M/2)],wanted:[true,false]},{name:'qInteriorOffToOn',frames:[on,off,off+N+D+Math.floor(M/2)],wanted:[true,false,true]}].map(u=>freeze({id:`i4-unit/${fs}/${u.name}`,fs,requiredStart:0,sourceFrame:0,source:'exact-zero-full-prefix',initial:{mode:'raw',q:0,sourceGainRing:1,eqStates:0,pcmDelayRings:0},commands:u.frames.map((frame,i)=>({frame,wanted:at(u.wanted,i),seq:i+1,sourceEpoch:1,normalizer:false,targetDbfs:-20})),interiorQ:u.name==='qInteriorOnToOff'?Math.floor(M/2)/M:1-Math.floor(M/2)/M,requiredEnd:Math.ceil(at(u.frames,u.frames.length-1)+M+N+D+.2*fs)}));
});
