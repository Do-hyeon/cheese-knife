# 개인정보처리방침 / Privacy Policy

- 적용 대상: **치즈 나이프 — 커뮤니티 복구판 (Cheese Knife — Community Recovery), 2.13.2**
- 시행일 및 최종 수정일: **2026-10-08**
- 관리 주체: GitHub 계정 **Do-hyeon**이 관리하는 [커뮤니티 포크](https://github.com/Do-hyeon/cheese-knife/tree/codex/community-store-preview)

이 방침은 비공식 커뮤니티 복구판에 적용됩니다. 원작자의 배포판이나 네이버·치지직의 개인정보처리방침을 대신하지 않습니다.

## 1. 목적과 처리 범위

확장 프로그램의 목적은 치지직(CHZZK) 방송 및 VOD의 시청 경험 개선입니다. 미리보기, 플레이어 조작, 오디오 조절, 채팅 표시 및 화면 구성 설정에 필요한 정보를 사용자의 브라우저 안에서 처리합니다. 로컬 처리도 데이터 처리에 포함되므로 아래에 공개합니다.

| 데이터 | 처리 내용과 목적 |
|---|---|
| 사용자 식별 정보 | 삭제된 채팅 표시 기능이 켜져 있고 지원되는 경우, 치지직 페이지가 이미 보유한 메시지 작성자의 사용자 식별자를 대조합니다. 실제 이름이나 이메일을 별도로 입력받지 않습니다. |
| 채팅 메시지 | 후원 메시지 숨김, 시각 표시 및 지원되는 삭제 메시지 표시를 위해 현재 페이지의 메시지 내용·종류·시각·상태를 처리합니다. 과거 채팅을 서버에서 조회하는 기능은 없습니다. |
| 치지직 페이지 및 방송 주소 | 현재 페이지의 경로, 방송·VOD 식별자 및 마우스를 올린 방송 링크를 사용해 기능을 연결하고 미리보기 정보를 요청합니다. 다른 사이트의 전체 방문기록을 수집하거나 방문 이력을 별도 보관하지 않습니다. |
| 조작 이벤트 | 미리보기, 방향키 탐색, 길게 눌러 빨리 감기, 팝업 이동 및 채팅 크기 조절에 필요한 마우스 위치·버튼·관련 키 입력을 일시 처리합니다. 행동 분석 로그나 입력 내용의 기록을 만들지 않습니다. |
| 웹사이트 콘텐츠와 재생 상태 | 페이지 요소, 방송 정보, 이미지·영상·음성, 재생 위치·속도 및 기능 연결 상태를 표시·재생·화면 및 오디오 조절에 사용합니다. 음성·영상 녹화 또는 개발자에게 업로드하는 기능은 없습니다. |
| 설정값 | 기능 활성화 여부, 미리보기·영상 필터·컴프레서·스타일 설정, Gain 및 채팅 너비를 저장해 다음 사용에 반영합니다. |

확장 프로그램은 건강 정보, 결제 수단·결제 내역, 비밀번호 또는 GPS 위치를 별도로 추출하거나 보관하지 않습니다. 후원 메시지 숨김은 메시지 종류에 따른 표시 처리이며 결제 정보를 조회하는 기능이 아닙니다.

## 2. 외부 연결과 로그인 세션

- 미리보기와 방송 시작 시각 표시를 위해 브라우저에서 치지직 API(`api.chzzk.naver.com`)에 방송·VOD 식별자가 포함된 HTTPS 요청을 보냅니다.
- 이미지와 미리보기 영상은 치지직이 제공하는 HTTPS 미디어 주소에서 불러옵니다. 팝업 플레이어는 치지직 방송 페이지를 엽니다. 해당 서비스 및 미디어 제공자는 통신 과정에서 IP 주소 등 일반적인 요청 정보를 받을 수 있습니다.
- API 요청에는 브라우저가 관리하는 기존 치지직 로그인 세션이 자동으로 동반될 수 있습니다. 확장 프로그램이 비밀번호를 입력받거나 쿠키·인증 토큰을 직접 추출해 따로 저장하지는 않습니다.
- 확장 프로그램에는 개발자 서버로 데이터를 전송하는 기능, 외부 분석 도구 또는 광고 추적 기능이 없습니다. 네이버·치지직 및 미디어 제공자의 자체 데이터 처리는 해당 서비스의 방침을 따릅니다.
- 팝업의 안내·문제 신고·소스 코드 링크를 누르면 GitHub 등이 열립니다. 방문 및 사용자가 직접 제출한 내용에는 해당 사이트의 방침이 적용됩니다.

외부 API 응답과 미디어는 데이터로 사용합니다. 확장 기능의 실행 코드와 HLS 재생 라이브러리는 패키지에 포함되며, 원격 실행 코드를 내려받지 않습니다.

## 3. 저장 위치와 보관

- 일반 기능·스타일 설정은 `chrome.storage.local`의 확장 전용 저장소에 보관합니다. 이 확장은 `chrome.storage.sync`를 사용하지 않습니다.
- Gain(`knifeGain`)과 채팅 너비(`chatWidth`)는 치지직 사이트 origin의 `localStorage`에 저장합니다. 이 저장소는 사이트 측 저장소이므로 확장 제거만으로 해당 값의 삭제를 보장하지 않습니다.
- 방송 정보·재생 상태·채팅 표시용 정보는 페이지 메모리에서 일시 처리합니다. 일부 방송·VOD 정보는 유효기간이 있는 메모리 캐시를 사용합니다. 채팅 본문·방문기록·조작 이벤트를 확장 전용 저장소나 파일에 장기 저장하는 기능은 없습니다.
- 확장 관리자가 사용자의 브라우저에 저장된 이 데이터를 조회할 수 있는 수집 서버는 없습니다. 브라우저의 세션 복원·사이트 저장소 및 메모리 관리는 브라우저의 동작에 영향을 받습니다.

## 4. 판매·공유와 제한적 사용

이 확장 프로그램의 사용자 데이터 사용은 **Chrome 웹 스토어 사용자 데이터 정책과 제한적 사용(Limited Use) 요구사항을 준수합니다.** 데이터는 위에 공개한 시청 편의 기능에 필요한 범위로만 사용합니다.

사용자 데이터를 판매하지 않으며, 위 기능 제공에 필요한 치지직·미디어 요청 외에 목적과 무관한 제3자 전송을 하지 않습니다. 개인 맞춤 광고·데이터 중개·신용도 판단 또는 대출을 위해 데이터를 사용하거나 전송하지 않습니다. 확장 관리자는 사용자 브라우저의 채팅·식별자·조작 정보를 자동으로 전달받거나 열람하지 않습니다.

## 5. 선택권과 삭제

사용자는 팝업·스타일 설정에서 개별 기능을 끄거나 브라우저의 확장 관리 화면에서 확장을 비활성화·제거할 수 있습니다. 끈 기능의 페이지 적용에는 새로고침이 필요할 수 있습니다.

저장된 값의 삭제가 필요하면 확장 전용 저장소와 치지직 사이트 저장소를 구분해야 합니다. 확장 전용 설정은 브라우저의 확장 관리 기능을 통해 관리합니다. 사이트 저장소의 `knifeGain`·`chatWidth`는 해당 키를 삭제하거나 치지직 사이트 데이터를 삭제해 제거할 수 있습니다. **사이트 데이터 전체 삭제는 치지직 로그인과 다른 사이트 설정에도 영향을 줄 수 있습니다.**

## 6. 문의와 방침 변경

문의는 [커뮤니티 포크 GitHub Issues](https://github.com/Do-hyeon/cheese-knife/issues)를 이용할 수 있습니다. Issues는 공개되므로 비밀번호, 쿠키·토큰, 개인 이메일, 비공개 채팅 또는 서명된 미디어 URL을 게시하지 마세요. 사용자가 자발적으로 제출한 문의와 첨부 자료는 GitHub에 남을 수 있으며, 해당 사이트의 삭제·개인정보 절차를 따릅니다.

데이터 처리 방식이 바뀌면 이 문서의 수정일과 공개 내용을 갱신합니다. 이 방침은 스토어 심사 승인이나 모든 관할 법률에 대한 적합성 인증을 의미하지 않습니다.

---

## English

- **Scope:** Cheese Knife — Community Recovery, version 2.13.2.
- **Effective / last updated:** October 8, 2026.
- **Maintainer:** the community fork maintained by GitHub account **Do-hyeon**.

This policy applies to the unofficial community recovery, not the original author's release or NAVER/CHZZK services.

### Purpose and data handled

The extension improves viewing of CHZZK live streams and VODs. It processes the following information in the user's browser, including local-only processing:

- **User identifiers:** when supported and enabled, the deleted-message display compares author identifiers already held by the CHZZK page. The extension does not request real names or email addresses.
- **Chat messages:** current message text, type, time and status are used for donation-message hiding, timestamps and supported deleted-message display. It does not fetch historical chat from a server.
- **CHZZK addresses:** current page paths, stream/VOD identifiers and hovered stream links connect features and request preview metadata. The extension does not collect browsing history across other sites or retain a separate visit history.
- **Interactions:** mouse coordinates, buttons and relevant key events are temporarily used for previews, seeking, hold-to-fast-forward, popup movement and chat resizing. It does not create behavioral analytics or typed-content logs.
- **Website content and playback state:** page elements, stream metadata, images, video, audio, playback position/rate and feature readiness are used for display, playback and visual/audio adjustments. It does not record audio/video or upload them to the maintainer.
- **Preferences:** feature switches, preview/filter/compressor/style settings, Gain and chat width are saved for later use.

The extension does not separately extract or retain health data, payment instruments or transaction histories, passwords or GPS location. Donation-message hiding filters message types; it does not retrieve payment records.

### Connections and existing sessions

The browser makes HTTPS requests to `api.chzzk.naver.com` using stream/VOD identifiers for previews and stream-start metadata. Images and previews load from HTTPS media addresses supplied by CHZZK; popup players open CHZZK stream pages. These providers may receive IP addresses and ordinary request information.

The browser may automatically include the existing CHZZK login session with API requests. The extension does not prompt for passwords or directly extract and separately store cookies or authentication tokens. It has no maintainer data-collection server, external analytics or advertising trackers. The service providers' own processing is governed by their policies. Opening guide, support or source links visits GitHub or other linked sites, whose policies apply to those visits and voluntarily submitted information.

API responses and media are used as data. Executable extension code and the HLS playback library are bundled; remote executable code is not downloaded.

### Storage and retention

General preferences are stored in the extension's `chrome.storage.local`; the extension does not use `chrome.storage.sync`. Gain (`knifeGain`) and chat width (`chatWidth`) are stored in CHZZK-origin `localStorage`. Uninstalling the extension does not guarantee removal of those site-storage values.

Stream metadata, playback state and chat-display information are processed in page memory. Some stream/VOD metadata uses expiring in-memory caches. The extension does not persist chat text, browsing history or interaction events in extension storage or files. There is no collection server through which the maintainer can retrieve these browser-held data. Browser session restoration, memory and site storage remain subject to browser behavior.

### Limited Use, sale and sharing

**The extension's use of user data complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.** Data are used only for the disclosed viewing features. Data are not sold or transferred for unrelated purposes; CHZZK/media requests necessary for these features are described above. Data are not used or transferred for personalized advertising, data brokerage, credit-worthiness or lending. The maintainer does not automatically receive or read browser-held chats, identifiers or interactions.

### Controls, deletion and contact

Users can disable individual features or disable/uninstall the extension. Reloading a page may be necessary for setting changes. Extension preferences and CHZZK site storage are separate: browser extension management controls the former; removing the `knifeGain` and `chatWidth` keys or clearing CHZZK site data removes the latter. **Clearing all CHZZK site data may also affect login and other site settings.**

Contact the maintainer through [GitHub Issues](https://github.com/Do-hyeon/cheese-knife/issues). Issues are public: do not post passwords, cookies/tokens, personal email addresses, private chats or signed media URLs. Voluntarily submitted reports and attachments may remain on GitHub and are subject to its privacy and deletion processes.

This policy will be updated when processing practices change. It is not a store-review approval or a certification of compliance with every jurisdiction's laws.
