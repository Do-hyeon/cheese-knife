# DT01-B — 상세 구현 계획 검토

작성일: 2026-10-13 / Asia-Seoul. 이번 변경은 계획·승인 상태 문서뿐이다.

## 기준과 확인

- 기준 main `b1b7b70980c30e25aafa0c87d5b2e92f643f422e`. 사용자2026-10-13 written-spec 승인.
- [승인된 설계](../specs/2026-10-12-dt01b-quality-report-contract-design.md), [상세 구현 계획](../plans/2026-10-13-dt01b-quality-report-contracts.md).
- 실제 gate·수치 타입·CLI import/capture/report/throw/finally·기존 checker/test·audit inventory와 두 순차 task를 대조했다. 정적 검사·raw 호환·내부 any control·CLI 연결·격리 전체 게이트를 별도 수용 항목으로 계획했다.
- 현재 기존2파일 audio-tools strict exit0/진단0, filesystem-free metrics14/14·실패0/skip0을 확인했다. 새4파일 checker·fixture·compiler proof·typed 구현을 실행한 것은 아니다.
- 원본 ZIP/frozen baseline/원장 SHA256은 각각 `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`, `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`, `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401`과 일치했다. root dist와 제품 버전·protected branch/profile도 최종 전후 대조 대상으로 유지한다.

## 계획의 자체 대조

- 설계의 정상/부분/raw 경계·국소 Math.max/peak 예외·array any 누수를 Task1에 연결했다. 실제 CLI import와 기존 감사·순서/격리 실행은 Task2다.
- raw factory는 위치별 독립 channel/envelope를 만들며 baseline 기대값을 candidate로 재생성하지 않는다. metadata는 변수에 담아 structural 추가 필드 허용을 확인한다.
- node_modules 물리 복사·고정 Git baseline·실제 candidate 경로를 구체화했다. 원래 P02 증거의 역사 hash 실패를 skip 옵션/원장 갱신으로 감추지 않는다.
- Native 순차 구현과 마지막 fresh Astra max1회를 권장하되 이번 설계 승인만으로 구현/실행 승인을 전용하지 않는다.

## Astra max 공격적 계획 검토

고정된 계획 checkpoint에 단일 fresh Astra max read-only 검토를 요청한다. 현재 검토 대기이며 등급0건/실행 가능 판정을 미리 주장하지 않는다. 실제 결과·코드 대조·주 실행자 보완·제외 범위 판단을 이 절에 기록한다.

## 남은 게이트

- 계획·Native 실행 범위 사용자 승인 뒤에만 source/test/config 수정·clone/browser/도구 실행.
- 실제 compiler proof·raw golden·비용·전체 회귀·합성/installed·최종 구현 검토·공개 CI/통합은 미완료.
- CLI 생산자 전체 strict·모든 오류 경로 browser 재실행·DT01-C/S·NUM01·native 공개 수용·보안 인증은 이번 계획으로 완료되지 않는다.
- 문서 PR/CI는 구현의 성공이나 출시 승인이 아니다. B2 구현·기능 동결은 유지한다.
