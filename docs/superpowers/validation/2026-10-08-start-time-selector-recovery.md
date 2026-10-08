# 시작 시각 선택자 복구 — 설치본 수용 대기

2026-10-08. 사용자가 현행 live/VOD 연결점만 추가하고 기존 조회·캐시·취소·URL 검증을 유지하는 제한 수정을 승인했다. 기준76cc0af, 시험판v2.13.2다. [실제 연결점 조사](2026-10-08-installed-remaining-function-checks.md)에 근거하며, 전체 기능/PR 완료 판정이 아니다.

## 원인과 최소 변경

현재 live/VOD 페이지의 옛 `video_information_count__`/`video_card_item__` 연결점은0개였다. 공개 DOM에서 live 시청자 수는main 안의data 직접 자식strong/count, VOD 날짜는area/information 직접 자식의 마지막span/item을 확인했다. live의 기존React adapter가openDate를 반환했고, VOD의 기존API HTTP200/code200/liveOpenDate 계약과 기존parent.parent anchor의 동일VOD URL을 확인했다. 원문React 객체나응답 전체를 기록하지 않았다.

`web/inject.js`의`bindStartTimes`에 두 선택자를 추가했다. 현재live 선택자는route=live에서만 기존React 날짜 조회로 분기하고, span 경과시간/p 팔로워/일반count는 선택하지 않는다. VOD는현재area/information/direct last-span으로 한정한다. legacy 선택자·기존cache/5초timeout/pending 중복억제·scope abort·같은origin/video 경로확인·응답 시href/연결/scope 검증·limited 보고를 유지한다. 새API fallback, 타이머/observer, 권한, 저장설정, 통계계산은 추가하지 않는다.

## 테스트와 빌드

production listener/adapter 검사8개를 추가하고, 원격HTTP 경계만 대체했다. 수정 전8개 중6개가 원인에 맞게FAIL했다(tooltip/state undefined, request0). 비live/외부URL 보호2개는 기존동작 characterization으로PASS했다.

- 현재live viewer/count의ancestor metadata 읽기, 네트워크fallback 없음, 경과시간/팔로워/다른count 보존, route정리.
- live metadata 부재의limited 보고와 비live route 보존.
- 현재VOD 날짜 표시/조회수 항목보존/새카드의 동일VOD cache 사용.
- foreign/nonvideo URL 거부, 늦은href변경 응답거부, route변경 abort+응답거부, metadata부재limited.

최소수정 후 신규8개+기존legacy3개11/11, 전체Node109/109 PASS. nativeCSS40/40도 재실행PASS했다. build/source+dist package v2.13.2/20 entry resources, diff check PASS. source/dist inject.js SHA256은`FE42B7CD63446B97390A1FEFBEBF3398551D9590C7AA1BA95C38ACD02E27A85A`로 동일하다. generated dist만 재생성했고 새dependency나도구를 설치하지 않았다.

재현: `node --test tests/*.test.cjs`, `node scripts/check-styles.mjs --chrome`, `node scripts/build.mjs`, `node scripts/check-package.mjs`.

## 다음 게이트

새 후보의 실제installed hover/날짜표시/재진입/cache/route정리는 아직 검사하지 않았다. 기존 설치본에 새coordinator를 중복실행하거나 옛DOM을 새것처럼 꾸며PASS로 판정하지 않는다. 로컬시험판 확장을 직접 새로고침할 수 없는 도구제한을 유지하므로 수동 확장 새로고침 후 실제live/VOD를 검사한다. 그 필요단계에서 중지하고PR을 열지 않는다.
