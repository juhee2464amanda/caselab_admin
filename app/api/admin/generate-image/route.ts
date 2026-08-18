import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// AI 이미지 생성 썸네일 (선택 기능 — 기본 꺼짐).
// OPENAI_API_KEY가 있을 때만 동작한다. **ChatGPT Plus/Pro 구독으로는 이 API가 열리지 않는다** —
// 이미지 생성 API는 구독과 별개로 장당 과금되는 종량 요금이라, 키를 넣지 않는 한 아무 비용도 발생하지 않는다.
// 키 없이 쓰려면: ChatGPT 화면에서 직접 만든 이미지를 썸네일 칸에 끌어놓거나 붙여넣으면 된다(같은 결과, 추가 비용 0원).

const BUCKET = 'content-images';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        code: 'no-key',
        error:
          'AI 이미지 생성은 OPENAI_API_KEY가 있어야 동작해요. ChatGPT 구독으로는 API가 열리지 않고(장당 과금 별도), 키를 넣기 전엔 요금이 나가지 않습니다. 지금은 ChatGPT에서 만든 이미지를 썸네일 칸에 끌어놓아 주세요.',
      },
      { status: 400 }
    );
  }

  const { prompt, quality } = (await req.json()) as { prompt?: string; quality?: 'low' | 'medium' };
  if (!prompt?.trim()) return NextResponse.json({ error: '이미지 설명이 필요해요.' }, { status: 400 });

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt.trim().slice(0, 1500),
        // 목록 카드용 가로 이미지. 저품질을 기본으로 둬서 장당 비용을 최소화한다.
        size: '1536x1024',
        quality: quality === 'medium' ? 'medium' : 'low',
        n: 1,
      }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch (e) {
    return NextResponse.json({ error: `이미지 생성 호출 실패: ${(e as Error).message}` }, { status: 502 });
  }

  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } };
  if (!res.ok) {
    return NextResponse.json({ error: `OpenAI ${res.status}: ${json.error?.message ?? ''}` }, { status: 502 });
  }

  const b64 = json.data?.[0]?.b64_json;
  const remoteUrl = json.data?.[0]?.url;
  let bytes: Buffer;
  if (b64) bytes = Buffer.from(b64, 'base64');
  else if (remoteUrl) bytes = Buffer.from(await (await fetch(remoteUrl)).arrayBuffer());
  else return NextResponse.json({ error: '이미지가 비어 있어요.' }, { status: 502 });

  // 생성 결과는 만료되는 임시 URL일 수 있어 바로 우리 공개 버킷으로 복사한다(업로드 경로는 upload-image와 동일 규약).
  const admin = createSupabaseAdminClient();
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const path = `content/${Date.now()}-${randomUUID().slice(0, 8)}.png`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false });
  if (upErr) return NextResponse.json({ error: `업로드 실패: ${upErr.message}` }, { status: 500 });
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: pub.publicUrl });
}
