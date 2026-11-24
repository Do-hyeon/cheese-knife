// 고정 F 러너의 첫 제품 페이지에 실제 Worklet 바이트를 공급한다. 브라우저와 페이지 종료는 원 러너가 맡는다.
// observer가 고정 checkout에서 node --import <이 모듈의 file URL> scripts/check-audio-quality.mjs --root <제품> --label <셀>로 호출한다.
// 부모가 고정한 Worklet SHA와 제품 파일을 요구한다. URL/로더 준비 후 stderr 한 줄을 남기며 실패하면 예외를 던진다.
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {readRoleInputs} from './audio-worklet-roles.mjs';
import {registerQualityWorklet} from './audio-quality-diagnostics.mjs';

const marker='observer-frozen-worklet-prepared:';
/** 부모는 크기를 제한해 저장한 F stderr에서 준비 표시 하나와 실제 제품 SHA를 대조한다.
 * @param {string} stderr @param {string} sha */
export function frozenWorkletPrepared(stderr,sha){
  const markers=stderr.split(/\r?\n/).filter(line=>line.includes(marker));
  return /^[a-f0-9]{64}$/.test(sha)&&markers.length===1&&markers[0]===marker+sha;
}

/** 선택한 최초 호출에서 원래 메서드를 복구한다. 다른 호출은 인수·결과를 그대로 전달한다.
 * @param {object} target @param {string} key @param {(args:unknown[])=>boolean} match
 * @param {(value:object)=>void|Promise<void>} after */
function onFirstCall(target,key,match,after){
  const original=Reflect.get(target,key),descriptor=Object.getOwnPropertyDescriptor(target,key);
  if(typeof original!=='function')throw Error('observer-frozen-playwright-api');
  Object.defineProperty(target,key,{configurable:true,writable:true,value:/** @this {object} @param {unknown[]} args */ async function(...args){
    if(this!==target||!match(args))return Reflect.apply(original,this,args);
    if(descriptor)Object.defineProperty(target,key,descriptor);
    else Reflect.deleteProperty(target,key);
    const value=await Reflect.apply(original,this,args);
    await after(value);
    return value;
  }});
}

/** 첫 Chromium 페이지의 player.js 평가가 성공한 직후 바이트 로더를 설치한다.
 * @param {object} chromium @param {'launch'|'connectOverCDP'} method @param {string} player
 * @param {Uint8Array} worklet @param {()=>void} prepared */
export function prepareFrozenWorklet(chromium,method,player,worklet,prepared){
  onFirstCall(chromium,method,()=>true,browser=>{
    onFirstCall(browser,'newPage',args=>args.length===0,page=>{
      onFirstCall(page,'evaluate',args=>args.length===1&&args[0]===player,async()=>{
        await Reflect.apply(Reflect.get(page,'evaluate'),page,[registerQualityWorklet,Array.from(worklet)]);
        prepared();
      });
    });
  });
}

// 호스트가 표시 판독기를 import할 때에는 Playwright나 합성 페이지를 열지 않는다.
if(process.execArgv.includes(import.meta.url)&&process.execArgv[process.execArgv.indexOf(import.meta.url)-1]==='--import'){
  const [runner,rootFlag,root,labelFlag,label]=process.argv.slice(1);
  if(process.argv.length!==6||runner!==path.resolve('scripts/check-audio-quality.mjs')||
    rootFlag!=='--root'||!root||!path.isAbsolute(root)||labelFlag!=='--label'||!label||!/^[-a-z0-9]+-f[123]$/.test(label))
    throw Error('observer-frozen-arguments');
  const provider='./owned-files.mjs',{openOwnedRoot}=await import(provider);
  const files=await openOwnedRoot(root);
  if(files.root!==root)throw Error('observer-frozen-product-root');
  const {scripts,manifest,worklet,workletSha256}=await readRoleInputs(files);
  const players=manifest.flatMap((file,i)=>file.path==='web/player.js'?[scripts[i]]:[]);
  const player=players[0];
  if(players.length!==1||!player||scripts.filter(value=>value===player).length!==1||
    createHash('sha256').update(player).digest('hex')!==process.env.F01_OBSERVER_PLAYER_SHA256||
    workletSha256!==process.env.F01_OBSERVER_WORKLET_SHA256)throw Error('observer-frozen-product-input');
  const {chromium}=createRequire(runner)('playwright');
  prepareFrozenWorklet(chromium,process.platform==='win32'?'connectOverCDP':'launch',player,worklet,
    ()=>process.stderr.write(marker+workletSha256+'\n'));
}
