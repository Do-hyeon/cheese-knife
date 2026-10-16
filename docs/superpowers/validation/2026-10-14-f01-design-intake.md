# F01 설계 착수 조사와 첫 선택

**최신 결정2026-10-14:** 전체/Gain 설계와 최신 목업은 사용자 승인됐다. F00 PR #44의 공개 CI·병합·해당 브랜치 정리는 완료했고, 이 문서·목업은 별도 로컬 F01 브랜치에 보존했다. 현재는 상세 구현 계획·Astra max 검토 단계이며 제품 실행/공개 승인은 아니다. 차기 릴리즈는 F00·F01·F02 및 통합 게이트 완료 후다. 아래 착수 당시의 승인 대기·F00/F01 릴리즈 기준은 이력이며 현재 기준으로 재사용하지 않는다.

**현재 변경:** 사용자2026-10-14 ‘설계 보완’에 따라 플레이어 임시 Gain 전용 제안은 폐기했다. [Gain 자동 저장 보완 명세](../specs/2026-10-14-f01-player-gain-design.md)·전체 명세·목업을 수정하고 같은 Astra max 검토자가 새 제한 writer 경로를 재검토한다. 아래 착수/최초 검토 마감 문구는 당시 이력이며 새 Gain 경로의 승인·검증 완료가 아니다.

2026-10-14 / 입력 `6ad000e412aa2519e45539ad8a3c6a4da18405bf`. 사용자의 ‘후속 권장안 진행’에 따라 F01 상세 설계·목업·Astra max 검토를 준비한다. 이 문서는 조사 메모이며 승인된 상세 명세나 구현 계획이 아니다. 제품 코드·생성 자산·설정·프로필·버전·push/PR/병합/배포를 변경하지 않는다. 승인 요청 문서는 한글로 작성한다.

## 목적과 고정 경계

**후속 결정:** 사용자2026-10-14가 A안을 선택했다. 아래 선택 대기 문구는 조사 당시 이력이다. 현재는 [한글 상세 명세](../specs/2026-10-14-f01-audio-processing-design.md)와 [정적 목업](../mockups/2026-10-14-f01-audio-settings.html)을 작성하고 Astra max 설계 검토를 진행한다. 작성된 문서/목업의 승인이나 구현/공개 승인은 아직 아니다.

**착수 단계 마감:** 명세·목업 작성/정적 점검과 [Astra max 설계 보완](2026-10-14-f01-design-review.md)을 마쳤다. 최초0/4/1·수정 유발 Minor1은 같은 검토자의 targeted 확인으로 모두 닫혔다. 현재 커서는 작성된 상세 명세·목업의 사용자 승인 대기이며 아래 조사 체크리스트는 착수 당시 고려 항목 이력이다. 제품 구현·DSP 실행·공개 완료를 뜻하지 않는다.

채널별 오디오 저장 기반 F00을 사용해 기존 Gain을 연결하고 EQ·선택형 노멀라이저·오디오 프리셋을 제공한다. 나머지 설정은 전역으로 유지하며 계정 식별·녹음·오디오 sample 외부 전송·분석 로그 수집을 추가하지 않는다. 컴프레서 기존 설정·mute/volume0/Gain0·영상 교체·다중 창·저장 유실 보호를 유지해야 한다.

F00 로컬 완료를 새로운 실제 Chrome/store 업데이트 성공으로 바꾸지 않는다. 차기 공개 최소 조건은 F00·F01 및 최종 통합 게이트이며 제품2.13.3은 설계 단계에서 바꾸지 않는다. 이번 조사로 F01 상세 명세·구현 계획·실행까지 승인된 것으로 해석하지 않는다.

## 현재 코드에서 확인한 연결점

| 경계 | 현재 상태와 F01 영향 |
| --- | --- |
| src/shared/media-contracts.ts / src/settings/media-profiles.ts | audio6·video5의 정확한 필드 집합과 schema1이다. 신규 오디오 필드·schema 호환을 명시 설계해야 하며 과거 shape를 느슨하게 허용하는 방식은 금지한다. |
| src/settings/contract.ts / config.ts / client.ts / broker.ts / popup.ts | 동일 writer queue·필드 편집·생성 토큰·읽기/ACK 유실 복구·전역/채널 선택·프리셋 복사를 재사용한다. 새 값·이전 데이터·프로토콜 혼재를 모든 소비자에서 검증해야 한다. |
| src/main/runtime/bridge.ts 및 ISOLATED bridge | projection은 고정 scalar 필드만 전달한다. 전체 채널 목록·프리셋 이름·오디오 sample을 MAIN으로 전달하지 않는다. |
| src/main/features/audio/controller.ts / contracts.ts / curve.ts | 같은 video의 source 한 개, dry/wet, 기존 compressor·Gain·리미터가 있다. Gain은 현재 site localStorage의 knifeGain이고 OFF는 dry bypass다. 리미터를 처음부터 다시 만들지 않고 기존 처리·객관 오차 계약을 보호한다. |
| src/main/features/player/controls.ts | 현재 버튼은 컴프레서 ON/OFF이며 Gain 입력도 ON일 때만 보인다. 새 EQ/노멀라이저의 켜짐 의미를 이 버튼에 몰래 덧붙이면 OFF의 의미가 달라진다. |
| tests/audio.test.cjs / media-client·media-ui·media-settings-tab / scoped runtime | F00의 재진입·PZP-only 교체·빈 source 복귀·수동 ON/OFF·늦은 응답·읽기 실패 회귀를 유지한다. 변경한 계약의 positive와 부정 사례를 함께 확장한다. |
| scripts/check-audio-quality.mjs / audio-metrics·signal / installed transition·TAB / 생성·타입·inventory | 객관적인 출력·전환·DSP 수치와 실제 설치/저장 전환을 나누어 증명한다. 새 current inventory만 검토 후 갱신하며 역사 fixture/hash/오차는 통과 목적으로 바꾸지 않는다. |

## 먼저 선택할 ON/OFF 구조

| 안 | 의미 | 장점 | 비용·주의 |
| --- | --- | --- | --- |
| A 권장: 오디오 전체 버튼 + 효과별 설정 | 플레이어 버튼은 전체 처리 ON/OFF. 설정 탭에서 compressor/EQ/normalizer는 각각 켜고 끈다. 전체 OFF는 모든 처리를 우회한다. | Gain만 사용하거나 EQ만 사용하는 구성이 가능하고 전체 OFF의 의미가 명확하다. source는 계속 하나다. | 기존 ‘컴프레서’ 버튼 이름/의미와 초기 켜짐 값을 명시적으로 이전해야 한다. 기존 체크박스를 몰래 다른 의미로 재사용하면 안 된다. |
| B: 효과별 독립 ON/OFF | 기존 compressor 버튼을 유지하고 EQ/normalizer를 별도로 켜고 끈다. | 기존 버튼 의미 유지. | compressor OFF에도 다른 효과가 남을 수 있다. 전체 처리 상태·끄기 방법을 추가로 설명해야 하며 상태/조작 복잡성이 커진다. |
| C: 기존 compressor ON에 종속 | 기존 compressor가 ON일 때만 Gain/EQ/normalizer도 동작한다. | 현재 dry/wet 의미에 가장 가깝다. | EQ만 사용하기 어렵고 사용자가 새 기능을 켰는데 적용되지 않는 혼란이 생긴다. |

A가 기능 목적에 가장 맞는 제안이지만 아직 사용자가 선택하지 않았다. 이 선택 전에는 자동 켜짐·컴프레서 하위 스위치·기존 Gain 이전값을 확정하지 않는다. 선택 후 기존 설정 탭을 재사용한 실제 목업을 제시하고 상세 명세/Astra max 공격적 설계 검토로 이어간다.

## 상세 설계에서 빠뜨리면 안 되는 항목

- [ ] 선택한 전체/효과별 ON/OFF와 현재 상태·초기 default·수동 조작의 구분. 기존 compressorDefault/버튼 의미의 명시적인 호환/이전.
- [ ] Gain0·미저장·유효/잘못된 기존 knifeGain·다중 탭의 서로 다른 값·명시 이전·저장 실패·구 코드 혼재에서 값이 조용히 바뀌거나 덮이지 않는 계약. MAIN 메시지를 그대로 저장 권위로 사용하지 않는다.
- [ ] EQ 대역/범위·기본 중립값·normalizer 기본 OFF와 측정/반응 속도·무음/잡음 증폭 제한·최종 limiter·지연·램프·과도 출력·오디오 중립성. RMS 기반 제어를 검증 없이 LUFS/방송 표준 인증으로 표현하지 않는다.
- [ ] schema1 읽기와 새 shape의 명시 전환·unknown 보존·첫 사용자 저장 전 무쓰기·프리셋/다른 도메인·rollback/mixed generation 제한. 데이터 보존과 이전 코드의 새 기능 지원을 구분한다.
- [ ] 현재 video/route·document authority·source 하나·AudioContext gesture·suspend/재개·PZP-only·진짜 재진입·source 상실·비선택 graph의 상태 발표 금지·mute/volume0·다중 창 독립.
- [ ] 권한/origin·로컬 번들·추가 asset/CSP·CPU/메모리·백그라운드 실행 경계. AudioWorklet·외부 의존성 필요성을 먼저 비교하며 아직 추가를 승인하거나 설치하지 않는다.
- [ ] 객관적인 기존 DSP 게이트와 새 주파수 응답·출력 상한·전환·정적/동적 노멀라이저 검사·손실 대조·새 clean 후보 실제 설치/저장 전환. 실제 사용자 Chrome/P09 및 새 외부 전송은 별도 승인.
- [ ] 한글 목업/상세 명세·자가 대조·Astra max 검토·필수 보완 후 사용자 written-spec 승인. 이후에만 상세 구현 계획/실행 방식 승인으로 진행.

## 비교·기술 근거

기존 [치지직 확장 기능 비교](thread://01a12723-af0e-7193-b311-9c6e52ff614a?hostId=local)를 읽었다. 당시 오디오 로드맵은 후속 범위의 참고이며 현재 PLANS와 이후 사용자의 공개/승인 경계가 우선한다.

[Chzzk-Platter](https://github.com/lirpa62/Chzzk-Platter#오디오-믹서)는 전체 믹서 조작과 효과별 설정·프리셋을 제공한다고 설명한다. 기능 목표를 비교하는 근거이며 최신 소스 전체의 동작·안전성 인증이나 코드 복사 승인이 아니다. 확장별 저장·권한·수명주기는 이 저장소 계약으로 설계한다.

[W3C Web Audio](https://www.w3.org/TR/webaudio/)의 GainNode/BiquadFilterNode 등 기본 기능을 우선 비교한다. [Chrome 자동재생 정책](https://developer.chrome.com/blog/autoplay/#web-audio)에 따라 설정 저장만으로 MAIN의 AudioContext 재개/자동 소리 출력을 보장하지 않는다. 이번에는 DSP 구현·브라우저 실험·보안 모델 스캔을 실행하지 않았다.
