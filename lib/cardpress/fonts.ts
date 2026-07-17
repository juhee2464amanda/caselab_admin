import { readFile } from 'fs/promises';
import path from 'path';

// Satori(next/og)는 woff2를 못 읽어서 woff 4종(400/600/700/800)을 assets/fonts에 벤더링.
// 템플릿 CSS의 500은 600으로, 나머지는 그대로 매칭된다.

export type CardFont = {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700 | 800;
  style: 'normal';
};

let cache: CardFont[] | null = null;

export async function loadCardFonts(): Promise<CardFont[]> {
  if (cache) return cache;
  const dir = path.join(process.cwd(), 'assets', 'fonts');
  const weights: Array<[string, CardFont['weight']]> = [
    ['Pretendard-Regular.woff', 400],
    ['Pretendard-SemiBold.woff', 600],
    ['Pretendard-Bold.woff', 700],
    ['Pretendard-ExtraBold.woff', 800],
  ];
  cache = await Promise.all(
    weights.map(async ([file, weight]) => ({
      name: 'Pretendard',
      data: await readFile(path.join(dir, file)),
      weight,
      style: 'normal' as const,
    }))
  );
  return cache;
}
