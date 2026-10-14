# F01 순차 구현 검증 기록

2026-10-15. 사용자 승인된 상세 계획·Native 격리 실행 묶음으로 수행한다. 이 문서는 진행 기록이며 F01 전체 완료·실제 음질·무취약성·스토어 적합성 인증이 아니다. push/PR·릴리즈·버전 변경 없음.

| 단계 | 근거 | 결과 |
| --- | --- | --- |
| 준비 | 물리 후보 `output/f01-execution-20261015/source`, 기존 pinned ZIP 해시 확인 후 복사 | root dist58·제품2.13.3·Chrome/P09 보존 |
| T1 | schema2/전환/alias RED→GREEN, 집중99개, 전체1412개, 9개 기반/build/package | 99통과·전체1411통과/실패0/기존private증거1skip. 후보59/17, 로컬79bf6e2 |
| T2 | protocol3·Gain 역할/epoch/receipt·legacy 읽기·시간 제한·늦은 raw 경쟁·프리셋 조건 RED→GREEN, 집중61개, 전체1434개 | 61통과·전체1433통과/실패0/기존private증거1skip. 9개 기반/build/package 통과, 후보60/18 |
| T3 | 실제 소유 조작부·최소 protocol3/공통 master·Blob fixture·Native qualification | 원본·단위 검사·runner 준비. Native 미실행이며 로컬 checkpoint는 성공 증명이 아님. 실패하면 승인된 중지 게이트 적용 |
| T4–T9 | EQ/노멀라이저·TAB UI·실제 다중 창/저장 손실·객관 출력·종합/Astra max 최종 검토 | 미착수 |

T2 첫 전체 검사에서 worker/생성 테스트의 새 자산 누락5건을 발견해 원본 source와 소비자를 함께 보완했다. Windows의 임시 테스트 디렉터리 rename EPERM1건은 별도 경계67개와 새 전체 실행에서 재발하지 않았다. 기존 F00 pin·published/f00 fixture·private 감사 원장을 새 성공으로 덮지 않았다.

T1 RED 명령2회가 잘못된 root cwd에서 실행돼 증거에서 제외됐으며 각각 후보에서 재현했다. 이후 후보 cwd를 명시적으로 검사한다. root dist/사용자 프로필 변경은 없다. 원본은 로컬 브랜치에서 수정하며 제품 검사는 물리 후보에서만 실행한다.

저장 전환 ACK 유실은 transport에서 결과 불명이고 재조회 값 일치가 원래 mutation 성공을 증명하지 않는다. 현재 TAB의 폐기/다음 편집·confirm 취소는 T6/T7의 실제 UI와 함께 마감한다. native API의 단위 모사는 실제 Chrome sender/document/gesture 성공을 대신하지 않으며 T3에서 확인한다.

현재 제한: 유료 DVR·과거 플랫폼 업데이트/실제 플랫폼 rollback·실제 방송 청취/출력·실제 actor gesture는 이번 단계에서 확인하지 않았다. 현재 native parser/source actor 준비 결과나 정적 검사만으로 이를 PASS로 표시하지 않는다.

T3 준비에서 기존 MAIN durable Gain 쓰기 제거/owner3/공통 수동 master의 RED→GREEN3, closed-root·재배치·무효화·Navigation 회귀7개를 확인했다. 준비 중 재배치의 병렬 조회는 RED에서 요청2개로 재현하고 기존 pending 요청 뒤 fresh 조회1개로 보완했다. runtime/bridge/audio/player 소비자155개와 새 harness shutdown/dirty/assets 실패 대조를 검증했다. 기존 HLS 검증은 보완 없이 재통과했다. sandbox 디렉터리 rename EPERM은 Native 단독8개와 전체 검사에서 통과했다.

마지막 source의 전체1458개 중1457통과/실패0/기존private증거1skip·9개 기반/build/package 통과를 확인했다. 후보dist61/runtime19. 새로운 F01 실행 pin만 normalized executable 해시로 갱신하며 기존 F00/published pin은 변경하지 않는다. 실제 Chrome qualification과 물리 오디오 증거는 아직 없다. 이 입력의 로컬 checkpoint에서 새 clean 물리 후보를 만든다.

manifest의 Gain 자산은 승인된 별도 top-frame ISOLATED 항목으로 이동했다. 기존 all_frames bridge/MAIN·matches/excludes·권한·WAR는 유지한다. 이전 배치의 계약 실패 RED 후 경계/MAIN 제거 대조4개 GREEN을 확인했다.
