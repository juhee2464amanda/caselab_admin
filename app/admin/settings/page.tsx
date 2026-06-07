import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

// /admin/settings — 설정·상태 (T-H). 환경 연결 상태 + 시스템 통계 (읽기).
type AdminStats = {
  total_users: number;
  published_contents: number;
  total_saves: number;
  total_reactions: number;
  visible_comments: number;
  new_opinions: number;
};

function StatusRow({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {note && <div className="text-xs text-ink/40">{note}</div>}
      </div>
      <span className={`badge shrink-0 ${ok ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
        {ok ? '연결됨' : '미설정'}
      </span>
    </div>
  );
}

export default async function AdminSettings() {
  const env = {
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    siteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
    ga4: !!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    aiDraft: process.env.NEXT_PUBLIC_AI_DRAFT_ENABLED === 'true',
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };

  let stats: AdminStats | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('admin_stats')
      .select('total_users, published_contents, total_saves, total_reactions, visible_comments, new_opinions')
      .single<AdminStats>();
    stats = data;
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">설정</h1>
        <p className="text-sm text-ink/60 mt-1">환경 연결 상태와 시스템 현황. (값은 보안상 표시하지 않음)</p>
      </header>

      <section>
        <h2 className="font-serif text-base font-semibold mb-3">환경 연결</h2>
        <div className="card divide-y divide-border">
          <StatusRow label="Supabase (Public URL/Key)" ok={env.supabase} />
          <StatusRow label="Supabase Service Role" ok={env.serviceRole} note="서버 전용 관리 작업" />
          <StatusRow label="Site URL" ok={env.siteUrl} />
          <StatusRow label="GA4 Measurement ID" ok={env.ga4} note="Day 8 출시 직전 활성" />
          <StatusRow label="AI 초안 (Anthropic)" ok={env.aiDraft && env.anthropic} note="NEXT_PUBLIC_AI_DRAFT_ENABLED + ANTHROPIC_API_KEY" />
        </div>
      </section>

      <section>
        <h2 className="font-serif text-base font-semibold mb-3">시스템 현황</h2>
        {stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="총 가입자" value={stats.total_users} />
            <Stat label="발행 콘텐츠" value={stats.published_contents} />
            <Stat label="총 저장" value={stats.total_saves} />
            <Stat label="총 반응" value={stats.total_reactions} />
            <Stat label="노출 댓글" value={stats.visible_comments} />
            <Stat label="미답 의견" value={stats.new_opinions} />
          </div>
        ) : (
          <p className="text-sm text-ink/40">통계를 불러올 수 없어요.</p>
        )}
      </section>

      <section className="card p-4 text-xs text-ink/50 space-y-1">
        <div className="font-semibold text-ink/70 text-sm mb-1">참고</div>
        <p>· Brevo(이메일 발송) 키는 Supabase Edge Function secrets로만 관리됩니다. Vercel 환경변수에 등록하지 않습니다.</p>
        <p>· DB 마이그레이션 apply 소유자는 본가 <code>caselab</code> repo입니다 (<code>supabase/README.md</code>).</p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink/50">{label}</div>
      <div className="mt-1 font-serif text-2xl font-semibold tabular-nums">{value.toLocaleString('ko-KR')}</div>
    </div>
  );
}
