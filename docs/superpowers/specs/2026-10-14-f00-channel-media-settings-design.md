# F00 — 채널별 오디오·영상 설정 저장 상세 설계

2026-10-14 / Asia-Seoul. 상태: **Astra max 최초 검토·5항목 보완/targeted 확인 완료·사용자 written-spec 승인 완료**. 기준 소스 `45100969200dfb5e33737db60c9a3fa7450f4450`(PR #43 병합/main CI 통과), 게시 기준2.13.3. 현재 별도 승인된 [구현 계획](../plans/2026-10-14-f00-channel-media-settings.md)의 Task5 실행은 중지됐고, [별도 설정 TAB 보완 설계](2026-10-14-f00-media-settings-tab-design.md)·Astra max 검토의 준비 승인을 받았다. 새 written-spec/수용기준·구현 승인은 아직이다. 이 문서의 과거 설계 승인은 실제 프로필 변경·버전·push/PR·배포 권한이 아니다. MAIN의 기존 순수 원본 번들 보완은 후속 관측 기록에 분리하고, 여기의 reviewed normative body는 변경하지 않는다. [검토 기록](../validation/2026-10-14-f00-design-review.md)의 최초 Critical0/Important3/Minor2와5항목 closure를 구분한다.

## 1. 확정 목적과 범위

사용자 확인: 계정별 저장이 아니라 **채널별 설정 분리**가 목적이며, **오디오·영상 필터만 채널별, 나머지는 전역**이다. 계정 ID·로그인 상태·쿠키를 읽거나 계정별 namespace를 만들지 않는다.

목표는 전역값을 보존하면서 선택한 채널에만 미디어 설정을 저장하고, 여러 창의 필드 수정·프리셋 적용·채널 이동·worker 재시작에서 손실/오적용을 막는 것이다. F00은 저장 기반과 현재 미디어 설정 연결, F01은 EQ/노멀라이저/Gain 통합이다. 차기 공개는 최소 두 단계의 구현·검증 후 별도 승인받는다.

| 범위 | F00 처리 |
| --- | --- |
| 영상 | brightness/contrast/saturation/gamma/sharpness의 현재 의미·범위 보존 |
| 오디오 | compressorDefault/Threshold/Knee/Ratio/Attack/Release의 현재 의미·범위 보존 |
| Gain·EQ·노멀라이저 | F01 소유. Gain은 현재 사이트 localStorage knifeGain에 있으므로 F00에서 자동 이관/삭제/초기화하지 않음 |
| 채팅·스타일·탐색·미리보기·사이드바 | 기존 전역 config/styles/styleParameters 유지. previewVolume도 전역 |
| 사용자 프리셋 | 오디오/영상 도메인별 저장·이름 변경·삭제·값 복사 적용. 계정/채널 ID를 프리셋에 넣지 않음 |
| 공유·내보내기·동기화·멀티뷰·후원/통나무 | 구현하지 않음. F01/F02 이후 별도 계약/승인 |

현재 오디오6필드와 영상5필드는 `src/settings/config.ts`의 CONFIGS를 기준으로 한 명시적 allowlist다. 새 오디오 기능 값을 unknown JSON으로 미리 수용하지 않는다. Gain의 채널 저장과 기존값 보존은 F01의 필수 연결 게이트이며 F00 완료만으로 전체 오디오 채널 저장 완료를 주장하지 않는다.

## 2. 기존 근거와 대안

`contract.ts`는 필드 검증·revision·raw unknown 보존, `broker.ts`는 단일 직렬 writer·legacy t/resizeChat 정리·전역 CSS 등록, `client.ts`는 dirty generation·unknown 응답·동기화를 이미 담당한다. `bridge.ts`는 local에서 읽고 제한된 config만 MAIN에 보내며 현재 변경 이벤트/readEpoch/BFCache 방어를 가진다. MAIN lifecycle은 최초 config와 route/player generation을 별도로 관리한다. audio/controller의 Gain 저장은 사이트 localStorage이며 broker 저장과 같지 않다.

| 안 | 판단 |
| --- | --- |
| 기존 전역4키 보존 + 신규 미디어 데이터1키 + 기존 broker 재사용 | **권장**. old2.13.3이 신규 키를 무시해 raw 데이터 보존 가능, CSS 전역 계약 유지 |
| 모든 전역/스타일을 한 새 설정 객체로 이동·dual-write | 불채택. 두 권위/다중키 migration·롤백 손실·전역 CSS 재설계가 불필요 |
| IndexedDB·sync·독립 broker/범용 plugin 저장 엔진 | 불채택. 현재 크기/기능에 필요 없고 수명주기·외부 전송/권한 범위 증가 |

비교 채팅 「치지직 확장 기능 비교」의 공통 저장/채널 전환/프리셋 요구와 [Platter의 기능 설명](https://github.com/lirpa62/Chzzk-Platter#readme)은 참고일 뿐 코드 복사·계정 기능·같은 DSP 값을 채택한 것이 아니다. 이전 비교의 자동 보상/계정 분리는 F05이며 이번 사용자 확인으로 F00에서는 제외한다.

## 3. 저장과 유효값의 권위

- 전역 `config`, `styles`, `styleParameters`, `settingsRevision` 및 기존 legacy 정리 규칙은 그대로 둔다. unknown 전역 필드/별도 top-level 키를 새 schema로 정리하거나 삭제하지 않는다.
- 신규 canonical 키는 `mediaProfiles` 하나다. `schema:1`, `revision`, `channels`, `presets`를 가진다. absent는 논리적 빈 저장소/revision0이며 읽기·부팅·사이트 방문만으로 키를 만들지 않는다.
- 모든 신규 변경은 기존 broker의 **같은 큐**에서 read→validate→merge→`storage.local.set({mediaProfiles: next})` 한 번으로 수행한다. 신규 revision은 이 객체 안에만 있다. 전역 revision과 혼동하지 않고 snapshot의 version은 `{globalRevision, mediaRevision}`이다.
- Chrome의 다중키 transaction/OS fsync 보장을 가정하지 않는다. 신규 record+revision은 한 item에 함께 담고 Promise 성공 후에만 stored=true. 읽기/쿼터/쓰기 실패·닫힌 응답/timeout은 현재 client의 실패/unknown 처리로 유지한다.
- 최종값은 **제품 기본값 → 기존 전역 config → 선택 채널의 해당 도메인 스냅샷**이다. 채널의 audio/video는 독립적이며 미저장 도메인은 현재 전역값을 따른다. 전역 변경이 저장된 채널 스냅샷을 덮지 않는다.
- 프리셋은 적용 시 전체 도메인 값을 복사한다. live preset 참조나 defaultPresetId를 저장하지 않는다. 원본 프리셋의 변경/삭제가 이미 적용한 채널/전역 값을 바꾸지 않는다. 임의 계층/부분 프리셋 inheritance는 없다.

```text
mediaProfiles = {
  schema: 1, revision: safeInteger,
  channels: [{ channelId, createdRevision, revision,
    audio?: { createdRevision, values: AudioValues },
    video?: { createdRevision, values: VideoValues } }],
  presets: [{ id, createdRevision, revision, domain, name, values }]
}
```

channelId는 lowercase32hex다. channel record는 audio/video 중 하나 이상 있어야 한다. 각 domain은 활성화 commit의 createdRevision과 현재 도메인의 **완전한 allowlisted values**를 가진다. 빈 객체/부분값을 저장하지 않는다. preset id는 사용자가 새 저장을 시작할 때 생성한 UUID이며 이름/값 수정 동안 바뀌지 않는다. record revision은 생성 시1이고 실제 record 수정마다 증가한다. record/domain createdRevision은 각각 생성 commit의 mediaRevision으로 고정한다. 삭제 후 재생성은 새 token이므로 늦은 이전 편집이 새 record/domain을 덮지 않는다.

`mediaRevision`/record revision/전역 revision은 nonnegative safe integer, 증가 시 MAX_SAFE_INTEGER를 넘으면 쓰기 차단/repair-required다. 읽기·동일값 no-op은 어떤 revision도 증가시키지 않는다. 순서는 정렬된 channelId/preset id로 canonical serialization하며 동등성은 field 값으로 판정한다.

### 3.1 도메인 상속의 예

| 저장 상태 | 오디오 유효값 | 영상 유효값 | 채팅·스타일·미리보기 |
| --- | --- | --- | --- |
| A의 audio만 저장 | A audio 스냅샷 | 현재 전역 video | 항상 전역 |
| B의 video만 저장 | 현재 전역 audio | B video 스냅샷 | 항상 전역 |
| A audio에 프리셋 적용 후 프리셋 수정/삭제 | 복사된 A audio 그대로 | 현재 전역 video | 항상 전역 |
| A audio를 ‘전역 사용’으로 초기화 | 현재 전역 audio로 복귀 | A video가 있으면 보존 | 항상 전역 |

상속은 도메인 단위이지 필드별 혼합이 아니다. 영상 중립값 `{brightness:1,contrast:1,saturation:1,gamma:1,sharpness:0}`을 명시 저장하면 전역의 비중립 필터를 따르지 않는 정상 채널 스냅샷이다. ‘기본값으로 설정’은 중립값 저장, ‘전역 사용’은 해당 도메인 삭제이므로 UI에서 다른 동작으로 표시한다.

## 4. 필드·용량·실패 경계

- 현재 CONFIGS의 finite number/min/max 또는 boolean 검증을 재사용한다. 문자열 수치 coercion·기존 정상 소수의 step 반올림·DSP 범위 변경 없음.
- channel 최대128개, 사용자 preset 최대64개(두 도메인 합계), label 최대48 Unicode code points/UTF-8 192bytes. display는 textContent만 사용한다. 제어문자·방향 제어 문자·빈 trim 결과는 이름에서 거부한다.
- 신규 전체 item은 key+JSON UTF-8 기준256KiB 이하, 중첩 구조는 정의한 깊이/field count만 허용한다. 배열 상한/own data descriptor/shape를 먼저 검사하고 제한 없이 unknown 객체를 순회/실행하지 않는다. unknown enum/id/key·NaN·Infinity·중복ID·잘못된 shape는 reject한다.
- Chrome local quota는 신규 item만이 아닌 전체 저장소에 적용되므로 앱 상한 통과를 실제 저장 성공으로 보지 않는다. 기존 다른 데이터와 함께 quota가 초과되면 이전 값과 draft를 보존하며 명시적 오류를 표시한다.
- 상한 초과 시 새 저장을 거부하고 사용자에게 선택 삭제를 안내한다. 자동 LRU/만료/방문 기록/lastSeen/통계/timestamp 기록은 없다.
- 손상/미지원 schema는 원본 item을 보존하고 신규 mutation을 차단한다. 기존 정상 전역값만 적용하고 channel feature는 limited/repair-required로 표시한다. silently empty reset·clear/remove·unknown field 재저장·별도 형식 fallback은 없다. 손상 raw 데이터 export/복구 UI도 별도 설계 없이는 제공하지 않는다.

## 5. 요청·쓰기·다중 창 계약

기존 settings namespace/protocol1의 전역 patch/get-snapshot/reload-target은 보존한다. 같은 broker listener가 protocol2의 좁은 media action을 검증/직렬 처리한다. 새 transport/독립 writer/전역 whole-object set 경로는 만들지 않는다.

mutation 권한은 extension의 정확한 popup.html/styles.html·own extension id·정상 frame에만 있고 실제 media UI는 popup에 둔다. 사이트 MAIN/ISOLATED·다른 extension·외부 origin·잘못된 protocol/action/shape는 mutation 불가다. content script는 기존 local 읽기만 하고 브라우저 default access를 새 per-key ACL이라고 표현하지 않는다. storage 접근권한을 일괄 바꿔 현재 getConfig/onChanged를 깨는 setAccessLevel 변경은 하지 않는다.

| action | 결정적 효과/사전조건 |
| --- | --- |
| get-media-snapshot | 전역 version+현재 명시 scope+profile 상태. 관리 catalogue는 own 설정 화면에서만 렌더링 |
| enable-channel-domain | 사용자 명시 활성화. 현재 전역 도메인을 복사하며 표시된 globalRevision과 현재값이 달라졌으면 conflict. 기존 record면 createdRevision/record revision 검사 |
| patch-channel-fields | channelId+createdRevision+domain과 바뀐 필드만. 존재하는 도메인의 최신 record에 merge; 이전 창의 전체 객체를 저장하지 않음 |
| replace-channel-domain | 프리셋 적용/전체 도메인 변경. channel record/domain createdRevision+expected record revision을 대조. 프리셋이면 원본 presetId+createdRevision+revision도 함께 검사, stale면 conflict/무변경 |
| reset-channel-domain/delete-channel | 사용자 확인 후 expected record revision+createdRevision 검사. 다른 도메인을 보존, 마지막 도메인 제거면 record 삭제 |
| create/edit/delete-preset | UUID 및 생성/record revision 검증. 재생/기존 채널값 변경 없음. edit는 변경 필드만, 전체 values replace/delete는 expected record revision 필요 |
| apply-preset-global | 같은 큐 안에서 원본 presetId+createdRevision+revision과 expected globalRevision을 모두 검사한 snapshot으로 전역 media 필드만 patch. stale면 conflict/무변경. 전역 config+settingsRevision 한 번 저장하며 신규 item을 함께 dual-write하지 않음 |

같은 record의 서로 다른 필드 수정은 최신값에 병합해 둘 다 남긴다. 같은 필드는 직렬 commit 순서의 마지막 값이며 모든 UI가 최신 확인값을 표시한다. field patch는 record/domain의 두 createdRevision이 같고 domain이 존재할 때만 허용하여 reset/delete→재활성화/재생성 뒤 이전 edit를 되살리지 않는다. stale token이면 conflict와 draft 보존이지 자동 create가 아니다.

현재 client의 generation별 pending/confirmed/unknown·subscribe-before-read·epoch invalidation을 확장한다. 성공 응답을 최신 snapshot보다 위에 덮지 않으며 version pair가 같아도 요청 sequence/context token으로 stale를 거부한다. catalogue/전체 교체 conflict에서는 draft를 보존하고 최신값과 차이를 보여준 뒤 재확인받는다. timeout 뒤 새UUID/기본값으로 재전송하지 않는다. create는 원래UUID·channel token으로 상태를 read-back하여 동일 commit이 확인될 때만 확정한다.

create-preset의 UUID 재요청은 같은 domain/name/완전한 values의 동일 생성이 확인됐을 때만 idempotent 확인이며 revision을 올리지 않는다. 같은 UUID의 내용이 이미 수정됐거나 deleted/recreated 상태를 구별할 근거가 없으면 conflict/unknown을 유지한다. 값이 우연히 같다는 이유로 과거 patch의 성공을 인증하지 않는다. unknown은 ‘현재 저장값 새로 확인’과 ‘내 draft 폐기/명시 재적용’을 구별하며, 후자는 새 snapshot/token 확인 뒤 사용자 입력으로만 수행한다. 영구 operation log·자동 retry writer는 만들지 않는다.

두 프리셋 apply는 원본의 생성 token까지 비교하므로 UUID가 같고 record revision이1로 같더라도 삭제/재생성 뒤 다른 원본을 적용하지 않는다. preset edit/delete도 id+createdRevision을 필요로 하며 values 전체 교체/delete는 expected preset revision을 추가한다. 생성 token 누락을 현재 token으로 자동 보충하지 않는다.

scope 변경/창 닫기/페이지 이동으로 보낸 commit을 rollback했다고 표현하지 않는다. pending/unknown이 있으면 scope 전환을 막고 확인/명시적 draft 폐기 절차를 사용한다. 새 scope에서 옛 pending patch를 재사용하지 않는다.

## 6. 채널 identity와 runtime context

- `/live/<32hex>` 및 canonical 채널 URL은 URL에서 식별한다. 표시 이름/방송 제목/닉네임/전체 링크 검색/로그인 계정으로 key를 만들지 않는다.
- VOD `/video/<number>`의 숫자는 channelId가 아니다. 현재 verified owner projection이 없는 경우 **channelId=null**, 전역 fallback/채널 저장 disabled와 이유를 표시한다. 향후 owner source를 쓰려면 해당 영상의 현재 owner라는 좁은 source 증명+adapter fixture+별도 허용된 실제 읽기 관측이 필요하다. 지금 성공했다고 가정하거나 페이지의 임의 channel 링크를 선택하지 않는다.
- popup의 ‘현재 채널’은 기존 captured targetTabId/windowId에 bind하고 broker에서 현재 origin/route를 재확인한다. live URL이 다른 채널로 바뀌면 current-target write를 거부한다. 저장된 채널의 관리 편집은 별도 명시 selection이며 active 탭을 다시 조회해 자동 retarget하지 않는다.
- 설정 창에 `[전역]/[현재 채널]/[저장된 채널 관리]`와 도메인별 ‘전역 사용’/‘채널 저장값’을 표시한다. 채널 UI라도 비미디어 설정은 전역이라고 명시하고 style 화면/CSS는 기존 전역·원래 target reload 의미를 유지한다.
- 미리보기 source 채널과 현재 메인 채널을 섞지 않는다. F00은 메인 live/VOD 플레이어의 현재 도메인 설정이며 preview/썸네일·excluded route는 채널 override를 적용하지 않는다. F04 다중 frame은 별도 owner/context 계약 전에는 자동 확장하지 않는다.

현재 manifest의 `all_frames:true`를 제거하지 않는다. 신규 채널 overlay는 확인된 **top-frame의 현재 메인 player**에만 허용하고, 기존 popup iframe·보조 frame은 전역-only 의미를 유지한다. extension popup 설정 화면과 사이트 popup-player iframe은 서로 다른 대상이다. 채널/탐색 페이지에서는 canonical 채널의 저장 관리만 가능하고, 메인 player가 없으면 효과를 mount하지 않는다. 지원 여부·실제 저장 상태·현재 적용 상태는 별도 표기로 두며 storage 성공을 재생 적용 성공으로 표시하지 않는다.

content read는 순수 `resolveMediaSettings(rawGlobal, rawMedia, context)`로 현재 채널의 수치/boolean만 projection한다. 전체 catalogue/다른 채널/label/record token/history를 DOM/status/MAIN 메시지/로그에 넣지 않는다. 현재 채널 ID는 정합성 token에만 포함하고 진단/log에는 넣지 않는다. 기존 `getConfig`는 전역-only 반환과 parameter 의미를 유지한다. 새 좁은 `readScopedConfig(context)`는 전역4키+mediaProfiles를 한 bulk get으로 읽어 `{baseConfig,effectiveConfig,styleParameters,version,profileState}`를 projection하며 읽기 오류/손상은 구분한다. 두 reader의 실제 호출자는 bridge에 한정하고 순수 도메인 계약을 공유한다.

기존 `runtime.configReady`는 **검증된 전역 baseReady** 의미를 유지한다. preview/playback·inject coordinator·비미디어 player controls는 이 전역 준비 상태만 따른다. scopedPending/손상 profile은 오디오 자동 적용·채널 필터와 media 관리 UI만 제한하고, 정상 전역 설정 client의 ready/입력/CSS를 repair-required로 바꾸지 않는다. 전역 writer/client와 media writer/client의 실패·dirty 상태는 분리하되 transport와 broker 큐는 재사용한다.

전역 scalar 검증과 settingsRevision 검증도 분리한다. 잘못된 global revision이어도 현행 getConfig처럼 유효한 전역 값/기본값 projection을 사용할 수 있다. scoped read는 version의 globalRevision을 `null`과 revisionStatus=repair-required로 표시하고 신규 mutation은 차단하지만, baseReady/전역 재생을 실패로 꾸미지 않는다. 손상 revision을0으로 덮거나 값 유효성의 증거로 쓰지 않는다. local readEpoch/delivery sequence/context guard는 계속 적용하고 이 제한 상태는 정상 version pair처럼 승인하지 않는다.

runtime/bridge는 `{documentGeneration, routePath, channelId, playerGeneration}`을 context token으로 사용한다. route/player 변경을 reconcile에서 발견하면 notify/mount/비동기 configure 전에 이전 channel overlay를 폐기하고 **별도로 보관한 검증된 전역 base**만 사용한다. effective A 값을 B의 global base라고 재사용하지 않는다. BASE를 모르면 소유한 미디어 효과는 pending/bypass하고 config read 실패를 ready로 꾸미지 않는다. 매 실제 apply와 응답 accept 직전에 현재 location/player/token을 재대조한다.

context 전환 때 기존 readEpoch를 올리고 요청 token을 갱신한다. A→B→A에서도 첫 A의 응답은 epoch가 다르므로 버린다. storage version과 document/player generation은 별개다. 같은 채널에서 영상이 교체되어도 낡은 player에 configure/enable을 완료하지 않는다. BFCache freeze/restore, hidden→visible, popstate, worker restart에서도 새 read와 token 확인이 필요하다. 기존 lifecycle의 pulse/reconcile를 재사용하고 새 history interception/전역 navigation framework를 넣지 않는다. URL 변경을 아직 lifecycle가 관측하기 전의 최초 화면 frame까지 무오적용이라고 보장하지 않으며, 모든 관측된 전환/설정 apply/player mount에는 위 token gate를 요구한다.

`readEpoch`는 ISOLATED bridge가 소유하고 document/route/player generation은 MAIN runtime이 소유한다. MAIN이 갱신된 context request를 보낼 때 bridge는 현재 실제 pathname과 top-frame 여부를 대조하고 그 요청에 새 local readEpoch를 배정한다. player generation은 MAIN의 수명주기 정합성 token이며 broker 저장 권한이나 페이지 인증 근거로 사용하지 않는다. 저장 origin/channel 확인은 broker가 현재 Chrome tab metadata로 별도 수행한다. `configReady`만으로 scoped request를 생략하지 않고 baseReady와 별도의 `scopedPending/scopedReady/limited` 상태를 둔다. 관측된 route/player 변경·BFCache 복귀마다 새 scoped request를 요구한다. 같은 player를 쓰는 A→B에서도 token을 갱신하며 실패 read 뒤 기존 채널 overlay를 유지하지 않는다. 현행 runtime.generation은 sidebar/body 교체에도 증가하므로 이를 playerGeneration으로 재사용하지 않고 실제 route/pzp/video 정합성과 필터 target 소유권을 구분한다.

현재 대상 저장의 선형화 지점은 같은 broker 큐에서 Chrome 대상 탭·창·origin/정규화 channel을 마지막으로 확인한 후의 commit이다. 탭 navigation과 Chrome storage 사이에 원자 transaction은 없으므로 확인 직후 이동을 저장 rollback이나 브라우저 수준의 무경쟁 보장으로 표현하지 않는다. 저장 key는 승인한 channelId 그대로이며 새 경로로 자동 변경하지 않고, 이동한 페이지는 runtime token gate로 이전 채널 값을 수용하지 않는다.

### 6.1 영상 필터의 DOM 소유권

현행 `settings/bridge.ts:setFilters`는 body의 `knife-filter`와 단일 SVG `knifeFilter`를 갱신하고, `web/main.css`는 페이지 내 video 및 native wrapper에 적용한다. 이 경로에 채널 effective값을 그대로 넣는 것은 금지한다. 그러면 sidebar preview/다른 video까지 메인 채널 값으로 바뀌기 때문이다.

기존 SVG 생성 수식은 MAIN의 player filter 모듈로 한 번 이동해 재사용한다. 전역 renderer는 **document/base 수명**이며 메인 player가 없는 탐색/채널 페이지에서도 preview용 기존 global SVG/body selector를 유지한다. mount 금지는 채널 renderer에만 적용한다. 채널 renderer는 별도 SVG와 현재 player의 실제 filter target에 붙인 확장 소유 marker로만 적용하며 채널 CSS가 기존 extension global CSS보다 우선한다. SVG/id/marker 소유권을 확인하고 이미 외부가 가진 slot을 덮지 않는다. adapter는 정확한 native wrapper/legacy video filter target과 그 identity를 새 좁은 projection으로 공급한다. renderer는 이를 재대조하고 MAIN 메시지가 전달한 임의 selector를 실행하지 않는다. 같은 video에서 wrapper만 바뀐 경우에도 이전 marker를 해제하고 새 target에 적용한다. 채널 CSS는 base가 중립이어서 body에 knife-filter가 없을 때도 동작해야 한다.

native wrapper의 채널 필터와 direct video의 사이트 필터는 기존 단일 합성 순서를 유지한다. global SVG와 channel SVG를 같은 target에 두 번 compose하지 않는다. 채널 중립 스냅샷은 자신의 target에서 extension global filter만 해제하며 native direct video 필터는 건드리지 않는다. source 교체/route 변경/reset/BFCache/dispose에서 이전 target의 정확한 own marker·SVG만 해제하고, 외부가 변경한 slot을 복구라는 이름으로 덮지 않는다. 소유 target을 확인할 수 없으면 video 도메인은 limited이고 전역-only/사이트 원래 경로로 돌아간다. preview에는 base 전역 필터만 남는다.

### 6.2 컴프레서 기본 ON과 일시 조작

F00의 audio snapshot은 기존6개 필드이며 `compressorDefault`는 초기/default 자동 ON이지 현재 master ON/OFF가 아니다. 관측된 channel/player context 변경은 이전 소유 effect를 먼저 bypass한다. scopedPending에는 이전 ON을 이어가거나 임시 base의 default=true로 새 자동 ON을 요청하지 않으며 defaultRequested도 소모하지 않는다. 현재 token의 **확정 effective 또는 명시된 limited 전역 fallback**에서만 자동 ON을 판단한다. 초기 false는 요청 소모가 아니므로 같은 확정 context의 false→true는 기존처럼 아직 default ON 요청/수동 toggle이 없을 때 즉시 ON을 요청할 수 있다. 같은 확정 context의 true→false는 이미 켜진 효과를 강제 OFF하지 않는 기존 의미를 유지한다.

현재 context에서의 수동 ON/OFF는 기존과 같이 일시 조작이며 자동 저장하지 않는다. 파라미터/다른 전역 notify·동일 채널/player의 hidden 복귀/BFCache 재검증은 수동 상태를 덮지 않는다. limited fallback에서 자동 ON된 뒤 확정 channel default=false가 도착하거나 도메인 상속 권위가 바뀌면, **수동 toggle이 없을 경우만** 그 이전 자동 ON을 bypass하고 새 권위로 재판단한다. 수동 toggle이 있었다면 wanted ON/OFF는 보존하고 파라미터만 새 유효값으로 적용한다. fallback→confirmed/도메인 활성화·해제와 같은 권위 변경은 같은 확정 도메인의 일반 default 체크박스 수정과 구별한다. bridge는 raw record token 대신 document-local opaque audioBinding generation만 보내 이 변화를 구별한다.

default-on dedup와 manuallyToggled는 video 객체만이 아니라 실제 document/channel/player context를 기준으로 구분한다. scoped readEpoch만 달라졌거나 sidebar/wrapper만 교체된 것을 새 audio 진입으로 세지 않는다. 음소거·영상 볼륨·Gain0·오디오 eligibility·사용자 gesture·실패 시 dry/bypass·리미터 수식은 그대로 유지한다. 새 source 생성/async resume/configure의 accept와 실제 DSP apply 모두 현재 token을 재대조한다.

### 6.3 세대 혼재의 지원 경계

| MAIN / ISOLATED bridge | 설정·필터 지원 |
| --- | --- |
| 2.13.3 / 2.13.3 | 기존 전역 기능만. 새 mediaProfiles를 읽거나 변경하지 않음 |
| F00 / F00 | protocol2의 검증된 base+scoped 계약과 두 renderer를 사용 |
| 2.13.3 / F00 | v1은 전역-only envelope이며 채널 지원으로 승격하지 않음. 새 MAIN renderer가 없으므로 전체 전역 필터 기능 호환을 보증하지 않고 제한 상태·페이지 새로고침을 안내 |
| F00 / 2.13.3 | v2 handshake 불가를 정상 scoped 결과로 대체하지 않음. 제한 상태·페이지 새로고침 안내, 기존 DOM renderer가 있다고 새 기능 ready로 처리하지 않음 |

v1 보존은 envelope의 의미 보존이지 혼재 세대 전체 기능 보장이 아니다. 혼재에서 별도 자동 migration/재주입/범용 compatibility adapter를 만들지 않는다. 새 모듈은 자신과 호환되는 runtime owner/capability를 확인한 경우에만 설치하며, 구 registry나 이미 소유된 AudioContext에 새 controller/renderer를 중복 연결하지 않는다. 중복 script 주입·구 runtime 선점은 제한 상태로 두고 명시 새로고침 안내를 제공한다. 기존 status protocol1과 새 config protocol2의 검증은 메시지 type별로 구분하고 무조건 v1 차단으로 status를 없애지 않는다.

MAIN bridge의 기존 protocol1은 전역-only legacy 요청/검증에 유지한다. 새 runtime은 protocol2 요청/응답을 기본으로 사용한다. bridge가 요청 protocol에 맞춰 v1에는 getConfig의 전역-only 값, v2에는 readScopedConfig의 base/effective+context token+local delivery sequence만 보낸다. v1에 channel override를 싣지 않는다. 새 runtime이 v1을 채널값으로 인정하지 않고 current token과 다른 v2도 거부한다. requestId/origin checks는 전환 정합성이며 페이지를 인증한 보안 attestation이라고 부르지 않는다.

## 7. migration·rollback·F01 연결

F00의 신규 item은 첫 명시 사용자 저장 전 absent다. 전역4키를 복사해 다른 권위로 만들거나 known default를 기존 raw에 덮지 않는다. t/resizeChat 정리는 기존 broker의 검증된 의미를 유지한다. old2.13.3 → F00 → old 코드 복귀에서 기존 raw·unknown top-level/fields·신규 item 보존을 따로 확인한다. old 코드에서는 채널 기능이 없으므로 전역값만 보이는 것이 명시적 제한이다.

신규 schema/필드 의미 변경은 format version과 reader/writer 호환을 함께 설계한다. 미지원 버전은 저장돼 있더라도 부분 정규화해 잃지 않고 새 mutation을 막는다. 롤백 후 기록 편집까지 보장하려면 실제 이전 reader 지원이 있어야 하며 ‘unknown 보존’을 ‘기능 지원’으로 부르지 않는다.

F01은 새 EQ/노멀라이저/extension-owned Gain 값을 domain validator에 명시적으로 추가하고 필요한 schema version/migration을 승인받는다. Gain knifeGain의 기존값/음소거/0/여러창·channel switching 보존·중복 write 소유권·사용자 gesture와 limiter 수치 검증은 F01 필수다. F00은 DSP/소리/사이트 localStorage를 바꾸지 않는다. 최종 F00+F01 후보에서는 설정과 오디오·기존 설치 전환/native 업데이트 게이트를 새 commit으로 재실행한다.

## 8. 개인정보·정책·승인

로컬의 명시적으로 저장한 channelId+설정과 preset 이름은 **사용자 설정 데이터**다. ‘사용자 데이터가 전혀 없다’고 설명하지 않는다. navigation/read-only lookup은 저장·visit counter·lastSeen·재생 시각·watch history를 만들지 않는다. 계정/이메일/쿠키/토큰/채팅/콘텐츠/결제·서버 API 호출·외부 전송·storage.sync를 추가하지 않는다. 자동 공유/clipboard/file export/telemetry도 없다.

privacy 문서/스토어 고지는 명시적인 채널 선호 설정의 로컬 보관·수동 삭제·uninstall 시 데이터 소멸·외부 전송 없음과 확인된 지원 제한을 설명하도록 구현 계획에 포함한다. 세부 스토어 분류를 추정 인증하지 않고 제출 직전 실제 양식을 확인한다. Chrome [storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [sender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender), [사용자 데이터 정책 안내](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)를 근거로 검토하며 storage permission은 기존 권한이다.

2026-10-14 확인한 공식 안내상 local-only 처리도 사용자 데이터 취급 고지와 개인정보처리방침 대상이며 storage.local은 기본적으로 content script에 노출된다. 따라서 전송 없음과 수집/처리 없음은 다른 주장이다. `runtime.getContexts`는 Chrome116+이고 현행 manifest는 minimum Chrome121이므로 추가 version 상향은 요구하지 않되, API 부재/응답 없음은 신규 저장 제한으로 처리한다. 이는 공식 문서에 근거한 설계 제약이지 스토어 심사 통과 보증이 아니다.

incognito context/target에서 신규 채널/preset 저장은 기본 금지하고 전역-only 동작으로 표시한다. content의 incognito는 Chrome context 정보, 신규 mutation sender는 해당 documentId의 runtime.getContexts 결과, current-target mutation은 Chrome tabs.get의 incognito도 확인한다. 필요한 사실이 없으면 새 mutation을 차단하며 caller의 incognito=false 주장을 권위로 삼지 않는다. 기존 incognito 허용 설정/전역v1 동작을 자동 변경하지 않는다. 별도 계정 모델·history/tabs/cookies/identity/unlimitedStorage/downloads 권한·remote code·로그인/연령 제한 우회는 제외한다. 사용자 임의 label은 설정 화면의 plain text로만 저장하고 진단에는 코드/수량/상태만 남긴다.

## 9. 영향 파일과 책임

| 위치 | 설계된 책임 |
| --- | --- |
| 새 src/settings/media-profiles.ts | schema/도메인 allowlist/limits/record 토큰·merge·현재채널 projection 순수 함수, API/DOM/쓰기 없음 |
| src/settings/contract.ts + broker.ts | protocol2·own sender·token/전체 교체 conflict 검증과 **기존 큐**의 신규 item 저장. v1/CSS/legacy 유지 |
| src/settings/client.ts + popup.ts | 기존 transport/generation/error 재사용·scope 전환·profile/preset 관리 UI. styles.ts는 전역 계약 유지/문구만 필요한 경우 |
| src/settings/config.ts + bridge.ts | 기존 global reader의 scoped projection·readEpoch·전역 base 분리·MAIN 제한 envelope. raw catalogue 노출 없음 |
| src/main/runtime/contracts.ts/bridge.ts/lifecycle.ts/entry.ts | context token/protocol2·route/player invalidate-before-notify/수용 guard |
| src/main/features/audio/controller.ts + player controls | 현재6개의 configure/default-on에 current token/base guard, Gain persistence/DSP 구조 변경 없음 |
| 새 src/main/features/player/filters.ts + web/main.css | 기존 SVG 수식의 단일 소유 module로 이동·global/base와 채널/player target 분리·neutral/외부 변경/정확한 cleanup, preview 오적용 방지 |
| site-adapter contracts/capabilities/discovery | 현재 native wrapper/legacy video filterTarget identity 공급·같은 video의 wrapper 교체 관측. VOD owner는 별도 검증됐을 때만 좁은 projection, 미확인 시 null/전역 fallback |
| popup.html/CSS/ko·en locale | 기존 popup의 media scope/관리·실패/지원 제한 UI. 새 프레임워크/페이지 없음 |
| scripts/settings-runtime.mjs·manifest/build/package/inventory + 생성 JS | 새 classic 순수 entry의 등록/load order/같은 origin 권한·생성 검증, root dist는 변경 금지 |
| settings fixture·contract/client/broker/multi-page + runtime/adapter/filter/audio tests·installed harness | 아래 literal/실패/수명주기/old-new-old 수용. 게시 ZIP/frozen 기준은 불변 |

이는 구현 파일 경계이며 새 스크립트/구체 commit·인터페이스 body는 written-spec 승인 뒤 구현 계획에서 고정한다. 이 문서만으로 구현을 시작하지 않는다.

## 10. 객관 수용과 공격적 검토 초점

- absent 신규 item의 boot/read/navigation가 무쓰기이며 old global UI/CSS/audio/Gain 값과 결과가 같아야 한다.
- 두 synthetic channel A/B의 audio/video isolation, preview/global 비미디어·styles scope, domain inheritance와 neutral 값 저장을 literal oracle로 확인한다.
- 프리셋 rename/edit/delete와 채널/global 적용 snapshot 독립, 동일값 no-op·duplicate UUID·unknown 응답·expected revision conflict·삭제/재생성 token을 확인한다.
- 두 창의 서로 다른 필드 저장은 모두 남고 같은 필드는 마지막 commit. 같은 channel/domain reset 후 stale edit·preset replace/delete race·pending 중 scope 변경·worker cold는 오적용/손실 없이 reject 또는 확인 상태여야 한다.
- read/write/quota/timeout/CSS unrelated failure·손상/미지원 version·safe-integer exhaustion·shape/limit/type/duplicate/malformed label·sender spoof는 첫 실패/원본 보존과 실패 code를 검증한다. 단일 Promise 성공만으로 전체 apply 성공을 주장하지 않는다.
- 지연 A→B→A 응답·같은채널 새player·BFCache·hidden·worker 재기동과 실시간 global/profile 변경을 실제 bridge/runtime 연결 fixture로 검증한다. 관측된 새 route/player mount에 이전 channel 값이 적용되면 FAIL이다.
- live/channel URL 정규화·VOD numeric id/여러owner/noowner/오래된 owner·excluded/frame/incognito·target origin/window/channel 변경은 잘못된 key로 저장하지 않아야 한다.
- 원본2.13.3의 빈/비기본/legacy/unknown/손상 revision과 신규 profile 보존을 real old/current contract 및 별도 설치 old→new→old로 대조하고, 한 채널 값 손실 negative가 반드시 실패하도록 한다.
- strict/generation/drift·기존 전체 테스트/객관 오디오·영상·tool audit·패키지·설치 positive/negative 게이트를 줄이지 않는다. 테스트는 격리 후보에서만 실행하고 사용자 rootdist/P09 저장 baseline을 쓰지 않는다.
- 새 저장/삭제는 own 설정 UI 외 경로0, lookup/navigation write0, MAIN/status/log에 catalogue/channel list/user label0, 계정/쿠키/채팅/외부 송신 call0을 spies/패키지 점검으로 확인한다.
- 비중립 전역+서로 다른 A/B 채널 필터+동시에 재생 중인 sidebar preview에서 main만 채널값, preview는 전역값인 것을 DOM target과 pixel 결과로 함께 확인한다. 채널 중립값·native video filter·wrapper 합성·foreign marker·player reuse/reset/dispose/BFCache가 기존 filter 경로를 손상하면 FAIL이다.
- compressorDefault A=true/B=false, 같은 video 재사용·수동OFF 뒤 notify·지연resume·source 교체에서 context별 기본 ON과 기존 일시 조작을 확인한다. F00 게이트는 Gain 미이관 한계를 명시하고 F01 전까지 ‘모든 오디오 채널 저장 완료’로 표시하지 않는다.
- 전역 default=true/B default=false의 지연 scoped read는 임시 ON0이어야 한다. limited fallback 자동ON→확정false는 수동 input 없음/OFF/ON을 각각 구별하며, 같은 확정 context의 false→true/true→false·sidebar 변화·hidden/BFCache 재검증은 기존 일시 조작 의미를 보존해야 한다.
- profile corrupt/pending·global revision malformed에서도 정상 base의 preview/채팅/탐색/CSS/전역 UI가 미디어 전용 제한에 끌려 내려가지 않는지 확인한다. 잘못된 revision을 정상이거나0으로 표시하면 FAIL이다.
- 프리셋 UUID와revision이 같지만 createdRevision이 다른 재생성 원본의 channel/global apply는 conflict/무쓰기여야 한다. no-player 페이지의 전역 preview filter·video를 재사용하는 wrapper 교체·old/old/old-new/new-old/new-new 및 중복 주입도 필수 수용 사례다.

실제 native F00 설치/설정/삭제·VOD owner 관측과 다음 스토어 업데이트는 별도 승인·객관 자료가 있어야 PASS다. 현행 native2.13.3 preflight 성공을 F00 후보의 실행/보안/정책 인증으로 전용하지 않는다.

## 11. 설계 승인과 다음 게이트

- [x] 사용자 의도 확인: 계정 제외·채널별 audio/video만, 나머지 전역.
- [x] 현행 broker/client/bridge/runtime/Gain/source 비교와 대안·데이터/권한 경계 조사.
- [x] 상세 설계 자체 대조·Astra max 최초 Critical0/Important3/Minor2·5항목 보완·같은 검토자 targeted closure·판단 제외/한계 기록. 새 전체0건 검토나 실제 F00 테스트 통과로 세지 않는다.
- [x] 사용자 written-spec 승인2026-10-14. VOD 식별 불가 시 전역 fallback·Gain의 F01 필수 연결·기존 popup-player iframe 포함 top-frame 이외 전역 유지·incognito 신규 저장 금지·혼재 세대 새로고침 안내를 포함한다. 구현 계획/실행 승인은 별도다.
- [ ] 그 뒤 Native 방식의 파일/인터페이스/RED-GREEN·격리 검증·최종 검토·단일 공개 묶음 구현 계획 작성/검토/승인.
- [ ] F00 구현/정상·실패/손실/설치 게이트 완료. 이후 F01 설계·구현/검증, 새 통합 후보와 별도 공개 승인.

현재 구현0·Chrome/프로필 조작0·제품2.13.3 불변·push/PR/릴리즈0. 이 설계는 GPT 보안 scan이나 Chrome 정책 준수 인증이 아니다.
