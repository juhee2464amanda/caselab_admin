import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { PromptManager, type PromptRow } from '@/components/admin/PromptManager';

// /admin/prompts — 바로쓰는 프롬프트 관리 (콘텐츠 스튜디오 탭).
// 본가 /prompts와 같은 소스: tools(category='prompt'), body{prompt, promptCategory, source, sourceUrl}.
// (구 D50 리다이렉트 → 2026-07-07 전용 등록 데스크로 교체)
export default async function AdminPrompts() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('tools')
    .select('id, name, status, pick_order, job_tags, body')
    .eq('category', 'prompt')
    .order('created_at', { ascending: false });
  const prompts = (data ?? []) as PromptRow[];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">바로쓰는 프롬프트</h1>
        <p className="text-sm text-ink/60 mt-1">
          본가 /prompts에 그대로 노출됩니다. 복사해 바로 쓸 수 있는 검증된 프롬프트만 올려 주세요.
        </p>
      </header>
      <PromptManager initial={prompts} />
    </div>
  );
}
