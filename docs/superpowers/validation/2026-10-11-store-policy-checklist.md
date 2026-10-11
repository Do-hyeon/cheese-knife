# Chrome 패키지와 스토어 정책 준비

2026-10-11 / P04 부분 완료. **Google 심사 승인·정책 적합성 인증이 아니다.** 현행 공식 문서와 로컬 패키지/고지를 대조했고, 실제 개발자 대시보드의 현재 입력·제출 버전·게시 상태는 이번에 확인하지 않았다. 최종 출시 버전과 P06 설치 수용은 미정이다.

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
| 안전·작동 | 일반 회귀/시점별 실제 사례 있음 | P02/P03/G-SEC/P06 미완료. 일반 테스트나 과거 스토어 등록으로 해제하지 않음 |
| 라이선스 | LICENSE·vendor LICENSE·THIRD_PARTY_NOTICES가 후보에 포함됨 | 저작권/출처 유지. 보류 HLS 변경의 검증·고지 근거 완료가 별도 필요 |

권한은 구현 기능에 필요한 최소 범위여야 하며 미래 기능을 위해 미리 늘리지 않는다. 이번 소스 변경은 HTTPS 본 사이트 하나로 축소했으며, API/미디어 데이터 처리가 사라졌다고 설명하지 않는다. [권한 정책](https://developer.chrome.com/docs/webstore/program-policies/permissions)

로컬에서만 처리/저장해도 데이터 처리 고지가 필요하다. 방침이 존재하는 것만으로 실제 처리·대시보드 답변의 정확성이 확인된 것은 아니다. [사용자 데이터 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

## MV3와 원격 코드 범위

manifest는 MV3 `background.service_worker`이며 MV2 `background.scripts/page/persistent`와 Firefox metadata가 없다. 콘텐츠 스크립트와 private HLS는 패키지 파일을 참조한다. API JSON·이미지·미디어 연결과 팝업의 치지직 웹페이지 iframe은 실행 코드 다운로드와 구분한다.

공식 MV3 요구는 기능 논리를 제출 코드에서 확인 가능하게 할 것을 요구하고 원격 코드 실행을 제한한다. 확장 API에서 격리된 iframe 예외도 데이터 정책을 면제하지 않는다. 현재 명세/패키지 구조를 확인한 것이지 보류된 번들 전체나 모든 실제 응답을 검증한 결과는 아니다. [MV3 추가 요구](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)

## 분리 후보 파일 검토

기존 Chrome 분리 후보 v2.13.3: 58개 일반 파일, 합계 592,025 bytes, 20개 진입 참조 자원. 전 파일 SHA-256이 이번 대조의 대응 소스와 일치했다. 목록/해시는 private `output/tool-audit/recovery-backlog/evidence-baseline-2026-10-11.json`에 있다.

포함 범위: manifest, root HTML/JS/CSS·아이콘, web JS/CSS, 25개 styles CSS, ko/en locale, 프로젝트·HLS 라이선스/고지. `node_modules`, 개발 scripts/tests, scanner 설정, output/private 로그, PLANS.md/README/PRIVACY.md는 이 후보의 파일 목록에 없다. 방침·사용안내는 외부 문서 링크로 제공한다. 이는 **현재 후보 목록**의 확인이며 향후 트리나 새 파일의 자동 차단 보장이 아니다.

최종 ZIP은 G-SEC와 P06 이후 같은 후보의 내용만 압축하고, 압축 해제 후 파일 목록/해시를 다시 대조한다. 아직 새 ZIP을 만들지 않았으며 기존 2.13.2 ZIP을 차기 출시 산출물로 재사용하지 않는다.

## 버전·링크·스토어 갱신 순서

1. G-SEC 준비가 가능해진 시점에 실제 GitHub와 스토어의 게시/제출 버전·채널·심사 상태를 조회한다. 현재 preview 2.13.3을 최종 버전으로 단정하지 않는다.
2. 게시/제출 버전보다 높은 버전을 package·lock·manifest와 표시명에 일치시키고 **설치 수용 전에** 후보/도구 증거를 갱신한다. 기존 POSIX `postversion`을 Windows에서 무작정 실행하지 않는다.
3. 같은 최종 후보로 P06을 완료하고 공개 조건을 확인한다. 이후 소스/버전 변경은 P04→G-SEC→P06으로 돌린다.
4. 승인된 공개 단계에서 main 문서가 실제 최신 내용으로 보이는지 조회하고 나서 스토어 Privacy practices의 URL을 별도로 바꾼다. 새 package 업로드만으로 고지 필드가 자동 수정된다고 가정하지 않는다.
5. 새 패키지 업로드·메타데이터 변경·심사 제출·실제 게시를 별도 상태로 남긴다. review cancel/auto publish 변경은 임의 수행하지 않는다. [공식 업데이트 절차](https://developer.chrome.com/docs/webstore/update)

목표 URL은 `https://github.com/Do-hyeon/cheese-knife/blob/main/PRIVACY.md`이다. 기존 `codex/community-store-preview` 방침 URL/브랜치는 구버전을 위해 보존한다. 로컬의 최신 문서를 이미 main에 공개했다고 설명하지 않는다.

## 환경 미확인

실제 file symlink 생성은 EPERM으로 미검증, 실제 junction 사례는 검사했다. Windows 개발자 모드/관리자 권한을 자동 활성화하지 않는다. Chrome121 실측도 별도 환경이 필요하다. 현행 121 지원 선언을 높이거나 한계를 출시에서 받아들일지 임의 결정하지 않는다. 이 환경 결정을 필요 시 묶어 요청하고, 단순 “진행”을 환경 검사 PASS로 기록하지 않는다.
