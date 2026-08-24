# 케이스맵 (CaseMap) — One-Page 기획서

## 1. 컨셉 (한 줄 정의)
caselab 본가에 skilltree 스타일 별자리 맵 페이지 `/map`을 추가해, 발행된 케이스·프롬프트·가이드를 카테고리별 별자리로 펼쳐 "caselab에서 뭘 배워가고 가져갈 수 있는지"를 한 화면에서 직관적으로 보여주는 탐색 씬.

## 2. 기술 스택
- **프레임워크**: 본가 Next.js (App Router) + TypeScript — 맵 씬 자체는 프레임워크 의존 최소(절대배치 div + CSS transform 팬·줌, skilltree map.html 방식)
- **데이터 저장**: Supabase — 빌드 스크립트가 발행된 tools·cases를 `map-data.json`으로 추출(빌드타임 생성). 콘텐츠가 쌓일수록 맵이 자동으로 자람
- **에셋**: 기존 caselab 브랜드 폰트·컬러 토큰, 아이콘은 인라인 SVG

## 3. 핵심 기능 (최대 3개)
1. **별자리 맵**: 카테고리(워크플로·자동화·제작기 + 프롬프트·가이드) = 별자리 클러스터, 발행 콘텐츠 = 리프 노드. 팬·줌·검색, 클러스터 진입 시 확대
2. **상세 패널**: 노드 클릭 → 요약 excerpt + "어떤 아픔을 해결하나" + **본문 이동 CTA**(기존 발행 콘텐츠 재활용, 게이트 없음)
3. **빌드타임 데이터 파이프라인**: DB에서 JSON 생성 — 하드코딩 없음, 발행 게이트 통과한 콘텐츠만 노출

## 4. 디자인 컨셉 (Look & Feel)
- **스타일**: skilltree 기반(다크 스카이 + 별자리 커넥터 + 세리프 대문자 클러스터 라벨) + caselab 무드를 살짝 — 골드 포인트·베이지 아이보리 텍스트
- **컬러**: 배경 `#0E1118` 계열 다크, 텍스트 아이보리 `#E9E4D6`, 포인트 골드 `#C9A96A`(caselab 카드뉴스 골드), 클러스터별 보조색은 저채도로 절제
- **모션**: 클러스터 호버 글로우, 노드 진입 시 fade+translateY, 팬·줌은 CSS transform(GPU)

## 5. 데이터 구조
```json
{
  "categories": [
    {
      "key": "workflow",
      "label": "워크플로",
      "color": "#C9A96A",
      "nodes": [
        {
          "slug": "…",
          "title": "…",
          "type": "case | prompt | guide",
          "pain": "어떤 아픔을 해결하나 (한 줄)",
          "excerpt": "미리보기 발췌",
          "url": "/cases/…"
        }
      ]
    }
  ]
}
```

---
### 참고 — skilltree 구조 스터디 결론 (2026-08-24)
- skilltree 맵 = 프레임워크 없는 정적 HTML 1개(212KB), 데이터는 손으로 쓴 JS 상수(TREE/PLAYBOOK/SKILL_PREVIEWS), Next.js가 iframe으로 감쌈
- 대시보드 KPI는 전부 하드코딩 데모 — 실데이터 아님
- caselab은 DB가 있으므로 하드코딩 대신 빌드타임 JSON 생성으로 차별화
