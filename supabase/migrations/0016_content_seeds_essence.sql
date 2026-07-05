-- 씨앗 카드에 '핵심'을 앞세우기 위한 essence(추출 요약) 컬럼.
-- scoreSeed(로컬 AI 채점)가 채점하면서 함께 추출해 저장한다.
--   essence.headline : 제목 대체용 한 줄 핵심(버킷 성격 반영)
--   버킷별 상세(펼쳐서 봄):
--     service   : { what, feature, category }  무엇을 하는 서비스·핵심 기능·도구 카테고리
--     trend     : { whyNow }                   왜 지금 중요한지
--     painpoint : { who, pain }                대상 직무·핵심 페인
-- ⚠️ 공유 prod는 db push 금지 — 대시보드 SQL Editor에서 멱등 적용(if not exists).
alter table public.content_seeds add column if not exists essence jsonb;
