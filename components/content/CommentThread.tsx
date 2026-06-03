'use client';

import { useEffect, useState, useTransition } from 'react';
import { MessageCircle, Flag, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';

interface Comment {
  id: string;
  user_id: string;
  content_id: string;
  parent_id: string | null;
  body: string;
  status: 'visible' | 'hidden' | 'reported';
  created_at: string;
  profiles?: { name: string | null; avatar_url: string | null } | null;
}

interface Props {
  contentId: string;
}

export function CommentThread({ contentId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      const { data } = await supabase
        .from('comments')
        .select('id, user_id, content_id, parent_id, body, status, created_at, profiles(name, avatar_url)')
        .eq('content_id', contentId)
        .eq('status', 'visible')
        .order('created_at', { ascending: true })
        .limit(100);
      setComments((data ?? []) as unknown as Comment[]);
    })();
  }, [contentId, supabase]);

  function submit() {
    if (!body.trim() || !user) return;
    startTransition(async () => {
      const { data, error } = await supabase
        .from('comments')
        .insert({ content_id: contentId, body: body.trim(), user_id: user.id })
        .select('id, user_id, content_id, parent_id, body, status, created_at, profiles(name, avatar_url)')
        .single();
      if (!error && data) {
        setComments((c) => [...c, data as unknown as Comment]);
        setBody('');
      }
    });
  }

  async function report(id: string) {
    await supabase.from('comments').update({ status: 'reported' }).eq('id', id);
    setComments((c) => c.filter((x) => x.id !== id));
  }

  return (
    <section className="my-10 border-t border-border pt-8">
      <header className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-5 w-5 text-ink/60" />
        <h3 className="font-serif text-xl font-semibold">댓글 {comments.length}</h3>
      </header>

      {user ? (
        <div className="mb-6">
          <Textarea
            placeholder="이 글에 대한 생각을 남겨주세요."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <Button onClick={submit} disabled={pending || !body.trim()} size="sm">
              <Send className="h-3.5 w-3.5" /> 등록
            </Button>
          </div>
        </div>
      ) : (
        <p className="mb-6 text-sm text-ink/60">로그인하면 댓글을 남길 수 있어요.</p>
      )}

      <ul className="space-y-4">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{c.profiles?.name || '익명'}</span>
                <span className="text-xs text-ink/40">{formatDate(c.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-ink/85 whitespace-pre-wrap">{c.body}</p>
              <button
                type="button"
                onClick={() => report(c.id)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-ink/40 hover:text-red-600"
              >
                <Flag className="h-3 w-3" /> 신고
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
