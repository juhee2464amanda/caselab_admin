import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { guardLocalAdmin, VIDEO_EXTS } from '@/lib/reels/local';
import { IMAGE_EXTS, OUT_DIR } from '@/lib/motion-card/local';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 끌어넣기 업로드 — 브라우저에서 드롭한 영상/이미지를 로컬 uploads에 저장하고 경로를 돌려준다.
// 렌더 src로 그대로 쓰인다(resolveMediaPath가 repo 안 경로를 허용).
export async function POST(req: NextRequest) {
  const denied = await guardLocalAdmin();
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });

  const ext = path.extname(file.name).toLowerCase();
  if (!VIDEO_EXTS.has(ext) && !IMAGE_EXTS.has(ext)) {
    return NextResponse.json({ error: `지원하지 않는 형식(${ext || '확장자 없음'}) — 영상(mp4·mov 등)/이미지(png·jpg 등)만` }, { status: 400 });
  }

  const dir = path.join(OUT_DIR, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(file.name).replace(/[^\w.\-가-힣 ]/g, '_');
  const dest = path.join(dir, `${Date.now()}-${safe}`);
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ path: dest, kind: VIDEO_EXTS.has(ext) ? 'video' : 'image' });
}
