# ![로고](./icon48.png) 치즈 나이프

> 치지직™ 도구 모음

## 호환성 복구 시험판 (이 포크)

현재 브랜치 `codex/chzzk-compatibility-recovery`는 원본 v2.13.1을 기반으로 한 2.13.2 복구 시험판입니다. Chrome Web Store의 원본 배포판과 다르며, 기존 저장소와 라이선스를 유지합니다.

Vue 없이 플레이어 버튼·컴프레서·VOD 길게 눌러 2배속을 제공하고 HLS.js 미리보기, 화면 전환 수명 관리, 기능별 준비 상태를 추가했습니다. [설계](docs/superpowers/specs/2026-10-08-chzzk-compatibility-design.md), [검토](docs/superpowers/reviews/2026-10-08-chzzk-compatibility-review.md), [검증 결과와 제한](docs/superpowers/validation/2026-10-08-chzzk-compatibility.md)을 함께 확인하세요.

### 로컬 Chrome에서 시험하기

1. 이 브랜치를 체크아웃합니다. 폴더 루트의 manifest 버전이 2.13.2인지 확인합니다.
2. Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
3. 저장소 폴더(또는 빌드한 `dist`)를 선택합니다. 중복 실행을 피하려면 기존 치즈 나이프 확장은 일시적으로 꺼둡니다. 기존 설정과 확장을 삭제할 필요는 없습니다.
4. 열려 있는 치지직 탭을 새로고침합니다. 팝업의 현재 탭 상태는 기능 연결 준비를 나타내며 실제 재생/출시 검증을 대신하지 않습니다.

설치와 개발자 모드 변경은 사용자가 직접 수행합니다. 업데이트 뒤 확장 페이지에서 새로고침하고 치지직 탭도 다시 로드해야 합니다. 다른 ID로 로드한 로컬 확장은 원본 스토어 확장의 설정을 자동 공유하지 않습니다.

### 현재 제한

- 삭제된 채팅 표시와 사이드바 자동 갱신은 새 사이트 연결점이 검증되지 않아 지원 제한으로 표시합니다.
- 통계는 해상도와 측정 FPS를 제공하며, 확인되지 않은 비트레이트/지연시간은 알 수 없음으로 표시합니다.
- 컴프레서는 안전하게 연결 가능한 같은 origin의 blob 영상만 지원합니다. 오디오 자동재생 정책에 따라 버튼을 다시 눌러야 할 수 있습니다.
- HLS 미리보기는 네트워크·브라우저 코덱·권한에 영향을 받으며, 연령 제한 방송은 재생하지 않습니다.
- 실제 설치한 Chrome 및 Firefox의 전체 기능 검증은 아직 완료되지 않았습니다.

### 개발 및 검증

Node 24.x에서 `npm ci`, `npm test`, `npm run check`, `npm run build`를 실행합니다. 배포에는 node_modules·테스트·백업 파일을 포함하지 않습니다. HLS 출처/라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.

별도 프로필의 브라우저 점검은 `npx playwright install chromium` 후 `node scripts/smoke-browser.mjs`로 실행합니다. 이 검사는 통제된 음원에 실제 미디어/Web Audio API를 적용하는 검사이며, 사용자 방송의 음성 검증이나 확장 설치 검증과 구분합니다.

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
