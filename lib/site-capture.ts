// lib/site-capture.ts
// 도구의 "실제 사용 화면" 후보를 모으는 로컬 전용 수집기.
// suggest-images 라우트에서만 쓰며, 로컬 admin(내 Mac)에서만 동작한다(③ 로컬 작업장 모델).
//
// 후보는 두 종류를 섞는다 — 랜딩만 찍으면 히어로/가격 같은 마케팅 컷만 나와서
// "이 기능은 이렇게 생겼다"를 보여주지 못하기 때문:
//   1) screenshot — 공식 하위페이지(features·docs·use-cases 등)를 뷰포트 단위로 캡처
//   2) embedded   — 그 페이지들에 박혀 있는 큰 <img> (문서·블로그의 실제 UI 스크린샷이 여기 있다)
//
// Seam 캡처에서 확인한 제약을 그대로 반영:
//   - fullPage + deviceScaleFactor 2는 페이지가 길면 Chromium 텍스처 한계(16384px)를 넘겨
//     브라우저가 통째로 죽는다 → 뷰포트 단위로 스크롤하며 여러 장을 찍는다.
//   - networkidle은 광고/폴링이 있는 사이트에서 안 끝날 수 있다 → 타임아웃 시 domcontentloaded 폴백.
// 산출물은 tmpdir 하위에 저장한다 — Claude CLI(cwd=tmpdir)가 Read로 열 수 있는 경로.

import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { Browser, Page } from 'playwright';

export interface Candidate {
  /** 0부터 — 매칭 프롬프트·응답에서 이 번호로 참조 */
  index: number;
  /** 로컬 파일 절대 경로 (tmpdir 하위) */
  path: string;
  kind: 'screenshot' | 'embedded';
  /** 공식 사이트에서 온 것인지, 외부(리뷰·문서)인지 — 운영자에게 출처로 표시 */
  origin: 'official' | 'external';
  /** 이 후보가 나온 페이지 URL */
  sourceUrl: string;
  /** 사람이 읽는 짧은 설명 (예: "공식 · /features · 스크롤 2") */
  label: string;
}

export interface CaptureResult {
  /** 산출물 디렉터리 — 사용 후 cleanupCapture(dir)로 지울 것 */
  dir: string;
  title: string;
  /** 랜딩 본문 발췌 — 매칭 프롬프트의 보조 근거 */
  pageText: string;
  candidates: Candidate[];
  /** 실제로 방문한 페이지들 — 로그·디버깅용 */
  visited: string[];
}

const VIEWPORT = { width: 1280, height: 900 };

/** 실사용 화면이 있을 법한 경로 — 점수가 높은 순으로 방문 */
const PATH_HINTS: { re: RegExp; score: number }[] = [
  { re: /\/(docs?|documentation|guide|manual|help)(\/|$)/i, score: 10 },
  { re: /\/(features?|product|capabilities)(\/|$)/i, score: 9 },
  { re: /\/(use-?cases?|examples?|showcase|gallery|templates?)(\/|$)/i, score: 8 },
  { re: /\/(how-it-works|tour|demo|playground|screenshots?)(\/|$)/i, score: 8 },
  { re: /\/(blog|changelog|updates?|release)(\/|$)/i, score: 5 },
  { re: /\/(pricing|plans)(\/|$)/i, score: 2 },
];

/** 아이콘·로고·배지처럼 콘텐츠에 못 쓰는 자잘한 이미지를 걸러낸다 */
const MIN_IMG = { w: 640, h: 360 };

function scorePath(u: string): number {
  const hit = PATH_HINTS.find((h) => h.re.test(u));
  return hit?.score ?? 0;
}

async function gotoSafe(page: Page, url: string): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  } catch {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForTimeout(2_500);
    } catch {
      return false;
    }
  }
  await page.waitForTimeout(1_200);
  return true;
}

/** 현재 페이지를 뷰포트 단위로 훑으며 캡처. 지연 로딩 이미지도 이 과정에서 뜬다. */
async function shootPage(page: Page, dir: string, prefix: string, maxShots: number): Promise<string[]> {
  const scrollHeight = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0);
  const step = Math.floor(VIEWPORT.height * 0.85);
  const maxScroll = Math.max(0, scrollHeight - VIEWPORT.height);

  const positions: number[] = [];
  for (let y = 0; y <= maxScroll && positions.length < maxShots; y += step) positions.push(y);
  if (positions.length === 0) positions.push(0);

  const files: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), positions[i]);
    await page.waitForTimeout(600);
    const file = path.join(dir, `${prefix}-${i}.png`);
    await page.screenshot({ path: file });
    files.push(file);
  }
  return files;
}

/** 페이지에 렌더된 큰 이미지들의 실제 URL을 수집 (문서·블로그의 UI 스크린샷이 여기 있다) */
async function harvestImageUrls(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ minW, minH }) => {
      const out: string[] = [];
      document.querySelectorAll('img').forEach((img) => {
        const el = img as HTMLImageElement;
        // currentSrc는 srcset이 적용된 실제 로드 주소
        const src = el.currentSrc || el.src;
        if (!src || src.startsWith('data:')) return;
        if (el.naturalWidth < minW || el.naturalHeight < minH) return;
        // 지나치게 납작한 배너/구분선 제외
        const ratio = el.naturalWidth / el.naturalHeight;
        if (ratio > 4 || ratio < 0.4) return;
        out.push(src);
      });
      return out;
    },
    { minW: MIN_IMG.w, minH: MIN_IMG.h },
  );
}

const IMG_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** 수집한 이미지 URL을 내려받아 로컬 파일로 저장 (Claude가 Read로 열 수 있게) */
async function downloadImage(url: string, dir: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CaselabBot/1.0)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    const ext = IMG_TYPES[ct];
    if (!ext) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 20_000) return null; // 20KB 미만은 아이콘일 확률이 높다
    const file = path.join(dir, `${name}.${ext}`);
    await writeFile(file, buf);
    return file;
  } catch {
    return null;
  }
}

export async function captureSources(input: {
  url: string;
  /** 외부 리뷰·문서 페이지 (선택) */
  extraUrls?: string[];
  /** 공식 하위페이지 방문 수 상한 */
  maxPages?: number;
  /** 전체 후보 수 상한 — 너무 많으면 매칭이 느려진다 */
  maxCandidates?: number;
}): Promise<CaptureResult> {
  const { url, extraUrls = [] } = input;
  const maxPages = input.maxPages ?? 4;
  const maxCandidates = input.maxCandidates ?? 18;

  // 정적 import는 Vercel 빌드가 devDependency(playwright)를 번들하려다 실패한다 → 동적 import.
  const { chromium } = await import('playwright');
  const dir = await mkdtemp(path.join(tmpdir(), 'ai-image-fill-'));

  let browser: Browser | undefined;
  const candidates: Candidate[] = [];
  const visited: string[] = [];
  const seenImageUrls = new Set<string>();
  let title = '';
  let pageText = '';

  const push = (c: Omit<Candidate, 'index'>) => {
    if (candidates.length >= maxCandidates) return;
    candidates.push({ ...c, index: candidates.length });
  };

  try {
    // 운영자 Mac에 설치된 Chrome을 우선 사용(플레이라이트 브라우저 미설치 환경 대비).
    browser = await chromium
      .launch({ channel: 'chrome', headless: true })
      .catch(() => chromium.launch({ headless: true }));

    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      locale: 'ko-KR',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25_000);

    // ── 1. 랜딩 ─────────────────────────────────────────────
    if (!(await gotoSafe(page, url))) throw new Error(`사이트를 열지 못했어요: ${url}`);
    visited.push(url);

    const meta = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText?.slice(0, 4_000) ?? '',
    }));
    title = meta.title;
    pageText = meta.text;

    const landingShots = await shootPage(page, dir, 'home', 3);
    landingShots.forEach((p, i) =>
      push({ path: p, kind: 'screenshot', origin: 'official', sourceUrl: url, label: `공식 랜딩 · 스크롤 ${i + 1}` }),
    );

    // 랜딩 하단까지 스크롤된 상태라 지연 로딩 이미지도 잡힌다
    const landingImgs = await harvestImageUrls(page);

    // ── 2. 하위페이지 후보 추리기 ────────────────────────────
    const links: string[] = await page.evaluate((origin) => {
      const set = new Set<string>();
      document.querySelectorAll('a[href]').forEach((a) => {
        try {
          const u = new URL((a as HTMLAnchorElement).href, location.href);
          if (u.origin !== origin) return;
          u.hash = '';
          set.add(u.toString());
        } catch {
          /* 잘못된 href 무시 */
        }
      });
      return [...set];
    }, new URL(url).origin);

    const subPages = links
      .filter((l) => l.replace(/\/$/, '') !== url.replace(/\/$/, ''))
      .map((l) => ({ url: l, score: scorePath(l) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPages)
      .map((x) => x.url);

    // ── 3. 하위페이지 순회 (캡처 + 내장 이미지) ──────────────
    const pageImgs: { url: string; from: string; origin: 'official' | 'external' }[] = landingImgs.map((u) => ({
      url: u,
      from: url,
      origin: 'official' as const,
    }));

    for (const sub of subPages) {
      if (candidates.length >= maxCandidates) break;
      if (!(await gotoSafe(page, sub))) continue;
      visited.push(sub);
      const shots = await shootPage(page, dir, `sub${visited.length}`, 2);
      const short = new URL(sub).pathname || '/';
      shots.forEach((p, i) =>
        push({ path: p, kind: 'screenshot', origin: 'official', sourceUrl: sub, label: `공식 · ${short} · 스크롤 ${i + 1}` }),
      );
      (await harvestImageUrls(page)).forEach((u) => pageImgs.push({ url: u, from: sub, origin: 'official' }));
    }

    // ── 4. 외부(리뷰·문서) 페이지 ────────────────────────────
    for (const ext of extraUrls) {
      if (candidates.length >= maxCandidates) break;
      if (!(await gotoSafe(page, ext))) continue;
      visited.push(ext);
      const shots = await shootPage(page, dir, `ext${visited.length}`, 2);
      const host = new URL(ext).hostname.replace(/^www\./, '');
      shots.forEach((p, i) =>
        push({ path: p, kind: 'screenshot', origin: 'external', sourceUrl: ext, label: `외부 · ${host} · 스크롤 ${i + 1}` }),
      );
      (await harvestImageUrls(page)).forEach((u) => pageImgs.push({ url: u, from: ext, origin: 'external' }));
    }

    // ── 5. 내장 이미지 내려받기 ──────────────────────────────
    // 문서·블로그에 박힌 실제 UI 스크린샷이 여기 있다 — 후보의 핵심.
    for (const img of pageImgs) {
      if (candidates.length >= maxCandidates) break;
      if (seenImageUrls.has(img.url)) continue;
      seenImageUrls.add(img.url);
      const file = await downloadImage(img.url, dir, `img${seenImageUrls.size}`);
      if (!file) continue;
      const host = new URL(img.from).hostname.replace(/^www\./, '');
      push({
        path: file,
        kind: 'embedded',
        origin: img.origin,
        sourceUrl: img.from,
        label: `${img.origin === 'official' ? '공식' : '외부'} 페이지 내 이미지 · ${host}`,
      });
    }

    return { dir, title, pageText, candidates, visited };
  } finally {
    await browser?.close().catch(() => {});
  }
}

/** 캡처 임시 디렉터리 정리 — 업로드가 끝난 뒤 호출 */
export async function cleanupCapture(dir: string) {
  if (!dir.startsWith(tmpdir())) return; // tmpdir 밖은 절대 지우지 않는다
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
