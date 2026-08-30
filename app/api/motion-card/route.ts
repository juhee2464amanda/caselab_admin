import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { guardLocalAdmin, VIDEO_EXTS } from '@/lib/reels/local';
import os from 'node:os';
import {
  IMAGE_EXTS,
  OUT_DIR,
  PRESET_DIR,
  fetchToTmp,
  listPresets,
  extractForeground,
  pctFocusToCanvas,
  solidDataUri,
  terminalTypingHtml,
  resolveMediaPath,
  runMotionCard,
} from '@/lib/motion-card/local';
import { pExecFile } from '@/lib/reels/local';
import { renderEnabledSlides } from '@/lib/cardpress/publish';
import { callModel } from '@/lib/ai/ai-draft';
import { extractJson } from '@/lib/ai/claude-cli';
import { IMAGE_KEY } from '@/lib/cardpress/convert';
import type { CardAccent, CardSlide, CardTemplateId } from '@/types/cardpress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 모션 카드 실험실 — GET: 프리셋 목록 / POST: 렌더 실행 (로컬 전용)

export async function GET() {
  const denied = await guardLocalAdmin();
  if (denied) return denied;
  return NextResponse.json({ presets: listPresets() });
}

type Body = {
  mode: 'image' | 'video' | 'html' | 'composite';
  src?: string; // 파일 경로 또는 URL (image/video 모드)
  html?: string; // html 모드: 렌더할 프리셋 HTML 원문(수정본 가능)
  overlayId?: string; // video 모드: overlay 프리셋 id
  effect?: string;
  focus?: string; // "x,y,w,h"(캔버스 픽셀) 또는 "pct:x,y,w,h"(이미지 백분율)
  fit?: string;
  accent?: string; // cat-* 또는 hex
  title?: string;
  sub?: string;
  duration?: number;
  // composite 모드: 카드 레이아웃은 그대로 두고 이미지 슬롯 자리에만 모션을 합성
  slide?: { template: string; props: Record<string, unknown> };
  // effect가 terminal-typing일 때: 재현할 터미널 줄들 (AI 해석이 이미지에서 읽어옴)
  lines?: string[];
  // composite 모드: 끌어넣은 영상을 이미지 슬롯 자리에 넣을 때 (로컬 경로)
  srcVideo?: string;
};

const FOCUS_RE = /^\d+,\d+,\d+,\d+$/;

/** 타이핑 재현용 — 이미지에서 터미널 텍스트 줄을 자동 추출 (효과 선택만으로 동작하게).
 *  모델이 가끔 Read를 건너뛰고 빈 배열을 주는 일이 있어(2026-08-30 실측) 2회까지 재시도, 2회차는 사고량을 올린다. */
async function extractTerminalLines(imgPath: string): Promise<string[]> {
  for (const effort of ['low', 'medium'] as const) {
    try {
      const raw = await callModel(
        '너는 터미널 스크린샷 판독기다. 반드시 Read 도구로 이미지를 실제로 본 다음 답한다 — 보지 않고 답하는 것은 금지. 설명 없이 JSON만 반환한다.',
        `[이미지 파일] ${imgPath}\n\n1. Read("${imgPath}")를 호출해 이미지를 본다.\n2. 보이는 터미널 텍스트를 줄 단위로 옮겨 적는다.\n\n반환: {"lines": ["첫 줄(명령이면 프롬프트 기호 포함)", "..."]} 최대 6줄, 순서 유지. 정말로 터미널 텍스트가 없을 때만 {"lines": []}`,
        { allowedTools: ['Read'], model: 'sonnet', effort, timeoutMs: 90_000, humanTone: false }
      );
      // extractJson은 JSON "문자열"을 돌려준다 — 파싱은 여기서 (객체로 착각해 lines가 늘 비던 버그, 2026-08-31)
      const parsed = JSON.parse(extractJson(raw)) as { lines?: string[] };
      const lines = (parsed.lines ?? []).filter((l) => typeof l === 'string' && l.trim()).slice(0, 6);
      if (lines.length) return lines;
    } catch (e) {
      console.error(`[motion-card] 텍스트 추출 실패(${effort}):`, e instanceof Error ? e.message : e);
    }
  }
  return [];
}

export async function POST(req: NextRequest) {
  // dev 디버깅용 우회 (publish 라우트의 x-cardpress-dev와 같은 관례) — 프로덕션에선 무시
  const devBypass = process.env.NODE_ENV !== 'production' && req.headers.get('x-motion-dev') === '1';
  if (!devBypass) {
    const denied = await guardLocalAdmin();
    if (denied) return denied;
  }

  const b = (await req.json()) as Body;
  const args: string[] = [];
  const tmpFiles: string[] = [];
  try {
    if (b.mode === 'composite') {
      // 카드 이미지 슬롯에만 모션 — ① 슬롯 위치 탐지(마젠타 프로브) ② 슬롯 크기로 모션 렌더 ③ 카드 PNG 위에 합성
      const template = b.slide?.template as CardTemplateId | undefined;
      const key = template ? IMAGE_KEY[template] : undefined;
      const imageUrl = key ? b.slide?.props?.[key] : undefined;
      if (!template || !key || typeof imageUrl !== 'string' || !imageUrl.startsWith('http'))
        return NextResponse.json({ error: '이 템플릿엔 이미지 슬롯이 없어요 — 끌어넣기 소스로 전체 칸 모션을 쓰세요' }, { status: 400 });
      const accent = (b.accent && b.accent.startsWith('cat-') ? b.accent : 'cat-case') as CardAccent;
      const slideBase: CardSlide = { template, order: 1, enabled: true, props: b.slide!.props };

      // ① 전경 분리 — 이미지 자리를 흰/검으로 렌더한 두 장을 비교해
      //    슬롯 위치와, 그 위에 얹힌 텍스트·스크림(RGBA)을 복원한다.
      //    커버형(이미지 전면 배경)도 텍스트가 보존된다: 영상 위에 전경을 다시 얹으므로.
      const [white, black] = await Promise.all([
        solidDataUri(255, 255, 255).then((u) => renderEnabledSlides('motion-probe-w', accent, [{ ...slideBase, props: { ...slideBase.props, [key]: u } }])),
        solidDataUri(0, 0, 0).then((u) => renderEnabledSlides('motion-probe-b', accent, [{ ...slideBase, props: { ...slideBase.props, [key]: u } }])),
      ]);
      const { slot, fgPng } = await extractForeground(white[0].buffer, black[0].buffer);
      if (!slot) return NextResponse.json({ error: '이미지 슬롯 위치를 찾지 못했어요' }, { status: 500 });
      const fgPath = path.join(os.tmpdir(), `motion-fg-${Date.now()}.png`);
      fs.writeFileSync(fgPath, fgPng);
      tmpFiles.push(fgPath);

      // ② 슬롯에 넣을 영상 — 끌어넣은 영상 / 타이핑 재현 / 이미지 모션 셋 중 하나
      let dur = Math.min(20, Math.max(2, b.duration ?? 6));
      let slotMp4: string;
      let hasAudio = false;
      if (b.srcVideo) {
        const srcV = resolveMediaPath(b.srcVideo, VIDEO_EXTS);
        if (!srcV) return NextResponse.json({ error: '영상 소스를 찾을 수 없습니다' }, { status: 400 });
        const probe = await pExecFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', srcV]);
        dur = Math.min(30, Number(probe.stdout.toString().trim()) || dur);
        hasAudio = true;
        slotMp4 = path.join(os.tmpdir(), `motion-slotv-${Date.now()}.mp4`);
        tmpFiles.push(slotMp4);
        await pExecFile('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', srcV,
          '-vf', `scale=${slot.w}:${slot.h}:force_original_aspect_ratio=increase,crop=${slot.w}:${slot.h},fps=30`,
          '-t', String(dur), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', slotMp4,
        ], { timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
      } else if (b.effect === 'terminal-typing') {
        // 스크린샷 줌 대신 타이핑 재현 — 줄이 안 넘어오면 이미지에서 자동 추출(효과 선택만으로 동작)
        let lines = b.lines?.length ? b.lines : [];
        if (!lines.length) {
          const src = await fetchToTmp(imageUrl);
          tmpFiles.push(src);
          lines = await extractTerminalLines(src);
        }
        if (!lines.length)
          return NextResponse.json({ error: '이미지에서 터미널 텍스트를 찾지 못했어요 — 터미널 스크린샷이 맞는지 확인해 주세요' }, { status: 400 });
        const tmp = path.join(os.tmpdir(), `motion-typing-${Date.now()}.html`);
        fs.writeFileSync(tmp, terminalTypingHtml(lines, slot.w, slot.h));
        tmpFiles.push(tmp);
        slotMp4 = await runMotionCard('html', ['--src', tmp, '--size', `${slot.w}x${slot.h}`, '--duration', String(dur)]);
      } else {
        const src = await fetchToTmp(imageUrl);
        tmpFiles.push(src);
        const slotArgs = ['--src', src, '--size', `${slot.w}x${slot.h}`, '--fit', 'cover', '--duration', String(dur)];
        if (b.effect) slotArgs.push('--effect', b.effect);
        if (b.focus?.startsWith('pct:')) {
          const conv = await pctFocusToCanvas(b.focus, src, slot.w, slot.h, 'cover');
          if (conv) slotArgs.push('--focus', conv);
        } else if (b.focus && FOCUS_RE.test(b.focus.trim())) slotArgs.push('--focus', b.focus.trim());
        if (b.accent) slotArgs.push('--accent', b.accent);
        slotMp4 = await runMotionCard('image', slotArgs);
      }

      // ③ 3겹 합성 — 검정 바닥 → 슬롯 영상 → 복원한 전경(텍스트·스크림)
      const out = path.join(OUT_DIR, `composite-${Date.now()}.mp4`);
      await pExecFile('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-t', String(dur), '-i', `color=c=black:s=1080x1350:r=30`,
        '-i', slotMp4, '-loop', '1', '-i', fgPath,
        '-filter_complex', `[1:v]scale=${slot.w}:${slot.h}[m];[0:v][m]overlay=${slot.x}:${slot.y}[bg];[bg][2:v]overlay=0:0[vout]`,
        '-map', '[vout]', ...(hasAudio ? ['-map', '1:a?', '-c:a', 'aac'] : []),
        '-t', String(dur), '-r', '30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
      ], { timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
      if (!b.srcVideo) fs.rmSync(slotMp4, { force: true });
      return NextResponse.json({ file: out, url: `/api/motion-card/file?path=${encodeURIComponent(out)}` });
    }

    if (b.mode === 'image' && b.effect === 'terminal-typing') {
      // 슬롯 없는 전체 칸 버전 — 카드 규격 그대로 타이핑 재현 (줄이 없으면 소스 이미지에서 자동 추출)
      let lines = b.lines?.length ? b.lines : [];
      if (!lines.length && b.src) {
        const src = b.src.startsWith('http') ? await fetchToTmp(b.src) : resolveMediaPath(b.src, IMAGE_EXTS);
        if (src) {
          if (b.src.startsWith('http')) tmpFiles.push(src);
          lines = await extractTerminalLines(src);
        }
      }
      if (!lines.length)
        return NextResponse.json({ error: '이미지에서 터미널 텍스트를 찾지 못했어요' }, { status: 400 });
      const tmp = path.join(os.tmpdir(), `motion-typing-${Date.now()}.html`);
      fs.writeFileSync(tmp, terminalTypingHtml(lines, 1080, 1350));
      tmpFiles.push(tmp);
      const out = await runMotionCard('html', ['--src', tmp, '--duration', String(Math.min(20, Math.max(2, b.duration ?? 6)))]);
      return NextResponse.json({ file: out, url: `/api/motion-card/file?path=${encodeURIComponent(out)}` });
    }

    if (b.mode === 'image' || b.mode === 'video') {
      const exts = b.mode === 'image' ? IMAGE_EXTS : VIDEO_EXTS;
      let src = b.src?.startsWith('http') ? await fetchToTmp(b.src) : resolveMediaPath(b.src, exts);
      if (src && b.src?.startsWith('http')) tmpFiles.push(src);
      if (!src) return NextResponse.json({ error: '소스 파일을 찾을 수 없습니다' }, { status: 400 });
      args.push('--src', src);
      if (b.mode === 'image') {
        if (b.effect) args.push('--effect', b.effect);
        if (b.focus) {
          // pct(이미지 백분율)면 캔버스 좌표로 변환, 그 외엔 좌표 형식만 통과 (문장 입력 사고 방지)
          if (b.focus.startsWith('pct:')) {
            const conv = await pctFocusToCanvas(b.focus, src, 1080, 1350, b.fit === 'contain' ? 'contain' : 'cover');
            if (conv) args.push('--focus', conv);
          } else if (FOCUS_RE.test(b.focus.trim())) {
            args.push('--focus', b.focus.trim());
          } else {
            return NextResponse.json(
              { error: '깜빡임 영역은 이미지 위를 드래그해서 지정해 주세요' },
              { status: 400 }
            );
          }
        }
        if (b.fit) args.push('--fit', b.fit);
      }
      if (b.mode === 'video' && b.overlayId) {
        const overlay = path.join(PRESET_DIR, `${b.overlayId}.html`);
        if (!fs.existsSync(overlay)) return NextResponse.json({ error: '오버레이 프리셋 없음' }, { status: 400 });
        args.push('--overlay', overlay);
      }
      if (b.title) args.push('--title', b.title);
      if (b.sub) args.push('--sub', b.sub);
    } else if (b.mode === 'html') {
      if (!b.html?.trim()) return NextResponse.json({ error: 'html이 비었습니다' }, { status: 400 });
      // 프리셋 폴더 안에 임시 파일로 써야 상대경로 폰트(../../../assets/fonts)가 산다
      const tmp = path.join(PRESET_DIR, `.lab-${Date.now()}.html`);
      fs.writeFileSync(tmp, b.html);
      tmpFiles.push(tmp);
      args.push('--src', tmp);
    } else {
      return NextResponse.json({ error: 'mode는 image|video|html' }, { status: 400 });
    }
    if (b.accent) args.push('--accent', b.accent);
    if (b.duration) args.push('--duration', String(b.duration));

    const out = await runMotionCard(b.mode, args);
    return NextResponse.json({ file: out, url: `/api/motion-card/file?path=${encodeURIComponent(out)}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    for (const f of tmpFiles) fs.rmSync(f, { force: true });
  }
}
