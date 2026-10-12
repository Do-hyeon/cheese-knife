# P09 — Chrome 웹 스토어 게시 확인

확인일: 2026-10-12 / Asia-Seoul. 사용자가 게시 완료를 알렸으며 공개 상세 페이지를 브라우저에서 읽기 전용으로 직접 확인했다. 이후 승인된 별도 검사 프로필에 사용자가 스토어 확장을 설치했고 설치 파일을 읽기 전용으로 검증했다. 기존 시청 프로필의 확장·설정과 개발자 대시보드는 변경하지 않았다.

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

이 값은 제출 ZIP의 해시다. 아래에서 실제 Google 배포 CRX와 내용 대조를 진행했으며 두 컨테이너의 해시를 구분한다. 공개 버전 표시만으로 신규 설치·업데이트 성공이나 설정 보존을 입증하지 않는다.

이후 main의 AF 타입·모듈 이행과 DT 개발 도구 변경은 이 게시 확인으로 배포됐다고 표시하지 않는다. 차기 AF 후보의 설치·업데이트·롤백 수용은 AF05-B에서 별도로 기록한다.

## 게시 패키지의 자동 대조 — 설치 전

2026-10-12 Google의 HTTPS extension update endpoint에서 위 확장 ID의 CRX를 다운로드했다. 로그인·쿠키·사용자 설정을 전송하지 않았으며 확장을 설치하지 않았다. HTTP200, `application/x-chrome-extension`, 207275 bytes, CRX SHA-256 `2ddb5415bf128682a1bdf8d6622ea873567097da10a6e7f055d5f712b4d918f5`다. 기존 제출 ZIP의 SHA-256도 다시 확인해 위67ae… 기준과 일치했다.

CRX3의 magic·version3·1310-byte header 경계와 이번 파일의 signed data에 선언된 확장 ID를 확인했다. 구조는 [Chromium CRX3 정의](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/crx_file/crx3.proto)를 참고했다. 이는 이번 파일의 선언 ID/구조 확인이며 독립 CRX 서명·publisher trust chain 검증이 아니다. Chrome의 실제 설치 수용과 구분한다.

128 entries·2MiB 상한으로 ZIP을 읽고, 중복·경로 탈출·link entry를 거부한 뒤 새 private 경로에만 압축 해제했다. 원본 ZIP·기존 후보·root dist·사용자 프로필은 변경하지 않았다.

| 대조 대상 | 결과 |
| --- | --- |
| 제출 ZIP의 원본58 files | missing0; manifest 외57개 SHA-256 완전 일치 |
| 게시 manifest | version2.13.3·version_name 일치; 추가된 update_url만 제거하면 나머지 필드/값 정확히 동일 |
| 추가 manifest field | `update_url: https://clients2.google.com/service/update2/crx` |
| 게시 package 추가 file | `_metadata/verified_contents.json` 하나, 8043 bytes; 별도 빈 directory entry 존재 |
| 게시 파일 inventory | 59 files, 개발 산출물0 |
| 기존 package 검사기 | MV3·version2.13.3·20 entry resources 통과 |

manifest 원본 SHA-256 `afc29067403d4ef7f05a266141459c7a70fc84e86024d72aa009e30e64f0e04d`, 게시본 `19cb3fb69489937e179de020a9872e5dd33c3ed82db7df4718cc3c5c622b0dec`다. 외부 metadata는 byte 일치에 포함된 원본 파일이라고 표시하지 않는다. 이 대조로 게시 runtime·CSS·locale·라이선스와 원본 배포 기준의 연결을 확인했지만 CRX와 제출 ZIP 자체가 같은 bytes라고 주장하지 않는다.

실제 게시 payload의 파일을 기존 `check-audio-quality.mjs --root ... --label p09-store2133`로 검사했다. fresh headless profile·합성 신호·silent sink에서14 cases·18 transitions·12 alignments, source1·48kHz, qualityFailures0, 138개 output channel summary의 full-scale 초과0이었다. 이는 실제 게시 JS의 소스 주입 합성 검사이며 Chrome 웹 스토어 설치형 검사나 실제 방송 녹음이 아니다.

실행 결과와 다운로드·파일은 private `output/p09-public-20261012152819/`, 합성 보고서는 `output/audio-quality/report-p09-store2133.json`에 보존했다. 공개 문서에는 프로필·실제 설정·다운로드 응답 header를 올리지 않는다.

업데이트/롤백 준비용 기존2.13.2 ZIP도 읽기 전용으로 확인했다: version2.13.2, 54 entries·182930 bytes, SHA-256 `9fcfb10fb54623c519d284ca846995391e5e37f55928c2c4c999bc88a9b93852`. 구 ZIP의 존재는 실제 스토어 업데이트/롤백 성공의 증거가 아니다.

## 신규 설치 승인과 사용자 조작 경계

사용자가 별도 로컬 Chrome 검사용 프로필의 실제 스토어 신규 설치를 승인했다. 게시 권한은 `scripting`, `storage`, `https://chzzk.naver.com/*`, minimum Chrome121이다. 기존 시청 프로필·확장·설정 변경과 Google 로그인·동기화는 승인 범위가 아니며 기존 설치 업데이트와 롤백 변경은 별도 승인 단계다.

기존 Chrome155.0.8059.39를 새 private `fresh-chrome-profile` user-data-dir·disable-sync·no-first-run 옵션으로 실행했다. 최초 제한 환경의 실행은 프로필 초기화를 완료하지 못했고, 승인 범위의 재실행에서 새 Default/Preferences 생성까지 확인했다. 대상 확장 설치 디렉터리는 아직 없었다. 프로필 생성은 실제 스토어 설치 성공의 증거가 아니다.

격리 프로필에는 브라우저 제어 연결이 없고 현재 native UI 조작도 지원되지 않아, 검사용 Chrome 창의 스토어 설치 버튼·설치 확인 창은 사용자 직접 조작을 요청했다. 제어용 확장을 추가 설치하거나 기존 프로필을 대체 사용하지 않았다. 사용자의 설치 완료 보고 후 아래 실제 설치 파일·버전 검증을 수행했다.

## 실제 신규 스토어 설치 파일 검증

사용자가 설치 완료를 보고한 후 같은 격리 프로필의 대상 확장 `2.13.3_0` 디렉터리를 확인했다. 해당 ID의 저장된 설치 기록은 from_webstore=true, version2.13.3, disable_reasons 빈 배열이며 실제 승인 권한은 scripting·storage와 chzzk host뿐이다. 설치 manifest의 공개키로 계산한 ID도 대상 ID와 일치했다. 이는 native 스토어 설치 기록과 파일 확인이며 별도 독립 CRX 서명 검증이나 현재 runtime 상태 확인은 아니다.

기존 package/inventory 검사기는 MV3·version2.13.3·20 entry resources·60 files·개발 산출물0으로 통과했다. 게시 CRX payload59 files 중53개 bytes가 같으며 실행 JS·CSS46개는 모두 byte 일치했다. 빠진 파일은 없고 추가 파일은 Chrome이 생성하는 `_metadata/computed_hashes.json` 하나다.

최초 byte-only assert는 JSON2개·manifest·아이콘3개의 차이 때문에 실패했다. 실패를 PASS로 바꾸지 않고 다음 내용을 별도 검사했다.

- manifest: 설치 시 추가된 공개키 key를 제외한 parsed object의 모든 필드/값이 게시본과 동일. content_scripts의 직렬화 순서 차이는 실제 내용 변경이 아니었다.
- locale2개: en147·ko148 entries의 parsed object 완전 일치.
- 아이콘: 16×16·48×48·128×128 크기 유지. 원시 RGBA의 차이는 남지만 알파·불투명 픽셀 차이0이며 `floor((RGB×alpha+127)/255)`로 비교한 premultiplied RGB도 세 이미지 모두 차이0이었다. 원시 픽셀 byte 일치로 표현하지 않는다.

Chrome의 [sandboxed unpacker](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/browser/sandboxed_unpacker.cc)는 설치 중 공개키 추가·manifest 재저장·이미지/locale sanitizer와 computed hashes 생성을 수행한다. [locale JSON sanitizer](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/browser/json_file_sanitizer.cc)도 JSON을 parse 후 다시 저장한다. 관측한 차이는 이 설치 경로와 일치하며 위 콘텐츠 대조 assert를 최종 재실행해 exit0을 확인했다.

설치 manifest SHA-256은 `ed03743c3d6619c81b25d718cca4f9b0e57bea9b2212a0cf3a06a7b40f20c7ca`다. private `fresh-store-install-summary.json`에 좁은 범위의 검사 결과만 보존했으며 원본 프로필·계정·쿠키·전체 Preferences는 공개하지 않는다. 이 격리 프로필에서의 실제 방송·service worker 현재 동작·오디오 장치 E2E는 실행하지 않았다. 신규 설치가 게시 산출물을 받는 게이트만 충족하며 기존 설치의 업데이트·설정 보존을 대체하지 않는다.

## 체크리스트와 다음 게이트

### 스토어 롤백 준비 — 실행하지 않음

[Google 공식 롤백 안내](https://developer.chrome.com/docs/webstore/rollback)를 확인했다. 플랫폼 롤백은 이전 게시 패키지를 더 높은 새 버전으로 재게시하는 경로이며 새 심사 없이 제공될 수 있다. 반면 임의의 Git commit을 새 ZIP으로 재패키징하는 일반 업데이트는 [업데이트 안내](https://developer.chrome.com/docs/webstore/update)에 따른 별도 제출/심사 경로다. 두 절차를 같은 것으로 취급하지 않는다.

플랫폼 롤백은 pending submission을 취소할 수 있고 저장 데이터 하위 호환성이 필요하므로 검사 목적으로 현재 공개2.13.3을 전 사용자에게 롤백하지 않는다. 실제 실행에는 대상 이전 패키지·새 버전·저장 호환성·미처리 제출 상태와 사용자 승인이 필요하다. 2.13.2의 구 ZIP 존재나 이번 로컬 시험판 파일 복원을 플랫폼 롤백 성공으로 표시하지 않는다. 차기 AF 버전의 이전 정상 기준은 현재 공개2.13.3으로 보존한다.

게시 시각 조회를 위한 기존 Chrome의 전체 열린 탭 조회는 관련 없는 개인 탭 제목/URL 노출 위험 때문에 차단됐다. 전체 목록을 읽지 않았으며 우회하지 않았다. 별도의 콘솔 URL만 직접 열려는 안전한 대안도 Chrome 연결 부재로 진행하지 못했다. 정확한 게시 시각은 사용자가 지정한 항목 화면/게시 완료 시각으로 좁혀 확인해야 하며 현재 날짜 표시를 시각으로 대체하지 않는다.

### 별도 사고: 로컬 시험판 로드 디렉터리 삭제

사용자가 어제 적용된 로컬 시험판이 오늘 제거됐다고 보고했다. 읽기 전용 조사에서 기존 로드 경로인 repository root `dist`의 부재를 확인했다. 2026-10-11 release gates 기록에는 해당 폴더58개 파일을 실제 시험판으로 새로고침·수용한 근거가 있다.

AF01 commit `e36ef120`(2026-10-12 01:06:40 / Asia-Seoul)에 포함된 `production build preserves first-party runtime bytes and excludes developer files` 검사는 실제 repository `dist`에 build 후 `t.after(() => fs.rm(target, { recursive: true, force: true }))`를 등록한다. 작업 기록에는 같은 repository에서 01:06:11부터 package 검사 실행, 01:06:31 성공 출력과 이후 반복 실행이 있다. 격리해야 할 테스트가 사용자 시험판의 로드 파일을 지우는 결함이며 현재도 코드에 남아 있다. 직접 Chrome uninstall을 수행했다는 증거와는 구분하며, Chrome 등록 제거의 정확한 시각·원래 저장 설정 보존은 아직 확인하지 않았다.

P09 새 프로필 생성/설치 단계에서 기존 Chrome 설정을 직접 변경하지 않았다는 설명을 이전 AF 테스트의 파일 보존 보장으로 확대할 수 없다. 원인 파악 전 프로필 혼동을 제시하고 시험판을 건드리지 않았다고 단정한 답변은 부정확했다. INC01 승인 후 테스트 격리 수정과 어제 검증본의 원래 경로 복원을 수행했고, 사용자가 같은 경로의 로컬 시험판 재등록·기존 설정 유지를 확인했다. [복원과 검증 기록](2026-10-12-inc01-installed-dist-preservation.md). 현재 AF 소스의 새 빌드로 기존 시험판을 임의 교체하지 않았으며 이 수용은 구 스토어 설치본 업데이트 검증과 다르다.

사용자는 기존 시청용 Chrome에는 로컬 시험판만 있다고 확인했다. 기존 스토어2.13.2 설치본이 있다는 가정은 철회한다. 로컬 시험판은 변경하지 않으며 구 스토어 설치본의 업데이트·설정 보존은 검증 대상 부재로 미검증이다. 로컬 시험판 reload·구 ZIP 재설치·새 스토어 설치를 native2.13.2→2.13.3 업데이트 성공으로 표시하지 않는다. 새 격리 프로필의 실제 스토어2.13.3은 차기 업데이트 검증 기준으로 보존하되, 다음 변경은 별도 승인 단계다.

- [x] 사용자의 게시 완료 보고.
- [x] 같은 확장 ID의 공개2.13.3 표시 확인.
- [x] 기존 심사 대기 커서를 게시 후 수용으로 이동.
- [x] 실제 게시 CRX 다운로드·제출 ZIP 내용 연결·패키지 검사와 게시 JS 합성 오디오 검사.
- [x] 별도 프로필 신규 설치 승인과 검사용 프로필 생성.
- [x] 새 설치가 실제 게시 산출물을 받는지 확인(사용자 native 스토어 설치+설치 파일/출처/권한·내용 대조).
- [x] 기존 시청 Chrome에는 로컬 시험판만 있고 구 스토어 설치본은 없다는 사용자 보고 반영.
- [ ] 구 스토어2.13.2→2.13.3 업데이트·설정 보존 — 실제 검증 대상 부재로 미검증.
- [ ] 정확한 게시 시각·실제 설치/업데이트 검증 범위·롤백 수용의 최종 증거 고정.
- [ ] 차기 AF 배포 산출물의 AF05-B 수용과 기능 로드맵 해제 결정.

P09는 게시 표시·게시 payload 대조·승인된 격리 프로필의 실제 신규 설치 파일 검증까지 진행했다. 기존 Chrome의 확장 관리 페이지 조회 시도는 브라우저 URL 정책으로 차단됐으며 우회하지 않았다. 이후 사용자가 로컬 시험판만 있다고 확인했으므로 기존 스토어 버전 질문은 종료한다. 남은 구 버전 업데이트 검증은 환경 의존 미검증으로 관리하고 게시 시각·롤백 수용과 차기 업데이트 기준을 정리한다. 확장/설정 변경은 별도로 실행 직전 사용자 확인을 받는다. 전체 완료가 아니며 AF05·F00–F05 동결을 자동으로 해제하지 않는다.
