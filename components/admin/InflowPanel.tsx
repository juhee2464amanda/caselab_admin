import { getInflow, isGa4DataApiConfigured } from '@/lib/analytics/ga4-data-api';

// 유입 (GA4 Data API, D33) — 채널·캠페인별 활성 사용자 / 참여 세션. 데이터 소스는 GA4(Supabase 아님).
export default async function InflowPanel() {
  const configured = isGa4DataApiConfigured();
  const rows = configured ? await getInflow() : null;

  return (
    <section className="mb-8">
      <h2 className="font-semibold mb-3">유입 (GA4 · 최근 7일)</h2>
      {!configured ? (
        <div className="card p-4 text-sm text-ink/50">
          GA4 미연동 — <code>GA4_PROPERTY_ID</code> · <code>GA4_SERVICE_ACCOUNT_JSON</code> 설정 후 표시됩니다.
        </div>
      ) : rows === null ? (
        <div className="card p-4 text-sm text-ink/50">GA4 데이터를 불러오지 못했습니다. (권한·키 확인)</div>
      ) : rows.length === 0 ? (
        <div className="card p-4 text-sm text-ink/50">최근 7일 유입 데이터가 아직 없습니다.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-4 py-3">채널</th>
                <th className="px-4 py-3">캠페인</th>
                <th className="px-4 py-3 w-28">활성 사용자</th>
                <th className="px-4 py-3 w-28">참여 세션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={`${r.channel}-${r.campaign}-${i}`}>
                  <td className="px-4 py-3">{r.channel}</td>
                  <td className="px-4 py-3 text-xs">{r.campaign}</td>
                  <td className="px-4 py-3 text-xs">{r.activeUsers.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs">{r.engagedSessions.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
