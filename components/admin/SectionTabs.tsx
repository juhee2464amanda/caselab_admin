'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeSection, matchTab } from './admin-nav';
import { cn } from '@/lib/utils';

/**
 * 섹션 상단 탭 — 현재 경로가 속한 대분류의 하위 탭을 노출한다.
 * admin layout 에서 페이지 본문 위에 한 번만 렌더된다.
 */
export function SectionTabs() {
  const pathname = usePathname();
  const section = activeSection(pathname);
  if (!section || section.tabs.length <= 1) return null;

  const active = matchTab(pathname, section.tabs);

  return (
    <div className="border-b border-border bg-white">
      <nav className="flex gap-1 overflow-x-auto px-4 sm:px-8">
        {section.tabs.map((t) => {
          const isActive = active?.href === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors',
                isActive
                  ? 'border-accent text-accent font-medium'
                  : 'border-transparent text-ink/60 hover:border-border hover:text-ink'
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
