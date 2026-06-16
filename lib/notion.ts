// Notion REST 헬퍼 (SDK 의존 없음 — fetch만 사용).
// 용도: HERMES 브리퍼 메시지를 Seed Backlog에 raw draft로 적재.
// 토큰: Vercel env NOTION_TOKEN (notion.so/my-integrations 내부 통합 토큰, ntn_...).
// 대상 DB는 그 통합에 Connections로 연결돼 있어야 함.

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function token(): string {
  const t = (process.env.NOTION_TOKEN ?? '').trim();
  if (!t) throw new Error('NOTION_TOKEN missing');
  return t;
}

async function notionFetch(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Notion ${path} ${res.status}: ${(json?.message as string) ?? res.statusText}`);
  }
  return json;
}

// 동일 메시지(needle = "p<ts>")가 이미 적재됐는지 — 원천링크 contains 로 중복 방지.
export async function seedExists(databaseId: string, needle: string): Promise<boolean> {
  const json = await notionFetch(`/databases/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: '원천링크', rich_text: { contains: needle } },
      page_size: 1,
    }),
  });
  const results = json.results as unknown[] | undefined;
  return Array.isArray(results) && results.length > 0;
}

export interface BriefSeedInput {
  databaseId: string;
  title: string; // 주제 (요약 첫 줄)
  rawText: string; // 브리핑 원문 (페이지 본문)
  sourceUrl: string; // 원천링크 (Slack permalink, "p<ts>" 포함)
  origin: 'hermes-slack' | 'hermes-telegram';
  lane?: string; // 채널 lane (scout/analyst/briefing/weekly) — 본문 배너 표기용
}

// Seed Backlog에 raw draft seed 1건 생성. 핵심인사이트·실험앵글 등은 비워 둠
// (운영자가 직접 실험 후 채우고 ready로 승격 — 직접실험 게이트).
export async function createBriefSeed(input: BriefSeedInput): Promise<{ id: string; url: string }> {
  const title = input.title.trim().slice(0, 100) || '(제목 없는 브리핑)';
  const json = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: input.databaseId },
      icon: { type: 'emoji', emoji: '📡' },
      properties: {
        주제: { title: [{ text: { content: title } }] },
        출처: { select: { name: input.origin } },
        원천링크: { rich_text: [{ text: { content: input.sourceUrl.slice(0, 2000) } }] },
        status: { status: { name: '시작 전' } },
      },
      children: briefBlocks(input.rawText, input.lane),
    }),
  });
  return { id: json.id as string, url: json.url as string };
}

function briefBlocks(rawText: string, lane?: string): unknown[] {
  const laneTag = lane ? `[lane: ${lane}] ` : '';
  const banner = {
    object: 'block',
    type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: '📡' },
      rich_text: [
        {
          type: 'text',
          text: {
            content:
              `${laneTag}HERMES 브리퍼 자동 적재 (raw). triage 때 핵심인사이트·실험앵글을 직접 채우고 ready(준비완료)로 승격하세요.`,
          },
        },
      ],
    },
  };
  const paras = chunk(rawText.trim() || '(빈 메시지)', 1900).map((c) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: c } }] },
  }));
  return [banner, ...paras].slice(0, 100);
}

// Notion rich_text 단일 텍스트는 2000자 제한 → 분할.
function chunk(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}
