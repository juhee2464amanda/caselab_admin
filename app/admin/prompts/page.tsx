import { redirect } from 'next/navigation';

// D50 — 단축 URL. 프롬프트는 통합 콘텐츠 목록의 type=prompt 필터로 위임.
export default function AdminPromptsRedirect() {
  redirect('/admin/contents?type=prompt');
}
