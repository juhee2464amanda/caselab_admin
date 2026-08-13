#!/usr/bin/env node
/**
 * 카드뉴스 템플릿 렌더 검수 — 눈으로 보지 않고 실패를 잡는다.
 *
 * 왜: 시안을 눈으로만 확인하면 두 종류의 사고가 조용히 통과한다.
 *   ① 글자 소실 — Satori가 color:'inherit'을 못 받아 검정으로 떨어지면 어두운 배경에서 글자가 사라진다.
 *      (실제로 2026-08-13 프로브에서 헤드라인 절반이 사라진 채 제안될 뻔했다)
 *   ② 대비 부족 — 밝은 사진 위 흰 글씨. 렌더는 성공하고 스크린샷에서도 "보이긴" 하는데 폰에선 안 읽힌다.
 *
 *   ③ 배경 타일링 — Satori가 backgroundSize:'cover'를 무시해 사진이 격자로 반복된다.
 *      렌더는 200이고 글자 대비도 정상이라 픽셀 검사를 전부 통과한다 → 소스 린트로 막는다.
 *
 * 방법: (a) 소스 린트 — templates.tsx에서 Satori 미지원 CSS를 금지.
 *       (b) 픽셀 검사 — 렌더 PNG를 60px 셀로 쪼개 글자 획을 특정하고
 *           글자량(소실)·밝은 글자의 실대비·가장자리 침범(오버플로)을 잰다.
 *
 * 사용: node scripts/cardpress-verify.mjs [--base http://localhost:3000] [--out <dir>] [--only P1,P3]
 * 전제: dev 서버 실행 중 (렌더 라우트의 x-cardpress-dev 우회 헤더는 NODE_ENV!=='production'에서만 동작)
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = argOf('--base', 'http://localhost:3000');
const OUT = argOf('--out', './.cardpress-verify');
const ONLY = argOf('--only', '')
  .split(',')
  .filter(Boolean);

const MIN_CONTRAST = 4.5; // WCAG AA 본문 기준
const CELL = 60;

// 샘플 사진은 **카드와 다른 크기**여야 한다 — 1080×1350으로 딱 맞춰 받으면 타일 하나가 프레임을
// 정확히 채워서 배경 타일링 버그가 안 보인다(2026-08-13: 그래서 검수 20/20 통과인데 실콘텐츠에서
// 2×2 격자가 나갔다). 밝은 사진은 스크림 대비 검사용으로 유지.
const PHOTO_BRIGHT =
  'https://images.unsplash.com/photo-1587522384446-64daf3e2689a?ixid=M3wxMDAxMzgwfDB8MXxzZWFyY2h8MXx8bWluaW1hbCUyMHdvcmtzcGFjZSUyMG1vb2R5fGVufDF8MXx8fDE3ODY2MjQ3OTZ8MA&ixlib=rb-4.1.0&w=640&h=427&fit=crop&q=80';
const PHOTO_DARK =
  'https://images.unsplash.com/photo-1540978455180-ad56d128489a?ixid=M3wxMDAxMzgwfDB8MXxzZWFyY2h8MXx8c3RlZWwlMjBjaGFpbiUyMG1hY3JvJTIwZGFya3xlbnwxfDF8fHwxNzg2NjI0Nzk2fDA&ixlib=rb-4.1.0&w=640&h=427&fit=crop&q=80';

/** 템플릿별 대표 샘플 — 실제 생성물과 같은 분량으로 (짧게 넣으면 오버플로를 못 잡는다) */
const SAMPLES = [
  ['C1', { kicker: '검수의 경제학', title: '검수 시간이\n70% 줄었다', hl: '70%', sub: '초안 40분이 6분이 된 이유', footer: '@REVIEW LOOP', coverImage: PHOTO_BRIGHT }],
  ['C2', { eyebrow: '워크플로', title: '구현해줘가\n틀린 이유', hl: '틀린 이유', sub: '지시가 아니라 제약을 준다' }],
  ['C3', { title: 'Claude Code', hl: 'Code', sub: '터미널에 상주하는 코딩 에이전트', tag: '도구' }],
  ['C4', { eyebrow: '초안 생성, 뭐가 더 낫나', vsA: { name: '지시형', by: '시켜만 두기' }, vsB: { name: '제약형', by: '조건을 박기' }, sub: '3개월 비교 기록' }],
  ['C5', { kicker: '검수 자동화 실측', big: '70%', resolve: '검수 시간이 **줄었다**', footer: '@REVIEW LOOP', coverImage: PHOTO_BRIGHT }],
  ['B1', { lead: '세팅은 세 단계로 끝난다', heading: '이렇게 세팅했어요', hl: '세팅', rows: [{ term: '문제', desc: '3줄로 적는다' }, { term: '초안', desc: '3개를 받는다' }, { term: '검수', desc: '5줄 체크리스트' }] }],
  ['B2', { banner: '✓ AI에게 시킨 것', lead: '검수 시간이 **70% 줄었다**', bullets: ['초안 작성이 40분 → 6분', '반려율은 그대로 12%', '툴 비용은 월 2만원'] }],
  ['B3', { term: '컨텍스트', termEn: 'Context', lead: '모델이 한 번에 보는 범위', body: '넓힐수록 좋아지는 게 아니라 **관련 없는 정보**가 섞이면 정확도가 떨어진다' }],
  ['B4', { title: '지시가 아니라\n제약을 준다', hl: '제약', attribution: '3개월 운영 기록' }],
  ['B5', { good: ['초안 작성 시간이 6분으로 줄었다', '톤이 흔들리지 않는다'], bad: ['첫 주는 오히려 느렸다'] }],
  ['B6', { heading: '이렇게 세팅했어요', hl: '세팅', steps: [{ title: '문제를 3줄로 적는다', desc: '제약과 금지 사항까지' }, { title: '초안 3개를 받는다', desc: '고르는 게 빠르다' }, { title: '검수는 5줄 체크리스트', desc: '길면 아무도 안 본다' }] }],
  ['B7', { big: '70', unit: '%', cap: '검수 시간이 **줄었다**', sub: '3개월 실측' }],
  ['B8', { patternEn: 'Constraint First', patternName: '제약 먼저', when: '초안이 매번 산으로 갈 때', lines: ['아래 제약을 지켜 초안 3개를 만들어줘.', '# 톤: 담백하게, 과장 금지', '- 길이: 각 [400]자', '- 금지: 최고/혁신 같은 표현'], effect: '반려가 절반으로 줄었다', ctaLine: '전문은 댓글에 "제약"' }],
  // B9의 shot은 운영자가 고르는 콘텐츠 이미지 — 그 안의 밝은 픽셀은 글자가 아니라서 대비 검사 제외
  ['B9', { shot: PHOTO_DARK, caption: '실제 검수 화면', callouts: [{ text: '여기서 반려', pos: 'tr' }] }, { skipContrast: true }],
  // ── P 계열 (사진 편집형) — 밝은 사진을 기본으로 넣어 스크림을 시험한다 ──
  ['P1', { eyebrow: 'OVERVIEW · 한눈에', lead: '검수 시간이 **70% 줄었다**', items: ['초안 작성이 40분 → 6분', '반려율은 그대로 12%', '툴 비용은 월 2만원'], image: PHOTO_BRIGHT }],
  ['P2', { eyebrow: 'AI TIP', heading: '온라인 클로드를\n오프라인으로', sub: '회의 기록을 자동으로 넘긴다', body: '클로드는 똑똑한데, 내가 참석한 회의나 오프라인 활동은 타이핑해 알려주기 전까진 전혀 모른다. 이 정보 격차를 메우는 방법이 조용히 퍼지고 있다.', image: PHOTO_BRIGHT }],
  ['P3', { label: '검수의 경제학', title: '검수 시간이 **70% 줄었다**', items: ['초안 작성이 40분 → 6분', '반려율은 그대로 12%'], footer: '@REVIEW LOOP', image: PHOTO_BRIGHT }],
  ['P4', { quote: '지시가 아니라 제약을 준다', attribution: '3개월 운영 기록', image: PHOTO_BRIGHT }],
  ['P5', { index: '02', eyebrow: '한눈에', lead: '검수 시간이 **70% 줄었다**', items: ['초안 작성이 40분 → 6분', '반려율은 그대로 12%', '툴 비용은 월 2만원'], footer: '@REVIEW LOOP', image: PHOTO_DARK }],
  ['P6', { kicker: '3개월 실측', big: '70%', resolve: '검수 시간이 **줄었다**\n반려율은 그대로였다', footer: '@REVIEW LOOP', image: PHOTO_DARK }],
];

/** sRGB → WCAG 상대휘도 */
function relLum(r, g, b) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

// ── 글자 판정 3중 필터 ──────────────────────────────────────
// 실측으로 배운 것: "글자처럼 보이는 픽셀"을 휘도 통계로 찾으면 사진 하이라이트·연한 패널·
// 라운드 칩이 전부 글자로 잡혀 흰 카드조차 FAIL이 난다. 그래서 글자를 이렇게 정의한다:
//   ① 균일색 — 렌더 글자는 단색이다(#fff, 골드, INK). 획 픽셀 휘도의 상위 스프레드가 좁아야 한다.
//      사진 하이라이트(창틀·하늘)는 0.7~1.0으로 퍼져서 여기서 걸러진다.
//   ② 전이 밀도 — 글자 획은 가늘어 행마다 on/off가 잦다. 면(패널·칩·구분선)은 행당 전이 ~2회.
//   ③ 질량 — 획 픽셀이 셀의 일정 범위(면이 아니고 노이즈도 아닌 양).
//
// 대비 검사는 **밝은 글자(흰/골드)만** 한다. 어두운 글자는 하드코딩 색(INK on 흰 카드)이라
// 대비 실패가 구조적으로 불가능하고, 검사 대상에 넣으면 오검출만 는다. 어두운 글자는
// 글자량(소실 검사)에만 집계한다.
const LIGHT_MIN_LUM = 0.6;   // 이보다 밝은 픽셀만 밝은 글자 후보
const DARK_MAX_LUM = 0.22;   // 이보다 어두운 픽셀만 어두운 글자 후보 (배경이 밝은 셀에서)
const UNIFORM_SPREAD = 0.07; // 코어 균일성: p95-p55 스프레드 상한
const MIN_STROKES = 130;     // 셀당 최소 획 픽셀 (이하면 소품/노이즈)
const TRANSITION_MIN = 0.15; // 전이/획 비율 하한 (면 배제)

function cellStats(vals) {
  vals.sort((a, b) => a - b);
  return vals;
}

/** 렌더 PNG에서 글자 셀을 특정하고 밝은 글자의 실대비·글자량·가장자리 침범을 잰다 */
async function analyze(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: CH } = info;
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < data.length; i += CH, p += 1)
    lum[p] = relLum(data[i], data[i + 1], data[i + 2]);

  const isGlyph = new Uint8Array(W * H);
  const lightCells = [];
  let glyphCells = 0;
  let worst = { contrast: Infinity, x: 0, y: 0, mass: 0 };

  const scan = (cx, cy, x1, y1, pick) => {
    // pick: (lum) => boolean — 후보 픽셀. 반환: {mask, vals, transitions}
    const mask = [];
    const vals = [];
    let transitions = 0;
    for (let y = cy; y < y1; y += 1) {
      let prev = 0;
      for (let x = cx; x < x1; x += 1) {
        const p = y * W + x;
        const hit = pick(lum[p]) ? 1 : 0;
        if (hit) {
          vals.push(lum[p]);
          mask.push(p);
        }
        if (hit !== prev) transitions += 1;
        prev = hit;
      }
    }
    return { mask, vals, transitions };
  };

  for (let cy = 0; cy < H; cy += CELL) {
    for (let cx = 0; cx < W; cx += CELL) {
      const x1 = Math.min(cx + CELL, W);
      const y1 = Math.min(cy + CELL, H);
      const total = (x1 - cx) * (y1 - cy);

      // ── 밝은 글자 후보 ──
      const light = scan(cx, cy, x1, y1, (l) => l >= LIGHT_MIN_LUM);
      if (
        light.vals.length >= MIN_STROKES &&
        light.vals.length <= total * 0.5 &&
        light.transitions / light.vals.length >= TRANSITION_MIN
      ) {
        const sorted = cellStats(light.vals.slice());
        const spread = pct(sorted, 0.95) - pct(sorted, 0.55);
        if (spread <= UNIFORM_SPREAD) {
          // 배경 = 후보를 뺀 나머지의 중앙값 (사진이면 사진 휘도 그대로)
          const bg = [];
          const inMask = new Set(light.mask);
          for (let y = cy; y < y1; y += 1)
            for (let x = cx; x < x1; x += 1) {
              const p = y * W + x;
              if (!inMask.has(p)) bg.push(lum[p]);
            }
          const c = contrast(pct(sorted, 0.9), pct(cellStats(bg), 0.5));
          lightCells.push({ x: cx, y: cy, contrast: c, mass: light.vals.length });
          glyphCells += 1;
          for (const p of light.mask) isGlyph[p] = 1;
          if (c < worst.contrast) worst = { contrast: c, x: cx, y: cy, mass: light.vals.length };
        }
      }

      // ── 어두운 글자 후보 (글자량 집계 + 가장자리 검사용, 대비 검사 없음) ──
      const cellMed = (() => {
        // 밝은 배경 셀에서만 의미 — 대충 중앙 샘플로 판정
        const s = [];
        for (let y = cy; y < y1; y += 4) for (let x = cx; x < x1; x += 4) s.push(lum[y * W + x]);
        return pct(cellStats(s), 0.5);
      })();
      if (cellMed >= 0.5) {
        const dark = scan(cx, cy, x1, y1, (l) => l <= DARK_MAX_LUM);
        if (
          dark.vals.length >= MIN_STROKES &&
          dark.vals.length <= total * 0.5 &&
          dark.transitions / dark.vals.length >= TRANSITION_MIN
        ) {
          glyphCells += 1;
          for (const p of dark.mask) isGlyph[p] = 1;
        }
      }
    }
  }

  // 오버플로 — 카드 가장자리 20px 띠에 글자 획이 닿았나
  let edgeHits = 0;
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1)
      if (isGlyph[y * W + x] && (x < 20 || y < 20 || x >= W - 20 || y >= H - 20)) edgeHits += 1;

  return { W, H, glyphCells, lightCells, worst, edgeHits };
}

// ── 소스 린트 — Satori가 조용히 무시하는 CSS ───────────────────
// 픽셀 검사로 잡으려다 실패한 부류다: backgroundSize:'cover'는 렌더가 200으로 성공하고
// 글자 대비도 멀쩡한데 사진만 타일링된다(2026-08-13 커버가 2×2 격자로 나감). 자기상관으로
// 주기성을 재봤지만 스크림 그라데이션이 주기를 깨면 못 잡았다 → 원인을 소스에서 금지하는 게 확실하다.
const FORBIDDEN = [
  {
    re: /backgroundImage:\s*(image \?\s*)?`url\(/g,
    why: 'Satori는 배경 CSS의 크기 지정을 무시하고 원본 크기로 타일링한다(px를 명시해도 동일) → 사진은 <img>+objectFit',
  },
  {
    re: /backgroundSize:\s*['"](cover|contain)['"]/g,
    why: "backgroundSize:'cover'는 Satori가 무시한다 → <img>+objectFit:'cover'",
  },
  {
    re: /color:\s*['"]inherit['"]/g,
    why: 'Satori는 color:\'inherit\'을 못 받아 검정으로 떨어진다 → 어두운 배경에서 글자가 사라짐. 색을 명시할 것',
  },
  {
    re: /(borderTop|borderBottom|borderLeft|borderRight|border):\s*undefined/g,
    why: '스타일 값 undefined는 Satori 파서를 죽여 응답이 통째로 끊긴다 → \'none\'을 명시할 것',
  },
];

async function lintSource() {
  const path = fileURLToPath(new URL('../lib/cardpress/templates.tsx', import.meta.url));
  const src = await readFile(path, 'utf8');
  const hits = [];
  for (const { re, why } of FORBIDDEN) {
    for (const m of src.matchAll(re)) {
      const line = src.slice(0, m.index).split('\n').length;
      hits.push(`templates.tsx:${line}  ${m[0]}\n         → ${why}`);
    }
  }
  return hits;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const lintHits = await lintSource();
  if (lintHits.length) {
    console.log('■ 소스 린트 — Satori 미지원 CSS');
    for (const h of lintHits) console.log('  ' + h);
    console.log('');
  }
  const rows = [];
  for (const [template, props, opts = {}] of SAMPLES) {
    if (ONLY.length && !ONLY.includes(template)) continue;
    const accent = template === 'C3' ? 'cat-tool' : template.startsWith('C') ? 'cat-case' : 'cat-trend';
    let res;
    try {
      res = await fetch(`${BASE}/api/cardpress/render`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cardpress-dev': '1' },
        body: JSON.stringify({ template, accent, props }),
      });
    } catch (e) {
      rows.push({ template, ok: false, why: `요청 실패: ${e.message}` });
      continue;
    }
    if (!res.ok) {
      rows.push({ template, ok: false, why: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` });
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(`${OUT}/${template}.png`, buf);
    const a = await analyze(buf);

    const problems = [];
    const warns = [];
    if (a.glyphCells < 6)
      problems.push(`글자 소실 의심 — 글자 셀 ${a.glyphCells}개 (배경과 같은 색으로 렌더됐을 수 있음)`);
    // 질량 있는 밝은 글자만 실패 사유로 (작은 라벨의 중간 대비는 경고까지만)
    const badLight = opts.skipContrast ? [] : a.lightCells.filter((c) => c.contrast < MIN_CONTRAST);
    const hard = badLight.filter((c) => c.mass >= 150 && c.contrast < 3.0);
    if (hard.length) {
      const w = hard.reduce((m, c) => (c.contrast < m.contrast ? c : m));
      problems.push(
        `밝은 글자 대비 ${w.contrast.toFixed(2)}:1 @ (${w.x},${w.y}) ${hard.length}셀 — 스크림/글자색 확인`
      );
    } else if (badLight.length) {
      const w = badLight.reduce((m, c) => (c.contrast < m.contrast ? c : m));
      warns.push(`대비 주의 ${w.contrast.toFixed(2)}:1 @ (${w.x},${w.y}) ${badLight.length}셀`);
    }
    if (a.edgeHits > 400) problems.push(`가장자리 침범 ${a.edgeHits}px — 오버플로`);

    rows.push({
      template,
      ok: problems.length === 0,
      why: [...problems, ...warns.map((w) => `⚠ ${w}`)].join(' / '),
      cells: a.glyphCells,
      worst: a.lightCells.length ? Math.min(...a.lightCells.map((c) => c.contrast)) : null,
    });
  }

  let fail = 0;
  console.log('템플릿  결과   글자셀  밝은글자 최저대비  비고');
  for (const r of rows) {
    if (!r.ok) fail += 1;
    console.log(
      `${r.template.padEnd(6)} ${(r.ok ? 'PASS' : 'FAIL').padEnd(6)} ${String(r.cells ?? '-').padStart(5)} ${
        r.worst != null ? r.worst.toFixed(2).padStart(12) : '           -'
      }  ${r.why ?? ''}`
    );
  }
  console.log(`\n${rows.length - fail}/${rows.length} 통과 · 소스 린트 위반 ${lintHits.length}건 · PNG: ${OUT}`);
  process.exit(fail || lintHits.length ? 1 : 0);
}

main();
