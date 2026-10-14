# F00 — 채널별 미디어 설정 구현·검증

2026-10-14 / Native 실행 승인. 기준 main45100969200dfb5e33737db60c9a3fa7450f4450, 로컬 브랜치 codex/f00-channel-media-settings. [설계](../specs/2026-10-14-f00-channel-media-settings-design.md)·[계획](../plans/2026-10-14-f00-channel-media-settings.md). 사용자 시청 Chrome/P09·push/PR·버전·릴리즈·스토어 변경은 제외한다.

## Task2 — 동일 큐 v2 저장 경계

- v1 API는 유지하고 새 v2 요청을 동일64대기 큐로 직렬화했다. media 저장은 mediaProfiles 한 키만, 전역 프리셋 적용은 기존 전역 변경 키만 한 번 저장한다.
- own document/context와 current tab의 window/origin/channel/incognito를 저장 직전 다시 확인한다. 확인 불가·시크릿 신규 저장은 차단한다. getContexts의 응답 대기는2초로 제한한다.
- 정상 sender 기준 RED12건 → 집중107/107·추가 경계16/16 GREEN. 전체1223건:1222통과/실패0/취소0/기존 private-history skip1. 9개 foundation gate 통과.
- unknown 전역/최상위 필드, 손상 media 원본, 도메인 reset/recreate·프리셋 ABA·쓰기/응답 유실·혼합 큐 포화와 저장 직전 context/target 변경을 확인했다. 이전 잘못된 sender/동기화/대기 경계 실패는 성공으로 세지 않는다.
- 실제 ordinary 설정 TAB의 document/context는 격리 Chromium에서 확인했지만 실제 툴바 POPUP의 자동 제어는 아직 미검증이다. popup 생성만으로 Task5 성공을 주장하지 않는다. 전체 F00 구현·최종 Astra 검토도 아직 완료가 아니다.

## Task1 — 순수 계약과 로드 그래프

- 새 classic media-profiles.js는 단일 TypeScript 원본의 순수 schema/값 검증·채널 projection·도메인/프리셋 병합이다. 기존11개 field descriptor를 이동해 CONFIGS가 재사용하고, 아직 UI/broker의 신규 저장 요청은 연결하지 않았다.
- absent/read 무쓰기, 글로벌 비미디어 보존·도메인 상속·128/64/48codepoints/192bytes/256KiB 상한·own data getter 거부·safe integer/no-op·삭제/재생성 token·unknown create 확인을 검사했다. 정상 decimal은 반올림/변환하지 않는다.
- 첫 media14개는 모듈 부재의 RED→14/14 GREEN. 실제 load-order4개와 tagged worker2개 RED. 이후 기존 채널의 다른 도메인 enable ACK 손실을 별도 RED1/18→GREEN18/18로 보완했다. 원래 생성/record/domain token과 초기값을 확인할 때만 무쓰기 확인하며 재생성은 conflict다.
- published-four/F00-five worker source를 명시 tag/정확한 파일 집합·정상 순서로 구분하고, 잘못된 교체는 기존 worker 종료 전에 거부한다. P09/게시 byte·old/new/old raw/등록 identity를 보존한다.
- 새 모듈은 현재 오디오의 실제 입력이므로 audio artifact reader/evaluator/hash/type allowlist에 포함했다. DSP·허용 오차·파형 계산은 변경하지 않았다. 구 audio oracle/runtime inventory/build-proof/fixed payload는 유지하고 새 F00 active pins/oracle을 분리했다.
- pre-F00 settings-fixture의 원래 normalized 해시839420...은 비실행 text snapshot에 유지한다. 현행 checked graph는 모듈 포함14파일, 모든 기존18개 외부/25개 내부 오용과 callback/clone/lastError negative를 계속 실행한다.
- 초기 연결123개 중120pass/3fail은 잘못된 source-pack 접근 및 옛13/5 개수 assertion이었다. 호출자/새 graph 기대값을 보완한 연결137/137·실패/skip0. 마지막 추가 media 경계18/18.
- **최종 Task1 전체:** 물리 후보1207개/1206pass/실패0/기존 private 자료 부재 skip1,54.00초. 9foundation 모두 통과; runtime17/settings11/MAIN6, 기존4-context proof baseline 그대로 통과. 기존 원본 tracked 기준은1186/1185pass/0fail/skip1이었다.
- 처음 샌드박스 realpath EPERM 및 fixed ZIP cache 부재 실패는 보존했다. 정상 권한의 물리 후보·고정 ZIP 캐시로 준비 후 실행했으며 실패를 제품 PASS로 치환하거나 test/permission guard를 줄이지 않았다.
- root dist58·package/manifest2.13.3·원본 ZIP/CRX·private 감사 원장·보호 브랜치 불변. source manifest만 정확한 새 모듈 prefix를 두 world에 등록했고, 이를 제거한 전체 manifest는 이전과 동일하다. root dist build/사용자 프로필 접근 없음.

이는 Task1의 계약/기반 증거이며 F00 저장 UI·실제 채널 적용·설치형4관측·실제 Chrome/스토어 수용 또는 최종 Astra max 검토 완료가 아니다.

## 남은 실행

Tasks1–4의 당시 입력에 대한 로컬 구현/개별 회귀를 확인했다. 현재 Task5는 실제 popup sender 문서 식별 사실 부재로 승인 대기다. [실제 관측·MAIN 보완·현재 회귀](2026-10-14-f00-popup-cdp-qualification.md)를 별도로 기록하며 popup 저장/4관측·최종 전체 Astra max는 아직 남아 있다.

- 기존10초 callback transport를 두 client가 공유하고 v1 API는 유지한다. media client는 별도 snapshot/epoch·필드 generation·scope·pendingRequest/pendingValues를 갖는다. UNKNOWN/CONFLICT는 unsent input보다 우선이며 최신 read-back이 원래 생성 토큰/값을 확인할 때만 무쓰기 확정한다.
- 전역을 기본으로 명시 채널/저장 채널·독립 audio/video enable/전역 상속·프리셋 생성/적용/이름 변경/삭제를 제공한다. 미설정 도메인 적용은 차단하고 VOD/시크릿/불명 target의 현재 채널 선택을 막는다. 채널 삭제 후 selector는 명시 scope를 유지하며 자동 재생성/retarget하지 않는다.
- 도메인 중립 double-click reset과 한 도메인 상속 해제가 다른 도메인을 유지한다. 사용자 preset 이름은 plain text이며 conflict/unknown의 원래 값과 최신 저장값을 own UI에서 비교한다. 전역 미디어 control은 손상 catalogue에도 기존 v1로 저장 가능하다.
- 신규 missing UI/client8 RED, unknown-create read-back RED, 적용 불가/삭제 selector2 RED, 빠른 입력+ACK 손실 phase RED, conflict 비교 RED, 빈 partial no-op 및 dispose subscriber RED를 보완했다. 전체 첫 run의 기존 object-injection 규칙5곳 RED는 고정 audio/video 분기로 제거했고 rule/suppression/예전 oracle은 변경하지 않았다.

- [x] Task2 동일 broker 큐·v2 경계·저장/실패/unknown 계약. 로컬5a06b58.
- [x] Task3 명시 scope/preset UI와 독립 client 상태.
- [x] Task4 scoped runtime·필터/오디오 intent·객관 적용 검사.
- [ ] Task5 실제 popup qualification·4관측·정확한 손실 negative·고지.
- [ ] Task6 fresh 전체/도구 감사/설치·보호 대조·whole-F00 Astra max.

미실행은 별도 한계다. 버전2.13.3 유지, local commit만 승인됐고 push/PR/배포는 하지 않는다.

## Task4 — 두 world 연결과 적용 소유권

- 단일 bulk reader는 기존 전역 기본값과 채널 projection을 분리한다. 전역 준비가 끝나면 기존 탐색·채팅·미리보기는 사용 가능하지만 오디오 자동 ON은 scoped 응답 전에 요청하지 않는다. 손상 메타데이터는 nullable/제한 상태이며 유효한 전역 값을 지우거나 원본을 덮어쓰지 않는다.
- 실제 route/pzp/video 문맥과 request nonce로 늦은 A→B→A·source 생성 중 전환·읽기 취소·복원을 검증했다. 같은 영상의 PZP shell 교체는 전달 권한을 갱신하되 수동 의도를 유지한다. 플레이어 문맥 변경은 이전 영상의 wet 출력/채널 overlay를 먼저 은퇴시킨다.
- 새 응답이 전혀 없는 fallback의 자동 ON 잔류를 추가 RED로 재현했다. 제한시간 뒤에는 이전 확정 metadata/binding을 지우고 미확정 전역 fallback으로 처리한다. 이후 채널 OFF 확인 시 자동 의도만 은퇴하고 수동 ON/OFF는 유지한다.
- `filters.ts`가 유일한 SVG 원본이다. 전역 필터는 document, 채널 필터는 실제 main filterTarget에만 적용한다. 중립 채널은 전역 필터를 한 번만 덮어쓰고 네이티브 inner-video 필터는 유지한다. 외부 marker/slot/SVG는 교체하지 않는다.
- 실제 Chromium151 합성 픽셀 **24/24**: 기존17개 기대값/네이티브 wrapper, scoped4개, renderer 부재·두 혼재 world3개. source-wrapper fixture가 layout-body를 빠뜨린 실패와 installed-but-unapplied renderer를 absence로 오해한 기대값 실패는 별도로 남겼다.
- 현재 입력의 실제 WebAudio **qualityFailures0**, source1·48kHz, 정상 신호14개·전환18개 및 지연 정렬·극단 설정 검사. 극단 설정 peak0.9800000190734863·full-scale 초과 sample0. 합성 출력 수치이지 사용자 하드웨어/방송 청취·모든 코덱의 인증이 아니다.
- 실제 v1/v2 fixture metadata witness는 분리하고 bounded 문맥/seq만 기록한다. stale-current 음성 대조와 B 전환 후 A 재생 공격 대조 호출자는 구현했다. 실제 설치형 실행은 Task5–6에서 별도 확인하며 아직 PASS로 세지 않는다.
- current helper의 실제 v2 decoder를 사용하되 legacy v1 helper·게시본 loader·동결 해시/오디오 오차·계산 본문은 보존했다. shared6개 erased data type으로 Node 개발 도구 graph가15개가 됐고 기존 오용 음성 대조는 유지한다.
- 최종 전체 **1280건/1279통과/실패0/취소0/기존 private 자료 부재 skip1**,53.91초. **9foundation 모두 통과**. 마지막 metadata 수정과 같은 런타임 입력으로 픽셀24/24·오디오 수치도 재실행했다.
- 이전 전체1272의 type graph/import assertion2건과 전체1278의 오디오 CLI 고정 해시1건 실패는 기록했다. CLI의 정확한 승인된 v2 bootstrap 블록만 대조에서 분리하고 나머지 전체 본문은 동일6f8338... 해시로 계속 보호한다. 역사 기준·DSP·합격 오차를 갱신해 통과시킨 것이 아니다.
- root dist58·원본 CRX/ZIP/private 자료·보호 브랜치·manifest 권한/범위·제품2.13.3 불변; 사용자 시청/P09 프로필 접근0. 완료된 체크리스트는 F00 아카이브로 분리했다.

## Task5 현재 중지점

실제 설치형 진입에서 MAIN의 동일 standalone 파일 중복 주입 의존성을 발견했다. 기존 순수 원본을 runtime에 포함하고 다른 MAIN feature용 namespace를 공개하는 방식으로 보완했으며 권한·자산 수·버전은 그대로다. 실제 현재 I 실행에서 MAIN ready/파서 통과를 확인했다. 기존 Task4의 로컬 수치를 실제 설치형 성공으로 승격하지 않는다.

CDP attachment는 성공하지만 실제 toolbar popup의 production 요청에 sender.documentId/frameId가 없어 현행 v2 인증이 거부했다. 당시 입력/저장 이전 STOP이며 인증 조건은 낮추지 않았다. 후속 별도 TAB 명세/목업/계획/Astra max 검토 및 Native 실행 승인을 받아 보완 중이다. 당시 qualification을 성공으로 바꾸지 않으며 저장4관측·Task6은 아직 미실행이다.

## Task5A TAB 진입 보완 — 로컬 검증

사용자 상세 계획/Native 실행 승인 뒤 toolbar v1/명시 TAB 열기와 media TAB v2를 분리했다. 실제 sender 인증은 기존 broker가 그대로 소유한다. top-frame/정확한 mode·query·원래 id/window/origin/channel/incognito 검사, VOD styles pair, 중복 클릭 및 targetless 관리와 기존 입력 재사용 배치를 RED/GREEN으로 검증했다.

집중51/51, 전체1304/1303pass/0fail/0cancelled/기존skip1,54.08초,9foundation 통과. sandbox 첫 전체 실패(realpath/자식 프로세스 접근)는 성공으로 세지 않고 같은 source의 격리 후보 재실행을 채택했다. generated popup와 active normalized pin만 갱신했다. 실제 Chrome/TAB writer·저장4관측·BFCache 성공으로 세지 않는다. Task5B/C와 원래 Tasks5/6은 남아 있다.

## Task5B 조회 전용 복구·확정값·확인 경합 — 로컬 검증

ACK 유실 patch7+새 입력5의 조회/event는 요청[7]/저장7/표시draft5/unknown을 유지한다. 같은 값으로 과거 patch 성공을 인증하지 않는다. 원래 UUID/name/values/생성 revision이 일치하는 생성 확인만 남기며, 그 뒤 최신 입력은 draft-held/failed로 보존하고 자동 flush하지 않는다. UI 조회와 폐기는 별개다.

프리셋 생성은 표시 도메인 값과 confirmed snapshot·전역/상속 revision을 함께 검사한다. 양쪽 snapshot이 이전 값이어도 v1 ACK overlay2를 화면에 표시하는 동안 이전 preset1 생성은0이다. channel confirmed 값/미설정 domain 상속도 검사했다. 파괴적 세 동작은 native confirm 이전에 대상/token을 캡처하며 취소0·확인1회·도중 scope/record/UUID/current 방송 변경 거부를 대조했다. broker/schema 인증 계약은 바꾸지 않았다.

최초 RED71건 중11expected fail. 중간 jsdom realm 배열/UUID 정렬 가정은 시험 경계만 수정했다. 집중76/76·dictionary 연결56/56, 최종 전체1320/1319pass/0fail/0cancelled/기존skip1,54.30초,9foundation 통과. 첫 전체 dictionary 경고는 고정 audio/video 분기로 보완했고 후속 MAIN symlink EBUSY는 동일 입력 재실행으로 통과했다. 모든 실패 로그는 Native private 원장에 유지하며 규칙/역사 기준/오디오 수치 기대값은 바꾸지 않았다.

실제 TAB writer/BFCache/보존·F00 전체 최종 검토는 아직이다. Task5C와 원래 Tasks5/6을 이어간다.

## Task5C 실제 검증 직전 준비 체크포인트 — 완료 아님

- pagehide 시 마지막 global/media 입력·불명 요청을 보존하고 두 client를 폐기하며 편집을 영구 잠근다. persisted 복원은 ready가 아닌 재연결 필요 표시다. native 확인 후 own 설정 문서만 reload하며 자동 재초기화/재전송/rollback은 없다. 늦은 대상 캡처도 opener를 되살리지 않는다.
- invalidated Chrome 리스너 정리가 던져도 finally에서 pending transport/subscriber를 정리한다. 실제 보내진 durable commit은 취소했다고 표현하지 않는다. 합성 lifecycle35/35·client 연결50/50으로 재현/보완했으며 jsdom reload 관측은 실제 새 문서/BFCache 성공이 아니다.
- 기존 strict popup-cdp helper에 실제 toolbar→TAB 경로를 추가했다. worker observer를 먼저 준비하고 최대16개 production metadata만 기록한다. 새 Page의 실제 tabId→CURRENT TAB 문서→사전 metadata를 결합해 같은URL 이전 문서를 대체하지 않는다. 공개 CDP mouse 입력 전에 label/focus/hit-target/ready를 확인한다. 문서/auth 부재·중복·timeout·시크릿/frame·cleanup 실패를 거부한다. helper는 빌린 browser session을 닫지 않는다.
- 상위 runner의 정확한 선택 옵션과 실제 Windows close owner를 연결했다. public Browser.close ACK·disconnection·exact owned root0 후에만 잔여 context.close를 수행한다. source dirty/실행 중 변경·독립 동결58-name metadata+media-profiles.js exact59 자산을 launch 전후에 검사한다. 일반 config runner/전환 schema/기존 기본 cleanup은 유지한다.
- 새 qualification의 자기 profile/candidate는 PASS에도 최종 통합 증거까지 보존한다. summary 쓰기/cleanup 실패 때 자료를 먼저 없애지 않기 위한 국소 결정이며 비용은 private output 디스크 사용이다. 정상 종료 proof는 계속 필수다. 실제 사용자 Chrome/P09·로그인·동기화는 접근하지 않는다.
- source/asset/owner 연결86/86, 최신 고정 입력 전체1358/1357pass/0fail/0cancelled/기존skip1,54.82초;9foundation 통과. 초기 type/fixture/import/경계 실패와 중간 전체1354 결과는 private Native 원장에 별도 보존하며 최종 입력으로 전용하지 않는다. 역사 기준·타입 규칙·lint 억제·합격 오차는 변경하지 않았다.

이 준비 소스의 clean 로컬 SHA·새 물리 격리 복사본으로 실제 qualification을 실행한다. 실제 TAB 저장/합성 외 BFCache·media 보존4관측·config/media 손실 대조·원래 Task5/6·whole-F00 최종 Astra max는 아직이다. 실제 최초 네트워크 navigation 간격도 완전 egress 보호라고 주장하지 않는다. push/PR/버전/릴리즈/스토어 변경은 없다.

## Task5C 실제 qualification A — 범위별 성공

소스 baf0015d6d4dd50a53e3282688cbf2de09e3edd6의 새 물리 격리 복사본/physical 의존성/새 owned Chromium 프로필에서 기존 runner `--qualification=media-tab`를 실행했다. exit0,6.781초. 실제 툴바 버튼으로 연 새 own TAB의 production sender·CURRENT 문서 결합, 전역 초기 scope·현재 채널 저장/MAIN config 반영, 같은URL 두 TAB의 독립 필드 병합과 값·채널 삭제 복원을 확인했다. 가짜 writer/대상 API나 positive storage.set으로 대체하지 않았다.

public Browser.close ACK·browser disconnection·exact owned profile root0 모두 true. source/after의 SHA 및 sourceSha256 `7013b2791993bf3926df8517b5fefed8737f65adf773f77994ecaa043b4f7902`가 동일하다. 프로필/candidate/summary는 private output에 보존했다. 최초 popup navigation 간격 보호는 false로 명시한다.

A는 저장4관측·실제 스토어 업데이트/플랫폼 rollback·BFCache·모든 설정 조합 성공이 아니다. 추가 VOD/targetless/saved/프리셋/확인/키보드/좁은 화면/합성 및 실제 복원 구분은 다음 입력 B에서 수행한다. 이 추가 caller/fixture의 단위 연결50/50·전체1360/1359pass/0fail/기존skip1,55.75초는 준비 검증이며 B actual 성공으로 세지 않는다. 원래 Task5/6·전체 최종 Astra max는 아직 남아 있다.

## Task5C 실제 qualification B — 추가 수용 확인

source1f3830a2d2efbd62359eb0a01ec32d42b80b3966의 새 clean 물리 복사본/새 owned profile, 기존 runner F00TabQualification1f3830aB, exit0,8.958초. 실제 current 저장·두 TAB 병합/복원에 더해 targetless/저장 채널·preset 저장/삭제·native 확인 취소의 raw 무변경·실제 Space키 저장/복원·480px 카드1열/overflow0·VOD pair/원래 VOD만 두 번 적용용 reload를 확인했다.

실제 extension 문서에서 합성 persisted 잠금과 확인 후 own reload 무쓰기를 관측했고 back/forward도 실행했다. **bfcacheObserved=false**이므로 실제 BFCache 복원은 미검증이다. native reload/back-forward smoke와 합성 잠금은 구분한다. public Browser.close ACK·disconnection·exact owned root0 모두 true, source/after sourceSha256 `c2fff2cc18ffed4df7ebd392c2f759e38fc571a39ccb40acf0c498adf54b3908` 동일. private summary/profile/candidate 및 실패 없는 원시 결과를 보존했다. 시청 Chrome/P09/root dist/공개 변경은 없다.

이제 media-preservation의 seed+old/new/rollback/new4관측과 occurrence별 child close-proof IPC, 별도 config/media 손실 대조·안내/개인정보·Task6 전체 검증 및 fresh whole-F00 Astra max를 이어간다. B 성공은 이 잔여 작업의 성공이 아니다.

## Task5 보존 도구 연결 — 실제 전환 전 준비

media 전용 selector/seed+4관측·occurrence0..4·종료3증명의 parent/child 경로를 구현했다. 기존 config schema/고유 phase ID/손실 control은 유지하고 current exact59와 published exact58 자산을 구분한다. 값·토큰·리비전은 독립 literal oracle, 이후 rollback/final-new의 media JSON 직렬화도 first-new와 대조한다. Chrome 내부 저장 파일의 byte 동일성은 인증하지 않는다.

손실 파생본은 final-new occurrence4에서만 A audio를 제거하고 global/다른 채널/복사된 preset/revision을 유지한다. 두 cold boot에도 marker key나 중복 삭제가 없다. parent는 정확한 손실 원인·occurrence/raw/실행 근거·모든 선행 관측·정상 종료·close3증명·후속 오류 없음이 일치할 때만 control 성공을 판정한다. timeout/권한/인벤토리/종료 오류는 대체 성공이 아니다.

상위 정상 경로 validator 연결 RED, 직렬화 순서 RED와 기존 native pure helper 의존성 실패를 재현해 보완했다. 연결72/72, 직렬화/parent42/42, native pure 경로43/43 및9foundation이 통과했다. 최초 전체1377건 중1375pass/1fail/기존skip1은 기록하며, lazy UI import로 보완한 뒤 새 전체 결과를 별도로 기록한다. 아직 actual4관측 PASS는 아니다.

README 두 언어와 개인정보처리방침에 미공개 F00의 로컬 채널 설정·preset 이름/수동 삭제/제거 시 소멸/비전송과 Gain·VOD·iframe·시크릿·혼재 세대 제한을 추가했다. 현재 스토어2.13.3 기능으로 오인하지 않도록 개발 중 범위를 표시하며 공개 URL/dashboard는 변경하지 않았다.

의존성 보완 후 전체 재실행1377/1376pass/0fail/0cancelled/기존skip1,55.716초. 루트 보호 대조는 manifest 허용 차이/보호 ZIP·CRX/버전2.13.3/dist58 모두 통과했다. 실제 전환용 clean 로컬 checkpoint를 만들며 원래 Task5/6 전체 완료는 선언하지 않는다.

## Task5 실제 저장 전환 A

clean 물리 후보 source `ba286ec871308da7a025029a297632e461f734ce`, sourceSha256 `3d879d6facbac7b314c6017952e68df0862de9eb5b197ab3d16d3bf8fe5823da`에서 기존 runner를 실행했다. 모든 source/after가 동일하며 종료·후속 오류는0이다.

| 검사 | 실제 결과 |
| --- | --- |
| media-preservation | old/new/rollback/new4관측 PASS. 생성은 first-new1회, rollback/final-new는 기존 raw/직렬화와 UI/MAIN 관측만 수행 |
| media-profile-loss | final-new occurrence4/startup/candidate-init의 정확한 A audio 손실을 media-preservation 오류로 감지. 선행3관측 보존 |
| 기본 config | 기존5사례·old/new/rollback15관측 PASS. 신규 selector 없음의 기존 의미 유지 |
| storage-loss | 기존 config 삭제를 transition-storage-preservation/startup/candidate-init으로 감지. media control로 대체하지 않음 |

각 실행은 private summary에 보존했다. media의5회 종료3증명은 실행한 parent admission에서 필수 검사했으며, 다음 소스에서는 보고서에도 boolean만 명시해 보존한다. 실제 플랫폼 업데이트/rollback은 아니고 같은 소유 경로의 코드 재실행이다. T2.13.4/R2.13.5는 기존 TEST ONLY 파생본이며 공개 번호 선정이 아니다.

남은 실제 창·top-frame/iframe·설정 닫기/재열기 관측을 기존 qualification에 추가했다. 연결59/59 및 최신 전체1377/1376pass/0fail/기존skip1,56.206초. 새 actual C 실행 전 준비 결과이며 C 성공으로 세지 않는다. 실제 저장 commit과 창 닫기의 정확한 상대 시간은 강제로 만들지 않고, durable queued late commit의 결정적 순서는 별도 client 시험으로 유지한다.

C(source150d512) 실제 실행은 두 창 merge/iframe 검사 뒤 후속 helper의 active-window 불일치로 실패했다. source/after 불변, close3증명 모두 true다. 인증 완화 없이 두 창 병합 관측 후 자기 설정 탭을 원래 창으로 복원·focus하는 검사 수명주기를 보완했다. 연결44/44가 통과했으며 다음 clean source의 실제 D로 확인한다. 별도 clean150d512 전체1377/1376pass/0fail/기존skip1,56.245초와9foundation은 통과했지만 C actual 실패를 지우거나 D 성공으로 전용하지 않는다.

D(source038eff2)에서는 이동한 설정 Page의 다음 클릭 actionability가 timeout했다. 원시 trace에서 버튼 disabled가 없던 snapshot도 확인했으므로 BFCache나 제품 저장 실패로 단정하지 않는다. 두 창 저장·동기화 관측 후 자기 second를 닫고 원래 창에 새 toolbar→TAB 문서를 열어 후속 검사를 분리한다. 대상/문서 인증을 바꾸거나 force click/positive storage 쓰기를 하지 않는다.

## Task6 중간 품질·도구 결과와 보완

038eff2의 별도 clean 전체1377/1376pass/0fail/기존skip1,57.043초·9foundation·isolated package·객관 합성 audio·pixel24/24가 통과했다. 실제 audit의 입력 snapshot matched=true, npm0/Gitleaks dir0/git0이다. ESLint13은 기존 owned-files8과 새 client domain3/pixel FS2 패턴 경고이며 무취약성 인증이나 clean audit가 아니다.

두 신규 RED 시험으로5개 경고를 재현했다. client는 audio/video 고정 속성 접근, pixel 도구의 선택 파일 읽기는 기존 owned 경로 capability로 보완했다. 규칙·억제·역사 경고를 변경하지 않았다. 생성 client의 raw SHA7b15b31e9d1b9ba10e87abdf0ada397d8e04bcbcbfd8fbe04ad050cf731e68e8과 current 실행 pin f11c373e438244f94ddd92d37d8eee46d55ecbcd26cdb47ced930812fbc916e9를 구분한다. raw SHA를 pin에 넣었던 중간 실패도 원장에 유지한다.

보완 연결60/60·9foundation·전체1379/1378pass/0fail/기존skip1,56.058초. 새 clean 후보의 actual/도구 결과와 whole-F00 최종 Astra max가 남아 있다. 과거 C/D 실패와 중간 품질 결과를 최신 입력의 성공으로 대체하지 않는다.

## 실제 팝업 재열기 이력과 자원 정리 보완

E/F의 재열기 실패를 기록하며 검증한 실제 windowId를 공식 openPopup 옵션에 연결했다. 독립 G(eb9a508)는 전체 actual10.472초·두 창/iframe/닫기 후 저장/재열기·VOD/키보드/480px/confirm/복원 및 close3증명 PASS였다. 그러나 미리 정한 추가 H/I 중 H가 실패해 I는 실행하지 않았다. G 성공만으로 안정성 문제 해소를 선언하지 않는다. F는 absolute candidate script/root cwd 실행이어서 final acceptance 명령으로 쓰지 않으며, 쓰기·source attestation은 candidate에 한정됐고 root 보호는 불변이다.

H의 boolean/count 진단은 own 팝업1개·normal 창·focused·activeLive 모두 true였다. 기존 helper는 자기 CDP attachment만 detach하고 팝업 소멸은 확인하지 않았다. 실제 남은 helper 팝업은 다음 API 호출의 경합 원인이 될 수 있으므로, 새 helper는 성공한 openPopup 뒤 선택한 정확한 targetId/own URL/browserContextId의 자기 팝업만 정리하고 소멸을 확인한다. 새 설정 TAB·다른 대상·빌린 session/browser는 닫지 않는다. 이미 자연 종료됐으면 다른 대상을 닫지 않으며, 소유권 변경·close 오류·stuck은 실패한다. 전체15초 예산/자동 retry0 유지.

자원 정리 RED20개 중4fail→helper/strict/기존 CDP39/39 GREEN, 전체1383/1382pass/0fail/기존skip1,56.155초. 이 새 입력의 actual 재검증과 최신 전체 종합·Astra max가 아직 남아 있다. 원래 Task5의 bounded popup close와 TAB 계획의 attachment-only 문구 충돌은 자기 생성 팝업만 정리하는 범위로 원장에 판단을 남겼다.

poll50524b8의 독립 actual M/N은 전체11.321초/19.373초 PASS, O는 자연 popup 종료와 detach 요청의 경합으로 실패했다. 새 보완은 정확한 No-session 오류에만 독립 getTargets에서 자기 target 부재를 증명한 경우 정상 정리로 처리한다. 대상 생존·불명 shape·다른 오류는 실패를 유지하며, detach 전체8초·helper 전체15초 예산도 유지한다. RED9건 중1fail→helper/strict43/43 GREEN.

동시 browser/오디오/감사 실행과 겹친 전체1383/1381pass/1fail/skip1(기존 HLS verifier incomplete)을 기록했다. 정확 원인은 확정하지 않으며 다른 작업 없는 동일 입력 HLS verifier12/12와 보완 후 전체1387/1386pass/0fail/기존skip1,55.954초를 확인했다. timeout·기대 hash·오차·skip·역사 원장은 바꾸지 않았다. 최신 실제 연속3회와 남은 패키지/전환/도구/최종 검토로 이어간다.
