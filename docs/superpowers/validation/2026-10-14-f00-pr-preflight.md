# F00 전체 PR 사전검증

## 승인과 범위

2026-10-14 사용자가 최신 F01 목업을 승인하고 **F00 전체 한글 PR·공개 CI 확인·병합·해당 브랜치 정리**를 지시했다. F01 문서·목업은 복구 가능한 로컬 임시 저장으로 분리하며 이번 PR에 포함하지 않는다. 차기 릴리즈는 F00·F01·F02 및 최종 통합 게이트 완료 후다. 제품 버전2.13.3·스토어·시청용 Chrome/P09·root dist는 변경하지 않는다.

## 현재 입력 재검증

- 코드 검토 입력08bd528 이후 6ad000e까지는 문서 변경뿐이다. 격리 후보를 6ad000e412aa2519e45539ad8a3c6a4da18405bf로 갱신한 뒤 재검증했다. 공개 준비의 PLANS.md와 이 기록은 동작 변경을 포함하지 않는다.
- 기존 격리 후보: `output/f00-execution-20261014/final-astra-status`. 새 프로필 설치나 사용자 Chrome 조작 없이 로컬 도구만 실행했다.
- 전체 단위검사: **1403 total / 1402 pass / 0 fail / 1 skip**, 70.968초, exit0. 제외1은 공개 checkout에 의도적으로 없는 private P02 원장 검사이며, 원장을 숨기거나 검사 규칙을 변경하지 않았다.
- 기존9foundation 모두 exit0. 생성 settings11/main6·runtime inventory17·build proof4 계약 통과.
- 격리 빌드와 패키지 검사 exit0: 제품2.13.3·21 entry resources. 기존 root dist를 대체하지 않았다.
- 도구 감사: npm0·Gitleaks dir0/git0, ESLint8, 입력 전후 해시 일치. **raw exit1이며 clean 감사가 아니다.** 8개 경고는 기존 `scripts/owned-files.mjs` 동적 파일 경계이고 해당 파일은 main 대비 변경 없음.
- 비공개 원본: 후보의 `output/f00-pr-unit-tests.log`, `output/tool-audit/run-2026-10-14T13-57-50-053Z-tDawZI/summary.json`. 비공개 결과 파일은 PR에 넣지 않는다.

## 해결됐다고 간주하지 않는 항목

루트의 private P02 원장은 F00 변경 이전 입력의 해시를 가리키므로, 최근 루트 전체검사에서 background.js 해시 불일치1건이 있었다. 이력 원장이나 해시를 수정해 통과 처리하지 않았다. 새 후보의 실제 도구 감사를 별도로 실행했으며, **과거 원장의 최신 입력 재대조/갱신은 후속 통합 게이트에 남는다.**

실제 TAB·오디오·픽셀·설치/전환/저장 손실 대조 및 독립 Astra max 검토는 [F00 최종 기록](2026-10-14-f00-final-review.md)의 실행 당시 증거다. 이번 문서 변경의 재실행 결과와 혼동하지 않는다. 실제 BFCache·자연 worker 중단·스토어 업데이트/플랫폼 롤백의 미검증도 유지한다.

공개 CI 통과 여부·PR 병합 여부는 GitHub의 해당 PR/checks가 증거다. PR 생성만으로 통과나 병합을 선언하지 않으며, 실패 시 병합하지 않는다. 릴리즈·스토어 제출은 실행하지 않는다.
