import {
  LayoutDashboard,
  Sparkles,
  FileText,
  Users,
  BookOpen,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * 사이드바 IA (2026-06-26 재정리)
 *
 * 좌측에는 대분류 5개만 노출하고, 하위 페이지는 각 섹션 진입 후 상단 탭으로 묶는다.
 * (기존 5그룹·24항목 평면 나열 → 좌측 5 + 섹션 탭)
 *
 * - exact: 정확히 일치할 때만 활성 (예: /admin 개요, /admin/tools 프롬프트 순위).
 *   prefix 탭과 충돌(/admin/tools/[id] 등)을 피하기 위함.
 * - extraMatch: 탭에는 안 뜨지만 해당 섹션에 속하는 편집/신규 경로
 *   (예: /admin/tools/new·/admin/tools/[id] = 자료 신규·편집 → 콘텐츠 섹션).
 */

export type Tab = { href: string; label: string; exact?: boolean };

export type Section = {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string; // 진입 페이지 (= 첫 탭)
  tabs: Tab[];
  extraMatch?: string[]; // 섹션에 속하는 추가 경로 prefix
  footer?: boolean; // 구분선 아래(보조)에 배치
};

export const SECTIONS: Section[] = [
  {
    key: 'dashboard',
    label: '대시보드',
    icon: LayoutDashboard,
    href: '/admin',
    tabs: [
      { href: '/admin', label: '개요', exact: true },
      { href: '/admin/analytics', label: '상세 분석' },
      { href: '/admin/utm', label: '유입 (UTM)' },
      { href: '/admin/analytics/search', label: '검색 키워드' },
      { href: '/admin/tools', label: '프롬프트 순위', exact: true },
    ],
  },
  {
    // 구 '새 콘텐츠 발행'(/admin/seeds) 섹션의 후신 — 씨앗→기획→생성→발행→홈배치의 진입점.
    // /admin/seeds는 /admin/studio로 리다이렉트.
    key: 'studio',
    label: '콘텐츠 스튜디오',
    icon: Sparkles,
    href: '/admin/studio',
    tabs: [
      { href: '/admin/studio', label: '작업실', exact: true },
      // 텔레그램(HERMES 봇)에서 논의·리서치 마친 MD 문서를 씨앗 경유 없이 바로 초안으로
      { href: '/admin/studio/import', label: 'MD로 시작' },
      { href: '/admin/studio/archive', label: '씨앗 아카이브' },
      // 본가 /prompts·/guides(둘 다 tools 테이블)에 노출되는 자료의 등록·큐레이션 데스크
      { href: '/admin/prompts', label: '바로쓰는 프롬프트' },
      { href: '/admin/guides', label: '공식 가이드' },
    ],
    // 스튜디오에서 생성→편집하는 초안(콘텐츠/자료)도 이 섹션 소속으로 강조
    extraMatch: ['/admin/seeds'],
  },
  {
    key: 'content',
    label: '콘텐츠 관리',
    icon: FileText,
    href: '/admin/contents',
    tabs: [
      { href: '/admin/contents', label: '콘텐츠' },
      { href: '/admin/contents/curation', label: '큐레이션' },
      { href: '/admin/categories', label: '카테고리·태그' },
      { href: '/admin/topics', label: '후보 카드' },
      { href: '/admin/comments', label: '댓글' },
    ],
    // 자료(도구·가이드·프롬프트) 신규/편집 → 콘텐츠 관리 섹션 소속
    extraMatch: ['/admin/tools/'],
  },
  {
    key: 'ebook',
    label: 'ebook',
    icon: BookOpen,
    href: '/admin/ebooks',
    tabs: [
      { href: '/admin/ebooks', label: 'ebook 관리' },
      { href: '/admin/revenue', label: '판매 현황' },
      { href: '/admin/ebooks/customers', label: '구매자 관리' },
    ],
  },
  {
    key: 'members',
    label: '회원·소통',
    icon: Users,
    href: '/admin/users',
    tabs: [
      { href: '/admin/users', label: '가입자' },
      { href: '/admin/subscribers', label: '구독자' },
      { href: '/admin/opinions', label: '의견함' },
      { href: '/admin/support', label: '1:1 문의' },
      { href: '/admin/faq', label: 'FAQ' },
      { href: '/admin/newsletters', label: '뉴스레터' },
    ],
  },
  {
    key: 'settings',
    label: '설정',
    icon: Settings,
    href: '/admin/settings',
    footer: true,
    tabs: [
      { href: '/admin/settings', label: '설정' },
      { href: '/admin/history', label: 'History' },
    ],
  },
];

/** 현재 경로에 해당하는 탭 (exact 우선, prefix는 최장 일치) */
export function matchTab(pathname: string, tabs: Tab[]): Tab | null {
  let best: Tab | null = null;
  let bestLen = -1;
  for (const t of tabs) {
    const hit = t.exact
      ? pathname === t.href
      : pathname === t.href || pathname.startsWith(t.href + '/');
    if (hit && t.href.length > bestLen) {
      best = t;
      bestLen = t.href.length;
    }
  }
  return best;
}

/** 현재 경로가 속한 섹션 */
export function activeSection(pathname: string): Section | null {
  for (const s of SECTIONS) {
    if (matchTab(pathname, s.tabs)) return s;
  }
  for (const s of SECTIONS) {
    if (s.extraMatch?.some((m) => pathname.startsWith(m))) return s;
  }
  return null;
}
