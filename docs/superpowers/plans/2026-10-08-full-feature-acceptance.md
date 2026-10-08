# 전체 기능 검증 및 보완 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 기존 작업 브랜치를 유지하며 직접 구현하고, 변경 단위별 독립 읽기 전용 검토를 수행한다.

**Goal:** 미리보기뿐 아니라 기존 설정과 스타일 기능을 항목별로 검사하고 재현된 결함을 수정한 뒤, 전체 검증 조건이 충족되었을 때 한글 기여 PR을 연다.

**Architecture:** 기존 MAIN 모듈/ISOLATED 설정 bridge와 기능별 상태 계약을 유지한다. 실제 설치본 검사와 별도 브라우저/Node 검사를 구분한다. 확인되지 않은 내부 어댑터를 추측으로 연결하지 않는다.

**Tech Stack:** Manifest V3, JavaScript/CSS, Chrome, Node 24, jsdom, Playwright, 허용된 탭 범위 CDP.

**Spec:** ../specs/2026-10-08-chzzk-compatibility-design.md 및 사용자 후속 요청: 전체 기능 확인·조치, hover 지연 개선, 모든 검증 완료 후 한글 PR, 확장 새로고침 자율 수행 불가 시 필요 단계 중지.

## Global Constraints

- 기존 설정 키와 한국어/영어 번역을 유지한다.
- 원본/upstream 및 main, 스토어 배포는 변경하지 않는다.
- 토큰·쿠키·signed URL query·채팅 본문·전체 React 객체를 진단 기록/PR에 포함하지 않는다.
- 로그인/연령/보안 장벽을 우회하지 않는다. 시청/음량/설정은 임시 검사 후 복원한다.
- 단위 검사 PASS는 실제 설치본 PASS나 전체 정상 판정이 아니다. 미검증·지원 제한을 정상으로 합산하지 않는다.
- 필요 단계에서 확장을 스스로 새로고침할 수 없으면 중지한다. 현재 도구는 chrome://extensions 탭을 claim할 수 없고 CDP는 해당 웹 origin 범위이므로 사용자 새로고침이 필요하다.

## Review Focus

- hover 도중 A→B/이탈/URL 변경: 사전 로딩도 함께 중단되어야 한다 (Task 1).
- API 응답 지연/캐시/연령 제한: 지연은 hover 시작 기준, 보호된 영상은 재생하지 않아야 한다 (Task 1).
- AudioContext/source 생성 실패와 재사용: 새 Gain 노드는 저장된 목표값으로 초기화해야 한다 (Task 1).
- 옵션 OFF/ON·초기 설정·SPA 전환: 중복 주입/설정 유실/원래 시청 방해가 없어야 한다 (Task 2).
- CSS 겹침·입력 포커스·작은 화면·PIP/fullscreen: 개별 옵션과 조합의 실제 사용자 동작을 확인해야 한다 (Task 3).

### Task 1: 현재 Gain/미리보기 수정 후보

**Files:** web/audio.js, web/preview.js, tests/audio.test.cjs, tests/preview.test.cjs, ../validation/2026-10-08-gain-smoothing-follow-up.md.

**Interfaces:** 기존 runtime.audio와 runtime.preview 공개 인터페이스는 변경하지 않는다.

- [x] source 생성 실패→재시도 Gain=1.5 검사 RED→GREEN. 새 Gain 노드에 transition 추적 초기화.
- [x] API75ms/설정100ms의 경우 hover100ms에 표시하는 검사 RED→GREEN.
- [x] API25ms 뒤 HLS 연결 시작, hover100ms 전 이탈 시 destroy/media 제거 검사 RED→GREEN.
- [x] 느린 API가 hover 기한을 지난 경우, 캐시 재진입, 사전 로딩 중 disabled/기존 generation cleanup/연령 제한 보존 검사. 실제 route/bfcache 화면 전환은 전체 acceptance에 남김.
- [x] `node --test tests/*.test.cjs`70/70, build, source/dist check, 독립 검토 완료; 후보 커밋으로 보존. 리뷰 Minor: 시스템 시각 조정에 영향받는 Date.now deadline. monotonic 보완은 다음 변경 묶음에서 regression과 함께 검토.
- [ ] 사용자 확장 새로고침 후 실제 설치본 hover 시간/영상 진행/음소거/정리·Gain 입력·재생 유지 검사.
- [x] 사용자 미리보기 정상 확인(설정0.1초). 설치본 Gain 키보드 충돌 재현/회귀 후보; 최종 설치본 검사는 새로고침 후 남음.
- [x] 다음 설치본 Gain 키보드150→155→150%/on/재생 유지/off 복원 확인. 팔로잉 자동42개 및30초 갱신6회, VOD timestamp 행·handle 관찰.

### Task 2: 기능 설정 전체 매트릭스

**Files:** config.js, popup.js, web/main.js, web/inject.js, web/player.js, web/audio.js, web/preview.js; 대응 tests/*.test.cjs와 검증 기록.

**Interfaces:** CONFIGS의 leaf 설정 및 runtime.statuses, DOM 상태를 기준으로 검사한다. 결함마다 가장 작은 production-module 회귀 검사를 먼저 작성한다.

- [ ] preview/livePreview/폭/지연/음량/rightClickToUnmute/customPreview: OFF/ON, sidebar와 main thumbnail, 느린 네트워크 및 이탈.
- [ ] updateSidebar/expandFollowings/popupPlayer: native DOM 연결점 조사, 실제 갱신/펼치기, 드래그 iframe 및 닫기 정리.
- [ ] arrowSeek/pressToFastForward: 허용-DVR live, VOD, 광고 구분, 편집 입력, 짧은/긴 클릭, 원래 속도/정지 복원.
- [ ] brightness/contrast/saturation/gamma/sharpness: 변경/초기화, 실제 영상의 필터 및 SVG, 하드웨어 조건은 미확인 시 표시.
- [ ] compressorDefault/threshold/knee/ratio/attack/release/Gain: 초기 실행·설정 변화·OFF/ON·실제 재생·remount/SPA.
- [ ] hideDonation/showDeleted, resize/timestamp: 실제 controller/메시지 구조를 제한적으로 조사; 삭제 이벤트는 확인 가능한 범위만, 후원/채팅을 보내거나 남의 moderation을 변경하지 않는다.
- [ ] 통계/시작 시각/채널 채팅 링크/설정 저장·팝업 상태: 실제 값·누락/실패 표시·새 탭/SPA 일관성.
- [x] 통계 해상도/측정FPS/코덱,PIP,팝업 생성·이동·닫기 설치본 검사. 모든25개 leaf와25개 스타일 저장 UI 계약 자동 검사. native sidebar·VOD시각·Gain키보드·drag 해제·스타일 등록 경쟁/legacy 이관 후보(설치본 재검사 남음).
- [ ] 재현된 각 결함은 RED→minimal fix→전체 suite GREEN→실제 설치본 검사. 내부 데이터가 없으면 명시적으로 미검증/지원 제한, PR 완료 조건 미충족으로 남긴다.

### Task 3: 스타일 전체 매트릭스

**Files:** styles.js, styles.css, styles/*.css, web/main.css, 관련 DOM 회귀 tests 및 검증 기록.

**Interfaces:** STYLES의 25개 항목을 해당 화면과 연결하고 사용자 저장 설정을 보존한다. 실제 설정 UI 접근이 불가할 경우 모듈/임시 CSS 검사는 별도 수준으로 기록한다.

- [ ] player: fit-player, volume-percentage, hide-ff, hide-comp.
- [x] 현재 live/종료 화면의 studio/topics/offline/chat-font 선택자 불일치 보완 후보. native fixture6/6, 실제 DOM 임시 A/B·복원 완료. 실제 저장 옵션/등록 검사는 새 확장 새로고침을 기다림.
- [ ] chat: chat-resize, chat-font-size, chat-timestamp, hide-ranking, hide-mission, left-chat.
- [ ] sidebar: hide-offline, hide-recommended, hide-schedule, hide-sidebar-partner, hide-shortcut, right-sidebar.
- [ ] toolbar: static-logo, hide-topics, hide-studio, auto-hide-toolbar.
- [ ] home/explore/misc: hide-recommended-live, top-explore, hide-blocked, hide-live-badge, rectangle-profile.
- [ ] 필요한 실제 화면에서 각 OFF/ON 및 기본 복원 확인. 오래된 선택자 불일치는 현행 DOM으로 제한 수정하고 해당 소비 동작의 regression을 작성.
- [x] right-sidebar/static-logo/rectangle-profile/hide-live-badge와 VOD chat-resize/chat-font-size/left-chat 후보. native CSS15/15, 가능한 현행 DOM A/B·복원; 실제 옵션 조합 미완료.
- [x] 사용자 live 왼쪽 채팅 화면 축소59px 재현. native main column과 바깥chat wrapper 관계 확인; 회귀 RED→GREEN16/16. 현재 문서 임시 복구1963px/재생 유지. 영구 후보는 추가 확장 새로고침 후 검사 필요.
- [x] d985 영구 설치본 hotfix 없음/live1963px 확인.VOD left drag353→394/저장/353·null 복원 및 시각/재생 확인.전체 조합 검사는 아직 남음.
- [x] 6bff 설치본 팝업/Gain/미리보기/VOD 편집·복원/SPA mini·채팅 버튼의 제한 수용.상단 탐색·자동 숨김 후보 native25사례 PASS이나 실제1200/1800px 검색 겹침 FAIL.후속 기록의 bounded 배치 승인 게이트에서 중지;전체 스타일 수용으로 간주하지 않음.
- [x] 사용자 승인 후1800px 이상 한 줄 메뉴/native flex 검색·그 미만 기본 사이드바 구현.검색 겹침8FAIL→nativeCSS33PASS,실제7개 폭/우측 조합 및 focus/접힘 검사.PASS 범위는 임시 CSS이며 새 dist의 실제 저장 옵션 등록 검사는 새로고침 후 남음.
- [x] 267d17c 설치본 두 옵션ON 수용:임시 style0/focus-only 표시/5개 viewport 기본·상단 배치 PASS.우측 저장 옵션 조합과 나머지25스타일 전체 수용으로 환산하지 않음.홈 추천 숨김의 제한 설계 승인을 요청했고 전체 화면은 사용자 직접 검사 답변을 기다림.
- [x] 승인된 홈 추천 숨김:exact `/` root marker/current grid CSS/owner cleanup.3 lifecycle RED→GREEN,Node101/nativeCSS36/build/package PASS.실제 임시A/B 일반 추천500.875→0/팔로잉·VOD 보존/원복.새 dist의 실제 옵션·SPA 수용은 확장 새로고침 후 남음.
- [x] 5a4a7b9 설치본 옵션ON/자동 표지/홈→lives 정리/키보드 홈 복귀 재적용 확인.1200px native 재렌더 뒤 two-column modifier 제거로 추천 숨김 FAIL;원인/증거 기록.좁은 화면 보완 설계 승인과 저장 옵션OFF 수용은 남음.전체 스타일 PASS로 합산하지 않음.
- [x] 사용자 승인 후 좁은 화면 CSS 보완:홈 swap/content/direct grid 한정,legacy 보존.2 RED→GREEN+2 보호/제거 characterization,native40/Node101/build/package/hash PASS.실제 source CSS 임시A/B 및2560↔1200 재렌더 보존/원복 확인.새 dist 설치본·저장 옵션OFF 검사에는 수동 확장 새로고침이 필요함.
- [x] 08ef30d 설치본 새로고침 후 임시CSS0/2560↔1200 추천 숨김·두 목록보존/홈→lives→홈 SPA 정리·재적용 수용.저장 옵션OFF는 수동 설정 적용 후 남음.전체 화면은 자동입력 성공 미확인/사용자 직접 결과 대기;시작시각 old targets0/new count 구조 확인·metadata 검증/보완 미완료.
- [x] 저장 추천OFF 실제홈2560/1200 원복과 사용자ON 재복원/reload 수용.사용자 직접 전체화면/Esc 정상 확인(자동입력/모든조합 PASS 아님).현행live openDate adapter와VOD 날짜요소/기존API liveOpenDate 계약검증;시작시각 bounded선택자보완 설계승인 대기.
- [x] 사용자 승인 후 시작시각 currentlive/currentVOD 선택자추가,기존조회/캐시/취소/URL검증/legacy 보존.6RED→GREEN+2보호characterization/전체Node109/nativeCSS40/build/package/hash PASS.새dist 실제hover·표시·route 수용은 수동확장 새로고침후 남음.
- [x] 5c03 설치본actual live/VOD 툴팁/이탈·재진입/route 정리/새동일VOD노드cache조회1회 유지 수용.라이브캡처확인/VOD캡처timeout 보류.현재방송timeMachineActive=false 확인;허용DVR URL과스타일원래상태캡처 요청.모든모드/동일노드다른VOD재사용/전체기능PASS로확대하지 않음.
- [ ] 작은 화면, wide/normal, fullscreen/PIP, SPA/bfcache, 스타일 조합 충돌과 cleanup 검사.
- [x] 사용자 전체 스타일 캡처로 25개 복원 기준(ON10/OFF15/font0) 확보. 현재 설치본 live1963/왼쪽채팅353/시각HH:mm/볼륨표시/사이드바 숨김3과 보존2 확인. 초기 native 미니 상태는 정상 주 플레이어 PASS로 합산하지 않으며 반대 설정/전체 조합은 남음. 타임머신은 사용자 미결제로 허용-DVR 실사용 미검증 제외 조건을 기록;결제/우회 없이 PR에 제한 명시.
- [x] 플레이어 숨김2/볼륨표시 반대 저장값·원래 값 복원 설치본 확인. 현행 VOD 화면채우기 ON/OFF 동일1800×700 h556 FAIL 확정:구형vod selector0/현행wrapper 인라인 max-height 우선. VOD한정 important CSS·legacy/화면모드 보호의 bounded보완 설계 승인 대기;제품 코드 변경/전체플레이어스타일 수용/PR는 아직 하지 않음.

### Task 4: 기여 PR 완료 조건

**Files:** README.md, README-en.md, docs/superpowers/validation/ 및 한글 PR 본문.

- [ ] 항목별 PASS/FAIL/미검증/조건부 지원 증거와 남은 항목을 정리. 모든 요청된 검사/조치 완료 전에 PR을 열지 않는다.
- [ ] 전체 suite·빌드·패키지 검사·설치본 검증·독립 검토·source/dist 일치 확인.
- [x] 현재 후보 전체 브랜치 독립 검토1회 및 한 번의 보완 패스.98개 Node/16개 nativeCSS/11개 native 필터 픽셀 검사 및 build/package PASS.보완 후보 설치본 검사는 새 확장 새로고침 후 남음.검토의 미검증 경계를 전체 수용 PASS로 바꾸지 않음.
- [ ] 포크 브랜치를 push하고 main/upstream 미변경 및 원격 SHA를 확인.
- [ ] 기존 중복 PR/원본 default branch를 읽기 전용 확인 후 Do-hyeon 작업 브랜치→jebibot 원본으로 한글 PR 생성, 이 채팅에 attach. 자동 merge/store 배포 없음.
