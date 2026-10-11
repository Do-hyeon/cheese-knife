# AF00 설치형 MV3 E2E 검증 기록

- 검증일: 2026-10-12 / Asia-Seoul
- 검증 대상: `c330155cbba6c23dda5fbdee7fbb59680087bff7` (`codex/ai-foundation-design`)
- 환경: Windows, Node 24.19.0, Playwright 1.62.1, bundled Chromium 151.0.7922.34

## 결론

AF00의 로컬 수용 조건을 충족했다. 격리된 Chrome MV3 후보를 fresh persistent profile에 설치해 설정 전달, 손상 저장소 복구, 두 창 병합, 원래 스타일 대상만 reload, 페이지별 미디어 격리, 합성 persisted 수명주기와 context invalidation 뒤 fresh startup을 검사했다. MAIN world 런타임을 제거한 음성 대조는 `main-runtime-missing`으로만 실패했다.

확장 제품 코드, manifest 권한과 사용자 데이터 계약은 넓히지 않았다. CI는 pull request와 `main` push에서 같은 공개 게이트를 실행하도록 추가했다. GitHub-hosted 실행 결과는 PR에서 별도로 확인한다.

## 자동 검증

| 게이트 | 결과 |
| --- | --- |
| 전체 Node 테스트 | 629 passed, 0 failed, 0 skipped |
| 빌드·패키지 검사 | `dist` 빌드, v2.13.3, manifest 참조 20개 통과 |
| 객관 오디오 검사 | Chromium 151, full-scale 초과 0, 극단 설정 peak 0.980000019, 250/750Hz 전환 기준선 일치 |
| positive 설치 E2E | `Task8ReviewFix`, 62,487ms, 모든 보고 section passed |
| negative 설치 E2E | `Task8FinalNegative`, 예상 오류 `main-runtime-missing`만 관측 |
| 도구 감사 | npm 0, Gitleaks 현재/Git 0, ESLint guarded-boundary 7, open/new 0, 입력 전후 해시 일치 |
| whitespace | `git -c core.safecrlf=false diff --check` 통과 |

도구 감사의 종료 상태 1은 동적 파일명을 사용하는 공용 `owned-files` capability의 7개 시스템 호출을 숨기지 않기 위한 것이다. 각 호출 앞의 containment·link·type 검증과 변형 테스트가 유지되며, 이는 clean scan이나 제품 전체 무취약성 판정이 아니다. 비공개 원장과 raw report는 `output/tool-audit/` 아래에만 두고 커밋하지 않는다.

## 설치 시나리오 경계

- 허용한 HTTP(S) fixture는 `https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, `https://chzzk.naver.com/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`, `https://chzzk.naver.com/__knife_fixture__/site.js`뿐이다. 그 밖의 요청은 차단한다.
- 실제 치지직 계정, 쿠키, 채팅, 결제, 후원, 연령 제한 콘텐츠와 운영 API 응답은 사용하지 않았다.
- 설정 revision, 잘못된 message 거부, 오래된 MAIN envelope 거부, 손상 revision의 repair-required 상태를 검사했다.
- 서로 다른 창의 서로 다른 설정 변경이 병합되고 두 UI에 동기화되며, 스타일 적용은 캡처한 원래 탭만 reload함을 검사했다.
- 한 창 종료가 다른 창의 미디어·설정·runtime을 변경하지 않음을 검사했다.
- 임시 브라우저 프로필과 후보 패키지는 성공·실패 뒤 제거됨을 확인했다. trace·screenshot·저장소·쿠키 원문은 공개 artifact에 포함하지 않는다.

## 알려진 자동화 제한

- Playwright 디버그 세션에서는 35초 뒤에도 service worker 자연 idle suspension이 관측되지 않았다. worker wake 뒤 설정 보존은 통과했지만 자연 종료 자체를 증명하지 않는다.
- bundled headless Chromium에서 `chrome.runtime.reload()` 뒤 unpacked worker가 in-place로 다시 나타나지 않아, 같은 profile의 fresh context startup으로 context invalidation 안전성과 설정 복구를 검사했다.
- BFCache는 실제 back/forward 복원이 아니라 `pagehide/pageshow persisted=true` 합성 수명주기와 이후 route pulse로 timer·중복 설치 경계를 검사했다.
- 실제 사이트, 실제 계정, Chrome 웹 스토어 업데이트와 장시간 브라우저 사용은 P09 및 별도 smoke 범위다.

## 패키지 경계

- source와 `dist` manifest의 권한은 모두 `scripting`, `storage`, host permission은 `https://chzzk.naver.com/*`로 동일하다.
- source/dist manifest SHA-256은 모두 `afc29067403d4ef7f05a266141459c7a70fc84e86024d72aa009e30e64f0e04d`다.
- `dist`는 58개 일반 파일이며 fixture, profile, trace, test, source map을 포함하지 않는다.
- `check-package.mjs dist`가 통과했다.

## 재현 명령

```powershell
npm ci --ignore-scripts
npm test
npm run build
npm run check
node scripts/check-audio-quality.mjs
npm run test:e2e
npm run test:e2e:negative
node scripts/tool-audit.mjs
git -c core.safecrlf=false diff --check
```

감사 명령은 위에서 설명한 guarded-boundary 때문에 종료 1을 유지한다. 기능·패키지·E2E 게이트의 성공과 섞어 clean으로 해석하지 않는다.

AF00 전체를 되돌려야 하면 AF01 작업 전의 새 복구 브랜치에서 `git revert --no-commit ca4259b..codex/ai-foundation-design`으로 AF00의 설계·코드·CI·상태 문서를 함께 되돌리고, 위 게이트를 다시 실행한다. 기존 공개 버전·스토어 항목은 이 브랜치 작업만으로 변경되지 않는다.
