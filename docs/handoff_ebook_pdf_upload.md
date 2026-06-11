# 핸드오프: 전자책 PDF 업로드 기능 (admin)

> 이 문서를 caselab_admin 프로젝트에서 Claude Code에게 그대로 전달하세요.
> 작성 맥락: 본사이트(caselab)에서 전자책 자동발송(send-ebook)을 복구했는데,
> 상품(`products`)에 **PDF 파일이 연결돼 있지 않아** 발송이 `failed` 남.
> send-ebook Edge Function은 `product.pdf_path` 로 `ebooks` 버킷에서 signed URL을
> 만들어 메일로 보냄. 따라서 admin에서 **PDF를 ebooks 버킷에 올리고 그 경로를
> products.pdf_path 에 저장**하는 기능이 필요함.

---

## 목표 (한 줄)
admin의 전자책 등록/수정 화면에서 **PDF 파일을 업로드**하면, 그 파일이 Supabase
Storage `ebooks` 버킷에 저장되고 경로가 `products.pdf_path` 에 들어가게 한다.

## 반드시 지켜야 할 사실 (본사이트와의 계약)
- **버킷 이름**: `ebooks` (Private 버킷 — 사용자는 signed URL로만 접근).
- **저장 컬럼**: `public.products.pdf_path` (text, nullable). **이미 존재함** — 마이그레이션 불필요.
- **pdf_path 형식**: `ebooks` 버킷 안에서의 **오브젝트 키(경로)** 그대로.
  예) `pdfs/ai-1week-notes-1718000000.pdf`. send-ebook이 `createSignedUrl(pdf_path, ...)`
  를 이 값으로 호출하므로 **버킷 안 실제 파일 경로와 정확히 일치**해야 함.
- send-ebook Edge Function 코드는 **건드리지 말 것** (본사이트 caselab repo 소유). 계약만 맞추면 됨.

## 요구사항
1. **전자책 등록 폼(EbookForm)에 PDF 파일 input 추가**
   - `<input type="file" accept="application/pdf" />`
   - 선택 시 파일명·용량 표시, 50MB 같은 상한 검증(권장).
2. **업로드 → 경로 저장**
   - 파일을 `ebooks` 버킷의 `pdfs/{slug}-{timestamp}.pdf` 경로로 업로드.
   - 성공하면 그 경로를 `products.pdf_path` 에 저장(insert 또는 update).
   - 같은 상품에 재업로드 시 이전 파일 교체(`upsert` 또는 이전 파일 삭제) 정책 결정.
3. **기존 상품에 PDF 붙이기(수정 플로우)** — 신규 등록뿐 아니라 **이미 만들어진 상품**
   (예: slug `ai-1week-notes`)에도 PDF를 나중에 첨부할 수 있어야 함. 목록/수정 화면에서 가능하게.
4. **업로드 주체·권한**
   - 권장: **서버 API route**(`app/api/admin/upload-ebook/route.ts`)에서
     `createSupabaseAdminClient()`(service_role)로 업로드 → 권한 명확, RLS 우회.
   - 대안: 클라이언트에서 `createSupabaseBrowserClient()`로 업로드(anon). 이 경우
     `ebooks` 버킷에 **admin insert를 허용하는 Storage RLS 정책**이 있어야 함(아래 확인).
5. **검증 UX**: 업로드 중 로딩, 실패 시 에러 메시지, 성공 시 현재 연결된 PDF 파일명 표시.

## 재사용 포인트 (이미 있는 패턴)
- 폼/저장 패턴: `components/admin/EbookForm.tsx` — `'use client'` + `useState` +
  `supabase.from('products').insert({...})`. 여기에 파일 input + 업로드 단계만 추가.
- server-side service_role 클라이언트: `lib/supabase/admin.ts` → `createSupabaseAdminClient()`.
  기존 server action 예시: `app/api/admin/invite/route.ts`.
- 브라우저 클라이언트: `lib/supabase/client.ts` → `createSupabaseBrowserClient()`.
- 목록 페이지: `app/admin/ebooks/page.tsx` (products 직쿼리). pdf_path 연결 여부 컬럼 추가하면 운영 편함.
- UI: `components/ui/` (shadcn Input/Button/Label).

## 업로드 코드 스케치 (참고용)
```ts
// 서버 route 권장
const supabase = createSupabaseAdminClient();
const path = `pdfs/${slug}-${Date.now()}.pdf`;
const { error: upErr } = await supabase.storage
  .from('ebooks')
  .upload(path, file, { contentType: 'application/pdf', upsert: false });
if (upErr) throw upErr;
await supabase.from('products').update({ pdf_path: path }).eq('id', productId);
```

## 사전 확인 (구현 전 체크)
- [ ] `ebooks` 버킷이 존재하고 **Private** 인지 (caselab repo `supabase/migrations/0004_storage_policies.sql` 참고).
- [ ] 선택한 업로드 주체에 맞는 **Storage RLS 정책**이 있는지.
  - service_role 사용 → 정책 무관(우회).
  - anon(브라우저) 업로드 → `ebooks` 버킷 INSERT를 `is_admin()` 으로 허용하는 정책 필요. 없으면 신규 마이그레이션 추가.
- [ ] `products.pdf_path` 컬럼 존재 확인 (있음 — 0001_init.sql).

## 완료 기준 (Acceptance)
1. admin에서 PDF 업로드 → `ebooks` 버킷에 파일 생성, `products.pdf_path` 에 동일 경로 저장됨.
2. SQL 확인: `select slug, pdf_path from products where slug='ai-1week-notes';` → 경로 채워짐 +
   그 경로가 `select name from storage.objects where bucket_id='ebooks'` 결과에 존재.
3. 본사이트에서 그 전자책 주문 → 1분 내 PDF 다운로드 링크 메일 도착, `purchases.status='sent'`.
4. 기존 상품에도 나중에 PDF 첨부 가능(수정 플로우 동작).

## 범위 밖 (이번에 하지 말 것)
- send-ebook Edge Function 수정(본사이트 소유).
- 결제/가격 로직 변경(무료 전자책 그대로).
