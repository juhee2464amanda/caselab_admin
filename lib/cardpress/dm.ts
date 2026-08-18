// ⚠️ 2026-08-18 현재 **동작하지 않는다.** 호출부(발행 패널 버튼)는 떼어냈고, 폰 전달은
//    [폰으로 보내기] 링크(app/m/[cardId], lib/cardpress/handoff.ts)가 대신한다.
//    이유: 전송에 필요한 IGSID의 유일한 출처가 echo 웹훅인데 Meta가 웹훅을 한 건도 배달하지 않는다
//    (앱이 dev_mode · instagram_business_manage_messages access_level=none). 실측 근거는 런북 10장 E-부록.
//    앱을 Live로 올리면 이 파일은 손대지 않고 그대로 되살아난다 — 그래서 지우지 않고 둔다.
//
// 카드뉴스 슬라이드 + 캡션을 "내 인스타 DM"으로 보낸다 — 모바일에서 직접 올려야 할 때의 이동 경로.
// zip 다운로드는 맥에서만 쓸모가 있어서 폰으로 옮기는 단계가 통째로 비어 있었다.
//
// 쓰는 기능: Meta의 Self Messaging (developers.facebook.com/docs/instagram-platform/self-messaging).
//   일반 DM은 "상대가 먼저 말을 건 뒤 24시간" 안에서만 보낼 수 있지만,
//   자기 자신에게 보내는 대화에는 그 창이 적용되지 않는다 → 아무 때나 눌러도 나간다.
//   권한은 발행에 이미 쓰는 instagram_business_basic + instagram_business_manage_messages 그대로라
//   Meta에 추가로 신청할 것이 없다.
//
// 전제 조건 하나: 인스타 앱에서 내 계정에게 DM을 최소 한 번 보내둬야 한다(새 메시지 → 내 아이디 검색).
//   그래야 '나와의 대화'가 생기고 거기서 Instagram-scoped ID(IGSID)를 찾을 수 있다.
//   한 번 찾은 값은 .env.local 의 INSTAGRAM_SELF_IGSID 에 박아두면 매번 조회하지 않는다.

// 발행(publish.ts)은 v21.0을 쓰지만 메시지 전송은 v25.0으로 간다 —
// Self Messaging은 2026년에 문서화된 기능이라 구버전 경로에서의 동작이 보장되지 않는다.
const IG_MSG_BASE = 'https://graph.instagram.com/v25.0';

/** DM 한 칸. 엔딩이 영상인 경우가 있어서 이미지 전용이 아니다. */
export type DmItem = { kind: 'image' | 'video'; url: string };

export type DmResult = { igsid: string; images: number; captionParts: number };

function requireToken(): string {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token)
    throw new Error(
      'INSTAGRAM_ACCESS_TOKEN 미설정 — scripts/instagram-connect.mjs 로 연결한 뒤 .env.local 에 넣어주세요'
    );
  return token;
}

async function igGet(path: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${IG_MSG_BASE}/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || data.error)
    throw new Error(`Instagram API(${path.split('?')[0]}): ${data.error?.message ?? res.status}`);
  return data;
}

type Participant = { id?: string; username?: string };

/**
 * '나와의 대화' 상대 = 내 계정의 IGSID를 찾는다.
 * env에 박아둔 값이 있으면 그걸 쓰고, 없으면 대화 목록에서 나와 같은 username인 참가자를 고른다.
 * username까지 대조하는 이유: 그냥 "내 user id가 아닌 참가자"를 고르면 최근에 DM 준 팔로워에게
 * 카드뉴스가 통째로 날아갈 수 있다. 못 찾으면 보내지 않고 멈춘다.
 */
export async function resolveSelfIgsid(): Promise<string> {
  const pinned = process.env.INSTAGRAM_SELF_IGSID;
  if (pinned) return pinned;

  const token = requireToken();
  const me = (await igGet('me?fields=id,user_id,username', token)) as {
    id?: string;
    user_id?: string;
    username?: string;
  };
  if (!me.username) throw new Error('내 인스타 계정 정보를 읽지 못했습니다 (토큰 만료 가능성)');

  // 내 계정을 가리키는 id는 응답 형태에 따라 id / user_id 로 갈린다 → 셋 다 후보에서 제외한다.
  const selfIds = new Set(
    [me.id, me.user_id, process.env.INSTAGRAM_USER_ID].filter(Boolean) as string[]
  );

  const convos = (await igGet(
    'me/conversations?platform=instagram&fields=participants&limit=50',
    token
  )) as {
    data?: Array<{ participants?: { data?: Participant[] } }>;
  };
  for (const c of convos.data ?? []) {
    const hit = (c.participants?.data ?? []).find(
      (p) => p.username === me.username && p.id && !selfIds.has(p.id)
    );
    if (hit?.id) return hit.id;
  }

  throw new Error(
    `'나와의 대화'를 찾지 못했습니다 — ① 인스타 앱 → DM → 새 메시지 → @${me.username} 검색 → 한 통 전송, ② 터미널에서 node scripts/instagram-self-igsid.mjs --write 실행. 이 두 단계를 거쳐야 IGSID가 생깁니다`
  );
}

async function sendMessage(igsid: string, message: unknown, token: string): Promise<void> {
  const post = (path: string, body: unknown) =>
    fetch(`${IG_MSG_BASE}/${path}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  // Self Messaging 규격: 경로에 IGSID를 넣고 recipient는 생략한다.
  let res = await post(igsid, { message });
  let data = await res.json();

  // 계정이 셀프 메시징 대상이 아니면 위 형태를 못 알아듣는다 →
  // 일반 DM 규격(내 user id + recipient)으로 한 번 더 시도한다. 이 경로는 24시간 창의 지배를 받는다.
  const userId = process.env.INSTAGRAM_USER_ID;
  if ((!res.ok || data.error) && userId) {
    res = await post(userId, { recipient: { id: igsid }, message });
    data = await res.json();
  }
  if (!res.ok || data.error)
    throw new Error(`Instagram 메시지 전송: ${data.error?.message ?? res.status}`);
}

/**
 * 캡션을 메시지 한 통 한도(UTF-8 1000바이트)에 맞춰 쪼갠다.
 * 한글은 글자당 3바이트라 300자만 넘어도 걸리는데, 그냥 보내면 통째로 거절당해서 캡션이 안 온다.
 * 줄 단위로 끊고, 한 줄이 혼자 한도를 넘으면 글자 단위로 자른다.
 */
export function chunkCaption(text: string, max = 900): string[] {
  const enc = new TextEncoder();
  const bytes = (s: string) => enc.encode(s).length;
  if (!text.trim()) return [];
  if (bytes(text) <= max) return [text];

  const out: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur) out.push(cur);
    cur = '';
  };
  for (const line of text.split('\n')) {
    const next = cur ? `${cur}\n${line}` : line;
    if (bytes(next) <= max) {
      cur = next;
      continue;
    }
    flush();
    if (bytes(line) <= max) {
      cur = line;
      continue;
    }
    let piece = '';
    for (const ch of line) {
      if (bytes(piece + ch) > max) {
        out.push(piece);
        piece = '';
      }
      piece += ch;
    }
    cur = piece;
  }
  flush();
  return out;
}

/**
 * 카드 이미지 → 캡션 순서로 내 DM에 밀어넣는다.
 * 캡션을 마지막에 보내는 이유: 대화 맨 아래에 있어야 폰에서 길게 눌러 바로 복사할 수 있다.
 * 중간에 실패하면 몇 장까지 갔는지 말해준다 — 다시 눌러 처음부터 보낼지 사람이 정한다.
 */
export async function sendSelfDm(items: DmItem[], caption: string): Promise<DmResult> {
  const token = requireToken();
  const igsid = await resolveSelfIgsid();

  let images = 0;
  for (const item of items) {
    try {
      await sendMessage(igsid, { attachment: { type: item.kind, payload: { url: item.url } } }, token);
      images++;
    } catch (e) {
      throw new Error(`${images + 1}번째 카드에서 중단 (${images}장 도착) — ${(e as Error).message}`);
    }
  }

  const parts = chunkCaption(caption);
  let captionParts = 0;
  for (const part of parts) {
    try {
      await sendMessage(igsid, { text: part }, token);
      captionParts++;
    } catch (e) {
      throw new Error(
        `카드 ${images}장은 갔지만 캡션 전송에서 실패 — ${(e as Error).message} (캡션은 검수 화면에서 복사해 주세요)`
      );
    }
  }

  return { igsid, images, captionParts };
}
