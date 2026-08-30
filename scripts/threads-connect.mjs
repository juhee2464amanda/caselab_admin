#!/usr/bin/env node
/**
 * Threads 발행 연결 — instagram-connect.mjs와 같은 철학.
 * 사람이 하는 일은 "대시보드에서 토큰 복사" 하나로 줄이고, 나머지(장기 교환·id 조회·발행권한 실검증·env 기록)는 여기서 한다.
 *
 * 경로: Threads API (graph.threads.net) — 인스타와 별개 use case, 토큰도 별개.
 *
 * 사용:
 *   node scripts/threads-connect.mjs --token "THAA..." [--app-secret <시크릿>] --write
 *      → 장기 토큰 교환(시크릿 있으면) + Threads 사용자 id 조회 + 발행 권한 검증 + .env.local 기록
 *   node scripts/threads-connect.mjs --verify   → 현재 값으로 발행 가능한 상태인지 확인
 *   node scripts/threads-connect.mjs --refresh  → 60일 토큰 60일 연장 + env 갱신
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TH = 'https://graph.threads.net';
const TH_V = `${TH}/v1.0`;
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

async function th(url, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}${qs ? `?${qs}` : ''}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(`${e.message ?? res.status}${e.code ? ` (code ${e.code})` : ''}`);
  }
  return data;
}

async function readEnv() {
  return existsSync(ENV_PATH) ? await readFile(ENV_PATH, 'utf8') : '';
}
async function upsertEnv(pairs) {
  let txt = await readEnv();
  for (const [k, v] of Object.entries(pairs)) {
    const line = `${k}=${v}`;
    txt = new RegExp(`^${k}=`, 'm').test(txt) ? txt.replace(new RegExp(`^${k}=.*$`, 'm'), line) : `${txt.trimEnd()}\n${line}\n`;
  }
  await writeFile(ENV_PATH, txt);
}
function envOf(txt, k) {
  return txt.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
}

/** 토큰으로 사용자 id·발행 가능 상태 검증. 성공 시 {id, username} */
async function verifyToken(token) {
  const me = await th(`${TH_V}/me`, { fields: 'id,username', access_token: token });
  ok(`Threads 계정: @${me.username} (id ${me.id})`);
  // threads_content_publish가 빠져도 me는 성공한다 → 발행 쿼터 조회로 권한을 실검증
  try {
    await th(`${TH_V}/${me.id}/threads_publishing_limit`, { fields: 'quota_usage', access_token: token });
    ok('발행 권한(threads_content_publish) 확인');
  } catch (e) {
    fail(`발행 권한 검증 실패 — 토큰 생성 시 threads_content_publish 권한을 포함했는지 확인: ${e.message}`);
    throw e;
  }
  return me;
}

const main = async () => {
  if (has('--verify')) {
    const txt = await readEnv();
    const token = envOf(txt, 'THREADS_ACCESS_TOKEN');
    if (!token) return fail('THREADS_ACCESS_TOKEN 없음 — --token으로 먼저 등록하세요');
    console.log(`토큰: ${mask(token)}`);
    await verifyToken(token);
    const exp = Number(envOf(txt, 'THREADS_TOKEN_EXPIRES_AT') || 0);
    if (exp) {
      const left = Math.round((exp * 1000 - Date.now()) / 86400000);
      (left < 7 ? warn : ok)(`토큰 만료까지 ${left}일${left < 7 ? ' — --refresh 하세요' : ''}`);
    }
    return;
  }

  if (has('--refresh')) {
    const txt = await readEnv();
    const token = envOf(txt, 'THREADS_ACCESS_TOKEN');
    if (!token) return fail('THREADS_ACCESS_TOKEN 없음');
    const r = await th(`${TH}/refresh_access_token`, { grant_type: 'th_refresh_token', access_token: token });
    await upsertEnv({
      THREADS_ACCESS_TOKEN: r.access_token,
      THREADS_TOKEN_EXPIRES_AT: String(Math.floor(Date.now() / 1000) + r.expires_in),
    });
    ok(`토큰 ${days(r.expires_in)}일 연장, .env.local 갱신`);
    return;
  }

  let token = argOf('--token');
  if (!token) {
    console.log('사용법: node scripts/threads-connect.mjs --token "THAA..." [--app-secret <시크릿>] --write');
    process.exit(1);
  }

  // 1. (시크릿 있으면) 단기 → 60일 장기 토큰 교환. 대시보드 토큰이 이미 장기면 교환이 거부돼도 무해.
  const secret = argOf('--app-secret');
  let expiresIn = 0;
  if (secret) {
    try {
      const r = await th(`${TH}/access_token`, { grant_type: 'th_exchange_token', client_secret: secret, access_token: token });
      token = r.access_token;
      expiresIn = r.expires_in;
      ok(`장기 토큰 교환 완료 (${days(expiresIn)}일)`);
    } catch (e) {
      warn(`장기 교환 실패(이미 장기 토큰이면 정상): ${e.message}`);
    }
  } else {
    warn('--app-secret 없음 — 단기 토큰이면 1시간 뒤 만료됩니다. 대시보드 시크릿을 같이 주는 걸 권장');
  }

  // 2. id 조회 + 발행 권한 실검증
  const me = await verifyToken(token);

  // 3. 기록
  if (has('--write')) {
    await upsertEnv({
      THREADS_USER_ID: me.id,
      THREADS_ACCESS_TOKEN: token,
      ...(expiresIn ? { THREADS_TOKEN_EXPIRES_AT: String(Math.floor(Date.now() / 1000) + expiresIn) } : {}),
    });
    ok('.env.local 기록 완료 — dev 서버 재시작하면 발행 UI의 Threads 체크가 실동작합니다');
  } else {
    warn('--write 없이 실행 — 검증만 했고 저장 안 함');
  }
};

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});
