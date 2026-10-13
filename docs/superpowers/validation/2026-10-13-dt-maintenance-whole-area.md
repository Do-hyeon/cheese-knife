# 독립 유지보수 전체 영역 — 잔여 처리·종합 수용

2026-10-13 / Asia-Seoul. Authority: PLANS.md의 「독립 유지보수 후속 — 테스트·개발 도구 타입 강화」와 사용자의 최신 잔여 작업 재개 지시. 전체 마무리 전 push·PR 생성 금지. PR #41은 취소됐으며 수용 근거로 사용하지 않는다.

## 전체 목록과 실제 경계

| 항목 | 현재 근거와 잔여 처리 | 최종 수용 범위 |
| --- | --- | --- |
| DT00 | main에 PR #26/merge4ed37a3; helper·bridge·정상/raw consumer·오용5종 | 기존 actual helper/생성 JS 검사·strict 개발 graph를 전체 회귀로 유지 |
| DT01-A | main에 PR #29/merge7c66ad1; 순수 signal·summary·기존 export identity | 실제 수치/summary/alias·CLI/감사 연결과 정상/raw 수치 경계 유지 |
| DT01-B | main에 PR #40/merge9b8640f; 정상 report·partial/raw gate·실제 CLI | 기존 오용20/내부5·독립 oracle·nullable/full/partial 구분 유지 |
| DT01-C | 현 브랜치; artifact core·actual reader·부분 비교·6파일 checker | raw46/외부18/내부9·오류/해시/경로·실제 감사/entry 연결 재확인 |
| DT01-S | 현 브랜치; actual fixture와 생성 client consumer·13파일 checker | 외부18/내부25·callback/clone/lastError·raw unknown·기존10 consumer 유지 |
| NUM01 | 현 브랜치; 두 finite-positive guard와 RED/GREEN | rate/window 오류 우선순위·정상 계산/기본값/범위/buffer·alias 유지 |
| DT02 | 이전 사용자 승인한 조건부 보류 | native 구현 미완료를 유지하고 재검토 조건·비용·경계 누락 위험을 최종 확인 |

DT02는 JSDoc 중복/가독성 문제가 실제로 확인되고 실제 import type graph,
discovery/lint/parser/snapshot/provenance/strict/runtime 보존이 함께 설계될 때
선택 파일만 다시 검토한다. CJS→CTS 단순 rename은 기존 require 계약 검사를
잃을 수 있다. 이번 전체 수용은 native 전환 구현 완료·영구 제외·언어 비율
목표가 아니다. 전체 provider/CLI/HLS 가족·기존 consumer 전면 typing도 별도다.

설계/계획 단계의 「구현 미검증」 표시는 당시 기록이다. 해당 후속 실제
구현/검토 근거와 대조해 처리하며, 과거 finding 수치를 독립0건으로 바꾸지
않는다. S 설명 Minor는 교정됐고 NUM01은 실제 보완/검증된 코드다. 조기
영역 종료 판단은 철회됐으며 아래 종합 수용이 끝나기 전 재사용하지 않는다.

## 순차 잔여 작업과 기대 결과

1. 전체 목록·설계/계획/최종 검토·CI/호출자 대조: 남은 항목을 자동 제외하지
   않고 실제 완료/미완료/승인된 보류로 구분. DT02의 최종 처리는 보류이지 구현 아님.
2. 고정 코드의 전체 회귀·foundation·candidate/package·silent synthetic audio·
   disposable bundled-Chromium installed positive/negative 재검증. 원본 dist/
   시청 Chrome/P09 프로필/ZIP/동결 기록/보호 브랜치는 건드리지 않음.
3. fresh Astra max 한 명이 DT00/A/B의 main 기반과 C/S/NUM01을 연결해 전체
   작업영역의 실제 계약/호출자/검사·누락·검토 보완을 공격적으로 검토한다.
   리뷰어는 read-only, 자식 없음. 새 보안 스캔/배포/native 수용으로 확대하지 않음.
4. blocker는 실제 코드·RED/GREEN·회귀로 보완. 개별 Minor와 declined 범위는
   사유·비용을 기록한다. 코드가 바뀌면 해당 게이트를 다시 실행한다.
5. 전체 목록과 종합 근거가 정리된 후에만 영역 전체의 로컬 마무리를 표시.
   전체 범위·검증·DT02/미구현을 묶은 한글 PR 한 건의 안내안을 준비한다.
   공개 CI·push·PR 생성·병합은 로컬 마무리와 구분하고 미리 완료로 표시하지 않음.

## 현재 실행 상태

범위/DT02의 주 실행자 대조 완료; fresh 전체 리뷰와 검증은 아직 미완료다.
DT00/A/B의 main merge 이력은 실제 Git으로 확인했다. 기존 Node24.19.0/설치된
고정 dependencies와 현재 feature checkout을 재사용한다. 기존 격리 복사본의
217개 기술 파일 Git blob은 현재 코드와 동일하다. 물리적 byte 대조의 첫 실패는
5개 파일의 Git checkout CRLF 차이였고 그 외 차이는 없다. byte 동일 PASS로
바꾸지 않고 실제 clone 형태를 실행 검증하며 문서/HEAD provenance는 별도 기록한다.
새 설치·사용자
Chrome 변경·외부 모델/registry 전송·push·PR 생성·병합은 하지 않는다.
공개 CI 수용은 후속 종합 PR의 마지막 head 기준이며, 취소된 PR CI로 대체하지 않는다.
