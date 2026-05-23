import { ImageResponse } from 'next/og';
import {
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_TITLE,
  THEME_COLOR,
} from '../lib/site';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #1d2417 0%, #302e2b 55%, #111311 100%)',
          color: 'white',
          padding: 56,
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 32,
            padding: '44px 48px',
            background: 'radial-gradient(circle at top right, rgba(129, 182, 76, 0.18), transparent 38%)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div
                style={{
                  width: 82,
                  height: 82,
                  borderRadius: 24,
                  background: THEME_COLOR,
                  border: '2px solid rgba(255,255,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 34,
                  fontWeight: 800,
                }}
              >
                {SITE_SHORT_NAME[0]}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 26, color: '#9ca3af' }}>Play Online Chess</div>
                <div style={{ fontSize: 40, fontWeight: 800 }}>{SITE_NAME}</div>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 18px',
                borderRadius: 999,
                background: 'rgba(129, 182, 76, 0.14)',
                color: '#d9f0bb',
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              RESIGN vs Bots
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
              <div style={{ fontSize: 66, lineHeight: 1.05, fontWeight: 900 }}>{SITE_TITLE}</div>
              <div style={{ fontSize: 28, lineHeight: 1.35, color: '#d1d5db' }}>
                Fast browser chess with RESIGN, themed bots, move review, time controls, and pass-and-play.
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                padding: 14,
                borderRadius: 24,
                background: 'rgba(255,255,255,0.05)',
                width: 176,
              }}
            >
              {Array.from({ length: 16 }).map((_, index) => {
                const isDark = (Math.floor(index / 4) + index) % 2 === 0;
                return (
                  <div
                    key={index}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: isDark ? '#739552' : '#ebecd0',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
