# 커뮤니티 스토어 배포 준비

2026-10-08. 사용자 요청: 원작자 복귀 전 별도 스토어 등록 검토, 원작자 안내/지원 주소로 혼동되지 않도록 표시명·설명·팝업 링크와 업로드 ZIP 준비, 열어둔 개발자 대시보드 확인. 업로드·심사 제출·공개·원본 PR 수정은 이번 범위에 포함하지 않는다.

## 승인과 작업 분리

사용자는 별도 worktree 대신 현재 폴더의 별도 브랜치를 선택했다. 깨끗한 `796e1c79d5467b29b77c34ea060720d0da821acc`에서 `codex/community-store-preview`를 만들었다. 원본 PR #81의 `codex/chzzk-compatibility-recovery`와 양쪽 main은 그대로 보존한다. 같은 폴더를 이용하므로 로컬 시험판 표시명 확인에는 사용자가 확장을 새로고침해야 한다. baseline Node165/165를 먼저 확인했다.

포크 Issues 활성화를 사용자에게 별도로 물었고 명시적 승인을 받았다. `Do-hyeon/cheese-knife`의 has_issues=true/default_branch=main을 GitHub API로 확인했다. 원본 Issues/계정/메시지/권한은 변경하지 않는다. 배포 브랜치를 푸시한 뒤 포크 홈페이지도 같은 복구판 안내 URL에 맞춘다.

## 대시보드 경계

사용자가 열어둔 개발자 대시보드 탭1개를 발견했다. 해당 탭을 확인하려 했으나 Chrome의 extensions gallery 보호로 스크립팅이 거부됐다. 내부 내용을 조회하거나 클릭·업로드·심사/공개를 수행하지 않았다. publisher 식별자·개인 URL·계정 자료·스크린샷을 이 문서/저장소에 넣지 않는다. native·CDP·다른 프로필·API로 이 제어 제한을 우회하지 않는다. 개발자 등록/결제 완료는 사용자 보고이며 대시보드 내용을 자동 확인한 결과가 아니다.

## 변경 내용

- 한국어 이름: 치즈 나이프 — 커뮤니티 복구판 / 짧은 이름: 치즈 나이프 복구판.
- 영어 이름: Cheese Knife — Community Recovery / 짧은 이름: CK Recovery.
- 두 언어의 짧은 설명에 비공식 커뮤니티 복구판임을 명시한다. manifest의 name/short_name/description 메시지 연결과2.13.2 버전은 유지한다.
- Guide/사용 안내 및 manifest homepage_url은 이 배포 브랜치 README다. default main의 원본 README를 복구판 안내로 잘못 연결하지 않는다.
- Report issue/문제 신고는 활성화한 포크 Issues, Source/소스 코드는 배포 브랜치, Original project/원본 프로젝트는 원작자 GitHub로 명확히 구분한다. 원작자 Website/Discord를 복구판 지원으로 표시하지 않는다.
- footer4개를 ko/en으로 표시하고 번역이 없으면 영어 fallback을 유지한다. HTTPS 외부 링크에는 noopener/noreferrer를 추가했다. README의 원본 사이트·스토어 링크도 원본으로 표시한다.
- 기존 LICENSE/THIRD_PARTY_NOTICES/HLS.js 라이선스·원작자 저작권·아이콘은 유지했다. Firefox의 기존 관련 필드는 보존하되 새 Firefox 등록·검증을 주장하지 않는다. 설정 키/권한/플레이어·미디어·채팅 runtime은 바꾸지 않았다.

## 검증

실제 HTML/JS와 Chrome API 경계 fixture로 새로운 검사4개를 먼저 실행했다. ko/en 비공식 표시명·footer, 홈페이지/안내 일치, 번역 없을 때 링크/설정 유지가 기존 소스에서 모두 예상 RED였다. 최소 변경 후4GREEN 및 기존 설정 UI3개 PASS다. 최종 전체Node169/169/실패0/skip0, Chrome155.0.8059.39 CSS108/108/영상필터17/17,구문/build/source 및 dist package 각v2.13.2/20 entry resources/diff check PASS.

추가 합성 Chrome 팝업 검사는 ko/en2/2다. 각 언어의 새 page에서 실제 popup.html/popup.css/config.js/popup.js를 실행하고,body350/footer326px 및4개 링크가 폭 안에 있음을 확인했다. 사용자의 확장·스토어·계정·설정을 연결하지 않았다. 최초 helper는 같은 page의 setContent 언어 전환 중 preview 대기 timeout이 났다. classic script lexical 전역을 재사용하지 않도록 언어별 새 page로 수정한 뒤2PASS를 확인했으며 최초 helper 실패를 제품 결함/수용 PASS로 세지 않았다.

로그는 ignored output/acceptance/store-baseline-node,store-identity-red/green,store-final-node/css/filter,store-popup-native 및 store-popup-native-fixed.log다. 새 이름/링크의 실제 설치본 수용은 필수 수동 확장 새로고침 뒤 확인해야 한다. 이전 복구의 실제 이벤트·유료 DVR·파티/차단·음질/환경 미검증도 그대로 유지한다.

## ZIP와 제출 전 남은 단계

dist 내용물만 ZIP에 넣어 최상위 manifest.json을 확인하고, manifest 참조 및 모든 파일의 내용 일치·라이선스 포함·소스/의존성/진단/개인 키 제외를 검사한다. 로컬 ZIP 준비는 스토어 업로드/승인을 의미하지 않는다. 파일명/해시는 압축 검증 후 기록한다.

제품 준비 commit `74ba3e679e429b32446d999363b9719737921e0a`의 dist를 `.NET ZipFile.CreateFromDirectory`로 base-directory 없이 압축했다. 파일명은 `cheese-knife-community-recovery-2.13.2-74ba3e6.zip`, 크기182,930bytes/파일54개/SHA256 `9FCFB10FB54623C519D284CA846995391E5E37F55928C2C4C999BC88A9B93852`이다. 최상위 manifest.json 및 ko/en 번역·popup·LICENSE/THIRD_PARTY_NOTICES/HLS.js LICENSE를 확인했다. 모든 archive 파일을 dist의 대응 파일과SHA256으로 대조했고54개 모두 일치했다. ZIP 경로 traversal/backslash/절대경로 및 node_modules/tests/output/scripts/.git/private-key/backup 파일을 거부하는 검사도 통과했다. 기존 ZIP을 덮어쓰지 않았다.

별도 새문맥 읽기 전용 검토자는 `796e1c7`→`74ba3e6`의 이번10개 변경만 검토했다. Critical0/Important0/Minor0, focused settings UI7/7 및 합성 popup2/2를 독립 실행해PASS, immutable diff check도 확인했다. core runtime/권한/설정키/아이콘/라이선스가 변경되지 않은 것을 확인했으며 추가 위임·브라우저/파일/HEAD mutation은 없었다. verdict는 로컬 ZIP 준비 가능이며 스토어 승인/제출/공개의 승인이 아니다.

검토 보류 범위는 실행자가 다음과 같이 유지한다: 대시보드/게시 계정은 플랫폼 차단·사용자 보고의 경계로 남긴다(비용: 계정 준비 누락 가능). 실제 설치본은 수동 새로고침 후 확인한다(비용: 실제 popup/cache·locale 차이 미검출). 스토어 심사·개인정보/이미지/브랜딩/법적 적합성은 별도 후속 검토다(비용: 심사 거절·오해 가능). Firefox/기존 호환성 결함의 재검토는 이번 범위가 아니다(비용: 이전 미검증 환경 유지). ZIP 내용/해시는 위 실행자 검사로만 수용하며 독립 검토자가 압축을 검사했다고 주장하지 않는다.

상세 소개 초안은 로컬 ignored `output/store/Store-listing-ko.txt`에 작성했다. 허위 전체 정상/원작자 승인/개인정보 인증을 주장하지 않으며, 개인정보 처리방침과 스토어 검토를 대신하지 않는다. 다운로드/대시보드에 올리지 않았다.

스토어 등록정보·실제 스크린샷/홍보 이미지·개인정보 처리 안내/권한 이유·제한된 테스트 배포 및 실제 설치본 확인은 후속 단계다. 기존 아이콘을 유지했으므로 게시 전 원본과의 구분·정책/브랜딩도 검토해야 한다. 개발자 대시보드 자동 조작은 차단돼 ZIP 업로드는 사용자가 직접 한다. 심사 제출·공개를 요청받지 않았으므로 수행하지 않는다.
