# F01 보류 Minor2 보완·검증

2026-10-15 / Asia-Seoul. **상태: 로컬 회귀 통과, Native·Astra max 검토 대기.** 기존 F01 T1–T9 기록을 덮지 않는다. push/PR/병합/배포 없음.

## 변경 범위

1. VOD·대상 미확인에서는 사이트 legacy Gain 읽기/가져오기를 비활성화하고 한글/영문 제한을 status와 aria-describedby로 연결했다. 검증된 live 채널의 읽기는 유지하고 진행 중 render에도 잠금이 풀리지 않게 했다. **VOD legacy 자동 가져오기 지원을 새로 추가한 것이 아니며, VOD Gain 직접 저장은 기존대로 가능하다.** broker/대상/문서 권한은 불변이다.
2. 첫 빈 프리셋 관리 진입은 snapshot 준비 후 생성 영역을 펼친다. 이후 사용자가 접으면 새 render/다시 진입으로 강제 재개하지 않는다. audio/video save-as는 기존 확정 snapshot·domain·이름 초안을 유지하며 펼침→패널 표시→이름 focus 순서다. 지연된 native details toggle의 재캡처 방지도 보존했다.

제품은 popup 원본/생성·UI aria와 번역만 바뀌었다. 독립 executable pin은 popup.js만 `3952430f68479824a811589d9573df2e35dd0cbae90cc49a6d2ac3e5a174d425`로 갱신했다. DSP·오디오 수치·schema·broker·새 권한·의존성·버전2.13.3·root dist와 시청 Chrome/P09는 변경하지 않았다.

## 로컬 회귀

- 첫 RED는 VOD disabled, 두 domain의 save-as focus, 첫 빈 관리 진입4건의 실제 assertion 실패다. 첫 GREEN의 실패1은 번역 key를 기대한 테스트가 실제 한글 문구와 달라서였으며 보존했다. 가시적 VOD 설명/aria 계약으로 검사한다.
- UI 집중48/48: 이름/확정값/수동접힘/초기loading/보류read·지연toggle/source변경 보존 포함.
- Native 보고서 판정15/15: 신규4관측이 false여도 받아들였던 RED를 보완해 실제 첫 펼침·name focus·채널 미확인 제한·무쓰기 근거를 요구한다.
- 전체1630중1629통과/실패0/기존private1skip(65.277초), 9기반/build/package62/22 통과. 격리 execution output의 `f01-minors-{red,green,green2,full,foundation}.log`와 `f01-minor-proof-{red,green}.log`에 보존한다.
- 실제 감사 `output/tool-audit/run-2026-10-15T13-35-54-511Z-W31jVf/summary.json`: npm/Gitleaks dir/git0, ESLint55/rawexit1. 개별 경고 분류·기존 skip은 전체 보안 인증이 아니다.

## 후속 게이트

- [ ] 새 clean checkpoint의 Native 설정 정상/정확한4손실, 실제 첫 빈 생성/이름 focus·채널 없는 pair의 제한·저장0/source·종료 확인. 실제 VOD URL의 미확인 채널 UI 계약은 unit 근거이며 Native pair 검사를 실제 VOD 스트림 검증으로 부풀리지 않는다.
- [ ] fresh gpt-6-astra/max 변경 범위 독립 검토와 필요한 보완/회귀.
- [ ] 최종 Task 완료, PLANS와 기존 보류 항목의 현재 상태·아카이브 갱신.
- [ ] **F01 전체 종료 후 한글 PR 하나**가 필요하다. 이번에는 push/PR을 하지 않으며 다음 명시 승인을 받은 뒤 F01 전체 범위 공개 CI까지 진행한다. F02를 F01 PR의 선행 의존성으로 추가하지 않는다. 병합·릴리즈는 별도 승인이고 릴리즈는 F02/통합 후다.
