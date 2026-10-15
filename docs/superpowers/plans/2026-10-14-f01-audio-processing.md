# F01 오디오 보정·Gain 저장·EQ·노멀라이저 상세 구현 계획

> **For agentic workers:** 2026-10-15 사용자가 계획·Native 격리 실행 묶음을 승인했다. superpowers:executing-plans로 아래 체크리스트를 순서대로 수행한다. Task별 PR을 만들지 않으며 push/PR은 별도 승인 전 금지다.

**목표:** F00 저장 기반에 기존 Gain의 영구 저장, 전체 오디오 스위치, 고정8대역 EQ, 선택형 느린 RMS 노멀라이저와 승인된 조작 UI를 연결한다.

**구조:** 기존 단일 설정 broker queue와 video별 MediaElementSource/AudioContext를 재사용한다. durable Gain은 top-frame ISOLATED의 소유 조작부와 별도 제한된 namespace만 허용하며 MAIN은 DSP/미리 적용만 담당한다. schema2·protocol3를 명시하고 구 버전 raw 보존과 실제 손실 대조를 함께 검증한다.

**기술:** 기존 strict TypeScript/생성 classic JS, Chrome MV3·최소121, Web Audio native Gain/Biquad/Analyser/Compressor/WaveShaper, 기존 node:test/jsdom/Playwright·번들 Chromium. 새 의존성·프레임워크·Worklet 없음.

**명세:** [전체 승인 설계](../specs/2026-10-14-f01-audio-processing-design.md), [Gain 자동 저장 보완](../specs/2026-10-14-f01-player-gain-design.md), [승인 목업](../mockups/2026-10-14-f01-audio-settings.html). 최초 구현 기준 main `ae9f8e50a22dae9d549f1e476d302549ecc03b4a`, 계획 입력 로컬 HEAD `7e51847`. 명세의 수치·중지 조건이 우선한다.

## 1. 고정 경계·승인 묶음

- 오디오·영상만 채널별, 기타 전역. 계정·쿠키 식별/녹음/원음·RMS 내역 저장/외부 전송 없음. 원음 buffer는 current player 메모리에서만 처리한다.
- 현재 제품2.13.3·세 자리 버전·Chrome만 지원. 이번 계획/구현은 버전·릴리즈·스토어/dashboard/정책 URL을 바꾸지 않는다. 차기 릴리즈 최소 F00/F01/F02 및 통합 게이트.
- 기존 scripting/storage·CHZZK host·CSP·exclude·WAR 경계 유지. 원격 코드/수식/임의 실행 함수/selector·저장 key 입력 없음. MAIN·isTrusted·closed ShadowRoot 하나를 인증/무결성 보장으로 표현하지 않는다.
- source1·mute/video.volume0/Gain0·보호 source/gesture 제한·전역 unknown/영상/프리셋·ABA·ACK 유실 의미를 보존한다. 초기 audioDefault와 현재 수동 master wanted는 별개다.
- schema1 읽기는 검증 뒤 메모리 projection만; 사용자 upgrade 외 쓰기0. absent는 논리 schema2이며 첫 명시 저장 전 mediaProfiles key 생성0. 미래/손상/overflow/quota 실패에 정상화·삭제·retry 없음.
- 기존 오디오14 steady/12 alignment/18 transition·stress와 peak0.9801/full-scale0/dip 기준을 삭제·완화하지 않는다. historical fixture/hash를 새 성공으로 덮지 않고 F01 계약을 별도 pin한다.
- 제품 검사는 별도 물리 후보에서만 실행한다. root dist58·ZIP/CRX·P09·기존 사용자 Chrome/설정·private 감사 이력과 다른 브랜치는 보존한다. 문서-only 작업에서 제품 검사를 실행한 것으로 기록하지 않는다.
- 실행 승인 요청을 한 번에 묶는다: 아래 순차 구현/생성, 자기 물리 후보의 번들 Chromium/새 프로필·닫기/retirement 증명, 고정 fixture·해당 CDP 세션의 입력, 기존 승인 범위 npm/Gitleaks/ESLint, whole-F01 Astra max 최종 검토. 사용자 Chrome/P09·새 권한/의존성/외부 전송 확대·publish는 포함하지 않는다. 수용 기준/알고리즘 변경 필요 시 별도 설계 승인.

## 2. 변경 지도·단계 간 인터페이스

| 소유 경계 | 수정/신규 파일 | 책임·후속 소비자 |
| --- | --- | --- |
| 값·호환 | `src/shared/media-contracts.ts`, `src/settings/media-profiles.ts`, `config.ts`, `contract.ts` | v1 raw reader 보존, v2 reader/projection/upgrade, global canonical alias·Gain 출처·필드 검증; broker/bridge/UI |
| 동일 저장 queue | `src/settings/broker.ts`, `background.ts`; 신규 `src/settings/gain-authority.ts` | own TAB protocol3, Gain actor/ticket·native probe·epoch/receipt; storage 알림/tabs URL/종료 등록·해제 |
| ISOLATED 조작 | 신규 `src/settings/player-gain.ts`; `bridge.ts`, `manifest.json` | top-frame 소유 Gain UI/의도/preview·document/PZP retirement; MAIN durable writer 금지 |
| MAIN 소비 | `src/main/runtime/{entry,contracts,bridge,lifecycle}.ts`, `src/main/features/player/{contracts,controls,filters}.ts`, `src/main/site-adapter/entry.ts`, `src/main/features/preview/entry.ts`, `src/main/features/inject/coordinator.ts`, `src/main/features/audio/{contracts,controller}.ts`; 신규 `audio/{eq,normalizer}.ts` | protocol3와 scoped Gain, master/효과 상태, source 재사용·DSP·순수 제어 계산 |
| 설정 TAB UI | `src/settings/{client,popup}.ts`; 신규 `src/settings/audio-settings-ui.ts`; `popup.html`, `popup.css`, `_locales/{ko,en}/messages.json`, `web/main.css` | 승인 UI/고정 scope·확정 snapshot·legacy import/upgrade; 저장 UI와 현재 재생 상태 분리 |
| 생성·증명 | `scripts/{settings-runtime,check-runtime-inventory,build,check-package}.mjs`, `.gitattributes`, `build-proof/{shared,background,isolated,extension-page,main}.ts`, tsconfig 관련 include/ABI | 새 classic asset3개 exact dependency graph/금지 API·snapshot·타입·패키지 소비자 |
| 회귀·실제 검사 | 기존 media/settings/audio/scoped/installed tests와 helpers; 신규 아래 Tasks의 테스트·runner/fixture | 새 계약의 RED/GREEN·손실 대조·닫기 증명; 기존 baseline 동결 |
| 고지·이력 | README/README-en/PRIVACY·PLANS 및 F01 validation/archive | 실제 처리·지원 제한·로컬 완료/실제 게시를 구분 |

runtime은 기존 settings transform(런타임 import/export 금지)와 MAIN bundle을 유지한다. 신규 settings entries는 `gain-authority.js`(global `createPlayerGainAuthority`), `web/player-gain.js`(자기 IIFE), `audio-settings-ui.js`(global `createAudioSettingsUI`) 세 개로 한정한다. worker는 authority→broker 순서, popup은 UI helper→popup, top-frame 전용 별도 ISOLATED content entry는 media-profiles/config→player-gain 순서다. 기존 all_frames bridge는 확대하지 않는다. 단계별 자기 입력을 독립 pin한다: T2는 authority 추가로 dist60/runtime18, T3 qualification은 player-gain 추가로 dist61/runtime19, T6 이후 최종은 UI helper까지 dist62/runtime20이다. 실제 entry resource 증가도 manifest/loader의 고유 목록으로 증명하며 후행 UI helper의 빈 파일을 미리 만들지 않는다. 동작 없는 새 파일/출력이나 임의 WAR는 만들지 않는다.

**공유 ABI(신규 이름, 구현에서 동일하게 사용):**

- `AudioValues` schema2: audioDefault/compressorEnabled/기존5수치/audioGain/gainInherited/eqEnabled/고정8eq값/normalizerEnabled/normalizerTargetDbfs. v1 타입은 `LegacyAudioValues`로 보존한다. `GainOrigin = 'site-legacy' | 'global-owned' | 'channel-owned'`.
- `KnifeMediaProfiles.readStore(raw:unknown): KnifeMediaRead`는 schema1/2/absent/손상/미지원 분리; `projectAudioV2(legacy:LegacyAudioValues): AudioValues`, `upgradeMediaStore(store:LegacyMediaStore, expectedRevision:number): KnifeMediaMergeResult`, `resolveMediaSettings(...)`의 snapshot에 gainOrigin·legacy 확인 상태를 추가한다. reader 검증을 projection으로 대체하지 않는다.
- own 설정 mutation protocol3는 exact storeSchema 및 기존 selection/token 규칙을 따른다. 추가 `upgrade-media-store`, `read-legacy-gain`, `import-legacy-gain`, `get-audio-state`, `set-audio-wanted` action은 각각 전환·고정 읽기·명시 가져오기·현재 상태·일시 ON/OFF로 역할을 나눈다. MAIN status는 advisory이고 durable 권위가 아니다.
- `createPlayerGainAuthority(chromeApi, queueHooks): GainAuthority`의 hooks는 기존 enqueue/read/write 경계만. `GainAuthority`는 `listener`, `beforeCommit(raw,changes)`, `afterCommit(receipt)`, `observeStorageChanges(changes)`, `retireTab(tabId)`, `observeUrl(tabId,url)`을 제공한다. authority가 별도 storage queue를 만들지 않는다.
- private probe는 고정 ISOLATED `Symbol.for('cheese-knife.player-gain.private.v3')` own data property의 closure getter를 읽고 bounded scalar 복사본만 반환한다. registry는 scope/nonce/token을 MAIN에 공개하지 않으며 callable writer/임의 인수를 받지 않는다. `get-gain-view`와 `set-gain` exact request는 Gain 명세 그대로다.
- `PlayerController.setAudioWanted(enabled:boolean, context:ScopedContext): Promise<AudioWantedReadback>`와 `getAudioWanted(context:ScopedContext): AudioWantedReadback`을 **기존 controls.ts의 audioIntents WeakMap 소유자**에 추가한다. readback은 현재 context/video 일치 여부, `wanted:boolean`, `applied:AudioState`, `reason:string`을 구분한다. button과 own TAB `set-audio-wanted` 둘 다 이 action에서 manual=true/automatic=false/needsResume 및 generation을 갱신한 뒤 controller를 호출한다. stale context는 controller 호출0·저장0으로 거부한다. 별도 intent map/상태 머신이나 TAB→audio.setEnabled 직접 호출은 금지한다.
- `AudioController.setGain(video,value)`는 저장 부작용 없는 preview로 바꾸고 `configure()`가 확정 scoped 값/출처를 소비한다. `AudioState`와 effect status/readback은 별도 typed snapshot. 새 `applyPreviewGain(video,value,context)`는 현재 protocol3 document/route/player/binding 일치에서만 허용하고 저장 성공을 주장하지 않는다.
- `stepNormalizer(state:NormalizerState, sample:NormalizerSample): NormalizerStep`는 buffer 없음·순수 계산으로 epoch/warm-up/EMA/현재 dB ramp를 반환한다. sample은 context time/좌우 power·재생 가능성·오류 판정이며 실제 AudioParam 적용은 controller 소유다. 테스트와 runtime이 동일 함수를 사용한다.

## 3. 공격적 검토 초점(각 항목은 아래 실패 대조에 고정)

1. 같은 URL의 새 document·route A→B→A·channel 삭제/재생성·cold revision 변경: 옛 의도는 저장0/retarget0(T2/T3/T7).
2. ACK loss 뒤 값이 일치·late storage notification·receipt64 포화: 성공 가장/auto retry0, 자기 ticket 중복 무효화0, busy 보존(T2/T3/T7).
3. 실제 조작이 아닌 MAIN/DOM 이벤트·old/iframe sender·호스트 위장: 범용 권위로 승격0; native private probe 실패면 제한(T3).
4. 무음·역상/한쪽 입력·timer stall/hidden·source 재사용: 원래 mute/Gain0 보존, 새 window·old callback 폐기·source1(T4/T5/T8).
5. UI scope 변경 중 confirm·프리셋 생성/apply·재표시 반올림: 확정 snapshot/원값 보존, 잘못된 대상 저장0(T6/T7).

## Task 1 — schema2·전역 alias·읽기 무쓰기 계약

**파일:** 변경 지도 값·호환 파일, `tests/{media-profiles,settings-contract,settings-compatibility,media-load-graph}.test.cjs`, 신규 `tests/f01-media-schema.test.cjs`, `build-proof/shared.ts`.

**입출력:** v1 raw/기존 전역 config → 검증된 ephemeral v2 snapshot 또는 repair. T2/T4/T6은 위 AudioValues·GainOrigin·read/upgrade ABI만 사용한다.

- [x] RED: `v1 projection has inherited Gain and disabled new effects`에서 compressorDefault→audioDefault·enabled true·Gain 상속·EQ0/OFF·normalizer−20/OFF와 raw byte 보존을 assert한다. absent/read 반복 set0, 미래/손상/getter/extra key/NaN/Infinity/범위 밖 거부, 0/비정수 원값 유지를 고정한다.
- [x] RED 실행: `node --test tests/f01-media-schema.test.cjs tests/media-profiles.test.cjs tests/settings-compatibility.test.cjs`. 격리 후보에서 새 계약 부재 실패와 별칭/기존 순차 patch 회귀 실패를 확인했다.
- [x] 구현: schema1 reader/형태를 그대로 보존하고 schema2 reader/projection/upgrade를 추가한다. upgrade는 IDs/이름/createdRevision/video 유지, record/preset/store revision 각각+1·MAX_SAFE/256KiB/정수 overflow 사전 실패. 새 global audioDefault는 기존 compressorDefault로만 정규화; raw unknown audioDefault 보존/우선0·두 요청 명칭 충돌 거부.
- [x] GREEN: 집중99/99·전체1411통과/실패0/기존private증거1skip·9개 기반/build/package 통과. gainInherited=true preset은 적용 대상 Gain 쌍 보존, 새 owned preset은 확정 유효값/false를 복사한다. boot/read는 migration을 쓰지 않는다.
- [x] 로컬 커밋: 해당 원본·테스트·필요 생성 출력만 명시 staging. T1 79bf6e2, push/PR 없음.

## Task 2 — protocol3·명시 upgrade/import·한 queue의 Gain epoch

**파일:** `src/settings/{contract,broker,background,gain-authority}.ts`, 기존 broker/client tests, 신규 `tests/f01-gain-authority.test.cjs`, `tests/f01-media-upgrade.test.cjs`, 관련 build-proof/생성 load graph.

**입출력:** T1 값/reader → own TAB protocol3 reply 또는 Gain 전용 view/ticket. T3은 이 namespace만, T6은 own TAB action만 소비한다.

- [x] RED: `upgrade is explicit and unknown is not success`에서 schema1 일반 write0/upgrade set1/기대 revision 불일치0/ACK loss unknown/재조회 일치도 미확정을 고정했다. absent upgrade0·첫 global Gain은 config/settingsRevision만 변경·첫 channel/preset은 schema2를 생성한다. TAB의 폐기·다음 조작 UI는 T6/T7에서 통합 검증한다.
- [x] RED: `fixed legacy read rejects same-url replacement`는 원래 tab/window/frame0/document 전후 검사·2초/합계4초·raw64자·다른 탭 재탐색0·가져오기 직전 fresh value/document/global revision mismatch0·unknown raw 보존을 고정했다. 실제 고정 함수도 직렬화해 읽기만 확인했다. 취소 UI는 T6/T7에서 확인한다.
- [x] RED: actor64/TTL60s/scope64/receipt64 busy, before-write epoch invalidation, owned A→B→A·동일 값 상속/토큰 변경, external/nonmonotonic 변경 무효화, 성공 뒤 자기 ACK epoch와 늦은 중복 notify 유지, 실패 뒤 옛 ticket 복구0. 공통 write hook과 v1 patch/preset/import/upgrade/reset/delete 경로 및 늦은 raw 경쟁을 연결했다.
- [x] 구현: own sender/TAB gate·player native tabs.get/frame0 고정 probe·같은 enqueue·URL/종료/storage/권한 변경 신호를 연결했다. 서로 다른 필드 최신 raw merge·같은 Gain 쌍 conflict·상속 의존 epoch/owned 독립·receipt와 진행 중 actor 잠금을 유지한다.
- [x] GREEN: 집중61/61·전체1433통과/실패0/기존private증거1skip·9개 기반/build/package 통과. 부적절한 sender/action/extra key·exception/합계4초 초과의 쓰기0를 대조했다. 가상 native 경계/clock과 실제 설치 증거는 구분한다.
- [x] 필요한 classic authority 출력·worker import·생성/strict fixture graph·독립60/18 pin을 갱신해 로컬 보존한다. push/PR 없음.

## Task 3 — 제한된 플레이어 Gain actor·Native 선행 자격 확인

**파일:** 신규 `src/settings/player-gain.ts`, `bridge.ts`, `manifest.json`; T4에서 앞당기는 최소 protocol3 연결로 `src/main/runtime/{entry,contracts,bridge,lifecycle}.ts`, `src/main/features/player/{contracts,controls,filters}.ts`, `src/main/features/audio/{contracts,controller}.ts`, `src/main/site-adapter/entry.ts`, `src/main/features/preview/entry.ts`, `src/main/features/inject/coordinator.ts`; 신규 fixture `tests/fixtures/installed-extension/{audio-live.html,audio-site.js}`, `scripts/extension-e2e/fixture-router.mjs`; 신규 `tests/{f01-player-gain,f01-player-gain-lifecycle,installed-player-gain}.test.cjs`, 신규 `scripts/check-installed-player-gain.mjs`(기존 harness/owned candidate/close proof 재사용).

**입출력:** T2 ticket/epoch/view → ISOLATED private actor·preview + 자동 Gain 두 필드 저장. MAIN은 좁은 protocol3 preview를 받아 현재 video에만 적용하고 저장하지 않는다.

- [x] **Gate 전 prerequisite RED/GREEN:** T1/T2 뒤 ownerProtocol3·request/config3 decoder·유효 scoped Gain/출처·protocol3 preview/일시 master action을 최소 연결했다. audio/site-adapter/player/filters/preview/inject의 모든 owner guard와 strict/generated/helper consumer를 함께 전환했다. owner3/쓰기0/수동 action3개와 소비자155개 통과. 기존 compressor/dry/limiter만 사용하는 이 단계는 EQ·normalizer 구현/효과 성공을 주장하지 않는다. old owner2·혼재page는 명시 reload-required이고 prototype/registry를 교체해 성공시키지 않는다.
- [x] **Gate 전 실제 fixture:** audio-live.html에는 단일 live layout/PZP/`.pzp-pc__video video`와 실제 `.pzp-pc__volume-control`/버튼 위치를 둔다. audio-site.js는 합성 PCM WAV를 same-origin Blob URL로 제공해 실제 video가 decode/play하고 currentSrc가 eligible blob이 되게 한다. 실제 trusted master ON 뒤 생산 소유 Gain 조작부가 나타나야 한다. 기존 live.html/site.js baseline은 바꾸지 않고 fixture-router에 고정 owned fixture만 추가한다. source getter/eligibility/API를 위조하거나 private intent/생산 조작부를 테스트에서 대신 만들지 않는다. fixture의 원래 mute/volume을 보존하고 native source1·현재 gain AudioParam/preview readback을 검사하되 물리 소리/출력 증거는 T8과 구분한다.
- [x] RED: 옛 `setGain`의 localStorage 쓰기 검사와 MAIN slider input writer 검사는 F01에서 쓰기0이 되도록 새 테스트를 먼저 만든다. pointer/keyboard/dblclick100%는 private node·참조·trusted intent·현재 host/route/video 확인에서만 staged intent를 만든다. synthetic input/change/dblclick/postMessage·extra field·옛 document/iframe/incognito는 set0.
- [x] 구현: ISOLATED 자체가 live/vod의 단일 `.pzp-pc`·video/volume 위치를 고정 규칙으로 발견하고 `.knife-preview/.knife-popup`/복수 후보는 제한한다. MAIN mount 힌트나 DOM ID는 저장 scope 권위가 아니다. private closure/원래 closed root 참조가 연결됐는지 확인한다. 일반 페이지 host 제거/교체·판별 불가는 retirement; 동일 owner의 동일 host/video/document/binding PZP reparent만 입력 잠금→검사→재개로 보존한다. private probe 결과는 serial scalar·boolean/고정 형식 ID뿐이며 DOM 참조·이름/catalogue/비밀은 반환하지 않는다.
- [x] 구현: clean 새 gesture는 focus/pointerdown/keydown에서 read 준비+전송 전 재검증, 준비 중 최신 후보1개/즉시 preview. worker restart/TTL/cold에서는 표시 전 revision/쌍/출처/token exact, warm unrelated만 허용. trailing250ms·종료 앞당김·commit≤4Hz·inflight1+draft1·전송 intent 불변·전체5초(준비 포함). 준비 실패의 쓰기0와 set 전송 뒤 unknown을 구별한다. 외부 commit/dirty/fail/unknown은 새 ticket으로 replay0·명시 폐기/재조회만 허용한다. ACK는 원래 doc/intent와 일치할 때만 확정·자기 다음 draft 기준을 갱신한다.
- [x] GREEN: `node --test tests/f01-player-gain.test.cjs tests/f01-player-gain-lifecycle.test.cjs tests/f01-gain-authority.test.cjs`; dblclick 원값1/상속false·다른 효과/master 미변경·Gain0·60초 이후 첫 조작·old ACK/route ABA/host 교체/PZP reparent 검사를 포함한다. 기존 audio/player helper는 전역 site writer 호환과 새 actor 검사를 분리한다.
- [x] **Native 전 로컬 checkpoint:** 최소 연결/조작부/고정 fixture/runner·RED/GREEN 테스트·필요 생성물·독립61/19 pin을 명시 staging/로컬 커밋한다. 신규 파일도 HEAD에 포함하고 tracked dirty0인 SHA에서 자기 후보를 만든다. checkpoint는 검증 입력 고정일 뿐 완료/PASS/push/PR이 아니다. 실패하면 SHA와 private 실패 증거를 보존하고 중지한다. 보완은 새 checkpoint/새 source attestation으로 재실행하며 dirty 검사를 완화하지 않는다.
- [x] **Native 선행 gate:** 승인 후 clean 물리 후보에서 `node scripts/check-installed-player-gain.mjs --run-id=F01qualification --mode=qualification` 실행. 실제 번들 Chromium의 자기 profile에서 trusted pointer/keyboard/dblclick→실제 sender.documentId/frame0→고정 probe→broker queue→ACK/재진입을 검사한다. Playwright는 host 좌표/실제 입력을 사용하고, 닫힌 root를 제어하기 위한 지원 CDP는 동일 세션/명확한 대상에만 한정한다. 테스트용 직접 storage 쓰기·합성 trusted·private intent 강제 주입을 positive로 사용하지 않는다.
- [x] negative mode에서는 MAIN/synthetic/iframe/옛 document 시도·probe 누락/불일치의 정확한 단계/코드와 storage diff0를 검사한다. expected 거부만 PASS이며 timeout/조작 대상 없음/입력 미발생은 실패다. 프로필 종료·close/process retirement·cleanup 오류0을 기록한다.
- [x] qualification 실패면 이 지점에서 중지한다. iframe/WAR/권한·추가 자산·임시-only로 자동 우회하지 않고 근거와 대안 설계 승인을 요청한다. 통과 후에만 T4–T8로 진행한다. qualification 후 결과/필요 보완은 별도 로컬 커밋으로 기록하되 이미 생성한 checkpoint를 성공 이력으로 재해석하지 않는다.

### T3 보완 실행 — 2026-10-15 사용자 추가 승인

기존 실패09f0cdf와 증거는 보존한다. 이번 승인은 입력 포커스/저장 알림 경쟁의 원인 조사·같은 권한 경계의 보완 설계·회귀·새 checkpoint 재검증을 포함한다. Native inline을 유지하며 새 권한/자산/전송/일반 writer·기존 Chrome/P09 변경·push/PR은 없다.

- [x] 기존 runner의 동일 CDP/자기 closed range에 읽기 전용 focus/blur/key/input/phase 관측(최대128개)을 추가했다. 806e83b의 실제 재현에서 `saving/master=pending/hidden=true/disabled=false` 순간 blur를 확인했다. 생산 코드 수정 전 관측이며 저장·포커스·입력·권한을 바꾸지 않았다.
- [x] 관측과 일치하는 최소 실패 테스트를 먼저 실행한다. `player-gain.ts`의 준비/저장/알림/표시 경계만 보완하며 trusted intent·fresh native probe·ticket/cold/conflict·명시 폐기·저장 손실 거부는 유지한다. unrelated focus/실제 다른 조작부로 이동한 사용자의 focus를 빼앗지 않는다.
- [x] 원인·보완·대조를 아래 검증 기록에 남긴다. 집중·전체·기반/생성/패키지 검사를 통과시킨 뒤 새 clean checkpoint/물리 후보에서 원래 qualification·negative를 실행한다. timeout/대상 없음/새 gate 실패를 PASS로 계산하지 않는다. 계약 확대나 새 원인으로 중지 조건이 생기면 보고한다.

보완 설계: `render(owner)`만 master `on/pending`에서 표시를 유지한다. `pending`은 현재 ON 의도가 있으나 config/DSP 준비를 기다리는 상태이지 OFF가 아니다. `off/unavailable`·master 없음에서는 계속 숨긴다. focus()로 강제 복원하거나 storage 알림/승인·probe를 생략하지 않는다. Gain actor의 loading/failed/conflict·retirement 잠금, trusted intent·native probe·broker 쓰기 경계는 변경0이다. 실제 pending 동안 DSP bypass 안전 동작도 바꾸지 않는다. 회귀는 pending 표시 유지/실제 OFF 숨김/다른 조작부 focus 유지/합성 저장0 및 원래 Home→ArrowRight 연속 실제 입력으로 증명한다.

## Task 4 — 전체 오디오 상태·고정 EQ·기존 출력 보호

**파일:** T3에서 연결된 MAIN protocol3/일시 master API의 회귀 tests, player controls, audio contracts/controller/신규 eq.ts, shared 타입, 기존 `tests/{audio,player,scoped-media-runtime}.test.cjs`, 신규 `tests/f01-audio-graph.test.cjs`, `tests/f01-eq.test.cjs`.

**입출력:** T1 protocol3 유효 AudioValues + T3 preview → source1의 current graph·audioProcessing/효과별 상태. T5은 compMix stereo meter branch만 사용한다.

- [x] RED: old owner/protocol1/2를 scoped3 성공으로 업캐스트0·registry 덮기0·source 생성0; 현재/퇴역 graph·stale preview/binding 폐기, 수동 master OFF를 저장된 default로 강제 ON0·genuine 새 video/default와 같은 video PZP 보존을 분리한다.
- [x] 구현: T3의 owner/config3·모든 guard/현재 scoped Gain·저장 부작용 없는 preview/수동 master action을 재사용하고 EQ/효과별 상태로 확장한다. exact descriptor/bounded scalar·gainOrigin enum·i18n, v1 global/status 제한 및 reload-required를 유지한다. 확정 owned gain은 site 변경으로 덮지 않는다. T3 연결을 재구현하거나 별도 bridge/intent를 만들지 않는다.
- [x] 구현: 명세7절 graph를 source1에 연결한다. EQ8개 peaking/Q1·양수 boost 합의 사전 headroom·EQ/headroom20ms, comp의 native pre-delay에 맞춘 compDry·compWet/전체 dryWet10ms, normalizer unity·masterGain10ms·기존 limiter 그대로. 각 진행 중 ramp의 현재 계산값에서 새 ramp를 잇는다. stereo speakers downmix wet2채널/좌우 meter, native/dry 채널 의미 보존. EQ 최소22050Hz 미만은 EQ 제한/dry 사유를 표시하고 source eligibility를 우회하지 않는다.
- [x] GREEN: `node --test tests/f01-audio-graph.test.cjs tests/f01-eq.test.cjs tests/audio.test.cjs tests/player.test.cjs tests/scoped-media-runtime.test.cjs`; 기본값·순차/중첩 변경·Gain0·mute/volume0·비유한·resume reject·retired graph status0/late callback0·source1 검증. 수학/가짜 node 검사만으로 native 응답/출력 완료라고 하지 않는다.
- [x] 생성 MAIN graph/타입 및 기존 compatibility pin과 새 F01 pin을 함께 확인하고 로컬 커밋한다.

## Task 5 — 노멀라이저 순수 제어·실제 automation

**파일:** 신규 `src/main/features/audio/normalizer.ts`, controller/contract, 신규 `tests/f01-normalizer.test.cjs`·`tests/f01-normalizer-lifecycle.test.cjs`; T8 객관 runner 소비.

**입출력:** compMix 좌우 pre-normalizer/master power·currentTime·유효성 → bounded dB ramp. helper에서 timer/AudioParam/버퍼·네트워크를 만들지 않는다.

- [x] RED: `normalizer waits one valid window and ignores gaps`에서 sampleRate22050..96000·fft 최소 power-of-two≥rate×0.25/≤32768·buffer 두 개≤256KiB, 0<dt≤0.2s·새 시작0dB/W초·0/음수/비유한/stall hold/EMA·무음 누적0·추가 gap 없는 warm-up 진행을 assert한다.
- [x] RED: `db automation is rate bounded and mute stays mute`는 max(좌power,우power)·EMAτ0.75s·target−30..−12/default−20·보정−12..+6·실제 ramp dB +1/−12dB/s, 입력≤−55 양수boost증가0·무음2초 뒤unity±1dB/s, pause/ended/hidden/context/pending/Gain0 hold를 고정한다. 역상 stereo와 한쪽 신호에서 cancellation/평균희석0.
- [x] 구현: 100ms scope-owned timer·고정 두 Float32Array/AnalyserNode, 정상tick에서 현재 진행 ramp dB 계산→향후100ms 제한(+0.1/−1.2)→양수 exponential gain automation. gap 후 warm-up은 시작점 재설정 반복 없이 W초를 채우고 catch-up0. OFF/조회예외/비유한sample/RMS는 limited+10ms unity(속도 예외), 시간 공백은 hold로 구분한다. already scheduled ramp가 stall 중 진행하는 범위는 마지막 tick부터100ms까지뿐이다.
- [x] GREEN: `node --test tests/f01-normalizer.test.cjs tests/f01-normalizer-lifecycle.test.cjs tests/f01-audio-graph.test.cjs`; supported 밖은 normalizer unity/limited만, 다른 효과 보존; source/route/retirement별 reset, pause/hidden 재개 새W초·old meter/timer/EMA0·OFF reference 정리. RMS/원음 buffer를 status/postMessage/log/storage로 보내지 않는 assertion도 고정한다.
- [x] strict/generated check와 로컬 커밋. 오프라인 sample helper 성공을 실제 연속 출력의 속도 증거로 사용하지 않는다.

## Task 6 — 승인 설정 TAB UI·확정 프리셋·현재 master 연결

**파일:** `src/settings/{client,popup,audio-settings-ui}.ts`, popup HTML/CSS/i18n/web CSS, 신규 `tests/{f01-audio-ui,f01-preset-ui,f01-audio-target}.test.cjs`, 기존 settings/media UI/client tests.

**입출력:** T1 값·T2 own actions/확정 snapshot·T4 상태 → 현재 재생과 저장할 초기값을 분리한 UI. 관리 생성은 미확정 Gain preview가 아닌 확정 저장값만 복사한다.

- [x] RED: 전체 ON/OFF 최상단/단일 Gain·출처 별도행·80px 고정수치2자리/원값무반올림·680/580px/8대역한줄·사각페이더/1dB눈금/2dB숫자·컴프레서5다이얼+숫자·160px 상대증분/끝점역이동·상단 comp→EQ 순서·비유한/빈입력 보류·disabled/input/a11y를 assertion한다. numeric focus 변경 없이 표시만 재렌더해 dirty 값을 잃지 않는다.
- [x] 구현: UI helper는 렌더/조작만, 저장은 기존 client/Broker이다. 더블클릭 comp항목 기본값/EQ0/Gain1 owned, 섹션 comp5개/EQ8개만 reset. OFF 편집·표시/효과 적용 구별, master/effect/default/다른도메인 보존. 두 SVG 참고 그래프는 comp정적 압축/EQ응답 각각이며 RMS/출력/복합 실시간 그래프로 가장하지 않는다. 참고 EQ는 gain/안전감쇠 제외·OFF중립/Q1/48kHz 예시를 명시하고 native 검증과 분리한다.
- [x] 구현: `get-audio-state`/`set-audio-wanted`는 own TAB sender/원래 tab/window/native document/current route·request sequence 검증 후만 전달한다. MAIN reply는 현재 적용의 advisory status이며 실제 wet 출력 증거가 아니다. 늦은 reply·탭 닫힘/새문서·scope 변경에는 discard/대상 없음·retarget0. cross-document gesture 전달을 보장하지 않고 resume blocked면 pending/limited와 방송에서 직접 켜기 안내; master 클릭은 default/Gain 저장0이다. 원래 document를 native InjectionResult.documentId로 캡처·전달 직전/응답 직후 재확인하며 같은 URL 새 문서는 거부한다. MAIN에 Chrome documentId를 공개하지 않고 그 문서의 ScopedContext/request ID로만 연결한다. TAB와 실제 button 둘 다 T3의 `PlayerController.setAudioWanted`를 사용해 동일 private manual intent를 갱신한다. default ON→own TAB OFF→binding 변경/같은 video PZP/pending-resume 후에도 OFF·저장0이고, genuine 새 video/route만 초기 default를 적용하는 회귀를 추가한다.
- [x] RED/GREEN preset: 오디오/영상 선택과 적용 분리·관리중복적용0, 고정 두 recipe/영상새recipe0, 상단 목록·이름변경/분리삭제·하단details접힘/저장진입펼침·독립draft·빈목록disabled. 생성 준비 **진입 시** 원래 도메인/scope/token/revision/확정 snapshot/Gain 출처를 캡처하고 저장 시 동일성을 재검사한다. 중간 scope/값 변경이면 생성 draft/name을 보존하되 write0/원래 의도 폐기·재조회 안내. apply/replace/import/upgrade는 native confirm **전** 불변 완전한 요청을 캡처하고 확인 후 revalidate; 취소0/late ABA0·unknown0재시도.
- [x] 내장 ‘기존 컴프레서’/‘음성 EQ’(−2,−1,−1,0,1,2,1,0)의 patch는 Gain 쌍/audioDefault/현재wanted를 보존하고 레코드자동생성0. 새 user preset은 dirty0·확정 origin/유효Gain·revision일치, 사이트 Gain 미확인은 disabled(실제 문구는 한글); legacy read/import/상속 선택의 영향 확인과 탭 retirement 잠금도 유지한다.
- [x] GREEN: `node --test tests/f01-audio-ui.test.cjs tests/f01-preset-ui.test.cjs tests/f01-audio-target.test.cjs tests/media-ui.test.cjs tests/media-client.test.cjs tests/settings-multi-ui.test.cjs`; real render/키보드/고배율/좁은화면은 T7, actual audio는 T8. 원본/생성/i18n·UI load order를 함께 로컬 커밋한다.

## Task 7 — 실제 설치·다중 창·저장 형식 전환/손실 대조

**파일:** 기존 `scripts/check-installed-{extension,transition}.mjs`·harness/fixture/transition scenario와 tests 확장; 신규 `scripts/check-installed-audio-settings.mjs`, `tests/installed-audio-settings.test.cjs`, F01 transition fixture·독립 기대 값. T3 runner 재사용.

- [x] runner option/owned path/run ID/timeout/close proof/source attestation/pin 실패 RED→GREEN. 신규 JSDoc/helper는 strict checkJs에 포함하고 독립 literal 기대 값을 사용했다.
- [x] Native 실행마다 tracked 입력을 local clean checkpoint로 고정하고 전후 attestation을 대조했다. 실패 증거는 보존했다.
- [x] published58/F00 ae9f8e5의59/F01 62를 독립 pin해 v1 명시 전환/재개·게시본 전역 OFF/ON·최대revision/손상/미래/absent·대상/문서/worker/quota를 검증했다.
- [x] 두 실제 창의 전역/상속/채널 독립·CAS/ABA·EQ/스타일 병합·draft/unknown·PZP/새 video·대상 이동/종료를 검증했다. hidden/two-window 유한 heap/source1은 관측했으며 정밀 timer/old-callback/누수 판단은 기록된 역할 분리에 따라 T8에서 마감한다.
- [x] 자기 fixture의1280/800/360px·실제200% zoom·키보드/focus·고정 수치폭·다이얼·private native 캡처를 확인했다.
- [x] 계획된 Gain full/설정 UI/`--media-schema=f01` CLI를 구현하고090452a의 BA/BC/BF로 실제 positive 검증했다.
- [x] 실제 저장 뒤 정확한 한 필드 손실만 검출하는 UI4손실/cold5손실 대조를 BB/BD로 확인했다. unrelated 오류/미실행/timeout은 성공으로 계산하지 않았다.
- [x] 성공 실행 모두의 종료3증명/전후source5필드일치/cold cleanup0·secondary0을 확인했다. 실제 store/플랫폼rollback/자연 BFCache·suspension은 미검증이다. 로컬 커밋만 했으며 실행별 근거는 [아카이브](../archive/2026-10-15-f01-completed-stages.md)에 남겼다.

### T7 비활성 탭 관측 보완 — 2026-10-15

기본 Playwright 연결의 focus emulation은 비활성 탭을 visible로 유지하므로 실제 숨김 수명 검사의 전제와 충돌한다. 화면 표시 모드만 바꾸거나 별도 CDP session에서 false를 보내는 것으로는 해결되지 않았다. 현재 설치된 Playwright1.62.1의 공식 `connectOverCDP(transport,{noDefaults:true})`를 F01 설정 검사에만 적용한다. 기존 물리 후보의 동일 bundled Chromium을 새 자기 프로필·익명 debugging pipe로 실행하며 TCP/원격 포트·새 의존성·기존 Chrome·확장 권한 변경은 없다. 기존 일반/Gain/전환 launcher는 유지한다.

익명 pipe의 NUL 구분 JSON은 UTF8 분할/여러 frame·32MiB 상한·잘못된 입력/EOF/error/close를 회귀 검증하고 새 helper도 strict checkJs·필수 tracked source 입력에 포함한다. Native 실제 탭 전환 뒤 document.hidden=true와 복귀 false를 조건부 대기해 확인하며 property override/합성 visibility 이벤트는 금지한다. 종료3증명·전후 source 일치·기존 UI/저장 gate는 완화하지 않는다. 새 clean checkpoint 정상/정확한4손실이 끝나기 전 T7 완료가 아니며 T8의 정밀 timer/출력 검증을 대체하지 않는다.

### T7 비활성 플레이어 재연결 보완안 — 승인·실제 검증 완료

2026-10-15 사용자가 위 구현·종합 재검증과 후속 T8/T9 진행을 승인했다. 새 권한/의존성/전송·수용 기준 변경·push/PR은 여전히 제외한다.

**근거:** 301c2e9의 AT는 실제 비활성 탭에서 video 교체 뒤 decoded/blob=true·wanted=false·source0으로15초 제한에 걸렸다. runtime의 관련 DOM 변경은 rAF에만 재조정을 예약한다. rAF가 실행되지 않는 숨김 문서를 모사한 독립 회귀에서도 제거된 옛 video가 state에 남아 실패했다. 검사에서 탭을 강제로 활성화하면 이 제품 결함을 가릴 수 있으므로 하지 않는다. 세 번의 Native 보완이 startup/조작/실제 수명이라는 다른 층의 결함을 드러낸 시점에서 실행 구조를 재검토하며, 아래 제품 변경은 별도 승인 전 시작하지 않는다.

**권장 설계:** `src/main/runtime/lifecycle.ts`의 기존 관련 DOM 변경 필터·재조정 경로를 유지한다. 보이는 문서는 기존 rAF를 사용하고, 숨겨진 문서는 같은 관련 변경이 있을 때만100ms 단발 timeout으로 합친다. 상시 polling/새 interval은 만들지 않고 재조정 예약은 종류와 무관하게 최대1개다. 브라우저가 timeout을 더 늦게 실행할 수 있으므로100ms 내 실행 보장을 광고하지 않는다. visibility 변경 때 이전 예약을 취소한 뒤 기존 즉시 재조정을 수행하고, BFCache freeze·최종 pagehide/dispose에서도 모두 취소한다. 예약 ticket 일치를 확인해 취소/재개 이전의 옛 callback이 새 문서/플레이어에 작용하지 않게 한다.

동기 재조정은 DOM 조립 중 재진입/과도한 숨김 작업을 늘릴 수 있어 채택하지 않는다. rAF 강제 실행·document.hidden 위조·숨김 case를 표시 case로 바꾸는 테스트 우회도 제외한다. 오디오 알고리즘·저장 형식·writer/문서 권위·권한·외부 통신·원격 포트·user Chrome은 변경하지 않는다.

**구현·검증 묶음(승인 대상):**

- [x] rAF가 전혀 실행되지 않는 숨김 상태의 실제 runtime/video 교체 회귀 RED. 이 단위 모사는 Native 성공 증거가 아니다.
- [x] 단발 예약 coalescing/표시 복귀 시 중복0/관련 없는 DOM0/BFCache·dispose·늦은 callback0 회귀 RED→GREEN.
- [x] 기존 MAIN 생성 경로로 재생성하고 web/runtime.js 실행 pin만 변경 이유와 함께 갱신. 기존 수치/quality 기준 유지.
- [x] 격리 전체·9기반/build/package·관련62회귀와090452a의 Gain full·설정 정상/4손실·cold39/19·전후source/종료3증명 확인.
- [x] 실제 숨김 흐름의 video/PZP 교체·표시 복귀 및 최종 전체1577통과/실패0/기존1skip 뒤 T7 마감.

이어서 이미 승인된 T8 객관 출력/수명 계측 및 T9 최종 검토를 진행한다. 새 권한/의존성/전송·수용 기준/알고리즘 변경 필요 시 중지하며 push/PR은 하지 않는다.

## Task 8 — 객관 EQ/노멀라이저/출력·수명 검증

**파일:** 기존 `scripts/{check-audio-quality,audio-artifact-core,audio-signal,audio-metrics}.mjs`의 현행 도구/fixture 보존; 신규 `scripts/check-audio-processing.mjs`, `scripts/audio-processing-metrics.mjs`, `tests/f01-audio-quality-contract.test.cjs`, F01 독립 fixture. 기존 영상/미리보기 검사도 유지한다.

- [ ] RED: missing/partial/native예외/nonfinite/누락채널/잘못된sourcehash/실패한negative가PASS로 집계되는 경우를 거부한다. 새 metric·report 타입을 strict checkJs/audio-tools/산출물 provenance graph에 포함하고 기존 오차/fixturehash를 변경하지 않는다.
- [ ] T8 Native 실행 전 새 runner/타입/fixture/생성물을 로컬 checkpoint에 포함하고 동일 clean SHA/전후 attestation으로 고정한다. 필요 보완은 새 SHA이며 입력이 바뀐 뒤 옛 결과를 새 PASS로 재사용하지 않는다.
- [ ] 기존 객관 runner의 protocol2 주입·MAIN slider programmatic driver를 protocol3의 현재 production graph/저장 부작용 없는 Gain 소비로 맞춘다. synthetic audio fixture의 driver는 실제 사용자 저장 권위 증명이 아니며 T3/T7을 대체하지 않는다. `node scripts/check-audio-quality.mjs`에서14 steady/12 alignment/18 transitions·stress/dip·source1을 새 후보에서 유지한다. T4의 새 identity stage 변경 때문에 frozen node 수/asset 목록이 달라지면 **구 baseline 동결 + 새 계약 pin + 실제 출력 동등성**을 별도 증명한다. hash만 갱신하고 같은 회귀로 계산하지 않는다.
- [ ] 신규 `node scripts/check-audio-processing.mjs --run-id=F01audio`는44.1/48/96kHz 각각 실제 bundled Chromium native graph/input/capture로 수행한다. EQ neutral80Hz..10kHz오차≤0.05dB, 각band±6/혼합과 이론/native response·측정≤0.5dB를 감쇠/Gain 제외와 실제 end-to-end 처리로 분리한다. EQ enable/ramp·headroom/Boost음량감소·comp/normalizer/master 변경도 측정한다.
- [ ] normalizer는 −36/−24/−12/−6dBFS **RMS** mono/stereo/역상/좌우한쪽·무음/저잡음/위상차반복burst에서 평가한다. compressor/EQ OFF·Gain1·목표−20/입력−24의 reachable steady를12초 이상 관측해≤1dB 오차, clamp비도달과 limiter왜곡은 별도이다. 실제 automation와 시간창 출력의 +1/−12dB/s·무음unity±1·boost상한/NaN0·무음양수증가0, dt≤200mscoverage·warmup·stall100mshold·재개W초·조회오류10msunity 예외를 서로 다른 case로 pin한다.
- [ ] fully wet ON peak≤0.9801/fullscale0, native/dryOFF는0.99/1.0 입력을원래대로 유지, dry/wet complementary weights합1·입력peak≤1에서fullscale0·기존dip/연속성 유지. 중첩 EQ/preset/comp/Gain/normalizer 전환과 extreme48dBheadroom·보정+6/Gain2·source교체도 포함한다. 기본/extreme threshold를 완화하지 않는다.
- [ ] audio buffers/EMA/timer/node 수·old callback0/source1·두창/한쪽종료·mute/volume/Gain0를 보고한다. 제한·미실행·capture오류는PASS/0값으로 보정하지 않으며 실제 하드웨어 청감/보호소스와 객관capture 증거를 구분한다. 기존 영상24pixel/미리보기/설치 positive-negative도 자기 후보로 재검증하고 로컬 커밋한다.

## Task 9 — 종합 게이트·공개 고지·최종 whole-F01 검토

**파일:** 실제 변경 원본·생성·관련 독립 pin·README/README-en/PRIVACY·F01 validation/archive/PLANS. HLS/preview/영상의 무관한 리팩토링 없음.

- [ ] 전체 source cursor/hash 고정→9foundation→전체node:test→빌드/패키지exact62→기존audio/pixels/설치negative→T7/T8→실제 npm/Gitleaks/ESLint. 원본/root보호자료 해시·snapshot/diff·status 확인. 과거private P02원장은 이력으로 보존하고 최신후보 실제감사/경고분류를 별도대조; 원장해시만덮거나 부재skip1을완전인증으로 쓰지 않는다. 경고8/rawexit1과 새 경고/오류를 구분한다.
- [ ] README/PRIVACY는 로컬 오디오 처리·일시 buffer/수명·새 값저장·외부전송0·삭제·stereo downmix/legacy/혼재schema·gesture/정밀RMS한계를 간결히 고지한다. dashboard/정책URL 실제 변경과 스토어 제출은 나중의 배포 승인 gate이며 문서동기화를 실제게시완료로 세지 않는다.
- [ ] fresh 전체 입력에 Astra max 독립 최종 검토를 요청하고 Critical/Important 보완·동일 reviewer targeted 확인 후 필요한 게이트를 재실행한다. Minor/판단제외·native 미검증은 executor가 명시 판단한다. 차단되면 대체 모델/정식보안스캔/외부모델을 몰래 사용하지 않고 기록/보고한다.
- [ ] F01 전체 로컬 구현/검증 완료 이력은 archive로 옮기고 PLANS에 잔여제한/F02/통합/실제AF05후행게이트를 남긴다. push/PR은 다시 명시 승인받으며 중간 Task·문서 PR은 만들지 않는다. 릴리즈는 F00/F01/F02 모두 완료 후 별도 승인.

## 4. 실행 명령·결과와 실행 방식

위 신규 테스트/runner는 구현 대상이며 현재 실행 성공이 아니다. 계획 승인 뒤 원본 구현·RED/GREEN에 필요한 생성 결과만 갱신한다. final/native 실행은 **실행 전에 만든 로컬 검증용 checkpoint의 clean SHA**에서 만든 자기 물리 후보 및 그 후보의 dist로 한정한다. 모든 신규 입력도 HEAD에 포함하며 sourceAttestation의 dirty 거부/전후 입력 일치를 유지한다. checkpoint는 완료 선언이 아니고 Native 실패 시 삭제/공개하지 않으며 SHA·실패 증거를 보존한다. 기존 pinned Node24.19.0/bundled npm12.2.0/TS7.0.2/esbuild0.28.2/Playwright1.62.1/gitleaks8.30.1을 사용하고 PATH 부재 때문에 재설치하지 않는다. 샌드박스 fs.realpath EPERM이면 task-owned TEMP/TMP 유지·허용된 Native 실행을 요청하며 기존 권한 한계를 숨기지 않는다.

`npm run check:toolchain`, `check:runtime-js`, `typecheck:settings-fixture`, `typecheck`, `typecheck:development`, `check:settings-runtime`, `check:main-runtime`, `check:build-proof`, `typecheck:audio-tools`의9개·`npm test`·`npm run build`·`npm run check`를 후보에서 실행한다. 새 TypeScript 원본은 기존 `generate:settings`/`generate:main`으로 결정적 생성한다. 실행 전 정확한 runner 지원 옵션과 후보·핀 해시를 확인하고 unsupported CLI를 임의 성공으로 대체하지 않는다.

**권장 Native:** root가 T1→T2→T3 qualification→T4→T5→T6→T7→T8→T9를 순서대로 실행하고 마지막에 fresh whole-scope Astra max 검토를 받는다. 각 단계는 공유 저장·수명주기에 의존하므로 구현 agent를 무작정 병렬화하지 않는다. 사용자는 **계획과 Native/격리 실행 승인 묶음**을 확인해야 하며, 이 문서 작성·계획검토 요청을 구현 승인으로 해석하지 않는다.

## 5. 자체 점검·검토 커서

- [x] 승인 전체 설계1–12절과 Gain1–7절을 T1–T9에 연결했다. latest preset snapshot/scope·trusted dblclick·기본값복귀는 T3/T6/T7에 추가했다.
- [x] 저장·스키마/전역alias·DSP/상태·actor/epoch·timer/meter·생성/strict/devtool·실제설치/손실·고지/보호파일의 소비자를 포함했다.
- [x] 5개 공격적 입력군을 소유 Task의 RED/native 대조로 연결하고 과거검토/목업/합성검사와 실제 native 성공을 구분했다.
- [x] Astra max 독립 상세 계획 검토·Important3 보완·같은 reviewer 재확인 완료. 잔여0/0/0, [검토 기록](../validation/2026-10-14-f01-plan-review.md). 실제 구현/Native 성공이 아닌 계획 결함 닫힘이다.
- [x] 2026-10-15 사용자 계획·Native 격리 실행 방식 승인. 제품 구현/자기 후보 검증은 순차 진행하며 push/PR·사용자 Chrome/P09 변경은 금지.

기술 근거: [Chrome InjectionResult·ISOLATED execution](https://developer.chrome.com/docs/extensions/reference/api/scripting#type-InjectionResult), [MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender), [Web Audio native node/AudioParam](https://www.w3.org/TR/webaudio/). API 계약의 존재는 이 계획의 실제 sender/gesture·응답/출력 성공 증거가 아니며 qualification/객관 검사로 별도 확인한다.
