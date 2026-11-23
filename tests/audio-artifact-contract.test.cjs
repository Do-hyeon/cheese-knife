const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const core=()=>import('../scripts/audio-artifact-core.mjs');

test('artifact hash reader uses exact bytes receiver sequential awaits and late root',async()=>{
  const {describeAudioArtifactFiles}=await core();
  const paths=['media-profiles.js','config.js','web/runtime.js','web/site-adapter.js','web/audio.js','web/player.js'];
  const bytes=Buffer.from([0x99,0x61,0x62,0x63,0x88]),before=Buffer.from(bytes);
  /** @type {string[]} */ const trace=[];
  const reader={get root(){trace.push('root');return 'reader-root';},
    /** @param {import('../scripts/audio-artifact-core.mjs',{with:{'resolution-mode':'import'}}).AudioArtifactPath} relative */
    async readFile(relative){assert.equal(this,reader);trace.push(`start:${relative}`);await Promise.resolve();trace.push(`end:${relative}`);return bytes.subarray(1,4);}};
  const result=await describeAudioArtifactFiles(reader,'fixture');
  assert.deepEqual(result,{label:'fixture',root:'reader-root',files:paths.map(path=>({path,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}))});
  assert.deepEqual(Object.keys(result),['label','root','files']);
  for(const entry of result.files)assert.deepEqual(Object.keys(entry),['path','sha256']);
  assert.deepEqual(trace,[...paths.flatMap(path=>[`start:${path}`,`end:${path}`]),'root']);
  assert.deepEqual(bytes,before);
});

test('artifact reader stops on runtime failure and retains rejection identity',async()=>{
  const {describeAudioArtifactFiles}=await core(),failure=new Error('reader-failure');
  /** @type {string[]} */ const trace=[];
  const reader={get root(){trace.push('root');return 'unused';},
    /** @param {string} relative */
    async readFile(relative){trace.push(relative);if(relative==='web/runtime.js')throw failure;return Buffer.from('abc');}};
  await assert.rejects(describeAudioArtifactFiles(reader,'fixture'),error=>error===failure);
  assert.deepEqual(trace,['media-profiles.js','config.js','web/runtime.js']);
});

test('actual complete quality measurements metadata and nullable partial comparisons compile and run',async()=>{
  const {compareAudioArtifactReports,describeAudioArtifactFiles}=await core();
  const {summarizeCapture}=await import('../scripts/audio-signal.mjs');
  const summary=summarizeCapture({rate:1000,start:0,end:8,channels:[Array(8).fill(0.25),Array(8).fill(0.25)]});
  const stress=summarizeCapture({rate:1000,start:0,end:8,channels:[Array(8).fill(0.98),Array(8).fill(0.98)]});
  /** @type {import('../scripts/audio-metrics.mjs',{with:{'resolution-mode':'import'}}).QualityReport} */
  const report={cases:[{frequency:125,inputAmplitude:0.25,gain:1,enabled:true,stereo:'identical',bursts:false,...summary}],
    transitions:[{frequency:125,kind:'enabled',value:true,before:summary,change:summary,after:summary},{frequency:125,kind:'gain',value:1.5,before:summary,change:summary,after:summary}],
    stress:{profile:'fixture',...stress},alignments:[{sampleRate:1000,expectedFrame:0,dryFirst:0,dryLast:0,compressorFirst:0,compressorLast:0}]};
  const artifact=await describeAudioArtifactFiles({root:'fixture',readFile:async()=>Buffer.from('abc')},'fixture');
  const metadata={...report,artifact,nodes:{sources:1},qualityFailures:[],browser:'fixture'},before=structuredClone(metadata);
  assert.deepEqual(compareAudioArtifactReports([metadata,structuredClone(metadata)]),[]);
  /** @type {import('../scripts/audio-artifact-core.mjs',{with:{'resolution-mode':'import'}}).AudioComparisonReport} */
  const partial={artifact,qualityFailures:[],cases:[{frequency:undefined,channels:[summary.channels[0]]}],alignments:[null,undefined,,{}]};
  assert.deepEqual(compareAudioArtifactReports([partial,structuredClone(partial)]),[]);
  assert.deepEqual(metadata,before);
  assert.deepEqual(compareAudioArtifactReports(),['artifact-report-count']);
  assert.deepEqual(compareAudioArtifactReports(undefined),['artifact-report-count']);
});

/** @param {string} config */
function compile(config){
  const result=spawnSync(process.execPath,[path.resolve('node_modules/typescript/bin/tsc'),'-p',config,'--pretty','false'],{encoding:'utf8',timeout:30000,maxBuffer:1048576});
  assert.ifError(result.error);assert.equal(result.signal,null);assert.notEqual(result.status,null);return result;
}
/** @param {import('node:test').TestContext} t */
async function proofDirectory(t){await fs.mkdir('output',{recursive:true});const directory=await fs.mkdtemp(path.resolve('output/audio-artifact-types-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
/** @param {string} directory @param {string} file */
async function proofConfig(directory,file){const config=path.join(directory,'tsconfig.json');await fs.writeFile(config,JSON.stringify({extends:path.resolve('tsconfig.audio-tools.json'),files:[file],include:[]}));return config;}
/** @param {import('node:child_process').SpawnSyncReturns<string>} result @param {string} file @param {Map<number,string>} targets */
function assertDiagnostics(result,file,targets){
  assert.ok(result.status!==null&&result.status>0,result.stdout+result.stderr);assert.equal(result.stderr,'');
  const expectedPath=path.relative(process.cwd(),file).split(path.sep).join('/'),seen=new Set();
  for(const line of result.stdout.trim().split(/\r?\n/)){
    if(/^ {2,}\S/.test(line)){assert.doesNotMatch(line,/\berror TS\d+:/);continue;}
    const match=/^(.+)\((\d+),\d+\): error (TS\d+):/.exec(line);assert.ok(match,line);assert.equal(match[1]?.replaceAll('\\','/'),expectedPath,line);
    const number=Number(match[2]),codes=targets.get(number);assert.ok(codes,line);assert.ok(codes.split('|').includes(match[3]||''),line);seen.add(number);
  }
  assert.deepEqual([...seen].sort((a,b)=>a-b),[...targets.keys()].sort((a,b)=>a-b));
}
const setup=[
  "import {describeAudioArtifactFiles as describe,compareAudioArtifactReports as compare} from '../../scripts/audio-artifact-core.mjs';",
  "import type {AudioArtifactReader,AudioArtifactDescription,AudioArtifactPath,AudioComparisonReport} from '../../scripts/audio-artifact-core.mjs';",
  "import {summarizeCapture} from '../../scripts/audio-signal.mjs';",
  'const summary=summarizeCapture({rate:1000,start:0,end:8,channels:[[0.25,0.25,0.25,0.25,0.25,0.25,0.25,0.25],[0.25,0.25,0.25,0.25,0.25,0.25,0.25,0.25]]});',
  'const reader:AudioArtifactReader={root:"fixture",readFile:async(relative:AudioArtifactPath)=>Buffer.from(relative)};',
  'const broad={root:"fixture",readFile:async(relative:string)=>Buffer.from(relative)};',
  'const narrow={root:"fixture",readFile:async(relative:"config.js")=>Buffer.from(relative)};',
  'const disjoint={root:"fixture",readFile:async(relative:"not-an-artifact")=>Buffer.from(relative)};',
  'const artifact:AudioArtifactDescription={root:"fixture",label:"fixture",files:[{path:"config.js",sha256:"a"}]};',
  'const report={artifact,qualityFailures:[],nodes:{sources:1},browser:"fixture",cases:[{frequency:125,inputAmplitude:0.25,gain:1,enabled:true,stereo:"identical" as const,bursts:false,...summary}],transitions:[{frequency:125,kind:"gain" as const,value:1.5,before:summary,change:summary,after:summary}],alignments:[{sampleRate:1000,expectedFrame:0,dryFirst:0,dryLast:0,compressorFirst:0,compressorLast:0}],stress:{...summary,profile:"fixture"}};',
];
test('compiler accepts actual readers reports and partials but rejects every public misuse',async t=>{
  const directory=await proofDirectory(t),file=path.join(directory,'proof.mts'),config=await proofConfig(directory,file);
  const positive=[...setup,'describe(reader,"fixture");describe(broad,"fixture");compare([report,report]);',
    'const partial:AudioComparisonReport={artifact,qualityFailures:[],cases:[{frequency:undefined,channels:[summary.channels[0]]}],alignments:[null,undefined,,{}]};compare([partial,partial]);',
    'const readonlyReports:readonly(AudioComparisonReport|null|undefined)[]=[partial,null,undefined];compare(readonlyReports);compare();compare(undefined);'];
  await fs.writeFile(file,positive.join('\n')+'\n');const valid=compile(config);assert.equal(valid.status,0,valid.stdout+valid.stderr);assert.equal(valid.stdout+valid.stderr,'');
  const rows=[
    {code:'describe(narrow,"fixture");',diagnostic:'TS2322|TS2345'},
    {code:'describe(disjoint,"fixture");',diagnostic:'TS2322|TS2345'},
    {code:'describe({root:"fixture",readFile:async()=>"abc"},"fixture");',diagnostic:'TS2322|TS2345'},
    {code:'describe({readFile:async()=>Buffer.from("abc")},"fixture");',diagnostic:'TS2741|TS2345'},
    {code:'describe({root:"fixture"},"fixture");',diagnostic:'TS2741|TS2345'},
    {code:'const missingFiles:AudioArtifactDescription={label:"fixture",root:"fixture"};',diagnostic:'TS2741'},
    {code:'const missingRoot:AudioArtifactDescription={label:"fixture",files:[]};',diagnostic:'TS2741'},
    {code:'artifact.nonexistentField;',diagnostic:'TS2339'},
    {code:'compare([{cases:[{frequency:"125"}]}]);',diagnostic:'TS2322|TS2345'},
    {code:'compare([{cases:[{enabled:1}]}]);',diagnostic:'TS2322|TS2345'},
    {code:'compare([{qualityFailures:[1]}]);',diagnostic:'TS2322|TS2345'},
    {code:'compare([{cases:{bad:true}}]);',diagnostic:'TS2322|TS2345|TS2353'},
    {code:'compare([{transitions:{bad:true}}]);',diagnostic:'TS2322|TS2345|TS2353'},
    {code:'compare([{alignments:{bad:true}}]);',diagnostic:'TS2322|TS2345|TS2353'},
    {code:'compare([{alignments:[{expectedFrame:"0"}]}]);',diagnostic:'TS2322|TS2345'},
    {code:'compare([{cases:[null]}]);',diagnostic:'TS2322|TS2345'},
    {code:'compare([{transitions:[null]}]);',diagnostic:'TS2322|TS2345'},
    {code:'compare([{cases:[{channels:[{envelope8ms:{min:"0"}}]}]}]);',diagnostic:'TS2322|TS2345'},
  ];
  await fs.writeFile(file,[...setup,...rows.map(row=>row.code)].join('\n')+'\n');assertDiagnostics(compile(config),file,new Map(rows.map((row,index)=>[setup.length+index+1,row.diagnostic])));
});

test('actual core boundaries reject all nine internal any leak controls',async t=>{
  const directory=await proofDirectory(t),file=path.join(directory,'core.mjs');
  const original=await fs.readFile('scripts/audio-artifact-core.mjs','utf8');
  const copy=original.replaceAll('\r\n','\n').replaceAll("'./audio-signal.mjs'","'../../scripts/audio-signal.mjs'").replaceAll("'./audio-metrics.mjs'","'../../scripts/audio-metrics.mjs'");
  await fs.writeFile(file,copy);const config=await proofConfig(directory,file),valid=compile(config);assert.equal(valid.status,0,valid.stdout+valid.stderr);assert.equal(valid.stdout+valid.stderr,'');
  const anchors=['const contents = await files.readFile(relative);','const label = report?.artifact?.label','const baselineFiles =','const files = new Map','else for (const failure','`${location}[${index}]`','compareMeasurement(expectedEntry.at(1)'];
  for(const anchor of anchors)assert.equal(copy.split(anchor).length,2,anchor);
  /** @type {string[]} */ const lines=[];const targets=new Map();
  /** @param {string} statement @param {string} diagnostic */
  const insert=(statement,diagnostic)=>{lines.push(statement);targets.set(lines.length,diagnostic);};
  for(let line of copy.split('\n')){
    if(line.includes('const label = report?.artifact?.label'))insert('    if (report) report.__dt01c_missing;','TS2339');
    if(line.includes('const baselineFiles =')||line.includes('const files = new Map')){
      assert.equal(line.split('[item.path, item.sha256]').length,2);line=line.replace('[item.path, item.sha256]','[(item.__dt01c_missing,item.path),item.sha256]');targets.set(lines.length+1,'TS2339');
    }
    if(line.includes('else for (const failure')){
      line=line.replace('failures.push(`${label}/quality/${failure}`)','(failure.__dt01c_missing, failures.push(`${label}/quality/${failure}`))');targets.set(lines.length+1,'TS2339');
    }
    if(line.includes('`${location}[${index}]`')){
      const expressions=line.trim().slice('compareMeasurement('.length).split(', `${location}')[0]?.split(', ');assert.equal(expressions?.length,2);
      insert(`      /** @type {number} */ const badExpectedArray = ${expressions?.[0]};`,'TS2322');
      insert(`      /** @type {number} */ const badActualArray = ${expressions?.[1]};`,'TS2322');
    }
    if(line.includes('compareMeasurement(expectedEntry.at(1)')){
      insert('      /** @type {number} */ const badExpectedEntry = expectedEntry.at(1);','TS2322');
      insert('      /** @type {number} */ const badActualEntry = actualEntry.at(1);','TS2322');
    }
    lines.push(line);
    if(line.includes('const contents = await files.readFile(relative);'))insert('    contents.__dt01c_missing;','TS2339');
  }
  assert.equal(targets.size,9);await fs.writeFile(file,lines.join('\n'));assertDiagnostics(compile(config),file,targets);
  assert.equal(await fs.readFile('scripts/audio-artifact-core.mjs','utf8'),original);
});
