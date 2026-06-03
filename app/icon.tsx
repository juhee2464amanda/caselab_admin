import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1E40AF',
          color: '#FAFAF7',
          fontSize: 22,
          fontWeight: 700,
          fontFamily: 'serif',
          letterSpacing: -1,
          borderRadius: 6,
        }}
      >
        C
      </div>
    ),
    size
  );
}
