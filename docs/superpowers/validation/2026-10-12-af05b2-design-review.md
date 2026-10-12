# AF05-B2 — 상세 설계·구현 계획 검토 기록

2026-10-12 / Asia-Seoul. 이번 요청은 [상세 설계](../specs/2026-10-12-af05b2-installed-transition-design.md)·[구현 계획](../plans/2026-10-12-af05b2-installed-transition.md) 작성, Astra max 공격적 검토와 PLANS 반영이다. 코드 구현·설치·제품 버전·스토어 변경은 하지 않았다.

## 읽기 전용 근거·자체 대조

- 기준 main `b38ec388784ec8f32007401d42a8439dddffd0de`: B1 PR #36 병합. 원래 코드/프로필/산출물은 그대로다.
- 기존 `verifyCandidate`/`buildChecked`/owned-files/Chromium harness/fixture-router와 실제 원본 background/popup/styles/runtime/bridge를 대조했다. `runBaseInstalledScenario`의 손상 복구 snapshot 재주입은 B2 연속 보존에 사용하지 않는다.
- GitHub 공개 release API에서 원본 ZIP201802bytes·SHA `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`을 재확인했다. 기존 원본을 .NET ZipArchive와 Node Buffer/zlib로 **읽기만** 하여58개·raw599793bytes·method8/flags0·attributes0·최대359160bytes와 고정 offset map을 대조했다. 해제·파일쓰기·설치나 실제 전환 검사를 실행한 것이 아니다.
- ordinal 파일/hash 목록 digest `a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2`, fixed metadata canonical digest `669cc7f64599e748f4d3ec86e45472786cf331e4a0b207914619a03f849a652c`. B1 localeCompare inventory와 별도다.
- spec→Task1 취득/provenance, Task2 case/oracle/실제phase, Task3 수명/positive/control/CI가 연결된다. 기존 test 파일명은 rg로 확인했다. 문서/상태 검증은 수행하지만 신규 runner 테스트의 PASS는 아직 없다.
- 새프로필/코드복사본만 사용하는 제안, sourceCommit/동일ID/전체hash/broker 함수 대조, seed1회/unknown nonce, literal revision/CSS/UI, legacy/손상제한 상태, parent deadline/첫실패/cleanup, private artifact 상한을 명시했다.
- 원본/변형 T/R·물리파일/실제실행·모의/설치/native·코드복귀/스토어rollback의 증거를 구분했다. 일반 archive/배포 엔진·새 dependency·기존 profile 접근은 제외했다.
- 이번 두 문서의 동시 작성은 사용자의 명시적 요청이다. written spec/계획/Native 구현 승인을 받은 것으로 처리하지 않는다. 기존 human 원문 스타일 참고는 최근 GitHub PR36/35/34가 모두 알려진 assistant 작성물이라 사용하지 않았고 한국어/영어의 직접적인 기술 문체를 유지한다.

## 독립 검토

Astra max의 읽기 전용 설계·계획 검토를 요청할 예정이다. 결과가 오기 전 판정/보완/설치 성공을 주장하지 않는다. 제품 보안 scan·정책 인증이 아니라 검증 설계의 거짓 양성·값 손실 은폐·동일성/수명/범위 오류를 검토한다.

## 남은 승인·실행

B2 spec·계획·새 bundled fixture 프로필/시험 T/R·UI seed와실제손실control/owned cleanup·실행 방식·구현 후 최종 Astra max 검토의 묶음승인이 남는다. 상위 AF05-B의 과거 미검증 수용·플랫폼rollback 완료 기준/native preflight·버전·스토어/실제 update·F00 동결은 별도다.
