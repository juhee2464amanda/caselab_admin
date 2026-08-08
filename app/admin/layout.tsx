import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopBar } from '@/components/admin/AdminTopBar';
import { SectionTabs } from '@/components/admin/SectionTabs';

export const dynamic = 'force-dynamic';

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="lg:flex bg-muted/30 min-h-screen">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AdminTopBar />
        <SectionTabs />
        {children}
      </div>
    </div>
  );
}
