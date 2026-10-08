# 홈 추천 방송 숨김 복구 — 설치본 수용 대기

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

## 다음 게이트

새 dist를 적용하려면 사용자가 로컬 시험판 확장을 새로고침하고 ‘홈 → 추천 방송 숨기기’ 옵션을 켠 뒤 페이지를 다시 로드해야 한다. 실제 자동 표지·저장 옵션ON/OFF·다른 화면 전환의 설치본 수용이 아직 남아 있다. 현재 도구는 확장 설정 페이지를 직접 제어할 수 없어 이 필요 단계에서 중지한다.

사용자의 ‘검증 승인’은 이 수정/검증 범위의 승인으로 해석했으며, 전체 화면이 정상 동작했다는 답변으로 해석하지 않았다. 전체 화면·삭제 채팅 지원 제한·허용-DVR/광고 안전성·시작 시각/후원 유형·나머지 스타일 조합/전체 수용은 계속 미완료다. 한글 기여 PR을 아직 열지 않는다.
