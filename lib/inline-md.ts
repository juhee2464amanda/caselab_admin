// 미니 인라인 마크업 — 콘텐츠 텍스트 필드의 강조 표기 정본.
// DB에는 마커 문자열로 저장: **굵게**, __밑줄__, ==형광펜==, {red|글자색}, [텍스트](url) 링크
// admin(Editable rich 모드)과 본가 렌더가 같은 규칙을 파싱한다.
// 본가 대응: caselab lib/inline-md.tsx (renderInline) — 규칙 바꾸면 양쪽 같이.

// 글자 색상 팔레트 — {이름|텍스트} 마커의 이름 목록이 정본(본가와 같이 갱신).
export const INLINE_COLORS = [
  { name: 'red', label: '빨강', cls: 'text-red-600', dot: 'bg-red-600' },
  { name: 'orange', label: '주황', cls: 'text-orange-500', dot: 'bg-orange-500' },
  { name: 'green', label: '초록', cls: 'text-green-600', dot: 'bg-green-600' },
  { name: 'blue', label: '파랑', cls: 'text-blue-600', dot: 'bg-blue-600' },
  { name: 'violet', label: '보라', cls: 'text-violet-600', dot: 'bg-violet-600' },
  { name: 'gray', label: '회색', cls: 'text-ink/45', dot: 'bg-ink/45' },
] as const;
export type InlineColorName = (typeof INLINE_COLORS)[number]['name'];
const COLOR_CLS: Record<string, string> = Object.fromEntries(INLINE_COLORS.map((c) => [c.name, c.cls]));
const COLOR_RE = /\{(red|orange|green|blue|violet|gray)\|([^}\n]+)\}/g;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 마커 문자열 → 렌더용 HTML (escape 후 마커만 태그로). whitespace-pre-wrap 전제로 \n 유지. */
export function inlineMdToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n][^_]*?)__/g, '<u>$1</u>')
    .replace(/==([^=\n][^=]*?)==/g, '<mark class="rounded-sm bg-amber-200/80 px-0.5">$1</mark>')
    .replace(COLOR_RE, (_, name: string, txt: string) => `<span data-color="${name}" class="${COLOR_CLS[name]}">${txt}</span>`)
    .replace(
      /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-2">$1</a>',
    );
}

/** contentEditable DOM → 마커 문자열. B/STRONG/굵은 span → **, MARK/배경색 span → ==, DIV/BR → \n. */
export function htmlToInlineMd(root: HTMLElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    const inner = Array.from(node.childNodes).map(walk).join('');
    const tag = node.tagName;
    if (tag === 'BR') return '\n';
    if (!inner.trim()) return tag === 'DIV' || tag === 'P' ? '\n' : inner;
    if (tag === 'B' || tag === 'STRONG') return `**${inner}**`;
    if (tag === 'U') return `__${inner}__`;
    if (tag === 'MARK') return `==${inner}==`;
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      return href ? `[${inner}](${href})` : inner;
    }
    if (tag === 'SPAN') {
      // execCommand/붙여넣기가 만드는 스타일 span 흡수
      const fw = node.style.fontWeight;
      const bolded = fw === 'bold' || (Number(fw) || 0) >= 600;
      const underlined = /underline/.test(node.style.textDecoration || node.style.textDecorationLine || '');
      const highlighted = !!node.style.backgroundColor && node.style.backgroundColor !== 'transparent';
      // 팔레트가 감싼 색상 span — data-color가 벗겨진 경우(Safari insertHTML 등) 클래스로도 판별
      const colorName = node.getAttribute('data-color') ?? INLINE_COLORS.find((c) => node.classList.contains(c.cls))?.name;
      let out = inner;
      if (colorName && COLOR_CLS[colorName]) out = `{${colorName}|${out}}`;
      if (bolded) out = `**${out}**`;
      if (underlined) out = `__${out}__`;
      if (highlighted) out = `==${out}==`;
      return out;
    }
    if (tag === 'DIV' || tag === 'P') return '\n' + inner;
    return inner; // 그 외 태그는 서식 제거(텍스트만)
  };
  return walk(root)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}
