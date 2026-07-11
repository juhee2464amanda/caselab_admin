// 미니 인라인 마크업 — 콘텐츠 텍스트 필드의 강조 표기 정본.
// DB에는 마커 문자열로 저장: **굵게**, ==형광펜==
// admin(Editable rich 모드)과 본가 렌더가 같은 규칙을 파싱한다.
// 본가 대응: caselab lib/inline-md.tsx (renderInline) — 규칙 바꾸면 양쪽 같이.

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 마커 문자열 → 렌더용 HTML (escape 후 마커만 태그로). whitespace-pre-wrap 전제로 \n 유지. */
export function inlineMdToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>')
    .replace(/==([^=\n][^=]*?)==/g, '<mark class="rounded-sm bg-amber-200/80 px-0.5">$1</mark>');
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
    if (tag === 'MARK') return `==${inner}==`;
    if (tag === 'SPAN') {
      // execCommand/붙여넣기가 만드는 스타일 span 흡수
      const fw = node.style.fontWeight;
      const bolded = fw === 'bold' || (Number(fw) || 0) >= 600;
      const highlighted = !!node.style.backgroundColor && node.style.backgroundColor !== 'transparent';
      let out = inner;
      if (bolded) out = `**${out}**`;
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
