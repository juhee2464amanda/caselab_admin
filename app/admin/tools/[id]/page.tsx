import { notFound } from 'next/navigation';
import { ToolForm } from '@/components/admin/ToolForm';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export default async function EditToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('tools').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  return <ToolForm initial={data as any} />;
}
