import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { guardLocalAdmin } from '@/lib/reels/local';
import { OUT_DIR } from '@/lib/motion-card/local';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 렌더된 모션 MP4를 cardpress 공개 버킷에 올려 공개 URL을 만든다.
// IG 캐러셀 영상 칸(video_url)이 공개 URL을 요구하므로, 슬라이드 적용 = 이 업로드가 선행돼야 한다.
export async function POST(req: NextRequest) {
  const denied = await guardLocalAdmin();
  if (denied) return denied;

  const { path: raw } = (await req.json()) as { path?: string };
  const p = path.resolve(raw ?? '');
  if (!p.startsWith(OUT_DIR + path.sep) || !p.endsWith('.mp4') || !fs.existsSync(p)) {
    return NextResponse.json({ error: '렌더 결과 파일이 아닙니다' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const dest = `motion/${Date.now()}-${path.basename(p)}`;
  const { error } = await admin.storage
    .from('cardpress')
    .upload(dest, fs.readFileSync(p), { contentType: 'video/mp4', upsert: true });
  if (error) return NextResponse.json({ error: `버킷 업로드 실패: ${error.message}` }, { status: 500 });
  const { data } = admin.storage.from('cardpress').getPublicUrl(dest);
  return NextResponse.json({ url: data.publicUrl });
}
