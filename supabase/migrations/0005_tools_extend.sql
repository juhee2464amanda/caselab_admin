-- 0005_tools_extend.sql
-- Date: 2026-06-06
-- 관련 PR: feat(tools) #16 — types/tool.ts Tool 인터페이스 정합
-- 목적: tools 테이블에 mockup tools.html 정합용 5컬럼 추가.
--       기존 데이터 영향 0 (모든 컬럼 nullable / boolean default).
--       ADD COLUMN IF NOT EXISTS로 멱등성 보장 (재실행 안전).

ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS thumbnail_emoji text,
  ADD COLUMN IF NOT EXISTS pricing_label  text,
  ADD COLUMN IF NOT EXISTS is_paid        boolean,
  ADD COLUMN IF NOT EXISTS pro_pricing    text,
  ADD COLUMN IF NOT EXISTS has_review     boolean DEFAULT false;

-- 사용 의도 기록 (admin UI 폼 작성·운영 매뉴얼 참조용)
COMMENT ON COLUMN public.tools.thumbnail_emoji IS
  'mockup placeholder emoji (thumbnail_url null일 때 카드에 표시). 예: 🔍 💬 📊';
COMMENT ON COLUMN public.tools.pricing_label IS
  '카드 노출 라벨. 예: "무료 플랜", "유료", "Pro $20/월"';
COMMENT ON COLUMN public.tools.is_paid IS
  '유료 여부. true면 회색 태그, false면 녹색 무료 태그로 렌더';
COMMENT ON COLUMN public.tools.pro_pricing IS
  '추가 가격 라벨 (예: "Pro $20/월"). 무료 플랜 + Pro 둘 다 표시할 때 사용';
COMMENT ON COLUMN public.tools.has_review IS
  '사용기 콘텐츠 있음 → "사용기 1편" 배지 표시 여부';

-- 실행 방법:
--   1. Supabase Dashboard → SQL Editor
--   2. 본 파일 내용 전체 복사 → Run
--   3. tools 테이블 컬럼 5개 추가 확인
--   4. caselab_admin/ ToolForm에서 새 5컬럼 입력 폼 확장 (별도 작업)
