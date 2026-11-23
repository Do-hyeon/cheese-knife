# F00 보완 설계 — 문서 인증을 유지하는 별도 미디어 설정 탭

2026-10-14 / Asia-Seoul. 상태: **설계·목업/UI·상세 계획 및 기존 Native 실행 승인, 구현 중**. 설계 Astra max 최초 Critical0/Important5/Minor1·6항목 targeted closure 완료. 입력 코드448772a는 설계 당시 기준이며 제품2.13.3·Chrome121 최소·기존 권한은 유지한다. [승인된 한글 상세 계획](../plans/2026-10-14-f00-media-settings-tab.md)에 따라 순차 구현/격리 검증한다. push·PR·병합·배포 승인은 아니다. [검토 기록](../validation/2026-10-14-f00-settings-tab-design-review.md)은 최초 finding·두 보완 입력·targeted 판정·미검증을 구분한다.

이 문서는 [승인된 F00 설계](2026-10-14-f00-channel-media-settings-design.md)의 UI 진입 경로와 [Task5](../plans/2026-10-14-f00-channel-media-settings.md)의 실제 UI 수용 경로만 보완한다. 원래 normative body/이전 검토 이력을 다시 쓰지 않는다. 저장 도메인·schema·broker 권한·한도·revision/생성 토큰·전역/채널 적용 계약은 그대로다.

## 1. 문제와 선택

[실제 qualification](../validation/2026-10-14-f00-popup-cdp-qualification.md)에서 toolbar POPUP의 공개 CDP 연결은 됐지만 production 요청의 Chrome sender에는 documentId/frameId가 없었다. URL로 조회한 POPUP context에는 문서 ID가 있어도 두 사실을 안전하게 연결할 수 없으므로 저장은 입력 전에 거부됐다. 기존 TAB 관측은 문서 ID가 있었지만 **새 진입 경로의 실제 성공은 아직 미검증**이다.

| 대안 | 판단 |
| --- | --- |
| 기존 popup.html을 별도 own TAB으로 재사용 | 선택. 기존 client/폼/allowlist 재사용, 문서 인증 조건 불변, 새 페이지/권한/의존성 불필요 |
| POPUP port/session 인증 도입 | 미선택. 새로운 capability 발급·만료·재접속·문서 폐기 계약 필요. 현재 문제보다 변경 경계가 큼 |
| URL 일치·payload 문서 ID·frameId 기본0으로 허용 | 금지. 실제 Chrome sender의 부재 사실을 대신하지 못하고 iframe/동일 URL 문서 혼동 위험 |

## 2. 화면과 사용자 동작

사용자가 시각 목업을 보고 구성을 확인하는 단계를 추가 요청했다. 목업은 승인용 예시이며 실제 저장/권한 기능이 아니다. 첫 boot는 전역 scope, 목업의 현재 채널 화면은 사용자가 선택한 뒤의 예시다. 기존 popup의 일부 항목만 그렸다고 나머지 전역 기능을 제거하는 것은 아니다. 목업/UI 확인 전에 구현 계획·제품 작업으로 넘어가지 않는다.

- toolbar popup은 기존 전역 설정·capability·스타일 링크·지원 링크를 유지한다. 기본 scope는 전역이다. 기존 compressor6필드/video5필드도 전역 편집으로 남는다.
- popup에는 **‘채널 설정·프리셋 열기’** 버튼과 ‘별도 탭에서 편집하며 나머지 설정은 전역’ 안내를 제공한다. popup에서는 media client를 시작하거나 관리 catalogue를 읽지 않는다. 기존 전역 v1 client는 독립적으로 동작한다.
- 명시 클릭 한 번으로 같은 Chrome 창에 own URL `popup.html?mediaSettings=1`을 새 TAB으로 연다. 자동 열기/기존 탭 탐색·재사용/다른 창 활성화/방송 새로고침/음소거 변경은 없다. 열기 실패는 접근 가능한 status에 표시하고 재클릭만 허용한다.
- TAB은 같은 HTML/TS/폼을 사용하고 mediaSettings 모드에서만 media client와 채널/프리셋 controls를 활성화한다. 전역/현재/저장된 채널 선택과 도메인 활성화는 기존 명시 동작 그대로다. 기본은 **전역**이며 열렸다는 이유로 채널 저장을 활성화하지 않는다.
- TAB에서도 비미디어 필드는 전역임을 표시한다. 스타일 링크는 원래 대상 pair를 전달하고 기존 적용용 새로고침 의미를 유지한다. 전역 미디어 v1 편집도 유효한 전역 상태면 계속 가능하다.
- 모드 query는 UI 표시 결정일 뿐 저장 권한이 아니다. actual POPUP에 같은 query를 넣거나 UI disabled를 제거해도 worker는 실제 sender/context로만 판단한다. iframe은 UI를 활성화하지 않으며 worker 검증도 별도로 유지한다.
- popup.html을 query 없이 일반 TAB에서 열면 전역 설정만 제공한다. 본인 TAB을 방송으로 오인하거나 다른 창의 active 탭을 자동 선택하지 않는다. media TAB에서 ‘현재 대상 없음’이어도 명시 전역/저장된 채널 관리만 사용할 수 있다.
- TAB에서만 좁은 별도 body 클래스와 최소 레이아웃 조정을 사용한다. 350px toolbar 크기는 유지하며 확대/좁은 창·키보드 Tab/Enter/Space·focus·status role/aria-live·명시 label을 보존한다. hidden controls에 focus가 남지 않는다. 저장/적용/지원 상태는 분리한다.

## 3. 전달되는 대상: 선택 의도와 권한 분리

toolbar 시작 시 **한 번** 조회한 실제 active/currentWindow TAB에서 창 ID·incognito 사실을 보관한다. CHZZK origin 확인에 성공하면 스타일용 tab/window pair를 캡처한다. 이와 별개로 canonical/live 32hex 경로 확인에도 성공할 때만 channel ID를 추가해 current 채널 triple을 만든다. VOD는 pair-only다. broad tabs 탐색/계정/쿠키/사이트 이름 조회는 하지 않는다.

own URL의 query 계약은 다음 세 형태만 정상이다. raw search 길이는512자 이하, hash는 빈 값, 알 수 없는/중복 key·빈 값·tab/window 중 한쪽 누락 또는 pair 없는 channel ID는 대상 오류다.

1. `mediaSettings=1`: 대상 없는 전역/저장 채널 관리.
2. `mediaSettings=1&targetTabId=<id>&targetWindowId=<id>`: 캡처한 CHZZK 대상 pair. VOD/채널 식별 불가에서도 기존 스타일 대상만 유지한다. current 채널 선택은 disabled다.
3. `mediaSettings=1&targetTabId=<id>&targetWindowId=<id>&targetChannelId=<32lowerhex>`: 캡처한 live/canonical 대상. 기존 스타일 대상과 별개로 current 채널 검증에 사용한다.

ID는 최대16자리 canonical 10진수(0 또는 첫 자리1–9), nonnegative safe integer다. channel ID는 대소문자 없는32자리 lowerhex로 정규화된 **공개 채널 ID**이며 계정 ID가 아니다. channel ID를 tuple에 넣는 이유는 팝업 캡처 후 TAB이 열리기 전에 A→B 이동해 B를 원래 대상처럼 선택하는 문제를 막기 위해서다. documentId·incognito flag·preset 이름·values·임의 URL/selector는 전달하지 않는다.

- 모든 URL은 `chrome.runtime.getURL('popup.html')` + URLSearchParams로 구성한다. query의 임의 문자열을 navigation target/HTML/script로 실행하지 않는다. toolbar의 정상 URL에는 캡처한 tuple만 들어간다.
- `tabs.create`는 캡처한 창 ID를 명시한다. 클릭 시 그 창의 존속/Chrome incognito 사실을 재확인하고 실패/사실 부재이면 열지 않는다. 다른 창으로 fallback하지 않는다. incognito이면 새 media TAB을 열지 않고 제한 이유를 안내한다. 기존 v1/스타일의 시크릿 의미는 변경하지 않는다.
- query가 비정상이면 current 대상은 영구 disabled, 대상 오류를 표시한다. 유효 모드에서 전역/저장 채널 관리 자체는 허용하지만 target을 복구·재해석하거나 active 탭을 대체하지 않는다. 모드 자체가 알 수 없거나 중복이면 media client를 시작하지 않는다.
- media TAB은 triple로 `tabs.get`해 정확한 id/window/CHZZK origin/정규화 channel/incognito=false를 모두 확인해야 current 선택을 활성화한다. 다른 채널을 자동 채택하지 않는다. pair-only는 별도 스타일 target으로 id/window/CHZZK origin을 재확인하며 channel을 새로 추정하지 않는다. 비CHZZK·정보 부재는 targetless다. VOD→media TAB→styles 화면에도 pair를 전달하며 원래 VOD만 적용용 새로고침할 수 있어야 한다.
- query는 신뢰할 수 없는 **사용자 선택 의도**다. own 설정 문서 인증을 대신하지 않으며, broker의 current selection도 지금과 같이 Chrome tabs.get과 request channel을 별도 대조한다. query를 바꿔도 외부 문서가 writer가 되거나 incognito 저장 제한을 풀 수 없다.
- 탭/창 닫힘·창 이동·origin/channel 변경을 발견하면 current 편집을 제한하고 ‘대상 변경, 해당 방송에서 다시 열기’를 안내한다. 다른 채널로 자동 전환/삭제/재생성/기본값 저장하지 않는다. current 대상 실패가 global/saved scope의 독립 정상 저장을 끌어내리지 않는다.
- 대상 ID는 세션 수명이다. 브라우저 재시작으로 복원된 settings TAB은 복원 전 대상을 계속 인증한다고 보장하지 않는다. 실제 tuple 확인 실패 시 current를 막는다. ID+channel이 우연히 다시 일치하는 세션 간 동일 문서 인증을 주장하지 않는다. 사용자 명시 선택과 현재 Chrome 재검증이 저장 기준이다.

## 4. 유지하는 보안·저장 경계

1. v2 decoder의 own extension ID/정확한 popup.html 또는 styles.html pathname/frame 검사와 **Chrome sender.documentId 필수**는 그대로다. query에서 문서 ID를 받아들이지 않는다.
2. broker의 해당 documentId `runtime.getContexts` 조회(2초 bound), 단일 실제 context, documentUrl/origin 일치, TAB frame0 또는 기존 POPUP frame0/-1, incognito 사실 검증을 유지한다. metadata 부재/중복/timeout/폐기 문서는 fail closed다.
3. writer 큐에서 작업 시작과 commit 직전에 실제 문서/대상 사실을 다시 확인한다. sameURL의 새 문서가 닫힌 문서의 request를 승계하지 않는다. URL만으로 다른 getContexts 결과를 대신 찾지 않는다.
4. 저장 shape/range/size·safe revision·record/domain/preset 생성 토큰·동일 필드 직렬 최종값/다른 필드 merge·stale/conflict/unknown 처리를 유지한다. old pending을 새 scope에 적용하거나 자동 retry/create하지 않는다.
5. 시크릿 문서/current 대상의 media mutation은 거부한다. 시크릿 호출을 normal 창에 대신 열어 저장하는 우회도 없다. 전역 v1 경로가 기존 권한을 가진 것은 유지하되 channel/preset mutation을 v1 patch로 우회하지 않는다.
6. current 대상 확인 직후 navigation과 storage는 원자 transaction이 아니다. 저장 key는 캡처한 channel 그대로이고 runtime token은 새 route에 옛 overlay를 적용하지 않는다. 동일 URL document 교체를 완전 브라우저 원자성 보장으로 표현하지 않는다.

임의 query가 own 문서의 표시 대상을 바꾸는 것과 외부 사이트가 저장 권한을 얻는 것은 다른 문제다. 설정 문서 URL은 web_accessible_resources에 추가하지 않는다. 읽기/자동 TAB 열기로 신규 media mutation을 만들지 않으며 전역/저장 scope 전환·수정·파괴적 삭제는 사용자 동작과 기존 토큰 검증을 필요로 한다. 기존 v1 legacy 초기화는 아래 별도 기준으로 보존한다.

### 4.1 파괴적 동작의 실제 확인 단계

현행 popup의 reset-channel-domain/delete-channel/delete-preset handler에는 확인 단계가 없다. 이를 이미 구현된 보호로 간주하지 않고 **이번 보완 구현 요구사항**으로 포함한다. 새 modal framework 없이 native confirm을 사용한다. ‘전역 사용’은 도메인 저장값 삭제임을, 채널/프리셋 삭제는 해당 대상과 영향 범위를 명확히 알린다.

확인 전 selection/domain/생성·record·preset 토큰을 캡처한다. 취소는 요청/쓰기0, 확인은 캡처한 의도로 한 번만 mutation한다. 확인 사이 다른 창이 수정·삭제/재생성하거나 scope가 달라졌으면 기존 revision/token 검증으로 conflict/무변경이며 새 토큰 자동 대체·재시도·자동 재확인은 없다. current 대상 변경도 기존 broker 검사로 거부한다. 프리셋 삭제가 이미 복사한 채널값을 바꾸지 않는 기존 의미는 유지한다.

## 5. 수명주기·오류와 개인정보

- 각각의 settings TAB은 기존 두 client의 독립 snapshot/dirty/generation/transport를 가진다. 새 전역 client registry/port/session cache를 만들지 않는다. 두 TAB에서 서로 다른 필드가 모두 남아야 하고 shared storage로 최신값을 구독한다.
- pending/unknown 상태에서 scope 변경을 막는다. 현행 UI에는 폐기만 있고 명시 read-back 버튼은 없으므로, **‘현재 저장값 다시 확인’**을 이번 보완에 추가한다. 기존 refresh는 unknown을 값 일치로 정산한 뒤 flush할 수 있으므로 그대로 연결하지 않는다. media client의 조회와 dirty 전송을 분리해 명시 read-back은 기존 UUID·draft·토큰을 보존하고 mutation/자동 재전송0이 되도록 보완한다. 현재 값만 같은 patch-channel-fields의 과거 성공 확정은 제거한다. original UUID/생성 의도에 대해 기존 독립 idempotency 근거가 있는 생성 확인만 허용하며 그 뒤에도 최신 unsent draft를 자동 flush하지 않는다. 확인 근거가 부족한 작업은 unknown이다. storage event/refresh가 동일 불명 요청을 자동 재전송하지 않아야 한다. 명시 폐기와 구별하며, 재적용은 최신 snapshot/토큰·표시된 의도 확인 뒤 별도 사용자 mutation이다. ACK 유실+추가 storage event 없음+더 최신 unsent draft를 UI/기존 client 양쪽에서 검증한다.
- `pagehide`는 두 client를 dispose하고 편집 controls를 잠근다. 복원된 문서의 pageshow(persisted=true)는 **ready가 아닌 재연결 필요 상태**를 표시하며 편집은 계속 불가다. 기존 snapshot/draft/표시 의도와 이미 보낸 요청의 결과 불명 경고를 읽기 전용으로 남긴다. 자동 재초기화/재전송/rollback은 없다. 명시적인 ‘설정 탭 새로고침’ 버튼으로 새 문서를 로드하는 최소 정책을 사용하며, 남은 draft를 잃을 수 있고 이미 보낸 저장은 완료됐을 수 있음을 먼저 안내·확인한다. 새 문서가 실제 저장값을 읽기 전에는 성공/취소로 판정하지 않는다. initial pageshow는 정상 boot다. 합성 persisted 검사와 실제 extension URL BFCache/freeze 관측은 별도이며 미실행을 PASS로 세지 않는다.
- 프리셋 생성은 **화면에 표시된 확정 값과 저장할 값의 일치**를 요구한다. 두 phase가 ready인 것만으로 충분하지 않다. 전역 scope에서는 confirmed v1 snapshot의 도메인 값을 사용하며, v1 pendingKeys0/phase ready와 v2 snapshot의 globalRevision 일치가 확인될 때만 생성 가능하다. channel scope에서는 표시된 확정 scoped 값/selection/토큰을 사용하고 해당 값이 전역 상속을 포함하면 같은 globalRevision 일치가 필요하다. pending field/draft를 프리셋 확정값으로 저장하지 않는다. 불일치면 생성만 대기/제한하고 일반 v1 편집은 계속 가능하다. v1 밝기2 저장·v2 이전 밝기1 snapshot 지연 중 생성 시도는 mutation0이며, 확인 뒤 생성한 프리셋은 표시된2여야 한다. 전역값에 의존하는 활성화/적용에도 기존 expected revision conflict를 유지한다.
- media auth/read/손상/지원 실패와 v1 상태는 독립이다. media controls가 unavailable이어도 정상 전역 편집/스타일을 계속 쓸 수 있어야 한다. target validation 실패도 saved/global 관리 실패로 확대하지 않는다.
- 새 storage key/schema/operation/counter·권한/origin·네트워크·외부 전송·원격 코드·telemetry·account/cookie/history API는 추가하지 않는다. 로컬 명시 저장 channelId/설정/프리셋 이름은 사용자 설정 데이터라는 F00 고지는 유지한다.
- query의 공개 channelId/Chrome 대상 IDs는 설정 TAB 표시와 대상 확인을 위한 일시적 입력이며 extension storage에 별도 history/방문 기록으로 저장하지 않는다. local Chrome의 탭/세션 복원 자료에 own URL이 남을 가능성은 있으므로 ‘어디에도 흔적이 남지 않는다’고 주장하지 않는다. 새 로그인·동기화/외부 전송 기능은 없다.
- catalogue/preset 이름/channel ID/document ID를 MAIN/status/진단/공개 CI 산출물로 전달하지 않는다. 렌더링은 textContent와 수치 input만 사용한다. synthetic 채널/이름만 공개 테스트에 쓴다.
- Chrome [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions)는 생성 등 대부분의 동작에 tabs 권한이 필요하지 않고 기존 host 권한이 해당 URL 정보를 허용한다고 설명한다. [MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender)의 선택 metadata는 여전히 fail-closed 조건이다. 이는 설계 근거이며 정책/취약점 무결성 인증이나 심사 통과 보증은 아니다.

## 6. 영향 경계

| 위치 | 이번 보완 책임 |
| --- | --- |
| src/settings/popup.ts · popup.html · popup.css · ko/en locale | UI 모드/explicit open/캡처 tuple/안전 parser·대상 검증/선택 안내, 기존 UI 재사용. 불필요한 새 entry/module/page 없음 |
| src/settings/client.ts · contract.ts · broker.ts | broker 권한·저장 계약 변경 없음. client의 read-back/dirty flush를 분리하고 equal-value patch 성공 확정을 제거한다. 기존 transport/dispose/세대·생성 토큰 재사용, UI 표시값/revision 일치·폐기/복원 정책 연결. 인증 완화 금지 |
| tests/settings-fixture.cjs · media-ui/settings-ui/multi-ui/broker/contract tests | 실제 모드/target/Chrome metadata fixture 분리. 기존 전역 toolbar 및 순수 저장 사례 보존 |
| scripts/extension-e2e/harness.mjs 및 기존 설치 scenario/tests | 실제 toolbar 버튼→TAB·실제 document writer qualification·저장4관측/손실 negative. 직접 저장 positive 금지 |
| generated popup.js · runtime inventory/build/type/proof fixtures | 기존 generation 계약대로 재생성·drift 검증. 자산59 유지, 역사 baseline/hash 및 원본 ZIP/CRX 불변 |
| PLANS.md · 기존 F00 Task5 계획/검증 · privacy/README | 별도 TAB UX와 수용기준 연결. 원래 실패/보존 제한/whole-F00 미완료 유지 |

## 7. 수용 체크리스트 — 계획 승인을 위한 요구사항, 아직 PASS 아님

- [ ] 실제 toolbar popup에는 전역 controls와 열기 버튼이 있으며 media mutation/catalogue read0. 클릭 없이 자동 TAB 생성0/신규 media mutation0/mediaProfiles 생성0. 기존 v1 legacy resizeChat/t 이관·정리는 원래 baseline과 별도 대조하며 전체 storage write0이라고 요구하지 않는다.
- [ ] TAB 직접 열기/targetless·정상 pair-only·live triple/비정상 query/unknown mode/중복·잘못된 부분·overflow IDs/iframe/키보드·focus·좁은 창을 검증. VOD→TAB→styles→원래 VOD reload도 포함한다. 상대·외부 URL 실행0, manifest 권한 증가0.
- [ ] toolbar 캡처 뒤 A→B·다른 창 focus·원래 창 닫힘·창 이동·시크릿·같은URL 새문서에서 원래 의도 보존/거부. target 없으면 global/saved만 가능. 다른 TAB 자동 선택0.
- [ ] **실제 설치 qualification**: toolbar 버튼으로 연 TAB에서 production sender의 own id/documentId/frame0과 정확한 TAB context 확인 후 UI 입력. sender/context 없이 입력 시작 금지; 실패는 STOP이고 직접 storage positive로 대체하지 않는다.
- [ ] actual POPUP의 missing documentId 요청은 여전히 거부. 다른 extension/site/MAIN/iframe·위조 payload doc/incognito·복수 context·문서 폐기·queued 폐기·재생성은 무쓰기/명확한 오류.
- [ ] TAB에서 실제 current/saved/global field·preset 저장과 다른 창 field merge·현재 방송 적용/preview 전역 독립을 확인. 파괴적 확인 취소는 mutation0, 확인은 캡처 의도로1회, 도중 수정/재생성/대상 변경은 conflict·거부이며 다른 도메인/복사한 preset 값 보존.
- [ ] 지연 v2 snapshot 중 전역 표시값과 다른 preset 생성0, revision/confirmed 값 일치 후 정확한 preset 생성. channel/global 양 scope와 v1 독립 정상 편집을 검사한다.
- [ ] ACK 유실+최신 unsent draft가 남은 상태에서 UI 명시 read-back과 storage event 경로의 mutation0·UUID/draft/토큰 보존을 검사한다. equal-value patch 성공 확정0, 생성 확인 뒤 자동 dirty flush0. 확정 불가 commit은 unknown, 재적용은 최신 토큰 확인 뒤 사용자 동작, 명시 draft 폐기는 rollback이 아니다. 기존 client의 자동7→5 전송 기대 테스트도 승인 계약에 맞춰 보완한다.
- [ ] persisted 복원된 TAB은 입력 disabled·ready 표시0·새 저장0, draft/결과 불명 안내 유지. 사용자 확인 후 own TAB reload만 실행하고 새 문서에서 실제 재조회한다. 합성 event와 실제 BFCache 관측을 구분한다.
- [ ] media unavailable/corrupt/target changed에서도 정상 v1 전역·스타일 사용. unknown/scope 전환/문서 닫힘·늦은 commit/worker 재시작에서 손실/거짓 완료 없음.
- [ ] 원래 Task5 actual popup 저장 수용을 **toolbar 열기→own TAB 실제 편집**으로 교체하되 실제 toolbar open 검사는 남긴다. CDP popup attachment는 transport 증거일 뿐 writer/auth/save PASS가 아니다.
- [ ] clean checkpoint의 격리 old→new→old→new **저장4관측**, config/media 손실 negative, 기존 전체/9기반·정책/패키지·보호 대조·whole-F00 Astra max 수행. 이 설계 검토로 대체하지 않는다.

## 8. 승인 게이트

- [x] 사용자: 인증을 완화하지 않는 별도 TAB 상세 설계/Astra max 검토 승인, 보안 보존 명시.
- [x] root: source/연결 호출자·기존 계약·대안·개인정보/권한·자가 모순 검토.
- [x] Astra max 최초 Critical0/Important5/Minor1·6항목 보완·targeted closure 기록. 제품 구현/전체 검증 결과 아님.
- [x] 사용자 시각 목업/UI·written-spec 및 toolbar→TAB 수용기준 변경 승인2026-10-14. 상세 계획 작성/검토로 진행하되 실행/공개 승인 아님.
- [x] 사용자 상세 구현 계획·기존 Native 실행 승인2026-10-14. 사용자 승인 문서는 이후 한글로 작성한다. 구현/실제 수용 완료와 구분한다.

현재 F00 Task5/6은 미완료다. 루트 dist·시청 Chrome·P09·원본 파일/보호 브랜치는 변경하지 않으며 push/PR·버전·공개는 하지 않는다.
