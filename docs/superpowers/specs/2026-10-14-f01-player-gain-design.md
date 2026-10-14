# F01 보완 — 플레이어 Gain 조작의 영구 저장

2026-10-14. 사용자 ‘플레이어 Gain이 왜 임시인가?’ 및 ‘설계 보완’에 따라 작성했다. [F01 전체 명세](2026-10-14-f01-audio-processing-design.md)의 임시 Gain 전용 제안을 이 문서로 대체한다. **상태: 설계 보완·Astra targeted 확인 및 사용자 설계/최신 목업 승인 완료.** 최신 trusted 더블클릭 의도까지 상세 구현 계획/Astra max 검토에 포함하며, 과거 targeted 확인을 새 조작 경로의 검증으로 전용하지 않는다. 제품 구현·설치/실험·새 권한·F01 push/PR/병합·버전/스토어 변경은 별도 승인 전 하지 않는다.

## 1. 목적·선택과 사용자 영향

사용자는 플레이어에서 Gain을 조절하고 다음 진입에도 그 값을 유지할 수 있어야 한다. 정상 저장을 위해 매번 설정 탭을 열게 하지 않는다. 현재 오디오 출처가 전역이면 전역에, 이미 채널 오디오 도메인이 있으면 해당 채널에 Gain만 저장한다. 채널 Gain이 상속 상태여도 그 채널의 직접 조작은 채널 소유 Gain으로 전환한다. 자동으로 새 채널/프리셋을 만들거나 다른 효과값을 복사하지 않는다. 채널 저장을 새로 켜거나 저장 범위를 바꾸는 관리는 기존 설정 탭에서 한다.

플레이어에 ‘전역 저장’ 또는 ‘현재 채널 저장’을 항상 표시한다. 전역 조작이 다른 전역/상속 채널 탭에도 반영되는 영향, 채널 직접 조작이 상속을 해제하는 영향을 접근성 설명/최초 안내에 포함한다. VOD 등 기존 F00 계약으로 채널을 확인하지 못하는 route는 전역 저장이며 MAIN이 주장하는 채널 ID를 받아 저장하지 않는다.

| 안 | 판단 |
| --- | --- |
| MAIN slider→postMessage→범용 저장 | 제외. 페이지에 노출되는 요청을 설정 탭 권한과 같게 취급하고 임의 필드/대상 변경 위험을 키움 |
| **ISOLATED 소유 Gain 조작부→Gain 전용 broker→기존 queue** | 권장. 플레이어 자동 저장을 유지하고 현재 문서/출처의 Gain 한 쌍만 변경. 새 content writer 역할의 검증을 별도로 추가해야 함 |
| 확장 origin iframe Gain 조작부 | 이번 제안에서는 제외. 추가 web-accessible 자산·임베딩/프레임·렌더링 계약이 필요함. 권장 경로의 native 검증이 실패하면 별도 승인 후 비교할 대안이지 자동 fallback이 아님 |

정상 조작은 즉시 소리에 반영하고 자동 저장한다. 저장 중에는 ‘저장 중’, ACK 확인 후 ‘저장됨’을 표시한다. 실패/충돌/응답 유실에서는 미저장·결과 불명을 구분한다. 일시 값만 남는 경우는 실패/아직 승인된 저장 경로가 없는 제한 상태이지 정상 기능의 기본 의미가 아니다.

후속 UI 승인: Gain 더블클릭은100%(내부1)의 명시 소유값 설정이며 상속 재선택이 아니다. 소수2자리 표시 제한 때문에 원값과 소리를 바꾸지는 않는다. 실제 플레이어 연결 시 이 조작도 동일한 소유 UI·대상/의도·broker queue 경계 안에서 처리해야 한다. 기존 input/change/키보드만의 설명에는 새 trusted dblclick 경로를 보완해야 하며 synthetic input을 만들어 권한 근거로 삼지 않는다. 아래 기존 판별/경쟁/유실 계약을 완화하지 않는다. 이 추가 조작은 과거 Astra targeted 확인의 범위 밖이며 상세 계획/Astra max 재검토와 native positive/negative 입력 검증에서 마감한다. 현재는 목업에서만 동작한다.

## 2. 역할·최소 변경 경계

기존 MAIN 오디오 버튼/실제 DSP는 유지한다. **Gain range와 저장 상태만 ISOLATED의 번들 코드가 생성·소유**한다. MAIN의 기존 durable setGain/localStorage 쓰기는 제거하고 읽기 fallback만 유지한다. MAIN에는 현재 영상의 미리 적용 Gain과 확정된 설정만 전달하며 MAIN에서 오는 Gain 저장 명령은 수신하지 않는다.

조작부 내부는 닫힌 ShadowRoot로 캡슐화하고 JS 참조·staged intent는 ISOLATED의 private closure/고정 private registry에만 둔다. 내부 노드를 MAIN/DOM dataset/custom event/postMessage로 공개하지 않는다. UI 값 변경 요청을 받는 공개 함수도 만들지 않는다. 저장 의도는 이 소유 range의 실제 사용자 input/change/키보드 조작에서만 생성한다. synthetic 이벤트·부적절한 target·분리된 소유 node는 거부한다.

**Shadow DOM이나 isTrusted 하나를 보안 경계/사람의 승인 증명으로 주장하지 않는다.** DOM은 페이지와 공유되므로 페이지가 host를 가리거나 제거·이동하고 사용자를 오도할 가능성은 남는다. 문서/native sender 검증과 제한된 저장 권한을 함께 적용하며 페이지의 UI 무결성·실제 DSP 출력 자체를 인증하지 않는다. 실제 video/document/route·저장 binding 변경, 소유 조작부 교체, 임의 page 재배치는 retirement다. 예외는 ISOLATED 소유자가 같은 실제 video 객체·문서/route·binding과 원래 private host/ShadowRoot 참조를 직접 확인하고 그 동일 host를 새 PZP 부모에 재배치하는 경우뿐이다. 검사 중에는 새 입력/전송을 보류하고 reparent 완료·native 재확인 뒤 재개한다. 이 경우 actor/기존 draft는 유지하되 새로운 조작부에 의도를 복사하지 않는다. 판별 불가/외부 host 교체는 저장 권위를 폐기하고 남은 값은 표시용 미저장 초안으로만 안내하며 새 scope/조작부로 자동 전송하지 않는다.

MAIN의 player/mount 알림은 위치/미리 적용용 힌트일 뿐 저장 scope를 결정하지 않는다. ISOLATED가 현재 top-frame route·자신의 소유 조작부와 수명주기를 확인하고 worker가 native 탭 정보와 저장 상태로 scope를 재구성한다. 다른 iframe·미리보기 video에는 이 writer를 설치하지 않는다.

## 3. Gain 전용 요청·권한

새 namespace `cheese-knife-player-gain`/protocol3는 `get-gain-view`와 `set-gain`만 지원한다. 기존 cheese-knife-settings의 설정 TAB/popup 전용 sender 조건을 완화하지 않는다. 새 역할은 같은 broker의 **동일 직렬 queue**에 합류하며 storage에 직접 쓰지 않는다. 전체 catalogue·preset 이름·임의 config·스타일·실행 코드·삭제/upgrade action은 읽거나 변경할 수 없다.

get-gain-view 요청에는 고정 header/requestId만 있다. Chrome이 제공한 sender.id가 자기 extension ID, sender.tab.id/windowId가 실제 탭과 일치, sender.frameId=0, sender.documentId가 유효하며 sender.origin/url이 허용된 CHZZK route여야 한다. incognito·제외 route·opaque origin·외부 확장/외부 메시지는 거부한다. payload의 tab/window/channel/URL/문서 주장으로 대체하지 않는다.

worker는 native tabs.get과 고정 frame0 ISOLATED probe의 InjectionResult.documentId를 실제 sender.documentId와 대조한다. probe는 임의 코드/key/selector를 받지 않으며 현재 URL·조작부의 private 소유 상태·bounded staged intent만 반환한다. 이미 있는 scripting/CHZZK host 권한으로 검사하고 각 probe2초/사전 검사 합계4초 상한을 둔다. content script를 확장 페이지로 오인해 runtime.getContexts의 TAB 조건을 재사용하지 않는다. 실제 native 결과가 이 경계를 증명하지 못하면 저장 기능을 제한하고 새 설계 승인 없이 인증 검사를 생략하지 않는다.

worker가 주는 불투명 ticket은 현재 worker 세대·native tab/window/document·정규 route·worker의 URL 변경 epoch·저장 scope/채널 생성 토큰·현재 Gain 쌍을 묶는다. ticket은 MAIN에 보내지 않고 ISOLATED에만 보관한다. worker 세대/문서/route/채널 도메인 토큰이 바뀌면 폐기한다. ticket에는 현재 scope의 Gain epoch 및 상속 source의 의존 epoch도 포함한다. native tabs.onUpdated의 URL 변경/탭 종료와 private 조작부 retirement를 반영하며 A→B→A도 새 epoch로 본다. opaque nonce만으로 권한을 인증하지 않는다. 초기 Gain의 legacy 출처는 기존과 같은 literal knifeGain 고정 읽기/유한 범위 검증만 하며 raw 문자열을 전달하지 않는다. 확인 실패는 미확인으로 표시하고 MAIN 주장값을 확정 저장값으로 채택하지 않는다.

set-gain의 exact own keys는 header/requestId/ticket/intentId/value뿐이다. value는 finite0..2이며0도 유효하고 반올림하지 않는다. worker가 확인한 private staged intent와 request의 intentId/value가 일치해야 한다. scope/channel/저장 key/임의 필드·실행 코드는 payload로 받지 않는다. probe가 반환한 URL도 native tabs.get과 대조한다. 미확인 legacy Gain을 확인값으로 사칭하거나 자동 가져오지 않는다. 사용자가 직접 설정한 새 Gain만 저장한다.

ticket/intent/requestId는 최대128자의 고정 형식이고 작은 actor 상태만 유지한다. actor 최대64개, 마지막 접근60초 후 만료, 종료/문서·route 변경 시 삭제한다. 만료/worker 재시작 후에는 아래 깨끗한 상태의 새 gesture 준비로 첫 조작을 처리한다. 이미 보내거나 실패/불명인 미저장 intent를 새 token/scope에 자동 재전송하지 않는다. heartbeat/worker 생존 유지용 Port를 추가하지 않는다.

## 3A. 휴면·만료 뒤 새 첫 입력 준비

초기 mount는 read-only view를 확보한 뒤 range를 활성화한다. heartbeat 없이 실제 focus/pointerdown/키보드 조작 시작에서 read 준비를 하고, 모든 새 gesture의 첫 전송 전에도 view를 재확인한다. **clean(미저장/전송 중/unknown 없음) 상태에서 시작한 새 실제 gesture**만 준비 중 후보값을 최신1개로 보관하고 즉시 소리에 미리 적용할 수 있다. 이 후보는 durable intent/request가 아직 아니며 이전 요청의 재시도가 아니다. 새 actor/worker 세대에서도 새 문서/scope/토큰·기준을 검증한 뒤 그 gesture의 최초 intent를 생성한다.

새 view는 조작 전 표시한 scope·생성 토큰·Gain/상속/출처/유효값과 대조한다. warm ticket에서는 해당 Gain/source epoch가 같아야 한다. worker 세대/actor 만료로 이전 epoch 이력을 증명할 수 없으면 조작 전 표시한 global/media revision도 정확히 같아야 한다. cold 준비에서 revision이 바뀌었으면 값이 같아도 후보를 자동 저장하지 않고 충돌·최신값 확인을 안내한다. warm 상태의 unrelated 필드 변경은 기존 field merge를 유지한다. 기존 사이트 legacy 값은 fresh fixed read를 대조하며 이 값에 확장 revision이 있다고 꾸미지 않는다.

기준이 그대로면 추가 사용자 조작 없이 후보의 최종값을 **처음 한 번** 저장한다. read 준비도5초 전체 deadline 안에 포함하고 실패/문서 retirement/dirty 외부 변경이면 후보를 미저장으로 보존한다. 준비 중 추가 input은 같은 새 gesture의 최신 후보1개로 합치며 false 성공/새 범위로 retarget하지 않는다. 이미 in-flight/unknown/실패/충돌 초안이 있으면 이 준비 경로로 옮기지 않고 기존 폐기·재조회 절차를 먼저 거친다.

## 4. 저장·다중 탭·충돌

queue에서 최신 config/media raw를 읽고 sender/현재 문서·route·private intent와 ticket의 scope/토큰을 다시 검증한다. 채널 오디오 도메인이 없어진 경우 전역으로 자동 retarget하지 않는다. 전역/채널의 저장된 audioGain/gainInherited 쌍 또는 해당 Gain/source epoch가 조작 시작 때와 달라지면 conflict로 거부한다. 같은 값으로 돌아온 A→B→A도 epoch가 달라 오래된 요청은 거부한다. unrelated 필드 변경은 최신 raw에 Gain 두 필드만 병합하며 지우거나 복사하지 않는다. scope/도메인 생성 토큰이 같은지와 Gain 쌍 충돌을 별도로 검증한다.

Gain epoch는 새 영구 저장 필드가 아닌 worker의 휘발 상태다. 현재 active scope(최대64개)만 추적하며 entry를 폐기하면 연결 ticket도 무효화한다. 모든 Gain 변경 경로(플레이어/설정 TAB 직접 편집·legacy 가져오기·preset·상속 전환·channel reset/delete/upgrade)를 동일 broker queue에서 관찰해 **저장 성공 전에 관련 기존 ticket을 보수적으로 무효화**한다. 실패면 재조회가 필요할 수 있지만 옛 ticket을 되살리지 않는다. 성공 후 자기 요청의 ACK만 새 epoch 기준을 발급해 다음 자기 draft를 이어간다. 새로운 scope/출처나 외부 commit을 자기 ACK로 위장하지 않는다.

전역 Gain/출처 변경은 전역 및 그 출처를 상속하는 channel ticket을 함께 무효화하며 channel-owned Gain에는 영향이 없다. 채널 token 재생성/상속 전환은 값이 같아도 무효화한다. settings/media raw의 unrelated 필드만 바뀌면 Gain epoch를 바꾸지 않는다. storage.onChanged의 이미 처리한 자기 commit 알림은 bounded outstanding receipt(최대64개, 실제 저장 key/전후 Gain 상태/해당 revision)를 대조해 중복 epoch 갱신하지 않는다. receipt 용량이 차면 새 관련 commit을 시작하지 않고 busy로 반환하며 receipt를 조용히 버리지 않는다. 알려지지 않은/non-monotonic raw 변경은 관련 ticket을 무효화하고 fresh read로 제한한다. callback 늦음/중복으로 자기 ACK의 새 ticket을 잘못 무효화하지 않는 순서도 검사한다.

legacy 사이트 저장소는 확장 commit epoch로 모든 변경 이력을 증명할 수 없다. 관측된 storage/source 변경은 private view를 무효화하고 fresh legacy 수치가 달라지면 거부한다. 미관측 사이트 localStorage A→B→A까지 검출한다고 주장하지 않는다. 이 fallback 값은 자동 가져오기/기존 owned 값 덮어쓰기 권위가 아니며 사용자의 명시 새 Gain만 저장한다. owned Gain/source의 ABA 수용 기준과 이 한계를 구분한다.

commit은 worker가 `{audioGain:value,gainInherited:false}`만 만든다. 전역은 config/settingsRevision만, 채널은 기존 audio 도메인의 두 값과 관련 record/store revision만 변경한다. schema1은 명시 upgrade가 필요하며 미래 schema/손상/overflow/quota/incognito는 쓰기0. absent의 전역 Gain 저장은 config만 쓰고 새 media item을 만들지 않는다. 스키마 전환/채널 생성/상속 재선택/프리셋 관리는 기존 own 설정 TAB만 수행한다. raw unknown/다른 효과·영상·전역 기본값은 보존한다.

저장 직전 native 탭/문서·private intent를 재확인한다. Chrome API 대조와 storage.set 사이를 플랫폼 원자적 트랜잭션으로 표현하지 않는다. 이미 시작한 commit 도중 navigation이 일어나면 캡처한 원래 scope만 저장될 수 있으며 새 scope에 재해석하거나 자동 rollback하지 않는다. 새 페이지/조작부에는 오래된 ACK를 표시하지 않는다. queue 전에 감지된 navigation·old document·ABA·scope reset은 쓰기0이다.

같은 scope의 두 화면이 동일한 옛 Gain에서 다른 값을 편집하면 먼저 commit한 요청만 성공하고 다른 요청은 conflict다. 서로 다른 채널은 독립이고 unrelated EQ/스타일 저장은 보존한다. dirty0인 화면만 최신 저장값을 따라간다. 편집 중 다른 commit이 오면 미저장 의도를 보존하고 충돌 표시하며 새 Gain/token을 자동 채택하지 않는다. ‘최신값 확인/보류 조작 폐기’ 후 새 사용자 조작만 새 의도로 저장한다. A/B 각각의 UI·소리는 어느 값이 저장된 것인지 구분한다.

## 5. 조작 속도·응답 유실·미리 적용

range 조작은 오디오 보정 ON일 때 즉시 현재 영상에 미리 적용한다. 한 actor는 in-flight1개와 최신 draft1개만 보유한다. trailing250ms 뒤 저장하고 change/pointer 종료/키보드 조작 종료는 대기 시간을 줄이되 broker actor당 commit 시작을 최대4회/초로 제한한다. 그 전에 새 값은 로컬 최신 draft로만 합친다. bounded actor queue/busy에서는 자동 재시도하지 않는다.

ACK 성공의 확정 version/ticket을 실제 요청/현재 document/intent와 대조한다. 이전 ACK가 다음 draft나 새 context를 덮지 않는다. 첫 요청 success 뒤 같은 actor의 후속 draft는 자기 ACK로 갱신한 기준에서 진행할 수 있으나 외부 commit/conflict/unknown 뒤에는 자동 갱신·재전송하지 않는다. read 준비만 실패하고 set-gain을 아직 보내지 않았으면 확인 가능한 쓰기0/준비 실패로 표시한다. set-gain 전송 뒤 응답 deadline5초를 넘으면 unknown이며 이미 진행 중인 storage 작업을 취소/rollback한 것으로 말하지 않는다. underlying write가 끝나기 전 후속 commit을 시작하지 않도록 UI와 worker actor를 잠근다. worker도 동일 intent 중복/동시 commit을 거부하고 전송 중 intent는 불변, 별도의 최신 draft만 교체할 수 있다.

실패는 ‘미저장’, ACK 유실은 ‘결과 불명’이며 미리 적용값과 확정 저장값을 별도 보존한다. 같은 scalar가 재조회돼도 원래 patch 성공을 인증하지 않는다. 원래 context 안에서 ‘보류 조작 폐기/최신 저장값 확인’ 또는 설정 TAB으로 해결한다. 새 route/진짜 video/문서 진입에는 미리 적용 의도를 폐기하고 저장값에서 시작하며 old intent를 재사용하지 않는다. PZP-only 교체는2절의 같은 private host/실제 video·binding 재배치 예외에서만 draft를 보존한다. 소유 조작부 교체/판별 불가는 권위를 폐기하고 표시용 초안만 남긴다.

mute/volume0/master OFF는 조작값 저장을 음소거 해제나 master 자동 ON으로 해석하지 않는다. 원래 Gain slider의 노출 조건을 유지하며 새 전체 ON 효과 조합에서의 입력만 지원한다. Gain0은 저장/재진입에도0이고 normalizer가 이를 상쇄하지 않는다. 컴프레서/EQ/노멀라이저·현재 master wanted는 Gain 저장으로 바뀌지 않는다.

## 6. 검증·중지 조건

| 영역 | 구현 후 필요한 증거 |
| --- | --- |
| 정상 UX | 실제 설치본의 플레이어 pointer/keyboard 조작→즉시 소리 적용→저장 ACK→닫기/재진입/재시작 유지. 전역/기존 채널·상속 해제·Gain0·0..2 유한 소수·VOD 전역 표시 |
| writer 경계 | 실제 Chrome sender/frame0/documentId와 고정 probe의 일치, content-script와 확장 TAB 구별. MAIN postMessage·DOM synthetic·payload scope/key/extra-field·iframe/excluded/incognito·wrong/old sender 거부. closed root를 사용자 인증/DOM 무결성 보장으로 표현하지 않음 |
| 데이터 손실 | 자기 field pair만 merge, unknown/영상/효과·preset 보존, schema1/미래/손상/overflow/quota 쓰기0, 전역 raw 보존, native scope 변경/삭제재생성/route ABA/old document 거부. owned Gain A→B→A·동일 값 source/상속 전환·TAB/preset/import 변경도 old ticket 거부, 자기 ACK ticket의 늦은 storage 알림 중복 무효화0·receipt64 busy·미관측 legacy 사이트 ABA 한계 분리 |
| 경쟁·유실 | 두 같은 scope 충돌, 서로 다른 채널 독립, unrelated 필드 warm 병합,250ms coalesce/4Hz/worker inflight1/불변 요청+draft1, late ACK·ACK loss·5초 unknown·dirty 외부 notify·폐기/재조회·no auto retry·no retarget. heartbeat 없는30초 이상 idle/actor60초 만료/worker 재시작 뒤 clean 새 gesture의 첫 input이 추가 조작 없이 저장; cold revision 변경·기존 unknown은 자동 재전송0 |
| DSP·수명 | 현재 preview와 저장값 상태 구별, master/mute/volume·Gain0 불변, genuine route/video retirement·같은 host/video/binding의 PZP 재배치 중 hold/검증 후 draft 보존. host 교체/판별 불가 권위 폐기·표시용 초안 구별, old callback 미적용, source1/기존 DSP gate 유지 |
| native 선행 확인 | approved clean 후보에서 private 조작부/native probe/실제 sender/toolbar가 아닌 플레이어 입력을 확인하는 첫 qualification. 실패하면 저장 제한/근거 보존 후 추가 설계 승인. 사용자 Chrome/P09·새 자산/권한·WAR로 임의 우회하지 않음 |

현재는 문서/정적 목업만 검토한다. native 선행 확인도 향후 구현 계획·실행 승인에 포함시켜야 하며 지금 실행하지 않는다. iframe/새 web-accessible 자산·더 넓은 권한·범용 content writer가 필요하면 별도 STOP이다. 실제 조작부 크기·키보드/접근성·전체 화면/PZP 재배치는 구현 후 확인하며 자동 저장을 테스트용 직접 storage 쓰기로 대신하지 않는다.

## 7. 연결 지도·개인정보·승인

추가 연결은 ISOLATED bridge의 좁은 Gain UI/수명주기, MAIN controls의 옛 slider 저장 제거/preview 소비, 전용 sender/request 계약과 기존 broker queue, schema2 Gain merge, i18n/CSS 및 실제 actor/설치/손실/경쟁 tests다. 큰 bridge에 모든 로직을 붙이지 않고 기존 settings 영역의 작은 모듈로 나눈다. 새 runtime asset가 생기면 기존 생성/타입/inventory/package 경계를 함께 갱신하되 현재 자산을 만들지 않는다.

권한 scripting/storage·CHZZK host/CSP·최소 Chrome121·외부 전송 없음은 유지한다. 저장 데이터는 사용자가 조절한 Gain/기존 scope 설정뿐이고 intent/ticket/문서 epoch는 일시 메모리다. 실제 계정/채팅·오디오 sample·사용 기록을 수집/로그/공개 fixture로 만들지 않는다. 기존 PRIVACY/공개 고지의 로컬 설정 저장 내용과 일치시키는 제출 전 게이트는 유지한다.

이 문서·전체 명세·목업·재검토가 하나의 written-spec 승인 묶음이다. 이전 Astra0/4/1 및 targeted Minor1의 설계 마감은 이 Gain writer 변경을 검토한 것으로 전용하지 않는다. 구현 계획/실행·push/PR/병합·배포는 별도 승인이다.

## 기술 근거와 주장 한계

[Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)는 JS 실행 공간 격리와 공유 DOM을 구분한다. [MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender)는 Chrome 제공 documentId/frameId/origin/tab의 의미를 정의한다. [Chrome 메시지 보안](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#security-considerations)은 content script 요청의 제한/검증을 요구한다. 격리 공간이나 native sender 한 항목만으로 무취약성을 인증하지 않는다. 추가 iframe이 필요한 [web-accessible resources](https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources)는 이번 제안에서 확대하지 않는다.
