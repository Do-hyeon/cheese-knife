# F01 공개 CI 후속 조사·설계 검토

초안2026-10-15 / 검토 갱신2026-10-16 / Asia-Seoul. [보완 설계](../specs/2026-10-15-f01-public-ci-follow-up-design.md)의 조사 근거와 독립 검토를 관리한다. 기준 HEAD는 `de082f2916d48f66e1186676ce172a5212fbb617`이다. 이번 단계는 제품/검사 구현이나 새 실제 브라우저 실행이 아니다.

## 최초 CI 근거와 범위

1. [CI38749600904](https://github.com/Do-hyeon/cheese-knife/actions/runs/38749600904): 실제250Hz master ON step 초과. [수치/실패 원본 위치](2026-10-15-f01-pr-preflight.md)를 유지한다.
2. [CI38750712755](https://github.com/Do-hyeon/cheese-knife/actions/runs/38750712755): 같은DSP 오디오 통과, 설치형 base `main-setting-missing` 실패. 후속negative/old-new-old/손실 단계 미실행. 이 결과는 직전 오디오 실패의 해결 증거가 아니다. raw 로그는 `output/f01-pr45-ci-38750712755-failed.log`다.

## 이번 로컬 조사

- `output/f01-ci-clock-probe.cjs`와 JSON: 기존 controller/fixture를 실행해 handshake·ON/state·각3예약을 assert했다. clock 고정일 때 master pair 합1, read당128/48000초 진행 시 OFF 최대1.2666666666666593, ON 최소0.7333333333333407. 실제 PCM·Linux 인과는 미확정이다. 초기 handshake 미완료로 이벤트가 없던 탐색 출력은 성공 근거로 쓰지 않고, 최종 probe는 빈 이벤트를 실패로 거부한다.
- `output/f01-ci-protocol-probe.cjs`와 JSON: 실제 base readiness callback은 owner3/configReady=true/media.ready/arrowSeek=false의 scoped runtime에도false다. 실제 fixture listener는 valid V3를 관측하지 않고 V2 control은 관측한다. 실제 설치 회귀가 아니라 통제된 함수/fixture 실행이다.
- source 조사: base/fixture·공유 transition의 protocol2 전제, 기본 기대 inventory59와 실제candidate62의 불일치를 확인했다. reader가 전체 목록을 exact 비교하므로 **transition-inventory 준비 거부**이며 불완전 payload를 설치한 것은 아니다. 추가3개는 manifest/HTML/worker에서 각각 참조한다. published 원본에는 ownerProtocol이 없고 F00은2·현재F01은3이다. F01 cold의 frozen F00 protocol2를 유지해야 한다.
- runtime config literal, 전환별 역할·payload·fixture 슬롯·stale/replay 양성 대조도 연결 보완 대상이다. 두 readiness 줄만 바꾸어 전체 검사를 수리했다고 간주하지 않는다.

## 독립 설계 검토

fresh `/root/f01_ci_design_astra_max` / `gpt-6-astra` / `max`가 위 설계와 연결 코드의 읽기 전용 공격적 검토를 완료했다. 최초 **Critical0 / Important3 / Minor1**, 필수 보완을 반영한 문서 전체를 같은 reviewer가 다시 읽은 잔여는 **0 / 0 / 0**, 작성 설계의 사용자 확인에 제시 가능 판정이다. 새 독립 reviewer나 구현 최종 검토·Native 성공으로 표기하지 않는다. 검토한 설계 raw SHA-256은 `776947f9dc5f19f78d27776e1bf5bd3bcae32a7b933830fc8d4c459c48b1403a`이며 실제 파일과 일치했다. 보고 요약은 private `output/f01-ci-astra-max-design-review.md`에 보존한다.

| ID | 최초 지적 | 작성자의 확인·문서 보완 | 비용/남은 제한 |
| --- | --- | --- | --- |
| I1 | 계측이 clock/예약을 바꿀 위험 | 기존 wrapper가 native 전에 clock/push/상한throw하는 것을 직접 확인. native-first·고정buffer·별도incomplete·전환밖직렬화·uninstrumented동일PCM/게이트를 명시 | 구현과 실제 비간섭 검증이 추가로 필요. 모델만으로 Linux 인과 확정 금지 |
| I2 | 과거/거부 metadata·높은sequence의 대조 오염 | fixture복원 및 lifecycle의수락sequence전역전진을 직접 확인. 새문서슬롯초기화·현재request/context일치·canonical캡처·양/음성독립문서를 명시 | 새 문서별 handshake검사가 필요하며 제품sequence방어는 바꾸지 않음 |
| I3 | DSP 무수정이면 공용helper의 cold회귀 누락 | 일반transition/F01cold호출과 공개CI미포함을 확인. helper변경만으로도 기본/negative/전환/손실/F01cold필수, DSP변경시에만 수치전량추가로 분리 | fresh helper source의 설치·cold 실행비용을 절감 명목으로 생략하지 않음 |
| M1 | 59개로잘라설치한다는 부정확한inventory설명 | 실제reader가전체목록exact거부함을확인해 transition-inventory 준비실패로정정. 기대62만갱신하고기존참조검사를재사용 | 새 packaging abstraction이나 불완전payload설치 주장을 추가하지 않음 |

기각/판단 제외: retry/허용치완화/기존검사삭제/근거없는browser pin·curve변경은 채택하지 않았다. 실제 Linux 실패 원인·새 계측 구현·Native/전체/공개CI·제품 안전은 아직 판정하지 않았다. 계획 단계에서 Linux 실행 환경·계측 선택·사전 고정 반복 목록/산출물 이름을 구체화해야 한다.

- [x] 사용자 후속 조사·보완 설계·Astra max 검토 승인.
- [x] CI/실제 코드·일회성 clock/fixture 조사와 사실/가설 분리.
- [x] 한글 보완 설계 초안·자체 범위/모순 점검.
- [x] Astra max 최초0/3/1·필수 설계 보완·동일 reviewer 잔여0/0/0·검토 hash·판단/비용 기록.
- [ ] 작성된 설계에 대한 사용자 확인 후 상세 구현 계획/Native 실행 범위 확정.
- [ ] 구현·새 source Native·공개 CI 검증. 현재 미실행이며 아직 해결되지 않았다.

최종 문서 검증: 로컬 링크34개 누락0·한글/영문/UTF-8·`git diff --check`·검토 spec hash 일치·보호 불변을 확인했다. 문서/일회성 probe만 바뀌었으므로 전체 제품 회귀나 Native를 반복 실행한 것으로 세지 않는다. 기존 step/dip/peak·frozen calibration/수치,버전2.13.3·rootdist58/inventory `a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2`·시청 Chrome/P09는 불변이다. 새 의존성·권한·보호소스/실방송 취득·브라우저 설정 변경은 하지 않았다. 이번 문서와 조사만으로 push·PR·병합·릴리즈·스토어 배포를 추가 실행하지 않는다.
