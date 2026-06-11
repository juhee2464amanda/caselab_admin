import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'ebooks';
const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50MB

// 전자책 PDF 업로드 (핸드오프: handoff_ebook_pdf_upload.md)
// 본사이트 계약: ebooks 버킷에 PDF 저장 → 그 오브젝트 키를 products.pdf_path 에 기록.
// send-ebook Edge Function이 createSignedUrl(pdf_path)로 이 값을 사용하므로
// 버킷 안 실제 경로와 정확히 일치해야 함.
export async function POST(req: NextRequest) {
  try {
    // 1. 호출자 admin 검증 (products RLS = is_admin() 와 동일 기준)
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    // 2. 입력 파싱
    const form = await req.formData();
    const file = form.get('file');
    const productId = String(form.get('productId') ?? '').trim();
    const slug = String(form.get('slug') ?? '').trim();

    if (!(file instanceof File)) return NextResponse.json({ error: '파일이 없어요.' }, { status: 400 });
    if (!productId) return NextResponse.json({ error: 'productId가 필요해요.' }, { status: 400 });
    if (file.type !== 'application/pdf') return NextResponse.json({ error: 'PDF 파일만 올릴 수 있어요.' }, { status: 400 });
    if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: '파일이 너무 커요. 50MB 이하로 올려주세요.' }, { status: 400 });

    // 3. 업로드 경로 — Storage 키는 ASCII 안전 문자로 (한글 slug 대비)
    const safeSlug = slug.replace(/[^a-zA-Z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'ebook';
    const path = `pdfs/${safeSlug}-${Date.now()}.pdf`;

    const admin = createSupabaseAdminClient();

    // 교체 정책: 이전에 연결된 PDF가 있으면 새 업로드 성공 후 삭제
    const { data: current } = await admin.from('products').select('pdf_path').eq('id', productId).maybeSingle();
    const oldPath = (current?.pdf_path as string | null) ?? null;

    // 4. 업로드 (타임스탬프 경로라 충돌 없음 → upsert:false)
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (upErr) return NextResponse.json({ error: `업로드 실패: ${upErr.message}` }, { status: 500 });

    // 5. products.pdf_path 갱신
    const { error: updErr } = await admin.from('products').update({ pdf_path: path }).eq('id', productId);
    if (updErr) {
      // 롤백: DB 갱신 실패 시 방금 올린 파일 제거
      await admin.storage.from(BUCKET).remove([path]).catch(() => {});
      return NextResponse.json({ error: `경로 저장 실패: ${updErr.message}` }, { status: 500 });
    }

    // 6. 이전 파일 정리 (실패해도 무시 — 핵심 경로는 이미 갱신됨)
    if (oldPath && oldPath !== path) {
      await admin.storage.from(BUCKET).remove([oldPath]).catch(() => {});
    }

    return NextResponse.json({ ok: true, pdf_path: path });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
