// 일회성: /api/seeds/score와 동일 로직을 로컬에서 인증 없이 실행 (미채점 raw 씨앗 배치 채점)
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { scoreSeed } from '@/lib/ai-draft';

const BATCH_LIMIT = 12;
const CONCURRENCY = 3;

async function main() {
  const admin = createSupabaseAdminClient();

  for (let round = 1; ; round++) {
    const { data: seeds, error } = await admin
      .from('content_seeds')
      .select('id, title, raw_text, source_type')
      .order('created_at', { ascending: false })
      .limit(BATCH_LIMIT)
      .in('status', ['raw', 'adopted'])
      .or('scored_at.is.null,essence.is.null');
    if (error) throw new Error(error.message);
    if (!seeds?.length) {
      console.log('남은 미채점 씨앗 없음. 완료.');
      break;
    }
    console.log(`--- round ${round}: ${seeds.length}건 채점 시작`);

    const scoreOne = async (seed: { id: string; title: string; raw_text: string; source_type: string | null }) => {
      try {
        const s = await scoreSeed({ title: seed.title, rawText: seed.raw_text, sourceType: seed.source_type ?? undefined });
        await admin
          .from('content_seeds')
          .update({
            bucket: s.bucket,
            score: s.score,
            score_reason: s.reason,
            suggested_angle: s.suggestedAngle,
            essence: { headline: s.headline, ...s.essence },
            scored_at: new Date().toISOString(),
          })
          .eq('id', seed.id);
        console.log(`  ok  [${s.bucket}/${s.score}] ${seed.title.slice(0, 50)}`);
        return true;
      } catch (e) {
        console.log(`  FAIL ${seed.title.slice(0, 50)} — ${(e as Error).message.slice(0, 80)}`);
        return false;
      }
    };

    let scored = 0;
    for (let i = 0; i < seeds.length; i += CONCURRENCY) {
      const results = await Promise.all(seeds.slice(i, i + CONCURRENCY).map(scoreOne));
      scored += results.filter(Boolean).length;
    }
    if (scored === 0) {
      console.log('이번 라운드 전부 실패 — 중단(무한루프 방지). 로그 확인 필요.');
      break;
    }
  }

  const { count } = await admin
    .from('content_seeds')
    .select('id', { count: 'exact', head: true })
    .is('scored_at', null)
    .in('status', ['raw', 'adopted']);
  console.log(`남은 미채점: ${count ?? '?'}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
