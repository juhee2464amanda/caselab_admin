import crypto from 'node:crypto';
import os from 'node:os';

// 카드뉴스를 폰으로 넘기는 경로 — 인스타 DM API가 막혀서(런북 E장) 대신 쓰는 방식.
// 이미지는 어차피 공개 버킷에 올라가므로, 그 이미지들과 캡션을 한 화면에 모아 보여주는
// 링크 하나만 폰으로 옮기면 된다. 폰에서는 로그인이 없으니 링크 자체에 서명을 붙인다.

function secret(): string {
  // 미리보기용 시크릿을 재사용한다. 없으면 서비스 키로 파생 — 어차피 서버에만 있는 값이다.
  const s = process.env.DRAFT_PREVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('DRAFT_PREVIEW_SECRET 또는 SUPABASE_SERVICE_ROLE_KEY 필요');
  return s;
}

/** 카드 id에 묶인 서명. 링크를 아는 사람만 열 수 있고, 다른 카드로는 못 넘어간다. */
export function signCard(cardId: string): string {
  return crypto.createHmac('sha256', secret()).update(`cardpress:${cardId}`).digest('hex').slice(0, 24);
}

export function verifyCard(cardId: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = signCard(cardId);
  // 길이가 다르면 timingSafeEqual이 던진다 → 먼저 거른다.
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

/**
 * 같은 와이파이의 폰이 열 수 있는 주소. 로컬 dev(admin은 localhost:3000)에서만 의미가 있다 —
 * localhost 링크를 폰에 보내면 폰의 자기 자신을 가리켜서 열리지 않기 때문에, 맥의 LAN IP를 준다.
 */
export function lanOrigin(port = 3000): string | null {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))
        return `http://${n.address}:${port}`;
    }
  }
  return null;
}
