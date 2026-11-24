// 호스팅 진단에서 observer의 F 자식 명령에만 메모리 계측 로더를 추가한다.
// 워크플로가 제품 루트에서 이 파일을 node --import 로 불러온다.
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.env.PRODUCT_ROOT,probe=process.env.PROBE_ROOT;
if(![root,probe].every(value=>typeof value==='string'&&path.isAbsolute(value))||process.cwd()!==root)throw Error('observer-parent-loader-roots');
const target=pathToFileURL(path.join(root,'scripts/audio-observer-isolation.mjs')).href;
const child=pathToFileURL(path.join(probe,'frozen-loader.mjs')).href;
const anchor="const args=run.mode==='f'?['--import',preloadUrl,runner,";
const replacement="const args=run.mode==='f'?['--import',"+JSON.stringify(child)+",'--import',preloadUrl,runner,";
let applied=false;
registerHooks({load(url,context,nextLoad){
  const loaded=nextLoad(url,context);
  if(url!==target)return loaded;
  if(applied||loaded.format!=='module')throw Error('observer-parent-loader-target');
  const bytes=Buffer.from(loaded.source);
  if(createHash('sha256').update(bytes).digest('hex')!=='db2b053c45eac9b81d035401e0106e49382a9f612bace22e78f377b7b3db3d69')throw Error('observer-parent-loader-pin');
  const source=bytes.toString('utf8');
  if(source.split(anchor).length!==2)throw Error('observer-parent-loader-anchor');
  applied=true;
  return {...loaded,source:source.replace(anchor,replacement)};
}});
