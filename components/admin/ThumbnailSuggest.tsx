'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Check, Images, Loader2, Search, Type, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { uploadImageFile, uploadImageFromUrl } from '@/lib/image-upload';

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

// 사진이 안 맞는 자료를 위한 두 갈래. 브랜드 카드는 제목만으로 타이포 썸네일을 그리고(비용 0원),
// AI 생성은 OPENAI_API_KEY가 있을 때만 — 키가 없으면 안내만 하고 과금 경로로 가지 않는다.
const CARD_VARIANTS = [
  { key: 'beige', label: '베이지+골드' },
  { key: 'ink', label: '다크' },
  { key: 'accent', label: '분류 색' },
  { key: 'light', label: '화이트' },
];

const CATEGORY_LABEL: Record<string, string> = {
  prompt: '프롬프트',
  guide: '가이드',
  tool: '도구',
  'context-card': '맥락 카드',
  case: '케이스',
  trend: '트렌드',
  ebook: '전자책',
};

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

  // ── 브랜드 카드 (타이포 썸네일) ─────────────────────────────
  // 입력할 때마다 렌더 요청이 나가지 않게 0.6초 뒤에만 미리보기 URL을 갱신한다.
  const [cardTitle, setCardTitle] = useState('');
  const [cardLabel, setCardLabel] = useState('');
  const [cardKey, setCardKey] = useState({ title: '', label: '' });
  const [cardBusy, setCardBusy] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setCardKey({ title: cardTitle, label: cardLabel }), 600);
    return () => clearTimeout(t);
  }, [cardTitle, cardLabel]);

  const cardUrl = (variant: string) => {
    const title = (cardKey.title || name).slice(0, 40);
    const label = cardKey.label || CATEGORY_LABEL[category] || '';
    return `/api/admin/thumbnail-card?variant=${variant}&category=${encodeURIComponent(category)}&title=${encodeURIComponent(
      title,
    )}&label=${encodeURIComponent(label)}`;
  };

  /** 렌더된 PNG를 그대로 받아 파일로 올린다 — 나중에 제목을 고쳐도 이미 넣은 썸네일은 안 흔들린다. */
  async function pickCard(variant: string) {
    setCardBusy(variant);
    setErr(null);
    try {
      const res = await fetch(cardUrl(variant));
      if (!res.ok) throw new Error(`카드 렌더 실패 (${res.status})`);
      const blob = await res.blob();
      onPick(await uploadImageFile(new File([blob], 'thumbnail-card.png', { type: 'image/png' })));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCardBusy(null);
    }
  }

  // ── AI 생성 (키 있을 때만) ──────────────────────────────────
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiQuality, setAiQuality] = useState<'low' | 'medium'>('low');
  const [aiUrl, setAiUrl] = useState<string | null>(null);
  const [aiNoKey, setAiNoKey] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  // 사진 검색어가 나오면 생성 프롬프트 초안도 같이 채운다(같은 장면을 다른 방법으로 얻는 것뿐).
  useEffect(() => {
    if (result?.queries?.length && !aiPrompt) {
      setAiPrompt(`A calm natural-light photograph of ${result.queries[0]}, soft shadows, no text`);
    }
  }, [result, aiPrompt]);

  async function generateAi() {
    setAiBusy(true);
    setErr(null);
    setAiNoKey(null);
    setAiUrl(null);
    try {
      const res = await fetch('/api/admin/generate-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, quality: aiQuality }),
      });
      const json = (await res.json()) as { url?: string; error?: string; code?: string };
      if (json.code === 'no-key') {
        setAiNoKey(json.error ?? '');
        return;
      }
      if (!res.ok || !json.url) throw new Error(json.error ?? `실패 (${res.status})`);
      setAiUrl(json.url); // 생성분은 라우트가 이미 우리 버킷에 저장해 둔 주소
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  const [tab, setTab] = useState<'photo' | 'card' | 'ai'>('photo');
  const blocked = !name.trim() ? '제목을 먼저 입력해 주세요' : null;

  return (
    <section className={className ?? 'card p-5'}>
      <div className="mb-2 flex items-center gap-2">
        <Images className="h-4 w-4 shrink-0 text-accent" />
        <h2 className="text-sm font-semibold">썸네일 후보</h2>
      </div>

      {/* 사진이 늘 맞는 건 아니다 — 규격·톤이 흔들리지 않는 타이포 카드와, 키가 있을 때만 도는 생성까지 같은 자리에 둔다. */}
      <div className="mb-2.5 flex rounded-lg border border-border p-0.5 text-[11px]">
        {([
          ['photo', '사진', Search],
          ['card', '브랜드 카드', Type],
          ['ai', 'AI 생성', Wand2],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 font-medium transition-colors',
              tab === key ? 'bg-accent text-white' : 'text-ink/55 hover:bg-muted',
            )}
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
      </div>

      {tab === 'photo' && (
      <>
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
      </>
      )}

      {/* ── 브랜드 카드 — 사진이 안 맞거나 목록 톤을 맞추고 싶을 때 ── */}
      {tab === 'card' && (
        <div className="space-y-2.5">
          <p className="text-[11px] text-ink/45 break-keep">
            사진 없이 제목만으로 만드는 타이포 썸네일(1200×750). 카드뉴스와 같은 렌더러라 글꼴·여백이 브랜드와 같아요.
          </p>
          <div className="flex gap-1.5">
            <Input
              className="h-7 text-xs"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              placeholder={name.slice(0, 16) || '카드에 넣을 한 줄'}
            />
            <Input
              className="h-7 w-20 shrink-0 text-xs"
              value={cardLabel}
              onChange={(e) => setCardLabel(e.target.value)}
              placeholder={CATEGORY_LABEL[category] ?? '라벨'}
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {CARD_VARIANTS.map((v) => (
              <button
                key={v.key}
                type="button"
                disabled={Boolean(blocked) || cardBusy !== null}
                onClick={() => pickCard(v.key)}
                title={`${v.label} — 클릭하면 이 카드로 넣어요`}
                className="overflow-hidden rounded-md border border-border transition-colors hover:border-accent/60 disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cardUrl(v.key)} alt={v.label} className="aspect-[16/10] w-full object-cover" />
                <span className="block border-t border-border px-1 py-0.5 text-[9px] text-ink/45">
                  {cardBusy === v.key ? '넣는 중…' : v.label}
                </span>
              </button>
            ))}
          </div>
          {thumbnailUrl && <p className="text-[11px] text-ink/45">고르면 기존 썸네일을 교체합니다.</p>}
        </div>
      )}

      {/* ── AI 생성 — 키가 있을 때만 도는 선택지 ── */}
      {tab === 'ai' && (
        <div className="space-y-2.5">
          <textarea
            className="min-h-[70px] w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="만들 이미지 설명 (영문 권장) — '사진' 탭에서 후보를 한 번 찾으면 초안이 채워져요"
          />
          <div className="flex items-center gap-2 text-[11px] text-ink/55">
            <span>품질</span>
            {(['low', 'medium'] as const).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setAiQuality(q)}
                className={cn('rounded-full border px-2 py-0.5', aiQuality === q ? 'border-accent text-accent' : 'border-border')}
              >
                {q === 'low' ? '저품질(싸게)' : '보통'}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            type="button"
            variant="outline"
            className="h-8 w-full text-xs"
            disabled={!aiPrompt.trim() || aiBusy}
            onClick={generateAi}
          >
            {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {aiBusy ? '만드는 중… (최대 1분)' : '이미지 만들기'}
          </Button>
          {aiNoKey && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700 break-keep">{aiNoKey}</p>
          )}
          {aiUrl && (
            <div className="space-y-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aiUrl} alt="" className="aspect-[16/10] w-full rounded-md border border-border object-cover" />
              <Button size="sm" type="button" variant="accent" className="h-8 w-full text-xs" onClick={() => onPick(aiUrl)}>
                이 이미지를 썸네일로
              </Button>
            </div>
          )}
          <p className="text-[11px] text-ink/40 break-keep">
            생성 API는 구독과 별개로 장당 과금돼요. 키를 넣지 않으면 요금이 나가지 않고, ChatGPT에서 만든 이미지를 썸네일 칸에 끌어놓아도 됩니다.
          </p>
        </div>
      )}

      {err && (
        <p className="mt-2 flex items-start gap-1 text-[11px] text-red-600">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {err}
        </p>
      )}
    </section>
  );
}
