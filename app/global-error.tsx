'use client';

/**
 * Root error boundary. Catches render-time crashes anywhere in the app
 * that weren't handled lower down, reports them to Sentry, and shows a
 * calm fallback.
 *
 * This replaces the whole document on a crash, so it cannot rely on
 * the locale layout, the theme, or fonts — it is deliberately plain
 * and self-contained. Copy is kept reassuring and points the user to
 * their clinic, consistent with the app's other error states.
 */
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f6f1e8',
          color: '#1f2421',
          fontFamily: 'system-ui, sans-serif',
          padding: '24px'
        }}
      >
        <div style={{ maxWidth: '360px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '20px', marginBottom: '8px' }}>
            Something went wrong · Noget gik galt
          </h1>
          <p
            style={{
              fontSize: '15px',
              lineHeight: 1.5,
              color: '#4b5450',
              marginBottom: '20px'
            }}
          >
            The app ran into an unexpected problem. Please try again. If it keeps happening, contact your clinic. — Appen stødte på et uventet problem. Prøv igen. Sker det gentagne gange, så kontakt din klinik.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: '44px',
              padding: '0 20px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#fbf8f2',
              backgroundColor: '#3f5a4b',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer'
            }}
          >
            Reload · Genindlæs
          </button>
        </div>
      </body>
    </html>
  );
}
