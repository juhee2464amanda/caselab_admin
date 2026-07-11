import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyIngestToken } from '@/lib/ingest-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 자산 직접 적재 — 로컬 Claude Code 세션에서 만든 완성 초안(프롬프트/가이드)을
// 씨앗(원재료) 단계를 건너뛰고 tools에 status='draft'로 바로 넣는다.
// 씨앗 경유(/api/seeds/ingest → 스튜디오 생성)와 달리 AI 재생성이 없어
// 세션에서 확정한 제목·본문·분류가 그대로 초안이 된다. 검수·발행은 기존
// /admin/prompts·/admin/guides 목록(비공개 배지 → 수정 → 발행 토글)에서.
// 인증: seeds/ingest와 같은 공유 토큰(HERMES_INGEST_TOKEN).
// 멱등성: slug를 category+name 해시로 결정적으로 생성 → slug unique 충돌 시 skip.

const MAX_ITEMS = 20;

// 본가 계약 enum — PromptManager·GuideManager와 동일 값 (컴포넌트는 'use client'라 직접 import하지 않음)
const PROMPT_CATEGORIES = ['think', 'make', 'verify', 'refine'] as const;
const GUIDE_CATEGORIES = ['prompt', 'cases', 'education', 'skills', 'agents'] as const;
const GUIDE_SOURCE_TYPES = ['default', 'github', 'course'] as const;

interface AssetItem {
  category?: string; // 'prompt' | 'guide'
  name?: string;
  // prompt 전용
  prompt?: string;
  promptCategory?: string;
  sourceUrl?: string;
  job_tags?: string[];
  // guide 전용
  url?: string;
  guideCategory?: string;
  sourceType?: string;
  // 공통
  source?: string;
  description?: string; // 복사 박스 밖 설명(prompt) / 카드 한 줄 설명(guide)
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'asset';
}

function deterministicSlug(category: string, name: string): string {
  const hash = crypto.createHash('sha256').update(`${category}:${name}`).digest('hex').slice(0, 6);
  return `${slugify(name)}-${hash}`;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

type ToolRow = {
  slug: string;
  name: string;
  category: 'prompt' | 'guide';
  status: 'draft';
  url?: string;
  description?: string | null;
  job_tags: string[];
  body: Record<string, unknown>;
};

function buildRow(item: AssetItem): ToolRow | { error: string } {
  const name = item.name?.trim() ?? '';
  if (!name) return { error: 'name 필수' };

  if (item.category === 'prompt') {
    const prompt = item.prompt?.trim() ?? '';
    if (prompt.length < 10) return { error: `prompt 필수(10자 이상): ${name.slice(0, 40)}` };
    const source = item.source?.trim();
    return {
      slug: deterministicSlug('prompt', name),
      name: name.slice(0, 200),
      category: 'prompt',
      status: 'draft',
      description: item.description?.trim() || null,
      job_tags: (item.job_tags ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 10),
      body: {
        prompt,
        promptCategory: pick(item.promptCategory, PROMPT_CATEGORIES, 'think'),
        source: source || undefined,
        sourceUrl: item.sourceUrl?.trim() || undefined,
      },
    };
  }

  if (item.category === 'guide') {
    const url = item.url?.trim() ?? '';
    if (!/^https?:\/\//.test(url)) return { error: `url 필수(http/https): ${name.slice(0, 40)}` };
    const source = item.source?.trim();
    return {
      slug: deterministicSlug('guide', name),
      name: name.slice(0, 200),
      category: 'guide',
      status: 'draft',
      url,
      description: item.description?.trim() || null,
      job_tags: source ? [source] : [],
      body: {
        guideCategory: pick(item.guideCategory, GUIDE_CATEGORIES, 'prompt'),
        source: source || undefined,
        sourceType: pick(item.sourceType, GUIDE_SOURCE_TYPES, 'default'),
      },
    };
  }

  return { error: `category는 'prompt'|'guide': ${name.slice(0, 40)}` };
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyIngestToken(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  let body: { items?: AssetItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: 'items 배열 필수(1건 이상)' }, { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `items 최대 ${MAX_ITEMS}건` }, { status: 400 });
  }

  const rows: ToolRow[] = [];
  for (const item of items) {
    const row = buildRow(item);
    if ('error' in row) {
      return NextResponse.json({ error: row.error }, { status: 400 });
    }
    rows.push(row);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('tools')
      .upsert(rows, { onConflict: 'slug', ignoreDuplicates: true })
      .select('id, slug, category');
    if (error) throw new Error(error.message);
    return NextResponse.json({
      ok: true,
      received: items.length,
      inserted: data?.length ?? 0,
      drafts: data ?? [],
    });
  } catch (e) {
    console.error('[assets/ingest] failed:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
