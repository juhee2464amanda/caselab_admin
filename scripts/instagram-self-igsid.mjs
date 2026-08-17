#!/usr/bin/env node
/**
 * '나에게 보내기'용 IGSID 찾기.
 *
 * 왜 스크립트가 필요한가 — 이 값은 어디에도 표시되지 않는다.
 *   내 인스타 계정에는 id가 셋 있는데(로그인 id · 비즈니스 id · **대화 상대로서의 id**)
 *   DM 전송이 요구하는 건 셋째, Instagram-scoped ID(IGSID)다.
 *   앞의 둘로 보내면 전부 `요청한 사용자를 찾을 수 없습니다 (code 100/2534014)` 가 난다.
 *   IGSID는 **대화가 한 번이라도 생긴 뒤에만** API로 읽을 수 있어서, 순서가 중요하다.
 *
 * 순서:
 *   1) 인스타 앱 → DM → 새 메시지 → 내 아이디 검색 → 아무 말이나 한 통 전송
 *   2) node scripts/instagram-self-igsid.mjs          → 찾아서 보여주기만
 *      node scripts/instagram-self-igsid.mjs --write  → .env.local 에 INSTAGRAM_SELF_IGSID 기록
 *
 * 못 찾으면 무엇이 비었는지(대화 0건인지, 나와의 대화만 없는 건지)까지 찍는다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const IG_V = 'https://graph.instagram.com/v25.0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env.local');
const WRITE = process.argv.slice(2).includes('--write');

const ok = (m) => console.log(`  ✅ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);
const fail = (m) => console.log(`  ❌ ${m}`);

async function readEnvLocal() {
  if (!existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of (await readFile(ENV_PATH, 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

async function writeEnvLocal(pairs) {
  let raw = existsSync(ENV_PATH) ? await readFile(ENV_PATH, 'utf8') : '';
  const appended = [];
  for (const [k, v] of Object.entries(pairs)) {
    const re = new RegExp(`^\\s*${k}\\s*=.*$`, 'm');
    if (re.test(raw)) raw = raw.replace(re, `${k}=${v}`);
    else appended.push(`${k}=${v}`);
  }
  if (appended.length) {
    if (!raw.endsWith('\n')) raw += '\n';
    raw += `\n# 카드뉴스 → 내 DM 보내기 (scripts/instagram-self-igsid.mjs 생성)\n${appended.join('\n')}\n`;
  }
  await writeFile(ENV_PATH, raw, 'utf8');
}

async function ig(pathname, token) {
  const res = await fetch(`${IG_V}/${pathname}`, { headers: { authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(`${e.message ?? res.status}${e.code ? ` (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})` : ''}`);
  }
  return data;
}

async function main() {
  const env = await readEnvLocal();
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return fail('INSTAGRAM_ACCESS_TOKEN 이 .env.local 에 없습니다 — scripts/instagram-connect.mjs 먼저');

  const me = await ig('me?fields=id,user_id,username,account_type', token);
  console.log(`\n계정: @${me.username} (${me.account_type})`);
  console.log(`  로그인 id : ${me.id}`);
  console.log(`  비즈니스 id: ${me.user_id}`);
  // 이 셋은 전부 '나'지만 DM 전송에는 쓸 수 없다 → 후보에서 제외해야 IGSID를 골라낼 수 있다.
  const selfIds = new Set([me.id, me.user_id, env.INSTAGRAM_USER_ID].filter(Boolean));

  const convos = await ig('me/conversations?platform=instagram&fields=participants,updated_time&limit=50', token);
  const list = convos.data ?? [];
  console.log(`\n대화 ${list.length}건`);
  if (!list.length) {
    fail("대화가 0건입니다 — IGSID는 대화가 생겨야만 읽을 수 있습니다.");
    warn('인스타 앱 → DM → 새 메시지(우상단 ✏️) → ' + `@${me.username} 검색 → 한 통 보내고 다시 실행하세요.`);
    warn('이미 보냈는데도 0건이면, 앱에 그 계정이 테스터로 등록돼 있고 messages 권한이 살아있는지 확인이 필요합니다.');
    return;
  }

  let found = null;
  for (const c of list) {
    const parts = c.participants?.data ?? [];
    const who = parts.map((p) => `@${p.username ?? '?'}(${p.id})`).join(' ↔ ');
    const self = parts.find((p) => p.username === me.username && p.id && !selfIds.has(p.id));
    console.log(`  · ${who}${self ? '   ← 나와의 대화' : ''}`);
    if (self && !found) found = self.id;
  }

  if (!found) {
    fail('대화는 있지만 **나와의 대화**가 없습니다 (남과의 대화만 있음).');
    warn(`인스타 앱에서 @${me.username} 에게 직접 한 통 보내고 다시 실행하세요.`);
    return;
  }

  ok(`IGSID = ${found}`);
  if (WRITE) {
    await writeEnvLocal({ INSTAGRAM_SELF_IGSID: found });
    ok('.env.local 에 INSTAGRAM_SELF_IGSID 기록 완료 — dev 서버가 떠 있으면 자동 리로드됩니다.');
  } else {
    console.log('\n.env.local 에 넣으려면:');
    console.log(`  INSTAGRAM_SELF_IGSID=${found}`);
    console.log('  (또는 이 스크립트를 --write 로 다시 실행)');
  }
}

main().catch((e) => fail(e.message));
