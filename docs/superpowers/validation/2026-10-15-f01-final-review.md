# F01 전체 구현 최종 검토·보완 기록

2026-10-15 / Asia-Seoul. **상태: 원 Important 두 건 보완 후 targeted의 연결된 복구 진입1건 추가 보완·재검증 중. T9/F01 미완료.** push·PR·병합·배포 승인으로 사용하지 않는다.

## 1. 검토 범위

- 독립 검토자 `/root/f01_whole_branch_astra_max`, `gpt-6-astra` / `max`.
- 전체 범위 `ae9f8e50a22dae9d549f1e476d302549ecc03b4a..0b8fbe7740eb206bc4bd77bb7fabca825eaf6036`, 로컬65개 checkpoint. diff 1,716,020 bytes / SHA256 `9869fa12d4c618c06ae60b8d08763acb129da8ed9d5103f6140774814422251f`.
- 승인 명세·실제 제품/도구·관련 회귀·source가 다른 Native/감사 결과를 읽는 정적 검토다. 검토자는 테스트·빌드·Native·외부 요청·파일 변경을 하지 않았다. 도구/보호 서비스 차단은 없었다.
- 최초 결과 **Critical0 / Important2 / Minor2**, `With fixes`. 원문은 로컬 private 검토 작업공간에 보존한다. 과거 T8 전체 성공을 이번 경쟁 조건의 검사로 전용하지 않는다.

## 2. Important 보완

| 항목 | 영향과 최소 보완 | 직접 회귀 |
| --- | --- | --- |
| 실패 초안의 PZP 재배치 | 같은 video/private host라도 `failed/unknown/conflict`는 잠금·초안을 유지한다. 자동 view/새 intent/schedule을 시작하지 않으며 원래 문서의 명시 폐기·재조회가 필요하다. 정상/준비 중 재배치는 기존 동작을 유지한다. | 빠른 거부 세 종류→deadline 안 같은 video 재배치→호스트/binding/초안 보존·disabled·요청 추가0. 기존 구현에서 추가 read/write로3건 RED, 보완 후 GREEN. |
| clean refresh의 추가 저장 알림 | 공통 `refresh`에서 읽는 동안 무효화된 응답은 적용하지 않는다. 최초 기준과 동일한5초 deadline을 유지하며 알림이 소모될 때까지 직렬 read한다. writer 자동 재시도나 새로운 저장 권한이 아니다. | A 응답 보류→B 알림→A 해제→C 알림→B 해제→C만 preview/ready. 기존 구현에서 A를 ready로 확정해 RED, 보완 후 GREEN. |

위 unit gesture callback은 jsdom trusted-input 경계만 대체한다. 실제 trusted 이벤트·native sender/문서 검증은 별도 설치형 검사다. 생성 JS는 기존 `generate:settings`로만 갱신했다. DSP·수치 허용치/fixture·권한·스키마·의존성·root dist는 불변이다.

추가로 명시 ‘폐기/재조회’의 read도 같은 `owner.preparing` promise로 추적해 재배치가 병렬 read를 시작하지 않게 했다. 실제 pending2vs1 RED→GREEN 및5초 deadline 비연장 검사를 포함해 집중21/21이 통과했다. 최초 전체 sandbox run은 링크 EPERM/fixture 정리와 미갱신 pin으로1594통과/27실패/기존1skip, 첫 Native 전체는1620통과/생성 Gain pin1실패/기존1skip이었다. 모두 보존하며 테스트·판정은 완화하지 않는다. 별도 executable pin 중 player Gain만 `0cc8d4e3651d7240a9680e9141a0a88c6c101627df26551ae47033a806fe26fb`로 갱신했고 DSP pin은 불변이다. 전체 회귀/9기반/빌드·패키지를 다시 실행한다.

**1fe0dcf targeted:** 원 Important1과 원 storage 알림 경로는 해결됐지만, 복구 버튼의 빠른 중복 클릭은 아직 병렬 read로 invalidation을 소모할 수 있어 `With fixes`였다. 이를 완료로 세지 않고 실제2vs1 RED를 확인했다. 복구는 failed/unknown/conflict이면서 preparing/inflight가 없을 때만 허용하고 loading 직후 즉시 render한다. 중복·늦은 클릭0, 이전 응답 preview0, 최종값만 반영, 초안 재전송0 회귀가 GREEN이다. 집중22/22, 새 player Gain executable pin `f92863ab9cb8107238525e8c9ccc9278d813789c8bd7c9a746273ac6292eb9ec`. 이 마지막 진입 보완의 전체/설치본/targeted 결과는 아직 미완료다.

최종 진입 보완의 전체 검사는 **1625중1624통과/실패0/기존1skip(68.363초)**, 9기반/build/package62/22 통과다. 실제 감사 `run-2026-10-15T13-15-19-579Z-f4EiyQ`는 npm/Gitleaks0, ESLint55/rawexit1/catalog 동일·전후입력 일치다. 로그는 격리 실행 폴더의 `f01-final-recovery-fix-full.log`/`f01-final-recovery-fix-foundation.log`와 root `output/f01-final-recovery-fix-audit.log`에 보존한다. 마지막 clean checkpoint의 설치 Gain과 targeted 확인은 계속 미완료다.

## 3. 보류 Minor

- **VOD legacy Gain 가져오기:** ‘사이트 Gain 읽기’ 버튼은 활성 상태지만 채널 scope가 없어 동작하지 않는다. VOD 플레이어 Gain 전역 저장의 실패나 데이터 손실은 아니다. 후속 UI 제한 안내 또는 채널 scope/native 읽기 대상 분리 설계가 필요하며 기존 sender 검증은 완화하지 않는다.
- **프리셋 생성 진입:** save-as 이름 입력 자동 focus 및 빈 목록 최초 생성 영역 펼침이 승인 UX와 다르다. 수동 생성과 값/snapshot 보존은 가능하지만 키보드 탐색이 불편하다. 이번 Important 보완 pass에서 이 두 항목은 미해결로 남긴다.

### 설치형 U 결과 — source `1fe0dcf`

마지막 중복 복구 진입 guard를 추가하기 **전** source다. 결과를 새 checkpoint로 재표기하지 않는다. 실제 bundled Chromium151.0.7922.34, 자기 신규 프로필·고정 fixture만 사용했다.

| 실행 | 결과 |
| --- | --- |
| F01Gain20261015U | full PASS, 실제 pointer/keyboard·0/reset·ACK/재진입·61초 idle·같은 video 재배치·채널 소유값과전역 보존·합성/iframe/old document 거부; 71.780초 |
| F01Settings20261015U | 8개 검사 범주 PASS, 페이지 오류0; 27.701초 |
| F01SettingsLoss20261015U | wrapper ok=true, 의도한 내부 passed=false와 정확한 owned-gain/inherit-bit/eq-band/preset-id4누락 감지; 28.744초 |
| F01Negative20261015U | 정확한 main-runtime-missing 거부 감지 |
| F01Cold20261015U | seed11/phase28, 정상 종료39회, 손실0, source/after 일치, cleanup/secondary와 내부 오류 모두0 |
| F01ColdLoss20261015U | seed5/phase9, 정상 종료19회, 정확한5손실 감지(valid-ui와4개 미디어 누락), source/after 일치, 모든 cleanup/secondary0 |

Gain/설정/설정손실 모두 source/after5개 항목 일치, 페이지 오류0, 정상 종료3증명 true다. cold의58개 종료도 모두3증명 true다. 마지막 source에 대한 직접 Gain 재검증은 별도로 남긴다. Native U 종료 후 자기 F01 프로필 Chrome process0을 실제 CIM으로 확인했다. 과거 실패는 모두 보존한다.

## 4. 판정 범위와 잔여 제한

- 스피커·청취/LUFS·보호 스트림은 합성 floating-output 범위 밖이며 보호 우회를 추가하지 않았다.
- 자연 worker suspension·실제 플랫폼 업데이트/rollback·실제 BFCache는 만료/강제 교체/cold/synthetic persisted 검사와 구분한다.
- Windows SDK 준비/정상 종료의 과거 간헐 실패 원인은 미확정이다. 이후 정상 run/현재 process 부재로 과거 실패를 PASS 처리하지 않는다.
- ESLint55 원본 경고/exit1·개별 정적 분류와 전체 보안 인증을 구분한다. 같은 권한 OS actor의 동시 파일 교체 원자성은 미검증이다.
- `web/audio.js`의 정규화된 executable pin과 raw-file SHA는 별개 계약이다. 독립 provenance/생성 검사는 유지한다.
- 스토어 정책/dashboard/배포 준비는 이번 정적 검토 대상이 아니다. 로컬 README/PRIVACY 동기화는 실제 게시가 아니다.

## 5. 다음 게이트

- [x] 보완 source의 전체1624중1623통과/실패0/기존private1skip(64.865초), 9기반·빌드/패키지62자산/22entry 통과. 격리 실행 폴더의 `f01-final-fix-full.log`와 `f01-final-fix-foundation.log`에 보존.
- [x] 실제 npm/Gitleaks dir/git0, ESLint55/rawexit1(기존 분류 catalog와 완전 일치)/입력 전후 snapshot 일치. `output/tool-audit/run-2026-10-15T13-04-40-583Z-9cTjK5/summary.json`. rootdist58공개해시 `a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2`와 버전2.13.3 유지, 현재 변경 문서 local33링크·한글/영문 검사 통과.
- [ ] 새 clean checkpoint의 실제 설치 Gain·설정/손실·거부 회귀, source/after/정상 종료 대조.
- [ ] 같은 Astra max 검토자의 두 수정 경로 targeted 확인과 판정 제외 항목 원장 기록.
- [ ] T9 최종 검사/완료·아카이브·PLANS 정리. Minor·배포 후행 제한 유지.

T8 DSP 근거는 [구현 검증](2026-10-15-f01-implementation.md)과 [완료 단계](../archive/2026-10-15-f01-completed-stages.md)의 기존 source에 귀속한다. Gain 소유 UI 변경을 DSP 재측정 성공으로 표시하지 않는다.
