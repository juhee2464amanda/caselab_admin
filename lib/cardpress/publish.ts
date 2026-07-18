import { ImageResponse } from 'next/og';
import type { ReactElement } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderSlide, CARD_W, CARD_H } from '@/lib/cardpress/templates';
import { loadCardFonts } from '@/lib/cardpress/fonts';
import { RenderSlideSchema, type CardAccent, type CardSlide } from '@/types/cardpress';

// 발행 파이프라인 공용 유틸 — 활성 슬라이드 일괄 PNG 렌더 → cardpress 버킷 업로드(공개 URL).
// IG/Threads API가 공개 URL을 요구하므로(spec §3-③) 발행 전 반드시 이 단계를 거친다.

export type RenderedSlide = { order: number; template: string; buffer: Buffer; path: string };

export async function renderEnabledSlides(
  cardId: string,
  accent: CardAccent,
  slides: CardSlide[]
): Promise<RenderedSlide[]> {
  const fonts = await loadCardFonts();
  const enabled = slides.filter((s) => s.enabled);
  const out: RenderedSlide[] = [];
  for (const s of enabled) {
    const parsed = RenderSlideSchema.safeParse({ template: s.template, accent, props: s.props });
    if (!parsed.success)
      throw new Error(`슬라이드 ${s.order}(${s.template}) 스키마 오류 — 검수 UI에서 수정 후 다시: ${parsed.error.issues[0]?.message}`);
    const res = new ImageResponse(renderSlide(parsed.data) as ReactElement, {
      width: CARD_W,
      height: CARD_H,
      fonts,
      emoji: 'twemoji',
    });
    out.push({
      order: s.order,
      template: s.template,
      buffer: Buffer.from(await res.arrayBuffer()),
      path: `${cardId}/${String(out.length + 1).padStart(2, '0')}_${s.template}.png`,
    });
  }
  return out;
}

/** cardpress 공개 버킷 업로드 → 공개 URL 배열 (순서 보존) */
export async function uploadSlides(
  admin: SupabaseClient,
  rendered: RenderedSlide[]
): Promise<string[]> {
  const urls: string[] = [];
  for (const r of rendered) {
    const { error } = await admin.storage
      .from('cardpress')
      .upload(r.path, r.buffer, { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`업로드 실패(${r.path}): ${error.message}`);
    const { data } = admin.storage.from('cardpress').getPublicUrl(r.path);
    urls.push(data.publicUrl);
  }
  return urls;
}

// ── Instagram Graph API — 캐러셀 발행 ──────────────────────
// 컨테이너 생성(is_carousel_item) → 캐러셀 컨테이너 → 처리 대기 → publish

const IG_BASE = 'https://graph.facebook.com/v21.0';

async function igPost(path: string, params: Record<string, string>): Promise<Record<string, string>> {
  const res = await fetch(`${IG_BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Instagram API: ${data.error?.message ?? res.status}`);
  return data;
}

async function waitContainer(containerId: string, token: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${IG_BASE}/${containerId}?fields=status_code&access_token=${token}`);
    const data = await res.json();
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error('Instagram 미디어 처리 실패');
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Instagram 미디어 처리 대기 초과(60s)');
}

export async function publishInstagramCarousel(imageUrls: string[], caption: string): Promise<string> {
  const userId = process.env.INSTAGRAM_USER_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!userId || !token)
    throw new Error('INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN 미설정 — Meta 비즈니스 연결 후 env에 추가하세요');
  if (imageUrls.length < 2) throw new Error('캐러셀은 최소 2장 필요');

  const children: string[] = [];
  for (const url of imageUrls.slice(0, 20)) {
    const c = await igPost(`${userId}/media`, {
      image_url: url,
      is_carousel_item: 'true',
      access_token: token,
    });
    children.push(c.id);
  }
  for (const id of children) await waitContainer(id, token);

  const carousel = await igPost(`${userId}/media`, {
    media_type: 'CAROUSEL',
    children: children.join(','),
    caption,
    access_token: token,
  });
  await waitContainer(carousel.id, token);

  const published = await igPost(`${userId}/media_publish`, {
    creation_id: carousel.id,
    access_token: token,
  });
  return published.id;
}

// ── Threads API — 글(+커버 1장) 발행 ───────────────────────

const THREADS_BASE = 'https://graph.threads.net/v1.0';

export async function publishThreads(text: string, coverImageUrl?: string | null): Promise<string> {
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!userId || !token)
    throw new Error('THREADS_USER_ID / THREADS_ACCESS_TOKEN 미설정 — Threads API 연결 후 env에 추가하세요');

  const params: Record<string, string> = coverImageUrl
    ? { media_type: 'IMAGE', image_url: coverImageUrl, text, access_token: token }
    : { media_type: 'TEXT', text, access_token: token };

  const res = await fetch(`${THREADS_BASE}/${userId}/threads`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const container = await res.json();
  if (!res.ok || container.error) throw new Error(`Threads API: ${container.error?.message ?? res.status}`);

  // 미디어 처리 대기 (Threads 권장 30s — 이미지면 짧게 폴링)
  if (coverImageUrl) await new Promise((r) => setTimeout(r, 5000));

  const pub = await fetch(`${THREADS_BASE}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString(),
  });
  const data = await pub.json();
  if (!pub.ok || data.error) throw new Error(`Threads publish: ${data.error?.message ?? pub.status}`);
  return data.id;
}
