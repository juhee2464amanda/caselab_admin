import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 인스타 웹훅 수신구 — 목적은 딱 하나, **내 계정의 IGSID를 한 번 건져내는 것**.
//
// 왜 필요한가: '나에게 DM 보내기'는 상대 id로 IGSID(Instagram-scoped ID)를 요구하는데,
//   ① 이 값은 어느 화면에도 표시되지 않고
//   ② Conversations API는 '나와의 대화'를 아예 돌려주지 않는다(실측: 폴더 전부 0건).
//   Meta 문서가 말하는 유일한 출처가 **echo 웹훅**이다 — 내가 나에게 DM을 보내면
//   recipient.id 자리에 IGSID가 담겨 날아온다.
//   (developers.facebook.com/docs/instagram-platform/self-messaging/)
//
// 한 번 잡아서 .env.local(INSTAGRAM_SELF_IGSID)에 박으면 이 라우트는 더 쓸 일이 없다.
// 그래서 DB 테이블을 새로 파지 않고 로그 + 메모리 캐시로만 둔다.

// 같은 서버 인스턴스가 살아 있는 동안만 유효한 캐시. 로컬(dev 서버 상주)에서는 이걸로 충분하고,
// 서버리스에서는 못 믿는다 → 그래서 로그에도 반드시 남긴다.
// 모듈 전역 변수에 담으면 안 된다 — Next dev는 요청마다 라우트 모듈을 새로 평가해서
// POST가 담아둔 값이 GET에서 보이지 않는다(이걸로 한참 헤맸다). 그래서 임시 파일에 남긴다.
const STORE = path.join(os.tmpdir(), 'caselab-ig-webhook.json');

type Store = { selfIgsid: string | null; events: string[] };

function readStore(): Store {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8')) as Store;
  } catch {
    return { selfIgsid: null, events: [] };
  }
}

function writeStore(s: Store) {
  try {
    fs.writeFileSync(STORE, JSON.stringify(s), 'utf8');
  } catch (e) {
    console.error('[ig-webhook] 저장 실패', e);
  }
}

type Messaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  is_self?: boolean;
  message?: { is_self?: boolean; is_echo?: boolean; text?: string };
};

/** Meta 웹훅 등록 시의 확인 요청(hub.challenge)에 답한다. peek=<verify_token>이면 잡아둔 값을 돌려준다. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  if (p.get('hub.mode') === 'subscribe') {
    if (!expected)
      return new NextResponse('INSTAGRAM_WEBHOOK_VERIFY_TOKEN 미설정', { status: 500 });
    if (p.get('hub.verify_token') !== expected)
      return new NextResponse('verify_token 불일치', { status: 403 });
    // 반드시 challenge 원문만, text/plain 으로 돌려줘야 Meta가 통과시킨다.
    return new NextResponse(p.get('hub.challenge') ?? '', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  if (expected && p.get('peek') === expected) return NextResponse.json(readStore());

  return new NextResponse('ok', { status: 200 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  // 앱 시크릿이 있으면 서명을 본다. 없으면 그냥 통과 — 이 라우트가 하는 일이 '로그 찍기'뿐이라
  // 위조 요청이 할 수 있는 최악이 로그 오염이고, 시크릿 요구로 캡처가 막히는 편이 더 손해다.
  const secret = process.env.INSTAGRAM_APP_SECRET;
  const sig = req.headers.get('x-hub-signature-256');
  if (secret && sig) {
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
    if (sig !== expected) {
      console.warn('[ig-webhook] 서명 불일치 — 무시');
      return new NextResponse('EVENT_RECEIVED', { status: 200 });
    }
  }

  const store = readStore();
  // 안 잡힐 때 "아예 안 온 건지, 왔는데 self로 분류가 안 된 건지"를 가르려고 원문도 몇 건 남긴다.
  store.events.push(raw.slice(0, 1500));
  while (store.events.length > 5) store.events.shift();

  try {
    const body = JSON.parse(raw) as { entry?: Array<{ messaging?: Messaging[] }> };
    for (const entry of body.entry ?? []) {
      for (const m of entry.messaging ?? []) {
        const isSelf = m.is_self === true || m.message?.is_self === true;
        const igsid = m.recipient?.id;
        if (isSelf && igsid) {
          store.selfIgsid = igsid;
          // 이 한 줄을 찾으려고 만든 라우트다. 눈에 띄게 찍는다.
          console.log(`\n[ig-webhook] ★ SELF_IGSID=${igsid}\n`);
        } else {
          console.log('[ig-webhook] (self 아님)', JSON.stringify(m).slice(0, 400));
        }
      }
    }
  } catch (e) {
    console.error('[ig-webhook] 본문 파싱 실패', e, raw.slice(0, 400));
  }
  writeStore(store);

  // Meta는 200이 아니면 재시도하고, 반복 실패하면 구독을 끊는다 → 항상 200.
  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}
