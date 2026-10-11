# 컴프레서 전환과 출력 헤드룸 설계

2026-10-11 / 사용자 승인 완료. 이 문서는 기본 방송 청취가 정상이라는 수용 결과와 별개로 남아 있던 250/750Hz 전환 dip 및 극단 설정의 full-scale 초과를 해결한다.

## 목표와 성공 기준

- 컴프레서 ON/OFF 양방향 전환에서 dry와 wet의 시간차로 생기는 위상 상쇄를 제거한다.
- 허용된 컴프레서 설정과 Gain 0~200% 조합에서도 wet 출력은 절대 진폭 0.98을 넘지 않는다.
- 컴프레서를 한 번도 켜지 않은 영상은 Web Audio graph에 연결하지 않는다.
- 기존 UI, 저장된 Gain, 다중 문서 독립성, 한 번뿐인 `MediaElementSource` 생성 및 실제 dry bypass 의미를 유지한다.

합성 Chrome의 250/750/1000Hz 양방향 전환에서 8ms RMS 최솟값은 전환 전후 안정 구간 중 작은 값의 95% 이상이어야 한다. 극단 설정은 peak 0.98 이하, absolute value 1 초과 샘플 0이어야 한다. 기존 peak 0.9 미만 신호는 limiter 전달 함수상 그대로 통과해야 한다.

## 확인된 원인

현재 graph는 즉시 출력되는 dry와 `DynamicsCompressorNode`를 통과하는 wet을 10ms 동안 선형 교차한다. Chromium의 compressor 내부 graph는 0.006초를 float32로 계산해 정수 프레임으로 내리고 최대 1023프레임으로 제한한다. 48kHz에서는 288프레임이지만 44.1kHz에서는 264프레임, 192kHz에서는 1023프레임이다. 이 지연을 맞추지 않으면 전환 중 두 경로가 상쇄되고, 주파수·sample rate 조합에 따라 같은 결함이 측정에서 숨는다.

별도 headroom 문제는 compressor 뒤 Gain이 최대 2.0이고 그 뒤에 출력을 제한하는 노드가 없기 때문이다. `threshold=0`, `knee=0`, `ratio=1`, 입력 peak 0.98, Gain 2.0의 기존 합성 결과는 peak 1.95944와 full-scale 초과 샘플 16000개다.

## 채택한 graph

```text
MediaElementSource ─┬─> DelayNode(chromiumFrames / sampleRate) ─> dry Gain ─> destination
                    └─> DynamicsCompressor ─> user Gain ─> limiter ─> wet Gain ─> destination
```

- `DelayNode` 최대 지연은 0.02초다. 실제 지연 프레임은 `min(floor(float32(0.006) * float32(sampleRate)), 1023)`이고 `delayTime`은 그 프레임 수를 sample rate로 나눈 값이다. 이는 Chrome 전용 복구판의 현재 Chromium compressor 구현과 맞춘다.
- 기존 10ms dry/wet 선형 전환과 Gain의 10ms 평활화는 유지한다.
- limiter는 `WaveShaperNode`이고 `oversample='none'`이다. oversampling의 구현별 추가 지연이 dry/wet 정렬을 다시 깨지 않게 한다.
- limiter curve는 4097개 점, odd symmetry, 단조 증가다. 절대 입력 0.9 이하는 identity이고, 0.9~1.0은 시작 기울기 1·끝 기울기 0인 cubic Hermite 구간으로 0.98에 도달한다. 절대 입력 1 이상은 명세상 curve 끝값 ±0.98에 대응한다.
- delay, compressor, Gain, limiter, dry/wet 노드는 모두 irreversible한 `createMediaElementSource` 전에 만든다. 하나라도 실패하면 native 경로를 가로채지 않는다.
- graph를 retire할 때 wet 노드를 정리하되 source를 이미 destination에 연결된 delay→dry 경로로 다시 연결해 audible bypass를 보존한다.

컴프레서를 한 번 켰다가 OFF로 돌린 영상의 audio는 현재 Chromium compressor와 같은 정수 프레임만큼 지연된다. 일반 sample rate에서는 약 6ms이고 고 sample rate에서는 1023프레임 상한을 따른다. 이는 위상 정렬의 의도된 비용이며 ON의 기존 compressor 지연을 늘리지 않는다. 한 번도 ON하지 않은 영상에는 이 지연이 없다.

## 명시적으로 기각한 안

컴프레서의 ratio를 1:1로 바꾸는 등 파라미터만 무효화해 OFF처럼 만드는 단일 경로는 사용하지 않는다. 이는 실제 bypass가 아니고 OFF에서도 compressor 상태·지연을 강제하며, release 상태와 Gain 1.0 전환이 별도 음량 변화를 만들 수 있다.

AudioWorklet look-ahead limiter도 이번 범위에서 사용하지 않는다. 새 packaged worker, CPU 비용, 시작 실패 및 별도 지연 계약은 현재 두 결함에 비해 범위가 크며 향후 F01 오디오 보강에서 다시 검토할 수 있다.

## 오류·수명주기

- delay 또는 limiter 생성 실패는 source 생성 전 `audio-unavailable`로 끝나며 원본 재생 경로를 건드리지 않는다.
- 이미 연결된 graph에서 설정 재적용은 compressor 다섯 파라미터와 Gain target만 바꾸고 delay/curve/연결을 재생성하지 않는다.
- 빠른 ON/OFF와 늦은 `resume()`은 기존 generation 계약을 유지한다.
- BFCache는 graph를 보존하고 최종 pagehide는 bypass한다. 다른 문서·탭의 graph와 상태를 공유하지 않는다.

## 검증

1. Node graph 계약에서 delay 값·연결 순서·curve의 identity/단조/odd/ceiling·실패 전 source 미생성을 RED→GREEN으로 확인한다.
2. 실제 production graph를 쓰는 합성 Chrome 검사에서 250/750/1000Hz 양방향 RMS와 극단 peak/full-scale을 강제한다.
3. 8kHz부터 384kHz까지 대표 12개 sample rate의 impulse에서 dry와 compressor가 동일한 단일 정수 프레임에 도달하는지 검사한다. ON 신호와 stress peak의 하한도 확인해 전체 wet 무음이 false pass하지 못하게 한다.
4. 기존 오디오 집중 검사와 전체 회귀, 정적 도구 audit, 격리 후보/package 검사를 실행한다.
5. Astra max 독립 검토는 위상 정렬, limiter 왜곡/상한, 실패 전 interception, retire/BFCache/다중 문서 경계를 공격적으로 검토한다.
6. 자동 검증과 독립 검토가 끝난 뒤에만 새 root `dist` 후보를 만들며, 실제 방송 청취는 별도 설치 수용으로 남긴다.

## 범위 밖

EQ, 노멀라이저, 사용자 limiter 설정, 프리셋, 채널별 저장, AudioWorklet, Firefox 지원, 보호 미디어 우회는 포함하지 않는다. 합성 결과는 스피커·헤드폰의 주관적 음질이나 모든 방송 소스의 무왜곡을 보장하지 않는다.
