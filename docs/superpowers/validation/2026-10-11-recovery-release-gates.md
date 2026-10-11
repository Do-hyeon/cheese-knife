# 복구판의 최신 검증 근거와 출시 게이트

2026-10-11 / Asia-Seoul. 실행 기준은 [PLANS.md](../../../PLANS.md)다. 이 문서는 P01의 근거 통합, P02의 정적 경계 보완, P04 환경 종료, P05 기능 보완과 P06 설치 수용 결과다. 정의한 로컬·설치 게이트의 완료를 기록하지만 제품 전체 무결함·모든 취약점 부재나 모든 실행 환경의 정상 동작을 뜻하지 않는다.

## 기준과 근거 재사용

브랜치 `codex/sidebar-preview-followup`의 제품·설치 산출물 기준 커밋은 `c82841ae703e5286309fb403397fce8787876045`, manifest/package 버전은 `2.13.3`이다. 이후 문서 정합성 커밋은 제품·패키지 파일을 바꾸지 않는다. 소스·분리 후보·root `dist`·Chrome 설치본·스토어 게시본을 서로 다른 대상으로 기록한다.

최신 scanner의 입력 파일 해시와 현재 입력이 일치한다. 기준선의 75행은 각각 기능 RED→GREEN과 이전/현재 해시를 가진 `remediated` 후속 행으로 연결했고, 공용 소유 파일 경계의 실제 시스템 호출 7행은 `guarded-boundary`로 남겼다. `open/new`는 0이지만 이 분류는 취약점 없음 판정이 아니다. 입력 범위는 소유 JS/MJS·package/lock·검사 설정이며 HTML·manifest·tests·vendor 전체의 보안 검증을 포함하지 않는다.

P02 독립 검토 조치와 원장 내구성 검사까지 포함한 당시 HLS 제외 일반 회귀는 474/474였다. 이후 승인된 P03 결정론적 검증과 독립 검토 보완은 별도 격리 경로에서 97/97 전용 검사와 HLS 포함 전체 회귀 586/586을 통과했다. 인증 성인 미리보기와 HLS TAP 파서 보완 뒤 588/588, 무효 컨텍스트 회귀 뒤 589/589를 거쳐, 오디오 전환·헤드룸과 라벨 정합성까지 포함한 제품 기준 커밋의 최신 전체 검사는 605/605, 실패·취소·skip 0이다.

최종 분리 후보 `output/tool-audit/p02-candidate-fitplayerlabel20261011a/chrome-candidate/dist`는 버전 2.13.3, 58개 파일·20개 진입 참조 자원이며 package check를 통과했다. 후보와 root `dist`는 상대 경로와 SHA-256 기준 58/58 일치한다. `web/main.js` 소스·후보·root dist SHA-256은 `4387c2bbe1689e9637de266e1d2e2f1ae56d3ceae2403339307fca9bd1c66efe`, `web/preview.js`는 `8faf50fa6bb9765997db2e4de3c507ffbe89e64b624eca89bf2d4b4e050a6c8c`로 각각 일치한다. 사용자가 이 root `dist`를 Chrome에서 새로고침하고 새 라벨 표시와 기존 체크 상태 보존을 확인했다.

이번 대조 원본은 private `output/tool-audit/recovery-backlog/evidence-baseline-2026-10-11.json`에 보존했다. 최종 ZIP은 아직 없으며, 이번 승인 범위는 공개 소스 push와 PR까지다. 병합·태그·GitHub 릴리즈·스토어 교체는 별도 게이트다.

| 대상 | SHA-256 / 의미 |
| --- | --- |
| 소스·후보·root `web/main.js` | `4387c2bbe1689e9637de266e1d2e2f1ae56d3ceae2403339307fca9bd1c66efe` — 무효 컨텍스트 API 호출 방지 포함 |
| 후보·root `web/preview.js` | `8faf50fa6bb9765997db2e4de3c507ffbe89e64b624eca89bf2d4b4e050a6c8c` — 인증 성인 응답의 조건부 HLS 준비 포함 |
| 후보·root `manifest.json` | `afc29067403d4ef7f05a266141459c7a70fc84e86024d72aa009e30e64f0e04d` |
| 소스 패키지 검사기 | `1642d9f6e0613823be8326952a66e9812fa9d7f0f75ff2440315ecb4181fe99b` — P02 최종 audit 입력 |
| HLS 보호 번들 | `0317fbe50587ee7b46e734112ff9ceab96914ff87a0f695f9350214afa9cea92` — parser-bounds-v2 두 격리 재생성·보호 후보·새 격리 Chrome 후보가 일치, P03 경계 검증 완료 |
| 후보·root `vendor/hls.light.private.js` | `0317fbe50587ee7b46e734112ff9ceab96914ff87a0f695f9350214afa9cea92` — parser-bounds-v2 보호 번들과 일치 |

파일시스템의 dist 해시만으로 Chrome이 읽은 파일을 증명할 수는 없다. 따라서 58/58 파일 대조와 별도로 사용자의 확장·페이지 새로고침 및 설치본 동작 확인을 기록하며, 이 수용 결과도 모든 방송·GPU·네트워크 조합의 보증으로 확대하지 않는다.

## 기능별 남은 조건

근거: [기여 검증](2026-10-08-contribution-readiness.md), [사이드바 후속](2026-10-10-sidebar-preview-followup.md), [미리보기 두 창](2026-10-11-preview-startup-and-two-windows.md), [설정과 두 창](2026-10-11-multi-window-settings.md). 과거 문서의 Firefox 검사·이전 기능·구형 테스트 수는 당시 이력이다. 복구판은 현재 Chrome 전용이다.

| 작업 ID / 기능 | 변경 범위·자동 근거 | 실제 관찰/사용자 확인 | 남은 조건 / 담당 |
| --- | --- | --- | --- |
| P05 / 사이드바 미리보기 | 사이드바 외 확장 preview 제거, 요청 취소·복구·시작 제한·초기 상한·볼륨·음소거 시작 옵션. 인증 성인 API 응답에 HTTPS HLS가 있을 때만 준비하며 주소 없음은 thumbnail-only/limited | 두 창의 약 74초 재생·프레임 증가, 한쪽 종료 뒤 다른 영상 지속. 사용자 즉시 소리·정상 음질 확인 | 동일 후보에서 이선생 hover 영상·소리 확인. 계정/나이/DRM/권한 우회는 하지 않음. HLS 경계는 P03 별도 |
| P05 / 팔로잉 목록 | 모드/옵션 epoch, 버튼 교체와 지연된 native 접기 상태, bounded 자동 클릭·모드 안정 관찰 | 당시 설치본의 reload 2회와 넓음→좁음 4회에서 자동 click 1회·반복 왕복 미관찰, 수동 접기 후 자동 click 0회 | 같은 최종 설치본에서 넓음↔좁음·수동 접기·reload/SPA 반복. 과거 검토의 단계별 한계를 현재 전체 정상 근거로 합산하지 않음 |
| P05 / 컴프레서·Gain | 문서별 graph, ON/OFF·지연 resume·영상 재사용·dry/wet·Gain 평활화 계약. Chromium 정수/capped pre-delay와 0.9→0.98 soft ceiling을 추가했고 12개 sample-rate 정렬·18개 전환·극단 headroom gate를 통과. Gain UI 48px/8px | Chrome 155가 소스·후보·root `dist`를 각각 직접 실행. 네 진입 파일 SHA-256 동일, 개별 품질 실패 0, 안정 수치 비교 실패 0. 실제 방송은 재생·설정·재로딩·로그 통합만 관찰 | 사용자 청취는 보조 기록이며 합격 근거가 아님. AudioWorklet look-ahead는 별도 F01이며 모든 콘텐츠·장치의 최적 음질을 보증하지 않음 |
| P05 / 탐색·길게 누르기 | 유효 TimeRanges·입력 제외·cancel·속도/정지 복원 계약 | VOD ±5초·hold·원복의 기존 실제 사례 | 유료 live DVR은 현재 계정에서 불가. 권한 없는 방송의 탐색 불가를 결함으로 오인하거나 우회하지 않음 |
| P05 / 팝업·채널 채팅 | iframe 생성/이동/닫기·frame 독립·정확한 채널 route | 기존 640×360 생성/드래그/닫기, 채널 이동 사례 | 같은 후보의 iframe/주영상 소유권·활성 방송 채팅 연결. embed 제외 범위를 새 권한으로 자동 확대하지 않음 |
| P05 / 채팅·후원·삭제 | 크기/시각/폰트·재사용 행·후원 filter·제한된 삭제 표시/원복 계약. 객체 복사·최종 검증 중 늦은 외부 writer 교체 4종도 보존 | 후원 숨김 정상 사용자 보고, 삭제 표시 ready→원래 OFF/끔 복원 | 자연 삭제 본문/표지·취소·외부 writer 실제 사건은 미검증. 클린봇·과거 원문·VOD 삭제 복구를 주장하지 않음 |
| P05 / 스타일·필터 | 25개 스타일의 자동 계약, native CSS/영상 pixels의 시점별 검사 | 원래 ON10/OFF15/font0 복원, 미션 펼침 숨김, 전체화면/Esc 정상 보고 | 실제 파티/차단 대상 부재. 모든 GPU·viewport·PIP·특수 행 조합의 정상 보장 아님 |
| P05 / 플레이어 영역 채우기 | 기존 fit-player의 VOD 예약 높이/일반↔넓은 화면 배치 보완 | 일반 높이 556→640, 넓은 700 유지의 과거 사례 | 영상 확대/왜곡 기능이 아니라 남는 플레이어 영역 배치용 스타일. 저장 키 `fit-player`는 호환성을 위해 유지. 같은 후보의 모드/PIP 통합은 P06 |
| P05 / 통계·시작 시각 | 표준 해상도·측정 FPS, 확인된 adapter 값/시작 시각, 없는 값은 unknown | 실제 해상도/FPS/코덱·live/VOD 시각의 기본 사례 | 비트레이트/서버 기준 지연은 검증한 값 없으면 알 수 없음. 임의 수치 생성 금지 |
| P05 / 전역 설정·다중 창 | broker/client 구현됨. 변경 필드 병합, 늦은 이벤트/ack·timeout·CSS 등록·원래 탭 reload 계약 | 설정 화면 동기화, 원래 방송 탭만 적용, font0 복원. 실제 두 창 재생·한쪽 종료 | 실제 worker 재시작·CSS 등록 지연과 reload 경쟁·숨은 BFCache 중 다른 창 변경. 자동 계약과 실측 분리 |
| P06 / 종료 오류 | 기존 catch는 Chrome 오류 기록을 막지 못함을 실제 screenshot의 2개 오류와 두 API 정리 호출로 좁혔다. 유효 `runtime.id`에서만 Chrome listener를 제거하고 DOM 정리는 항상 수행. 무효 컨텍스트 API 호출 0을 요구한 RED→GREEN, 집중 28/28·전체 589/589 | 새 후보 설치·재로딩 뒤 사용자가 확장 오류 화면에서 재발하지 않음을 확인 | 확인한 reload/update 경로 밖의 모든 Chrome 수명 전환을 보증하지 않음 |
| P04 / 패키지 | 일반 파일·내부 링크 검사, 실제 junction/file symlink, Chrome-only/MV3. Chrome121 격리 프로필 | WSL actual file symlink는 정확한 링크 오류로 거부. Chrome 121.0.6167.184에서 MV3 worker1·configReady·live route·controls·page error0. 최종 후보 package v2.13.3/20자원과 설치 수용 통과 | 안정된 트리 검사이며 전체 트리·동시 파일 교체의 원자적 보장은 아님 |

## 네 게이트는 별도 판정

| 게이트 | 현재 상태 | 통과에 필요한 근거 |
| --- | --- | --- |
| P03 / HLS | DONE-LOCAL | 독립 기능 검토 Important 8건을 TDD 보완. `p03finalfix20261011a` complete-pass/exit 0, 전용 97/97·전체 586/586, 두 격리 생성·보호 후보 일치, root `dist` 불변. HLS 전체 보안·실제 재생 합격은 아님 |
| P02 / 도구 경고 | DONE-LOCAL | 기준선 75행 remediated, 공용 경계 7행 guarded-boundary, open/new 0. 최종 audit 종료1을 유지하며 G-SEC·취약점 없음 판정을 대신하지 않음 |
| P06 / 설치본 | PASS | `audioheadroomfinal20261011a`의 객관 오디오·실제 설치 통합을 통과했다. 이후 라벨만 갱신한 `fitplayerlabel20261011a`와 root `dist` 58/58, package v2.13.3/20자원, 전체 회귀 종료0을 확인했고, 사용자가 새 `dist`의 `플레이어 영역 채우기` 표시와 기존 체크 상태 보존을 확인했다 |
| G-REL / 공개 | DOING | 소스·최종 후보·root `dist` 동일성, fork `main`/열린 PR/공개 릴리즈와 스토어 게시본을 읽기 전용으로 재확인했다. 사용자가 공개 소스 commit·push·한글 PR을 승인했으며 병합·태그·릴리즈·스토어 교체는 제외했다 |

P01·P02·P03·P04와 정의된 G-SEC 범위는 DONE-LOCAL이다. P06의 무효 컨텍스트 오류는 자동·설치 재현을 통과했다. 컴프레서 전환의 250/750Hz dip과 극단 설정 full-scale 초과는 Chrome 155에서 소스·최종 격리 후보·root `dist`를 각각 직접 계측해 해결을 확인했다. 세 대상의 네 진입 파일 해시는 같고 개별 품질 실패와 안정 수치 비교 실패는 모두 0건이다. 전체 605/605, Astra max 최종 Critical/Important/Minor 0을 통과했다. 실제 방송 검사는 설치 통합 상태를 확인하며 사용자 청취는 품질 합격 근거가 아니다. 기존 root `dist`는 `p06-pre-audio-headroom-dist-20261011a`에 보존했고 최종 후보를 58/58 동일하게 승격해 package v2.13.3/20자원 검사를 통과했다.

2026-10-11 읽기 전용 G-REL 확인에서 fork `main`은 `d5f268d84fa64b6fffbdf2c309235476fc89e6e7`, 열린 PR은 0건, 기존 GitHub 릴리즈는 prerelease `v2.13.2-community.1`이었다. 공개 Chrome 웹 스토어는 `2.13.2 community recovery preview`, 업데이트일 2026-10-09였다. 공개 설명은 해결 전 오디오 결함과 Firefox 미검증 문구를 아직 포함하고 사용 안내가 과거 브랜치를 가리키므로, 향후 별도 승인된 2.13.3 교체 시 객관 계측 결과·Chrome 전용 범위·`main` 문서 링크로 함께 갱신해야 한다. 현재 단계는 제품 기준 커밋과 문서 정합성 커밋을 push하고 한글 PR을 여는 것이며, 스토어 교체는 포함하지 않는다.

같은 날 `화면 채우기`를 기능에 맞는 `플레이어 영역 채우기`, 영문 `Fill player area`로 바꿨다. 저장 키 `fit-player`, 기본 상태와 `styles/fit-player.css`는 변경하지 않았다. 기존 라벨을 잡는 RED 2건을 확인한 뒤 한국어·영어 UI 11/11, 전체 회귀 종료 코드 0, 격리 후보 `fitplayerlabel20261011a`와 root `dist` 58/58, package v2.13.3/20자원을 확인했다. 사용자가 새 설치본의 표시와 기존 체크 상태 보존을 확인해 P06을 다시 PASS로 닫았다.

최신 complete audit `output/tool-audit/run-2026-10-11T11-56-19-063Z-hNcJoa/summary.json`은 npm 0, Gitleaks 현재 파일·Git 이력 각각 0, ESLint guarded 7행, open/new 0, 입력 전후 해시 일치, 전체 종료1이다. 경고가 남았으므로 clean scan으로 부르지 않는다. 오디오 산출물 비교는 private `output/audio-quality/artifact-comparison.json`, 오디오 보완 근거는 `output/tool-audit/recovery-backlog/audio-transition-headroom-2026-10-11.json`, 최신 환경·성인 미리보기·종료 보완 근거는 `output/tool-audit/recovery-backlog/p04-environment-and-adult-preview-2026-10-11.json`에 있다.
