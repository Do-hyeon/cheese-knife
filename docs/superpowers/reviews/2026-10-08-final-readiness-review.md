# 후속 전체 브랜치 readiness 독립 검토

2026-10-08. immutable range `5ccb2bfdb660534c6fb64ceda511124ae3784416` → `99cba9014a61024267b733862cc7cac05910a93e`. 새문맥읽기전용검토자1명,추가위임/작업트리·HEAD·dist·사용자브라우저변경없음. 이전전체검토와보완의해결된발견사항을다시열지않고후속변경/기능간계약/남은수용조건을검토했다. 현재보고서는구현자의검토결과기록이며아래발견사항을아직수정하지않았다.

## 강점

설정bridge와기능scope분리,미리보기취소·보호영상거부,Gain초기화·재사용회귀가있다. 사이드바고유식별은부분로딩시위치오인에의한오숨김을제거한다. 새필터CSS는nativePZP파이프라인을보존하며한번적용한다. 이전Important보완을현재열린결함으로재등록하지않았다.

## 발견 사항

Critical은확인하지않았다. 아래줄번호는검토HEAD기준이다.

| 등급 | 위치 | 제품 모듈 재현 / 사용자 영향 | 필요한 보완 |
| --- | --- | --- | --- |
| Important P2 | web/inject.js:303,316 | 초기offlineanchor `/채널ID`에listener없음.같은anchor의href만 `/live/채널ID`로바꾸면hover호출0/drag knife-data없음;동일anchor를새노드로교체하면각1/payload있음 | existingobserver의href변경에서현재validliveanchor를attach;WeakSet중복과현재URL검증유지 |
| Important P2 | web/inject.js:342 | 같은VODcard/date의123조회성공A-start후href만456으로바꾸면재hover도A-start/요청은123만 | ownedtooltip을VOD ID와묶어재사용시무효화·재조회.외부표지/TTLcache/취소·늦은응답보호보존 |
| Minor P3 | web/player.js:185 | pointerdown→pressToFastForwardOFF→550ms에rate2/indicator있음 | pending/activehold의OFF취소와시작직전옵션검사.선택적보완은사용자짧은설계승인으로명시적으로요청될때수행 |

구현자는해당production코드의observer/초기tooltipreturn/timer조건을읽어재현원인과대조했다. 새로운회귀테스트파일이나제품수정은짧은설계승인전작성하지않는다. 성공후VODnode재사용의실제사이트발생빈도는독립검토에서확인하지않았다. 합성제품모듈에서의재현과실서비스발생증거를분리한다.

## 독립 검증과 실행자 추가 검증

검토자Node결과는122중120PASS/2환경오류였다. `portable build contains referenced vendor and its license but not backups`, `build refuses a target outside its repository dist directory`가sandbox임시경로realpathEPERM으로실패했다. 소스제품결함이나PASS로바꾸지않는다. 검토자source/distpackage각v2.13.2·20resources와diffcheck는PASS다.

실행자는경로안전장치를바꾸지않고승인된검증권한으로현재전체Node122/122를새로실행했다. 별도nativeCSS91/91/필터17/17,source/distpackage각20resources/diffcheck도새로PASS였다. 이green검사에는위새발견사항을검출할회귀가아직없으므로결함을상쇄하지않는다. 보완뒤각RED→GREEN과전체suite가필요하다.

검토HEAD뒤의설치본필터원복은bodyOFF/SVG0/wrappernone/native보존과별도homeMAIN의1/1/1/1/0으로확인했다. 원복방송읽기ready0을재생PASS로세지않았다. 실제homepage fullnav/back에서pagehide/pageshow persistedtrue/같은runtime/미리보기정리,복귀뒤다시hover한preview의time29.98→39.96·ready4/이탈정리를확인했다. 이것은전체bfcache/route/stream조합이아닌한기본사례다. 상세는 [후속 설치 검사](../validation/2026-10-08-restored-settings-and-runtime-checks.md)에있다.

## 미완료 수용 조건

- 삭제채팅showDeleted는JSX-adapter-unavailable이며미구현이다.실제후원type10의의미/mission·party·blocked대상이확인되지않았다.통계bitrate/latency는알수없음이다.
- 허용DVR은사용자미결제로실제수용불가.결제/우회없이미검증을유지한다.
- 작은화면/전체화면/PIP/스타일조합의모든경계,미디어교체·장기GC/보호소스,모든bfcache조합은닫히지않았다.이전기본수용기록을전면보장으로확대하지않는다.
- 새보완dist가필요하면수동확장새로고침게이트에서중지한다.모든요청된검사·조치완료전기여PR을열지않는다.

## Declined to judge 및 실행자 처리

| 검토자가판단하지않은범위 | 실행자처리 / 잘못판단할때비용 |
| --- | --- |
| 전체minifiedvendor/모든보조진단내부 | 기존hash/라이선스·패키지와실행검증은유지하되전부코드검토했다고주장하지않음 / 미검토라이브러리·진단오류가능 |
| 사용자GPU/실제음질 | 합성픽셀·무음신호/사용자기본청취와한계를분리 / 실제화질·클리핑·청취문제미검출가능 |
| Firefox | Chrome복구가Firefox검증을대체하지않음 / 다른브라우저회귀미검출가능 |
| 미관측광고·보호소스/사이트node재사용빈도 | 현재합성경계/관찰만기록하고실제로조작·우회하지않음 / 희귀실서비스연결점문제미검출가능 |

검토결론은 **기여PR준비완료아님 / 전체기능정상선언준비완료아님** 이다. 코드발견사항과수용공백이남았다. Date.now기반hoverdeadline의시스템시각영향도기존deferredMinor로유지한다.

## 짧은 bounded 보완안 — 승인 대기

기존 `web/inject.js`에서href변경에대한sidebar연결과VOD ID별ownedtooltip무효화를보완한다. 새observer/권한/설정키/API는추가하지않고현재cache·취소·외부표지보호를유지한다. `web/player.js`의옵션OFF중pending/activehold취소는Minor지만사용자가이묶음을명시적으로승인할때선택적보완에포함한다. 먼저각제품모듈회귀를RED로재현하고하나의보완패스에서GREEN/전체회귀/native/build/package/installed검사를한다. 추가reviewer나같은해결범위재검토는요청하지않는다. 승인전에는후보코드/테스트/dist를바꾸지않았다.
