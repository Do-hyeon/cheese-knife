# 원복 후 설치본 기능 검사 — 진행 중

2026-10-08, 제품5a76d95/검증기록bdedd89, 설치Chrome155.0.8059.39. 사용자 검사8개 스타일 원복 완료 후 새 ownhome/live/VOD를 사용했다. 이번 단계에 제품/테스트/빌드 변경은 없다. 설정 원복의 상세는 [스타일 수용 기록](2026-10-08-style-baseline-and-acceptance.md)의 마지막 절에 이어진다.

## VOD 오디오 전환·화면 모드·SPA

초기 실제 VOD는 컴프레서OFF/Gain1.5,영상mutedtrue/playing/readyState4였다. 원래 Gain저장값을 쓰거나 영상mute/seek/play/pause를 직접 변경하지 않았다. 런타임 설정의 공개 leaf만 읽어 compressorDefaultfalse/threshold-50/knee40/ratio12/attack0/release0.25,선택된영상동일/eligibletrue를 확인했다. 토큰/영상URL/React객체/채팅을 읽거나 기록하지 않았다.

UI 버튼의 키보드Enter로20회 ON/OFF했다. 매번 해당상태 attached를 기다린 뒤 상태/Gain/재생만 읽었다. 20회모두번갈아on/off,Gain1.5,pausedfalse/ready4였고마지막OFF였다. 첫 활성화 전에 own문서 AudioContext의source/compressor factory2개만 임시계수 래퍼로 감쌌다. 관찰한source생성1회/compressor생성1회/source인자와선택영상동일을확인했다. finally에서원래propertydescriptor를복원하고probeSymbol을삭제했다. 이는20회전환구간의중복생성 방지/상태수용이지 실제스피커출력·음질·모든소스의보장이아니다. 이미mutedtrue인own영상을그대로검사했으며사용자방송음성은캡처하지않았다.

다시ON한뒤native‘넓은화면’→‘좁은화면’키보드왕복에서컴프레서1개/on/Gain1.5/playingready4와같은video/pzp/layout을확인했다. 넓은상태의버튼은‘좁은화면’,복귀뒤‘넓은화면’이었다. 이것은동일미디어 화면모드 변경이며실제video교체/remount나전체화면/PIP검사로합산하지않는다. OFF로복원하고modeprobe를삭제했다.

동일VOD에서ON→header공개home링크→홈현재카드의같은VOD링크로SPA왕복했다. 홈전환직후location만홈이고runtime/controls는이전값인중간상태였으므로PASS/FAIL로판정하지않았다. 정착뒤runtimeexplore/selectedPlayerfalse/oldaudioOFF/ownedcomp0,oldvideo는native미니영역에connected/playing/mutedtrue였다. VOD복귀뒤runtimevod/같은video/comp1/OFF/Gain1.5/playingready4를확인했다. 다시ON성공후OFF복원했다. 다른media생성·장시간GC·pauseddetached5초retirement경로는이실제사례로입증되지않으며기존별도회귀와구분한다.

모든임시audio probeSymbol3개부재/계수래퍼복원/원래OFF/Gain1.5/mutedtrue/일반화면을확인하고ownhome/live/VOD를닫았다. 사용자시청탭/확장저장소/viewport를변경하지않았다. 음질의toggle dip/customheadroom/실제청취등기존한계는유지한다.

## 영상 필터

실제런타임의원래값은밝기1/대비1/채도1/감마1/선명도0이었다. body knife-filter없음/knifeFilter자식0이었다. 이중립상태에서도nativePZP자체의SVG필터URL이영상computedfilter에남아있었다. 합성fixture의중립‘none’을실사이트의기대값으로잘못적용하지않는다.

기존`node scripts/check-video-filters.mjs --chrome`를새로실행해exit0/11checks/Chrome155.0.8059.39를확인했다. 별도합성profile에서productionconfig/mainJS/mainCSS로영상실제CSS필터pixels를검사했다. 각파라미터·합성5개·중립초기화11건이며로그는ignored `output/acceptance/final-filter-native.log`다. 마지막중립pixels100/80/60/자식0/filter none으로돌아왔다. 사용자설치확장이나방송pixels/사용자GPU수용으로합산하지않는다.

실제설치본의설정변경→SVG노드5개/영상필터반영→중립원복검사는남았다. 설정화면접근불가제한을유지하고확장isolated세계/Chrome storageAPI를통해우회변경하지않는다. 사용자에게설정UI에서시험값밝기1.5/대비1.1/채도0.5/감마0.8/선명도2적용을요청하고,검사뒤원래1/1/1/1/0으로복원확인해야한다. 확장자체새로고침은필요없다. 실제pixels/GPU확인은현재캡처제한과분리해미검증으로남긴다.

전체기능·특수메시지/타임머신권한/최종독립검토·PR게이트는아직완료되지않았다. 이전Node122/nativeCSS91기록을이번fresh실행으로주장하지않는다.

## 설치본 필터값 적용 후 native CSS 충돌 확인

사용자가시험값적용완료를알렸다. 새ownlive/VOD에서body knife-filterON/knifeFilter1개/자식5개를확인했다. RGB밝기slope1.5,대비slope1.1/intercept-0.05,감마exponent0.8,채도0.5,선명도kernel `0 -0.4 0 -0.4 2.6 -0.4 0 -0.4 0`이었다. 설정 bridge/SVG 생성은반영됐지만두문서의정착한주영상computedfilter는nativePZP URL이었다. 그러므로실제영상에확장필터적용은FAIL이며합성11PASS로덮지않는다.

VOD초기에는영상4개중native필터의paused720p1개/ready0인2개/knifeFilter의playing720p1개였다. 정착뒤native필터주영상1920×1080/playingready4와ready0영상2개로바뀌었다. 로딩중영상중하나에knifeFilter가보인것을주영상성공으로합산하지않는다. live정착주영상도1920×1080/playingready4/native필터였다. 미디어를seek/mute/play/pause하지않았다.

live주영상의matchedCSS에서기존 `.knife-filter video`와 native `.pzp-pc--<instance>.pzp-pc--filter .webplayer-internal-video`가둘다filter를선언하고둘다normalpriority였음을확인했다. 영상inlinefilter는없었다. native specificity가더높아확장선언을이긴다. CSS/DOM진단은허용된현재HTTP(S)탭에서depth0/document→주영상query→filter선언만반환하고끝에disable했다. 전체styleSheet/React/채팅/영상URL은수집하지않았다.

nativeSVG는GaussianBlur(stdDeviation1)→arithmetic Composite2개를사용하는기존보정파이프라인이었다. 두문서의 `.pzp-pc__video .webplayer-internal-source-wrapper`는DIV1개/directVIDEO1개/자체filter none이었다. 일반important로영상filter를교체하면기존native파이프라인을제거하므로그접근은추천하지않는다.

bounded보완안: `web/main.css`의필터규칙만조정해current PZP의직접VIDEO를감싼영상전용sourcewrapper에knifeFilter를적용하고,그directVIDEO는기존genericvideo선택자에서제외해중복적용을막는다. native영상filter/다른legacy·preview영상의기존적용/중립OFF동작을보존한다. JS/권한/저장값/observer는바꾸지않는다. 실제wrapper+강한native규칙을사용한회귀를먼저RED로재현하고native필터보존/한번적용/중립원복/legacy보존/실제pixels와재생검사후새dist를검증한다. 구현에는사용자짧은설계승인이필요하며승인전제품/테스트/후보CSS/build를변경하지않았다.

own탭2개를닫았고user탭/확장저장소/viewport/미디어를변경하지않았다. 현재필터시험값은그대로유지하며보완설치수용후1/1/1/1/0으로원복해야한다. 다음필수확장새로고침게이트와전체검증/최종검토/PR미완료조건은유지한다.

## 승인된 source-wrapper 필터 보완 후보

사용자가짧은CSS보완설계를승인했다. 먼저기존`check-video-filters.mjs`에현재PZP처럼더구체적인native영상filter규칙/sourcewrapper/directVIDEO와독립적인native반밝기SVG를사용한6사례를추가했다. source RGB100/80/60에native sRGB반밝기는50/40/30,확장밝기0은0/0/0인literal기대값이다. live/VOD wrapper적용2개,기본필터가없는wrapper의한번적용1개,중립복원1개가모두wrapper none으로4RED였다. native중립보존과non-PZP wrapper의기존video적용2개는수정전부터PASS인보호characterization이다. 기존11개는그대로통과했다. 계측함수의기대값을제품helper로계산하지않으며CSS적용후실제합성영상pixels를읽는다.

`web/main.css`의필터규칙만변경했다. 기존genericvideo규칙에서 `.pzp-pc__video .webplayer-internal-source-wrapper > video`를제외하고,현재영상sourcewrapper에동일한knifeFilter선언을추가했다. native영상filter는건드리지않는다. currentwrapper에native필터가없어도childvideo와중복적용되지않고,non-PZP/legacy영상과preview의기존generic경로는보존한다. JS/설정/권한/의존성/observer는바꾸지않았다.

최종검증:Node122/122,별도Chrome155.0.8059.39 native스타일91/91,필터17/17(4RED→GREEN+2보호+기존11) PASS. 수정후픽셀은active0/0/0,neutralnative50/40/30으로복원됐다. 현재fullCSS/MAINconfig+filter로검사하며합성profile결과를사용자GPU/실제스피커/설치수용으로합산하지않는다. ignored로그는 `filter-wrapper-red.log`, `filter-wrapper-green.log`, `filter-wrapper-node.log`, `filter-wrapper-styles.log`다.

실제A/B도시도했다. 최초VOD탐색timeout뒤선택browser5가명시적으로unavailable이되어지원troubleshooting을읽고inventory를확인했다. 같은Chrome extensionInstance가browser6으로재연결되어fresh binding/documentation을사용했다. 이전own탭2개를정확한owned ID로닫고새ownlive/VOD로검사를재개했다. stale탭/빈목록만으로browser를다시선택한것이아니다.

새live의rawCDP는paused document response처리중제한으로적용명령을거절했다. 다른전송경로/isolated세계/ChromeAPI로우회하거나재시도루프를만들지않았다. live임시CSS0/wrappernone을DOM으로확인했으므로 **실제live A/B는미검증**이다. VOD의해당탭origin CDP는허용돼새wrapper규칙만임시적용했다. wrapper none→knifeFilter→none/nativevideo computedfilter동일/wrapper크기동일/playingready4를확인했고finally에서style과probeSymbol을삭제했다. 임시CSS0을확인하고새own탭2개도닫았다. 이A/B는제외selector까지포함한새전체CSS설치수용이아니며영상pixels캡처수용도아니다. 사용자시청탭/확장저장소/viewport/미디어를직접변경하지않았다.

build/package v2.13.2·20 entry resources·diff check PASS,source/dist `web/main.css` SHA256 모두 `1BD89AAAC3225DCCCB63BA3A0A4DC0B405A238390D2BE2FF96FC3ED60589B9C7`다. 기존build경로검증/symlink거부를유지했다. 새dist에는필수수동확장새로고침이필요하므로여기서중지한다. 필터시험값1.5/1.1/0.5/0.8/2는유지한다. 새설치본live/VOD wrapper+native보존/재생검사후original1/1/1/1/0으로원복확인이남아있다. 모든기능/최종독립검토/PR는아직완료되지않았다.

## accf43c 필터 보완 설치본 기본 수용

사용자가확장새로고침완료를알렸다. 새ownlive/VOD를열어sourcewrapper/directVIDEO attached를기다렸다. 두문서bodyactive/knifeFilter1/자식5/임시probeCSS0을확인했다. 실제wrapper1개의computedfilter는knifeFilter이고directVIDEO는nativePZPfilter를유지하며knifeFilter를받지않았다. 임시CSS/설정주입이아닌새전체CSS설치본의한번적용·native보존수용이다. livewrapper1963×1104.75/VODwrapper1949×1096.3125였다.

live주영상은1920×1080/playingready4였다. VOD초기wrapper영상은1280×720/pausedtrue/ready4였으므로재생PASS로세지않았다. 같은문서의정착을추가읽기로확인한뒤주영상1920×1080/playingready4/같은wrapper필터·native보존을확인했다. visible native일시정지버튼과duration22976초의VOD재생상태를관찰했으며버튼입력/play/pause/seek/mute/광고skip을실행하지않았다. 초기정지의원인을추측하거나모든구간무중단재생으로주장하지않는다.

두own탭을닫았고user시청탭/확장저장소/viewport/미디어를변경하지않았다. source/distmainCSShash는위1BD89A...동일이다. 이번에는제품/build나suite를다시실행하지않아앞선122/91/17을fresh실행으로주장하지않는다. 사용자GPU/pixels와시각적변화확인은별도이며현재필터시험값은그대로다. 원래밝기1/대비1/채도1/감마1/선명도0을수동설정UI로복원하고새문서의bodyOFF/자식0/wrappernone/native영상filter보존을확인하는것이다음단계다. 전체기능/최종독립검토/PR은남아있다.

## 원래 필터 복원 및 실제 bfcache 후속 검사

사용자가필터원복완료를알렸다. 새ownlive/VOD에서body knife-filterOFF/knifeFilter자식0/임시CSS0/sourcewrapperfilter none/direct영상nativefilter보존·knifeFilter미적용을확인했다. 이읽기는video ready0/pausedtrue라서새재생PASS로합산하지않는다. own2개를닫았다. 별도home의허용MAIN읽기로설정leaf밝기1/대비1/채도1/감마1/선명도0을확인했다. 미리보기기존설정preview/livePreview/rightClicktrue/customfalse/폭400/지연0.1/음량5도유지됐다. 사용자시각변화확인답변은없어GPU/실제pixels수용을추측하지않는다.

실제ownhome의scope한정pagehide/pageshow listener로persisted만계측했다. 사이드바hover에서처음panel1/visible/영상ready0·pausedtrue를관찰했다. 이후status stream-playback-unavailable/limited이고fatalHLS진단은없었다. 최초대상의stream실패원인은확정하지않아정상재생/제품결함으로합산하지않는다. 해당상태에서정상문서탐색 `/lives`→back를실행했다. 계측pagehide.persistedtrue/pageshow.persistedtrue,같은probe/runtime인실제bfcache복원을확인했다. 복귀configurationready/미리보기hidden/video0이었다.

복귀후첫hoverpoint는native배치변화로stale이었다. elementFromPoint에서실제sidebar/livehit가아님을확인해제품실패로세지않았다. 현재liveanchor의center를실제hit와대조한뒤입력했고hoveredlink1을확인했다. 이후panel1/visible/영상mutedplaying/time29.982771·ready2→39.961153·ready4로재연결·시간진행을확인했다. 이탈후video0/hidden,임시listener2개와probeSymbol을제거하고ownhome을닫았다. 이것은해당홈미리보기bfcache의기본수용이지모든route/스트림/미디어교체/팝업bfcache보장이아니다. 채널·채팅본문/미디어URL을수집하지않았고user탭/확장저장소/미디어/viewport를변경하지않았다.

현재후보전체Node122/122/nativeCSS91/91/필터17/17을새로실행해PASS,source·distpackage각v2.13.2·20resources/diffcheck/mainCSSsource-disthash동일을확인했다. dist를다시빌드하지않았다. ignored로그 `readiness-node.log`, `readiness-styles.log`, `readiness-filters.log`다.

합성무음오디오측정도현재모듈로재실행해exit0/Chrome155.0.8059.39/source1/기본14case의fullscale초과sample0,Gain전환12개가각자의settledendpoint최대step을넘지않음을확인했다. 실제스피커에는0을출력했다. 기존toggle dip(250Hz약0.1447 대baseline0.2632,750Hz약0.1472 대0.2844)와별도stress peak1.95944/초과16000은유지되며해결/주관적음질보장으로주장하지않는다. ignored로그 `final-audio-native.log`와기존 `output/audio-quality/report.json`에기록됐다.

새문맥전체readiness독립검토에서중요2건/경미1건을발견했다. [후속 검토 기록](../reviews/2026-10-08-final-readiness-review.md)에원인/재현/미검증/짧은보완설계승인게이트를남겼다. 승인전제품/회귀파일/build는변경하지않는다. 전체기능완료/PR는아직아니다.
