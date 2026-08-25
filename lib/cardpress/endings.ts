// 마지막 장(엔딩 카드) — CTA 유형에서 파생되는 "닫는 카드".
//
// 왜 슬라이드 배열에 저장하지 않나: 엔딩은 소재가 아니라 **채널의 것**이라 매번 같다.
// slides에 넣어두면 카드마다 복사본이 생겨, 문구 한 줄을 고치는 순간 과거 카드와 갈라진다.
// 그래서 cta_type에서 발행 시점에 파생시킨다 — 유형을 바꾸면 그 자리에서 다른 엔딩이 붙는다.
//
// 채널 안내형만 영상인 이유: 링크 안에 뭐가 있는지는 "보여주는" 게 제일 세다.
// Satori(next/og)는 애니메이션을 못 그리므로 이 영상은 미리 만들어 버킷에 둔 고정 자산이고,
// 본가 디자인이 바뀌면 scripts/cardpress-endings.mjs 로 다시 만들어 같은 경로에 덮어쓴다.

import { INSTAGRAM_HANDLE } from '@/lib/constants';
import { userTokens } from '@/lib/tokens';
import { ACCENTS } from './templates';
import type { CardCtaType } from './cta-endings';
import type { CardAccent, CardSlide, CardTemplateId, EndingProps } from '@/types/cardpress';

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/cardpress/endings`;

export const ENDING_ASSETS = {
  /** 본가 홈이 실제로 스크롤되는 4초 루프 (1080×1350 · h264 + 무음 AAC) */
  video: `${BASE}/ending-live.mp4`,
  poster: `${BASE}/ending-live-poster.png`,
  /** 정지 목업 — 기울기·유리반사·상태바까지 합성된 폰 화면 */
  phoneLive: `${BASE}/comp-phone-live.png`,
  /** 본가 메뉴 4개 가로 스트립 */
  menusWide: `${BASE}/comp-menus-wide.png`,
  /** 프로필 화면 목업 — 링크 자리를 링·화살표로 강조(실제 계정 정보로 합성) */
  profileLink: `${BASE}/comp-profile-link.png`,
  /** 링크 유도형 카드 **전체** 이미지 — 문구 위 + 프로필 화면 크게(합성) */
  linkCard: `${BASE}/comp-link-split.png`,
};

/** 인스타 핸들 — lib/constants.ts 단일 정의(@ai_caselab). 카드에 잘못 박히면 유입이 끊긴다 */
const IG_HANDLE = INSTAGRAM_HANDLE;

/** DM형 포인트색 기본값 — 카드의 **카테고리색**을 따라간다 (2026-08-25 변경).
 *  전에는 브랜드 파랑(#1B64DA) 고정이었는데, 본문 슬라이드와 톤이 갈라지고
 *  카드별로 색을 못 바꾸는 게 문제였다. 이제 ending_props.accentColor로 카드별 오버라이드 가능. */
// accent를 모르는 호출자(구버전 경로)를 위한 최후 폴백 — 기존 브랜드 파랑 유지
const BRAND = userTokens.accentHover; // #1B64DA

export type EndingCard =
  | { kind: 'video'; label: string; note: string; videoUrl: string; posterUrl: string }
  // 미리 합성해 둔 카드 한 장. Satori 템플릿으로 못 만드는 레이아웃(큰 문구 + 확대한 실화면)용.
  | { kind: 'image'; label: string; note: string; imageUrl: string }
  | {
      kind: 'slide';
      label: string;
      note: string;
      template: CardTemplateId;
      props: Record<string, unknown>;
    };

/** 댓글 키워드가 비어 있을 때의 기본값 — generate.ts와 같은 값 */
const FALLBACK_KEYWORD = '프롬프트';

/** 카드 슬라이드에서 엔딩 배경으로 쓸 커버 이미지를 찾는다 — 켜진 장 중 앞에서부터.
 *  커버(C계열)는 coverImage, 본문(P/B계열)은 image 키를 쓴다. 없으면 undefined(민짜 다크 폴백). */
export function coverImageOf(slides: CardSlide[] | null | undefined): string | undefined {
  for (const s of slides ?? []) {
    if (!s.enabled) continue;
    const p = s.props as Record<string, unknown>;
    const url = p.coverImage ?? p.image;
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
  }
  return undefined;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function endingFor(
  ctaType: CardCtaType,
  opts?: {
    ctaKeyword?: string | null;
    /** 카드 카테고리 — DM형 포인트색 기본값(카테고리색). 없으면 브랜드 파랑 폴백 */
    accent?: CardAccent | null;
    /** 카드 커버 이미지 — DM형 배경 기본값. 없으면 민짜 다크 */
    coverImage?: string | null;
    /** content_cards.ending_props — 카드별 오버라이드(색·배경·오버레이) */
    overrides?: EndingProps | null;
  }
): EndingCard {
  const keyword = opts?.ctaKeyword?.trim() || FALLBACK_KEYWORD;

  // 링크 유도형 — "링크 안에 뭐가 있다"보다 **어디를 눌러야 하는지**가 병목이다.
  // 인스타 캡션의 URL은 클릭이 안 되고 프로필 링크가 유일한 출구이므로, 그 자리를 화면으로 짚어준다.
  if (ctaType === 'info_save')
    return {
      kind: 'image',
      label: '프로필 링크 안내',
      note: '"프로필 링크에서 확인할 수 있어요" + 프로필 화면을 크게. 링크 자리를 링·화살표로 짚어줍니다.',
      // Satori 템플릿이 아니라 합성 카드다 — 큰 문구 위 + 확대한 실화면 아래 레이아웃이
      // 기존 20개 템플릿에 없다. 문구도 이미지에 구워져 있어 수정은 scripts/cardpress-endings.mjs.
      imageUrl: ENDING_ASSETS.linkCard,
    };

  // 댓글 참여형 — 댓글에 적을 단어를 화면에서 제일 큰 요소로(P6 빅넘버 자리에 키워드).
  // 캡션을 펼치지 않는 사람에게도 트리거가 보여야 자동화가 돈다.
  if (ctaType === 'comment_dm') {
    const ov = opts?.overrides ?? {};
    // 포인트색: 카드별 오버라이드 > 카테고리색 > 브랜드 파랑(구버전 폴백)
    const accentColor =
      (ov.accentColor && HEX.test(ov.accentColor) && ov.accentColor) ||
      (opts?.accent ? ACCENTS[opts.accent] : BRAND);
    // 배경: 오버라이드 > 카드 커버 재사용(캐러셀 톤이 이어지고 엣지가 생긴다) > 민짜 다크
    const image = ov.image || opts?.coverImage || undefined;
    return {
      kind: 'slide',
      label: '댓글 참여 안내',
      note: `댓글 키워드("${keyword}")가 카드에서 제일 크게 들어갑니다. 리틀리 자동화에 같은 키워드를 세팅해야 DM이 갑니다.`,
      template: 'P6',
      props: {
        // kicker·footer 같은 잔글씨는 두지 않는다 — 키워드 하나만 남기는 게 이 카드의 일
        big: keyword,
        // 230px 풀사이즈는 키워드에 너무 컸다 — 한 방은 유지하되 카드가 글자에 먹히지 않게
        bigMax: 150,
        // 안내문 오버라이드 — 빈 문자열은 "줄 삭제"인데 P6 스키마가 min(1)이라 공백 하나로 눕힌다
        resolve: (ov.resolve ?? '댓글에 이 단어만 남기면 **DM**으로 보내드려요') || ' ',
        accentColor,
        ...(image
          ? {
              image,
              // P6 기본 0.82는 배경이 거의 안 보인다 — 사진 위 텍스트 대비를 지키는 선에서 낮춘다
              overlay: ov.overlay ?? 0.62,
            }
          : {}),
      },
    };
  }

  return {
    kind: 'video',
    label: '채널 안내 (영상)',
    note: '본가 홈이 실제로 스크롤되는 4초 루프. 캐러셀 마지막 칸에 영상으로 올라갑니다.',
    videoUrl: ENDING_ASSETS.video,
    posterUrl: ENDING_ASSETS.poster,
  };
}

export const ENDING_LABEL: Record<CardCtaType, string> = {
  channel_intro: '채널 안내 (영상)',
  info_save: '프로필 링크 안내',
  comment_dm: '댓글 참여 안내',
};
