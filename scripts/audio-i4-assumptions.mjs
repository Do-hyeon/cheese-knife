import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

/** @typedef {{n:string,d:string}} Rational */
/** @typedef {{lo:Rational,hi:Rational}} Range */
/** @typedef {{nodeSha256:string,engineSha256:string,graphSha256:string,nodeVersion:string,engineVersion:string,platform:string,arch:string,sourceRevision:string,buildOrDispatchScope:string[]}} Target */
/** @typedef {{targetIdentity:Target,backendSha256:string}} Backend */
/** @typedef {{id:string,domain:Range[]}} Requirement */
/** @typedef {{caseId:string,caseSha256:string,sourceSha256:string,fs:number,channels:number,requiredOperations:Requirement[]}} CaseBinding */
/** @typedef {{ledgerSha256:string,reviewSha256:string,allowedTarget:Target,operationCoverage:string[],scope:{caseBindings:CaseBinding[]}}} Approval */
/** @typedef {{caseId:string,deadlineMonoMs:number,check:()=>void}} Budget */
/** @typedef {{caseId:string,caseSha256:string,sourceSha256:string,fs:number,channels:number,targetIdentity:Target,backendSha256:string}} Binding */
/** @typedef {{id:string,operation:string,domain:Range[],targetIdentity:Target,sourceRevision:string,buildOrDispatchScope:string[],evidence:{id:string,sha256:string}[],derivation:string,bound:Rational,status:string}} Operation */
/** @typedef {{status:'READY_CONDITIONAL'|'NOT_READY',binding:Binding|null,bounds:Operation[],reasons:string[]}} Admission */
/** @typedef {Pick<import('./extension-e2e/audio-l1.mjs').L1Files,'lstat'|'readFile'>} Files */

export const I4_OPERATION_IDS=Object.freeze(['math.pow','math.exp','math.log','math.tan','math.sin','math.cos','math.sqrt','arith.add','arith.sub','arith.mul','arith.div','arith.fma','cast.f32','cast.f64','fp.ftz32','fp.ftz64','graph.gain','graph.sum','graph.delay','graph.channel','graph.waveshaper']);
const maxBytes=8*1024*1024;
/** @type {WeakSet<Approval>} */const approvals=new WeakSet();
/** @type {WeakMap<Admission,{binding:Binding,budget:Budget,deadline:number,approval:Approval}>} */const admissions=new WeakMap();
/** @param {string} code @returns {never} */function fail(code){throw Object.assign(new Error(code),{code});}
/** @param {unknown} v @returns {Record<string,unknown>} */
function record(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return fail('i4-object');
  if(Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!('value'in d)))return fail('i4-accessor');
  return /** @type {Record<string,unknown>} */(v);
}
/** @param {unknown} v @param {string[]} names */
function fields(v,names){const o=record(v);if(!isDeepStrictEqual(Object.keys(o).sort(),[...names].sort()))fail('i4-fields');return o;}
/** @param {unknown} v @param {number} [max] */
function text(v,max=256){if(typeof v!=='string'||!v.length||v.length>max)return fail('i4-string');return v;}
/** @param {unknown} v */function hash(v){const s=text(v,64);if(!/^[0-9a-f]{64}$/.test(s))fail('i4-hash');return s;}
/** @param {unknown} v @param {number} [max] @returns {unknown[]} */
function list(v,max=256){if(!Array.isArray(v)||!v.length||v.length>max)return fail('i4-list');return v;}
/** @param {unknown} v */function paths(v){const a=list(v,16).map(x=>text(x,128));if(new Set(a).size!==a.length)fail('i4-duplicate');return a;}
/** @template T @param {T} v @returns {T} */function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
/** @param {unknown} input */
function canonical(input){
  let nodes=0,size=0;
  /** @param {unknown} v @param {number} depth @returns {unknown} */
  const walk=(v,depth)=>{
    if(++nodes>32768||depth>32)fail('i4-json-cap');
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='number'){if(!Number.isFinite(v))fail('i4-number');return v;}
    if(typeof v==='string'){size+=Buffer.byteLength(v);if(size>maxBytes)fail('i4-json-cap');return v;}
    if(Array.isArray(v)){
      if(v.length>256000)fail('i4-json-cap');const descriptors=Object.getOwnPropertyDescriptors(v);
      if(Object.getPrototypeOf(v)!==Array.prototype||Reflect.ownKeys(v).length!==v.length+1||Object.values(descriptors).some(d=>!('value'in d)))fail('i4-array');
      return Array.from({length:v.length},(_,i)=>{const d=descriptors[String(i)];if(!d||!d.enumerable)fail('i4-array');return walk(d.value,depth+1);});
    }
    const o=record(v),keys=Object.keys(o).sort();if(keys.length>256)fail('i4-json-cap');
    return Object.fromEntries(keys.map(k=>[k,walk(o[k],depth+1)]));
  };
  const result=JSON.stringify(walk(input,0));if(Buffer.byteLength(result)>maxBytes)fail('i4-json-cap');return result;
}
/** @param {unknown} spec */export const i4CaseDigest=spec=>createHash('sha256').update(canonical(spec)).digest('hex');
/** @param {Uint8Array} bytes */const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Canonical wire JSON also rejects duplicate keys without a second parser.
 * @param {unknown} bytes @returns {Record<string,unknown>} */
function parse(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>maxBytes)fail('i4-input-cap');
  const s=new TextDecoder('utf-8',{fatal:true}).decode(bytes),v=JSON.parse(s);
  if(JSON.stringify(v)!==s)fail('i4-json-canonical');canonical(v);return record(v);
}
/** @param {unknown} v @returns {Target} */
function target(v){const o=fields(v,['nodeSha256','engineSha256','graphSha256','nodeVersion','engineVersion','platform','arch','sourceRevision','buildOrDispatchScope']);return {nodeSha256:hash(o.nodeSha256),engineSha256:hash(o.engineSha256),graphSha256:hash(o.graphSha256),nodeVersion:text(o.nodeVersion),engineVersion:text(o.engineVersion),platform:text(o.platform),arch:text(o.arch),sourceRevision:text(o.sourceRevision),buildOrDispatchScope:paths(o.buildOrDispatchScope)};}
/** @param {unknown} v @returns {Backend} */function backendValue(v){const o=fields(v,['targetIdentity','backendSha256']);return {targetIdentity:target(o.targetIdentity),backendSha256:hash(o.backendSha256)};}
/** @param {unknown} v @param {Budget} [budget] @returns {Rational} */
function rational(v,budget){
  const o=fields(v,['n','d']),n=text(o.n,9865),d=text(o.d,9865);
  if(!/^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(n)||!/^[1-9][0-9]*$/.test(d))fail('i4-rational');
  const a=BigInt(n),b=BigInt(d);if(a.toString(2).replace('-','').length>32768||b.toString(2).length>32768)fail('i4-rational-cap');
  let x=a<0n?-a:a,y=b;while(y){budget?.check();[x,y]=[y,x%y];}if(x!==1n)fail('i4-rational-canonical');return {n,d};
}
/** @param {Rational} a @param {Rational} b */const lessEqual=(a,b)=>BigInt(a.n)*BigInt(b.d)<=BigInt(b.n)*BigInt(a.d);
/** @param {unknown} v @param {Budget} [budget] @returns {Range[]} */
function domain(v,budget){return list(v,3).map(raw=>{const o=fields(raw,['lo','hi']),lo=rational(o.lo,budget),hi=rational(o.hi,budget);if(!lessEqual(lo,hi))fail('i4-domain');return {lo,hi};});}
/** @param {unknown} v @param {Budget} [budget] @returns {Requirement[]} */
function requirements(v,budget){const a=list(v).map(raw=>{const o=fields(raw,['id','domain']);return {id:text(o.id,128),domain:domain(o.domain,budget)};});if(!isDeepStrictEqual(a.map(x=>x.id).sort(),[...I4_OPERATION_IDS].sort()))fail('i4-operation-coverage');return a;}
/** @param {Files} files @param {string} name */
async function boundedRead(files,name){const st=await files.lstat(name);if(!st?.isFile()||st.size>maxBytes)fail('i4-file-cap');const b=await files.readFile(name);if(!(b instanceof Uint8Array)||b.length>maxBytes)fail('i4-file-cap');return b;}
/** Load only the independently approved local record, never a capture-supplied approval.
 * @param {Files} files @param {string} approvalPath @returns {Promise<Approval>} */
export async function loadI4Approval(files,approvalPath){
  const o=fields(parse(await boundedRead(files,approvalPath)),['schema','ledgerSha256','reviewSha256','reviewPath','allowedTarget','operationCoverage','scope']);
  if(o.schema!=='f01-i4-approval-v1')fail('i4-approval-schema');
  const reviewSha256=hash(o.reviewSha256);if(sha(await boundedRead(files,text(o.reviewPath,512)))!==reviewSha256)fail('i4-review-digest');
  const coverage=list(o.operationCoverage).map(x=>text(x,128));if(!isDeepStrictEqual([...coverage].sort(),[...I4_OPERATION_IDS].sort()))fail('i4-operation-coverage');
  const scope=fields(o.scope,['caseBindings']),caseBindings=list(scope.caseBindings,66).map(raw=>{
    const c=fields(raw,['caseId','caseSha256','sourceSha256','fs','channels','requiredOperations']);if(![44100,48000,96000].includes(Number(c.fs))||typeof c.fs!=='number'||![1,2].includes(Number(c.channels))||typeof c.channels!=='number')fail('i4-case-binding');
    return {caseId:text(c.caseId,128),caseSha256:hash(c.caseSha256),sourceSha256:hash(c.sourceSha256),fs:c.fs,channels:c.channels,requiredOperations:requirements(c.requiredOperations)};
  });if(new Set(caseBindings.map(c=>c.caseId)).size!==caseBindings.length)fail('i4-duplicate-case');
  const approval=freeze({ledgerSha256:hash(o.ledgerSha256),reviewSha256,allowedTarget:target(o.allowedTarget),operationCoverage:coverage,scope:{caseBindings}});approvals.add(approval);return approval;
}
/** @param {unknown} spec @param {unknown} backend @returns {Binding} */
function binding(spec,backend){const c=record(spec),s=record(c.source),b=backendValue(backend);if(![44100,48000,96000].includes(Number(c.fs))||typeof c.fs!=='number'||![1,2].includes(Number(s.channels))||typeof s.channels!=='number')fail('i4-case-binding');return {...b,caseId:text(c.id,128),caseSha256:i4CaseDigest(c),sourceSha256:hash(s.sha256),fs:c.fs,channels:s.channels};}
/** @param {unknown} v @param {Budget} budget @returns {Operation} */
function operation(v,budget){
  budget.check();const o=fields(v,['id','operation','domain','targetIdentity','sourceRevision','buildOrDispatchScope','evidence','derivation','bound','status']),id=text(o.id,128);
  if(!I4_OPERATION_IDS.includes(id)||o.operation!==id)fail('i4-operation');
  if(o.status!=='SOURCE_REVIEWED')fail(o.status==='CONTRADICTED'?'i4-assumption-contradicted':'i4-assumption-missing');
  const bound=rational(o.bound,budget);if(BigInt(bound.n)<0n)fail('i4-bound-negative');
  const evidence=list(o.evidence,64).map(v=>{const e=fields(v,['id','sha256']);return {id:text(e.id,128),sha256:hash(e.sha256)};});if(new Set(evidence.map(e=>e.id)).size!==evidence.length)fail('i4-duplicate-evidence');
  return {id,operation:id,domain:domain(o.domain,budget),targetIdentity:target(o.targetIdentity),sourceRevision:text(o.sourceRevision),buildOrDispatchScope:paths(o.buildOrDispatchScope),evidence,derivation:text(o.derivation,16384),bound,status:o.status};
}
/** @param {unknown} caseSpec @param {unknown} ledgerBytes @param {unknown} approval @param {unknown} backend @param {Budget} budget @returns {Admission} */
export function admitI4Assumptions(caseSpec,ledgerBytes,approval,backend,budget){
  try{
    budget.check();if(!approval||typeof approval!=='object'||!approvals.has(/** @type {Approval} */(approval)))fail('i4-approval-untrusted');
    const a=/** @type {Approval} */(approval),b=binding(caseSpec,backend);
    if(budget.caseId!==b.caseId||!Number.isFinite(budget.deadlineMonoMs))fail('i4-budget-binding');
    if(!isDeepStrictEqual(a.allowedTarget,b.targetIdentity))fail('i4-target');
    if(!(ledgerBytes instanceof Uint8Array)||ledgerBytes.length>maxBytes)fail('i4-input-cap');if(sha(ledgerBytes)!==a.ledgerSha256)fail('i4-ledger-digest');
    const l=fields(parse(ledgerBytes),['schema','binding','operations','reviewDigest']);if(l.schema!=='f01-i4-assumptions-v1'||l.reviewDigest!==a.reviewSha256||!isDeepStrictEqual(l.binding,b))fail('i4-ledger-binding');
    const c=a.scope.caseBindings.find(c=>c.caseId===b.caseId);if(!c||c.caseSha256!==b.caseSha256||c.sourceSha256!==b.sourceSha256||c.fs!==b.fs||c.channels!==b.channels)fail('i4-approved-case');
    const ops=list(l.operations).map(o=>operation(o,budget));if(!isDeepStrictEqual(ops.map(o=>o.id).sort(),[...a.operationCoverage].sort()))fail('i4-operation-coverage');
    for(const req of c.requiredOperations){
      budget.check();const op=ops.find(o=>o.id===req.id);if(!op)fail('i4-operation-coverage');
      if(!isDeepStrictEqual(op.targetIdentity,b.targetIdentity)||!isDeepStrictEqual(op.buildOrDispatchScope,b.targetIdentity.buildOrDispatchScope))fail('i4-dispatch');
      if(op.sourceRevision!==b.targetIdentity.sourceRevision)fail('i4-source-revision');
      if(op.domain.length!==req.domain.length||!req.domain.every((r,i)=>{const d=op.domain[i];return d&&lessEqual(d.lo,r.lo)&&lessEqual(r.hi,d.hi);}))fail('i4-domain-coverage');
    }
    budget.check();const result=freeze(/** @type {Admission} */({status:'READY_CONDITIONAL',binding:b,bounds:ops,reasons:[]}));admissions.set(result,{binding:b,budget,deadline:budget.deadlineMonoMs,approval:a});return result;
  }catch(error){return freeze({status:'NOT_READY',binding:null,bounds:[],reasons:[error instanceof Error?error.message:'i4-invalid']});}
}
/** Verify provenance again at every future conditional-reference consumer.
 * @param {Admission} admission @param {unknown} caseSpec @param {unknown} backend @param {Budget} budget */
export function requireI4Admission(admission,caseSpec,backend,budget){const saved=admissions.get(admission);if(!saved||saved.budget!==budget||saved.deadline!==budget.deadlineMonoMs||!approvals.has(saved.approval)||!isDeepStrictEqual(saved.binding,binding(caseSpec,backend)))fail('i4-admission-invalid');budget.check();return admission;}
