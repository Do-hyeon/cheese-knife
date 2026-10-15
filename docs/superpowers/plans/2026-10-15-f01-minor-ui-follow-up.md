# F01 보류 UI 두 건 보완 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 기존 브랜치와 격리 물리 후보를 유지하고 아래 한 Task를 직접 수행한다.

**Goal:** 보류된 VOD legacy 읽기 안내와 프리셋 생성 진입 UX를 보완한다.
**Architecture:** 기존 popup UI와 render, native details/focus를 재사용한다. legacy 읽기 대상·broker·권한은 확장하지 않고 검증된 채널이 없으면 비활성화/이유를 표시한다.
**Tech Stack:** 기존 strict TypeScript/생성 JS/jsdom/Playwright만 사용한다.
**Spec:** [F01 승인 명세](../specs/2026-10-14-f01-audio-processing-design.md), [최종 검토의 Minor2](../validation/2026-10-15-f01-final-review.md).

## Global Constraints

- 사용자 지시로 구현·회귀·Astra max 검토까지 승인됐다. 추가 설계 승인 질문으로 같은 범위를 다시 중지하지 않는다.
- 버전2.13.3·DSP/수치·schema/broker/권한·root dist·사용자 Chrome/P09·실패 기록을 보존한다. 설치/새 의존성·권한 확대는 별도 STOP이다.
- push/PR/병합/배포 금지. F01 전체 종료 뒤 한글 PR 하나가 필요하다는 후속 단계를 PLANS에 남기며 실제 실행은 다음 명시 승인을 받는다.

## Review Focus

- VOD/targetless/검증 실패 시 무동작 버튼 대신 비활성화·이유, 읽기/쓰기0.
- 이미 채널이 확인된 live의 정상 읽기와 진행 중 render에서의 잠금 보존.
- 첫 빈 관리 진입만 자동 펼침, 이후 수동 접힘·입력 이름 보존.
- audio/video save-as의 domain·확정 snapshot·이름 초안 유지와 직접 name focus.
- details toggle 지연·scope/외부 설정 변경이 새 확정값을 몰래 재캡처하지 않음.

## Task 1: 두 UI 계약 보완·전체 회귀·최종 검토

**Files:** src/settings/popup.ts, popup.html, _locales/{ko,en}/messages.json, popup.js, tests/fixtures/f01-runtime-executable.json, tests/f01-preset-ui.test.cjs, tests/media-settings-tab.test.cjs, scripts/check-installed-audio-settings.mjs, PLANS/검증 기록.
**Interfaces:** 기존 currentScope/legacy, showPanel(name, focus), prepareCreation(domain), renderMedia(), native settings scenario를 소비한다. public API/저장 ABI는 추가하지 않는다.

- [x] 기존 generated UI에서 VOD disabled와 save-as focus/첫 빈 관리 진입/기존 목록 보존을 RED로 확인한다. unit fixture 이외의 trusted 입력 증거로 주장하지 않는다.
- [ ] render에서 legacy 읽기 잠금을 관리하고 채널 미확인 이유를 한글/영문으로 표시한다. pending read도 같은 잠금을 유지한다.
- [ ] 첫 빈 관리 화면 진입만 펼치고 save-as는 원래 snapshot을 준비한 뒤 펼침→관리 패널 표시→이름 focus 순서로 처리한다. 기존 지연 toggle 회귀는 유지한다.
- [ ] 집중 회귀 GREEN→생성·popup executable pin만 갱신→전체node:test/9기반/build/package/실제 감사. 검사·빌드는 기존 execution 물리 후보에서만 한다.
- [ ] clean 로컬 checkpoint의 Native 설정 정상/손실과 실제 빈 생성/포커스/채널 미확인 잠금을 확인한다. 첫 실패에서 멈추고 진단하며 실패를 보존한다.
- [ ] fresh gpt-6-astra/max 독립 변경 검토, 지적 사항 판정/필수 보완·회귀 및 Task 완료. 원래 F01 전체 검토를 대체하거나 중복 실행하지 않는다.
- [ ] PLANS Minor 두 건을 실제 보완/검증 범위로 마감하고 F01 전체 PR 후속 필요·현재 push/PR 금지를 명시한다.

실행 명령: `node --test tests/f01-preset-ui.test.cjs tests/media-settings-tab.test.cjs`, `node --test tests/*.test.cjs`, 기존9foundation와`build`/`check`, `node scripts/tool-audit.mjs`, Native `node scripts/check-installed-audio-settings.mjs --run-id=F01Minor20261015A`와 별도 `--control=storage-loss` 실행. 입력/해시/전후/종료를 직접 확인한다.
