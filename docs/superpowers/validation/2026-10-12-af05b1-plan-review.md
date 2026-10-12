# AF05-B1 — 구현 계획 검토 기록

2026-10-12 / Asia-Seoul. [B1 구현 계획](../plans/2026-10-12-af05b1-settings-compatibility.md). **계획·기존 근거 확인만 수행했으며 B1 구현은 아직 없다.**

## 확인한 근거

- 문서 기준main `570735138a5a9caffac1aa9ad08b280b06b858b1`. 초기 계획commit `b140eb39f01e7ff0c0dd9faa350ab6437815c871`.
- Node24.19.0에서 `node --test tests/settings-contract.test.cjs tests/settings-broker.test.cjs tests/background.test.cjs`:45/45, failure/skip/cancel0. 기존literal 기대값과 오류 순서를 확인한 검사다. 게시소스/현재소스를 전환하는 새B1 검사의PASS가 아니다.
- 고정 게시 commit의 raw Git blob 4개와 원본 제출 ZIP entry를 읽기 전용으로 비교했다. style-schema/settings-contract/settings-broker는 byte/hash 일치. config는 Git5506 bytes/LF254/CRLF0와 ZIP5716 bytes/LF254/CRLF210으로 달랐다. 계획의 정확한3개 line ranges만 복원하면 byte까지 일치한다. 전역 개행 변환은 틀린 hash여서 채택하지 않았다.
- 원본 제출 ZIP SHA-256 `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`.
- 복원 root dist58개 파일의 정렬된`[relativePath,sha256]`목록(JSON) SHA-256 `d01bd672ff9bb9ffab808099432129b9429f5baa2fbf256e612531e358086c60`. 정렬은 Node `localeCompare`를 사용했고 같은 환경에서 전후 비교한다. 개별 파일/ZIP 연결 근거와 혼동하지 않는다.
- frozen P02 baseline SHA-256 `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`; warning ledger `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401`.
- package/manifest/lock top-level·lock packages[""].version·dist manifest은 모두2.13.3. version_name도 원래 값을 유지했다.

## 독립 계획 검토

Astra max는 초기 계획 commit과 연결된 실제 settings fixture·contract/broker/background·CI를 읽기 전용으로 한 번 검토했다. 최초 결과는 **Critical0·Important3·Minor0, 보완 전 계획 승인 권고 불가**다. 출처4파일과config EOL 복원은 독립 대조했다. 전체suite/build/CI·설치·스토어 조작은 실행하지 않았다.

1. 예약된style invalidation은`await boot` gap 동안pending request/active boundary가0이 될 수 있다. reviewer의RAM 진단에서즉시교대/DOM.close 뒤에도퇴역worker가read1·CSS get1을실행했다. 주실행자는마지막작업 이후 안정화된settle epoch를versioned switch가실제강제하고`invalidate→즉시switch` 거부/퇴역API 호출0을요구하도록계획을보완했다. 제품idle API나새scheduler는추가하지않는다.
2. 기존range test는후보CONFIGS에서입력을생성하므로previewVolume.max100→101 변화가통과했다. 주실행자는고정게시schema hash·모든config/style descriptor 비교·게시범위에서만입력생성·101허용변형negative를추가했다. 게시config25개/style group7개projection hash는`b5b80219c2554520640d060c73e1d9de4ce7670637fe22d9338c58d8528ca823`이며읽기전용으로확인했다.
3. 저장뒤write-result/response를지연시키는검사는실제실패검사가아니다. reviewer는write-result 실패에서stored=false/stage write라도raw revision4→5/field보존, response 실패에서는undefined여도같은저장결과를확인했다. 주실행자는두버전에실제fail·다음patch merge/revision6·pending계수해제·settle뒤교대성공의literal oracle를추가했다.

보완은 **주 실행자의 문서 수정이며 수정 후 독립 재검토0건 판정이 아니다**. 신규B1 검사RED/GREEN은아직실행하지않았다. negative void set 자체가비결정적이라고판정할근거는없어새blocker를만들지않았고, 실패원인을실제seeded field 손실로특정하도록보완했다.

검토 보류 항목의 처리: 신규B1 구현/원격fetch 성공은구현후게이트에남긴다. background/구UI/전체58파일/실제worker·내구저장은B2/native에서검사한다. 실제update/rollback과과거경로미검증수용은별도승인대기다. 제품전체보안/정책인증·frozen 역사감사의정확성은이계획검토의결론이아니다.

## 승인과 미검사 범위

- 사용자 B1 구현 계획·실행 방식 승인은 대기다. Native+최종 Astra max whole-branch 검토를 권장한다.
- AF05-B written-spec의 과거2.13.2 업데이트 미검증 수용·플랫폼 rollback 완료 기준 변경은 별도 승인 대기다. B1 승인만으로 수용하지 않는다.
- 새 reader/fixture/compatibility test·CI fetch 변경·제품 build·실제 background/구 UI·전체58파일 전환·native preflight·스토어 제출/게시·실제 업데이트/rollback은 이번 계획 작성에서 실행하지 않았다.
- 제품 전체 보안/정책 인증이 아니며 새 GPT 보안 scan은 실행하지 않았다. P09/AF05-B와 F00–F05 동결 상태는 유지한다.
