# F00 — 채널별 미디어 설정 구현·검증

## Task2 — 동일 큐 v2 저장 경계

- v1 API는 유지하고 새 v2 요청을 동일64대기 큐로 직렬화했다. media 저장은 mediaProfiles 한 키만, 전역 프리셋 적용은 기존 전역 변경 키만 한 번 저장한다.
- own document/context와 current tab의 window/origin/channel/incognito를 저장 직전 다시 확인한다. 확인 불가·시크릿 신규 저장은 차단한다. getContexts의 응답 대기는2초로 제한한다.
- 정상 sender 기준 RED12건 → 집중107/107·추가 경계16/16 GREEN. 전체1223건:1222통과/실패0/취소0/기존 private-history skip1. 9개 foundation gate 통과.
- unknown 전역/최상위 필드, 손상 media 원본, 도메인 reset/recreate·프리셋 ABA·쓰기/응답 유실·혼합 큐 포화와 저장 직전 context/target 변경을 확인했다. 이전 잘못된 sender/동기화/대기 경계 실패는 성공으로 세지 않는다.
- 실제 ordinary 설정 TAB의 document/context는 격리 Chromium에서 확인했지만 실제 툴바 POPUP의 자동 제어는 아직 미검증이다. popup 생성만으로 Task5 성공을 주장하지 않는다. 전체 F00 구현·최종 Astra 검토도 아직 완료가 아니다.

2026-10-14 / Native 실행 승인. 기준 main45100969200dfb5e33737db60c9a3fa7450f4450, 로컬 브랜치 codex/f00-channel-media-settings. [설계](../specs/2026-10-14-f00-channel-media-settings-design.md)·[계획](../plans/2026-10-14-f00-channel-media-settings.md). 사용자 시청 Chrome/P09·push/PR·버전·릴리즈·스토어 변경은 제외한다.

## Task1 — 순수 계약과 로드 그래프

- 새 classic media-profiles.js는 단일 TypeScript 원본의 순수 schema/값 검증·채널 projection·도메인/프리셋 병합이다. 기존11개 field descriptor를 이동해 CONFIGS가 재사용하고, 아직 UI/broker의 신규 저장 요청은 연결하지 않았다.
- absent/read 무쓰기, 글로벌 비미디어 보존·도메인 상속·128/64/48codepoints/192bytes/256KiB 상한·own data getter 거부·safe integer/no-op·삭제/재생성 token·unknown create 확인을 검사했다. 정상 decimal은 반올림/변환하지 않는다.
- 첫 media14개는 모듈 부재의 RED→14/14 GREEN. 실제 load-order4개와 tagged worker2개 RED. 이후 기존 채널의 다른 도메인 enable ACK 손실을 별도 RED1/18→GREEN18/18로 보완했다. 원래 생성/record/domain token과 초기값을 확인할 때만 무쓰기 확인하며 재생성은 conflict다.
- published-four/F00-five worker source를 명시 tag/정확한 파일 집합·정상 순서로 구분하고, 잘못된 교체는 기존 worker 종료 전에 거부한다. P09/게시 byte·old/new/old raw/등록 identity를 보존한다.
- 새 모듈은 현재 오디오의 실제 입력이므로 audio artifact reader/evaluator/hash/type allowlist에 포함했다. DSP·허용 오차·파형 계산은 변경하지 않았다. 구 audio oracle/runtime inventory/build-proof/fixed payload는 유지하고 새 F00 active pins/oracle을 분리했다.
- pre-F00 settings-fixture의 원래 normalized 해시839420...은 비실행 text snapshot에 유지한다. 현행 checked graph는 모듈 포함14파일, 모든 기존18개 외부/25개 내부 오용과 callback/clone/lastError negative를 계속 실행한다.
- 초기 연결123개 중120pass/3fail은 잘못된 source-pack 접근 및 옛13/5 개수 assertion이었다. 호출자/새 graph 기대값을 보완한 연결137/137·실패/skip0. 마지막 추가 media 경계18/18.
- **최종 Task1 전체:** 물리 후보1207개/1206pass/실패0/기존 private 자료 부재 skip1,54.00초. 9foundation 모두 통과; runtime17/settings11/MAIN6, 기존4-context proof baseline 그대로 통과. 기존 원본 tracked 기준은1186/1185pass/0fail/skip1이었다.
- 처음 샌드박스 realpath EPERM 및 fixed ZIP cache 부재 실패는 보존했다. 정상 권한의 물리 후보·고정 ZIP 캐시로 준비 후 실행했으며 실패를 제품 PASS로 치환하거나 test/permission guard를 줄이지 않았다.
- root dist58·package/manifest2.13.3·원본 ZIP/CRX·private 감사 원장·보호 브랜치 불변. source manifest만 정확한 새 모듈 prefix를 두 world에 등록했고, 이를 제거한 전체 manifest는 이전과 동일하다. root dist build/사용자 프로필 접근 없음.

이는 Task1의 계약/기반 증거이며 F00 저장 UI·실제 채널 적용·설치형4관측·실제 Chrome/스토어 수용 또는 최종 Astra max 검토 완료가 아니다.

## 남은 실행

- [ ] Task2 동일 broker 큐·v2 경계·저장/실패/unknown 계약.
- [ ] Task3 명시 scope/preset UI와 독립 client 상태.
- [ ] Task4 scoped runtime·필터/오디오 intent·객관 적용 검사.
- [ ] Task5 실제 popup qualification·4관측·정확한 손실 negative·고지.
- [ ] Task6 fresh 전체/도구 감사/설치·보호 대조·whole-F00 Astra max.

미실행은 별도 한계다. 버전2.13.3 유지, local commit만 승인됐고 push/PR/배포는 하지 않는다.
