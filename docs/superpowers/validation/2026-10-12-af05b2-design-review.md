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
- 이번 두 문서의 동시 작성은 사용자의 명시적 요청이다. written spec/계획/Native 구현 승인을 받은 것으로 처리하지 않는다.

## 독립 검토

Astra max가 `b38ec388784ec8f32007401d42a8439dddffd0de..60057709975cdd1952c770db29fa28fcdc1acc4d`의 두 문서·PLANS·상위 spec·연결된 실제 코드를 **한 번, 읽기 전용**으로 공격적 검토했다. 최초 판정은 **Critical0·Important3·Minor1, 보완 전 구현 승인 불가**다. 테스트·build·브라우저·다운로드·프로필·스토어를 실행/변경하지 않았다. 제품 보안 scan·정책 인증이 아니라 검증 설계의 거짓 양성·값 손실 은폐·동일성/수명/범위 오류에 대한 검토다.

검토자는 기존 ZIP을 메모리에서 독립 대조해201802bytes/58files/raw599793bytes/max359160bytes와두digest 일치를확인했다. valid revision8→11→14·legacy 변환·UI ID/brightness step·CSS 순서/font 공식이실제소스와맞는것도확인했다. 이 출처/소스 확인은신규reader/실제전환PASS가아니다.

| 지적 | 원인·소스 근거 | 주 실행자 보완 |
| --- | --- | --- |
| Important1 / 손상 MAIN oracle | reviewed spec71·plan77/89. 원본 config getConfig는config/styleParameters만읽고revision을검증하지않음; web/main과MAIN은정상config를받음 | raw 불변/UI repair-required/쓰기disabled/CSS없음과 **MAIN ready/normalized known config**를분리. 제품을틀린oracle에맞춰변경하지않음 |
| Important2 / negative bootstrap | reviewed spec89·plan101. background 전체를async remove.then으로감싸면importScripts와listener등록이늦어지며저장손실대신기동/프로토콜실패가될수있음. 실제Chromium race 재현은안함 | background 불변, candidate broker initialize queued callback의첫read직전에await remove 한줄만삽입. marker exact1·mutated broker hash/function·remove실패거부 명시 |
| Important3 / detached browser | reviewed spec95·plan97/101. Playwright1.62.1 coreBundle의Unix detached:true와별도browserPid group kill; harness의worker발견실패close오류삼킴은runner exit만으로해결안됨 | launch-intent/parent ACK→harness→정상close-success. 미확인launch는cleanup-unconfirmed/nonzero·affected root보존·다음phase/control PASS 금지. detached descendant/부분launch/ACK전exit 실제Node subprocess반례 배정 |
| Minor4 / 실패관측 handoff | reviewed plan48/75/97/99. phase는throw하지만parent가필요로하는candidate-init stage/raw손실전달계약이없음 | TransitionFailure에case/phase/step/stage/code/이미관측한snapshot·cleanupErrors를정의하고IPC전달. stage candidate-init/new/startup/valid-ui·own config실제삭제·관측누락/틀린stage거부를같은Task2/3에추가 |

Minor4는style polish가아니라negative 증거전달의구체적계약누락이므로주실행자는이번계획에서필수보완했다. 새task/runner/framework를추가하지않았다. 검토중제안한두방향(awaited broker insertion/fail-closed보존)에대해검토자는현재단일검토의범위에서방향이문제를해결한다고응답했지만, **수정된전체문서를독립재검토한0건판정은아니다**.

추가권고반영: 초기seed 전에원본popup ready/get-snapshot의읽기전용fence와raw 빈값재확인; 첫fixture tab ID를두번째page 생성전에취득; startup은값일치wait가아닌기본ready→actual관측→oracle여서손실이timeout으로숨지않도록했다. 지적/권고는현재원본·후보config/bridge/broker/harness에대조한후수정했다.

Service-worker bootstrap 근거는 [Chrome synchronous listener 안내](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers#register_listeners_synchronously)와 [Service Worker importScripts 규칙](https://w3c.github.io/ServiceWorker/#importscripts)이다. 실제기동/실패단계/정리의성립은구현후검증한다.

## 검토에서 판단하지 않은 영역의 처리

1. 실제5case/내구저장/ID/UI동기화/CSS/reload: B2 구현후 실제설치gate에남긴다.
2. 실제loss control/변형broker의실패단계: 새positive와별도negative 실험전에는PASS 아님.
3. 실제timeout/process종료/ACK/cleanup/후발보고실패/Windows호환성: Node subprocess fault와실제browser gate를분리; 종료미확인은보존/실패다.
4. 미래reader/cache/redirect/deadline/상한/Buffer독립성: Task1의실제RED/GREEN 전에는출처확인만완료다.
5. build재현성/전체Node/audio/package/tool audit/CI기간·결과: 기존gate와신규runner 모두구현후실행한다.
6. 현재remote release/스토어/PR상태: 검토자는조회하지않았다. 주실행자의이번공개release size/digest API확인과독립local ZIP검사를구분한다.
7. native/CRX서명/스토어ID연속성/열린old content script/플랫폼rollback: B2 밖의미완료게이트로유지한다.
8. 실행중private profile보존: 이번에는접근하지않았으며실제보존은구현의소유경계/cleanup검사로확인한다.
9. 제품전체보안·개인정보/정책인증·역사근거정확성·다른기능동일성: 이품질설계검토의결론으로확대하지않는다.
10. 수정후문서: 주실행자보완·링크/상태/명령/언어/diff 자체검증이다. 독립0건이나새실행PASS로표시하지않는다.

## 남은 승인·실행

B2 spec·계획·새 bundled fixture 프로필/시험 T/R·UI seed와실제손실control/owned cleanup·실행 방식·구현 후 최종 Astra max 검토의 묶음승인이 남는다. 종료미확인시root보존·private시험browser 수동종료필요가능성도승인범위의한계다. Native를권장하지만승인없이실행하지않는다. 상위 AF05-B의 과거 미검증 수용·플랫폼rollback 완료 기준/native preflight·버전·스토어/실제 update·F00 동결은 별도다.
