# AF05-B — 차기 배포와 설치 수용 설계

2026-10-12 / Asia-Seoul. 상태: **written-spec 검토 대기**. 사용자는 AF05-B 설계·검토 진행을 승인했다. 이 문서 승인과 별도 구현 계획 승인 전에는 제품·버전·설치·스토어를 변경하지 않는다.

## 1. 목적과 범위

현재 공개2.13.3을 유지하면서 완료된 AF 타입·모듈 이행을 별도 상위 버전으로 검증·배포하고 설정 보존 근거를 확보한다. 신규 기능 F00–F05, Firefox, 새 권한·수집·외부 전송, UI 프레임워크, 자동 게시 서비스를 추가하지 않는다.

- 설계 기준 main: `38da1f4fc5fc9f6f363e5b669b2713466ac0dcee`.
- 게시 제품 기준: `fb15f9675f9ea910e98363635155bc4ff9eb1d2f`, version2.13.3, 확장 ID `cgfddiiffponlciljlfbiecmlagflbpe`.
- 원본 ZIP SHA-256: `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`;58파일. 게시 CRX·설치 시 정규화된 파일은 [P09 기록](../validation/2026-10-12-p09-store-publication.md)의 별도 근거다.
- **차기 배포 번호는 미정이며 현재 제품 버전은2.13.3이다.** 앞서 제안한 번호는 완료/출시 선언이 아니었지만, 미완료 단계에서 구체적인 번호를 제시해 혼동을 만들었다. 잔여 설계·구현·로컬 검증과 native 기준값 관찰을 마친 뒤 배포 준비 단계에서 실제 공개/심사/예약 버전보다 높은 번호를 제안하고 별도로 승인받는다. 그 전에는 제품 version을 올리거나 릴리즈/제출 ZIP을 만들지 않는다. 같은2.13.3의 변경 ZIP을 제출하지 않는다.
- 사용자 시험판의 원래 root `dist`, 제출 ZIP, 실제 시청 프로필, 격리 프로필의 native 스토어2.13.3, frozen P02 기준선/원장은 보존한다.

원본/후보의 TypeScript·JS 텍스트가 달라지는 것은 예상된다. 버전·생성 파일 형식 외의 사용자 기능·설정 계약 차이가 발견되면 이를 타입 이전으로 간주하지 않고 원인을 분리해 중지한다.

## 2. 선택안과 승인해야 할 수용 기준

권장안은 **로컬 호환성 → 설치형 전환 → 심사 후 수동 게시 → 실제 스토어 업데이트**다. 기존 builder·owned-files·설치 harness를 재사용한다. 추가 배포 프레임워크나 비공개 별도 스토어 항목은 필요하지 않다.

대안인 별도 시험용 스토어 항목은 ID·저장소가 달라 기존 항목의 업데이트를 증명하지 못한다. 공개2.13.3을 즉시 롤백하는 안은 전체 사용자와 pending 제출에 영향을 주므로 검사 목적으로 선택하지 않는다.

다음은 기존 완료 기준의 **변경 제안**이며 이 문서의 명시적 승인 전에는 적용하지 않는다.

1. 과거 native2.13.2→2.13.3 경로는 설치본 부재로 **미검증 이력**을 보존한다. 과거 경로를 PASS로 바꾸지 않고, 차기 실제2.13.3→후보 버전을 공개 업데이트 합격 대상으로 삼는다. 이 환경 제약의 수용을 사용자가 승인해야 P09 증거 고정을 종료할 수 있다.
2. 롤백 수용은 **같은 격리 프로필·동일 개발용 확장 ID의 설치본에서 이전 코드로 복귀하는 검증**을 출시 전 합격 조건으로 삼는다. 실제 스토어 플랫폼 롤백은 장애 대응 절차로 준비하되, 실행 전까지 **미검증**으로 공개 기록에 남긴다. 이 분리 승인이 없으면 AF05-B 완료를 선언하지 않는다.
3. 이 기준 변경 승인은 실제 게시·계정 조작·플랫폼 롤백 승인이 아니다. F00–F05 동결 해제도 최종 결과 확인 뒤 별도 사용자 결정이다.

승인 뒤 P09의 소유 범위는 게시 ID/version·메일 표시 시각의 한계·ZIP/CRX/설치 파일 연결·native 신규 설치 파일 근거·과거 업데이트 미검증 수용 기록이다. 이 문서의 written-spec 승인 내용과 근거 문서를 연결한 후 P09를 ‘배포 증거 고정 완료’로 닫는다. **차기 실제 업데이트·설정 보존·격리 rollback 결과는 AF05-B가 소유**하며 P09 완료를 그 결과의 선행 조건과 후행 조건으로 동시에 사용하지 않는다. 승인 전 PLANS의 P09 상태와 완료 기준은 유지한다.

## 3. 산출물·경로·도구 경계

- 원본 ZIP은 hash/inventory를 확인한 뒤 새 private 작업 디렉터리에만 해제한다. traversal·duplicate·link·크기 상한을 유지한다. 원본 파일과 현재 root dist에 쓰지 않는다.
- clean CI의 원본은 [고정 공개 릴리즈 ZIP](https://github.com/Do-hyeon/cheese-knife/releases/download/v2.13.3-community.1/cheese-knife-community-recovery-2.13.3-fb15f967.zip)이다. 공개 API에서201802 bytes·위 SHA-256 digest를 재확인했다. 준비 단계에서 HTTPS 다운로드 후 고정 hash를 검사하고 fixture 실행 중에는 네트워크를 닫는다. hash 불일치/자산 부재는 FAIL이며 최신 main이나 다른 ZIP으로 대체하지 않는다. 현재 checkout의 private output 파일을 CI의 선행 조건으로 삼지 않는다.
- 개발·호환성 검사 payload는 현재 제품 version2.13.3을 유지한 immutable AF commit에서 `scripts/verify-candidate.mjs`와 기존 `buildChecked`/패키지 검사로 만든다. 개발·검증을 마친 뒤 공개 배포 번호를 승인받은 경우에만 version 변경 commit에서 최종 공개 후보를 다시 생성·검증한다. builder는 대상 source root의 dist를 지우므로 **후보/임시 복제에서만** 호출한다.
- source SHA, manifest/package version, toolchain/lock 해시, 일반 파일별 SHA-256·inventory, ZIP SHA-256을 한 검증 기록에 연결한다. 두 독립 후보의 파일 해시를 대조한다. 압축 컨테이너의 timestamp 차이를 runtime 재현 실패로 오인하지 않는다.
- `npm version`, 기존 POSIX `postversion`, `publish:chrome`, 기존 Publish workflow의 수동 dispatch는 사용하지 않는다. 개발·검증 완료와 별도 배포 번호 승인 뒤 package.json/version·package-lock.json/version 및 packages[""].version·manifest.json/version_name만 명시적으로 갱신하고 검사한다. upload/publish·공개 태그/릴리즈 생성은 별도 사용자 게이트다.
- 새 스크립트가 필요하면 전환 시나리오용 단일 runner로 한정한다. `owned-files`, `verify-candidate`, `extension-e2e/harness`, fixture-router와 기존 검사기를 사용하며 일반 배포 엔진·임의 경로 CLI를 만들지 않는다.

## 4. 저장 호환성: 실제 두 버전의 경계 대조

`config`, `styles`, `styleParameters`, `settingsRevision`과 legacy `t`/`resizeChat`이 대상이다. defaults·허용 id/범위·정규화·protocol1·revision 증가·초기화 쓰기/삭제·동적 CSS 등록·원래 대상 reload를 확인한다.

실제 게시2.13.3의 `config.js`, `style-schema.js`, `settings-contract.js`, `settings-broker.js`, `background.js`와 후보 생성 JS를 각각 독립 context에서 실행한다. 정적 타입 검사나 새 원본만 실행한 mock 결과로 이전 버전의 동작을 추정하지 않는다. 기존 settings fixture의 저장/event/CSS 모의를 재사용하되 구현 계획에서 로드 입력 경계를 명시한다.

| 입력군 | 확인할 결과 |
| --- | --- |
| 빈 storage | 각 버전의 default snapshot 동일; 예기치 않은 저장/삭제 없음 |
| 비기본 config·style·parameter·revision | 초기화 후 raw 값·UI snapshot 보존, 수정한 필드만 변경 |
| 알 수 없는 config/style/parameter·별도 top-level 키 | 원본 raw 값 보존; UI 노출과 보존을 구분 |
| legacy t=0·t=null·t='invalid'·resizeChat의 truthy/false 값 | 기존 변환/정리 규칙을 고정 기대값으로 검사. own t는 invalid/null에서도 제거되며 config commit이 없는 cleanup도 가능. 유효 migration에 저장 변경이 있으면 commit 뒤 cleanup; 재시작 반복은 no-op |
| 손상 revision·지원하지 않는 비-legacy 값 | 기존 거부/정규화 결과 유지; 손상 revision과 관계없는 raw 키를 초기화/삭제하지 않음. 앞 행의 기존 legacy 정리를 새 보존 규칙으로 바꾸지 않음 |
| CSS 등록 실패·storage 쓰기 실패·다중 화면 경합 | 기존 오류·직렬 쓰기·복구 계약 유지; 성공 응답만으로 내구 저장을 주장하지 않음 |

기대값은 서로 비교하는 두 구현에만 의존하지 않고 기존 고정 테스트의 값·호출 순서로도 대조한다. 한쪽의 같은 버그를 다른 쪽이 공유하면 단순 differential은 통과할 수 있기 때문이다.

유효 seeded 저장소마다 **old 초기화/수정 → new 초기화/수정 → old 재초기화/추가 수정**을 검사한다. 초기화 시점과 의도적 수정 시점의 기대 변경을 분리한다. valid revision은 감소·임의 reset이 없어야 하며 알려지지 않은 값의 손실·migration 반복·CSS/response 오류 은폐가 있으면 후보를 중지한다.

## 5. 격리 설치본 전환·롤백 검증

새 bundled Chromium fixture 프로필과 고정된 개발용 설치 경로 하나를 사용한다. 현재 native 스토어 검사 프로필·시청 프로필·실제 방송/계정은 사용하지 않는다. extension ID는 worker에서 발견해 모든 전환에서 같음을 확인한다. 스토어 ID를 강제로 넣거나 비밀 서명키를 사용하지 않는다.

전환 순서:

1. old2.13.3 payload를 설치하고 worker의 manifest version·ID·popup/MAIN 상태를 확인한다. fixture에서 비기본 config/style/parameter를 UI로 저장하고 raw storage/등록 CSS를 관찰한다.
2. context를 완전히 닫은 후 **동일한 private 설치 경로**의 내용만 AF 검사 payload로 교체한다. 테스트용 복사본의 manifest에만 가상 시험 버전 T를 부여하고 같은 프로필에서 실행 버전 T·ID 동일·저장값 보존·CSS 재등록·페이지 준비를 확인한다. T는 공개 배포 번호가 아니며 생성 규칙은 구현 계획에 고정한다. 저장소의 제품 version은2.13.3 그대로 둔다.
3. 검사 payload UI로 다른 필드를 저장한 뒤 context를 닫고 이전 코드 기반 rollback payload로 교체한다. 로컬 rollback용 manifest에는 T보다 높은 가상 시험 버전 R을 사용하며 원본2.13.3 ZIP은 변경하지 않는다. T/R payload는 스토어에 제출하지 않는다.
4. 같은 프로필에서 이전 코드·동일 ID·후보가 남긴 raw 저장값·UI·CSS·추가 저장·fresh MAIN 기동을 확인한다.

**각 launch 전과 해당 phase context 종료 후**, 고정 설치 디렉터리의 전체 일반 파일 inventory·SHA-256을 그 phase의 기대 payload와 대조한다. old와 rollback의 runtime·CSS·locale·아이콘·라이선스는 frozen old payload와 정확히 같아야 한다. AF 검사 payload의 같은 파일들은 immutable AF 소스의 검증된 payload와 일치해야 한다. 가상 T/R의 예외는 명시한 manifest version/version_name 값만이며 변형 manifest의 기대 object/hash를 따로 고정한다. extra/missing/mixed 파일·link·hash 불일치는 동작 결과를 채택하기 전에 FAIL이다. version/ID 표시만으로 이전 코드를 실제 실행했다고 판정하지 않는다.

profile 복사/초기화, uninstall/reinstall, storage snapshot 재주입으로 정상 전환을 흉내 내지 않는다. ID·저장소가 바뀌면 FAIL이다. context 종료/파일 교체 실패는 전환 실패로 기록하며 성공 보고서로 덮지 않는다. 경로 교체는 fresh 작업 디렉터리의 실제 일반 파일만 허용하며 사용자 폴더는 대상이 아니다.

negative control은 정상 흐름의 실제 설치 경계에서 seeded 설정 하나를 의도적으로 잃는 별도 시험 후보를 실행해 정확한 저장 보존 실패를 요구한다. 현재 positive/MAIN-missing negative E2E와 신규 전환 negative는 별도 게이트다. 원본 후보·정상 프로필은 변형하지 않는다.

positive와 negative는 각각 fresh 소유 작업 디렉터리/프로필을 사용한다. 성공·실패 모두 finally에서 열린 context를 닫고 새 fixture 프로필(Windows bundled Chromium 복사 포함)·해제/교체 디렉터리·후보를 정리한다. 기존 E2E runner의 정리는 harness 자체에 포함돼 있지 않으므로 신규 runner가 이를 명시적으로 소유한다. 첫 실패를 유지하고 cleanup 실패/제한시간 초과는 PASS를 차단한다. 이미 존재하는 경로를 인수하거나 덮지 않으며, 실행당 고정 상한의 summary/실패 trace·screenshot만 private artifact로 남긴다. 별도 native 기준 프로필·원본 ZIP·root dist는 정리하지 않는다.

이 검사는 설치된 unpacked/bundled Chromium의 **코드 전환/복귀** 근거다. Google 배포 CRX의 서명·native 자동 업데이트·확장 in-place reload·열린 이전 content script 정리를 검증한 것으로 표현하지 않는다. 실제 업데이트의 열린 페이지/컨텍스트 오류는 아래 native 수용에서 별도로 확인한다.

## 6. 후보 공개 전 게이트

기존 strict·생성/drift·Node 전체·HLS 재현/경계·패키지·객관 오디오/영상·설치 positive/negative·도구 감사를 유지하고 저장 호환성/설치 전환 검사만 추가한다. 외부 계정·치지직 방송 데이터는 CI fixture에 넣지 않는다.

전체 Node는 private 역사 자료 없는 clean tracked checkout에서 제외 옵션 없이 실행한다. 원래 폴더의 frozen P02 해시 검사 실패는 별도 기록하며 원장 갱신·skip 규칙 확대·현재 증거로 덮기를 하지 않는다. 불안정한 HLS 실행·대상 부재·도구 실패를 PASS 처리하지 않는다.

도구 감사는 후보 commit의 입력 snapshot 전후 일치·원시 종료 코드·관측 목록을 새 private run에 남긴다. 과거 open/new0·guarded7을 현재 값으로 복사하지 않는다. 현재 발견 사항을 원본 코드·기존 경계 근거로 재분류하고 unresolved/new가 있으면 별도 보완 없이 공개하지 않는다. 기존 guarded-boundary 경고는 경고가 남았다는 사실·근거·제외 범위까지 공개 결과에 적으며 clean/무취약 인증으로 부르지 않는다. 도구 기반 검토만 수행하고 새 GPT 보안 scan은 실행하지 않는다.

candidate commit부터 ZIP까지 hash를 연결하고 CI 결과가 그 commit을 검증했는지 확인한다. 검증 후 제품 파일이 달라지면 그 산출물의 게이트를 다시 실행한다. 문서만 바뀌면 링크/상태/diff 검사를 수행한다.

## 7. 실제 Chrome 웹 스토어 제출·게시·업데이트

기존 항목 ID에서 상위 버전 ZIP을 제출한다. 자동 게시를 끄고 심사 통과 후 수동 게시를 권장한다. [공식 업데이트 안내](https://developer.chrome.com/docs/webstore/update)는 상위 버전과 deferred publish를 설명한다. 미공개 심사 상태의 변경이 이미 사용자에게 적용됐다고 표시하지 않는다. 비율 rollout 가능 여부나 검사용 비공개 배포가 제공된다고 가정하지 않는다.

승인은 구분한다: **후보 코드/버전 구현**, **새 검사용 설치/설정 변경**, **스토어 upload/심사 제출**, **심사 후 공개 게시**. 게시 승인은 현재 모든 사용자에게 업데이트가 제공되는 영향과 기존2.13.3·새 ZIP 기준을 함께 제시해 받는다. 계정 로그인·동기화·API credential 저장·원래 시험판 교체를 포함하지 않는다.

승인된 native 격리 프로필의 실제 스토어2.13.3에만 비기본 검사 값을 설정하고 변경 전/후의 값과 종류를 기록한다. 개인정보 없는 fixture 값만 사용한다. 새 설치용 프로필은 업데이트용과 별개로 생성한다.

**스토어 제출·공개 게시의 선행 조건은 성공한 native preflight**다. 승인된 관측 방법을 실제 기존2.13.3에서 한 번 실행해 package/version/ID/from_webstore·실행 manifest version·seeded raw storage·UI 기대값·CSS 상태를 연결해 저장해야 한다. 향후 연결 가능하다는 추정이나 method 이름 확인만으로 충족하지 않는다. raw API snapshot 없이 screenshot/‘정상’ 보고만 있으면 preflight 미완료이며 제출/게시를 대기한다. 이 방법이 확보되지 않으면 로컬 구현·격리 검증까지만 진행한다. native 조회는 해당 테스트 설정 키·검사용 값과 대상 metadata로 좁히고 전체 개인 프로필·쿠키·다른 확장 저장소를 읽거나 공개하지 않는다.

게시 후 실제 CRX/payload·원본 ZIP·Chrome 설치 파일을 대조한다. JSON/아이콘 설치 정규화·외부 metadata는 P09처럼 bytes/내용 근거를 구분한다. native 설치 기록의 from_webstore·같은 ID·version·승인 권한을 좁게 확인하고, worker/UI/API에서 실제 실행 version·설정 snapshot을 관찰할 수 있어야 runtime 수용으로 판정한다.

native2.13.3→후보 업데이트는 기존 설치를 제거하거나 새 설치로 대체하지 않는다. 열린 검사 페이지가 남아 있는 상태의 업데이트, 이후 페이지 reload/fresh startup, 설정 보존·두 화면 병합·원래 대상만 style reload·컨텍스트 오류를 확인한다. 원래 시청 탭과 설정은 변경하지 않는다.

현재 native UI/확장 페이지 연결은 확보되지 않았다. 브라우저 정책상 불가한 URL·CDP 조작을 다른 수단으로 우회하지 않는다. 실행 시 허용된 연결이 없으면 사용자의 직접 조작을 최소한으로 요청하되, 설정 screenshot/보고를 자동 API 비교와 같은 증거로 표시하지 않는다. 객관적인 native runtime/저장 snapshot을 관찰할 수 없으면 그 게이트는 **미검증/대기**로 남기고 구현 계획에서 접근 가능 경로와 승인 요청을 명시한다. 검사용 제어 확장/새 의존성을 자동 설치하지 않는다.

## 8. 플랫폼 롤백 준비와 장애 대응

[공식 롤백 안내](https://developer.chrome.com/docs/webstore/rollback)에 따르면 이전 게시 패키지를 새 버전으로 다시 제공하며 pending/staged 제출이 취소될 수 있다. 저장 데이터 하위 호환성과 로컬 롤백 검증이 선행돼야 한다. 사용자에게 배포되지 않은 임의 Git commit/ZIP을 고르는 일반 업데이트와 다르다.

다음 항목을 장애 대응 기록에 준비한다: 당시 실제 직전 게시 패키지/ID·더 높은 새 버전·이유·pending 제출 상태·저장 호환성 근거·요청 승인·완료 화면·공개 payload/설치본 대조. 반복 rollback이 계속 더 오래된 임의 버전으로 돌아간다고 가정하지 않는다.

검사용으로 공개 항목의 rollback 버튼을 누르지 않는다. 실제 실행은 중대한 배포 회귀가 관찰됐을 때 별도 승인을 받은 경우로 한정한다. 실행하지 않은 플랫폼 롤백은 미검증으로 남긴다. 준비 문서와 격리 rollback PASS를 실제 플랫폼 rollback PASS로 합산하지 않는다.

## 9. 상태·완료·승인 묶음

- [ ] written-spec 사용자 승인: 배포 번호 결정 보류·비목표·과거 업데이트 미검증의 수용·격리 rollback/미실행 플랫폼 rollback 분리.
- [ ] 정확한 파일·fixture·명령·negative control·순차 커밋 단위의 구현 계획 작성/검토와 실행 방식 승인.
- [ ] immutable AF 검사 payload·저장 호환성·격리 설치 전환/복귀·기존 전체 게이트·독립 최종 품질 검토.
- [ ] 기존 native2.13.3의 검사용 설정 조작·관측 승인과 성공한 runtime/seeded 저장 preflight; 미완료면 배포 번호 결정·스토어 제출·게시 대기.
- [ ] 위 개발·검증과 native 기준값 관찰 완료 후 공개 배포 번호 별도 승인; version 변경을 포함한 최종 산출물의 게이트 재실행.
- [ ] 한글 PR·CI·병합과 ZIP/version/hash 고정.
- [ ] 스토어 제출/수동 게시 각각의 승인과 게시 package 대조.
- [ ] 신규 native 검사용 프로필의 실제 설치 승인; 기존 업데이트 기준 프로필은 유지.
- [ ] native 신규 설치·실제2.13.3→후보 업데이트·설정/페이지/오류 수용.
- [ ] 미검증 이력·플랫폼 rollback 미실행·기타 공개 지원 제한을 남긴 최종 결과 사용자 승인.
- [ ] 최종 결과 확인 뒤 F00–F05 동결 해제 여부 사용자 승인.

설계 승인은 위 실행 승인을 일괄 대체하지 않는다. 이미 결정된 구현 내부 작업은 승인된 계획 안에서 순차 실행하며 같은 검사를 사용자에게 반복 요구하지 않는다. 도구 접근이 없어서 증거를 얻지 못한 항목은 DONE으로 바꾸지 않는다.

## 10. 설계 검토 기록

주 실행자 자체 대조: root dist 삭제 위험, 혼합 버전/다른 ID 증거, 모의 저장 재주입, lower-version 롤백, 실제 게시/메일 수신 시각, frozen 감사 덮어쓰기, 검사용 전 사용자 롤백과 제어 연결 부재를 구분했다. 아직 구현·설치·업데이트 PASS를 선언한 문서는 아니다.

Astra max는 `38da1f4..78250d0`와 연결된 builder/harness/settings/P09 문서를 읽기 전용으로 검토했다. 최초 결과는 **Critical0·Important3·Minor2, Important 보완 전 written-spec 승인 불가**였다. 지적은 제품 취약점 발견이나 보안 scan 결과가 아니다.

- Important1: 현재 native 연결 부재에서 baseline 없이 공개될 여지 → 실제2.13.3 API/seeded storage preflight를 제출/게시의 선행 조건으로 고정했다.
- Important2: manifest만 바꾼 mixed rollback이 통과할 여지 → 모든 phase launch 전/종료 후 전체 payload inventory/hash와 제한된 manifest 예외를 요구했다.
- Important3: unsupported 값의 무삭제 약속이 기존 legacy 정리와 충돌 → invalid/null t·commit 없는 cleanup·resizeChat truthiness의 기존 기대값을 분리했다. 원본/현재 broker를 직접 대조했다.
- Minor1: harness에 없는 신규 runner cleanup 소유권 → positive/negative 각각 finally·소유 경로·첫 실패/cleanup 실패와 artifact 상한을 명시했다.
- Minor2: P09가 차기 AF05-B 결과를 기다리는 순환 게이트 → 승인 후 P09는 배포 근거/과거 미검증 수용을, AF05-B는 차기 update/rollback 결과를 소유하도록 분리했다.

주 실행자는 기존 runner finally·old/current broker·공개 릴리즈 digest·lockfile 두 version 위치를 대조해 위 지적과 후속 권고를 문서에 반영했다. 이는 **주 실행자 보완이며 수정 후 독립 재검토0건 판정이 아니다**.

검토 보류 항목의 처리: 실제 update/rollback/저장 내구성/CSS/오류는 구현·설치 수용에 남긴다. native 관측은 실행 전 preflight가 증명해야 한다. 공개/심사 버전과 rollback 자격은 실행 시 대상 항목만 확인한다. 모든 AF 기능의 동일성은 향후 기존 전체 게이트와 별도 smoke로 검사한다. 제품 전체 보안·정책 인증/역사 감사 정확성은 이 설계 검토의 결론이 아니다. 정확한 runner API·테스트 명령·CI wiring은 승인 후 구현 계획에 남긴다. reviewer는 테스트·빌드·실제 설치·스토어 조작을 실행하지 않았고 파일/프로필을 변경하지 않았다.
