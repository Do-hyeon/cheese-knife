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
