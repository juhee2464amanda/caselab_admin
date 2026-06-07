import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';

// /admin/topics — 후보 카드 (D29) + 피드백 #5: 투표 많은 후보 / raw 신규 제안 분리 + 제출자 정보.
type Suggestion = {
  id: string;
  title: string;
  description: string | null;
  vote_count: number;
  status: string;
  created_at: string;
  author_id: string | null;
};
type Profile = { id: string; name: string | null; email: string | null };

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: '검토 전', cls: 'bg-yellow-100 text-yellow-700' },
  planned: { label: '제작 예정', cls: 'bg-blue-100 text-blue-700' },
  published: { label: '발행됨', cls: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', cls: 'bg-muted text-ink/50' },
};

export default async function AdminTopics() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('topic_suggestions')
    .select('id, title, description, vote_count, status, created_at, author_id')
    .order('created_at', { ascending: false })
    .limit(200);
  const all = (data ?? []) as Suggestion[];

  // 제출자 프로필 매핑 (author_id → auth.users, profiles.id 동일)
  const authorIds = [...new Set(all.map((s) => s.author_id).filter(Boolean))] as string[];
  const profMap = new Map<string, Profile>();
  if (authorIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', authorIds);
    for (const p of (profs ?? []) as Profile[]) profMap.set(p.id, p);
  }

  const popular = all.filter((s) => s.vote_count > 0).sort((a, b) => b.vote_count - a.vote_count);
  const raw = all.filter((s) => s.vote_count === 0); // 이미 created_at desc

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">후보 카드</h1>
        <p className="text-sm text-ink/60 mt-1">사용자가 제안한 콘텐츠 주제. 투표 많은 후보와 신규 raw 제안을 분리.</p>
      </header>

      {/* 투표 많은 후보 */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-3">
          🔥 투표 많은 후보 <span className="text-xs text-ink/40 font-normal">{popular.length}</span>
        </h2>
        <ul className="space-y-3">
          {popular.length === 0 && <li className="text-sm text-ink/40">투표된 후보가 없어요.</li>}
          {popular.map((t) => (
            <li key={t.id} className="card p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
              <div className="w-12 text-center shrink-0">
                <div className="font-serif text-2xl font-bold text-accent">{t.vote_count}</div>
                <div className="text-[10px] text-ink/50 uppercase">votes</div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium">{t.title}</h3>
                {t.description && <p className="text-sm text-ink/60 mt-1 line-clamp-2">{t.description}</p>}
                <p className="text-xs text-ink/40 mt-1">{formatDate(t.created_at)} · {submitter(t, profMap)}</p>
              </div>
              <span className={`badge shrink-0 ${STATUS[t.status]?.cls ?? ''}`}>{STATUS[t.status]?.label ?? t.status}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 신규 raw 제안 */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-1">
          🌱 신규 raw 제안 <span className="text-xs text-ink/40 font-normal">{raw.length}</span>
        </h2>
        <p className="text-xs text-ink/40 mb-3">아직 투표 없는 날것의 제안. 소수 의견 속 인사이트를 발굴하세요.</p>
        <div className="card divide-y divide-border">
          {raw.length === 0 && <div className="px-4 py-8 text-center text-sm text-ink/40">신규 제안이 없어요.</div>}
          {raw.map((t) => (
            <div key={t.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium">{t.title}</h3>
                  {t.description && <p className="text-sm text-ink/60 mt-1">{t.description}</p>}
                  <p className="text-xs text-ink/40 mt-1">{formatDate(t.created_at)} · {submitter(t, profMap)}</p>
                </div>
                <span className={`badge shrink-0 ${STATUS[t.status]?.cls ?? ''}`}>{STATUS[t.status]?.label ?? t.status}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function submitter(t: Suggestion, profMap: Map<string, Profile>): string {
  if (!t.author_id) return '익명/비로그인';
  const p = profMap.get(t.author_id);
  if (!p) return '익명/비로그인';
  return `${p.name ?? '이름없음'}${p.email ? ` (${p.email})` : ''}`;
}
