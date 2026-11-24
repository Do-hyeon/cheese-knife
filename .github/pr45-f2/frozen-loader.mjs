// 고정 F 러너의 디스크 파일을 읽고 해시가 일치할 때만 메모리에서 복원 관측을 추가한다.
// F 자식의 node --import 호출만 지원하며 추가 파일이나 계정을 읽지 않는다.
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {FROZEN_ROOT:frozen,PRODUCT_ROOT:product,PROBE_STAGE:stage}=process.env;
if(![frozen,product,stage].every(value=>typeof value==='string'&&path.isAbsolute(value))||process.cwd()!==frozen)
  throw Error('observer-frozen-loader-roots');
const runner=path.join(frozen,'scripts/check-audio-quality.mjs'),target=pathToFileURL(runner).href;
if(process.argv.length!==6||process.argv[1]!==runner||
  process.argv[2]!=='--root'||process.argv[3]!==path.join(product,'extension')||
  process.argv[4]!=='--label'||!/^at02-hosted-f2-[0-9]+-[0-9]+-f[123]$/.test(process.argv[5]))
  throw Error('observer-frozen-loader-arguments');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let applied=false;
registerHooks({load(url,context,nextLoad){
  const loaded=nextLoad(url,context);
  if(url!==target)return loaded;
  if(applied||loaded.format!=='module'||sha(Buffer.from(loaded.source))!=='4f5826c2b10d6eeebcbd09637915a514a66ef4c66abaa6597f3df66bbe617c4a')
    throw Error('observer-frozen-loader-original');
  const instrumented=readFileSync(path.join(stage,'instrumented-runner.mjs'));
  if(sha(instrumented)!=='8d3db9e78acaad5a458bc5c18731da94c6168ff1e177d1031e5e0a438b9f265d')throw Error('observer-frozen-loader-overlay');
  applied=true;
  return {...loaded,source:instrumented};
}});
