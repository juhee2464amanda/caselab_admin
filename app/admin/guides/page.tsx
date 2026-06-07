import { redirect } from 'next/navigation';

// D50 — 단축 URL. 가이드는 통합 콘텐츠 목록의 type=guide 필터로 위임.
export default function AdminGuidesRedirect() {
  redirect('/admin/contents?type=guide');
}
