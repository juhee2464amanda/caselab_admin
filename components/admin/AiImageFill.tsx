'use client';

import { useEffect, useState } from 'react';
import { Sparkles, AlertCircle, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// 초안 기준 이미지 자동 채움 패널 (로컬 admin 전용).
// 버튼 → /api/admin/suggest-images (사이트 캡처 + Claude 매칭 + 버킷 업로드, 1~3분)
// → 후보 미리보기 → 체크한 것만 반영.
//
// 고른 이미지를 **어디에 넣을지는 호출하는 폼이 정한다**(onApply). 자료실(ToolForm)은 기능 이미지
// 슬롯이 있고 콘텐츠(TrackForm)는 본문 섹션 블록 배열이라, 본문 스키마가 다른 만큼 배치 규칙도 다르다.
// 이 패널은 "무엇을 매칭 대상으로 삼을지(targets)"와 "어느 사이트를 훑을지(url)"만 받는다.
//
// Playwright·Claude CLI가 운영자 Mac에만 있으므로 localhost에서만 노출한다(스튜디오 버튼과 같은 정책).

/** 반영 대상 이미지 — title은 매칭된 대상(기능·섹션) 제목 그대로 */
export interface FilledImage {
  title: string;
  url: string;
  alt?: string;
  caption?: string;
}

interface Match extends FilledImage {
  origin: 'official' | 'external';
  sourceUrl: string;
  sourceLabel: string;
}

interface SuggestResult {
  thumbnail: { url: string; source: string } | null;
  matches: Match[];
  stats?: { candidates: number; pages: number; external: number };
}

const COPY = {
  tool: {
    intro: '공식 사이트(랜딩·문서·기능 페이지)를 훑어 실제 사용 화면을 찾고 기능별로 매칭해요.',
    slot: '기능',
  },
  content: {
    intro: '출처 사이트(공식 발표·문서)를 훑어 실제 화면을 찾고 본문 섹션별로 매칭해요.',
    slot: '섹션',
  },
} as const;

export function AiImageFill({
  kind = 'tool',
  url,
  onUrlChange,
  urlCandidates = [],
  name,
  targets,
  blockedReason,
  thumbnailUrl,
  applyHint,
  onApply,
}: {
  /** 카피·서버 프롬프트의 말투를 정한다 (자료실=기능 / 콘텐츠=섹션) */
  kind?: 'tool' | 'content';
  /** 훑을 사이트. 콘텐츠처럼 URL 필드가 없는 폼은 onUrlChange로 여기서 직접 입력받는다. */
  url: string;
  onUrlChange?: (url: string) => void;
  /** 본문 출처·북마크에서 뽑은 주소 후보 (클릭하면 url에 채운다) */
  urlCandidates?: { label: string; url: string }[];
  name: string;
  /** 이미지를 매칭할 대상 — 자료실은 기능, 콘텐츠는 본문 섹션 */
  targets: { title: string; desc?: string }[];
  /** 호출자가 정하는 차단 사유 (URL 미입력·본문 JSON 오류 등). 있으면 버튼이 잠긴다. */
  blockedReason?: string | null;
  thumbnailUrl: string;
  /** '선택 반영' 아래에 붙는 안내 — 어디로 들어가는지는 폼마다 다르다 */
  applyHint: string;
  onApply: (patch: { thumbnailUrl?: string; images: FilledImage[] }) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [useThumb, setUseThumb] = useState(true);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [includeExternal, setIncludeExternal] = useState(false);

  // SSR 불일치 방지 — 마운트 후 localhost 여부로만 노출 결정
  useEffect(() => {
    setVisible(['localhost', '127.0.0.1'].includes(window.location.hostname));
  }, []);
  if (!visible) return null;

  async function run() {
    setRunning(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/suggest-images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, name, features: targets, includeExternal, kind }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `실패 (${res.status})`);
      setResult(json as SuggestResult);
      // 이미 썸네일이 있으면 교체는 명시적으로 체크했을 때만 — 기본 해제
      setUseThumb(Boolean(json.thumbnail) && !thumbnailUrl);
      setPicked(new Set((json.matches as Match[]).map((_, i) => i)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function apply() {
    if (!result) return;
    onApply({
      thumbnailUrl: useThumb && result.thumbnail ? result.thumbnail.url : undefined,
      images: result.matches
        .filter((_, i) => picked.has(i))
        .map((m) => ({
          title: m.title.trim(),
          url: m.url,
          alt: m.alt || undefined,
          caption: m.caption || undefined,
        })),
    });
    setResult(null);
  }

  const copy = COPY[kind];
  const blocked = blockedReason ?? null;

  return (
    <section className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
        <h2 className="text-sm font-semibold">이미지 채우기 (AI)</h2>
      </div>
      <p className="mb-2.5 text-[11px] text-ink/45 break-keep">
        {copy.intro} 내 컴퓨터에서만 동작합니다.
        <span className="mt-1 block">
          훑을 사이트가 없으면 위 &lsquo;썸네일 후보&rsquo;를 쓰세요.
        </span>
      </p>

      {/* URL 필드가 없는 폼(콘텐츠)용 — 훑을 주소를 여기서 직접 고른다 */}
      {onUrlChange && (
        <div className="mb-2.5">
          <Input
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="훑을 사이트 주소 (https://…)"
            className="h-8 text-xs"
            disabled={running}
          />
          {urlCandidates.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {urlCandidates.map((c) => (
                <button
                  key={c.url}
                  type="button"
                  onClick={() => onUrlChange(c.url)}
                  disabled={running}
                  title={c.url}
                  className={cn(
                    'max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] disabled:opacity-50',
                    c.url === url ? 'border-accent/60 bg-accent/5 text-ink' : 'border-border text-ink/60 hover:border-accent/50 hover:text-ink',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <p className="mt-1 text-[10px] text-ink/40 break-keep">
            본문 출처·링크에서 가져온 후보예요. 원문(공식 발표·문서) 주소일수록 실제 화면이 많이 나와요.
          </p>
        </div>
      )}

      <label className="mb-2.5 flex items-start gap-2 text-[11px] text-ink/60">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={includeExternal}
          onChange={(e) => setIncludeExternal(e.target.checked)}
          disabled={running}
        />
        <span className="break-keep">
          리뷰·외부 문서까지 찾기
          <span className="block text-ink/40">공식 사이트에 실사용 화면이 적을 때 켜세요. 더 오래 걸리고(+1~2분), 남의 글에 실린 이미지는 출처를 확인하고 쓰세요.</span>
        </span>
      </label>
      <Button
        size="sm"
        type="button"
        variant="outline"
        className="h-8 w-full text-xs"
        onClick={run}
        disabled={running || Boolean(blocked)}
        title={blocked ?? undefined}
      >
        <ImagePlus className="h-3.5 w-3.5" /> {running ? '수집·매칭 중…' : '후보 만들기'}
      </Button>
      {running && (
        <p className="mt-1.5 text-[11px] text-ink/45">
          사이트를 돌며 화면을 모으고 AI가 하나씩 열어봐요 — {includeExternal ? '3~5분' : '2~3분'} 걸려요.
        </p>
      )}
      {blocked && <p className="mt-1.5 text-[11px] text-amber-600">{blocked}</p>}

      {err && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-red-600">
          <AlertCircle className="h-3 w-3" /> {err}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-3">
          {result.stats && (
            <p className="text-[11px] text-ink/40">
              {result.stats.pages}개 페이지에서 후보 {result.stats.candidates}장 수집 · 채택 {result.matches.length + (result.thumbnail ? 1 : 0)}장
            </p>
          )}

          {result.thumbnail && (
            <label className="flex items-center gap-2.5 rounded-md border border-border bg-white/60 p-2">
              <input type="checkbox" checked={useThumb} onChange={(e) => setUseThumb(e.target.checked)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.thumbnail.url} alt="" className="h-12 w-20 shrink-0 rounded object-cover border border-border" />
              <span className="min-w-0 text-xs">
                썸네일로 사용
                <span className="mt-0.5 block truncate text-[11px] text-ink/45">{result.thumbnail.source}</span>
                {thumbnailUrl && <span className="text-[11px] text-amber-600">기존 썸네일을 교체합니다</span>}
              </span>
            </label>
          )}

          {result.matches.length === 0 && !result.thumbnail && (
            <p className="text-[11px] text-ink/50">
              {copy.slot}에 맞는 실제 화면을 찾지 못했어요. &lsquo;리뷰·외부 문서까지 찾기&rsquo;를 켜고 다시 시도해 보세요.
            </p>
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
              <img src={m.url} alt={m.alt} className="h-16 w-28 shrink-0 rounded object-cover object-top border border-border" />
              <span className="min-w-0 text-xs">
                <span className="font-medium">{m.title}</span>
                <span className="mt-0.5 block text-[11px] text-ink/50">{m.caption || m.alt}</span>
                <a
                  href={m.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'mt-1 inline-block truncate text-[10px] underline-offset-2 hover:underline',
                    m.origin === 'external' ? 'text-amber-700' : 'text-ink/40',
                  )}
                >
                  {m.origin === 'external' ? '외부 출처 — 확인 필요' : '공식'} · {m.sourceLabel}
                </a>
              </span>
            </label>
          ))}

          {(result.matches.length > 0 || result.thumbnail) && (
            <div>
              <Button size="sm" type="button" variant="accent" className="h-8 w-full text-xs" onClick={apply}>
                선택 반영
              </Button>
              <p className="mt-1.5 text-[11px] text-ink/45 break-keep">{applyHint}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
