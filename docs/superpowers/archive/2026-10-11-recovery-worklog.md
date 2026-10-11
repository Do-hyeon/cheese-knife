# 치즈 나이프 복구 작업 이력

2026-10-11 / Asia-Seoul. 이 문서는 복구·검증·배포 준비 과정에서 완료되었거나 당시 상태를 설명하는 기록을 보존한다. 현재 실행 순서, 승인 게이트와 사용자 개입 지점은 [PLANS.md](../../../PLANS.md)가 유일한 기준이다. 아래의 과거 후보명·검사 수·차단 상태·해시는 작성 당시 사실이며 현재 상태로 확대하지 않는다.

## 계획 작성 당시 기준

계획 작성 시 브랜치 HEAD는 `e45af19c7ba5d05bd57e2cc6d1520d8730ada6ee`, manifest/package는 `2.13.3`이었다. 미커밋 변경이 많았으므로 HEAD를 당시 전체 소스나 배포 기준으로 취급하지 않았다.

당시에는 사이드바 미리보기, 자동 음소거 해제, 다중 설정 창, Firefox 제거, 개발 의존성 갱신, 종료 처리와 패키지 검사 보완이 서로 다른 검증 단계에 있었다. 일반 회귀 413/413과 npm/Gitleaks 0이 있었지만 정적 경고 75건은 open 상태였고, Chrome 121·실제 file symlink·최종 설치본·스토어 상태도 미확인이었다. 이 기준은 아래 후속 작업으로 대체됐다.

### 당시 보류 파일 SHA-256

| 파일 | SHA-256 |
| --- | --- |
| `scripts/hls-hardening.mjs` | `08027560C0C7239E46925FC6A5AA6AA6DA22EC1CDCBF62541F1CD7DA4746F297` |
| `scripts/vendor-hls.mjs` | `855485D91B181593DA0A18E7E8F5E44964F501AEFBD4ECB106ECBFF6C71DB806` |
| `vendor/hls.light.private.js` | `C1CC9625556EA5DF10F1F0FC7755CBD11EFA83E711EA7C5AA9CAC758A25D8347` |
| `THIRD_PARTY_NOTICES.md` | `D610790C704EDD87897D0687979B3749584CAD306A3DC0817865E55C30B255C4` |

## 완료된 작업 묶음

### P01 — 최신 증거와 미검증 목록 통합

- 도구 보고서와 소스 해시, 구현·설치 대기 상태, 기능별 자동/실제/미검증 범위를 분리했다.
- HLS·도구 경고·패키지·설치본·공개의 게이트를 분리했고 [최신 출시 게이트](../validation/2026-10-11-recovery-release-gates.md)를 작성했다.
- 유료 DVR, 자연 삭제, 파티/차단 대상, 최소 Chrome 등 실제 조건 부재를 정상으로 합산하지 않았다.

### P02 — 정적 도구 경고 경계

- 기준선 75행을 실행 코드 20건과 개발 도구 55건으로 분류하고 후속 근거를 연결했다.
- 모든 기준선 행은 remediated 후속 행을 가지며 공용 소유 파일 경계 7행은 `guarded-boundary`로 남겼다. `open/new`는 0이다.
- 최종 audit는 npm/Gitleaks 0, ESLint 7, 전체 종료 1을 유지한다. 이를 clean scan이나 취약점 부재로 부르지 않는다.

### P03 — HLS 결정론적 경계 검증

- 고정 HLS.js 1.6.16 원본·license·변환 anchor와 두 번의 격리 재생성을 검증했다.
- SKIP, emsg, selected run/sample/NAL, ID3의 정상·경계·공격적 반례를 제한된 child process로 실행했다.
- Astra max 기능 검토의 Important 8건을 TDD로 보완했다. `p03finalfix20261011a`는 전용 97/97·전체 586/586을 통과했다.
- 이는 HLS 전체 취약점 부재나 모든 실제 MSE·네트워크·오디오 환경의 합격을 의미하지 않는다.

### P04 — Chrome 패키지·문서·스토어 준비

- Chrome 전용 Manifest V3 후보, 참조 자원, 라이선스와 한영 문서, HTTPS 본 사이트 권한 범위를 대조했다.
- WSL native 파일시스템에서 실제 file symlink 거부를 확인했고 Chrome for Testing 121.0.6167.184에서 worker·설정 브리지·라이브 경로·플레이어 컨트롤을 확인했다.
- 공개 스토어 2.13.2와 fork 태그 `v2.13.2-community.1`보다 로컬 후보 2.13.3이 높음을 확인했다.

### P05 — 기능 회귀와 설치 검사 준비

- 미리보기, 팔로잉, 컴프레서, 탐색, 팝업, 채팅, 스타일, 통계, 설정, 종료 처리의 자동 계약과 실제 검증 공백을 분리했다.
- [최종 설치 체크리스트](../validation/2026-10-11-final-installed-checklist.md)에 라이브/VOD, 영상 교체, 넓은 화면, SPA/BFCache, 두 탭·두 창과 설정 복원을 포함했다.
- 컴프레서 전환·헤드룸은 이후 Chromium 정수/capped pre-delay와 0.9→0.98 soft ceiling으로 보완했다. Chrome 155 합성 검사, 전체 599/599, Astra max 최종 Critical/Important/Minor 0을 통과했다.

### G-SEC — 정의된 로컬 게이트

- P02 정적 경계, P03 HLS 경계, P04 패키지·권한·문서·환경 조건을 충족했다.
- 이 상태는 문서에 정의한 범위의 `DONE-LOCAL`이며 제품 전체의 무결함이나 모든 취약점 부재를 보증하지 않는다.

### P07 — 로컬 기여·배포 초안

- 한국어 PR 초안, GitHub 릴리즈 설명, 파일·해시 진입점, 업데이트·되돌리기 안내와 스토어 설명을 private backlog에 준비했다.
- 포크 `Do-hyeon/cheese-knife`의 `main` 대상 후속 PR을 원본 PR #81과 분리했다.
- 최종 ZIP·태그·공개·대시보드 조작은 수행하지 않았다.

## 날짜별 진행 기록

| 날짜 | ID | 당시 상태 | 결과·증거 | 당시 다음 단계 |
| --- | --- | --- | --- | --- |
| 2026-10-11 | 계획 작성 | DONE-LOCAL | `PLANS.md` 생성, 최신 보고서의 현재 소스 해시 일치·75건 open 확인, 참조 채팅의 최신 로드맵 확인 | 계획 검토 후 P01 |
| 2026-10-11 | 실행 시작 / P01 | DONE-LOCAL | 최신 31 입력 해시·raw catalog 75행 일치, 기존 413 결과/log 확인, 후보 58파일 현 소스 일치, 출시 게이트 문서 작성 | P02/P04/P05/P07 |
| 2026-10-11 | P02 | BLOCKED-EXTERNAL | 경고 원장에 75 open, 20 file/rule 묶음, 실행20/dev55, source hash와 next action 보존 | 비모델 근거 필요 |
| 2026-10-11 | P04 | BLOCKED-USER | 스토어 정책 체크리스트 작성, wildcard 호스트·file symlink·Chrome121·최종 버전 미확인 | 권한 범위 결정 |
| 2026-10-11 | P05 | DONE-LOCAL | 최종 설치 체크리스트 17개 묶음 작성 | G-SEC 이후 P06 |
| 2026-10-11 | P07 | DONE-LOCAL | private 한국어 PR·릴리즈·스토어 초안 준비 | G-REL 전까지 보관 |
| 2026-10-11 | 준비 묶음 검증 | DONE-LOCAL | 문서 링크·경고 ID/hash·후보 파일 재대조, diff check 0, Gitleaks 현재/Git 각 0 | P04 설계 결정 |
| 2026-10-11 | P04 승인 묶음 준비 | WAITING-REVIEW | HTTPS 본 사이트 권한·권한 UI·CSS 실패 복구·한영 고지를 A1–A3으로 결합 | A1–A3 승인 |
| 2026-10-11 | 승인 문서 검증 | DONE-LOCAL | 링크 17개, 한글·영문, 작업 전후 166개 파일 해시와 diff check 확인 | A1–A3 검토 |
| 2026-10-11 | P04 A1–A3 구현 | DONE-LOCAL | 권한 정책·안내·CSS retry 구현, 독립 검토 반례 보완, 일반 회귀 433/433 | npm 재조회·P02/P03 |
| 2026-10-11 | P04 npm 재조회 | DONE-LOCAL | npm 0, Gitleaks 현재/Git 0, ESLint 75로 runner exit 1 | P02/P03 |
| 2026-10-11 | P02 경계 보완 설계 | APPROVED | 실행20·개발55, owned-files 경계와 원장 계약 승인 | 상세 구현 계획 |
| 2026-10-11 | P02 상세 구현 계획 | WAITING-REVIEW | Task 0–7과 RED/GREEN·후보·독립 검토 계획 작성 | 계획 승인 |
| 2026-10-11 | P02 정적 경고 경계 구현 | DONE-LOCAL | 75 remediated·7 guarded·open/new 0, 회귀 474/474, 후보 `p02final20261011b` | P03/P04 |
| 2026-10-11 | P03 결정론적 검증 사양 | WAITING-REVIEW | 고정 HLS.js·네 파서 경계·provenance·격리 verifier 사양 작성 | 서면 승인 |
| 2026-10-11 | P03 구현 계획 | WAITING-PLAN-REVIEW | Task 0–6, safe negative control, exit 0/1/2와 evidence schema 작성 | 계획 승인 |
| 2026-10-11 | P03 결정론적 검증 구현 | DONE-LOCAL | `p03final20261011a`, 전용 89/89·전체 574/574, 후보 58파일·20자원 | 독립 검토 |
| 2026-10-11 | P03 독립 검토 보완 | DONE-LOCAL | Important 8건 TDD 보완, `p03finalfix20261011a` 전용 97/97·전체 586/586 | P04 종료 |
| 2026-10-11 | 인증 성인 미리보기 | DONE-LOCAL | 인증 세션에 HTTPS HLS가 있을 때만 준비, 집중 123/123·전체 588/588 | P06 설치 확인 |
| 2026-10-11 | P04 환경·메타데이터 종료 | DONE-LOCAL | file symlink 거부, Chrome121 초기화, 후보 2.13.3 확인 | G-SEC 종료·P06 |
| 2026-10-11 | P06 후보 배치 | WAITING-USER | `adultpreview20261011a`를 root `dist`에 58/58 반영 | 확장 새로고침 |
| 2026-10-11 | P06 무효 컨텍스트 정리 | DONE-INSTALLED | 무효 컨텍스트 Chrome API 호출 0, 집중 28/28·전체 589/589, 사용자 재발 없음 확인 | 성인 미리보기·오디오 |
| 2026-10-11 | P05 오디오 합성 경계 | OPEN-DESIGN | 250/750Hz dip과 peak 1.95944·full-scale 초과 16000 재현 | 전환·headroom 설계 |
| 2026-10-11 | P05 오디오 설계 | APPROVED | dry pre-delay와 wet 0.9→0.98 soft ceiling 승인, AudioWorklet은 F01 보류 | TDD 구현 |
| 2026-10-11 | P05 오디오 구현 | WAITING-USER | 12개 sample-rate 정렬·18개 전환·stress peak 0.980000019/초과0, 집중49/49·원장32/32·전체599/599, 후보와 root 58/58 일치 | Chrome 확장 새로고침·실제 청취 |
| 2026-10-11 | 실행 문서와 이력 분리 | DONE-LOCAL | `PLANS.md`를 현재 상태·미완료 게이트 중심으로 축약하고 완료 작업·과거 후보·해시·진행표를 이 아카이브로 이동. 두 문서의 로컬 링크와 한글·영문 문자 범위를 검증 | P06 확장 새로고침 |
| 2026-10-11 | P06 최종 오디오 설치 통합 | DONE-INSTALLED | root `dist` 새로고침 뒤 컴프레서 ON/OFF 2회, Gain 80→100→150→200→100→80%, 음소거 복원과 페이지 재로딩. 재생 상태·새 blob·최종 ON/80%/음소거 해제와 warning/error 0건 확인. 사용자 청취는 보조 기록 | 객관 산출물 계측 |
| 2026-10-11 | P06 오디오 산출물 객관 계측 | DONE-LOCAL | Chrome 155가 소스·후보·root `dist`를 각각 직접 실행. 네 진입 파일 해시 동일, 세 보고서 품질 실패 0, 안정 수치 비교 실패 0, 집중 55/55·원장 32/32·전체 605/605 | G-REL 동일성·원격 상태 재확인 |
| 2026-10-11 | G-REL 읽기 전용 재확인 | WAITING-USER | 후보와 root `dist` 58/58, 오디오 진입 파일 해시 동일. fork `main` `d5f268d84fa64b6fffbdf2c309235476fc89e6e7`, 열린 PR 0, prerelease `v2.13.2-community.1`, 스토어 `2.13.2 community recovery preview`/2026-10-09 확인. 공개 설명의 해결 전 오디오·Firefox·과거 브랜치 링크 차이 식별 | 외부 변경 범위 승인 |
| 2026-10-11 | 플레이어 영역 채우기 명칭 명확화 | WAITING-USER | `화면 채우기`/`Fill screen`을 `플레이어 영역 채우기`/`Fill player area`로 변경. 저장 키·CSS 불변, RED 2건→UI 11/11, 전체 회귀 종료0, 후보/root `dist` 58/58, package 2.13.3/20자원 | 확장 새로고침·표시/체크 상태 확인 |
| 2026-10-11 | 플레이어 영역 채우기 설치 확인 | DONE-INSTALLED | 사용자가 새 `dist` 새로고침 뒤 `플레이어 영역 채우기` 표시와 기존 체크 상태 보존을 정상 확인 | G-REL 외부 범위 승인 |

## 기록 판정

작업은 사용자 지정 P/G/F ID와 조건부 게이트를 사용했고, dirty tree 전체를 일괄 stage하지 않았다. 완료 판정은 commit range가 아니라 실제 파일·해시·명령·private 증거 JSON에 결속했다. 독립 기능 검토는 해당 변경 범위의 회귀를 보강하지만 전체 dirty tree·보안·설치본 검토를 대신하지 않는다.

새 진행 이력은 이 문서에 추가하고, `PLANS.md`에는 현재 상태와 다음 행동만 반영한다. 과거 실패·차단·후보는 지우지 않으며 현재 권한이나 완료 상태로 해석하지 않는다.
