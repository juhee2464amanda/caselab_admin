'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// D25 — UTM Builder. target_url + utm 파라미터 → full_url 생성 후 utm_links 저장.
export function UtmBuilderForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [f, setF] = useState({ label: '', source: '', medium: '', campaign: '', content: '', target_url: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [built, setBuilt] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
  }

  // source·medium·campaign은 채널 구분 축 — 대소문자 섞이면 분석이 쪼개지므로 소문자 정규화.
  // content는 게시물 식별자로 쓰일 수 있어 원문(trim만) 유지.
  const norm = {
    source: f.source.trim().toLowerCase(),
    medium: f.medium.trim().toLowerCase(),
    campaign: f.campaign.trim().toLowerCase(),
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
    if (!f.label || !f.source || !f.medium || !f.campaign || !f.target_url) {
      setError('라벨·source·medium·campaign·target URL은 필수예요.');
      return;
    }
    const full = buildUrl();
    if (!full) {
      setError('target URL 형식이 올바르지 않아요 (https:// 포함).');
      return;
    }
    setPending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insErr } = await supabase.from('utm_links').insert({
      label: f.label.trim(),
      source: norm.source,
      medium: norm.medium,
      campaign: norm.campaign,
      content: norm.content || null,
      target_url: f.target_url.trim(),
      full_url: full,
      created_by: user?.id ?? null,
    });
    setPending(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setBuilt(full);
    setF({ label: '', source: '', medium: '', campaign: '', content: '', target_url: '' });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 mb-6 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="라벨 *"><Input value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="인스타 피드 6월" /></Field>
        <Field label="target URL *"><Input value={f.target_url} onChange={(e) => set('target_url', e.target.value)} placeholder="https://caselab.kr/cases/..." /></Field>
        <Field label="source *"><Input value={f.source} onChange={(e) => set('source', e.target.value)} placeholder="instagram" /></Field>
        <Field label="medium *"><Input value={f.medium} onChange={(e) => set('medium', e.target.value)} placeholder="social" /></Field>
        <Field label="campaign *"><Input value={f.campaign} onChange={(e) => set('campaign', e.target.value)} placeholder="june-launch" /></Field>
        <Field label="content (선택)"><Input value={f.content} onChange={(e) => set('content', e.target.value)} placeholder="post-0607" /></Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {built && (
        <div className="rounded-md bg-muted p-3 text-xs">
          <div className="text-ink/50 mb-1">생성됨 — 복사해서 사용하세요</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-accent">{built}</code>
            <Button type="button" variant="outline" className="shrink-0" onClick={() => navigator.clipboard?.writeText(built)}>복사</Button>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="accent" disabled={pending}>{pending ? '생성 중…' : 'UTM 링크 생성'}</Button>
      </div>
    </form>
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
