import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSeedSource, sourceFromLane } from '@/lib/seed-sources';
import { verifyIngestToken } from '@/lib/ingest-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// HERMES 직접 적재 — Slack lane을 거치지 않고 HERMES 크론이 admin으로 바로 POST.
// Slack 웹훅(/api/slack/hermes-brief)의 파싱 휴리스틱(크론 래퍼·이모지·다이제스트 분할)이
// 필요 없음: HERMES가 항목 배열을 이미 구조화해서 보낸다. 씨앗 1건 = 소재 1건 계약 동일.
// 인증: 공유 토큰(HERMES_INGEST_TOKEN). Slack 서명 검증 불필요.
// 멱등성: 항목별 dedup_key → slack_ts 컬럼(text unique)에 "ingest:" 접두로 upsert.
//   dedup_key 미제공 시 raw_text 해시로 대체(같은 본문 재전송 방지).
// 미들웨어 PUBLIC_PATHS에 /api 포함 → 세션 검사 없이 열리고, 토큰으로만 보호.

const MAX_ITEMS = 50;

interface IngestItem {
  title?: string;
  raw_text?: string;
  source_url?: string;
  dedup_key?: string;
}

function dedupKey(item: IngestItem, rawText: string): string {
  const explicit = item.dedup_key?.trim();
  if (explicit) return `ingest:${explicit.slice(0, 200)}`;
  return `ingest:${crypto.createHash('sha256').update(rawText).digest('hex').slice(0, 32)}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyIngestToken(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  let body: { lane?: string; source_type?: string; items?: IngestItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: 'items 배열 필수(1건 이상)' }, { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `items 최대 ${MAX_ITEMS}건` }, { status: 400 });
  }

  // 출처 결정: source_type 직접 지정 > lane 매핑(LANE_SOURCE) > slack-brief 폴백.
  const lane = body.lane?.trim() || null;
  const sourceType = isSeedSource(body.source_type) ? body.source_type : sourceFromLane(lane);

  const rows = [];
  for (const item of items) {
    const rawText = item.raw_text?.trim() ?? '';
    if (rawText.length < 15) {
      return NextResponse.json(
        { error: `raw_text 필수(15자 이상): ${JSON.stringify(item.title ?? '').slice(0, 50)}` },
        { status: 400 },
      );
    }
    const firstLine = rawText.split('\n').find((l) => l.trim()) ?? rawText;
    const title = (item.title?.trim() || firstLine).slice(0, 280);
    rows.push({
      // 출처 태그는 제목에 붙이지 않음 — source_type·lane 컬럼으로 이미 분류됨.
      title,
      raw_text: rawText,
      source_url: item.source_url?.trim() || null,
      origin: 'hermes-direct',
      lane,
      source_type: sourceType,
      slack_ts: dedupKey(item, rawText),
      status: 'raw',
    });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('content_seeds')
      .upsert(rows, { onConflict: 'slack_ts', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(error.message);
    return NextResponse.json({
      ok: true,
      received: items.length,
      inserted: data?.length ?? 0,
      source_type: sourceType,
    });
  } catch (e) {
    console.error('[seeds/ingest] failed:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
