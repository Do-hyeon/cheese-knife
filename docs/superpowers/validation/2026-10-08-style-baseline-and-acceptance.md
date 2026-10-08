# 스타일 복원 기준 및 설치본 검사

날짜: 2026-10-08. 제품 기준: `5c03f5c`, 문서 기준: `2829c3b`.

## 복원 기준

사용자가 첨부한 두 스타일 설정 이미지에서 25개 항목을 확인했다. ON 10개, OFF 15개이며 글꼴 숫자는 0이다. 아래 값은 이후 임시 설정 검사의 복원 기준이지 제품 기본값이 아니다. 이미지 자체와 개인 브라우저 자료는 저장소에 추가하지 않는다.

| 그룹 | 설정 키 | 화면 표시 | 원래 값 |
| --- | --- | --- | --- |
| 플레이어 | fit-player | 화면 채우기 | OFF |
| 플레이어 | volume-percentage | 볼륨 퍼센트 표시 | ON |
| 플레이어 | hide-ff | 빨리 감기 버튼 숨기기 | OFF |
| 플레이어 | hide-comp | 오디오 컴프레서 버튼 숨기기 | OFF |
| 채팅 | chat-resize | 채팅창 크기 조절 | ON |
| 채팅 | chat-font-size | 폰트 크기 조절 | OFF / 0 |
| 채팅 | chat-timestamp | 타임스탬프 표시 | ON |
| 채팅 | hide-ranking | 주간 랭킹 숨기기 | OFF |
| 채팅 | hide-mission | 진행 중인 미션 및 파티 숨기기 | OFF |
| 채팅 | left-chat | 왼쪽 배치 | ON |
| 사이드바 | hide-offline | 방송 중이 아닌 채널 숨기기 | OFF |
| 사이드바 | hide-recommended | 인기 카테고리 숨기기 | ON |
| 사이드바 | hide-schedule | 다가오는 방송 일정 숨기기 | OFF |
| 사이드바 | hide-sidebar-partner | 파트너 스트리머 숨기기 | ON |
| 사이드바 | hide-shortcut | 서비스 바로가기 숨기기 | ON |
| 사이드바 | right-sidebar | 오른쪽 배치 | OFF |
| 툴바 | static-logo | 정적 로고 | OFF |
| 툴바 | hide-topics | 주제 탭 숨기기 | OFF |
| 툴바 | hide-studio | 스튜디오 버튼 숨기기 | OFF |
| 툴바 | auto-hide-toolbar | 자동 숨기기 | ON |
| 홈 | hide-recommended-live | 추천 방송 숨기기 | ON |
| 탐색 | top-explore | 사이드바 메뉴 툴바에 표시 | ON |
| 탐색 | hide-blocked | 차단한 유저 방송 숨기기 | OFF |
| 기타 | hide-live-badge | 생방송 뱃지 숨기기 | OFF |
| 기타 | rectangle-profile | 사각 프로필 이미지 | OFF |

## 현재 저장 설정의 설치본 관찰

사용자 시청 탭 대신 동일한 연결 Chrome의 별도 라이브 탭에서 검사했다. 저장소/계정/사용자 탭은 변경하지 않았다. 임시 CSS 노드는 0이었다.

- 첫 로드에서 native `miniplayer` 클래스와 353px 플레이어를 관찰했다. 문서 스크롤은 0이고 원래 플레이어 wrapper는 1963px였다. 원인은 확정하지 않았으며 정상 주 플레이어 검사로 합산하지 않았다. 허용된 CDP는 문서 응답 대기 중 사용할 수 없었고 다른 제어 경로로 우회하지 않았다.
- 별도 검사 탭을 정상 재로딩한 뒤 `miniplayer=false`, 주 플레이어 폭 1963px, 왼쪽 채팅 x=240/폭=353px를 확인했다. 59px로 축소된 이전 결함은 이 관찰에서 재현되지 않았다. 모든 모드/초기 로드의 성공을 의미하지 않는다.
- 크기 조절 CSS 변수는 1, handle은 1개였다. 이번 턴에서는 실제 드래그를 하지 않았다. 이전 VOD 드래그 수용과 이번 live의 handle 존재를 구분한다.
- 시각 CSS 변수는 1이고, 실제 메시지 3개의 `data-timestamp`가 HH:mm 형식이며 `::before` 내용과 일치했다. 최초 검사에서 HH:mm:ss로 가정한 format probe는 false였으나 실제 문자열은 HH:mm였다. 제품 오류로 취급하거나 형식을 변경하지 않았다. 채팅 본문/작성자는 기록하지 않았다.
- 볼륨 slider의 `aria-valuetext`와 `::before` 내용이 모두 `100 퍼센트`였다. hide-ff/hide-comp OFF에서 해당 소유 제어가 모두 `display:flex`였다. 반대 설정 수용은 아직 남아 있다.
- native 사이드바 nav는 6개였다. 실제 제목을 제한적으로 확인하여 인기 카테고리/파트너 스트리머/서비스 바로가기만 `display:none`, 팔로잉 채널/다가오는 방송 일정은 `display:block`임을 확인했다. 섹션 수가 바뀌는 경우의 positional selector 안전성을 증명하지 않는다.
- 헤더 y=-45px로 자동 숨김이 적용되어 있었다. focus/hover와 responsive 조합은 기존 툴바 보고서의 제한 수용에 해당하며 이번 관찰로 전체 조합을 추가 수용하지 않는다.
- 최종 주 영상은 readyState=4/playing이었다. 검사 탭은 닫았다. 제품 코드/빌드/저장 설정 변경은 없었다.

## 타임머신 및 다음 검사 경계

사용자가 미결제 상태 때문에 타임머신을 사용할 수 없다고 설명했다. 추가 결제나 우회를 요구하지 않고, 허용 DVR의 실제 탐색 성공 사례는 환경 조건으로 **실사용 미검증** 처리한다. VOD에서 이미 확인한 방향키 성공과 혼동하지 않는다. PR에 해당 제한을 명시해야 하며, 이 제외는 다른 미완료 기능/스타일 검사를 생략하거나 지금 PR을 여는 승인이 아니다.

다음 수동 UI 적용 묶음은 플레이어 4개만 반전한다: 화면 채우기 ON, 볼륨 퍼센트 OFF, 빨리 감기 숨기기 ON, 컴프레서 숨기기 ON. 나머지 21개는 위 기준을 유지한다. 실제 설정 화면 접근은 여전히 도구 정책상 불가하므로 사용자 적용 후 검사하고, 이후 위 원래 값으로 복원한다. 페이지 적용용 새로고침만 필요하며 제품을 바꾸지 않았으므로 확장 자체 새로고침은 필요하지 않다.

전체 기능/스타일 수용 및 기여 PR은 아직 완료하지 않았다.

## 플레이어 반대 설정 적용 후 검사

사용자가 위 4개 설정 적용 완료를 알린 뒤, 별도 live/VOD 탭을 만들었다. 최초 live 대기와 정상 reload 직후에도 native `.pzp-pc`/video가 없어서 소유 버튼 대기가 실패했다. 그 상태의 player 진단은 false이고 채팅/설정 bridge는 존재했다. 문서 응답 대기 중 CDP 제한을 다시 확인했으며 다른 제어 경로로 우회하지 않았다. 이후 live/VOD 모두 native player/video가 생성된 것을 확인했다. 초기 timeout을 제품 결함 또는 성공으로 바꾸지 않았고, 제품 코드는 수정하지 않았다.

| 설정 | 실제 설치본 결과 | 경계 |
| --- | --- | --- |
| hide-ff ON | live 버튼 `display:none`, 크기 0×0 | VOD에는 원래 해당 live 버튼이 없어 VOD 숨김 PASS로 합산하지 않음 |
| hide-comp ON | live/VOD 컴프레서 컨테이너 `display:none`, 크기 0×0 | UI 숨김이며 오디오 graph 상태를 변경하거나 DSP 검증으로 합산하지 않음 |
| volume-percentage OFF | live/VOD slider `::before=none`, native aria값 `100 퍼센트` 보존 | 저장 UI 반대 설정 기본 수용. 원래 ON 복원 확인은 아직 남음 |
| fit-player ON | live 현행 `_player_` max-height=1245px(1305−60), 주 player=1963×1104.75 | 적용값 관찰이지 모든 화면/모드에서 실제 공간 증가 PASS가 아님 |

VOD의 현행 `_player_` max-height는 `calc(100% - 84px)`였다. 1800×700의 실제 VOD viewport에서 container 폭1545/높이556, player 폭1189/높이556이었다. native 높이 제한이 남아 있어 화면 채우기 효과는 **판정 보류**한다. 원래 fit-player OFF로 돌린 동일 조건을 비교해야 선택자/우선순위 결함인지 판별할 수 있다. ON이라는 이유로 실제 채우기 성공을 주장하거나 현재 근거만으로 CSS를 수정하지 않는다.

같은 resize 호출 직후 live의 첫 읽기는 이전2560×1305 값이었으므로 live1800×700 검사로 합산하지 않았다. override reset 이후 live2560×1305와 VOD2560×1249의 기본 viewport를 확인했다. 두 탭의 기본 창 높이가 다르므로 동일 높이 비교로 취급하지 않는다. live/VOD의 주 영상은 readyState4/playing으로 시간이 증가했고 임시CSS는0이었다. native 초기 autoplay/mute 값은 검사자가 바꾸지 않았다.

하단의 채팅 제외 screenshot 요청은 `Page.captureScreenshot`5000ms timeout이었다. 저장된 성공 이미지가 없으며 다른 전송 방식으로 반복하지 않았다. 검사 탭을 모두 닫았고 사용자 탭/저장소/제품/build는 변경하지 않았다.

다음 단계는 플레이어 원래 값(화면 채우기OFF/볼륨 표시ON/빨리 감기 숨김OFF/컴프레서 숨김OFF)의 수동 복원과 실제 재검사다. 이 확인 전에는 플레이어 스타일 전체 수용/설정 복원 완료를 선언하지 않는다.

## 복원 확인 및 VOD 화면 채우기 결함 확정

사용자가 원래 4개 값으로 복원/페이지 적용 완료를 알렸다. 별도 VOD에서 컴프레서 `display:flex`, 볼륨 `::before="100 퍼센트"`를 확인했다. 별도 live는 다시 native player가 생기기 전 timeout이어서 이 관찰로 복원 성공을 주장하지 않았다. 대신 현재 목록에서 기존 사용자 live 탭을 정확한 URL/ID로 확인하고 **읽기 전용** DOM 검사만 수행했다. 해당 실제 player 폭1963px/빨리 감기flex/컴프레서flex/볼륨 `100 퍼센트`가 복원되어 있었다. 사용자 탭을 reload/탐색/클릭/음량 조절하지 않았으며 시청을 변경하지 않았다.

동일 VOD `/video/15573896`, 동일 viewport1800×700에서 OFF도 container1545×556/player1189×556/max-height `calc(100% - 84px)`였다. 앞선 ON과 값이 같으므로 현행 VOD의 화면 채우기는 **FAIL**이다. 라이브 화면 채우기 전체 모드는 별도이며, 이 결함을 전 기능 장애로 확대하지 않는다.

허용된 동일 VOD 탭의 DOM/CSS 진단으로 해당 DIV의 높이 제한이 **인라인 style**임을 확인했다. 기존 `[class^="vod_player__"]` 대상은0개이고 현재 `#player_layout.type_vod` 대상은1개다. 일반 `_player_` rule은 non-important이므로 인라인 max-height를 넘지 못한다. 기존 VOD important rule은 구형 선택자라 현행 요소에 적용되지 않는다. CSS 진단은 root depth0/정확한 player query/높이 속성만 사용했으며 전체 문서/개인 내용/React 객체/네트워크 payload를 기록하지 않았다.

이 제한된 결함의 in-chat 보완 설계는 **사용자 승인 대기**다: `styles/fit-player.css`의 legacy 규칙을 유지하고, `#layout-body` 내부에서 `#player_layout.type_vod`를 실제 포함하는 현행 `_player_` wrapper에만 `max-height:100% !important`를 추가한다. native fullscreen이 활성인 wrapper는 새 override에서 제외하고, live/iframe popup/foreign layout은 새 규칙에 매치하지 않도록 한다. 영상 크롭·속도·음량·설정 저장·권한·JS는 바꾸지 않는다. 인라인 제한을 가진 현행 VOD fixture에서 실패를 먼저 확인하고, legacy/live/foreign/fullscreen 보호와 CSS 제거 복원, 실제 낮은 높이 ON/OFF/wide/normal 검사를 수행할 예정이다. 이 구체안 승인 전 제품/검사 코드를 쓰거나 임시 후보 CSS를 적용하지 않았다.

뷰포트 override는 reset했고 기본 VOD2560×1249를 다시 확인했다. 허용된 CSS/DOM 진단 도메인은 disable하고 검사 탭은 닫았다. 이번에 확인한 원래 설정 복원은 플레이어4개에 해당하며 나머지 스타일을 변경하거나 전체25개를 재검증한 결과가 아니다. PR은 아직 열지 않았다.

## 승인된 VOD 화면 채우기 보완 후보

사용자가 위 bounded 설계를 승인했다. `styles/fit-player.css`에 현행 VOD override 한 규칙만 추가했다. HTML root/자손 어디든 fullscreen 상태가 있으면 새 규칙을 제외하고, root 안의 `#layout-body`/현행 `_player_`/`#player_layout.type_vod`를 모두 요구하며 `.knife-popup` 내부는 제외한다. legacy와 기존 live 규칙은 그대로 유지했다. 설정 키/JS/속도/음량/권한/의존성은 바꾸지 않았다.

`scripts/check-styles.mjs`의 실제 Chrome CSS 검사에 9개를 추가했다. 현재 VOD normal/wide의 인라인 제한 회귀 2개와 옵션 제거 복원 1개는 예상한556≠640으로 RED였고, 최소 수정 후 GREEN이었다. legacy/live/foreign/popup/root-fullscreen/player-fullscreen 6개는 기존 보호 characterization PASS이고 후보에서도 PASS다. fullscreen은 synthetic 새 프로필에서 실제 requestFullscreen/exitFullscreen을 사용했으며 설치된 사용자 Chrome의 모든 fullscreen 모드 검증은 아니다. 총49/49 PASS(Chrome155.0.8059.39), 전체 Node109/109 PASS였다.

실제 연결 Chrome의 별도 VOD에서 새 override만 임시 적용해 다음을 확인했다. 전체 source CSS의 설치본 수용과 구분한다.

| 1800×700 VOD | 규칙 OFF | 임시 규칙 ON | 다시 OFF |
| --- | --- | --- | --- |
| 일반 화면 container/player 높이 | 556px | 640px | 556px |
| 넓은 화면 높이 | 700px | 700px | 700px |

native 일반 모드 인라인 `calc(100% - 84px)`를 수정하지 않고 CSS 우선순위로만 넘었다. native 넓은 모드는 인라인 제한이 없어 높이가700px로 같았다. 넓은 모드 전환 직후 native 스크롤/사이드바 애니메이션 중 읽힌 좌표는 안정된 레이아웃 결과로 사용하지 않았다. 일반 모드로 돌린 뒤 실제 양수 scrollTop을 가진 검사 탭의 player/video/section만 상단으로 복원해 player y=15/높이640을 재확인했다. 검사자가 사용자 시청 탭을 조작하지 않았다.

검사 탭에서 중복 오디오를 피하려고 runtime이 선택한 주 video의 원래 muted값(false)을 보존하여 임시 mute했다. 마지막에 false로 복원했고 playing/readyState4/시간 진행/object-fit=contain을 확인했다. 새 override 제거 후556px, 임시CSS0/진단Symbol없음/일반모드/원래 expanded sidebar를 확인하고 탭을 닫았다. viewport reset 직후 읽기는 지연된1189×640였으므로 기본 크기 복원으로 주장하지 않았다. 새 별도 홈 탭에서2560×1305를 확인한 뒤 닫았다.

VOD 캡처는 이번에도 Page.captureScreenshot5000ms timeout으로 성공 이미지가 없다. 보안 정책을 우회하거나 다른 전송 방식을 쓰지 않았으며 실제 visual screenshot 검증은 미확인으로 유지한다.

빌드/패키지 v2.13.2·20 entry resources·diff check PASS. source/dist `fit-player.css` SHA256은 모두 `B2A56D16DC93EDC057BB059F28BDD7DDC39FA7E69AF0F07187C9DE4AF846EE89`다. 로그는 로컬 ignored `output/acceptance/vod-fill-css-red.log`, `vod-fill-css-green.log`, `vod-fill-node.log`에 남겼고 민감 payload는 추가하지 않았다.

아직 실제 저장 옵션 ON을 통한 전체 후보 CSS 등록/일반·넓은 화면/OFF 복원 수용은 남았다. 제품 변경으로 새 dist가 생겼으므로 사용자 확장 새로고침이 반드시 필요하다. 도구 정책상 이를 자율 수행할 수 없어 이 단계에서 중지한다. 기존 저장 설정은 화면 채우기OFF 등 사용자 원래 값 그대로이며, 새로고침 후 ON 테스트와 다시OFF 복원은 다음 단계다. 전체 기능/독립 최종 검토/PR 완료를 선언하지 않는다.

## aa6ad54 새 설치본의 저장 옵션 ON 수용

사용자가 확장을 새로고침하고 화면 채우기ON/페이지 적용 완료를 알렸다. source/dist hash는 위 값 그대로이고 제품 변경은 없었다. 별도 실제 VOD의1800×700 일반 모드에서 인라인 `calc(100% - 84px)`는 그대로이며 computed max-height100%/container와player 높이640px였다. 임시CSS는0개였다. native 넓은 화면으로 전환해700px/임시CSS0, 다시 일반 모드로 돌아와640px를 확인했다. 이는 새 설치본 저장 옵션ON의 기본 수용이다. OFF 복원/모든 화면 조건/visual screenshot 수용은 아직 남아 있다.

새 fullscreen 제외 규칙의 실제 모드 검사를 위해 일반 모드에서 native 전체화면 버튼을 한 번 클릭했으나 `document.fullscreenElement`가 없었다. 따라서 해당 자동 입력은 성공이 아니며 새 설치본 전체화면의 판정은 미확인이다. 이전 사용자의 기본 fullscreen/Esc 직접 PASS와 별도 synthetic native CSS fullscreen 보호 PASS를 유지하되, 이번 실패한 자동 진입을 제품 전체화면 결함 또는 현재 모드 성공으로 단정하지 않는다. 추가 우회 입력/추측 패치를 하지 않았다.

별도 검사 주video의 원래 muted=false를 보존해 임시true로 검사하고 끝에false로 복원했다. native 모드 전환이 변경한 검사 탭의 player/video/section scrollTop만 상단으로 돌렸다. 마지막 일반모드/비fullscreen/높이640/playing/ready4/시간진행/임시CSS0/진단Symbol없음을 확인한 뒤 닫았다. viewport override를 reset하고 새 별도 홈에서2560×1249를 확인한 뒤 닫았다. 사용자 시청 탭/저장소는 검사자가 변경하지 않았다.

다음 사용자 적용 묶음은 화면 채우기OFF 원복과 채팅6개 검사다. 채팅 크기 조절OFF, 폰트 숫자8, 타임스탬프OFF, 주간 랭킹 숨김ON, 진행 중 미션/파티 숨김ON, 왼쪽 배치OFF;나머지는 복원 기준 그대로다. 폰트 항목 checkbox는 disabled이고 숫자를 움직이면 자동 선택되므로 checkbox를 직접 켜라고 요구하지 않는다. 이후 실제font/handle/시각/배치/랭킹·미션 존재를 확인하고 채팅 원래 값(크기ON/font0/시각ON/랭킹OFF/미션OFF/왼쪽ON)으로 복원한다. 미션 이벤트가 없는 경우0개를 숨김 성공으로 표시하지 않는다. 제품을 바꾸지 않아 다음 단계는 확장 자체가 아니라 설정의 페이지 적용만 필요하다. 모든 기능/스타일 및 PR는 여전히 미완료다.

## 채팅 반대 설정 검사 및 배지 크기 결함

사용자가 위 묶음 적용 완료를 알렸다. 기존 사용자 시청 탭을 읽기 전용으로 확인했을 때 이전 문서의font0/14px/왼쪽채팅/handle1/시각ON/랭킹표시가 남아 있었다. 사용자 탭을 reload하거나 설정 저장 실패로 단정하지 않았다. 새 실제live/VOD 문서에는 새font8/설정OFF·ON이 적용되어 있었으므로 현재 설정 검사는 새 문서를 기준으로 했다.

| 항목 | 새 문서 실제 관찰 | 판정 범위 |
| --- | --- | --- |
| VOD 화면 채우기 OFF | 1800×700에서 인라인/계산 max-height `calc(100% - 84px)`/높이556 | 후보 저장ON640→원래OFF556 기본 원복 수용 |
| 채팅 크기 조절 OFF | live/VOD CSS변수없음/handle0 | OFF 기본 수용. live player는 handle 제거분3px만큼 증가해1966px |
| 타임스탬프 OFF | live/VOD 실제 message3개 `::before=none`/data-timestamp없음 | OFF 기본 수용 |
| 왼쪽 배치 OFF | live chat x2207/player x240, VOD1800px chat x1432 | 기본 오른쪽 배치 수용 |
| 폰트8 | live/VOD message·nickname22px | 일반 문자열 크기 수용. 아래 배지 결함으로 전체 글꼴 기능 PASS는 아님 |
| 주간 랭킹 숨김 ON | 실제live 대상1개 displaynone/높이0 | ON 기본 수용 |
| 미션/파티 숨김 ON | 실제live 해당 대상0개 | 이벤트가 없어 UNVERIFIED. 숨김 성공 또는 선택자 결함으로 단정하지 않음 |

VOD 처음 메시지 수0은 데이터가 아직 표시되지 않은 시점이었다. 이후 동일 문서 실제 message19개/본문·nickname22px를 확인했으므로0개를 글꼴 PASS/구조 불일치로 합산하지 않았다. 두 영상은 playing/readyState4/시간진행/임시CSS0이었다. 직접 재생·음량·속도·설정 저장은 바꾸지 않았다. 임시 viewport를 reset하고 별도 홈2560×1249를 확인한 뒤 탭을 닫았다. 채팅 내용/작성자/이미지 원문 URL은 저장하지 않았다.

추가 actuallive 배지 조사는 보완 필요 결함을 확인했다. 현재 일반 message 안의 실제 이미지6개는 제한적인 metadata 분류에서 badgeHint=true/emojiHint=false였다. `width`/`height` attribute는18인데, 현행 chat-font의 일반 image rule `24px+offset`가 important로 적용되어font8에서32×32px였다. 해당 이미지는 `_nickname_` 자손의 `_icon_` 안에 있고 아이콘과 바로 바깥 `_wrapper_`는 여전히18×18px였다. 따라서 닉네임 배지32px가18px 영역을 넘는다. 기존 legacy 배지 규칙의 의도는18px+offset(8일 때26px)이므로, 텍스트22px만으로 글꼴 전체 성공을 선언하지 않는다.

이 조사에서는 exact 채팅 image query/DOM depth0/해당 image의 width·height 규칙만 사용했고 src/alt/title 문자열은 출력하지 않고 분류 boolean만 남겼다. CSS/DOM 진단을 disable하고 추가 검사 탭을 닫았다. 제품/테스트/build/저장 설정을 변경하지 않았다.

**사용자 승인 대기 bounded 보완안:** `styles/chat-font-size.css`에서 실제 chat log/message/nickname/배지 icon 관계에만 배지 image와 icon·직접 외곽 wrapper 크기를18px+offset으로 맞춘다. 일반 이모지24px+offset과 문자열14px+offset, legacy 규칙은 유지한다. 임의 global `_icon_`/`_wrapper_` 요소까지 키우지 않는다. Native fixture에서 offset−6/0/8의 배지12/18/26px·이모지18/24/32px·텍스트8/14/22px 및 foreign/non-badge 경계 검사를 먼저 작성하고 실패→최소 수정→전체 회귀/실제 임시A/B를 수행한다. 승인 전에는 코드를 구현하지 않으며, 새 dist가 생기면 또 필수 수동 확장 새로고침 단계에서 중지한다. 현재 임시 저장값은 위 검사 묶음이고 최종 원래 채팅 값 복원은 보완 검증 후 남아 있다. 전체 기능/PR 조건은 미충족이다.
