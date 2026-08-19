// 홈 배치(featured_contents) 쓰기 경로 — admin의 모든 "홈에 올리기" UI는 이 파일만 통한다.
//
// ⚠️ slot_type은 'hero' 하나뿐이다.
//    본가 홈(apps/caselab · lib/data/contents.ts listFeaturedContents)은 slot_type='hero'만 렌더한다.
//    예전엔 highlight/links도 배치할 수 있었는데 그걸 그리는 화면이 본가에 없어서,
//    "배치됨" 성공 메시지는 뜨지만 홈에도 큐레이션 화면에도 안 보이는 유령 슬롯만 쌓였다.
//    1018에서 데이터를 정리했지만 쓰기 경로와 check 제약이 남아 재발 → 1025에서 제약을 'hero'로 좁혔다.
//    새 노출 영역이 필요하면 slot_type을 늘리기 전에 본가 렌더러부터 만들 것.
//
// 슬롯 구성: #1 = 대표(Hero), #2~5 = Sub(추가 노출). 본가 캐러셀 limit 5와 일치.
//
// ⚠️ featured_from / featured_until(예약 노출 창)은 admin에서 더 이상 설정하지 않는다.
//    본가는 여전히 이 창을 필터한다 — 창이 지난 행은 admin 큐레이션엔 "배치됨"으로 보이는데
//    홈에선 조용히 빠진다(2026-08-19 대표 슬롯이 안 뜬 원인: 2026-08-11에 만료된 옛 창).
//    그래서 쓰기 경로는 항상 null(상시 노출)로 덮고, 남아 있는 창은 큐레이션 화면이 경고로 드러낸다.

import type { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type Sb = ReturnType<typeof createSupabaseBrowserClient>;
export type Kind = 'content' | 'tool' | 'prompt';
export type Target = { kind: Kind; id: string };

export const SLOT_TYPE = 'hero' as const;
export const HERO_SLOT = 1;
export const SUB_SLOTS = [2, 3, 4, 5];
export const MAX_SUB = SUB_SLOTS.length;

export type PlaceResult = { ok: boolean; message: string };

/** 예약 노출 창 해제 — 모든 쓰기에 함께 실어 "만료된 창 때문에 홈에서만 안 보이는" 슬롯을 원천 차단. */
export const ALWAYS_ON = { featured_from: null, featured_until: null } as const;

type SlotRow = { id: string; slot: number; content_id: string | null; tool_id: string | null };

export function payload(kind: Kind, id: string) {
  return kind === 'content' ? { content_id: id, tool_id: null } : { content_id: null, tool_id: id };
}

function holds(row: { content_id: string | null; tool_id: string | null }, t: Target): boolean {
  return t.kind === 'content' ? row.content_id === t.id : row.tool_id === t.id;
}

async function loadSlots(sb: Sb): Promise<SlotRow[]> {
  const { data } = await sb
    .from('featured_contents')
    .select('id, slot, content_id, tool_id')
    .eq('slot_type', SLOT_TYPE)
    .order('slot');
  return (data ?? []) as SlotRow[];
}

// 비어 있는 Sub 슬롯 중 가장 앞. exceptId는 "곧 비울 슬롯"(이동 중인 자기 자신).
export function freeSubSlot(rows: SlotRow[], exceptId?: string): number | null {
  const used = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slot));
  return SUB_SLOTS.find((n) => !used.has(n)) ?? null;
}

/** 대표(#1)로 배치. 기존 대표는 빈 Sub로 밀리고, Sub가 꽉 찼으면 빠진다. */
export async function placeAsHero(sb: Sb, t: Target): Promise<PlaceResult> {
  const rows = await loadSlots(sb);
  const dup = rows.find((r) => holds(r, t));
  if (dup?.slot === HERO_SLOT) return { ok: true, message: '이미 홈 대표예요.' };

  if (dup) {
    const { error } = await sb.from('featured_contents').delete().eq('id', dup.id);
    if (error) return { ok: false, message: error.message };
  }
  const slot1 = rows.find((r) => r.slot === HERO_SLOT);
  if (slot1) {
    const free = freeSubSlot(rows, dup?.id);
    const { error } = free
      ? await sb.from('featured_contents').update({ slot: free, ...ALWAYS_ON }).eq('id', slot1.id)
      : await sb.from('featured_contents').delete().eq('id', slot1.id);
    if (error) return { ok: false, message: error.message };
  }
  const { error } = await sb
    .from('featured_contents')
    .insert({ slot_type: SLOT_TYPE, slot: HERO_SLOT, ...payload(t.kind, t.id), active: true, ...ALWAYS_ON });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: '홈 대표(#1)에 배치했어요.' };
}

/** Sub(#2~5)로 배치. 이미 대표면 Sub로 내리고, 이미 Sub면 그대로 둔다. */
export async function placeAsSub(sb: Sb, t: Target): Promise<PlaceResult> {
  const rows = await loadSlots(sb);
  const dup = rows.find((r) => holds(r, t));
  const full = { ok: false, message: `Sub 슬롯이 가득 찼어요 (최대 ${MAX_SUB}개). 아래 목록에서 하나 제거하고 다시 시도하세요.` };

  if (dup && dup.slot !== HERO_SLOT) return { ok: true, message: `이미 Sub #${dup.slot}에 있어요.` };
  const free = freeSubSlot(rows, dup?.id);
  if (!free) return full;

  const { error } = dup
    ? await sb.from('featured_contents').update({ slot: free, ...ALWAYS_ON }).eq('id', dup.id)
    : await sb
        .from('featured_contents')
        .insert({ slot_type: SLOT_TYPE, slot: free, ...payload(t.kind, t.id), active: true, ...ALWAYS_ON });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Sub #${free}에 배치했어요.` };
}
