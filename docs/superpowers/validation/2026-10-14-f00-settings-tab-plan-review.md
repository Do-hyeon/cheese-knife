# F00 설정 TAB 상세 구현 계획 — Astra max 검토

2026-10-14 / Asia-Seoul. 입력 소스caa202403286a86e689f34dda94e11dde0f23c14. 사용자 목업/UI·written-spec 및 toolbar→TAB 수용기준 승인을 받아 상세 계획 작성/검토를 진행했다. 제품 구현·Native 실행 승인 전이다.

## 입력과 현재 판정

- [상세 계획](../plans/2026-10-14-f00-media-settings-tab.md), 최초 SHA256 `7B5E10B31833643BA7D88413A2F83EF149DC6403F9135C93F0A335784AE85A36`.
- fresh gpt-6-astra/max read-only **계획 최초 Critical0/Important3/Minor1**. 이전 설계0/5/1·6항목 closure와 다른 입력/검토다.
- root가 아래4항목을 실제 소스와 대조해 보완했고 같은 검토자가 모두 **계획 수준 targeted closure**로 확인했다. 수정 입력 SHA256 `E1C063B0E015BAF91AAADB120FCADFADE31E5C04C26CB805131F23F0421474C7`; 뒤의 승인 대기 메타데이터는 이 입력과 구분한다. 판정은 **written-plan 승인 요청 준비 완료**, fresh whole0건/구현 PASS가 아니다.
- 전체 F00/실제 TAB 인증·저장/정상 종료·보존4관측·BFCache·정책 인증 결과가 아니다. 코드/빌드/브라우저/외부 스캔은 이 검토에서 실행하지 않았다.

## 최초 finding과 보완

| 항목 | 실제 소스 근거 | 계획 보완 | targeted 상태 |
| --- | --- | --- | --- |
| Important1 ACK 직후 표시값 불일치 | v1 client는 confirmed overlay를 표시하되 snapshot은 이전 값일 수 있음. ready/pending0/두 snapshot revision 일치도 부족 | 선택 도메인의 화면 values와 confirmed snapshot field 일치까지 검사. 두 post-write read 지연/ACK 선행 RED 추가 | 닫힘 |
| Important2 observer/Page discovery 등록 경쟁 | media client는 constructor에서 즉시 첫 read. TAB 이후 등록하면 실제 요청을 놓칠 수 있음 | prepared worker observer는 popup 전에 await, Page discovery/routing은 클릭 전. bounded16 관측을 새 Page의 실제 tabId/current document context와 상호 대조 | 닫힘 |
| Important3 native 실행·세션·종료 소유자 부재 | launchInstalledExtension 반환에는 session이 없고 원래 runner는 context.close 후 profile 제거. helper는 live Page 반환 필요 | 기존 runner 전용 qualification CLI/caller·Browser session 공급자·상위 소유자 종료 ACK/disconnection/root0·실패 보존을 명시. strict helper는 기존 popup-cdp 엔트리, 실제 runner/transition caller·IPC negatives 연결 | 닫힘 |
| Minor1 timeout15000/attachment8000 충돌 | attachPopupCDP는8000 초과 즉시 거부 | 전체15초와 개별min(8초,남은 deadline) 분리, 기본 인자 정상 경로 검사 | 닫힘 |

root 추가 대조: 같은 URL의 기존 TAB은 새 Page로 보지 않으며 관측 docID→실제 Page tabId/current context를 확인한다. query나 diagnostic payload는 worker 권한이 아니다. helper의 borrowed session과 상위 runner의 브라우저 종료 책임은 구분한다. Windows root 조회를 다른 플랫폼 PASS로 전용하지 않는다.

## 판단 제외와 후속 게이트

- 실제 toolbar→TAB·Chrome sender/context·저장·정상 종료·네트워크: 미구현/미실행, Task5C 실제 qualification 필요.
- extension URL의 BFCache/freeze·Chrome121·키보드/확대/좁은 창·최종 렌더링: 실제 관측 필요. 목업 이미지/합성 event는 증거가 아님.
- 원래 Task5 저장4관측/손실 negative·패키지·개인정보 안내·Task6 전체 회귀/9기반/점검도구·whole-F00 최종 검토: 후속 유지, 이 검토로 종료하지 않는다.
- 공식 보안/스토어/법률 인증·실제 사용자 Chrome/P09·push/PR/배포: 범위 밖이며 별도 승인 유지.

검토자가 제외한 위 범위는 root가 후속/STOP으로 유지한다. 설계 승인 메타데이터 변경은 finding으로 세지 않았고, 이전 설계 검토 수치도 새 검토에 합산하지 않았다.

최종 문서-only 검사: 로컬 링크52개/부재0, UTF-8/한글·영문·whitespace, 원래 F00 normative body 내용 동일, 제품/package/manifest2.13.3·root dist58·원본 ZIP/CRX/private 자료/보호 브랜치 불변을 확인했다. 새 제품 테스트·빌드·브라우저/프로필 관측은 하지 않았다. 로컬 계획 checkpoint이며 push/PR/실행 승인이 아니다.
