'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2, Home, Sparkles, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { SeedCuration, type CurSeed } from '@/components/admin/SeedCuration';
import { TrackForm } from '@/components/admin/TrackForm';
import { ToolForm } from '@/components/admin/ToolForm';

type Kind = 'content' | 'tool';

// 스튜디오 = 씨앗→기획방향→개요→본문→편집→발행→홈배치를 한 화면에서 끝내는 작업실.
// 각 단계는 phase로 스위칭(페이지 이동 없음). compose→edit→published(홈배치).
type Phase =
  | { step: 'compose' }
  | { step: 'loading'; id: string; kind: Kind }
  | { step: 'edit'; id: string; kind: Kind; row: Record<string, unknown> }
  | { step: 'published'; id: string; kind: Kind; title: string };

export function Studio({ seeds, pending }: { seeds: CurSeed[]; pending: number }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [phase, setPhase] = useState<Phase>({ step: 'compose' });
  const [error, setError] = useState<string | null>(null);

  // 생성 완료 → 방금 만든 초안 row를 불러와 에디터 임베드
  const openEditor = async (id: string, kind: Kind) => {
    setPhase({ step: 'loading', id, kind });
    setError(null);
    const table = kind === 'content' ? 'contents' : 'tools';
    const { data, error: err } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (err || !data) {
      setError(err?.message ?? '초안을 불러오지 못했어요.');
      setPhase({ step: 'compose' });
      return;
    }
    setPhase({ step: 'edit', id, kind, row: data as Record<string, unknown> });
  };

  const backToCompose = () => {
    setPhase({ step: 'compose' });
    router.refresh();
  };

  // 에디터 저장 콜백. 발행(published)이면 홈배치 단계로, 초안 저장이면 편집 유지.
  const onSaved = (status: string, savedId?: string, kind?: Kind, title?: string) => {
    if (status === 'published' && savedId) {
      setPhase({ step: 'published', id: savedId, kind: kind ?? 'content', title: title ?? '' });
    }
    // draft 저장은 편집 화면 유지(콜백만, 별도 처리 없음)
  };

  if (phase.step === 'loading') {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-ink/60">
        <Loader2 className="h-4 w-4 animate-spin" /> 초안 여는 중…
      </div>
    );
  }

  if (phase.step === 'edit') {
    const title = (phase.row.title as string) || (phase.row.name as string) || '';
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-8">
          <Button size="sm" variant="ghost" onClick={backToCompose}>
            <ArrowLeft className="h-3.5 w-3.5" /> 인박스로
          </Button>
          <span className="text-xs text-ink/40">생성된 초안을 다듬고 발행하세요 · 발행하면 홈 배치로 이어집니다</span>
        </div>
        {error && <p className="px-4 sm:px-8 text-xs text-red-600">{error}</p>}
        {phase.kind === 'content' ? (
          <TrackForm
            initial={phase.row as never}
            onSaved={(status, id) => onSaved(status, id, 'content', title)}
          />
        ) : (
          <ToolForm
            initial={phase.row as never}
            onSaved={(status, id) => onSaved(status, id, 'tool', title)}
          />
        )}
      </div>
    );
  }

  if (phase.step === 'published') {
    return (
      <div className="p-4 sm:p-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <h1 className="font-serif text-lg font-semibold">발행 완료</h1>
          </div>
          <p className="text-sm text-ink/60">
            {phase.title && <b>{phase.title}</b>} 콘텐츠가 발행됐어요.
            {phase.kind === 'content'
              ? ' 아래에서 홈 대표 영역에 바로 배치하세요.'
              : ' 자료실에 노출됩니다(자료류는 홈 대표 슬롯이 없어요).'}
          </p>

          {phase.kind === 'content' ? (
            <FeaturedPlacer contentId={phase.id} title={phase.title} />
          ) : (
            <Link href="/admin/tools" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> 자료실에서 보기
            </Link>
          )}

          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button size="sm" variant="accent" onClick={backToCompose}>
              <Sparkles className="h-3.5 w-3.5" /> 새 콘텐츠 만들기
            </Button>
            <Link href="/admin/contents/curation" className="text-xs text-ink/50 hover:underline">
              큐레이션 전체 관리 →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // compose — 인박스 + 기획방향 → 개요 → 본문 생성. 생성되면 openEditor로 편집 임베드.
  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">콘텐츠 스튜디오</h1>
        <p className="text-sm text-ink/60 mt-1">
          씨앗 선택 → 기획방향 → 개요 → 본문 → 편집 → 발행 → 홈 배치까지 한 화면에서.
        </p>
      </header>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <SeedCuration seeds={seeds} pending={pending} onGenerated={openEditor} />
    </div>
  );
}

// 발행된 콘텐츠를 홈 대표 영역(featured_contents)에 바로 배치. 빈 슬롯 자동 선택.
// MD 직행 레인(MdImport)의 발행 단계에서도 재사용.
export function FeaturedPlacer({ contentId, title }: { contentId: string; title: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [busy, setBusy] = useState<'hero' | 'highlight' | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const place = async (slotType: 'hero' | 'highlight') => {
    setBusy(slotType);
    setError(null);
    try {
      // 해당 영역의 빈 슬롯(1~5) 찾기
      const { data: existing } = await supabase
        .from('featured_contents')
        .select('slot')
        .eq('slot_type', slotType);
      const used = new Set((existing ?? []).map((e) => e.slot as number));
      const free = [1, 2, 3, 4, 5].find((n) => !used.has(n));
      if (!free) {
        setError(`${slotType} 슬롯(1~5)이 가득 찼어요. 큐레이션에서 정리 후 배치하세요.`);
        return;
      }
      const { error: err } = await supabase
        .from('featured_contents')
        .insert({ content_id: contentId, slot_type: slotType, slot: free, active: true });
      if (err) {
        setError(/duplicate|unique/i.test(err.message) ? '이미 배치된 슬롯이에요.' : err.message);
        return;
      }
      setDone(`${slotType === 'hero' ? 'Hero' : 'Highlight'} #${free}에 배치됨`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Home className="h-4 w-4 text-ink/50" />
        <h2 className="text-sm font-semibold">홈 대표 배치</h2>
      </div>
      <p className="text-xs text-ink/50">{title ? `"${title}"를 ` : ''}메인 노출 영역에 바로 올립니다. 빈 슬롯에 자동 배치돼요.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {done ? (
        <p className="inline-flex items-center gap-1 text-sm text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> {done}
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="accent" disabled={!!busy} onClick={() => place('hero')}>
            {busy === 'hero' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '📌'} Hero에 배치
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => place('highlight')}>
            {busy === 'highlight' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '📌'} Highlight에 배치
          </Button>
        </div>
      )}
    </div>
  );
}
