#!/usr/bin/env node
/**
 * Instagram 발행 연결 — 토큰 뒷정리 · 검증 · 갱신 · 등록.
 *
 * 경로: **Instagram API with Instagram Login** (`graph.instagram.com`).
 *   원래는 Facebook Login(`graph.facebook.com`) 경로로 만들었는데, 신규 앱의
 *   "Facebook Login for Business" 구성에서 인스타 권한이 아예 검색되지 않아(No matching results)
 *   2026-08-15 이쪽으로 전환했다. 발행 엔드포인트는 양쪽이 동일해서 lib/cardpress/publish.ts는
 *   호스트 한 줄만 바뀌었다.
 *
 * 왜 스크립트가 필요한가 — 손으로 하면 조용히 틀리는 지점이 셋이다.
 *   ① 대시보드가 주는 토큰이 단기일 수 있다. 오늘 발행되고 내일 실패한다.
 *   ② IG 사용자 id는 화면에 안 보인다. 페이지 id·IG 로그인 id와 헷갈려 엉뚱한 값을 넣기 쉽다.
 *   ③ instagram_business_content_publish가 빠져도 프로필 조회는 성공한다 → 발행 순간에만 터진다.
 *   그래서 사람이 하는 일은 "대시보드에서 토큰 복사" 하나로 줄이고 나머지는 여기서 한다.
 *
 * 사용:
 *   node scripts/instagram-connect.mjs --token "IGAA..." [--app-secret <시크릿>] --write
 *      → 장기 토큰 교환(가능하면) + IG id 자동 조회 + 발행 권한 실호출 검증 + .env.local 기록
 *   node scripts/instagram-connect.mjs --verify
 *      → 현재 값으로 실제 발행이 되는 상태인지 확인 (만료 임박도 경고)
 *   node scripts/instagram-connect.mjs --refresh
 *      → 60일 토큰을 60일 더 연장하고 .env.local 갱신 (만료 24시간 전~60일 사이에만 가능)
 *   node scripts/instagram-connect.mjs --push-vercel
 *      → .env.local 값을 Vercel(caselab-admin)에 등록. 로컬 전용 운영이면 쓸 일 없다.
 *
 * 토큰은 화면에 마스킹해서만 찍는다. 전체 값은 .env.local 에만 들어간다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const IG = 'https://graph.instagram.com';
const IG_V = `${IG}/v21.0`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env.local');

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argOf = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};

const mask = (t) => (t && t.length > 16 ? `${t.slice(0, 8)}…${t.slice(-4)}` : '(없음)');
const ok = (m) => console.log(`  ✅ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);
const fail = (m) => console.log(`  ❌ ${m}`);
const days = (sec) => Math.round(sec / 86400);

// ── Graph 호출 ─────────────────────────────────────────────
async function ig(url, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}${qs ? `?${qs}` : ''}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(
      `${e.message ?? res.status}${e.code ? ` (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})` : ''}`
    );
  }
  return data;
}

// ── .env.local 읽기/쓰기 ───────────────────────────────────
async function readEnvLocal() {
  if (!existsSync(ENV_PATH)) return {};
  const raw = await readFile(ENV_PATH, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/** 같은 키가 있으면 그 줄을 교체하고, 없으면 주석 헤더와 함께 덧붙인다. */
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
    raw += `\n# 카드뉴스 Instagram 발행 (scripts/instagram-connect.mjs 생성)\n${appended.join('\n')}\n`;
  }
  await writeFile(ENV_PATH, raw, 'utf8');
}

/** 만료 시각을 사람이 읽는 값으로. Instagram Login 토큰은 expires_in(초)만 준다. */
function stampExpiry(expiresInSec) {
  const at = new Date(Date.now() + expiresInSec * 1000);
  return at.toISOString();
}

// ── 공통: 계정 조회 + 발행 권한 실호출 ─────────────────────
async function probe(token) {
  let me;
  try {
    me = await ig(`${IG_V}/me`, { fields: 'id,username,account_type', access_token: token });
  } catch (e) {
    // 여기서 죽으면 대개 토큰 문제다. 원문(Failed to decrypt 등)만 던지면 뭘 해야 할지 안 보인다.
    fail(`토큰이 유효하지 않습니다 — ${e.message}`);
    console.log('     앱 대시보드 → Use cases → Customize → "2. Generate access tokens" 에서');
    console.log('     토큰을 다시 발급받아 복사 누락 없이 넣어주세요.');
    return null;
  }
  ok(`계정 조회 성공 — @${me.username} (id ${me.id}${me.account_type ? ` · ${me.account_type}` : ''})`);
  try {
    const limit = await ig(`${IG_V}/${me.id}/content_publishing_limit`, {
      fields: 'config,quota_usage',
      access_token: token,
    });
    const row = limit.data?.[0];
    ok(
      `발행 쿼터 ${row?.quota_usage ?? 0}/${row?.config?.quota_total ?? 100} (24시간 기준) — 발행 권한 확인됨`
    );
    return me;
  } catch (e) {
    // 이 호출이 막히면 instagram_business_content_publish가 없다는 뜻 → 발행에서만 터진다.
    fail(`발행 쿼터 조회 실패 — ${e.message}`);
    fail('instagram_business_content_publish 권한이 실제로는 없을 가능성이 높습니다.');
    console.log(
      '     앱 대시보드 → Use cases → Customize → 권한 목록에서 추가한 뒤 토큰을 다시 발급하세요.'
    );
    return null;
  }
}

// ── 1) 연결 ────────────────────────────────────────────────
async function connect() {
  const shortToken = argOf('--token');
  if (!shortToken) {
    console.error('--token 이 필요합니다. docs/10_instagram_connect_runbook.md C단계 참고.');
    process.exit(1);
  }
  const appSecret = argOf('--app-secret', process.env.META_APP_SECRET);

  console.log('\n[1/3] 장기 토큰 교환');
  let token = shortToken;
  let expiresIn = null;
  if (appSecret) {
    try {
      const ex = await ig(`${IG}/access_token`, {
        grant_type: 'ig_exchange_token',
        client_secret: appSecret,
        access_token: token,
      });
      token = ex.access_token;
      expiresIn = ex.expires_in;
      ok(`장기 토큰 확보 — ${days(expiresIn)}일 유효 (${mask(token)})`);
    } catch (e) {
      // 대시보드가 이미 장기 토큰을 준 경우 여기서 "already long-lived" 류로 거절된다 → 정상.
      warn(`교환 생략 — ${e.message}`);
      warn('대시보드가 이미 장기 토큰을 줬다면 정상입니다. 아래 검증에서 만료일을 확인하세요.');
    }
  } else {
    warn('--app-secret 없음 → 장기 토큰 교환 생략.');
    warn('대시보드 토큰이 단기면 몇 시간 뒤 발행이 실패합니다. App settings → Basic 의 시크릿을 넣고 다시 실행하세요.');
  }

  console.log('\n[2/3] 계정 조회 + 발행 권한 확인');
  const me = await probe(token);
  if (!me) process.exit(1);

  console.log('\n[3/3] 기록');
  if (has('--write')) {
    const pairs = { INSTAGRAM_USER_ID: me.id, INSTAGRAM_ACCESS_TOKEN: token };
    if (expiresIn) pairs.INSTAGRAM_TOKEN_EXPIRES_AT = stampExpiry(expiresIn);
    await writeEnvLocal(pairs);
    ok('.env.local 기록 완료 — dev 서버가 자동 리로드합니다("Reload env" 로그 확인)');
    console.log('\n다음: node scripts/instagram-connect.mjs --verify');
    if (expiresIn)
      console.log(`갱신: ${days(expiresIn)}일 안에 node scripts/instagram-connect.mjs --refresh`);
  } else {
    console.log('\n아래를 .env.local 에 넣으세요 (또는 --write 로 자동 기록):');
    console.log(`INSTAGRAM_USER_ID=${me.id}`);
    console.log(`INSTAGRAM_ACCESS_TOKEN=${token}`);
  }
}

// ── 2) 검증 ────────────────────────────────────────────────
async function verify() {
  const env = { ...(await readEnvLocal()), ...process.env };
  const igId = env.INSTAGRAM_USER_ID;
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  console.log('\nInstagram 발행 자격증명 검증');
  if (!igId || !token) {
    fail('INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN 미설정 — 아직 연결 전입니다.');
    console.log('     node scripts/instagram-connect.mjs --token "IGAA..." --app-secret ... --write');
    process.exit(1);
  }
  ok(`id ${igId} · 토큰 ${mask(token)}`);

  const expAt = env.INSTAGRAM_TOKEN_EXPIRES_AT;
  if (expAt) {
    const left = Math.round((new Date(expAt) - new Date()) / 86400000);
    if (left < 0) fail(`토큰 만료됨 (${expAt}) — --refresh 로는 못 살립니다. 대시보드에서 재발급하세요.`);
    else if (left < 10) warn(`토큰 만료까지 ${left}일 — 지금 --refresh 하세요`);
    else ok(`토큰 만료까지 ${left}일`);
  } else {
    warn('만료일 기록 없음 — --refresh 로 갱신하면 이후부터 기록됩니다');
  }

  const me = await probe(token);
  if (!me) {
    console.log('\n발행 불가 — 위 항목을 고쳐야 합니다.\n');
    process.exit(1);
  }
  if (me.id !== igId)
    warn(`env의 id(${igId})와 토큰의 실제 계정 id(${me.id})가 다릅니다 — --write 로 다시 기록하세요`);
  console.log('\n발행 준비 완료.\n');
}

// ── 3) 토큰 갱신 (60일 연장) ───────────────────────────────
async function refresh() {
  const env = await readEnvLocal();
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  console.log('\nInstagram 토큰 갱신');
  if (!token) {
    fail('.env.local 에 INSTAGRAM_ACCESS_TOKEN 이 없습니다.');
    process.exit(1);
  }
  try {
    const r = await ig(`${IG}/refresh_access_token`, {
      grant_type: 'ig_refresh_token',
      access_token: token,
    });
    await writeEnvLocal({
      INSTAGRAM_ACCESS_TOKEN: r.access_token,
      INSTAGRAM_TOKEN_EXPIRES_AT: stampExpiry(r.expires_in),
    });
    ok(`${days(r.expires_in)}일 연장 완료 (${mask(r.access_token)})`);
    console.log('  .env.local 갱신됨 — dev 서버 자동 리로드\n');
  } catch (e) {
    fail(`갱신 실패 — ${e.message}`);
    console.log('     갱신은 발급 후 24시간이 지난 유효 토큰에만 됩니다.');
    console.log('     이미 만료됐다면 앱 대시보드 → Use cases → Generate access tokens 에서 재발급하세요.');
    process.exit(1);
  }
}

// ── 4) Vercel 등록 (로컬 전용 운영이면 불필요) ─────────────
async function vercelToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const candidates = [
    path.join(process.env.HOME ?? '', 'Library/Application Support/com.vercel.cli/auth.json'),
    path.join(process.env.HOME ?? '', '.vercel/auth.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const t = JSON.parse(await readFile(p, 'utf8')).token;
      if (t) return t;
    } catch {
      /* 다음 후보로 */
    }
  }
  return null;
}

async function pushVercel() {
  const env = await readEnvLocal();
  const token = await vercelToken();
  if (!token) {
    fail('Vercel 토큰을 찾지 못했습니다 — `vercel login` 을 하거나');
    console.log('     VERCEL_TOKEN=... node scripts/instagram-connect.mjs --push-vercel');
    process.exit(1);
  }
  const proj = JSON.parse(await readFile(path.join(ROOT, '.vercel/project.json'), 'utf8'));
  const pairs = {
    INSTAGRAM_USER_ID: env.INSTAGRAM_USER_ID,
    INSTAGRAM_ACCESS_TOKEN: env.INSTAGRAM_ACCESS_TOKEN,
  };
  if (!pairs.INSTAGRAM_USER_ID || !pairs.INSTAGRAM_ACCESS_TOKEN) {
    fail('.env.local 에 값이 없습니다. 먼저 --write 로 연결을 끝내세요.');
    process.exit(1);
  }
  const base = `https://api.vercel.com/v10/projects/${proj.projectId}/env?teamId=${proj.orgId}`;
  for (const [key, value] of Object.entries(pairs)) {
    const res = await fetch(`${base}&upsert=true`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        key,
        value,
        type: 'encrypted',
        target: ['production', 'preview', 'development'],
      }),
    });
    const data = await res.json();
    if (!res.ok) fail(`${key} 등록 실패 — ${data.error?.message ?? res.status}`);
    else ok(`${key} 등록 (${proj.projectName})`);
  }
  console.log('\n반영하려면 재배포가 필요합니다: vercel --prod');
  warn('60일마다 --refresh 후 --push-vercel 을 다시 해야 prod가 안 죽습니다.\n');
}

// ── 진입점 ─────────────────────────────────────────────────
const mode = has('--verify')
  ? verify
  : has('--refresh')
    ? refresh
    : has('--push-vercel')
      ? pushVercel
      : connect;
mode().catch((e) => {
  console.error(`\n실패: ${e.message}\n`);
  process.exit(1);
});
