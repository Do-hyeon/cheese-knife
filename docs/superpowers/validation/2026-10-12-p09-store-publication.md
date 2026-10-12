# P09 — Chrome 웹 스토어 게시 확인

확인일: 2026-10-12 / Asia-Seoul. 사용자가 게시 완료를 알렸으며 공개 상세 페이지를 브라우저에서 읽기 전용으로 직접 확인했다. 확장 설치·기존 설정 변경·개발자 대시보드 수정은 하지 않았다.

## 확인한 공개 정보

- [공개 스토어 항목](https://chromewebstore.google.com/detail/cgfddiiffponlciljlfbiecmlagflbpe): 치즈 나이프 — 커뮤니티 복구판.
- 확장 ID: `cgfddiiffponlciljlfbiecmlagflbpe`.
- 표시 버전: `2.13.3 sidebar follow-up preview`.
- 표시 업데이트일: `2026년 10월 12일`.
- 제공자 Do-hyeon, Chrome에 추가 버튼, Chrome 전용·지원 제한과2.13.3 변경 설명을 확인했다.
- 사용 안내·문제 신고·개인정보처리방침은 Do-hyeon/cheese-knife의 main/README·Issues·main/PRIVACY를 가리킨다.

웹 조회 도구는 해당 상세 페이지에 접근하지 못했다. 검색 결과의 다른 확장 항목은 근거로 사용하지 않았으며, 브라우저에서 같은 ID의 실제 상세 페이지에 표시된 정보만 기록했다. 공개 업데이트 날짜는 정확한 게시 시각의 증거가 아니다.

## 준비된 배포 기준과 게시본의 구분

기존 배포 준비 기록의 제품 기준은 `fb15f9675f9ea910e98363635155bc4ff9eb1d2f`, version2.13.3, GitHub prerelease [v2.13.3-community.1](https://github.com/Do-hyeon/cheese-knife/releases/tag/v2.13.3-community.1)이다. 준비된 ZIP 이름은 `cheese-knife-community-recovery-2.13.3-fb15f967.zip`, 201802 bytes·58 entries, SHA-256 `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`이다.

이 값은 기존 로컬 배포 준비 기록의 기준이며 이번에 내려받은 스토어 CRX의 해시가 아니다. 공개 버전 표시만으로 스토어 payload의 byte 동일성, 신규 설치·업데이트 성공이나 설정 보존을 입증하지 않는다. 스토어 서명 패키지와 제출 ZIP도 같은 파일이라고 가정하지 않는다.

이후 main의 AF 타입·모듈 이행과 DT 개발 도구 변경은 이 게시 확인으로 배포됐다고 표시하지 않는다. 차기 AF 후보의 설치·업데이트·롤백 수용은 AF05-B에서 별도로 기록한다.

## 체크리스트와 다음 게이트

- [x] 사용자의 게시 완료 보고.
- [x] 같은 확장 ID의 공개2.13.3 표시 확인.
- [x] 기존 심사 대기 커서를 게시 후 수용으로 이동.
- [ ] 새 설치가 실제 게시 산출물을 받는지 확인.
- [ ] 기존2.13.2 설치의2.13.3 업데이트와 설정 보존 확인.
- [ ] 게시 payload·배포 commit/ZIP 연결·정확한 게시 시각·검증 범위·롤백 경로의 최종 증거 고정.
- [ ] 차기 AF 배포 산출물의 AF05-B 수용과 기능 로드맵 해제 결정.

P09는 게시 표시 확인까지 진행한 상태이며 전체 완료가 아니다. AF05·F00–F05 동결을 자동으로 해제하지 않는다. 실제 Chrome에 설치하거나 기존 확장/설정을 바꾸는 UI 단계는 실행 직전 사용자 확인을 받는다. 공개 페이지 확인만으로 사용자 설치를 변경하지 않는다.
