// 일회성 E2E 스모크: MD 직행 생성 함수를 로컬 구독 CLI로 직접 호출 (DB·서버·인증 없음).
// 목적: "초안 생성"이 실제로 스키마에 맞는 본문을 뱉는지 검증.
import { proposeEdge, generateDraft } from '@/lib/ai-draft';

const SAMPLE_MD = `# 노션 AI로 회의록 자동 요약하기

지난주 팀 회의에서 노션 AI 회의록 기능을 실제로 써봤다.
- 녹취 붙여넣기 → "요약" 슬래시 명령 → 액션아이템 자동 추출
- 담당자 멘션까지 자동으로 달아줌
- 아쉬운 점: 한국어 화자 구분이 아직 약함, 긴 회의(1h+)는 잘림

결론: 30분 이하 회의 요약엔 실무 투입 가능. 실행 팁 위주로 재연 정리하면 케이스 감.`;

async function main() {
  const title = '노션 AI 회의록 요약, 실무에 바로 써봤다';
  const track = 'case' as const;

  console.log('▶ 1/2 엣지 제안(proposeEdge, sonnet) 호출…');
  const t0 = Date.now();
  const edge = await proposeEdge({ track, title, markdown: SAMPLE_MD });
  console.log(`  ✓ ${((Date.now() - t0) / 1000).toFixed(0)}s — angle: ${edge.angle?.slice(0, 60) ?? '(없음)'}`);
  console.log(`  plan ${edge.plan?.length ?? 0}개 / missing ${edge.missing?.length ?? 0}개`);

  console.log('▶ 2/2 초안 생성(generateDraft, opus + 웹리서치) 호출… (최대 3분)');
  const t1 = Date.now();
  const body = await generateDraft({
    track,
    title,
    summary: SAMPLE_MD,
    direction: '실무자가 바로 따라 할 수 있는 단계별 재연 후기 톤. 노션 AI 회의록 요약의 실제 실행 흐름과 한계 중심.',
  });
  console.log(`  ✓ ${((Date.now() - t1) / 1000).toFixed(0)}s — 스키마 검증 통과`);
  console.log('  생성된 본문 top-level 키:', Object.keys(body));
  console.log('\n--- 본문 미리보기(JSON, 앞 800자) ---');
  console.log(JSON.stringify(body, null, 2).slice(0, 800));
  console.log('\n✅ E2E 통과: MD → (엣지 제안) → 초안 생성까지 정상 동작.');
}

main().catch((e) => {
  console.error('\n❌ 실패:', e);
  process.exit(1);
});
