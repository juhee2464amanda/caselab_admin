'use client';

import { useState } from 'react';
import { AlertCircle, Check, Images, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { uploadImageFromUrl } from '@/lib/image-upload';

// 썸네일 후보(Unsplash) 패널.
// 이미지 채우기(AiImageFill)는 "공식 사이트의 실사용 화면"을 찾는 도구라 프롬프트·가이드에는 쓸 게 없다.
// 이쪽은 제목·설명·본문을 카드뉴스와 같은 검색어 사다리(리터럴→은유→장면→텍스처)로 바꿔 사진을 찾는다.
// 고른 사진은 우리 버킷으로 복사한 뒤 thumbnail_url에 넣는다(핫링크 수명·CORS 회피, ThumbnailField와 같은 규약).

interface Candidate {
  id: string;
  query: string;
  rank: number;
  alt: string;
  thumb: string;
  full: string;
  credit: string;
  creditLink: string;
  downloadLocation?: string;
}

interface Result {
  keyword: string;
  reason: string;
  queries: string[];
  results: Candidate[];
  notice: string | null;
  aiNotice: string | null;
}

export function ThumbnailSuggest({
  name,
  description,
  category,
  promptCategory,
  excerpt,
  thumbnailUrl,
  className,
  onPick,
}: {
  name: string;
  description: string;
  category: string;
  promptCategory?: string;
  /** 본문 발췌 — 프롬프트 전문·가이드 앞부분 */
  excerpt?: string;
  thumbnailUrl: string;
  /** 겉면 — 기본은 우측 레일용 카드. 폼 안에 끼워 넣을 때는 얇은 테두리로 바꾼다(카드 속 카드 방지). */
  className?: string;
  onPick: (url: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [manual, setManual] = useState('');
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  async function run(queries?: string[]) {
    setRunning(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/suggest-thumbnail', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description, category, promptCategory, excerpt, queries }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `실패 (${res.status})`);
      setResult(json as Result);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function pick(c: Candidate) {
    setApplying(c.id);
    setErr(null);
    try {
      // 외부 URL을 그대로 두면 규격·수명이 Unsplash에 묶인다 — 버킷으로 복사한 주소를 쓴다.
      const url = await uploadImageFromUrl(c.full);
      onPick(url);
      setApplied(c.id);
      // 약관상 채택 시점에 한 번 — 실패해도 흐름은 막지 않는다
      if (c.downloadLocation) {
        void fetch('/api/admin/unsplash-track', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ location: c.downloadLocation }),
        }).catch(() => {});
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setApplying(null);
    }
  }

  const blocked = !name.trim() ? '제목을 먼저 입력해 주세요' : null;

  return (
    <section className={className ?? 'card p-5'}>
      <div className="mb-2 flex items-center gap-2">
        <Images className="h-4 w-4 shrink-0 text-accent" />
        <h2 className="text-sm font-semibold">썸네일 후보 (Unsplash)</h2>
      </div>
      <p className="mb-2.5 text-[11px] text-ink/45 break-keep">
        제목·설명을 읽고 카드뉴스와 같은 규칙(구체 사물 → 은유 → 장면)으로 검색어를 만들어 사진을 찾아요.
        고르면 우리 스토리지로 복사돼 썸네일에 바로 들어갑니다.
      </p>
      <Button
        size="sm"
        type="button"
        variant="outline"
        className="h-8 w-full text-xs"
        onClick={() => run()}
        disabled={running || Boolean(blocked)}
        title={blocked ?? undefined}
      >
        <Search className="h-3.5 w-3.5" /> {running ? '찾는 중…' : result ? '다시 찾기' : '후보 찾기'}
      </Button>
      {blocked && <p className="mt-1.5 text-[11px] text-amber-600">{blocked}</p>}
      {err && (
        <p className="mt-2 flex items-start gap-1 text-[11px] text-red-600">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {err}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-2.5">
          {result.keyword && (
            <p className="text-[11px] text-ink/50 break-keep">
              핵심 키워드 <span className="font-medium text-ink/70">{result.keyword}</span>
              {result.reason && <span className="block text-ink/40">{result.reason}</span>}
            </p>
          )}

          {/* 검색어 사다리 — 클릭하면 그 검색어만으로 다시 찾는다 */}
          {result.queries.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {result.queries.map((q, i) => (
                <button
                  key={`${q}-${i}`}
                  type="button"
                  onClick={() => run([q])}
                  disabled={running}
                  className="rounded-full border border-border px-2 py-0.5 text-[10px] text-ink/60 hover:border-accent/50 hover:text-ink disabled:opacity-50"
                  title="이 검색어로만 다시 찾기"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-1.5">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manual.trim()) {
                  e.preventDefault();
                  void run([manual.trim()]);
                }
              }}
              placeholder="검색어 직접 입력 (영어)"
              className="h-7 text-xs"
              disabled={running}
            />
            <Button
              size="sm"
              type="button"
              variant="outline"
              className="h-7 shrink-0 px-2 text-[11px]"
              disabled={running || !manual.trim()}
              onClick={() => run([manual.trim()])}
            >
              검색
            </Button>
          </div>

          {[result.aiNotice, result.notice].filter(Boolean).map((n) => (
            <p key={n} className="text-[11px] text-amber-600 break-keep">
              {n}
            </p>
          ))}

          {result.results.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                {result.results.map((c) => (
                  <figure key={c.id} className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => pick(c)}
                      disabled={applying !== null}
                      className={cn(
                        'relative block w-full overflow-hidden rounded-md border transition-colors',
                        applied === c.id ? 'border-accent ring-1 ring-accent/40' : 'border-border hover:border-accent/60',
                        applying === c.id && 'opacity-60',
                      )}
                      title={`${c.query} — 클릭하면 썸네일로 넣어요`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.thumb} alt={c.alt} className="aspect-[16/10] w-full object-cover" />
                      {applied === c.id && (
                        <span className="absolute right-1 top-1 rounded-full bg-accent p-0.5 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      {applying === c.id && (
                        <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] text-ink/70">
                          넣는 중…
                        </span>
                      )}
                    </button>
                    <figcaption className="truncate text-[9px] text-ink/35">
                      <a href={c.creditLink} target="_blank" rel="noreferrer" className="hover:underline">
                        {c.credit}
                      </a>
                      {' · '}
                      {c.query}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="text-[11px] text-ink/45 break-keep">
                {thumbnailUrl ? '고르면 기존 썸네일을 교체합니다. ' : ''}
                사진은 Unsplash 라이선스(상업적 사용 무료)이고, 사진가 이름은 위 캡션에서 확인할 수 있어요.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
