# Chrome 패키지와 스토어 정책 준비

2026-10-11 / P04·정의된 G-SEC 로컬 범위·P06 설치 수용 완료, [PR #2](https://github.com/Do-hyeon/cheese-knife/pull/2) 공개 상태. **Google 심사 승인·정책 적합성 인증이 아니다.** 현행 공식 문서와 로컬 패키지/고지를 대조했지만 개발자 대시보드의 현재 입력·심사 상태는 이 문서 갱신에서 다시 확인하지 않았다. 병합·태그·릴리즈·스토어 교체는 별도 승인 전 수행하지 않는다.

## 정책 대조

공식 정책은 단일 목적, 정확한 표기·고지, 최소 권한과 동작하는 기능을 요구한다. 아래는 그 요구를 현 프로젝트에 적용한 준비 항목이며 Google의 판정이 아니다. [프로그램 정책](https://developer.chrome.com/docs/webstore/program-policies/policies), [품질 지침](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines)

| 항목 | 확인한 로컬 사실 | 출시 전 남은 조건 |
| --- | --- | --- |
| 단일 목적 | 치지직 live/VOD의 시청 편의. preview·오디오·필터·채팅·화면 설정을 그 범위로 설명 | 실제 스토어 설명/기능·스크린샷이 같은 범위를 정확히 표현해야 함. 후속 F기능을 이미 제공한다고 쓰지 않음 |
| 지원/정체성 | ko/en에 비공식 커뮤니티 복구판 명시, 원본·포크 링크 분리, Chrome 전용 | 현재 스토어 표기와 권리/고지 최종 확인. 원작자·NAVER의 공식/승인 제품으로 표현하지 않음 |
| `storage` | 확장 전용 설정과 저장 순번, `storage.local` 사용 | 실제 방침과 대시보드 설명 일치. site localStorage의 Gain/너비와 구분 |
| `scripting` | 선택 스타일의 동적 CSS 등록/갱신/소유 ID 해제 | 실제 기능에 필요한 권한으로 설명, 원격 실행 코드 용도로 표현하지 않음 |
| host permission | 소스의 선언·요청·조회와 정적/동적 주입은 `https://chzzk.naver.com/*` 하나. MAIN 페이지 코드의 API 요청은 별도 API host grant를 사용하지 않으며 HTTP·전체 서브도메인을 요청하지 않음 | 로컬 계약/회귀와 실제 설치본의 live/VOD/API/미리보기 수용을 구분. 이 축소만으로 정책 준수 PASS 아님 |
| 데이터 고지 | PRIVACY.md에 로컬 채팅/식별자/주소/조작/콘텐츠/설정 처리, 서비스·미디어 요청과 세션 가능성, 저장·삭제·공개 Issues 주의 설명 | 실제 Dashboard 체크/권한 이유/방침 URL readback을 완료해야 함. “개발자에게 업로드 없음”과 “데이터 처리 없음”을 혼동하지 않음 |
| 안전·작동 | 전체 회귀 605/605, HLS 전용 97/97, package v2.13.3/20자원, 설치 수용 완료 | 모든 방송·GPU·네트워크·계정 조합이나 모든 취약점 부재로 확대하지 않음 |
| 라이선스 | LICENSE·vendor LICENSE·THIRD_PARTY_NOTICES가 후보에 포함되고 고정 HLS 원본·재생성 provenance를 기록 | 저작권/출처 유지. P03 로컬 완료를 HLS 전체 보안·모든 실제 스트림 수용으로 표현하지 않음 |

권한은 구현 기능에 필요한 최소 범위여야 하며 미래 기능을 위해 미리 늘리지 않는다. 이번 소스 변경은 HTTPS 본 사이트 하나로 축소했으며, API/미디어 데이터 처리가 사라졌다고 설명하지 않는다. [권한 정책](https://developer.chrome.com/docs/webstore/program-policies/permissions)

로컬에서만 처리/저장해도 데이터 처리 고지가 필요하다. 방침이 존재하는 것만으로 실제 처리·대시보드 답변의 정확성이 확인된 것은 아니다. [사용자 데이터 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

## MV3와 원격 코드 범위

manifest는 MV3 `background.service_worker`이며 MV2 `background.scripts/page/persistent`와 Firefox metadata가 없다. 콘텐츠 스크립트와 private HLS는 패키지 파일을 참조한다. API JSON·이미지·미디어 연결과 팝업의 치지직 웹페이지 iframe은 실행 코드 다운로드와 구분한다.

공식 MV3 요구는 기능 논리를 제출 코드에서 확인 가능하게 할 것을 요구하고 원격 코드 실행을 제한한다. 확장 API에서 격리된 iframe 예외도 데이터 정책을 면제하지 않는다. 현재 명세·패키지 구조와 P03에서 고정 번들의 제한된 파서 경계를 확인했지만, 번들 전체의 보안이나 모든 실제 응답을 검증한 결과는 아니다. [MV3 추가 요구](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)

## 분리 후보 파일 검토

최종 Chrome 분리 후보와 root `dist` v2.13.3: 각각 58개 일반 파일, 합계 599,793 bytes, 20개 진입 참조 자원. 2026-10-11 재대조에서 상대 경로·SHA-256이 58/58 일치했고 package 검사를 통과했다. 목록/해시의 원시 근거는 공개 패키지에 넣지 않는 private 검사 산출물에 보존한다.

포함 범위: manifest, root HTML/JS/CSS·아이콘, web JS/CSS, 25개 styles CSS, ko/en locale, 프로젝트·HLS 라이선스/고지. `node_modules`, 개발 scripts/tests, scanner 설정, output/private 로그, PLANS.md/README/PRIVACY.md는 이 후보의 파일 목록에 없다. 방침·사용안내는 외부 문서 링크로 제공한다. 이는 **현재 후보 목록**의 확인이며 향후 트리나 새 파일의 자동 차단 보장이 아니다.

최종 ZIP은 PR #2의 승인된 병합 커밋이 확정된 뒤 그 커밋에서 다시 만든 같은 내용만 압축하고, 압축 해제 후 파일 목록·해시를 검증 후보와 다시 대조한다. 아직 새 ZIP을 만들지 않았으며 기존 2.13.2 ZIP을 차기 출시 산출물로 재사용하지 않는다.

## 버전·링크·스토어 갱신 순서

1. PR #2의 리뷰·병합 승인을 별도로 확인하고, 병합 뒤 정확한 `main` 커밋을 배포 기준으로 고정한다.
2. 그 커밋에서 v2.13.3 build·전체 회귀·package·후보 동일성을 다시 확인한다. 소스나 버전이 바뀌면 P04→G-SEC→P06으로 돌아간다. 기존 POSIX `postversion`을 Windows에서 무작정 실행하지 않는다.
3. 같은 검증본으로 최종 ZIP을 만들고 파일명·크기·SHA-256·압축 해제 뒤 58/58 동일성을 기록한다.
4. `main`의 README·PRIVACY 문서가 익명 접근에서도 최신 내용으로 보이는지 확인한 뒤 스토어 Privacy practices URL을 별도로 바꾼다. 새 package 업로드만으로 고지 필드가 자동 수정된다고 가정하지 않는다.
5. 현재 스토어 게시/제출 버전·채널·심사 상태를 다시 읽고, 새 패키지 업로드·메타데이터 변경·심사 제출·실제 게시를 서로 다른 상태로 남긴다. review cancel/auto publish 변경은 임의 수행하지 않는다. [공식 업데이트 절차](https://developer.chrome.com/docs/webstore/update)

목표 URL은 `https://github.com/Do-hyeon/cheese-knife/blob/main/PRIVACY.md`이다. 기존 `codex/community-store-preview` 방침 URL/브랜치는 구버전을 위해 보존한다. PR #2가 열렸다는 사실을 `main` 공개 완료로 설명하지 않는다.

## 환경 미확인

실제 file symlink 생성은 EPERM으로 미검증이고 실제 junction 사례는 검사했다. Windows 개발자 모드/관리자 권한을 자동 활성화하지 않는다. 격리 Chrome 121에서는 MV3 worker·설정 준비·live route·controls·page error 0을 확인했으며 Chrome 155에서는 객관 오디오와 설치 통합을 확인했다. 이를 모든 Chrome 121 환경·업데이트 경로·장치 조합의 합격으로 확대하지 않는다.
