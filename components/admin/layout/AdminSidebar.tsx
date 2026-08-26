'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Menu, X, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTIONS, activeSection, type Section } from './admin-nav';

/**
 * AdminSidebar — 대분류만 노출 (2026-06-26 재정리)
 *
 * 대시보드 / 새 콘텐츠 발행 / 콘텐츠 관리 / ebook / 회원·소통 / ─ / 설정(보조)
 * 하위 페이지는 각 섹션 진입 후 상단 탭(SectionTabs)으로 묶는다.
 * 섹션 정의·활성 판정은 admin-nav.ts 공유.
 */

function LogoutButton({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    onNavigate?.();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="flex w-full items-center gap-2.5 px-3 py-2 rounded-md text-sm text-ink/70 hover:bg-muted disabled:opacity-50"
    >
      <LogOut className="h-4 w-4 shrink-0" />
      {pending ? '로그아웃 중…' : '로그아웃'}
    </button>
  );
}

function SideLink({
  section,
  active,
  onNavigate,
}: {
  section: Section;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = section.icon;
  return (
    <Link
      href={section.href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm',
        active ? 'bg-accent/10 text-accent font-medium' : 'text-ink/70 hover:bg-muted'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {section.label}
    </Link>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeSection(pathname);
  const mainSections = SECTIONS.filter((s) => !s.footer);
  const footerSections = SECTIONS.filter((s) => s.footer);

  return (
    <nav className="flex flex-col gap-1">
      {mainSections.map((s) => (
        <SideLink
          key={s.key}
          section={s}
          active={current?.key === s.key}
          onNavigate={onNavigate}
        />
      ))}
      <div className="my-3 border-t border-border" />
      {footerSections.map((s) => (
        <SideLink
          key={s.key}
          section={s}
          active={current?.key === s.key}
          onNavigate={onNavigate}
        />
      ))}
      <LogoutButton onNavigate={onNavigate} />
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
