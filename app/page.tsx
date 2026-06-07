import { redirect } from 'next/navigation';

// admin 전용 도메인 — 루트는 항상 대시보드로.
// 미로그인 시 /admin 가드가 /login 으로 보냄.
export default function RootPage() {
  redirect('/admin');
}
