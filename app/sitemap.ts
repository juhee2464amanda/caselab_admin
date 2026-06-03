import type { MetadataRoute } from 'next';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const STATIC_PATHS = [
  { path: '/', priority: 1.0, changeFreq: 'daily' as const },
  { path: '/cases', priority: 0.9, changeFreq: 'daily' as const },
  { path: '/trends', priority: 0.9, changeFreq: 'daily' as const },
  { path: '/tools', priority: 0.6, changeFreq: 'weekly' as const },
  { path: '/prompts', priority: 0.6, changeFreq: 'weekly' as const },
  { path: '/guides', priority: 0.6, changeFreq: 'weekly' as const },
  { path: '/ebooks', priority: 0.7, changeFreq: 'weekly' as const },
  { path: '/topics', priority: 0.5, changeFreq: 'weekly' as const },
  { path: '/links', priority: 0.4, changeFreq: 'monthly' as const },
  { path: '/legal/privacy', priority: 0.2, changeFreq: 'yearly' as const },
  { path: '/legal/terms', priority: 0.2, changeFreq: 'yearly' as const },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${SITE}${p.path}`,
    lastModified: new Date(),
    changeFrequency: p.changeFreq,
    priority: p.priority,
  }));

  if (!isSupabaseConfigured()) return entries;

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('contents')
      .select('slug, track, updated_at')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(1000);

    for (const c of data ?? []) {
      entries.push({
        url: `${SITE}/${c.track === 'case' ? 'cases' : 'trends'}/${c.slug}`,
        lastModified: c.updated_at ? new Date(c.updated_at as string) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  } catch {
    /* DB 미연결이면 정적 entries만 반환 */
  }
  return entries;
}
