import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CurationManager, type Slot, type RankItem } from '@/components/admin/CurationManager';
import { CategoryQuickEdit } from '@/components/admin/CategoryQuickEdit';

// /admin/contents/curation — 홈 히어로 큐레이션.
//   · Hero 대표 1개 + Sub(추가 노출) 여러 개 (본가 홈은 slot_type='hero' 슬롯을 순서대로 캐러셀 렌더)
//   · 슬롯은 콘텐츠(케이스/트렌드) + 도구/프롬프트 모두 배치 가능 (featured_contents 폴리모픽)
//   · 우측 '인기 콘텐츠' = 조회 Top3 / 저장 Top3 (콘텐츠+도구/프롬프트 통합)
export const dynamic = 'force-dynamic';

type CStat = { content_id: string; title: string; track: string; status: string; view_count: number; save_count: number; like_count: number };
type ToolRow = { id: string; name: string; category: string };

function countBy(rows: { tool_id: string | null }[] | null): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows ?? []) if (r.tool_id) m[r.tool_id] = (m[r.tool_id] ?? 0) + 1;
  return m;
}

export default async function AdminCuration() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const [featRes, statRes, toolsRes, toolSavesRes, toolLikesRes] = await Promise.all([
    supabase
      .from('featured_contents')
      .select('id, slot, content_id, tool_id, active, contents(title, track), tools(name, category)')
      .eq('slot_type', 'hero')
      .order('slot'),
    supabase.from('content_stats').select('content_id, title, track, status, view_count, save_count, like_count').eq('status', 'published'),
    supabase.from('tools').select('id, name, category').in('category', ['tool', 'prompt']).eq('status', 'published'),
    supabase.from('saves').select('tool_id').not('tool_id', 'is', null),
    supabase.from('reactions').select('tool_id').eq('type', 'like').not('tool_id', 'is', null),
  ]);

  // ── 현재 슬롯 상태 ──
  const entries: Slot[] = (
    (featRes.data ?? []) as unknown as Array<{
      id: string; slot: number; content_id: string | null; tool_id: string | null; active: boolean;
      contents: { title: string; track: string } | null; tools: { name: string; category: string } | null;
    }>
  ).map((f) => {
    const isTool = !!f.tool_id;
    const kind: Slot['kind'] = isTool ? (f.tools?.category === 'prompt' ? 'prompt' : 'tool') : 'content';
    const badge = isTool
      ? kind === 'prompt' ? '프롬프트' : '도구'
      : f.contents?.track === 'case' ? '케이스' : '트렌드';
    return {
      id: f.id,
      slot: f.slot,
      content_id: f.content_id,
      tool_id: f.tool_id,
      active: f.active,
      kind,
      badge,
      title: isTool ? (f.tools?.name ?? '(삭제된 도구)') : (f.contents?.title?.trim() || '(제목 없음)'),
    };
  });

  // ── 인기 랭킹 풀: 콘텐츠(조회/저장/좋아요) + 도구·프롬프트(저장/좋아요) ──
  const toolSaves = countBy(toolSavesRes.data as { tool_id: string | null }[] | null);
  const toolLikes = countBy(toolLikesRes.data as { tool_id: string | null }[] | null);

  const contentItems: RankItem[] = ((statRes.data ?? []) as CStat[]).map((s) => ({
    key: `c:${s.content_id}`,
    kind: 'content',
    target_id: s.content_id,
    title: s.title?.trim() || '(제목 없음)',
    badge: s.track === 'case' ? '케이스' : '트렌드',
    views: s.view_count ?? 0,
    saves: s.save_count ?? 0,
    likes: s.like_count ?? 0,
  }));
  const toolItems: RankItem[] = ((toolsRes.data ?? []) as ToolRow[]).map((t) => ({
    key: `t:${t.id}`,
    kind: t.category === 'prompt' ? 'prompt' : 'tool',
    target_id: t.id,
    title: t.name,
    badge: t.category === 'prompt' ? '프롬프트' : '도구',
    views: 0,
    saves: toolSaves[t.id] ?? 0,
    likes: toolLikes[t.id] ?? 0,
  }));
  const pool = [...contentItems, ...toolItems];

  const rankViews = [...pool].sort((a, b) => b.views - a.views || b.saves - a.saves).slice(0, 3);
  const rankSaves = [...pool].sort((a, b) => b.saves - a.saves || b.views - a.views).slice(0, 3);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-semibold">큐레이션</h1>
          <p className="text-sm text-ink/60 mt-1">홈 최상단 히어로에 노출할 콘텐츠를 배치하세요. 대표 1개 + Sub(추가 노출).</p>
        </div>
        <div className="self-start sm:self-auto">
          <CategoryQuickEdit scope={{ type: 'content_subcategory', tracks: ['case', 'trend'], title: '콘텐츠 카테고리 수정' }} />
        </div>
      </header>
      <CurationManager entries={entries} rankViews={rankViews} rankSaves={rankSaves} pool={pool} />
    </div>
  );
}
