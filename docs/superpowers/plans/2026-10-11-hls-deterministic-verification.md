# HLS Deterministic Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고정된 HLS.js 1.6.16의 네 국소 parser bounds와 provenance를 외부 모델 없이 격리·결정론적으로 검증하고 P03 완료 여부를 재현 가능한 증거로 판정한다.

**Architecture:** 제품 번들과 root `dist`를 직접 생성 대상으로 삼지 않고 `output/tool-audit/hls-validation-<id>/` 아래 격리 root에서 고정 upstream을 두 번 재생성한다. 실제 후보를 test-only VM seam과 제한된 child process로 검사하고, 정상/악성 경계·안전한 negative control·원본/후보 byte·실행 전후 보호 해시를 하나의 fail-closed JSON 보고서에 연결한다.

**Tech Stack:** Chrome Extension Manifest V3, JavaScript, Node.js v24.19.0, `node:test`, `vm`, child process timeout/heap limits, HLS.js 1.6.16, SHA-256.

**Spec:** [HLS 국소 보완의 결정론적 검증 설계](../specs/2026-10-11-hls-deterministic-verification-design.md)

## Global Constraints

- 현재 checkout과 `codex/sidebar-preview-followup` 브랜치를 사용한다. 새 worktree를 만들지 않는다.
- 기존 dirty tree를 정리하거나 덮어쓰지 않는다. `git add`, commit, push, PR, tag, release, 스토어 조작을 하지 않는다.
- 계획 승인 전에는 HLS 전용 테스트·번들 재생성·보호 파일 수정을 하지 않는다.
- 실행 중 root `dist`를 삭제·재빌드하지 않는다. 모든 새 후보와 보고서는 `output/tool-audit/hls-validation-<새 영숫자 ID>/` 아래에만 만든다.
- `hls.js@1.6.16`, 공식 dist SHA-256 `947b45be1392e39569d4aefc2cff9ff6ecbe6cc246cf67ab12ece0c41c24b793`, hardening revision `parser-bounds-v1`을 기준선으로 사용한다.
- child는 192 MiB heap, 5초 process timeout, 64 KiB output 상한을 사용하고 VM parser 호출은 250 ms 안에 종료한다.
- 네트워크·실방송 URL·사용자 계정·외부 모델·source/diff 업로드를 사용하지 않는다.
- timeout, crash, output overflow, 빈 검사, JSON 오류, 실행 중 입력 변경은 pass가 아니라 verifier exit 2다.
- invalid required run record는 거부하고 optional metadata bounds는 빈 optional 결과로 제한한다. 둘을 서로 바꾸지 않는다.
- 새 문서·주석·오류 문구는 한글 또는 영문으로만 작성한다.

## Review Focus

1. **경계값의 off-by-one:** SKIP·emsg·sample/NAL·ID3의 `limit-1`, `limit`, `limit+1`이 각각 허용/허용/거부 또는 drop으로 고정돼야 한다 — Task 2.
2. **typed-array subview offset:** ArrayBuffer 기준 offset으로 되돌아가도 일반 fixture가 통과할 수 있으므로 nonzero byteOffset 사례가 반드시 실패를 잡아야 한다 — Task 2, 3.
3. **optional/required 오류 혼동:** optional caption bounds가 전체 media를 거부하거나 malformed required run이 조용히 drop되면 안 된다 — Task 2, 3.
4. **검사 대상 바꿔치기:** root bundle이나 첫 번째 생성물만 검사하고 두 번째 격리 후보·보고서 hash가 달라지는 경우를 통과시키면 안 된다 — Task 4.
5. **부분 성공의 완료 오인:** 일부 child 성공, stale report, 보호 hash 변화, timeout 또는 입력 snapshot 변화가 P03 `DONE-LOCAL`로 기록되면 안 된다 — Task 4, 6.

---

### Task 0: 기준선과 보호 경계를 동결한다

**Files:**
- Create: `output/tool-audit/recovery-backlog/p03-hls-baseline-2026-10-11.json`
- Read: `scripts/hls-hardening.mjs`, `scripts/vendor-hls.mjs`, `vendor/hls.light.private.js`, `THIRD_PARTY_NOTICES.md`, `package.json`, `package-lock.json`, root `dist`

**Interfaces:**
- Consumes: P02 baseline의 보호 파일·root `dist` inventory와 현재 dirty status
- Produces: 이후 모든 Task가 대조할 HLS 입력 hash, root `dist` inventory, branch/commit/runtime 기준선

- [x] **Step 1: 실행 환경과 dirty 범위를 기록한다**

Run:

```powershell
$knifeNode = 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $knifeNode --version
git status --short
```

Expected: Node `v24.19.0`; 기존 사용자/P01/P02 변경을 그대로 기록하고 정리하지 않는다.

- [x] **Step 2: HLS 입력과 보호 산출물 SHA-256을 기록한다**

`scripts/hls-hardening.mjs`, `scripts/vendor-hls.mjs`, `vendor/hls.light.private.js`, `vendor/hls.js.LICENSE`, `THIRD_PARTY_NOTICES.md`, `node_modules/hls.js/package.json`, `node_modules/hls.js/dist/hls.light.min.js`, root `dist` 전체를 hash한다. upstream version/hash와 현재 후보 hash가 spec의 고정값과 다르면 중지한다.

- [x] **Step 3: 기준선 JSON을 검증한다**

JSON에는 branch/commit/Node, dirty HLS file 목록, package/version, original/candidate/license hash, hardening revision, 보호 파일과 root `dist` inventory를 넣는다. 아직 HLS 검사 통과나 보안 완료 상태를 넣지 않는다.

### Task 1: verifier의 영숫자 ID와 소유 출력 경계를 만든다

**Files:**
- Create: `scripts/hls-verification.mjs`
- Create: `tests/hls-verification.test.cjs`

**Interfaces:**
- Produces: `validateHlsRunId(value) -> string`, `hlsValidationPaths(repoRoot, runId) -> { outputRoot, generationOneRoot, generationTwoRoot, inspectedCandidateBundle, reportPath }`
- Consumes later: Task 4의 CLI verifier

- [x] **Step 1: 경로 계약 RED를 작성한다**

`tests/hls-verification.test.cjs`에 다음을 고정한다.

- `abc123`과 64자 영숫자 ID는 정확한 `output/tool-audit/hls-validation-<id>`를 반환한다.
- 빈 값, 65자, 공백, slash/backslash, `..`, colon, dash, Unicode를 거부한다.
- repo root 밖 경로나 root `output/tool-audit` 자체를 run output으로 계산하지 않는다.
- 두 생성 root는 서로 다르고 outputRoot 바로 아래에 있다. 검사 대상 bundle은 두 번째 생성 root의 `vendor/hls.light.private.js`다.
- 반환 경로 다섯 개는 절대경로이고 outputRoot 자신 또는 그 내부에만 있다.

- [x] **Step 2: RED를 확인한다**

Run: `& $knifeNode --test tests/hls-verification.test.cjs`
Expected: module 또는 export 부재로 실패한다.

- [x] **Step 3: 최소 경로 구현을 한다**

`validateHlsRunId`는 `/^[A-Za-z0-9]{1,64}$/`만 허용한다. `hlsValidationPaths`는 검증된 ID와 절대 repo root로만 네 경로를 계산하고 filesystem write는 하지 않는다.

- [x] **Step 4: GREEN을 확인한다**

Run: `& $knifeNode --test tests/hls-verification.test.cjs`
Expected: exit 0.

### Task 2: 네 parser boundary의 정확한 경계값을 실제 후보에 고정한다

**Files:**
- Modify: `tests/fixtures/hls-parser-child.cjs`
- Modify: `tests/hls-parser-bounds.test.cjs`
- Modify: `tests/hls-compatibility.test.cjs`
- Modify only if a verified RED requires it: `scripts/hls-hardening.mjs`

**Interfaces:**
- Consumes: `KNIFE_HLS_TEST_BUNDLE`의 exact candidate path
- Produces: case ID별 `{ result }` 또는 `{ rejected, timedOut, name }` JSON; packaged bundle에는 test hook을 쓰지 않음

- [x] **Step 1: boundary matrix RED를 추가한다**

다음 case를 child와 bounds test에 추가한다.

- SKIP: 9,999 / 10,000 / 10,001, duplicate after zero/nonzero
- emsg terminated string: 4,095 / 4,096 / 4,097, version 0/1, missing terminator
- selected-track run work: 99,999 / 100,000 / 100,001, truncated width, duplicate/missing `tfhd`, short `tfdt`
- optional byte budget: actual-input-times-four의 직전/정확/초과, shared data, nonzero typed-array subview
- NAL count/header/payload: limit 직전/정확/초과와 truncated payload
- codec: AVC/HEVC allowlist와 NAL 모양 VP9/AV1 opaque sample
- ID3: 1 MiB 직전/정확/초과, frame 4,095 / 4,096 / 4,097, padding/adjacent/truncated extended header

상한 자체를 반복 소비해야 하는 case는 test-only helper seam을 사용해 media allocation과 parsing 결과를 분리한다. helper seam은 `typeof` guard로 원본 bundle에도 주입 가능해야 한다.

- [x] **Step 2: RED를 제한된 child에서 확인한다**

Run: `& $knifeNode --test tests/hls-parser-bounds.test.cjs tests/hls-compatibility.test.cjs`
Expected: 새 case 또는 helper seam 중 하나 이상이 실패한다. timeout/OOM은 기대 실패가 아니며 즉시 검사 설계를 줄인다.

- [x] **Step 3: fixture와 필요한 최소 hardening만 보완한다**

먼저 test-only seam과 fixture만 구현한다. 현재 hardening이 spec과 다를 때만 실패 case를 보존한 뒤 해당 경계를 최소 수정한다. semantic hardening이 바뀌면 `HARDENING_REVISION`을 올리고 고지 문구·기대 hash 갱신을 Task 5에 넘긴다.

- [x] **Step 4: GREEN과 정상 호환성을 확인한다**

Run: `& $knifeNode --test tests/hls-parser-bounds.test.cjs tests/hls-compatibility.test.cjs`
Expected: fail/cancel/skip 0; 정상 case는 손으로 고정한 기대값을 원본과 후보가 모두 만족한다.

### Task 3: 안전한 negative control과 provenance 실패를 고정한다

**Files:**
- Create: `tests/hls-hardening-negative-controls.test.cjs`
- Create: `tests/fixtures/hls-mutation-child.cjs`
- Modify: `tests/hls-provenance.test.cjs`
- Modify only if required: `scripts/hls-hardening.mjs`, `scripts/vendor-hls.mjs`

**Interfaces:**
- Consumes: `hardenHls(source)`, 고정 upstream bytes, 격리된 temporary mutant bundle
- Produces: 네 상한·offset·codec·required/optional 계약을 각각 깨뜨린 안전한 mutant가 대응 test에서 탐지된다는 증거

- [x] **Step 1: negative-control RED를 작성한다**

아직 존재하지 않는 `tests/fixtures/hls-mutation-child.cjs`를 제한된 child로 호출하는 test를 먼저 작성한다. mutation driver는 임시 후보에서 exact anchor를 한 번만 바꿔 다음을 검사해야 한다.

- SKIP 10,000 상한을 10,001로 완화하면 `skip-over-limit`이 원래 기대를 위반한다.
- emsg 4,096 상한을 4,097로 완화하면 `emsg-over-limit`이 원래 기대를 위반한다.
- run work 100,000 상한을 100,001로 완화하면 `trun-over-limit`이 원래 기대를 위반한다.
- ID3 1 MiB 또는 4,096 frame 상한을 하나 완화하면 대응 case가 원래 기대를 위반한다.
- subview byteOffset 보정을 제거하면 `trun-subview-valid`이 실패한다.
- NAL codec allowlist를 제거하면 NAL 모양 VP9/AV1 opaque case가 caption으로 오인된다.
- optional metadata catch를 제거하면 optional overflow가 빈 결과 대신 child failure가 된다.
- required run reject를 optional drop으로 바꾸면 malformed remux case가 조용히 통과한다.

각 mutant는 temp 파일이며 root 후보를 쓰지 않는다. anchor가 정확히 한 번이 아니면 test 자체가 실패한다.

- [x] **Step 2: RED를 확인한다**

Run: `& $knifeNode --test tests/hls-hardening-negative-controls.test.cjs`
Expected: mutation child 부재로 실패한다. timeout/OOM이나 제품 후보 변경은 기대 실패가 아니다.

- [x] **Step 3: 최소 mutation driver와 provenance 계약을 구현한다**

mutation child는 mutant source와 case ID를 받아 Task 2와 같은 192 MiB heap·5초 process·64 KiB output·250 ms VM 제한을 적용한다. 모든 mutant를 실제 대규모 공격으로 실행하지 않고 Task 2의 안전한 `limit+1` fixture에 연결한다. provenance에는 changed upstream bytes, unexpected version, missing/duplicate transform anchor, license mismatch, 기존 candidate 보존을 추가한다.

- [x] **Step 4: GREEN을 확인한다**

Run: `& $knifeNode --test tests/hls-hardening-negative-controls.test.cjs tests/hls-provenance.test.cjs`
Expected: exit 0; root `vendor`와 root `dist` hash 불변.

### Task 4: fail-closed 격리 verifier와 evidence schema를 구현한다

**Files:**
- Create: `scripts/verify-hls-candidate.mjs`
- Modify: `scripts/hls-verification.mjs`
- Create: `tests/hls-verifier.test.cjs`
- Reuse: `scripts/owned-files.mjs`

**Interfaces:**
- Produces: `runHlsVerification(repoRoot, runId, options?) -> Promise<report>`; CLI `node scripts/verify-hls-candidate.mjs <runId>`
- Report status: `complete-pass`, `complete-findings`, `incomplete`; CLI exits 0, 1, 2 respectively
- Consumes: Task 1 paths, Task 2/3 tests, pinned package inputs, owned-root filesystem capability

- [x] **Step 1: verifier RED를 작성한다**

`tests/hls-verifier.test.cjs`에 다음을 고정한다.

- unsafe ID와 기존 outputRoot는 보호 파일을 읽거나 쓰기 전에 거부한다.
- 새 ID는 기존 `output/tool-audit`를 capability root로 연 뒤, 존재하지 않는 `hls-validation-<id>`를 `ensureDirectory`로 한 번만 만든다. 그 후 새 run root를 다시 열어 모든 하위 작업을 제한한다.
- 격리 생성 root마다 정확히 다섯 파일만 복사한다: `scripts/vendor-hls.mjs`, `scripts/hls-hardening.mjs`, `node_modules/hls.js/package.json`, `node_modules/hls.js/dist/hls.light.min.js`, `node_modules/hls.js/LICENSE`.
- 두 번 생성한 candidate bytes가 다르거나 현재 보호 후보와 다르면 exit 1이다.
- child timeout/crash/invalid JSON/empty test/input snapshot 변화는 exit 2다.
- complete report는 실제 candidate absolute path/hash, 원본/hash/version/revision, anchor counts, command/exit/test count, limits, 전후 보호/root dist hash를 포함한다.
- `KNIFE_HLS_TEST_BUNDLE`은 두 번째 격리 생성물의 정확한 경로이며 root bundle이 아니다.
- 부분 실패도 `report.json`을 `incomplete`로 남기되 기존 run을 덮어쓰지 않는다.

- [x] **Step 2: RED를 확인한다**

Run: `& $knifeNode --test tests/hls-verifier.test.cjs`
Expected: verifier/export 부재로 실패한다.

- [x] **Step 3: 최소 verifier를 구현한다**

`runHlsVerification`은 입력 snapshot을 전후 hash한다. `openOwnedRoot(output/tool-audit)`로 검증한 부모 capability에서 기존 run 부재를 확인하고 run 폴더를 생성한 다음, `openOwnedRoot(outputRoot)`로 capability를 축소한다. child마다 timeout·maxBuffer를 명시한다. stdout/stderr 전체 source나 playlist payload를 report에 복사하지 않고 command metadata, exit, count, 짧은 오류 분류만 보존한다.

- [x] **Step 4: GREEN을 확인한다**

Run: `& $knifeNode --test tests/hls-verification.test.cjs tests/hls-verifier.test.cjs`
Expected: exit 0; test-created output은 test cleanup으로 제거되고 보호/root dist hash가 같다.

### Task 5: 실제 P03 verifier를 실행하고 유효한 실패만 보완한다

**Files:**
- Create: `output/tool-audit/hls-validation-<new-id>/report.json`
- Create after success: `output/tool-audit/recovery-backlog/p03-hls-verification-2026-10-11.json`
- Modify only for reproduced failures: HLS hardening/tests/notices identified by Tasks 2–4

**Interfaces:**
- Consumes: Task 4 CLI and Task 0 baseline
- Produces: current tree에 결속된 final P03 evidence

- [x] **Step 1: 새 영숫자 ID로 verifier를 실행한다**

```powershell
$hlsRunId = [guid]::NewGuid().ToString('N')
& $knifeNode scripts/verify-hls-candidate.mjs $hlsRunId
```

Expected: exit 0이면 모든 child가 완전 실행되고 candidate/protected bytes가 일치한다. exit 1/2면 P03을 완료하지 않는다.

- [x] **Step 2: 실패를 분류한다**

- 환경/도구/timeout/input drift는 구현을 추측 수정하지 않고 `incomplete`로 유지한다.
- 실제 fixture가 spec 계약을 위반하면 그 case를 독립 RED로 재실행한다.
- hardening 결함이면 최소 수정하고 격리 candidate를 다시 생성한다.
- semantic 변경이면 revision·notice·예상 hash를 함께 갱신하며 기존 실패 report는 보존한다.

- [x] **Step 3: 성공 report를 독립 대조한다**

report의 candidate file count/hash, command/test count, limits, original/candidate/license hash, anchor count, before/after snapshot, root dist inventory를 원시 파일과 다시 계산한다. 불일치하면 verifier defect로 RED를 추가하고 Task 4로 돌아간다.

- [x] **Step 4: durable evidence를 작성한다**

최종 evidence에는 성공 run ID/path와 과거 실패 run, exact commands/exits, 정상/경계/negative-control count, 보호 hash, 제한 사항을 기록한다. `security clean`, `취약점 없음`, `실제 재생 합격` 문구를 사용하지 않는다.

### Task 6: 전체 회귀와 P03 게이트 상태를 완료한다

**Files:**
- Modify: `docs/superpowers/specs/2026-10-11-hls-deterministic-verification-design.md`
- Modify: `docs/superpowers/validation/2026-10-11-recovery-release-gates.md`
- Modify: `PLANS.md`
- Create: a new isolated Chrome candidate via `scripts/verify-candidate.mjs`

**Interfaces:**
- Consumes: final P03 evidence and existing P02/P04 gates
- Produces: P03 `DONE-LOCAL` 또는 정확한 `DOING/BLOCKED-*`, 다음 실행 cursor

- [x] **Step 1: HLS 포함 전체 Node 회귀를 실행한다**

```powershell
$allTests = @(Get-ChildItem tests -Filter '*.test.cjs' | ForEach-Object { $_.FullName })
& $knifeNode --test @allTests
```

Expected: fail/cancel/skip 0. 실제 test 수와 duration을 기록하고 기대값을 낮춰 성공시키지 않는다.

- [x] **Step 2: 새 격리 Chrome candidate를 검사한다**

새 영숫자 ID로 `scripts/verify-candidate.mjs`를 실행한다. package check, 58개 전체 파일과 20개 진입 자원, source 대응 hash를 기록한다. root `dist`는 빌드하지 않는다.

- [x] **Step 3: 보호·문서 품질을 검사한다**

```powershell
git -c core.safecrlf=false diff --check
Select-String -Path docs/superpowers/plans/2026-10-11-hls-deterministic-verification.md,docs/superpowers/specs/2026-10-11-hls-deterministic-verification-design.md,PLANS.md -Pattern '[\u3040-\u30ff]'
git diff --cached --quiet
```

Expected: diff check 0, 일본어 0, staged changes 0. root `dist`와 plan 밖 사용자 파일은 기준선과 같다. HLS 보호 파일은 Task 5에서 승인된 semantic 변경이 없으면 기준선과 같고, 변경이 있었다면 provenance/evidence의 새 hash와 정확히 일치해야 한다.

- [x] **Step 4: 게이트 상태를 사실대로 갱신한다**

- 모든 P03 조건을 만족하면 P03만 `DONE-LOCAL`로 바꾼다.
- timeout/tool failure/input drift/검증 실패가 있으면 `DOING` 또는 해당 `BLOCKED-*`를 유지한다.
- P03 완료만으로 G-SEC/G-REL/P06/P08을 완료하지 않는다.
- 다음 cursor는 P04 Chrome 121/file symlink/최종 metadata 또는 실제 남은 blocker로 이동한다.

## 완료 산출물

- 네 parser boundary의 실제 후보 `limit-1/limit/limit+1`과 정상 호환성 근거
- 각 보호 경계를 깨뜨린 safe negative control 탐지 근거
- 고정 upstream/version/license/anchor와 두 번의 격리 재생성 provenance
- fail-closed `verify-hls-candidate.mjs`와 complete/incomplete report
- 실행 전후 보호 네 파일과 root `dist` 불변 또는 승인된 새 hash 근거
- HLS 포함 전체 Node 회귀와 새 격리 Chrome package 결과
- P03의 정직한 최종 상태와 P04 다음 cursor
