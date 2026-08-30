import fs from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { guardLocalAdmin } from '@/lib/reels/local';
import { IMAGE_EXTS, fetchToTmp, listPresets, resolveMediaPath } from '@/lib/motion-card/local';
import { callModel } from '@/lib/ai/ai-draft';
import { extractJson } from '@/lib/ai/claude-cli';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 자연어 → 모션 파라미터 해석. "노란색 부분이 깜빡이게" 같은 문장을 받아
// (이미지면 실제로 보고) effect·focus 좌표·오버레이 선택으로 바꾼다. 로컬 전용.

type Body = { prompt: string; src?: string; kind: 'image' | 'video'; fit?: string };

export async function POST(req: NextRequest) {
  const denied = await guardLocalAdmin();
  if (denied) return denied;

  const b = (await req.json()) as Body;
  if (!b.prompt?.trim()) return NextResponse.json({ error: '원하는 효과를 적어주세요' }, { status: 400 });

  const tmpFiles: string[] = [];
  try {
    if (b.kind === 'video') {
      const overlays = listPresets().filter((p) => p.kind === 'overlay');
      const raw = await callModel(
        `너는 모션 카드 효과 해석기다. 사용자가 영상 슬라이드에 원하는 효과를 한국어로 적으면,
사용 가능한 오버레이 중 가장 맞는 것을 고른다. 설명 없이 JSON 객체만 반환한다.`,
        `[사용 가능한 오버레이]
${overlays.map((o) => `- ${o.id}: ${o.title}`).join('\n')}
- (없음): 오버레이 없이 카드 규격 크롭만

[요청] ${b.prompt}

반환 형식: {"overlayId": "id 또는 빈 문자열", "note": "무엇을 어떻게 이해했고 한계가 있으면 한 줄"}`,
        { allowedTools: [], model: 'sonnet', effort: 'low', timeoutMs: 60_000, humanTone: false }
      );
      const parsed = JSON.parse(extractJson(raw)) as { overlayId?: string; note?: string };
      return NextResponse.json({ kind: 'video', overlayId: parsed.overlayId ?? '', note: parsed.note ?? '' });
    }

    // 이미지: 모델이 실제 이미지를 Read로 보고 영역·효과를 정한다
    let src = b.src?.startsWith('http') ? await fetchToTmp(b.src) : resolveMediaPath(b.src, IMAGE_EXTS);
    if (src && b.src?.startsWith('http')) tmpFiles.push(src);
    if (!src) return NextResponse.json({ error: '이미지 소스를 찾을 수 없습니다' }, { status: 400 });

    const meta = await sharp(src).metadata();
    const raw = await callModel(
      `너는 모션 카드 효과 해석기다. 사용자가 이미지 슬라이드에 원하는 모션을 한국어로 적으면,
반드시 Read 도구로 이미지를 먼저 본 다음, 아래 효과 중 하나와 (필요하면) 대상 영역을 정한다.
설명 없이 JSON 객체만 반환한다.

[효과 목록]
- terminal-typing: 터미널 타이핑 재현 — 요청에 "타이핑·입력·쳐지는·텍스트 입력" 계열 단어가 있거나 이미지가 터미널/명령창이면 다른 효과보다 이것을 우선한다. 이미지에 보이는 텍스트 줄들을 typedLines로 순서대로 옮겨 적는다(첫 줄 = 쳐지는 명령)
- still: 시네마틱 포커스 — 특정 영역으로 줌인 + 그 영역이 제 색으로 맥박치듯 빛남 (깜빡임·강조 요청이면 이것, region 필수)
- scrolldown / scrollup: 세로로 긴 스크린샷을 훑는 스크롤 (이미지가 세로로 길 때만 의미)
- kenburns: 천천히 줌인 / zoomout: 천천히 줌아웃
- panleft / panright: 좌우 팬`,
      `[이미지 파일] ${src} (${meta.width}×${meta.height}px) — Read로 먼저 봐라.

[요청] ${b.prompt}

반환 형식:
{"effect": "terminal-typing|still|scrolldown|scrollup|kenburns|zoomout|panleft|panright",
 "regionPct": [x, y, w, h] 또는 null,  // 대상 영역, 이미지 기준 백분율(0~100). still이면 필수
 "typedLines": ["줄1", "줄2", ...] 또는 null,  // terminal-typing일 때 필수 — 이미지의 실제 텍스트, 최대 6줄
 "durationSec": 4~8 사이 정수,
 "note": "무엇을 어떻게 이해했는지 한 줄 (영역을 찾았으면 무엇인지)"}`,
      { allowedTools: ['Read'], model: 'sonnet', effort: 'medium', timeoutMs: 120_000, humanTone: false }
    );
    const parsed = JSON.parse(extractJson(raw)) as {
      effect?: string;
      regionPct?: [number, number, number, number] | null;
      typedLines?: string[] | null;
      durationSec?: number;
      note?: string;
    };

    // 영역은 이미지 백분율("pct:") 그대로 반환 — 캔버스 변환은 렌더 라우트가 fit·슬롯 크기에 맞게 한다
    let focus = '';
    if (parsed.regionPct) {
      const c = parsed.regionPct.map((v) => Math.max(0, Math.min(100, Math.round(v * 10) / 10)));
      focus = `pct:${c[0]},${c[1]},${c[2]},${c[3]}`;
    }

    return NextResponse.json({
      kind: 'image',
      effect: parsed.effect ?? 'kenburns',
      focus,
      lines: parsed.typedLines?.slice(0, 8) ?? [],
      duration: Math.min(8, Math.max(4, Math.round(parsed.durationSec ?? 6))),
      note: parsed.note ?? '',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    for (const f of tmpFiles) fs.rmSync(f, { force: true });
  }
}
