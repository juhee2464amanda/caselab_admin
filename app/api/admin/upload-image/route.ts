import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 콘텐츠 본문 이미지 블록용 업로드. 공개 버킷에 저장하고 공개 URL을 돌려준다.
// 본가 next.config가 **.supabase.co 를 이미 허용하므로 그대로 렌더된다.
const BUCKET = 'content-images';
const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function POST(req: NextRequest) {
  try {
    // 1. admin 검증
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    // 2. 입력 — 파일(Finder 드롭·클릭 업로드) 또는 url(웹/다른 탭에서 끈 이미지, 서버가 fetch).
    const form = await req.formData();
    const file = form.get('file');
    const url = form.get('url');

    let contentType: string;
    let bytes: Buffer;
    if (file instanceof File) {
      contentType = file.type;
      bytes = Buffer.from(await file.arrayBuffer());
    } else if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      let remote: Response;
      try {
        remote = await fetch(url);
      } catch {
        return NextResponse.json({ error: '이미지 주소를 불러오지 못했어요.' }, { status: 400 });
      }
      if (!remote.ok) return NextResponse.json({ error: `이미지를 불러오지 못했어요 (${remote.status}).` }, { status: 400 });
      contentType = (remote.headers.get('content-type') ?? '').split(';')[0].trim();
      bytes = Buffer.from(await remote.arrayBuffer());
    } else {
      return NextResponse.json({ error: '파일이나 이미지 주소가 없어요.' }, { status: 400 });
    }

    const ext = ALLOWED[contentType];
    if (!ext) return NextResponse.json({ error: 'JPG·PNG·WebP·GIF만 올릴 수 있어요.' }, { status: 400 });
    if (bytes.length > MAX_BYTES) return NextResponse.json({ error: '이미지가 너무 커요. 8MB 이하로 올려주세요.' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    // 공개 버킷 보장(없으면 생성). 이미 있으면 에러 무시.
    await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

    // 3. 업로드 (타임스탬프+uuid 경로라 충돌 없음)
    const path = `content/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr) return NextResponse.json({ error: `업로드 실패: ${upErr.message}` }, { status: 500 });

    // 4. 공개 URL 반환
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, url: pub.publicUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
