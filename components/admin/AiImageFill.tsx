'use client';

import { useEffect, useState } from 'react';
import { Sparkles, AlertCircle, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RichSection } from '@/types/content';

// 초안 기준 이미지 자동 채움 패널 (로컬 admin 전용).
// 버튼 → /api/admin/suggest-images (사이트 캡처 + Claude 매칭 + 버킷 업로드, 1~3분)
// → 후보 미리보기 → 체크한 것만 썸네일/추가 섹션(image 블록)으로 반영.
// Playwright·Claude CLI가 운영자 Mac에만 있으므로 localhost에서만 노출한다(스튜디오 버튼과 같은 정책).

interface Match {
  title: string;
  url: string;
  alt: string;
  caption: string;
}

interface SuggestResult {
  thumbnail: { url: string; source: 'shot' | 'og' } | null;
  matches: Match[];
}

export function AiImageFill({
  toolUrl,
  name,
  parsedBody,
  thumbnailUrl,
  onApply,
}: {
  toolUrl: string;
  name: string;
  parsedBody: Record<string, unknown> | null;
  thumbnailUrl: string;
  onApply: (patch: { thumbnailUrl?: string; addSections: RichSection[] }) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [useThumb, setUseThumb] = useState(true);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  // SSR 불일치 방지 — 마운트 후 localhost 여부로만 노출 결정
  useEffect(() => {
    setVisible(['localhost', '127.0.0.1'].includes(window.location.hostname));
  }, []);
  if (!visible) return null;

  // 초안 body의 features(title/desc)를 매칭 대상으로 사용
  const features = Array.isArray(parsedBody?.features)
    ? (parsedBody!.features as { title?: string; desc?: string }[])
        .filter((f) => f?.title)
        .map((f) => ({ title: String(f.title), desc: f.desc ? String(f.desc) : undefined }))
    : [];

  async function run() {
    setRunning(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/suggest-images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: toolUrl, name, features }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `실패 (${res.status})`);
      setResult(json as SuggestResult);
      setUseThumb(Boolean(json.thumbnail));
      setPicked(new Set((json.matches as Match[]).map((_, i) => i)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function apply() {
    if (!result) return;
    const addSections: RichSection[] = result.matches
      .filter((_, i) => picked.has(i))
      .map((m) => ({
        heading: m.title,
        blocks: [{ type: 'image' as const, url: m.url, alt: m.alt || undefined, caption: m.caption || undefined }],
      }));
    onApply({
      thumbnailUrl: useThumb && result.thumbnail ? result.thumbnail.url : undefined,
      addSections,
    });
    setResult(null);
  }

  const blocked = !toolUrl ? '메타의 URL 필드를 먼저 채워주세요' : !parsedBody ? '본문 JSON 오류를 먼저 고쳐주세요' : null;

  return (
    <section className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
        <h2 className="text-sm font-semibold">이미지 채우기 (AI)</h2>
      </div>
      <p className="mb-3 text-[11px] text-ink/45 break-keep">
        공식 사이트를 캡처해 기능별 이미지를 제안해요. 내 컴퓨터에서만 동작합니다.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-full text-xs"
        onClick={run}
        disabled={running || Boolean(blocked)}
        title={blocked ?? undefined}
      >
        <ImagePlus className="h-3.5 w-3.5" /> {running ? '캡처·매칭 중… (1~3분)' : '후보 만들기'}
      </Button>
      {blocked && <p className="mt-1.5 text-[11px] text-amber-600">{blocked}</p>}

      {err && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-red-600">
          <AlertCircle className="h-3 w-3" /> {err}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-3">
          {result.thumbnail && (
            <label className="flex items-center gap-2.5 rounded-md border border-border bg-white/60 p-2">
              <input type="checkbox" checked={useThumb} onChange={(e) => setUseThumb(e.target.checked)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.thumbnail.url} alt="" className="h-12 w-20 rounded object-cover border border-border" />
              <span className="text-xs">
                썸네일로 사용 <span className="text-ink/45">({result.thumbnail.source === 'og' ? 'OG 이미지' : '사이트 캡처'})</span>
                {thumbnailUrl && <span className="ml-1 text-amber-600">— 기존 썸네일을 교체합니다</span>}
              </span>
            </label>
          )}

          {result.matches.length === 0 && !result.thumbnail && (
            <p className="text-[11px] text-ink/50">쓸 만한 후보를 찾지 못했어요. 사이트가 로그인 뒤에만 화면을 보여주는 경우일 수 있어요.</p>
          )}

          {result.matches.map((m, i) => (
            <label key={i} className={cn('flex items-start gap-2.5 rounded-md border p-2', picked.has(i) ? 'border-accent/50 bg-accent/5' : 'border-border bg-white/60')}>
              <input
                type="checkbox"
                className="mt-1"
                checked={picked.has(i)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(i);
                  else next.delete(i);
                  setPicked(next);
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt} className="h-16 w-28 rounded object-cover object-top border border-border" />
              <span className="min-w-0 text-xs">
                <span className="font-medium">{m.title}</span>
                <span className="mt-0.5 block text-[11px] text-ink/50">{m.caption || m.alt}</span>
              </span>
            </label>
          ))}

          {(result.matches.length > 0 || result.thumbnail) && (
            <div>
              <Button size="sm" variant="accent" className="h-8 w-full text-xs" onClick={apply}>
                선택 반영
              </Button>
              <p className="mt-1.5 text-[11px] text-ink/45 break-keep">
                체크한 이미지가 &lsquo;추가 섹션&rsquo;(기능명 제목 + 이미지)으로 들어가요. 반영 뒤에도 상세 필드에서 수정·삭제할 수 있어요.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
