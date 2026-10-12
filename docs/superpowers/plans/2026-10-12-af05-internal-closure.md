# AF05 내부 이행 종료 실행 계획

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. 기존 대화의 계속 진행 승인을 적용한다. 완료 기록은 AF05 validation에 보존한다.

**Goal:** 스토어 심사와 독립적으로 수기 제품 JS를 strict TypeScript 원본으로 전환하고 내부 출시 근거를 고정한다.

**Architecture:** 기존 classic-script 생성기 `scripts/settings-runtime.mjs`에 잔여 7개 entry를 추가한다. manifest와 HTML의 파일명·로드 순서, 설정 키·기본값·허용 범위·권한·데이터 처리는 유지한다. 필요한 전역 ABI는 유지하고 화면별 지역 변수는 IIFE 안에 둔다.

**Tech Stack:** 기존 TypeScript 7.0.2, esbuild 0.28.2, Node test runner, 설치형 MV3 E2E.

**Spec:** [장기 기반 설계 AF05](../specs/2026-10-11-ai-friendly-foundation-design.md#AF05--이행-종료와-공개-게이트).

## 고정 범위와 판단

- 현재 폴더·별도 브랜치 사용. 신규 의존성과 manifest 권한 변경 없음.
- 생성 JS 16개와 vendor JS는 배포 자원이므로 삭제 대상이 아니다.
- classic script 사이의 `KnifeHostPolicy`, `CONFIGS`, `DEFAULT_CONFIGS`, `normalizeConfig`, `getConfig`, `STYLES`, 설정 contract/client/broker와 MAIN Symbol 연결은 실제 호출 계약이다. 임시 호환 shim과 구분한다.
- P09 제출본 `fb15f967`의 버전은 2.13.3이며 이번 후보와 코드가 다르다. 이번 작업은 같은 버전의 새 스토어 업로드나 GitHub release를 만들지 않는다. 향후 AF 배포는 더 높은 버전·독립 승인으로 진행한다.
- private 감사 원장과 기존 배포 ZIP은 수정하지 않는다.
- 타입 단언은 DOM template·검증 완료 값에 한정해 근거를 기록한다. any/ignore/skipLibCheck는 도입하지 않는다.

## 검토 초점

- 팝업·styles가 같은 전역 변수 이름을 가져도 독립 화면 초기화가 유지되어야 한다.
- bridge의 늦은 저장 읽기·BFCache·무효 컨텍스트 정리와 오류 전달을 유지한다.
- 설정 키·기본값·range 경계·동적 CSS 등록과 원래 탭 reload를 유지한다.
- 생성 검사에서 원격 주소를 포괄 허용하지 않고 기존 host policy·SVG namespace·origin 비교만 인정한다.
- 심사 중인 구 패키지의 통과를 최신 AF 후보 배포 완료 근거로 사용하지 않는다.

## Task 1 — TypeScript 제품 원본 종료

Files: `src/settings/config.ts`, `style-schema.ts`, `background.ts`, `popup.ts`, `styles.ts`, `permission.ts`, `bridge.ts`; `scripts/settings-runtime.mjs`; `tsconfig.json`; `.gitattributes`; 생성 JS 7개; 기존 generation/type/inventory tests.

- [x] generator entry 10개, strict TS-only include, 모든 16개 제품 JS의 생성 원본 커버리지 테스트를 먼저 추가하고 RED 확인.
- [x] 공용 스키마·화면·bridge 원본 이전. 기존 generator의 결정성·write-in-CI 거부·classic validation을 유지.
- [x] 타입 오류를 명시적 입력 타입과 기존 값 검증으로 해결. 기존 입력과 오류 경계를 유지.
- [x] 생성 JS 갱신·정규화 실행 해시 차이 검토·기존 fixture를 새 기준으로 고정.
- [x] focused generation/type/설정/bridge/permission 92/92, package 37/37 GREEN, strict와 생성 drift 확인.

## Task 2 — 내부 수용·정합성 고정

Files: AF05 validation, PLANS.md, 필요한 README 개발 설명.

- [x] 예외 원장: any/ignore 0, 남은 DOM/검증 경계 단언과 필요한 전역 연결의 이유·대체 조건 기록.
- [x] 두 번 생성·빌드의 파일 목록과 해시 동일성을 기존 도구로 확인.
- [x] 기존 package·CSP·권한·Chrome 전용·라이선스·방침/설명 계약을 대조. 정책 최신 문서는 공식 원문 확인.
- [x] 전체 회귀800/800·객관 오디오·pixels17/17·격리 설치형 positive/negative E2E와 도구 audit 실행. 기존 guarded 7행을 clean으로 표기하지 않음.
- [x] 현재 후보와 공개/심사 패키지의 commit·version을 분리하고 롤백 경로 준비. 실제 스토어 설치 수용은 미완료로 유지.
- [ ] fresh whole-branch review, 한글 PR·공개 CI·승인된 병합. P09·AF05 최종 완료와 F00–F05 동결 해제는 체크하지 않음.
