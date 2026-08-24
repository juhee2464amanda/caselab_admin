# 케이스맵 (CaseMap) — further 기능 (콘텐츠 더 쌓은 뒤 재논의)

> 2026-08-24 스터디·기획·목업까지 완료. **발행 콘텐츠가 더 쌓이면 재개.**

## 이 폴더

- `case-map.md` — One-Page 기획서 (스코프 `/map`, DB 빌드타임 JSON, 미리보기→본문 CTA)
- `case-map-mockup.html` — 동작하는 목업. 로컬에서 열려면: `python3 -m http.server 8722` 후 `/case-map-mockup.html`
- `skilltree-reference/` — skilltree.altari.ai 원본 소스 (스터디용 사본)

## 스터디 결론 (skilltree.altari.ai)

- 맵 = **프레임워크 없는 정적 HTML 1개**(map.html, 212KB). React/캔버스 아님 — 절대배치 div + CSS transform 팬·줌. Next.js 사이트가 iframe으로 감쌈
- 데이터 = 손으로 쓴 JS 상수: `TREE`(부서→기능→직무), `PLAYBOOK`(content.js, 직무별 상세), `SKILL_PREVIEWS`(마케팅 발췌만 공개, 풀 파일은 이메일/구매 게이트)
- 대시보드 KPI는 전부 하드코딩 데모 — 실데이터 아님
- 커넥터는 SVG line, 별은 div, 클러스터 라벨은 Marcellus 세리프 대문자

## 목업 v2에 이미 들어간 것 (2026-08-24 기준 실데이터)

- Supabase published 콘텐츠 28건: 가이드 19 · 도구 4 · 프롬프트 2 · 케이스/트렌드 3
- 별자리 6개: 프롬프트 · 도구 · 케이스 · 공식 문서 · 무료 코스 · 깊이 읽기
- 노드 클릭 → 패널(유형 배지·아픔 한 줄·미리보기·본가 URL CTA)
- **노드 간 연계**: 평소 희미한 금색 점선 곡선 → 클릭 시 관련 별로 가는 선 발광 + 상대 별 맥동, 패널의 연계 칩 클릭 시 그 노드로 팬 이동
- 검색(미매칭 별 흐려짐), 드래그 팬, 휠 줌

## 재개 시 남은 일

1. 연계(rel) 생성 전략 확정 — job_tags 자동 매칭 + 에디터 큐레이션 병행
2. 빌드 스크립트: Supabase → `map-data.json` (published만, 발행 게이트 준수)
3. 본가 `/map` 라우트에 씬 이식 (mockup은 단일 HTML이라 그대로 iframe 가능)
4. 모바일 대응 (현재 데스크탑 기준)
