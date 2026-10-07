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
- [ ] 재현된 각 결함은 RED→minimal fix→전체 suite GREEN→실제 설치본 검사. 내부 데이터가 없으면 명시적으로 미검증/지원 제한, PR 완료 조건 미충족으로 남긴다.

### Task 3: 스타일 전체 매트릭스

**Files:** styles.js, styles.css, styles/*.css, web/main.css, 관련 DOM 회귀 tests 및 검증 기록.

**Interfaces:** STYLES의 25개 항목을 해당 화면과 연결하고 사용자 저장 설정을 보존한다. 실제 설정 UI 접근이 불가할 경우 모듈/임시 CSS 검사는 별도 수준으로 기록한다.

- [ ] player: fit-player, volume-percentage, hide-ff, hide-comp.
- [ ] chat: chat-resize, chat-font-size, chat-timestamp, hide-ranking, hide-mission, left-chat.
- [ ] sidebar: hide-offline, hide-recommended, hide-schedule, hide-sidebar-partner, hide-shortcut, right-sidebar.
- [ ] toolbar: static-logo, hide-topics, hide-studio, auto-hide-toolbar.
- [ ] home/explore/misc: hide-recommended-live, top-explore, hide-blocked, hide-live-badge, rectangle-profile.
- [ ] 필요한 실제 화면에서 각 OFF/ON 및 기본 복원 확인. 오래된 선택자 불일치는 현행 DOM으로 제한 수정하고 해당 소비 동작의 regression을 작성.
- [ ] 작은 화면, wide/normal, fullscreen/PIP, SPA/bfcache, 스타일 조합 충돌과 cleanup 검사.

### Task 4: 기여 PR 완료 조건

**Files:** README.md, README-en.md, docs/superpowers/validation/ 및 한글 PR 본문.

- [ ] 항목별 PASS/FAIL/미검증/조건부 지원 증거와 남은 항목을 정리. 모든 요청된 검사/조치 완료 전에 PR을 열지 않는다.
- [ ] 전체 suite·빌드·패키지 검사·설치본 검증·독립 검토·source/dist 일치 확인.
- [ ] 포크 브랜치를 push하고 main/upstream 미변경 및 원격 SHA를 확인.
- [ ] 기존 중복 PR/원본 default branch를 읽기 전용 확인 후 Do-hyeon 작업 브랜치→jebibot 원본으로 한글 PR 생성, 이 채팅에 attach. 자동 merge/store 배포 없음.
