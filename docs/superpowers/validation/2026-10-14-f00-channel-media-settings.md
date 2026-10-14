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
