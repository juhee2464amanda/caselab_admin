import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export function timeChip(min: number | null | undefined): '5분' | '10분' | '30분' | '60분+' {
  const m = min ?? 0;
  if (m <= 5) return '5분';
  if (m <= 10) return '10분';
  if (m <= 30) return '30분';
  return '60분+';
}

export function slugify(input: string): string {
  return input
    .toString()
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export function safeJson<T>(value: unknown, fallback: T): T {
  try {
    if (typeof value === 'string') return JSON.parse(value) as T;
    if (value && typeof value === 'object') return value as T;
  } catch {
    /* noop */
  }
  return fallback;
}
