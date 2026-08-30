import { MotionLab } from '@/components/admin/studio/MotionLab';

// /admin/cardnews/motion — 모션 카드 실험실 (로컬 전용).
// 정적 카드 파이프라인과 분리된 시제품: 효과·템플릿을 UI에서 렌더해보고 MP4를 받는다.
export const dynamic = 'force-dynamic';

export default function MotionLabPage() {
  return <MotionLab />;
}
