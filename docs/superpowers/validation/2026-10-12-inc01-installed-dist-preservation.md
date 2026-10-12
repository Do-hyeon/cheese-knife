# INC01 — 로컬 시험판 파일 삭제 사고와 복원

2026-10-12 / Asia-Seoul. [승인된 범위와 계획](../plans/2026-10-12-inc01-installed-dist-preservation.md).

## 원인

AF01에서 추가한 production package test가 실제 repository `dist`를 빌드하고 test after hook에서 재귀 삭제했다. 기존 사용자의 unpacked 시험판이 이 경로를 로드했으므로 파일 보존 약속을 위반했다. root dist의 부재, 기존2026-10-11 설치 수용 기록과2026-10-12 01:06 이후 본 작업 폴더의 검사 실행 기록을 대조했다. Chrome 등록 삭제 시각·기존 설정의 현재 상태까지 확인했다는 의미는 아니다.

## 수정과 집중 검사

- 임시 repository 복제에 기존 installed sentinel을 두고 실제 production test를 자식 프로세스로 실행했다. 실제 root dist에서는 결함을 다시 실행하지 않았다.
- fixture 입력 오류(types 폴더 폐기)와 부모 NODE_TEST_CONTEXT 상속 문제를 먼저 수정한 뒤, child test는 성공하고 sentinel은 사라져 parent assertion이 실패하는 RED를 확인했다.
- 기존 verifyCandidate/removeCandidate를 재사용해 production test의 build/cleanup을 새 후보 경로에 한정했다. cleanup은 후보 생성 성공 후 등록한다. 기존 generated drift 검사와 runtime byte/developer file 판정은 유지했다.
- `node --test tests/package-isolation.test.cjs tests/package.test.cjs`:38/38, 실패·skip0.

## Astra max 검토와 보완

읽기 전용 독립 검토에서 Critical0·Important1·Minor0이 나왔다. Important는 후보 준비가 개발 입력을 미리 제외하므로 기존 production build의 developer-file 제외 검사가 약해진다는 지적이다. 복제한 실제 builder의 root copy 규칙을 tsconfig.json도 복사하도록 변형했을 때, production test가 잘못 통과하는 RED를 확인했다.

후보 root에 source/type/proof/map/config/nested TS의 여섯 대표 개발 입력을 넣고 실제 builder를 다시 실행한 뒤 기존 runtime byte/제외 assertions를 확인하도록 보완했다. 앞단의 실제 소스 generated drift 검사도 유지한다. 이 변형을 탐지하는 회귀와 원본 dist 보존 회귀·package 검사는 최종39/39 통과했다. 최종 보완은 작성자가 RED→GREEN과 전체 회귀로 검증하며 재검토 결과0건을 받았다고 표시하지 않는다.

검토자가 직접 실행하지 않은 검사는 작성자의 로컬 검사 결과와 구분한다. Linux CI·별도 P09 수용은 남은 게이트다. Chrome 재등록/설정 유지는 아래 사용자의 직접 수행/확인으로 수용했다. 기존 owned-files의 계약 밖인 악의적인 동시 파일 교체에 대한 원자적 sandbox 보호를 새로 제공한다고 주장하지 않는다. 제품 builder의 명시적 root dist 갱신 동작은 변경하지 않고, 검사에서만 격리한다.

## 복원한 파일

사용자가 승인한 원본 ZIP `cheese-knife-community-recovery-2.13.3-fb15f967.zip`의 SHA-256은 `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`이다. entry58개·누적2MiB 상한·경로/중복/link 검사를 통과한 뒤 새 private staging으로 압축 해제했다. 원본 ZIP과58/58 파일 해시를 대조하고 MV3 version2.13.3/resources20 검사 후, 비어 있는 원래 repository `dist` 경로로 이동했다. 이동 후 package 검사도 통과했다.

현재 AF 개발본을 빌드해 복원하지 않았다. 제출 ZIP·게시 CRX·P02 기준선/원장·Chrome 프로필·등록·설정은 변경하지 않았다. 파일 복원이 Chrome 카드의 자동 재등록이나 기존 설정 복구 성공을 입증하지 않는다.

## 남은 검증

- [x] 초기 전체834개는833 passed·1 failed·skip0. 리뷰 보완 후 최종 전체835개는834 passed·1 failed·skip0. 두 실패는 모두 기존 `P02 warning ledger closes every baseline row and preserves every latest guarded observation`의 background.js 역사 해시 비교이며 background.js는 이 작업에서 변경하지 않았다.
- [x] 위 역사 검사 이름 하나만 `--test-skip-pattern`으로 명시적으로 제외한 최종 재실행:834/834·실패/skip0. 원래 전체 실행을 PASS로 표시하지 않고 제외1개를 별도 기록한다.
- [x] 초기·최종 두 쌍의 전체 실행 후 복원 dist의58/58 파일 불변 확인. frozen P02 기준선 SHA-256 `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`, 원장 `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401`도 보존됨.
- [x] Astra max 읽기 전용 최종 검토와 Important1의 별도 RED→GREEN·전체 회귀 보완.
- [x] 기존 Chrome 재등록·설정 보존 수용:2026-10-12 사용자가 원래 경로의 로컬 시험판 재등록 완료와 기존 설정 유지를 확인했다. 자동 UI 조회나 모든 방송 기능의 기계적 회귀로 표현하지 않는다.

재등록은 사용자가 승인 후 직접 수행했다. 작성자는 Chrome 등록을 삭제하거나 저장 설정을 초기화하지 않았다. 사용자의 실제 수용 결과를 P09의 구 스토어2.13.2→2.13.3 업데이트 증거로 사용하지 않는다.

private RED/GREEN/전체 실행 로그는 `output/inc01-*.log`에 두며 프로필이나 실제 설정을 공개하지 않는다.

실행 환경에 npm shim이 없어 package.json의 test 명령과 동일한 `node --test tests/*.test.cjs`를 Native 방식으로 실행했다. npm 명령을 찾지 못한 최초 시도는 테스트 실행으로 세지 않는다. 의존성·제품 TS/생성 JS·manifest·버전·lockfile은 변경하지 않았다.
