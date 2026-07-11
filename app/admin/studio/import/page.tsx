import { MdImport } from '@/components/admin/MdImport';

// /admin/studio/import — MD 직행 레인. 텔레그램(HERMES 봇)에서 기획·리서치를 마친
// 완성 MD 문서를 씨앗 인박스 없이 바로 초안 생성 → 편집 → 발행 → 홈배치.
export const dynamic = 'force-dynamic';

export default function StudioImportPage() {
  return <MdImport />;
}
