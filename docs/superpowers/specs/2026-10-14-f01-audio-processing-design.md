# F01 — 오디오 전체 스위치·Gain·EQ·노멀라이저 설계

2026-10-14. 최초 설계 입력 `6ad000e412aa2519e45539ad8a3c6a4da18405bf`(F00 로컬 마감, 제품2.13.3). **현재 상태: 전체/Gain 설계와 최신 목업 승인, [상세 구현 계획](../plans/2026-10-14-f01-audio-processing.md)·동일 Astra 재확인 마감, 사용자 계획/실행 승인 대기.** F00은 PR #44로 main ae9f8e5에 통합됐다. 이 문서·목업 승인은 구현 계획·제품 실행·공개 승인과 구분한다.

이 문서·[승인 목업](../mockups/2026-10-14-f01-audio-settings.html)·검토 기록은 별도 로컬 브랜치 `codex/f01-audio-processing`에 보존했고 F00 PR에서 제외했다. 최신 UI의 확정 snapshot·scope 전환·Gain trusted 더블클릭까지 상세 구현 계획/Astra max 검토에 포함한다. F01 push/PR/병합·제품 실행·버전·릴리즈·스토어 변경은 별도 승인 전 하지 않는다. 차기 릴리즈 최소 조건은 F00·F01·F02 및 통합 게이트다.

## 1. 목적·범위

플레이어에서 전체 오디오 보정을 한 번에 켜고 끄고, 기존 설정 탭에서 컴프레서·Gain·EQ·선택형 평균 음량 보정을 조절한다. 오디오/영상만 채널별이고 나머지는 전역이라는 F00 결정은 유지한다. F01은 한 기능 묶음이며 내부 의존 단계가 여러 개여도 중간 Task/문서 PR로 나누지 않는다.

포함: 기존 compressor5 수치/초기 켜짐 호환, Gain0–200%, 고정8대역 EQ, 기본 OFF의 느린 RMS 노멀라이저, 기존 최종 리미터, 고정 내장 오디오 설정과 F00 사용자 프리셋, 전역/채널 저장, schema1→2 명시 전환, 객관 출력·전환·수명주기·설치/저장 손실 검증.

제외: 영상 F02 신규 필터, Firefox, 미리보기/iframe에 새 채널 오디오 적용, 계정 식별, 녹음/내보내기, 서버 전송, 클라우드 프리셋, 새 단축키/휠 제스처, 사용자 조절 리미터, LUFS/EBU/true-peak 인증, 새 AudioWorklet/ScriptProcessor/외부 DSP 의존성. 최종적으로 네이티브 방식이 수용 기준을 충족하지 못하면 한계와 대안을 보고하고 별도 설계 승인을 받는다. 음소거·volume0·Gain0·보호 source/사용자 gesture 제한을 우회하지 않는다.

## 2. 사용자 조작·목업

- 현재 컴프레서 버튼의 이름·접근성 label을 **오디오 보정**으로 변경한다. 클릭은 현재 video/context의 전체 처리 wanted만 켜고 끈다. 이 일시 조작은 자동 저장하지 않는다. 별도의 초깃값 `audioDefault`가 새 진입의 자동 ON을 결정한다.
- 전체 OFF는 Gain/EQ/컴프레서/노멀라이저/리미터의 wet 경로를 우회한다. source를 이미 확보했으면 기존 지연된 dry로 복귀하고, source를 생성하지 않았으면 native playback을 그대로 둔다. 음소거·volume을 변경하지 않는다.
- 전체 ON일 때 compressorEnabled/EQ/normalizer의 저장된 스위치를 각각 적용한다. 컴프레서가 OFF여도 Gain/EQ만 사용할 수 있다. 전체 ON이면 최종 안전 리미터는 항상 유지한다.
- 설정 탭의 scope(전역/현재 채널/저장된 채널), 전역 영상/기타 설정, 사용자 프리셋 및 원래 대상 고정은 F00 그대로다. 오디오 카드 상단에 **현재 재생 상태**와 **저장할 초기값/효과값**을 분리한다. 대상 없으면 현재 상태를 ‘대상 없음’으로 표시하며 저장 관리 기능을 자동 retarget하지 않는다.
- 후속 목업 보완: 설정 화면 최상단에도 현재 대상의 전체 ON/OFF를 노출하고 Gain은1곳만 표시한다. 도움말에는 설명만 남기며 방송 플레이어의 실제 간편 Gain은 유지한다. 전체 OFF에서도 설정 편집은 가능하되 소리에는 미적용임을 상태와 설정 참고 그래프에 명시한다. 대상 없으면 전체 스위치는 비활성화한다. 현재 대상의 제어 연결·상태 응답 freshness/지원 제한은 상세 계획과 native 검증에서 확인하며 ON 요청 표시를 실제 적용 성공으로 간주하지 않는다. 초기 자동 ON이나 저장 범위 변경으로 해석하지 않는다.
- Gain은 출처(기존 사이트값/전역/채널)와 유효값을 표시한다. legacy 값이 아직 관측되지 않았으면 ‘기존값 확인 필요’이며 가짜100%를 현재 음량으로 표시하지 않는다. ‘기존 Gain 확인’은 읽기만, ‘확인값 가져오기’는 현재 표시값/출처·대상/전역 revision을 명시 확인 후 저장한다. 직접 Gain 입력도 명시 저장이다.
- 채널 Gain의 ‘전역 Gain 사용’은 Gain만 상속한다. 오디오 도메인 전체의 ‘전역 사용’과 다르며 다른 효과값을 제거하지 않는다. 전역에서는 이 위치를 ‘기존 사이트 Gain 사용’으로 표시한다. 사용자 재사용 입력은 출처 전환의 영향 안내를 따른다.
- 후속 UI 승인: Gain 수치/상단 상태는소수2자리로 표시하되 원값을 반올림하지 않는다. 슬라이더 행은항목명·가변 슬라이더·고정80px 수치만 두고 출처는다음 행에 분리한다. 다이얼/EQ 페이더 더블클릭은그 항목만기본값/0dB, Gain 더블클릭은100%의 명시 소유값으로 복귀한다. 컴프레서 ‘기본값’은5파라미터만, EQ ‘중립으로’는8대역만 복귀하며 전체/효과 ON/OFF·초기 자동 ON·다른 효과/Gain·전역 상속 삭제를 수행하지 않는다. disabled 다이얼/페이더는더블클릭 입력을 받지 않지만 섹션 복귀 버튼은효과OFF에서도 파라미터만 정리할 수 있다.
- 후속 UI 결정에 따라8개 EQ 슬라이더는 주파수·dB label/숫자 입력과580px 한 줄을 유지하며 좁은 화면에서는 해당 영역을 가로 스크롤한다. normalizer는 ON/OFF와 목표 RMS 한 항목만 노출한다. 예측 RMS·실시간 meter·주관적인 음질 점수는 목업/제품에 만들어 넣지 않는다.
- F00의 저장 중/결과 불명/충돌/실패/폐기/재조회·document retirement 잠금·native confirm을 유지한다. ON 모양만으로 실제 wet 적용을 인증하지 않는다. 현재 processor 상태, compressor 하위 상태, stored default를 별도 표시한다.

목업은 제안된 구조/간격을 보는 정적 문서이며 실제 확장 상태/동작/저장 성공의 screenshot이 아니다. 사용자 확인 전 UI 구현을 시작하지 않는다.

## 3. 고정 오디오 값 계약

schema2의 `AudioValues`는 아래 고정 scalar own keys만 허용한다. 배열/임의 filter type/주파수/수식은 설정 메시지로 받지 않는다. UI step과 저장 가능한 유한 수치 범위를 구분하고 값을 몰래 반올림하지 않는다.

| 필드 | 범위/기본 | 의미 |
| --- | --- | --- |
| audioDefault | boolean / legacy compressorDefault, 없으면false | schema2/channel/preset의 새 context 전체 처리 초기 ON. 전역은 기존 compressorDefault 한 key에서 projection |
| compressorEnabled | boolean / true | 전체 ON일 때 기존 compressor 사용 |
| compressorThreshold/Knee/Ratio/Attack/Release | F00 범위·기본·단위 그대로 | 기존5 수치 |
| audioGain | finite0..2 /1 | 소유 Gain 값, 0은 무음 |
| gainInherited | boolean /true | global은 legacy site Gain, channel은 현재 global Gain 출처를 따른다. preset은 목적지 Gain 보존 의미 |
| eqEnabled | boolean /false | EQ stage 사용 |
| eq63/125/250/500/1000/2000/4000/8000 | 각 finite -6..6dB /0 | 고정 Hz, native peaking/Q=1 |
| normalizerEnabled | boolean /false | 느린 평균 음량 보정 |
| normalizerTargetDbfs | finite -30..-12dBFS /-20 | RMS 목표, LUFS가 아님 |

실제로 gainInherited=true일 때 audioGain의 보관 값은 DSP 유효값으로 쓰지 않는다. 반대로 false면0도 유효하고 truthiness/default로 대체하지 않는다. 채널Gain 상속은 전역 Gain 변경에 함께 반응하지만 채널 소유 Gain은 그렇지 않다. 읽기용 snapshot에 `gainOrigin`을 site-legacy/global-owned/channel-owned의 enum으로 제공하고 권위·revision과 결합한다. MAIN에는 자신의 유효 scalar·출처 enum만 전달하며 catalogue/이름은 전달하지 않는다.

global의 legacy fallback은 MAIN의 현재 사이트 `knifeGain`을 기존 numeric 규칙으로 읽는다. absent/공백/비유한/범위 밖은1로 제한하고 invalid 이유를 상태에 기록한다. 다른 사이트/계정 값을 읽지 않는다. global 소유값이 확정된 이후에는 site 값이 바뀌어도 이를 다시 덮지 않는다. F01은 knifeGain을 쓰거나 삭제하지 않는다. 구 코드가 쓰는 mixed page는 갱신 필요 제한이며 이중 writer 호환을 보장하지 않는다.

## 4. 플레이어 Gain 자동 저장·기존 Gain 이전·writer 권위

**플레이어 Gain 조작도 영구 저장한다.** 이전의 임시 전용 제안은 사용자 질문/설계 보완 요청에 따라 폐기했다. 플레이어에서 현재 오디오 저장 출처(전역/이미 존재하는 채널 도메인)를 표시하고 Gain만 자동 저장한다. 채널 상속 Gain의 직접 조작은 그 채널의 소유값으로 바뀌며 새 채널/프리셋을 자동 생성하지 않는다. 상세 권한·scope·실패/충돌·검증은 [플레이어 Gain 보완 명세](2026-10-14-f01-player-gain-design.md)가 규범이며 전체 명세와 함께 승인받는다.

MAIN의 기존 slider 저장을 ISOLATED 소유 Gain 조작부로 옮기고, 새로운 Gain 전용 namespace/제한된 broker 역할만 추가한다. 실제 sender/frame0/document·고정 private intent probe·현재 저장 scope/토큰을 확인하고 동일 queue에서 audioGain/gainInherited 두 필드만 병합한다. MAIN postMessage/input/isTrusted/nonce만을 durable write 권위로 받아들이거나 기존 설정 TAB 전용 요청 권한을 완화하지 않는다. 닫힌 ShadowRoot는 캡슐화일 뿐 페이지 UI의 무결성/사람의 승인 인증이라고 하지 않는다.

정상 조작은 즉시 미리 적용하고 저장 ACK 뒤 확정하며 다음 진입에도 유지한다. 실패/결과 불명에서는 미리 적용값·저장값·미저장 의도를 구분하고 자동 재전송하지 않는다. genuine route/video 진입에는 미저장 의도를 폐기하고 저장값부터 시작한다. 같은 video/PZP-only 교체는 Gain 보완 명세의 동일 private host/video/binding 재배치 예외에서만 draft를 보존하고 소유 조작부 교체/판별 불가는 표시용 초안과 폐기된 권위를 구분한다. 설정 TAB의 preset 생성은 미리 적용 중인 값이 아닌 확정 저장값을 복사한다. 값/상속 상태와 출처가 변경된 외부 commit은 편집 중 의도를 자동 덮어쓰거나 새 token으로 다시 저장하지 않는다.

설정 TAB의 ‘기존 Gain 확인’은 worker의 고정 `scripting.executeScript` 함수로 원래 CHZZK tab/frame0 ISOLATED에서 literal knifeGain만 읽는다. 사용자에게 임의 코드·selector·key·URL을 받지 않는다. 호출 전후 실제 tab ID/window/origin/route/incognito 및 InjectionResult frame/document 사실을 대조하고 결과를 최대 한 scalar/상태로 제한한다. 탭 이동/닫힘/문서 교체·읽기 실패는 실패이며 다른 active 탭을 찾지 않는다. 결과는 InjectionResult documentId/frame0와 함께 캡처하고 별도의 고정 frame0 읽기로 현재 documentId가 같은지 확인한다. 가져오기 직전에도 새 frame0 InjectionResult의 documentId가 캡처한 값과 일치해야 하며 같은 URL의 다른 document는 거부한다. 각 실행은2초/두 읽기 합계4초로 제한한다. raw 문자열은64자 이내만 숫자로 해석하며 raw 자체를 반환하지 않는다.

‘가져오기’는 표시된 scalar와 출처·원래 문서·expectedGlobalRevision을 캡처한다. broker queue에서 대상과 같은 legacy 값의 fresh read를 확인하고 달라지면 conflict로 거부한다. global audioGain과 gainInherited=false를 기존 unknown config를 보존한 단일 storage.set 호출/전역 revision+1로 저장한다. 읽기·확인 취소·scope 변경은 쓰기0. Chrome의 다중 key set을 임의 플랫폼 트랜잭션/rollback 보장으로 표현하지 않는다. 응답 유실은 unknown·원래 의도 보존이며 값 일치만으로 성공을 확정하거나 재전송하지 않는다.

전역/채널의 Gain 직접 편집도 한 사용자 필드 요청에서 서버가 audioGain·gainInherited=false를 함께 병합한다. 상속 선택은 gainInherited=true만 바꾸며 원래 숫자를 지우지 않는다. 사용자 preset 생성은 site-legacy 출처가 미확정이면 비활성화하고 기존값 확인/명시 소유값 설정을 안내한다. global-owned/channel-owned 출처이면 확인된 유효 Gain을 복사하고 preset의 gainInherited=false로 고정한다. 이 변환과 영향은 UI/worker가 동일 규칙으로 처리한다.

## 5. schema1→2·구 버전·전역 default 호환

- 기존 raw mediaProfiles(schema1)는 boot/read/reload로 다시 쓰지 않는다. v1 reader로 먼저 정확히 검증하고 ephemeral v2 projection으로만 읽어 현재 소리와 표시를 유지한다. 기존 channel/preset의 compressorDefault를 audioDefault로, compressorEnabled=true로 해석한다. 새 EQ/normalizer는 중립/OFF, Gain은 상속으로 둔다. 기존 channel의 새 효과가 자동 ON되지 않으며 이 의미를 UI에 표시한다.
- schema1 catalogue 상태에서는 새로운 channel/preset 쓰기를 막고 ‘오디오 저장 형식 전환’을 제공한다. absent는 쓰기 없는 논리 schema2/빈 catalogue로 표시하되 실제 key는 첫 사용자 저장 전 생성하지 않는다. 첫 저장은 기대 absent/초기 revision을 queue에서 다시 확인하고 schema2 item을 생성한다. F00 empty()의 schema1을 저장하거나 absent에 upgrade를 실행하지 않는다. 미래 schema·손상값은 읽기 제한/repair 상태로 유지하며 삭제/정규화하지 않는다.
- own 설정 TAB의 protocol3 `upgrade-media-store`는 expectedMediaRevision/schema1 확인·영향 native confirm 후 기존 전체 item을 schema2로 바꾸는 단일 queue 작업이다. 모든 IDs/이름/createdRevision·video·unknown 전역/최상위 raw는 보존한다. 기존 channel/preset revision은1 증가, store revision도1 증가한다. 전환 중 overflow/256KiB/quota/권한/대상 실패면 저장하지 않는다. 전환은 기존 item 한 key를 쓰며 전역 config를 불필요하게 함께 쓰지 않는다.
- 전환 ACK 유실은 unknown이다. schema2가 보인다는 이유만으로 원래 전환 성공을 인증하지 않는다. 사용자가 보류 의도를 폐기하고 현재 snapshot을 새로 채택해야 다음 편집을 허용한다. 자동 upgrade retry/duplicate record 생성 없음.
- schema2의 old audio preset에서 gainInherited=true는 목적지 Gain·소유/상속 상태를 보존한다. 새 preset은 확정 Gain 소유값을 복사한다. apply의 field 보존을 포함한 완전한 의도와 token/record revision을 native confirm 전에 캡처한다. 전체 덮어쓰기 전에 late scope/ABA/conflict를 다시 검증하며 새 token을 자동 채택하지 않는다.
- global의 초기 ON은 **기존 compressorDefault 한 key만 canonical 저장**한다. audioDefault는 새 UI/유효 snapshot의 명칭이며 전역 raw에 새 key로 저장하지 않는다. 새 global audioDefault 요청은 broker에서 compressorDefault 쓰기로 정규화하고 구 v1 compressorDefault 요청도 같은 key를 사용한다. 같은 요청의 두 명칭이 충돌하면 거부한다. global raw의 unknown audioDefault가 있어도 보존만 하며 canonical 값보다 우선하거나 자동 동기화하지 않는다. schema2 channel/preset의 audioDefault는 독립 저장한다. 기존5 수치/unknown raw는 유지한다.
- new에서 초기 ON 저장 → old broker에서 OFF 저장 → new 재진입은 OFF여야 하며 반대 순서도 검사한다. read/재진입은 두 key를 맞추는 저장을 하지 않는다. 전역 canonical과 UI projection의 이름 차이를 계약·preset global 적용·bridge·기존 writer 모두에서 동일하게 처리한다.
- old F00은 schema2를 이해하지 못하므로 새 channel/preset은 제한 상태가 된다. old2.13.3은 원래 global 코드만 사용한다. 두 경우 모두 raw schema2 bytes를 보존하는 데이터 rollback이지 새 기능 지원/실제 플랫폼 rollback 인증이 아니다. 새 master/하위 OFF와 old compressor-only 코드의 소리 의미가 완전히 같다는 약속은 하지 않는다. 글로벌 aliases·기존 raw 및 late writes 손실은 별도로 검사한다.

## 6. 버전/프로토콜·소비자 경계

새 설정 media protocol3와 MAIN config protocol3/ownerProtocol3를 명시한다. namespace/registry 소유권·document/route/video nonce/sequence gate는 유지한다. metadata의 gainOrigin은 고정 enum이며 base/effective의 허용 필드 집합·scalar 상한은 새 descriptor로 정확히 검증한다. v1은 기존 global/status에만 유지하고 v2를 새 값의 성공으로 업캐스트하지 않는다.

protocol3 mutation은 기대 storeSchema를 명시하고 schema1에서는 upgrade만 허용한다. schema2에서는 F00과 같은 action·필드 병합/토큰·정확한 request keys를 새 값 계약으로 확장한다. v1 global writer의 aliases는 위 별도 호환 규칙으로만 허용한다. own sender/context와 현재 target은 여전히 broker가 검증한다. content/status query로 전체 catalogue를 조회할 수 없다.

old runtime/bridge 선점·혼재 protocol1/2/3는 scoped 성공으로 가장하지 않고 전역-only/갱신 필요로 제한한다. 자동 재주입·registry 덮기·AudioContext/source 이중 연결·범용 compatibility layer를 추가하지 않는다. snapshot/schema/새 Gain 출처를 모르는 오래된 설정 UI가 새 필드를 쓰는 요청도 거부한다.

## 7. DSP 경로·소유권

기존 AudioContext와 video별 MediaElementSource 한 개를 재사용한다. 현재 pipeline만 상태를 발표한다. engine의 전체 wanted와 compressor 하위 선택값은 분리하고 `compressor` status를 `audioProcessing` 및 효과 상태와 혼동하지 않는다.

```text
source ─── 기존 dryDelay ─ dryGain ─────────────────────────── output
   └─ EQ headroom/고정8대역 ─┬─ compressor ─ compWet ─┐
                             └─ matchedDelay ─ compDry ─┤
                                                       └─ normalizerGain ─ masterGain ─ 기존 limiter ─ wetGain ─ output
                                           compMix ─ stereo meters(분석만)
```

compDry와 compressor의 native pre-delay를 기존 compressorDelay(sampleRate)로 맞춘다. 기본 새 EQ/normalizer OFF·compEnabled true·동일 Gain에서 기존 수치·delay·리미터·full-scale·dip 게이트를 유지해야 한다. 통과하려고 오차를 넓히지 않는다. EQ는 비활성 상태에 DSP identity를 적용하며 고정 peaking/Q=1의 gain만 ramp한다. 주파수가 Nyquist를 넘지 않는 sampleRate(최소22050Hz)에서만 EQ를 지원하고 낮으면 제한/dry를 표시한다. 샘플레이트44.1/48/96kHz를 객관 검사한다.

양수 EQ gain의 합만큼 EQ 앞 headroom을 감쇠하고 리미터를 마지막에 유지한다. 이는 보수적 안전 감쇠이며 자동으로 보상 Gain을 증가시키지 않는다. EQ boost가 음량을 낮출 수 있다는 안내를 제공한다. normalizer는 compMix를 측정하고 자기 gain·masterGain 뒤를 피드백 측정하지 않는다. Gain/음소거 변경을 normalizer가 취소하지 않는다.

전체 dry/wet·compDry/Wet 전환과 Gain 변경은 기존10ms 연속 ramp를 보호하고, EQ gain/headroom은20ms ramp로 바꾼다. 새 변경은 진행 중인 ramp의 현재 위치에서 시작한다. master ON·효과 변경·preset 적용·source/route 변경·Gain0에서 순간 무제한 출력/두 source 생성이 없어야 한다. 위험한 eligibility guard를 제거하거나 새 source를 만들어 실패를 우회하지 않는다.

단일 stereo processing/measurement 계약을 사용한다. 선택한 wet 처리의 입력을 명시적인2채널 speakers downmix로 고정하고 meter는 좌/우를 각각 측정한다. dry OFF/native 경로의 원래 채널 의미는 유지한다. mono/stereo·역상 stereo·한쪽 신호·한쪽 무음을 검사하며 multichannel 원형 보존은 보장하지 않고 지원 고지한다.

## 8. 노멀라이저의 제한된 제어

외부 processor/AudioWorklet 없이 좌/우 각각 native AnalyserNode와 선택 player의100ms interval을 사용한다. normalizer 지원 sampleRate는22050..96000Hz이며 fftSize는 `sampleRate * 0.25` 이상인 최소2의 거듭제곱(최대32768)으로 고정한다. 관측창 W=fftSize/sampleRate는250ms 이상이고 유효 tick 간격 상한200ms를 덮는다. 예를 들어48kHz는16384/약341ms,96kHz는32768/약341ms다. 해당 범위 밖에서는 normalizer만 unity/limited이며 다른 효과를 몰래 끄지 않는다. sample buffers는 고정 Float32Array 두 개/합계 최대256KiB로 제한하고 저장·postMessage·로그·네트워크로 보내지 않는다.

새 시작/source 교체는 보정0dB로 시작하고 유효 소스가 W초 채워지기 전의 buffer를 무음/정상 측정으로 세지 않는다. 정상 dt는 AudioContext.currentTime 기준0<dt≤200ms다. window 전체의 좌/우 RMS 중 큰 값으로 power의0.75s EMA를 갱신한다. 겹치는 최근창의 RMS를 사용하는 근사 제어이며 별도의 연속 적분/LUFS 측정이라고 하지 않는다. dt 음수/0/비유한/200ms 초과는 무음 시간이나 EMA에 누적하지 않고 보정 현재값을 hold·측정 epoch와 warm-up 시작점을 초기화한다. 이후 W초 창을 채우는 동안에는 그 시작점을 다시 초기화하지 않고 hold/측정 생략하며 tick 시각만 갱신해 추가 시간 공백을 감지한다. 새 공백이 없다면 W초 창 확보 후 재개하고 elapsed만큼 gain을 catch-up하지 않는다. 이 시간 공백/초기 대기와 달리 Analyser 조회 예외/비유한 sample 또는 RMS는 아래 오류 분기(limited+10ms unity 복귀)로 처리한다.

`targetDbfs - measuredDbfs`의 목표 보정은 -12..+6dB다. **실제 AudioParam의 dB 곡선**을 증가 최대1dB/s/감소 최대12dB/s로 제한한다. 각 유효 tick에서 진행 중인 ramp의 현재 dB를 계산하고 목표를 현재값 기준 다음100ms의 허용 변화량(+0.1/-1.2dB)으로 제한한다. 양수 선형 gain에 native exponentialRampToValueAtTime으로100ms 동안 적용하므로 dB 곡선이 직선이다. 현재 ramp의 계산값을 hold하고 새 ramp를 잇는 규칙·상한을 helper와 실제 automation/출력에서 함께 검사한다. 고정20ms ramp를 normalizer 속도 제한보다 우선하지 않는다.

입력≤-55dBFS에서는 양수 boost를 늘리지 않는다. 확인된 무음2초 이후에는 증가/감소 모두 최대1dB/s로0dB까지만 복귀한다. 음수 감쇠의 unity 복귀를 양수 boost와 구분한다. pause/ended/muted/video.volume0/실제 유효Gain0/Context suspended/current 권위 pending/hidden에는 ramp 현재값을 hold하고 분석·제어 epoch를 정지한다. 정상 재개에도 새 W초 창을 확보한다. 원래 mute/volume은 변경하지 않는다. 알림 없는 timer stall 중 이미 예약한 ramp는 마지막 유효 tick부터 최대100ms까지만 진행한 뒤 hold하며 다음 tick에서 공백으로 판정한다. 즉각적인 throttle 감지/백그라운드 정밀 유지라고 광고하지 않는다.

normalizer OFF·측정 오류의 unity 복귀는 위 느린 제어속도 제한의 예외이며 기존10ms 연속 전환으로 처리하고 오류는 limited 상태로 표시한다. master OFF는 기존10ms dry 복귀다. 명시 source replacement·route/genuine video 진입은 old meter/EMA/late callback을 폐기한다. 같은 video/PZP-only/hidden 복귀에서는 master 수동 wanted를 보존하되 분석 epoch를 재확인한다. NaN/무한 값을 AudioParam에 전달하거나 반복 오류를 숨기고 boost를 계속 올리지 않는다. OFF/retired/current player 아님이면 timer·meter 연결·buffer 참조를 정리하거나 정지한다.

2026-10-15 국소 보완 승인: master OFF에서는 분석 자원을 즉시 퇴역시키되 normalizer의 현재 이득을 기존 wet fade 종료까지 유지하고 이후10ms에 unity로 복귀한다. 별도 JS timer 없이 native AudioParam 시각으로 예약한다. 같은 source/route/document의 빠른 ON은 퇴역 예약을 즉시 취소하고 계산된 현재 이득에서 새 warm-up을 시작한다. 취소·이득 고정은 analyser/buffer 생성 전에 실행해 생성 중 native 시각 전진으로 옛 예약이 먼저 실행되지 않게 하고, 생성 실패 시10ms unity 복귀·limited를 유지한다. old EMA/buffer는 재사용하지 않으며 source/route/document 교체는0dB의 새 창이다. 단독 normalizer OFF/측정 오류와 기존 출력/dip/연속성 허용치는 변경하지 않는다.

## 9. 프리셋·저장·다중 창

관리 화면 배치의 후속 승인: 내 프리셋 목록·선택 이름 변경을 위에 두고 삭제는 별도 행동으로 구분한다. 새 프리셋 생성은 그 아래 native details로 접어 둔다. 이름 변경 입력과 새 이름 입력은 분리하며 목록 전환이 생성 초안을 덮지 않는다. 오디오/영상 ‘프리셋으로 저장’으로 들어오면 해당 도메인의 생성 영역을 펼치고 새 이름에 초점을 둔다. 빈 목록에서는 생성 영역을 펼치고 이름 변경/삭제는 비활성화한다. 관리 화면 적용 버튼은 추가하지 않는다. 이는 목업 배치/조작 승인이지 실제 catalogue CRUD나 저장 성공 검증이 아니다.

후속 UI 승인: 오디오/영상 탭에 같은프리셋 선택·적용·프리셋으로 저장 행을 둔다. 각 도메인에 해당하는 목록만 표시하며 오디오는내장/내 프리셋을 한 선택기에서 구분한다. 영상은기존 사용자 프리셋을 노출하고 새 내장 영상 recipe를 추가하지 않는다. ‘프리셋 관리’ 탭에는생성/이름 변경/삭제만 두고 중복 적용 버튼을 제거한다. 선택은후보이고 적용 시 현재표시 scope의 값을복사하므로 live preset 연결/자동 적용을 만들지 않는다. ‘프리셋으로 저장’은 해당 도메인을관리 화면에 전달하는 생성 준비이며 미확정 draft를저장하거나 그사이 바뀐 대상/값을자동채택하지 않는다. 아래확정 snapshot·token·confirmation 계약을 그대로지킨다.

F00 preset ID/이름 상한·token/ABA·scope·같은 queue를 재사용한다. 새로운 preset 생성은 표시값/확정 snapshot/전역 revision/출처/dirty0 일치 후에만 허용한다. 늦은 read/저장 실패/ACK 유실/폐기는 기존 무쓰기·초안 보존 의미를 유지한다. 원래 생성의 독립 토큰 확인만 자동 확정할 수 있고 값 일치만으로 patch/apply/import/upgrade 성공을 확정하지 않는다.

내장 설정은 코드에 고정한 두 recipe만 제공한다. ‘기존 컴프레서’는 현재5 기본 수치·compEnabled true/EQ·normalizer OFF, ‘음성 EQ’는 고정 대역 gain[-2,-1,-1,0,1,2,1,0]dB와 eqEnabled true다. 두 recipe는 master 초기값·현재 수동 ON/OFF·Gain을 보존하며 자동 저장 row를 만들지 않는다. 적용은 확정 snapshot에 recipe를 합친 완전한 요청/token을 명시 confirmation 후 같은 writer로 보낸다. 정량 검증 전 음질 우수성을 광고하지 않는다.

설정 창은 같은 확장 ID의 최신 global/channel 저장을 구독한다. 서로 다른 필드는 병합하고 같은 필드는 일반 설정 TAB의 기존 commit 규칙을 유지하되 플레이어 Gain은 캡처한 Gain 쌍의 경쟁 변경을 conflict로 거부한다. 각 방송의 DSP·meter·source·master 수동 wanted·late callbacks는 탭별로 독립이다. 플레이어/설정 TAB에서 저장한 전역 Gain의 동기화와 채널 Gain 독립성·같은 scope 경쟁을 실제로 검사한다. 저장 전 미리 적용 Gain과 확정 저장 Gain을 섞어 이미 저장됐다고 표시하지 않는다. dirty0의 화면만 저장값을 따라가고 미저장 의도는 충돌/유실 상태에서 보존한다.

## 10. 보안·개인정보·스토어 고지

현재 scripting/storage와 CHZZK host 범위를 확대하지 않는다. 플레이어 자동 저장을 위해 Gain 한 쌍만 바꾸는 제한된 content writer 역할을 새로 설계하며 기존 설정 페이지의 범용 권한은 확대하지 않는다. origin/예외/frame·web-accessible·CSP·최소 지원 버전은 유지한다. 외부 code/worklet URL·수식·selector를 받지 않고 모든 DSP는 로컬 번들이다. MAIN에 보인 nonce/신뢰된 DOM 이벤트를 extension 설정 페이지의 권한과 동등하다고 설명하지 않는다. native Gain actor 검증이 실패하면 기능을 제한하고 검증을 빼거나 임시 전용 동작으로 몰래 바꿔 완료 처리하지 않는다.

실시간 RMS는 소리를 처리하기 위한 일시 메모리 buffer이며 녹음 파일/사용자 행동 기록/프로필 진단 수집을 추가하지 않는다. 사이트 오디오의 로컬 처리 자체는 사용자 데이터 취급이므로 ‘아무 데이터도 처리하지 않는다’고 고지하지 않는다. buffer/EMA는 current player 수명에 한정하며 기능 OFF/retirement 때 참조·분석 연결을 정리한다. 저장되는 자료는 기존 설정/채널 선호·preset 이름과 새 audio 값/호환 출처 bit이며 원음/RMS 내역은 저장하거나 전송하지 않는다.

[Chrome 사용자 데이터 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)에 따라 로컬 전용 처리도 공개 설명/개인정보처리방침의 취급 범위와 일치시켜야 한다. README/PRIVACY에 오디오 처리 목적·일시 메모리 수명·설정 저장·외부 전송 없음·삭제 방법을 반영하고, 향후 제출 전에 dashboard 응답/공개 설명/정책 URL의 실제 내용과 대조하는 게이트를 둔다. 현재 policy URL/dashboard/store 항목은 별도 배포 승인 없이 변경하지 않는다. 정책 인증을 받은 것으로 표현하거나 기존 사이트 저장소를 삭제하라고 요구하지 않는다.

점검도구는 승인 범위의 npm/Gitleaks/ESLint를 쓰고 raw 경고·오류·input matched/skip 이력을 유지한다. 이번 Astra 검토는 설계의 권한/데이터 손실/정합성/회귀/복잡성 검토이며 정식 모델 보안 스캔/외부 Gemma/무취약성·정책 인증을 추가하지 않는다.

## 11. 수용 기준과 검증 분리

| 영역 | 반드시 남길 증거 |
| --- | --- |
| 저장·전환 | absent/read 무쓰기·absent 첫 schema2 commit·schema1 projection·명시 upgrade1회·overflow/quota/미지원/손상 무손실·global canonical/요청 명칭 충돌·new→old에서 초기 OFF 저장→new 및 역방향·unknown raw/다른 도메인·preset Gain 보존·ABA·ACK 유실/늦은 read·다중 창·target 이동·ISOLATED 위조 입력 거부 |
| 플레이어 Gain | 제한된 ISOLATED writer와 native sender/probe 일치·현재 scope의 자동 저장/재진입·schema/route/token 충돌·두 창 경쟁·coalesce/rate/ACK loss/old ACK·미리 적용/확정값 구별. 보완 명세의 경계·native 선행 검증을 기존 설정 TAB 검사와 별도로 수행 |
| DSP·수명 | source1/current graph만 상태·dry/효과별 bypass·초기 master/수동 OFF·PZP/실제A-B-A·빈 source 재개·EMA reset·hidden/throttled/late·모든 mute/volume0/Gain0·gesture 오류/dry·충돌 source 미가로채기 |
| 기본 오디오 | 기존14 steady/12alignments/18transitions·stress를 새 입력으로 유지. 원래 threshold/오차/hash는 변경하지 않고 승인 bootstrap/새 stage의 변경 이유를 각각 증명 |
| EQ | 중립 주파수 응답 오차≤0.05dB(80Hz..10kHz), 각 band±6 및 혼합 boost의 이론/native response와 실측차≤0.5dB.44.1/48/96kHz, 채널 분리·phase/stereo·nonfinite·headroom·프리셋. 값 ramp/실제 source 적용은 정적 response만으로 대체하지 않음 |
| normalizer | 입력-36/-24/-12/-6dBFS·무음/저잡음/역상·한쪽 입력·tick 시작 위상을 달리한 반복 burst·음소거·dt stall/관측 공백. 44.1/48/96kHz의 window/200ms coverage·초기 W초·시간 공백 무음 누적0·stall ramp 최대100ms/hold. -24→목표-20의 reachable steady 오차≤1dB, 실제 dB automation/출력의 +1/-12dB/s 및 무음 unity 복귀±1dB/s·보정 상한/NaN0, 무음 양수 boost 증가0, Gain·mute를 상쇄하지 않음. OFF 및 Analyser 조회 예외/비유한 sample·RMS의 limited+10ms unity 예외 전환은 시간 공백 hold와 별도로 검사 |
| 최종 출력 | fully wet ON의 limiter 출력 peak≤기존0.9801/full-scale 초과 sample0. native/dry OFF는 원래 입력·기존 지연을 보존하며0.99/1.0 입력을0.9801로 제한하지 않음. master dry/wet 전환은 보완적인 가중치(합1)로 입력 peak≤1 조건에서 full-scale 초과 sample0와 기존 dip/연속성 gate 유지. 기존 enabled stress/fixture/수치를 변경하지 않음. comp/EQ/normalizer 전환도 출력 상한을 검사하고 극단 설정의 limiter 왜곡 한계는 별도 기록하며 ‘무왜곡’이라고 하지 않음 |
| 실제 설치 | 새 clean 물리 후보/자기 bundled Chromium profile, 실제 toolbar→TAB/Gain·preset·전환·두 창·원래 대상 고정. published2.13.3/old F00/새 F01/되돌림/재진입 raw 보존 및 고유 exact loss control. 실제 사용자 Chrome/store/자연 BFCache/worker suspension 미실행은 별도 표기 |
| 통합 | 새 타입/생성/checkJs/inventory 및 전체·패키지·기존 영상/미리보기·9기반·도구/보호. 새로운 exact asset 목록을 독립 pin하며 root dist58/P09/원본 ZIP/CRX/기존 경고8/skip1 불변 |
| 공개 고지 | 실제 로컬 오디오/설정 데이터 취급과 README·PRIVACY·공개 설명·dashboard 응답 일치. 실행·배포 승인 전에는 제출하지 않고 로컬 처리도 데이터 취급에서 누락하지 않음 |

수치가 구현한 native 경계에서 충족되지 않으면 현상을 보존하고 근거를 검토한다. 테스트를 삭제하거나 오차를 넓혀 통과시키지 않으며 알고리즘/수용기준 변경은 사용자에게 묶음 설계로 다시 승인받는다. 기계적 검증과 실제 hardware/site 청감은 구분하며 어느 하나로 나머지 성공을 주장하지 않는다.

## 12. 변경 연결 지도·승인 중지 조건

구현 계획의 범위는 ISOLATED의 제한된 플레이어 Gain 조작부와 전용 계약, shared Media/AudioValues, media-profiles schema reader/upgrade/project/merge, config/contract/broker/client/popup/bridge·i18n·스타일, MAIN runtime envelope/lifecycle/player controls/audio controller/순수 normalizer helper, 기존 생성기/현재 inventory 및 해당 계약·동적 DSP·실제 installed/transition fixture다. 큰 controller에 모든 계산을 붙이지 않고 고정 수학/상태 계산만 기존 audio 폴더의 좁은 함수로 나눈다. 미리보기·HLS·별도 영상 필터의 동작을 리팩토링하지 않는다.

- [x] A안 사용자 선택: 전체 버튼/효과별 설정. 목적·범위·3대안의 조사 이력은 [착수 메모](../validation/2026-10-14-f01-design-intake.md)에 보존한다.
- [x] 최초 전체 명세의 Astra max 설계 보완/targeted 확인: 최초0/4/1·추가 Minor1 닫힘. [이전 검토 기록](../validation/2026-10-14-f01-design-review.md)을 유지하며 새 Gain writer 검토의 성공으로 전용하지 않음.
- [x] 플레이어 Gain 자동 저장 보완 명세·목업·자가 점검/같은 Astra max 재검토 완료. 새 검토 최초0/2/1 모두 닫힘, native/DSP/정식 인증 미검증 유지. [Gain 검토 기록](../validation/2026-10-14-f01-player-gain-review.md) 참조.
- [x] 사용자 written-spec/최신 목업 승인. 숫자·schema/legacy Gain·플레이어 Gain의 자동 저장/제한된 writer·설정 TAB 관리 권위·처리 의미의 변화는 승인 묶음에 포함한다. 제품 실행·미작성 계획 승인과 구분한다.
- [ ] 별도 상세 구현 계획·Astra max 검토·사용자 Native 등 실행 방식 승인. 이 단계 전 제품 구현/실험용 DSP/의존성·실제 프로필 변경 금지.
- [ ] F01 전체 로컬 구현/검증·최종 독립 검토 후 명시 push/한글 PR 승인. F00와의 별도 범위/기준은 그 시점에 고정하며 현재 F00 브랜치에 F01 기능 커밋을 섞지 않는다.
- [ ] 차기 공개 최소 F00/F01/F02·최종 통합·native 제한 대조 후 버전/릴리즈/store 제출·게시 각각 별도 승인.

## 기술·비교 근거

[W3C Web Audio](https://www.w3.org/TR/webaudio/)의 native Gain/Biquad/Analyser/AudioParam을 우선 사용한다. [Chrome 자동재생 정책](https://developer.chrome.com/blog/autoplay/#web-audio)은 저장된 ON만으로 소리 출력을 보장하지 않는다. [Chzzk-Platter의 오디오 믹서](https://github.com/lirpa62/Chzzk-Platter#오디오-믹서)는 비교 목표이며 코드 복사/전체 기능 동등성/안전성 인증의 근거로 사용하지 않는다. 구체적인8밴드/느린 RMS와 고정 recipe는 이 제안의 선택이며 Platter 구현이라고 주장하지 않는다.
