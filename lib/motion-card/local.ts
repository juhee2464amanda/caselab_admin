import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { pExecFile } from '@/lib/reels/local';

// 모션 카드 실험실 서버 유틸 — scripts/motion-card/motion-card.mjs를 로컬에서 실행한다.
// 렌더 결과는 /content/motion-cards/(gitignore 아래)로 떨어지고 file 라우트가 스트리밍한다.

export const PRESET_DIR = path.join(process.cwd(), 'scripts', 'motion-card', 'presets');
export const OUT_DIR = path.join(process.cwd(), 'content', 'motion-cards');

export const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export type PresetInfo = {
  id: string; // 파일명(확장자 제외)
  title: string; // 파일 첫 주석 줄
  kind: 'overlay' | 'card'; // overlay = video 모드 --overlay 용(투명 배경)
  html: string;
};

/** presets/*.html 목록 — 제목은 첫 주석 줄에서, overlay 여부는 배경 투명 선언으로 판별 */
export function listPresets(): PresetInfo[] {
  return fs
    .readdirSync(PRESET_DIR)
    .filter((f) => f.endsWith('.html') && !f.startsWith('.'))
    .map((f) => {
      const html = fs.readFileSync(path.join(PRESET_DIR, f), 'utf8');
      const title = html.match(/\/\*\s*(.+)/)?.[1]?.trim() ?? f;
      return {
        id: f.replace(/\.html$/, ''),
        title,
        kind: html.includes('background:transparent') ? ('overlay' as const) : ('card' as const),
        html,
      };
    });
}

/** 홈 아래 실존 이미지/영상 파일만 허용 (reels resolveVideoPath와 같은 원칙) */
export function resolveMediaPath(input: unknown, exts: Set<string>): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const p = path.resolve(input.trim().replace(/^~(?=\/)/, os.homedir()));
  const inHome = p.startsWith(os.homedir() + path.sep);
  const inRepo = p.startsWith(process.cwd() + path.sep);
  if (!inHome && !inRepo) return null;
  if (!exts.has(path.extname(p).toLowerCase())) return null;
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  return p;
}

/** URL 소스는 임시 파일로 내려받는다 (슬라이드 이미지가 대부분 공개 URL이라서) */
export async function fetchToTmp(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`소스 다운로드 실패(${res.status}): ${url}`);
  const ext = (path.extname(new URL(url).pathname) || '.png').toLowerCase();
  const tmp = path.join(os.tmpdir(), `motion-src-${Date.now()}${ext}`);
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  return tmp;
}

/** "pct:x,y,w,h"(이미지 백분율) → 캔버스 픽셀 "x,y,w,h". 렌더와 같은 fit 수식으로 변환 */
export async function pctFocusToCanvas(
  focus: string,
  imgPath: string,
  W: number,
  H: number,
  fit: 'cover' | 'contain'
): Promise<string | null> {
  const m = focus.match(/^pct:([\d.]+),([\d.]+),([\d.]+),([\d.]+)$/);
  if (!m) return null;
  const meta = await sharp(imgPath).metadata();
  if (!meta.width || !meta.height) return null;
  const s = fit === 'contain' ? Math.min(W / meta.width, H / meta.height) : Math.max(W / meta.width, H / meta.height);
  const offX = (W - meta.width * s) / 2;
  const offY = (H - meta.height * s) / 2;
  const [px, py, pw, ph] = m.slice(1).map(Number);
  let x = Math.round((px / 100) * meta.width * s + offX);
  let y = Math.round((py / 100) * meta.height * s + offY);
  let w = Math.round((pw / 100) * meta.width * s);
  let h = Math.round((ph / 100) * meta.height * s);
  x = Math.max(0, Math.min(W - 10, x));
  y = Math.max(0, Math.min(H - 10, y));
  w = Math.max(10, Math.min(W - x, w));
  h = Math.max(10, Math.min(H - y, h));
  return `${x},${y},${w},${h}`;
}

/** 프로브용 단색 이미지 data URI — 카드 크기로 만들어야 어떤 fit/타일링에서도 슬롯을 가득 채운다
 *  (8px짜리로 하면 Satori가 축소 렌더해 슬롯 일부만 채워 bbox가 오탐지된다) */
export async function solidDataUri(r: number, g: number, b: number): Promise<string> {
  const buf = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/**
 * 전경 분리 — 이미지 자리를 흰색/검정으로 각각 렌더한 두 장을 비교해
 * ① 이미지가 비치는 영역(slot bbox) ② 그 위에 얹힌 전경(텍스트·스크림·테두리)을 RGBA로 복원한다.
 *
 * 원리: 픽셀이 fg를 α로 얹은 합성이라면  R_white = fg·α + 255·(1−α), R_black = fg·α
 * → α = 1 − (R_white − R_black)/255, fg = R_black/α.
 * 커버형(이미지가 카드 전체 배경, 텍스트가 그 위)에서도 텍스트·스크림이 정확히 보존된다 —
 * 영상을 밑에 깔고 이 전경을 다시 얹으면 "이미지 영역만 움직이는" 카드가 된다.
 */
export async function extractForeground(
  whitePng: Buffer,
  blackPng: Buffer
): Promise<{ slot: { x: number; y: number; w: number; h: number } | null; fgPng: Buffer }> {
  const [w, b] = await Promise.all([
    sharp(whitePng).raw().toBuffer({ resolveWithObject: true }),
    sharp(blackPng).raw().toBuffer({ resolveWithObject: true }),
  ]);
  const { width, height, channels } = w.info;
  const out = Buffer.alloc(width * height * 4);
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const o = (y * width + x) * 4;
      let diff = 0;
      let alphaSum = 0;
      const rgb = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const rw = w.data[i + c];
        const rb = b.data[i + c];
        diff = Math.max(diff, rw - rb);
        const a = 1 - Math.max(0, rw - rb) / 255;
        alphaSum += a;
        rgb[c] = a > 0.02 ? Math.min(255, Math.round(rb / a)) : 0;
      }
      const alpha = alphaSum / 3;
      if (diff > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      out[o] = rgb[0];
      out[o + 1] = rgb[1];
      out[o + 2] = rgb[2];
      out[o + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  const fgPng = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
  if (maxX < 0 || maxX - minX < 40 || maxY - minY < 40) return { slot: null, fgPng };
  const slot = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  slot.w -= slot.w % 2;
  slot.h -= slot.h % 2;
  return { slot, fgPng };
}

/** 터미널 타이핑 재현 HTML — 스크린샷을 줌하는 대신, 이미지에서 읽어낸 줄들이 실제로 쳐진다.
 *  스타일은 카드 타이핑 템플릿(다크 창 + 신호등 도트 + '~ %' 프롬프트) 그대로.
 *  시스템 모노 폰트만 써서 상대경로 자산이 없다 → 아무 임시 경로에서나 렌더 가능 */
export function terminalTypingHtml(lines: string[], w: number, h: number): string {
  const clean = lines.slice(0, 8).map((l) => l.replace(/</g, '&lt;'));
  // 첫 줄의 프롬프트 기호는 분리해서 색을 다르게 — "~ % cmd" / "$ cmd" 꼴
  const m = clean[0].match(/^([~$%#>»\s]{1,6}[%$#>»])\s+(.*)$/);
  const promptSym = m ? m[1] : '~ %';
  const cmd = m ? m[2] : clean[0];
  const outs = clean.slice(1);
  const maxLen = Math.max(promptSym.length + 1 + cmd.length, ...outs.map((l) => l.length), 10);
  const headH = Math.max(40, Math.round(h * 0.11)); // 도트 헤더
  const padX = Math.round(w * 0.07);
  const bodyH = h - headH - Math.round(h * 0.12);
  const fontSize = Math.max(13, Math.min((w - padX * 2) / (maxLen * 0.64), bodyH / ((outs.length + 1) * 2.1), 44));
  const typeDur = Math.min(2.2, 0.09 * cmd.length + 0.4);
  const rows = outs
    .map((l, i) => `<div class="out" style="animation-delay:${(typeDur + 0.9 + i * 0.55).toFixed(2)}s;">${l}</div>`)
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
* { margin:0; box-sizing:border-box; }
body { width:${w}px; height:${h}px; overflow:hidden; background:#12151F; font-family:Menlo,monospace;
       color:#D6DEE8; font-size:${Math.round(fontSize)}px; line-height:2.0; }
.dots { display:flex; gap:${Math.round(headH * 0.22)}px; padding:${Math.round(headH * 0.35)}px ${padX}px 0; }
.dots i { width:${Math.round(headH * 0.3)}px; height:${Math.round(headH * 0.3)}px; border-radius:50%; }
.term { padding: ${Math.round(h * 0.05)}px ${padX}px 0; }
.p { color:#5B82FF; font-weight:700; }
.cmd { display:inline-block; overflow:hidden; white-space:nowrap; vertical-align:bottom; color:#FFFFFF; font-weight:700;
       animation:typing ${typeDur.toFixed(2)}s steps(${Math.max(2, cmd.length)}) 0.5s both; width:${cmd.length}ch; }
@keyframes typing { from { width:0; } to { } }
.cursor { display:inline-block; width:0.55em; height:1.1em; background:#5B82FF; vertical-align:middle; margin-left:4px;
          animation:blink 0.9s steps(1) infinite; }
@keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
.out { opacity:0; animation:appear 0.15s both; color:#7A828F; }
.out:last-child { color:#7EE787; }
@keyframes appear { to { opacity:1; } }
</style></head><body>
<div class="dots"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>
<div class="term"><div><span class="p">${promptSym}</span> <span class="cmd">${cmd}</span><span class="cursor"></span></div>
${rows}</div>
</body></html>`;
}

/** motion-card.mjs 실행 — 성공 시 출력 mp4 절대경로 반환 */
export async function runMotionCard(mode: 'image' | 'video' | 'html', args: string[]): Promise<string> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${mode}-${Date.now()}.mp4`);
  const script = path.join(process.cwd(), 'scripts', 'motion-card', 'motion-card.mjs');
  await pExecFile('node', [script, mode, ...args, '--out', out], {
    cwd: process.cwd(),
    timeout: 5 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!fs.existsSync(out)) throw new Error('렌더 결과 파일이 없습니다');
  return out;
}
