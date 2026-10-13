# NUM01 and independent maintenance closeout

Date:2026-10-13 Asia/Seoul. User approved the bounded NUM01 design, implementation,
verification and fresh Astra max review, then one Korean PR with DT01-C/S.
Baseline local HEADcdacdff; target fork Do-hyeon/cheese-knife main9b8640f.
No merge/deployment/version change authorized. Existing feature checkout reused.

## Approved policy and scope

rmsEnvelope requires finite positive sampleRate and windowMs. Invalid rate throws
`invalid sample rate`; invalid window throws existing `invalid envelope window`.
Normal Math.round arithmetic/default8ms/undefined default/window length bounds/
sample checks/output shape/buffer values remain unchanged. No coercion or silent
default for bad values. Two early guards only, following existing measureSignal
error vocabulary. Real callers/reexports were searched: summarizeCapture and
audio-metrics alias, plus direct tests. All use the same shared implementation.

This is input-parameter correctness, not an amplitude-overflow/numeric precision
redesign, full provider/browser typing, or a security certification. DT02 remains
explicitly accepted conditional deferral, not native conversion DONE. AF05-B/B2
implementation and release remain gated. Product source/generated JS/manifest/
permissions/lock/version2.13.3 and original dist/profiles/ZIP stay protected.

## RED/GREEN and focused verification

- Actual old NaN rate/window result: windowSamples NaN/min Infinity/max0.
  Replacement policy tests fail with missing expected exception before guards:
  two failures/one existing-normal control pass. RED record under
  `output/num01-closeout-20261013/red.log`.
- Rate/window matrices cover NaN, both infinities,0,-0,negative values and two
  negative factors that otherwise cancel. Normal number[]/Float32Array/
  Float64Array, fractional rate/window, omitted/undefined8ms, zero-rounded/
  too-large/multiplication-overflow windows, empty buffer and bad sample retain
  independently specified outcomes. No runtime sample normalization/new wrapper.
- Focused actual audio signal/metrics/quality/artifact tests125/125; all four
  product/development/audio/settings-fixture checkers exit0.
- One first scoped run hit Windows sandbox EPERM in owned temporary realpath;
  authorized local-only rerun passed. Failure is not counted as a functional
  pass or hidden by relaxed filesystem guards.
- S Minor correction changes only its comment/spec/rationale. Chrome allows
  both js/css arrays; mapped fields handle explicitundefined partial merge.
  Original independent0/0/1 verdict is retained, not rewritten as a re-review0.
- Original protected snapshot still equals final S snapshot, including the
  already-approved package checker delta; user dist/profile/files untouched.

## Pending evidence

Independent baseline/candidate positive-input comparison; immutable clone full
foundation/tests/package/synthetic checks; fresh Astra max and disposition;
single Korean PR plus public CI. Scope closure remains unchecked until these
are verified. No push/PR had occurred at this record's initial checkpoint.
