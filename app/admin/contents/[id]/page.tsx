import { notFound } from 'next/navigation';
import { TrackForm } from '@/components/admin/TrackForm';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('contents').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  return <TrackForm initial={data as any} />;
}
