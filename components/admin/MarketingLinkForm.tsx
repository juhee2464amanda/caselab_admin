'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * 마케팅 유입 링크(ManyChat 숏링크) 생성 폼 + 행 액션.
 *
 * UtmBuilderForm과 같은 utm_links 테이블을 쓰되 kind='manychat'으로 저장하고
 * 숏링크 code·게시물/키워드/플로우 대장 필드를 함께 기록한다.
 * ManyChat DM에는 {SITE}/l/{code}만 넣는다 — 본가 redirect handler가
 * 클릭 적재 후 UTM 붙은 full_url로 302 리다이렉트.
 */

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CUSTOM_CODE_RE = /^[a-zA-Z0-9_-]{3,32}$/;

function randomCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

export function MarketingLinkForm({ siteBase }: { siteBase: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [f, setF] = useState({
    label: '',
    target_url: '',
    keyword: '',
    ig_post_url: '',
    flow_name: '',
    memo: '',
    custom_code: '',
    source: 'instagram',
    medium: 'manychat',
    campaign: '',
    content: '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [built, setBuilt] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
  }

  // source·medium·campaign은 채널 구분 축 — 대소문자 섞이면 분석이 쪼개지므로 소문자 정규화.
  const norm = {
    source: f.source.trim().toLowerCase(),
    medium: f.medium.trim().toLowerCase(),
    // campaign 미입력 시 키워드가 곧 캠페인 (게시물 키워드 단위 유입 비교)
    campaign: (f.campaign.trim() || f.keyword.trim()).toLowerCase(),
    content: f.content.trim(),
  };

  function buildUrl(): string | null {
    try {
      const u = new URL(f.target_url.trim());
      u.searchParams.set('utm_source', norm.source);
      u.searchParams.set('utm_medium', norm.medium);
      u.searchParams.set('utm_campaign', norm.campaign);
      if (norm.content) u.searchParams.set('utm_content', norm.content);
      return u.toString();
    } catch {
      return null;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.target_url.trim() || !norm.campaign) {
      setError('target URL과 키워드는 필수예요.');
      return;
    }
    const custom = f.custom_code.trim();
    if (custom && !CUSTOM_CODE_RE.test(custom)) {
      setError('커스텀 code는 3~32자 영문·숫자·-·_ 만 가능해요.');
      return;
    }
    const full = buildUrl();
    if (!full) {
      setError('target URL 형식이 올바르지 않아요 (https:// 포함).');
      return;
    }
    setPending(true);
    const { data: { user } } = await supabase.auth.getUser();

    async function insertWith(code: string) {
      return supabase.from('utm_links').insert({
        label: f.label.trim() || f.keyword.trim() || norm.campaign,
        source: norm.source,
        medium: norm.medium,
        campaign: norm.campaign,
        content: norm.content || null,
        target_url: f.target_url.trim(),
        full_url: full,
        kind: 'manychat',
        code,
        keyword: f.keyword.trim() || null,
        ig_post_url: f.ig_post_url.trim() || null,
        flow_name: f.flow_name.trim() || null,
        memo: f.memo.trim() || null,
        created_by: user?.id ?? null,
      });
    }

    let code = custom || randomCode();
    let { error: insErr } = await insertWith(code);
    // 랜덤 code 충돌(unique violation)은 1회 재생성으로 흡수
    if (insErr?.code === '23505' && !custom) {
      code = randomCode();
      ({ error: insErr } = await insertWith(code));
    }
    setPending(false);
    if (insErr) {
      setError(insErr.code === '23505' ? `code '${code}'는 이미 사용 중이에요.` : insErr.message);
      return;
    }
    setBuilt(`${siteBase}/l/${code}`);
    setF({
      label: '', target_url: '', keyword: '', ig_post_url: '', flow_name: '', memo: '',
      custom_code: '', source: 'instagram', medium: 'manychat', campaign: '', content: '',
    });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 mb-6 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="target URL *"><Input value={f.target_url} onChange={(e) => set('target_url', e.target.value)} placeholder="https://caselab.kr/tools/..." /></Field>
        <Field label="트리거 키워드 *"><Input value={f.keyword} onChange={(e) => set('keyword', e.target.value)} placeholder="자료 (DM 트리거 댓글 키워드)" /></Field>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-ink/50 select-none">상세 옵션 (라벨·게시물·플로우·campaign…)</summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          <Field label="라벨 (비우면 키워드)"><Input value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="7월 프롬프트 릴스" /></Field>
          <Field label="인스타 게시물 URL"><Input value={f.ig_post_url} onChange={(e) => set('ig_post_url', e.target.value)} placeholder="https://www.instagram.com/p/..." /></Field>
          <Field label="ManyChat 플로우"><Input value={f.flow_name} onChange={(e) => set('flow_name', e.target.value)} placeholder="자료 요청 DM" /></Field>
          <Field label="메모"><Input value={f.memo} onChange={(e) => set('memo', e.target.value)} placeholder="릴스 3편 공통 링크" /></Field>
          <Field label="campaign (비우면 키워드)"><Input value={f.campaign} onChange={(e) => set('campaign', e.target.value)} placeholder="july-reels" /></Field>
          <Field label="content"><Input value={f.content} onChange={(e) => set('content', e.target.value)} placeholder="post-0716" /></Field>
          <Field label="커스텀 code"><Input value={f.custom_code} onChange={(e) => set('custom_code', e.target.value)} placeholder="비우면 자동 생성" /></Field>
        </div>
      </details>
      <p className="text-xs text-ink/40">URL과 키워드만 넣으면 돼요 — 라벨·campaign은 키워드로, source·medium은 instagram/manychat로 자동 저장됩니다.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {built && (
        <div className="rounded-md bg-muted p-3 text-xs">
          <div className="text-ink/50 mb-1">생성됨 — 이 숏링크를 ManyChat 메시지에 넣으세요</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-accent">{built}</code>
            <Button type="button" variant="outline" className="shrink-0" onClick={() => navigator.clipboard?.writeText(built)}>복사</Button>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="accent" disabled={pending}>{pending ? '생성 중…' : '숏링크 생성'}</Button>
      </div>
    </form>
  );
}

/** 테이블 행 — 숏링크 복사 버튼 */
export function ShortLinkCell({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <code className="text-xs text-accent break-all">{url}</code>
      <button
        type="button"
        className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-ink/60 hover:bg-muted"
        onClick={() => {
          navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? '✓' : '복사'}
      </button>
    </div>
  );
}

/** 테이블 행 — 활성/비활성 토글 (비활성 링크는 /l/{code}가 홈으로 보냄) */
export function ActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-ink/40'
      } ${pending ? 'opacity-50' : 'hover:opacity-80'}`}
      onClick={async () => {
        setPending(true);
        await supabase.from('utm_links').update({ is_active: !isActive }).eq('id', id);
        setPending(false);
        router.refresh();
      }}
    >
      {isActive ? '활성' : '비활성'}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
