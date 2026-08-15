# 카드프레스 (CardPress) — One-Page 기획서

> caselab admin 콘텐츠 스튜디오 내 "카드뉴스" 기능. 발행 콘텐츠 → 인스타 캐러셀·캡션·스레드 글 자동 생성 → 검수 → 원클릭 채널 발행.

## 1. 컨셉 (한 줄 정의)
본가(caselab)에 콘텐츠가 발행되는 순간 인스타 캐러셀·캡션·스레드 글 3종 세트가 자동 생성되어 대기하고, 운영자는 검수 후 채널 선택 → 원클릭 발행만 하는 SNS 발행 자동화 파이프라인. (목표 체감: 편당 1~2시간 → 3~5분)

## 2. 기술 스택
- **프레임워크**: 기존 caselab admin 스택 — Next.js (App Router) + Tailwind CSS + TypeScript
- **데이터 저장**: Supabase (Postgres + Auth + Storage + Webhook/Edge Function)
- **AI**: Claude API — 슬라이드용 텍스트 압축 재작성 · 캡션 · 스레드 글 생성
- **렌더/발행**: `@vercel/og`(Satori) 서버사이드 PNG 렌더(1080×1350) · Instagram Graph API · Threads API · Unsplash API · jszip
- **에셋**: Pretendard(woff, Satori 임베드) · 캐러셀 템플릿 14종 (`content/instagram/carousel-template/` → Satori 호환 React 컴포넌트 포팅)

## 3. 핵심 기능 (3개)

### ① 발행 트리거 → 3종 세트 자동 생성
- `contents`/`tools`가 `status='published'`로 전환되는 순간 Supabase Webhook으로 파이프라인 실행. **소스는 발행 완료 콘텐츠만** (제약).
- 산출물은 채널별로 다름:
  - **인스타 캐러셀** — track별 레시피(case 8장 / trend 5장 / tool 6장)를 출발점으로, **실제 존재하는 섹션만 유연 매핑**. 모든 본문 섹션은 optional이므로 콘텐츠마다 장수·구성이 달라지는 게 정상. 섹션당 후보 템플릿 복수 시(keyPoints→B2/B7) 대안 제시.
  - **인스타 캡션** — summary + takingPoints 기반 + 고정 해시태그 세트(#케이스랩 #AI활용 #일잘러 #업무효율 #AI실험 + 카테고리별) 자동 조립.
  - **스레드 글** — 스레드 네이티브 텍스트로 재작성 + **본가 콘텐츠 URL 자동 첨부**(유입 트래픽 확보 — 인스타는 링크 불가, 스레드만의 역할) + 커버 이미지 1장 선택형.
- **본문 이미지 자동 추출** — 발행 본문 속 이미지(스크린샷·썸네일·frameworkReference 썸네일)를 추출해 B2(media)·B9(shot)·C1(커버 배경)에 자동 배치. 이미지 트레이에 나열되어 클릭/드래그 재배치.

**블록 → 슬라이드 매핑 테이블**
| 콘텐츠 블록 | 슬라이드 |
|---|---|
| title+summary+thumbnail | C1/C2/C3 커버 (track별) |
| caseIntro / what | B4 인용·선언 |
| painPoints / keyPoints | B2 **개요**(lead 핵심 한 줄 + 번호 목록) 또는 B7 숫자 |
| frameworkReference+stepCards 순서 | B1 타임라인 |
| stepCards{human,ai} | B2 / B6 스텝 |
| stepCards.prompt / prompt 블록 | B8 복사용 프롬프트 |
| goodResult/badResult · pros/cons · result-compare | B5 잘된것/별로였던것 ★ (2026-08-14 다크 편집형 재디자인 · layout split/versus) |
| takingPoints / soWhat | P5 마무리 정리(결론 lead + 행동 2~3개) — O1(포인트색 CTA 카드)은 톤 불일치로 삭제(2026-08-13), 저장·댓글 유도 문구는 캡션 전담 |

씨앗(content_seeds) 소스는 커버 다음에 **개요 슬라이드**(`seed:overview`)를 항상 깐다 — 문단을 그대로 나열하면 "무슨 일인지 한눈에"가 없어 커버 다음에서 이탈한다.

### ② AI 슬라이드용 재작성 (자동화의 핵심)
- 웹 본문을 그대로 넣지 않고 Claude API로 슬라이드 규격에 맞게 압축: 커버 제목 ≤17자 · 불릿 1줄 · B5 요약.
- **정체성 가드레일 내장**: cons 존재 시 B5 슬라이드 무조건 포함 · 형광펜 `.hl` 슬라이드당 1개 · 과장 표현 금지 톤 준수.
- **텍스트 오버플로우 자동 검사** — 줄수 초과 시 재압축 루프.
- 커버 이미지 부족 시: 제목→**메타포 검색어 자동 제안**(문장 속 구체 명사 추출) + Unsplash 인라인 검색·선택 / 직접 업로드 / 그라데이션 폴백.

### ③ 검수 스튜디오 + 원클릭 채널 발행
- **검수 화면**: 좌 — 슬라이드 리스트(on/off·순서변경·템플릿 교체·인라인 편집), 우 — 실비율 캐러셀 프리뷰 + 캡션/스레드 글 편집 패널.
- **템플릿 시각 피커(2026-08-15)**: 슬라이드 행 [템플릿] · [+ 빈 슬라이드 추가]에서 21종 전체를 **실제 렌더 모양**으로 고른다(계열별 그룹 · 사진 자리 유무 배지 · "사진 들어가는 것만" 필터). 교체 모드는 지금 슬라이드의 글을 각 템플릿에 얹은 미리보기를 보여준다. 이름만 나열하던 시절엔 계획이 준 대안 2~3개(주로 "블랙…")만 보여 사실상 고를 수 없었다.
- **로컬 템플릿 변환(`lib/cardpress/convert.ts`)**: 제목/라벨/부연/문단/목록/빅넘버/사진의 공통 자루로 환원한 뒤 목표 템플릿의 필수 필드를 다시 채운다 — **AI 호출·대기 없음**. 재료가 모자라면(`missing`) 그 칸은 "AI 재작성"으로 넘긴다. `sourceSection`이 없는 수동 추가 슬라이드도 이 경로로 교체할 수 있다(예전엔 "sourceSection이 없어 재작성할 수 없어요"로 막혔다).
- **사진 자리 없는 템플릿에 이미지 배치**: 이미지를 놓으면 막지 않고 `PHOTO_ALT`의 짝(B3→P2 · B1/B6→P1 · B7→P6 · B8→P5 · C2/C3/C4→C1)으로 갈아탈지 물어본 뒤 글을 그대로 옮겨 사진을 넣는다. **C2·C3는 스키마상 `coverImage`를 받지만 렌더러가 배경을 안 그린다** — 그래서 "사진 자리 없음"으로 취급한다(넣어도 아무 일도 안 일어나던 조용한 무반응 제거).
- **사진 출처 표기(2026-08-15, migration 1027 `photo_credits`)**: Unsplash API Guidelines는 라이선스와 별개로 사진가·Unsplash 표기를 요구하는데, `generate.ts`가 `photoCredits`를 계산해 놓고 **저장하지 않아 그대로 버려지고 있었다**. 이제 생성 시 저장하고, 검수 UI가 **지금 카드에 실제로 깔린 사진**(활성 슬라이드 + 스레드 커버)만 골라 캡션·스레드 글에 넣는다 — 사진을 갈아끼우면 표기도 따라 바뀌고, 표기 대상이 사라졌는데 글에 줄이 남아 있으면 경고 + [출처 줄 지우기]. 재삽입은 중복이 아니라 교체. 해시태그 문단이 맨 끝이면 그 앞에 들어간다. 인스타는 이름만(링크 안 눌림), 스레드는 UTM 링크 포함.
- **이미지 소스 = 원본 콘텐츠 / Unsplash 2탭(`/api/cardpress/source-images`)**: 스톡만으로는 "그 콘텐츠의 사진"이 안 나온다. 소스에 붙은 원본 링크(씨앗 `source_url`·본문 링크 / 콘텐츠 `body.sources`·`frameworkReference.sourceUrl` / 자료실 `tools.url`)를 서버에서 긁어 og:image + 본문 `<img>`를 후보로 준다. 운영자가 참고 링크를 직접 붙여넣는 입력도 함께. WebP·AVIF·아이콘·로고·소형(w<320)은 자동 제외(Satori가 WebP를 검게 렌더), 사설망 주소는 차단.
- **발행**: [발행] → 채널 복수 선택(☑ Instagram 캐러셀+캡션 ☑ Threads 글+링크+커버) → 즉시 게시 → `published_to` 이력 기록.
- PNG는 `@vercel/og` 서버 렌더 → Supabase Storage **공개 URL** 업로드(IG/Threads API 요구사항). zip 일괄 다운로드는 백업 옵션.
- 선행 1회 세팅: Meta 개발자 계정 + Instagram 비즈니스/크리에이터 계정 연결 + Threads 토큰.

## 4. 디자인 컨셉 (Look & Feel)
- **스튜디오 UI**: caselab admin 기존 톤 준수.
- **슬라이드**: 캐러셀 템플릿 시스템 그대로 — 다크+볼드+형광펜, Pretendard, 1080×1350(4:5).
- **컬러**: 카테고리 자동 적용 — cat-case #2F6BFF(블루) · cat-trend #7C3AED(바이올렛) · cat-tool #0E9F6E(에메랄드) · Bad #E11D48(레드).
- **원칙**: 핵심 단어 형광펜 1개 · 솔직 후기(B5) 필수 · CTA는 저장 유도(팔로우 구걸 ❌).
- **가시성(폰 기준)**: 본문 글자 크기는 고정값이 아니라 **내용량으로 역산**(`lib/cardpress/templates.tsx`의 `fitBlock`) — 남는 공간에 들어가는 최대 크기를 쓰고 넘치면 단계적으로 줄인다. 본문 블록은 세로 가운데 정렬해 아래만 텅 비지 않게 한다. 불릿 32px 고정이던 시절엔 짧은 슬라이드가 카드 절반을 비우고도 글씨가 작았다(2026-07-31).
- **개요 위계**: 개요 슬라이드는 나열이 아니라 위계 — 가장 중요한 사실 1개를 `lead`(큰 패널), 나머지는 번호 목록 2~3개. 같은 굵기 불릿만 4개면 무엇이 중요한지 안 보인다.
- **B5 재디자인(2026-08-14)**: 파스텔 라운드 패널 + 원형 ✓/✕ 배지는 프레임워크 alert 컴포넌트 룩이라 이 장만 "제품 UI"로 튀었다 → 다크 편집형으로 교체. 헤어라인 라벨(골드=잘된 것 / 코랄=별로였던 것) + 구분선, 본문 순백, 색은 라벨과 강조 1구절에만. `layout: 'split'`(사진 밴드+상하 2단) | `'versus'`(좌우 대비), 미지정 시 항목 길이로 자동(≤26자면 versus). 글자가 커진 만큼 린트 상한을 55자 → 38자(split)/24자(versus)로 조였다. 구 구현은 `**강조**` 마커를 em() 없이 raw 출력해 별표가 화면에 그대로 나갔다(같이 수정).
- **P 계열(사진 편집형 본문, 2026-08-13)**: 벤치마크는 커버뿐 아니라 **전 장이 사진 기반**(photo-hook 69%)인데 흰 배경 B 계열만 쓰면 캐러셀 2장째부터 "제품 UI" 인상이 난다("AI티" 피드백의 원인). P1 스플릿+번호목록 · P2 스플릿+문단 · P3 풀블리드 · P4 사진인용 · P5 블랙아웃+목록 · P6 블랙아웃+빅넘버. 문법: 알약 배지 → 헤어라인+트래킹 라벨, 불릿 점 → 번호+1px 구분선, **강조는 카드당 1구절**(골드 #E8B857), 텍스트는 반드시 스크림 위. B 계열은 그대로 살아 있고 계획의 alternatives로 서로 교체 가능.
- **시각 리듬**: 같은 레이아웃 3장 연속 금지 — 정보형(P1/P2·B계열) 사이에 호흡 장(P3·P4·P6)을 끼운다. 단 재료 없는 호흡 장은 만들지 않는다.
- **렌더 검수 자동화**: `node scripts/cardpress-verify.mjs` (dev 서버 필요) — 템플릿 전수를 실렌더해 ①글자 소실(Satori가 `color:'inherit'`·`undefined` 스타일 값을 못 받아 글자가 사라지거나 응답이 통째로 죽는 사고, 실발생 2026-08-13) ②밝은 글자의 사진 위 실대비(<3:1 실패, <4.5:1 경고) ③가장자리 오버플로를 픽셀로 검사한다. 템플릿을 추가·수정하면 SAMPLES에 대표 샘플을 넣고 이 스크립트가 통과해야 제안·머지한다.

## 5. 데이터 구조
```json
{
  "content_cards": {
    "id": "uuid",
    "source_type": "content | tool",
    "source_id": "uuid — published 콘텐츠만 (제약)",
    "slides": [
      { "template": "C1", "order": 1, "enabled": true,
        "props": { "title": "AI 압축 제목(≤17자)", "hl": "핵심 단어", "coverImage": "url" },
        "sourceSection": "title+summary" },
      { "template": "B5", "order": 5, "enabled": true,
        "props": { "good": "...", "bad": "..." },
        "sourceSection": "pros/cons", "required": "cons 존재 시 필수" }
    ],
    "accent": "cat-case | cat-trend | cat-tool",
    "extracted_images": ["본문 추출 이미지 url"],
    "ig_caption": "캡션 자동 초안 + 해시태그 (편집 가능)",
    "threads_text": "스레드용 재작성 글 + 본가 URL (편집 가능)",
    "threads_cover": "url | null",
    "status": "auto_draft | reviewed | published",
    "published_to": [
      { "channel": "instagram", "post_id": "...", "at": "timestamptz" },
      { "channel": "threads", "post_id": "...", "at": "timestamptz" }
    ]
  }
}
```

## 6. 사용 시나리오 (운영자 기준)
1. admin에서 콘텐츠를 published로 전환 (기존 워크플로우 그대로)
2. 콘텐츠 스튜디오 → 카드뉴스 탭: **3종 세트가 이미 auto_draft로 대기 중**
3. 검수 2~3분 — 프리뷰 스와이프, 문구 미세 수정, 커버 이미지 후보 중 클릭
4. [발행] → ☑ Instagram ☑ Threads → 완료. 이력 자동 기록

## 7. MVP 범위 밖 (v2)
- 예약 발행 (화/금 발행 리듬)
- AI 커버 이미지 생성 (브랜드 색 통일 배경)
- 발행 후 성과 역수집 (좋아요·저장 수)
