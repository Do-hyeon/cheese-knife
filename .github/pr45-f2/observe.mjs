// 호스팅 진단 워크플로에서 지정 PR merge의 제품 루트를 대상으로 observer를 한 번 실행한다.
// 실제 실행 결론과 보고서는 제품 output 아래에 저장되며 오류는 그대로 종료 상태에 반영한다.
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PRODUCT_ROOT:product,FROZEN_ROOT:frozen,GITHUB_RUN_ID:run,GITHUB_RUN_ATTEMPT:attempt,PROBE_STAGE:stage}=process.env;
if(![product,frozen,stage].every(value=>typeof value==='string'&&path.isAbsolute(value))||process.cwd()!==product||
  !/^\d+$/.test(run??'')||!/^\d+$/.test(attempt??'')||attempt!=='1'||
  process.env.GITHUB_EVENT_NAME!=='push'||process.env.GITHUB_REF!=='refs/heads/codex/pr45-f2-hosted-probe')
  throw Error('observer-hosted-probe-input');
const prefix='at02-hosted-f2-'+run+'-'+attempt;
const {runObserverIsolation}=await import(pathToFileURL(path.join(product,'scripts/audio-observer-isolation.mjs')).href);
await writeFile(path.join(stage,'observer-started'),prefix,{flag:'wx'});
const result=await runObserverIsolation({frozenRoot:frozen,prefix});
console.log(JSON.stringify({transportComplete:result.transportComplete,qualityPass:result.qualityPass,failures:result.failures}));
if(!result.transportComplete||!result.qualityPass)process.exitCode=1;
