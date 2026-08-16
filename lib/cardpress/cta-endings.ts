// 캡션 마무리(CTA) 문구의 단일 정의.
//
// 왜 따로 두나: 같은 문구가 두 곳에서 필요하다.
//   ① 생성 프롬프트 — AI가 마무리를 쓸 때 참고할 본보기
//   ② 검수 UI — 운영자가 마음에 안 들 때 원클릭으로 갈아끼우는 후보
// 한쪽만 고치면 "화면에서 고른 톤"과 "생성되는 톤"이 갈라지므로 여기서 함께 관리한다.
//
// 매번 똑같은 문장이 나가면 그것대로 금방 지겨워진다 → AI에겐 "복붙 말고 소재에 맞게 변주"를 지시하고,
// UI에는 그대로 쓸 수 있는 완성문을 준다.

export type CardCtaType = 'info_save' | 'comment_dm' | 'channel_intro';

export const CTA_TYPE_LABELS: Record<CardCtaType, string> = {
  comment_dm: '댓글→DM 참여형',
  info_save: '링크 유도형',
  channel_intro: '채널 안내형',
};

export const CTA_TYPE_HINTS: Record<CardCtaType, string> = {
  comment_dm: '캡션·마무리가 "댓글에 \'키워드\' 남기면 DM으로" 문법으로 생성됩니다 (리틀리 자동화 연동 전제)',
  info_save: '프로필 링크로 유입을 보냅니다 — 카드가 소재의 일부만 다뤘을 때',
  channel_intro: '보낼 곳 없이 채널을 각인시킵니다 — 소재가 완결적이거나 팔로워를 늘릴 때',
};

export type CtaEnding = {
  /** 화면에 뜨는 짧은 이름 */
  label: string;
  /** 어떤 독자에게 꽂히는지 — 운영자가 고를 때의 판단 근거 */
  when: string;
  /** 캡션 맨 끝(해시태그 앞)에 들어갈 완성문 */
  text: string;
};

/** 채널 안내형 — "돈 내지 말고, 검증된 것만 하나씩" */
export const CHANNEL_INTRO_ENDINGS: CtaEnding[] = [
  {
    label: '돈 쓰기 전에',
    when: '유료 정보에 지친 사람',
    text: '새 AI 도구 나올 때마다 강의부터 결제하지 않으셔도 됩니다.\n\n직접 써보고 남을 만한 것만 골라 하나씩 올리고 있어요.',
  },
  {
    label: '골라놨습니다',
    when: '정보 과부하를 느끼는 사람',
    text: '쏟아지는 AI 소식을 다 따라갈 필요는 없어요.\n\n실제로 일에 쓸 수 있는지 확인한 것만 추려서 올립니다. 매번 찾아다니지 않으셔도 되게요.',
  },
  {
    label: '하나씩 쌓기',
    when: '시도했다 포기해본 사람',
    text: '한 번에 다 배우려다 보면 결국 아무것도 안 남더라고요.\n\n그래서 한 번에 하나씩, 오늘 바로 써먹을 수 있는 것만 다룹니다.',
  },
];

/** 링크 유도형 — 바이오 링크로 사이트 유입. 채널 안내형의 "검증·무료" 메시지를 섞는다.
 *  ⚠️ 반드시 "프로필 링크"로 지칭할 것 — 인스타 캡션의 URL은 클릭이 안 된다. */
export const INFO_SAVE_ENDINGS: CtaEnding[] = [
  {
    label: '이어보기',
    when: '카드가 소재의 일부만 다뤘을 때 (가장 자연스러운 유입)',
    text: '이 내용의 전체 정리와 실제 프롬프트는 프로필 링크에 있어요.\n\n직접 검증한 AI 활용법만 주제별로 모아뒀으니, 강의 결제 전에 먼저 훑어보세요.',
  },
  {
    label: '아카이브',
    when: '도구·프롬프트 소개 카드',
    text: '지금까지 검증한 AI 도구와 프롬프트는 프로필 링크에 전부 모아뒀습니다.\n\n필요할 때 찾아 쓰시면 돼요. 전부 무료입니다.',
  },
  {
    label: '목적형',
    when: '범용 — 소재를 안 가림',
    text: '지금 풀고 싶은 일이 있다면 프로필 링크에서 찾아보세요.\n\n업무별로 정리해둬서, 필요한 것만 골라 하나씩 적용하시면 됩니다.',
  },
];

export const CTA_ENDINGS: Record<CardCtaType, CtaEnding[]> = {
  comment_dm: [], // 키워드에 따라 문장이 달라져 고정 후보를 두지 않는다 (생성 시 ctaKeyword로 조립)
  info_save: INFO_SAVE_ENDINGS,
  channel_intro: CHANNEL_INTRO_ENDINGS,
};

/** 생성 프롬프트에 넣을 본보기 블록 — 그대로 베끼지 말고 소재에 맞게 변주하도록 지시한다. */
export function ctaEndingExamples(type: CardCtaType): string {
  const list = CTA_ENDINGS[type];
  if (!list.length) return '';
  return list.map((e, i) => `  본보기${i + 1} (${e.when}):\n    ${e.text.replace(/\n\n/g, '\n    ')}`).join('\n');
}
