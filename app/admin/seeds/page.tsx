import { redirect } from 'next/navigation';

// 씨앗 워크플로우는 콘텐츠 스튜디오로 통합됨. 구 경로는 작업실로 리다이렉트.
export const dynamic = 'force-dynamic';

export default function AdminSeeds() {
  redirect('/admin/studio');
}
