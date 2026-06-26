import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { SeedTriage, type Seed } from '@/components/admin/SeedTriage';

// /admin/seeds — HERMES 씨앗 triage.
// HERMES 브리퍼 → webhook(/api/slack/hermes-brief) → content_seeds(raw) 적재.
// 운영자가 여기서 보고 채택/반려 → (다음 단계) AI 생성 → 발행.
export const dynamic = 'force-dynamic';

const LANES = ['scout', 'analyst', 'briefing', 'weekly'] as const;

export default async function AdminSeeds() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('content_seeds')
    .select('id, title, raw_text, source_url, origin, lane, status, note, created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  const all = (data ?? []) as Seed[];

  const fresh = all.filter((s) => s.status === 'raw');
  const working = all.filter((s) => s.status === 'adopted' || s.status === 'generating');
  const done = all.filter((s) => s.status === 'published' || s.status === 'rejected');

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">HERMES 씨앗</h1>
        <p className="text-sm text-ink/60 mt-1">
          브리퍼가 자동 수집한 콘텐츠 씨앗. 검토 후 채택하면 콘텐츠 제작으로 이어집니다.
        </p>
      </header>

      <section>
        <h2 className="font-serif text-base font-semibold mb-3">
          🌱 검토 전 <span className="text-xs text-ink/40 font-normal">{fresh.length}</span>
        </h2>
        {fresh.length === 0 ? (
          <p className="text-sm text-ink/40">새로 들어온 씨앗이 없어요.</p>
        ) : (
          <SeedTriage seeds={fresh} lanes={LANES as unknown as string[]} />
        )}
      </section>

      {working.length > 0 && (
        <section>
          <h2 className="font-serif text-base font-semibold mb-3">
            ✍️ 채택됨 <span className="text-xs text-ink/40 font-normal">{working.length}</span>
          </h2>
          <SeedTriage seeds={working} lanes={LANES as unknown as string[]} />
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="font-serif text-base font-semibold mb-3">
            ✅ 처리됨 <span className="text-xs text-ink/40 font-normal">{done.length}</span>
          </h2>
          <SeedTriage seeds={done} lanes={LANES as unknown as string[]} muted />
        </section>
      )}
    </div>
  );
}
