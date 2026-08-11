// lib/site-capture.ts
// 도구 공식 사이트를 헤드리스 Chrome으로 열어 스크린샷 후보를 뜨는 로컬 전용 유틸.
// suggest-images 라우트에서만 쓰며, 로컬 admin(내 Mac)에서만 동작한다(③ 로컬 작업장 모델).
//
// Seam 캡처에서 확인한 제약을 그대로 반영:
//  - fullPage + deviceScaleFactor 2는 페이지가 길면 Chromium 텍스처 한계(16384px)를 넘겨
//    브라우저가 통째로 죽는다 → 뷰포트 단위로 스크롤하며 여러 장을 찍는다.
//  - networkidle은 광고/폴링이 있는 사이트에서 영원히 안 끝날 수 있다 → 타임아웃 시
//    domcontentloaded + 고정 대기로 폴백.
// 스크린샷은 tmpdir 하위에 저장한다 — Claude CLI(cwd=tmpdir)가 Read로 열 수 있는 경로.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

export interface CaptureShot {
  /** 0부터 — 매칭 프롬프트·응답에서 이 번호로 참조 */
  index: number;
  /** PNG 절대 경로 (tmpdir 하위) */
  path: string;
  /** 캡처 시점의 세로 스크롤 위치(css px) — 페이지 상단일수록 히어로/개요 */
  scrollY: number;
}

export interface CaptureResult {
  /** 캡처 산출물 디렉터리 — 사용 후 cleanupCapture(dir)로 지울 것 */
  dir: string;
  title: string;
  /** 본문 텍스트 발췌 — 매칭 프롬프트의 보조 근거 */
  pageText: string;
  shots: CaptureShot[];
}

const VIEWPORT = { width: 1280, height: 900 };

export async function captureSite(
  url: string,
  opts: { maxShots?: number } = {},
): Promise<CaptureResult> {
  const maxShots = opts.maxShots ?? 8;
  // 정적 import는 Vercel 빌드가 devDependency(playwright)를 번들하려다 실패한다 → 동적 import.
  const { chromium } = await import('playwright');

  const dir = await mkdtemp(path.join(tmpdir(), 'ai-image-fill-'));
  let browser;
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
    page.setDefaultTimeout(30_000);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25_000 });
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 }).catch(() => {});
      await page.waitForTimeout(3_000);
    }
    await page.waitForTimeout(1_500);

    const meta = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText?.slice(0, 4_000) ?? '',
      scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
    }));

    // 뷰포트의 85%씩 내려가며 캡처 — 마지막 장은 페이지 끝에 맞춘다.
    const step = Math.floor(VIEWPORT.height * 0.85);
    const maxScroll = Math.max(0, meta.scrollHeight - VIEWPORT.height);
    const positions: number[] = [];
    for (let y = 0; y <= maxScroll && positions.length < maxShots; y += step) positions.push(y);
    if (positions.length < maxShots && maxScroll > 0 && positions[positions.length - 1] !== maxScroll) {
      positions.push(maxScroll);
    }
    if (positions.length === 0) positions.push(0);

    const shots: CaptureShot[] = [];
    for (let i = 0; i < positions.length; i++) {
      const scrollY = positions[i];
      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await page.waitForTimeout(600);
      const file = path.join(dir, `shot-${String(i).padStart(2, '0')}.png`);
      await page.screenshot({ path: file });
      shots.push({ index: i, path: file, scrollY });
    }

    return { dir, title: meta.title, pageText: meta.text, shots };
  } finally {
    await browser?.close().catch(() => {});
  }
}

/** 캡처 임시 디렉터리 정리 — 업로드가 끝난 뒤 호출 */
export async function cleanupCapture(dir: string) {
  if (!dir.startsWith(tmpdir())) return; // tmpdir 밖은 절대 지우지 않는다
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
