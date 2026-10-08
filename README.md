# ![로고](./icon48.png) 치즈 나이프

> 치지직™ 도구 모음

## 호환성 복구 시험판 (이 포크)

현재 브랜치 `codex/chzzk-compatibility-recovery`는 원본 v2.13.1을 기반으로 한 2.13.2 복구 시험판입니다. Chrome Web Store의 원본 배포판과 다르며, 기존 저장소와 라이선스를 유지합니다.

Vue 없이 플레이어 버튼·컴프레서·VOD 길게 눌러 2배속을 제공하고 HLS.js 미리보기, 화면 전환 수명 관리, 기능별 준비 상태를 추가했습니다. [설계](docs/superpowers/specs/2026-10-08-chzzk-compatibility-design.md), [검토](docs/superpowers/reviews/2026-10-08-chzzk-compatibility-review.md), [검증 결과와 제한](docs/superpowers/validation/2026-10-08-chzzk-compatibility.md)을 함께 확인하세요.

자동 테스트 98개와 별도 브라우저의 실제 오디오·공개 방송 미리보기 검증을 통과했습니다. [독립 구현 검토](docs/superpowers/reviews/2026-10-08-implementation-review.md), [실제 Chrome VOD 길게 누르기 수정 검토](docs/superpowers/reviews/2026-10-08-vod-hold-review.md), [전체 브랜치 독립 검토와 보완](docs/superpowers/reviews/2026-10-08-whole-branch-review.md)도 공개합니다. 설치된 Chrome에서 일부 기능을 검증했으나 전체 기능 검증과 출시 승인은 아직 완료되지 않았습니다.

Gain 바를 48px·끝 여백 8px로 조정해 실제 라이브에서 확인했습니다. [합성 신호 음질 검사](docs/superpowers/validation/2026-10-08-audio-quality-and-gain-spacing.md)는 기본 설정의 출력과 전환 시 개선 후보를 기록하며, 실제 음성·음악의 음질 보장은 아닙니다. 오디오 처리 방식은 이번 검사에서 변경하지 않았습니다.

[후속 Gain 평활화·미리보기 지연 수정](docs/superpowers/validation/2026-10-08-gain-smoothing-follow-up.md)은 Gain을 10ms 동안 이어지게 처리하고 API 대기와 hover 지연이 중복되지 않도록 합니다. 사용자가 미리보기 정상 동작을 확인했습니다. [전체 기능 점검](docs/superpowers/validation/2026-10-08-full-feature-audit.md) 이후 왼쪽 채팅의 라이브 화면 축소를 수정하고 실제 라이브·VOD 배치와 너비 조절을 확인했습니다. 최신 검토 보완본은 설정 경쟁·미리보기 취소·팝업 드래그·기능 상태 갱신을 수정했으며 설치본 검사를 위한 확장 새로고침이 필요합니다. [전체 기능 계획](docs/superpowers/plans/2026-10-08-full-feature-acceptance.md)의 미완료 항목이 남아 기여 PR은 열지 않았습니다.

### 로컬 Chrome에서 시험하기

1. 이 브랜치를 체크아웃합니다. 폴더 루트의 manifest 버전이 2.13.2인지 확인합니다.
2. Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
3. 저장소 폴더(또는 빌드한 `dist`)를 선택합니다. 중복 실행을 피하려면 기존 치즈 나이프 확장은 일시적으로 꺼둡니다. 기존 설정과 확장을 삭제할 필요는 없습니다.
4. 열려 있는 치지직 탭을 새로고침합니다. 팝업의 현재 탭 상태는 기능 연결 준비를 나타내며 실제 재생/출시 검증을 대신하지 않습니다.

설치와 개발자 모드 변경은 사용자가 직접 수행합니다. 업데이트 뒤 확장 페이지에서 새로고침하고 치지직 탭도 다시 로드해야 합니다. 다른 ID로 로드한 로컬 확장은 원본 스토어 확장의 설정을 자동 공유하지 않습니다.

### 현재 제한

- 삭제된 채팅 표시는 여전히 지원 제한입니다. 사이드바 자동 갱신·팔로잉 펼침은 현재 기본 사이트 버튼으로 보완한 후보이며 설치본 검사가 남아 있습니다.
- 통계는 해상도와 측정 FPS를 제공하며, 확인되지 않은 비트레이트/지연시간은 알 수 없음으로 표시합니다.
- 컴프레서는 안전하게 연결 가능한 같은 origin의 blob 영상만 지원합니다. 오디오 자동재생 정책에 따라 버튼을 다시 눌러야 할 수 있습니다.
- HLS 미리보기는 네트워크·브라우저 코덱·권한에 영향을 받으며, 연령 제한 방송은 재생하지 않습니다.
- 실제 설치한 Chrome 및 Firefox의 전체 기능 검증은 아직 완료되지 않았습니다.

### 개발 및 검증

Node 24.x에서 `npm ci`, `npm test`, `npm run check`, `npm run build`를 실행합니다. 배포에는 node_modules·테스트·백업 파일을 포함하지 않습니다. HLS 출처/라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.

별도 프로필의 브라우저 점검은 `npx playwright install chromium` 후 `node scripts/smoke-browser.mjs`로 실행합니다. 이 검사는 통제된 음원에 실제 미디어/Web Audio API를 적용하는 검사이며, 사용자 방송의 음성 검증이나 확장 설치 검증과 구분합니다.

시스템 Chrome의 공개 미리보기 검사는 `node scripts/smoke-browser.mjs --public --chrome`, HLS.js 대체 경로 검사는 여기에 `--hls-js`를 추가합니다. 로그인·연령 제한은 우회하지 않습니다.

합성 신호의 컴프레서 출력 측정은 `node scripts/check-audio-quality.mjs --chrome`으로 실행합니다. 별도 프로필에서 스피커로 0을 출력하는 캡처 경로를 사용하며 방송 음성을 녹음하지 않습니다. 결과는 ignored `output/audio-quality/report.json`에 저장합니다.

현재 DOM용 스타일의 실제 렌더링 검사는 `node scripts/check-styles.mjs --chrome`으로 실행합니다. [설치본 미리보기 시간 측정·스타일 점검](docs/superpowers/validation/2026-10-08-preview-timing-and-style-audit.md)에 1초 설정과 임시 0.1초 비교, 네 가지 스타일 수정 후보 및 아직 남은 검증을 기록했습니다. 브라우저 검사는 일반 `npm test`와 별도입니다.

[후속 툴바 배치 검증](docs/superpowers/validation/2026-10-08-installed-follow-up-and-toolbar-design.md)에서는 native CSS 33개 사례와 실제 7개 폭·사이드바 조합을 확인했습니다. ‘사이드바 메뉴 툴바에 표시’는 1800px 이상에서 검색창과 분리해 배치하고 그보다 좁으면 기본 사이드바를 유지합니다. 자동 숨김은 현재 sticky 헤더와 키보드 포커스를 보완했습니다. 새 dist의 설치본에서도 두 옵션 적용·포커스 복원·5개 화면 폭을 확인했으며 전체 스타일 수용은 아직 미완료입니다.

합성 영상의 밝기·대비·감마·채도·샤프닝 필터 검사는 `node scripts/check-video-filters.mjs --chrome`으로 실행합니다. 실제 필터가 적용된 영상의 픽셀·초기화 등 11개 사례를 확인하며, 사용자 GPU나 샤프닝의 경계 화질을 보장하지 않습니다. [전체 브랜치 검토](docs/superpowers/reviews/2026-10-08-whole-branch-review.md)에 결과와 남은 검증을 기록했습니다.

[Website](https://www.chz.app/) | [Discord](https://discord.gg/9kq3UNKAkz) | [Chrome Web Store (Chromium, Edge, Whale 호환)](https://chromewebstore.google.com/detail/nfkfgkkhgglkgnlppncolmpekidapkjh) | [Firefox Add-ons](https://addons.mozilla.org/addon/cheese-knife/) | [English](./README-en.md)

![스크린샷](./images/ko.png)

## 기능

### 탐색

- **방송 미리보기:** 마우스를 올리면 방송을 미리 볼 수 있습니다.
- **사이드바 갱신:** 30초마다 사이드바를 새로고침 합니다.
- **팝업 플레이어:** 여러 방송을 한 창에서 볼 수 있습니다.

### 플레이어

- **통계 메뉴:** 오른쪽 클릭 메뉴에서 통계를 선택하면 해상도, 비트레이트, FPS, 지연시간, 코덱을 확인할 수 있습니다.
- **방향키 탐색:** 방향키를 이용하여 짧은 시간을 되돌려 볼 수 있습니다.
- **영상 필터:** 영상 밝기, 대비, 감마를 조정할 수 있으며, 선명(샤픈) 필터를 적용할 수 있습니다.
- **오디오 컴프레서:** 큰 소리를 줄여 다이내믹 레인지를 조절하여 소리를 듣기 편안하게 만듭니다.

### 채팅

- **후원 채팅 숨기기:** 채팅창에서 치즈 후원을 숨깁니다.
- **채팅창, 폰트 크기 조절:** 채팅창의 크기와 폰트 크기를 조절할 수 있습니다.

이외에도 여러 유용한 기능을 추가하며 다양한 스타일을 설정할 수 있습니다.

## TODO

- [ ] E2E tests
- [ ] TypeScript
- [ ] React/Vue
- [ ] Modularize
- [ ] Webpack/Vite

> 본 확장 프로그램은 치지직™과 관련이 없으며, 치지직™, CHZZK™은 NAVER㈜의 등록상표입니다. 본 확장 프로그램을 사용하여 발생하는 결과에 대한 모든 책임은 사용자에게 있습니다.
