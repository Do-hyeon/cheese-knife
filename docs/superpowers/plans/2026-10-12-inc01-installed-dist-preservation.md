# INC01 — 로컬 시험판 로드 파일 보존과 복원

승인: 사용자가 테스트 격리 수정과 어제 검증된2.13.3의 원래 경로 복원을 승인했다. 현재 폴더·기존 비-main 브랜치에서 진행하고 P09 문서 변경을 보존한다.

## 불변 조건

- Chrome 등록 삭제·재설치·설정 초기화·프로필 수정은 하지 않는다.
- 현재 AF 소스의 빌드로 사용자의 시험판을 임의 교체하지 않는다.
- 복원 입력은 `cheese-knife-community-recovery-2.13.3-fb15f967.zip`, SHA-256 `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`이다.
- 원본 ZIP·게시 CRX·private P02 기준선과 원장은 변경하지 않는다.
- 생산 산출물 검사의 runtime byte·개발 파일 제외 판정과 generated drift 검사도 유지한다.

### Task 1: 파괴적 패키지 검사를 격리

- [x] 기존 root dist가 있는 임시 repository 복제에서 실제 production test를 자식 프로세스로 실행하는 회귀 검사를 작성한다.
- [x] RED: 임시 복제의 sentinel 삭제를 확인한다. 실제 설치 경로에서 결함을 재실행하지 않는다.
- [x] 기존 verifyCandidate/removeCandidate를 재사용해 production test의 빌드·정리를 후보 경로로 한정한다.
- [x] GREEN: 초기38/38, 독립 리뷰 보완 뒤39/39 통과.

### Task 2: 어제 검증본을 원래 경로로 복원

- [x] 원본 ZIP 해시·경로와 현재 root dist 부재를 확인한다.
- [x] 새 private staging에만 안전하게 압축 해제하고 package 검사·원본58파일 해시 대조를 한다.
- [x] 검사한 staging을 같은 repository의 원래 dist 경로로 이동한다. 기존 dist가 생겼으면 중지한다.
- [x] 복원 후58/58 일치·version2.13.3·package 자원20을 확인한다.

### Task 3: 재발 방지 확인과 인계

- [x] 복원된 dist의 파일 목록·해시를 기록하고 최종 전체 Node 검사를 실행한다(835개 중 기존 역사 검사1개 실패; 나머지834개 통과).
- [x] 전체 검사 후 복원 dist가 byte 단위로 그대로인지 재확인한다. 알려진 private P02 역사 검사1개만 명시적으로 제외한 최종 재실행834/834도 기록하고 원래 실패 결과는 보존한다.
- [x] Astra max의 읽기 전용 최종 검토를 받아 Important1을 RED→GREEN과 전체 회귀로 조치한다.
- [x] PLANS·검증 기록을 갱신한다. Chrome 등록/새로고침·설정 보존은 아직 수용하지 않으며 필요한 직접 조작 단계에서 사용자에게 인계한다.

## Review Focus

실제 repository dist에 대한 write/delete 재발, 기존 production byte/drift 검사 약화, 자식 검사 미실행의 거짓 양성, 임시 폴더 정리 범위, 원본 배포 ZIP과 현재 개발본의 혼동, Chrome 등록·설정 보존에 대한 과장된 완료 표현을 확인한다.
