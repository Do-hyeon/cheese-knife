const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const load = () => import('../scripts/audio-artifacts.mjs');

const artifactPaths=['config.js','web/runtime.js','web/site-adapter.js','web/audio.js','web/player.js'];
const rawReport=()=>({artifact:{label:'source',root:'fixture',files:artifactPaths.map(path=>({path,sha256:'a'.repeat(64)}))},qualityFailures:[]});
const rawPair=(left,right)=>[{...rawReport(),...left},{...rawReport(),...right}];
function rawInputs() {
  const repeated={...rawReport(),nodes:{sampleRate:Infinity}};
  const equality=1.0000010000009999e-7;
  return {
    omitted:undefined,nonArray:{},empty:[],single:[rawReport()],emptyPair:[{},{}],nullPair:[null,null],
    undefinedPair:[undefined,undefined],normal:rawPair({},{}),
    missingQuality:rawPair({qualityFailures:undefined},{qualityFailures:null}),
    duplicateHash:rawPair({artifact:{label:'source',files:[...rawReport().artifact.files,{path:'config.js',sha256:'b'.repeat(64)}]}},{}),
    ignoredExtraFile:rawPair({}, {artifact:{label:'source',files:[...rawReport().artifact.files,{path:'ignored',sha256:'b'}]}}),
    mixed:rawPair({qualityFailures:['a','a']},{qualityFailures:['b','b'],artifact:{label:'candidate',files:[]},nodes:1}),
    arrayLength:rawPair({nodes:[1]},{nodes:[1,2]}),keySet:rawPair({nodes:{a:1}},{nodes:{b:1}}),
    sortedKeys:rawPair({nodes:{z:1,a:1}},{nodes:{z:2,a:2}}),
    alignNull:rawPair({alignments:[null,undefined,,{}]},{alignments:[null,undefined,,{}]}),
    alignExtra:rawPair({alignments:[{extra:1}]},{alignments:[{extra:2}]}),
    repeated:[repeated,repeated],cloned:[repeated,structuredClone(repeated)],
    nan:rawPair({nodes:NaN},{nodes:NaN}),negativeInfinity:rawPair({nodes:-Infinity},{nodes:-Infinity}),
    signedZero:rawPair({nodes:-0},{nodes:0}),scalarType:rawPair({nodes:0},{nodes:'0'}),
    sameSymbol:(()=>{const value=Symbol('same');return rawPair({nodes:value},{nodes:value});})(),
    nullUndefined:rawPair({nodes:null},{nodes:undefined}),
    absoluteNoise:rawPair({nodes:0},{nodes:5e-8}),relativeNoise:rawPair({nodes:1},{nodes:1.0000005}),
    equality:rawPair({nodes:0},{nodes:equality}),excess:rawPair({nodes:0},{nodes:equality+1e-15}),
    partialChannel:rawPair({cases:[{channels:[{rms:0.25}]}]},{cases:[{channels:[{rms:0.25}]}]}),
    nullableChannel:rawPair({cases:[{channels:[null,undefined,,{}]}]},{cases:[{channels:[null,undefined,,{}]}]}),
    explicitUndefined:rawPair({cases:[{frequency:undefined}]},{cases:[{}]}),
    ignoredDiagnostics:rawPair({cases:[{channels:[{mean:1,rmsDbfs:1,thdnPercent:1}]}]},{cases:[{channels:[{mean:2,rmsDbfs:2,thdnPercent:2}]}]}),
    steadyThd:rawPair({cases:[{channels:[{thdPercent:1}]}]},{cases:[{channels:[{thdPercent:2}]}]}),
    envelopeExtra:rawPair({cases:[{channels:[{envelope8ms:{extra:1}}]}]},{cases:[{channels:[{envelope8ms:{extra:2}}]}]}),
    transitionIgnored:rawPair({transitions:[{before:{channels:[{rms:1,thdPercent:1}]}}]},{transitions:[{before:{channels:[{rms:2,thdPercent:2}]}}]}),
    stressThd:rawPair({stress:{channels:[{thdPercent:1}]}},{stress:{channels:[{thdPercent:2}]}}),
    filesObject:rawPair({artifact:{files:{}}},{}),fileNull:rawPair({artifact:{files:[null]}},{}),
    casesObject:rawPair({cases:{}},{}),caseNull:rawPair({cases:[null]},{}),
    transitionsObject:rawPair({transitions:{}},{}),transitionNull:rawPair({transitions:[null]},{}),
    stressObject:rawPair({stress:{}},{stress:{}}),stressChannelsObject:rawPair({stress:{channels:{}}},{}),
    rawStressFalsy:rawPair({stress:0},{stress:false}),
  };
}

test('literal raw artifact oracle preserves results exceptions order and plain inputs',async()=>{
  const {compareAudioArtifactReports}=await load();
  const expected=require('./fixtures/audio-artifact-compatibility.json');
  const inputs=rawInputs();
  assert.deepEqual(Object.keys(inputs),Object.keys(expected));
  for(const [name,input] of Object.entries(inputs)) {
    let before;
    if(name!=='sameSymbol')before=structuredClone(input);
    let actual;
    try {actual={value:compareAudioArtifactReports(input)};}
    catch(error){actual={error:{name:error.name,message:error.message}};}
    assert.deepEqual(actual,expected[name],name);
    if(name!=='sameSymbol')assert.deepEqual(input,before,`${name} input mutation`);
  }
});

test('selected projection getters retain baseline and candidate access order',async()=>{
  const {compareAudioArtifactReports}=await load(),trace=[];
  const report=label=>{
    const channel=Object.fromEntries(['rms','peak','overFullScaleSamples','maxAdjacentStep','thdPercent','envelope8ms']
      .map(key=>[key,{get(){trace.push(`${label}.channel.${key}`);return undefined;},enumerable:true}]));
    const item={}; Object.defineProperties(item,Object.fromEntries(['frequency','inputAmplitude','gain','enabled','stereo','bursts','sampleRate','windowSeconds','channelDifferenceRms','channels']
      .map(key=>[key,{get(){trace.push(`${label}.case.${key}`);return key==='channels'?[Object.defineProperties({},channel)]:undefined;},enumerable:true}])));
    const result=rawReport();
    for(const key of ['nodes','cases','transitions','alignments','stress'])Object.defineProperty(result,key,{get(){trace.push(`${label}.${key}`);return key==='cases'?[item]:undefined;},enumerable:true});
    return result;
  };
  assert.deepEqual(compareAudioArtifactReports([report('baseline'),report('candidate')]),[]);
  const suffix=['nodes','cases','case.frequency','case.inputAmplitude','case.gain','case.enabled','case.stereo','case.bursts','case.sampleRate','case.windowSeconds','case.channelDifferenceRms','case.channels','channel.rms','channel.peak','channel.overFullScaleSamples','channel.maxAdjacentStep','channel.thdPercent','channel.envelope8ms','transitions','alignments','stress'];
  assert.deepEqual(trace,[...suffix.map(value=>`baseline.${value}`),...suffix.map(value=>`candidate.${value}`)]);
});

test('legacy artifact exports retain core function frozen list and constant identity',async()=>{
  const legacy=await load(),core=await import('../scripts/audio-artifact-core.mjs');
  for(const key of ['compareAudioArtifactReports','AUDIO_ARTIFACT_FILES','AUDIO_COMPARISON_ABSOLUTE_TOLERANCE','AUDIO_COMPARISON_RELATIVE_TOLERANCE'])assert.equal(legacy[key],core[key],key);
  assert.equal(Object.isFrozen(core.AUDIO_ARTIFACT_FILES),true);
});

test('independent raw oracle catches tolerance and selected THD mutations in actual core',async()=>{
  const crypto=require('node:crypto'),original=await fs.readFile('scripts/audio-artifact-core.mjs','utf8');
  const expected=require('./fixtures/audio-artifact-compatibility.json');
  const comparator=source=>{
    assert.equal(source.split("import crypto from 'node:crypto';").length,2);
    return Function('crypto',source.replace("import crypto from 'node:crypto';",'').replace(/^export /gm,'')+'\nreturn compareAudioArtifactReports;')(crypto);
  };
  const clean=comparator(original);
  for(const [name,input]of Object.entries(rawInputs())){
    let actual;try{actual={value:clean(input)};}catch(error){actual={error:{name:error.name,message:error.message}};}
    assert.deepEqual(actual,expected[name],name);
  }
  const controls=[{from:'ABSOLUTE_TOLERANCE = 1e-7',to:'ABSOLUTE_TOLERANCE = 0',name:'absoluteNoise',want:['source/numeric/nodes']},
    {from:'RELATIVE_TOLERANCE = 1e-6',to:'RELATIVE_TOLERANCE = 0',name:'relativeNoise',want:['source/numeric/nodes']},
    {from:'thdPercent: channel.thdPercent',to:'thdPercent: undefined',name:'steadyThd',want:[]}];
  for(const control of controls){assert.equal(original.split(control.from).length,2);const mutated=comparator(original.replace(control.from,control.to));assert.deepEqual(mutated(rawInputs()[control.name]),control.want);assert.notDeepEqual(control.want,expected[control.name].value);assert.deepEqual(mutated(rawInputs().transitionIgnored),[]);}
  assert.equal(await fs.readFile('scripts/audio-artifact-core.mjs','utf8'),original);
});

test('public entry delegates after label and owned root while CLI and parse body stay unchanged',async()=>{
  const crypto=require('node:crypto'),source=(await fs.readFile('scripts/audio-artifacts.mjs','utf8')).replaceAll('\r\n','\n');
  const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
  assert.equal(hash(source.slice(source.indexOf('export function parseAudioQualityArgs'),source.indexOf('export async function describeAudioArtifact'))),'6a8fb8a811f17bba7a6ffbdd7f841fea21d4e7470231dd0a5f37a45959eb413b');
  assert.equal(hash((await fs.readFile('scripts/check-audio-quality.mjs','utf8')).replaceAll('\r\n','\n')),'6f8338b5c56b2043c33babea9957c3885c76b4be706ec578d300a849b789eee6');
  assert.match(source,/const files = await openOwnedRoot\(root\);\s+return describeAudioArtifactFiles\(files, label\);/);
  const {parseAudioQualityArgs}=await load();
  assert.deepEqual(parseAudioQualityArgs(['--chrome','--chrome','--label','first','--label','last'],process.cwd()),{chrome:true,root:process.cwd(),label:'last'});
});

test('public entry hashes actual disk bytes and retains label precedence missing child and link rejection',async t=>{
  const {describeAudioArtifact}=await load(),root=await artifactFixture(t);
  for(const relative of artifactPaths)await fs.writeFile(path.join(root,relative),'abc');
  assert.deepEqual(await describeAudioArtifact(root,'fixture'),{label:'fixture',root:await fs.realpath(root),files:artifactPaths.map(path=>({path,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}))});
  await assert.rejects(describeAudioArtifact(path.join(root,'absent'),'!'),{name:'Error',message:'audio-label-invalid'});
  await fs.unlink(path.join(root,'web/runtime.js'));
  await assert.rejects(describeAudioArtifact(root,'fixture'),{name:'Error',message:'ENOENT',code:'ENOENT'});
  await fs.writeFile(path.join(root,'web/runtime.js'),'abc');
  const actual=path.join(root,'actual-web');await fs.rename(path.join(root,'web'),actual);
  await fs.symlink(actual,path.join(root,'web'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(describeAudioArtifact(root,'fixture'),{code:'owned-path-link'});
});

async function artifactFixture(t, suffix = '') {
  await fs.mkdir(path.join(process.cwd(), 'output'), { recursive: true });
  const root = await fs.mkdtemp(path.join(process.cwd(), 'output', 'test-audio-artifact-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'web'));
  await fs.writeFile(path.join(root, 'config.js'), `config${suffix}`);
  await fs.writeFile(path.join(root, 'web/runtime.js'), `runtime${suffix}`);
  await fs.writeFile(path.join(root, 'web/site-adapter.js'), `adapter${suffix}`);
  await fs.writeFile(path.join(root, 'web/audio.js'), `audio${suffix}`);
  await fs.writeFile(path.join(root, 'web/player.js'), `player${suffix}`);
  return root;
}

test('audio quality arguments select an artifact root and a safe fixed report label', async () => {
  const { parseAudioQualityArgs } = await load();
  const parsed = parseAudioQualityArgs(['--chrome', '--root', 'dist', '--label', 'root-dist'], 'C:/repo');
  assert.equal(parsed.chrome, true);
  assert.equal(parsed.root, path.resolve('C:/repo', 'dist'));
  assert.equal(parsed.label, 'root-dist');
  assert.throws(() => parseAudioQualityArgs(['--label', '../escape'], 'C:/repo'), /audio-label-invalid/);
  assert.throws(() => parseAudioQualityArgs(['--root'], 'C:/repo'), /audio-root-missing/);
  assert.throws(() => parseAudioQualityArgs(['--unknown'], 'C:/repo'), /audio-argument-invalid/);
});

test('audio quality CLI rejects unknown arguments before starting browser work', () => {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts/check-audio-quality.mjs'), '--unknown'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 15000
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /audio-argument-invalid/);
});

test('audio CLI selects the strict normal alias without a wrapper', async () => {
  const source = await fs.readFile('scripts/check-audio-quality.mjs', 'utf8');
  assert.match(source, /import \{audioQualityReportFailures as audioQualityFailures\} from '\.\/audio-metrics\.mjs';/);
  assert.match(source, /audioQualityFailures\(report\)/);
});

test('artifact description hashes every production audio entry file', async t => {
  const { AUDIO_ARTIFACT_FILES, describeAudioArtifact } = await load();
  const root = await artifactFixture(t);
  const description = await describeAudioArtifact(root, 'fixture');
  assert.equal(description.label, 'fixture');
  assert.equal(description.files.length, 5);
  assert.deepEqual(description.files.map(item => item.path), AUDIO_ARTIFACT_FILES);
  assert.ok(description.files.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
});

test('artifact comparison rejects file drift and any numeric quality failure', async t => {
  const { compareAudioArtifactReports, describeAudioArtifact } = await load();
  const source = await describeAudioArtifact(await artifactFixture(t), 'source');
  const same = await describeAudioArtifact(await artifactFixture(t), 'candidate');
  const changed = await describeAudioArtifact(await artifactFixture(t, '-changed'), 'root-dist');
  assert.deepEqual(compareAudioArtifactReports([
    { artifact: source, qualityFailures: [] },
    { artifact: same, qualityFailures: [] }
  ]), []);
  const failures = compareAudioArtifactReports([
    { artifact: source, qualityFailures: [] },
    { artifact: changed, qualityFailures: ['stress-channel-0/peak=1.1'] }
  ]);
  assert.ok(failures.includes('root-dist/quality/stress-channel-0/peak=1.1'));
  assert.ok(failures.some(value => value.startsWith('root-dist/hash/')));
});

test('artifact comparison permits floating noise but rejects meaningful numeric drift', async t => {
  const { compareAudioArtifactReports, describeAudioArtifact } = await load();
  const source = await describeAudioArtifact(await artifactFixture(t), 'source');
  const candidate = await describeAudioArtifact(await artifactFixture(t), 'candidate');
  const report = (artifact, peak) => ({
    artifact, qualityFailures: [], nodes: { sources: 1, sampleRate: 48000 },
    cases: [{ frequency: 1000, enabled: true, channels: [{ peak, rms: 0.25 }] }],
    transitions: [], alignments: [], stress: { channels: [{ peak: 0.98 }] }
  });
  assert.deepEqual(compareAudioArtifactReports([
    report(source, 0.5), report(candidate, 0.5000000001)
  ]), []);
  assert.ok(compareAudioArtifactReports([
    report(source, 0.5), report(candidate, 0.51)
  ]).includes('candidate/numeric/cases[0].channels[0].peak'));
});

test('artifact comparison excludes timing-sensitive diagnostics while retaining raw reports', async t => {
  const { compareAudioArtifactReports, describeAudioArtifact } = await load();
  const source = await describeAudioArtifact(await artifactFixture(t), 'source');
  const candidate = await describeAudioArtifact(await artifactFixture(t), 'candidate');
  const report = (artifact, mean, thdnPercent) => ({
    artifact, qualityFailures: [], nodes: { sources: 1, sampleRate: 48000 },
    cases: [{ frequency: 1000, inputAmplitude: 0.5, gain: 1, enabled: true, stereo: 'identical', bursts: false,
      channels: [{ mean, rms: 0.25, rmsDbfs: -12, peak: 0.5, thdPercent: 0.01, thdnPercent, overFullScaleSamples: 0, maxAdjacentStep: 0.1 }] }],
    transitions: [], alignments: [], stress: { channels: [{ rms: 0.4, peak: 0.98, overFullScaleSamples: 0 }] }
  });
  assert.deepEqual(compareAudioArtifactReports([
    report(source, 0.001, 0.02), report(candidate, -0.004, 0.08)
  ]), []);
});
