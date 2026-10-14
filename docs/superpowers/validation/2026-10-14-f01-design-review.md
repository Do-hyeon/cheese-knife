# F01 한글 명세·목업의 독립 설계 검토

2026-10-14 후속 사용자 ‘설계 보완’으로 플레이어 Gain 임시 전용 제안은 폐기했다. 현재 규범은 [Gain 자동 저장 보완 명세](../specs/2026-10-14-f01-player-gain-design.md)와 이를 연결한 전체 명세/목업이며, 아래 최초 검토 마감은 당시 입력에 대한 이력이다. 새 writer 경로의 권한·충돌·native 경계 재검토는 별도 기록으로 남긴다. 과거 전체0/4/1·추가 Minor1 닫힘을 새 저장 경로의 성공으로 전용하지 않는다.

2026-10-14. 사용자 A안 선택에 따른 설계 검토이며 제품 구현·실행·공개 승인이 아니다. [명세](../specs/2026-10-14-f01-audio-processing-design.md)와 [정적 목업](../mockups/2026-10-14-f01-audio-settings.html)은 F00 브랜치의 로컬 미커밋 문서로만 관리한다. push/PR/병합·버전·스토어 변경 없음.

## 고정 입력과 최초 판정

- 코드 HEAD: `6ad000e412aa2519e45539ad8a3c6a4da18405bf`, `codex/f00-channel-media-settings`.
- 최초 명세 SHA-256: `C7EE35733A0F994F53A616A4B6B697E63C3F6D49F63D07DC323B0C838D57E513`.
- 최초 목업 SHA-256: `4EA2F69395E46118D6C0313C552CBA4E13236663AC877D72B8BD88E9E06FD798`.
- 독립 검토자: `f01_audio_astra_max_design_review`, `gpt-6-astra/max`, 읽기 전용. 연결된 F00 저장·계약·MAIN·오디오·플레이어·테스트 소스와 공개 W3C 정의를 대조했다. 실제 제품/DSP/브라우저 실행·파일 쓰기·추가 위임·설치·정식 보안 스캔은 하지 않았다.
- **최초 발견: Critical 0 / Important 4 / Minor 1. 판정: 보완 필요.** 수정 후에도 이 수를 유지하며 새 전체0건 검토로 바꾸지 않는다.

## 지적·저자 대조·설계 보완

| ID | 최초 지적 | 연결 소스 대조 및 보완 |
| --- | --- | --- |
| R1 Important | old broker가 compressorDefault만 바꾸면 남은 audioDefault가 F01 복귀 때 초기 ON 선택을 덮음 | 기존 contract.mergeOperations는 해당 필드만 쓰고 unknown을 보존한다. 명세5절을 전역 compressorDefault 한 canonical key/새 audioDefault projection으로 바꿨다. 새 global 요청·preset 적용은 canonical로 정규화하고 channel/preset schema2 값은 독립 저장. new→old OFF→new와 역방향·unknown raw 보존을 수용 기준으로 고정 |
| R2 Important | 2048-frame/250ms 조회는 반복 burst를 계속 놓치고 EMA는 누락 신호를 복구 못함 | W3C는 최근 fftSize frames를 반환한다. native 방식을 유지하며100ms cadence/정상dt≤200ms를 덮는 최소250ms power-of-two 창/최대32768로 변경. 시작·재개 W초 관측 전 대기, 공백은 EMA·무음 누적에서 제외, timer 시작 위상별 burst/stall 수용 사례 추가 |
| R3 Important | tick 증분의1/12dB/s 제한을20ms ramp로 적용하면 실제 곡선은12.5/150dB/s | 실제 AudioParam dB 곡선 제한으로 변경. 계산된 현재값에서100ms 동안 +0.1/-1.2dB 이내를 positive gain exponential ramp로 적용. stall에도 예약분 최대100ms 뒤 hold. 무음 unity 복귀±1dB/s, OFF/오류10ms 예외 연속 전환을 별도 검사 |
| R4 Important | limiter를 우회하는 dry/native에도0.9801 상한을 요구함 | 기존 audio-metrics의0.9801은 enabled stress 게이트다. fully wet ON의 limiter 상한과 dry/native 입력 보존·상보 가중치의 master 전환/full-scale 기준을 분리. 기존 수치/fixture/오차는 변경하지 않음 |
| M1 Minor | EQ 숫자 입력을 약속했지만 목업에는 range/output만 있음 | 8대역 각각 연결 label/unique ID의 숫자 입력과 min/max±6·step any를 추가. 실제 좁은 창·키보드·접근성 검증은 후속 UI 실행 대상으로 남김 |

추가 자가 보완: absent는 무쓰기 논리 schema2이며 첫 사용자 commit만 item 생성, schema1 명시 upgrade와 구분한다. 별도 schema 전환 상황을 목업에 넣었다. 로컬 오디오도 사용자 데이터 취급이므로 메모리 수명·저장/전송 없음과 향후 dashboard/PRIVACY/공개 설명 일치 게이트를 명세10/11절에 명시했다. 이는 스토어 정책 인증이나 현재 dashboard 변경이 아니다.

보완 명세 SHA-256: `31C16C1FFC862EDA4EAFF388060726D77728CE574743DFEBF26E56C72399C53E`.
보완 목업 SHA-256: `DA828EE7087F70516A961F4EC36CE64D4650AA381B7AD1200A39D129A7A2329F`.
같은 검토자의 targeted 확인에서 **R1–R4/M1 닫힘**을 확인했다. 수정 유발 **Minor/P3 1건**은 관측 실패의 hold와 실제 측정 오류의10ms unity 복귀가 겹치는 문구였으며 시간 공백/오류를 분리했다. 재확인에서 warm-up 미확보를 매 tick epoch 초기화로 해석할 위험도 같은 recovery 문단의 보완으로 정리했다. dt 공백 때만 시작점을 초기화하고 W초 대기 중에는 보존하는 최종 문구로 **추가 Minor/P3도 닫힘**이다.

최종 targeted 확인 명세 SHA-256: `F1F1E44A5773A18C2E56E5C6D1CB513CC02DD758C5EBDA43BDEFCFDB10CB7364`, 목업은 위 보완 해시와 같다. 최초0/4/1과 추가 Minor1 이력을 유지한다. 현재 targeted 범위의 잔여 지적은 없으며 **사용자 written-spec/목업 승인 요청 준비 완료**다. 구현·실행·병합·공개 준비 완료가 아니다. 이후 명세의 검토 완료 체크박스/이 기록 연결만 갱신하며 DSP·저장·UI 규범 내용은 최종 확인 입력 그대로 유지한다.

## 결함으로 세지 않은 명시 선택

플레이어 Gain을 영구 저장에서 현재 영상 임시값으로 바꾸는 것은 문서화된 제안이다. 저장은 own 설정 TAB 권위만 사용하며 새 content/page writer를 추가하지 않는다. 기존 동작 변경이므로 사용자 written-spec 승인에 반드시 포함한다. A안 선택을 이 변경의 자동 승인으로 해석하지 않는다.

이전 preset의 상속 Gain은 목적지 값을 보존하고 새 preset은 확정 소유 Gain을 복사하는 구분을 유지한다. absent 첫 저장의 정확한 프로토콜 사전조건/fixture는 written-spec 승인 후 상세 계획에서 구체화한다.

## 판단 제외·미실행

- 실제 DSP 출력·청감·CPU·메모리·timer throttle 성능. 현재는 설계이며 제품 실행 승인 전이다.
- 실제 설치·Chrome/store update·rollback·자연 BFCache·worker suspension. 정적 계약으로 플랫폼 성공을 인증하지 않는다.
- 실제 목업 렌더링·키보드·접근성·좁은 창 화면. DOM/CSS 소스 점검만 수행했다.
- LUFS/EBU/true-peak 인증·정확한 백그라운드 보정·multichannel 원형 보존은 명세의 제외 범위다.
- Platter 전체 기능 동등성·내부 구현 판정. 비교 목적이며 코드 복사/동등 구현을 요구하지 않는다.
- 정식 모델 보안 스캔·무취약성·스토어 정책 준수 인증. 공개 문서 조회와 방어적 설계 대조만 수행했다.
- F00 역사 테스트·경고8·skip1 재인증. 과거 F00 결과를 F01 PASS로 전용하지 않는다.

## 새 정적 점검의 범위

기존 bundled Node24.19.0/jsdom으로 문서4개의 언어·정적 목업 DOM을 검사했다. 한국어/영어 범위, lang=ko, 외부 resource/script/iframe/media 없음, connect-src none, controls42개 모두 disabled, unique IDs29개, 연결 label 유효, EQ 숫자8개/range8개·step any 확인. 설계 숫자 산술 확인은22050/44100/48000/96000Hz의 fftSize8192/16384/16384/32768 및 창371.519/371.519/341.333/341.333ms·buffer 최대262144bytes다. **이는 DSP 구현/출력·브라우저 측정이 아니다.**

Playwright 스킬의 CLI 렌더링 prerequisite인 npx가 PATH에 없어 선택적 자동 렌더링을 보류했다. 새 도구 설치·프로필 실행·API 우회는 하지 않았다. 목업은 정적 HTML이며 실제 확장 화면의 screenshot으로 표시하지 않는다.

문서 마감에서 읽기 전용 protection.mjs를 다시 실행했다. manifestBoundaryUnchanged/protectedArtifactsUnchanged/originalCrxUnchanged 모두true, nativeProfileAccessed=false, package/manifest2.13.3, root dist58. 문서 외 제품/생성·설정·보호 산출물은 변경하지 않았다. 문서5개/로컬 링크32개/누락0/언어 위반0·git diff --check 성공, 목업 해시와 정적 DOM 조건도 다시 확인했다. 완료 체크박스만 이전 문구로 되돌려 계산한 명세 해시는 최종 검토 F1F1 입력과 일치한다. 체크박스/검토 링크 갱신 후 실제 명세 파일 해시는 `4f6b957439c0e8c0b695c4a8f8ee239fbd13ecae0bd541c99a31a317a4c41536`이며 검토된 규범 내용은 불변이다. 자동 패널 열기 요청은 queued이며 실제 화면이 렌더링됐다고 주장하지 않는다.

## 다음 승인 중지 조건

PLANS의 현재 커서는 사용자 written-spec/목업 승인 대기다. 그 승인 전에는 상세 구현 계획·제품 구현을 시작하지 않는다. 이후 계획·Astra max 검토·Native 실행 승인도 별도다. F00 단독 PR에 F01 문서를 섞지 않고 push/PR/병합·릴리즈/스토어를 자동 진행하지 않는다.
