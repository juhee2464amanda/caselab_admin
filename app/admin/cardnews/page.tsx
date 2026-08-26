import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import {
  CardPressManager,
  type CardRow,
  type SeedSourceRow,
  type SourceRow,
  type ToolSourceItem,
} from '@/components/admin/studio/CardPressManager';
import { TOOL_SOURCE_SELECT, toolSourceState, type ToolSourceRow } from '@/lib/cardpress/tool-source';

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

  // 씨앗 아카이브 후보 — 상태로 거르지 않고 아카이브 전체를 최신순으로 가져온다(아카이브 페이지와 같은 300건 창).
  // 발행됨·숨김 씨앗도 검색으로 도달해야 하기 때문. 기본 노출(top3)과 카드 중복 제외는 클라이언트에서 판정.
  const { data: seeds } = await supabase
    .from('content_seeds')
    .select('id, title, lane, status, suggested_angle, essence, created_at, source_url')
    .order('created_at', { ascending: false })
    .limit(300);

  // 본가 자료실(tools) 발행물 — /guides · /prompts · /tools 소재.
  // body(jsonb)까지 읽어야 "카드 재료가 있는지"를 여기서 판정할 수 있다(수십 건 규모라 부담 없음).
  const { data: toolRows } = await supabase
    .from('tools')
    .select(TOOL_SOURCE_SELECT)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  // 본가 실노출 + 재료 유무를 서버에서 판정해 UI로 넘긴다(클라이언트가 body를 다시 안 봐도 되게).
  const toolSources: ToolSourceItem[] = ((toolRows ?? []) as unknown as ToolSourceRow[]).map((t) => {
    const { usable, reason, kind } = toolSourceState(t);
    return { id: t.id, name: t.name, slug: t.slug, category: t.category, kind, usable, reason };
  });

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
        seeds={(seeds ?? []) as SeedSourceRow[]}
        toolSources={toolSources}
      />
    </div>
  );
}
