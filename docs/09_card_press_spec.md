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
| painPoints / keyPoints | B2 불릿 (또는 B7 숫자) |
| frameworkReference+stepCards 순서 | B1 타임라인 |
| stepCards{human,ai} | B2 / B6 스텝 |
| stepCards.prompt / prompt 블록 | B8 복사용 프롬프트 |
| goodResult/badResult · pros/cons · result-compare | B5 잘된것/별로였던것 ★ |
| takingPoints / soWhat | O1 마무리·CTA |

### ② AI 슬라이드용 재작성 (자동화의 핵심)
- 웹 본문을 그대로 넣지 않고 Claude API로 슬라이드 규격에 맞게 압축: 커버 제목 ≤17자 · 불릿 1줄 · B5 요약.
- **정체성 가드레일 내장**: cons 존재 시 B5 슬라이드 무조건 포함 · 형광펜 `.hl` 슬라이드당 1개 · 과장 표현 금지 톤 준수.
- **텍스트 오버플로우 자동 검사** — 줄수 초과 시 재압축 루프.
- 커버 이미지 부족 시: 제목→**메타포 검색어 자동 제안**(문장 속 구체 명사 추출) + Unsplash 인라인 검색·선택 / 직접 업로드 / 그라데이션 폴백.

### ③ 검수 스튜디오 + 원클릭 채널 발행
- **검수 화면**: 좌 — 슬라이드 리스트(on/off·순서변경·템플릿 교체·인라인 편집), 우 — 실비율 캐러셀 프리뷰 + 캡션/스레드 글 편집 패널.
- **발행**: [발행] → 채널 복수 선택(☑ Instagram 캐러셀+캡션 ☑ Threads 글+링크+커버) → 즉시 게시 → `published_to` 이력 기록.
- PNG는 `@vercel/og` 서버 렌더 → Supabase Storage **공개 URL** 업로드(IG/Threads API 요구사항). zip 일괄 다운로드는 백업 옵션.
- 선행 1회 세팅: Meta 개발자 계정 + Instagram 비즈니스/크리에이터 계정 연결 + Threads 토큰.

## 4. 디자인 컨셉 (Look & Feel)
- **스튜디오 UI**: caselab admin 기존 톤 준수.
- **슬라이드**: 캐러셀 템플릿 시스템 그대로 — 다크+볼드+형광펜, Pretendard, 1080×1350(4:5).
- **컬러**: 카테고리 자동 적용 — cat-case #2F6BFF(블루) · cat-trend #7C3AED(바이올렛) · cat-tool #0E9F6E(에메랄드) · Bad #E11D48(레드).
- **원칙**: 핵심 단어 형광펜 1개 · 솔직 후기(B5) 필수 · CTA는 저장 유도(팔로우 구걸 ❌).

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
