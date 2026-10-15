# F01 공개 CI 보완 진행 근거

2026-10-16 / Asia-Seoul. 기존 PR #45의 조사 checkpoint용 기록이다. 구현 완료·새 Native 성공·공개 CI 통과·병합을 뜻하지 않는다.

## 설치형 검사 연결 복구 (Task1)

- 로컬 커밋 `c5d45b8`: published1 / frozen F00의2 / current F01의3을 실제 payload에서 명시 전달한다. F00 전용2를 일괄3으로 바꾸지 않았다.
- fixture의 새 문서 슬롯 초기화·load/request/context 일치와 현재 V3 gainOrigin metadata를 독립 관측한다. 주입 양성/음성 대조는 각 별도 문서에서 실행하고 높은 sequence를 후속 정상 문서로 넘기지 않는다.
- 현재 candidate는 media schema 선택과 무관하게62파일 exact inventory를 검사한다. 일반 전환의 F01 runtime 전체 literal과 frozen F00/published의 구 key 집합을 구분한다.
- 새 공유 모듈의 전이 의존성을 사전검증 CLI의 입력 attestation과 격리 fixture 목록에도 반영했다. 이 누락으로 실패한 최초 전체 회귀도 보존했다.
- 격리 집중96/96, 전체1648개 중1647통과·실패0·기존 비공개 감사 제외1. 9foundation·후보build62/진입자산22·v2.13.3 확인. 실제 설치와 cold/손실은 Task4 필수 후행 검사다.

## 합성 오디오 계측과 CI 집계 (Task2)

- 예약 메서드는 native를 먼저 호출하고 this/인자/반환 identity/원래 throw를 보존한다. 추가 clock 조회·직렬화·PCM복사는 wrapper에 넣지 않았고4096개 사전 할당 버퍼 상한에서도 native 호출은 계속된다.
- U는 wrapper 미설치, T만 `KNIFE_AUDIO_QUALITY_TRACE=1`을 사용한다. 두 모드 모두 master6전환의 양 채널 PCM18창과 호출 전후 frame을 보관한다. Gain12전환의 원래 측정은 유지한다.
- 누락된 오른쪽 채널을0으로 제조하던 기존 capture 경계를 실제 추출 함수에서 RED로 재현하고 거부 검사만 추가했다. 유효 입력의 신호·창·calibration·수치 판정은 바꾸지 않았다.
- exact glue만 역변환한 frozen 본문 hash `6f8338b5c56b2043c33babea9957c3885c76b4be706ec578d300a849b789eee6`와 CLI parser hash를 유지한다. 측정 창/임계값 변경 mutation은 여전히 실패한다.
- 진단은 run당1개·8MiB 이하이며 owned 파일의 기존 경로를 덮어쓰지 않는다. 품질·close·write 동시 실패에서 원래 오류를 유지하고 secondary를 별도 기록한다. Windows 정상 종료3증명과 일반 browser close/disconnection을 구분한다.
- CI는 U1,T1,U2,T2,U3,T3 전부 실행한다. 각 exit와 원래 수치 gate를 다시 검사하고 raw PCM을 기존 summarizeCapture로 재계산해 보고서와 exact 비교한다. exit0/자료 없음·다른source·잘림·요약 불일치도 실패다.
- artifact는 해당 실행의 정확한 report/diagnostic12경로만7일 보관한다. 오디오 실패가 설치형 독립 게이트를 건너뛰지 않도록 package 성공 조건을 명시했다.
- 집중56/56, 격리 전체1664개 중1663통과·실패0·기존 제외1, 9foundation·후보build/check 통과. 새 계측 모듈은 strict checkJs와 정적 검사에서 오류/경고0이다.

## 다음 게이트와 제한

- 제품 DSP는 아직 변경하지 않았다. 이전 Linux250Hz ON step 실패는 미해결이다. clock 모델의 dip을 실제 overshoot 원인으로 단정하지 않는다.
- 승인된 기존 PR #45 중간push에서 새 Linux6run을 확보한 후 원인을 판정한다. 미재현/계측 불완전은 해결이 아니라 미확정이다.
- Task4 새 source Native·실제 점검도구·fresh Astra max 최종 검토·최종 공개 CI 전에는 병합하지 않는다. F02 설계는 그 뒤다.
- root dist58/inventory `a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2`, 버전2.13.3·시청 Chrome/P09·기존 증거는 유지한다. 릴리즈·스토어 배포·버전 변경은 하지 않는다.
