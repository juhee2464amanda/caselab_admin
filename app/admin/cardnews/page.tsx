import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CardPressManager, type CardRow, type SourceRow } from '@/components/admin/CardPressManager';

// /admin/cardnews — 카드프레스 검수 스튜디오 (콘텐츠 스튜디오 탭).
// 발행 콘텐츠에서 자동 생성된 인스타 캐러셀·캡션·스레드 3종 세트를 검수→발행. (docs/09_card_press_spec.md)
export const dynamic = 'force-dynamic';

export default async function AdminCardnews() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data: cards } = await supabase
    .from('content_cards')
    .select('*')
    .order('created_at', { ascending: false });

  // 소스 콘텐츠 제목 + "카드 없는 발행 콘텐츠"(수동 생성 후보) 목록
  const { data: contents } = await supabase
    .from('contents')
    .select('id, title, track, slug, status, view_count, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  return (
    <div className="p-4 sm:p-8">
      {/* 라이브 캔버스가 실물과 같은 서체로 보이도록 Pretendard 로드 (Satori 렌더와 동일 폰트) */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.min.css"
      />
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">카드뉴스</h1>
        <p className="text-sm text-ink/60 mt-1">
          콘텐츠 발행 시 인스타 캐러셀·캡션·스레드 3종 세트가 자동 생성됩니다. 검수 후 발행하세요.
        </p>
      </header>
      <CardPressManager
        initial={(cards ?? []) as CardRow[]}
        sources={(contents ?? []) as SourceRow[]}
      />
    </div>
  );
}
