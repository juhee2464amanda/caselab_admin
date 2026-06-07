-- 0009_products_body.sql
-- Date: 2026-06-07
-- 목적: ebook 상세 페이지(mockup ebook-detail.html) 정합용 풍부한 본문 저장.
--       products에 body jsonb 추가 — { stats[], toc[], whoFor[] } 구조.
--       nullable, 기존 데이터 영향 0. 멱등(IF NOT EXISTS).

alter table public.products
  add column if not exists body jsonb;

comment on column public.products.body is
  'ebook 상세 본문 (mockup 정합): { stats:[{num,label}], toc:[{title,desc}], whoFor:[{icon,title,desc}] }';

-- 실행: supabase db push (Caselab-prod 링크됨).
