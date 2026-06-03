import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id, track, kind, slug } = await req.json();
  if (id) revalidateTag(`content-${id}`);
  if (track) {
    revalidateTag(`list-${track}`);
    revalidatePath(track === 'case' ? '/cases' : '/trends');
  }
  if (kind === 'tool') {
    revalidateTag('tools');
    revalidatePath('/tools');
    if (slug) revalidatePath(`/tools/${slug}`);
  }
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
