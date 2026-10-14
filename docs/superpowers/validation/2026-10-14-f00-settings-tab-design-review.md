# F00 별도 설정 TAB 설계 — Astra max 검토와 보완

2026-10-14 / Asia-Seoul. 사용자 승인: 보안 경계를 유지하는 별도 설정 TAB 상세 설계·Astra max 검토. 이후 사용자 요청으로 **시각 목업 확인을 written-spec/UI 승인 전에 추가**했다. product 구현·push/PR·실제 Chrome 변경 없음.

## 검토 입력과 판정

- 입력 소스448772a, [보완 설계](../specs/2026-10-14-f00-media-settings-tab-design.md). fresh `gpt-6-astra`/max read-only 설계 검토.
- 최초 문서 SHA256 `A2FA9637473A3298D498390B0E2713BE835D293362CC8EB45774236B19CEA3FF`, **Critical0/Important5/Minor1**.
- 1차 보완 입력 `6288CAACCECC5BCDC7C4BA15FF212FA6DF46710D1B9DA8D8CB23487E9E8FB863`: targeted 1/2/3/6 닫힘, 4/5 잔여 모순 있음.
- 2차 보완 입력 `D30CBCD718DD91D3E1B49E840BF2381BDEBB014B39A7F69DC0EEEB9124AC8F84`: **남은4/5도 닫힘, 최초6항목 전체 targeted closure**. 이후 승인 상태/목업 게이트 메타데이터는 이 hash의 입력과 구분한다.
- 판정: **written-spec 승인 검토 준비 완료**. 이후 사용자 목업/UI·명세와 toolbar→TAB 수용기준 승인을 받았다2026-10-14. 별도 상세 구현 계획/검토·실행 승인은 대기다. fresh whole0/0/0 또는 전체 F00/제품 수정 PASS가 아니다.

## 최초 finding과 확인된 보완

| 최초 항목 | 소스 근거/위험 | 설계에 반영한 요구 | targeted 상태 |
| --- | --- | --- | --- |
| Important1 표시값과 다른 프리셋 | popup.ts의 전역 표시 v1과 프리셋 값 v2가 따로 갱신됨. 밝기2 표시 중1 저장 가능 | confirmed 표시값 사용·pending0·globalRevision 일치 후 생성; 지연 중 생성 차단, v1 일반 편집 독립 | 닫힘 |
| Important2 파괴적 확인 없음 | reset/channel-delete/preset-delete handler는 첫 클릭에 요청 | native confirm·취소 mutation0·캡처한 대상/토큰으로1회; 확인 사이 변경은 conflict/거부 | 닫힘 |
| Important3 폐기 client의 복원 | pagehide dispose 후 복원 화면은 enabled/ready인데 새 저장0 | persisted 복원은 편집 불가/재연결 필요·draft/결과 불명 보존; 사용자 확인 후 own TAB reload | 닫힘 |
| Important4 VOD 스타일 대상 상실 | 원래 styles 링크의 CHZZK pair와 새 live triple-only 계약 충돌 | origin 확인은 style pair, live 확인은 별도 triple; VOD pair-only/current disabled/원래 VOD reload 검사 | 닫힘 |
| Important5 의도 보존 read-back 없음 | UI는 discard만 제공. 기존 refresh도 unknown 정산→flush 가능 | explicit read-back 추가·조회/dirty 전송 분리·same-value patch 확정 제거·UUID/draft 보존·자동 mutation0 | 닫힘 |
| Minor1 무쓰기 조건 범위 오류 | v1 legacy resizeChat/t 이관은 원래 초기화 시 쓰기 가능 | 신규 media mutation/mediaProfiles·자동 TAB 생성0으로 한정하고 legacy baseline은 별도 보존 | 닫힘 |

root는 제안을 실제 연결 소스와 대조해 반영했다. read-back은 기존 refresh에 버튼만 연결하면 되는 것으로 처음 판단했지만, targeted 검토에서 자동 flush가 지적돼 필요한 client 보완까지 범위를 명시했다. 원래 worker의 doc/iframe/incognito/target 검증을 완화하거나 조회 값을 권한으로 대신하지 않는다.

## 재현의 증거 수준

검토자는 기존 fixture를 이용한 읽기 전용 JSDOM 합성 재현2건을 수행했다. 전역 brightness2 확정/v2 이전 snapshot 지연 중 preset1 생성과 persisted 이벤트 뒤 ready 입력/새 저장0을 확인했다. root가 실제 설치·브라우저에서 재현했다고 표현하지 않는다. 파일/index/HEAD 변경 및 실제 Chrome 활동 없음.

[Chrome Tabs 권한](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions)과 [MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender)를 현재 공식 근거로 대조했다. TAB 방식에서도 Chrome의 실제 문서 사실이 없으면 거부하며 새 tabs/history/cookies/identity 권한이 필요하다는 가정은 두지 않는다. 저장소의 channelId/프리셋 이름이 사용자 설정 데이터라는 고지는 유지한다. 정책 적합성/취약점 없음/심사 통과 인증이 아니다.

## 미검증·후속 요구

- toolbar 버튼→own TAB의 실제 문서 ID/context·UI 저장: 미구현, 후속 qualification 전 PASS 없음.
- 목업은 화면 구성 제안이며 auth/API/storage/rendered product·접근성 인증이 아니다. 정상 boot는 전역 scope이고 이미지의 현재 채널은 선택 후 예시다.
- 실제 extension URL BFCache/freeze·키보드/확대/좁은 창·새 confirmation UI: 후속 수용 검사. 합성 이벤트는 실제 BFCache 증거가 아니다.
- 기존 F00 Task5 저장4관측/손실 negative 및 Task6 전체 회귀·9기반·점검도구·패키지·whole-F00 Astra max는 계속 미완료다.
- 공식 보안 인증·스토어 심사·법률 판단, 기존 시청 Chrome/P09·공개·배포는 범위 밖이다. 이번 검토로 이들 승인/검증을 대체하지 않는다.

문서-only 검사: 로컬 링크33개/부재0·UTF-8/한글·영문·whitespace, 기존 normative body 내용 동일, manifest/제품2.13.3·root dist58·원본 ZIP/CRX/private 자료/보호 브랜치 불변을 확인했다. 새 제품 테스트/build·실제 프로필 읽기는 하지 않았다. HTML 목업의 JS syntax와 API/storage/network 호출 부재도 정적으로 확인했다. 브라우저 렌더링/접근성 동작 PASS가 아니다.

목업은 private output의 HTML 구성 예시와 별도 생성 정적 이미지다. 앱 내 브라우저의 file URL 열기는 정책상 거부돼 우회하지 않았다. HTML의 실제 브라우저 동작은 미검증이며 정적 이미지는 실제 screenshot·기능 구현·값/문구의 최종 확정이 아니다. 사용자 UI 확인 뒤 구현 계획에서 기존 필드/range/도메인/권한 계약을 정확히 연결한다. 실제 제품 결함의 보완은 승인 후 구현과 별도 객관 검증이 필요하다.
