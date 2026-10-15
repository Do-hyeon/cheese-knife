# F01 전체 PR 사전검증

## 승인·공개 범위

2026-10-15 사용자가 F01 전체 push·한글 PR 하나·공개 CI 확인을 승인했다. 대상은 `Do-hyeon/cheese-knife`의 `main`, 브랜치는 `codex/f01-audio-processing`이다. **병합·릴리즈·스토어 배포·브랜치 삭제는 하지 않는다.** F02는 별도 작업이며 이번 PR에 포함하지 않는다.

T1–T9와 Minor2 후속을 함께 공개한다. Gain 소유권·채널/전역 저장 연결, 8대역 EQ·컴프레서·RMS 기반 자동 음량 보정, 설정 UI/프리셋, 저장·수명주기·객관 오디오 검사 및 문서를 포함한다. 새 확장 권한·외부 수집 서버·버전 변경은 없다.

## 현재 입력 검사

- 기준 main/merge-base는 `ae9f8e50a22dae9d549f1e476d302549ecc03b4a`. 공개 준비 전 HEAD `be16a96ea8f1a83350bbd6c26bde78116cd90014`는 제품 최종 `4b89ec3` 이후 문서만 바뀌었다. 이번 승인·검사 기록도 문서 변경뿐이다.
- 기존 격리 후보 `output/f01-execution-20261015/source`와 root의 비문서 추적 입력308개가 byte 일치한다. 사용자 Chrome/P09·설치를 조작하지 않았다.
- 전체 검사: **1632 total / 1631 pass / 0 fail / 1 기존 private 자료 제외**, exit0, 65.037초. 비공개 원장을 수정하거나 제외를 PASS로 바꾸지 않았다.
- 9개 기반 검사, 격리 빌드·패키지 모두 exit0. 제품2.13.3·22 entry resources 유지.
- 실제 점검도구: npm0·Gitleaks dir0/git0, ESLint55/raw exit1. 원본은 `output/tool-audit/run-2026-10-15T13-59-06-547Z-yWbCGX/summary.json`. 정적 패턴 경고를 확정 취약점이나 전체 보안 인증으로 해석하지 않는다.
- 전체/기반 검사 로그는 격리 후보 `output/f01-pr-preflight-{full,foundation}.log`, 감사 실행 로그는 root `output/f01-pr-preflight-audit.log`에 보존한다. private output·프로필·원장은 공개하지 않는다.
- root dist58파일의 inventory SHA-256 `a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2`, package/manifest2.13.3 유지. 공개 준비는 root dist 교체가 아니다.

## 기존 검토·Native와 한계

[F01 최종 검토](2026-10-15-f01-final-review.md), [Minor 후속](2026-10-15-f01-minor-ui-follow-up.md), [단계 아카이브](../archive/2026-10-15-f01-completed-stages.md)에 source별 검토·정상/손실/거부·cold·실제 Gain·오디오 측정과 실패 이력을 보존한다. 이번 공개 준비에서 과거 Native를 재실행한 것으로 표시하지 않는다. Minor fresh Astra max의 최초0/1/0 지적은 작성자가 RED→GREEN·전체/Native로 보완했으며 별도 재검토0/0/0을 주장하지 않는다.

자동 음량 보정은 stereo RMS 기반이며 LUFS/물리 스피커·모든 보호소스 품질 인증이 아니다. 실제 VOD legacy 자동 가져오기는 미지원이고 제한 UI를 보완했다. 자연 worker 중단·실제 BFCache·플랫폼 업데이트/롤백은 강제/합성/격리 검사와 구분한다. Windows 준비/종료 간헐 실패의 과거 원인은 미확정이며 후속 성공으로 삭제하지 않는다.

공개 CI 상태는 생성한 PR의 정확한 head/checks로 확인한다. 생성만으로 CI 통과·병합을 선언하지 않는다. publish workflow는 수동 실행 전용이며 이번에는 실행하지 않는다.

## PR #45 최초 공개 CI와 입력 준비 보완

[F01 전체 PR #45](https://github.com/Do-hyeon/cheese-knife/pull/45)를 생성했다. 최초 head `3c77af4`의 [CI 38747675782](https://github.com/Do-hyeon/cheese-knife/actions/runs/38747675782)는 Windows/Ubuntu 기반 검사 성공, verify의 전체 검사1630통과/1실패/1기존제외로 종료했다. 실패는 `frozen F00 input is the exact committed 59-resource snapshot...`의 `f01-f00-payload-git`이다.

원인은 CI shallow checkout에 F00 고정 커밋이 없는데, 기존 준비 단계가 스토어 baseline만 fetch한 것이다. 별도 shallow 사본에서도 같은 reader로 동일 실패를 재현했고, 정확한 `ae9f8e50a22dae9d549f1e476d302549ecc03b4a`를 depth1 fetch한 뒤59개 리소스·inventory `9715087af1aa2b36fc54b330e5a879ce384f4c9a4f56faf1c6fd8847436580df`가 통과했다. 비공개 로그는 `output/f01-pr-ci-shallow-{red,green}.log`와 최초 CI 실패 로그에 보존한다.

workflow에 unit suite 이전의 고정 F00 fetch 단계만 추가했다. 전체 이력 fetch·테스트 skip·새 기준 해시·제품 수정은 없다. 보완 후 격리 전체 회귀는1632중1631통과/실패0/기존제외1, exit0, 65.433초다(`output/f01-pr-ci-fix-full.log`). 공개 CI의 최신 head를 다시 확인하며 최초 실패를 삭제하지 않는다.

### 두 번째 공개 CI의 플랫폼 경계 보완

head `bdea384`의 [CI 38748653001](https://github.com/Do-hyeon/cheese-knife/actions/runs/38748653001)는 양쪽 기반·전체 테스트·빌드·패키지까지 통과한 뒤 오디오 측정 시작의 `visibility-launch-invalid`로 실패했다. `check-audio-quality.mjs`가 Linux에서도 Windows 전용 Native visibility launcher를 선택한 것이 원인이다. DSP 측정/수치 판정 전에 실패했으며 품질 허용치 실패로 재표기하지 않는다.

일반 frozen 오디오 검사만 Windows에서 기존 Native 경로를 쓰고 다른 OS는 원래 Playwright headless 경로를 쓰도록 단일 분기를 보완했다. `--chrome` 경로와 Windows 전용 가시성 실측 도구는 그대로다. 실제 실행 glue를 Windows/Linux/macOS·Chrome 지정 여부로 실행하는 회귀에서 Linux 오선택 RED를 확인했고 보완 후 관련21검사가 통과했다. calibration/측정/허용치 고정 해시는 유지했다.

보완 후 전체1633중1632통과/실패0/기존제외1(exit0, 64.951초), 개발/오디오 도구 타입 검사 통과. 로그는 `output/f01-pr-ci-platform-{red,green}.log`와 격리 후보 `output/f01-pr-ci-platform-full.log`에 보존한다. 새 실제 감사 `run-2026-10-15T14-13-04-096Z-XtXQSa`는 입력 전후 일치·npm/Gitleaks0·기존과 같은 ESLint55/rawexit1이다. Linux의 실제 오디오 측정 성공 여부는 다음 공개 CI로 별도 확인한다.
