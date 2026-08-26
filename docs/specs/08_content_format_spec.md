# 콘텐츠 입력 포맷 스펙 (#6 상세페이지 스터디)

> 작성: 2026-06-08 · 출처: 본가 `caselab` repo `types/{content,prompt,tool,guide,product}.ts`
> 목적: admin '새 콘텐츠' 타입별 입력 폼 재설계 근거. 각 타입의 사용자 상세페이지가 실제로 렌더하는 필드 = 폼이 받아야 할 필드.

## 결론 요약
- 콘텐츠는 **2개 저장소**로 나뉜다: `contents`(case/trend) · `tools`(prompt/tool/guide/context-card). ebook은 `products`.
- 현재 admin 폼(TrackForm·ToolForm·GuideManager·EbookForm)은 **상세페이지 모델보다 단순** → 아래 필드까지 확장 필요.
- 본문(body)은 모두 **jsonb 구조화 블록**. 폼은 "섹션 추가/블록 추가" 형태의 반복 입력이 핵심.

---

## 1. 실전 케이스 (`contents.track='case'`)
**공통(ContentRow)**: title, summary, slug, job_tags[](8종), persona_coverage[](A~E), read_min, apply_min, thumbnail_url, author_quote, status, curated
**본문(CaseBody, D70 7섹션 — 모두 optional, 없는 섹션은 미렌더)**:
- `forWho[]` — 누구를 위한 글
- `caseIntro[]` — 도입 블록
- `painPoints[]` `{num, title, symptom, rootCause}`
- `frameworkReference` `{name, description, sourceLabel?, sourceTitle?, sourceUrl?, sourceThumbnail?}`
- `stepCards[]` `{num, label, description?, human, ai, prompt, goodResult?, badResult?}`
- `pros[]` / `cons[]`
- `takingPoints[]` `{title, description, action?}`
- (legacy 4섹션: essence·framework·failures·review·customization[4] — 신규 작성은 7섹션 권장)

## 2. AI 트렌드 (`contents.track='trend'`)
**공통**: ContentRow 동일
**본문(TrendBody, 7 optional 섹션)**:
- `what[]` 무슨 소식 · `why[]` 왜 화두 · `forWho[]` `{role, why}` · `keyPoints[]` 핵심 3가지
- `deepDive[]` 좀 더 · `soWhat[]` 내 일엔? · `sources[]` `{label, url}`

### 공통 Block 종류 (case/trend 본문 블록)
text(markdown) · heading(level 2/3) · prompt(label, prompt) · result-compare(good, bad) · role-card(human, ai) · intent(step, text) · evaluation(good, bad) · rebuttal(hypothesis, counter) · framework-ref(name, url?) · context-card(title, fields[]) · checklist(title, items[]) · failure(title, blocks[])

## 3. 프롬프트 (`tools.category='prompt'`)
PromptItem: title(=name), slug, **prompt(복사 대상 본문)**, category(`think|make|verify|refine`), source?, sourceUrl?
→ 현재 ToolForm로 처리되나, **복사 본문·4분류**가 핵심. prompt 전용 간이 폼 권장.

## 4. 쓸만한 도구 (`tools.category='tool'`)
Tool: name, slug, category(`design|automation|research|writing|presentation|coding`), description, thumbnail_url/emoji, pricing_label, is_paid, pro_pricing, has_review, url, status
**body(ToolBody)**: audience, tags[], about{heading, paragraphs[]}, whenToUse[{icon,title,desc}], features[{title,desc}], pricing[{name,amount,includes}], pricingNote, useCases[{href,tag,title,meta}]

## 5. 공식 가이드 (`tools.category='guide'`)
GuideItem: title, slug, description, **url**, category(`prompt|cases|education|skills|agents`), source, sourceType(`default|github|course`), thumbLabel, thumbBg?, thumbColor?, linkLabel?
→ 현재 GuideManager는 name/url/description/분류(job_tags)만 → **category enum·source·sourceType·thumbLabel** 확장 필요.

## 6. ebook (`products`, #8 보강)
ProductRow: title, slug, description, price, thumbnail_url
**body(EbookBody)**: subtitle, rating, reviewCount, format, volume, jobs, updated, intro[], stats[{num,label}], toc[{title,desc}], whoFor[{icon,title,desc}], reviews[{author,rating,text}]
→ 현재 EbookForm는 price/read_minutes/description만 → **toc·whoFor·stats·intro** 확장 필요.

---

## 폼 재설계 작업 목록 (다음 단계)
1. **새 콘텐츠 진입** = 타입 선택(케이스/트렌드/프롬프트/도구/가이드) → 타입별 폼 분기.
2. **TrackForm**: D70 7섹션(case)·7섹션(trend) 구조화 입력으로 확장(현재 단순 본문).
3. **프롬프트 간이 폼** 신설: 복사 본문 + 4분류 + 출처.
4. **ToolForm**: ToolBody(whenToUse·features·pricing·useCases) 반복 입력 확장.
5. **GuideManager**: category enum 5종·source·sourceType·thumbLabel로 확장.
6. **EbookForm**: EbookBody(toc·whoFor·stats·intro) 확장.

> 본문 블록/섹션 반복 입력 UX가 공통 과제 → 재사용 가능한 "섹션·블록 에디터" 컴포넌트 1개를 먼저 만들고 타입별로 조합하는 것을 권장.
