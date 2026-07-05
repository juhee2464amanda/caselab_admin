import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sourceFromLane } from '@/lib/seed-sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Slack Events API 웹훅 — HERMES 브리퍼 채널의 새 메시지를 content_seeds에 raw seed로 적재.
// 적재처: Supabase content_seeds (2026-06-26 Notion에서 이전 — 운영자가 admin 한 곳에서 triage).
// 인증: Supabase 세션이 아니라 Slack 서명(v0)으로 검증 (Slack이 호출하므로).
// 적재는 service-role 클라이언트(RLS 우회) — webhook은 유저 세션이 없음.
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

// HERMES 에이전트 상태/에러 메시지 — 브리핑이 아니므로 적재 스킵.
// (Gateway shutting down, task interrupted, rate limit 등 운영 노이즈)
const AGENT_NOISE = [
  /gateway shutting down/i,
  /task will be interrupted/i,
  /rate limit/i,
  /session (expired|timed out)/i,
  /^:warning:/i,
];

function isAgentNoise(text: string): boolean {
  return AGENT_NOISE.some((re) => re.test(text.trim()));
}

// HERMES 크론 래퍼 제거 — "Cronjob Response: <job>-daily (job_id: xxx) ----" 헤더를 벗겨
// 실제 브리핑 본문만 남긴다(제목·채점 노이즈 방지). 껍데기만이면 빈 문자열 반환 → 적재 스킵.
function stripCronEnvelope(text: string): string {
  return text
    // 1) "Cronjob Response: ... (job_id: hex)" 헤더 제거
    .replace(/Cronjob Response:[^\n]*?\(job_id:\s*[a-f0-9]+\)/i, '')
    // 2) 구분선(---) → 공백
    .replace(/[-–—]{3,}/g, ' ')
    // 3) 슬랙 이모지 숏코드(:date: :mag: :+1: 등) 제거 (시간 "9:00"은 letter/+로 시작 아님 → 안전)
    .replace(/:[a-z+][a-z0-9_+-]*:/gi, ' ')
    // 4) 남은 앞쪽 밑줄·불릿·공백·개행 정리
    .replace(/^[\s_*>`|~-]+/, '')
    .trim();
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

  // 에이전트 상태/에러 메시지는 브리핑이 아님 → 스킵.
  if (isAgentNoise(text)) {
    return NextResponse.json({ ok: true, skipped: 'agent-noise' });
  }

  // 크론 래퍼 제거 후 실제 브리핑만 적재. 껍데기(상태 에코)면 스킵.
  const cleaned = stripCronEnvelope(text);
  if (cleaned.length < 15) {
    return NextResponse.json({ ok: true, skipped: 'cron-shell' });
  }

  try {
    const ts: string = ev.ts ?? '';
    const slackTs = ts.replace('.', '');
    const needle = `p${slackTs}`;

    // 4) content_seeds 적재 (raw) — lane 태그를 제목에 붙여 triage 때 출처 lane 구분.
    //    중복 방지: slack_ts unique → onConflict 멱등 처리(Slack 재전송 대비).
    const firstLine = cleaned.split('\n').find((l) => l.trim()) ?? cleaned;
    const permalink = `https://slack.com/archives/${ev.channel}/${needle}`;
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('content_seeds')
      .upsert(
        {
          title: `[${laneLabel}] ${firstLine}`.slice(0, 300),
          raw_text: cleaned,
          source_url: permalink,
          origin: 'hermes-slack',
          lane: laneLabel,
          source_type: sourceFromLane(lane),
          slack_ts: slackTs || null,
          status: 'raw',
        },
        { onConflict: 'slack_ts', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, seedId: data?.id ?? null });
  } catch (e) {
    // 500 → Slack이 재전송. slack_ts unique upsert로 중복 적재는 방지됨.
    console.error('[hermes-brief] failed:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
