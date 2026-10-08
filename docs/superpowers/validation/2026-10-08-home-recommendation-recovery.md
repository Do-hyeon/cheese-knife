# 홈 추천 방송 숨김 복구 — 설치본 좁은 화면 FAIL

2026-10-08. 사용자가 홈 추천 영역만 숨기고 팔로잉·다시보기·다른 페이지는 보존하는 제한 설계를 ‘검증 승인’했다. 작업 기준은 `982bcc0`, 복구 시험판 v2.13.2다. 전체 기능 정상 판정이나 한글 PR 승인서는 아니다.

## 원인과 수정 범위

현재 일반 홈(`/`)에서는 옛 `home_recommend_live_container__` 타깃이0개이고, section의 직접 자식인 `_grid_`/`_is_two_columns_` 추천 grid는1개다. 팔로잉·최근 다시보기의 `_list_`/`_type_vod_` 영역은2개였다. 옛 CSS로 현재 추천 grid를 숨길 수 없는 것이 원인이다.

- coordinator가 설정 준비 후 정확한 `/` 경로의 `#layout-body`에만 `data-knife-home="1"`을 표시한다. 다른 탐색·장르 홈·VOD·제외 경로는 표시하지 않는다.
- route/root 소유 scope가 바뀌거나 문서를 최종 해제하면 본인이 표시한 값만 제거한다. persisted bfcache는 보존한다. native subtree를 `.knife-owned`로 표시하지 않으므로 기존 DOM 관찰을 차단하지 않는다.
- `hide-recommended-live.css`는 표시된 홈 루트 안에서 확인한 section/direct two-column grid만 숨긴다. 옛 추천 선택자도 보존한다.
- 설정 키·저장값·manifest·권한·vendor·컴프레서·미리보기는 변경하지 않는다. 화면 표지는 공개 DOM의 시각적 scope이며 인증 경계가 아니다.

숨기는 것은 **상단 일반 추천 방송 grid**다. 별도의 편집/행사 ‘추천 콘텐츠’, 프로모션, 팔로잉·최근 다시보기는 보존한다. 장르별 `/home/...` 화면의 추가 추천 구성까지 복구했다고 주장하지 않는다.

## 회귀와 빌드 검증

- production coordinator 검사3개 RED→GREEN: exact home/다른 route, layout root 교체·detached marker 정리·홈 재진입, persisted pagehide/pageshow와 최종 해제.
- 실제 CSS 엔진 검사3개 추가: 현재 추천만 숨김/팔로잉·VOD·다른 grid·nested grid·외부 영역 보존, 표지 없는 route 보존+legacy 지원, 스타일 제거 원복. 첫 현재 추천 사례는 기존 CSS에서 block≠none으로 FAIL했다. 나머지 보호 사례는 기존 동작의 characterization도 포함한다.
- native CSS 전체36/36, Node 전체101/101 PASS. `node scripts/build.mjs`와 source/dist 패키지 v2.13.2/20 entry resources PASS. 수정 inject.js와 CSS의 source/dist SHA256 일치, diff check PASS.
- 작성자 자체 검토: 기존 route-owner 정리 경로를 사용해 새 observer/타이머를 추가하지 않고, config 변경/SPA/제외 경로/문서 수명에 따라 scope가 정리된다. 첫 추천의 위치를 임의 nth-child로 추측하지 않는다. 앞선 전체 브랜치 독립 검토를 이번 후속 변경의 독립 승인으로 재사용하지 않는다.

재현: `node --test tests/*.test.cjs`, `node scripts/check-styles.mjs --chrome`, `node scripts/build.mjs`, `node scripts/check-package.mjs`. 브라우저 CSS 진단은 Node suite와 별도다.

## 실제 홈 A/B — 임시 표지/CSS 검사

별도 사용자 Chrome 홈 탭에서 현재 설치본의 홈 표지가null인 것을 확인했다. 새 product JS가 이미 실행됐다고 주장하지 않고, 임시 표지와 source CSS를 적용해 소비 영역을 검사했다.

| 영역 | 적용 전 | 적용 중 | 원복 후 |
| --- | --- | --- | --- |
| 상단 일반 추천 방송 | block/500.875px | none/0px | block/500.875px |
| 팔로잉 채널 라이브 | block/338.9375px | 동일 | 동일 |
| 방금 놓친 라이브 다시보기 | block/425.9375px | 동일 | 동일 |

숨긴 section의 공간도 제거돼 아래 목록이 위로 이동했다. 편집 추천 콘텐츠·행사/프로모션 영역은 보존됐다. 검사 후 style 제거·기존 marker null 복원·진단 Symbol 제거를 확인하고 탭을 닫았다. 사용자 시청 탭·저장 옵션은 바꾸지 않았다. screenshot은 ignored `output/acceptance/home-recommendation-hidden.png`에만 저장한다. 채팅·쿠키·토큰·signed URL·개인화 목록 데이터는 공개 기록/fixture에 저장하지 않았다.

## 설치본 수용 — 5a4a7b9

사용자가 새로고침/옵션ON을 완료한 뒤 실제 설치본을 검사했다. 임시 CSS/marker 주입 없이 일반 홈의 자동 marker=1, 추천 display:none/height0, 팔로잉338.9375px/최근 VOD425.9375px 보존을 확인했다. 홈→전체 방송(`/lives`)의 실제 링크 이동에서 같은 문서 내 현재/이전 root marker=null로 정리됐다. 홈 로고의 포인터 click은 이동하지 않아 성공으로 기록하지 않았으며, 키보드 Enter로 홈 복귀한 뒤 같은 문서에서 marker=1/추천 숨김/두 목록 보존을 확인했다. 진단 Symbol과 포커스를 제거했다.

반응형 수용은 **FAIL**이다. 2560px에서는 직접 UL이 `_grid_… _is_two_columns_…`여서 숨겨지지만,1200px에서 native React 재렌더 후 `_is_two_columns_…`가 제거되고 `_grid_…`만 남는다. marker=1은 유지되는데 추천 section이 block/387.875px로 다시 표시된다. 팔로잉284.421875px/최근 VOD369.421875px는 보존됐다. resize 직후의 과도기 DOM이나 타깃0개를 PASS로 세지 않는다. 두 번째 별도 홈 탭에서도 넓음→좁음→넓음→좁음의 클래스/표시 변화로 원인을 확인했다.

현재 공개 DOM에서 일반 추천의 경계는 `_swap_…`의 직접 자식 `_content_…` 안의 직접 section/direct `_grid_…`다. 해당 경계로 narrow 선택자를 한정하는 CSS 후속 변경을 제안하지만 아직 구현하지 않았다. 임의 첫 section/nth-child나 모든 페이지 grid를 숨기는 변경은 하지 않는다. narrow 재현과 보호 영역 회귀, 폭 변화 후 재렌더 검사가 필요하다.

임시 viewport는 reset하고 agent 검사 탭을 닫았다. 사용자 시청 탭/확장 저장 설정은 바꾸지 않았다. 설치본 성공/좁은 화면 실패 screenshots는 ignored `output/acceptance/home-installed-5a4a7b9.png`, `home-narrow-failure-5a4a7b9.png`에만 저장했다. 기존 저장 옵션OFF 수용도 아직 미검증이다.

## 다음 게이트

좁은 화면의 제한 CSS 후속 설계 승인 전 product code를 수정하지 않는다. 수정/회귀/빌드 이후에도 실제 설치본에 적용하려면 사용자의 수동 확장 새로고침이 필요하다. 현재 도구로 확장 설정 페이지를 직접 제어할 수 없으며 우회하지 않는다.

사용자의 ‘검증 승인’은 이 수정/검증 범위의 승인으로 해석했으며, 전체 화면이 정상 동작했다는 답변으로 해석하지 않았다. 전체 화면·삭제 채팅 지원 제한·허용-DVR/광고 안전성·시작 시각/후원 유형·나머지 스타일 조합/전체 수용은 계속 미완료다. 한글 기여 PR을 아직 열지 않는다.
