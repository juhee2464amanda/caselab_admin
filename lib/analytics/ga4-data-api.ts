import 'server-only';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

// GA4 Data API 읽기 (D33 유입 패널). 본가에서 gtag로 수집한 데이터를 서버에서 읽는다.
// 인증: GCP 서비스 계정 JSON을 base64로 GA4_SERVICE_ACCOUNT_JSON에 넣고, GA4 property Admin →
// Account access에 서비스 계정 email을 Viewer로 추가. 자세한 절차는 docs/07_ga4_integration_guide.md.

const PROPERTY_ID = process.env.GA4_PROPERTY_ID ?? '';
const SA_JSON_B64 = process.env.GA4_SERVICE_ACCOUNT_JSON ?? '';

/** env가 채워졌는지 — 없으면 UI가 "미연동" 안내로 안전하게 렌더된다. */
export const isGa4DataApiConfigured = () => !!PROPERTY_ID && !!SA_JSON_B64;

let cachedClient: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient | null {
  if (!isGa4DataApiConfigured()) return null;
  if (cachedClient) return cachedClient;
  try {
    const credentials = JSON.parse(Buffer.from(SA_JSON_B64, 'base64').toString('utf8'));
    cachedClient = new BetaAnalyticsDataClient({ credentials });
    return cachedClient;
  } catch (e) {
    console.error('[ga4-data-api] 서비스 계정 JSON 파싱 실패', e);
    return null;
  }
}

export type InflowRow = {
  channel: string;
  campaign: string;
  activeUsers: number;
  engagedSessions: number;
};

/**
 * 채널·캠페인별 활성 사용자 / 참여 세션 (기본 최근 7일).
 * env 미설정이거나 API 오류 시 null 반환 → 호출부에서 "미연동" 처리.
 */
export async function getInflow(
  startDate = '7daysAgo',
  endDate = 'today',
): Promise<InflowRow[] | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const [res] = await client.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionCampaignName' }],
      metrics: [{ name: 'activeUsers' }, { name: 'engagedSessions' }],
      limit: 100,
    });
    return (res.rows ?? []).map((r) => ({
      channel: r.dimensionValues?.[0]?.value ?? '(other)',
      campaign: r.dimensionValues?.[1]?.value ?? '(not set)',
      activeUsers: Number(r.metricValues?.[0]?.value ?? 0),
      engagedSessions: Number(r.metricValues?.[1]?.value ?? 0),
    }));
  } catch (e) {
    console.error('[ga4-data-api] runReport 실패', e);
    return null;
  }
}
