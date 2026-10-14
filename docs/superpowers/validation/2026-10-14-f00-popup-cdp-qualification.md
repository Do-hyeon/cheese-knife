# F00 실제 팝업 CDP 관측 — 미완료 및 승인 경계

2026-10-14. [승인된 팝업 대안 계획](../plans/2026-10-14-f00-popup-cdp-qualification.md)의 실제 실행 기록이다. 신규 F00 전용 bundled Chromium 프로필만 사용했다. 실제 시청용 Chrome/P09·권한·의존성·버전·push/PR·배포 변경은 없다.

## 실제 결과

- 기존 Playwright Page capture는 계속 false지만 공개 Browser CDP 연결·정확한 URL/context 선택·실제 툴바 popup 연결은 성공했다. 별도 원격 포트·private Playwright API·전역 MCP 설정을 사용하지 않았다.
- 최종 I 실행에서 현재 manifest/media-profiles.js/web/runtime.js 해시를 기록하고 MAIN owner2/baseReady/phase ready와 실제 v2 파서 통과를 확인했다. 현재 원본과 같은 모듈이 적용되며 프레임을 주입해 성공을 만든 것이 아니다.
- 실제 toolbar popup의 own extension ID와 synthetic active tab은 일치한다. 그러나 **진단 요청과 실제 production media client 요청 모두 sender.documentId가 없고 sender.frameId도 없다.** 반면 getContexts의 실제 POPUP은 frame0·documentId 있음·incognito false다. 두 정보를 안전하게 연결하는 현행 계약은 없다.
- 그러므로 실제 media client 상태는 unavailable이다. 입력 이전 own-sender gate에서 중지했고 저장/복원은 실행하지 않았다. popup capture 성공과 실제 설정 저장 성공을 혼동하지 않는다.
- A–I 각 실행에서 public Browser.close 응답·browser disconnection·정확한 owned root process0·residual context.close를 별도로 확인했다. 강화된 정상 종료 증거이며, 이전 qualification의 normalClose 표시를 재사용한 것이 아니다.
- popup 네트워크 관측/차단은 CDP attach 이후뿐이다. 관측된 외부 요청은 없지만 초기 navigation을 포함하는 전체 egress 보장을 주장하지 않는다.

공식 [MessageSender 문서](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender)는 documentId/frameId가 선택 사항이고 frameId가 tab 존재 시 설정된다고 명시한다. 관측된 정상 POPUP에 없는 필드를 위조하거나 프레임0으로 간주하지 않았다.

## MAIN 준비 실패 및 보완

- 첫 A–D 실행은 ISOLATED ready 응답이 와도 MAIN에서 순수 모듈이 보이지 않아 설정 준비 대기 제한으로 실패했다. Page 오류는 없었으며 파서의 catch가 수신 거부를 숨긴 상태였다.
- 첫 script-local var 가설의 명시적 globalThis 공개는 단위42/42였지만 실제 E에서도 실패했다. 이를 해결 완료로 세지 않는다. 해당 가설을 확정해 설명한 중간 보고도 이 기록에서 정정한다.
- Chromium의 [script injection 구현](https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/renderer/script_injection.cc)은 extension별 실행된 스크립트 집합으로 여러 manifest 규칙의 중복 주입을 건너뛰는 경로를 갖는다. 같은 파일을 양 world에 등록한 방식이 MAIN 누락을 일으켰다는 판단은 코드와 실제 관측을 결합한 추론이며, F–H의 보완 후보에서 MAIN 준비가 성공했다.
- 기존 순수 TypeScript 원본을 web/runtime.js에 bundle하고 namespace를 다른 MAIN feature에 공개했다. ISOLATED의 standalone 파일은 유지하고 MAIN의 중복 standalone 등록만 제거했다. 자산59/runtime17·기존 권한/origin·제품2.13.3·역사 기준은 유지한다. 채널 카탈로그나 새 Chrome API를 MAIN에 전달하지 않는다.
- 별도 RED가 실제 scoped 소비자의 미준비를 재현했고 bundle 보완 뒤33/33을 확인했다. 기존 MAIN generator fixture에는 실제 새 source closure만 복사하도록 보완했다.

## 수정 후보의 독립 회귀

- popup command 경계/harness16/16, strict 개발 caller/기존 misuse14/14, 기존 host/lint/순수 계약/load 경계35/35 통과.
- 현재 전체 **1286건/1285통과/실패0/취소0/기존 private 자료 부재 skip1**,54.60초. 9foundation gate 모두 통과.
- 같은 현재 소스에서 실제 픽셀24/24, 합성 WebAudio qualityFailures0/source1/정상 신호14/전환18/극단 peak0.9800000190734863/full-scale 초과0을 확인했다. 방송/사용자 하드웨어의 검증은 아니다.
- 이전 전체1287의 manifest-prefix 기대값1과 bundle 안의 기존 두-domain 동적 접근에 대한 lint 관측1은 실패로 보존했다. MAIN 목록은 정확한 기존 baseline, ISOLATED만 정확한 prefix로 검사한다. domain 접근은 고정 audio/video 분기로 변경했고 lint 규칙·기존 동결 기준은 바꾸지 않았다.
- 초기 export-only 가설의 wrapper 테스트는 실제 원인 보완 뒤 독립된 소비자 검증이 되지 않아 제거했다. 반복 standalone이 없어도 실제 bundled runtime 소비자가 ready가 되는 RED→GREEN과 실제 I 실행이 해당 계약을 검증한다.
- root dist58·원본 ZIP/CRX·private 자료·보호 브랜치·package/manifest2.13.3 불변. 문서 링크와 whitespace를 확인했다. 이것은 후속 보완의 로컬 검사이며 실제 popup 저장/4관측 또는 전체 F00 완료가 아니다.

## 현재 중지점과 권장 후속

현재 sender.documentId 필수 조건은 **완화하지 않았다**. 문서 식별자 없는 요청을 URL 한 개가 일치한다는 이유로 받아들이거나, 임의 documentId를 payload에 넣어 Chrome의 sender 사실로 취급하지 않는다.

권장 설계 후보는 문서 식별이 확인된 **별도 own 설정 TAB**에서 F00 media 저장을 수행하는 방식이다. 툴바 popup의 전역 기능은 유지하고, 사용자의 클릭으로 열리는 설정 탭에 원래 방송의 캡처한 target을 명시적으로 넘긴다. Worker의 own top-document 및 실제 target 재검증·closed/recreated 문서·iframe·시크릿·다중 UI 충돌 기준은 유지해야 한다. toolbar popup 자체 저장을 유지하려면 별도의 수명주기/세션 인증 설계가 필요하다.

위 내용은 후보 제안이며 승인된 구현으로 추가하지 않았다. UX/인증 경로의 상세 설계·Astra max 검토·수용기준 변경 승인이 필요하다. 승인 전 Task5 실제 UI 저장/4관측·Task6 전체 F00 마감은 진행하지 않으며 Task5 완료를 기록하지 않는다.

원본 실패/정상 종료 결과와 trace는 private output에 보존한다. 이 문서에는 document/channel ID·사용자 프리셋 이름·설정 카탈로그·프로필 내용·개인 데이터가 없다.
