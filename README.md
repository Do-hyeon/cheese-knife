# ![로고](./icon48.png) 치즈 나이프 — 커뮤니티 복구판

치지직 시청을 돕는 [치즈 나이프](https://github.com/jebibot/cheese-knife)의 비공식 커뮤니티 복구판입니다. 현행 치지직 UI와 맞지 않던 연결점을 복구하고 Chrome 전용으로 유지합니다. 원작자가 승인한 공식 후속판이 아니며, 원작자가 복귀하면 Chrome 웹 스토어 배포를 중단할 예정입니다.

[Chrome 웹 스토어](https://chromewebstore.google.com/detail/cgfddiiffponlciljlfbiecmlagflbpe) · [GitHub 릴리즈](https://github.com/Do-hyeon/cheese-knife/releases) · [문제 신고](https://github.com/Do-hyeon/cheese-knife/issues) · [개인정보처리방침](PRIVACY.md) · [English](README-en.md)

![스크린샷](./images/ko.png)

## 주요 기능

- 사이드바 방송 미리보기, 주기적 갱신과 팔로잉 목록 자동 펼침
- 여러 방송을 띄울 수 있는 팝업 플레이어
- VOD 방향키 탐색과 길게 눌러 2배속
- 해상도·FPS·코덱 등 확인 가능한 재생 정보 표시
- 밝기·대비·채도·감마·선명도 영상 필터
- 오디오 컴프레서와 Gain 조절
- 후원 채팅 숨김, 채팅 시각·너비·글꼴·왼쪽 배치
- 추천 방송·랭킹·미션/파티 등 화면 요소를 정리하는 스타일 설정

확장 아이콘을 눌러 기능을 켜고 끌 수 있습니다. 스타일 설정은 적용할 치지직 탭에서 열어 사용하세요.

### 로컬 개발판: 채널 설정·오디오 보정 (F00·F01)

아직 스토어에 공개하지 않은 기능입니다. 별도 설정 탭에서 오디오·영상 필터만 전역/채널별로 저장하며, 나머지는 전역입니다. 오디오는 Gain·컴프레서·8대역 EQ·기본 OFF의 느린 RMS 자동 음량 보정을 제공합니다. 현재 영상의 전체 보정 ON/OFF와 새 영상의 자동 켜기 설정은 별개이고, 플레이어 Gain 조작은 표시된 저장 출처에 자동 저장됩니다.

프리셋은 적용값을 복사하되 Gain 상속 옵션은 대상의 출처를 유지합니다. 채널·도메인·프리셋은 설정 탭에서 삭제할 수 있으며 유지관리자에게 전송하지 않습니다. 기존 설정은 명시적으로 전환하고, 사이트의 기존 Gain은 확인·가져오기 전까지 호환 출처로 구분합니다. 저장 결과가 불명이면 재조회하고, 구·신 코드가 섞인 페이지는 새로고침하세요. 대상 방송이 바뀌면 설정 탭을 다시 열어 확인하세요.

오디오와 분석용 임시 버퍼는 브라우저 안에서만 처리하고 녹음·RMS 내역을 저장하지 않습니다. 보정 경로는 스테레오로 다운믹스하며 RMS 목표는 LUFS/정밀 음량계가 아닙니다. 그래프는 설정 참고 곡선이고 실제 출력 계측이 아닙니다. 소리 출력에는 브라우저 정책상 사용자 조작이 필요할 수 있습니다. 확인 불가 VOD는 전역, iframe·미리보기는 기존 전역 범위이며 시크릿의 새 채널/프리셋 저장은 제한됩니다. 저장·삭제의 자세한 범위는 [개인정보처리방침](PRIVACY.md)을 확인하세요.

## 설치

일반 사용자는 [Chrome 웹 스토어](https://chromewebstore.google.com/detail/cgfddiiffponlciljlfbiecmlagflbpe)에서 설치할 수 있습니다. GitHub 릴리즈와 스토어 게시 버전은 심사 시점에 따라 다를 수 있습니다.

로컬 변경을 시험하려면 Node.js 24.15.0 이상의 Node 24 계열에서 다음 명령을 실행합니다.

```powershell
npm ci --ignore-scripts
npm test
npm run build
npm run check
```

실제 설치 산출물의 설정·다중 창·수명주기 흐름을 선택적으로 검사하려면 bundled Chromium에서 다음 게이트를 실행합니다. 외부 치지직 요청은 닫힌 fixture로 대체되며 임시 프로필은 검사 뒤 제거됩니다.

```powershell
npm run test:e2e
npm run test:e2e:negative
```

Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 빌드된 `dist` 폴더를 압축해제된 확장 프로그램으로 불러온 뒤 치지직 탭을 새로고침합니다. 중복 동작을 피하려면 원본 확장과 복구판을 동시에 켜지 마세요. 서로 다른 확장 ID 사이에서 설정이 자동 이전되거나 공유된다고 가정하지 않습니다.

## 알려진 제한

- 지원 브라우저는 Google Chrome 121 이상입니다. 복구판은 Firefox 빌드·서명·배포를 지원하지 않습니다.
- 라이브 방향키 탐색은 방송과 계정에 타임머신(DVR) 사용 권한이 있을 때만 동작합니다.
- 연령 제한·인증·시청 권한·DRM을 우회하지 않습니다. 미리보기 API가 재생 가능한 HLS 주소를 제공하지 않으면 썸네일 또는 제한 상태를 유지합니다.
- 삭제된 채팅 표시는 연결 가능한 라이브의 새 일반 메시지에 한정됩니다. 과거 숨김, 클린봇, VOD 삭제 내역을 복구하지 않습니다.
- 오디오·미리보기·영상 필터는 브라우저 자동재생 정책, 미디어 형식, GPU와 네트워크 상태에 영향을 받습니다.
- 모든 방송·광고·화면 모드·설정 조합의 정상 동작을 보장하지 않습니다. 확인된 문제는 [Issues](https://github.com/Do-hyeon/cheese-knife/issues)에 알려주세요.

## 개인정보와 보안

확장은 기능 제공을 위해 브라우저 안에서 설정과 치지직 페이지·API·미디어 데이터를 처리할 수 있습니다. 유지관리자 서버로 사용자 데이터를 전송하지 않지만, 로컬 처리도 사용자 데이터 처리에 포함됩니다. 저장 위치, 외부 연결, 보관과 삭제 방법은 [개인정보처리방침](PRIVACY.md)을 확인하세요.

보안 점검 결과는 특정 도구와 검사 범위에 한정되며 제품 전체의 무취약성을 의미하지 않습니다.

## 개발 방향

제품 런타임의 원본은 strict TypeScript로 관리하고 Chrome용 JavaScript를 검증·생성합니다. 차기 공개는 저장 기반(F00)·오디오(F01)·F02와 통합 검증을 마친 뒤 별도로 준비합니다.

[실행 계획](PLANS.md) · [AF00 검증 기록](docs/superpowers/validation/2026-10-11-af00-installed-extension-e2e.md) · [제3자 고지](THIRD_PARTY_NOTICES.md)

변경을 제안하려면 [Issues](https://github.com/Do-hyeon/cheese-knife/issues)에 범위와 재현 절차를 먼저 공유해 주세요.

## 원본과 라이선스

이 저장소는 [jebibot/cheese-knife](https://github.com/jebibot/cheese-knife)를 기반으로 하며 원본 저작권과 MIT 라이선스를 유지합니다. 포함된 HLS.js와 기타 제3자 구성 요소는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)의 고지를 따릅니다.

본 확장 프로그램은 치지직™과 관련이 없습니다. 치지직™과 CHZZK™은 NAVER㈜의 등록상표입니다. 이 소프트웨어는 별도 보증 없이 제공됩니다.
