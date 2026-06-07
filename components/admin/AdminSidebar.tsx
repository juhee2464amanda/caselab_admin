'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BarChart3,
  Link2,
  Search,
  FileText,
  FilePlus,
  Star,
  Tags,
  Lightbulb,
  MessagesSquare,
  Wrench,
  BookOpen,
  Users,
  UserPlus,
  MessageSquare,
  LifeBuoy,
  HelpCircle,
  Mail,
  Wallet,
  Package,
  History as HistoryIcon,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * AdminSidebar — 5 카테고리 재구조 (D60, 2026-06-03)
 *
 * 분석 / 콘텐츠 / 회원관리 / 매출 / 운영(보조)
 *
 * 미작성 페이지(disabled=true)는 회색 비활성 + "준비 중" 배지 (404 회피).
 * 페이지 신설 시 disabled 제거.
 */

type NavItem = { href: string; label: string; icon: typeof Search; disabled?: boolean };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: '분석',
    items: [
      { href: '/admin', label: '대시보드', icon: LayoutDashboard },
      { href: '/admin/analytics', label: '상세 분석', icon: BarChart3 },
      { href: '/admin/utm', label: '유입 (UTM)', icon: Link2 },
      { href: '/admin/analytics/search', label: '검색 키워드', icon: Search },
    ],
  },
  {
    group: '콘텐츠',
    items: [
      { href: '/admin/contents', label: '콘텐츠 목록', icon: FileText },
      { href: '/admin/contents/new', label: '새 콘텐츠', icon: FilePlus },
      { href: '/admin/contents/curation', label: '큐레이션', icon: Star },
      { href: '/admin/categories', label: '카테고리·태그', icon: Tags },
      { href: '/admin/topics', label: '후보 카드', icon: Lightbulb },
      { href: '/admin/comments', label: '댓글 모더레이션', icon: MessagesSquare },
      { href: '/admin/tools', label: '자료실', icon: Wrench },
      { href: '/admin/ebooks', label: '전자책', icon: BookOpen },
    ],
  },
  {
    group: '회원관리',
    items: [
      { href: '/admin/users', label: '가입자', icon: Users },
      { href: '/admin/users/invite', label: 'editor 초대', icon: UserPlus },
      { href: '/admin/opinions', label: '의견함', icon: MessageSquare },
      { href: '/admin/support', label: '1:1 문의', icon: LifeBuoy },
      { href: '/admin/faq', label: 'FAQ', icon: HelpCircle },
      { href: '/admin/newsletters', label: '뉴스레터', icon: Mail },
    ],
  },
  {
    group: '매출',
    items: [
      { href: '/admin/revenue', label: '수익 대시보드', icon: Wallet },
      { href: '/admin/ebooks/orders', label: '주문·발송', icon: Package, disabled: true },
    ],
  },
  {
    group: '운영',
    items: [
      { href: '/admin/history', label: 'History', icon: HistoryIcon },
      { href: '/admin/settings', label: '설정', icon: Settings },
    ],
  },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink/40">
            {g.group}
          </div>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = it.icon;
              const active =
                !it.disabled &&
                (pathname === it.href ||
                  (it.href !== '/admin' && pathname.startsWith(it.href)));

              if (it.disabled) {
                return (
                  <li key={it.href}>
                    <span
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-ink/30 cursor-not-allowed"
                      title="준비 중"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1 truncate">{it.label}</span>
                      <span className="text-[9px] font-medium uppercase tracking-wider text-ink/30 border border-border rounded px-1 py-0.5">
                        준비 중
                      </span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px]',
                      active
                        ? 'bg-accent/10 text-accent font-medium'
                        : 'text-ink/70 hover:bg-muted'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Logo({ size = 'base' }: { size?: 'base' | 'lg' }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "font-['Playfair_Display'] italic font-bold tracking-tight",
          size === 'lg' ? 'text-2xl' : 'text-xl'
        )}
      >
        Caselab
      </span>
      <span className="text-xs font-medium text-ink/50">Admin</span>
    </span>
  );
}

export function AdminSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white px-4 py-3">
        <Link href="/admin">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="메뉴 열기"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer overlay */}
      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden transition-opacity',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
        <aside
          className={cn(
            'absolute left-0 top-0 h-full w-72 bg-white shadow-elevated transition-transform overflow-y-auto',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <header className="flex items-center justify-between p-4 border-b border-border">
            <Logo />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="닫기"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="p-4">
            <NavContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </aside>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 border-r border-border bg-white min-h-screen p-4 overflow-y-auto">
        <Link href="/admin" className="block mb-6">
          <Logo size="lg" />
        </Link>
        <NavContent />
      </aside>
    </>
  );
}
