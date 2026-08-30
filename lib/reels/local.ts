import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const pExecFile = promisify(execFile);

export const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);

/** 로컬 전용 + admin 인증 가드. 실패 시 NextResponse, 통과 시 null */
export async function guardLocalAdmin(): Promise<NextResponse | null> {
  if (process.env.VERCEL) {
    return NextResponse.json({ error: '릴스 파이프라인은 로컬에서만 동작합니다' }, { status: 501 });
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

/** 홈 디렉토리 아래의 실존 비디오 파일만 허용 (임의 경로 실행 방지) */
export function resolveVideoPath(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const p = path.resolve(input.trim().replace(/^~(?=\/)/, os.homedir()));
  if (!p.startsWith(os.homedir() + path.sep)) return null;
  if (!VIDEO_EXTS.has(path.extname(p).toLowerCase())) return null;
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  return p;
}

export function workDir(videoPath: string): string {
  return path.join(path.dirname(videoPath), '.reels-work');
}

export function scriptPath(name: string): string {
  return path.join(process.cwd(), '.claude', 'skills', 'reels-cut', 'scripts', name);
}

export type Span = { start: number; end: number };

/** silence.txt 파싱 → 무음 구간 목록 */
export function parseSilences(txt: string): Span[] {
  const spans: Span[] = [];
  let cur: number | null = null;
  for (const line of txt.split('\n')) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) cur = parseFloat(s[1]);
    else if (e && cur !== null) {
      spans.push({ start: cur, end: parseFloat(e[1]) });
      cur = null;
    }
  }
  return spans;
}

/** [0,duration]에서 무음을 뺀 발화 구간 */
export function speechSpans(silences: Span[], duration: number): Span[] {
  const out: Span[] = [];
  let cursor = 0;
  for (const s of [...silences].sort((a, b) => a.start - b.start)) {
    if (s.start > cursor) out.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < duration) out.push({ start: cursor, end: duration });
  return out;
}

/** whisper 세그먼트 경계를 발화 구간과 교차시켜 무음을 깎아낸 실제 구간 */
export function trimToSpeech(seg: Span, speech: Span[]): Span | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const sp of speech) {
    const a = Math.max(seg.start, sp.start);
    const b = Math.min(seg.end, sp.end);
    if (b > a) {
      if (start === null) start = a;
      end = b;
    }
  }
  return start !== null && end !== null ? { start, end } : null;
}
