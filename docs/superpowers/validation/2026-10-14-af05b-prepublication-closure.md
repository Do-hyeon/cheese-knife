# AF05-B — 공개 전 준비 범위 종합 마감

2026-10-14 / Asia-Seoul. 사용자 승인 범위는 **AF05-B 자체 잔여 작업·종합 검증 → push·단일 한글 PR → 공개 CI 확인**이다. F00·F01 설계/구현, 병합·브랜치 정리·릴리즈·스토어 배포·제품 버전 변경은 제외한다.

검증 범위: main `6b919e1c62661ec49a12ce6df2c02e11273af41d` → immutable head `83a19103f38b76128bb82eceac149b8239130b9a`. B1은 이미 main에 있으며 이번 PR은 잔여 B2·native 도구·회귀/CI·현재 상태 정합화를 하나로 묶는다. 제품 `src/`, 생성 runtime `web/`, manifest/package/lock 변경은 없다. 로컬 F00 설계 파일은 이 범위의 Git tree에 없으며 공개하지 않는다.

## Fresh 종합 검증

새 clean tracked clone에서 기존 물리 의존성과 검증된 고정 ZIP을 사용했다. 원래 root dist·시청 Chrome·P09 프로필은 검사/빌드/cleanup 경로가 아니다. private 실행 기록은 `output/af05b-prepr-20261014/`에 보존한다.

| 게이트 | 실제 결과 |
| --- | --- |
| Foundation9 | toolchain·runtime inventory·settings fixture/product/development/audio 도구 타입·settings/MAIN 생성·build proof 모두 exit0 |
| 전체 Node | 제외 없는 `node --test tests/*.test.cjs`:1186개/1185pass/실패0/기존 private P02 자료 부재skip1 |
| 고정 payload | 원본 ZIP hash/58파일 inventory 검증·prepare exit0; 최신 원본/source fallback 없음 |
| build/package | 격리 clone만 build, 제품2.13.3·entry resources20; 원래 root dist 불변 |
| 객관 오디오·픽셀 | 기존 합성 품질/전환/정렬 gate와 source-wrapper/native-filter pixel gate exit0 |
| 기존 설치형 회귀 | positive와 MAIN-missing negative exit0; inPlaceReloadObserved=false 한계 유지 |
| B2 실제 전환 | `AF05BPrePRTransition`:5case/15phase old→new→old PASS, provenance·raw/UI/CSS/MAIN·같은 개발용 ID/profile·준비 증거 확인 |
| 실제 저장 손실 negative | `AF05BPrePRLoss`:valid-ui/new/startup/candidate-init의 정확한 transition-storage-preservation 및 own config 손실 탐지. 환경/timeout 실패를 합격으로 대체하지 않음 |
| 종료/보존 | 두 전환의 cleanupErrors/secondaryErrors/retainedRoots 모두0, source/after 동일. 원래 제품2.13.3/rootdist58·ZIP/CRX·frozen·보호 브랜치 불변 |
| 도구 감사 | npm0·Gitleaks dir0/git0·ESLint8, raw exit1·input snapshot matched=true. 아래 잔여 경고와 구분 |

19개 실행 게이트는 모두 exit0이다. 도구 감사는 별도이며 경고 때문에 raw exit1을 유지한다. 기존 skip1을 새로 추가하거나 과거 P02 원장을 수정하지 않았다.

## 잔여 경고와 native 근거

ESLint8은 `scripts/owned-files.mjs`의26/27/45/74/79/94/115/125줄 dynamic fs 경계다. 이전 B2 감사 `run-2026-10-13T08-34-56-407Z-qN92CI`와 파일·행·열·규칙8개를 정확히 대조해 동일함을 확인했다. 해당 소스도 c707af6 이후 불변이다. 새 경고0이나 기존 경고8을 없애거나 scanner suppression/기존 frozen 원장에 반영하지 않았다. 순차 소유 경로·일반 파일·link 거부·배타적 게시 계약의 기존 테스트와 독립 검토를 유지하며 전체 보안 인증으로 표현하지 않는다.

기존 `P09Native20261013B`의 원본 실행 자료만 읽어 source9/Node·재생성 probe12·observations12·native facts4·completed attempts34·terminal complete를 대조했다. 순수 checker의 NATIVE-PREFLIGHT-PASS/complete=true를 재현하고 역순 입력은 거부했다. 이번 live Chrome/P09/profile/process/endpoint 조회는0이다. 최초 private replay helper의 파일명 정렬 순서 오류는 기존 CLI의 명시적 stage/context 순서와 대조해 수정했으며 원본 자료/CLI/event를 변경하거나 새 native 실행으로 주장하지 않는다. 이전 실패 run A도 보존한다.

## Fresh Astra max 전체 범위 검토

위 고정 base/head를 읽기 전용으로 독립 검토한 결과 **Critical0·Important0·Minor1**이다. 준비 PR을 차단할 구현 결함은 확인되지 않았다. reviewer는 native-preflight와 transition-preparation의 VM/JSDOM57개를 독립 실행해57pass/실패0/skip0을 확인했다. 첫 sandbox realpath EPERM 뒤 승인된 동일 명령 재실행이며 canvas 미구현 진단2개는 fixture 한계다. 주 실행자의 전체 suite·설치/품질/감사 결과와 합산하지 않는다.

Minor1은 과거 ‘구현 중/미승인·미실행/Task3 blocked’ 문구가 현재 상태로 읽히는 문제다. 이번 요청의 현재 상태 마감 과정에서 해당 문단을 당시 이력으로 구분하고 최신 근거에 연결했다. 원래 독립0/0/1과 B2 원검토0/6/0·native 원검토0/0/1을 그대로 유지한다. 문서 수정 후 독립0건·새 보안/정책 인증은 주장하지 않고 재검토를 반복하지 않는다.

검토에서 판단을 보류한 범위와 주 실행자 결정:

- F00/F01은 명시적 제외이므로 구현·설계 검토를 이 PR에 추가하지 않는다. 비용: 각 기능은 별도 승인·검증이 필요하다.
- 실제 live P09/Chrome/process/cleanup을 다시 실행하지 않는다. 저장된 native 근거 replay와 최초 실행의 live 사실을 구분한다. 비용: 현재 사이트/브라우저 상태의 신규 증거는 아니다.
- 실제 스토어 설치·게시 후 업데이트·열린 이전 content script 전환은 후행 수용이며 미실행으로 남긴다. 비용: 준비 PR을 플랫폼 업데이트 PASS로 사용할 수 없다.
- 과거 미확보 전환과 플랫폼 rollback 미실행은 승인된 한계를 유지한다. 비용: 그 경로의 성공을 보증하지 않는다.
- CRX 서명·Chrome metadata/아이콘 시각 동일성·실제 방송/계정/장치/네트워크/native rendering·audio는 이번 독립 fixture 검토의 인증 대상이 아니다. 비용: 고정 payload/합성 결과로 모든 실사용을 보증하지 않는다.
- 전체 suite/build/package/audio/pixels/audit/보호 검사는 위 주 실행자 fresh 근거, 공개 CI는 실제 PR head checks가 소유한다. 비용: 독립57개를 종합 게이트로 대체하지 않는다.
- 악의적 동시 파일 교체·수동 증거의 진실성·임시 디스크 엄격한 quota·다중 사용자 운영은 순차 소유 fixture 계약 밖이다. 비용: 암호학적 증거 인증/모든 경쟁 환경의 안전 보장은 없다.
- 보안 scan/Daybreak·보안/개인정보 인증 및 push/PR/CI/merge/release/store 실행의 성공은 코드 reviewer가 보증하지 않는다. 비용: 실제 공개 결과는 별도 조회하며 이번에는 병합·배포하지 않는다.

## 공개 및 후행 수용

- [x] AF05-B 공개 전 준비 범위 종합 마감·fresh 전체 게이트·독립 최종 검토와 상태 정합화.
- [x] 사용자2026-10-14 AF05-B만 push·단일 한글 PR·공개 CI 확인 승인.
- [ ] 실제 push·PR 생성과 마지막 head 공개 CI 확인. 이 기록은 실행 전에 작성했으며 공개 결과는 후속 기록으로 고정한다.
- [ ] 게시 후 실제 새 설치·2.13.3→후보 업데이트·설정/열린 페이지/오류 수용. 준비 PR의 선행 조건이 아님.

AF05-B 공개 전 준비 마감과 실제 업데이트 수용 전체 완료는 다르다. 최소 F00·F01 완료는 차기 버전 배포 로드맵에만 적용하며 이 PR의 의존성이 아니다. 현재 제품2.13.3 유지, 병합·브랜치 정리·릴리즈·스토어 배포 없음.
