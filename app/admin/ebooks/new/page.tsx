import { EbookForm } from '@/components/admin/EbookForm';

// /admin/ebooks/new — ebook 등록 (피드백 #8-1)
export default function AdminEbookNew() {
  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">ebook 등록</h1>
        <p className="text-sm text-ink/60 mt-1">새 전자책을 등록하세요. 가격·읽는 시간 등 상세 정보 포함.</p>
      </header>
      <EbookForm />
    </div>
  );
}
