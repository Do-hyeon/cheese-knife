# HLS 국소 보완의 결정론적 검증 설계

작성일: 2026-10-11 / Asia-Seoul
상위 계획: [PLANS.md](../../../PLANS.md)의 P03
대상: 고정된 HLS.js 1.6.16과 `parser-bounds-v1` 후보

## 목적과 승인된 방향

사용자가 승인한 방향은 고정된 HLS.js 배포본의 네 파서 경계만 국소 보완하고, 원본 해시·재생성 이력·정상 호환성을 함께 검증하는 것이다. 모델의 취약점 없음 판정이나 외부 소스 전송을 근거로 사용하지 않는다. 대신 고정 입력, 시간·메모리 상한, 원본/후보 대조, 실패가 보존되는 자동 증거로 알려진 위험 경계를 확인한다.

성공 상태는 다음과 같다.

- 공식 고정 배포본의 버전과 SHA-256이 예상값과 정확히 일치한다.
- 변환 anchor가 각각 정확히 한 번 존재하고 같은 입력으로 같은 후보가 생성된다.
- 알려진 malformed 입력은 정해진 거부 또는 optional metadata drop 계약으로 제한 시간 안에 종료한다.
- 정상 LL-HLS·fMP4·ID3·비 NAL codec 입력은 손상되지 않고 고정 기대값 및 원본의 정상 결과와 일치한다.
- 검사·후보 생성은 격리된 새 출력 폴더에서만 수행하고 현재 `vendor`, root `dist`, 보호 고지를 바꾸지 않는다.
- 실패·timeout·환경 미검증은 pass로 변환하지 않는다.

이 성공은 아래 네 경계와 재생성 provenance에 한정한다. HLS 전체 구현의 취약점 없음, 실제 네트워크·MSE 디코딩·장시간 무중단 재생 또는 설치본 합격을 의미하지 않는다.

## 현재 기준선

| 항목 | 고정값 |
| --- | --- |
| npm package | `hls.js@1.6.16` |
| 공식 `dist/hls.light.min.js` SHA-256 | `947b45be1392e39569d4aefc2cff9ff6ecbe6cc246cf67ab12ece0c41c24b793` |
| hardening revision | `parser-bounds-v1` |
| 현재 후보 SHA-256 | `c1cc9625556ea5df10f1f0fc7755cbd11efa83e711ea7c5aa9cac758a25d8347` |
| 변환 정의 | `scripts/hls-hardening.mjs` |
| 격리 재생성기 | `scripts/vendor-hls.mjs`를 복사한 임시 root에서 실행 |

현재 후보는 미커밋 보호 범위다. 서면 사양·계획 승인 전에는 HLS 전용 검사, 번들 재생성, 보호 파일 수정 또는 root `dist` 갱신을 하지 않는다.

## 위험 경계와 계약

### 1. LL-HLS `EXT-X-SKIP`

`SKIPPED-SEGMENTS`는 십진 정수 문자열이어야 하고 안전한 정수 범위 안에서 0 이상 10,000 이하여야 한다. 같은 playlist의 두 번째 `EXT-X-SKIP`은 첫 번째 결과를 확장하거나 다시 placeholder를 할당하지 않고 parsing error로 종료한다. 음수·분수·혼합 문자열·10,001 이상은 placeholder 할당 전에 거부한다.

### 2. MP4 `emsg`

version은 0 또는 1만 허용한다. 고정 필드 길이를 먼저 검사하고 `scheme_id_uri`와 `value`의 NUL 종료 문자열은 각각 최대 4,096 byte 범위 안에서만 찾는다. 종료 문자가 없거나 범위를 넘으면 optional metadata를 만들지 않는다. 정상 ID3 event의 payload는 유지한다.

### 3. MP4 `tfhd`·`tfdt`·`trun`과 optional NAL metadata

선택된 track의 `tfhd`는 정확히 하나이며 flags가 요구하는 optional field가 box 범위 안에 있어야 한다. `tfdt`와 `trun` 고정 필드·record 폭·sample count를 실제 box extent와 대조한다. 선택 track 전체 sample work budget은 100,000이다.

sample byte offset은 원본 ArrayBuffer가 아니라 현재 view의 byteOffset을 포함해 계산한다. sample extent와 누적 optional metadata scan은 실제 입력 범위 안이어야 하며, byte budget은 최대 16 MiB와 입력 크기의 네 배 중 작은 값이다. NAL 반복 상한은 100,000이고, NAL 길이·payload가 sample extent 안에 있어야 한다. NAL 기반 optional caption scan은 `avc1`, `avc3`, `hvc1`, `hev1`, `dvh1`, `dvhe`에만 적용하며 VP9·AV1 같은 비 NAL codec은 opaque sample로 유지한다.

필수 run record가 잘못되면 `KNIFE_HLS_INVALID_INPUT`으로 거부한다. optional caption/metadata만 범위를 넘으면 `KNIFE_HLS_OPTIONAL_METADATA_BOUNDS`를 내부적으로 사용해 빈 optional 결과를 반환하고 pass-through media를 중단하지 않는다.

### 4. 공유 ID3 parser

한 tag payload는 최대 1 MiB, 한 입력의 frame은 최대 4,096개다. tag·extended-header·frame 크기는 현재 tag 끝을 넘지 않아야 한다. padding은 남은 tag 범위 전체가 0일 때만 허용한다. 잘못된 tag는 빈 frame 또는 timestamp 없음으로 종료하고 인접 tag나 이후 입력을 범위 밖에서 읽지 않는다. 고정 upstream parser의 10-byte extended-header 해석은 호환성 계약으로 유지한다.

## 검증 구조

### 격리 verifier

새 `scripts/verify-hls-candidate.mjs`는 영숫자 실행 ID 하나를 받고 `output/tool-audit/hls-validation-<id>/`만 소유한다. 기존 폴더, root `vendor`, root `dist`를 덮어쓰지 않는다.

검증 순서는 다음과 같다.

1. 현재 HLS 보호 네 파일과 root `dist` 전체 해시를 기록한다.
2. package version, 공식 배포본 SHA-256, license를 검사한다.
3. 필요한 vendoring 입력만 새 격리 root에 복사한다.
4. 격리 root에서 `scripts/vendor-hls.mjs`를 두 번 실행한다.
5. 두 출력 byte가 같고 현재 보호 후보와도 같은지 확인한다. 다르면 어떤 파일도 승격하지 않고 실패한다.
6. 격리 후보 경로를 `KNIFE_HLS_TEST_BUNDLE`로 전달해 bounds·compatibility 검사를 실행한다.
7. provenance 검사는 변경 upstream bytes·version·transform anchor에서 기존 후보를 보존하며 실패하는지 확인한다.
8. 실행 명령·Node/package 버전·입력/후보/보호 해시·각 검사 exit·timeout·test count·한계를 JSON으로 기록한다.
9. 처음 기록한 보호 해시와 root `dist` inventory를 다시 대조한다.

verifier 자신이 timeout되거나 child output이 잘리거나 JSON이 잘못되거나 입력 해시가 실행 중 바뀌면 exit 2다. 완전 실행 후 검증 실패는 exit 1, 모든 P03 계약을 충족하면 exit 0이다. 빈 검사 목록은 exit 2다.

### child parser 경계

실제 후보의 private consumer를 test-only VM seam으로 호출한다. packaged artifact에는 hook을 추가하지 않는다. child process는 192 MiB heap, 5초 process timeout, 64 KiB output 상한을 사용한다. 각 VM 실행은 250 ms 안에 끝나야 한다. timeout, crash, output overflow는 거부 성공이 아니라 검사 실패다.

네 경계별로 `limit-1`, `limit`, `limit+1`, truncated, duplicate, subview/offset, shared-data 입력을 둔다. 큰 반복 입력은 process/VM 상한 아래에서 결정론적으로 생성하고 네트워크를 사용하지 않는다.

### 정상 호환성

정상 사례는 테스트 코드에 손으로 고정한 기대값을 사용한다. 원본 parser와 후보 parser 모두 같은 기대값을 만족해야 하며, 한쪽 결과를 다른 쪽의 oracle로만 사용하지 않는다.

필수 정상 사례는 다음과 같다.

- LL-HLS delta placeholder와 일반 media fragment
- emsg version 0/1의 종료 문자열과 복수 event
- defaulted sample timing과 passthrough remux
- multi-run·shared sample·typed-array subview
- AVC/HEVC optional metadata와 VP9/AV1 opaque sample
- ID3 text·padding·인접 tag·고정 extended-header 해석

실제 MSE 재생, 미리보기 hover, 화질 전환, 음량과 네트워크 복구는 P06 설치본 수용 범위다. parser 검사가 이를 대신하지 않는다.

## 공격적 반례 검토

모델 보안 판정 대신 다음 반례가 영구 테스트로 유지돼야 한다.

- 상한 비교 하나를 제거하거나 `limit+1`로 완화하면 해당 boundary test가 실패한다.
- 필수 run record 거부를 optional drop으로 바꾸면 remux malformed test가 실패한다.
- optional metadata drop을 전체 media 거부로 바꾸면 정상 pass-through test가 실패한다.
- byteOffset 보정을 제거하면 subview 사례가 실패한다.
- NAL codec allowlist를 제거하면 VP9/AV1 opaque sample 사례가 실패한다.
- source hash, dependency version, transform anchor 또는 license가 바뀌면 provenance 검사가 artifact를 쓰기 전에 실패한다.
- 실제 candidate가 아닌 root bundle을 실수로 검사하면 evidence의 bundle hash/path 검사가 실패한다.

변형은 격리된 메모리 또는 새 출력 root에서만 만들며, 대규모 allocation이나 무한 반복을 실제로 실행해 성공을 증명하지 않는다. 위험 입력은 작고 경계가 명확한 반례와 독립 timeout으로 검사한다.

## 오류 처리와 증거

최종 증거는 `output/tool-audit/recovery-backlog/p03-hls-verification-2026-10-11.json`에 저장한다. 다음 필드는 필수다.

- source commit/branch와 dirty HLS file 목록
- package/version/original hash/hardening revision/candidate hash
- 각 변환 anchor 개수
- child process timeout·heap·output 상한
- bounds/provenance/compatibility test 명령·exit·test count
- 실패 사례 ID와 기대한 reject/drop/pass 계약
- 실행 전후 보호 네 파일과 root `dist` inventory/hash
- 격리 candidate 위치와 현재 보호 후보 byte 비교
- known limitations와 P06로 넘기는 실제 재생 범위

과거 실패 로그는 삭제하거나 새 성공으로 덮어쓰지 않는다. 새 실행은 새 ID 폴더를 사용한다. 보고서 생성 도중 실패하면 부분 보고서를 `incomplete`로 남기고 P03을 완료하지 않는다.

## 완료·중단 기준

P03을 `DONE-LOCAL`로 바꾸려면 다음 조건이 모두 필요하다.

- 원본·후보·license provenance 검사가 통과한다.
- 네 malformed 경계와 정상 호환성 검사가 fail/cancel/skip 0으로 통과한다.
- 공격적 반례가 각 보호 경계를 실제로 깨뜨리는 변경을 탐지한다.
- 격리 후보와 현재 보호 후보 byte가 같고 실행 전후 보호/root `dist` 해시가 같다.
- 실행 중 입력 snapshot이 변하지 않는다.
- 환경 미검증·timeout·도구 실패가 없다.
- 결과 문서가 HLS 전체 보안 또는 실제 재생 합격으로 확대되지 않는다.

하나라도 만족하지 못하면 P03은 `DOING` 또는 해당 `BLOCKED-*` 상태를 유지한다. 유효한 실패가 현재 hardening 결함을 보여 주면 먼저 RED를 보존하고 최소 수정·격리 재생성·전체 P03 회귀를 수행한다. root 보호 후보 갱신은 새 candidate bytes와 고지·provenance가 모두 일치할 때만 허용한다.

## 고려한 대안

### A. 고정 버전의 격리·결정론적 검증 — 선택

현재 승인된 네 경계를 직접 검사하고 정상 호환성·재현성·보호 해시를 함께 남긴다. 알려진 범위에 가장 강한 근거를 제공하면서 외부 전송과 제품 산출물 오염을 피한다.

### B. HLS.js 버전만 교체

버전 변경 자체는 네 입력 경계가 해결됐다는 증거가 아니며 미리보기 API·번들 형태·정상 스트림 회귀 범위를 크게 넓힌다. 별도 upgrade 제안으로만 다룬다.

### C. HLS.js fallback 제거

보호 후보를 제거할 수 있지만 Chrome의 native HLS `maybe`가 실제 재생하지 못했던 기존 관찰과 충돌하고 사이드바 미리보기 기능을 후퇴시킨다. 현재 요구와 맞지 않는다.

## 비목표

- GPT, Daybreak, Gemma 또는 다른 모델의 취약점 없음 판정
- 외부 서비스로 source/diff/test fixture 업로드
- HLS 전체 source-to-sink 감사 또는 알려지지 않은 취약점 탐지 보장
- root `dist` 재빌드, 확장 새로고침, 스토어 제출, release, PR, commit
- 실제 방송 URL·사용자 계정·유료 타임머신·녹음 데이터 사용
- P06 설치본 미리보기·오디오·네트워크 수용을 parser 검사로 대체

## 구현·검증 결과

2026-10-11 기준 이 사양의 결정론적 검증 경로를 구현했고 P03을 `DONE-LOCAL`로 판정했다.

- 고정 HLS.js 1.6.16 원본·license·변환 anchor provenance와 두 번의 격리 재생성이 일치했다.
- 최초 검토에서 발견된 입력 fixture·후보 drift, TAP 완전성·중첩 실패 분류, emsg 검색·ID3 short tail, absolute byte/NAL 반례의 Important 8건을 한 번의 TDD 묶음으로 보완했다.
- SKIP, emsg, selected-run/sample/NAL, ID3 경계와 safe negative control을 포함한 P03 전용 검사는 97/97 통과했다.
- 최종 verifier `p03finalfix20261011a`는 `complete-pass`/exit 0이며, report는 `output/tool-audit/hls-validation-p03finalfix20261011a/report.json`에 보존했다. 최초 `p03final20261011a`는 검토 전 근거로 보존하되 최종 판정에 사용하지 않는다.
- HLS를 포함한 전체 Node 회귀는 586/586 통과했고 실패·취소·skip·todo는 0이었다.
- 새 격리 Chrome 후보 `output/tool-audit/p02-candidate-p03fixgate20261011a/chrome-candidate/dist`는 58개 파일과 20개 진입 자원의 package 검사를 통과했다. 경로의 `p02-candidate-` 접두사는 기존 후보 도구의 출력 규칙이며 P02 결과를 뜻하지 않는다.
- 보호 후보·license·고지와 root `dist`의 58개 파일 inventory는 검증 전후 일치했다. root `dist`는 재빌드하지 않았다.
- 영구 근거는 `output/tool-audit/recovery-backlog/p03-hls-verification-2026-10-11.json`에 보존했다.

이 결과는 이 사양에 명시된 parser 경계와 재현성 범위의 로컬 완료만 뜻한다. HLS.js 전체의 취약점 부재, 실제 네트워크·MSE·장시간 재생, 미리보기·화질 전환·오디오·복구 수용을 주장하지 않으며 이 실제 동작은 P06에서 같은 최종 산출물로 확인한다.
