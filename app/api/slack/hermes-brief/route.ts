import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createBriefSeed, seedExists } from '@/lib/notion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Slack Events API 웹훅 — HERMES 브리퍼 채널의 새 메시지를 Seed Backlog에 raw draft로 적재.
// 인증: Supabase 세션이 아니라 Slack 서명(v0)으로 검증 (Slack이 호출하므로).
// 미들웨어 PUBLIC_PATHS에 /api 가 포함돼 이 경로는 세션 검사 없이 열림.

function verifySlack(req: NextRequest, rawBody: string): boolean {
  const secret = (process.env.SLACK_SIGNING_SECRET ?? '').trim();
  if (!secret) throw new Error('SLACK_SIGNING_SECRET missing');
  const ts = req.headers.get('x-slack-request-timestamp') ?? '';
  const sig = req.headers.get('x-slack-signature') ?? '';
  if (!ts || !sig) return false;
  // 재전송 공격 방지: 5분 이상 지난 요청 거부
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false;
  const base = `v0:${ts}:${rawBody}`;
  const hmac = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(sig));
  } catch {
    return false;
  }
}

// SLACK_HERMES_CHANNELS = "C0AAA:scout,C0BBB:analyst,C0CCC:briefing" (채널ID:lane 콤마목록).
// 하위호환: SLACK_HERMES_CHANNEL_ID(단일)는 lane "slack"로 취급.
function channelLanes(): Record<string, string> {
  const map: Record<string, string> = {};
  const raw = (process.env.SLACK_HERMES_CHANNELS ?? '').trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const [id, lane] = part.split(':').map((s) => s.trim());
      if (id) map[id] = lane || 'slack';
    }
  }
  const single = (process.env.SLACK_HERMES_CHANNEL_ID ?? '').trim();
  if (single && !map[single]) map[single] = 'slack';
  return map;
}

// 봇 메시지는 text 대신 attachments/blocks에 본문이 들어오는 경우가 있어 보강 추출.
function extractText(ev: Record<string, any>): string {
  if (typeof ev.text === 'string' && ev.text.trim()) return ev.text;
  const fromAttachments = Array.isArray(ev.attachments)
    ? ev.attachments.map((a: any) => a?.text || a?.fallback || '').filter(Boolean).join('\n')
    : '';
  if (fromAttachments.trim()) return fromAttachments;
  const fromBlocks = Array.isArray(ev.blocks)
    ? ev.blocks
        .flatMap((b: any) => (b?.text?.text ? [b.text.text] : []))
        .join('\n')
    : '';
  return fromBlocks;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1) 서명 검증
  let valid = false;
  try {
    valid = verifySlack(req, rawBody);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!valid) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });

  const payload = JSON.parse(rawBody) as Record<string, any>;

  // 2) Slack Event Subscriptions URL 검증 challenge
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type !== 'event_callback') {
    return NextResponse.json({ ok: true });
  }

  const ev = (payload.event ?? {}) as Record<string, any>;
  const dbId = (process.env.NOTION_SEED_DB_ID ?? '').trim();
  const lanes = channelLanes();

  // 3) 필터:
  //  - 대상 채널(여러 lane 중 하나)의 message 이벤트만
  //  - 봇이 올린 브리핑만 적재 (사람 수동 대화 = 노이즈 → 제외)
  //  - 편집/삭제/입장 등 subtype 제외
  const isMsg = ev.type === 'message';
  const lane = lanes[ev.channel];
  const okChannel = Object.keys(lanes).length === 0 || !!lane;
  const isBot = !!ev.bot_id || ev.subtype === 'bot_message';
  const isMutation = ev.subtype && ev.subtype !== 'bot_message';
  const text = extractText(ev);
  if (!isMsg || !okChannel || !isBot || isMutation || !text.trim()) {
    return NextResponse.json({ ok: true, skipped: 'filtered' });
  }
  const laneLabel = lane ?? 'slack';

  try {
    if (!dbId) throw new Error('NOTION_SEED_DB_ID missing');

    const ts: string = ev.ts ?? '';
    const pts = ts.replace('.', '');
    const needle = `p${pts}`;

    // 4) 중복 방지 (Slack 재전송/중복 이벤트 멱등 처리)
    if (pts && (await seedExists(dbId, needle))) {
      return NextResponse.json({ ok: true, skipped: 'duplicate' });
    }

    // 5) Notion 적재 (raw draft) — lane 태그를 제목에 붙여 triage 때 출처 lane 구분
    const firstLine = text.split('\n').find((l) => l.trim()) ?? text;
    const permalink = `https://slack.com/archives/${ev.channel}/${needle}`;
    const seed = await createBriefSeed({
      databaseId: dbId,
      title: `[${laneLabel}] ${firstLine}`,
      rawText: text,
      sourceUrl: permalink,
      origin: 'hermes-slack',
      lane: laneLabel,
    });
    return NextResponse.json({ ok: true, seed: seed.url });
  } catch (e) {
    // 500 → Slack이 재전송. 위 seedExists 멱등 처리로 중복 적재는 방지됨.
    console.error('[hermes-brief] failed:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
