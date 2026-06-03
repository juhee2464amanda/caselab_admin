import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = '케이스랩 — 일이 풀리는 AI 사용법';

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#FAFAF7',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              background: '#1E40AF',
              color: '#FAFAF7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 700,
              borderRadius: 10,
            }}
          >
            C
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, color: '#0A0A0A' }}>
            케이스랩
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 600,
              color: '#0A0A0A',
              lineHeight: 1.15,
              letterSpacing: -1.5,
            }}
          >
            일이 풀리는 AI 사용법.
          </div>
          <div style={{ fontSize: 28, color: '#404040', lineHeight: 1.4, maxWidth: 900 }}>
            Framework × 단계별 AI 실행 × 솔직한 후기.
          </div>
        </div>

        <div style={{ fontSize: 20, color: '#737373' }}>
          일이 풀리는 AI 사용법
        </div>
      </div>
    ),
    size
  );
}
