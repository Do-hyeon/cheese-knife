import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {i4RemainingMs} from './audio-j1-arithmetic.mjs';
import {i4CaseDigest} from './audio-i4-assumptions.mjs';

/** @typedef {import('./audio-i4-assumptions.mjs').Budget} Budget */
/** @typedef {import('./extension-e2e/audio-l1.mjs').L1Files} Files */
/** @typedef {{stdout:import('node:events').EventEmitter,stderr:import('node:events').EventEmitter,stdin:import('node:events').EventEmitter & {end:(body:Uint8Array)=>unknown},pid?:number|undefined,once:(event:string,fn:(...args:unknown[])=>void)=>unknown,kill:(signal?:'SIGKILL')=>boolean}} Child */
/** @typedef {(callback:()=>void,ms:number)=>(()=>void)} Timer */
/** @typedef {{status:'READY'|'NOT_READY',ownership:'CLOSED'|'FAIL',pid:number|null,closeConfirmed:boolean,terminationRequested:boolean,terminationOutcome:'NOT_REQUESTED'|'ACCEPTED'|'REJECTED'|'THREW',error:string|null,stdout:Buffer}} ChildResult */
/** @param {string} code @returns {never} */function fail(code){throw Error(code);}
/** @param {Uint8Array|string} b */const sha=b=>createHash('sha256').update(b).digest('hex');
/** @param {unknown} v @returns {Record<string,unknown>} */const record=v=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail('i4-object');return /** @type {Record<string,unknown>} */(v);};
/** @param {unknown} v @param {string[]} names */function fields(v,names){const o=record(v);if(Object.keys(o).sort().join('\0')!==[...names].sort().join('\0'))fail('i4-fields');return o;}
/** @param {unknown} v @returns {string} */function string(v){if(typeof v!=='string'||!v.length||v.length>512)return fail('i4-string');return v;}
/** @param {unknown} v */function hash(v){const s=string(v);if(!/^[a-f0-9]{64}$/.test(s))fail('i4-hash');return s;}
/** @param {Uint8Array} b */function json(b){if(b.length>65536)fail('i4-header-cap');return record(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b)));}

/** Owns only its spawned handle. Failure to close poisons this owner permanently.
 * @param {Timer} [timer] */
export function createI4ChildOwner(timer=(fn,ms)=>{const t=setTimeout(fn,ms);return()=>clearTimeout(t);}){
  let poisoned=false,active=false;const used=new Set();
  return {
    /** @param {()=>Child} spawnChild @param {Budget} budget @param {Uint8Array} body @returns {Promise<ChildResult>} */
    async run(spawnChild,budget,body){
      if(poisoned||active||used.has(budget.caseId))fail('i4-owner-stopped');i4RemainingMs(budget);if(body.length>8*1024*1024)fail('i4-input-cap');used.add(budget.caseId);active=true;
      return new Promise(resolve=>{
        let closed=false,finished=false,stopping=false,killOK=true,error=/** @type {string|null} */(null),size=0,stderr=0;
        /** @type {number|null} */let pid=null;
        /** @type {ChildResult['terminationOutcome']} */let terminationOutcome='NOT_REQUESTED';
        /** @type {Buffer[]} */const chunks=[];
        /** @type {()=>void} */let cancelDeadline=()=>{},cancelClose=()=>{};
        /** @type {Child|undefined} */let child;
        /** @param {boolean} ok */const finish=ok=>{if(finished)return;finished=true;active=false;cancelDeadline();cancelClose();const ownership=closed&&killOK?'CLOSED':'FAIL';if(ownership==='FAIL')poisoned=true;resolve({status:ok?'READY':'NOT_READY',ownership,pid,closeConfirmed:closed,terminationRequested:stopping,terminationOutcome,error,stdout:Buffer.concat(chunks)});};
        /** @param {string} reason */const stop=reason=>{if(finished||stopping)return;error=reason;stopping=true;try{killOK=Boolean(child?.kill('SIGKILL'));terminationOutcome=killOK?'ACCEPTED':'REJECTED';}catch{killOK=false;terminationOutcome='THREW';}cancelClose=timer(()=>finish(false),3000);};
        try{child=spawnChild();}catch{error='i4-spawn';closed=true;finish(false);return;}
        pid=typeof child.pid==='number'&&Number.isSafeInteger(child.pid)&&child.pid>0?child.pid:null;
        child.once('close',(code,signal)=>{closed=true;if(code!==0||signal!==null)error??='i4-helper-exit';if(!error)try{i4RemainingMs(budget);}catch{error='i4-case-timeout';}finish(!error);});
        child.once('error',()=>stop('i4-helper-error'));
        child.stdin.on('error',()=>stop('i4-helper-stdin'));
        child.stdout.on('data',raw=>{if(finished||stopping)return;if(!(raw instanceof Uint8Array)){stop('i4-helper-output');return;}size+=raw.length;if(size>65536){stop('i4-helper-output-cap');return;}chunks.push(Buffer.from(raw));});
        child.stderr.on('data',raw=>{if(finished||stopping)return;if(!(raw instanceof Uint8Array)){stop('i4-helper-stderr');return;}stderr+=raw.length;if(stderr>65536)stop('i4-helper-stderr-cap');});
        try{cancelDeadline=timer(()=>stop('i4-case-timeout'),i4RemainingMs(budget));}catch{stop('i4-case-timeout');return;}
        try{child.stdin.end(body);}catch{stop('i4-helper-stdin');}
      });
    }};
}

/** @param {{lstat:(name:string)=>Promise<{size:number,isFile:()=>boolean}|null>,readFile:(name:string)=>Promise<Uint8Array>}} files @param {unknown} header @param {number} count @param {Budget} budget */
export async function readI4PrimitiveResult(files,header,count,budget){
  budget.check();if(!Number.isSafeInteger(count)||count<1||count>256)fail('i4-operation-cap');
  const h=fields(header,['kind','count','bytes','sha256','file']);if(h.kind!=='primitive-intervals'||h.count!==count||h.bytes!==count*128||h.file!=='reference.iv512le')fail('i4-result-shape');
  const digest=hash(h.sha256),st=await files.lstat('reference.iv512le');if(!st?.isFile()||st.size!==count*128)fail('i4-result-size');
  const bytes=await files.readFile('reference.iv512le');budget.check();if(bytes.length!==count*128||sha(bytes)!==digest)fail('i4-result-hash');
  /** @param {number} offset */const integer=offset=>{const raw=bytes.subarray(offset,offset+64);let n=0n;for(let i=63;i>=0;i--)n=(n<<8n)+BigInt(raw[i]??fail('i4-result-size'));return n&(1n<<511n)?n-(1n<<512n):n;};
  return Array.from({length:count},(_,i)=>{budget.check();const lo=integer(i*128),hi=integer(i*128+64);if(lo>hi)fail('i4-result-order');return Object.freeze({lo,hi});});
}

/** @typedef {{python:string,versions:readonly string[],contextSha256:string}} Backend */
/** @type {WeakMap<Backend,{files:Files,relative:string,pins:{file:string,sha256:string,bytes:number}[],basePins:{file:string,sha256:string,bytes:number}[],code:{file:string,sha256:string}[],owner:ReturnType<typeof createI4ChildOwner>}>} */const backends=new WeakMap();
/** @param {Files} files @param {string} relative */
export async function loadI4Backend(files,relative){
  if(!/^output\/i4-b-local-[A-Za-z0-9-]+$/.test(relative))fail('i4-backend-path');
  const st=await files.lstat(relative+'/backend.json');if(!st?.isFile()||st.size>65536)fail('i4-backend-cap');
  const bytes=await files.readFile(relative+'/backend.json'),m=fields(json(bytes),['schema','python','basePythonSha256','baseRuntime','wheelSha256','versions','pins','licenses','abi']);
  if(m.schema!=='f01-i4-backend-v1'||m.abi!=='cp312-win_amd64'||m.basePythonSha256!=='b847bb9f4e48c19f585c8bf7d8b355f3f8c6d2125717ece9c9d7e16fb9f09de8'||m.wheelSha256!=='753baf48bf00b391297622cecc4d33fb3e10966fe3e61c2e6e22a3f387fa6446')fail('i4-backend-identity');
  const python=await files.resolve(relative+'/venv/Scripts/python.exe',{type:'file'});if(m.python!==python||!Array.isArray(m.versions)||m.versions.length!==5||m.versions.some(v=>typeof v!=='string'||v.length>128)||!String(m.versions[0]).startsWith('3.12.')||m.versions[1]!=='2.3.2'||!Array.isArray(m.pins)||!m.pins.length||m.pins.length>256||!Array.isArray(m.licenses)||!m.licenses.length)fail('i4-backend-metadata');
  const pins=m.pins.map(raw=>{const p=fields(raw,['file','sha256','bytes']),file=string(p.file);if(!file.startsWith(relative+'/')||!Number.isSafeInteger(p.bytes)||Number(p.bytes)<0||Number(p.bytes)>16*1024*1024)fail('i4-backend-pin');return {file,sha256:hash(p.sha256),bytes:Number(p.bytes)};});
  if(new Set(pins.map(p=>p.file)).size!==pins.length||!pins.some(p=>p.file===relative+'/venv/Scripts/python.exe')||!pins.some(p=>p.file.endsWith('/pyvenv.cfg'))||!pins.some(p=>p.file.endsWith('.pyd'))||m.licenses.some(name=>typeof name!=='string'||!pins.some(p=>p.file===name)))fail('i4-backend-pins');
  for(const p of pins){const st=await files.lstat(p.file);if(!st?.isFile()||st.size!==p.bytes||sha(await files.readFile(p.file))!==p.sha256)fail('i4-backend-pin');}
  const config=await files.readFile(relative+'/venv/pyvenv.cfg','utf8');if(!/^include-system-site-packages = false$/m.test(config.replace(/\r/g,'')))fail('i4-backend-isolation');
  const home=/^home = (.+)$/m.exec(config.replace(/\r/g,''))?.[1];if(!home||!path.isAbsolute(home)||!Array.isArray(m.baseRuntime)||m.baseRuntime.length!==2)fail('i4-base-runtime');
  const basePins=m.baseRuntime.map((raw,i)=>{const p=fields(raw,['file','sha256','bytes']);if(p.file!==path.join(home,i?'python312.dll':'python.exe')||!Number.isSafeInteger(p.bytes)||Number(p.bytes)<1||Number(p.bytes)>16*1024*1024)fail('i4-base-runtime');return {file:string(p.file),sha256:hash(p.sha256),bytes:Number(p.bytes)};});
  if(basePins[0]?.sha256!==m.basePythonSha256)fail('i4-base-runtime');
  for(const p of basePins){const st=await fs.lstat(p.file);if(!st.isFile()||st.isSymbolicLink()||st.size!==p.bytes||sha(await fs.readFile(p.file))!==p.sha256)fail('i4-base-runtime');}
  const code=[];for(const file of ['scripts/audio_i4_reference.py','scripts/audio_i4_math.py','scripts/audio-j1-arithmetic.mjs','scripts/audio-j1-signed-reference.mjs','scripts/audio-i4-assumptions.mjs'])code.push({file,sha256:sha(await files.readFile(file))});
  const backend=Object.freeze({python,versions:Object.freeze([...m.versions]),contextSha256:sha(JSON.stringify({metadata:sha(bytes),code}))});
  backends.set(backend,{files,relative,pins,basePins,code,owner:createI4ChildOwner()});return backend;
}

/** Task2 runs primitives only; no actual reader, Admission or J1 graph is accepted.
 * @param {Backend} backend */
export function createI4PrimitiveRunner(backend){
  const state=backends.get(backend);if(!state)fail('i4-backend-untrusted');const owner=state.owner;
  return {
    /** @param {unknown[]} operations @param {Budget} budget */
    async run(operations,budget){
      budget.check();if(!Array.isArray(operations)||operations.length<1||operations.length>256)fail('i4-operation-cap');
      for(const p of [...state.pins,...state.code]){budget.check();const st=await state.files.lstat(p.file);if(!st?.isFile()||sha(await state.files.readFile(p.file))!==p.sha256)fail('i4-backend-changed');}
      for(const p of state.basePins){budget.check();const st=await fs.lstat(p.file);if(!st.isFile()||st.isSymbolicLink()||st.size!==p.bytes||sha(await fs.readFile(p.file))!==p.sha256)fail('i4-base-runtime');}
      const remainingMs=i4RemainingMs(budget),body=Buffer.from(JSON.stringify({caseId:budget.caseId,remainingMs,operations}));if(body.length>8*1024*1024)fail('i4-input-cap');
      const name=state.relative+'/case-'+randomUUID(),directory=await state.files.resolve(name,{type:'missing-or-directory'});await fs.mkdir(directory,{recursive:false});
      await state.files.writeFile(name+'/source.f32le',Buffer.alloc(0),{flag:'wx'});await state.files.writeFile(name+'/boundary.json',body,{flag:'wx'});
      const helper=await state.files.resolve('scripts/audio_i4_reference.py',{type:'file'});
      const result=await owner.run(()=>spawn(backend.python,['-I','-B',helper],{cwd:directory,shell:false,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'',TEMP:directory,TMP:directory},stdio:['pipe','pipe','pipe']}),budget,body);
      await state.files.writeFile(name+'/helper-result.json',JSON.stringify({...result,stdout:result.stdout.toString('utf8')}),{flag:'wx'});
      if(result.status!=='READY')return {...result,kind:'primitive-only',intervals:[],contextSha256:backend.contextSha256,caseDirectory:name};
      budget.check();const header=fields(json(result.stdout),['schema','status','caseId','versions','result']);if(header.schema!=='f01-i4-primitive-v1'||header.status!=='READY'||header.caseId!==budget.caseId||JSON.stringify(header.versions)!==JSON.stringify(backend.versions))fail('i4-helper-header');
      const specifier='./owned-files.mjs',{openOwnedRoot}=await import(specifier),caseFiles=/** @type {Files} */(await openOwnedRoot(directory));
      const intervals=await readI4PrimitiveResult(caseFiles,header.result,operations.length,budget);
      return {...result,kind:'primitive-only',intervals,contextSha256:backend.contextSha256,caseDirectory:name};
    }};
}

/** @typedef {import('./audio-j1-arithmetic.mjs').Interval} Interval */
/** @param {{lstat:(name:string)=>Promise<{size:number,isFile:()=>boolean}|null>,readFile:(name:string)=>Promise<Uint8Array>}} files @param {unknown} header @param {number} frames @param {Budget} budget */
export async function readI4MathResult(files,header,frames,budget){
  budget.check();if(!Number.isSafeInteger(frames)||frames<1||frames>256000)fail('i4-frame-cap');
  const h=fields(header,['kind','frames','program','controls','stateEnd','radiiEnd','doneFrame']);
  if(h.kind!=='math-only'||h.frames!==frames||!Number.isSafeInteger(h.doneFrame)||Number(h.doneFrame)<0||Number(h.doneFrame)>frames+10000)fail('i4-math-result');
  /** @param {unknown} raw @param {string} file @param {number} bytes */
  const descriptor=(raw,file,bytes)=>{const d=fields(raw,['file','bytes','sha256']);if(d.file!==file||d.bytes!==bytes)fail('i4-math-descriptor');return {file,bytes,sha256:hash(d.sha256)};};
  const descriptors=[descriptor(h.program,'reference.iv512le',frames*256),descriptor(h.controls,'control.f64le',frames*40)];
  for(const d of descriptors){budget.check();const st=await files.lstat(d.file);if(!st?.isFile()||st.size!==d.bytes)fail('i4-math-size');}
  /** @param {unknown} value @param {boolean} radius @returns {(string|string[])[][]} */
  const state=(value,radius)=>{
    if(!Array.isArray(value)||value.length!==2)fail('i4-state-shape');
    const check=(/** @type {unknown} */v)=>{if(typeof v!=='string'||v.length>192||!(/^(0|-[1-9][0-9]*|[1-9][0-9]*)$/).test(v)||radius&&v.startsWith('-'))fail('i4-state-value');return v;};
    return value.map(lane=>{if(!Array.isArray(lane)||lane.length!==8)fail('i4-state-shape');return lane.map(v=>{if(radius)return check(v);if(!Array.isArray(v)||v.length!==2)fail('i4-state-shape');return v.map(check);});});
  };
  const stateEnd=state(h.stateEnd,false),radiiEnd=state(h.radiiEnd,true);
  const data=[];for(const d of descriptors){budget.check();const bytes=await files.readFile(d.file);budget.check();if(bytes.length!==d.bytes||sha(bytes)!==d.sha256)fail('i4-math-hash');data.push(Buffer.from(bytes));}
  const p=data[0]??fail('i4-math-payload'),c=data[1]??fail('i4-math-payload');
  /** @param {number} offset */const integer=offset=>{let n=0n;for(let i=63;i>=0;i--)n=(n<<8n)+BigInt(p[offset+i]??fail('i4-math-size'));return n&(1n<<511n)?n-(1n<<512n):n;};
  /** @type {Interval[][]} */const programIntervals=[];const expectedControls=new Float64Array(frames*5);
  for(let n=0;n<frames;n++){
    if(n%4096===0){await new Promise(resolve=>setImmediate(resolve));budget.check();}
    const row=[];for(let lane=0;lane<2;lane++){const offset=n*256+lane*128,lo=integer(offset),hi=integer(offset+64);if(lo>hi)fail('i4-math-order');row.push(Object.freeze({lo,hi}));}programIntervals.push(row);
    for(let lane=0;lane<5;lane++){const value=c.readDoubleLE((n*5+lane)*8);if(!Number.isFinite(value))fail('i4-control-nonfinite');expectedControls[n*5+lane]=value;}
  }
  budget.check();return {programIntervals,expectedControls,stateEnd,radiiEnd,doneFrame:Number(h.doneFrame)};
}

/** @param {unknown} caseSpec @param {{source:Uint8Array}} boundary @param {Backend} backend @param {Budget} budget @param {string|null} mutation */
async function deriveI4Graph(caseSpec,boundary,backend,budget,mutation){
  const state=backends.get(backend);if(!state)fail('i4-backend-untrusted');budget.check();
  const caseSha256=i4CaseDigest(caseSpec),spec=fields(caseSpec,['fs','frames','sourceFrame','channels','sourceSha256','initial','commands']);
  const frames=Number(spec.frames),channels=Number(spec.channels);
  if(typeof spec.fs!=='number'||![44100,48000,96000].includes(spec.fs)||typeof spec.frames!=='number'||!Number.isSafeInteger(frames)||frames<1||frames>256000||typeof spec.channels!=='number'||![1,2].includes(channels)||!Number.isSafeInteger(spec.sourceFrame)||Number(spec.sourceFrame)<0||Number(spec.sourceFrame)>=frames||!Array.isArray(spec.commands)||spec.commands.length>256)fail('i4-math-case');
  if(!(boundary.source instanceof Uint8Array)||boundary.source.length!==frames*channels*4||sha(boundary.source)!==hash(spec.sourceSha256))fail('i4-source-binding');
  const source=Buffer.from(boundary.source),specBytes=JSON.stringify(spec);budget.check();
  for(const p of [...state.pins,...state.code]){budget.check();const st=await state.files.lstat(p.file);if(!st?.isFile()||sha(await state.files.readFile(p.file))!==p.sha256)fail('i4-backend-changed');}
  for(const p of state.basePins){budget.check();const st=await fs.lstat(p.file);if(!st.isFile()||st.isSymbolicLink()||st.size!==p.bytes||sha(await fs.readFile(p.file))!==p.sha256)fail('i4-base-runtime');}
  const name=state.relative+'/case-'+randomUUID(),directory=await state.files.resolve(name,{type:'missing-or-directory'});await fs.mkdir(directory,{recursive:false});
  const body=Buffer.from(JSON.stringify({schema:mutation===null?'f01-i4-math-request-v1':'f01-i4-mutation-request-v1',caseId:budget.caseId,remainingMs:i4RemainingMs(budget),case:JSON.parse(specBytes),...(mutation===null?{}:{mutation})}));if(body.length>8*1024*1024)fail('i4-input-cap');
  await state.files.writeFile(name+'/source.f32le',source,{flag:'wx'});await state.files.writeFile(name+'/boundary.json',body,{flag:'wx'});
  const helper=await state.files.resolve('scripts/audio_i4_reference.py',{type:'file'});
  const result=await state.owner.run(()=>spawn(backend.python,['-I','-B',helper],{cwd:directory,shell:false,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'',TEMP:directory,TMP:directory},stdio:['pipe','pipe','pipe']}),budget,body);
  await state.files.writeFile(name+'/helper-result.json',JSON.stringify({...result,stdout:result.stdout.toString('utf8')}),{flag:'wx'});
  const binding={caseId:budget.caseId,caseSha256,sourceSha256:hash(spec.sourceSha256),backendSha256:backend.contextSha256,mutation};
  const base={...result,kind:mutation===null?'math-only':'mutation-only',binding,caseDirectory:name,numericAssumptions:'MISSING',signedModel:'NOT_EVALUATED',actualQualification:'NOT_RUN',formalEngineProof:'UNPROVEN'};
  if(result.status!=='READY')return {...base,programIntervals:/** @type {Interval[][]} */([]),expectedControls:new Float64Array(0),stateEnd:[],radiiEnd:[],doneFrame:0};
  budget.check();const header=fields(json(result.stdout),['schema','status','caseId','versions','result']);if(header.schema!=='f01-i4-math-v1'||header.status!=='READY'||header.caseId!==budget.caseId||JSON.stringify(header.versions)!==JSON.stringify(backend.versions))fail('i4-helper-header');
  const specifier='./owned-files.mjs',{openOwnedRoot}=await import(specifier),caseFiles=/** @type {Files} */(await openOwnedRoot(directory));
  let metadata=header.result;
  if(mutation!==null){const h=record(metadata);if(h.kind!=='mutation-only')fail('i4-mutation-kind');metadata={...h,kind:'math-only'};}
  return {...base,...await readI4MathResult(caseFiles,metadata,frames,budget)};
}

/** E1 only: no Admission, actual reader, native bounds or qualification.
 * @param {unknown} caseSpec @param {{source:Uint8Array}} boundary @param {Backend} backend @param {Budget} budget */
export function deriveI4MathReference(caseSpec,boundary,backend,budget){return deriveI4Graph(caseSpec,boundary,backend,budget,null);}

const mathMutations=Object.freeze(['zero','right-zero','abs','invert','swap','clone','delay-minus-one','delay-plus-one','linear480','state-reset','immediate-source-gain','omit-eq','omit-headroom','omit-gain','omit-delay','omit-limiter']);
/** Explicit negative-control path; never returned as a math-only reference.
 * @param {unknown} caseSpec @param {{source:Uint8Array}} boundary @param {Backend} backend @param {Budget} budget @param {string} mutation */
export function deriveI4MathMutation(caseSpec,boundary,backend,budget,mutation){if(!mathMutations.includes(mutation))fail('i4-mutation');return deriveI4Graph(caseSpec,boundary,backend,budget,mutation);}
