# DT01-B — 상세 설계 검토 기록

작성 시작: 2026-10-12 / 검토·보완: 2026-10-13 / Asia-Seoul. 제품·도구 구현은 변경하지 않은 설계 단계다.

## 기준과 직접 확인

- 기준 main: `7b2be0ec7ffb10b765424bab83128742e7243e27`.
- [상세 설계](../specs/2026-10-12-dt01b-quality-report-contract-design.md): partial/raw 의미 보존, 정상 alias 계약·4파일 checked graph·실제 CLI 연결.
- Node 24.19.0.
- `node --test tests/audio-metrics.test.cjs tests/audio-artifacts.test.cjs`: sandbox20개 중16pass/4fail. 4개는 fresh owned artifact 디렉터리 realpath EPERM으로 제품 결함은 아니다. 승인된 Native 재실행20/20pass, 실패0/skip0, 1.667초. 실제 browser는 실행하지 않았다.
- 현재 gate에14종 RAM 입력을 호출했다. 기본/구조 guard 반환, null 예외, 최소 partial1채널 transition 허용, 빈 cases/gain-only, nullable 항목9개 실패 순서, 누락 측정, wrong-container 예외, string peak, truthy 숫자, NaN frequency, 정확한 RMS 하한을 관측했다. 새 fixture/구현 검증은 아니다.
- 현재 audio-metrics만 strict checkJs로 조회하면 기본 root `{}`의 cases/transitions/stress/alignments에 TS2339 4개가 나온다. 타입 정보 부재이지 런타임 결함4건/보안 발견4건이 아니다. 타입 추가 후 nested 진단 해결 가능성은 아직 검증하지 않았다.
- 검토 보완 뒤 현재 기존2파일 audio-tools strict는 exit0/진단0, filesystem-free metrics14/14·실패0/skip0, 관련3문서 local link45개/부재0과 diff check를 확인했다. 이는 미변경 코드/문서 검증이며 새4파일 구현 검증이 아니다.
- 제품/제출본 버전2.13.3·root dist58파일 inventory SHA256 `d01bd672ff9bb9ffab808099432129b9429f5baa2fbf256e612531e358086c60`, 원본 ZIP `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`, frozen baseline `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`·원장 `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401`을 직접 대조했다. 변경은 설계2문서와 PLANS.md뿐이다.

## Astra max 독립 검토

단일 fresh gpt-6-astra/max가 base `7b2be0ec7ffb10b765424bab83128742e7243e27` → checkpoint `eb3ca906b74c754ee9fa0b8a6176cc47e7313d69`를 read-only 검토했다. **Critical0·Important1·Minor1**, written-spec 판정 **With fixes**. source·호출자·graph·감사 연결, filesystem-free metrics14/14와 RAM runtime/TypeScript7.0.2 virtual-FS 조각을 확인했다. Native20/20은 독립 재실행하지 않았다.

### 지적 대조와 보완

1. **Important / 선택 필드와 주석 정책 충돌:** Math.max의 optional baseline step과 optional peak 상한 비교에는 envelope guard가 존재/숫자를 증명하지 않는다. RAM strict 조각 TS2345/TS18048, 누락 step의 `/step`, null/string baseline 허용·string change 실패를 대조했다. 설계 §5에 native Math.max callable-signature 주석과 원래 비교 위치의 peak capture/undefined guard를 선택했다. number 입력 cast·wrapper·정규화는 없다. §6에 원래 결과 oracle를 추가했다.
2. **Minor / Array.isArray any 누수:** readonly 부분 배열이 any[]로 좁혀져 없는 필드를 허용할 수 있다. partial 원소 타입 복원을 필수화하고 실제 guarded loop 안 오용의 source 위치 진단 control을 §7에 요구했다. alias 호출 오용만으로 순수 구현 전체가 checked라고 표시하지 않는다.

주 실행자는 peak 국소 보완을 RAM12값(undefined/null/0/0.98/0.9801/1/NaN/Infinity/string/BigInt/Symbol/valueOf object)으로 대조했다. ordered failure·name/message 예외·getter trace가 모두 같았다. 특정 local 경계의 제한된 feasibility 증거이며 전체 gate·typed 구현·browser PASS가 아니다. 소스/fixture에 코드를 남기지 않았다.

보완은 주 실행자 대조이며 두 번째 독립 검토는 없다. 수정 후 독립0건/전체 strict 성공을 주장하지 않는다. 구현 단계의 typed gate·내부 any negative control과 최종 Astra max 검토가 남았다.

### 판단하지 않은 영역에 대한 결정

- 전체 annotated gate 성공: 구현 후 compiler/동작 검증의 필수 잔여 조건.
- browser/calibration·설치/update/rollback·외부 CI: 설계 검토에서는 미실행. 기존 게이트 유지.
- DT01-C artifact/file 계약·보안 인증: 제외. 이번 검토는 correctness 설계 검토다.
- Native20/20 독립 재실행: 주 실행자 baseline으로만 기록하고 reviewer14/14와 합산하지 않는다.
- CLI report 조립: import만으로 정적 검증되지 않는다. 정상 API/순수 구현/대표 소비자 범위로 명시했다.

## 제외와 상태

- DT01-B 구현·신규 compiler proof·합성 browser 재실행·설치형 전환은 미실행.
- 보안 scan/인증·NUM01 정책 수정·컴프레서 개선은 미수행.
- CLI 전체 strict·DT01-C artifact/file capability는 범위 밖.
- P09/AF05-B/F00–F05의 기존 수용 게이트·미검증 상태 유지.
- written-spec 승인 → 상세 계획·검토·실행 승인 → 구현·최종 검증. 문서 PR/CI 통과는 DT01-B 구현 PASS가 아니다.
