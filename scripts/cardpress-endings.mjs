// 엔딩 카드(채널 안내형)가 쓰는 "본가 화면" 자산을 다시 만든다.
//
// 왜 스크립트인가: 카드 문구는 lib/cardpress/endings.ts에 고정돼 있고, 이미지·영상은
// 같은 공개 URL(cardpress/endings/*)을 upsert로 덮어쓴다.
// 본가 디자인이 바뀌면 이것만 다시 돌리면 되고, 발행 코드·저장된 카드는 손대지 않아도 된다.
//
// 실행: node scripts/cardpress-endings.mjs             (캡처 → 합성 → 영상 → 업로드)
//       node scripts/cardpress-endings.mjs --no-video  (영상 빼고)
//       node scripts/cardpress-endings.mjs --no-upload (로컬 파일만)
//       node scripts/cardpress-endings.mjs --skip-capture (본가 재캡처 없이 문구·레이아웃만)
// 산출물: .cardpress-endings/ (임시 — 원본은 버킷)
//
// 영상이 왜 필요한가: 링크 안에 뭐가 있는지는 "보여주는" 게 제일 세고, 인스타 캐러셀은
// 이미지와 영상을 섞을 수 있다. Satori(next/og)는 애니메이션을 못 그리므로
// 카드 레이아웃을 여기서 CSS로 한 벌 더 들고 있다 — B9 템플릿과 모양을 맞춰 둘 것.

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, '.cardpress-endings');
const FRAMES = path.join(OUT, 'frames');
const BASE = process.env.CASELAB_MAIN_URL || 'https://caselab-five.vercel.app';
const UPLOAD = !process.argv.includes('--no-upload');
const VIDEO = !process.argv.includes('--no-video');
const SKIP_CAPTURE = process.argv.includes('--skip-capture'); // 문구만 고칠 때 재캡처 생략

// .env.local 직접 파싱 (next 런타임 밖에서 도는 스크립트)
if (existsSync(path.join(ROOT, '.env.local'))) {
  for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const PAGES = [
  { id: 'home-mobile', url: '/', width: 430, height: 932 },
  { id: 'home-mobile-full', url: '/', width: 430, height: 932, fullPage: true },
  { id: 'tools-desktop', url: '/tools', width: 1440, height: 900 },
  { id: 'cases-desktop', url: '/cases', width: 1440, height: 900 },
  { id: 'prompts-desktop', url: '/prompts', width: 1440, height: 900 },
  { id: 'ebooks-desktop', url: '/ebooks', width: 1440, height: 900 },
];

// 정지 목업 — 캡처를 그대로 카드에 넣으면 "웹사이트 스크린샷"으로 보인다.
// 프레임을 씌워야 "내 링크에 있는 화면"으로 읽힌다.
const COMPOSE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Pretendard","Apple SD Gothic Neo",sans-serif}
.stage{position:relative;overflow:hidden}
.win{width:1080px;height:660px;background:linear-gradient(160deg,#EFEBE2,#DED8CB);display:flex;align-items:center;justify-content:center}
.win .chrome{width:940px;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 30px 60px rgba(0,0,0,.28)}
.win .bar{height:38px;background:#F1F1F3;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid #E2E2E6}
.win .dot{width:11px;height:11px;border-radius:50%}
.win .url{margin-left:14px;font-size:12.5px;color:#8A8A92;background:#fff;border:1px solid #E4E4E8;border-radius:7px;padding:3px 14px}
.win .shot{height:470px;overflow:hidden}.win .shot img{width:100%;display:block}
#menus-wide{width:1080px;height:440px;background:#15151A;padding:18px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
#menus-wide .cell{position:relative;border-radius:12px;overflow:hidden;background:#fff}
#menus-wide .cell img{width:100%;display:block}
#menus-wide .tag{position:absolute;left:0;right:0;bottom:0;padding:12px;text-align:center;color:#fff;font-size:21px;font-weight:700;background:linear-gradient(transparent,rgba(0,0,0,.88) 55%)}
</style></head><body>
<div class="stage win" id="win-tools"><div class="chrome"><div class="bar">
  <span class="dot" style="background:#FF5F57"></span><span class="dot" style="background:#FEBC2E"></span><span class="dot" style="background:#28C840"></span>
  <span class="url">caselab.kr / tools</span></div><div class="shot"><img src="tools-desktop.png"></div></div></div>
<div class="stage win" id="win-prompts"><div class="chrome"><div class="bar">
  <span class="dot" style="background:#FF5F57"></span><span class="dot" style="background:#FEBC2E"></span><span class="dot" style="background:#28C840"></span>
  <span class="url">caselab.kr / prompts</span></div><div class="shot"><img src="prompts-desktop.png"></div></div></div>
<div class="stage" id="menus-wide">
  <div class="cell"><img src="tools-desktop.png"><div class="tag">AI 자료실</div></div>
  <div class="cell"><img src="cases-desktop.png"><div class="tag">AI 실전케이스</div></div>
  <div class="cell"><img src="prompts-desktop.png"><div class="tag">바로 쓰는 프롬프트</div></div>
  <div class="cell"><img src="ebooks-desktop.png"><div class="tag">ebook</div></div>
</div></body></html>`;

const COMPOSITES = ['win-tools', 'win-prompts', 'menus-wide'];

// 영상/정지 공용 — 1080×1350 엔딩 카드를 CSS로 재현한 것(Satori는 애니메이션 불가).
// .media 영역만 잘라내면 정지 목업, 통째로 프레임을 찍으면 영상 슬라이드가 된다.
//
// 문구 방침: "링크 눌러보세요"가 아니라 **이 계정이 뭘 모아 두는 곳인지**를 말한다.
// 링크 안내는 링크 유도형(B2)의 몫이고, 채널 안내형은 각인 → 팔로우가 목적이다.
// 메뉴 4줄은 본가 GNB와 1:1이어야 한다(바뀌면 여기와 endings.ts의 B2 bullets를 같이 수정).
const CARD_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Pretendard","Apple SD Gothic Neo",sans-serif;background:#333}
#card{width:1080px;height:1350px;background:linear-gradient(155deg,#0E0E11 0%,#000 62%);color:#fff;padding:76px 68px 68px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{display:flex;align-items:baseline;justify-content:space-between}
.brand{font-size:30px;font-weight:800;letter-spacing:-.02em}
.handle{font-size:24px;font-weight:600;color:#8A8A92}
.headline{margin-top:6px;font-size:66px;line-height:1.24;font-weight:800;letter-spacing:-.035em;color:#fff}
.headline .hl{color:#4E90F5}
.sub{margin-top:16px;font-size:30px;line-height:1.5;color:#55555E}
.media{margin-top:30px;flex:1;overflow:hidden;position:relative;display:flex;align-items:center}
/* 왼쪽 = 메뉴 목록(순차 등장), 오른쪽 = 스크롤되는 폰 */
.menus{width:540px;padding:0 8px 0 0;display:flex;flex-direction:column;gap:0}
.m{opacity:0;transform:translateY(14px);padding:22px 0;border-bottom:1px solid rgba(255,255,255,.14);display:flex;gap:18px;align-items:baseline}
.m:last-child{border-bottom:0}
.m .idx{font-size:22px;font-weight:800;color:#4E90F5;font-variant-numeric:tabular-nums;flex-shrink:0}
.m .n{font-size:39px;font-weight:800;letter-spacing:-.025em;color:#fff}
.m .d{margin-top:5px;font-size:23px;color:rgba(255,255,255,.62)}
.phonewrap{flex:1;display:flex;justify-content:center}
/* 기울기 — 정면 스크린샷과 "책상 위 실물"을 가르는 지점 */
.phone{width:368px;border-radius:38px;padding:8px;background:#1A1A1F;box-shadow:0 40px 80px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.08);
       transform:perspective(1500px) rotateY(-8deg) rotateX(2.5deg) rotate(-1.4deg)}
.screen{position:relative;border-radius:32px;overflow:hidden;height:668px;background:#fff}
.screen .strip{position:absolute;left:0;top:0;width:100%;will-change:transform}
.screen img{width:100%;display:block}
/* 상태바는 불투명 — 반투명이면 스크롤된 본문이 비쳐 잘린 글자가 보인다 */
.status{position:absolute;left:0;right:0;top:0;height:34px;z-index:3;display:flex;align-items:center;justify-content:space-between;
        padding:0 16px;font-size:11px;font-weight:700;color:#16161A;background:#fff}
.status .r{display:flex;gap:4px;align-items:center}
.bar{width:2.5px;background:#16161A;border-radius:1px}
.batt{width:17px;height:9px;border:1.4px solid #16161A;border-radius:3px;position:relative}
.batt:after{content:"";position:absolute;left:1.4px;top:1.4px;bottom:1.4px;width:9px;background:#16161A;border-radius:1px}
/* 유리 반사 — 없으면 아무리 기울여도 "이미지 붙인 것"으로 보인다 */
.glare{position:absolute;inset:0;z-index:4;pointer-events:none;border-radius:32px;
       background:linear-gradient(112deg,rgba(255,255,255,.34) 0%,rgba(255,255,255,.10) 22%,rgba(255,255,255,0) 46%)}
.track{position:absolute;right:5px;top:42px;bottom:12px;width:3px;border-radius:2px;z-index:4;background:rgba(0,0,0,.06)}
.thumb{position:absolute;right:0;width:3px;border-radius:2px;background:rgba(0,0,0,.28)}
.foot{margin-top:22px;font-size:24px;color:#8A8A92}
</style></head><body>
<div id="card">
  <div class="headline">AI, 뭐부터 볼지 막막하다면<br><span class="hl">검증된 AI 큐레이션</span> 케이스랩</div>
  <div class="media">
    <div class="menus">
      <div class="m" id="m0"><span class="idx">01</span><div><div class="n">AI 자료실</div><div class="d">일 종류별로 모은 도구</div></div></div>
      <div class="m" id="m1"><span class="idx">02</span><div><div class="n">AI 실전케이스</div><div class="d">남이 실제로 해본 과정</div></div></div>
      <div class="m" id="m2"><span class="idx">03</span><div><div class="n">바로 쓰는 프롬프트</div><div class="d">복사해서 그대로 쓰는 문장</div></div></div>
      <div class="m" id="m3"><span class="idx">04</span><div><div class="n">ebook</div><div class="d">한 주제를 처음부터 끝까지</div></div></div>
    </div>
    <div class="phonewrap"><div class="phone"><div class="screen">
      <div class="status"><span>9:41</span><span class="r">
        <span class="bar" style="height:5px"></span><span class="bar" style="height:7px"></span>
        <span class="bar" style="height:9px"></span><span class="bar" style="height:11px"></span>
        <span class="batt"></span></span></div>
      <div class="strip" id="strip"><img src="home-mobile-full.png"></div>
      <div class="track"><div class="thumb" id="thumb" style="top:0;height:86px"></div></div>
      <div class="glare"></div>
    </div></div></div>
  </div>
</div>
<script>
  const strip=document.getElementById('strip'), thumb=document.getElementById('thumb');
  const menus=[0,1,2,3].map(i=>document.getElementById('m'+i));
  const TRAVEL=1240;
  const ease=(t)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  // 메뉴는 스크롤과 함께 하나씩 올라온다 — 정지 목업(t 고정)에서는 전부 보이게 t를 크게 준다
  const APPEAR=[0.02,0.16,0.30,0.44], SPAN=0.16;
  window.setScroll=(t)=>{
    const e=ease(Math.min(1,Math.max(0,t)));
    strip.style.transform='translateY('+(-TRAVEL*e)+'px)';
    thumb.style.top=(e*(668-34-12-86))+'px';
    menus.forEach((el,i)=>{
      const p=Math.min(1,Math.max(0,(t-APPEAR[i])/SPAN));
      const q=1-Math.pow(1-p,3);
      el.style.opacity=q;
      el.style.transform='translateY('+((1-q)*14)+'px)';
    });
  };
  window.setScroll(0);
</script></body></html>`;

// 프로필 링크 목업 — 링크 유도형 엔딩이 쓰는 화면.
// 왜 실캡처가 아닌가: 로그아웃 상태의 instagram.com은 로그인 모달이 덮고 링크 자리도 안 보인다
// (2026-08-17 확인). 그래서 **실제 계정 정보(Graph API)** 로 프로필 화면을 다시 그리고
// 링크 자리만 링·화살표로 강조한다. 팔로워 수·인스타 로고는 넣지 않는다(꾸민 수치가 되지 않게).
function profileHtml(ig) {
  const bio = (ig.biography || '').split('\n').filter(Boolean);
  const site = (ig.website || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Pretendard","Apple SD Gothic Neo",sans-serif}
#profile{width:1080px;height:820px;background:linear-gradient(160deg,#F4F1EA,#E8E2D6);display:flex;align-items:center;justify-content:center;position:relative}
.phone{width:404px;border-radius:42px;padding:9px;background:#101014;box-shadow:0 34px 60px rgba(0,0,0,.34),0 4px 12px rgba(0,0,0,.22);
       transform:perspective(1600px) rotateY(-6deg) rotateX(2deg) rotate(-1deg)}
.screen{position:relative;border-radius:35px;overflow:hidden;height:602px;background:#fff;padding:0 20px}
.status{height:44px;display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:700;color:#16161A}
.status .r{display:flex;gap:4px;align-items:center}
.bar{width:2.5px;background:#16161A;border-radius:1px}
.batt{width:18px;height:9px;border:1.4px solid #16161A;border-radius:3px;position:relative}
.batt:after{content:"";position:absolute;left:1.4px;top:1.4px;bottom:1.4px;width:10px;background:#16161A;border-radius:1px}
.head{display:flex;align-items:center;gap:16px;margin-top:14px}
.avatar{width:78px;height:78px;border-radius:50%;overflow:hidden;background:#DDD;flex-shrink:0}
.avatar img{width:100%;height:100%;object-fit:cover;display:block}
.who .handle{font-size:19px;font-weight:800;letter-spacing:-.01em}
.who .name{margin-top:2px;font-size:14px;color:#6B6B74}
.bio{margin-top:14px;font-size:13.5px;line-height:1.62;color:#2C2C33}
.bio div+div{margin-top:1px}
/* 링크 자리 — 이 카드의 전부. 링(골드)과 화살표로 시선을 여기로 몬다 */
.linkwrap{margin-top:36px;position:relative}
.link{display:flex;align-items:center;gap:8px;padding:13px 15px;border-radius:12px;background:#EFF5FF;
      border:2px solid #1B64DA;box-shadow:0 0 0 6px rgba(27,100,218,.22);font-size:14.5px;font-weight:700;color:#1B64DA}
.link .ic{font-size:14px}
.arrow{position:absolute;right:2px;top:-32px;display:flex;align-items:center;gap:6px;color:#1B64DA;font-size:14px;font-weight:800}
.arrow .tail{font-size:22px;line-height:1}
.btns{margin-top:18px;display:flex;gap:8px}
.btn{flex:1;text-align:center;padding:10px 0;border-radius:9px;background:#F1F1F3;font-size:13px;font-weight:700;color:#3A3A42}
.tabs{margin-top:22px;border-top:1px solid #EAEAEE;display:flex;justify-content:space-around;padding-top:12px;font-size:12px;color:#9A9AA2}
.grid{margin-top:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:3px;opacity:.6}
.cell{aspect-ratio:1;background:#EFEFF2;border-radius:2px}
.glare{position:absolute;inset:0;pointer-events:none;border-radius:35px;
       background:linear-gradient(112deg,rgba(255,255,255,.30) 0%,rgba(255,255,255,.08) 22%,rgba(255,255,255,0) 46%)}
</style></head><body>
<div id="profile"><div class="phone"><div class="screen">
  <div class="status"><span>9:41</span><span class="r">
    <span class="bar" style="height:5px"></span><span class="bar" style="height:7px"></span>
    <span class="bar" style="height:9px"></span><span class="bar" style="height:11px"></span>
    <span class="batt"></span></span></div>
  <div class="head">
    <div class="avatar"><img src="avatar.png"></div>
    <div class="who"><div class="handle">${ig.username ? '@' + ig.username : '@caselab_ai_'}</div>
      <div class="name">${ig.name || ''}</div></div>
  </div>
  <div class="bio">${bio.map((l) => `<div>${l}</div>`).join('')}</div>
  <div class="linkwrap">
    <div class="arrow"><span>여기 눌러서</span><span class="tail">↘</span></div>
    <div class="link"><span class="ic">🔗</span><span>${site}</span></div>
  </div>
  <div class="btns"><div class="btn">팔로우</div><div class="btn">메시지</div></div>
  <div class="tabs"><span>게시물</span><span>릴스</span><span>태그</span></div>
  <div class="grid">${'<div class="cell"></div>'.repeat(3)}</div>
  <div class="glare"></div>
</div></div></div></body></html>`;
}

// 링크 유도형 카드 전체(1080×1350) — 문구를 위에, 프로필 화면을 아래에 크게.
// 왜 Satori가 아니라 합성인가: "큰 문구 + 확대해서 잘린 실화면"을 한 장에 담는 템플릿이 없다.
// 카드 전체를 이미지로 만들어 엔딩(kind:'image')으로 붙인다 — 영상 엔딩과 같은 방식.
//
// 크롭 규칙: 화면은 **아래로만** 잘린다(scale은 키우되 가로는 프레임 안에 맞춤).
// 프로필 사진·바이오·링크 칩이 하나라도 잘리면 "어디를 누르라"는 이 카드의 목적이 무너진다.
function linkSplitHtml(ig) {
  const bio = (ig.biography || '').split('\n').filter(Boolean);
  const site = (ig.website || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Pretendard","Apple SD Gothic Neo",sans-serif}
#linksplit{width:1080px;height:1350px;background:linear-gradient(155deg,#0E0E11 0%,#000 62%);
           color:#fff;display:flex;flex-direction:column;overflow:hidden;position:relative;padding:78px 68px 0}
.headline{font-size:84px;line-height:1.16;font-weight:800;letter-spacing:-.04em}
.headline .hl{color:#4E90F5}
/* 아래로만 흘러나가게 — 가로는 프레임 안 */
.media{flex:1;position:relative;overflow:hidden;margin:40px -24px 0}
.phone{position:absolute;left:50%;top:0;width:478px;transform-origin:top center;
       transform:translateX(-50%) scale(2.06);
       border-radius:46px;padding:10px;background:#1A1A1F;
       box-shadow:0 40px 90px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.10)}
.screen{position:relative;border-radius:38px;overflow:hidden;height:392px;background:#fff;padding:0 22px;color:#16161A}
.status{height:44px;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700}
.status .r{display:flex;gap:4px;align-items:center}
.bar{width:2.5px;background:#16161A;border-radius:1px}
.batt{width:19px;height:10px;border:1.5px solid #16161A;border-radius:3px;position:relative}
.batt:after{content:"";position:absolute;left:1.5px;top:1.5px;bottom:1.5px;width:10px;background:#16161A;border-radius:1px}
.head{display:flex;align-items:center;gap:16px;margin-top:12px}
.avatar{width:86px;height:86px;border-radius:50%;overflow:hidden;background:#DDD;flex-shrink:0}
.avatar img{width:100%;height:100%;object-fit:cover;display:block}
.who .handle{font-size:21px;font-weight:800;letter-spacing:-.01em}
.who .name{margin-top:3px;font-size:15px;color:#6B6B74}
.bio{margin-top:16px;font-size:15.5px;line-height:1.6;color:#2C2C33}
.linkwrap{margin-top:30px;margin-bottom:18px;position:relative}
.link{display:flex;align-items:center;gap:9px;padding:15px 17px;border-radius:14px;background:#EFF5FF;
      border:3px solid #1B64DA;box-shadow:0 0 0 7px rgba(27,100,218,.24);font-size:17px;font-weight:700;color:#1B64DA}
.arrow{position:absolute;right:4px;top:-34px;display:flex;align-items:center;gap:7px;color:#1B64DA;font-size:17px;font-weight:800}
.glare{position:absolute;inset:0;pointer-events:none;border-radius:38px;
       background:linear-gradient(112deg,rgba(255,255,255,.24) 0%,rgba(255,255,255,.06) 24%,rgba(255,255,255,0) 48%)}
</style></head><body>
<div id="linksplit">
  <div class="headline"><span class="hl">프로필 링크</span>에서<br>확인할 수 있어요</div>
  <div class="media">
    <div class="phone"><div class="screen">
      <div class="status"><span>9:41</span><span class="r">
        <span class="bar" style="height:5px"></span><span class="bar" style="height:7px"></span>
        <span class="bar" style="height:9px"></span><span class="bar" style="height:11px"></span>
        <span class="batt"></span></span></div>
      <div class="head">
        <div class="avatar"><img src="avatar.png"></div>
        <div class="who"><div class="handle">${ig.username ? '@' + ig.username : '@caselab_ai_'}</div>
          <div class="name">${ig.name || ''}</div></div>
      </div>
      <div class="bio">${bio.map((l) => `<div>${l}</div>`).join('')}</div>
      <div class="linkwrap">
        <div class="arrow"><span>여기</span><span>↘</span></div>
        <div class="link"><span>🔗</span><span>${site}</span></div>
      </div>
      <div class="glare"></div>
    </div></div>
  </div>
</div></body></html>`;
}

const FPS = 24;
const SECONDS = 4; // 인스타 피드 영상 최소 3초
const HOLD = 12; // 앞뒤 정지 구간 — 루프가 튀지 않게

await mkdir(FRAMES, { recursive: true });
const browser = await chromium.launch();

for (const p of SKIP_CAPTURE ? [] : PAGES) {
  const ctx = await browser.newContext({
    viewport: { width: p.width, height: p.height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + p.url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  if (p.fullPage) {
    // lazy 이미지가 다 뜨도록 한 번 훑고 맨 위로
    await page.evaluate(async () => {
      for (let y = 0; y < 6000; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: path.join(OUT, `${p.id}.png`), fullPage: !!p.fullPage });
  console.log(`✓ 캡처 ${p.id}`);
  await ctx.close();
}

// ── 정지 합성 ──
await writeFile(path.join(OUT, 'compose.html'), COMPOSE_HTML);
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
await page.goto('file://' + path.join(OUT, 'compose.html'), { waitUntil: 'networkidle' });
for (const id of COMPOSITES) {
  await page.locator('#' + id).screenshot({ path: path.join(OUT, `comp-${id}.png`) });
  console.log(`✓ 합성 comp-${id}`);
}
await ctx.close();

// ── 프로필 링크 목업 (실제 계정 정보) ──
const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
let profileMade = false;
if (igToken) {
  try {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=username,name,biography,website,profile_picture_url&access_token=${igToken}`
    );
    const ig = await res.json();
    if (ig.error) throw new Error(ig.error.message);
    const pic = await fetch(ig.profile_picture_url);
    await writeFile(path.join(OUT, 'avatar.png'), Buffer.from(await pic.arrayBuffer()));
    await writeFile(path.join(OUT, 'profile.html'), profileHtml(ig));
    const pctx = await browser.newContext({ viewport: { width: 1120, height: 900 } });
    const ppage = await pctx.newPage();
    await ppage.goto('file://' + path.join(OUT, 'profile.html'), { waitUntil: 'networkidle' });
    await ppage.waitForTimeout(400);
    await ppage.locator('#profile').screenshot({ path: path.join(OUT, 'comp-profile-link.png') });
    // 링크 유도형 카드 전체(합성) — 같은 계정 정보를 재사용
    await writeFile(path.join(OUT, 'linksplit.html'), linkSplitHtml(ig));
    const lpage = await pctx.newPage();
    await lpage.goto('file://' + path.join(OUT, 'linksplit.html'), { waitUntil: 'networkidle' });
    await lpage.waitForTimeout(400);
    await lpage.locator('#linksplit').screenshot({ path: path.join(OUT, 'comp-link-split.png') });
    await lpage.close();
    console.log('✓ 합성 comp-link-split');
    await pctx.close();
    profileMade = true;
    console.log(`✓ 합성 comp-profile-link (@${ig.username})`);
  } catch (e) {
    console.log(`✗ 프로필 목업 건너뜀: ${e.message.split('\n')[0]}`);
  }
} else {
  console.log('· INSTAGRAM_ACCESS_TOKEN 없음 — 프로필 목업 건너뜀');
}

// ── 폰 목업(정지) + 영상 프레임 ──
await writeFile(path.join(OUT, 'card.html'), CARD_HTML);
const cardCtx = await browser.newContext({ viewport: { width: 1120, height: 1400 } });
const cardPage = await cardCtx.newPage();
await cardPage.goto('file://' + path.join(OUT, 'card.html'), { waitUntil: 'networkidle' });
await cardPage.waitForTimeout(600);

// 정지 목업: 말풍선은 B9 props가 그리므로 이미지에서는 뺀다(이중으로 나가면 안 됨)
await cardPage.evaluate(() => {
  document.querySelectorAll('.callout').forEach((e) => e.remove());
  window.setScroll(0.62);
});
await cardPage.waitForTimeout(250);
await cardPage.locator('.media').screenshot({ path: path.join(OUT, 'comp-phone-live.png') });
console.log('✓ 합성 comp-phone-live');

const videoFiles = [];
if (VIDEO) {
  await cardPage.reload({ waitUntil: 'networkidle' });
  await cardPage.waitForTimeout(600);
  const total = FPS * SECONDS;
  const card = cardPage.locator('#card');
  for (let i = 0; i < total; i++) {
    const t = Math.min(1, Math.max(0, (i - HOLD) / (total - HOLD * 2)));
    await cardPage.evaluate((v) => window.setScroll(v), t);
    await card.screenshot({ path: path.join(FRAMES, `f${String(i).padStart(3, '0')}.png`) });
  }
  console.log(`✓ 영상 프레임 ${total}장`);

  // 무음 AAC 트랙을 넣는다 — 오디오 없는 mp4는 IG 처리 단계에서 실패한 사례가 있다
  try {
    execFileSync(
      'ffmpeg',
      // prettier-ignore
      ['-y','-loglevel','error','-framerate',String(FPS),'-i',path.join(FRAMES,'f%03d.png'),
       '-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100',
       '-c:v','libx264','-pix_fmt','yuv420p','-profile:v','high','-level','4.0','-crf','20',
       '-c:a','aac','-b:a','96k','-shortest','-movflags','+faststart',
       path.join(OUT,'ending-live.mp4')],
      { stdio: 'inherit' }
    );
    await writeFile(path.join(OUT, 'ending-live-poster.png'), await readFile(path.join(FRAMES, 'f000.png')));
    videoFiles.push(['ending-live.mp4', 'video/mp4'], ['ending-live-poster.png', 'image/png']);
    console.log('✓ ending-live.mp4');
  } catch (e) {
    console.log(`✗ ffmpeg 실패(영상 건너뜀): ${e.message.split('\n')[0]}`);
  }
}

await browser.close();
if (!UPLOAD) process.exit(0);

// ── 업로드 (같은 경로 upsert — endings.ts의 URL은 그대로 유지된다) ──
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const uploads = [
  ...COMPOSITES.map((id) => [`comp-${id}.png`, 'image/png']),
  ['comp-phone-live.png', 'image/png'],
  ...(profileMade
    ? [
        ['comp-profile-link.png', 'image/png'],
        // 링크 유도형 스플릿 시안 2종(문구 세로 가운데 / 위) — 채택되면 endings.ts가 이 URL을 참조한다
        ['comp-link-split.png', 'image/png'],
      ]
    : []),
  ...videoFiles,
];
for (const [name, contentType] of uploads) {
  const file = `endings/${name}`;
  const { error } = await admin.storage
    .from('cardpress')
    .upload(file, await readFile(path.join(OUT, name)), { contentType, upsert: true });
  if (error) {
    console.log(`✗ 업로드 ${name}: ${error.message}`);
    continue;
  }
  console.log(`✓ ${admin.storage.from('cardpress').getPublicUrl(file).data.publicUrl}`);
}
