# F01 플레이어 Gain 자동 저장 보완 검토

2026-10-14. 사용자 ‘설계 보완’에 따른 [Gain 보완 명세](../specs/2026-10-14-f01-player-gain-design.md)·[전체 명세](../specs/2026-10-14-f01-audio-processing-design.md)·[목업](../mockups/2026-10-14-f01-audio-settings.html)의 변경된 writer 경로만 재검토했다. 같은 `f01_audio_astra_max_design_review`/gpt-6-astra/max 검토자는 읽기 전용이다. 제품 구현/실행·설치·정식 보안 스캔/정책 인증·push/PR/병합/배포 없음.

## 최초 입력·판정

HEAD `6ad000e412aa2519e45539ad8a3c6a4da18405bf`, branch `codex/f00-channel-media-settings` 그대로다.

| 문서 | 최초 SHA-256 |
| --- | --- |
| 전체 명세 |01DF95AF98DD0BD328D824BC228C3179689F436762DB4B65E8ECBE49F15DD752 |
| Gain 보완 명세 |A45B64A2B8C779517170125BB2740C5347386C330456B48A3CEB78A93C73B90F |
| 목업 |EE70680FF4AA702A679C8B3171DF343AAEFCDFB0F1515C44E0664C1E684E540D |

**새 Gain 경로의 최초 발견: Critical 0 / Important 2 / Minor 1, 보완 필요.** [이전 전체 검토](2026-10-14-f01-design-review.md)의0/4/1 및 targeted Minor1 닫힘은 그대로 보존하며 새 경로의 결과로 전용하지 않는다.

## 소스 대조·보완

| ID | 지적·근거 | 설계 보완 |
| --- | --- | --- |
| G1 Important | Gain pair A→B→A는 비교값/생성 token이 같아 old intent가 통과. 기존 media patch는 record revision을 비교하지 않음 | 모든 owned Gain 변경 경로의 active-scope 휘발 epoch·상속 source 의존 epoch를 ticket에 결합. 원래 queue에서 관련 old ticket 무효화, 자기 ACK만 다음 자기 draft 기준 갱신. unrelated warm 필드는 병합. bounded64 receipt의 자기 notification 중복 제거·용량 busy/unknown raw 제한을 명시. owned 값/출처 ABA와 미관측 legacy 사이트 ABA 한계를 구분 |
| G2 Important | worker 휴면/actor 만료 후 새 ticket을 받으면 옛 intent 재전송 금지 때문에 정상 첫 조작의 자동 저장 경로가 없음 | clean에서 시작한 새 gesture 후보와 기존 dirty/unknown durable intent를 분리. 첫 전송 전 native view 준비, warm epoch 확인/cold는 표시 당시 전체 revision까지 확인. 동일 기준이면 추가 조작 없이 최초 저장, 바뀌면 conflict. read-only 준비 실패 쓰기0와 set 전송 후5초 unknown을 구분. heartbeat 없이30초 이상 idle/60초 만료/worker 재시작 수용 사례 |
| G3 Minor | parent/mount 교체 retirement와 same-video PZP draft 보존이 같은 상황에 겹침. 기존 controls는 video가 같아도 mount 재생성 | 같은 private host/ShadowRoot·실제 video/doc/route/binding을 소유자가 확인하고 직접 reparent하는 경우만 예외. 검사 동안 전송 보류/native 재확인. 새/foreign host는 권위 폐기, 표시용 초안만 남기고 자동 이동·저장하지 않음. 전체 명세와 보완 명세를 함께 맞춤 |

보완 전체 명세 SHA-256 `F5CFAA28996975E6FC6037739CFA2B7510EFFA6C03675DE06506F443C9C68F89`, Gain 명세 `55F01AFF27E2CD568C181E5CA2BEE2A50F45F12AB12079C899441E806E32408A`, 목업은 최초 해시 그대로다. 같은 검토자가 이 세 해시/HEAD 일치를 확인하고 **G1/G2/G3 모두 닫힘, 새 승인 차단 결함 없음**으로 targeted 판정했다. 최초0/2/1은 그대로이며 새 전체0건 검토로 덮어쓰지 않는다. 기존 전체0/4/1·추가 Minor1과 새 Gain0/2/1을 분리 유지한다.

**사용자 written-spec/목업 승인 요청 준비 완료.** 구현·Native/DSP·공개 성공 인증이 아니다. 마감에서는 전체 명세의 완료 체크박스/검토 링크와 Gain 명세의 상태 metadata만 변경하며 검토된 규범 내용은 보존한다. 아래 판단 제외는 전부 유지한다.

## 판단 제외·한계

- 실제 sender/document/private probe·ISOLATED registry 연결: native 실행 미승인이다. 최초 qualification 실패 시 검증 생략/기능 후퇴로 완료 처리하지 않고 추가 설계 승인받는다.
- 실제 pointer/keyboard·접근성·좁은 화면/전체 화면/PZP·페이지 UI 오도: 정적 HTML 점검뿐이며 닫힌 ShadowRoot가 사용자 인증이나 DOM 무결성 보장이라고 주장하지 않는다.
- 실제 worker 중단·큐/rate/coalescing·ACK 순서·자원 사용량: 설계이며 실행 증거가 없다.
- DSP·청감·CPU/메모리·timer throttling·source1: 기존 미검증을 유지하고 이 writer 검토로 PASS라 하지 않는다.
- 설치/업데이트/rollback·mixed version·BFCache·스토어 동작: 실행하지 않았다.
- 무취약성·정식 보안 스캔·개인정보/스토어 인증: 제공하지 않는다. 로컬 설정 저장/외부 전송 없음의 제출 전 고지 대조 게이트는 유지한다.
- LUFS/EBU/true-peak·정밀 백그라운드·다채널 원형 보존·Platter 전체 동등성: 기존 제외 범위다.
- F00 과거 테스트·기존 경고8/skip1: 재실행/재인증하지 않고 F01 PASS로 쓰지 않는다.

[Chrome worker 수명주기](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)는 비활동 종료와 메모리 상태 손실을 설명한다. 이를 이유로 heartbeat를 추가하지 않고 정상 첫 조작의 read 준비를 설계했다. native 동작 증거는 향후 별도 실행에서 확인해야 한다.

## 정적 확인·보존 경계

초안 문서6개의 언어·로컬 링크35개/누락0, 목업의 자동 저장/전역·채널/결과 불명 문구·EQ 숫자8개·모든 control disabled/외부 resource0을 기존 Node/jsdom으로 확인했다. 실제 렌더링/DSP/제품 실행은 아니다. Playwright CLI의 npx 부재로 자동 렌더링은 보류하며 도구 설치/새 프로필로 우회하지 않았다.

최종 문서7개·로컬 링크42개/누락0·언어 위반0·unique IDs29·EQ 숫자8·disabled controls44/외부 resource0·git diff --check를 확인했다. 전체/Gain 명세의 완료 체크박스·상태 metadata만 이전 문구로 환원해 계산한 해시는 최종 targeted 입력과 각각 일치한다. 마감 실제 파일 해시는 전체 `D37D4C32D52C6A42DD73CEE9926E5DD4A654F56A51717A2483D0710FE8E15DD9`, Gain `A15D9D02777F0C04158F1DFCE240C926B4C4F12C92D182EABC52933F08C755F9`이고 검토된 규범 내용은 불변이다. 목업의 최종 검토 해시도 일치한다.

root 보호 selfcheck를 다시 실행해 manifest/보호 산출물/원본 CRX 불변 모두true, nativeProfileAccessed=false, package/manifest2.13.3, dist58 확인. 제품/생성/설정·기존 Chrome/P09·index/HEAD/branch는 변경하지 않았다. 자동 패널 열기는 queued이며 실제 목업 렌더링 성공으로 표시하지 않는다.

사용자에게 늦게 도착한 F00 CDP 질문의 승인은 해당 과거 단계 범위이며 새 F01 native/브라우저 실행 승인으로 재사용하지 않았다. 현재 F01 문서는 로컬 미커밋 상태로 보존하고 F00 단독 PR에 섞지 않는다.

## 다음 게이트

현재 PLANS 커서는 전체 명세·Gain 보완 명세·목업의 사용자 written-spec 묶음 승인 대기다. 그 전 구현 계획/제품 구현을 시작하지 않는다. 상세 계획/Astra 검토·Native 실행/공개는 별도 승인이다.
