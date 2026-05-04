/**
 * App Router icon (V1.9 T2)
 *
 * 32x32 favicon — two stacked rectangles in 柿色 #D97757 (primary) and
 * warm-black #1A1614 @ 18% (offset shadow), on paper-warm #FAF8F3 bg.
 *
 * Mirrors the <Wordmark> glyph so favicon ↔ in-app brand mark stay coherent.
 * Next 15 App Router auto-serves this at /icon, building it via Edge ImageResponse.
 */
import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAF8F3',
        }}
      >
        <div style={{ position: 'relative', width: 22, height: 26, display: 'flex' }}>
          {/* Shadow rect (offset to lower-right) */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 18,
              height: 22,
              background: '#1A1614',
              opacity: 0.18,
            }}
          />
          {/* Primary rect (柿色) */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 18,
              height: 22,
              background: '#D97757',
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
