# AF05-B1 — 게시 설정 계약 호환성 구현 검증

2026-10-12 / Asia-Seoul. [승인된 계획](../plans/2026-10-12-af05b1-settings-compatibility.md). 사용자가 B1·Native 실행·Astra max 최종 검토를 승인했다. 전체 AF05-B 수용 기준 변경·버전·설치·게시 승인은 아니다.

## 구현과 실제 경계

- 기준main `46eb67236a230bce92e679f7adab087b1c0107fb`, 검증 코드 `b81debd0b29eb7d266c13e191454507a42ab5809`.
- reader는 고정 게시commit의4개Git blobs만 읽는다. 입력/배포출력 SHA-256과config의 정확한EOL 복원을 검사하고 객체 부재/크기/형식/hash 불일치에는 실패한다. 네트워크·쓰기·최신소스 fallback은 없다. CI verify에서 고정commit fetch를 명시하며 offline foundation은 변경하지 않았다.
- 기존settings fixture에4개source 입력만 추가했다. versioned 교체는마지막작업 후settle epoch·미응답request·active boundary를 검사한다. CSS 예약gap에서도busy로거부하며퇴역API 호출0을확인한다. raw 저장/CSS Map identity는유지하고초기seed 외 재주입은하지않는다.
- default fixture/zero-argument restart 및현재client/UI 로드방식은보존했다. B1은실제broker/contract4개와Chrome storage/CSS 모의를실행한다. background IIFE·구 UI·Chrome worker/내구저장·실제업데이트는B1 검증범위가아니다.

## RED → GREEN과 반례

후보 실행4파일의실제SHA-256은다음과같다. 게시파일hash는계획의별도표에있으며새AF 파일과같다고주장하지않는다.

| 파일 | 후보SHA-256 |
| --- | --- |
| config.js | `a39a767e2cb470b0b6da4ee98b32e2226acadf8120918af0d39cbc1bceb6fac3` |
| style-schema.js | `b80a56dcab662f54378a265b6229be0e169202421a72d409caafec09bf5a4c83` |
| settings-contract.js | `bdd49f4a660dcda6c260cadd9f897a0cd63cffa90291ea81d99cd15500f9ec44` |
| settings-broker.js | `8a0f3f20c01c6162fa57544e9fed05fdfef3b1187e65c285b105e0302339aa4c` |

- reader 부재 RED5/5 → 출처검사 GREEN5/5. 고정Git4파일의출력hash/EOL 복원·one-bit변형거부·missing/extra/accessor/non-Buffer·각1MiB/합계2MiB 상한·empty Git 저장소의객체부재hard fail.
- versioned source 미지원 RED9/9 → 선택된실제함수/연속저장/invalid source/commit·write-result·response·CSS·event hold/예약gap/zero-arg세대유지 GREEN9/9.
- runtime.sendMessage 동기예외가pending을누수시켜교대를막는RED1/1 → 동기catch/미처리요청계수해제 GREEN. 실제callback실패와64개대기job도게시/현재각각실행했다.
- 입력스키마는게시config25개/style group7개고정hash와대조하고후보가아닌게시범위의동일입력을두세대에적용한다. 기본값·unknown raw 보존/비노출·소수/폰트0·legacy truthiness/cleanup·손상revision·오류뒤병합·CSS 실패·대상reload를literal golden으로확인했다.
- 저장값손실candidate를실제eval해동일oracle가arrowSeek 손실로실패하고, previewVolume.max100→101변형은동일schema oracle가실패함을확인했다. 정상파일이나source는변형하지않는다.
- 새reader의computed indexing3곳이기존ESLint에잡히는RED1/1 → Object.entries/Array.at/Object.fromEntries로동일hash/입력검증을유지하며GREEN. rule/suppression/exclusion은변경하지않았다.

## 실행 결과

| 검사 | 결과와 한계 |
| --- | --- |
| 초기환경기준 | sandbox:835개/740pass/95fail(주로temp realpath EPERM). 일반환경:835개/833pass/2fail(P02 역사hash+temp rename EPERM). PASS로표시하지않음. rename검사단독재실행1/1,이후전체에서도통과 |
| 집중·연결 | 최초191/191,추가도구회귀후새출처6+호환성72=78/78,최종집중192/192·실패/skip0. 최종전체에도동일검사포함 |
| 원래폴더전체(68569f2) | 912개/911pass/1fail/skip0. `P02 warning ledger closes every baseline row and preserves every latest guarded observation`의기존background.js 역사hash 불일치. 원장/skip 규칙미변경 |
| 새tracked clone 최종(b81debd) | 913개/912pass/fail0/기존private-evidence-absent skip1. 제외옵션없음;의존성물리복사·고정commit 명시fetch. Windows file-symlink privilege 미검증diagnostic2개는유지하며Linux CI에서별도확인 |
| strict/생성/도구체인 | check:toolchain·check:runtime-js·typecheck·typecheck:development·typecheck:audio-tools·check:settings-runtime·check:main-runtime·check:build-proof 모두exit0 |
| 격리build/package | 새clone에서만build, v2.13.3/entry resources20 검사통과. 원래root dist에build하지않음 |
| 후보합성오디오 | candidate dist: steady14/transition18/alignment12,qualityFailures0,steady full-scale 초과sample0. fresh synthetic/silent sink;실제방송음질이나native설치증거아님 |
| 기존설치형positive | af05b1positive 통과. 기존16개passed checks;headless-unpacked in-place worker reload 미관찰한계는원래report에보존 |
| 기존설치형negative | af05b1negative에서예상`main-runtime-missing` 탐지. 별도fresh fixture/profile·finally cleanup |

## 도구 감사와 보존

새private run의입력snapshot 전후일치. 첫run `run-2026-10-12T12-46-22-969Z-rxDoUa`:npm0/Gitleaks dir·git0,ESLint10(기존7+reader3). 보완후run `run-2026-10-12T12-51-17-960Z-mSRszX`:npm0/Gitleaks dir·git0,ESLint7·원시exit1. 현재7곳은모두`owned-files.mjs`이고기준main과내용이같다. 새경고0이며경고전체0·무취약/정책인증을주장하지않는다. frozen감사자료는현재report로덮지않는다.

원본ZIP SHA-256 `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`; root dist58개inventory SHA-256 `d01bd672ff9bb9ffab808099432129b9429f5baa2fbf256e612531e358086c60`; frozen baseline `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`와ledger `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401`을보존한다. 기존계정/쿠키/방송/시청·native기준profile은검사입력으로사용하지않았다. 제품version2.13.3·제품TS/JS·권한·manifest·lock은미변경이다.

## 실행 판단과 남은 게이트

- 현재폴더별도branch는사용자기존선호에따름. 격리한파일시스템은worktree가아니라owned 검증clone이며후보build/hash 검사가원래dist를보호한다.
- 제공brief parser를위해Task1/2 heading을Task 1/2로정규화하고미번역표제만수정했다;구현범위는같다.
- 기존역사P02 불일치는원장을고쳐지우지않음. 제외없는새tracked 조건전체검사를별도로유지했다.
- 집중검사후코드checkpoint를먼저commit해immutable tracked clone을만들고전체게이트/문서commit을이어갔다;중간commit은출시승인이아니다.
- Astra max whole-branch 최종검토·필요보완·한글PR 최종CI/병합은아직대기다. 이절은검토결과를받은뒤갱신한다.
- B2 전체payload/background/구UI/설치전환·native preflight/실제update·플랫폼rollback·과거미검증수용승인은별도미완료다. B1만으로P09/AF05-B를닫거나F00–F05 동결을해제하지않는다.
