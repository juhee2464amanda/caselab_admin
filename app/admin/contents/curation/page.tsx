import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CurationManager, type Slot, type RankItem, type Orphan } from '@/components/admin/CurationManager';
import { CategoryQuickEdit } from '@/components/admin/CategoryQuickEdit';
import { SLOT_TYPE } from '@/lib/featured-slots';

// /admin/contents/curation — 홈 히어로 큐레이션.
//   · Hero 대표 1개 + Sub(추가 노출) 여러 개 (본가 홈은 slot_type='hero' 슬롯을 순서대로 캐러셀 렌더)
//   · 슬롯은 콘텐츠(케이스/트렌드) + 도구/프롬프트 모두 배치 가능 (featured_contents 폴리모픽)
//   · 우측 '인기 콘텐츠' = 조회 Top3 / 저장 Top3 (콘텐츠+도구/프롬프트 통합)
//   · slot_type 필터를 걸지 않는다 — hero가 아닌 행(옛 highlight/links)은 홈에 안 뜨는 유령이므로
//     숨기지 말고 경고 섹션으로 노출해 여기서 정리할 수 있어야 한다.
//   · featured_from/until(예약 노출 창)도 같은 이유로 읽어서 슬롯마다 상태를 계산한다.
//     본가는 창 밖의 슬롯을 조용히 빼는데 여기선 "배치됨"으로만 보여서, 만료된 대표가
//     홈에서만 사라지는 사고가 났다(2026-08-19). 이제 만료/예약은 배지 + 해제 버튼으로 드러낸다.
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
      .select('id, slot_type, slot, content_id, tool_id, active, featured_from, featured_until, contents(title, track), tools(name, category)')
      .order('slot'),
    supabase.from('content_stats').select('content_id, title, track, status, view_count, save_count, like_count').eq('status', 'published'),
    supabase.from('tools').select('id, name, category').in('category', ['tool', 'prompt']).eq('status', 'published'),
    supabase.from('saves').select('tool_id').not('tool_id', 'is', null),
    supabase.from('reactions').select('tool_id').eq('type', 'like').not('tool_id', 'is', null),
  ]);

  // ── 현재 슬롯 상태 ──
  const rows = (featRes.data ?? []) as unknown as Array<{
    id: string; slot_type: string; slot: number; content_id: string | null; tool_id: string | null; active: boolean;
    featured_from: string | null; featured_until: string | null;
    contents: { title: string; track: string } | null; tools: { name: string; category: string } | null;
  }>;

  // 본가가 적용하는 것과 같은 판정: from<=now<=until (null=상시). 창 밖이면 홈에서 빠진다.
  const now = Date.now();
  const windowState = (f: (typeof rows)[number]): Slot['window'] => {
    if (f.featured_until && new Date(f.featured_until).getTime() < now) return 'expired';
    if (f.featured_from && new Date(f.featured_from).getTime() > now) return 'pending';
    return 'always';
  };

  const toSlot = (f: (typeof rows)[number]): Slot => {
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
      window: windowState(f),
      until: f.featured_until,
      from: f.featured_from,
      kind,
      badge,
      title: isTool ? (f.tools?.name ?? '(삭제된 도구)') : (f.contents?.title?.trim() || '(제목 없음)'),
    };
  };

  const entries: Slot[] = rows.filter((f) => f.slot_type === SLOT_TYPE).map(toSlot);
  // 홈이 렌더하지 않는 slot_type — 남아 있으면 유령이므로 화면에 드러낸다.
  const orphans: Orphan[] = rows
    .filter((f) => f.slot_type !== SLOT_TYPE)
    .map((f) => ({ ...toSlot(f), slot_type: f.slot_type }));

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
      <CurationManager entries={entries} orphans={orphans} rankViews={rankViews} rankSaves={rankSaves} pool={pool} />
    </div>
  );
}
