import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { guardLocalAdmin } from '@/lib/reels/local';
import { OUT_DIR } from '@/lib/motion-card/local';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 렌더 결과 MP4 스트리밍 (Range 지원) — OUT_DIR 안의 파일만 (reels/file과 같은 원칙)
export async function GET(req: NextRequest) {
  const denied = await guardLocalAdmin();
  if (denied) return denied;

  const raw = req.nextUrl.searchParams.get('path') ?? '';
  const p = path.resolve(raw);
  if (!p.startsWith(OUT_DIR + path.sep) || !p.endsWith('.mp4') || !fs.existsSync(p)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const size = fs.statSync(p).size;
  const range = req.headers.get('range');
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? parseInt(m[1], 10) : 0;
    const end = m?.[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size || end < start) {
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const stream = fs.createReadStream(p, { start, end });
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
      },
    });
  }
  const stream = fs.createReadStream(p);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
  });
}
