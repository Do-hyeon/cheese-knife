# 치즈 나이프 복구·검증·배포 실행 계획

> **For agentic workers:** 현재 상태와 다음 행동은 이 문서를 기준으로 한다. 완료 과정과 과거 수치는 [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md)에서 확인한다. 구현은 주 실행자가 순차 수행하고 필요한 독립 기능 검토만 별도로 요청한다. 보안 모델 검토를 자동 호출하지 않는다.

**Goal:** 기존 결함과 정의된 검증 범위를 해결한 Chrome 복구판을 같은 산출물로 설치 검증하고, 승인된 공개 절차를 거친 뒤 후속 기능을 구현한다.

**Tech Stack:** Chrome MV3, JavaScript, Node 24.19.0, Node test runner, Playwright, ESLint, npm audit, Gitleaks. 현재 Chrome 합성 검증 환경은 155.0.8059.39다.

**References:** [최신 출시 게이트](docs/superpowers/validation/2026-10-11-recovery-release-gates.md), [최종 설치 체크리스트](docs/superpowers/validation/2026-10-11-final-installed-checklist.md), [오디오 전환·헤드룸 검증](docs/superpowers/validation/2026-10-11-compressor-transition-headroom.md), [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md).

작성일: 2026-10-11 / Asia-Seoul. 이 파일에는 현재 상태, 미완료 작업, 사용자 개입 지점과 공개 게이트만 유지한다. 새 권한·데이터 처리·지원 범위·외부 전송·공개 범위 변경은 별도 설계 승인을 받는다.

## 1. 변경하지 않을 결정

- 복구판은 **Google Chrome만 지원**한다. `minimum_chrome_version`은 `121`이며 Firefox 구현·빌드·배포를 복구하지 않는다.
- 현재 폴더와 `codex/sidebar-preview-followup` 브랜치에서 작업한다. 사용자 요청 없이 worktree·별도 채팅·자동화·새 목표를 만들지 않는다.
- 전체 dirty tree를 일괄 stage하지 않는다. 원본 PR #81, `codex/community-store-preview`, 사용자의 기존 변경과 개인정보처리방침 URL을 보존한다.
- HLS 보호 파일과 root `dist`는 검증한 후보로만 바꾼다. 검사 기대값이나 scanner 규칙을 통과 목적으로 약화하지 않는다.
- GPT 보안 검토를 재개하지 않는다. 승인된 점검 도구의 결과와 일반 기능 검증을 구분한다. Astra max 기능 검토를 보안·HLS 전체 판정으로 확대하지 않는다.
- 계정 변경·결제·후원·moderation·심사 취소·브라우저 보안 정책 완화로 검사를 만들지 않는다.
- Chrome 확장 새로고침이나 실제 청취가 필요하면 그 단계에서 사용자에게 최소 행동만 요청한다.
- 커밋·push·PR·릴리즈·스토어 교체는 G-REL 통과와 정확한 대상 확인 전에는 수행하지 않는다.
- 신규 문서와 설명은 한국어 또는 영어로만 작성한다.

## 2. 현재 상태

- 작업 기준: HEAD `e45af19c7ba5d05bd57e2cc6d1520d8730ada6ee` 위의 dirty working tree. HEAD만으로 현재 소스나 배포본을 식별하지 않는다.
- 패키지: Chrome Manifest V3 `2.13.3`, Firefox 미지원.
- 설치 검증 산출물: 객관 오디오 수용을 마친 `audioheadroomfinal20261011a`에 라벨만 바꾼 `fitplayerlabel20261011a`를 생성해 root `dist`와 58/58 동일하게 반영했다. package v2.13.3/20개 진입 자원 검사와 전체 회귀를 통과했으며 새 라벨의 설치 화면 확인만 남았다.
- 복구 경로: 직전 root `dist`는 private `output/tool-audit/p06-pre-audio-headroom-dist-20261011a`에 보존했다.
- 자동 검증: 전체 회귀 605/605, 오디오·다중 페이지 집중 55/55, 경고 원장 32/32.
- 오디오 합성: Chrome 155에서 12개 sample-rate 정렬, 18개 전환, stress peak `0.9800000190734863`, full-scale 초과 0.
- 독립 기능 검토: 오디오 전환·헤드룸의 Astra max 최종 Critical/Important/Minor 0.
- 최신 audit: `output/tool-audit/run-2026-10-11T11-56-19-063Z-hNcJoa/summary.json`. npm 0, Gitleaks 현재/Git 0, ESLint guarded 7행, 새 경고 0, 전체 종료 1. 이를 clean scan이나 무취약성 증명으로 부르지 않는다.
- 객관 오디오 수용: Chrome 155가 소스·최종 후보·root `dist`를 각각 직접 실행했다. 네 제품 진입 파일 SHA-256이 모두 같고, 각 보고서의 품질 실패 0건과 안정 수치 비교 실패 0건을 확인했다. 절대 오차 `1e-7`, 상대 오차 `1e-6`이며 실행 시점에 민감한 원시 진단값은 개별 보고서에만 보존한다.
- 설치 통합: 실제 방송에서 컴프레서·Gain·음소거·페이지 재로딩 뒤 재생·설정 복원과 warning/error 0건을 확인했다. 사용자 청취 결과는 보조 기록이며 품질 합격 근거로 사용하지 않는다. 이후 `화면 채우기` 라벨을 `플레이어 영역 채우기`/`Fill player area`로 명확히 바꿨고 저장 키 `fit-player`와 CSS 동작은 유지했다.
- 공개 상태: Chrome 웹 스토어에는 `2.13.2 community recovery preview`가 게시되어 있고 공개 페이지의 업데이트일은 2026-10-09이다. fork `main`은 `d5f268d84fa64b6fffbdf2c309235476fc89e6e7`, 공개 릴리즈는 prerelease `v2.13.2-community.1`, 열린 PR은 0건이다. 이번 2.13.3 묶음의 커밋·push·PR·릴리즈·스토어 교체는 수행하지 않았다.
- 공개 설명 차이: 현재 스토어 설명에는 이미 해결한 컴프레서 전환 dip·full-scale 초과가 남은 문제로 기재되어 있고, Firefox를 단순 미검증으로 표현하며, 사용 안내가 과거 `codex/community-store-preview` 브랜치를 가리킨다. 2.13.3 교체 시 Chrome 전용 지원·객관 계측 결과·`main` 문서 링크로 함께 바로잡는다.

## 3. 실행 규칙

상태는 `READY`, `DOING`, `DONE-LOCAL`, `DONE-INSTALLED`, `WAITING-USER`, `WAITING-DEPENDENCY`, `BLOCKED-EXTERNAL`, `BACKLOG`를 사용한다. `DONE-LOCAL`은 설치 또는 출시 완료가 아니다.

1. 재개 시 현재 커서와 최신 증거의 소스·후보·root `dist` 해시가 바뀌지 않았는지 확인한다.
2. 승인된 기존 범위의 재현·국소 보완·회귀·사실 문서 갱신은 묶음으로 이어간다.
3. 기능 결함은 실패 검사→최소 보완→집중 회귀→관련 전체 회귀 순서로 처리한다.
4. 같은 소스와 조건으로 이미 끝난 수동 검사를 반복하지 않는다. 새 검사가 필요한 이유를 먼저 밝힌다.
5. 사용자 조작 전 원래 설정·소리·모드를 기록하고 검사 뒤 복원한다.
6. 도구 오류·접근 실패·빈 대상·취소는 PASS로 세지 않는다. 실제 종료 코드와 제외 범위를 기록한다.
7. 새 결과의 상세 명령·해시·후보명은 검증 문서나 private JSON에 기록하고, 완료된 진행 행은 아카이브에 추가한다.
8. 모든 남은 작업이 사용자 개입 또는 외부 상태를 기다리면 필요한 최소 행동과 재개할 ID를 한 번만 보고한다.

## 4. 순서·의존성·현재 커서

| ID | 작업 묶음 | 선행 조건 | 현재 상태 | 다음 행동 |
| --- | --- | --- | --- | --- |
| P01–P05 | 증거·도구 경계·HLS·패키지·기능 보완 | 각 승인 범위 | DONE-LOCAL | 상세 이력은 아카이브 참조 |
| G-SEC | 정의된 도구·HLS·패키지 로컬 게이트 | P02, P03, P04 | DONE-LOCAL | 무취약성 보증으로 확대하지 않음 |
| P06 | 같은 산출물의 최종 설치본 수용 | G-SEC, P05 | DONE-INSTALLED | 라벨 갱신 포함 설치·표시·설정 보존 확인 완료 |
| P07 | 한국어 PR·릴리즈·스토어 초안 | P01 | DONE-LOCAL | private 초안 유지 |
| G-REL | 실제 출시 허용 게이트 | G-SEC, P06, P07 | WAITING-USER | 설치 수용·읽기 전용 원격 확인 완료. 외부 변경 범위 승인 필요 |
| P08 | 한글 PR·GitHub 릴리즈·스토어 교체 | G-REL | READY | 승인된 공개 행동만 수행 |
| P09 | 실제 설치·업데이트와 배포 기준 고정 | P08 | WAITING-DEPENDENCY | 배포 커밋·버전·ZIP·스토어 상태 기록 |
| F00–F05 | 배포 후 공통 기반·후속 기능 | P09 | BACKLOG | 배포 단위별 설계 승인 |

실행 커서: **G-REL — `Do-hyeon/cheese-knife`의 현재 브랜치에서 검증 묶음만 명시적으로 커밋·push하고 `main` 대상 한글 PR을 열 범위를 승인받는다. 병합·태그·릴리즈·스토어 교체는 별도 게이트로 유지한다.**

## 5. P06 — 최종 설치본 수용

- [x] 검증 후보를 설치 대상으로 지정하고 이전 `dist`를 private 백업했다.
- [x] 후보와 root `dist`의 상대 경로·SHA-256을 58/58 대조하고 package v2.13.3/20자원 검사를 통과했다.
- [x] 사용자가 `chrome://extensions`에서 로컬 시험판을 새로고침했다.
- [x] 같은 방송에서 컴프레서 ON→OFF→ON→OFF→ON, Gain 80→100→150→200→100→80%, 음소거·복원과 페이지 재로딩에 따른 영상 교체를 확인했다.
- [x] 사용자 청취에서 전환 dip·클릭·찢어짐, Gain 200%의 거친 클리핑·반복 끊김, 음소거 복원의 지연·팝음, 재로딩 뒤 지속 무음이 없음을 보조 기록했다. 이 결과는 객관 품질 판정을 대신하지 않는다.
- [x] DOM 관찰에서 모든 단계가 재생 중·`readyState=4`였고 재로딩 뒤 새 blob URL과 재생 복구를 확인했다. 방송 탭의 새 warning/error 로그는 0건이었다.
- [x] 소스·최종 후보·root `dist`를 Chrome 155 합성 입력으로 각각 직접 실행하고, 동일한 제품 파일 해시·개별 품질 실패 0건·안정 수치 비교 실패 0건을 확인했다.
- [x] 컴프레서 ON·Gain 80%·음소거 해제·재생 상태로 복원했다.
- [x] 결과를 [최신 출시 게이트](docs/superpowers/validation/2026-10-11-recovery-release-gates.md)와 [오디오 검증](docs/superpowers/validation/2026-10-11-compressor-transition-headroom.md)에 반영했다.
- [x] 모호한 `화면 채우기`/`Fill screen` 라벨을 `플레이어 영역 채우기`/`Fill player area`로 바꾸고 `fit-player` 저장 키와 높이 CSS를 유지했다. RED→GREEN UI 11/11, 전체 회귀 종료 코드 0, 격리 후보와 root `dist` 58/58, package v2.13.3/20자원 검사를 확인했다.
- [x] 라벨 갱신 root `dist`를 Chrome에서 새로고침하고 스타일 설정의 `플레이어 영역 채우기` 표시와 기존 체크 상태 보존을 사용자가 확인했다.

완료 조건: 같은 root `dist` 산출물의 설치·재생·설정 보존이 확인되고, 출시를 막는 미해결 기능 문제가 없다. 합성 PASS를 모든 방송의 최적 음질 보증으로 확대하지 않는다.

## 6. G-REL / P08 / P09 — 공개와 배포

- [x] **G-REL:** P06 완료 후 현재 소스·후보·root `dist`가 같은 기준인지 다시 확인했다. 세 대상의 오디오 진입 파일 해시가 같고 후보와 root `dist`는 58/58 일치한다.
- [x] **G-REL:** 저장소는 `Do-hyeon/cheese-knife`, 현재 작업 브랜치는 `codex/sidebar-preview-followup`, PR 대상은 `main`임을 확인했다. 커밋·push·PR·릴리즈·스토어 교체의 실제 수행 범위는 별도 승인을 받는다.
- [x] **P08:** GitHub `main`/PR/릴리즈와 스토어 게시 버전을 2026-10-11에 조회했다. `main`은 `d5f268d84fa64b6fffbdf2c309235476fc89e6e7`, 열린 PR 0건, 공개 릴리즈는 prerelease `v2.13.2-community.1`, 스토어는 `2.13.2 community recovery preview`다.
- [ ] **P08:** 검증한 묶음만 명시적으로 stage·commit하고 승인 범위에서 push·한글 PR·릴리즈를 수행한다.
- [ ] **P08:** 원본/보류/사용자 변경을 일괄 포함하지 않는다. 새 파일이나 버전이 생기면 해당 산출물을 다시 P06 검증한다.
- [ ] **P08:** 개인정보처리방침 URL은 새 문서가 main에서 공개되고 접근 확인된 뒤에만 변경한다.
- [ ] **P08:** 심사 취소·자동 병합·스토어 제출처럼 권한이 불명확한 외부 행동은 사용자 확인 없이 수행하지 않는다.
- [ ] **P09:** 실제 다운로드·설치·업데이트 가능 상태와 설정 보존을 확인한다.
- [ ] **P09:** 배포 커밋·버전·최종 ZIP SHA-256·스토어 상태·검증 범위·되돌리기 경로를 고정한다.

## 7. 배포 후 로드맵

참조: [치지직 확장 기능 비교](thread://01a12723-af0e-7193-b311-9c6e52ff614a?hostId=local). 아래 항목은 P09 이후 각각 별도 설계·검토·설치 수용·배포 단위로 진행한다.

| ID | 후속 배포 단위 | 범위와 완료 조건 |
| --- | --- | --- |
| F00 | 공통 저장 기반 | 전역 기본값·사용자 프리셋·채널 선택·계정별 기록의 계약 분리. 기존 broker/client 재사용, 늦은 응답·이전 버전 읽기 호환 확인 |
| F01 | 오디오 보강 | EQ·선택형 노멀라이저·프리셋·채널별 저장. 현재 컴프레서·Gain·soft ceiling을 보존하고 AudioWorklet 필요성은 별도 결정 |
| F02 | 영상 필터 보강 | 노출·색온도·색조·그림자·하이라이트·프리셋·채널별 저장과 선명도 성능 보호 |
| F03 | 가려진 채팅 보강 | 클린봇·블라인드·관리자 삭제 구분, 제공되는 원문만 제한적으로 처리, 행 재사용·취소·외부 writer 확인 |
| F04 | 기본 멀티뷰 | 라이브 2~4채널, 배치·교체·메인·개별 음량/화질·채팅. 한 칸 변경이 나머지를 재로딩하지 않음 |
| F05 | 통나무파워 | 잔액·타이머·내역 조회와 계정 분리부터 구현. 자동 획득·새 권한·서버 변경은 별도 승인 |

순서: F00 → F01 → F02 → F03 → F04 → F05. 이전 배포의 재생 중단·설정 유실·잘못된 표시를 다음 기능보다 먼저 해결한다.

## 8. 검토 경계

1. HEAD, dirty source, 격리 후보, root `dist`, Chrome 실행 인스턴스와 스토어 버전을 섞지 않는다.
2. 도구 실패·제외 범위·빈 대상·권한 제한을 성공이나 무취약성 판정으로 바꾸지 않는다.
3. 늦은 설정 응답, worker 재시작, 탭·창 종료, 원래 대상 탭만 적용하는 계약을 보존한다.
4. 넓은 화면, 수동 접기, 영상 교체, 광고, SPA/BFCache와 오디오 정책 거부에서 소유권·정리를 확인한다.
5. 패키지 링크·손상 메타데이터·개발 자료 유출과 Chrome 전용 계약을 검사한다.

## 9. 검증과 증거 진입점

소스나 후보가 바뀐 경우 영향 범위에 맞게 실행한다. 문서만 변경했을 때 전체 기능 검사를 반복하지 않는다.

```powershell
node --test tests/*.test.cjs
node scripts/check-audio-quality.mjs --chrome
node scripts/tool-audit.mjs
node scripts/check-package.mjs dist
git -c core.safecrlf=false diff --check
```

- 오디오 근거: private `output/tool-audit/recovery-backlog/audio-transition-headroom-2026-10-11.json`.
- 정적 경계 원장: private `output/tool-audit/recovery-backlog/warning-ledger.json`.
- 공개용 상태 요약: [최신 출시 게이트](docs/superpowers/validation/2026-10-11-recovery-release-gates.md).
- 기능별 설치 절차: [최종 설치 체크리스트](docs/superpowers/validation/2026-10-11-final-installed-checklist.md).
- 완료 과정과 과거 후보·해시: [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md).

`output` 자료는 ignored/private이며 공개 문서·PR·ZIP에 포함하지 않는다. 새 실행은 과거 실패를 덮어쓰지 않고 새 경로에 보존한다.

## 10. 기록 정책과 사용자 개입 대기

- `PLANS.md`: 현재 상태, 미완료 체크리스트, 실행 커서와 게이트만 갱신한다.
- `docs/superpowers/archive/`: 완료된 진행 행, 과거 후보·해시·당시 판정과 대체된 기준을 보존한다.
- `docs/superpowers/validation/`: 특정 시점의 재현 가능한 검증 결과와 한계를 보존한다.
- `output/tool-audit/recovery-backlog/`: 공개하지 않는 원시 근거·원장·초안을 보존한다.

현재 필요한 사용자 행동은 G-REL 외부 변경 범위 승인이다. 승인 전까지 커밋·push·PR·릴리즈·스토어 교체를 수행하지 않는다.
