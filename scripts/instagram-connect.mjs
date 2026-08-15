#!/usr/bin/env node
/**
 * Instagram 발행 연결 — 토큰 발급 뒷정리 · 검증 · 등록을 한 번에.
 *
 * 왜: lib/cardpress/publish.ts 의 캐러셀 발행 코드는 완성돼 있고 막히는 건 자격증명 2개
 *   (INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN)뿐이다. 그런데 이 2개를 손으로 만들면
 *   조용히 틀리는 지점이 셋이다.
 *   ① IG 계정 id ≠ 페이지 id ≠ IG 로그인 id — 눈으로 구분이 안 돼 엉뚱한 id를 넣고
 *      발행 때 "Unsupported get request"만 본다.
 *   ② 그래프 탐색기가 주는 토큰은 1~2시간짜리다. 오늘 발행에 성공하고 내일 실패한다.
 *   ③ instagram_content_publish 권한이 빠져도 다른 호출은 전부 성공한다 → 발행 순간에만 터진다.
 *   그래서 사람이 하는 일은 "그래프 탐색기에서 토큰 복사" 하나로 줄이고, 나머지(장기 토큰 교환·
 *   페이지/IG 계정 탐색·권한 점검·env 기록·Vercel 등록)는 전부 여기서 한다.
 *
 * 사용:
 *   node scripts/instagram-connect.mjs --token "EAAB..." --app-id <id> --app-secret <secret> --write
 *      → 장기 토큰 교환 + IG 계정 자동 탐색 + 권한 점검 + .env.local 기록
 *   node scripts/instagram-connect.mjs --verify
 *      → .env.local(또는 현재 env)의 값으로 실제 호출해 발행 가능 상태인지 확인
 *   node scripts/instagram-connect.mjs --push-vercel
 *      → .env.local 값을 Vercel(caselab-admin) 환경변수에 등록. VERCEL_TOKEN 필요.
 *        (Vercel CLI는 stdin으로 값을 받을 때 깨지는 버그가 있어 REST API로 넣는다)
 *
 * 토큰은 화면에 마스킹해서만 찍는다. 전체 값은 .env.local 에만 들어간다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const GRAPH = 'https://graph.facebook.com/v21.0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env.local');

// 발행에 실제로 필요한 권한. 이 중 하나라도 빠지면 발행 순간에만 실패한다.
const REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
];

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

// ── Graph 호출 ─────────────────────────────────────────────
async function graph(pathname, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${pathname}${qs ? `?${qs}` : ''}`);
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

// ── 1) 연결: 토큰 → 장기 토큰 → IG 계정 탐색 ───────────────
async function connect() {
  const shortToken = argOf('--token');
  if (!shortToken) {
    console.error('--token 이 필요합니다. docs/10_instagram_connect_runbook.md 1~4단계 참고.');
    process.exit(1);
  }
  const appId = argOf('--app-id', process.env.META_APP_ID);
  const appSecret = argOf('--app-secret', process.env.META_APP_SECRET);

  console.log('\n[1/4] 토큰 점검');
  let token = shortToken;
  let info;
  try {
    info = (await graph('debug_token', { input_token: token, access_token: token })).data;
  } catch (e) {
    fail(`토큰이 유효하지 않습니다 — ${e.message}`);
    console.log('     그래프 탐색기에서 토큰을 다시 생성해 주세요(만료됐을 가능성이 큽니다).');
    process.exit(1);
  }
  const scopes = info.scopes ?? [];
  const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  ok(`앱 ${info.app_id} · 토큰 ${mask(token)}`);
  if (missing.length) {
    fail(`권한 누락: ${missing.join(', ')}`);
    console.log('     그래프 탐색기 → Permissions 에서 위 권한을 체크하고 Generate Access Token 을 다시 누르세요.');
    process.exit(1);
  }
  ok(`권한 ${REQUIRED_SCOPES.length}종 모두 있음`);
  const expiresAt = info.expires_at ? new Date(info.expires_at * 1000) : null;
  if (expiresAt) warn(`현재 토큰 만료: ${expiresAt.toLocaleString('ko-KR')} — 장기 토큰으로 교환합니다`);

  console.log('\n[2/4] 장기 토큰 교환');
  if (appId && appSecret) {
    try {
      const ex = await graph('oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: token,
      });
      token = ex.access_token;
      ok(`60일짜리 사용자 토큰으로 교환 (${mask(token)})`);
    } catch (e) {
      fail(`교환 실패 — ${e.message}`);
      warn('단기 토큰으로 계속 진행합니다. 몇 시간 뒤 발행이 실패합니다.');
    }
  } else {
    warn('--app-id / --app-secret 없음 → 교환 생략. 장기 토큰이 아니면 곧 만료됩니다.');
    warn('앱 대시보드 → 설정 → 기본 설정 에서 앱 ID·시크릿 코드를 확인해 다시 실행하세요.');
  }

  console.log('\n[3/4] Instagram 비즈니스 계정 탐색');
  const pages = await graph('me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username,name}',
    access_token: token,
    limit: '100',
  });
  const linked = (pages.data ?? []).filter((p) => p.instagram_business_account);
  if (!linked.length) {
    fail('IG 비즈니스 계정이 연결된 페이스북 페이지를 찾지 못했습니다.');
    console.log(`     보이는 페이지: ${(pages.data ?? []).map((p) => p.name).join(', ') || '없음'}`);
    console.log('     → Instagram 앱에서 프로페셔널 계정 전환 + 페이스북 페이지 연결이 선행돼야 합니다.');
    console.log('       (docs/10_instagram_connect_runbook.md 1단계)');
    process.exit(1);
  }
  linked.forEach((p, i) =>
    console.log(`  ${i + 1}) 페이지 "${p.name}" → @${p.instagram_business_account.username} (id ${p.instagram_business_account.id})`)
  );
  const wantUser = argOf('--ig-username');
  const picked = wantUser
    ? linked.find((p) => p.instagram_business_account.username === wantUser.replace(/^@/, ''))
    : linked[0];
  if (!picked) {
    fail(`@${wantUser} 를 위 목록에서 찾지 못했습니다.`);
    process.exit(1);
  }
  if (linked.length > 1 && !wantUser)
    warn(`계정이 여러 개라 1번을 골랐습니다. 다른 계정이면 --ig-username @핸들 로 다시 실행하세요.`);

  const igId = picked.instagram_business_account.id;
  // 페이지 토큰(장기 사용자 토큰에서 파생된 것)은 만료가 없다 → 발행용으로 이쪽이 낫다.
  const finalToken = picked.access_token ?? token;
  const tokenKind = picked.access_token ? '페이지 토큰(만료 없음)' : '사용자 토큰';
  ok(`선택: @${picked.instagram_business_account.username} (id ${igId}) · ${tokenKind}`);

  console.log('\n[4/4] 발행 가능 여부 확인');
  await probe(igId, finalToken);

  if (has('--write')) {
    await writeEnvLocal({ INSTAGRAM_USER_ID: igId, INSTAGRAM_ACCESS_TOKEN: finalToken });
    // Next dev는 .env.local 변경을 자동 리로드한다(터미널 "Reload env" 로그) — 재시작 안내는 과잉.
    ok(`.env.local 기록 완료 — dev 서버가 자동 리로드합니다("Reload env" 로그 확인)`);
    console.log('\n다음: node scripts/instagram-connect.mjs --verify  (발행 가능 상태 재확인)');
  } else {
    console.log('\n아래를 .env.local 에 넣으세요 (또는 --write 로 자동 기록):');
    console.log(`INSTAGRAM_USER_ID=${igId}`);
    console.log(`INSTAGRAM_ACCESS_TOKEN=${finalToken}`);
  }
}

// ── 2) 검증: 지금 값으로 실제 발행이 되는 상태인가 ─────────
async function probe(igId, token) {
  const me = await graph(igId, { fields: 'id,username,name,followers_count', access_token: token });
  ok(`계정 조회 성공 — @${me.username}${me.followers_count != null ? ` (팔로워 ${me.followers_count})` : ''}`);
  try {
    const limit = await graph(`${igId}/content_publishing_limit`, {
      fields: 'config,quota_usage',
      access_token: token,
    });
    const row = limit.data?.[0];
    if (row)
      ok(`발행 쿼터 ${row.quota_usage ?? 0}/${row.config?.quota_total ?? 100} (24시간 기준) — 발행 권한 확인됨`);
  } catch (e) {
    // 이 호출이 막히면 instagram_content_publish 가 없다는 뜻 → 발행에서 터진다.
    fail(`발행 쿼터 조회 실패 — ${e.message}`);
    fail('instagram_content_publish 권한이 실제로는 없을 가능성이 높습니다. 발행이 실패합니다.');
    return false;
  }
  return true;
}

async function verify() {
  const env = { ...(await readEnvLocal()), ...process.env };
  const igId = env.INSTAGRAM_USER_ID;
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  console.log('\nInstagram 발행 자격증명 검증');
  if (!igId || !token) {
    fail('INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN 미설정 — 아직 연결 전입니다.');
    console.log('     node scripts/instagram-connect.mjs --token "..." --app-id ... --app-secret ... --write');
    process.exit(1);
  }
  ok(`id ${igId} · 토큰 ${mask(token)}`);
  try {
    const info = (await graph('debug_token', { input_token: token, access_token: token })).data;
    if (info.expires_at === 0) ok('토큰 만료 없음(페이지 토큰)');
    else if (info.expires_at) {
      const d = new Date(info.expires_at * 1000);
      const days = Math.round((d - new Date()) / 86400000);
      (days < 7 ? warn : ok)(`토큰 만료 ${d.toLocaleDateString('ko-KR')} (${days}일 남음)`);
    }
    const missing = REQUIRED_SCOPES.filter((s) => !(info.scopes ?? []).includes(s));
    if (missing.length) fail(`권한 누락: ${missing.join(', ')}`);
  } catch (e) {
    warn(`토큰 메타 조회 생략 — ${e.message}`);
  }
  const good = await probe(igId, token);
  console.log(good ? '\n발행 준비 완료.\n' : '\n발행 불가 — 위 항목을 고쳐야 합니다.\n');
  if (!good) process.exit(1);
}

// ── 3) Vercel 등록 ─────────────────────────────────────────
/** 이미 `vercel login` 을 했다면 CLI가 저장해둔 토큰을 재사용한다 — 토큰 재발급 단계를 없앤다. */
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
    console.log('     https://vercel.com/account/tokens 에서 발급 후');
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
  console.log('\n반영하려면 재배포가 필요합니다: vercel --prod\n');
}

// ── 진입점 ─────────────────────────────────────────────────
const mode = has('--verify') ? verify : has('--push-vercel') ? pushVercel : connect;
mode().catch((e) => {
  console.error(`\n실패: ${e.message}\n`);
  process.exit(1);
});
