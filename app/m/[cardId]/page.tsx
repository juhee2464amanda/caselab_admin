import { notFound } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyCard } from '@/lib/cardpress/handoff';
import { endingFor } from '@/lib/cardpress/endings';
import { CopyCaption } from '@/components/cardpress/CopyCaption';
import type { CardCtaType } from '@/lib/cardpress/cta-endings';

export const dynamic = 'force-dynamic';
export const metadata = { title: '카드뉴스 — 폰으로 올리기', robots: { index: false, follow: false } };

// 폰에서 여는 화면. 인스타 DM API가 막혀서(런북 E장) 만든 대체 경로 —
// 카드 이미지를 꾹 눌러 저장하고, 캡션은 버튼 한 번으로 복사해서 인스타에 붙여넣는다.
//
// 로그인이 없는 화면이라 링크에 붙은 서명(t)으로만 연다. 서명이 없거나 틀리면 404 —
// "권한 없음"이라고 알려주면 링크의 존재 자체가 새어나가므로 없는 페이지처럼 군다.
export default async function MobileHandoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { cardId } = await params;
  const { t } = await searchParams;
  if (!verifyCard(cardId, t)) notFound();

  const admin = createSupabaseAdminClient();
  const { data: card } = await admin
    .from('content_cards')
    .select('id, ig_caption, threads_text, cta_type, cta_keyword')
    .eq('id', cardId)
    .maybeSingle();
  if (!card) notFound();

  // 버킷에 올라간 카드들을 파일명 순서대로 — 이름이 01_, 02_ … 로 앞자리가 채워져 있어 그대로 정렬하면 된다.
  const { data: files } = await admin.storage.from('cardpress').list(cardId, { limit: 100 });
  const images = (files ?? [])
    .filter((f) => f.name.endsWith('.png'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({
      name: f.name,
      url: admin.storage.from('cardpress').getPublicUrl(`${cardId}/${f.name}`).data.publicUrl,
    }));

  // 엔딩이 영상·고정 이미지면 버킷의 카드 폴더에 없다 → 따로 뒤에 붙인다(슬라이드형은 이미 위 목록에 있다).
  const ending = endingFor((card.cta_type as CardCtaType) ?? 'channel_intro', {
    ctaKeyword: card.cta_keyword as string | null,
  });
  const extra =
    ending.kind === 'video'
      ? { kind: 'video' as const, url: ending.videoUrl, label: ending.label }
      : ending.kind === 'image'
        ? { kind: 'image' as const, url: ending.imageUrl, label: ending.label }
        : null;

  const caption = (card.ig_caption as string | null) ?? '';
  const total = images.length + (extra ? 1 : 0);

  return (
    <main className="mx-auto max-w-md px-4 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-lg font-bold leading-snug">카드뉴스</h1>
        <p className="text-xs text-ink/50">
          카드 {total}장 · 위에서부터 순서대로 올리면 됩니다
        </p>
      </header>

      {caption ? (
        <section className="space-y-2">
          <CopyCaption text={caption} />
          <details className="rounded-xl border border-ink/10 p-3">
            <summary className="cursor-pointer text-sm font-medium">캡션 미리보기</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink/80">
              {caption}
            </pre>
          </details>
        </section>
      ) : (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          캡션이 비어 있습니다 — 관리자 화면에서 먼저 채워주세요.
        </p>
      )}

      <section className="space-y-3">
        {images.map((img, i) => (
          <figure key={img.name} className="space-y-1">
            {/* 저장은 이미지를 꾹 눌러서 — 그래서 next/image로 감싸지 않고 원본 URL을 그대로 쓴다 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={`카드 ${i + 1}`}
              className="w-full rounded-xl border border-ink/10"
              loading="lazy"
            />
            <figcaption className="flex items-center justify-between text-xs text-ink/50">
              <span>{i + 1}번째</span>
              <a href={img.url} target="_blank" rel="noreferrer" className="text-accent underline">
                원본 열기
              </a>
            </figcaption>
          </figure>
        ))}

        {extra && (
          <figure className="space-y-1">
            {extra.kind === 'video' ? (
              <video src={extra.url} controls playsInline className="w-full rounded-xl border border-ink/10" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={extra.url} alt="엔딩" className="w-full rounded-xl border border-ink/10" />
            )}
            <figcaption className="flex items-center justify-between text-xs text-ink/50">
              <span>마지막 · 엔딩 ({extra.label})</span>
              <a href={extra.url} target="_blank" rel="noreferrer" className="text-accent underline">
                원본 열기
              </a>
            </figcaption>
          </figure>
        )}
      </section>

      <p className="pb-8 text-center text-[11px] text-ink/40">
        이미지를 길게 눌러 저장 → 인스타 새 게시물 → 캡션 붙여넣기
      </p>
    </main>
  );
}
