-- 1031 — utm_links.kind 'manychat' → 'dm' (2026-08-24, prod 적용 완료)
--
-- 배경: 자동DM 채널을 ManyChat에서 리틀리로 전환하며 ManyChat 흔적을 정리한다.
-- kind는 숏링크 대장 행('dm')과 일반 UTM 빌더 행('utm')을 구분하는 내부 축이라
-- 특정 서비스명 대신 채널명으로 둔다. /admin/marketing 목록 필터와 동시 변경.
-- 멱등: 여러 번 실행해도 안전.

update public.utm_links set kind = 'dm' where kind = 'manychat';

comment on column public.utm_links.kind is 'utm(빌더) | dm(자동DM 숏링크 대장)';
