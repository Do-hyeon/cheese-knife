const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const metrics = () => import('../scripts/audio-metrics.mjs');

/** @returns {Promise<import('../scripts/audio-metrics.mjs', {with:{'resolution-mode':'import'}}).QualityReport>} */
async function normalReport() {
  const {summarizeCapture} = await import('../scripts/audio-signal.mjs');
  const summary = summarizeCapture({rate:1000,start:0,end:8,channels:[Array.from({length:8},()=>0.25),Array.from({length:8},()=>0.25)]});
  const stress = summarizeCapture({rate:1000,start:0,end:8,channels:[Array.from({length:8},()=>0.98),Array.from({length:8},()=>0.98)]});
  return {
    cases:[{frequency:125,inputAmplitude:0.25,gain:1,enabled:true,stereo:'identical',bursts:false,...summary}],
    transitions:[{frequency:125,kind:'enabled',value:true,before:summary,change:summary,after:summary},
      {frequency:125,kind:'gain',value:1.5,before:summary,change:summary,after:summary}],
    stress:{profile:'fixture',...stress},
    alignments:[{sampleRate:1000,expectedFrame:0,dryFirst:0,dryLast:0,compressorFirst:0,compressorLast:0}],
  };
}

test('strict quality API uses the real gate without changing identity or report data', async () => {
  const {audioQualityFailures,audioQualityReportFailures} = await metrics();
  assert.equal(typeof audioQualityReportFailures,'function');
  assert.equal(audioQualityReportFailures,audioQualityFailures);
  const report=await normalReport(),before=structuredClone(report);
  assert.deepEqual(audioQualityReportFailures(report),[]);
  const withMetadata={...report,browser:'fixture',qualityFailures:[]};
  assert.deepEqual(audioQualityReportFailures(withMetadata),[]);
  assert.deepEqual(audioQualityFailures(report),[]);
  assert.deepEqual(report,before);
});

test('checked partial gate still accepts first-channel-only transition measurements', async () => {
  const {audioQualityFailures} = await metrics(),report=await normalReport();
  const channel=report.stress.channels[0];
  /** @type {import('../scripts/audio-metrics.mjs', {with:{'resolution-mode':'import'}}).QualityGateInput} */
  const partial={cases:[{enabled:true,stereo:'identical',channels:[channel,channel]}],
    transitions:[{frequency:250,kind:'enabled',value:true,before:{channels:[channel]},change:{channels:[channel]},after:{channels:[channel]}}],
    stress:{channels:[channel,channel]},alignments:report.alignments};
  assert.deepEqual(audioQualityFailures(partial),[]);
  assert.deepEqual(audioQualityFailures(),['invalid-quality-report']);
  assert.deepEqual(audioQualityFailures(undefined),['invalid-quality-report']);
});

/** @param {string} config */
function compile(config) {
  const result=spawnSync(process.execPath,[path.resolve('node_modules/typescript/bin/tsc'),'-p',config,'--pretty','false'],
    {encoding:'utf8',timeout:30000,maxBuffer:1048576});
  assert.ifError(result.error); assert.equal(result.signal,null); assert.notEqual(result.status,null);
  return result;
}

/** @param {import('node:test').TestContext} t */
async function proofDirectory(t) {
  await fs.mkdir('output',{recursive:true});
  const directory=await fs.mkdtemp(path.resolve('output/audio-quality-types-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  return directory;
}

/** @param {string} directory @param {string} file */
async function proofConfig(directory,file) {
  const config=path.join(directory,'tsconfig.json');
  await fs.writeFile(config,JSON.stringify({extends:path.resolve('tsconfig.audio-tools.json'),files:[file],include:[]}));
  return config;
}

/** @param {import('node:child_process').SpawnSyncReturns<string>} result @param {string} file @param {Map<number,string>} targets */
function assertDiagnostics(result,file,targets) {
  assert.ok(result.status!==null&&result.status>0,result.stdout+result.stderr);
  assert.equal(result.stderr,'');
  const expectedPath=path.relative(process.cwd(),file).split(path.sep).join('/');
  const seen=new Set();
  for(const line of result.stdout.trim().split(/\r?\n/)) {
    if(/^ {2,}\S/.test(line)) { assert.doesNotMatch(line,/\berror TS\d+:/); continue; }
    const match=/^(.+)\((\d+),\d+\): error (TS\d+):/.exec(line);
    assert.ok(match,line);assert.equal(match[1]?.replaceAll('\\','/'),expectedPath,line);
    const number=Number(match[2]),codes=targets.get(number);
    assert.ok(codes,line);assert.ok(codes.split('|').includes(match[3]||''),line);seen.add(number);
  }
  assert.deepEqual([...seen].sort((a,b)=>a-b),[...targets.keys()].sort((a,b)=>a-b));
}

const setup=[
  "import {audioQualityReportFailures as gate,audioQualityFailures as partial} from '../../scripts/audio-metrics.mjs';",
  "import {summarizeCapture} from '../../scripts/audio-signal.mjs';",
  'const summary=summarizeCapture({rate:1000,start:0,end:8,channels:[[0.25,0.25,0.25,0.25,0.25,0.25,0.25,0.25],[0.25,0.25,0.25,0.25,0.25,0.25,0.25,0.25]]});',
  'const enabled={frequency:125,kind:"enabled" as const,value:true,before:summary,change:summary,after:summary};',
  'const gain={...enabled,kind:"gain" as const,value:1.5};',
  'const steady={frequency:125,inputAmplitude:0.25,gain:1,enabled:true,stereo:"identical" as const,bursts:false,...summary};',
  'const alignment={sampleRate:1000,expectedFrame:0,dryFirst:0,dryLast:0,compressorFirst:0,compressorLast:0};',
  'const report={cases:[steady],transitions:[enabled,gain],stress:{...summary,profile:"fixture"},alignments:[alignment]};',
  'const {stress:removedStress,...noStress}=report;',
  'const {before:removedBefore,...noBefore}=enabled;',
  'const {change:removedChange,...noChange}=enabled;',
  'const {after:removedAfter,...noAfter}=enabled;',
  'const {rms:removedRms,...noRms}=summary.channels[0];',
];

test('quality compiler permits complete metadata and legacy projections but rejects each normal API misuse', async t => {
  const directory=await proofDirectory(t),file=path.join(directory,'proof.mts');
  const positive=[...setup,'gate(report);','gate({...report,transitions:[enabled]});','gate({...report,transitions:[gain]});',
    'const metadata={...report,browser:"fixture",qualityFailures:[]}; gate(metadata);',
    'const value=summary.channels[0].thdPercent; if(value!==null)value*2;',
    'partial(); partial(undefined);',
    'partial({cases:[{enabled:true,stereo:"identical",channels:summary.channels}],transitions:[{frequency:125,kind:"enabled",value:true,before:{channels:[summary.channels[0]]},change:{channels:[summary.channels[0]]},after:{channels:[summary.channels[0]]}}],stress:{channels:summary.channels},alignments:[alignment]});'];
  await fs.writeFile(file,positive.join('\n')+'\n');
  const config=await proofConfig(directory,file),valid=compile(config);
  assert.equal(valid.status,0,valid.stdout+valid.stderr);assert.equal(valid.stdout+valid.stderr,'');
  const rows=[
    {code:'gate();',diagnostic:'TS2554'},
    {code:'gate(undefined);',diagnostic:'TS2345'},
    {code:'gate(null);',diagnostic:'TS2345'},
    {code:'gate({});',diagnostic:'TS2739'},
    {code:'gate(noStress);',diagnostic:'TS2741'},
    {code:'gate({...report,transitions:[noBefore]});',diagnostic:'TS2322|TS2345|TS2741'},
    {code:'gate({...report,transitions:[noChange]});',diagnostic:'TS2322|TS2345|TS2741'},
    {code:'gate({...report,transitions:[noAfter]});',diagnostic:'TS2322|TS2345|TS2741'},
    {code:'gate({...report,stress:{...report.stress,channels:[noRms,summary.channels[1]]}});',diagnostic:'TS2322|TS2345|TS2741'},
    {code:'gate({...report,transitions:[{...enabled,value:1}]});',diagnostic:'TS2322|TS2345'},
    {code:'gate({...report,transitions:[{...gain,value:false}]});',diagnostic:'TS2322|TS2345'},
    {code:'gate({...report,transitions:[{...enabled,kind:"unknown"}]});',diagnostic:'TS2322|TS2345'},
    {code:'gate({...report,stress:{...report.stress,channels:[summary.channels[0]]}});',diagnostic:'TS2322|TS2345'},
    {code:'gate({...report,stress:{...report.stress,channels:[summary.channels[0],summary.channels[1],summary.channels[0]]}});',diagnostic:'TS2322|TS2345'},
    {code:'gate({...report,stress:{...report.stress,sampleRate:"1000"}});',diagnostic:'TS2322|TS2345'},
    {code:'gate({...report,alignments:[{...alignment,expectedFrame:"0"}]});',diagnostic:'TS2322|TS2345'},
    {code:'gate({...report,cases:[{...steady,stereo:"unknown"}]});',diagnostic:'TS2322|TS2345'},
    {code:'gate({...report,cases:[{...steady,enabled:1}]});',diagnostic:'TS2322|TS2345'},
    {code:'summary.channels[0].thdPercent*2;',diagnostic:'TS2531|TS18047'},
    {code:'report.nonexistentField;',diagnostic:'TS2339'},
  ];
  await fs.writeFile(file,[...setup,...rows.map(row=>row.code)].join('\n')+'\n');
  assertDiagnostics(compile(config),file,new Map(rows.map((row,index)=>[setup.length+index+1,row.diagnostic])));
});

test('actual guarded gate loops reject nonexistent fields instead of leaking any', async t => {
  const directory=await proofDirectory(t),file=path.join(directory,'gate.mjs');
  const original=await fs.readFile('scripts/audio-metrics.mjs','utf8'),source=original.replaceAll('\r\n','\n');
  assert.ok(source.includes("'./audio-signal.mjs'"));
  const copy=source.replaceAll("'./audio-signal.mjs'","'../../scripts/audio-signal.mjs'");
  await fs.writeFile(file,copy);
  const config=await proofConfig(directory,file),valid=compile(config);
  assert.equal(valid.status,0,valid.stdout+valid.stderr);assert.equal(valid.stdout+valid.stderr,'');
  const anchors=[
    {text:'enabledSignals++;',variable:'item'},
    {text:'enabledTransitions++;',variable:'item'},
    {text:'case-${caseIndex}/channel-${channelIndex}/enabled-signal',variable:'channel'},
    {text:'stress-channel-${channelIndex}/signal',variable:'channel'},
    {text:'const frames = [',variable:'item'},
  ];
  for(const anchor of anchors)assert.equal(copy.split(anchor.text).length,2,anchor.text);
  const lines=[],targets=new Map();
  for(const line of copy.split('\n')) {
    const anchor=anchors.find(value=>line.includes(value.text));
    if(anchor) {
      lines.push(`    if (${anchor.variable}) ${anchor.variable}.__dt01b_missing;`);
      targets.set(lines.length,'TS2339');
    }
    lines.push(line);
  }
  assert.equal(targets.size,5);
  await fs.writeFile(file,lines.join('\n'));
  assertDiagnostics(compile(config),file,targets);
  assert.equal(await fs.readFile('scripts/audio-metrics.mjs','utf8'),original);
});
