#!/usr/bin/env node
/**
 * 모션 카드 — 카드뉴스에 움직임을 얹어 1080×1350 MP4로 만든다.
 *
 * 입구 3개, 출력 1규격(1080×1350 · 30fps · H.264 MP4):
 *   video  주어진 영상을 카드 규격으로 크롭·리사이즈 (+선택 텍스트 오버레이)
 *   image  정적 이미지에 모션 효과(켄번즈·팬 등)를 얹어 영상화 (+선택 텍스트)
 *   html   CSS 애니메이션이 든 HTML을 프레임 캡처해서 영상화 (자유도 최대)
 *
 * 사용:
 *   node scripts/motion-card/motion-card.mjs image --src photo.jpg --effect kenburns \
 *     --title "제목 줄바꿈은\n리터럴 \n" --sub "부제" --out out.mp4
 *   node scripts/motion-card/motion-card.mjs video --src clip.mov --title "제목" --out out.mp4
 *   node scripts/motion-card/motion-card.mjs html --src card.html --duration 5 --out out.mp4
 *
 * 옵션: --duration 초(기본 4) --fps (기본 30) --effect kenburns|zoomout|panleft|panright
 *       --title --sub (텍스트 오버레이, video/image 공통) --out (기본 ./motion-card.mp4)
 *
 * 방법: HTML 경로는 Playwright로 애니메이션을 pause시키고 currentTime을 프레임 단위로
 *       밟아가며 스크린샷 → ffmpeg 인코딩. 실시간 녹화가 아니라 프레임 드랍이 없다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const mode = args[0];
const argOf = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
// 기본은 카드 규격. 슬롯 합성(카드의 이미지 영역에만 영상을 넣을 때)은 --size 로 슬롯 크기를 준다.
// libx264가 홀수 크기를 거부하므로 짝수로 내림.
const [W, H] = argOf('--size', '1080x1350').split('x').map((v) => Math.max(2, Number(v) - (Number(v) % 2)));
const SRC = argOf('--src');
const OUT = path.resolve(argOf('--out', './motion-card.mp4'));
const DURATION = Number(argOf('--duration', '4'));
const FPS = Number(argOf('--fps', '30'));
const FOCUS = argOf('--focus', ''); // "x,y,w,h" 출력 캔버스(1080×1350) 픽셀 — 해당 영역만 밝게 두고 깜빡이는 링
const FIT = argOf('--fit', 'cover'); // cover|contain — 스크린샷은 contain이 안 잘린다
// 포커스를 줬는데 효과를 안 정했으면 still — 이미지가 움직이면 포커스 좌표가 어긋난다
const EFFECT = argOf('--effect', FOCUS ? 'still' : 'kenburns');
const TITLE = argOf('--title', '');
const SUB = argOf('--sub', '');
// 카테고리 악센트 — lib/cardpress/templates.tsx ACCENTS와 동일한 이중 정의(변경 시 동시 수정)
const ACCENT_MAP = {
  'cat-case': ['#2F6BFF', '#D6E2FF'],
  'cat-trend': ['#7C3AED', '#E4D5FF'],
  'cat-tool': ['#0E9F6E', '#C9F3E3'],
  'cat-prompt': ['#C2410C', '#FFD9C2'],
  'cat-guide': ['#0F766E', '#C7E8E5'],
};
const ACCENT_RAW = argOf('--accent', ''); // cat-* 이름 또는 hex
const [ACCENT, ACCENT_BRIGHT] = ACCENT_MAP[ACCENT_RAW] || (ACCENT_RAW ? [ACCENT_RAW, ''] : ['', '']);
const OVERLAY = argOf('--overlay', ''); // video 모드: 실영상 위에 얹을 애니메이션 HTML(투명 배경) 경로

if (!['video', 'image', 'html'].includes(mode) || !SRC) {
  console.error('사용법: motion-card.mjs <video|image|html> --src <파일> [옵션]');
  process.exit(1);
}

const ffmpeg = (a) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });

const fontData = (file) =>
  `data:font/woff;base64,${readFileSync(path.join(ROOT, 'assets/fonts', file)).toString('base64')}`;

const imgData = (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] || 'image/png';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
};

const FONT_CSS = `
  @font-face { font-family: 'Pretendard'; font-weight: 400; src: url('${fontData('Pretendard-Regular.woff')}') format('woff'); }
  @font-face { font-family: 'Pretendard'; font-weight: 800; src: url('${fontData('Pretendard-ExtraBold.woff')}') format('woff'); }
`;

/** 이미지 모션 효과 프리셋 — transform만 쓴다(레이아웃 리플로 없이 GPU 합성) */
const EFFECTS = {
  still: 'from { transform: none; } to { transform: none; }',
  kenburns: 'from { transform: scale(1.0); } to { transform: scale(1.14); }',
  zoomout: 'from { transform: scale(1.16); } to { transform: scale(1.0); }',
  panleft: 'from { transform: scale(1.12) translateX(2.5%); } to { transform: scale(1.12) translateX(-2.5%); }',
  panright: 'from { transform: scale(1.12) translateX(-2.5%); } to { transform: scale(1.12) translateX(2.5%); }',
  // 세로로 긴 스크린샷을 위→아래로 훑는다 (양끝 8%씩 멈춤). 이미지가 캔버스보다 길어야 의미 있다
  scrolldown: `0%, 8% { transform: translateY(0); } 92%, 100% { transform: translateY(calc(-100% + ${H}px)); }`,
  scrollup: `0%, 8% { transform: translateY(calc(-100% + ${H}px)); } 92%, 100% { transform: translateY(0); }`,
};
const IS_SCROLL = ['scrolldown', 'scrollup'].includes(EFFECT);

/** 텍스트 오버레이 마크업 — 하단 스크림 + 페이드업. video/image 두 입구가 공유 */
const overlayHtml = (title, sub, animate) => {
  if (!title && !sub) return '';
  const anim = animate
    ? `animation: rise ${Math.min(1.2, DURATION * 0.3)}s cubic-bezier(0.16,1,0.3,1) 0.4s both;`
    : '';
  return `
    <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(0,0,0,0) 52%, rgba(0,0,0,0.62) 100%);"></div>
    <div class="txt" style="position:absolute;left:72px;right:72px;bottom:96px;color:#fff;${anim}">
      ${title ? `<div style="font-weight:800;font-size:72px;line-height:1.22;letter-spacing:-0.02em;white-space:pre-line;">${title.replace(/\\n/g, '\n')}</div>` : ''}
      ${sub ? `<div style="margin-top:24px;font-weight:400;font-size:34px;line-height:1.45;opacity:0.92;white-space:pre-line;">${sub.replace(/\\n/g, '\n')}</div>` : ''}
    </div>`;
};

const pageShell = (body, extraCss = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
  ${FONT_CSS}
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${W}px; height:${H}px; overflow:hidden; font-family:'Pretendard',sans-serif; background:#000; }
  @keyframes rise { from { opacity:0; transform:translateY(36px); } to { opacity:1; transform:translateY(0); } }
  ${extraCss}
</style></head><body>${body}</body></html>`;

/** HTML 페이지의 애니메이션을 프레임 단위로 캡처 → 프레임 폴더 경로 반환
 *  transparent=true면 배경 없는 PNG(영상 위 오버레이 합성용) */
async function captureFrames(html, { url, totalFrames, transparent = false } = {}) {
  const frames = mkdtempSync(path.join(tmpdir(), 'motion-card-'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    if (url) await page.goto(url, { waitUntil: 'networkidle' });
    else await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (transparent)
      await page.evaluate(() => { document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; });
    // --accent cat-case 처럼 주면 프리셋의 :root 변수를 덮어쓴다 — 파일 수정 없이 카테고리색 적용
    if (ACCENT)
      await page.evaluate(([a, b]) => {
        document.documentElement.style.setProperty('--accent', a);
        if (b) document.documentElement.style.setProperty('--accent-bright', b);
      }, [ACCENT, ACCENT_BRIGHT]);

    // 애니메이션을 전부 멈추고 시계를 직접 돌린다 — 캡처 시간과 무관하게 프레임이 정확해진다
    await page.evaluate(() => document.getAnimations({ subtree: true }).forEach((a) => a.pause()));
    for (let i = 0; i < totalFrames; i++) {
      const ms = (i / FPS) * 1000;
      await page.evaluate((t) => document.getAnimations({ subtree: true }).forEach((a) => { a.currentTime = t; }), ms);
      await page.screenshot({ path: path.join(frames, `f${String(i).padStart(5, '0')}.png`), omitBackground: transparent });
      if (i % FPS === 0) process.stdout.write(`\r프레임 ${i}/${totalFrames}`);
    }
    process.stdout.write(`\r프레임 ${totalFrames}/${totalFrames}\n`);
  } finally {
    await browser.close();
  }
  return frames;
}

/** HTML을 캡처해 MP4로 인코딩 */
async function captureHtmlToMp4(html, { url } = {}) {
  const frames = await captureFrames(html, { url, totalFrames: Math.round(DURATION * FPS) });
  ffmpeg(['-framerate', String(FPS), '-i', path.join(frames, 'f%05d.png'),
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);
  rmSync(frames, { recursive: true, force: true });
}

const probeDuration = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

if (mode === 'image') {
  const kf = EFFECTS[EFFECT];
  if (!kf) { console.error(`--effect는 ${Object.keys(EFFECTS).join('|')} 중 하나`); process.exit(1); }
  let html;
  if (FOCUS) {
    // 시네마틱 포커스 — 링을 그리는 대신 카메라가 영역으로 줌인하고, 주변이 어두워지며,
    // 영역 자체가 빛나며 맥박친다(mix-blend-mode:screen — 화면 요소가 스스로 깜빡이는 느낌).
    const [fx, fy, fw, fh] = FOCUS.split(',').map(Number);
    if ([fx, fy, fw, fh].some(Number.isNaN)) { console.error('--focus는 "x,y,w,h" 픽셀 4개'); process.exit(1); }
    const cx = fx + fw / 2;
    const cy = fy + fh / 2;
    const scale = Math.min(2.4, Math.max(1.35, 0.55 * Math.min(W / fw, H / fh)));
    const zoomDur = Math.min(2.2, DURATION * 0.4);
    // 글로우 색은 영역의 실제 색을 샘플링 — 노란 셀이면 노랗게 빛나야 "요소가 스스로 깜빡이는" 느낌이 난다
    let glowColor = ACCENT || '#FFD166';
    try {
      const sharp = (await import('sharp')).default;
      const srcPath = path.resolve(SRC);
      const meta = await sharp(srcPath).metadata();
      const s = FIT === 'contain' ? Math.min(W / meta.width, H / meta.height) : Math.max(W / meta.width, H / meta.height);
      const offX = (W - meta.width * s) / 2;
      const offY = (H - meta.height * s) / 2;
      const ix = Math.min(meta.width - 2, Math.max(0, Math.round((fx - offX) / s)));
      const iy = Math.min(meta.height - 2, Math.max(0, Math.round((fy - offY) / s)));
      const iw = Math.max(2, Math.min(meta.width - ix, Math.round(fw / s)));
      const ih = Math.max(2, Math.min(meta.height - iy, Math.round(fh / s)));
      const raw = await sharp(srcPath).extract({ left: ix, top: iy, width: iw, height: ih }).resize(24, 24, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      const ch = raw.info.channels;
      const px = [];
      for (let i = 0; i < raw.data.length; i += ch) {
        const [r, g, b] = [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
        px.push({ r, g, b, sat: Math.max(r, g, b) - Math.min(r, g, b), lum: r + g + b });
      }
      // 채도 상위 20% 픽셀 평균 — 배경이 아니라 "빛나는 요소"의 색을 집는다
      px.sort((a, b) => b.sat - a.sat);
      const top = px.slice(0, Math.max(8, Math.floor(px.length * 0.2)));
      const avg = (k) => Math.round(top.reduce((t, p) => t + p[k], 0) / top.length);
      glowColor = `rgb(${avg('r')},${avg('g')},${avg('b')})`;
    } catch { /* 샘플링 실패 시 악센트/앰버 폴백 */ }
    html = pageShell(
      `<div style="position:absolute;inset:0;overflow:hidden;">
         <div style="position:absolute;inset:0;transform-origin:${cx}px ${cy}px;animation:zoomin ${zoomDur}s cubic-bezier(0.33,1,0.4,1) 0.4s both;">
           <img src="${imgData(path.resolve(SRC))}" style="width:100%;height:100%;object-fit:${FIT};"/>
           <div style="position:absolute;inset:0;background:radial-gradient(ellipse ${Math.round(fw * 1.3)}px ${Math.round(fh * 2.2)}px at ${cx}px ${cy}px, rgba(0,0,0,0) 45%, rgba(0,0,0,0.5) 100%);animation:vin ${zoomDur}s ease-out 0.4s both;"></div>
           <div style="position:absolute;left:${Math.round(fx - fw * 0.25)}px;top:${Math.round(fy - fh * 0.35)}px;width:${Math.round(fw * 1.5)}px;height:${Math.round(fh * 1.7)}px;background:radial-gradient(closest-side, color-mix(in srgb, ${glowColor} 80%, transparent) 0%, transparent 74%);mix-blend-mode:screen;animation:pulse 1.15s ease-in-out ${(zoomDur + 0.5).toFixed(2)}s infinite;opacity:0;"></div>
         </div>
       </div>${overlayHtml(TITLE, SUB, true)}`,
      `@keyframes zoomin { from { transform: scale(1); } to { transform: scale(${scale.toFixed(3)}); } }
       @keyframes vin { from { opacity: 0; } to { opacity: 1; } }
       @keyframes pulse { 0%, 100% { opacity: 0.1; } 50% { opacity: 1; } }`
    );
  } else {
    // 스크롤 효과는 이미지 원비율 유지(height:auto)여야 세로 이동 거리가 생긴다
    const imgStyle = IS_SCROLL
      ? `width:100%;height:auto;animation:fx ${DURATION}s ease-in-out both;`
      : `width:100%;height:100%;object-fit:${FIT};animation:fx ${DURATION}s linear both;`;
    html = pageShell(
      `<div style="position:absolute;inset:0;overflow:hidden;">
         <img src="${imgData(path.resolve(SRC))}" style="${imgStyle}"/>
       </div>${overlayHtml(TITLE, SUB, true)}`,
      `@keyframes fx { ${kf} }`
    );
  }
  await captureHtmlToMp4(html);
} else if (mode === 'html') {
  const src = path.resolve(SRC);
  await captureHtmlToMp4(null, { url: `file://${src}` });
} else if (mode === 'video') {
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS}`;
  const enc = ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k'];
  if (OVERLAY || TITLE || SUB) {
    // 실영상 위에 "움직이는" 오버레이 — 투명 PNG 시퀀스로 캡처해서 프레임 단위 합성.
    // 오버레이 애니메이션은 영상 전체 길이만큼 캡처한다(한 번 재생 후 fill 상태로 정지 — infinite면 계속 돈다).
    const videoDur = probeDuration(path.resolve(SRC));
    const totalFrames = Math.ceil(Math.min(videoDur, 60) * FPS);
    const frames = OVERLAY
      ? await captureFrames(null, { url: `file://${path.resolve(OVERLAY)}`, totalFrames, transparent: true })
      : await captureFrames(pageShell(overlayHtml(TITLE, SUB, true)), { totalFrames, transparent: true });
    ffmpeg(['-i', path.resolve(SRC), '-framerate', String(FPS), '-i', path.join(frames, 'f%05d.png'),
      '-filter_complex', `[0:v]${fit}[bg];[bg][1:v]overlay=0:0:shortest=1`, ...enc, OUT]);
    rmSync(frames, { recursive: true, force: true });
  } else {
    ffmpeg(['-i', path.resolve(SRC), '-vf', fit, ...enc, OUT]);
  }
}

console.log(`완료 → ${OUT}`);
