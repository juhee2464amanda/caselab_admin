'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DownloadCloud, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 수집 요청 버튼 — 클릭 시 클라우드 큐에 pending 1건을 남긴다(POST /api/collect-requests).
// 로컬 HERMES 폴러가 claim→수집→ingest→complete로 소진. 랩톱 켜지는 아무 때나 처리되므로
// 9시 고정 크론 의존이 사라진다. 버튼은 배포판에서도 노출(폰에서 눌러도 요청만 남으면 됨).
// 상태는 GET /api/collect-requests(최신 1건)를 폴링해 반영.

type ReqStatus = 'pending' | 'claimed' | 'done' | 'error';
type CollectRequest = {
  id: string;
  status: ReqStatus;
  created_at: string;
  completed_at: string | null;
  result_count: number | null;
  error: string | null;
};

const isActive = (s: ReqStatus | undefined) => s === 'pending' || s === 'claimed';

export function CollectRequestButton() {
  const router = useRouter();
  const [req, setReq] = useState<CollectRequest | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevStatus = useRef<ReqStatus | null>(null);

  // 최신 요청 상태 로드. 진행 중이면 폴링이 이어받는다.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/collect-requests', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as { request: CollectRequest | null };
      setReq(json.request);
      // claimed → done 전환을 감지하면 새 씨앗이 적재됐으니 목록 새로고침.
      if (prevStatus.current === 'claimed' && json.request?.status === 'done') {
        router.refresh();
      }
      prevStatus.current = json.request?.status ?? null;
    } catch {
      // 폴링 실패는 조용히 무시(다음 틱에서 재시도)
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // 진행 중(pending/claimed)일 때만 10초 폴링.
  useEffect(() => {
    if (!isActive(req?.status)) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [req?.status, load]);

  const request = async () => {
    setPosting(true);
    setError(null);
    try {
      const res = await fetch('/api/collect-requests', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '요청 실패');
      setReq(json.request);
      prevStatus.current = json.request?.status ?? null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  const status = req?.status;
  const busy = posting || isActive(status);

  let label = '지금 수집 요청';
  let Icon = DownloadCloud;
  if (posting) label = '요청 중…';
  else if (status === 'pending') label = '로컬 작업장 대기 중…';
  else if (status === 'claimed') label = '수집 중…';
  else if (status === 'done') { label = req?.result_count != null ? `수집 완료 · ${req.result_count}건` : '수집 완료'; Icon = CheckCircle2; }
  else if (status === 'error') { label = '수집 실패 · 다시 요청'; Icon = AlertCircle; }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={request} title="로컬 작업장이 켜지면 수집해 씨앗을 채웁니다">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        {label}
      </Button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
