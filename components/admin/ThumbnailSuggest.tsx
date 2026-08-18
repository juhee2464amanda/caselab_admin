'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, Sparkles, Type, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { uploadImageFile, uploadImageFromUrl } from '@/lib/image-upload';

// 썸네일 후보 찾기 패널 — 자료실(프롬프트·가이드·도구) 편집 화면 우측 레일.
// 프롬프트·가이드에는 캡처할 공식 사이트가 없어서 AiImageFill(사이트 크롤) 경로를 못 쓴다.
// 세 갈래: ① 사진 찾기(AI가 만든 영문 검색어 → Unsplash) ② 브랜드 카드(제목만으로 타이포 썸네일)
// ③ AI 생성(OPENAI_API_KEY가 있을 때만 — 없으면 안내만 하고 요금은 발생하지 않는다).
// 고른 후보는 항상 우리 버킷으로 복사한 뒤 thumbnail_url에 넣는다(외부 핫링크·만료 URL 방지).

interface PhotoResult {
  id: string;
  query: string;
  alt: string;
  thumb: string;
  full: string;
  credit: string;
  creditLink: string;
  downloadLocation: string;
}

interface SuggestResponse {
  queries: string[];
  cardTitle: string;
  cardLabel: string;
  aiPrompt: string;
  results: PhotoResult[];
  notice?: string | null;
  aiNotice?: string | null;
}

const VARIANTS: { key: string; label: string }[] = [
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
};

export function ThumbnailSuggest({
  name,
  description,
  category,
  promptCategory,
  promptText,
  value,
  onPick,
}: {
  name: string;
  description?: string;
  category: string;
  /** 프롬프트 분류(think·organize…) — 검색어 각도에 참고 */
  promptCategory?: string;
  /** 프롬프트 전문 앞부분 — 무슨 일을 시키는 프롬프트인지 파악용 */
  promptText?: string;
  /** 현재 썸네일 — 있으면 '교체됩니다' 경고 */
  value: string;
  onPick: (url: string) => void;
}) {
  const [tab, setTab] = useState<'photo' | 'card' | 'ai'>('photo');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [queryText, setQueryText] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);

  // 브랜드 카드 입력 — 타이핑마다 렌더 요청이 나가지 않게 0.6초 뒤에만 미리보기 URL을 갱신한다.
  const [cardTitle, setCardTitle] = useState('');
  const [cardLabel, setCardLabel] = useState('');
  const [cardKey, setCardKey] = useState({ title: '', label: '' });
  useEffect(() => {
    const t = setTimeout(() => setCardKey({ title: cardTitle, label: cardLabel }), 600);
    return () => clearTimeout(t);
  }, [cardTitle, cardLabel]);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiQuality, setAiQuality] = useState<'low' | 'medium'>('low');
  const [aiUrl, setAiUrl] = useState<string | null>(null);
  const [aiNoKey, setAiNoKey] = useState<string | null>(null);

  // 제목이 아직 없으면 검색어도 카드도 만들 수 없다
  const blocked = !name.trim() ? '제목을 먼저 입력해 주세요' : null;

  const effectiveTitle = cardTitle || data?.cardTitle || name.slice(0, 16);
  const effectiveLabel = cardLabel || data?.cardLabel || CATEGORY_LABEL[category] || '';
  const cardUrl = (variant: string) =>
    `/api/admin/thumbnail-card?variant=${variant}&category=${encodeURIComponent(category)}&title=${encodeURIComponent(
      cardKey.title || effectiveTitle
    )}&label=${encodeURIComponent(cardKey.label || effectiveLabel)}`;

  async function suggest(queries?: string[]) {
    setBusy('suggest');
    setErr(null);
    setPickedId(null);
    try {
      const res = await fetch('/api/admin/suggest-thumbnail', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description, category, promptCategory, prompt: promptText, queries }),
      });
      const json = (await res.json()) as SuggestResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `실패 (${res.status})`);
      setData(json);
      setQueryText(json.queries.join(', '));
      // 브랜드 카드·AI 탭 초기값도 같은 응답에서 채운다(탭을 옮겨도 다시 부를 필요 없음)
      if (!cardTitle) setCardTitle(json.cardTitle);
      if (!cardLabel) setCardLabel(json.cardLabel);
      if (!aiPrompt) setAiPrompt(json.aiPrompt);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** 고른 사진을 우리 버킷으로 복사 → 썸네일 반영. Unsplash 약관상 채택 시점에 다운로드 트래킹을 한 번 부른다. */
  async function applyPhoto(p: PhotoResult) {
    setBusy(`photo:${p.id}`);
    setErr(null);
    try {
      const url = await uploadImageFromUrl(p.full);
      onPick(url);
      void fetch('/api/admin/unsplash-track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ location: p.downloadLocation }),
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** 브랜드 카드 PNG를 그대로 받아 파일로 업로드(렌더 결과를 고정 — 나중에 문구가 바뀌어도 썸네일은 안 흔들린다) */
  async function applyCard(variant: string) {
    setBusy(`card:${variant}`);
    setErr(null);
    try {
      const res = await fetch(cardUrl(variant));
      if (!res.ok) throw new Error(`카드 렌더 실패 (${res.status})`);
      const blob = await res.blob();
      const url = await uploadImageFile(new File([blob], 'thumbnail-card.png', { type: 'image/png' }));
      onPick(url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generateAi() {
    setBusy('ai');
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
      setAiUrl(json.url); // 이미 우리 버킷에 저장된 URL
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
        <h2 className="text-sm font-semibold">썸네일 후보 (AI)</h2>
      </div>
      <p className="mb-3 text-[11px] text-ink/45 break-keep">
        제목·설명을 읽고 어울리는 사진을 찾거나, 제목만으로 브랜드 카드를 만들어요. 고른 이미지는 우리 저장소로 복사돼 썸네일로 들어갑니다.
      </p>

      <div className="mb-3 flex rounded-lg border border-border p-0.5 text-[11px]">
        {([
          ['photo', '사진 찾기', ImageIcon],
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

      {value && (
        <p className="mb-2.5 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-8 w-12 shrink-0 rounded object-cover" />
          이미 썸네일이 있어요 — 후보를 고르면 교체됩니다.
        </p>
      )}

      {blocked && <p className="mb-2 text-[11px] text-amber-600">{blocked}</p>}
      {err && <p className="mb-2 text-[11px] text-red-600">{err}</p>}

      {/* ── 사진 찾기 ─────────────────────────────── */}
      {tab === 'photo' && (
        <div className="space-y-2.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-full text-xs"
            onClick={() => suggest()}
            disabled={Boolean(blocked) || busy === 'suggest'}
          >
            {busy === 'suggest' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            {busy === 'suggest' ? '검색어 만들고 찾는 중…' : data ? '다시 찾기' : '후보 찾기'}
          </Button>

          {data && (
            <>
              <div>
                <label className="text-[11px] text-ink/50">검색어 (고쳐서 다시 찾을 수 있어요)</label>
                <div className="mt-1 flex gap-1.5">
                  <Input
                    className="h-8 text-xs"
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    placeholder="쉼표로 구분"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 px-2 text-xs"
                    disabled={busy === 'suggest'}
                    onClick={() => suggest(queryText.split(',').map((q) => q.trim()).filter(Boolean))}
                  >
                    재검색
                  </Button>
                </div>
              </div>
              {data.aiNotice && <p className="text-[11px] text-amber-600 break-keep">{data.aiNotice}</p>}
              {data.notice && <p className="text-[11px] text-ink/50 break-keep">{data.notice}</p>}

              <div className="grid grid-cols-2 gap-1.5">
                {data.results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPickedId(pickedId === p.id ? null : p.id)}
                    title={p.alt || p.query}
                    className={cn(
                      'overflow-hidden rounded-md border transition-colors',
                      pickedId === p.id ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-ink/30',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumb} alt={p.alt} className="h-16 w-full object-cover" />
                  </button>
                ))}
              </div>

              {pickedId &&
                (() => {
                  const p = data.results.find((r) => r.id === pickedId)!;
                  return (
                    <div className="space-y-1.5 rounded-md border border-accent/40 bg-accent/5 p-2">
                      <p className="text-[11px] text-ink/60 break-keep">
                        검색어 <span className="font-medium">{p.query}</span>
                      </p>
                      <p className="text-[11px] text-ink/45">
                        사진:{' '}
                        <a href={p.creditLink} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                          {p.credit}
                        </a>{' '}
                        / Unsplash — 표기가 필요한 곳에 함께 적어 주세요
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="accent"
                        className="h-8 w-full text-xs"
                        disabled={busy === `photo:${p.id}`}
                        onClick={() => applyPhoto(p)}
                      >
                        {busy === `photo:${p.id}` ? '반영 중…' : '이 사진을 썸네일로'}
                      </Button>
                    </div>
                  );
                })()}
            </>
          )}
        </div>
      )}

      {/* ── 브랜드 카드 ───────────────────────────── */}
      {tab === 'card' && (
        <div className="space-y-2.5">
          <p className="text-[11px] text-ink/45 break-keep">
            사진 없이 제목만으로 만드는 타이포 썸네일. 목록 톤이 흐트러지지 않아요.
          </p>
          <div className="flex gap-1.5">
            <Input
              className="h-8 text-xs"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              placeholder={name.slice(0, 16) || '카드에 넣을 한 줄'}
            />
            <Input
              className="h-8 w-24 shrink-0 text-xs"
              value={cardLabel}
              onChange={(e) => setCardLabel(e.target.value)}
              placeholder={CATEGORY_LABEL[category] ?? '라벨'}
            />
          </div>
          {!data && (
            <button
              type="button"
              onClick={() => suggest()}
              disabled={Boolean(blocked) || busy === 'suggest'}
              className="text-[11px] text-accent underline underline-offset-2 disabled:opacity-50"
            >
              {busy === 'suggest' ? '문구 뽑는 중…' : 'AI로 카드 문구 뽑기'}
            </button>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {VARIANTS.map((v) => (
              <button
                key={v.key}
                type="button"
                disabled={Boolean(blocked) || busy === `card:${v.key}`}
                onClick={() => applyCard(v.key)}
                title={`${v.label} — 클릭하면 이 카드로 반영`}
                className="overflow-hidden rounded-md border border-border transition-colors hover:border-accent disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cardUrl(v.key)} alt={v.label} className="h-[74px] w-full object-cover" />
                <span className="block border-t border-border px-1 py-0.5 text-[10px] text-ink/55">
                  {busy === `card:${v.key}` ? '반영 중…' : v.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── AI 생성 ───────────────────────────────── */}
      {tab === 'ai' && (
        <div className="space-y-2.5">
          <textarea
            className="min-h-[70px] w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="만들 이미지 설명 (영문 권장) — '후보 찾기'를 한 번 누르면 초안이 채워져요"
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
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-full text-xs"
            disabled={!aiPrompt.trim() || busy === 'ai'}
            onClick={generateAi}
          >
            {busy === 'ai' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {busy === 'ai' ? '만드는 중… (최대 1분)' : '이미지 만들기'}
          </Button>
          {aiNoKey && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700 break-keep">{aiNoKey}</p>}
          {aiUrl && (
            <div className="space-y-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aiUrl} alt="" className="w-full rounded-md border border-border object-cover" />
              <Button type="button" size="sm" variant="accent" className="h-8 w-full text-xs" onClick={() => onPick(aiUrl)}>
                이 이미지를 썸네일로
              </Button>
            </div>
          )}
          <p className="text-[11px] text-ink/40 break-keep">
            생성 API는 구독과 별개로 장당 과금돼요. 키를 넣지 않으면 요금이 나가지 않고, ChatGPT에서 직접 만든 이미지를 썸네일 칸에 끌어놓아도 됩니다.
          </p>
        </div>
      )}
    </section>
  );
}
