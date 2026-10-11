# 최종 설치본 수용 체크리스트

2026-10-11 / P05 준비 완료. **아래 항목은 아직 실행하지 않았다.** [출시 게이트](2026-10-11-recovery-release-gates.md)의 G-SEC와 최종 버전 확정 뒤 P06에서 사용한다. 기존 실제 사례를 반복 승인받는 목록이 아니라 **새 산출물의 변경 영향**을 검사하기 위한 목록이다.

## 시작 조건과 기록

- [ ] G-SEC 완료 근거와 최종 source commit/snapshot, Chrome 버전, manifest/package/lock 버전이 기록됐다.
- [ ] 검증 후보의 파일 목록·SHA-256과 설치 대상 폴더가 확정됐다. 실제 로드 해시를 못 읽으면 파일 해시/경로/사용자 reload 확인/관찰을 따로 기록한다.
- [ ] 기존 dist, 원래 설정·스타일·font·Gain·preview volume/mute·화면 모드·메인 소리를 기록/보존했다. 사용자 기존 시청 탭과 새 검사용 탭을 구별했다.
- [ ] 필요한 확장 새로고침을 수행했다. 직접 불가능하면 **이 단계에서만** 요청하고 답을 기다린다. 답변/관찰 전에 필요한 탭을 닫지 않는다.

각 결과는 PASS/FAIL/UNVERIFIED/LIMITED와 `대상 산출물 / 날짜 / 환경 / 자동·관찰·사용자 확인 / 복원 / 증거`로 남긴다. 기능 ready, 대상 0, 광고 재생, 저장값 변경만으로 실제 기능 PASS를 만들지 않는다.

## 검사 묶음

| ID | 환경·동작 | 합격 기준 / 미검증 처리 |
| --- | --- | --- |
| I01 | 일반 live와 VOD 시작·광고 전후·같은 player의 media/controls 교체 | 주영상 재생/소리 유지, 버튼 하나, 광고를 본 방송 기능 성공으로 계산하지 않음 |
| I02 | 넓은 화면 켜기/끄기 5회, 접힌/펼친 팔로잉, manual 접기 후 모드·reload·SPA | 목록이 반복 왕복하지 않고 자동 설정과 manual 의도를 보존. 버튼/epoch/상태 관찰; 기준 회수보다 안정화 근거가 중요 |
| I03 | sidebar hover·빠른 이탈·채널 전환·OFF | 설정 지연 뒤 표시/영상 시간 증가, 늦은 응답이 재생하지 않음. 홈 등 native 미리보기는 그대로이고 확장 video는 sidebar만 생성 |
| I04 | preview volume 0/5/50/100, 소리 있는 시작 ON/OFF, 새 프로필의 실제 autoplay 거부 | media volume/muted·시간·프레임과 청취를 분리. 거부 시 음소거 fallback/명시 조작 안내, 무한 재시도 없음. 고의 보안정책 완화 안 함 |
| I05 | 초기 해상도·화질 전환·제한 방송/네트워크 오류 | 설정된 시작 정책·더 낮은 기존 상한·표시 크기 자동 변경 유지. 정해진 시간/방송만 관찰했다면 전체 무중단 보장 안 함. 보호된 HLS 후보 검증으로 확대하지 않음 |
| I06 | compressor OFF/ON/Gain, 영상 교체·모드 전환·한 창 종료 | 다른 창/주video mute·volume을 바꾸지 않음, 중복 출력/무음 없음. 합성 default/stress 결과와 방송 청취 구분 |
| I07 | VOD 방향키/hold·빠른 release·cancel·IME/input/slider 입력 | 한 번에 ±5초, 입력 무간섭, 원래 rate/paused 복원. 유료 live DVR 없는 상태는 LIMITED로 기록, 결제/권한 우회 없음 |
| I08 | popup iframe 생성·이동·닫기, 채널 chat 버튼, fullscreen/Esc·PIP | 자기 소유 video/포인터 정리, 다른 재생 유지. 실제 활성 채팅을 보지 못하면 route 이동만 통과로 기록 |
| I09 | 채팅 크기·시각·font·왼쪽 배치, 후원 숨김, 자연 삭제/취소 | 실제 원문·타입/행 재사용과 UI를 구분. 삭제 사건 부재는 UNVERIFIED, 역사 복구/원문 추정/모더레이션 생성 안 함 |
| I10 | fit-player/기본 스타일·필터 중립/변경, 미션/파티/차단 | fit-player는 배치용임을 확인. native video pipeline·채팅/정상 카드 보존. 실제 파티/차단 없으면 자동 fixture와 구분 |
| I11 | 통계·시작 시각·route 변경 | 표준/검증값만 표시, 미확인 bitrate/latency unknown, overlay/timer 중복 없음 |
| I12 | 두 설정 화면의 서로 다른 필드 입력·CSS 저장/적용·다른 활성 창 | 두 값 남고 화면 수렴, 원래 캡처 탭만 reload. 다른 방송 창에 자동 reload를 요구하지 않음. 이미 확인한 동일 조건은 재사용 |
| I13 | 실제 worker 중지/재시작 뒤 snapshot·저장·CSS 조정 | revision/값 보존, 저장 여부 불명은 오류 표시·최신 읽기, 자동 재전송으로 옛 의도 덮지 않음. 자동 fixture만이면 UNVERIFIED |
| I14 | 실제 BFCache A 동안 B에서 설정 변경 후 뒤로 복원 | 실제 BackForwardCacheRestore와 최신값을 확인. BFCache가 안 되면 일반 reload와 혼동하지 않음 |
| I15 | 동시에 보이는 두 탭/두 창 재생·preview·Gain·한쪽 이탈/종료 | 두 미디어의 실제 시간/프레임 진행, 한쪽 정리가 다른 쪽을 멈추지 않음. focus 보정/hidden/표본 간격 한계 기록 |
| I16 | extension reload/update 후 옛 문서의 pagehide, 이후 정상 문서 | 과거 Chrome 오류를 보존/구분하고 새 `Extension context invalidated.` 누적 여부 확인. 예상 예외만 처리, 다른 실제 오류 숨기지 않음 |
| I17 | Chrome121 또는 지원 최소 환경, 실제 file symlink 환경 | metadata 숫자·junction을 실제 최소 버전/file symlink 통과로 대체하지 않음. 지원 조건 변경은 별도 결정 |
| I18 | 새 프로필의 권한 거절→재시도→허용, 옛 wildcard `styles` 등록이 있는 업데이트 | 거절/예외 시 안내 화면과 재시도 유지, 자동 grant/페이지 reload/설정 변경 없음. 허용 뒤 소유한 등록만 HTTPS로 갱신하고 live/VOD/API/미리보기·원래 탭 스타일이 정상. 등록 성공 표시와 실제 페이지 적용을 별도로 확인하고, 권한을 다시 제거하면 등록이 남더라도 주입이 차단되는지 확인. foreign 등록과 다른 탭 보존 |

## 사용자 요청과 복원

직접 불가능한 extension reload·설정 화면·창 배치·청취만 묶어 요청한다. 청취는 **먼저 들어본 뒤 답변**하도록 하고, 답변 중 커서 이동이 필요하면 관찰을 종료/고정한 뒤 답하게 한다. 메인 소리 임시 변경은 제한 시간과 복원 근거를 기록한다. 실제 이벤트가 없는 기능은 계속 사용자에게 같은 질문을 반복하지 않는다.

- [ ] 변경한 설정·font·Gain·preview volume/mute·모드·메인 소리를 기록한 원래 값으로 복원했다.
- [ ] 진단 timer/listener를 정리하고 **검사에 만든 탭만** 닫았다. 사용자 기존 탭은 유지했다.
- [ ] FAIL/UNVERIFIED의 필요 조치·담당 ID를 PLANS.md에 남겼다. 최신 후보가 바뀌면 영향받는 항목만 다시 준비하고 전체 합격 주장을 철회한다.
