# F01 상세 구현 계획 — Astra max 독립 검토·보완

## 범위·입력

2026-10-14 사용자가 F01 상세 구현 계획 작성·Astra max 공격적 검토·PLANS 반영을 승인했다. 제품 구현·Native Chrome·push/PR·버전/릴리즈·스토어 변경은 수행하지 않는다.

- 로컬 기준 `7e518475fa9846e38997de55eb56326ecb0bd953`, F00 통합 main `ae9f8e50a22dae9d549f1e476d302549ecc03b4a`.
- [상세 구현 계획](../plans/2026-10-14-f01-audio-processing.md), [전체 명세](../specs/2026-10-14-f01-audio-processing-design.md), [Gain 보완](../specs/2026-10-14-f01-player-gain-design.md), [승인 목업](../mockups/2026-10-14-f01-audio-settings.html), PLANS와 실제 타입·broker/client·MAIN/DSP·생성 경로·fixture/harness/source attestation을 읽기 전용 대조했다. 실제 문구는 한국어/영어만 사용한다.
- 새 독립 reviewer: `gpt-6-astra` / `max`, `/root/f01_implementation_plan_astra`. 전체 대화 없이 목적·정확한 입력과 제약을 전달했고 추가 subagent를 만들지 않았다. 과거 설계 검토를 이번 계획 검토로 전용하지 않는다.
- 최초 계획 SHA256 `4B0E1A513E7B1A76795591B320289DB3CA787C2B74E83FE436ED4FAECC0C17BF`; 보완본 `090AFD00E88B3A157AF367F942C1D389B54059516C720A81FDC0F5FD621BFB95`.

## 최초 결과

**Critical0 / Important3 / Minor0. 판정: 보완 후 재확인 필요.**

저장 schema/projection·alias/unknown 보존·한 queue·Gain epoch/receipt·cold gesture, preview/확정값/현재 wanted 구분, fixed preset snapshot, 기존14/12/18·stress/오차 보존과 별도 새 pin, stereo/RMS/dB 속도·수명 기준 및 신규 의존성 없는 책임 분리는 타당한 구성으로 평가됐다.

| ID | 근거·사용자 영향 | 계획 보완·검증 경계 | 현재 상태 |
| --- | --- | --- | --- |
| F01-PLAN-01 Important | T3 actual Gain gate가 T4 protocol3 소비자와 후행 fixture 확장에 의존. 현재 owner/runtime/audio는2이고 baseline live fixture에는 volume UI/eligible source가 없음. gate 막힘 또는 테스트 가짜 연결로 false PASS 위험 | 최소 owner/config/scopedGain/preview/master 연결과 모든 owner guard를 T3 gate 전으로 이동. 실제 단일 PZP·volume·decode/play 가능한 합성 Blob WAV fixture/생산 조작부·trusted master ON을 선행. EQ/normalizer는 gate 뒤. 단계별 dist60/61/62·runtime18/19/20 pin으로 빈 후행 자산 금지 | 동일 reviewer targeted 확인으로 닫힘 |
| F01-PLAN-02 Important | qualification 후 커밋 vs Native 전 clean SHA 충돌. 기존 sourceAttestation은 dirty를 거부하고 untracked 입력은 SHA 증거에서 빠짐 | T3/T7/T8 및 공통 규칙에 실행 전 신규/원본/테스트/생성/pin 모두 포함하는 로컬 checkpoint. checkpoint는 완료/PASS/공개가 아니며 전후 입력 일치·dirty 거부 유지. 실패 근거 보존/중지, 보완은 새 SHA | 동일 reviewer targeted 확인으로 닫힘 |
| F01-PLAN-03 Important | TAB master가 audio controller만 직접 호출하면 기존 controls의 private manual intent를 갱신하지 못해 default ON→TAB OFF→binding/PZP 갱신 후 재ON 위험 | 기존 intent 소유자에 typed setAudioWanted/getAudioWanted를 좁게 추가하고 button/TAB 동일 action→manual/automatic/needsResume/generation 갱신→controller. get-audio-state/set-audio-wanted 명칭 통일·원래 document 전후 native 검사. TAB OFF 뒤 binding/PZP/pending/resume OFF·저장0, genuine 새 video/route/default 대조 | 동일 reviewer targeted 확인으로 닫힘 |

executor는 실제 owner guard 전체, `controls.ts`의 audioIntents/버튼·자동 ON 분기, live.html의 muted video만 존재하는 구조 및 sourceAttestation의 dirty 거부를 확인했다. 기술 동작을 구현하거나 실행해 지적이 재현됐다는 뜻은 아니다.

## 판단 제외와 executor 판단

- 신규 파일 미존재: 구현 대상이므로 결함으로 세지 않는다. **수용**; 신규/기존 경로와 stage pin을 구분한다.
- API 자체가 불가능하다는 주장: 공식 API에는 ISOLATED execution·native document/frame·document-targeted messaging이 있다. 직렬화된 고정 probe 함수가 해당 realm의 private registry를 다시 읽어야 한다. **수용**; API 존재와 실제 qualification 성공은 별개이며 실패하면 중지한다.
- 동일 dependency script 경로의 중복 선언: reviewer가 Chromium injector의 동일 path 실행 dedup 근거를 확인해 오탐에서 제외했다. **수용**; 새 단계 loader는 실제 설치/세대 혼재/권한·exclude 대조로 검증한다. 이 정적 판정으로 Native load 성공을 인증하지 않는다.
- RMS/EMA·headroom/ramp·실제 음향 수용 성공: 실행 전이라 PASS 판정하지 않는다. **수용**; 승인된 수치를 Worklet/R128/true-peak로 확대하지 않으며 T8에서 객관 측정한다.
- 정식 보안 스캔/공격 재현·새 의존성·권한·제품/native·외부 모델·push/PR: 이번 승인 밖이며 수행하지 않았다. **수용**; 과거 P02 해시 불일치·실제 스토어 수용도 닫지 않는다.

근거: [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [runtime](https://developer.chrome.com/docs/extensions/reference/api/runtime), [document-targeted messaging](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-sendMessage), [Chromium injector](https://raw.githubusercontent.com/chromium/chromium/main/extensions/renderer/user_script_injector.cc). source/API 계약과 실제 실행 관측을 구분한다.

## 같은 reviewer targeted 재확인

보완본090AFD00의 실제 SHA 일치·계획 전체·관련 코드와 승인 명세 diff를 다시 확인했다. **F01-PLAN-01~03 모두 닫힘, 잔여 Critical0 / Important0 / Minor0, 승인 요청 가능**으로 판정했다. 위 표의 세 항목 모두 같은 reviewer가 닫힘을 확인했다. 명세 변경은 승인 상태/릴리즈 조건뿐이며 기술 수치·저장/DSP 조건은 유지됐다.

- T3 최소 연결·실제 fixture·단계 pin은 EQ/normalizer 앞당김/빈 자산 없이 선행 gate를 충족하도록 계획됐다. T4가 기존 연결을 재사용한다.
- T3/T7/T8와 공통 규칙의 Native 전 checkpoint/clean SHA·새 파일 HEAD 포함·실패 보존이 sourceAttestation과 일치한다.
- 공통 수동 master action을 기존 intent 소유자에 두고 TAB/button 경로를 통일했다. 변경 유발 재ON을 회귀 기준으로 고정했다.
- 새 의존성·권한·불필요한 추상화 확대는 발견하지 못했다. 실제 구현/입력·음향·생성/strict 성공은 검토하지 않은 후속 gate이며 승인 차단 사항으로 세지 않았다.

T3 native source/AudioParam/readback은 T8 실제 출력 증거가 아니다. private closure·actual sender/trusted dblclick/cold gesture·문서 교체·종료 증명, stereo/위상/headroom/dB 속도·EMA·timer·기존14/12/18/stress는 구현 후 확인한다. 제품/native/push/PR·보안 스캔을 수행하지 않았고 이번 닫힘을 동작 PASS로 표시하지 않는다. 이후 계획 체크리스트/이 기록 링크만 갱신하며 검토한 기술 내용은 변경하지 않는다.

## 현재 마감 체크리스트

- [x] 한글 상세 계획9Task·정확한 범위/경계·RED/GREEN·실패 대조·실행 승인 묶음 작성.
- [x] root 자체 문서 링크·Task 수·한국어/영어·수치/3보완 마커·whitespace 점검. **정적 문서 검사**이며 제품 회귀/생성/빌드/Chrome/음성 출력 실행이 아니다.
- [x] 최초 fresh Astra max 검토 및 executor의 원본 코드 근거 확인·계획 보완.
- [x] 같은 reviewer targeted 확인과 수정 유발 회귀/남은 가정 평가. 3건 닫힘·잔여0/0/0.
- [x] 최종4문서 링크/한국어·영어/충돌·whitespace,9Task/미착수9항목·닫힘3건·WAITING-USER/금지 경계 확인 및 PLANS 최신화. 제품/manifest2.13.3·root dist58 유지, tracked runtime 변경0. 전체 제품 회귀·생성·빌드·Chrome 검사는 문서-only 범위에서 실행하지 않았다.
- [ ] 사용자 계획·Native 격리 실행 승인. 승인 전 T1 제품 구현과 T3 qualification도 실행하지 않는다.
