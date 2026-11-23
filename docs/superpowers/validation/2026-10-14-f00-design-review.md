# F00 — 상세 설계 공격적 검토 기록

2026-10-14 / Asia-Seoul. 범위는 [설계](../specs/2026-10-14-f00-channel-media-settings-design.md)와 PLANS 정합화뿐이다. 제품 구현·설치/프로필 변경·commit/push/PR·버전 변경·릴리즈·스토어 배포는 하지 않는다.

## 입력과 독립성

- 소스: main `45100969200dfb5e33737db60c9a3fa7450f4450`, PR #43의 병합 후 CI 통과 기준2.13.3.
- 사용자 요구: 계정이 아닌 채널별 audio/video만, 채팅·스타일·미리보기·탐색·사이드바는 전역. F00/F01은 별도 기능 경로다.
- 독립 검토자: 사용자가 지정한 `gpt-6-astra`, reasoning `max`, 새 context에서 직접 읽기 전용 검토. 추가 subagent·formal security scan·Daybreak·실제 Chrome 호출 없음.
- 최초 입력 spec SHA-256: `7C1879C3A61185B38D12BFEA7D22697D2A0EDAD9B737EB17D3AB458308A9B101`. 검토 전후 동일, HEAD 불변.
- 보완 입력 spec SHA-256: `DEE5028C6E33DFDEC4DA85E96CC2C21F1A1183053D913AD97035381F1789DD91`. 동일 검토자에게 아래5항목만 targeted 확인 요청. 전체 범위 새0건 검토로 세지 않는다.

## 최초 판정과 보완

최초 **Critical0·Important3·Minor2 / with corrections**. 미구현 설계의 데이터/상태/호환 계약을 검토한 것이지 F00 동작 검증이나 보안/정책 인증이 아니다.

| ID | 중요도·근거 | 실패와 보완 |
| --- | --- | --- |
| R1 | Important / player controls238–240·spec6.2 | 전역 default=true가 지연된 B default=false보다 먼저 ON 요청을 소모할 수 있음. scopedPending의 자동ON0/미소모, 초기false 미소모, 기존 false→true/true→false·수동 조작 보존. limited fallback에서 확정 권위로 바뀔 때 auto/manual 상태를 구분 |
| R2 | Important / preview entry79·playback99·inject coordinator37·popup128·getConfig245·contract123 | media 오류가 기존 configReady/전역 UI를 제한하거나 불량 global revision이 정상 scalar까지 막을 수 있음. configReady=baseReady 유지·media 상태 별도·revision validity와 값 유효성 분리·손상 metadata는 readonly 제한 |
| R3 | Important / spec의 preset apply 계약·broker99·contract133 | UUID와revision은 같지만 생성이 다른 preset을 늦은 apply가 복사할 수 있음. channel/global apply 양쪽에 원본 id+createdRevision+revision 검사, edit/delete에도 생성 token 필수 |
| R4 | Minor / settings bridge33·main.css3·discovery26 | MAIN player 모듈로 옮긴 global renderer가 no-player preview에서 사라질 위험, wrapper target projection 부재. global=document/base 수명·channel=player 수명·adapter의 정확한 target·같은 video의 wrapper 교체 재조정 |
| R5 | Minor / runtime lifecycle28·bridge40 | v1 envelope 보존이 mixed-generation 필터/전체 기능 호환을 보증하지 않음. old/old·new/new·두 혼재 경우의 표, 혼재 limited/새로고침 안내·호환 runtime owner 확인·중복 source 설치 금지 |

주 실행자는 실제 source에서 default=true만 자동 enable하는 동작, 전역 configReady 소비자, getConfig의 revision 미참조, broad video CSS와 adapter의 wrapper projection 부재를 대조해5개 모두 수용했다. DSP 수식·저장 구현을 수정한 것이 아니라 설계와 수용 사례를 보완했다.

독립 검토자는 기존 코드 behavior probe2개를 읽기 전용으로 실행했다: 같은 context의 false→true가 ON하고 이후 false가 OFF하지 않는 것, 잘못된 global revision에도 현행 reader가 정상 global config를 반환하는 것. 이2개는 새 F00 tests나 기존 전체1186개의 재실행이 아니다.

## 승인 선택과 판단 제외의 처리

| 검토자가 별도 둔 범위 | 주 실행자 처리·비용 |
| --- | --- |
| VOD owner 미확인 | 숫자 videoId를 channelId로 쓰지 않음. 전역 fallback/채널 저장 제한을 written-spec 승인에서 확인; 실제 owner 관측은 별도 승인 |
| Gain F01 연결 | 현재 knifeGain을 F00에서 이동/삭제하지 않음. F01에서 channel 저장/기존값/음소거/Gain0/수명주기 연결 필수; F00만으로 전체 audio 분리 완료 아님 |
| 기존 popup-player iframe | 실제 live iframe임을 확인. F00 top-frame-only는 이 기존 기능도 전역-only로 남기므로 승인 목록에 명시; F04 소유권 이전에 자동 확장하지 않음 |
| Incognito 신규 저장 금지 | 제품 선택이며 기존 v1 전역 동작은 유지. 새 channel/preset mutation의 제한을 written-spec 승인에서 확인 |
| F00 구현·전체 suite·pixel/DSP·Chrome/실제 업데이트 | 현재 구현0으로 미실행. 기존 AF/native/공개 CI는 소스 기준 정보일 뿐 새 기능의 PASS가 아님 |
| 개인정보/스토어 심사·정식 보안 감사 | 공식 [local storage](https://developer.chrome.com/docs/extensions/reference/api/storage)·[runtime API](https://developer.chrome.com/docs/extensions/reference/api/runtime)·[사용자 데이터 고지](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)를 설계 제약으로 대조. 구현 고지/권한 검증과 실제 제출 판단은 후속, 안전/승인 인증 없음 |

## 보완 확인과 다음 게이트

- [x] 독립 최초 검토 및 source 근거/실패 순서 확보.
- [x] Important3·Minor2의 최소 계약 보완과 객관 수용 사례 추가.
- [x] 동일 검토자의 targeted 확인: 이전 Important3·Minor2 모두 closed, 보완 부분과 그 연결에서 추가 모순 미발견, **ready for written-spec approval**. 검토 전후 입력 hash `DEE5028C6E33DFDEC4DA85E96CC2C21F1A1183053D913AD97035381F1789DD91`와 HEAD 불변. 새 전체0/0/0 검토나 F00 테스트 재실행이 아니다.
- [x] 사용자 written-spec 승인2026-10-14. 후속 [상세 구현 계획](../plans/2026-10-14-f00-channel-media-settings.md)을 작성/검토한다. 제품 구현/Native 실행 승인은 별도다.
- [ ] 구현 계획/Native 실행 승인 뒤 격리 구현·실패/손실·품질/설치 검증. 지금 실행하지 않는다.

남은 위험은 미구현 계약의 실제 성립 여부와 플랫폼/사이트 변동이다. mixed generation·VOD·iframe·Gain의 제한을 숨기거나 채널 선호 설정을 ‘사용자 데이터 없음’으로 고지하지 않는다.

최종 확인에서 구현 계획으로 넘길 해석: 같은 context의 재검증에서 수동 wanted를 보존해야 하므로 현행 `audio/controller.ts:bypass()`(194행)의 wanted=false 처리를 무조건 재사용하지 않는다. 새 context 종료와 같은 context의 일시 효과 중단을 구분한다. 또한 media 오류가 정상 전역 writer/client를 repair로 만들면 안 되지만, **global revision 자체**가 잘못된 경우의 기존 전역 writer/client repair 제한은 유지한다. 정상 전역 runtime 값 적용과 저장 허가는 다른 계약이다.

보완 확인 뒤 spec의 현재 상태·체크리스트·검토 링크만 주 실행자가 갱신했다. 해시를 다시 고정하며 이 메타데이터 정리를 독립 전체 재검토로 표현하지 않는다.

최종 spec SHA-256: `B3CF5E61C3F10874F6D5B8FE5F45A1EF4EC16C014D4CDE0E363838C61C375104`. 문서 검증은 로컬 링크·한국어/영어 문자 범위·placeholder 부재·diff whitespace 점검이다. 기존 전체 제품 회귀를 문서 수정만으로 반복하지 않았으며 root dist58/버전2.13.3/원본 ZIP·CRX·보호 브랜치는 불변이다. 문서3개 외 source/index/HEAD/실제 프로필 변경 없음.

사용자 후속 승인과 완료 이력 분리 요청을 반영해 spec의 상태/승인 체크박스/계획 링크 및 PLANS를 갱신했다. 위 최종 해시는 승인 전 메타데이터 단계의 역사 입력이며 현재 문서 byte 해시라고 주장하지 않는다. 규범적 설계는 변경하지 않았고 구현 계획의 Astra max 검토는 별도 기록한다.
