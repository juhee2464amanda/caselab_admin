import { ImageResponse } from 'next/og';
import type { ReactElement } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderSlide, CARD_W, CARD_H } from '@/lib/cardpress/templates';
import { loadCardFonts } from '@/lib/cardpress/fonts';
import { RenderSlideSchema, type CardAccent, type CardSlide } from '@/types/cardpress';

// 발행 파이프라인 공용 유틸 — 활성 슬라이드 일괄 PNG 렌더 → cardpress 버킷 업로드(공개 URL).
// IG/Threads API가 공개 URL을 요구하므로(spec §3-③) 발행 전 반드시 이 단계를 거친다.

export type RenderedSlide = { order: number; template: string; buffer: Buffer; path: string };

async function renderOne(
  template: string,
  accent: CardAccent,
  props: unknown,
  fonts: Awaited<ReturnType<typeof loadCardFonts>>,
  where: string
): Promise<Buffer> {
  const parsed = RenderSlideSchema.safeParse({ template, accent, props });
  if (!parsed.success)
    throw new Error(`${where}(${template}) 스키마 오류 — 검수 UI에서 수정 후 다시: ${parsed.error.issues[0]?.message}`);
  const res = new ImageResponse(renderSlide(parsed.data) as ReactElement, {
    width: CARD_W,
    height: CARD_H,
    fonts,
    emoji: 'twemoji',
  });
  return Buffer.from(await res.arrayBuffer());
}

export async function renderEnabledSlides(
  cardId: string,
  accent: CardAccent,
  slides: CardSlide[]
): Promise<RenderedSlide[]> {
  const fonts = await loadCardFonts();
  const enabled = slides.filter((s) => s.enabled);
  const out: RenderedSlide[] = [];
  for (const s of enabled) {
    out.push({
      order: s.order,
      template: s.template,
      buffer: await renderOne(s.template, accent, s.props, fonts, `슬라이드 ${s.order}`),
      path: `${cardId}/${String(out.length + 1).padStart(2, '0')}_${s.template}.png`,
    });
  }
  return out;
}

/** 엔딩 카드(슬라이드형) 1장 렌더 — 저장된 slides에는 없고 cta_type에서 파생된다 */
export async function renderEndingSlide(
  cardId: string,
  accent: CardAccent,
  template: string,
  props: Record<string, unknown>,
  index: number
): Promise<RenderedSlide> {
  const fonts = await loadCardFonts();
  return {
    order: index,
    template,
    buffer: await renderOne(template, accent, props, fonts, '엔딩 카드'),
    path: `${cardId}/${String(index).padStart(2, '0')}_ending_${template}.png`,
  };
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

// ── Instagram API (Instagram Login) — 캐러셀 발행 ──────────
// 컨테이너 생성(is_carousel_item) → 캐러셀 컨테이너 → 처리 대기 → publish
//
// 호스트가 graph.facebook.com이 아니라 graph.instagram.com인 이유(2026-08-15 전환):
//   Instagram 발행에는 두 경로가 있다. ① Facebook Login(graph.facebook.com, instagram_content_publish)
//   ② Instagram Login(graph.instagram.com, instagram_business_content_publish).
//   ①로 가려 했으나 신규 앱의 Facebook Login for Business 구성에서 인스타 권한이 아예 검색되지 않았다
//   ("No matching results") — Meta가 신규 앱을 ②로 몰고 있다. 그래서 ②로 전환.
//   엔드포인트 경로·파라미터는 양쪽이 완전히 동일해서 바뀐 건 이 호스트 한 줄뿐이다.
//   대가: 토큰이 만료 없는 페이지 토큰이 아니라 60일짜리 IG 토큰이라 갱신이 필요하다
//        (scripts/instagram-connect.mjs --refresh, 만료 임박은 --verify가 경고).
const IG_BASE = 'https://graph.instagram.com/v21.0';
// Graph API 캐러셀 상한. 인스타 앱은 20장까지 올려주지만 API는 10장에서 막는다
// (developers.facebook.com/docs/instagram-platform/content-publishing).
// 11장째부터 컨테이너 생성은 성공하고 캐러셀 묶는 단계에서만 터지므로, 여기서 미리 잘라 말한다.
const IG_CAROUSEL_MAX = 10;

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

// 영상 자식은 트랜스코딩이 있어 이미지보다 오래 걸린다(수 초~수십 초) → 대기 상한을 나눠 잡는다.
async function waitContainer(containerId: string, token: string, attempts = 20): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${IG_BASE}/${containerId}?fields=status_code,status&access_token=${token}`);
    const data = await res.json();
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR')
      throw new Error(`Instagram 미디어 처리 실패${data.status ? ` — ${data.status}` : ''}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Instagram 미디어 처리 대기 초과(${attempts * 3}s)`);
}

/** 캐러셀 한 칸. 영상 칸은 media_type=VIDEO + video_url 로 만들어야 하고(이미지는 image_url),
 *  둘 다 is_carousel_item=true 가 붙어야 캐러셀 자식이 된다. */
export type CarouselItem = { kind: 'image' | 'video'; url: string };

export async function publishInstagramCarousel(
  items: CarouselItem[],
  caption: string
): Promise<string> {
  const userId = process.env.INSTAGRAM_USER_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!userId || !token)
    throw new Error('INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN 미설정 — Meta 비즈니스 연결 후 env에 추가하세요');
  if (items.length < 2) throw new Error('캐러셀은 최소 2장 필요');
  // 넘치는 장을 조용히 버리면 공들여 쓴 슬라이드가 말없이 사라진다 → 끄는 선택은 사람에게 맡긴다.
  if (items.length > IG_CAROUSEL_MAX)
    throw new Error(
      `캐러셀은 최대 ${IG_CAROUSEL_MAX}칸인데 ${items.length}칸입니다(엔딩 카드 포함) — 검수 UI에서 ${items.length - IG_CAROUSEL_MAX}장을 끄거나 엔딩을 빼고 다시 발행하세요(zip 다운로드는 전체 장수 그대로 나갑니다)`
    );

  const children: Array<{ id: string; kind: CarouselItem['kind'] }> = [];
  for (const item of items) {
    const c = await igPost(`${userId}/media`, {
      ...(item.kind === 'video'
        ? { media_type: 'VIDEO', video_url: item.url }
        : { image_url: item.url }),
      is_carousel_item: 'true',
      access_token: token,
    });
    children.push({ id: c.id, kind: item.kind });
  }
  for (const c of children) await waitContainer(c.id, token, c.kind === 'video' ? 40 : 20);

  const carousel = await igPost(`${userId}/media`, {
    media_type: 'CAROUSEL',
    children: children.map((c) => c.id).join(','),
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

async function threadsPost(path: string, params: Record<string, string>): Promise<Record<string, string>> {
  const res = await fetch(`${THREADS_BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Threads API: ${data.error?.message ?? res.status}`);
  return data;
}

/** 컨테이너 처리 대기 — IG의 waitContainer와 같은 이유(영상·다장 처리 지연) */
async function waitThreadsContainer(id: string, token: string, attempts = 20): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${THREADS_BASE}/${id}?fields=status,error_message&access_token=${token}`);
    const data = await res.json();
    if (data.status === 'FINISHED') return;
    if (data.status === 'ERROR') throw new Error(`Threads 미디어 처리 실패${data.error_message ? ` — ${data.error_message}` : ''}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Threads 미디어 처리 대기 초과(${attempts * 3}s)`);
}

/** Threads 발행 — 인스타처럼 슬라이드 전체를 캐러셀로 올린다 (2장 이상이면 CAROUSEL, 1장은 단일, 0장은 텍스트) */
export async function publishThreads(text: string, items: CarouselItem[] = []): Promise<string> {
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!userId || !token)
    throw new Error('THREADS_USER_ID / THREADS_ACCESS_TOKEN 미설정 — Threads API 연결 후 env에 추가하세요');
  // Threads 캐러셀 상한 20장 — IG(10장)보다 넉넉하지만 안전하게 자르지 않고 미리 알린다
  if (items.length > 20) throw new Error(`Threads 캐러셀은 최대 20장인데 ${items.length}장입니다`);

  let creationId: string;
  if (items.length >= 2) {
    const children: string[] = [];
    for (const item of items) {
      const c = await threadsPost(`${userId}/threads`, {
        ...(item.kind === 'video' ? { media_type: 'VIDEO', video_url: item.url } : { media_type: 'IMAGE', image_url: item.url }),
        is_carousel_item: 'true',
        access_token: token,
      });
      children.push(c.id);
    }
    for (const [i, id] of children.entries()) await waitThreadsContainer(id, token, items[i].kind === 'video' ? 40 : 20);
    const carousel = await threadsPost(`${userId}/threads`, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      text,
      access_token: token,
    });
    creationId = carousel.id;
    await waitThreadsContainer(creationId, token);
  } else if (items.length === 1) {
    const item = items[0];
    const c = await threadsPost(`${userId}/threads`, {
      ...(item.kind === 'video' ? { media_type: 'VIDEO', video_url: item.url } : { media_type: 'IMAGE', image_url: item.url }),
      text,
      access_token: token,
    });
    creationId = c.id;
    await waitThreadsContainer(creationId, token, item.kind === 'video' ? 40 : 20);
  } else {
    const c = await threadsPost(`${userId}/threads`, { media_type: 'TEXT', text, access_token: token });
    creationId = c.id;
  }

  const data = await threadsPost(`${userId}/threads_publish`, { creation_id: creationId, access_token: token });
  return data.id;
}
