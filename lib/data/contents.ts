import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import type { ContentRow } from '@/types/content';

const PUBLIC_FIELDS = 'id, slug, track, title, summary, body, job_tags, persona_coverage, read_min, apply_min, status, curated, thumbnail_url, author_quote, view_count, published_at, created_at, updated_at';

export async function listPublishedContents(opts: {
  track?: 'case' | 'trend';
  limit?: number;
  curated?: boolean;
  job?: string;
  timeCap?: number;
} = {}): Promise<ContentRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('contents')
    .select(PUBLIC_FIELDS)
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  if (opts.track) query = query.eq('track', opts.track);
  if (opts.curated) query = query.eq('curated', true);
  if (opts.job) query = query.contains('job_tags', [opts.job]);
  if (opts.timeCap) query = query.lte('read_min', opts.timeCap);
  if (opts.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) {
    console.warn('[listPublishedContents]', error.message);
    return [];
  }
  return (data ?? []) as unknown as ContentRow[];
}

export async function getContentBySlug(slug: string): Promise<ContentRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('contents')
    .select(PUBLIC_FIELDS)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  return (data as unknown as ContentRow) ?? null;
}

export async function listRelated(content: Pick<ContentRow, 'id' | 'job_tags' | 'track'>, limit = 6): Promise<ContentRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('contents')
    .select(PUBLIC_FIELDS)
    .eq('status', 'published')
    .neq('id', content.id)
    .overlaps('job_tags', content.job_tags?.length ? content.job_tags : ['planning'])
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as ContentRow[];
}
