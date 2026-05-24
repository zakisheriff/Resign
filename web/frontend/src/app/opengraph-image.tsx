import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import {
  SITE_LOGO_PATH,
  THEME_COLOR,
} from '../lib/site';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const logoBuffer = await readFile(path.join(process.cwd(), 'public', SITE_LOGO_PATH.replace(/^\//, '')));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #1d2417 0%, #302e2b 55%, #111311 100%)',
          color: 'white',
          padding: 48,
          fontFamily: 'sans-serif',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 28,
            width: '100%',
            maxWidth: 980,
            height: '100%',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 32,
            padding: '56px 48px',
            background: 'radial-gradient(circle at top, rgba(129, 182, 76, 0.18), transparent 34%)',
          }}
        >
          <div
            style={{
              width: 420,
              height: 420,
              borderRadius: 72,
              background: THEME_COLOR,
              border: '2px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: 34,
              boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
            }}
          >
            <img
              src={logoSrc}
              alt="RESIGN logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        </div>
      </div>
    ),
    size,
  );
}
