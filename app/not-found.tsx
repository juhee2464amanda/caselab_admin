import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div className="text-center">
        <h1 className="font-serif text-4xl font-semibold">404</h1>
        <p className="mt-2 text-ink/60">없는 페이지예요.</p>
        <Link href="/" className="inline-block mt-6">
          <Button variant="accent">메인으로</Button>
        </Link>
      </div>
    </div>
  );
}
